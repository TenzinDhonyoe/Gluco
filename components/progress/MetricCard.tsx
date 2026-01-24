import { Colors } from '@/constants/Colors';
import { fonts } from '@/hooks/useFonts';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MiniLineChart } from '@/components/charts/MiniLineChart';

type TrendDirection = 'up' | 'down' | 'neutral' | null;

interface MetricCardProps {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;          // "Resting HR", "Sleep", etc.
    value: number | null;
    unit: string;           // "bpm", "ms", "h", "steps"
    color: string;          // Accent color for chart/icon
    trend: TrendDirection;
    trendLabel?: string;    // "Improving", "Trending down", etc.
    history: (number | null)[];  // Last 7 days of values for mini chart
    // Whether higher values are better (steps, HRV) or lower is better (RHR)
    higherIsBetter?: boolean;
}

function formatValue(value: number | null, unit: string): string {
    if (value === null) return 'No data';

    switch (unit) {
        case 'bpm':
            return Math.round(value).toString();
        case 'ms':
            return Math.round(value).toString();
        case 'h':
            return value.toFixed(1);
        case '':
            // Steps - format with commas
            return Math.round(value).toLocaleString();
        default:
            return value.toFixed(1);
    }
}

function getTrendColor(trend: TrendDirection, higherIsBetter: boolean, hasData: boolean): string {
    if (!hasData || trend === null || trend === 'neutral') {
        return Colors.textTertiary;
    }

    // If higher is better: up = good (green), down = bad (red)
    // If lower is better (like RHR): down = good (green), up = bad (red)
    const isGood = higherIsBetter ? trend === 'up' : trend === 'down';
    return isGood ? Colors.success : Colors.error;
}

function getDefaultTrendLabel(trend: TrendDirection, higherIsBetter: boolean, hasData: boolean): string {
    if (!hasData) return 'No trend';
    if (trend === null) return 'No trend';
    if (trend === 'neutral') return 'Stable';

    const isGood = higherIsBetter ? trend === 'up' : trend === 'down';
    if (isGood) {
        return 'Improving';
    }
    return trend === 'up' ? 'Rising' : 'Declining';
}

function EmptyChartPlaceholder({ color }: { color: string }) {
    return (
        <View style={styles.emptyChartContainer}>
            <View style={[styles.emptyChartLine, { backgroundColor: Colors.textTertiary }]} />
            <View style={[styles.emptyChartDot, { backgroundColor: color }]} />
        </View>
    );
}

export function MetricCard({
    icon,
    label,
    value,
    unit,
    color,
    trend,
    trendLabel,
    history,
    higherIsBetter = true,
}: MetricCardProps) {
    const hasValue = value !== null;
    const hasHistoryData = history.some(v => v !== null);
    const trendColor = getTrendColor(trend, higherIsBetter, hasValue);
    const displayTrendLabel = trendLabel || getDefaultTrendLabel(trend, higherIsBetter, hasValue);

    return (
        <View style={styles.card}>
            {/* Header: Icon + Label */}
            <View style={styles.header}>
                <Ionicons name={icon} size={28} color={color} />
                <Text style={[styles.label, { color }]}>{label.toUpperCase()}</Text>
            </View>

            {/* Mini Chart or Empty Placeholder */}
            <View style={styles.chartContainer}>
                {hasHistoryData ? (
                    <MiniLineChart
                        data={history}
                        color={color}
                        height={44}
                        showEndpoint={true}
                    />
                ) : (
                    <EmptyChartPlaceholder color={color} />
                )}
            </View>

            {/* Value + Unit */}
            <View style={styles.valueContainer}>
                <Text style={[
                    styles.value,
                    !hasValue && styles.valueNoData
                ]}>
                    {formatValue(value, unit)}
                </Text>
                {hasValue && unit && <Text style={styles.unit}>{unit}</Text>}
            </View>

            {/* Status Pill */}
            <View style={[styles.statusPill, { backgroundColor: trendColor + '30' }]}>
                <View style={[styles.statusDot, { backgroundColor: trendColor }]} />
                <Text style={[styles.statusText, { color: trendColor }]}>
                    {displayTrendLabel}
                </Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        flex: 1,
        backgroundColor: '#22282C',
        borderRadius: 16,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.25,
        shadowRadius: 2,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        height: 32,
        marginBottom: 12,
    },
    label: {
        fontFamily: fonts.bold,
        fontSize: 12,
        letterSpacing: 0.5,
    },
    chartContainer: {
        height: 44,
        marginBottom: 12,
    },
    emptyChartContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        height: 44,
        paddingRight: 4,
    },
    emptyChartLine: {
        flex: 1,
        height: 2,
        borderRadius: 1,
        opacity: 0.3,
    },
    emptyChartDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginLeft: -4,
    },
    valueContainer: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 4,
        marginBottom: 8,
    },
    value: {
        fontFamily: fonts.medium,
        fontSize: 28,
        color: Colors.textPrimary,
        lineHeight: 28 * 1.15,
    },
    valueNoData: {
        color: Colors.textTertiary,
        fontSize: 18,
    },
    unit: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: '#E7E8E9',
    },
    statusPill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 10,
        alignSelf: 'flex-start',
    },
    statusDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        marginRight: 5,
    },
    statusText: {
        fontFamily: fonts.medium,
        fontSize: 11,
    },
});
