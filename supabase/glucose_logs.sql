-- Glucose Logs Table
-- Run this SQL in your Supabase SQL Editor

-- Create glucose_logs table
CREATE TABLE IF NOT EXISTS public.glucose_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    glucose_level DECIMAL(5,2) NOT NULL,
    unit TEXT DEFAULT 'mmol/L' NOT NULL,
    logged_at TIMESTAMP WITH TIME ZONE NOT NULL,
    context TEXT CHECK (context IN ('pre_meal', 'post_meal', 'random', 'fasting', 'bedtime')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.glucose_logs ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to view their own glucose logs
CREATE POLICY "Users can view own glucose logs" ON public.glucose_logs
    FOR SELECT
    USING (auth.uid() = user_id);

-- Create policy to allow users to insert their own glucose logs
CREATE POLICY "Users can insert own glucose logs" ON public.glucose_logs
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Create policy to allow users to update their own glucose logs
CREATE POLICY "Users can update own glucose logs" ON public.glucose_logs
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Create policy to allow users to delete their own glucose logs
CREATE POLICY "Users can delete own glucose logs" ON public.glucose_logs
    FOR DELETE
    USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS glucose_logs_user_id_idx ON public.glucose_logs(user_id);
CREATE INDEX IF NOT EXISTS glucose_logs_logged_at_idx ON public.glucose_logs(logged_at DESC);

-- Grant necessary permissions
GRANT ALL ON public.glucose_logs TO authenticated;
GRANT SELECT ON public.glucose_logs TO anon;
