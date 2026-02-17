-- ============================================
-- AI Personalization Enhancements
-- Adds calibration columns, profile dietary fields,
-- and ai_suggestion_events tracking table.
-- ============================================

-- ============================================
-- 1) Add computed calibration columns
-- ============================================

ALTER TABLE public.user_calibration
  ADD COLUMN IF NOT EXISTS avg_fasting_glucose NUMERIC,
  ADD COLUMN IF NOT EXISTS avg_post_meal_peak NUMERIC,
  ADD COLUMN IF NOT EXISTS top_spike_times TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS top_response_food_categories TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS best_glucose_days INTEGER[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS worst_glucose_days INTEGER[] DEFAULT '{}';

COMMENT ON COLUMN public.user_calibration.top_response_food_categories IS 'Top 5 meal tokens by average peak_delta, computed by calibration-update.';
COMMENT ON COLUMN public.user_calibration.best_glucose_days IS 'Day-of-week numbers (0=Sun..6=Sat) with lowest avg post-meal glucose.';
COMMENT ON COLUMN public.user_calibration.worst_glucose_days IS 'Day-of-week numbers (0=Sun..6=Sat) with highest avg post-meal glucose.';

-- ============================================
-- 2) Add dietary context to profiles
-- ============================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dietary_preferences TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cultural_food_context TEXT;

COMMENT ON COLUMN public.profiles.dietary_preferences IS 'User dietary preferences (e.g. vegetarian, halal, gluten-free).';
COMMENT ON COLUMN public.profiles.cultural_food_context IS 'Free-text cultural food context for AI personalization.';

-- ============================================
-- 3) AI Suggestion Events (engagement tracking)
-- ============================================

CREATE TABLE IF NOT EXISTS public.ai_suggestion_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    ai_output_id UUID REFERENCES public.ai_output_history(id) ON DELETE SET NULL,
    output_type TEXT NOT NULL CHECK (output_type IN ('next_best_action', 'weekly_review', 'score_explanation')),
    event_type TEXT NOT NULL CHECK (event_type IN ('shown', 'tapped', 'completed', 'dismissed')),
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_suggestion_events_user_type_created
    ON public.ai_suggestion_events(user_id, output_type, created_at DESC);

ALTER TABLE public.ai_suggestion_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own suggestion events"
    ON public.ai_suggestion_events FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own suggestion events"
    ON public.ai_suggestion_events FOR INSERT
    WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.ai_suggestion_events IS 'Tracks user engagement with AI suggestions: shown, tapped, completed, dismissed.';
