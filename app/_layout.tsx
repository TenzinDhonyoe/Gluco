import { Stack, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Image, LogBox, View } from 'react-native';
import 'react-native-reanimated';

// Silence known harmless warnings
LogBox.ignoreLogs([
  'View #', // Shadow efficiency warnings
  'Image not found in storage', // Old cached images
  'shadow set but cannot calculate shadow efficiently', // Alternative shadow warning format
]);

import { AuthProvider } from '@/context/AuthContext';
import { SubscriptionProvider } from '@/context/SubscriptionContext';
import { useOutfitFonts } from '@/hooks/useFonts';
import {
  configureAndroidChannel,
  handleInitialNotification,
  initNotifications,
  setNotificationNavigationReady,
  setupNotificationListeners,
} from '@/lib/notifications';
import { initializeRevenueCat } from '@/lib/revenuecat';

const SPLASH_LOGO = require('../assets/images/mascots/gluco_app_mascott/gluco_splash.png');

export default function RootLayout() {
  const { fontsLoaded, fontError } = useOutfitFonts();
  const navigationState = useRootNavigationState();
  const fontsReady = fontsLoaded || !!fontError;
  const navigationReady = !!navigationState?.key;

  // Initialize RevenueCat SDK (lazy loaded to avoid hot reload issues)
  useEffect(() => {
    initializeRevenueCat();
  }, []);

  // Setup notification handlers
  useEffect(() => {
    // Initialize notifications (listeners, channels, handlers)
    initNotifications().then(() => {
      configureAndroidChannel();
    });

    // Setup notification response listener
    const cleanup = setupNotificationListeners();

    // Handle notification if app was opened from one
    handleInitialNotification();

    return cleanup;
  }, []);

  useEffect(() => {
    if (!fontsReady || !navigationReady) return;
    setNotificationNavigationReady(true);
    return () => setNotificationNavigationReady(false);
  }, [fontsReady, navigationReady]);

  // Show loading screen while fonts load, but don't block forever
  // If there's a font error, continue anyway
  if (!fontsLoaded && !fontError) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#151718' }}>
        <Image source={SPLASH_LOGO} style={{ width: 200, height: 200, resizeMode: 'contain' }} />
      </View>
    );
  }

  return (
    <AuthProvider>
      <SubscriptionProvider>
        <View style={{ flex: 1, backgroundColor: '#111111' }}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: '#111111' },
              animation: 'fade',
              animationDuration: 150,
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="signin" />
            <Stack.Screen name="signup" />
            <Stack.Screen name="confirm-email" />
            <Stack.Screen name="onboarding-1" />
            <Stack.Screen name="onboarding-2" />
            <Stack.Screen name="onboarding-3" />
            <Stack.Screen name="onboarding-4" />
            <Stack.Screen name="onboarding-5" />
            <Stack.Screen name="paywall" />
            <Stack.Screen name="log-meal" options={{ animation: 'fade' }} />
            <Stack.Screen name="log-meal-review" options={{ animation: 'fade' }} />
            <Stack.Screen name="log-meal-items" options={{ animation: 'fade' }} />
            <Stack.Screen name="log-glucose" options={{ animation: 'fade' }} />
            <Stack.Screen name="log-activity" options={{ animation: 'fade' }} />
            <Stack.Screen name="settings" />
            <Stack.Screen name="customization" />
            <Stack.Screen name="data-sources" />
            <Stack.Screen name="account-privacy" />
            <Stack.Screen name="pre-meal-check" />
            <Stack.Screen name="scan-label" />
            <Stack.Screen name="meal-scanner" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="meal-checkin" />
            <Stack.Screen name="notifications-list" />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          </Stack>
          <StatusBar style="light" />
        </View>
      </SubscriptionProvider>
    </AuthProvider>
  );
}
