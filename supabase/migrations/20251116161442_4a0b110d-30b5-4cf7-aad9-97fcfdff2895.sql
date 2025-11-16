-- Add rebalancing configuration to risk_parameters table
ALTER TABLE public.risk_parameters 
ADD COLUMN IF NOT EXISTS auto_rebalance_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS rebalance_loss_threshold_percent numeric DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS max_positions_to_close_per_cycle integer DEFAULT 3;