-- Delete rows with NULL user_id (these are orphaned records)
DELETE FROM public.risk_parameters WHERE user_id IS NULL;

-- Delete duplicate rows, keeping only the most recent one per user
DELETE FROM public.risk_parameters a
USING public.risk_parameters b
WHERE a.id < b.id 
  AND a.user_id = b.user_id;

-- Make user_id NOT NULL since RLS depends on it
ALTER TABLE public.risk_parameters 
ALTER COLUMN user_id SET NOT NULL;

-- Add unique constraint to prevent duplicates
ALTER TABLE public.risk_parameters 
ADD CONSTRAINT risk_parameters_user_id_unique UNIQUE (user_id);