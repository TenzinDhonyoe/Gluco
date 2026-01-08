/**
 * useDailyContext Hook
 * Fetches HealthKit data, upserts to daily_context table, and returns aggregated stats
 */

import {
    isHealthKitAvailable
} from '@/lib/healthkit';
import {
    DailyContext,
    getDailyContextByRange
} from '@/lib/supabase';
import { useIsFocused } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

export interface DailyContextStats {
    // Aggregated averages
    avgSteps: number | null;
    avgActiveMinutes: number | null;
    avgSleepHours: number | null;
    avgRestingHR: number | null;
    avgHRV: number | null;
    // Status flags
    isAvailable: boolean;
    isAuthorized: boolean;
    isLoading: boolean;
    isSyncing: boolean;
    lastSyncedAt: Date | null;
    // Source info
    dataSource: 'apple_health' | 'none';
    daysWithData: number;
}

const defaultStats: DailyContextStats = {
    avgSteps: null,
    avgActiveMinutes: null,
    avgSleepHours: null,
    avgRestingHR: null,
    avgHRV: null,
    isAvailable: false,
    isAuthorized: false,
    isLoading: true,
    isSyncing: false,
    lastSyncedAt: null,
    dataSource: 'none',
    daysWithData: 0,
};

/**
 * Hook for managing daily context (HealthKit) data
 * - Fetches HealthKit data on focus
 * - Upserts to daily_context table
 * - Returns aggregated stats for UI
 */
export function useDailyContext(
    userId: string | undefined,
    startDate: Date,
    endDate: Date
): DailyContextStats & { sync: () => Promise<void> } {
    const [stats, setStats] = useState<DailyContextStats>(defaultStats);
    const isFocused = useIsFocused();
    const syncInProgress = useRef(false);
    const lastSyncRef = useRef<string | null>(null);

    // Format date as YYYY-MM-DD
    const formatDate = (date: Date): string => {
        return date.toISOString().split('T')[0];
    };

    // Sync HealthKit data to database
    const syncHealthKitData = useCallback(async () => {
        if (!userId || Platform.OS !== 'ios' || syncInProgress.current) {
        }

    }, [userId, startDate, endDate]);

    // Load from database (fast, non-blocking)
    const loadFromDatabase = useCallback(async () => {
        if (!userId) return;

        try {
            const data = await getDailyContextByRange(
                userId,
                formatDate(startDate),
                formatDate(endDate)
            );

            if (data.length > 0) {
                // Aggregate from database
                let totalSteps = 0, stepsCount = 0;
                let totalActive = 0, activeCount = 0;
                let totalSleep = 0, sleepCount = 0;
                let totalHR = 0, hrCount = 0;
                let totalHRV = 0, hrvCount = 0;

                data.forEach((d: DailyContext) => {
                    if (d.steps !== null) { totalSteps += d.steps; stepsCount++; }
                    if (d.active_minutes !== null) { totalActive += d.active_minutes; activeCount++; }
                    if (d.sleep_hours !== null) { totalSleep += d.sleep_hours; sleepCount++; }
                    if (d.resting_hr !== null) { totalHR += d.resting_hr; hrCount++; }
                    if (d.hrv_ms !== null) { totalHRV += d.hrv_ms; hrvCount++; }
                });

                setStats(prev => ({
                    ...prev,
                    avgSteps: stepsCount > 0 ? Math.round(totalSteps / stepsCount) : null,
                    avgActiveMinutes: activeCount > 0 ? Math.round(totalActive / activeCount) : null,
                    avgSleepHours: sleepCount > 0 ? Math.round((totalSleep / sleepCount) * 10) / 10 : null,
                    avgRestingHR: hrCount > 0 ? Math.round((totalHR / hrCount) * 10) / 10 : null,
                    avgHRV: hrvCount > 0 ? Math.round((totalHRV / hrvCount) * 100) / 100 : null,
                    isLoading: false,
                    daysWithData: data.length,
                    dataSource: 'apple_health',
                }));
            } else {
                setStats(prev => ({ ...prev, isLoading: false }));
            }
        } catch (error) {
            console.warn('Error loading daily context from database:', error);
            setStats(prev => ({ ...prev, isLoading: false }));
        }
    }, [userId, startDate, endDate]);

    // Check availability on mount
    useEffect(() => {
        if (Platform.OS === 'ios') {
            setStats(prev => ({ ...prev, isAvailable: isHealthKitAvailable() }));
        }
    }, []);

    // Load from database first (fast), then sync if focused
    useEffect(() => {
        if (userId) {
            loadFromDatabase();
        }
    }, [userId, loadFromDatabase]);

    // Sync on focus (non-blocking)
    useEffect(() => {
        if (isFocused && userId && Platform.OS === 'ios') {
            // Delay slightly to not block initial render
            const timeout = setTimeout(() => {
                syncHealthKitData();
            }, 500);
            return () => clearTimeout(timeout);
        }
    }, [isFocused, userId, syncHealthKitData]);

    return {
        ...stats,
        sync: syncHealthKitData,
    };
}
