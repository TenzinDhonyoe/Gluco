-- Add 'onboarding_plan' to ai_output_history output_type CHECK constraint
-- This supports the new generate-onboarding-plan edge function

ALTER TABLE public.ai_output_history
    DROP CONSTRAINT IF EXISTS ai_output_history_output_type_check;

ALTER TABLE public.ai_output_history
    ADD CONSTRAINT ai_output_history_output_type_check
    CHECK (output_type IN ('next_best_action', 'weekly_review', 'score_explanation', 'onboarding_plan'));
