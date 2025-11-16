-- Add minimum confidence threshold to risk_parameters
ALTER TABLE public.risk_parameters 
ADD COLUMN min_confidence_threshold numeric NOT NULL DEFAULT 60;

COMMENT ON COLUMN public.risk_parameters.min_confidence_threshold IS 'Minimum confidence score (0-100) required for trade execution';