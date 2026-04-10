import { Colors } from '@/constants/Colors';
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
    Easing,
} from 'react-native-reanimated';

interface OnboardingHeroProps {
    /** Custom SVG illustration component rendered inside the hero circle */
    illustration: React.ReactNode;
}

export function OnboardingHero({ illustration }: OnboardingHeroProps) {
    const opacity = useSharedValue(0);
    const scale = useSharedValue(0.9);

    useEffect(() => {
        opacity.value = withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) });
        scale.value = withSpring(1, { damping: 15, stiffness: 100 });
    }, [opacity, scale]);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [{ scale: scale.value }],
    }));

    return (
        <Animated.View style={[styles.container, animatedStyle]}>
            <View style={styles.outerCircle}>
                <View style={styles.innerCircle}>
                    {illustration}
                </View>
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        height: 160,
        justifyContent: 'center',
        alignItems: 'center',
    },
    outerCircle: {
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: 'rgba(45, 212, 191, 0.15)',
        borderWidth: 2,
        borderColor: 'rgba(45, 212, 191, 0.30)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    innerCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: Colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
