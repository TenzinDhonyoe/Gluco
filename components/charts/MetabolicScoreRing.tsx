import { Colors } from '@/constants/Colors';
import { fonts } from '@/hooks/useFonts';
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { G, Line } from 'react-native-svg';

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

        // Background track (inactive ticks)
        for (let i = 0; i < totalTicks; i++) {
            const angle = (i * 6 - 90) * (Math.PI / 180);
            const x1 = center + (radius) * Math.cos(angle);
            const y1 = center + (radius) * Math.sin(angle);
            const x2 = center + (radius - 8) * Math.cos(angle);
            const y2 = center + (radius - 8) * Math.sin(angle);

            items.push(
                <Line
                    key={`bg-${i}`}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth="3"
                    strokeLinecap="round"
                />
            );
        }

        // Active ticks
        for (let i = 0; i < activeTicks; i++) {
            const angle = (i * 6 - 90) * (Math.PI / 180);
            const x1 = center + (radius) * Math.cos(angle);
            const y1 = center + (radius) * Math.sin(angle);
            const x2 = center + (radius - 8) * Math.cos(angle);
            const y2 = center + (radius - 8) * Math.sin(angle);

            items.push(
                <Line
                    key={`fg-${i}`}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={scoreColor}
                    strokeWidth="3"
                    strokeLinecap="round"
                    opacity={0.9} // Slight transparency for glow effect feel
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
