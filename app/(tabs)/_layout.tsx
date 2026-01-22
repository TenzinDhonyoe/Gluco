import { Colors } from '@/constants/Colors';
import { TabTransitionProvider, useTabTransition } from '@/context/TabTransitionContext';
import { fonts } from '@/hooks/useFonts';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs, usePathname } from 'expo-router';
import React, { useCallback, useEffect, useRef } from 'react';
import { Dimensions, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSequence,
    withSpring,
    withTiming
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TAB_BAR_MARGIN = 16;
const TAB_COUNT = 3;
const INDICATOR_WIDTH = 64;
const INDICATOR_HEIGHT = 60;

// Animated Tab Icon Component with liquid press effect
function AnimatedTabIcon({
    name,
    color,
    focused,
}: {
    name: keyof typeof Feather.glyphMap;
    color: string;
    focused: boolean;
}) {
    const scale = useSharedValue(1);
    const translateY = useSharedValue(0);
    const didMountRef = useRef(false);

    useEffect(() => {
        if (!didMountRef.current) {
            didMountRef.current = true;
            scale.value = 1;
            translateY.value = 0;
            return;
        }

        if (focused) {
            // Quick liquid bounce when tab becomes active
            scale.value = withSequence(
                withSpring(1.12, { damping: 16, stiffness: 600 }),
                withSpring(0.96, { damping: 18, stiffness: 500 }),
                withSpring(1, { damping: 20, stiffness: 400 })
            );
            translateY.value = withSequence(
                withSpring(-2, { damping: 16, stiffness: 600 }),
                withSpring(0.5, { damping: 18, stiffness: 500 }),
                withSpring(0, { damping: 20, stiffness: 400 })
            );
        } else {
            scale.value = withTiming(1, { duration: 100 });
            translateY.value = withTiming(0, { duration: 100 });
        }
    }, [focused, scale, translateY]);

    const iconAnimatedStyle = useAnimatedStyle(() => ({
        transform: [
            { scale: scale.value },
            { translateY: translateY.value },
        ],
    }));

    return (
        <View style={styles.tabIconContainer}>
            <Animated.View style={iconAnimatedStyle}>
                <Feather
                    name={name}
                    size={24}
                    color={focused ? '#FFFFFF' : '#6B6B6B'}
                />
            </Animated.View>
        </View>
    );
}

// Custom Tab Bar Background with liquid glass effect
function TabBarBackground({ currentIndex }: { currentIndex: number }) {
    const indicatorX = useSharedValue(0);
    const indicatorScaleX = useSharedValue(1);
    const indicatorScaleY = useSharedValue(1);
    const prevIndex = useRef(currentIndex);

    useEffect(() => {
        const tabBarWidth = SCREEN_WIDTH - TAB_BAR_MARGIN * 2;
        const segmentWidth = tabBarWidth / TAB_COUNT;
        const targetX = segmentWidth * currentIndex + segmentWidth / 2 - INDICATOR_WIDTH / 2;

        // Calculate direction and distance for liquid stretch effect
        const distance = Math.abs(currentIndex - prevIndex.current);

        if (distance > 0) {
            // Quick liquid stretch effect during movement
            indicatorScaleX.value = withSequence(
                withSpring(1.2 + distance * 0.1, { damping: 18, stiffness: 500 }),
                withSpring(0.95, { damping: 16, stiffness: 450 }),
                withSpring(1, { damping: 20, stiffness: 400 })
            );
            indicatorScaleY.value = withSequence(
                withSpring(0.8, { damping: 18, stiffness: 500 }),
                withSpring(1.05, { damping: 16, stiffness: 450 }),
                withSpring(1, { damping: 20, stiffness: 400 })
            );
        }

        // Smooth position animation
        indicatorX.value = withSpring(targetX, { damping: 18, stiffness: 180, mass: 0.8 });

        prevIndex.current = currentIndex;
    }, [currentIndex, indicatorX, indicatorScaleX, indicatorScaleY]);

    const indicatorStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: indicatorX.value },
            { scaleX: indicatorScaleX.value },
            { scaleY: indicatorScaleY.value },
        ],
    }));



    return (
        <View style={styles.tabBarBackgroundContainer}>
            {/* Glass background */}
            <LinearGradient
                colors={['rgba(40, 44, 48, 0.95)', 'rgba(30, 33, 36, 0.98)', 'rgba(35, 38, 41, 0.95)']}
                locations={[0, 0.5, 1]}
                style={styles.tabBarGradient}
            />

            {/* Inner highlight */}
            <View style={styles.innerHighlight} />



            {/* Liquid glass indicator */}
            <Animated.View style={[styles.liquidIndicator, indicatorStyle]}>
                <LinearGradient
                    colors={['rgba(255, 255, 255, 0.18)', 'rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.12)']}
                    locations={[0, 0.5, 1]}
                    style={styles.indicatorGradient}
                />
            </Animated.View>
        </View>
    );
}

