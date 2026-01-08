import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import 'react-native-reanimated';

import { Colors } from '@/constants/Colors';
import { AuthProvider } from '@/context/AuthContext';
import { useOutfitFonts } from '@/hooks/useFonts';
import {
  configureAndroidChannel,
  handleInitialNotification,
  setupNotificationListeners,
} from '@/lib/notifications';

export default function RootLayout() {
  const { fontsLoaded, fontError } = useOutfitFonts();

  // Setup notification handlers
  useEffect(() => {
    // Configure Android notification channel
    configureAndroidChannel();

    // Setup notification response listener
    const cleanup = setupNotificationListeners();

    // Handle notification if app was opened from one
    handleInitialNotification();

    return cleanup;
  }, []);

  // Show loading screen while fonts load
  if (!fontsLoaded && !fontError) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111111' }}>
        <ActivityIndicator size="large" color={Colors.buttonPrimary} />
      </View>
    );
  }

  return (
    <AuthProvider>
      <View style={{ flex: 1, backgroundColor: '#111111' }}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#111111' },
            animation: 'slide_from_right',
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
          <Stack.Screen name="log-meal" />
          <Stack.Screen name="log-meal-items" />
          <Stack.Screen name="log-glucose" />
          <Stack.Screen name="log-activity" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="customization" />
          <Stack.Screen name="data-sources" />
          <Stack.Screen name="account-privacy" />
          <Stack.Screen name="labs-health-info" />
          <Stack.Screen name="pre-meal-check" />
          <Stack.Screen name="scan-label" />
          <Stack.Screen name="meal-checkin" />
          <Stack.Screen name="notifications-list" />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
        <StatusBar style="light" />
      </View>
    </AuthProvider>
  );
}
