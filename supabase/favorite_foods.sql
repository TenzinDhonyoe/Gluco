-- Favorite Foods Table
-- Stores user's favorited food items for quick access

CREATE TABLE IF NOT EXISTS favorite_foods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('fdc', 'off')),
    external_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    brand TEXT,
    serving_size NUMERIC,
    serving_unit TEXT,
    nutrients JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Unique constraint: one favorite per user per food
    UNIQUE(user_id, provider, external_id)
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_favorite_foods_user_id ON favorite_foods(user_id);
CREATE INDEX IF NOT EXISTS idx_favorite_foods_lookup ON favorite_foods(user_id, provider, external_id);

-- Enable RLS
ALTER TABLE favorite_foods ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own favorites
CREATE POLICY "Users can view own favorites"
    ON favorite_foods FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own favorites"
    ON favorite_foods FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own favorites"
    ON favorite_foods FOR DELETE
    USING (auth.uid() = user_id);
