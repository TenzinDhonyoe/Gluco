-- Migration: Create metabolic_daily_features table for per-day feature vectors
-- Used by insights tab to store computed daily metrics for ML/insights pipeline

CREATE TABLE IF NOT EXISTS metabolic_daily_features (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    feature_version INTEGER NOT NULL DEFAULT 1,

    -- Glucose metrics
    glucose_avg DECIMAL(6,2),
    glucose_cv DECIMAL(6,4),
    glucose_logs_count INTEGER NOT NULL DEFAULT 0,
    time_in_range_pct DECIMAL(5,2),

    -- Meal metrics
    meal_count INTEGER NOT NULL DEFAULT 0,
    meal_checkin_count INTEGER NOT NULL DEFAULT 0,
    fibre_g_avg DECIMAL(6,2),

    -- Activity / wearable metrics
    steps INTEGER,
    active_minutes INTEGER,
    sleep_hours DECIMAL(4,2),
    resting_hr DECIMAL(5,1),
    hrv_ms DECIMAL(6,2),

    -- Cross-metric interactions (JSON)
    interactions JSONB,

    -- Metadata
    last_synced_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    PRIMARY KEY (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_metabolic_daily_features_user_date
    ON metabolic_daily_features(user_id, date DESC);

ALTER TABLE metabolic_daily_features ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'metabolic_daily_features' AND policyname = 'Users can view own daily features'
    ) THEN
        CREATE POLICY "Users can view own daily features"
            ON metabolic_daily_features FOR SELECT
            USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'metabolic_daily_features' AND policyname = 'Users can upsert own daily features'
    ) THEN
        CREATE POLICY "Users can upsert own daily features"
            ON metabolic_daily_features FOR INSERT
            WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'metabolic_daily_features' AND policyname = 'Users can update own daily features'
    ) THEN
        CREATE POLICY "Users can update own daily features"
            ON metabolic_daily_features FOR UPDATE
            USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'metabolic_daily_features' AND policyname = 'Service role can manage all daily features'
    ) THEN
        CREATE POLICY "Service role can manage all daily features"
            ON metabolic_daily_features FOR ALL
            USING (auth.role() = 'service_role');
    END IF;
END $$;

CREATE OR REPLACE FUNCTION update_metabolic_daily_features_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trigger_update_metabolic_daily_features_timestamp'
    ) THEN
        CREATE TRIGGER trigger_update_metabolic_daily_features_timestamp
            BEFORE UPDATE ON metabolic_daily_features
            FOR EACH ROW
            EXECUTE FUNCTION update_metabolic_daily_features_timestamp();
    END IF;
END $$;

COMMENT ON TABLE metabolic_daily_features IS 'Per-day feature vectors for metabolic insights pipeline.';
