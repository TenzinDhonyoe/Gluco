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

type SegmentedPalette = {
  containerBg?: string;
  containerBorder?: string;
  sliderColors?: [string, string, string];
  sliderBorder?: string;
  inactiveText?: string;
  activeText?: string;
};

type Props<T extends string> = {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  testID?: string;
  palette?: SegmentedPalette;
};

const DEFAULT_SEGMENTED_PALETTE: Required<SegmentedPalette> = {
  containerBg: 'rgba(30, 32, 34, 0.6)',
  containerBorder: 'rgba(255,255,255,0.06)',
  sliderColors: ['rgba(255,255,255,0.18)', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.12)'],
  sliderBorder: 'rgba(255,255,255,0.2)',
  inactiveText: '#878787',
  activeText: '#FFFFFF',
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
  inactiveTextColor,
  activeTextColor,
}: {
  option: SegmentedOption<T>;
  isActive: boolean;
  onPress: () => void;
  activeIndex: number;
  index: number;
  inactiveTextColor: string;
  activeTextColor: string;
}) {
  const scale = useSharedValue(1);
  const pressed = useSharedValue(0);

  // Animate text color based on active state
  const textAnimatedStyle = useAnimatedStyle(() => {
    const color = interpolateColor(
      isActive ? 1 : 0,
      [0, 1],
      [inactiveTextColor, activeTextColor]
    );
    return { color };
  }, [isActive, inactiveTextColor, activeTextColor]);

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
  palette,
}: Props<T>) {
  const [containerWidth, setContainerWidth] = React.useState(0);
  const slideX = useSharedValue(0);
  const sliderScale = useSharedValue(1);
  const sliderOpacity = useSharedValue(1);

  const activeIndex = options.findIndex(opt => opt.value === value);
  const itemWidth = containerWidth > 0 ? (containerWidth - 8) / options.length : 0;
  const resolvedPalette = {
    ...DEFAULT_SEGMENTED_PALETTE,
    ...(palette || {}),
  };

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
    }
  }, [activeIndex, containerWidth, itemWidth, slideX, sliderScale, sliderOpacity]);

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
    <View
      style={[
        styles.container,
        {
          backgroundColor: resolvedPalette.containerBg,
          borderColor: resolvedPalette.containerBorder,
        },
      ]}
      testID={testID}
      onLayout={onLayout}
    >
      {/* Outer glow effect */}


      {/* Animated sliding indicator with glass effect */}
      {containerWidth > 0 && (
        <Animated.View
          style={[
            styles.sliderContainer,
            { borderColor: resolvedPalette.sliderBorder },
            { width: itemWidth - 4 },
            sliderAnimatedStyle,
          ]}
        >
          <AnimatedLinearGradient
            colors={resolvedPalette.sliderColors}
            locations={[0, 0.5, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.sliderGradient}
          />
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
            inactiveTextColor={resolvedPalette.inactiveText}
            activeTextColor={resolvedPalette.activeText}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: DEFAULT_SEGMENTED_PALETTE.containerBg,
    borderRadius: 999,
    padding: 4,
    gap: 0,
    borderWidth: 1,
    borderColor: DEFAULT_SEGMENTED_PALETTE.containerBorder,
    position: 'relative',
    overflow: 'hidden',
  },

  sliderContainer: {
    position: 'absolute',
    top: 4,
    height: 34,
    borderRadius: 999,
    overflow: 'hidden',
    // Glass border effect
    borderWidth: 1,
    borderColor: DEFAULT_SEGMENTED_PALETTE.sliderBorder,
  },
  sliderGradient: {
    ...StyleSheet.absoluteFillObject,
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
