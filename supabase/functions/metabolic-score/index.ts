// supabase/functions/metabolic-score/index.ts
// Edge Function for computing Metabolic Response Score (wellness estimate)
// IMPORTANT: No LLM used. Pure deterministic heuristic scoring.
// BANNED TERMS (never use): insulin resistance, HOMA-IR, prediabetes, diabetes,
//   diagnose, detect, treat, prevent, medical device, clinical, reverse

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { requireMatchingUserId, requireUser } from '../_shared/auth.ts';
import { clamp as clampValue, median } from '../_shared/stats.ts';
import {
    calculateConfidenceLabel,
    calculateMetabolicScore,
    type ConfidenceLabel,
    type DataCompleteness,
    type MetabolicScoreCalculation,
    type MetabolicScoreComponentsV2,
    type MetabolicScoreDebugV2,
    type MetabolicScoreInput,
    type ScoreLevel,
    type UxReason,
    type UsedBaseline,
} from './score.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Banned terms that must never appear in output
const BANNED_TERMS = [
    'insulin resistance', 'homa-ir', 'prediabetes', 'pre-diabetes', 'diabetes',
    'diagnose', 'detect', 'treat', 'prevent', 'medical device', 'clinical', 'reverse'
];

// ============================================
// UTILITY FUNCTIONS
// ============================================

function clamp(val: number, min: number, max: number): number {
    return clampValue(val, min, max);
}

function round1(val: number): number {
    return Math.round(val * 10) / 10;
}

// ============================================
// METABOLIC SCORE CALCULATOR
// Following user's specification exactly
// ============================================

interface MetabolicScoreV2Result {
    score7d: number | null;
    score28d: number | null;
    confidence: ConfidenceLabel;
    atypicalActivityWeek: boolean;
    mode: 'baseline_relative' | 'absolute_fallback';
    reason?: string;
    components?: MetabolicScoreComponentsV2;
    // New progressive scoring fields
    scoreLevel?: ScoreLevel;
    uxReason?: UxReason;
    zSteps?: number | null;
    debug?: {
        validDays: DataCompleteness;
        usedBaseline: UsedBaseline;
        usedFallbacks: UsedBaseline;
        smoothingUnavailable: boolean;
    };
    debugV2?: MetabolicScoreDebugV2;
}

/**
 * Calculate Metabolic Score from Apple Watch / HealthKit metrics
 * Uses 7-day rolling window, outputs 0-100 score (higher = better)
 */

// ============================================
// SMOOTHING HELPER (optional)
// ============================================

/**
 * Smooth scores by limiting day-to-day change to ±5 points
 */
function smoothScores(dailyScores: (number | null)[]): (number | null)[] {
    const result: (number | null)[] = [];
    let prevScore: number | null = null;

    for (const score of dailyScores) {
        if (score === null) {
            result.push(null);
            continue;
        }

        if (prevScore === null) {
            result.push(score);
            prevScore = score;
            continue;
        }

        // Limit change to ±5 points
        const diff = score - prevScore;
        const clampedDiff = clamp(diff, -5, 5);
        const smoothedScore = clamp(prevScore + clampedDiff, 0, 100);
        result.push(smoothedScore);
        prevScore = smoothedScore;
    }

    return result;
}

// ============================================
// LEGACY COMPATIBILITY LAYER
// Maps new score to existing API format
// ============================================

type RangeKey = '7d' | '14d' | '30d' | '90d';
type Band = 'low' | 'medium' | 'high';
type Confidence = 'low' | 'medium' | 'high';

interface LegacyDriver {
    key: string;
    points: number;
    text: string;
}

interface LegacyComponents {
    base: number;
    sleep_pen: number;
    act_pen: number;
    steps_pen: number;
    rhr_pen: number;
    hrv_pen: number;
    fibre_bonus: number;
    lab_pen: number;
}

