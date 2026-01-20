-- ============================================
-- Action loops, care pathways, and daily feature store
-- ============================================

-- ============================================
-- 1) USER ACTIONS (Insight -> Action loop)
-- ============================================

CREATE TABLE IF NOT EXISTS public.user_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Insight source
    source_insight_id TEXT,

    -- Action definition
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    action_type TEXT NOT NULL,
    action_params JSONB NOT NULL DEFAULT '{}',

    -- Time window to complete action (24-72h recommended)
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    window_end TIMESTAMPTZ NOT NULL,

    -- Status lifecycle
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'expired', 'cancelled')),
    completed_at TIMESTAMPTZ,
    completion_source TEXT,

    -- Outcome tracking
    baseline_metric JSONB,
    outcome_metric JSONB,
    delta_value NUMERIC,
    improved BOOLEAN,
    last_evaluated_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_actions_user_status
    ON public.user_actions(user_id, status, window_end DESC);

CREATE INDEX IF NOT EXISTS idx_user_actions_window
    ON public.user_actions(user_id, window_start DESC);

ALTER TABLE public.user_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own actions"
    ON public.user_actions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own actions"
    ON public.user_actions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own actions"
    ON public.user_actions FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own actions"
    ON public.user_actions FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================
-- 2) CARE PATHWAY TEMPLATES + USER RUNS
-- ============================================

CREATE TABLE IF NOT EXISTS public.care_pathway_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    duration_days INTEGER NOT NULL DEFAULT 7,
    steps JSONB NOT NULL DEFAULT '[]',
    eligibility_rules JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_care_pathway_templates_slug
    ON public.care_pathway_templates(slug);

ALTER TABLE public.care_pathway_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Templates are readable by all authenticated users"
    ON public.care_pathway_templates FOR SELECT
    USING (auth.role() = 'authenticated');

-- Seed a default 7-day high glucose trend pathway
INSERT INTO public.care_pathway_templates (slug, title, description, duration_days, steps)
VALUES (
    'high-glucose-7d-reset',
    '7-Day Glucose Reset',
    'A focused 7-day plan to stabilize post-meal patterns.',
    7,
    '[
        {"id":"day-1","day":1,"title":"Anchor breakfast","description":"Add protein + fiber to your first meal.","action_type":"meal_composition"},
        {"id":"day-2","day":2,"title":"Post-meal walk","description":"Take a 10-15 min walk after your largest meal.","action_type":"post_meal_walk"},
        {"id":"day-3","day":3,"title":"Earlier dinner","description":"Shift dinner 1-2 hours earlier.","action_type":"meal_timing"},
        {"id":"day-4","day":4,"title":"Fiber boost","description":"Add one extra fiber-rich side.","action_type":"fiber_boost"},
        {"id":"day-5","day":5,"title":"Sleep window","description":"Aim for a consistent 7-8 hour sleep window.","action_type":"sleep_window"},
        {"id":"day-6","day":6,"title":"Light activity","description":"Add 20 minutes of light activity.","action_type":"light_activity"},
        {"id":"day-7","day":7,"title":"Check-in + recap","description":"Log how you felt and review the trend delta.","action_type":"recap"}
    ]'
)
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.user_care_pathways (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    template_id UUID NOT NULL REFERENCES public.care_pathway_templates(id),

    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'expired', 'cancelled')),
    start_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_at TIMESTAMPTZ NOT NULL,

    baseline_metrics JSONB,
    outcome_metrics JSONB,
    delta JSONB,

    progress JSONB NOT NULL DEFAULT '{}',

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_care_pathways_user_status
    ON public.user_care_pathways(user_id, status, start_at DESC);

ALTER TABLE public.user_care_pathways ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own care pathways"
    ON public.user_care_pathways FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own care pathways"
    ON public.user_care_pathways FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own care pathways"
    ON public.user_care_pathways FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own care pathways"
    ON public.user_care_pathways FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================
-- 3) METABOLIC DAILY FEATURE STORE
-- ============================================

CREATE TABLE IF NOT EXISTS public.metabolic_daily_features (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    feature_version INTEGER NOT NULL DEFAULT 1,

    -- Glucose
    glucose_avg NUMERIC(6,2),
    glucose_cv NUMERIC(6,2),
    glucose_logs_count INTEGER DEFAULT 0,
    time_in_range_pct NUMERIC(5,2),

    -- Meals
    meal_count INTEGER DEFAULT 0,
    meal_checkin_count INTEGER DEFAULT 0,
    fibre_g_avg NUMERIC(6,2),

    -- Wearables / activity
    steps INTEGER,
    active_minutes INTEGER,
    sleep_hours NUMERIC(4,2),
    resting_hr NUMERIC(5,2),
    hrv_ms NUMERIC(5,2),

    -- Derived interactions and standardized definitions
    interactions JSONB NOT NULL DEFAULT '{}',

    last_synced_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    PRIMARY KEY (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_metabolic_daily_features_user_date
    ON public.metabolic_daily_features(user_id, date DESC);

ALTER TABLE public.metabolic_daily_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own daily features"
    ON public.metabolic_daily_features FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own daily features"
    ON public.metabolic_daily_features FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own daily features"
    ON public.metabolic_daily_features FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own daily features"
    ON public.metabolic_daily_features FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================
-- 4) UPDATED_AT TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION public.update_user_actions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_actions_updated_at ON public.user_actions;
CREATE TRIGGER user_actions_updated_at
    BEFORE UPDATE ON public.user_actions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_user_actions_updated_at();

CREATE OR REPLACE FUNCTION public.update_care_pathways_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS care_pathways_updated_at ON public.user_care_pathways;
CREATE TRIGGER care_pathways_updated_at
    BEFORE UPDATE ON public.user_care_pathways
    FOR EACH ROW
    EXECUTE FUNCTION public.update_care_pathways_updated_at();

CREATE OR REPLACE FUNCTION public.update_daily_features_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS metabolic_daily_features_updated_at ON public.metabolic_daily_features;
CREATE TRIGGER metabolic_daily_features_updated_at
    BEFORE UPDATE ON public.metabolic_daily_features
    FOR EACH ROW
    EXECUTE FUNCTION public.update_daily_features_updated_at();

COMMENT ON TABLE public.user_actions IS 'Short window behavior-change actions linked to insights and outcomes.';
COMMENT ON TABLE public.user_care_pathways IS 'Structured multi-day care pathways with baseline/outcome tracking.';
COMMENT ON TABLE public.metabolic_daily_features IS 'Standardized daily metabolic feature store for longitudinal analysis.';
