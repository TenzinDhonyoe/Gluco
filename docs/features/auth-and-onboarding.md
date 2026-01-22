# Auth and Onboarding

## Purpose
Handle account creation, sign-in, email confirmation, and the multi-step onboarding flow that populates `profiles` and unlocks the main app.

## Entry Points
- `app/index.tsx` is the routing gate that decides whether to show auth, onboarding, or the app.
- `context/AuthContext.tsx` owns auth session state, profile loading, and auth actions.

## Auth Gate Flow (app/index.tsx)

The WelcomeScreen acts as the main routing gate:

```
App Start
    │
    ▼
┌─────────────────────────────────────┐
│  Loading state (max 5s timeout)     │
└──────────────┬──────────────────────┘
               │
               ▼
        ┌──────────────┐
        │  Has user?   │────No───▶ Show welcome screen
        └──────┬───────┘           (background video + "Let's Get Started")
               │ Yes
               ▼
        ┌──────────────────┐
        │ Email confirmed? │────No───▶ /confirm-email
        └──────┬───────────┘
               │ Yes
               ▼
        ┌─────────────────────┐
        │ Onboarding complete?│────No───▶ Resume onboarding step
        └──────┬──────────────┘
               │ Yes
               ▼
           /(tabs)
```

**Features:**
- Background video (`gluco_video.mp4`) on welcome screen
- Legal links (Terms of Service, Privacy Policy)
- 5-second safety timeout for auth loading

## Auth Screens

### 1. Privacy Intro (`/privacy-intro.tsx`)
Entry point for new users requiring legal consent before signup.

### 2. Sign Up (`/signup.tsx`)
- Email and password fields with confirmation
- Terms agreement checkbox (required)
- Apple Sign-In button (iOS only)
- Routes to `/confirm-email` after successful signup

### 3. Sign In (`/signin.tsx`)
- Email and password fields
- Password visibility toggle
- "Forgot Password" link (sends reset email via Supabase)
- Apple Sign-In button (iOS only)
- Routes to `/(tabs)` on successful login

### 4. Confirm Email (`/confirm-email.tsx`)
- Displays user's email address
- "Resend confirmation" button
- Auto-routes to onboarding after email is confirmed

## Onboarding Flow (5 Steps)

**Note:** File numbering differs from actual step order stored in AsyncStorage:

| Display Order | AsyncStorage Value | File | Purpose |
|---------------|-------------------|------|---------|
| Step 1 | "2" | `onboarding-2.tsx` | Profile (name) |
| Step 2 | "1" | `onboarding-1.tsx` | Goals selection |
| Step 3 | "3" | `onboarding-3.tsx` | Height/weight (optional) |
| Step 4 | "4" | `onboarding-4.tsx` | Tracking mode |
| Step 5 | "5" | `onboarding-5.tsx` | Coaching style + AI consent |

### Step 1: Profile Setup (`onboarding-2.tsx`)
- First name and last name input
- Drafts saved to AsyncStorage for resume capability
- Progress: 1/5

### Step 2: Wellness Goals (`onboarding-1.tsx`)
- Select 1-3 wellness goals:
  - Understand meal patterns
  - More consistent energy
  - Better sleep routine
  - Build a walking habit
  - Fibre and nutrition
  - General wellness tracking
- Drafts saved with timestamp
- Progress: 2/5

### Step 3: Physical Data (`onboarding-3.tsx`)
- Height input (cm or feet/inches)
- Weight input (kg or lbs)
- **Optional** - can be skipped
- Progress: 3/5

### Step 4: Tracking Mode (`onboarding-4.tsx`)
- Choose data tracking preference:
  - `meals_only` - Manual meal + glucose logging only
  - `wearables_only` - Apple HealthKit data (steps, sleep, activity)
  - `meals_wearables` - Combined tracking (default)
- Requests HealthKit permissions if wearables selected (iOS only)
- Progress: 4/5

### Step 5: Coaching Style (`onboarding-5.tsx`)
- Select coaching preference (motivational vs. data-focused)
- AI consent opt-in/opt-out toggle
- Notification permission request
- Sets `onboarding_completed: true` in profile
- Routes to `/(tabs)` on completion
- Progress: 5/5

## Auth Implementation Details
- Email/password auth handled via Supabase (`signUp`, `signIn`).
- Apple Sign-In supported on iOS (`signInWithApple`) using Supabase ID token auth.
- Password reset uses deep link (`glucofigma://reset-password`).
- Profile rows created by database trigger after email confirmation.

## Data + State
- `profiles` is the single source of truth for onboarding status and user preferences.
- Key fields: `onboarding_completed`, `tracking_mode`, `manual_glucose_enabled`, `target_min`, `target_max`, `glucose_unit`, `coaching_style`, `notifications_enabled`, `ai_enabled`, `ai_consent_at`.
- Onboarding progress persisted in `AsyncStorage` under `ONBOARDING_STEP_KEY`.
- Drafts (name, goals) saved to AsyncStorage with timestamps for resume capability.

## Guardrails + UX
- Auth session refresh triggered on app foreground (AppState listener).
- Safety timeout (5s) in `app/index.tsx` prevents infinite loading.
- Drafts are time-bound (24 hours) and cleared when new session starts.

## Key Files
- `context/AuthContext.tsx` - Auth state management
- `app/index.tsx` - Routing gate / welcome screen
- `app/signin.tsx` - Sign in screen
- `app/signup.tsx` - Sign up screen
- `app/confirm-email.tsx` - Email confirmation
- `app/privacy-intro.tsx` - Privacy consent
- `app/onboarding-1.tsx` - Goals (Step 2)
- `app/onboarding-2.tsx` - Profile (Step 1)
- `app/onboarding-3.tsx` - Physical data (Step 3)
- `app/onboarding-4.tsx` - Tracking mode (Step 4)
- `app/onboarding-5.tsx` - Coaching style (Step 5)
- `constants/legal.ts` - Legal URLs
