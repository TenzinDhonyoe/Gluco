-- ============================================
-- Add library display fields to experiment_templates
-- ============================================

-- New columns for experiment library cards
ALTER TABLE experiment_templates
    ADD COLUMN IF NOT EXISTS difficulty TEXT CHECK (difficulty IN ('easy', 'medium', 'hard')),
    ADD COLUMN IF NOT EXISTS impact TEXT CHECK (impact IN ('high', 'medium', 'low')),
    ADD COLUMN IF NOT EXISTS short_description TEXT,
    ADD COLUMN IF NOT EXISTS icon_color TEXT;

-- Update existing templates with library metadata
UPDATE experiment_templates SET
    difficulty = 'medium',
    impact = 'high',
    short_description = 'Compare oatmeal vs eggs for breakfast glucose response',
    icon_color = '#FBBF24'
WHERE slug = 'oatmeal-vs-eggs';

UPDATE experiment_templates SET
    difficulty = 'easy',
    impact = 'medium',
    short_description = 'See how rice portions affect your glucose',
    icon_color = '#F87171'
WHERE slug = 'rice-portion-swap';

UPDATE experiment_templates SET
    title = 'Post-Meal Walk',
    difficulty = 'easy',
    impact = 'high',
    short_description = 'A short walk after meals can reduce glucose spikes',
    icon_color = '#34D399',
    protocol = protocol || '{"science": {"title": "Why walking helps", "description": "Muscle contractions during walking help clear glucose from the bloodstream, reducing post-meal spikes by up to 30%.", "steps": ["Finish your meal as normal", "Within 15 minutes, take a gentle 15-minute walk", "Log completion when you return"], "study_link": "https://doi.org/10.1007/s00125-016-4085-2"}}'::jsonb
WHERE slug = 'post-meal-walk';

UPDATE experiment_templates SET
    title = 'Fiber First',
    difficulty = 'easy',
    impact = 'high',
    short_description = 'Eating veggies before carbs can blunt glucose spikes',
    icon_color = '#34D399',
    protocol = protocol || '{"science": {"title": "The fiber-first effect", "description": "Eating fiber before carbohydrates creates a gel-like barrier in your stomach, slowing glucose absorption and reducing post-meal spikes.", "steps": ["Prepare a small portion of vegetables or salad", "Eat the fiber-rich foods 10 minutes before your main meal", "Eat the rest of your meal normally", "Log completion after your meal"], "study_link": "https://doi.org/10.2337/dc15-0429"}}'::jsonb
WHERE slug = 'fiber-preload';

UPDATE experiment_templates SET
    title = 'Early Dinner',
    difficulty = 'medium',
    impact = 'medium',
    short_description = 'Compare early vs late dinner on glucose and sleep',
    icon_color = '#818CF8'
WHERE slug = 'meal-timing';

UPDATE experiment_templates SET
    difficulty = 'hard',
    impact = 'medium',
    short_description = 'Test intermittent fasting effects on your glucose',
    icon_color = '#F97316'
WHERE slug = 'breakfast-skip';

