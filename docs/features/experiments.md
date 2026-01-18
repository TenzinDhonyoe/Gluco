# Experiments

## Purpose
Let users run A/B-style experiments (e.g., meal variants) and summarize outcomes based on check-ins and glucose response.

## Entry Points
- `app/experiments-list.tsx` lists experiment templates and active experiments.
- `app/experiment-detail.tsx` shows a single experiment timeline with next steps.
- `app/experiment-results.tsx` renders computed outcomes.
- `components/experiments/ActiveExperimentWidget.tsx` surfaces active experiments on Today.

## Flow Summary
- Templates are seeded in `experiment_templates` and include protocol details.
- A user starts an experiment and records exposures over time (typically tied to meals).
- Check-ins and glucose logs are linked to each exposure for scoring.
- Results are calculated locally in `lib/experiment-analysis.ts` (Edge function currently bypassed for schema compatibility).

## Analysis Details (Local)
- Events are grouped by `variant_key` from `user_experiment_events`.
- Each exposure can be enriched with:
  - A linked `meal_checkins` row (if the meal was checked in).
  - Glucose logs in the 0-3 hour window after the meal to compute baseline, peak, and time-to-peak.
- Variant metrics include:
  - Median and mean peak delta
  - Median time-to-peak
  - Average energy/hunger/cravings from check-ins

## Data Model
- `experiment_templates`, `experiment_variants` (catalog)
- `user_experiments`, `user_experiment_events`, `user_experiment_analysis`
- `meal_checkins`, `glucose_logs` (joined for outcome metrics)

## Edge Functions
- `supabase/functions/experiments-suggest/`
- `supabase/functions/experiments-evaluate/`

## Key Files
- `app/experiments-list.tsx`
- `app/experiment-detail.tsx`
- `app/experiment-results.tsx`
- `components/experiments/ActiveExperimentWidget.tsx`
- `lib/experiment-analysis.ts`
