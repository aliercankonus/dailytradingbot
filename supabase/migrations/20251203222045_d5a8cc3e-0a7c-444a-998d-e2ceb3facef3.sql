-- Add loss recovery mode settings to risk_parameters
ALTER TABLE public.risk_parameters
ADD COLUMN IF NOT EXISTS loss_recovery_mode_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS loss_recovery_position_size_percent numeric DEFAULT 50,
ADD COLUMN IF NOT EXISTS loss_recovery_confidence_boost numeric DEFAULT 10;