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
- `app/components/scanner/AnalysisResultsView.tsx` - AI analysis preview with macros and low-anxiety suggestions
- `app/components/scanner/ScanningOverlay.tsx` - Animated scanning indicator

---

## Analysis Results View - Personalized Suggestions

### Overview
The `AnalysisResultsView` component displays meal analysis results including detected items, macros, metabolic score, and personalized adjustment suggestions. The suggestions UI is designed to reduce user anxiety and commitment pressure.

### Low-Anxiety Suggestion Design

The suggestions section uses a "micro-commitment" approach instead of traditional checkboxes:

#### Key Design Principles
1. **Single Primary Focus**: Only ONE suggestion is prominently displayed by default (highest benefit_level)
2. **Micro-Commitment Buttons**: "I'll try this" / "Not today" instead of permanent checkboxes
3. **Outcome-Focused Language**: Shows benefits like "Helps reduce glucose spikes" instead of vague "High Impact" badges
4. **Time Context**: Displays when to act (e.g., "In the next 30 minutes")
5. **Reversible Feedback**: Selected state shows "Added. You can change this anytime" with easy undo

#### Suggestion States
```typescript
type SuggestionAction = 'none' | 'try' | 'skip';
```

| State | UI Behavior |
|-------|-------------|
| `none` | Default card with action buttons |
| `try` | Green selected state with "Added" badge and Undo button |
| `skip` | Card is hidden from view |

#### UI Components

**Default State Card:**
```
┌──────────────────────────────────────────────┐
│  IN THE NEXT 30 MINUTES                      │  ← Time context (uppercase)
│                                              │
│  Take a 10-minute walk                       │  ← Suggestion title
│  Moving after eating helps your body         │  ← Detail text
│  process glucose more effectively.           │
│                                              │
│  Helps reduce glucose spikes                 │  ← Outcome text (italic)
│                                              │
│  [I'll try this]  [Not today →]              │  ← Action buttons
└──────────────────────────────────────────────┘
```

**Selected State Card:**
```
┌──────────────────────────────────────────────┐
│  ✓  Take a 10-minute walk                    │  ← Checkmark + title
│                                              │
│  [✓ Added]  [Undo]                           │  ← Badge + undo button
│  You can change this anytime                 │  ← Reassurance text
└──────────────────────────────────────────────┘
```

#### Helper Functions

```typescript
// Maps action_type to user-friendly outcome text
function getOutcomeText(actionType: string): string {
    const outcomes: Record<string, string> = {
        'add_fiber': 'Helps slow glucose absorption',
        'add_protein': 'Supports steadier energy levels',
        'post_meal_walk': 'Helps reduce glucose spikes',
        'meal_pairing': 'Balances your meal response',
    };
    return outcomes[actionType] || 'May improve your response';
}

// Maps action_type to time context label
function getTimeContext(actionType: string): string | null {
    const contexts: Record<string, string> = {
        'post_meal_walk': 'In the next 30 minutes',
        'add_fiber': 'Before you eat',
        'add_protein': 'With this meal',
    };
    return contexts[actionType] || null;
}
```

#### Suggestion Sorting
Tips are sorted by `benefit_level` (high → medium → low) and split:
- `primaryTip`: First (highest priority) tip shown prominently
- `secondaryTips`: Remaining tips hidden behind "See more options" toggle

#### Data Flow
1. `premeal-analyze` edge function returns `adjustment_tips[]` with `benefit_level`
2. Tips are sorted by benefit level
3. Primary tip displayed prominently; secondary tips collapsible
4. User actions stored in `suggestionActions` record
5. On save, only `'try'` actions are passed to `onSave()` callback
6. Saved suggestions recorded in meal notes as "Committed to: [titles]"

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

---

## AI Photo Analysis Pipeline (Rebuilt)

### Overview

