-- Sample data for user 7aef54f1-d068-4616-9a1e-ade64457c91f
-- Run this in Supabase SQL Editor to populate all home screen cards

DO $$
DECLARE
  uid UUID := '7aef54f1-d068-4616-9a1e-ade64457c91f';
BEGIN

-- ============================================================
-- 1. Daily Context (7 days) — populates Activity sparkline + Sleep bars
-- ============================================================
INSERT INTO daily_context (user_id, date, steps, active_minutes, sleep_hours, sleep_quality, resting_hr, hrv_ms, source)
VALUES
  (uid, CURRENT_DATE - 6, 7200,  25, 6.8, 'fair',      65, 38, 'manual'),
  (uid, CURRENT_DATE - 5, 9400,  42, 7.5, 'good',      62, 42, 'manual'),
  (uid, CURRENT_DATE - 4, 11200, 55, 8.1, 'excellent',  60, 45, 'manual'),
  (uid, CURRENT_DATE - 3, 6800,  20, 5.9, 'poor',      68, 35, 'manual'),
  (uid, CURRENT_DATE - 2, 10100, 48, 7.3, 'good',      63, 41, 'manual'),
  (uid, CURRENT_DATE - 1, 8900,  38, 7.8, 'good',      61, 44, 'manual'),
  (uid, CURRENT_DATE,     5500,  15, 6.5, 'fair',      64, 39, 'manual')
ON CONFLICT (user_id, date) DO UPDATE SET
  steps = EXCLUDED.steps,
  active_minutes = EXCLUDED.active_minutes,
  sleep_hours = EXCLUDED.sleep_hours,
  sleep_quality = EXCLUDED.sleep_quality,
  resting_hr = EXCLUDED.resting_hr,
  hrv_ms = EXCLUDED.hrv_ms,
  source = EXCLUDED.source;

-- ============================================================
-- 2. Weight Logs (7 entries) — populates Weight sparkline
-- ============================================================
INSERT INTO weight_logs (user_id, weight_kg, logged_at, source)
VALUES
  (uid, 74.2, (CURRENT_DATE - 6)::timestamp + '08:00'::interval, 'manual'),
  (uid, 73.8, (CURRENT_DATE - 5)::timestamp + '07:45'::interval, 'manual'),
  (uid, 74.0, (CURRENT_DATE - 4)::timestamp + '08:10'::interval, 'manual'),
  (uid, 73.5, (CURRENT_DATE - 3)::timestamp + '07:30'::interval, 'manual'),
  (uid, 73.3, (CURRENT_DATE - 2)::timestamp + '08:00'::interval, 'manual'),
  (uid, 73.6, (CURRENT_DATE - 1)::timestamp + '07:50'::interval, 'manual'),
  (uid, 73.1, CURRENT_DATE::timestamp + '08:05'::interval, 'manual');

-- ============================================================
-- 3. Activity Logs (7 entries) — populates streak + activity card
-- ============================================================
INSERT INTO activity_logs (user_id, activity_name, logged_at, duration_minutes, intensity, notes)
VALUES
  (uid, 'Morning Walk',    (CURRENT_DATE - 6)::timestamp + '07:00'::interval, 25, 'light',    NULL),
  (uid, 'Running',         (CURRENT_DATE - 5)::timestamp + '06:30'::interval, 35, 'moderate',  'Park run'),
  (uid, 'Cycling',         (CURRENT_DATE - 4)::timestamp + '17:00'::interval, 45, 'moderate',  NULL),
  (uid, 'Yoga',            (CURRENT_DATE - 3)::timestamp + '07:15'::interval, 30, 'light',    'Morning stretch'),
  (uid, 'HIIT Workout',    (CURRENT_DATE - 2)::timestamp + '18:00'::interval, 25, 'intense',  NULL),
  (uid, 'Walking',         (CURRENT_DATE - 1)::timestamp + '12:30'::interval, 40, 'light',    'Lunch walk'),
  (uid, 'Strength Training',(CURRENT_DATE)::timestamp + '07:00'::interval,    35, 'moderate',  NULL);

-- ============================================================
-- 4. Glucose Logs (10 entries) — populates advanced glucose card
-- ============================================================
INSERT INTO glucose_logs (user_id, glucose_level, unit, logged_at, context, notes)
VALUES
  (uid, 5.2, 'mmol/L', (CURRENT_DATE - 3)::timestamp + '07:00'::interval, 'fasting',   'Morning fasting'),
  (uid, 7.8, 'mmol/L', (CURRENT_DATE - 3)::timestamp + '09:30'::interval, 'post_meal', 'After breakfast'),
  (uid, 5.5, 'mmol/L', (CURRENT_DATE - 2)::timestamp + '07:15'::interval, 'fasting',   NULL),
  (uid, 8.1, 'mmol/L', (CURRENT_DATE - 2)::timestamp + '13:00'::interval, 'post_meal', 'After lunch'),
  (uid, 6.2, 'mmol/L', (CURRENT_DATE - 2)::timestamp + '18:00'::interval, 'pre_meal',  NULL),
  (uid, 5.0, 'mmol/L', (CURRENT_DATE - 1)::timestamp + '06:45'::interval, 'fasting',   NULL),
  (uid, 7.5, 'mmol/L', (CURRENT_DATE - 1)::timestamp + '12:30'::interval, 'post_meal', 'After lunch'),
  (uid, 9.2, 'mmol/L', (CURRENT_DATE - 1)::timestamp + '19:00'::interval, 'post_meal', 'After dinner'),
  (uid, 5.3, 'mmol/L', CURRENT_DATE::timestamp + '07:00'::interval,       'fasting',   'Morning'),
  (uid, 6.8, 'mmol/L', CURRENT_DATE::timestamp + '10:00'::interval,       'post_meal', NULL);

-- ============================================================
-- 5. Meals (4 entries) — populates check-in queue
-- ============================================================
INSERT INTO meals (user_id, name, logged_at, meal_type, calories, protein_g, carbs_g, fat_g, fiber_g)
VALUES
  (uid, 'Oatmeal with Berries',        (CURRENT_DATE)::timestamp + '07:30'::interval, 'breakfast', 350, 12, 55, 8,  6),
  (uid, 'Grilled Chicken Salad',       (CURRENT_DATE)::timestamp + '12:00'::interval, 'lunch',     480, 38, 22, 18, 5),
  (uid, 'Salmon with Roasted Veggies', (CURRENT_DATE - 1)::timestamp + '18:30'::interval, 'dinner', 520, 35, 30, 22, 7),
  (uid, 'Greek Yogurt & Granola',      (CURRENT_DATE - 1)::timestamp + '07:15'::interval, 'breakfast', 280, 18, 35, 6, 3);

END $$;

-- Verify counts
SELECT 'daily_context' AS table_name, COUNT(*) AS rows FROM daily_context WHERE user_id = '7aef54f1-d068-4616-9a1e-ade64457c91f'
UNION ALL
SELECT 'weight_logs', COUNT(*) FROM weight_logs WHERE user_id = '7aef54f1-d068-4616-9a1e-ade64457c91f'
UNION ALL
SELECT 'activity_logs', COUNT(*) FROM activity_logs WHERE user_id = '7aef54f1-d068-4616-9a1e-ade64457c91f'
UNION ALL
SELECT 'glucose_logs', COUNT(*) FROM glucose_logs WHERE user_id = '7aef54f1-d068-4616-9a1e-ade64457c91f'
UNION ALL
SELECT 'meals', COUNT(*) FROM meals WHERE user_id = '7aef54f1-d068-4616-9a1e-ade64457c91f';
