/**
 * Wellness Score
 *
 * Client-side composite score (0-100) available from Day 1.
 * Separate from Metabolic Score (which requires 5+ days of HealthKit data).
 *
 * Components:
 *   - Logging consistency (40%): fraction of last 7 days with at least 1 meal logged
 *   - Energy/mood trends  (30%): average daily check-in energy (1-5 → 0-100) + mood bonus
 *   - Meal timing         (30%): consistency of first-meal time across days
 */

import type { MealWithCheckin, DailyCheckin } from './supabase';

// ============================================
// TYPES
// ============================================

export interface WellnessScoreResult {
    score: number;            // 0-100
    loggingScore: number;     // 0-100
    energyScore: number;      // 0-100
    timingScore: number;      // 0-100
    daysWithData: number;
    trend: 'up' | 'down' | 'steady';
}

// ============================================
// SCORING
// ============================================

const LOGGING_WEIGHT = 0.4;
const ENERGY_WEIGHT = 0.3;
const TIMING_WEIGHT = 0.3;

function toDateKey(d: Date): string {
    return d.toISOString().split('T')[0];
}

/**
 * Compute wellness score from recent meals and daily check-ins.
 *
 * @param meals     Last 7-14 days of meals
 * @param checkins  Daily check-ins for the same window
 * @param windowDays  Number of days to score over (default 7)
 */
export function computeWellnessScore(
    meals: MealWithCheckin[],
    checkins: DailyCheckin[],
    windowDays = 7
): WellnessScoreResult {
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - windowDays);

    // 1. Logging consistency (40%)
    const mealDays = new Set<string>();
    for (const meal of meals) {
        const day = new Date(meal.logged_at).toISOString().split('T')[0];
        if (day >= toDateKey(startDate)) mealDays.add(day);
    }
    const checkinDays = new Set<string>();
    for (const c of checkins) {
        if (c.completed_at && c.date >= toDateKey(startDate)) checkinDays.add(c.date);
    }
    const activeDays = new Set([...mealDays, ...checkinDays]);
    const daysWithData = activeDays.size;
    const loggingScore = Math.round((daysWithData / windowDays) * 100);

    // 2. Energy / mood trends (30%)
    let energySum = 0;
    let energyCount = 0;
    let moodBonus = 0;
    let moodCount = 0;

    for (const c of checkins) {
        if (c.date < toDateKey(startDate)) continue;
        if (c.energy_level != null) {
            energySum += c.energy_level;
            energyCount++;
        }
        if (c.mood_tag) {
            moodCount++;
            if (c.mood_tag === 'great') moodBonus += 100;
            else if (c.mood_tag === 'good') moodBonus += 75;
            else if (c.mood_tag === 'okay') moodBonus += 50;
            else moodBonus += 25; // 'low'
        }
    }

    // Also incorporate meal check-in energy
    for (const meal of meals) {
        const day = new Date(meal.logged_at).toISOString().split('T')[0];
        if (day < toDateKey(startDate)) continue;
        const checkin = meal.meal_checkins?.[0];
        if (checkin?.energy) {
            const energyMap: Record<string, number> = { low: 1, moderate: 3, high: 5 };
            const val = energyMap[checkin.energy];
            if (val) {
                energySum += val;
                energyCount++;
            }
        }
    }

    let energyScore: number;
    if (energyCount > 0) {
        const avgEnergy = energySum / energyCount; // 1-5
        const normalizedEnergy = ((avgEnergy - 1) / 4) * 100; // 0-100
        const avgMood = moodCount > 0 ? moodBonus / moodCount : 50;
        energyScore = Math.round(normalizedEnergy * 0.7 + avgMood * 0.3);
    } else {
        energyScore = 50; // neutral default
    }

    // 3. Meal timing consistency (30%)
    const firstMealTimes: number[] = [];
    const mealsByDay = new Map<string, number[]>();
    for (const meal of meals) {
        const dt = new Date(meal.logged_at);
        const day = toDateKey(dt);
        if (day < toDateKey(startDate)) continue;
        const minutesFromMidnight = dt.getHours() * 60 + dt.getMinutes();
        if (!mealsByDay.has(day)) mealsByDay.set(day, []);
        mealsByDay.get(day)!.push(minutesFromMidnight);
    }
    for (const [, times] of mealsByDay) {
        firstMealTimes.push(Math.min(...times));
    }

    let timingScore: number;
    if (firstMealTimes.length >= 2) {
        const mean = firstMealTimes.reduce((a, b) => a + b, 0) / firstMealTimes.length;
        const variance =
            firstMealTimes.reduce((sum, t) => sum + (t - mean) ** 2, 0) / firstMealTimes.length;
        const stdDev = Math.sqrt(variance);
        // Perfect consistency = 0 stddev → 100, 120 min stddev → 0
        timingScore = Math.round(Math.max(0, 100 - (stdDev / 120) * 100));
    } else {
        timingScore = 50; // not enough data
    }

    // Composite
    const score = Math.round(
        loggingScore * LOGGING_WEIGHT +
        energyScore * ENERGY_WEIGHT +
        timingScore * TIMING_WEIGHT
    );

    // Trend: compare first half vs second half of the window
    const halfPoint = toDateKey(
        new Date(startDate.getTime() + (now.getTime() - startDate.getTime()) / 2)
    );
    let firstHalf = 0;
    let secondHalf = 0;
    let fCount = 0;
    let sCount = 0;
    for (const day of activeDays) {
        if (day < halfPoint) { firstHalf++; fCount++; }
        else { secondHalf++; sCount++; }
    }
    const fRate = fCount > 0 ? firstHalf / Math.ceil(windowDays / 2) : 0;
    const sRate = sCount > 0 ? secondHalf / Math.ceil(windowDays / 2) : 0;
    const trend: 'up' | 'down' | 'steady' =
        sRate - fRate > 0.15 ? 'up' : fRate - sRate > 0.15 ? 'down' : 'steady';

    return {
        score: Math.min(100, Math.max(0, score)),
        loggingScore: Math.min(100, Math.max(0, loggingScore)),
        energyScore: Math.min(100, Math.max(0, energyScore)),
        timingScore: Math.min(100, Math.max(0, timingScore)),
        daysWithData,
        trend,
    };
}
