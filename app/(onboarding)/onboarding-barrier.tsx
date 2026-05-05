import { ONBOARDING_STEP_KEY } from '@/app/index';
import { OnboardingScreenLayout } from '@/components/onboarding/OnboardingScreenLayout';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { useOnboardingDraft } from '@/hooks/useOnboardingDraft';
import { triggerHaptic } from '@/lib/utils/haptics';
import { COMBBarrier, updateUserProfile } from '@/lib/supabase';
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

const BARRIER_OPTIONS: { id: COMBBarrier; label: string; subtitle: string }[] = [
    { id: 'capability', label: 'Need simpler guidance', subtitle: 'Clearer and easier instructions help me act.' },
    { id: 'opportunity', label: 'Environment gets in the way', subtitle: 'Schedule and surroundings make consistency hard.' },
    { id: 'motivation', label: 'Staying consistent is hard', subtitle: 'I start well but struggle to keep going.' },
    { id: 'unsure', label: 'Not sure yet', subtitle: 'Still figuring out what blocks me most.' },
];

export default function OnboardingBarrierScreen() {
    const { draft, updateDraft, isLoaded } = useOnboardingDraft();
    const [selectedBarrier, setSelectedBarrier] = useState<COMBBarrier>('unsure');
    const [isLoading, setIsLoading] = useState(false);
    const { user } = useAuth();
    const draftRestored = React.useRef(false);

    React.useEffect(() => {
        if (!isLoaded || draftRestored.current) return;
        draftRestored.current = true;
        if (draft.comBBarrier) setSelectedBarrier(draft.comBBarrier as COMBBarrier);
        AsyncStorage.setItem(ONBOARDING_STEP_KEY, 'barrier').catch(() => null);
    }, [isLoaded, draft]);

    React.useEffect(() => {
        if (!draftRestored.current) return;
        const timer = setTimeout(() => {
            updateDraft({ comBBarrier: selectedBarrier });
        }, 300);
        return () => clearTimeout(timer);
    }, [selectedBarrier, updateDraft]);

    const handleContinue = async () => {
        triggerHaptic('medium');
        setIsLoading(true);
        try {
            if (user) {
                await updateUserProfile(user.id, { com_b_barrier: selectedBarrier });
            }
            await AsyncStorage.setItem(ONBOARDING_STEP_KEY, 'ai');
            router.push('/onboarding-ai' as never);
        } catch {
            Alert.alert('Error', 'Failed to save your answer. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleBack = () => router.back();

    return (
        <OnboardingScreenLayout
            currentStep={9}
            title="What most gets in the way?"
            subtitle="Knowing this helps us coach you in a way that actually sticks."
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
                {BARRIER_OPTIONS.map(option => {
                    const isSelected = selectedBarrier === option.id;
                    return (
                        <TouchableOpacity
                            key={option.id}
                            style={[styles.card, isSelected && styles.cardSelected]}
                            onPress={() => { triggerHaptic(); setSelectedBarrier(option.id); }}
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
        paddingVertical: 14,
        paddingHorizontal: 16,
    },
    cardSelected: {
        borderColor: Colors.primary,
        backgroundColor: Colors.primaryLight,
    },
    cardTitle: {
        fontFamily: fonts.medium,
        fontSize: 15,
        color: Colors.textPrimary,
    },
    cardSubtitle: {
        marginTop: 4,
        fontFamily: fonts.regular,
        fontSize: 13,
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
