-- Add min_trend_consistency to risk_parameters table
ALTER TABLE public.risk_parameters
ADD COLUMN min_trend_consistency numeric DEFAULT 50 NOT NULL;

COMMENT ON COLUMN public.risk_parameters.min_trend_consistency IS 'Minimum trend consistency percentage (0-100) required to execute trades';