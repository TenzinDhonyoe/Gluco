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
- **Scanning Overlay**: Animated red scan line during photo analysis (`ScanningOverlay.tsx`)
- **Analysis Results**: Full preview with macros and metabolic score (`AnalysisResultsView.tsx`)
- **Inline Views**: `FoodSearchResultsView`, `LabelScanResultsView`, `ManualAddView`

## Key Features
- **Dynamic Positioning**: Dock moves up above capture controls in photo modes, docks to bottom in search/manual modes
- **Smooth Animations**: Sliding pill indicator + vertical dock transitions
- **Smart Revert**: Photo album cancellation returns to previous mode
- **Consistent Styling**: Matches app design language (dark theme, pill shapes, shadow buttons)
- **Progressive Search**: Cache → edge function → Gemini fallback for optimal speed
- **Source Tracking**: Items marked with `source: 'manual'` or `source: 'matched'` for review UI

## Data Types

### SelectedItem Interface
```typescript
interface SelectedItem extends NormalizedFood {
    quantity: number;
    source?: 'matched' | 'manual';  // Tracks origin for review screen
}
```

### SelectedMealItem Interface (meal-scanner internal)
```typescript
interface SelectedMealItem extends NormalizedFood {
    quantity: number;
    source: 'matched' | 'manual';
    originalText?: string;  // 'photo' for AI-analyzed items
}
```

## Related Components
- `app/components/scanner/FoodSearchResultsView.tsx` - Search with cart modal, favorites/recents tabs
- `app/components/scanner/LabelScanResultsView.tsx` - OCR results with confidence display
- `app/components/scanner/ManualAddView.tsx` - Form for custom food entry
- `app/components/scanner/AnalysisResultsView.tsx` - AI analysis preview with macros
- `app/components/scanner/ScanningOverlay.tsx` - Animated scanning indicator

## Backend Functions
- `uploadMealPhoto()` - Upload image to Supabase storage
- `invokeMealPhotoAnalyze()` - AI meal analysis edge function (Vertex AI Gemini)
- `parseLabelFromImage()` - OCR nutrition label parsing
- `searchFoodsWithVariants()` - Food database search with variants
- `matchAnalyzedItems()` - Batch match AI items to database entries

## Navigation
- Back button in sub-views → Home screen (`router.dismissTo('/(tabs)')`)
- Successful save → `log-meal-review.tsx` → Home screen

## Error Handling
- AI not enabled: Shows "AI Insights Disabled" screen with link to privacy settings
- Analysis failure: Alert with retry option AND option to add items manually
- No items detected: Alert with three options:
  - "Retake Photo" - return to camera
  - "Search Database" - switch to food search mode
  - "Add Manually" - switch to manual entry mode
- API unavailable: Alert with retry option and manual entry fallback
- Label scan failure: Displays confidence-colored warnings, disables save if invalid

## AI Photo Analysis (Vertex AI Gemini)
The photo analysis uses Vertex AI Gemini to identify food items:

**Prompt Strategy:**
- Encourages identification even with imperfect images
- Returns items with confidence levels (low/medium/high)
- Only returns "failed" status if NO food is visible
- Lists each food item separately with portion estimates

**Generation Config:**
- Temperature: 0.4 (balanced between accuracy and creativity)
- Max tokens: 2048 (allows for detailed multi-item responses)
- Output format: JSON with structured nutrition data

**Fallback Behavior:**
- If AI returns empty results, user is offered alternative input methods
- Manual entry and database search are always available as fallbacks
