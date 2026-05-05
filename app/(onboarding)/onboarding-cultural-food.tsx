import { ONBOARDING_STEP_KEY } from '@/app/index';
import { OnboardingScreenLayout } from '@/components/onboarding/OnboardingScreenLayout';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { useOnboardingDraft } from '@/hooks/useOnboardingDraft';
import { triggerHaptic } from '@/lib/utils/haptics';
import { updateUserProfile } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

const CULTURAL_FOOD_CONTEXTS = [
    'South Asian', 'East Asian', 'Southeast Asian', 'Mediterranean',
    'Latin American', 'Middle Eastern', 'African', 'Caribbean',
    'European', 'North American', 'Other',
];

export default function OnboardingCulturalFoodScreen() {
    const { draft, updateDraft, isLoaded } = useOnboardingDraft();
    const [culturalFoodContext, setCulturalFoodContext] = useState<string | null>(null);
    const [otherCulturalInput, setOtherCulturalInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { user } = useAuth();
    const draftRestored = React.useRef(false);

    React.useEffect(() => {
        if (!isLoaded || draftRestored.current) return;
        draftRestored.current = true;
        if (draft.culturalFoodContext) {
            if (CULTURAL_FOOD_CONTEXTS.includes(draft.culturalFoodContext) || draft.culturalFoodContext === 'Other') {
                setCulturalFoodContext(draft.culturalFoodContext);
            } else {
                setCulturalFoodContext('Other');
                setOtherCulturalInput(draft.culturalFoodContext);
            }
        }
        AsyncStorage.setItem(ONBOARDING_STEP_KEY, 'cultural-food').catch(() => null);
    }, [isLoaded, draft]);

    React.useEffect(() => {
        if (!draftRestored.current) return;
        const timer = setTimeout(() => {
            const resolved = culturalFoodContext === 'Other' && otherCulturalInput.trim()
                ? otherCulturalInput.trim()
                : culturalFoodContext;
            updateDraft({ culturalFoodContext: resolved });
        }, 300);
        return () => clearTimeout(timer);
    }, [culturalFoodContext, otherCulturalInput, updateDraft]);

    const handleContinue = async () => {
        triggerHaptic('medium');
        setIsLoading(true);
        try {
            const resolved = culturalFoodContext === 'Other' && otherCulturalInput.trim()
                ? otherCulturalInput.trim()
                : culturalFoodContext;
            if (user && resolved) {
                await updateUserProfile(user.id, { cultural_food_context: resolved });
            }
            await AsyncStorage.setItem(ONBOARDING_STEP_KEY, 'tracking');
            router.push('/onboarding-tracking' as never);
        } catch {
            Alert.alert('Error', 'Failed to save your answer. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSkip = () => {
        triggerHaptic();
        AsyncStorage.setItem(ONBOARDING_STEP_KEY, 'tracking').catch(() => null);
        router.push('/onboarding-tracking' as never);
    };

    const handleBack = () => router.back();

    return (
        <OnboardingScreenLayout
            currentStep={5}
            title="Any cultural food traditions?"
            subtitle="This helps us tailor meal suggestions to flavors you love."
            onBack={handleBack}
            hasKeyboardInput={culturalFoodContext === 'Other'}
            bottomContent={
                <View style={styles.buttonRow}>
                    <TouchableOpacity style={styles.skipButton} onPress={handleSkip} activeOpacity={0.7}>
                        <Text style={styles.skipButtonText}>Skip for now</Text>
                    </TouchableOpacity>
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
                </View>
            }
        >
            <View style={styles.chipsContainer}>
                {CULTURAL_FOOD_CONTEXTS.map(ctx => {
                    const selected = culturalFoodContext === ctx;
                    return (
                        <AnimatedPressable
                            key={ctx}
                            style={[styles.chip, selected && styles.chipSelected]}
                            onPress={() => setCulturalFoodContext(selected ? null : ctx)}
                        >
                            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                                {ctx}
                            </Text>
                        </AnimatedPressable>
                    );
                })}
            </View>
            {culturalFoodContext === 'Other' && (
                <TextInput
                    style={styles.otherInput}
                    placeholder="Describe your food traditions"
                    placeholderTextColor={Colors.textTertiary}
                    value={otherCulturalInput}
                    onChangeText={setOtherCulturalInput}
                    autoCapitalize="sentences"
                />
            )}
        </OnboardingScreenLayout>
    );
}

const styles = StyleSheet.create({
    chipsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    chip: {
        borderRadius: 20,
        borderWidth: 1,
        borderColor: Colors.borderCard,
        backgroundColor: Colors.inputBackground,
        paddingVertical: 10,
        paddingHorizontal: 16,
    },
    chipSelected: {
        borderColor: Colors.primary,
        backgroundColor: Colors.primaryLight,
    },
    chipText: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: Colors.textPrimary,
    },
    chipTextSelected: {
        color: Colors.primary,
    },
    otherInput: {
        marginTop: 12,
        backgroundColor: Colors.inputBackgroundSolid,
        borderWidth: 1,
        borderColor: Colors.inputBorderSolid,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontFamily: fonts.regular,
        fontSize: 15,
        color: Colors.textPrimary,
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 12,
    },
    skipButton: {
        flex: 1,
        height: 48,
        backgroundColor: Colors.buttonSecondary,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    skipButtonText: {
        fontFamily: fonts.medium,
        fontSize: 15,
        color: Colors.textSecondary,
    },
    continueButton: {
        flex: 2,
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
