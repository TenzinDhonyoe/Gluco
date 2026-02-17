/**
 * Personal Insights Generation
 * 
 * Rules-based insight generation for wellness tracking.
 * All insights use safe, behavioural language without medical claims.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { GlucoseLog, MealWithCheckin, supabase } from './supabase';

// ============================================
// TYPES
// ============================================

export type InsightCategory = 'meals' | 'activity' | 'sleep' | 'glucose' | 'weight';
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
    timeContext?: string;    // "In the next 30 minutes", "Before your next meal"
    outcomeText?: string;    // "Helps your body process glucose"
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
    // Weight behavior (for cadence actions)
    weightLogsCount?: number;
}

export interface InsightGenerationOptions {
    experienceVariant?: 'legacy' | 'behavior_v1';
    readinessLevel?: 'low' | 'medium' | 'high' | null;
    comBBarrier?: 'capability' | 'opportunity' | 'motivation' | 'unsure' | null;
    showGlucoseAdvanced?: boolean | null;
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
    weight: ['#37474F', '#263238'],     // Slate
};

// ============================================
// TIME CONTEXT & OUTCOME MAPPINGS
// ============================================

/**
 * Time context by action type - tells user WHEN to act
 */
const TIME_CONTEXTS: Record<string, string> = {
    'post_meal_walk': 'In the next 30 minutes',
    'pre_meal_fibre': 'Before your next meal',
    'fiber_boost': 'At your next meal',
    'log_meal': 'At your next meal',
    'meal_checkin': 'After your next meal',
    'log_activity': 'In the next hour',
    'steps_boost': 'In the next hour',
    'sleep_window': 'In the next 2 hours',
    'sleep_logging': 'Tonight',
    'sleep_consistency': 'Tonight',
    'log_glucose': 'Before your next meal',
    'meal_pairing': 'At your next meal',
    'log_weight': 'In the next 24 hours',
};

/**
 * Outcome text by action type - tells user WHY it matters
 */
const OUTCOME_TEXTS: Record<string, string> = {
    'post_meal_walk': 'Helps your body process glucose',
    'pre_meal_fibre': 'Helps slow glucose absorption',
    'fiber_boost': 'Helps slow glucose absorption',
    'log_meal': 'Builds your pattern history',
    'meal_checkin': 'Reveals how meals affect your energy',
    'log_activity': 'Tracks your movement impact',
    'steps_boost': 'Supports metabolic health',
    'sleep_window': 'Supports metabolic recovery',
    'sleep_logging': 'Helps correlate sleep with energy',
    'sleep_consistency': 'Supports metabolic recovery',
    'log_glucose': 'Builds your personal zone data',
    'meal_pairing': 'Helps moderate glucose response',
    'log_weight': 'Builds your weekly momentum trend',
};

const ACTION_TYPE_PRIORITY: Record<string, number> = {
    post_meal_walk: 100,
    steps_boost: 95,
    log_activity: 92,
    sleep_window: 90,
    meal_checkin: 88,
    sleep_consistency: 86,
    fiber_boost: 84,
    log_meal: 82,
    sleep_logging: 80,
    log_weight: 79,
    meal_pairing: 74,
    log_glucose: 60,
};

const CATEGORY_PRIORITY: Record<InsightCategory, number> = {
    activity: 8,
    sleep: 6,
    meals: 5,
    weight: 4,
    glucose: -10,
};

const CONFIDENCE_PRIORITY: Record<ConfidenceLevel, number> = {
    high: 7,
    moderate: 3,
    low: 0,
};

const BARRIER_BONUS: Record<NonNullable<InsightGenerationOptions['comBBarrier']>, Partial<Record<string, number>>> = {
    capability: {
        log_meal: 6,
        meal_checkin: 5,
        sleep_window: 4,
        log_weight: 4,
    },
    opportunity: {
        post_meal_walk: 7,
        steps_boost: 6,
        log_activity: 5,
        sleep_window: 3,
    },
    motivation: {
        meal_checkin: 6,
        sleep_consistency: 5,
        post_meal_walk: 4,
        log_weight: 4,
    },
    unsure: {
        post_meal_walk: 4,
        log_meal: 3,
        sleep_window: 3,
    },
};

