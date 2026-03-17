-- Add experiment suggestion tracking to meal_scores
-- When insight_type = 'experiment', this stores the suggested experiment details
-- so we can track whether the user tried it and what the result was.

ALTER TABLE public.meal_scores
    ADD COLUMN IF NOT EXISTS experiment_suggestion JSONB DEFAULT NULL;

-- experiment_suggestion schema:
-- {
--   "template_slug": "post-meal-walk",       -- matches experiment_templates.slug
--   "suggestion": "Try a short walk after",  -- human-readable suggestion
--   "weak_component": "return_to_baseline",  -- which score component triggered it
--   "tried": false,                          -- set to true when similar meal is scored later
--   "result_meal_id": null,                  -- meal_id of the follow-up meal (if tried)
--   "result_score_delta": null               -- score difference vs this meal
-- }

COMMENT ON COLUMN public.meal_scores.experiment_suggestion
    IS 'Tracks experiment suggestions and results when insight_type=experiment';
