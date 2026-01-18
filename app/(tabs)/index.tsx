import { AnimatedFAB, type AnimatedFABRef } from '@/components/animations/animated-fab';
import { AnimatedInteger, AnimatedNumber } from '@/components/animations/animated-number';
import { AnimatedScreen } from '@/components/animations/animated-screen';
import { MealCheckinCard } from '@/components/cards/MealCheckinCard';
import { PersonalInsightsCarousel } from '@/components/carousels/PersonalInsightsCarousel';
import { GlucoseTrendChart, type TrendPoint } from '@/components/charts/glucose-trend-chart';
import { SegmentedControl } from '@/components/controls/segmented-control';
import { ActiveExperimentWidget } from '@/components/experiments/ActiveExperimentWidget';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { Colors } from '@/constants/Colors';
import { Images } from '@/constants/Images';
import { useAuth, useGlucoseUnit } from '@/context/AuthContext';
import { useDailyContext } from '@/hooks/useDailyContext';
import { fonts } from '@/hooks/useFonts';
import { usePersonalInsights } from '@/hooks/usePersonalInsights';
import { SleepData, useSleepData } from '@/hooks/useSleepData';
import { useGlucoseTargetRange, useTodayScreenData } from '@/hooks/useTodayScreenData';
import { InsightData, TrackingMode } from '@/lib/insights';
import { GlucoseLog, MealWithCheckin } from '@/lib/supabase';
import { getDateRange, getRangeDays, getRangeLabel, getRangeShortLabel, RangeKey } from '@/lib/utils/dateRanges';
import { convertFromMmol, formatTargetRange, GlucoseUnit } from '@/lib/utils/glucoseUnits';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
    Animated,
    Dimensions,
    Image,
    KeyboardAvoidingView,
    Modal,
    PanResponder,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const TARGET_MIN_MMOL = 3.9;
const TARGET_MAX_MMOL = 10.0;

function computeAverage(points: TrendPoint[]) {
    if (points.length === 0) return 0;
    const sum = points.reduce((acc, p) => acc + p.value, 0);
    return sum / points.length;
}

function getStatus(avg: number, min: number = TARGET_MIN_MMOL, max: number = TARGET_MAX_MMOL) {
    const isGood = avg >= min && avg <= max;
    return {
        isGood,
        label: isGood ? 'In target band' : 'Outside target band',
        color: isGood ? Colors.glucoseGood : Colors.glucoseHigh,
        bg: isGood ? 'rgba(76, 175, 80, 0.15)' : 'rgba(244, 67, 54, 0.15)',
    };
}

// Chart data with both raw points and rolling average trend
interface ChartData {
    rawPoints: TrendPoint[];    // Daily averages (for dots)
    trendPoints: TrendPoint[];  // Rolling averages (for dominant line)
}

// Transform glucose logs to chart data with raw readings and rolling average
function transformLogsToChartData(logs: GlucoseLog[], range: RangeKey): ChartData {
    const now = new Date();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // Rolling average window size
    const rollingWindow = range === '90d' ? 14 : 7;

    // For 7d, 14d, 30d, 90d - group by day
    const days = getRangeDays(range);
    const dailyData: { [dateKey: string]: number[] } = {};

    logs.forEach(log => {
        const logDate = new Date(log.logged_at);
        const dateKey = logDate.toISOString().split('T')[0]; // YYYY-MM-DD
        if (!dailyData[dateKey]) dailyData[dateKey] = [];
        dailyData[dateKey].push(log.glucose_level);
    });

    // Create raw data points for each day in the range
    const rawPoints: TrendPoint[] = [];
    const dailyValues: { date: Date; value: number; label: string }[] = [];

    for (let i = days - 1; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(now.getDate() - i);
        const dateKey = date.toISOString().split('T')[0];
        const values = dailyData[dateKey] || [];
        const avgValue = values.length > 0
            ? values.reduce((a, b) => a + b, 0) / values.length
            : 0;

        let label = '';
        if (range === '7d') {
            label = dayLabels[date.getDay()];
        } else {
            label = `${monthNames[date.getMonth()]} ${date.getDate()}`;
        }

        if (avgValue > 0) {
            rawPoints.push({ value: avgValue, label });
            dailyValues.push({ date, value: avgValue, label });
        }
    }

    // Calculate rolling averages for trend line
    const trendPoints: TrendPoint[] = [];

    for (let i = 0; i < dailyValues.length; i++) {
        // Get values for rolling window (look back)
        const windowStart = Math.max(0, i - rollingWindow + 1);
        const windowValues = dailyValues.slice(windowStart, i + 1).map(d => d.value);

        if (windowValues.length > 0) {
            const rollingAvg = windowValues.reduce((a, b) => a + b, 0) / windowValues.length;
            trendPoints.push({
                value: rollingAvg,
                label: dailyValues[i].label,
            });
        }
    }

    return { rawPoints, trendPoints };
}

