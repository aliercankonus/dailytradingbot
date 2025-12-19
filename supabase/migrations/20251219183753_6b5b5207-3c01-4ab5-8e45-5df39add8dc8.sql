-- Add peak_reached_at to positions table for tracking stale peaks
ALTER TABLE public.positions 
ADD COLUMN IF NOT EXISTS peak_reached_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Add trailing_aggressiveness to risk_parameters (1-5 scale, default 3)
ALTER TABLE public.risk_parameters 
ADD COLUMN IF NOT EXISTS trailing_aggressiveness INTEGER DEFAULT 3;

-- Add smart AITS settings to risk_parameters
ALTER TABLE public.risk_parameters 
ADD COLUMN IF NOT EXISTS progressive_lock_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS stale_peak_protection_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS decay_velocity_exit_enabled BOOLEAN DEFAULT true;

-- Update existing positions to have peak_reached_at set to opened_at
UPDATE public.positions 
SET peak_reached_at = COALESCE(opened_at, now()) 
WHERE peak_reached_at IS NULL AND status = 'active';