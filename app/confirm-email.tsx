import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ImageBackground,
    SafeAreaView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

export default function ConfirmEmailScreen() {
    const { email } = useLocalSearchParams<{ email: string }>();
    const { user, profile } = useAuth();
    const [isResending, setIsResending] = useState(false);
    const [resendCooldown, setResendCooldown] = useState(0);

    // Poll for email confirmation status
    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;

        const checkEmailConfirmation = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (session?.user?.email_confirmed_at) {
                    // User has confirmed their email
                    clearInterval(interval);

                    // Refresh the auth context
                    await supabase.auth.refreshSession();

                    // Navigate to index which will route to appropriate onboarding step
                    router.replace('/' as never);
                }
            } catch (error) {
                console.error('Error checking confirmation:', error);
            }
        };

        // Check immediately
        checkEmailConfirmation();

        // Then poll every 3 seconds
        interval = setInterval(checkEmailConfirmation, 3000);

        return () => {
            if (interval) clearInterval(interval);
        };
    }, []);

    // Also watch for auth state changes
    useEffect(() => {
        if (user && user.email_confirmed_at) {
            // User has confirmed their email
            if (profile?.onboarding_completed) {
                // Already completed onboarding, go to home
                router.replace('/' as never);
            } else {
                // Go to onboarding
                router.replace('/onboarding-2' as never);
            }
        }
    }, [user, profile]);

    // Countdown timer for resend cooldown
    useEffect(() => {
        if (resendCooldown > 0) {
            const timer = setTimeout(() => {
                setResendCooldown(resendCooldown - 1);
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [resendCooldown]);

    const handleResendEmail = async () => {
        if (resendCooldown > 0 || !email) return;

        setIsResending(true);
        try {
            const { error } = await supabase.auth.resend({
                type: 'signup',
                email: email,
            });

            if (error) {
                Alert.alert('Error', error.message);
            } else {
                Alert.alert('Email Sent', 'A new confirmation email has been sent to your inbox.');
                setResendCooldown(60); // 60 second cooldown
            }
        } catch (err) {
            console.error('Error resending confirmation email:', err);
            Alert.alert('Error', 'Failed to resend email. Please try again.');
        } finally {
            setIsResending(false);
        }
    };

    const handleBack = () => {
        router.replace('/' as never);
    };

    const handleOpenEmail = () => {
        Alert.alert(
            'Check Your Email',
            'Please open your email app and click the confirmation link.\n\nNote: After clicking the link, you may see a page that says "localhost refused to connect" - this is normal! Just close that page and return to this app. We\'ll automatically detect your confirmation.',
            [{ text: 'OK' }]
        );
    };

    const handleRefreshStatus = async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user?.email_confirmed_at) {
                await supabase.auth.refreshSession();
                // Navigate to index which will route to appropriate onboarding step
                router.replace('/' as never);
            } else {
                Alert.alert('Not Confirmed Yet', 'Please click the confirmation link in your email first.');
            }
        } catch (error) {
            console.error('Error checking confirmation status:', error);
            Alert.alert('Error', 'Failed to check status. Please try again.');
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
                    <View style={styles.content}>
                        {/* Back Button */}
                        <TouchableOpacity
                            style={styles.backButton}
                            onPress={handleBack}
                            activeOpacity={0.7}
                        >
                            <Ionicons name="chevron-back" size={20} color={Colors.textPrimary} />
                        </TouchableOpacity>

                        {/* Email Icon */}
                        <View style={styles.iconContainer}>
                            <View style={styles.iconCircle}>
                                <Ionicons name="mail-outline" size={48} color={Colors.textPrimary} />
                            </View>
                        </View>

                        {/* Title */}
                        <Text style={styles.title}>Check Your Email</Text>

                        {/* Description */}
                        <Text style={styles.description}>
                            We&apos;ve sent a confirmation link to{'\n'}
                            <Text style={styles.emailText}>{email || 'your email'}</Text>
                        </Text>

                        <Text style={styles.subDescription}>
                            Please click the link in the email to verify your account and continue with the setup.
                        </Text>

                        {/* Open Email Button */}
                        <TouchableOpacity
                            style={styles.primaryButton}
                            onPress={handleOpenEmail}
                            activeOpacity={0.8}
                        >
                            <Ionicons name="mail" size={20} color={Colors.textPrimary} style={styles.buttonIcon} />
                            <Text style={styles.primaryButtonText}>Open Email App</Text>
                        </TouchableOpacity>

                        {/* Resend Button */}
                        <TouchableOpacity
                            style={[
                                styles.secondaryButton,
                                (resendCooldown > 0 || isResending) && styles.secondaryButtonDisabled,
                            ]}
                            onPress={handleResendEmail}
                            activeOpacity={0.8}
                            disabled={resendCooldown > 0 || isResending}
                        >
                            {isResending ? (
                                <ActivityIndicator color={Colors.textPrimary} />
                            ) : (
                                <Text style={styles.secondaryButtonText}>
                                    {resendCooldown > 0
                                        ? `Resend in ${resendCooldown}s`
                                        : "Didn't receive email? Resend"}
                                </Text>
                            )}
                        </TouchableOpacity>

                        {/* Check Status Button */}
                        <TouchableOpacity
                            style={styles.checkStatusButton}
                            onPress={handleRefreshStatus}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.checkStatusText}>
                                I&apos;ve confirmed my email
                            </Text>
                        </TouchableOpacity>

                        {/* Waiting indicator */}
                        <View style={styles.waitingContainer}>
                            <ActivityIndicator size="small" color="#878787" />
                            <Text style={styles.waitingText}>
                                Auto-checking for confirmation...
                            </Text>
                        </View>
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
    content: {
        flex: 1,
        paddingHorizontal: 16,
    },
    backButton: {
        width: 48,
        height: 48,
        borderRadius: 33,
        backgroundColor: 'rgba(63, 66, 67, 0.3)',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 16,
        marginBottom: 40,
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 1,
        },
        shadowOpacity: 0.25,
        shadowRadius: 2,
        elevation: 2,
    },
    iconContainer: {
        alignItems: 'center',
        marginBottom: 32,
    },
    iconCircle: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: 'rgba(63, 66, 67, 0.3)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: {
        fontFamily: fonts.bold,
        fontSize: 28,
        color: Colors.textPrimary,
        textAlign: 'center',
        marginBottom: 16,
    },
    description: {
        fontFamily: fonts.medium,
        fontSize: 16,
        lineHeight: 24,
        color: Colors.textPrimary,
        textAlign: 'center',
        marginBottom: 12,
    },
    emailText: {
        color: '#3494d9',
        fontFamily: fonts.bold,
    },
    subDescription: {
        fontFamily: fonts.regular,
        fontSize: 14,
        lineHeight: 20,
        color: '#878787',
        textAlign: 'center',
        marginBottom: 40,
        paddingHorizontal: 20,
    },
    primaryButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: 52,
        backgroundColor: Colors.buttonPrimary,
        borderWidth: 1,
        borderColor: Colors.buttonBorder,
        borderRadius: 8,
        marginBottom: 16,
    },
    buttonIcon: {
        marginRight: 8,
    },
    primaryButtonText: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: Colors.textPrimary,
    },
    secondaryButton: {
        width: '100%',
        height: 52,
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: '#3f4243',
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 40,
    },
    secondaryButtonDisabled: {
        opacity: 0.5,
    },
    secondaryButtonText: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: '#878787',
    },
    checkStatusButton: {
        width: '100%',
        height: 48,
        backgroundColor: '#3494d9',
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
    },
    checkStatusText: {
        fontFamily: fonts.medium,
        fontSize: 15,
        color: Colors.textPrimary,
    },
    waitingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    waitingText: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#878787',
        marginLeft: 8,
    },
});

