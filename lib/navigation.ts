import { router } from 'expo-router';

/**
 * Clear the entire back stack, then navigate to the given destination.
 * Prevents iOS back gesture from returning to auth/onboarding screens.
 *
 * Usage:
 *   navigateToApp()          → clears stack, goes to /(tabs)
 *   navigateToApp('/paywall') → clears stack, goes to /paywall
 *   navigateToApp('/')        → clears stack, goes to welcome (sign-out)
 */
export function navigateToApp(destination: string = '/(tabs)') {
  while (router.canDismiss()) {
    router.dismiss();
  }
  router.replace(destination as never);
}
