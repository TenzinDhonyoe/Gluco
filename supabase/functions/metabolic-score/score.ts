// supabase/functions/metabolic-score/score.ts
// Shared scoring logic for Metabolic Response Score v2.

import {
    clamp,
    clamp01,
    filterValid,
    mean,
    median,
    stddev,
    winsorize,
    iqrBounds,
} from '../_shared/stats.ts';

export interface MetabolicScoreInput {
    sleepRHR: (number | null)[];      // Nightly resting HR during sleep (bpm)
    dailySteps: (number | null)[];     // Daily step count
    sleepHours: (number | null)[];     // Nightly sleep duration (hours)
    sleepHRV?: (number | null)[];      // Nightly HRV RMSSD (ms) - optional
    age?: number;                       // Years - optional
    bmi?: number;                       // BMI - optional (or compute from height/weight)
    heightCm?: number;                  // Height in cm - optional
    weightKg?: number;                  // Weight in kg - optional
}

export interface WeeklyAggregates {
    weeklyRHR: number | null;
    weeklySteps: number | null;
    weeklySleep: number | null;
    weeklyHRV: number | null;
    sleepStd: number | null;
    age: number | null;
    bmi: number | null;
}

export interface MetabolicScoreComponentsV2 {
    rhrBad: number | null;
    stepsBad: number | null;
    sleepBad: number | null;
    hrvBad: number | null;
    contextNorm: number;
    wearableStrain: number;
    contextMultiplier: number;
    strain: number;
}

export interface MetabolicScoreWeights {
    wRHR: number;
    wSteps: number;
    wSleep: number;
    wHRV: number;
    wContext: number;
}

export interface DataCompleteness {
    rhrDays: number;
    stepsDays: number;
    sleepDays: number;
    hrvDays: number;
    hasAge: boolean;
    hasBmi: boolean;
}

interface BaselineStats {
    median: number;
    iqr: number;
    source: 'primary' | 'fallback';
}

export interface UsedBaseline {
    rhr: boolean;
    steps: boolean;
    sleep: boolean;
    hrv: boolean;
}

export interface MetabolicScoreCalculation {
    score7d: number | null;
    reason?: string;
    aggregates: WeeklyAggregates;
    components: MetabolicScoreComponentsV2 | null;
    weightsUsed: MetabolicScoreWeights | null;
    dataCompleteness: DataCompleteness;
    usedBaseline: UsedBaseline;
    usedFallbacks: UsedBaseline;
    atypicalActivityWeek: boolean;
    mode: 'baseline_relative' | 'absolute_fallback';
    // New v2 progressive scoring fields
    scoreLevel?: ScoreLevel;
    uxReason?: UxReason;
    debugV2?: MetabolicScoreDebugV2;
    zSteps?: number | null;
}

export type ConfidenceLabel = 'high' | 'medium' | 'low' | 'insufficient_data';

// Score levels for progressive scoring
export type ScoreLevel = 'no_score' | 'provisional' | 'standard' | 'calibrated';

// Extended mode type
export type ScoringMode = 'absolute_fallback' | 'baseline_relative' | 'baseline_relative_missing_baselines';

// Core metrics type
export type CoreMetric = 'rhr' | 'steps' | 'sleep';

// UX reason strings
export type UxReason =
    | 'insufficient_data'
    | 'provisional_missing_sleep'
    | 'provisional_missing_rhr'
    | 'provisional_missing_steps'
    | 'standard_missing_baselines'
    | 'standard_atypical_activity'
    | 'calibrated';

// Excluded metric info
export interface ExcludedMetric {
    metric: CoreMetric | 'hrv';
    reason: 'insufficient_days' | 'excluded_by_level';
}

// Extended debug output
export interface MetabolicScoreDebugV2 {
    scoreLevel: ScoreLevel;
    metricsUsed: (CoreMetric | 'hrv')[];
    daysUsed: { rhr: number; steps: number; sleep: number; hrv: number };
    excludedMetrics: ExcludedMetric[];
    mode: ScoringMode;
    atypicalActivity: boolean;
    zSteps: number | null;
    scoreWasClamped: boolean;
    rawScoreBeforeClamp: number | null;
}

