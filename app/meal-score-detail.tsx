import { MealGlucoseChart } from '@/components/charts/MealGlucoseChart';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { LiquidGlassIconButton } from '@/components/ui/LiquidGlassButton';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { useMealScoreDetail } from '@/hooks/useMealScores';
import { buildMealTokens, getScoreColor, getScoreEmoji, getScoreLabel, type ScoreLabel } from '@/lib/mealScore';
import { getMealById, getMealItems, startUserExperiment, type ExperimentSuggestion } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Score-label → accent tint for glass cards
const SCORE_SURFACE: Record<ScoreLabel, string> = {
    gentle:   'rgba(52, 211, 153, 0.04)',
    moderate: 'rgba(255, 179, 128, 0.04)',
    notable:  'rgba(255, 140, 66, 0.04)',
    sharp:    'rgba(248, 113, 113, 0.04)',
};

export default function MealScoreDetailScreen() {
    const insets = useSafeAreaInsets();
    const { user } = useAuth();
    const { mealId } = useLocalSearchParams<{ mealId: string }>();

    const [meal, setMeal] = useState<{ name: string; meal_type: string | null; logged_at: string } | null>(null);
    const [mealTokens, setMealTokens] = useState<string[]>([]);

    const userId = user?.id;

    useEffect(() => {
        if (!mealId || !userId) return;
        let cancelled = false;
        async function load() {
            const [mealData, items] = await Promise.all([
                getMealById(mealId!, userId!),
                getMealItems(mealId!),
            ]);
            if (cancelled) return;
            if (mealData) {
                setMeal({ name: mealData.name, meal_type: mealData.meal_type, logged_at: mealData.logged_at });
                setMealTokens(buildMealTokens(mealData.name, items.map(i => i.display_name)));
            }
        }
        load();
        return () => { cancelled = true; };
    }, [mealId, userId]);

    const { score, glucoseReadings, similarScores, isLoading } = useMealScoreDetail(
        mealId,
        userId,
        meal?.logged_at,
        mealTokens.length > 0 ? mealTokens : undefined,
    );

    // ─ Loading
    if (isLoading || !meal) {
        return (
            <View style={[styles.centered, { paddingTop: insets.top + 60 }]}>
                <ActivityIndicator size="large" color={Colors.primary} />
            </View>
        );
    }

    // ─ No score yet
    if (!score) {
        return (
            <View style={[styles.screen, { paddingTop: insets.top }]}>
                <HeaderBar />
                <View style={[styles.centered, { flex: 1 }]}>
                    <Ionicons name="hourglass-outline" size={36} color={Colors.textTertiary} />
                    <Text style={styles.emptyTitle}>Score pending</Text>
                    <Text style={styles.emptySub}>
                        We need a few more glucose readings after this meal to calculate your score.
                    </Text>
                </View>
            </View>
        );
    }

    const label = score.score_label as ScoreLabel;
    const scoreColor = getScoreColor(label);
    const emoji = getScoreEmoji(label);
    const labelWord = label.charAt(0).toUpperCase() + label.slice(1);

    const mealDate = new Date(meal.logged_at);
    const dateStr = mealDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
    const timeStr = mealDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const typeStr = meal.meal_type ? meal.meal_type.charAt(0).toUpperCase() + meal.meal_type.slice(1) : '';

    return (
        <View style={[styles.screen, { paddingTop: insets.top }]}>
            <HeaderBar />

            <ScrollView
                contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
                showsVerticalScrollIndicator={false}
            >
                {/* ── Meal name + meta ── */}
                <Text style={styles.mealName}>{meal.name}</Text>
                <Text style={styles.mealMeta}>
                    {typeStr}{typeStr ? ' · ' : ''}{dateStr}, {timeStr}
                </Text>

                {/* ── Score hero ── */}
                <View style={styles.heroShadow}>
                    <View style={styles.heroCard}>
                        <BlurView intensity={50} tint="light" style={[StyleSheet.absoluteFill, { backgroundColor: SCORE_SURFACE[label] }]}>
                            <LinearGradient
                                colors={['rgba(255,255,255,0.8)', 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0.5)']}
                                locations={[0, 0.4, 1]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={StyleSheet.absoluteFill}
                            />
                            <View style={styles.heroHighlight} />
                        </BlurView>

                        <Text style={[styles.heroScore, { color: scoreColor }]}>{score.score}</Text>
                        <Text style={styles.heroLabel}>{labelWord} Response {emoji}</Text>

                        {/* Glucose chart */}
                        {glucoseReadings.length >= 2 && (
                            <View style={styles.heroChartWrap}>
                                <MealGlucoseChart
                                    readings={glucoseReadings.map(r => ({
                                        value: r.value,
                                        timestamp: r.timestamp.toISOString(),
                                    }))}
                                    scoreLabel={label}
                                    height={100}
                                    showRangeBand
                                />
                            </View>
                        )}

                        {score.glucose_reading_count > 0 && (
                            <Text style={styles.readingCount}>
                                Based on {score.glucose_reading_count} glucose readings over 3 hours
                            </Text>
                        )}
                    </View>
                </View>

                {/* ── Score breakdown 2×2 ── */}
                <Text style={styles.sectionLabel}>HOW YOUR BODY RESPONDED</Text>
                <View style={styles.grid}>
                    <ComponentTile
                        title="Peak Impact"
                        icon="trending-up-outline"
                        score={score.peak_spike_score}
                        detail={score.peak_delta_mg_dl != null ? `+${Math.round(score.peak_delta_mg_dl)} mg/dL rise` : '—'}
                        scoreLabel={label}
                    />
                    <ComponentTile
                        title="Recovery"
                        icon="refresh-outline"
                        score={score.return_to_baseline_score}
                        detail={score.return_to_baseline_min != null ? `Back in ${score.return_to_baseline_min} min` : 'Still recovering'}
                        scoreLabel={label}
                    />
                    <ComponentTile
                        title="Steadiness"
                        icon="pulse-outline"
                        score={score.variability_score}
                        detail={score.variability_sd != null ? `Variability: ${Math.round(score.variability_sd)}` : '—'}
                        scoreLabel={label}
                    />
                    <ComponentTile
                        title="In Range"
                        icon="shield-checkmark-outline"
                        score={score.time_in_range_score}
                        detail={score.time_in_range_pct != null ? `${Math.round(score.time_in_range_pct)}% of the time` : '—'}
                        scoreLabel={label}
                    />
                </View>

                {/* ── Insight ── */}
                {score.insight_text && (
                    <>
                        <Text style={styles.sectionLabel}>WHAT THIS MEANS</Text>
                        <View style={styles.insightShadow}>
                            <View style={styles.insightCard}>
                                <BlurView intensity={40} tint="light" style={[StyleSheet.absoluteFill, { backgroundColor: SCORE_SURFACE[label] }]}>
                                    <LinearGradient
                                        colors={['rgba(255,255,255,0.7)', 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0.35)']}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 1 }}
                                        style={StyleSheet.absoluteFill}
                                    />
                                    <View style={styles.insightHighlight} />
                                </BlurView>
                                <Text style={styles.insightText}>{score.insight_text}</Text>
                            </View>
                        </View>
                    </>
                )}

                {/* ── Experiment CTA ── */}
                {score.insight_type === 'experiment' && score.experiment_suggestion && !score.experiment_suggestion.tried && (
                    <ExperimentCTA
                        suggestion={score.experiment_suggestion}
                        scoreLabel={label}
                        scoreColor={scoreColor}
                        userId={userId}
                    />
                )}

                {/* ── Experiment Result ── */}
                {score.experiment_suggestion?.tried && score.experiment_suggestion.result_score_delta != null && (
                    <ExperimentResultCard
                        suggestion={score.experiment_suggestion}
                        scoreLabel={label}
                    />
                )}

                {/* ── Similar meals ── */}
                {similarScores.length > 0 && (
                    <>
                        <Text style={styles.sectionLabel}>SIMILAR MEALS YOU'VE HAD</Text>
                        <View style={styles.similarShadow}>
                            <View style={styles.similarCard}>
                                <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill}>
                                    <LinearGradient
                                        colors={['rgba(255,255,255,0.7)', 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0.35)']}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 1 }}
                                        style={StyleSheet.absoluteFill}
                                    />
                                </BlurView>
                                {similarScores.map((s, idx) => {
                                    const sLabel = getScoreLabel(s.score);
                                    const sColor = getScoreColor(sLabel);
                                    return (
                                        <AnimatedPressable
                                            key={s.id}
                                            style={[
                                                styles.similarRow,
                                                idx < similarScores.length - 1 && styles.similarRowBorder,
                                            ]}
                                            onPress={() => router.push({
                                                pathname: '/meal-score-detail',
                                                params: { mealId: s.meal_id },
                                            })}
                                        >
                                            <Text style={styles.similarName} numberOfLines={1}>
                                                {s.meal_name}
                                            </Text>
                                            <Text style={[styles.similarScore, { color: sColor }]}>
                                                {s.score}
                                            </Text>
                                            <Text style={styles.similarEmoji}>{getScoreEmoji(sLabel)}</Text>
                                        </AnimatedPressable>
                                    );
                                })}
                            </View>
                        </View>
                    </>
                )}
            </ScrollView>
        </View>
    );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function HeaderBar() {
    return (
        <View style={styles.headerBar}>
            <LiquidGlassIconButton size={44} onPress={() => router.back()}>
                <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
            </LiquidGlassIconButton>
            <Text style={styles.headerTitle}>Meal Score</Text>
            <View style={{ width: 44 }} />
        </View>
    );
}

function ComponentTile({
    title,
    icon,
    score,
    detail,
    scoreLabel,
}: {
    title: string;
    icon: keyof typeof Ionicons.glyphMap;
    score: number;
    detail: string;
    scoreLabel: ScoreLabel;
}) {
    const tileLabel = getScoreLabel(score);
    const tileColor = getScoreColor(tileLabel);

    return (
        <View style={styles.tileShadow}>
            <View style={styles.tileCard}>
                <BlurView intensity={40} tint="light" style={[StyleSheet.absoluteFill, { backgroundColor: SCORE_SURFACE[scoreLabel] }]}>
                    <LinearGradient
                        colors={['rgba(255,255,255,0.7)', 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0.35)']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFill}
                    />
                    <View style={styles.tileHighlight} />
                </BlurView>
                <View style={styles.tileLabelRow}>
                    <Ionicons name={icon} size={13} color={tileColor} />
                    <Text style={[styles.tileLabelText, { color: tileColor }]}>{title}</Text>
                </View>
                <Text style={[styles.tileScore, { color: tileColor }]}>{score}</Text>
                <Text style={styles.tileDetail}>{detail}</Text>
            </View>
        </View>
    );
}

function ExperimentCTA({
    suggestion,
    scoreLabel,
    scoreColor,
    userId,
}: {
    suggestion: ExperimentSuggestion;
    scoreLabel: ScoreLabel;
    scoreColor: string;
    userId: string | undefined;
}) {
    const [starting, setStarting] = useState(false);

    const handleStartExperiment = async () => {
        if (!suggestion.template_slug || !userId) {
            // No matching template — just acknowledge the suggestion
            Alert.alert(
                'Experiment Noted',
                'Try this suggestion with your next similar meal and we\'ll track how it goes.',
            );
            return;
        }

        setStarting(true);
        try {
            const experiment = await startUserExperiment(userId, suggestion.template_slug, undefined, {
                reasons: [`Suggested from meal score: ${suggestion.weak_component}`],
                predicted_impact: 'moderate',
            });
            if (experiment) {
                Alert.alert(
                    'Experiment Started',
                    'We\'ll track your progress and show you the results.',
                    [{ text: 'OK' }],
                );
            } else {
                Alert.alert('Experiment Noted', 'Try this suggestion next time and we\'ll compare the results.');
            }
        } catch {
            Alert.alert('Experiment Noted', 'Try this suggestion next time and we\'ll compare the results.');
        } finally {
            setStarting(false);
        }
    };

    return (
        <>
            <Text style={styles.sectionLabel}>TRY AN EXPERIMENT</Text>
            <View style={styles.experimentShadow}>
                <View style={styles.experimentCard}>
                    <BlurView intensity={40} tint="light" style={[StyleSheet.absoluteFill, { backgroundColor: SCORE_SURFACE[scoreLabel] }]}>
                        <LinearGradient
                            colors={['rgba(255,255,255,0.7)', 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0.35)']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={StyleSheet.absoluteFill}
                        />
                        <View style={styles.experimentHighlight} />
                    </BlurView>
                    <View style={styles.experimentContent}>
                        <View style={styles.experimentIconWrap}>
                            <Ionicons name="flask-outline" size={20} color={scoreColor} />
                        </View>
                        <View style={styles.experimentTextWrap}>
                            <Text style={styles.experimentTitle}>
                                {suggestion.suggestion.split('.')[0]}.
                            </Text>
                            <Text style={styles.experimentSub}>
                                We'll compare the results next time you have a similar meal.
                            </Text>
                        </View>
                    </View>
                    <TouchableOpacity
                        style={[styles.experimentButton, { backgroundColor: scoreColor }]}
                        onPress={handleStartExperiment}
                        activeOpacity={0.8}
                        disabled={starting}
                    >
                        <Text style={styles.experimentButtonText}>
                            {starting ? 'Starting...' : 'Try This'}
                        </Text>
                        <Ionicons name="arrow-forward" size={14} color="#FFFFFF" />
                    </TouchableOpacity>
                </View>
            </View>
        </>
    );
}

function ExperimentResultCard({
    suggestion,
    scoreLabel,
}: {
    suggestion: ExperimentSuggestion;
    scoreLabel: ScoreLabel;
}) {
    const delta = suggestion.result_score_delta ?? 0;
    const improved = delta > 0;

    return (
        <>
            <Text style={styles.sectionLabel}>EXPERIMENT RESULT</Text>
            <View style={styles.experimentShadow}>
                <View style={styles.experimentCard}>
                    <BlurView intensity={40} tint="light" style={[StyleSheet.absoluteFill, { backgroundColor: SCORE_SURFACE[scoreLabel] }]}>
                        <LinearGradient
                            colors={['rgba(255,255,255,0.7)', 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0.35)']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={StyleSheet.absoluteFill}
                        />
                    </BlurView>
                    <View style={styles.experimentContent}>
                        <View style={[styles.experimentIconWrap, {
                            backgroundColor: improved ? 'rgba(52, 211, 153, 0.12)' : 'rgba(255, 140, 66, 0.12)',
                        }]}>
                            <Ionicons
                                name={improved ? 'trending-up' : 'trending-down'}
                                size={20}
                                color={improved ? Colors.success : '#FF8C42'}
                            />
                        </View>
                        <View style={styles.experimentTextWrap}>
                            <Text style={styles.experimentTitle}>
                                {improved
                                    ? `+${Math.abs(delta)} points improvement`
                                    : `${Math.abs(delta)} points lower`
                                }
                            </Text>
                            <Text style={styles.experimentSub}>
                                {improved
                                    ? 'The change you tried seems to work well for your body.'
                                    : 'Worth trying a different approach next time.'
                                }
                            </Text>
                        </View>
                    </View>
                </View>
            </View>
        </>
    );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    centered: {
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
        backgroundColor: 'transparent',
    },
    emptyTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 18,
        color: Colors.textPrimary,
        marginTop: 16,
        marginBottom: 6,
    },
    emptySub: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: Colors.textSecondary,
        textAlign: 'center',
        lineHeight: 20,
    },

    // ─ Header
    headerBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    headerTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 17,
        color: Colors.textPrimary,
    },

    scroll: {
        paddingHorizontal: 20,
    },

    // ─ Meal info
    mealName: {
        fontFamily: fonts.bold,
        fontSize: 26,
        color: Colors.textPrimary,
        marginBottom: 4,
    },
    mealMeta: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: Colors.textSecondary,
        marginBottom: 20,
    },

    // ─ Hero score card
    heroShadow: {
        borderRadius: 28,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.12,
        shadowRadius: 32,
        elevation: 8,
        backgroundColor: 'transparent',
        marginBottom: 28,
    },
    heroCard: {
        borderRadius: 28,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.7)',
        padding: 20,
        overflow: 'hidden',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
    },
    heroHighlight: {
        ...StyleSheet.absoluteFillObject,
        borderTopWidth: 1.5,
        borderLeftWidth: 1.5,
        borderColor: 'rgba(255, 255, 255, 0.9)',
        borderRadius: 28,
    },
    heroScore: {
        fontFamily: fonts.bold,
        fontSize: 64,
        lineHeight: 68,
    },
    heroLabel: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: Colors.textSecondary,
        marginTop: 4,
        marginBottom: 16,
    },
    heroChartWrap: {
        width: '100%',
        borderRadius: 14,
        overflow: 'hidden',
        marginBottom: 10,
    },
    readingCount: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: Colors.textTertiary,
        marginTop: 4,
    },

    // ─ Section labels
    sectionLabel: {
        fontFamily: fonts.bold,
        fontSize: 11,
        color: Colors.textTertiary,
        letterSpacing: 1,
        marginBottom: 12,
    },

    // ─ 2×2 grid
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        marginBottom: 28,
    },
    tileShadow: {
        borderRadius: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.08,
        shadowRadius: 18,
        elevation: 3,
        backgroundColor: 'transparent',
        width: '47%',
        flexGrow: 1,
    },
    tileCard: {
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.7)',
        padding: 14,
        paddingBottom: 12,
        overflow: 'hidden',
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
    },
    tileHighlight: {
        ...StyleSheet.absoluteFillObject,
        borderTopWidth: 1.5,
        borderLeftWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.9)',
        borderRadius: 20,
    },
    tileLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        marginBottom: 6,
    },
    tileLabelText: {
        fontFamily: fonts.medium,
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    tileScore: {
        fontFamily: fonts.bold,
        fontSize: 28,
        lineHeight: 32,
    },
    tileDetail: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: Colors.textSecondary,
        marginTop: 4,
        lineHeight: 16,
    },

    // ─ Insight card
    insightShadow: {
        borderRadius: 22,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 20,
        elevation: 4,
        backgroundColor: 'transparent',
        marginBottom: 28,
    },
    insightCard: {
        borderRadius: 22,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.7)',
        padding: 18,
        overflow: 'hidden',
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
    },
    insightHighlight: {
        ...StyleSheet.absoluteFillObject,
        borderTopWidth: 1.5,
        borderLeftWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.9)',
        borderRadius: 22,
    },
    insightText: {
        fontFamily: fonts.regular,
        fontSize: 15,
        color: Colors.textPrimary,
        lineHeight: 23,
    },

    // ─ Similar meals
    similarShadow: {
        borderRadius: 22,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 20,
        elevation: 4,
        backgroundColor: 'transparent',
        marginBottom: 8,
    },
    similarCard: {
        borderRadius: 22,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.7)',
        overflow: 'hidden',
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
    },
    similarRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 18,
        paddingVertical: 14,
    },
    similarRowBorder: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(0, 0, 0, 0.06)',
    },
    similarName: {
        fontFamily: fonts.medium,
        fontSize: 15,
        color: Colors.textPrimary,
        flex: 1,
        marginRight: 12,
    },
    similarScore: {
        fontFamily: fonts.bold,
        fontSize: 20,
        marginRight: 4,
    },
    similarEmoji: {
        fontSize: 14,
    },

    // ─ Experiment CTA
    experimentShadow: {
        borderRadius: 22,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 20,
        elevation: 4,
        backgroundColor: 'transparent',
        marginBottom: 28,
    },
    experimentCard: {
        borderRadius: 22,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.7)',
        padding: 18,
        overflow: 'hidden',
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
    },
    experimentHighlight: {
        ...StyleSheet.absoluteFillObject,
        borderTopWidth: 1.5,
        borderLeftWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.9)',
        borderRadius: 22,
    },
    experimentContent: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 14,
    },
    experimentIconWrap: {
        width: 36,
        height: 36,
        borderRadius: 12,
        backgroundColor: 'rgba(52, 211, 153, 0.12)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    experimentTextWrap: {
        flex: 1,
    },
    experimentTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 15,
        color: Colors.textPrimary,
        lineHeight: 21,
        marginBottom: 4,
    },
    experimentSub: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: Colors.textSecondary,
        lineHeight: 18,
    },
    experimentButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 12,
        borderRadius: 14,
    },
    experimentButtonText: {
        fontFamily: fonts.semiBold,
        fontSize: 15,
        color: '#FFFFFF',
    },
});
