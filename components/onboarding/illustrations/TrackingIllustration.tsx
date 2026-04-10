import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

/** Phone with data streams flowing in — representing connected tracking */
export function TrackingIllustration({ size = 48 }: { size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
            {/* Phone body */}
            <Rect
                x={16}
                y={6}
                width={16}
                height={28}
                rx={4}
                stroke="#FFFFFF"
                strokeWidth={2}
                fill="none"
            />
            {/* Screen area line */}
            <Path d="M18 10L30 10" stroke="#FFFFFF" strokeWidth={1} opacity={0.3} />
            <Path d="M18 30L30 30" stroke="#FFFFFF" strokeWidth={1} opacity={0.3} />
            {/* Mini chart inside phone */}
            <Path
                d="M19 24L22 20L25 22L29 17"
                stroke="#FFFFFF"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
            />
            {/* Data stream from left */}
            <Circle cx={8} cy={16} r={2} fill="#FFFFFF" opacity={0.5} />
            <Path d="M10 16L16 18" stroke="#FFFFFF" strokeWidth={1.2} strokeLinecap="round" opacity={0.4} />
            {/* Data stream from right */}
            <Circle cx={40} cy={22} r={2} fill="#FFFFFF" opacity={0.5} />
            <Path d="M38 22L32 22" stroke="#FFFFFF" strokeWidth={1.2} strokeLinecap="round" opacity={0.4} />
            {/* Watch icon (small) bottom left */}
            <Circle cx={10} cy={30} r={3} stroke="#FFFFFF" strokeWidth={1.2} fill="none" opacity={0.45} />
            <Path d="M10 28L10 30L11.5 31" stroke="#FFFFFF" strokeWidth={1} strokeLinecap="round" opacity={0.45} />
            <Path d="M13 30L16 28" stroke="#FFFFFF" strokeWidth={1} strokeLinecap="round" opacity={0.3} />
            {/* Home button dot */}
            <Circle cx={24} cy={32} r={1.2} fill="#FFFFFF" opacity={0.4} />
            {/* Pulse dot top */}
            <Circle cx={38} cy={12} r={1.5} fill="#FFFFFF" opacity={0.3} />
        </Svg>
    );
}
