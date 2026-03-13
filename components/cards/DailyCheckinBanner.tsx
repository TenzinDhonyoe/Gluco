import { Colors } from '@/constants/Colors';
import { fonts } from '@/hooks/useFonts';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

interface DailyCheckinBannerProps {
    isCompleted: boolean;
}

export function DailyCheckinBanner({ isCompleted }: DailyCheckinBannerProps) {
    const router = useRouter();

    if (isCompleted) {
        return (
            <Animated.View entering={FadeInDown.duration(300)} style={styles.completedCard}>
                <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
                <Text style={styles.completedText}>Checked in today</Text>
            </Animated.View>
        );
    }

    return (
        <Animated.View entering={FadeInDown.duration(400).springify().damping(14)}>
            <TouchableOpacity
                style={styles.card}
                onPress={() => router.push('/daily-checkin')}
                activeOpacity={0.7}
            >
                <View style={styles.iconContainer}>
                    <Ionicons name="sunny-outline" size={20} color={Colors.textPrimary} />
                </View>
                <Text style={styles.text}>
                    Today's check-in takes 15 seconds
                </Text>
                <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: 'rgba(255, 255, 255, 0.45)',
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 14,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 0.5,
        borderColor: 'rgba(255, 255, 255, 0.5)',
    },
    completedCard: {
        backgroundColor: Colors.successLight,
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderWidth: 0.5,
        borderColor: Colors.success,
    },
    iconContainer: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255, 179, 128, 0.15)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    text: {
        flex: 1,
        fontSize: 15,
        fontFamily: fonts.medium,
        color: Colors.textPrimary,
    },
    completedText: {
        fontSize: 14,
        fontFamily: fonts.medium,
        color: Colors.success,
    },
});
