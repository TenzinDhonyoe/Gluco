/**
 * Personal Insights Carousel
 * 
 * Horizontal scrollable carousel displaying personalized wellness insights.
 * Includes disclaimer and matches app design language.
 */

import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { Images } from '@/constants/Images';
import { fonts } from '@/hooks/useFonts';
import { PersonalInsight } from '@/lib/insights';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React from 'react';
import {
    ActivityIndicator,
    Animated,
    Image,
    PanResponder,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

// ============================================
// TYPES
// ============================================

interface PersonalInsightsCarouselProps {
    insights: PersonalInsight[];
    isLoading?: boolean;
    onMealPress?: () => void;
    onExercisePress?: () => void;
}

// ============================================
// SWIPEABLE TIP CARDS
// ============================================

function SwipeableTipCards({ onMealPress, onExercisePress }: {
    onMealPress?: () => void;
    onExercisePress?: () => void;
}) {
    const [activeIndex, setActiveIndex] = React.useState(0);
    const slideAnim = React.useRef(new Animated.Value(0)).current;

    const cards = [
        {
            image: Images.mascots.cook,
            text: 'Planning your next lunch?',
            linkText: 'Tap to check spike risk',
            onPress: onMealPress,
        },
        {
            image: Images.mascots.exercise,
            text: 'Planning your next exercise?',
            linkText: 'Tap to check spike risk',
            onPress: onExercisePress,
        },
    ];

    const handleSwipe = (direction: 'left' | 'right') => {
        const nextIndex = direction === 'left'
            ? (activeIndex + 1) % cards.length
            : (activeIndex - 1 + cards.length) % cards.length;

        Animated.sequence([
            Animated.timing(slideAnim, {
                toValue: direction === 'left' ? -30 : 30,
                duration: 100,
                useNativeDriver: true,
            }),
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
            }),
        ]).start();

        setActiveIndex(nextIndex);
    };

    const panResponder = React.useMemo(() =>
        PanResponder.create({
            onStartShouldSetPanResponder: () => false,
            onMoveShouldSetPanResponder: (_, gestureState) => {
                return Math.abs(gestureState.dx) > 15 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
            },
            onPanResponderRelease: (_, gestureState) => {
                if (gestureState.dx < -50) {
                    handleSwipe('left');
                } else if (gestureState.dx > 50) {
                    handleSwipe('right');
                }
            },
        }),
        [activeIndex]);

    const currentCard = cards[activeIndex];

    return (
        <View style={styles.tipCardsWrapper}>
            <Animated.View
                {...panResponder.panHandlers}
                style={[
                    styles.tipCardContainer,
                    { transform: [{ translateX: slideAnim }] }
                ]}
            >
                <TouchableOpacity
                    style={styles.tipCardTouchable}
                    onPress={currentCard.onPress}
                    activeOpacity={0.8}
                >
                    <View style={styles.tipCardStackBack} />
                    <View style={styles.tipCard}>
                        <View style={styles.mascotContainer}>
                            <Image source={currentCard.image} style={{ width: 44, height: 44, resizeMode: 'contain' }} />
                        </View>
                        <View style={{ flex: 1, gap: 2 }}>
                            <Text style={styles.tipText}>{currentCard.text}</Text>
                            {/* <Text style={styles.tipLink}>{currentCard.linkText}</Text> */}
                        </View>
                    </View>
                </TouchableOpacity>
            </Animated.View>

            <View style={styles.dotsContainer}>
                {cards.map((_, index) => (
                    <View
                        key={index}
                        style={[
                            styles.dot,
                            index === activeIndex && styles.dotActive
                        ]}
                    />
                ))}
            </View>
        </View>
    );
}

// ============================================
// CONFIDENCE BADGE
// ============================================

const ConfidenceBadge = ({ level }: { level: string }) => {
    const colors: Record<string, string> = {
        high: 'rgba(76, 175, 80, 0.9)',
        moderate: 'rgba(255, 193, 7, 0.9)',
        low: 'rgba(158, 158, 158, 0.7)',
    };
    return (
        <View style={[styles.confidenceBadge, { backgroundColor: colors[level] || colors.low }]}>
            <Text style={styles.confidenceText}>{level}</Text>
        </View>
    );
};

// ============================================
// INSIGHT CARD COMPONENT
// ============================================

const InsightCard = React.memo(({ insight }: { insight: PersonalInsight }) => {
    const cta = insight.action?.cta ?? insight.cta;

    const handlePress = () => {
        if (cta?.route) {
            router.push(cta.route as any);
        }
    };

    return (
        <AnimatedPressable
            onPress={handlePress}
            disabled={!cta}
        >
            <LinearGradient
                colors={insight.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.card}
            >
                {/* Header: Icon + Title + Confidence */}
                <View style={styles.cardHeader}>
                    <View style={styles.iconContainer}>
                        <Ionicons
                            name={insight.icon as any}
                            size={20}
                            color="rgba(255,255,255,0.9)"
                        />
                    </View>
                    <Text style={styles.cardTitle}>{insight.title}</Text>
                    <ConfidenceBadge level={insight.confidence} />
                </View>

                {/* Recommendation (main line) */}
                <Text style={styles.cardRecommendation}>
                    {insight.recommendation}
                </Text>

                {/* Consolidated Action Box */}
                {insight.action && (
                    <View style={styles.actionContainer}>
                        <Ionicons name={insight.icon as any} size={16} color="rgba(255,255,255,0.9)" style={{ marginTop: 2 }} />
                        <Text style={styles.actionText}>
                            {insight.action.description}
                        </Text>
                    </View>
                )}

                {/* CTA */}
                {cta && (
                    <View style={styles.ctaContainer}>
                        <Text style={styles.ctaText}>{cta.label}</Text>
                        <Ionicons name="arrow-forward" size={14} color="rgba(255,255,255,0.9)" />
                    </View>
                )}
            </LinearGradient>
        </AnimatedPressable>
    );
});

