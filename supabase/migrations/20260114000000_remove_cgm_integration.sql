-- Remove CGM/Dexcom integration artifacts

-- Drop Dexcom tables if they exist
DROP TABLE IF EXISTS public.dexcom_connections;
DROP TABLE IF EXISTS public.dexcom_tokens;

-- Remove CGM-related profile columns if present
ALTER TABLE public.profiles DROP COLUMN IF EXISTS cgm_device;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS has_cgm;

-- Remove any CGM-related columns from glucose logs if present
ALTER TABLE public.glucose_logs DROP COLUMN IF EXISTS source;
ALTER TABLE public.glucose_logs DROP COLUMN IF EXISTS device;
ALTER TABLE public.glucose_logs DROP COLUMN IF EXISTS source_id;
ALTER TABLE public.glucose_logs DROP COLUMN IF EXISTS external_id;
