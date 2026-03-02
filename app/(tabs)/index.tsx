import { AnimatedInteger } from '@/components/animations/animated-number';
import { TodayMealCheckinsList } from '@/components/cards/TodayMealCheckinsList';
import { PersonalInsightsCarousel } from '@/components/carousels/PersonalInsightsCarousel';
import { GlucoseTrendIndicator, type TrendStatus } from '@/components/charts/GlucoseTrendIndicator';
import { MetabolicScoreRing } from '@/components/charts/MetabolicScoreRing';
import { SegmentedControl } from '@/components/controls/segmented-control';
import { ActiveExperimentWidget } from '@/components/experiments/ActiveExperimentWidget';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { ForestGlassBackground } from '@/components/backgrounds/forest-glass-background';
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
import { getMetabolicWeeklyScores, GlucoseLog, invokeMetabolicScore, invokeScoreExplanation, MealWithCheckin, MetabolicScoreComponentsV2, MetabolicWeeklyScore, ScoreExplanation } from '@/lib/supabase';
import { getDateRange, getRangeDays, RangeKey } from '@/lib/utils/dateRanges';
import { GlucoseUnit } from '@/lib/utils/glucoseUnits';
import { triggerHaptic } from '@/lib/utils/haptics';
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
const CARD_SPACING = 10;
const HERO_STACK_BOTTOM_GAP = 0;


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

    // Room to grow (< 50)
    return {
        label: isEarlyJourney ? 'Momentum starts today' : 'Room to grow',
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
        <View style={styles.trendsCard}>
            <GlucoseTrendIndicator status={trendStatus} size={220} />
        </View>
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
            <View style={[styles.metabolicScoreCardEmpty, { backgroundColor: 'transparent', overflow: 'hidden' }]}>
                <BlurView intensity={60} tint="light" style={StyleSheet.absoluteFill} />
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
            style={[styles.metabolicScoreCardEmpty, { backgroundColor: 'transparent', overflow: 'hidden' }]}
            onPress={() => router.push({ pathname: '/(tabs)/insights', params: { tab: 'progress' } })}
        >
            <BlurView intensity={60} tint="light" style={StyleSheet.absoluteFill} />
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
            triggerHaptic('medium');
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
        backgroundColor: Colors.inputBackground,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: Colors.borderLight,
        padding: 16,
        fontFamily: fonts.regular,
        fontSize: 16,
        color: Colors.textPrimary,
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
            triggerHaptic('medium');
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
    const unlockedDays = Math.min(unlockDaysTarget, Math.max(0, unlockDaysCompleted));

    return (
        <View style={styles.behaviorHeroGlassWrapper}>
            <BlurView intensity={50} tint="light" style={styles.behaviorHeroGlassInner}>
                <LinearGradient
                    colors={['rgba(255,255,255,0.8)', 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0.5)']}
                    locations={[0, 0.4, 1]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                />
                <LinearGradient
                    colors={['rgba(255,255,255,0.5)', 'rgba(255,255,255,0)']}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 0.4 }}
                    style={StyleSheet.absoluteFill}
                />
                <View style={styles.behaviorHeroGlassHighlight} />

                <View style={styles.behaviorPrimaryTopRow}>
                    <View style={styles.behaviorHeroLabelRow}>
                        <Ionicons name="pulse-outline" size={14} color={behaviorV1Theme.textSecondary} />
                        <Text style={styles.behaviorLabel}>METABOLIC SCORE</Text>
                    </View>
                </View>

                <AnimatedPressable style={styles.behaviorScoreRow} onPress={onPressScore}>
                    <View style={styles.behaviorScoreContent}>
                        {scoreUnlocked ? (
                            <>
                                <View style={styles.behaviorScoreValueRow}>
                                    <Text style={styles.behaviorScoreValue}>
                                        {hasScore ? Math.round(resolvedScore).toString() : '--'}
                                    </Text>
                                    <Text style={styles.behaviorScoreValueMax}>/100</Text>
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
                    <View style={styles.behaviorScoreRingWrap}>
                        <MetabolicScoreRing
                            size={82}
                            score={scoreUnlocked ? resolvedScore : null}
                            scoreColor={scoreColor}
                            visualPreset="hero_vivid"
                            showInnerValue={false}
                            gradientColors={scoreTone.gradient}
                        />
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

            </BlurView>
        </View>
    );
}


function BehaviorCheckinPromptCard({
    onTrack,
    onDismiss,
}: {
    onTrack: () => void;
    onDismiss: () => void;
}) {
    return (
        <View style={styles.behaviorSecondaryGlassWrapper}>
            <BlurView intensity={80} tint="light" style={styles.checkinPromptCard}>
                <LinearGradient
                    colors={['rgba(52, 211, 153, 0.9)', 'rgba(45, 212, 191, 0.7)', 'rgba(52, 211, 153, 0.8)']}
                    locations={[0, 0.4, 1]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                />
                <View style={[styles.behaviorSecondaryGlassHighlight, { borderColor: 'rgba(255,255,255,0.6)' }]} />
                <View style={styles.checkinPromptEmojiRow}>
                    {[
                        { emoji: '🍗', size: 30, font: 14 },
                        { emoji: '🍎', size: 36, font: 17 },
                        { emoji: '🍴', size: 46, font: 22 },
                        { emoji: '🥬', size: 36, font: 17 },
                        { emoji: '🍩', size: 30, font: 14 },
                    ].map((item, i) => (
                        <View key={i} style={[styles.checkinPromptEmojiBubble, { width: item.size, height: item.size, borderRadius: item.size / 2 }]}>
                            <Text style={{ fontSize: item.font }}>{item.emoji}</Text>
                        </View>
                    ))}
                </View>
                <Text style={styles.checkinPromptQuestion}>How did that meal affect you?</Text>
                <Text style={styles.checkinPromptWhy}>
                    Track within 20 minutes of eating to see{'\n'}how food affects your levels
                </Text>
                <AnimatedPressable style={styles.checkinPromptCta} onPress={onTrack}>
                    <Text style={styles.checkinPromptCtaText}>Track my levels</Text>
                </AnimatedPressable>
                <TouchableOpacity style={styles.checkinPromptDismiss} onPress={onDismiss} activeOpacity={0.7}>
                    <Text style={styles.checkinPromptDismissText}>Remind me later</Text>
                </TouchableOpacity>
            </BlurView>
        </View>
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
        <View style={styles.darkActionCardWrapper}>
            <View style={styles.darkActionCard}>
                <LinearGradient
                    colors={['#2A2E35', '#1C1F24', '#232730']}
                    locations={[0, 0.5, 1]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                />
                <View style={styles.darkActionCardHighlight} />
                <View style={styles.darkActionTitleRow}>
                    <Ionicons name="sparkles" size={16} color={Colors.primary} />
                    <Text style={styles.darkActionLabel}>Personalized Tips</Text>
                </View>
                <Text style={styles.darkActionDescription}>{actionDescription}</Text>
                <AnimatedPressable style={styles.darkActionCta} onPress={onPressAction}>
                    <Text style={styles.darkActionCtaText}>{ctaLabel}  →</Text>
                </AnimatedPressable>
            </View>
        </View>
    );
}

/** Weekly bar chart — rounded capsule bars with M T W T F S S labels.
 *  Today's bar is highlighted in the accent colour; others are muted. */
const WEEK_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const WeeklyBarChart = React.memo(({ data, color, height = 40 }: {
    data: { label: string; value: number; isToday: boolean }[];
    color: string;
    height?: number;
}) => {
    if (data.length === 0) return null;
    const max = Math.max(...data.map(d => d.value), 1);
    const BAR_WIDTH = 7;

    return (
        <View style={{ marginTop: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', height, gap: 0 }}>
                {data.map((d, i) => {
                    const barH = d.value > 0
                        ? Math.max(8, (d.value / max) * height)
                        : 8;
                    return (
                        <View key={i} style={{ flex: 1, alignItems: 'center' }}>
                            <View
                                style={{
                                    width: BAR_WIDTH,
                                    height: barH,
                                    borderRadius: BAR_WIDTH / 2,
                                    backgroundColor: d.isToday ? color : behaviorV1Theme.textSecondary,
                                    opacity: d.isToday ? 1 : (d.value > 0 ? 0.45 : 0.15),
                                }}
                            />
                        </View>
                    );
                })}
            </View>
            <View style={{ flexDirection: 'row', gap: 0, marginTop: 5 }}>
                {data.map((d, i) => (
                    <Text key={i} style={{
                        flex: 1,
                        textAlign: 'center',
                        fontFamily: d.isToday ? fonts.semiBold : fonts.regular,
                        fontSize: 9,
                        color: d.isToday ? behaviorV1Theme.textPrimary : behaviorV1Theme.textSecondary,
                        opacity: d.isToday ? 0.8 : 0.45,
                    }}>
                        {d.label}
                    </Text>
                ))}
            </View>
        </View>
    );
});

function BehaviorMomentumCard({
    label,
    value,
    subtitle,
    icon,
    accentColor,
    accentSurface,
    accentBorder,
    state = 'data',
    chart,
    inviteTitle,
    inviteDescription,
    inviteCtaLabel,
    onPress,
}: {
    label: string;
    value: string;
    subtitle: string;
    icon: keyof typeof Ionicons.glyphMap;
    accentColor: string;
    accentSurface: string;
    accentBorder: string;
    state?: 'data' | 'invite';
    chart?: React.ReactNode;
    inviteTitle?: string;
    inviteDescription?: string;
    inviteCtaLabel?: string;
    onPress?: () => void;
}) {
    // Invite state — centered layout matching reference
    if (state === 'invite') {
        return (
            <View style={styles.behaviorSmallGlassWrapper}>
                <AnimatedPressable
                    style={[
                        styles.behaviorMomentumCard,
                        styles.behaviorMomentumCardInvite,
                        { borderColor: accentBorder, backgroundColor: 'transparent' },
                    ]}
                    onPress={onPress}
                    disabled={!onPress}
                >
                    <BlurView intensity={50} tint="light" style={[StyleSheet.absoluteFill, { backgroundColor: accentSurface }]}>
                        <LinearGradient
                            colors={['rgba(255,255,255,0.7)', 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0.35)']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={StyleSheet.absoluteFill}
                        />
                        <LinearGradient
                            colors={['rgba(255,255,255,0.6)', 'rgba(255,255,255,0)']}
                            start={{ x: 0.5, y: 0 }}
                            end={{ x: 0.5, y: 0.45 }}
                            style={StyleSheet.absoluteFill}
                        />
                        <View style={styles.behaviorSmallGlassHighlight} />
                    </BlurView>
                    <View style={styles.momentumInviteCentered}>
                        <Ionicons name={icon} size={22} color={accentColor} style={{ marginBottom: 8 }} />
                        <Text style={styles.momentumInviteTitle}>{inviteTitle || label}</Text>
                        {inviteDescription ? (
                            <Text style={styles.momentumInviteDesc}>{inviteDescription}</Text>
                        ) : null}
                        {inviteCtaLabel ? (
                            <View style={[styles.momentumInviteCta, { borderColor: accentColor }]}>
                                <Text style={[styles.momentumInviteCtaText, { color: accentColor }]}>{inviteCtaLabel}</Text>
                            </View>
                        ) : null}
                    </View>
                </AnimatedPressable>
            </View>
        );
    }

    // Data state — icon+label → value → chart → subtitle
    return (
        <View style={styles.behaviorSmallGlassWrapper}>
            <AnimatedPressable
                style={[
                    styles.behaviorMomentumCard,
                    { borderColor: accentBorder, backgroundColor: 'transparent' },
                ]}
                onPress={onPress}
                disabled={!onPress}
            >
                <BlurView intensity={50} tint="light" style={[StyleSheet.absoluteFill, { backgroundColor: accentSurface }]}>
                    <LinearGradient
                        colors={['rgba(255,255,255,0.7)', 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0.35)']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFill}
                    />
                    <LinearGradient
                        colors={['rgba(255,255,255,0.6)', 'rgba(255,255,255,0)']}
                        start={{ x: 0.5, y: 0 }}
                        end={{ x: 0.5, y: 0.45 }}
                        style={StyleSheet.absoluteFill}
                    />
                    <View style={styles.behaviorSmallGlassHighlight} />
                </BlurView>
                <View style={styles.behaviorMomentumLabelRow}>
                    <Ionicons name={icon} size={13} color={accentColor} />
                    <Text style={[styles.behaviorMomentumLabel, { color: accentColor }]}>{label}</Text>
                </View>
                <Text style={styles.behaviorMomentumValue}>
                    {value}
                </Text>
                {chart}
                <Text style={styles.behaviorMomentumSubtitle}>
                    {subtitle}
                </Text>
            </AnimatedPressable>
        </View>
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
        <BlurView intensity={60} tint="light" style={styles.behaviorAdvancedCard}>
            <AnimatedPressable style={styles.behaviorAdvancedHeader} onPress={onToggle}>
                <View style={styles.behaviorAdvancedHeaderLeft}>
                    <Ionicons name="analytics-outline" size={16} color={Colors.textSecondary} />
                    <Text style={styles.behaviorAdvancedTitle}>Advanced glucose details</Text>
                </View>
                <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textTertiary} />
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
        </BlurView>
    );
}


// ============================================
// Score-aware tip generator
// ============================================

interface ScoreAwareTip {
    title: string;
    description: string;
    ctaLabel: string;
    actionType: string;
    route: string;
}

function getScoreAwareTip(
    components: MetabolicScoreComponentsV2 | null,
    dailyContext: { avgSteps: number | null; avgSleepHours: number | null; avgRestingHR: number | null; avgHRV: number | null },
    sleepAvgHours: number | null,
): ScoreAwareTip | null {
    if (!components) return null;

    const badness: { key: string; value: number }[] = [];
    if (components.sleepBad !== null) badness.push({ key: 'sleep', value: components.sleepBad });
    if (components.stepsBad !== null) badness.push({ key: 'steps', value: components.stepsBad });
    if (components.rhrBad !== null) badness.push({ key: 'rhr', value: components.rhrBad });
    if (components.hrvBad !== null) badness.push({ key: 'hrv', value: components.hrvBad });

    if (badness.length === 0) return null;

    // Sort descending by badness — worst component first
    badness.sort((a, b) => b.value - a.value);
    const worst = badness[0];

    // Don't nag users who are doing well
    if (worst.value <= 0.3) return null;

    const avgSleep = sleepAvgHours ?? dailyContext.avgSleepHours;
    const avgSteps = dailyContext.avgSteps;
    const avgRHR = dailyContext.avgRestingHR;

    switch (worst.key) {
        case 'sleep': {
            const sleepStr = avgSleep ? `${avgSleep.toFixed(1)}h` : 'below optimal';
            return {
                title: 'Improve your sleep rhythm',
                description: `Your sleep has averaged ${sleepStr} — a consistent bedtime tonight could help your score.`,
                ctaLabel: 'View insights',
                actionType: 'sleep_improvement',
                route: '/(tabs)/insights',
            };
        }
        case 'steps': {
            const stepsStr = avgSteps ? avgSteps.toLocaleString() : 'fewer than recommended';
            return {
                title: 'Add more movement today',
                description: `You've averaged ${stepsStr} steps/day — a 10-min walk after your next meal could help.`,
                ctaLabel: 'Log activity',
                actionType: 'post_meal_walk',
                route: '/log-activity',
            };
        }
        case 'rhr': {
            const rhrStr = avgRHR ? `${Math.round(avgRHR)} bpm` : 'elevated';
            return {
                title: 'Support your recovery',
                description: `Your resting heart rate is ${rhrStr} — gentle movement or a breathing exercise can help.`,
                ctaLabel: 'Log activity',
                actionType: 'recovery_activity',
                route: '/log-activity',
            };
        }
        case 'hrv': {
            return {
                title: 'Focus on recovery tonight',
                description: 'Your recovery patterns have room to grow — consistent sleep and winding down early support this.',
                ctaLabel: 'View insights',
                actionType: 'recovery_sleep',
                route: '/(tabs)/insights',
            };
        }
        default:
            return null;
    }
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
    const [scoreComponentsV2, setScoreComponentsV2] = useState<MetabolicScoreComponentsV2 | null>(null);
    const [scoresLoading, setScoresLoading] = useState(true);
    const [advancedGlucoseExpanded, setAdvancedGlucoseExpanded] = useState(false);
    const [dismissedCheckinMealId, setDismissedCheckinMealId] = useState<string | null>(null);
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

            // Store component badness values for score-aware tips
            if (result?.components_v2) {
                setScoreComponentsV2(result.components_v2);
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


    // Recent meals for the check-in section (newest first, max 5)
    const checkinMeals = useMemo(() => {
        if (!recentMeals) return [];
        return [...recentMeals]
            .sort((a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime())
            .slice(0, 5);
    }, [recentMeals]);

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

        // Priority 4: Score-component-aware tip
        const scoreTip = getScoreAwareTip(scoreComponentsV2, dailyContext, sleepData?.avgHoursPerNight ?? null);
        if (scoreTip) {
            return {
                title: scoreTip.title,
                description: scoreTip.description,
                ctaLabel: scoreTip.ctaLabel,
                actionType: scoreTip.actionType,
                onPress: () => router.push(scoreTip.route as any),
            };
        }

        // Priority 5: Data-bootstrapping tip
        if (resolvedHomeScore === null) {
            if (dailyContext.isAvailable && !dailyContext.isAuthorized) {
                return {
                    title: 'Connect health data',
                    description: 'Link Apple Health to unlock your personalized wellness score.',
                    ctaLabel: 'Connect',
                    actionType: 'connect_health',
                    onPress: () => router.push('/data-sources'),
                };
            }
            return {
                title: 'Keep logging to build your score',
                description: 'A few more days of data and your personalized score will be ready.',
                ctaLabel: 'Log a meal',
                actionType: 'log_meal',
                onPress: () => router.push('/meal-scanner'),
            };
        }

        // Priority 6: Generic fallback
        return {
            title: 'Build your first behavior streak',
            description: 'Log one meal or one short walk today to start your momentum.',
            ctaLabel: 'Log a meal',
            actionType: 'log_meal',
            onPress: () => router.push('/meal-scanner'),
        };
    }, [behaviorActiveActions, nextBestAction, primaryInsight, scoreComponentsV2, dailyContext, sleepData, resolvedHomeScore]);

    const handleScorePress = useCallback(async () => {
        if (!user?.id || !resolvedHomeScore) return;
        triggerHaptic();

        setScoreExplanationVisible(true);
        scoreExplanationSlideAnim.setValue(400);
        Animated.spring(scoreExplanationSlideAnim, {
            toValue: 0,
            useNativeDriver: true,
            tension: 65,
            friction: 11,
        }).start();

        // Use real component scores if available, otherwise distribute evenly
        const scoreVal = resolvedHomeScore ?? 50;
        const components = scoreComponentsV2 ? {
            rhr: Math.round((1 - (scoreComponentsV2.rhrBad ?? 0.5)) * scoreVal * 0.25 * 4),
            steps: Math.round((1 - (scoreComponentsV2.stepsBad ?? 0.5)) * scoreVal * 0.25 * 4),
            sleep: Math.round((1 - (scoreComponentsV2.sleepBad ?? 0.5)) * scoreVal * 0.25 * 4),
            hrv: Math.round((1 - (scoreComponentsV2.hrvBad ?? 0.5)) * scoreVal * 0.25 * 4),
        } : {
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
    }, [user?.id, resolvedHomeScore, scoreComponentsV2, scoreExplanationSlideAnim]);

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

    const fibreMomentumState = useMemo(() => {
        const avgPerDay = fibreSummary?.avgPerDay ?? 0;
        const hasData = fibreSummary !== null && avgPerDay > 0;

        if (hasData) {
            const status = avgPerDay >= 25 ? 'High' : avgPerDay >= 15 ? 'Moderate' : 'Low';
            return {
                value: `${avgPerDay.toFixed(1)}g`,
                subtitle: `${status} · Avg per day`,
                state: 'data' as const,
            };
        }

        return {
            value: 'Track fibre',
            subtitle: 'Log meals to see your fibre intake',
            state: 'invite' as const,
        };
    }, [fibreSummary]);

    // Chart data for momentum cards — all use { label, value, isToday } for WeeklyBarChart
    const buildWeek = (getValue: (key: string, d: Date) => number) => {
        const today = new Date().toISOString().split('T')[0];
        const result: { label: string; value: number; isToday: boolean }[] = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = d.toISOString().split('T')[0];
            result.push({
                label: WEEK_LABELS[(d.getDay() + 6) % 7],
                value: getValue(key, d),
                isToday: key === today,
            });
        }
        return result;
    };

    const activityBarData = useMemo(() =>
        buildWeek((key) => dailyContext.dailyRecords.find(r => r.date === key)?.active_minutes ?? 0),
        [dailyContext.dailyRecords]);

    const sleepBarData = useMemo(() =>
        buildWeek((key) => dailyContext.dailyRecords.find(r => r.date === key)?.sleep_hours ?? 0),
        [dailyContext.dailyRecords]);

    const weightBarData = useMemo(() => {
        const logsByDay: Record<string, number> = {};
        for (const l of weightLogs) {
            const day = l.logged_at.split('T')[0];
            logsByDay[day] = l.weight_kg;
        }
        return buildWeek((key) => logsByDay[key] ?? 0);
    }, [weightLogs]);

    const fibreBarData = useMemo(() => {
        const dailyFibre: Record<string, number> = {};
        for (const meal of recentMeals) {
            const day = meal.logged_at.split('T')[0];
            dailyFibre[day] = (dailyFibre[day] ?? 0) + (meal.fiber_g ?? 0);
        }
        return buildWeek((key) => dailyFibre[key] ?? 0);
    }, [recentMeals]);

    const handleMealPress = (meal: MealWithCheckin) => {
        triggerHaptic();
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
    const behaviorMealsReveal = useRef(new Animated.Value(0)).current;
    const behaviorAdvancedReveal = useRef(new Animated.Value(0)).current;
    const behaviorQueueReveal = useRef(new Animated.Value(0)).current;
    const behaviorEntrancePlayedRef = useRef(false);

    useEffect(() => {
        if (!isBehaviorV1) {
            behaviorEntrancePlayedRef.current = false;
            behaviorHeroReveal.setValue(0);
            behaviorMomentumReveal.setValue(0);
            behaviorMealsReveal.setValue(0);
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
            behaviorMealsReveal,
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
        behaviorMealsReveal,
        behaviorAdvancedReveal,
        behaviorQueueReveal,
    ]);

    // Header Content Height (Profile, Title, etc.) - same as styles.header height
    const HEADER_CONTENT_HEIGHT = 56;

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

    const behaviorMealsTranslateIn = behaviorMealsReveal.interpolate({
        inputRange: [0, 1],
        outputRange: [14, 0],
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
    // Nav Bar: 56
    // Picker: 44 (legacy only)
    const HEADER_HEIGHT = insets.top + 56 + (isBehaviorV1 ? 0 : 44);

    return (
        <View style={styles.container}>
            <ForestGlassBackground />

            {/* Fixed Header — floating glass buttons like Apple Health */}
            <Animated.View
                style={[
                    styles.headerContainer,
                    {
                        paddingTop: insets.top,
                        transform: [{ translateY: headerTranslateY }],
                    },
                ]}
                pointerEvents="box-none"
            >
                <Animated.View style={[styles.header, { opacity: headerOpacity }]}>
                    <LiquidGlassIconButton size={44} onPress={() => router.push('/settings')}>
                        <Text style={styles.avatarText}>{getInitials()}</Text>
                    </LiquidGlassIconButton>
                    <Text style={styles.headerTitle}>GLUCO</Text>
                    <LiquidGlassIconButton size={44} onPress={() => router.push('/notifications-list')}>
                        <Ionicons name="notifications-outline" size={22} color={Colors.textPrimary} />
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
                        {/* Metabolic Score Hero Card */}
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
                        </Animated.View>

                        {/* Check-In Prompt or Next Best Action fallback */}
                        <Animated.View
                            style={{
                                opacity: behaviorMomentumReveal,
                                transform: [{ translateY: behaviorMomentumTranslateIn }],
                            }}
                        >
                            <BehaviorNextActionCard
                                actionTitle={primaryBehaviorCard.title}
                                actionDescription={primaryBehaviorCard.description}
                                ctaLabel={primaryBehaviorCard.ctaLabel}
                                onPressAction={primaryBehaviorCard.onPress}
                                onPressMoreSteps={() => router.push({ pathname: '/(tabs)/insights', params: { tab: 'actions' } })}
                            />
                        </Animated.View>

                        {/* 2x2 Momentum Grid — color-coded */}
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
                                <View style={styles.behaviorMomentumRow}>
                                    <BehaviorMomentumCard
                                        label="Activity"
                                        icon="flash-outline"
                                        accentColor={behaviorV1Theme.activityAccent}
                                        accentSurface={behaviorV1Theme.activitySurface}
                                        accentBorder={behaviorV1Theme.activityBorder}
                                        value={avgActivityMinutes !== null ? `${avgActivityMinutes}/min` : '--'}
                                        subtitle="Avg active minutes/day"
                                        chart={<WeeklyBarChart data={activityBarData} color={behaviorV1Theme.activityAccent} />}
                                        onPress={() => router.push('/log-activity')}
                                    />
                                    <BehaviorMomentumCard
                                        label="Sleep"
                                        icon="moon-outline"
                                        accentColor={behaviorV1Theme.sleepAccent}
                                        accentSurface={behaviorV1Theme.sleepSurface}
                                        accentBorder={behaviorV1Theme.sleepBorder}
                                        value={sleepMomentumState.value}
                                        subtitle={sleepMomentumState.subtitle}
                                        state={sleepMomentumState.state}
                                        chart={sleepMomentumState.state === 'data' ? <WeeklyBarChart data={sleepBarData} color={behaviorV1Theme.sleepAccent} /> : undefined}
                                        inviteTitle={sleepMomentumState.state === 'invite' ? 'No sleep data yet' : undefined}
                                        inviteDescription={sleepMomentumState.state === 'invite' ? 'Connect your sleep tracker to start.' : undefined}
                                        inviteCtaLabel={sleepMomentumState.state === 'invite' ? 'Connect' : undefined}
                                        onPress={sleepMomentumState.onPress}
                                    />
                                </View>
                                <View style={styles.behaviorMomentumRow}>
                                    <BehaviorMomentumCard
                                        label="Weight"
                                        icon="scale-outline"
                                        accentColor={behaviorV1Theme.weightAccent}
                                        accentSurface={behaviorV1Theme.weightSurface}
                                        accentBorder={behaviorV1Theme.weightBorder}
                                        value={weightMomentumState.value}
                                        subtitle={weightMomentumState.subtitle}
                                        state={weightMomentumState.state}
                                        chart={weightMomentumState.state === 'data' ? <WeeklyBarChart data={weightBarData} color={behaviorV1Theme.weightAccent} /> : undefined}
                                        inviteTitle={weightMomentumState.state === 'invite' ? 'Log weight' : undefined}
                                        inviteDescription={weightMomentumState.state === 'invite' ? 'Add your first weight check-in.' : undefined}
                                        inviteCtaLabel={weightMomentumState.state === 'invite' ? 'Add weight' : undefined}
                                        onPress={() => router.push('/log-weight' as any)}
                                    />
                                    <BehaviorMomentumCard
                                        label="Fibre Intake"
                                        icon="leaf-outline"
                                        accentColor={behaviorV1Theme.fibreAccent}
                                        accentSurface={behaviorV1Theme.fibreSurface}
                                        accentBorder={behaviorV1Theme.fibreBorder}
                                        value={fibreMomentumState.value}
                                        subtitle={fibreMomentumState.subtitle}
                                        state={fibreMomentumState.state}
                                        chart={fibreMomentumState.state === 'data' ? <WeeklyBarChart data={fibreBarData} color={behaviorV1Theme.fibreAccent} /> : undefined}
                                        inviteTitle={fibreMomentumState.state === 'invite' ? 'Track fibre' : undefined}
                                        inviteDescription={fibreMomentumState.state === 'invite' ? 'Log meals to see your daily fibre.' : undefined}
                                        inviteCtaLabel={fibreMomentumState.state === 'invite' ? 'Log a meal' : undefined}
                                        onPress={() => router.push('/(tabs)/log' as any)}
                                    />
                                </View>
                            </View>
                        </Animated.View>

                        {/* Today's Meal Check-ins */}
                        <Animated.View
                            style={{
                                opacity: behaviorMealsReveal,
                                transform: [{ translateY: behaviorMealsTranslateIn }],
                            }}
                        >
                            <TodayMealCheckinsList
                                meals={checkinMeals}
                                onMealPress={handleMealPress}
                                onViewAllPress={() => router.push('/(tabs)/log' as any)}
                            />
                        </Animated.View>

                        {/* Advanced Glucose — unchanged, conditional */}
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
                        <TodayMealCheckinsList
                            meals={checkinMeals}
                            onMealPress={handleMealPress}
                            onViewAllPress={() => router.push('/(tabs)/log' as any)}
                        />
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
        zIndex: 10,
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        height: 56,
    },
    pickerContainer: {
        marginHorizontal: 16,
        marginBottom: 12,
    },
    avatarText: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: '#2DD4BF',
    },
    headerTitle: {
        fontFamily: fonts.bold,
        fontSize: 18,
        color: Colors.textPrimary,
        flex: 1,
        textAlign: 'center',
        letterSpacing: 1,
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
    behaviorHeroGlassWrapper: {
        marginBottom: CARD_SPACING,
        borderRadius: 28,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.12,
        shadowRadius: 32,
        elevation: 8,
        backgroundColor: 'transparent',
    },
    behaviorHeroGlassInner: {
        borderRadius: 28,
        padding: 18,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.7)',
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
    },
    behaviorHeroGlassHighlight: {
        ...StyleSheet.absoluteFillObject,
        borderTopWidth: 1.5,
        borderLeftWidth: 1.5,
        borderColor: 'rgba(255, 255, 255, 0.9)',
        borderRadius: 28,
    },
    behaviorSecondaryGlassWrapper: {
        marginBottom: CARD_SPACING,
        borderRadius: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.10,
        shadowRadius: 24,
        elevation: 4,
        backgroundColor: 'transparent',
    },
    behaviorSecondaryGlassInner: {
        borderRadius: 24,
        padding: 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.7)',
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
    },
    behaviorSecondaryGlassHighlight: {
        ...StyleSheet.absoluteFillObject,
        borderTopWidth: 1.5,
        borderLeftWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.9)',
        borderRadius: 24,
    },


    behaviorPrimaryTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    behaviorHeroLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
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
        justifyContent: 'space-between',
        gap: 14,
        paddingVertical: 4,
    },
    behaviorScoreRingWrap: {
        width: 86,
        height: 86,
        borderRadius: 43,
        alignItems: 'center',
        justifyContent: 'center',
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
        fontFamily: fonts.bold,
        fontSize: 44,
        color: behaviorV1Theme.textPrimary,
        lineHeight: 48,
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
        borderColor: 'rgba(45, 212, 191, 0.20)',
        backgroundColor: 'rgba(45, 212, 191, 0.08)',
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    behaviorUnlockProgressText: {
        fontFamily: fonts.medium,
        fontSize: 11,
        color: behaviorV1Theme.sageMid,
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
        borderColor: 'rgba(60, 60, 67, 0.12)',
        backgroundColor: 'rgba(60, 60, 67, 0.06)',
    },
    behaviorMomentumChipSuccess: {
        borderColor: 'rgba(45, 212, 191, 0.30)',
        backgroundColor: 'rgba(45, 212, 191, 0.10)',
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
    // Dark "Personalized Tips" card
    darkActionCardWrapper: {
        marginBottom: CARD_SPACING,
        borderRadius: 22,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 20,
        elevation: 8,
    },
    darkActionCard: {
        borderRadius: 22,
        padding: 18,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    darkActionCardHighlight: {
        ...StyleSheet.absoluteFillObject,
        borderTopWidth: 1,
        borderLeftWidth: 0.5,
        borderColor: 'rgba(255, 255, 255, 0.12)',
        borderRadius: 22,
    },
    darkActionTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        marginBottom: 10,
    },
    darkActionLabel: {
        fontFamily: fonts.semiBold,
        fontSize: 15,
        color: '#FFFFFF',
    },
    darkActionDescription: {
        fontFamily: fonts.regular,
        fontSize: 14,
        lineHeight: 20,
        color: 'rgba(255, 255, 255, 0.72)',
        marginBottom: 14,
    },
    darkActionCta: {
        alignSelf: 'flex-start',
    },
    darkActionCtaText: {
        fontFamily: fonts.semiBold,
        fontSize: 14,
        color: Colors.primary,
    },
    // Check-in Prompt Card
    checkinPromptCard: {
        borderRadius: 24,
        paddingHorizontal: 20,
        paddingTop: 18,
        paddingBottom: 14,
        overflow: 'hidden',
        alignItems: 'center',
        borderWidth: 1.5,
        borderColor: '#FFFFFF',
        backgroundColor: 'rgba(255, 255, 255, 0.3)',
    },
    checkinPromptEmojiRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 14,
    },
    checkinPromptEmojiBubble: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: 'rgba(255, 255, 255, 0.25)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkinPromptEmoji: {
        fontSize: 18,
    },
    checkinPromptQuestion: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: '#FFFFFF',
        textAlign: 'center',
        marginBottom: 6,
    },
    checkinPromptWhy: {
        fontFamily: fonts.regular,
        fontSize: 13,
        lineHeight: 18,
        color: 'rgba(255, 255, 255, 0.80)',
        textAlign: 'center',
        marginBottom: 16,
    },
    checkinPromptCta: {
        backgroundColor: '#1C1C1E',
        borderRadius: 22,
        paddingVertical: 13,
        alignItems: 'center',
        alignSelf: 'stretch',
        marginBottom: 8,
    },
    checkinPromptCtaText: {
        fontFamily: fonts.semiBold,
        fontSize: 15,
        color: '#FFFFFF',
    },
    checkinPromptDismiss: {
        alignItems: 'center',
        paddingVertical: 6,
    },
    checkinPromptDismissText: {
        fontFamily: fonts.medium,
        fontSize: 13,
        color: 'rgba(255, 255, 255, 0.80)',
    },
    // Momentum Grid
    behaviorMomentumGrid: {
        gap: 8,
        marginBottom: 10,
    },
    behaviorMomentumRow: {
        flexDirection: 'row',
        gap: 8,
    },
    behaviorSmallGlassWrapper: {
        flex: 1,
        borderRadius: 22,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.10,
        shadowRadius: 24,
        elevation: 4,
        backgroundColor: 'transparent',
    },
    behaviorMomentumCard: {
        flex: 1,
        minHeight: 120,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.7)',
        padding: 12,
        paddingBottom: 10,
        overflow: 'hidden',
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
    },
    behaviorSmallGlassHighlight: {
        ...StyleSheet.absoluteFillObject,
        borderTopWidth: 1.5,
        borderLeftWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.9)',
        borderRadius: 22,
    },
    behaviorMomentumCardInvite: {
        borderStyle: 'dashed',
    },
    behaviorMomentumLabel: {
        fontFamily: fonts.medium,
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
    },
    behaviorMomentumLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    behaviorMomentumValue: {
        marginTop: 6,
        fontFamily: fonts.semiBold,
        fontSize: 22,
        lineHeight: 26,
        color: behaviorV1Theme.textPrimary,
    },
    behaviorMomentumValueText: {
        fontSize: 14,
        lineHeight: 19,
        color: behaviorV1Theme.textPrimary,
    },
    behaviorMomentumSubtitle: {
        marginTop: 4,
        fontFamily: fonts.regular,
        fontSize: 11,
        color: behaviorV1Theme.textSecondary,
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
    },
    momentumInviteCentered: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 6,
    },
    momentumInviteTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 14,
        color: behaviorV1Theme.textPrimary,
        textAlign: 'center',
        marginBottom: 4,
    },
    momentumInviteDesc: {
        fontFamily: fonts.regular,
        fontSize: 11,
        color: behaviorV1Theme.textSecondary,
        textAlign: 'center',
        lineHeight: 15,
        marginBottom: 10,
    },
    momentumInviteCta: {
        borderRadius: 14,
        borderWidth: 1,
        paddingHorizontal: 14,
        paddingVertical: 6,
    },
    momentumInviteCtaText: {
        fontFamily: fonts.medium,
        fontSize: 12,
    },
    behaviorAdvancedCard: {
        borderRadius: 14,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: 'rgba(60, 60, 67, 0.10)',
        marginBottom: 14,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
        elevation: 1,
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
        color: Colors.textSecondary,
    },
    behaviorAdvancedBody: {
        paddingHorizontal: 14,
        paddingBottom: 14,
        borderTopWidth: 1,
        borderTopColor: 'rgba(60, 60, 67, 0.10)',
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
        color: Colors.textSecondary,
    },
    behaviorAdvancedMetricValue: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: Colors.textPrimary,
    },
    behaviorAdvancedCta: {
        marginTop: 2,
        borderRadius: 10,
        backgroundColor: 'rgba(60, 60, 67, 0.06)',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 38,
    },
    behaviorAdvancedCtaText: {
        fontFamily: fonts.medium,
        fontSize: 13,
        color: Colors.textPrimary,
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
        backgroundColor: 'rgba(255, 255, 255, 0.70)',
        borderRadius: 24,
        paddingHorizontal: 16,
        paddingTop: 20,
        paddingBottom: 24,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 0.5,
        borderColor: 'rgba(255, 255, 255, 0.5)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 16,
        elevation: 2,
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
        backgroundColor: 'rgba(255, 255, 255, 0.70)',
        borderRadius: 20,
        padding: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 16,
        borderWidth: 0.5,
        borderColor: 'rgba(255, 255, 255, 0.5)',
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
        color: Colors.textPrimary,
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
        color: Colors.textPrimary,
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
        backgroundColor: 'rgba(0,0,0,0.06)',
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
        backgroundColor: 'rgba(255, 255, 255, 0.70)', // Liquid Glass base
        borderRadius: 20, // Softer
        padding: 16,
        borderWidth: 0.5,
        borderColor: 'rgba(255, 255, 255, 0.5)', // Subtle edge
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 16,
        elevation: 2,
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
        color: Colors.textPrimary,
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
        color: Colors.textPrimary,
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
        backgroundColor: 'rgba(255, 255, 255, 0.70)',
        borderRadius: 20,
        padding: 16,
        gap: 16,
        borderWidth: 0.5,
        borderColor: 'rgba(255, 255, 255, 0.5)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 16,
        elevation: 2,
    },
    mealHeader: {
        flexDirection: 'row',
        gap: 8,
    },
    mealIconContainer: {
        width: 36,
        height: 36,
        borderRadius: 8,
        backgroundColor: 'rgba(60, 60, 67, 0.06)',
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
        backgroundColor: 'rgba(0,0,0,0.04)',
        borderRadius: 8,
        padding: 12,
    },
    chartLabel: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: Colors.textPrimary,
        marginBottom: 8,
    },
    chartArea: {
        flex: 1,
        justifyContent: 'space-between',
    },
    chartLine: {
        flex: 1,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(60, 60, 67, 0.10)',
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
        color: Colors.textPrimary,
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
        backgroundColor: 'rgba(60, 60, 67, 0.06)',
        borderRadius: 8,
    },
    miniChartEmptyText: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: Colors.textTertiary,
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
        color: Colors.textTertiary,
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
        backgroundColor: 'rgba(255, 255, 255, 0.40)', // Empty state, even lighter glass
        borderRadius: 20,
        paddingVertical: 48,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
        borderWidth: 0.5,
        borderColor: 'rgba(255, 255, 255, 0.5)',
        borderStyle: 'dashed',
    },
    noMealsText: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: Colors.textPrimary,
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
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 24,
        paddingBottom: 40,
        paddingTop: 12,
        borderTopWidth: 1,
        borderColor: 'rgba(60, 60, 67, 0.10)',
    },
    handle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(60, 60, 67, 0.20)',
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
        backgroundColor: 'rgba(45, 212, 191, 0.06)',
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