const IQR_EPS = 1;
const LOGISTIC_K = 1.2;
const LOGISTIC_M = 0;

function round1(val: number): number {
    return Math.round(val * 10) / 10;
}

function round2(val: number): number {
    return Math.round(val * 100) / 100;
}

function logistic(z: number, k: number = LOGISTIC_K, m: number = LOGISTIC_M): number {
    return 1 / (1 + Math.exp(-k * (z - m)));
}

function baselineBadness(delta: number, iqr: number, invert: boolean): number {
    const denom = Math.max(iqr, IQR_EPS);
    const z = invert ? -(delta / denom) : (delta / denom);
    return clamp01(logistic(z));
}

function baselineBadnessAbs(deltaAbs: number, iqr: number): number {
    const denom = Math.max(iqr, IQR_EPS);
    const z = deltaAbs / denom;
    return clamp01(logistic(z));
}

function computeBaselineStats(values: (number | null | undefined)[], minDays: number): BaselineStats | null {
    const valid = filterValid(values);
    if (valid.length < minDays) return null;
    const winsorized = winsorize(valid);
    const medianVal = median(winsorized);
    const bounds = iqrBounds(winsorized);
    if (medianVal === null || bounds === null) return null;
    return {
        median: medianVal,
        iqr: bounds.iqr,
        source: 'primary',
    };
}

function selectBaselineStats(
    primary: (number | null | undefined)[],
    fallback: (number | null | undefined)[],
    minDays: number
): { stats: BaselineStats | null; usedFallback: boolean } {
    const primaryStats = computeBaselineStats(primary, minDays);
    if (primaryStats) {
        return { stats: primaryStats, usedFallback: false };
    }
    const fallbackStats = computeBaselineStats(fallback, minDays);
    if (fallbackStats) {
        return { stats: { ...fallbackStats, source: 'fallback' }, usedFallback: true };
    }
    return { stats: null, usedFallback: false };
}

// ============================================
// PROGRESSIVE SCORING HELPER FUNCTIONS (v2)
// ============================================

interface MetricDays {
    rhr: number;
    steps: number;
    sleep: number;
    hrv: number;
}

interface BaselineAvailability {
    rhr: boolean;
    steps: boolean;
    sleep: boolean;
    hrv: boolean;
}

/**
 * Determines which scoring level applies based on data completeness and baseline availability.
 * Level 0 (no_score): < 3 valid days total across all metrics OR < 2 core metrics have >= 3 valid days
 * Level 1 (provisional): >= 2 core metrics have >= 3 valid days
 * Level 2 (standard): >= 2 core metrics have >= 5 valid days AND third core metric >= 3 days
 * Level 3 (calibrated): >= 2 core metrics have baselines (14+ days) AND user has >= 2 weekly scores
 */
function determineScoreLevel(
    metricDays: MetricDays,
    baselineAvailability: BaselineAvailability,
    weeklyScoresCount: number
): ScoreLevel {
    const coreDays = [metricDays.rhr, metricDays.steps, metricDays.sleep];
    const totalValidDays = coreDays.reduce((sum, d) => sum + d, 0);

    // Level 0: < 3 total valid days OR < 2 core metrics with >= 3 days
    const coreMetricsWithThreeDays = coreDays.filter(d => d >= 3).length;
    if (totalValidDays < 3 || coreMetricsWithThreeDays < 2) {
        return 'no_score';
    }

    // Level 3 (calibrated): >= 2 core metrics have baselines AND >= 2 weekly scores
    const coreBaselines = [baselineAvailability.rhr, baselineAvailability.steps, baselineAvailability.sleep];
    const coreMetricsWithBaselines = coreBaselines.filter(b => b).length;
    if (coreMetricsWithBaselines >= 2 && weeklyScoresCount >= 2) {
        return 'calibrated';
    }

    // Level 2 (standard): >= 2 core metrics have >= 5 valid days AND third >= 3 days
    const sortedCoreDays = [...coreDays].sort((a, b) => b - a);
    const coreMetricsWithFiveDays = coreDays.filter(d => d >= 5).length;
    if (coreMetricsWithFiveDays >= 2 && sortedCoreDays[2] >= 3) {
        return 'standard';
    }

    // Level 1 (provisional): >= 2 core metrics with >= 3 days (already checked above)
    return 'provisional';
}

