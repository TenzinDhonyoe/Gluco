-- ============================================
-- EXPERIMENTS BACKEND SCHEMA
-- ============================================
-- Template catalog (meals + habits experiments)
-- User experiment runs, events, and analysis
-- ============================================

-- ============================================
-- 1. EXPERIMENT TEMPLATES (Admin-seeded catalog)
-- ============================================

CREATE TABLE IF NOT EXISTS experiment_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    subtitle TEXT,
    description TEXT,
    category TEXT NOT NULL CHECK (category IN ('meal', 'habit', 'timing', 'portion')),
    
    -- Protocol defines how the experiment works
    -- e.g., { "duration_days": 12, "exposures_per_variant": 6, "alternating": true, "meal_type": "breakfast" }
    protocol JSONB NOT NULL DEFAULT '{}',
    
    -- Optional eligibility rules
    eligibility_rules JSONB DEFAULT '{}',
    
    -- Icon/emoji for UI display
    icon TEXT DEFAULT '🧪',
    
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create index for active templates
CREATE INDEX IF NOT EXISTS idx_experiment_templates_active 
ON experiment_templates(is_active, sort_order);

-- ============================================
-- 2. EXPERIMENT VARIANTS (A/B or multi-arm)
-- ============================================

CREATE TABLE IF NOT EXISTS experiment_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES experiment_templates(id) ON DELETE CASCADE,
    
    -- Variant identifier (e.g., 'A', 'B', 'control', 'treatment')
    key TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    
    -- Variant-specific parameters
    -- e.g., { "food": "oatmeal", "portion_pct": 100 } or { "walk_minutes": 15, "walk_timing": "post_meal" }
    parameters JSONB NOT NULL DEFAULT '{}',
    
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    
    UNIQUE(template_id, key)
);

-- Index for efficient lookup by template
CREATE INDEX IF NOT EXISTS idx_experiment_variants_template 
ON experiment_variants(template_id);

-- ============================================
-- 3. USER EXPERIMENTS (A user's run of an experiment)
-- ============================================

CREATE TABLE IF NOT EXISTS user_experiments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    template_id UUID NOT NULL REFERENCES experiment_templates(id),
    
    -- Experiment status lifecycle
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'archived')),
    
    -- Timing
    start_at TIMESTAMPTZ,
    end_at TIMESTAMPTZ,  -- Planned end
    completed_at TIMESTAMPTZ,  -- Actual completion
    
    -- User's customized plan
    -- e.g., { "exposures_per_variant": 6, "schedule": "alternating_days", "meal_type": "breakfast" }
    plan JSONB DEFAULT '{}',
    
    -- Primary metric to track (default: peak_delta)
    primary_metric TEXT DEFAULT 'peak_delta',
    metric_config JSONB DEFAULT '{}',
    
    -- Why this was recommended to the user
    -- e.g., { "reasons": ["Your breakfasts often spike", "You eat oatmeal frequently"], "predicted_impact": "moderate" }
    personalization JSONB DEFAULT '{}',
    
    -- Progress tracking
    exposures_logged INTEGER DEFAULT 0,
    checkins_logged INTEGER DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for user experiments
CREATE INDEX IF NOT EXISTS idx_user_experiments_user 
ON user_experiments(user_id, status);

CREATE INDEX IF NOT EXISTS idx_user_experiments_template 
ON user_experiments(template_id);

CREATE INDEX IF NOT EXISTS idx_user_experiments_status 
ON user_experiments(status, start_at);

-- ============================================
-- 4. USER EXPERIMENT EVENTS (All activities during an experiment)
-- ============================================

CREATE TABLE IF NOT EXISTS user_experiment_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user_experiment_id UUID NOT NULL REFERENCES user_experiments(id) ON DELETE CASCADE,
    
    -- When this event occurred
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Event type
    type TEXT NOT NULL CHECK (type IN ('exposure', 'checkin', 'note', 'link_meal', 'link_activity')),
    
    -- Event payload varies by type:
    -- exposure: { "variant_id": "uuid", "variant_key": "A", "meal_id": "uuid?", "adherence_pct": 100 }
    -- checkin: { "energy_1_5": 4, "hunger_1_5": 3, "cravings_1_5": 2, "difficulty_1_5": 2, "notes": "..." }
    -- note: { "text": "..." }
    -- link_meal: { "meal_id": "uuid", "variant_id": "uuid" }
    -- link_activity: { "activity_log_id": "uuid", "variant_id": "uuid?" }
    payload JSONB NOT NULL DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for efficient event queries
