# Notifications

## Purpose
Schedule and handle local reminders for after-meal check-ins, and provide a screen for reviewing scheduled reminders.

## Entry Points
- `app/onboarding-ai.tsx` sets `notifications_enabled` as part of onboarding completion.
- `app/log-meal-review.tsx` schedules the post-meal reminder.
- `app/notifications-list.tsx` lists pending notifications.

## Flow Summary
- Permissions are requested via `requestNotificationPermissions` in `lib/notifications.ts`.
- `schedulePostMealReviewNotification` creates a time-interval notification with a payload containing `mealId` and route.
- Tapping a notification routes the user to `/meal-checkin` with meal context.
- `app/_layout.tsx` wires global notification handlers (`configureAndroidChannel`, listeners, and cold-start handling).

## Data + State
- Notifications are local only (no server-side push).
- Payload contains: `mealId`, `mealName`, `route`, `ts`.

## Key Files
- `app/notifications-list.tsx`
- `app/notification-settings.tsx`
- `app/onboarding-ai.tsx`
- `lib/notifications.ts`
- `app/_layout.tsx`