/**
 * Per-week mode selection (not per-metric).
 * provisional -> always absolute_fallback
 * Else if >= 2 metrics have valid baselines -> baseline_relative
 * Else -> absolute_fallback
 */
function selectScoringMode(
    scoreLevel: ScoreLevel,
    baselineAvailability: BaselineAvailability
): ScoringMode {
    if (scoreLevel === 'provisional') {
        return 'absolute_fallback';
    }

    const coreBaselines = [baselineAvailability.rhr, baselineAvailability.steps, baselineAvailability.sleep];
    const coreMetricsWithBaselines = coreBaselines.filter(b => b).length;

    if (coreMetricsWithBaselines >= 2) {
        return 'baseline_relative';
    }

    return 'absolute_fallback';
}

const MIN_IQR_STEPS = 1000;

/**
 * Z-score based atypical activity detection.
 * Returns { zSteps, isAtypical }
 */
function computeZSteps(
    weeklySteps: number | null,
    baselineMedian: number | null,
    baselineIQR: number | null
): { zSteps: number | null; isAtypical: boolean } {
    if (weeklySteps === null || baselineMedian === null || baselineIQR === null) {
        return { zSteps: null, isAtypical: false };
    }

    const zSteps = (weeklySteps - baselineMedian) / Math.max(baselineIQR, MIN_IQR_STEPS);
    const isAtypical = Math.abs(zSteps) > 2;

    return { zSteps, isAtypical };
}

/**
 * Apply saturation to stepsBad when atypical.
 * stepsBad = 0.5 * stepsBad + 0.5 * clamp01(stepsBad / 0.8)
 */
function computeStepsBadWithSaturation(stepsBad: number): number {
    return 0.5 * stepsBad + 0.5 * clamp01(stepsBad / 0.8);
}

interface WeightCalculation {
    wRHR: number;
    wSteps: number;
    wSleep: number;
    wHRV: number;
    wContext: number;
    excludedMetrics: ExcludedMetric[];
    metricsUsed: (CoreMetric | 'hrv')[];
}

/**
 * Handle metric exclusion and weight renormalization.
 * - Exclude core metrics with < 3 valid days (set weight to 0)
 * - Renormalize remaining weights to sum to 1.0
 * - Apply atypical activity reduction (0.7x) to steps weight if atypical
 */
function computeWeightsWithExclusion(
    metricDays: MetricDays,
    hasHRV: boolean,
    hasContext: boolean,
    isAtypical: boolean
): WeightCalculation {
    const excludedMetrics: ExcludedMetric[] = [];
    const metricsUsed: (CoreMetric | 'hrv')[] = [];

    // Base weights
    let wRHR = metricDays.rhr >= 3 ? 0.35 : 0;
    let wSteps = metricDays.steps >= 3 ? 0.30 : 0;
    let wSleep = metricDays.sleep >= 3 ? 0.15 : 0;
    let wHRV = hasHRV && metricDays.hrv >= 3 ? 0.10 : 0;
    let wContext = hasContext ? 0.10 : 0;

    // Track exclusions
    if (metricDays.rhr < 3) {
        excludedMetrics.push({ metric: 'rhr', reason: 'insufficient_days' });
    } else {
        metricsUsed.push('rhr');
    }

    if (metricDays.steps < 3) {
        excludedMetrics.push({ metric: 'steps', reason: 'insufficient_days' });
    } else {
        metricsUsed.push('steps');
    }

    if (metricDays.sleep < 3) {
        excludedMetrics.push({ metric: 'sleep', reason: 'insufficient_days' });
    } else {
        metricsUsed.push('sleep');
    }

    if (hasHRV) {
        if (metricDays.hrv < 3) {
            excludedMetrics.push({ metric: 'hrv', reason: 'insufficient_days' });
        } else {
            metricsUsed.push('hrv');
        }
    }

    // Apply atypical activity reduction to steps weight
    if (isAtypical && wSteps > 0) {
        wSteps *= 0.7;
    }

    // Renormalize weights to sum to 1.0
    const totalActive = wRHR + wSteps + wSleep + wHRV + wContext;
    if (totalActive > 0) {
        const scale = 1.0 / totalActive;
        wRHR *= scale;
        wSteps *= scale;
        wSleep *= scale;
        wHRV *= scale;
        wContext *= scale;
    } else {
        // Fallback if no active weights
        wRHR = 0.4;
        wSteps = 0.35;
        wSleep = 0.25;
    }

    return { wRHR, wSteps, wSleep, wHRV, wContext, excludedMetrics, metricsUsed };
}

