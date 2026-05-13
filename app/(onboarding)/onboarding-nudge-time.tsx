import { ONBOARDING_STEP_KEY } from '@/app/index';
import { OnboardingScreenLayout } from '@/components/onboarding/OnboardingScreenLayout';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { useOnboardingDraft } from '@/hooks/useOnboardingDraft';
import { triggerHaptic } from '@/lib/utils/haptics';
import { PromptWindow, updateUserProfile } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

const PROMPT_WINDOWS: { id: PromptWindow; label: string; subtitle: string }[] = [
    { id: 'morning', label: 'Morning', subtitle: 'Start-day planning cue' },
    { id: 'midday', label: 'Midday', subtitle: 'Lunchtime behavior nudge' },
    { id: 'evening', label: 'Evening', subtitle: 'Wrap-up and prep cue' },
];

export default function OnboardingNudgeTimeScreen() {
    const { draft, updateDraft, isLoaded } = useOnboardingDraft();
    const [promptWindow, setPromptWindow] = useState<PromptWindow>('midday');
    const [isLoading, setIsLoading] = useState(false);
    const { user } = useAuth();
    const draftRestored = React.useRef(false);

    React.useEffect(() => {
        if (!isLoaded || draftRestored.current) return;
        draftRestored.current = true;
        if (draft.promptWindow) setPromptWindow(draft.promptWindow as PromptWindow);
        AsyncStorage.setItem(ONBOARDING_STEP_KEY, 'nudge-time').catch(() => null);
    }, [isLoaded, draft]);

    React.useEffect(() => {
        if (!draftRestored.current) return;
        updateDraft({ promptWindow });
    }, [promptWindow, updateDraft]);

    const handleContinue = async () => {
        triggerHaptic('medium');
        setIsLoading(true);
        try {
            if (user) {
                await updateUserProfile(user.id, { prompt_window: promptWindow });
            }
            await AsyncStorage.setItem(ONBOARDING_STEP_KEY, 'coaching');
            router.push('/onboarding-coaching' as never);
        } catch {
            Alert.alert('Error', 'Failed to save your answer. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleBack = () => router.back();

    return (
        <OnboardingScreenLayout
            currentStep={7}
            title="When should we nudge you?"
            subtitle="Pick the window that fits your daily rhythm best."
            onBack={handleBack}
            bottomContent={
                <TouchableOpacity
                    style={styles.continueButton}
                    onPress={handleContinue}
                    activeOpacity={0.8}
                    disabled={isLoading}
                >
                    {isLoading ? (
                        <ActivityIndicator color={Colors.buttonActionText} />
                    ) : (
                        <Text style={styles.continueButtonText}>Continue</Text>
                    )}
                </TouchableOpacity>
            }
        >
            <View style={styles.options}>
                {PROMPT_WINDOWS.map(option => {
                    const isSelected = promptWindow === option.id;
                    return (
                        <TouchableOpacity
                            key={option.id}
                            style={[styles.card, isSelected && styles.cardSelected]}
                            onPress={() => { triggerHaptic(); setPromptWindow(option.id); }}
                            activeOpacity={0.75}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: isSelected }}
                        >
                            <Text style={styles.cardTitle}>{option.label}</Text>
                            <Text style={styles.cardSubtitle}>{option.subtitle}</Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </OnboardingScreenLayout>
    );
}

const styles = StyleSheet.create({
    options: {
        gap: 12,
    },
    card: {
        borderRadius: 12,
        borderWidth: 1,
        borderColor: Colors.borderCard,
        backgroundColor: Colors.inputBackground,
        paddingVertical: 16,
        paddingHorizontal: 18,
    },
    cardSelected: {
        borderColor: Colors.primary,
        backgroundColor: Colors.primaryLight,
    },
    cardTitle: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: Colors.textPrimary,
    },
    cardSubtitle: {
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
    continueButtonText: {
        fontFamily: fonts.medium,
        fontSize: 15,
        color: Colors.buttonActionText,
    },
});
