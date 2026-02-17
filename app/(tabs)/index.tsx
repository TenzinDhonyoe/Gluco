import { ForestGlassBackground } from '@/components/backgrounds/forest-glass-background';
import { AnimatedInteger } from '@/components/animations/animated-number';
import { MealCheckinCard } from '@/components/cards/MealCheckinCard';
import { PersonalInsightsCarousel } from '@/components/carousels/PersonalInsightsCarousel';
import { GlucoseTrendIndicator, type TrendStatus } from '@/components/charts/GlucoseTrendIndicator';
import { MetabolicScoreRing } from '@/components/charts/MetabolicScoreRing';

import { SegmentedControl } from '@/components/controls/segmented-control';
import { ActiveExperimentWidget } from '@/components/experiments/ActiveExperimentWidget';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { LiquidGlassIconButton } from '@/components/ui/LiquidGlassButton';
import { SyncBanner } from '@/components/ui/SyncBanner';
import { behaviorV1Theme } from '@/constants/behaviorV1Theme';
import { Colors } from '@/constants/Colors';
import { Images } from '@/constants/Images';
import { useAuth, useGlucoseUnit } from '@/context/AuthContext';
import { useBehaviorHomeData } from '@/hooks/useBehaviorHomeData';
import { useDailyContext } from '@/hooks/useDailyContext';
import { fonts } from '@/hooks/useFonts';
import { SleepData, useSleepData } from '@/hooks/useSleepData';
import { useGlucoseTargetRange, useTodayScreenData } from '@/hooks/useTodayScreenData';
import { useWeightTrends } from '@/hooks/useWeightTrends';
import { isBehaviorV1Experience } from '@/lib/experience';
import { InsightData, TrackingMode } from '@/lib/insights';
import { getMetabolicWeeklyScores, GlucoseLog, invokeMetabolicScore, invokeScoreExplanation, MealWithCheckin, MetabolicWeeklyScore, ScoreExplanation } from '@/lib/supabase';
import { getDateRange, getRangeDays, RangeKey } from '@/lib/utils/dateRanges';
import { GlucoseUnit } from '@/lib/utils/glucoseUnits';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useScrollToTop } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
    Animated,
    Dimensions,
    Easing,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const TARGET_MIN_MMOL = 3.9;
const TARGET_MAX_MMOL = 10.0;
const WEEKLY_LOG_GOAL = 5;
const CARD_SPACING = 14;
const HERO_STACK_BOTTOM_GAP = 14;



const getRangeLabel = (range: RangeKey) => `Avg over ${getRangeDays(range)} days`;

function getMetabolicScoreColor(score: number): string {
    if (score >= 80) return Colors.success; // Mint
    if (score >= 50) return Colors.blue;    // Blue
    return Colors.warning;                  // Amber
}

function getMetabolicScoreLabel(score: number): string {
    if (score >= 80) return 'Optimal';
    if (score >= 50) return 'Good';
    return 'Needs focus';
}

type HomeMetabolicTone = {
    label: string;
    color: string;
    gradient?: [string, string];
};

type BehaviorMomentumChipTone = 'neutral' | 'success';

type BehaviorMomentumChip = {
    label: string;
    tone: BehaviorMomentumChipTone;
};

function getHomeMetabolicTone(score: number | null, isEarlyJourney: boolean): HomeMetabolicTone {
    if (score === null) {
        return {
            label: 'Build baseline',
            color: behaviorV1Theme.blueSoft,
            gradient: [behaviorV1Theme.blueSoft, behaviorV1Theme.blueBright],
        };
    }

    if (score >= 80) { // Optimal
        return {
            label: 'Optimal rhythm',
            color: behaviorV1Theme.mintSoft,
            gradient: [behaviorV1Theme.mintSoft, behaviorV1Theme.mintBright],
        };
    }

    if (score >= 50) { // Building Momentum
        return {
            label: 'Building momentum',
            color: behaviorV1Theme.blueSoft,
            gradient: [behaviorV1Theme.blueSoft, behaviorV1Theme.blueBright],
        };
    }

    // Needs Attention (< 50)
    return {
        label: isEarlyJourney ? 'Momentum starts today' : 'Needs attention',
        color: behaviorV1Theme.amberSoft,
        gradient: [behaviorV1Theme.amberSoft, behaviorV1Theme.amberBright],
    };
}

function clampScore(value: number): number {
    return Math.min(100, Math.max(0, value));
}

// Determine trend status based on average glucose
function getTrendStatus(avg: number, hasData: boolean, min: number = TARGET_MIN_MMOL, max: number = TARGET_MAX_MMOL): TrendStatus {
    if (!hasData) return 'no_data';
    if (avg < min) return 'low';
    if (avg > max) return 'high';
    return 'in_range';
}

// Memoized Glucose Trends Card component - now uses mascot-based indicator
const GlucoseTrendsCard = React.memo(({ range, allLogs, isLoading, glucoseUnit }: {
    range: RangeKey;
    allLogs: GlucoseLog[];
    isLoading: boolean;
    glucoseUnit: GlucoseUnit;
}) => {
    const { targetMin, targetMax } = useGlucoseTargetRange();

    // Filter logs based on selected range and calculate average
    const { avg, hasData } = useMemo(() => {
        const { startDate, endDate } = getDateRange(range);
        const filteredLogs = allLogs.filter(log => {
            const logDate = new Date(log.logged_at);
            return logDate >= startDate && logDate <= endDate;
        });

        if (filteredLogs.length === 0) {
            return { avg: 0, hasData: false };
        }

        const sum = filteredLogs.reduce((acc, log) => acc + log.glucose_level, 0);
        return { avg: sum / filteredLogs.length, hasData: true };
    }, [allLogs, range]);

    // Get the trend status for the indicator
    const trendStatus = useMemo(() =>
        getTrendStatus(avg, hasData, targetMin, targetMax),
        [avg, hasData, targetMin, targetMax]
    );

    return (
        <LinearGradient
            colors={['rgba(33, 33, 35, 0.95)', 'rgba(26, 26, 28, 0.95)']} // Base charcoal
            style={styles.trendsCard}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
        >
            <GlucoseTrendIndicator status={trendStatus} size={220} />
        </LinearGradient>
    );
}, (prev, next) => prev.range === next.range && prev.isLoading === next.isLoading && prev.allLogs.length === next.allLogs.length && prev.glucoseUnit === next.glucoseUnit);


// Stat Card Component
function StatCard({ icon, iconColor, title, value, unit, description }: {
    icon: React.ReactNode;
    iconColor: string;
    title: string;
    value: string;
    unit?: string;
    description: string;
}) {
    return (
        <View style={styles.statCard}>
            <View style={styles.statHeader}>
                {icon}
                <Text style={[styles.statTitle, { color: iconColor }]}>{title}</Text>
            </View>
            <View style={styles.statValueContainer}>
                <Text style={styles.statValue}>{value}</Text>
                {unit && <Text style={styles.statUnit}>{unit}</Text>}
            </View>
            <Text style={styles.statDescription}>{description}</Text>
        </View>
    );
}

// Elevated reading threshold - readings above this are considered elevated (mmol/L)
// Memoized In Target Band Stat Card - calculates % of READINGS (not days) in target range
const DaysInRangeCard = React.memo(({ range, glucoseLogs }: {
    range: RangeKey;
    glucoseLogs: GlucoseLog[];
}) => {
    const { targetMin, targetMax } = useGlucoseTargetRange();

    const percentage = useMemo(() => {
        const { startDate, endDate } = getDateRange(range);
        const filteredLogs = glucoseLogs.filter(log => {
            const logDate = new Date(log.logged_at);
            return logDate >= startDate && logDate <= endDate;
        });

        if (filteredLogs.length === 0) return null;

        // Count individual readings in range (not daily averages)
        const inRangeReadings = filteredLogs.filter(
            log => log.glucose_level >= targetMin && log.glucose_level <= targetMax
        ).length;

        // Calculate percentage based on individual readings
        return Math.round((inRangeReadings / filteredLogs.length) * 100);
    }, [glucoseLogs, range, targetMin, targetMax]);

    const hasData = percentage !== null;

    return (
        <View style={styles.statCard}>
            <View style={styles.statHeader}>
                <Ionicons name="trending-up" size={32} color={Colors.glucoseGood} />
                <Text style={[styles.statTitle, { color: Colors.glucoseGood }]}>IN TARGET</Text>
            </View>
            <View style={styles.statValueContainer}>
                {hasData ? (
                    <>
                        <AnimatedInteger
                            value={percentage}
                            duration={500}
                            style={styles.statValue}
                        />
                        <Text style={styles.statUnit}>%</Text>
                    </>
                ) : (
                    <>
                        <Text style={styles.statValue}>-</Text>
                        <Text style={styles.statUnit}>%</Text>
                    </>
                )}
            </View>
            <View style={[styles.cardStatusPill, { backgroundColor: Colors.glucoseGood + '30' }]}>
                <View style={[styles.cardStatusDot, { backgroundColor: Colors.glucoseGood }]} />
                <Text style={[styles.cardStatusText, { color: Colors.glucoseGood }]}>
                    {targetMin.toFixed(1)}-{targetMax.toFixed(1)} mmol/L
                </Text>
            </View>
        </View>
    );
}, (prev, next) => prev.range === next.range && prev.glucoseLogs === next.glucoseLogs);

// Memoized Activity Stat Card - Unified (HealthKit + Manual)
const ActivityStatCard = React.memo(({
    range,
    activityLogs,
    healthKitMinutes,
    isHealthKitAuthorized,
    isHealthKitAvailable
}: {
    range: RangeKey;
    activityLogs: any[];
    healthKitMinutes: number | null;
    isHealthKitAuthorized: boolean;
    isHealthKitAvailable: boolean;
}) => {
    // Calculate average from manual logs
    const manualAvgMinutes = useMemo(() => {
        const { startDate, endDate } = getDateRange(range);
        const filteredLogs = activityLogs.filter(log => {
            const logDate = new Date(log.logged_at);
            return logDate >= startDate && logDate <= endDate;
        });

        const total = filteredLogs.reduce((sum, log) => sum + log.duration_minutes, 0);
        const days = getRangeDays(range);
        return days > 0 ? Math.round(total / days) : 0;
    }, [activityLogs, range]);

    // Determine values to display
    const showHealthKit = isHealthKitAuthorized && isHealthKitAvailable;
    const avgMinutes = showHealthKit ? (healthKitMinutes ?? 0) : manualAvgMinutes;
    const hasData = avgMinutes > 0;
    const rangeLabel = useMemo(() => getRangeLabel(range), [range]);

    // Display value formatting
    const displayValue = hasData ? Math.round(avgMinutes).toString() : '-';

    // Status logic (Low < 20m, Moderate 20-40m, High > 40m)
    let statusColor = Colors.textTertiary;
    let statusLabel = 'No data';

    if (hasData) {
        if (avgMinutes > 40) {
            statusColor = Colors.success;
            statusLabel = 'High';
        } else if (avgMinutes >= 20) {
            statusColor = Colors.warning;
            statusLabel = 'Moderate';
        } else {
            statusColor = Colors.error;
            statusLabel = 'Low';
        }
    }

    const handlePress = () => {
        // Allow connecting if available but not authorized
        if (isHealthKitAvailable && !isHealthKitAuthorized) {
            router.push('/data-sources');
        }
    };

    return (
        <AnimatedPressable
            style={styles.statCard}
            onPress={handlePress}
            disabled={!(isHealthKitAvailable && !isHealthKitAuthorized)}
        >
            <View style={styles.statHeader}>
                <Image source={Images.mascots.exercise} style={{ width: 40, height: 40, resizeMode: 'contain' }} />
                <Text style={[styles.statTitle, { color: Colors.activity }]}>ACTIVE MINS</Text>
            </View>
            <View style={styles.statValueContainer}>
                <Text style={styles.statValue}>{displayValue}</Text>
                <Text style={styles.statUnit}>min/day</Text>
            </View>
            {isHealthKitAvailable && !isHealthKitAuthorized ? (
                <Text style={styles.statDescription}>Tap to connect</Text>
            ) : (
                <>
                    <Text style={styles.statMeta}>{rangeLabel}</Text>
                    <StatusPill color={statusColor} label={statusLabel} />
                </>
            )}
        </AnimatedPressable>
    );
}, (prev, next) =>
    prev.range === next.range &&
    prev.activityLogs === next.activityLogs &&
    prev.healthKitMinutes === next.healthKitMinutes &&
    prev.isHealthKitAuthorized === next.isHealthKitAuthorized
);

// Fibre thresholds based on Canada DV (25g/day target) and average intake (~15g)
const FIBRE_TARGET = 25;
const FIBRE_MODERATE_THRESHOLD = 15;

type FibreStatus = 'low' | 'moderate' | 'high';

