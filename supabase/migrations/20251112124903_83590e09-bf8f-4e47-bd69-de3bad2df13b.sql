-- Make strategy_id nullable to support backtesting built-in strategies
ALTER TABLE public.backtesting_results 
ALTER COLUMN strategy_id DROP NOT NULL;