-- Remove entry_stagger_minutes from risk_parameters table
ALTER TABLE public.risk_parameters DROP COLUMN IF EXISTS entry_stagger_minutes;

-- Remove scheduled_for from trading_signals table
ALTER TABLE public.trading_signals DROP COLUMN IF EXISTS scheduled_for;