-- Add hedging support to positions table
ALTER TABLE public.positions
ADD COLUMN IF NOT EXISTS hedge_position_id uuid REFERENCES public.positions(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS is_hedge boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS parent_position_id uuid REFERENCES public.positions(id) ON DELETE SET NULL;

-- Add hedging settings to risk_parameters table
ALTER TABLE public.risk_parameters
ADD COLUMN IF NOT EXISTS hedging_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS hedge_reversal_risk_min numeric DEFAULT 50,
ADD COLUMN IF NOT EXISTS hedge_reversal_risk_max numeric DEFAULT 70,
ADD COLUMN IF NOT EXISTS hedge_position_size_percent numeric DEFAULT 50;

-- Add comment for documentation
COMMENT ON COLUMN public.positions.hedge_position_id IS 'Links original position to its hedge position';
COMMENT ON COLUMN public.positions.is_hedge IS 'True if this position was opened as a hedge';
COMMENT ON COLUMN public.positions.parent_position_id IS 'Links hedge position back to its parent';
COMMENT ON COLUMN public.risk_parameters.hedging_enabled IS 'Enable partial hedging on reversal risk 50-70%';
COMMENT ON COLUMN public.risk_parameters.hedge_reversal_risk_min IS 'Minimum reversal risk to trigger hedge (default 50%)';
COMMENT ON COLUMN public.risk_parameters.hedge_reversal_risk_max IS 'Maximum reversal risk to trigger hedge (above this, close instead)';
COMMENT ON COLUMN public.risk_parameters.hedge_position_size_percent IS 'Hedge position size as percentage of original position (default 50%)';