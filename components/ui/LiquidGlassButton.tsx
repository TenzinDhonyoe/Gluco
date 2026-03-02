import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback } from 'react';
import { Platform, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
    interpolate,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface LiquidGlassButtonProps {
    children: React.ReactNode;
    onPress?: () => void;
    disabled?: boolean;
    style?: StyleProp<ViewStyle>;
    size?: number;
    variant?: 'default' | 'circle' | 'pill';
    haptic?: boolean;
}

/**
 * A button component with liquid glass effect.
 * Features:
 * - Glass gradient background with highlights
 * - Liquid squish animation on press
 * - Haptic feedback (iOS)
 */
export function LiquidGlassButton({
    children,
    onPress,
    disabled = false,
    style,
    size,
    variant = 'default',
    haptic = true,
}: LiquidGlassButtonProps) {
    const scale = useSharedValue(1);
    const scaleX = useSharedValue(1);
    const scaleY = useSharedValue(1);

    const handlePressIn = useCallback(() => {
        // Fast liquid squish effect
        scale.value = withSpring(0.92, { damping: 20, stiffness: 600 });
        scaleX.value = withSpring(0.96, { damping: 20, stiffness: 600 });
        scaleY.value = withSpring(1.02, { damping: 20, stiffness: 600 });
    }, [scale, scaleX, scaleY]);

    const handlePressOut = useCallback(() => {
        scale.value = withSpring(1, { damping: 18, stiffness: 500 });
        scaleX.value = withSpring(1, { damping: 18, stiffness: 500 });
        scaleY.value = withSpring(1, { damping: 18, stiffness: 500 });
    }, [scale, scaleX, scaleY]);

    const handlePress = useCallback(() => {
        if (disabled) return;
        if (haptic && Platform.OS === 'ios') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
        onPress?.();
    }, [disabled, haptic, onPress]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [
            { scale: scale.value },
            { scaleX: scaleX.value },
            { scaleY: scaleY.value },
        ],
        opacity: interpolate(scale.value, [0.92, 1], [0.9, 1]),
    }));

    const getBorderRadius = () => {
        if (variant === 'circle' && size) return size / 2;
        if (variant === 'pill') return 999;
        return 16;
    };

    const getSize = () => {
        if (size && variant === 'circle') {
            return { width: size, height: size };
        }
        return {};
    };

    const borderRadius = getBorderRadius();

    return (
        <AnimatedPressable
            onPress={handlePress}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            disabled={disabled}
            style={[
                styles.container,
                { borderRadius },
                getSize(),
                disabled && styles.disabled,
                style,
                animatedStyle,
            ]}
        >
            {/* Glass gradient background */}
            <LinearGradient
                colors={['rgba(255, 255, 255, 0.98)', 'rgba(245, 245, 250, 0.95)', 'rgba(255, 255, 255, 0.98)']}
                locations={[0, 0.5, 1]}
                style={[styles.gradient, { borderRadius }]}
            />

            {/* Content */}
            <View style={styles.content}>
                {children}
            </View>
        </AnimatedPressable>
    );
}

/**
 * A circular icon button with liquid glass effect.
 * Convenience wrapper for common icon button pattern.
 */
export function LiquidGlassIconButton({
    children,
    onPress,
    disabled = false,
    size = 44,
    style,
    haptic = true,
}: Omit<LiquidGlassButtonProps, 'variant'>) {
    return (
        <LiquidGlassButton
            onPress={onPress}
            disabled={disabled}
            size={size}
            variant="circle"
            style={style}
            haptic={haptic}
        >
            {children}
        </LiquidGlassButton>
    );
}

const styles = StyleSheet.create({
    container: {
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(0, 0, 0, 0.08)',
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 2,
    },
    disabled: {
        opacity: 0.5,
    },
    gradient: {
        ...StyleSheet.absoluteFillObject,
    },
    content: {
        zIndex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
