import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

/** Bowl with utensils and a leaf — representing dietary preferences */
export function DietaryIllustration({ size = 48 }: { size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
            {/* Bowl curve */}
            <Path
                d="M10 22C10 22 12 34 24 34C36 34 38 22 38 22"
                stroke="#FFFFFF"
                strokeWidth={2.5}
                strokeLinecap="round"
                fill="none"
            />
            {/* Bowl rim */}
            <Path
                d="M8 22L40 22"
                stroke="#FFFFFF"
                strokeWidth={2}
                strokeLinecap="round"
            />
            {/* Leaf in bowl */}
            <Path
                d="M24 28C21 26 19 23 20 20C20 20 23 21 25 23C26 24.5 26 27 24 28Z"
                fill="#FFFFFF"
                opacity={0.7}
            />
            {/* Steam wisps */}
            <Path
                d="M20 18C20 16 21 14 20 12"
                stroke="#FFFFFF"
                strokeWidth={1.5}
                strokeLinecap="round"
                opacity={0.4}
            />
            <Path
                d="M28 17C28 15 29 13 28 11"
                stroke="#FFFFFF"
                strokeWidth={1.5}
                strokeLinecap="round"
                opacity={0.3}
            />
            {/* Fork (left) */}
            <Path d="M6 14L6 22" stroke="#FFFFFF" strokeWidth={1.5} strokeLinecap="round" opacity={0.5} />
            <Path d="M4 14L4 18" stroke="#FFFFFF" strokeWidth={1} strokeLinecap="round" opacity={0.35} />
            <Path d="M8 14L8 18" stroke="#FFFFFF" strokeWidth={1} strokeLinecap="round" opacity={0.35} />
            {/* Base */}
            <Circle cx={24} cy={38} r={1.5} fill="#FFFFFF" opacity={0.3} />
        </Svg>
    );
}
