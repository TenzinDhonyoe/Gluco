import { Colors } from '@/constants/Colors';
import { fonts } from '@/hooks/useFonts';
import { GlucoseUnit, formatGlucose } from '@/lib/utils/glucoseUnits';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, PanResponder, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { ClipPath, Defs, G, Line, Path, Rect, Circle as SvgCircle } from 'react-native-svg';

// Create animated circle component
const AnimatedCircle = Animated.createAnimatedComponent(SvgCircle);

// Create animated path component with reanimated
const AnimatedPath = Animated.createAnimatedComponent(Path);

export type GlucosePoint = {
  value: number; // mmol/L
  label: string; // x-axis label for tooltip (e.g. "2pm" or "Mon")
};

export type TrendPoint = GlucosePoint;

type Props = {
  rawData: GlucosePoint[];    // Daily averages (for faint dots)
  trendData: GlucosePoint[];  // Rolling averages (for dominant line)
  height?: number;
  targetLow?: number;         // Custom target range minimum (mmol/L)
  targetHigh?: number;        // Custom target range maximum (mmol/L)
  glucoseUnit?: GlucoseUnit;  // User's preferred display unit
  activeIndex?: number;
  onActiveIndexChange?: (index: number) => void;
};

// Fixed glucose range for Y axis (mmol/L)
const GLUCOSE_MIN = 2;
const GLUCOSE_MAX = 14;

// Default target range boundaries (mmol/L)
const DEFAULT_TARGET_LOW = 3.9;
const DEFAULT_TARGET_HIGH = 10.0;

const PAD_LEFT = 32;
const PAD_RIGHT = 12;
const PAD_TOP = 12;
const PAD_BOTTOM = 24;

