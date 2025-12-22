/**
 * Post Meal Review Screen
 * Shows predicted vs actual glucose curve with insights
 * Design matches Figma: Post Meal Review screen
 * 
 * Two modes:
 * 1. CGM User: Shows actual vs predicted with insights
 * 2. Non-CGM User: Shows predicted only with Connect CGM / Manual Log options
 */

import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import {
    computeActualGlucoseCurve,
    generateReviewInsights,
    getPostMealReview,
    PostMealReview,
    ReviewStatusTag,
    supabase,
    updatePostMealReviewStatus,
} from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Line, Path, Stop, LinearGradient as SvgGradient, Text as SvgText } from 'react-native-svg';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - 32;
const CHART_HEIGHT = 220;
const CHART_PADDING = { left: 35, right: 20, top: 25, bottom: 60 };

// Mood options
const MOOD_OPTIONS = ['😫', '😕', '😐', '🙂', '😊'];

export default function PostMealReviewScreen() {
    const { reviewId, mockData, refresh } = useLocalSearchParams<{ reviewId: string; mockData?: string; refresh?: string }>();
    const { user } = useAuth();

    const [loading, setLoading] = useState(true);
    const [review, setReview] = useState<PostMealReview | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [selectedMood, setSelectedMood] = useState<number | null>(null);
    const [hasCgmData, setHasCgmData] = useState(false);
    const [actualData, setActualData] = useState<{
        curve: { time: number; value: number }[];
        peak: number | null;
        hasData: boolean;
    } | null>(null);
    const [hasRefreshed, setHasRefreshed] = useState(false);

    const loadReview = useCallback(async () => {
        if (!reviewId || !user?.id) {
            setError('No review ID provided');
            setLoading(false);
            return;
        }

        try {
            setLoading(true);

            // Handle mock data passed directly from Today carousel
            if (mockData) {
                try {
                    const parsedReview = JSON.parse(mockData) as PostMealReview;
                    setReview(parsedReview);
                    setHasCgmData(!!(parsedReview.actual_curve && parsedReview.actual_curve.length > 0));
                    setActualData({
                        curve: parsedReview.actual_curve || [],
                        peak: parsedReview.actual_peak || null,
                        hasData: true,
                    });
                    setLoading(false);
                    return;
                } catch (e) {
                    console.error('Failed to parse mock data:', e);
                }
            }

            // Fetch real review from database
            const reviewData = await getPostMealReview(reviewId);

            if (!reviewData) {
                setError('Review not found');
                setLoading(false);
                return;
            }

            setReview(reviewData);

            // Check if we need to compute actual data
            const scheduledTime = new Date(reviewData.scheduled_for);
            const now = new Date();

            if (now < scheduledTime) {
                // Review not ready yet
                setLoading(false);
                return;
            }

            // Compute actual glucose curve if we have meal time
            if (reviewData.meal_time) {
                const mealTime = new Date(reviewData.meal_time);
                const actualResult = await computeActualGlucoseCurve(
                    reviewData.user_id,
                    mealTime,
                    3 // 3 hour window
                );
                setActualData(actualResult);
                setHasCgmData(actualResult.hasData && actualResult.curve.length >= 3);

                // Generate insights and update review if we have data
                if (actualResult.hasData && actualResult.curve.length >= 3) {
                    const insights = generateReviewInsights(
                        reviewData.predicted_peak,
                        actualResult.peak
                    );

                    await updatePostMealReviewStatus(reviewId, 'opened', {
                        opened_at: new Date(),
                        actual_peak: actualResult.peak || undefined,
                        actual_curve: actualResult.curve,
                        summary: insights.summary,
                        status_tag: insights.statusTag,
                        contributors: insights.contributors,
                    });

                    // Update local state with new data
                    setReview(prev => prev ? {
                        ...prev,
                        status: 'opened',
                        actual_peak: actualResult.peak,
                        actual_curve: actualResult.curve,
                        summary: insights.summary,
                        status_tag: insights.statusTag,
                        contributors: insights.contributors,
                    } : null);
                } else {
                    // Mark as opened even without data
                    await updatePostMealReviewStatus(reviewId, 'opened', {
                        opened_at: new Date(),
                    });
                }
            }

            setLoading(false);
        } catch (err) {
            console.error('Error loading review:', err);
            setError('Failed to load review');
            setLoading(false);
        }
    }, [reviewId, user?.id]);

    useEffect(() => {
        loadReview();
    }, [loadReview]);

    // Reload when returning from log-glucose with refresh flag
    useEffect(() => {
        if (refresh === 'true' && !hasRefreshed) {
            setHasRefreshed(true);
            setHasCgmData(true); // Mark as having data since user manually logged
            loadReview();
        }
    }, [refresh, hasRefreshed, loadReview]);

    const handleClose = () => {
        router.back();
    };

    const handleConnectCGM = () => {
        router.push('/connect-dexcom' as any);
    };

    const handleLogGlucoseManually = () => {
        // Navigate to log glucose with return params
        router.push({
            pathname: '/log-glucose' as any,
            params: {
                returnTo: '/post-meal-review',
                reviewId: reviewId,
                context: 'post_meal',
            },
        });
    };

    const handleSaveMood = async () => {
        if (!reviewId || selectedMood === null) return;

        try {
            // Store mood in the review
            await supabase
                .from('post_meal_reviews')
                .update({
                    mood_rating: selectedMood,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', reviewId);
        } catch (err) {
            console.error('Failed to save mood:', err);
        }
    };

    useEffect(() => {
        if (selectedMood !== null) {
            handleSaveMood();
        }
    }, [selectedMood]);

    const isReviewReady = () => {
        if (!review) return false;
        return new Date() >= new Date(review.scheduled_for);
    };

    const getStatusTagStyle = (tag: ReviewStatusTag | null) => {
        switch (tag) {
            case 'steady':
                return { bg: '#1E4D2B', text: '#4CAF50', label: 'Steady' };
            case 'mild_elevation':
                return { bg: '#3D5A1F', text: '#8BC34A', label: 'Mild Elevation' };
            case 'spike':
                return { bg: '#4D1E1E', text: '#F44336', label: 'Spike' };
            default:
                return { bg: '#2D2D2D', text: '#878787', label: 'Pending Data' };
        }
    };

    const formatTime = (dateStr: string | null) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const h = date.getHours();
        const m = date.getMinutes();
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        return `${h12.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${ampm}`;
    };

    const formatDateLabel = (dateStr: string | null) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const today = new Date();
        if (date.toDateString() === today.toDateString()) {
            return 'Today';
        }
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        if (date.toDateString() === yesterday.toDateString()) {
            return 'Yesterday';
        }
        return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    };

    // Generate time labels for X axis based on meal time
    const generateTimeLabels = (mealTime: Date) => {
        const labels = [];
        for (let i = 0; i <= 120; i += 20) {
            const time = new Date(mealTime.getTime() + i * 60 * 1000);
            const h = time.getHours();
            const m = time.getMinutes();
            const ampm = h >= 12 ? 'PM' : 'AM';
            const h12 = h % 12 || 12;
            labels.push(`${h12.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}${ampm}`);
        }
        return labels;
    };

    // Render the glucose chart - handles both CGM and non-CGM modes
    const renderChart = (showActual: boolean = true) => {
        const predictedCurve = review?.predicted_curve || [];
        const actualCurve = showActual ? (actualData?.curve || review?.actual_curve || []) : [];

        if (predictedCurve.length === 0 && actualCurve.length === 0) {
            return (
                <View style={styles.chartPlaceholder}>
                    <Text style={styles.chartPlaceholderText}>No glucose data available</Text>
                </View>
            );
        }

        // Combine all values for scale
        const allValues = [...predictedCurve.map(p => p.value), ...actualCurve.map(p => p.value)];
        const yTicks = [0, 3, 5, 7, 9, 11, 15];
        const maxTime = 120;

        const chartInnerWidth = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
        const chartInnerHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;

        const scaleX = (time: number) => CHART_PADDING.left + (time / maxTime) * chartInnerWidth;
        const scaleY = (value: number) => CHART_PADDING.top + chartInnerHeight - ((value - 0) / 15) * chartInnerHeight;

        const createPath = (curve: { time: number; value: number }[]) => {
            if (curve.length === 0) return '';
            const sorted = [...curve].sort((a, b) => a.time - b.time);
            return sorted.map((p, i) =>
                `${i === 0 ? 'M' : 'L'} ${scaleX(p.time)} ${scaleY(p.value)}`
            ).join(' ');
        };

        const createFilledPath = (curve: { time: number; value: number }[]) => {
            if (curve.length === 0) return '';
            const sorted = [...curve].sort((a, b) => a.time - b.time);
            const linePath = sorted.map((p, i) =>
                `${i === 0 ? 'M' : 'L'} ${scaleX(p.time)} ${scaleY(p.value)}`
            ).join(' ');
            const baseline = scaleY(0);
            const startX = scaleX(sorted[0].time);
            const endX = scaleX(sorted[sorted.length - 1].time);
            return `${linePath} L ${endX} ${baseline} L ${startX} ${baseline} Z`;
        };

        const predictedPeakPoint = predictedCurve.length > 0
            ? predictedCurve.reduce((max, p) => p.value > max.value ? p : max, predictedCurve[0])
            : null;
        const actualPeakPoint = actualCurve.length > 0
            ? actualCurve.reduce((max, p) => p.value > max.value ? p : max, actualCurve[0])
            : null;

        const mealTime = review?.meal_time ? new Date(review.meal_time) : new Date();
        const timeLabels = generateTimeLabels(mealTime);

        return (
            <View style={styles.chartContainer}>
                {/* Legend */}
                <View style={styles.chartLegend}>
                    <Text style={styles.yAxisLabel}>mmol/L</Text>
                    <View style={styles.legendItems}>
                        {showActual && actualCurve.length > 0 && (
                            <View style={styles.legendItem}>
                                <View style={[styles.legendDot, { backgroundColor: '#3494D9' }]} />
                                <Text style={styles.legendText}>Actual</Text>
                            </View>
                        )}
                        <View style={styles.legendItem}>
                            <View style={[styles.legendDotOutline]} />
                            <Text style={styles.legendText}>Predicted</Text>
                        </View>
                    </View>
                </View>

                <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
                    <Defs>
                        <SvgGradient id="actualGradient" x1="0" y1="0" x2="0" y2="1">
                            <Stop offset="0" stopColor="#3494D9" stopOpacity="0.3" />
                            <Stop offset="1" stopColor="#3494D9" stopOpacity="0" />
                        </SvgGradient>
                        <SvgGradient id="predictedGradient" x1="0" y1="0" x2="0" y2="1">
                            <Stop offset="0" stopColor="#6B6B6B" stopOpacity="0.2" />
                            <Stop offset="1" stopColor="#6B6B6B" stopOpacity="0" />
                        </SvgGradient>
                    </Defs>

                    {/* Horizontal grid lines */}
                    {yTicks.map(val => (
                        <Line
                            key={`grid-${val}`}
                            x1={CHART_PADDING.left}
                            y1={scaleY(val)}
                            x2={CHART_WIDTH - CHART_PADDING.right}
                            y2={scaleY(val)}
                            stroke="#2D2D2D"
                            strokeWidth={1}
                        />
                    ))}

                    {/* Target zone */}
                    <Line
                        x1={CHART_PADDING.left}
                        y1={scaleY(7.8)}
                        x2={CHART_WIDTH - CHART_PADDING.right}
                        y2={scaleY(7.8)}
                        stroke="#4A4A4A"
                        strokeWidth={1}
                        strokeDasharray="4,4"
                    />

                    {/* Y-axis labels */}
                    {yTicks.map(val => (
                        <SvgText
                            key={`y-${val}`}
                            x={CHART_PADDING.left - 8}
                            y={scaleY(val) + 4}
                            fontSize={11}
                            fill="#878787"
                            textAnchor="end"
                        >
                            {val}
                        </SvgText>
                    ))}

                    {/* X-axis labels */}
                    {[0, 20, 40, 60, 80, 100, 120].map((time, i) => (
                        <SvgText
                            key={`x-${time}`}
                            x={scaleX(time)}
                            y={CHART_HEIGHT - 15}
                            fontSize={9}
                            fill="#878787"
                            textAnchor="middle"
                            transform={`rotate(-45, ${scaleX(time)}, ${CHART_HEIGHT - 15})`}
                        >
                            {timeLabels[i] || ''}
                        </SvgText>
                    ))}

                    {/* Filled area - only for the curve we're showing */}
                    {showActual && actualCurve.length > 0 ? (
                        <Path d={createFilledPath(actualCurve)} fill="url(#actualGradient)" />
                    ) : predictedCurve.length > 0 && (
                        <Path d={createFilledPath(predictedCurve)} fill="url(#predictedGradient)" />
                    )}

                    {/* Predicted curve */}
                    {predictedCurve.length > 0 && (
                        <Path
                            d={createPath(predictedCurve)}
                            stroke="#6B6B6B"
                            strokeWidth={2}
                            fill="none"
                        />
                    )}

                    {/* Actual curve */}
                    {showActual && actualCurve.length > 0 && (
                        <Path
                            d={createPath(actualCurve)}
                            stroke="#3494D9"
                            strokeWidth={2.5}
                            fill="none"
                        />
                    )}

                    {/* Peak markers */}
                    {predictedPeakPoint && (
                        <>
                            <Circle
                                cx={scaleX(predictedPeakPoint.time)}
                                cy={scaleY(predictedPeakPoint.value)}
                                r={4}
                                fill="#6B6B6B"
                            />
                            <SvgText
                                x={scaleX(predictedPeakPoint.time)}
                                y={scaleY(predictedPeakPoint.value) - 10}
                                fontSize={11}
                                fill={showActual && actualCurve.length > 0 ? "#878787" : "#FFFFFF"}
                                textAnchor="middle"
                            >
                                {predictedPeakPoint.value.toFixed(1)}
                            </SvgText>
                        </>
                    )}

                    {showActual && actualPeakPoint && (
                        <>
                            <Circle
                                cx={scaleX(actualPeakPoint.time)}
                                cy={scaleY(actualPeakPoint.value)}
                                r={5}
                                fill="#3494D9"
                            />
                            <SvgText
                                x={scaleX(actualPeakPoint.time)}
                                y={scaleY(actualPeakPoint.value) - 12}
                                fontSize={12}
                                fill="#FFFFFF"
                                textAnchor="middle"
                                fontWeight="600"
                            >
                                {actualPeakPoint.value.toFixed(1)}
                            </SvgText>
                        </>
                    )}
                </Svg>
            </View>
        );
    };

    // Loading state
    if (loading) {
        return (
            <View style={styles.container}>
                <LinearGradient
                    colors={['#1a1f24', '#181c20', '#111111']}
                    locations={[0, 0.3, 1]}
                    style={styles.topGlow}
                />
                <SafeAreaView style={styles.safeArea}>
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#3494D9" />
                        <Text style={styles.loadingText}>Loading review...</Text>
                    </View>
                </SafeAreaView>
            </View>
        );
    }

    // Error state
    if (error) {
        return (
            <View style={styles.container}>
                <LinearGradient
                    colors={['#1a1f24', '#181c20', '#111111']}
                    locations={[0, 0.3, 1]}
                    style={styles.topGlow}
                />
                <SafeAreaView style={styles.safeArea}>
                    <View style={styles.header}>
                        <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                            <Ionicons name="close" size={24} color="#E7E8E9" />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>POST MEAL REVIEW</Text>
                        <View style={styles.headerSpacer} />
                    </View>
                    <View style={styles.errorContainer}>
                        <Ionicons name="alert-circle-outline" size={64} color="#F44336" />
                        <Text style={styles.errorText}>{error}</Text>
                        <TouchableOpacity style={styles.retryButton} onPress={loadReview}>
                            <Text style={styles.retryButtonText}>Try Again</Text>
                        </TouchableOpacity>
                    </View>
                </SafeAreaView>
            </View>
        );
    }

    // Not ready yet
    if (!isReviewReady()) {
        return (
            <View style={styles.container}>
                <LinearGradient
                    colors={['#1a1f24', '#181c20', '#111111']}
                    locations={[0, 0.3, 1]}
                    style={styles.topGlow}
                />
                <SafeAreaView style={styles.safeArea}>
                    <View style={styles.header}>
                        <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                            <Ionicons name="close" size={24} color="#E7E8E9" />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>POST MEAL REVIEW</Text>
                        <View style={styles.headerSpacer} />
                    </View>
                    <View style={styles.notReadyContainer}>
                        <Ionicons name="time-outline" size={64} color="#3494D9" />
                        <Text style={styles.notReadyTitle}>Review Not Ready Yet</Text>
                        <Text style={styles.notReadySubtitle}>
                            Check back at {formatTime(review?.scheduled_for || null)}
                        </Text>
                    </View>
                </SafeAreaView>
            </View>
        );
    }

    const statusStyle = getStatusTagStyle(review?.status_tag as ReviewStatusTag);
    const actualPeak = actualData?.peak || review?.actual_peak;

    // NON-CGM USER VIEW
    if (!hasCgmData) {
        return (
            <View style={styles.container}>
                <LinearGradient
                    colors={['#1a1f24', '#181c20', '#111111']}
                    locations={[0, 0.3, 1]}
                    style={styles.topGlow}
                />
                <SafeAreaView style={styles.safeArea}>
                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                            <Ionicons name="close" size={24} color="#E7E8E9" />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>POST MEAL REVIEW</Text>
                        <View style={styles.headerSpacer} />
                    </View>

                    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
                        {/* Meal Info */}
                        <Text style={styles.mealName}>{review?.meal_name || 'Meal'}</Text>
                        <View style={styles.mealTimeRow}>
                            <Text style={styles.mealTime}>{formatTime(review?.meal_time || null)}</Text>
                            <View style={styles.dotSeparator} />
                            <Text style={styles.mealTime}>{formatDateLabel(review?.meal_time || null)}</Text>
                        </View>

                        {/* Chart - Predicted only */}
                        {renderChart(false)}

                        {/* Connect CGM Banner */}
                        <TouchableOpacity style={styles.cgmBanner} onPress={handleConnectCGM}>
                            <LinearGradient
                                colors={['#1A2A3A', '#1A2530']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.cgmBannerGradient}
                            >
                                <View style={styles.cgmBannerContent}>
                                    <Text style={styles.cgmBannerTitle}>Connect CGM</Text>
                                    <Text style={styles.cgmBannerSubtitle}>
                                        Get personalized scores with glucose data.
                                    </Text>
                                </View>
                                <View style={styles.cgmBannerIcon}>
                                    <View style={styles.cgmDeviceCircle}>
                                        <LinearGradient
                                            colors={['#3494D9', '#1E5F8A']}
                                            style={styles.cgmDeviceInner}
                                        />
                                    </View>
                                    <Ionicons name="chevron-forward" size={20} color="#878787" />
                                </View>
                            </LinearGradient>
                        </TouchableOpacity>

                        {/* OR Divider */}
                        <View style={styles.orDivider}>
                            <View style={styles.orLine} />
                            <Text style={styles.orText}>OR</Text>
                            <View style={styles.orLine} />
                        </View>

                        {/* Manual Log Button */}
                        <TouchableOpacity style={styles.manualLogButton} onPress={handleLogGlucoseManually}>
                            <Text style={styles.manualLogButtonText}>Log Glucose Level Manually</Text>
                        </TouchableOpacity>
                    </ScrollView>
                </SafeAreaView>
            </View>
        );
    }

    // CGM USER VIEW - Full insights
    return (
        <View style={styles.container}>
            <LinearGradient
                colors={['#1a1f24', '#181c20', '#111111']}
                locations={[0, 0.3, 1]}
                style={styles.topGlow}
            />
            <SafeAreaView style={styles.safeArea}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                        <Ionicons name="close" size={24} color="#E7E8E9" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>POST MEAL REVIEW</Text>
                    <View style={styles.headerSpacer} />
                </View>

                <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
                    {/* Meal Info */}
                    <Text style={styles.mealName}>{review?.meal_name || 'Meal'}</Text>
                    <View style={styles.mealTimeRow}>
                        <Text style={styles.mealTime}>{formatTime(review?.meal_time || null)}</Text>
                        <View style={styles.dotSeparator} />
                        <Text style={styles.mealTime}>{formatDateLabel(review?.meal_time || null)}</Text>
                    </View>

                    {/* Chart - Actual vs Predicted */}
                    {renderChart(true)}

                    {/* Status Tag */}
                    <View style={[styles.statusTag, { backgroundColor: statusStyle.bg }]}>
                        <Text style={[styles.statusTagText, { color: statusStyle.text }]}>
                            {statusStyle.label}
                        </Text>
                    </View>

                    {/* Summary */}
                    <Text style={styles.summary}>
                        Peaked at {actualPeak?.toFixed(1) || '—'} mmol/L - {
                            review?.status_tag === 'steady' ? 'smoother than expected' :
                                review?.status_tag === 'mild_elevation' ? 'smoother than expected' :
                                    'higher than expected'
                        }
                    </Text>

                    {/* Contributors Section */}
                    <Text style={styles.sectionTitle}>Contributors</Text>

                    {review?.contributors && review.contributors.length > 0 ? (
                        review.contributors.map((contributor, i) => (
                            <View key={i} style={styles.contributorCard}>
                                <Text style={styles.contributorTitle}>{contributor.title}</Text>
                                <Text style={styles.contributorDetail}>{contributor.detail}</Text>
                            </View>
                        ))
                    ) : (
                        <View style={styles.contributorCard}>
                            <Text style={styles.contributorTitle}>Meal Analysis</Text>
                            <Text style={styles.contributorDetail}>
                                Your glucose response was within a healthy range. The combination of fiber and protein in this meal helped moderate the glucose spike.
                            </Text>
                        </View>
                    )}

                    {/* How do you feel section */}
                    <Text style={styles.feelingLabel}>How do you feel post meal?</Text>
                    <View style={styles.moodRow}>
                        {MOOD_OPTIONS.map((mood, index) => (
                            <TouchableOpacity
                                key={index}
                                style={[
                                    styles.moodButton,
                                    selectedMood === index && styles.moodButtonSelected
                                ]}
                                onPress={() => setSelectedMood(index)}
                            >
                                <Text style={styles.moodEmoji}>{mood}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
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
    safeArea: {
        flex: 1,
    },
    header: {
        height: 72,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
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
    },
    headerTitle: {
        fontFamily: fonts.bold,
        fontSize: 18,
        color: '#FFFFFF',
        letterSpacing: 1,
    },
    headerSpacer: {
        width: 48,
    },
    scroll: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 16,
        paddingBottom: 48,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        fontFamily: fonts.regular,
        fontSize: 16,
        color: '#878787',
        marginTop: 16,
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
    },
    errorText: {
        fontFamily: fonts.regular,
        fontSize: 16,
        color: '#F44336',
        marginTop: 16,
        textAlign: 'center',
    },
    retryButton: {
        marginTop: 24,
        paddingHorizontal: 24,
        paddingVertical: 12,
        backgroundColor: '#3494D9',
        borderRadius: 12,
    },
    retryButtonText: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: '#FFFFFF',
    },
    notReadyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
    },
    notReadyTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 20,
        color: '#E7E8E9',
        marginTop: 16,
    },
    notReadySubtitle: {
        fontFamily: fonts.regular,
        fontSize: 15,
        color: '#878787',
        marginTop: 8,
    },
    mealName: {
        fontFamily: fonts.semiBold,
        fontSize: 22,
        color: '#FFFFFF',
        marginTop: 8,
    },
    mealTimeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
        marginBottom: 20,
    },
    mealTime: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#FFFFFF',
    },
    dotSeparator: {
        width: 5,
        height: 5,
        borderRadius: 2.5,
        backgroundColor: '#FFFFFF',
        marginHorizontal: 8,
    },
    chartContainer: {
        marginBottom: 16,
    },
    chartLegend: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    yAxisLabel: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: '#878787',
    },
    legendItems: {
        flexDirection: 'row',
        gap: 16,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    legendDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    legendDotOutline: {
        width: 8,
        height: 8,
        borderRadius: 4,
        borderWidth: 2,
        borderColor: '#6B6B6B',
    },
    legendText: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: '#FFFFFF',
    },
    chartPlaceholder: {
        height: CHART_HEIGHT,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(63, 66, 67, 0.2)',
        borderRadius: 12,
        marginBottom: 16,
    },
    chartPlaceholderText: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#878787',
    },
    statusTag: {
        alignSelf: 'flex-start',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 4,
        marginBottom: 8,
    },
    statusTagText: {
        fontFamily: fonts.medium,
        fontSize: 13,
    },
    summary: {
        fontFamily: fonts.regular,
        fontSize: 15,
        color: '#FFFFFF',
        marginBottom: 32,
    },
    sectionTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 18,
        color: '#FFFFFF',
        marginBottom: 12,
    },
    contributorCard: {
        backgroundColor: '#1A2A3A',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
    },
    contributorTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 15,
        color: '#FFFFFF',
        marginBottom: 8,
    },
    contributorDetail: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: '#A0A0A0',
        lineHeight: 20,
    },
    feelingLabel: {
        fontFamily: fonts.medium,
        fontSize: 15,
        color: '#FFFFFF',
        marginTop: 24,
        marginBottom: 16,
    },
    moodRow: {
        flexDirection: 'row',
        justifyContent: 'flex-start',
        gap: 12,
    },
    moodButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: '#3F4243',
        justifyContent: 'center',
        alignItems: 'center',
    },
    moodButtonSelected: {
        borderColor: '#3494D9',
        backgroundColor: 'rgba(52, 148, 217, 0.2)',
    },
    moodEmoji: {
        fontSize: 20,
    },
    // Non-CGM specific styles
    cgmBanner: {
        marginTop: 16,
        borderRadius: 12,
        overflow: 'hidden',
    },
    cgmBannerGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
    },
    cgmBannerContent: {
        flex: 1,
    },
    cgmBannerTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: '#FFFFFF',
        marginBottom: 4,
    },
    cgmBannerSubtitle: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: '#A0A0A0',
    },
    cgmBannerIcon: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    cgmDeviceCircle: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#2D2D2D',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 4,
    },
    cgmDeviceInner: {
        width: '100%',
        height: '100%',
        borderRadius: 20,
    },
    orDivider: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 24,
    },
    orLine: {
        flex: 1,
        height: 1,
        backgroundColor: '#3F4243',
    },
    orText: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: '#878787',
        marginHorizontal: 16,
    },
    manualLogButton: {
        backgroundColor: '#1E1E1E',
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#3F4243',
    },
    manualLogButtonText: {
        fontFamily: fonts.semiBold,
        fontSize: 15,
        color: '#FFFFFF',
    },
});
