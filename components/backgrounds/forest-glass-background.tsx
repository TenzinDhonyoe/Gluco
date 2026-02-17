import { BlurView } from 'expo-blur';
import React from 'react';
import { ImageBackground, StyleSheet, View } from 'react-native';

type ForestGlassBackgroundProps = {
    blurIntensity?: number;
};

const FOREST_BACKGROUND = require('@/assets/images/backgrounds/background.png');

export function ForestGlassBackground({ blurIntensity = 0 }: ForestGlassBackgroundProps) {
    return (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <ImageBackground
                source={FOREST_BACKGROUND}
                resizeMode="cover"
                style={StyleSheet.absoluteFill}
            />
            {blurIntensity > 0 && (
                <BlurView
                    tint="dark"
                    intensity={blurIntensity}
                    style={StyleSheet.absoluteFill}
                />
            )}
            <View style={styles.darkenOverlay} />
        </View>
    );
}

const styles = StyleSheet.create({
    darkenOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
    },
});
