-- Add partial loss taking settings to risk_parameters
ALTER TABLE public.risk_parameters 
ADD COLUMN IF NOT EXISTS partial_loss_taking_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS partial_loss_trigger_percent numeric DEFAULT 50.0,
ADD COLUMN IF NOT EXISTS partial_loss_close_percent numeric DEFAULT 50.0;

-- Track partial loss level in positions (similar to partial_tp_level)
ALTER TABLE public.positions 
ADD COLUMN IF NOT EXISTS partial_loss_level integer DEFAULT 0;

ALTER TABLE public.positions_archive 
ADD COLUMN IF NOT EXISTS partial_loss_level integer DEFAULT 0;

COMMENT ON COLUMN public.risk_parameters.partial_loss_taking_enabled IS 'Enable closing part of losing positions early to reduce exposure';
COMMENT ON COLUMN public.risk_parameters.partial_loss_trigger_percent IS 'Trigger partial close when loss reaches X% of stop distance (default 50%)';
COMMENT ON COLUMN public.risk_parameters.partial_loss_close_percent IS 'Close X% of position when trigger hit (default 50%)';