const READINESS_BONUS: Record<NonNullable<InsightGenerationOptions['readinessLevel']>, Partial<Record<string, number>>> = {
    low: {
        log_meal: 5,
        post_meal_walk: 5,
        sleep_window: 4,
        log_weight: 3,
    },
    medium: {
        post_meal_walk: 3,
        steps_boost: 3,
        meal_checkin: 3,
        sleep_consistency: 2,
    },
    high: {
        sleep_consistency: 4,
        steps_boost: 4,
        meal_checkin: 3,
        log_weight: 3,
    },
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
                cta: { label: 'Log a meal', route: '/meal-scanner' },
            }),
            cta: { label: 'Log a meal', route: '/meal-scanner' },
            timeContext: TIME_CONTEXTS['log_meal'],
            outcomeText: OUTCOME_TEXTS['log_meal'],
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
                cta: { label: 'Log a meal', route: '/meal-scanner' },
            }),
            cta: { label: 'Log a meal', route: '/meal-scanner' },
            timeContext: TIME_CONTEXTS['fiber_boost'],
            outcomeText: OUTCOME_TEXTS['fiber_boost'],
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
            timeContext: TIME_CONTEXTS['meal_checkin'],
            outcomeText: OUTCOME_TEXTS['meal_checkin'],
        });
    } else if (data.checkinsThisWeek !== undefined && data.totalMealsThisWeek !== undefined) {
        insights.push({
            id: 'meals-checkin-progress',
            category: 'meals',
            title: 'Check-in Streak',
            recommendation: 'Do one meal check-in within 20 minutes after your next meal to keep your pattern streak going.',
            because: `You completed ${data.checkinsThisWeek} check-ins this week.`,
            microStep: 'Check in after your next 2 meals.',
            confidence: checkInConfidence,
            icon: 'checkmark-circle-outline',
            gradient: GRADIENTS.meals,
            action: buildAction({
                id: 'action-checkin-streak',
                title: 'Check in after your next meal',
                description: 'Complete one check-in within 20 minutes after your next meal.',
                actionType: 'meal_checkin',
                metricKey: 'checkin_count',
                windowHours: 72,
                cta: { label: 'Add check-in', route: '/meal-checkin' },
            }),
            cta: { label: 'Add check-in', route: '/meal-checkin' },
            timeContext: TIME_CONTEXTS['meal_checkin'],
            outcomeText: OUTCOME_TEXTS['meal_checkin'],
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
                timeContext: TIME_CONTEXTS['post_meal_walk'],
                outcomeText: OUTCOME_TEXTS['post_meal_walk'],
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
                timeContext: TIME_CONTEXTS['post_meal_walk'],
                outcomeText: OUTCOME_TEXTS['post_meal_walk'],
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
                ? 'Walk 10 minutes after lunch today to move toward 5,000 steps.'
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
                title: 'Walk 10 minutes after lunch',
                description: 'Take a 10-minute walk after lunch in the next 48 hours.',
                actionType: 'steps_boost',
                metricKey: 'steps',
                windowHours: 48,
                cta: { label: 'Log activity', route: '/log-activity' },
            }),
            cta: { label: 'Log activity', route: '/log-activity' },
            timeContext: TIME_CONTEXTS['steps_boost'],
            outcomeText: OUTCOME_TEXTS['steps_boost'],
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
            timeContext: TIME_CONTEXTS['sleep_logging'],
            outcomeText: OUTCOME_TEXTS['sleep_logging'],
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
                timeContext: TIME_CONTEXTS['sleep_window'],
                outcomeText: OUTCOME_TEXTS['sleep_window'],
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
                timeContext: TIME_CONTEXTS['sleep_consistency'],
                outcomeText: OUTCOME_TEXTS['sleep_consistency'],
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
            timeContext: TIME_CONTEXTS['log_glucose'],
            outcomeText: OUTCOME_TEXTS['log_glucose'],
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
                cta: { label: 'Log a meal', route: '/meal-scanner' },
            }),
            cta: { label: 'View patterns', route: '/insights' },
            timeContext: TIME_CONTEXTS['meal_pairing'],
            outcomeText: OUTCOME_TEXTS['meal_pairing'],
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
            timeContext: TIME_CONTEXTS['post_meal_walk'],
            outcomeText: OUTCOME_TEXTS['post_meal_walk'],
        });
    }

    return insights;
}

