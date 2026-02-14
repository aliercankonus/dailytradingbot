ALTER TABLE public.risk_parameters 
ADD COLUMN IF NOT EXISTS compression_module_enabled boolean DEFAULT true;