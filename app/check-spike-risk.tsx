/**
 * Check Spike Risk Screen
 * Allows users to type what they plan to eat and get spike risk analysis
 */

import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { searchWithOrchestration } from '@/lib/foodSearch/orchestrator';
import {
    invokePremealAnalyze,
    NormalizedFood,
    PremealAdjustmentTip,
    PremealCurvePoint,
    PremealDriver,
    PremealMealDraft,
} from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    Animated,
    Easing,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

// Types
interface ResolvedFood {
    query: string;
    food: NormalizedFood;
    quantity: number;
}

interface AnalysisResult {
    spike_risk_pct: number;
    drivers: PremealDriver[];
    adjustment_tips: PremealAdjustmentTip[];
    predicted_curve: PremealCurvePoint[];
}

// Spike Risk Gauge Component (reused from pre-meal-check)
function SpikeRiskGauge({ risk }: { risk: number }) {
    const size = 80;
    const strokeWidth = 8;
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const strokeDashoffset = circumference - (risk / 100) * circumference;

    const getColor = () => {
        if (risk < 50) return '#4CAF50';
        if (risk < 75) return '#FF9800';
        return '#F44336';
    };

    const getLabel = () => {
        if (risk < 50) return 'Low';
        if (risk < 75) return 'Moderate';
        return 'High';
    };

    return (
        <View style={gaugeStyles.container}>
            <Svg width={size} height={size}>
                <Circle
                    stroke="#2A2D30"
                    fill="none"
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    strokeWidth={strokeWidth}
                />
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
            <View style={gaugeStyles.textOverlay}>
                <Text style={[gaugeStyles.percentText, { color: getColor() }]}>{risk}%</Text>
                <Text style={gaugeStyles.labelText}>{getLabel()}</Text>
            </View>
        </View>
    );
}

const gaugeStyles = StyleSheet.create({
    container: {
        width: 80,
        height: 80,
        alignItems: 'center',
        justifyContent: 'center',
    },
    textOverlay: {
        position: 'absolute',
        alignItems: 'center',
        justifyContent: 'center',
    },
    percentText: {
        fontFamily: fonts.bold,
        fontSize: 18,
    },
    labelText: {
        fontFamily: fonts.regular,
        fontSize: 10,
        color: '#878787',
    },
});

// AI Loading Screen - matches pre-meal-check.tsx
function AILoadingScreen({ message }: { message: string }) {
    const dot1Anim = React.useRef(new Animated.Value(0)).current;
    const dot2Anim = React.useRef(new Animated.Value(0)).current;
    const dot3Anim = React.useRef(new Animated.Value(0)).current;

    React.useEffect(() => {
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
            <Image
                source={require('@/assets/images/mascot-thinking.png')}
                style={loadingStyles.mascot}
                resizeMode="contain"
            />
            <Text style={loadingStyles.thinkingText}>{message}</Text>
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

// Food Disambiguation Modal
function FoodDisambiguationModal({
    visible,
    query,
    options,
    onSelect,
    onCancel,
}: {
    visible: boolean;
    query: string;
    options: NormalizedFood[];
    onSelect: (food: NormalizedFood) => void;
    onCancel: () => void;
}) {
    return (
        <Modal visible={visible} transparent animationType="slide">
            <View style={modalStyles.overlay}>
                <View style={modalStyles.container}>
                    <Text style={modalStyles.title}>Which "{query}" did you mean?</Text>
                    <ScrollView style={modalStyles.optionsList}>
                        {options.map((food, index) => (
                            <TouchableOpacity
                                key={`${food.provider}-${food.external_id}-${index}`}
                                style={modalStyles.option}
                                onPress={() => onSelect(food)}
                            >
                                <View style={modalStyles.optionInfo}>
                                    <Text style={modalStyles.optionName} numberOfLines={2}>
                                        {food.display_name}
                                    </Text>
                                    {food.brand && (
                                        <Text style={modalStyles.optionBrand}>{food.brand}</Text>
                                    )}
                                    <Text style={modalStyles.optionMacros}>
                                        {food.carbs_g?.toFixed(0) || 0}g carbs • {food.protein_g?.toFixed(0) || 0}g protein
                                    </Text>
                                </View>
                                <Ionicons name="chevron-forward" size={20} color="#878787" />
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                    <TouchableOpacity style={modalStyles.cancelButton} onPress={onCancel}>
                        <Text style={modalStyles.cancelText}>Cancel</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

const modalStyles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'flex-end',
    },
    container: {
        backgroundColor: '#1A1B1C',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        maxHeight: '70%',
    },
    title: {
        fontFamily: fonts.semiBold,
        fontSize: 18,
        color: '#E7E8E9',
        marginBottom: 16,
    },
    optionsList: {
        maxHeight: 300,
    },
    option: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.08)',
    },
    optionInfo: {
        flex: 1,
    },
    optionName: {
        fontFamily: fonts.medium,
        fontSize: 15,
        color: '#E7E8E9',
    },
    optionBrand: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: '#878787',
        marginTop: 2,
    },
    optionMacros: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: '#3494D9',
        marginTop: 4,
    },
    cancelButton: {
        marginTop: 16,
        paddingVertical: 16,
        alignItems: 'center',
    },
    cancelText: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: '#878787',
    },
});

