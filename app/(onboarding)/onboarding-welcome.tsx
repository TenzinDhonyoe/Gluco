import { WelcomeIllustration } from '@/components/onboarding/illustrations';
import { Colors } from '@/constants/Colors';
import { fonts } from '@/hooks/useFonts';
import { triggerHaptic } from '@/lib/utils/haptics';
import { router } from 'expo-router';
import React, { useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function OnboardingWelcomeScreen() {
    const logoOpacity = useSharedValue(0);
    const logoScale = useSharedValue(0.8);
    const textOpacity = useSharedValue(0);
    const buttonOpacity = useSharedValue(0);

    useEffect(() => {
        logoOpacity.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) });
        logoScale.value = withSpring(1, { damping: 15, stiffness: 100 });
        textOpacity.value = withDelay(300, withTiming(1, { duration: 500 }));
        buttonOpacity.value = withDelay(600, withTiming(1, { duration: 500 }));
    }, [logoOpacity, logoScale, textOpacity, buttonOpacity]);

    const logoStyle = useAnimatedStyle(() => ({
        opacity: logoOpacity.value,
        transform: [{ scale: logoScale.value }],
    }));

    const textStyle = useAnimatedStyle(() => ({
        opacity: textOpacity.value,
    }));

    const buttonStyle = useAnimatedStyle(() => ({
        opacity: buttonOpacity.value,
    }));

    const handleGetStarted = () => {
        triggerHaptic('medium');
        router.push('/onboarding-profile' as never);
    };

    return (
        <View style={styles.container}>
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.content}>
                    <Animated.View style={[styles.logoContainer, logoStyle]}>
                        <View style={styles.logoCircle}>
                            <WelcomeIllustration size={44} />
                        </View>
                    </Animated.View>

                    <Animated.View style={[styles.textContainer, textStyle]}>
                        <Text style={styles.appName}>Gluco</Text>
                        <Text style={styles.tagline}>Your wellness journey starts here</Text>
                    </Animated.View>
                </View>

                <Animated.View style={[styles.buttonContainer, buttonStyle]}>
                    <TouchableOpacity
                        style={styles.ctaButton}
                        onPress={handleGetStarted}
                        activeOpacity={0.8}
                    >
                        <Text style={styles.ctaText}>Let's get started</Text>
                    </TouchableOpacity>
                </Animated.View>
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
        justifyContent: 'space-between',
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    logoContainer: {
        marginBottom: 24,
    },
    logoCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: Colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
    },
    textContainer: {
        alignItems: 'center',
    },
    appName: {
        fontFamily: fonts.semiBold,
        fontSize: 32,
        color: Colors.textPrimary,
        marginBottom: 8,
    },
    tagline: {
        fontFamily: fonts.regular,
        fontSize: 16,
        color: Colors.textSecondary,
        textAlign: 'center',
    },
    buttonContainer: {
        paddingHorizontal: 16,
        paddingBottom: 40,
    },
    ctaButton: {
        width: '100%',
        height: 48,
        backgroundColor: Colors.buttonAction,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    ctaText: {
        fontFamily: fonts.medium,
        fontSize: 15,
        color: Colors.buttonActionText,
    },
});
