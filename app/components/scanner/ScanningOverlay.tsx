/**
 * Scanning Overlay Component
 * Displays captured photo with animated red scan line during analysis
 */

import { fonts } from '@/hooks/useFonts';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import {
    Animated,
    Dimensions,
    Easing,
    Image,
    StyleSheet,
    Text,
    View,
} from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const FRAME_SIZE = SCREEN_WIDTH * 0.85;
const SCAN_LINE_HEIGHT = 3;

interface ScanningOverlayProps {
    imageUri: string;
    statusText: string;
}

export default function ScanningOverlay({ imageUri, statusText }: ScanningOverlayProps) {
    const scanLineAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        // Create looping animation: top to bottom, then bottom to top
        const animation = Animated.loop(
            Animated.sequence([
                Animated.timing(scanLineAnim, {
                    toValue: 1,
                    duration: 1500,
                    easing: Easing.linear,
                    useNativeDriver: true,
                }),
                Animated.timing(scanLineAnim, {
                    toValue: 0,
                    duration: 1500,
                    easing: Easing.linear,
                    useNativeDriver: true,
                }),
            ])
        );

        animation.start();

        return () => animation.stop();
    }, [scanLineAnim]);

    // Interpolate for translateY within the frame
    const translateY = scanLineAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, FRAME_SIZE - SCAN_LINE_HEIGHT],
    });

    return (
        <View style={styles.container}>
            {/* Dark background */}
            <View style={styles.backdrop} />

            {/* Content */}
            <View style={styles.content}>
                {/* Photo Frame */}
                <View style={styles.frameContainer}>
                    <View style={styles.frame}>
                        <Image
                            source={{ uri: imageUri }}
                            style={styles.image}
                            resizeMode="cover"
                        />

                        {/* Animated Scan Line */}
                        <Animated.View
                            style={[
                                styles.scanLine,
                                { transform: [{ translateY }] },
                            ]}
                        >
                            <LinearGradient
                                colors={['transparent', '#FF3B30', 'transparent']}
                                start={{ x: 0, y: 0.5 }}
                                end={{ x: 1, y: 0.5 }}
                                style={styles.scanLineGradient}
                            />
                        </Animated.View>

                        {/* Corner Brackets */}
                        <View style={[styles.corner, styles.cornerTopLeft]} />
                        <View style={[styles.corner, styles.cornerTopRight]} />
                        <View style={[styles.corner, styles.cornerBottomLeft]} />
                        <View style={[styles.corner, styles.cornerBottomRight]} />
                    </View>
                </View>

                {/* Status Text */}
                <Text style={styles.statusText}>{statusText}</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 100,
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 32,
    },
    frameContainer: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    frame: {
        width: FRAME_SIZE,
        height: FRAME_SIZE,
        borderRadius: 16,
        overflow: 'hidden',
        position: 'relative',
    },
    image: {
        width: '100%',
        height: '100%',
    },
    scanLine: {
        position: 'absolute',
        left: 0,
        right: 0,
        height: SCAN_LINE_HEIGHT,
    },
    scanLineGradient: {
        flex: 1,
        shadowColor: '#FF3B30',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 8,
    },
    corner: {
        position: 'absolute',
        width: 32,
        height: 32,
        borderColor: '#FFFFFF',
        borderWidth: 3,
    },
    cornerTopLeft: {
        top: 0,
        left: 0,
        borderRightWidth: 0,
        borderBottomWidth: 0,
        borderTopLeftRadius: 12,
    },
    cornerTopRight: {
        top: 0,
        right: 0,
        borderLeftWidth: 0,
        borderBottomWidth: 0,
        borderTopRightRadius: 12,
    },
    cornerBottomLeft: {
        bottom: 0,
        left: 0,
        borderRightWidth: 0,
        borderTopWidth: 0,
        borderBottomLeftRadius: 12,
    },
    cornerBottomRight: {
        bottom: 0,
        right: 0,
        borderLeftWidth: 0,
        borderTopWidth: 0,
        borderBottomRightRadius: 12,
    },
    statusText: {
        fontFamily: fonts.medium,
        fontSize: 18,
        color: '#FFFFFF',
        textAlign: 'center',
    },
});