function generateWeightRecommendations(data: InsightData): PersonalInsight[] {
    const insights: PersonalInsight[] = [];
    const weightLogs = data.weightLogsCount ?? 0;

    if (weightLogs <= 0) {
        insights.push({
            id: 'weight-setup',
            category: 'weight',
            title: 'Start a Weight Cadence',
            recommendation: 'Log your weight twice this week to build a simple trend.',
            because: 'A small cadence helps you track behavior momentum over time.',
            microStep: 'Log one weight entry in the next 24 hours.',
            confidence: 'low',
            icon: 'scale-outline',
            gradient: GRADIENTS.weight,
            action: buildAction({
                id: 'action-log-weight',
                title: 'Log weight once',
                description: 'Add one weight entry in the next 24 hours.',
                actionType: 'log_weight',
                metricKey: 'weight_logs_count',
                windowHours: 24,
                cta: { label: 'Log weight', route: '/log-weight' },
            }),
            cta: { label: 'Log weight', route: '/log-weight' },
            timeContext: TIME_CONTEXTS['log_weight'],
            outcomeText: OUTCOME_TEXTS['log_weight'],
        });
        return insights;
    }

    if (weightLogs < 3) {
        insights.push({
            id: 'weight-cadence-build',
            category: 'weight',
            title: 'Build Consistency',
            recommendation: 'Keep a twice-weekly weigh-in rhythm.',
            because: `You logged ${weightLogs} weight entr${weightLogs === 1 ? 'y' : 'ies'} this week.`,
            microStep: 'Pick one fixed day/time for your next weigh-in.',
            confidence: weightLogs >= 2 ? 'moderate' : 'low',
            icon: 'scale-outline',
            gradient: GRADIENTS.weight,
            action: buildAction({
                id: 'action-weight-cadence',
                title: 'Log one more weight entry',
                description: 'Add one more entry this week to keep cadence.',
                actionType: 'log_weight',
                metricKey: 'weight_logs_count',
                windowHours: 72,
                cta: { label: 'Log weight', route: '/log-weight' },
            }),
            cta: { label: 'Log weight', route: '/log-weight' },
            timeContext: TIME_CONTEXTS['log_weight'],
            outcomeText: OUTCOME_TEXTS['log_weight'],
        });
    }

    return insights;
}

function shouldIncludeGlucoseRecommendations(
    data: InsightData,
    trackingMode: TrackingMode,
    options?: InsightGenerationOptions
): boolean {
    const glucoseEnabledModes: TrackingMode[] = ['manual_glucose_optional', 'glucose_tracking'];
    if (!glucoseEnabledModes.includes(trackingMode)) return false;

    if (options?.experienceVariant !== 'behavior_v1') {
        return true;
    }

    // In behavior_v1, glucose is optional and only shown if explicitly enabled
    // and sufficient logs exist to avoid noisy low-signal prompts.
    const showAdvanced = !!options.showGlucoseAdvanced;
    const logs = data.glucoseLogsCount ?? data.glucoseLogs?.length ?? 0;
    return showAdvanced && logs >= 5;
}

