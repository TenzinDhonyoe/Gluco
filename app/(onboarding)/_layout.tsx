import { Stack } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';

export default function OnboardingLayout() {
    return (
        <Stack
            screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: 'transparent' },
                animation: Platform.OS === 'ios' ? 'ios_from_right' : 'slide_from_right',
            }}
        >
            <Stack.Screen name="onboarding-welcome" options={{ animation: 'fade' }} />
            <Stack.Screen name="onboarding-personalize" options={{ animation: 'fade' }} />
        </Stack>
    );
}
