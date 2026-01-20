/**
 * Personal Insights Generation
 * 
 * Rules-based insight generation for wellness tracking.
 * All insights use safe, behavioural language without medical claims.
 */

import { GlucoseLog, MealWithCheckin } from './supabase';

// ============================================
// TYPES
// ============================================

export type InsightCategory = 'meals' | 'activity' | 'sleep' | 'glucose';
export type ConfidenceLevel = 'high' | 'moderate' | 'low';

export interface InsightAction {
    id: string;
    title: string;
    description: string;
    actionType: string;
    windowHours: number;
    metricKey: string;
    cta?: {
        label: string;
        route: string;
        params?: Record<string, any>;
    };
}

export interface PersonalInsight {
    id: string;
    category: InsightCategory;
    title: string;
    recommendation: string;  // actionable suggestion
    because: string;         // ties to user's own data (no medical claims)
    microStep: string;       // easy today step
    confidence: ConfidenceLevel;
    icon: string;            // Ionicons name
    gradient: [string, string];
    action: InsightAction;
    cta: {
        label: string;
        route: string;
        params?: Record<string, any>;
    };
}

export type TrackingMode =
    | 'manual_glucose_optional'
    | 'meals_only'
    | 'meals_wearables'
    | 'wearables_only'
    | 'glucose_tracking'; // Legacy mode for backward compatibility

export interface InsightData {
    // Meal data
    glucoseLogs?: GlucoseLog[];
    meals?: MealWithCheckin[];
    avgFibrePerDay?: number;
    totalMealsThisWeek?: number;
    checkinsThisWeek?: number;
    mealsWithWalkAfter?: number;
    // Check-in breakdown
    avgEnergy?: number;
    avgFullness?: number;
    avgCravings?: number;
    lunchCravingsHigher?: boolean;
    dinnerCravingsHigher?: boolean;
    // Activity
    avgSteps?: number;
    avgActiveMinutes?: number;
    dinnersWithWalk?: number;
    totalDinners?: number;
    // Sleep
    avgSleepHours?: number;
    sleepDaysLogged?: number;
    // Glucose (only if enabled)
    glucoseLogsCount?: number;
    timeInZonePercent?: number;
    lowFibreMealsAboveZone?: boolean;
    userTargetMin?: number;
    userTargetMax?: number;
}

// ============================================
// SAFE LANGUAGE FILTERS
// ============================================

/**
 * Whitelist of safe verbs for insights
 */
export const SAFE_VERBS = [
    'noticed',
    'pattern',
    'logged',
    'tended to',
    'check-in',
    'experiment',
    'try',
    'averaged',
    'tracked',
    'added',
    'completed',
];

/**
 * Banned terms that should never appear in insights
 */
export const BANNED_TERMS = [
    'spike',
    'risk',
    'treat',
    'prevent',
    'diagnose',
    'insulin sensitivity',
    'insulin resistance',
    'clinical',
    'medical',
    'disease',
    'condition',
    'therapy',
    'treatment',
    '7.8',
    '11.1',
    'prediabetes',
    'diabetes',
    'hypoglycemia',
    'hyperglycemia',
];

/**
 * Check if text contains any banned terms
 */
export function containsBannedTerms(text: string): boolean {
    const lowerText = text.toLowerCase();
    return BANNED_TERMS.some(term => lowerText.includes(term.toLowerCase()));
}

/**
 * Sanitize insight text by checking for banned terms
 */
export function sanitizeInsight(text: string): string | null {
    if (containsBannedTerms(text)) {
        if (__DEV__) console.warn('Insight contained banned terms:', text);
        return null;
    }
    return text;
}

// ============================================
// GRADIENT THEMES
// ============================================

const GRADIENTS: Record<InsightCategory, [string, string]> = {
    meals: ['#2E7D32', '#1B5E20'],      // Green
    activity: ['#E65100', '#BF360C'],   // Orange
    sleep: ['#1565C0', '#0D47A1'],      // Blue
    glucose: ['#7B1FA2', '#4A148C'],    // Purple
};

// ============================================
// DATA QUALITY / CONFIDENCE SCORING
// ============================================

function getMealConfidence(data: InsightData): ConfidenceLevel {
    const meals = data.totalMealsThisWeek ?? 0;
    if (meals >= 7) return 'high';
    if (meals >= 3) return 'moderate';
    return 'low';
}