interface LegacyScoreResult {
    status: 'ok' | 'insufficient';
    range: RangeKey;
    metabolic_response_score: number | null;
    strain_score: number | null;
    band: Band | null;
    confidence: Confidence;
    wearables_days: number;
    lab_present: boolean;
    drivers: LegacyDriver[];
    components: LegacyComponents;
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

// Generate driver text based on component
function generateDriverText(key: string, value: number | null, impact: 'good' | 'bad'): string {
    const templates: Record<string, (val: number | null, imp: 'good' | 'bad') => string> = {
        rhr: (val, imp) => val !== null
            ? imp === 'bad'
                ? `Resting heart rate averaged ${round1(val)} bpm. Cardio exercise may help lower this over time.`
                : `Resting heart rate looks good at ${round1(val)} bpm.`
            : 'Resting heart rate data unavailable.',
        steps: (val, imp) => val !== null
            ? imp === 'bad'
                ? `Steps averaged ${Math.round(val)}/day. Increasing daily movement may improve your score.`
                : `Great step count averaging ${Math.round(val)}/day.`
            : 'Step count data unavailable.',
        sleep: (val, imp) => val !== null
            ? imp === 'bad'
                ? `Sleep averaged ${round1(val)}h. More consistent sleep near 7.5h often supports better wellness.`
                : `Sleep patterns look good at ${round1(val)}h.`
            : 'Sleep data unavailable.',
        hrv: (val, imp) => val !== null
            ? imp === 'bad'
                ? `Heart rate variability averaged ${round1(val)} ms. Recovery and stress management may improve this.`
                : `HRV patterns are supportive at ${round1(val)} ms.`
            : 'HRV data unavailable.',
        context: () => 'Age and body composition factored into your score.',
        data_sparse: (val) => val !== null
            ? `Only ${Math.round(val)} days of wearable data available. More days improve accuracy.`
            : 'Limited wearable data available.',
    };

    const templateFn = templates[key];
    if (templateFn) {
        return assertNoBannedTerms(templateFn(value, impact));
    }
    return assertNoBannedTerms('This factor contributed to your wellness estimate.');
}

interface DailyContext {
    date: string;
    sleep_hours: number | null;
    steps: number | null;
    active_minutes: number | null;
    resting_hr: number | null;
    hrv_ms: number | null;
}

interface UserProfile {
    birth_date: string | null;
    height_cm: number | null;
    weight_kg: number | null;
}

// Convert daily context to MetabolicScoreInput
function buildMetabolicScoreInput(
    dailyContext: DailyContext[],
    profile: UserProfile | null
): MetabolicScoreInput {
    // Calculate age from birth_date
    let age: number | undefined;
    if (profile?.birth_date) {
        const birthDate = new Date(profile.birth_date);
        const today = new Date();
        age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
    }

    return {
        sleepRHR: dailyContext.map(d => d.resting_hr),
        dailySteps: dailyContext.map(d => d.steps),
        sleepHours: dailyContext.map(d => d.sleep_hours),
        sleepHRV: dailyContext.map(d => d.hrv_ms),
        age,
        heightCm: profile?.height_cm ?? undefined,
        weightKg: profile?.weight_kg ?? undefined,
    };
}

function buildBaselineInput(dailyContext: DailyContext[]): MetabolicScoreInput {
    return {
        sleepRHR: dailyContext.map(d => d.resting_hr),
        dailySteps: dailyContext.map(d => d.steps),
        sleepHours: dailyContext.map(d => d.sleep_hours),
        sleepHRV: dailyContext.map(d => d.hrv_ms),
    };
}

// Convert v2 score result to legacy format
function toLegacyFormat(
    calcResult: MetabolicScoreCalculation,
    confidenceLabel: ConfidenceLabel,
    rangeKey: RangeKey,
    wearablesDays: number,
    labPresent: boolean = false
): LegacyScoreResult {
    if (calcResult.score7d === null) {
        return {
            status: 'insufficient',
            range: rangeKey,
            metabolic_response_score: null,
            strain_score: null,
            band: null,
            confidence: 'low',
            wearables_days: wearablesDays,
            lab_present: labPresent,
            drivers: [{
                key: 'data_sparse',
                points: 0,
                text: generateDriverText('data_sparse', wearablesDays, 'bad'),
            }],
            components: { base: 50, sleep_pen: 0, act_pen: 0, steps_pen: 0, rhr_pen: 0, hrv_pen: 0, fibre_bonus: 0, lab_pen: 0 },
        };
    }

    // Determine band from score (inverted from strain)
    let band: Band;
    if (calcResult.score7d >= 70) {
        band = 'low';     // Low strain = good
    } else if (calcResult.score7d >= 40) {
        band = 'medium';  // Medium strain
    } else {
        band = 'high';    // High strain = needs attention
    }

    // Confidence based on data completeness
    const confidence: Confidence = confidenceLabel === 'insufficient_data' ? 'low' : confidenceLabel;

    // Build drivers from v2 badness
    const drivers: LegacyDriver[] = [];
    if (calcResult.components) {
        const normEntries = [
            { key: 'rhr', norm: calcResult.components.rhrBad ?? 0, value: calcResult.aggregates.weeklyRHR },
            { key: 'steps', norm: calcResult.components.stepsBad ?? 0, value: calcResult.aggregates.weeklySteps },
            { key: 'sleep', norm: calcResult.components.sleepBad ?? 0, value: calcResult.aggregates.weeklySleep },
            { key: 'hrv', norm: calcResult.components.hrvBad ?? 0, value: calcResult.aggregates.weeklyHRV },
        ];

        // Sort by norm value (highest impact first)
        normEntries.sort((a, b) => b.norm - a.norm);

        for (const entry of normEntries.slice(0, 3)) {
            if (entry.value !== null) {
                const impact = entry.norm > 0.3 ? 'bad' : 'good';
                drivers.push({
                    key: entry.key,
                    points: round1(entry.norm * 10),
                    text: generateDriverText(entry.key, entry.value, impact),
                });
            }
        }
    }

    // Legacy components (approximate mapping)
    const strainScore = calcResult.components?.strain !== undefined ? Math.round(calcResult.components.strain * 100) : 50;
    const components: LegacyComponents = {
        base: 50,
        sleep_pen: round1((calcResult.components?.sleepBad ?? 0) * 15),
        act_pen: 0, // Active minutes not directly in new formula
        steps_pen: round1((calcResult.components?.stepsBad ?? 0) * 10),
        rhr_pen: round1((calcResult.components?.rhrBad ?? 0) * 10),
        hrv_pen: round1((calcResult.components?.hrvBad ?? 0) * 10),
        fibre_bonus: 0,
        lab_pen: 0,
    };

    return {
        status: 'ok',
        range: rangeKey,
        metabolic_response_score: calcResult.score7d,
        strain_score: strainScore,
        band,
        confidence,
        wearables_days: wearablesDays,
        lab_present: labPresent,
        drivers,
        components,
    };
}

// Date range helper
function getDateRange(rangeDays: number): { startDate: Date; endDate: Date } {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - rangeDays);
    return { startDate, endDate };
}

