import { ONBOARDING_STEP_KEY } from '@/app/index';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { LiquidGlassIconButton } from '@/components/ui/LiquidGlassButton';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { updateUserProfile } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    AppState,
    Dimensions,
    ImageBackground,
    ScrollView,
    StyleSheet,
    Text,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

// Wellness-focused goals (no medical language)
const GOALS = [
    'Understand meal patterns',
    'More consistent energy',
    'Better sleep routine',
    'Build a walking habit',
    'Fibre and nutrition',
    'General wellness tracking',
];

const MAX_SELECTIONS = 3;
const GOALS_DRAFT_KEY = 'onboarding_goals_draft';

export default function Onboarding1Screen() {
    const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const scrollViewRef = React.useRef<ScrollView>(null);
    const { user, signOut } = useAuth();
    const currentStep = 2;
    const totalSteps = 5;

    const saveDraft = React.useCallback(async (goals: string[]) => {
        try {
            if (goals.length === 0) {
                await AsyncStorage.removeItem(GOALS_DRAFT_KEY);
                return;
            }
            await AsyncStorage.setItem(GOALS_DRAFT_KEY, JSON.stringify({
                selectedGoals: goals,
                savedAt: new Date().toISOString(),
            }));
        } catch (error) {
            console.warn('Failed to save goals draft:', error);
        }
    }, []);

    React.useEffect(() => {
        const restoreDraft = async () => {
            await AsyncStorage.setItem(ONBOARDING_STEP_KEY, '2');
            try {
                const stored = await AsyncStorage.getItem(GOALS_DRAFT_KEY);
                if (stored) {
                    const draft = JSON.parse(stored);
                    if (Array.isArray(draft.selectedGoals)) {
                        setSelectedGoals(draft.selectedGoals);
                    }
                }
            } catch (error) {
                console.warn('Failed to restore goals draft:', error);
            }
        };
        restoreDraft();
    }, []);

    React.useEffect(() => {
        const timer = setTimeout(() => {
            saveDraft(selectedGoals);
        }, 300);
        return () => clearTimeout(timer);
    }, [selectedGoals, saveDraft]);

    React.useEffect(() => {
        const subscription = AppState.addEventListener('change', (nextAppState) => {
            if (nextAppState === 'background' || nextAppState === 'inactive') {
                saveDraft(selectedGoals);
            }
        });
        return () => subscription?.remove();
    }, [saveDraft, selectedGoals]);

    const handleToggleGoal = (goal: string) => {
        setSelectedGoals(prev => {
            if (prev.includes(goal)) {
                return prev.filter(g => g !== goal);
            }
            if (prev.length >= MAX_SELECTIONS) {
                return prev; // Don't add if at max
            }
            return [...prev, goal];
        });
    };

    const handleContinue = async () => {
        if (selectedGoals.length === 0) return;

        setIsLoading(true);
        try {
            if (user) {
                await updateUserProfile(user.id, {
                    goals: selectedGoals,
                });
            }
            // Save next step before navigating
            await AsyncStorage.removeItem(GOALS_DRAFT_KEY);
            await AsyncStorage.setItem(ONBOARDING_STEP_KEY, '3');
            router.push('/onboarding-3' as never);
        } catch (error) {
            Alert.alert('Error', 'Failed to save your goals. Please try again.');
            console.error('Error saving goals:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleBack = async () => {
        if (router.canGoBack()) {
            router.back();
        } else {
            // If we can't go back, it means we entered here directly (e.g. from app launch)
            // So we should sign out and go to welcome screen
            await signOut();
            router.replace('/');
        }
    };

    const isContinueEnabled = selectedGoals.length > 0;

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
                                <Text style={styles.titleLabel}>WHAT ARE YOU HERE FOR?</Text>
                                <View style={styles.descriptionContainer}>
                                    <Text style={styles.description}>
                                        Pick the goals that matter most. We'll personalize your daily nudges.
                                    </Text>
                                    <Text style={styles.descriptionSpacing}></Text>
                                    <Text style={styles.descriptionSecondary}>Choose up to three.</Text>
                                </View>
                            </View>

                            {/* Goals List */}
                            <View style={styles.goalsContainer}>
                                {GOALS.map((goal) => {
                                    const isSelected = selectedGoals.includes(goal);
                                    const isDisabled = !isSelected && selectedGoals.length >= MAX_SELECTIONS;
                                    return (
                                        <AnimatedPressable
                                            key={goal}
                                            style={[
                                                styles.goalItem,
                                                isSelected && styles.goalItemSelected,
                                                isDisabled && styles.goalItemDisabled,
                                            ]}
                                            onPress={() => handleToggleGoal(goal)}
                                            disabled={isDisabled}
                                        >
                                            <Text style={[
                                                styles.goalItemText,
                                                isSelected && styles.goalItemTextSelected,
                                                isDisabled && styles.goalItemTextDisabled,
                                            ]}>
                                                {goal}
                                            </Text>
                                            {isSelected && (
                                                <Ionicons
                                                    name="checkmark-circle"
                                                    size={24}
                                                    color={Colors.textPrimary}
                                                />
                                            )}
                                            {!isSelected && (
                                                <View style={styles.checkmarkPlaceholder} />
                                            )}
                                        </AnimatedPressable>
                                    );
                                })}
                            </View>
                        </View>
                    </ScrollView>

                    {/* Continue Button - Fixed at Bottom */}
                    <View style={styles.buttonContainer}>
                        <AnimatedPressable
                            style={[
                                styles.continueButton,
                                !isContinueEnabled && styles.continueButtonDisabled,
                            ]}
                            onPress={handleContinue}
                            disabled={!isContinueEnabled || isLoading}
                        >
                            {isLoading ? (
                                <ActivityIndicator color={Colors.textPrimary} />
                            ) : (
                                <Text style={[
                                    styles.continueButtonText,
                                    !isContinueEnabled && styles.continueButtonTextDisabled,
                                ]}>
                                    Continue
                                </Text>
                            )}
                        </AnimatedPressable>
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
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 16,
        marginBottom: 24,
        gap: 16,
    },
    backButton: {
        // No extra margins needed
    },
    progressContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
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
    descriptionContainer: {},
    description: {
        fontFamily: fonts.medium,
        fontSize: 16,
        lineHeight: 16 * 1.4,
        color: Colors.textPrimary,
    },
    descriptionSpacing: {
        height: 8,
    },
    descriptionSecondary: {
        fontFamily: fonts.medium,
        fontSize: 14,
        lineHeight: 14 * 1.4,
        color: '#878787',
    },
    goalsContainer: {
        gap: 12,
    },
    goalItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(63, 66, 67, 0.3)',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 16,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    goalItemSelected: {
        backgroundColor: 'rgba(40, 94, 42, 0.3)',
        borderColor: Colors.buttonPrimary,
    },
    goalItemDisabled: {
        opacity: 0.5,
    },
    goalItemText: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: Colors.textPrimary,
        flex: 1,
    },
    goalItemTextSelected: {
        color: Colors.textPrimary,
    },
    goalItemTextDisabled: {
        color: '#878787',
    },
    checkmarkPlaceholder: {
        width: 24,
        height: 24,
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
    continueButtonDisabled: {
        backgroundColor: '#3f4243',
        borderColor: '#3f4243',
    },
    continueButtonText: {
        fontFamily: fonts.medium,
        fontSize: 15,
        color: Colors.textPrimary,
    },
    continueButtonTextDisabled: {
        color: '#878787',
    },
});
