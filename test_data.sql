-- Test data for user: 7aef54f1-d068-4616-9a1e-ade64457c91f
-- Run this in Supabase SQL Editor to populate test data

-- Clear existing test data for this user (optional - uncomment if needed)
-- DELETE FROM glucose_logs WHERE user_id = '7aef54f1-d068-4616-9a1e-ade64457c91f';
-- DELETE FROM activity_logs WHERE user_id = '7aef54f1-d068-4616-9a1e-ade64457c91f';

-- =============================================
-- GLUCOSE LOGS (Last 90 days of varied data)
-- =============================================
-- Target range is 3.9 - 10.0 mmol/L
-- Mix of in-range and some out-of-range values

INSERT INTO glucose_logs (user_id, glucose_level, logged_at, context, notes) VALUES
-- Today and recent days (last 7 days)
('7aef54f1-d068-4616-9a1e-ade64457c91f', 5.8, NOW() - INTERVAL '1 hour', 'fasting', 'Morning reading'),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 7.2, NOW() - INTERVAL '4 hours', 'post_meal', 'After breakfast'),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 6.1, NOW() - INTERVAL '1 day', 'fasting', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 8.5, NOW() - INTERVAL '1 day' - INTERVAL '2 hours', 'post_meal', 'After lunch'),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 5.4, NOW() - INTERVAL '2 days', 'fasting', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 7.8, NOW() - INTERVAL '2 days' - INTERVAL '3 hours', 'post_meal', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 10.5, NOW() - INTERVAL '3 days', 'post_meal', 'High after pizza'), -- Out of range
('7aef54f1-d068-4616-9a1e-ade64457c91f', 6.2, NOW() - INTERVAL '3 days' - INTERVAL '8 hours', 'fasting', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 5.9, NOW() - INTERVAL '4 days', 'fasting', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 6.8, NOW() - INTERVAL '4 days' - INTERVAL '4 hours', 'pre_meal', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 6.0, NOW() - INTERVAL '5 days', 'fasting', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 7.5, NOW() - INTERVAL '5 days' - INTERVAL '5 hours', 'post_meal', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 5.6, NOW() - INTERVAL '6 days', 'fasting', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 11.2, NOW() - INTERVAL '6 days' - INTERVAL '2 hours', 'post_meal', 'Birthday cake'), -- Out of range

-- Week 2 (days 7-14)
('7aef54f1-d068-4616-9a1e-ade64457c91f', 5.3, NOW() - INTERVAL '7 days', 'fasting', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 7.1, NOW() - INTERVAL '8 days', 'post_meal', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 6.4, NOW() - INTERVAL '9 days', 'fasting', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 8.9, NOW() - INTERVAL '10 days', 'post_meal', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 5.7, NOW() - INTERVAL '11 days', 'fasting', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 6.9, NOW() - INTERVAL '12 days', 'pre_meal', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 7.3, NOW() - INTERVAL '13 days', 'post_meal', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 5.5, NOW() - INTERVAL '14 days', 'fasting', NULL),

-- Week 3-4 (days 15-30)
('7aef54f1-d068-4616-9a1e-ade64457c91f', 6.1, NOW() - INTERVAL '15 days', 'fasting', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 7.8, NOW() - INTERVAL '16 days', 'post_meal', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 10.8, NOW() - INTERVAL '17 days', 'post_meal', 'Holiday dinner'), -- Out of range
('7aef54f1-d068-4616-9a1e-ade64457c91f', 5.9, NOW() - INTERVAL '18 days', 'fasting', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 6.5, NOW() - INTERVAL '19 days', 'pre_meal', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 7.2, NOW() - INTERVAL '20 days', 'post_meal', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 5.4, NOW() - INTERVAL '21 days', 'fasting', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 8.1, NOW() - INTERVAL '22 days', 'post_meal', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 6.3, NOW() - INTERVAL '23 days', 'fasting', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 7.6, NOW() - INTERVAL '24 days', 'post_meal', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 5.8, NOW() - INTERVAL '25 days', 'fasting', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 9.2, NOW() - INTERVAL '26 days', 'post_meal', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 6.0, NOW() - INTERVAL '27 days', 'fasting', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 7.4, NOW() - INTERVAL '28 days', 'post_meal', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 5.6, NOW() - INTERVAL '29 days', 'fasting', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 8.3, NOW() - INTERVAL '30 days', 'post_meal', NULL),

