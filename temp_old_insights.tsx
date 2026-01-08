import { AnimatedScreen } from '@/components/animated-screen';
import { MealResponseMiniChart } from '@/components/meal-response-mini-chart';
import { SegmentedControl } from '@/components/segmented-control';
import { useAuth, useGlucoseUnit } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import {
    getGlucoseLogsByDateRange,
    getPostMealReviewsByDateRange,
    getSuggestedExperiments,
    getUserExperiments,
    invokeWeeklyMealComparisonDrivers,
    PostMealReview,
    startUserExperiment,
    SuggestedExperiment,
    UserExperiment,
} from '@/lib/supabase';
import { formatGlucoseWithUnit, GlucoseUnit } from '@/lib/utils/glucoseUnits';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { G, Path } from 'react-native-svg';

type TabKey = 'weekly' | 'trends' | 'experiments';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Time periods for Time of Day analysis
const TIME_PERIODS = [
    { key: 'morning', label: 'Morning', start: 5, end: 12, color: '#3494D9' },
    { key: 'afternoon', label: 'Afternoon', start: 12, end: 17, color: '#3494D9' },
    { key: 'evening', label: 'Evening', start: 17, end: 21, color: '#3494D9' },
    { key: 'night', label: 'Night', start: 21, end: 5, color: '#3494D9' },
];

// Glucose response categories
type GlucoseCategory = 'steady' | 'mild' | 'spike';

function categorizeReading(value: number): GlucoseCategory {
    if (value < 6.5) return 'steady';
    if (value < 8.5) return 'mild';
    return 'spike';
}

function getCategoryColor(category: GlucoseCategory): string {
    switch (category) {
        case 'steady': return '#4CAF50';
        case 'mild': return '#3494D9';
        case 'spike': return '#F44336';
    }
}

// Get date range for the last 7 days
function getWeekRange(): { startDate: Date; endDate: Date } {
    const now = new Date();
    const endDate = new Date(now);
    const startDate = new Date(now);
    startDate.setDate(now.getDate() - 7);
    startDate.setHours(0, 0, 0, 0);
    return { startDate, endDate };
}

// Helper function for creating SVG pie chart arc paths
function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
    const angleInRadians = (angleInDegrees * Math.PI) / 180.0;
    return {
        x: centerX + radius * Math.cos(angleInRadians),
        y: centerY + radius * Math.sin(angleInRadians),
    };
}

