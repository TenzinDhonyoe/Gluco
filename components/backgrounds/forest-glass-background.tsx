import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, View } from 'react-native';

export function ForestGlassBackground(_props: { blurIntensity?: number }) {
    return (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            {/* Base solid background */}
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#F2F2F7' }]} />

            {/* Teal accent gradient — soft wash at top, fades to base */}
            <LinearGradient
                colors={[
                    'rgba(45, 212, 191, 0.25)',
                    'rgba(45, 212, 191, 0.10)',
                    'rgba(45, 212, 191, 0)',
                ]}
                locations={[0, 0.3, 0.55]}
                style={StyleSheet.absoluteFill}
            />
        </View>
    );
}
