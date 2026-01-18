# Gluco Project Documentation (Compressed)

## Overview
Gluco is a React Native (Expo) app for tracking meals, glucose, and activity with personalized insights. The app uses Expo Router for navigation and Supabase for auth, storage, and edge functions.

## Tech Stack
- React Native + Expo Router
- TypeScript
- Supabase (Postgres, auth, edge functions)
- React Native Reanimated, Expo Notifications, Expo Image Picker
- Apple HealthKit (iOS)

## Repo Layout
- `app/` Expo Router screens and navigation
- `components/` reusable UI (animations, cards, charts, controls, ui)
- `hooks/` shared hooks
- `context/` app providers
- `lib/` integrations and business logic
- `assets/` images and videos (grouped by type)
- `supabase/` SQL, migrations, and edge functions
- `docs/` feature docs
- `unused/` unused assets and code (parked, not referenced)

## Feature Docs
- `docs/features/auth-and-onboarding.md`
- `docs/features/meal-logging.md`
- `docs/features/glucose-logging.md`
- `docs/features/activity-logging.md`
- `docs/features/insights-and-home.md`
- `docs/features/experiments.md`
- `docs/features/notifications.md`
- `docs/features/data-sources-healthkit.md`
- `docs/features/settings-and-privacy.md`
- `docs/features/backend-and-data.md`
- `docs/features/ai-and-ml.md`
- `docs/features/meal-photo-analyzer.md`

## Configuration Notes
- Supabase URL and anon key live in `app.json` (Expo `extra`).
- HealthKit requires a dev client build on iOS.

## Quick Start
```bash
npm install
npx expo start
```
