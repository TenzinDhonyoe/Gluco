import { Colors } from '@/constants/Colors';
import { getScoreColor, type ScoreLabel } from '@/lib/mealScore';
import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

interface MealGlucoseChartProps {
    readings: { value: number; timestamp: string }[];
    scoreLabel?: ScoreLabel;
    height?: number;
    showRangeBand?: boolean;
}

// Internal scoring thresholds (mg/dL) — never exposed to users
const RANGE_LOW = 70;
const RANGE_HIGH = 140;

const PAD = { top: 6, bottom: 6, left: 4, right: 4 } as const;
const VIEW_WIDTH = 200; // wider viewBox for smoother curves

export function MealGlucoseChart({
    readings,
    scoreLabel = 'moderate',
    height = 80,
    showRangeBand = true,
}: MealGlucoseChartProps) {
    const color = getScoreColor(scoreLabel);
    const chartHeight = height - PAD.top - PAD.bottom;
    const innerWidth = VIEW_WIDTH - PAD.left - PAD.right;

    const { linePath, areaPath, peakPt, hasData, bandY, bandH } = useMemo(() => {
        const empty = { linePath: '', areaPath: '', peakPt: null, hasData: false, bandY: 0, bandH: 0 };
        if (readings.length < 2) return empty;

        const vals = readings.map(r => r.value);
        const lo = Math.min(...vals, showRangeBand ? RANGE_LOW : Infinity);
        const hi = Math.max(...vals, showRangeBand ? RANGE_HIGH : -Infinity);
        const span = Math.max(hi - lo, 1);

        const ts = readings.map(r => new Date(r.timestamp).getTime());
        const tSpan = ts[ts.length - 1] - ts[0];

        // Map to SVG coordinates
        const pts = readings.map((r, i) => ({
            x: PAD.left + (tSpan > 0 ? ((ts[i] - ts[0]) / tSpan) * innerWidth : (i / (readings.length - 1)) * innerWidth),
            y: PAD.top + chartHeight - ((r.value - lo) / span) * chartHeight,
            v: r.value,
        }));

        // Catmull-Rom → cubic Bézier for genuinely smooth curves
        const cubicPath = catmullRomToBezier(pts);
        const bottomY = PAD.top + chartHeight;

        // Area path = line + close to bottom
        const area = `${cubicPath} L ${pts[pts.length - 1].x} ${bottomY} L ${pts[0].x} ${bottomY} Z`;

        // Peak
        const peakVal = Math.max(...vals);
        const peakIdx = vals.indexOf(peakVal);

        // Range band
        const bTop = PAD.top + chartHeight - ((RANGE_HIGH - lo) / span) * chartHeight;
        const bBot = PAD.top + chartHeight - ((RANGE_LOW - lo) / span) * chartHeight;

        return {
            linePath: cubicPath,
            areaPath: area,
            peakPt: pts[peakIdx],
            hasData: true,
            bandY: bTop,
            bandH: bBot - bTop,
        };
    }, [readings, chartHeight, innerWidth, showRangeBand]);

    if (!hasData) {
        return (
            <View style={[styles.container, { height }]}>
                <View style={styles.noDataLine} />
            </View>
        );
    }

    const gradId = `glcGrad_${color.replace('#', '')}`;

    return (
        <View style={[styles.container, { height }]}>
            <Svg
                width="100%"
                height={height}
                viewBox={`0 0 ${VIEW_WIDTH} ${height}`}
                preserveAspectRatio="none"
            >
                <Defs>
                    <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={color} stopOpacity="0.18" />
                        <Stop offset="0.7" stopColor={color} stopOpacity="0.04" />
                        <Stop offset="1" stopColor={color} stopOpacity="0" />
                    </LinearGradient>
                </Defs>

                {/* Gentle in-range band */}
                {showRangeBand && bandH > 0 && (
                    <Rect
                        x={PAD.left}
                        y={bandY}
                        width={innerWidth}
                        height={bandH}
                        fill={Colors.success}
                        opacity={0.06}
                        rx={3}
                    />
                )}

                {/* Soft gradient fill under curve */}
                <Path d={areaPath} fill={`url(#${gradId})`} />

                {/* Smooth glucose line */}
                <Path
                    d={linePath}
                    stroke={color}
                    strokeWidth={2}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />

                {/* Peak glow + dot */}
                {peakPt && (
                    <>
                        <Circle cx={peakPt.x} cy={peakPt.y} r={6} fill={color} opacity={0.15} />
                        <Circle cx={peakPt.x} cy={peakPt.y} r={3} fill={color} />
                    </>
                )}
            </Svg>
        </View>
    );
}

// ─── Catmull-Rom spline → SVG cubic Bézier ──────────────────────────────────
// Produces genuinely smooth curves through all data points.

function catmullRomToBezier(pts: { x: number; y: number }[], tension = 0.35): string {
    if (pts.length < 2) return '';
    if (pts.length === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;

    let d = `M ${pts[0].x} ${pts[0].y}`;

    for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[Math.min(pts.length - 1, i + 2)];

        const cp1x = p1.x + ((p2.x - p0.x) * tension);
        const cp1y = p1.y + ((p2.y - p0.y) * tension);
        const cp2x = p2.x - ((p3.x - p1.x) * tension);
        const cp2y = p2.y - ((p3.y - p1.y) * tension);

        d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }

    return d;
}

const styles = StyleSheet.create({
    container: {
        width: '100%',
    },
    noDataLine: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.05)',
        borderRadius: 1,
        marginVertical: 'auto' as unknown as number,
        height: 1,
    },
});
