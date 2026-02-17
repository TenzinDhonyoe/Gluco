import { requireNativeModule } from 'expo-modules-core';

const TabBarInsets = requireNativeModule('TabBarInsets');

/**
 * Adds a right safe-area inset to the native UITabBarController so the
 * Liquid Glass compact tab bar pill shifts left, leaving room for the FAB.
 */
export function setTabBarRightInset(rightInset: number): Promise<boolean> {
    return TabBarInsets.setRightInset(rightInset);
}