CREATE INDEX IF NOT EXISTS idx_user_experiment_events_experiment 
ON user_experiment_events(user_experiment_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_user_experiment_events_user 
ON user_experiment_events(user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_experiment_events_type 
ON user_experiment_events(user_experiment_id, type);

-- ============================================
-- 5. USER EXPERIMENT ANALYSIS (Cached results snapshots)
-- ============================================

CREATE TABLE IF NOT EXISTS user_experiment_analysis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user_experiment_id UUID NOT NULL REFERENCES user_experiments(id) ON DELETE CASCADE,
    
    -- When this analysis was computed
    computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Per-variant aggregated metrics
    -- e.g., {
    --   "A": { "median_peak_delta": 2.1, "mean_peak_delta": 2.3, "n_exposures": 5, "n_with_data": 4 },
    --   "B": { "median_peak_delta": 1.5, "mean_peak_delta": 1.6, "n_exposures": 5, "n_with_data": 5 }
    -- }
    metrics JSONB NOT NULL DEFAULT '{}',
    
    -- Overall comparison
    -- e.g., { "winner": "B", "delta": -0.6, "confidence": "moderate", "p_value": null }
    comparison JSONB DEFAULT '{}',
    
    -- AI-generated summary (Gemini)
    summary TEXT,
    
    -- Suggested next steps
    -- e.g., ["Continue the experiment for more data", "Try adding fiber to variant A"]
    suggestions JSONB DEFAULT '[]',
    
    -- Whether this is the final analysis
    is_final BOOLEAN DEFAULT false,
    
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fetching latest analysis
CREATE INDEX IF NOT EXISTS idx_user_experiment_analysis_experiment 
ON user_experiment_analysis(user_experiment_id, computed_at DESC);

-- ============================================
-- 6. ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE experiment_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiment_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_experiment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_experiment_analysis ENABLE ROW LEVEL SECURITY;

-- Templates: Read-only for authenticated users
CREATE POLICY "Templates are readable by authenticated users"
ON experiment_templates FOR SELECT
TO authenticated
USING (is_active = true);

-- Variants: Read-only for authenticated users
CREATE POLICY "Variants are readable by authenticated users"
ON experiment_variants FOR SELECT
TO authenticated
USING (true);

-- User experiments: Users can only access their own
CREATE POLICY "Users can view their own experiments"
ON user_experiments FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own experiments"
ON user_experiments FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own experiments"
ON user_experiments FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- User experiment events: Users can only access their own
CREATE POLICY "Users can view their own experiment events"
ON user_experiment_events FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own experiment events"
ON user_experiment_events FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- User experiment analysis: Users can only access their own
CREATE POLICY "Users can view their own experiment analysis"
ON user_experiment_analysis FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own experiment analysis"
ON user_experiment_analysis FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- ============================================
-- 7. SEED INITIAL TEMPLATES
-- ============================================

-- Insert initial experiment templates
INSERT INTO experiment_templates (slug, title, subtitle, description, category, protocol, icon, sort_order)
VALUES 
    (
        'oatmeal-vs-eggs',
        'Oatmeal vs Eggs',
        'Breakfast Spike Test',
        'Compare how your glucose responds to oatmeal versus eggs for breakfast. Try 6 breakfasts, alternating days.',
        'meal',
        '{
            "duration_days": 12,
            "exposures_per_variant": 6,
            "alternating": true,
            "meal_type": "breakfast",
            "checkin_questions": ["energy", "hunger", "cravings"],
            "instructions": "Alternate between oatmeal and eggs for breakfast. Log each meal and complete a post-meal review."
        }'::jsonb,
        '🥣',
        1
    ),
    (
        'rice-portion-swap',
        'Rice Portion Swap',
        'Half vs Full Plate',
        'Does portion size affect your glucose rises? Compare half portions vs full portions of rice with your meals.',
        'portion',
        '{
            "duration_days": 10,
            "exposures_per_variant": 5,
            "alternating": true,
            "meal_type": "any",
            "checkin_questions": ["hunger", "satisfaction", "cravings"],
            "instructions": "When eating rice, alternate between half your usual portion and your full portion. Track how satisfied you feel."
        }'::jsonb,
        '🍚',
        2
    ),
    (
        'post-meal-walk',
        'Post-Meal Walk',
        '15-Minute Walk Test',
        'See if a short walk after eating helps reduce your glucose spike. Compare meals with and without a 15-minute walk.',
        'habit',
        '{
            "duration_days": 10,
            "exposures_per_variant": 5,
            "alternating": true,
            "meal_type": "lunch_or_dinner",
            "activity_type": "walk",
            "activity_duration_minutes": 15,
            "activity_timing": "within_30_min_post_meal",
            "checkin_questions": ["energy", "difficulty"],
            "instructions": "After some meals, take a 15-minute walk within 30 minutes. Skip the walk after other meals. Log both."
        }'::jsonb,
        '🚶',
        3
    ),
    (
        'fiber-preload',
        'Fiber Preload',
        'Vegetables First',
        'Test if eating vegetables or fiber-rich foods before your main meal reduces your glucose response.',
        'habit',
        '{
            "duration_days": 10,
            "exposures_per_variant": 5,
            "alternating": true,
            "meal_type": "lunch_or_dinner",
            "preload_type": "fiber",
            "preload_timing_minutes": 10,
            "checkin_questions": ["hunger", "difficulty"],
            "instructions": "Before some meals, eat a small portion of vegetables or salad 10 minutes before your main food. Eat normally for comparison meals."
        }'::jsonb,
        '🥗',
        4
    ),
    (
        'meal-timing',
        'Meal Timing',
        'Early vs Late Dinner',
        'Compare how your glucose responds to eating dinner earlier (before 7pm) versus later (after 8pm).',
        'timing',
        '{
            "duration_days": 12,
            "exposures_per_variant": 6,
            "alternating": true,
            "meal_type": "dinner",
            "timing_variants": {
                "early": { "before_hour": 19 },
                "late": { "after_hour": 20 }
            },
            "checkin_questions": ["hunger", "sleep_quality"],
            "instructions": "Try eating dinner before 7pm on some days and after 8pm on others. Note how you sleep afterwards."
        }'::jsonb,
        '🕐',
        5
    ),
    (
        'breakfast-skip',
        'Breakfast Skip',
        'Intermittent Fasting Test',
        'See how skipping breakfast affects your glucose patterns and mid-morning energy levels.',
        'timing',
        '{
            "duration_days": 10,
            "exposures_per_variant": 5,
            "alternating": true,
            "meal_type": "breakfast",
            "fasting_variant": true,
            "checkin_questions": ["energy", "hunger", "focus"],
            "instructions": "On some days eat your normal breakfast. On other days, skip breakfast and have your first meal at lunch. Track your energy and focus."
        }'::jsonb,
        '⏰',
        6
    )