-- Insert new templates matching mockup library cards
INSERT INTO experiment_templates (slug, title, subtitle, description, category, protocol, icon, sort_order, difficulty, impact, short_description, icon_color)
VALUES
    (
        'cold-shower',
        'Cold Shower',
        'Morning Cold Exposure',
        'Start your day with a cold shower to boost alertness and metabolic activation. Evidence suggests cold exposure can improve glucose sensitivity.',
        'habit',
        '{
            "duration_days": 7,
            "exposures_per_variant": 7,
            "alternating": false,
            "checkin_questions": ["energy", "difficulty"],
            "instructions": "End your morning shower with 30-60 seconds of cold water. Gradually increase duration as you adapt.",
            "science": {
                "title": "Cold exposure and metabolism",
                "description": "Brief cold exposure activates brown adipose tissue, which burns glucose for heat. Regular cold showers may improve insulin sensitivity and increase metabolic rate.",
                "steps": ["Take your normal warm shower", "Turn the water to cold for the last 30-60 seconds", "Focus on slow, deep breathing", "Log how you feel afterward"],
                "study_link": "https://doi.org/10.1371/journal.pone.0161078"
            }
        }'::jsonb,
        '🧊',
        7,
        'hard',
        'high',
        'Morning cold exposure for metabolic activation',
        '#60A5FA'
    ),
    (
        'acv-shot',
        'ACV Shot',
        'Apple Cider Vinegar Before Meals',
        'Take a tablespoon of apple cider vinegar diluted in water before carb-heavy meals. Studies show this may reduce post-meal glucose spikes.',
        'habit',
        '{
            "duration_days": 7,
            "exposures_per_variant": 7,
            "alternating": false,
            "meal_type": "any",
            "checkin_questions": ["energy", "difficulty"],
            "instructions": "Mix 1 tablespoon of apple cider vinegar in a glass of water. Drink 15-20 minutes before your meal.",
            "science": {
                "title": "Vinegar and glucose response",
                "description": "Acetic acid in vinegar slows gastric emptying and improves insulin sensitivity, which can reduce post-meal glucose spikes by 20-30%.",
                "steps": ["Mix 1 tbsp ACV in 8oz water", "Drink 15-20 minutes before eating", "Eat your meal normally", "Log completion and how you felt"],
                "study_link": "https://doi.org/10.1038/ejcn.2015.235"
            }
        }'::jsonb,
        '🍎',
        8,
        'easy',
        'high',
        'Apple cider vinegar before meals for better glucose',
        '#F97316'
    ),
    (
        'hydration-challenge',
        'Hydration Challenge',
        '8 Glasses a Day',
        'Track your daily water intake and observe the effects on energy, focus, and glucose stability. Proper hydration supports metabolic function.',
        'habit',
        '{
            "duration_days": 7,
            "exposures_per_variant": 7,
            "alternating": false,
            "checkin_questions": ["energy"],
            "instructions": "Drink at least 8 glasses (64oz) of water throughout the day. Track each glass and log completion at the end of the day.",
            "science": {
                "title": "Hydration and glucose",
                "description": "Even mild dehydration can raise blood glucose levels. Adequate water intake helps kidneys flush excess glucose and supports overall metabolic efficiency.",
                "steps": ["Start with a glass of water upon waking", "Carry a water bottle throughout the day", "Aim for 8 glasses (64oz) total", "Log completion before bed"]
            }
        }'::jsonb,
        '💧',
        9,
        'easy',
        'medium',
        'Stay hydrated to support glucose stability',
        '#22D3EE'
    ),
    (
        'box-breathing',
        'Box Breathing',
        'Stress Reduction Practice',
        'Practice 4-4-4-4 box breathing twice daily to reduce cortisol and improve glucose regulation through stress management.',
        'habit',
        '{
            "duration_days": 7,
            "exposures_per_variant": 7,
            "alternating": false,
            "checkin_questions": ["energy", "difficulty"],
            "instructions": "Practice box breathing for 5 minutes twice a day: Inhale 4 seconds, hold 4 seconds, exhale 4 seconds, hold 4 seconds.",
            "science": {
                "title": "Breathing and stress hormones",
                "description": "Box breathing activates the parasympathetic nervous system, reducing cortisol levels. Lower cortisol means less glucose released from liver stores, leading to more stable blood sugar.",
                "steps": ["Find a quiet spot and sit comfortably", "Inhale through your nose for 4 seconds", "Hold your breath for 4 seconds", "Exhale slowly for 4 seconds, then hold for 4 seconds", "Repeat for 5 minutes"]
            }
        }'::jsonb,
        '🧘',
        10,
        'easy',
        'medium',
        'Reduce stress hormones that spike glucose levels',
        '#A78BFA'
    )
ON CONFLICT (slug) DO UPDATE SET
    title = EXCLUDED.title,
    subtitle = EXCLUDED.subtitle,
    description = EXCLUDED.description,
    protocol = EXCLUDED.protocol,
    icon = EXCLUDED.icon,
    sort_order = EXCLUDED.sort_order,
    difficulty = EXCLUDED.difficulty,
    impact = EXCLUDED.impact,
    short_description = EXCLUDED.short_description,
    icon_color = EXCLUDED.icon_color,
    updated_at = now();
