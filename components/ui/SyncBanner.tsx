/**
 * SyncBanner Component
 * Shows a syncing indicator at the top of the screen with rotating icon,
 * transitions to checkmark on completion, then auto-hides.
 */

import { Colors } from '@/constants/Colors';
import { fonts } from '@/hooks/useFonts';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
    cancelAnimation,
    Easing,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withRepeat,
    withSpring,
    withTiming,
} from 'react-native-reanimated';

interface SyncBannerProps {
    isSyncing: boolean;
    /** Offset from top (e.g., header height) */
    topOffset?: number;
}

type BannerState = 'hidden' | 'syncing' | 'complete';

export function SyncBanner({ isSyncing, topOffset = 0 }: SyncBannerProps) {
    const [bannerState, setBannerState] = useState<BannerState>('hidden');
    const [isVisible, setIsVisible] = useState(false);
    const hideTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Animation values
    const bannerOpacity = useSharedValue(0);
    const bannerTranslateY = useSharedValue(-50);
    const rotation = useSharedValue(0);
    const syncIconOpacity = useSharedValue(1);
    const checkmarkScale = useSharedValue(0);
    const checkmarkOpacity = useSharedValue(0);

    // Start rotation animation
    const startRotation = () => {
        rotation.value = 0;
        rotation.value = withRepeat(
            withTiming(360, { duration: 1000, easing: Easing.linear }),
            -1,
            false
        );
    };

    // Stop rotation and show checkmark
    const showCheckmark = () => {
        cancelAnimation(rotation);
        rotation.value = withTiming(0, { duration: 150 });
        syncIconOpacity.value = withTiming(0, { duration: 150 });
        checkmarkScale.value = withDelay(100, withSpring(1, { damping: 12, stiffness: 300 }));
        checkmarkOpacity.value = withDelay(100, withTiming(1, { duration: 150 }));
    };

    // Reset icons for next sync
    const resetIcons = () => {
        syncIconOpacity.value = 1;
        checkmarkScale.value = 0;
        checkmarkOpacity.value = 0;
        rotation.value = 0;
    };

    // Show banner with slide-in animation
    const showBanner = () => {
        setIsVisible(true);
        resetIcons();
        bannerOpacity.value = withSpring(1, { damping: 20, stiffness: 300 });
        bannerTranslateY.value = withSpring(0, { damping: 20, stiffness: 300 });
        startRotation();
    };

    // Hide banner with slide-out animation
    const hideBanner = () => {
        bannerOpacity.value = withTiming(0, { duration: 250 });
        bannerTranslateY.value = withTiming(-50, { duration: 250 }, (finished) => {
            if (finished) {
                runOnJS(setIsVisible)(false);
                runOnJS(setBannerState)('hidden');
            }
        });
    };

    // Handle sync state changes
    useEffect(() => {
        // Clear any pending hide timer
        if (hideTimerRef.current) {
            clearTimeout(hideTimerRef.current);
            hideTimerRef.current = null;
        }

        if (isSyncing) {
            // Started syncing
            setBannerState('syncing');
            showBanner();
        } else if (bannerState === 'syncing') {
            // Finished syncing - show completion
            setBannerState('complete');
            showCheckmark();

            // Auto-hide after delay
            hideTimerRef.current = setTimeout(() => {
                hideBanner();
            }, 1500);
        }

        return () => {
            if (hideTimerRef.current) {
                clearTimeout(hideTimerRef.current);
            }
        };
    }, [isSyncing]);

    // Animated styles
    const bannerStyle = useAnimatedStyle(() => ({
        opacity: bannerOpacity.value,
        transform: [{ translateY: bannerTranslateY.value }],
    }));

    const syncIconStyle = useAnimatedStyle(() => ({
        transform: [{ rotate: `${rotation.value}deg` }],
        opacity: syncIconOpacity.value,
    }));

    const checkmarkStyle = useAnimatedStyle(() => ({
        transform: [{ scale: checkmarkScale.value }],
        opacity: checkmarkOpacity.value,
    }));

    // Don't render if not visible
    if (!isVisible) {
        return null;
    }

    return (
        <Animated.View style={[styles.container, { top: topOffset }, bannerStyle]}>
            <View style={styles.pill}>
                <View style={styles.iconContainer}>
                    {/* Sync icon (rotating) */}
                    <Animated.View style={[styles.iconWrapper, syncIconStyle]}>
                        <Ionicons name="sync-outline" size={18} color={Colors.textPrimary} />
                    </Animated.View>

                    {/* Checkmark icon (appears on completion) */}
                    <Animated.View style={[styles.iconWrapper, checkmarkStyle]}>
                        <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
                    </Animated.View>
                </View>

                <Text style={styles.text}>
                    {bannerState === 'complete' ? 'Synced!' : 'Syncing data...'}
                </Text>
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 99,
        paddingTop: 8,
    },
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(40, 42, 44, 0.95)',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        gap: 10,
    },
    iconContainer: {
        width: 20,
        height: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    iconWrapper: {
        position: 'absolute',
    },
    text: {
        color: Colors.textPrimary,
        fontSize: 14,
        fontFamily: fonts.medium,
    },
});