// ============================================
// EMPTY STATE
// ============================================

const EmptyState = () => (
    <View style={styles.emptyContainer}>
        <Image
            source={Images.mascots.thinking}
            style={{ width: 80, height: 80, resizeMode: 'contain', marginBottom: 16 }}
        />
        <Text style={styles.emptyTitle}>Insights Coming Soon</Text>
        <Text style={styles.emptyText}>
            Keep logging to unlock personalized insights
        </Text>
    </View>
);

// ============================================
// LOADING STATE
// ============================================

const LoadingState = () => (
    <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color="#878787" />
        <Text style={styles.loadingText}>Loading insights...</Text>
    </View>
);


// ============================================
// MAIN COMPONENT
// ============================================

export function PersonalInsightsCarousel({ insights, isLoading, onMealPress, onExercisePress }: PersonalInsightsCarouselProps) {
    if (isLoading) {
        return (
            <View style={[styles.container, { minHeight: 180, justifyContent: 'center' }]}>
                <ActivityIndicator size="small" color="#FFFFFF" />
            </View>
        );
    }

    if (!insights || insights.length === 0) {
        return null;
    }

    return (
        <View style={styles.container}>
            <Text style={styles.sectionTitle}>Personal Insights</Text>

            {/* Spike Risk / Planning Card */}
            {/* <SwipeableTipCards onMealPress={onMealPress} onExercisePress={onExercisePress} /> */}

            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
                style={{ marginHorizontal: -16 }}
            >
                {insights.map((insight) => (
                    <InsightCard key={insight.id} insight={insight} />
                ))}
            </ScrollView>

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
    sectionTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 18,
        color: '#E7E8E9',
        marginBottom: 16,
    },
    scrollContent: {
        gap: 12,
        paddingHorizontal: 16, // padding restored for breakout alignment
    },
    card: {
        width: 280, // Slightly narrower
        height: 220, // Significantly shorter
        borderRadius: 20,
        padding: 16,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    iconContainer: {
        width: 32,
        height: 32,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.15)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    cardTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 15,
        color: '#FFFFFF',
        flex: 1,
    },
    confidenceBadge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
    },
    confidenceText: {
        fontFamily: fonts.medium,
        fontSize: 10,
        color: '#FFFFFF',
        textTransform: 'capitalize',
    },
    cardRecommendation: {
        fontFamily: fonts.semiBold,
        fontSize: 16, // Slightly smaller
        color: '#FFFFFF',
        lineHeight: 21,
        marginTop: 8,
        letterSpacing: -0.3,
    },
    actionContainer: {
        flexDirection: 'row',
        alignItems: 'center', // Center vertically since text is smaller
        gap: 8,
        backgroundColor: 'rgba(0,0,0,0.15)',
        borderRadius: 12,
        paddingHorizontal: 10,
        paddingVertical: 8, // Tighter vertical padding
        marginTop: 12,
        marginBottom: 8,
    },
    actionText: {
        fontFamily: fonts.medium,
        fontSize: 12, // Smaller text
        color: 'rgba(255,255,255,0.95)',
        lineHeight: 16,
        flex: 1,
    },
    ctaContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 12,
    },
    ctaText: {
        fontFamily: fonts.medium,
        fontSize: 13,
        color: 'rgba(255,255,255,0.9)',
    },
    emptyContainer: {
        backgroundColor: '#1E1E1E',
        borderRadius: 16,
        padding: 24,
        marginHorizontal: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    emptyTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: '#E7E8E9',
        marginTop: 12,
    },
    emptyText: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: '#878787',
        marginTop: 4,
        textAlign: 'center',
    },
    loadingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 24,
        gap: 8,
    },
    loadingText: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#878787',
    },
    disclaimerText: {
        fontFamily: fonts.regular,
        fontSize: 11,
        color: '#6c757d',
        fontStyle: 'italic',
        lineHeight: 14,
        textAlign: 'center',
        marginTop: 12,
    },
    // Swipeable Tip Cards Styles
    tipCardsWrapper: {
        marginBottom: 16,
        // paddingHorizontal: 16, // Removed to match parent padding in index.tsx
    },
    tipCardContainer: {
        position: 'relative',
        marginBottom: 8,
    },
    tipCardTouchable: {
    },
    tipCardStackBack: {
        position: 'absolute',
        bottom: -6,
        left: 14,
        right: 14,
        height: 20,
        backgroundColor: '#1C2124',
        borderRadius: 16,
        zIndex: -1,
    },
    tipCard: {
        backgroundColor: '#22282C', // Matches statCard color
        borderRadius: 16,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    mascotContainer: {
        width: 44,
        height: 44,
        justifyContent: 'center',
        alignItems: 'center',
    },
    tipText: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: '#E7E8E9', // Colors.textPrimary replacement
        lineHeight: 20,
    },
    tipLink: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: '#3494D9', // Colors.primary replacement
        lineHeight: 20,
    },
    dotsContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
        marginTop: 6,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#3F4243',
    },
    dotActive: {
        backgroundColor: '#FFFFFF',
    },
});
