import { ForestGlassBackground } from '@/components/backgrounds/forest-glass-background';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { LiquidGlassIconButton } from '@/components/ui/LiquidGlassButton';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { COMBBarrier, createUserAction, ReadinessLevel, updateUserProfile } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type HabitTemplate = {
    id: string;
    label: string;
    actionTitle: string;
    actionDescription: string;
    actionType: string;
    metricKey: string;
};

const BARRIERS: { id: COMBBarrier; label: string; description: string }[] = [
    { id: 'capability', label: 'I need clearer know-how', description: 'I know I should change, but I need simpler steps.' },
    { id: 'opportunity', label: 'My environment gets in the way', description: 'My schedule, routine, or surroundings make this hard.' },
    { id: 'motivation', label: 'I struggle with consistency', description: 'I start, then lose momentum.' },
    { id: 'unsure', label: 'Not sure yet', description: 'I want support, but I am still figuring it out.' },
];

const READINESS_OPTIONS: { id: ReadinessLevel; label: string; subtitle: string }[] = [
    { id: 'low', label: 'Low', subtitle: 'Start with very small steps' },
    { id: 'medium', label: 'Medium', subtitle: 'Ready for one structured daily action' },
    { id: 'high', label: 'High', subtitle: 'Ready for consistent action this week' },
];

const HABITS: HabitTemplate[] = [
    {
        id: 'post_meal_walk',
        label: '10-minute walk after one meal',
        actionTitle: 'Post-meal walk',
        actionDescription: 'Add one 10-minute walk after a meal in the next 48 hours.',
        actionType: 'post_meal_walk',
        metricKey: 'steps',
    },
    {
        id: 'sleep_window',
        label: 'Protect a consistent sleep window',
        actionTitle: 'Sleep window',
        actionDescription: 'Aim for a consistent sleep window tonight.',
        actionType: 'sleep_window',
        metricKey: 'sleep_hours',
    },
    {
        id: 'meal_log',
        label: 'Log one intentional meal',
        actionTitle: 'Log your next meal',
        actionDescription: 'Log one meal in the next 24 hours.',
        actionType: 'log_meal',
        metricKey: 'meal_count',
    },
    {
        id: 'activity_block',
        label: 'Add one movement block',
        actionTitle: 'Add movement',
        actionDescription: 'Log one activity session in the next 48 hours.',
        actionType: 'log_activity',
        metricKey: 'steps',
    },
];

