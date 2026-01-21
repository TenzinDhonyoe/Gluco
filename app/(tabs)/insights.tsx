import { AnimatedScreen } from '@/components/animations/animated-screen';
import { SegmentedControl } from '@/components/controls/segmented-control';
import { Disclaimer } from '@/components/ui/Disclaimer';
import { Images } from '@/constants/Images';
import { useAuth, useGlucoseUnit } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { usePersonalInsights } from '@/hooks/usePersonalInsights';
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
    updateCarePathway,
    updateUserAction,
    upsertMetabolicDailyFeature,
} from '@/lib/supabase';
import { formatGlucoseWithUnit } from '@/lib/utils/glucoseUnits';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
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

const ACTION_BASELINE_DAYS = 7;
const DEFAULT_TARGET_MIN = 3.9;
const DEFAULT_TARGET_MAX = 10.0;

const PROGRESS_RANGES = [30, 90, 180];

function addHours(date: Date, hours: number): Date {
    const result = new Date(date.getTime());
    result.setHours(result.getHours() + hours);
    return result;
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
    const glucoseUnit = useGlucoseUnit();
    const params = useLocalSearchParams();
    const insets = useSafeAreaInsets();
    const HEADER_HEIGHT = 120 + insets.top;

    const [activeTab, setActiveTab] = useState<TabKey>('actions');
    const insightsRangeDays = 30;
    const [progressRangeDays, setProgressRangeDays] = useState(90);

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

    useFocusEffect(
        useCallback(() => {
            fetchCoreData();
            fetchActions();
            fetchExperimentsData();
        }, [fetchCoreData, fetchActions, fetchExperimentsData])
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

    const velocity = useMemo(() => computeVelocity(weeklyScores, progressRangeDays), [weeklyScores, progressRangeDays]);

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
        <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: HEADER_HEIGHT + 16 }]} showsVerticalScrollIndicator={false}>
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
        </ScrollView>
    );

    const renderProgressTab = () => (
        <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: HEADER_HEIGHT + 16 }]} showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionTitle}>Trend Velocity</Text>
            <Text style={styles.sectionDescription}>Track direction and speed across 30, 90, and 180 days.</Text>

            <View style={styles.rangeToggleRow}>
                {PROGRESS_RANGES.map(range => (
                    <TouchableOpacity
                        key={range}
                        style={[styles.rangeToggle, progressRangeDays === range && styles.rangeToggleActive]}
                        onPress={() => setProgressRangeDays(range)}
                    >
                        <Text style={[styles.rangeToggleText, progressRangeDays === range && styles.rangeToggleTextActive]}>
                            {range}d
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            <View style={styles.progressCard}>
                <Text style={styles.progressLabel}>Latest score</Text>
                <Text style={styles.progressValue}>{velocity.latest ?? '--'}</Text>
                <Text style={styles.progressMeta}>
                    {velocity.perWeek === null
                        ? 'Not enough weekly data yet.'
                        : `${velocity.perWeek > 0 ? '+' : ''}${velocity.perWeek.toFixed(1)} pts/week over ${progressRangeDays}d`}
                </Text>
            </View>

            <Text style={styles.sectionTitle}>Compounding Habits</Text>
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

            <Text style={styles.sectionTitle}>Data Coverage</Text>
            <Text style={styles.sectionDescription}>Standardized signals powering your longitudinal dataset.</Text>

            <View style={styles.progressCard}>
                <Text style={styles.dataCoverageText}>Sleep days: {dataCoverage.sleepDays}</Text>
                <Text style={styles.dataCoverageText}>Steps days: {dataCoverage.stepsDays}</Text>
                <Text style={styles.dataCoverageText}>Glucose days: {dataCoverage.glucoseDays}</Text>
                <Text style={styles.dataCoverageText}>Meal days: {dataCoverage.mealDays}</Text>
            </View>
        </ScrollView>
    );

    const renderExperimentsTab = () => (
        <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: HEADER_HEIGHT + 16 }]} showsVerticalScrollIndicator={false}>
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
        </ScrollView>
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
                            {activeTab === 'actions' && renderActionsTab()}
                            {activeTab === 'progress' && renderProgressTab()}
                            {activeTab === 'experiments' && renderExperimentsTab()}
                        </>
                    )}
                </View>

                {/* Blurred Header */}
                <BlurView
                    intensity={80}
                    tint="dark"
                    style={[styles.blurHeader, { paddingTop: insets.top }]}
                >
                    <View style={styles.header}>
                        <Text style={styles.headerTitle}>INSIGHTS</Text>
                    </View>
                    <View style={styles.segmentedControlContainer}>
                        <SegmentedControl
                            options={[
                                { label: 'ACTIONS', value: 'actions' },
                                { label: 'PROGRESS', value: 'progress' },
                                { label: 'EXPERIMENTS', value: 'experiments' },
                            ]}
                            value={activeTab}
                            onChange={setActiveTab}
                        />
                    </View>
                </BlurView>
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
    blurHeader: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
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
    actionMeta: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: '#878787',
        fontStyle: 'italic',
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
        backgroundColor: '#1A1A1E',
        borderRadius: 16,
        padding: 16,
        gap: 6,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
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
});
