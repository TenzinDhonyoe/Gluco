import { Colors } from '@/constants/Colors';
import { fonts } from '@/hooks/useFonts';
import { MiniLineChart } from '@/components/charts/MiniLineChart';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface MetricChatCardProps {
    metric: string;
    icon: string;
    label: string;
    value: string;
    unit: string;
    color: string;
    history: (number | null)[];
}

const ICON_MAP: Record<string, keyof typeof Ionicons.glyphMap> = {
    walk: 'walk-outline',
    moon: 'moon-outline',
    heart: 'heart-outline',
    flame: 'flame-outline',
};

export function MetricChatCard({
    icon,
    label,
    value,
    unit,
    color,
    history,
}: MetricChatCardProps) {
    const iconName = ICON_MAP[icon] ?? 'analytics-outline';

    return (
        <View style={styles.card}>
            {/* Left: icon + label */}
            <View style={styles.labelSection}>
                <View style={[styles.iconCircle, { backgroundColor: color + '18' }]}>
                    <Ionicons name={iconName} size={16} color={color} />
                </View>
                <Text style={styles.label} numberOfLines={1}>{label}</Text>
            </View>

            {/* Center: sparkline */}
            <View style={styles.chartSection}>
                <MiniLineChart
                    data={history}
                    color={color}
                    height={32}
                    showEndpoint={false}
                />
            </View>

            {/* Right: value */}
            <View style={styles.valueSection}>
                <Text style={styles.value}>{value}</Text>
                <Text style={styles.unit}>{unit}</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 16,
        backgroundColor: Colors.backgroundCardGlass,
        borderWidth: 1,
        borderColor: 'rgba(60, 60, 67, 0.10)',
        paddingHorizontal: 12,
        paddingVertical: 10,
        gap: 10,
    },
    labelSection: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        minWidth: 72,
    },
    iconCircle: {
        width: 28,
        height: 28,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
    },
    label: {
        fontFamily: fonts.medium,
        fontSize: 13,
        color: Colors.textSecondary,
    },
    chartSection: {
        flex: 1,
        height: 32,
    },
    valueSection: {
        alignItems: 'flex-end',
        minWidth: 50,
    },
    value: {
        fontFamily: fonts.bold,
        fontSize: 18,
        color: Colors.textPrimary,
        lineHeight: 22,
    },
    unit: {
        fontFamily: fonts.regular,
        fontSize: 11,
        color: Colors.textTertiary,
        marginTop: -2,
    },
});
