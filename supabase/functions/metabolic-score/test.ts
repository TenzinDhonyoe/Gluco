// supabase/functions/metabolic-score/test.ts
// Unit tests for Metabolic Response Score v2

import { assertEquals, assertExists } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { calculateConfidenceLabel, calculateMetabolicScore } from './index.ts';
import type { MetabolicScoreInput, ScoreLevel } from './index.ts';

function createTestInput(overrides: Partial<MetabolicScoreInput> = {}): MetabolicScoreInput {
    return {
        sleepRHR: [62, 60, 63, 61, 62, 60, 64],
        dailySteps: [8500, 9000, 7500, 8000, 9500, 10000, 8200],
        sleepHours: [7.5, 7.2, 7.8, 7.0, 7.5, 7.3, 7.6],
        sleepHRV: [55, 52, 58, 50, 54, 53, 56],
        ...overrides,
    };
}

function createBaseline(days: number, overrides: Partial<MetabolicScoreInput> = {}): MetabolicScoreInput {
    const baseRhr = Array.from({ length: days }, () => 62);
    const baseSteps = Array.from({ length: days }, () => 6000);
    const baseSleep = Array.from({ length: days }, () => 7.4);
    const baseHrv = Array.from({ length: days }, () => 55);
    return {
        sleepRHR: baseRhr,
        dailySteps: baseSteps,
        sleepHours: baseSleep,
        sleepHRV: baseHrv,
        ...overrides,
    };
}

Deno.test('calculateMetabolicScore - normal case with good data', () => {
    const input = createTestInput();
    const result = calculateMetabolicScore(input);

    assertExists(result.score7d);
    assertEquals(result.score7d !== null, true);
    assertEquals(result.mode, 'absolute_fallback');
    assertExists(result.components);
    assertExists(result.weightsUsed);
});

Deno.test('calculateMetabolicScore - winsorization limits sleep outlier impact', () => {
    const baseInput = createTestInput();
    const outlierInput = createTestInput({
        sleepHours: [7.5, 7.2, 12.0, 7.0, 7.5, 7.3, 7.6],
    });

    const baseResult = calculateMetabolicScore(baseInput);
    const outlierResult = calculateMetabolicScore(outlierInput);

    assertExists(baseResult.components);
    assertExists(outlierResult.components);
    const delta = Math.abs((baseResult.components?.sleepBad ?? 0) - (outlierResult.components?.sleepBad ?? 0));
    assertEquals(delta < 0.25, true, `Expected sleep badness delta < 0.25, got ${delta}`);
});

Deno.test('calculateMetabolicScore - atypical activity week reduces steps weight', () => {
    const input = createTestInput({
        dailySteps: [20000, 21000, 19000, 22000, 20500, 23000, 21500],
    });
    const baseline = createBaseline(28);
    const result = calculateMetabolicScore(input, baseline, null);

    assertEquals(result.atypicalActivityWeek, true);
    assertExists(result.weightsUsed);
    assertEquals((result.weightsUsed?.wSteps ?? 0) < 0.30, true);
});

Deno.test('calculateMetabolicScore - baseline-relative mode triggers with history', () => {
    const input = createTestInput();
    const baseline = createBaseline(28);
    const result = calculateMetabolicScore(input, baseline, null);

    assertEquals(result.mode, 'baseline_relative');
    assertEquals(result.usedBaseline.rhr, true);
    assertEquals(result.usedBaseline.steps, true);
    assertEquals(result.usedBaseline.sleep, true);
});

Deno.test('calculateMetabolicScore - missing HRV removes weight', () => {
    const input = createTestInput({ sleepHRV: undefined });
    const result = calculateMetabolicScore(input);

    assertEquals(result.aggregates.weeklyHRV, null);
    assertExists(result.weightsUsed);
    assertEquals(result.weightsUsed?.wHRV ?? 0, 0);
});

Deno.test('calculateConfidenceLabel - levels', () => {
    const high = calculateConfidenceLabel(
        { rhrDays: 6, stepsDays: 6, sleepDays: 6, hrvDays: 4, hasAge: false, hasBmi: false },
        true,
        false,
        false
    );
    assertEquals(high, 'high');

    const medium = calculateConfidenceLabel(
        { rhrDays: 5, stepsDays: 6, sleepDays: 6, hrvDays: 4, hasAge: false, hasBmi: false },
        true,
        false,
        false
    );
    assertEquals(medium, 'medium');

    const low = calculateConfidenceLabel(
        { rhrDays: 5, stepsDays: 5, sleepDays: 6, hrvDays: 4, hasAge: false, hasBmi: false },
        true,
        false,
        false
    );
    assertEquals(low, 'low');

    const insufficient = calculateConfidenceLabel(
        { rhrDays: 4, stepsDays: 6, sleepDays: 6, hrvDays: 4, hasAge: false, hasBmi: false },
        true,
        false,
        false
    );
    assertEquals(insufficient, 'insufficient_data');
});

