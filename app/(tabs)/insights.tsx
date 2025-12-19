import { AnimatedScreen } from '@/components/animated-screen';
import { SegmentedControl } from '@/components/segmented-control';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { getGlucoseLogsByDateRange } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    ScrollView,
    StyleSheet,
    Text,
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
    const chartHeight = 150;
    const barWidth = 32;

    // Glucose zones (mmol/L)
    const ZONE_MIN = 3;
    const ZONE_MAX = 12;
    const STEADY_MAX = 6.5;
    const MILD_MAX = 8.5;

    const range = ZONE_MAX - ZONE_MIN;

    // Calculate zone heights (proportional)
    const steadyZoneHeight = ((STEADY_MAX - ZONE_MIN) / range) * chartHeight;
    const mildZoneHeight = ((MILD_MAX - STEADY_MAX) / range) * chartHeight;
    const spikeZoneHeight = ((ZONE_MAX - MILD_MAX) / range) * chartHeight;

    // Time labels matching the design
    const timeLabels = ['07:00 AM', '12:00 PM', '04:00 PM', '07:00 PM', '10:00 PM'];

    // Calculate bar heights from average values
    const getBarHeight = (value: number) => {
        const clampedValue = Math.min(Math.max(value, ZONE_MIN), ZONE_MAX);
        return ((clampedValue - ZONE_MIN) / range) * chartHeight;
    };

    // Ensure we have 5 data points (pad with defaults if needed)
    const chartData = [
        data[0] || { period: 'morning', avgValue: 5 },
        data[1] || { period: 'noon', avgValue: 7 },
        data[2] || { period: 'afternoon', avgValue: 8 },
        data[3] || { period: 'evening', avgValue: 6.5 },
        data[4] || { period: 'night', avgValue: 6 },
    ];

    return (
        <View style={styles.chartWrapper}>
            <View style={styles.chartContainer}>
                {/* Y-axis labels - horizontal */}
                <View style={[styles.chartYAxis, { height: chartHeight }]}>
                    <Text style={styles.chartYLabel}>Spike</Text>
                    <View style={styles.chartYLabelMulti}>
                        <Text style={styles.chartYLabel}>Mild</Text>
                        <Text style={styles.chartYLabel}>Elevation</Text>
                    </View>
                    <Text style={styles.chartYLabel}>Steady</Text>
                </View>

                {/* Chart area with zone bands and bars */}
                <View style={[styles.chartArea, { height: chartHeight }]}>
                    {/* Zone background bands - stacked from top to bottom */}
                    <View style={styles.zoneBandsContainer}>
                        <View style={[styles.zoneBand, { height: spikeZoneHeight, backgroundColor: '#5C3D3D' }]} />
                        <View style={[styles.zoneBand, { height: mildZoneHeight, backgroundColor: '#5A4637' }]} />
                        <View style={[styles.zoneBand, { height: steadyZoneHeight, backgroundColor: '#3D4B37' }]} />
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

// Best/Worst Meal Card
function MealComparisonCard({ type, mealName, date, time, peakValue, isActual }: {
    type: 'best' | 'worst';
    mealName: string;
    date: string;
    time: string;
    peakValue: number;
    isActual?: boolean;
}) {
    const isBest = type === 'best';

    return (
        <View style={styles.mealCard}>
            <Text style={styles.mealName}>{mealName}</Text>
            <Text style={styles.mealDateTime}>{time} • {date}</Text>

            {/* Mini chart placeholder */}
            <View style={styles.mealChartPlaceholder}>
                <View style={styles.mealChartLegend}>
                    <View style={styles.mealChartLegendItem}>
                        <View style={[styles.legendLine, { backgroundColor: '#3494D9' }]} />
                        <Text style={styles.mealChartLegendText}>Actual</Text>
                    </View>
                    <View style={styles.mealChartLegendItem}>
                        <View style={[styles.legendLine, { backgroundColor: '#878787', borderStyle: 'dashed' }]} />
                        <Text style={styles.mealChartLegendText}>Predicted</Text>
                    </View>
                </View>
            </View>

            <View style={[styles.mealElevationBadge, { backgroundColor: isBest ? 'rgba(76, 175, 80, 0.15)' : 'rgba(244, 67, 54, 0.15)' }]}>
                <Text style={[styles.mealElevationText, { color: isBest ? '#4CAF50' : '#F44336' }]}>
                    {isBest ? 'Mild Elevation' : 'Spike'}
                </Text>
            </View>

            <Text style={styles.mealPeakText}>
                Peaked at {peakValue} mmol/L - {isBest ? 'smoother than expected' : 'higher than expected'}
            </Text>

            <View style={styles.mealTopDrivers}>
                <Text style={styles.mealTopDriversTitle}>Top Drivers:</Text>
                <View style={styles.mealDriverItem}>
                    <View style={styles.mealDriverBullet} />
                    <Text style={styles.mealDriverText}>Lorem ipsum dolor sit amet consectetur.</Text>
                </View>
                <View style={styles.mealDriverItem}>
                    <View style={styles.mealDriverBullet} />
                    <Text style={styles.mealDriverText}>Lorem ipsum dolor sit amet consectetur.</Text>
                </View>
                <View style={styles.mealDriverItem}>
                    <View style={styles.mealDriverBullet} />
                    <Text style={styles.mealDriverText}>Lorem ipsum dolor sit amet consectetur.</Text>
                </View>
            </View>
        </View>
    );
}

export default function InsightsScreen() {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<TabKey>('weekly');
    const [isLoading, setIsLoading] = useState(true);
    const [mealTab, setMealTab] = useState<'best' | 'worst'>('best');

    // Computed data states
    const [timeOfDayData, setTimeOfDayData] = useState<{ period: string; avgValue: number }[]>([]);
    const [weekdayData, setWeekdayData] = useState({ steady: 0, mild: 0, spike: 0 });
    const [weekendData, setWeekendData] = useState({ steady: 0, mild: 0, spike: 0 });
    const [behavioralStats, setBehavioralStats] = useState({
        sleep: 14,
        postMealWalks: 58,
        consistentMealTimes: 28,
    });

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
                    color="#3494D9"
                />
                <BehavioralImpactItem
                    title="Post Meal Walks"
                    percentage={behavioralStats.postMealWalks}
                    color="#3494D9"
                />
                <BehavioralImpactItem
                    title="Consistent Meal Times"
                    percentage={behavioralStats.consistentMealTimes}
                    color="#3494D9"
                />
            </View>

            {/* Best & Worst Meal */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Best & Worst Meal Comparison</Text>

                {/* Meal tabs */}
                <View style={styles.mealTabs}>
                    <View
                        style={[
                            styles.mealTabItem,
                            mealTab === 'best' && styles.mealTabItemActive,
                        ]}
                        onTouchEnd={() => setMealTab('best')}
                    >
                        <Text style={[styles.mealTabText, mealTab === 'best' && styles.mealTabTextActive]}>
                            BEST MEAL
                        </Text>
                    </View>
                    <View
                        style={[
                            styles.mealTabItem,
                            mealTab === 'worst' && styles.mealTabItemActive,
                        ]}
                        onTouchEnd={() => setMealTab('worst')}
                    >
                        <Text style={[styles.mealTabText, mealTab === 'worst' && styles.mealTabTextActive]}>
                            WORST MEAL
                        </Text>
                    </View>
                </View>

                {mealTab === 'best' ? (
                    <MealComparisonCard
                        type="best"
                        mealName="Oatmeal with Banana"
                        date="16-11-2025"
                        time="06:10 AM"
                        peakValue={7.4}
                    />
                ) : (
                    <MealComparisonCard
                        type="worst"
                        mealName="White Rice with Curry"
                        date="14-11-2025"
                        time="07:30 PM"
                        peakValue={11.2}
                    />
                )}
            </View>

            {/* Bottom spacing for tab bar */}
            <View style={{ height: 120 }} />
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
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Meal Impacts</Text>
                <Text style={styles.cardDescription}>
                    Shows the percentage of meals that aligned with steady patterns versus meals that were followed by mild or strong elevations.
                </Text>

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
                            size={120}
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
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Peak Comparison</Text>
                <Text style={styles.cardDescription}>
                    Shows how your average glucose rise differed from what the model expected using averages.
                </Text>

                {/* Predicted Peak */}
                <View style={styles.peakRow}>
                    <Text style={styles.peakLabel}>Predicted Peak</Text>
                    <View style={styles.peakBarContainer}>
                        <View style={[styles.peakBar, { width: '80%' }]} />
                    </View>
                    <Text style={styles.peakValue}>8.9 mmol/L</Text>
                </View>

                {/* Actual Peak */}
                <View style={styles.peakRow}>
                    <Text style={styles.peakLabel}>Actual Peak</Text>
                    <View style={styles.peakBarContainer}>
                        <View style={[styles.peakBar, { width: '65%' }]} />
                    </View>
                    <Text style={styles.peakValue}>7.4 mmol/L</Text>
                </View>

                <Text style={styles.peakInsight}>
                    Your actual responses were 18% gentler than expected. Best tweak was adding fibers before lunch.
                </Text>
            </View>

            {/* Gluco Suggestion Impact Card */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Gluco Suggestion Impact</Text>
                <Text style={styles.cardDescription}>
                    Compares how similar meals responded when you followed a Gluco suggestion versus when you didn't.
                </Text>

                {/* With More Fiber vs With Same Fiber */}
                <View style={styles.suggestionComparison}>
                    <View style={styles.suggestionRow}>
                        <Text style={styles.suggestionLabel}>With More Fiber</Text>
                        <View style={styles.suggestionBarContainer}>
                            <View style={[styles.suggestionBar, { width: '70%' }]} />
                        </View>
                        <Text style={styles.suggestionValue}>7.1 mmol/L</Text>
                    </View>
                    <View style={styles.suggestionRow}>
                        <Text style={styles.suggestionLabel}>With Same Fiber</Text>
                        <View style={styles.suggestionBarContainer}>
                            <View style={[styles.suggestionBarGrey, { width: '90%' }]} />
                        </View>
                        <Text style={styles.suggestionValue}>8.9 mmol/L</Text>
                    </View>
                </View>

                {/* With Walk vs No Walk */}
                <View style={styles.suggestionComparison}>
                    <View style={styles.suggestionRow}>
                        <Text style={styles.suggestionLabel}>With Walk</Text>
                        <View style={styles.suggestionBarContainer}>
                            <View style={[styles.suggestionBar, { width: '55%' }]} />
                        </View>
                        <Text style={styles.suggestionValue}>6.8 mmol/L</Text>
                    </View>
                    <View style={styles.suggestionRow}>
                        <Text style={styles.suggestionLabel}>No Walk</Text>
                        <View style={styles.suggestionBarContainer}>
                            <View style={[styles.suggestionBarGrey, { width: '85%' }]} />
                        </View>
                        <Text style={styles.suggestionValue}>9.2 mmol/L</Text>
                    </View>
                </View>

                {/* Half Portion vs Full Portion */}
                <View style={styles.suggestionComparison}>
                    <View style={styles.suggestionRow}>
                        <Text style={styles.suggestionLabel}>Half Portion</Text>
                        <View style={styles.suggestionBarContainer}>
                            <View style={[styles.suggestionBar, { width: '60%' }]} />
                        </View>
                        <Text style={styles.suggestionValue}>7.3 mmol/L</Text>
                    </View>
                    <View style={styles.suggestionRow}>
                        <Text style={styles.suggestionLabel}>Full Portion</Text>
                        <View style={styles.suggestionBarContainer}>
                            <View style={[styles.suggestionBarGrey, { width: '95%' }]} />
                        </View>
                        <Text style={styles.suggestionValue}>9.8 mmol/L</Text>
                    </View>
                </View>

                {/* See more link */}
                <View style={styles.seeMoreRow}>
                    <Text style={styles.seeMoreText}>See more habits you tried</Text>
                    <Ionicons name="chevron-down" size={16} color="#E7E8E9" />
                </View>
            </View>

            {/* Bottom spacing for tab bar */}
            <View style={{ height: 120 }} />
        </ScrollView>
    );

    const renderExperiments = () => (
        <View style={styles.placeholderContent}>
            <Ionicons name="flask-outline" size={48} color="#878787" />
            <Text style={styles.placeholderText}>Experiments</Text>
            <Text style={styles.placeholderSubtext}>Coming soon...</Text>
        </View>
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
        color: '#878787',
        lineHeight: 20,
        marginBottom: 20,
    },
    card: {
        backgroundColor: '#1A1D1F',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#2A2D30',
        padding: 16,
        marginBottom: 16,
    },
    cardTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: '#FFFFFF',
        marginBottom: 16,
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
        textAlign: 'right',
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
        backgroundColor: '#3494D9',
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
        height: 12,
        backgroundColor: '#22282C',
        borderRadius: 4,
        overflow: 'hidden',
    },
    comparisonCellFill: {
        height: '100%',
        backgroundColor: '#3494D9',
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
        height: 8,
        backgroundColor: '#2A2D30',
        borderRadius: 4,
        overflow: 'hidden',
    },
    impactBar: {
        height: '100%',
        borderRadius: 4,
    },
    // Meal Comparison
    mealTabs: {
        flexDirection: 'row',
        marginBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#2A2D30',
    },
    mealTabItem: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    mealTabItemActive: {
        borderBottomColor: '#3494D9',
    },
    mealTabText: {
        fontFamily: fonts.medium,
        fontSize: 12,
        color: '#878787',
        letterSpacing: 0.5,
    },
    mealTabTextActive: {
        color: '#3494D9',
    },
    mealCard: {
        marginTop: 8,
    },
    mealName: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: '#FFFFFF',
        marginBottom: 4,
    },
    mealDateTime: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: '#878787',
        marginBottom: 16,
    },
    mealChartPlaceholder: {
        height: 100,
        backgroundColor: '#22282c',
        borderRadius: 8,
        marginBottom: 12,
        justifyContent: 'flex-end',
        padding: 12,
    },
    mealChartLegend: {
        flexDirection: 'row',
        gap: 16,
    },
    mealChartLegendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    legendLine: {
        width: 16,
        height: 2,
        borderRadius: 1,
    },
    mealChartLegendText: {
        fontFamily: fonts.regular,
        fontSize: 10,
        color: '#878787',
    },
    mealElevationBadge: {
        alignSelf: 'flex-start',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
        marginBottom: 12,
    },
    mealElevationText: {
        fontFamily: fonts.medium,
        fontSize: 12,
    },
    mealPeakText: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#FFFFFF',
        marginBottom: 16,
    },
    mealTopDrivers: {
        marginTop: 8,
    },
    mealTopDriversTitle: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: '#FFFFFF',
        marginBottom: 8,
    },
    mealDriverItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 8,
    },
    mealDriverBullet: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#FFFFFF',
        marginTop: 6,
        marginRight: 10,
    },
    mealDriverText: {
        flex: 1,
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#FFFFFF',
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
        color: '#E7E8E9',
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
        marginTop: 8,
    },
    mealImpactsLegend: {
        flex: 1,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    legendDotLarge: {
        width: 10,
        height: 10,
        borderRadius: 5,
        marginRight: 10,
    },
    legendLabel: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#FFFFFF',
    },
    pieChartContainer: {
        width: 130,
        height: 130,
        justifyContent: 'center',
        alignItems: 'center',
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
    // Peak Comparison
    peakRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    peakLabel: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: '#FFFFFF',
        width: 100,
    },
    peakBarContainer: {
        flex: 1,
        height: 10,
        backgroundColor: '#22282C',
        borderRadius: 5,
        marginHorizontal: 12,
        overflow: 'hidden',
    },
    peakBar: {
        height: '100%',
        backgroundColor: '#3494D9',
        borderRadius: 5,
    },
    peakValue: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: '#FFFFFF',
        width: 80,
        textAlign: 'right',
    },
    peakInsight: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#AAAAAA',
        lineHeight: 20,
        marginTop: 8,
    },
    // Suggestion Impact
    suggestionComparison: {
        marginBottom: 16,
    },
    suggestionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    suggestionLabel: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: '#FFFFFF',
        width: 110,
    },
    suggestionBarContainer: {
        flex: 1,
        height: 10,
        backgroundColor: '#22282C',
        borderRadius: 5,
        marginHorizontal: 12,
        overflow: 'hidden',
    },
    suggestionBar: {
        height: '100%',
        backgroundColor: '#3494D9',
        borderRadius: 5,
    },
    suggestionBarGrey: {
        height: '100%',
        backgroundColor: '#555555',
        borderRadius: 5,
    },
    suggestionValue: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: '#FFFFFF',
        width: 75,
        textAlign: 'right',
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
});
