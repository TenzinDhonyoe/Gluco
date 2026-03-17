import { MetabolicScoreRing } from '@/components/charts/MetabolicScoreRing';
import { Colors } from '@/constants/Colors';
import { fonts } from '@/hooks/useFonts';
import { triggerHaptic } from '@/lib/utils/haptics';
import { UserExperiment, updateUserExperimentStatus } from '@/lib/supabase';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface ActiveExperimentCardProps {
    experiment: UserExperiment;
    onStopped?: () => void;
}

export function ActiveExperimentCard({ experiment, onStopped }: ActiveExperimentCardProps) {
    const [stopping, setStopping] = useState(false);
    const template = experiment.experiment_templates;
    if (!template) return null;

    const protocol = template.protocol || {};
    const durationDays = protocol.duration_days || 7;
    const startDate = experiment.start_at ? new Date(experiment.start_at) : new Date(experiment.created_at);
    const dayNumber = Math.max(1, Math.ceil((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
    const clampedDay = Math.min(dayNumber, durationDays);
    const progressPct = Math.round((clampedDay / durationDays) * 100);

    const handlePress = () => {
        triggerHaptic();
        router.push({ pathname: '/experiment-detail', params: { id: experiment.id } });
    };

    const handleStop = () => {
        triggerHaptic('medium');
        Alert.alert(
            'Stop experiment?',
            `This will end "${template.title}" early. You can always start it again later.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Stop',
                    style: 'destructive',
                    onPress: async () => {
                        setStopping(true);
                        const ok = await updateUserExperimentStatus(experiment.id, 'archived');
                        setStopping(false);
                        if (ok) {
                            onStopped?.();
                        } else {
                            Alert.alert('Error', 'Could not stop the experiment. Please try again.');
                        }
                    },
                },
            ]
        );
    };

    return (
        <View style={styles.card}>
            <View style={styles.topRow}>
                <View style={styles.leftContent}>
                    <View style={styles.activePill}>
                        <Text style={styles.activePillText}>Active</Text>
                    </View>
                    <Text style={styles.title} numberOfLines={2}>{template.title}</Text>
                    <Text style={styles.subtitle}>
                        Day {clampedDay} of {durationDays} · {template.category}
                    </Text>
                </View>
                <MetabolicScoreRing
                    size={56}
                    score={progressPct}
                    visualPreset="hero_vivid"
                    showInnerValue={false}
                />
            </View>
            <View style={styles.buttonRow}>
                <TouchableOpacity style={styles.stopButton} onPress={handleStop} activeOpacity={0.7} disabled={stopping}>
                    <Text style={styles.stopButtonText}>{stopping ? 'Stopping...' : 'Stop'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.detailButton} onPress={handlePress} activeOpacity={0.7}>
                    <Text style={styles.detailButtonText}>View Details →</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: Colors.backgroundCard,
        borderRadius: 18,
        padding: 16,
        borderWidth: 1,
        borderColor: Colors.borderCard,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
        gap: 14,
    },
    topRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
    },
    leftContent: {
        flex: 1,
        gap: 4,
    },
    activePill: {
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: 'rgba(52, 211, 153, 0.12)',
    },
    activePillText: {
        fontFamily: fonts.semiBold,
        fontSize: 11,
        color: Colors.success,
        letterSpacing: 0.3,
    },
    title: {
        fontFamily: fonts.bold,
        fontSize: 18,
        color: Colors.textPrimary,
        marginTop: 4,
    },
    subtitle: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: Colors.textSecondary,
        textTransform: 'capitalize',
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 10,
    },
    stopButton: {
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 16,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.25)',
        backgroundColor: 'rgba(239, 68, 68, 0.06)',
    },
    stopButtonText: {
        fontFamily: fonts.semiBold,
        fontSize: 14,
        color: Colors.error,
    },
    detailButton: {
        flex: 1,
        backgroundColor: Colors.textPrimary,
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: 'center',
    },
    detailButtonText: {
        fontFamily: fonts.semiBold,
        fontSize: 14,
        color: '#FFFFFF',
    },
});
