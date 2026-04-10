import React from 'react';
import Svg, { Circle, Path, G } from 'react-native-svg';

/** Target with an arrow — hitting your goals */
export function GoalsIllustration({ size = 48 }: { size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
            {/* Outer ring */}
            <Circle
                cx={22}
                cy={24}
                r={16}
                stroke="#FFFFFF"
                strokeWidth={2}
                fill="none"
                opacity={0.3}
            />
            {/* Middle ring */}
            <Circle
                cx={22}
                cy={24}
                r={10}
                stroke="#FFFFFF"
                strokeWidth={2}
                fill="none"
                opacity={0.55}
            />
            {/* Bullseye */}
            <Circle cx={22} cy={24} r={4} fill="#FFFFFF" />
            {/* Arrow shaft */}
            <Path
                d="M30 16L22 24"
                stroke="#FFFFFF"
                strokeWidth={2.5}
                strokeLinecap="round"
            />
            {/* Arrow head */}
            <Path
                d="M30 16L34 12"
                stroke="#FFFFFF"
                strokeWidth={2.5}
                strokeLinecap="round"
            />
            <Path
                d="M34 12L34 17"
                stroke="#FFFFFF"
                strokeWidth={2}
                strokeLinecap="round"
                opacity={0.8}
            />
            <Path
                d="M34 12L29 12"
                stroke="#FFFFFF"
                strokeWidth={2}
                strokeLinecap="round"
                opacity={0.8}
            />
        </Svg>
    );
}
