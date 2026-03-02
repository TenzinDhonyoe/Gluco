# Gotchas & Known Issues

## HealthKit Requires Native Build

HealthKit (`react-native-health`) only works with native builds. `expo start` (Expo Go) will not load the module.

```bash
# Must use:
npx expo run:ios

# NOT:
npm start  # (Expo Go — HealthKit unavailable)
```

All HealthKit code is guarded by `Platform.OS === 'ios'` and wrapped in try/catch.

## SecureStore Size Limits

`expo-secure-store` has a ~2KB value limit on some devices. The Supabase auth token can exceed this.

**Mitigation:** `lib/supabase.ts` uses a custom storage adapter that falls back to AsyncStorage when SecureStore fails:
```typescript
storage: {
    setItem: async (key, value) => {
        try { await SecureStore.setItemAsync(key, value); }
        catch { await AsyncStorage.setItem(key, value); }
    },
    // ...
}
```

## Edge Function Cold Starts

First invocation after idle period can take 2-5 seconds. The `invokeWithRetry()` function handles this with exponential backoff (500ms → 1000ms → 2000ms).

If adding a new edge function call, always use `invokeWithRetry<T>()` rather than raw `supabase.functions.invoke()`.

## Schema Evolution / Missing Tables

The app may run against a database that hasn't applied the latest migrations. `lib/supabase.ts` has helper functions to handle this gracefully:

```typescript
isMissingTableError(error, tableName?)   // Checks PGRST205, 42P01
warnSchemaFallbackOnce(key, message)     // Logs once, returns safe defaults
```

When adding new tables, always handle the case where they don't exist yet. See `weight_logs` and `user_app_sessions` in `lib/supabase.ts` for examples.

## Fingerprint Override

`react-native-health` causes fingerprint mismatch with Expo's dependency checker. Fixed via `package.json` override:

```json
"overrides": {
    "react-native-health": {
        "@expo/fingerprint": "0.15.4"
    }
}
```

Also excluded from Expo doctor:
```json
"expo": {
    "doctor": {
        "reactNativeDirectoryCheck": {
            "exclude": ["react-native-health"]
        }
    }
}
```

## LogBox Warnings

Known harmless warnings silenced in `app/_layout.tsx`:
```typescript
LogBox.ignoreLogs([
    'View #',                    // Shadow efficiency warnings
    '(ADVICE) View #',          // Native shadow warnings
    'Image not found in storage', // Old cached images
    'shadow set but cannot calculate shadow efficiently',
]);
```

## AI Consent Gate

EVERY AI-related feature must check `profile.ai_enabled` before proceeding. If you add a new screen or feature that calls an AI edge function, add this check.

## Tracking Mode Fragmentation

Five tracking modes exist, and insights/actions must work differently for each:

```typescript
type TrackingMode =
    | 'meals_wearables'          // Default: Meals + Apple Health
    | 'meals_only'               // Meals only, no device data
    | 'manual_glucose_optional'  // Meals + optional manual readings
    | 'wearables_only'           // Legacy
    | 'glucose_tracking';        // Legacy
```

Always consider which metrics are available for each mode before generating insights or showing UI.

## supabase.ts is a Monolith (~3,500 lines)

All typed API helpers, types, and CRUD functions live in `lib/supabase.ts`. This is the data layer for the entire app. When adding new database operations:

1. Add types near the top of the file with related types
2. Add functions near related functions (grouped by table/feature)
3. Follow the existing CRUD pattern (see `supabase-patterns.md`)

## SDK Version Reality

Despite what some docs may say, the actual versions are:
- **Expo SDK:** 54 (`"expo": "~54.0.0"`)
- **React Native:** 0.81.5
- **React:** 19.1
- **TypeScript:** ~5.9.2
- **react-native-reanimated:** v4.1.x (v3 is incompatible with RN 0.81 due to Folly header changes)
- **New Architecture:** Enabled (`newArchEnabled: true` in app.json) — required by reanimated v4

### React 19 `useRef` Change

`useRef()` without an initial value now requires the type to include `undefined`, or you must pass `null`:
```typescript
// Before (React 18): const ref = useRef<View>();
// After (React 19):
const ref = useRef<View>(null);        // preferred
const ref = useRef<View | undefined>(); // also valid
```

## No Test Suite

There are no unit tests, integration tests, or E2E tests in the project. When making changes:
- Manually verify on iOS simulator
- Test edge cases in the UI
- Check console for errors/warnings

## Deno Edge Functions

Edge functions run in **Deno**, not Node.js. Key differences:
- Imports use URL-based specifiers: `import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'`
- npm packages use `npm:` prefix: `import { GoogleGenAI } from 'npm:@google/genai@1.38.0'`
- Supabase client: `import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'`
- Environment variables: `Deno.env.get('KEY')` (not `process.env`)
- TypeScript runs natively (no build step)
- Excluded from root `tsconfig.json` (`"exclude": ["supabase/functions"]`)

## New Architecture Enabled

`app.json` has `"newArchEnabled": true`. The app uses the New Architecture (JSI/Fabric). This is required by reanimated v4. When adding new native dependencies, verify they support the New Architecture.

## RevenueCat Lazy Loading

`lib/revenuecat.ts` lazy-loads the Purchases SDK to avoid `NativeEventEmitter` errors during hot reload:
```typescript
// Do NOT import at top level:
// import Purchases from 'react-native-purchases';  // BAD

// Instead, use lazy initialization:
export async function initializeRevenueCat() { ... }
```

## Typed Routes

Expo Router typed routes are enabled (`app.json` → `experiments.typedRoutes: true`). Route params are type-checked. Generated types live in `.expo/types/`.
