# Meal Scanner

## Purpose
Camera-first meal logging interface providing 5 distinct input modes for capturing meals. Primary entry point for the "Log Meal" action.

## Entry Point
- `app/meal-scanner.tsx`

## Input Modes

| Mode | Icon | Description | Backend Integration |
|------|------|-------------|---------------------|
| **Upload** | `images-outline` | Pick from photo gallery | `uploadMealPhoto` → `invokeMealPhotoAnalyze` |
| **Search** | `search-outline` | Search food database | Direct selection from `searchFoodsWithVariants` |
| **Scan** | `restaurant` | Camera AI analysis | `uploadMealPhoto` → `invokeMealPhotoAnalyze` |
| **Label** | `barcode-outline` | Nutrition label OCR | `parseLabelFromImage` |
| **Manual** | `create-outline` | Direct entry form | Manual item creation |

## Flow Summary
1. User opens scanner from FAB button
2. Default mode is "Scan Food" (camera active)
3. User selects input mode from bottom dock
4. Camera modes: capture → upload → analyze → match items
5. Non-camera modes: inline overlay views for search/manual
6. All paths navigate to `log-meal-review.tsx` for final save

## UI Components
- **Option Dock**: Floating pill bar with smooth sliding animation
- **Camera View**: Full-screen with corner bracket overlay
- **Capture Controls**: Flash toggle + capture button (photo modes only)
- **Inline Views**: `FoodSearchResultsView`, `LabelScanResultsView`, `ManualAddView`

## Key Features
- **Dynamic Positioning**: Dock moves up above capture controls in photo modes, docks to bottom in search/manual modes
- **Smooth Animations**: Sliding pill indicator + vertical dock transitions
- **Smart Revert**: Photo album cancellation returns to previous mode
- **Consistent Styling**: Matches app design language (dark theme, pill shapes, shadow buttons)

## Related Components
- `app/components/scanner/FoodSearchResultsView.tsx`
- `app/components/scanner/LabelScanResultsView.tsx`
- `app/components/scanner/ManualAddView.tsx`

## Backend Functions
- `uploadMealPhoto()` - Upload image to Supabase storage
- `invokeMealPhotoAnalyze()` - AI meal analysis edge function
- `parseLabelFromImage()` - OCR nutrition label parsing
- `searchFoodsWithVariants()` - Food database search

## Navigation
- Back button in sub-views → Home screen (`router.dismissTo('/(tabs)')`)
- Successful save → `log-meal-review.tsx` → Home screen
