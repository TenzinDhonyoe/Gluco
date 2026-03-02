import { MetabolicScoreRing } from '@/components/charts/MetabolicScoreRing';
import { SegmentedControl } from '@/components/controls/segmented-control';
import { ActiveExperimentCard } from '@/components/experiments/ActiveExperimentCard';
import { ExperimentLibraryCard } from '@/components/experiments/ExperimentLibraryCard';
import { DataCoverageCard } from '@/components/progress/DataCoverageCard';
import { MetricCard } from '@/components/progress/MetricCard';
import { Disclaimer } from '@/components/ui/Disclaimer';
import { ForestGlassBackground } from '@/components/backgrounds/forest-glass-background';
import { Colors } from '@/constants/Colors';
import { Images } from '@/constants/Images';
import { useAuth, useGlucoseUnit } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { useNextBestAction } from '@/hooks/useNextBestAction';
import { usePersonalInsights } from '@/hooks/usePersonalInsights';
import { useWeeklyReview } from '@/hooks/useWeeklyReview';
import { isBehaviorV1Experience } from '@/lib/experience';
import { InsightAction, InsightCategory, InsightData, PersonalInsight, TrackingMode } from '@/lib/insights';
import {
    ActivityLog,
    CarePathwayTemplate,
    DailyContext,
    ExperimentTemplate,
    GlucoseLog,
    MealWithCheckin,
    MetabolicWeeklyScore,
    SuggestedExperiment,
    UserAction,
    UserCarePathway,
    UserExperiment,
    WeightLog,
    createUserAction,
    getActiveCarePathway,
    getActivityLogsByDateRange,
    getCarePathwayTemplates,
    getDailyContextByRange,
    getExperimentTemplates,
    getFibreIntakeSummary,
    getGlucoseLogsByDateRange,
    getMealsWithCheckinsByDateRange,
    getMetabolicWeeklyScores,
    getSuggestedExperiments,
    getUserActionsByStatus,
    getUserExperiments,
    getWeightLogsByDateRange,
    startCarePathway,
    startUserExperiment,
    supabase,
    updateCarePathway,
    updateUserAction,
    upsertMetabolicDailyFeature,
} from '@/lib/supabase';
import { formatGlucoseWithUnit } from '@/lib/utils/glucoseUnits';
import { triggerHaptic } from '@/lib/utils/haptics';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Image,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type TabKey = 'actions' | 'progress' | 'experiments';
type ActionFocusKey = 'glucose' | 'activity' | 'sleep';

type MetricKey =
    | 'meal_count'
    | 'checkin_count'
    | 'time_in_range'
    | 'glucose_avg'
    | 'glucose_logs_count'
    | 'steps'
    | 'sleep_hours'
    | 'weight_logs_count';

// Metabolic score API response type
interface MetabolicScoreResponse {
    score7d: number | null;
    score28d: number | null;
    confidence_v2: 'high' | 'medium' | 'low' | 'insufficient_data';
    atypicalActivityWeek: boolean;
    mode: 'baseline_relative' | 'absolute_fallback';
    components_v2: {
        rhrBad: number | null;
        stepsBad: number | null;
        sleepBad: number | null;
        hrvBad: number | null;
        contextNorm: number;
        wearableStrain: number;
        contextMultiplier: number;
        strain: number;
    } | null;
    v2: {
        score7d: number | null;
        score28d: number | null;
        confidence: 'high' | 'medium' | 'low' | 'insufficient_data';
        components?: {
            rhrBad: number | null;
            stepsBad: number | null;
            sleepBad: number | null;
            hrvBad: number | null;
        };
    };
    debug_v2?: {
        validDays: {
            rhrDays: number;
            stepsDays: number;
            sleepDays: number;
            hrvDays: number;
        };
    };
    // Aggregates from the API (approximate from drivers)
    drivers?: Array<{
        key: string;
        points: number;
        text: string;
    }>;
}

// Parsed metabolic score data for UI
interface MetabolicScoreData {
    score7d: number | null;
    confidence: 'high' | 'medium' | 'low' | 'insufficient_data';
    components: {
        rhrBad: number | null;
        stepsBad: number | null;
        sleepBad: number | null;
        hrvBad: number | null;
    } | null;
    aggregates: {
        weeklyRHR: number | null;
        weeklySteps: number | null;
        weeklySleep: number | null;
        weeklyHRV: number | null;
    };
    dataCompleteness: {
        rhrDays: number;
        stepsDays: number;
        sleepDays: number;
        hrvDays: number;
    };
}

const ACTION_BASELINE_DAYS = 7;
const DEFAULT_TARGET_MIN = 3.9;
const DEFAULT_TARGET_MAX = 10.0;
const ACTION_FOCUS_OPTIONS: { label: string; value: ActionFocusKey }[] = [
    { label: 'GLUCOSE', value: 'glucose' },
    { label: 'ACTIVITY', value: 'activity' },
    { label: 'SLEEP', value: 'sleep' },
];

const BEHAVIOR_SEGMENTED_PALETTE = {
    containerBg: 'rgba(118, 118, 128, 0.12)',
    containerBorder: 'rgba(60, 60, 67, 0.06)',
    sliderColors: ['rgba(255,255,255,1)', 'rgba(255,255,255,0.98)', 'rgba(255,255,255,1)'] as [string, string, string],
    sliderBorder: 'rgba(0,0,0,0.04)',
    inactiveText: '#8E8E93',
    activeText: '#1C1C1E',
};
const ACTION_TYPE_TO_FOCUS: Record<string, ActionFocusKey> = {
    post_meal_walk: 'activity',
    log_activity: 'activity',
    steps_boost: 'activity',
    light_activity: 'activity',
    sleep_window: 'sleep',
    sleep_logging: 'sleep',
    sleep_consistency: 'sleep',
    log_glucose: 'glucose',
    meal_pairing: 'glucose',
    pre_meal_fibre: 'glucose',
    fiber_boost: 'glucose',
    log_meal: 'glucose',
    meal_checkin: 'glucose',
    log_weight: 'activity',
};

const EXPERIMENT_SLUG_TO_FOCUS: Record<string, ActionFocusKey> = {
    'oatmeal-vs-eggs': 'glucose',
    'rice-portion-swap': 'glucose',
    'fiber-preload': 'glucose',
    'meal-timing': 'glucose',
    'breakfast-skip': 'glucose',
    'acv-shot': 'glucose',
    'hydration-challenge': 'glucose',
    'post-meal-walk': 'activity',
    'cold-shower': 'activity',
    'box-breathing': 'sleep',
};

function mapTemplateFocus(slug: string, category: string): ActionFocusKey {
    if (EXPERIMENT_SLUG_TO_FOCUS[slug]) return EXPERIMENT_SLUG_TO_FOCUS[slug];
    if (category === 'meal' || category === 'portion' || category === 'timing') return 'glucose';
    return 'activity';
}

const PROGRESS_RANGES = [30, 90, 180];

function addHours(date: Date, hours: number): Date {
    const result = new Date(date.getTime());
    result.setHours(result.getHours() + hours);
    return result;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

function clamp01(value: number): number {
    return clamp(value, 0, 1);
}

function mapInsightCategoryToFocus(category: InsightCategory): ActionFocusKey {
    if (category === 'sleep') return 'sleep';
    if (category === 'activity' || category === 'weight') return 'activity';
    return 'glucose';
}

function mapActionTypeToFocus(actionType: string): ActionFocusKey {
    const normalized = actionType.toLowerCase();
    const mapped = ACTION_TYPE_TO_FOCUS[normalized];
    if (mapped) return mapped;

    if (normalized.includes('sleep')) return 'sleep';
    if (
        normalized.includes('glucose') ||
        normalized.includes('meal') ||
        normalized.includes('fiber') ||
        normalized.includes('fibre')
    ) {
        return 'glucose';
    }
    return 'activity';
}

// Calculate component score (0-100) based on "badness" formulas
// 100 = Perfect, 0 = Bad
function calculateComponentScore(type: 'sleep' | 'activity' | 'glucose', value: number | null): number | null {
    if (value === null) return null;

    let badness = 0;

    switch (type) {
        case 'sleep':
            // Sleep duration: clamp01(abs(weeklySleep - 7.5) / 2.5)
            // 7.5 is ideal. < 5 or > 10 is max badness.
            badness = clamp01(Math.abs(value - 7.5) / 2.5);
            break;
        case 'activity':
            // Steps: clamp01(1 - (weeklySteps - 3000) / (12000 - 3000))
            // 12000 is ideal (0 badness). 3000 is max badness.
            badness = clamp01(1 - (value - 3000) / (9000));
            break;
        case 'glucose':
            // Glucose: Using Time In Range % as the metric.
            // 100% TIR = 0 badness. 50% TIR = 1 badness (?)
            // Let's say < 50% TIR is max badness.
            // badness = clamp01(1 - (tir - 50) / (100 - 50))
            badness = clamp01(1 - (value - 50) / 50);
            break;
    }

    return Math.round(100 * (1 - badness));
}

function addDays(date: Date, days: number): Date {
    const result = new Date(date.getTime());
    result.setDate(result.getDate() + days);
    return result;
}

function toDateKey(value: string | Date): string {
    const date = typeof value === 'string' ? new Date(value) : value;
    return date.toISOString().split('T')[0];
}

function getDateRange(days: number): { startDate: Date; endDate: Date } {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);
    return { startDate, endDate };
}

function getRangeKey(days: number): '7d' | '14d' | '30d' | '90d' {
    if (days <= 7) return '7d';
    if (days <= 14) return '14d';
    if (days <= 30) return '30d';
    return '90d';
}

function isWithinWindow(dateValue: string, start: Date, end: Date): boolean {
    const ts = new Date(dateValue).getTime();
    return ts >= start.getTime() && ts <= end.getTime();
}

function computeGlucoseStats(
    logs: GlucoseLog[],
    targetMin: number,
    targetMax: number
): { average: number | null; timeInRange: number | null; cv: number | null; count: number } {
    if (!logs.length) {
        return { average: null, timeInRange: null, cv: null, count: 0 };
    }

    const total = logs.reduce((sum, log) => sum + log.glucose_level, 0);
    const average = total / logs.length;
    const variance = logs.reduce((sum, log) => sum + Math.pow(log.glucose_level - average, 2), 0) / logs.length;
    const stdDev = Math.sqrt(variance);
    const cv = average > 0 ? (stdDev / average) * 100 : null;
    const inZoneCount = logs.filter(log => log.glucose_level >= targetMin && log.glucose_level <= targetMax).length;
    const timeInRange = (inZoneCount / logs.length) * 100;

    return {
        average,
        timeInRange,
        cv,
        count: logs.length,
    };
}

function formatMetricValue(metricKey: MetricKey, value: number | null, glucoseUnit: string): string {
    if (value === null || value === undefined || Number.isNaN(value)) return 'N/A';

    switch (metricKey) {
        case 'glucose_avg':
            return formatGlucoseWithUnit(value, glucoseUnit as any);
        case 'time_in_range':
            return `${Math.round(value)}%`;
        case 'steps':
        case 'meal_count':
        case 'checkin_count':
        case 'glucose_logs_count':
        case 'weight_logs_count':
            return `${Math.round(value)}`;
        case 'sleep_hours':
            return `${value.toFixed(1)}h`;
        default:
            return `${value}`;
    }
}

function getMetricDirection(metricKey: MetricKey): 'up' | 'down' {
    if (metricKey === 'glucose_avg') return 'down';
    return 'up';
}

function isImproved(metricKey: MetricKey, delta: number): boolean {
    const direction = getMetricDirection(metricKey);
    return direction === 'down' ? delta < 0 : delta > 0;
}

function computeVelocity(scores: MetabolicWeeklyScore[], rangeDays: number): {
    latest: number | null;
    delta: number | null;
    perWeek: number | null;
    points: number;
} {
    const weeks = Math.max(2, Math.round(rangeDays / 7));
    const filtered = scores
        .filter(score => score.score7d !== null)
        .slice(0, weeks)
        .reverse();

    if (filtered.length < 2) {
        return { latest: filtered[0]?.score7d ?? null, delta: null, perWeek: null, points: filtered.length };
    }

    const first = filtered[0].score7d as number;
    const last = filtered[filtered.length - 1].score7d as number;
    const delta = last - first;
    const perWeek = delta / (filtered.length - 1);

    return {
        latest: last,
        delta,
        perWeek,
        points: filtered.length,
    };
}

