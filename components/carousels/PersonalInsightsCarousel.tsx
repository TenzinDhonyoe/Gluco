/**
 * Personal Insights - Best Next Step Card
 *
 * Single primary action card replacing the multi-card carousel.
 * Uses low-anxiety patterns: time context, outcome language, and dismissal.
 */

import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { Colors } from '@/constants/Colors';
import { Images } from '@/constants/Images';
import { fonts } from '@/hooks/useFonts';
import { InsightReadiness, PersonalInsight } from '@/lib/insights';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Image,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View
} from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';

// ============================================
// TYPES
// ============================================

interface PersonalInsightsCarouselProps {
    insights: PersonalInsight[];
    primaryInsight: PersonalInsight | null;
    secondaryInsights: PersonalInsight[];
    onDismiss: (id: string) => void;
    isLoading?: boolean;
    onMealPress?: () => void;
    onExercisePress?: () => void;
    insightReadiness?: InsightReadiness;
}

// ============================================
// BEST NEXT STEP CARD
// ============================================

function BestNextStepCard({ insight, onDismiss }: {
    insight: PersonalInsight;
    onDismiss: () => void;
}) {
    const cta = insight.action?.cta ?? insight.cta;

    const handleAction = () => {
        if (cta?.route) {
            router.push(cta.route as any);
        }
    };

    return (
        <LinearGradient
            colors={insight.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.bestNextCard}
        >
            {/* Time Context */}
            {insight.timeContext && (
                <View style={styles.timeContextRow}>
                    <Ionicons name={insight.icon as any} size={14} color="rgba(255,255,255,0.8)" />
                    <Text style={styles.timeContextLabel}>
                        {insight.timeContext.toUpperCase()}
                    </Text>
                </View>
            )}

            {/* Main Content */}
            <Text style={styles.mainRecommendation}>{insight.recommendation}</Text>
            <Text style={styles.supportingDetail}>{insight.because}</Text>

            {/* Outcome */}
            {insight.outcomeText && (
                <Text style={styles.outcomeText}>{insight.outcomeText}</Text>
            )}

            {/* Action Row */}
            <View style={styles.actionRow}>
                {cta && (
                    <Pressable style={styles.ctaButton} onPress={handleAction}>
                        <Text style={styles.ctaButtonText}>{cta.label}</Text>
                        <Ionicons name="arrow-forward" size={14} color="#FFFFFF" />
                    </Pressable>
                )}
                <Pressable style={styles.dismissButton} onPress={onDismiss}>
                    <Text style={styles.dismissText}>Not a fit today</Text>
                </Pressable>
            </View>
        </LinearGradient>
    );
}

// ============================================
// SECONDARY INSIGHT CARD (COMPACT)
// ============================================

function SecondaryInsightCard({ insight, onPress }: {
    insight: PersonalInsight;
    onPress: () => void;
}) {
    return (
        <AnimatedPressable style={styles.secondaryCard} onPress={onPress}>
            <View style={[styles.secondaryIconContainer, { backgroundColor: insight.gradient[0] + '40' }]}>
                <Ionicons name={insight.icon as any} size={18} color={insight.gradient[0]} />
            </View>
            <View style={styles.secondaryContent}>
                <Text style={styles.secondaryTitle}>{insight.title}</Text>
                <Text style={styles.secondaryRecommendation} numberOfLines={1}>
                    {insight.recommendation}
                </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="rgba(60, 60, 67, 0.4)" />
        </AnimatedPressable>
    );
}

// ============================================
// NEW-USER PROGRESS INDICATOR
// ============================================

function InsightProgressCard({ readiness }: { readiness: InsightReadiness }) {
    const remaining = readiness.daysNeeded - readiness.daysWithData;
    return (
        <View style={styles.progressCard}>
            <View style={styles.progressIconContainer}>
                <Ionicons name="sparkles" size={22} color="#3949AB" />
            </View>
            <Text style={styles.progressTitle}>
                {remaining > 0
                    ? `${remaining} more day${remaining === 1 ? '' : 's'} until your first insight`
                    : 'Your first insight is ready!'}
            </Text>
            <View style={styles.progressBar}>
                {readiness.progressSegments.map((filled, i) => (
                    <View
                        key={i}
                        style={[
                            styles.progressSegment,
                            filled && styles.progressSegmentFilled,
                        ]}
                    />
                ))}
            </View>
            <Text style={styles.progressSubtext}>
                Keep logging to unlock personalized patterns
            </Text>
        </View>
    );
}

// ============================================
// CHAT CTA CARD (cold-start bridge)
// ============================================

function ChatCTACard() {
    return (
        <Pressable
            style={styles.chatCtaCard}
            onPress={() => router.push('/(tabs)/chat' as any)}
        >
            <View style={styles.chatCtaIconContainer}>
                <Ionicons name="chatbubbles-outline" size={20} color={Colors.primary} />
            </View>
            <View style={styles.chatCtaContent}>
                <Text style={styles.chatCtaTitle}>Not sure what to log next?</Text>
                <Text style={styles.chatCtaSubtext}>Your coach knows your patterns</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="rgba(60, 60, 67, 0.4)" />
        </Pressable>
    );
}

