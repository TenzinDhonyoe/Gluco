// supabase/functions/metabolic-score/index.ts
// Edge Function for computing Metabolic Response Score (wellness estimate)
// IMPORTANT: No LLM used. Pure deterministic heuristic scoring.
// BANNED TERMS (never use): insulin resistance, HOMA-IR, prediabetes, diabetes,
//   diagnose, detect, treat, prevent, medical device, clinical, reverse

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { requireMatchingUserId, requireUser } from '../_shared/auth.ts';

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
    return Math.max(min, Math.min(max, val));
}

function clamp01(x: number): number {
    return clamp(x, 0, 1);
}

function round1(val: number): number {
    return Math.round(val * 10) / 10;
}

function round2(val: number): number {
    return Math.round(val * 100) / 100;
}

// Filter out null/undefined/NaN values
function filterValid(values: (number | null | undefined)[]): number[] {
    return values.filter((v): v is number => v !== null && v !== undefined && !isNaN(v));
}

// Calculate mean of valid values
function mean(values: (number | null | undefined)[]): number | null {
    const valid = filterValid(values);
    if (valid.length === 0) return null;
    return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

// Calculate median of valid values
function median(values: (number | null | undefined)[]): number | null {
    const valid = filterValid(values);
    if (valid.length === 0) return null;
    const sorted = [...valid].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Remove outliers using trimmed range (drop top/bottom 10%)
function trimOutliers(values: (number | null | undefined)[]): number[] {
    const valid = filterValid(values);
    if (valid.length < 5) return valid; // Need enough data to trim

    const sorted = [...valid].sort((a, b) => a - b);
    const trimCount = Math.max(1, Math.floor(sorted.length * 0.1)); // 10%
    return sorted.slice(trimCount, sorted.length - trimCount);
}

// ============================================
// METABOLIC SCORE CALCULATOR
// Following user's specification exactly
// ============================================

interface MetabolicScoreInput {
    sleepRHR: (number | null)[];      // Nightly resting HR during sleep (bpm)
    dailySteps: (number | null)[];     // Daily step count
    sleepHours: (number | null)[];     // Nightly sleep duration (hours)
    sleepHRV?: (number | null)[];      // Nightly HRV RMSSD (ms) - optional
    age?: number;                       // Years - optional
    bmi?: number;                       // BMI - optional (or compute from height/weight)
    heightCm?: number;                  // Height in cm - optional
    weightKg?: number;                  // Weight in kg - optional
}

interface MetabolicScoreComponents {
    weeklyRHR: number | null;
    weeklySteps: number | null;
    weeklySleep: number | null;
    weeklyHRV: number | null;
    age: number | null;
    bmi: number | null;
}

interface MetabolicScoreNorms {
    rhrNorm: number;
    stepsBadNorm: number;
    sleepNorm: number;
    hrvBadNorm: number | null;
    contextNorm: number;
}

interface MetabolicScoreWeights {
    wRHR: number;
    wSteps: number;
    wSleep: number;
    wHRV: number;
    wContext: number;
}

interface DataCompleteness {
    rhrDays: number;
    stepsDays: number;
    sleepDays: number;
    hrvDays: number;
    hasAge: boolean;
    hasBmi: boolean;
}

interface MetabolicScoreResult {
    score: number | null;               // 0-100 (higher = better) or null if insufficient
    strain: number | null;              // 0-1 metabolic strain
    reason?: string;                    // Reason if score is null
    components: MetabolicScoreComponents;
    norms: MetabolicScoreNorms | null;
    weightsUsed: MetabolicScoreWeights | null;
    dataCompleteness: DataCompleteness;
}

/**
 * Calculate Metabolic Score from Apple Watch / HealthKit metrics
 * Uses 7-day rolling window, outputs 0-100 score (higher = better)
 */
function calculateMetabolicScore(input: MetabolicScoreInput): MetabolicScoreResult {
    // Data completeness check
    const rhrValid = filterValid(input.sleepRHR);
    const stepsValid = filterValid(input.dailySteps);
    const sleepValid = filterValid(input.sleepHours);
    const hrvValid = input.sleepHRV ? filterValid(input.sleepHRV) : [];

    const dataCompleteness: DataCompleteness = {
        rhrDays: rhrValid.length,
        stepsDays: stepsValid.length,
        sleepDays: sleepValid.length,
        hrvDays: hrvValid.length,
        hasAge: input.age !== undefined && input.age !== null,
        hasBmi: input.bmi !== undefined || (input.heightCm !== undefined && input.weightKg !== undefined),
    };

    // Requirement 1: Need at least 5 valid data points for required arrays
    if (rhrValid.length < 5 || stepsValid.length < 5 || sleepValid.length < 5) {
        return {
            score: null,
            strain: null,
            reason: 'insufficient_data',
            components: {
                weeklyRHR: null,
                weeklySteps: null,
                weeklySleep: null,
                weeklyHRV: null,
                age: input.age ?? null,
                bmi: null,
            },
            norms: null,
            weightsUsed: null,
            dataCompleteness,
        };
    }

    // Requirement 3: Outlier handling - trim top/bottom 10%
    const rhrTrimmed = trimOutliers(input.sleepRHR);
    const stepsTrimmed = trimOutliers(input.dailySteps);
    const sleepTrimmed = trimOutliers(input.sleepHours);
    const hrvTrimmed = input.sleepHRV ? trimOutliers(input.sleepHRV) : [];

    // Requirement 2: Aggregation (median for RHR/HRV, mean for steps/sleep)
    const weeklyRHR = median(rhrTrimmed);
    const weeklySteps = mean(stepsTrimmed);
    const weeklySleep = mean(sleepTrimmed);
    const weeklyHRV = hrvTrimmed.length >= 3 ? median(hrvTrimmed) : null;

    // Calculate BMI if height/weight provided
    let bmi = input.bmi ?? null;
    if (bmi === null && input.heightCm && input.weightKg) {
        const heightM = input.heightCm / 100;
        bmi = input.weightKg / (heightM * heightM);
    }

    const components: MetabolicScoreComponents = {
        weeklyRHR: weeklyRHR !== null ? round1(weeklyRHR) : null,
        weeklySteps: weeklySteps !== null ? Math.round(weeklySteps) : null,
        weeklySleep: weeklySleep !== null ? round1(weeklySleep) : null,
        weeklyHRV: weeklyHRV !== null ? round1(weeklyHRV) : null,
        age: input.age ?? null,
        bmi: bmi !== null ? round1(bmi) : null,
    };

    // Requirement 4: Normalization (0-1 scale, higher = worse)

    // RHR (higher = worse): clamp01((Weekly_RHR - 50) / (85 - 50))
    const rhrNorm = weeklyRHR !== null
        ? clamp01((weeklyRHR - 50) / (85 - 50))
        : 0;

    // Steps (higher = better, so invert): 1 - clamp01((Weekly_Steps - 3000) / (12000 - 3000))
    const stepsBadNorm = weeklySteps !== null
        ? 1 - clamp01((weeklySteps - 3000) / (12000 - 3000))
        : 1;

    // Sleep (distance from ideal 7.5h): clamp01(abs(Weekly_Sleep - 7.5) / 2.5)
    const sleepNorm = weeklySleep !== null
        ? clamp01(Math.abs(weeklySleep - 7.5) / 2.5)
        : 0;

    // HRV (higher = better): First normalize good, then invert
    let hrvBadNorm: number | null = null;
    if (weeklyHRV !== null) {
        const hrvGood = clamp01((weeklyHRV - 20) / (80 - 20));
        hrvBadNorm = 1 - hrvGood;
    }

    // Context normalization (Age and/or BMI)
    let contextNorm = 0;
    const hasAge = input.age !== undefined && input.age !== null;
    const hasBmi = bmi !== null;

    if (hasBmi && hasAge) {
        const bmiNorm = clamp01((bmi! - 22) / (35 - 22));
        const ageNorm = clamp01((input.age! - 25) / (65 - 25));
        contextNorm = 0.6 * bmiNorm + 0.4 * ageNorm;
    } else if (hasBmi) {
        contextNorm = clamp01((bmi! - 22) / (35 - 22));
    } else if (hasAge) {
        contextNorm = clamp01((input.age! - 25) / (65 - 25));
    }

    const norms: MetabolicScoreNorms = {
        rhrNorm: round2(rhrNorm),
        stepsBadNorm: round2(stepsBadNorm),
        sleepNorm: round2(sleepNorm),
        hrvBadNorm: hrvBadNorm !== null ? round2(hrvBadNorm) : null,
        contextNorm: round2(contextNorm),
    };

    // Requirement 5: Weighted metabolic strain
    // Base weights
    let wRHR = 0.35;
    let wSteps = 0.30;
    let wSleep = 0.15;
    let wHRV = weeklyHRV !== null ? 0.10 : 0;
    let wContext = (hasAge || hasBmi) ? 0.10 : 0;

    // Redistribute missing weights proportionally
    const usedWeight = wRHR + wSteps + wSleep + wHRV + wContext;
    const missingWeight = 1.0 - usedWeight;

    if (missingWeight > 0) {
        // Redistribute proportionally to non-zero weights
        const totalActive = wRHR + wSteps + wSleep + wHRV + wContext;
        if (totalActive > 0) {
            const scale = 1.0 / totalActive;
            wRHR *= scale;
            wSteps *= scale;
            wSleep *= scale;
            wHRV *= scale;
            wContext *= scale;
        } else {
            // Fallback: equal distribution to core metrics
            wRHR = 0.4;
            wSteps = 0.35;
            wSleep = 0.25;
        }
    }

    const weightsUsed: MetabolicScoreWeights = {
        wRHR: round2(wRHR),
        wSteps: round2(wSteps),
        wSleep: round2(wSleep),
        wHRV: round2(wHRV),
        wContext: round2(wContext),
    };

    // Calculate metabolic strain (0-1)
    let metabolicStrain =
        wRHR * rhrNorm +
        wSteps * stepsBadNorm +
        wSleep * sleepNorm;

    if (hrvBadNorm !== null) {
        metabolicStrain += wHRV * hrvBadNorm;
    }
    if (hasAge || hasBmi) {
        metabolicStrain += wContext * contextNorm;
    }

    // Requirement 6: Convert to score (0-100, higher = better)
    const metabolicScore = Math.round(100 * (1 - metabolicStrain));
    const finalScore = clamp(metabolicScore, 0, 100);

    return {
        score: finalScore,
        strain: round2(metabolicStrain),
        components,
        norms,
        weightsUsed,
        dataCompleteness,
    };
}

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

// Convert new score result to legacy format
function toLegacyFormat(
    result: MetabolicScoreResult,
    rangeKey: RangeKey,
    wearablesDays: number,
    labPresent: boolean = false
): LegacyScoreResult {
    if (result.score === null) {
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
    if (result.score >= 70) {
        band = 'low';     // Low strain = good
    } else if (result.score >= 40) {
        band = 'medium';  // Medium strain
    } else {
        band = 'high';    // High strain = needs attention
    }

    // Confidence based on data completeness
    let confidence: Confidence;
    const avgDays = (result.dataCompleteness.rhrDays +
        result.dataCompleteness.stepsDays +
        result.dataCompleteness.sleepDays) / 3;
    if (avgDays >= 6 && result.dataCompleteness.hrvDays >= 3) {
        confidence = 'high';
    } else if (avgDays >= 5) {
        confidence = 'medium';
    } else {
        confidence = 'low';
    }

    // Build drivers from norms
    const drivers: LegacyDriver[] = [];
    if (result.norms) {
        const normEntries = [
            { key: 'rhr', norm: result.norms.rhrNorm, value: result.components.weeklyRHR },
            { key: 'steps', norm: result.norms.stepsBadNorm, value: result.components.weeklySteps },
            { key: 'sleep', norm: result.norms.sleepNorm, value: result.components.weeklySleep },
            { key: 'hrv', norm: result.norms.hrvBadNorm ?? 0, value: result.components.weeklyHRV },
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
    const strainScore = result.strain !== null ? Math.round(result.strain * 100) : 50;
    const components: LegacyComponents = {
        base: 50,
        sleep_pen: round1((result.norms?.sleepNorm ?? 0) * 15),
        act_pen: 0, // Active minutes not directly in new formula
        steps_pen: round1((result.norms?.stepsBadNorm ?? 0) * 10),
        rhr_pen: round1((result.norms?.rhrNorm ?? 0) * 10),
        hrv_pen: round1((result.norms?.hrvBadNorm ?? 0) * 10),
        fibre_bonus: 0,
        lab_pen: 0,
    };

    return {
        status: 'ok',
        range: rangeKey,
        metabolic_response_score: result.score,
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

// ============================================
// EDGE FUNCTION HANDLER
// ============================================

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { user_id: requestedUserId, range } = await req.json();

        if (!requestedUserId) {
            return new Response(
                JSON.stringify({ error: 'Missing user_id' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const { rangeDays, rangeKey } = parseRange(range);

        // Initialize Supabase client
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { user, errorResponse } = await requireUser(req, supabase, corsHeaders);
        if (errorResponse) return errorResponse;

        const mismatch = requireMatchingUserId(requestedUserId, user.id, corsHeaders);
        if (mismatch) return mismatch;

        const userId = user.id;
        const { startDate, endDate } = getDateRange(rangeDays);
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
        const wearablesDays = dailyContext.filter(d =>
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

        // 3. Check for lab results (for legacy compatibility)
        const { data: labData } = await supabase
            .from('lab_snapshots')
            .select('id')
            .eq('user_id', userId)
            .limit(1);
        const labPresent = labData && labData.length > 0;

        // 4. Build input and calculate score
        const input = buildMetabolicScoreInput(dailyContext, profile);
        const scoreResult = calculateMetabolicScore(input);

        // 5. Convert to legacy format for backward compatibility
        const legacyResult = toLegacyFormat(scoreResult, rangeKey, wearablesDays, labPresent);

        // 6. Safety check on driver texts
        legacyResult.drivers = legacyResult.drivers.map(d => ({
            ...d,
            text: assertNoBannedTerms(d.text),
        }));

        return new Response(
            JSON.stringify(legacyResult),
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
export { calculateMetabolicScore, MetabolicScoreInput, MetabolicScoreResult, smoothScores };

