// app/experiment-detail.tsx
// Detailed view of a user's experiment with progress tracking, exposure logging, and results

import { AnimatedScreen } from '@/components/animated-screen';
import { useAuth, useGlucoseUnit } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import {
    ExperimentVariant,
    getExperimentAnalysis,
    getExperimentEvents,
    getExperimentVariants,
    getUserExperiment,
    logExperimentEvent,
    updateUserExperimentStatus,
    UserExperiment,
    UserExperimentEvent,
    VariantMetrics,
} from '@/lib/supabase';
import { formatGlucose } from '@/lib/utils/glucoseUnits';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function ExperimentDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { user } = useAuth();
    const glucoseUnit = useGlucoseUnit();

    const [experiment, setExperiment] = useState<UserExperiment | null>(null);
    const [variants, setVariants] = useState<ExperimentVariant[]>([]);
    const [events, setEvents] = useState<UserExperimentEvent[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    // Analysis results
    const [analysisMetrics, setAnalysisMetrics] = useState<Record<string, VariantMetrics> | null>(null);
    const [analysisSummary, setAnalysisSummary] = useState<string | null>(null);
    const [analysisSuggestions, setAnalysisSuggestions] = useState<string[]>([]);
    const [analysisComparison, setAnalysisComparison] = useState<{
        winner: string | null;
        delta: number | null;
        confidence: string;
    } | null>(null);

    // Modals
    const [showExposureModal, setShowExposureModal] = useState(false);
    const [showCheckinModal, setShowCheckinModal] = useState(false);
    const [selectedVariant, setSelectedVariant] = useState<ExperimentVariant | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Check-in form state
    const [checkinEnergy, setCheckinEnergy] = useState(3);
    const [checkinHunger, setCheckinHunger] = useState(3);
    const [checkinCravings, setCheckinCravings] = useState(3);
    const [checkinNotes, setCheckinNotes] = useState('');

    // Fetch experiment data
    const fetchExperimentData = useCallback(async () => {
        if (!id || !user) return;

        setIsLoading(true);
        try {
            // Fetch experiment details
            const exp = await getUserExperiment(id);
            if (!exp) {
                Alert.alert('Error', 'Experiment not found');
                router.back();
                return;
            }
            setExperiment(exp);

            // Fetch variants
            const vars = await getExperimentVariants(exp.template_id);
            setVariants(vars);

            // Fetch events
            const evts = await getExperimentEvents(id);
            setEvents(evts);

            // Fetch analysis if experiment has exposures
            if (exp.exposures_logged > 0) {
                await fetchAnalysis();
            }
        } catch (error) {
            console.error('Error fetching experiment:', error);
            Alert.alert('Error', 'Failed to load experiment');
        } finally {
            setIsLoading(false);
        }
    }, [id, user]);

    // Fetch analysis
    const fetchAnalysis = async () => {
        if (!id || !user) return;

        setIsAnalyzing(true);
        try {
            const result = await getExperimentAnalysis(user.id, id, true);
            if (result) {
                setAnalysisMetrics(result.analysis.metrics);
                setAnalysisSummary(result.analysis.summary);
                setAnalysisSuggestions(result.analysis.suggestions);
                setAnalysisComparison({
                    winner: result.analysis.comparison.winner,
                    delta: result.analysis.comparison.delta,
                    confidence: result.analysis.comparison.confidence,
                });
            }
        } catch (error) {
            console.error('Error fetching analysis:', error);
        } finally {
            setIsAnalyzing(false);
        }
    };

    useEffect(() => {
        fetchExperimentData();
    }, [fetchExperimentData]);

    // Log an exposure
    const handleLogExposure = async (variant: ExperimentVariant) => {
        if (!user || !id) return;

        setIsSubmitting(true);
        try {
            const event = await logExperimentEvent(user.id, id, 'exposure', {
                variant_id: variant.id,
                variant_key: variant.key,
                adherence_pct: 100,
            });

            if (event) {
                Alert.alert(
                    'Exposure Logged! ✓',
                    `You logged "${variant.name}" for this experiment. Don't forget to log your meal and complete a post-meal review for best results.`,
                    [{ text: 'OK' }]
                );
                setShowExposureModal(false);
                fetchExperimentData();
            }
        } catch (error) {
            console.error('Error logging exposure:', error);
            Alert.alert('Error', 'Failed to log exposure');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Log a check-in
    const handleLogCheckin = async () => {
        if (!user || !id || !selectedVariant) return;

        setIsSubmitting(true);
        try {
            const event = await logExperimentEvent(user.id, id, 'checkin', {
                variant_key: selectedVariant.key,
                energy_1_5: checkinEnergy,
                hunger_1_5: checkinHunger,
                cravings_1_5: checkinCravings,
                notes: checkinNotes || undefined,
            });

            if (event) {
                Alert.alert('Check-in Logged! ✓', 'Your feedback has been recorded.');
                setShowCheckinModal(false);
                resetCheckinForm();
                fetchExperimentData();
            }
        } catch (error) {
            console.error('Error logging checkin:', error);
            Alert.alert('Error', 'Failed to log check-in');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Reset check-in form
    const resetCheckinForm = () => {
        setCheckinEnergy(3);
        setCheckinHunger(3);
        setCheckinCravings(3);
        setCheckinNotes('');
        setSelectedVariant(null);
    };

    // Archive experiment
    const handleArchiveExperiment = () => {
        Alert.alert(
            'Archive Experiment?',
            'This will move the experiment to your archive. You can still view the results.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Archive',
                    style: 'destructive',
                    onPress: async () => {
                        if (!id) return;
                        const success = await updateUserExperimentStatus(id, 'archived');
                        if (success) {
                            router.back();
                        }
                    },
                },
            ]
        );
    };

    // Calculate progress
    const requiredExposures = (experiment?.experiment_templates?.protocol?.exposures_per_variant || 5) * 2;
    const currentExposures = experiment?.exposures_logged || 0;
    const progressPct = Math.min(100, Math.round((currentExposures / requiredExposures) * 100));

    // Count exposures per variant
    const exposuresByVariant: Record<string, number> = {};
    events
        .filter((e) => e.type === 'exposure')
        .forEach((e) => {
            const key = e.payload.variant_key || 'unknown';
            exposuresByVariant[key] = (exposuresByVariant[key] || 0) + 1;
        });

    // Render score selector (1-5)
    const renderScoreSelector = (
        label: string,
        value: number,
        onChange: (v: number) => void,
        lowLabel: string,
        highLabel: string
    ) => (
        <View style={styles.scoreRow}>
            <Text style={styles.scoreLabel}>{label}</Text>
            <View style={styles.scoreButtons}>
                {[1, 2, 3, 4, 5].map((score) => (
                    <TouchableOpacity
                        key={score}
                        style={[styles.scoreButton, value === score && styles.scoreButtonActive]}
                        onPress={() => onChange(score)}
                    >
                        <Text style={[styles.scoreButtonText, value === score && styles.scoreButtonTextActive]}>
                            {score}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>
            <View style={styles.scoreLabels}>
                <Text style={styles.scoreLabelText}>{lowLabel}</Text>
                <Text style={styles.scoreLabelText}>{highLabel}</Text>
            </View>
        </View>
    );

    if (isLoading) {
        return (
            <AnimatedScreen>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#3494D9" />
                    <Text style={styles.loadingText}>Loading experiment...</Text>
                </View>
            </AnimatedScreen>
        );
    }

    if (!experiment) {
        return (
            <AnimatedScreen>
                <View style={styles.loadingContainer}>
                    <Text style={styles.loadingText}>Experiment not found</Text>
                </View>
            </AnimatedScreen>
        );
    }

    const template = experiment.experiment_templates;

    return (
        <AnimatedScreen>
            <View style={styles.container}>
                <LinearGradient
                    colors={['#1a1f24', '#181c20', '#111111']}
                    locations={[0, 0.3, 1]}
                    style={styles.backgroundGradient}
                />

                <SafeAreaView edges={['top']} style={styles.safeArea}>
                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity onPress={() => router.back()} style={styles.headerIconBtn}>
                            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>EXPERIMENT</Text>
                        <TouchableOpacity onPress={handleArchiveExperiment} style={styles.headerIconBtn}>
                            <Ionicons name="ellipsis-horizontal" size={24} color="#FFFFFF" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView
                        style={styles.scrollView}
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                    >
                        {/* Status Badge */}
                        <View style={styles.statusRow}>
                            <View
                                style={[
                                    styles.statusBadge,
                                    experiment.status === 'completed' && styles.statusBadgeCompleted,
                                ]}
                            >
                                <Text style={styles.statusBadgeText}>
                                    {experiment.status === 'active'
                                        ? 'IN PROGRESS'
                                        : experiment.status === 'completed'
                                            ? 'COMPLETED'
                                            : experiment.status.toUpperCase()}
                                </Text>
                            </View>
                        </View>

                        {/* Progress Card */}
                        <View style={styles.card}>
                            <Text style={styles.cardTitle}>Progress</Text>
                            <View style={styles.progressInfo}>
                                <Text style={styles.progressText}>
                                    {currentExposures} of {requiredExposures} exposures
                                </Text>
                                <Text style={styles.progressPct}>{progressPct}%</Text>
                            </View>
                            <View style={styles.progressBar}>
                                <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
                            </View>

                            {/* Variant breakdown */}
                            <View style={styles.variantBreakdown}>
                                {variants.map((variant) => (
                                    <View key={variant.id} style={styles.variantRow}>
                                        <Text style={styles.variantName}>{variant.name}</Text>
                                        <Text style={styles.variantCount}>
                                            {exposuresByVariant[variant.key] || 0} /{' '}
                                            {template?.protocol?.exposures_per_variant || 5}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        </View>

                        {/* Log Actions */}
                        {experiment.status === 'active' && (
                            <View style={styles.actionsCard}>
                                <TouchableOpacity
                                    style={styles.actionButton}
                                    onPress={() => setShowExposureModal(true)}
                                >
                                    <Ionicons name="add-circle-outline" size={24} color="#3494D9" />
                                    <Text style={styles.actionButtonText}>Log Exposure</Text>
                                </TouchableOpacity>
                                <View style={styles.actionDivider} />
                                <TouchableOpacity
                                    style={styles.actionButton}
                                    onPress={() => {
                                        if (variants.length > 0) {
                                            setSelectedVariant(variants[0]);
                                            setShowCheckinModal(true);
                                        }
                                    }}
                                >
                                    <Ionicons name="chatbubble-outline" size={24} color="#3494D9" />
                                    <Text style={styles.actionButtonText}>Check-in</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        {/* Results Card */}
                        {(analysisMetrics || isAnalyzing) && (
                            <View style={styles.card}>
                                <View style={styles.cardHeader}>
                                    <Text style={styles.cardTitle}>Results</Text>
                                    <TouchableOpacity onPress={fetchAnalysis} disabled={isAnalyzing}>
                                        <Ionicons
                                            name="refresh-outline"
                                            size={20}
                                            color={isAnalyzing ? '#666' : '#3494D9'}
                                        />
                                    </TouchableOpacity>
                                </View>

                                {isAnalyzing ? (
                                    <ActivityIndicator size="small" color="#3494D9" style={{ marginVertical: 20 }} />
                                ) : analysisMetrics ? (
                                    <>
                                        {/* Metrics comparison */}
                                        <View style={styles.metricsGrid}>
                                            {Object.entries(analysisMetrics).map(([key, metrics]) => {
                                                const variant = variants.find((v) => v.key === key);
                                                const isWinner = analysisComparison?.winner === key;
                                                return (
                                                    <View
                                                        key={key}
                                                        style={[styles.metricCard, isWinner && styles.metricCardWinner]}
                                                    >
                                                        {isWinner && (
                                                            <View style={styles.winnerBadge}>
                                                                <Text style={styles.winnerBadgeText}>BETTER</Text>
                                                            </View>
                                                        )}
                                                        <Text style={styles.metricName}>{variant?.name || key}</Text>
                                                        <Text style={styles.metricValue}>
                                                            {metrics.median_peak_delta !== null
                                                                ? `+${formatGlucose(metrics.median_peak_delta, glucoseUnit)}`
                                                                : '--'}
                                                        </Text>
                                                        <Text style={styles.metricLabel}>median spike</Text>
                                                        <Text style={styles.metricSubtext}>
                                                            {metrics.n_with_glucose_data} of {metrics.n_exposures} with data
                                                        </Text>
                                                    </View>
                                                );
                                            })}
                                        </View>

                                        {/* Confidence */}
                                        {analysisComparison && (
                                            <View style={styles.confidenceRow}>
                                                <Text style={styles.confidenceLabel}>Confidence:</Text>
                                                <View
                                                    style={[
                                                        styles.confidenceBadge,
                                                        analysisComparison.confidence === 'high' &&
                                                        styles.confidenceBadgeHigh,
                                                        analysisComparison.confidence === 'moderate' &&
                                                        styles.confidenceBadgeModerate,
                                                        analysisComparison.confidence === 'low' &&
                                                        styles.confidenceBadgeLow,
                                                    ]}
                                                >
                                                    <Text style={styles.confidenceBadgeText}>
                                                        {analysisComparison.confidence.toUpperCase()}
                                                    </Text>
                                                </View>
                                            </View>
                                        )}

                                        {/* Summary */}
                                        {analysisSummary && (
                                            <View style={styles.summarySection}>
                                                <Text style={styles.summaryTitle}>Summary</Text>
                                                <Text style={styles.summaryText}>{analysisSummary}</Text>
                                            </View>
                                        )}

                                        {/* Suggestions */}
                                        {analysisSuggestions.length > 0 && (
                                            <View style={styles.suggestionsSection}>
                                                <Text style={styles.suggestionsTitle}>Next Steps</Text>
                                                {analysisSuggestions.map((suggestion, idx) => (
                                                    <View key={idx} style={styles.suggestionRow}>
                                                        <Ionicons name="arrow-forward" size={14} color="#3494D9" />
                                                        <Text style={styles.suggestionText}>{suggestion}</Text>
                                                    </View>
                                                ))}
                                            </View>
                                        )}
                                    </>
                                ) : (
                                    <Text style={styles.noDataText}>
                                        Log more exposures to see results
                                    </Text>
                                )}
                            </View>
                        )}

                        {/* Instructions Card */}
                        <View style={styles.card}>
                            <Text style={styles.cardTitle}>How It Works</Text>
                            <Text style={styles.instructionsText}>
                                {template?.protocol?.instructions ||
                                    'Alternate between the two options and log your meals. Complete post-meal reviews to track your glucose response.'}
                            </Text>
                        </View>

                        {/* Recent Activity */}
                        {events.length > 0 && (
                            <View style={styles.card}>
                                <Text style={styles.cardTitle}>Recent Activity</Text>
                                {events.slice(-5).reverse().map((event) => {
                                    const variant = variants.find((v) => v.key === event.payload.variant_key);
                                    return (
                                        <View key={event.id} style={styles.activityRow}>
                                            <View style={styles.activityIcon}>
                                                <Ionicons
                                                    name={
                                                        event.type === 'exposure'
                                                            ? 'restaurant-outline'
                                                            : event.type === 'checkin'
                                                                ? 'chatbubble-outline'
                                                                : 'document-text-outline'
                                                    }
                                                    size={16}
                                                    color="#878787"
                                                />
                                            </View>
                                            <View style={styles.activityContent}>
                                                <Text style={styles.activityTitle}>
                                                    {event.type === 'exposure'
                                                        ? `Logged ${variant?.name || 'exposure'}`
                                                        : event.type === 'checkin'
                                                            ? 'Check-in completed'
                                                            : 'Note added'}
                                                </Text>
                                                <Text style={styles.activityTime}>
                                                    {new Date(event.occurred_at).toLocaleDateString()} at{' '}
                                                    {new Date(event.occurred_at).toLocaleTimeString([], {
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                    })}
                                                </Text>
                                            </View>
                                        </View>
                                    );
                                })}
                            </View>
                        )}

                        <View style={{ height: 100 }} />
                    </ScrollView>
                </SafeAreaView>

                {/* Exposure Modal */}
                <Modal
                    visible={showExposureModal}
                    animationType="slide"
                    transparent={true}
                    onRequestClose={() => setShowExposureModal(false)}
                >
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContent}>
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>Log Exposure</Text>
                                <TouchableOpacity onPress={() => setShowExposureModal(false)}>
                                    <Ionicons name="close" size={24} color="#FFFFFF" />
                                </TouchableOpacity>
                            </View>
                            <Text style={styles.modalSubtitle}>Which option did you try?</Text>

                            <View style={styles.variantOptions}>
                                {variants.map((variant) => (
                                    <TouchableOpacity
                                        key={variant.id}
                                        style={styles.variantOption}
                                        onPress={() => handleLogExposure(variant)}
                                        disabled={isSubmitting}
                                    >
                                        <Text style={styles.variantOptionName}>{variant.name}</Text>
                                        <Text style={styles.variantOptionDescription}>{variant.description}</Text>
                                        {isSubmitting ? (
                                            <ActivityIndicator size="small" color="#3494D9" />
                                        ) : (
                                            <Ionicons name="chevron-forward" size={20} color="#878787" />
                                        )}
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                    </View>
                </Modal>

                {/* Check-in Modal */}
                <Modal
                    visible={showCheckinModal}
                    animationType="slide"
                    transparent={true}
                    onRequestClose={() => {
                        setShowCheckinModal(false);
                        resetCheckinForm();
                    }}
                >
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContent}>
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>Check-in</Text>
                                <TouchableOpacity
                                    onPress={() => {
                                        setShowCheckinModal(false);
                                        resetCheckinForm();
                                    }}
                                >
                                    <Ionicons name="close" size={24} color="#FFFFFF" />
                                </TouchableOpacity>
                            </View>

                            <ScrollView style={styles.checkinForm}>
                                {/* Variant selector */}
                                <Text style={styles.checkinLabel}>For which variant?</Text>
                                <View style={styles.variantTabs}>
                                    {variants.map((variant) => (
                                        <TouchableOpacity
                                            key={variant.id}
                                            style={[
                                                styles.variantTab,
                                                selectedVariant?.id === variant.id && styles.variantTabActive,
                                            ]}
                                            onPress={() => setSelectedVariant(variant)}
                                        >
                                            <Text
                                                style={[
                                                    styles.variantTabText,
                                                    selectedVariant?.id === variant.id && styles.variantTabTextActive,
                                                ]}
                                            >
                                                {variant.name}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                {renderScoreSelector('Energy Level', checkinEnergy, setCheckinEnergy, 'Low', 'High')}
                                {renderScoreSelector('Hunger', checkinHunger, setCheckinHunger, 'Not hungry', 'Very hungry')}
                                {renderScoreSelector('Cravings', checkinCravings, setCheckinCravings, 'None', 'Strong')}

                                <Text style={styles.checkinLabel}>Notes (optional)</Text>
                                <TextInput
                                    style={styles.notesInput}
                                    placeholder="Any observations..."
                                    placeholderTextColor="#666"
                                    multiline
                                    value={checkinNotes}
                                    onChangeText={setCheckinNotes}
                                />

                                <TouchableOpacity
                                    style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
                                    onPress={handleLogCheckin}
                                    disabled={isSubmitting || !selectedVariant}
                                >
                                    {isSubmitting ? (
                                        <ActivityIndicator size="small" color="#FFFFFF" />
                                    ) : (
                                        <Text style={styles.submitButtonText}>Submit Check-in</Text>
                                    )}
                                </TouchableOpacity>
                            </ScrollView>
                        </View>
                    </View>
                </Modal>
            </View>
        </AnimatedScreen>
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
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#111111',
    },
    loadingText: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: '#878787',
        marginTop: 16,
    },
    header: {
        height: 72,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    headerIconBtn: {
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
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 16,
        paddingTop: 8,
    },
    statusRow: {
        marginBottom: 16,
    },
    statusBadge: {
        alignSelf: 'flex-start',
        backgroundColor: '#3494D9',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 4,
    },
    statusBadgeCompleted: {
        backgroundColor: '#4CAF50',
    },
    statusBadgeText: {
        fontFamily: fonts.semiBold,
        fontSize: 11,
        color: '#FFFFFF',
        letterSpacing: 0.5,
    },
    card: {
        backgroundColor: '#1E2124',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    cardTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: '#FFFFFF',
        marginBottom: 12,
    },
    progressInfo: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    progressText: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#AAAAAA',
    },
    progressPct: {
        fontFamily: fonts.semiBold,
        fontSize: 14,
        color: '#3494D9',
    },
    progressBar: {
        height: 8,
        backgroundColor: '#3F4243',
        borderRadius: 4,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#3494D9',
        borderRadius: 4,
    },
    variantBreakdown: {
        marginTop: 16,
        gap: 8,
    },
    variantRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    variantName: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: '#FFFFFF',
    },
    variantCount: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#878787',
    },
    actionsCard: {
        backgroundColor: '#1E2124',
        borderRadius: 16,
        flexDirection: 'row',
        marginBottom: 16,
        overflow: 'hidden',
    },
    actionButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 16,
    },
    actionButtonText: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: '#3494D9',
    },
    actionDivider: {
        width: 1,
        backgroundColor: '#3F4243',
    },
    metricsGrid: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 16,
    },
    metricCard: {
        flex: 1,
        backgroundColor: '#2A2D30',
        borderRadius: 12,
        padding: 12,
        alignItems: 'center',
    },
    metricCardWinner: {
        borderWidth: 1,
        borderColor: '#4CAF50',
    },
    winnerBadge: {
        position: 'absolute',
        top: -8,
        backgroundColor: '#4CAF50',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
    },
    winnerBadgeText: {
        fontFamily: fonts.semiBold,
        fontSize: 9,
        color: '#FFFFFF',
        letterSpacing: 0.5,
    },
    metricName: {
        fontFamily: fonts.medium,
        fontSize: 13,
        color: '#FFFFFF',
        marginTop: 4,
        marginBottom: 8,
    },
    metricValue: {
        fontFamily: fonts.bold,
        fontSize: 24,
        color: '#FFFFFF',
    },
    metricLabel: {
        fontFamily: fonts.regular,
        fontSize: 11,
        color: '#878787',
        marginTop: 2,
    },
    metricSubtext: {
        fontFamily: fonts.regular,
        fontSize: 10,
        color: '#666',
        marginTop: 4,
    },
    confidenceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
    },
    confidenceLabel: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: '#878787',
    },
    confidenceBadge: {
        backgroundColor: '#666',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
    },
    confidenceBadgeHigh: {
        backgroundColor: '#4CAF50',
    },
    confidenceBadgeModerate: {
        backgroundColor: '#FF9800',
    },
    confidenceBadgeLow: {
        backgroundColor: '#F44336',
    },
    confidenceBadgeText: {
        fontFamily: fonts.semiBold,
        fontSize: 10,
        color: '#FFFFFF',
        letterSpacing: 0.5,
    },
    summarySection: {
        marginBottom: 16,
    },
    summaryTitle: {
        fontFamily: fonts.medium,
        fontSize: 13,
        color: '#878787',
        marginBottom: 8,
    },
    summaryText: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#FFFFFF',
        lineHeight: 20,
    },
    suggestionsSection: {
        borderTopWidth: 1,
        borderTopColor: '#3F4243',
        paddingTop: 16,
    },
    suggestionsTitle: {
        fontFamily: fonts.medium,
        fontSize: 13,
        color: '#878787',
        marginBottom: 12,
    },
    suggestionRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        marginBottom: 8,
    },
    suggestionText: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: '#AAAAAA',
        flex: 1,
        lineHeight: 18,
    },
    noDataText: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#666',
        textAlign: 'center',
        paddingVertical: 20,
    },
    instructionsText: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#AAAAAA',
        lineHeight: 20,
    },
    activityRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#2A2D30',
    },
    activityIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#2A2D30',
        justifyContent: 'center',
        alignItems: 'center',
    },
    activityContent: {
        flex: 1,
    },
    activityTitle: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: '#FFFFFF',
    },
    activityTime: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: '#666',
        marginTop: 2,
    },
    // Modal styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#1E2124',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingTop: 20,
        paddingHorizontal: 20,
        paddingBottom: 40,
        maxHeight: '80%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    modalTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 20,
        color: '#FFFFFF',
    },
    modalSubtitle: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#878787',
        marginBottom: 20,
    },
    variantOptions: {
        gap: 12,
    },
    variantOption: {
        backgroundColor: '#2A2D30',
        borderRadius: 12,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
    },
    variantOptionName: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: '#FFFFFF',
        flex: 1,
    },
    variantOptionDescription: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: '#878787',
        flex: 2,
        marginRight: 8,
    },
    checkinForm: {
        maxHeight: 400,
    },
    checkinLabel: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: '#FFFFFF',
        marginBottom: 12,
        marginTop: 16,
    },
    variantTabs: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 8,
    },
    variantTab: {
        flex: 1,
        paddingVertical: 12,
        paddingHorizontal: 16,
        backgroundColor: '#2A2D30',
        borderRadius: 8,
        alignItems: 'center',
    },
    variantTabActive: {
        backgroundColor: '#3494D9',
    },
    variantTabText: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: '#878787',
    },
    variantTabTextActive: {
        color: '#FFFFFF',
    },
    scoreRow: {
        marginTop: 16,
    },
    scoreLabel: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: '#FFFFFF',
        marginBottom: 12,
    },
    scoreButtons: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 8,
    },
    scoreButton: {
        flex: 1,
        height: 44,
        backgroundColor: '#2A2D30',
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    scoreButtonActive: {
        backgroundColor: '#3494D9',
    },
    scoreButtonText: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: '#878787',
    },
    scoreButtonTextActive: {
        color: '#FFFFFF',
    },
    scoreLabels: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 6,
    },
    scoreLabelText: {
        fontFamily: fonts.regular,
        fontSize: 11,
        color: '#666',
    },
    notesInput: {
        backgroundColor: '#2A2D30',
        borderRadius: 12,
        padding: 16,
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#FFFFFF',
        minHeight: 80,
        textAlignVertical: 'top',
    },
    submitButton: {
        backgroundColor: '#3494D9',
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 24,
    },
    submitButtonDisabled: {
        opacity: 0.6,
    },
    submitButtonText: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: '#FFFFFF',
    },
});

