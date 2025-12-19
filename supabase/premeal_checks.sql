-- ============================================
-- Table: premeal_checks
-- Purpose: Cache AI-generated Pre Meal Check results to avoid redundant LLM calls
-- ============================================

CREATE TABLE IF NOT EXISTS premeal_checks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    meal_temp_id TEXT,                          -- Temporary meal ID before saving
    meal_id UUID REFERENCES meals(id) ON DELETE SET NULL, -- Link to saved meal (optional)
    input_hash TEXT NOT NULL,                   -- Hash of meal inputs for cache lookup
    result JSONB NOT NULL,                      -- Cached AI result
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unique constraint: one cached result per user per input hash
    UNIQUE(user_id, input_hash)
);

-- Enable Row Level Security
ALTER TABLE premeal_checks ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own premeal checks"
    ON premeal_checks FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own premeal checks"
    ON premeal_checks FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own premeal checks"
    ON premeal_checks FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own premeal checks"
    ON premeal_checks FOR DELETE
    USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX idx_premeal_checks_user_id ON premeal_checks(user_id);
CREATE INDEX idx_premeal_checks_input_hash ON premeal_checks(user_id, input_hash);
CREATE INDEX idx_premeal_checks_created_at ON premeal_checks(created_at DESC);

-- Grant permissions
GRANT ALL ON premeal_checks TO authenticated;

-- Comment
COMMENT ON TABLE premeal_checks IS 'Caches AI-generated Pre Meal Check results to reduce LLM API calls';
