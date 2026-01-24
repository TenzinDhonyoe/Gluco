/**
 * Analysis Results View
 * Displays meal analysis results with photo, macros, AI-powered insights, and action buttons
 */

import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import {
    invokePremealAnalyze,
    PremealAdjustmentTip,
    PremealDriver,
    PremealMealDraft,
    PremealResult,
} from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Dimensions,
    Image,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View
} from 'react-native';
import Animated, {
    FadeIn,
    FadeInDown,
    FadeOut,
    FadeOutUp,
    interpolateColor,
    Layout,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withSpring,
    withTiming
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { SelectedItem } from './FoodSearchResultsView';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PHOTO_HEIGHT = SCREEN_WIDTH * 0.55;

// Suggestion type for tracking
export interface CheckedSuggestion {
    title: string;
    action_type: string;
}

// Action state for each suggestion
type SuggestionAction = 'none' | 'try' | 'skip';

interface AnalysisResultsViewProps {
    imageUri?: string;
    items: SelectedItem[];
    onReview: () => void;
    onSave: (checkedSuggestions: CheckedSuggestion[]) => void;
    onClose: () => void;
    headerTitle?: string;
    primaryActionLabel?: string;
    reviewIcon?: keyof typeof Ionicons.glyphMap;
    macroOverrides?: {
        calories?: number;
        carbs?: number;
        protein?: number;
        fat?: number;
        fibre?: number;
    };
    /** Optional component to render for followup questions */
    followupComponent?: React.ReactNode;
    /** Optional warning message about photo quality */
    photoQualityWarning?: string;
}

// Format serving size for display
function formatServing(item: SelectedItem): string {
    const qty = item.quantity || 1;
    const unit = item.serving_unit || 'serving';

    if (qty === 0.5) return `1/2 ${unit}`;
    if (qty === 0.25) return `1/4 ${unit}`;
    if (qty === 0.33 || qty === 0.34) return `1/3 ${unit}`;
    if (qty === 1) return `1 ${unit}`;
    return `${qty} ${unit}`;
}

// Format timestamp
function formatTimestamp(): string {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours % 12 || 12;
    const displayMin = minutes.toString().padStart(2, '0');
    return `${displayHour}:${displayMin} ${ampm} • Today`;
}

// Get score color based on value (0-100)
function getScoreColor(score: number): string {
    if (score >= 70) return Colors.success; // Green
    if (score >= 40) return Colors.warning; // Yellow/Orange
    return Colors.error; // Red
}

// Get outcome text for action types
function getOutcomeText(actionType: string): string {
    const outcomes: Record<string, string> = {
        'add_fiber': 'Helps slow glucose absorption',
        'add_protein': 'Supports steadier energy levels',
        'post_meal_walk': 'Helps reduce glucose spikes',
        'meal_pairing': 'Balances your meal response',
        'portion_control': 'Helps moderate glucose response',
        'timing': 'Optimizes your metabolic timing',
    };
    return outcomes[actionType] || 'May improve your response';
}

// Get time context for action types
function getTimeContext(actionType: string): string | null {
    const contexts: Record<string, string> = {
        'post_meal_walk': 'In the next 30 minutes',
        'add_fiber': 'Before you eat',
        'add_protein': 'With this meal',
        'meal_pairing': 'With this meal',
    };
    return contexts[actionType] || null;
}

// Circular Progress Score Component
function AnimatedScoreBadge({ score }: { score: number }) {
    const animatedScore = useSharedValue(0);

    // Get color based on score: red (0) -> yellow (50) -> green (100)
    const getProgressColor = (value: number) => {
        if (value < 40) return Colors.error;  // Red for low
        if (value < 70) return Colors.warning; // Yellow/orange for medium
        return Colors.success; // Green for high
    };

    const progressColor = getProgressColor(score);

    // SVG circle properties
    const size = 60;
    const strokeWidth = 6;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const progress = Math.max(0, Math.min(100, score)) / 100;
    const strokeDashoffset = circumference * (1 - progress);

    useEffect(() => {
        animatedScore.value = withSpring(score, { damping: 15, stiffness: 100 });
    }, [score]);

    const textStyle = useAnimatedStyle(() => {
        const color = interpolateColor(
            animatedScore.value,
            [0, 40, 70, 100],
            [Colors.error, Colors.error, Colors.warning, Colors.success]
        );
        return { color };
    });



    return (
        <View style={styles.circularProgress}>
            <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
                {/* Background circle */}
                <Circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke="rgba(255, 255, 255, 0.15)"
                    strokeWidth={strokeWidth}
                    fill="transparent"
                />
                {/* Progress circle */}
                <Circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={progressColor}
                    strokeWidth={strokeWidth}
                    fill="transparent"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                />
            </Svg>
            <View style={styles.scoreTextContainer}>
                <Text style={[styles.scoreValue, { color: progressColor }]}>
                    {Math.round(score)}
                </Text>
            </View>
        </View>
    );
}

export default function AnalysisResultsView({
    imageUri,
    items,
    onReview,
    onSave,
    onClose,
    headerTitle = 'MEAL REVIEW',
    primaryActionLabel = 'Log this meal',
    reviewIcon = 'create-outline',
    macroOverrides,
    followupComponent,
    photoQualityWarning,
}: AnalysisResultsViewProps) {
    const insets = useSafeAreaInsets();
    const { user } = useAuth();
    const scrollViewRef = useRef<ScrollView>(null);
    const [isLoadingInsights, setIsLoadingInsights] = useState(true);
    const [insights, setInsights] = useState<PremealResult | null>(null);
    const [suggestionActions, setSuggestionActions] = useState<Record<string, SuggestionAction>>({});
    const [showMoreOptions, setShowMoreOptions] = useState(false);
    const currentScrollY = useRef(0);

    // Scroll down a bit when more options is expanded
    const handleMoreOptionsPress = useCallback(() => {
        const newState = !showMoreOptions;
        setShowMoreOptions(newState);
        if (newState && scrollViewRef.current) {
            // Delay to let the animation start, then scroll down by 200px
            setTimeout(() => {
                scrollViewRef.current?.scrollTo({
                    y: currentScrollY.current + 200,
                    animated: true
                });
            }, 150);
        }
    }, [showMoreOptions]);

    // Mascot animation
    const mascotScale = useSharedValue(1);
    useEffect(() => {
        if (isLoadingInsights) {
            mascotScale.value = withRepeat(
                withSequence(
                    withTiming(1.1, { duration: 800 }),
                    withTiming(1, { duration: 800 })
                ),
                -1,
                true
            );
        }
    }, [isLoadingInsights]);

    const mascotStyle = useAnimatedStyle(() => ({
        transform: [{ scale: mascotScale.value }],
    }));

    // Calculate totals from items, respecting overrides
    const totals = useMemo(() => {
        const calculated = items.reduce(
            (acc, item) => ({
                calories: acc.calories + (item.calories_kcal || 0) * (item.quantity || 1),
                carbs: acc.carbs + (item.carbs_g || 0) * (item.quantity || 1),
                protein: acc.protein + (item.protein_g || 0) * (item.quantity || 1),
                fat: acc.fat + (item.fat_g || 0) * (item.quantity || 1),
                fiber: acc.fiber + (item.fibre_g || 0) * (item.quantity || 1),
            }),
            { calories: 0, carbs: 0, protein: 0, fat: 0, fiber: 0 }
        );

        return {
            calories: macroOverrides?.calories ?? calculated.calories,
            carbs: macroOverrides?.carbs ?? calculated.carbs,
            protein: macroOverrides?.protein ?? calculated.protein,
            fat: macroOverrides?.fat ?? calculated.fat,
            fiber: macroOverrides?.fibre ?? calculated.fiber,
        };
    }, [items, macroOverrides]);

    // Generate meal name from items
    const mealName = useMemo(() => {
        if (items.length === 0) return 'Analyzed Meal';
        if (items.length === 1) return items[0].display_name;
        return items.slice(0, 2).map(i => i.display_name).join(' with ');
    }, [items]);

    // Fetch AI insights
    useEffect(() => {
        async function fetchInsights() {
            if (!user?.id || items.length === 0) {
                setIsLoadingInsights(false);
                return;
            }

            setIsLoadingInsights(true);
            try {
                const mealDraft: PremealMealDraft = {
                    name: mealName,
                    logged_at: new Date().toISOString(),
                    items: items.map(item => ({
                        display_name: item.display_name,
                        quantity: item.quantity || 1,
                        unit: item.serving_unit,
                        nutrients: {
                            calories_kcal: item.calories_kcal,
                            carbs_g: item.carbs_g,
                            protein_g: item.protein_g,
                            fat_g: item.fat_g,
                            fibre_g: item.fibre_g,
                        },
                    })),
                };

                const result = await invokePremealAnalyze(user.id, mealDraft);
                setInsights(result);
            } catch (error) {
                console.error('Error fetching meal insights:', error);
            } finally {
                setIsLoadingInsights(false);
            }
        }

        fetchInsights();
    }, [user?.id, items, mealName]);

    // Calculate wellness score (use API score or fallback)
    const wellnessScore = useMemo(() => {
        if (insights?.wellness_score !== undefined) {
            return insights.wellness_score;
        }
        // Fallback calculation if API doesn't return score
        // Higher protein & fiber = better, high carbs = lower
        const proteinBonus = Math.min(totals.protein * 1.5, 30);
        const fiberBonus = Math.min(totals.fiber * 3, 25);
        const carbPenalty = Math.min(totals.carbs * 0.4, 40);
        return Math.min(100, Math.max(0, Math.round(50 + proteinBonus + fiberBonus - carbPenalty)));
    }, [insights, totals]);

    // Get drivers (from API or fallback)
    const drivers: PremealDriver[] = useMemo(() => {
        if (insights?.drivers && insights.drivers.length > 0) {
            return insights.drivers;
        }
        // Fallback drivers based on meal composition
        const fallbackDrivers: PremealDriver[] = [];
        if (totals.protein > 20) {
            fallbackDrivers.push({ text: 'Good protein content supports satiety and stable energy', reason_code: 'protein_high' });
        }
        if (totals.fiber > 5) {
            fallbackDrivers.push({ text: 'Fiber helps slow glucose absorption', reason_code: 'fiber_good' });
        }
        if (totals.carbs > 40 && totals.fiber < 5) {
            fallbackDrivers.push({ text: 'Higher carb content with lower fiber may affect glucose', reason_code: 'carb_fiber_ratio' });
        }
        if (totals.fat > 10 && totals.fat < 30) {
            fallbackDrivers.push({ text: 'Healthy fats help moderate glucose response', reason_code: 'fat_moderate' });
        }
        if (fallbackDrivers.length === 0) {
            fallbackDrivers.push({ text: 'Balanced meal composition', reason_code: 'balanced' });
        }
        return fallbackDrivers;
    }, [insights, totals]);

    // Get adjustment tips (from API or fallback)
    const adjustmentTips: PremealAdjustmentTip[] = useMemo(() => {
        if (insights?.adjustment_tips && insights.adjustment_tips.length > 0) {
            return insights.adjustment_tips;
        }
        // Fallback tips
        const fallbackTips: PremealAdjustmentTip[] = [];
        if (totals.fiber < 5) {
            fallbackTips.push({
                title: 'Add more fiber',
                detail: 'Adding vegetables or whole grains can help slow glucose absorption.',
                benefit_level: 'high',
                action_type: 'add_fiber',
            });
        }
        if (totals.protein < 15) {
            fallbackTips.push({
                title: 'Add a protein source',
                detail: 'Protein helps stabilize blood sugar and keeps you fuller longer.',
                benefit_level: 'high',
                action_type: 'add_protein',
            });
        }
        fallbackTips.push({
            title: 'Take a 10-min walk after eating',
            detail: 'Light activity after meals helps your body process glucose more effectively.',
            benefit_level: 'medium',
            action_type: 'post_meal_walk',
        });
        return fallbackTips.slice(0, 3);
    }, [insights, totals]);

    // Sort tips by benefit level (high first) and split into primary/secondary
    const sortedTips = useMemo(() => {
        const levelOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
        return [...adjustmentTips].sort((a, b) =>
            (levelOrder[a.benefit_level] ?? 2) - (levelOrder[b.benefit_level] ?? 2)
        );
    }, [adjustmentTips]);

    const primaryTip = sortedTips[0] || null;
    const secondaryTips = sortedTips.slice(1);

    // Personalized tip based on score
    const personalizedTip = useMemo(() => {
        if (wellnessScore >= 70) {
            return "Great choice! This meal has a good balance of nutrients for steady energy.";
        } else if (wellnessScore >= 40) {
            return "This meal is okay, but consider the suggestions below to optimize your response.";
        } else {
            return "Consider pairing this meal with protein or fiber to help moderate your glucose response.";
        }
    }, [wellnessScore]);

    return (
        <View style={styles.container}>
            {/* Background Gradient */}


            <SafeAreaView edges={['top']} style={styles.safeArea}>
                {/* Header */}
                <View style={styles.header}>
                    <Pressable
                        onPress={onClose}
                        style={({ pressed }) => [
                            styles.backButton,
                            pressed && { opacity: 0.7 }
                        ]}
                        hitSlop={8}
                    >
                        <Ionicons name="chevron-back" size={28} color={Colors.textPrimary} />
                    </Pressable>
                    <Text style={styles.headerTitle}>{headerTitle}</Text>
                    <View style={{ width: 44 }} />
                </View>

                <ScrollView
                    ref={scrollViewRef}
                    style={styles.scrollView}
                    contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
                    showsVerticalScrollIndicator={false}
                    onScroll={(e) => { currentScrollY.current = e.nativeEvent.contentOffset.y; }}
                    scrollEventThrottle={16}
                >
                    {/* Meal Title Section */}
                    <View style={styles.mealTitleSection}>
                        <Text style={styles.mealName}>{mealName}</Text>
                        <Text style={styles.timestamp}>{formatTimestamp()}</Text>
                    </View>

                    {/* Photo - only show if imageUri exists */}
                    {imageUri ? (
                        <View style={styles.photoContainer}>
                            <Image
                                source={{ uri: imageUri }}
                                style={styles.photo}
                                resizeMode="cover"
                            />
                        </View>
                    ) : null}

                    {/* Photo Quality Warning */}
                    {photoQualityWarning && (
                        <View style={styles.qualityWarning}>
                            <Ionicons name="warning-outline" size={16} color="#FF9500" />
                            <Text style={styles.qualityWarningText}>{photoQualityWarning}</Text>
                        </View>
                    )}

                    {/* Horizontal Macro Bar */}
                    <View style={styles.macroBar}>
                        <View style={styles.macroColumn}>
                            <Text style={[styles.macroLabel, { color: '#FF9500' }]}>CALORIES</Text>
                            <Text style={styles.macroValue}>{Math.round(totals.calories)}</Text>
                            <Text style={styles.macroDV}>{Math.round((totals.calories / 2000) * 100)}%</Text>
                        </View>
                        <View style={styles.macroDivider} />
                        <View style={styles.macroColumn}>
                            <Text style={[styles.macroLabel, { color: '#FFD60A' }]}>CARBS</Text>
                            <Text style={styles.macroValue}>{Math.round(totals.carbs)}g</Text>
                            <Text style={styles.macroDV}>{Math.round((totals.carbs / 275) * 100)}%</Text>
                        </View>
                        <View style={styles.macroDivider} />
                        <View style={styles.macroColumn}>
                            <Text style={[styles.macroLabel, { color: '#FF6B6B' }]}>PROTEIN</Text>
                            <Text style={styles.macroValue}>{Math.round(totals.protein)}g</Text>
                            <Text style={styles.macroDV}>{Math.round((totals.protein / 50) * 100)}%</Text>
                        </View>
                        <View style={styles.macroDivider} />
                        <View style={styles.macroColumn}>
                            <Text style={[styles.macroLabel, { color: '#34C759' }]}>FIBER</Text>
                            <Text style={styles.macroValue}>{Math.round(totals.fiber)}g</Text>
                            <Text style={styles.macroDV}>{Math.round((totals.fiber / 28) * 100)}%</Text>
                        </View>
                        <View style={styles.macroDivider} />
                        <View style={styles.macroColumn}>
                            <Text style={[styles.macroLabel, { color: '#BF5AF2' }]}>FAT</Text>
                            <Text style={styles.macroValue}>{Math.round(totals.fat)}g</Text>
                            <Text style={styles.macroDV}>{Math.round((totals.fat / 78) * 100)}%</Text>
                        </View>
                    </View>

                    {/* Food Items List */}
                    <View style={styles.itemsSection}>
                        {items.map((item, index) => (
                            <View key={index} style={styles.foodItem}>
                                <View style={styles.foodItemLeft}>
                                    <Text style={styles.foodItemName}>{item.display_name}</Text>
                                    <Text style={styles.foodItemBrand}>{item.brand || 'Generic'}</Text>
                                </View>
                                <Text style={styles.foodItemServing}>{formatServing(item)}</Text>
                            </View>
                        ))}
                    </View>

                    {/* Followup Questions (if any) */}
                    {followupComponent}

                    {/* AI Insights Section */}
                    {isLoadingInsights ? (
                        <View style={styles.loadingContainer}>
                            <Animated.Image
                                source={require('@/assets/images/mascots/gluco_app_mascott/gluco_mascott_cook.png')}
                                style={[styles.loadingMascot, mascotStyle]}
                                resizeMode="contain"
                            />
                            <Text style={styles.loadingText}>Analyzing meal...</Text>
                        </View>
                    ) : (
                        <>
                            {/* Metabolic Score */}
                            <View style={styles.scoreSection}>
                                <View style={styles.scoreLabelContainer}>
                                    <Text style={styles.scoreLabel}>Metabolic Score</Text>
                                </View>
                                <AnimatedScoreBadge score={wellnessScore} />
                            </View>

                            {/* Drivers Section */}
                            <View style={styles.driversSection}>
                                <Text style={styles.sectionTitle}>What's driving this score:</Text>
                                {drivers.map((driver, index) => (
                                    <View key={index} style={styles.driverItem}>
                                        <View style={styles.driverBullet} />
                                        <Text style={styles.driverText}>{driver.text}</Text>
                                    </View>
                                ))}
                            </View>

                            {/* Suggestions Section - Low Pressure Design */}
                            {primaryTip && (
                                <View style={styles.adjustmentsSection}>
                                    {/* Header Row with Title and More Options */}
                                    <View style={styles.suggestionsHeaderRow}>
                                        <Text style={styles.sectionTitle}>Try this:</Text>

                                        {/* See More Options Toggle - Liquid Glass Pill (inline) */}
                                        {secondaryTips.length > 0 && (
                                            <Pressable
                                                style={({ pressed }) => [
                                                    styles.seeMoreToggle,
                                                    pressed && styles.seeMoreTogglePressed
                                                ]}
                                                onPressIn={() => {
                                                    if (Platform.OS === 'ios') {
                                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                    }
                                                }}
                                                onPress={handleMoreOptionsPress}
                                            >
                                                <LinearGradient
                                                    colors={['rgba(60, 65, 70, 0.95)', 'rgba(45, 48, 52, 0.95)']}
                                                    style={styles.seeMoreGradient}
                                                />
                                                <View style={styles.seeMoreContent}>
                                                    <Text style={styles.seeMoreText}>
                                                        {showMoreOptions ? 'Hide' : `+${secondaryTips.length} more`}
                                                    </Text>
                                                    <Ionicons
                                                        name={showMoreOptions ? 'chevron-up' : 'chevron-down'}
                                                        size={14}
                                                        color="#FFFFFF"
                                                    />
                                                </View>
                                            </Pressable>
                                        )}
                                    </View>

                                    {/* Primary Suggestion Card */}
                                    {(() => {
                                        const uniqueId = `0_${primaryTip.action_type}`;
                                        const action = suggestionActions[uniqueId] || 'none';
                                        const timeContext = getTimeContext(primaryTip.action_type);
                                        const outcomeText = getOutcomeText(primaryTip.action_type);

                                        if (action === 'skip') {
                                            return null; // Hide skipped primary card
                                        }

                                        return (
                                            <Animated.View
                                                layout={Layout.duration(200)}
                                                style={[
                                                    styles.suggestionCard,
                                                    action === 'try' && styles.suggestionCardSelected
                                                ]}
                                            >
                                                {action === 'none' ? (
                                                    <Animated.View
                                                        key="none-state"
                                                        entering={FadeIn.duration(200)}
                                                        exiting={FadeOut.duration(150)}
                                                    >
                                                        {timeContext && (
                                                            <Text style={styles.timeContextLabel}>{timeContext.toUpperCase()}</Text>
                                                        )}
                                                        <Text style={styles.suggestionTitle}>{primaryTip.title}</Text>
                                                        <Text style={styles.suggestionDetail}>{primaryTip.detail}</Text>
                                                        <Text style={styles.outcomeText}>{outcomeText}</Text>

                                                        <View style={styles.actionButtonRow}>
                                                            <Pressable
                                                                style={styles.tryButton}
                                                                onPress={() => setSuggestionActions(prev => ({ ...prev, [uniqueId]: 'try' }))}
                                                            >
                                                                <Text style={styles.tryButtonText}>I'll try this</Text>
                                                            </Pressable>
                                                            <Pressable
                                                                style={styles.skipButton}
                                                                onPress={() => setSuggestionActions(prev => ({ ...prev, [uniqueId]: 'skip' }))}
                                                            >
                                                                <Text style={styles.skipButtonText}>Not today</Text>
                                                                <Ionicons name="chevron-forward" size={14} color={Colors.textSecondary} />
                                                            </Pressable>
                                                        </View>
                                                    </Animated.View>
                                                ) : (
                                                    <Animated.View
                                                        key="try-state"
                                                        entering={FadeIn.duration(200).delay(100)}
                                                        exiting={FadeOut.duration(150)}
                                                    >
                                                        <View style={styles.selectedHeader}>
                                                            <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
                                                            <Text style={styles.suggestionTitleSelected}>{primaryTip.title}</Text>
                                                        </View>

                                                        <View style={styles.selectedActionRow}>
                                                            <View style={styles.addedBadge}>
                                                                <Ionicons name="checkmark" size={12} color={Colors.success} />
                                                                <Text style={styles.addedText}>Added</Text>
                                                            </View>
                                                            <Pressable
                                                                style={styles.undoButton}
                                                                onPress={() => setSuggestionActions(prev => ({ ...prev, [uniqueId]: 'none' }))}
                                                            >
                                                                <Text style={styles.undoButtonText}>Undo</Text>
                                                            </Pressable>
                                                        </View>
                                                        <Text style={styles.reassuranceText}>You can change this anytime</Text>
                                                    </Animated.View>
                                                )}
                                            </Animated.View>
                                        );
                                    })()}

                                    {/* Secondary Suggestions (Collapsible) - Animated */}
                                    {showMoreOptions && (
                                        <Animated.View
                                            entering={FadeInDown.duration(300).springify().damping(18)}
                                            exiting={FadeOutUp.duration(200)}
                                        >
                                            {secondaryTips.map((tip, index) => {
                                                const uniqueId = `${index + 1}_${tip.action_type}`;
                                                const action = suggestionActions[uniqueId] || 'none';
                                                const timeContext = getTimeContext(tip.action_type);
                                                const outcomeText = getOutcomeText(tip.action_type);

                                                if (action === 'skip') {
                                                    return null;
                                                }

                                                return (
                                                    <Animated.View
                                                        key={uniqueId}
                                                        entering={FadeInDown.delay(index * 60).duration(250).springify().damping(18)}
                                                    >
                                                        <Animated.View
                                                            layout={Layout.duration(200)}
                                                            style={[
                                                                styles.suggestionCard,
                                                                styles.secondarySuggestionCard,
                                                                action === 'try' && styles.suggestionCardSelected
                                                            ]}
                                                        >
                                                            {action === 'none' ? (
                                                                <Animated.View
                                                                    key="none-state"
                                                                    entering={FadeIn.duration(200)}
                                                                    exiting={FadeOut.duration(150)}
                                                                >
                                                                    {timeContext && (
                                                                        <Text style={styles.timeContextLabel}>{timeContext.toUpperCase()}</Text>
                                                                    )}
                                                                    <Text style={styles.suggestionTitle}>{tip.title}</Text>
                                                                    <Text style={styles.suggestionDetailCompact}>{tip.detail}</Text>
                                                                    <Text style={styles.outcomeText}>{outcomeText}</Text>

                                                                    <View style={styles.actionButtonRow}>
                                                                        <Pressable
                                                                            style={styles.tryButton}
                                                                            onPress={() => setSuggestionActions(prev => ({ ...prev, [uniqueId]: 'try' }))}
                                                                        >
                                                                            <Text style={styles.tryButtonText}>I'll try this</Text>
                                                                        </Pressable>
                                                                        <Pressable
                                                                            style={styles.skipButton}
                                                                            onPress={() => setSuggestionActions(prev => ({ ...prev, [uniqueId]: 'skip' }))}
                                                                        >
                                                                            <Text style={styles.skipButtonText}>Not today</Text>
                                                                            <Ionicons name="chevron-forward" size={14} color={Colors.textSecondary} />
                                                                        </Pressable>
                                                                    </View>
                                                                </Animated.View>
                                                            ) : (
                                                                <Animated.View
                                                                    key="try-state"
                                                                    entering={FadeIn.duration(200).delay(100)}
                                                                    exiting={FadeOut.duration(150)}
                                                                >
                                                                    <View style={styles.selectedHeader}>
                                                                        <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
                                                                        <Text style={styles.suggestionTitleSelected}>{tip.title}</Text>
                                                                    </View>

                                                                    <View style={styles.selectedActionRow}>
                                                                        <View style={styles.addedBadge}>
                                                                            <Ionicons name="checkmark" size={12} color={Colors.success} />
                                                                            <Text style={styles.addedText}>Added</Text>
                                                                        </View>
                                                                        <Pressable
                                                                            style={styles.undoButton}
                                                                            onPress={() => setSuggestionActions(prev => ({ ...prev, [uniqueId]: 'none' }))}
                                                                        >
                                                                            <Text style={styles.undoButtonText}>Undo</Text>
                                                                        </Pressable>
                                                                    </View>
                                                                    <Text style={styles.reassuranceText}>You can change this anytime</Text>
                                                                </Animated.View>
                                                            )}
                                                        </Animated.View>
                                                    </Animated.View>
                                                );
                                            })}
                                        </Animated.View>
                                    )}
                                </View>
                            )}
                        </>
                    )}
                </ScrollView>

                {/* Bottom Buttons */}
                <View style={[styles.bottomContainer, { paddingBottom: insets.bottom + 16 }]}>
                    <View style={styles.bottomButtonRow}>
                        <AnimatedPressable style={styles.editButton} onPress={onReview}>
                            <Text style={styles.editButtonText}>Edit</Text>
                        </AnimatedPressable>
                        <AnimatedPressable style={styles.logButton} onPress={() => {
                            const selectedSuggestions = sortedTips
                                .filter((tip, index) => suggestionActions[`${index}_${tip.action_type}`] === 'try')
                                .map(tip => ({ title: tip.title, action_type: tip.action_type }));
                            onSave(selectedSuggestions);
                        }}>
                            <Text style={styles.logButtonText}>{primaryActionLabel}</Text>
                        </AnimatedPressable>
                    </View>
                </View>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#111111',
    },

    safeArea: {
        flex: 1,
    },
    header: {
        height: 60,
        paddingHorizontal: 16,
        paddingTop: 8,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'flex-start',
    },

    headerTitle: {
        fontFamily: fonts.bold,
        fontSize: 18,
        letterSpacing: 1,
        color: Colors.textPrimary,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 20,
    },
    mealTitleSection: {
        marginBottom: 16,
    },
    mealName: {
        fontFamily: fonts.semiBold,
        fontSize: 24,
        color: '#FFFFFF',
        marginBottom: 4,
    },
    timestamp: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: Colors.textSecondary,
    },
    photoContainer: {
        borderRadius: 16,
        overflow: 'hidden',
        marginBottom: 20,
    },
    photo: {
        width: '100%',
        height: PHOTO_HEIGHT,
    },
    qualityWarning: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 149, 0, 0.15)',
        borderRadius: 8,
        paddingVertical: 10,
        paddingHorizontal: 12,
        marginBottom: 16,
        gap: 8,
        borderWidth: 1,
        borderColor: 'rgba(255, 149, 0, 0.3)',
    },
    qualityWarningText: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: '#FF9500',
        flex: 1,
    },
    macroBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 12,
        paddingVertical: 16,
        paddingHorizontal: 8,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    macroColumn: {
        flex: 1,
        alignItems: 'center',
    },
    macroDivider: {
        width: 1,
        height: 32,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
    macroLabel: {
        fontFamily: fonts.medium,
        fontSize: 11,
        color: Colors.textSecondary,
        letterSpacing: 0.5,
        marginBottom: 4,
    },
    macroValue: {
        fontFamily: fonts.semiBold,
        fontSize: 18,
        color: '#FFFFFF',
    },
    macroDV: {
        fontFamily: fonts.regular,
        fontSize: 10,
        color: '#888888',
        marginTop: 2,
    },
    itemsSection: {
        marginBottom: 24,
    },
    foodItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    },
    foodItemLeft: {
        flex: 1,
        marginRight: 16,
    },
    foodItemName: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: '#FFFFFF',
        marginBottom: 2,
    },
    foodItemBrand: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: Colors.textSecondary,
    },
    foodItemServing: {
        fontFamily: fonts.regular,
        fontSize: 15,
        color: Colors.textSecondary,
    },
    loadingContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 40,
        gap: 16,
    },
    loadingMascot: {
        width: 120,
        height: 120,
    },
    loadingText: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: Colors.textSecondary,
    },
    scoreSection: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 24,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    scoreLabelContainer: {
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 4,
    },
    scoreLabel: {
        fontFamily: fonts.bold,
        fontSize: 20,
        color: '#FFFFFF',
    },
    circularProgress: {
        width: 60,
        height: 60,
        justifyContent: 'center',
        alignItems: 'center',
    },
    scoreTextContainer: {
        position: 'absolute',
        justifyContent: 'center',
        alignItems: 'center',
    },
    scoreValue: {
        fontFamily: fonts.bold,
        fontSize: 16,
    },
    driversSection: {
        marginBottom: 24,
    },
    suggestionsHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    sectionTitle: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: '#FFFFFF',
    },
    driverItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 8,
    },
    driverBullet: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: Colors.textSecondary,
        marginTop: 6,
        marginRight: 10,
    },
    driverText: {
        flex: 1,
        fontFamily: fonts.regular,
        fontSize: 14,
        color: Colors.textSecondary,
        lineHeight: 20,
    },
    adjustmentsSection: {
        marginBottom: 24,
    },
    // New suggestion card styles
    suggestionCard: {
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        borderRadius: 16,
        padding: 20,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    suggestionCardSelected: {
        borderColor: Colors.success,
        borderLeftWidth: 3,
        backgroundColor: 'rgba(40, 94, 42, 0.12)',
    },
    secondarySuggestionCard: {
        padding: 16,
        marginBottom: 10,
    },
    timeContextLabel: {
        fontFamily: fonts.bold,
        fontSize: 11,
        letterSpacing: 1,
        color: Colors.primary,
        marginBottom: 8,
    },
    suggestionTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 17,
        color: '#FFFFFF',
        marginBottom: 6,
    },
    suggestionTitleSelected: {
        fontFamily: fonts.semiBold,
        fontSize: 17,
        color: '#FFFFFF',
        marginLeft: 8,
    },
    suggestionDetail: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: Colors.textSecondary,
        lineHeight: 20,
        marginBottom: 12,
    },
    suggestionDetailCompact: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: Colors.textSecondary,
        lineHeight: 18,
        marginBottom: 10,
    },
    outcomeText: {
        fontFamily: fonts.regular,
        fontSize: 13,
        fontStyle: 'italic',
        color: 'rgba(255, 255, 255, 0.5)',
        marginBottom: 16,
    },
    actionButtonRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    tryButton: {
        backgroundColor: Colors.buttonSecondary,
        borderWidth: 1,
        borderColor: Colors.buttonSecondaryBorder,
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 24,
    },
    tryButtonText: {
        fontFamily: fonts.semiBold,
        fontSize: 14,
        color: '#FFFFFF',
    },
    skipButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 12,
        gap: 4,
    },
    skipButtonText: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: Colors.textSecondary,
    },
    selectedHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    selectedActionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 8,
    },
    addedBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(40, 94, 42, 0.3)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        gap: 4,
    },
    addedText: {
        fontFamily: fonts.medium,
        fontSize: 13,
        color: Colors.success,
    },
    undoButton: {
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    undoButtonText: {
        fontFamily: fonts.medium,
        fontSize: 13,
        color: Colors.textSecondary,
    },
    reassuranceText: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.4)',
    },
    seeMoreToggle: {
        borderRadius: 100,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.12)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
        elevation: 3,
    },
    seeMoreTogglePressed: {
        opacity: 0.85,
        transform: [{ scale: 0.97 }],
    },
    seeMoreGradient: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 100,
    },
    seeMoreContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        paddingHorizontal: 14,
        gap: 4,
    },
    seeMoreText: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: '#FFFFFF',
        letterSpacing: 0.2,
    },
    tipCard: {
        borderRadius: 12,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        marginBottom: 20,
    },
    tipIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    tipText: {
        flex: 1,
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#FFFFFF',
        lineHeight: 20,
    },
    bottomContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 20,
        paddingTop: 16,
        backgroundColor: '#111111',
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.05)',
    },
    bottomButtonRow: {
        flexDirection: 'row',
        gap: 12,
    },
    editButton: {
        flex: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
        borderRadius: 30,
        paddingVertical: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    editButtonText: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: '#FFFFFF',
    },
    logButton: {
        flex: 2,
        backgroundColor: '#285E2A',
        borderWidth: 1,
        borderColor: '#448D47',
        borderRadius: 30,
        paddingVertical: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    logButtonText: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: '#FFFFFF',
    },
});
