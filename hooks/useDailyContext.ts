/**
 * useDailyContext Hook
 * Fetches HealthKit data, upserts to daily_context table, and returns aggregated stats
 */

import {
    getActiveMinutes,
    getHRV,
    getRestingHeartRate,
    getSleepData,
    getSteps,
    initHealthKit,
    isHealthKitAvailable
} from '@/lib/healthkit';
import {
    DailyContext,
    getDailyContextByRange,
    upsertDailyContext
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
    // Per-day records for trend charts
    dailyRecords: DailyContext[];
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
    dailyRecords: [],
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

    const startDateStr = formatDate(startDate);
    const endDateStr = formatDate(endDate);

    // Sync HealthKit data to database
    const syncHealthKitData = useCallback(async () => {
        if (!userId || Platform.OS !== 'ios' || syncInProgress.current) {
            return;
        }

        // Prevent duplicate syncs for the same date range
        const syncKey = `${userId}-${startDateStr}-${endDateStr}`;
        if (lastSyncRef.current === syncKey) {
            return;
        }

        syncInProgress.current = true;
        setStats(prev => ({ ...prev, isSyncing: true }));

        try {
            // Initialize HealthKit and request permissions
            const isInitialized = await initHealthKit();
            if (!isInitialized) {
                setStats(prev => ({ ...prev, isAuthorized: false, isSyncing: false }));
                syncInProgress.current = false;
                return;
            }

            setStats(prev => ({ ...prev, isAuthorized: true }));

            // Fetch data from HealthKit (Apple Watch syncs via Apple Health)
            const [stepsData, sleepData, activeData, hrData, hrvData] = await Promise.all([
                getSteps(startDate, endDate),
                getSleepData(startDate, endDate),
                getActiveMinutes(startDate, endDate),
                getRestingHeartRate(startDate, endDate),  // Apple Watch resting HR
                getHRV(startDate, endDate),                // Apple Watch HRV
            ]);

            // Calculate daily averages and upsert to database
            // We'll create a single record for the date range with averages
            const today = formatDate(new Date());

            await upsertDailyContext(userId, {
                date: today,
                steps: stepsData?.avgStepsPerDay ?? null,
                active_minutes: activeData?.avgMinutesPerDay ?? null,
                sleep_hours: sleepData?.avgMinutesPerNight ? sleepData.avgMinutesPerNight / 60 : null,
                resting_hr: hrData?.avgRestingHR ?? null,
                hrv_ms: hrvData?.avgHRV ?? null,
                source: 'apple_health',
            });

            // Update state with fetched data
            setStats(prev => ({
                ...prev,
                avgSteps: stepsData?.avgStepsPerDay ?? null,
                avgActiveMinutes: activeData?.avgMinutesPerDay ?? null,
                avgSleepHours: sleepData?.avgMinutesPerNight ? Math.round((sleepData.avgMinutesPerNight / 60) * 10) / 10 : null,
                avgRestingHR: hrData?.avgRestingHR ?? null,
                avgHRV: hrvData?.avgHRV ?? null,
                isSyncing: false,
                lastSyncedAt: new Date(),
                dataSource: 'apple_health',
                daysWithData: stepsData?.days ?? 0,
            }));

            lastSyncRef.current = syncKey;
        } catch (error) {
            console.warn('Error syncing HealthKit data:', error);
            setStats(prev => ({ ...prev, isSyncing: false }));
        } finally {
            syncInProgress.current = false;
        }
    }, [userId, startDateStr, endDateStr]); // Dep on strings, not Date objects

    // Load from database (fast, non-blocking)
    const loadFromDatabase = useCallback(async () => {
        if (!userId) return;

        try {
            const data = await getDailyContextByRange(
                userId,
                startDateStr,
                endDateStr
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
                    dailyRecords: data,
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
    }, [userId, startDateStr, endDateStr]); // Dep on strings, not Date objects

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