// Wrapper for tab press handling with haptics
function TabPressWrapper({
    children,
    onPress,
    isFocused,
}: {
    children: React.ReactNode;
    onPress: (e?: any) => void;
    isFocused: boolean;
}) {
    const scale = useSharedValue(1);

    const handlePressIn = useCallback(() => {
        scale.value = withSpring(0.9, { damping: 15, stiffness: 400 });
    }, [scale]);

    const handlePressOut = useCallback(() => {
        scale.value = withSpring(1, { damping: 12, stiffness: 300 });
    }, [scale]);

    const handlePress = useCallback((e?: any) => {
        if (Platform.OS === 'ios') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        onPress(e);
    }, [onPress]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    return (
        <Pressable
            onPress={handlePress}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            style={styles.tabPressWrapper}
        >
            <Animated.View style={[styles.tabPressContent, animatedStyle]}>
                {children}
            </Animated.View>
        </Pressable>
    );
}

// Inner component that uses the context
function TabLayoutInner() {
    const pathname = usePathname();
    const { setCurrentTab, currentIndex } = useTabTransition();

    // Extract route name from pathname and update context
    useEffect(() => {
        const routeName = pathname === '/' ? 'index' : pathname.replace('/', '');
        setCurrentTab(routeName);
    }, [pathname, setCurrentTab]);

    return (
        <Tabs
            screenOptions={{
                headerShown: false,
                tabBarStyle: styles.tabBar,
                tabBarActiveTintColor: Colors.textPrimary,
                tabBarInactiveTintColor: '#6B6B6B',
                tabBarLabelStyle: styles.tabBarLabel,
                tabBarItemStyle: styles.tabBarItem,
                tabBarBackground: () => <TabBarBackground currentIndex={currentIndex} />,
                sceneStyle: { backgroundColor: '#111111' },
                animation: 'shift',
                // Add haptic feedback to all tabs
                tabBarButton: (props) => (
                    <TabPressWrapper
                        onPress={props.onPress ?? (() => { })}
                        isFocused={props.accessibilityState?.selected ?? false}
                    >
                        {props.children}
                    </TabPressWrapper>
                ),
            }}
        >
            <Tabs.Screen
                name="index"
                options={{
                    title: 'Home',
                    tabBarIcon: ({ color, focused }) => (
                        <AnimatedTabIcon
                            name="home"
                            color={color}
                            focused={focused}
                        />
                    ),
                }}
            />
            <Tabs.Screen
                name="log"
                options={{
                    title: 'Log',
                    tabBarIcon: ({ color, focused }) => (
                        <AnimatedTabIcon
                            name="book-open"
                            color={color}
                            focused={focused}
                        />
                    ),
                }}
            />
            <Tabs.Screen
                name="insights"
                options={{
                    title: 'Insights',
                    tabBarIcon: ({ color, focused }) => (
                        <AnimatedTabIcon
                            name="bar-chart-2"
                            color={color}
                            focused={focused}
                        />
                    ),
                }}
            />
        </Tabs>
    );
}

export default function TabLayout() {
    return (
        <TabTransitionProvider>
            <TabLayoutInner />
        </TabTransitionProvider>
    );
}

const styles = StyleSheet.create({
    tabBar: {
        position: 'absolute',
        bottom: Platform.OS === 'ios' ? 20 : 16,
        marginHorizontal: 16,
        height: 80,
        borderRadius: 28,
        backgroundColor: 'transparent',
        borderTopWidth: 0,
        elevation: 0,
        shadowOpacity: 0,
    },
    tabBarBackgroundContainer: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 28,
        overflow: 'hidden',
    },
    tabBarGradient: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 28,
    },
    topEdgeHighlight: {
        position: 'absolute',
        top: 0,
        left: 20,
        right: 20,
        height: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        borderRadius: 1,
    },
    innerHighlight: {
        position: 'absolute',
        top: 1,
        left: 1,
        right: 1,
        bottom: 1,
        borderRadius: 27,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },

    liquidIndicator: {
        position: 'absolute',
        top: 6,
        width: INDICATOR_WIDTH,
        height: INDICATOR_HEIGHT,
        borderRadius: 20,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.15)',
    },
    indicatorGradient: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 20,
    },

    tabBarItem: {
        paddingTop: 6,
        paddingBottom: 6,
        height: 70,
    },
    tabBarLabel: {
        fontFamily: fonts.medium,
        fontSize: 12,
        marginTop: 2,
    },
    tabIconContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        height: 28,
    },
    tabPressWrapper: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    tabPressContent: {
        alignItems: 'center',
        justifyContent: 'center',
    },
});
