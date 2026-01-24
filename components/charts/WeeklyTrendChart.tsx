import { Colors } from '@/constants/Colors';
import { fonts } from '@/hooks/useFonts';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

interface WeeklyTrendChartProps {
    scores: Array<{ week: string; score: number | null }>;
    height?: number;
    scoreColor?: string;
    showLabels?: boolean;
}

export function WeeklyTrendChart({
    scores,
    height = 60,
    scoreColor = Colors.success,
    showLabels = false,
}: WeeklyTrendChartProps) {
    const padding = { top: 8, bottom: showLabels ? 24 : 8, left: 12, right: 12 };
    const chartHeight = height - padding.top - padding.bottom;

    const { pathData, areaData, points, validScores } = useMemo(() => {
        // Filter out null scores and reverse to show oldest first
        const filtered = scores
            .filter((s): s is { week: string; score: number } => s.score !== null)
            .slice(0, 12)
            .reverse();

        if (filtered.length < 2) {
            return { pathData: '', areaData: '', points: [], validScores: filtered };
        }

        const minScore = Math.min(...filtered.map(s => s.score));
        const maxScore = Math.max(...filtered.map(s => s.score));
        const range = Math.max(maxScore - minScore, 10); // Minimum range of 10 to avoid flat lines

        const chartWidth = 100 - padding.left - padding.right;
        const xStep = chartWidth / Math.max(filtered.length - 1, 1);

        const pts = filtered.map((s, i) => ({
            x: padding.left + i * xStep,
            y: padding.top + chartHeight - ((s.score - minScore) / range) * chartHeight,
            score: s.score,
            week: s.week,
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

        // Create area path (same as line but closed at bottom)
        const areaBottom = padding.top + chartHeight;
        let area = `M ${pts[0].x} ${areaBottom} L ${pts[0].x} ${pts[0].y}`;
        for (let i = 1; i < pts.length; i++) {
            const prev = pts[i - 1];
            const curr = pts[i];
            const cpX = (prev.x + curr.x) / 2;
            area += ` Q ${prev.x + (curr.x - prev.x) * 0.5} ${prev.y}, ${cpX} ${(prev.y + curr.y) / 2}`;
            area += ` Q ${cpX + (curr.x - cpX) * 0.5} ${curr.y}, ${curr.x} ${curr.y}`;
        }
        area += ` L ${pts[pts.length - 1].x} ${areaBottom} Z`;

        return { pathData: path, areaData: area, points: pts, validScores: filtered };
    }, [scores, chartHeight, padding]);

    if (validScores.length < 2) {
        return (
            <View style={[styles.container, { height }]}>
                <Text style={styles.emptyText}>Not enough data for trend</Text>
            </View>
        );
    }

    const formatWeekLabel = (weekStr: string) => {
        const date = new Date(weekStr);
        return `${date.getMonth() + 1}/${date.getDate()}`;
    };

    return (
        <View style={[styles.container, { height }]}>
            <Svg width="100%" height={height} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none">
                <Defs>
                    <LinearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={scoreColor} stopOpacity="0.3" />
                        <Stop offset="1" stopColor={scoreColor} stopOpacity="0.05" />
                    </LinearGradient>
                </Defs>

                {/* Area fill */}
                <Path d={areaData} fill="url(#areaGradient)" />

                {/* Line */}
                <Path
                    d={pathData}
                    stroke={scoreColor}
                    strokeWidth={2}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />

                {/* Points */}
                {points.map((pt, i) => (
                    <Circle
                        key={i}
                        cx={pt.x}
                        cy={pt.y}
                        r={i === points.length - 1 ? 4 : 2.5}
                        fill={i === points.length - 1 ? scoreColor : 'rgba(255,255,255,0.8)'}
                        stroke={scoreColor}
                        strokeWidth={i === points.length - 1 ? 0 : 1}
                    />
                ))}
            </Svg>

            {/* Week labels */}
            {showLabels && validScores.length >= 2 && (
                <View style={styles.labelsContainer}>
                    <Text style={styles.weekLabel}>{formatWeekLabel(validScores[0].week)}</Text>
                    <Text style={styles.weekLabel}>{formatWeekLabel(validScores[validScores.length - 1].week)}</Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: '100%',
    },
    emptyText: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: Colors.textTertiary,
        textAlign: 'center',
        marginTop: 16,
    },
    labelsContainer: {
        position: 'absolute',
        bottom: 0,
        left: 12,
        right: 12,
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    weekLabel: {
        fontFamily: fonts.regular,
        fontSize: 10,
        color: Colors.textTertiary,
    },
});
