-- Add NOT NULL constraints to user_id columns on critical tables
-- This strengthens RLS policies by ensuring auth.uid() = user_id comparisons work correctly

ALTER TABLE public.positions 
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.trading_signals 
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.custom_strategies 
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.notifications 
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.backtesting_results 
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.strategy_performance 
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.strategy_rotation_history 
  ALTER COLUMN user_id SET NOT NULL;