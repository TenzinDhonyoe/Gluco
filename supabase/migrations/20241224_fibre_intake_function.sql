-- Migration: Optimize Fibre Intake Summary with Database Function
-- This replaces the 2-query approach with a single JOIN query for better performance

-- Create a database function for fibre intake summary
CREATE OR REPLACE FUNCTION get_fibre_intake_summary(
  p_user_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS TABLE (
  total_fibre NUMERIC,
  avg_per_day NUMERIC,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_days_in_range INTEGER;
BEGIN
  -- Calculate days in range
  v_days_in_range := GREATEST(EXTRACT(DAY FROM (p_end_date - p_start_date))::INTEGER, 1);
  
  RETURN QUERY
  SELECT 
    COALESCE(SUM(mi.quantity * ((mi.nutrients->>'fibre_g')::NUMERIC)), 0) as total_fibre,
    COALESCE(SUM(mi.quantity * ((mi.nutrients->>'fibre_g')::NUMERIC)), 0) / v_days_in_range as avg_per_day,
    p_start_date as start_date,
    p_end_date as end_date
  FROM meal_items mi
  INNER JOIN meals m ON mi.meal_id = m.id
  WHERE m.user_id = p_user_id
    AND m.logged_at >= p_start_date
    AND m.logged_at <= p_end_date
    AND mi.nutrients->>'fibre_g' IS NOT NULL;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_fibre_intake_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- Add comment
COMMENT ON FUNCTION get_fibre_intake_summary IS 'Calculates total and average daily fibre intake for a user within a date range. Optimized with JOIN to replace 2-query approach.';

