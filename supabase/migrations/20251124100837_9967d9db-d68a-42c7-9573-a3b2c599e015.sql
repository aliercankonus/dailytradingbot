-- Add divergence opportunity settings to risk_parameters table
ALTER TABLE public.risk_parameters
ADD COLUMN IF NOT EXISTS enable_pullback_signals boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS enable_early_reversal_signals boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS pullback_position_size_percent numeric DEFAULT 50,
ADD COLUMN IF NOT EXISTS early_reversal_position_size_percent numeric DEFAULT 40;

COMMENT ON COLUMN public.risk_parameters.enable_pullback_signals IS 'Enable trading on pullback signals when 4h is strong but 1h temporarily opposes';
COMMENT ON COLUMN public.risk_parameters.enable_early_reversal_signals IS 'Enable trading on early reversal signals when 1h strongly reverses before 4h confirms';
COMMENT ON COLUMN public.risk_parameters.pullback_position_size_percent IS 'Position size percentage for pullback signals (0-100)';
COMMENT ON COLUMN public.risk_parameters.early_reversal_position_size_percent IS 'Position size percentage for early reversal signals (0-100)';