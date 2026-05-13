-- Security hardening migration
-- Addresses three findings from the 2026-05-13 audit:
--   H6: function_rate_limits has USING(true) — leaks rate counters across users
--   H7: meal_checkins missing ON DELETE CASCADE on user_id FK
--   M11: get_experiment_progress() bypasses ownership check (SECURITY DEFINER)

-- -----------------------------------------------------------------------------
-- H6: tighten function_rate_limits RLS
-- -----------------------------------------------------------------------------
-- The original policy "Service role full access" used USING(true) WITH CHECK(true)
-- without restricting to service_role, which let any authenticated user SELECT
-- everyone else's rate-limit counters. Replace with explicit service_role +
-- own-row read for authenticated users.

DROP POLICY IF EXISTS "Service role full access" ON public.function_rate_limits;

CREATE POLICY "function_rate_limits service role"
    ON public.function_rate_limits
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "function_rate_limits own rows"
    ON public.function_rate_limits
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- H7: meal_checkins.user_id FK should cascade on user deletion
-- -----------------------------------------------------------------------------
-- The delete-account function deletes meal_checkins rows manually today, so
-- this is defense-in-depth: if the manual delete ever stops running, CASCADE
-- prevents orphan rows that the user can no longer see or remove.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.referential_constraints rc
        JOIN information_schema.table_constraints tc
          ON tc.constraint_name = rc.constraint_name
         AND tc.constraint_schema = rc.constraint_schema
        WHERE tc.table_schema = 'public'
          AND tc.table_name = 'meal_checkins'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND rc.delete_rule <> 'CASCADE'
    ) THEN
        EXECUTE 'ALTER TABLE public.meal_checkins DROP CONSTRAINT IF EXISTS meal_checkins_user_id_fkey';
        EXECUTE 'ALTER TABLE public.meal_checkins
                 ADD CONSTRAINT meal_checkins_user_id_fkey
                 FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE';
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- M11: get_experiment_progress() ownership check
-- -----------------------------------------------------------------------------
-- The original SECURITY DEFINER function accepted a p_user_experiment_id and
-- returned progress regardless of who owned it. Although UUIDs are unguessable,
-- relying on opacity for authorization is fragile. Verify the caller's
-- auth.uid() matches the experiment owner before returning anything.

CREATE OR REPLACE FUNCTION get_experiment_progress(p_user_experiment_id UUID)
RETURNS TABLE (
    total_exposures INTEGER,
    exposures_with_data INTEGER,
    variant_counts JSONB,
    completion_pct NUMERIC
) AS $$
DECLARE
    v_protocol JSONB;
    v_required_exposures INTEGER;
    v_owner UUID;
BEGIN
    -- Ownership check: caller must own this experiment
    SELECT ue.user_id, et.protocol
      INTO v_owner, v_protocol
    FROM user_experiments ue
    JOIN experiment_templates et ON et.id = ue.template_id
    WHERE ue.id = p_user_experiment_id;

    IF v_owner IS NULL THEN
        RAISE EXCEPTION 'Experiment not found';
    END IF;
    IF v_owner <> auth.uid() THEN
        RAISE EXCEPTION 'Not authorized to view this experiment';
    END IF;

    v_required_exposures := COALESCE(
        (v_protocol->>'exposures_per_variant')::INTEGER * 2,
        10
    );

    RETURN QUERY
    SELECT
        COUNT(*)::INTEGER AS total_exposures,
        COUNT(CASE WHEN e.payload->>'meal_id' IS NOT NULL THEN 1 END)::INTEGER AS exposures_with_data,
        jsonb_object_agg(
            COALESCE(e.payload->>'variant_key', 'unknown'),
            COUNT(*)
        ) AS variant_counts,
        ROUND((COUNT(*)::NUMERIC / v_required_exposures) * 100, 1) AS completion_pct
    FROM user_experiment_events e
    WHERE e.user_experiment_id = p_user_experiment_id
      AND e.type = 'exposure';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