export function GlucoseTrendChart({
  rawData,
  trendData,
  height = 200,
  targetLow = DEFAULT_TARGET_LOW,
  targetHigh = DEFAULT_TARGET_HIGH,
  glucoseUnit = 'mmol/L',
  activeIndex,
  onActiveIndexChange,
}: Props) {
  const [w, setW] = useState(0);
  const [internalActive, setInternalActive] = useState<number | null>(null);
  const [isTouching, setIsTouching] = useState(false);
  const active = activeIndex ?? internalActive;
  const lastEmitted = useRef<number | null>(null);
  const prevPathRef = useRef<string>('');
  const prevPointsRef = useRef<{ x: number; y: number }[]>([]);

  // Use reanimated shared values for smooth path transitions
  const pathProgress = useSharedValue(0);
  const lineOpacity = useSharedValue(1);
  const dotsOpacity = useSharedValue(1);

  // Define animated props at component level (not inside loops or render)
  const lineAnimatedProps = useAnimatedProps(() => ({
    opacity: lineOpacity.value,
  }));

  const dotsAnimatedProps = useAnimatedProps(() => ({
    opacity: dotsOpacity.value,
  }));

  const chartH = height - PAD_TOP - PAD_BOTTOM;
  const chartW = Math.max(0, w - PAD_LEFT - PAD_RIGHT);

  // Calculate positions for both raw dots and trend line
  const { rawPoints, trendPoints, trendPathD, stepX, zones } = useMemo(() => {
    const usableH = Math.max(1, chartH);
    const usableW = Math.max(1, chartW);
    const range = GLUCOSE_MAX - GLUCOSE_MIN;

    // Calculate zone Y positions
    const highY1 = PAD_TOP;
    const highY2 = PAD_TOP + ((GLUCOSE_MAX - targetHigh) / range) * usableH;
    const goodY1 = highY2;
    const goodY2 = PAD_TOP + ((GLUCOSE_MAX - targetLow) / range) * usableH;
    const lowY1 = goodY2;
    const lowY2 = PAD_TOP + usableH;

    // Calculate raw points (for faint dots)
    const rawN = Math.max(1, rawData.length);
    const rawStep = rawN <= 1 ? 0 : usableW / (rawN - 1);
    const rawPts = rawData.map((d: GlucosePoint, i: number) => {
      const x = PAD_LEFT + i * rawStep;
      const clampedValue = Math.max(GLUCOSE_MIN, Math.min(GLUCOSE_MAX, d.value));
      const y = PAD_TOP + ((GLUCOSE_MAX - clampedValue) / range) * usableH;
      return { x, y, value: d.value };
    });

    // Calculate trend points (for dominant line)
    const trendN = Math.max(1, trendData.length);
    const trendStep = trendN <= 1 ? 0 : usableW / (trendN - 1);
    const trendPts = trendData.map((d: GlucosePoint, i: number) => {
      const x = PAD_LEFT + i * trendStep;
      const clampedValue = Math.max(GLUCOSE_MIN, Math.min(GLUCOSE_MAX, d.value));
      const y = PAD_TOP + ((GLUCOSE_MAX - clampedValue) / range) * usableH;
      return { x, y };
    });

    // Build path string for trend line
    const pathStr = trendPts
      .map((p: { x: number; y: number }, i: number) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(' ');

    return {
      rawPoints: rawPts,
      trendPoints: trendPts,
      trendPathD: pathStr,
      stepX: rawStep,
      zones: {
        high: { y: highY1, h: highY2 - highY1 },
        good: { y: goodY1, h: goodY2 - goodY1 },
        low: { y: lowY1, h: lowY2 - lowY1 },
      },
    };
  }, [rawData, trendData, chartH, chartW, targetLow, targetHigh]);

  // Animate path transition when data changes
  useEffect(() => {
    if (trendPoints.length === 0) {
      lineOpacity.value = withTiming(0, { 
        duration: 200,
        easing: Easing.out(Easing.ease),
      });
      dotsOpacity.value = withTiming(0, { 
        duration: 200,
        easing: Easing.out(Easing.ease),
      });
      return;
    }

    // Check if path actually changed
    const currentPath = trendPathD;
    if (prevPathRef.current === currentPath) {
      return;
    }

    // If we have previous points, animate transition smoothly
    if (prevPointsRef.current.length > 0 && prevPathRef.current) {
      // Smooth transition: fade slightly then fade back in with easing
      lineOpacity.value = withTiming(0.5, { 
        duration: 200,
        easing: Easing.inOut(Easing.ease),
      }, () => {
        prevPathRef.current = currentPath;
        prevPointsRef.current = trendPoints;
        lineOpacity.value = withTiming(1, { 
          duration: 500,
          easing: Easing.out(Easing.ease),
        });
      });
      dotsOpacity.value = withTiming(0.5, { 
        duration: 200,
        easing: Easing.inOut(Easing.ease),
      }, () => {
        dotsOpacity.value = withTiming(1, { 
          duration: 500,
          easing: Easing.out(Easing.ease),
        });
      });
    } else {
      // First render - just fade in smoothly
      prevPathRef.current = currentPath;
      prevPointsRef.current = trendPoints;
      lineOpacity.value = withTiming(1, { 
        duration: 500,
        easing: Easing.out(Easing.ease),
      });
      dotsOpacity.value = withTiming(1, { 
        duration: 500,
        easing: Easing.out(Easing.ease),
      });
    }
  }, [trendPathD, trendPoints, lineOpacity, dotsOpacity]);

  const updateActiveFromX = (x: number) => {
    if (!rawData.length || chartW <= 0) return;
    const clamped = Math.max(PAD_LEFT, Math.min(PAD_LEFT + chartW, x));
    const idx = stepX > 0 ? Math.round((clamped - PAD_LEFT) / stepX) : 0;
    const next = Math.max(0, Math.min(rawData.length - 1, idx));

    if (lastEmitted.current === next) return;
    lastEmitted.current = next;

    if (onActiveIndexChange) onActiveIndexChange(next);
    else setInternalActive(next);
  };

  const panResponder = useMemo(() => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        setIsTouching(true);
        updateActiveFromX(e.nativeEvent.locationX);
      },
      onPanResponderMove: (e) => updateActiveFromX(e.nativeEvent.locationX),
      onPanResponderRelease: () => {
        setIsTouching(false);
        setInternalActive(null);
        lastEmitted.current = null;
      },
      onPanResponderTerminate: () => {
        setIsTouching(false);
        setInternalActive(null);
        lastEmitted.current = null;
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepX, chartW, rawData.length, onActiveIndexChange]);

  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);

  const activePt = active != null ? rawPoints[active] : null;
  const activeRawData = active != null ? rawData[active] : null;
  const showIndicator = isTouching && !!activePt && !!activeRawData && w > 0;

  // Y-axis values to display (in mmol/L - will be converted for display)
  const yLabelsMmol = [12, 10, 8, 6, 4];
  
  // Format Y-axis labels based on unit
  const yLabels = useMemo(() => 
    yLabelsMmol.map(val => ({
      mmol: val,
      display: formatGlucose(val, glucoseUnit),
    })),
    [glucoseUnit]
  );

  return (
    <View style={[styles.container, { height }]} onLayout={onLayout} {...panResponder.panHandlers}>
      {w > 0 && (
        <>
          <View style={StyleSheet.absoluteFill}>
            <Svg width={w} height={height} style={StyleSheet.absoluteFill}>
              <Defs>
                <ClipPath id="chartClip">
                  <Rect x={PAD_LEFT} y={PAD_TOP} width={chartW} height={chartH} rx={8} />
                </ClipPath>
              </Defs>

              {/* Colored background zones (clipped to rounded rect) */}
              <G clipPath="url(#chartClip)">
                {/* High zone - red */}
                <Rect
                  x={PAD_LEFT}
                  y={zones.high.y}
                  width={chartW}
                  height={zones.high.h}
                  fill="rgba(183, 68, 68, 0.35)"
                />
                {/* Good zone - green */}
                <Rect
                  x={PAD_LEFT}
                  y={zones.good.y}
                  width={chartW}
                  height={zones.good.h}
                  fill="rgba(56, 118, 58, 0.40)"
                />
                {/* Low zone - red */}
                <Rect
                  x={PAD_LEFT}
                  y={zones.low.y}
                  width={chartW}
                  height={zones.low.h}
                  fill="rgba(183, 68, 68, 0.35)"
                />

                {/* Subtle horizontal grid lines */}
                {yLabels.map(({ mmol }) => {
                  const y = PAD_TOP + ((GLUCOSE_MAX - mmol) / (GLUCOSE_MAX - GLUCOSE_MIN)) * chartH;
                  return (
                    <Line
                      key={mmol}
                      x1={PAD_LEFT}
                      y1={y}
                      x2={PAD_LEFT + chartW}
                      y2={y}
                      stroke="rgba(255,255,255,0.08)"
                      strokeWidth={1}
                    />
                  );
                })}

                {/* Target boundary dashed lines */}
                <Line
                  x1={PAD_LEFT}
                  y1={zones.good.y}
                  x2={PAD_LEFT + chartW}
                  y2={zones.good.y}
                  stroke="rgba(255,255,255,0.25)"
                  strokeWidth={1}
                  strokeDasharray="6,4"
                />
                <Line
                  x1={PAD_LEFT}
                  y1={zones.good.y + zones.good.h}
                  x2={PAD_LEFT + chartW}
                  y2={zones.good.y + zones.good.h}
                  stroke="rgba(255,255,255,0.25)"
                  strokeWidth={1}
                  strokeDasharray="6,4"
                />
              </G>

              {/* Layer A: Faint dots for raw daily readings with smooth transitions */}
              {rawPoints.map((pt, idx) => (
                <AnimatedCircle
                  key={`raw-${idx}`}
                  cx={pt.x}
                  cy={pt.y}
                  r={4}
                  fill="rgba(52, 148, 217, 0.4)"
                  animatedProps={dotsAnimatedProps}
                />
              ))}

              {/* Layer B: Animated trend line (rolling average) with smooth transitions */}
              <AnimatedPath
                d={trendPathD}
                stroke="#3494D9"
                strokeWidth={3}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                animatedProps={lineAnimatedProps}
              />

              {/* Active point indicator - only shown when touching */}
              {showIndicator && activePt && (
                <>
                  <Line
                    x1={activePt.x}
                    y1={PAD_TOP}
                    x2={activePt.x}
                    y2={PAD_TOP + chartH}
                    stroke="rgba(255,255,255,0.15)"
                    strokeWidth={1}
                  />
                  <SvgCircle cx={activePt.x} cy={activePt.y} r={6} fill="#fff" />
                  <SvgCircle cx={activePt.x} cy={activePt.y} r={4} fill="#3494D9" />
                </>
              )}
            </Svg>
          </View>

          {/* Y-axis labels */}
          <View style={styles.yAxis} pointerEvents="none">
            {yLabels.map(({ mmol, display }) => {
              const y = PAD_TOP + ((GLUCOSE_MAX - mmol) / (GLUCOSE_MAX - GLUCOSE_MIN)) * chartH;
              return (
                <Text key={mmol} style={[styles.yLabel, { top: y - 6 }]}>
                  {display}
                </Text>
              );
            })}
          </View>

          {/* X-axis labels */}
          <View style={[styles.xAxis, { top: height - PAD_BOTTOM + 4 }]} pointerEvents="none">
            {(() => {
              // Calculate how many labels we can fit without overlap
              const labelWidth = 50;
              const minGap = 8; // Minimum gap between labels
              const totalLabelSpace = labelWidth + minGap;
              const availableWidth = chartW;
              const maxLabels = Math.max(2, Math.floor(availableWidth / totalLabelSpace));

              // Calculate interval to show maxLabels evenly spaced
              const n = rawData.length;
              const interval = Math.max(1, Math.ceil((n - 1) / (maxLabels - 1)));

              // Build array of indices to show
              const indicesToShow: number[] = [];
              for (let i = 0; i < n; i += interval) {
                indicesToShow.push(i);
              }
              // Ensure last point is included (but not duplicated)
              if (indicesToShow[indicesToShow.length - 1] !== n - 1) {
                // Only add last if it won't overlap with previous
                const lastShown = indicesToShow[indicesToShow.length - 1];
                if (n - 1 - lastShown >= interval / 2) {
                  indicesToShow.push(n - 1);
                } else {
                  // Replace last with actual last point
                  indicesToShow[indicesToShow.length - 1] = n - 1;
                }
              }

              return indicesToShow.map((i) => {
                const d = rawData[i];
                const pt = rawPoints[i];
                if (!d || !pt) return null;

                // Calculate label position, clamping to prevent overflow
                const halfLabel = labelWidth / 2;
                const rawLeft = pt.x - halfLabel;
                // Clamp: don't go past left edge or right edge
                const clampedLeft = Math.max(PAD_LEFT - halfLabel, Math.min(w - labelWidth, rawLeft));

                return (
                  <Text key={i} style={[styles.xLabel, { left: clampedLeft, width: labelWidth }]}>
                    {d.label}
                  </Text>
                );
              });
            })()}
          </View>

          {/* Tooltip - only shown when touching */}
          {showIndicator && activePt && activeRawData && (
            <View
              pointerEvents="none"
              style={[
                styles.tooltip,
                { left: Math.min(Math.max(PAD_LEFT, activePt.x - 40), w - 88) },
              ]}
            >
              <Text style={styles.tooltipValue}>{formatGlucose(activeRawData.value, glucoseUnit)}</Text>
              <Text style={styles.tooltipLabel}>{activeRawData.label}</Text>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: 'transparent',
  },
  yAxis: {
    position: 'absolute',
    left: 4,
    top: 0,
    bottom: 0,
    width: PAD_LEFT - 6,
  },
  yLabel: {
    position: 'absolute',
    right: 0,
    fontFamily: fonts.regular,
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'right',
  },
  xAxis: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 20,
  },
  xLabel: {
    position: 'absolute',
    fontFamily: fonts.regular,
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
  },
  tooltip: {
    position: 'absolute',
    top: 8,
    width: 80,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(30, 30, 32, 0.95)',
    alignItems: 'center',
  },
  tooltipValue: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: Colors.textPrimary,
  },
  tooltipLabel: {
    fontFamily: fonts.regular,
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 1,
  },
});
