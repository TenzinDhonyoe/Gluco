import { Colors } from '@/constants/Colors';
import { behaviorV1Theme } from '@/constants/behaviorV1Theme';
import { fonts } from '@/hooks/useFonts';
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Stop } from 'react-native-svg';

export const MetabolicScoreRing = ({
    size = 48,
    score = null,
    scoreColor = Colors.textSecondary,
    visualPreset = 'default',
    showInnerValue = true,
    gradientColors,
}: {
    size?: number;
    score?: number | null;
    scoreColor?: string;
    visualPreset?: 'default' | 'hero_vivid';
    showInnerValue?: boolean;
    gradientColors?: [string, string];
}) => {
    const clampedScore = score !== null ? Math.max(0, Math.min(100, score)) : null;
    const center = size / 2;
    const defaultStrokeWidth = 4;
    const defaultRadius = (size - defaultStrokeWidth) / 2;
    const gradientId = useMemo(
        () => `metabolic-ring-gradient-${size}-${scoreColor.replace(/[^a-zA-Z0-9]/g, '')}`,
        [size, scoreColor]
    );
    const ticks = useMemo(() => {
        const items = [];
        const totalTicks = 60;
        const activeTicks = clampedScore !== null ? Math.round((clampedScore / 100) * totalTicks) : 0;

        for (let i = 0; i < totalTicks; i++) {
            const angle = (i * 6 - 90) * (Math.PI / 180);

            const x1 = center + defaultRadius * Math.cos(angle);
            const y1 = center + defaultRadius * Math.sin(angle);
            const x2 = center + (defaultRadius - 3) * Math.cos(angle);
            const y2 = center + (defaultRadius - 3) * Math.sin(angle);

            const isActive = clampedScore !== null && i < activeTicks;
            const tickColor = isActive ? scoreColor : 'rgba(255,255,255,0.15)';
            const tickOpacity = isActive ? 1 : 0.6;

            items.push(
                <Line
                    key={i}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={tickColor}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    opacity={tickOpacity}
                />
            );
        }
        return items;
    }, [center, defaultRadius, clampedScore, scoreColor]);

    if (visualPreset === 'hero_vivid') {
        const strokeWidth = Math.max(7, size * 0.105);
        const glowWidth = strokeWidth + 4;
        const radius = (size - glowWidth - 2) / 2;
        const circumference = 2 * Math.PI * radius;
        const progress = clampedScore !== null ? clampedScore / 100 : 0;
        const progressLength = circumference * progress;
        const dashOffset = circumference - progressLength;

        // Default to sage gradient if no colors provided
        const gStart = gradientColors ? gradientColors[0] : behaviorV1Theme.sageSoft;
        const gEnd = gradientColors ? gradientColors[1] : behaviorV1Theme.sageBright;

        return (
            <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
                <Svg width={size} height={size}>
                    <Defs>
                        <LinearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                            <Stop offset="0%" stopColor={gStart} />
                            <Stop offset="100%" stopColor={gEnd} />
                        </LinearGradient>
                    </Defs>
                    <G rotation={-90} origin={`${center}, ${center}`}>
                        <Circle
                            cx={center}
                            cy={center}
                            r={radius}
                            stroke="rgba(255,255,255,0.16)"
                            strokeWidth={strokeWidth}
                            fill="transparent"
                        />
                        {clampedScore !== null && (
                            <>
                                <Circle
                                    cx={center}
                                    cy={center}
                                    r={radius}
                                    stroke={scoreColor}
                                    strokeWidth={glowWidth}
                                    strokeDasharray={`${circumference} ${circumference}`}
                                    strokeDashoffset={dashOffset}
                                    strokeLinecap="round"
                                    opacity={0.24}
                                    fill="transparent"
                                />
                                <Circle
                                    cx={center}
                                    cy={center}
                                    r={radius}
                                    stroke={`url(#${gradientId})`}
                                    strokeWidth={strokeWidth}
                                    strokeDasharray={`${circumference} ${circumference}`}
                                    strokeDashoffset={dashOffset}
                                    strokeLinecap="round"
                                    fill="transparent"
                                />
                            </>
                        )}
                    </G>
                </Svg>
                <View style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center' }]}>
                    {clampedScore !== null ? (
                        showInnerValue ? (
                            <Text style={{ fontFamily: fonts.bold, fontSize: size * 0.31, color: '#FFFFFF' }}>
                                {Math.round(clampedScore)}
                            </Text>
                        ) : null
                    ) : (
                        <Ionicons name="lock-closed" size={size * 0.35} color="rgba(255,255,255,0.7)" />
                    )}
                </View>
            </View>
        );
    }

    return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={size} height={size}>
                {/* Tick marks ring */}
                <G>{ticks}</G>
            </Svg>
            <View style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center' }]}>
                {clampedScore !== null ? (
                    showInnerValue ? (
                        <Text style={{ fontFamily: fonts.bold, fontSize: size * 0.32, color: '#FFFFFF' }}>
                            {Math.round(clampedScore)}
                        </Text>
                    ) : null
                ) : (
                    <Ionicons name="lock-closed" size={size * 0.35} color="rgba(255,255,255,0.7)" />
                )}
            </View>
        </View>
    );
};
