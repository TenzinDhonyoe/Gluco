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
    ImageBackground,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function Onboarding3Screen() {
    const [heightCm, setHeightCm] = useState('');
    const [weightKg, setWeightKg] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const scrollViewRef = React.useRef<ScrollView>(null);
    const { user } = useAuth();
    const currentStep = 3;
    const totalSteps = 5;

    const handleContinue = async () => {
        setIsLoading(true);
        try {
            if (user) {
                const updates: { height_cm?: number; weight_kg?: number } = {};

                if (heightCm.trim()) {
                    const height = parseFloat(heightCm);
                    if (!isNaN(height) && height > 0) {
                        updates.height_cm = height;
                    }
                }

                if (weightKg.trim()) {
                    const weight = parseFloat(weightKg);
                    if (!isNaN(weight) && weight > 0) {
                        updates.weight_kg = weight;
                    }
                }

                if (Object.keys(updates).length > 0) {
                    await updateUserProfile(user.id, updates);
                }
            }
            router.push('/onboarding-4' as never);
        } catch (error) {
            Alert.alert('Error', 'Failed to save your information. Please try again.');
            console.error('Error saving profile:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSkip = () => {
        router.push('/onboarding-4' as never);
    };

    const handleBack = () => {
        router.back();
    };

    const hasValidInput = heightCm.trim().length > 0 || weightKg.trim().length > 0;

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
                        keyboardShouldPersistTaps="handled"
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
                                <Text style={styles.titleLabel}>OPTIONAL DETAILS</Text>
                                <Text style={styles.description}>
                                    These help personalize insights. You can skip if you prefer.
                                </Text>
                            </View>

                            {/* Form Fields */}
                            <View style={styles.formContainer}>
                                {/* Height Input */}
                                <View style={styles.inputGroup}>
                                    <Text style={styles.inputLabel}>Height</Text>
                                    <View style={styles.inputRow}>
                                        <TextInput
                                            style={styles.textInput}
                                            placeholder="Enter height"
                                            placeholderTextColor="#878787"
                                            value={heightCm}
                                            onChangeText={setHeightCm}
                                            keyboardType="numeric"
                                            maxLength={5}
                                        />
                                        <View style={styles.unitContainer}>
                                            <Text style={styles.unitText}>cm</Text>
                                        </View>
                                    </View>
                                </View>

                                {/* Weight Input */}
                                <View style={styles.inputGroup}>
                                    <Text style={styles.inputLabel}>Weight</Text>
                                    <View style={styles.inputRow}>
                                        <TextInput
                                            style={styles.textInput}
                                            placeholder="Enter weight"
                                            placeholderTextColor="#878787"
                                            value={weightKg}
                                            onChangeText={setWeightKg}
                                            keyboardType="numeric"
                                            maxLength={5}
                                        />
                                        <View style={styles.unitContainer}>
                                            <Text style={styles.unitText}>kg</Text>
                                        </View>
                                    </View>
                                </View>
                            </View>
                        </View>
                    </ScrollView>

                    {/* Button Container */}
                    <View style={styles.buttonContainer}>
                        {/* Skip Button */}
                        <TouchableOpacity
                            style={styles.skipButton}
                            onPress={handleSkip}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.skipButtonText}>Skip</Text>
                        </TouchableOpacity>

                        {/* Continue Button */}
                        <TouchableOpacity
                            style={[
                                styles.continueButton,
                                !hasValidInput && styles.continueButtonMuted,
                            ]}
                            onPress={handleContinue}
                            activeOpacity={0.8}
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <ActivityIndicator color={Colors.textPrimary} />
                            ) : (
                                <Text style={styles.continueButtonText}>
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
        paddingBottom: 140,
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
    formContainer: {},
    inputGroup: {
        marginBottom: 24,
    },
    inputLabel: {
        fontFamily: fonts.medium,
        fontSize: 16,
        lineHeight: 16 * 1.2,
        color: Colors.textPrimary,
        marginBottom: 12,
    },
    inputRow: {
        flexDirection: 'row',
        gap: 12,
    },
    textInput: {
        flex: 1,
        backgroundColor: '#1b1b1c',
        borderWidth: 1,
        borderColor: '#313135',
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 16,
        fontFamily: fonts.regular,
        fontSize: 16,
        color: Colors.textPrimary,
    },
    unitContainer: {
        backgroundColor: '#1b1b1c',
        borderWidth: 1,
        borderColor: '#313135',
        borderRadius: 8,
        paddingHorizontal: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    unitText: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: '#878787',
    },
    buttonContainer: {
        position: 'absolute',
        bottom: 42,
        left: 16,
        right: 16,
        flexDirection: 'row',
        gap: 12,
    },
    skipButton: {
        flex: 1,
        height: 48,
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: '#3f4243',
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    skipButtonText: {
        fontFamily: fonts.medium,
        fontSize: 15,
        color: '#878787',
    },
    continueButton: {
        flex: 2,
        height: 48,
        backgroundColor: Colors.buttonPrimary,
        borderWidth: 1,
        borderColor: Colors.buttonBorder,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    continueButtonMuted: {
        backgroundColor: Colors.buttonPrimary,
        opacity: 0.8,
    },
    continueButtonText: {
        fontFamily: fonts.medium,
        fontSize: 15,
        color: Colors.textPrimary,
    },
});
