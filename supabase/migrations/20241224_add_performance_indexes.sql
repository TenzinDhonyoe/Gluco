-- Migration: Add Performance Indexes
-- These indexes optimize common query patterns for better performance

-- Index for glucose logs date range queries (most common query pattern)
CREATE INDEX IF NOT EXISTS glucose_logs_user_logged_at_idx 
ON glucose_logs(user_id, logged_at DESC);

-- Index for activity logs date range queries
CREATE INDEX IF NOT EXISTS activity_logs_user_logged_at_idx
ON activity_logs(user_id, logged_at DESC);

-- Index for meals date range queries
CREATE INDEX IF NOT EXISTS meals_user_logged_at_idx
ON meals(user_id, logged_at DESC);

-- Index for meal_items join queries (used in fibre calculations)
CREATE INDEX IF NOT EXISTS meal_items_meal_id_idx
ON meal_items(meal_id);

-- Composite index for meals with included id (optimizes fibre query)
-- The id is included to avoid table lookup when joining
CREATE INDEX IF NOT EXISTS meals_user_logged_at_composite_idx
ON meals(user_id, logged_at DESC) 
INCLUDE (id);

-- Index for post_meal_reviews queries
CREATE INDEX IF NOT EXISTS post_meal_reviews_user_status_idx
ON post_meal_reviews(user_id, status, scheduled_for DESC);

-- Index for favorite_foods lookups
CREATE INDEX IF NOT EXISTS favorite_foods_user_provider_external_idx
ON favorite_foods(user_id, provider, external_id);

-- Index for recent_foods queries
CREATE INDEX IF NOT EXISTS recent_foods_user_used_at_idx
ON recent_foods(user_id, used_at DESC);

-- Add comments for documentation
COMMENT ON INDEX glucose_logs_user_logged_at_idx IS 'Optimizes date range queries for glucose logs by user';
COMMENT ON INDEX activity_logs_user_logged_at_idx IS 'Optimizes date range queries for activity logs by user';
COMMENT ON INDEX meals_user_logged_at_idx IS 'Optimizes date range queries for meals by user';
COMMENT ON INDEX meal_items_meal_id_idx IS 'Optimizes JOIN queries between meals and meal_items';
COMMENT ON INDEX meals_user_logged_at_composite_idx IS 'Composite index with included id for fibre intake calculations';

