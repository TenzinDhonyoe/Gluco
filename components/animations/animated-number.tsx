import React, { useEffect, useRef } from 'react';
import { Animated, StyleProp, Text, TextStyle } from 'react-native';

interface AnimatedNumberProps {
    value: number;
    duration?: number;
    formatValue?: (value: number) => string;
    style?: StyleProp<TextStyle>;
}

/**
 * AnimatedNumber - Displays a number that smoothly counts up or down when it changes
 */
export function AnimatedNumber({
    value,
    duration = 600,
    formatValue = (v) => v.toFixed(1),
    style,
}: AnimatedNumberProps) {
    const animatedValue = useRef(new Animated.Value(value)).current;
    const [displayValue, setDisplayValue] = React.useState(value);

    useEffect(() => {
        // Animate from current display value to new value
        const listener = animatedValue.addListener(({ value: animValue }) => {
            setDisplayValue(animValue);
        });

        Animated.timing(animatedValue, {
            toValue: value,
            duration,
            useNativeDriver: false, // Can't use native driver for value changes
        }).start();

        return () => {
            animatedValue.removeListener(listener);
        };
    }, [value, duration, animatedValue]);

    return (
        <Text style={style}>
            {formatValue(displayValue)}
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
 * AnimatedInteger - Displays an integer that smoothly counts up or down
 */
export function AnimatedInteger({
    value,
    duration = 500,
    suffix = '',
    style,
}: AnimatedIntegerProps) {
    const animatedValue = useRef(new Animated.Value(value)).current;
    const [displayValue, setDisplayValue] = React.useState(value);

    useEffect(() => {
        const listener = animatedValue.addListener(({ value: animValue }) => {
            setDisplayValue(Math.round(animValue));
        });

        Animated.timing(animatedValue, {
            toValue: value,
            duration,
            useNativeDriver: false,
        }).start();

        return () => {
            animatedValue.removeListener(listener);
        };
    }, [value, duration, animatedValue]);

    return (
        <Text style={style}>
            {displayValue}{suffix}
        </Text>
    );
}
