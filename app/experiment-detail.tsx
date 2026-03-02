// app/experiment-detail.tsx
// Daily habit tracker for experiments — progress ring, weekly tracker, completion CTA, science section

import { MetabolicScoreRing } from '@/components/charts/MetabolicScoreRing';
import { WeeklyDayTracker } from '@/components/experiments/WeeklyDayTracker';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import {
    ExperimentTemplate,
    getExperimentEvents,
    getExperimentTemplates,
    getUserExperiment,
    logExperimentEvent,
    UserExperiment,
    UserExperimentEvent,
} from '@/lib/supabase';
import { triggerHaptic } from '@/lib/utils/haptics';
import { Ionicons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

function toDateKey(d: Date): string {
    return d.toISOString().split('T')[0];
}

export default function ExperimentDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { user } = useAuth();

    const [experiment, setExperiment] = useState<UserExperiment | null>(null);
    const [events, setEvents] = useState<UserExperimentEvent[]>([]);
    const [templates, setTemplates] = useState<ExperimentTemplate[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isLogging, setIsLogging] = useState(false);

    // Feeling check-in state
    const [energyScore, setEnergyScore] = useState(3);
    const [isLoggingCheckin, setIsLoggingCheckin] = useState(false);

    const fetchData = useCallback(async () => {
        if (!id || !user) return;
        setIsLoading(true);
        try {
            const [exp, evts, tmpl] = await Promise.all([
                getUserExperiment(id),
                getExperimentEvents(id, 'exposure'),
                getExperimentTemplates(),
            ]);
            if (!exp) {
                Alert.alert('Error', 'Experiment not found');
                router.back();
                return;
            }
            setExperiment(exp);
            setEvents(evts);
            setTemplates(tmpl);
        } catch (error) {
            console.error('Error fetching experiment:', error);
            Alert.alert('Error', 'Failed to load experiment');
        } finally {
            setIsLoading(false);
        }
    }, [id, user]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const template = experiment?.experiment_templates;
    const protocol = template?.protocol || {};
    const durationDays = protocol.duration_days || 7;
    const startDate = experiment?.start_at
        ? new Date(experiment.start_at)
        : experiment
            ? new Date(experiment.created_at)
            : new Date();

    // Compute completed dates from exposure events
    const completedDates = useMemo(() => {
        return events.map(e => toDateKey(new Date(e.occurred_at)));
    }, [events]);

    // Unique completed days
    const completedDaysCount = useMemo(() => {
        return new Set(completedDates).size;
    }, [completedDates]);

    const progressPct = Math.min(100, Math.round((completedDaysCount / durationDays) * 100));

    // Up-next templates (exclude current experiment's template)
    const upNextTemplates = useMemo(() => {
        if (!template) return templates.slice(0, 4);
        return templates.filter(t => t.id !== template.id).slice(0, 4);
    }, [templates, template]);

    const science = protocol.science as {
        title: string;
        description: string;
        steps: string[];
        study_link?: string;
    } | undefined;

    const handleLogCompletion = async () => {
        triggerHaptic('medium');
        if (!user || !id || isLogging) return;
        const today = toDateKey(new Date());
        if (completedDates.includes(today)) {
            Alert.alert('Already Logged', 'You already logged completion for today.');
            return;
        }
        setIsLogging(true);
        try {
            await logExperimentEvent(user.id, id, 'exposure', {});
            Alert.alert('Logged!', 'Today\'s completion has been recorded.');
            fetchData();
        } catch (error) {
            console.error('Error logging completion:', error);
            Alert.alert('Error', 'Failed to log completion');
        } finally {
            setIsLogging(false);
        }
    };

    const handleLogCheckin = async () => {
        triggerHaptic('medium');
        if (!user || !id || isLoggingCheckin) return;
        setIsLoggingCheckin(true);
        try {
            await logExperimentEvent(user.id, id, 'checkin', { energy_1_5: energyScore });
            Alert.alert('Logged!', 'Your check-in has been recorded.');
            setEnergyScore(3);
        } catch (error) {
            console.error('Error logging checkin:', error);
            Alert.alert('Error', 'Failed to log check-in');
        } finally {
            setIsLoggingCheckin(false);
        }
    };

    const handleShare = () => {
        triggerHaptic();
        if (!template) return;
        Share.share({
            message: `I'm doing the "${template.title}" experiment on Gluco! ${template.short_description || template.subtitle || ''}`,
        });
    };

    const handleUpNextPress = (tmpl: ExperimentTemplate) => {
        triggerHaptic();
        router.push({ pathname: '/experiment-detail', params: { id: tmpl.id } } as any);
    };

    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.loadingText}>Loading experiment...</Text>
            </View>
        );
    }

    if (!experiment || !template) {
        return (
            <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>Experiment not found</Text>
            </View>
        );
    }

    const dayNumber = Math.max(1, Math.ceil((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24)));

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ title: 'Experiment' }} />
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Hero section — badge + title + meta */}
                <View style={styles.heroSection}>
                    {experiment.status === 'active' && (
                        <View style={styles.activeBadge}>
                            <View style={styles.activeDot} />
                            <Text style={styles.activeBadgeText}>Active · Day {Math.min(dayNumber, durationDays)}</Text>
                        </View>
                    )}
                    <Text style={styles.experimentTitle}>{template.title}</Text>
                    <View style={styles.metaRow}>
                        <Text style={styles.experimentMeta}>
                            {template.category} · {durationDays} days
                        </Text>
                        <TouchableOpacity onPress={handleShare} style={styles.shareButton} activeOpacity={0.6}>
                            <Ionicons name="share-outline" size={16} color={Colors.textSecondary} />
                            <Text style={styles.shareButtonText}>Share</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Progress ring */}
                <View style={styles.ringCard}>
                    <View style={styles.ringContainer}>
                        <MetabolicScoreRing
                            size={150}
                            score={progressPct}
                            visualPreset="hero_vivid"
                            showInnerValue={false}
                        />
                        <View style={styles.ringOverlay}>
                            <Text style={styles.ringDaysCount}>
                                {completedDaysCount}<Text style={styles.ringDaysTotal}>/{durationDays}</Text>
                            </Text>
                            <Text style={styles.ringDaysLabel}>DAYS</Text>
                        </View>
                    </View>
                </View>

                {/* Day tracker */}
                <View style={styles.trackerCard}>
                    <Text style={styles.trackerLabel}>YOUR PROGRESS</Text>
                    <WeeklyDayTracker
                        startDate={startDate}
                        totalDays={durationDays}
                        completedDates={completedDates}
                    />
                </View>

                {/* Log completion CTA */}
                {experiment.status === 'active' && (
                    <TouchableOpacity
                        style={[styles.ctaButton, isLogging && styles.ctaButtonDisabled]}
                        onPress={handleLogCompletion}
                        activeOpacity={0.7}
                        disabled={isLogging}
                    >
                        {isLogging ? (
                            <ActivityIndicator color="#FFFFFF" size="small" />
                        ) : (
                            <>
                                <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                                <Text style={styles.ctaButtonText}>Mark Today Complete</Text>
                            </>
                        )}
                    </TouchableOpacity>
                )}

                {/* How did you feel? card */}
                {experiment.status === 'active' && (
                    <View style={styles.card}>
                        <View style={styles.cardHeaderRow}>
                            <Ionicons name="heart-outline" size={18} color={Colors.primary} />
                            <Text style={styles.cardTitle}>How did you feel?</Text>
                        </View>
                        <Text style={styles.cardSubtitle}>Rate your energy after today's session</Text>
                        <View style={styles.energyRow}>
                            {[1, 2, 3, 4, 5].map((score) => (
                                <TouchableOpacity
                                    key={score}
                                    style={[
                                        styles.energyButton,
                                        energyScore === score && styles.energyButtonActive,
                                    ]}
                                    onPress={() => { triggerHaptic(); setEnergyScore(score); }}
                                >
                                    <Text
                                        style={[
                                            styles.energyButtonText,
                                            energyScore === score && styles.energyButtonTextActive,
                                        ]}
                                    >
                                        {score}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <View style={styles.energyLabels}>
                            <Text style={styles.energyLabelText}>Low energy</Text>
                            <Text style={styles.energyLabelText}>High energy</Text>
                        </View>
                        <TouchableOpacity
                            style={[styles.logCheckinButton, isLoggingCheckin && styles.ctaButtonDisabled]}
                            onPress={handleLogCheckin}
                            disabled={isLoggingCheckin}
                            activeOpacity={0.7}
                        >
                            {isLoggingCheckin ? (
                                <ActivityIndicator color={Colors.primary} size="small" />
                            ) : (
                                <Text style={styles.logCheckinButtonText}>Log Check-in</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                )}

                {/* THE SCIENCE section */}
                {science && (
                    <View style={styles.card}>
                        <View style={styles.cardHeaderRow}>
                            <Ionicons name="flask-outline" size={18} color={Colors.primary} />
                            <Text style={styles.scienceHeaderLabel}>THE SCIENCE</Text>
                        </View>
                        <Text style={styles.scienceTitle}>{science.title}</Text>
                        <Text style={styles.scienceDescription}>{science.description}</Text>
                        {science.steps.length > 0 && (
                            <View style={styles.scienceSteps}>
                                {science.steps.map((step, index) => (
                                    <View key={index} style={styles.scienceStepRow}>
                                        <View style={styles.scienceStepNumber}>
                                            <Text style={styles.scienceStepNumberText}>{index + 1}</Text>
                                        </View>
                                        <Text style={styles.scienceStepText}>{step}</Text>
                                    </View>
                                ))}
                            </View>
                        )}
                        {science.study_link && (
                            <TouchableOpacity style={styles.scienceLinkRow}>
                                <Ionicons name="open-outline" size={14} color={Colors.primary} />
                                <Text style={styles.scienceLink}>View published study</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                {/* UP NEXT section */}
                {upNextTemplates.length > 0 && (
                    <View style={styles.upNextSection}>
                        <Text style={styles.upNextHeader}>UP NEXT</Text>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.upNextScroll}
                        >
                            {upNextTemplates.map((tmpl) => (
                                <TouchableOpacity
                                    key={tmpl.id}
                                    style={styles.upNextCard}
                                    onPress={() => handleUpNextPress(tmpl)}
                                    activeOpacity={0.7}
                                >
                                    <View
                                        style={[
                                            styles.upNextIcon,
                                            { backgroundColor: tmpl.icon_color ? `${tmpl.icon_color}20` : 'rgba(45,212,191,0.12)' },
                                        ]}
                                    >
                                        <Text style={styles.upNextIconEmoji}>{tmpl.icon || '🧪'}</Text>
                                    </View>
                                    <Text style={styles.upNextTitle} numberOfLines={1}>{tmpl.title}</Text>
                                    <Text style={styles.upNextSubtitle} numberOfLines={2}>
                                        {tmpl.short_description || tmpl.subtitle || ''}
                                    </Text>
                                    {tmpl.difficulty && (
                                        <Text style={[
                                            styles.upNextDifficulty,
                                            tmpl.difficulty === 'easy' && { color: Colors.success },
                                            tmpl.difficulty === 'medium' && { color: Colors.warning },
                                            tmpl.difficulty === 'hard' && { color: Colors.error },
                                        ]}>
                                            {tmpl.difficulty === 'easy' ? 'Easy' : tmpl.difficulty === 'medium' ? 'Medium' : 'Hard'}
                                            {' · '}{tmpl.protocol?.duration_days || 7}d
                                        </Text>
                                    )}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                )}

                <View style={{ height: 40 }} />
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'transparent',
    },
    loadingText: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: Colors.textTertiary,
        marginTop: 16,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 4,
        gap: 16,
    },
    // Hero
    heroSection: {
        gap: 6,
    },
    activeBadge: {
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
        backgroundColor: 'rgba(52, 211, 153, 0.10)',
    },
    activeDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: Colors.success,
    },
    activeBadgeText: {
        fontFamily: fonts.semiBold,
        fontSize: 12,
        color: Colors.success,
    },
    experimentTitle: {
        fontFamily: fonts.bold,
        fontSize: 26,
        color: Colors.textPrimary,
        letterSpacing: -0.3,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    experimentMeta: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: Colors.textSecondary,
        textTransform: 'capitalize',
    },
    shareButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingVertical: 4,
        paddingHorizontal: 8,
    },
    shareButtonText: {
        fontFamily: fonts.medium,
        fontSize: 13,
        color: Colors.textSecondary,
    },
    // Ring
    ringCard: {
        alignItems: 'center',
        paddingVertical: 8,
    },
    ringContainer: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    ringOverlay: {
        position: 'absolute',
        alignItems: 'center',
        justifyContent: 'center',
    },
    ringDaysCount: {
        fontFamily: fonts.bold,
        fontSize: 34,
        color: Colors.textPrimary,
    },
    ringDaysTotal: {
        fontSize: 22,
        color: Colors.textTertiary,
    },
    ringDaysLabel: {
        fontFamily: fonts.semiBold,
        fontSize: 11,
        color: Colors.textTertiary,
        letterSpacing: 1.5,
        marginTop: -2,
    },
    // Day tracker
    trackerCard: {
        backgroundColor: Colors.backgroundCard,
        borderRadius: 18,
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: 12,
        borderWidth: 1,
        borderColor: Colors.borderCard,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 1,
    },
    trackerLabel: {
        fontFamily: fonts.bold,
        fontSize: 11,
        color: Colors.textTertiary,
        letterSpacing: 1,
        marginBottom: 8,
    },
    // CTA
    ctaButton: {
        backgroundColor: Colors.textPrimary,
        borderRadius: 14,
        paddingVertical: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    ctaButtonDisabled: {
        opacity: 0.5,
    },
    ctaButtonText: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: '#FFFFFF',
    },
    // Cards
    card: {
        backgroundColor: Colors.backgroundCard,
        borderRadius: 18,
        padding: 16,
        borderWidth: 1,
        borderColor: Colors.borderCard,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 1,
    },
    cardHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 6,
    },
    cardTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: Colors.textPrimary,
    },
    cardSubtitle: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: Colors.textSecondary,
        marginBottom: 14,
    },
    energyRow: {
        flexDirection: 'row',
        gap: 8,
    },
    energyButton: {
        flex: 1,
        height: 44,
        backgroundColor: 'rgba(0, 0, 0, 0.03)',
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1.5,
        borderColor: 'transparent',
    },
    energyButtonActive: {
        backgroundColor: 'rgba(45, 212, 191, 0.08)',
        borderColor: Colors.primary,
    },
    energyButtonText: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: Colors.textTertiary,
    },
    energyButtonTextActive: {
        color: Colors.primary,
    },
    energyLabels: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 6,
        paddingHorizontal: 4,
    },
    energyLabelText: {
        fontFamily: fonts.regular,
        fontSize: 11,
        color: Colors.textTertiary,
    },
    logCheckinButton: {
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: 'center',
        marginTop: 14,
        backgroundColor: 'rgba(45, 212, 191, 0.08)',
    },
    logCheckinButtonText: {
        fontFamily: fonts.semiBold,
        fontSize: 14,
        color: Colors.primary,
    },
    // Science section
    scienceHeaderLabel: {
        fontFamily: fonts.bold,
        fontSize: 12,
        color: Colors.textSecondary,
        letterSpacing: 0.8,
    },
    scienceTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 17,
        color: Colors.textPrimary,
        marginBottom: 6,
    },
    scienceDescription: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: Colors.textSecondary,
        lineHeight: 20,
        marginBottom: 14,
    },
    scienceSteps: {
        gap: 10,
        marginBottom: 12,
    },
    scienceStepRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
    },
    scienceStepNumber: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: Colors.primaryLight,
        alignItems: 'center',
        justifyContent: 'center',
    },
    scienceStepNumberText: {
        fontFamily: fonts.bold,
        fontSize: 12,
        color: Colors.primary,
    },
    scienceStepText: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: Colors.textPrimary,
        flex: 1,
        lineHeight: 20,
    },
    scienceLinkRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    scienceLink: {
        fontFamily: fonts.semiBold,
        fontSize: 13,
        color: Colors.primary,
    },
    // Up Next section
    upNextSection: {
        gap: 10,
    },
    upNextHeader: {
        fontFamily: fonts.bold,
        fontSize: 12,
        color: Colors.textTertiary,
        letterSpacing: 1,
    },
    upNextScroll: {
        gap: 10,
    },
    upNextCard: {
        width: 150,
        backgroundColor: Colors.backgroundCard,
        borderRadius: 16,
        padding: 14,
        borderWidth: 1,
        borderColor: Colors.borderCard,
        gap: 5,
    },
    upNextIcon: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 2,
    },
    upNextIconEmoji: {
        fontSize: 18,
    },
    upNextTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 14,
        color: Colors.textPrimary,
    },
    upNextSubtitle: {
        fontFamily: fonts.regular,
        fontSize: 11,
        color: Colors.textSecondary,
        lineHeight: 15,
    },
    upNextDifficulty: {
        fontFamily: fonts.medium,
        fontSize: 11,
        marginTop: 2,
    },
});