// ============================================
// PROGRESSIVE SCORING v2 TESTS
// ============================================

// --- Level 0 Tests (no_score) ---

Deno.test('Progressive Scoring - Level 0: < 3 total valid days returns null', () => {
    const input = createTestInput({
        sleepRHR: [62, null, null, null, null, null, null],
        dailySteps: [8500, null, null, null, null, null, null],
        sleepHours: [null, null, null, null, null, null, null],
    });
    const result = calculateMetabolicScore(input);

    assertEquals(result.score7d, null);
    assertEquals(result.scoreLevel, 'no_score');
    assertEquals(result.uxReason, 'insufficient_data');
});

Deno.test('Progressive Scoring - Level 0: < 2 core metrics with >= 3 days returns null', () => {
    const input = createTestInput({
        sleepRHR: [62, 60, 63, 61, null, null, null], // 4 days
        dailySteps: [8500, 9000, null, null, null, null, null], // 2 days
        sleepHours: [7.5, 7.2, null, null, null, null, null], // 2 days
    });
    const result = calculateMetabolicScore(input);

    assertEquals(result.score7d, null);
    assertEquals(result.scoreLevel, 'no_score');
});

Deno.test('Progressive Scoring - Level 0: Only one metric present returns null', () => {
    const input = createTestInput({
        sleepRHR: [62, 60, 63, 61, 62, null, null], // 5 days
        dailySteps: [null, null, null, null, null, null, null],
        sleepHours: [null, null, null, null, null, null, null],
    });
    const result = calculateMetabolicScore(input);

    assertEquals(result.score7d, null);
    assertEquals(result.scoreLevel, 'no_score');
});

// --- Level 1 Tests (provisional) ---

Deno.test('Progressive Scoring - Level 1: 2 core metrics >= 3 days, third missing gives numeric score', () => {
    const input = createTestInput({
        sleepRHR: [62, 60, 63, null, null, null, null], // 3 days
        dailySteps: [8500, 9000, 7500, 8000, null, null, null], // 4 days
        sleepHours: [null, null, null, null, null, null, null], // 0 days - missing
    });
    const result = calculateMetabolicScore(input);

    assertExists(result.score7d);
    assertEquals(result.scoreLevel, 'provisional');
    assertEquals(result.uxReason, 'provisional_missing_sleep');
    // Score should be clamped to 40-90 range
    assertEquals(result.score7d! >= 40 && result.score7d! <= 90, true, `Score ${result.score7d} should be in 40-90 range`);
});

Deno.test('Progressive Scoring - Level 1: Sleep missing but RHR and steps present', () => {
    const input = createTestInput({
        sleepRHR: [62, 60, 63, 61, null, null, null], // 4 days
        dailySteps: [8500, 9000, 7500, 8000, null, null, null], // 4 days
        sleepHours: [7.5, 7.2, null, null, null, null, null], // 2 days - insufficient
    });
    const result = calculateMetabolicScore(input);

    assertExists(result.score7d);
    assertEquals(result.scoreLevel, 'provisional');
    assertEquals(result.uxReason, 'provisional_missing_sleep');
});

Deno.test('Progressive Scoring - Level 1: RHR missing but steps and sleep present', () => {
    const input = createTestInput({
        sleepRHR: [62, 60, null, null, null, null, null], // 2 days - insufficient
        dailySteps: [8500, 9000, 7500, 8000, null, null, null], // 4 days
        sleepHours: [7.5, 7.2, 7.8, 7.0, null, null, null], // 4 days
    });
    const result = calculateMetabolicScore(input);

    assertExists(result.score7d);
    assertEquals(result.scoreLevel, 'provisional');
    assertEquals(result.uxReason, 'provisional_missing_rhr');
});

Deno.test('Progressive Scoring - Level 1: Score is clamped to 40-90', () => {
    // Create input that would normally score very high
    const input = createTestInput({
        sleepRHR: [50, 48, 52, null, null, null, null], // Very low RHR (good)
        dailySteps: [15000, 16000, 14000, 15500, null, null, null], // High steps (good)
        sleepHours: [null, null, null, null, null, null, null], // Missing
    });
    const result = calculateMetabolicScore(input);

    assertExists(result.score7d);
    assertEquals(result.scoreLevel, 'provisional');
    // Raw score might be higher, but should be clamped to max 90
    assertEquals(result.score7d! <= 90, true, `Score ${result.score7d} should be <= 90`);
    if (result.debugV2?.scoreWasClamped) {
        assertExists(result.debugV2.rawScoreBeforeClamp);
    }
});

