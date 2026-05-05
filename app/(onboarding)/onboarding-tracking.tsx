import { ONBOARDING_STEP_KEY } from '@/app/index';
import { OnboardingScreenLayout } from '@/components/onboarding/OnboardingScreenLayout';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { triggerHaptic } from '@/lib/utils/haptics';
import { useOnboardingDraft } from '@/hooks/useOnboardingDraft';
import { requestHealthKitAuthorization } from '@/lib/healthkit';
import { TrackingMode, updateUserProfile } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

interface TrackingOption {
    id: TrackingMode;
    title: string;
    subtitle: string;
    recommended: boolean;
    disabled: boolean;
}

export default function OnboardingTrackingScreen() {
    const isIOS = Platform.OS === 'ios';
    const { draft, updateDraft, isLoaded } = useOnboardingDraft();
    const [selectedMode, setSelectedMode] = useState<TrackingMode>(isIOS ? 'meals_wearables' : 'meals_only');
    const [isLoading, setIsLoading] = useState(false);
    const { user } = useAuth();
    const draftRestored = React.useRef(false);

    // Restore draft
    React.useEffect(() => {
        if (!isLoaded || draftRestored.current) return;
        draftRestored.current = true;
        if (draft.selectedMode) setSelectedMode(draft.selectedMode as TrackingMode);
        AsyncStorage.setItem(ONBOARDING_STEP_KEY, 'tracking').catch(() => null);
    }, [isLoaded, draft]);

    // Save to draft on changes
    React.useEffect(() => {
        if (!draftRestored.current) return;
        updateDraft({ selectedMode });
    }, [selectedMode, updateDraft]);

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

    const firstName = draft.firstName;

    const TRACKING_ICONS: Partial<Record<TrackingMode, keyof typeof Ionicons.glyphMap>> = {
        meals_wearables: 'watch-outline',
        meals_only: 'restaurant-outline',
        manual_glucose_optional: 'water-outline',
    };

    const handleContinue = async () => {
        triggerHaptic('medium');
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
                });
            }
            await AsyncStorage.setItem(ONBOARDING_STEP_KEY, 'nudge-time');
            router.push('/onboarding-nudge-time' as never);
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
        if (option && !option.disabled) {
            triggerHaptic();
            setSelectedMode(mode);
        }
    };

    return (
        <OnboardingScreenLayout
            currentStep={6}
            title="Choose your tracking style"
            subtitle={`We'll set up the right tools for your routine${firstName ? `, ${firstName}` : ''}.`}
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
                            accessibilityRole="radio"
                            accessibilityState={{ selected: isSelected }}
                        >
                            <Ionicons
                                name={TRACKING_ICONS[option.id] ?? 'ellipse-outline'}
                                size={22}
                                color={isSelected ? Colors.primary : option.disabled ? Colors.textMuted : Colors.textSecondary}
                                style={styles.optionIcon}
                            />
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
        </OnboardingScreenLayout>
    );
}

const styles = StyleSheet.create({
    optionsContainer: {
        gap: 12,
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
    optionItemDisabled: {
        opacity: 0.5,
    },
    optionIcon: {
        marginRight: 12,
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
        color: Colors.textTertiary,
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
        borderColor: Colors.textMuted,
    },
    radioInner: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: Colors.buttonPrimary,
    },
    promptSection: {
        marginTop: 24,
        marginBottom: 12,
    },
    promptTitle: {
        fontFamily: fonts.medium,
        fontSize: 12,
        color: Colors.textSecondary,
        letterSpacing: 0.8,
        marginBottom: 12,
    },
    promptOptions: {
        gap: 8,
    },
    promptCard: {
        borderRadius: 12,
        borderWidth: 1,
        borderColor: Colors.borderCard,
        backgroundColor: Colors.inputBackground,
        paddingVertical: 12,
        paddingHorizontal: 14,
    },
    promptCardSelected: {
        borderColor: Colors.primary,
        backgroundColor: Colors.primaryLight,
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
