import { Colors } from '@/constants/Colors';
import { fonts } from '@/hooks/useFonts';
import React, { useEffect, useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';

// Create Animated Line component
const AnimatedLine = Animated.createAnimatedComponent(Line);

// Mascot images
const MASCOT_CRY = require('@/assets/images/mascots/gluco_app_mascott/gluco_mascott_cry.png');
const MASCOT_DEFAULT = require('@/assets/images/mascots/gluco_app_mascott/gluco_mascott_default.png');
const LOCK_ICON = require('@/assets/images/icons/lock_red.png');

export type TrendStatus = 'low' | 'in_range' | 'high' | 'no_data';

interface GlucoseTrendIndicatorProps {
    status: TrendStatus;
    size?: number;
}

export function GlucoseTrendIndicator({
    status,
    size = 220
}: GlucoseTrendIndicatorProps) {
    const { mascot, label, labelColor, needleAngle, showNeedle, subtitle } = useMemo(() => {
        const defaultSubtitle = "Based on your recent glucose trends";
        switch (status) {
            case 'low':
                return {
                    mascot: MASCOT_CRY,
                    label: 'Low',
                    labelColor: Colors.chartRed,
                    needleAngle: -70,
                    showNeedle: true,
                    subtitle: defaultSubtitle,
                };
            case 'in_range':
                return {
                    mascot: MASCOT_DEFAULT,
                    label: 'In Range',
                    labelColor: Colors.success,
                    needleAngle: 0,
                    showNeedle: true,
                    subtitle: defaultSubtitle,
                };
            case 'high':
                return {
                    mascot: MASCOT_CRY,
                    label: 'High',
                    labelColor: Colors.chartRed,
                    needleAngle: 70,
                    showNeedle: true,
                    subtitle: defaultSubtitle,
                };
            case 'no_data':
            default:
                return {
                    mascot: MASCOT_CRY,
                    label: '- - -',
                    labelColor: Colors.chartRed,
                    needleAngle: -70, // Default to low/start position for no data
                    showNeedle: false,
                    subtitle: "Start logging to unlock your trends",
                };
        }
    }, [status]);

    // Animation Shared Value
    const animatedAngle = useSharedValue(needleAngle);

    useEffect(() => {
        // Animate to new angle whenever it changes
        if (showNeedle) {
            // Fast, snappy animation for responsive feel when switching time frames
            animatedAngle.value = withTiming(needleAngle, {
                duration: 150,
                easing: Easing.linear, // Minimal easing for speed
            });
        }
    }, [needleAngle, showNeedle]);

    // Dimensions
    const strokeWidth = 15;
    const radius = (size - strokeWidth) / 2;
    const centerX = size / 2;
    const centerY = size / 2 + 10; // Shift center down slightly to use top space

    // Worklet variables for animated props
    const innerR = radius - strokeWidth / 2 - 2;
    const outerR = radius + strokeWidth / 2 + 2;

    const animatedLineProps = useAnimatedProps(() => {
        const angleDeg = animatedAngle.value;
        const mathAngleDeg = 90 - angleDeg;
        const angleRad = (mathAngleDeg * Math.PI) / 180;

        return {
            x1: centerX + innerR * Math.cos(angleRad),
            y1: centerY - innerR * Math.sin(angleRad),
            x2: centerX + outerR * Math.cos(angleRad),
            y2: centerY - outerR * Math.sin(angleRad),
        };
    }, [centerX, centerY, innerR, outerR]); // Dependencies captured in worklet

    // Arc angles (SVG coordinates: 0=Right, 90=Down, 180=Left, 270=Top)
    // We want a horseshoe: Start at 150 (Bottom Left ish), End at 30 (Bottom Right ish) via Top.
    const startAngle = 150;
    const endAngle = 30;

    const arcPath = useMemo(() => {
        // Convert degrees to radians
        const startRad = (startAngle * Math.PI) / 180;
        const endRad = (endAngle * Math.PI) / 180;

        // Calculate start and end points
        const startX = centerX + radius * Math.cos(startRad);
        const startY = centerY + radius * Math.sin(startRad);
        const endX = centerX + radius * Math.cos(endRad);
        const endY = centerY + radius * Math.sin(endRad);

        // Path command: M startX startY A radius radius 0 1 1 endX endY
        // large-arc-flag = 1 (we want the long way around, > 180 deg)
        // sweep-flag = 1 (clockwise)
        return `M ${startX} ${startY} A ${radius} ${radius} 0 1 1 ${endX} ${endY}`;
    }, [centerX, centerY, radius]);

    const mascotSize = size * 0.35; // Reduced from 0.43
    const topPadding = 10;
    const bottomExtension = radius * Math.sin(30 * Math.PI / 180);
    const svgHeight = radius + bottomExtension + topPadding + strokeWidth;

    return (
        <View style={[styles.container, { width: size }]}>
            <View style={{ height: svgHeight, alignItems: 'center', justifyContent: 'flex-start' }}>
                <Svg
                    width={size}
                    height={svgHeight}
                    style={{ position: 'absolute', top: 0, zIndex: 0 }}
                    viewBox={`0 0 ${size} ${svgHeight}`}
                >
                    <Defs>
                        <LinearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                            <Stop offset="0%" stopColor={Colors.chartRed} />
                            <Stop offset="20%" stopColor={Colors.chartYellow} />
                            <Stop offset="50%" stopColor={Colors.success} />
                            <Stop offset="80%" stopColor={Colors.chartYellow} />
                            <Stop offset="100%" stopColor={Colors.chartRed} />
                        </LinearGradient>
                    </Defs>

                    <Path
                        d={arcPath}
                        stroke="url(#gaugeGradient)"
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                        fill="none"
                    />

                    {showNeedle && (
                        <AnimatedLine
                            animatedProps={animatedLineProps}
                            stroke="#FFFFFF"
                            strokeWidth="4"
                            strokeLinecap="round"
                        />
                    )}
                </Svg>

                {/* Mascot sits inside the arc - pulled up higher */}
                <View style={{ marginTop: centerY - mascotSize / 2 - 25, zIndex: 1 }}>
                    <Image
                        source={mascot}
                        style={{ width: mascotSize, height: mascotSize }}
                        resizeMode="contain"
                    />
                </View>
            </View>

            <View style={styles.textContainer}>
                <Text style={[styles.statusLabel, { color: labelColor }]}>
                    {label}
                </Text>
                <Text style={styles.subtitle} numberOfLines={1} adjustsFontSizeToFit>
                    {subtitle}
                </Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    mascotContainer: {
    },
    textContainer: {
        alignItems: 'center',
        marginTop: -35, // Increased negative margin to pull text closer to mascot
        width: '180%',
    },
    statusLabel: {
        fontFamily: fonts.bold,
        fontSize: 28,
        marginBottom: 2,
        textAlign: 'center',
        includeFontPadding: false,
    },
    subtitle: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: Colors.textPrimary,
        textAlign: 'center',
        width: '100%',
    },
    lockIconsRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
});

export default React.memo(GlucoseTrendIndicator);
