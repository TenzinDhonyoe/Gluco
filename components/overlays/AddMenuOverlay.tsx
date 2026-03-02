import { Colors } from '@/constants/Colors';
import { useAddMenu } from '@/context/AddMenuContext';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { isBehaviorV1Experience } from '@/lib/experience';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { router, usePathname, useSegments } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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

interface MenuAction {
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    route: string;
    iconColor: string;
    iconBgColor: string;
}

const BASE_ACTIONS: MenuAction[] = [
    {
        label: 'Meal',
        icon: 'restaurant',
        route: '/meal-scanner',
        iconColor: Colors.meal,
        iconBgColor: Colors.mealLight,
    },
    {
        label: 'Activity',
        icon: 'fitness',
        route: '/log-activity',
        iconColor: Colors.activity,
        iconBgColor: Colors.activityLight,
    },
    {
        label: 'Glucose',
        icon: 'water',
        route: '/log-glucose',
        iconColor: Colors.glucose,
        iconBgColor: Colors.glucoseLight,
    },
];

const WEIGHT_ACTION: MenuAction = {
    label: 'Weight',
    icon: 'scale',
    route: '/log-weight',
    iconColor: Colors.sleep,
    iconBgColor: Colors.sleepLight,
};

const FAB_SIZE = 56;
const PILL_HEIGHT = 52;
const ICON_CIRCLE = 44;

const OPEN_SPRING = { damping: 18, stiffness: 280, mass: 0.7 };
const OPEN_STAGGER_MS = 50;
const CLOSE_DURATION_MS = 140;
const CLOSE_STAGGER_MS = 30;

function SpeedDialItem({
    action,
    index,
    total,
    isOpen,
    onPress,
}: {
    action: MenuAction;
    index: number;
    total: number;
    isOpen: boolean;
    onPress: (route: string) => void;
}) {
    const scale = useSharedValue(0.3);
    const opacity = useSharedValue(0);
    const labelOpacity = useSharedValue(0);
    const translateY = useSharedValue(30);
    const pressScale = useSharedValue(1);

    useEffect(() => {
        if (isOpen) {
            const delay = index * OPEN_STAGGER_MS;
            scale.value = withDelay(delay, withSpring(1, OPEN_SPRING));
            opacity.value = withDelay(delay, withTiming(1, { duration: 250 }));
            labelOpacity.value = withDelay(
                delay + 20,
                withTiming(1, { duration: 250 }),
            );
            translateY.value = withDelay(delay, withSpring(0, OPEN_SPRING));
        } else {
            // Close top→bottom: highest index (visual top) exits first
            const delay = (total - 1 - index) * CLOSE_STAGGER_MS;
            scale.value = withDelay(
                delay,
                withTiming(0.3, { duration: CLOSE_DURATION_MS }),
            );
            opacity.value = withDelay(
                delay,
                withTiming(0, { duration: CLOSE_DURATION_MS - 20 }),
            );
            labelOpacity.value = withDelay(
                delay,
                withTiming(0, { duration: CLOSE_DURATION_MS - 20 }),
            );
            translateY.value = withDelay(
                delay,
                withTiming(30, { duration: CLOSE_DURATION_MS }),
            );
        }
    }, [isOpen, index, total, scale, opacity, labelOpacity, translateY]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }, { translateY: translateY.value }],
        opacity: opacity.value,
    }));

    const pressStyle = useAnimatedStyle(() => ({
        transform: [{ scale: pressScale.value }],
    }));

    const labelStyle = useAnimatedStyle(() => ({
        opacity: labelOpacity.value,
    }));

    return (
        <Animated.View style={animatedStyle}>
            <Animated.View style={pressStyle}>
                <Pressable
                    onPress={() => onPress(action.route)}
                    onPressIn={() => {
                        pressScale.value = withSpring(0.95, {
                            damping: 20,
                            stiffness: 600,
                        });
                    }}
                    onPressOut={() => {
                        pressScale.value = withSpring(1, {
                            damping: 18,
                            stiffness: 500,
                        });
                    }}
                    style={styles.pillShadow}
                >
                    <BlurView intensity={50} tint="light" style={styles.pillBlur}>
                        <Animated.Text
                            style={[styles.pillLabel, labelStyle]}
                        >
                            {action.label}
                        </Animated.Text>
                        <View
                            style={[
                                styles.pillIcon,
                                { backgroundColor: action.iconBgColor },
                            ]}
                        >
                            <Ionicons
                                name={action.icon}
                                size={22}
                                color={action.iconColor}
                            />
                        </View>
                    </BlurView>
                </Pressable>
            </Animated.View>
        </Animated.View>
    );
}

