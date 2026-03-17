import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, View } from 'react-native';

export function GlobalBackground() {
    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {/* Base white background */}
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF' }]} />

            {/* Subtle multi-stop gentle blueish gradient */}
            <LinearGradient
                colors={[
                    'rgba(235, 240, 255, 0.7)', // Soft light blue at top left
                    'rgba(245, 248, 255, 0.4)', // Fades to very subtle blue
                    'rgba(255, 255, 255, 0.0)', // Completely white at the bottom right
                ]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
            />

            {/* Optional secondary gradient for a more complex "mesh" feel */}
            <LinearGradient
                colors={[
                    'rgba(255, 255, 255, 0)',
                    'rgba(240, 245, 255, 0.3)', // Extra hint of color from bottom left
                ]}
                start={{ x: 1, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={StyleSheet.absoluteFill}
            />
        </View>
    );
}
