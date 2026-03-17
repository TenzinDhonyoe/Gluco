import { Colors } from '@/constants/Colors';
import { fonts } from '@/hooks/useFonts';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface DataCoverageCardProps {
    confidence: 'high' | 'medium' | 'low' | 'insufficient_data';
    daysWithData: number;
}

function getConfidenceConfig(confidence: DataCoverageCardProps['confidence']) {
    switch (confidence) {
        case 'high':
            return {
                icon: 'checkmark-circle' as const,
                color: Colors.success,
                label: 'High confidence',
            };
        case 'medium':
            return {
                icon: 'alert-circle' as const,
                color: Colors.warning,
                label: 'Medium confidence',
            };
        case 'low':
            return {
                icon: 'warning' as const,
                color: Colors.error,
                label: 'Low confidence',
            };
        case 'insufficient_data':
        default:
            return {
                icon: 'information-circle' as const,
                color: Colors.textTertiary,
                label: 'Building baseline',
            };
    }
}

export function DataCoverageCard({ confidence, daysWithData }: DataCoverageCardProps) {
    const config = getConfidenceConfig(confidence);

    return (
        <View style={styles.card}>
            <Ionicons name={config.icon} size={16} color={config.color} />
            <Text style={[styles.label, { color: config.color }]}>
                {config.label}
            </Text>
            <Text style={styles.separator}>·</Text>
            <Text style={styles.daysText}>
                {daysWithData}/7 days data
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 12,
        paddingHorizontal: 16,
        backgroundColor: 'rgba(0, 0, 0, 0.03)',
        borderRadius: 12,
    },
    label: {
        fontFamily: fonts.medium,
        fontSize: 13,
    },
    separator: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: Colors.textTertiary,
    },
    daysText: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: Colors.textTertiary,
    },
});
