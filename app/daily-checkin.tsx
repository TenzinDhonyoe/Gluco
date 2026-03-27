import { CheckinCompletion } from '@/components/celebrations/CheckinCompletion';
import { LiquidGlassIconButton } from '@/components/ui/LiquidGlassButton';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { useDailyCheckin } from '@/hooks/useDailyCheckin';
import type { DailyCheckinMealsLogged, DailyCheckinMoodTag } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useState } from 'react';
import {
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

// ============================================
// ENERGY FACES
// ============================================

const ENERGY_OPTIONS = [
    { level: 1, emoji: '\ud83d\ude29', label: 'Very Low' },
    { level: 2, emoji: '\ud83d\ude14', label: 'Low' },
    { level: 3, emoji: '\ud83d\ude10', label: 'Okay' },
    { level: 4, emoji: '\ud83d\ude42', label: 'Good' },
    { level: 5, emoji: '\ud83d\ude04', label: 'Great' },
];

const MOOD_OPTIONS: { tag: DailyCheckinMoodTag; label: string }[] = [
    { tag: 'great', label: 'Great' },
    { tag: 'good', label: 'Good' },
    { tag: 'okay', label: 'Okay' },
    { tag: 'low', label: 'Low' },
];

const MEAL_KEYS: (keyof DailyCheckinMealsLogged)[] = ['breakfast', 'lunch', 'dinner', 'snacks'];

const MEAL_LABELS: Record<keyof DailyCheckinMealsLogged, string> = {
    breakfast: 'Breakfast',
    lunch: 'Lunch',
    dinner: 'Dinner',
    snacks: 'Snacks',
};

// ============================================
// SCREEN
// ============================================

export default function DailyCheckinScreen() {
    const router = useRouter();
    const { user, profile } = useAuth();
    const { submit, saving } = useDailyCheckin();

    const [energy, setEnergy] = useState<number | null>(null);
    const [meals, setMeals] = useState<DailyCheckinMealsLogged>({
        breakfast: false,
        lunch: false,
        dinner: false,
        snacks: false,
    });
    const [mood, setMood] = useState<DailyCheckinMoodTag | null>(null);
    const [showCompletion, setShowCompletion] = useState(false);

    const showGlucose = profile?.tracking_mode === 'manual_glucose_optional'
        || profile?.tracking_mode === 'glucose_tracking';
    const [glucose] = useState<string>('');
    const [glucoseExpanded, setGlucoseExpanded] = useState(false);

    const hasAnyInput = energy !== null || mood !== null ||
        Object.values(meals).some(Boolean) ||
        (glucoseExpanded && glucose.length > 0);

    const handleEnergySelect = useCallback((level: number) => {
        if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setEnergy(level);
    }, []);

    const handleMealToggle = useCallback((key: keyof DailyCheckinMealsLogged) => {
        if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setMeals(prev => ({ ...prev, [key]: !prev[key] }));
    }, []);

    const handleMoodSelect = useCallback((tag: DailyCheckinMoodTag) => {
        if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setMood(tag);
    }, []);

    const handleSubmit = async () => {
        if (!user?.id || !hasAnyInput) return;

        const result = await submit({
            energy_level: energy,
            meals_logged: meals,
            mood_tag: mood,
            glucose_reading: glucose ? parseFloat(glucose) : null,
        });

        if (result) {
            setShowCompletion(true);
        }
    };

    const handleCompletionDismiss = useCallback(() => {
        setShowCompletion(false);
        router.back();
    }, [router]);

    return (
        <View style={styles.container}>
            <StatusBar style="dark" />
            <SafeAreaView style={styles.safeArea}>
                {/* Header */}
                <View style={styles.header}>
                    <LiquidGlassIconButton size={44} onPress={() => router.back()}>
                        <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
                    </LiquidGlassIconButton>
                    <Text style={styles.headerTitle}>Daily Check-in</Text>
                    <View style={{ width: 44 }} />
                </View>

                <ScrollView
                    style={styles.scrollView}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Energy Section */}
                    <View style={styles.section}>
                        <Text style={styles.sectionLabel}>How's your energy?</Text>
                        <View style={styles.energyRow}>
                            {ENERGY_OPTIONS.map(opt => (
                                <TouchableOpacity
                                    key={opt.level}
                                    style={[
                                        styles.energyButton,
                                        energy === opt.level && styles.energyButtonSelected,
                                    ]}
                                    onPress={() => handleEnergySelect(opt.level)}
                                    activeOpacity={0.7}
                                >
                                    <Text style={styles.energyEmoji}>{opt.emoji}</Text>
                                    <Text style={[
                                        styles.energyLabel,
                                        energy === opt.level && styles.energyLabelSelected,
                                    ]}>
                                        {opt.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    {/* Meals Section */}
                    <View style={styles.section}>
                        <Text style={styles.sectionLabel}>Meals today</Text>
                        <View style={styles.pillRow}>
                            {MEAL_KEYS.map(key => (
                                <TouchableOpacity
                                    key={key}
                                    style={[
                                        styles.pillButton,
                                        meals[key] && styles.pillButtonSelected,
                                    ]}
                                    onPress={() => handleMealToggle(key)}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[
                                        styles.pillText,
                                        meals[key] && styles.pillTextSelected,
                                    ]}>
                                        {MEAL_LABELS[key]}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    {/* Mood Section */}
                    <View style={styles.section}>
                        <Text style={styles.sectionLabel}>Overall mood</Text>
                        <View style={styles.pillRow}>
                            {MOOD_OPTIONS.map(opt => (
                                <TouchableOpacity
                                    key={opt.tag}
                                    style={[
                                        styles.pillButton,
                                        mood === opt.tag && styles.pillButtonSelected,
                                    ]}
                                    onPress={() => handleMoodSelect(opt.tag)}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[
                                        styles.pillText,
                                        mood === opt.tag && styles.pillTextSelected,
                                    ]}>
                                        {opt.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    {/* Glucose Section (collapsed by default) */}
                    {showGlucose && (
                        <View style={styles.section}>
                            {!glucoseExpanded ? (
                                <TouchableOpacity
                                    style={styles.expandButton}
                                    onPress={() => setGlucoseExpanded(true)}
                                    activeOpacity={0.7}
                                >
                                    <Ionicons name="add-circle-outline" size={18} color={Colors.textSecondary} />
                                    <Text style={styles.expandText}>Add glucose reading</Text>
                                </TouchableOpacity>
                            ) : (
                                <View>
                                    <Text style={styles.sectionLabel}>Glucose reading</Text>
                                    <View style={styles.glucoseInputRow}>
                                        <View style={styles.glucoseInputContainer}>
                                            <TouchableOpacity
                                                style={styles.glucoseInput}
                                                activeOpacity={1}
                                            >
                                                <Text style={[
                                                    styles.glucoseInputText,
                                                    !glucose && styles.glucosePlaceholder,
                                                ]}>
                                                    {glucose || 'Enter value'}
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                        <Text style={styles.glucoseUnit}>
                                            {profile?.glucose_unit || 'mmol/L'}
                                        </Text>
                                    </View>
                                </View>
                            )}
                        </View>
                    )}

                    {/* Bottom spacer for button */}
                    <View style={{ height: 100 }} />
                </ScrollView>

                {/* Done Button */}
                <View style={styles.buttonContainer}>
                    <TouchableOpacity
                        style={[styles.doneButton, !hasAnyInput && styles.doneButtonDisabled]}
                        onPress={handleSubmit}
                        disabled={!hasAnyInput || saving}
                        activeOpacity={0.8}
                    >
                        <Text style={styles.doneButtonText}>
                            {saving ? 'Saving...' : 'Done'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>

            {/* Completion animation */}
            {showCompletion && (
                <CheckinCompletion onDismiss={handleCompletionDismiss} />
            )}
        </View>
    );
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.backgroundSolid,
    },
    safeArea: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    headerTitle: {
        fontSize: 18,
        fontFamily: fonts.semiBold,
        color: Colors.textPrimary,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 8,
    },
    section: {
        marginBottom: 28,
    },
    sectionLabel: {
        fontSize: 16,
        fontFamily: fonts.semiBold,
        color: Colors.textPrimary,
        marginBottom: 14,
    },
    // Energy faces
    energyRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    energyButton: {
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 8,
        borderRadius: 14,
        minWidth: 56,
        borderWidth: 1.5,
        borderColor: 'transparent',
    },
    energyButtonSelected: {
        backgroundColor: Colors.successLight,
        borderColor: Colors.success,
    },
    energyEmoji: {
        fontSize: 28,
        marginBottom: 4,
        fontFamily: Platform.OS === 'ios' ? 'System' : undefined,
    },
    energyLabel: {
        fontSize: 11,
        fontFamily: fonts.medium,
        color: Colors.textSecondary,
    },
    energyLabelSelected: {
        color: Colors.success,
        fontFamily: fonts.semiBold,
    },
    // Pill buttons (meals + mood)
    pillRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    pillButton: {
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 12,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: Colors.borderLight,
    },
    pillButtonSelected: {
        backgroundColor: Colors.successLight,
        borderColor: Colors.success,
    },
    pillText: {
        fontSize: 15,
        fontFamily: fonts.medium,
        color: Colors.textPrimary,
    },
    pillTextSelected: {
        color: Colors.success,
        fontFamily: fonts.semiBold,
    },
    // Glucose
    expandButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 8,
    },
    expandText: {
        fontSize: 14,
        fontFamily: fonts.medium,
        color: Colors.textSecondary,
    },
    glucoseInputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    glucoseInputContainer: {
        flex: 1,
    },
    glucoseInput: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderWidth: 1,
        borderColor: Colors.borderLight,
    },
    glucoseInputText: {
        fontSize: 16,
        fontFamily: fonts.medium,
        color: Colors.textPrimary,
    },
    glucosePlaceholder: {
        color: Colors.textSecondary,
    },
    glucoseUnit: {
        fontSize: 14,
        fontFamily: fonts.medium,
        color: Colors.textSecondary,
    },
    // Done button
    buttonContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 20,
        paddingBottom: 34,
        paddingTop: 16,
        backgroundColor: 'rgba(242, 242, 247, 0.95)',
        borderTopWidth: 1,
        borderTopColor: Colors.borderLight,
    },
    doneButton: {
        backgroundColor: Colors.buttonAction,
        borderRadius: 16,
        paddingVertical: 16,
        alignItems: 'center',
    },
    doneButtonDisabled: {
        backgroundColor: '#E5E5EA',
    },
    doneButtonText: {
        fontSize: 16,
        fontFamily: fonts.semiBold,
        color: '#FFFFFF',
    },
});
