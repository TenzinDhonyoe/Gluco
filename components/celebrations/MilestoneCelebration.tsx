import { fonts } from '@/hooks/useFonts';
import { getMilestoneMessage, type StreakMilestone } from '@/lib/streaks';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
    FadeIn,
    FadeOut,
    ZoomIn,
} from 'react-native-reanimated';

interface MilestoneCelebrationProps {
    milestone: StreakMilestone;
    onDismiss: () => void;
}

export function MilestoneCelebration({ milestone, onDismiss }: MilestoneCelebrationProps) {
    useEffect(() => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        // Auto-dismiss after 3 seconds
        const timer = setTimeout(onDismiss, 3000);
        return () => clearTimeout(timer);
    }, [onDismiss]);

    return (
        <Animated.View
            entering={FadeIn.duration(300)}
            exiting={FadeOut.duration(200)}
            style={styles.overlay}
        >
            <Pressable style={styles.touchArea} onPress={onDismiss}>
                <Animated.View
                    entering={ZoomIn.duration(500).springify().damping(10)}
                    style={styles.content}
                >
                    <View style={styles.flameCircle}>
                        <Ionicons name="flame" size={48} color="#FF6B35" />
                    </View>

                    <Text style={styles.milestoneNumber}>{milestone}</Text>
                    <Text style={styles.milestoneLabel}>day streak</Text>

                    <Text style={styles.message}>
                        {getMilestoneMessage(milestone)}
                    </Text>
                </Animated.View>
            </Pressable>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
    },
    touchArea: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
    },
    content: {
        alignItems: 'center',
        paddingHorizontal: 40,
    },
    flameCircle: {
        width: 88,
        height: 88,
        borderRadius: 44,
        backgroundColor: 'rgba(255, 107, 53, 0.15)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    milestoneNumber: {
        fontSize: 56,
        fontFamily: fonts.bold,
        color: '#FFFFFF',
        lineHeight: 64,
    },
    milestoneLabel: {
        fontSize: 18,
        fontFamily: fonts.medium,
        color: 'rgba(255, 255, 255, 0.8)',
        marginBottom: 16,
    },
    message: {
        fontSize: 16,
        fontFamily: fonts.regular,
        color: '#FFFFFF',
        textAlign: 'center',
        lineHeight: 24,
    },
});
