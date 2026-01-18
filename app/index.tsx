import { Colors } from '@/constants/Colors';
import { LEGAL_URLS } from '@/constants/legal';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ResizeMode, Video } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    Linking,
    SafeAreaView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

const { width } = Dimensions.get('window');

// Key for persisting onboarding step to AsyncStorage
export const ONBOARDING_STEP_KEY = 'onboarding_current_step';
// Key for tracking if user has dismissed/completed paywall
export const PAYWALL_SEEN_KEY = 'paywall_seen';

// Feature flag: Set to true to enable paywall after onboarding
// Currently disabled for beta - all users get full access
export const PAYWALL_ENABLED = false;

export default function WelcomeScreen() {
    const { user, profile, loading } = useAuth();
    const [isCheckingAuth, setIsCheckingAuth] = useState(true);

    // Check auth state and redirect accordingly
    useEffect(() => {
        const checkAuthState = async () => {
            // Wait for auth to finish loading
            if (loading) return;

            if (user) {
                // User is logged in
                if (!user.email_confirmed_at) {
                    // Email not confirmed yet - go to confirm email screen
                    router.replace({
                        pathname: '/confirm-email',
                        params: { email: user.email || '' },
                    } as never);
                } else if (!profile || !profile.onboarding_completed) {
                    // Email confirmed but onboarding not complete
                    // First check AsyncStorage for saved step (more reliable for resume)
                    const storedStep = await AsyncStorage.getItem(ONBOARDING_STEP_KEY);

                    if (storedStep) {
                        // Use stored step for routing
                        const stepRoutes: Record<string, string> = {
                            '1': '/onboarding-2',  // Step 1: Profile (screen is onboarding-2)
                            '2': '/onboarding-1',  // Step 2: Goals (screen is onboarding-1)
                            '3': '/onboarding-3',  // Step 3: Optional height/weight
                            '4': '/onboarding-4',  // Step 4: Tracking mode
                            '5': '/onboarding-5',  // Step 5: Coaching style
                        };
                        const route = stepRoutes[storedStep];
                        if (route) {
                            router.replace(route as never);
                            return;
                        }
                    }

                    // Fallback: Profile-based routing if no stored step
                    // Flow: Step 1 (profile) → Step 2 (goals) → Step 3 (optional) → Step 4 (tracking) → Step 5 (coaching)
                    if (!profile?.first_name || !profile?.last_name) {
                        router.replace('/onboarding-2' as never);
                    } else if (!profile?.goals || profile.goals.length === 0) {
                        router.replace('/onboarding-1' as never);
                    } else if (profile?.tracking_mode === undefined) {
                        router.replace('/onboarding-3' as never);
                    } else if (!profile?.coaching_style) {
                        router.replace('/onboarding-5' as never);
                    } else {
                        router.replace('/onboarding-5' as never);
                    }
                } else {
                    // Onboarding complete - check if paywall should be shown
                    await AsyncStorage.removeItem(ONBOARDING_STEP_KEY);

                    // If paywall is disabled (beta), go straight to dashboard
                    if (!PAYWALL_ENABLED) {
                        router.replace('/(tabs)' as never);
                    } else {
                        // Check if user has already seen/dismissed the paywall
                        const paywallSeen = await AsyncStorage.getItem(PAYWALL_SEEN_KEY);
                        if (!paywallSeen) {
                            // Show paywall first
                            router.replace('/paywall' as never);
                        } else {
                            // Paywall already seen, go to dashboard
                            router.replace('/(tabs)' as never);
                        }
                    }
                }
            } else {
                // No user - show welcome screen
                setIsCheckingAuth(false);
            }
        };

        checkAuthState();

        // Safety timeout: If auth check takes too long (e.g. 5 seconds), 
        // stop loading and show welcome screen to prevent infinite spinner.
        // If auth eventually resolves to a user, the useEffect above will redirect them.
        const timeoutId = setTimeout(() => {
            if (loading || isCheckingAuth) {
                console.log('Auth check timed out, showing welcome screen fallback');
                setIsCheckingAuth(false);
            }
        }, 5000);

        return () => clearTimeout(timeoutId);
    }, [user, profile, loading]);

    const handleGetStarted = () => {
        router.push('/privacy-intro');
    };

    const handleTermsPress = () => {
        Linking.openURL(LEGAL_URLS.termsAndConditions);
    };

    const handlePrivacyPress = () => {
        Linking.openURL(LEGAL_URLS.privacyPolicy);
    };

    // Show loading while checking auth
    if (loading || isCheckingAuth) {
        return (
            <View style={[styles.container, styles.loadingContainer]}>
                <ActivityIndicator size="large" color={Colors.buttonPrimary} />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Video
                source={require('../assets/videos/gluco_video.mp4')}
                style={styles.backgroundVideo}
                resizeMode={ResizeMode.COVER}
                shouldPlay
                isLooping
                isMuted
            />
            {/* Bottom gradient for text readability */}
            <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.7)', 'rgba(0,0,0,0.85)']}
                locations={[0, 0.5, 1]}
                style={styles.bottomGradient}
            />

            <SafeAreaView style={styles.content}>


                {/* Heading Section */}
                <View style={styles.headingContainer}>
                    <Text style={styles.headingText}>
                        See what shapes your{'\n'}metabolic health.
                    </Text>
                </View>

                {/* Bottom Section - CTA Button + Footer */}
                <View style={styles.bottomSection}>
                    <TouchableOpacity
                        style={styles.getStartedButton}
                        onPress={handleGetStarted}
                        activeOpacity={0.8}
                    >
                        <Text style={styles.buttonText}>Let&apos;s Get Started</Text>
                    </TouchableOpacity>

                    <Text style={styles.subtextText}>
                        By clicking &quot;Let&apos;s Get Started,&quot; you agree to our{' '}
                        <Text style={styles.linkText} onPress={handleTermsPress}>Terms of Service</Text> and acknowledge that you have read our{' '}
                        <Text style={styles.linkText} onPress={handlePrivacyPress}>Privacy Policy</Text>.
                    </Text>
                </View>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    loadingContainer: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    backgroundVideo: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        height: '100%',
    },
    darkOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'transparent',
    },
    bottomGradient: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: '50%', // Cover bottom half
    },
    content: {
        flex: 1,
    },
    logoContainer: {
        position: 'absolute',
        top: 193,
        alignSelf: 'center',
        width: 120,
        height: 120,
        alignItems: 'center',
        justifyContent: 'center',
    },
    logo: {
        width: 120,
        height: 120,
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 4,
        },
        shadowOpacity: 0.3,
        shadowRadius: 4.65,
        elevation: 8,
    },
    headingContainer: {
        position: 'absolute',
        bottom: 220,
        left: 24,
        right: 24,
        alignItems: 'flex-start',
    },
    headingText: {
        fontFamily: fonts.bold,
        fontSize: 28,
        lineHeight: 36,
        letterSpacing: -0.3,
        textAlign: 'left',
        color: Colors.textPrimary,
        textShadowColor: 'rgba(0, 0, 0, 0.6)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 8,
    },
    yourText: {
        textTransform: 'uppercase',
        letterSpacing: 2,
        color: '#3BA5A5',
    },
    bottomSection: {
        position: 'absolute',
        bottom: 60,
        alignSelf: 'center',
        width: Math.min(361, width - 32),
        alignItems: 'center',
    },
    getStartedButton: {
        width: '100%',
        maxWidth: 361,
        height: 56,
        backgroundColor: Colors.buttonPrimary,
        borderWidth: 1,
        borderColor: Colors.buttonBorder,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
        shadowColor: '#4CAF50',
        shadowOffset: {
            width: 0,
            height: 4,
        },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 8,
    },
    buttonText: {
        fontFamily: fonts.semiBold,
        fontSize: 17,
        letterSpacing: 0.3,
        color: Colors.textPrimary,
    },
    subtextText: {
        fontFamily: fonts.regular,
        fontSize: 12,
        lineHeight: 18,
        textAlign: 'center',
        color: 'rgba(255, 255, 255, 0.9)', // Brighter for readability
        width: Math.min(356, width - 40),
    },
    linkText: {
        color: Colors.textPrimary,
        textDecorationLine: 'underline',
    },
});
