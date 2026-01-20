// Test suite for meal photo analysis pipeline
// This file defines test cases for validating food detection accuracy

export interface TestCase {
    name: string;
    description: string;
    expectedFoods: string[];
    expectedCaloriesRange: [number, number];
    acceptableConfidence: ('low' | 'medium' | 'high')[];
}

// Common food test cases - these should achieve 90%+ accuracy
export const COMMON_FOOD_TEST_CASES: TestCase[] = [
    {
        name: 'apple',
        description: 'Single red apple on a plate',
        expectedFoods: ['apple'],
        expectedCaloriesRange: [70, 130],
        acceptableConfidence: ['medium', 'high'],
    },
    {
        name: 'banana',
        description: 'Single yellow banana',
        expectedFoods: ['banana'],
        expectedCaloriesRange: [85, 140],
        acceptableConfidence: ['medium', 'high'],
    },
    {
        name: 'salad',
        description: 'Mixed green salad with vegetables',
        expectedFoods: ['salad', 'lettuce', 'greens', 'vegetables'],
        expectedCaloriesRange: [30, 350],
        acceptableConfidence: ['low', 'medium', 'high'],
    },
    {
        name: 'sandwich',
        description: 'Deli sandwich with bread and fillings',
        expectedFoods: ['sandwich', 'bread'],
        expectedCaloriesRange: [200, 700],
        acceptableConfidence: ['low', 'medium', 'high'],
    },
    {
        name: 'pasta',
        description: 'Plate of pasta with sauce',
        expectedFoods: ['pasta', 'spaghetti', 'noodles'],
        expectedCaloriesRange: [180, 700],
        acceptableConfidence: ['low', 'medium', 'high'],
    },
    {
        name: 'rice',
        description: 'Bowl of white or brown rice',
        expectedFoods: ['rice'],
        expectedCaloriesRange: [140, 400],
        acceptableConfidence: ['low', 'medium', 'high'],
    },
    {
        name: 'chicken',
        description: 'Grilled or roasted chicken',
        expectedFoods: ['chicken', 'poultry'],
        expectedCaloriesRange: [130, 450],
        acceptableConfidence: ['low', 'medium', 'high'],
    },
    {
        name: 'orange',
        description: 'Single orange fruit',
        expectedFoods: ['orange'],
        expectedCaloriesRange: [50, 100],
        acceptableConfidence: ['medium', 'high'],
    },
    {
        name: 'egg',
        description: 'Fried or scrambled eggs',
        expectedFoods: ['egg', 'eggs'],
        expectedCaloriesRange: [70, 200],
        acceptableConfidence: ['medium', 'high'],
    },
    {
        name: 'pizza',
        description: 'Slice or whole pizza',
        expectedFoods: ['pizza'],
        expectedCaloriesRange: [200, 800],
        acceptableConfidence: ['medium', 'high'],
    },
];

export interface TestResult {
    testCase: TestCase;
    passed: boolean;
    detectedFoods: string[];
    matchedExpectedFood: boolean;
    caloriesInRange: boolean;
    confidenceAcceptable: boolean;
    actualCalories: number | null;
    actualConfidence: string;
    error?: string;
}

export function evaluateTestResult(
    testCase: TestCase,
    result: {
        status: string;
        items: Array<{
            display_name: string;
            confidence: string;
            nutrients: { calories_kcal: number | null };
        }>;
        totals: { calories_kcal: number | null };
    }
): TestResult {
    const detectedFoods = result.items.map(item => item.display_name.toLowerCase());

    // Check if any expected food was detected
    const matchedExpectedFood = testCase.expectedFoods.some(expected =>
        detectedFoods.some(detected => detected.includes(expected.toLowerCase()))
    );

    // Check calorie range
    const actualCalories = result.totals.calories_kcal;
    const caloriesInRange = actualCalories !== null &&
        actualCalories >= testCase.expectedCaloriesRange[0] &&
        actualCalories <= testCase.expectedCaloriesRange[1];

    // Check confidence
    const firstItemConfidence = result.items[0]?.confidence || 'low';
    const confidenceAcceptable = testCase.acceptableConfidence.includes(
        firstItemConfidence as 'low' | 'medium' | 'high'
    );

    const passed = result.status === 'complete' &&
        matchedExpectedFood &&
        (caloriesInRange || actualCalories === null);

    return {
        testCase,
        passed,
        detectedFoods,
        matchedExpectedFood,
        caloriesInRange,
        confidenceAcceptable,
        actualCalories,
        actualConfidence: firstItemConfidence,
    };
}

export function generateTestReport(results: TestResult[]): string {
    const totalTests = results.length;
    const passedTests = results.filter(r => r.passed).length;
    const accuracy = ((passedTests / totalTests) * 100).toFixed(1);

    let report = `
# Meal Photo Analysis Test Report
Generated: ${new Date().toISOString()}

## Summary
- Total Tests: ${totalTests}
- Passed: ${passedTests}
- Failed: ${totalTests - passedTests}
- Accuracy: ${accuracy}%

## Detailed Results

`;

    for (const result of results) {
        const status = result.passed ? '✅ PASS' : '❌ FAIL';
        report += `### ${result.testCase.name} - ${status}
- Expected: ${result.testCase.expectedFoods.join(', ')}
- Detected: ${result.detectedFoods.join(', ') || 'None'}
- Food Match: ${result.matchedExpectedFood ? 'Yes' : 'No'}
- Calories: ${result.actualCalories ?? 'N/A'} (expected: ${result.testCase.expectedCaloriesRange[0]}-${result.testCase.expectedCaloriesRange[1]})
- Confidence: ${result.actualConfidence}
${result.error ? `- Error: ${result.error}` : ''}

`;
    }

    return report;
}
