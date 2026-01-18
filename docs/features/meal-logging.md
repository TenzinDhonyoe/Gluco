# Meal Logging

## Purpose
Capture meals through text, search, label scans, or photos. Then guide the user through pre-meal checks, post-meal check-ins, and optional reviews.

## Entry Points
- `app/meal-scanner.tsx` (camera-first meal logging with multiple input options)
- `app/log-meal.tsx` (text + photo logging fallback)
- `app/log-meal-items.tsx` (search, favorites, recents, manual entry - legacy)
- `app/log-meal-review.tsx` (final review + save to backend)

## Flow Summary
- **Camera-first logging** (`app/meal-scanner.tsx`):
  - Primary entry point from the FAB button.
  - 5 input modes: Scan Food (camera AI), Label Scan (nutrition label OCR), Photo Album (gallery pick), Food Search (database), Manual Add (direct entry).
  - Camera modes upload photos via `uploadMealPhoto` and analyze via `invokeMealPhotoAnalyze`.
  - Label mode uses `parseLabelFromImage` for OCR.
  - All paths converge at `log-meal-review.tsx` for final save.
- **Text-first meal logging** (`app/log-meal.tsx`):
  - Fallback flow for text-based meal descriptions.
  - `parseMealDescription` extracts quantities/units and item names.
  - Each item is matched to a food entry via `searchFoodsWithVariants`. If no match, a manual item is created.
  - Drafts are persisted in `AsyncStorage`.
- **Review and Save** (`app/log-meal-review.tsx`):
  - Displays matched items with quantity/unit editing.
  - Saves via `createMeal()` and `addMealItems()` to Supabase.
  - Optionally logs glucose via `createGlucoseLog()`.
  - Schedules post-meal reminder notification.

## Data Model
- `meals`: meal metadata and timestamps
- `meal_items`: normalized foods + nutrient payloads
- `premeal_checks`: stored pre-meal analysis results
- `post_meal_reviews`: review feedback, optional glucose data
- `meal_checkins`: quick check-in results
- `favorite_foods`, `recent_foods`: food shortcuts for search

## Logic Notes
- Drafts are time-bound (24 hours) and cleared when a new session starts.
- Text parsing supports mixed numbers, fractions, and unit aliases (cups, tbsp, g, etc.).
- Food search uses progressive stages: cache -> edge search -> Gemini fallback.
- Label scan and meal photo estimate are AI-gated; if AI is disabled, the UI exits with a clear error state.

## Edge Functions
- `supabase/functions/label-parse/`
- `supabase/functions/food-search/`
- `supabase/functions/food-barcode/`
- `supabase/functions/food-query-rewrite/`
- `supabase/functions/food-details/`
- `supabase/functions/meal-photo-analyze/`
- `supabase/functions/premeal-analyze/`

## Key Files
- `app/meal-scanner.tsx` (primary camera-first entry)
- `app/components/scanner/FoodSearchResultsView.tsx` (inline food search)
- `app/components/scanner/LabelScanResultsView.tsx` (inline label results)
- `app/components/scanner/ManualAddView.tsx` (inline manual entry)
- `app/log-meal.tsx` (text fallback)
- `app/log-meal-review.tsx` (final review/save)
- `lib/foodSearch/`
- `lib/labelScan.ts`
- `lib/supabase.ts` (API calls: createMeal, addMealItems)
