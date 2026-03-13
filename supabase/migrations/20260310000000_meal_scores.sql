-- Meal Scores: stores per-meal glucose response scores and causal insights
CREATE TABLE IF NOT EXISTS public.meal_scores (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    meal_id UUID NOT NULL REFERENCES public.meals(id) ON DELETE CASCADE,

    -- Overall score
    score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
    score_label TEXT NOT NULL CHECK (score_label IN ('gentle', 'moderate', 'notable', 'sharp')),

    -- Component scores (each 0-100)
    peak_spike_score INTEGER NOT NULL,
    return_to_baseline_score INTEGER NOT NULL,
    variability_score INTEGER NOT NULL,
    time_in_range_score INTEGER NOT NULL,

    -- Raw component values (for insight engine)
    baseline_mg_dl NUMERIC,
    peak_mg_dl NUMERIC,
    peak_delta_mg_dl NUMERIC,
    return_to_baseline_min INTEGER,
    variability_sd NUMERIC,
    time_in_range_pct NUMERIC,

    -- Metadata
    glucose_reading_count INTEGER NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    window_end TIMESTAMPTZ NOT NULL,

    -- Meal tokens for similarity matching
    meal_tokens TEXT[],

    -- Causal insight
    insight_text TEXT,
    insight_type TEXT CHECK (insight_type IN ('comparison', 'pattern', 'pairing', 'experiment', 'celebration')),

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT unique_meal_score UNIQUE (meal_id)
);

-- Indexes
CREATE INDEX idx_meal_scores_user_id ON public.meal_scores(user_id);
CREATE INDEX idx_meal_scores_user_created ON public.meal_scores(user_id, created_at DESC);
CREATE INDEX idx_meal_scores_meal_tokens ON public.meal_scores USING gin(meal_tokens);

-- RLS
ALTER TABLE public.meal_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own meal scores" ON public.meal_scores FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own meal scores" ON public.meal_scores FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own meal scores" ON public.meal_scores FOR UPDATE USING (auth.uid() = user_id);