function getInsightPriorityScore(
    insight: PersonalInsight,
    options?: InsightGenerationOptions
): number {
    const actionType = insight.action?.actionType || 'unknown';
    const readiness = options?.readinessLevel || 'medium';
    const barrier = options?.comBBarrier || 'unsure';

    let score = ACTION_TYPE_PRIORITY[actionType] ?? 50;
    score += CATEGORY_PRIORITY[insight.category] ?? 0;
    score += CONFIDENCE_PRIORITY[insight.confidence] ?? 0;

    score += READINESS_BONUS[readiness]?.[actionType] ?? 0;
    score += BARRIER_BONUS[barrier]?.[actionType] ?? 0;

    if (options?.experienceVariant === 'behavior_v1') {
        if (insight.category === 'glucose' || actionType === 'log_glucose') {
            score -= 18;
        }

        if (readiness === 'low' && (insight.action?.windowHours || 48) > 48) {
            score -= 6;
        }
    }

    return score;
}

function applyBehaviorOverloadLimits(
    sortedInsights: PersonalInsight[],
    options?: InsightGenerationOptions
): PersonalInsight[] {
    const readiness = options?.readinessLevel || 'medium';
    const maxInsights = readiness === 'low' ? 4 : 6;
    const maxPerCategory = readiness === 'low' ? 1 : 2;

    const categoryCounts: Record<string, number> = {};
    const selected: PersonalInsight[] = [];

    for (const insight of sortedInsights) {
        if (selected.length >= maxInsights) break;

        const category = insight.category;
        const currentCount = categoryCounts[category] ?? 0;
        if (currentCount >= maxPerCategory) continue;

        selected.push(insight);
        categoryCounts[category] = currentCount + 1;
    }

    return selected;
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
    trackingMode: TrackingMode,
    options?: InsightGenerationOptions
): PersonalInsight[] {
    const insights: PersonalInsight[] = [];

    // Always include meals, activity, sleep
    insights.push(...generateMealRecommendations(data));
    insights.push(...generateActivityRecommendations(data));
    insights.push(...generateSleepRecommendations(data));
    insights.push(...generateWeightRecommendations(data));

    // Only include glucose insights for glucose-enabled modes and optional behavior_v1 gating.
    if (shouldIncludeGlucoseRecommendations(data, trackingMode, options)) {
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

    if (options?.experienceVariant === 'behavior_v1') {
        const ranked = safeInsights
            .map((insight) => ({
                insight,
                score: getInsightPriorityScore(insight, options),
            }))
            .sort((a, b) => b.score - a.score)
            .map((entry) => entry.insight);

        return applyBehaviorOverloadLimits(ranked, options);
    }

    // Legacy ordering stays stable.
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
    weight: 'scale-outline',
};

const CTA_ROUTES: Record<InsightCategory, { label: string; route: string }> = {
    meals: { label: 'Log a meal', route: '/meal-scanner' },
    activity: { label: 'Log activity', route: '/log-activity' },
    sleep: { label: 'View patterns', route: '/insights' },
    glucose: { label: 'Log glucose', route: '/log-glucose' },
    weight: { label: 'Log weight', route: '/log-weight' },
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
            return buildAction({
                id: 'action-default-glucose',
                title: 'Log glucose',
                description: 'Add a glucose reading in the next 48 hours.',
                actionType: 'log_glucose',
                metricKey: 'glucose_logs_count',
                cta: CTA_ROUTES.glucose,
            });
        case 'weight':
            return buildAction({
                id: 'action-default-weight',
                title: 'Log weight',
                description: 'Add one weight entry in the next 24 hours.',
                actionType: 'log_weight',
                metricKey: 'weight_logs_count',
                windowHours: 24,
                cta: CTA_ROUTES.weight,
            });
        default:
            return buildAction({
                id: 'action-default-glucose-fallback',
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

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

interface CachedInsights {
    insights: PersonalInsight[];
    timestamp: number;
}

const INSIGHTS_CACHE_VERSION = 'v4'; // Bumped for action metadata

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
