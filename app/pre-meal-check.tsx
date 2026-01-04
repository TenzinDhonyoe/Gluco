import { useAuth, useGlucoseUnit } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { schedulePostMealReviewNotification } from '@/lib/notifications';
import {
    addMealItems,
    createMeal,
    createPostMealReview,
    invokePremealAnalyze,
    PremealAdjustmentTip,
    PremealCurvePoint,
    PremealDriver,
    PremealMealDraft
} from '@/lib/supabase';
import { formatGlucose, GlucoseUnit } from '@/lib/utils/glucoseUnits';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo } from 'react';
import {
    Alert,
    Animated,
    Easing,
    Image,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';

// Types
interface MealItem {
    provider: 'fdc' | 'off';
    external_id: string;
    display_name: string;
    brand?: string | null;
    quantity: number;
    calories_kcal?: number | null;
    carbs_g?: number | null;
    protein_g?: number | null;
    fat_g?: number | null;
    fibre_g?: number | null;
    sugar_g?: number | null;
    sodium_mg?: number | null;
    serving_size?: number | null;
    serving_unit?: string | null;
}

// Spike Risk Gauge Component
function SpikeRiskGauge({ risk }: { risk: number }) {
    const size = 56;
    const strokeWidth = 5;
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const strokeDashoffset = circumference - (risk / 100) * circumference;

    // Color based on risk
    const getColor = () => {
        if (risk < 50) return '#4CAF50';
        if (risk < 75) return '#FF9800';
        return '#F44336';
    };

    return (
        <View style={gaugeStyles.container}>
            <Svg width={size} height={size}>
                {/* Background circle */}
                <Circle
                    stroke="#2A2D30"
                    fill="none"
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    strokeWidth={strokeWidth}
                />
                {/* Progress circle */}
                <Circle
                    stroke={getColor()}
                    fill="none"
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    strokeWidth={strokeWidth}
                    strokeDasharray={`${circumference} ${circumference}`}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                />
            </Svg>
            {/* Centered text overlay */}
            <View style={gaugeStyles.textOverlay}>
                <Text style={gaugeStyles.percentText}>{risk} %</Text>
            </View>
        </View>
    );
}

const gaugeStyles = StyleSheet.create({
    container: {
        width: 56,
        height: 56,
        alignItems: 'center',
        justifyContent: 'center',
    },
    textOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
    },
    percentText: {
        fontFamily: fonts.semiBold,
        fontSize: 13,
        color: '#FFFFFF',
    },
});

// AI Loading Screen with mascot and animated wave dots
function AILoadingScreen() {
    // Create animated values for each dot
    const dot1Anim = React.useRef(new Animated.Value(0)).current;
    const dot2Anim = React.useRef(new Animated.Value(0)).current;
    const dot3Anim = React.useRef(new Animated.Value(0)).current;

    React.useEffect(() => {
        // Wave animation for dots
        const createDotAnimation = (animValue: Animated.Value, delay: number) => {
            return Animated.loop(
                Animated.sequence([
                    Animated.delay(delay),
                    Animated.timing(animValue, {
                        toValue: 1,
                        duration: 400,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: true,
                    }),
                    Animated.timing(animValue, {
                        toValue: 0,
                        duration: 400,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: true,
                    }),
                ])
            );
        };

        const anim1 = createDotAnimation(dot1Anim, 0);
        const anim2 = createDotAnimation(dot2Anim, 150);
        const anim3 = createDotAnimation(dot3Anim, 300);

        anim1.start();
        anim2.start();
        anim3.start();

        return () => {
            anim1.stop();
            anim2.stop();
            anim3.stop();
        };
    }, [dot1Anim, dot2Anim, dot3Anim]);

    const getDotStyle = (animValue: Animated.Value) => ({
        transform: [
            {
                translateY: animValue.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -12],
                }),
            },
            {
                scale: animValue.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 1.2],
                }),
            },
        ],
        opacity: animValue.interpolate({
            inputRange: [0, 1],
            outputRange: [0.7, 1],
        }),
    });

    return (
        <View style={loadingStyles.container}>
            <LinearGradient
                colors={['#111111', '#1A1B1C', '#111111']}
                style={loadingStyles.gradient}
            />

            {/* Mascot Image */}
            <Image
                source={require('@/assets/images/mascot-thinking.png')}
                style={loadingStyles.mascot}
                resizeMode="contain"
            />

            {/* Loading Text */}
            <Text style={loadingStyles.thinkingText}>Analyzing your meal...</Text>

            {/* Animated Wave Dots */}
            <View style={loadingStyles.dotsContainer}>
                <Animated.View style={[loadingStyles.dot, getDotStyle(dot1Anim)]}>
                    <LinearGradient
                        colors={['#4CAF50', '#8BC34A']}
                        style={loadingStyles.dotGradient}
                    />
                </Animated.View>
                <Animated.View style={[loadingStyles.dot, getDotStyle(dot2Anim)]}>
                    <LinearGradient
                        colors={['#3494D9', '#64B5F6']}
                        style={loadingStyles.dotGradient}
                    />
                </Animated.View>
                <Animated.View style={[loadingStyles.dot, getDotStyle(dot3Anim)]}>
                    <LinearGradient
                        colors={['#FF9800', '#FFB74D']}
                        style={loadingStyles.dotGradient}
                    />
                </Animated.View>
            </View>

            <Text style={loadingStyles.subText}>Gluco is thinking...</Text>
        </View>
    );
}

