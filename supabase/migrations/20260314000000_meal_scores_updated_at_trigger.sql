-- Add missing updated_at trigger to meal_scores table
CREATE OR REPLACE FUNCTION public.update_meal_scores_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS meal_scores_updated_at ON public.meal_scores;
CREATE TRIGGER meal_scores_updated_at
    BEFORE UPDATE ON public.meal_scores
    FOR EACH ROW
    EXECUTE FUNCTION public.update_meal_scores_updated_at();
