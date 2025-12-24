/**
 * Unified data fetching hook for Today screen
 * Batches all database queries to reduce round trips
 */

import { useAuth } from '@/context/AuthContext';
import {
    getActivityLogsByDateRange,
    getFibreIntakeSummary,
    getGlucoseLogsByDateRange,
    getPendingReviews,
    GlucoseLog,
    ActivityLog,
    PostMealReview,
    FibreIntakeSummary,
} from '@/lib/supabase';
import { getDateRange, getExtendedDateRange, RangeKey } from '@/lib/utils/dateRanges';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';

export interface TodayScreenData {
    glucoseLogs: GlucoseLog[];
    activityLogs: ActivityLog[];
    fibreSummary: FibreIntakeSummary | null;
    mealReviews: PostMealReview[];
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
 * Batches queries to reduce database round trips
 */
export function useTodayScreenData(range: RangeKey): TodayScreenData {
    const { user, loading: authLoading } = useAuth();
    const [data, setData] = useState<TodayScreenData>({
        glucoseLogs: [],
        activityLogs: [],
        fibreSummary: null,
        mealReviews: [],
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
            // Get date ranges
            const { startDate, endDate } = getDateRange(range);
            // Extended range for glucose logs (needed for chart comparisons)
            const { startDate: extendedStart } = getExtendedDateRange(range, 2);
            
            // Batch all queries in parallel
            const [glucoseLogs, activityLogs, fibreSummary, mealReviews] = await Promise.all([
                // Fetch extended range for glucose to support period comparisons
                getGlucoseLogsByDateRange(user.id, extendedStart, endDate),
                // Fetch activity logs for current range
                getActivityLogsByDateRange(user.id, startDate, endDate),
                // Fetch fibre summary (maps range appropriately)
                getFibreIntakeSummary(user.id, mapRangeToFibreRange(range)),
                // Fetch pending meal reviews
                getPendingReviews(user.id),
            ]);

            setData({
                glucoseLogs,
                activityLogs,
                fibreSummary,
                mealReviews,
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
    }, [user, range, authLoading]);

    // Fetch on mount and when dependencies change (including when user becomes available)
    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Refetch when screen comes into focus (important for when user becomes available after initial load)
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

