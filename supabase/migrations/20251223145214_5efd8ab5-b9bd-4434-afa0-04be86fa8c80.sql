-- Phase 6: Loss-Clustering Protection columns for risk_parameters
ALTER TABLE public.risk_parameters 
ADD COLUMN IF NOT EXISTS last_trade_quality INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS median_trade_quality NUMERIC DEFAULT 55,
ADD COLUMN IF NOT EXISTS low_quality_cooldown_until TIMESTAMPTZ DEFAULT NULL;

-- Add comment explaining these columns
COMMENT ON COLUMN public.risk_parameters.last_trade_quality IS 'Quality score of the last closed trade (0-100)';
COMMENT ON COLUMN public.risk_parameters.median_trade_quality IS 'Rolling median quality score across recent trades (default 55)';
COMMENT ON COLUMN public.risk_parameters.low_quality_cooldown_until IS 'Timestamp until which new entries are blocked after a low-quality loss';