export default function FrameworkResetScreen() {
    const { user } = useAuth();
    const [selectedBarrier, setSelectedBarrier] = useState<COMBBarrier | null>(null);
    const [selectedReadiness, setSelectedReadiness] = useState<ReadinessLevel | null>(null);
    const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);
    const [ifThenPlan, setIfThenPlan] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const selectedHabit = useMemo(
        () => HABITS.find(habit => habit.id === selectedHabitId) ?? null,
        [selectedHabitId]
    );

    const canContinue = !!selectedBarrier && !!selectedReadiness && !!selectedHabit && ifThenPlan.trim().length >= 10;

    const handleComplete = async () => {
        if (!user?.id || !selectedBarrier || !selectedReadiness || !selectedHabit) return;

        setIsLoading(true);
        try {
            const nowIso = new Date().toISOString();
            const windowEnd = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

            await updateUserProfile(user.id, {
                experience_variant: 'behavior_v1',
                framework_reset_completed_at: nowIso,
                com_b_barrier: selectedBarrier,
                readiness_level: selectedReadiness,
                primary_habit: selectedHabit.label,
                if_then_plan: ifThenPlan.trim(),
            });

            await createUserAction(user.id, {
                source_insight_id: 'framework-reset',
                title: selectedHabit.actionTitle,
                description: selectedHabit.actionDescription,
                action_type: selectedHabit.actionType,
                action_params: {
                    metricKey: selectedHabit.metricKey,
                    windowHours: 48,
                    ifThenPlan: ifThenPlan.trim(),
                    seededBy: 'framework_reset',
                },
                window_end: windowEnd,
            });

            router.replace('/(tabs)' as never);
        } catch (error) {
            console.error('Error completing framework reset:', error);
            Alert.alert('Could not save setup', 'Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <ForestGlassBackground blurIntensity={18} />
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.headerRow}>
                    <LiquidGlassIconButton size={44} onPress={() => router.back()}>
                        <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
                    </LiquidGlassIconButton>
                    <Text style={styles.headerTitle}>BEHAVIOR RESET</Text>
                    <View style={{ width: 44 }} />
                </View>

                <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                    <Text style={styles.title}>Let&apos;s simplify your plan</Text>
                    <Text style={styles.subtitle}>Pick one focus, one first habit, and one if-then plan.</Text>

                    <Text style={styles.sectionTitle}>What blocks you most right now?</Text>
                    <View style={styles.optionsContainer}>
                        {BARRIERS.map(option => (
                            <AnimatedPressable
                                key={option.id}
                                style={[
                                    styles.optionCard,
                                    selectedBarrier === option.id && styles.optionCardSelected,
                                ]}
                                onPress={() => setSelectedBarrier(option.id)}
                            >
                                <Text style={styles.optionTitle}>{option.label}</Text>
                                <Text style={styles.optionDescription}>{option.description}</Text>
                            </AnimatedPressable>
                        ))}
                    </View>

                    <Text style={styles.sectionTitle}>How ready are you this week?</Text>
                    <View style={styles.rowOptions}>
                        {READINESS_OPTIONS.map(option => (
                            <AnimatedPressable
                                key={option.id}
                                style={[
                                    styles.chip,
                                    selectedReadiness === option.id && styles.chipSelected,
                                ]}
                                onPress={() => setSelectedReadiness(option.id)}
                            >
                                <Text style={styles.chipTitle}>{option.label}</Text>
                                <Text style={styles.chipSubtitle}>{option.subtitle}</Text>
                            </AnimatedPressable>
                        ))}
                    </View>

                    <Text style={styles.sectionTitle}>Pick your first tiny habit</Text>
                    <View style={styles.optionsContainer}>
                        {HABITS.map(habit => (
                            <AnimatedPressable
                                key={habit.id}
                                style={[
                                    styles.optionCard,
                                    selectedHabitId === habit.id && styles.optionCardSelected,
                                ]}
                                onPress={() => setSelectedHabitId(habit.id)}
                            >
                                <Text style={styles.optionTitle}>{habit.label}</Text>
                            </AnimatedPressable>
                        ))}
                    </View>

                    <Text style={styles.sectionTitle}>Your if-then plan</Text>
                    <TextInput
                        value={ifThenPlan}
                        onChangeText={setIfThenPlan}
                        placeholder="If I finish dinner, then I will take a 10-minute walk."
                        placeholderTextColor="#777"
                        style={styles.ifThenInput}
                        multiline
                        numberOfLines={3}
                        textAlignVertical="top"
                    />
                </ScrollView>

                <View style={styles.footer}>
                    <AnimatedPressable
                        style={[styles.primaryButton, !canContinue && styles.primaryButtonDisabled]}
                        onPress={handleComplete}
                        disabled={!canContinue || isLoading}
                    >
                        {isLoading ? (
                            <ActivityIndicator color="#FFFFFF" />
                        ) : (
                            <Text style={styles.primaryButtonText}>Start Behavior-First Plan</Text>
                        )}
                    </AnimatedPressable>
                </View>
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
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    headerTitle: {
        fontFamily: fonts.bold,
        fontSize: 18,
        letterSpacing: 1.2,
        color: Colors.textPrimary,
    },
    content: {
        paddingHorizontal: 16,
        paddingBottom: 20,
    },
    title: {
        fontFamily: fonts.bold,
        fontSize: 26,
        color: Colors.textPrimary,
        marginTop: 8,
    },
    subtitle: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#A3A3A3',
        marginTop: 8,
        marginBottom: 20,
    },
    sectionTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: Colors.textPrimary,
        marginBottom: 10,
        marginTop: 8,
    },
    optionsContainer: {
        gap: 10,
        marginBottom: 14,
    },
    optionCard: {
        backgroundColor: Colors.inputBackgroundSolid,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        padding: 14,
    },
    optionCardSelected: {
        borderColor: '#4CAF50',
        backgroundColor: 'rgba(76, 175, 80, 0.14)',
    },
    optionTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 14,
        color: Colors.textPrimary,
    },
    optionDescription: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: '#BDBDBD',
        marginTop: 4,
    },
    rowOptions: {
        gap: 10,
        marginBottom: 14,
    },
    chip: {
        backgroundColor: Colors.inputBackgroundSolid,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        padding: 12,
    },
    chipSelected: {
        borderColor: Colors.primary,
        backgroundColor: 'rgba(52,148,217,0.16)',
    },
    chipTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 14,
        color: Colors.textPrimary,
    },
    chipSubtitle: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: '#BDBDBD',
        marginTop: 2,
    },
    ifThenInput: {
        backgroundColor: Colors.inputBackgroundSolid,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        borderRadius: 20,
        minHeight: 96,
        padding: 12,
        color: Colors.textPrimary,
        fontFamily: fonts.regular,
        fontSize: 14,
        marginBottom: 8,
    },
    footer: {
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 18,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.08)',
    },
    primaryButton: {
        backgroundColor: Colors.buttonSecondary,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 50,
    },
    primaryButtonDisabled: {
        opacity: 0.5,
    },
    primaryButtonText: {
        fontFamily: fonts.semiBold,
        fontSize: 15,
        color: Colors.textPrimary,
    },
});