export default function InsightsScreen() {
    const { user, profile } = useAuth();
    const glucoseUnit = useGlucoseUnit();
    const params = useLocalSearchParams();
    const insets = useSafeAreaInsets();
    const isBehaviorV1 = isBehaviorV1Experience(profile?.experience_variant);
    const HEADER_HEIGHT = (isBehaviorV1 ? 132 : 120) + insets.top;

    const [activeTab, setActiveTab] = useState<TabKey>(
        profile?.experience_variant === 'behavior_v1' ? 'actions' : 'progress'
    );
    const [activeFocusTab, setActiveFocusTab] = useState<ActionFocusKey>('activity');
    const insightsRangeDays = 30;

    // Scroll-based header animation
    const scrollY = useRef(new Animated.Value(0)).current;
    const SCROLL_THRESHOLD = 50;

    // Header background opacity - transparent at top, opaque when scrolled
    const headerBgOpacity = scrollY.interpolate({
        inputRange: [0, SCROLL_THRESHOLD],
        outputRange: [0, 1],
        extrapolate: 'clamp',
    });

    const handleScroll = Animated.event(
        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
        { useNativeDriver: true }
    );


    const [glucoseLogs, setGlucoseLogs] = useState<GlucoseLog[]>([]);
    const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
    const [meals, setMeals] = useState<MealWithCheckin[]>([]);
    const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
    const [dailyContext, setDailyContext] = useState<DailyContext[]>([]);
    const [actions, setActions] = useState<UserAction[]>([]);
    const [avgFibrePerDay, setAvgFibrePerDay] = useState<number | undefined>(undefined);

    const [carePathway, setCarePathway] = useState<UserCarePathway | null>(null);
    const [pathwayTemplates, setPathwayTemplates] = useState<CarePathwayTemplate[]>([]);
    const [weeklyScores, setWeeklyScores] = useState<MetabolicWeeklyScore[]>([]);

    const [insightsLoading, setInsightsLoading] = useState(true);
    const [actionsLoading, setActionsLoading] = useState(false);
    const [pathwayLoading, setPathwayLoading] = useState(false);
    const [metabolicScore, setMetabolicScore] = useState<MetabolicScoreData | null>(null);
    const [metabolicScoreLoading, setMetabolicScoreLoading] = useState(false);

    const {
        review: weeklyReview,
        loading: weeklyReviewLoading,
        dismiss: dismissWeeklyReview,
    } = useWeeklyReview(user?.id, isBehaviorV1);

    const { action: nbaAction, source: nbaSource, loading: nbaLoading, trackTap } = useNextBestAction(user?.id, isBehaviorV1);

    // Experiments state
    const [suggestedExperiments, setSuggestedExperiments] = useState<SuggestedExperiment[]>([]);
    const [activeExperiments, setActiveExperiments] = useState<UserExperiment[]>([]);
    const [allTemplates, setAllTemplates] = useState<ExperimentTemplate[]>([]);
    const [experimentsLoading, setExperimentsLoading] = useState(false);
    const [startingExperiment, setStartingExperiment] = useState<string | null>(null);
    const [expandedCardIds, setExpandedCardIds] = useState<Set<string>>(new Set());

    const toggleCardExpanded = (id: string) => {
        triggerHaptic();
        setExpandedCardIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const syncingActionsRef = useRef(false);
    const syncingFeaturesRef = useRef(false);
    const behaviorDefaultAppliedRef = useRef(false);
    const behaviorFocusDefaultAppliedRef = useRef(false);

    const targetMin = profile?.target_min ?? DEFAULT_TARGET_MIN;
    const targetMax = profile?.target_max ?? DEFAULT_TARGET_MAX;
    const trackingMode = (profile?.tracking_mode || 'meals_wearables') as TrackingMode;

    React.useEffect(() => {
        if (isBehaviorV1 && !behaviorDefaultAppliedRef.current) {
            setActiveTab('actions');
            behaviorDefaultAppliedRef.current = true;
        }
    }, [isBehaviorV1]);

    const { startDate, endDate } = useMemo(() => getDateRange(insightsRangeDays), [insightsRangeDays]);
    const startDateKey = useMemo(() => toDateKey(startDate), [startDate]);
    const endDateKey = useMemo(() => toDateKey(endDate), [endDate]);

    const fallbackData = useMemo((): InsightData => {
        const glucoseStats = computeGlucoseStats(glucoseLogs, targetMin, targetMax);
        const mealsWithCheckins = meals.filter(meal => (meal.meal_checkins || []).length > 0);
        const mealsWithWalkAfter = meals.filter(meal =>
            meal.meal_checkins?.some(checkin => checkin.movement_after)
        );
        const dailyWithSteps = dailyContext.filter(day => day.steps !== null);
        const dailyWithActive = dailyContext.filter(day => day.active_minutes !== null);
        const dailyWithSleep = dailyContext.filter(day => day.sleep_hours !== null);
        const avgSteps = dailyWithSteps.length
            ? Math.round(dailyWithSteps.reduce((sum, day) => sum + (day.steps || 0), 0) / dailyWithSteps.length)
            : undefined;
        const avgActiveMinutes = dailyWithActive.length
            ? Math.round(dailyWithActive.reduce((sum, day) => sum + (day.active_minutes || 0), 0) / dailyWithActive.length)
            : undefined;
        const avgSleep = dailyWithSleep.length
            ? Math.round((dailyWithSleep.reduce((sum, day) => sum + (day.sleep_hours || 0), 0) / dailyWithSleep.length) * 10) / 10
            : undefined;

        return {
            glucoseLogs,
            glucoseLogsCount: glucoseStats.count,
            timeInZonePercent: glucoseStats.timeInRange ?? undefined,
            userTargetMin: targetMin,
            userTargetMax: targetMax,
            meals,
            weightLogsCount: weightLogs.length,
            avgSleepHours: avgSleep,
            avgSteps,
            avgActiveMinutes,
            avgFibrePerDay,
            mealsWithWalkAfter: mealsWithWalkAfter.length,
            totalMealsThisWeek: meals.length,
            checkinsThisWeek: mealsWithCheckins.length,
        };
    }, [glucoseLogs, meals, weightLogs.length, dailyContext, targetMin, targetMax, avgFibrePerDay]);

    const { insights: personalInsights, loading: personalInsightsLoading } = usePersonalInsights({
        userId: user?.id,
        trackingMode,
        rangeKey: getRangeKey(insightsRangeDays),
        enabled: !!user?.id,
        fallbackData,
        generationOptions: {
            experienceVariant: isBehaviorV1 ? 'behavior_v1' : 'legacy',
            readinessLevel: profile?.readiness_level ?? undefined,
            comBBarrier: profile?.com_b_barrier ?? undefined,
            showGlucoseAdvanced: profile?.show_glucose_advanced ?? false,
        },
    });

    const fetchCoreData = useCallback(async () => {
        if (!user) {
            setInsightsLoading(false);
            return;
        }

        setInsightsLoading(true);
        try {
            const [logs, activities, mealsData, weightData, dailyData, fibreSummary, pathway, templates, weekly] = await Promise.all([
                getGlucoseLogsByDateRange(user.id, startDate, endDate),
                getActivityLogsByDateRange(user.id, startDate, endDate),
                getMealsWithCheckinsByDateRange(user.id, startDate, endDate),
                getWeightLogsByDateRange(user.id, startDate, endDate),
                getDailyContextByRange(user.id, startDateKey, endDateKey),
                getFibreIntakeSummary(user.id, 'month'),
                getActiveCarePathway(user.id),
                getCarePathwayTemplates(),
                getMetabolicWeeklyScores(user.id, 26),
            ]);

            setGlucoseLogs(logs);
            setActivityLogs(activities);
            setMeals(mealsData);
            setWeightLogs(weightData);
            setDailyContext(dailyData);
            setCarePathway(pathway);
            setPathwayTemplates(templates);
            setWeeklyScores(weekly);
            setAvgFibrePerDay(
                fibreSummary?.avgPerDay !== null && fibreSummary?.avgPerDay !== undefined
                    ? fibreSummary.avgPerDay
                    : undefined
            );
        } catch (error) {
            console.error('Error fetching insights data:', error);
        } finally {
            setInsightsLoading(false);
        }
    }, [user, startDate, endDate, startDateKey, endDateKey]);

    const fetchActions = useCallback(async () => {
        if (!user) return;
        setActionsLoading(true);
        try {
            const results = await getUserActionsByStatus(user.id, ['active', 'completed', 'expired']);
            setActions(results);
        } catch (error) {
            console.error('Error fetching actions:', error);
        } finally {
            setActionsLoading(false);
        }
    }, [user]);

    const fetchExperimentsData = useCallback(async () => {
        if (!user) return;
        setExperimentsLoading(true);
        try {
            const [active, suggestions, templates] = await Promise.all([
                getUserExperiments(user.id, ['draft', 'active']),
                getSuggestedExperiments(user.id, 6),
                getExperimentTemplates(),
            ]);
            setActiveExperiments(active);
            if (suggestions?.suggestions) setSuggestedExperiments(suggestions.suggestions);
            setAllTemplates(templates);
        } catch (error) {
            console.error('Error fetching experiments:', error);
        } finally {
            setExperimentsLoading(false);
        }
    }, [user]);

    const fetchMetabolicScore = useCallback(async () => {
        if (!user) return;
        setMetabolicScoreLoading(true);
        try {
            const { data, error } = await supabase.functions.invoke('metabolic-score', {
                body: { user_id: user.id, range: '7d' }
            });

            if (error) {
                console.error('Error fetching metabolic score:', error);
                return;
            }

            const response = data as MetabolicScoreResponse;

            // Parse the response into our UI-friendly format
            // Extract aggregates from daily context if available
            const parsed: MetabolicScoreData = {
                score7d: response.score7d,
                confidence: response.confidence_v2 || response.v2?.confidence || 'insufficient_data',
                components: response.components_v2 ? {
                    rhrBad: response.components_v2.rhrBad,
                    stepsBad: response.components_v2.stepsBad,
                    sleepBad: response.components_v2.sleepBad,
                    hrvBad: response.components_v2.hrvBad,
                } : null,
                aggregates: {
                    // These will be populated from dailyContext computed values
                    weeklyRHR: null,
                    weeklySteps: null,
                    weeklySleep: null,
                    weeklyHRV: null,
                },
                dataCompleteness: response.debug_v2?.validDays || {
                    rhrDays: 0,
                    stepsDays: 0,
                    sleepDays: 0,
                    hrvDays: 0,
                },
            };

            setMetabolicScore(parsed);
        } catch (error) {
            console.error('Error fetching metabolic score:', error);
        } finally {
            setMetabolicScoreLoading(false);
        }
    }, [user]);

    useFocusEffect(
        useCallback(() => {
            fetchCoreData();
            fetchActions();
            fetchExperimentsData();
            fetchMetabolicScore();
        }, [fetchCoreData, fetchActions, fetchExperimentsData, fetchMetabolicScore])
    );

    useFocusEffect(
        useCallback(() => {
            if (isBehaviorV1) {
                setActiveTab('actions');
                return;
            }
            if (params.tab && ['actions', 'progress', 'experiments'].includes(params.tab as string)) {
                setActiveTab(params.tab as TabKey);
            }
        }, [params.tab, isBehaviorV1])
    );

    const computeMetricValue = useCallback((
        metricKey: MetricKey,
        windowStart: Date,
        windowEnd: Date
    ): number | null => {
        switch (metricKey) {
            case 'meal_count':
                return meals.filter(meal => isWithinWindow(meal.logged_at, windowStart, windowEnd)).length;
            case 'checkin_count':
                return meals.reduce((count, meal) => {
                    const matches = (meal.meal_checkins || []).filter(checkin =>
                        isWithinWindow(checkin.created_at, windowStart, windowEnd)
                    ).length;
                    return count + matches;
                }, 0);
            case 'glucose_logs_count':
                return glucoseLogs.filter(log => isWithinWindow(log.logged_at, windowStart, windowEnd)).length;
            case 'glucose_avg': {
                const windowLogs = glucoseLogs.filter(log => isWithinWindow(log.logged_at, windowStart, windowEnd));
                const stats = computeGlucoseStats(windowLogs, targetMin, targetMax);
                return stats.average;
            }
            case 'time_in_range': {
                const windowLogs = glucoseLogs.filter(log => isWithinWindow(log.logged_at, windowStart, windowEnd));
                const stats = computeGlucoseStats(windowLogs, targetMin, targetMax);
                return stats.timeInRange;
            }
            case 'steps': {
                const startKey = toDateKey(windowStart);
                const endKey = toDateKey(windowEnd);
                const values = dailyContext
                    .filter(day => day.steps !== null && day.date >= startKey && day.date <= endKey)
                    .map(day => day.steps || 0);
                if (!values.length) return null;
                return values.reduce((sum, value) => sum + value, 0) / values.length;
            }
            case 'sleep_hours': {
                const startKey = toDateKey(windowStart);
                const endKey = toDateKey(windowEnd);
                const values = dailyContext
                    .filter(day => day.sleep_hours !== null && day.date >= startKey && day.date <= endKey)
                    .map(day => day.sleep_hours || 0);
                if (!values.length) return null;
                return values.reduce((sum, value) => sum + value, 0) / values.length;
            }
            case 'weight_logs_count':
                return weightLogs.filter(log => isWithinWindow(log.logged_at, windowStart, windowEnd)).length;
            default:
                return null;
        }
    }, [meals, glucoseLogs, dailyContext, weightLogs, targetMin, targetMax]);

    // Component score calculations (moved to top level to avoid hook errors)
    const last7DaysEnd = useMemo(() => new Date(), []);
    const last7DaysStart = useMemo(() => addDays(last7DaysEnd, -7), [last7DaysEnd]);

    const avgSleep7d = useMemo(() => {
        return computeMetricValue('sleep_hours', last7DaysStart, last7DaysEnd);
    }, [computeMetricValue, last7DaysStart, last7DaysEnd]);

    const avgSteps7d = useMemo(() => {
        return computeMetricValue('steps', last7DaysStart, last7DaysEnd);
    }, [computeMetricValue, last7DaysStart, last7DaysEnd]);

    const avgTIR7d = useMemo(() => {
        return computeMetricValue('time_in_range', last7DaysStart, last7DaysEnd);
    }, [computeMetricValue, last7DaysStart, last7DaysEnd]);

    const sleepScore = calculateComponentScore('sleep', avgSleep7d);
    const activityScore = calculateComponentScore('activity', avgSteps7d);
    const glucoseScore = calculateComponentScore('glucose', avgTIR7d);

    const detectActionCompletion = useCallback((action: UserAction): boolean => {
        const windowStart = new Date(action.window_start);
        const windowEnd = new Date(action.window_end);

        switch (action.action_type) {
            case 'log_meal':
            case 'meal_pairing':
            case 'fiber_boost':
            case 'meal_timing':
                return meals.some(meal => isWithinWindow(meal.logged_at, windowStart, windowEnd));
            case 'meal_checkin':
                return meals.some(meal =>
                    meal.meal_checkins?.some(checkin => isWithinWindow(checkin.created_at, windowStart, windowEnd))
                );
            case 'log_activity':
            case 'post_meal_walk':
            case 'steps_boost':
            case 'light_activity':
                return activityLogs.some(log => isWithinWindow(log.logged_at, windowStart, windowEnd));
            case 'log_glucose':
                return glucoseLogs.some(log => isWithinWindow(log.logged_at, windowStart, windowEnd));
            case 'log_weight':
                return weightLogs.some(log => isWithinWindow(log.logged_at, windowStart, windowEnd));
            case 'sleep_logging':
            case 'sleep_window':
            case 'sleep_consistency': {
                const startKey = toDateKey(windowStart);
                const endKey = toDateKey(windowEnd);
                return dailyContext.some(day => day.sleep_hours !== null && day.date >= startKey && day.date <= endKey);
            }
            default:
                return false;
        }
    }, [meals, activityLogs, glucoseLogs, weightLogs, dailyContext]);

    const syncActionOutcomes = useCallback(async () => {
        if (!user || syncingActionsRef.current || actionsLoading) return;
        syncingActionsRef.current = true;

        try {
            const updates: Promise<UserAction | null>[] = [];
            const now = new Date();

            actions.forEach(action => {
                let patch: Partial<UserAction> | null = null;
                const windowStart = new Date(action.window_start);
                const windowEnd = new Date(action.window_end);
                const metricKey = (action.action_params?.metricKey || action.action_params?.metric_key || action.action_params?.metric || action.action_params?.metricType) as MetricKey | undefined;

                if (action.status === 'active') {
                    const autoCompleted = detectActionCompletion(action);
                    if (autoCompleted) {
                        patch = {
                            status: 'completed',
                            completed_at: new Date().toISOString(),
                            completion_source: 'auto',
                        };
                    } else if (now > windowEnd) {
                        patch = { status: 'expired' };
                    }
                }

                if (metricKey && (action.status === 'completed' || patch?.status === 'completed' || (now > windowEnd))) {
                    const baselineStart = addDays(windowStart, -ACTION_BASELINE_DAYS);
                    const baselineValue = computeMetricValue(metricKey, baselineStart, windowStart);
                    const outcomeValue = computeMetricValue(metricKey, windowStart, windowEnd);

                    if (baselineValue !== null && outcomeValue !== null) {
                        const delta = outcomeValue - baselineValue;
                        const improved = isImproved(metricKey, delta);

                        // Check if values actually changed to prevent infinite loop
                        const hasChanges =
                            action.baseline_metric?.value !== baselineValue ||
                            action.outcome_metric?.value !== outcomeValue ||
                            action.delta_value !== delta ||
                            action.improved !== improved;

                        if (hasChanges) {
                            patch = {
                                ...patch,
                                baseline_metric: {
                                    metricKey,
                                    value: baselineValue,
                                    window_start: baselineStart.toISOString(),
                                    window_end: windowStart.toISOString(),
                                },
                                outcome_metric: {
                                    metricKey,
                                    value: outcomeValue,
                                    window_start: windowStart.toISOString(),
                                    window_end: windowEnd.toISOString(),
                                },
                                delta_value: delta,
                                improved,
                                last_evaluated_at: new Date().toISOString(),
                            } as Partial<UserAction>;
                        }
                    }
                }

                if (patch) {
                    updates.push(updateUserAction(action.id, patch));
                }
            });

            if (updates.length) {
                await Promise.all(updates);
                await fetchActions();
            }
        } catch (error) {
            console.error('Error syncing action outcomes:', error);
        } finally {
            syncingActionsRef.current = false;
        }
    }, [user, actions, actionsLoading, computeMetricValue, detectActionCompletion, fetchActions]);

    const syncDailyFeatures = useCallback(async () => {
        if (!user || syncingFeaturesRef.current) return;
        if (!glucoseLogs.length && !meals.length && !dailyContext.length) return;

        syncingFeaturesRef.current = true;

        try {
            const dateKeys = new Set<string>();
            glucoseLogs.forEach(log => dateKeys.add(toDateKey(log.logged_at)));
            meals.forEach(meal => dateKeys.add(toDateKey(meal.logged_at)));
            dailyContext.forEach(day => dateKeys.add(day.date));

            const sortedKeys = Array.from(dateKeys).sort();
            for (const key of sortedKeys) {
                const dayStart = new Date(`${key}T00:00:00.000Z`);
                const dayEnd = new Date(`${key}T23:59:59.999Z`);

                const dayLogs = glucoseLogs.filter(log => isWithinWindow(log.logged_at, dayStart, dayEnd));
                const dayMeals = meals.filter(meal => isWithinWindow(meal.logged_at, dayStart, dayEnd));
                const dayCheckins = dayMeals.reduce((count, meal) => count + ((meal.meal_checkins || []).length), 0);
                const dayContext = dailyContext.find(day => day.date === key);

                const glucoseStats = computeGlucoseStats(dayLogs, targetMin, targetMax);
                const mealCount = dayMeals.length;
                const fibreAvg = null;
                const interactions = {
                    sleep_to_glucose: dayContext?.sleep_hours && glucoseStats.average
                        ? Number((dayContext.sleep_hours / glucoseStats.average).toFixed(3))
                        : null,
                    steps_to_glucose: dayContext?.steps && glucoseStats.average
                        ? Math.round(dayContext.steps / glucoseStats.average)
                        : null,
                    meals_to_glucose: mealCount > 0 && glucoseStats.average
                        ? Number((glucoseStats.average / mealCount).toFixed(2))
                        : null,
                };

                await upsertMetabolicDailyFeature(user.id, {
                    date: key,
                    feature_version: 1,
                    glucose_avg: glucoseStats.average,
                    glucose_cv: glucoseStats.cv,
                    glucose_logs_count: glucoseStats.count,
                    time_in_range_pct: glucoseStats.timeInRange,
                    meal_count: mealCount,
                    meal_checkin_count: dayCheckins,
                    fibre_g_avg: fibreAvg,
                    steps: dayContext?.steps ?? null,
                    active_minutes: dayContext?.active_minutes ?? null,
                    sleep_hours: dayContext?.sleep_hours ?? null,
                    resting_hr: dayContext?.resting_hr ?? null,
                    hrv_ms: dayContext?.hrv_ms ?? null,
                    interactions,
                });
            }
        } catch (error) {
            console.error('Error syncing daily features:', error);
        } finally {
            syncingFeaturesRef.current = false;
        }
    }, [user, glucoseLogs, meals, dailyContext, targetMin, targetMax]);

    useFocusEffect(
        useCallback(() => {
            syncActionOutcomes();
        }, [syncActionOutcomes])
    );

    useFocusEffect(
        useCallback(() => {
            syncDailyFeatures();
        }, [syncDailyFeatures])
    );

    const syncCarePathwayOutcome = useCallback(async () => {
        if (!carePathway || carePathway.status !== 'active') return;
        const endAt = new Date(carePathway.end_at);
        if (Date.now() < endAt.getTime()) return;

        const startAt = new Date(carePathway.start_at);
        const outcomeMetrics = {
            time_in_range: computeMetricValue('time_in_range', startAt, endAt),
            glucose_avg: computeMetricValue('glucose_avg', startAt, endAt),
        };

        const baselineMetrics = carePathway.baseline_metrics || {};
        const delta = {
            time_in_range: outcomeMetrics.time_in_range !== null && baselineMetrics.time_in_range !== undefined
                ? outcomeMetrics.time_in_range - baselineMetrics.time_in_range
                : null,
            glucose_avg: outcomeMetrics.glucose_avg !== null && baselineMetrics.glucose_avg !== undefined
                ? outcomeMetrics.glucose_avg - baselineMetrics.glucose_avg
                : null,
        };

        const updated = await updateCarePathway(carePathway.id, {
            status: 'completed',
            outcome_metrics: outcomeMetrics,
            delta,
        });

        if (updated) setCarePathway(updated);
    }, [carePathway, computeMetricValue, updateCarePathway]);

    useFocusEffect(
        useCallback(() => {
            syncCarePathwayOutcome();
        }, [syncCarePathwayOutcome])
    );

    const handleStartAction = async (insightId: string, action: InsightAction) => {
        if (!user) return;
        triggerHaptic('medium');
        const windowStart = new Date();
        const windowEnd = addHours(windowStart, action.windowHours || 48);
        const metricKey = action.metricKey as MetricKey;
        const baselineStart = addDays(windowStart, -ACTION_BASELINE_DAYS);
        const baselineValue = computeMetricValue(metricKey, baselineStart, windowStart);

        const created = await createUserAction(user.id, {
            source_insight_id: insightId,
            title: action.title,
            description: action.description,
            action_type: action.actionType,
            action_params: {
                metricKey: action.metricKey,
                windowHours: action.windowHours,
            },
            window_end: windowEnd.toISOString(),
            baseline_metric: baselineValue !== null ? {
                metricKey,
                value: baselineValue,
                window_start: baselineStart.toISOString(),
                window_end: windowStart.toISOString(),
            } : null,
        });

        if (created) {
            await fetchActions();
        }
    };

    const handleMarkActionDone = async (action: UserAction) => {
        triggerHaptic('medium');
        await updateUserAction(action.id, {
            status: 'completed',
            completed_at: new Date().toISOString(),
            completion_source: 'manual',
        });
        await fetchActions();
    };

    const handleStartPathway = async (template: CarePathwayTemplate) => {
        if (!user) return;
        triggerHaptic('medium');
        setPathwayLoading(true);
        try {
            const now = new Date();
            const endAt = addDays(now, template.duration_days);
            const baselineStart = addDays(now, -ACTION_BASELINE_DAYS);
            const baselineMetrics = {
                time_in_range: computeMetricValue('time_in_range', baselineStart, now),
                glucose_avg: computeMetricValue('glucose_avg', baselineStart, now),
            };

            const created = await startCarePathway(user.id, template.id, endAt.toISOString(), baselineMetrics);
            setCarePathway(created);
        } catch (error) {
            console.error('Error starting care pathway:', error);
            Alert.alert('Error', 'Unable to start the pathway right now.');
        } finally {
            setPathwayLoading(false);
        }
    };

    const handleTogglePathwayStep = async (stepId: string) => {
        triggerHaptic();
        if (!carePathway) return;
        const completed = Array.isArray(carePathway.progress?.completed_step_ids)
            ? carePathway.progress.completed_step_ids
            : [];
        const updated = completed.includes(stepId)
            ? completed.filter((id: string) => id !== stepId)
            : [...completed, stepId];

        const next = await updateCarePathway(carePathway.id, {
            progress: { ...carePathway.progress, completed_step_ids: updated },
        });
        if (next) setCarePathway(next);
    };

    const handleStartExperiment = async (suggestion: SuggestedExperiment) => {
        if (!user || startingExperiment) return;
        triggerHaptic('medium');
        setStartingExperiment(suggestion.template.id);
        try {
            const experiment = await startUserExperiment(
                user.id,
                suggestion.template.id,
                suggestion.recommended_parameters,
                {
                    reasons: suggestion.reasons,
                    predicted_impact: suggestion.predicted_impact,
                }
            );

            if (experiment) {
                setStartingExperiment(null);
                fetchExperimentsData();
                router.push('/experiments-list' as any);
            } else {
                setStartingExperiment(null);
                Alert.alert('Error', 'Failed to start experiment.');
            }
        } catch (error) {
            console.error('Error starting experiment:', error);
            setStartingExperiment(null);
            Alert.alert('Error', 'Something went wrong.');
        }
    };

    const handleStartFromTemplate = (template: ExperimentTemplate) => {
        if (!user || startingExperiment) return;
        triggerHaptic();
        // If user already has an active experiment for this template, go to detail
        const existing = activeExperiments.find(e => e.template_id === template.id);
        if (existing) {
            router.push({ pathname: '/experiment-detail', params: { id: existing.id } } as any);
            return;
        }

        const durationDays = template.protocol?.duration_days || 7;
        Alert.alert(
            `Start "${template.title}"?`,
            `${template.short_description || template.description || ''}\n\nThis is a ${durationDays}-day experiment. You'll log completion each day.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Start Experiment',
                    onPress: async () => {
                        setStartingExperiment(template.id);
                        try {
                            const experiment = await startUserExperiment(user.id, template.id);
                            if (experiment) {
                                setStartingExperiment(null);
                                fetchExperimentsData();
                                router.push({ pathname: '/experiment-detail', params: { id: experiment.id } } as any);
                            } else {
                                setStartingExperiment(null);
                                Alert.alert('Error', 'Failed to start experiment.');
                            }
                        } catch (error) {
                            console.error('Error starting experiment:', error);
                            setStartingExperiment(null);
                            Alert.alert('Error', 'Something went wrong.');
                        }
                    },
                },
            ]
        );
    };

    const actionCandidates = useMemo(() => {
        const activeActionTypes = new Set(actions.filter(a => a.status === 'active').map(a => a.action_type));
        return personalInsights.filter(insight => !activeActionTypes.has(insight.action.actionType));
    }, [personalInsights, actions]);

    const activeActions = useMemo(() => actions.filter(action => action.status === 'active'), [actions]);
    const recentActions = useMemo(() => actions.filter(action => action.status !== 'active').slice(0, 3), [actions]);
    const legacyActionCandidates = useMemo(() => actionCandidates.slice(0, 4), [actionCandidates]);
    const focusedActionCandidates = useMemo(
        () => actionCandidates
            .filter(insight => mapInsightCategoryToFocus(insight.category) === activeFocusTab)
            .slice(0, 4),
        [actionCandidates, activeFocusTab]
    );
    const focusedActiveActions = useMemo(
        () => activeActions.filter(action => mapActionTypeToFocus(action.action_type) === activeFocusTab),
        [activeActions, activeFocusTab]
    );
    const focusedRecentActions = useMemo(
        () => recentActions.filter(action => mapActionTypeToFocus(action.action_type) === activeFocusTab),
        [recentActions, activeFocusTab]
    );

    const glucoseStats = useMemo(() => computeGlucoseStats(glucoseLogs, targetMin, targetMax), [glucoseLogs, targetMin, targetMax]);

    const defaultFocusTab = useMemo<ActionFocusKey>(() => {
        const firstActive = activeActions[0];
        if (firstActive) return mapActionTypeToFocus(firstActive.action_type);
        const firstCandidate = actionCandidates[0];
        if (firstCandidate) return mapInsightCategoryToFocus(firstCandidate.category);
        return 'activity';
    }, [activeActions, actionCandidates]);

    React.useEffect(() => {
        if (!isBehaviorV1 || behaviorFocusDefaultAppliedRef.current) return;
        if (actionsLoading || personalInsightsLoading) return;
        setActiveFocusTab(defaultFocusTab);
        behaviorFocusDefaultAppliedRef.current = true;
    }, [isBehaviorV1, actionsLoading, personalInsightsLoading, defaultFocusTab]);

    const focusPanel = useMemo(() => {
        if (activeFocusTab === 'glucose') {
            const inRange = glucoseStats.timeInRange;
            const hasZone = inRange !== null && inRange !== undefined;
            return {
                title: 'Glucose Plan',
                icon: 'water-outline' as const,
                metric: hasZone ? `${Math.round(inRange)}% in zone` : 'Optional signal',
                detail: hasZone
                    ? `Personalized next steps from ${glucoseStats.count} readings this range.`
                    : 'Use glucose actions when you want deeper feedback. Meal-based actions still personalize this plan.',
                emptyTitle: 'No glucose actions queued',
                emptyText: 'Add one signal to unlock your next personalized glucose step.',
                cta: { label: 'Log glucose', route: '/log-glucose' },
            };
        }

        if (activeFocusTab === 'sleep') {
            const hasSleep = avgSleep7d !== null && avgSleep7d !== undefined;
            return {
                title: 'Sleep Plan',
                icon: 'moon-outline' as const,
                metric: hasSleep ? `${avgSleep7d.toFixed(1)}h avg` : 'Build baseline',
                detail: hasSleep
                    ? 'Personalized bedtime consistency actions tuned to your recent sleep pattern.'
                    : 'Log sleep for a few nights to unlock more precise sleep actions.',
                emptyTitle: 'No sleep actions queued',
                emptyText: 'Start with one simple sleep action tonight to build momentum.',
                cta: { label: 'View patterns', route: '/insights?tab=progress' },
            };
        }

        const hasSteps = avgSteps7d !== null && avgSteps7d !== undefined;
        return {
            title: 'Activity Plan',
            icon: 'walk-outline' as const,
            metric: hasSteps ? `${Math.round(avgSteps7d).toLocaleString()} avg steps` : 'Build baseline',
            detail: hasSteps
                ? 'Personalized movement actions based on your current weekly activity rhythm.'
                : 'Log activity to unlock personalized movement targets and pacing.',
            emptyTitle: 'No activity actions queued',
            emptyText: 'Add one movement log to generate your next activity action.',
            cta: { label: 'Log activity', route: '/log-activity' },
        };
    }, [activeFocusTab, glucoseStats.timeInRange, glucoseStats.count, avgSleep7d, avgSteps7d]);

    const shouldRecommendPathway = useMemo(() => {
        if (glucoseStats.timeInRange === null || glucoseStats.timeInRange === undefined || glucoseStats.count < 7) {
            return false;
        }
        return glucoseStats.timeInRange < 60;
    }, [glucoseStats]);

    const activePathwayTemplate = useMemo(() => {
        if (carePathway?.template) return carePathway.template;
        return pathwayTemplates.find(template => template.slug === 'high-glucose-7d-reset') || null;
    }, [carePathway, pathwayTemplates]);

    const velocity = useMemo(() => computeVelocity(weeklyScores, 30), [weeklyScores]);

    const habitsSummary = useMemo(() => {
        const uniqueMealDays = new Set(meals.map(meal => toDateKey(meal.logged_at)));
        const checkinCount = meals.reduce((count, meal) => count + ((meal.meal_checkins || []).length), 0);
        const postMealWalks = meals.reduce((count, meal) => {
            const hasWalk = meal.meal_checkins?.some(checkin => checkin.movement_after);
            return count + (hasWalk ? 1 : 0);
        }, 0);

        return {
            mealDays: uniqueMealDays.size,
            checkinCount,
            postMealWalks,
        };
    }, [meals]);

    const dataCoverage = useMemo(() => {
        const sleepDays = dailyContext.filter(day => day.sleep_hours !== null).length;
        const stepsDays = dailyContext.filter(day => day.steps !== null).length;
        const glucoseDays = new Set(glucoseLogs.map(log => toDateKey(log.logged_at))).size;
        const mealDays = new Set(meals.map(meal => toDateKey(meal.logged_at))).size;

        return { sleepDays, stepsDays, glucoseDays, mealDays };
    }, [dailyContext, glucoseLogs, meals]);

    const renderActionCard = (action: UserAction) => {
        const isExpanded = expandedCardIds.has(action.id);
        const windowEnd = new Date(action.window_end);
        const timeLeft = Math.max(0, Math.ceil((windowEnd.getTime() - Date.now()) / (1000 * 60 * 60)));
        const metricKey = (action.action_params?.metricKey || 'time_in_range') as MetricKey;
        const outcomeValue = action.outcome_metric?.value ?? null;
        const baselineValue = action.baseline_metric?.value ?? null;
        const deltaValue = action.delta_value ?? null;
        const improvementLabel = deltaValue !== null
            ? `${deltaValue > 0 ? '+' : ''}${formatMetricValue(metricKey, deltaValue, glucoseUnit)}`
            : 'Pending';

        const deltaStyle = action.improved === null || action.improved === undefined
            ? styles.deltaNeutral
            : action.improved
                ? styles.deltaPositive
                : styles.deltaNegative;

        return (
            <View key={action.id} style={[styles.actionCard, isBehaviorV1 && styles.behaviorActionCard]}>
                <View style={styles.actionHeaderRow}>
                    <Text style={[styles.actionTitleHero, isBehaviorV1 && styles.behaviorActionTitleHero]}>{action.title}</Text>
                    <TouchableOpacity onPress={() => toggleCardExpanded(action.id)} hitSlop={10}>
                        <Ionicons
                            name={isExpanded ? "information-circle" : "information-circle-outline"}
                            size={22}
                            color={Colors.textTertiary}
                        />
                    </TouchableOpacity>
                </View>

                <Text style={[styles.actionDescription, isBehaviorV1 && styles.behaviorActionDescription]}>{action.description}</Text>

                {isExpanded && (
                    <View style={[styles.expandedContent, isBehaviorV1 && styles.behaviorExpandedContent]}>
                        <Text style={[styles.actionMeta, isBehaviorV1 && styles.behaviorActionMeta]}>Window ends in {timeLeft}h</Text>
                        <View style={styles.actionOutcomeRow}>
                            <View>
                                <Text style={[styles.actionOutcomeLabel, isBehaviorV1 && styles.behaviorActionOutcomeLabel]}>Baseline</Text>
                                <Text style={[styles.actionOutcomeValue, isBehaviorV1 && styles.behaviorActionOutcomeValue]}>{formatMetricValue(metricKey, baselineValue, glucoseUnit)}</Text>
                            </View>
                            <View>
                                <Text style={[styles.actionOutcomeLabel, isBehaviorV1 && styles.behaviorActionOutcomeLabel]}>Outcome</Text>
                                <Text style={[styles.actionOutcomeValue, isBehaviorV1 && styles.behaviorActionOutcomeValue]}>{formatMetricValue(metricKey, outcomeValue, glucoseUnit)}</Text>
                            </View>
                            <View>
                                <Text style={[styles.actionOutcomeLabel, isBehaviorV1 && styles.behaviorActionOutcomeLabel]}>Delta</Text>
                                <Text style={[styles.actionOutcomeValue, deltaStyle]}>
                                    {improvementLabel}
                                </Text>
                            </View>
                        </View>
                    </View>
                )}

                {action.status === 'active' && (
                    <View style={styles.actionButtons}>
                        {/* If there's a CTA for this action, show it alongside Mark Done, or prioritizing it? 
                             For now, keeping Mark Done as primary for "Active" loop management. 
                             User requested "Start action" vs "Log" conflict resolution. 
                             For Active items, "Log" is usually the way to complete it.
                         */}
                        {action.cta ? (
                            <TouchableOpacity
                                style={[styles.primaryButton, isBehaviorV1 && styles.behaviorPrimaryButton]}
                                onPress={() => {
                                    triggerHaptic();
                                    if (action.cta?.route) {
                                        router.push(action.cta.route as any);
                                    }
                                }}
                            >
                                <Text style={[styles.primaryButtonText, isBehaviorV1 && styles.behaviorPrimaryButtonText]}>{action.cta.label}</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity
                                style={[styles.primaryButton, isBehaviorV1 && styles.behaviorPrimaryButton]}
                                onPress={() => handleMarkActionDone(action)}
                            >
                                <Text style={[styles.primaryButtonText, isBehaviorV1 && styles.behaviorPrimaryButtonText]}>Mark done</Text>
                            </TouchableOpacity>
                        )}
                        {/* Option to mark done if CTA exists? Maybe secondary. Keeping simple for now. */}
                    </View>
                )}
            </View>
        );
    };

    const renderActionCandidates = (
        candidates: PersonalInsight[],
        emptyState: { title: string; text: string; cta?: { label: string; route: string } }
    ) => {
        if (personalInsightsLoading) {
            return <ActivityIndicator color={Colors.textTertiary} style={{ marginVertical: 12 }} />;
        }

        if (candidates.length === 0) {
            return (
                <View style={[styles.emptyStateCard, isBehaviorV1 && styles.behaviorEmptyStateCard]}>
                    <Image source={Images.mascots.thinking} style={styles.emptyStateImage} />
                    <Text style={[styles.emptyStateTitle, isBehaviorV1 && styles.behaviorEmptyStateTitle]}>{emptyState.title}</Text>
                    <Text style={[styles.emptyStateText, isBehaviorV1 && styles.behaviorEmptyStateText]}>{emptyState.text}</Text>
                    {emptyState.cta && (
                        <TouchableOpacity
                            style={[styles.emptyStateCtaButton, isBehaviorV1 && styles.behaviorEmptyStateCtaButton]}
                            onPress={() => {
                                triggerHaptic();
                                router.push(emptyState.cta?.route as any);
                            }}
                        >
                            <Text style={[styles.emptyStateCtaText, isBehaviorV1 && styles.behaviorEmptyStateCtaText]}>
                                {emptyState.cta.label}
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>
            );
        }

        return candidates.map(insight => {
            const isExpanded = expandedCardIds.has(insight.id);
            return (
                <View key={insight.id} style={[styles.actionCard, isBehaviorV1 && styles.behaviorActionCard]}>
                    <View style={styles.actionHeaderRow}>
                        <Text style={[styles.actionTitleHero, isBehaviorV1 && styles.behaviorActionTitleHero]}>{insight.action.title}</Text>
                        <TouchableOpacity onPress={() => toggleCardExpanded(insight.id)} hitSlop={10}>
                            <Ionicons
                                name={isExpanded ? "information-circle" : "information-circle-outline"}
                                size={22}
                                color={Colors.textTertiary}
                            />
                        </TouchableOpacity>
                    </View>

                    <Text style={[styles.actionDescription, isBehaviorV1 && styles.behaviorActionDescription]}>{insight.action.description}</Text>

                    {isExpanded && (
                        <View style={[styles.expandedContent, isBehaviorV1 && styles.behaviorExpandedContent]}>
                            <Text style={[styles.actionMeta, isBehaviorV1 && styles.behaviorActionMeta]}>Insight: {insight.because}</Text>
                            <View style={[styles.statusPill, isBehaviorV1 && styles.behaviorStatusPill]}>
                                <Text style={[styles.statusPillText, isBehaviorV1 && styles.behaviorStatusPillText]}>
                                    Duration: {insight.action.windowHours}h
                                </Text>
                            </View>
                        </View>
                    )}

                    <View style={styles.actionButtons}>
                        <TouchableOpacity
                            style={[styles.primaryButton, isBehaviorV1 && styles.behaviorPrimaryButton]}
                            onPress={() => handleStartAction(insight.id, insight.action)}
                        >
                            <Text style={[styles.primaryButtonText, isBehaviorV1 && styles.behaviorPrimaryButtonText]}>Start action</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            );
        });
    };

    const renderCarePathway = () => {
        const template = activePathwayTemplate;
        if (!template) return null;

        if (carePathway) {
            const startAt = new Date(carePathway.start_at);
            const endAt = new Date(carePathway.end_at);
            const totalDays = template.duration_days;
            const dayIndex = Math.min(totalDays, Math.max(1, Math.ceil((Date.now() - startAt.getTime()) / (1000 * 60 * 60 * 24))));
            const completedSteps = Array.isArray(carePathway.progress?.completed_step_ids)
                ? carePathway.progress.completed_step_ids
                : [];
            const steps = template.steps || [];

            return (
                <View style={[styles.pathwayCard, isBehaviorV1 && styles.behaviorPathwayCard]}>
                    <View style={styles.pathwayHeader}>
                        <View>
                            <Text style={[styles.pathwayTitle, isBehaviorV1 && styles.behaviorPathwayTitle]}>{template.title}</Text>
                            <Text style={[styles.pathwayMeta, isBehaviorV1 && styles.behaviorPathwayMeta]}>
                                Day {dayIndex} of {totalDays} · ends {toDateKey(endAt)}
                            </Text>
                        </View>
                        <View style={[styles.statusPill, isBehaviorV1 && styles.behaviorStatusPill]}>
                            <Text style={[styles.statusPillText, isBehaviorV1 && styles.behaviorStatusPillText]}>
                                {carePathway.status}
                            </Text>
                        </View>
                    </View>
                    <Text style={[styles.pathwayDescription, isBehaviorV1 && styles.behaviorPathwayDescription]}>
                        {template.description}
                    </Text>

                    <View style={styles.pathwaySteps}>
                        {steps.map(step => {
                            const isDone = completedSteps.includes(step.id);
                            return (
                                <TouchableOpacity
                                    key={step.id}
                                    style={[
                                        styles.pathwayStepRow,
                                        isBehaviorV1 && styles.behaviorPathwayStepRow,
                                        isDone && styles.pathwayStepRowDone,
                                    ]}
                                    onPress={() => handleTogglePathwayStep(step.id)}
                                >
                                    <Ionicons
                                        name={isDone ? 'checkmark-circle' : 'ellipse-outline'}
                                        size={18}
                                        color={isDone ? Colors.success : Colors.textTertiary}
                                    />
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.pathwayStepTitle, isBehaviorV1 && styles.behaviorPathwayStepTitle]}>
                                            {step.title}
                                        </Text>
                                        <Text style={[styles.pathwayStepDescription, isBehaviorV1 && styles.behaviorPathwayStepDescription]}>
                                            {step.description}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {carePathway.delta && (
                        <View style={styles.pathwayOutcomeRow}>
                            <View>
                                <Text style={[styles.pathwayOutcomeLabel, isBehaviorV1 && styles.behaviorPathwayOutcomeLabel]}>
                                    Delta (time-in-zone)
                                </Text>
                                <Text style={[styles.pathwayOutcomeValue, isBehaviorV1 && styles.behaviorPathwayOutcomeValue]}>
                                    {formatMetricValue('time_in_range', carePathway.delta.time_in_range ?? null, glucoseUnit)}
                                </Text>
                            </View>
                            <View>
                                <Text style={[styles.pathwayOutcomeLabel, isBehaviorV1 && styles.behaviorPathwayOutcomeLabel]}>
                                    Delta (avg glucose)
                                </Text>
                                <Text style={[styles.pathwayOutcomeValue, isBehaviorV1 && styles.behaviorPathwayOutcomeValue]}>
                                    {formatMetricValue('glucose_avg', carePathway.delta.glucose_avg ?? null, glucoseUnit)}
                                </Text>
                            </View>
                        </View>
                    )}

                    <Disclaimer variant="short" style={styles.pathwayDisclaimer} />
                </View>
            );
        }

        if (shouldRecommendPathway) {
            return (
                <View style={[styles.pathwayCard, isBehaviorV1 && styles.behaviorPathwayCard]}>
                    <Text style={[styles.pathwayTitle, isBehaviorV1 && styles.behaviorPathwayTitle]}>{template.title}</Text>
                    <Text style={[styles.pathwayDescription, isBehaviorV1 && styles.behaviorPathwayDescription]}>
                        A structured 7-day plan to steady your recent trend.
                    </Text>
                    <Text style={[styles.pathwayMeta, isBehaviorV1 && styles.behaviorPathwayMeta]}>
                        Triggered by {Math.round(glucoseStats.timeInRange || 0)}% time-in-zone.
                    </Text>
                    <TouchableOpacity
                        style={[styles.primaryButton, isBehaviorV1 && styles.behaviorPrimaryButton]}
                        onPress={() => handleStartPathway(template)}
                        disabled={pathwayLoading}
                    >
                        <Text style={[styles.primaryButtonText, isBehaviorV1 && styles.behaviorPrimaryButtonText]}>
                            Start 7-day pathway
                        </Text>
                    </TouchableOpacity>
                </View>
            );
        }

        return (
            <View style={[styles.pathwayCard, isBehaviorV1 && styles.behaviorPathwayCard]}>
                <Text style={[styles.pathwayTitle, isBehaviorV1 && styles.behaviorPathwayTitle]}>{template.title}</Text>
                <Text style={[styles.pathwayDescription, isBehaviorV1 && styles.behaviorPathwayDescription]}>
                    A structured plan becomes available once a trend needs intervention.
                </Text>
            </View>
        );
    };

    const renderLegacyActionsTab = () => (
        <Animated.ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: HEADER_HEIGHT + 16 }]} showsVerticalScrollIndicator={false} onScroll={handleScroll} scrollEventThrottle={16}>
            <Text style={styles.sectionTitle}>Action Loop</Text>
            <Text style={styles.sectionDescription}>Every signal maps to a 24-72 hour next step.</Text>

            {actionsLoading ? (
                <ActivityIndicator color={Colors.textTertiary} style={{ marginVertical: 16 }} />
            ) : (
                <>
                    {activeActions.length > 0 && (
                        <View style={styles.sectionBlock}>
                            <Text style={styles.sectionSubtitle}>Active actions</Text>
                            {activeActions.map(renderActionCard)}
                        </View>
                    )}

                    <View style={styles.sectionBlock}>
                        <Text style={styles.sectionSubtitle}>Recommended next steps</Text>
                        {renderActionCandidates(legacyActionCandidates, {
                            title: 'No new actions right now',
                            text: 'Keep logging to unlock the next step.',
                        })}
                    </View>

                    {recentActions.length > 0 && (
                        <View style={styles.sectionBlock}>
                            <Text style={styles.sectionSubtitle}>Recent outcomes</Text>
                            {recentActions.map(renderActionCard)}
                        </View>
                    )}
                </>
            )}

            <Text style={styles.sectionTitle}>Care Pathway</Text>
            <Text style={styles.sectionDescription}>Structured 7-day plans close the loop from signal to outcome.</Text>
            {renderCarePathway()}
        </Animated.ScrollView>
    );

    const renderWeeklyReviewCard = () => {
        if (!weeklyReview || weeklyReviewLoading) return null;

        const directionIcon = weeklyReview.metric_direction === 'up' ? 'trending-up' :
            weeklyReview.metric_direction === 'down' ? 'trending-down' : 'remove-outline';
        const directionColor = weeklyReview.metric_direction === 'up' ? Colors.success :
            weeklyReview.metric_direction === 'down' ? Colors.warning : Colors.textSecondary;

        return (
            <View style={styles.weeklyReviewCard}>
                <View style={styles.weeklyReviewHeader}>
                    <View style={styles.weeklyReviewBadge}>
                        <Ionicons name="sparkles-outline" size={14} color={Colors.primary} />
                        <Text style={styles.weeklyReviewBadgeText}>Weekly Pattern</Text>
                    </View>
                    <TouchableOpacity onPress={dismissWeeklyReview} hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}>
                        <Ionicons name="close" size={18} color={Colors.textTertiary} />
                    </TouchableOpacity>
                </View>
                <Text style={styles.weeklyReviewText}>{weeklyReview.text}</Text>
                {weeklyReview.experiment_suggestion && (
                    <View style={styles.weeklyReviewExperiment}>
                        <Ionicons name="flask-outline" size={14} color={Colors.primary} />
                        <Text style={styles.weeklyReviewExperimentText}>{weeklyReview.experiment_suggestion}</Text>
                    </View>
                )}
                <View style={styles.weeklyReviewMetric}>
                    <Ionicons name={directionIcon as any} size={14} color={directionColor} />
                    <Text style={[styles.weeklyReviewMetricText, { color: directionColor }]}>
                        {weeklyReview.key_metric.replace(/_/g, ' ')}
                    </Text>
                </View>
            </View>
        );
    };

    const activeExperimentForCard = useMemo(() => {
        return activeExperiments.find(e => e.status === 'active' && e.experiment_templates);
    }, [activeExperiments]);

    // Filter library templates to exclude the active experiment's template
    const libraryTemplates = useMemo(() => {
        const activeTemplateId = activeExperimentForCard?.template_id;
        return allTemplates.filter(t => t.id !== activeTemplateId);
    }, [allTemplates, activeExperimentForCard]);

    // Suggested experiments filtered by active focus tab (AI-personalized, ranked by score)
    const focusedSuggestions = useMemo(() => {
        const activeTemplateId = activeExperimentForCard?.template_id;
        return suggestedExperiments
            .filter(s => s.template.id !== activeTemplateId)
            .filter(s => mapTemplateFocus(s.template.slug, s.template.category) === activeFocusTab)
            .sort((a, b) => b.score - a.score);
    }, [suggestedExperiments, activeFocusTab, activeExperimentForCard]);

    // Fallback: filtered library templates when no suggestions available for this tab
    const focusedLibraryFallback = useMemo(() => {
        if (focusedSuggestions.length > 0) return [];
        return libraryTemplates.filter(t => mapTemplateFocus(t.slug, t.category) === activeFocusTab);
    }, [libraryTemplates, activeFocusTab, focusedSuggestions.length]);

    const renderNextBestActionCard = () => {
        if (nbaLoading) {
            return (
                <View style={styles.nbaCard}>
                    <View style={styles.nbaShimmer}>
                        <ActivityIndicator color="rgba(45, 212, 191, 0.6)" size="small" />
                        <Text style={styles.nbaShimmerText}>Finding your next best action...</Text>
                    </View>
                </View>
            );
        }

        if (!nbaAction) return null;

        return (
            <View style={styles.nbaCard}>
                <View style={styles.nbaHeader}>
                    <View style={styles.nbaLabelRow}>
                        <Ionicons name="sparkles" size={14} color="rgba(45, 212, 191, 1)" />
                        <Text style={styles.nbaLabel}>SUGGESTED FOR YOU</Text>
                    </View>
                    <View style={[styles.nbaSourceBadge, nbaSource === 'ai' ? styles.nbaSourceAi : styles.nbaSourceRules]}>
                        <Text style={[styles.nbaSourceText, nbaSource === 'ai' ? styles.nbaSourceTextAi : styles.nbaSourceTextRules]}>
                            {nbaSource === 'ai' ? 'AI' : 'Rules'}
                        </Text>
                    </View>
                </View>
                <Text style={styles.nbaTitle}>{nbaAction.title}</Text>
                <Text style={styles.nbaDescription}>{nbaAction.description}</Text>
                {nbaAction.because ? (
                    <Text style={styles.nbaBecause}>{nbaAction.because}</Text>
                ) : null}
            </View>
        );
    };

    const renderBehaviorActionsTab = () => (
        <Animated.ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: HEADER_HEIGHT + 4 }]} showsVerticalScrollIndicator={false} onScroll={handleScroll} scrollEventThrottle={16}>
            {/* AI Next Best Action - hero card */}
            {renderNextBestActionCard()}

            {/* Focus panel summary */}
            <View style={[styles.focusSummaryCard, styles.behaviorFocusSummaryCard]}>
                <View style={styles.focusSummaryHeader}>
                    <View style={[styles.focusSummaryIcon, styles.behaviorFocusSummaryIcon]}>
                        <Ionicons name={focusPanel.icon} size={16} color="rgba(45, 212, 191, 1)" />
                    </View>
                    <View style={styles.focusSummaryTextWrap}>
                        <Text style={[styles.focusSummaryTitle, styles.behaviorFocusSummaryTitle]}>{focusPanel.title}</Text>
                        <Text style={[styles.focusSummaryMetric, styles.behaviorFocusSummaryMetric]}>{focusPanel.metric}</Text>
                    </View>
                </View>
                <Text style={[styles.focusSummaryBody, styles.behaviorFocusSummaryBody]}>{focusPanel.detail}</Text>
            </View>

            {/* Current experiment (if active and matches focus tab) */}
            {activeExperimentForCard && (
                <View style={styles.experimentsSection}>
                    <Text style={styles.experimentsSectionLabel}>CURRENT EXPERIMENT</Text>
                    <ActiveExperimentCard experiment={activeExperimentForCard} onStopped={fetchExperimentsData} />
                </View>
            )}

            {/* Personalized experiments for this focus tab */}
            {experimentsLoading ? (
                <ActivityIndicator color={Colors.textTertiary} style={{ marginVertical: 12 }} />
            ) : (
                <View style={styles.experimentsSection}>
                    <View style={styles.experimentsLibraryHeader}>
                        <Text style={styles.experimentsLibraryTitle}>Try an Experiment</Text>
                        <TouchableOpacity onPress={() => { triggerHaptic(); router.push('/experiments-list' as any); }}>
                            <Text style={styles.experimentsFilterLink}>See all</Text>
                        </TouchableOpacity>
                    </View>
                    {focusedSuggestions.length > 0 ? (
                        <View style={styles.experimentsGrid}>
                            {focusedSuggestions.map((suggestion) => (
                                <View key={suggestion.template.id} style={styles.experimentsGridItem}>
                                    <ExperimentLibraryCard
                                        template={suggestion.template}
                                        onPress={handleStartFromTemplate}
                                        reason={suggestion.reasons?.[0]}
                                    />
                                </View>
                            ))}
                            {focusedSuggestions.length % 2 !== 0 && <View style={styles.experimentsGridItem} />}
                        </View>
                    ) : focusedLibraryFallback.length > 0 ? (
                        <View style={styles.experimentsGrid}>
                            {focusedLibraryFallback.map((template) => (
                                <View key={template.id} style={styles.experimentsGridItem}>
                                    <ExperimentLibraryCard
                                        template={template}
                                        onPress={handleStartFromTemplate}
                                    />
                                </View>
                            ))}
                            {focusedLibraryFallback.length % 2 !== 0 && <View style={styles.experimentsGridItem} />}
                        </View>
                    ) : (
                        <View style={styles.focusEmptyExperiments}>
                            <Text style={styles.focusEmptyExperimentsText}>
                                No experiments available for this focus area yet.
                            </Text>
                            <TouchableOpacity onPress={() => { triggerHaptic(); router.push('/experiments-list' as any); }}>
                                <Text style={styles.experimentsFilterLink}>Browse all experiments</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            )}
        </Animated.ScrollView>
    );

    const renderActionsTab = () => (
        isBehaviorV1 ? renderBehaviorActionsTab() : renderLegacyActionsTab()
    );

    const renderProgressTab = () => {
        const score = metabolicScore?.score7d ?? velocity.latest;
        const hasScore = score !== null;

        const getScoreColor = (s: number | null) => {
            if (s === null) return Colors.textTertiary;
            if (s >= 70) return Colors.success;
            if (s >= 50) return Colors.warning;
            return Colors.error;
        };

        const getScoreLabel = (s: number | null) => {
            if (s === null) return 'No data';
            if (s >= 70) return 'Excellent';
            if (s >= 50) return 'Good';
            return 'Needs focus';
        };

        // Get last 7 days data (sorted oldest first for charts)
        const last7Days = dailyContext.slice(0, 7).reverse();

        // Extract histories for each metric
        const rhrHistory = last7Days.map(d => d.resting_hr);
        const hrvHistory = last7Days.map(d => d.hrv_ms);
        const stepsHistory = last7Days.map(d => d.steps);
        const sleepHistory = last7Days.map(d => d.sleep_hours);

        // Compute trend from history
        const computeTrend = (history: (number | null)[]): 'up' | 'down' | 'neutral' | null => {
            const valid = history.filter((v): v is number => v !== null);
            if (valid.length < 3) return null;
            const recent = valid.slice(-3);
            const earlier = valid.slice(0, 3);
            const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
            const earlierAvg = earlier.reduce((a, b) => a + b, 0) / earlier.length;
            const diff = recentAvg - earlierAvg;
            if (Math.abs(diff) < (earlierAvg * 0.05)) return 'neutral';
            return diff > 0 ? 'up' : 'down';
        };

        // Compute aggregates from dailyContext for display
        const computedAggregates = {
            weeklyRHR: (() => {
                const last7 = dailyContext.slice(0, 7).filter(d => d.resting_hr !== null);
                if (last7.length === 0) return null;
                return last7.reduce((sum, d) => sum + (d.resting_hr || 0), 0) / last7.length;
            })(),
            weeklySteps: avgSteps7d,
            weeklySleep: avgSleep7d,
            weeklyHRV: (() => {
                const last7 = dailyContext.slice(0, 7).filter(d => d.hrv_ms !== null);
                if (last7.length === 0) return null;
                return last7.reduce((sum, d) => sum + (d.hrv_ms || 0), 0) / last7.length;
            })(),
        };

        // Count days with any data
        const daysWithData = dailyContext.slice(0, 7).filter(d =>
            d.steps !== null || d.sleep_hours !== null || d.resting_hr !== null || d.hrv_ms !== null
        ).length;

        return (
            <Animated.ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: HEADER_HEIGHT + 16 }]} showsVerticalScrollIndicator={false} onScroll={handleScroll} scrollEventThrottle={16}>
                {/* Section 1: Hero Score Card */}
                <View style={[styles.progressCard, { alignItems: 'center', paddingVertical: 28 }]}>
                    {metabolicScoreLoading ? (
                        <ActivityIndicator color={Colors.textTertiary} style={{ marginVertical: 40 }} />
                    ) : hasScore ? (
                        <>
                            <MetabolicScoreRing
                                size={120}
                                score={score}
                                scoreColor={getScoreColor(score)}
                            />
                            <Text style={styles.heroTitle}>Metabolic Health</Text>
                            <View style={styles.heroSubtitleRow}>
                                <Text style={[styles.heroSubtitle, { color: getScoreColor(score) }]}>
                                    {getScoreLabel(score)}
                                </Text>
                                {velocity.delta !== null && (
                                    <View style={styles.deltaPillInline}>
                                        <Ionicons
                                            name={velocity.delta >= 0 ? 'arrow-up' : 'arrow-down'}
                                            size={10}
                                            color={velocity.delta >= 0 ? Colors.success : Colors.error}
                                        />
                                        <Text style={[
                                            styles.deltaTextInline,
                                            { color: velocity.delta >= 0 ? Colors.success : Colors.error }
                                        ]}>
                                            {velocity.delta >= 0 ? '+' : ''}{Math.round(velocity.delta)}
                                        </Text>
                                    </View>
                                )}
                            </View>
                        </>
                    ) : (
                        <>
                            <MetabolicScoreRing size={120} />
                            <Text style={styles.heroTitle}>Metabolic Health</Text>
                            <Text style={styles.heroSubtitle}>
                                Log more data to unlock your score
                            </Text>
                        </>
                    )}
                </View>

                {/* Section 2: Metric Cards Grid */}
                <Text style={[styles.sectionTitle, { marginBottom: 4 }]}>Score Breakdown</Text>
                <View style={styles.metricsGrid}>
                    <View style={styles.gridRow}>
                        <MetricCard
                            icon="heart"
                            label="Resting HR"
                            value={computedAggregates.weeklyRHR}
                            unit="bpm"
                            color={Colors.heartRate}
                            trend={computeTrend(rhrHistory)}
                            history={rhrHistory}
                            higherIsBetter={false}
                        />
                        <MetricCard
                            icon="pulse"
                            label="HRV"
                            value={computedAggregates.weeklyHRV}
                            unit="ms"
                            color={Colors.primary}
                            trend={computeTrend(hrvHistory)}
                            history={hrvHistory}
                            higherIsBetter={true}
                        />
                    </View>
                    <View style={styles.gridRow}>
                        <MetricCard
                            icon="footsteps"
                            label="Steps"
                            value={computedAggregates.weeklySteps}
                            unit=""
                            color={Colors.activity}
                            trend={computeTrend(stepsHistory)}
                            history={stepsHistory}
                            higherIsBetter={true}
                        />
                        <MetricCard
                            icon="moon"
                            label="Sleep"
                            value={computedAggregates.weeklySleep}
                            unit="h"
                            color={Colors.sleep}
                            trend={computeTrend(sleepHistory)}
                            history={sleepHistory}
                            higherIsBetter={true}
                        />
                    </View>
                </View>

                {/* Section 3: Simplified Data Coverage */}
                <DataCoverageCard
                    confidence={metabolicScore?.confidence || 'insufficient_data'}
                    daysWithData={daysWithData}
                />
                {/* Add habits and data coverage sections back */}
                <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Compounding Habits</Text>
                <Text style={styles.sectionDescription}>Habits that build momentum over 30+ days.</Text>

                <View style={styles.habitRow}>
                    <View style={styles.habitCard}>
                        <Text style={styles.habitValue}>{habitsSummary.mealDays}</Text>
                        <Text style={styles.habitLabel}>Days logged meals</Text>
                    </View>
                    <View style={styles.habitCard}>
                        <Text style={styles.habitValue}>{habitsSummary.checkinCount}</Text>
                        <Text style={styles.habitLabel}>Meal check-ins</Text>
                    </View>
                    <View style={styles.habitCard}>
                        <Text style={styles.habitValue}>{habitsSummary.postMealWalks}</Text>
                        <Text style={styles.habitLabel}>Post-meal walks</Text>
                    </View>
                </View>

                <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Data Coverage</Text>
                <Text style={styles.sectionDescription}>Standardized signals powering your longitudinal dataset.</Text>

                <View style={styles.progressCard}>
                    <Text style={styles.dataCoverageText}>Sleep days: {dataCoverage.sleepDays}</Text>
                    <Text style={styles.dataCoverageText}>Steps days: {dataCoverage.stepsDays}</Text>
                    <Text style={styles.dataCoverageText}>Glucose days: {dataCoverage.glucoseDays}</Text>
                    <Text style={styles.dataCoverageText}>Meal days: {dataCoverage.mealDays}</Text>
                </View>
            </Animated.ScrollView>
        );
    };



    const renderExperimentsTab = () => (
        <Animated.ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: HEADER_HEIGHT + 16 }]} showsVerticalScrollIndicator={false} onScroll={handleScroll} scrollEventThrottle={16}>
            <View style={styles.experimentsHeader}>
                <Text style={styles.sectionTitle}>Find What Works For You</Text>
                <Text style={styles.sectionDescription}>Structured experiments refine what actually moves your numbers.</Text>
                <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={() => { triggerHaptic(); router.push('/experiments-list' as any); }}
                >
                    <Text style={styles.primaryButtonText}>Browse experiments</Text>
                </TouchableOpacity>
            </View>

            <Text style={styles.sectionSubtitle}>Active experiments</Text>
            {activeExperiments.length === 0 ? (
                <Text style={styles.emptyStateText}>No active experiments yet.</Text>
            ) : (
                activeExperiments.map(experiment => (
                    <View key={experiment.id} style={styles.actionCard}>
                        <Text style={styles.actionTitle}>{experiment.experiment_templates?.title || 'Experiment'}</Text>
                        <Text style={styles.actionMeta}>Status: {experiment.status}</Text>
                    </View>
                ))
            )}

            <Text style={styles.sectionSubtitle}>Suggested next tests</Text>
            {experimentsLoading ? (
                <ActivityIndicator color={Colors.textTertiary} style={{ marginVertical: 16 }} />
            ) : (
                suggestedExperiments.map(suggestion => (
                    <View key={suggestion.template.id} style={styles.actionCard}>
                        <Text style={styles.actionTitle}>{suggestion.template.title}</Text>
                        <Text style={styles.actionDescription}>{suggestion.template.subtitle}</Text>
                        <TouchableOpacity
                            style={styles.primaryButton}
                            onPress={() => handleStartExperiment(suggestion)}
                        >
                            <Text style={styles.primaryButtonText}>
                                {startingExperiment === suggestion.template.id ? 'Starting...' : 'Start experiment'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                ))
            )}
        </Animated.ScrollView>
    );

    return (
        <View style={styles.container}>
            <ForestGlassBackground />

            {/* Content - scrolls behind header */}
            <View style={styles.safeArea}>
                {insightsLoading ? (
                    <View style={[styles.loadingContainer, { paddingTop: HEADER_HEIGHT + 8 }]}>
                        <ActivityIndicator color={Colors.textTertiary} />
                        <Text style={styles.loadingText}>
                            {isBehaviorV1 ? 'Loading action plans...' : 'Loading insights...'}
                        </Text>
                    </View>
                ) : (
                    isBehaviorV1 ? (
                        renderBehaviorActionsTab()
                    ) : (
                        <>
                            {activeTab === 'progress' && renderProgressTab()}
                            {activeTab === 'actions' && renderActionsTab()}
                            {activeTab === 'experiments' && renderExperimentsTab()}
                        </>
                    )
                )}
            </View>

            {/* Blurred Header */}
            <View style={styles.blurHeaderContainer}>
                {/* Animated background - transparent at top, opaque when scrolled */}
                <Animated.View style={[styles.headerBackground, { opacity: headerBgOpacity }]} />
                <View style={{ paddingTop: insets.top }}>
                    {isBehaviorV1 ? (
                        <View style={styles.behaviorHeaderContainer}>
                            <View style={styles.planHeaderRow}>
                                <Text style={[styles.behaviorHeaderTitle, styles.behaviorHeaderTitleTuned]}>ACTION PLAN</Text>
                                <View style={[styles.betaPill, styles.behaviorBetaPill]}>
                                    <Text style={[styles.betaPillText, styles.behaviorBetaPillText]}>BETA</Text>
                                </View>
                            </View>
                            <View style={styles.focusControlWrap}>
                                <SegmentedControl
                                    options={ACTION_FOCUS_OPTIONS}
                                    value={activeFocusTab}
                                    onChange={setActiveFocusTab}
                                    palette={BEHAVIOR_SEGMENTED_PALETTE}
                                />
                            </View>
                        </View>
                    ) : (
                        <>
                            <View style={styles.header}>
                                <Text style={styles.headerTitle}>INSIGHTS</Text>
                            </View>
                            <View style={styles.segmentedControlContainer}>
                                <SegmentedControl
                                    options={[
                                        { label: 'PROGRESS', value: 'progress' },
                                        { label: 'ACTIONS', value: 'actions' },
                                        { label: 'EXPERIMENTS', value: 'experiments' },
                                    ]}
                                    value={activeTab}
                                    onChange={setActiveTab}
                                />
                            </View>
                        </>
                    )}
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    behaviorScreenVeil: {
        ...StyleSheet.absoluteFillObject,
    },
    safeArea: {
        flex: 1,
    },
    blurHeaderContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
    },
    headerBackground: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(255, 255, 255, 0.75)',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    headerTitle: {
        fontFamily: fonts.bold,
        fontSize: 18,
        color: Colors.textPrimary,
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    segmentedControlContainer: {
        paddingHorizontal: 16,
        paddingBottom: 0,
    },
    behaviorHeaderContainer: {
        paddingHorizontal: 16,
        paddingTop: 20,
        paddingBottom: 6,
        gap: 12,
    },
    behaviorHeaderTitle: {
        fontFamily: fonts.bold,
        fontSize: 18,
        color: Colors.textPrimary,
        letterSpacing: 1,
    },
    behaviorHeaderTitleTuned: {
        color: Colors.textPrimary,
    },
    subtitle: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: Colors.textSecondary,
        textAlign: 'center',
        marginBottom: 10,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingBottom: 160,
        gap: 16,
    },
    loadingContainer: {
        paddingTop: 40,
        alignItems: 'center',
        gap: 8,
    },
    loadingText: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: Colors.textTertiary,
    },
    sectionTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 18,
        color: Colors.textPrimary,
    },
    behaviorSectionTitle: {
        color: Colors.textPrimary,
    },
    sectionSubtitle: {
        fontFamily: fonts.semiBold,
        fontSize: 15,
        color: Colors.textPrimary,
        marginBottom: 8,
    },
    behaviorSectionSubtitle: {
        color: Colors.textPrimary,
    },
    sectionDescription: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: Colors.textSecondary,
    },
    behaviorSectionDescription: {
        color: Colors.textSecondary,
    },
    sectionBlock: {
        gap: 12,
    },
    planHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        alignSelf: 'flex-start',
    },
    betaPill: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(60, 60, 67, 0.18)',
        backgroundColor: 'rgba(0, 0, 0, 0.04)',
    },
    betaPillText: {
        fontFamily: fonts.semiBold,
        fontSize: 11,
        color: Colors.textSecondary,
        letterSpacing: 0.4,
    },
    behaviorBetaPill: {
        borderColor: 'rgba(60, 60, 67, 0.12)',
        backgroundColor: 'rgba(45, 212, 191, 0.08)',
    },
    behaviorBetaPillText: {
        color: Colors.textSecondary,
    },
    focusControlWrap: {
        marginTop: 2,
    },
    focusSummaryCard: {
        borderRadius: 18,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderWidth: 1,
        borderColor: 'rgba(60, 60, 67, 0.08)',
        backgroundColor: '#FFFFFF',
        gap: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
    },
    behaviorFocusSummaryCard: {
        borderColor: 'rgba(60, 60, 67, 0.08)',
    },
    focusSummaryHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    focusSummaryIcon: {
        width: 30,
        height: 30,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(45, 212, 191, 0.08)',
        borderWidth: 1,
        borderColor: 'rgba(45, 212, 191, 0.15)',
    },
    behaviorFocusSummaryIcon: {
        backgroundColor: 'rgba(45, 212, 191, 0.08)',
        borderColor: 'rgba(45, 212, 191, 0.15)',
    },
    focusSummaryTextWrap: {
        flex: 1,
        gap: 2,
    },
    focusSummaryTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 14,
        color: Colors.textPrimary,
    },
    behaviorFocusSummaryTitle: {
        color: Colors.textPrimary,
    },
    focusSummaryMetric: {
        fontFamily: fonts.medium,
        fontSize: 13,
        color: Colors.textSecondary,
    },
    behaviorFocusSummaryMetric: {
        color: Colors.primary,
    },
    focusSummaryBody: {
        fontFamily: fonts.regular,
        fontSize: 12,
        lineHeight: 18,
        color: Colors.textSecondary,
    },
    behaviorFocusSummaryBody: {
        color: Colors.textSecondary,
    },
    actionTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: Colors.textPrimary,
        marginBottom: 4,
    },
    actionMeta: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: Colors.textSecondary,
    },
    actionCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
        gap: 6,
        borderWidth: 1,
        borderColor: 'rgba(60, 60, 67, 0.08)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
        elevation: 1,
    },
    behaviorActionCard: {
        backgroundColor: '#FFFFFF',
        borderColor: 'rgba(60, 60, 67, 0.08)',
    },
    actionHeaderRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 2,
    },
    actionTitleHero: {
        fontFamily: fonts.bold,
        fontSize: 17,
        color: Colors.textPrimary,
        flex: 1,
        lineHeight: 22,
    },
    behaviorActionTitleHero: {
        color: Colors.textPrimary,
    },
    actionDescription: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: Colors.textSecondary,
        lineHeight: 20,
    },
    behaviorActionDescription: {
        color: Colors.textSecondary,
    },
    expandedContent: {
        marginTop: 8,
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: 'rgba(60, 60, 67, 0.08)',
        gap: 8,
    },
    behaviorExpandedContent: {
        borderTopColor: 'rgba(60, 60, 67, 0.08)',
    },
    behaviorActionMeta: {
        color: Colors.textSecondary,
    },
    statusPill: {
        alignSelf: 'flex-start',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
        backgroundColor: 'rgba(0, 0, 0, 0.04)',
        marginTop: 4,
    },
    behaviorStatusPill: {
        backgroundColor: 'rgba(45, 212, 191, 0.08)',
        borderWidth: 1,
        borderColor: 'rgba(60, 60, 67, 0.08)',
    },
    statusPillText: {
        fontFamily: fonts.medium,
        fontSize: 10,
        color: Colors.textTertiary,
        textTransform: 'uppercase',
    },
    behaviorStatusPillText: {
        color: Colors.textSecondary,
    },
    statusActive: {
        backgroundColor: 'rgba(53, 150, 80, 0.10)',
    },
    statusInactive: {
        backgroundColor: 'rgba(0, 0, 0, 0.04)',
    },
    actionOutcomeRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingTop: 8,
    },
    actionOutcomeLabel: {
        fontFamily: fonts.regular,
        fontSize: 11,
        color: Colors.textTertiary,
    },
    behaviorActionOutcomeLabel: {
        color: Colors.textSecondary,
    },
    actionOutcomeValue: {
        fontFamily: fonts.semiBold,
        fontSize: 13,
        color: Colors.textPrimary,
        marginTop: 2,
    },
    behaviorActionOutcomeValue: {
        color: Colors.textPrimary,
    },
    deltaPositive: {
        color: Colors.success,
    },
    deltaNegative: {
        color: Colors.error,
    },
    deltaNeutral: {
        color: Colors.textTertiary,
    },
    actionButtons: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 8,
    },
    primaryButton: {
        backgroundColor: Colors.buttonSecondary,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
    },
    behaviorPrimaryButton: {
        backgroundColor: Colors.primary,
        borderWidth: 1,
        borderColor: 'rgba(45, 212, 191, 0.3)',
    },
    primaryButtonText: {
        fontFamily: fonts.semiBold,
        fontSize: 13,
        color: Colors.textPrimary,
    },
    behaviorPrimaryButtonText: {
        color: '#FFFFFF',
    },
    secondaryButton: {
        borderWidth: 1,
        borderColor: 'rgba(60, 60, 67, 0.18)',
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
    },
    secondaryButtonText: {
        fontFamily: fonts.medium,
        fontSize: 13,
        color: Colors.textPrimary,
    },
    emptyStateCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 20,
        alignItems: 'center',
        gap: 8,
        borderWidth: 1,
        borderColor: 'rgba(60, 60, 67, 0.08)',
    },
    behaviorEmptyStateCard: {
        backgroundColor: '#FFFFFF',
        borderColor: 'rgba(60, 60, 67, 0.08)',
    },
    emptyStateImage: {
        width: 72,
        height: 72,
        resizeMode: 'contain',
    },
    emptyStateTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 15,
        color: Colors.textPrimary,
    },
    behaviorEmptyStateTitle: {
        color: Colors.textPrimary,
    },
    emptyStateText: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: Colors.textSecondary,
        textAlign: 'center',
    },
    behaviorEmptyStateText: {
        color: Colors.textSecondary,
    },
    emptyStateCtaButton: {
        marginTop: 6,
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(60, 60, 67, 0.18)',
        backgroundColor: 'rgba(0, 0, 0, 0.04)',
    },
    behaviorEmptyStateCtaButton: {
        borderColor: 'rgba(45, 212, 191, 0.3)',
        backgroundColor: 'rgba(45, 212, 191, 0.08)',
    },
    emptyStateCtaText: {
        fontFamily: fonts.semiBold,
        fontSize: 12,
        color: Colors.textPrimary,
    },
    behaviorEmptyStateCtaText: {
        color: Colors.textPrimary,
    },
    pathwayCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
        gap: 10,
        borderWidth: 1,
        borderColor: 'rgba(60, 60, 67, 0.08)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
        elevation: 1,
    },
    behaviorPathwayCard: {
        backgroundColor: '#FFFFFF',
        borderColor: 'rgba(60, 60, 67, 0.08)',
    },
    pathwayHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 8,
    },
    pathwayTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: Colors.textPrimary,
    },
    behaviorPathwayTitle: {
        color: Colors.textPrimary,
    },
    pathwayDescription: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: Colors.textSecondary,
    },
    behaviorPathwayDescription: {
        color: Colors.textSecondary,
    },
    pathwayMeta: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: Colors.textTertiary,
    },
    behaviorPathwayMeta: {
        color: Colors.textSecondary,
    },
    pathwaySteps: {
        gap: 8,
        marginTop: 8,
    },
    pathwayStepRow: {
        flexDirection: 'row',
        gap: 10,
        alignItems: 'center',
        padding: 10,
        borderRadius: 12,
        backgroundColor: 'rgba(0, 0, 0, 0.02)',
    },
    behaviorPathwayStepRow: {
        backgroundColor: 'rgba(45, 212, 191, 0.04)',
        borderWidth: 1,
        borderColor: 'rgba(60, 60, 67, 0.08)',
    },
    pathwayStepRowDone: {
        backgroundColor: 'rgba(76, 175, 80, 0.08)',
    },
    pathwayStepTitle: {
        fontFamily: fonts.medium,
        fontSize: 13,
        color: Colors.textPrimary,
    },
    behaviorPathwayStepTitle: {
        color: Colors.textPrimary,
    },
    pathwayStepDescription: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: Colors.textSecondary,
    },
    behaviorPathwayStepDescription: {
        color: Colors.textSecondary,
    },
    pathwayOutcomeRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 8,
        gap: 12,
    },
    pathwayOutcomeLabel: {
        fontFamily: fonts.regular,
        fontSize: 11,
        color: Colors.textTertiary,
    },
    behaviorPathwayOutcomeLabel: {
        color: Colors.textSecondary,
    },
    pathwayOutcomeValue: {
        fontFamily: fonts.semiBold,
        fontSize: 13,
        color: Colors.textPrimary,
        marginTop: 2,
    },
    behaviorPathwayOutcomeValue: {
        color: Colors.textPrimary,
    },
    pathwayDisclaimer: {
        marginTop: 6,
    },
    rangeToggleRow: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 8,
    },
    rangeToggle: {
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(60, 60, 67, 0.18)',
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    rangeToggleActive: {
        backgroundColor: 'rgba(0, 0, 0, 0.06)',
    },
    rangeToggleText: {
        fontFamily: fonts.medium,
        fontSize: 12,
        color: Colors.textTertiary,
    },
    rangeToggleTextActive: {
        color: Colors.textPrimary,
    },
    progressCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
        gap: 6,
        borderWidth: 1,
        borderColor: 'rgba(60, 60, 67, 0.08)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
    },
    progressLabel: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: Colors.textTertiary,
    },
    progressValue: {
        fontFamily: fonts.bold,
        fontSize: 28,
        color: Colors.textPrimary,
    },
    progressMeta: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: Colors.textSecondary,
    },
    habitRow: {
        flexDirection: 'row',
        gap: 12,
    },
    habitCard: {
        flex: 1,
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        padding: 14,
        gap: 6,
        borderWidth: 1,
        borderColor: 'rgba(60, 60, 67, 0.08)',
    },
    habitValue: {
        fontFamily: fonts.bold,
        fontSize: 20,
        color: Colors.textPrimary,
    },
    habitLabel: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: Colors.textSecondary,
    },
    dataCoverageText: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: Colors.textSecondary,
    },
    experimentsHeader: {
        gap: 8,
        marginBottom: 12,
    },
    componentRow: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
        gap: 12,
        borderWidth: 1,
        borderColor: 'rgba(60, 60, 67, 0.08)',
    },
    componentHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    componentIconTitle: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    componentTitle: {
        fontFamily: fonts.medium,
        fontSize: 15,
        color: Colors.textPrimary,
    },
    componentValue: {
        fontFamily: fonts.semiBold,
        fontSize: 14,
        color: Colors.textPrimary,
    },
    progressBarContainer: {
        height: 6,
        backgroundColor: 'rgba(0, 0, 0, 0.06)',
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        borderRadius: 3,
    },
    heroTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 20,
        color: Colors.textPrimary,
        marginTop: 14,
    },
    heroSubtitle: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: Colors.textTertiary,
    },
    heroSubtitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 4,
    },
    deltaPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 12,
        paddingHorizontal: 10,
        paddingVertical: 5,
        backgroundColor: 'rgba(0, 0, 0, 0.04)',
        borderRadius: 12,
    },
    deltaPillInline: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        paddingHorizontal: 6,
        paddingVertical: 2,
        backgroundColor: 'rgba(0, 0, 0, 0.04)',
        borderRadius: 8,
    },
    deltaText: {
        fontFamily: fonts.medium,
        fontSize: 12,
    },
    deltaTextInline: {
        fontFamily: fonts.medium,
        fontSize: 11,
    },
    metricsGrid: {
        gap: 12,
    },
    gridRow: {
        flexDirection: 'row',
        gap: 12,
    },
    trendHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    trendRange: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: Colors.textTertiary,
    },
    weeklyReviewCard: {
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(60, 60, 67, 0.08)',
        backgroundColor: '#FFFFFF',
        marginBottom: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
        elevation: 1,
    },
    weeklyReviewHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    weeklyReviewBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(45, 212, 191, 0.08)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    weeklyReviewBadgeText: {
        fontFamily: fonts.semiBold,
        fontSize: 12,
        color: Colors.primary,
        letterSpacing: 0.3,
    },
    weeklyReviewText: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: Colors.textPrimary,
        lineHeight: 21,
        marginBottom: 12,
    },
    weeklyReviewExperiment: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        backgroundColor: 'rgba(45, 212, 191, 0.06)',
        padding: 10,
        borderRadius: 10,
        marginBottom: 10,
    },
    weeklyReviewExperimentText: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: Colors.textSecondary,
        flex: 1,
        lineHeight: 19,
    },
    weeklyReviewMetric: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    weeklyReviewMetricText: {
        fontFamily: fonts.semiBold,
        fontSize: 12,
        textTransform: 'capitalize',
    },

    // ============================================
    // EXPERIMENTS HUB STYLES (behavior_v1)
    // ============================================
    experimentsHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    experimentsHeaderTitle: {
        fontFamily: fonts.bold,
        fontSize: 26,
        color: Colors.textPrimary,
    },
    experimentsHeaderSubtitle: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: Colors.textSecondary,
        marginTop: 2,
    },
    experimentsSearchButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(0, 0, 0, 0.04)',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 4,
    },
    experimentsSection: {
        gap: 10,
    },
    experimentsSectionLabel: {
        fontFamily: fonts.bold,
        fontSize: 12,
        color: Colors.textSecondary,
        letterSpacing: 0.8,
    },
    experimentsLibraryHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    experimentsLibraryTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 18,
        color: Colors.textPrimary,
    },
    experimentsFilterLink: {
        fontFamily: fonts.semiBold,
        fontSize: 14,
        color: Colors.primary,
    },
    experimentsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    experimentsGridItem: {
        flexBasis: '47%',
        flexGrow: 1,
    },
    nbaCard: {
        borderRadius: 18,
        padding: 16,
        gap: 8,
        borderWidth: 1,
        borderColor: 'rgba(45, 212, 191, 0.25)',
        backgroundColor: 'rgba(45, 212, 191, 0.04)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
    },
    nbaShimmer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 8,
    },
    nbaShimmerText: {
        fontFamily: fonts.medium,
        fontSize: 13,
        color: Colors.textTertiary,
    },
    nbaHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    nbaLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    nbaLabel: {
        fontFamily: fonts.bold,
        fontSize: 11,
        color: 'rgba(45, 212, 191, 1)',
        letterSpacing: 0.6,
    },
    nbaSourceBadge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
    },
    nbaSourceAi: {
        backgroundColor: 'rgba(45, 212, 191, 0.12)',
    },
    nbaSourceRules: {
        backgroundColor: 'rgba(142, 142, 147, 0.12)',
    },
    nbaSourceText: {
        fontFamily: fonts.semiBold,
        fontSize: 10,
        letterSpacing: 0.3,
    },
    nbaSourceTextAi: {
        color: 'rgba(45, 212, 191, 1)',
    },
    nbaSourceTextRules: {
        color: Colors.textTertiary,
    },
    nbaTitle: {
        fontFamily: fonts.bold,
        fontSize: 17,
        color: Colors.textPrimary,
        lineHeight: 22,
    },
    nbaDescription: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: Colors.textSecondary,
        lineHeight: 20,
    },
    nbaBecause: {
        fontFamily: fonts.regular,
        fontSize: 12,
        fontStyle: 'italic',
        color: Colors.textTertiary,
        lineHeight: 17,
    },
    nbaCtaButton: {
        marginTop: 4,
        alignSelf: 'flex-start',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: 'rgba(45, 212, 191, 0.12)',
    },
    nbaCtaText: {
        fontFamily: fonts.semiBold,
        fontSize: 14,
        color: 'rgba(45, 212, 191, 1)',
    },
    focusEmptyExperiments: {
        alignItems: 'center',
        paddingVertical: 20,
        gap: 8,
    },
    focusEmptyExperimentsText: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: Colors.textTertiary,
        textAlign: 'center',
    },
});
