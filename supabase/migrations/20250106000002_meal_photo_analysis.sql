-- Migration: Add meal_photo_analysis table for AI photo analysis results
-- Created: 2025-01-06

-- Create meal_photo_analysis table
CREATE TABLE IF NOT EXISTS public.meal_photo_analysis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    meal_id UUID NOT NULL REFERENCES public.meals(id) ON DELETE CASCADE,
    photo_path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'complete', 'failed')),
    result JSONB,
    model TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- One analysis per meal
    CONSTRAINT meal_photo_analysis_meal_unique UNIQUE (meal_id)
);

-- Create index for efficient user queries
CREATE INDEX IF NOT EXISTS idx_meal_photo_analysis_user_created 
ON public.meal_photo_analysis(user_id, created_at DESC);

-- Create index for meal lookups
CREATE INDEX IF NOT EXISTS idx_meal_photo_analysis_meal_id 
ON public.meal_photo_analysis(meal_id);

-- Enable RLS
ALTER TABLE public.meal_photo_analysis ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own analysis results
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'meal_photo_analysis' AND policyname = 'Users can view own meal photo analysis') THEN
    CREATE POLICY "Users can view own meal photo analysis" ON public.meal_photo_analysis FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- RLS Policy: Users can insert their own analysis requests
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'meal_photo_analysis' AND policyname = 'Users can insert own meal photo analysis') THEN
    CREATE POLICY "Users can insert own meal photo analysis" ON public.meal_photo_analysis FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- RLS Policy: Users can update their own analysis results
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'meal_photo_analysis' AND policyname = 'Users can update own meal photo analysis') THEN
    CREATE POLICY "Users can update own meal photo analysis" ON public.meal_photo_analysis FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- RLS Policy: Users can delete their own analysis results
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'meal_photo_analysis' AND policyname = 'Users can delete own meal photo analysis') THEN
    CREATE POLICY "Users can delete own meal photo analysis" ON public.meal_photo_analysis FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_meal_photo_analysis_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS meal_photo_analysis_updated_at ON public.meal_photo_analysis;

CREATE TRIGGER meal_photo_analysis_updated_at
    BEFORE UPDATE ON public.meal_photo_analysis
    FOR EACH ROW
    EXECUTE FUNCTION update_meal_photo_analysis_updated_at();

-- Comment on table
COMMENT ON TABLE public.meal_photo_analysis IS 'Stores AI-generated meal analysis results from photo uploads';
COMMENT ON COLUMN public.meal_photo_analysis.status IS 'Analysis status: pending, complete, or failed';
COMMENT ON COLUMN public.meal_photo_analysis.result IS 'JSON result containing items array and totals object';
COMMENT ON COLUMN public.meal_photo_analysis.model IS 'AI model used for analysis (e.g., gpt-4o-mini)';
