import { Colors } from '@/constants/Colors';
import { fonts } from '@/hooks/useFonts';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Stop } from 'react-native-svg';

interface WellnessScoreRingProps {
    size?: number;
    score: number | null;
    trend?: 'up' | 'down' | 'steady';
    label?: string;
    /** Number of days with data logged — used for progress countdown when score is null */
    daysLogged?: number;
    /** Target days needed for first score (default 3) */
    daysTarget?: number;
}

export function WellnessScoreRing({
    size = 80,
    score,
    trend = 'steady',
    label = 'Wellness',
    daysLogged,
    daysTarget = 3,
}: WellnessScoreRingProps) {
    const clampedScore = score !== null ? Math.max(0, Math.min(100, score)) : null;
    const center = size / 2;
    const strokeWidth = Math.max(6, size * 0.1);
    const radius = (size - strokeWidth - 2) / 2;
    const circumference = 2 * Math.PI * radius;
    const progress = clampedScore !== null
        ? clampedScore / 100
        : daysLogged !== undefined
            ? Math.min(daysLogged / daysTarget, 0.95)
            : 0;
    const dashOffset = circumference - circumference * progress;

    const gradientId = useMemo(
        () => `wellness-ring-${size}`,
        [size]
    );

    const trendIcon = trend === 'up' ? '\u2191' : trend === 'down' ? '\u2193' : '';

    return (
        <View style={[styles.container, { width: size + 8 }]}>
            <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
                <Svg width={size} height={size}>
                    <Defs>
                        <LinearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                            <Stop offset="0%" stopColor={Colors.success} />
                            <Stop offset="100%" stopColor="#2E7D32" />
                        </LinearGradient>
                    </Defs>
                    <G rotation={-90} origin={`${center}, ${center}`}>
                        <Circle
                            cx={center}
                            cy={center}
                            r={radius}
                            stroke="rgba(0,0,0,0.08)"
                            strokeWidth={strokeWidth}
                            fill="transparent"
                        />
                        {clampedScore !== null && (
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
                        )}
                    </G>
                </Svg>
                <View style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center' }]}>
                    {clampedScore !== null ? (
                        <Text style={[styles.scoreText, { fontSize: size * 0.28 }]}>
                            {Math.round(clampedScore)}
                        </Text>
                    ) : daysLogged !== undefined ? (
                        <Text style={[styles.scoreText, { fontSize: Math.max(12, size * 0.18), color: Colors.textSecondary }]}>
                            {`Day ${Math.min(daysLogged, daysTarget)}/${daysTarget}`}
                        </Text>
                    ) : (
                        <Text style={[styles.scoreText, { fontSize: size * 0.22, color: Colors.textSecondary }]}>
                            --
                        </Text>
                    )}
                </View>
            </View>
            <Text style={styles.label}>
                {label}{trendIcon ? ` ${trendIcon}` : ''}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
    },
    scoreText: {
        fontFamily: fonts.bold,
        color: Colors.textPrimary,
    },
    label: {
        fontSize: 12,
        fontFamily: fonts.medium,
        color: Colors.textSecondary,
        marginTop: 4,
        textAlign: 'center',
    },
});