function describeArc(x: number, y: number, radius: number, startAngle: number, endAngle: number) {
    const start = polarToCartesian(x, y, radius, endAngle);
    const end = polarToCartesian(x, y, radius, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
    return [
        'M', x, y,
        'L', start.x, start.y,
        'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y,
        'Z',
    ].join(' ');
}

// Dynamic Pie Chart Component
function PieChart({ data, size = 120 }: {
    data: { value: number; color: string; label: string }[];
    size?: number;
}) {
    const total = data.reduce((sum, item) => sum + item.value, 0);
    if (total === 0) return null;

    const radius = (size / 2) - 8;
    let currentAngle = -90; // Start from top

    const segments = data.map((item, index) => {
        const percentage = item.value / total;
        const angle = percentage * 360;
        const startAngle = currentAngle;
        const endAngle = currentAngle + angle;
        currentAngle = endAngle;

        if (item.value === 0) return null;

        return (
            <Path
                key={index}
                d={describeArc(0, 0, radius, startAngle, endAngle)}
                fill={item.color}
            />
        );
    });

    return (
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <G transform={`translate(${size / 2}, ${size / 2})`}>
                {segments}
            </G>
        </Svg>
    );
}

// Time of Day Bar Chart Component - matches Figma design exactly
function TimeOfDayChart({ data }: { data: { period: string; avgValue: number }[] }) {
    const chartHeight = 168;
    const barWidth = 56;

    // Glucose zones - each zone is 56px height (168 / 3)
    const zoneHeight = 56;

    // Time labels matching the design
    const timeLabels = ['07:00 AM', '12:00 PM', '04:00 PM', '07:00 PM', '10:00 PM'];

    // Calculate bar heights from average values (zones: 0-6.5 steady, 6.5-8.5 mild, 8.5-12 spike)
    const getBarHeight = (value: number) => {
        // Map glucose value to chart height (3-12 mmol/L range)
        const ZONE_MIN = 3;
        const ZONE_MAX = 12;
        const clampedValue = Math.min(Math.max(value, ZONE_MIN), ZONE_MAX);
        return ((clampedValue - ZONE_MIN) / (ZONE_MAX - ZONE_MIN)) * chartHeight;
    };

    // Map 4 data points to 4 bars (morning, noon, afternoon, evening)
    const chartData = [
        data[0] || { period: 'morning', avgValue: 5 },
        data[1] || { period: 'noon', avgValue: 9 },
        data[2] || { period: 'afternoon', avgValue: 7 },
        data[3] || { period: 'evening', avgValue: 6.5 },
    ];

    return (
        <View style={styles.chartWrapper}>
            <View style={styles.chartContainer}>
                {/* Y-axis labels - rotated text */}
                <View style={[styles.chartYAxis, { height: chartHeight }]}>
                    <View style={styles.chartYLabelRow}>
                        <Text style={styles.chartYLabel}>Spike</Text>
                    </View>
                    <View style={styles.chartYLabelRow}>
                        <Text style={styles.chartYLabel}>Mild</Text>
                        <Text style={styles.chartYLabel}>Elevation</Text>
                    </View>
                    <View style={styles.chartYLabelRow}>
                        <Text style={styles.chartYLabel}>Steady</Text>
                    </View>
                </View>

                {/* Chart area with zone bands and bars */}
                <View style={[styles.chartArea, { height: chartHeight }]}>
                    {/* Zone background bands - stacked from top to bottom */}
                    <View style={styles.zoneBandsContainer}>
                        <View style={[styles.zoneBand, { height: zoneHeight, backgroundColor: 'rgba(188, 47, 48, 0.15)', borderColor: 'rgba(204, 204, 204, 0.1)', borderWidth: 1 }]} />
                        <View style={[styles.zoneBand, { height: zoneHeight, backgroundColor: 'rgba(255, 119, 35, 0.15)', borderColor: 'rgba(204, 204, 204, 0.1)', borderWidth: 1 }]} />
                        <View style={[styles.zoneBand, { height: zoneHeight, backgroundColor: 'rgba(74, 155, 22, 0.15)', borderColor: 'rgba(204, 204, 204, 0.1)', borderWidth: 1 }]} />
                    </View>

                    {/* Bars overlay - positioned at the bottom, growing upward */}
                    <View style={styles.barsContainer}>
                        {chartData.map((d, i) => {
                            const barHeight = getBarHeight(d.avgValue);
                            return (
                                <View key={i} style={styles.barColumn}>
                                    <View style={{ flex: 1 }} />
                                    <View
                                        style={[
                                            styles.bar,
                                            {
                                                height: barHeight,
                                                width: barWidth,
                                                backgroundColor: '#0E9CFF',
                                                borderTopLeftRadius: 8,
                                                borderTopRightRadius: 8,
                                                borderWidth: 0.5,
                                                borderColor: '#111111',
                                            },
                                        ]}
                                    />
                                </View>
                            );
                        })}
                    </View>
                </View>
            </View>

            {/* X-axis labels - below the chart */}
            <View style={styles.chartXLabels}>
                {timeLabels.map((label, i) => (
                    <Text key={i} style={styles.chartXLabelCombined}>{label}</Text>
                ))}
            </View>
        </View>
    );
}


// Weekday vs Weekend Comparison - Progressive meter layout
function WeekdayWeekendComparison({ weekdayData, weekendData }: {
    weekdayData: { steady: number; mild: number; spike: number };
    weekendData: { steady: number; mild: number; spike: number };
}) {
    // Determine the dominant response level (which zone has most readings)
    const getDominantLevel = (data: { steady: number; mild: number; spike: number }): 'steady' | 'mild' | 'spike' => {
        const { steady, mild, spike } = data;
        const total = steady + mild + spike;

        if (total === 0) return 'steady';

        // Calculate weighted average: steady=1, mild=2, spike=3
        const weightedAvg = (steady * 1 + mild * 2 + spike * 3) / total;

        if (weightedAvg < 1.5) return 'steady';
        if (weightedAvg < 2.5) return 'mild';
        return 'spike';
    };

    const renderRow = (data: { steady: number; mild: number; spike: number }, label: string) => {
        const level = getDominantLevel(data);

        // Fill boxes progressively based on level
        const fillSteady = true; // Always fill at least the first box
        const fillMild = level === 'mild' || level === 'spike';
        const fillSpike = level === 'spike';

        return (
            <View style={styles.comparisonGridRow}>
                <Text style={styles.comparisonRowLabel}>{label}</Text>
                <View style={styles.comparisonCell}>
                    <View style={styles.comparisonCellBg}>
                        {fillSteady && <View style={[styles.comparisonCellFill, { width: '100%' }]} />}
                    </View>
                </View>
                <View style={styles.comparisonCell}>
                    <View style={styles.comparisonCellBg}>
                        {fillMild && <View style={[styles.comparisonCellFill, { width: '100%' }]} />}
                    </View>
                </View>
                <View style={styles.comparisonCell}>
                    <View style={styles.comparisonCellBg}>
                        {fillSpike && <View style={[styles.comparisonCellFill, { width: '100%' }]} />}
                    </View>
                </View>
            </View>
        );
    };

    return (
        <View style={styles.comparisonContainer}>
            {/* Column headers */}
            <View style={styles.comparisonGridHeader}>
                <View style={styles.comparisonRowLabelSpacer} />
                <Text style={styles.comparisonColumnHeader}>Steady</Text>
                <View style={styles.comparisonColumnHeaderMulti}>
                    <Text style={styles.comparisonColumnHeader}>Mild</Text>
                    <Text style={styles.comparisonColumnHeader}>Elevation</Text>
                </View>
                <Text style={styles.comparisonColumnHeader}>Spike</Text>
            </View>

            {/* Data rows */}
            {renderRow(weekdayData, 'Weekdays')}
            {renderRow(weekendData, 'Weekend')}
        </View>
    );
}


// Behavioral Impact Item
function BehavioralImpactItem({ title, percentage, color }: { title: string; percentage: number; color: string }) {
    return (
        <View style={styles.impactItem}>
            <Text style={styles.impactTitle}>{title}</Text>
            <Text style={styles.impactPercentage}>{percentage}% steady meal responses</Text>
            <View style={styles.impactBarBg}>
                <View style={[styles.impactBar, { width: `${percentage}%`, backgroundColor: color }]} />
            </View>
        </View>
    );
}

// Meal Comparison Card - shows actual spike data with AI drivers
function MealComparisonCard({
    review,
    spikeDelta,
    drivers,
    driversLoading,
    glucoseUnit,
    type,
}: {
    review: PostMealReview;
    spikeDelta: number;
    drivers: string[];
    driversLoading: boolean;
    glucoseUnit: GlucoseUnit;
    type: 'highest' | 'lowest';
}) {
    const isHighest = type === 'highest';

    // Parse meal time
    const mealDate = review.meal_time ? new Date(review.meal_time) : null;

    // Format time (e.g., "08:10 AM")
    const formattedTime = mealDate
        ? mealDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
        : '';

    // Format date (e.g., "16-11-2025")
    const formattedDate = mealDate
        ? `${mealDate.getDate().toString().padStart(2, '0')}-${(mealDate.getMonth() + 1).toString().padStart(2, '0')}-${mealDate.getFullYear()}`
        : '';

    // Determine badge based on status_tag or spike magnitude
    const getBadgeInfo = () => {
        if (review.status_tag === 'steady') {
            return { bg: 'rgba(99, 181, 27, 0.15)', border: '#63B51B', color: '#63B51B', label: 'Steady' };
        } else if (review.status_tag === 'mild_elevation') {
            return { bg: 'rgba(99, 181, 27, 0.15)', border: '#63B51B', color: '#63B51B', label: 'Mild Elevation' };
        } else if (review.status_tag === 'spike') {
            return { bg: 'rgba(244, 67, 54, 0.15)', border: '#F44336', color: '#F44336', label: 'Spike' };
        }
        // Fallback based on spike delta
        if (spikeDelta < 2) {
            return { bg: 'rgba(99, 181, 27, 0.15)', border: '#63B51B', color: '#63B51B', label: 'Steady' };
        } else if (spikeDelta < 3.5) {
            return { bg: 'rgba(99, 181, 27, 0.15)', border: '#63B51B', color: '#63B51B', label: 'Mild Elevation' };
        }
        return { bg: 'rgba(244, 67, 54, 0.15)', border: '#F44336', color: '#F44336', label: 'Spike' };
    };

    const badge = getBadgeInfo();

    // Generate peak description based on predicted vs actual
    const getPeakDescription = () => {
        const peakValue = review.actual_peak ? formatGlucoseWithUnit(review.actual_peak, glucoseUnit) : '—';
        const predictedPeak = review.predicted_peak;

        if (predictedPeak && review.actual_peak) {
            if (review.actual_peak < predictedPeak - 0.5) {
                return `Peaked at ${peakValue} - smoother than expected`;
            } else if (review.actual_peak > predictedPeak + 0.5) {
                return `Peaked at ${peakValue} - higher than expected`;
            }
            return `Peaked at ${peakValue} - as expected`;
        }
        return `Peaked at ${peakValue}`;
    };

    return (
        <View style={styles.mealCardContent}>
            {/* Meal info */}
            <View style={styles.mealInfoSection}>
                <Text style={styles.mealName}>{review.meal_name || 'Unknown Meal'}</Text>
                <View style={styles.mealDateTimeRow}>
                    <Text style={styles.mealDateTime}>{formattedTime}</Text>
                    <View style={styles.mealDateTimeDot} />
                    <Text style={styles.mealDateTime}>{formattedDate}</Text>
                </View>
            </View>

            {/* Chart section */}
            <View style={styles.mealChartSection}>
                <MealResponseMiniChart
                    actualCurve={review.actual_curve}
                    predictedCurve={review.predicted_curve}
                    mealTime={mealDate}
                    glucoseUnit={glucoseUnit}
                />

                {/* Badge and peak text */}
                <View style={styles.mealStatusSection}>
                    <View style={[styles.mealElevationBadge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
                        <Text style={[styles.mealElevationText, { color: badge.color }]}>
                            {badge.label}
                        </Text>
                    </View>
                    <Text style={styles.mealPeakText}>{getPeakDescription()}</Text>
                </View>
            </View>

            {/* Top Drivers */}
            <View style={styles.mealTopDrivers}>
                <Text style={styles.mealTopDriversTitle}>Top Drivers:</Text>
                <View style={styles.mealDriversList}>
                    {driversLoading ? (
                        <View style={styles.mealDriverItem}>
                            <ActivityIndicator size="small" color="#3494D9" />
                            <Text style={[styles.mealDriverText, { marginLeft: 8 }]}>Generating insights...</Text>
                        </View>
                    ) : drivers.length > 0 ? (
                        drivers.map((driver, index) => (
                            <View key={index} style={styles.mealDriverItem}>
                                <View style={styles.mealDriverBullet} />
                                <Text style={styles.mealDriverText}>{driver}</Text>
                            </View>
                        ))
                    ) : (
                        <View style={styles.mealDriverItem}>
                            <View style={styles.mealDriverBullet} />
                            <Text style={styles.mealDriverText}>
                                {isHighest ? 'Meal composition led to elevated response' : 'Well-balanced meal kept glucose steady'}
                            </Text>
                        </View>
                    )}
                </View>
            </View>
        </View>
    );
}

// Empty state for Meal Comparison section
function MealComparisonEmpty() {
    return (
        <View style={styles.mealComparisonEmpty}>
            <Ionicons name="nutrition-outline" size={48} color="#4A4A4A" />
            <Text style={styles.mealComparisonEmptyTitle}>No Meal Data Yet</Text>
            <Text style={styles.mealComparisonEmptyText}>
                Log meals and complete post-meal reviews to see your highest and lowest spike comparisons here.
            </Text>
        </View>
    );
}

// Helper to compute spike delta from a review
function computeSpikeDelta(review: PostMealReview): number {
    // Prefer stored peak_delta if available
    if (review.peak_delta !== null && review.peak_delta !== undefined) {
        return review.peak_delta;
    }
    // Fallback: compute from actual_curve and baseline_glucose
    if (review.actual_curve && review.actual_curve.length > 0) {
        const peakValue = Math.max(...review.actual_curve.map(p => p.value));
        const baseline = review.baseline_glucose ?? review.actual_curve[0]?.value ?? 5.5;
        return peakValue - baseline;
    }
    // Last resort: use actual_peak with default baseline
    if (review.actual_peak !== null) {
        const baseline = review.baseline_glucose ?? 5.5;
        return review.actual_peak - baseline;
    }
    return 0;
}

export default function InsightsScreen() {
    const { user } = useAuth();
    const glucoseUnit = useGlucoseUnit();
    const [activeTab, setActiveTab] = useState<TabKey>('weekly');
    const [isLoading, setIsLoading] = useState(true);
    const [mealTab, setMealTab] = useState<'highest' | 'lowest'>('highest');

    // Computed data states
    const [timeOfDayData, setTimeOfDayData] = useState<{ period: string; avgValue: number }[]>([]);
    const [weekdayData, setWeekdayData] = useState({ steady: 0, mild: 0, spike: 0 });
    const [weekendData, setWeekendData] = useState({ steady: 0, mild: 0, spike: 0 });
    const [behavioralStats, setBehavioralStats] = useState({
        sleep: 14,
        postMealWalks: 58,
        consistentMealTimes: 28,
    });

    // Meal Comparison states
    const [highestSpikeReview, setHighestSpikeReview] = useState<PostMealReview | null>(null);
    const [lowestSpikeReview, setLowestSpikeReview] = useState<PostMealReview | null>(null);
    const [mealComparisonDrivers, setMealComparisonDrivers] = useState<{
        highest: { drivers: string[] };
        lowest: { drivers: string[] };
    } | null>(null);
    const [driversLoading, setDriversLoading] = useState(false);

    // Experiments states
    const [suggestedExperiments, setSuggestedExperiments] = useState<SuggestedExperiment[]>([]);
    const [activeExperiments, setActiveExperiments] = useState<UserExperiment[]>([]);
    const [experimentsLoading, setExperimentsLoading] = useState(false);
    const [startingExperiment, setStartingExperiment] = useState<string | null>(null);

    // Insights text
    const [timeOfDayInsight, setTimeOfDayInsight] = useState('Mornings had the steadiest responses. Evenings showed the highest rises.');
    const [weekdayInsight, setWeekdayInsight] = useState('Weekdays may be raising your overall glucose average. Try small tweaks like adding fiber or a short post-meal walk.');

    const fetchWeeklyData = useCallback(async () => {
        if (!user) {
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        try {
            const { startDate, endDate } = getWeekRange();
            const logs = await getGlucoseLogsByDateRange(user.id, startDate, endDate);

            // Process time of day data - track values for averaging
            const timeValues: { [key: string]: number[] } = {
                'morning': [],
                'afternoon': [],
                'evening': [],
                'night': [],
            };

            // Process time of day data - track categories for weekday/weekend
            const timeData: { [key: string]: { steady: number; mild: number; spike: number } } = {
                'morning': { steady: 0, mild: 0, spike: 0 },
                'afternoon': { steady: 0, mild: 0, spike: 0 },
                'evening': { steady: 0, mild: 0, spike: 0 },
                'night': { steady: 0, mild: 0, spike: 0 },
            };

            // Process weekday vs weekend
            const weekday = { steady: 0, mild: 0, spike: 0 };
            const weekend = { steady: 0, mild: 0, spike: 0 };

            logs.forEach(log => {
                const logDate = new Date(log.logged_at);
                const hour = logDate.getHours();
                const dayOfWeek = logDate.getDay();
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                const category = categorizeReading(log.glucose_level);

                // Determine time period
                let period = 'night';
                if (hour >= 5 && hour < 12) period = 'morning';
                else if (hour >= 12 && hour < 17) period = 'afternoon';
                else if (hour >= 17 && hour < 21) period = 'evening';

                timeValues[period].push(log.glucose_level);
                timeData[period][category]++;

                if (isWeekend) {
                    weekend[category]++;
                } else {
                    weekday[category]++;
                }
            });

            // Calculate averages per time period
            const calcAvg = (values: number[]) => values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 5;

            setTimeOfDayData([
                { period: 'morning', avgValue: calcAvg(timeValues.morning) },
                { period: 'afternoon', avgValue: calcAvg(timeValues.afternoon) },
                { period: 'evening', avgValue: calcAvg(timeValues.evening) },
                { period: 'night', avgValue: calcAvg(timeValues.night) },
            ]);

            setWeekdayData(weekday);
            setWeekendData(weekend);

            // Generate insights based on data
            const periods = ['morning', 'afternoon', 'evening', 'night'];
            const steadiestPeriod = periods.reduce((best, period) => {
                const current = timeData[period];
                const bestData = timeData[best];
                const currentRatio = current.steady / (current.steady + current.mild + current.spike || 1);
                const bestRatio = bestData.steady / (bestData.steady + bestData.mild + bestData.spike || 1);
                return currentRatio > bestRatio ? period : best;
            }, 'morning');

            const spikiestPeriod = periods.reduce((worst, period) => {
                const current = timeData[period];
                const worstData = timeData[worst];
                const currentRatio = current.spike / (current.steady + current.mild + current.spike || 1);
                const worstRatio = worstData.spike / (worstData.steady + worstData.mild + worstData.spike || 1);
                return currentRatio > worstRatio ? period : worst;
            }, 'morning');

            setTimeOfDayInsight(
                `${steadiestPeriod.charAt(0).toUpperCase() + steadiestPeriod.slice(1)}s had the steadiest responses. ${spikiestPeriod.charAt(0).toUpperCase() + spikiestPeriod.slice(1)}s showed the highest rises.`
            );

            // Fetch post-meal reviews for Meal Comparison section
            const reviews = await getPostMealReviewsByDateRange(user.id, startDate, endDate);

            if (reviews.length > 0) {
                // Compute spike delta for each review and find highest/lowest
                const reviewsWithDelta = reviews.map(r => ({
                    review: r,
                    spikeDelta: computeSpikeDelta(r),
                }));

                // Sort by spike delta (highest first)
                reviewsWithDelta.sort((a, b) => b.spikeDelta - a.spikeDelta);

                const highest = reviewsWithDelta[0]?.review || null;
                const lowest = reviewsWithDelta[reviewsWithDelta.length - 1]?.review || null;

                setHighestSpikeReview(highest);
                setLowestSpikeReview(lowest);

                // Fetch AI drivers if we have both meals
                if (highest && lowest) {
                    setDriversLoading(true);
                    try {
                        const drivers = await invokeWeeklyMealComparisonDrivers(user.id, highest, lowest);
                        setMealComparisonDrivers(drivers);
                    } catch (driverError) {
                        console.error('Error fetching meal comparison drivers:', driverError);
                    } finally {
                        setDriversLoading(false);
                    }
                }
            } else {
                setHighestSpikeReview(null);
                setLowestSpikeReview(null);
                setMealComparisonDrivers(null);
            }

        } catch (error) {
            console.error('Error fetching weekly data:', error);
        } finally {
            setIsLoading(false);
        }
    }, [user]);

    useFocusEffect(
        useCallback(() => {
            fetchWeeklyData();
        }, [fetchWeeklyData])
    );

    // Fetch experiments data
    const fetchExperimentsData = useCallback(async () => {
        if (!user) return;

        setExperimentsLoading(true);
        try {
            // Fetch user's active experiments
            const active = await getUserExperiments(user.id, ['draft', 'active']);
            setActiveExperiments(active);

            // Fetch suggested experiments
            const suggestions = await getSuggestedExperiments(user.id, 6);
            if (suggestions?.suggestions) {
                setSuggestedExperiments(suggestions.suggestions);
            }
        } catch (error) {
            console.error('Error fetching experiments:', error);
        } finally {
            setExperimentsLoading(false);
        }
    }, [user]);

    // Fetch experiments when tab changes to experiments
    useFocusEffect(
        useCallback(() => {
            if (activeTab === 'experiments') {
                fetchExperimentsData();
            }
        }, [activeTab, fetchExperimentsData])
    );

    // Handle starting an experiment
    const handleStartExperiment = async (suggestion: SuggestedExperiment) => {
        if (!user) return;

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
                Alert.alert(
                    'Experiment Started! 🧪',
                    `You've started "${suggestion.template.title}". Log your meals and check in regularly to see your results.`,
                    [
                        {
                            text: 'View Details',
                            onPress: () => router.push(`/experiment-detail?id=${experiment.id}` as any),
                        },
                        { text: 'Got it', style: 'cancel' },
                    ]
                );
                // Refresh experiments list
                fetchExperimentsData();
            } else {
                Alert.alert('Error', 'Failed to start experiment. Please try again.');
            }
        } catch (error) {
            console.error('Error starting experiment:', error);
            Alert.alert('Error', 'Something went wrong. Please try again.');
        } finally {
            setStartingExperiment(null);
        }
    };

    const renderWeeklyReport = () => (
        <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
        >
            <Text style={styles.sectionDescription}>
                How your blood sugar behaved across different times and habits this week.
            </Text>

            {/* Time of Day Comparison */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Time of Day Comparison</Text>
                {isLoading ? (
                    <ActivityIndicator size="large" color="#3494D9" style={{ marginVertical: 40 }} />
                ) : (
                    <>
                        <TimeOfDayChart data={timeOfDayData} />
                        <Text style={styles.insightText}>{timeOfDayInsight}</Text>
                    </>
                )}
            </View>

            {/* Weekday vs Weekend */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Weekday vs Weekend Comparison</Text>
                {isLoading ? (
                    <ActivityIndicator size="large" color="#3494D9" style={{ marginVertical: 40 }} />
                ) : (
                    <>
                        <WeekdayWeekendComparison
                            weekdayData={weekdayData}
                            weekendData={weekendData}
                        />
                        <Text style={styles.insightText}>{weekdayInsight}</Text>
                    </>
                )}
            </View>

            {/* Behavioral Impacts */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Behavioral Impacts</Text>
                <BehavioralImpactItem
                    title="Sleep"
                    percentage={behavioralStats.sleep}
                    color="#0E9CFF"
                />
                <BehavioralImpactItem
                    title="Post Meal Walks"
                    percentage={behavioralStats.postMealWalks}
                    color="#0E9CFF"
                />
                <BehavioralImpactItem
                    title="Consistent Meal Times"
                    percentage={behavioralStats.consistentMealTimes}
                    color="#0E9CFF"
                />
            </View>

            {/* Best & Worst Meal Comparison */}
            <View style={styles.mealComparisonSection}>
                <Text style={styles.mealComparisonTitle}>Best & Worst Meal Comparison</Text>
                <View style={styles.mealComparisonCard}>
                    {isLoading ? (
                        <ActivityIndicator size="large" color="#3494D9" style={{ marginVertical: 40 }} />
                    ) : !highestSpikeReview && !lowestSpikeReview ? (
                        <MealComparisonEmpty />
                    ) : (
                        <>
                            {/* Meal tabs */}
                            <View style={styles.mealTabs}>
                                <View
                                    style={[
                                        styles.mealTabItem,
                                        mealTab === 'highest' && styles.mealTabItemActive,
                                    ]}
                                    onTouchEnd={() => setMealTab('highest')}
                                >
                                    <Text style={[styles.mealTabText, mealTab === 'highest' && styles.mealTabTextActive]}>
                                        BEST MEAL
                                    </Text>
                                </View>
                                <View
                                    style={[
                                        styles.mealTabItem,
                                        mealTab === 'lowest' && styles.mealTabItemActive,
                                    ]}
                                    onTouchEnd={() => setMealTab('lowest')}
                                >
                                    <Text style={[styles.mealTabText, mealTab === 'lowest' && styles.mealTabTextActive]}>
                                        WORST MEAL
                                    </Text>
                                </View>
                            </View>

                            {/* Best meal = lowest spike, Worst meal = highest spike */}
                            {mealTab === 'highest' && lowestSpikeReview ? (
                                <MealComparisonCard
                                    review={lowestSpikeReview}
                                    spikeDelta={computeSpikeDelta(lowestSpikeReview)}
                                    drivers={mealComparisonDrivers?.lowest?.drivers || []}
                                    driversLoading={driversLoading}
                                    glucoseUnit={glucoseUnit}
                                    type="lowest"
                                />
                            ) : mealTab === 'lowest' && highestSpikeReview ? (
                                <MealComparisonCard
                                    review={highestSpikeReview}
                                    spikeDelta={computeSpikeDelta(highestSpikeReview)}
                                    drivers={mealComparisonDrivers?.highest?.drivers || []}
                                    driversLoading={driversLoading}
                                    glucoseUnit={glucoseUnit}
                                    type="highest"
                                />
                            ) : (
                                <MealComparisonEmpty />
                            )}
                        </>
                    )}
                </View>
            </View>

            {/* Bottom spacing for tab bar */}
            <View style={{ height: 160 }} />
        </ScrollView>
    );

    const renderTrends = () => (
        <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
        >
            {/* Date filter row */}
            <View style={styles.trendsDateRow}>
                <Text style={styles.trendsDateText}>Today</Text>
                <Ionicons name="options-outline" size={20} color="#E7E8E9" />
            </View>

            {/* Meal Impacts Card */}
            <View style={styles.trendsCard}>
                <View style={styles.trendsCardHeader}>
                    <Text style={styles.trendsCardTitle}>Meal Impacts</Text>
                    <Text style={styles.trendsCardDescription}>
                        Shows the percentage of meals that aligned with steady patterns versus meals that were followed by mild or strong elevations.
                    </Text>
                </View>

                <View style={styles.mealImpactsContent}>
                    {/* Legend */}
                    <View style={styles.mealImpactsLegend}>
                        <View style={styles.legendItem}>
                            <View style={[styles.legendDotLarge, { backgroundColor: '#4CAF50' }]} />
                            <Text style={styles.legendLabel}>Steady Levels</Text>
                        </View>
                        <View style={styles.legendItem}>
                            <View style={[styles.legendDotLarge, { backgroundColor: '#FF9800' }]} />
                            <Text style={styles.legendLabel}>Mild Elevations</Text>
                        </View>
                        <View style={styles.legendItem}>
                            <View style={[styles.legendDotLarge, { backgroundColor: '#F44336' }]} />
                            <Text style={styles.legendLabel}>Spikes</Text>
                        </View>
                    </View>

                    {/* Dynamic Pie Chart */}
                    <View style={styles.pieChartContainer}>
                        <PieChart
                            size={130}
                            data={[
                                { value: 55, color: '#4CAF50', label: 'Steady' },
                                { value: 30, color: '#FF9800', label: 'Mild' },
                                { value: 15, color: '#C62828', label: 'Spikes' },
                            ]}
                        />
                    </View>
                </View>
            </View>

            {/* Peak Comparison Card */}
            <View style={styles.trendsCard}>
                <View style={styles.trendsCardHeader}>
                    <Text style={styles.trendsCardTitle}>Peak Comparison</Text>
                    <Text style={styles.trendsCardDescription}>
                        Shows how your average glucose rise differed from what the model expected using averages.
                    </Text>
                </View>

                <View style={styles.peakComparisonContent}>
                    {/* Predicted Peak */}
                    <View style={styles.trendBarRow}>
                        <Text style={styles.trendBarLabel}>Predicted Peak</Text>
                        <View style={styles.trendBarContainer}>
                            <View style={[styles.trendBar, { width: '100%' }]} />
                        </View>
                        <Text style={styles.trendBarValue}>{formatGlucoseWithUnit(8.9, glucoseUnit)}</Text>
                    </View>

                    {/* Actual Peak */}
                    <View style={styles.trendBarRow}>
                        <Text style={styles.trendBarLabel}>Actual Peak</Text>
                        <View style={styles.trendBarContainer}>
                            <View style={[styles.trendBar, { width: '75%' }]} />
                        </View>
                        <Text style={styles.trendBarValue}>{formatGlucoseWithUnit(7.4, glucoseUnit)}</Text>
                    </View>
                </View>

                <Text style={styles.trendsInsightText}>
                    Your actual responses were 18% gentler than expected. Best tweak was adding fibers before lunch.
                </Text>
            </View>

            {/* Gluco Suggestion Impact Card */}
            <View style={styles.trendsCard}>
                <View style={styles.trendsCardHeader}>
                    <Text style={styles.trendsCardTitle}>Gluco Suggestion Impact</Text>
                    <Text style={styles.trendsCardDescription}>
                        Compares how similar meals responded when you followed a Gluco suggestion versus when you didn't.
                    </Text>
                </View>

                <View style={styles.suggestionImpactContent}>
                    {/* With More Fiber vs With Same Fiber */}
                    <View style={styles.suggestionGroup}>
                        <View style={styles.trendBarRow}>
                            <Text style={styles.trendBarLabel}>With More Fiber</Text>
                            <View style={styles.trendBarContainer}>
                                <View style={[styles.trendBar, { width: '75%' }]} />
                            </View>
                            <Text style={styles.trendBarValue}>{formatGlucoseWithUnit(7.1, glucoseUnit)}</Text>
                        </View>
                        <View style={styles.trendBarRow}>
                            <Text style={styles.trendBarLabel}>With Same Fiber</Text>
                            <View style={styles.trendBarContainer}>
                                <View style={[styles.trendBar, { width: '95%' }]} />
                            </View>
                            <Text style={styles.trendBarValue}>{formatGlucoseWithUnit(8.9, glucoseUnit)}</Text>
                        </View>
                    </View>

                    {/* With Walk vs No Walk */}
                    <View style={styles.suggestionGroup}>
                        <View style={styles.trendBarRow}>
                            <Text style={styles.trendBarLabel}>With Walk</Text>
                            <View style={styles.trendBarContainer}>
                                <View style={[styles.trendBar, { width: '60%' }]} />
                            </View>
                            <Text style={styles.trendBarValue}>{formatGlucoseWithUnit(6.8, glucoseUnit)}</Text>
                        </View>
                        <View style={styles.trendBarRow}>
                            <Text style={styles.trendBarLabel}>No Walk</Text>
                            <View style={styles.trendBarContainer}>
                                <View style={[styles.trendBar, { width: '95%' }]} />
                            </View>
                            <Text style={styles.trendBarValue}>{formatGlucoseWithUnit(9.2, glucoseUnit)}</Text>
                        </View>
                    </View>

                    {/* Half Portion vs Full Portion */}
                    <View style={styles.suggestionGroup}>
                        <View style={styles.trendBarRow}>
                            <Text style={styles.trendBarLabel}>Half Portion</Text>
                            <View style={styles.trendBarContainer}>
                                <View style={[styles.trendBar, { width: '80%' }]} />
                            </View>
                            <Text style={styles.trendBarValue}>{formatGlucoseWithUnit(7.3, glucoseUnit)}</Text>
                        </View>
                        <View style={styles.trendBarRow}>
                            <Text style={styles.trendBarLabel}>Full Portion</Text>
                            <View style={styles.trendBarContainer}>
                                <View style={[styles.trendBar, { width: '95%' }]} />
                            </View>
                            <Text style={styles.trendBarValue}>{formatGlucoseWithUnit(9.8, glucoseUnit)}</Text>
                        </View>
                    </View>
                </View>

                {/* See more link */}
                <View style={styles.seeMoreRow}>
                    <Text style={styles.seeMoreText}>See more habits you tried</Text>
                    <Ionicons name="chevron-down" size={16} color="#E7E8E9" />
                </View>
            </View>

            {/* Bottom spacing for tab bar */}
            <View style={{ height: 160 }} />
        </ScrollView>
    );

    const renderExperiments = () => (
        <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
        >
            {/* Header Section */}
            <View style={styles.experimentsHeader}>
                <View style={styles.experimentsTitleRow}>
                    <Text style={styles.experimentsSparkle}>✨</Text>
                    <Text style={styles.experimentsTitle}>Find What Works For You</Text>
                </View>
                <View style={styles.experimentsDescriptionContainer}>
                    <Text style={styles.experimentsDescription}>
                        Small tests you can try for a few meals. We'll compare them and show your pattern. No rules, just real learning.
                    </Text>
                </View>
            </View>

            {/* Active Experiments Section */}
            {activeExperiments.length > 0 && (
                <>
                    <Text style={styles.experimentsSectionTitle}>Your Active Experiments</Text>
                    <View style={styles.experimentsCardList}>
                        {activeExperiments.map((exp) => (
                            <TouchableOpacity
                                key={exp.id}
                                style={styles.experimentCard}
                                onPress={() => router.push(`/experiment-detail?id=${exp.id}` as any)}
                                activeOpacity={0.7}
                            >
                                <View style={styles.experimentCardContent}>
                                    <View style={styles.experimentCardHeader}>
                                        <Text style={styles.experimentCardIcon}>
                                            {exp.experiment_templates?.icon || '🧪'}
                                        </Text>
                                        <View style={styles.experimentCardBadge}>
                                            <Text style={styles.experimentCardBadgeText}>
                                                {exp.status === 'active' ? 'IN PROGRESS' : 'DRAFT'}
                                            </Text>
                                        </View>
                                    </View>
                                    <Text style={styles.experimentCardTitle}>
                                        {exp.experiment_templates?.title || 'Experiment'}
                                    </Text>
                                    <Text style={styles.experimentCardDescription}>
                                        {exp.exposures_logged} / {(exp.experiment_templates?.protocol?.exposures_per_variant || 5) * 2} exposures logged
                                    </Text>
                                    <View style={styles.experimentProgressBar}>
                                        <View
                                            style={[
                                                styles.experimentProgressFill,
                                                {
                                                    width: `${Math.min(100, (exp.exposures_logged / ((exp.experiment_templates?.protocol?.exposures_per_variant || 5) * 2)) * 100)}%`,
                                                },
                                            ]}
                                        />
                                    </View>
                                </View>
                                <View style={styles.experimentButtonSecondary}>
                                    <Text style={styles.experimentButtonSecondaryText}>View Progress</Text>
                                    <Ionicons name="chevron-forward" size={16} color="#FFFFFF" />
                                </View>
                            </TouchableOpacity>
                        ))}
                    </View>
                </>
            )}

            {/* Suggested For You Section */}
            <Text style={styles.experimentsSectionTitle}>Suggested For You</Text>

            {experimentsLoading ? (
                <ActivityIndicator size="large" color="#3494D9" style={{ marginVertical: 40 }} />
            ) : suggestedExperiments.length > 0 ? (
                <View style={styles.experimentsCardList}>
                    {suggestedExperiments.map((suggestion) => (
                        <View key={suggestion.template.id} style={styles.experimentCard}>
                            <View style={styles.experimentCardContent}>
                                <View style={styles.experimentCardHeader}>
                                    <Text style={styles.experimentCardIcon}>
                                        {suggestion.template.icon || '🧪'}
                                    </Text>
                                    {suggestion.predicted_impact === 'high' && (
                                        <View style={[styles.experimentCardBadge, styles.experimentCardBadgeHigh]}>
                                            <Text style={styles.experimentCardBadgeText}>HIGH IMPACT</Text>
                                        </View>
                                    )}
                                </View>
                                <Text style={styles.experimentCardTitle}>
                                    {suggestion.template.title}
                                </Text>
                                <Text style={styles.experimentCardSubtitle}>
                                    {suggestion.template.subtitle}
                                </Text>
                                <Text style={styles.experimentCardDescription}>
                                    {suggestion.template.description}
                                </Text>
                                {suggestion.reasons.length > 0 && (
                                    <View style={styles.experimentReasons}>
                                        <Text style={styles.experimentReasonsTitle}>Why this for you:</Text>
                                        {suggestion.reasons.slice(0, 2).map((reason, idx) => (
                                            <View key={idx} style={styles.experimentReasonRow}>
                                                <View style={styles.experimentReasonDot} />
                                                <Text style={styles.experimentReasonText}>{reason}</Text>
                                            </View>
                                        ))}
                                    </View>
                                )}
                            </View>
                            <TouchableOpacity
                                style={[
                                    styles.experimentButton,
                                    startingExperiment === suggestion.template.id && styles.experimentButtonDisabled,
                                ]}
                                onPress={() => handleStartExperiment(suggestion)}
                                disabled={startingExperiment === suggestion.template.id}
                                activeOpacity={0.7}
                            >
                                {startingExperiment === suggestion.template.id ? (
                                    <ActivityIndicator size="small" color="#FFFFFF" />
                                ) : (
                                    <Text style={styles.experimentButtonText}>Start Experiment</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    ))}
                </View>
            ) : (
                <View style={styles.experimentCard}>
                    <View style={styles.experimentCardContent}>
                        <Text style={styles.experimentCardTitle}>No suggestions yet</Text>
                        <Text style={styles.experimentCardDescription}>
                            Log more meals and glucose readings to get personalized experiment suggestions.
                        </Text>
                    </View>
                </View>
            )}

            {/* View All Experiments Link */}
            <TouchableOpacity
                style={styles.viewAllExperimentsButton}
                onPress={() => router.push('/experiments-list' as any)}
                activeOpacity={0.7}
            >
                <Text style={styles.viewAllExperimentsText}>View All Experiments</Text>
                <Ionicons name="chevron-forward" size={18} color="#3494D9" />
            </TouchableOpacity>

            {/* Bottom spacing for tab bar */}
            <View style={{ height: 160 }} />
        </ScrollView>
    );

    return (
        <AnimatedScreen>
            <View style={styles.container}>
                {/* Background gradient */}
                <LinearGradient
                    colors={['#1a1f24', '#181c20', '#111111']}
                    locations={[0, 0.3, 1]}
                    style={styles.backgroundGradient}
                />

                <SafeAreaView edges={['top']} style={styles.safeArea}>
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.headerTitle}>INSIGHTS</Text>
                    </View>

                    {/* Tab navigation */}
                    <View style={styles.tabContainer}>
                        <SegmentedControl<TabKey>
                            value={activeTab}
                            onChange={setActiveTab}
                            options={[
                                { label: 'WEEKLY REPORT', value: 'weekly' },
                                { label: 'TRENDS', value: 'trends' },
                                { label: 'EXPERIMENTS', value: 'experiments' },
                            ]}
                        />
                    </View>

                    {/* Tab content */}
                    {activeTab === 'weekly' && renderWeeklyReport()}
                    {activeTab === 'trends' && renderTrends()}
                    {activeTab === 'experiments' && renderExperiments()}
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
        paddingHorizontal: 16,
        paddingVertical: 20,
    },
    headerTitle: {
        fontFamily: fonts.bold,
        fontSize: 18,
        color: '#FFFFFF',
        letterSpacing: 1,
    },
    tabContainer: {
        paddingHorizontal: 16,
        marginBottom: 16,
    },
    scrollContent: {
        paddingHorizontal: 16,
        flexGrow: 1,
    },
    sectionDescription: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#FFFFFF',
        lineHeight: 16.8,
        marginBottom: 20,
    },
    card: {
        backgroundColor: '#313135',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        overflow: 'hidden',
    },
    cardTitle: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: '#FFFFFF',
        marginBottom: 24,
        lineHeight: 19.2,
    },
    // Time of Day Chart
    chartWrapper: {
        marginBottom: 12,
    },
    chartContainer: {
        flexDirection: 'row',
    },
    chartYAxis: {
        width: 70,
        justifyContent: 'space-between',
        paddingVertical: 0,
        paddingRight: 8,
    },
    chartYLabel: {
        fontFamily: fonts.medium,
        fontSize: 12,
        color: '#E7E8E9',
        textAlign: 'center',
    },
    chartYLabelRow: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    chartYLabelMulti: {
        alignItems: 'flex-end',
    },
    chartArea: {
        flex: 1,
        height: 160,
        position: 'relative',
    },
    chartXLabels: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginTop: 12,
        marginLeft: 50, // account for Y-axis width
    },
    chartXLabelContainer: {
        alignItems: 'center',
    },
    chartXLabel: {
        fontFamily: fonts.regular,
        fontSize: 10,
        color: '#878787',
    },
    chartXLabelPeriod: {
        fontFamily: fonts.regular,
        fontSize: 10,
        color: '#878787',
    },
    insightText: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#FFFFFF',
        lineHeight: 20,
        marginTop: 8,
    },
    // Zone bands for chart
    zoneBandsContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        borderRadius: 4,
        overflow: 'hidden',
    },
    zoneBand: {
        width: '100%',
    },
    barsContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'flex-end',
        paddingHorizontal: 8,
    },
    barColumn: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'flex-end',
        height: '100%',
    },
    barWrapper: {
        justifyContent: 'flex-end',
        alignItems: 'center',
    },
    barSpaceAbove: {
        flex: 1,
    },
    bar: {
        borderRadius: 2,
        backgroundColor: '#0E9CFF',
    },
    chartXLabelCombined: {
        fontFamily: fonts.medium,
        fontSize: 12,
        color: '#E7E8E9',
        textAlign: 'center',
    },
    // Weekday vs Weekend Comparison - Grid layout
    comparisonContainer: {
        marginBottom: 12,
    },
    comparisonGridHeader: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        marginBottom: 16,
    },
    comparisonRowLabelSpacer: {
        width: 75,
    },
    comparisonColumnHeader: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: '#FFFFFF',
        textAlign: 'center',
        flex: 1,
    },
    comparisonColumnHeaderMulti: {
        flex: 1,
        alignItems: 'center',
    },
    comparisonGridRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    comparisonRowLabel: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: '#FFFFFF',
        width: 75,
    },
    comparisonCell: {
        flex: 1,
        paddingHorizontal: 4,
    },
    comparisonCellBg: {
        height: 16,
        backgroundColor: '#22282C',
        borderRadius: 4,
        overflow: 'hidden',
    },
    comparisonCellFill: {
        height: '100%',
        backgroundColor: '#0E9CFF',
        borderRadius: 4,
    },
    // Keep old styles for backwards compatibility
    comparisonHeader: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        marginBottom: 12,
        gap: 16,
    },
    comparisonLegend: {
        alignItems: 'center',
    },
    legendDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginBottom: 4,
    },
    legendText: {
        fontFamily: fonts.regular,
        fontSize: 10,
        color: '#878787',
        textAlign: 'center',
    },
    comparisonRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    comparisonLabel: {
        fontFamily: fonts.medium,
        fontSize: 12,
        color: '#FFFFFF',
        width: 70,
    },
    comparisonBarContainer: {
        flex: 1,
        height: 12,
        backgroundColor: '#2A2D30',
        borderRadius: 6,
        flexDirection: 'row',
        overflow: 'hidden',
    },
    comparisonBarSegment: {
        height: '100%',
    },
    // Behavioral Impacts
    impactItem: {
        marginBottom: 16,
    },
    impactTitle: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: '#FFFFFF',
        marginBottom: 4,
    },
    impactPercentage: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: '#878787',
        marginBottom: 8,
    },
    impactBarBg: {
        height: 16,
        backgroundColor: '#22282C',
        borderRadius: 4,
        overflow: 'hidden',
    },
    impactBar: {
        height: '100%',
        borderRadius: 4,
    },
    // Meal Comparison - Matching Figma design
    mealComparisonSection: {
        gap: 0,
    },
    mealComparisonTitle: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: '#FFFFFF',
        marginBottom: 12,
        lineHeight: 19.2,
    },
    mealComparisonCard: {
        backgroundColor: '#313135',
        borderRadius: 16,
        padding: 16,
        overflow: 'hidden',
    },
    mealTabs: {
        flexDirection: 'row',
        marginBottom: 8,
        gap: 0,
    },
    mealTabItem: {
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 6,
    },
    mealTabItemActive: {
        backgroundColor: '#1B1B1C',
    },
    mealTabText: {
        fontFamily: fonts.semiBold,
        fontSize: 12,
        color: '#878787',
        letterSpacing: 0.5,
    },
    mealTabTextActive: {
        color: '#FFFFFF',
    },
    mealCardContent: {
        gap: 12,
    },
    mealInfoSection: {
        gap: 4,
    },
    mealName: {
        fontFamily: fonts.medium,
        fontSize: 18,
        color: '#FFFFFF',
    },
    mealDateTimeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    mealDateTime: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#FFFFFF',
    },
    mealDateTimeDot: {
        width: 5,
        height: 5,
        borderRadius: 2.5,
        backgroundColor: '#878787',
    },
    mealChartSection: {
        gap: 12,
    },
    mealStatusSection: {
        gap: 6,
    },
    mealElevationBadge: {
        alignSelf: 'flex-start',
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 28,
        borderWidth: 0.25,
    },
    mealElevationText: {
        fontFamily: fonts.bold,
        fontSize: 12,
        textAlign: 'center',
    },
    mealPeakText: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#FFFFFF',
        lineHeight: 16.8,
    },
    mealTopDrivers: {
        gap: 6,
    },
    mealTopDriversTitle: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: '#FFFFFF',
        lineHeight: 16.8,
    },
    mealDriversList: {
        gap: 6,
    },
    mealDriverItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    mealDriverBullet: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#FFFFFF',
    },
    mealDriverText: {
        flex: 1,
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#FFFFFF',
        lineHeight: 16.8,
    },
    mealComparisonEmpty: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 32,
        paddingHorizontal: 16,
    },
    mealComparisonEmptyTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: '#FFFFFF',
        marginTop: 12,
        marginBottom: 8,
    },
    mealComparisonEmptyText: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#878787',
        textAlign: 'center',
        lineHeight: 20,
    },
    // Placeholder content
    placeholderContent: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    placeholderText: {
        fontFamily: fonts.semiBold,
        fontSize: 20,
        color: '#FFFFFF',
        marginTop: 16,
    },
    placeholderSubtext: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#878787',
        marginTop: 4,
    },
    // Trends section styles
    trendsDateRow: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
    },
    trendsDateText: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: '#FFFFFF',
    },
    trendsCard: {
        backgroundColor: '#313135',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        gap: 24,
    },
    trendsCardHeader: {
        gap: 8,
    },
    trendsCardTitle: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: '#FFFFFF',
        lineHeight: 19.2,
    },
    trendsCardDescription: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#FFFFFF',
        lineHeight: 16.8,
    },
    cardDescription: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#AAAAAA',
        lineHeight: 20,
        marginBottom: 16,
    },
    // Meal Impacts
    mealImpactsContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    mealImpactsLegend: {
        flex: 1,
        paddingVertical: 8,
        paddingHorizontal: 12,
        gap: 4,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    legendDotLarge: {
        width: 12,
        height: 12,
        borderRadius: 6,
    },
    legendLabel: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: '#E7E8E9',
    },
    pieChartContainer: {
        flex: 1,
        height: 130,
        justifyContent: 'center',
        alignItems: 'center',
    },
    // Trend bar rows (Peak Comparison, Suggestion Impact)
    peakComparisonContent: {
        gap: 16,
    },
    suggestionImpactContent: {
        gap: 32,
    },
    suggestionGroup: {
        gap: 16,
    },
    trendBarRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    trendBarLabel: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: '#FFFFFF',
        width: 110,
    },
    trendBarContainer: {
        flex: 1,
        height: 16,
        borderRadius: 4,
        overflow: 'hidden',
        justifyContent: 'center',
    },
    trendBar: {
        height: 16,
        backgroundColor: '#0E9CFF',
        borderRadius: 4,
    },
    trendBarValue: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: '#FFFFFF',
        width: 90,
        textAlign: 'right',
    },
    trendsInsightText: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#FFFFFF',
        lineHeight: 16.8,
    },
    pieChart: {
        width: 90,
        height: 90,
        borderRadius: 45,
        overflow: 'hidden',
        position: 'relative',
    },
    pieSegment: {
        position: 'absolute',
        width: '100%',
        height: '100%',
        borderRadius: 45,
    },
    pieSegmentSteady: {
        backgroundColor: '#4CAF50',
    },
    pieSegmentOverlay: {
        position: 'absolute',
        width: '100%',
        height: '50%',
        bottom: 0,
        left: 0,
    },
    pieSegmentMild: {
        backgroundColor: '#FF9800',
    },
    pieSegmentOverlay2: {
        position: 'absolute',
        width: '35%',
        height: '35%',
        bottom: 0,
        right: 0,
    },
    pieSegmentSpike: {
        backgroundColor: '#F44336',
    },
    seeMoreRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 8,
    },
    seeMoreText: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#FFFFFF',
        marginRight: 8,
    },
    // Experiments section styles
    experimentsHeader: {
        gap: 8,
        marginBottom: 16,
    },
    experimentsTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    experimentsSparkle: {
        fontSize: 28,
    },
    experimentsTitle: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: '#FFFFFF',
        lineHeight: 19.2,
    },
    experimentsDescriptionContainer: {
        width: '100%',
    },
    experimentsDescription: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#AAAAAA',
        lineHeight: 20,
    },
    experimentsSectionTitle: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: '#FFFFFF',
        lineHeight: 19.2,
        marginTop: 24,
        marginBottom: 12,
    },
    experimentsCardList: {
        gap: 24,
    },
    experimentCard: {
        backgroundColor: '#22282C',
        borderRadius: 16,
        padding: 16,
        gap: 24,
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    experimentCardContent: {
        gap: 16,
    },
    experimentCardTitle: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: '#FFFFFF',
        lineHeight: 15.2,
    },
    experimentCardDescription: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#FFFFFF',
        lineHeight: 16.8,
    },
    experimentButton: {
        backgroundColor: '#3F4243',
        borderRadius: 8,
        paddingVertical: 16,
        paddingHorizontal: 100,
        alignItems: 'center',
        justifyContent: 'center',
    },
    experimentButtonText: {
        fontFamily: fonts.medium,
        fontSize: 15,
        color: '#F2F2F2',
        lineHeight: 14.25,
    },
    experimentButtonDisabled: {
        opacity: 0.6,
    },
    experimentCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    experimentCardIcon: {
        fontSize: 20,
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#2A2D30',
        textAlign: 'center',
        lineHeight: 40,
        overflow: 'hidden',
    },
    experimentCardBadge: {
        backgroundColor: '#3494D9',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
    },
    experimentCardBadgeHigh: {
        backgroundColor: '#4CAF50',
    },
    experimentCardBadgeText: {
        fontFamily: fonts.semiBold,
        fontSize: 10,
        color: '#FFFFFF',
        letterSpacing: 0.5,
    },
    experimentCardSubtitle: {
        fontFamily: fonts.medium,
        fontSize: 13,
        color: '#878787',
        marginBottom: 4,
    },
    experimentReasons: {
        marginTop: 12,
        gap: 6,
    },
    experimentReasonsTitle: {
        fontFamily: fonts.medium,
        fontSize: 12,
        color: '#878787',
        marginBottom: 4,
    },
    experimentReasonRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
    },
    experimentReasonDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#3494D9',
        marginTop: 5,
    },
    experimentReasonText: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: '#AAAAAA',
        flex: 1,
        lineHeight: 18,
    },
    experimentProgressBar: {
        height: 6,
        backgroundColor: '#3F4243',
        borderRadius: 3,
        marginTop: 12,
        overflow: 'hidden',
    },
    experimentProgressFill: {
        height: '100%',
        backgroundColor: '#3494D9',
        borderRadius: 3,
    },
    experimentButtonSecondary: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        paddingVertical: 12,
        paddingHorizontal: 16,
        backgroundColor: 'transparent',
        borderTopWidth: 1,
        borderTopColor: '#3F4243',
    },
    experimentButtonSecondaryText: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: '#FFFFFF',
    },
    viewAllExperimentsButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        paddingVertical: 16,
        marginTop: 8,
    },
    viewAllExperimentsText: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: '#3494D9',
    },
});
