-- Recent Foods Table
-- Stores user's recently selected/used food items with timestamp

CREATE TABLE IF NOT EXISTS recent_foods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('fdc', 'off')),
    external_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    brand TEXT,
    serving_size NUMERIC,
    serving_unit TEXT,
    nutrients JSONB NOT NULL DEFAULT '{}',
    used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Unique constraint: one entry per user per food (we update used_at on reuse)
    UNIQUE(user_id, provider, external_id)
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_recent_foods_user_id ON recent_foods(user_id);
CREATE INDEX IF NOT EXISTS idx_recent_foods_used_at ON recent_foods(user_id, used_at DESC);

-- Enable RLS
ALTER TABLE recent_foods ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own recents
CREATE POLICY "Users can view own recents"
    ON recent_foods FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own recents"
    ON recent_foods FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own recents"
    ON recent_foods FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own recents"
    ON recent_foods FOR DELETE
    USING (auth.uid() = user_id);
