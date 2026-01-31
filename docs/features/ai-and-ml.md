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

   **Adjustment Tips UI (Low-Anxiety Design):**
   The `premeal-analyze` function returns adjustment tips that are presented with a micro-commitment approach:
   - Tips sorted by `benefit_level` (high/medium/low)
   - Primary tip shown prominently; secondary tips collapsed
   - Action buttons: "I'll try this" / "Not today" (not checkboxes)
   - Outcome-focused language (e.g., "Helps reduce glucose spikes")
   - Time context labels (e.g., "In the next 30 minutes")
   - Reversible selection with "Undo" and reassurance text

   See `docs/features/meal-scanner.md` for full UI specifications.

   **Meal Photo Gram Estimation:**
   The `meals-from-photo` pipeline instructs Gemini to estimate portion weight in grams (not qualitative descriptions). A server-side fallback (`convertToGrams()` in `portion-estimator.ts`) converts any remaining qualitative/volume portions to grams using food reference tables and category defaults. Nutrition values from FatSecret/USDA are then scaled to the detected gram weight so the API returns accurate per-portion nutrition. See `docs/features/meal-scanner.md` for the full pipeline.

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

## 4) Metabolic Score v2: Calculation steps

### Step A: Data sufficiency
- Requires **at least 5 days** of RHR, steps, and sleep.
- If any signal has fewer than 5 valid days, the score returns `insufficient_data`.

### Step B: Winsorize outliers (IQR)
- For each signal with **>= 5 days**, compute Q1/Q3 and clamp values to:
  - `lower = Q1 - 1.5 * IQR`, `upper = Q3 + 1.5 * IQR`.
- If < 5 days, the series is unchanged.

### Step C: Weekly summary (7-day window)
- **RHR & HRV** use median of winsorized values.
- **Steps** uses median of winsorized values.
- **Sleep** uses mean of winsorized values.

### Step D: Sleep regularity
- Compute `sleepStd` across the 7-day window.
- `sleepRegularityBad = clamp01(sleepStd / 1.5)`.
- `sleepBad = 0.7 * sleepDurationBad + 0.3 * sleepRegularityBad` (if std available).

### Step E: Baseline-relative normalization (preferred)
- Baseline window excludes the current 7 days.
- Use **prior 28 days** if available; otherwise expand to **up to 56 days**.
- Baseline requires **>= 14 valid days** per signal.
- If baseline exists, compute `z` and squash via logistic:
  - `bad = 1 / (1 + exp(-k * (z - m)))`, with `k=1.2`, `m=0`.
  - **RHR:** higher than baseline is worse (`z` as-is).
  - **Steps / HRV:** lower than baseline is worse (`z = -z`).
  - **Sleep:** use absolute delta from baseline median.
- If no baseline, fall back to v1 absolute scaling:
  - RHR: `(weeklyRHR - 50) / 35`
  - Steps: `1 - (weeklySteps - 3000) / 9000`
  - Sleep: `abs(weeklySleep - 7.5) / 2.5`
  - HRV: `1 - (weeklyHRV - 20) / 60`

### Step F: Atypical activity week
- If `weeklySteps > 2.5 * baselineStepsMedian` or `< 0.4 * baselineStepsMedian`,
  mark `atypicalActivityWeek = true` and reduce steps weight by 30% before rescaling.

### Step G: Weights + context multiplier
Base weights (if data exists):
- **RHR:** 0.35
- **Steps:** 0.30 (reduced if atypical week)
- **Sleep:** 0.15
- **HRV:** 0.10
- **Context:** 0.10 (used as multiplier, not as additive strain)

Wearable strain uses only RHR/steps/sleep/HRV weights. Context applies a soft multiplier:
- `contextMultiplier = 1 + 0.15 * contextNorm`
- `finalStrain = clamp01(wearableStrain * contextMultiplier)`

### Step H: Scores
- `score7d = clamp(round(100 * (1 - finalStrain)), 0, 100)`
- `score28d` = median of last 4 weekly `score7d` values if available; else `score7d`.

### Step I: Confidence label
- **High:** RHR/steps/sleep >= 6 days; if HRV used then HRV >= 4 days.
- **Medium:** meets sufficiency but has a core signal at exactly 5 days, or atypical week.
- **Low:** multiple core signals at exactly 5 days or smoothing unavailable.
- **Insufficient:** core data < 5 days.

## 5) API output
`metabolic-score` returns **legacy fields** for backward compatibility plus **v2 fields**:
- Legacy: `metabolic_response_score`, `band`, `confidence`, `drivers`, `components`.
- V2: `score7d`, `score28d`, `confidence_v2`, `atypicalActivityWeek`, `mode`,
  `components_v2`, `debug_v2`, and a full `v2` object with the same shape.

Notes:
- `score7d` is the primary v2 score and mirrors `metabolic_response_score` for legacy clients.
- `score28d` is the smoothed value (median of the last 4 weekly scores when available).

## 6) Operational notes
- **Backfill weekly scores** (one-time, for `score28d`):
  ```
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  deno run --allow-net --allow-env supabase/functions/metabolic-score/backfill.ts
  ```
  Optional env vars: `USER_ID`, `BACKFILL_WEEKS`, `BACKFILL_LOOKBACK_DAYS`.
- **Client display**: prefer `score7d` when present; fall back to `metabolic_response_score`.

## 7) Where to look in code
- **Metabolic score calculation:** `supabase/functions/metabolic-score/score.ts`
- **Edge function handler:** `supabase/functions/metabolic-score/index.ts`
- **Daily wearable data:** `daily_context` table (see `docs/features/backend-and-data.md`)
- **Weekly score snapshots:** `user_metabolic_weekly_scores` table (v2 smoothing)
- **Backfill script:** `supabase/functions/metabolic-score/backfill.ts`
- **AI/LLM functions:**
  - `supabase/functions/premeal-analyze/index.ts`
  - `supabase/functions/personal-insights/index.ts`
  - `supabase/functions/personalized-tips/index.ts`
  - `supabase/functions/label-parse/index.ts`
  - `supabase/functions/food-query-rewrite/index.ts`

## 8) Mental model
Think of the Metabolic Response Score as a weekly wellness report card:
- Clean the data, winsorize outliers, compare against your own recent baseline when possible.
- Fold in sleep regularity and dampen atypical activity weeks to reduce swings.
- The result is stable, explainable, and deterministic (no black-box ML).
