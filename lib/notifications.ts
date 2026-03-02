/**
 * Notifications Library
 * Handles local notifications for after-meal check-ins
 */

import type * as NotificationsType from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';
import { supabase } from './supabase';

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
export interface NotificationRouteData {
    mealId?: string;
    mealName?: string;
    route: string;
    ts?: number;
    tab?: string;
    category?: string;
    scheduleDay?: string;
}

type ReminderCategory =
    | 'meal_reminders'
    | 'post_meal_reviews'
    | 'daily_insights'
    | 'experiment_updates'
    | 'active_action_midday'
    | 'post_meal_action'
    | 'weekly_summary';

const DAILY_NOTIFICATION_CAP = 2;
const DEFAULT_NOTIFICATION_PREFS: Record<ReminderCategory, boolean> = {
    meal_reminders: true,
    post_meal_reviews: true,
    daily_insights: true,
    experiment_updates: true,
    active_action_midday: true,
    post_meal_action: true,
    weekly_summary: true,
};

let notificationPrefsColumnAvailable: boolean | null = null;
let notificationPrefsColumnWarned = false;

function isMissingNotificationPrefsColumn(error: { code?: string; message?: string } | null | undefined): boolean {
    if (!error) return false;
    const message = (error.message || '').toLowerCase();
    const mentionsColumn = message.includes('notification_preferences');
    return (error.code === '42703' || message.includes('column') || message.includes('does not exist')) && mentionsColumn;
}

function toDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

async function isReminderEnabled(userId: string | undefined, category: ReminderCategory): Promise<boolean> {
    if (!userId) return true;
    if (notificationPrefsColumnAvailable === false) return DEFAULT_NOTIFICATION_PREFS[category];

    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('notification_preferences')
            .eq('id', userId)
            .single();

        if (error) {
            if (isMissingNotificationPrefsColumn(error)) {
                notificationPrefsColumnAvailable = false;
                if (!notificationPrefsColumnWarned) {
                    notificationPrefsColumnWarned = true;
                    console.warn('notification_preferences column missing; using default notification settings until migration is applied.');
                }
                return DEFAULT_NOTIFICATION_PREFS[category];
            }
            console.warn('Failed to load notification preferences, using defaults:', error.message);
            return DEFAULT_NOTIFICATION_PREFS[category];
        }

        notificationPrefsColumnAvailable = true;
        const prefs = data?.notification_preferences || {};
        const value = prefs[category];
        if (typeof value === 'boolean') return value;
        return DEFAULT_NOTIFICATION_PREFS[category];
    } catch (error) {
        console.warn('Error reading notification preferences, using defaults:', error);
        return DEFAULT_NOTIFICATION_PREFS[category];
    }
}

async function isUnderDailyCap(targetDate: Date): Promise<boolean> {
    const scheduled = await getScheduledNotifications();
    const dateKey = toDateKey(targetDate);

    const countForDate = scheduled.filter((request) => {
        const data = (request.content?.data || {}) as Record<string, unknown>;
        const scheduleDay = typeof data.scheduleDay === 'string' ? data.scheduleDay : null;
        return scheduleDay === dateKey;
    }).length;

    return countForDate < DAILY_NOTIFICATION_CAP;
}

async function hasScheduledCategory(
    targetDate: Date,
    category: ReminderCategory,
    mealId?: string
): Promise<boolean> {
    const scheduled = await getScheduledNotifications();
    const dateKey = toDateKey(targetDate);

    return scheduled.some((request) => {
        const data = (request.content?.data || {}) as Record<string, unknown>;
        const requestCategory = typeof data.category === 'string' ? data.category : null;
        const scheduleDay = typeof data.scheduleDay === 'string' ? data.scheduleDay : null;
        const requestMealId = typeof data.mealId === 'string' ? data.mealId : null;

        if (requestCategory !== category || scheduleDay !== dateKey) {
            return false;
        }

        if (mealId) {
            return requestMealId === mealId;
        }

        return true;
    });
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
    scheduledFor: Date,
    userId?: string
): Promise<string | null> {
    if (IS_SERVER) return null;
    const Notifications = await getNotificationsModule();
    if (!Notifications) return null;

    try {
        const enabled = await isReminderEnabled(userId, 'post_meal_reviews');
        if (!enabled) {
            if (__DEV__) console.log('Skipping post-meal review reminder: disabled by preference');
            return null;
        }

        const duplicate = await hasScheduledCategory(scheduledFor, 'post_meal_reviews', mealId);
        if (duplicate) {
            if (__DEV__) console.log('Skipping post-meal review reminder: already scheduled');
            return null;
        }

        const underCap = await isUnderDailyCap(scheduledFor);
        if (!underCap) {
            if (__DEV__) console.log('Skipping post-meal review reminder: daily cap reached');
            return null;
        }

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
                    category: 'post_meal_reviews',
                    scheduleDay: toDateKey(scheduledFor),
                } as NotificationRouteData as unknown as Record<string, unknown>,
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
 * Schedule a shorter post-meal action reminder (JITAI-lite).
 * Defaults to 20 minutes after a meal.
 */
export async function schedulePostMealActionReminder(
    mealId: string,
    mealName: string,
    userId?: string,
    minutesAfterMeal: number = 20
): Promise<string | null> {
    if (IS_SERVER) return null;
    const Notifications = await getNotificationsModule();
    if (!Notifications) return null;

    const clampedMinutes = Math.min(30, Math.max(15, minutesAfterMeal));
    const scheduledFor = new Date(Date.now() + clampedMinutes * 60 * 1000);

    try {
        const enabled = await isReminderEnabled(userId, 'post_meal_action');
        if (!enabled) return null;

        const duplicate = await hasScheduledCategory(scheduledFor, 'post_meal_action', mealId);
        if (duplicate) return null;

        const underCap = await isUnderDailyCap(scheduledFor);
        if (!underCap) return null;

        const hasPermission = await requestNotificationPermissions();
        if (!hasPermission) return null;

        const secondsUntil = Math.max(1, (scheduledFor.getTime() - Date.now()) / 1000);
        const notificationId = await Notifications.scheduleNotificationAsync({
            content: {
                title: 'Small action right now',
                body: `Try a short walk after ${mealName}.`,
                data: {
                    mealId,
                    mealName,
                    route: '/(tabs)/insights',
                    tab: 'actions',
                    ts: scheduledFor.getTime(),
                    category: 'post_meal_action',
                    scheduleDay: toDateKey(scheduledFor),
                } as Record<string, unknown>,
                sound: true,
            },
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                seconds: secondsUntil,
            },
        });

        return notificationId;
    } catch (error) {
        console.error('Failed to schedule post-meal action reminder:', error);
        return null;
    }
}

