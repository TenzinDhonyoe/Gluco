# Activity Logging

## Purpose
Capture workouts and optionally analyze their impact on glucose and energy.

## Entry Points
- `app/log-activity.tsx` for manual activity logging.
- `app/(tabs)/log.tsx` → "Log Activity" quick action button.
- `app/(tabs)/index.tsx` → FAB menu → "Log Activity".
- `app/log-detail.tsx` for viewing, editing, and deleting existing activity logs (accessed by tapping a log entry).
- `app/check-exercise-impact.tsx` for analysis and recommendations from free-text input.

## Flow Summary
- **Log Activity**:
  - User enters activity name, duration, intensity, and time.
  - Data is written to `activity_logs` via `createActivityLog`.
- **Check Exercise Impact**:
  - User provides a free-text description.
  - `invokeExerciseAnalyze` calls the `exercise-analyze` edge function to infer activity details, calories burned, and glucose impact.
  - The screen can route to `log-activity` with prefilled fields based on the analysis.

## Edit & Delete (`app/log-detail.tsx`)
Tapping an activity log entry in the Log tab opens a detail screen with:
- **View mode**: activity name, duration (minutes), intensity badge, logged time, notes
- **Edit mode** (pencil icon): inline editing of name (TextInput), duration (number pad), intensity (dropdown), and notes
- **Delete**: confirmation alert → `deleteActivityLog()` → returns to log list

CRUD functions used: `getActivityLogById()`, `updateActivityLog()`, `deleteActivityLog()`

## Data Model
- `activity_logs` stores: `activity_name`, `duration_minutes`, `intensity`, `logged_at`, `notes`.

## Edge Functions
- `supabase/functions/exercise-analyze/` (parses input text into structured exercise data + impact tips)

## Key Files
- `app/log-activity.tsx`
- `app/log-detail.tsx` (view, edit, delete activity logs)
- `app/check-exercise-impact.tsx`
- `lib/supabase.ts` (getActivityLogById, updateActivityLog, deleteActivityLog)
