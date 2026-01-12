-- Add AI consent fields to profiles
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS ai_consent_at TIMESTAMPTZ;
