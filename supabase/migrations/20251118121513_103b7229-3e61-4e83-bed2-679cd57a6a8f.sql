-- Create table to track signal rejection reasons
CREATE TABLE IF NOT EXISTS public.signal_rejection_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rejection_reason TEXT NOT NULL,
  filters_status JSONB,
  trend_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.signal_rejection_log ENABLE ROW LEVEL SECURITY;

-- Create policy for users to view their own rejection logs
CREATE POLICY "Users can view their own rejection logs"
  ON public.signal_rejection_log
  FOR SELECT
  USING (auth.uid() = user_id);

-- Create policy for service role to insert rejection logs
CREATE POLICY "Service role can insert rejection logs"
  ON public.signal_rejection_log
  FOR INSERT
  WITH CHECK (true);

-- Create index for efficient querying
CREATE INDEX idx_signal_rejection_user_time ON public.signal_rejection_log(user_id, checked_at DESC);
CREATE INDEX idx_signal_rejection_symbol ON public.signal_rejection_log(symbol, checked_at DESC);