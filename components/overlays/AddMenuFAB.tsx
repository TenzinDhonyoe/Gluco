import { useAddMenu } from '@/context/AddMenuContext';
import { triggerHaptic } from '@/lib/utils/haptics';
import { Ionicons } from '@expo/vector-icons';
import { useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const FAB_SIZE = 56;

export function AddMenuFAB() {
    const { isOpen, toggle } = useAddMenu();
    const segments = useSegments();
    const isOnHomeTab = segments[0] === '(tabs)' && segments[1] == null;
    const insets = useSafeAreaInsets();
    const [shouldRender, setShouldRender] = useState(false);

    const rotation = useSharedValue(0);
    const fabOpacity = useSharedValue(0);
    const fabScale = useSharedValue(0.92);

    useEffect(() => {
        rotation.value = withSpring(isOpen ? 45 : 0, { damping: 14, stiffness: 200 });
    }, [isOpen, rotation]);

    useEffect(() => {
        if (isOnHomeTab) {
            setShouldRender(true);
            // Slight delay so it arrives with the tab bar, not before it
            fabOpacity.value = withDelay(
                100,
                withTiming(1, { duration: 250 }),
            );
            fabScale.value = withDelay(
                100,
                withSpring(1, { damping: 20, stiffness: 300 }),
            );
        } else if (shouldRender) {
            // Fade out quickly to match the tab bar leaving
            fabOpacity.value = withTiming(0, { duration: 200 });
            fabScale.value = withTiming(0.92, { duration: 200 }, (finished) => {
                if (finished) runOnJS(setShouldRender)(false);
            });
        }
    }, [isOnHomeTab, shouldRender, fabOpacity, fabScale]);

    const fabAnimatedStyle = useAnimatedStyle(() => ({
        opacity: fabOpacity.value,
        transform: [{ scale: fabScale.value }],
    }));

    const iconStyle = useAnimatedStyle(() => ({
        transform: [{ rotate: `${rotation.value}deg` }],
    }));

    if (!shouldRender) return null;

    return (
        <View
            pointerEvents={isOnHomeTab ? 'box-none' : 'none'}
            style={[StyleSheet.absoluteFill, { zIndex: 100, elevation: 100 }]}
        >
            <Animated.View
                style={[
                    styles.fabPosition,
                    { right: 20, bottom: insets.bottom + 49 + 16 },
                    fabAnimatedStyle,
                ]}
            >
                <Pressable
                    onPress={() => {
                        triggerHaptic('medium');
                        toggle();
                    }}
                    style={styles.fabShadow}
                >
                    <View style={[styles.fabInner, isOpen && styles.fabInnerOpen]}>
                        <Animated.View style={iconStyle}>
                            <Ionicons name="add" size={32} color="#1C1C1E" />
                        </Animated.View>
                    </View>
                </Pressable>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    fabPosition: {
        position: 'absolute',
        width: FAB_SIZE,
        height: FAB_SIZE,
    },
    fabShadow: {
        width: FAB_SIZE,
        height: FAB_SIZE,
        borderRadius: FAB_SIZE / 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 8,
        backgroundColor: '#FFFFFF',
    },
    fabInner: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: FAB_SIZE / 2,
        overflow: 'hidden',
        backgroundColor: '#FFFFFF',
    },
    fabInnerOpen: {
        backgroundColor: '#E8E8E8',
    },
});