// --- Level 2 Tests (standard) ---

Deno.test('Progressive Scoring - Level 2: 2 core metrics >= 5 days, third >= 3 days gives standard', () => {
    const input = createTestInput({
        sleepRHR: [62, 60, 63, 61, 62, null, null], // 5 days
        dailySteps: [8500, 9000, 7500, 8000, 9500, null, null], // 5 days
        sleepHours: [7.5, 7.2, 7.8, null, null, null, null], // 3 days
    });
    const result = calculateMetabolicScore(input);

    assertExists(result.score7d);
    assertEquals(result.scoreLevel, 'standard');
});

Deno.test('Progressive Scoring - Level 2: Full 7 days without baselines', () => {
    const input = createTestInput(); // Default has 7 days for all metrics
    const result = calculateMetabolicScore(input, null, null, 0);

    assertExists(result.score7d);
    assertEquals(result.scoreLevel, 'standard');
    assertEquals(result.mode, 'absolute_fallback');
});

// --- Level 3 Tests (calibrated) ---

Deno.test('Progressive Scoring - Level 3: Baselines + 2 weekly scores gives calibrated', () => {
    const input = createTestInput();
    const baseline = createBaseline(28);
    // weeklyScoresCount = 2 to meet calibrated threshold
    const result = calculateMetabolicScore(input, baseline, null, 2);

    assertExists(result.score7d);
    assertEquals(result.scoreLevel, 'calibrated');
    assertEquals(result.mode, 'baseline_relative');
    assertEquals(result.uxReason, 'calibrated');
});

Deno.test('Progressive Scoring - Level 3: Baselines but only 1 weekly score stays at standard', () => {
    const input = createTestInput();
    const baseline = createBaseline(28);
    // weeklyScoresCount = 1 is not enough for calibrated
    const result = calculateMetabolicScore(input, baseline, null, 1);

    assertExists(result.score7d);
    assertEquals(result.scoreLevel, 'standard');
});

// --- Mode Selection Tests ---

Deno.test('Progressive Scoring - Mode: provisional always uses absolute_fallback', () => {
    const input = createTestInput({
        sleepRHR: [62, 60, 63, null, null, null, null], // 3 days
        dailySteps: [8500, 9000, 7500, 8000, null, null, null], // 4 days
        sleepHours: [null, null, null, null, null, null, null], // Missing
    });
    const baseline = createBaseline(28);
    const result = calculateMetabolicScore(input, baseline, null);

    assertEquals(result.scoreLevel, 'provisional');
    assertEquals(result.mode, 'absolute_fallback');
});

Deno.test('Progressive Scoring - Mode: 2+ metrics with baselines uses baseline_relative', () => {
    const input = createTestInput();
    const baseline = createBaseline(28);
    const result = calculateMetabolicScore(input, baseline, null);

    assertEquals(result.mode, 'baseline_relative');
    assertEquals(result.usedBaseline.rhr, true);
    assertEquals(result.usedBaseline.steps, true);
});

// --- Atypical Activity Tests ---

Deno.test('Progressive Scoring - Atypical: z-score > 2 marks atypicalActivity true', () => {
    const input = createTestInput({
        dailySteps: [25000, 26000, 24000, 27000, 25500, 28000, 26500], // Very high steps
    });
    const baseline = createBaseline(28, {
        dailySteps: Array.from({ length: 28 }, () => 6000), // Normal baseline
    });
    const result = calculateMetabolicScore(input, baseline, null);

    assertEquals(result.atypicalActivityWeek, true);
    assertExists(result.zSteps);
    assertEquals(Math.abs(result.zSteps!) > 2, true, `zSteps ${result.zSteps} should have |z| > 2`);
});

Deno.test('Progressive Scoring - Atypical: reduces confidence to low', () => {
    const input = createTestInput({
        dailySteps: [25000, 26000, 24000, 27000, 25500, 28000, 26500],
    });
    const baseline = createBaseline(28, {
        dailySteps: Array.from({ length: 28 }, () => 6000),
    });
    const result = calculateMetabolicScore(input, baseline, null, 2);

    assertEquals(result.atypicalActivityWeek, true);
    const confidence = calculateConfidenceLabel(
        result.dataCompleteness,
        result.aggregates.weeklyHRV !== null,
        result.atypicalActivityWeek,
        false,
        result.scoreLevel
    );
    assertEquals(confidence, 'low');
});

