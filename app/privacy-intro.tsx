/**
 * Privacy Intro Screen
 * Shows privacy assurance before sign-in options
 */

import { Colors } from '@/constants/Colors';
import { LEGAL_URLS } from '@/constants/legal';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
    Alert,
    Image,
    ImageBackground,
    Linking,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function PrivacyIntroScreen() {
    const [isAppleLoading, setIsAppleLoading] = useState(false);
    const { signInWithApple } = useAuth();

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

    const handleUseEmail = () => {
        router.push('/signin');
    };

    const handleTermsPress = () => {
        Linking.openURL(LEGAL_URLS.termsAndConditions);
    };

    const handlePrivacyPress = () => {
        Linking.openURL(LEGAL_URLS.privacyPolicy);
    };

    return (
        <View style={styles.container}>
            <ImageBackground
                source={require('../assets/images/backgrounds/background.png')}
                style={styles.backgroundImage}
                resizeMode="cover"
            >
                <SafeAreaView style={styles.safeArea}>
                    {/* Content */}
                    <View style={styles.content}>
                        {/* Title */}
                        <Text style={styles.title}>Privacy by design</Text>
                        <Text style={styles.subtitle}>
                            We never sell your data.{'\n'}We only share with services you enable.
                        </Text>

                        {/* Vault Image */}
                        <View style={styles.mascotContainer}>
                            <Image
                                source={require('@/assets/images/illustrations/privacy-vault.png')}
                                style={styles.mascot}
                                resizeMode="contain"
                            />
                        </View>

                        {/* Footer Text */}
                        <Text style={styles.footerText}>
                            For more details, please refer to our{' '}
                            <Text style={styles.linkText} onPress={handleTermsPress}>
                                Terms of Service
                            </Text>
                            {' '}and{' '}
                            <Text style={styles.linkText} onPress={handlePrivacyPress}>
                                Privacy Policy
                            </Text>
                            .
                        </Text>
                    </View>

                    {/* Buttons */}
                    <View style={styles.bottomSection}>
                        {/* Apple Sign In Button */}
                        <TouchableOpacity
                            style={styles.appleButton}
                            onPress={handleAppleSignIn}
                            activeOpacity={0.8}
                            disabled={isAppleLoading}
                        >
                            <Ionicons name="logo-apple" size={20} color="#FFFFFF" />
                            <Text style={styles.appleButtonText}>
                                {isAppleLoading ? 'Signing in...' : 'Continue with Apple'}
                            </Text>
                        </TouchableOpacity>

                        {/* Email Option */}
                        <TouchableOpacity
                            style={styles.emailButton}
                            onPress={handleUseEmail}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.emailButtonText}>Use email instead</Text>
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
    backButton: {
        marginLeft: 24,
        marginTop: 16,
    },
    content: {
        flex: 1,
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingTop: 80,
    },
    title: {
        fontFamily: fonts.bold,
        fontSize: 28,
        color: Colors.textPrimary,
        textAlign: 'center',
        marginBottom: 12,
    },
    subtitle: {
        fontFamily: fonts.regular,
        fontSize: 16,
        color: '#B0B0B0',
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: 40,
    },
    mascotContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    mascot: {
        width: 260,
        height: 260,
    },
    footerText: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: '#878787',
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 24,
    },
    linkText: {
        color: Colors.textPrimary,
        textDecorationLine: 'underline',
    },
    bottomSection: {
        paddingHorizontal: 24,
        paddingBottom: 32,
    },
    appleButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#000000',
        borderRadius: 12,
        paddingVertical: 16,
        gap: 8,
        marginBottom: 16,
    },
    appleButtonText: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: '#FFFFFF',
    },
    emailButton: {
        alignItems: 'center',
        paddingVertical: 12,
    },
    emailButtonText: {
        fontFamily: fonts.medium,
        fontSize: 15,
        color: '#878787',
    },
});
