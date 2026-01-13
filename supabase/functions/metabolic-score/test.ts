// supabase/functions/metabolic-score/test.ts
// Unit tests for Metabolic Score Calculator

import { assertEquals, assertExists } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { calculateMetabolicScore, MetabolicScoreInput } from './index.ts';

// Helper to create test data
function createTestInput(overrides: Partial<MetabolicScoreInput> = {}): MetabolicScoreInput {
    return {
        sleepRHR: [62, 60, 63, 61, 62, 60, 64],      // Good RHR ~62 median
        dailySteps: [8500, 9000, 7500, 8000, 9500, 10000, 8200], // Good steps ~8700 mean
        sleepHours: [7.5, 7.2, 7.8, 7.0, 7.5, 7.3, 7.6],        // Good sleep ~7.4 mean
        ...overrides,
    };
}

// ============================================
// TEST: Normal case with all data
// ============================================
Deno.test('calculateMetabolicScore - normal case with good data', () => {
    const input = createTestInput();
    const result = calculateMetabolicScore(input);

    assertExists(result.score);
    assertEquals(result.score !== null, true);
    assertEquals(typeof result.score, 'number');
    assertEquals(result.score >= 0 && result.score <= 100, true);
    assertEquals(result.reason, undefined);
    assertExists(result.components);
    assertExists(result.norms);
    assertExists(result.weightsUsed);
});

// ============================================
// TEST: Missing HRV (optional field)
// ============================================
Deno.test('calculateMetabolicScore - missing HRV', () => {
    const input = createTestInput({
        sleepHRV: undefined,
    });
    const result = calculateMetabolicScore(input);

    assertExists(result.score);
    assertEquals(result.score !== null, true);
    assertEquals(result.components.weeklyHRV, null);
    assertEquals(result.norms?.hrvBadNorm, null);
    // HRV weight should be 0, others redistributed
    assertEquals(result.weightsUsed?.wHRV, 0);
});

// ============================================
// TEST: Missing context (no age, no BMI)
// ============================================
Deno.test('calculateMetabolicScore - missing context', () => {
    const input = createTestInput({
        age: undefined,
        bmi: undefined,
        heightCm: undefined,
        weightKg: undefined,
    });
    const result = calculateMetabolicScore(input);

    assertExists(result.score);
    assertEquals(result.components.age, null);
    assertEquals(result.components.bmi, null);
    assertEquals(result.norms?.contextNorm, 0);
    assertEquals(result.weightsUsed?.wContext, 0);
});

// ============================================
// TEST: With Age and BMI context
// ============================================
Deno.test('calculateMetabolicScore - with age and BMI', () => {
    const input = createTestInput({
        age: 45,
        bmi: 26,
    });
    const result = calculateMetabolicScore(input);

    assertExists(result.score);
    assertEquals(result.components.age, 45);
    assertEquals(result.components.bmi, 26);
    assertEquals(result.norms?.contextNorm !== undefined, true);
    assertEquals(result.weightsUsed?.wContext !== 0, true);
});

// ============================================
// TEST: BMI calculated from height/weight
// ============================================
Deno.test('calculateMetabolicScore - BMI from height/weight', () => {
    const input = createTestInput({
        heightCm: 175,
        weightKg: 80,
    });
    const result = calculateMetabolicScore(input);

    assertExists(result.score);
    // BMI = 80 / (1.75^2) = 26.1
    assertExists(result.components.bmi);
    assertEquals(result.components.bmi! >= 25 && result.components.bmi! <= 27, true);
});

// ============================================
// TEST: Insufficient data (less than 5 points)
// ============================================
Deno.test('calculateMetabolicScore - insufficient data', () => {
    const input = createTestInput({
        sleepRHR: [62, 60, 63, null],  // Only 3 valid
        dailySteps: [8500, 9000, 7500, 8000, 9500],
        sleepHours: [7.5, 7.2, 7.8, 7.0, 7.5],
    });
    const result = calculateMetabolicScore(input);

    assertEquals(result.score, null);
    assertEquals(result.reason, 'insufficient_data');
    assertEquals(result.norms, null);
    assertEquals(result.weightsUsed, null);
});

// ============================================
// TEST: Extremely high RHR (poor health)
// ============================================
Deno.test('calculateMetabolicScore - high RHR', () => {
    const input = createTestInput({
        sleepRHR: [85, 88, 82, 90, 86, 84, 87],  // High RHR ~86 median
    });
    const result = calculateMetabolicScore(input);

    assertExists(result.score);
    // High RHR should result in lower score
    assertEquals(result.score! < 70, true, `Expected score < 70, got ${result.score}`);
    assertEquals(result.norms?.rhrNorm! > 0.9, true, `RHR norm should be > 0.9`);
});

// ============================================
// TEST: Very low steps (sedentary)
// ============================================
Deno.test('calculateMetabolicScore - low steps', () => {
    const input = createTestInput({
        dailySteps: [2000, 2500, 1800, 2200, 1500, 3000, 2000],  // Low ~2150 mean
    });
    const result = calculateMetabolicScore(input);

    assertExists(result.score);
    // Low steps should result in lower score
    assertEquals(result.score! < 70, true, `Expected score < 70, got ${result.score}`);
    assertEquals(result.norms?.stepsBadNorm! > 0.9, true, `Steps bad norm should be > 0.9`);
});