function getCheckInConfidence(data: InsightData): ConfidenceLevel {
    const checkins = data.checkinsThisWeek ?? 0;
    if (checkins >= 3) return 'high';
    if (checkins >= 1) return 'moderate';
    return 'low';
}

function getSleepConfidence(data: InsightData): ConfidenceLevel {
    const days = data.sleepDaysLogged ?? 0;
    if (days >= 3) return 'high';
    if (days >= 1) return 'moderate';
    return 'low';
}

function getGlucoseConfidence(data: InsightData): ConfidenceLevel {
    const logs = data.glucoseLogsCount ?? 0;
    if (logs >= 5) return 'high';
    if (logs >= 2) return 'moderate';
    return 'low';
}

// ============================================
// RECOMMENDATION GENERATORS
// ============================================

const DEFAULT_ACTION_WINDOW_HOURS = 48;

function buildAction(params: {
    id: string;
    title: string;
    description: string;
    actionType: string;
    metricKey: string;
    windowHours?: number;
    cta?: {
        label: string;
        route: string;
        params?: Record<string, any>;
    };
}): InsightAction {
    return {
        id: params.id,
        title: params.title,
        description: params.description,
        actionType: params.actionType,
        metricKey: params.metricKey,
        windowHours: params.windowHours ?? DEFAULT_ACTION_WINDOW_HOURS,
        cta: params.cta,
    };
}

function generateMealRecommendations(data: InsightData): PersonalInsight[] {
    const insights: PersonalInsight[] = [];
    const confidence = getMealConfidence(data);
    const checkInConfidence = getCheckInConfidence(data);

    // Low data: setup recommendation
    if (confidence === 'low') {
        insights.push({
            id: 'meals-setup',
            category: 'meals',
            title: 'Start Tracking',
            recommendation: 'Log 3+ meals this week to unlock personalized patterns.',
            because: `You've logged ${data.totalMealsThisWeek ?? 0} meals so far.`,
            microStep: 'Log your next meal after eating.',
            confidence: 'low',
            icon: 'restaurant-outline',
            gradient: GRADIENTS.meals,
            action: buildAction({
                id: 'action-log-meal',
                title: 'Log your next meal',
                description: 'Add one meal log in the next 48 hours.',
                actionType: 'log_meal',
                metricKey: 'meal_count',
                windowHours: 48,
                cta: { label: 'Log a meal', route: '/log-meal' },
            }),
            cta: { label: 'Log a meal', route: '/log-meal' },
        });
        return insights;
    }

    // Fibre anchor recommendation
    if (data.avgFibrePerDay !== undefined && data.avgFibrePerDay > 0) {
        const fibreRounded = Math.round(data.avgFibrePerDay);
        const lunchCravingsNote = data.lunchCravingsHigher
            ? 'your lunch check-ins tended to have more cravings'
            : `your meals this week averaged ${fibreRounded}g fibre/day`;

        insights.push({
            id: 'meals-fibre-anchor',
            category: 'meals',
            title: 'Fibre Anchor',
            recommendation: 'Try adding a fibre-rich side to lunch.',
            because: lunchCravingsNote,
            microStep: 'Add veggies, beans, or whole grains to your next lunch.',
            confidence,
            icon: 'nutrition-outline',
            gradient: GRADIENTS.meals,
            action: buildAction({
                id: 'action-fibre-anchor',
                title: 'Add fibre to one meal',
                description: 'Include a fibre-rich side at your next lunch.',
                actionType: 'fiber_boost',
                metricKey: 'glucose_avg',
                windowHours: 48,
                cta: { label: 'Log a meal', route: '/log-meal' },
            }),
            cta: { label: 'Log a meal', route: '/log-meal' },
        });
    }

    // Check-in recommendation
    if (checkInConfidence === 'low') {
        insights.push({
            id: 'meals-checkin-setup',
            category: 'meals',
            title: 'Add Check-ins',
            recommendation: 'Complete 3 after-meal check-ins to notice patterns.',
            because: `You've completed ${data.checkinsThisWeek ?? 0} check-ins so far.`,
            microStep: 'After your next meal, rate your energy and cravings.',
            confidence: 'low',
            icon: 'checkbox-outline',
            gradient: GRADIENTS.meals,
            action: buildAction({
                id: 'action-meal-checkin',
                title: 'Complete a meal check-in',
                description: 'Add one after-meal check-in in the next 72 hours.',
                actionType: 'meal_checkin',
                metricKey: 'checkin_count',
                windowHours: 72,
                cta: { label: 'Add check-in', route: '/meal-checkin' },
            }),
            cta: { label: 'Add check-in', route: '/meal-checkin' },
        });
    } else if (data.checkinsThisWeek !== undefined && data.totalMealsThisWeek !== undefined) {
        insights.push({
            id: 'meals-checkin-progress',
            category: 'meals',
            title: 'Check-in Streak',
            recommendation: 'Keep checking in to build your personal patterns.',
            because: `You completed ${data.checkinsThisWeek} check-ins this week.`,
            microStep: 'Check in after your next 2 meals.',
            confidence: checkInConfidence,
            icon: 'checkmark-circle-outline',
            gradient: GRADIENTS.meals,
            action: buildAction({
                id: 'action-checkin-streak',
                title: 'Add another check-in',
                description: 'Complete one more check-in in the next 72 hours.',
                actionType: 'meal_checkin',
                metricKey: 'checkin_count',
                windowHours: 72,
                cta: { label: 'Add check-in', route: '/meal-checkin' },
            }),
            cta: { label: 'Add check-in', route: '/meal-checkin' },
        });
    }

    return insights;
}

