import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';

import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    Image,
    ImageBackground,
    SafeAreaView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

const { width } = Dimensions.get('window');

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
                    // New order: Step 1 (profile) → Step 2 (goals) → Step 3 → Step 4 → Step 5
                    if (!profile?.first_name || !profile?.last_name) {
                        // Step 1: Profile info
                        router.replace('/onboarding-2' as never);
                    } else if (!profile?.goals || profile.goals.length === 0) {
                        // Step 2: Goals
                        router.replace('/onboarding-1' as never);
                    } else if (profile?.tracking_mode === undefined) {
                        // Step 4: Tracking setup
                        router.replace('/onboarding-4' as never);
                    } else {
                        // Step 5: Coaching style (last step)
                        router.replace('/onboarding-5' as never);
                    }
                } else {
                    // Onboarding complete - go to dashboard
                    router.replace('/(tabs)' as never);
                }
            } else {
                // No user - show welcome screen
                setIsCheckingAuth(false);
            }
        };

        checkAuthState();
    }, [user, profile, loading]);

    const handleGetStarted = () => {
        router.push('/signin');
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
            <ImageBackground
                source={require('../assets/images/welcome.jpg')}
                style={styles.backgroundImage}
                resizeMode="cover"
            >
                <View style={styles.darkOverlay} />

                <SafeAreaView style={styles.content}>
                    {/* Logo Section */}
                    <View style={styles.logoContainer}>
                        <Image
                            source={require('../assets/images/gluco-logo.png')}
                            style={styles.logo}
                            resizeMode="contain"
                        />
                    </View>

                    {/* Heading Section */}
                    <View style={styles.headingContainer}>
                        <Text style={styles.headingText}>
                            See what shapes{'\n'}your metabolic health.
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
                            <Text style={styles.linkText}>Terms of Service</Text> and acknowledge that you have read our{' '}
                            <Text style={styles.linkText}>Privacy Policy</Text>.
                        </Text>
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
    loadingContainer: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    backgroundImage: {
        ...StyleSheet.absoluteFillObject,
        width: '100%',
        height: '100%',
    },
    darkOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(17, 17, 17, 0.6)', // rgba(17,17,17,0.6) from Figma
    },
    content: {
        flex: 1,
    },
    logoContainer: {
        position: 'absolute',
        top: 193,
        alignSelf: 'center',
        width: 60,
        height: 85,
        alignItems: 'center',
        justifyContent: 'center',
    },
    logo: {
        width: 60,
        height: 85,
    },
    headingContainer: {
        position: 'absolute',
        top: 394,
        alignSelf: 'center',
        width: Math.min(313, width - 40), // Max 313px, responsive with padding
        alignItems: 'center',
    },
    headingText: {
        fontFamily: fonts.bold, // Outfit Bold (700)
        fontSize: 32,
        lineHeight: 32 * 1.09, // 1.09 line-height = ~35px
        letterSpacing: 0,
        textAlign: 'center',
        color: Colors.textPrimary, // White
    },
    yourText: {
        textTransform: 'uppercase',
        letterSpacing: 2,
        color: '#3BA5A5', // Teal from logo
    },
    bottomSection: {
        position: 'absolute',
        bottom: 82,
        alignSelf: 'center',
        width: Math.min(361, width - 32), // Max 361px, responsive with padding
        alignItems: 'center',
    },
    getStartedButton: {
        width: '100%',
        maxWidth: 361,
        height: 50,
        backgroundColor: Colors.buttonPrimary, // #285e2a
        borderWidth: 1,
        borderColor: Colors.buttonBorder, // #448d47
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
        // Multiple shadow layers from Figma: 0px 8px 12px rgba(0,0,0,0.06), 0px 4px 8px rgba(0,0,0,0.08), 0px 1px 2px rgba(0,0,0,0.12)
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 8,
        },
        shadowOpacity: 0.12,
        shadowRadius: 12,
        elevation: 8,
    },
    buttonText: {
        fontFamily: fonts.medium, // Outfit Medium (500)
        fontSize: 15,
        lineHeight: 15 * 0.95, // 95% line-height = ~14px
        letterSpacing: 0,
        color: Colors.textPrimary, // White
    },
    subtextText: {
        fontFamily: fonts.regular, // Outfit Regular (400)
        fontSize: 11,
        lineHeight: 11 * 1.0, // 100% line-height
        letterSpacing: 0,
        textAlign: 'center',
        color: 'rgba(255, 255, 255, 0.68)', // rgba(255,255,255,0.68) from Figma
        width: Math.min(356, width - 40), // Max 356px, responsive with padding
    },
    linkText: {
        color: Colors.textPrimary, // White
    },
});