export function AddMenuOverlay() {
    const { isOpen, close } = useAddMenu();
    const { profile } = useAuth();
    const isBehaviorV1 = isBehaviorV1Experience(profile?.experience_variant);
    const segments = useSegments();
    const isOnHomeTab = segments[0] === '(tabs)' && segments[1] == null;
    const insets = useSafeAreaInsets();
    const [shouldRender, setShouldRender] = useState(false);
    const pathname = usePathname();
    const prevPathname = useRef(pathname);

    const backdropOpacity = useSharedValue(0);

    const actions = isBehaviorV1
        ? [...BASE_ACTIONS, WEIGHT_ACTION]
        : BASE_ACTIONS;

    // Auto-close when pathname changes (e.g. tab switch)
    useEffect(() => {
        if (pathname !== prevPathname.current && isOpen) {
            close();
        }
        prevPathname.current = pathname;
    }, [pathname, isOpen, close]);

    useEffect(() => {
        if (isOpen) {
            setShouldRender(true);
            backdropOpacity.value = withTiming(1, { duration: 280 });
        } else if (shouldRender) {
            backdropOpacity.value = withTiming(
                0,
                { duration: 240 },
                (finished) => {
                    if (finished) runOnJS(setShouldRender)(false);
                },
            );
        }
    }, [isOpen, shouldRender, backdropOpacity]);

    const backdropStyle = useAnimatedStyle(() => ({
        opacity: backdropOpacity.value * 0.8,
    }));

    const handleAction = (route: string) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        close();
        setTimeout(() => router.push(route as any), 150);
    };

    if (!isOnHomeTab || !shouldRender) return null;

    return (
        <View style={styles.root} pointerEvents="box-none">
            <Pressable style={styles.fullScreen} onPress={close}>
                <Animated.View
                    style={[styles.fullScreen, styles.backdrop, backdropStyle]}
                />
            </Pressable>

            <View
                pointerEvents="box-none"
                style={[
                    styles.speedDial,
                    { bottom: insets.bottom + 49 + 16 + FAB_SIZE + 16 },
                ]}
            >
                {actions.map((action, index) => (
                    <SpeedDialItem
                        key={action.route}
                        action={action}
                        index={index}
                        total={actions.length}
                        isOpen={isOpen}
                        onPress={handleAction}
                    />
                ))}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 90,
        elevation: 90,
    },
    fullScreen: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    backdrop: {
        backgroundColor: Colors.overlayDark,
    },
    speedDial: {
        position: 'absolute',
        right: 20,
        alignItems: 'flex-end',
        flexDirection: 'column-reverse',
        gap: 12,
    },
    pillShadow: {
        height: PILL_HEIGHT,
        borderRadius: PILL_HEIGHT / 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 8,
    },
    pillBlur: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: PILL_HEIGHT / 2,
        overflow: 'hidden',
        backgroundColor: 'rgba(255, 255, 255, 0.88)',
        borderWidth: 1,
        borderColor: 'rgba(60, 60, 67, 0.10)',
        paddingLeft: 16,
        paddingRight: 4,
    },
    pillLabel: {
        fontFamily: fonts.semiBold,
        fontSize: 15,
        color: Colors.textPrimary,
        marginRight: 12,
    },
    pillIcon: {
        width: ICON_CIRCLE,
        height: ICON_CIRCLE,
        borderRadius: ICON_CIRCLE / 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