// Memoized Glucose Trends Card component
const GlucoseTrendsCard = React.memo(({ range, allLogs, isLoading, glucoseUnit }: {
    range: RangeKey;
    allLogs: GlucoseLog[];
    isLoading: boolean;
    glucoseUnit: GlucoseUnit;
}) => {
    const { targetMin, targetMax } = useGlucoseTargetRange();

    // Keep track of the last valid average to show during loading
    const lastAvgRef = React.useRef<number>(0);
    const hasEverHadData = React.useRef<boolean>(false);

    // Filter logs based on selected range and transform to chart data
    const chartData = useMemo(() => {
        const { startDate, endDate } = getDateRange(range);
        const filteredLogs = allLogs.filter(log => {
            const logDate = new Date(log.logged_at);
            return logDate >= startDate && logDate <= endDate;
        });
        return transformLogsToChartData(filteredLogs, range);
    }, [allLogs, range]);

    const { rawPoints, trendPoints } = chartData;

    // Calculate current period average from raw points
    const avg = useMemo(() => computeAverage(rawPoints), [rawPoints]);

    // Update the last valid average when we have new data
    const hasData = rawPoints.length > 0;
    if (hasData && avg > 0) {
        lastAvgRef.current = avg;
        hasEverHadData.current = true;
    }

    // Use the current avg if we have data, otherwise use the last known value
    const displayAvg = hasData ? avg : lastAvgRef.current;

    // Calculate delta vs previous period
    const delta = useMemo(() => {
        const days = getRangeDays(range);
        const now = new Date();

        // Previous period: e.g., for 30d, this is 30-60 days ago
        const prevEnd = new Date(now);
        prevEnd.setDate(now.getDate() - days);
        const prevStart = new Date(now);
        prevStart.setDate(now.getDate() - (days * 2));

        const prevLogs = allLogs.filter(log => {
            const logDate = new Date(log.logged_at);
            return logDate >= prevStart && logDate < prevEnd;
        });

        if (prevLogs.length === 0) return null;

        const prevAvg = prevLogs.reduce((sum, log) => sum + log.glucose_level, 0) / prevLogs.length;
        return avg - prevAvg;
    }, [allLogs, range, avg]);

    const status = useMemo(() => getStatus(avg, targetMin, targetMax), [avg, targetMin, targetMax]);

    // Format the average for display - convert to user's unit
    const displayAvgFormatted = convertFromMmol(displayAvg, glucoseUnit);

    return (
        <View style={styles.trendsCard}>
            <View style={styles.trendsHeaderRow}>
                <View style={styles.trendsHeaderLeft}>
                    <View style={styles.avgRow}>
                        {hasData ? (
                            <>
                                <AnimatedNumber
                                    value={displayAvgFormatted}
                                    duration={800}
                                    style={styles.avgValue}
                                    formatValue={(v) => glucoseUnit === 'mg/dL' ? Math.round(v).toString() : v.toFixed(1)}
                                />
                                <Text style={styles.avgUnit}>{glucoseUnit}</Text>
                            </>
                        ) : (
                            <>
                                <Text style={styles.avgValue}>--</Text>
                                <Text style={styles.avgUnit}>{glucoseUnit}</Text>
                            </>
                        )}
                    </View>
                    <Text style={styles.avgSubtitle}>{getRangeLabel(range)}</Text>
                </View>

                {hasData && !isLoading && (
                    <View style={[styles.statusPill, { backgroundColor: status.bg, borderColor: status.color }]}>
                        <View style={[styles.statusDot, { backgroundColor: status.color }]} />
                        <Text style={[styles.statusText, { color: status.color }]}>
                            {status.label} ({formatTargetRange(targetMin, targetMax, glucoseUnit)})
                        </Text>
                    </View>
                )}
            </View>

            <View style={styles.chartBlock}>
                {hasData ? (
                    <GlucoseTrendChart
                        rawData={rawPoints}
                        trendData={trendPoints}
                        height={200}
                        targetLow={targetMin}
                        targetHigh={targetMax}
                        glucoseUnit={glucoseUnit}
                    />
                ) : !isLoading ? (
                    <View style={styles.chartEmpty}>
                        <Ionicons name="analytics-outline" size={40} color="#878787" />
                        <Text style={styles.chartEmptyText}>No glucose data for this period</Text>
                        <Text style={styles.chartEmptySubtext}>Log your glucose levels to see trends</Text>
                    </View>
                ) : null}
            </View>
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

        if (filteredLogs.length === 0) return 0;

        // Count individual readings in range (not daily averages)
        const inRangeReadings = filteredLogs.filter(
            log => log.glucose_level >= targetMin && log.glucose_level <= targetMax
        ).length;

        // Calculate percentage based on individual readings
        return Math.round((inRangeReadings / filteredLogs.length) * 100);
    }, [glucoseLogs, range, targetMin, targetMax]);

    return (
        <View style={styles.statCard}>
            <View style={styles.statHeader}>
                <Ionicons name="trending-up" size={32} color={Colors.glucoseGood} />
                <Text style={[styles.statTitle, { color: Colors.glucoseGood }]}>IN TARGET</Text>
            </View>
            <View style={styles.statValueContainer}>
                <AnimatedInteger
                    value={percentage}
                    duration={500}
                    style={styles.statValue}
                />
                <Text style={styles.statUnit}>%</Text>
            </View>
            <Text style={styles.statDescription}>{getRangeShortLabel(range)}</Text>
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

    // Display value formatting
    const displayValue = Math.round(avgMinutes).toString();
    const sourceLabel = showHealthKit ? 'Apple Health' : 'Manual Entry';

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
                <Text style={[styles.statTitle, { color: '#E55D5D' }]}>ACTIVITY</Text>
            </View>
            <View style={styles.statValueContainer}>
                <Text style={styles.statValue}>{displayValue}</Text>
                <Text style={styles.statUnit}>min/day</Text>
            </View>
            <Text style={styles.statDescription}>
                {isHealthKitAvailable && !isHealthKitAuthorized
                    ? 'Tap to connect'
                    : getRangeShortLabel(range)}
            </Text>
            <Text style={styles.dataSourceLabel}>{sourceLabel}</Text>
        </AnimatedPressable>
    );
}, (prev, next) =>
    prev.range === next.range &&
    prev.activityLogs === next.activityLogs &&
    prev.healthKitMinutes === next.healthKitMinutes &&
    prev.isHealthKitAuthorized === next.isHealthKitAuthorized
);

