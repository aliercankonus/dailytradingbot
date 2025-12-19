-- Add early profit lock and time-based stop tightening settings to risk_parameters
ALTER TABLE public.risk_parameters 
ADD COLUMN IF NOT EXISTS early_profit_lock_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS early_profit_lock_threshold NUMERIC DEFAULT 0.3,
ADD COLUMN IF NOT EXISTS momentum_exit_guard_enabled BOOLEAN DEFAULT true;