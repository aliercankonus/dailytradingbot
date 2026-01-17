-- Add unified risk settings columns to risk_parameters table
ALTER TABLE public.risk_parameters
ADD COLUMN IF NOT EXISTS base_position_size_percent NUMERIC DEFAULT 1.5,
ADD COLUMN IF NOT EXISTS base_stop_loss_percent NUMERIC DEFAULT 2.0,
ADD COLUMN IF NOT EXISTS base_take_profit_multiplier NUMERIC DEFAULT 2.5,
ADD COLUMN IF NOT EXISTS risk_profile TEXT DEFAULT 'balanced',
ADD COLUMN IF NOT EXISTS enable_atr_based_stops BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS enable_adx_position_scaling BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS enable_quality_based_sizing BOOLEAN DEFAULT true;

-- Add comment for documentation
COMMENT ON COLUMN public.risk_parameters.risk_profile IS 'User risk preference: conservative, balanced, or aggressive';
COMMENT ON COLUMN public.risk_parameters.base_position_size_percent IS 'Base position size as percentage of portfolio';
COMMENT ON COLUMN public.risk_parameters.base_stop_loss_percent IS 'Base stop loss distance as percentage from entry';
COMMENT ON COLUMN public.risk_parameters.base_take_profit_multiplier IS 'Take profit = stop loss × this multiplier';