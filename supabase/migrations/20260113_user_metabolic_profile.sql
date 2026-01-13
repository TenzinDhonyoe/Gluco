-- Migration: Create user_metabolic_profile table for caching personalized baselines and sensitivities
-- This enables consistent "it knows me" experience and cheaper inference

CREATE TABLE IF NOT EXISTS user_metabolic_profile (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Baselines (rolling 28-day median)
    baseline_resting_hr DECIMAL(5,1),
    baseline_steps INTEGER,
    baseline_sleep_hours DECIMAL(3,1),
    baseline_hrv_ms DECIMAL(5,1),
    baseline_metabolic_score INTEGER,
    
    -- Sensitivities (slope-based: low/medium/high/unknown)
    sensitivity_sleep TEXT DEFAULT 'unknown' CHECK (sensitivity_sleep IN ('low', 'medium', 'high', 'unknown')),
    sensitivity_steps TEXT DEFAULT 'unknown' CHECK (sensitivity_steps IN ('low', 'medium', 'high', 'unknown')),
    sensitivity_recovery TEXT DEFAULT 'unknown' CHECK (sensitivity_recovery IN ('slow', 'average', 'fast', 'unknown')),
    
    -- Patterns (boolean flags)
    pattern_weekend_disruption BOOLEAN DEFAULT FALSE,
    pattern_sleep_sensitive BOOLEAN DEFAULT FALSE,
    pattern_activity_sensitive BOOLEAN DEFAULT FALSE,
    
    -- Data coverage for confidence
    data_coverage_days INTEGER DEFAULT 0,
    valid_days_for_sensitivity INTEGER DEFAULT 0,
    
    -- Metadata
    last_updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_user_metabolic_profile_updated 
    ON user_metabolic_profile(last_updated_at);

-- Enable RLS
ALTER TABLE user_metabolic_profile ENABLE ROW LEVEL SECURITY;

-- Users can only see their own profile
CREATE POLICY "Users can view own metabolic profile"
    ON user_metabolic_profile FOR SELECT
    USING (auth.uid() = user_id);

-- Service role can manage all profiles
CREATE POLICY "Service role can manage all metabolic profiles"
    ON user_metabolic_profile FOR ALL
    USING (auth.role() = 'service_role');

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_metabolic_profile_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_metabolic_profile_timestamp
    BEFORE UPDATE ON user_metabolic_profile
    FOR EACH ROW
    EXECUTE FUNCTION update_metabolic_profile_timestamp();

COMMENT ON TABLE user_metabolic_profile IS 'Cached user metabolic baselines and sensitivities for personalized AI insights';
