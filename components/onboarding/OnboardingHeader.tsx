import { LiquidGlassIconButton } from '@/components/ui/LiquidGlassButton';
import { Colors } from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

interface OnboardingHeaderProps {
    currentStep: number;
    totalSteps: number;
    onBack: () => void;
}

function ProgressSegment({ active }: { active: boolean }) {
    const fill = useSharedValue(active ? 1 : 0);

    useEffect(() => {
        fill.value = withTiming(active ? 1 : 0, { duration: 200 });
    }, [active, fill]);

    const fillStyle = useAnimatedStyle(() => ({
        width: `${fill.value * 100}%` as `${number}%`,
    }));

    return (
        <View style={styles.segmentTrack}>
            <Animated.View style={[styles.segmentFill, fillStyle]} />
        </View>
    );
}

export function OnboardingHeader({ currentStep, totalSteps, onBack }: OnboardingHeaderProps) {
    return (
        <View style={styles.headerRow}>
            <LiquidGlassIconButton
                size={44}
                onPress={onBack}
            >
                <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
            </LiquidGlassIconButton>

            <View style={styles.progressContainer}>
                {Array.from({ length: totalSteps }).map((_, index) => (
                    <ProgressSegment key={index} active={index < currentStep} />
                ))}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 16,
        marginBottom: 8,
        gap: 16,
    },
    progressContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    segmentTrack: {
        flex: 1,
        height: 4,
        borderRadius: 2,
        backgroundColor: Colors.borderCard,
        overflow: 'hidden',
    },
    segmentFill: {
        height: '100%',
        borderRadius: 2,
        backgroundColor: Colors.primary,
    },
});
