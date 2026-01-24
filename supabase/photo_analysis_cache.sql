-- Photo Analysis Cache table for caching Gemini detection results
-- Run this in Supabase SQL Editor
-- TTL: 10 minutes (short-term deduplication)

CREATE TABLE IF NOT EXISTS public.photo_analysis_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- SHA-256 hash of the image data
    hash TEXT NOT NULL UNIQUE,
    -- Detection result from Gemini (items + photo_quality)
    detection_result JSONB NOT NULL,
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

-- Index for quick lookups by hash
CREATE INDEX IF NOT EXISTS idx_photo_analysis_cache_hash
    ON public.photo_analysis_cache(hash);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_photo_analysis_cache_expires
    ON public.photo_analysis_cache(expires_at);

-- No RLS needed - this is a shared cache accessed by Edge Functions only
-- Edge Functions use service role key which bypasses RLS

-- Optional: Function to clean up expired entries (can be called via pg_cron)
CREATE OR REPLACE FUNCTION public.cleanup_photo_analysis_cache()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.photo_analysis_cache
    WHERE expires_at < NOW();

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Comment describing the table
COMMENT ON TABLE public.photo_analysis_cache IS
    'Short-term cache for Gemini food detection results. TTL: 10 minutes.';
