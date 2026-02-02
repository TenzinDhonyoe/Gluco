# Backend and Data

## Purpose
Describe how the app uses Supabase for auth, storage, SQL schema, and edge functions.

## Supabase Architecture
- **Client**: `lib/supabase.ts` wraps the Supabase JS client and exposes typed helpers.
- **Schema**: baseline SQL in `supabase/*.sql` and incremental changes in `supabase/migrations/`.
- **Edge Functions**: `supabase/functions/` hosts server-side logic (AI calls, analysis, cleanup).
- **Storage**: meal photos are stored in the `meal-photos` bucket.

## Core Tables (Primary)
- `profiles` (user preferences + onboarding state)
- `meals`, `meal_items`
- `premeal_checks`, `post_meal_reviews`, `meal_checkins`
- `glucose_logs`
- `activity_logs`
- `favorite_foods`, `recent_foods`, `foods_cache`
- `daily_context` (wearable summaries)
- Experiments: `experiment_templates`, `experiment_variants`, `user_experiments`, `user_experiment_events`, `user_experiment_analysis`

## Edge Functions (Selected)
- **Insights + Tips**: `personal-insights`, `personalized-tips`
- **Meal analysis**: `premeal-analyze`, `meal-photo-analyze`, `label-parse`
- **Food search**: `food-search`, `food-barcode`, `food-details`, `food-query-rewrite`
- **Experiments**: `experiments-suggest`, `experiments-evaluate`
- **Wearables**: `metabolic-score`, `compute-metabolic-profile`
- **Account**: `delete-account`

## CRUD Functions (`lib/supabase.ts`)
All log types support full create, read, update, and delete via typed helper functions. Every query scopes by `user_id` to enforce RLS.

| Table | Create | Read | Update | Delete |
|-------|--------|------|--------|--------|
| `meals` | `createMeal()` | `getMeals()`, `getMealById()` | `updateMeal()` | `deleteMeal()` |
| `meal_items` | `addMealItems()` | `getMealItems()` | — | (cascade via meal) |
| `glucose_logs` | `createGlucoseLog()` | `getGlucoseLogs()`, `getGlucoseLogById()` | `updateGlucoseLog()` | `deleteGlucoseLog()` |
| `activity_logs` | `createActivityLog()` | `getActivityLogs()`, `getActivityLogById()` | `updateActivityLog()` | `deleteActivityLog()` |

Update functions accept `Partial<Pick<...>>` of editable fields and auto-set `updated_at`. Delete functions return a boolean success flag.

## Access Patterns
- Most UI data flows through `lib/supabase.ts` helper functions (CRUD + edge function invocations).
- Hooks (`hooks/`) batch or cache queries to reduce round trips.
- RLS is enabled for user-owned tables; service-role functions bypass RLS when needed.
- The log detail screen (`app/log-detail.tsx`) uses getById + update/delete for inline editing of any log type.

## Key Files
- `lib/supabase.ts`
- `supabase/migrations/`
- `supabase/functions/`
