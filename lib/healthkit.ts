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

// Cache authorization result to prevent repeated native bridge calls
let healthKitAuthorized: boolean | null = null;

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
 * Results are cached to prevent repeated native bridge calls
 */
export async function initHealthKit(): Promise<boolean> {
    // Return cached result if available
    if (healthKitAuthorized !== null) {
        return healthKitAuthorized;
    }

    try {
        const healthKit = getAppleHealthKit();
        if (!healthKit) {
            if (__DEV__) console.warn('HealthKit not available');
            healthKitAuthorized = false;
            return false;
        }

        // Check if Constants exist
        if (!healthKit.Constants || !healthKit.Constants.Permissions) {
            if (__DEV__) console.warn('HealthKit Constants not available');
            healthKitAuthorized = false;
            return false;
        }

        const permissions: HealthKitPermissions = {
            permissions: {
                read: [
                    healthKit.Constants.Permissions.SleepAnalysis,
                    healthKit.Constants.Permissions.StepCount,
                    healthKit.Constants.Permissions.AppleExerciseTime,
                    healthKit.Constants.Permissions.RestingHeartRate,
                    healthKit.Constants.Permissions.HeartRateVariabilitySDNN,
                    healthKit.Constants.Permissions.Workout,
                ],
                write: [],
            },
        };

        return new Promise((resolve) => {
            try {
                healthKit.initHealthKit(permissions, (err: Error | null) => {
                    if (err) {
                        if (__DEV__) console.warn('HealthKit initialization failed:', err);
                        healthKitAuthorized = false;
                        resolve(false);
                        return;
                    }
                    healthKitAuthorized = true;
                    resolve(true);
                });
            } catch (error) {
                if (__DEV__) console.warn('Error calling initHealthKit:', error);
                healthKitAuthorized = false;
                resolve(false);
            }
        });
    } catch (error) {
        if (__DEV__) console.warn('Error in initHealthKit:', error);
        healthKitAuthorized = false;
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

// ============================================
// STEPS
// ============================================

export interface StepsStats {
    totalSteps: number;
    days: number;
    avgStepsPerDay: number;
}

/**
 * Fetch step count data for a given date range
 */
export async function getSteps(
    startDate: Date,
    endDate: Date
): Promise<StepsStats | null> {
    try {
        const healthKit = getAppleHealthKit();
        if (!healthKit) return null;

        if (typeof healthKit.getDailyStepCountSamples !== 'function') {
            console.warn('getDailyStepCountSamples method not available');
            return null;
        }

        return new Promise((resolve) => {
            try {
                const options = {
                    startDate: startDate.toISOString(),
                    endDate: endDate.toISOString(),
                };

                healthKit.getDailyStepCountSamples(
                    options,
                    (err: Error | null, results: Array<{ value: number; startDate: string }> | null) => {
                        if (err || !results) {
                            console.warn('Failed to fetch step samples:', err);
                            resolve(null);
                            return;
                        }

                        if (results.length === 0) {
                            resolve({ totalSteps: 0, days: 0, avgStepsPerDay: 0 });
                            return;
                        }

                        const totalSteps = results.reduce((sum, sample) => sum + sample.value, 0);
                        const days = results.length;
                        const avgStepsPerDay = days > 0 ? Math.round(totalSteps / days) : 0;

                        resolve({ totalSteps, days, avgStepsPerDay });
                    }
                );
            } catch (error) {
                console.warn('Error calling getDailyStepCountSamples:', error);
                resolve(null);
            }
        });
    } catch (error) {
        console.warn('Error in getSteps:', error);
        return null;
    }
}

// ============================================
// ACTIVE MINUTES
// ============================================

export interface ActiveMinutesStats {
    totalMinutes: number;
    days: number;
    avgMinutesPerDay: number;
    source: 'apple_exercise_time' | 'workouts' | null;
}

/**
 * Fetch active minutes - prefers Apple Exercise Time, falls back to workouts
 */
export async function getActiveMinutes(
    startDate: Date,
    endDate: Date
): Promise<ActiveMinutesStats | null> {
    try {
        const healthKit = getAppleHealthKit();
        if (!healthKit) return null;

        // Try Apple Exercise Time first
        const exerciseTime = await getAppleExerciseTime(healthKit, startDate, endDate);
        if (exerciseTime !== null) {
            return exerciseTime;
        }

        // Fallback to workouts duration
        const workoutsTime = await getWorkoutsDuration(healthKit, startDate, endDate);
        return workoutsTime;
    } catch (error) {
        console.warn('Error in getActiveMinutes:', error);
        return null;
    }
}

async function getAppleExerciseTime(
    healthKit: any,
    startDate: Date,
    endDate: Date
): Promise<ActiveMinutesStats | null> {
    if (typeof healthKit.getAppleExerciseTime !== 'function') {
        return null;
    }

    return new Promise((resolve) => {
        try {
            const options = {
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
            };

            healthKit.getAppleExerciseTime(
                options,
                (err: Error | null, results: Array<{ value: number; startDate: string }> | null) => {
                    if (err || !results || results.length === 0) {
                        resolve(null);
                        return;
                    }

                    const totalMinutes = results.reduce((sum, sample) => sum + sample.value, 0);
                    const uniqueDays = new Set(results.map(s => new Date(s.startDate).toDateString()));
                    const days = uniqueDays.size;
                    const avgMinutesPerDay = days > 0 ? Math.round(totalMinutes / days) : 0;

                    resolve({
                        totalMinutes,
                        days,
                        avgMinutesPerDay,
                        source: 'apple_exercise_time',
                    });
                }
            );
        } catch (error) {
            resolve(null);
        }
    });
}

async function getWorkoutsDuration(
    healthKit: any,
    startDate: Date,
    endDate: Date
): Promise<ActiveMinutesStats | null> {
    if (typeof healthKit.getSamples !== 'function') {
        return null;
    }

    return new Promise((resolve) => {
        try {
            const options = {
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
                type: 'Workout',
            };

            healthKit.getSamples(
                options,
                (err: Error | null, results: Array<{ start: string; end: string }> | null) => {
                    if (err || !results || results.length === 0) {
                        resolve(null);
                        return;
                    }

                    let totalMinutes = 0;
                    const uniqueDays = new Set<string>();

                    results.forEach((workout) => {
                        const start = new Date(workout.start).getTime();
                        const end = new Date(workout.end).getTime();
                        totalMinutes += (end - start) / 60000;
                        uniqueDays.add(new Date(workout.start).toDateString());
                    });

                    const days = uniqueDays.size;
                    const avgMinutesPerDay = days > 0 ? Math.round(totalMinutes / days) : 0;

                    resolve({
                        totalMinutes: Math.round(totalMinutes),
                        days,
                        avgMinutesPerDay,
                        source: 'workouts',
                    });
                }
            );
        } catch (error) {
            resolve(null);
        }
    });
}

// ============================================
// RESTING HEART RATE
// ============================================

export interface RestingHeartRateStats {
    avgRestingHR: number;
    days: number;
}

/**
 * Fetch resting heart rate data
 */
export async function getRestingHeartRate(
    startDate: Date,
    endDate: Date
): Promise<RestingHeartRateStats | null> {
    try {
        const healthKit = getAppleHealthKit();
        if (!healthKit) return null;

        if (typeof healthKit.getRestingHeartRate !== 'function') {
            console.warn('getRestingHeartRate method not available');
            return null;
        }

        return new Promise((resolve) => {
            try {
                const options = {
                    startDate: startDate.toISOString(),
                    endDate: endDate.toISOString(),
                };

                healthKit.getRestingHeartRate(
                    options,
                    (err: Error | null, results: Array<{ value: number }> | null) => {
                        if (err || !results || results.length === 0) {
                            resolve(null);
                            return;
                        }

                        const totalHR = results.reduce((sum, sample) => sum + sample.value, 0);
                        const avgRestingHR = Math.round((totalHR / results.length) * 100) / 100;

                        resolve({ avgRestingHR, days: results.length });
                    }
                );
            } catch (error) {
                console.warn('Error calling getRestingHeartRate:', error);
                resolve(null);
            }
        });
    } catch (error) {
        console.warn('Error in getRestingHeartRate:', error);
        return null;
    }
}

// ============================================
// HEART RATE VARIABILITY (HRV)
// ============================================

export interface HRVStats {
    avgHRV: number; // in milliseconds
    days: number;
}

/**
 * Fetch HRV (SDNN) data
 */
export async function getHRV(
    startDate: Date,
    endDate: Date
): Promise<HRVStats | null> {
    try {
        const healthKit = getAppleHealthKit();
        if (!healthKit) return null;

        if (typeof healthKit.getHeartRateVariabilitySamples !== 'function') {
            console.warn('getHeartRateVariabilitySamples method not available');
            return null;
        }

        return new Promise((resolve) => {
            try {
                const options = {
                    startDate: startDate.toISOString(),
                    endDate: endDate.toISOString(),
                };

                healthKit.getHeartRateVariabilitySamples(
                    options,
                    (err: Error | null, results: Array<{ value: number }> | null) => {
                        if (err || !results || results.length === 0) {
                            resolve(null);
                            return;
                        }

                        // HRV is typically in seconds, convert to ms
                        const totalHRV = results.reduce((sum, sample) => sum + sample.value * 1000, 0);
                        const avgHRV = Math.round((totalHRV / results.length) * 100) / 100;

                        resolve({ avgHRV, days: results.length });
                    }
                );
            } catch (error) {
                console.warn('Error calling getHeartRateVariabilitySamples:', error);
                resolve(null);
            }
        });
    } catch (error) {
        console.warn('Error in getHRV:', error);
        return null;
    }
}
