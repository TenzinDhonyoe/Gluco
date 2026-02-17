-- Behavior-first framework rollout schema
-- Adds profile rollout fields, weight tracking, and app session retention tables

-- ============================================
-- 1) PROFILES: behavior_v1 rollout + behavior settings
-- ============================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS experience_variant TEXT NOT NULL DEFAULT 'legacy'
  CHECK (experience_variant IN ('legacy', 'behavior_v1'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS framework_reset_completed_at TIMESTAMPTZ;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS com_b_barrier TEXT
  CHECK (com_b_barrier IS NULL OR com_b_barrier IN ('capability', 'opportunity', 'motivation', 'unsure'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS readiness_level TEXT
  CHECK (readiness_level IS NULL OR readiness_level IN ('low', 'medium', 'high'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS primary_habit TEXT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS if_then_plan TEXT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS prompt_window TEXT
  CHECK (prompt_window IS NULL OR prompt_window IN ('morning', 'midday', 'evening'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS show_glucose_advanced BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_preferences JSONB NOT NULL DEFAULT
  '{
    "meal_reminders": true,
    "post_meal_reviews": true,
    "daily_insights": true,
    "experiment_updates": true,
    "active_action_midday": true,
    "post_meal_action": true,
    "weekly_summary": true
  }'::jsonb;

CREATE INDEX IF NOT EXISTS idx_profiles_experience_variant
  ON public.profiles(experience_variant);

COMMENT ON COLUMN public.profiles.experience_variant IS 'Experience flag: legacy or behavior_v1.';
COMMENT ON COLUMN public.profiles.framework_reset_completed_at IS 'Timestamp for one-time behavior framework reset wizard completion.';
COMMENT ON COLUMN public.profiles.com_b_barrier IS 'Primary COM-B barrier selected by user.';
COMMENT ON COLUMN public.profiles.readiness_level IS 'Self-reported readiness to change behavior.';
COMMENT ON COLUMN public.profiles.primary_habit IS 'Primary tiny habit user commits to first.';
COMMENT ON COLUMN public.profiles.if_then_plan IS 'Implementation intention text: if-then behavior plan.';
COMMENT ON COLUMN public.profiles.prompt_window IS 'Preferred prompt window for behavior nudges.';
COMMENT ON COLUMN public.profiles.show_glucose_advanced IS 'Whether advanced glucose block is visible in behavior_v1.';
COMMENT ON COLUMN public.profiles.notification_preferences IS 'JSON preferences for local reminder categories.';

-- ============================================
-- 2) WEIGHT LOGS
-- ============================================

CREATE TABLE IF NOT EXISTS public.weight_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  weight_kg NUMERIC(5,2) NOT NULL CHECK (weight_kg > 0 AND weight_kg < 500),
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'apple_health', 'imported')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_weight_logs_user_logged_at
  ON public.weight_logs(user_id, logged_at DESC);

ALTER TABLE public.weight_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own weight logs"
  ON public.weight_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own weight logs"
  ON public.weight_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own weight logs"
  ON public.weight_logs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own weight logs"
  ON public.weight_logs FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- 3) USER APP SESSIONS (retention)
-- ============================================

CREATE TABLE IF NOT EXISTS public.user_app_sessions (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  first_opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  platform TEXT NOT NULL DEFAULT 'unknown',
  app_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, session_date)
);

CREATE INDEX IF NOT EXISTS idx_user_app_sessions_user_date
  ON public.user_app_sessions(user_id, session_date DESC);

ALTER TABLE public.user_app_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own app sessions"
  ON public.user_app_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own app sessions"
  ON public.user_app_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own app sessions"
  ON public.user_app_sessions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own app sessions"
  ON public.user_app_sessions FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- 4) UPDATED_AT triggers
-- ============================================

CREATE OR REPLACE FUNCTION public.update_weight_logs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS weight_logs_updated_at ON public.weight_logs;
CREATE TRIGGER weight_logs_updated_at
  BEFORE UPDATE ON public.weight_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_weight_logs_updated_at();

CREATE OR REPLACE FUNCTION public.update_user_app_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_app_sessions_updated_at ON public.user_app_sessions;
CREATE TRIGGER user_app_sessions_updated_at
  BEFORE UPDATE ON public.user_app_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_user_app_sessions_updated_at();

COMMENT ON TABLE public.weight_logs IS 'User-entered or synced body weight logs for behavior_v1 trend feedback.';
COMMENT ON TABLE public.user_app_sessions IS 'Per-day app-open session registry for retention cohort analysis.';
