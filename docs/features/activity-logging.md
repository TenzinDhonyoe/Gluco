# Activity Logging

## Purpose
Capture workouts and optionally analyze their impact on glucose and energy.

## Entry Points
- `app/log-activity.tsx` for manual activity logging.
- `app/check-exercise-impact.tsx` for analysis and recommendations from free-text input.

## Flow Summary
- **Log Activity**:
  - User enters activity name, duration, intensity, and time.
  - Data is written to `activity_logs` via `createActivityLog`.
- **Check Exercise Impact**:
  - User provides a free-text description.
  - `invokeExerciseAnalyze` calls the `exercise-analyze` edge function to infer activity details, calories burned, and glucose impact.
  - The screen can route to `log-activity` with prefilled fields based on the analysis.

## Data Model
- `activity_logs` stores: `activity_name`, `duration_minutes`, `intensity`, `logged_at`.

## Edge Functions
- `supabase/functions/exercise-analyze/` (parses input text into structured exercise data + impact tips)

## Key Files
- `app/log-activity.tsx`
- `app/check-exercise-impact.tsx`
- `lib/supabase.ts`
