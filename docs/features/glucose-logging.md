# Glucose Logging

## Purpose
Record manual glucose readings, normalize units, and show trends in the Today experience.

## Entry Points
- `app/log-glucose.tsx` for manual logging and context selection.
- `app/(tabs)/log.tsx` → "Log Glucose" quick action button.
- `app/(tabs)/index.tsx` → FAB menu → "Log Glucose".
- `app/log-detail.tsx` for viewing, editing, and deleting existing glucose logs (accessed by tapping a log entry).
- Today tab (`app/(tabs)/index.tsx`) for trend display.

## Flow Summary
- User enters a glucose value plus optional context (pre-meal, post-meal, etc.).
- Input is parsed and converted to mmol/L using `lib/utils/glucoseUnits.ts`.
- Values are stored in `glucose_logs` in mmol/L regardless of user display preference.
- If the log is created from a post-meal review, `log-glucose` updates that review and routes to the notifications list instead of returning to the previous screen.

## Edit & Delete (`app/log-detail.tsx`)
Tapping a glucose log entry in the Log tab opens a detail screen with:
- **View mode**: glucose level (formatted in user's preferred unit), context badge, logged time, notes
- **Edit mode** (pencil icon): inline editing of glucose level (TextInput with decimal pad), context (dropdown), and notes
- **Delete**: confirmation alert → `deleteGlucoseLog()` → returns to log list

CRUD functions used: `getGlucoseLogById()`, `updateGlucoseLog()`, `deleteGlucoseLog()`

## Data Model
- `glucose_logs` stores:
  - `glucose_level` (mmol/L)
  - `unit` (display unit at time of entry)
  - `context` (pre_meal, post_meal, random, fasting, bedtime)
  - `logged_at` timestamp
  - `notes` (optional free text)

## Logic Notes
- Unit handling is centralized in `lib/utils/glucoseUnits.ts` with helpers for:
  - Parsing user input
  - Placeholder text by unit
  - Formatting display values
- The current unit is pulled from `profiles.glucose_unit` via `useGlucoseUnit`.
- Target range display is derived from `profiles.target_min`/`target_max` in `useTodayScreenData`.

## Key Files
- `app/log-glucose.tsx`
- `app/log-detail.tsx` (view, edit, delete glucose logs)
- `components/charts/glucose-trend-chart.tsx`
- `lib/utils/glucoseUnits.ts`
- `lib/supabase.ts` (getGlucoseLogById, updateGlucoseLog, deleteGlucoseLog)
- `hooks/useTodayScreenData.ts`
- `context/AuthContext.tsx`
