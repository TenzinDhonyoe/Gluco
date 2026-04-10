import React from 'react';
import Svg, { Path, Line, Circle } from 'react-native-svg';

/** Measuring tape / ruler concept — representing body measurements */
export function BodyIllustration({ size = 48 }: { size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
            {/* Vertical ruler bar */}
            <Path
                d="M20 8L20 40"
                stroke="#FFFFFF"
                strokeWidth={2.5}
                strokeLinecap="round"
            />
            {/* Tick marks */}
            <Line x1={20} y1={12} x2={26} y2={12} stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" />
            <Line x1={20} y1={18} x2={24} y2={18} stroke="#FFFFFF" strokeWidth={1.5} strokeLinecap="round" opacity={0.6} />
            <Line x1={20} y1={24} x2={28} y2={24} stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" />
            <Line x1={20} y1={30} x2={24} y2={30} stroke="#FFFFFF" strokeWidth={1.5} strokeLinecap="round" opacity={0.6} />
            <Line x1={20} y1={36} x2={26} y2={36} stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" />
            {/* Small indicator arrow */}
            <Path
                d="M32 24L28 24"
                stroke="#FFFFFF"
                strokeWidth={2}
                strokeLinecap="round"
                opacity={0.8}
            />
            <Circle cx={34} cy={24} r={3} fill="#FFFFFF" opacity={0.4} />
            {/* Accent dots */}
            <Circle cx={36} cy={14} r={1.2} fill="#FFFFFF" opacity={0.25} />
            <Circle cx={34} cy={34} r={1} fill="#FFFFFF" opacity={0.2} />
        </Svg>
    );
}
