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
    isHealthKitAvailable,
    syncHealthKitGlucoseToLogs,
} from '@/lib/healthkit';
import { checkAndScorePendingMeals } from '@/lib/mealScoreTrigger';
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
    }, [userId, startDateStr, endDateStr]);

    // Sync HealthKit data to database
    // force=true bypasses the dedup guard (used for pull-to-refresh)
    const syncHealthKitData = useCallback(async (force = false) => {
        if (!userId || Platform.OS !== 'ios' || syncInProgress.current) {
            return;
        }

        // Prevent duplicate syncs for the same date range on auto-sync (focus events)
        // Manual refreshes (force=true) always re-query HealthKit
        const syncKey = `${userId}-${startDateStr}-${endDateStr}`;
        if (!force && lastSyncRef.current === syncKey) {
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

            // Upsert per-day records from HealthKit daily breakdowns
            // Build a map of date -> metrics from all breakdowns
            const dayMetrics = new Map<string, {
                steps: number | null;
                active_minutes: number | null;
                sleep_hours: number | null;
                resting_hr: number | null;
                hrv_ms: number | null;
            }>();

            const ensureDay = (date: string) => {
                if (!dayMetrics.has(date)) {
                    dayMetrics.set(date, { steps: null, active_minutes: null, sleep_hours: null, resting_hr: null, hrv_ms: null });
                }
                return dayMetrics.get(date)!;
            };

            stepsData?.dailyBreakdown.forEach(({ date, value }) => { ensureDay(date).steps = value; });
            activeData?.dailyBreakdown.forEach(({ date, value }) => { ensureDay(date).active_minutes = value; });
            sleepData?.dailyBreakdown.forEach(({ date, value }) => { ensureDay(date).sleep_hours = value; });
            hrData?.dailyBreakdown.forEach(({ date, value }) => { ensureDay(date).resting_hr = value; });
            hrvData?.dailyBreakdown.forEach(({ date, value }) => { ensureDay(date).hrv_ms = value; });

            // Upsert all days (bounded concurrency)
            const upsertPromises = Array.from(dayMetrics.entries()).map(([date, metrics]) =>
                upsertDailyContext(userId, {
                    date,
                    steps: metrics.steps,
                    active_minutes: metrics.active_minutes,
                    sleep_hours: metrics.sleep_hours,
                    resting_hr: metrics.resting_hr,
                    hrv_ms: metrics.hrv_ms,
                    source: 'apple_health',
                })
            );
            await Promise.all(upsertPromises);

            // Sync HealthKit glucose readings to glucose_logs, then check for pending meal scores
            if (userId) {
                syncHealthKitGlucoseToLogs(userId, startDate, endDate)
                    .then((count) => {
                        if (count > 0) {
                            checkAndScorePendingMeals(userId).catch(() => {});
                        }
                    })
                    .catch(() => {});
            }

            // Reload from database to get correct aggregated stats
            await loadFromDatabase();

            setStats(prev => ({
                ...prev,
                isSyncing: false,
                lastSyncedAt: new Date(),
                dataSource: 'apple_health',
            }));

            lastSyncRef.current = syncKey;
        } catch (error) {
            console.warn('Error syncing HealthKit data:', error);
            setStats(prev => ({ ...prev, isSyncing: false }));
        } finally {
            syncInProgress.current = false;
        }
    }, [userId, startDateStr, endDateStr, loadFromDatabase]);

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
        sync: () => syncHealthKitData(true),
    };
}
