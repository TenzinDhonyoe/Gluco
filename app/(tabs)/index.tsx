import { AnimatedFAB, type AnimatedFABRef } from '@/components/animated-fab';
import { AnimatedInteger, AnimatedNumber } from '@/components/animated-number';
import { AnimatedScreen } from '@/components/animated-screen';
import { GlucoseTrendChart, type TrendPoint } from '@/components/glucose-trend-chart';
import { SegmentedControl } from '@/components/segmented-control';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { FibreRange, getActivityLogsByDateRange, getFibreIntakeSummary, getGlucoseLogsByDateRange, getUserProfile, GlucoseLog } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type RangeKey = '24h' | '7d' | '14d' | '30d' | '90d';

const TARGET_MIN_MMOL = 3.9;
const TARGET_MAX_MMOL = 10.0;

function seededRandom(seed: number) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
}

function formatAvg(value: number) {
    return value.toFixed(1);
}

function getRangeLabel(range: RangeKey) {
    switch (range) {
        case '24h':
            return '24 hour average';
        case '7d':
            return '7 day average';
        case '14d':
            return '14 day average';
        case '30d':
            return '30 day average';
        case '90d':
            return '90 day average';
    }
}

function getRangeDays(range: RangeKey): number {
    switch (range) {
        case '24h': return 1;
        case '7d': return 7;
        case '14d': return 14;
        case '30d': return 30;
        case '90d': return 90;
    }
}

function getRangeShortLabel(range: RangeKey): string {
    switch (range) {
        case '24h': return 'Last 24h';
        case '7d': return 'Last 7d';
        case '14d': return 'Last 14d';
        case '30d': return 'Last 30d';
        case '90d': return 'Last 90d';
    }
}

function computeAverage(points: TrendPoint[]) {
    if (points.length === 0) return 0;
    const sum = points.reduce((acc, p) => acc + p.value, 0);
    return sum / points.length;
}

function getStatus(avg: number, min: number = TARGET_MIN_MMOL, max: number = TARGET_MAX_MMOL) {
    const isGood = avg >= min && avg <= max;
    return {
        isGood,
        label: isGood ? 'In range' : 'Out of range',
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

// Get date range for data fetching
function getDateRange(range: RangeKey): { startDate: Date; endDate: Date } {
    const now = new Date();
    const endDate = new Date(now);
    let startDate: Date;

    switch (range) {
        case '24h':
            startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            break;
        case '7d':
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 7);
            break;
        case '14d':
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 14);
            break;
        case '30d':
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 30);
            break;
        case '90d':
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 90);
            break;
        default:
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 30);
    }

    return { startDate, endDate };
}

