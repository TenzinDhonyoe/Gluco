-- Add blocks column to chat_messages for rich inline cards.
-- Non-breaking: existing rows get NULL, old clients ignore the field.
ALTER TABLE chat_messages
    ADD COLUMN IF NOT EXISTS blocks JSONB DEFAULT NULL;

COMMENT ON COLUMN chat_messages.blocks IS 'Optional array of ChatBlock objects for inline data cards (metric_card, meal_summary, score_ring, streak)';
