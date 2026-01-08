// supabase/functions/metabolic-score/index.ts
// Edge Function for computing Metabolic Response Score (wellness estimate)
// IMPORTANT: No LLM used. Pure deterministic heuristic scoring.
// BANNED TERMS (never use): insulin resistance, HOMA-IR, prediabetes, diabetes,
//   diagnose, detect, treat, prevent, medical device, clinical, reverse

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Banned terms that must never appear in output
const BANNED_TERMS = [
    'insulin resistance', 'homa-ir', 'prediabetes', 'pre-diabetes', 'diabetes',
    'diagnose', 'detect', 'treat', 'prevent', 'medical device', 'clinical', 'reverse'
];

// Utility functions
function clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, val));
}

function round1(val: number): number {
    return Math.round(val * 10) / 10;
}

function mean(values: (number | null | undefined)[]): number | null {
    const valid = values.filter((v): v is number => v !== null && v !== undefined && !isNaN(v));
    if (valid.length === 0) return null;
    return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

// Convert fasting glucose to mmol/L if needed
function toMmolL(value: number | null, unit: string | null | undefined): number | null {
    if (value === null || value === undefined) return null;
    const normalizedUnit = (unit || 'mmol/L').toLowerCase().replace(/\s/g, '');
    if (normalizedUnit === 'mg/dl' || normalizedUnit === 'mgdl') {
        return value / 18.0;
    }
    return value; // Assume mmol/L
}

// Calculate date range
function getDateRange(rangeDays: number): { startDate: Date; endDate: Date } {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - rangeDays);
    return { startDate, endDate };
}

// Parse range parameter
function parseRange(range: string | undefined): { rangeDays: number; rangeKey: string } {
    switch (range) {
        case '7d': return { rangeDays: 7, rangeKey: '7d' };
        case '14d': return { rangeDays: 14, rangeKey: '14d' };
        case '90d': return { rangeDays: 90, rangeKey: '90d' };
        case '30d':
        default: return { rangeDays: 30, rangeKey: '30d' };
    }
}

// Safety check: ensure no banned terms in output
function assertNoBannedTerms(text: string): string {
    const lowerText = text.toLowerCase();
    for (const term of BANNED_TERMS) {
        if (lowerText.includes(term)) {
            console.warn(`[metabolic-score] Banned term detected: "${term}"`);
            return 'This factor contributed to your wellness estimate.';
        }
    }
    return text;
}

// Types
interface DailyContext {
    date: string;
    sleep_hours: number | null;
    steps: number | null;
    active_minutes: number | null;
    resting_hr: number | null;
    hrv_ms: number | null;
}

interface LabSnapshot {
    collected_at: string;
    fasting_glucose_value: number | null;
    fasting_glucose_unit: string | null;
}

interface ComponentPoints {
    base: number;
    sleep_pen: number;
    act_pen: number;
    steps_pen: number;
    rhr_pen: number;
    hrv_pen: number;
    fibre_bonus: number;
    lab_pen: number;
}

interface Driver {
    key: string;
    points: number;
    text: string;
}

type RangeKey = '7d' | '14d' | '30d' | '90d';
type Band = 'low' | 'medium' | 'high';
type Confidence = 'low' | 'medium' | 'high';

interface ScoreResult {
    status: 'ok' | 'insufficient';
    range: RangeKey;
    metabolic_response_score: number | null;
    strain_score: number | null;
    band: Band | null;
    confidence: Confidence;
    wearables_days: number;
    lab_present: boolean;
    drivers: Driver[];
    components: ComponentPoints;
}