/**
 * Generate appropriate UX reason string based on scoreLevel and context.
 */
function determineUxReason(
    scoreLevel: ScoreLevel,
    metricDays: MetricDays,
    baselineAvailability: BaselineAvailability,
    isAtypical: boolean
): UxReason {
    if (scoreLevel === 'no_score') {
        return 'insufficient_data';
    }

    if (scoreLevel === 'provisional') {
        // Determine which metric is missing
        if (metricDays.sleep < 3) return 'provisional_missing_sleep';
        if (metricDays.rhr < 3) return 'provisional_missing_rhr';
        if (metricDays.steps < 3) return 'provisional_missing_steps';
        // Fallback (shouldn't normally reach here in provisional)
        return 'provisional_missing_sleep';
    }

    if (scoreLevel === 'calibrated') {
        return 'calibrated';
    }

    // Standard level
    if (isAtypical) {
        return 'standard_atypical_activity';
    }

    const coreBaselines = [baselineAvailability.rhr, baselineAvailability.steps, baselineAvailability.sleep];
    const coreMetricsWithBaselines = coreBaselines.filter(b => b).length;
    if (coreMetricsWithBaselines < 2) {
        return 'standard_missing_baselines';
    }

    return 'calibrated';
}

/**
 * Calculate Metabolic Response Score v2 from Apple HealthKit metrics.
 * Uses a 7-day window with optional baseline-relative normalization.
 * Implements progressive scoring ladder (Level 0-3) for better handling of partial data.
 */