function getFibreStatus(avgPerDay: number): FibreStatus {
    if (avgPerDay < FIBRE_MODERATE_THRESHOLD) return 'low';
    if (avgPerDay < FIBRE_TARGET) return 'moderate';
    return 'high';
}

function getFibreStatusColor(status: FibreStatus): string {
    switch (status) {
        case 'high': return Colors.success;
        case 'moderate': return Colors.warning;
        case 'low': return Colors.error;
    }
}

// Reusable Status Pill Component
const StatusPill = ({ color, label }: { color: string; label: string }) => {
    const isPulsing = label !== 'No data';
    const opacity = React.useRef(new Animated.Value(isPulsing ? 0.4 : 1)).current;

    React.useEffect(() => {
        if (isPulsing) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(opacity, {
                        toValue: 1,
                        duration: 1000,
                        useNativeDriver: true,
                    }),
                    Animated.timing(opacity, {
                        toValue: 0.4,
                        duration: 1000,
                        useNativeDriver: true,
                    }),
                ])
            ).start();
        } else {
            opacity.setValue(1); // Static for no data
        }
    }, [isPulsing, opacity]);

    return (
        <View style={[styles.cardStatusPill, { backgroundColor: color + '30' }]}>
            <Animated.View style={[styles.cardStatusDot, { backgroundColor: color, opacity }]} />
            <Text style={[styles.cardStatusText, { color }]}>{label}</Text>
        </View>
    );
};

// Memoized Fibre Stat Card - shows fibre intake from logged meals
const FibreStatCard = React.memo(({ range, fibreSummary }: {
    range: RangeKey;
    fibreSummary: { avgPerDay: number } | null;
}) => {
    const avgPerDay = fibreSummary?.avgPerDay ?? 0;
    const hasData = fibreSummary !== null && avgPerDay > 0;

    const status = getFibreStatus(avgPerDay);
    const statusColor = hasData ? getFibreStatusColor(status) : Colors.textTertiary;
    const statusLabel = hasData ? (status.charAt(0).toUpperCase() + status.slice(1)) : 'No data';

    return (
        <View style={styles.statCard}>
            <View style={styles.statHeader}>
                <Text style={styles.broccoliIcon}>🥦</Text>
                <Text style={[styles.statTitle, { color: Colors.fiber }]}>FIBRE INTAKE</Text>
            </View>
            <View style={styles.statValueContainer}>
                <Text style={styles.statValue}>{hasData ? avgPerDay.toFixed(1) : '-'}</Text>
                <Text style={styles.statUnit}>g/day</Text>
            </View>
            <StatusPill color={statusColor} label={statusLabel} />
        </View>
    );
}, (prev, next) => prev.range === next.range && prev.fibreSummary === next.fibreSummary);

// Sleep thresholds based on CDC recommendations (7+ hours for adults)
// <6: Poor, 6-7: Fair, >7: Good
const SLEEP_TARGET = 7;
const SLEEP_FAIR_THRESHOLD = 6;

type SleepStatus = 'poor' | 'fair' | 'good';

function getSleepStatus(avgHours: number): SleepStatus {
    if (avgHours < SLEEP_FAIR_THRESHOLD) return 'poor';
    if (avgHours < SLEEP_TARGET) return 'fair';
    return 'good';
}

function getSleepStatusColor(status: SleepStatus): string {
    switch (status) {
        case 'good': return Colors.sleep;
        case 'fair': return Colors.warning;
        case 'poor': return Colors.error;
    }
}

// Memoized Sleep Stat Card - shows average sleep duration from HealthKit
const SleepStatCard = React.memo(({ range, sleepData }: {
    range: RangeKey;
    sleepData: SleepData | null;
}) => {
    const avgHours = sleepData?.avgHoursPerNight ?? 0;
    const isAuthorized = sleepData?.isAuthorized ?? false;
    const isAvailable = sleepData?.isAvailable ?? false;
    const hasData = isAuthorized && avgHours > 0;

    const status = getSleepStatus(avgHours);
    const statusColor = hasData ? getSleepStatusColor(status) : Colors.textTertiary;
    const statusLabel = hasData ? (status.charAt(0).toUpperCase() + status.slice(1)) : 'No data';

    // Format hours - show whole number like "5" or decimal like "7.5"
    const displayValue = hasData
        ? (avgHours % 1 === 0 ? Math.round(avgHours).toString() : avgHours.toFixed(1))
        : '--';

    // Handle tap to connect if not authorized
    const handlePress = () => {
        if (!isAuthorized && isAvailable) {
            router.push('/data-sources');
        }
    };

    return (
        <AnimatedPressable
            style={styles.statCard}
            onPress={handlePress}
            disabled={isAuthorized}
        >
            <View style={styles.statHeader}>
                <Image source={Images.mascots.sleep} style={{ width: 40, height: 40, resizeMode: 'contain' }} />
                <Text style={[styles.statTitle, { color: Colors.sleep }]}>SLEEP</Text>
            </View>
            <View style={styles.statValueContainer}>
                <Text style={styles.statValue}>{displayValue}</Text>
                <Text style={styles.statUnit}>hr/night</Text>
            </View>
            {isAvailable && !isAuthorized ? (
                <Text style={styles.statDescription}>Tap to connect</Text>
            ) : (
                <StatusPill color={statusColor} label={statusLabel} />
            )}
        </AnimatedPressable>
    );
}, (prev, next) => prev.range === next.range && prev.sleepData === next.sleepData);

// Steps Stat Card - for wearables_only mode (Apple Health)
const StepsStatCard = React.memo(({ avgSteps, isAuthorized, isAvailable, range }: {
    avgSteps: number | null;
    isAuthorized: boolean;
    isAvailable: boolean;
    range: RangeKey;
}) => {
    const displayValue = isAuthorized && avgSteps !== null
        ? avgSteps.toLocaleString()
        : '—';

    const hasData = isAuthorized && avgSteps !== null && avgSteps > 0;
    const rangeLabel = useMemo(() => getRangeLabel(range), [range]);

    // Dynamic thresholds for steps (Sedentary < 5k, Low Active 5k-10k, Active > 10k)
    let statusColor = Colors.textTertiary;
    let statusLabel = 'No data';

    if (hasData && avgSteps !== null) {
        if (avgSteps >= 10000) {
            statusColor = Colors.success;
            statusLabel = 'High';
        } else if (avgSteps >= 5000) {
            statusColor = Colors.warning;
            statusLabel = 'Moderate';
        } else {
            statusColor = Colors.error;
            statusLabel = 'Low';
        }
    }

    const handlePress = () => {
        if (!isAuthorized && isAvailable) {
            router.push('/data-sources');
        }
    };

    return (
        <AnimatedPressable
            style={styles.statCard}
            onPress={handlePress}
            disabled={isAuthorized}
        >
            <View style={styles.statHeader}>
                <Ionicons name="footsteps" size={32} color={Colors.steps} />
                <Text style={[styles.statTitle, { color: Colors.steps }]}>STEPS</Text>
            </View>
            <View style={styles.statValueContainer}>
                <Text style={styles.statValue}>{displayValue}</Text>
                <Text style={styles.statUnit}>steps/day</Text>
            </View>
            {isAvailable && !isAuthorized ? (
                <Text style={styles.statDescription}>Tap to connect</Text>
            ) : (
                <>
                    <Text style={styles.statMeta}>{rangeLabel}</Text>
                    <StatusPill color={statusColor} label={statusLabel} />
                </>
            )}
        </AnimatedPressable>
    );
});

// Metabolic Score Card - matches stat card styling, compact until data exists
const MetabolicScoreCard = React.memo(({ weeklyScores, currentScore, isLoading }: {
    weeklyScores: MetabolicWeeklyScore[];
    currentScore: number | null;
    isLoading: boolean;
}) => {
    // Get latest score and compute velocity
    const { latestScore } = useMemo(() => {
        const validScores = weeklyScores.filter(s => s.score7d !== null);

        // Use currentScore from edge function if available, otherwise use latest from weekly scores
        const latest = currentScore ?? validScores[0]?.score7d ?? null;

        if (latest === null) {
            return { latestScore: null };
        }

        return { latestScore: latest };
    }, [weeklyScores, currentScore]);

    const hasScore = latestScore !== null && !isLoading;



    // Empty/setup state - compact and instructional
    if (!hasScore) {
        return (
            <View style={styles.metabolicScoreCardEmpty}>
                <View style={styles.metabolicScoreEmptyLeft}>
                    <MetabolicScoreRing size={56} />
                    <View style={styles.metabolicScoreEmptyContent}>
                        <Text style={styles.metabolicScoreEmptyTitle}>Metabolic Score</Text>
                        <Text style={styles.metabolicScoreEmptySubtitle}>Log sleep, activity, and meals to unlock</Text>
                    </View>
                </View>
            </View>
        );
    }

    // Data exists - show score with appropriate prominence
    const scoreColor = getMetabolicScoreColor(latestScore);
    const scoreLabel = getMetabolicScoreLabel(latestScore);

    return (
        <AnimatedPressable
            style={styles.metabolicScoreCardEmpty}
            onPress={() => router.push({ pathname: '/(tabs)/insights', params: { tab: 'progress' } })}
        >
            <View style={styles.metabolicScoreEmptyLeft}>
                <MetabolicScoreRing size={56} score={latestScore} scoreColor={scoreColor} />
                <View style={styles.metabolicScoreEmptyContent}>
                    <Text style={styles.metabolicScoreEmptyTitle}>Metabolic Score</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={[styles.metabolicScoreLabelPill, { backgroundColor: scoreColor + '20', paddingVertical: 2, paddingHorizontal: 8 }]}>
                            <Text style={[styles.metabolicScoreLabelText, { color: scoreColor, fontSize: 11 }]}>
                                {scoreLabel}
                            </Text>
                        </View>

                    </View>
                    <Text style={[styles.metabolicScoreDescription, { marginTop: 4, opacity: 0.7 }]}>
                        From sleep, activity, and glucose
                    </Text>
                </View>
            </View>
        </AnimatedPressable>
    );
});



// Connect Apple Health CTA Card
const ConnectHealthCTA = ({ onConnected }: { onConnected?: () => void }) => {
    const handlePress = async () => {
        try {
            const { requestHealthKitAuthorization } = await import('@/lib/healthkit');
            const authorized = await requestHealthKitAuthorization();
            if (authorized) {
                onConnected?.();
            }
        } catch (error) {
            console.warn('HealthKit authorization failed:', error);
        }
    };

    return (
        <AnimatedPressable style={styles.connectHealthCard} onPress={handlePress}>
            <Ionicons name="heart-circle" size={28} color={Colors.heartRate} />
            <View style={styles.connectHealthContent}>
                <Text style={styles.connectHealthTitle}>Connect Apple Health</Text>
                <Text style={styles.connectHealthSubtitle}>Track steps, activity, and sleep</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textTertiary} />
        </AnimatedPressable>
    );
};


// Meal Response Input Sheet - Bottom sheet for quick meal input
function MealReflectionSheet({
    visible,
    onClose,
    onAnalyze
}: {
    visible: boolean;
    onClose: () => void;
    onAnalyze: (text: string) => void;
}) {
    const [inputText, setInputText] = React.useState('');
    const slideAnim = React.useRef(new Animated.Value(300)).current;

    React.useEffect(() => {
        if (visible) {
            Animated.spring(slideAnim, {
                toValue: 0,
                useNativeDriver: true,
                tension: 65,
                friction: 11,
            }).start();
        } else {
            slideAnim.setValue(300);
        }
    }, [visible, slideAnim]);

    const handleAnalyze = () => {
        if (inputText.trim()) {
            onAnalyze(inputText.trim());
            setInputText('');
        }
    };

    const handleClose = () => {
        Animated.timing(slideAnim, {
            toValue: 300,
            duration: 200,
            useNativeDriver: true,
        }).start(() => {
            setInputText('');
            onClose();
        });
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={handleClose}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                <Pressable style={spikeSheetStyles.overlay} onPress={handleClose}>
                    <Animated.View
                        style={[
                            spikeSheetStyles.sheet,
                            { transform: [{ translateY: slideAnim }] }
                        ]}
                    >
                        <Pressable onPress={() => { }}>
                            <View style={spikeSheetStyles.handle} />
                            <Text style={spikeSheetStyles.title}>Check meal response</Text>
                            <Text style={spikeSheetStyles.subtitle}>
                                What are you planning to eat?
                            </Text>
                            <TextInput
                                style={spikeSheetStyles.input}
                                placeholder="e.g., butter chicken with naan and rice"
                                placeholderTextColor="#878787"
                                value={inputText}
                                onChangeText={setInputText}
                                multiline
                                numberOfLines={3}
                                textAlignVertical="top"
                                autoFocus
                            />
                            <TouchableOpacity
                                style={[
                                    spikeSheetStyles.analyzeButton,
                                    !inputText.trim() && spikeSheetStyles.analyzeButtonDisabled,
                                ]}
                                onPress={handleAnalyze}
                                disabled={!inputText.trim()}
                                activeOpacity={0.8}
                            >
                                <Text style={spikeSheetStyles.analyzeButtonText}>Analyze</Text>
                            </TouchableOpacity>
                        </Pressable>
                    </Animated.View>
                </Pressable>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const spikeSheetStyles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: Colors.overlayMedium,
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: Colors.backgroundCard,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        paddingBottom: 40,
    },
    handle: {
        width: 36,
        height: 4,
        backgroundColor: Colors.borderCard,
        borderRadius: 2,
        alignSelf: 'center',
        marginBottom: 20,
    },
    mealSectionTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 18,
        color: Colors.textPrimary,
        marginBottom: 12,
        paddingHorizontal: 16,
    },
    title: {
        fontFamily: fonts.semiBold,
        fontSize: 20,
        color: Colors.textPrimary,
        marginBottom: 8,
    },
    subtitle: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: Colors.textTertiary,
        marginBottom: 16,
    },
    input: {
        backgroundColor: '#232527',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: Colors.borderLight,
        padding: 16,
        fontFamily: fonts.regular,
        fontSize: 16,
        color: '#E7E8E9',
        minHeight: 80,
    },
    analyzeButton: {
        backgroundColor: Colors.success,
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 20,
    },
    analyzeButtonDisabled: {
        backgroundColor: Colors.borderCard,
    },
    analyzeButtonText: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: Colors.textPrimary,
    },
});

