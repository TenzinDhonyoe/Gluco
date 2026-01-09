import { Images } from '@/constants/Images';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import {
    ExperimentVariant,
    getExperimentVariants,
    getUserExperiments,
    UserExperiment,
} from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
    Image,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

export function ActiveExperimentWidget() {
    const { user } = useAuth();
    const router = useRouter();
    const [experiment, setExperiment] = useState<UserExperiment | null>(null);
    const [variants, setVariants] = useState<ExperimentVariant[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchActiveExperiment = async () => {
        if (!user) return;
        try {
            // Fetch active experiments
            const experiments = await getUserExperiments(user.id, 'active');
            if (experiments && experiments.length > 0) {
                // Determine the most relevant one (newest?)
                const active = experiments[0];
                setExperiment(active);

                // Fetch variants
                if (active.experiment_templates) {
                    const vars = await getExperimentVariants(active.experiment_templates.id);
                    setVariants(vars || []);
                }
            } else {
                setExperiment(null);
            }
        } catch (error) {
            console.error('Error fetching active experiment widget:', error);
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            fetchActiveExperiment();
        }, [user])
    );

    // Refresh when screen focuses? (Ideally handled by parent or query invalidation)
    // For now, simpler.

    if (loading) return null; // Don't show loader on dashboard to avoid flicker? Or minimal placeholder?
    if (!experiment || !experiment.experiment_templates) return null;

    const template = experiment.experiment_templates;
    const protocol = template.protocol || {};
    const requiredExposures = (protocol.exposures_per_variant || 5) * 2;
    const progress = experiment.exposures_logged || 0;

    // Streak calculation (mock for now, or simple logic)
    // Needs logic to check consecutive days. For MVP, show generic "In Progress" or "Day X"
    const startDate = new Date(experiment.created_at);
    const dayNumber = Math.ceil((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    const handleLog = (variant: ExperimentVariant) => {
        // Navigate to detail with params to open modal
        router.push({
            pathname: '/experiment-detail',
            params: {
                id: experiment.id,
                openExposureModal: 'true',
                variantId: variant.id
            }
        });
    };

    const handlePressHeader = () => {
        router.push({
            pathname: '/experiment-detail',
            params: { id: experiment.id }
        });
    };

    return (
        <View style={styles.container}>
            <TouchableOpacity onPress={handlePressHeader} activeOpacity={0.8}>
                <View style={styles.header}>
                    <View style={styles.headerContent}>
                        <View style={styles.mascotContainer}>
                            <Image source={Images.mascots.thinking} style={styles.mascotImage} />
                        </View>
                        <View style={styles.headerTextContainer}>
                            <Text style={styles.label}>ACTIVE EXPERIMENT • DAY {dayNumber}</Text>
                            <Text style={styles.title} numberOfLines={1}>{template.title}</Text>
                        </View>
                    </View>
                    <View style={styles.progressBadge}>
                        <Text style={styles.progressText}>{progress} / {requiredExposures}</Text>
                    </View>
                </View>
            </TouchableOpacity>

            <View style={styles.actions}>
                {variants.slice(0, 2).map((variant, index) => (
                    <TouchableOpacity
                        key={variant.id}
                        style={[styles.actionButton, index === 1 && styles.actionButtonRight]}
                        onPress={() => handleLog(variant)}
                        activeOpacity={0.7}
                    >
                        <View style={styles.iconCircle}>
                            <Ionicons name="add" size={20} color="#FFFFFF" />
                        </View>
                        <Text style={styles.actionText} numberOfLines={1}>Log {variant.name}</Text>
                    </TouchableOpacity>
                ))}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#1E1E1E', // Slightly lighter than background
        borderRadius: 16,
        padding: 16,
        marginBottom: 16, // Spacing from other elements
        borderWidth: 1,
        borderColor: '#2A2D30',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 16,
    },
    label: {
        fontSize: 11,
        fontFamily: fonts.bold,
        color: '#3494D9',
        letterSpacing: 0.5,
        marginBottom: 4,
    },
    headerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        gap: 12,
    },
    headerTextContainer: {
        flex: 1,
    },
    mascotContainer: {
        width: 60,
        height: 60,
        justifyContent: 'center',
        alignItems: 'center',
    },
    mascotImage: {
        width: 56,
        height: 56,
        resizeMode: 'contain',
    },
    title: {
        fontSize: 16,
        fontFamily: fonts.semiBold,
        color: '#FFFFFF',
        maxWidth: 220,
    },
    progressBadge: {
        backgroundColor: 'rgba(52, 148, 217, 0.15)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    progressText: {
        fontSize: 12,
        fontFamily: fonts.medium,
        color: '#3494D9',
    },
    actions: {
        flexDirection: 'row',
        gap: 12,
    },
    actionButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#2A2D30',
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderRadius: 12,
        gap: 8,
    },
    actionButtonRight: {
        // Different style for B? Or maybe same
    },
    iconCircle: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#3494D9',
        justifyContent: 'center',
        alignItems: 'center',
    },
    actionText: {
        fontSize: 14,
        fontFamily: fonts.semiBold,
        color: '#FFFFFF',
        flex: 1,
    },
});
