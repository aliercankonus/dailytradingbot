-- Add divergence_sl_multiplier to risk_parameters table
ALTER TABLE risk_parameters
ADD COLUMN divergence_sl_multiplier numeric DEFAULT 0.67;