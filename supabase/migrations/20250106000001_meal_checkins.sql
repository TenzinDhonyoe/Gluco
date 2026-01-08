-- Migration: Add meal_checkins table for wellness-only after-meal check-ins
-- Created: 2025-01-06
-- Purpose: Replace post-meal spike reviews with simple self-reported check-ins

-- ============================================
-- CREATE meal_checkins TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS meal_checkins (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users NOT NULL,
    meal_id uuid REFERENCES meals(id) ON DELETE CASCADE NOT NULL,
    energy text CHECK (energy IS NULL OR energy IN ('low', 'steady', 'high')),
    fullness text CHECK (fullness IS NULL OR fullness IN ('low', 'okay', 'high')),
    cravings text CHECK (cravings IS NULL OR cravings IN ('low', 'medium', 'high')),
    mood text CHECK (mood IS NULL OR mood IN ('low', 'okay', 'good')),
    movement_after boolean,
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(user_id, meal_id)
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_meal_checkins_user_created 
    ON meal_checkins(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meal_checkins_meal 
    ON meal_checkins(meal_id);

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================

CREATE OR REPLACE FUNCTION update_meal_checkins_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_meal_checkins_updated_at ON meal_checkins;

CREATE TRIGGER trigger_meal_checkins_updated_at
    BEFORE UPDATE ON meal_checkins
    FOR EACH ROW
    EXECUTE FUNCTION update_meal_checkins_updated_at();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE meal_checkins ENABLE ROW LEVEL SECURITY;

-- SELECT policy
-- SELECT policy
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'meal_checkins' AND policyname = 'Users can view own check-ins') THEN
    CREATE POLICY "Users can view own check-ins" ON meal_checkins FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- INSERT policy
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'meal_checkins' AND policyname = 'Users can create own check-ins') THEN
    CREATE POLICY "Users can create own check-ins" ON meal_checkins FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- UPDATE policy
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'meal_checkins' AND policyname = 'Users can update own check-ins') THEN
    CREATE POLICY "Users can update own check-ins" ON meal_checkins FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- DELETE policy
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'meal_checkins' AND policyname = 'Users can delete own check-ins') THEN
    CREATE POLICY "Users can delete own check-ins" ON meal_checkins FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE meal_checkins IS 'Self-reported after-meal wellness check-ins (replaces post-meal spike reviews)';
COMMENT ON COLUMN meal_checkins.energy IS 'How energy felt after meal: low, steady, high';
COMMENT ON COLUMN meal_checkins.fullness IS 'Satiety level: low, okay, high';
COMMENT ON COLUMN meal_checkins.cravings IS 'Cravings level: low, medium, high';
COMMENT ON COLUMN meal_checkins.mood IS 'Mood after meal: low, okay, good';
COMMENT ON COLUMN meal_checkins.movement_after IS 'Whether user moved/walked after meal';
