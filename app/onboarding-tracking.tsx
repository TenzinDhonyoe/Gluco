import { ONBOARDING_STEP_KEY } from '@/app/index';
import { OnboardingHeader } from '@/components/onboarding/OnboardingHeader';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { useOnboardingDraft } from '@/hooks/useOnboardingDraft';
import { requestHealthKitAuthorization } from '@/lib/healthkit';
import { PromptWindow, TrackingMode, updateUserProfile } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface TrackingOption {
    id: TrackingMode;
    title: string;
    subtitle: string;
    recommended: boolean;
    disabled: boolean;
}

const PROMPT_WINDOWS: { id: PromptWindow; label: string; subtitle: string }[] = [
    { id: 'morning', label: 'Morning', subtitle: 'Start-day planning cue' },
    { id: 'midday', label: 'Midday', subtitle: 'Lunchtime behavior nudge' },
    { id: 'evening', label: 'Evening', subtitle: 'Wrap-up and prep cue' },
];

export default function OnboardingTrackingScreen() {
    const isIOS = Platform.OS === 'ios';
    const { draft, updateDraft, isLoaded } = useOnboardingDraft();
    const [selectedMode, setSelectedMode] = useState<TrackingMode>(isIOS ? 'meals_wearables' : 'meals_only');
    const [promptWindow, setPromptWindow] = useState<PromptWindow>('midday');
    const [isLoading, setIsLoading] = useState(false);
    const scrollViewRef = React.useRef<ScrollView>(null);
    const { user } = useAuth();
    const draftRestored = React.useRef(false);

    // Restore draft
    React.useEffect(() => {
        if (!isLoaded || draftRestored.current) return;
        draftRestored.current = true;
        if (draft.selectedMode) setSelectedMode(draft.selectedMode as TrackingMode);
        if (draft.promptWindow) setPromptWindow(draft.promptWindow as PromptWindow);
        AsyncStorage.setItem(ONBOARDING_STEP_KEY, 'tracking').catch(() => null);
    }, [isLoaded, draft]);

    // Save to draft on changes
    React.useEffect(() => {
        if (!draftRestored.current) return;
        updateDraft({ selectedMode, promptWindow });
    }, [selectedMode, promptWindow, updateDraft]);

    const trackingOptions: TrackingOption[] = [
        {
            id: 'meals_wearables',
            title: 'Meals + Apple Health',
            subtitle: 'Track meals and sync steps, sleep, and resting heart rate',
            recommended: isIOS,
            disabled: !isIOS,
        },
        {
            id: 'meals_only',
            title: 'Meals only',
            subtitle: 'Log meals manually without device data',
            recommended: false,
            disabled: false,
        },
        {
            id: 'manual_glucose_optional',
            title: 'Include optional readings',
            subtitle: 'Add optional personal readings for extra context',
            recommended: false,
            disabled: false,
        },
    ];

    const handleContinue = async () => {
        setIsLoading(true);
        try {
            if (isIOS && selectedMode === 'meals_wearables') {
                await requestHealthKitAuthorization().catch((e) => console.log('HK Error:', e));
                await AsyncStorage.setItem('apple_health_enabled', 'true');
            }
            if (user) {
                await updateUserProfile(user.id, {
                    tracking_mode: selectedMode,
                    manual_glucose_enabled: selectedMode === 'manual_glucose_optional',
                    prompt_window: promptWindow,
                });
            }
            await AsyncStorage.setItem(ONBOARDING_STEP_KEY, 'coaching');
            router.push('/onboarding-coaching' as never);
        } catch {
            Alert.alert('Error', 'Failed to save your preferences. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleBack = () => {
        router.back();
    };

    const handleSelectMode = (mode: TrackingMode) => {
        const option = trackingOptions.find(o => o.id === mode);
        if (option && !option.disabled) setSelectedMode(mode);
    };

    return (
        <View style={styles.container}>
            <SafeAreaView style={styles.safeArea}>
                <ScrollView
                    ref={scrollViewRef}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    <OnboardingHeader currentStep={4} totalSteps={6} onBack={handleBack} />

                    <View style={styles.content}>
                        <View style={styles.titleSection}>
                            <Text style={styles.titleLabel}>CHOOSE YOUR SETUP</Text>
                            <Text style={styles.description}>How would you like to track?</Text>
                        </View>

                        <View style={styles.optionsContainer}>
                            {trackingOptions.map((option) => {
                                const isSelected = selectedMode === option.id;
                                return (
                                    <TouchableOpacity
                                        key={option.id}
                                        style={[
                                            styles.optionItem,
                                            isSelected && styles.optionItemSelected,
                                            option.disabled && styles.optionItemDisabled,
                                        ]}
                                        onPress={() => handleSelectMode(option.id)}
                                        activeOpacity={option.disabled ? 1 : 0.7}
                                        disabled={option.disabled}
                                    >
                                        <View style={styles.optionContent}>
                                            <View style={styles.optionHeader}>
                                                <Text style={[styles.optionTitle, option.disabled && styles.optionTitleDisabled]}>
                                                    {option.title}
                                                </Text>
                                                {option.recommended && (
                                                    <View style={styles.recommendedBadge}>
                                                        <Text style={styles.recommendedText}>Recommended</Text>
                                                    </View>
                                                )}
                                            </View>
                                            <Text style={[styles.optionSubtitle, option.disabled && styles.optionSubtitleDisabled]}>
                                                {option.disabled ? 'Coming soon on Android' : option.subtitle}
                                            </Text>
                                        </View>
                                        <View style={[styles.radioOuter, isSelected && styles.radioOuterSelected, option.disabled && styles.radioOuterDisabled]}>
                                            {isSelected && <View style={styles.radioInner} />}
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        <View style={styles.promptSection}>
                            <Text style={styles.promptTitle}>PREFERRED DAILY NUDGE WINDOW</Text>
                            <View style={styles.promptOptions}>
                                {PROMPT_WINDOWS.map(option => {
                                    const isSelected = promptWindow === option.id;
                                    return (
                                        <TouchableOpacity
                                            key={option.id}
                                            style={[styles.promptCard, isSelected && styles.promptCardSelected]}
                                            onPress={() => setPromptWindow(option.id)}
                                            activeOpacity={0.75}
                                        >
                                            <Text style={styles.promptCardTitle}>{option.label}</Text>
                                            <Text style={styles.promptCardSubtitle}>{option.subtitle}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
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
                            <ActivityIndicator color={Colors.textPrimary} />
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
    },
    optionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(63, 66, 67, 0.3)',
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    optionItemSelected: {
        backgroundColor: 'rgba(40, 94, 42, 0.3)',
        borderColor: Colors.buttonPrimary,
    },
    optionItemDisabled: {
        opacity: 0.5,
    },
    optionContent: {
        flex: 1,
        marginRight: 12,
    },
    optionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4,
    },
    optionTitle: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: Colors.textPrimary,
    },
    optionTitleDisabled: {
        color: Colors.textTertiary,
    },
    optionSubtitle: {
        fontFamily: fonts.regular,
        fontSize: 14,
        lineHeight: 14 * 1.4,
        color: Colors.textTertiary,
    },
    optionSubtitleDisabled: {
        color: '#666666',
    },
    recommendedBadge: {
        backgroundColor: Colors.buttonPrimary,
        borderRadius: 4,
        paddingHorizontal: 6,
        paddingVertical: 2,
    },
    recommendedText: {
        fontFamily: fonts.medium,
        fontSize: 10,
        color: Colors.textPrimary,
        textTransform: 'uppercase',
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
    radioOuterDisabled: {
        borderColor: '#555555',
    },
    radioInner: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: Colors.buttonPrimary,
    },
    promptSection: {
        marginTop: 24,
        marginBottom: 10,
    },
    promptTitle: {
        fontFamily: fonts.medium,
        fontSize: 13,
        color: '#B5B5B5',
        letterSpacing: 0.6,
        marginBottom: 10,
    },
    promptOptions: {
        gap: 10,
    },
    promptCard: {
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        backgroundColor: 'rgba(63, 66, 67, 0.28)',
        paddingVertical: 12,
        paddingHorizontal: 14,
    },
    promptCardSelected: {
        borderColor: Colors.primary,
        backgroundColor: 'rgba(52,148,217,0.2)',
    },
    promptCardTitle: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: Colors.textPrimary,
    },
    promptCardSubtitle: {
        marginTop: 2,
        fontFamily: fonts.regular,
        fontSize: 12,
        color: '#A9A9A9',
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
        backgroundColor: Colors.buttonSecondary,
        borderWidth: 1,
        borderColor: Colors.buttonSecondaryBorder,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    continueButtonText: {
        fontFamily: fonts.medium,
        fontSize: 15,
        color: Colors.textPrimary,
    },
});
