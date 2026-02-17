-- ============================================
-- AI Personalization Engine
-- Tables: ai_output_history, weekly_reviews
-- Seeds: 6 behavioral program templates
-- ============================================

-- ============================================
-- 1) AI OUTPUT HISTORY (append-only audit log)
-- ============================================

CREATE TABLE IF NOT EXISTS public.ai_output_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    output_type TEXT NOT NULL CHECK (output_type IN ('next_best_action', 'weekly_review', 'score_explanation')),
    content_hash TEXT,
    title TEXT,
    body TEXT,
    action_type TEXT,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_output_history_user_type
    ON public.ai_output_history(user_id, output_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_output_history_dedup
    ON public.ai_output_history(user_id, content_hash);

ALTER TABLE public.ai_output_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own AI output history"
    ON public.ai_output_history FOR SELECT
    USING (auth.uid() = user_id);

-- Insert-only for service role (edge functions); users cannot insert directly
CREATE POLICY "Service role can insert AI output history"
    ON public.ai_output_history FOR INSERT
    WITH CHECK (true);

COMMENT ON TABLE public.ai_output_history IS 'Append-only log of AI-generated outputs for repetition avoidance and audit.';

-- ============================================
-- 2) WEEKLY REVIEWS
-- ============================================

CREATE TABLE IF NOT EXISTS public.weekly_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    week_start DATE NOT NULL,
    review_text TEXT NOT NULL,
    experiment_suggestion TEXT,
    key_metric TEXT NOT NULL,
    metric_direction TEXT NOT NULL CHECK (metric_direction IN ('up', 'down', 'stable')),
    journey_stage TEXT,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    dismissed_at TIMESTAMPTZ,

    UNIQUE (user_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_weekly_reviews_user_week
    ON public.weekly_reviews(user_id, week_start DESC);

ALTER TABLE public.weekly_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own weekly reviews"
    ON public.weekly_reviews FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update own weekly reviews"
    ON public.weekly_reviews FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Insert for service role (edge functions)
CREATE POLICY "Service role can insert weekly reviews"
    ON public.weekly_reviews FOR INSERT
    WITH CHECK (true);

COMMENT ON TABLE public.weekly_reviews IS 'User-facing weekly pattern reviews with dismissal lifecycle.';

-- ============================================
-- 3) SEED: 6 Behavioral Program Templates
-- ============================================

-- 3a) Your Top Response Food
INSERT INTO public.care_pathway_templates (slug, title, description, duration_days, steps, eligibility_rules)
VALUES (
    'your-top-response',
    'Your Top Response Food',
    'Identify your biggest glucose response food and build a plan to manage it over 21 days.',
    21,
    '[
        {"id":"w1-identify","day":1,"title":"Identify your top response food","description":"Review your meal logs to find the food category that affects your glucose the most.","action_type":"review_logs"},
        {"id":"w1-pick","day":2,"title":"Choose one reduction","description":"Pick one specific change — smaller portion, pairing with fiber, or swapping an ingredient.","action_type":"meal_composition"},
        {"id":"w1-practice","day":3,"title":"Practice the swap","description":"Apply your chosen change today and log the meal.","action_type":"log_meal"},
        {"id":"w1-check","day":7,"title":"Week 1 check-in","description":"Review how your glucose responded to the change this week.","action_type":"review_logs"},
        {"id":"w2-sustain","day":8,"title":"Sustain the reduction","description":"Keep applying the same change consistently this week.","action_type":"meal_composition"},
        {"id":"w2-track","day":10,"title":"Track your glucose response","description":"Compare your glucose patterns to last week.","action_type":"review_logs"},
        {"id":"w2-check","day":14,"title":"Week 2 check-in","description":"Evaluate whether the pattern is becoming a habit.","action_type":"review_logs"},
        {"id":"w3-evaluate","day":15,"title":"Evaluate and expand","description":"Decide whether to consolidate this change or pick a second reduction.","action_type":"review_logs"},
        {"id":"w3-consolidate","day":18,"title":"Consolidate or add","description":"Either lock in your current habit or layer a second small change.","action_type":"meal_composition"},
        {"id":"w3-recap","day":21,"title":"Program recap","description":"Review the full 3-week trend and celebrate your consistency.","action_type":"recap"}
    ]',
    '{"min_meals_logged": 10, "has_glucose_data": true}'
)
ON CONFLICT (slug) DO NOTHING;

