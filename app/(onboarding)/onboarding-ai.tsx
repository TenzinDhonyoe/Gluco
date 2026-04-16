import { ONBOARDING_STEP_KEY } from '@/app/index';
import { OnboardingScreenLayout } from '@/components/onboarding/OnboardingScreenLayout';
import { Disclaimer } from '@/components/ui/Disclaimer';
import { Colors } from '@/constants/Colors';
import { LEGAL_URLS } from '@/constants/legal';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { triggerHaptic } from '@/lib/utils/haptics';
import { useOnboardingDraft } from '@/hooks/useOnboardingDraft';
import { updateUserProfile } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Linking,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

const AI_FEATURES = [
    { icon: 'camera-outline' as const, title: 'Meal photo analysis', description: 'Snap a photo and get estimated nutrition breakdown' },
    { icon: 'bulb-outline' as const, title: 'Personalized tips', description: 'Insights tailored to your patterns and goals' },
    { icon: 'calendar-outline' as const, title: 'Weekly summaries', description: 'AI-generated review of your week\'s progress' },
];

const TRACKING_MODE_LABELS: Record<string, string> = {
    meals_wearables: 'Meals + Apple Health',
    meals_only: 'Meals only',
    manual_glucose_optional: 'Meals + glucose',
};

const COACHING_STYLE_LABELS: Record<string, string> = {
    light: 'Light nudges',
    balanced: 'Balanced',
    structured: 'Structured',
};

export default function OnboardingAiScreen() {
    const { draft, updateDraft, clearDraft, isLoaded } = useOnboardingDraft();
    const [aiEnabled, setAiEnabled] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const { user, refreshProfile } = useAuth();
    const draftRestored = React.useRef(false);

    // Restore draft
    React.useEffect(() => {
        if (!isLoaded || draftRestored.current) return;
        draftRestored.current = true;
        if (typeof draft.aiEnabled === 'boolean') setAiEnabled(draft.aiEnabled);
        AsyncStorage.setItem(ONBOARDING_STEP_KEY, 'ai').catch(() => null);
    }, [isLoaded, draft]);

    // Save AI toggle to draft
    React.useEffect(() => {
        if (!draftRestored.current) return;
        updateDraft({ aiEnabled });
    }, [aiEnabled, updateDraft]);

    const handleGetStarted = async () => {
        triggerHaptic('medium');
        setIsLoading(true);
        try {
            if (user) {
                await updateUserProfile(user.id, {
                    ai_enabled: aiEnabled,
                    ai_consent_at: aiEnabled ? new Date().toISOString() : null,
                    notifications_enabled: false,
                    onboarding_completed: true,
                });
                await refreshProfile();
            }
            await AsyncStorage.removeItem(ONBOARDING_STEP_KEY);
            await clearDraft();
            router.replace('/onboarding-personalize' as never);
        } catch {
            Alert.alert('Error', 'Failed to save your preferences. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleBack = () => {
        router.back();
    };

    const firstGoal = draft.selectedGoals?.[0]?.toLowerCase() || 'wellness';
    const initials = `${(draft.firstName || '')[0] || ''}${(draft.lastName || '')[0] || ''}`.toUpperCase();
    const fullName = [draft.firstName, draft.lastName].filter(Boolean).join(' ');

    return (
        <OnboardingScreenLayout
            currentStep={6}
            title={`Unlock smart features\nfor your ${firstGoal} journey`}
            subtitle="Meal photos and wellness data are analyzed by Google's Gemini AI to give you personalized tips."
            onBack={handleBack}
            bottomContent={
                <>
                    <Disclaimer variant="short" style={styles.disclaimer} />
                    <TouchableOpacity
                        style={styles.getStartedButton}
                        onPress={handleGetStarted}
                        activeOpacity={0.8}
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <ActivityIndicator color={Colors.buttonActionText} />
                        ) : (
                            <Text style={styles.getStartedButtonText}>Get Started</Text>
                        )}
                    </TouchableOpacity>
                </>
            }
        >
            {/* Feature list */}
            <View style={styles.featuresContainer}>
                {AI_FEATURES.map((feature, index) => (
                    <View key={index} style={styles.featureCard}>
                        <View style={styles.featureRow}>
                            <View style={styles.featureIconContainer}>
                                <Ionicons name={feature.icon} size={22} color={Colors.primary} />
                            </View>
                            <View style={styles.featureTextBlock}>
                                <Text style={styles.featureTitle}>{feature.title}</Text>
                                <Text style={styles.featureDescription}>{feature.description}</Text>
                            </View>
                        </View>
                    </View>
                ))}
            </View>

            {/* AI Toggle */}
            <View style={styles.aiToggleSection}>
                <View style={styles.aiRow}>
                    <View style={styles.aiTextBlock}>
                        <Text style={styles.aiTitle}>Enable AI Insights</Text>
                        <Text style={styles.aiSubtitle}>
                            When enabled, meal photos and wellness data are sent to Google's Gemini AI for analysis. No data is shared when disabled.
                        </Text>
                    </View>
                    <Switch
                        value={aiEnabled}
                        onValueChange={setAiEnabled}
                        trackColor={{ false: Colors.borderCard, true: Colors.primary }}
                        thumbColor={aiEnabled ? Colors.textPrimary : Colors.textTertiary}
                        ios_backgroundColor={Colors.borderCard}
                    />
                </View>
            </View>

            <View style={styles.policyLinks}>
                <Text
                    style={styles.policyLink}
                    onPress={() => Linking.openURL(LEGAL_URLS.privacyPolicy)}
                >
                    Privacy Policy
                </Text>
                <Text style={styles.policyDot}> · </Text>
                <Text
                    style={styles.policyLink}
                    onPress={() => Linking.openURL(LEGAL_URLS.googleAiTerms)}
                >
                    Google AI Terms
                </Text>
            </View>

            {!aiEnabled && (
                <Text style={styles.disabledNote}>
                    You can enable AI features later in Settings.
                </Text>
            )}

            {/* Summary card */}
            {draft.firstName ? (
                <View style={styles.summaryCard}>
                    {/* Name row */}
                    <View style={styles.summaryNameRow}>
                        <View style={styles.initialsCircle}>
                            <Text style={styles.initialsText}>{initials}</Text>
                        </View>
                        <Text style={styles.summaryName}>{fullName}</Text>
                    </View>

                    {/* Goals chips */}
                    {draft.selectedGoals && draft.selectedGoals.length > 0 && (
                        <View style={styles.goalsRow}>
                            {draft.selectedGoals.map((goal, i) => (
                                <View key={i} style={styles.goalChip}>
                                    <Text style={styles.goalChipText}>{goal}</Text>
                                </View>
                            ))}
                        </View>
                    )}

                    {/* Tracking + Coaching */}
                    <View style={styles.summaryDetailsRow}>
                        {draft.selectedMode && (
                            <Text style={styles.summaryDetailText}>
                                {TRACKING_MODE_LABELS[draft.selectedMode] || draft.selectedMode}
                            </Text>
                        )}
                        {draft.selectedMode && draft.coachingStyle && (
                            <Text style={styles.summaryDetailSeparator}> · </Text>
                        )}
                        {draft.coachingStyle && (
                            <Text style={styles.summaryDetailText}>
                                {COACHING_STYLE_LABELS[draft.coachingStyle] || draft.coachingStyle}
                            </Text>
                        )}
                    </View>
                </View>
            ) : null}
        </OnboardingScreenLayout>
    );
}

