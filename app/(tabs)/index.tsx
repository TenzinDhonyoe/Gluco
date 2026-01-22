import { AnimatedFAB, type AnimatedFABRef } from '@/components/animations/animated-fab';
import { AnimatedInteger } from '@/components/animations/animated-number';
import { AnimatedScreen } from '@/components/animations/animated-screen';
import { MealCheckinCard } from '@/components/cards/MealCheckinCard';
import { PersonalInsightsCarousel } from '@/components/carousels/PersonalInsightsCarousel';
import { GlucoseTrendIndicator, type TrendStatus } from '@/components/charts/GlucoseTrendIndicator';
import { SegmentedControl } from '@/components/controls/segmented-control';
import { ActiveExperimentWidget } from '@/components/experiments/ActiveExperimentWidget';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { LiquidGlassIconButton } from '@/components/ui/LiquidGlassButton';
import { SyncBanner } from '@/components/ui/SyncBanner';
import { Colors } from '@/constants/Colors';
import { Images } from '@/constants/Images';
import { useAuth, useGlucoseUnit } from '@/context/AuthContext';
import { useDailyContext } from '@/hooks/useDailyContext';
import { fonts } from '@/hooks/useFonts';
import { usePersonalInsights } from '@/hooks/usePersonalInsights';
import { SleepData, useSleepData } from '@/hooks/useSleepData';
import { useGlucoseTargetRange, useTodayScreenData } from '@/hooks/useTodayScreenData';
import { InsightData, TrackingMode } from '@/lib/insights';
import { getMetabolicWeeklyScores, GlucoseLog, invokeMetabolicScore, MealWithCheckin, MetabolicWeeklyScore } from '@/lib/supabase';
import { getDateRange, getRangeDays, RangeKey } from '@/lib/utils/dateRanges';
import { GlucoseUnit } from '@/lib/utils/glucoseUnits';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback, useMemo, useState, useTransition } from 'react';
import {
    Animated,
    Dimensions,
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
import Svg, { Circle, G, Line } from 'react-native-svg';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const TARGET_MIN_MMOL = 3.9;
const TARGET_MAX_MMOL = 10.0;

const MetabolicScoreRing = ({
    size = 48,
    score = null,
    scoreColor = Colors.textSecondary
}: {
    size?: number;
    score?: number | null;
    scoreColor?: string;
}) => {
    const strokeWidth = 4;
    const radius = (size - strokeWidth) / 2;
    const center = size / 2;
    const innerRadius = radius - 6;

    // Generate tick marks
    const ticks = useMemo(() => {
        const items = [];
        const totalTicks = 60;
        const activeTicks = score !== null ? Math.round((score / 100) * totalTicks) : 0;

        for (let i = 0; i < totalTicks; i++) {
            // Start from bottom (90 degrees + offset) or top?
            // Standard gauge often starts from 135deg to 45deg, but this circle looks full 360 or close to it.
            // The image shows a full circle. Let's assume 0 is top or standard 360.
            // Svg rotation: 0 is Right, 90 is Down.
            // Let's make index 0 be the top (270 deg).
            const angle = (i * 6 - 90) * (Math.PI / 180);

            const x1 = center + (radius) * Math.cos(angle);
            const y1 = center + (radius) * Math.sin(angle);
            const x2 = center + (radius - 3) * Math.cos(angle);
            const y2 = center + (radius - 3) * Math.sin(angle);

            const isActive = score !== null && i < activeTicks;
            const tickColor = isActive ? scoreColor : "rgba(255,255,255,0.15)";
            const tickOpacity = isActive ? 1 : 0.6;

            items.push(
                <Line
                    key={i}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={tickColor}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    opacity={tickOpacity}
                />
            );
        }
        return items;
    }, [center, radius, score, scoreColor]);

    return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={size} height={size}>
                {/* Tick marks ring */}
                <G>{ticks}</G>

                {/* Inner solid ring */}
                <Circle
                    cx={center}
                    cy={center}
                    r={innerRadius}
                    stroke="rgba(255,255,255,0.1)"
                    strokeWidth={strokeWidth}
                    fill="none"
                />
            </Svg>
            <View style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center' }]}>
                {score !== null ? (
                    <Text style={{ fontFamily: fonts.bold, fontSize: size * 0.32, color: '#FFFFFF' }}>
                        {Math.round(score)}
                    </Text>
                ) : (
                    <Ionicons name="lock-closed" size={size * 0.35} color="rgba(255,255,255,0.7)" />
                )}
            </View>
        </View>
    );
};

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
            colors={['#2A2C2C', '#212222']} // Lighter top to target darker #212222 bottom
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
const ELEVATED_THRESHOLD = 10.0;
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
                <Text style={[styles.statTitle, { color: Colors.activity }]}>ACTIVITY</Text>
            </View>
            <View style={styles.statValueContainer}>
                <Text style={styles.statValue}>{displayValue}</Text>
                <Text style={styles.statUnit}>min/day</Text>
            </View>
            {isHealthKitAvailable && !isHealthKitAuthorized ? (
                <Text style={styles.statDescription}>Tap to connect</Text>
            ) : (
                <StatusPill color={statusColor} label={statusLabel} />
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
                <Text style={styles.statUnit}>/day</Text>
            </View>
            {isAvailable && !isAuthorized ? (
                <Text style={styles.statDescription}>Tap to connect</Text>
            ) : (
                <StatusPill color={statusColor} label={statusLabel} />
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
    const { latestScore, velocity, trend } = useMemo(() => {
        const validScores = weeklyScores.filter(s => s.score7d !== null);

        // Use currentScore from edge function if available, otherwise use latest from weekly scores
        const latest = currentScore ?? validScores[0]?.score7d ?? null;

        if (latest === null) {
            return { latestScore: null, velocity: null, trend: 'neutral' as const };
        }

        // Compute velocity from last 4 weeks
        const recentScores = validScores.slice(0, 4).reverse();
        let vel = null;
        let trendDir: 'up' | 'down' | 'neutral' = 'neutral';

        if (recentScores.length >= 2) {
            const first = recentScores[0].score7d as number;
            const last = recentScores[recentScores.length - 1].score7d as number;
            vel = (last - first) / (recentScores.length - 1);
            trendDir = vel > 0.5 ? 'up' : vel < -0.5 ? 'down' : 'neutral';
        }

        return { latestScore: latest, velocity: vel, trend: trendDir };
    }, [weeklyScores, currentScore]);

    const hasScore = latestScore !== null && !isLoading;

    const getScoreColor = (score: number) => {
        if (score >= 70) return Colors.success;
        if (score >= 50) return Colors.warning;
        return Colors.error;
    };

    const getScoreLabel = (score: number) => {
        if (score >= 70) return 'Excellent';
        if (score >= 50) return 'Good';
        return 'Needs focus';
    };

    const getTrendIcon = () => {
        if (trend === 'up') return 'trending-up';
        if (trend === 'down') return 'trending-down';
        return null;
    };

    const getTrendColor = () => {
        if (trend === 'up') return Colors.success;
        if (trend === 'down') return Colors.error;
        return Colors.textTertiary;
    };

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
    const scoreColor = getScoreColor(latestScore);
    const scoreLabel = getScoreLabel(latestScore);
    const trendIcon = getTrendIcon();
    const progressPercent = Math.min(100, Math.max(0, latestScore));

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
                        {velocity !== null && trendIcon && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                                <Ionicons name={trendIcon} size={12} color={getTrendColor()} />
                                <Text style={{ fontFamily: fonts.medium, fontSize: 11, color: getTrendColor() }}>
                                    {velocity > 0 ? '+' : ''}{velocity.toFixed(1)}/wk
                                </Text>
                            </View>
                        )}
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


export default function TodayScreen() {
    const { profile, user } = useAuth();
    const glucoseUnit = useGlucoseUnit();
    const insets = useSafeAreaInsets();
    const [isFabOpen, setIsFabOpen] = useState(false);
    const [range, setRange] = useState<RangeKey>('30d');
    const [spikeSheetVisible, setSpikeSheetVisible] = useState(false);
    const [exerciseSheetVisible, setExerciseSheetVisible] = useState(false);
    const [weeklyScores, setWeeklyScores] = useState<MetabolicWeeklyScore[]>([]);
    const [currentScore, setCurrentScore] = useState<number | null>(null);
    const [scoresLoading, setScoresLoading] = useState(true);
    const overlayOpacity = React.useRef(new Animated.Value(0)).current;
    const fabRef = React.useRef<AnimatedFABRef>(null);

    // Use transition for non-blocking range changes
    const [isPending, startTransition] = useTransition();

    // Handler for range changes - uses startTransition to keep UI responsive
    const handleRangeChange = useCallback((newRange: RangeKey) => {
        startTransition(() => {
            setRange(newRange);
        });
    }, []);

    // Use unified data fetching hook - batches all queries
    const { glucoseLogs, activityLogs, fibreSummary, recentMeals, isLoading, refetch: refetchData } = useTodayScreenData(range);
    const { targetMin, targetMax } = useGlucoseTargetRange();
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Fetch sleep data from HealthKit (always fetches 90d, doesn't refetch on range change)
    const { data: sleepData, refetch: refetchSleep } = useSleepData(range);

    // Fetch daily context (steps, active minutes) from HealthKit
    // Always use 90d range to avoid refetching when user switches timeframes
    const maxDateRange = useMemo(() => getDateRange('90d'), []);
    const dailyContext = useDailyContext(user?.id, maxDateRange.startDate, maxDateRange.endDate);

    // Check if user is in wearables_only mode
    const isWearablesOnly = profile?.tracking_mode === 'wearables_only';

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

    // Pull-to-refresh handler - syncs all data sources
    const onRefresh = useCallback(async () => {
        setIsRefreshing(true);
        try {
            await Promise.all([
                refetchData(),
                dailyContext.sync(),
                refetchSleep(),
                fetchWeeklyScores(),
            ]);
        } catch (error) {
            console.warn('Error refreshing data:', error);
        } finally {
            setIsRefreshing(false);
        }
    }, [refetchData, dailyContext, refetchSleep, fetchWeeklyScores]);

    // Determine which tracking mode category the user is in
    const trackingMode = (profile?.tracking_mode || 'meals_wearables') as TrackingMode;
    const showWearableStats = trackingMode === 'meals_wearables' || trackingMode === 'wearables_only';
    // Show glucose UI for all modes since this is a metabolic wellness app
    const showGlucoseUI = true;
    const showMealsOnlyStats = trackingMode === 'meals_only';

    // Stable fallback data for rules-based insights (memoized to prevent re-renders)
    const fallbackData = useMemo((): InsightData => {
        // Calculate Time in Zone %
        let timeInZonePercent = undefined;
        let lowFibreMealsAboveZone = false; // Simplified placeholder

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
        };
    }, [glucoseLogs, recentMeals, sleepData?.avgHoursPerNight, dailyContext.avgSteps, dailyContext.avgActiveMinutes, fibreSummary?.avgPerDay, targetMin, targetMax]);

    // LLM-powered personal insights with stable hook (no infinite loops)
    const { insights: personalInsights, loading: insightsLoading } = usePersonalInsights({
        userId: user?.id,
        trackingMode,
        rangeKey: '7d',
        enabled: !!user?.id,
        fallbackData,
    });


    // Process meal reviews - only show meals that:
    // 1. Are at least 2 hours old (to give time for glucose response)
    // 2. Don't have a check-in yet
    const displayMeals = useMemo(() => {
        if (!user?.id) return [];
        const now = new Date();
        const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

        return (recentMeals || []).filter(meal => {
            const mealTime = new Date(meal.logged_at);
            const hasCheckin = meal.meal_checkins && meal.meal_checkins.length > 0;
            const isOldEnough = mealTime <= twoHoursAgo;

            // Show meals that are ready for check-in (old enough and no check-in yet)
            // OR meals that already have a check-in (for review)
            return isOldEnough || hasCheckin;
        });
    }, [user?.id, recentMeals]);

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

    const handleFabOpenChange = (isOpen: boolean) => {
        setIsFabOpen(isOpen);
        Animated.timing(overlayOpacity, {
            toValue: isOpen ? 1 : 0,
            duration: 250,
            useNativeDriver: true,
        }).start();
    };

    const HEADER_HEIGHT = 120 + insets.top;

    return (
        <AnimatedScreen>
            <View style={styles.container}>
                {/* Background gradient that blends with status bar */}
                <LinearGradient
                    colors={['#1a1f24', '#181c20', '#111111']}
                    locations={[0, 0.3, 1]}
                    style={styles.backgroundGradient}
                />

                {/* ScrollView - content scrolls behind header */}
                <ScrollView
                    style={styles.scrollView}
                    contentContainerStyle={[styles.scrollContent, { paddingTop: HEADER_HEIGHT + 8 }]}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl
                            refreshing={isRefreshing}
                            onRefresh={onRefresh}
                            tintColor={Colors.textSecondary}
                            progressViewOffset={HEADER_HEIGHT}
                        />
                    }
                >
                    {/* Glucose Trends - only show for glucose tracking users */}
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

                    {/* Personal Insights Carousel (includes Tip Cards) */}
                    <PersonalInsightsCarousel
                        insights={personalInsights}
                        isLoading={insightsLoading}
                        onMealPress={() => setSpikeSheetVisible(true)}
                        onExercisePress={() => setExerciseSheetVisible(true)}
                    />

                    {/* Today's Meals Section */}
                    <View style={styles.mealSection}>
                        <Text style={styles.mealSectionTitle}>Meal Check-ins</Text>
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
                </ScrollView>

                {/* Blurred Header - positioned absolutely over content */}
                <View style={styles.blurHeaderContainer}>
                    <BlurView
                        intensity={80}
                        tint="dark"
                        experimentalBlurMethod="dimezisBlurView"
                        style={styles.blurHeader}
                    >
                        <View style={{ paddingTop: insets.top }}>
                            <View style={styles.header}>
                                <LiquidGlassIconButton size={44} onPress={() => router.push('/settings')}>
                                    <Text style={styles.avatarText}>{getInitials()}</Text>
                                </LiquidGlassIconButton>
                                <Text style={styles.headerTitle}>GLUCO</Text>
                                <LiquidGlassIconButton size={44} onPress={() => router.push('/notifications-list')}>
                                    <Ionicons name="notifications-outline" size={22} color="#E7E8E9" />
                                </LiquidGlassIconButton>
                            </View>
                            {/* Sticky Range Picker */}
                            <View style={styles.stickyPickerContainer}>
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
                        </View>
                    </BlurView>
                    {/* Gradient fade edge - Apple Health style */}
                    <LinearGradient
                        colors={['rgba(22, 22, 24, 1)', 'rgba(17, 17, 17, 0)']}
                        style={styles.headerFadeEdge}
                        pointerEvents="none"
                    />
                </View>

                {/* Sync Banner - shows below header when syncing */}
                <SyncBanner
                    isSyncing={dailyContext.isSyncing || isLoading || isRefreshing}
                    topOffset={HEADER_HEIGHT}
                />

                {/* Dark Overlay when FAB is open */}
                {isFabOpen && (
                    <Animated.View
                        style={[
                            styles.fabOverlay,
                            { opacity: overlayOpacity }
                        ]}
                    >
                        <Pressable
                            style={StyleSheet.absoluteFill}
                            onPress={() => fabRef.current?.close()}
                        />
                    </Animated.View>
                )}

                {/* Floating Action Button with Menu */}
                <View style={styles.fabContainer}>
                    <AnimatedFAB
                        ref={fabRef}
                        size={56}
                        onPress={handleFabOpenChange}
                        onLogMeal={() => {
                            router.push({ pathname: '/meal-scanner' } as any);
                        }}
                        onLogActivity={() => {
                            router.push({ pathname: '/log-activity' } as any);
                        }}
                        onLogGlucose={() => {
                            router.push({ pathname: '/log-glucose' } as any);
                        }}
                    />
                </View>
            </View>

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
        </AnimatedScreen >
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    backgroundGradient: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 280,
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
    blurHeader: {
        overflow: 'hidden',
    },
    headerFadeEdge: {
        height: 32,
        marginTop: 0,
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: 'transparent',
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
    trendsSection: {
        marginTop: 16,
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
        borderWidth: 1.5, // Slightly thicker for the effect
        borderColor: 'rgba(255,255,255,0.15)', // White shining outline
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
        backgroundColor: '#22282C',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.25,
        shadowRadius: 2,
    },
    metabolicScoreCardEmpty: {
        backgroundColor: '#22282C',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.25,
        shadowRadius: 2,
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
        backgroundColor: '#22282C',
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
    fabContainer: {
        position: 'absolute',
        right: 16,
        bottom: 120,
        zIndex: 20,
    },
    fabOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        zIndex: 10,
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
        backgroundColor: '#22282C',
        borderRadius: 16,
        paddingVertical: 48,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
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
