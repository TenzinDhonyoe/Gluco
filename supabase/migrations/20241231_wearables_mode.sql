-- Migration: Add wearables-only tracking mode support
-- Created: 2024-12-31

-- ============================================
-- PROFILES: Add tracking mode columns
-- ============================================

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS tracking_mode text DEFAULT 'glucose_tracking' 
CHECK (tracking_mode IN ('wearables_only', 'glucose_tracking'));

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS manual_glucose_enabled boolean DEFAULT false;

-- ============================================
-- DAILY_CONTEXT: Store HealthKit data per day
-- ============================================

CREATE TABLE IF NOT EXISTS daily_context (
    user_id uuid REFERENCES auth.users NOT NULL,
    date date NOT NULL,
    steps integer,
    active_minutes integer,
    sleep_hours numeric(4,2),
    resting_hr numeric(5,2),
    hrv_ms numeric(6,2),
    source text DEFAULT 'apple_health' CHECK (source IN ('apple_health', 'manual', 'estimated')),
    last_synced_at timestamptz DEFAULT now(),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    PRIMARY KEY (user_id, date)
);

-- ============================================
-- RLS: Row Level Security for daily_context
-- ============================================

ALTER TABLE daily_context ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only SELECT their own daily context
CREATE POLICY select_own_daily_context ON daily_context 
    FOR SELECT 
    USING (auth.uid() = user_id);

-- Policy: Users can only INSERT their own daily context
CREATE POLICY insert_own_daily_context ON daily_context 
    FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

-- Policy: Users can only UPDATE their own daily context
CREATE POLICY update_own_daily_context ON daily_context 
    FOR UPDATE 
    USING (auth.uid() = user_id);

-- Policy: Users can only DELETE their own daily context
CREATE POLICY delete_own_daily_context ON daily_context 
    FOR DELETE 
    USING (auth.uid() = user_id);

-- ============================================
-- INDEXES: Performance optimization
-- ============================================

-- Index for range queries (most common access pattern)
CREATE INDEX IF NOT EXISTS idx_daily_context_user_date_desc 
    ON daily_context (user_id, date DESC);

-- ============================================
-- TRIGGER: Auto-update updated_at timestamp
-- ============================================

CREATE OR REPLACE FUNCTION update_daily_context_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS daily_context_updated_at ON daily_context;
CREATE TRIGGER daily_context_updated_at
    BEFORE UPDATE ON daily_context
    FOR EACH ROW
    EXECUTE FUNCTION update_daily_context_updated_at();
