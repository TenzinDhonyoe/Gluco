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

## Onboarding Flow (6 Steps)

Semantic route names with matching AsyncStorage step keys:

| Step | AsyncStorage Key | File | Collects |
|------|-----------------|------|----------|
| 1 | `"profile"` | `onboarding-profile.tsx` | first_name, last_name, birth_date, biological_sex, region |
| 2 | `"goals"` | `onboarding-goals.tsx` | goals[] (max 3), readiness_level |
| 3 | `"body"` | `onboarding-body.tsx` | height_cm, weight_kg, dietary_preferences[], cultural_food_context (all optional) |
| 4 | `"tracking"` | `onboarding-tracking.tsx` | tracking_mode, prompt_window + HealthKit permission |
| 5 | `"coaching"` | `onboarding-coaching.tsx` | coaching_style, com_b_barrier, if_then_plan |
| 6 | `"ai"` | `onboarding-ai.tsx` | ai_enabled, ai_consent_at; sets onboarding_completed=true |

Legacy numeric step keys (`"1"` through `"5"`) are auto-migrated to the new semantic keys in `app/index.tsx`.

### Shared Infrastructure
- **`useOnboardingDraft`** (`hooks/useOnboardingDraft.ts`): Centralized draft hook with a single AsyncStorage key (`onboarding_draft_v2`), in-memory state, debounced saves, and AppState background persistence. Replaces per-screen draft keys.
- **`OnboardingHeader`** (`components/onboarding/OnboardingHeader.tsx`): Shared back button + 6 progress bars.
- All picker modals use `react-native-reanimated` shared values instead of RN `Animated.Value`.

### Step 1: Profile Setup (`onboarding-profile.tsx`)
- First name and last name (required), birth date, biological sex, region (optional)
- Reanimated picker animations for date, sex, and region pickers
- Progress: 1/6

### Step 2: Wellness Goals (`onboarding-goals.tsx`)
- Select 1-3 wellness goals:
  - Understand meal patterns
  - More consistent energy
  - Better sleep routine
  - Build a walking habit
  - Fibre and nutrition
  - General wellness tracking
- Readiness level selection (low/medium/high)
- Progress: 2/6

### Step 3: Body & Dietary Info (`onboarding-body.tsx`)
- Height input (cm or feet/inches)
- Weight input (kg or lbs)
- **Dietary Preferences** (multi-select chips): Vegetarian, Vegan, Pescatarian, Gluten-free, Dairy-free, Halal, Kosher, Low-carb, No restrictions
- **Cultural Food Context** (single-select chips): South Asian, East Asian, Southeast Asian, Mediterranean, Latin American, Middle Eastern, African, Caribbean, European, North American, Other (with free-text input)
- **Optional** - can be skipped
- Progress: 3/6

### Step 4: Tracking Mode (`onboarding-tracking.tsx`)
- Choose data tracking preference:
  - `meals_only` - Manual meal logging only
  - `meals_wearables` - Combined tracking with Apple Health (default on iOS)
  - `manual_glucose_optional` - Include optional personal readings
- Preferred daily nudge window (morning/midday/evening)
- Requests HealthKit permissions if wearables selected (iOS only)
- Progress: 4/6

### Step 5: Coaching Style (`onboarding-coaching.tsx`)
- Select coaching intensity (light/balanced/structured)
- COM-B barrier selection (capability/opportunity/motivation/unsure)
- Optional if-then plan text input
- Progress: 5/6

### Step 6: AI Personalization (`onboarding-ai.tsx`)
- Explains AI features (meal photo analysis, personalized tips, weekly summaries)
- AI consent toggle switch
- Disclaimer component
- Sets `onboarding_completed: true` in profile
- Routes to `/(tabs)` or `/paywall` on completion
- Progress: 6/6

## Auth Implementation Details
- Email/password auth handled via Supabase (`signUp`, `signIn`).
- Apple Sign-In supported on iOS (`signInWithApple`) using Supabase ID token auth.
- Password reset uses deep link (`glucofigma://reset-password`).
- Profile rows created by database trigger after email confirmation.

## Data + State
- `profiles` is the single source of truth for onboarding status and user preferences.
- Key fields: `onboarding_completed`, `tracking_mode`, `manual_glucose_enabled`, `target_min`, `target_max`, `glucose_unit`, `coaching_style`, `notifications_enabled`, `ai_enabled`, `ai_consent_at`, `dietary_preferences`, `cultural_food_context`.
- Onboarding progress persisted in `AsyncStorage` under `ONBOARDING_STEP_KEY` using semantic keys (`"profile"`, `"goals"`, `"body"`, `"tracking"`, `"coaching"`, `"ai"`).
- All draft data centralized in a single `onboarding_draft_v2` AsyncStorage key via `useOnboardingDraft` hook.
- Each screen saves to Supabase on "Continue" (per-screen, not batched) for crash recovery.

## Guardrails + UX
- Auth session refresh triggered on app foreground (AppState listener).
- Safety timeout (5s) in `app/index.tsx` prevents infinite loading (separate useEffect from auth check to avoid race conditions).
- `hasNavigated` ref in `app/index.tsx` gates all `router.replace()` calls to prevent double-navigation.
- Legacy numeric step keys (`"1"` through `"5"`) auto-migrated to semantic keys on read.

## Key Files
- `context/AuthContext.tsx` - Auth state management
- `app/index.tsx` - Routing gate / welcome screen
- `app/signin.tsx` - Sign in screen
- `app/signup.tsx` - Sign up screen
- `app/confirm-email.tsx` - Email confirmation
- `app/privacy-intro.tsx` - Privacy consent
- `app/onboarding-profile.tsx` - Profile (Step 1)
- `app/onboarding-goals.tsx` - Goals (Step 2)
- `app/onboarding-body.tsx` - Body & dietary info (Step 3)
- `app/onboarding-tracking.tsx` - Tracking mode (Step 4)
- `app/onboarding-coaching.tsx` - Coaching style (Step 5)
- `app/onboarding-ai.tsx` - AI consent (Step 6)
- `hooks/useOnboardingDraft.ts` - Centralized draft management
- `components/onboarding/OnboardingHeader.tsx` - Shared onboarding header
- `constants/legal.ts` - Legal URLs
