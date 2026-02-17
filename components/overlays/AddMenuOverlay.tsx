import { useAddMenu } from '@/context/AddMenuContext';
import { useAuth } from '@/context/AuthContext';
import { isBehaviorV1Experience } from '@/lib/experience';
import { Colors } from '@/constants/Colors';
import {
    ACTION_PANEL_GAP_ABOVE_TAB_BAR,
    ANDROID_TAB_BAR_HEIGHT,
    IOS_TAB_BAR_HEIGHT,
} from '@/constants/navigationLayout';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { router, usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
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
}

const BASE_ACTIONS: MenuAction[] = [
    { label: 'Log Meal', icon: 'restaurant-outline', route: '/meal-scanner' },
    { label: 'Add Activity', icon: 'fitness-outline', route: '/log-activity' },
    { label: 'Log Glucose', icon: 'water-outline', route: '/log-glucose' },
];

const WEIGHT_ACTION: MenuAction = {
    label: 'Log Weight',
    icon: 'scale-outline',
    route: '/log-weight',
};

const SPRING_CONFIG = { damping: 18, stiffness: 240, mass: 0.9 };

function ActionItem({
    action,
    index,
    isOpen,
    onPress,
}: {
    action: MenuAction;
    index: number;
    isOpen: boolean;
    onPress: (route: string) => void;
}) {
    const scale = useSharedValue(0.5);
    const opacity = useSharedValue(0);

    useEffect(() => {
        if (isOpen) {
            scale.value = withDelay(index * 40, withSpring(1, SPRING_CONFIG));
            opacity.value = withDelay(index * 40, withTiming(1, { duration: 180 }));
        } else {
            scale.value = withTiming(0.5, { duration: 120 });
            opacity.value = withTiming(0, { duration: 120 });
        }
    }, [isOpen, index, scale, opacity]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
        opacity: opacity.value,
    }));

    return (
        <Animated.View style={[styles.itemWrapper, animatedStyle]}>
            <Pressable style={styles.item} onPress={() => onPress(action.route)}>
                <View style={styles.circle}>
                    <Ionicons name={action.icon} size={24} color="#F3F4F6" />
                </View>
                <Text style={styles.label}>{action.label}</Text>
            </Pressable>
        </Animated.View>
    );
}

export function AddMenuOverlay() {
    const { isOpen, close, isOnTabScreen } = useAddMenu();
    const { profile } = useAuth();
    const isBehaviorV1 = isBehaviorV1Experience(profile?.experience_variant);
    const insets = useSafeAreaInsets();
    const [shouldRender, setShouldRender] = useState(false);
    const tabBarHeight = Platform.OS === 'ios' ? IOS_TAB_BAR_HEIGHT : ANDROID_TAB_BAR_HEIGHT;
    const pathname = usePathname();
    const prevPathname = useRef(pathname);

    const backdropOpacity = useSharedValue(0);
    const panelTranslateY = useSharedValue(36);
    const panelOpacity = useSharedValue(0);

    const actions = isBehaviorV1 ? [...BASE_ACTIONS, WEIGHT_ACTION] : BASE_ACTIONS;

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
            backdropOpacity.value = withTiming(1, { duration: 220 });
            panelOpacity.value = withTiming(1, { duration: 220 });
            panelTranslateY.value = withSpring(0, SPRING_CONFIG);
        } else if (shouldRender) {
            panelTranslateY.value = withTiming(28, { duration: 160 });
            panelOpacity.value = withTiming(0, { duration: 160 });
            backdropOpacity.value = withTiming(0, { duration: 180 }, (finished) => {
                if (finished) runOnJS(setShouldRender)(false);
            });
        }
    }, [isOpen, shouldRender, backdropOpacity, panelOpacity, panelTranslateY]);

    const backdropStyle = useAnimatedStyle(() => ({
        opacity: backdropOpacity.value * 0.85,
    }));

    const panelStyle = useAnimatedStyle(() => ({
        opacity: panelOpacity.value,
        transform: [{ translateY: panelTranslateY.value }],
    }));

    const handleAction = (route: string) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        close();
        setTimeout(() => router.push(route as any), 100);
    };

    if (!isOnTabScreen || !shouldRender) return null;

    return (
        <View style={styles.root} pointerEvents="box-none">
            <Pressable style={styles.fullScreen} onPress={close}>
                <Animated.View style={[styles.fullScreen, styles.backdrop, backdropStyle]} />
            </Pressable>

            <Animated.View
                pointerEvents="box-none"
                style={[
                    styles.panelShell,
                    {
                        bottom: insets.bottom + tabBarHeight + ACTION_PANEL_GAP_ABOVE_TAB_BAR,
                    },
                    panelStyle,
                ]}
            >
                <BlurView intensity={45} tint="dark" style={styles.panelBlur}>
                    <View style={styles.panelTint} />
                    <View style={styles.gridContainer}>
                        {actions.map((action, i) => (
                            <ActionItem
                                key={`${action.label}-${i}`}
                                action={action}
                                index={i}
                                isOpen={isOpen}
                                onPress={handleAction}
                            />
                        ))}
                    </View>
                </BlurView>
            </Animated.View>
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
    panelShell: {
        position: 'absolute',
        left: 14,
        right: 14,
        borderRadius: 26,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.12)',
    },
    panelBlur: {
        borderRadius: 26,
        paddingHorizontal: 10,
        paddingTop: 14,
        paddingBottom: 10,
        backgroundColor: 'rgba(6, 10, 13, 0.58)',
    },
    panelTint: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(7, 11, 15, 0.44)',
    },
    gridContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
    },
    itemWrapper: {
        width: '33.33%',
        alignItems: 'center',
        marginBottom: 16,
    },
    item: {
        alignItems: 'center',
    },
    circle: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
    label: {
        color: '#F3F4F6',
        fontSize: 12,
        fontWeight: '600',
        textAlign: 'center',
    },
});
