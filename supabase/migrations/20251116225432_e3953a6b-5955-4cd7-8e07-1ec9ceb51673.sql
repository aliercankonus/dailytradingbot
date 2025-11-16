-- Add staggered entry timing fields
ALTER TABLE public.trading_signals 
ADD COLUMN scheduled_for timestamp with time zone DEFAULT now();

ALTER TABLE public.risk_parameters 
ADD COLUMN entry_stagger_minutes integer NOT NULL DEFAULT 10;

COMMENT ON COLUMN public.trading_signals.scheduled_for IS 'Time when this signal should be executed (for staggered entry)';
COMMENT ON COLUMN public.risk_parameters.entry_stagger_minutes IS 'Time window in minutes to stagger trade entries (0 = immediate, 10 = spread over 10 min)';