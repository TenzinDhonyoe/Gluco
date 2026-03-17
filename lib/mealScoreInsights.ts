/**
 * Causal Insight Generator for Meal Scores.
 *
 * Generates template-based insights explaining WHY a meal scored the way it did.
 * All text uses safe language (no "spike", "bad", "dangerous" — see health-domain.md).
 */

import { sanitizeInsight } from '@/lib/insights';
import {
    type InsightType,
    type MealScoreResult,
    type ScoreLabel,
    jaccardSimilarity,
} from '@/lib/mealScore';
import type { ExperimentSuggestion } from '@/lib/supabase';

export interface MealScoreRow {
    meal_id: string;
    score: number;
    score_label: string;
    meal_tokens: string[] | null;
    insight_type: string | null;
    window_start: string;
    meal_name?: string;
    experiment_suggestion?: ExperimentSuggestion | null;
}

interface InsightResult {
    text: string;
    type: InsightType;
    experimentSuggestion?: ExperimentSuggestion;
}

// ─── Main Generator ──────────────────────────────────────────────────────────

export function generateMealInsight(
    mealName: string,
    mealType: string | null,
    score: MealScoreResult,
    mealTokens: string[],
    historicalScores: MealScoreRow[],
): InsightResult {
    // 1. Celebration (score >= 75 and in top 25% of recent)
    if (score.score >= 75 && historicalScores.length >= 3) {
        const sorted = [...historicalScores].sort((a, b) => b.score - a.score);
        const top25Threshold = sorted[Math.floor(sorted.length * 0.25)]?.score ?? 75;
        if (score.score >= top25Threshold) {
            const text = sanitizeInsight(
                `Your ${mealName} scored ${score.score} — one of your best recently. This meal pattern clearly works well for you.`
            );
            if (text) return { text, type: 'celebration' };
        }
    }

    // 2. Meal comparison (>= 3 similar meals)
    const similarMeals = historicalScores.filter(h =>
        h.meal_tokens && jaccardSimilarity(mealTokens, h.meal_tokens) >= 0.25
    );
    if (similarMeals.length >= 3) {
        const avgSimilar = Math.round(similarMeals.reduce((s, m) => s + m.score, 0) / similarMeals.length);
        const diff = score.score - avgSimilar;
        const direction = diff > 0 ? 'higher' : 'lower';
        const explanation = diff > 0
            ? 'Something about this version worked well'
            : 'Worth experimenting with different portions or pairings next time';
        const text = sanitizeInsight(
            `Your ${mealName} scored ${score.score} — ${Math.abs(diff)} points ${direction} than your usual (avg ${avgSimilar}). ${explanation}.`
        );
        if (text) return { text, type: 'comparison' };
    }

    // 3. Pattern detection (>= 10 total scores, group by time of day)
    if (historicalScores.length >= 10) {
        const timeGroups = groupByTimeOfDay(historicalScores);
        const currentGroup = getTimeGroup(mealType);
        if (currentGroup && timeGroups[currentGroup]) {
            const currentAvg = timeGroups[currentGroup]!.avg;
            const otherGroups = Object.entries(timeGroups).filter(([k]) => k !== currentGroup);
            for (const [otherName, otherData] of otherGroups) {
                if (Math.abs(currentAvg - otherData.avg) > 10) {
                    const text = sanitizeInsight(
                        `${capitalize(currentGroup)} meals tend to score ${currentAvg > otherData.avg ? 'higher' : 'lower'} for you (avg ${Math.round(currentAvg)}) vs ${otherName} meals (avg ${Math.round(otherData.avg)}). Your body may respond differently at different times.`
                    );
                    if (text) return { text, type: 'pattern' };
                }
            }
        }
    }

    // 4. Check for experiment results — did user try a suggestion from a similar meal?
    const experimentResult = checkForExperimentResult(score, mealTokens, historicalScores);
    if (experimentResult) return experimentResult;

    // 5. Component-based experiment suggestion (default)
    const suggestion = getExperimentSuggestion(score);
    const text = sanitizeInsight(
        `Your ${mealName} scored ${score.score}. ${suggestion.text}`
    );
    if (text) return {
        text,
        type: 'experiment',
        experimentSuggestion: {
            template_slug: suggestion.templateSlug,
            suggestion: suggestion.text,
            weak_component: suggestion.weakComponent,
            tried: false,
            result_meal_id: null,
            result_score_delta: null,
        },
    };

    // Absolute fallback
    return {
        text: `Your ${mealName} scored ${score.score}. Try experimenting with different pairings to see what works best.`,
        type: 'experiment',
        experimentSuggestion: {
            template_slug: null,
            suggestion: 'Try experimenting with different pairings.',
            weak_component: 'general',
            tried: false,
            result_meal_id: null,
            result_score_delta: null,
        },
    };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function groupByTimeOfDay(scores: MealScoreRow[]): Record<string, { avg: number; count: number }> {
    const groups: Record<string, { total: number; count: number }> = {};

    for (const s of scores) {
        const hour = new Date(s.window_start).getHours();
        let group: string;
        if (hour < 11) group = 'morning';
        else if (hour < 15) group = 'midday';
        else if (hour < 19) group = 'evening';
        else group = 'night';

        if (!groups[group]) groups[group] = { total: 0, count: 0 };
        groups[group].total += s.score;
        groups[group].count++;
    }

    const result: Record<string, { avg: number; count: number }> = {};
    for (const [k, v] of Object.entries(groups)) {
        if (v.count >= 2) {
            result[k] = { avg: v.total / v.count, count: v.count };
        }
    }
    return result;
}

function getTimeGroup(mealType: string | null): string | null {
    switch (mealType) {
        case 'breakfast': return 'morning';
        case 'lunch': return 'midday';
        case 'dinner': return 'evening';
        case 'snack': return null;
        default: return null;
    }
}

interface ExperimentSuggestionResult {
    text: string;
    templateSlug: string | null;
    weakComponent: string;
}

function getExperimentSuggestion(score: MealScoreResult): ExperimentSuggestionResult {
    // Suggest based on weakest component, mapped to experiment template slugs
    const { components, raw } = score;

    if (components.peakSpikeScore <= 40 && raw.peakDeltaMgDl !== null) {
        return {
            text: `The glucose response was higher impact (+${Math.round(raw.peakDeltaMgDl)} mg/dL). Try adding protein or fiber next time — it often helps smooth the response.`,
            templateSlug: 'fiber-preload',
            weakComponent: 'peak_spike',
        };
    }

    if (components.returnToBaselineScore <= 40 && raw.returnToBaselineMin !== null) {
        return {
            text: `Recovery took ${raw.returnToBaselineMin} minutes. A short walk after eating often helps your body recover faster.`,
            templateSlug: 'post-meal-walk',
            weakComponent: 'return_to_baseline',
        };
    }

    if (components.variabilityScore <= 40) {
        return {
            text: `Your glucose was less steady than usual. Pairing carbs with protein or healthy fats can help keep things more even.`,
            templateSlug: 'fiber-preload',
            weakComponent: 'variability',
        };
    }

    if (components.timeInRangeScore <= 40) {
        return {
            text: `Try experimenting with portion size or adding a side of vegetables. Small changes can make a noticeable difference.`,
            templateSlug: 'rice-portion-swap',
            weakComponent: 'time_in_range',
        };
    }

    return {
        text: `Try experimenting with different pairings or portions to see what works best for you.`,
        templateSlug: null,
        weakComponent: 'general',
    };
}

/**
 * Check if this meal is a "follow-up" to a previous experiment suggestion.
 * If a similar earlier meal had an experiment suggestion, and this new meal
 * has a different score, generate an experiment result insight.
 */
function checkForExperimentResult(
    score: MealScoreResult,
    mealTokens: string[],
    historicalScores: MealScoreRow[],
): InsightResult | null {
    // Find similar earlier meals that had experiment suggestions
    for (const prev of historicalScores) {
        if (!prev.experiment_suggestion || prev.experiment_suggestion.tried) continue;
        if (!prev.meal_tokens) continue;

        const similarity = jaccardSimilarity(mealTokens, prev.meal_tokens);
        if (similarity < 0.25) continue;

        // Found a similar meal with a pending experiment suggestion
        const delta = score.score - prev.score;
        const absDelta = Math.abs(delta);

        if (absDelta < 5) {
            // Similar score — not a meaningful result
            continue;
        }

        const prevName = prev.meal_name || 'a similar meal';
        const direction = delta > 0 ? 'higher' : 'lower';
        const improvement = delta > 0;

        let resultText: string;
        if (improvement) {
            resultText = `This scored ${absDelta} points ${direction} than ${prevName} (${prev.score}). The change you made seems to be working well for your body.`;
        } else {
            resultText = `This scored ${absDelta} points ${direction} than ${prevName} (${prev.score}). Worth trying a different approach next time.`;
        }

        const text = sanitizeInsight(resultText);
        if (text) {
            return {
                text,
                type: 'comparison',
                // Mark the original suggestion as "tried" (caller handles DB update)
                experimentSuggestion: {
                    ...prev.experiment_suggestion,
                    tried: true,
                    result_meal_id: null, // Will be set by the trigger with the actual meal_id
                    result_score_delta: delta,
                },
            };
        }
    }

    return null;
}

function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}
