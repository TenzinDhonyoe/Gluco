import { Colors } from '@/constants/Colors';
import { fonts } from '@/hooks/useFonts';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect } from 'react';
import { LayoutChangeEvent, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

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

const SPRING_CONFIG = {
  damping: 22,
  stiffness: 350,
  mass: 0.4,
};

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

// Individual segment button with press animation
function SegmentButton<T extends string>({
  option,
  isActive,
  onPress,
  activeIndex,
  index,
}: {
  option: SegmentedOption<T>;
  isActive: boolean;
  onPress: () => void;
  activeIndex: number;
  index: number;
}) {
  const scale = useSharedValue(1);
  const pressed = useSharedValue(0);

  // Animate text color based on active state
  const textAnimatedStyle = useAnimatedStyle(() => {
    const color = interpolateColor(
      isActive ? 1 : 0,
      [0, 1],
      ['#878787', '#FFFFFF']
    );
    return { color };
  }, [isActive]);

  const containerAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
      opacity: interpolate(pressed.value, [0, 1], [1, 0.8]),
    };
  });

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.95, { damping: 20, stiffness: 600 });
    pressed.value = withTiming(1, { duration: 50 });
  }, [scale, pressed]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 18, stiffness: 500 });
    pressed.value = withTiming(0, { duration: 80 });
  }, [scale, pressed]);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={styles.itemPressable}
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
    >
      <Animated.View style={[styles.item, containerAnimatedStyle]}>
        <Animated.Text
          style={[
            styles.label,
            isActive && styles.labelActive,
            textAnimatedStyle,
          ]}
        >
          {option.label}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  testID,
}: Props<T>) {
  const [containerWidth, setContainerWidth] = React.useState(0);
  const slideX = useSharedValue(0);
  const sliderScale = useSharedValue(1);
  const sliderOpacity = useSharedValue(1);
  const glowOpacity = useSharedValue(0.5);

  const activeIndex = options.findIndex(opt => opt.value === value);
  const itemWidth = containerWidth > 0 ? (containerWidth - 8) / options.length : 0;

  // Animate slider position with liquid spring
  useEffect(() => {
    if (containerWidth > 0) {
      const targetX = 4 + activeIndex * itemWidth;

      // Quick liquid "squish" effect
      sliderScale.value = withSpring(0.94, { damping: 22, stiffness: 500 });
      sliderOpacity.value = withTiming(0.9, { duration: 30 });

      slideX.value = withSpring(targetX, SPRING_CONFIG, () => {
        // Bounce back to normal scale after reaching destination
        sliderScale.value = withSpring(1, { damping: 20, stiffness: 400 });
        sliderOpacity.value = withTiming(1, { duration: 80 });
      });

      // Pulse the glow effect
      glowOpacity.value = withTiming(0.7, { duration: 50 }, () => {
        glowOpacity.value = withTiming(0.4, { duration: 150 });
      });
    }
  }, [activeIndex, containerWidth, itemWidth, slideX, sliderScale, sliderOpacity, glowOpacity]);

  const sliderAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: slideX.value },
        { scaleX: sliderScale.value },
        { scaleY: interpolate(sliderScale.value, [0.92, 1], [1.05, 1]) }, // Slight vertical stretch when compressed
      ],
      opacity: sliderOpacity.value,
    };
  });

  const glowAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: glowOpacity.value,
      transform: [
        { translateX: slideX.value },
        { scale: interpolate(sliderScale.value, [0.92, 1], [1.1, 1]) },
      ],
    };
  });

  const onLayout = (e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  };

  const triggerHaptic = useCallback(() => {
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const handleChange = useCallback((newValue: T) => {
    if (newValue !== value) {
      triggerHaptic();
      onChange(newValue);
    }
  }, [value, onChange, triggerHaptic]);

  return (
    <View style={styles.container} testID={testID} onLayout={onLayout}>
      {/* Outer glow effect */}
      {containerWidth > 0 && (
        <Animated.View
          style={[
            styles.glowOuter,
            { width: itemWidth + 8 },
            glowAnimatedStyle,
          ]}
        />
      )}

      {/* Animated sliding indicator with glass effect */}
      {containerWidth > 0 && (
        <Animated.View
          style={[
            styles.sliderContainer,
            { width: itemWidth - 4 },
            sliderAnimatedStyle,
          ]}
        >
          <AnimatedLinearGradient
            colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.12)']}
            locations={[0, 0.5, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.sliderGradient}
          />
          {/* Inner highlight for glass depth */}
          <View style={styles.sliderInnerHighlight} />
          {/* Bottom reflection */}
          <View style={styles.sliderBottomReflection} />
        </Animated.View>
      )}

      {/* Segment buttons */}
      {options.map((opt, index) => {
        const isActive = opt.value === value;
        return (
          <SegmentButton
            key={opt.value}
            option={opt}
            isActive={isActive}
            onPress={() => handleChange(opt.value)}
            activeIndex={activeIndex}
            index={index}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: 'rgba(30, 32, 34, 0.6)',
    borderRadius: 999,
    padding: 4,
    gap: 0,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    position: 'relative',
    overflow: 'hidden',
    // Subtle inner shadow effect
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  glowOuter: {
    position: 'absolute',
    top: 0,
    height: '100%',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  sliderContainer: {
    position: 'absolute',
    top: 4,
    height: 34,
    borderRadius: 999,
    overflow: 'hidden',
    // Glass border effect
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    // Shadow for depth
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  sliderGradient: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
  },
  sliderInnerHighlight: {
    position: 'absolute',
    top: 1,
    left: 8,
    right: 8,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 999,
  },
  sliderBottomReflection: {
    position: 'absolute',
    bottom: 2,
    left: 12,
    right: 12,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 999,
  },
  itemPressable: {
    flex: 1,
    zIndex: 1,
  },
  item: {
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: '#878787',
    letterSpacing: 0.3,
  },
  labelActive: {
    color: Colors.textPrimary,
    fontFamily: fonts.semiBold,
  },
});
