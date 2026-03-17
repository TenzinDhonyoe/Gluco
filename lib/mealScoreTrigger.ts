/**
 * Meal Score Trigger — checks for pending meals and calculates scores.
 *
 * Called after:
 * 1. Manual glucose log creation
 * 2. HealthKit glucose sync
 * 3. Home screen load (background check)
 */

import {
    buildMealTokens,
    calculateMealScore,
    glucoseLogsToReadings,
} from '@/lib/mealScore';
import { generateMealInsight, type MealScoreRow } from '@/lib/mealScoreInsights';
import { scheduleMealScoreNotification } from '@/lib/notifications';
import {
    getMealGlucoseWindow,
    getMealItems,
    getRecentMealScores,
    getRecentUnscoredMeals,
    markExperimentTried,
    saveMealScore,
} from '@/lib/supabase';

/**
 * Check for recent unscored meals and calculate scores for any that have
 * sufficient glucose data (>= 3 readings in the 3-hour window).
 */
export async function checkAndScorePendingMeals(userId: string): Promise<void> {
    try {
        const unscoredMeals = await getRecentUnscoredMeals(userId);
        if (unscoredMeals.length === 0) return;

        // Fetch historical scores for insight generation
        const recentScores = await getRecentMealScores(userId, 50);
        const historicalRows: MealScoreRow[] = recentScores.map(s => ({
            meal_id: s.meal_id,
            score: s.score,
            score_label: s.score_label,
            meal_tokens: s.meal_tokens,
            insight_type: s.insight_type,
            window_start: s.window_start,
            meal_name: s.meal_name,
            experiment_suggestion: s.experiment_suggestion,
        }));

        for (const meal of unscoredMeals) {
            try {
                await scoreSingleMeal(userId, meal, historicalRows);
            } catch (error) {
                console.warn(`Failed to score meal ${meal.id}:`, error);
            }
        }
    } catch (error) {
        console.warn('checkAndScorePendingMeals failed:', error);
    }
}

async function scoreSingleMeal(
    userId: string,
    meal: { id: string; name: string; meal_type: string | null; logged_at: string },
    historicalRows: MealScoreRow[],
): Promise<void> {
    // Fetch glucose readings in the meal window
    const glucoseLogs = await getMealGlucoseWindow(userId, meal.logged_at);
    const readings = glucoseLogsToReadings(glucoseLogs);

    // Calculate score (returns sufficient: false if < 3 readings)
    const result = calculateMealScore(readings, new Date(meal.logged_at));
    if (!result.sufficient) return;

    // Build meal tokens for similarity matching
    let items: { display_name: string }[] = [];
    try {
        items = await getMealItems(meal.id);
    } catch (err) {
        console.warn(`Failed to fetch meal items for ${meal.id}:`, err);
    }
    const mealTokens = buildMealTokens(
        meal.name,
        items.map(i => i.display_name),
    );

    // Generate causal insight
    const insight = generateMealInsight(
        meal.name,
        meal.meal_type,
        result,
        mealTokens,
        historicalRows,
    );

    // Calculate window timestamps
    const mealTime = new Date(meal.logged_at);
    const windowStart = new Date(mealTime.getTime() - 15 * 60 * 1000).toISOString();
    const windowEnd = new Date(mealTime.getTime() + 3 * 60 * 60 * 1000).toISOString();

    // Save score (with experiment suggestion if applicable)
    const saved = await saveMealScore(
        userId,
        meal.id,
        result.score,
        result.label,
        result.components,
        result.raw,
        result.readingCount,
        windowStart,
        windowEnd,
        mealTokens,
        insight.text,
        insight.type,
        insight.experimentSuggestion ?? null,
    );

    if (!saved) return;

    // If this insight was an experiment result, mark the original suggestion as "tried"
    if (insight.experimentSuggestion?.tried && insight.experimentSuggestion.result_score_delta != null) {
        // Find the original meal that had the experiment suggestion
        const originalMeal = historicalRows.find(h =>
            h.experiment_suggestion && !h.experiment_suggestion.tried
        );
        if (originalMeal) {
            markExperimentTried(
                originalMeal.meal_id,
                meal.id,
                insight.experimentSuggestion.result_score_delta,
            ).catch(err => console.warn('Meal score notification error:', err));
        }
    }

    // Only notify for recent meals (not stale ones > 4 hours old)
    const mealAgeHours = (Date.now() - mealTime.getTime()) / (60 * 60 * 1000);
    if (mealAgeHours <= 4) {
        const firstSentence = insight.text.split('.')[0] + '.';
        await scheduleMealScoreNotification(
            meal.id,
            meal.name,
            result.score,
            result.label,
            firstSentence,
            userId,
        );
    }
}