ON CONFLICT (slug) DO UPDATE SET
    title = EXCLUDED.title,
    subtitle = EXCLUDED.subtitle,
    description = EXCLUDED.description,
    protocol = EXCLUDED.protocol,
    icon = EXCLUDED.icon,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

-- Insert variants for oatmeal-vs-eggs
INSERT INTO experiment_variants (template_id, key, name, description, parameters, sort_order)
SELECT 
    t.id,
    v.key,
    v.name,
    v.description,
    v.parameters::jsonb,
    v.sort_order
FROM experiment_templates t
CROSS JOIN (VALUES 
    ('A', 'Oatmeal', 'Steel-cut or rolled oats with your usual toppings', '{"food_type": "oatmeal", "category": "whole_grain"}', 1),
    ('B', 'Eggs', 'Eggs prepared any way you like (scrambled, fried, boiled)', '{"food_type": "eggs", "category": "protein"}', 2)
) AS v(key, name, description, parameters, sort_order)
WHERE t.slug = 'oatmeal-vs-eggs'
ON CONFLICT (template_id, key) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    parameters = EXCLUDED.parameters;

-- Insert variants for rice-portion-swap
INSERT INTO experiment_variants (template_id, key, name, description, parameters, sort_order)
SELECT 
    t.id,
    v.key,
    v.name,
    v.description,
    v.parameters::jsonb,
    v.sort_order
FROM experiment_templates t
CROSS JOIN (VALUES 
    ('A', 'Half Portion', 'Reduce rice to about half your usual serving', '{"portion_pct": 50, "food_type": "rice"}', 1),
    ('B', 'Full Portion', 'Your normal/usual rice serving size', '{"portion_pct": 100, "food_type": "rice"}', 2)
) AS v(key, name, description, parameters, sort_order)
WHERE t.slug = 'rice-portion-swap'
ON CONFLICT (template_id, key) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    parameters = EXCLUDED.parameters;

-- Insert variants for post-meal-walk
INSERT INTO experiment_variants (template_id, key, name, description, parameters, sort_order)
SELECT 
    t.id,
    v.key,
    v.name,
    v.description,
    v.parameters::jsonb,
    v.sort_order
FROM experiment_templates t
CROSS JOIN (VALUES 
    ('A', 'With Walk', 'Take a 15-minute walk within 30 minutes after eating', '{"walk": true, "walk_minutes": 15, "timing": "post_meal"}', 1),
    ('B', 'No Walk', 'Rest or do your normal activities (no intentional walk)', '{"walk": false}', 2)
) AS v(key, name, description, parameters, sort_order)
WHERE t.slug = 'post-meal-walk'
ON CONFLICT (template_id, key) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    parameters = EXCLUDED.parameters;

