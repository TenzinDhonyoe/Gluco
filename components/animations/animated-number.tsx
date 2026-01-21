import React from 'react';
import { StyleProp, Text, TextStyle } from 'react-native';

interface AnimatedNumberProps {
    value: number;
    duration?: number;
    formatValue?: (value: number) => string;
    style?: StyleProp<TextStyle>;
}

/**
 * AnimatedNumber - Displays a formatted number
 * Removed JS thread animation to prevent UI lag during range changes
 */
export function AnimatedNumber({
    value,
    formatValue = (v) => v.toFixed(1),
    style,
}: AnimatedNumberProps) {
    return (
        <Text style={style}>
            {formatValue(value)}
        </Text>
    );
}

interface AnimatedIntegerProps {
    value: number;
    duration?: number;
    suffix?: string;
    style?: StyleProp<TextStyle>;
}

/**
 * AnimatedInteger - Displays an integer value
 * Removed JS thread animation to prevent UI lag during range changes
 */
export function AnimatedInteger({
    value,
    suffix = '',
    style,
}: AnimatedIntegerProps) {
    return (
        <Text style={style}>
            {Math.round(value)}{suffix}
        </Text>
    );
}
