-- Test Data for Metabolic Score Edge Function
-- User ID: 7aef54f1-d068-4616-9a1e-ade64457c91f
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. Insert daily_context (wearable data)
-- ============================================
INSERT INTO daily_context (user_id, date, sleep_hours, steps, active_minutes, resting_hr, created_at)
SELECT 
    '7aef54f1-d068-4616-9a1e-ade64457c91f',
    (CURRENT_DATE - (n || ' days')::interval)::date,
    5.5 + (random() * 3.0),          -- Sleep: 5.5-8.5 hours
    4000 + floor(random() * 8000),   -- Steps: 4000-12000
    10 + floor(random() * 50),       -- Active minutes: 10-60
    55 + floor(random() * 20),       -- Resting HR: 55-75
    NOW()
FROM generate_series(0, 29) AS n
ON CONFLICT (user_id, date) DO UPDATE SET
    sleep_hours = EXCLUDED.sleep_hours,
    steps = EXCLUDED.steps,
    active_minutes = EXCLUDED.active_minutes,
    resting_hr = EXCLUDED.resting_hr,
    updated_at = NOW();

-- ============================================
-- 2. Insert lab_snapshots
-- ============================================
INSERT INTO lab_snapshots (
    user_id, collected_at, fasting_glucose_value, fasting_glucose_unit,
    fasting_insulin_value, fasting_insulin_unit, triglycerides_value, triglycerides_unit,
    hdl_value, hdl_unit, alt_value, alt_unit, weight_kg, height_cm, notes, source
)
VALUES (
    '7aef54f1-d068-4616-9a1e-ade64457c91f',
    NOW() - INTERVAL '7 days',
    5.4, 'mmol/L',           -- Fasting glucose
    8.5, 'uIU/mL',           -- Fasting insulin
    1.2, 'mmol/L',           -- Triglycerides
    1.5, 'mmol/L',           -- HDL
    25, 'U/L',               -- ALT
    78, 175,                 -- Weight, Height
    'Test lab data', 'manual'
);

-- ============================================
-- 3. Insert meals with correct column names
-- ============================================
DO $$
DECLARE
    v_meal_id UUID;
    day_offset INT;
    meal_types TEXT[] := ARRAY['breakfast', 'lunch', 'dinner'];
    v_meal_type TEXT;
    v_meal_name TEXT;
BEGIN
    FOR day_offset IN 0..29 LOOP
        FOREACH v_meal_type IN ARRAY meal_types LOOP
            -- Set meal name based on type
            v_meal_name := CASE v_meal_type
                WHEN 'breakfast' THEN 'Oatmeal with berries'
                WHEN 'lunch' THEN 'Grilled chicken salad'
                WHEN 'dinner' THEN 'Salmon with vegetables'
            END;
            
            -- Insert meal (using "name" column, not "meal_name")
            INSERT INTO meals (
                user_id,
                name,
                meal_type,
                logged_at,
                created_at
            ) VALUES (
                '7aef54f1-d068-4616-9a1e-ade64457c91f',
                v_meal_name,
                v_meal_type,
                (CURRENT_DATE - (day_offset || ' days')::interval) + 
                    CASE v_meal_type
                        WHEN 'breakfast' THEN INTERVAL '8 hours'
                        WHEN 'lunch' THEN INTERVAL '12 hours'
                        WHEN 'dinner' THEN INTERVAL '18 hours'
                    END,
                NOW()
            ) RETURNING id INTO v_meal_id;

            -- Insert meal_items with correct columns
            INSERT INTO meal_items (
                meal_id,
                user_id,
                provider,
                external_id,
                display_name,
                quantity,
                unit,
                nutrients,
                created_at
            ) VALUES (
                v_meal_id,
                '7aef54f1-d068-4616-9a1e-ade64457c91f',
                'fdc',
                'test_' || v_meal_id::text,
                v_meal_name,
                1,
                'serving',
                jsonb_build_object(
                    'calories_kcal', CASE v_meal_type WHEN 'breakfast' THEN 350 WHEN 'lunch' THEN 450 WHEN 'dinner' THEN 550 END,
                    'carbs_g', CASE v_meal_type WHEN 'breakfast' THEN 45 WHEN 'lunch' THEN 25 WHEN 'dinner' THEN 30 END,
                    'protein_g', CASE v_meal_type WHEN 'breakfast' THEN 12 WHEN 'lunch' THEN 35 WHEN 'dinner' THEN 40 END,
                    'fat_g', CASE v_meal_type WHEN 'breakfast' THEN 10 WHEN 'lunch' THEN 18 WHEN 'dinner' THEN 22 END,
                    'fibre_g', CASE v_meal_type WHEN 'breakfast' THEN 8 WHEN 'lunch' THEN 6 WHEN 'dinner' THEN 5 END,
                    'sugar_g', 5,
                    'sodium_mg', 200
                ),
                NOW()
            );
        END LOOP;
    END LOOP;
END $$;

-- ============================================
-- 4. Insert glucose_logs
-- ============================================
INSERT INTO glucose_logs (user_id, glucose_level, unit, context, logged_at, created_at)
SELECT
    '7aef54f1-d068-4616-9a1e-ade64457c91f',
    5.0 + (random() * 3.0),
    'mmol/L',
    CASE floor(random() * 4)::int
        WHEN 0 THEN 'fasting'
        WHEN 1 THEN 'pre_meal'
        WHEN 2 THEN 'post_meal'
        ELSE 'random'
    END,
    (CURRENT_DATE - (n || ' days')::interval) + (random() * INTERVAL '12 hours'),
    NOW()
FROM generate_series(0, 29) AS n;

-- ============================================
-- 5. Verify the data
-- ============================================
SELECT 'daily_context' as tbl, count(*) as cnt FROM daily_context WHERE user_id = '7aef54f1-d068-4616-9a1e-ade64457c91f'
UNION ALL
SELECT 'lab_snapshots', count(*) FROM lab_snapshots WHERE user_id = '7aef54f1-d068-4616-9a1e-ade64457c91f'
UNION ALL
SELECT 'meals', count(*) FROM meals WHERE user_id = '7aef54f1-d068-4616-9a1e-ade64457c91f'
UNION ALL
SELECT 'meal_items', count(*) FROM meal_items WHERE user_id = '7aef54f1-d068-4616-9a1e-ade64457c91f'
UNION ALL
SELECT 'glucose_logs', count(*) FROM glucose_logs WHERE user_id = '7aef54f1-d068-4616-9a1e-ade64457c91f';