-- Month 2-3 (days 31-90) - Sparser data to simulate real usage
('7aef54f1-d068-4616-9a1e-ade64457c91f', 6.2, NOW() - INTERVAL '35 days', 'fasting', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 7.9, NOW() - INTERVAL '35 days' - INTERVAL '3 hours', 'post_meal', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 5.5, NOW() - INTERVAL '40 days', 'fasting', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 11.5, NOW() - INTERVAL '42 days', 'post_meal', 'Restaurant meal'), -- Out of range
('7aef54f1-d068-4616-9a1e-ade64457c91f', 6.4, NOW() - INTERVAL '45 days', 'fasting', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 7.1, NOW() - INTERVAL '48 days', 'post_meal', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 5.9, NOW() - INTERVAL '50 days', 'fasting', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 8.7, NOW() - INTERVAL '55 days', 'post_meal', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 6.0, NOW() - INTERVAL '60 days', 'fasting', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 7.5, NOW() - INTERVAL '65 days', 'post_meal', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 5.7, NOW() - INTERVAL '70 days', 'fasting', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 10.3, NOW() - INTERVAL '72 days', 'post_meal', NULL), -- Out of range
('7aef54f1-d068-4616-9a1e-ade64457c91f', 6.3, NOW() - INTERVAL '75 days', 'fasting', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 7.8, NOW() - INTERVAL '80 days', 'post_meal', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 5.4, NOW() - INTERVAL '85 days', 'fasting', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 8.2, NOW() - INTERVAL '90 days', 'post_meal', NULL);

-- =============================================
-- ACTIVITY LOGS (Last 90 days)
-- =============================================

INSERT INTO activity_logs (user_id, activity_name, logged_at, duration_minutes, intensity, notes) VALUES
-- Last 7 days
('7aef54f1-d068-4616-9a1e-ade64457c91f', 'Morning Walk', NOW() - INTERVAL '1 day', 30, 'light', 'Nice weather'),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 'Yoga', NOW() - INTERVAL '2 days', 45, 'moderate', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 'Cycling', NOW() - INTERVAL '3 days', 60, 'intense', 'Great ride'),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 'Walking', NOW() - INTERVAL '5 days', 25, 'light', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 'Swimming', NOW() - INTERVAL '6 days', 40, 'moderate', NULL),

-- Week 2
('7aef54f1-d068-4616-9a1e-ade64457c91f', 'Jogging', NOW() - INTERVAL '8 days', 35, 'moderate', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 'Strength Training', NOW() - INTERVAL '10 days', 50, 'intense', 'Gym session'),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 'Walking', NOW() - INTERVAL '12 days', 20, 'light', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 'Yoga', NOW() - INTERVAL '14 days', 30, 'light', NULL),

-- Week 3-4
('7aef54f1-d068-4616-9a1e-ade64457c91f', 'Hiking', NOW() - INTERVAL '16 days', 90, 'moderate', 'Trail hike'),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 'Cycling', NOW() - INTERVAL '18 days', 45, 'moderate', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 'Walking', NOW() - INTERVAL '20 days', 30, 'light', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 'Tennis', NOW() - INTERVAL '22 days', 60, 'intense', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 'Stretching', NOW() - INTERVAL '25 days', 15, 'light', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 'Running', NOW() - INTERVAL '28 days', 40, 'intense', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 'Walking', NOW() - INTERVAL '30 days', 25, 'light', NULL),

-- Month 2-3
('7aef54f1-d068-4616-9a1e-ade64457c91f', 'Swimming', NOW() - INTERVAL '35 days', 45, 'moderate', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 'Yoga', NOW() - INTERVAL '40 days', 60, 'light', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 'Cycling', NOW() - INTERVAL '45 days', 50, 'moderate', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 'Jogging', NOW() - INTERVAL '50 days', 30, 'moderate', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 'Strength Training', NOW() - INTERVAL '55 days', 45, 'intense', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 'Walking', NOW() - INTERVAL '60 days', 20, 'light', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 'Hiking', NOW() - INTERVAL '70 days', 120, 'moderate', 'Long hike'),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 'Tennis', NOW() - INTERVAL '80 days', 75, 'intense', NULL),
('7aef54f1-d068-4616-9a1e-ade64457c91f', 'Yoga', NOW() - INTERVAL '90 days', 30, 'light', NULL);

-- =============================================
-- Summary of test data:
-- =============================================
-- Glucose logs: ~55 entries over 90 days
--   - Most readings in range (3.9-10.0 mmol/L)
--   - ~6 out-of-range readings (>10.0 mmol/L) for testing
--   - Mix of fasting, pre_meal, and post_meal contexts
-- 
-- Activity logs: ~25 entries over 90 days
--   - Mixed activities and intensities
--   - Varying durations (15-120 minutes)
--
-- Expected results:
-- - 7d view: ~5-7 days of glucose data, ~5 activities (~200 mins)
-- - 14d view: ~10-14 days of data
-- - 30d view: ~20-25 days of data
-- - 90d view: All data
-- - In-range %: Should be around 80-90%
