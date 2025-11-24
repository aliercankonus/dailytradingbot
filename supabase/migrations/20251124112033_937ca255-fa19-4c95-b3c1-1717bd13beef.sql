-- Add take profit multiplier fields to risk_parameters
ALTER TABLE public.risk_parameters 
ADD COLUMN IF NOT EXISTS standard_tp_multiplier numeric DEFAULT 2.5,
ADD COLUMN IF NOT EXISTS divergence_tp_multiplier numeric DEFAULT 2.0;