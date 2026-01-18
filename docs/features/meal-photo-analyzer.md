# Meal Photo Analyzer

## Purpose
Analyze a meal photo and estimate items + macros, then let the user edit the results before saving to the meal.

## Entry Points
- `app/log-meal.tsx` captures the photo + optional name/description and triggers analysis.
- `app/log-meal-review.tsx` lets users review items, edit quantities, and save.
- `app/meal-photo-estimate.tsx` is a legacy editor screen (not used in the primary flow).

## Flow Summary
1) **Capture**: User adds a photo in `app/log-meal.tsx`, optionally adds a name/description, and sets a meal time.
2) **Analyze**: `invokeMealPhotoAnalyze` calls the `meal-photo-analyze` edge function with a signed URL (name/notes are passed as context).
3) **Review**: Results are mapped into meal items and sent to `app/log-meal-review.tsx`.
4) **Edit**: Users adjust quantities, replace items, or add items manually.
5) **Persist**: `app/log-meal-review.tsx` creates the meal and saves items via `addMealItems`.

## Data Model
- `meals` stores `photo_path` and `logged_at` (meal time).
- `meal_photo_analysis` stores analysis status, result JSON, and model (only when a `meal_id` is provided).
- `meal_items` stores the finalized items + nutrients.

## Edge Function
- `supabase/functions/meal-photo-analyze/`
  - Uses Vertex AI Gemini (default model `gemini-1.5-pro`).
  - Requires `VERTEX_AI_PROJECT_ID`, `VERTEX_AI_REGION`, `VERTEX_AI_SERVICE_ACCOUNT_JSON` secrets.
  - Enforces AI consent via `requireAiEnabled`.
  - Outputs JSON with `items[]` and `totals`.

## Notes
- AI output is **estimate-only**; UI encourages edits.
- Meal time is captured in `meals.logged_at` for insights and trend analysis.
- The analyzer does **not** require meal time, but accepts it for context.

## Key Files
- `app/log-meal.tsx`
- `app/log-meal-review.tsx`
- `app/meal-photo-estimate.tsx`
- `lib/supabase.ts` (`uploadMealPhoto`, `invokeMealPhotoAnalyze`)
- `supabase/functions/meal-photo-analyze/index.ts`