function parseRange(range: string | undefined): { rangeDays: number; rangeKey: RangeKey } {
    switch (range) {
        case '7d': return { rangeDays: 7, rangeKey: '7d' };
        case '14d': return { rangeDays: 14, rangeKey: '14d' };
        case '90d': return { rangeDays: 90, rangeKey: '90d' };
        case '30d':
        default: return { rangeDays: 30, rangeKey: '30d' };
    }
}

function addDays(dateStr: string, days: number): string {
    const date = new Date(`${dateStr}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().split('T')[0];
}

function getLatestDate(dailyContext: DailyContext[]): string | null {
    if (dailyContext.length === 0) return null;
    return dailyContext.reduce((latest, entry) => entry.date > latest ? entry.date : latest, dailyContext[0].date);
}

function filterByDateRange(
    dailyContext: DailyContext[],
    startDateStr: string,
    endDateStr: string
): DailyContext[] {
    return dailyContext.filter(entry => entry.date >= startDateStr && entry.date <= endDateStr);
}


// ============================================
// EDGE FUNCTION HANDLER
// ============================================

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { user_id: requestedUserId, range, debug } = await req.json();

        if (!requestedUserId) {
            return new Response(
                JSON.stringify({ error: 'Missing user_id' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const { rangeDays, rangeKey } = parseRange(range);
        const debugEnabled = debug === true || Deno.env.get('METABOLIC_SCORE_DEBUG') === 'true';

        // Initialize Supabase client
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { user, errorResponse } = await requireUser(req, supabase, corsHeaders);
        if (errorResponse) return errorResponse;

        const mismatch = requireMatchingUserId(requestedUserId, user.id, corsHeaders);
        if (mismatch) return mismatch;

        const userId = user.id;
        const historyDays = Math.max(rangeDays, 63);
        const { startDate, endDate } = getDateRange(historyDays);
        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];

        // 1. Fetch daily_context for date range
        const { data: dailyContextData, error: dcError } = await supabase
            .from('daily_context')
            .select('date, sleep_hours, steps, active_minutes, resting_hr, hrv_ms')
            .eq('user_id', userId)
            .gte('date', startDateStr)
            .lte('date', endDateStr)
            .order('date', { ascending: false });

        if (dcError) {
            console.error('Error fetching daily_context:', dcError);
        }

        const dailyContext: DailyContext[] = dailyContextData || [];
        const anchorDateStr = getLatestDate(dailyContext) ?? endDateStr;
        const currentEnd = anchorDateStr;
        const currentStart = addDays(currentEnd, -6);
        const baseline28Start = addDays(currentStart, -28);
        const baseline28End = addDays(currentStart, -1);
        const baseline56Start = addDays(currentStart, -56);
        const baseline56End = baseline28End;

        const currentContext = filterByDateRange(dailyContext, currentStart, currentEnd);
        const baseline28Context = filterByDateRange(dailyContext, baseline28Start, baseline28End);
        const baseline56Context = filterByDateRange(dailyContext, baseline56Start, baseline56End);

        const wearablesDays = currentContext.filter(d =>
            d.sleep_hours !== null ||
            d.steps !== null ||
            d.active_minutes !== null ||
            d.resting_hr !== null ||
            d.hrv_ms !== null
        ).length;

        // 2. Fetch user profile for age/height/weight
        const { data: profileData } = await supabase
            .from('user_profiles')
            .select('birth_date, height_cm, weight_kg')
            .eq('id', userId)
            .single();

        const profile: UserProfile | null = profileData || null;

        // Labs feature removed - no longer checking for lab_snapshots
        const labPresent = false;

        // 3. Fetch weekly scores count for progressive scoring level determination
        const { count: weeklyScoresCount } = await supabase
            .from('user_metabolic_weekly_scores')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId);

        // 4. Build input and calculate score
        const input = buildMetabolicScoreInput(currentContext, profile);
        const baselinePrimary = buildBaselineInput(baseline28Context);
        const baselineFallback = buildBaselineInput(baseline56Context);
        const scoreResult = calculateMetabolicScore(input, baselinePrimary, baselineFallback, weeklyScoresCount ?? 0);

        let score28d: number | null = null;
        let smoothingUnavailable = false;

        if (scoreResult.score7d !== null) {
            const weekStart = currentStart;
            const { error: upsertError } = await supabase
                .from('user_metabolic_weekly_scores')
                .upsert({
                    user_id: userId,
                    week_start: weekStart,
                    score7d: scoreResult.score7d,
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'user_id,week_start' });

            if (upsertError) {
                console.error('Error upserting weekly metabolic score:', upsertError);
            }

            const { data: weeklyScoreData, error: weeklyScoreError } = await supabase
                .from('user_metabolic_weekly_scores')
                .select('score7d')
                .eq('user_id', userId)
                .order('week_start', { ascending: false })
                .limit(4);

            if (weeklyScoreError) {
                console.error('Error fetching weekly metabolic scores:', weeklyScoreError);
            }

            const recentScores = (weeklyScoreData || [])
                .map(entry => entry.score7d)
                .filter((val): val is number => val !== null);

            if (recentScores.length >= 2) {
                score28d = median(recentScores) ?? scoreResult.score7d;
                smoothingUnavailable = false;
            } else {
                score28d = scoreResult.score7d;
                smoothingUnavailable = true;
            }
        } else {
            score28d = null;
            smoothingUnavailable = true;
        }

        const confidenceLabel = calculateConfidenceLabel(
            scoreResult.dataCompleteness,
            scoreResult.aggregates.weeklyHRV !== null,
            scoreResult.atypicalActivityWeek,
            smoothingUnavailable,
            scoreResult.scoreLevel
        );

        const v2Result: MetabolicScoreV2Result = {
            score7d: scoreResult.score7d,
            score28d,
            confidence: confidenceLabel,
            atypicalActivityWeek: scoreResult.atypicalActivityWeek,
            mode: scoreResult.mode,
            reason: scoreResult.score7d === null ? 'insufficient_data' : undefined,
            components: scoreResult.components ?? undefined,
            // New progressive scoring fields
            scoreLevel: scoreResult.scoreLevel,
            uxReason: scoreResult.uxReason,
            zSteps: scoreResult.zSteps,
            debug: debugEnabled ? {
                validDays: scoreResult.dataCompleteness,
                usedBaseline: scoreResult.usedBaseline,
                usedFallbacks: scoreResult.usedFallbacks,
                smoothingUnavailable,
            } : undefined,
            debugV2: debugEnabled ? scoreResult.debugV2 : undefined,
        };

        // 5. Convert to legacy format for backward compatibility
        const legacyResult = toLegacyFormat(scoreResult, confidenceLabel, rangeKey, wearablesDays, labPresent);

        // 6. Safety check on driver texts
        legacyResult.drivers = legacyResult.drivers.map(d => ({
            ...d,
            text: assertNoBannedTerms(d.text),
        }));

        const responsePayload = {
            ...legacyResult,
            score7d: v2Result.score7d,
            score28d: v2Result.score28d,
            confidence_v2: v2Result.confidence,
            atypicalActivityWeek: v2Result.atypicalActivityWeek,
            mode: v2Result.mode,
            reason: v2Result.reason,
            components_v2: v2Result.components,
            // New progressive scoring fields
            scoreLevel: v2Result.scoreLevel,
            uxReason: v2Result.uxReason,
            zSteps: v2Result.zSteps,
            debug_v2: v2Result.debug,
            debugV2: v2Result.debugV2,
            v2: v2Result,
        };

        return new Response(
            JSON.stringify(responsePayload),
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

// Export for testing
export { calculateMetabolicScore, calculateConfidenceLabel, smoothScores };
export type {
    MetabolicScoreInput,
    MetabolicScoreCalculation,
    MetabolicScoreV2Result,
    ScoreLevel,
    UxReason,
    MetabolicScoreDebugV2,
};
