# Metabolic Score Calculations (Metabolic Response Score v2)

This document explains how the Metabolic Score is calculated in this codebase.
The implementation lives in `supabase/functions/metabolic-score/score.ts` and is
invoked by the edge function in `supabase/functions/metabolic-score/index.ts`.

## Overview

- Output: `score7d` from 0 to 100 (higher = better).
- Inputs: rolling 7-day wearable metrics plus optional age and body composition.
- Core idea: compute "badness" (0..1) for each metric, weight them, apply a small
  context multiplier, and convert to a score.

## Data sources and windows

- Data comes from `daily_context` (sleep hours, steps, resting HR, HRV).
- The 7-day window is the most recent 7 days anchored to the latest available
  date in `daily_context`.
- Baselines are computed from older windows:
  - Primary baseline: the 28 days immediately before the current 7-day window.
  - Fallback baseline: the 56 days immediately before the current 7-day window.

## Data sufficiency

The score is only computed if there are at least 5 valid days for each of:

- Resting HR during sleep (`sleepRHR`)
- Daily steps (`dailySteps`)
- Sleep duration (`sleepHours`)

If any of those are under 5 valid days, `score7d` is `null` and the reason is
`insufficient_data`.

HRV is optional:
- If fewer than 3 valid HRV days, HRV is excluded from the score.

## Outlier handling (winsorization)

Each input series is winsorized before aggregation:

- Compute Q1 and Q3, then IQR = Q3 - Q1.
- Clamp values to `[Q1 - 1.5*IQR, Q3 + 1.5*IQR]`.
- Winsorization only applies when there are at least 5 valid values.

## Weekly aggregates

After winsorization, the 7-day aggregates are:

- `weeklyRHR`: median of sleep RHR.
- `weeklySteps`: median of steps.
- `weeklySleep`: mean of sleep hours.
- `weeklyHRV`: median of HRV (only if 3+ valid HRV days).
- `sleepStd`: standard deviation of sleep hours (only if 5+ valid sleep days).

Values are rounded for reporting:

- RHR/Sleep/HRV to 1 decimal
- Steps to nearest integer

## Age/BMI context normalization

Context is used as a small multiplier, not a direct penalty:

- BMI is either supplied or computed from height/weight.
- `bmiNorm = clamp01((bmi - 22) / (35 - 22))`
- `ageNorm = clamp01((age - 25) / (65 - 25))`
- `contextNorm`:
  - If age and BMI: `0.6*bmiNorm + 0.4*ageNorm`
  - If only BMI: `bmiNorm`
  - If only age: `ageNorm`

## Baseline selection and modes

For each metric (RHR, steps, sleep, HRV):

- Primary baseline needs at least 14 valid days.
- If primary is insufficient, fallback (56-day window) is attempted.
- If neither has 14 valid days, that metric has no baseline.

`mode` is:

- `baseline_relative` if any metric has a baseline.
- `absolute_fallback` if no baselines are available.

## Badness functions (0 = good, 1 = bad)

The score is based on "badness" values per metric.

### Baseline-relative badness

When a baseline is available, "badness" uses a logistic transform of how far the
current week is from the baseline median, scaled by IQR:

- `z = delta / max(iqr, 1)` (or negated when higher is better)
- `logistic(z) = 1 / (1 + exp(-1.2 * (z - 0)))`
- `badness = clamp01(logistic(z))`

Direction matters:

- Resting HR: higher is worse (no inversion).
- Steps: higher is better (inversion).
- HRV: higher is better (inversion).
- Sleep duration: uses absolute delta from baseline median.

### Absolute fallback badness

When no baseline is available for a metric, fixed ranges are used:

- RHR: `clamp01((weeklyRHR - 50) / (85 - 50))`
- Steps: `clamp01(1 - (weeklySteps - 3000) / (12000 - 3000))`
- Sleep duration: `clamp01(abs(weeklySleep - 7.5) / 2.5)`
- HRV: `clamp01(1 - (weeklyHRV - 20) / (80 - 20))`

### Sleep combines duration + regularity

- Sleep duration badness uses either baseline-relative or absolute formula.
- Sleep regularity badness is `clamp01(sleepStd / 1.5)` when available.
- Combined sleep badness:
  - `0.7 * durationBad + 0.3 * regularityBad` when both exist.
  - Otherwise, duration badness only.

## Atypical activity detection

If there is a steps baseline and the week is atypical:

- `weeklySteps > 2.5 * baselineMedian` OR
- `weeklySteps < 0.4 * baselineMedian`

Then `wSteps` is reduced by 30% (multiplied by 0.7) before weight normalization.

## Weights

Default weights:

- `wRHR = 0.35`
- `wSteps = 0.30`
- `wSleep = 0.15`
- `wHRV = 0.10` (only if HRV is present)
- `wContext = 0.10` (only if age or BMI is present)

If the activity week is atypical, `wSteps` is multiplied by 0.7.

After adjustments, weights are normalized to sum to 1.0.

Weights are rounded to 2 decimals when returned in debug output.

## Strain and final score

Wearable strain is a weighted sum of badness values:

```
wearableStrain =
  wRHR   * rhrBad +
  wSteps * stepsBad +
  wSleep * sleepBad +
  wHRV   * hrvBad (if present)
```

Context multiplier:

- If age or BMI exists: `contextMultiplier = 1 + 0.15 * contextNorm`
- Otherwise: `contextMultiplier = 1.0`

Final strain and score:

- `strain = clamp01(wearableStrain * contextMultiplier)`
- `score7d = clamp(round(100 * (1 - strain)), 0, 100)`

## Score28d and smoothing availability

The edge function computes a 28-day score as the median of the last 2-4 weekly
scores, if at least 2 weekly scores exist. Otherwise:

- `score28d = score7d`
- `smoothingUnavailable = true`

This flag affects confidence labeling.

## Confidence labeling

Confidence is based on data completeness and smoothing availability:

- If core days < 5 for any required metric: `insufficient_data`
- If smoothing is unavailable: `low`
- Otherwise:
  - `high` if RHR/steps/sleep days >= 6 and (if HRV used) HRV days >= 4
  - `low` if at least two of the core metrics have exactly 5 days
  - `medium` otherwise (or if the week is atypical)

## Returned components (debug)

The score calculation can return these numeric components (rounded to 2 decimals):

- `rhrBad`, `stepsBad`, `sleepBad`, `hrvBad`
- `contextNorm`, `wearableStrain`, `contextMultiplier`, `strain`
- `weightsUsed`
- `dataCompleteness`
- `usedBaseline`, `usedFallbacks`
- `mode` (`baseline_relative` or `absolute_fallback`)

These are intended for transparency and debugging.
