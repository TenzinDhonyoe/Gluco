import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Trigger haptic feedback (iOS only).
 * - 'light' for standard taps, navigation, list items
 * - 'medium' for FAB, primary CTAs, destructive actions
 */
export function triggerHaptic(style: 'light' | 'medium' = 'light') {
  if (Platform.OS !== 'ios') return;
  Haptics.impactAsync(
    style === 'medium'
      ? Haptics.ImpactFeedbackStyle.Medium
      : Haptics.ImpactFeedbackStyle.Light
  );
}
