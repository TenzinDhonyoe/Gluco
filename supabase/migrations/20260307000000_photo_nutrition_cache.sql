-- Cache tables for meals-from-photo pipeline
-- photo_analysis_cache: short-lived (10min) cache of Gemini food detection results keyed by image SHA-256
-- nutrition_lookup_cache: longer-lived (24hr) cache of FatSecret/USDA nutrition lookups keyed by normalized query

-- 1. Photo analysis cache
CREATE TABLE IF NOT EXISTS public.photo_analysis_cache (
    hash TEXT PRIMARY KEY,
    detection_result JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);

-- Index for expired entry cleanup
CREATE INDEX IF NOT EXISTS idx_photo_analysis_cache_expires_at
    ON public.photo_analysis_cache (expires_at);

-- RLS: edge functions use service_role (bypasses RLS), no direct user access needed
ALTER TABLE public.photo_analysis_cache ENABLE ROW LEVEL SECURITY;

-- 2. Nutrition lookup cache
CREATE TABLE IF NOT EXISTS public.nutrition_lookup_cache (
    query_key TEXT PRIMARY KEY,
    nutrition_data JSONB NOT NULL,
    source TEXT NOT NULL,
    matched_food_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);

-- Index for expired entry cleanup
CREATE INDEX IF NOT EXISTS idx_nutrition_lookup_cache_expires_at
    ON public.nutrition_lookup_cache (expires_at);

-- RLS: edge functions use service_role (bypasses RLS), no direct user access needed
ALTER TABLE public.nutrition_lookup_cache ENABLE ROW LEVEL SECURITY;
