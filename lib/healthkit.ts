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

// Load AppleHealthKit at module level for iOS
let AppleHealthKit: any = null;

if (Platform.OS === 'ios') {
    try {
        const hkModule = require('react-native-health');
        AppleHealthKit = hkModule.default || hkModule;
    } catch (e) {
        console.warn('Failed to load react-native-health:', e);
    }
}

// Cache authorization result to prevent repeated native bridge calls
let healthKitAuthorized: boolean | null = null;

function getAppleHealthKit() {
    if (Platform.OS !== 'ios') return null;
    return AppleHealthKit;
}

/** Per-day value for a single metric */
export interface DailyBreakdownEntry {
    date: string; // YYYY-MM-DD
    value: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Extract YYYY-MM-DD from an ISO date string */
function toDateKey(isoDate: string): string {
    return isoDate.split('T')[0];
}

function getDateRangeDays(startDate: Date, endDate: Date): number {
    const start = new Date(startDate);
    const end = new Date(endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    const diffDays = Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
    return Math.max(1, diffDays);
}

/**
 * Initialize HealthKit with sleep analysis permissions
 * Must be called before fetching any health data
 * Results are cached to prevent repeated native bridge calls
 */
export async function initHealthKit(): Promise<boolean> {
    // Return cached result ONLY if it's true (already authorized)
    // If it's false/null, we should check again or try to authorize
    if (healthKitAuthorized === true) {
        return true;
    }

    try {
        const healthKit = getAppleHealthKit();
        if (!healthKit) {
            if (__DEV__) console.warn('HealthKit not available');
            // Do not cache false here, as it might become available later (unlikely but safe)
            return false;
        }
        if (typeof healthKit.initHealthKit !== 'function') {
            if (__DEV__) {
                console.warn('HealthKit native module not initialized');
                console.log('Available keys:', Object.keys(healthKit));
            }
            return false;
        }

        // Check if Constants exist
        if (!healthKit.Constants || !healthKit.Constants.Permissions) {
            if (__DEV__) console.warn('HealthKit Constants not available');
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
                    healthKit.Constants.Permissions.BloodGlucose,
                ],
                write: [],
            },
        };

        return new Promise((resolve) => {
            try {
                healthKit.initHealthKit(permissions, (err: Error | null) => {
                    if (err) {
                        if (__DEV__) console.warn('HealthKit initialization failed:', err);
                        resolve(false);
                        return;
                    }
                    healthKitAuthorized = true;
                    resolve(true);
                });
            } catch (error) {
                if (__DEV__) console.warn('Error calling initHealthKit:', error);
                resolve(false);
            }
        });
    } catch (error) {
        if (__DEV__) console.warn('Error in initHealthKit:', error);
        return false;
    }
}

/**
 * Check if HealthKit is available on this device
 */
export function isHealthKitAvailable(): boolean {
    if (Platform.OS !== 'ios') return false;
    const healthKit = getAppleHealthKit();
    return !!healthKit && typeof healthKit.initHealthKit === 'function';
}

export interface SleepStats {
    totalMinutes: number;
    nights: number;
    avgMinutesPerNight: number;
    dailyBreakdown: DailyBreakdownEntry[]; // value = sleep hours per night
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
                        // Fall back to INBED if no true sleep stages exist.
                        const sleepValues = ['ASLEEP', 'ASLEEP_UNSPECIFIED', 'CORE', 'DEEP', 'REM'];
                        const sleepSamples = results.filter((s) => sleepValues.includes(s.value));
                        const inBedSamples = results.filter((s) => s.value === 'INBED');
                        const effectiveSamples = sleepSamples.length > 0 ? sleepSamples : inBedSamples;

                        if (effectiveSamples.length === 0) {
                            resolve({
                                totalMinutes: 0,
                                nights: 0,
                                avgMinutesPerNight: 0,
                                dailyBreakdown: [],
                            });
                            return;
                        }

                        // Group sleep samples by night date
                        // A "night" is determined by when sleep started; if between midnight and 6am, attribute to previous day
                        const nightMinutesMap = new Map<string, number>();

                        effectiveSamples.forEach((sample) => {
                            const sampleStart = new Date(sample.startDate);
                            const sampleEnd = new Date(sample.endDate);
                            const durationMinutes = (sampleEnd.getTime() - sampleStart.getTime()) / 60000;

                            // Determine night date
                            const nightDate = new Date(sampleStart);
                            if (nightDate.getHours() < 6) {
                                nightDate.setDate(nightDate.getDate() - 1);
                            }
                            const dateKey = toDateKey(nightDate.toISOString());

                            nightMinutesMap.set(dateKey, (nightMinutesMap.get(dateKey) ?? 0) + durationMinutes);
                        });

                        // Calculate totals
                        let totalMinutes = 0;
                        nightMinutesMap.forEach((mins) => { totalMinutes += mins; });

                        const nights = nightMinutesMap.size;
                        const avgMinutesPerNight = nights > 0 ? totalMinutes / nights : 0;

