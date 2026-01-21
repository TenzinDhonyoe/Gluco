import { fonts } from '@/hooks/useFonts';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { forwardRef, useCallback, useImperativeHandle, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
    interpolate,
    useAnimatedStyle,
    useSharedValue,
    withSequence,
    withSpring,
    withTiming,
} from 'react-native-reanimated';

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

type MenuOption = {
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
};

type Props = {
    onPress?: (isOpen: boolean) => void;
    onLogMeal?: () => void;
    onLogActivity?: () => void;
    onLogGlucose?: () => void;
    size?: number;
};

export type AnimatedFABRef = {
    close: () => void;
};

const SPRING_CONFIG = {
    damping: 20,
    stiffness: 400,
    mass: 0.4,
};

// Menu item component with liquid glass effect
function MenuItem({
    option,
    index,
    isVisible,
}: {
    option: MenuOption;
    index: number;
    isVisible: boolean;
}) {
    const translateY = useSharedValue(30);
    const opacity = useSharedValue(0);
    const scale = useSharedValue(0.7);
    const pressScale = useSharedValue(1);

    React.useEffect(() => {
        if (isVisible) {
            // Immediate staggered entrance
            const delay = (2 - index) * 15;
            setTimeout(() => {
                translateY.value = withSpring(0, { damping: 22, stiffness: 450 });
                opacity.value = withTiming(1, { duration: 80 });
                scale.value = withSpring(1, { damping: 20, stiffness: 400 });
            }, delay);
        } else {
            translateY.value = withTiming(15, { duration: 60 });
            opacity.value = withTiming(0, { duration: 50 });
            scale.value = withTiming(0.85, { duration: 60 });
        }
    }, [isVisible, index, translateY, opacity, scale]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [
            { translateY: translateY.value },
            { scale: scale.value * pressScale.value },
        ],
        opacity: opacity.value,
    }));

    const handlePressIn = useCallback(() => {
        pressScale.value = withSpring(0.95, { damping: 20, stiffness: 600 });
        if (Platform.OS === 'ios') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
    }, [pressScale]);

    const handlePressOut = useCallback(() => {
        pressScale.value = withSpring(1, { damping: 18, stiffness: 500 });
    }, [pressScale]);

    return (
        <Animated.View style={[styles.menuItemWrapper, animatedStyle]}>
            <Pressable
                onPress={option.onPress}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                style={styles.menuItemPressable}
            >
                <View style={styles.menuItem}>
                    <LinearGradient
                        colors={['rgba(70, 75, 80, 0.95)', 'rgba(50, 54, 58, 0.95)']}
                        style={styles.menuItemGradient}
                    />
                    <View style={styles.menuItemContent}>
                        <Ionicons name={option.icon} size={20} color="#FFFFFF" style={styles.menuItemIcon} />
                        <Animated.Text style={styles.menuItemText}>{option.label}</Animated.Text>
                    </View>
                </View>
            </Pressable>
        </Animated.View>
    );
}

