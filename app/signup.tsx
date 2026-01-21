import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LiquidGlassIconButton } from '@/components/ui/LiquidGlassButton';
import { Colors } from '@/constants/Colors';
import { LEGAL_URLS } from '@/constants/legal';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
    Alert,
    ImageBackground,
    KeyboardAvoidingView,
    Linking,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SignUpScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [agreeToTerms, setAgreeToTerms] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isAppleLoading, setIsAppleLoading] = useState(false);
    const { signUp, signInWithApple } = useAuth();

    const handleContinue = async () => {
        if (!agreeToTerms) return;
        if (!email.trim() || !password.trim()) {
            Alert.alert('Error', 'Please enter both email and password');
            return;
        }

        if (password.trim().length < 6) {
            Alert.alert('Error', 'Password must be at least 6 characters');
            return;
        }

        if (password !== confirmPassword) {
            Alert.alert('Error', 'Passwords do not match');
            return;
        }

        setIsLoading(true);
        try {
            const { error } = await signUp(email.trim(), password);

            if (error) {
                Alert.alert('Sign Up Error', error.message);
                return;
            }

            // Navigate to email confirmation screen
            router.push({
                pathname: '/confirm-email',
                params: { email: email.trim() },
            } as never);
        } catch (err) {
            Alert.alert('Error', 'An unexpected error occurred. Please try again.');
            console.error('Sign up error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAppleSignIn = async () => {
        if (!agreeToTerms) {
            Alert.alert('Terms Required', 'Please accept the Terms of Service and Privacy Policy to continue.');
            return;
        }
        if (Platform.OS !== 'ios') {
            Alert.alert('Not Available', 'Apple Sign-In is only available on iOS devices.');
            return;
        }

        setIsAppleLoading(true);
        try {
            const { error } = await signInWithApple();

            if (error) {
                Alert.alert('Apple Sign-In Error', error.message);
                return;
            }

            // Navigate to index/onboarding
            router.replace('/' as never);
        } catch (err) {
            Alert.alert('Error', 'An unexpected error occurred. Please try again.');
            console.error('Apple sign in error:', err);
        } finally {
            setIsAppleLoading(false);
        }
    };





    const handleBack = () => {
        router.back();
    };

    const handleSignIn = () => {
        router.push('/signin');
    };

    const isFormValid = agreeToTerms && email.trim().length > 0 && password.trim().length >= 6 && password === confirmPassword;

    return (
        <View style={styles.container}>
            <ImageBackground
                source={require('../assets/images/backgrounds/background.png')}
                style={styles.backgroundImage}
                resizeMode="cover"
            >
                <SafeAreaView style={styles.safeArea}>
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        style={styles.keyboardView}
                    >
                        <ScrollView
                            contentContainerStyle={styles.scrollContent}
                            showsVerticalScrollIndicator={false}
                        >
                            {/* Back Button */}
                            <LiquidGlassIconButton
                                size={44}
                                onPress={handleBack}
                                style={styles.backButton}
                            >
                                <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
                            </LiquidGlassIconButton>

                            {/* Header Section */}
                            <View style={styles.headerSection}>
                                <Text style={styles.signUpLabel}>SIGN UP</Text>
                                <Text style={styles.headerText}>
                                    Create your account so we can start learning how your body responds to food, movement, and sleep.
                                </Text>
                            </View>

                            {/* Form Container */}
                            <View style={styles.formContainer}>
                                {/* Email Input */}
                                <View style={styles.inputGroup}>
                                    <Text style={styles.inputLabel}>Email</Text>
                                    <Input
                                        value={email}
                                        onChangeText={setEmail}
                                        placeholder="Email"
                                        keyboardType="email-address"
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                    />
                                </View>

                                {/* Password Input */}
                                <View style={styles.inputGroup}>
                                    <Text style={styles.inputLabel}>Password</Text>
                                    <Input
                                        value={password}
                                        onChangeText={setPassword}
                                        placeholder="Password"
                                        secureTextEntry={!showPassword}
                                        autoCapitalize="none"
                                        right={(
                                            <TouchableOpacity
                                                style={styles.eyeButton}
                                                onPress={() => setShowPassword(!showPassword)}
                                            >
                                                <Ionicons
                                                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                                                    size={22}
                                                    color="#878787"
                                                />
                                            </TouchableOpacity>
                                        )}
                                    />
                                </View>

                                {/* Confirm Password Input */}
                                <View style={styles.inputGroup}>
                                    <Text style={styles.inputLabel}>Confirm Password</Text>
                                    <Input
                                        value={confirmPassword}
                                        onChangeText={setConfirmPassword}
                                        placeholder="Confirm Password"
                                        secureTextEntry={!showConfirmPassword}
                                        autoCapitalize="none"
                                        right={(
                                            <TouchableOpacity
                                                style={styles.eyeButton}
                                                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                                            >
                                                <Ionicons
                                                    name={showConfirmPassword ? "eye-off-outline" : "eye-outline"}
                                                    size={22}
                                                    color="#878787"
                                                />
                                            </TouchableOpacity>
                                        )}
                                    />
                                </View>
                            </View>

                            {/* Agreement and Button Section */}
                            <View style={styles.agreementSection}>
                                {/* Agreement Checkbox */}
                                <AnimatedPressable
                                    style={styles.checkboxContainer}
                                    onPress={() => setAgreeToTerms(!agreeToTerms)}
                                >
                                    <View style={[styles.checkbox, agreeToTerms && styles.checkboxChecked]}>
                                        {agreeToTerms && (
                                            <Ionicons name="checkmark" size={14} color={Colors.textPrimary} />
                                        )}
                                    </View>
                                    <Text style={styles.checkboxText}>
                                        I agree to the{' '}
                                        <Text
                                            style={styles.legalLink}
                                            onPress={() => Linking.openURL(LEGAL_URLS.privacyPolicy)}
                                        >
                                            Privacy Policy
                                        </Text>
                                        {' & '}
                                        <Text
                                            style={styles.legalLink}
                                            onPress={() => Linking.openURL(LEGAL_URLS.termsAndConditions)}
                                        >
                                            Terms of Service
                                        </Text>
                                    </Text>
                                </AnimatedPressable>

                                {/* Continue Button */}
                                <Button
                                    onPress={handleContinue}
                                    disabled={!isFormValid}
                                    loading={isLoading}
                                    style={styles.continueButton}
                                >
                                    Continue
                                </Button>

                                {/* Social Sign-In */}
                                <View style={styles.socialContainer}>
                                    {/* OR Divider */}
                                    <View style={styles.dividerContainer}>
                                        <View style={styles.dividerDashed} />
                                        <Text style={styles.dividerText}>OR</Text>
                                        <View style={styles.dividerDashed} />
                                    </View>

                                    {/* Apple Sign-In Button - iOS Only */}
                                    {Platform.OS === 'ios' && (
                                        <AnimatedPressable
                                            style={[styles.appleButton, (isAppleLoading || !agreeToTerms) && styles.socialButtonDisabled]}
                                            onPress={handleAppleSignIn}
                                            disabled={isAppleLoading}
                                        >
                                            <View style={styles.appleIconContainer}>
                                                <Ionicons name="logo-apple" size={22} color="#FFFFFF" />
                                            </View>
                                            <Text style={styles.appleButtonText}>
                                                {isAppleLoading ? 'Signing in...' : 'Sign up with Apple'}
                                            </Text>
                                        </AnimatedPressable>
                                    )}

                                </View>


                                {/* Sign In Link */}
                                <Text style={styles.signInText}>
                                    Already have an account?{' '}
                                    <Text style={styles.signInLink} onPress={handleSignIn}>Sign in</Text>
                                </Text>
                            </View>
                        </ScrollView>
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
        paddingBottom: 40,
    },
    backButton: {
        marginTop: 16,
        marginBottom: 20,
        alignSelf: 'flex-start',
    },
    headerSection: {
        marginBottom: 36,
    },
    signUpLabel: {
        fontFamily: fonts.medium, // Outfit Medium (500)
        fontSize: 16,
        lineHeight: 16 * 1.2, // 1.2 line-height
        color: '#878787',
        marginBottom: 12,
    },
    headerText: {
        fontFamily: fonts.bold, // Outfit Bold (700)
        fontSize: 16,
        lineHeight: 16 * 1.2, // 1.2 line-height
        color: Colors.textPrimary,
    },
    formContainer: {
        marginBottom: 24,
    },
    inputGroup: {
        marginBottom: 24,
    },
    inputLabel: {
        fontFamily: fonts.medium, // Outfit Medium (500)
        fontSize: 16,
        lineHeight: 16 * 0.95, // 0.95 line-height
        color: Colors.textPrimary,
        marginBottom: 24,
    },
    // Input styling is now provided by <Input />
    eyeButton: {
        padding: 0,
        justifyContent: 'center',
        alignItems: 'center',
    },
    agreementSection: {
        // Gap handled by individual component margins
    },
    // Checkbox styles
    checkboxContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        marginBottom: 24,
    },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: '#48484D',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    checkboxChecked: {
        backgroundColor: Colors.buttonPrimary,
        borderColor: Colors.primary,
    },
    checkboxText: {
        fontFamily: fonts.medium, // Outfit Medium (500)
        fontSize: 14,
        lineHeight: 14 * 0.95, // 0.95 line-height
        color: Colors.textPrimary,
        flex: 1,
    },
    // Continue Button
    continueButton: {
        marginBottom: 24,
    },
    // Button styling is now provided by <Button />
    // Divider with dashed style
    dividerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 24,
    },
    dividerDashed: {
        flex: 1,
        height: 1,
        borderStyle: 'dashed',
        borderWidth: 0.5,
        borderColor: Colors.inputBorder,
    },
    dividerText: {
        fontFamily: fonts.medium, // Outfit Medium (500)
        fontSize: 15,
        lineHeight: 15 * 0.95, // 0.95 line-height
        color: Colors.textPrimary,
        marginHorizontal: 8,
    },
    // Social icons (just icons, not full buttons)
    socialContainer: {
        marginBottom: 24,
    },

    appleButton: {
        width: '100%',
        height: 56,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#080b12',
        borderWidth: 1.5,
        borderColor: '#171a1f',
        borderRadius: 13,
        paddingHorizontal: 25,
        marginBottom: 24,
    },
    appleIconContainer: {
        marginRight: 50,
    },
    appleButtonText: {
        fontFamily: fonts.medium,
        fontSize: 16,
        lineHeight: 16 * 1.2,
        color: Colors.textPrimary,
    },
    socialButtonDisabled: {
        opacity: 0.5,
    },
    // Sign In link - Outfit Medium (500), 14px, line-height 1.2
    signInText: {
        fontFamily: fonts.medium, // Outfit Medium (500)
        fontSize: 14,
        lineHeight: 14 * 1.2, // 1.2 line-height
        textAlign: 'center',
        color: Colors.textPrimary,
    },
    signInLink: {
        color: '#0e9cff', // Blue link color from Figma
        textDecorationLine: 'underline',
    },
    legalLink: {
        color: '#47aa4b', // Green link color
        textDecorationLine: 'underline',
    },
});