function generateActivityRecommendations(data: InsightData): PersonalInsight[] {
    const insights: PersonalInsight[] = [];
    const dinnersLogged = data.totalDinners ?? data.totalMealsThisWeek ?? 0;
    const dinnersWithWalk = data.dinnersWithWalk ?? data.mealsWithWalkAfter ?? 0;
    const confidence: ConfidenceLevel = dinnersLogged >= 3 ? 'high' : dinnersLogged >= 1 ? 'moderate' : 'low';

    // Post-dinner walk recommendation
    if (dinnersLogged > 0) {
        const walkRate = dinnersLogged > 0 ? Math.round((dinnersWithWalk / dinnersLogged) * 100) : 0;

        if (walkRate < 50) {
            insights.push({
                id: 'activity-dinner-walk',
                category: 'activity',
                title: 'Post-Dinner Movement',
                recommendation: 'Experiment with a 10-minute easy walk after dinner.',
                because: `You logged movement after ${dinnersWithWalk}/${dinnersLogged} dinners.`,
                microStep: 'Set a reminder for a short walk after tonight\'s dinner.',
                confidence,
                icon: 'walk-outline',
                gradient: GRADIENTS.activity,
                action: buildAction({
                    id: 'action-post-dinner-walk',
                    title: 'Post-dinner walk',
                    description: 'Add a 10-minute walk after one dinner in the next 48 hours.',
                    actionType: 'post_meal_walk',
                    metricKey: 'time_in_range',
                    windowHours: 48,
                    cta: { label: 'Log activity', route: '/log-activity' },
                }),
                cta: { label: 'Log activity', route: '/log-activity' },
            });
        } else {
            insights.push({
                id: 'activity-walks-great',
                category: 'activity',
                title: 'Great Movement Habit',
                recommendation: 'Keep up the post-meal movement—it supports your rhythm.',
                because: `You walked after ${dinnersWithWalk} dinners this week.`,
                microStep: 'Try extending one walk by 5 minutes.',
                confidence,
                icon: 'walk-outline',
                gradient: GRADIENTS.activity,
                action: buildAction({
                    id: 'action-extend-walk',
                    title: 'Extend one walk',
                    description: 'Add 5 minutes to one walk in the next 48 hours.',
                    actionType: 'post_meal_walk',
                    metricKey: 'time_in_range',
                    windowHours: 48,
                    cta: { label: 'Log activity', route: '/log-activity' },
                }),
                cta: { label: 'Log activity', route: '/log-activity' },
            });
        }
    }

    // Steps recommendation
    if (data.avgSteps !== undefined && data.avgSteps > 0) {
        const stepsFormatted = data.avgSteps.toLocaleString();
        insights.push({
            id: 'activity-steps',
            category: 'activity',
            title: 'Daily Steps',
            recommendation: data.avgSteps < 5000
                ? 'Try adding a short walk to reach 5,000 steps.'
                : 'Keep up the great daily movement.',
            because: `You averaged ${stepsFormatted} steps/day this week.`,
            microStep: data.avgSteps < 5000
                ? 'Take a 10-minute walk during lunch.'
                : 'Challenge yourself with an extra 500 steps today.',
            confidence: 'high',
            icon: 'footsteps-outline',
            gradient: GRADIENTS.activity,
            action: buildAction({
                id: 'action-step-boost',
                title: 'Add a short walk',
                description: 'Add a 10-minute walk in the next 48 hours.',
                actionType: 'steps_boost',
                metricKey: 'steps',
                windowHours: 48,
                cta: { label: 'Log activity', route: '/log-activity' },
            }),
            cta: { label: 'Log activity', route: '/log-activity' },
        });
    }

    return insights;
}

