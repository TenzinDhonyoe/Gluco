import 'react-native-reanimated';

import { ForestGlassBackground } from '@/components/backgrounds/forest-glass-background';
import { AddMenuFAB } from '@/components/overlays/AddMenuFAB';
import { AddMenuOverlay } from '@/components/overlays/AddMenuOverlay';
import { AddMenuProvider } from '@/context/AddMenuContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { SubscriptionProvider } from '@/context/SubscriptionContext';
import { useOutfitFonts } from '@/hooks/useFonts';
import { isBehaviorV1Experience } from '@/lib/experience';
import {
  configureAndroidChannel,
  handleInitialNotification,
  initNotifications,
  scheduleDailyCheckinReminder,
  scheduleMiddayActiveActionReminder,
  scheduleWeeklySummaryReminder,
  setNotificationNavigationReady,
  setupNotificationListeners,
} from '@/lib/notifications';
import { initializeRevenueCat } from '@/lib/revenuecat';
import { upsertUserAppSessionForToday } from '@/lib/supabase';
import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import Constants from 'expo-constants';
import { Stack, useRootNavigationState } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Appearance, LogBox, Platform, View } from 'react-native';

// Prevent native splash from auto-hiding — we hide it manually once the app is ready
SplashScreen.preventAutoHideAsync();

// Force Light Mode globally
Appearance.setColorScheme('light');

// Silence known harmless warnings
LogBox.ignoreLogs([
  'View #', // Shadow efficiency warnings
  '(ADVICE) View #', // Native shadow efficiency warnings
  'Image not found in storage', // Old cached images
  'shadow set but cannot calculate shadow efficiently', // Alternative shadow warning format
]);

const GlucoLightTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: '#2DD4BF',
    background: 'transparent',
    card: 'transparent',
    text: '#1C1C1E',
    border: '#E5E5EA',
    notification: '#2DD4BF',
  },
};

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

    scheduleDailyCheckinReminder(profile?.prompt_window ?? undefined, user.id).catch((error) => {
      console.warn('Failed to schedule daily checkin reminder:', error);
    });
  }, [user?.id, profile?.experience_variant, profile?.primary_habit, profile?.prompt_window]);

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

  // Setup notification handlers (TEMPORARILY DISABLED FOR SCREENSHOTS)
  // useEffect(() => {
  //   // Initialize notifications (listeners, channels, handlers)
  //   initNotifications().then(() => {
  //     configureAndroidChannel();
  //   });

  //   // Setup notification response listener
  //   const cleanup = setupNotificationListeners();

  //   // Handle notification if app was opened from one
  //   handleInitialNotification();

  //   return cleanup;
  // }, []);

  useEffect(() => {
    if (!fontsReady || !navigationReady) return;
    setNotificationNavigationReady(true);
    return () => setNotificationNavigationReady(false);
  }, [fontsReady, navigationReady]);

  // Wait for fonts before rendering — native splash screen covers this
  if (!fontsLoaded && !fontError) {
    return <View style={{ flex: 1, backgroundColor: '#F2F2F7' }} />;
  }

  return (
    <AuthProvider>
      <SubscriptionProvider>
        <AddMenuProvider>
          <SessionTracker />
          <View style={{ flex: 1, backgroundColor: '#F2F2F7' }}>
            <ForestGlassBackground />
            <ThemeProvider value={GlucoLightTheme}>
              <Stack
                screenOptions={{
                  headerShown: true,
                  headerStyle: { backgroundColor: 'transparent' },
                  headerTintColor: '#1C1C1E',
                  headerBackTitle: ' ',
                  headerShadowVisible: false,
                  headerTitleStyle: {
                    color: '#1C1C1E',
                    fontFamily: 'Outfit-SemiBold',
                    fontSize: 17,
                    ...(Platform.OS === 'android' && { fontWeight: '600' }),
                  },
                  contentStyle: { backgroundColor: 'transparent' },
                  animation: 'slide_from_right',
                }}
              >
                {/* Screens that manage their own full-screen presentation */}
                <Stack.Screen name="index" options={{ headerShown: false }} />
                <Stack.Screen name="signin" options={{ headerShown: false }} />
                <Stack.Screen name="signup" options={{ headerShown: false }} />
                <Stack.Screen name="privacy-intro" options={{ headerShown: false }} />
                <Stack.Screen name="confirm-email" options={{ headerShown: false }} />
                <Stack.Screen name="onboarding-profile" options={{ headerShown: false }} />
                <Stack.Screen name="onboarding-goals" options={{ headerShown: false }} />
                <Stack.Screen name="onboarding-body" options={{ headerShown: false }} />
                <Stack.Screen name="onboarding-tracking" options={{ headerShown: false }} />
                <Stack.Screen name="onboarding-coaching" options={{ headerShown: false }} />
                <Stack.Screen name="onboarding-ai" options={{ headerShown: false }} />
                <Stack.Screen name="onboarding-personalize" options={{ headerShown: false, animation: 'fade' }} />
                <Stack.Screen name="framework-reset" options={{ headerShown: false }} />
                <Stack.Screen name="paywall" options={{ headerShown: false }} />
                <Stack.Screen name="pre-meal-check" options={{ headerShown: false }} />
                <Stack.Screen name="scan-label" options={{ headerShown: false }} />
                <Stack.Screen name="meal-scanner" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
                <Stack.Screen name="(tabs)" options={{ headerShown: false, title: '', headerBackTitle: ' ', gestureEnabled: false }} />

                {/* Logging screens — complex custom headers kept */}
                <Stack.Screen name="log-meal" options={{ title: 'Log Meal', animation: 'ios_from_right' }} />
                <Stack.Screen name="log-meal-review" options={{ headerShown: false, animation: 'ios_from_right' }} />
                <Stack.Screen name="log-meal-items" options={{ headerShown: false, animation: 'ios_from_right' }} />

                {/* Screens with native headers */}
                <Stack.Screen name="log-glucose" options={{ title: 'Log Glucose', animation: 'ios_from_right' }} />
                <Stack.Screen name="log-activity" options={{ title: 'Log Activity', animation: 'ios_from_right' }} />
                <Stack.Screen name="log-weight" options={{ title: 'Log Weight', animation: 'ios_from_right' }} />
                <Stack.Screen name="log-detail" options={{ headerShown: false, animation: 'ios_from_right' }} />
                <Stack.Screen name="meal-score-detail" options={{ headerShown: false, animation: 'ios_from_right' }} />
                <Stack.Screen name="settings" options={{ title: 'Settings' }} />
                <Stack.Screen name="customization" options={{ title: 'Customization' }} />
                <Stack.Screen name="data-sources" options={{ title: 'Data Sources' }} />
                <Stack.Screen name="account-privacy" options={{ title: 'Account & Privacy' }} />
                <Stack.Screen name="meal-checkin" options={{ headerShown: false }} />
                <Stack.Screen name="daily-checkin" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
                <Stack.Screen name="notifications-list" options={{ title: 'Meal Check-ins' }} />
                <Stack.Screen name="experiments-list" options={{ title: 'My Experiments' }} />
                <Stack.Screen name="experiment-detail" options={{ title: 'Experiment' }} />
                <Stack.Screen name="check-exercise-impact" options={{ headerShown: false }} />
                <Stack.Screen name="experiment-results" options={{ headerShown: false }} />
              </Stack>
            </ThemeProvider>
            <StatusBar style="dark" />
            <AddMenuOverlay />
            <AddMenuFAB />
          </View>
        </AddMenuProvider>
      </SubscriptionProvider>
    </AuthProvider>
  );
}
