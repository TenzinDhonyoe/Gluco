-- =============================================================
-- DEMO DATA SEED for user 7aef54f1-d068-4616-9a1e-ade64457c91f
-- Run this in Supabase SQL Editor (bypasses RLS)
-- =============================================================

DO $$
DECLARE
  uid UUID := '7aef54f1-d068-4616-9a1e-ade64457c91f';
  d DATE;
  meal_uuid UUID;
  session_uuid UUID;
  i INTEGER;
  hour_offset INTEGER;
  glucose_base NUMERIC;
  glucose_val NUMERIC;
  ctx TEXT;
  energy_val INTEGER;
  mood_val TEXT;
  sleep_h NUMERIC;
  steps_val INTEGER;
  active_min INTEGER;
  rhr NUMERIC;
  hrv NUMERIC;
  meal_names TEXT[][] := ARRAY[
    -- breakfast options
    ARRAY['Avocado Toast with Eggs', 'breakfast'],
    ARRAY['Greek Yogurt Parfait', 'breakfast'],
    ARRAY['Oatmeal with Berries', 'breakfast'],
    ARRAY['Smoothie Bowl', 'breakfast'],
    ARRAY['Scrambled Eggs & Sourdough', 'breakfast'],
    ARRAY['Chia Pudding with Mango', 'breakfast'],
    ARRAY['Banana Pancakes', 'breakfast'],
    -- lunch options
    ARRAY['Grilled Chicken Salad', 'lunch'],
    ARRAY['Salmon Poke Bowl', 'lunch'],
    ARRAY['Turkey Club Sandwich', 'lunch'],
    ARRAY['Lentil Soup & Bread', 'lunch'],
    ARRAY['Chicken Burrito Bowl', 'lunch'],
    ARRAY['Mediterranean Wrap', 'lunch'],
    ARRAY['Tuna Nicoise Salad', 'lunch'],
    -- dinner options
    ARRAY['Grilled Salmon & Veggies', 'dinner'],
    ARRAY['Chicken Stir Fry', 'dinner'],
    ARRAY['Pasta Primavera', 'dinner'],
    ARRAY['Beef Tacos', 'dinner'],
    ARRAY['Thai Green Curry', 'dinner'],
    ARRAY['Baked Cod with Quinoa', 'dinner'],
    ARRAY['Lamb Kofta with Rice', 'dinner'],
    -- snack options
    ARRAY['Apple & Almond Butter', 'snack'],
    ARRAY['Trail Mix', 'snack'],
    ARRAY['Hummus & Veggies', 'snack'],
    ARRAY['Protein Bar', 'snack'],
    ARRAY['Dark Chocolate & Nuts', 'snack']
  ];
  meal_idx INTEGER;
  activity_names TEXT[] := ARRAY['Walking', 'Running', 'Cycling', 'Yoga', 'Strength Training', 'Swimming', 'HIIT', 'Pilates', 'Hiking', 'Dance'];
  activity_idx INTEGER;
  energy_choices TEXT[] := ARRAY['low', 'steady', 'high'];
  fullness_choices TEXT[] := ARRAY['low', 'okay', 'high'];
  cravings_choices TEXT[] := ARRAY['low', 'medium', 'high'];
  mood_choices TEXT[] := ARRAY['low', 'okay', 'good'];
  mood_tags TEXT[] := ARRAY['great', 'good', 'okay', 'low'];
  sleep_qualities TEXT[] := ARRAY['poor', 'fair', 'good', 'excellent'];
  intensities TEXT[] := ARRAY['light', 'moderate', 'intense'];
  glucose_contexts TEXT[] := ARRAY['fasting', 'pre_meal', 'post_meal', 'random', 'bedtime'];