function generateSleepRecommendations(data: InsightData): PersonalInsight[] {
    const insights: PersonalInsight[] = [];
    const confidence = getSleepConfidence(data);

    if (confidence === 'low') {
        insights.push({
            id: 'sleep-setup',
            category: 'sleep',
            title: 'Track Sleep',
            recommendation: 'Log 3+ nights of sleep to notice patterns.',
            because: `Sleep data helps correlate with your energy check-ins.`,
            microStep: 'Sync with Apple Health or log tonight\'s sleep.',
            confidence: 'low',
            icon: 'moon-outline',
            gradient: GRADIENTS.sleep,
            action: buildAction({
                id: 'action-track-sleep',
                title: 'Sync sleep data',
                description: 'Connect sleep data in the next 72 hours.',
                actionType: 'sleep_logging',
                metricKey: 'sleep_hours',
                windowHours: 72,
                cta: { label: 'Connect Health', route: '/settings' },
            }),
            cta: { label: 'Connect Health', route: '/settings' },
        });
        return insights;
    }

    if (data.avgSleepHours !== undefined && data.avgSleepHours > 0) {
        const sleepRounded = data.avgSleepHours.toFixed(1);

        if (data.avgSleepHours < 6.5) {
            insights.push({
                id: 'sleep-wind-down',
                category: 'sleep',
                title: 'Earlier Wind-Down',
                recommendation: 'Try a 30-minute earlier wind-down tonight.',
                because: `Your average sleep this week was ${sleepRounded}h.`,
                microStep: 'Set your phone to "Do Not Disturb" 30 min before bed.',
                confidence,
                icon: 'moon-outline',
                gradient: GRADIENTS.sleep,
                action: buildAction({
                    id: 'action-sleep-wind-down',
                    title: 'Earlier wind-down',
                    description: 'Start a 30-minute earlier wind-down tonight.',
                    actionType: 'sleep_window',
                    metricKey: 'sleep_hours',
                    windowHours: 48,
                    cta: { label: 'View sleep', route: '/insights' },
                }),
                cta: { label: 'View sleep', route: '/insights' },
            });
        } else {
            insights.push({
                id: 'sleep-great',
                category: 'sleep',
                title: 'Solid Rest',
                recommendation: 'Keep this rhythm—consistent sleep supports wellbeing.',
                because: `You averaged ${sleepRounded}h of sleep this week.`,
                microStep: 'Notice how your energy check-ins relate to sleep.',
                confidence,
                icon: 'moon-outline',
                gradient: GRADIENTS.sleep,
                action: buildAction({
                    id: 'action-sleep-consistency',
                    title: 'Keep a steady bedtime',
                    description: 'Keep your bedtime consistent over the next 72 hours.',
                    actionType: 'sleep_consistency',
                    metricKey: 'sleep_hours',
                    windowHours: 72,
                    cta: { label: 'View patterns', route: '/insights' },
                }),
                cta: { label: 'View patterns', route: '/insights' },
            });
        }
    }

    return insights;
}

