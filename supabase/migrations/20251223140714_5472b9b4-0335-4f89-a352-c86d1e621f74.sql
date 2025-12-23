-- Scenario 6: Recovery Mode Improvements
-- Add columns for recovery mode state tracking and exit logic

-- Add consecutive_wins to track winning streak (for recovery exit logic - Finding 1)
ALTER TABLE public.risk_parameters 
ADD COLUMN IF NOT EXISTS consecutive_wins integer DEFAULT 0;

-- Add recovery_exit_drawdown_percent threshold for recovery exit (Finding 1)
ALTER TABLE public.risk_parameters 
ADD COLUMN IF NOT EXISTS recovery_exit_drawdown_percent numeric DEFAULT 2.0;

-- Add recovery_cooldown_until for cooldown after recovery loss (Finding 8)
ALTER TABLE public.risk_parameters 
ADD COLUMN IF NOT EXISTS recovery_cooldown_until timestamp with time zone DEFAULT NULL;

-- Add max_recovery_trades_per_day limit (Finding 10)
ALTER TABLE public.risk_parameters 
ADD COLUMN IF NOT EXISTS max_recovery_trades_per_day integer DEFAULT 3;

-- Add recovery_trades_today counter (Finding 10)
ALTER TABLE public.risk_parameters 
ADD COLUMN IF NOT EXISTS recovery_trades_today integer DEFAULT 0;

-- Add last_recovery_trade_loss flag to track if last recovery trade was a loss (Finding 8)
ALTER TABLE public.risk_parameters 
ADD COLUMN IF NOT EXISTS last_recovery_trade_loss boolean DEFAULT false;