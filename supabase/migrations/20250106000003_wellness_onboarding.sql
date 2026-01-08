-- Migration: Wellness-first onboarding redesign
-- Created: 2025-01-06
-- Purpose: Add new tracking modes and profile fields for wellness positioning

-- ============================================
-- PROFILES: Update tracking_mode constraint
-- ============================================

-- Step 1: Drop old constraint if exists
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_tracking_mode_check;

-- Step 2: Add new tracking modes while preserving legacy values
-- This keeps backward compatibility with existing users
ALTER TABLE profiles ADD CONSTRAINT profiles_tracking_mode_check 
  CHECK (tracking_mode IN (
    'meals_wearables',           -- Default: Meals + Apple Health
    'meals_only',                -- Meals only, no device data
    'manual_glucose_optional',   -- Meals + optional manual readings
    'wearables_only',           -- Legacy: kept for existing data
    'glucose_tracking'          -- Legacy: kept for existing data
  ));

-- Step 3: Set new default for new users
ALTER TABLE profiles ALTER COLUMN tracking_mode SET DEFAULT 'meals_wearables';

-- ============================================
-- PROFILES: Add new columns for wellness onboarding
-- ============================================

-- Body metrics (optional)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS height_cm numeric(5,1);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS weight_kg numeric(5,1);

-- Coaching style preference
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS coaching_style text 
  CHECK (coaching_style IS NULL OR coaching_style IN ('light', 'balanced', 'structured'));

-- Notifications opt-in (default FALSE per regulatory requirement)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notifications_enabled boolean DEFAULT false;

-- Ensure goals field exists
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS goals text[] DEFAULT '{}';

-- ============================================
-- COMMENTS: Document column purposes
-- ============================================

COMMENT ON COLUMN profiles.tracking_mode IS 'User tracking preference: meals_wearables (default), meals_only, or manual_glucose_optional';
COMMENT ON COLUMN profiles.height_cm IS 'User height in centimeters (optional)';
COMMENT ON COLUMN profiles.weight_kg IS 'User weight in kilograms (optional)';
COMMENT ON COLUMN profiles.coaching_style IS 'Coaching intensity: light, balanced, or structured';
COMMENT ON COLUMN profiles.notifications_enabled IS 'User has opted into push notifications';
