-- Add minimum hold time to risk_parameters
ALTER TABLE public.risk_parameters 
ADD COLUMN IF NOT EXISTS min_hold_time_minutes integer DEFAULT 20;

-- Add comment for documentation
COMMENT ON COLUMN public.risk_parameters.min_hold_time_minutes IS 'Minimum time in minutes before reversal risk, hedging, or early exits can trigger';