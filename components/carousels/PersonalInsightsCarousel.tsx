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
    Image,
    ScrollView,
    StyleSheet,
    Text,
    View
} from 'react-native';

// ============================================
// TYPES
// ============================================

interface PersonalInsightsCarouselProps {
    insights: PersonalInsight[];
    isLoading?: boolean;
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
    const handlePress = () => {
        if (insight.cta?.route) {
            router.push(insight.cta.route as any);
        }
    };

    return (
        <AnimatedPressable
            onPress={handlePress}
            disabled={!insight.cta}
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

                {/* Because (smaller) */}
                <Text style={styles.cardBecause}>
                    Because: {insight.because}
                </Text>

                {/* Micro-step chip */}
                <View style={styles.microStepContainer}>
                    <Ionicons name="flash-outline" size={14} color="rgba(255,255,255,0.85)" style={{ marginTop: 2 }} />
                    <Text style={styles.microStepText}>
                        {insight.microStep}
                    </Text>
                </View>

                {/* CTA */}
                {insight.cta && (
                    <View style={styles.ctaContainer}>
                        <Text style={styles.ctaText}>{insight.cta.label}</Text>
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

export const PersonalInsightsCarousel = React.memo(({
    insights,
    isLoading = false,
}: PersonalInsightsCarouselProps) => {
    if (isLoading) {
        return (
            <View style={styles.container}>
                <Text style={styles.sectionTitle}>Personal Insights</Text>
                <LoadingState />
            </View>
        );
    }

    if (insights.length === 0) {
        return (
            <View style={styles.container}>
                <Text style={styles.sectionTitle}>Personal Insights</Text>
                <EmptyState />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Text style={styles.sectionTitle}>Personal Insights</Text>

            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginHorizontal: -16 }}
                contentContainerStyle={styles.scrollContent}
                decelerationRate="fast"
                snapToInterval={312} // card width (300) + gap (12)
                snapToAlignment="start"
                pagingEnabled={false} // Ensure paging isn't conflicting with snapToInterval
            >
                {insights.map((insight) => (
                    <InsightCard key={insight.id} insight={insight} />
                ))}
            </ScrollView>

            {/* Disclaimer */}
            <Text style={styles.disclaimer}>
                Wellness insights only. Not medical advice.
            </Text>
        </View>
    );
});

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
        paddingHorizontal: 16,
    },
    card: {
        width: 300,
        height: 240,
        borderRadius: 20,
        padding: 16,
        justifyContent: 'space-between',
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
        fontFamily: fonts.medium,
        fontSize: 14,
        color: '#FFFFFF',
        lineHeight: 20,
        marginTop: 10,
    },
    cardBecause: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: 'rgba(255,255,255,0.7)',
        marginTop: 4,
        fontStyle: 'italic',
    },
    microStepContainer: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        marginTop: 12,
        backgroundColor: 'rgba(255,255,255,0.12)',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 12,
    },
    microStepText: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: 'rgba(255,255,255,0.9)',
        flex: 1,
        lineHeight: 18,
    },
    ctaContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 10,
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
    disclaimer: {
        fontFamily: fonts.regular,
        fontSize: 11,
        color: '#6B6B6B',
        textAlign: 'center',
        marginTop: 12,
    },
});
