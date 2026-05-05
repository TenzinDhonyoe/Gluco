import { OnboardingHeader } from '@/components/onboarding/OnboardingHeader';
import { Colors } from '@/constants/Colors';
import { fonts } from '@/hooks/useFonts';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

interface OnboardingScreenLayoutProps {
    currentStep: number;
    totalSteps?: number;
    title: string;
    subtitle: string;
    onBack: () => void;
    children: React.ReactNode;
    /** Bottom fixed content (e.g. Continue button). Rendered outside scroll. */
    bottomContent?: React.ReactNode;
    /** Whether this screen has text inputs that need keyboard handling */
    hasKeyboardInput?: boolean;
}

export function OnboardingScreenLayout({
    currentStep,
    totalSteps = 10,
    title,
    subtitle,
    onBack,
    children,
    bottomContent,
    hasKeyboardInput = false,
}: OnboardingScreenLayoutProps) {
    const contentOpacity = useSharedValue(0);

    useEffect(() => {
        contentOpacity.value = withTiming(1, {
            duration: 300,
            easing: Easing.out(Easing.cubic),
        });
    }, [contentOpacity]);

    const contentAnimStyle = useAnimatedStyle(() => ({
        opacity: contentOpacity.value,
    }));

    const scrollContent = (
        <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
        >
            <OnboardingHeader currentStep={currentStep} totalSteps={totalSteps} onBack={onBack} />

            <Animated.View style={contentAnimStyle}>
                <View style={styles.titleSection}>
                    <Text style={styles.title}>{title}</Text>
                    <Text style={styles.subtitle}>{subtitle}</Text>
                </View>

                {children}
            </Animated.View>
        </ScrollView>
    );

    return (
        <View style={styles.container}>
            <SafeAreaView style={styles.safeArea}>
                {hasKeyboardInput ? (
                    <KeyboardAvoidingView
                        style={styles.flex}
                        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                        keyboardVerticalOffset={0}
                    >
                        {scrollContent}
                    </KeyboardAvoidingView>
                ) : (
                    scrollContent
                )}

                {bottomContent && (
                    <View style={styles.bottomContainer}>
                        <LinearGradient
                            colors={['rgba(242, 242, 247, 0)', 'rgba(242, 242, 247, 0.85)', 'rgba(242, 242, 247, 1)']}
                            locations={[0, 0.35, 0.6]}
                            style={styles.bottomGradient}
                            pointerEvents="none"
                        />
                        <View style={styles.bottomButtonArea}>
                            {bottomContent}
                        </View>
                    </View>
                )}
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
    flex: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: 16,
        paddingBottom: 120,
    },
    titleSection: {
        marginBottom: 24,
    },
    title: {
        fontFamily: fonts.semiBold,
        fontSize: 28,
        lineHeight: 34,
        color: Colors.textPrimary,
        marginBottom: 6,
    },
    subtitle: {
        fontFamily: fonts.regular,
        fontSize: 16,
        lineHeight: 22,
        color: Colors.textSecondary,
    },
    bottomContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
    },
    bottomGradient: {
        height: 40,
    },
    bottomButtonArea: {
        paddingHorizontal: 16,
        paddingBottom: 40,
        backgroundColor: 'rgba(242, 242, 247, 1)',
    },
});
