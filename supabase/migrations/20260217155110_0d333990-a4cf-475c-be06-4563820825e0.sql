
-- Drop duplicate indexes on signal_rejection_log
DROP INDEX IF EXISTS idx_signal_rejection_symbol;
DROP INDEX IF EXISTS idx_signal_rejection_user_time;

-- Drop duplicate constraint on user_api_keys (it's a constraint, not bare index)
ALTER TABLE public.user_api_keys DROP CONSTRAINT IF EXISTS user_api_keys_user_id_key;

-- Add missing composite indexes for RLS-filtered tables
CREATE INDEX IF NOT EXISTS idx_market_regime_user_symbol_time 
  ON public.market_regime_history (user_id, symbol, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_momentum_analysis_user_symbol_time 
  ON public.momentum_analysis (user_id, symbol, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_trading_signals_user_status_created 
  ON public.trading_signals (user_id, status, created_at DESC);
