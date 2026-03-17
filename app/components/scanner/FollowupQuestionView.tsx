/**
 * Followup Question View
 * Inline UI for confirming low-confidence detections or entering portion sizes
 */

import { Colors } from '@/constants/Colors';
import { fonts } from '@/hooks/useFonts';
import { FollowupQuestion, FollowupResponse, FollowupType } from '@/lib/photoAnalysis/types';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useState } from 'react';
import {
    Keyboard,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import Animated, {
    FadeIn,
    FadeOut,
    Layout,
} from 'react-native-reanimated';

interface FollowupQuestionViewProps {
    /**
     * List of followup questions to display
     */
    questions: FollowupQuestion[];

    /**
     * Callback when all questions have been answered
     */
    onComplete: (responses: FollowupResponse[]) => void;

    /**
     * Callback when user wants to skip followups
     */
    onSkip?: () => void;

    /**
     * Optional title for the section
     */
    title?: string;
}

interface SingleQuestionProps {
    question: FollowupQuestion;
    onAnswer: (response: FollowupResponse) => void;
    isActive: boolean;
}

/**
 * Single followup question component
 */
function SingleQuestion({ question, onAnswer, isActive }: SingleQuestionProps) {
    const [customAmount, setCustomAmount] = useState('');
    const [showCustomInput, setShowCustomInput] = useState(false);

    const handleOptionPress = useCallback((option: string) => {
        if (Platform.OS === 'ios') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }

        // Handle special "Enter grams" option
        if (option === 'Enter grams') {
            setShowCustomInput(true);
            return;
        }

        onAnswer({
            question_id: question.id,
            answer: option,
        });
    }, [question.id, onAnswer]);

    const handleCustomSubmit = useCallback(() => {
        const amount = parseFloat(customAmount);
        if (isNaN(amount) || amount <= 0) {
            return;
        }

        Keyboard.dismiss();
        onAnswer({
            question_id: question.id,
            answer: amount,
        });
    }, [question.id, customAmount, onAnswer]);

    // Get icon based on question type
    const getIcon = (type: FollowupType): keyof typeof Ionicons.glyphMap => {
        switch (type) {
            case 'confirm_items':
                return 'help-circle-outline';
            case 'enter_amount':
                return 'scale-outline';
            case 'choose_one':
            default:
                return 'checkmark-circle-outline';
        }
    };

    if (!isActive) {
        return null;
    }

    return (
        <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(150)}
            layout={Layout.duration(200)}
            style={styles.questionContainer}
        >
            {/* Question Header */}
            <View style={styles.questionHeader}>
                <View style={styles.questionIconContainer}>
                    <Ionicons
                        name={getIcon(question.type)}
                        size={20}
                        color={Colors.primary}
                    />
                </View>
                <Text style={styles.questionText}>{question.question}</Text>
            </View>

            {/* Custom Amount Input (for portion entry) */}
            {showCustomInput ? (
                <View style={styles.customInputContainer}>
                    <TextInput
                        style={styles.customInput}
                        value={customAmount}
                        onChangeText={setCustomAmount}
                        placeholder="Enter amount in grams"
                        placeholderTextColor={Colors.textPlaceholder}
                        keyboardType="numeric"
                        autoFocus
                        returnKeyType="done"
                        onSubmitEditing={handleCustomSubmit}
                    />
                    <View style={styles.customInputButtons}>
                        <Pressable
                            style={styles.cancelCustomButton}
                            onPress={() => {
                                setShowCustomInput(false);
                                setCustomAmount('');
                                Keyboard.dismiss();
                            }}
                        >
                            <Text style={styles.cancelCustomText}>Cancel</Text>
                        </Pressable>
                        <Pressable
                            style={[
                                styles.submitCustomButton,
                                !customAmount && styles.submitCustomButtonDisabled,
                            ]}
                            onPress={handleCustomSubmit}
                            disabled={!customAmount}
                        >
                            <Text style={styles.submitCustomText}>Confirm</Text>
                        </Pressable>
                    </View>
                </View>
            ) : (
                /* Option Buttons */
                <View style={styles.optionsContainer}>
                    {question.options?.map((option, index) => (
                        <Pressable
                            key={index}
                            style={({ pressed }) => [
                                styles.optionButton,
                                pressed && styles.optionButtonPressed,
                                option === 'No, remove it' && styles.optionButtonDanger,
                            ]}
                            onPress={() => handleOptionPress(option)}
                        >
                            <Text
                                style={[
                                    styles.optionText,
                                    option === 'No, remove it' && styles.optionTextDanger,
                                ]}
                            >
                                {option}
                            </Text>
                        </Pressable>
                    ))}
                </View>
            )}
        </Animated.View>
    );
}