// Exercise Input Sheet - Bottom sheet for exercise input
function ExerciseInputSheet({
    visible,
    onClose,
    onAnalyze
}: {
    visible: boolean;
    onClose: () => void;
    onAnalyze: (text: string) => void;
}) {
    const [inputText, setInputText] = React.useState('');
    const slideAnim = React.useRef(new Animated.Value(300)).current;

    React.useEffect(() => {
        if (visible) {
            Animated.spring(slideAnim, {
                toValue: 0,
                useNativeDriver: true,
                tension: 65,
                friction: 11,
            }).start();
        } else {
            slideAnim.setValue(300);
        }
    }, [visible, slideAnim]);

    const handleAnalyze = () => {
        if (inputText.trim()) {
            onAnalyze(inputText.trim());
            setInputText('');
        }
    };

    const handleClose = () => {
        Animated.timing(slideAnim, {
            toValue: 300,
            duration: 200,
            useNativeDriver: true,
        }).start(() => {
            setInputText('');
            onClose();
        });
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={handleClose}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                <Pressable style={spikeSheetStyles.overlay} onPress={handleClose}>
                    <Animated.View
                        style={[
                            spikeSheetStyles.sheet,
                            { transform: [{ translateY: slideAnim }] }
                        ]}
                    >
                        <Pressable onPress={() => { }}>
                            <View style={spikeSheetStyles.handle} />
                            <Text style={spikeSheetStyles.title}>Check exercise impact</Text>
                            <Text style={spikeSheetStyles.subtitle}>
                                What exercise are you planning to do?
                            </Text>
                            <TextInput
                                style={spikeSheetStyles.input}
                                placeholder="e.g., 30 min walk after lunch"
                                placeholderTextColor="#878787"
                                value={inputText}
                                onChangeText={setInputText}
                                multiline
                                numberOfLines={3}
                                textAlignVertical="top"
                                autoFocus
                            />
                            <TouchableOpacity
                                style={[
                                    spikeSheetStyles.analyzeButton,
                                    !inputText.trim() && spikeSheetStyles.analyzeButtonDisabled,
                                ]}
                                onPress={handleAnalyze}
                                disabled={!inputText.trim()}
                                activeOpacity={0.8}
                            >
                                <Text style={spikeSheetStyles.analyzeButtonText}>Analyze</Text>
                            </TouchableOpacity>
                        </Pressable>
                    </Animated.View>
                </Pressable>
            </KeyboardAvoidingView>
        </Modal>
    );
}

// Swipeable Tip Cards Component

// Meal Card Component with Mini Chart
// const MINI_CHART_WIDTH = 280;
const MINI_CHART_HEIGHT = 130;