// Fibre thresholds based on Canada DV (25g/day target)
const FIBRE_TARGET = 25;
const FIBRE_LOW_THRESHOLD = 12.5;

type FibreStatus = 'low' | 'moderate' | 'high';

function getFibreStatus(avgPerDay: number): FibreStatus {
    if (avgPerDay < FIBRE_LOW_THRESHOLD) return 'low';
    if (avgPerDay < FIBRE_TARGET) return 'moderate';
    return 'high';
}

function getFibreStatusColor(status: FibreStatus): string {
    switch (status) {
        case 'high': return '#4CAF50';
        case 'moderate': return '#FF9800';
        case 'low': return '#F44336';
    }
}

// Memoized Fibre Stat Card - shows fibre intake from logged meals
const FibreStatCard = React.memo(({ range, fibreSummary }: {
    range: RangeKey;
    fibreSummary: { avgPerDay: number } | null;
}) => {
    const avgPerDay = fibreSummary?.avgPerDay ?? 0;

    const status = getFibreStatus(avgPerDay);
    const statusColor = getFibreStatusColor(status);
    const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);

    return (
        <View style={styles.statCard}>
            <View style={styles.statHeader}>
                <Text style={styles.broccoliIcon}>🥦</Text>
                <Text style={[styles.statTitle, { color: '#4A9B16' }]}>FIBRE INTAKE</Text>
            </View>
            <View style={styles.statValueContainer}>
                <Text style={[styles.statValue]}>{avgPerDay.toFixed(1)}</Text>
                <Text style={styles.statUnit}>g/day</Text>
            </View>
            <View style={[styles.fibreStatusPill, { backgroundColor: statusColor + '30' }]}>
                <View style={[styles.fibreStatusDot, { backgroundColor: statusColor }]} />
                <Text style={[styles.fibreStatusText, { color: statusColor }]}>{statusLabel}</Text>
            </View>
        </View>
    );
}, (prev, next) => prev.range === next.range && prev.fibreSummary === next.fibreSummary);

