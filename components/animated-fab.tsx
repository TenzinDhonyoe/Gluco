import { fonts } from '@/hooks/useFonts';
import { Ionicons } from '@expo/vector-icons';
import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

type MenuOption = {
    label: string;
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

        const rotateAnim = useRef(new Animated.Value(0)).current;
        const scaleAnim = useRef(new Animated.Value(1)).current;

        // Individual menu item animations for stagger effect
        const menuItem1Anim = useRef(new Animated.Value(0)).current;
        const menuItem2Anim = useRef(new Animated.Value(0)).current;
        const menuItem3Anim = useRef(new Animated.Value(0)).current;

        const resetMenuAnimations = () => {
            menuItem1Anim.setValue(0);
            menuItem2Anim.setValue(0);
            menuItem3Anim.setValue(0);
        };

        const closeMenu = () => {
            if (!isOpen) return; // Already closed

            setIsOpen(false);

            // Animate rotation back
            Animated.spring(rotateAnim, {
                toValue: 0,
                useNativeDriver: true,
                tension: 100,
                friction: 8,
            }).start();

            // Animate menu items out, then hide menu
            Animated.stagger(30, [
                Animated.timing(menuItem1Anim, { toValue: 0, duration: 150, useNativeDriver: true }),
                Animated.timing(menuItem2Anim, { toValue: 0, duration: 150, useNativeDriver: true }),
                Animated.timing(menuItem3Anim, { toValue: 0, duration: 150, useNativeDriver: true }),
            ]).start(() => {
                // After animation completes, hide the menu
                setShowMenu(false);
            });

            onPress?.(false);
        };

        const handleMenuItemPress = () => {
            closeMenu();
        };

        const menuOptions: MenuOption[] = [
            { label: 'Log your Meal', onPress: () => { handleMenuItemPress(); onLogMeal?.(); } },
            { label: 'Add an activity', onPress: () => { handleMenuItemPress(); onLogActivity?.(); } },
            { label: 'Log your Glucose Level', onPress: () => { handleMenuItemPress(); onLogGlucose?.(); } },
        ];

        // Expose close method via ref
        useImperativeHandle(ref, () => ({
            close: closeMenu
        }));

        const openMenu = () => {
            setIsOpen(true);

            // Reset animations to 0 before showing menu
            resetMenuAnimations();

            // Show menu immediately
            setShowMenu(true);

            // Animate rotation
            Animated.spring(rotateAnim, {
                toValue: 1,
                useNativeDriver: true,
                tension: 100,
                friction: 8,
            }).start();

            // Stagger menu items in (from bottom to top)
            // Use setTimeout to ensure state update has rendered
            setTimeout(() => {
                Animated.stagger(60, [
                    Animated.spring(menuItem3Anim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 8 }),
                    Animated.spring(menuItem2Anim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 8 }),
                    Animated.spring(menuItem1Anim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 8 }),
                ]).start();
            }, 10);

            onPress?.(true);
        };

        const handlePress = () => {
            // Scale bounce
            Animated.sequence([
                Animated.timing(scaleAnim, {
                    toValue: 0.9,
                    duration: 50,
                    useNativeDriver: true,
                }),
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    useNativeDriver: true,
                    tension: 200,
                    friction: 10,
                }),
            ]).start();

            if (isOpen) {
                closeMenu();
            } else {
                openMenu();
            }
        };

        const rotation = rotateAnim.interpolate({
            inputRange: [0, 1],
            outputRange: ['0deg', '45deg'],
        });

        const getMenuItemStyle = (anim: Animated.Value) => {
            const translateY = anim.interpolate({
                inputRange: [0, 1],
                outputRange: [30, 0],
            });
            const opacity = anim.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [0, 0.5, 1],
            });
            const scale = anim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.7, 1],
            });

            return {
                opacity,
                transform: [{ translateY }, { scale }],
            };
        };

        const menuItemAnims = [menuItem1Anim, menuItem2Anim, menuItem3Anim];

        return (
            <View style={styles.wrapper}>
                {/* Menu Items */}
                {showMenu && (
                    <View style={styles.menuContainer}>
                        {menuOptions.map((option, index) => (
                            <Animated.View
                                key={option.label}
                                style={[
                                    styles.menuItemWrapper,
                                    getMenuItemStyle(menuItemAnims[index]),
                                ]}
                            >
                                <Pressable
                                    style={({ pressed }) => [
                                        styles.menuItem,
                                        pressed && styles.menuItemPressed,
                                    ]}
                                    onPress={option.onPress}
                                >
                                    <Text style={styles.menuItemText}>{option.label}</Text>
                                </Pressable>
                            </Animated.View>
                        ))}
                    </View>
                )}

                {/* FAB Button */}
                <Pressable onPress={handlePress}>
                    <Animated.View
                        style={[
                            styles.container,
                            {
                                width: size,
                                height: size,
                                borderRadius: size / 2,
                                transform: [{ scale: scaleAnim }],
                            },
                        ]}
                    >
                        <View style={styles.innerCircle}>
                            <Animated.View style={{ transform: [{ rotate: rotation }] }}>
                                <Ionicons name="add" size={28} color="#E7E8E9" />
                            </Animated.View>
                        </View>
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
        backgroundColor: '#2A2D30',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    innerCircle: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    menuContainer: {
        marginBottom: 16,
        gap: 12,
    },
    menuItemWrapper: {
        alignItems: 'flex-end',
    },
    menuItem: {
        backgroundColor: 'rgba(63, 66, 67, 0.92)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 100,
        paddingVertical: 14,
        paddingHorizontal: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    menuItemPressed: {
        backgroundColor: 'rgba(80, 83, 84, 0.95)',
        transform: [{ scale: 0.98 }],
    },
    menuItemText: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: '#FFFFFF',
        textAlign: 'right',
    },
});
