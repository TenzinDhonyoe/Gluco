import { ForestGlassBackground } from '@/components/backgrounds/forest-glass-background';
import { LiquidGlassIconButton } from '@/components/ui/LiquidGlassButton';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
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
    const hasNavigated = useRef(false);

    const navigateToRoot = () => {
        if (router.canDismiss()) {
            router.dismissAll();
        } else {
            router.replace('/' as never);
        }
    };

    // Poll for email confirmation status
    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;

        const checkEmailConfirmation = async () => {
            if (hasNavigated.current) return;
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (session?.user?.email_confirmed_at) {
                    // User has confirmed their email
                    clearInterval(interval);
                    hasNavigated.current = true;

                    // Refresh the auth context
                    await supabase.auth.refreshSession();

                    // Go directly to onboarding without flashing the index loading screen
                    router.replace('/onboarding-profile' as never);
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
        if (hasNavigated.current) return;
        if (user && user.email_confirmed_at) {
            hasNavigated.current = true;
            if (profile?.onboarding_completed) {
                navigateToRoot();
            } else {
                // Go directly to onboarding without flashing the index loading screen
                router.replace('/onboarding-profile' as never);
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
        router.back();
    };

    const handleOpenEmail = () => {
        Alert.alert(
            'Check Your Email',
            'Please open your email app and click the confirmation link. After verification, return to Gluco and we will automatically continue setup.',
            [{ text: 'OK' }]
        );
    };

    const handleRefreshStatus = async () => {
        if (hasNavigated.current) return;
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user?.email_confirmed_at) {
                hasNavigated.current = true;
                await supabase.auth.refreshSession();
                // Go directly to onboarding
                router.replace('/onboarding-profile' as never);
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
                <ForestGlassBackground blurIntensity={18} />
                <SafeAreaView style={styles.safeArea}>
                    <View style={styles.content}>
                        {/* Back Button */}
                        <LiquidGlassIconButton size={44} onPress={handleBack}>
                            <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
                        </LiquidGlassIconButton>

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
                            <ActivityIndicator size="small" color={Colors.textTertiary} />
                            <Text style={styles.waitingText}>
                                Auto-checking for confirmation...
                            </Text>
                        </View>
                    </View>
                </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'transparent',
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
        color: Colors.primary,
        fontFamily: fonts.bold,
    },
    subDescription: {
        fontFamily: fonts.regular,
        fontSize: 14,
        lineHeight: 20,
        color: Colors.textTertiary,
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
        borderColor: Colors.borderCard,
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
        color: Colors.textTertiary,
    },
    checkStatusButton: {
        width: '100%',
        height: 48,
        backgroundColor: Colors.primary,
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
        color: Colors.textTertiary,
        marginLeft: 8,
    },
});
