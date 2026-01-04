/**
 * Disclaimer Component
 * Displays regulatory disclaimer for wellness app positioning
 */

import { fonts } from '@/hooks/useFonts';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface DisclaimerProps {
    variant?: 'full' | 'short';
    style?: object;
}

/**
 * Reusable disclaimer component
 * - Full: For screens with space (onboarding, results)
 * - Short: For cramped UIs (cards, tooltips)
 */
export function Disclaimer({ variant = 'full', style }: DisclaimerProps) {
    const text = variant === 'full'
        ? 'This is not medical advice and is not intended to diagnose, treat, or prevent any condition. Consult a healthcare provider for medical questions.'
        : 'Not medical advice. Not for diagnosis.';

    return (
        <View style={[styles.container, style]}>
            <Ionicons
                name="information-circle-outline"
                size={variant === 'full' ? 16 : 14}
                color="#878787"
                style={styles.icon}
            />
            <Text style={[styles.text, variant === 'short' && styles.textShort]}>
                {text}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: 'rgba(135, 135, 135, 0.08)',
        borderRadius: 8,
    },
    icon: {
        marginRight: 8,
        marginTop: 1,
    },
    text: {
        flex: 1,
        fontFamily: fonts.regular,
        fontSize: 12,
        lineHeight: 16,
        color: '#878787',
    },
    textShort: {
        fontSize: 11,
        lineHeight: 14,
    },
});

export default Disclaimer;
