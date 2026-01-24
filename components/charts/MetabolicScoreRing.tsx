import { Colors } from '@/constants/Colors';
import { fonts } from '@/hooks/useFonts';
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line } from 'react-native-svg';

export const MetabolicScoreRing = ({
    size = 48,
    score = null,
    scoreColor = Colors.textSecondary
}: {
    size?: number;
    score?: number | null;
    scoreColor?: string;
}) => {
    const strokeWidth = 4;
    const radius = (size - strokeWidth) / 2;
    const center = size / 2;
    const innerRadius = radius - 10;

    // Generate tick marks
    const ticks = useMemo(() => {
        const items = [];
        const totalTicks = 60;
        const activeTicks = score !== null ? Math.round((score / 100) * totalTicks) : 0;

        for (let i = 0; i < totalTicks; i++) {
            // Start from 0 degrees (top is -90, so we adjust).
            // Actually, in standard SVG, 0 is 3 o'clock aka Right.
            // We want 0 to be top, so -90 degrees.
            // But let's follow the original implementation:
            // const angle = (i * 6 - 90) * (Math.PI / 180);
            const angle = (i * 6 - 90) * (Math.PI / 180);

            const x1 = center + (radius) * Math.cos(angle);
            const y1 = center + (radius) * Math.sin(angle);
            const x2 = center + (radius - 6) * Math.cos(angle);
            const y2 = center + (radius - 6) * Math.sin(angle);

            const isActive = score !== null && i < activeTicks;
            const tickColor = isActive ? scoreColor : "rgba(255,255,255,0.15)";
            const tickOpacity = isActive ? 1 : 0.6;

            items.push(
                <Line
                    key={i}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={tickColor}
                    strokeWidth="2"
                    strokeLinecap="round"
                    opacity={tickOpacity}
                />
            );
        }
        return items;
    }, [center, radius, score, scoreColor]);

    return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={size} height={size}>
                {/* Tick marks ring */}
                <G>{ticks}</G>

                {/* Inner solid ring */}
                <Circle
                    cx={center}
                    cy={center}
                    r={innerRadius}
                    stroke="rgba(255,255,255,0.1)"
                    strokeWidth={strokeWidth}
                    fill="none"
                />
            </Svg>
            <View style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center' }]}>
                {score !== null ? (
                    <Text style={{ fontFamily: fonts.bold, fontSize: size * 0.32, color: '#FFFFFF' }}>
                        {Math.round(score)}
                    </Text>
                ) : (
                    <Ionicons name="lock-closed" size={size * 0.35} color="rgba(255,255,255,0.7)" />
                )}
            </View>
        </View>
    );
};