// Generate driver text based on component key and value
function generateDriverText(key: string, avgValue: number | null, points: number): string {
    const templates: Record<string, (val: number | null, pts: number) => string> = {
        sleep: (val, pts) => pts > 2 && val !== null
            ? `Sleep averaged ${round1(val)}h. More consistent sleep often supports steadier daily energy.`
            : `Sleep patterns look good.`,
        activity: (val, pts) => pts > 2 && val !== null
            ? `Activity averaged ${Math.round(val)} active minutes. Small movement goals can improve day-to-day steadiness.`
            : `Activity levels are supportive.`,
        steps: (val, pts) => pts > 2 && val !== null
            ? `Steps averaged ${Math.round(val)}/day. Regular walking often helps with overall energy.`
            : `Step count is supportive.`,
        resting_hr: (val, pts) => pts > 2 && val !== null
            ? `Resting heart rate averaged ${Math.round(val)} bpm. Cardio fitness may help lower this over time.`
            : `Resting heart rate looks good.`,
        hrv: (val, pts) => pts > 2 && val !== null
            ? `Heart rate variability averaged ${Math.round(val)} ms. Recovery and stress management may improve this.`
            : `HRV patterns are supportive.`,
        fibre: (val, pts) => Math.abs(pts) > 2 && val !== null
            ? pts < 0  // Negative points = bonus
                ? `Fibre averaged ${round1(val)}g. Higher fibre intake often supports more stable meals.`
                : `Fibre averaged ${round1(val)}g. Increasing fibre may help with meal responses.`
            : `Fibre intake is supportive.`,
        lab: () => `A lab value was included as one input from your latest entry.`,
        data_sparse: (val) => val !== null
            ? `Only ${Math.round(val)} days of wearable data available. More days improve accuracy.`
            : `Limited wearable data available.`,
        no_labs: () => `Adding lab results may improve your wellness estimate.`,
    };

    const templateFn = templates[key];
    if (templateFn) {
        return assertNoBannedTerms(templateFn(avgValue, points));
    }
    return assertNoBannedTerms('This factor contributed to your wellness estimate.');
}

