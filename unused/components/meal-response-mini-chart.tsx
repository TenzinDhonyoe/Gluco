import { fonts } from '@/hooks/useFonts';
import { GlucoseUnit, formatGlucose } from '@/lib/utils/glucoseUnits';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';

type CurvePoint = { time: number; value: number };

interface MealResponseMiniChartProps {
    actualCurve?: CurvePoint[] | null;
    predictedCurve?: CurvePoint[] | null;
    mealTime?: Date | null;
    glucoseUnit: GlucoseUnit;
}

// Fixed Y-axis ticks matching the Figma design
const Y_TICKS = [0, 3, 7, 9, 11, 15];
const TARGET_LINE = 9; // Dashed target zone line

export function MealResponseMiniChart({
    actualCurve,
    predictedCurve,
    mealTime,
    glucoseUnit,
}: MealResponseMiniChartProps) {
    // Chart dimensions
    const chartWidth = 310;
    const chartHeight = 180;
    const padding = { top: 20, right: 60, bottom: 50, left: 35 };
    const innerWidth = chartWidth - padding.left - padding.right;
    const innerHeight = chartHeight - padding.top - padding.bottom;

    // Generate time labels based on meal time (2 hour window)
    const timeLabels = useMemo(() => {
        const baseMealTime = mealTime || new Date();
        const labels: { label: string; minutes: number }[] = [];
        
        for (let i = 0; i <= 6; i++) {
            const minutes = i * 20; // 0, 20, 40, 60, 80, 100, 120
            const time = new Date(baseMealTime.getTime() + minutes * 60 * 1000);
            const h = time.getHours();
            const m = time.getMinutes();
            const ampm = h >= 12 ? 'PM' : 'AM';
            const h12 = h % 12 || 12;
            labels.push({
                label: `${h12.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}${ampm}`,
                minutes,
            });
        }
        return labels;
    }, [mealTime]);

    // Scale functions
    const yMin = 0;
    const yMax = 15;
    const xMin = 0;
    const xMax = 120; // 2 hours in minutes

    const scaleX = (time: number) => padding.left + (time / xMax) * innerWidth;
    const scaleY = (value: number) => padding.top + innerHeight - ((value - yMin) / (yMax - yMin)) * innerHeight;

    // Create smooth curve path using bezier curves
    const createSmoothPath = (points: CurvePoint[]): string => {
        if (points.length === 0) return '';
        const sorted = [...points].sort((a, b) => a.time - b.time);
        
        if (sorted.length === 1) {
            const x = scaleX(sorted[0].time);
            const y = scaleY(sorted[0].value);
            return `M ${x} ${y}`;
        }

        let path = `M ${scaleX(sorted[0].time)} ${scaleY(sorted[0].value)}`;
        
        for (let i = 1; i < sorted.length; i++) {
            const prev = sorted[i - 1];
            const curr = sorted[i];
            const prevX = scaleX(prev.time);
            const prevY = scaleY(prev.value);
            const currX = scaleX(curr.time);
            const currY = scaleY(curr.value);
            
            // Create smooth bezier curve
            const cp1x = prevX + (currX - prevX) / 3;
            const cp2x = prevX + 2 * (currX - prevX) / 3;
            path += ` C ${cp1x} ${prevY} ${cp2x} ${currY} ${currX} ${currY}`;
        }
        
        return path;
    };

    // Create filled area path
    const createFilledPath = (points: CurvePoint[]): string => {
        if (points.length === 0) return '';
        const linePath = createSmoothPath(points);
        const sorted = [...points].sort((a, b) => a.time - b.time);
        const startX = scaleX(sorted[0].time);
        const endX = scaleX(sorted[sorted.length - 1].time);
        const baseline = scaleY(yMin);
        return `${linePath} L ${endX} ${baseline} L ${startX} ${baseline} Z`;
    };

    // Find peak point
    const findPeak = (points: CurvePoint[] | null | undefined): CurvePoint | null => {
        if (!points || points.length === 0) return null;
        return points.reduce((max, p) => p.value > max.value ? p : max, points[0]);
    };

    const actualPeak = findPeak(actualCurve);
    const predictedPeak = findPeak(predictedCurve);

    const hasData = (actualCurve && actualCurve.length > 0) || (predictedCurve && predictedCurve.length > 0);

    if (!hasData) {
        return (
            <View style={[styles.container, { width: chartWidth, height: chartHeight }]}>
                <Text style={styles.emptyText}>No curve data available</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Y-axis label */}
            <Text style={styles.yAxisTitle}>{glucoseUnit}</Text>
            
            {/* Legend in top right */}
            <View style={styles.legend}>
                <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: '#3494D9' }]} />
                    <Text style={styles.legendText}>Actual</Text>
                </View>
                <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: '#878787' }]} />
                    <Text style={styles.legendText}>Predicted</Text>
                </View>
            </View>

            <Svg width={chartWidth} height={chartHeight}>
                <Defs>
                    <LinearGradient id="actualGradient" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor="#3494D9" stopOpacity="0.3" />
                        <Stop offset="1" stopColor="#3494D9" stopOpacity="0" />
                    </LinearGradient>
                    <LinearGradient id="predictedGradient" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor="#878787" stopOpacity="0.2" />
                        <Stop offset="1" stopColor="#878787" stopOpacity="0" />
                    </LinearGradient>
                </Defs>

                {/* Horizontal grid lines */}
                {Y_TICKS.map(val => (
                    <Line
                        key={`h-grid-${val}`}
                        x1={padding.left}
                        y1={scaleY(val)}
                        x2={chartWidth - padding.right}
                        y2={scaleY(val)}
                        stroke="#3A3A3A"
                        strokeWidth={1}
                    />
                ))}

                {/* Vertical grid lines */}
                {timeLabels.map((t, i) => (
                    <Line
                        key={`v-grid-${i}`}
                        x1={scaleX(t.minutes)}
                        y1={padding.top}
                        x2={scaleX(t.minutes)}
                        y2={padding.top + innerHeight}
                        stroke="#3A3A3A"
                        strokeWidth={1}
                    />
                ))}

                {/* Target zone dashed line */}
                <Line
                    x1={padding.left}
                    y1={scaleY(TARGET_LINE)}
                    x2={chartWidth - padding.right}
                    y2={scaleY(TARGET_LINE)}
                    stroke="#5A5A5A"
                    strokeWidth={1}
                    strokeDasharray="4,4"
                />

                {/* Predicted curve fill */}
                {predictedCurve && predictedCurve.length > 0 && (
                    <Path
                        d={createFilledPath(predictedCurve)}
                        fill="url(#predictedGradient)"
                    />
                )}

                {/* Predicted curve line */}
                {predictedCurve && predictedCurve.length > 0 && (
                    <Path
                        d={createSmoothPath(predictedCurve)}
                        stroke="#878787"
                        strokeWidth={2}
                        fill="none"
                    />
                )}

                {/* Actual curve fill */}
                {actualCurve && actualCurve.length > 0 && (
                    <Path
                        d={createFilledPath(actualCurve)}
                        fill="url(#actualGradient)"
                    />
                )}

                {/* Actual curve line */}
                {actualCurve && actualCurve.length > 0 && (
                    <Path
                        d={createSmoothPath(actualCurve)}
                        stroke="#3494D9"
                        strokeWidth={2.5}
                        fill="none"
                    />
                )}

                {/* Predicted peak marker and label */}
                {predictedPeak && (
                    <>
                        <Circle
                            cx={scaleX(predictedPeak.time)}
                            cy={scaleY(predictedPeak.value)}
                            r={4}
                            fill="#878787"
                        />
                        <SvgText
                            x={scaleX(predictedPeak.time)}
                            y={scaleY(predictedPeak.value) - 10}
                            textAnchor="middle"
                            fill="#E7E8E9"
                            fontSize={12}
                            fontFamily="Outfit-Regular"
                        >
                            {formatGlucose(predictedPeak.value, glucoseUnit)}
                        </SvgText>
                    </>
                )}

                {/* Actual peak marker and label */}
                {actualPeak && (
                    <>
                        <Circle
                            cx={scaleX(actualPeak.time)}
                            cy={scaleY(actualPeak.value)}
                            r={5}
                            fill="#3494D9"
                        />
                        <SvgText
                            x={scaleX(actualPeak.time)}
                            y={scaleY(actualPeak.value) - 12}
                            textAnchor="middle"
                            fill="#E7E8E9"
                            fontSize={12}
                            fontFamily="Outfit-Regular"
                            fontWeight="600"
                        >
                            {formatGlucose(actualPeak.value, glucoseUnit)}
                        </SvgText>
                    </>
                )}

                {/* Y-axis labels */}
                {Y_TICKS.map(val => (
                    <SvgText
                        key={`y-label-${val}`}
                        x={padding.left - 8}
                        y={scaleY(val) + 4}
                        textAnchor="end"
                        fill="#E7E8E9"
                        fontSize={12}
                        fontFamily="Outfit-Regular"
                    >
                        {val}
                    </SvgText>
                ))}

                {/* X-axis labels (rotated) */}
                {timeLabels.map((t, i) => (
                    <SvgText
                        key={`x-label-${i}`}
                        x={scaleX(t.minutes)}
                        y={padding.top + innerHeight + 12}
                        textAnchor="end"
                        fill="#E7E8E9"
                        fontSize={11}
                        fontFamily="Outfit-Medium"
                        transform={`rotate(-30, ${scaleX(t.minutes)}, ${padding.top + innerHeight + 12})`}
                    >
                        {t.label}
                    </SvgText>
                ))}
            </Svg>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'relative',
    },
    emptyText: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: '#878787',
        textAlign: 'center',
        marginTop: 60,
    },
    yAxisTitle: {
        position: 'absolute',
        top: 4,
        left: 0,
        fontFamily: fonts.regular,
        fontSize: 12,
        color: '#E7E8E9',
    },
    legend: {
        position: 'absolute',
        top: 4,
        right: 0,
        gap: 8,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginBottom: 4,
    },
    legendDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    legendText: {
        fontFamily: fonts.medium,
        fontSize: 12,
        color: '#E7E8E9',
    },
});
