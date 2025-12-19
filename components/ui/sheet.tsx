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
      <Pressable style={styles.backdrop} onPress={() => onOpenChange(false)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => {}} />
      </Pressable>
      {children}
    </Modal>
  );
}

export function SheetContent({
  children,
  showHandle = true,
  style: contentStyle,
}: PropsWithChildren<{ showHandle?: boolean; style?: ViewStyle }>) {
  const y = useSharedValue(SCREEN_HEIGHT);

  useEffect(() => {
    y.value = withTiming(0, { duration: 220 });
    return () => {
      y.value = SCREEN_HEIGHT;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }],
  }));

  return (
    <Animated.View style={[styles.content, style, contentStyle]}>
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
  content: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: '#1a1b1c',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    padding: 16,
    gap: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginBottom: 8,
  },
});