// ============================================
// EMPTY STATE
// ============================================

const EmptyState = () => (
    <View style={styles.emptyContainer}>
        <Image
            source={Images.mascots.thinking}
            style={{ width: 60, height: 60, resizeMode: 'contain', marginBottom: 12 }}
        />
        <Text style={styles.emptyTitle}>All caught up!</Text>
        <Text style={styles.emptyText}>
            Keep logging to unlock more personalized insights
        </Text>
    </View>
);

// ============================================
// MAIN COMPONENT
// ============================================

export function PersonalInsightsCarousel({
    insights,
    primaryInsight,
    secondaryInsights,
    onDismiss,
    isLoading,
    onMealPress,
    onExercisePress,
    insightReadiness,
}: PersonalInsightsCarouselProps) {
    const [showMoreOptions, setShowMoreOptions] = useState(false);
    const [showRewardAnimation, setShowRewardAnimation] = useState(false);
    const rewardCheckedRef = useRef(false);

    // First-insight reward animation (one-time)
    useEffect(() => {
        if (rewardCheckedRef.current || !primaryInsight || isLoading) return;
        rewardCheckedRef.current = true;

        (async () => {
            const seen = await AsyncStorage.getItem('first_insight_seen');
            if (!seen) {
                await AsyncStorage.setItem('first_insight_seen', '1');
                setShowRewardAnimation(true);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setTimeout(() => setShowRewardAnimation(false), 2000);
            }
        })();
    }, [primaryInsight, isLoading]);

    if (isLoading) {
        return (
            <View style={[styles.container, { minHeight: 180, justifyContent: 'center' }]}>
                <ActivityIndicator size="small" color="#1C1C1E" />
            </View>
        );
    }

    // New-user progress indicator + chat CTA bridge
    if (insightReadiness && !insightReadiness.ready && !primaryInsight) {
        return (
            <View style={styles.container}>
                <Text style={styles.sectionTitle}>BEST NEXT STEP</Text>
                <InsightProgressCard readiness={insightReadiness} />
                <ChatCTACard />
            </View>
        );
    }

    // Show empty state if all insights are dismissed
    if (!primaryInsight) {
        return (
            <View style={styles.container}>
                <Text style={styles.sectionTitle}>Best next step</Text>
                <EmptyState />
            </View>
        );
    }

    const handleSecondaryPress = (insight: PersonalInsight) => {
        const cta = insight.action?.cta ?? insight.cta;
        if (cta?.route) {
            router.push(cta.route as any);
        }
    };

    return (
        <View style={styles.container}>
            {/* Header Row with Title and More Options */}
            <View style={styles.headerRow}>
                <Text style={styles.sectionTitle}>BEST NEXT STEP</Text>

                {/* More Options Toggle - Liquid Glass Pill */}
                {secondaryInsights.length > 0 && (
                    <Pressable
                        style={({ pressed }) => [
                            styles.moreOptionsButton,
                            pressed && styles.moreOptionsButtonPressed
                        ]}
                        onPressIn={() => {
                            if (Platform.OS === 'ios') {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            }
                        }}
                        onPress={() => setShowMoreOptions(!showMoreOptions)}
                    >
                        <LinearGradient
                            colors={['rgba(255, 255, 255, 0.9)', 'rgba(240, 240, 245, 0.9)']}
                            style={styles.moreOptionsGradient}
                        />
                        <View style={styles.moreOptionsContent}>
                            <Text style={styles.moreOptionsText}>
                                {showMoreOptions ? 'Hide' : `+${secondaryInsights.length} more`}
                            </Text>
                            <Ionicons
                                name={showMoreOptions ? 'chevron-up' : 'chevron-down'}
                                size={14}
                                color="#1C1C1E"
                            />
                        </View>
                    </Pressable>
                )}
            </View>

            {/* Primary Action Card */}
            {showRewardAnimation ? (
                <Animated.View entering={FadeInDown.duration(500).springify().damping(12)}>
                    <BestNextStepCard
                        insight={primaryInsight}
                        onDismiss={() => onDismiss(primaryInsight.id)}
                    />
                </Animated.View>
            ) : (
                <BestNextStepCard
                    insight={primaryInsight}
                    onDismiss={() => onDismiss(primaryInsight.id)}
                />
            )}

            {/* Secondary Insights (Collapsed by default) - Animated */}
            {showMoreOptions && (
                <Animated.View
                    style={styles.secondaryList}
                    entering={FadeInDown.duration(300).springify().damping(18)}
                    exiting={FadeOutUp.duration(200)}
                >
                    {secondaryInsights.map((insight, index) => (
                        <Animated.View
                            key={insight.id}
                            entering={FadeInDown.delay(index * 60).duration(250).springify().damping(18)}
                        >
                            <SecondaryInsightCard
                                insight={insight}
                                onPress={() => handleSecondaryPress(insight)}
                            />
                        </Animated.View>
                    ))}
                </Animated.View>
            )}

            {/* Disclaimer */}
            <Text style={styles.disclaimerText}>
                Wellness insights only. Not medical advice.
            </Text>
        </View>
    );
}

