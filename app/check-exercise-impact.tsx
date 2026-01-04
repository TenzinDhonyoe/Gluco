/**
 * Check Exercise Impact Screen
 * Displays exercise analysis results including calories burned and glucose impact
 */

import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import {
    ExerciseAnalysisResult,
    invokeExerciseAnalyze,
} from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

// Calories Gauge Component
function CaloriesGauge({ calories, maxCalories = 500 }: { calories: number; maxCalories?: number }) {
    const size = 120;
    const strokeWidth = 12;
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const progress = Math.min(calories / maxCalories, 1);
    const strokeDashoffset = circumference - progress * circumference;

    const getColor = () => {
        if (calories < 100) return '#FFC107'; // Yellow - light activity
        if (calories < 250) return '#4CAF50'; // Green - moderate
        return '#4CAF50'; // Green - good burn
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
                <Text style={[gaugeStyles.valueText, { color: getColor() }]}>{calories}</Text>
                <Text style={gaugeStyles.labelText}>calories</Text>
            </View>
        </View>
    );
}

const gaugeStyles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    textOverlay: {
        position: 'absolute',
        alignItems: 'center',
    },
    valueText: {
        fontFamily: fonts.bold,
        fontSize: 32,
    },
    labelText: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: '#878787',
        marginTop: 2,
    },
});

// Glucose Impact Card
function GlucoseImpactCard({ glucoseImpact, personalization }: {
    glucoseImpact: ExerciseAnalysisResult['glucose_impact'];
    personalization?: ExerciseAnalysisResult['personalization'];
}) {
    return (
        <View style={styles.glucoseCard}>
            <View style={styles.glucoseHeader}>
                <Ionicons name="trending-down" size={24} color="#4CAF50" />
                <Text style={styles.glucoseTitle}>Glucose Impact</Text>
                {glucoseImpact.personalized && (
                    <View style={styles.personalizedBadge}>
                        <Ionicons name="person" size={12} color="#4CAF50" />
                        <Text style={styles.personalizedText}>Personalized</Text>
                    </View>
                )}
            </View>
            <View style={styles.glucoseContent}>
                <Text style={styles.glucoseValue}>-{glucoseImpact.reduction_pct}%</Text>
                <Text style={styles.glucoseLabel}>
                    {glucoseImpact.based_on_history
                        ? 'Based on your glucose history'
                        : 'Expected reduction'}
                </Text>
            </View>
            <View style={styles.glucoseTiming}>
                <Ionicons name="time-outline" size={16} color="#878787" />
                <Text style={styles.timingText}>{glucoseImpact.timing_benefit}</Text>
            </View>
            <View style={styles.optimalTiming}>
                <Text style={styles.optimalLabel}>Optimal timing:</Text>
                <Text style={styles.optimalValue}>{glucoseImpact.optimal_timing}</Text>
            </View>
            {personalization && personalization.data_quality !== 'none' && (
                <View style={styles.dataQuality}>
                    <Ionicons name="analytics-outline" size={14} color="#878787" />
                    <Text style={styles.dataQualityText}>
                        Data quality: {personalization.data_quality} ({personalization.glucose_observations} readings)
                    </Text>
                </View>
            )}
        </View>
    );
}

// Tip Card Component
function TipCard({ tip }: { tip: { title: string; detail: string; icon: string } }) {
    const iconName = tip.icon as keyof typeof Ionicons.glyphMap;

    return (
        <View style={styles.tipCard}>
            <View style={styles.tipIconContainer}>
                <Ionicons name={iconName || 'bulb-outline'} size={20} color="#4CAF50" />
            </View>
            <View style={styles.tipContent}>
                <Text style={styles.tipTitle}>{tip.title}</Text>
                <Text style={styles.tipDetail}>{tip.detail}</Text>
            </View>
        </View>
    );
}