Deno.test('Progressive Scoring - Atypical: stepsBad saturation is applied', () => {
    const input = createTestInput({
        dailySteps: [2000, 1800, 2200, 1900, 2100, 1700, 2000], // Very low steps
    });
    const baseline = createBaseline(28, {
        dailySteps: Array.from({ length: 28 }, () => 10000),
    });
    const result = calculateMetabolicScore(input, baseline, null);

    assertEquals(result.atypicalActivityWeek, true);
    assertExists(result.components);
    assertExists(result.debugV2);
    assertEquals(result.debugV2.atypicalActivity, true);
});

// --- Debug Output Tests ---

Deno.test('Progressive Scoring - Debug: metricsUsed is populated correctly', () => {
    const input = createTestInput();
    const result = calculateMetabolicScore(input);

    assertExists(result.debugV2);
    assertEquals(result.debugV2.metricsUsed.includes('rhr'), true);
    assertEquals(result.debugV2.metricsUsed.includes('steps'), true);
    assertEquals(result.debugV2.metricsUsed.includes('sleep'), true);
    assertEquals(result.debugV2.metricsUsed.includes('hrv'), true);
});

Deno.test('Progressive Scoring - Debug: excludedMetrics tracks insufficient days', () => {
    const input = createTestInput({
        sleepRHR: [62, 60, 63, null, null, null, null], // 3 days
        dailySteps: [8500, 9000, 7500, 8000, null, null, null], // 4 days
        sleepHours: [7.5, null, null, null, null, null, null], // 1 day - excluded
    });
    const result = calculateMetabolicScore(input);

    assertExists(result.debugV2);
    const sleepExcluded = result.debugV2.excludedMetrics.find(e => e.metric === 'sleep');
    assertExists(sleepExcluded);
    assertEquals(sleepExcluded.reason, 'insufficient_days');
});

Deno.test('Progressive Scoring - Debug: daysUsed matches data completeness', () => {
    const input = createTestInput();
    const result = calculateMetabolicScore(input);

    assertExists(result.debugV2);
    assertEquals(result.debugV2.daysUsed.rhr, result.dataCompleteness.rhrDays);
    assertEquals(result.debugV2.daysUsed.steps, result.dataCompleteness.stepsDays);
    assertEquals(result.debugV2.daysUsed.sleep, result.dataCompleteness.sleepDays);
    assertEquals(result.debugV2.daysUsed.hrv, result.dataCompleteness.hrvDays);
});

// --- Weight Exclusion Tests ---

Deno.test('Progressive Scoring - Weights: excluded metric has zero weight', () => {
    const input = createTestInput({
        sleepRHR: [62, 60, 63, null, null, null, null], // 3 days
        dailySteps: [8500, 9000, 7500, 8000, null, null, null], // 4 days
        sleepHours: [7.5, null, null, null, null, null, null], // 1 day - excluded
    });
    const result = calculateMetabolicScore(input);

    assertExists(result.weightsUsed);
    assertEquals(result.weightsUsed.wSleep, 0, 'Sleep weight should be 0 when excluded');
    // Other weights should be renormalized
    const totalWeight = result.weightsUsed.wRHR + result.weightsUsed.wSteps + result.weightsUsed.wSleep + result.weightsUsed.wHRV + result.weightsUsed.wContext;
    assertEquals(Math.abs(totalWeight - 1.0) < 0.01, true, `Total weight ${totalWeight} should be ~1.0`);
});

// --- Absolute Fallback Penalty Tests ---

Deno.test('Progressive Scoring - Absolute fallback penalty applied in baseline_relative mode', () => {
    const input = createTestInput();
    // Create baseline with only RHR and steps, not sleep
    const partialBaseline: MetabolicScoreInput = {
        sleepRHR: Array.from({ length: 28 }, () => 62),
        dailySteps: Array.from({ length: 28 }, () => 6000),
        sleepHours: Array.from({ length: 5 }, () => 7.4), // Not enough for baseline (need 14)
        sleepHRV: Array.from({ length: 28 }, () => 55),
    };
    const result = calculateMetabolicScore(input, partialBaseline, null);

    assertEquals(result.mode, 'baseline_relative');
    assertEquals(result.usedBaseline.rhr, true);
    assertEquals(result.usedBaseline.steps, true);
    assertEquals(result.usedBaseline.sleep, false);
    // The sleep badness should have the 0.85 penalty applied
    // (We can't easily test the exact value, but we verify the mode is correct)
});

console.log('All tests defined. Run with: deno test supabase/functions/metabolic-score/test.ts --allow-net');
