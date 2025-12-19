-- Activity Logs Table
-- Run this SQL in your Supabase SQL Editor

-- Create activity_logs table
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    activity_name TEXT NOT NULL,
    logged_at TIMESTAMP WITH TIME ZONE NOT NULL,
    duration_minutes INTEGER NOT NULL,
    intensity TEXT CHECK (intensity IN ('light', 'moderate', 'intense')) NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to view their own activity logs
CREATE POLICY "Users can view own activity logs" ON public.activity_logs
    FOR SELECT
    USING (auth.uid() = user_id);

-- Create policy to allow users to insert their own activity logs
CREATE POLICY "Users can insert own activity logs" ON public.activity_logs
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Create policy to allow users to update their own activity logs
CREATE POLICY "Users can update own activity logs" ON public.activity_logs
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Create policy to allow users to delete their own activity logs
CREATE POLICY "Users can delete own activity logs" ON public.activity_logs
    FOR DELETE
    USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS activity_logs_user_id_idx ON public.activity_logs(user_id);
CREATE INDEX IF NOT EXISTS activity_logs_logged_at_idx ON public.activity_logs(logged_at DESC);

-- Grant necessary permissions
GRANT ALL ON public.activity_logs TO authenticated;
GRANT SELECT ON public.activity_logs TO anon;
