import { Colors } from '@/constants/Colors';
import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

interface MiniLineChartProps {
    data: (number | null)[];  // 7 values
    color: string;
    height?: number;          // Default 40px
    showEndpoint?: boolean;   // Highlight last point
}

export function MiniLineChart({
    data,
    color,
    height = 40,
    showEndpoint = true,
}: MiniLineChartProps) {
    const padding = { top: 4, bottom: 4, left: 4, right: 4 };
    const chartHeight = height - padding.top - padding.bottom;

    const { pathData, lastPoint, hasData } = useMemo(() => {
        // Get indices and values of non-null data points
        const validPoints: Array<{ index: number; value: number }> = [];
        data.forEach((value, index) => {
            if (value !== null) {
                validPoints.push({ index, value });
            }
        });

        if (validPoints.length < 2) {
            return { pathData: '', lastPoint: null, hasData: false };
        }

        const values = validPoints.map(p => p.value);
        const minValue = Math.min(...values);
        const maxValue = Math.max(...values);
        const range = Math.max(maxValue - minValue, 1); // Avoid division by zero

        const chartWidth = 100 - padding.left - padding.right;
        const xStep = chartWidth / (data.length - 1);

        const pts = validPoints.map(p => ({
            x: padding.left + p.index * xStep,
            y: padding.top + chartHeight - ((p.value - minValue) / range) * chartHeight,
            value: p.value,
        }));

        // Create smooth curve path using quadratic bezier
        let path = `M ${pts[0].x} ${pts[0].y}`;
        for (let i = 1; i < pts.length; i++) {
            const prev = pts[i - 1];
            const curr = pts[i];
            const cpX = (prev.x + curr.x) / 2;
            path += ` Q ${prev.x + (curr.x - prev.x) * 0.5} ${prev.y}, ${cpX} ${(prev.y + curr.y) / 2}`;
            path += ` Q ${cpX + (curr.x - cpX) * 0.5} ${curr.y}, ${curr.x} ${curr.y}`;
        }

        return {
            pathData: path,
            lastPoint: pts[pts.length - 1],
            hasData: true,
        };
    }, [data, chartHeight, padding]);

    if (!hasData) {
        return (
            <View style={[styles.container, { height }]}>
                <View style={styles.noDataLine} />
            </View>
        );
    }

    return (
        <View style={[styles.container, { height }]}>
            <Svg width="100%" height={height} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none">
                <Defs>
                    <LinearGradient id={`miniGradient-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={color} stopOpacity="0.2" />
                        <Stop offset="1" stopColor={color} stopOpacity="0" />
                    </LinearGradient>
                </Defs>

                {/* Line */}
                <Path
                    d={pathData}
                    stroke={color}
                    strokeWidth={1.5}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />

                {/* Endpoint dot */}
                {showEndpoint && lastPoint && (
                    <Circle
                        cx={lastPoint.x}
                        cy={lastPoint.y}
                        r={3}
                        fill={color}
                    />
                )}
            </Svg>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: '100%',
    },
    noDataLine: {
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 2,
        marginVertical: 'auto',
        height: 2,
    },
});
