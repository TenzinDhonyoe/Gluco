-- Daily check-in for zero-friction daily engagement
CREATE TABLE IF NOT EXISTS public.daily_checkins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    energy_level INTEGER CHECK (energy_level >= 1 AND energy_level <= 5),
    meals_logged JSONB DEFAULT '{"breakfast": false, "lunch": false, "dinner": false, "snacks": false}'::jsonb,
    mood_tag TEXT CHECK (mood_tag IN ('great', 'good', 'okay', 'low')),
    glucose_reading NUMERIC,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_checkins_user_date ON public.daily_checkins(user_id, date);

ALTER TABLE public.daily_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own daily checkins"
    ON public.daily_checkins FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users insert own daily checkins"
    ON public.daily_checkins FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own daily checkins"
    ON public.daily_checkins FOR UPDATE
    USING (auth.uid() = user_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_daily_checkins_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS daily_checkins_updated_at ON public.daily_checkins;
CREATE TRIGGER daily_checkins_updated_at
    BEFORE UPDATE ON public.daily_checkins
    FOR EACH ROW
    EXECUTE FUNCTION public.update_daily_checkins_updated_at();
