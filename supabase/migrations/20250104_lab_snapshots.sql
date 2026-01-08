-- Migration: lab_snapshots table for Metabolic Response Score
-- Stores user-entered routine lab values for wellness scoring

-- Create lab_snapshots table
CREATE TABLE IF NOT EXISTS public.lab_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Fasting glucose
    fasting_glucose_value NUMERIC(6,2),
    fasting_glucose_unit TEXT DEFAULT 'mmol/L',
    
    -- Fasting insulin
    fasting_insulin_value NUMERIC(6,2),
    fasting_insulin_unit TEXT DEFAULT 'uIU/mL',
    
    -- Lipids
    triglycerides_value NUMERIC(6,2),
    triglycerides_unit TEXT DEFAULT 'mmol/L',
    hdl_value NUMERIC(6,2),
    hdl_unit TEXT DEFAULT 'mmol/L',
    
    -- Liver enzyme
    alt_value NUMERIC(6,2),
    alt_unit TEXT DEFAULT 'U/L',
    
    -- Body measurements
    weight_kg NUMERIC(5,2),
    height_cm NUMERIC(5,2),
    
    -- Metadata
    notes TEXT,
    source TEXT DEFAULT 'manual',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.lab_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own rows
CREATE POLICY "Users can view own lab snapshots"
    ON public.lab_snapshots FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own lab snapshots"
    ON public.lab_snapshots FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own lab snapshots"
    ON public.lab_snapshots FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own lab snapshots"
    ON public.lab_snapshots FOR DELETE
    USING (auth.uid() = user_id);

-- Performance index for fetching latest lab snapshot
CREATE INDEX IF NOT EXISTS idx_lab_snapshots_user_collected
    ON public.lab_snapshots (user_id, collected_at DESC);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_lab_snapshots_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS lab_snapshots_updated_at ON public.lab_snapshots;
CREATE TRIGGER lab_snapshots_updated_at
    BEFORE UPDATE ON public.lab_snapshots
    FOR EACH ROW
    EXECUTE FUNCTION public.update_lab_snapshots_updated_at();

-- Comment for documentation
COMMENT ON TABLE public.lab_snapshots IS 'User-entered routine lab values for wellness scoring. Not for diagnosis.';
