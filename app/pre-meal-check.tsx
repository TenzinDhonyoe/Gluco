import { useAuth, useGlucoseUnit } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import {
    addMealItems,
    createMeal,
    invokePremealAnalyze,
    PremealAdjustmentTip,
    PremealDriver,
    PremealMealDraft,
    PremealResult
} from '@/lib/supabase';
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
    const [result, setResult] = React.useState<PremealResult | null>(null);
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
                // Mock analysis logic for demo
                await new Promise(resolve => setTimeout(resolve, 3000));

                // Determine risk based on macros
                const totalCarbs = totalMacros.carbs;
                const totalFiber = totalMacros.fiber;

                // Generate drivers
                const newDrivers: PremealDriver[] = [];
                if (totalCarbs > 60) newDrivers.push({ text: 'Higher carb content provides sustained energy', reason_code: 'HIGH_CARBS' });
                if (totalFiber < 5) newDrivers.push({ text: 'Low fiber might mean quicker digestion', reason_code: 'LOW_FIBER' });
                if (totalMacros.protein > 20) newDrivers.push({ text: 'Good protein content helps balance the meal', reason_code: 'GOOD_PROTEIN' });

                // Generate tips
                const newTips: (PremealAdjustmentTip & { id: string, selected: boolean })[] = [
                    {
                        id: '1',
                        title: 'Add a side salad',
                        detail: 'Fiber helps steady your glucose response',
                        benefit_level: 'medium',
                        action_type: 'ADD_FIBER',
                        selected: false
                    },
                    {
                        id: '2',
                        title: 'Take a 15 min walk',
                        detail: 'Movement helps your body use energy',
                        benefit_level: 'high',
                        action_type: 'WALK',
                        selected: false
                    }
                ];

                const mockResult: PremealResult = {
                    drivers: newDrivers,
                    adjustment_tips: newTips,
                    debug: {
                        net_carbs: totalCarbs - totalFiber,
                        fibre_g: totalFiber,
                        protein_g: totalMacros.protein,
                        fat_g: totalMacros.fat,
                        time_bucket: 'Lunch', // Mock
                        recent_spike_avg: null
                    }
                };

                setResult(mockResult);
                setDrivers(mockResult.drivers);
                setTips(mockResult.adjustment_tips.map(t => ({ ...t, selected: false, id: t.id || Math.random().toString() })));
                setLoading(false);
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
                const [apiResult] = await Promise.all([
                    invokePremealAnalyze(user.id, mealDraft),
                    minDelay
                ]);

                if (apiResult) {
                    setResult(apiResult);
                    setDrivers(apiResult.drivers);
                    setTips(apiResult.adjustment_tips.map((tip, index) => ({
                        ...tip,
                        id: String(index + 1),
                        selected: false,
                    })));
                } else {
                    // Fallback to local calculation
                    // Mock fallback result
                    const fallbackResult: PremealResult = {
                        drivers: [{ text: 'Analysis unavailable. Showing estimate based on macros.', reason_code: 'FALLBACK' }],
                        adjustment_tips: [
                            { title: 'Take a post-meal walk', detail: '10-15 mins of walking helps', benefit_level: 'medium', action_type: 'POST_MEAL_WALK' },
                        ],
                        debug: {
                            net_carbs: 0,
                            fibre_g: 0,
                            protein_g: 0,
                            fat_g: 0,
                            time_bucket: 'Unknown',
                            recent_spike_avg: null
                        }
                    };
                    setResult(fallbackResult);
                    setDrivers(fallbackResult.drivers);
                    setTips(fallbackResult.adjustment_tips.map((t, i) => ({ ...t, id: String(i), selected: false })));
                }
            } catch (err) {
                console.error('Premeal analysis error:', err);
                // Fallback on error
                const errorResult: PremealResult = {
                    drivers: [{ text: 'Could not connect to analysis service.', reason_code: 'ERROR' }],
                    adjustment_tips: [
                        { title: 'Take a post-meal walk', detail: '10-15 mins of walking helps', benefit_level: 'medium', action_type: 'POST_MEAL_WALK' },
                    ],
                    debug: {
                        net_carbs: 0,
                        fibre_g: 0,
                        protein_g: 0,
                        fat_g: 0,
                        time_bucket: 'Unknown',
                        recent_spike_avg: null
                    }
                };
                setResult(errorResult);
                setDrivers(errorResult.drivers);
                setTips(errorResult.adjustment_tips.map((t, i) => ({ ...t, id: String(i), selected: false })));
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
                meal_type: null,
                logged_at: mealTime.toISOString(),
                photo_path: imageUri || null,
                notes: `Meal logged via pre-meal check`,
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

            // Removed PostMealReview creation logic

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

                    {/* Prediction Section Removed */}

                    {/* Drivers Section */}
                    <View style={styles.driversSection}>
                        <Text style={styles.sectionTitle}>Meal Balance Drivers:</Text>
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
                                        <Text style={[styles.tipRisk, { color: '#1565C0' }]}>
                                            {tip.benefit_level ? tip.benefit_level.toUpperCase() : 'MEDIUM'} IMPACT
                                        </Text>
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
    mealResponseContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    mealResponseLabel: {
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