const loadingStyles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#111111',
        alignItems: 'center',
        justifyContent: 'center',
    },
    gradient: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    mascot: {
        width: 180,
        height: 180,
        marginBottom: 32,
    },
    thinkingText: {
        fontFamily: fonts.semiBold,
        fontSize: 20,
        color: '#FFFFFF',
        marginBottom: 24,
    },
    dotsContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        marginBottom: 16,
    },
    dot: {
        width: 16,
        height: 16,
        borderRadius: 8,
        overflow: 'hidden',
    },
    dotGradient: {
        width: '100%',
        height: '100%',
        borderRadius: 8,
    },
    subText: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#878787',
        marginTop: 8,
    },
});

// Dynamic Glucose Chart - renders personalized prediction curve
function DynamicGlucoseChart({ curveData, mealTime, glucoseUnit }: {
    curveData: PremealCurvePoint[];
    mealTime: Date;
    glucoseUnit: GlucoseUnit;
}) {
    // Calculate chart dimensions
    const chartWidth = 280;
    const chartHeight = 100;

    // Y-axis range (glucose values 4-15 mmol/L)
    const minY = 4;
    const maxY = 14;
    const yRange = maxY - minY;

    // Generate path from curve data
    const generatePath = () => {
        if (!curveData || curveData.length === 0) {
            // Default fallback curve
            return `M0,${chartHeight / 2} L${chartWidth},${chartHeight / 2}`;
        }

        // Map curve points to SVG coordinates
        const points = curveData.map((point, index) => {
            const x = (point.t_min / 180) * chartWidth;
            // glucose_delta now contains actual glucose value from API
            const glucoseValue = point.glucose_delta;
            const y = chartHeight - ((glucoseValue - minY) / yRange) * chartHeight;
            return { x, y: Math.max(5, Math.min(chartHeight - 5, y)), value: glucoseValue };
        });

        // Create smooth curve path using bezier curves
        if (points.length < 2) return `M0,${chartHeight / 2}`;

        let path = `M${points[0].x},${points[0].y}`;
        for (let i = 1; i < points.length; i++) {
            const prev = points[i - 1];
            const curr = points[i];
            const cp1x = prev.x + (curr.x - prev.x) / 3;
            const cp2x = prev.x + 2 * (curr.x - prev.x) / 3;
            path += ` C${cp1x},${prev.y} ${cp2x},${curr.y} ${curr.x},${curr.y}`;
        }

        return path;
    };

    // Find peak point for marker
    const getPeakPoint = () => {
        if (!curveData || curveData.length === 0) return null;

        let maxVal = -Infinity;
        let peakIndex = 0;
        curveData.forEach((point, index) => {
            if (point.glucose_delta > maxVal) {
                maxVal = point.glucose_delta;
                peakIndex = index;
            }
        });

        const peak = curveData[peakIndex];
        const x = (peak.t_min / 180) * chartWidth;
        const y = chartHeight - ((peak.glucose_delta - minY) / yRange) * chartHeight;
        return { x, y: Math.max(15, Math.min(chartHeight - 5, y)), value: peak.glucose_delta };
    };

    // Generate fill path (closed)
    const generateFillPath = () => {
        const linePath = generatePath();
        return `${linePath} L${chartWidth},${chartHeight} L0,${chartHeight} Z`;
    };

    // Generate time labels based on meal time
    const getTimeLabels = () => {
        const labels: string[] = [];
        for (let i = 0; i <= 6; i++) {
            const mins = i * 30;
            const time = new Date(mealTime.getTime() + mins * 60 * 1000);
            const h = time.getHours() % 12 || 12;
            const m = time.getMinutes();
            const ampm = time.getHours() >= 12 ? 'PM' : 'AM';
            labels.push(`${h}:${m.toString().padStart(2, '0')}${ampm}`);
        }
        return labels;
    };

    const path = generatePath();
    const fillPath = generateFillPath();
    const peak = getPeakPoint();
    const timeLabels = getTimeLabels();

    return (
        <View style={chartStyles.container}>
            <View style={chartStyles.yAxis}>
                <Text style={chartStyles.yLabel}>{formatGlucose(14, glucoseUnit)}</Text>
                <Text style={chartStyles.yLabel}>{formatGlucose(11, glucoseUnit)}</Text>
                <Text style={chartStyles.yLabel}>{formatGlucose(8, glucoseUnit)}</Text>
                <Text style={chartStyles.yLabel}>{formatGlucose(5, glucoseUnit)}</Text>
            </View>
            <View style={chartStyles.chartArea}>
                <Svg width="100%" height="100%" viewBox={`0 0 ${chartWidth} ${chartHeight + 10}`} preserveAspectRatio="none">
                    {/* Grid lines */}
                    <Path d="M0,0 L280,0" stroke="rgba(255,255,255,0.15)" strokeWidth={0.5} strokeDasharray="4,4" />
                    <Path d="M0,33 L280,33" stroke="rgba(255,255,255,0.15)" strokeWidth={0.5} strokeDasharray="4,4" />
                    <Path d="M0,66 L280,66" stroke="rgba(255,255,255,0.15)" strokeWidth={0.5} strokeDasharray="4,4" />
                    <Path d="M0,100 L280,100" stroke="rgba(255,255,255,0.15)" strokeWidth={0.5} strokeDasharray="4,4" />

                    {/* Fill under curve */}
                    <Path d={fillPath} fill="rgba(52, 148, 217, 0.2)" />

                    {/* Main curve */}
                    <Path d={path} stroke="#3494D9" strokeWidth={2.5} fill="none" strokeLinecap="round" />

                    {/* Peak marker */}
                    {peak && (
                        <>
                            <Circle cx={peak.x} cy={peak.y} r={5} fill="#3494D9" />
                            <SvgText
                                x={peak.x}
                                y={peak.y - 10}
                                textAnchor="middle"
                                fill="#FFFFFF"
                                fontSize={11}
                                fontWeight="600"
                            >
                                {formatGlucose(peak.value, glucoseUnit)}
                            </SvgText>
                        </>
                    )}
                </Svg>

                {/* X axis labels */}
                <View style={chartStyles.xAxis}>
                    {timeLabels.map((label, i) => (
                        <Text key={i} style={chartStyles.xLabel}>{label}</Text>
                    ))}
                </View>
            </View>
        </View>
    );
}

