# Architecture Reference

## Navigation (Expo Router)

File-based routing in `app/`. Every `.tsx` file in `app/` is auto-routed.

### Root Layout (`app/_layout.tsx`)
- Wraps entire app in `AuthProvider` > `SubscriptionProvider`
- Loads Outfit fonts, initializes RevenueCat, notifications
- `ForestGlassBackground` renders behind all screens
- `SessionTracker` upserts daily app session + schedules reminders
- Stack navigator with `headerShown: false` by default

### Tab Navigation (`app/(tabs)/_layout.tsx`)
- 3 tabs: **Home** (`index.tsx`), **Log** (`log.tsx`), **Insights** (`insights.tsx`)
- Wrapped in `TabTransitionProvider` for animated transitions
- Custom tab bar with liquid glass effect (LinearGradient + reanimated)
- Feather icons via `@expo/vector-icons`
- Haptic feedback on tab press (iOS)
- Insights tab title changes to "Actions" for behavior_v1 experience

### Auth Gate (`app/index.tsx`)
Routes based on session state (guarded by `hasNavigated` ref to prevent double-navigation):
1. No session → `signin` / `signup`
2. Session + unconfirmed email → `confirm-email`
3. Session + `onboarding_completed === false` → resume onboarding via semantic step key or profile-based fallback
4. Session + behavior_v1 experience + no framework reset → `framework-reset`
5. Default → `(tabs)` navigation

### All Screens
```
Auth:           signin, signup, confirm-email, privacy-intro
Onboarding:     onboarding-profile, onboarding-goals, onboarding-body,
                onboarding-tracking, onboarding-coaching, onboarding-ai, framework-reset
Tabs:           (tabs)/index, (tabs)/log, (tabs)/insights
Meal Pipeline:  meal-scanner, log-meal, log-meal-review, log-meal-items,
                meal-checkin, meal-photo-estimate, meal-response-check, scan-label
Logging:        log-glucose, log-activity, log-weight, log-detail, pre-meal-check
Experiments:    experiment-detail, experiment-results, experiments-list
Settings:       settings, account-privacy, customization, data-sources,
                notification-settings, notifications-list
Other:          paywall, check-exercise-impact
```

## State Management

**No external state library.** Uses React Context + custom hooks.

### Context Providers (`context/`)
| Provider | Purpose | Key State |
|----------|---------|-----------|
| `AuthContext` | Session, user, profile | `user`, `session`, `profile`, `loading` |
| `SubscriptionContext` | RevenueCat state | `isProUser`, `offerings`, `customerInfo` |
| `TabTransitionContext` | Tab animation state | `currentTab`, `currentIndex` |

### Custom Hooks (`hooks/`)
| Hook | Purpose |
|------|---------|
| `useDailyContext` | HealthKit sync → `daily_context` table |
| `useTodayScreenData` | Batched queries for Home dashboard |
| `usePersonalInsights` | AI insights with 12h TTL cache (v7) |
| `usePersonalizedTips` | Personalized tips with 6h TTL cache |
| `useBehaviorHomeData` | Home screen data for behavior_v1 |
| `useSleepData` | 90-day sleep metrics from HealthKit |
| `useWeightTrends` | Weight logs + 7-day moving average |
| `useOnboardingDraft` | Centralized onboarding draft (single AsyncStorage key, debounced) |
| `useOutfitFonts` | Loads Outfit font family (9 weights) |

## Data Flow

### Meal Logging Pipeline
```
meal-scanner.tsx (5 input modes: camera, gallery, label scan, food search, manual)
  → AI analysis via edge functions (meal-photo-analyze, label-parse)
  → app/log-meal-review.tsx (edit items, nutrition, save)
  → supabase: createMeal() + addMealItems()
  → Optional: meal-checkin.tsx (post-meal energy/fullness/cravings check-in)
```

### Food Search Pipeline (`lib/foodSearch/`)
Multi-stage with early exit:
1. **Local cache** (`cache.ts`) — instant, AsyncStorage
2. **Edge function** (`food-search`) — FatSecret + USDA
3. **Gemini rewrite** (`geminiRewrite.ts`) — query reformulation
4. **Manual entry** fallback

Modules: `orchestrator.ts` (pipeline), `normalize.ts`, `rank.ts`, `requestManager.ts` (dedup), `telemetry.ts`

### HealthKit Integration
```
lib/healthkit.ts (lazy init, cached auth, iOS-only)
  → hooks/useDailyContext.ts (fetches on screen focus)
  → upsertDailyContext() → daily_context table
```
Metrics: steps, active minutes, sleep (stages), resting HR, HRV

### Photo Analysis (`lib/photoAnalysis/`)
- `api.ts` (~7,500 lines) — photo analysis with AI, portion estimation
- `types.ts` — FoodCategory enum, PortionEstimateType, NutritionSource

## Experience Variants (`lib/experience.ts`)
Two variants: `'legacy'` | `'behavior_v1'`
- `EXPO_PUBLIC_FORCE_BEHAVIOR_V1=1` forces behavior_v1
- `EXPO_PUBLIC_SKIP_FRAMEWORK_RESET_GATE=1` skips reset gate
- `isBehaviorV1Experience()` checks variant

## Key File Sizes
| File | Lines | Note |
|------|-------|------|
| `lib/supabase.ts` | ~3,500 | All typed API helpers — monolith |
| `lib/photoAnalysis/api.ts` | ~7,500 | Photo analysis pipeline |
| `app/(tabs)/_layout.tsx` | ~375 | Custom tab bar with animations |
