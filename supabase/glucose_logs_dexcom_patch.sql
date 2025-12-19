-- Glucose Logs Dexcom Patch
-- Adds columns to support Dexcom data import without breaking existing functionality
-- Run this migration in Supabase SQL Editor AFTER glucose_logs.sql

-- Add source column to track where the log came from
ALTER TABLE public.glucose_logs 
ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual' 
CHECK (source IN ('manual', 'dexcom'));

-- Add external_id for deduplication of Dexcom records
ALTER TABLE public.glucose_logs 
ADD COLUMN IF NOT EXISTS external_id TEXT NULL;

-- Add device column to store device information
ALTER TABLE public.glucose_logs 
ADD COLUMN IF NOT EXISTS device TEXT NULL;

-- Create unique index to prevent duplicate Dexcom records
-- This allows upserting Dexcom data without creating duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_glucose_logs_external_unique 
ON public.glucose_logs(user_id, source, external_id) 
WHERE external_id IS NOT NULL;

-- Create index for filtering by source
CREATE INDEX IF NOT EXISTS idx_glucose_logs_source 
ON public.glucose_logs(source);

-- Note: Existing inserts from app/log-glucose.tsx will continue to work
-- because source defaults to 'manual' and external_id is nullable