The meal photo analysis pipeline uses Vertex AI Gemini to identify food items from photos and estimate their nutritional content. The pipeline was rebuilt with a focus on **reliable food detection** for common foods.

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Client (meal-scanner.tsx)                               │
│ - Captures/selects image                                │
│ - Uploads to Supabase Storage                           │
│ - Calls edge function with signed URL                   │
└──────────────┬──────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────┐
│ meal-photo-analyze Edge Function                        │
│ (supabase/functions/meal-photo-analyze/index.ts)        │
│                                                         │
│ 1. Validate user auth + permissions                     │
│ 2. Fetch image and convert to base64                    │
│ 3. Generate Vertex AI access token (JWT)                │
│ 4. Send image to Gemini with optimized prompt           │
│ 5. Parse and normalize JSON response                    │
│ 6. Validate nutrition values against reference data     │
│ 7. Return structured AnalysisResult                     │
└──────────────┬──────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────┐
│ Client Processing                                       │
│ - Match AI items to food database                       │
│ - Display in AnalysisResultsView                        │
│ - User reviews/edits before saving                      │
└─────────────────────────────────────────────────────────┘
```

### Key Features

#### 1. Enhanced Prompt Engineering
The system prompt is optimized for reliable food detection:
- Explicit list of common foods that MUST be recognized
- Clear rules for confidence levels (high/medium/low)
- Strict guidelines for when to use "complete" vs "failed" status
- Example responses for common scenarios

#### 2. Structured Output Format
```typescript
interface AnalysisResult {
    status: 'complete' | 'failed';
    disclaimer: string;
    items: AnalyzedItem[];
    totals: {
        calories_kcal: number | null;
        carbs_g: number | null;
        protein_g: number | null;
        fat_g: number | null;
        fibre_g: number | null;
    };
    debug?: {
        model: string;
        processingTimeMs: number;
        imageSize: number;
        rawResponse?: string;
        error?: string;
    };
}

interface AnalyzedItem {
    display_name: string;
    quantity: number;
    unit: string;
    confidence: 'low' | 'medium' | 'high';
    nutrients: NutrientEstimate;
}
```

#### 3. Robust Normalization
- Handles both snake_case and camelCase property names
- Converts fractions and mixed numbers to decimals
- Calculates calories from macros if not provided
- Validates nutrient values against common food reference data

#### 4. Comprehensive Logging
Structured JSON logging for debugging:
```typescript
{
    "timestamp": "2024-01-15T10:30:00Z",
    "level": "INFO",
    "message": "Photo analysis completed",
    "status": "complete",
    "itemCount": 2,
    "processingTimeMs": 1234
}
```

#### 5. Graceful Error Handling
- Network errors: Offers retry or manual entry
- No food detected: Offers retake, search database, or manual entry
- AI failures: Returns debug info for troubleshooting

### Configuration

Environment variables required:
- `VERTEX_AI_SERVICE_ACCOUNT_JSON` - Service account credentials
- `VERTEX_AI_PROJECT_ID` - Google Cloud project ID
- `VERTEX_AI_REGION` - Vertex AI region (e.g., `us-central1`)
- `VERTEX_AI_MODEL` - Model name (default: `gemini-1.5-pro`)

Generation config:
- Temperature: 0.2 (lower for more consistent results)
- TopP: 0.8
- Max output tokens: 2048
- Response format: JSON

### Common Foods Recognized

The pipeline is optimized for reliable detection of:
- **Fruits**: apple, banana, orange, grapes, strawberry, mango
- **Vegetables**: salad, lettuce, tomato, cucumber, carrot, broccoli
- **Proteins**: chicken, beef, pork, fish, salmon, egg, tofu
- **Grains**: rice, pasta, bread, noodles, quinoa
- **Dairy**: milk, cheese, yogurt
- **Prepared foods**: sandwich, burger, pizza, soup

---

## Testing the Pipeline

### Test Suite Location
`supabase/functions/meal-photo-analyze/test-foods.ts`

### Test Cases
The test suite includes 10 common food test cases:
1. Apple - Single fruit detection
2. Banana - Single fruit detection
3. Salad - Mixed vegetable detection
4. Sandwich - Prepared food detection
5. Pasta - Grain-based meal detection
6. Rice - Grain detection
7. Chicken - Protein detection
8. Orange - Fruit detection
9. Egg - Protein detection
10. Pizza - Prepared food detection

### Success Criteria
- **Food Detection**: Correct food type identified
- **Calorie Range**: Within expected range for the food type
- **Confidence Level**: Appropriate confidence assigned
- **Target Accuracy**: 90%+ on the test suite

### Running Tests

To test the pipeline manually:

1. **Upload a test image** to Supabase storage
2. **Call the edge function** with the signed URL:
```bash
curl -X POST 'https://YOUR_PROJECT.supabase.co/functions/v1/meal-photo-analyze' \
  -H 'Authorization: Bearer YOUR_JWT' \
  -H 'Content-Type: application/json' \
  -d '{
    "user_id": "YOUR_USER_ID",
    "photo_url": "https://YOUR_SIGNED_URL"
  }'
