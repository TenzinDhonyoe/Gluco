-- Migration: Create user_metabolic_weekly_scores table for weekly score snapshots

CREATE TABLE IF NOT EXISTS user_metabolic_weekly_scores (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    week_start DATE NOT NULL,
    score7d INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_user_metabolic_weekly_scores_user_week
    ON user_metabolic_weekly_scores(user_id, week_start DESC);

ALTER TABLE user_metabolic_weekly_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own weekly metabolic scores"
    ON user_metabolic_weekly_scores FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage weekly metabolic scores"
    ON user_metabolic_weekly_scores FOR ALL
    USING (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION update_metabolic_weekly_scores_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_metabolic_weekly_scores_timestamp
    BEFORE UPDATE ON user_metabolic_weekly_scores
    FOR EACH ROW
    EXECUTE FUNCTION update_metabolic_weekly_scores_timestamp();

COMMENT ON TABLE user_metabolic_weekly_scores IS 'Weekly snapshots of Metabolic Response Score for smoothing.';
