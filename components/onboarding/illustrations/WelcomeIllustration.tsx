import React from 'react';
import Svg, { Circle, Path, G } from 'react-native-svg';

/** Gluco leaf sprout — a seedling growing from a circle, representing the start of a journey */
export function WelcomeIllustration({ size = 48 }: { size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
            {/* Stem */}
            <Path
                d="M24 38V26"
                stroke="#FFFFFF"
                strokeWidth={2.5}
                strokeLinecap="round"
            />
            {/* Left leaf */}
            <Path
                d="M24 30C20 30 16 27 15 23C15 23 19 22 22 24C23 25 24 27 24 30Z"
                fill="#FFFFFF"
                opacity={0.85}
            />
            {/* Right leaf (larger, main) */}
            <Path
                d="M24 26C28 24 33 22 35 17C35 17 30 16 26 19C24 21 24 24 24 26Z"
                fill="#FFFFFF"
            />
            {/* Small circle at base */}
            <Circle cx={24} cy={39} r={2} fill="#FFFFFF" opacity={0.5} />
            {/* Tiny dot accent */}
            <Circle cx={30} cy={14} r={1.5} fill="#FFFFFF" opacity={0.3} />
            <Circle cx={17} cy={19} r={1} fill="#FFFFFF" opacity={0.25} />
        </Svg>
    );
}