// Compute score
function computeScore(
    dailyContext: DailyContext[],
    labSnapshot: LabSnapshot | null,
    avgFibrePerDay: number | null,
    rangeKey: RangeKey
): ScoreResult {
    // Count wearables days (days with at least one field present)
    const wearablesDays = dailyContext.filter(d =>
        d.sleep_hours !== null ||
        d.steps !== null ||
        d.active_minutes !== null ||
        d.resting_hr !== null ||
        d.hrv_ms !== null
    ).length;

    const labPresent = labSnapshot !== null && labSnapshot.fasting_glucose_value !== null;

    // Data sufficiency check
    if (wearablesDays < 5 && !labPresent) {
        const drivers: Driver[] = [];

        if (wearablesDays < 5) {
            drivers.push({
                key: 'data_sparse',
                points: 0,
                text: generateDriverText('data_sparse', wearablesDays, 0),
            });
        }
        if (!labPresent) {
            drivers.push({
                key: 'no_labs',
                points: 0,
                text: generateDriverText('no_labs', null, 0),
            });
        }

        return {
            status: 'insufficient',
            range: rangeKey,
            metabolic_response_score: null,
            strain_score: null,
            band: null,
            confidence: 'low',
            wearables_days: wearablesDays,
            lab_present: labPresent,
            drivers,
            components: { base: 50, sleep_pen: 0, act_pen: 0, steps_pen: 0, rhr_pen: 0, hrv_pen: 0, fibre_bonus: 0, lab_pen: 0 },
        };
    }

    // Calculate averages
    const avgSleep = mean(dailyContext.map(d => d.sleep_hours));
    const avgSteps = mean(dailyContext.map(d => d.steps));
    const avgActiveMin = mean(dailyContext.map(d => d.active_minutes));
    const avgRestingHr = mean(dailyContext.map(d => d.resting_hr));
    const avgHrv = mean(dailyContext.map(d => d.hrv_ms));

    // Lab value (converted to mmol/L)
    const fastingGlucoseMmol = labSnapshot
        ? toMmolL(labSnapshot.fasting_glucose_value, labSnapshot.fasting_glucose_unit)
        : null;

    // Base strain
    const base = 50;

    // Component ramps (smooth, no step jumps)
    // Sleep: 7.5h good, 5.5h bad → 0-15 points
    const sleepPen = avgSleep !== null
        ? clamp((7.5 - avgSleep) / 2.0, 0, 1) * 15
        : 0;

    // Activity minutes: 35 good, 10 bad → 0-15 points
    const actPen = avgActiveMin !== null
        ? clamp((35 - avgActiveMin) / 25, 0, 1) * 15
        : 0;

    // Steps: 9000 good, 4000 bad → 0-10 points
    const stepsPen = avgSteps !== null
        ? clamp((9000 - avgSteps) / 5000, 0, 1) * 10
        : 0;

    // Resting HR: 60 good, 80 bad → 0-10 points
    const rhrPen = avgRestingHr !== null
        ? clamp((avgRestingHr - 60) / 20, 0, 1) * 10
        : 0;

    // HRV: 55 good, 25 bad → 0-10 points
    const hrvPen = avgHrv !== null
        ? clamp((55 - avgHrv) / 30, 0, 1) * 10
        : 0;

    // Fibre bonus: >=25g good, <=10g bad → 0-8 points reduction
    const fibreBonus = avgFibrePerDay !== null
        ? clamp((avgFibrePerDay - 10) / 15, 0, 1) * 8
        : 0;

    // Lab signal: smooth scaling, no threshold language
    const labPen = fastingGlucoseMmol !== null
        ? clamp((fastingGlucoseMmol - 4.8) / 1.5, 0, 1) * 6
        : 0;

    // Strain score
    const strainScore = Math.round(clamp(
        base + sleepPen + actPen + stepsPen + rhrPen + hrvPen + labPen - fibreBonus,
        0,
        100
    ));

    // Metabolic response score (inverted: higher = better)
    const metabolicResponseScore = 100 - strainScore;

    // Banding based on strain score
    let band: Band;
    if (strainScore < 40) {
        band = 'low';
    } else if (strainScore < 70) {
        band = 'medium';
    } else {
        band = 'high';
    }

    // Confidence
    let confidence: Confidence;
    if (wearablesDays >= 21 && labPresent) {
        confidence = 'high';
    } else if (wearablesDays >= 14 || labPresent) {
        confidence = 'medium';
    } else {
        confidence = 'low';
    }

    // Build drivers list (sorted by absolute contribution, largest first)
    const contributions: { key: string; points: number; avgValue: number | null }[] = [];

    if (sleepPen > 2 && avgSleep !== null) {
        contributions.push({ key: 'sleep', points: sleepPen, avgValue: avgSleep });
    }
    if (actPen > 2 && avgActiveMin !== null) {
        contributions.push({ key: 'activity', points: actPen, avgValue: avgActiveMin });
    }
    if (stepsPen > 2 && avgSteps !== null) {
        contributions.push({ key: 'steps', points: stepsPen, avgValue: avgSteps });
    }
    if (rhrPen > 2 && avgRestingHr !== null) {
        contributions.push({ key: 'resting_hr', points: rhrPen, avgValue: avgRestingHr });
    }
    if (hrvPen > 2 && avgHrv !== null) {
        contributions.push({ key: 'hrv', points: hrvPen, avgValue: avgHrv });
    }
    if (fibreBonus > 2 && avgFibrePerDay !== null) {
        contributions.push({ key: 'fibre', points: -fibreBonus, avgValue: avgFibrePerDay });
    }
    if (labPen > 1 && labPresent) {
        contributions.push({ key: 'lab', points: labPen, avgValue: fastingGlucoseMmol });
    }
    if (wearablesDays < 14) {
        contributions.push({ key: 'data_sparse', points: 3, avgValue: wearablesDays });
    }
    if (!labPresent) {
        contributions.push({ key: 'no_labs', points: 2, avgValue: null });
    }

    // Sort by absolute points (descending) and take top 4
    contributions.sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
    const topContributions = contributions.slice(0, 4);

    const drivers: Driver[] = topContributions.map(c => ({
        key: c.key,
        points: round1(c.points),
        text: generateDriverText(c.key, c.avgValue, c.points),
    }));

    // Components for debugging/transparency
    const components: ComponentPoints = {
        base,
        sleep_pen: round1(sleepPen),
        act_pen: round1(actPen),
        steps_pen: round1(stepsPen),
        rhr_pen: round1(rhrPen),
        hrv_pen: round1(hrvPen),
        fibre_bonus: round1(fibreBonus),
        lab_pen: round1(labPen),
    };

    return {
        status: 'ok',
        range: rangeKey,
        metabolic_response_score: metabolicResponseScore,
        strain_score: strainScore,
        band,
        confidence,
        wearables_days: wearablesDays,
        lab_present: labPresent,
        drivers,
        components,
    };
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { user_id, range } = await req.json();

        if (!user_id) {
            return new Response(
                JSON.stringify({ error: 'Missing user_id' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Parse range
        const { rangeDays, rangeKey } = parseRange(range);

        // Initialize Supabase client
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Calculate date range
        const { startDate, endDate } = getDateRange(rangeDays);
        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];

        // 1. Fetch daily_context for date range
        const { data: dailyContextData, error: dcError } = await supabase
            .from('daily_context')
            .select('date, sleep_hours, steps, active_minutes, resting_hr, hrv_ms')
            .eq('user_id', user_id)
            .gte('date', startDateStr)
            .lte('date', endDateStr)
            .order('date', { ascending: false });

        if (dcError) {
            console.error('Error fetching daily_context:', dcError);
        }

        const dailyContext: DailyContext[] = dailyContextData || [];

        // 2. Fetch latest lab snapshot
        const { data: labData, error: labError } = await supabase
            .from('lab_snapshots')
            .select('collected_at, fasting_glucose_value, fasting_glucose_unit')
            .eq('user_id', user_id)
            .order('collected_at', { ascending: false })
            .limit(1)
            .single();

        if (labError && labError.code !== 'PGRST116') {
            console.error('Error fetching lab snapshot:', labError);
        }

        const labSnapshot: LabSnapshot | null = labData || null;

        // 3. Fetch fibre summary
        let avgFibrePerDay: number | null = null;
        try {
            // Try to use existing fibre calculation function or query meals directly
            const { data: mealsData } = await supabase
                .from('meals')
                .select('id')
                .eq('user_id', user_id)
                .gte('logged_at', startDate.toISOString())
                .lte('logged_at', endDate.toISOString());

            if (mealsData && mealsData.length > 0) {
                const mealIds = mealsData.map(m => m.id);
                const { data: itemsData } = await supabase
                    .from('meal_items')
                    .select('nutrients')
                    .in('meal_id', mealIds);

                if (itemsData && itemsData.length > 0) {
                    let totalFibre = 0;
                    itemsData.forEach((item: { nutrients?: { fibre_g?: number } }) => {
                        const fibre = item.nutrients?.fibre_g ?? 0;
                        totalFibre += fibre;
                    });
                    avgFibrePerDay = totalFibre / rangeDays;
                }
            }
        } catch (fibreErr) {
            console.log('Fibre calculation skipped:', fibreErr);
        }

        // 4. Compute score
        const result = computeScore(dailyContext, labSnapshot, avgFibrePerDay, rangeKey as RangeKey);

        // Final safety check on all driver texts
        result.drivers = result.drivers.map(d => ({
            ...d,
            text: assertNoBannedTerms(d.text),
        }));

        return new Response(
            JSON.stringify(result),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        console.error('Error:', error);
        return new Response(
            JSON.stringify({ error: 'Internal server error', details: String(error) }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