function BehaviorMetabolicHeroCard({
    score,
    scoreLoading,
    scoreUnlocked,
    unlockDaysCompleted,
    unlockDaysTarget,
    scoreTone,
    encouragementText,
    momentumChips,
    onPressScore,
}: {
    score: number | null;
    scoreLoading: boolean;
    scoreUnlocked: boolean;
    unlockDaysCompleted: number;
    unlockDaysTarget: number;
    scoreTone: HomeMetabolicTone;
    encouragementText: string;
    momentumChips: BehaviorMomentumChip[];
    onPressScore: () => void;
}) {
    const resolvedScore = score !== null ? clampScore(score) : null;
    const hasScore = scoreUnlocked && resolvedScore !== null;
    const showLoadingState = scoreUnlocked && scoreLoading && resolvedScore === null;
    const scoreColor = scoreTone.color;
    const scoreLabel = scoreTone.label;
    const unlockedDays = Math.min(unlockDaysTarget, Math.max(0, unlockDaysCompleted));

    return (
        <LinearGradient
            colors={[
                'rgba(26, 26, 28, 0.90)',
                'rgba(26, 26, 28, 0.85)',
                'rgba(26, 26, 28, 0.80)',
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={styles.behaviorPrimaryCard}
        >
            <BlurView tint="dark" intensity={28} style={StyleSheet.absoluteFillObject} />
            <LinearGradient
                colors={['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0.01)']}
                locations={[0, 0.42, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0.85, y: 1 }}
                style={styles.behaviorPrimarySheen}
            />
            <View style={styles.behaviorScoreAccentBar} />
            <View style={styles.behaviorPrimaryTopRow}>
                <Text style={styles.behaviorLabel}>METABOLIC SCORE</Text>
            </View>

            <AnimatedPressable style={styles.behaviorScoreRow} onPress={onPressScore}>
                <View style={styles.behaviorScoreRingWrap}>
                    <MetabolicScoreRing
                        size={98}
                        score={scoreUnlocked ? resolvedScore : null}
                        scoreColor={scoreColor}
                        visualPreset="hero_vivid"
                        showInnerValue={false}
                        gradientColors={scoreTone.gradient}
                    />
                    {scoreUnlocked && (
                        <Image
                            source={resolvedScore !== null && resolvedScore >= 50 ? Images.mascots.default : Images.mascots.cry}
                            style={styles.behaviorScoreRingMascot}
                        />
                    )}
                </View>
                <View style={styles.behaviorScoreContent}>
                    {scoreUnlocked ? (
                        <>
                            <View style={styles.behaviorScoreValueRow}>
                                <Text style={styles.behaviorScoreValue}>
                                    {hasScore ? Math.round(resolvedScore).toString() : '--'}
                                </Text>
                                <Text style={styles.behaviorScoreValueMax}>/100</Text>
                            </View>
                            <View style={[styles.behaviorScorePill, { backgroundColor: `${scoreColor}22` }]}>
                                <Text style={[styles.behaviorScorePillText, { color: scoreColor }]}>{scoreLabel}</Text>
                            </View>
                            <Text style={styles.behaviorScoreMeta}>
                                {showLoadingState
                                    ? 'Refreshing from sleep, activity, meals, and glucose'
                                    : encouragementText}
                            </Text>
                        </>
                    ) : (
                        <>
                            <Text style={styles.behaviorScoreUnlockTitle}>Unlocking score</Text>
                            <View style={styles.behaviorUnlockProgressPill}>
                                <Text style={styles.behaviorUnlockProgressText}>
                                    {unlockedDays} of {unlockDaysTarget} days complete
                                </Text>
                            </View>
                            <Text style={styles.behaviorScoreMeta}>
                                Complete 7 days to unlock your Metabolic Score
                            </Text>
                        </>
                    )}
                </View>
            </AnimatedPressable>

            {momentumChips.length > 0 && (
                <View style={styles.behaviorMomentumChipsRow}>
                    {momentumChips.map((chip, index) => (
                        <View
                            key={`${chip.label}-${index}`}
                            style={[
                                styles.behaviorMomentumChip,
                                chip.tone === 'success'
                                    ? styles.behaviorMomentumChipSuccess
                                    : styles.behaviorMomentumChipNeutral,
                            ]}
                        >
                            <Text
                                style={[
                                    styles.behaviorMomentumChipText,
                                    chip.tone === 'success'
                                        ? styles.behaviorMomentumChipTextSuccess
                                        : styles.behaviorMomentumChipTextNeutral,
                                ]}
                            >
                                {chip.label}
                            </Text>
                        </View>
                    ))}
                </View>
            )}

        </LinearGradient>
    );
}

function BehaviorNextActionCard({
    actionTitle,
    actionDescription,
    ctaLabel,
    onPressAction,
    onPressMoreSteps,
}: {
    actionTitle: string;
    actionDescription: string;
    ctaLabel: string;
    onPressAction: () => void;
    onPressMoreSteps: () => void;
}) {
    return (
        <LinearGradient
            colors={[
                'rgba(26, 26, 28, 0.90)',
                'rgba(26, 26, 28, 0.85)',
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={styles.behaviorNextActionCard}
        >
            <BlurView tint="dark" intensity={14} style={StyleSheet.absoluteFillObject} />
            <LinearGradient
                colors={['rgba(255,255,255,0.03)', 'rgba(255,255,255,0.01)', 'rgba(255,255,255,0.0)']}
                locations={[0, 0.42, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0.85, y: 1 }}
                style={styles.behaviorPrimarySheen}
            />
            <Text style={styles.behaviorActionStripLabel}>NEXT BEST ACTION</Text>
            <Text style={styles.behaviorActionStripTitle}>{actionTitle}</Text>
            <Text style={styles.behaviorActionStripDescription}>{actionDescription}</Text>

            <AnimatedPressable style={styles.behaviorPrimaryCta} onPress={onPressAction}>
                <Ionicons name="flash-outline" size={15} color={behaviorV1Theme.ctaPrimaryText} />
                <Text style={styles.behaviorPrimaryCtaText}>{ctaLabel}</Text>
                <Ionicons name="arrow-forward" size={14} color={behaviorV1Theme.ctaPrimaryText} />
            </AnimatedPressable>

            <AnimatedPressable style={styles.behaviorPrimaryLink} onPress={onPressMoreSteps}>
                <Text style={styles.behaviorPrimaryLinkText}>See more steps in Daily Focus</Text>
                <Ionicons name="arrow-forward" size={12} color={behaviorV1Theme.sageBright} />
            </AnimatedPressable>
        </LinearGradient>
    );
}

function BehaviorMomentumCard({
    label,
    value,
    subtitle,
    state = 'data',
    priority = 'low',
    compactValue = false,
    cueIcon = 'arrow-forward',
    cueText,
    onPress,
}: {
    label: string;
    value: string;
    subtitle: string;
    state?: 'data' | 'invite';
    priority?: 'high' | 'low';
    compactValue?: boolean;
    cueIcon?: keyof typeof Ionicons.glyphMap;
    cueText?: string;
    onPress?: () => void;
}) {
    return (
        <AnimatedPressable
            style={[
                styles.behaviorMomentumCard,
                priority === 'high' ? styles.behaviorMomentumCardHigh : styles.behaviorMomentumCardLow,
                state === 'invite' && styles.behaviorMomentumCardInvite,
                state === 'invite' && priority === 'high' && styles.behaviorMomentumCardInviteHigh,
            ]}
            onPress={onPress}
            disabled={!onPress}
        >
            <BlurView tint="dark" intensity={20} style={StyleSheet.absoluteFillObject} />
            {state === 'invite' ? (
                <View style={styles.behaviorMomentumLabelRow}>
                    <Ionicons name="ellipse-outline" size={10} color={behaviorV1Theme.sageSoft} style={{ opacity: 0.5 }} />
                    <Text style={[styles.behaviorMomentumLabel, styles.behaviorMomentumLabelInvite]}>{label}</Text>
                </View>
            ) : (
                <Text style={styles.behaviorMomentumLabel}>{label}</Text>
            )}
            <Text
                style={[
                    styles.behaviorMomentumValue,
                    priority === 'high' ? styles.behaviorMomentumValueHigh : styles.behaviorMomentumValueLow,
                    compactValue && styles.behaviorMomentumValueText,
                    state === 'invite' && styles.behaviorMomentumValueInvite,
                ]}
            >
                {value}
            </Text>
            <Text
                style={[
                    styles.behaviorMomentumSubtitle,
                    priority === 'high' ? styles.behaviorMomentumSubtitleHigh : styles.behaviorMomentumSubtitleLow,
                ]}
            >
                {subtitle}
            </Text>
            {state === 'invite' && cueText ? (
                <View style={styles.behaviorMomentumInviteRow}>
                    <Ionicons name={cueIcon} size={12} color={behaviorV1Theme.sageBright} />
                    <Text style={styles.behaviorMomentumInviteText}>{cueText}</Text>
                </View>
            ) : null}
        </AnimatedPressable>
    );
}

function BehaviorAdvancedGlucoseCard({
    expanded,
    onToggle,
    avgGlucose,
    timeInZone,
}: {
    expanded: boolean;
    onToggle: () => void;
    avgGlucose: string;
    timeInZone: string;
}) {
    return (
        <View style={styles.behaviorAdvancedCard}>
            <BlurView tint="dark" intensity={20} style={StyleSheet.absoluteFillObject} />
            <AnimatedPressable style={styles.behaviorAdvancedHeader} onPress={onToggle}>
                <View style={styles.behaviorAdvancedHeaderLeft}>
                    <Ionicons name="analytics-outline" size={16} color="#C8D2DB" />
                    <Text style={styles.behaviorAdvancedTitle}>Advanced glucose details</Text>
                </View>
                <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color="#C4C4C4" />
            </AnimatedPressable>
            {expanded && (
                <View style={styles.behaviorAdvancedBody}>
                    <View style={styles.behaviorAdvancedMetric}>
                        <Text style={styles.behaviorAdvancedMetricLabel}>Average</Text>
                        <Text style={styles.behaviorAdvancedMetricValue}>{avgGlucose}</Text>
                    </View>
                    <View style={styles.behaviorAdvancedMetric}>
                        <Text style={styles.behaviorAdvancedMetricLabel}>In target</Text>
                        <Text style={styles.behaviorAdvancedMetricValue}>{timeInZone}</Text>
                    </View>
                    <AnimatedPressable
                        style={styles.behaviorAdvancedCta}
                        onPress={() => router.push('/log-glucose')}
                    >
                        <Text style={styles.behaviorAdvancedCtaText}>Log glucose</Text>
                    </AnimatedPressable>
                </View>
            )}
        </View>
    );
}


export default function TodayScreen() {
    const { profile, user } = useAuth();
    const glucoseUnit = useGlucoseUnit();
    const isBehaviorV1 = isBehaviorV1Experience(profile?.experience_variant);
    const insets = useSafeAreaInsets();
    const [range, setRange] = useState<RangeKey>('30d');
    const [spikeSheetVisible, setSpikeSheetVisible] = useState(false);
    const [exerciseSheetVisible, setExerciseSheetVisible] = useState(false);
    const [weeklyScores, setWeeklyScores] = useState<MetabolicWeeklyScore[]>([]);
    const [currentScore, setCurrentScore] = useState<number | null>(null);
    const [scoresLoading, setScoresLoading] = useState(true);
    const [advancedGlucoseExpanded, setAdvancedGlucoseExpanded] = useState(false);
    const [scoreExplanationVisible, setScoreExplanationVisible] = useState(false);
    const [scoreExplanation, setScoreExplanation] = useState<ScoreExplanation | null>(null);
    const [scoreExplanationLoading, setScoreExplanationLoading] = useState(false);
    const scoreExplanationSlideAnim = useRef(new Animated.Value(400)).current;
    const scrollViewRef = useRef<ScrollView>(null);

    useScrollToTop(scrollViewRef);

    // Use transition for non-blocking range changes
    const [, startTransition] = useTransition();

    // Handler for range changes - uses startTransition to keep UI responsive
    const handleRangeChange = useCallback((newRange: RangeKey) => {
        startTransition(() => {
            setRange(newRange);
        });
    }, []);

    const selectedRange: RangeKey = isBehaviorV1 ? '7d' : range;

    // Use unified data fetching hook - batches all queries
    const { glucoseLogs, activityLogs, fibreSummary, recentMeals, isLoading, refetch: refetchData } = useTodayScreenData(selectedRange);
    const { targetMin, targetMax } = useGlucoseTargetRange();
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Fetch sleep data from HealthKit (always fetches 90d, doesn't refetch on range change)
    const { data: sleepData, refetch: refetchSleep } = useSleepData(selectedRange);
    const {
        latestWeightKg,
        delta7dKg,
        logs: weightLogs,
        refetch: refetchWeight,
        isLoading: weightLoading,
    } = useWeightTrends(30);

    // Fetch daily context (steps, active minutes) from HealthKit
    // Always use 90d range to avoid refetching when user switches timeframes
    const maxDateRange = useMemo(() => getDateRange('90d'), []);
    const dailyContext = useDailyContext(user?.id, maxDateRange.startDate, maxDateRange.endDate);

    // Fetch metabolic weekly scores - invoke edge function to compute & store, then fetch
    const fetchWeeklyScores = useCallback(async () => {
        if (!user?.id) return;
        setScoresLoading(true);
        try {
            // First, invoke the edge function to compute and store the current score
            const result = await invokeMetabolicScore(user.id, '7d');

            // Store the current score directly from edge function for immediate display
            if (result?.score7d !== undefined && result?.score7d !== null) {
                setCurrentScore(result.score7d);
            }

            // Then fetch all stored weekly scores for trend calculation
            const scores = await getMetabolicWeeklyScores(user.id, 12);
            setWeeklyScores(scores);
        } catch (error) {
            console.error('Error fetching metabolic scores:', error);
        } finally {
            setScoresLoading(false);
        }
    }, [user?.id]);

    useFocusEffect(
        useCallback(() => {
            fetchWeeklyScores();
        }, [fetchWeeklyScores])
    );

    const resolvedHomeScore = useMemo(() => {
        if (typeof currentScore === 'number') {
            return clampScore(currentScore);
        }

        const latestStoredScore = weeklyScores.find((entry) => entry.score7d !== null)?.score7d ?? null;
        if (typeof latestStoredScore === 'number') {
            return clampScore(latestStoredScore);
        }

        return null;
    }, [currentScore, weeklyScores]);

    // Pull-to-refresh handler - syncs all data sources
    const onRefresh = useCallback(async () => {
        setIsRefreshing(true);
        try {
            await Promise.all([
                refetchData(),
                dailyContext.sync(),
                refetchSleep(),
                refetchWeight(),
                fetchWeeklyScores(),
            ]);
        } catch (error) {
            console.warn('Error refreshing data:', error);
        } finally {
            setIsRefreshing(false);
        }
    }, [refetchData, dailyContext, refetchSleep, refetchWeight, fetchWeeklyScores]);

    // Determine which tracking mode category the user is in
    const trackingMode = (profile?.tracking_mode || 'meals_wearables') as TrackingMode;
    const showWearableStats = trackingMode === 'meals_wearables' || trackingMode === 'wearables_only';
    // Show glucose UI for all modes since this is a metabolic wellness app
    const showGlucoseUI = true;

    // Stable fallback data for rules-based insights (memoized to prevent re-renders)
    const fallbackData = useMemo((): InsightData => {
        // Calculate Time in Zone %
        let timeInZonePercent = undefined;

        if (glucoseLogs && glucoseLogs.length > 0) {
            const inZoneCount = glucoseLogs.filter(l => l.glucose_level >= targetMin && l.glucose_level <= targetMax).length;
            timeInZonePercent = Math.round((inZoneCount / glucoseLogs.length) * 100);
        }

        return {
            glucoseLogs: glucoseLogs,
            glucoseLogsCount: glucoseLogs?.length ?? 0,
            timeInZonePercent,
            userTargetMin: targetMin,
            userTargetMax: targetMax,
            meals: recentMeals,
            avgSleepHours: sleepData?.avgHoursPerNight,
            avgSteps: dailyContext.avgSteps ?? undefined,
            avgActiveMinutes: dailyContext.avgActiveMinutes ?? undefined,
            avgFibrePerDay: fibreSummary?.avgPerDay,
            mealsWithWalkAfter: recentMeals?.filter(m =>
                m.meal_checkins?.some(c => c.movement_after)
            ).length,
            totalMealsThisWeek: recentMeals?.length,
            checkinsThisWeek: recentMeals?.filter(m =>
                m.meal_checkins && m.meal_checkins.length > 0
            ).length,
            weightLogsCount: weightLogs.length,
        };
    }, [glucoseLogs, recentMeals, sleepData?.avgHoursPerNight, dailyContext.avgSteps, dailyContext.avgActiveMinutes, fibreSummary?.avgPerDay, targetMin, targetMax, weightLogs.length]);

    const {
        insights: personalInsights,
        primaryAction: primaryInsight,
        secondaryActions: secondaryInsights,
        activeActions: behaviorActiveActions,
        nextBestAction,
        dismissInsight,
        loading: insightsLoading
    } = useBehaviorHomeData({
        userId: user?.id,
        trackingMode,
        rangeKey: '7d',
        enabled: !!user?.id,
        fallbackData,
        generationOptions: {
            experienceVariant: isBehaviorV1 ? 'behavior_v1' : 'legacy',
            readinessLevel: profile?.readiness_level ?? undefined,
            comBBarrier: profile?.com_b_barrier ?? undefined,
            showGlucoseAdvanced: profile?.show_glucose_advanced ?? false,
        },
    });


    // Process meal reviews - only show meals once the 1-hour timer has passed.
    const displayMeals = useMemo(() => {
        if (!user?.id) return [];
        const nowMs = Date.now();
        const oneHourAgoMs = nowMs - 60 * 60 * 1000;

        return (recentMeals || []).filter(meal => {
            const mealTimeMs = new Date(meal.logged_at).getTime();
            return Number.isFinite(mealTimeMs) && mealTimeMs <= oneHourAgoMs;
        });
    }, [user?.id, recentMeals]);

    const canShowAdvancedGlucose = useMemo(() => {
        const glucoseModeEnabled =
            trackingMode === 'manual_glucose_optional' || trackingMode === 'glucose_tracking';
        return !!profile?.show_glucose_advanced && (glucoseModeEnabled || glucoseLogs.length > 0);
    }, [profile?.show_glucose_advanced, trackingMode, glucoseLogs.length]);

    const advancedGlucoseSummary = useMemo(() => {
        if (!glucoseLogs.length) {
            return { avg: 'No data', inTarget: 'No data' };
        }

        const avg = glucoseLogs.reduce((sum, log) => sum + log.glucose_level, 0) / glucoseLogs.length;
        const inTarget = glucoseLogs.filter(
            log => log.glucose_level >= targetMin && log.glucose_level <= targetMax
        ).length;

        return {
            avg: `${avg.toFixed(1)} mmol/L`,
            inTarget: `${Math.round((inTarget / glucoseLogs.length) * 100)}%`,
        };
    }, [glucoseLogs, targetMin, targetMax]);

    const primaryBehaviorCard = useMemo(() => {
        // Priority 1: Active user actions (keeps action loop primary)
        if (behaviorActiveActions.length > 0) {
            const firstAction = behaviorActiveActions[0];
            return {
                title: firstAction.title,
                description: firstAction.description,
                ctaLabel: 'Open action loop',
                actionType: firstAction.action_type?.toLowerCase().trim() || 'log_meal',
                onPress: () => router.push({ pathname: '/(tabs)/insights', params: { tab: 'actions' } }),
            };
        }

        // Priority 2: AI-generated Next Best Action
        if (nextBestAction) {
            return {
                title: nextBestAction.title,
                description: nextBestAction.description,
                ctaLabel: nextBestAction.cta?.label || 'Take action',
                actionType: nextBestAction.action_type || 'log_meal',
                onPress: () => {
                    if (nextBestAction.cta?.route) {
                        router.push(nextBestAction.cta.route as any);
                    } else {
                        router.push({ pathname: '/(tabs)/insights', params: { tab: 'actions' } });
                    }
                },
            };
        }

        // Priority 3: Rules-based primary insight
        if (primaryInsight) {
            const cta = primaryInsight.action?.cta ?? primaryInsight.cta;
            const actionType = primaryInsight.action?.actionType || 'log_meal';
            return {
                title: primaryInsight.action?.title || primaryInsight.title,
                description: primaryInsight.recommendation,
                ctaLabel: cta?.label || 'Start action',
                actionType,
                onPress: () => {
                    if (cta?.route) {
                        router.push(cta.route as any);
                    } else {
                        router.push({ pathname: '/(tabs)/insights', params: { tab: 'actions' } });
                    }
                },
            };
        }

        // Priority 4: Generic fallback
        return {
            title: 'Build your first behavior streak',
            description: 'Log one meal or one short walk today to start your momentum.',
            ctaLabel: 'Log a meal',
            actionType: 'log_meal',
            onPress: () => router.push('/meal-scanner'),
        };
    }, [behaviorActiveActions, nextBestAction, primaryInsight]);

    const handleScorePress = useCallback(async () => {
        if (!user?.id || !resolvedHomeScore) return;

        setScoreExplanationVisible(true);
        scoreExplanationSlideAnim.setValue(400);
        Animated.spring(scoreExplanationSlideAnim, {
            toValue: 0,
            useNativeDriver: true,
            tension: 65,
            friction: 11,
        }).start();

        // Show deterministic fallback immediately while AI loads
        // Use evenly distributed component scores as a baseline
        const scoreVal = resolvedHomeScore ?? 50;
        const components = {
            rhr: Math.round(scoreVal * 0.25),
            steps: Math.round(scoreVal * 0.25),
            sleep: Math.round(scoreVal * 0.25),
            hrv: Math.round(scoreVal * 0.25),
        };

        // Deterministic fallback
        const sorted = Object.entries(components).sort((a, b) => b[1] - a[1]);
        const labels: Record<string, string> = { rhr: 'resting heart rate', steps: 'daily steps', sleep: 'sleep consistency', hrv: 'heart rate variability' };
        const highest = sorted[0];
        const lowest = sorted[sorted.length - 1];

        const fallbackExplanation: ScoreExplanation = {
            summary: resolvedHomeScore >= 70 ? 'Your rhythm is strong this week.' : resolvedHomeScore >= 50 ? 'Your rhythm is building steadily.' : 'Your rhythm has room to grow.',
            top_contributor: `${labels[highest[0]].charAt(0).toUpperCase() + labels[highest[0]].slice(1)} is your strongest factor.`,
            biggest_opportunity: `A small improvement in ${labels[lowest[0]]} could make a difference.`,
            one_thing_this_week: 'Keep building on your daily habits this week.',
        };
        setScoreExplanation(fallbackExplanation);

        // Fetch AI explanation
        setScoreExplanationLoading(true);
        try {
            const result = await invokeScoreExplanation(user.id, resolvedHomeScore, components);
            if (result?.explanation) {
                setScoreExplanation(result.explanation);
            }
        } catch (err) {
            console.error('Error fetching score explanation:', err);
        } finally {
            setScoreExplanationLoading(false);
        }
    }, [user?.id, resolvedHomeScore, scoreExplanationSlideAnim]);

    const handleCloseScoreExplanation = useCallback(() => {
        Animated.timing(scoreExplanationSlideAnim, {
            toValue: 400,
            duration: 200,
            useNativeDriver: true,
        }).start(() => {
            setScoreExplanationVisible(false);
            setScoreExplanation(null);
        });
    }, [scoreExplanationSlideAnim]);

    const journeyDay = useMemo(() => {
        const startAt = profile?.framework_reset_completed_at || profile?.created_at;
        if (!startAt) return 1;

        const startDate = new Date(startAt);
        if (Number.isNaN(startDate.getTime())) return 1;

        const elapsedMs = Math.max(0, Date.now() - startDate.getTime());
        return Math.max(1, Math.floor(elapsedMs / (24 * 60 * 60 * 1000)) + 1);
    }, [profile?.framework_reset_completed_at, profile?.created_at]);

    const isEarlyJourney = journeyDay <= 14;
    const scoreUnlocked = journeyDay >= 7;
    const unlockDaysCompleted = Math.min(7, journeyDay);

    const homeScoreTone = useMemo(
        () => getHomeMetabolicTone(scoreUnlocked ? resolvedHomeScore : null, isEarlyJourney),
        [scoreUnlocked, resolvedHomeScore, isEarlyJourney]
    );

    const weeklyBehaviorLogCount = useMemo(() => {
        const { startDate, endDate } = getDateRange('7d');
        const isWithin7d = (value: string) => {
            const ts = new Date(value);
            return ts >= startDate && ts <= endDate;
        };

        const mealLogs = recentMeals.filter((meal) => isWithin7d(meal.logged_at)).length;
        const activityEntries = activityLogs.filter((log) => isWithin7d(log.logged_at)).length;
        const weightEntries = weightLogs.filter((log) => isWithin7d(log.logged_at)).length;

        return mealLogs + activityEntries + weightEntries;
    }, [recentMeals, activityLogs, weightLogs]);

    const avgActivityMinutes = useMemo(() => {
        if (dailyContext.avgActiveMinutes && dailyContext.avgActiveMinutes > 0) {
            return Math.round(dailyContext.avgActiveMinutes);
        }

        if (!activityLogs.length) return null;
        const { startDate, endDate } = getDateRange('7d');
        const recent = activityLogs.filter(log => {
            const ts = new Date(log.logged_at);
            return ts >= startDate && ts <= endDate;
        });
        if (!recent.length) return null;
        const total = recent.reduce((sum, log) => sum + log.duration_minutes, 0);
        return Math.round(total / 7);
    }, [dailyContext.avgActiveMinutes, activityLogs]);

    const behaviorStreakDays = useMemo(() => {
        const daySet = new Set<string>();
        recentMeals.forEach(meal => daySet.add(new Date(meal.logged_at).toISOString().split('T')[0]));
        activityLogs.forEach(log => daySet.add(new Date(log.logged_at).toISOString().split('T')[0]));

        if (daySet.size === 0) return 0;

        let streak = 0;
        const cursor = new Date();
        cursor.setHours(0, 0, 0, 0);

        while (true) {
            const key = cursor.toISOString().split('T')[0];
            if (!daySet.has(key)) break;
            streak += 1;
            cursor.setDate(cursor.getDate() - 1);
        }

        return streak;
    }, [recentMeals, activityLogs]);

    // TODO(behavior_v1): Add telemetry-gated social proof copy when aggregate analytics are available with cohort thresholds.
    const homeEncouragementText = useMemo(() => {
        if (!scoreUnlocked) {
            return 'Complete 7 days to unlock your Metabolic Score.';
        }

        if (isEarlyJourney) {
            if (behaviorStreakDays > 0) {
                return `Day ${journeyDay}: your consistency is building momentum.`;
            }
            return 'Momentum starts with one action today.';
        }

        if (resolvedHomeScore === null) {
            return 'Start with one action today to build your baseline.';
        }

        return 'From sleep, activity, meals, and glucose.';
    }, [scoreUnlocked, isEarlyJourney, behaviorStreakDays, journeyDay, resolvedHomeScore]);

    const heroMomentumChips = useMemo(() => {
        const chips: { label: string; tone: 'neutral' | 'success' }[] = [
            {
                label: `Day ${journeyDay}`,
                tone: 'neutral',
            },
        ];
        if (behaviorStreakDays > 0) {
            chips.push({
                label: `${behaviorStreakDays}d streak`,
                tone: 'success',
            });
        }
        chips.push({
            label: `${weeklyBehaviorLogCount} of ${WEEKLY_LOG_GOAL} logs this week`,
            tone: weeklyBehaviorLogCount >= WEEKLY_LOG_GOAL ? 'success' : 'neutral',
        });
        return chips;
    }, [journeyDay, behaviorStreakDays, weeklyBehaviorLogCount]);

    const sleepMomentumState = useMemo(() => {
        const isSleepAvailable = sleepData?.isAvailable ?? Platform.OS === 'ios';
        const isSleepAuthorized = sleepData?.isAuthorized ?? false;
        const avgSleep = sleepData?.avgHoursPerNight ?? 0;

        if (isSleepAvailable && !isSleepAuthorized) {
            return {
                value: 'Connect sleep',
                subtitle: 'Track automatically with Apple Health',
                state: 'invite' as const,
                cueIcon: 'link-outline' as const,
                cueText: 'Open data sources',
                onPress: () => router.push('/data-sources'),
            };
        }

        if (isSleepAuthorized && avgSleep <= 0) {
            return {
                value: 'No sleep data yet',
                subtitle: 'Sleep with your watch tonight to start tracking',
                state: 'invite' as const,
                cueIcon: 'moon-outline' as const,
                cueText: 'Connect and sync',
                onPress: () => router.push('/data-sources'),
            };
        }

        if (isSleepAuthorized && avgSleep > 0) {
            return {
                value: `${avgSleep.toFixed(1)}h`,
                subtitle: 'Avg hours/night',
                state: 'data' as const,
                cueIcon: undefined,
                cueText: undefined,
                onPress: undefined,
            };
        }

        return {
            value: 'Sleep unavailable',
            subtitle: 'Sleep tracking unavailable on this device',
            state: 'invite' as const,
            cueIcon: 'information-circle-outline' as const,
            cueText: undefined,
            onPress: undefined,
        };
    }, [sleepData?.isAvailable, sleepData?.isAuthorized, sleepData?.avgHoursPerNight]);

    const weightMomentumState = useMemo(() => {
        if (weightLoading) {
            return {
                value: '--',
                subtitle: 'Loading trend...',
                state: 'data' as const,
                compactValue: false,
                cueIcon: undefined,
                cueText: undefined,
            };
        }

        if (latestWeightKg === null) {
            return {
                value: 'Log weight',
                subtitle: 'Add your first weight check-in',
                state: 'invite' as const,
                compactValue: true,
                cueIcon: 'add-circle-outline' as const,
                cueText: 'Add weight',
            };
        }

        return {
            value: `${latestWeightKg.toFixed(1)} kg`,
            subtitle:
                delta7dKg !== null
                    ? `${delta7dKg > 0 ? '+' : ''}${delta7dKg.toFixed(1)} kg vs 7d`
                    : 'Keep logging to build a weekly trend',
            state: 'data' as const,
            compactValue: false,
            cueIcon: undefined,
            cueText: undefined,
        };
    }, [weightLoading, latestWeightKg, delta7dKg]);

    const actionStreakMomentumState = useMemo(() => {
        if (behaviorStreakDays > 0) {
            return {
                value: `${behaviorStreakDays}d`,
                subtitle: 'Days with behavior logs',
                state: 'data' as const,
                compactValue: false,
                cueIcon: undefined,
                cueText: undefined,
            };
        }

        return {
            value: 'Start streak today',
            subtitle: 'Complete one action to begin',
            state: 'invite' as const,
            compactValue: true,
            cueIcon: 'sparkles-outline' as const,
            cueText: 'View daily focus',
        };
    }, [behaviorStreakDays]);

    const handleMealPress = (meal: MealWithCheckin) => {
        router.push({
            pathname: '/meal-checkin',
            params: {
                mealId: meal.id,
                mealName: meal.name,
                ...(meal.photo_path && { photoPath: meal.photo_path }),
            }
        });
    };

    // Get user initials from profile
    const getInitials = () => {
        if (profile?.first_name && profile?.last_name) {
            return `${profile.first_name[0]}${profile.last_name[0]}`.toUpperCase();
        }
        return 'AD';
    };

    // Animation Values
    const scrollY = useRef(new Animated.Value(0)).current;
    const behaviorHeroReveal = useRef(new Animated.Value(0)).current;
    const behaviorMomentumReveal = useRef(new Animated.Value(0)).current;
    const behaviorAdvancedReveal = useRef(new Animated.Value(0)).current;
    const behaviorQueueReveal = useRef(new Animated.Value(0)).current;
    const behaviorEntrancePlayedRef = useRef(false);

    useEffect(() => {
        if (!isBehaviorV1) {
            behaviorEntrancePlayedRef.current = false;
            behaviorHeroReveal.setValue(0);
            behaviorMomentumReveal.setValue(0);
            behaviorAdvancedReveal.setValue(0);
            behaviorQueueReveal.setValue(0);
            return;
        }

        if (behaviorEntrancePlayedRef.current) {
            return;
        }

        behaviorEntrancePlayedRef.current = true;

        const stages = [
            behaviorHeroReveal,
            behaviorMomentumReveal,
            behaviorAdvancedReveal,
            behaviorQueueReveal,
        ].map((value) =>
            Animated.timing(value, {
                toValue: 1,
                duration: 480,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            })
        );

        Animated.stagger(90, stages).start();
    }, [
        isBehaviorV1,
        behaviorHeroReveal,
        behaviorMomentumReveal,
        behaviorAdvancedReveal,
        behaviorQueueReveal,
    ]);

    // Header Content Height (Profile, Title, etc.) - same as styles.header height
    const HEADER_CONTENT_HEIGHT = 72;

    // Animate the entire header container up to hide the top row
    const headerTranslateY = scrollY.interpolate({
        inputRange: [0, HEADER_CONTENT_HEIGHT],
        outputRange: [0, -HEADER_CONTENT_HEIGHT],
        extrapolate: 'clamp'
    });

    // Fade out the top row (Profile, Title) faster than it scrolls
    const headerOpacity = scrollY.interpolate({
        inputRange: [0, HEADER_CONTENT_HEIGHT * 0.6],
        outputRange: [1, 0],
        extrapolate: 'clamp'
    });

    const behaviorHeroParallax = scrollY.interpolate({
        inputRange: [0, 220],
        outputRange: [0, -16],
        extrapolate: 'clamp',
    });

    const behaviorMomentumParallax = scrollY.interpolate({
        inputRange: [0, 300],
        outputRange: [0, -7],
        extrapolate: 'clamp',
    });

    const behaviorQueueParallax = scrollY.interpolate({
        inputRange: [0, 360],
        outputRange: [0, -5],
        extrapolate: 'clamp',
    });

    const behaviorHeroScale = scrollY.interpolate({
        inputRange: [0, 260],
        outputRange: [1, 0.975],
        extrapolate: 'clamp',
    });

    const behaviorHeroTranslateIn = behaviorHeroReveal.interpolate({
        inputRange: [0, 1],
        outputRange: [18, 0],
    });

    const behaviorMomentumTranslateIn = behaviorMomentumReveal.interpolate({
        inputRange: [0, 1],
        outputRange: [16, 0],
    });

    const behaviorAdvancedTranslateIn = behaviorAdvancedReveal.interpolate({
        inputRange: [0, 1],
        outputRange: [14, 0],
    });

    const behaviorQueueTranslateIn = behaviorQueueReveal.interpolate({
        inputRange: [0, 1],
        outputRange: [12, 0],
    });

    // Header height calculation:
    // Status Bar Spacer: insets.top
    // Header Content: 72
    // Picker: 44 (legacy only)
    const HEADER_HEIGHT = insets.top + 72 + (isBehaviorV1 ? 0 : 44);

    return (
        <View style={styles.container}>
            <ForestGlassBackground blurIntensity={12} />

                {/* Fixed Header - Animated to slide up */}
                <Animated.View
                    style={[
                        styles.headerContainer,
                        {
                            paddingTop: insets.top,
                            transform: [{ translateY: headerTranslateY }]
                        }
                    ]}
                    pointerEvents="box-none"
                >
                    {/* Header Content - Fades out */}
                    <Animated.View style={[styles.header, { opacity: headerOpacity }]}>
                        <LiquidGlassIconButton size={44} onPress={() => router.push('/settings')}>
                            <Text style={styles.avatarText}>{getInitials()}</Text>
                        </LiquidGlassIconButton>
                        <Text style={styles.headerTitle}>GLUCO</Text>
                        <LiquidGlassIconButton size={44} onPress={() => router.push('/notifications-list')}>
                            <Ionicons name="notifications-outline" size={22} color="#E7E8E9" />
                        </LiquidGlassIconButton>
                    </Animated.View>

                    {!isBehaviorV1 && (
                        <View style={styles.pickerContainer}>
                            <SegmentedControl<RangeKey>
                                value={range}
                                onChange={handleRangeChange}
                                options={[
                                    { value: '7d', label: '7d' },
                                    { value: '14d', label: '14d' },
                                    { value: '30d', label: '30d' },
                                    { value: '90d', label: '90d' },
                                ]}
                            />
                        </View>
                    )}
                </Animated.View>

                {/* ScrollView - content flows normally */}
                <Animated.ScrollView
                    ref={scrollViewRef}
                    style={styles.scrollView}
                    contentContainerStyle={[styles.scrollContent, { paddingTop: HEADER_HEIGHT + 24 }]}
                    showsVerticalScrollIndicator={false}
                    onScroll={Animated.event(
                        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                        { useNativeDriver: true }
                    )}
                    scrollEventThrottle={16}
                    refreshControl={
                        <RefreshControl
                            refreshing={isRefreshing}
                            onRefresh={onRefresh}
                            tintColor={Colors.textSecondary}
                        />
                    }
                >
                    {isBehaviorV1 ? (
                        <>
                            <Animated.View
                                style={[
                                    styles.behaviorHeroStack,
                                    {
                                        opacity: behaviorHeroReveal,
                                        transform: [
                                            { translateY: behaviorHeroTranslateIn },
                                            { translateY: behaviorHeroParallax },
                                            { scale: behaviorHeroScale },
                                        ],
                                    },
                                ]}
                            >
                                <BehaviorMetabolicHeroCard
                                    score={resolvedHomeScore}
                                    scoreLoading={scoresLoading}
                                    scoreUnlocked={scoreUnlocked}
                                    unlockDaysCompleted={unlockDaysCompleted}
                                    unlockDaysTarget={7}
                                    scoreTone={homeScoreTone}
                                    encouragementText={homeEncouragementText}
                                    momentumChips={heroMomentumChips}
                                    onPressScore={scoreUnlocked && resolvedHomeScore ? handleScorePress : () => router.push({ pathname: '/(tabs)/insights', params: { tab: 'actions' } })}
                                />
                                <BehaviorNextActionCard
                                    actionTitle={primaryBehaviorCard.title}
                                    actionDescription={primaryBehaviorCard.description}
                                    ctaLabel={primaryBehaviorCard.ctaLabel}
                                    onPressAction={primaryBehaviorCard.onPress}
                                    onPressMoreSteps={() => router.push({ pathname: '/(tabs)/insights', params: { tab: 'actions' } })}
                                />
                            </Animated.View>

                            <Animated.View
                                style={{
                                    opacity: behaviorMomentumReveal,
                                    transform: [
                                        { translateY: behaviorMomentumTranslateIn },
                                        { translateY: behaviorMomentumParallax },
                                    ],
                                }}
                            >
                                <View style={styles.behaviorMomentumGrid}>
                                    <View style={[styles.behaviorMomentumRow, styles.behaviorMomentumRowPrimary]}>
                                        <BehaviorMomentumCard
                                            label="Activity"
                                            value={avgActivityMinutes !== null ? `${avgActivityMinutes}m` : '--'}
                                            subtitle="Avg active minutes/day"
                                            state="data"
                                            priority="high"
                                            onPress={() => router.push('/log-activity')}
                                        />
                                        <BehaviorMomentumCard
                                            label="Sleep"
                                            value={sleepMomentumState.value}
                                            subtitle={sleepMomentumState.subtitle}
                                            state={sleepMomentumState.state}
                                            priority="high"
                                            compactValue={sleepMomentumState.state === 'invite'}
                                            cueIcon={sleepMomentumState.cueIcon}
                                            cueText={sleepMomentumState.cueText}
                                            onPress={sleepMomentumState.onPress}
                                        />
                                    </View>
                                    <View style={[styles.behaviorMomentumRow, styles.behaviorMomentumRowSecondary]}>
                                        <BehaviorMomentumCard
                                            label="Weight"
                                            value={weightMomentumState.value}
                                            subtitle={weightMomentumState.subtitle}
                                            state={weightMomentumState.state}
                                            priority="low"
                                            compactValue={weightMomentumState.compactValue}
                                            cueIcon={weightMomentumState.cueIcon}
                                            cueText={weightMomentumState.cueText}
                                            onPress={() => router.push('/log-weight' as any)}
                                        />
                                        <BehaviorMomentumCard
                                            label="Action Streak"
                                            value={actionStreakMomentumState.value}
                                            subtitle={actionStreakMomentumState.subtitle}
                                            state={actionStreakMomentumState.state}
                                            priority="low"
                                            compactValue={actionStreakMomentumState.compactValue}
                                            cueIcon={actionStreakMomentumState.cueIcon}
                                            cueText={actionStreakMomentumState.cueText}
                                            onPress={() => router.push({ pathname: '/(tabs)/insights', params: { tab: 'actions' } })}
                                        />
                                    </View>
                                </View>
                            </Animated.View>

                            {canShowAdvancedGlucose && (
                                <Animated.View
                                    style={{
                                        opacity: behaviorAdvancedReveal,
                                        transform: [{ translateY: behaviorAdvancedTranslateIn }],
                                    }}
                                >
                                    <BehaviorAdvancedGlucoseCard
                                        expanded={advancedGlucoseExpanded}
                                        onToggle={() => setAdvancedGlucoseExpanded(prev => !prev)}
                                        avgGlucose={advancedGlucoseSummary.avg}
                                        timeInZone={advancedGlucoseSummary.inTarget}
                                    />
                                </Animated.View>
                            )}

                            <Animated.View
                                style={{
                                    opacity: behaviorQueueReveal,
                                    transform: [
                                        { translateY: behaviorQueueTranslateIn },
                                        { translateY: behaviorQueueParallax },
                                    ],
                                }}
                            >
                                <View style={styles.mealSection}>
                                    <Text style={styles.mealSectionTitle}>CHECK-IN QUEUE</Text>
                                    <ScrollView
                                        horizontal
                                        showsHorizontalScrollIndicator={false}
                                        contentContainerStyle={styles.mealCardsContainer}
                                    >
                                        {displayMeals.length > 0 ? (
                                            displayMeals.map((meal) => (
                                                <MealCheckinCard
                                                    key={meal.id}
                                                    meal={meal}
                                                    onPress={() => handleMealPress(meal)}
                                                />
                                            ))
                                        ) : (
                                            <View style={styles.noMealsCard}>
                                                <Image source={Images.mascots.cook} style={{ width: 60, height: 60, resizeMode: 'contain', marginBottom: 8 }} />
                                                <Text style={styles.noMealsText}>No pending check-ins</Text>
                                                <Text style={styles.noMealsSubtext}>Log one meal to keep momentum today</Text>
                                            </View>
                                        )}
                                    </ScrollView>
                                </View>
                            </Animated.View>
                        </>
                    ) : (
                        <>
                            {/* Glucose Trends - legacy experience */}
                            {showGlucoseUI && (
                                <View style={styles.trendsSection}>
                                    <GlucoseTrendsCard range={range} allLogs={glucoseLogs} isLoading={isLoading} glucoseUnit={glucoseUnit} />
                                </View>
                            )}

                            {/* Active Experiment Widget */}
                            <ActiveExperimentWidget />

                            {/* Metabolic Score Card - Full width prominent card */}
                            <MetabolicScoreCard weeklyScores={weeklyScores} currentScore={currentScore} isLoading={scoresLoading} />

                            {/* Stats Grid */}
                            <View style={styles.statsGrid}>
                                <View style={styles.statsRow}>
                                    {showWearableStats ? (
                                        <>
                                            <StepsStatCard
                                                avgSteps={dailyContext.avgSteps}
                                                isAuthorized={dailyContext.isAuthorized}
                                                isAvailable={dailyContext.isAvailable}
                                                range={range}
                                            />
                                            <ActivityStatCard
                                                range={range}
                                                activityLogs={activityLogs}
                                                healthKitMinutes={dailyContext.avgActiveMinutes}
                                                isHealthKitAuthorized={dailyContext.isAuthorized}
                                                isHealthKitAvailable={dailyContext.isAvailable}
                                            />
                                        </>
                                    ) : showGlucoseUI ? (
                                        <>
                                            <DaysInRangeCard range={range} glucoseLogs={glucoseLogs} />
                                            <FibreStatCard range={range} fibreSummary={fibreSummary} />
                                        </>
                                    ) : (
                                        <>
                                            <FibreStatCard range={range} fibreSummary={fibreSummary} />
                                            <ActivityStatCard
                                                range={range}
                                                activityLogs={activityLogs}
                                                healthKitMinutes={dailyContext.avgActiveMinutes}
                                                isHealthKitAuthorized={dailyContext.isAuthorized}
                                                isHealthKitAvailable={dailyContext.isAvailable}
                                            />
                                        </>
                                    )}
                                </View>
                                <View style={styles.statsRow}>
                                    {showWearableStats ? (
                                        <>
                                            <SleepStatCard range={range} sleepData={sleepData} />
                                            <FibreStatCard range={range} fibreSummary={fibreSummary} />
                                        </>
                                    ) : showGlucoseUI ? (
                                        <>
                                            <ActivityStatCard
                                                range={range}
                                                activityLogs={activityLogs}
                                                healthKitMinutes={dailyContext.avgActiveMinutes}
                                                isHealthKitAuthorized={dailyContext.isAuthorized}
                                                isHealthKitAvailable={dailyContext.isAvailable}
                                            />
                                            <SleepStatCard range={range} sleepData={sleepData} />
                                        </>
                                    ) : (
                                        <>
                                            <SleepStatCard range={range} sleepData={sleepData} />
                                            <StatCard
                                                icon={<Image source={Images.mascots.cook} style={{ width: 32, height: 32, resizeMode: 'contain' }} />}
                                                iconColor="#4CAF50"
                                                title="Meals"
                                                value="--"
                                                description="Logged this week"
                                            />
                                        </>
                                    )}
                                </View>
                            </View>

                            {/* Connect Apple Health CTA - show for wearables mode if not authorized */}
                            {showWearableStats && !dailyContext.isAuthorized && dailyContext.isAvailable && (
                                <ConnectHealthCTA
                                    onConnected={() => {
                                        dailyContext.sync();
                                        refetchSleep();
                                    }}
                                />
                            )}

                            {/* Personal Insights - Best Next Step Card */}
                            <PersonalInsightsCarousel
                                insights={personalInsights}
                                primaryInsight={primaryInsight}
                                secondaryInsights={secondaryInsights}
                                onDismiss={dismissInsight}
                                isLoading={insightsLoading}
                                onMealPress={() => setSpikeSheetVisible(true)}
                                onExercisePress={() => setExerciseSheetVisible(true)}
                            />

                            {/* Today's Meals Section */}
                            <View style={styles.mealSection}>
                                <Text style={styles.mealSectionTitle}>MEAL CHECK-INS</Text>
                                <ScrollView
                                    horizontal
                                    showsHorizontalScrollIndicator={false}
                                    contentContainerStyle={styles.mealCardsContainer}
                                >
                                    {displayMeals.length > 0 ? (
                                        displayMeals.map((meal) => (
                                            <MealCheckinCard
                                                key={meal.id}
                                                meal={meal}
                                                onPress={() => handleMealPress(meal)}
                                            />
                                        ))
                                    ) : (
                                        <View style={styles.noMealsCard}>
                                            <Image source={Images.mascots.cook} style={{ width: 60, height: 60, resizeMode: 'contain', marginBottom: 8 }} />
                                            <Text style={styles.noMealsText}>No meal reviews yet</Text>
                                            <Text style={styles.noMealsSubtext}>Log a meal to see your glucose response</Text>
                                        </View>
                                    )}
                                </ScrollView>
                            </View>
                        </>
                    )}
                </Animated.ScrollView>



                {/* Sync Banner - shows below header when syncing */}
                <SyncBanner
                    isSyncing={dailyContext.isSyncing || isLoading || isRefreshing}
                    topOffset={HEADER_HEIGHT}
                />

                {/* Meal Response Input Sheet */}
                <MealReflectionSheet
                    visible={spikeSheetVisible}
                    onClose={() => setSpikeSheetVisible(false)}
                    onAnalyze={(text) => {
                        setSpikeSheetVisible(false);
                        router.push({ pathname: '/meal-response-check', params: { initialText: text } } as any);
                    }}
                />

                {/* Exercise Input Sheet */}
                <ExerciseInputSheet
                    visible={exerciseSheetVisible}
                    onClose={() => setExerciseSheetVisible(false)}
                    onAnalyze={(text) => {
                        setExerciseSheetVisible(false);
                        // Navigate to exercise impact analysis screen
                        router.push({ pathname: '/check-exercise-impact', params: { initialText: text } } as any);
                    }}
                />

                {/* Score Explanation Bottom Sheet */}
                <Modal
                    visible={scoreExplanationVisible}
                    transparent
                    animationType="fade"
                    onRequestClose={handleCloseScoreExplanation}
                >
                    <Pressable style={scoreExpStyles.overlay} onPress={handleCloseScoreExplanation}>
                        <Animated.View
                            style={[
                                scoreExpStyles.sheet,
                                { transform: [{ translateY: scoreExplanationSlideAnim }] }
                            ]}
                        >
                            <Pressable onPress={() => { }}>
                                <View style={scoreExpStyles.handle} />
                                <View style={scoreExpStyles.header}>
                                    <View style={scoreExpStyles.scoreRingWrap}>
                                        <MetabolicScoreRing
                                            score={resolvedHomeScore ?? 0}
                                            size={72}
                                            scoreColor={getMetabolicScoreColor(resolvedHomeScore ?? 0)}
                                        />
                                    </View>
                                    <View style={scoreExpStyles.headerText}>
                                        <Text style={scoreExpStyles.title}>Your Metabolic Score</Text>
                                        <Text style={scoreExpStyles.scoreValue}>{resolvedHomeScore ?? '--'}/100</Text>
                                    </View>
                                </View>
                                {scoreExplanation && (
                                    <View style={scoreExpStyles.content}>
                                        <Text style={scoreExpStyles.summary}>{scoreExplanation.summary}</Text>
                                        <View style={scoreExpStyles.row}>
                                            <Ionicons name="star" size={16} color={behaviorV1Theme.sageBright} />
                                            <Text style={scoreExpStyles.rowText}>{scoreExplanation.top_contributor}</Text>
                                        </View>
                                        <View style={scoreExpStyles.row}>
                                            <Ionicons name="arrow-up-circle-outline" size={16} color={Colors.warning} />
                                            <Text style={scoreExpStyles.rowText}>{scoreExplanation.biggest_opportunity}</Text>
                                        </View>
                                        <View style={scoreExpStyles.actionRow}>
                                            <Ionicons name="bulb-outline" size={16} color={behaviorV1Theme.sageMid} />
                                            <Text style={scoreExpStyles.actionText}>{scoreExplanation.one_thing_this_week}</Text>
                                        </View>
                                        {scoreExplanationLoading && (
                                            <Text style={scoreExpStyles.loadingHint}>Personalizing...</Text>
                                        )}
                                    </View>
                                )}
                            </Pressable>
                        </Animated.View>
                    </Pressable>
                </Modal>
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
    headerContainer: {
        // backgroundColor removed to allow gradient
        zIndex: 10,
        position: 'absolute', // Fixed at top
        top: 0,
        left: 0,
        right: 0,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        height: 72, // Match notifications header height
    },
    pickerContainer: {
        marginHorizontal: 16,
        marginBottom: 12, // Reduced from 24
    },

    avatarButton: {
        width: 48,
        height: 48,
        borderRadius: 33,
        backgroundColor: 'rgba(63, 66, 67, 0.3)',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.25,
        shadowRadius: 2,
    },
    avatarText: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: Colors.textPrimary,
    },
    headerTitle: {
        fontFamily: fonts.bold,
        fontSize: 18,
        color: Colors.textPrimary,
        letterSpacing: 1,
    },
    notificationButton: {
        width: 48,
        height: 48,
        borderRadius: 33,
        backgroundColor: 'rgba(63, 66, 67, 0.3)',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.25,
        shadowRadius: 2,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 16,
        // Make sure last content can scroll above floating tab bar
        paddingBottom: Platform.OS === 'ios' ? 170 : 150,
    },
    behaviorHeroStack: {
        marginBottom: HERO_STACK_BOTTOM_GAP,
    },
    behaviorPrimaryCard: {
        borderRadius: 20,
        padding: 18,
        marginBottom: CARD_SPACING,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: behaviorV1Theme.borderSoft, // Use new refined border
        shadowColor: '#0A1610',
        shadowOffset: { width: 0, height: 14 },
        shadowOpacity: 0.42,
        shadowRadius: 26,
        elevation: 14,
    },
    behaviorNextActionCard: {
        borderRadius: 16,
        padding: 16,
        paddingLeft: 18,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: behaviorV1Theme.borderSoft,
        shadowColor: '#0A1610',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.10,
        shadowRadius: 6,
        elevation: 2,
    },

    behaviorPrimarySheen: {
        ...StyleSheet.absoluteFillObject,
    },
    behaviorScoreAccentBar: {
        position: 'absolute',
        left: 0,
        top: 10,
        bottom: 10,
        width: 3,
        borderRadius: 2,
        backgroundColor: behaviorV1Theme.accentGlow,
    },
    behaviorPrimaryTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    behaviorLabel: {
        fontFamily: fonts.bold,
        fontSize: 11,
        letterSpacing: 1,
        color: behaviorV1Theme.textSecondary,
    },
    behaviorScoreRow: {
        marginTop: 2,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 4,
    },
    behaviorScoreRingWrap: {
        width: 116,
        height: 116,
        borderRadius: 58,
        borderWidth: 1,
        borderColor: 'rgba(168, 197, 160, 0.42)',
        backgroundColor: 'rgba(255,255,255,0.07)',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.22,
        shadowRadius: 12,
        elevation: 6,
    },
    behaviorScoreRingMascot: {
        position: 'absolute',
        width: 40,
        height: 40,
        resizeMode: 'contain',
    },
    behaviorScoreContent: {
        flex: 1,
        justifyContent: 'center',
    },
    behaviorScoreValueRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
    },
    behaviorScoreValue: {
        fontFamily: fonts.semiBold,
        fontSize: 38,
        color: behaviorV1Theme.textPrimary,
        lineHeight: 42,
    },
    behaviorScoreValueMax: {
        fontFamily: fonts.regular,
        fontSize: 16,
        color: behaviorV1Theme.textSecondary,
        marginLeft: 4,
    },
    behaviorScoreUnlockTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 22,
        lineHeight: 28,
        color: behaviorV1Theme.textPrimary,
    },
    behaviorUnlockProgressPill: {
        marginTop: 4,
        alignSelf: 'flex-start',
        borderRadius: 999,
        borderWidth: 1,
        borderColor: behaviorV1Theme.borderSoft,
        backgroundColor: 'rgba(168, 197, 160, 0.14)',
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    behaviorUnlockProgressText: {
        fontFamily: fonts.medium,
        fontSize: 11,
        color: behaviorV1Theme.sageBright,
    },
    behaviorScorePill: {
        marginTop: 2,
        alignSelf: 'flex-start',
        borderRadius: 10,
        paddingHorizontal: 8,
        paddingVertical: 3,
    },
    behaviorScorePillText: {
        fontFamily: fonts.medium,
        fontSize: 11,
    },
    behaviorScoreMeta: {
        marginTop: 4,
        fontFamily: fonts.regular,
        fontSize: 12,
        color: behaviorV1Theme.textSecondary,
        lineHeight: 18,
    },
    behaviorMomentumChipsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 10,
    },
    behaviorMomentumChip: {
        borderRadius: 999,
        borderWidth: 1,
        paddingHorizontal: 10,
        paddingVertical: 5,
    },
    behaviorMomentumChipNeutral: {
        borderColor: 'rgba(168, 197, 160, 0.26)',
        backgroundColor: 'rgba(139, 168, 136, 0.14)',
    },
    behaviorMomentumChipSuccess: {
        borderColor: 'rgba(168, 197, 160, 0.42)',
        backgroundColor: 'rgba(168, 197, 160, 0.2)',
    },
    behaviorMomentumChipText: {
        fontFamily: fonts.medium,
        fontSize: 11,
    },
    behaviorMomentumChipTextNeutral: {
        color: behaviorV1Theme.textSecondary,
    },
    behaviorMomentumChipTextSuccess: {
        color: behaviorV1Theme.textPrimary,
    },
    behaviorActionStripLabel: {
        fontFamily: fonts.bold,
        fontSize: 10,
        letterSpacing: 0.9,
        color: behaviorV1Theme.sageBright,
        marginBottom: 3,
    },
    behaviorActionStripTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 15,
        lineHeight: 20,
        color: behaviorV1Theme.textPrimary,
        marginBottom: 3,
    },
    behaviorActionStripDescription: {
        fontFamily: fonts.regular,
        fontSize: 12,
        lineHeight: 17,
        color: behaviorV1Theme.textSecondary,
    },
    behaviorPrimaryCta: {
        marginTop: 12,
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        backgroundColor: behaviorV1Theme.ctaPrimary,
        // Removed glow/shadow properties
        borderWidth: 0, // Removing border as well for a cleaner flat look or keep it strictly defining the shape without glow
    },
    behaviorPrimaryCtaText: {
        fontFamily: fonts.semiBold,
        fontSize: 13,
        color: behaviorV1Theme.ctaPrimaryText,
    },
    behaviorPrimaryLink: {
        marginTop: 10,
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: 'rgba(168, 197, 160, 0.22)',
        backgroundColor: 'rgba(168, 197, 160, 0.08)',
    },
    behaviorPrimaryLinkText: {
        fontFamily: fonts.medium,
        fontSize: 12,
        color: behaviorV1Theme.sageBright,
    },
    behaviorMomentumGrid: {
        gap: 10,
        marginBottom: 14,
    },
    behaviorMomentumRow: {
        flexDirection: 'row',
        gap: 10,
    },
    behaviorMomentumRowPrimary: {
        alignItems: 'stretch',
    },
    behaviorMomentumRowSecondary: {
        alignItems: 'stretch',
    },
    behaviorMomentumCard: {
        flex: 1,
        borderRadius: 14,
        backgroundColor: behaviorV1Theme.surfaceRecessed,
        borderWidth: 1,
        borderColor: 'rgba(168, 197, 160, 0.14)',
        padding: 12,
        overflow: 'hidden',
        shadowColor: '#15251e',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.12,
        shadowRadius: 6,
        elevation: 3,
    },
    behaviorMomentumCardHigh: {
        minHeight: 114,
        borderColor: 'rgba(168, 197, 160, 0.14)',
        backgroundColor: 'rgba(14, 24, 20, 0.46)',
    },
    behaviorMomentumCardLow: {
        minHeight: 92,
        borderColor: 'rgba(168, 197, 160, 0.10)',
        backgroundColor: 'rgba(10, 18, 14, 0.36)',
    },
    behaviorMomentumCardInvite: {
        backgroundColor: 'rgba(8, 14, 11, 0.32)',
        borderStyle: 'dashed',
        borderColor: 'rgba(168, 197, 160, 0.10)',
    },
    behaviorMomentumCardInviteHigh: {
        backgroundColor: 'rgba(12, 22, 18, 0.38)',
        borderColor: 'rgba(168, 197, 160, 0.14)',
    },
    behaviorMomentumLabel: {
        fontFamily: fonts.medium,
        fontSize: 11,
        color: behaviorV1Theme.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
    },
    behaviorMomentumLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    behaviorMomentumLabelInvite: {
        opacity: 0.65,
    },
    behaviorMomentumValue: {
        marginTop: 6,
        fontFamily: fonts.semiBold,
        color: behaviorV1Theme.textPrimary,
    },
    behaviorMomentumValueHigh: {
        fontSize: 23,
        lineHeight: 28,
    },
    behaviorMomentumValueLow: {
        fontSize: 18,
        lineHeight: 22,
    },
    behaviorMomentumValueText: {
        fontSize: 16,
        lineHeight: 21,
        color: behaviorV1Theme.textPrimary,
    },
    behaviorMomentumValueInvite: {
        color: behaviorV1Theme.sageSoft,
        fontSize: 14,
        lineHeight: 19,
    },
    behaviorMomentumSubtitle: {
        marginTop: 4,
        fontFamily: fonts.regular,
        fontSize: 12,
        color: behaviorV1Theme.textSecondary,
        lineHeight: 16,
    },
    behaviorMomentumSubtitleHigh: {
        fontSize: 12,
        lineHeight: 16,
    },
    behaviorMomentumSubtitleLow: {
        fontSize: 11,
        lineHeight: 15,
    },
    behaviorMomentumInviteRow: {
        marginTop: 6,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    behaviorMomentumInviteText: {
        fontFamily: fonts.medium,
        fontSize: 11,
        color: behaviorV1Theme.sageBright,
    },
    behaviorAdvancedCard: {
        borderRadius: 14,
        backgroundColor: 'rgba(20, 35, 31, 0.5)',
        borderWidth: 1,
        borderColor: 'rgba(216, 238, 225, 0.18)',
        marginBottom: 14,
        overflow: 'hidden',
    },
    behaviorAdvancedHeader: {
        paddingVertical: 12,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    behaviorAdvancedHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    behaviorAdvancedTitle: {
        fontFamily: fonts.medium,
        fontSize: 13,
        color: '#D6D6D6',
    },
    behaviorAdvancedBody: {
        paddingHorizontal: 14,
        paddingBottom: 14,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.08)',
        gap: 8,
    },
    behaviorAdvancedMetric: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    behaviorAdvancedMetricLabel: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: '#A8A8A8',
    },
    behaviorAdvancedMetricValue: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: '#FFFFFF',
    },
    behaviorAdvancedCta: {
        marginTop: 2,
        borderRadius: 10,
        backgroundColor: '#2B2F34',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 38,
    },
    behaviorAdvancedCtaText: {
        fontFamily: fonts.medium,
        fontSize: 13,
        color: '#FFFFFF',
    },
    trendsSection: {
        marginTop: 0,
        marginBottom: 16,
    },
    stickyPickerContainer: {
        backgroundColor: 'transparent',
        paddingHorizontal: 16,
        paddingTop: 4,
        paddingBottom: 0,
    },
    trendsCard: {
        // backgroundColor: '#22282C', // Uses gradient now
        borderRadius: 24,
        paddingHorizontal: 16,
        paddingTop: 20,
        paddingBottom: 24,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: behaviorV1Theme.borderSoft,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 18,
        elevation: 8,
    },
    trendsHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 12,
        marginBottom: 12,
    },
    trendsHeaderLeft: {
        flex: 1,
    },
    avgRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 8,
    },
    avgValue: {
        fontFamily: fonts.medium,
        fontSize: 44,
        color: Colors.textPrimary,
        lineHeight: 44 * 0.95,
    },
    avgUnit: {
        fontFamily: fonts.regular,
        fontSize: 16,
        color: Colors.textPrimary,
        opacity: 0.9,
    },
    avgSubtitle: {
        marginTop: 6,
        fontFamily: fonts.regular,
        fontSize: 13,
        color: Colors.textTertiary,
    },
    statusPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    statusText: {
        fontFamily: fonts.bold,
        fontSize: 12,
    },
    segmented: {
        marginTop: 4,
        marginBottom: 12,
    },
    chartBlock: {
        marginTop: 4,
    },
    // Metabolic Score Card styles - matches stat card styling
    metabolicScoreCard: {
        backgroundColor: Colors.backgroundCardGlass,
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.25,
        shadowRadius: 2,
        borderWidth: 1,
        borderColor: behaviorV1Theme.borderSoft,
    },
    metabolicScoreCardEmpty: {
        backgroundColor: Colors.backgroundCardGlass,
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.25,
        shadowRadius: 2,
        borderWidth: 1,
        borderColor: behaviorV1Theme.borderSoft,
    },
    metabolicScoreEmptyLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    metabolicScoreEmptyContent: {
        flex: 1,
    },
    metabolicScoreEmptyTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 20,
        color: '#E7E8E9',
    },
    metabolicScoreEmptySubtitle: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: Colors.textTertiary,
        marginTop: 2,
    },
    metabolicScoreHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    metabolicScoreHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    metabolicScoreTitle: {
        fontFamily: fonts.bold,
        fontSize: 12,
        color: Colors.textTertiary,
        letterSpacing: 0.5,
    },
    metabolicTrendContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    metabolicTrendText: {
        fontFamily: fonts.medium,
        fontSize: 12,
    },
    metabolicScoreContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    metabolicScoreValueRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
    },
    metabolicScoreValue: {
        fontFamily: fonts.medium,
        fontSize: 32,
        color: '#FFFFFF',
        lineHeight: 36,
    },
    metabolicScoreMax: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: Colors.textTertiary,
        marginLeft: 2,
    },
    metabolicScoreLabelPill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 10,
    },
    metabolicScoreLabelDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        marginRight: 5,
    },
    metabolicScoreLabelText: {
        fontFamily: fonts.medium,
        fontSize: 11,
    },
    metabolicProgressBar: {
        height: 4,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 2,
        marginBottom: 10,
        overflow: 'hidden',
    },
    metabolicProgressFill: {
        height: '100%',
        borderRadius: 2,
    },
    metabolicScoreDescription: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: Colors.textTertiary,
    },
    statsGrid: {
        gap: 16,
        marginBottom: 24,
    },
    statsRow: {
        flexDirection: 'row',
        gap: 16,
    },
    statCard: {
        flex: 1,
        backgroundColor: 'rgba(26, 26, 28, 0.85)',
        borderRadius: 16,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.25,
        shadowRadius: 2,
    },
    statHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        height: 40,
        marginBottom: 16,
    },
    statTitle: {
        fontFamily: fonts.bold,
        fontSize: 14,
        textTransform: 'uppercase',
    },
    statValueContainer: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 2,
        marginBottom: 8,
    },
    statValue: {
        fontFamily: fonts.medium,
        fontSize: 28,
        color: Colors.textPrimary,
        lineHeight: 28 * 1.15,
    },
    statUnit: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: '#E7E8E9',
    },
    statDescription: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: Colors.textPrimary,
    },
    statMeta: {
        fontFamily: fonts.regular,
        fontSize: 11,
        color: Colors.textTertiary,
        marginBottom: 6,
    },
    broccoliIcon: {
        fontSize: 28,
    },
    cardStatusPill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 10,
        marginTop: 4,
        alignSelf: 'flex-start',
    },
    cardStatusDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        marginRight: 5,
    },
    cardStatusText: {
        fontFamily: fonts.medium,
        fontSize: 11,
    },


    pageIndicator: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 24,
    },
    indicatorDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: Colors.textTertiary,
    },
    indicatorDotActive: {
        backgroundColor: Colors.textPrimary,
    },
    mealSection: {
        marginBottom: 24,
    },
    mealSectionTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 18,
        color: '#E7E8E9',
        marginBottom: 16,
    },
    mealCardsScroll: {
        marginTop: 16,
    },
    mealCardsContainer: {
        gap: 12,
    },
    mealCard: {
        width: SCREEN_WIDTH - 72,
        backgroundColor: '#22282C',
        borderRadius: 16,
        padding: 16,
        gap: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    mealHeader: {
        flexDirection: 'row',
        gap: 8,
    },
    mealIconContainer: {
        width: 36,
        height: 36,
        borderRadius: 8,
        backgroundColor: '#3A4246',
        justifyContent: 'center',
        alignItems: 'center',
    },
    mealInfo: {
        flex: 1,
        gap: 4,
    },
    mealMetaRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    mealType: {
        fontFamily: fonts.medium,
        fontSize: 12,
        color: Colors.textTertiary,
    },
    mealTime: {
        fontFamily: fonts.medium,
        fontSize: 12,
        color: Colors.textTertiary,
    },
    mealName: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: Colors.textPrimary,
    },
    chartContainer: {
        height: 180,
    },
    chartPlaceholder: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.2)',
        borderRadius: 8,
        padding: 12,
    },
    chartLabel: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: '#E7E8E9',
        marginBottom: 8,
    },
    chartArea: {
        flex: 1,
        justifyContent: 'space-between',
    },
    chartLine: {
        flex: 1,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    chartLegend: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 16,
        marginTop: 8,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    legendDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    legendText: {
        fontFamily: fonts.medium,
        fontSize: 12,
        color: '#E7E8E9',
    },
    mealStatus: {
        gap: 8,
    },
    statusBadge: {
        alignSelf: 'flex-start',
        backgroundColor: Colors.successLight,
        borderWidth: 0.25,
        borderColor: Colors.success,
        borderRadius: 28,
        paddingHorizontal: 12,
        paddingVertical: 4,
    },
    statusBadgeText: {
        fontFamily: fonts.bold,
        fontSize: 12,
        color: Colors.success,
    },
    statusDescription: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: Colors.textPrimary,
    },
    chartLoading: {
        height: 200,
        justifyContent: 'center',
        alignItems: 'center',
    },
    chartEmpty: {
        height: 200,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
    },
    chartEmptyText: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: Colors.textPrimary,
        marginTop: 8,
    },
    chartEmptySubtext: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: Colors.textTertiary,
        textAlign: 'center',
    },
    deltaText: {
        fontFamily: fonts.regular,
        fontSize: 12,
        marginTop: 4,
    },
    // Mini chart styles for meal card
    miniChartContainer: {
        marginVertical: 8,
    },
    miniChartEmpty: {
        height: MINI_CHART_HEIGHT,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(63, 66, 67, 0.2)',
        borderRadius: 8,
    },
    miniChartEmptyText: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: '#878787',
    },
    miniChartLegend: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    miniChartYLabel: {
        fontFamily: fonts.regular,
        fontSize: 10,
        color: '#878787',
    },
    miniChartLegendItems: {
        flexDirection: 'row',
        gap: 12,
    },
    miniChartLegendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    // No meals placeholder card
    noMealsCard: {
        width: '100%',
        backgroundColor: 'rgba(20, 35, 31, 0.52)',
        borderRadius: 16,
        paddingVertical: 48,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
        borderWidth: 1,
        borderColor: 'rgba(216, 238, 225, 0.2)',
    },
    noMealsText: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: '#E7E8E9',
        marginTop: 8,
    },
    noMealsSubtext: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: Colors.textTertiary,
        textAlign: 'center',
        paddingHorizontal: 32,
    },
    // Wearables-only mode styles

    connectHealthCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.glucoseLight,
        borderRadius: 12,
        padding: 16,
        marginHorizontal: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: Colors.glucoseMedium,
    },
    connectHealthContent: {
        flex: 1,
        marginLeft: 12,
    },
    connectHealthTitle: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: Colors.textPrimary,
    },
    connectHealthSubtitle: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: Colors.textTertiary,
        marginTop: 2,
    },

});

