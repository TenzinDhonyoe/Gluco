# Meal Logging

## Purpose
Capture meals through text, search, label scans, or photos. Then guide the user through pre-meal checks, post-meal check-ins, and optional reviews.

## Entry Points
- `app/meal-scanner.tsx` (camera-first meal logging with multiple input options)
- `app/log-meal.tsx` (text + photo logging fallback)
- `app/log-meal-items.tsx` (search, favorites, recents, manual entry - add items to existing meal)
- `app/log-meal-review.tsx` (final review + save to backend)

## Flow Summary

### Camera-first logging (`app/meal-scanner.tsx`)
Primary entry point from the FAB button with 5 input modes:

1. **Scan Food** (camera AI):
   - Capture photo → upload → AI analysis → match to database
   - Shows `AnalysisResultsView` with detected items and macros
   - User can "Review" (edit items) or "Save" (quick save)

2. **Nutrition Label** (OCR):
   - Capture label photo with targeting frame
   - `parseLabelFromImage` extracts nutrition facts
   - Shows `LabelScanResultsView` with confidence indicator
   - Warns if data extraction is incomplete

3. **Photo Album** (gallery):
   - Pick image from photo library
   - Same flow as Scan Food after selection
   - Cancellation reverts to previous mode

4. **Food Search** (database):
   - Progressive search: cache → edge → Gemini fallback
   - `FoodSearchResultsView` with tabs: All / Recents / Favorites
   - Cart modal for quantity adjustment
   - Items auto-added to recents on selection

5. **Manual Add** (direct entry):
   - Form for food name + macros (carbs, protein, fat, fiber)
   - Auto-calculates calories if not provided
   - Optional photo attachment

All paths converge at `log-meal-review.tsx` for final save.

### Review and Save (`app/log-meal-review.tsx`)
- Displays items grouped by source:
  - "Needs Review" section for manual entries
  - Regular items section for matched/AI items
- Quantity adjustment with smart unit options
- Editable meal name (auto-generated from items)
- Meal time picker with wheel selector
- Optional pre-meal glucose entry
- Macro summary bubble (expandable)
- Pre-meal check button (AI insights)
- Save: `createMeal()` + `addMealItems()` + optional `createGlucoseLog()`
- Post-meal notification scheduled 2 hours after meal time

### Text-first meal logging (`app/log-meal.tsx`)
Fallback flow for text-based meal descriptions:
- `parseMealDescription` extracts quantities/units and item names
- Each item matched via `searchFoodsWithVariants`
- Unmatched items created as manual entries
- Drafts persisted in `AsyncStorage`

## Data Model
- `meals`: meal metadata and timestamps
- `meal_items`: normalized foods + nutrient payloads
- `premeal_checks`: stored pre-meal analysis results
- `post_meal_reviews`: review feedback, optional glucose data
- `meal_checkins`: quick check-in results
- `favorite_foods`, `recent_foods`: food shortcuts for search

## Item Source Tracking
Items are tracked with a `source` field to differentiate origin:
- `'matched'`: AI-analyzed or database-matched items
- `'manual'`: User-created manual entries

Manual items display a "Needs Review" badge and are grouped separately in the review screen to encourage verification.

## Logic Notes
- Drafts are time-bound (24 hours) and cleared when a new session starts
- Text parsing supports mixed numbers, fractions, and unit aliases (cups, tbsp, g, etc.)
- Food search uses progressive stages: cache (4hr TTL) → edge search → Gemini fallback
- Label scan and meal photo estimate are AI-gated; if AI is disabled, the UI exits with a clear error state
- Concurrent item matching: MAX_MATCH_CONCURRENCY = 4 for batch AI matching
- Search debounce: 250ms delay before triggering search

## Edge Functions
- `supabase/functions/label-parse/` - OCR nutrition label parsing
- `supabase/functions/food-search/` - Database food search
- `supabase/functions/food-barcode/` - Barcode lookup
- `supabase/functions/food-query-rewrite/` - Gemini query enhancement
- `supabase/functions/food-details/` - Full food details
- `supabase/functions/meal-photo-analyze/` - Vertex AI meal analysis
- `supabase/functions/premeal-analyze/` - Pre-meal check analysis

## Key Files
- `app/meal-scanner.tsx` (primary camera-first entry, 1030 lines)
- `app/components/scanner/FoodSearchResultsView.tsx` (search with cart modal)
- `app/components/scanner/LabelScanResultsView.tsx` (OCR results display)
- `app/components/scanner/ManualAddView.tsx` (manual entry form)
- `app/components/scanner/AnalysisResultsView.tsx` (AI analysis preview)
- `app/components/scanner/ScanningOverlay.tsx` (animated scan indicator)
- `app/log-meal.tsx` (text fallback)
- `app/log-meal-review.tsx` (final review/save, 1415 lines)
- `app/log-meal-items.tsx` (add items screen)
- `lib/foodSearch/` (search orchestration, caching, ranking)
- `lib/labelScan.ts` (label parsing utilities)
- `lib/supabase.ts` (API calls: createMeal, addMealItems)
