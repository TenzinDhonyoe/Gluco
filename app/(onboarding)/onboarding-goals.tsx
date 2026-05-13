import { ONBOARDING_STEP_KEY } from '@/app/index';
import { OnboardingScreenLayout } from '@/components/onboarding/OnboardingScreenLayout';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { useOnboardingDraft } from '@/hooks/useOnboardingDraft';
import { triggerHaptic } from '@/lib/utils/haptics';
import { updateUserProfile } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    StyleSheet,
    Text,
    View,
} from 'react-native';

const GOALS = [
    'Understand meal patterns',
    'More consistent energy',
    'Better sleep routine',
    'Build a walking habit',
    'Fibre and nutrition',
    'General wellness tracking',
];

const MAX_SELECTIONS = 3;

const GOAL_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
    'Understand meal patterns': 'restaurant-outline',
    'More consistent energy': 'flash-outline',
    'Better sleep routine': 'moon-outline',
    'Build a walking habit': 'walk-outline',
    'Fibre and nutrition': 'leaf-outline',
    'General wellness tracking': 'analytics-outline',
};

export default function OnboardingGoalsScreen() {
    const { draft, updateDraft, isLoaded } = useOnboardingDraft();
    const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const { user, signOut } = useAuth();
    const draftRestored = React.useRef(false);

    // Restore draft
    React.useEffect(() => {
        if (!isLoaded || draftRestored.current) return;
        draftRestored.current = true;
        if (Array.isArray(draft.selectedGoals) && draft.selectedGoals.length > 0) {
            setSelectedGoals(draft.selectedGoals);
        }
        AsyncStorage.setItem(ONBOARDING_STEP_KEY, 'goals').catch(() => null);
    }, [isLoaded, draft]);

    // Save to draft on changes
    React.useEffect(() => {
        if (!draftRestored.current) return;
        const timer = setTimeout(() => {
            updateDraft({ selectedGoals });
        }, 300);
        return () => clearTimeout(timer);
    }, [selectedGoals, updateDraft]);

    const handleToggleGoal = (goal: string) => {
        setSelectedGoals(prev => {
            if (prev.includes(goal)) return prev.filter(g => g !== goal);
            if (prev.length >= MAX_SELECTIONS) return prev;
            return [...prev, goal];
        });
    };

    const handleContinue = async () => {
        if (selectedGoals.length === 0) return;
        triggerHaptic('medium');
        setIsLoading(true);
        try {
            if (user) {
                await updateUserProfile(user.id, { goals: selectedGoals });
            }
            await AsyncStorage.setItem(ONBOARDING_STEP_KEY, 'readiness');
            router.push('/onboarding-readiness' as never);
        } catch {
            Alert.alert('Error', 'Failed to save your goals. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleBack = async () => {
        if (router.canGoBack()) {
            router.back();
        } else {
            await signOut();
            router.replace('/');
        }
    };

    const isContinueEnabled = selectedGoals.length > 0;

    const firstName = draft.firstName?.trim();
    const titleText = firstName ? `What matters most to you, ${firstName}?` : 'What matters most to you?';

    return (
        <OnboardingScreenLayout
            currentStep={2}
            title={titleText}
            subtitle="Pick up to three. We'll shape your daily experience around these."
            onBack={handleBack}
            bottomContent={
                <AnimatedPressable
                    style={[styles.continueButton, !isContinueEnabled && styles.continueButtonDisabled]}
                    onPress={handleContinue}
                    disabled={!isContinueEnabled || isLoading}
                >
                    {isLoading ? (
                        <ActivityIndicator color={Colors.buttonActionText} />
                    ) : (
                        <Text style={[styles.continueButtonText, !isContinueEnabled && styles.continueButtonTextDisabled]}>
                            Continue
                        </Text>
                    )}
                </AnimatedPressable>
            }
        >
                        <View style={styles.goalsContainer}>
                            {GOALS.map((goal) => {
                                const isSelected = selectedGoals.includes(goal);
                                const isDisabled = !isSelected && selectedGoals.length >= MAX_SELECTIONS;
                                const iconName = GOAL_ICONS[goal] || 'ellipse-outline';
                                return (
                                    <AnimatedPressable
                                        key={goal}
                                        style={[
                                            styles.goalItem,
                                            isSelected && styles.goalItemSelected,
                                            isDisabled && styles.goalItemDisabled,
                                        ]}
                                        onPress={() => handleToggleGoal(goal)}
                                        disabled={isDisabled}
                                    >
                                        <Ionicons
                                            name={iconName}
                                            size={20}
                                            color={isSelected ? Colors.primary : Colors.textSecondary}
                                            style={styles.goalIcon}
                                        />
                                        <Text style={[
                                            styles.goalItemText,
                                            isSelected && styles.goalItemTextSelected,
                                            isDisabled && styles.goalItemTextDisabled,
                                        ]}>
                                            {goal}
                                        </Text>
                                        {isSelected ? (
                                            <Ionicons name="checkmark-circle" size={24} color={Colors.primary} />
                                        ) : (
                                            <View style={styles.checkmarkPlaceholder} />
                                        )}
                                    </AnimatedPressable>
                                );
                            })}
                        </View>
        </OnboardingScreenLayout>
    );
}

const styles = StyleSheet.create({
    goalsContainer: {
        gap: 12,
    },
    goalItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: Colors.inputBackground,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 16,
        borderWidth: 1,
        borderColor: Colors.borderCard,
    },
    goalItemSelected: {
        backgroundColor: Colors.primaryLight,
        borderColor: Colors.primary,
    },
    goalItemDisabled: {
        opacity: 0.5,
    },
    goalIcon: {
        marginRight: 4,
    },
    goalItemText: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: Colors.textPrimary,
        flex: 1,
    },
    goalItemTextSelected: {
        color: Colors.textPrimary,
    },
    goalItemTextDisabled: {
        color: Colors.textTertiary,
    },
    checkmarkPlaceholder: {
        width: 24,
        height: 24,
    },
    continueButton: {
        width: '100%',
        height: 48,
        backgroundColor: Colors.buttonAction,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    continueButtonDisabled: {
        backgroundColor: Colors.buttonDisabled,
    },
    continueButtonText: {
        fontFamily: fonts.medium,
        fontSize: 15,
        color: Colors.buttonActionText,
    },
    continueButtonTextDisabled: {
        color: Colors.buttonDisabledText,
    },
});
