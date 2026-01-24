/**
 * Notifications Library
 * Handles local notifications for after-meal check-ins
 */

import type * as NotificationsType from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';

// Helper to check if we are in a server environment (SSR)
const IS_SERVER = Platform.OS === 'web' && typeof window === 'undefined';

// Lazy lazy load the module
async function getNotificationsModule() {
    if (IS_SERVER) return null;
    try {
        return await import('expo-notifications');
    } catch (e) {
        console.warn('Failed to load expo-notifications:', e);
        return null;
    }
}

/**
 * Initialize notifications handler
 * Should be called from _layout.tsx
 */
export async function initNotifications() {
    if (IS_SERVER) return;

    const Notifications = await getNotificationsModule();
    if (!Notifications) return;

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
}

// Types
export interface PostMealReviewNotificationData {
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
    if (IS_SERVER) return false;
    const Notifications = await getNotificationsModule();
    if (!Notifications) return false;

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
    mealId: string,
    mealName: string,
    scheduledFor: Date
): Promise<string | null> {
    if (IS_SERVER) return null;
    const Notifications = await getNotificationsModule();
    if (!Notifications) return null;

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
                title: 'Check in on your meal',
                body: 'How are you feeling after your meal?',
                data: {
                    mealId,
                    mealName,
                    route: '/meal-checkin',
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

        if (__DEV__) console.log(`Scheduled after-meal check-in notification: ${notificationId} in ${secondsUntil}s`);
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
    if (IS_SERVER) return;
    const Notifications = await getNotificationsModule();
    if (!Notifications) return;

    try {
        await Notifications.cancelScheduledNotificationAsync(notificationId);
        if (__DEV__) console.log(`Cancelled notification: ${notificationId}`);
    } catch (error) {
        console.error('Failed to cancel notification:', error);
    }
}

/**
 * Handle notification response (when user taps notification)
 */
let navigationReady = false;
let pendingNotification: PostMealReviewNotificationData | null = null;

function navigateToNotification(data: PostMealReviewNotificationData): void {
    router.push({
        pathname: data.route as any,
        params: { mealId: data.mealId, mealName: data.mealName },
    });
}

export function setNotificationNavigationReady(ready: boolean): void {
    navigationReady = ready;
    if (navigationReady && pendingNotification) {
        const queued = pendingNotification;
        pendingNotification = null;
        navigateToNotification(queued);
    }
}

export function handleNotificationResponse(
    response: NotificationsType.NotificationResponse
): void {
    const data = response.notification.request.content.data as unknown as PostMealReviewNotificationData;

    if (!data?.route || !data?.mealId) {
        return;
    }

    if (!navigationReady) {
        pendingNotification = data;
        return;
    }

    navigateToNotification(data);
}

/**
 * Setup global notification response listener
 * Call this once in _layout.tsx
 */
// Keep references to subscriptions
let notificationSubscription: NotificationsType.EventSubscription | null = null;
let responseSubscription: NotificationsType.EventSubscription | null = null;

export function setupNotificationListeners(): () => void {
    if (IS_SERVER) return () => { };

    // We can't use await here easily since this is sync in _layout context often, 
    // but the listeners need the module. 
    // We'll wrap in an async IIFE
    (async () => {
        const Notifications = await getNotificationsModule();
        if (!Notifications) return;

        // Handle notification received while app is foregrounded
        notificationSubscription = Notifications.addNotificationReceivedListener(notification => {
            if (__DEV__) console.log('Notification received:', notification.request.content.title);
        });

        // Handle when user taps on notification
        responseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
            handleNotificationResponse(response);
        });
    })();

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
    if (IS_SERVER) return;
    const Notifications = await getNotificationsModule();
    if (!Notifications) return;

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
export async function getScheduledNotifications(): Promise<NotificationsType.NotificationRequest[]> {
    if (IS_SERVER) return [];
    const Notifications = await getNotificationsModule();
    if (!Notifications) return [];
    return Notifications.getAllScheduledNotificationsAsync();
}

/**
 * Cancel all scheduled notifications
 */
export async function cancelAllNotifications(): Promise<void> {
    if (IS_SERVER) return;
    const Notifications = await getNotificationsModule();
    if (!Notifications) return;
    await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * Configure notification channel for Android
 */
export async function configureAndroidChannel(): Promise<void> {
    if (IS_SERVER) return;
    if (Platform.OS === 'android') {
        const Notifications = await getNotificationsModule();
        if (!Notifications) return;

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
