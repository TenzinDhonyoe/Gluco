import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { checkAndScorePendingMeals } from '@/lib/mealScoreTrigger';
import {
    type MealScore,
    getMealScore,
    getRecentMealScores,
    getMealGlucoseWindow,
    getSimilarMealScores,
    type GlucoseLog,
} from '@/lib/supabase';
import { glucoseLogsToReadings, type GlucoseReading } from '@/lib/mealScore';

// ─── Hook: Recent Meal Scores (for home screen) ─────────────────────────────

export interface MealScoreWithMeta extends MealScore {
    meal_name: string;
    meal_type: string | null;
}

export function useMealScores(userId: string | undefined) {
    const [scores, setScores] = useState<MealScoreWithMeta[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const hasFetched = useRef(false);

    const fetchScores = useCallback(async () => {
        if (!userId) return;
        setIsLoading(true);
        try {
            // Check and score pending meals in background
            checkAndScorePendingMeals(userId).catch(() => {});

            const data = await getRecentMealScores(userId, 5);
            setScores(data);
        } catch (error) {
            console.warn('useMealScores fetch error:', error);
        } finally {
            setIsLoading(false);
        }
    }, [userId]);

    // Fetch on mount
    useEffect(() => {
        if (!hasFetched.current && userId) {
            hasFetched.current = true;
            fetchScores();
        }
    }, [userId, fetchScores]);

    // Refetch on focus
    useFocusEffect(
        useCallback(() => {
            if (hasFetched.current) {
                fetchScores();
            }
        }, [fetchScores])
    );

    return { scores, isLoading, refetch: fetchScores };
}

// ─── Hook: Single Meal Score Detail ──────────────────────────────────────────

export interface MealScoreDetail {
    score: MealScore | null;
    glucoseReadings: GlucoseReading[];
    similarScores: (MealScore & { meal_name: string })[];
    isLoading: boolean;
}

export function useMealScoreDetail(
    mealId: string | undefined,
    userId: string | undefined,
    mealLoggedAt: string | undefined,
    mealTokens: string[] | undefined,
) {
    const [data, setData] = useState<MealScoreDetail>({
        score: null,
        glucoseReadings: [],
        similarScores: [],
        isLoading: true,
    });

    useEffect(() => {
        if (!mealId || !userId) {
            setData(prev => ({ ...prev, isLoading: false }));
            return;
        }

        let cancelled = false;

        async function load() {
            try {
                const [score, glucoseLogs, similar] = await Promise.all([
                    getMealScore(mealId!),
                    mealLoggedAt ? getMealGlucoseWindow(userId!, mealLoggedAt) : Promise.resolve([] as GlucoseLog[]),
                    mealTokens && mealTokens.length > 0
                        ? getSimilarMealScores(userId!, mealTokens, mealId!, 5)
                        : Promise.resolve([]),
                ]);

                if (cancelled) return;

                setData({
                    score,
                    glucoseReadings: glucoseLogsToReadings(glucoseLogs),
                    similarScores: similar,
                    isLoading: false,
                });
            } catch (error) {
                console.warn('useMealScoreDetail error:', error);
                if (!cancelled) {
                    setData(prev => ({ ...prev, isLoading: false }));
                }
            }
        }

        load();
        return () => { cancelled = true; };
    }, [mealId, userId, mealLoggedAt, mealTokens]);

    return data;
}
