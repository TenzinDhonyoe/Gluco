/**
 * Notifications Library
 * Handles local notifications for after-meal check-ins
 */

import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

// Types
export interface PostMealReviewNotificationData {
    reviewId: string;
    mealId: string;
    mealName: string;
    route: string;
    ts: number;
}

/**
 * Request notification permissions
 * Returns true if granted
 */
export async function requestNotificationPermissions(): Promise<boolean> {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();

    if (existingStatus === 'granted') {
        return true;
    }

    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
}

/**
 * Schedule an after-meal check-in notification
 */
export async function schedulePostMealReviewNotification(
    reviewId: string,
    mealId: string,
    mealName: string,
    scheduledFor: Date
): Promise<string | null> {
    try {
        // Request permission if not granted
        const hasPermission = await requestNotificationPermissions();
        if (!hasPermission) {
            console.warn('Notification permission not granted');
            return null;
        }

        // Calculate seconds until notification
        const now = new Date();
        const secondsUntil = Math.max(1, (scheduledFor.getTime() - now.getTime()) / 1000);

        // Schedule the notification
        const notificationId = await Notifications.scheduleNotificationAsync({
            content: {
                title: 'After-Meal Check-in',
                body: `Time to check in on "${mealName}"`,
                data: {
                    reviewId,
                    mealId,
                    mealName,
                    route: '/post-meal-review',
                    ts: scheduledFor.getTime(),
                } as PostMealReviewNotificationData as unknown as Record<string, unknown>,
                sound: true,
                badge: 1,
            },
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                seconds: secondsUntil,
            },
        });

        console.log(`Scheduled after-meal check-in notification: ${notificationId} in ${secondsUntil}s`);
        return notificationId;
    } catch (error) {
        console.error('Failed to schedule notification:', error);
        return null;
    }
}

/**
 * Cancel a scheduled notification
 */
export async function cancelScheduledNotification(notificationId: string): Promise<void> {
    try {
        await Notifications.cancelScheduledNotificationAsync(notificationId);
        console.log(`Cancelled notification: ${notificationId}`);
    } catch (error) {
        console.error('Failed to cancel notification:', error);
    }
}

/**
 * Handle notification response (when user taps notification)
 */
export function handleNotificationResponse(
    response: Notifications.NotificationResponse
): void {
    const data = response.notification.request.content.data as unknown as PostMealReviewNotificationData;

    if (data?.route && data?.reviewId) {
        // Navigate to the after-meal check-in screen
        router.push({
            pathname: data.route as any,
            params: { reviewId: data.reviewId },
        });
    }
}

/**
 * Setup global notification response listener
 * Call this once in _layout.tsx
 */
let notificationSubscription: Notifications.EventSubscription | null = null;
let responseSubscription: Notifications.EventSubscription | null = null;

export function setupNotificationListeners(): () => void {
    // Handle notification received while app is foregrounded
    notificationSubscription = Notifications.addNotificationReceivedListener(notification => {
        console.log('Notification received:', notification.request.content.title);
    });

    // Handle when user taps on notification
    responseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
        handleNotificationResponse(response);
    });

    // Return cleanup function
    return () => {
        if (notificationSubscription) {
            notificationSubscription.remove();
        }
        if (responseSubscription) {
            responseSubscription.remove();
        }
    };
}

/**
 * Handle cold start - check if app was opened from notification
 */
export async function handleInitialNotification(): Promise<void> {
    const response = await Notifications.getLastNotificationResponseAsync();

    if (response) {
        // Small delay to ensure router is ready
        setTimeout(() => {
            handleNotificationResponse(response);
        }, 500);
    }
}

/**
 * Get all scheduled notifications (for debugging)
 */
export async function getScheduledNotifications(): Promise<Notifications.NotificationRequest[]> {
    return Notifications.getAllScheduledNotificationsAsync();
}

/**
 * Cancel all scheduled notifications
 */
export async function cancelAllNotifications(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * Configure notification channel for Android
 */
export async function configureAndroidChannel(): Promise<void> {
    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('after-meal-checkins', {
            name: 'After-Meal Check-ins',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#3494D9',
            sound: 'default',
            enableVibrate: true,
            showBadge: true,
        });
    }
}
