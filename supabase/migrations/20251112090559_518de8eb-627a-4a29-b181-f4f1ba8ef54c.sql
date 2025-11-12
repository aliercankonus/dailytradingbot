-- Add paper trading mode to risk_parameters
ALTER TABLE public.risk_parameters 
ADD COLUMN IF NOT EXISTS paper_trading_mode boolean DEFAULT true;

-- Create notifications table to track sent notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  trade_id uuid REFERENCES public.trades(id),
  message text NOT NULL,
  sent_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Create policy for reading notifications
CREATE POLICY "Allow public read access to notifications"
  ON public.notifications
  FOR SELECT
  USING (true);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_notifications_trade_id ON public.notifications(trade_id);
CREATE INDEX IF NOT EXISTS idx_notifications_sent_at ON public.notifications(sent_at DESC);