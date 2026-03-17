import { ONBOARDING_STEP_KEY } from '@/app/index';
import { ForestGlassBackground } from '@/components/backgrounds/forest-glass-background';
import { OnboardingHeader } from '@/components/onboarding/OnboardingHeader';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { triggerHaptic } from '@/lib/utils/haptics';
import { useOnboardingDraft } from '@/hooks/useOnboardingDraft';
import { CoachingStyle, COMBBarrier, updateUserProfile } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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

const BARRIER_OPTIONS: { id: COMBBarrier; label: string; subtitle: string }[] = [
    { id: 'capability', label: 'Need simpler guidance', subtitle: 'Clearer and easier instructions help me act.' },
    { id: 'opportunity', label: 'Environment gets in the way', subtitle: 'Schedule and surroundings make consistency hard.' },
    { id: 'motivation', label: 'Staying consistent is hard', subtitle: 'I start well but struggle to keep going.' },
    { id: 'unsure', label: 'Not sure yet', subtitle: 'Still figuring out what blocks me most.' },
];

export default function OnboardingCoachingScreen() {
    const { draft, updateDraft, isLoaded } = useOnboardingDraft();
    const [selectedStyle, setSelectedStyle] = useState<CoachingStyle>('balanced');
    const [selectedBarrier, setSelectedBarrier] = useState<COMBBarrier>('unsure');
    const [ifThenPlan, setIfThenPlan] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const scrollViewRef = React.useRef<ScrollView>(null);
    const { user } = useAuth();
    const draftRestored = React.useRef(false);

    // Restore draft
    React.useEffect(() => {
        if (!isLoaded || draftRestored.current) return;
        draftRestored.current = true;
        if (draft.coachingStyle) setSelectedStyle(draft.coachingStyle as CoachingStyle);
        if (draft.comBBarrier) setSelectedBarrier(draft.comBBarrier as COMBBarrier);
        if (draft.ifThenPlan) setIfThenPlan(draft.ifThenPlan);
        AsyncStorage.setItem(ONBOARDING_STEP_KEY, 'coaching').catch(() => null);
    }, [isLoaded, draft]);

    // Save to draft on changes
    React.useEffect(() => {
        if (!draftRestored.current) return;
        const timer = setTimeout(() => {
            updateDraft({ coachingStyle: selectedStyle, comBBarrier: selectedBarrier, ifThenPlan });
        }, 300);
        return () => clearTimeout(timer);
    }, [selectedStyle, selectedBarrier, ifThenPlan, updateDraft]);

    const handleContinue = async () => {
        triggerHaptic('medium');
        setIsLoading(true);
        try {
            if (user) {
                await updateUserProfile(user.id, {
                    coaching_style: selectedStyle,
                    com_b_barrier: selectedBarrier,
                    if_then_plan: ifThenPlan.trim() || null,
                });
            }
            await AsyncStorage.setItem(ONBOARDING_STEP_KEY, 'ai');
            router.push('/onboarding-ai' as never);
        } catch {
            Alert.alert('Error', 'Failed to save your preferences. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleBack = () => {
        router.back();
    };

    return (
        <View style={styles.container}>
            <ForestGlassBackground blurIntensity={18} />
            <SafeAreaView style={styles.safeArea}>
                <ScrollView
                    ref={scrollViewRef}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    <OnboardingHeader currentStep={5} totalSteps={6} onBack={handleBack} />

                    <View style={styles.content}>
                        <View style={styles.titleSection}>
                            <Text style={styles.titleLabel}>HOW HANDS-ON?</Text>
                            <Text style={styles.description}>Choose your coaching intensity.</Text>
                        </View>

                        <View style={styles.optionsContainer}>
                            {COACHING_OPTIONS.map((option) => {
                                const isSelected = selectedStyle === option.id;
                                return (
                                    <TouchableOpacity
                                        key={option.id}
                                        style={[styles.optionItem, isSelected && styles.optionItemSelected]}
                                        onPress={() => { triggerHaptic(); setSelectedStyle(option.id); }}
                                        activeOpacity={0.7}
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

                        <View style={styles.behaviorSection}>
                            <Text style={styles.sectionHeading}>WHAT MOST GETS IN THE WAY?</Text>
                            <View style={styles.barrierOptions}>
                                {BARRIER_OPTIONS.map(option => {
                                    const isSelected = selectedBarrier === option.id;
                                    return (
                                        <TouchableOpacity
                                            key={option.id}
                                            style={[styles.barrierCard, isSelected && styles.barrierCardSelected]}
                                            onPress={() => { triggerHaptic(); setSelectedBarrier(option.id); }}
                                            activeOpacity={0.75}
                                        >
                                            <Text style={styles.barrierTitle}>{option.label}</Text>
                                            <Text style={styles.barrierSubtitle}>{option.subtitle}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>

                        <View style={styles.behaviorSection}>
                            <Text style={styles.sectionHeading}>YOUR IF-THEN PLAN</Text>
                            <TextInput
                                value={ifThenPlan}
                                onChangeText={setIfThenPlan}
                                placeholder="If I finish lunch, then I take a 10-minute walk."
                                placeholderTextColor={Colors.textTertiary}
                                style={styles.ifThenInput}
                                multiline
                                numberOfLines={3}
                                textAlignVertical="top"
                            />
                        </View>
                    </View>
                </ScrollView>

                <View style={styles.buttonContainer}>
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
    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: 16,
        paddingBottom: 120,
    },
    content: {
        flex: 1,
    },
    titleSection: {
        marginBottom: 32,
    },
    titleLabel: {
        fontFamily: fonts.medium,
        fontSize: 16,
        lineHeight: 16 * 1.2,
        color: Colors.textTertiary,
        textTransform: 'uppercase',
        marginBottom: 12,
    },
    description: {
        fontFamily: fonts.medium,
        fontSize: 16,
        lineHeight: 16 * 1.4,
        color: Colors.textPrimary,
    },
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
        borderRadius: 10,
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
    ifThenInput: {
        minHeight: 92,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: Colors.inputBorder,
        backgroundColor: Colors.inputBackground,
        color: Colors.textPrimary,
        fontFamily: fonts.regular,
        fontSize: 14,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    buttonContainer: {
        position: 'absolute',
        bottom: 42,
        left: 16,
        right: 16,
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
