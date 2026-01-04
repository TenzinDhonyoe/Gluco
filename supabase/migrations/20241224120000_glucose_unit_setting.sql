-- Add glucose_unit column to profiles table
-- Users can choose between mmol/L (default) and mg/dL for display
-- All glucose values are stored in mmol/L in the database regardless of this setting

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS glucose_unit TEXT NOT NULL DEFAULT 'mmol/L';

-- Add check constraint to ensure only valid units
ALTER TABLE profiles 
ADD CONSTRAINT profiles_glucose_unit_check 
CHECK (glucose_unit IN ('mmol/L', 'mg/dL'));

-- Comment for documentation
COMMENT ON COLUMN profiles.glucose_unit IS 'User preferred glucose unit for display. Values: mmol/L (default), mg/dL. All stored glucose values remain in mmol/L.';

