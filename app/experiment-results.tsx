import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { runLocalExperimentAnalysis } from '@/lib/experiment-analysis';
import {
    ExperimentVariant,
    getExperimentVariants,
    getUserExperiment,
    UserExperiment,
    VariantMetrics,
} from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function ExperimentResultsScreen() {
    const params = useLocalSearchParams();
    const { id } = params;
    const { user } = useAuth();

    const [experiment, setExperiment] = useState<UserExperiment | null>(null);
    const [variants, setVariants] = useState<ExperimentVariant[]>([]);
    const [analysis, setAnalysis] = useState<{
        metrics: Record<string, VariantMetrics>;
        comparison: any;
        summary: string | null;
        suggestions: string[];
    } | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, [id, user]);

    const loadData = async () => {
        if (!id || typeof id !== 'string' || !user) return;
        try {
            const exp = await getUserExperiment(id);
            setExperiment(exp);

            if (exp?.experiment_templates) {
                const vars = await getExperimentVariants(exp.experiment_templates.id);
                setVariants(vars || []);

                // Run analysis immediately
                if (vars && vars.length > 0) {
                    const res = await runLocalExperimentAnalysis(user.id, exp, vars);
                    setAnalysis({
                        metrics: res.metrics,
                        comparison: res.comparison,
                        summary: res.summary,
                        suggestions: res.suggestions,
                    });
                }
            }
        } catch (error) {
            console.error('Error loading results:', error);
            Alert.alert('Error', 'Failed to load experiment results.');
        } finally {
            setLoading(false);
        }
    };

    const handleSaveInsight = () => {
        // TODO: Implement "Save to My Insights" logic (Phase 4)
        Alert.alert('Insight Saved', 'This finding has been pinned to your dashboard for the week.');
        router.push('/(tabs)/' as any);
    };

    if (loading) {
        return (
            <View style={styles.container}>
                <ActivityIndicator size="large" color="#3494D9" />
            </View>
        );
    }

    if (!experiment || !analysis) {
        return (
            <View style={styles.container}>
                <Text style={styles.errorText}>Could not load results.</Text>
            </View>
        );
    }

    const { comparison, summary } = analysis;
    const winnerKey = comparison.winner;
    const winnerVariant = variants.find(v => v.key === winnerKey);
    const confidence = comparison.confidence || 'low';

    return (
        <View style={styles.container}>
            <SafeAreaView style={styles.safeArea}>
                <ScrollView contentContainerStyle={styles.content}>

                    {/* Header */}
                    <Text style={styles.eyebrow}>EXPERIMENT COMPLETE</Text>
                    <Text style={styles.title}>{experiment.experiment_templates?.title}</Text>

                    {/* Outcome Card */}
                    <View style={styles.card}>
                        <View style={styles.cardHeader}>
                            <View style={[styles.badge,
                            confidence === 'high' ? styles.badgeHigh :
                                confidence === 'moderate' ? styles.badgeMod :
                                    styles.badgeLow
                            ]}>
                                <Text style={styles.badgeText}>{confidence.toUpperCase()} CONFIDENCE</Text>
                            </View>
                        </View>

                        <View style={styles.outcomeContent}>
                            {comparison.direction === 'insufficient' ? (
                                <>
                                    <Ionicons name="help-circle-outline" size={64} color="#878787" />
                                    <Text style={styles.outcomeTitle}>Not enough data</Text>
                                    <Text style={styles.outcomeDesc}>
                                        We couldn't determine a clear pattern. Try logging a few more meals to get a better reading.
                                    </Text>
                                </>
                            ) : comparison.direction === 'similar' ? (
                                <>
                                    <Ionicons name="git-compare-outline" size={64} color="#3494D9" />
                                    <Text style={styles.outcomeTitle}>It's a tie</Text>
                                    <Text style={styles.outcomeDesc}>
                                        Both options showed similar glucose responses. Choose based on what keeps you fuller longer.
                                    </Text>
                                </>
                            ) : winnerVariant ? (
                                <>
                                    <Ionicons name="trophy-outline" size={64} color="#FFD700" />
                                    <Text style={styles.outcomeTitle}>{winnerVariant.name} Winner</Text>
                                    <Text style={styles.outcomeDesc}>
                                        {winnerVariant.name} tended to pair with steadier readings than the alternative.
                                    </Text>
                                </>
                            ) : (
                                <Text style={styles.outcomeDesc}>{summary}</Text>
                            )}
                        </View>
                    </View>

                    {/* Action Loop */}
                    <Text style={styles.sectionHeader}>WHAT NEXT?</Text>

                    {winnerVariant && (
                        <View style={styles.actionCard}>
                            <Ionicons name="calendar-outline" size={24} color="#3494D9" />
                            <View style={styles.actionTextContent}>
                                <Text style={styles.actionTitle}>Weekly Challenge</Text>
                                <Text style={styles.actionDesc}>
                                    Try eating {winnerVariant.name} 3 times this week to build the habit.
                                </Text>
                            </View>
                        </View>
                    )}

                    <TouchableOpacity style={styles.primaryButton} onPress={handleSaveInsight}>
                        <Text style={styles.primaryButtonText}>Save this Insight</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push('/experiments-list' as any)}>
                        <Text style={styles.secondaryButtonText}>Start New Experiment</Text>
                    </TouchableOpacity>

                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    safeArea: {
        flex: 1,
    },
    content: {
        padding: 24,
        paddingBottom: 40,
    },
    eyebrow: {
        fontFamily: fonts.bold,
        fontSize: 12,
        color: Colors.primary,
        letterSpacing: 1.5,
        textAlign: 'center',
        marginBottom: 8,
    },
    title: {
        fontFamily: fonts.bold,
        fontSize: 28,
        color: Colors.textPrimary,
        textAlign: 'center',
        marginBottom: 32,
    },
    card: {
        backgroundColor: '#1E1E1E',
        borderRadius: 24,
        padding: 24,
        marginBottom: 32,
        borderWidth: 1,
        borderColor: Colors.borderCard,
        alignItems: 'center',
    },
    cardHeader: {
        width: '100%',
        alignItems: 'flex-end',
        marginBottom: 16,
    },
    badge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 100,
        backgroundColor: Colors.borderCard,
    },
    badgeHigh: { backgroundColor: 'rgba(76, 175, 80, 0.2)' },
    badgeMod: { backgroundColor: 'rgba(255, 152, 0, 0.2)' },
    badgeLow: { backgroundColor: 'rgba(158, 158, 158, 0.2)' },
    badgeText: {
        fontFamily: fonts.bold,
        fontSize: 10,
        color: '#E7E8E9',
    },
    outcomeContent: {
        alignItems: 'center',
        paddingVertical: 16,
    },
    outcomeTitle: {
        fontFamily: fonts.bold,
        fontSize: 24,
        color: Colors.textPrimary,
        marginTop: 16,
        marginBottom: 12,
    },
    outcomeDesc: {
        fontFamily: fonts.regular,
        fontSize: 16,
        color: '#B0B3B5',
        textAlign: 'center',
        lineHeight: 24,
    },
    sectionHeader: {
        fontFamily: fonts.bold,
        fontSize: 14,
        color: Colors.textTertiary,
        marginBottom: 16,
        marginLeft: 4,
    },
    actionCard: {
        flexDirection: 'row',
        backgroundColor: Colors.backgroundElevated,
        borderRadius: 20,
        padding: 20,
        marginBottom: 24,
        gap: 16,
        alignItems: 'center',
    },
    actionTextContent: {
        flex: 1,
    },
    actionTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: Colors.textPrimary,
        marginBottom: 4,
    },
    actionDesc: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#B0B3B5',
    },
    primaryButton: {
        backgroundColor: Colors.primary,
        borderRadius: 20,
        paddingVertical: 18,
        alignItems: 'center',
        marginBottom: 16,
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    },
    primaryButtonText: {
        fontFamily: fonts.bold,
        fontSize: 16,
        color: Colors.textPrimary,
    },
    secondaryButton: {
        paddingVertical: 16,
        alignItems: 'center',
    },
    secondaryButtonText: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: Colors.primary,
    },
    errorText: {
        color: Colors.error,
        textAlign: 'center',
    },
});
