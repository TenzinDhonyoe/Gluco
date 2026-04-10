import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

/** Sparkle constellation — connected nodes representing AI intelligence */
export function AIIllustration({ size = 48 }: { size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
            {/* Central sparkle (4-pointed star) */}
            <Path
                d="M24 14L25.5 21L32 22L25.5 23.5L24 30L22.5 23.5L16 22L22.5 21Z"
                fill="#FFFFFF"
            />
            {/* Connection lines to satellite nodes */}
            <Path d="M24 14L18 8" stroke="#FFFFFF" strokeWidth={1.2} strokeLinecap="round" opacity={0.4} />
            <Path d="M32 22L40 20" stroke="#FFFFFF" strokeWidth={1.2} strokeLinecap="round" opacity={0.4} />
            <Path d="M24 30L20 38" stroke="#FFFFFF" strokeWidth={1.2} strokeLinecap="round" opacity={0.4} />
            <Path d="M16 22L8 24" stroke="#FFFFFF" strokeWidth={1.2} strokeLinecap="round" opacity={0.4} />
            <Path d="M24 14L32 10" stroke="#FFFFFF" strokeWidth={1.2} strokeLinecap="round" opacity={0.3} />
            <Path d="M24 30L32 36" stroke="#FFFFFF" strokeWidth={1.2} strokeLinecap="round" opacity={0.3} />
            {/* Satellite dots */}
            <Circle cx={18} cy={8} r={2.5} fill="#FFFFFF" opacity={0.6} />
            <Circle cx={40} cy={20} r={2} fill="#FFFFFF" opacity={0.5} />
            <Circle cx={20} cy={38} r={2.5} fill="#FFFFFF" opacity={0.6} />
            <Circle cx={8} cy={24} r={2} fill="#FFFFFF" opacity={0.5} />
            <Circle cx={32} cy={10} r={1.8} fill="#FFFFFF" opacity={0.4} />
            <Circle cx={32} cy={36} r={1.8} fill="#FFFFFF" opacity={0.4} />
            {/* Tiny accent sparkles */}
            <Circle cx={36} cy={14} r={1} fill="#FFFFFF" opacity={0.3} />
            <Circle cx={12} cy={34} r={1} fill="#FFFFFF" opacity={0.25} />
            <Circle cx={38} cy={30} r={0.8} fill="#FFFFFF" opacity={0.2} />
        </Svg>
    );
}