                        // Build daily breakdown (value = sleep hours)
                        const dailyBreakdown: DailyBreakdownEntry[] = [];
                        nightMinutesMap.forEach((mins, dateKey) => {
                            dailyBreakdown.push({ date: dateKey, value: Math.round((mins / 60) * 10) / 10 });
                        });

                        resolve({
                            totalMinutes,
                            nights,
                            avgMinutesPerNight,
                            dailyBreakdown,
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
    dailyBreakdown: DailyBreakdownEntry[]; // value = steps per day
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
                    period: 1440, // Daily buckets (minutes)
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
                            resolve({ totalSteps: 0, days: 0, avgStepsPerDay: 0, dailyBreakdown: [] });
                            return;
                        }

                        // Group by date (daily buckets may have multiple entries per day)
                        const dayStepsMap = new Map<string, number>();
                        results.forEach((sample) => {
                            const dateKey = toDateKey(sample.startDate);
                            dayStepsMap.set(dateKey, (dayStepsMap.get(dateKey) ?? 0) + sample.value);
                        });

                        const totalSteps = results.reduce((sum, sample) => sum + sample.value, 0);
                        const days = dayStepsMap.size;
                        const avgStepsPerDay = days > 0 ? Math.round(totalSteps / days) : 0;

                        const dailyBreakdown: DailyBreakdownEntry[] = [];
                        dayStepsMap.forEach((steps, dateKey) => {
                            dailyBreakdown.push({ date: dateKey, value: Math.round(steps) });
                        });

                        resolve({ totalSteps, days, avgStepsPerDay, dailyBreakdown });
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
    dailyBreakdown: DailyBreakdownEntry[]; // value = active minutes per day
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

                    // Group by date
                    const dayMinutesMap = new Map<string, number>();
                    results.forEach((sample) => {
                        const dateKey = toDateKey(sample.startDate);
                        dayMinutesMap.set(dateKey, (dayMinutesMap.get(dateKey) ?? 0) + sample.value);
                    });

                    const totalMinutes = results.reduce((sum, sample) => sum + sample.value, 0);
                    const rangeDays = getDateRangeDays(startDate, endDate);
                    const avgMinutesPerDay = rangeDays > 0 ? Math.round(totalMinutes / rangeDays) : 0;

                    const dailyBreakdown: DailyBreakdownEntry[] = [];
                    dayMinutesMap.forEach((mins, dateKey) => {
                        dailyBreakdown.push({ date: dateKey, value: Math.round(mins) });
                    });

                    resolve({
                        totalMinutes,
                        days: rangeDays,
                        avgMinutesPerDay,
                        source: 'apple_exercise_time',
                        dailyBreakdown,
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
                    const rangeDays = getDateRangeDays(startDate, endDate);
                    const dayMinutesMap = new Map<string, number>();

                    results.forEach((workout) => {
                        const wStart = new Date(workout.start).getTime();
                        const wEnd = new Date(workout.end).getTime();
                        const mins = (wEnd - wStart) / 60000;
                        totalMinutes += mins;

                        const dateKey = toDateKey(workout.start);
                        dayMinutesMap.set(dateKey, (dayMinutesMap.get(dateKey) ?? 0) + mins);
                    });

                    const avgMinutesPerDay = rangeDays > 0 ? Math.round(totalMinutes / rangeDays) : 0;

                    const dailyBreakdown: DailyBreakdownEntry[] = [];
                    dayMinutesMap.forEach((mins, dateKey) => {
                        dailyBreakdown.push({ date: dateKey, value: Math.round(mins) });
                    });

                    resolve({
                        totalMinutes: Math.round(totalMinutes),
                        days: rangeDays,
                        avgMinutesPerDay,
                        source: 'workouts',
                        dailyBreakdown,
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
    dailyBreakdown: DailyBreakdownEntry[]; // value = resting HR (bpm) per day
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
                    (err: Error | null, results: Array<{ value: number; startDate: string }> | null) => {
                        if (err || !results || results.length === 0) {
                            resolve(null);
                            return;
                        }

                        // Group by date (average if multiple readings per day)
                        const dayHRMap = new Map<string, { total: number; count: number }>();
                        results.forEach((sample) => {
                            const dateKey = toDateKey(sample.startDate);
                            const entry = dayHRMap.get(dateKey) ?? { total: 0, count: 0 };
                            entry.total += sample.value;
                            entry.count++;
                            dayHRMap.set(dateKey, entry);
                        });

                        const totalHR = results.reduce((sum, sample) => sum + sample.value, 0);
                        const avgRestingHR = Math.round((totalHR / results.length) * 100) / 100;

                        const dailyBreakdown: DailyBreakdownEntry[] = [];
                        dayHRMap.forEach(({ total, count }, dateKey) => {
                            dailyBreakdown.push({ date: dateKey, value: Math.round((total / count) * 10) / 10 });
                        });

                        resolve({ avgRestingHR, days: dayHRMap.size, dailyBreakdown });
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
    dailyBreakdown: DailyBreakdownEntry[]; // value = HRV (ms) per day
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
                    (err: Error | null, results: Array<{ value: number; startDate: string }> | null) => {
                        if (err || !results || results.length === 0) {
                            resolve(null);
                            return;
                        }

                        // HRV is typically in seconds, convert to ms
                        // Group by date (average if multiple readings per day)
                        const dayHRVMap = new Map<string, { total: number; count: number }>();
                        results.forEach((sample) => {
                            const dateKey = toDateKey(sample.startDate);
                            const entry = dayHRVMap.get(dateKey) ?? { total: 0, count: 0 };
                            entry.total += sample.value * 1000;
                            entry.count++;
                            dayHRVMap.set(dateKey, entry);
                        });

                        const totalHRV = results.reduce((sum, sample) => sum + sample.value * 1000, 0);
                        const avgHRV = Math.round((totalHRV / results.length) * 100) / 100;

                        const dailyBreakdown: DailyBreakdownEntry[] = [];
                        dayHRVMap.forEach(({ total, count }, dateKey) => {
                            dailyBreakdown.push({ date: dateKey, value: Math.round((total / count) * 100) / 100 });
                        });

                        resolve({ avgHRV, days: dayHRVMap.size, dailyBreakdown });
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

// ============================================
// BLOOD GLUCOSE
// ============================================

export interface GlucoseSample {
    id: string;
    value: number;
    unit: 'mmolPerL' | 'mgPerdL';
    startDate: string;
    endDate: string;
    sourceName: string;
    mealTime?: 'preprandial' | 'postprandial' | null;
}

export interface GlucoseSamplesStats {
    samples: GlucoseSample[];
    count: number;
    source: 'healthkit';
}

/**
 * Fetch blood glucose samples from HealthKit (CGM or manual entries).
 * Returns raw samples sorted by startDate ascending.
 */
export async function getBloodGlucoseSamples(
    startDate: Date,
    endDate: Date,
    unit: 'mmolPerL' | 'mgPerdL' = 'mgPerdL',
): Promise<GlucoseSamplesStats | null> {
    try {
        const healthKit = getAppleHealthKit();
        if (!healthKit) return null;

        if (typeof healthKit.getBloodGlucoseSamples !== 'function') {
            console.warn('getBloodGlucoseSamples method not available');
            return null;
        }

        return new Promise((resolve) => {
            try {
                const options = {
                    startDate: startDate.toISOString(),
                    endDate: endDate.toISOString(),
                    unit,
                };

                healthKit.getBloodGlucoseSamples(
                    options,
                    (err: Error | null, results: GlucoseSample[] | null) => {
                        if (err || !results || results.length === 0) {
                            resolve(null);
                            return;
                        }

                        // Sort by startDate ascending
                        const sorted = results.sort(
                            (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
                        );

                        resolve({
                            samples: sorted,
                            count: sorted.length,
                            source: 'healthkit',
                        });
                    }
                );
            } catch (error) {
                console.warn('Error calling getBloodGlucoseSamples:', error);
                resolve(null);
            }
        });
    } catch (error) {
        console.warn('Error in getBloodGlucoseSamples:', error);
        return null;
    }
}

/**
 * Sync HealthKit glucose samples to the glucose_logs table.
 * Deduplicates by timestamp (±1 min) and value similarity.
 * Returns count of new readings inserted.
 */
export async function syncHealthKitGlucoseToLogs(
    userId: string,
    startDate: Date,
    endDate: Date,
): Promise<number> {
    try {
        // Fetch from HealthKit in mmol/L (DB storage format)
        const stats = await getBloodGlucoseSamples(startDate, endDate, 'mmolPerL');
        if (!stats || stats.samples.length === 0) return 0;

        // Dynamic import to avoid circular dependency
        const { createGlucoseLog, getGlucoseLogsByDateRange } = await import('@/lib/supabase');

        // Fetch existing logs for dedup
        const existingLogs = await getGlucoseLogsByDateRange(userId, startDate, endDate);

        let insertedCount = 0;
        for (const sample of stats.samples) {
            const sampleTime = new Date(sample.startDate);

            // Dedup: check if a log exists within 1 min and similar value
            const isDuplicate = existingLogs.some(log => {
                const logTime = new Date(log.logged_at);
                const timeDiffMs = Math.abs(sampleTime.getTime() - logTime.getTime());
                const valueDiff = Math.abs(sample.value - log.glucose_level);
                return timeDiffMs < 60000 && valueDiff < 0.2; // 1 min, 0.2 mmol/L tolerance
            });

            if (isDuplicate) continue;

            const result = await createGlucoseLog(userId, {
                glucose_level: sample.value,
                unit: 'mmol/L',
                logged_at: sampleTime.toISOString(),
                context: 'healthkit_sync',
                notes: `Source: ${sample.sourceName}`,
            });

            if (result) insertedCount++;
        }

        return insertedCount;
    } catch (error) {
        console.warn('Error syncing HealthKit glucose:', error);
        return 0;
    }
}
