import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { updateUserProfile } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    ImageBackground,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
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

export default function Onboarding1Screen() {
    const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const scrollViewRef = React.useRef<ScrollView>(null);
    const { user, signOut } = useAuth();
    const currentStep = 2;
    const totalSteps = 5;

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
                source={require('../assets/images/background.png')}
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
                        <TouchableOpacity
                            style={styles.backButton}
                            onPress={handleBack}
                            activeOpacity={0.7}
                        >
                            <Ionicons name="chevron-back" size={20} color={Colors.textPrimary} />
                        </TouchableOpacity>

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
                                        <TouchableOpacity
                                            key={goal}
                                            style={[
                                                styles.goalItem,
                                                isSelected && styles.goalItemSelected,
                                                isDisabled && styles.goalItemDisabled,
                                            ]}
                                            onPress={() => handleToggleGoal(goal)}
                                            activeOpacity={0.7}
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
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>
                    </ScrollView>

                    {/* Continue Button - Fixed at Bottom */}
                    <View style={styles.buttonContainer}>
                        <TouchableOpacity
                            style={[
                                styles.continueButton,
                                !isContinueEnabled && styles.continueButtonDisabled,
                            ]}
                            onPress={handleContinue}
                            activeOpacity={0.8}
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
    progressBarSpacing: {
        marginRight: 5,
    },
    progressBarActive: {
        backgroundColor: Colors.textPrimary,
        width: 68,
    },
    progressBarInactive: {
        backgroundColor: '#878787',
        width: 68,
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
        backgroundColor: Colors.buttonPrimary,
        borderWidth: 1,
        borderColor: Colors.buttonBorder,
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