export function calculateMetabolicScore(
    input: MetabolicScoreInput,
    baselinePrimary?: MetabolicScoreInput | null,
    baselineFallback?: MetabolicScoreInput | null,
    weeklyScoresCount: number = 0
): MetabolicScoreCalculation {
    // 1. Compute data completeness
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

    const metricDays: MetricDays = {
        rhr: rhrValid.length,
        steps: stepsValid.length,
        sleep: sleepValid.length,
        hrv: hrvValid.length,
    };

    // 2. Compute baselines early (needed for score level determination)
    const baselineRhr = selectBaselineStats(
        baselinePrimary?.sleepRHR ?? [],
        baselineFallback?.sleepRHR ?? [],
        14
    );
    const baselineSteps = selectBaselineStats(
        baselinePrimary?.dailySteps ?? [],
        baselineFallback?.dailySteps ?? [],
        14
    );
    const baselineSleep = selectBaselineStats(
        baselinePrimary?.sleepHours ?? [],
        baselineFallback?.sleepHours ?? [],
        14
    );
    const baselineHrv = selectBaselineStats(
        baselinePrimary?.sleepHRV ?? [],
        baselineFallback?.sleepHRV ?? [],
        14
    );

    const usedBaseline: UsedBaseline = {
        rhr: baselineRhr.stats !== null,
        steps: baselineSteps.stats !== null,
        sleep: baselineSleep.stats !== null,
        hrv: baselineHrv.stats !== null,
    };
    const usedFallbacks: UsedBaseline = {
        rhr: baselineRhr.usedFallback,
        steps: baselineSteps.usedFallback,
        sleep: baselineSleep.usedFallback,
        hrv: baselineHrv.usedFallback,
    };

    const baselineAvailability: BaselineAvailability = {
        rhr: usedBaseline.rhr,
        steps: usedBaseline.steps,
        sleep: usedBaseline.sleep,
        hrv: usedBaseline.hrv,
    };

    // 3. Determine score level
    const scoreLevel = determineScoreLevel(metricDays, baselineAvailability, weeklyScoresCount);

    // Calculate BMI early for aggregates
    let bmi = input.bmi ?? null;
    if (bmi === null && input.heightCm && input.weightKg) {
        const heightM = input.heightCm / 100;
        bmi = input.weightKg / (heightM * heightM);
    }

    // 4. If no_score, return early with null score and debug info
    if (scoreLevel === 'no_score') {
        const uxReason = determineUxReason(scoreLevel, metricDays, baselineAvailability, false);
        const debugV2: MetabolicScoreDebugV2 = {
            scoreLevel,
            metricsUsed: [],
            daysUsed: metricDays,
            excludedMetrics: [
                ...(metricDays.rhr < 3 ? [{ metric: 'rhr' as CoreMetric, reason: 'insufficient_days' as const }] : []),
                ...(metricDays.steps < 3 ? [{ metric: 'steps' as CoreMetric, reason: 'insufficient_days' as const }] : []),
                ...(metricDays.sleep < 3 ? [{ metric: 'sleep' as CoreMetric, reason: 'insufficient_days' as const }] : []),
            ],
            mode: 'absolute_fallback',
            atypicalActivity: false,
            zSteps: null,
            scoreWasClamped: false,
            rawScoreBeforeClamp: null,
        };

        return {
            score7d: null,
            reason: 'insufficient_data',
            aggregates: {
                weeklyRHR: null,
                weeklySteps: null,
                weeklySleep: null,
                weeklyHRV: null,
                sleepStd: null,
                age: input.age ?? null,
                bmi: bmi !== null ? round1(bmi) : null,
            },
            components: null,
            weightsUsed: null,
            dataCompleteness,
            usedBaseline,
            usedFallbacks,
            atypicalActivityWeek: false,
            mode: 'absolute_fallback',
            scoreLevel,
            uxReason,
            debugV2,
            zSteps: null,
        };
    }

    // 5. Select scoring mode (per-week, not per-metric)
    const scoringMode = selectScoringMode(scoreLevel, baselineAvailability);
    const mode: 'baseline_relative' | 'absolute_fallback' =
        scoringMode === 'baseline_relative' ? 'baseline_relative' : 'absolute_fallback';

    // 6. Compute weekly aggregates
    const rhrWins = winsorize(input.sleepRHR);
    const stepsWins = winsorize(input.dailySteps);
    const sleepWins = winsorize(input.sleepHours);
    const hrvWins = input.sleepHRV ? winsorize(input.sleepHRV) : [];

    const weeklyRHR = rhrValid.length >= 3 ? median(rhrWins) : null;
    const weeklySteps = stepsValid.length >= 3 ? median(stepsWins) : null;
    const weeklySleep = sleepValid.length >= 3 ? mean(sleepWins) : null;
    const weeklyHRV = hrvWins.length >= 3 ? median(hrvWins) : null;
    const sleepStd = sleepWins.length >= 3 ? stddev(sleepWins) : null;

    const aggregates: WeeklyAggregates = {
        weeklyRHR: weeklyRHR !== null ? round1(weeklyRHR) : null,
        weeklySteps: weeklySteps !== null ? Math.round(weeklySteps) : null,
        weeklySleep: weeklySleep !== null ? round1(weeklySleep) : null,
        weeklyHRV: weeklyHRV !== null ? round1(weeklyHRV) : null,
        sleepStd: sleepStd !== null ? round1(sleepStd) : null,
        age: input.age ?? null,
        bmi: bmi !== null ? round1(bmi) : null,
    };

    // 7. Compute z-score based atypical activity detection
    const { zSteps, isAtypical: atypicalActivityWeek } = computeZSteps(
        weeklySteps,
        baselineSteps.stats?.median ?? null,
        baselineSteps.stats?.iqr ?? null
    );

    // 8. Compute context normalization
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

    // 9. Compute weights with exclusion
    const weightCalc = computeWeightsWithExclusion(
        metricDays,
        weeklyHRV !== null,
        hasAge || hasBmi,
        atypicalActivityWeek
    );

    const { wRHR, wSteps, wSleep, wHRV, wContext, excludedMetrics, metricsUsed } = weightCalc;

    const weightsUsed: MetabolicScoreWeights = {
        wRHR: round2(wRHR),
        wSteps: round2(wSteps),
        wSleep: round2(wSleep),
        wHRV: round2(wHRV),
        wContext: round2(wContext),
    };

    // 10. Compute badness values
    // In baseline_relative mode, for metrics without baseline, multiply absolute badness by 0.85
    const absoluteFallbackPenalty = mode === 'baseline_relative' ? 0.85 : 1.0;

    let rhrBad: number | null = null;
    if (weeklyRHR !== null && metricDays.rhr >= 3) {
        if (baselineRhr.stats) {
            rhrBad = baselineBadness(weeklyRHR - baselineRhr.stats.median, baselineRhr.stats.iqr, false);
        } else {
            rhrBad = clamp01((weeklyRHR - 50) / (85 - 50)) * absoluteFallbackPenalty;
        }
    }

    let stepsBad: number | null = null;
    if (weeklySteps !== null && metricDays.steps >= 3) {
        if (baselineSteps.stats) {
            stepsBad = baselineBadness(weeklySteps - baselineSteps.stats.median, baselineSteps.stats.iqr, true);
        } else {
            stepsBad = clamp01(1 - (weeklySteps - 3000) / (12000 - 3000)) * absoluteFallbackPenalty;
        }
    }

    let sleepDurationBad: number | null = null;
    if (weeklySleep !== null && metricDays.sleep >= 3) {
        if (baselineSleep.stats) {
            sleepDurationBad = baselineBadnessAbs(Math.abs(weeklySleep - baselineSleep.stats.median), baselineSleep.stats.iqr);
        } else {
            sleepDurationBad = clamp01(Math.abs(weeklySleep - 7.5) / 2.5) * absoluteFallbackPenalty;
        }
    }

    const sleepRegularityBad = sleepStd !== null ? clamp01(sleepStd / 1.5) : null;
    let sleepBad: number | null = null;
    if (sleepDurationBad !== null) {
        sleepBad = sleepRegularityBad !== null
            ? 0.7 * sleepDurationBad + 0.3 * sleepRegularityBad
            : sleepDurationBad;
    }

    let hrvBad: number | null = null;
    if (weeklyHRV !== null && metricDays.hrv >= 3) {
        if (baselineHrv.stats) {
            hrvBad = baselineBadness(weeklyHRV - baselineHrv.stats.median, baselineHrv.stats.iqr, true);
        } else {
            hrvBad = clamp01(1 - (weeklyHRV - 20) / (80 - 20)) * absoluteFallbackPenalty;
        }
    }

    // 11. Apply stepsBad saturation if atypical
    let finalStepsBad = stepsBad;
    if (atypicalActivityWeek && stepsBad !== null) {
        finalStepsBad = computeStepsBadWithSaturation(stepsBad);
    }

    // 12. Compute strain and raw score
    let wearableStrain =
        (rhrBad !== null ? wRHR * rhrBad : 0) +
        (finalStepsBad !== null ? wSteps * finalStepsBad : 0) +
        (sleepBad !== null ? wSleep * sleepBad : 0);

    if (hrvBad !== null) {
        wearableStrain += wHRV * hrvBad;
    }

    const contextMultiplier = (hasAge || hasBmi) ? 1 + 0.15 * contextNorm : 1.0;
    const strain = clamp01(wearableStrain * contextMultiplier);
    const rawScore = Math.round(100 * (1 - strain));

    // 13. Apply provisional clamp for Level 1
    let score7d: number;
    let scoreWasClamped = false;
    if (scoreLevel === 'provisional') {
        score7d = clamp(rawScore, 40, 90);
        scoreWasClamped = score7d !== rawScore;
    } else {
        score7d = clamp(rawScore, 0, 100);
        scoreWasClamped = score7d !== rawScore;
    }

    // 14. Determine UX reason
    const uxReason = determineUxReason(scoreLevel, metricDays, baselineAvailability, atypicalActivityWeek);

    // 15. Build components and debug output
    const components: MetabolicScoreComponentsV2 = {
        rhrBad: rhrBad !== null ? round2(rhrBad) : null,
        stepsBad: finalStepsBad !== null ? round2(finalStepsBad) : null,
        sleepBad: sleepBad !== null ? round2(sleepBad) : null,
        hrvBad: hrvBad !== null ? round2(hrvBad) : null,
        contextNorm: round2(contextNorm),
        wearableStrain: round2(wearableStrain),
        contextMultiplier: round2(contextMultiplier),
        strain: round2(strain),
    };

    const debugV2: MetabolicScoreDebugV2 = {
        scoreLevel,
        metricsUsed,
        daysUsed: metricDays,
        excludedMetrics,
        mode: scoringMode,
        atypicalActivity: atypicalActivityWeek,
        zSteps: zSteps !== null ? round2(zSteps) : null,
        scoreWasClamped,
        rawScoreBeforeClamp: scoreWasClamped ? rawScore : null,
    };

    // 16. Return with new fields populated
    return {
        score7d,
        aggregates,
        components,
        weightsUsed,
        dataCompleteness,
        usedBaseline,
        usedFallbacks,
        atypicalActivityWeek,
        mode,
        scoreLevel,
        uxReason,
        debugV2,
        zSteps: zSteps !== null ? round2(zSteps) : null,
    };
}

