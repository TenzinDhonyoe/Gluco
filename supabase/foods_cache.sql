-- Foods Cache table for caching API responses
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.foods_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL CHECK (provider IN ('fdc', 'off')),
    external_id TEXT NOT NULL,
    -- Normalized nutrient data
    normalized JSONB NOT NULL,
    last_fetched_at TIMESTAMPTZ DEFAULT NOW(),
    -- Unique constraint ensures one cached entry per provider+external_id
    UNIQUE(provider, external_id)
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_foods_cache_lookup 
    ON public.foods_cache(provider, external_id);

-- No RLS needed - this is a shared cache accessed by Edge Functions only
-- Edge Functions use service role key which bypasses RLS
