import { ONBOARDING_STEP_KEY } from '@/app/index';
import { OnboardingScreenLayout } from '@/components/onboarding/OnboardingScreenLayout';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { triggerHaptic } from '@/lib/utils/haptics';
import { useOnboardingDraft } from '@/hooks/useOnboardingDraft';
import { CoachingStyle, updateUserProfile } from '@/lib/supabase';
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

interface CoachingOption {
    id: CoachingStyle;
    title: string;
    subtitle: string;
}

const COACHING_OPTIONS: CoachingOption[] = [
    { id: 'light', title: 'Light nudges', subtitle: 'Occasional tips when something stands out' },
    { id: 'balanced', title: 'Balanced', subtitle: 'Daily insights and weekly summaries' },
    { id: 'structured', title: 'More structured', subtitle: 'Detailed coaching with regular check-ins' },
];

export default function OnboardingCoachingScreen() {
    const { draft, updateDraft, isLoaded } = useOnboardingDraft();
    const [selectedStyle, setSelectedStyle] = useState<CoachingStyle>('balanced');
    const [isLoading, setIsLoading] = useState(false);
    const { user } = useAuth();
    const draftRestored = React.useRef(false);

    // Restore draft
    React.useEffect(() => {
        if (!isLoaded || draftRestored.current) return;
        draftRestored.current = true;
        if (draft.coachingStyle) setSelectedStyle(draft.coachingStyle as CoachingStyle);
        AsyncStorage.setItem(ONBOARDING_STEP_KEY, 'coaching').catch(() => null);
    }, [isLoaded, draft]);

    // Save to draft on changes
    React.useEffect(() => {
        if (!draftRestored.current) return;
        const timer = setTimeout(() => {
            updateDraft({ coachingStyle: selectedStyle });
        }, 300);
        return () => clearTimeout(timer);
    }, [selectedStyle, updateDraft]);

    const handleContinue = async () => {
        triggerHaptic('medium');
        setIsLoading(true);
        try {
            if (user) {
                await updateUserProfile(user.id, { coaching_style: selectedStyle });
            }
            await AsyncStorage.setItem(ONBOARDING_STEP_KEY, 'barrier');
            router.push('/onboarding-barrier' as never);
        } catch {
            Alert.alert('Error', 'Failed to save your preferences. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleBack = () => {
        router.back();
    };

    const firstName = draft.firstName;

    return (
        <OnboardingScreenLayout
            currentStep={8}
            title={`How hands-on should we be${firstName ? `, ${firstName}` : ''}?`}
            subtitle="Choose what feels right. You can change this anytime."
            onBack={handleBack}
            hasKeyboardInput={false}
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
            <View style={styles.optionsContainer}>
                {COACHING_OPTIONS.map((option) => {
                    const isSelected = selectedStyle === option.id;
                    return (
                        <TouchableOpacity
                            key={option.id}
                            style={[styles.optionItem, isSelected && styles.optionItemSelected]}
                            onPress={() => { triggerHaptic(); setSelectedStyle(option.id); }}
                            activeOpacity={0.7}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: isSelected }}
                        >
                            <View style={styles.optionContent}>
                                <Text style={styles.optionTitle}>{option.title}</Text>
                                <Text style={styles.optionSubtitle}>{option.subtitle}</Text>
                            </View>
                            <View style={[styles.radioOuter, isSelected && styles.radioOuterSelected]}>
                                {isSelected && <View style={styles.radioInner} />}
                            </View>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </OnboardingScreenLayout>
    );
}

const styles = StyleSheet.create({
    optionsContainer: {
        gap: 12,
        marginBottom: 32,
    },
    optionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: Colors.inputBackground,
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: Colors.borderCard,
    },
    optionItemSelected: {
        backgroundColor: Colors.primaryLight,
        borderColor: Colors.primary,
    },
    optionContent: {
        flex: 1,
        marginRight: 12,
    },
    optionTitle: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: Colors.textPrimary,
        marginBottom: 4,
    },
    optionSubtitle: {
        fontFamily: fonts.regular,
        fontSize: 14,
        lineHeight: 14 * 1.4,
        color: Colors.textTertiary,
    },
    radioOuter: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: Colors.textTertiary,
        justifyContent: 'center',
        alignItems: 'center',
    },
    radioOuterSelected: {
        borderColor: Colors.buttonPrimary,
    },
    radioInner: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: Colors.buttonPrimary,
    },
    behaviorSection: {
        marginBottom: 22,
    },
    sectionHeading: {
        fontFamily: fonts.medium,
        fontSize: 12,
        color: Colors.textSecondary,
        letterSpacing: 0.8,
        marginBottom: 10,
    },
    barrierOptions: {
        gap: 10,
    },
    barrierCard: {
        borderRadius: 12,
        borderWidth: 1,
        borderColor: Colors.borderCard,
        backgroundColor: Colors.inputBackground,
        paddingVertical: 12,
        paddingHorizontal: 14,
    },
    barrierCardSelected: {
        borderColor: Colors.primary,
        backgroundColor: Colors.primaryLight,
    },
    barrierTitle: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: Colors.textPrimary,
    },
    barrierSubtitle: {
        marginTop: 2,
        fontFamily: fonts.regular,
        fontSize: 12,
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
