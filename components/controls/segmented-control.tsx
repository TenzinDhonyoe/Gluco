import { Colors } from '@/constants/Colors';
import { fonts } from '@/hooks/useFonts';
import React, { useEffect, useRef } from 'react';
import { Animated, LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';

export type SegmentedOption<T extends string> = {
  label: string;
  value: T;
};

type Props<T extends string> = {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  testID?: string;
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  testID,
}: Props<T>) {
  const [containerWidth, setContainerWidth] = React.useState(0);
  const slideAnim = useRef(new Animated.Value(0)).current;

  const activeIndex = options.findIndex(opt => opt.value === value);
  const itemWidth = containerWidth > 0 ? (containerWidth - 8) / options.length : 0; // 8 = padding*2

  // Animate slide when active index changes
  useEffect(() => {
    if (containerWidth > 0) {
      Animated.spring(slideAnim, {
        toValue: 4 + activeIndex * itemWidth, // 4 = left padding
        useNativeDriver: true,
        damping: 20,
        stiffness: 200,
        mass: 0.8,
      }).start();
    }
  }, [activeIndex, containerWidth, itemWidth, slideAnim]);

  const onLayout = (e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  };

  return (
    <View style={styles.container} testID={testID} onLayout={onLayout}>
      {/* Animated sliding indicator */}
      {containerWidth > 0 && (
        <Animated.View
          style={[
            styles.slider,
            {
              width: itemWidth - 4, // slight gap
              transform: [{ translateX: slideAnim }],
            },
          ]}
        />
      )}

      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={({ pressed }) => [
              styles.item,
              pressed && styles.itemPressed,
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
          >
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: 'rgba(63, 66, 67, 0.28)',
    borderRadius: 999,
    padding: 4,
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    position: 'relative',
  },
  slider: {
    position: 'absolute',
    top: 4,
    height: 34,
    borderRadius: 999,
    backgroundColor: 'rgba(231, 232, 233, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(231, 232, 233, 0.18)',
  },
  item: {
    flex: 1,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  itemPressed: {
    opacity: 0.9,
  },
  label: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: '#B9B9B9',
  },
  labelActive: {
    color: Colors.textPrimary,
    fontFamily: fonts.bold,
  },
});