function GlucoseTrendsCard({ range, onRangeChange }: { range: RangeKey; onRangeChange: (range: RangeKey) => void }) {
    const { user } = useAuth();
    const [allLogs, setAllLogs] = React.useState<GlucoseLog[]>([]);
    const [isInitialLoading, setIsInitialLoading] = React.useState(true);
    const [targetMin, setTargetMin] = React.useState(TARGET_MIN_MMOL);
    const [targetMax, setTargetMax] = React.useState(TARGET_MAX_MMOL);

    // Fetch all logs and user's target range
    const fetchData = useCallback(async () => {
        if (!user) {
            setIsInitialLoading(false);
            return;
        }

        // Fetch user profile for target range
        const profile = await getUserProfile(user.id);
        if (profile) {
            setTargetMin(profile.target_min ?? TARGET_MIN_MMOL);
            setTargetMax(profile.target_max ?? TARGET_MAX_MMOL);
        }

        // Fetch 180 days to support 90d range + previous period comparison
        const now = new Date();
        const startDate = new Date(now);
        startDate.setDate(now.getDate() - 180);
        const fetchedLogs = await getGlucoseLogsByDateRange(user.id, startDate, now);
        setAllLogs(fetchedLogs);
        setIsInitialLoading(false);
    }, [user]);

    // Fetch on mount
    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Refresh when screen comes into focus
    useFocusEffect(
        useCallback(() => {
            fetchData();
        }, [fetchData])
    );

    // Filter logs based on selected range and transform to chart data
    // Transform logs to chart data with raw points and trend line
    const chartData = React.useMemo(() => {
        const { startDate, endDate } = getDateRange(range);
        const filteredLogs = allLogs.filter(log => {
            const logDate = new Date(log.logged_at);
            return logDate >= startDate && logDate <= endDate;
        });
        return transformLogsToChartData(filteredLogs, range);
    }, [allLogs, range]);

    const { rawPoints, trendPoints } = chartData;

    // Calculate current period average from raw points
    const avg = React.useMemo(() => computeAverage(rawPoints), [rawPoints]);

    // Calculate delta vs previous period
    const delta = React.useMemo(() => {
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

    const status = React.useMemo(() => getStatus(avg, targetMin, targetMax), [avg, targetMin, targetMax]);
    const hasData = rawPoints.length > 0;

    // Format delta string
    const deltaString = React.useMemo(() => {
        if (delta === null || !hasData) return null;
        const sign = delta >= 0 ? '+' : '';
        return `${sign}${delta.toFixed(1)} vs prev ${getRangeDays(range)}d`;
    }, [delta, hasData, range]);

    return (
        <View style={styles.trendsCard}>
            <View style={styles.trendsHeaderRow}>
                <View style={styles.trendsHeaderLeft}>
                    <View style={styles.avgRow}>
                        {isInitialLoading ? (
                            <ActivityIndicator size="small" color="#878787" />
                        ) : hasData ? (
                            <>
                                <AnimatedNumber
                                    value={avg}
                                    duration={600}
                                    style={styles.avgValue}
                                />
                                <Text style={styles.avgUnit}>mmol/L</Text>
                            </>
                        ) : (
                            <>
                                <Text style={styles.avgValue}>--</Text>
                                <Text style={styles.avgUnit}>mmol/L</Text>
                            </>
                        )}
                    </View>
                    <Text style={styles.avgSubtitle}>{getRangeLabel(range)}</Text>
                </View>

                {hasData && !isInitialLoading && (
                    <View style={[styles.statusPill, { backgroundColor: status.bg, borderColor: status.color }]}>
                        <View style={[styles.statusDot, { backgroundColor: status.color }]} />
                        <Text style={[styles.statusText, { color: status.color }]}>
                            {status.label} ({targetMin}–{targetMax})
                        </Text>
                    </View>
                )}
            </View>

            <View style={styles.chartBlock}>
                {isInitialLoading ? (
                    <View style={styles.chartLoading}>
                        <ActivityIndicator size="large" color="#3494D9" />
                    </View>
                ) : hasData ? (
                    <GlucoseTrendChart
                        rawData={rawPoints}
                        trendData={trendPoints}
                        height={200}
                        targetLow={targetMin}
                        targetHigh={targetMax}
                    />
                ) : (
                    <View style={styles.chartEmpty}>
                        <Ionicons name="analytics-outline" size={40} color="#878787" />
                        <Text style={styles.chartEmptyText}>No glucose data for this period</Text>
                        <Text style={styles.chartEmptySubtext}>Log your glucose levels to see trends</Text>
                    </View>
                )}
            </View>
        </View>
    );
}

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

// CGM Connection Card
function CGMConnectionCard() {
    const { user } = useAuth();
    const [isConnected, setIsConnected] = React.useState(false);
    const [isSyncing, setIsSyncing] = React.useState(false);

    // Check connection status on mount
    React.useEffect(() => {
        const checkStatus = async () => {
            if (!user) return;
            try {
                // Dynamic import to avoid issues if dexcom module not ready
                const { getDexcomStatus } = await import('@/lib/dexcom');
                const status = await getDexcomStatus();
                setIsConnected(status.connected);
            } catch (error) {
                console.log('Dexcom status check failed:', error);
            }
        };
        checkStatus();
    }, [user]);

    const handlePress = () => {
        router.push('/connect-dexcom' as never);
    };

    const handleSync = async () => {
        setIsSyncing(true);
        try {
            const { syncDexcom } = await import('@/lib/dexcom');
            await syncDexcom(24);
        } catch (error) {
            console.log('Sync failed:', error);
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <TouchableOpacity
            style={styles.cgmCard}
            onPress={handlePress}
            activeOpacity={0.8}
        >
            <View style={styles.cgmCardContent}>
                <View style={styles.cgmIconContainer}>
                    <Ionicons
                        name={isConnected ? 'checkmark-circle' : 'bluetooth'}
                        size={28}
                        color={isConnected ? '#4CAF50' : '#3494D9'}
                    />
                </View>
                <View style={styles.cgmTextContainer}>
                    <Text style={styles.cgmCardTitle}>
                        {isConnected ? 'Dexcom Connected' : 'Connect Your CGM'}
                    </Text>
                    <Text style={styles.cgmCardSubtitle}>
                        {isConnected
                            ? 'Tap to manage or sync'
                            : 'Import glucose readings automatically'}
                    </Text>
                </View>
                {isConnected ? (
                    <TouchableOpacity
                        style={styles.cgmSyncButton}
                        onPress={handleSync}
                        disabled={isSyncing}
                    >
                        {isSyncing ? (
                            <ActivityIndicator color="#FFFFFF" size="small" />
                        ) : (
                            <Ionicons name="sync" size={18} color="#FFFFFF" />
                        )}
                    </TouchableOpacity>
                ) : (
                    <Ionicons name="chevron-forward" size={20} color="#878787" />
                )}
            </View>
        </TouchableOpacity>
    );
}

// Spike threshold - readings above this are considered a spike (mmol/L)
const SPIKE_THRESHOLD = 10.0;
// In Range Stat Card - calculates % of days where glucose was in target range
function DaysInRangeCard({ range }: { range: RangeKey }) {
    const { user } = useAuth();
    const [percentage, setPercentage] = React.useState<number>(0);
    const [isLoading, setIsLoading] = React.useState(true);

    const fetchInRangePercentage = useCallback(async () => {
        if (!user) {
            setIsLoading(false);
            return;
        }

        // Fetch user profile for target range
        const profile = await getUserProfile(user.id);
        const minTarget = profile?.target_min ?? TARGET_MIN_MMOL;
        const maxTarget = profile?.target_max ?? TARGET_MAX_MMOL;

        const { startDate, endDate } = getDateRange(range);
        const logs = await getGlucoseLogsByDateRange(user.id, startDate, endDate);

        // Group logs by day and check if daily average is in range
        const dailyData: { [dateKey: string]: number[] } = {};

        logs.forEach(log => {
            const logDate = new Date(log.logged_at);
            const dateKey = logDate.toISOString().split('T')[0];
            if (!dailyData[dateKey]) dailyData[dateKey] = [];
            dailyData[dateKey].push(log.glucose_level);
        });

        // Count days where average was in range
        let inRangeCount = 0;
        const daysWithData = Object.keys(dailyData);

        daysWithData.forEach(dateKey => {
            const dayValues = dailyData[dateKey];
            const dayAvg = dayValues.reduce((a, b) => a + b, 0) / dayValues.length;
            if (dayAvg >= minTarget && dayAvg <= maxTarget) {
                inRangeCount++;
            }
        });

        // Calculate percentage
        const pct = daysWithData.length > 0
            ? Math.round((inRangeCount / daysWithData.length) * 100)
            : 0;
        setPercentage(pct);
        setIsLoading(false);
    }, [user, range]);

    useEffect(() => {
        fetchInRangePercentage();
    }, [fetchInRangePercentage]);

    useFocusEffect(
        useCallback(() => {
            fetchInRangePercentage();
        }, [fetchInRangePercentage])
    );

    return (
        <View style={styles.statCard}>
            <View style={styles.statHeader}>
                <Ionicons name="trending-up" size={32} color={Colors.glucoseGood} />
                <Text style={[styles.statTitle, { color: Colors.glucoseGood }]}>IN RANGE</Text>
            </View>
            <View style={styles.statValueContainer}>
                {isLoading ? (
                    <ActivityIndicator size="small" color={Colors.glucoseGood} />
                ) : (
                    <>
                        <AnimatedInteger
                            value={percentage}
                            duration={500}
                            style={styles.statValue}
                        />
                        <Text style={styles.statUnit}>%</Text>
                    </>
                )}
            </View>
            <Text style={styles.statDescription}>{getRangeShortLabel(range)}</Text>
        </View>
    );
}

// Activity Stat Card - shows total activity duration from logged activities
function ActivityStatCard({ range }: { range: RangeKey }) {
    const { user } = useAuth();
    const [totalMinutes, setTotalMinutes] = React.useState<number>(0);
    const [isLoading, setIsLoading] = React.useState(true);

    const fetchActivityData = useCallback(async () => {
        if (!user) {
            setIsLoading(false);
            return;
        }

        const { startDate, endDate } = getDateRange(range);
        const logs = await getActivityLogsByDateRange(user.id, startDate, endDate);

        // Sum up all activity duration in minutes
        const total = logs.reduce((sum, log) => sum + log.duration_minutes, 0);
        setTotalMinutes(total);
        setIsLoading(false);
    }, [user, range]);

    useEffect(() => {
        fetchActivityData();
    }, [fetchActivityData]);

    useFocusEffect(
        useCallback(() => {
            fetchActivityData();
        }, [fetchActivityData])
    );

    // Format minutes as hours if over 60
    const formatDuration = (minutes: number) => {
        if (minutes >= 60) {
            const hours = Math.floor(minutes / 60);
            const mins = minutes % 60;
            return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
        }
        return `${minutes}`;
    };

    return (
        <View style={styles.statCard}>
            <View style={styles.statHeader}>
                <Ionicons name="flame" size={32} color="#E55D5D" />
                <Text style={[styles.statTitle, { color: '#E55D5D' }]}>ACTIVITY</Text>
            </View>
            <View style={styles.statValueContainer}>
                {isLoading ? (
                    <ActivityIndicator size="small" color="#E55D5D" />
                ) : (
                    <>
                        <Text style={styles.statValue}>{formatDuration(totalMinutes)}</Text>
                        {totalMinutes < 60 && <Text style={styles.statUnit}>mins</Text>}
                    </>
                )}
            </View>
            <Text style={styles.statDescription}>{getRangeShortLabel(range)}</Text>
        </View>
    );
}

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

// Fibre Stat Card - shows fibre intake from logged meals
function FibreStatCard({ range }: { range: RangeKey }) {
    const { user } = useAuth();
    const [avgPerDay, setAvgPerDay] = React.useState<number>(0);
    const [isLoading, setIsLoading] = React.useState(true);

    // Map RangeKey to FibreRange
    const getFibreRange = (r: RangeKey): FibreRange => {
        switch (r) {
            case '24h': return 'today';
            case '7d': return 'week';
            case '14d':
            case '30d':
            case '90d': return 'month';
        }
    };

    const fetchFibreData = useCallback(async () => {
        if (!user) {
            setIsLoading(false);
            return;
        }

        const fibreRange = getFibreRange(range);
        const summary = await getFibreIntakeSummary(user.id, fibreRange);

        if (summary) {
            setAvgPerDay(summary.avgPerDay);
        } else {
            setAvgPerDay(0);
        }
        setIsLoading(false);
    }, [user, range]);

    useEffect(() => {
        setIsLoading(true);
        fetchFibreData();
    }, [fetchFibreData]);

    useFocusEffect(
        useCallback(() => {
            fetchFibreData();
        }, [fetchFibreData])
    );

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
                {isLoading ? (
                    <ActivityIndicator size="small" color="#4A9B16" />
                ) : (
                    <>
                        <Text style={[styles.statValue]}>{avgPerDay.toFixed(1)}</Text>
                        <Text style={styles.statUnit}>g/day</Text>
                    </>
                )}
            </View>
            <View style={[styles.fibreStatusPill, { backgroundColor: statusColor + '30' }]}>
                <View style={[styles.fibreStatusDot, { backgroundColor: statusColor }]} />
                <Text style={[styles.fibreStatusText, { color: statusColor }]}>{statusLabel}</Text>
            </View>
        </View>
    );
}

// High Exposure threshold for prediabetes (post-meal concern level)
const HIGH_EXPOSURE_THRESHOLD = 7.8;

// High Exposure Stat Card - shows % of readings above 7.8 mmol/L
function HighExposureCard({ range }: { range: RangeKey }) {
    const { user } = useAuth();
    const [exposurePercent, setExposurePercent] = React.useState<number>(0);
    const [isLoading, setIsLoading] = React.useState(true);

    const fetchExposure = useCallback(async () => {
        if (!user) {
            setIsLoading(false);
            return;
        }

        const { startDate, endDate } = getDateRange(range);
        const logs = await getGlucoseLogsByDateRange(user.id, startDate, endDate);

        if (logs.length === 0) {
            setExposurePercent(0);
            setIsLoading(false);
            return;
        }

        // Count readings above 7.8 mmol/L
        const aboveThreshold = logs.filter(log => log.glucose_level > HIGH_EXPOSURE_THRESHOLD).length;
        const percent = Math.round((aboveThreshold / logs.length) * 100);
        setExposurePercent(percent);
        setIsLoading(false);
    }, [user, range]);

    useEffect(() => {
        fetchExposure();
    }, [fetchExposure]);

    useFocusEffect(
        useCallback(() => {
            fetchExposure();
        }, [fetchExposure])
    );

    // Color based on exposure level
    const getExposureColor = (percent: number) => {
        if (percent <= 15) return Colors.glucoseGood;
        if (percent <= 30) return '#CAA163'; // Warning/amber
        return Colors.glucoseHigh;
    };

    const color = getExposureColor(exposurePercent);

    return (
        <View style={styles.statCard}>
            <View style={styles.statHeader}>
                <Ionicons name="warning" size={32} color={color} />
                <Text style={[styles.statTitle, { color }]}>ABOVE 7.8</Text>
            </View>
            <View style={styles.statValueContainer}>
                {isLoading ? (
                    <ActivityIndicator size="small" color={color} />
                ) : (
                    <>
                        <AnimatedInteger
                            value={exposurePercent}
                            duration={500}
                            style={styles.statValue}
                        />
                        <Text style={styles.statUnit}>%</Text>
                    </>
                )}
            </View>
            <Text style={styles.statDescription}>{getRangeShortLabel(range)}</Text>
        </View>
    );
}

// Tip Card Component
function TipCard() {
    return (
        <View style={styles.tipCardContainer}>
            <View style={styles.tipCardShadow} />
            <View style={styles.tipCard}>
                <Ionicons name="bulb" size={24} color="#CAA163" />
                <Text style={styles.tipText}>
                    Planning your next lunch? <Text style={styles.tipLink}>Tap to check spike risk</Text>
                </Text>
            </View>
        </View>
    );
}

// Meal Card Component
function MealCard({ mealType, mealName, time, peakValue, status, statusText }: {
    mealType: string;
    mealName: string;
    time: string;
    peakValue: number;
    status: 'good' | 'warning' | 'bad';
    statusText: string;
}) {
    return (
        <View style={styles.mealCard}>
            {/* Header */}
            <View style={styles.mealHeader}>
                <View style={styles.mealIconContainer}>
                    <Ionicons name="restaurant" size={24} color="#E7E8E9" />
                </View>
                <View style={styles.mealInfo}>
                    <View style={styles.mealMetaRow}>
                        <Text style={styles.mealType}>{mealType}</Text>
                        <Text style={styles.mealTime}>{time}</Text>
                    </View>
                    <Text style={styles.mealName}>{mealName}</Text>
                </View>
            </View>

            {/* Chart placeholder */}
            <View style={styles.chartContainer}>
                <View style={styles.chartPlaceholder}>
                    <Text style={styles.chartLabel}>mmol/L</Text>
                    <View style={styles.chartArea}>
                        {/* Simplified chart representation */}
                        <View style={styles.chartLine} />
                        <View style={styles.chartLegend}>
                            <View style={styles.legendItem}>
                                <View style={[styles.legendDot, { backgroundColor: '#3494D9' }]} />
                                <Text style={styles.legendText}>Actual</Text>
                            </View>
                            <View style={styles.legendItem}>
                                <View style={[styles.legendDot, { backgroundColor: '#DB7B32' }]} />
                                <Text style={styles.legendText}>Predicted</Text>
                            </View>
                        </View>
                    </View>
                </View>
            </View>

            {/* Status */}
            <View style={styles.mealStatus}>
                <View style={styles.statusBadge}>
                    <Text style={styles.statusBadgeText}>Mild Elevation</Text>
                </View>
                <Text style={styles.statusDescription}>
                    Peaked at {peakValue} mmol/L - smoother than expected
                </Text>
            </View>
        </View>
    );
}

export default function TodayScreen() {
    const { profile } = useAuth();
    const [isFabOpen, setIsFabOpen] = useState(false);
    const [range, setRange] = useState<RangeKey>('30d'); // Shared range state for all stat cards
    const overlayOpacity = React.useRef(new Animated.Value(0)).current;
    const fabRef = React.useRef<AnimatedFABRef>(null);

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
                        <TouchableOpacity style={styles.avatarButton} onPress={() => router.push('/settings')}>
                            <Text style={styles.avatarText}>{getInitials()}</Text>
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>GLUCO</Text>
                        <TouchableOpacity style={styles.notificationButton}>
                            <Ionicons name="notifications-outline" size={24} color="#E7E8E9" />
                        </TouchableOpacity>
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

                        <View style={styles.trendsSection}>
                            <GlucoseTrendsCard range={range} onRangeChange={setRange} />
                        </View>

                        {/* Stats Grid */}
                        <View style={styles.statsGrid}>
                            <View style={styles.statsRow}>
                                <DaysInRangeCard range={range} />
                                <FibreStatCard range={range} />
                            </View>
                            <View style={styles.statsRow}>
                                <ActivityStatCard range={range} />
                                <StatCard
                                    icon={<Ionicons name="moon" size={32} color="#3494D9" />}
                                    iconColor="#3494D9"
                                    title="SLEEP"
                                    value="6.5"
                                    unit="h avg"
                                    description={getRangeShortLabel(range)}
                                />
                            </View>
                        </View>

                        {/* Tip Card */}
                        <TipCard />

                        {/* Page indicator */}
                        <View style={styles.pageIndicator}>
                            <View style={[styles.indicatorDot, styles.indicatorDotActive]} />
                            <View style={styles.indicatorDot} />
                        </View>

                        {/* Meal Cards */}
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            style={styles.mealCardsScroll}
                            contentContainerStyle={styles.mealCardsContainer}
                        >
                            <MealCard
                                mealType="Breakfast"
                                mealName="Butter chicken with butter naan"
                                time="08:10"
                                peakValue={8.4}
                                status="good"
                                statusText="Mild Elevation"
                            />
                            <MealCard
                                mealType="Breakfast"
                                mealName="Butter chicken with butter naan"
                                time="08:10"
                                peakValue={8.4}
                                status="good"
                                statusText="Mild Elevation"
                            />
                        </ScrollView>
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
                                router.push({ pathname: '/log-meal' } as any);
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
        </AnimatedScreen>
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
        lineHeight: 28 * 0.95,
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
    mealCardsScroll: {
        marginHorizontal: -16,
    },
    mealCardsContainer: {
        paddingHorizontal: 16,
        gap: 16,
    },
    mealCard: {
        width: 345,
        backgroundColor: '#22282C',
        borderRadius: 16,
        padding: 16,
        gap: 24,
        shadowColor: '#E7E8E9',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.1,
        shadowRadius: 1,
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
    // CGM Connection Card
    cgmCard: {
        backgroundColor: 'rgba(63, 66, 67, 0.25)',
        borderRadius: 12,
        marginHorizontal: 16,
        marginBottom: 16,
    },
    cgmCardContent: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
    },
    cgmIconContainer: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(52, 148, 217, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    cgmTextContainer: {
        flex: 1,
    },
    cgmCardTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 15,
        color: Colors.textPrimary,
        marginBottom: 2,
    },
    cgmCardSubtitle: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: '#878787',
    },
    cgmSyncButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#3494D9',
        justifyContent: 'center',
        alignItems: 'center',
    },
});

