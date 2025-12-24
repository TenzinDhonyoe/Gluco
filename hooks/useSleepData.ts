/**
 * Hook for fetching and managing sleep data from Apple HealthKit
 * Provides average sleep duration per night for the selected date range
 */

import { getSleepData, initHealthKit, isHealthKitAvailable, SleepStats } from '@/lib/healthkit';
import { getDateRange, RangeKey } from '@/lib/utils/dateRanges';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

export interface SleepData {
    avgHoursPerNight: number;
    totalNights: number;
    totalHours: number;
    isAuthorized: boolean;
    isAvailable: boolean;
}

interface UseSleepDataReturn {
    data: SleepData | null;
    isLoading: boolean;
    error: Error | null;
    refetch: () => Promise<void>;
}

/**
 * Hook to fetch sleep data from HealthKit for the given date range
 * Returns average hours per night, authorization status, and loading state
 */
export function useSleepData(range: RangeKey): UseSleepDataReturn {
    // Initialize with safe default values to prevent crashes
    const [data, setData] = useState<SleepData | null>({
        avgHoursPerNight: 0,
        totalNights: 0,
        totalHours: 0,
        isAuthorized: false,
        isAvailable: Platform.OS === 'ios',
    });
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const fetchSleepData = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            // Check if we're on iOS
            if (Platform.OS !== 'ios') {
                setData({
                    avgHoursPerNight: 0,
                    totalNights: 0,
                    totalHours: 0,
                    isAuthorized: false,
                    isAvailable: false,
                });
                setIsLoading(false);
                return;
            }

            // Check if HealthKit is available
            if (!isHealthKitAvailable()) {
                setData({
                    avgHoursPerNight: 0,
                    totalNights: 0,
                    totalHours: 0,
                    isAuthorized: false,
                    isAvailable: false,
                });
                setIsLoading(false);
                return;
            }
            // Initialize HealthKit and request permissions
            const authorized = await initHealthKit();

            if (!authorized) {
                setData({
                    avgHoursPerNight: 0,
                    totalNights: 0,
                    totalHours: 0,
                    isAuthorized: false,
                    isAvailable: true,
                });
                setIsLoading(false);
                return;
            }

            // Get date range for the query
            const { startDate, endDate } = getDateRange(range);

            // Fetch sleep data from HealthKit
            const sleepStats: SleepStats | null = await getSleepData(startDate, endDate);

            if (sleepStats) {
                setData({
                    avgHoursPerNight: sleepStats.avgMinutesPerNight / 60,
                    totalNights: sleepStats.nights,
                    totalHours: sleepStats.totalMinutes / 60,
                    isAuthorized: true,
                    isAvailable: true,
                });
            } else {
                setData({
                    avgHoursPerNight: 0,
                    totalNights: 0,
                    totalHours: 0,
                    isAuthorized: true,
                    isAvailable: true,
                });
            }
        } catch (err) {
            console.error('Error fetching sleep data:', err);
            setError(err as Error);
            setData({
                avgHoursPerNight: 0,
                totalNights: 0,
                totalHours: 0,
                isAuthorized: false,
                isAvailable: true,
            });
        } finally {
            setIsLoading(false);
        }
    }, [range]);

    // Fetch on mount and screen focus - delay initial fetch slightly to prevent blocking render
    useEffect(() => {
        // Small delay to ensure component renders first
        const timer = setTimeout(() => {
            fetchSleepData();
        }, 100);
        return () => clearTimeout(timer);
    }, [fetchSleepData]);

    // Also fetch on screen focus
    useFocusEffect(
        useCallback(() => {
            fetchSleepData();
        }, [fetchSleepData])
    );

    return {
        data,
        isLoading,
        error,
        refetch: fetchSleepData,
    };
}

/**
 * Standalone function to fetch sleep data without React hooks
 * Useful for integrating into other data fetching hooks
 */
export async function fetchSleepDataForRange(range: RangeKey): Promise<SleepData> {
    // Check if we're on iOS
    if (Platform.OS !== 'ios') {
        return {
            avgHoursPerNight: 0,
            totalNights: 0,
            totalHours: 0,
            isAuthorized: false,
            isAvailable: false,
        };
    }

    // Check if HealthKit is available
    if (!isHealthKitAvailable()) {
        return {
            avgHoursPerNight: 0,
            totalNights: 0,
            totalHours: 0,
            isAuthorized: false,
            isAvailable: false,
        };
    }

    try {
        // Initialize HealthKit and request permissions
        const authorized = await initHealthKit();

        if (!authorized) {
            return {
                avgHoursPerNight: 0,
                totalNights: 0,
                totalHours: 0,
                isAuthorized: false,
                isAvailable: true,
            };
        }

        // Get date range for the query
        const { startDate, endDate } = getDateRange(range);

        // Fetch sleep data from HealthKit
        const sleepStats = await getSleepData(startDate, endDate);

        if (sleepStats) {
            return {
                avgHoursPerNight: sleepStats.avgMinutesPerNight / 60,
                totalNights: sleepStats.nights,
                totalHours: sleepStats.totalMinutes / 60,
                isAuthorized: true,
                isAvailable: true,
            };
        }

        return {
            avgHoursPerNight: 0,
            totalNights: 0,
            totalHours: 0,
            isAuthorized: true,
            isAvailable: true,
        };
    } catch (error) {
        console.error('Error fetching sleep data:', error);
        return {
            avgHoursPerNight: 0,
            totalNights: 0,
            totalHours: 0,
            isAuthorized: false,
            isAvailable: true,
        };
    }
}

