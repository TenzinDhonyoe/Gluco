import { Colors } from '@/constants/Colors';
import { LEGAL_URLS } from '@/constants/legal';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { isBehaviorV1Experience, SKIP_FRAMEWORK_RESET_GATE } from '@/lib/experience';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ResizeMode, Video } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
    Dimensions,
    Image,
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
const SPLASH_LOGO = require('../assets/images/mascots/gluco_app_mascott/gluco_splash.png');

// Semantic step routes (new naming)
const ONBOARDING_STEP_ROUTES: Record<string, string> = {
    'profile': '/onboarding-profile',
    'goals': '/onboarding-goals',
    'body': '/onboarding-body',
    'tracking': '/onboarding-tracking',
    'coaching': '/onboarding-coaching',
    'ai': '/onboarding-ai',
};

// Legacy numeric step keys → new semantic keys (for users mid-onboarding during update)
const LEGACY_STEP_MIGRATION: Record<string, string> = {
    '1': 'profile',
    '2': 'goals',
    '3': 'body',
    '4': 'tracking',
    '5': 'coaching',
};

/** Resolve a stored step key (legacy or new) to an onboarding route */
function getOnboardingResumeRoute(storedStep: string): string | null {
    // Try new semantic key first
    if (ONBOARDING_STEP_ROUTES[storedStep]) {
        return ONBOARDING_STEP_ROUTES[storedStep];
    }
    // Migrate legacy numeric key
    const migrated = LEGACY_STEP_MIGRATION[storedStep];
    if (migrated && ONBOARDING_STEP_ROUTES[migrated]) {
        // Persist the migrated key so future launches use the new format
        AsyncStorage.setItem(ONBOARDING_STEP_KEY, migrated).catch(() => null);
        return ONBOARDING_STEP_ROUTES[migrated];
    }
    return null;
}

export default function WelcomeScreen() {
    const { user, profile, loading } = useAuth();
    const [isCheckingAuth, setIsCheckingAuth] = useState(true);
    const hasNavigated = useRef(false);

    // Check auth state and redirect accordingly
    useEffect(() => {
        const checkAuthState = async () => {
            // Wait for auth to finish loading
            if (loading) return;
            // Prevent double-navigation
            if (hasNavigated.current) return;

            if (user) {
                // User is logged in
                if (!user.email_confirmed_at) {
                    hasNavigated.current = true;
                    router.replace({
                        pathname: '/confirm-email',
                        params: { email: user.email || '' },
                    } as never);
                } else if (!profile || !profile.onboarding_completed) {
                    // Email confirmed but onboarding not complete
                    const storedStep = await AsyncStorage.getItem(ONBOARDING_STEP_KEY);

                    if (storedStep) {
                        const route = getOnboardingResumeRoute(storedStep);
                        if (route) {
                            hasNavigated.current = true;
                            router.replace(route as never);
                            return;
                        }
                    }

                    // Fallback: Profile-based routing if no stored step
                    hasNavigated.current = true;
                    if (!profile?.first_name || !profile?.last_name) {
                        router.replace('/onboarding-profile' as never);
                    } else if (!profile?.goals || profile.goals.length === 0) {
                        router.replace('/onboarding-goals' as never);
                    } else if (profile?.tracking_mode === undefined) {
                        router.replace('/onboarding-body' as never);
                    } else if (!profile?.coaching_style) {
                        router.replace('/onboarding-coaching' as never);
                    } else {
                        router.replace('/onboarding-ai' as never);
                    }
                } else {
                    // Onboarding complete
                    await AsyncStorage.removeItem(ONBOARDING_STEP_KEY);

                    const behaviorV1Enabled = isBehaviorV1Experience(profile?.experience_variant);

                    if (
                        behaviorV1Enabled &&
                        !profile?.framework_reset_completed_at &&
                        !SKIP_FRAMEWORK_RESET_GATE
                    ) {
                        hasNavigated.current = true;
                        router.replace('/framework-reset' as never);
                        return;
                    }

                    hasNavigated.current = true;
                    if (!PAYWALL_ENABLED) {
                        router.replace('/(tabs)' as never);
                    } else {
                        const paywallSeen = await AsyncStorage.getItem(PAYWALL_SEEN_KEY);
                        if (!paywallSeen) {
                            router.replace('/paywall' as never);
                        } else {
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
    }, [user, profile, loading]);

    // Separate timeout effect — does not re-trigger the main auth check
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            if (!hasNavigated.current) {
                console.log('Auth check timed out, showing welcome screen fallback');
                setIsCheckingAuth(false);
            }
        }, 5000);

        return () => clearTimeout(timeoutId);
    }, []);

    const handleGetStarted = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
                <Image source={SPLASH_LOGO} style={styles.loadingLogo} />
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
        backgroundColor: '#151718',
    },
    loadingLogo: {
        width: 200,
        height: 200,
        resizeMode: 'contain',
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
        bottom: 200,
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
        backgroundColor: Colors.buttonSecondary,
        borderWidth: 1,
        borderColor: Colors.buttonSecondaryBorder,
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