```

3. **Verify the response**:
```json
{
  "status": "complete",
  "items": [{
    "display_name": "Apple",
    "quantity": 1,
    "unit": "piece",
    "confidence": "high",
    "nutrients": {
      "calories_kcal": 95,
      "carbs_g": 25,
      "protein_g": 0.5,
      "fat_g": 0.3,
      "fibre_g": 4.4,
      "sugar_g": 19,
      "sodium_mg": 2
    }
  }],
  "totals": {
    "calories_kcal": 95,
    "carbs_g": 25,
    "protein_g": 0.5,
    "fat_g": 0.3,
    "fibre_g": 4.4
  }
}
```

### Debugging

Enable debug output by checking the `debug` field in the response:
```json
{
  "debug": {
    "model": "gemini-1.5-pro",
    "processingTimeMs": 1234,
    "imageSize": 245678,
    "rawResponse": "..." // First 2000 chars of AI response
  }
}
```

Check Supabase function logs for detailed structured logging.

---

## Gram-Based Portion Estimation & Nutrition Scaling (meals-from-photo)

### Overview

The `meals-from-photo` edge function uses a separated-concerns pipeline: Gemini detects food items and estimates portion weight in grams, then FatSecret/USDA provides nutrition data which is scaled to the detected portion size.

### Problem Solved

Previously, Gemini returned qualitative portion descriptions ("medium bowl", "half plate") and nutrition from FatSecret/USDA was returned unscaled (per 100g or per serving). This meant a 250g portion showed the same calories as 100g.

### How It Works

```
Photo → Gemini (detect + estimate grams) → Normalize to weight_g → FatSecret/USDA (per-serving nutrition) → Scale nutrition to detected grams → Return
```

#### Step 1: Gemini Gram Estimation
- The Gemini prompt now instructs the model to ALWAYS return `estimate_type: 'weight_g'` with a numeric gram value
- Reference weights are provided in the prompt for 20+ common foods (e.g., apple ~180g, chicken breast ~150g)
- The model uses visual cues (plate, bowl, hand, utensils) to calibrate estimates

#### Step 2: Server-Side Gram Fallback
If Gemini still returns qualitative/none/null portions, a server-side safety net converts them to grams using this resolution order:
1. Already `weight_g` with a value → use as-is
2. Numeric value with convertible volume unit (cup→240g, tbsp→15g, etc.) → convert
3. Fuzzy match against `PORTION_REFERENCES` (70+ food entries) → use `typical_g`
4. `CATEGORY_DEFAULT_WEIGHTS` fallback (e.g., fruit→150g, protein→150g, grain→180g)

This runs in both `normalizeDetectionResult()` (gemini-structured.ts) and `detectionToLookupItem()` (meals-from-photo/index.ts).

#### Step 3: Nutrition Scaling
After FatSecret/USDA returns per-serving nutrition:
1. `resolveServingToGrams()` converts the serving size to grams (handles g, cup, tbsp, oz, etc.)
2. `scaleNutritionToPortionSize()` computes `multiplier = detectedGrams / servingGrams` (clamped [0.1, 10])
3. All nutrition values are scaled by the multiplier
4. `portion.value` is set to `1` and `portion.unit` to `'serving'` so the client's existing `nutrition * quantity` math stays correct
5. `serving_description` is updated to show the scaling (e.g., "180g (scaled from per 100g)")

### Example

| Step | Apple (180g detected) |
|------|----------------------|
| Gemini | `{ estimate_type: 'weight_g', value: 180, unit: 'g' }` |
| FatSecret | 52 cal per 100g serving |
| Multiplier | 180 / 100 = 1.8 |
| Scaled calories | 52 * 1.8 = 94 cal |
| Final portion | `{ value: 1, unit: 'serving' }` |

### Key Files

| File | Role |
|------|------|
| `supabase/functions/_shared/portion-estimator.ts` | `convertToGrams()`, `VOLUME_TO_GRAMS`, `CATEGORY_DEFAULT_WEIGHTS`, `PORTION_REFERENCES` |
| `supabase/functions/_shared/gemini-structured.ts` | Gram-first prompt, `normalizeDetectionResult()` with gram fallback |
| `supabase/functions/_shared/nutrition-lookup.ts` | `resolveServingToGrams()`, `scaleNutritionToPortionSize()`, applied in all lookup paths |
| `supabase/functions/meals-from-photo/index.ts` | `detectionToLookupItem()` safety net for qualitative portions |

### Followup Flow Compatibility

The Small/Medium/Large followup multipliers (0.7/1.0/1.5) in `applyFollowupResponses()` work correctly with the new scaling since they multiply the already-scaled nutrition values.

---

## Safety Features

### Medical Term Filtering
The following terms are filtered from food names:
- Medical conditions: diabetes, prediabetes, hypoglycemia, hyperglycemia
- Medical actions: treat, prevent, diagnose, cure, heal
- Clinical terms: insulin, blood sugar, therapy, treatment

### Disclaimer
All results include: "Estimates from a photo only. Edit to improve accuracy. Not medical advice."

### Fallback Behavior
- If AI returns empty results, user is offered alternative input methods
- Manual entry and database search are always available as fallbacks
