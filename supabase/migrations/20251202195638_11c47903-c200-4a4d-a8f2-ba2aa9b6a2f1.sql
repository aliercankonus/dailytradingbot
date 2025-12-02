-- Add break-even stop settings to risk_parameters
ALTER TABLE public.risk_parameters
ADD COLUMN IF NOT EXISTS break_even_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS break_even_activation_percent numeric DEFAULT 0.5;