/**
 * Schedule a midday active-action reminder.
 */
export async function scheduleMiddayActiveActionReminder(
    actionTitle: string,
    userId?: string
): Promise<string | null> {
    if (IS_SERVER) return null;
    const Notifications = await getNotificationsModule();
    if (!Notifications) return null;

    const now = new Date();
    const target = new Date(now);
    target.setHours(12, 30, 0, 0);
    if (target.getTime() <= now.getTime()) {
        target.setDate(target.getDate() + 1);
    }

    try {
        const enabled = await isReminderEnabled(userId, 'active_action_midday');
        if (!enabled) return null;

        const duplicate = await hasScheduledCategory(target, 'active_action_midday');
        if (duplicate) return null;

        const underCap = await isUnderDailyCap(target);
        if (!underCap) return null;

        const hasPermission = await requestNotificationPermissions();
        if (!hasPermission) return null;

        const secondsUntil = Math.max(1, (target.getTime() - now.getTime()) / 1000);
        return await Notifications.scheduleNotificationAsync({
            content: {
                title: 'Midday nudge',
                body: `Keep momentum: ${actionTitle || 'complete your next tiny action'}`,
                data: {
                    route: '/(tabs)/insights',
                    tab: 'actions',
                    category: 'active_action_midday',
                    scheduleDay: toDateKey(target),
                } as Record<string, unknown>,
                sound: true,
            },
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                seconds: secondsUntil,
            },
        });
    } catch (error) {
        console.error('Failed to schedule midday reminder:', error);
        return null;
    }
}

/**
 * Schedule a weekly summary reminder (next Sunday 7:30 PM local time).
 */
export async function scheduleWeeklySummaryReminder(userId?: string): Promise<string | null> {
    if (IS_SERVER) return null;
    const Notifications = await getNotificationsModule();
    if (!Notifications) return null;

    const now = new Date();
    const target = new Date(now);
    const daysUntilSunday = (7 - now.getDay()) % 7;
    target.setDate(now.getDate() + daysUntilSunday);
    target.setHours(19, 30, 0, 0);
    if (target.getTime() <= now.getTime()) {
        target.setDate(target.getDate() + 7);
    }

    try {
        const enabled = await isReminderEnabled(userId, 'weekly_summary');
        if (!enabled) return null;

        const duplicate = await hasScheduledCategory(target, 'weekly_summary');
        if (duplicate) return null;

        const underCap = await isUnderDailyCap(target);
        if (!underCap) return null;

        const hasPermission = await requestNotificationPermissions();
        if (!hasPermission) return null;

        const secondsUntil = Math.max(1, (target.getTime() - now.getTime()) / 1000);
        return await Notifications.scheduleNotificationAsync({
            content: {
                title: 'Weekly behavior summary',
                body: 'Check your progress and see your personalized tips.',
                data: {
                    route: '/(tabs)/insights',
                    tab: 'progress',
                    category: 'weekly_summary',
                    scheduleDay: toDateKey(target),
                } as Record<string, unknown>,
                sound: true,
            },
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                seconds: secondsUntil,
            },
        });
    } catch (error) {
        console.error('Failed to schedule weekly summary reminder:', error);
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
let pendingNotification: NotificationRouteData | null = null;

function navigateToNotification(data: NotificationRouteData): void {
    if (!data?.route) return;

    const params: Record<string, string> = {};
    if (data.mealId) params.mealId = data.mealId;
    if (data.mealName) params.mealName = data.mealName;
    if (data.tab) params.tab = data.tab;

    if (Object.keys(params).length > 0) {
        router.push({
            pathname: data.route as any,
            params,
        });
        return;
    }

    router.push(data.route as any);
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
    const data = response.notification.request.content.data as unknown as NotificationRouteData;

    if (!data?.route) {
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