-- 3b) Move After Meals
INSERT INTO public.care_pathway_templates (slug, title, description, duration_days, steps, eligibility_rules)
VALUES (
    'move-after-meals',
    'Move After Meals',
    'Build a post-meal movement habit with a 10-minute walk after your largest meal.',
    21,
    '[
        {"id":"d1-intro","day":1,"title":"Start with one walk","description":"Take a 10-minute walk after your largest meal today.","action_type":"post_meal_walk"},
        {"id":"d3-check","day":3,"title":"3-day check-in","description":"How did the walks feel? Any alternatives that work better (chair yoga, soleus pushups)?","action_type":"checkin"},
        {"id":"d5-alt","day":5,"title":"Try an alternative","description":"If walking is hard, try 5 minutes of soleus pushups or gentle stretching.","action_type":"light_activity"},
        {"id":"d7-review","day":7,"title":"Week 1 review","description":"Check your glucose curves on walk days vs non-walk days.","action_type":"review_logs"},
        {"id":"d10-expand","day":10,"title":"Expand your window","description":"Try walking after a second meal or extending to 15 minutes.","action_type":"post_meal_walk"},
        {"id":"d14-review","day":14,"title":"Week 2 review","description":"Review activity consistency and glucose response patterns.","action_type":"review_logs"},
        {"id":"d17-lock","day":17,"title":"Lock in the routine","description":"Your post-meal movement is becoming automatic. Keep it going.","action_type":"post_meal_walk"},
        {"id":"d21-recap","day":21,"title":"Program recap","description":"Celebrate 21 days of post-meal movement. Review your progress.","action_type":"recap"}
    ]',
    '{"min_meals_logged": 5}'
)
ON CONFLICT (slug) DO NOTHING;

-- 3c) Fiber First
INSERT INTO public.care_pathway_templates (slug, title, description, duration_days, steps, eligibility_rules)
VALUES (
    'fiber-first',
    'Fiber First',
    'Gradually increase fiber intake across meals over 21 days.',
    21,
    '[
        {"id":"w1-start","day":1,"title":"Add fiber to one meal","description":"Pick one meal today and add a fiber-rich food: vegetables, beans, lentils, or whole grains.","action_type":"fiber_boost"},
        {"id":"w1-pick","day":2,"title":"Choose your fiber foods","description":"Browse the food library and pick 3-5 fiber-rich foods you enjoy.","action_type":"meal_composition"},
        {"id":"w1-practice","day":4,"title":"Fiber at one meal daily","description":"Make fiber at one meal your daily baseline this week.","action_type":"fiber_boost"},
        {"id":"w1-check","day":7,"title":"Week 1 check-in","description":"Review your fiber intake and how meals with fiber made you feel.","action_type":"review_logs"},
        {"id":"w2-expand","day":8,"title":"Expand to two meals","description":"Add a fiber-rich food to a second meal each day.","action_type":"fiber_boost"},
        {"id":"w2-variety","day":11,"title":"Try something new","description":"Swap in a fiber food you have not tried yet this program.","action_type":"meal_composition"},
        {"id":"w2-check","day":14,"title":"Week 2 check-in","description":"Check if your fiber intake is consistently higher.","action_type":"review_logs"},
        {"id":"w3-consolidate","day":15,"title":"Consolidate the habit","description":"Fiber at two meals should feel natural now. Keep it up.","action_type":"fiber_boost"},
        {"id":"w3-reflect","day":18,"title":"Reflect on changes","description":"Notice any changes in energy, fullness, or glucose patterns?","action_type":"checkin"},
        {"id":"w3-recap","day":21,"title":"Program recap","description":"Review your 3-week fiber journey and celebrate consistency.","action_type":"recap"}
    ]',
    '{"min_meals_logged": 5}'
)
ON CONFLICT (slug) DO NOTHING;

