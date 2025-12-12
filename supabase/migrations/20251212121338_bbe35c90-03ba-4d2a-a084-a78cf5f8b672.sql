-- Add global AI analysis toggle to risk_parameters
ALTER TABLE public.risk_parameters
ADD COLUMN IF NOT EXISTS ai_analysis_enabled boolean DEFAULT true;