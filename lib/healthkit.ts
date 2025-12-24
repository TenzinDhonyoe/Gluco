/**
 * Apple HealthKit integration for sleep data
 * Provides functions to initialize HealthKit and fetch sleep analysis data
 */

import { Platform } from 'react-native';

// Type definitions for react-native-health
interface HealthKitPermissions {
    permissions: {
        read: string[];
        write: string[];
    };
}

interface SleepSample {
    id: string;
    value: string; // 'INBED', 'ASLEEP', 'AWAKE', 'CORE', 'DEEP', 'REM'
    startDate: string;
    endDate: string;
    sourceName: string;
    sourceId: string;
}

// Lazy load AppleHealthKit to avoid crashes on non-iOS platforms
let AppleHealthKit: any = null;
let healthKitLoadAttempted = false;
let healthKitLoadError: Error | null = null;

function getAppleHealthKit() {
    if (Platform.OS !== 'ios') return null;
    
    // If we've already tried and failed, don't try again
    if (healthKitLoadAttempted && !AppleHealthKit) {
        return null;
    }
    
    if (!AppleHealthKit && !healthKitLoadAttempted) {
        healthKitLoadAttempted = true;
        try {
            // Use dynamic import to prevent synchronous crashes
            // Check if module exists first
            if (typeof require !== 'undefined') {
                const healthKitModule = require('react-native-health');
                AppleHealthKit = healthKitModule?.default || healthKitModule;
                
                // Verify the module has required methods
                if (!AppleHealthKit || typeof AppleHealthKit.initHealthKit !== 'function') {
                    throw new Error('react-native-health module incomplete');
                }
            } else {
                throw new Error('require not available');
            }
        } catch (error) {
            console.warn('Failed to load react-native-health (this is OK if not properly linked):', error);
            healthKitLoadError = error as Error;
            AppleHealthKit = null;
            return null;
        }
    }
    return AppleHealthKit;
}

/**
 * Initialize HealthKit with sleep analysis permissions
 * Must be called before fetching any health data
 */
export async function initHealthKit(): Promise<boolean> {
    try {
        const healthKit = getAppleHealthKit();
        if (!healthKit) {
            console.warn('HealthKit not available');
            return false;
        }

        // Check if Constants exist
        if (!healthKit.Constants || !healthKit.Constants.Permissions) {
            console.warn('HealthKit Constants not available');
            return false;
        }

        const permissions: HealthKitPermissions = {
            permissions: {
                read: [healthKit.Constants.Permissions.SleepAnalysis],
                write: [],
            },
        };

        return new Promise((resolve) => {
            try {
                healthKit.initHealthKit(permissions, (err: Error | null) => {
                    if (err) {
                        console.warn('HealthKit initialization failed:', err);
                        resolve(false);
                        return;
                    }
                    resolve(true);
                });
            } catch (error) {
                console.warn('Error calling initHealthKit:', error);
                resolve(false);
            }
        });
    } catch (error) {
        console.warn('Error in initHealthKit:', error);
        return false;
    }
}

/**
 * Check if HealthKit is available on this device
 */
export function isHealthKitAvailable(): boolean {
    if (Platform.OS !== 'ios') return false;
    const healthKit = getAppleHealthKit();
    return healthKit !== null;
}

export interface SleepStats {
    totalMinutes: number;
    nights: number;
    avgMinutesPerNight: number;
}

/**
 * Fetch sleep data for a given date range
 * Returns total sleep time, number of nights tracked, and average per night
 */
export async function getSleepData(
    startDate: Date,
    endDate: Date
): Promise<SleepStats | null> {
    try {
        const healthKit = getAppleHealthKit();
        if (!healthKit) return null;

        // Check if getSleepSamples method exists
        if (typeof healthKit.getSleepSamples !== 'function') {
            console.warn('getSleepSamples method not available');
            return null;
        }

        return new Promise((resolve) => {
            try {
                const options = {
                    startDate: startDate.toISOString(),
                    endDate: endDate.toISOString(),
                    limit: 1000, // Reasonable limit for sleep samples
                };

                healthKit.getSleepSamples(
                    options,
                    (err: Error | null, results: SleepSample[] | null) => {
                        if (err || !results) {
                            console.warn('Failed to fetch sleep samples:', err);
                            resolve(null);
                            return;
                        }

                // Filter for actual sleep samples (ASLEEP, CORE, DEEP, REM)
                // Exclude INBED and AWAKE as they don't represent actual sleep
                const sleepValues = ['ASLEEP', 'CORE', 'DEEP', 'REM'];
                const sleepSamples = results.filter((s) =>
                    sleepValues.includes(s.value)
                );

                if (sleepSamples.length === 0) {
                    resolve({
                        totalMinutes: 0,
                        nights: 0,
                        avgMinutesPerNight: 0,
                    });
                    return;
                }

                // Calculate total sleep duration in minutes
                const totalMinutes = sleepSamples.reduce((sum, sample) => {
                    const start = new Date(sample.startDate).getTime();
                    const end = new Date(sample.endDate).getTime();
                    const durationMinutes = (end - start) / 60000;
                    return sum + durationMinutes;
                }, 0);

                // Count unique nights by grouping samples by their start date
                // A "night" is determined by the date when sleep started
                const uniqueNights = new Set(
                    sleepSamples.map((sample) => {
                        const date = new Date(sample.startDate);
                        // Adjust for sleep that starts late at night
                        // If sleep starts between midnight and 6am, consider it part of previous night
                        if (date.getHours() < 6) {
                            date.setDate(date.getDate() - 1);
                        }
                        return date.toDateString();
                    })
                );

                const nights = uniqueNights.size;
                const avgMinutesPerNight = nights > 0 ? totalMinutes / nights : 0;

                resolve({
                    totalMinutes,
                    nights,
                    avgMinutesPerNight,
                });
                    }
                );
            } catch (error) {
                console.warn('Error calling getSleepSamples:', error);
                resolve(null);
            }
        });
    } catch (error) {
        console.warn('Error in getSleepData:', error);
        return null;
    }
}

/**
 * Request authorization for HealthKit
 * This will show the iOS permission dialog if not already granted
 */
export async function requestHealthKitAuthorization(): Promise<boolean> {
    return initHealthKit();
}

