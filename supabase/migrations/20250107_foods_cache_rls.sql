-- Enable RLS on foods_cache table
-- This resolves the Security Advisor warning while maintaining functionality
-- Edge Functions use service_role key which bypasses RLS

-- Enable RLS
ALTER TABLE public.foods_cache ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to read cached food data
-- This is safe because the cache only contains public nutritional data
CREATE POLICY "Allow authenticated read access to foods cache"
    ON public.foods_cache
    FOR SELECT
    TO authenticated
    USING (true);

-- Policy: Only service role (Edge Functions) can insert/update/delete
-- No explicit policy needed - service_role bypasses RLS automatically
-- Authenticated users cannot modify the cache directly