-- 3d) Planned Flex
INSERT INTO public.care_pathway_templates (slug, title, description, duration_days, steps, eligibility_rules)
VALUES (
    'planned-flex',
    'Planned Flex',
    'One weekly meal with zero tracking to prevent psychological burnout. Repeating enrollment.',
    7,
    '[
        {"id":"d1-choose","day":1,"title":"Choose your flex meal","description":"Pick one meal this week where you eat whatever you want with zero tracking.","action_type":"planned_flex"},
        {"id":"d3-remind","day":3,"title":"Midweek reminder","description":"Your flex meal is coming up. No logging, no review — just enjoy.","action_type":"planned_flex"},
        {"id":"d7-reflect","day":7,"title":"Weekly reflection","description":"How did having a planned flex meal feel? Ready to re-enroll for next week?","action_type":"checkin"}
    ]',
    '{"min_days_enrolled": 14, "is_repeating": true}'
)
ON CONFLICT (slug) DO NOTHING;

-- 3e) Weekly Pattern Review
INSERT INTO public.care_pathway_templates (slug, title, description, duration_days, steps, eligibility_rules)
VALUES (
    'weekly-pattern-review',
    'Weekly Pattern Review',
    'App surfaces one pattern per week with a pre-written experiment suggestion. Repeating enrollment.',
    7,
    '[
        {"id":"d1-surface","day":1,"title":"Your pattern this week","description":"The app has identified one pattern from your data. Review it and consider the suggested experiment.","action_type":"review_logs"},
        {"id":"d4-try","day":4,"title":"Try the experiment","description":"Apply the suggested small change today and see what happens.","action_type":"experiment"},
        {"id":"d7-review","day":7,"title":"Weekly review","description":"Did the experiment change anything? Review and reset for next week.","action_type":"recap"}
    ]',
    '{"min_meals_logged": 7, "is_repeating": true}'
)
ON CONFLICT (slug) DO NOTHING;

-- 3f) Order and Rhythm
INSERT INTO public.care_pathway_templates (slug, title, description, duration_days, steps, eligibility_rules)
VALUES (
    'order-and-rhythm',
    'Order and Rhythm',
    'Meal component sequencing and consistent meal timing over 21 days.',
    21,
    '[
        {"id":"w1-order","day":1,"title":"Vegetables and protein first","description":"At your next meal, eat vegetables and protein before carbs.","action_type":"meal_composition"},
        {"id":"w1-practice","day":3,"title":"Practice the order","description":"Apply vegetable-protein-carb sequencing to at least one meal today.","action_type":"meal_composition"},
        {"id":"w1-timing","day":5,"title":"Notice your meal timing","description":"What time do you usually eat each meal? Start noticing your natural rhythm.","action_type":"meal_timing"},
        {"id":"w1-check","day":7,"title":"Week 1 check-in","description":"Review how meal sequencing felt and whether you noticed any difference.","action_type":"review_logs"},
        {"id":"w2-consistent","day":8,"title":"Consistent timing","description":"Try to eat meals within a 1-hour window of the same time each day.","action_type":"meal_timing"},
        {"id":"w2-combine","day":10,"title":"Combine order and timing","description":"Apply both sequencing and consistent timing to your main meals.","action_type":"meal_composition"},
        {"id":"w2-check","day":14,"title":"Week 2 check-in","description":"Compare glucose patterns between ordered and unordered meals.","action_type":"review_logs"},
        {"id":"w3-habit","day":15,"title":"Make it automatic","description":"By now the sequencing should feel natural. Focus on consistency.","action_type":"meal_composition"},
        {"id":"w3-rhythm","day":18,"title":"Lock in your rhythm","description":"Your meal timing and sequencing rhythm is your new baseline.","action_type":"meal_timing"},
        {"id":"w3-recap","day":21,"title":"Program recap","description":"Review the full 3-week journey of order and rhythm changes.","action_type":"recap"}
    ]',
    '{"min_meals_logged": 5}'
)
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- 4) UPDATED_AT TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION public.update_weekly_reviews_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.generated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS weekly_reviews_updated_at ON public.weekly_reviews;
CREATE TRIGGER weekly_reviews_updated_at
    BEFORE UPDATE ON public.weekly_reviews
    FOR EACH ROW
    EXECUTE FUNCTION public.update_weekly_reviews_updated_at();