// ============================================
// TEST: Poor sleep (too little)
// ============================================
Deno.test('calculateMetabolicScore - poor sleep (short)', () => {
    const input = createTestInput({
        sleepHours: [5.0, 5.2, 4.8, 5.5, 5.0, 4.5, 5.3],  // Short ~5 mean
    });
    const result = calculateMetabolicScore(input);

    assertExists(result.score);
    // Poor sleep should increase sleep norm
    assertEquals(result.norms?.sleepNorm! > 0.8, true, `Sleep norm should be > 0.8`);
});

// ============================================
// TEST: Poor sleep (too much)
// ============================================
Deno.test('calculateMetabolicScore - poor sleep (long)', () => {
    const input = createTestInput({
        sleepHours: [10, 9.5, 10.2, 9.8, 10, 9.7, 10.5],  // Long ~10 mean
    });
    const result = calculateMetabolicScore(input);

    assertExists(result.score);
    // Too much sleep should also increase sleep norm
    assertEquals(result.norms?.sleepNorm! > 0.8, true, `Sleep norm should be > 0.8`);
});

// ============================================
// TEST: Excellent HRV
// ============================================
Deno.test('calculateMetabolicScore - excellent HRV', () => {
    const input = createTestInput({
        sleepHRV: [75, 80, 72, 78, 82, 70, 76],  // Excellent ~76 median
    });
    const result = calculateMetabolicScore(input);

    assertExists(result.score);
    // Excellent HRV should result in low HRV bad norm
    assertEquals(result.norms?.hrvBadNorm! < 0.15, true, `HRV bad norm should be < 0.15`);
});

// ============================================
// TEST: Poor HRV
// ============================================
Deno.test('calculateMetabolicScore - poor HRV', () => {
    const input = createTestInput({
        sleepHRV: [20, 22, 18, 25, 19, 21, 23],  // Poor ~21 median
    });
    const result = calculateMetabolicScore(input);

    assertExists(result.score);
    // Poor HRV should result in high HRV bad norm
    assertEquals(result.norms?.hrvBadNorm! > 0.95, true, `HRV bad norm should be > 0.95`);
});

// ============================================
// TEST: Outlier removal (extreme values)
// ============================================
Deno.test('calculateMetabolicScore - outlier removal', () => {
    const input = createTestInput({
        // Include extreme outliers that should be trimmed
        sleepRHR: [62, 60, 150, 61, 62, 60, 20],  // 150 and 20 are outliers
        dailySteps: [8500, 9000, 50000, 8000, 9500, 100, 8200],  // 50000 and 100 are outliers
    });
    const result = calculateMetabolicScore(input);

    assertExists(result.score);
    // After trimming outliers, values should be reasonable
    assertEquals(result.components.weeklyRHR! >= 58 && result.components.weeklyRHR! <= 65, true,
        `Weekly RHR ${result.components.weeklyRHR} should be 58-65 after outlier removal`);
});

// ============================================
// TEST: All null values
// ============================================
Deno.test('calculateMetabolicScore - all null values', () => {
    const input: MetabolicScoreInput = {
        sleepRHR: [null, null, null, null, null, null, null],
        dailySteps: [null, null, null, null, null, null, null],
        sleepHours: [null, null, null, null, null, null, null],
    };
    const result = calculateMetabolicScore(input);

    assertEquals(result.score, null);
    assertEquals(result.reason, 'insufficient_data');
});

// ============================================
// TEST: Weight redistribution
// ============================================
Deno.test('calculateMetabolicScore - weight redistribution sums to 1', () => {
    const input = createTestInput();
    const result = calculateMetabolicScore(input);

    assertExists(result.weightsUsed);
    const totalWeight =
        result.weightsUsed.wRHR +
        result.weightsUsed.wSteps +
        result.weightsUsed.wSleep +
        result.weightsUsed.wHRV +
        result.weightsUsed.wContext;

    // Total weight should be approximately 1.0 (allowing for rounding)
    assertEquals(totalWeight >= 0.98 && totalWeight <= 1.02, true,
        `Total weight should be ~1.0, got ${totalWeight}`);
});

// ============================================
// TEST: Score clamping
// ============================================
Deno.test('calculateMetabolicScore - score clamped to 0-100', () => {
    // Create a scenario with all excellent metrics
    const excellentInput = createTestInput({
        sleepRHR: [50, 50, 50, 50, 50, 50, 50],  // Excellent (minimum)
        dailySteps: [15000, 15000, 15000, 15000, 15000, 15000, 15000],  // Excellent (above max)
        sleepHours: [7.5, 7.5, 7.5, 7.5, 7.5, 7.5, 7.5],  // Perfect
        sleepHRV: [90, 90, 90, 90, 90, 90, 90],  // Excellent
    });
    const excellentResult = calculateMetabolicScore(excellentInput);

    assertExists(excellentResult.score);
    assertEquals(excellentResult.score! <= 100, true);
    assertEquals(excellentResult.score! >= 0, true);

    // Create a scenario with all poor metrics
    const poorInput = createTestInput({
        sleepRHR: [95, 95, 95, 95, 95, 95, 95],  // Very poor
        dailySteps: [1000, 1000, 1000, 1000, 1000, 1000, 1000],  // Very poor
        sleepHours: [3, 3, 3, 3, 3, 3, 3],  // Very poor
        sleepHRV: [10, 10, 10, 10, 10, 10, 10],  // Very poor
        age: 70,
        bmi: 40,
    });
    const poorResult = calculateMetabolicScore(poorInput);

    assertExists(poorResult.score);
    assertEquals(poorResult.score! <= 100, true);
    assertEquals(poorResult.score! >= 0, true);
});

console.log('All tests defined. Run with: deno test supabase/functions/metabolic-score/test.ts --allow-net');
