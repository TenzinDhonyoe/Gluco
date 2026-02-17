import { useTabTransition } from '@/context/TabTransitionContext';
import { useIsFocused } from '@react-navigation/native';
import React, { useEffect, useRef } from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Simple spring config for subtle bounce
const SPRING_CONFIG = {
    damping: 20,
    stiffness: 200,
    mass: 0.8,
};

export function AnimatedScreen({ children }: { children: React.ReactNode }) {
    const isFocused = useIsFocused();
    const { direction } = useTabTransition();
    const translateX = useSharedValue(0);
    const hasEverFocused = useRef(false);

    useEffect(() => {
        if (!isFocused) return;

        // On initial app launch, the first screen may mount focused.
        // We avoid animating that initial mount by checking direction === 'none'.
        // On the first tab switch, the destination screen may mount focused; direction will be 'left'/'right',
        // and we DO want the animation to run.
        if (!hasEverFocused.current) {
            hasEverFocused.current = true;

            if (direction === 'none') {
                translateX.value = 0;
                return;
            }
        }

        const startX = direction === 'left' ? SCREEN_WIDTH * 0.15 : -SCREEN_WIDTH * 0.15;
        translateX.value = startX;
        translateX.value = withSpring(0, SPRING_CONFIG);
    }, [isFocused, direction, translateX]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
    }));

    return (
        <Animated.View style={[styles.container, animatedStyle]}>
            {children}
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'transparent',
    },
});
