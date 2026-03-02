import { Colors } from '@/constants/Colors';
import { fonts } from '@/hooks/useFonts';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md';

type Props = {
  children: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: Variant;
  size?: Size;
  style?: ViewStyle;
  haptic?: boolean;
};

export function Button({
  children,
  onPress,
  disabled,
  loading,
  variant = 'primary',
  size = 'md',
  style,
  haptic = true,
}: Props) {
  const isDisabled = disabled || loading;

  const handlePress = () => {
    if (isDisabled) return;
    if (haptic && Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress?.();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        stylesByVariant[variant],
        stylesBySize[size],
        style,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? Colors.buttonActionText : Colors.textPrimary} />
      ) : (
        <Text style={[styles.text, variant !== 'primary' && styles.textDark]}>{children}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    opacity: 0.55,
  },
  text: {
    fontFamily: fonts.medium,
    fontSize: 16,
    color: Colors.buttonActionText,
  },
  textDark: {
    color: Colors.textPrimary,
  },
});

const stylesBySize = StyleSheet.create({
  sm: { height: 44, paddingHorizontal: 14 },
  md: { height: 52, paddingHorizontal: 18 },
});

const stylesByVariant = StyleSheet.create({
  primary: {
    backgroundColor: Colors.buttonAction,
    borderWidth: 0,
    borderColor: 'transparent',
  },
  secondary: {
    backgroundColor: Colors.buttonSecondary,
    borderWidth: 1,
    borderColor: Colors.buttonSecondaryBorder,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.borderMedium,
  },
});
