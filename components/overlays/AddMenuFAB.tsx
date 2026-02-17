import { useAddMenu } from '@/context/AddMenuContext';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const FAB_SIZE = 50;

export function AddMenuFAB() {
    const { isOpen, toggle, isOnTabScreen } = useAddMenu();
    const insets = useSafeAreaInsets();
    const rotation = useSharedValue(0);

    useEffect(() => {
        rotation.value = withSpring(isOpen ? 45 : 0, { damping: 14, stiffness: 200 });
    }, [isOpen, rotation]);

    const iconStyle = useAnimatedStyle(() => ({
        transform: [{ rotate: `${rotation.value}deg` }],
    }));

    if (!isOnTabScreen) return null;

    return (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
            <Pressable
                onPress={toggle}
                style={[
                    styles.fab,
                    {
                        right: 16,
                        bottom: insets.bottom + 1,
                    },
                ]}
            >
                <BlurView intensity={40} tint="systemChromeMaterialDark" style={styles.fabBlur}>
                    <Animated.View style={iconStyle}>
                        <Ionicons name="add" size={28} color="rgba(255,255,255,0.85)" />
                    </Animated.View>
                </BlurView>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    fab: {
        position: 'absolute',
        width: FAB_SIZE,
        height: FAB_SIZE,
        borderRadius: FAB_SIZE / 2,
        zIndex: 100,
        elevation: 100,
        overflow: 'hidden',
    },
    fabBlur: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
