import { AnimatedScreen } from '@/components/animations/animated-screen';
import { MetabolicScoreRing } from '@/components/charts/MetabolicScoreRing';
import { SegmentedControl } from '@/components/controls/segmented-control';
import { DataCoverageCard } from '@/components/progress/DataCoverageCard';
import { MetricCard } from '@/components/progress/MetricCard';
import { Disclaimer } from '@/components/ui/Disclaimer';
import { Colors } from '@/constants/Colors';
import { Images } from '@/constants/Images';
import { useAuth, useGlucoseUnit } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { usePersonalInsights } from '@/hooks/usePersonalInsights';
import { usePersonalizedTips } from '@/hooks/usePersonalizedTips';
import { InsightAction, InsightData, TrackingMode } from '@/lib/insights';
import {
    ActivityLog,
    CarePathwayTemplate,
    DailyContext,
    GlucoseLog,
    MealWithCheckin,
    MetabolicWeeklyScore,
    SuggestedExperiment,
    UserAction,
    UserCarePathway,
    UserExperiment,
    createUserAction,
    getActiveCarePathway,
    getActivityLogsByDateRange,
    getCarePathwayTemplates,
    getDailyContextByRange,
    getFibreIntakeSummary,
    getGlucoseLogsByDateRange,
    getMealsWithCheckinsByDateRange,
    getMetabolicWeeklyScores,
    getSuggestedExperiments,
    getUserActionsByStatus,
    getUserExperiments,
    startCarePathway,
    startUserExperiment,
    supabase,
    updateCarePathway,
    updateUserAction,
    upsertMetabolicDailyFeature,
} from '@/lib/supabase';
import { formatGlucoseWithUnit } from '@/lib/utils/glucoseUnits';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Image,
    Linking,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type TabKey = 'actions' | 'progress' | 'experiments';