export default PersonalInsightsCarousel;

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
    container: {
        marginBottom: 24,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    sectionTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 18,
        color: '#1C1C1E', // Colors.textPrimary
        letterSpacing: 0.5,
    },
    // Best Next Step Card
    bestNextCard: {
        borderRadius: 20,
        padding: 20,
        marginBottom: 12,
    },
    timeContextRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 12,
    },
    timeContextLabel: {
        fontFamily: fonts.bold,
        fontSize: 11,
        letterSpacing: 1,
        color: '#FFFFFF', // keep white since it's on a gradient
    },
    mainRecommendation: {
        fontFamily: fonts.semiBold,
        fontSize: 18,
        color: '#FFFFFF',
        marginBottom: 6,
        lineHeight: 24,
    },
    supportingDetail: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: 'rgba(255,255,255,0.9)',
        lineHeight: 20,
        marginBottom: 12,
    },
    outcomeText: {
        fontFamily: fonts.regular,
        fontSize: 13,
        fontStyle: 'italic',
        color: 'rgba(255,255,255,0.7)',
        marginBottom: 16,
    },
    actionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    ctaButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        gap: 6,
    },
    ctaButtonText: {
        fontFamily: fonts.semiBold,
        fontSize: 14,
        color: '#FFFFFF',
    },
    dismissButton: {
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    dismissText: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: 'rgba(255,255,255,0.6)',
    },
    // More Options - Liquid Glass Pill (inline with title)
    moreOptionsButton: {
        borderRadius: 100,
        overflow: 'hidden',
        borderWidth: 0.5,
        borderColor: 'rgba(255, 255, 255, 0.5)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 3,
    },
    moreOptionsButtonPressed: {
        opacity: 0.85,
        transform: [{ scale: 0.97 }],
    },
    moreOptionsGradient: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 100,
    },
    moreOptionsContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        paddingHorizontal: 14,
        gap: 4,
    },
    moreOptionsText: {
        fontFamily: fonts.medium,
        fontSize: 13,
        color: '#FFFFFF',
        letterSpacing: 0.2,
    },
    // Secondary Cards
    secondaryList: {
        gap: 8,
        marginBottom: 8,
    },
    secondaryCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.70)',
        borderRadius: 16,
        padding: 12,
        gap: 12,
        borderWidth: 0.5,
        borderColor: 'rgba(255, 255, 255, 0.5)',
    },
    secondaryIconContainer: {
        width: 36,
        height: 36,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    secondaryContent: {
        flex: 1,
    },
    secondaryTitle: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: '#1C1C1E',
    },
    secondaryRecommendation: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: '#8E8E93',
        marginTop: 2,
    },
    // Empty State
    emptyContainer: {
        backgroundColor: 'rgba(255, 255, 255, 0.70)', // Light glass
        borderRadius: 20,
        padding: 24,
        alignItems: 'center',
        borderWidth: 0.5,
        borderColor: 'rgba(255, 255, 255, 0.5)',
    },
    emptyTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: '#1C1C1E',
    },
    emptyText: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: '#8E8E93',
        marginTop: 4,
        textAlign: 'center',
    },
    // Progress Card (new users)
    progressCard: {
        backgroundColor: 'rgba(255, 255, 255, 0.70)',
        borderRadius: 20,
        padding: 20,
        alignItems: 'center',
        borderWidth: 0.5,
        borderColor: 'rgba(255, 255, 255, 0.5)',
    },
    progressIconContainer: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(57, 73, 171, 0.1)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
    },
    progressTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: Colors.textPrimary,
        textAlign: 'center',
        marginBottom: 16,
    },
    progressBar: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 12,
        width: '60%',
    },
    progressSegment: {
        flex: 1,
        height: 6,
        borderRadius: 3,
        backgroundColor: 'rgba(0, 0, 0, 0.08)',
    },
    progressSegmentFilled: {
        backgroundColor: '#3949AB',
    },
    progressSubtext: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: Colors.textSecondary,
        textAlign: 'center',
    },
    // Chat CTA Card (cold-start bridge)
    chatCtaCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.70)',
        borderRadius: 16,
        padding: 14,
        gap: 12,
        borderWidth: 0.5,
        borderColor: 'rgba(255, 255, 255, 0.5)',
        marginTop: 10,
    },
    chatCtaIconContainer: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: 'rgba(45, 212, 191, 0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    chatCtaContent: {
        flex: 1,
    },
    chatCtaTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 15,
        color: '#1C1C1E',
    },
    chatCtaSubtext: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: '#8E8E93',
        marginTop: 1,
    },
    // Disclaimer
    disclaimerText: {
        fontFamily: fonts.regular,
        fontSize: 11,
        color: '#6c757d',
        fontStyle: 'italic',
        lineHeight: 14,
        textAlign: 'center',
        marginTop: 12,
    },
});
