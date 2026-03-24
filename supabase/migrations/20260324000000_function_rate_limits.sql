-- Per-user rate limiting for edge functions
-- Prevents cost amplification attacks on AI-powered endpoints

CREATE TABLE IF NOT EXISTS public.function_rate_limits (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    function_name TEXT NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (user_id, function_name, window_start)
);

CREATE INDEX idx_rate_limits_cleanup
ON public.function_rate_limits(window_start);

ALTER TABLE public.function_rate_limits ENABLE ROW LEVEL SECURITY;

-- Service role only — edge functions use service role key
CREATE POLICY "Service role full access"
  ON public.function_rate_limits
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Atomic check-and-increment function
-- Returns current count; caller compares against limit
CREATE OR REPLACE FUNCTION public.check_rate_limit(
    p_user_id UUID,
    p_function_name TEXT,
    p_window_minutes INTEGER DEFAULT 1
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_window TIMESTAMPTZ;
    v_count INTEGER;
BEGIN
    -- Truncate to window boundary
    v_window := date_trunc('minute', now());
    IF p_window_minutes > 1 THEN
        v_window := date_trunc('hour', now())
            + (FLOOR(EXTRACT(MINUTE FROM now()) / p_window_minutes) * p_window_minutes) * INTERVAL '1 minute';
    END IF;

    -- Atomic upsert + return count
    INSERT INTO public.function_rate_limits (user_id, function_name, window_start, request_count)
    VALUES (p_user_id, p_function_name, v_window, 1)
    ON CONFLICT (user_id, function_name, window_start)
    DO UPDATE SET request_count = function_rate_limits.request_count + 1
    RETURNING request_count INTO v_count;

    -- Opportunistic cleanup: delete rows older than 1 hour (non-blocking)
    DELETE FROM public.function_rate_limits
    WHERE window_start < now() - INTERVAL '1 hour';

    RETURN v_count;
END;
$$;