export const AnimatedFAB = forwardRef<AnimatedFABRef, Props>(
    function AnimatedFAB(props, ref) {
        const {
            onPress,
            onLogMeal,
            onLogActivity,
            onLogGlucose,
            size = 56
        } = props;

        const [isOpen, setIsOpen] = useState(false);
        const [showMenu, setShowMenu] = useState(false);

        // Reanimated shared values
        const rotation = useSharedValue(0);
        const fabScale = useSharedValue(1);
        const fabScaleX = useSharedValue(1);
        const fabScaleY = useSharedValue(1);

        const triggerHaptic = useCallback(() => {
            if (Platform.OS === 'ios') {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }
        }, []);

        const closeMenu = useCallback(() => {
            if (!isOpen) return;

            setIsOpen(false);

            // Animate rotation back with liquid effect
            rotation.value = withSpring(0, SPRING_CONFIG);

            // Quick hide menu
            setTimeout(() => {
                setShowMenu(false);
            }, 80);

            onPress?.(false);
        }, [isOpen, rotation, onPress]);

        const handleMenuItemPress = useCallback((callback?: () => void) => {
            setShowMenu(false);
            setIsOpen(false);

            rotation.value = withTiming(0, { duration: 60 });

            // Navigate immediately
            callback?.();

            onPress?.(false);
        }, [rotation, onPress]);

        const menuOptions: MenuOption[] = [
            { label: 'Log Meal', icon: 'restaurant-outline', onPress: () => handleMenuItemPress(onLogMeal) },
            { label: 'Add Activity', icon: 'fitness-outline', onPress: () => handleMenuItemPress(onLogActivity) },
            { label: 'Log Glucose', icon: 'water-outline', onPress: () => handleMenuItemPress(onLogGlucose) },
        ];

        useImperativeHandle(ref, () => ({
            close: closeMenu
        }));

        const openMenu = useCallback(() => {
            setIsOpen(true);
            setShowMenu(true);

            // Animate rotation with liquid spring
            rotation.value = withSpring(1, SPRING_CONFIG);

            onPress?.(true);
        }, [rotation, onPress]);

        const handlePress = useCallback(() => {
            triggerHaptic();

            // Quick liquid squish effect
            fabScaleX.value = withSequence(
                withSpring(0.88, { damping: 18, stiffness: 600 }),
                withSpring(1.03, { damping: 16, stiffness: 500 }),
                withSpring(1, { damping: 18, stiffness: 400 })
            );
            fabScaleY.value = withSequence(
                withSpring(1.08, { damping: 18, stiffness: 600 }),
                withSpring(0.97, { damping: 16, stiffness: 500 }),
                withSpring(1, { damping: 18, stiffness: 400 })
            );

            if (isOpen) {
                closeMenu();
            } else {
                openMenu();
            }
        }, [isOpen, closeMenu, openMenu, triggerHaptic, fabScaleX, fabScaleY]);

        const handlePressIn = useCallback(() => {
            fabScale.value = withSpring(0.92, { damping: 20, stiffness: 600 });
        }, [fabScale]);

        const handlePressOut = useCallback(() => {
            fabScale.value = withSpring(1, { damping: 18, stiffness: 500 });
        }, [fabScale]);

        // Animated styles
        const fabAnimatedStyle = useAnimatedStyle(() => ({
            transform: [
                { scale: fabScale.value },
                { scaleX: fabScaleX.value },
                { scaleY: fabScaleY.value },
            ],
        }));

        const iconAnimatedStyle = useAnimatedStyle(() => ({
            transform: [
                { rotate: `${interpolate(rotation.value, [0, 1], [0, 45])}deg` },
            ],
        }));

        return (
            <View style={styles.wrapper}>
                {/* Menu Items */}
                {showMenu && (
                    <View style={styles.menuContainer}>
                        {menuOptions.map((option, index) => (
                            <MenuItem
                                key={option.label}
                                option={option}
                                index={index}
                                isVisible={isOpen}
                            />
                        ))}
                    </View>
                )}

                {/* FAB Button */}
                <Pressable
                    onPress={handlePress}
                    onPressIn={handlePressIn}
                    onPressOut={handlePressOut}
                >
                    <Animated.View
                        style={[
                            styles.container,
                            {
                                width: size,
                                height: size,
                                borderRadius: size / 2,
                            },
                            fabAnimatedStyle,
                        ]}
                    >
                        {/* Glass gradient background */}
                        <AnimatedLinearGradient
                            colors={['rgba(60, 65, 70, 1)', 'rgba(40, 44, 48, 1)', 'rgba(50, 54, 58, 1)']}
                            locations={[0, 0.5, 1]}
                            style={[styles.fabGradient, { borderRadius: size / 2 }]}
                        />

                        {/* Icon */}
                        <Animated.View style={[styles.innerCircle, iconAnimatedStyle]}>
                            <Ionicons name="add" size={28} color="#FFFFFF" />
                        </Animated.View>
                    </Animated.View>
                </Pressable>
            </View>
        );
    }
);

const styles = StyleSheet.create({
    wrapper: {
        alignItems: 'flex-end',
        zIndex: 2,
    },
    container: {
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.12)',
        overflow: 'hidden',
    },
    fabGradient: {
        ...StyleSheet.absoluteFillObject,
    },
    innerCircle: {
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1,
    },
    menuContainer: {
        marginBottom: 16,
        gap: 10,
    },
    menuItemWrapper: {
        alignItems: 'flex-end',
    },
    menuItemPressable: {
        borderRadius: 100,
    },
    menuItem: {
        borderRadius: 100,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.12)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 8,
    },
    menuItemGradient: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 100,
    },
    menuItemContent: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 20,
    },
    menuItemIcon: {
        marginRight: 10,
    },
    menuItemText: {
        fontFamily: fonts.medium,
        fontSize: 15,
        color: '#FFFFFF',
        letterSpacing: 0.2,
    },
});