// Sleep thresholds based on CDC recommendations (7+ hours for adults)
const SLEEP_TARGET = 7;
const SLEEP_LOW_THRESHOLD = 6;
const SLEEP_ICON_COLOR = '#3494D9'; // Blue color matching the app theme

type SleepStatus = 'poor' | 'fair' | 'good';

function getSleepStatus(avgHours: number): SleepStatus {
    if (avgHours < SLEEP_LOW_THRESHOLD) return 'poor';
    if (avgHours < SLEEP_TARGET) return 'fair';
    return 'good';
}

function getSleepStatusColor(status: SleepStatus): string {
    switch (status) {
        case 'good': return SLEEP_ICON_COLOR;
        case 'fair': return '#FF9800';
        case 'poor': return '#F44336';
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

    const status = getSleepStatus(avgHours);
    const statusColor = getSleepStatusColor(status);

    // Format hours - show whole number like "5" or decimal like "7.5"
    const displayValue = isAuthorized && avgHours > 0
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
                <Text style={[styles.statTitle, { color: SLEEP_ICON_COLOR }]}>SLEEP</Text>
            </View>
            <View style={styles.statValueContainer}>
                <Text style={styles.statValue}>{displayValue}</Text>
                <Text style={styles.statUnit}>hr/night</Text>
            </View>
            <Text style={styles.statDescription}>
                {isAvailable && !isAuthorized
                    ? 'Tap to connect'
                    : getRangeShortLabel(range)}
            </Text>
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
                <Ionicons name="footsteps" size={32} color="#4A90D9" />
                <Text style={[styles.statTitle, { color: '#4A90D9' }]}>STEPS</Text>
            </View>
            <View style={styles.statValueContainer}>
                <Text style={styles.statValue}>{displayValue}</Text>
                <Text style={styles.statUnit}>/day</Text>
            </View>
            <Text style={styles.statDescription}>
                {isAvailable && !isAuthorized
                    ? 'Tap to connect'
                    : getRangeShortLabel(range)}
            </Text>
            <Text style={styles.dataSourceLabel}>Apple Health</Text>
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
            <Ionicons name="heart-circle" size={28} color="#FF375F" />
            <View style={styles.connectHealthContent}>
                <Text style={styles.connectHealthTitle}>Connect Apple Health</Text>
                <Text style={styles.connectHealthSubtitle}>Track steps, activity, and sleep</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#878787" />
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
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: '#1A1B1C',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        paddingBottom: 40,
    },
    handle: {
        width: 36,
        height: 4,
        backgroundColor: '#3F4243',
        borderRadius: 2,
        alignSelf: 'center',
        marginBottom: 20,
    },
    title: {
        fontFamily: fonts.semiBold,
        fontSize: 20,
        color: '#FFFFFF',
        marginBottom: 8,
    },
    subtitle: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#878787',
        marginBottom: 16,
    },
    input: {
        backgroundColor: '#232527',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        padding: 16,
        fontFamily: fonts.regular,
        fontSize: 16,
        color: '#E7E8E9',
        minHeight: 80,
    },
    analyzeButton: {
        backgroundColor: '#26A861',
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 20,
    },
    analyzeButtonDisabled: {
        backgroundColor: '#3F4243',
    },
    analyzeButtonText: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: '#FFFFFF',
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
function SwipeableTipCards({ onMealPress, onExercisePress }: {
    onMealPress: () => void;
    onExercisePress: () => void;
}) {
    const [activeIndex, setActiveIndex] = useState(0);
    const slideAnim = React.useRef(new Animated.Value(0)).current;

    const cards = [
        {
            image: Images.mascots.cook,
            text: 'Planning your next lunch?',
            linkText: 'Tap to check impact',
            onPress: onMealPress,
        },
        {
            image: Images.mascots.exercise,
            text: 'Planning your next exercise?',
            linkText: 'Tap to check impact',
            onPress: onExercisePress,
        },
    ];

    const handleSwipe = (direction: 'left' | 'right') => {
        const nextIndex = direction === 'left'
            ? (activeIndex + 1) % cards.length
            : (activeIndex - 1 + cards.length) % cards.length;

        // Animate card shuffle horizontally
        Animated.sequence([
            Animated.timing(slideAnim, {
                toValue: direction === 'left' ? -30 : 30,
                duration: 100,
                useNativeDriver: true,
            }),
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
            }),
        ]).start();

        setActiveIndex(nextIndex);
    };

    const panResponder = React.useMemo(() =>
        PanResponder.create({
            onStartShouldSetPanResponder: () => false,
            onMoveShouldSetPanResponder: (_, gestureState) => {
                // Only respond to horizontal swipes
                return Math.abs(gestureState.dx) > 15 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
            },
            onPanResponderRelease: (_, gestureState) => {
                if (gestureState.dx < -50) {
                    handleSwipe('left');
                } else if (gestureState.dx > 50) {
                    handleSwipe('right');
                }
            },
        }),
        [activeIndex]);

    const currentCard = cards[activeIndex];

    return (
        <View style={styles.tipCardsWrapper}>
            <Animated.View
                {...panResponder.panHandlers}
                style={[
                    styles.tipCardContainer,
                    { transform: [{ translateX: slideAnim }] }
                ]}
            >
                <TouchableOpacity
                    style={styles.tipCardTouchable}
                    onPress={currentCard.onPress}
                    activeOpacity={0.8}
                >
                    <View style={styles.tipCardShadow} />
                    <View style={styles.tipCard}>
                        <Image source={currentCard.image} style={{ width: 56, height: 56, resizeMode: 'contain' }} />
                        <Text style={styles.tipText}>
                            {currentCard.text} <Text style={styles.tipLink}>{currentCard.linkText}</Text>
                        </Text>
                    </View>
                </TouchableOpacity>
            </Animated.View>

            {/* Dots indicator */}
            <View style={styles.dotsContainer}>
                {cards.map((_, index) => (
                    <View
                        key={index}
                        style={[
                            styles.dot,
                            index === activeIndex && styles.dotActive
                        ]}
                    />
                ))}
            </View>
        </View>
    );
}
// Meal Card Component with Mini Chart
// const MINI_CHART_WIDTH = 280;
const MINI_CHART_HEIGHT = 130;