function generateGlucoseRecommendations(data: InsightData): PersonalInsight[] {
    const insights: PersonalInsight[] = [];
    const confidence = getGlucoseConfidence(data);

    if (confidence === 'low') {
        insights.push({
            id: 'glucose-setup',
            category: 'glucose',
            title: 'Log Readings',
            recommendation: 'Add 5+ glucose readings to see your personal zone patterns.',
            because: `You've logged ${data.glucoseLogsCount ?? 0} readings so far.`,
            microStep: 'Log a reading before and after your next meal.',
            confidence: 'low',
            icon: 'analytics-outline',
            gradient: GRADIENTS.glucose,
            action: buildAction({
                id: 'action-log-glucose',
                title: 'Log glucose readings',
                description: 'Add two readings in the next 48 hours.',
                actionType: 'log_glucose',
                metricKey: 'glucose_logs_count',
                windowHours: 48,
                cta: { label: 'Log glucose', route: '/log-glucose' },
            }),
            cta: { label: 'Log glucose', route: '/log-glucose' },
        });
        return insights;
    }

    // Fibre + zone recommendation (NO clinical terms)
    if (data.lowFibreMealsAboveZone) {
        insights.push({
            id: 'glucose-fibre-pairing',
            category: 'glucose',
            title: 'Pair with Fibre',
            recommendation: 'Consider pairing higher-carb meals with protein or fibre.',
            because: 'Your logs tend to be higher than your personal zone after low-fibre meals.',
            microStep: 'Add veggies or protein to your next carb-heavy meal.',
            confidence,
            icon: 'analytics-outline',
            gradient: GRADIENTS.glucose,
            action: buildAction({
                id: 'action-glucose-fibre-pairing',
                title: 'Pair carbs with fibre',
                description: 'Pair your next higher-carb meal with fibre.',
                actionType: 'meal_pairing',
                metricKey: 'time_in_range',
                windowHours: 48,
                cta: { label: 'Log a meal', route: '/log-meal' },
            }),
            cta: { label: 'View patterns', route: '/insights' },
        });
    } else if (data.timeInZonePercent !== undefined) {
        const inZone = Math.round(data.timeInZonePercent);
        insights.push({
            id: 'glucose-zone',
            category: 'glucose',
            title: 'Your Personal Zone',
            recommendation: inZone >= 70
                ? 'Keep up the great balance—your readings are aligned with your zone.'
                : 'Experiment with meal timing or composition to find what works for you.',
            because: `${inZone}% of your readings were within your personal zone this week.`,
            microStep: inZone >= 70
                ? 'Notice which meals keep you in your zone.'
                : 'Try a post-meal walk after your next larger meal.',
            confidence,
            icon: 'analytics-outline',
            gradient: GRADIENTS.glucose,
            action: buildAction({
                id: 'action-glucose-zone',
                title: 'Post-meal walk',
                description: 'Add a short post-meal walk in the next 48 hours.',
                actionType: 'post_meal_walk',
                metricKey: 'time_in_range',
                windowHours: 48,
                cta: { label: 'Log activity', route: '/log-activity' },
            }),
            cta: { label: 'View patterns', route: '/insights' },
        });
    }

    return insights;
}

// ============================================
// MAIN GENERATOR
// ============================================

/**
 * Generate personalized recommendations based on user data and tracking mode.
 * Glucose insights are only included for glucose-enabled modes.
 */
export function generateInsights(
    data: InsightData,
    trackingMode: TrackingMode
): PersonalInsight[] {
    const insights: PersonalInsight[] = [];

    // Always include meals, activity, sleep
    insights.push(...generateMealRecommendations(data));
    insights.push(...generateActivityRecommendations(data));
    insights.push(...generateSleepRecommendations(data));

    // Only include glucose insights for glucose-enabled modes
    const glucoseEnabledModes: TrackingMode[] = ['manual_glucose_optional', 'glucose_tracking'];
    if (glucoseEnabledModes.includes(trackingMode)) {
        insights.push(...generateGlucoseRecommendations(data));
    }

    // Filter out any insights that might contain banned terms
    const safeInsights = insights.filter(insight => {
        const isSafe = !containsBannedTerms(insight.recommendation) &&
            !containsBannedTerms(insight.because) &&
            !containsBannedTerms(insight.title);
        if (!isSafe && __DEV__) {
            console.warn('Filtered unsafe insight:', insight.id);
        }
        return isSafe;
    });

    // Limit to 6 insights max (4-6 cards per spec)
    return safeInsights.slice(0, 6);
}

// ============================================
// CLIENT-SIDE UI MAPPING
// ============================================

const ICONS: Record<InsightCategory, string> = {
    meals: 'nutrition-outline',
    activity: 'walk-outline',
    sleep: 'moon-outline',
    glucose: 'analytics-outline',
};

