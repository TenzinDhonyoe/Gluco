import { Colors } from '@/constants/Colors';
import { fonts } from '@/hooks/useFonts';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
    FadeIn,
    FadeOut,
    ZoomIn,
} from 'react-native-reanimated';

const MICRO_COPY = [
    'Nice work! Every check-in builds your picture.',
    'Done! Your future self will thank you.',
    'Checked in. Patterns are forming.',
    'Quick and easy. That\'s the idea.',
    'Logged! Consistency > perfection.',
    'Another data point in your story.',
    'That took less time than reading this.',
    'Done! Small actions, big insights.',
    'Check-in complete. You\'re on a roll.',
    'Your wellness snapshot is saved.',
    'Boom. That\'s all it takes.',
    'Captured! Tomorrow you\'ll see the trend.',
];

interface CheckinCompletionProps {
    onDismiss: () => void;
}

export function CheckinCompletion({ onDismiss }: CheckinCompletionProps) {
    const message = useMemo(() => {
        // Seed by day of year for consistent daily message
        const dayOfYear = Math.floor(
            (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
        );
        return MICRO_COPY[dayOfYear % MICRO_COPY.length];
    }, []);

    useEffect(() => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        const timer = setTimeout(onDismiss, 1500);
        return () => clearTimeout(timer);
    }, [onDismiss]);

    return (
        <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(200)}
            style={styles.overlay}
        >
            <View style={styles.content}>
                <Animated.View
                    entering={ZoomIn.duration(400).springify().damping(12)}
                    style={styles.checkCircle}
                >
                    <Ionicons name="checkmark" size={40} color="#FFFFFF" />
                </Animated.View>

                <Text style={styles.message}>{message}</Text>
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
    },
    content: {
        alignItems: 'center',
        paddingHorizontal: 40,
    },
    checkCircle: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: Colors.success,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
    },
    message: {
        fontSize: 16,
        fontFamily: fonts.medium,
        color: '#FFFFFF',
        textAlign: 'center',
        lineHeight: 24,
    },
});
