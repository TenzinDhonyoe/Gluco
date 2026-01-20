// supabase/functions/metabolic-score/test.ts
// Unit tests for Metabolic Response Score v2

import { assertEquals, assertExists } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { calculateConfidenceLabel, calculateMetabolicScore } from './index.ts';
import type { MetabolicScoreInput } from './index.ts';

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

console.log('All tests defined. Run with: deno test supabase/functions/metabolic-score/test.ts --allow-net');
