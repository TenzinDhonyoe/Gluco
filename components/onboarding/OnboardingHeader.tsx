import { LiquidGlassIconButton } from '@/components/ui/LiquidGlassButton';
import { Colors } from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';

interface OnboardingHeaderProps {
    currentStep: number;
    totalSteps: number;
    onBack: () => void;
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
                    <View
                        key={index}
                        style={[
                            styles.progressBar,
                            index < currentStep ? styles.progressBarActive : styles.progressBarInactive,
                        ]}
                    />
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
        marginBottom: 24,
        gap: 16,
    },
    progressContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    progressBar: {
        flex: 1,
        height: 2,
        borderRadius: 12,
    },
    progressBarActive: {
        backgroundColor: Colors.textPrimary,
    },
    progressBarInactive: {
        backgroundColor: Colors.textTertiary,
    },
});
