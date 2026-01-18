# Data Sources and HealthKit

## Purpose
Connect Apple HealthKit and use wearable data (sleep, steps, HR, HRV) to enrich insights and compute metabolic metrics.

## Entry Points
- `app/data-sources.tsx` is the user-facing entry point for requesting HealthKit permissions.
- Today tab uses `useDailyContext` and `useSleepData` to surface wearable summaries.

## Flow Summary
- HealthKit is only available on iOS; `lib/healthkit.ts` guards unsupported platforms.
- `initHealthKit` requests read permissions and caches the authorized state to avoid repeated native bridge calls.
- `useDailyContext`:
  - Loads existing `daily_context` rows first (fast path).
  - Syncs HealthKit data in the background when the screen is focused.
  - Upserts aggregated daily averages for steps, sleep, active minutes, resting HR, and HRV.
- `useSleepData` reads sleep samples and normalizes them into total minutes, nights tracked, and average per night.

## Data Model
- `daily_context` stores per-day wearable summaries with a `source` tag.

## Edge Functions
- `supabase/functions/metabolic-score/` (calculates 0-100 metabolic score)
- `supabase/functions/compute-metabolic-profile/` (rolls up longer-term baselines)

## Key Files
- `app/data-sources.tsx`
- `lib/healthkit.ts`
- `hooks/useSleepData.ts`
- `hooks/useDailyContext.ts`
- `lib/supabase.ts`
