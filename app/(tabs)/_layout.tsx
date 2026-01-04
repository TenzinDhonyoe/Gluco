import { Colors } from '@/constants/Colors';
import { TabTransitionProvider, useTabTransition } from '@/context/TabTransitionContext';
import { fonts } from '@/hooks/useFonts';
import { Ionicons } from '@expo/vector-icons';
import { Tabs, usePathname } from 'expo-router';
import React, { useEffect } from 'react';
import { Dimensions, Platform, StyleSheet, View } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSequence,
    withSpring,
    withTiming,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TAB_BAR_MARGIN = 16;
const TAB_COUNT = 3;
const INDICATOR_WIDTH = 24;

// Animated Tab Icon Component with bounce effect
function AnimatedTabIcon({
    name,
    outlineName,
    color,
    focused
}: {
    name: keyof typeof Ionicons.glyphMap;
    outlineName: keyof typeof Ionicons.glyphMap;
    color: string;
    focused: boolean;
}) {
    const scale = useSharedValue(1);
    const translateY = useSharedValue(0);
    const didMountRef = React.useRef(false);

    useEffect(() => {
        // Avoid the "big" animation on initial app load
        if (!didMountRef.current) {
            didMountRef.current = true;
            scale.value = 1;
            translateY.value = 0;
            return;
        }

        if (focused) {
            // Small bounce when tab becomes active (subtle)
            scale.value = withSequence(
                withSpring(1.08, { damping: 14, stiffness: 320 }),
                withSpring(1, { damping: 16, stiffness: 220 })
            );
            translateY.value = withSequence(
                withSpring(-2, { damping: 14, stiffness: 320 }),
                withSpring(0, { damping: 16, stiffness: 220 })
            );
        } else {
            scale.value = withTiming(1, { duration: 200 });
            translateY.value = withTiming(0, { duration: 200 });
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
                <Ionicons
                    name={focused ? name : outlineName}
                    size={24}
                    color={color}
                />
            </Animated.View>
        </View>
    );
}

// Inner component that uses the context
function TabLayoutInner() {
    const pathname = usePathname();
    const { setCurrentTab, currentIndex } = useTabTransition();

    const indicatorX = useSharedValue(0);

    useEffect(() => {
        const tabBarWidth = SCREEN_WIDTH - TAB_BAR_MARGIN * 2;
        const segmentWidth = tabBarWidth / TAB_COUNT;
        const nextX = segmentWidth * currentIndex + segmentWidth / 2 - INDICATOR_WIDTH / 2;

        // Smooth, minimal movement with a subtle spring
        indicatorX.value = withSpring(nextX, { damping: 22, stiffness: 220, mass: 0.9 });
    }, [currentIndex, indicatorX]);

    const indicatorStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: indicatorX.value }],
    }));

    // Extract route name from pathname and update context
    useEffect(() => {
        // pathname will be like "/log", "/insights", etc. or "/" for index
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
                tabBarBackground: () => (
                    <View style={styles.tabBarBackground}>
                        <Animated.View style={[styles.movingIndicator, indicatorStyle]} />
                    </View>
                ),
                sceneStyle: { backgroundColor: '#111111' },
                animation: 'shift',
            }}
        >
            <Tabs.Screen
                name="index"
                options={{
                    title: 'Today',
                    tabBarIcon: ({ color, focused }) => (
                        <AnimatedTabIcon
                            name="home"
                            outlineName="home-outline"
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
                            name="book"
                            outlineName="book-outline"
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
                            name="stats-chart"
                            outlineName="stats-chart-outline"
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
        bottom: Platform.OS === 'ios' ? 40 : 20,
        marginHorizontal: 16,
        height: 75,
        borderRadius: 28,
        backgroundColor: 'transparent',
        borderTopWidth: 0,
        elevation: 0,
        shadowOpacity: 0,
    },
    tabBarBackground: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#232629',
        borderRadius: 28,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.4,
        shadowRadius: 20,
        elevation: 15,
        overflow: 'hidden',
    },
    tabBarItem: {
        paddingTop: 10,
        paddingBottom: 6,
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
    movingIndicator: {
        position: 'absolute',
        // roughly matches the old per-icon indicator placement
        top: 2,
        width: INDICATOR_WIDTH,
        height: 3,
        backgroundColor: Colors.textPrimary,
        borderRadius: 2,
    },
});
