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
}

export type ConfidenceLabel = 'high' | 'medium' | 'low' | 'insufficient_data';

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

/**
 * Calculate Metabolic Response Score v2 from Apple HealthKit metrics.
 * Uses a 7-day window with optional baseline-relative normalization.
 */
export function calculateMetabolicScore(
    input: MetabolicScoreInput,
    baselinePrimary?: MetabolicScoreInput | null,
    baselineFallback?: MetabolicScoreInput | null
): MetabolicScoreCalculation {
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

    if (rhrValid.length < 5 || stepsValid.length < 5 || sleepValid.length < 5) {
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
                bmi: null,
            },
            components: null,
            weightsUsed: null,
            dataCompleteness,
            usedBaseline: { rhr: false, steps: false, sleep: false, hrv: false },
            usedFallbacks: { rhr: false, steps: false, sleep: false, hrv: false },
            atypicalActivityWeek: false,
            mode: 'absolute_fallback',
        };
    }

    const rhrWins = winsorize(input.sleepRHR);
    const stepsWins = winsorize(input.dailySteps);
    const sleepWins = winsorize(input.sleepHours);
    const hrvWins = input.sleepHRV ? winsorize(input.sleepHRV) : [];

    const weeklyRHR = median(rhrWins);
    const weeklySteps = median(stepsWins);
    const weeklySleep = mean(sleepWins);
    const weeklyHRV = hrvWins.length >= 3 ? median(hrvWins) : null;
    const sleepStd = sleepWins.length >= 5 ? stddev(sleepWins) : null;

    let bmi = input.bmi ?? null;
    if (bmi === null && input.heightCm && input.weightKg) {
        const heightM = input.heightCm / 100;
        bmi = input.weightKg / (heightM * heightM);
    }

    const aggregates: WeeklyAggregates = {
        weeklyRHR: weeklyRHR !== null ? round1(weeklyRHR) : null,
        weeklySteps: weeklySteps !== null ? Math.round(weeklySteps) : null,
        weeklySleep: weeklySleep !== null ? round1(weeklySleep) : null,
        weeklyHRV: weeklyHRV !== null ? round1(weeklyHRV) : null,
        sleepStd: sleepStd !== null ? round1(sleepStd) : null,
        age: input.age ?? null,
        bmi: bmi !== null ? round1(bmi) : null,
    };

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

    const mode: 'baseline_relative' | 'absolute_fallback' =
        usedBaseline.rhr || usedBaseline.steps || usedBaseline.sleep || usedBaseline.hrv
            ? 'baseline_relative'
            : 'absolute_fallback';

    const rhrBad = weeklyRHR !== null
        ? (baselineRhr.stats
            ? baselineBadness(weeklyRHR - baselineRhr.stats.median, baselineRhr.stats.iqr, false)
            : clamp01((weeklyRHR - 50) / (85 - 50)))
        : null;

    const stepsBad = weeklySteps !== null
        ? (baselineSteps.stats
            ? baselineBadness(weeklySteps - baselineSteps.stats.median, baselineSteps.stats.iqr, true)
            : clamp01(1 - (weeklySteps - 3000) / (12000 - 3000)))
        : null;

    const sleepDurationBad = weeklySleep !== null
        ? (baselineSleep.stats
            ? baselineBadnessAbs(Math.abs(weeklySleep - baselineSleep.stats.median), baselineSleep.stats.iqr)
            : clamp01(Math.abs(weeklySleep - 7.5) / 2.5))
        : null;

    const sleepRegularityBad = sleepStd !== null ? clamp01(sleepStd / 1.5) : null;
    const sleepBad = sleepDurationBad !== null
        ? (sleepRegularityBad !== null ? 0.7 * sleepDurationBad + 0.3 * sleepRegularityBad : sleepDurationBad)
        : null;

    const hrvBad = weeklyHRV !== null
        ? (baselineHrv.stats
            ? baselineBadness(weeklyHRV - baselineHrv.stats.median, baselineHrv.stats.iqr, true)
            : clamp01(1 - (weeklyHRV - 20) / (80 - 20)))
        : null;

    let atypicalActivityWeek = false;
    const baselineStepsMedian = baselineSteps.stats?.median ?? null;
    if (weeklySteps !== null && baselineStepsMedian !== null && baselineStepsMedian > 0) {
        if (weeklySteps > 2.5 * baselineStepsMedian || weeklySteps < 0.4 * baselineStepsMedian) {
            atypicalActivityWeek = true;
        }
    }

    let wRHR = 0.35;
    let wSteps = 0.30;
    let wSleep = 0.15;
    let wHRV = weeklyHRV !== null ? 0.10 : 0;
    let wContext = (hasAge || hasBmi) ? 0.10 : 0;

    if (atypicalActivityWeek) {
        wSteps *= 0.7;
    }

    const totalActive = wRHR + wSteps + wSleep + wHRV + wContext;
    if (totalActive > 0) {
        const scale = 1.0 / totalActive;
        wRHR *= scale;
        wSteps *= scale;
        wSleep *= scale;
        wHRV *= scale;
        wContext *= scale;
    } else {
        wRHR = 0.4;
        wSteps = 0.35;
        wSleep = 0.25;
    }

    const weightsUsed: MetabolicScoreWeights = {
        wRHR: round2(wRHR),
        wSteps: round2(wSteps),
        wSleep: round2(wSleep),
        wHRV: round2(wHRV),
        wContext: round2(wContext),
    };

    let wearableStrain =
        (rhrBad !== null ? wRHR * rhrBad : 0) +
        (stepsBad !== null ? wSteps * stepsBad : 0) +
        (sleepBad !== null ? wSleep * sleepBad : 0);

    if (hrvBad !== null) {
        wearableStrain += wHRV * hrvBad;
    }

    const contextMultiplier = (hasAge || hasBmi) ? 1 + 0.15 * contextNorm : 1.0;
    const strain = clamp01(wearableStrain * contextMultiplier);
    const score7d = clamp(Math.round(100 * (1 - strain)), 0, 100);

    const components: MetabolicScoreComponentsV2 = {
        rhrBad: rhrBad !== null ? round2(rhrBad) : null,
        stepsBad: stepsBad !== null ? round2(stepsBad) : null,
        sleepBad: sleepBad !== null ? round2(sleepBad) : null,
        hrvBad: hrvBad !== null ? round2(hrvBad) : null,
        contextNorm: round2(contextNorm),
        wearableStrain: round2(wearableStrain),
        contextMultiplier: round2(contextMultiplier),
        strain: round2(strain),
    };

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
    };
}

export function calculateConfidenceLabel(
    dataCompleteness: DataCompleteness,
    hrvUsed: boolean,
    atypicalActivityWeek: boolean,
    smoothingUnavailable: boolean
): ConfidenceLabel {
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