const scoreExpStyles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: '#0E1C16',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 24,
        paddingBottom: 40,
        paddingTop: 12,
        borderTopWidth: 1,
        borderColor: behaviorV1Theme.borderSoft,
    },
    handle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignSelf: 'center',
        marginBottom: 20,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        marginBottom: 20,
    },
    scoreRingWrap: {
        width: 72,
        height: 72,
    },
    headerText: {
        flex: 1,
    },
    title: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: behaviorV1Theme.textPrimary,
        marginBottom: 4,
    },
    scoreValue: {
        fontFamily: fonts.bold,
        fontSize: 28,
        color: behaviorV1Theme.sageBright,
    },
    content: {
        gap: 14,
    },
    summary: {
        fontFamily: fonts.regular,
        fontSize: 15,
        color: behaviorV1Theme.textPrimary,
        lineHeight: 22,
        marginBottom: 4,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
    },
    rowText: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: behaviorV1Theme.textSecondary,
        flex: 1,
        lineHeight: 20,
    },
    actionRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        backgroundColor: 'rgba(168, 197, 160, 0.1)',
        padding: 12,
        borderRadius: 12,
        marginTop: 4,
    },
    actionText: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: behaviorV1Theme.textPrimary,
        flex: 1,
        lineHeight: 20,
    },
    loadingHint: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: behaviorV1Theme.textSecondary,
        textAlign: 'center',
        marginTop: 4,
    },
});
