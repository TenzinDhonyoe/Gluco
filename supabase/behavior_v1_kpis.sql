-- Behavior-first KPI reads (read-only)
--
-- Run these in Supabase SQL editor after behavior_v1 rollout starts.
-- Replace the date range in params CTE as needed.

-- ============================================
-- 1) Action completion rate (daily)
-- ============================================
WITH params AS (
  SELECT
    DATE '2026-01-01' AS start_date,
    CURRENT_DATE AS end_date
),
actions_window AS (
  SELECT
    a.id,
    a.user_id,
    a.window_start,
    a.window_start::date AS action_date,
    a.status,
    a.completed_at,
    p.experience_variant,
    p.readiness_level,
    p.com_b_barrier
  FROM public.user_actions a
  JOIN public.profiles p ON p.id = a.user_id
  JOIN params ON a.window_start::date BETWEEN params.start_date AND params.end_date
)
SELECT
  action_date,
  experience_variant,
  COUNT(*) AS actions_started,
  COUNT(*) FILTER (WHERE status = 'completed') AS actions_completed,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE status = 'completed') / NULLIF(COUNT(*), 0),
    1
  ) AS action_completion_rate_pct,
  COUNT(*) FILTER (WHERE status = 'completed' AND completed_at <= (window_start + INTERVAL '72 hours')) AS completed_within_72h
FROM actions_window
GROUP BY action_date, experience_variant
ORDER BY action_date DESC, experience_variant;


-- ============================================
-- 1b) Action completion breakdown by readiness/barrier
-- ============================================
WITH params AS (
  SELECT
    DATE '2026-01-01' AS start_date,
    CURRENT_DATE AS end_date
),
actions_window AS (
  SELECT
    a.id,
    a.status,
    p.experience_variant,
    COALESCE(p.readiness_level, 'unknown') AS readiness_level,
    COALESCE(p.com_b_barrier, 'unknown') AS com_b_barrier
  FROM public.user_actions a
  JOIN public.profiles p ON p.id = a.user_id
  JOIN params ON a.window_start::date BETWEEN params.start_date AND params.end_date
)
SELECT
  experience_variant,
  readiness_level,
  com_b_barrier,
  COUNT(*) AS actions_started,
  COUNT(*) FILTER (WHERE status = 'completed') AS actions_completed,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE status = 'completed') / NULLIF(COUNT(*), 0),
    1
  ) AS action_completion_rate_pct
FROM actions_window
GROUP BY experience_variant, readiness_level, com_b_barrier
ORDER BY experience_variant, readiness_level, com_b_barrier;


-- ============================================
-- 2) D7 retention cohorts from user_app_sessions
-- ============================================
WITH first_session AS (
  SELECT
    s.user_id,
    MIN(s.session_date) AS cohort_date
  FROM public.user_app_sessions s
  GROUP BY s.user_id
),
cohort_flags AS (
  SELECT
    fs.user_id,
    fs.cohort_date,
    p.experience_variant,
    EXISTS (
      SELECT 1
      FROM public.user_app_sessions s7
      WHERE s7.user_id = fs.user_id
        AND s7.session_date = fs.cohort_date + 7
    ) AS retained_d7
  FROM first_session fs
  JOIN public.profiles p ON p.id = fs.user_id
)
SELECT
  cohort_date,
  experience_variant,
  COUNT(*) AS users_in_cohort,
  COUNT(*) FILTER (WHERE retained_d7) AS users_retained_d7,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE retained_d7) / NULLIF(COUNT(*), 0),
    1
  ) AS d7_retention_pct
FROM cohort_flags
WHERE cohort_date <= CURRENT_DATE - 7
GROUP BY cohort_date, experience_variant
ORDER BY cohort_date DESC, experience_variant;


-- ============================================
-- 2b) Overall D7 retention snapshot (most recent 30 eligible cohorts)
-- ============================================
WITH first_session AS (
  SELECT
    s.user_id,
    MIN(s.session_date) AS cohort_date
  FROM public.user_app_sessions s
  GROUP BY s.user_id
),
eligible_users AS (
  SELECT
    fs.user_id,
    fs.cohort_date,
    p.experience_variant,
    EXISTS (
      SELECT 1
      FROM public.user_app_sessions s7
      WHERE s7.user_id = fs.user_id
        AND s7.session_date = fs.cohort_date + 7
    ) AS retained_d7
  FROM first_session fs
  JOIN public.profiles p ON p.id = fs.user_id
  WHERE fs.cohort_date <= CURRENT_DATE - 7
),
recent_cohorts AS (
  SELECT DISTINCT cohort_date
  FROM eligible_users
  ORDER BY cohort_date DESC
  LIMIT 30
)
SELECT
  e.experience_variant,
  COUNT(*) AS users_in_scope,
  COUNT(*) FILTER (WHERE e.retained_d7) AS retained_users,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE e.retained_d7) / NULLIF(COUNT(*), 0),
    1
  ) AS d7_retention_pct
FROM eligible_users e
JOIN recent_cohorts c ON c.cohort_date = e.cohort_date
GROUP BY e.experience_variant
ORDER BY e.experience_variant;
