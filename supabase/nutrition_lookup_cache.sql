-- Nutrition Lookup Cache table for caching FatSecret/USDA lookup results
-- Run this in Supabase SQL Editor
-- TTL: 24 hours (nutrition data is relatively stable)

CREATE TABLE IF NOT EXISTS public.nutrition_lookup_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Normalized query key (lowercase, underscores, optional category suffix)
    query_key TEXT NOT NULL UNIQUE,
    -- Nutrition data from FatSecret or USDA
    nutrition_data JSONB NOT NULL,
    -- Data source
    source TEXT NOT NULL CHECK (source IN ('fatsecret', 'usda_fdc', 'fallback_estimate')),
    -- Matched food name for reference
    matched_food_name TEXT,
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

-- Index for quick lookups by query key
CREATE INDEX IF NOT EXISTS idx_nutrition_lookup_cache_key
    ON public.nutrition_lookup_cache(query_key);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_nutrition_lookup_cache_expires
    ON public.nutrition_lookup_cache(expires_at);

-- Index for source-based queries (analytics)
CREATE INDEX IF NOT EXISTS idx_nutrition_lookup_cache_source
    ON public.nutrition_lookup_cache(source);

-- No RLS needed - this is a shared cache accessed by Edge Functions only
-- Edge Functions use service role key which bypasses RLS

-- Optional: Function to clean up expired entries (can be called via pg_cron)
CREATE OR REPLACE FUNCTION public.cleanup_nutrition_lookup_cache()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.nutrition_lookup_cache
    WHERE expires_at < NOW();

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Optional: Function to clean up both caches at once
CREATE OR REPLACE FUNCTION public.cleanup_all_analysis_caches()
RETURNS TABLE(photos_deleted INTEGER, nutrition_deleted INTEGER) AS $$
BEGIN
    photos_deleted := public.cleanup_photo_analysis_cache();
    nutrition_deleted := public.cleanup_nutrition_lookup_cache();
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- Comment describing the table
COMMENT ON TABLE public.nutrition_lookup_cache IS
    'Cache for FatSecret/USDA nutrition lookup results. TTL: 24 hours.';
