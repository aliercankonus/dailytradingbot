-- Add profit lock percentage column to risk_parameters
ALTER TABLE public.risk_parameters
ADD COLUMN IF NOT EXISTS trailing_stop_profit_lock_percent numeric DEFAULT 50;

-- Add comment for documentation
COMMENT ON COLUMN public.risk_parameters.trailing_stop_profit_lock_percent IS 'Percentage of profit to lock in when trailing stop activates (e.g., 50 = lock 50% of profit)';