// app/experiments-list.tsx
// Screen to view all user experiments (active, completed, archived)

import { AnimatedScreen } from '@/components/animated-screen';
import { SegmentedControl } from '@/components/segmented-control';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import {
    ExperimentTemplate,
    getExperimentTemplates,
    getUserExperiments,
    startUserExperiment,
    UserExperiment,
} from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type FilterKey = 'active' | 'completed' | 'all';

export default function ExperimentsListScreen() {
    const { user } = useAuth();

    const [activeFilter, setActiveFilter] = useState<FilterKey>('active');
    const [experiments, setExperiments] = useState<UserExperiment[]>([]);
    const [templates, setTemplates] = useState<ExperimentTemplate[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [startingId, setStartingId] = useState<string | null>(null);
    const [successId, setSuccessId] = useState<string | null>(null);


    // Fetch experiments
    const fetchExperiments = useCallback(async () => {
        if (!user) return;

        setIsLoading(true);
        try {
            // Fetch all user experiments
            const exps = await getUserExperiments(user.id);
            setExperiments(exps);

            // Fetch templates for the explore section
            const temps = await getExperimentTemplates();
            setTemplates(temps);
        } catch (error) {
            console.error('Error fetching experiments:', error);
        } finally {
            setIsLoading(false);
        }
    }, [user]);

    useFocusEffect(
        useCallback(() => {
            fetchExperiments();
        }, [fetchExperiments])
    );

    // Filter experiments based on active filter
    const filteredExperiments = experiments.filter((exp) => {
        switch (activeFilter) {
            case 'active':
                return exp.status === 'active' || exp.status === 'draft';
            case 'completed':
                return exp.status === 'completed';
            case 'all':
                return true;
            default:
                return true;
        }
    });

    // Get template IDs that are currently ACTIVE
    const activeTemplateIds = new Set(experiments.filter(e => e.status === 'active').map((e) => e.template_id));

    // Templates user can start (not currently active)
    const availableTemplates = templates.filter((t) => !activeTemplateIds.has(t.id));

    // Calculate progress percentage
    const getProgressPct = (exp: UserExperiment) => {
        const required = (exp.experiment_templates?.protocol?.exposures_per_variant || 5) * 2;
        return Math.min(100, Math.round((exp.exposures_logged / required) * 100));
    };

    // Get status color
    const getStatusColor = (status: string) => {
        switch (status) {
            case 'active':
                return '#3494D9';
            case 'completed':
                return '#4CAF50';
            case 'archived':
                return '#666';
            default:
                return '#FF9800';
        }
    };

    const handleStartExperiment = async (templateId: string) => {
        if (!user || startingId) return;
        setStartingId(templateId);

        try {
            const exp = await startUserExperiment(user.id, templateId);
            if (exp) {
                setStartingId(null);
                setSuccessId(templateId);

                // Show checkmark then navigate
                setTimeout(() => {
                    setSuccessId(null);
                    router.push('/(tabs)/' as any);
                }, 1500);
            } else {
                throw new Error('Failed to create experiment');
            }
        } catch (error) {
            console.error('Start error:', error);
            setStartingId(null);
            Alert.alert('Error', 'Could not start experiment. Please try again.');
        }
    };

    // Render experiment card
    const renderExperimentCard = (exp: UserExperiment) => {
        const template = exp.experiment_templates;
        const progressPct = getProgressPct(exp);

        return (
            <TouchableOpacity
                key={exp.id}
                style={styles.experimentCard}
                onPress={() => router.push(`/experiment-detail?id=${exp.id}` as any)}
                activeOpacity={0.7}
            >
                <View style={styles.cardHeader}>
                    <Text style={styles.cardIcon}>{template?.icon || '🧪'}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(exp.status) }]}>
                        <Text style={styles.statusBadgeText}>
                            {exp.status === 'active' ? 'IN PROGRESS' : exp.status.toUpperCase()}
                        </Text>
                    </View>
                </View>

                <Text style={styles.cardTitle}>{template?.title || 'Experiment'}</Text>
                <Text style={styles.cardSubtitle}>{template?.subtitle}</Text>

                {exp.status === 'active' && (
                    <View style={styles.progressSection}>
                        <View style={styles.progressInfo}>
                            <Text style={styles.progressText}>
                                {exp.exposures_logged} / {(template?.protocol?.exposures_per_variant || 5) * 2} exposures
                            </Text>
                            <Text style={styles.progressPct}>{progressPct}%</Text>
                        </View>
                        <View style={styles.progressBar}>
                            <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
                        </View>
                    </View>
                )}

                {exp.status === 'completed' && (
                    <View style={styles.completedSection}>
                        <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                        <Text style={styles.completedText}>
                            Completed {exp.completed_at ? new Date(exp.completed_at).toLocaleDateString() : ''}
                        </Text>
                    </View>
                )}

                <View style={styles.cardFooter}>
                    <View style={styles.viewProgressButton}>
                        <Text style={styles.viewProgressText}>View Progress</Text>
                        <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    // Render template card for explore section
    const renderTemplateCard = (template: ExperimentTemplate) => {
        const isStarting = startingId === template.id;
        const isSuccess = successId === template.id;

        return (
            <TouchableOpacity
                key={template.id}
                style={styles.templateCard}
                onPress={() => handleStartExperiment(template.id)}
                activeOpacity={0.7}
                disabled={isStarting || isSuccess}
            >
                <Text style={styles.templateIcon}>{template.icon || '🧪'}</Text>
                <View style={styles.templateContent}>
                    <Text style={styles.templateTitle}>{template.title}</Text>
                    <Text style={styles.templateSubtitle}>{template.subtitle}</Text>
                </View>

                {isStarting ? (
                    <ActivityIndicator size="small" color="#3494D9" />
                ) : isSuccess ? (
                    <View style={styles.successIcon}>
                        <Ionicons name="checkmark-circle" size={28} color="#4CAF50" />
                    </View>
                ) : (
                    <Ionicons name="add-circle-outline" size={24} color="#3494D9" />
                )}
            </TouchableOpacity>
        );
    };

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
                        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>My Experiments</Text>
                        <View style={styles.headerSpacer} />
                    </View>

                    {/* Filter Tabs */}
                    <View style={styles.filterContainer}>
                        <SegmentedControl<FilterKey>
                            value={activeFilter}
                            onChange={setActiveFilter}
                            options={[
                                { label: 'Active', value: 'active' },
                                { label: 'Completed', value: 'completed' },
                                { label: 'All', value: 'all' },
                            ]}
                        />
                    </View>

                    <ScrollView
                        style={styles.scrollView}
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                    >
                        {/* Stats Summary */}
                        {experiments.length > 0 && (
                            <View style={[styles.statsCard, { marginTop: 0, marginBottom: 24 }]}>
                                <Text style={styles.statsTitle}>Your Progress</Text>
                                <View style={styles.statsRow}>
                                    <View style={styles.statItem}>
                                        <Text style={styles.statValue}>
                                            {experiments.filter((e) => e.status === 'completed').length}
                                        </Text>
                                        <Text style={styles.statLabel}>Completed</Text>
                                    </View>
                                    <View style={styles.statDivider} />
                                    <View style={styles.statItem}>
                                        <Text style={styles.statValue}>
                                            {experiments.filter((e) => e.status === 'active').length}
                                        </Text>
                                        <Text style={styles.statLabel}>Active</Text>
                                    </View>
                                    <View style={styles.statDivider} />
                                    <View style={styles.statItem}>
                                        <Text style={styles.statValue}>
                                            {experiments.reduce((sum, e) => sum + e.exposures_logged, 0)}
                                        </Text>
                                        <Text style={styles.statLabel}>Total Exposures</Text>
                                    </View>
                                </View>
                            </View>
                        )}

                        {isLoading ? (
                            <ActivityIndicator size="large" color="#3494D9" style={{ marginVertical: 60 }} />
                        ) : filteredExperiments.length > 0 ? (
                            <View style={styles.experimentsList}>
                                {filteredExperiments.map(renderExperimentCard)}
                            </View>
                        ) : (
                            <View style={styles.emptyState}>
                                <Ionicons
                                    name={activeFilter === 'completed' ? 'trophy-outline' : 'flask-outline'}
                                    size={48}
                                    color="#666"
                                />
                                <Text style={styles.emptyTitle}>
                                    {activeFilter === 'active'
                                        ? 'No Active Experiments'
                                        : activeFilter === 'completed'
                                            ? 'No Completed Experiments'
                                            : 'No Experiments Yet'}
                                </Text>
                                <Text style={styles.emptySubtitle}>
                                    {activeFilter === 'active'
                                        ? 'Start an experiment from the suggestions to begin tracking.'
                                        : activeFilter === 'completed'
                                            ? 'Complete your active experiments to see results here.'
                                            : 'Explore experiments below to find what works for your glucose.'}
                                </Text>
                            </View>
                        )}

                        {/* Explore New Experiments Section */}
                        {availableTemplates.length > 0 && (
                            <View style={styles.exploreSection}>
                                <Text style={styles.sectionTitle}>Explore New Experiments</Text>
                                <View style={styles.templatesList}>
                                    {availableTemplates.slice(0, 4).map(renderTemplateCard)}
                                </View>
                                {availableTemplates.length > 4 && (
                                    <TouchableOpacity
                                        style={styles.seeAllButton}
                                        onPress={() => router.push('/(tabs)/insights?tab=experiments' as any)}
                                    >
                                        <Text style={styles.seeAllText}>
                                            See All {availableTemplates.length} Experiments
                                        </Text>
                                        <Ionicons name="arrow-forward" size={16} color="#3494D9" />
                                    </TouchableOpacity>
                                )}
                            </View>
                        )}



                        <View style={{ height: 100 }} />
                    </ScrollView>
                </SafeAreaView>
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
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        flex: 1,
        fontFamily: fonts.semiBold,
        fontSize: 18,
        color: '#FFFFFF',
        textAlign: 'center',
    },
    headerSpacer: {
        width: 40,
    },
    filterContainer: {
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 16,
    },
    experimentsList: {
        gap: 12,
    },
    experimentCard: {
        backgroundColor: '#1E2124',
        borderRadius: 16,
        padding: 16,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    cardIcon: {
        fontSize: 28,
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 4,
    },
    statusBadgeText: {
        fontFamily: fonts.semiBold,
        fontSize: 10,
        color: '#FFFFFF',
        letterSpacing: 0.5,
    },
    cardTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 18,
        color: '#FFFFFF',
        marginBottom: 4,
    },
    cardSubtitle: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#878787',
        marginBottom: 12,
    },
    progressSection: {
        marginBottom: 12,
    },
    progressInfo: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    progressText: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: '#AAAAAA',
    },
    progressPct: {
        fontFamily: fonts.semiBold,
        fontSize: 13,
        color: '#3494D9',
    },
    progressBar: {
        height: 6,
        backgroundColor: '#3F4243',
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#3494D9',
        borderRadius: 3,
    },
    completedSection: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
    },
    completedText: {
        fontFamily: fonts.medium,
        fontSize: 13,
        color: '#4CAF50',
    },
    cardFooter: {
        marginTop: 16,
    },
    viewProgressButton: {
        backgroundColor: '#3494D9',
        borderRadius: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        gap: 8,
    },
    viewProgressText: {
        fontFamily: fonts.semiBold,
        fontSize: 14,
        color: '#FFFFFF',
    },
    cardDate: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: '#666',
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 60,
        paddingHorizontal: 40,
    },
    emptyTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 18,
        color: '#FFFFFF',
        marginTop: 16,
        marginBottom: 8,
    },
    emptySubtitle: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#878787',
        textAlign: 'center',
        lineHeight: 20,
    },
    exploreSection: {
        marginTop: 32,
    },
    sectionTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: '#FFFFFF',
        marginBottom: 16,
    },
    templatesList: {
        gap: 12,
    },
    templateCard: {
        backgroundColor: '#1E2124',
        borderRadius: 12,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    templateIcon: {
        fontSize: 28,
    },
    templateContent: {
        flex: 1,
    },
    successIcon: {
        alignItems: 'center',
        justifyContent: 'center',
        width: 32,
        height: 32,
    },
    templateTitle: {
        fontFamily: fonts.medium,
        fontSize: 15,
        color: '#FFFFFF',
        marginBottom: 2,
    },
    templateSubtitle: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: '#878787',
    },
    seeAllButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 16,
        marginTop: 8,
    },
    seeAllText: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: '#3494D9',
    },
    statsCard: {
        backgroundColor: '#1E2124',
        borderRadius: 16,
        padding: 20,
        marginTop: 32,
    },
    statsTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: '#FFFFFF',
        marginBottom: 16,
        textAlign: 'center',
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
    },
    statItem: {
        alignItems: 'center',
        flex: 1,
    },
    statValue: {
        fontFamily: fonts.bold,
        fontSize: 28,
        color: '#3494D9',
    },
    statLabel: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: '#878787',
        marginTop: 4,
    },
    statDivider: {
        width: 1,
        height: 40,
        backgroundColor: '#3F4243',
    },
});

