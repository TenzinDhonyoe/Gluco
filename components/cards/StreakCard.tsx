import { Colors } from '@/constants/Colors';
import { fonts } from '@/hooks/useFonts';
import { getStreakResetMessage } from '@/lib/streaks';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

interface StreakCardProps {
    streak: number;
    longestStreak: number;
    shieldAvailable: boolean;
    shieldUsed: boolean;
    streakBroken: boolean;
}

export function StreakCard({
    streak,
    longestStreak,
    shieldAvailable,
    shieldUsed,
    streakBroken,
}: StreakCardProps) {
    // Scale flame icon at milestones
    const flameSize = streak >= 30 ? 28 : streak >= 7 ? 24 : 20;

    return (
        <Animated.View entering={FadeInDown.duration(400).springify().damping(14)} style={styles.card}>
            <View style={styles.row}>
                <View style={styles.flameContainer}>
                    <Ionicons name="flame" size={flameSize} color="#FF6B35" />
                </View>

                <View style={styles.content}>
                    {streakBroken ? (
                        <Text style={styles.resetMessage}>
                            {getStreakResetMessage(longestStreak)}
                        </Text>
                    ) : shieldUsed ? (
                        <Text style={styles.shieldMessage}>
                            Shield saved your streak!
                        </Text>
                    ) : null}

                    <View style={styles.streakRow}>
                        <Text style={styles.streakNumber}>{streak}</Text>
                        <Text style={styles.streakLabel}>
                            {streak === 1 ? 'day' : 'days'}
                        </Text>
                    </View>

                    {longestStreak > streak && (
                        <Text style={styles.longestText}>
                            Longest: {longestStreak}
                        </Text>
                    )}
                </View>

                {shieldAvailable && !shieldUsed && (
                    <View style={styles.shieldBadge}>
                        <Ionicons name="shield-checkmark" size={16} color={Colors.success} />
                    </View>
                )}
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: Colors.backgroundCardGlass,
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderWidth: 0.5,
        borderColor: 'rgba(255, 255, 255, 0.5)',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    flameContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255, 107, 53, 0.10)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    content: {
        flex: 1,
    },
    streakRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 4,
    },
    streakNumber: {
        fontSize: 28,
        fontFamily: fonts.bold,
        color: Colors.textPrimary,
        lineHeight: 34,
    },
    streakLabel: {
        fontSize: 14,
        fontFamily: fonts.medium,
        color: Colors.textSecondary,
    },
    longestText: {
        fontSize: 12,
        fontFamily: fonts.regular,
        color: Colors.textSecondary,
        marginTop: 2,
    },
    resetMessage: {
        fontSize: 13,
        fontFamily: fonts.medium,
        color: Colors.textSecondary,
        marginBottom: 4,
    },
    shieldMessage: {
        fontSize: 13,
        fontFamily: fonts.medium,
        color: Colors.success,
        marginBottom: 4,
    },
    shieldBadge: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: Colors.successLight,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
