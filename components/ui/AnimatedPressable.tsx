import React from 'react';
import { Pressable, StyleProp, ViewStyle } from 'react-native';

interface AnimatedPressableProps {
    children: React.ReactNode;
    onPress?: () => void;
    disabled?: boolean;
    style?: StyleProp<ViewStyle>;
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
}: AnimatedPressableProps) {
    return (
        <Pressable
            onPress={onPress}
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
