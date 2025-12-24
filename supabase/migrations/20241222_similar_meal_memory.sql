-- Similar Meal Memory Migration
-- Adds columns needed for similar meal matching and outcome tracking
-- Created: 2024-12-22

-- Add fields for similar meal matching to post_meal_reviews
ALTER TABLE public.post_meal_reviews
ADD COLUMN IF NOT EXISTS baseline_glucose NUMERIC,
ADD COLUMN IF NOT EXISTS peak_delta NUMERIC,           -- actual_peak - baseline_glucose
ADD COLUMN IF NOT EXISTS time_to_peak_min INTEGER,
ADD COLUMN IF NOT EXISTS meal_tokens TEXT[];           -- ['chicken', 'butter', 'naan']

-- GIN index for efficient token similarity queries
CREATE INDEX IF NOT EXISTS idx_post_meal_reviews_meal_tokens
ON public.post_meal_reviews USING gin(meal_tokens);

-- Composite index for fetching completed reviews efficiently
CREATE INDEX IF NOT EXISTS idx_post_meal_reviews_user_completed
ON public.post_meal_reviews(user_id, status, meal_time DESC)
WHERE status = 'opened' AND peak_delta IS NOT NULL;

-- Daily context table for sleep/wellness data (future HealthKit integration)
CREATE TABLE IF NOT EXISTS public.daily_context (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    
    -- Sleep metrics
    sleep_hours NUMERIC,
    sleep_quality TEXT CHECK (sleep_quality IN ('poor', 'fair', 'good', 'excellent')),
    
    -- Activity metrics (can be synced from HealthKit later)
    steps INTEGER,
    active_minutes INTEGER,
    
    -- Wellness metrics (future)
    resting_hr INTEGER,
    hrv NUMERIC,
    stress_score NUMERIC,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Unique constraint: one entry per user per day
    UNIQUE(user_id, date)
);

-- Index for fetching recent context
CREATE INDEX IF NOT EXISTS idx_daily_context_user_date
ON public.daily_context(user_id, date DESC);

-- Enable RLS
ALTER TABLE public.daily_context ENABLE ROW LEVEL SECURITY;

-- RLS Policies for daily_context
CREATE POLICY "Users can view own context"
    ON public.daily_context
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own context"
    ON public.daily_context
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own context"
    ON public.daily_context
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Grant access
GRANT SELECT, INSERT, UPDATE ON public.daily_context TO authenticated;

-- Comment for documentation
COMMENT ON TABLE public.daily_context IS 'Daily wellness context for personalized predictions. Designed for future HealthKit integration.';
COMMENT ON COLUMN public.post_meal_reviews.meal_tokens IS 'Normalized tokens from meal name and items for similarity matching';
COMMENT ON COLUMN public.post_meal_reviews.peak_delta IS 'Glucose rise from baseline to peak (actual_peak - baseline_glucose)';
