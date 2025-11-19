-- Add new risk management parameters to risk_parameters table
ALTER TABLE public.risk_parameters 
ADD COLUMN IF NOT EXISTS max_trades_per_symbol integer NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS daily_loss_limit_percent numeric NOT NULL DEFAULT 5.0,
ADD COLUMN IF NOT EXISTS daily_realized_loss numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_loss_reset_date date DEFAULT CURRENT_DATE;

-- Add comment for documentation
COMMENT ON COLUMN public.risk_parameters.max_trades_per_symbol IS 'Maximum number of open positions allowed per symbol (default: 1)';
COMMENT ON COLUMN public.risk_parameters.daily_loss_limit_percent IS 'Circuit breaker: stops all new trades if daily loss exceeds this % of portfolio (default: 5%)';
COMMENT ON COLUMN public.risk_parameters.daily_realized_loss IS 'Tracks total realized losses for the current day';
COMMENT ON COLUMN public.risk_parameters.last_loss_reset_date IS 'Date when daily loss counter was last reset';