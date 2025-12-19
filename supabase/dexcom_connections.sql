-- Dexcom Connections Table
-- Stores OAuth tokens for Dexcom API access
-- Run this migration in Supabase SQL Editor

-- Create the dexcom_connections table
CREATE TABLE IF NOT EXISTS public.dexcom_connections (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    dexcom_env TEXT NOT NULL CHECK (dexcom_env IN ('sandbox', 'prod')),
    dexcom_prod_base TEXT NOT NULL DEFAULT 'https://api.dexcom.com',
    access_token TEXT,
    access_expires_at TIMESTAMPTZ,
    refresh_token_ciphertext TEXT,
    refresh_token_iv TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.dexcom_connections ENABLE ROW LEVEL SECURITY;

-- IMPORTANT: No direct client access to this table
-- All access must go through Edge Functions which use the service role
-- This protects tokens from being exposed to the client

-- Deny all direct SELECT access (use dexcom-status edge function instead)
-- If you need client-side status checking, uncomment the policy below:
-- CREATE POLICY "Users can view their own connection status"
--     ON public.dexcom_connections
--     FOR SELECT
--     USING (auth.uid() = user_id);

-- Deny all direct INSERT/UPDATE/DELETE from clients
-- Edge functions with service role will handle all modifications

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION public.update_dexcom_connection_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_dexcom_connections_updated_at
    BEFORE UPDATE ON public.dexcom_connections
    FOR EACH ROW
    EXECUTE FUNCTION public.update_dexcom_connection_updated_at();

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_dexcom_connections_user_id 
    ON public.dexcom_connections(user_id);

-- Grant permissions for service role (used by Edge Functions)
GRANT ALL ON public.dexcom_connections TO service_role;
GRANT USAGE ON SCHEMA public TO service_role;
