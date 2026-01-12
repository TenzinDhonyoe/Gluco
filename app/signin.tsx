import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
    Alert,
    ImageBackground,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SignInScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isAppleLoading, setIsAppleLoading] = useState(false);
    const [isGoogleLoading, setIsGoogleLoading] = useState(false);
    const { signIn, signInWithApple, signInWithGoogle } = useAuth();

    const handleContinue = async () => {
        if (!email.trim() || !password.trim()) {
            Alert.alert('Error', 'Please enter both email and password');
            return;
        }

        setIsLoading(true);
        try {
            const { error } = await signIn(email.trim(), password);

            if (error) {
                Alert.alert('Sign In Error', error.message);
                return;
            }

            // Navigate to index which will handle routing based on profile status
            router.replace('/' as never);
        } catch (err) {
            Alert.alert('Error', 'An unexpected error occurred. Please try again.');
            console.error('Sign in error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAppleSignIn = async () => {
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

            // Navigate to index which will handle routing based on profile status
            router.replace('/' as never);
        } catch (err) {
            Alert.alert('Error', 'An unexpected error occurred. Please try again.');
            console.error('Apple sign in error:', err);
        } finally {
            setIsAppleLoading(false);
        }
    };

    const handleGoogleSignIn = async () => {
        setIsGoogleLoading(true);
        try {
            const { error } = await signInWithGoogle();

            if (error) {
                Alert.alert('Google Sign-In Error', error.message);
                return;
            }

            // Navigate to index which will handle routing based on profile status
            router.replace('/' as never);
        } catch (err) {
            Alert.alert('Error', 'An unexpected error occurred. Please try again.');
            console.error('Google sign in error:', err);
        } finally {
            setIsGoogleLoading(false);
        }
    };


    const handleBack = () => {
        router.replace('/');
    };

    const handleSignUp = () => {
        router.push('/signup');
    };

    const handleForgotPassword = () => {
        if (!email.trim()) {
            Alert.alert(
                'Enter Email',
                'Please enter your email address first, then tap Forgot Password.'
            );
            return;
        }

        Alert.alert(
            'Reset Password',
            `Send password reset link to ${email.trim()}?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Send Link',
                    onPress: async () => {
                        try {
                            const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
                                redirectTo: 'glucofigma://reset-password',
                            });

                            if (error) {
                                Alert.alert('Error', error.message);
                            } else {
                                Alert.alert('Success', 'Password reset link sent! Check your email.');
                            }
                        } catch (err) {
                            Alert.alert('Error', 'Failed to send reset link. Please try again.');
                        }
                    },
                },
            ]
        );
    };

    const isFormValid = email.trim().length > 0 && password.trim().length > 0;

    return (
        <View style={styles.container}>
            <ImageBackground
                source={require('../assets/images/background.png')}
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
                            <AnimatedPressable
                                style={styles.backButton}
                                onPress={handleBack}
                            >
                                <Ionicons name="chevron-back" size={20} color={Colors.textPrimary} />
                            </AnimatedPressable>

                            {/* Header Text */}
                            <Text style={styles.headerText}>
                                Welcome! Sign in to see your latest glucose trends and habit insights.
                            </Text>

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
                            </View>

                            {/* Forgot Password Link */}
                            <AnimatedPressable
                                style={styles.forgotPasswordContainer}
                                onPress={handleForgotPassword}
                            >
                                <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
                            </AnimatedPressable>

                            {/* Continue Button */}
                            <Button
                                onPress={handleContinue}
                                disabled={!isFormValid}
                                loading={isLoading}
                                variant="primary"
                                style={styles.continueButton}
                            >
                                Continue
                            </Button>

                            {/* Social Sign-In - iOS only for Apple */}
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
                                        style={[styles.appleButton, isAppleLoading && styles.socialButtonDisabled]}
                                        onPress={handleAppleSignIn}
                                        disabled={isAppleLoading || isGoogleLoading}
                                    >
                                        <View style={styles.appleIconContainer}>
                                            <Ionicons name="logo-apple" size={22} color="#FFFFFF" />
                                        </View>
                                        <Text style={styles.appleButtonText}>
                                            {isAppleLoading ? 'Signing in...' : 'Continue with Apple'}
                                        </Text>
                                    </AnimatedPressable>
                                )}

                                {/* Google Sign-In Button */}
                                <AnimatedPressable
                                    style={[styles.googleButton, isGoogleLoading && styles.socialButtonDisabled]}
                                    onPress={handleGoogleSignIn}
                                    disabled={isGoogleLoading || isAppleLoading}
                                >
                                    <View style={styles.appleIconContainer}>
                                        <Ionicons name="logo-google" size={22} color="#000000" />
                                    </View>
                                    <Text style={styles.googleButtonText}>
                                        {isGoogleLoading ? 'Signing in...' : 'Continue with Google'}
                                    </Text>
                                </AnimatedPressable>
                            </View>

                            {/* Sign Up Link */}
                            <Text style={styles.signUpText}>
                                Don&apos;t have an account with us?{' '}
                                <Text style={styles.signUpLink} onPress={handleSignUp}>Sign Up</Text>
                            </Text>
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
    // Back button - circular
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
    // Header text - Outfit Medium, 16px, line-height 1.2
    headerText: {
        fontFamily: fonts.medium, // Outfit Medium (500)
        fontSize: 16,
        lineHeight: 16 * 1.2, // 1.2 line-height
        color: Colors.textPrimary,
        marginBottom: 24,
    },
    formContainer: {
        marginBottom: 24,
    },
    inputGroup: {
        marginBottom: 24,
    },
    // Input label - Outfit Medium, 16px, line-height 0.95
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
    continueButton: {
        marginBottom: 18,
    },
    // Button styling is now provided by <Button />
    // Divider - dashed lines with "OR" text
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
        fontFamily: fonts.regular, // Outfit Regular (400)
        fontSize: 14,
        lineHeight: 14 * 1.2, // 1.2 line-height
        color: '#616161',
        marginHorizontal: 18,
    },
    // Social buttons container
    socialContainer: {
        marginBottom: 24,
    },
    // Google logo image
    googleLogo: {
        width: 24,
        height: 24,
        marginRight: 50,
    },
    // Google Button - white with #dddddd border, 13px radius
    googleButton: {
        width: '100%',
        height: 50,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: Colors.googleBackground, // White
        borderWidth: 1.5,
        borderColor: '#dddddd',
        borderRadius: 13,
        paddingHorizontal: 25,
        marginBottom: 12,
    },
    googleButtonText: {
        fontFamily: fonts.medium, // Outfit Medium (500)
        fontSize: 16,
        lineHeight: 16 * 1.2, // 1.2 line-height
        color: '#0f1623',
    },
    // Apple Button - #080b12 background, #171a1f border, 13px radius
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
        fontFamily: fonts.medium, // Outfit Medium (500)
        fontSize: 16,
        lineHeight: 16 * 1.2, // 1.2 line-height
        color: Colors.textPrimary,
    },
    // Sign Up link - Outfit Regular (400), 14px
    signUpText: {
        fontFamily: fonts.regular, // Outfit Regular (400)
        fontSize: 14,
        lineHeight: 14 * 1.0, // normal line-height
        textAlign: 'center',
        color: '#97a0ab',
    },
    signUpLink: {
        color: '#47aa4b', // Green link color from Figma
        fontFamily: fonts.regular,
    },
    // Forgot Password link
    forgotPasswordContainer: {
        alignSelf: 'flex-end',
        marginBottom: 20,
        marginTop: -8,
    },
    forgotPasswordText: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#3494D9',
    },
    // Coming Soon styling for social buttons
    socialButtonDisabled: {
        opacity: 0.7,
    },
    comingSoonBadge: {
        position: 'absolute',
        right: 12,
        backgroundColor: '#3F4243',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 4,
    },
    comingSoonText: {
        fontFamily: fonts.medium,
        fontSize: 10,
        color: '#AAAAAA',
        textTransform: 'uppercase',
    },
});