const CTA_ROUTES: Record<InsightCategory, { label: string; route: string }> = {
    meals: { label: 'Log a meal', route: '/log-meal' },
    activity: { label: 'Log activity', route: '/log-activity' },
    sleep: { label: 'View patterns', route: '/insights' },
    glucose: { label: 'Log glucose', route: '/log-glucose' },
};

function getDefaultAction(category: InsightCategory): InsightAction {
    switch (category) {
        case 'meals':
            return buildAction({
                id: 'action-default-meals',
                title: 'Log a meal',
                description: 'Add one meal log in the next 48 hours.',
                actionType: 'log_meal',
                metricKey: 'meal_count',
                cta: CTA_ROUTES.meals,
            });
        case 'activity':
            return buildAction({
                id: 'action-default-activity',
                title: 'Log activity',
                description: 'Add one activity log in the next 48 hours.',
                actionType: 'log_activity',
                metricKey: 'steps',
                cta: CTA_ROUTES.activity,
            });
        case 'sleep':
            return buildAction({
                id: 'action-default-sleep',
                title: 'Keep a steady bedtime',
                description: 'Aim for a consistent sleep window tonight.',
                actionType: 'sleep_window',
                metricKey: 'sleep_hours',
                windowHours: 72,
                cta: CTA_ROUTES.sleep,
            });
        case 'glucose':
        default:
            return buildAction({
                id: 'action-default-glucose',
                title: 'Log glucose',
                description: 'Add a glucose reading in the next 48 hours.',
                actionType: 'log_glucose',
                metricKey: 'glucose_logs_count',
                cta: CTA_ROUTES.glucose,
            });
    }
}

/**
 * Map LLM output (no UI styling) to PersonalInsight with icon/gradient
 */
export function mapToPersonalInsight(
    output: {
        category: InsightCategory;
        title: string;
        recommendation: string;
        because: string;
        micro_step: string;
        confidence: ConfidenceLevel;
    },
    index: number
): PersonalInsight {
    return {
        id: `${output.category}-${index}`,
        category: output.category,
        title: output.title,
        recommendation: output.recommendation,
        because: output.because,
        microStep: output.micro_step,
        confidence: output.confidence,
        icon: ICONS[output.category] || 'sparkles-outline',
        gradient: GRADIENTS[output.category] || ['#424242', '#212121'],
        action: getDefaultAction(output.category),
        cta: CTA_ROUTES[output.category],
    };
}

// ============================================
// SUPABASE EDGE FUNCTION CALL
// ============================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

interface CachedInsights {
    insights: PersonalInsight[];
    timestamp: number;
}

const INSIGHTS_CACHE_VERSION = 'v3'; // Bumped for action metadata

function getCacheKey(userId: string, trackingMode: TrackingMode): string {
    const dateKey = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return `insights:${INSIGHTS_CACHE_VERSION}:${userId}:${trackingMode}:${dateKey}`;
}

/**
 * Invoke the personal-insights Edge Function with TTL caching
 */
export async function invokePersonalInsights(
    userId: string,
    trackingMode: TrackingMode,
    range: '7d' | '14d' | '30d' | '90d' = '7d'
): Promise<PersonalInsight[]> {
    const cacheKey = getCacheKey(userId, trackingMode);

    // Check cache first
    try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) {
            const parsed: CachedInsights = JSON.parse(cached);
            const age = Date.now() - parsed.timestamp;
            if (age < CACHE_TTL_MS) {
                if (__DEV__) console.log('Using cached insights');
                return parsed.insights;
            }
        }
    } catch (e) {
        console.warn('Cache read error:', e);
    }

    // Call Edge Function
    try {
        const { data, error } = await supabase.functions.invoke('personal-insights', {
            body: { user_id: userId, tracking_mode: trackingMode, range },
        });

        if (error) {
            console.error('Edge function error:', error);
            return []; // Will trigger fallback in caller
        }

        const rawInsights = data?.insights || [];
        const mappedInsights = rawInsights.map((insight: any, i: number) =>
            mapToPersonalInsight(insight, i)
        );

        // Cache the result
        try {
            await AsyncStorage.setItem(
                cacheKey,
                JSON.stringify({ insights: mappedInsights, timestamp: Date.now() })
            );
        } catch (e) {
            console.warn('Cache write error:', e);
        }

        return mappedInsights;
    } catch (error) {
        console.error('invokePersonalInsights error:', error);
        return [];
    }
}
