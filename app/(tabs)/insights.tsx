import { AnimatedScreen } from '@/components/animated-screen';
import { SegmentedControl } from '@/components/segmented-control';
import { Disclaimer } from '@/components/ui/Disclaimer';
import { Images } from '@/constants/Images';
import { useAuth, useGlucoseUnit } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import {
    getGlucoseLogsByDateRange,
    getMealsWithCheckinsByDateRange,
    getSuggestedExperiments,
    getUserExperiments,
    GlucoseLog,
    invokeMetabolicScore,
    MealWithCheckin,
    MetabolicScoreResult,
    startUserExperiment,
    SuggestedExperiment,
    UserExperiment
} from '@/lib/supabase';
import { formatGlucoseWithUnit } from '@/lib/utils/glucoseUnits';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Image,
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
// Get date range for analysis (last 30 days for robust patterns)
function getInsightsDateRange(days: number = 30): { startDate: Date; endDate: Date } {
    const now = new Date();
    const endDate = new Date(now);
    const startDate = new Date(now);
    startDate.setDate(now.getDate() - days);
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
                        <Text style={styles.chartYLabel}>Elevated</Text>
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
                <Text style={styles.comparisonColumnHeader}>Elevated</Text>
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

// Empty state for Meal Comparison section
function MealComparisonEmpty() {
    return (
        <View style={styles.mealComparisonEmpty}>
            <Image source={Images.mascots.cook} style={{ width: 80, height: 80, resizeMode: 'contain', marginBottom: 12 }} />
            <Text style={styles.mealComparisonEmptyTitle}>No Meal Data Yet</Text>
            <Text style={styles.mealComparisonEmptyText}>
                Log meals and check in regularly to see patterns here.
            </Text>
        </View>
    );
}

// Helper to calculate score (High is good, Low is bad)
function calculateMealScore(meal: MealWithCheckin, logs: GlucoseLog[]): number {
    const checkin = meal.meal_checkins?.[0];
    if (!checkin) return 0;

    let score = 0;

    // Energy (1-5 scale mapped from levels)
    const energyMap: Record<string, number> = { 'low': 1, 'steady': 3, 'high': 5 };
    if (checkin.energy) score += energyMap[checkin.energy] || 0;

    // Mood (1-5 scale mapped from levels)
    const moodMap: Record<string, number> = { 'low': 1, 'okay': 3, 'good': 5 };
    if (checkin.mood) score += moodMap[checkin.mood] || 0;

    // Glucose Spike Impact (penalty for high spikes)
    // Find logs within 2 hours of meal
    const mealTime = new Date(meal.logged_at).getTime();
    const twoHoursLater = mealTime + (2 * 60 * 60 * 1000);

    // Simple baseline: log closest to meal time (within 30 mins before/after)
    // Simple max: max log in 2h window
    const nearbyLogs = logs.filter(l => {
        const t = new Date(l.logged_at).getTime();
        return t >= mealTime && t <= twoHoursLater;
    });

    if (nearbyLogs.length > 0) {
        const levels = nearbyLogs.map(l => l.glucose_level);
        const max = Math.max(...levels);
        const min = Math.min(...levels); // approximate baseline
        const spike = max - min;

        // Spike penalty (Spike > 2.0 starts penalizing)
        if (spike > 4.0) score -= 3;
        else if (spike > 2.0) score -= 1;
        else score += 1; // Steady bonus
    }

    return score;
}

export default function InsightsScreen() {
    const { user } = useAuth();
    const glucoseUnit = useGlucoseUnit();
    const params = useLocalSearchParams();

    // Initialize tab from params or default to weekly
    const [activeTab, setActiveTab] = useState<TabKey>(
        (params.tab as TabKey) || 'weekly'
    );

    // Update tab if params change
    useFocusEffect(
        useCallback(() => {
            if (params.tab && ['weekly', 'trends', 'experiments'].includes(params.tab as string)) {
                setActiveTab(params.tab as TabKey);
            }
        }, [params.tab])
    );
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

    // Best & Worst Meals
    const [bestMeal, setBestMeal] = useState<MealWithCheckin | null>(null);
    const [worstMeal, setWorstMeal] = useState<MealWithCheckin | null>(null);

    // Experiments states
    const [suggestedExperiments, setSuggestedExperiments] = useState<SuggestedExperiment[]>([]);
    const [activeExperiments, setActiveExperiments] = useState<UserExperiment[]>([]);
    const [experimentsLoading, setExperimentsLoading] = useState(false);
    const [startingExperiment, setStartingExperiment] = useState<string | null>(null);
    const [successExperiment, setSuccessExperiment] = useState<string | null>(null);

    // Insights text
    const [timeOfDayInsight, setTimeOfDayInsight] = useState('');
    const [weekdayInsight, setWeekdayInsight] = useState('');
    const [hasSufficientData, setHasSufficientData] = useState(false);
    const [trendStats, setTrendStats] = useState({ steady: 0, mild: 0, spike: 0 });
    const [glucoseStats, setGlucoseStats] = useState({ tir: 0, average: 0, totalReadings: 0, variability: 0 });
    const [insightsRangeDays, setInsightsRangeDays] = useState(30);

    // Metabolic Score state
    const [metabolicScore, setMetabolicScore] = useState<MetabolicScoreResult | null>(null);
    const [metabolicScoreLoading, setMetabolicScoreLoading] = useState(false);

    const fetchWeeklyData = useCallback(async () => {
        if (!user) {
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        try {
            const { startDate, endDate } = getInsightsDateRange(insightsRangeDays);
            const logs = await getGlucoseLogsByDateRange(user.id, startDate, endDate);

            // Check for data sufficiency (at least 3 days of data for partial insights, 7 ideally)
            // User requested 7 days message
            const uniqueDays = new Set(logs.map(l => new Date(l.logged_at).toISOString().split('T')[0])).size;
            const sufficient = uniqueDays >= Math.min(3, insightsRangeDays); // Relax check for short ranges
            setHasSufficientData(sufficient);

            if (!sufficient) {
                // Don't process questionable data
                setIsLoading(false);
                return;
            }

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
            const calcAvg = (values: number[]) => values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;

            setTimeOfDayData([
                { period: 'morning', avgValue: calcAvg(timeValues.morning) },
                { period: 'afternoon', avgValue: calcAvg(timeValues.afternoon) },
                { period: 'evening', avgValue: calcAvg(timeValues.evening) },
                { period: 'night', avgValue: calcAvg(timeValues.night) },
            ]);

            setWeekdayData(weekday);
            setWeekendData(weekend);


            // Calculate aggregated trend stats for Pie Chart
            const totalSteady = timeData.morning.steady + timeData.afternoon.steady + timeData.evening.steady + timeData.night.steady;
            const totalMild = timeData.morning.mild + timeData.afternoon.mild + timeData.evening.mild + timeData.night.mild;
            const totalSpike = timeData.morning.spike + timeData.afternoon.spike + timeData.evening.spike + timeData.night.spike;
            setTrendStats({
                steady: totalSteady,
                mild: totalMild,
                spike: totalSpike
            });

            // Calculate Glucose Statistics (TIR and Average)
            if (logs.length > 0) {
                // Time in Range (3.9 - 10.0 mmol/L) -> (70 - 180 mg/dL)
                // Assuming logs are mmol/L (if they are stored as such)
                // Wait, DB logs are usually mmol/L. Let's assume standard range 3.9-10.
                const tirCount = logs.filter(l => l.glucose_level >= 3.9 && l.glucose_level <= 10.0).length;
                const tir = (tirCount / logs.length) * 100;

                const sumGlucose = logs.reduce((sum, l) => sum + l.glucose_level, 0);
                const average = sumGlucose / logs.length;

                // Variability (Standard Deviation / Mean * 100)
                const variance = logs.reduce((sum, l) => sum + Math.pow(l.glucose_level - average, 2), 0) / logs.length;
                const stdDev = Math.sqrt(variance);
                const cv = average > 0 ? (stdDev / average) * 100 : 0;

                setGlucoseStats({
                    tir,
                    average,
                    totalReadings: logs.length,
                    variability: cv
                });
            } else {
                setGlucoseStats({ tir: 0, average: 0, totalReadings: 0, variability: 0 });
            }

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

            // Meal Comparison using Check-ins
            const meals = await getMealsWithCheckinsByDateRange(user.id, startDate, endDate);

            // Score meals that have check-ins
            const rankedMeals = meals
                .filter(m => m.meal_checkins && m.meal_checkins.length > 0)
                .map(m => ({ meal: m, score: calculateMealScore(m, logs) }))
                .sort((a, b) => b.score - a.score);

            if (rankedMeals.length > 0) {
                setBestMeal(rankedMeals[0].meal);
                // Only show worst if different from best
                if (rankedMeals.length > 1) {
                    setWorstMeal(rankedMeals[rankedMeals.length - 1].meal);
                } else {
                    setWorstMeal(null);
                }
            } else {
                setWorstMeal(null);
            }

        } catch (error) {
            console.error('Error fetching weekly data:', error);
        } finally {
            setIsLoading(false);
        }
    }, [user, insightsRangeDays]);

    useFocusEffect(
        useCallback(() => {
            fetchWeeklyData();
        }, [fetchWeeklyData])
    );

    // Fetch metabolic score
    const fetchMetabolicScore = useCallback(async () => {
        if (!user) return;

        setMetabolicScoreLoading(true);
        try {
            const result = await invokeMetabolicScore(user.id);
            setMetabolicScore(result);
        } catch (error) {
            console.error('Error fetching metabolic score:', error);
        } finally {
            setMetabolicScoreLoading(false);
        }
    }, [user]);

    // Fetch metabolic score when weekly tab is active
    useFocusEffect(
        useCallback(() => {
            if (activeTab === 'weekly') {
                fetchMetabolicScore();
            }
        }, [activeTab, fetchMetabolicScore])
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
                setSuccessExperiment(suggestion.template.id);
                fetchExperimentsData();

                // Show checkmark then navigate
                setTimeout(() => {
                    setSuccessExperiment(null);
                    router.push('/(tabs)/' as any);
                }, 1500);
            } else {
                setStartingExperiment(null);
                Alert.alert('Error', 'Failed to start experiment. Please try again.');
            }
        } catch (error) {
            console.error('Error starting experiment:', error);
            setStartingExperiment(null);
            Alert.alert('Error', 'Something went wrong. Please try again.');
        }
    };



    // Reusable empty state for reports
    const renderInsufficientData = () => (
        <View style={styles.card}>
            <View style={{ alignItems: 'center', padding: 24, gap: 12 }}>
                <Image source={Images.mascots.thinking} style={{ width: 80, height: 80, resizeMode: 'contain' }} />
                <Text style={{ fontFamily: fonts.semiBold, fontSize: 18, color: '#FFFFFF', textAlign: 'center' }}>
                    Not Enough Data Yet
                </Text>
                <Text style={{ fontFamily: fonts.regular, fontSize: 14, color: '#878787', textAlign: 'center', lineHeight: 20 }}>
                    We need at least 7 days of glucose data to generate meaningful insights and trends. Keep logging!
                </Text>
            </View>
        </View>
    );

    const renderWeeklyReport = () => (
        <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
        >
            <Text style={styles.sectionDescription}>
                How your habits and patterns contributed to your wellness this week.
            </Text>

            {/* Metabolic Response Score Card */}
            <View style={styles.card}>
                <View style={styles.metabolicScoreHeader}>
                    <Text style={styles.metabolicScoreTitle}>Metabolic Response Score</Text>
                    {metabolicScore && (
                        <View style={[
                            styles.confidenceBadge,
                            metabolicScore.confidence === 'high' && styles.confidenceHigh,
                            metabolicScore.confidence === 'medium' && styles.confidenceMedium,
                            metabolicScore.confidence === 'low' && styles.confidenceLow,
                        ]}>
                            <Text style={styles.confidenceText}>
                                {metabolicScore.confidence}
                            </Text>
                        </View>
                    )}
                </View>

                {metabolicScoreLoading ? (
                    <ActivityIndicator size="large" color="#3494D9" style={{ marginVertical: 40 }} />
                ) : metabolicScore?.status === 'insufficient' ? (
                    <View style={styles.notEnoughDataContainer}>
                        <Ionicons name="analytics-outline" size={32} color="#878787" />
                        <Text style={styles.notEnoughDataText}>
                            Not enough data to compute a score. Try adding lab results or connecting your wearable for at least 5 days.
                        </Text>
                        <TouchableOpacity
                            style={styles.addLabsButton}
                            onPress={() => router.push('/labs-health-info' as any)}
                        >
                            <Text style={styles.addLabsButtonText}>Add Lab Results</Text>
                        </TouchableOpacity>
                    </View>
                ) : metabolicScore ? (
                    <View>
                        {/* Improved Score UI */}
                        <View style={styles.scoreContainer}>
                            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 8, marginBottom: 4 }}>
                                <Text style={[
                                    styles.scoreNumber,
                                    metabolicScore.band === 'low' && styles.scoreGreat,
                                    metabolicScore.band === 'medium' && styles.scoreModerate,
                                    metabolicScore.band === 'high' && styles.scoreNeedsAttention,
                                ]}>
                                    {metabolicScore.metabolic_response_score}
                                </Text>

                            </View>

                            {/* Progress Bar (Strain Meter) */}
                            <View style={{ height: 6, backgroundColor: '#2A2A2E', borderRadius: 3, marginVertical: 12, width: '100%', overflow: 'hidden' }}>
                                <View
                                    style={{
                                        width: `${metabolicScore.metabolic_response_score || 0}%`,
                                        height: '100%',
                                        backgroundColor: metabolicScore.band === 'low' ? '#4CAF50' : metabolicScore.band === 'medium' ? '#FF9800' : '#F44336',
                                        borderRadius: 3
                                    }}
                                />
                            </View>

                        </View>

                        {/* Simplified Drivers - Max 2 items, truncated */}
                        <Text style={[styles.driversTitle, { marginTop: 16, marginBottom: 8 }]}>Leading Factors</Text>
                        <View style={{ gap: 8, marginBottom: 16 }}>
                            {metabolicScore.drivers.slice(0, 2).map((driver, index) => (
                                <View key={index} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                                    <Ionicons
                                        name={metabolicScore.band === 'low' ? "checkmark-circle" : "information-circle"}
                                        size={18}
                                        color={metabolicScore.band === 'low' ? "#4CAF50" : "#878787"}
                                    />
                                    <View style={{ flex: 1 }}>
                                        <Text numberOfLines={1} style={{ fontFamily: fonts.regular, fontSize: 13, color: '#E1E1E1' }}>
                                            {driver.text}
                                        </Text>
                                    </View>
                                </View>
                            ))}
                        </View>

                        <View style={styles.dataSourcesRow}>
                            <Text style={styles.dataSourcesLabel}>Data sources:</Text>
                            <Text style={styles.dataSourcesValue}>
                                {metabolicScore.wearables_days} wearable days
                                {metabolicScore.lab_present ? ' • Labs' : ''}
                            </Text>
                        </View>

                        <TouchableOpacity
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: '#252527',
                                paddingVertical: 16,
                                borderRadius: 16,
                                marginTop: 20,
                                gap: 8,
                                width: '100%'
                            }}
                            activeOpacity={0.7}
                            onPress={() => router.push('/labs-health-info' as any)}
                        >
                            <Ionicons name="add-circle-sharp" size={20} color="#3494D9" />
                            <Text style={{ fontSize: 16, fontFamily: fonts.semiBold, color: '#FFFFFF' }}>
                                {metabolicScore.lab_present ? 'Update Lab Results' : 'Add Lab Results'}
                            </Text>
                        </TouchableOpacity>

                        <Disclaimer variant="short" style={styles.metabolicDisclaimer} />
                    </View>
                ) : (
                    <Text style={styles.noDataText}>Unable to load score</Text>
                )}
            </View>

            {/* Data Sufficiency Check */}
            {!hasSufficientData ? renderInsufficientData() : (
                <>
                    {/* Time of Day Comparison */}
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>Time of Day Comparison</Text>
                        <TimeOfDayChart data={timeOfDayData} />
                        <Text style={styles.insightText}>{timeOfDayInsight}</Text>
                    </View>

                    {/* Weekday vs Weekend */}
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>Weekday vs Weekend Comparison</Text>
                        <WeekdayWeekendComparison
                            weekdayData={weekdayData}
                            weekendData={weekendData}
                        />
                        <Text style={styles.insightText}>{weekdayInsight}</Text>
                    </View>


                    {/* Behavioral Impacts - HIDDEN (Logic not implemented) */}

                    {/* Best & Worst Meal Comparison - Feature deprecated during regulatory cleanup */}
                    {/* Best & Worst Meal Comparison */}
                    <View style={styles.mealComparisonSection}>
                        <Text style={styles.mealComparisonTitle}>Best & Worst Meal Comparison</Text>
                        <View style={styles.mealComparisonCard}>
                            {!bestMeal && !worstMeal ? (
                                <MealComparisonEmpty />
                            ) : (
                                <>
                                    <View style={styles.mealTabs}>
                                        <TouchableOpacity
                                            onPress={() => setMealTab('highest')}
                                            style={[styles.mealTabItem, mealTab === 'highest' && styles.mealTabItemActive]}
                                        >
                                            <Text style={[styles.mealTabText, mealTab === 'highest' && styles.mealTabTextActive]}>
                                                Best Meal
                                            </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={() => setMealTab('lowest')}
                                            style={[styles.mealTabItem, mealTab === 'lowest' && styles.mealTabItemActive]}
                                        >
                                            <Text style={[styles.mealTabText, mealTab === 'lowest' && styles.mealTabTextActive]}>
                                                Worst Meal
                                            </Text>
                                        </TouchableOpacity>
                                    </View>

                                    {mealTab === 'highest' && bestMeal && (
                                        <View style={styles.mealCardContent}>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                <View>
                                                    <Text style={{ fontFamily: fonts.semiBold, fontSize: 16, color: '#FFFFFF', marginBottom: 4 }}>
                                                        {bestMeal.name}
                                                    </Text>
                                                    <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: '#878787' }}>
                                                        {new Date(bestMeal.logged_at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                    </Text>
                                                </View>
                                                <View style={{ backgroundColor: 'rgba(76, 175, 80, 0.2)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 }}>
                                                    <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: '#4CAF50' }}>Top Rated</Text>
                                                </View>
                                            </View>

                                            {bestMeal.meal_checkins?.[0] && (
                                                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                                                    {bestMeal.meal_checkins[0].energy && (
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#22282C', padding: 6, borderRadius: 6 }}>
                                                            <Ionicons name="flash" size={12} color="#FFD700" />
                                                            <Text style={{ color: '#DDD', fontSize: 12, fontFamily: fonts.medium }}>
                                                                {bestMeal.meal_checkins[0].energy.charAt(0).toUpperCase() + bestMeal.meal_checkins[0].energy.slice(1)} Energy
                                                            </Text>
                                                        </View>
                                                    )}
                                                    {bestMeal.meal_checkins[0].mood && (
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#22282C', padding: 6, borderRadius: 6 }}>
                                                            <Ionicons name="happy" size={12} color="#0E9CFF" />
                                                            <Text style={{ color: '#DDD', fontSize: 12, fontFamily: fonts.medium }}>
                                                                {bestMeal.meal_checkins[0].mood.charAt(0).toUpperCase() + bestMeal.meal_checkins[0].mood.slice(1)} Mood
                                                            </Text>
                                                        </View>
                                                    )}
                                                </View>
                                            )}
                                        </View>
                                    )}

                                    {mealTab === 'lowest' && (
                                        worstMeal ? (
                                            <View style={styles.mealCardContent}>
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                    <View>
                                                        <Text style={{ fontFamily: fonts.semiBold, fontSize: 16, color: '#FFFFFF', marginBottom: 4 }}>
                                                            {worstMeal.name}
                                                        </Text>
                                                        <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: '#878787' }}>
                                                            {new Date(worstMeal.logged_at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                        </Text>
                                                    </View>
                                                    <View style={{ backgroundColor: 'rgba(244, 67, 54, 0.2)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 }}>
                                                        <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: '#F44336' }}>Review</Text>
                                                    </View>
                                                </View>

                                                {worstMeal.meal_checkins?.[0] && (
                                                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                                                        {worstMeal.meal_checkins[0].energy && (
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#22282C', padding: 6, borderRadius: 6 }}>
                                                                <Ionicons name="flash-outline" size={12} color="#FFD700" />
                                                                <Text style={{ color: '#DDD', fontSize: 12, fontFamily: fonts.medium }}>
                                                                    {worstMeal.meal_checkins[0].energy.charAt(0).toUpperCase() + worstMeal.meal_checkins[0].energy.slice(1)} Energy
                                                                </Text>
                                                            </View>
                                                        )}
                                                        {worstMeal.meal_checkins[0].mood && (
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#22282C', padding: 6, borderRadius: 6 }}>
                                                                <Ionicons name="sad-outline" size={12} color="#F44336" />
                                                                <Text style={{ color: '#DDD', fontSize: 12, fontFamily: fonts.medium }}>
                                                                    {worstMeal.meal_checkins[0].mood.charAt(0).toUpperCase() + worstMeal.meal_checkins[0].mood.slice(1)} Mood
                                                                </Text>
                                                            </View>
                                                        )}
                                                    </View>
                                                )}
                                            </View>
                                        ) : (
                                            <View style={{ padding: 20, alignItems: 'center' }}>
                                                <Text style={{ color: '#878787', fontFamily: fonts.regular }}>
                                                    Great job! No poorly rated meals found this week.
                                                </Text>
                                            </View>
                                        )
                                    )}
                                </>
                            )}
                        </View>
                    </View>
                </>
            )
            }

            {/* Bottom spacing for tab bar */}
            <View style={{ height: 160 }} />
        </ScrollView >
    );

    const renderTrends = () => {
        // Calculate percentages and dynamic text


        const handleRangePress = () => {
            Alert.alert(
                'Select Time Range',
                'Choose the period for data analysis',
                [
                    { text: 'Last 7 Days', onPress: () => setInsightsRangeDays(7) },
                    { text: 'Last 14 Days', onPress: () => setInsightsRangeDays(14) },
                    { text: 'Last 30 Days', onPress: () => setInsightsRangeDays(30) },
                    { text: 'Last 90 Days', onPress: () => setInsightsRangeDays(90) },
                    { text: 'Cancel', style: 'cancel' }
                ]
            );
        };

        return (
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                {/* Date filter row */}
                <TouchableOpacity
                    style={styles.trendsDateRow}
                    onPress={handleRangePress}
                    activeOpacity={0.7}
                >
                    <Text style={styles.trendsDateText}>Last {insightsRangeDays} Days</Text>
                    <Ionicons name="options-outline" size={20} color="#E7E8E9" />
                </TouchableOpacity>

                {/* Daily Patterns Card (New) */}
                <View style={styles.trendsCard}>
                    <View style={styles.trendsCardHeader}>
                        <Text style={styles.trendsCardTitle}>Daily Patterns</Text>
                        <Text style={styles.trendsCardDescription}>
                            Average glucose levels across different times of the day.
                        </Text>
                    </View>

                    {!hasSufficientData ? (
                        <View style={{ alignItems: 'center', padding: 24, gap: 12 }}>
                            <Image source={Images.mascots.thinking} style={{ width: 80, height: 80, resizeMode: 'contain' }} />
                            <Text style={{ fontFamily: fonts.semiBold, fontSize: 18, color: '#FFFFFF', textAlign: 'center' }}>
                                Not Enough Data Yet
                            </Text>
                            <Text style={{ fontFamily: fonts.regular, fontSize: 14, color: '#878787', textAlign: 'center', lineHeight: 20 }}>
                                We need at least 7 days of glucose data to generate meaningful insights and trends. Keep logging!
                            </Text>
                        </View>
                    ) : (
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 120, paddingHorizontal: 10, marginBottom: 10 }}>
                            {timeOfDayData.map((item, index) => {
                                const maxVal = Math.max(...timeOfDayData.map(d => d.avgValue)) || 1;
                                const height = (item.avgValue / maxVal) * 100;
                                return (
                                    <View key={index} style={{ alignItems: 'center', width: '20%' }}>
                                        <Text style={{ fontSize: 11, fontFamily: fonts.semiBold, color: '#FFFFFF', marginBottom: 4 }}>
                                            {formatGlucoseWithUnit(item.avgValue, glucoseUnit).split(' ')[0]}
                                        </Text>
                                        <View style={{ width: '100%', height: 80, justifyContent: 'flex-end', backgroundColor: '#2A2A2E', borderRadius: 6, overflow: 'hidden' }}>
                                            <View style={{
                                                width: '100%',
                                                height: `${height}%`,
                                                backgroundColor: '#3494D9',
                                                borderRadius: 6
                                            }} />
                                        </View>
                                        <Text style={{ fontSize: 10, color: '#878787', marginTop: 8, textTransform: 'capitalize' }}>
                                            {item.period.slice(0, 3)}
                                        </Text>
                                    </View>
                                );
                            })}
                        </View>
                    )}
                </View>

                {/* Meal Impacts Card */}
                {!hasSufficientData ? null : (
                    <>
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
                                            { value: trendStats.steady, color: '#4CAF50', label: 'Steady' },
                                            { value: trendStats.mild, color: '#FF9800', label: 'Mild' },
                                            { value: trendStats.spike, color: '#F44336', label: 'Spikes' },
                                        ]}
                                    />
                                </View>
                            </View>
                        </View>

                        {/* Glucose Health Card (New Stats) */}
                        <View style={styles.trendsCard}>
                            <View style={styles.trendsCardHeader}>
                                <Text style={styles.trendsCardTitle}>Glucose Health</Text>
                                <Text style={styles.trendsCardDescription}>
                                    Key metrics showing your overall stability and average levels.
                                </Text>
                            </View>

                            <View style={styles.peakComparisonContent}>
                                {/* Time in Target */}
                                <View style={styles.trendBarRow}>
                                    <Text style={styles.trendBarLabel}>Time in Target</Text>
                                    <View style={styles.trendBarContainer}>
                                        <View style={[styles.trendBar, { width: `${glucoseStats.tir}%`, backgroundColor: '#4CAF50' }]} />
                                    </View>
                                    <Text style={styles.trendBarValue}>{glucoseStats.tir.toFixed(0)}%</Text>
                                </View>

                                {/* Average Glucose */}
                                <View style={styles.trendBarRow}>
                                    <Text style={styles.trendBarLabel}>Average Glucose</Text>
                                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                                        <Text style={styles.trendBarValue}>
                                            {formatGlucoseWithUnit(glucoseStats.average, glucoseUnit)}
                                        </Text>
                                    </View>
                                </View>
                            </View>

                            <Text style={styles.trendsInsightText}>
                                You spent {glucoseStats.tir.toFixed(0)}% of the time in the healthy range (70-180 mg/dL).
                                {glucoseStats.tir > 70 ? ' Great job!' : ' Aim for over 70%.'}
                            </Text>
                        </View>

                        {/* Glucose Variability Card (New Trend) */}
                        <View style={styles.trendsCard}>
                            <View style={styles.trendsCardHeader}>
                                <Text style={styles.trendsCardTitle}>Glucose Variability</Text>
                                <Text style={styles.trendsCardDescription}>
                                    Measures how much your levels swing. Lower is more stable.
                                </Text>
                            </View>

                            <View style={styles.peakComparisonContent}>
                                <View style={{ alignItems: 'center', marginBottom: 10 }}>
                                    <Text style={{ fontSize: 32, fontFamily: fonts.bold, color: '#FFFFFF' }}>
                                        {glucoseStats.variability.toFixed(1)}%
                                    </Text>
                                    <Text style={{ fontSize: 13, color: '#878787', marginTop: 4 }}>
                                        Coefficient of Variation (CV)
                                    </Text>
                                </View>

                                {/* Visual Bar for CV */}
                                <View style={{ width: '100%', height: 6, backgroundColor: '#2A2A2E', borderRadius: 3, marginBottom: 8, overflow: 'hidden' }}>
                                    {/* 3 Zones: <20 (Good), 20-33 (Moderate), >33 (Unstable) */}
                                    <View style={{ width: '33%', height: '100%', backgroundColor: '#4CAF50', position: 'absolute', left: 0, opacity: 0.3 }} />
                                    <View style={{ width: '22%', height: '100%', backgroundColor: '#FF9800', position: 'absolute', left: '33%', opacity: 0.3 }} />
                                    <View style={{ width: '45%', height: '100%', backgroundColor: '#F44336', position: 'absolute', left: '55%', opacity: 0.3 }} />

                                    {/* Indicator */}
                                    <View style={{
                                        position: 'absolute',
                                        left: `${Math.min(glucoseStats.variability * 1.66, 100)}%`, // Scale roughly 0-60% range to 0-100 bar width 
                                        width: 8,
                                        height: 8,
                                        top: -1,
                                        borderRadius: 4,
                                        backgroundColor: '#FFFFFF',
                                        marginLeft: -4
                                    }} />
                                </View>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                    <Text style={{ fontSize: 10, color: '#4CAF50' }}>Stable (&lt;20%)</Text>
                                    <Text style={{ fontSize: 10, color: '#F44336' }}>Variable (&gt;33%)</Text>
                                </View>
                            </View>

                            <Text style={styles.trendsInsightText}>
                                {glucoseStats.variability < 20
                                    ? "Your stability is excellent! Very few swings."
                                    : glucoseStats.variability < 33
                                        ? "You have moderate fluctuations. Try pairing carbs with protein."
                                        : "Your levels are swinging significantly. Focus on flattening the spikes."}
                            </Text>
                        </View>

                    </>
                )}

                {/* Bottom spacing for tab bar */}
                <View style={{ height: 160 }} />
            </ScrollView>
        );
    };

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

            {/* My Experiments Link */}
            <TouchableOpacity
                style={styles.myExperimentsCard}
                onPress={() => router.push('/experiments-list' as any)}
                activeOpacity={0.8}
            >
                <LinearGradient
                    colors={['#313135', '#2A2A2E']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.myExperimentsGradient}
                >
                    <View style={styles.myExperimentsContent}>
                        <View style={styles.myExperimentsIconContainer}>
                            <Image source={Images.mascots.thinking} style={{ width: 56, height: 56, resizeMode: 'contain' }} />
                        </View>
                        <View style={styles.myExperimentsTextContainer}>
                            <Text style={styles.myExperimentsTitle}>My Experiments</Text>
                            <Text style={styles.myExperimentsSubtitle}>View active & completed</Text>
                        </View>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#666" />
                </LinearGradient>
            </TouchableOpacity>

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
                                    (startingExperiment === suggestion.template.id || successExperiment === suggestion.template.id) && styles.experimentButtonDisabled,
                                ]}
                                onPress={() => handleStartExperiment(suggestion)}
                                disabled={startingExperiment === suggestion.template.id || successExperiment === suggestion.template.id}
                                activeOpacity={0.7}
                            >
                                {startingExperiment === suggestion.template.id ? (
                                    <ActivityIndicator size="small" color="#FFFFFF" />
                                ) : successExperiment === suggestion.template.id ? (
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                        <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                                        <Text style={styles.experimentButtonText}>Started</Text>
                                    </View>
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

                    {/* Success Overlay */}
                    {activeTab === 'experiments' && successExperiment && (
                        <View style={styles.successOverlay}>
                            <View style={styles.successCard}>
                                <Ionicons name="checkmark-circle" size={80} color="#4CAF50" />
                                <Text style={styles.successTitle}>Experiment Started!</Text>
                                <Text style={styles.successSubtitle}>Good luck!</Text>
                            </View>
                        </View>
                    )}
                </SafeAreaView>
            </View>
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

    // Insufficient Data
    insufficientDataContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        gap: 12,
        minHeight: 200,
    },
    insufficientDataTitle: {
        fontFamily: fonts.bold,
        fontSize: 18,
        color: '#FFFFFF',
        textAlign: 'center',
    },
    insufficientDataText: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#8E8E93',
        textAlign: 'center',
        lineHeight: 20,
    },

    // Success Overlay
    successOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
    },
    successCard: {
        backgroundColor: '#1C1C1E',
        borderRadius: 24,
        padding: 32,
        alignItems: 'center',
        width: '80%',
        gap: 16,
        borderWidth: 1,
        borderColor: '#3494D9',
    },
    successTitle: {
        fontFamily: fonts.bold,
        fontSize: 24,
        color: '#FFFFFF',
        marginTop: 8,
    },
    successSubtitle: {
        fontFamily: fonts.regular,
        fontSize: 16,
        color: '#E7E8E9',
    },

    // My Experiments Card (Premium)
    myExperimentsCard: {
        marginBottom: 24, // Matches gap or spacing
        borderRadius: 16,
        overflow: 'hidden',
    },
    myExperimentsBackground: {
        padding: 20,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    myExperimentsTitle: {
        fontFamily: fonts.bold,
        fontSize: 18,
        color: '#FFFFFF',
    },
    myExperimentsSubtitle: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: 'rgba(255,255,255,0.8)',
        marginTop: 4,
    },


    // Metabolic Score
    metabolicScoreHeader: {
        marginBottom: 16,
    },
    metabolicScoreTitle: {
        fontFamily: fonts.bold,
        fontSize: 20,
        color: '#FFFFFF',
    },
    metabolicDisclaimer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 4,
    },

    // Confidence Badge
    confidenceBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        backgroundColor: '#1E1E1E',
        alignSelf: 'flex-start',
        marginTop: 8,
        gap: 6,
    },
    confidenceHigh: {
        backgroundColor: 'rgba(76, 175, 80, 0.2)',
    },
    confidenceMedium: {
        backgroundColor: 'rgba(255, 152, 0, 0.2)',
    },
    confidenceLow: {
        backgroundColor: 'rgba(244, 67, 54, 0.2)',
    },
    confidenceText: {
        fontFamily: fonts.medium,
        fontSize: 12,
        color: '#FFFFFF',
    },

    // Not Enough Data
    notEnoughDataContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        backgroundColor: '#1C1C1E',
        borderRadius: 16,
        gap: 12,
    },
    notEnoughDataText: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#8E8E93',
        textAlign: 'center',
        lineHeight: 20,
    },
    noDataText: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#8E8E93',
        marginTop: 8,
    },

    // Add Labs Button
    addLabsButton: {
        backgroundColor: '#3494D9',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
        marginTop: 12,
    },
    addLabsButtonText: {
        fontFamily: fonts.bold,
        fontSize: 14,
        color: '#FFFFFF',
    },
    addLabsButtonSecondary: {
        marginTop: 12,
        padding: 8,
    },
    addLabsButtonSecondaryText: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: '#3494D9',
    },

    // Score Display
    scoreContainer: {
        alignItems: 'center',
        marginVertical: 24,
    },
    scoreNumber: {
        fontFamily: fonts.bold,
        fontSize: 48,
        color: '#FFFFFF',
    },
    scoreBand: {
        fontFamily: fonts.bold,
        fontSize: 18,
        marginTop: 4,
    },
    scoreGreat: { color: '#4CAF50' },
    scoreModerate: { color: '#FF9800' },
    scoreNeedsAttention: { color: '#F44336' },

    // Drivers
    driversTitle: {
        fontFamily: fonts.bold,
        fontSize: 16,
        color: '#FFFFFF',
        marginBottom: 12,
    },
    driverItem: {
        flexDirection: 'row',
        marginBottom: 12,
        gap: 12,
    },
    driverBullet: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#3494D9',
        marginTop: 8,
    },
    driverContent: {
        flex: 1,
        gap: 2,
    },
    driverDetail: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: '#8E8E93',
    },

    // Data Sources
    dataSourcesRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#2A2A2E',
    },
    dataSourcesLabel: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#8E8E93',
    },
    dataSourcesValue: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: '#FFFFFF',
    },

    // My Experiments Extra
    myExperimentsGradient: {
        borderRadius: 16,
        padding: 20,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    myExperimentsContent: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    myExperimentsIconContainer: {
        width: 56,
        height: 56,
        alignItems: 'center',
        justifyContent: 'center',
    },
    myExperimentsTextContainer: {
        flex: 1,
    },
});