-- Insert variants for fiber-preload
INSERT INTO experiment_variants (template_id, key, name, description, parameters, sort_order)
SELECT 
    t.id,
    v.key,
    v.name,
    v.description,
    v.parameters::jsonb,
    v.sort_order
FROM experiment_templates t
CROSS JOIN (VALUES 
    ('A', 'Fiber First', 'Eat vegetables or salad 10 minutes before your main meal', '{"preload": true, "preload_type": "fiber", "timing_minutes": 10}', 1),
    ('B', 'Normal Order', 'Eat your meal in your usual order', '{"preload": false}', 2)
) AS v(key, name, description, parameters, sort_order)
WHERE t.slug = 'fiber-preload'
ON CONFLICT (template_id, key) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    parameters = EXCLUDED.parameters;

-- Insert variants for meal-timing
INSERT INTO experiment_variants (template_id, key, name, description, parameters, sort_order)
SELECT 
    t.id,
    v.key,
    v.name,
    v.description,
    v.parameters::jsonb,
    v.sort_order
FROM experiment_templates t
CROSS JOIN (VALUES 
    ('A', 'Early Dinner', 'Eat dinner before 7:00 PM', '{"timing": "early", "before_hour": 19}', 1),
    ('B', 'Late Dinner', 'Eat dinner after 8:00 PM', '{"timing": "late", "after_hour": 20}', 2)
) AS v(key, name, description, parameters, sort_order)
WHERE t.slug = 'meal-timing'
ON CONFLICT (template_id, key) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    parameters = EXCLUDED.parameters;

-- Insert variants for breakfast-skip
INSERT INTO experiment_variants (template_id, key, name, description, parameters, sort_order)
SELECT 
    t.id,
    v.key,
    v.name,
    v.description,
    v.parameters::jsonb,
    v.sort_order
FROM experiment_templates t
CROSS JOIN (VALUES 
    ('A', 'Eat Breakfast', 'Have your normal breakfast in the morning', '{"skip": false, "meal_type": "breakfast"}', 1),
    ('B', 'Skip Breakfast', 'Fast until lunch (water/black coffee OK)', '{"skip": true, "fasting": true}', 2)
) AS v(key, name, description, parameters, sort_order)
WHERE t.slug = 'breakfast-skip'
ON CONFLICT (template_id, key) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    parameters = EXCLUDED.parameters;

-- ============================================
-- 8. HELPER FUNCTIONS
-- ============================================

-- Function to get experiment progress
CREATE OR REPLACE FUNCTION get_experiment_progress(p_user_experiment_id UUID)
RETURNS TABLE (
    total_exposures INTEGER,
    exposures_with_data INTEGER,
    variant_counts JSONB,
    completion_pct NUMERIC
) AS $$
DECLARE
    v_protocol JSONB;
    v_required_exposures INTEGER;
BEGIN
    -- Get the protocol to determine required exposures
    SELECT et.protocol INTO v_protocol
    FROM user_experiments ue
    JOIN experiment_templates et ON et.id = ue.template_id
    WHERE ue.id = p_user_experiment_id;
    
    v_required_exposures := COALESCE(
        (v_protocol->>'exposures_per_variant')::INTEGER * 2,
        10
    );
    
    RETURN QUERY
    SELECT 
        COUNT(*)::INTEGER AS total_exposures,
        COUNT(CASE WHEN e.payload->>'meal_id' IS NOT NULL THEN 1 END)::INTEGER AS exposures_with_data,
        jsonb_object_agg(
            COALESCE(e.payload->>'variant_key', 'unknown'),
            COUNT(*)
        ) AS variant_counts,
        ROUND((COUNT(*)::NUMERIC / v_required_exposures) * 100, 1) AS completion_pct
    FROM user_experiment_events e
    WHERE e.user_experiment_id = p_user_experiment_id
    AND e.type = 'exposure';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_experiment_progress(UUID) TO authenticated;

-- ============================================
-- 9. GRANTS
-- ============================================

GRANT SELECT ON experiment_templates TO authenticated;
GRANT SELECT ON experiment_variants TO authenticated;
GRANT SELECT, INSERT, UPDATE ON user_experiments TO authenticated;
GRANT SELECT, INSERT ON user_experiment_events TO authenticated;
GRANT SELECT, INSERT ON user_experiment_analysis TO authenticated;

-- Service role needs full access for edge functions
GRANT ALL ON experiment_templates TO service_role;
GRANT ALL ON experiment_variants TO service_role;
GRANT ALL ON user_experiments TO service_role;
GRANT ALL ON user_experiment_events TO service_role;
GRANT ALL ON user_experiment_analysis TO service_role;
