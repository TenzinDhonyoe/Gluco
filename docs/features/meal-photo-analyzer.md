# Meal Photo Analyzer

## Purpose
Analyze a meal photo and estimate items + macros, then let the user edit the results before saving to the meal.

## Entry Points
- `app/meal-scanner.tsx` (primary) - camera-first flow with instant analysis
- `app/log-meal.tsx` captures the photo + optional name/description and triggers analysis
- `app/log-meal-review.tsx` lets users review items, edit quantities, and save

## Flow Summary
1) **Capture**: User takes/selects a photo in `app/meal-scanner.tsx` or `app/log-meal.tsx`
2) **Upload**: Photo is uploaded to Supabase Storage via `uploadMealPhoto()`
3) **Analyze**: `invokeMealPhotoAnalyze` calls the edge function with a signed URL
4) **Match**: AI-identified items are matched to database foods via `matchAnalyzedItems()`
5) **Review**: Results shown in `AnalysisResultsView` or sent to `log-meal-review.tsx`
6) **Edit**: Users adjust quantities, replace items, or add items manually
7) **Persist**: Final save via `createMeal()` and `addMealItems()`

## Data Model
- `meals` stores `photo_path` and `logged_at` (meal time)
- `meal_photo_analysis` stores analysis status, result JSON, and model (when `meal_id` provided)
- `meal_items` stores the finalized items + nutrients

## Edge Function
- `supabase/functions/meal-photo-analyze/`
  - Uses Vertex AI Gemini (default model `gemini-1.5-pro`)
  - Requires `VERTEX_AI_PROJECT_ID`, `VERTEX_AI_REGION`, `VERTEX_AI_SERVICE_ACCOUNT_JSON` secrets
  - Food scanning available to all users (no AI consent required)
  - Outputs JSON with `items[]` and `totals`

### Prompt Strategy
The AI prompt is designed to maximize food detection:
- Encourages identification even with imperfect images
- Lists each food item separately (e.g., "Rice" and "Chicken" not "Rice with Chicken")
- Provides confidence levels (low/medium/high) per item
- Only returns "failed" if NO food is visible at all

### Generation Config
- Temperature: 0.4 (balanced accuracy and flexibility)
- Top-P: 0.9 (diverse vocabulary for food names)
- Max tokens: 2048 (supports detailed multi-item responses)
- Response format: JSON with structured nutrition data

## Error Handling
- **Upload failure**: Clear error message with retry option
- **API unavailable**: Offers retry or manual entry fallback
- **No items detected**: Three options: retake photo, search database, or add manually
- **Analysis error**: Detailed logging for debugging, graceful fallback to manual

## Notes
- AI output is **estimate-only**; UI encourages edits
- Items matched to database get real nutrition data; unmatched use AI estimates
- Meal time is captured for insights and trend analysis
- Comprehensive logging added for debugging analysis issues
- **New pipeline (`meals-from-photo`)**: Uses separated concerns (Gemini for detection + gram estimation, FatSecret/USDA for nutrition lookup, server-side scaling to detected portion). Nutrition values returned from the API represent the full detected portion. See `docs/features/meal-scanner.md` for full architecture.

## Key Files
- `app/meal-scanner.tsx` (primary camera flow)
- `app/log-meal.tsx` (text-first flow)
- `app/log-meal-review.tsx` (final review/save)
- `app/components/scanner/AnalysisResultsView.tsx` (results preview)
- `lib/supabase.ts` (`uploadMealPhoto`, `invokeMealPhotoAnalyze`, `ensureSignedMealPhotoUrl`)
- `supabase/functions/meal-photo-analyze/index.ts`
