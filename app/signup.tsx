import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
    Alert,
    Image,
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

export default function SignUpScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [agreeToTerms, setAgreeToTerms] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const { signUp } = useAuth();

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

    const handleGoogleSignIn = () => {
        // TODO: Implement Google Sign In with Supabase OAuth
        Alert.alert('Coming Soon', 'Google Sign In will be available soon');
    };

    const handleAppleSignIn = () => {
        // TODO: Implement Apple Sign In with Supabase OAuth
        Alert.alert('Coming Soon', 'Apple Sign In will be available soon');
    };

    const handleBack = () => {
        router.back();
    };

    const handleSignIn = () => {
        router.push('/signin');
    };

    const isFormValid = agreeToTerms && email.trim().length > 0 && password.trim().length >= 6;

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
                            <TouchableOpacity
                                style={styles.backButton}
                                onPress={handleBack}
                                activeOpacity={0.7}
                            >
                                <Ionicons name="chevron-back" size={20} color={Colors.textPrimary} />
                            </TouchableOpacity>

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
                            </View>

                            {/* Agreement and Button Section */}
                            <View style={styles.agreementSection}>
                                {/* Agreement Checkbox */}
                                <TouchableOpacity
                                    style={styles.checkboxContainer}
                                    onPress={() => setAgreeToTerms(!agreeToTerms)}
                                    activeOpacity={0.7}
                                >
                                    <View style={[styles.checkbox, agreeToTerms && styles.checkboxChecked]}>
                                        {agreeToTerms && (
                                            <Ionicons name="checkmark" size={14} color={Colors.textPrimary} />
                                        )}
                                    </View>
                                    <Text style={styles.checkboxText}>
                                        I agree to the Privacy Policy & Terms of Service
                                    </Text>
                                </TouchableOpacity>

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

                                {/* Divider */}
                                <View style={styles.dividerContainer}>
                                    <View style={styles.dividerDashed} />
                                    <Text style={styles.dividerText}>Or Sign in with</Text>
                                    <View style={styles.dividerDashed} />
                                </View>

                                {/* Social Sign In Icons (Coming Soon) */}
                                <View style={styles.socialIconsContainer}>
                                    <TouchableOpacity
                                        style={[styles.socialIconButton, { opacity: 0.4 }]}
                                        onPress={handleGoogleSignIn}
                                        activeOpacity={0.8}
                                    >
                                        <Image
                                            source={require('../assets/images/google-logo.png')}
                                            style={styles.socialIcon}
                                            resizeMode="contain"
                                        />
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={[styles.socialIconButton, { opacity: 0.4 }]}
                                        onPress={handleAppleSignIn}
                                        activeOpacity={0.8}
                                    >
                                        <Ionicons name="logo-apple" size={48} color={Colors.textPrimary} />
                                    </TouchableOpacity>
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
        borderColor: Colors.buttonBorder,
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
    socialIconsContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginBottom: 24,
    },
    socialIconButton: {
        width: 48,
        height: 48,
        justifyContent: 'center',
        alignItems: 'center',
        marginHorizontal: 12,
    },
    socialIcon: {
        width: 48,
        height: 48,
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
});