type MetricKey =
    | 'meal_count'
    | 'checkin_count'
    | 'time_in_range'
    | 'glucose_avg'
    | 'glucose_logs_count'
    | 'steps'
    | 'sleep_hours';

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
    const { tips: tipsData, loading: tipsLoading } = usePersonalizedTips({
        userId: user?.id,
        aiEnabled: profile?.ai_enabled ?? true,
    });
    const glucoseUnit = useGlucoseUnit();
    const params = useLocalSearchParams();
    const insets = useSafeAreaInsets();
    const HEADER_HEIGHT = 120 + insets.top;

    const [activeTab, setActiveTab] = useState<TabKey>('progress');
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



    // Experiments state
    const [suggestedExperiments, setSuggestedExperiments] = useState<SuggestedExperiment[]>([]);
    const [activeExperiments, setActiveExperiments] = useState<UserExperiment[]>([]);
    const [experimentsLoading, setExperimentsLoading] = useState(false);
    const [startingExperiment, setStartingExperiment] = useState<string | null>(null);
    const [expandedCardIds, setExpandedCardIds] = useState<Set<string>>(new Set());

    const toggleCardExpanded = (id: string) => {
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

    const targetMin = profile?.target_min ?? DEFAULT_TARGET_MIN;
    const targetMax = profile?.target_max ?? DEFAULT_TARGET_MAX;
    const trackingMode = (profile?.tracking_mode || 'meals_wearables') as TrackingMode;

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
            avgSleepHours: avgSleep,
            avgSteps,
            avgActiveMinutes,
            avgFibrePerDay,
            mealsWithWalkAfter: mealsWithWalkAfter.length,
            totalMealsThisWeek: meals.length,
            checkinsThisWeek: mealsWithCheckins.length,
        };
    }, [glucoseLogs, meals, dailyContext, targetMin, targetMax, avgFibrePerDay]);

    const { insights: personalInsights, loading: personalInsightsLoading } = usePersonalInsights({
        userId: user?.id,
        trackingMode,
        rangeKey: getRangeKey(insightsRangeDays),
        enabled: !!user?.id,
        fallbackData,
    });

    const fetchCoreData = useCallback(async () => {
        if (!user) {
            setInsightsLoading(false);
            return;
        }

        setInsightsLoading(true);
        try {
            const [logs, activities, mealsData, dailyData, fibreSummary, pathway, templates, weekly] = await Promise.all([
                getGlucoseLogsByDateRange(user.id, startDate, endDate),
                getActivityLogsByDateRange(user.id, startDate, endDate),
                getMealsWithCheckinsByDateRange(user.id, startDate, endDate),
                getDailyContextByRange(user.id, startDateKey, endDateKey),
                getFibreIntakeSummary(user.id, 'month'),
                getActiveCarePathway(user.id),
                getCarePathwayTemplates(),
                getMetabolicWeeklyScores(user.id, 26),
            ]);

            setGlucoseLogs(logs);
            setActivityLogs(activities);
            setMeals(mealsData);
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
            const [active, suggestions] = await Promise.all([
                getUserExperiments(user.id, ['draft', 'active']),
                getSuggestedExperiments(user.id, 6),
            ]);
            setActiveExperiments(active);
            if (suggestions?.suggestions) setSuggestedExperiments(suggestions.suggestions);
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
            if (params.tab && ['actions', 'progress', 'experiments'].includes(params.tab as string)) {
                setActiveTab(params.tab as TabKey);
            }
        }, [params.tab])
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
            default:
                return null;
        }
    }, [meals, glucoseLogs, dailyContext, targetMin, targetMax]);

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
    }, [meals, activityLogs, glucoseLogs, dailyContext]);

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
        await updateUserAction(action.id, {
            status: 'completed',
            completed_at: new Date().toISOString(),
            completion_source: 'manual',
        });
        await fetchActions();
    };

    const handleStartPathway = async (template: CarePathwayTemplate) => {
        if (!user) return;
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

    const actionCandidates = useMemo(() => {
        const activeActionTypes = new Set(actions.filter(a => a.status === 'active').map(a => a.action_type));
        return personalInsights.filter(insight => !activeActionTypes.has(insight.action.actionType)).slice(0, 4);
    }, [personalInsights, actions]);

    const activeActions = useMemo(() => actions.filter(action => action.status === 'active'), [actions]);
    const recentActions = useMemo(() => actions.filter(action => action.status !== 'active').slice(0, 3), [actions]);

    const glucoseStats = useMemo(() => computeGlucoseStats(glucoseLogs, targetMin, targetMax), [glucoseLogs, targetMin, targetMax]);

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
            <View key={action.id} style={styles.actionCard}>
                <View style={styles.actionHeaderRow}>
                    <Text style={styles.actionTitleHero}>{action.title}</Text>
                    <TouchableOpacity onPress={() => toggleCardExpanded(action.id)} hitSlop={10}>
                        <Ionicons name={isExpanded ? "information-circle" : "information-circle-outline"} size={22} color="#878787" />
                    </TouchableOpacity>
                </View>

                <Text style={styles.actionDescription}>{action.description}</Text>

                {isExpanded && (
                    <View style={styles.expandedContent}>
                        <Text style={styles.actionMeta}>Window ends in {timeLeft}h</Text>
                        <View style={styles.actionOutcomeRow}>
                            <View>
                                <Text style={styles.actionOutcomeLabel}>Baseline</Text>
                                <Text style={styles.actionOutcomeValue}>{formatMetricValue(metricKey, baselineValue, glucoseUnit)}</Text>
                            </View>
                            <View>
                                <Text style={styles.actionOutcomeLabel}>Outcome</Text>
                                <Text style={styles.actionOutcomeValue}>{formatMetricValue(metricKey, outcomeValue, glucoseUnit)}</Text>
                            </View>
                            <View>
                                <Text style={styles.actionOutcomeLabel}>Delta</Text>
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
                                style={styles.primaryButton}
                                onPress={() => {
                                    if (action.cta?.route) {
                                        router.push(action.cta.route as any);
                                    }
                                }}
                            >
                                <Text style={styles.primaryButtonText}>{action.cta.label}</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity
                                style={styles.primaryButton}
                                onPress={() => handleMarkActionDone(action)}
                            >
                                <Text style={styles.primaryButtonText}>Mark done</Text>
                            </TouchableOpacity>
                        )}
                        {/* Option to mark done if CTA exists? Maybe secondary. Keeping simple for now. */}
                    </View>
                )}
            </View>
        );
    };

    const renderActionCandidates = () => {
        if (personalInsightsLoading) {
            return <ActivityIndicator color="#878787" style={{ marginVertical: 12 }} />;
        }

        if (actionCandidates.length === 0) {
            return (
                <View style={styles.emptyStateCard}>
                    <Image source={Images.mascots.thinking} style={styles.emptyStateImage} />
                    <Text style={styles.emptyStateTitle}>No new actions right now</Text>
                    <Text style={styles.emptyStateText}>Keep logging to unlock the next step.</Text>
                </View>
            );
        }

        return actionCandidates.map(insight => {
            const isExpanded = expandedCardIds.has(insight.id);
            return (
                <View key={insight.id} style={styles.actionCard}>
                    <View style={styles.actionHeaderRow}>
                        <Text style={styles.actionTitleHero}>{insight.action.title}</Text>
                        <TouchableOpacity onPress={() => toggleCardExpanded(insight.id)} hitSlop={10}>
                            <Ionicons name={isExpanded ? "information-circle" : "information-circle-outline"} size={22} color="#878787" />
                        </TouchableOpacity>
                    </View>

                    <Text style={styles.actionDescription}>{insight.action.description}</Text>

                    {isExpanded && (
                        <View style={styles.expandedContent}>
                            <Text style={styles.actionMeta}>Insight: {insight.because}</Text>
                            <View style={styles.statusPill}>
                                <Text style={styles.statusPillText}>Duration: {insight.action.windowHours}h</Text>
                            </View>
                        </View>
                    )}

                    <View style={styles.actionButtons}>
                        <TouchableOpacity
                            style={styles.primaryButton}
                            onPress={() => handleStartAction(insight.id, insight.action)}
                        >
                            <Text style={styles.primaryButtonText}>Start action</Text>
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
                <View style={styles.pathwayCard}>
                    <View style={styles.pathwayHeader}>
                        <View>
                            <Text style={styles.pathwayTitle}>{template.title}</Text>
                            <Text style={styles.pathwayMeta}>Day {dayIndex} of {totalDays} · ends {toDateKey(endAt)}</Text>
                        </View>
                        <View style={styles.statusPill}>
                            <Text style={styles.statusPillText}>{carePathway.status}</Text>
                        </View>
                    </View>
                    <Text style={styles.pathwayDescription}>{template.description}</Text>

                    <View style={styles.pathwaySteps}>
                        {steps.map(step => {
                            const isDone = completedSteps.includes(step.id);
                            return (
                                <TouchableOpacity
                                    key={step.id}
                                    style={[styles.pathwayStepRow, isDone && styles.pathwayStepRowDone]}
                                    onPress={() => handleTogglePathwayStep(step.id)}
                                >
                                    <Ionicons
                                        name={isDone ? 'checkmark-circle' : 'ellipse-outline'}
                                        size={18}
                                        color={isDone ? '#4CAF50' : '#878787'}
                                    />
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.pathwayStepTitle}>{step.title}</Text>
                                        <Text style={styles.pathwayStepDescription}>{step.description}</Text>
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {carePathway.delta && (
                        <View style={styles.pathwayOutcomeRow}>
                            <View>
                                <Text style={styles.pathwayOutcomeLabel}>Delta (time-in-zone)</Text>
                                <Text style={styles.pathwayOutcomeValue}>
                                    {formatMetricValue('time_in_range', carePathway.delta.time_in_range ?? null, glucoseUnit)}
                                </Text>
                            </View>
                            <View>
                                <Text style={styles.pathwayOutcomeLabel}>Delta (avg glucose)</Text>
                                <Text style={styles.pathwayOutcomeValue}>
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
                <View style={styles.pathwayCard}>
                    <Text style={styles.pathwayTitle}>{template.title}</Text>
                    <Text style={styles.pathwayDescription}>A structured 7-day plan to steady your recent trend.</Text>
                    <Text style={styles.pathwayMeta}>Triggered by {Math.round(glucoseStats.timeInRange || 0)}% time-in-zone.</Text>
                    <TouchableOpacity
                        style={styles.primaryButton}
                        onPress={() => handleStartPathway(template)}
                        disabled={pathwayLoading}
                    >
                        <Text style={styles.primaryButtonText}>Start 7-day pathway</Text>
                    </TouchableOpacity>
                </View>
            );
        }

        return (
            <View style={styles.pathwayCard}>
                <Text style={styles.pathwayTitle}>{template.title}</Text>
                <Text style={styles.pathwayDescription}>A structured plan becomes available once a trend needs intervention.</Text>
            </View>
        );
    };

    const renderActionsTab = () => (
        <Animated.ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: HEADER_HEIGHT + 16 }]} showsVerticalScrollIndicator={false} onScroll={handleScroll} scrollEventThrottle={16}>
            <Text style={styles.sectionTitle}>Action Loop</Text>
            <Text style={styles.sectionDescription}>Every signal maps to a 24-72 hour next step.</Text>

            {actionsLoading ? (
                <ActivityIndicator color="#878787" style={{ marginVertical: 16 }} />
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
                        {renderActionCandidates()}
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

    const renderTipCard = (tip: any) => (
        <TouchableOpacity
            key={tip.id}
            style={styles.tipCard}
            onPress={() => {
                if (tip.articleUrl) {
                    console.log('Opening tip URL:', tip.articleUrl);
                    // Use Linking as a fallback if WebBrowser is unreliable
                    Linking.openURL(tip.articleUrl).catch(err =>
                        console.error('Failed to open URL:', err)
                    );
                } else {
                    console.warn('No article URL for tip:', tip.title);
                }
            }}
            activeOpacity={0.7}
        >
            <View style={[styles.tipIconContainer, { backgroundColor: tip.category === 'glucose' ? 'rgba(52, 199, 89, 0.15)' : tip.category === 'meal' ? 'rgba(255, 149, 0, 0.15)' : 'rgba(0, 122, 255, 0.15)' }]}>
                <Ionicons
                    name={tip.category === 'glucose' ? 'water' : tip.category === 'meal' ? 'nutrition' : 'walk'}
                    size={20}
                    color={tip.category === 'glucose' ? Colors.success : tip.category === 'meal' ? Colors.warning : Colors.primary}
                />
            </View>
            <View style={styles.tipContent}>
                <View style={styles.tipHeader}>
                    <Text style={styles.tipTitle}>{tip.title}</Text>
                    {tip.metric && <Text style={styles.tipMetric}>{tip.metric}</Text>}
                </View>
                <Text style={styles.tipDescription}>{tip.description}</Text>
                <Text style={styles.tipLink}>Learn more <Ionicons name="arrow-forward" size={10} /></Text>
            </View>
        </TouchableOpacity>
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
            if (s >= 85) return 'Excellent';
            if (s >= 70) return 'Optimized';
            if (s >= 50) return 'Fair';
            return 'Needs Focus';
        };

        const getScoreDescription = (s: number | null) => {
            if (s === null) return 'Log 7 days of data to unlock your metabolic score.';
            if (s >= 85) return 'Your metabolism is firing on all cylinders.';
            if (s >= 70) return 'You’re maintaining a strong metabolic baseline.';
            if (s >= 50) return 'A few adjustments could boost your score.';
            return 'Prioritize sleep and movement to get back on track.';
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
                <LinearGradient
                    colors={['#2A2C2C', '#1A1A1E']}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={styles.heroCard}
                >
                    <View style={styles.heroHeader}>
                        <Text style={styles.heroLabel}>METABOLIC HEALTH</Text>
                        <View style={styles.heroStatusRow}>
                            <Text style={[styles.heroStatusText, { color: getScoreColor(score) }]}>
                                {getScoreLabel(score)}
                            </Text>
                            {velocity.delta !== null && (
                                <View style={[styles.deltaPillInline, { backgroundColor: 'rgba(0,0,0,0.2)' }]}>
                                    <Ionicons
                                        name={velocity.delta >= 0 ? 'arrow-up' : 'arrow-down'}
                                        size={12}
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
                        <Text style={styles.heroContext}>
                            {getScoreDescription(score)}
                        </Text>
                    </View>

                    <View style={styles.heroRingContainer}>
                        <MetabolicScoreRing
                            size={140}
                            score={score}
                            scoreColor={getScoreColor(score)}
                        />
                    </View>

                    {/* Mini Metrics Row */}
                    <View style={styles.heroMetricsRow}>
                        <View style={styles.heroMetricItem}>
                            <Ionicons name="moon" size={14} color={Colors.sleep} />
                            <Text style={styles.heroMetricValue}>{computedAggregates.weeklySleep?.toFixed(1) ?? '--'}h</Text>
                        </View>
                        <View style={styles.heroMetricDivider} />
                        <View style={styles.heroMetricItem}>
                            <Ionicons name="footsteps" size={14} color={Colors.activity} />
                            <Text style={styles.heroMetricValue}>{computedAggregates.weeklySteps ? (computedAggregates.weeklySteps / 1000).toFixed(1) + 'k' : '--'}</Text>
                        </View>
                        <View style={styles.heroMetricDivider} />
                        <View style={styles.heroMetricItem}>
                            <Ionicons name="heart" size={14} color={Colors.heartRate} />
                            <Text style={styles.heroMetricValue}>{Math.round(computedAggregates.weeklyRHR ?? 0) || '--'}</Text>
                        </View>
                        <View style={styles.heroMetricDivider} />
                        <View style={styles.heroMetricItem}>
                            <Ionicons name="pulse" size={14} color={Colors.primary} />
                            <Text style={styles.heroMetricValue}>{Math.round(computedAggregates.weeklyHRV ?? 0) || '--'} ms</Text>
                        </View>
                    </View>
                </LinearGradient>

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

                {/* Section 3: Personalized AI Tips */}
                {/* Only show if AI tips is enabled/available? Assuming yes for now */}
                <View style={{ marginTop: 24, marginBottom: 8 }}>
                    <Text style={styles.sectionTitle}>Personalized Tips</Text>
                    <Text style={styles.sectionDescription}>AI-curated insights based on your recent logs.</Text>
                </View>

                {tipsLoading ? (
                    <ActivityIndicator color={Colors.textTertiary} style={{ marginVertical: 20 }} />
                ) : tipsData?.tips && tipsData.tips.length > 0 ? (
                    <View style={styles.tipsContainer}>
                        {tipsData.tips.map(renderTipCard)}
                    </View>
                ) : (
                    <View style={styles.tipsEmptyStateCard}>
                        <Text style={styles.tipsEmptyStateTitle}>No tips yet</Text>
                        <Text style={styles.tipsEmptyStateText}>Log more data to get personalized advice.</Text>
                    </View>
                )}

                {/* Section 4: Simplified Data Coverage (shifted down) */}
                <View style={{ marginTop: 24 }}>
                    <DataCoverageCard
                        confidence={metabolicScore?.confidence || 'insufficient_data'}
                        daysWithData={daysWithData}
                    />
                </View>
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
                    onPress={() => router.push('/experiments-list' as any)}
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
                <ActivityIndicator color="#878787" style={{ marginVertical: 16 }} />
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
        <AnimatedScreen>
            <View style={styles.container}>
                <LinearGradient
                    colors={['#1a1f24', '#181c20', '#111111']}
                    locations={[0, 0.35, 1]}
                    style={StyleSheet.absoluteFillObject}
                />

                {/* Content - scrolls behind header */}
                <View style={styles.safeArea}>
                    {insightsLoading ? (
                        <View style={[styles.loadingContainer, { paddingTop: HEADER_HEIGHT + 8 }]}>
                            <ActivityIndicator color="#878787" />
                            <Text style={styles.loadingText}>Loading insights...</Text>
                        </View>
                    ) : (
                        <>
                            {activeTab === 'progress' && renderProgressTab()}
                            {activeTab === 'actions' && renderActionsTab()}
                            {activeTab === 'experiments' && renderExperimentsTab()}
                        </>
                    )}
                </View>

                {/* Blurred Header */}
                <View style={styles.blurHeaderContainer}>
                    {/* Animated background - transparent at top, opaque when scrolled */}
                    <Animated.View style={[styles.headerBackground, { opacity: headerBgOpacity }]} />
                    <View style={{ paddingTop: insets.top }}>
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
                    </View>
                </View>
            </View>
        </AnimatedScreen>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#111111',
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
        backgroundColor: '#1a1f24',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    headerTitle: {
        fontFamily: fonts.bold,
        fontSize: 24,
        color: '#FFFFFF',
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    segmentedControlContainer: {
        paddingHorizontal: 16,
        paddingBottom: 0,
    },
    subtitle: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#B8B8B8',
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
        color: '#878787',
    },
    sectionTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 18,
        color: '#FFFFFF',
    },
    sectionSubtitle: {
        fontFamily: fonts.semiBold,
        fontSize: 15,
        color: '#E0E0E0',
        marginBottom: 8,
    },
    sectionDescription: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: '#A0A0A0',
    },
    sectionBlock: {
        gap: 12,
    },
    actionTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: '#FFFFFF',
        marginBottom: 4,
    },
    actionMeta: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: '#A0A0A0',
    },
    actionCard: {
        backgroundColor: '#1A1A1E',
        borderRadius: 16,
        padding: 16,
        gap: 6,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
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
        color: '#FFFFFF',
        flex: 1,
        lineHeight: 22,
    },
    actionDescription: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#B0B0B0',
        lineHeight: 20,
    },
    expandedContent: {
        marginTop: 8,
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.06)',
        gap: 8,
    },
    statusPill: {
        alignSelf: 'flex-start',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
        backgroundColor: 'rgba(255,255,255,0.06)',
        marginTop: 4,
    },
    statusPillText: {
        fontFamily: fonts.medium,
        fontSize: 10,
        color: '#878787',
        textTransform: 'uppercase',
    },
    statusActive: {
        backgroundColor: 'rgba(53, 150, 80, 0.15)',
    },
    statusInactive: {
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    actionOutcomeRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingTop: 8,
    },
    actionOutcomeLabel: {
        fontFamily: fonts.regular,
        fontSize: 11,
        color: '#878787',
    },
    actionOutcomeValue: {
        fontFamily: fonts.semiBold,
        fontSize: 13,
        color: '#FFFFFF',
        marginTop: 2,
    },
    deltaPositive: {
        color: '#4CAF50',
    },
    deltaNegative: {
        color: '#F44336',
    },
    deltaNeutral: {
        color: '#B0B0B0',
    },
    actionButtons: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 8,
    },
    primaryButton: {
        backgroundColor: '#285E2A',
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
    },
    primaryButtonText: {
        fontFamily: fonts.semiBold,
        fontSize: 13,
        color: '#FFFFFF',
    },
    secondaryButton: {
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
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
        color: '#E0E0E0',
    },
    emptyStateCard: {
        backgroundColor: '#1A1A1E',
        borderRadius: 16,
        padding: 20,
        alignItems: 'center',
        gap: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    emptyStateImage: {
        width: 72,
        height: 72,
        resizeMode: 'contain',
    },
    emptyStateTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 15,
        color: '#FFFFFF',
    },
    emptyStateText: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: '#A0A0A0',
        textAlign: 'center',
    },
    pathwayCard: {
        backgroundColor: '#1A1A1E',
        borderRadius: 16,
        padding: 16,
        gap: 10,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    pathwayHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 8,
    },
    pathwayTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: '#FFFFFF',
    },
    pathwayDescription: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: '#CFCFCF',
    },
    pathwayMeta: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: '#8A8A8A',
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
        backgroundColor: 'rgba(255,255,255,0.04)',
    },
    pathwayStepRowDone: {
        backgroundColor: 'rgba(76, 175, 80, 0.12)',
    },
    pathwayStepTitle: {
        fontFamily: fonts.medium,
        fontSize: 13,
        color: '#FFFFFF',
    },
    pathwayStepDescription: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: '#B0B0B0',
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
        color: '#8A8A8A',
    },
    pathwayOutcomeValue: {
        fontFamily: fonts.semiBold,
        fontSize: 13,
        color: '#FFFFFF',
        marginTop: 2,
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
        borderColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    rangeToggleActive: {
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    rangeToggleText: {
        fontFamily: fonts.medium,
        fontSize: 12,
        color: '#B0B0B0',
    },
    rangeToggleTextActive: {
        color: '#FFFFFF',
    },
    progressCard: {
        backgroundColor: '#22282C',
        borderRadius: 16,
        padding: 16,
        gap: 6,
        // Liquid glass / 3D effect
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.15)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    progressLabel: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: '#8A8A8A',
    },
    progressValue: {
        fontFamily: fonts.bold,
        fontSize: 28,
        color: '#FFFFFF',
    },
    progressMeta: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: '#A0A0A0',
    },
    habitRow: {
        flexDirection: 'row',
        gap: 12,
    },
    habitCard: {
        flex: 1,
        backgroundColor: '#1A1A1E',
        borderRadius: 14,
        padding: 14,
        gap: 6,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    habitValue: {
        fontFamily: fonts.bold,
        fontSize: 20,
        color: '#FFFFFF',
    },
    habitLabel: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: '#A0A0A0',
    },
    dataCoverageText: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: '#B0B0B0',
    },
    experimentsHeader: {
        gap: 8,
        marginBottom: 12,
    },
    componentRow: {
        backgroundColor: '#1A1A1E',
        borderRadius: 16,
        padding: 16,
        gap: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
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
        color: '#FFFFFF',
    },
    componentValue: {
        fontFamily: fonts.semiBold,
        fontSize: 14,
        color: '#E0E0E0',
    },
    progressBarContainer: {
        height: 6,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        borderRadius: 3,
    },
    heroCard: {
        backgroundColor: '#1E1E20',
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.4,
        shadowRadius: 20,
        elevation: 10,
        marginBottom: 8,
    },
    heroHeader: {
        alignItems: 'center',
        marginBottom: 20,
    },
    heroLabel: {
        fontFamily: fonts.medium,
        fontSize: 11,
        color: '#878787',
        letterSpacing: 1.5,
        textTransform: 'uppercase',
        marginBottom: 8,
    },
    heroStatusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 6,
    },
    heroStatusText: {
        fontFamily: fonts.bold,
        fontSize: 24,
        color: '#FFFFFF',
    },
    heroContext: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#B0B0B0',
        textAlign: 'center',
    },
    heroRingContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
    },
    heroMetricsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.2)',
        borderRadius: 16,
        paddingVertical: 12,
        paddingHorizontal: 16,
        gap: 0, // handling spacing with dividers/padding
    },
    heroMetricItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
    },
    heroMetricValue: {
        fontFamily: fonts.medium,
        fontSize: 13,
        color: '#E0E0E0',
    },
    heroMetricDivider: {
        width: 1,
        height: 16,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    deltaPillInline: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        paddingHorizontal: 8,
        paddingVertical: 4,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 8,
    },
    deltaTextInline: {
        fontFamily: fonts.medium,
        fontSize: 12,
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
    tipCard: {
        backgroundColor: '#22282C',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        flexDirection: 'row',
        gap: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    tipIconContainer: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    tipContent: {
        flex: 1,
        gap: 4,
    },
    tipHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 2,
    },
    tipTitle: {
        fontFamily: fonts.bold,
        fontSize: 15,
        color: '#FFFFFF',
        flex: 1,
    },
    tipMetric: {
        fontFamily: fonts.medium,
        fontSize: 11,
        color: '#8E8E93',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        overflow: 'hidden',
    },
    tipDescription: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: '#B0B0B0',
        lineHeight: 18,
    },
    tipLink: {
        fontFamily: fonts.medium,
        fontSize: 12,
        color: Colors.primary,
        marginTop: 4,
    },
    tipsContainer: {
        gap: 0,
    },
    tipsEmptyStateCard: {
        backgroundColor: '#1C1C1E',
        borderRadius: 16,
        padding: 24,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#2C2C2E',
        borderStyle: 'dashed',
    },
    tipsEmptyStateTitle: {
        fontFamily: fonts.bold,
        fontSize: 16,
        color: '#FFFFFF',
        marginBottom: 4,
    },
    tipsEmptyStateText: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#8E8E93',
        textAlign: 'center',
    },
});


