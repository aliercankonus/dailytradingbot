-- Add trailing stop loss configuration to risk_parameters table
ALTER TABLE public.risk_parameters 
ADD COLUMN IF NOT EXISTS trailing_stop_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS trailing_stop_activation_percent numeric DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS trailing_stop_distance_multiplier numeric DEFAULT 1.5;

COMMENT ON COLUMN public.risk_parameters.trailing_stop_enabled IS 'Enable/disable trailing stop loss feature';
COMMENT ON COLUMN public.risk_parameters.trailing_stop_activation_percent IS 'P&L percentage threshold to activate trailing stop (default 1%)';
COMMENT ON COLUMN public.risk_parameters.trailing_stop_distance_multiplier IS 'Multiplier for ATR distance (default 1.5x ATR)';