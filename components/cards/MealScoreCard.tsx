import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { MealGlucoseChart } from '@/components/charts/MealGlucoseChart';
import { Colors } from '@/constants/Colors';
import { fonts } from '@/hooks/useFonts';
import { getScoreColor, getScoreEmoji, type ScoreLabel } from '@/lib/mealScore';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface MealScoreCardProps {
    mealName: string;
    mealTime: string;
    score: number;
    scoreLabel: ScoreLabel;
    insightText: string | null;
    glucoseReadings: { value: number; timestamp: string }[];
    onPress: () => void;
}

// Score-label → soft tinted surface color for the accent glow
const SCORE_SURFACE: Record<ScoreLabel, string> = {
    gentle:   'rgba(52, 211, 153, 0.05)',
    moderate: 'rgba(255, 179, 128, 0.05)',
    notable:  'rgba(255, 140, 66, 0.05)',
    sharp:    'rgba(248, 113, 113, 0.05)',
};

const LABEL_TEXT: Record<ScoreLabel, string> = {
    gentle: 'Gentle response',
    moderate: 'Moderate response',
    notable: 'Notable response',
    sharp: 'Sharp response',
};

export function MealScoreCard({
    mealName,
    mealTime,
    score,
    scoreLabel,
    insightText,
    glucoseReadings,
    onPress,
}: MealScoreCardProps) {
    const scoreColor = getScoreColor(scoreLabel);
    const timeStr = formatTime(mealTime);
    const hasChart = glucoseReadings.length >= 2;

    return (
        <View style={styles.shadowWrap}>
            <AnimatedPressable style={styles.cardOuter} onPress={onPress}>
                {/* Frosted glass backdrop */}
                <BlurView
                    intensity={50}
                    tint="light"
                    style={[StyleSheet.absoluteFill, { backgroundColor: SCORE_SURFACE[scoreLabel] }]}
                >
                    <LinearGradient
                        colors={['rgba(255,255,255,0.75)', 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0.45)']}
                        locations={[0, 0.4, 1]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFill}
                    />
                    <LinearGradient
                        colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']}
                        start={{ x: 0.5, y: 0 }}
                        end={{ x: 0.5, y: 0.4 }}
                        style={StyleSheet.absoluteFill}
                    />
                    <View style={styles.highlight} />
                </BlurView>

                {/* ─ Top row: label pill ─ */}
                <View style={styles.labelRow}>
                    <Ionicons name="nutrition-outline" size={13} color={scoreColor} />
                    <Text style={[styles.labelText, { color: scoreColor }]}>MEAL SCORE</Text>
                </View>

                {/* ─ Score hero row ─ */}
                <View style={styles.heroRow}>
                    <View style={styles.heroLeft}>
                        <Text style={[styles.scoreNumber, { color: scoreColor }]}>{score}</Text>
                        <View style={styles.scoreMeta}>
                            <Text style={styles.responseLabelText}>{LABEL_TEXT[scoreLabel]}</Text>
                            <Text style={styles.mealNameText} numberOfLines={1}>{mealName}</Text>
                            <Text style={styles.mealTimeText}>{timeStr}</Text>
                        </View>
                    </View>

                    {/* Mini emoji glow badge */}
                    <View style={[styles.emojiBadge, { backgroundColor: `${scoreColor}12` }]}>
                        <Text style={styles.emojiText}>{getScoreEmoji(scoreLabel)}</Text>
                    </View>
                </View>

                {/* ─ Sparkline ─ */}
                {hasChart && (
                    <View style={styles.chartWrap}>
                        <MealGlucoseChart
                            readings={glucoseReadings}
                            scoreLabel={scoreLabel}
                            height={56}
                            showRangeBand={false}
                        />
                    </View>
                )}

                {/* ─ Insight text ─ */}
                {insightText && (
                    <Text style={styles.insightText} numberOfLines={3}>
                        {insightText}
                    </Text>
                )}

                {/* ─ Subtle CTA ─ */}
                <View style={styles.ctaRow}>
                    <Text style={styles.ctaText}>View breakdown</Text>
                    <Ionicons name="chevron-forward" size={14} color={Colors.textTertiary} />
                </View>
            </AnimatedPressable>
        </View>
    );
}

function formatTime(isoString: string): string {
    try {
        const date = new Date(isoString);
        return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } catch {
        return '';
    }
}

const styles = StyleSheet.create({
    shadowWrap: {
        borderRadius: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.10,
        shadowRadius: 28,
        elevation: 6,
        backgroundColor: 'transparent',
    },
    cardOuter: {
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.7)',
        padding: 16,
        overflow: 'hidden',
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
    },
    highlight: {
        ...StyleSheet.absoluteFillObject,
        borderTopWidth: 1.5,
        borderLeftWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.9)',
        borderRadius: 24,
    },

    // ─ Label row
    labelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        marginBottom: 10,
    },
    labelText: {
        fontFamily: fonts.bold,
        fontSize: 11,
        letterSpacing: 1,
    },

    // ─ Hero row
    heroRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    heroLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    scoreNumber: {
        fontFamily: fonts.bold,
        fontSize: 44,
        lineHeight: 48,
        marginRight: 14,
    },
    scoreMeta: {
        flex: 1,
    },
    responseLabelText: {
        fontFamily: fonts.semiBold,
        fontSize: 14,
        color: Colors.textPrimary,
        marginBottom: 1,
    },
    mealNameText: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: Colors.textSecondary,
        lineHeight: 18,
    },
    mealTimeText: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: Colors.textTertiary,
        lineHeight: 16,
    },
    emojiBadge: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emojiText: {
        fontSize: 18,
    },

    // ─ Chart
    chartWrap: {
        marginBottom: 10,
        borderRadius: 12,
        overflow: 'hidden',
    },

    // ─ Insight
    insightText: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: Colors.textSecondary,
        lineHeight: 20,
        marginBottom: 10,
    },

    // ─ CTA
    ctaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
    },
    ctaText: {
        fontFamily: fonts.medium,
        fontSize: 13,
        color: Colors.textTertiary,
    },
});
