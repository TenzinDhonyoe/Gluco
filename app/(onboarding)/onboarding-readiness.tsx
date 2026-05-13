import { ONBOARDING_STEP_KEY } from '@/app/index';
import { OnboardingScreenLayout } from '@/components/onboarding/OnboardingScreenLayout';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { useOnboardingDraft } from '@/hooks/useOnboardingDraft';
import { triggerHaptic } from '@/lib/utils/haptics';
import { ReadinessLevel, updateUserProfile } from '@/lib/supabase';
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

const READINESS_OPTIONS: { id: ReadinessLevel; label: string; subtitle: string }[] = [
    { id: 'low', label: 'Low readiness', subtitle: 'Easing in. Small steps feel right.' },
    { id: 'medium', label: 'Medium readiness', subtitle: 'Open to building a steady routine.' },
    { id: 'high', label: 'High readiness', subtitle: 'Motivated and ready to commit.' },
];

export default function OnboardingReadinessScreen() {
    const { draft, updateDraft, isLoaded } = useOnboardingDraft();
    const [selectedReadiness, setSelectedReadiness] = useState<ReadinessLevel | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const { user } = useAuth();
    const draftRestored = React.useRef(false);

    React.useEffect(() => {
        if (!isLoaded || draftRestored.current) return;
        draftRestored.current = true;
        if (draft.selectedReadiness) {
            setSelectedReadiness(draft.selectedReadiness as ReadinessLevel);
        }
        AsyncStorage.setItem(ONBOARDING_STEP_KEY, 'readiness').catch(() => null);
    }, [isLoaded, draft]);

    React.useEffect(() => {
        if (!draftRestored.current) return;
        updateDraft({ selectedReadiness });
    }, [selectedReadiness, updateDraft]);

    const handleContinue = async () => {
        if (!selectedReadiness) return;
        triggerHaptic('medium');
        setIsLoading(true);
        try {
            if (user) {
                await updateUserProfile(user.id, { readiness_level: selectedReadiness });
            }
            await AsyncStorage.setItem(ONBOARDING_STEP_KEY, 'body');
            router.push('/onboarding-body' as never);
        } catch {
            Alert.alert('Error', 'Failed to save your answer. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleBack = () => router.back();

    const firstName = draft.firstName?.trim();

    return (
        <OnboardingScreenLayout
            currentStep={3}
            title={firstName ? `How ready are you this week, ${firstName}?` : 'How ready are you this week?'}
            subtitle="There's no wrong answer. We'll set the right pace for you."
            onBack={handleBack}
            bottomContent={
                <AnimatedPressable
                    style={[styles.continueButton, !selectedReadiness && styles.continueButtonDisabled]}
                    onPress={handleContinue}
                    disabled={!selectedReadiness || isLoading}
                >
                    {isLoading ? (
                        <ActivityIndicator color={Colors.buttonActionText} />
                    ) : (
                        <Text style={[styles.continueButtonText, !selectedReadiness && styles.continueButtonTextDisabled]}>
                            Continue
                        </Text>
                    )}
                </AnimatedPressable>
            }
        >
            <View style={styles.optionsContainer}>
                {READINESS_OPTIONS.map(option => {
                    const isSelected = selectedReadiness === option.id;
                    return (
                        <AnimatedPressable
                            key={option.id}
                            style={[styles.optionCard, isSelected && styles.optionCardSelected]}
                            onPress={() => { triggerHaptic(); setSelectedReadiness(option.id); }}
                        >
                            <Text style={styles.optionTitle}>{option.label}</Text>
                            <Text style={styles.optionSubtitle}>{option.subtitle}</Text>
                        </AnimatedPressable>
                    );
                })}
            </View>
        </OnboardingScreenLayout>
    );
}

const styles = StyleSheet.create({
    optionsContainer: {
        gap: 12,
    },
    optionCard: {
        borderRadius: 12,
        borderWidth: 1,
        borderColor: Colors.borderCard,
        backgroundColor: Colors.inputBackground,
        paddingVertical: 16,
        paddingHorizontal: 18,
    },
    optionCardSelected: {
        borderColor: Colors.primary,
        backgroundColor: Colors.primaryLight,
    },
    optionTitle: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: Colors.textPrimary,
    },
    optionSubtitle: {
        marginTop: 4,
        fontFamily: fonts.regular,
        fontSize: 14,
        color: Colors.textSecondary,
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