export default function CheckExerciseImpactScreen() {
    const { user } = useAuth();
    const params = useLocalSearchParams();
    const initialText = params.initialText as string || '';

    const [isAnalyzing, setIsAnalyzing] = useState(true);
    const [result, setResult] = useState<ExerciseAnalysisResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!initialText || !user?.id) {
            setError('Missing exercise or user information');
            setIsAnalyzing(false);
            return;
        }

        analyzeExercise();
    }, []);

    const analyzeExercise = async () => {
        if (!user?.id || !initialText) return;

        setIsAnalyzing(true);
        setError(null);

        try {
            const analysisResult = await invokeExerciseAnalyze(user.id, initialText);

            if (analysisResult) {
                setResult(analysisResult);
            } else {
                setError('Could not analyze exercise. Please try again.');
            }
        } catch (err) {
            console.error('Exercise analysis error:', err);
            setError('An error occurred. Please try again.');
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleBack = () => {
        router.back();
    };

    const handleLogExercise = () => {
        if (result) {
            router.push({
                pathname: '/log-activity',
                params: {
                    name: result.exercise.name,
                    duration: result.exercise.duration_min.toString(),
                    calories: result.calories_burned.toString(),
                    intensity: result.exercise.intensity,
                },
            } as any);
        }
    };

    const getIntensityColor = (intensity: string) => {
        switch (intensity) {
            case 'light': return '#FFC107';
            case 'moderate': return '#4CAF50';
            case 'vigorous': return '#FF5722';
            default: return '#878787';
        }
    };

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={['#1A231E', '#111111']}
                style={styles.backgroundGradient}
            />

            <SafeAreaView style={styles.safeArea}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity
                        style={styles.closeButton}
                        onPress={handleBack}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="close" size={20} color="#E7E8E9" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>EXERCISE IMPACT</Text>
                    <View style={styles.headerSpacer} />
                </View>

                {isAnalyzing ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#4CAF50" />
                        <Text style={styles.loadingText}>Analyzing exercise...</Text>
                        <Text style={styles.loadingSubtext}>{initialText}</Text>
                    </View>
                ) : error ? (
                    <View style={styles.errorContainer}>
                        <Ionicons name="alert-circle-outline" size={48} color="#F44336" />
                        <Text style={styles.errorText}>{error}</Text>
                        <TouchableOpacity style={styles.retryButton} onPress={analyzeExercise}>
                            <Text style={styles.retryText}>Try Again</Text>
                        </TouchableOpacity>
                    </View>
                ) : result ? (
                    <ScrollView
                        style={styles.scrollView}
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                    >
                        {/* Exercise Summary */}
                        <View style={styles.summaryCard}>
                            <View style={styles.exerciseInfo}>
                                <Text style={styles.exerciseName}>{result.exercise.name}</Text>
                                <View style={styles.exerciseMeta}>
                                    <View style={styles.metaItem}>
                                        <Ionicons name="time-outline" size={16} color="#878787" />
                                        <Text style={styles.metaText}>{result.exercise.duration_min} min</Text>
                                    </View>
                                    <View style={[
                                        styles.intensityBadge,
                                        { backgroundColor: getIntensityColor(result.exercise.intensity) + '20' }
                                    ]}>
                                        <Text style={[
                                            styles.intensityText,
                                            { color: getIntensityColor(result.exercise.intensity) }
                                        ]}>
                                            {result.exercise.intensity.charAt(0).toUpperCase() + result.exercise.intensity.slice(1)}
                                        </Text>
                                    </View>
                                </View>
                            </View>
                            <CaloriesGauge calories={result.calories_burned} />
                        </View>

                        {/* Glucose Impact */}
                        <GlucoseImpactCard
                            glucoseImpact={result.glucose_impact}
                            personalization={result.personalization}
                        />

                        {/* Tips Section */}
                        {result.tips.length > 0 && (
                            <View style={styles.tipsSection}>
                                <Text style={styles.sectionTitle}>Tips</Text>
                                {result.tips.map((tip, index) => (
                                    <TipCard key={index} tip={tip} />
                                ))}
                            </View>
                        )}

                        {/* Log Exercise Button */}
                        <TouchableOpacity
                            style={styles.logButton}
                            onPress={handleLogExercise}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.logButtonText}>Log This Exercise</Text>
                        </TouchableOpacity>
                    </ScrollView>
                ) : null}
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
        height: 300,
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
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    loadingText: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: '#FFFFFF',
        marginTop: 16,
    },
    loadingSubtext: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#878787',
        marginTop: 8,
        textAlign: 'center',
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    errorText: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: '#FFFFFF',
        marginTop: 16,
        textAlign: 'center',
    },
    retryButton: {
        marginTop: 24,
        paddingHorizontal: 24,
        paddingVertical: 12,
        backgroundColor: '#4CAF50',
        borderRadius: 12,
    },
    retryText: {
        fontFamily: fonts.semiBold,
        fontSize: 14,
        color: '#FFFFFF',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
        paddingBottom: 32,
    },
    summaryCard: {
        backgroundColor: '#1A1B1C',
        borderRadius: 16,
        padding: 20,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    exerciseInfo: {
        flex: 1,
        marginRight: 16,
    },
    exerciseName: {
        fontFamily: fonts.bold,
        fontSize: 24,
        color: '#FFFFFF',
        marginBottom: 12,
    },
    exerciseMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    metaItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    metaText: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#878787',
    },
    intensityBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    intensityText: {
        fontFamily: fonts.medium,
        fontSize: 12,
    },
    glucoseCard: {
        backgroundColor: '#1A1B1C',
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
    },
    glucoseHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
    },
    glucoseTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: '#FFFFFF',
    },
    glucoseContent: {
        alignItems: 'center',
        marginBottom: 16,
    },
    glucoseValue: {
        fontFamily: fonts.bold,
        fontSize: 48,
        color: '#4CAF50',
    },
    glucoseLabel: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#878787',
        marginTop: 4,
    },
    glucoseTiming: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
    },
    timingText: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: '#878787',
        flex: 1,
    },
    optimalTiming: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: 'rgba(76, 175, 80, 0.1)',
        padding: 12,
        borderRadius: 8,
    },
    optimalLabel: {
        fontFamily: fonts.medium,
        fontSize: 13,
        color: '#878787',
    },
    optimalValue: {
        fontFamily: fonts.medium,
        fontSize: 13,
        color: '#4CAF50',
    },
    personalizedBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(76, 175, 80, 0.15)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        marginLeft: 'auto',
    },
    personalizedText: {
        fontFamily: fonts.medium,
        fontSize: 11,
        color: '#4CAF50',
    },
    dataQuality: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.08)',
    },
    dataQualityText: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: '#878787',
    },
    tipsSection: {
        marginBottom: 16,
    },
    sectionTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: '#FFFFFF',
        marginBottom: 12,
    },
    tipCard: {
        backgroundColor: '#1A1B1C',
        borderRadius: 12,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        marginBottom: 8,
    },
    tipIconContainer: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(76, 175, 80, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    tipContent: {
        flex: 1,
    },
    tipTitle: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: '#FFFFFF',
        marginBottom: 4,
    },
    tipDetail: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: '#878787',
        lineHeight: 18,
    },
    logButton: {
        backgroundColor: '#4CAF50',
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 8,
    },
    logButtonText: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: '#FFFFFF',
    },
});
