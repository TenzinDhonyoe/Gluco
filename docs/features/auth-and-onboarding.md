# Auth and Onboarding

## Purpose
Handle account creation, sign-in, email confirmation, and the multi-step onboarding flow that populates `profiles` and unlocks the main app.

## Entry Points
- `app/index.tsx` is the routing gate that decides whether to show auth, onboarding, or the app.
- `context/AuthContext.tsx` owns auth session state, profile loading, and auth actions.

## Flow Summary
- On app start, `AuthProvider` loads the current session and profile. It also listens for auth state changes and refreshes session on app foreground.
- `app/index.tsx` uses `user`, `profile`, and `onboarding_completed` to route:
  - Unconfirmed email -> `app/confirm-email.tsx`
  - Incomplete onboarding -> a step screen (1-5)
  - Completed onboarding -> `/(tabs)`
- Onboarding progress is stored in `AsyncStorage` under `ONBOARDING_STEP_KEY`, so users can resume where they left off.
- Onboarding step 4 writes tracking preferences (`tracking_mode`, `manual_glucose_enabled`) and requests HealthKit permission for `meals_wearables` on iOS.
- Onboarding step 5 captures coaching style and notification preferences.

## Auth Details
- Email/password auth is handled via Supabase (`signUp`, `signIn`).
- Apple Sign-In is supported on iOS (`signInWithApple`), using Supabase ID token auth.
- Password reset uses a deep link (`glucofigma://reset-password`).
- Profile rows are created by a database trigger on new signup (after email confirmation).

## Data + State
- `profiles` is the single source of truth for onboarding status and user preferences.
- Key fields used across the app: `onboarding_completed`, `tracking_mode`, `manual_glucose_enabled`, `target_min`, `target_max`, `glucose_unit`, `coaching_style`, `notifications_enabled`, `ai_enabled`, `ai_consent_at`.

## Guardrails + UX
- Auth session refresh is triggered when the app returns to the foreground (AppState listener).
- `app/index.tsx` has a safety timeout to prevent infinite loading if auth is slow.

## Key Files
- `context/AuthContext.tsx`
- `app/index.tsx`
- `app/signin.tsx`
- `app/signup.tsx`
- `app/confirm-email.tsx`
- `app/privacy-intro.tsx`
- `app/onboarding-1.tsx`
- `app/onboarding-2.tsx`
- `app/onboarding-3.tsx`
- `app/onboarding-4.tsx`
- `app/onboarding-5.tsx`
- `constants/legal.ts`
