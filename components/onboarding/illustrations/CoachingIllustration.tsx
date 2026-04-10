import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

/** Winding path with milestone dots — representing a guided journey */
export function CoachingIllustration({ size = 48 }: { size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
            {/* Winding path */}
            <Path
                d="M10 40C10 40 14 34 24 34C34 34 34 28 24 28C14 28 14 22 24 22C34 22 34 16 24 16C18 16 14 12 14 8"
                stroke="#FFFFFF"
                strokeWidth={2}
                strokeLinecap="round"
                fill="none"
                opacity={0.45}
            />
            {/* Milestone dots along path */}
            <Circle cx={10} cy={40} r={3} fill="#FFFFFF" opacity={0.5} />
            <Circle cx={24} cy={28} r={2.5} fill="#FFFFFF" opacity={0.65} />
            <Circle cx={24} cy={22} r={2.5} fill="#FFFFFF" opacity={0.75} />
            <Circle cx={14} cy={8} r={3.5} fill="#FFFFFF" />
            {/* Flag at destination */}
            <Path
                d="M14 8L14 4"
                stroke="#FFFFFF"
                strokeWidth={2}
                strokeLinecap="round"
            />
            <Path
                d="M14 4L22 6L14 8"
                fill="#FFFFFF"
                opacity={0.8}
            />
            {/* Small sparkle at destination */}
            <Circle cx={24} cy={5} r={1} fill="#FFFFFF" opacity={0.4} />
            <Circle cx={20} cy={2} r={0.8} fill="#FFFFFF" opacity={0.25} />
        </Svg>
    );
}
