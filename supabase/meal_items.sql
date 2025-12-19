-- Meal Items table for storing individual food items in meals
-- Run this in Supabase SQL Editor AFTER meals.sql

CREATE TABLE IF NOT EXISTS public.meal_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meal_id UUID NOT NULL REFERENCES public.meals(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('fdc', 'off')),
    external_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    brand TEXT,
    quantity NUMERIC NOT NULL DEFAULT 1,
    unit TEXT NOT NULL DEFAULT 'serving',
    serving_size NUMERIC,
    serving_unit TEXT,
    -- Nutrient snapshot stored as JSONB for historical accuracy
    -- Structure: { calories_kcal, carbs_g, protein_g, fat_g, fibre_g, sugar_g, sodium_mg, per_100g? }
    nutrients JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.meal_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own meal items
CREATE POLICY "Users can view own meal_items"
    ON public.meal_items FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own meal_items"
    ON public.meal_items FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own meal_items"
    ON public.meal_items FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own meal_items"
    ON public.meal_items FOR DELETE
    USING (auth.uid() = user_id);

-- Index for efficient queries by user and meal
CREATE INDEX IF NOT EXISTS idx_meal_items_user_meal 
    ON public.meal_items(user_id, meal_id);
