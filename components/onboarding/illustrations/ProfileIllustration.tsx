import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

/** Friendly person silhouette with a subtle wave gesture */
export function ProfileIllustration({ size = 48 }: { size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
            {/* Head */}
            <Circle cx={24} cy={14} r={7} fill="#FFFFFF" />
            {/* Body / shoulders */}
            <Path
                d="M12 38C12 30 17 26 24 26C31 26 36 30 36 38"
                stroke="#FFFFFF"
                strokeWidth={2.5}
                strokeLinecap="round"
                fill="none"
            />
            {/* Waving hand */}
            <Path
                d="M35 22C37 20 39 18 40 16"
                stroke="#FFFFFF"
                strokeWidth={2}
                strokeLinecap="round"
                opacity={0.7}
            />
            {/* Small sparkle near hand */}
            <Circle cx={42} cy={14} r={1.2} fill="#FFFFFF" opacity={0.5} />
        </Svg>
    );
}
