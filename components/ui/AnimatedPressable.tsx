import * as Haptics from 'expo-haptics';
import React from 'react';
import { Platform, Pressable, StyleProp, ViewStyle } from 'react-native';

interface AnimatedPressableProps {
    children: React.ReactNode;
    onPress?: () => void;
    disabled?: boolean;
    style?: StyleProp<ViewStyle>;
    haptic?: boolean;
}

/**
 * A lightweight pressable component with native press feedback.
 * Uses Pressable's built-in styling for press states - no Reanimated overhead.
 */
export function AnimatedPressable({
    children,
    onPress,
    disabled = false,
    style,
    haptic = true,
}: AnimatedPressableProps) {
    const handlePress = () => {
        if (disabled) return;
        if (haptic && Platform.OS === 'ios') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        onPress?.();
    };

    return (
        <Pressable
            onPress={handlePress}
            disabled={disabled}
            style={({ pressed }) => [
                style,
                pressed && !disabled && { opacity: 0.7, transform: [{ scale: 0.98 }] },
            ]}
        >
            {children}
        </Pressable>
    );
}
