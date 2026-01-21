import { ONBOARDING_STEP_KEY } from '@/app/index';
import { LiquidGlassIconButton } from '@/components/ui/LiquidGlassButton';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { requestHealthKitAuthorization } from '@/lib/healthkit';
import { TrackingMode, updateUserProfile } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    AppState,
    ImageBackground,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Tracking options - no medical language
interface TrackingOption {
    id: TrackingMode;
    title: string;
    subtitle: string;
    recommended: boolean;
    disabled: boolean;
}

const TRACKING_DRAFT_KEY = 'onboarding_tracking_draft';

export default function Onboarding4Screen() {
    const isIOS = Platform.OS === 'ios';

    // Default: meals_wearables on iOS, meals_only on Android
    const [selectedMode, setSelectedMode] = useState<TrackingMode>(
        isIOS ? 'meals_wearables' : 'meals_only'
    );
    const [isLoading, setIsLoading] = useState(false);
    const scrollViewRef = React.useRef<ScrollView>(null);
    const { user } = useAuth();
    const currentStep = 4;
    const totalSteps = 5;

    const saveDraft = React.useCallback(async (mode: TrackingMode) => {
        try {
            await AsyncStorage.setItem(TRACKING_DRAFT_KEY, JSON.stringify({
                selectedMode: mode,
                savedAt: new Date().toISOString(),
            }));
        } catch (error) {
            console.warn('Failed to save tracking draft:', error);
        }
    }, []);

    React.useEffect(() => {
        const restoreDraft = async () => {
            await AsyncStorage.setItem(ONBOARDING_STEP_KEY, '4');
            try {
                const stored = await AsyncStorage.getItem(TRACKING_DRAFT_KEY);
                if (stored) {
                    const draft = JSON.parse(stored);
                    if (draft.selectedMode) {
                        setSelectedMode(draft.selectedMode as TrackingMode);
                    }
                }
            } catch (error) {
                console.warn('Failed to restore tracking draft:', error);
            }
        };
        restoreDraft();
    }, []);

    React.useEffect(() => {
        saveDraft(selectedMode);
    }, [selectedMode, saveDraft]);

    React.useEffect(() => {
        const subscription = AppState.addEventListener('change', (nextAppState) => {
            if (nextAppState === 'background' || nextAppState === 'inactive') {
                saveDraft(selectedMode);
            }
        });
        return () => subscription?.remove();
    }, [saveDraft, selectedMode]);

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
            // Request HealthKit permissions for meals_wearables mode on iOS
            if (isIOS && selectedMode === 'meals_wearables') {
                // Non-blocking: continue even if denied
                await requestHealthKitAuthorization().catch((e) => console.log('HK Error:', e));
                // Explicitly enable the toggle state
                await AsyncStorage.setItem('apple_health_enabled', 'true');
            }

            if (user) {
                await updateUserProfile(user.id, {
                    tracking_mode: selectedMode,
                    manual_glucose_enabled: selectedMode === 'manual_glucose_optional',
                });
            }
            await AsyncStorage.removeItem(TRACKING_DRAFT_KEY);
            await AsyncStorage.setItem(ONBOARDING_STEP_KEY, '5');
            router.push('/onboarding-5' as never);
        } catch (error) {
            Alert.alert('Error', 'Failed to save your preferences. Please try again.');
            console.error('Error saving tracking mode:', error);
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
            setSelectedMode(mode);
        }
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
                        {/* Back Button */}
                        <LiquidGlassIconButton size={44} onPress={handleBack}>
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
                                        index < totalSteps - 1 && styles.progressBarSpacing,
                                    ]}
                                />
                            ))}
                        </View>

                        {/* Content Section */}
                        <View style={styles.content}>
                            {/* Title Section */}
                            <View style={styles.titleSection}>
                                <Text style={styles.titleLabel}>CHOOSE YOUR SETUP</Text>
                                <Text style={styles.description}>
                                    How would you like to track?
                                </Text>
                            </View>

                            {/* Tracking Options */}
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
                                                    <Text style={[
                                                        styles.optionTitle,
                                                        option.disabled && styles.optionTitleDisabled,
                                                    ]}>
                                                        {option.title}
                                                    </Text>
                                                    {option.recommended && (
                                                        <View style={styles.recommendedBadge}>
                                                            <Text style={styles.recommendedText}>Recommended</Text>
                                                        </View>
                                                    )}
                                                </View>
                                                <Text style={[
                                                    styles.optionSubtitle,
                                                    option.disabled && styles.optionSubtitleDisabled,
                                                ]}>
                                                    {option.disabled ? 'Coming soon on Android' : option.subtitle}
                                                </Text>
                                            </View>

                                            {/* Radio Button */}
                                            <View style={[
                                                styles.radioOuter,
                                                isSelected && styles.radioOuterSelected,
                                                option.disabled && styles.radioOuterDisabled,
                                            ]}>
                                                {isSelected && <View style={styles.radioInner} />}
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>
                    </ScrollView>

                    {/* Continue Button */}
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
        paddingBottom: 120,
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
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 24,
    },
    progressBar: {
        height: 2,
        borderRadius: 12,
    },
    progressBarActive: {
        backgroundColor: Colors.textPrimary,
        width: 68,
    },
    progressBarInactive: {
        backgroundColor: '#878787',
        width: 68,
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
        color: '#878787',
    },
    optionSubtitle: {
        fontFamily: fonts.regular,
        fontSize: 14,
        lineHeight: 14 * 1.4,
        color: '#878787',
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
        borderColor: '#878787',
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
    buttonContainer: {
        position: 'absolute',
        bottom: 42,
        left: 16,
        right: 16,
    },
    continueButton: {
        width: '100%',
        height: 48,
        backgroundColor: Colors.buttonPrimary,
        borderWidth: 1,
        borderColor: Colors.buttonBorder,
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