export default function FollowupQuestionView({
    questions,
    onComplete,
    onSkip,
    title = 'Quick Confirmation',
}: FollowupQuestionViewProps) {
    const [responses, setResponses] = useState<FollowupResponse[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);

    const handleAnswer = useCallback((response: FollowupResponse) => {
        const newResponses = [...responses, response];
        setResponses(newResponses);

        // Move to next question or complete
        if (currentIndex < questions.length - 1) {
            setCurrentIndex(currentIndex + 1);
        } else {
            onComplete(newResponses);
        }
    }, [responses, currentIndex, questions.length, onComplete]);

    const handleSkip = useCallback(() => {
        if (onSkip) {
            onSkip();
        } else {
            // If no skip handler, complete with empty responses
            onComplete([]);
        }
    }, [onSkip, onComplete]);

    if (questions.length === 0) {
        return null;
    }

    const progress = responses.length / questions.length;

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.title}>{title}</Text>
                <Pressable
                    style={styles.skipButton}
                    onPress={handleSkip}
                    hitSlop={8}
                >
                    <Text style={styles.skipText}>Skip</Text>
                </Pressable>
            </View>

            {/* Progress Indicator */}
            <View style={styles.progressContainer}>
                <View style={styles.progressBar}>
                    <Animated.View
                        style={[
                            styles.progressFill,
                            { width: `${progress * 100}%` },
                        ]}
                        layout={Layout.duration(200)}
                    />
                </View>
                <Text style={styles.progressText}>
                    {responses.length + 1} of {questions.length}
                </Text>
            </View>

            {/* Current Question */}
            <SingleQuestion
                key={questions[currentIndex].id}
                question={questions[currentIndex]}
                onAnswer={handleAnswer}
                isActive={true}
            />

            {/* Hint Text */}
            <Text style={styles.hintText}>
                Helps improve accuracy for your meal log
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: 'rgba(0, 0, 0, 0.03)',
        borderRadius: 16,
        padding: 16,
        marginVertical: 12,
        borderWidth: 1,
        borderColor: Colors.borderCard,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    title: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: Colors.textPrimary,
    },
    skipButton: {
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    skipText: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: Colors.textSecondary,
    },
    progressContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
        gap: 12,
    },
    progressBar: {
        flex: 1,
        height: 4,
        backgroundColor: 'rgba(0, 0, 0, 0.08)',
        borderRadius: 2,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: Colors.primary,
        borderRadius: 2,
    },
    progressText: {
        fontFamily: fonts.medium,
        fontSize: 12,
        color: Colors.textSecondary,
        minWidth: 50,
        textAlign: 'right',
    },
    questionContainer: {
        marginBottom: 12,
    },
    questionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        gap: 10,
    },
    questionIconContainer: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: Colors.primaryLight,
        justifyContent: 'center',
        alignItems: 'center',
    },
    questionText: {
        flex: 1,
        fontFamily: fonts.medium,
        fontSize: 15,
        color: Colors.textPrimary,
        lineHeight: 20,
    },
    optionsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    optionButton: {
        backgroundColor: Colors.buttonSecondary,
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: Colors.borderMedium,
    },
    optionButtonPressed: {
        backgroundColor: 'rgba(0, 0, 0, 0.10)',
        transform: [{ scale: 0.98 }],
    },
    optionButtonDanger: {
        borderColor: 'rgba(255, 59, 48, 0.3)',
    },
    optionText: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: Colors.textPrimary,
    },
    optionTextDanger: {
        color: '#FF3B30',
    },
    customInputContainer: {
        gap: 12,
    },
    customInput: {
        backgroundColor: Colors.inputBackgroundSolid,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        fontFamily: fonts.medium,
        fontSize: 16,
        color: Colors.textPrimary,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    customInputButtons: {
        flexDirection: 'row',
        gap: 12,
    },
    cancelCustomButton: {
        flex: 1,
        backgroundColor: Colors.buttonSecondary,
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: 'center',
    },
    cancelCustomText: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: Colors.textPrimary,
    },
    submitCustomButton: {
        flex: 2,
        backgroundColor: Colors.buttonAction,
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: 'center',
    },
    submitCustomButtonDisabled: {
        opacity: 0.5,
    },
    submitCustomText: {
        fontFamily: fonts.semiBold,
        fontSize: 14,
        color: Colors.buttonActionText,
    },
    hintText: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: Colors.textSecondary,
        textAlign: 'center',
        marginTop: 8,
    },
});
