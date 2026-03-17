import { Colors } from '@/constants/Colors';
import { fonts } from '@/hooks/useFonts';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withSequence,
    withTiming,
} from 'react-native-reanimated';

interface StreakChatCardProps {
    days: number;
    mealsLogged: number;
}

export function StreakChatCard({ days, mealsLogged }: StreakChatCardProps) {
    // Subtle pulse animation on the fire icon
    const pulse = useSharedValue(1);

    useEffect(() => {
        pulse.value = withRepeat(
            withSequence(
                withTiming(1.15, { duration: 600 }),
                withTiming(1, { duration: 600 })
            ),
            -1,
            true
        );
    }, [pulse]);

    const pulseStyle = useAnimatedStyle(() => ({
        transform: [{ scale: pulse.value }],
    }));

    return (
        <View style={styles.card}>
            <Animated.View style={[styles.fireContainer, pulseStyle]}>
                <Ionicons name="flame" size={24} color={Colors.success} />
            </Animated.View>

            <View style={styles.info}>
                <Text style={styles.title}>{days}-day streak!</Text>
                <Text style={styles.subtitle}>
                    {mealsLogged} meals logged this week
                </Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 16,
        backgroundColor: Colors.successLight,
        borderWidth: 1,
        borderColor: Colors.successMedium,
        padding: 12,
        gap: 10,
    },
    fireContainer: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: Colors.successMedium,
        justifyContent: 'center',
        alignItems: 'center',
    },
    info: {
        flex: 1,
    },
    title: {
        fontFamily: fonts.bold,
        fontSize: 16,
        color: Colors.textPrimary,
    },
    subtitle: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: Colors.textSecondary,
        marginTop: 1,
    },
});
