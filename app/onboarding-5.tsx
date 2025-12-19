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
    KeyboardAvoidingView,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

const { width } = Dimensions.get('window');

// Goal options
const GOALS = [
    'Reduce Meal Spikes',
    'Improve Fiber-First Habits',
    'Better Breakfast Choices',
    'Build Consistent Meal Times',
    'Reduce Late Night Snacking',
];

export default function Onboarding5Screen() {
    const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const scrollViewRef = React.useRef<ScrollView>(null);
    const { user, refreshProfile } = useAuth();
    const currentStep = 5;
    const totalSteps = 5;
    const maxSelections = 3;

    const handleContinue = async () => {
        setIsLoading(true);
        try {
            if (user) {
                await updateUserProfile(user.id, {
                    goals: selectedGoals,
                    onboarding_completed: true,
                });
                // Refresh profile to update context
                await refreshProfile();
            }
            // Navigate to dashboard
            router.replace('/(tabs)' as never);
        } catch (error) {
            Alert.alert('Error', 'Failed to save your information. Please try again.');
            console.error('Error saving profile:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleBack = () => {
        router.back();
    };

    const handleToggleGoal = (goal: string) => {
        setSelectedGoals((prev) => {
            if (prev.includes(goal)) {
                // Deselect if already selected
                return prev.filter((g) => g !== goal);
            } else {
                // Select if not at max selections
                if (prev.length < maxSelections) {
                    return [...prev, goal];
                }
                return prev; // Don't add if already at max
            }
        });
    };

    const canContinue = selectedGoals.length > 0;

    return (
        <View style={styles.container}>
            {/* Background Image */}
            <ImageBackground
                source={require('../assets/images/background.png')}
                style={styles.backgroundImage}
                resizeMode="cover"
            >
                <SafeAreaView style={styles.safeArea}>
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
                        style={styles.keyboardView}
                    >
                        <ScrollView
                            ref={scrollViewRef}
                            contentContainerStyle={styles.scrollContent}
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                            keyboardDismissMode="on-drag"
                        >
                            {/* Back Button */}
                            <TouchableOpacity
                                style={styles.backButton}
                                onPress={handleBack}
                                activeOpacity={0.7}
                            >
                                <Ionicons name="chevron-back" size={20} color={Colors.textPrimary} />
                            </TouchableOpacity>

                            {/* Progress Indicator - Below Back Button */}
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
                                    <Text style={styles.titleLabel}>WHAT ARE YOUR PRIMARY GOALS?</Text>
                                    <View style={styles.descriptionContainer}>
                                        <Text style={styles.description}>
                                            Pick the goals that matter most to you. We use these to personalize your daily nudges and insights.
                                        </Text>
                                        <Text style={styles.descriptionSpacing}></Text>
                                        <Text style={styles.description}>Choose up to three.</Text>
                                    </View>
                                </View>

                                {/* Goals List */}
                                <View style={styles.goalsListContainer}>
                                    {GOALS.map((goal, index) => {
                                        const isSelected = selectedGoals.includes(goal);
                                        return (
                                            <TouchableOpacity
                                                key={goal}
                                                style={[
                                                    styles.goalItem,
                                                    isSelected && styles.goalItemSelected,
                                                    index === GOALS.length - 1 && { marginBottom: 0 },
                                                ]}
                                                onPress={() => handleToggleGoal(goal)}
                                                activeOpacity={0.7}
                                                disabled={!isSelected && selectedGoals.length >= maxSelections}
                                            >
                                                <Text style={styles.goalItemText}>{goal}</Text>
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
                                    !canContinue && styles.continueButtonDisabled,
                                ]}
                                onPress={handleContinue}
                                activeOpacity={0.8}
                                disabled={!canContinue || isLoading}
                            >
                                {isLoading ? (
                                    <ActivityIndicator color={Colors.textPrimary} />
                                ) : (
                                    <Text style={styles.continueButtonText}>Continue</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </KeyboardAvoidingView>
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
    keyboardView: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: 16,
        paddingBottom: 200, // Extra space for keyboard and fixed button
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
        shadowOffset: {
            width: 0,
            height: 1,
        },
        shadowOpacity: 0.25,
        shadowRadius: 2,
        elevation: 2,
    },
    progressContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 24, // Spacing below progress bar
    },
    progressBar: {
        height: 2,
        borderRadius: 12,
    },
    progressBarSpacing: {
        marginRight: 5,
    },
    progressBarActive: {
        backgroundColor: Colors.textPrimary, // White
        width: 68,
    },
    progressBarInactive: {
        backgroundColor: '#878787',
        width: 68,
    },
    content: {
        width: 361, // Match Figma width
    },
    titleSection: {
        marginBottom: 32, // gap-[32px] between title section and goals list
    },
    titleLabel: {
        fontFamily: fonts.medium, // Outfit Medium (500)
        fontSize: 16,
        lineHeight: 16 * 1.2, // 1.2 line-height
        color: '#878787',
        textTransform: 'uppercase',
        marginBottom: 12, // gap-[12px] between title and description
    },
    descriptionContainer: {
        flexDirection: 'column',
    },
    description: {
        fontFamily: fonts.medium, // Outfit Medium (500)
        fontSize: 16,
        lineHeight: 16 * 1.2, // 1.2 line-height
        color: Colors.textPrimary,
    },
    descriptionSpacing: {
        height: 16, // Spacing between description paragraphs
    },
    goalsListContainer: {
        backgroundColor: 'rgba(63, 66, 67, 0.25)',
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 20,
    },
    goalItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 16,
        paddingHorizontal: 16,
        borderRadius: 8,
        marginBottom: 8,
    },
    goalItemSelected: {
        backgroundColor: '#1b1b1c',
    },
    goalItemText: {
        fontFamily: fonts.regular, // Outfit Regular (400)
        fontSize: 16,
        lineHeight: 16 * 0.95, // 0.95 line-height
        color: Colors.textPrimary,
        flex: 1,
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
        paddingHorizontal: 0,
    },
    continueButton: {
        width: '100%',
        height: 48,
        backgroundColor: '#3f4243',
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    continueButtonDisabled: {
        opacity: 0.5,
    },
    continueButtonText: {
        fontFamily: fonts.medium, // Outfit Medium (500)
        fontSize: 15,
        lineHeight: 15 * 0.95, // 0.95 line-height
        letterSpacing: 0,
        color: Colors.textPrimary, // White
    },
});

