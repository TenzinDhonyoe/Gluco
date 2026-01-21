import { ONBOARDING_STEP_KEY, PAYWALL_ENABLED } from '@/app/index';
import { Disclaimer } from '@/components/ui/Disclaimer';
import { LiquidGlassIconButton } from '@/components/ui/LiquidGlassButton';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { CoachingStyle, updateUserProfile } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ImageBackground,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface CoachingOption {
    id: CoachingStyle;
    title: string;
    subtitle: string;
}

const COACHING_OPTIONS: CoachingOption[] = [
    {
        id: 'light',
        title: 'Light nudges',
        subtitle: 'Occasional tips when something stands out',
    },
    {
        id: 'balanced',
        title: 'Balanced',
        subtitle: 'Daily insights and weekly summaries',
    },
    {
        id: 'structured',
        title: 'More structured',
        subtitle: 'Detailed coaching with regular check-ins',
    },
];

export default function Onboarding5Screen() {
    const [selectedStyle, setSelectedStyle] = useState<CoachingStyle>('balanced');
    const [aiEnabled, setAiEnabled] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const scrollViewRef = React.useRef<ScrollView>(null);
    const { user, refreshProfile } = useAuth();
    const currentStep = 5;
    const totalSteps = 5;

    React.useEffect(() => {
        AsyncStorage.setItem(ONBOARDING_STEP_KEY, '5').catch(() => null);
    }, []);


    const handleContinue = async () => {
        setIsLoading(true);
        try {
            if (user) {
                await updateUserProfile(user.id, {
                    coaching_style: selectedStyle,
                    notifications_enabled: false,
                    ai_enabled: aiEnabled,
                    ai_consent_at: aiEnabled ? new Date().toISOString() : null,
                    onboarding_completed: true,
                });
                // Refresh profile to update context
                await refreshProfile();
            }
            await AsyncStorage.removeItem(ONBOARDING_STEP_KEY);
            // Navigate to paywall or dashboard based on feature flag
            if (PAYWALL_ENABLED) {
                router.replace('/paywall' as never);
            } else {
                // Beta mode: skip paywall, go straight to app
                router.replace('/(tabs)' as never);
            }
        } catch (error) {
            Alert.alert('Error', 'Failed to save your preferences. Please try again.');
            console.error('Error completing onboarding:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleBack = () => {
        router.back();
    };

    return (
        <View style={styles.container}>
            <ImageBackground
                source={require('../assets/images/backgrounds/background.png')}
                style={styles.backgroundImage}
                resizeMode="cover"
            >
                <SafeAreaView style={styles.safeArea}>
                    <ScrollView
                        ref={scrollViewRef}
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                    >
                        {/* Header Row */}
                        <View style={styles.headerRow}>
                            {/* Back Button */}
                            <LiquidGlassIconButton
                                size={44}
                                onPress={handleBack}
                                style={styles.backButton}
                            >
                                <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
                            </LiquidGlassIconButton>

                            {/* Progress Indicator */}
                            <View style={styles.progressContainer}>
                                {Array.from({ length: totalSteps }).map((_, index) => (
                                    <View
                                        key={index}
                                        style={[
                                            styles.progressBar,
                                            index < currentStep ? styles.progressBarActive : styles.progressBarInactive,
                                        ]}
                                    />
                                ))}
                            </View>
                        </View>

                        {/* Content Section */}
                        <View style={styles.content}>
                            {/* Title Section */}
                            <View style={styles.titleSection}>
                                <Text style={styles.titleLabel}>HOW HANDS-ON?</Text>
                                <Text style={styles.description}>
                                    Choose your coaching intensity.
                                </Text>
                            </View>

                            {/* Coaching Options */}
                            <View style={styles.optionsContainer}>
                                {COACHING_OPTIONS.map((option) => {
                                    const isSelected = selectedStyle === option.id;
                                    return (
                                        <TouchableOpacity
                                            key={option.id}
                                            style={[
                                                styles.optionItem,
                                                isSelected && styles.optionItemSelected,
                                            ]}
                                            onPress={() => setSelectedStyle(option.id)}
                                            activeOpacity={0.7}
                                        >
                                            <View style={styles.optionContent}>
                                                <Text style={styles.optionTitle}>
                                                    {option.title}
                                                </Text>
                                                <Text style={styles.optionSubtitle}>
                                                    {option.subtitle}
                                                </Text>
                                            </View>

                                            {/* Radio Button */}
                                            <View style={[
                                                styles.radioOuter,
                                                isSelected && styles.radioOuterSelected,
                                            ]}>
                                                {isSelected && <View style={styles.radioInner} />}
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>


                            {/* AI Insights Section */}
                            <View style={styles.aiSection}>
                                <View style={styles.aiRow}>
                                    <View style={styles.aiTextBlock}>
                                        <Text style={styles.aiTitle}>AI Insights</Text>
                                        <Text style={styles.aiSubtitle}>
                                            Allow AI to analyze meals and generate tips.
                                        </Text>
                                    </View>
                                    <Switch
                                        value={aiEnabled}
                                        onValueChange={setAiEnabled}
                                        trackColor={{ false: '#3F4243', true: '#3494D9' }}
                                        thumbColor={aiEnabled ? '#FFFFFF' : '#878787'}
                                        ios_backgroundColor="#3F4243"
                                    />
                                </View>
                            </View>
                        </View>
                    </ScrollView>

                    {/* Disclaimer */}
                    <Disclaimer variant="short" style={styles.disclaimer} />

                    {/* Get Started Button */}
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
                                <Text style={styles.continueButtonText}>Get Started</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </SafeAreaView>
            </ImageBackground>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    backgroundImage: {
        flex: 1,
        width: '100%',
        height: '100%',
    },
    safeArea: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: 16,
        paddingBottom: 180,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 16,
        marginBottom: 24,
        gap: 16,
    },
    backButton: {
        width: 48,
        height: 48,
        borderRadius: 33,
        backgroundColor: 'rgba(63, 66, 67, 0.3)',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 16,
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.25,
        shadowRadius: 2,
        elevation: 2,
    },
    progressContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 24,
        gap: 5,
    },
    progressBar: {
        flex: 1,
        height: 2,
        borderRadius: 12,
    },
    progressBarActive: {
        backgroundColor: Colors.textPrimary,
    },
    progressBarInactive: {
        backgroundColor: '#878787',
    },
    progressBarSpacing: {
        marginRight: 5,
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
        color: '#878787',
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
        color: '#878787',
    },
    radioOuter: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#878787',
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
    notificationsSection: {
        marginBottom: 24,
    },
    notificationButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#3f4243',
        backgroundColor: 'transparent',
    },
    notificationButtonEnabled: {
        borderColor: Colors.buttonPrimary,
        backgroundColor: 'rgba(40, 94, 42, 0.2)',
    },
    notificationButtonText: {
        fontFamily: fonts.medium,
        fontSize: 15,
        color: '#878787',
    },
    notificationButtonTextEnabled: {
        color: Colors.textPrimary,
    },
    aiSection: {
        backgroundColor: 'rgba(26, 29, 31, 0.6)',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#2A2D30',
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
        color: '#878787',
        lineHeight: 16,
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
