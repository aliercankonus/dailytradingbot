-- Add smart risk management columns to risk_parameters
ALTER TABLE public.risk_parameters
ADD COLUMN IF NOT EXISTS dynamic_max_trades_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS kelly_criterion_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS trailing_daily_limit_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS daily_peak_pnl numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS kelly_max_risk_cap numeric DEFAULT 3.0,
ADD COLUMN IF NOT EXISTS min_trades_for_kelly integer DEFAULT 10,
ADD COLUMN IF NOT EXISTS volatility_max_trades_reduction numeric DEFAULT 0.5;

-- Add comment for clarity
COMMENT ON COLUMN public.risk_parameters.dynamic_max_trades_enabled IS 'Adjust max trades based on volatility and performance';
COMMENT ON COLUMN public.risk_parameters.kelly_criterion_enabled IS 'Use Kelly Criterion for optimal position sizing';
COMMENT ON COLUMN public.risk_parameters.trailing_daily_limit_enabled IS 'Lock profits by tightening daily loss limit';
COMMENT ON COLUMN public.risk_parameters.daily_peak_pnl IS 'Peak daily P&L for trailing limit calculation';
COMMENT ON COLUMN public.risk_parameters.kelly_max_risk_cap IS 'Maximum risk % cap for Kelly (prevents over-betting)';
COMMENT ON COLUMN public.risk_parameters.min_trades_for_kelly IS 'Minimum trades needed before Kelly applies';
COMMENT ON COLUMN public.risk_parameters.volatility_max_trades_reduction IS 'Reduce max trades by this factor in high volatility';