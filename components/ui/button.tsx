import { fonts } from '@/hooks/useFonts';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';

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
};

export function Button({
  children,
  onPress,
  disabled,
  loading,
  variant = 'primary',
  size = 'md',
  style,
}: Props) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={isDisabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.base,
        stylesByVariant[variant],
        stylesBySize[size],
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.text}>{children}</Text>}
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
    transform: [{ scale: 0.99 }],
    opacity: 0.95,
  },
  disabled: {
    opacity: 0.55,
  },
  text: {
    fontFamily: fonts.medium,
    fontSize: 16,
    color: '#FFFFFF',
  },
});

const stylesBySize = StyleSheet.create({
  sm: { height: 44, paddingHorizontal: 14 },
  md: { height: 52, paddingHorizontal: 18 },
});

const stylesByVariant = StyleSheet.create({
  primary: {
    backgroundColor: '#285E2A',
    borderWidth: 1,
    borderColor: '#448D47',
  },
  secondary: {
    backgroundColor: 'rgba(63,66,67,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  ghost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
});

