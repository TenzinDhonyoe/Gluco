# AI and ML Overview (Gluco)

This document explains where AI is used, what is deterministic, and how the Metabolic Score is calculated. It is written for agents and new teammates who need fast context without ML background.

## 1) What "AI" means in this app

There are two distinct categories:

1) **LLM-powered outputs (text + suggestions)**
   - Used for natural-language explanations, tips, and food parsing.
   - These outputs do **not** drive core metrics or medical decisions.
   - Examples (edge functions):
     - `premeal-analyze` (meal drivers + adjustment tips)
     - `personal-insights` / `personalized-tips` (insights/tips)
     - `experiments-suggest` / `experiments-evaluate`
     - `label-parse` (nutrition label extraction)
     - `food-query-rewrite` (search rewrites)

2) **Deterministic scoring (no ML model)**
   - The Metabolic Score is **pure math**, not an ML model.
   - It is a deterministic formula based on wearable signals.
   - Source: `supabase/functions/metabolic-score/index.ts`.

## 2) AI Safety and Consent
- User AI consent is tracked in `profiles.ai_enabled` and `profiles.ai_consent_at`.
- Label scanning explicitly blocks if AI is disabled (`lib/labelScan.ts`).
- The app applies banned-term filtering to avoid clinical claims:
  - App-side: `lib/insights.ts`
  - Edge-side: `supabase/functions/_shared/safety.ts`

## 3) Metabolic Score: What it measures

**Goal:** Produce a 0–100 score that summarizes wellness patterns based on wearable signals.
- Higher score = better wellness patterns.
- It is **not** a diagnosis or medical claim.

**Inputs (from `daily_context`):**
- Resting heart rate during sleep (RHR, bpm)
- Steps per day
- Sleep duration (hours)
- HRV during sleep (RMSSD, ms)
- Age, height, weight (for BMI)

**Data source:** Apple HealthKit → stored in `daily_context`.

## 4) Metabolic Score: Calculation steps

### Step A: Data sufficiency
- Requires **at least 5 days** of RHR, steps, and sleep.
- If any signal has fewer than 5 valid days, the score returns `insufficient`.

### Step B: Trim outliers
- Trims the top 10% and bottom 10% to reduce noise.

### Step C: Weekly summary
- **RHR & HRV** use median.
- **Steps & Sleep** use mean.

### Step D: Normalize to 0–1 “badness”
- **RHR (higher is worse)**
  - `rhrNorm = clamp01((weeklyRHR - 50) / (85 - 50))`
- **Steps (higher is better, so invert)**
  - `stepsBadNorm = 1 - clamp01((weeklySteps - 3000) / (12000 - 3000))`
- **Sleep (distance from ideal 7.5h)**
  - `sleepNorm = clamp01(abs(weeklySleep - 7.5) / 2.5)`
- **HRV (higher is better, so invert)**
  - `hrvBadNorm = 1 - clamp01((weeklyHRV - 20) / (80 - 20))`

### Step E: Optional context (age/BMI)
- BMI normalization: `clamp01((bmi - 22) / (35 - 22))`
- Age normalization: `clamp01((age - 25) / (65 - 25))`
- If both exist: `contextNorm = 0.6 * bmiNorm + 0.4 * ageNorm`

### Step F: Weighted combination
Weights (if all data exists):
- **RHR:** 0.35
- **Steps:** 0.30
- **Sleep:** 0.15
- **HRV:** 0.10
- **Context:** 0.10

If HRV or context is missing, weights are redistributed so the total is 1.0.

### Step G: Final score
```
score = 100 * (1 - strain)
score = clamp(score, 0, 100)
```

## 5) API output
`metabolic-score` returns:
- `metabolic_response_score` (0–100)
- `band` (low / medium / high)
- `confidence` (low / medium / high)
- `drivers` (plain-language explanation)

## 6) Where to look in code
- **Metabolic score calculation:** `supabase/functions/metabolic-score/index.ts`
- **Daily wearable data:** `daily_context` table (see `docs/features/backend-and-data.md`)
- **AI/LLM functions:**
  - `supabase/functions/premeal-analyze/index.ts`
  - `supabase/functions/personal-insights/index.ts`
  - `supabase/functions/personalized-tips/index.ts`
  - `supabase/functions/label-parse/index.ts`
  - `supabase/functions/food-query-rewrite/index.ts`

## 7) Mental model
Think of the Metabolic Score like a weekly wellness report card:
- Clean the data, compute averages, normalize to “distance from ideal,” and combine with weights.
- The result is a stable, explainable number. No black-box ML is involved in the score.
