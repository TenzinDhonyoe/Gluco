import { Stack, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Image, LogBox, View } from 'react-native';
import 'react-native-reanimated';
import Constants from 'expo-constants';

import { AuthProvider, useAuth } from '@/context/AuthContext';
import { SubscriptionProvider } from '@/context/SubscriptionContext';
import { useOutfitFonts } from '@/hooks/useFonts';
import { isBehaviorV1Experience } from '@/lib/experience';
import { ForestGlassBackground } from '@/components/backgrounds/forest-glass-background';
import {
  configureAndroidChannel,
  handleInitialNotification,
  initNotifications,
  scheduleMiddayActiveActionReminder,
  scheduleWeeklySummaryReminder,
  setNotificationNavigationReady,
  setupNotificationListeners,
} from '@/lib/notifications';
import { initializeRevenueCat } from '@/lib/revenuecat';
import { upsertUserAppSessionForToday } from '@/lib/supabase';

// Silence known harmless warnings
LogBox.ignoreLogs([
  'View #', // Shadow efficiency warnings
  '(ADVICE) View #', // Native shadow efficiency warnings
  'Image not found in storage', // Old cached images
  'shadow set but cannot calculate shadow efficiently', // Alternative shadow warning format
]);

const SPLASH_LOGO = require('../assets/images/mascots/gluco_app_mascott/gluco_splash.png');

function SessionTracker() {
  const { user, profile } = useAuth();

  useEffect(() => {
    if (!user?.id) return;

    const appVersion = Constants.expoConfig?.version || null;
    upsertUserAppSessionForToday(user.id, appVersion ?? undefined).catch((error) => {
      console.warn('Failed to upsert app session:', error);
    });
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    if (!isBehaviorV1Experience(profile?.experience_variant)) return;

    const actionLabel = profile?.primary_habit?.trim() || 'complete your next tiny action';

    scheduleMiddayActiveActionReminder(actionLabel, user.id).catch((error) => {
      console.warn('Failed to schedule midday reminder:', error);
    });

    scheduleWeeklySummaryReminder(user.id).catch((error) => {
      console.warn('Failed to schedule weekly summary reminder:', error);
    });
  }, [user?.id, profile?.experience_variant, profile?.primary_habit]);

  return null;
}

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
        <SessionTracker />
        <View style={{ flex: 1, backgroundColor: 'transparent' }}>
          <ForestGlassBackground blurIntensity={18} />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: 'transparent' },
              animation: 'fade',
              animationDuration: 150,
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="signin" />
            <Stack.Screen name="signup" />
            <Stack.Screen name="confirm-email" />
            <Stack.Screen name="onboarding-profile" />
            <Stack.Screen name="onboarding-goals" />
            <Stack.Screen name="onboarding-body" />
            <Stack.Screen name="onboarding-tracking" />
            <Stack.Screen name="onboarding-coaching" />
            <Stack.Screen name="onboarding-ai" />
            <Stack.Screen name="framework-reset" />
            <Stack.Screen name="paywall" />
            <Stack.Screen name="log-meal" options={{ animation: 'fade' }} />
            <Stack.Screen name="log-meal-review" options={{ animation: 'fade' }} />
            <Stack.Screen name="log-meal-items" options={{ animation: 'fade' }} />
            <Stack.Screen name="log-glucose" options={{ animation: 'fade' }} />
            <Stack.Screen name="log-activity" options={{ animation: 'fade' }} />
            <Stack.Screen name="log-weight" options={{ animation: 'fade' }} />
            <Stack.Screen name="log-detail" options={{ animation: 'fade' }} />
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