// Parse input text into food items
function parseInputToItems(text: string): string[] {
    // Split on common separators
    const separators = /\s*(?:,|;|\band\b|\bwith\b|\bplus\b|\+)\s*/i;
    const items = text
        .split(separators)
        .map(item => item.trim())
        .filter(item => item.length > 2);
    return items;
}

// Estimate match confidence based on search result
function estimateMatchConfidence(query: string, result: NormalizedFood): number {
    const queryLower = query.toLowerCase();
    const nameLower = result.display_name.toLowerCase();

    // Exact match
    if (nameLower === queryLower) return 100;

    // Name starts with query
    if (nameLower.startsWith(queryLower)) return 90;

    // Query is contained in name
    if (nameLower.includes(queryLower)) return 80;

    // Check word overlap
    const queryWords = queryLower.split(/\s+/);
    const nameWords = nameLower.split(/\s+/);
    const matchingWords = queryWords.filter(qw =>
        nameWords.some(nw => nw.includes(qw) || qw.includes(nw))
    );
    const overlap = matchingWords.length / queryWords.length;

    return Math.round(overlap * 70);
}

export default function CheckSpikeRiskScreen() {
    const { user } = useAuth();
    const { initialText } = useLocalSearchParams<{ initialText?: string }>();
    const [inputText, setInputText] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [resolvedFoods, setResolvedFoods] = useState<ResolvedFood[]>([]);
    const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [hasAutoAnalyzed, setHasAutoAnalyzed] = useState(false);

    // Disambiguation state
    const [disambiguationVisible, setDisambiguationVisible] = useState(false);
    const [disambiguationQuery, setDisambiguationQuery] = useState('');
    const [disambiguationOptions, setDisambiguationOptions] = useState<NormalizedFood[]>([]);
    const [pendingItems, setPendingItems] = useState<string[]>([]);
    const [currentResolvedFoods, setCurrentResolvedFoods] = useState<ResolvedFood[]>([]);

    // Auto-trigger analysis when initialText is provided from bottom sheet
    useEffect(() => {
        if (initialText && !hasAutoAnalyzed && user?.id) {
            setInputText(initialText);
            setHasAutoAnalyzed(true);
            // Trigger analysis after a brief delay to allow state to settle
            setTimeout(() => {
                triggerAnalysis(initialText);
            }, 100);
        }
    }, [initialText, hasAutoAnalyzed, user?.id]);

    const handleClose = () => {
        router.back();
    };

    const processPendingItems = async (
        items: string[],
        resolved: ResolvedFood[]
    ) => {
        if (items.length === 0) {
            // All items resolved, proceed to analysis
            setResolvedFoods(resolved);
            setIsSearching(false);
            await runAnalysis(resolved);
            return;
        }

        const [currentItem, ...remainingItems] = items;

        try {
            const searchResult = await searchWithOrchestration(currentItem);

            if (searchResult.results.length === 0) {
                setError(`Couldn't find "${currentItem}". Try editing your meal.`);
                setIsSearching(false);
                return;
            }

            const topResult = searchResult.results[0];
            const confidence = estimateMatchConfidence(currentItem, topResult);

            if (confidence >= 80) {
                // Auto-select high confidence match
                const newResolved = [...resolved, {
                    query: currentItem,
                    food: topResult,
                    quantity: 1,
                }];
                await processPendingItems(remainingItems, newResolved);
            } else {
                // Show disambiguation modal
                setPendingItems(remainingItems);
                setCurrentResolvedFoods(resolved);
                setDisambiguationQuery(currentItem);
                setDisambiguationOptions(searchResult.results.slice(0, 5));
                setDisambiguationVisible(true);
            }
        } catch (err) {
            console.error('Search error:', err);
            setError(`Error searching for "${currentItem}"`);
            setIsSearching(false);
        }
    };

    const handleDisambiguationSelect = async (food: NormalizedFood) => {
        setDisambiguationVisible(false);
        const newResolved = [...currentResolvedFoods, {
            query: disambiguationQuery,
            food: food,
            quantity: 1,
        }];
        await processPendingItems(pendingItems, newResolved);
    };

    const handleDisambiguationCancel = () => {
        setDisambiguationVisible(false);
        setIsSearching(false);
        setError('Search cancelled. Try a different description.');
    };

    const runAnalysis = async (foods: ResolvedFood[]) => {
        if (!user?.id || foods.length === 0) return;

        setIsAnalyzing(true);
        setError(null);

        try {
            // Build meal draft
            const mealDraft: PremealMealDraft = {
                name: inputText,
                logged_at: new Date().toISOString(),
                items: foods.map(rf => ({
                    display_name: rf.food.display_name,
                    quantity: rf.quantity,
                    unit: rf.food.serving_unit || 'serving',
                    nutrients: {
                        calories_kcal: rf.food.calories_kcal || 0,
                        carbs_g: rf.food.carbs_g || 0,
                        protein_g: rf.food.protein_g || 0,
                        fat_g: rf.food.fat_g || 0,
                        fibre_g: rf.food.fibre_g || 0,
                    },
                })),
            };

            const result = await invokePremealAnalyze(user.id, mealDraft);

            if (result) {
                setAnalysisResult({
                    spike_risk_pct: result.spike_risk_pct,
                    drivers: result.drivers,
                    adjustment_tips: result.adjustment_tips,
                    predicted_curve: result.predicted_curve,
                });
            } else {
                setError('Analysis failed. Please try again.');
            }
        } catch (err) {
            console.error('Analysis error:', err);
            setError('Failed to analyze meal. Please try again.');
        } finally {
            setIsAnalyzing(false);
        }
    };

    // Trigger analysis with given text (used by auto-analyze from initialText)
    const triggerAnalysis = async (text: string) => {
        setError(null);
        setAnalysisResult(null);
        setResolvedFoods([]);
        setIsSearching(true);

        const items = parseInputToItems(text);

        if (items.length === 0) {
            setError('Please describe what you plan to eat.');
            setIsSearching(false);
            return;
        }

        await processPendingItems(items, []);
    };

    const handleAnalyze = async () => {
        if (!inputText.trim()) return;
        await triggerAnalysis(inputText.trim());
    };

    // Compute total macros
    const totalMacros = resolvedFoods.reduce(
        (acc, rf) => ({
            carbs: acc.carbs + (rf.food.carbs_g || 0) * rf.quantity,
            protein: acc.protein + (rf.food.protein_g || 0) * rf.quantity,
            fat: acc.fat + (rf.food.fat_g || 0) * rf.quantity,
            fibre: acc.fibre + (rf.food.fibre_g || 0) * rf.quantity,
        }),
        { carbs: 0, protein: 0, fat: 0, fibre: 0 }
    );

    const isLoading = isSearching || isAnalyzing;
    const hasResults = analysisResult !== null;

    return (
        <View style={styles.container}>
            {/* Background gradient that matches other screens */}
            <LinearGradient
                colors={['#1a1f24', '#181c20', '#111111']}
                locations={[0, 0.3, 1]}
                style={styles.backgroundGradient}
            />
            <SafeAreaView style={styles.safeArea}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={handleClose} style={styles.closeButton} activeOpacity={0.7}>
                        <Ionicons name="close" size={20} color="#E7E8E9" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>CHECK SPIKE RISK</Text>
                    <View style={styles.headerSpacer} />
                </View>

                <KeyboardAvoidingView
                    style={styles.content}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                >
                    {isLoading ? (
                        <AILoadingScreen
                            message={isSearching ? 'Searching foods...' : 'Analyzing your meal...'}
                        />
                    ) : hasResults ? (
                        <ScrollView
                            style={styles.scroll}
                            contentContainerStyle={styles.scrollContent}
                            showsVerticalScrollIndicator={false}
                        >
                            {/* Results */}
                            <View style={styles.resultCard}>
                                {/* Spike Risk */}
                                <View style={styles.riskSection}>
                                    <SpikeRiskGauge risk={analysisResult.spike_risk_pct} />
                                    <View style={styles.riskInfo}>
                                        <Text style={styles.riskTitle}>Spike Risk</Text>
                                        <Text style={styles.riskDescription}>
                                            Based on your planned meal
                                        </Text>
                                    </View>
                                </View>

                                {/* Macros */}
                                <View style={styles.macrosRow}>
                                    <View style={styles.macroItem}>
                                        <Text style={styles.macroValue}>{totalMacros.carbs.toFixed(0)}g</Text>
                                        <Text style={styles.macroLabel}>Carbs</Text>
                                    </View>
                                    <View style={styles.macroItem}>
                                        <Text style={styles.macroValue}>{totalMacros.protein.toFixed(0)}g</Text>
                                        <Text style={styles.macroLabel}>Protein</Text>
                                    </View>
                                    <View style={styles.macroItem}>
                                        <Text style={styles.macroValue}>{totalMacros.fibre.toFixed(0)}g</Text>
                                        <Text style={styles.macroLabel}>Fibre</Text>
                                    </View>
                                    <View style={styles.macroItem}>
                                        <Text style={styles.macroValue}>{totalMacros.fat.toFixed(0)}g</Text>
                                        <Text style={styles.macroLabel}>Fat</Text>
                                    </View>
                                </View>
                            </View>

                            {/* Drivers */}
                            {analysisResult.drivers.length > 0 && (
                                <View style={styles.section}>
                                    <Text style={styles.sectionTitle}>What's affecting your spike</Text>
                                    {analysisResult.drivers.map((driver, i) => (
                                        <View key={i} style={styles.driverItem}>
                                            <Ionicons
                                                name="ellipse"
                                                size={8}
                                                color="#878787"
                                            />
                                            <Text style={styles.driverText}>{driver.text}</Text>
                                        </View>
                                    ))}
                                </View>
                            )}

                            {/* Tips */}
                            {analysisResult.adjustment_tips.length > 0 && (
                                <View style={styles.section}>
                                    <Text style={styles.sectionTitle}>Tips to reduce spike</Text>
                                    {analysisResult.adjustment_tips.map((tip, i) => (
                                        <View key={i} style={styles.tipCard}>
                                            <Ionicons name="bulb-outline" size={20} color="#CAA163" />
                                            <View style={styles.tipContent}>
                                                <Text style={styles.tipTitle}>{tip.title}</Text>
                                                <Text style={styles.tipDescription}>{tip.detail}</Text>
                                            </View>
                                        </View>
                                    ))}
                                </View>
                            )}

                            {/* Try Again Button */}
                            <TouchableOpacity
                                style={styles.tryAgainButton}
                                onPress={() => {
                                    setAnalysisResult(null);
                                    setResolvedFoods([]);
                                    setInputText('');
                                }}
                            >
                                <Text style={styles.tryAgainText}>Check another meal</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    ) : (
                        <View style={styles.inputSection}>
                            <Text style={styles.inputLabel}>What are you planning to eat?</Text>
                            <TextInput
                                style={styles.textInput}
                                placeholder="e.g., butter chicken with naan and rice"
                                placeholderTextColor="#878787"
                                value={inputText}
                                onChangeText={setInputText}
                                multiline
                                numberOfLines={3}
                                textAlignVertical="top"
                            />

                            {error && (
                                <View style={styles.errorContainer}>
                                    <Ionicons name="alert-circle" size={20} color="#F44336" />
                                    <Text style={styles.errorText}>{error}</Text>
                                </View>
                            )}

                            <TouchableOpacity
                                style={[
                                    styles.analyzeButton,
                                    !inputText.trim() && styles.analyzeButtonDisabled,
                                ]}
                                onPress={handleAnalyze}
                                disabled={!inputText.trim()}
                            >
                                <Text style={styles.analyzeButtonText}>Analyze</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </KeyboardAvoidingView>

                {/* Disambiguation Modal */}
                <FoodDisambiguationModal
                    visible={disambiguationVisible}
                    query={disambiguationQuery}
                    options={disambiguationOptions}
                    onSelect={handleDisambiguationSelect}
                    onCancel={handleDisambiguationCancel}
                />
            </SafeAreaView>
        </View>
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
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 16,
    },
    closeButton: {
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
        elevation: 2,
    },
    headerTitle: {
        fontFamily: fonts.bold,
        fontSize: 16,
        color: '#FFFFFF',
        letterSpacing: 2,
    },
    headerSpacer: {
        width: 48,
    },
    content: {
        flex: 1,
    },
    scroll: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
        paddingBottom: 48,
    },
    inputSection: {
        flex: 1,
        padding: 16,
    },
    inputLabel: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: '#E7E8E9',
        marginBottom: 12,
    },
    textInput: {
        backgroundColor: '#1A1B1C',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        padding: 16,
        fontFamily: fonts.regular,
        fontSize: 16,
        color: '#E7E8E9',
        minHeight: 100,
    },
    errorContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 16,
        padding: 12,
        backgroundColor: 'rgba(244, 67, 54, 0.1)',
        borderRadius: 8,
    },
    errorText: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#F44336',
        flex: 1,
    },
    analyzeButton: {
        backgroundColor: '#3494D9',
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 24,
    },
    analyzeButtonDisabled: {
        backgroundColor: '#3F4243',
    },
    analyzeButtonText: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: '#FFFFFF',
    },
    resultCard: {
        backgroundColor: '#1A1B1C',
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
    },
    riskSection: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        marginBottom: 20,
    },
    riskInfo: {
        flex: 1,
    },
    riskTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 18,
        color: '#E7E8E9',
    },
    riskDescription: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#878787',
        marginTop: 4,
    },
    macrosRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.08)',
    },
    macroItem: {
        alignItems: 'center',
    },
    macroValue: {
        fontFamily: fonts.semiBold,
        fontSize: 18,
        color: '#E7E8E9',
    },
    macroLabel: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: '#878787',
        marginTop: 2,
    },
    section: {
        marginBottom: 16,
    },
    sectionTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: '#E7E8E9',
        marginBottom: 12,
    },
    driverItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 8,
    },
    driverText: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#E7E8E9',
        flex: 1,
    },
    tipCard: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        backgroundColor: '#1A1B1C',
        borderRadius: 12,
        padding: 16,
        marginBottom: 8,
    },
    tipContent: {
        flex: 1,
    },
    tipTitle: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: '#E7E8E9',
    },
    tipDescription: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: '#878787',
        marginTop: 4,
    },
    tryAgainButton: {
        borderWidth: 1,
        borderColor: '#3494D9',
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 16,
    },
    tryAgainText: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: '#3494D9',
    },
});
