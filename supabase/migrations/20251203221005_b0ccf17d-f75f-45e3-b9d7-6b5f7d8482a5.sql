-- Add loss management settings to risk_parameters table

-- Drawdown Circuit Breaker: Pause trading when portfolio drops X% from peak
ALTER TABLE public.risk_parameters 
ADD COLUMN IF NOT EXISTS drawdown_circuit_breaker_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS drawdown_circuit_breaker_percent numeric DEFAULT 10.0,
ADD COLUMN IF NOT EXISTS portfolio_peak_value numeric DEFAULT 10000,
ADD COLUMN IF NOT EXISTS circuit_breaker_triggered boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS circuit_breaker_triggered_at timestamp with time zone;

-- Time-Based Stops: Exit positions stagnant for X hours
ALTER TABLE public.risk_parameters 
ADD COLUMN IF NOT EXISTS time_based_stop_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS time_based_stop_hours numeric DEFAULT 4.0;

-- Dynamic Stop Tightening: Tighten stops on aging losing positions
ALTER TABLE public.risk_parameters 
ADD COLUMN IF NOT EXISTS dynamic_stop_tightening_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS dynamic_stop_tightening_hours numeric DEFAULT 2.0,
ADD COLUMN IF NOT EXISTS dynamic_stop_tightening_percent numeric DEFAULT 25.0;

-- Comment on what each does
COMMENT ON COLUMN public.risk_parameters.drawdown_circuit_breaker_enabled IS 'Pause trading when portfolio drops below peak by threshold percent';
COMMENT ON COLUMN public.risk_parameters.drawdown_circuit_breaker_percent IS 'Percent drop from peak to trigger circuit breaker (default 10%)';
COMMENT ON COLUMN public.risk_parameters.portfolio_peak_value IS 'Highest recorded portfolio value for drawdown calculation';
COMMENT ON COLUMN public.risk_parameters.circuit_breaker_triggered IS 'Whether circuit breaker is currently active';
COMMENT ON COLUMN public.risk_parameters.time_based_stop_enabled IS 'Exit stagnant positions after X hours';
COMMENT ON COLUMN public.risk_parameters.time_based_stop_hours IS 'Hours of no significant movement before exit (default 4)';
COMMENT ON COLUMN public.risk_parameters.dynamic_stop_tightening_enabled IS 'Tighten stops on aging losing positions';
COMMENT ON COLUMN public.risk_parameters.dynamic_stop_tightening_hours IS 'Hours before tightening starts on losing positions (default 2)';
COMMENT ON COLUMN public.risk_parameters.dynamic_stop_tightening_percent IS 'Percent to tighten stop loss per hour after threshold (default 25%)';