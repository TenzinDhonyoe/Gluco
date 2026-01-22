# Settings and Privacy

## Purpose
Manage profile preferences, glucose display settings, AI consent, and account-level actions such as export and deletion.

## Entry Points
- `app/settings.tsx` (settings hub)
- `app/customization.tsx` (glucose unit + target range)
- `app/account-privacy.tsx` (privacy, AI consent, export, delete)
- `app/data-sources.tsx` (HealthKit connection)
- `app/notification-settings.tsx` (notification preferences)
- `app/privacy-intro.tsx` (consent notice before onboarding)

## Flow Summary
- **Settings**
  - Provides navigation to customization, notifications, and account/privacy screens.
  - Sign-out is triggered via `AuthContext.signOut`.
- **Customization**
  - Reads the current profile and updates `glucose_unit`, `target_min`, and `target_max`.
  - Calls `refreshProfile` so the rest of the app uses the new values immediately.
- **Account & Privacy**
  - Shows user email and basic profile details.
  - Toggles AI consent (`ai_enabled`) and stores timestamp in `ai_consent_at`.
  - Supports password reset (Supabase email link).
  - Exports user data to a JSON payload (`exportUserData`) and shares it.
  - Resets personalization (`resetUserLearning`) when requested.
  - Deletes account and all data via the `delete-account` edge function, then signs out.
- **Data Sources**
  - Displays Apple HealthKit connection status.
  - "Connect to Apple Health" button triggers HealthKit permission request.
  - Shows authorization status for each data type.
- **Notification Settings**
  - Toggle for post-meal reminders.
  - Toggle for action completion reminders.
  - Toggle for experiment notifications.
  - Toggle for daily summaries.

## Data + State
- Preferences are stored in the `profiles` table.
- Account actions use Supabase edge functions for server-side cleanup.

## Edge Functions
- `supabase/functions/delete-account/`

## Key Files
- `app/settings.tsx`
- `app/customization.tsx`
- `app/account-privacy.tsx`
- `app/data-sources.tsx`
- `app/notification-settings.tsx`
- `app/privacy-intro.tsx`
- `constants/legal.ts`
- `lib/supabase.ts`
- `lib/healthkit.ts`
