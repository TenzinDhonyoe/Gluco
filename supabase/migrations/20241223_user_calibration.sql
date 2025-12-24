-- User Calibration System Migration
-- Persistent per-user calibration with online EMA updates
-- Created: 2024-12-23

-- ============================================
-- 1. USER CALIBRATION TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.user_calibration (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Core calibration parameters
    baseline_glucose NUMERIC NOT NULL DEFAULT 5.5,      -- [4.0, 9.0] typical pre-meal
    carb_sensitivity NUMERIC NOT NULL DEFAULT 0.4,      -- [0.1, 1.2] mmol/L per 10g carbs
    avg_peak_time_min INTEGER NOT NULL DEFAULT 45,      -- [25, 120] minutes to peak
    
    -- Context effect parameters
    exercise_effect NUMERIC NOT NULL DEFAULT 0.0,       -- [0.0, 0.35] peak reduction per activity unit
    sleep_penalty NUMERIC NOT NULL DEFAULT 0.0,         -- [0.0, 0.45] peak increase per sleep deficit unit
    
    -- Data quality metrics
    n_observations INTEGER NOT NULL DEFAULT 0,          -- Total observations
    n_quality_observations INTEGER NOT NULL DEFAULT 0,  -- High-quality observations only
    confidence NUMERIC NOT NULL DEFAULT 0.0,            -- [0, 1] based on data volume
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for updated_at (cleanup queries)
CREATE INDEX IF NOT EXISTS idx_user_calibration_updated_at 
ON public.user_calibration(updated_at);

-- Enable RLS
ALTER TABLE public.user_calibration ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own calibration"
    ON public.user_calibration FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own calibration"
    ON public.user_calibration FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own calibration"
    ON public.user_calibration FOR UPDATE
    USING (auth.uid() = user_id);

-- Grant access
GRANT SELECT, INSERT, UPDATE ON public.user_calibration TO authenticated;

-- ============================================
-- 2. DAILY CONTEXT TABLE (Sleep/Wellness)
-- ============================================

CREATE TABLE IF NOT EXISTS public.daily_context (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    
    -- Sleep metrics
    sleep_hours NUMERIC,
    sleep_quality TEXT CHECK (sleep_quality IN ('poor', 'fair', 'good', 'excellent')),
    
    -- Activity metrics (future HealthKit)
    steps INTEGER,
    active_minutes INTEGER,
    
    -- Wellness metrics (future HealthKit)
    resting_hr NUMERIC,
    hrv_ms NUMERIC,
    stress_level INTEGER CHECK (stress_level BETWEEN 1 AND 5),
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    PRIMARY KEY (user_id, date)
);

-- Index for recent context lookup
CREATE INDEX IF NOT EXISTS idx_daily_context_user_date
ON public.daily_context(user_id, date DESC);

-- Enable RLS
ALTER TABLE public.daily_context ENABLE ROW LEVEL SECURITY;

-- RLS Policies (drop first for idempotency)
DROP POLICY IF EXISTS "Users can view own context" ON public.daily_context;
DROP POLICY IF EXISTS "Users can insert own context" ON public.daily_context;
DROP POLICY IF EXISTS "Users can update own context" ON public.daily_context;

CREATE POLICY "Users can view own context"
    ON public.daily_context FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own context"
    ON public.daily_context FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own context"
    ON public.daily_context FOR UPDATE
    USING (auth.uid() = user_id);

-- Grant access
GRANT SELECT, INSERT, UPDATE ON public.daily_context TO authenticated;

-- ============================================
-- 3. ADD METRIC COLUMNS TO POST_MEAL_REVIEWS
-- ============================================

-- Add missing metric columns (idempotent)
ALTER TABLE public.post_meal_reviews
ADD COLUMN IF NOT EXISTS baseline_glucose NUMERIC,
ADD COLUMN IF NOT EXISTS peak_delta NUMERIC,
ADD COLUMN IF NOT EXISTS time_to_peak_min INTEGER,
ADD COLUMN IF NOT EXISTS net_carbs_g NUMERIC,
ADD COLUMN IF NOT EXISTS auc_0_180 NUMERIC,
ADD COLUMN IF NOT EXISTS meal_tokens TEXT[];

-- Index for similar meal queries (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_post_meal_reviews_meal_tokens') THEN
        CREATE INDEX idx_post_meal_reviews_meal_tokens
        ON public.post_meal_reviews USING gin(meal_tokens);
    END IF;
END$$;

-- Index for fetching completed reviews
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_post_meal_reviews_user_completed') THEN
        CREATE INDEX idx_post_meal_reviews_user_completed 
        ON public.post_meal_reviews(user_id, status, meal_time DESC)
        WHERE status = 'opened' AND peak_delta IS NOT NULL;
    END IF;
END$$;

-- ============================================
-- 4. TRIGGERS
-- ============================================

-- Updated_at trigger for user_calibration
CREATE OR REPLACE FUNCTION update_user_calibration_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_user_calibration_updated_at ON public.user_calibration;
CREATE TRIGGER trigger_user_calibration_updated_at
    BEFORE UPDATE ON public.user_calibration
    FOR EACH ROW
    EXECUTE FUNCTION update_user_calibration_updated_at();

-- Updated_at trigger for daily_context
CREATE OR REPLACE FUNCTION update_daily_context_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_daily_context_updated_at ON public.daily_context;
CREATE TRIGGER trigger_daily_context_updated_at
    BEFORE UPDATE ON public.daily_context
    FOR EACH ROW
    EXECUTE FUNCTION update_daily_context_updated_at();

-- ============================================
-- 5. COMMENTS
-- ============================================

COMMENT ON TABLE public.user_calibration IS 'Per-user glycaemic calibration with EMA-updated parameters';
COMMENT ON COLUMN public.user_calibration.carb_sensitivity IS 'mmol/L glucose rise per 10g net carbs';
COMMENT ON COLUMN public.user_calibration.exercise_effect IS 'Peak reduction multiplier per activity_score unit (0-0.35)';
COMMENT ON COLUMN public.user_calibration.sleep_penalty IS 'Peak increase multiplier per sleep_deficit unit (0-0.45)';
COMMENT ON COLUMN public.user_calibration.confidence IS 'Calibration confidence: 1 - exp(-n_quality/20)';

COMMENT ON TABLE public.daily_context IS 'Daily wellness context for predictions. Ready for HealthKit integration.';
