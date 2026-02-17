# AI Integration Reference

## AI SDK

**Google Gen AI SDK** (`@google/genai` v1.38+) — used both client-side and in Deno edge functions.

Edge functions use: `import { GoogleGenAI } from 'npm:@google/genai@1.38.0';`
Client uses: `import { GoogleGenAI } from '@google/genai';`

Model: Gemini (via Google AI, not Vertex AI directly despite earlier naming).

## AI Consent Gate

Before ANY AI feature, check:
```typescript
if (!profile?.ai_enabled) {
    // Show consent prompt or skip AI feature
    return;
}
```

Fields:
- `profiles.ai_enabled` — boolean
- `profiles.ai_consent_at` — ISO timestamp of consent

## Edge Functions Using AI

| Function | Purpose | Model Usage |
|----------|---------|-------------|
| `meal-photo-analyze` | Analyze meal photos | Image + text → structured JSON |
| `meals-from-photo` | Extract meals from photos | Image analysis |
| `label-parse` | OCR nutrition labels | Image → structured nutrients |
| `food-search` | Food database search | FatSecret + USDA |
| `food-query-rewrite` | Improve search queries | Text → rewritten query |
| `premeal-analyze` | Pre-meal assessment | Context → suggestions |
| `exercise-analyze` | Activity analysis | Activity data → insights |
| `personal-insights` | Generate insights | User data → PersonalInsight[] |
| `personalized-tips` | Wellness tips | Profile → tips |
| `experiments-suggest` | Suggest experiments | User patterns → hypotheses |
| `experiments-evaluate` | Analyze experiment results | Experiment data → conclusions |
| `weekly-meal-comparison` | Compare meal patterns | Meal data → trends |

## Meal Photo Analysis Pipeline

### Flow
```
1. User takes/selects photo
2. Photo uploaded to Supabase Storage (meal-photos bucket)
3. Client calls invokeMealPhotoAnalyze() → edge function
4. Edge function:
   a. Fetches photo from storage URL
   b. Sends to Gemini with structured prompt
   c. Parses structured JSON response
   d. Validates nutrients (enforceNutrientLimits)
   e. Stores result in photo_analysis_cache
   f. Returns AnalyzedItem[] + totals
5. Client shows results in log-meal-review.tsx
```

### Structured Output Pattern

Edge functions request structured JSON from Gemini:

```typescript
const genAI = new GoogleGenAI({ apiKey: Deno.env.get('GOOGLE_AI_API_KEY') });

const result = await genAI.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [{ role: 'user', parts: [imagePart, { text: prompt }] }],
    config: {
        responseMimeType: 'application/json',
        // Structured schema for reliable parsing
    },
});
```

### Response Types

```typescript
interface AnalyzedItem {
    display_name: string;
    quantity: number;
    unit: string;
    confidence: 'low' | 'medium' | 'high';
    nutrients: NutrientEstimate;
}

interface NutrientEstimate {
    calories_kcal: number | null;
    carbs_g: number | null;
    protein_g: number | null;
    fat_g: number | null;
    fibre_g: number | null;
    sugar_g: number | null;
    sodium_mg: number | null;
}
```

## Food Search Pipeline

### Client-Side (`lib/foodSearch/`)
```
orchestrator.ts → cache.ts → edge function → geminiRewrite.ts → manual fallback
```

### Modules
- `orchestrator.ts` — Pipeline controller with early exit
- `cache.ts` — AsyncStorage-backed local cache
- `geminiRewrite.ts` — Query rewrite for better search results
- `normalize.ts` — Normalize food names, units, portions
- `rank.ts` — Score and rank search results
- `requestManager.ts` — Dedup concurrent identical requests
- `telemetry.ts` — Track search metrics

## Label Parsing (`label-parse` edge function)

OCR pipeline:
1. Photo of nutrition label → Gemini vision
2. Extract: serving size, calories, macros, micronutrients
3. Validate against known ranges (`nutrition-validation.ts`)
4. Return structured `NutrientEstimate`

## Insights Generation

### Rules-Based (`lib/insights.ts`)
- Local, deterministic insight generation
- Uses `InsightData` aggregates (meals, activity, sleep, glucose, weight)
- Adapts to `TrackingMode` and `ExperienceVariant`
- All text passes through `containsBannedTerms()` / `sanitizeInsight()`

### AI-Powered (`personal-insights` edge function)
- Called via `usePersonalInsights` hook
- 12-hour TTL cache (version v7)
- Falls back to rules-based on failure
- Dismissal tracked per-insight

## Safety Checklist for AI Features

When adding or modifying AI features:

1. **Check AI consent** — `profile.ai_enabled` must be true
2. **Sanitize all output** — Run through `containsBannedTerms()` / `sanitizeText()`
3. **No medical claims** — Use safe verbs (see `health-domain.md`)
4. **Validate nutrients** — Use `enforceNutrientLimits()` for food data
5. **Handle failures gracefully** — AI calls can fail; always have a fallback
6. **Rate limit awareness** — Edge function cold starts can add 2-5s latency
7. **Cache when possible** — Use TTL-based caching for expensive AI calls
8. **Structured output** — Request `responseMimeType: 'application/json'` for reliable parsing

## Shared AI Utilities (`supabase/functions/_shared/`)

| File | Purpose |
|------|---------|
| `ai.ts` | AI helper functions |
| `genai.ts` | Google Gen AI client setup |
| `gemini-structured.ts` | Structured output parsing |
| `vertex.ts` | Vertex AI client (legacy) |
| `safety.ts` | `BANNED_TERMS`, `containsBannedTerms()`, `sanitizeText()` |
| `nutrition-validation.ts` | `enforceNutrientLimits()` |
| `nutrition-lookup.ts` | Nutrition database lookups |
| `portion-estimator.ts` | Portion size estimation |
| `fatsecret.ts` | FatSecret API integration |
| `image-cache.ts` | Image caching for photos |
| `stats.ts` | Statistical calculations |
| `auth.ts` | `requireUser()`, `requireMatchingUserId()` |
