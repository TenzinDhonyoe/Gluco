/**
 * Unified data fetching hook for Today screen
 * Batches all database queries to reduce round trips
 */

import { useAuth } from '@/context/AuthContext';
import {
    ActivityLog,
    FibreIntakeSummary,
    getActivityLogsByDateRange,
    getFibreIntakeSummary,
    getGlucoseLogsByDateRange,
    getMealsWithCheckinsByDateRange,
    GlucoseLog,
    MealWithCheckin,
} from '@/lib/supabase';
import { getDateRange, getExtendedDateRange, RangeKey } from '@/lib/utils/dateRanges';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';

export interface TodayScreenData {
    glucoseLogs: GlucoseLog[];
    activityLogs: ActivityLog[];
    fibreSummary: FibreIntakeSummary | null;
    recentMeals: MealWithCheckin[];
    isLoading: boolean;
    error: Error | null;
}

/**
 * Map RangeKey to FibreRange for fibre intake summary
 */
function mapRangeToFibreRange(range: RangeKey): 'today' | 'week' | 'month' {
    switch (range) {
        case '24h':
            return 'today';
        case '7d':
        case '14d':
            return 'week';
        case '30d':
        case '90d':
            return 'month';
    }
}

/**
 * Unified hook that fetches all data needed for Today screen
 * Always fetches 90d of data to avoid refetching on range changes
 * Components filter the data client-side based on selected range
 */
export function useTodayScreenData(_range: RangeKey): TodayScreenData {
    const { user, loading: authLoading } = useAuth();
    const [data, setData] = useState<TodayScreenData>({
        glucoseLogs: [],
        activityLogs: [],
        fibreSummary: null,
        recentMeals: [],
        isLoading: true,
        error: null,
    });

    const fetchData = useCallback(async () => {
        // Wait for auth to finish loading before attempting to fetch
        if (authLoading) {
            setData(prev => ({ ...prev, isLoading: true }));
            return;
        }

        if (!user) {
            setData(prev => ({ ...prev, isLoading: false }));
            return;
        }

        // Set loading state when starting fetch
        setData(prev => ({ ...prev, isLoading: true }));

        try {
            // Always fetch 90d of data - components filter client-side based on selected range
            // This prevents refetching when user switches between 7d/14d/30d/90d
            const maxRange: RangeKey = '90d';
            const { startDate, endDate } = getDateRange(maxRange);
            // Extended range for glucose logs (needed for chart comparisons)
            const { startDate: extendedStart } = getExtendedDateRange(maxRange, 2);

            // Batch all queries in parallel
            const [glucoseLogs, activityLogs, fibreSummary, recentMeals] = await Promise.all([
                // Fetch extended range for glucose to support period comparisons
                getGlucoseLogsByDateRange(user.id, extendedStart, endDate),
                // Fetch activity logs for max range
                getActivityLogsByDateRange(user.id, startDate, endDate),
                // Fetch fibre summary for max range (month) - components filter client-side
                getFibreIntakeSummary(user.id, 'month'),
                // Fetch meals with check-ins for max range
                getMealsWithCheckinsByDateRange(user.id, startDate, endDate),
            ]);

            setData({
                glucoseLogs,
                activityLogs,
                fibreSummary,
                recentMeals,
                isLoading: false,
                error: null,
            });
        } catch (error) {
            console.error('Error fetching Today screen data:', error);
            setData(prev => ({
                ...prev,
                isLoading: false,
                error: error as Error,
            }));
        }
    }, [user, authLoading]); // No range dependency - always fetch max range once

    // Fetch on mount and when screen comes into focus
    // useFocusEffect runs on mount AND when screen gains focus - no need for separate useEffect
    useFocusEffect(
        useCallback(() => {
            fetchData();
        }, [fetchData])
    );

    return data;
}

/**
 * Get user's target glucose range from profile
 * Returns default values if profile not loaded
 */
export function useGlucoseTargetRange() {
    const { profile } = useAuth();
    const TARGET_MIN_MMOL = 3.9;
    const TARGET_MAX_MMOL = 10.0;

    return {
        targetMin: profile?.target_min ?? TARGET_MIN_MMOL,
        targetMax: profile?.target_max ?? TARGET_MAX_MMOL,
    };
}
