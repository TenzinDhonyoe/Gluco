-- Enable RLS on foods_cache table
-- This resolves the Security Advisor warning while maintaining functionality
-- Edge Functions use service_role key which bypasses RLS

-- Enable RLS (idempotent - safe to run multiple times)
ALTER TABLE public.foods_cache ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to read cached food data
-- This is safe because the cache only contains public nutritional data
-- Using DO block for idempotency
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'foods_cache' 
        AND policyname = 'Allow authenticated read access to foods cache'
    ) THEN
        CREATE POLICY "Allow authenticated read access to foods cache"
            ON public.foods_cache
            FOR SELECT
            TO authenticated
            USING (true);
    END IF;
END $$;

-- Policy: Only service role (Edge Functions) can insert/update/delete
-- No explicit policy needed - service_role bypasses RLS automatically
-- Authenticated users cannot modify the cache directly
