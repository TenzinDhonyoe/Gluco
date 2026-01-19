# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Gluco is a React Native health and wellness tracking app built with Expo (SDK 54), specializing in meal logging, glucose tracking, activity monitoring, and personalized insights. It uses Supabase for backend, Apple HealthKit for wearable data, and Vertex AI Gemini for AI-powered features.

## Build & Development Commands

```bash
npm start              # Start Expo dev server
npm run ios            # Build & run iOS simulator
npm run android        # Build & run Android emulator
npm run lint           # Run ESLint
npx expo run:ios       # Native build (required for HealthKit)
```

**EAS Build:**
```bash
eas build --platform ios --profile development   # Dev client
eas build --platform ios --profile preview       # Preview build
eas build --platform ios --profile production    # App Store release
```

## Architecture

### Navigation & Routing
- **Expo Router** with file-based routing in `app/`
- Tab navigation in `app/(tabs)/` for main screens (Today, Insights, Log)
- Auth gate in `app/index.tsx` routes based on session state

### State Management
- **AuthContext** (`context/AuthContext.tsx`): Session, profile, auth methods
- **SubscriptionContext**: RevenueCat subscription state
- Custom hooks in `hooks/` for data fetching with caching

### Backend (Supabase)
- **Client & Helpers**: `lib/supabase.ts` contains all typed API helpers
- **Edge Functions**: `supabase/functions/` (20+ functions for AI analysis, search, scoring)
- **Key tables**: `profiles`, `meals`, `meal_items`, `glucose_logs`, `activity_logs`, `daily_context`
- RLS enabled on user-owned tables

### Meal Logging Pipeline
```
app/meal-scanner.tsx (5 input modes: camera, gallery, label scan, food search, manual)
  → AI analysis via edge functions (meal-photo-analyze, label-parse)
  → app/log-meal-review.tsx (edit & save)
  → supabase: createMeal() + addMealItems()
```

### Food Search
Multi-stage pipeline in `lib/foodSearch/`:
1. Local cache → 2. Edge function search → 3. Gemini query rewrite → 4. Manual entry fallback

### HealthKit Integration
- `lib/healthkit.ts`: Lazy init with cached auth
- `hooks/useDailyContext.ts`: Syncs on screen focus, stores to `daily_context` table
- Requires native build (`npx expo run:ios`)

## Key Directories

- `app/` - Screens and navigation (Expo Router)
- `app/components/` - Screen-specific components
- `components/` - Reusable UI components
- `lib/` - Business logic, integrations, utilities
- `hooks/` - Custom React hooks
- `context/` - React Context providers
- `constants/` - Colors, theme, config
- `supabase/functions/` - Edge functions
- `docs/features/` - Feature documentation (13 files)

## Important Patterns

### AI Safety
- AI consent tracked in `profiles.ai_enabled`
- Safe language filtering in `lib/insights.ts` and `supabase/functions/_shared/safety.ts`
- Metabolic Score is deterministic math (not ML): RHR 35% + Steps 30% + Sleep 15% + HRV 10% + Context 10%

### Styling
- Use React Native `StyleSheet`
- Import colors from `constants/Colors.ts`
- Animations via `react-native-reanimated`

### Adding Features
- **New screen**: Create `.tsx` in `app/` (auto-routed)
- **New hook**: Add to `hooks/` following existing patterns
- **New edge function**: Add directory in `supabase/functions/` with `index.ts`

## Feature Documentation

Detailed documentation in `/docs/features/`:
- `auth-and-onboarding.md` - Auth flow, 5-step onboarding
- `meal-logging.md`, `meal-scanner.md` - Meal capture paths
- `ai-and-ml.md` - AI safety, metabolic scoring (important for AI context)
- `backend-and-data.md` - Supabase architecture, tables, edge functions
- `experiments.md` - A/B experiment framework

## Tech Stack

- React Native 0.81.5 + React 19.1
- Expo SDK 54 with typed routes and React Compiler
- TypeScript (strict mode)
- Supabase (PostgreSQL, Auth, Storage, Edge Functions)
- Vertex AI Gemini (meal photo analysis, label OCR)
- Apple HealthKit via react-native-health
- RevenueCat for subscriptions