export default function TodayScreen() {
    const { profile, user } = useAuth();
    const glucoseUnit = useGlucoseUnit();
    const [isFabOpen, setIsFabOpen] = useState(false);
    const [range, setRange] = useState<RangeKey>('30d');
    const [spikeSheetVisible, setSpikeSheetVisible] = useState(false);
    const [exerciseSheetVisible, setExerciseSheetVisible] = useState(false);
    const overlayOpacity = React.useRef(new Animated.Value(0)).current;
    const fabRef = React.useRef<AnimatedFABRef>(null);

    // Use unified data fetching hook - batches all queries
    const { glucoseLogs, activityLogs, fibreSummary, recentMeals, isLoading } = useTodayScreenData(range);
    const { targetMin, targetMax } = useGlucoseTargetRange();

    // Fetch sleep data from HealthKit
    const { data: sleepData, refetch: refetchSleep } = useSleepData(range);

    // Fetch daily context (steps, active minutes) from HealthKit
    const dateRange = getDateRange(range);
    const dailyContext = useDailyContext(user?.id, dateRange.startDate, dateRange.endDate);

    // Check if user is in wearables_only mode
    const isWearablesOnly = profile?.tracking_mode === 'wearables_only';

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


    // Process meal reviews - show completed ones
    const displayMeals = useMemo(() => {
        if (!user?.id) return [];
        return recentMeals || [];
    }, [user?.id, recentMeals]);

    const handleMealPress = (meal: MealWithCheckin) => {
        router.push({
            pathname: '/meal-checkin',
            params: { mealId: meal.id, mealName: meal.name }
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

    return (
        <AnimatedScreen>
            <View style={styles.container}>
                {/* Background gradient that blends with status bar */}
                <LinearGradient
                    colors={['#1a1f24', '#181c20', '#111111']}
                    locations={[0, 0.3, 1]}
                    style={styles.backgroundGradient}
                />
                <SafeAreaView edges={['top']} style={styles.safeArea}>
                    {/* Header */}
                    <View style={styles.header}>
                        <AnimatedPressable style={styles.avatarButton} onPress={() => router.push('/settings')}>
                            <Text style={styles.avatarText}>{getInitials()}</Text>
                        </AnimatedPressable>
                        <Text style={styles.headerTitle}>GLUCO</Text>
                        <AnimatedPressable style={styles.notificationButton} onPress={() => router.push('/notifications-list')}>
                            <Ionicons name="notifications-outline" size={24} color="#E7E8E9" />
                        </AnimatedPressable>
                    </View>

                    <ScrollView
                        style={styles.scrollView}
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                        stickyHeaderIndices={[0]}
                    >
                        {/* Sticky Range Picker - at top */}
                        <View style={styles.stickyPickerContainer}>
                            <SegmentedControl<RangeKey>
                                value={range}
                                onChange={setRange}
                                options={[
                                    { value: '7d', label: '7d' },
                                    { value: '14d', label: '14d' },
                                    { value: '30d', label: '30d' },
                                    { value: '90d', label: '90d' },
                                ]}
                            />
                        </View>

                        {/* Glucose Trends - only show for glucose tracking users */}
                        {showGlucoseUI && (
                            <View style={styles.trendsSection}>
                                <GlucoseTrendsCard range={range} allLogs={glucoseLogs} isLoading={isLoading} glucoseUnit={glucoseUnit} />
                            </View>
                        )}

                        {/* Active Experiment Widget */}
                        <ActiveExperimentWidget />

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

                        {/* Tip Cards - Swipeable */}
                        <SwipeableTipCards
                            onMealPress={() => setSpikeSheetVisible(true)}
                            onExercisePress={() => setExerciseSheetVisible(true)}
                        />

                        {/* Personal Insights Carousel */}
                        <PersonalInsightsCarousel
                            insights={personalInsights}
                            isLoading={insightsLoading}
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
                </SafeAreaView>
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
        backgroundColor: '#111111',
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
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 16,
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
        paddingVertical: 6,
        marginBottom: 0,
    },
    trendsCard: {
        backgroundColor: '#22282C',
        borderRadius: 24,
        paddingHorizontal: 16,
        paddingTop: 20,
        paddingBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
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
        color: '#878787',
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
    fibreStatusPill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 10,
        marginTop: 4,
        alignSelf: 'flex-start',
    },
    fibreStatusDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        marginRight: 5,
    },
    fibreStatusText: {
        fontFamily: fonts.medium,
        fontSize: 11,
    },
    tipCardContainer: {
        position: 'relative',
        marginBottom: 16,
    },
    tipCardShadow: {
        position: 'absolute',
        top: 22,
        left: 12,
        right: 12,
        height: 79,
        backgroundColor: '#22282C',
        borderRadius: 16,
    },
    tipCard: {
        backgroundColor: '#3A4246',
        borderRadius: 16,
        padding: 16,
        gap: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
    },
    tipText: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: Colors.textPrimary,
        lineHeight: 14 * 1.2,
    },
    tipLink: {
        color: '#3494D9',
    },
    // Swipeable tip cards styles
    tipCardsWrapper: {
        marginBottom: 16,
    },
    tipCardTouchable: {
        // No additional styles needed, uses tipCardContainer
    },
    dotsContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
        marginTop: 12,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#3F4243',
    },
    dotActive: {
        backgroundColor: '#FFFFFF',
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
        backgroundColor: '#878787',
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
        color: '#878787',
    },
    mealTime: {
        fontFamily: fonts.medium,
        fontSize: 12,
        color: '#878787',
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
        backgroundColor: 'rgba(99, 181, 27, 0.15)',
        borderWidth: 0.25,
        borderColor: '#63B51B',
        borderRadius: 28,
        paddingHorizontal: 12,
        paddingVertical: 4,
    },
    statusBadgeText: {
        fontFamily: fonts.bold,
        fontSize: 12,
        color: '#63B51B',
    },
    statusDescription: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: Colors.textPrimary,
    },
    fabContainer: {
        position: 'absolute',
        right: 16,
        bottom: 140,
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
        color: '#878787',
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
        color: '#878787',
        textAlign: 'center',
        paddingHorizontal: 32,
    },
    // Wearables-only mode styles
    dataSourceLabel: {
        fontFamily: fonts.regular,
        fontSize: 10,
        color: '#666',
        marginTop: 4,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    connectHealthCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 55, 95, 0.1)',
        borderRadius: 12,
        padding: 16,
        marginHorizontal: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 55, 95, 0.2)',
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
        color: '#878787',
        marginTop: 2,
    },
});