export function calculateConfidenceLabel(
    dataCompleteness: DataCompleteness,
    hrvUsed: boolean,
    atypicalActivityWeek: boolean,
    smoothingUnavailable: boolean,
    scoreLevel?: ScoreLevel
): ConfidenceLabel {
    // New v2 logic: use scoreLevel if provided
    if (scoreLevel !== undefined) {
        // no_score -> insufficient_data
        if (scoreLevel === 'no_score') {
            return 'insufficient_data';
        }

        // provisional -> low
        if (scoreLevel === 'provisional') {
            return 'low';
        }

        // standard/calibrated: determine between high, medium, low
        // Count metrics actually used (>= 3 days)
        const usedMetricsDays = [
            dataCompleteness.rhrDays >= 3 ? dataCompleteness.rhrDays : 0,
            dataCompleteness.stepsDays >= 3 ? dataCompleteness.stepsDays : 0,
            dataCompleteness.sleepDays >= 3 ? dataCompleteness.sleepDays : 0,
        ].filter(d => d > 0);

        // high if: all used core metrics >= 6 days AND (if HRV used) HRV >= 4 AND !atypicalActivity AND smoothingAvailable
        const allUsedMetricsHigh = usedMetricsDays.every(d => d >= 6);
        const hrvOk = !hrvUsed || dataCompleteness.hrvDays >= 4;
        if (allUsedMetricsHigh && hrvOk && !atypicalActivityWeek && !smoothingUnavailable) {
            return 'high';
        }

        // low if: >= 2 used core metrics at minimum (3-4 days) OR atypicalActivity
        const metricsAtMinimum = usedMetricsDays.filter(d => d >= 3 && d <= 4).length;
        if (metricsAtMinimum >= 2 || atypicalActivityWeek) {
            return 'low';
        }

        return 'medium';
    }

    // Legacy logic for backward compatibility
    const meetsSufficiency = dataCompleteness.rhrDays >= 5 &&
        dataCompleteness.stepsDays >= 5 &&
        dataCompleteness.sleepDays >= 5;

    if (!meetsSufficiency) return 'insufficient_data';

    if (smoothingUnavailable) return 'low';

    const highCore = dataCompleteness.rhrDays >= 6 &&
        dataCompleteness.stepsDays >= 6 &&
        dataCompleteness.sleepDays >= 6 &&
        (!hrvUsed || dataCompleteness.hrvDays >= 4);

    if (highCore) return 'high';

    const exactlyFiveCount = [dataCompleteness.rhrDays, dataCompleteness.stepsDays, dataCompleteness.sleepDays]
        .filter(days => days === 5).length;

    if (exactlyFiveCount >= 2) return 'low';
    if (exactlyFiveCount >= 1 || atypicalActivityWeek) return 'medium';
    return 'medium';
}
