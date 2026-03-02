-- Add summary nutrition columns to the meals table
-- These store the total meal nutrition for quick access without joining meal_items

ALTER TABLE meals
  ADD COLUMN IF NOT EXISTS calories    numeric,
  ADD COLUMN IF NOT EXISTS protein_g   numeric,
  ADD COLUMN IF NOT EXISTS carbs_g     numeric,
  ADD COLUMN IF NOT EXISTS fat_g       numeric,
  ADD COLUMN IF NOT EXISTS fiber_g     numeric;

COMMENT ON COLUMN meals.calories  IS 'Total meal calories (kcal)';
COMMENT ON COLUMN meals.protein_g IS 'Total protein in grams';
COMMENT ON COLUMN meals.carbs_g   IS 'Total carbohydrates in grams';
COMMENT ON COLUMN meals.fat_g     IS 'Total fat in grams';
COMMENT ON COLUMN meals.fiber_g   IS 'Total fiber in grams';