const styles = StyleSheet.create({
    featuresContainer: {
        gap: 12,
        marginBottom: 32,
    },
    featureCard: {
        borderRadius: 12,
        backgroundColor: Colors.inputBackground,
        borderWidth: 1,
        borderColor: Colors.borderCard,
        padding: 16,
    },
    featureRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 14,
    },
    featureIconContainer: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: Colors.primaryLight,
        justifyContent: 'center',
        alignItems: 'center',
    },
    featureTextBlock: {
        flex: 1,
    },
    featureTitle: {
        fontFamily: fonts.medium,
        fontSize: 15,
        color: Colors.textPrimary,
        marginBottom: 2,
    },
    featureDescription: {
        fontFamily: fonts.regular,
        fontSize: 13,
        lineHeight: 13 * 1.4,
        color: Colors.textTertiary,
    },
    aiToggleSection: {
        backgroundColor: Colors.inputBackground,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: Colors.borderCard,
        paddingVertical: 12,
        paddingHorizontal: 14,
        marginBottom: 12,
    },
    aiRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    aiTextBlock: {
        flex: 1,
        marginRight: 12,
    },
    aiTitle: {
        fontFamily: fonts.medium,
        fontSize: 15,
        color: Colors.textPrimary,
        marginBottom: 4,
    },
    aiSubtitle: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: Colors.textTertiary,
        lineHeight: 16,
    },
    policyLinks: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    policyLink: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: Colors.primary,
        textDecorationLine: 'underline',
    },
    policyDot: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: Colors.textTertiary,
    },
    disabledNote: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: Colors.textTertiary,
        textAlign: 'center',
        marginTop: 8,
    },
    disclaimer: {
        marginBottom: 12,
    },
    getStartedButton: {
        width: '100%',
        height: 48,
        backgroundColor: Colors.buttonAction,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    getStartedButtonText: {
        fontFamily: fonts.medium,
        fontSize: 15,
        color: Colors.buttonActionText,
    },
    // Summary card
    summaryCard: {
        backgroundColor: Colors.backgroundCardGlass,
        borderWidth: 1,
        borderColor: Colors.borderCard,
        borderRadius: 16,
        padding: 16,
        marginTop: 24,
    },
    summaryNameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    initialsCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: Colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    initialsText: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: Colors.buttonActionText,
    },
    summaryName: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: Colors.textPrimary,
    },
    goalsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 12,
    },
    goalChip: {
        borderRadius: 20,
        backgroundColor: Colors.primaryLight,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    goalChipText: {
        fontFamily: fonts.medium,
        fontSize: 13,
        color: Colors.primary,
    },
    summaryDetailsRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    summaryDetailText: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: Colors.textSecondary,
    },
    summaryDetailSeparator: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: Colors.textSecondary,
    },
});
