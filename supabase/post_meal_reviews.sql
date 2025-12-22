-- Post Meal Reviews Table
-- Stores scheduled post-meal reviews for notification and review screen

-- Create the post_meal_reviews table
CREATE TABLE IF NOT EXISTS public.post_meal_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    meal_id UUID NOT NULL REFERENCES public.meals(id) ON DELETE CASCADE,
    
    -- Scheduling
    scheduled_for TIMESTAMPTZ NOT NULL,  -- meal_time + 2 hours
    notification_id TEXT,                 -- Local notification identifier
    
    -- Status tracking
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'ready', 'opened')),
    opened_at TIMESTAMPTZ,
    
    -- Predicted data (from pre-meal check)
    predicted_peak NUMERIC,
    predicted_curve JSONB,               -- Array of {time, value} points
    predicted_risk_pct NUMERIC,
    
    -- Actual data (computed on review open)
    actual_peak NUMERIC,
    actual_curve JSONB,                  -- Array of {time, value} points
    
    -- Review insights
    summary TEXT,                        -- Short one-liner: "Peaked at X – smoother than expected"
    status_tag TEXT,                     -- 'steady', 'mild_elevation', 'spike'
    contributors JSONB,                  -- Array of insight cards to render
    
    -- Meal info snapshot for display
    meal_name TEXT,
    meal_time TIMESTAMPTZ,
    total_carbs NUMERIC,
    total_protein NUMERIC,
    total_fibre NUMERIC,
    
    -- User feedback
    mood_rating INTEGER,                 -- 0-4 scale: 😫 😕 😐 🙂 😊
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_post_meal_reviews_user_id ON public.post_meal_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_post_meal_reviews_scheduled_for ON public.post_meal_reviews(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_post_meal_reviews_status ON public.post_meal_reviews(status);
CREATE INDEX IF NOT EXISTS idx_post_meal_reviews_meal_id ON public.post_meal_reviews(meal_id);

-- Enable RLS
ALTER TABLE public.post_meal_reviews ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own reviews
CREATE POLICY "Users can view own reviews"
    ON public.post_meal_reviews
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own reviews"
    ON public.post_meal_reviews
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reviews"
    ON public.post_meal_reviews
    FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own reviews"
    ON public.post_meal_reviews
    FOR DELETE
    USING (auth.uid() = user_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_post_meal_reviews_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_post_meal_reviews_updated_at
    BEFORE UPDATE ON public.post_meal_reviews
    FOR EACH ROW
    EXECUTE FUNCTION update_post_meal_reviews_updated_at();

-- Grant access to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_meal_reviews TO authenticated;