BEGIN

  -- =========================================================
  -- 1. UPDATE PROFILE (ensure it exists and has good data)
  -- =========================================================
  UPDATE profiles SET
    first_name = 'Alex',
    last_name = 'Chen',
    region = 'US',
    birth_date = '1992-06-15',
    biological_sex = 'male',
    goals = ARRAY['manage_glucose', 'eat_better', 'be_active'],
    onboarding_completed = true,
    experience_variant = 'behavior_v1',
    com_b_barrier = 'capability',
    readiness_level = 'high',
    primary_habit = 'balanced_meals',
    prompt_window = 'morning',
    show_glucose_advanced = true,
    dietary_preferences = ARRAY['mediterranean'],
    cultural_food_context = 'Asian-American fusion',
    notification_preferences = '{"meal_reminders": true, "glucose_reminders": true, "weekly_review": true, "post_meal_check": true}'::jsonb
  WHERE id = uid;

  -- =========================================================
  -- 2. USER CALIBRATION
  -- =========================================================
  INSERT INTO user_calibration (user_id, baseline_glucose, carb_sensitivity, avg_peak_time_min, exercise_effect, sleep_penalty, n_observations, n_quality_observations, confidence, avg_fasting_glucose, avg_post_meal_peak, top_spike_times, top_response_food_categories, best_glucose_days, worst_glucose_days)
  VALUES (uid, 5.2, 0.8, 45, 0.6, 0.3, 180, 120, 0.85, 5.1, 7.8, ARRAY['12:30', '19:00', '08:00'], ARRAY['pasta', 'rice', 'bread'], ARRAY[2, 4, 6], ARRAY[0, 5])
  ON CONFLICT (user_id) DO UPDATE SET
    baseline_glucose = EXCLUDED.baseline_glucose,
    carb_sensitivity = EXCLUDED.carb_sensitivity,
    n_observations = EXCLUDED.n_observations,
    confidence = EXCLUDED.confidence,
    updated_at = now();

  -- =========================================================
  -- 3. GLUCOSE LOGS (30 days, 4-6 readings per day)
  -- =========================================================
  FOR d IN SELECT generate_series(CURRENT_DATE - 29, CURRENT_DATE, '1 day'::interval)::date LOOP
    -- Fasting morning reading
    glucose_base := 4.8 + (random() * 0.8);
    INSERT INTO glucose_logs (id, user_id, glucose_level, unit, logged_at, context, notes)
    VALUES (gen_random_uuid(), uid, round(glucose_base::numeric, 1), 'mmol/L',
            (d + interval '7 hours' + (random() * interval '30 minutes'))::timestamptz,
            'fasting', CASE WHEN random() < 0.3 THEN 'Morning reading before coffee' ELSE NULL END);

    -- Pre-lunch
    INSERT INTO glucose_logs (id, user_id, glucose_level, unit, logged_at, context)
    VALUES (gen_random_uuid(), uid, round((5.0 + random() * 1.0)::numeric, 1), 'mmol/L',
            (d + interval '11 hours' + (random() * interval '30 minutes'))::timestamptz, 'pre_meal');

    -- Post-lunch (higher)
    INSERT INTO glucose_logs (id, user_id, glucose_level, unit, logged_at, context)
    VALUES (gen_random_uuid(), uid, round((6.5 + random() * 2.5)::numeric, 1), 'mmol/L',
            (d + interval '13 hours' + (random() * interval '30 minutes'))::timestamptz, 'post_meal');

    -- Afternoon random
    IF random() < 0.7 THEN
      INSERT INTO glucose_logs (id, user_id, glucose_level, unit, logged_at, context)
      VALUES (gen_random_uuid(), uid, round((5.2 + random() * 1.2)::numeric, 1), 'mmol/L',
              (d + interval '15 hours' + (random() * interval '60 minutes'))::timestamptz, 'random');
    END IF;

    -- Post-dinner
    INSERT INTO glucose_logs (id, user_id, glucose_level, unit, logged_at, context)
    VALUES (gen_random_uuid(), uid, round((6.0 + random() * 2.8)::numeric, 1), 'mmol/L',
            (d + interval '20 hours' + (random() * interval '30 minutes'))::timestamptz, 'post_meal');

    -- Bedtime
    IF random() < 0.6 THEN
      INSERT INTO glucose_logs (id, user_id, glucose_level, unit, logged_at, context)
      VALUES (gen_random_uuid(), uid, round((5.0 + random() * 0.8)::numeric, 1), 'mmol/L',
              (d + interval '22 hours' + (random() * interval '30 minutes'))::timestamptz, 'bedtime');
    END IF;
  END LOOP;

  -- =========================================================
  -- 4. MEALS (30 days, 3-4 meals per day with nutrition)
  -- =========================================================
  FOR d IN SELECT generate_series(CURRENT_DATE - 29, CURRENT_DATE, '1 day'::interval)::date LOOP

    -- BREAKFAST
    meal_idx := (floor(random() * 7) + 1)::integer;
    meal_uuid := gen_random_uuid();
    INSERT INTO meals (id, user_id, name, meal_type, logged_at, calories, protein_g, carbs_g, fat_g, fiber_g)
    VALUES (meal_uuid, uid, meal_names[meal_idx][1], 'breakfast',
            (d + interval '7 hours' + (random() * interval '90 minutes'))::timestamptz,
            round((300 + random() * 250)::numeric), round((15 + random() * 20)::numeric, 1),
            round((30 + random() * 30)::numeric, 1), round((10 + random() * 15)::numeric, 1),
            round((3 + random() * 5)::numeric, 1));

    -- Meal items for breakfast
    INSERT INTO meal_items (id, meal_id, user_id, provider, external_id, display_name, quantity, unit, nutrients)
    VALUES (gen_random_uuid(), meal_uuid, uid, 'fdc', floor(random()*900000+100000)::text,
            meal_names[meal_idx][1], 1, 'serving',
            jsonb_build_object('calories', round((300 + random() * 250)::numeric), 'protein', round((15 + random() * 20)::numeric, 1), 'carbs', round((30 + random() * 30)::numeric, 1), 'fat', round((10 + random() * 15)::numeric, 1)));

    -- Breakfast checkin (70% chance)
    IF random() < 0.7 THEN
      INSERT INTO meal_checkins (id, user_id, meal_id, energy, fullness, cravings, mood, movement_after)
      VALUES (gen_random_uuid(), uid, meal_uuid,
              energy_choices[floor(random()*3+1)::integer],
              fullness_choices[floor(random()*3+1)::integer],
              cravings_choices[floor(random()*3+1)::integer],
              mood_choices[floor(random()*3+1)::integer],
              random() < 0.4);
    END IF;

    -- LUNCH
    meal_idx := (floor(random() * 7) + 8)::integer;
    meal_uuid := gen_random_uuid();
    INSERT INTO meals (id, user_id, name, meal_type, logged_at, calories, protein_g, carbs_g, fat_g, fiber_g)
    VALUES (meal_uuid, uid, meal_names[meal_idx][1], 'lunch',
            (d + interval '12 hours' + (random() * interval '60 minutes'))::timestamptz,
            round((400 + random() * 300)::numeric), round((25 + random() * 25)::numeric, 1),
            round((35 + random() * 35)::numeric, 1), round((12 + random() * 18)::numeric, 1),
            round((4 + random() * 6)::numeric, 1));

    INSERT INTO meal_items (id, meal_id, user_id, provider, external_id, display_name, quantity, unit, nutrients)
    VALUES (gen_random_uuid(), meal_uuid, uid, 'fdc', floor(random()*900000+100000)::text,
            meal_names[meal_idx][1], 1, 'serving',
            jsonb_build_object('calories', round((400 + random() * 300)::numeric), 'protein', round((25 + random() * 25)::numeric, 1), 'carbs', round((35 + random() * 35)::numeric, 1), 'fat', round((12 + random() * 18)::numeric, 1)));

    IF random() < 0.65 THEN
      INSERT INTO meal_checkins (id, user_id, meal_id, energy, fullness, cravings, mood, movement_after)
      VALUES (gen_random_uuid(), uid, meal_uuid,
              energy_choices[floor(random()*3+1)::integer],
              fullness_choices[floor(random()*3+1)::integer],
              cravings_choices[floor(random()*3+1)::integer],
              mood_choices[floor(random()*3+1)::integer],
              random() < 0.3);
    END IF;

    -- DINNER
    meal_idx := (floor(random() * 7) + 15)::integer;
    meal_uuid := gen_random_uuid();
    INSERT INTO meals (id, user_id, name, meal_type, logged_at, calories, protein_g, carbs_g, fat_g, fiber_g)
    VALUES (meal_uuid, uid, meal_names[meal_idx][1], 'dinner',
            (d + interval '18 hours' + (random() * interval '120 minutes'))::timestamptz,
            round((450 + random() * 350)::numeric), round((30 + random() * 25)::numeric, 1),
            round((40 + random() * 40)::numeric, 1), round((15 + random() * 20)::numeric, 1),
            round((5 + random() * 7)::numeric, 1));

    INSERT INTO meal_items (id, meal_id, user_id, provider, external_id, display_name, quantity, unit, nutrients)
    VALUES (gen_random_uuid(), meal_uuid, uid, 'fdc', floor(random()*900000+100000)::text,
            meal_names[meal_idx][1], 1, 'serving',
            jsonb_build_object('calories', round((450 + random() * 350)::numeric), 'protein', round((30 + random() * 25)::numeric, 1), 'carbs', round((40 + random() * 40)::numeric, 1), 'fat', round((15 + random() * 20)::numeric, 1)));

    IF random() < 0.6 THEN
      INSERT INTO meal_checkins (id, user_id, meal_id, energy, fullness, cravings, mood, movement_after)
      VALUES (gen_random_uuid(), uid, meal_uuid,
              energy_choices[floor(random()*3+1)::integer],
              fullness_choices[floor(random()*3+1)::integer],
              cravings_choices[floor(random()*3+1)::integer],
              mood_choices[floor(random()*3+1)::integer],
              random() < 0.5);
    END IF;

    -- SNACK (60% of days)
    IF random() < 0.6 THEN
      meal_idx := (floor(random() * 5) + 22)::integer;
      meal_uuid := gen_random_uuid();
      INSERT INTO meals (id, user_id, name, meal_type, logged_at, calories, protein_g, carbs_g, fat_g, fiber_g)
      VALUES (meal_uuid, uid, meal_names[meal_idx][1], 'snack',
              (d + interval '15 hours' + (random() * interval '120 minutes'))::timestamptz,
              round((100 + random() * 200)::numeric), round((5 + random() * 10)::numeric, 1),
              round((10 + random() * 20)::numeric, 1), round((5 + random() * 12)::numeric, 1),
              round((2 + random() * 4)::numeric, 1));
    END IF;
  END LOOP;

  -- =========================================================
  -- 5. ACTIVITY LOGS (30 days, 1-2 activities per day)
  -- =========================================================
  FOR d IN SELECT generate_series(CURRENT_DATE - 29, CURRENT_DATE, '1 day'::interval)::date LOOP
    -- Primary activity (85% chance)
    IF random() < 0.85 THEN
      activity_idx := floor(random() * 10 + 1)::integer;
      INSERT INTO activity_logs (id, user_id, activity_name, logged_at, duration_minutes, intensity, notes)
      VALUES (gen_random_uuid(), uid, activity_names[activity_idx],
              (d + interval '6 hours' + (random() * interval '12 hours'))::timestamptz,
              (20 + floor(random() * 50))::integer,
              intensities[floor(random()*3+1)::integer],
              CASE WHEN random() < 0.2 THEN 'Felt great today!' WHEN random() < 0.1 THEN 'A bit tired but pushed through' ELSE NULL END);
    END IF;

    -- Second activity (30% chance)
    IF random() < 0.3 THEN
      activity_idx := floor(random() * 10 + 1)::integer;
      INSERT INTO activity_logs (id, user_id, activity_name, logged_at, duration_minutes, intensity)
      VALUES (gen_random_uuid(), uid, activity_names[activity_idx],
              (d + interval '16 hours' + (random() * interval '4 hours'))::timestamptz,
              (15 + floor(random() * 30))::integer,
              intensities[floor(random()*3+1)::integer]);
    END IF;
  END LOOP;

  -- =========================================================
  -- 6. WEIGHT LOGS (every 2-3 days for 30 days)
  -- =========================================================
  FOR d IN SELECT generate_series(CURRENT_DATE - 29, CURRENT_DATE, '1 day'::interval)::date LOOP
    IF (extract(day from d)::integer % 2 = 0) OR random() < 0.3 THEN
      INSERT INTO weight_logs (id, user_id, weight_kg, logged_at, source)
      VALUES (gen_random_uuid(), uid,
              round((78.0 - (CURRENT_DATE - d) * 0.03 + random() * 0.4 - 0.2)::numeric, 1),
              (d + interval '7 hours')::timestamptz, 'manual');
    END IF;
  END LOOP;

  -- =========================================================
  -- 7. DAILY CHECK-INS (30 days)
  -- =========================================================
  FOR d IN SELECT generate_series(CURRENT_DATE - 29, CURRENT_DATE, '1 day'::interval)::date LOOP
    IF random() < 0.85 THEN
      energy_val := floor(random() * 3 + 3)::integer; -- 3-5 mostly
      INSERT INTO daily_checkins (id, user_id, date, energy_level, meals_logged, mood_tag, glucose_reading, completed_at)
      VALUES (gen_random_uuid(), uid, d, energy_val,
              jsonb_build_object('breakfast', true, 'lunch', true, 'dinner', random() < 0.9, 'snacks', random() < 0.6),
              mood_tags[GREATEST(1, LEAST(4, floor(random()*3+1)::integer))],
              CASE WHEN random() < 0.6 THEN round((5.0 + random() * 1.5)::numeric, 1) ELSE NULL END,
              (d + interval '21 hours')::timestamptz)
      ON CONFLICT (user_id, date) DO UPDATE SET
        energy_level = EXCLUDED.energy_level,
        meals_logged = EXCLUDED.meals_logged,
        mood_tag = EXCLUDED.mood_tag,
        glucose_reading = EXCLUDED.glucose_reading,
        updated_at = now();
    END IF;
  END LOOP;

  -- =========================================================
  -- 8. DAILY CONTEXT — SLEEP + ACTIVITY + VITALS (30 days)
  -- =========================================================
  FOR d IN SELECT generate_series(CURRENT_DATE - 29, CURRENT_DATE, '1 day'::interval)::date LOOP
    -- Realistic sleep: weekdays 6.5-7.5h, weekends 7.5-9h
    IF extract(dow from d) IN (0, 6) THEN
      sleep_h := round((7.5 + random() * 1.5)::numeric, 1);
    ELSE
      sleep_h := round((6.0 + random() * 2.0)::numeric, 1);
    END IF;

    steps_val := (6000 + floor(random() * 8000))::integer;
    active_min := (20 + floor(random() * 50))::integer;
    rhr := round((58 + random() * 10)::numeric, 0);
    hrv := round((35 + random() * 30)::numeric, 0);

    INSERT INTO daily_context (user_id, date, sleep_hours, sleep_quality, steps, active_minutes, resting_hr, hrv_ms, stress_level)
    VALUES (uid, d, sleep_h,
            sleep_qualities[GREATEST(1, LEAST(4, CASE
              WHEN sleep_h >= 8 THEN 4
              WHEN sleep_h >= 7 THEN floor(random()+3)::integer
              WHEN sleep_h >= 6 THEN floor(random()*2+2)::integer
              ELSE floor(random()+1)::integer
            END))],
            steps_val, active_min, rhr, hrv,
            GREATEST(1, LEAST(5, floor(random()*3+1)::integer)))
    ON CONFLICT (user_id, date) DO UPDATE SET
      sleep_hours = EXCLUDED.sleep_hours,
      sleep_quality = EXCLUDED.sleep_quality,
      steps = EXCLUDED.steps,
      active_minutes = EXCLUDED.active_minutes,
      resting_hr = EXCLUDED.resting_hr,
      hrv_ms = EXCLUDED.hrv_ms,
      stress_level = EXCLUDED.stress_level,
      updated_at = now();
  END LOOP;

  -- =========================================================
  -- 9. METABOLIC DAILY FEATURES (30 days)
  -- =========================================================
  FOR d IN SELECT generate_series(CURRENT_DATE - 29, CURRENT_DATE, '1 day'::interval)::date LOOP
    INSERT INTO metabolic_daily_features (user_id, date, feature_version, glucose_avg, glucose_cv, glucose_logs_count, time_in_range_pct, meal_count, meal_checkin_count, fibre_g_avg, steps, active_minutes, sleep_hours, resting_hr, hrv_ms)
    VALUES (uid, d, 1,
            round((5.5 + random() * 1.5)::numeric, 2),
            round((0.10 + random() * 0.15)::numeric, 4),
            (4 + floor(random() * 3))::integer,
            round((65 + random() * 30)::numeric, 2),
            (3 + floor(random() * 2))::integer,
            (2 + floor(random() * 2))::integer,
            round((4 + random() * 5)::numeric, 2),
            (6000 + floor(random() * 8000))::integer,
            (20 + floor(random() * 50))::integer,
            round((6.5 + random() * 2)::numeric, 2),
            round((58 + random() * 10)::numeric, 1),
            round((35 + random() * 30)::numeric, 2))
    ON CONFLICT (user_id, date) DO UPDATE SET
      glucose_avg = EXCLUDED.glucose_avg,
      glucose_cv = EXCLUDED.glucose_cv,
      steps = EXCLUDED.steps,
      sleep_hours = EXCLUDED.sleep_hours,
      updated_at = now();
  END LOOP;

  -- =========================================================
  -- 10. METABOLIC WEEKLY SCORES (4 weeks)
  -- =========================================================
  FOR d IN SELECT generate_series(CURRENT_DATE - 28, CURRENT_DATE, '7 days'::interval)::date LOOP
    INSERT INTO user_metabolic_weekly_scores (user_id, week_start, score7d)
    VALUES (uid, d, (65 + floor(random() * 25))::integer)
    ON CONFLICT (user_id, week_start) DO UPDATE SET
      score7d = EXCLUDED.score7d,
      updated_at = now();
  END LOOP;

  -- =========================================================
  -- 11. USER METABOLIC PROFILE
  -- =========================================================
  INSERT INTO user_metabolic_profile (user_id, baseline_resting_hr, baseline_steps, baseline_sleep_hours, baseline_hrv_ms, baseline_metabolic_score, sensitivity_sleep, sensitivity_steps, sensitivity_recovery, pattern_weekend_disruption, pattern_sleep_sensitive, pattern_activity_sensitive, data_coverage_days, valid_days_for_sensitivity)
  VALUES (uid, 62.0, 9500, 7.2, 48.0, 74, 'medium', 'high', 'average', true, true, false, 30, 25)
  ON CONFLICT (user_id) DO UPDATE SET
    baseline_resting_hr = EXCLUDED.baseline_resting_hr,
    baseline_steps = EXCLUDED.baseline_steps,
    baseline_metabolic_score = EXCLUDED.baseline_metabolic_score,
    data_coverage_days = EXCLUDED.data_coverage_days,
    updated_at = now();

  -- =========================================================
  -- 12. LAB SNAPSHOTS (2 entries)
  -- =========================================================
  INSERT INTO lab_snapshots (id, user_id, collected_at, fasting_glucose_value, fasting_glucose_unit, fasting_insulin_value, fasting_insulin_unit, triglycerides_value, triglycerides_unit, hdl_value, hdl_unit, alt_value, alt_unit, weight_kg, height_cm, notes, source)
  VALUES
    (gen_random_uuid(), uid, (CURRENT_DATE - 90)::timestamptz, 5.4, 'mmol/L', 8.2, 'uIU/mL', 1.3, 'mmol/L', 1.5, 'mmol/L', 22, 'U/L', 79.5, 178, 'Annual checkup', 'manual'),
    (gen_random_uuid(), uid, (CURRENT_DATE - 7)::timestamptz, 5.1, 'mmol/L', 7.0, 'uIU/mL', 1.1, 'mmol/L', 1.6, 'mmol/L', 19, 'U/L', 78.0, 178, 'Follow-up labs — improvement noted', 'manual');

  -- =========================================================
  -- 13. WEEKLY REVIEWS (4 weeks)
  -- =========================================================
  INSERT INTO weekly_reviews (id, user_id, week_start, review_text, experiment_suggestion, key_metric, metric_direction, journey_stage, generated_at)
  VALUES
    (gen_random_uuid(), uid, CURRENT_DATE - 28,
     'Your glucose patterns showed noticeable improvement this week. Post-lunch readings were steadier, averaging 6.8 mmol/L compared to 7.4 last week. Your consistent morning walks appear to be contributing to better fasting levels. Consider pairing your afternoon meals with a short walk to extend these gains.',
     'Try adding a 10-minute walk after lunch for the next 5 days and compare your post-meal readings.',
     'glucose_avg', 'down', 'building_momentum', (CURRENT_DATE - 21)::timestamptz),
    (gen_random_uuid(), uid, CURRENT_DATE - 21,
     'Strong week! You logged meals consistently (26 of 28 possible) and your time-in-range hit 82%. Sleep quality on weeknights dipped slightly — your Tuesday and Wednesday nights averaged 6.2 hours, which correlated with higher fasting glucose the next morning. Weekend recovery sleep was solid at 8.1 hours average.',
     'Focus on a consistent 10:30pm wind-down routine on weeknights to improve sleep consistency.',
     'time_in_range', 'up', 'building_momentum', (CURRENT_DATE - 14)::timestamptz),
    (gen_random_uuid(), uid, CURRENT_DATE - 14,
     'This week your metabolic score reached 78 — your highest yet. The combination of balanced meals and regular activity is paying off. Your body seems to respond well to the Mediterranean-style meals you''ve been logging. One area to watch: late dinners (after 8pm) on 3 days correlated with higher fasting glucose the next morning.',
     'Try having dinner before 7:30pm for 5 days this week and see if fasting glucose improves.',
     'metabolic_score', 'up', 'progressing', (CURRENT_DATE - 7)::timestamptz),
    (gen_random_uuid(), uid, CURRENT_DATE - 7,
     'Excellent consistency this week — you logged every meal and checked in 85% of the time. Your fiber intake averaged 28g/day, up from 22g two weeks ago. Post-meal glucose responses have flattened noticeably, especially after high-fiber lunches. Your HRV has been trending up, suggesting good recovery.',
     'Try adding a handful of nuts or seeds to one meal each day to keep boosting fiber and healthy fats.',
     'fibre_avg', 'up', 'progressing', CURRENT_DATE::timestamptz);

  -- =========================================================
  -- 14. AI OUTPUT HISTORY (next best actions + insights)
  -- =========================================================
  INSERT INTO ai_output_history (id, user_id, output_type, content_hash, title, body, action_type, metadata)
  VALUES
    (gen_random_uuid(), uid, 'next_best_action', md5('walk_after_lunch'), 'Walk After Lunch',
     'Your post-lunch glucose tends to peak around 7.5 mmol/L. A 10-minute walk within 30 minutes of eating could reduce this by up to 1.0 mmol/L based on your exercise sensitivity.',
     'activity', '{"priority": "high", "confidence": 0.88}'::jsonb),
    (gen_random_uuid(), uid, 'next_best_action', md5('fiber_breakfast'), 'Add Fiber to Breakfast',
     'Breakfasts with 5g+ fiber show 15% lower glucose response in your data. Try adding chia seeds or berries to your morning meal.',
     'meal', '{"priority": "medium", "confidence": 0.82}'::jsonb),
    (gen_random_uuid(), uid, 'next_best_action', md5('sleep_consistency'), 'Consistent Bedtime',
     'Your fasting glucose is 0.4 mmol/L higher after nights with less than 7 hours of sleep. Aiming for a consistent 10:30pm bedtime could help.',
     'sleep', '{"priority": "high", "confidence": 0.91}'::jsonb),
    (gen_random_uuid(), uid, 'score_explanation', md5('score_week4'), 'Your Score: 78',
     'Your metabolic score of 78 reflects steady glucose control (82% time-in-range), consistent activity (avg 9,200 steps), and good sleep recovery. The main growth area is weeknight sleep consistency.',
     NULL, '{"score": 78, "week": "current"}'::jsonb),
    (gen_random_uuid(), uid, 'next_best_action', md5('dinner_timing'), 'Earlier Dinner Window',
     'Dinners before 7:30pm showed 18% lower overnight glucose in your recent data. Your body appears to process evening meals better with more time before sleep.',
     'timing', '{"priority": "medium", "confidence": 0.79}'::jsonb);

  -- =========================================================
  -- 15. CHAT SESSION + MESSAGES
  -- =========================================================
  session_uuid := gen_random_uuid();
  INSERT INTO chat_sessions (id, user_id, is_active, last_message_at)
  VALUES (session_uuid, uid, true, now());

  INSERT INTO chat_messages (id, session_id, user_id, role, content, status, created_at)
  VALUES
    (gen_random_uuid(), session_uuid, uid, 'user', 'How has my glucose been this week?', 'sent', now() - interval '2 hours'),
    (gen_random_uuid(), session_uuid, uid, 'assistant', 'Your glucose has been looking really steady this week! Your average is 5.8 mmol/L with 82% time-in-range — both improvements from last week. Post-lunch readings have been particularly well-controlled, averaging 6.8 mmol/L. The Mediterranean-style meals you''ve been having seem to agree well with your body. One thing to keep an eye on: your late dinners (after 8pm) on a couple of days pushed fasting glucose up the next morning. Overall, great progress!', 'sent', now() - interval '1 hour 55 minutes'),
    (gen_random_uuid(), session_uuid, uid, 'user', 'What should I focus on next?', 'sent', now() - interval '1 hour 50 minutes'),
    (gen_random_uuid(), session_uuid, uid, 'assistant', 'Based on your recent patterns, here are two high-impact areas to focus on:

1. **Dinner timing** — Try to eat before 7:30pm. Your data shows that late dinners correlate with higher fasting glucose the next morning.

2. **Weeknight sleep** — Your Tuesday and Wednesday nights tend to be shorter (around 6.2 hours). Even 30 extra minutes could make a noticeable difference in your morning readings.

You''re already doing great with consistent meal logging and post-meal walks. Keep that up!', 'sent', now() - interval '1 hour 45 minutes');

  -- =========================================================
  -- 16. USER APP SESSIONS (30 days of usage)
  -- =========================================================
  FOR d IN SELECT generate_series(CURRENT_DATE - 29, CURRENT_DATE, '1 day'::interval)::date LOOP
    INSERT INTO user_app_sessions (user_id, session_date, first_opened_at, platform, app_version)
    VALUES (uid, d, (d + interval '7 hours' + (random() * interval '2 hours'))::timestamptz, 'ios', '1.4.2')
    ON CONFLICT (user_id, session_date) DO NOTHING;
  END LOOP;

  RAISE NOTICE 'Demo data seeded successfully for user %', uid;
END $$;
