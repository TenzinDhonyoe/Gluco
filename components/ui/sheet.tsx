import React, { PropsWithChildren, useEffect } from 'react';
import { Dimensions, Modal, Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

type Props = PropsWithChildren<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>;

export function Sheet({ open, onOpenChange, children }: Props) {
  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={() => onOpenChange(false)}>
      <Pressable style={styles.backdrop} onPress={() => onOpenChange(false)} />
      {children}
    </Modal>
  );
}

export function SheetContent({
  children,
  showHandle = true,
  position = 'bottom',
  style: contentStyle,
}: PropsWithChildren<{ showHandle?: boolean; position?: 'bottom' | 'center'; style?: ViewStyle }>) {
  const y = useSharedValue(SCREEN_HEIGHT);

  useEffect(() => {
    y.value = withTiming(0, { duration: 220 });
    return () => {
      y.value = SCREEN_HEIGHT;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }],
  }));

  const positionStyle = position === 'center' ? styles.contentCenter : styles.contentBottom;

  return (
    <Animated.View style={[styles.contentBase, positionStyle, animatedStyle, contentStyle]}>
      {showHandle ? <View style={styles.handle} /> : null}
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  contentBase: {
    position: 'absolute',
    left: 12,
    right: 12,
    backgroundColor: 'rgba(240, 248, 249, 0.97)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(45, 212, 191, 0.12)',
    padding: 16,
    gap: 10,
  },
  contentBottom: {
    bottom: 24,
  },
  contentCenter: {
    top: '35%',
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 100,
    backgroundColor: 'rgba(60, 60, 67, 0.15)',
    marginBottom: 8,
  },
});