const chartStyles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        height: 150,
        marginTop: 8,
    },
    yAxis: {
        width: 26,
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        paddingRight: 6,
        paddingVertical: 4,
    },
    yLabel: {
        fontFamily: fonts.regular,
        fontSize: 10,
        color: '#878787',
    },
    chartArea: {
        flex: 1,
    },
    xAxis: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 4,
    },
    xLabel: {
        fontFamily: fonts.regular,
        fontSize: 7,
        color: '#878787',
    },
});

export default function PreMealCheckScreen() {
    const params = useLocalSearchParams();
    const { user } = useAuth();
    const glucoseUnit = useGlucoseUnit();

    // Parse meal data from params
    const mealName = (params.mealName as string) || 'Meal';
    const mealTime = params.mealTime ? new Date(params.mealTime as string) : new Date();
    const imageUri = params.imageUri as string | undefined;

    const mealItems: MealItem[] = useMemo(() => {
        try {
            if (params.mealItems) {
                return JSON.parse(params.mealItems as string);
            }
        } catch (e) {
            console.error('Failed to parse meal items:', e);
        }
        return [];
    }, [params.mealItems]);

    // Calculate total macros
    const totalMacros = useMemo(() => {
        return mealItems.reduce(
            (acc, item) => ({
                carbs: acc.carbs + ((item.carbs_g || 0) * item.quantity),
                protein: acc.protein + ((item.protein_g || 0) * item.quantity),
                fiber: acc.fiber + ((item.fibre_g || 0) * item.quantity),
                fat: acc.fat + ((item.fat_g || 0) * item.quantity),
                calories: acc.calories + ((item.calories_kcal || 0) * item.quantity),
            }),
            { carbs: 0, protein: 0, fiber: 0, fat: 0, calories: 0 }
        );
    }, [mealItems]);

    // API State
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [spikeRisk, setSpikeRisk] = React.useState(0);
    const [predictedCurve, setPredictedCurve] = React.useState<PremealCurvePoint[]>([]);
    const [drivers, setDrivers] = React.useState<PremealDriver[]>([]);
    const [tips, setTips] = React.useState<(PremealAdjustmentTip & { id: string; selected: boolean })[]>([]);

    // Ref to track if analysis has been done (prevent multiple calls)
    const analysisStarted = React.useRef(false);

    // Fetch AI analysis ONCE on mount
    React.useEffect(() => {
        // Only run analysis once
        if (analysisStarted.current) return;

        async function fetchAnalysis() {
            if (!user?.id || mealItems.length === 0) {
                setLoading(false);
                // Use local fallback if no meal items
                const netCarbs = Math.max(totalMacros.carbs - totalMacros.fiber, 0);
                const risk = Math.round(Math.min(80, netCarbs * 1.2 + 20));
                setSpikeRisk(risk);
                setDrivers([
                    { text: 'Add food items to get AI-powered predictions.', reason_code: 'NO_ITEMS' }
                ]);
                setTips([
                    { id: '1', title: 'Take a post-meal walk', detail: '10-15 mins of walking helps', risk_reduction_pct: 12, action_type: 'POST_MEAL_WALK', selected: false },
                ]);
                return;
            }

            // Mark as started to prevent re-runs
            analysisStarted.current = true;

            try {
                setLoading(true);
                setError(null);

                // Build meal draft for API
                const mealDraft: PremealMealDraft = {
                    name: mealName,
                    logged_at: mealTime.toISOString(),
                    items: mealItems.map(item => ({
                        display_name: item.display_name,
                        quantity: item.quantity,
                        nutrients: {
                            calories_kcal: item.calories_kcal || undefined,
                            carbs_g: item.carbs_g || undefined,
                            protein_g: item.protein_g || undefined,
                            fat_g: item.fat_g || undefined,
                            fibre_g: item.fibre_g || undefined,
                        },
                    })),
                };

                // Minimum 3-second delay to let user see loading screen
                const minDelay = new Promise(resolve => setTimeout(resolve, 3000));

                // Run API call and minimum delay in parallel
                const [result] = await Promise.all([
                    invokePremealAnalyze(user.id, mealDraft),
                    minDelay
                ]);

                if (result) {
                    setSpikeRisk(result.spike_risk_pct);
                    setPredictedCurve(result.predicted_curve);
                    setDrivers(result.drivers);
                    setTips(result.adjustment_tips.map((tip, index) => ({
                        ...tip,
                        id: String(index + 1),
                        selected: false,
                    })));
                } else {
                    // Fallback to local calculation
                    const netCarbs = Math.max(totalMacros.carbs - totalMacros.fiber, 0);
                    const risk = Math.round(Math.min(80, netCarbs * 1.2 + 20));
                    setSpikeRisk(risk);
                    setDrivers([
                        { text: 'Analysis unavailable. Showing estimate based on macros.', reason_code: 'FALLBACK' }
                    ]);
                    setTips([
                        { id: '1', title: 'Take a post-meal walk', detail: '10-15 mins of walking helps', risk_reduction_pct: 12, action_type: 'POST_MEAL_WALK', selected: false },
                    ]);
                }
            } catch (err) {
                console.error('Premeal analysis error:', err);
                // Fallback on error
                const netCarbs = Math.max(totalMacros.carbs - totalMacros.fiber, 0);
                const risk = Math.round(Math.min(80, netCarbs * 1.2 + 20));
                setSpikeRisk(risk);
                setDrivers([
                    { text: 'Could not connect to analysis service. Showing estimate.', reason_code: 'ERROR' }
                ]);
                setTips([
                    { id: '1', title: 'Take a post-meal walk', detail: '10-15 mins of walking helps', risk_reduction_pct: 12, action_type: 'POST_MEAL_WALK', selected: false },
                ]);
            } finally {
                setLoading(false);
            }
        }

        fetchAnalysis();
    }, []); // Empty dependency array - run only once on mount

    const toggleTip = (id: string) => {
        setTips(prev =>
            prev.map(tip => (tip.id === id ? { ...tip, selected: !tip.selected } : tip))
        );
    };

    // Calculate adjusted spike risk based on selected tips
    const adjustedSpikeRisk = useMemo(() => {
        const totalReduction = tips
            .filter(tip => tip.selected)
            .reduce((sum, tip) => sum + tip.risk_reduction_pct, 0);
        return Math.max(0, spikeRisk - totalReduction);
    }, [spikeRisk, tips]);

    const [isSaving, setIsSaving] = React.useState(false);

    const formatTime = (date: Date) => {
        const h = date.getHours();
        const m = date.getMinutes();
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
    };

    const handleLogMeal = async () => {
        if (!user) {
            Alert.alert('Error', 'You must be logged in to save a meal');
            return;
        }
        if (mealItems.length === 0) {
            Alert.alert('Error', 'No food items to log');
            return;
        }

        setIsSaving(true);
        try {
            // Create the meal record
            const meal = await createMeal(user.id, {
                name: mealName,
                meal_type: null, // Could be passed from parent screen
                logged_at: mealTime.toISOString(),
                photo_path: imageUri || null,
                notes: `Spike Risk: ${adjustedSpikeRisk}% (original: ${spikeRisk}%)`,
            });

            if (!meal) {
                Alert.alert('Error', 'Failed to create meal');
                return;
            }

            // Add all meal items
            if (mealItems.length > 0) {
                const items = mealItems.map(item => ({
                    provider: 'fdc' as const,
                    external_id: item.external_id || `temp-${Date.now()}`,
                    display_name: item.display_name,
                    brand: item.brand || null,
                    quantity: item.quantity,
                    unit: 'serving',
                    serving_size: item.serving_size || null,
                    serving_unit: item.serving_unit || null,
                    nutrients: {
                        calories_kcal: item.calories_kcal ?? null,
                        carbs_g: item.carbs_g ?? null,
                        protein_g: item.protein_g ?? null,
                        fat_g: item.fat_g ?? null,
                        fibre_g: item.fibre_g ?? null,
                        sugar_g: item.sugar_g ?? null,
                        sodium_mg: item.sodium_mg ?? null,
                    },
                }));
                await addMealItems(user.id, meal.id, items);
            }

            // Schedule post-meal review notification for 2 hours after meal
            const scheduledFor = new Date(mealTime.getTime() + 2 * 60 * 60 * 1000);

            // Create review row in database
            const review = await createPostMealReview(user.id, {
                meal_id: meal.id,
                scheduled_for: scheduledFor,
                meal_name: mealName,
                meal_time: mealTime,
                predicted_risk_pct: spikeRisk,
                predicted_curve: predictedCurve.map(p => ({ time: p.t_min, value: p.glucose_delta })),
                total_carbs: totalMacros.carbs,
                total_protein: totalMacros.protein,
                total_fibre: totalMacros.fiber,
            });

            // Schedule local notification
            if (review) {
                const notificationId = await schedulePostMealReviewNotification(
                    review.id,
                    meal.id,
                    mealName,
                    scheduledFor
                );
                console.log('Scheduled post-meal review:', review.id, 'notification:', notificationId);
            }

            Alert.alert('Success', 'Meal logged successfully!', [
                { text: 'OK', onPress: () => router.dismissTo('/(tabs)') },
            ]);
        } catch (error) {
            console.error('Save meal error:', error);
            Alert.alert('Error', 'Failed to save meal');
        } finally {
            setIsSaving(false);
        }
    };

    // Show dedicated loading screen while AI is analyzing
    if (loading) {
        return <AILoadingScreen />;
    }

    return (
        <View style={styles.root}>
            <LinearGradient
                colors={['#1a1f24', '#181c20', '#111111']}
                locations={[0, 0.3, 1]}
                style={styles.topGlow}
            />

            <SafeAreaView edges={['top']} style={styles.safe}>
                {/* Header */}
                <View style={styles.header}>
                    <Pressable onPress={() => router.back()} style={styles.headerIconBtn}>
                        <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
                    </Pressable>
                    <Text style={styles.headerTitle}>PRE MEAL CHECK</Text>
                    <View style={styles.headerIconBtnSpacer} />
                </View>

                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.content}
                >
                    {/* Meal Title */}
                    <Text style={styles.mealTitle}>{mealName}</Text>
                    <Text style={styles.mealSubtitle}>
                        {formatTime(mealTime)} • Today
                    </Text>

                    {/* Meal Image */}
                    {imageUri ? (
                        <Image source={{ uri: imageUri }} style={styles.mealImage} />
                    ) : (
                        <View style={[styles.mealImage, styles.mealImagePlaceholder]}>
                            <Ionicons name="restaurant-outline" size={40} color="#5A5D60" />
                        </View>
                    )}

                    {/* Macro Nutrients Bar */}
                    <View style={styles.macrosCard}>
                        <View style={styles.macroItem}>
                            <Text style={styles.macroLabel}>CARBS</Text>
                            <Text style={styles.macroValue}>{Math.round(totalMacros.carbs)}g</Text>
                        </View>
                        <View style={styles.macroDivider} />
                        <View style={styles.macroItem}>
                            <Text style={styles.macroLabel}>PROTEIN</Text>
                            <Text style={styles.macroValue}>{Math.round(totalMacros.protein)}g</Text>
                        </View>
                        <View style={styles.macroDivider} />
                        <View style={styles.macroItem}>
                            <Text style={styles.macroLabel}>FIBER</Text>
                            <Text style={styles.macroValue}>{Math.round(totalMacros.fiber)}g</Text>
                        </View>
                        <View style={styles.macroDivider} />
                        <View style={styles.macroItem}>
                            <Text style={styles.macroLabel}>FAT</Text>
                            <Text style={styles.macroValue}>{Math.round(totalMacros.fat)}g</Text>
                        </View>
                    </View>

                    {/* Meal Items List */}
                    <View style={styles.itemsSection}>
                        {mealItems.map((item, index) => (
                            <View key={`${item.provider}-${item.external_id}`} style={styles.itemRow}>
                                <View style={styles.itemInfo}>
                                    <Text style={styles.itemName}>{item.display_name}</Text>
                                    {item.brand && <Text style={styles.itemBrand}>{item.brand}</Text>}
                                </View>
                                <Text style={styles.itemQuantity}>
                                    {item.quantity === 1 ? '1' : `${item.quantity}x`}
                                </Text>
                            </View>
                        ))}

                        {/* Data Source Footer */}
                        <View style={styles.dataSourceRow}>
                            <Text style={styles.dataSourceLabel}>Food Data Source</Text>
                            <Text style={styles.dataSourceValue}>MyFitnessPal Database</Text>
                        </View>
                    </View>

                    {/* Prediction Section - No box, plain layout */}
                    <View style={styles.predictionSection}>
                        {/* Risk Header Row */}
                        <View style={styles.riskHeader}>
                            <Text style={styles.balancedLabel}>Balanced Meal</Text>
                            <View style={styles.spikeRiskContainer}>
                                <Text style={styles.spikeRiskLabel}>Spike Risk:</Text>
                                <SpikeRiskGauge risk={adjustedSpikeRisk} />
                            </View>
                        </View>

                        {/* Chart Header */}
                        <View style={styles.chartHeader}>
                            <Text style={styles.unitLabel}>{glucoseUnit}</Text>
                            <View style={styles.predictedLegend}>
                                <View style={styles.legendDot} />
                                <Text style={styles.legendText}>Predicted</Text>
                            </View>
                        </View>

                        <DynamicGlucoseChart curveData={predictedCurve} mealTime={mealTime} glucoseUnit={glucoseUnit} />
                    </View>

                    {/* Drivers Section */}
                    <View style={styles.driversSection}>
                        <Text style={styles.sectionTitle}>Drivers:</Text>
                        {drivers.map((driver, index) => (
                            <View key={index} style={styles.driverRow}>
                                <View style={styles.driverBullet} />
                                <Text style={styles.driverText}>{driver.text}</Text>
                            </View>
                        ))}
                    </View>

                    {/* Adjustments Section */}
                    <View style={styles.adjustmentsSection}>
                        <Text style={styles.sectionTitle}>Try these adjustments:</Text>
                        {tips.map(tip => (
                            <Pressable
                                key={tip.id}
                                style={styles.tipCard}
                                onPress={() => toggleTip(tip.id)}
                            >
                                <View style={styles.tipHeader}>
                                    <View>
                                        <Text style={styles.tipTitle}>{tip.title}</Text>
                                        <Text style={styles.tipRisk}>-{tip.risk_reduction_pct}% Risk</Text>
                                    </View>
                                    <View style={[styles.tipCheckbox, tip.selected && styles.tipCheckboxSelected]}>
                                        {tip.selected && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                                    </View>
                                </View>
                                <Text style={styles.tipDescription}>{tip.detail}</Text>
                            </Pressable>
                        ))}
                    </View>

                    {/* Safety Disclaimer */}
                    <Text style={styles.disclaimerText}>
                        Estimates for guidance only. Not medical advice.
                    </Text>

                    {/* Log This Meal Button */}
                    <Pressable
                        style={[styles.logButton, isSaving && styles.logButtonDisabled]}
                        onPress={handleLogMeal}
                        disabled={isSaving}
                    >
                        <Text style={styles.logButtonText}>
                            {isSaving ? 'Saving...' : 'Log this meal'}
                        </Text>
                    </Pressable>
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: '#111111',
    },
    topGlow: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 280,
    },
    safe: {
        flex: 1,
    },
    header: {
        height: 72,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    headerIconBtn: {
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
    headerIconBtnSpacer: {
        width: 48,
    },
    headerTitle: {
        fontFamily: fonts.bold,
        fontSize: 18,
        color: '#FFFFFF',
        letterSpacing: 1,
    },
    content: {
        paddingHorizontal: 16,
        paddingBottom: 40,
    },
    mealTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 22,
        color: '#FFFFFF',
        marginTop: 8,
    },
    mealSubtitle: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#878787',
        marginTop: 4,
    },
    mealImage: {
        width: '100%',
        height: 180,
        borderRadius: 16,
        marginTop: 16,
        backgroundColor: '#2A2D30',
    },
    mealImagePlaceholder: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    macrosCard: {
        flexDirection: 'row',
        backgroundColor: '#1A1B1C',
        borderRadius: 12,
        padding: 16,
        marginTop: 16,
    },
    macroItem: {
        flex: 1,
        alignItems: 'center',
    },
    macroDivider: {
        width: 1,
        backgroundColor: '#3A3D40',
    },
    macroLabel: {
        fontFamily: fonts.medium,
        fontSize: 11,
        color: '#878787',
        letterSpacing: 0.5,
        marginBottom: 6,
    },
    macroValue: {
        fontFamily: fonts.semiBold,
        fontSize: 18,
        color: '#FFFFFF',
    },
    itemsSection: {
        marginTop: 20,
    },
    itemRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(58, 61, 64, 0.5)',
    },
    itemInfo: {
        flex: 1,
    },
    itemName: {
        fontFamily: fonts.medium,
        fontSize: 15,
        color: '#FFFFFF',
    },
    itemBrand: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: '#878787',
        marginTop: 2,
    },
    itemQuantity: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#878787',
    },
    dataSourceRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingTop: 12,
        marginTop: 4,
    },
    dataSourceLabel: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: '#5A5D60',
    },
    dataSourceValue: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: '#5A5D60',
    },
    predictionSection: {
        marginTop: 24,
    },
    predictionCard: {
        backgroundColor: '#1A1B1C',
        borderRadius: 16,
        padding: 16,
        marginTop: 24,
    },
    riskHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    balancedLabel: {
        fontFamily: fonts.medium,
        fontSize: 15,
        color: '#FFFFFF',
    },
    spikeRiskContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    spikeRiskLabel: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: '#878787',
    },
    chartHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    chartContainer: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        padding: 12,
        marginTop: 8,
    },
    unitLabel: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: '#878787',
    },
    unitLabelLight: {
        fontFamily: fonts.regular,
        fontSize: 11,
        color: '#666666',
    },
    predictedLegend: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    legendDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#3494D9',
    },
    legendDotBlue: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#3494D9',
    },
    legendText: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: '#878787',
    },
    legendTextLight: {
        fontFamily: fonts.regular,
        fontSize: 11,
        color: '#666666',
    },
    driversSection: {
        marginTop: 24,
    },
    sectionTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 15,
        color: '#FFFFFF',
        marginBottom: 12,
    },
    driverRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 8,
    },
    driverBullet: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#FFFFFF',
        marginTop: 6,
        marginRight: 10,
    },
    driverText: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: '#C4C4C4',
        flex: 1,
        lineHeight: 18,
    },
    adjustmentsSection: {
        marginTop: 24,
    },
    tipCard: {
        backgroundColor: '#1A1B1C',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(58, 61, 64, 0.5)',
    },
    tipHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 8,
    },
    tipTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 14,
        color: '#FFFFFF',
    },
    tipRisk: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: '#4CAF50',
        marginTop: 2,
    },
    tipCheckbox: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#5A5D60',
        justifyContent: 'center',
        alignItems: 'center',
    },
    tipCheckboxSelected: {
        backgroundColor: '#3494D9',
        borderColor: '#3494D9',
    },
    tipDescription: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: '#878787',
        lineHeight: 16,
    },
    insertTipButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(245, 166, 35, 0.1)',
        borderRadius: 12,
        paddingVertical: 16,
        marginTop: 16,
        borderWidth: 1,
        borderColor: 'rgba(245, 166, 35, 0.3)',
    },
    insertTipText: {
        fontFamily: fonts.semiBold,
        fontSize: 13,
        color: '#F5A623',
        letterSpacing: 0.5,
    },
    logButton: {
        backgroundColor: '#26A861',
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 24,
        marginBottom: 20,
    },
    logButtonText: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: '#FFFFFF',
    },
    logButtonDisabled: {
        opacity: 0.6,
    },
    disclaimerText: {
        fontFamily: fonts.regular,
        fontSize: 11,
        color: '#666666',
        textAlign: 'center',
        marginTop: 20,
    },
});
