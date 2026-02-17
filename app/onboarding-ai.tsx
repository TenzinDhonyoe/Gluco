import { ONBOARDING_STEP_KEY, PAYWALL_ENABLED } from '@/app/index';
import { ForestGlassBackground } from '@/components/backgrounds/forest-glass-background';
import { OnboardingHeader } from '@/components/onboarding/OnboardingHeader';
import { Disclaimer } from '@/components/ui/Disclaimer';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { useOnboardingDraft } from '@/hooks/useOnboardingDraft';
import { updateUserProfile } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const AI_FEATURES = [
    { icon: 'camera-outline' as const, title: 'Meal photo analysis', description: 'Snap a photo and get estimated nutrition breakdown' },
    { icon: 'bulb-outline' as const, title: 'Personalized tips', description: 'Insights tailored to your patterns and goals' },
    { icon: 'calendar-outline' as const, title: 'Weekly summaries', description: 'AI-generated review of your week\'s progress' },
];

export default function OnboardingAiScreen() {
    const { draft, clearDraft, isLoaded } = useOnboardingDraft();
    const [aiEnabled, setAiEnabled] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const scrollViewRef = React.useRef<ScrollView>(null);
    const { user, refreshProfile } = useAuth();
    const draftRestored = React.useRef(false);

    // Restore draft
    React.useEffect(() => {
        if (!isLoaded || draftRestored.current) return;
        draftRestored.current = true;
        if (typeof draft.aiEnabled === 'boolean') setAiEnabled(draft.aiEnabled);
        AsyncStorage.setItem(ONBOARDING_STEP_KEY, 'ai').catch(() => null);
    }, [isLoaded, draft]);

    const handleGetStarted = async () => {
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
            if (PAYWALL_ENABLED) {
                router.replace('/paywall' as never);
            } else {
                router.replace('/(tabs)' as never);
            }
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
                    <OnboardingHeader currentStep={6} totalSteps={6} onBack={handleBack} />

                    <View style={styles.content}>
                        <View style={styles.titleSection}>
                            <Text style={styles.titleLabel}>AI PERSONALIZATION</Text>
                            <Text style={styles.description}>
                                Enable AI to unlock smarter features powered by your data.
                            </Text>
                        </View>

                        {/* Feature list */}
                        <View style={styles.featuresContainer}>
                            {AI_FEATURES.map((feature, index) => (
                                <View key={index} style={styles.featureRow}>
                                    <View style={styles.featureIconContainer}>
                                        <Ionicons name={feature.icon} size={22} color={Colors.primary} />
                                    </View>
                                    <View style={styles.featureTextBlock}>
                                        <Text style={styles.featureTitle}>{feature.title}</Text>
                                        <Text style={styles.featureDescription}>{feature.description}</Text>
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
                                        Allow AI to analyze meals and generate personalized tips.
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

                        {!aiEnabled && (
                            <Text style={styles.disabledNote}>
                                You can enable AI features later in Settings.
                            </Text>
                        )}
                    </View>
                </ScrollView>

                <Disclaimer variant="short" style={styles.disclaimer} />

                <View style={styles.buttonContainer}>
                    <TouchableOpacity
                        style={styles.getStartedButton}
                        onPress={handleGetStarted}
                        activeOpacity={0.8}
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <ActivityIndicator color={Colors.textPrimary} />
                        ) : (
                            <Text style={styles.getStartedButtonText}>Get Started</Text>
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
        paddingBottom: 180,
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
    featuresContainer: {
        gap: 16,
        marginBottom: 32,
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
        backgroundColor: 'rgba(52, 148, 217, 0.15)',
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
        backgroundColor: 'rgba(26, 29, 31, 0.6)',
        borderRadius: 10,
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
    disabledNote: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: Colors.textTertiary,
        textAlign: 'center',
        marginTop: 8,
    },
    disclaimer: {
        marginHorizontal: 16,
        marginBottom: 12,
    },
    buttonContainer: {
        position: 'absolute',
        bottom: 42,
        left: 16,
        right: 16,
    },
    getStartedButton: {
        width: '100%',
        height: 48,
        backgroundColor: Colors.buttonSecondary,
        borderWidth: 1,
        borderColor: Colors.buttonSecondaryBorder,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    getStartedButtonText: {
        fontFamily: fonts.medium,
        fontSize: 15,
        color: Colors.textPrimary,
    },
});
