-- Migration: Create meal-photos bucket and RLS policies
-- Created: 2025-01-07

-- 1. Ensure the bucket exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('meal-photos', 'meal-photos', false)
ON CONFLICT (id) DO NOTHING;



-- 3. Create RLS Policies

-- Policy: Users can upload their own meal photos
-- Path structure: {user_id}/{filename}
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'objects' 
        AND schemaname = 'storage' 
        AND policyname = 'Users can upload their own meal photos'
    ) THEN
        CREATE POLICY "Users can upload their own meal photos"
        ON storage.objects FOR INSERT
        TO authenticated
        WITH CHECK (
            bucket_id = 'meal-photos' AND
            (storage.foldername(name))[1] = auth.uid()::text
        );
    END IF;
END $$;

-- Policy: Users can view their own meal photos
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'objects' 
        AND schemaname = 'storage' 
        AND policyname = 'Users can view their own meal photos'
    ) THEN
        CREATE POLICY "Users can view their own meal photos"
        ON storage.objects FOR SELECT
        TO authenticated
        USING (
            bucket_id = 'meal-photos' AND
            (storage.foldername(name))[1] = auth.uid()::text
        );
    END IF;
END $$;

-- Policy: Users can update their own meal photos
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'objects' 
        AND schemaname = 'storage' 
        AND policyname = 'Users can update their own meal photos'
    ) THEN
        CREATE POLICY "Users can update their own meal photos"
        ON storage.objects FOR UPDATE
        TO authenticated
        USING (
            bucket_id = 'meal-photos' AND
            (storage.foldername(name))[1] = auth.uid()::text
        )
        WITH CHECK (
            bucket_id = 'meal-photos' AND
            (storage.foldername(name))[1] = auth.uid()::text
        );
    END IF;
END $$;

-- Policy: Users can delete their own meal photos
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'objects' 
        AND schemaname = 'storage' 
        AND policyname = 'Users can delete their own meal photos'
    ) THEN
        CREATE POLICY "Users can delete their own meal photos"
        ON storage.objects FOR DELETE
        TO authenticated
        USING (
            bucket_id = 'meal-photos' AND
            (storage.foldername(name))[1] = auth.uid()::text
        );
    END IF;
END $$;
