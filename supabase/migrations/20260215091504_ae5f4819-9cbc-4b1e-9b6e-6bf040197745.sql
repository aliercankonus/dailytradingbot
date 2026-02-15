
-- Create trend_snapshots table to cache calculate-trend output
-- Written by strategy-analyzer every 5-min cycle, read by frontend (no Binance dependency)
CREATE TABLE public.trend_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  snapshot_data JSONB NOT NULL,  -- Full calculate-trend response
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Unique constraint: one snapshot per user+symbol (upsert pattern)
CREATE UNIQUE INDEX idx_trend_snapshots_user_symbol ON public.trend_snapshots (user_id, symbol);

-- Index for fast queries
CREATE INDEX idx_trend_snapshots_recorded_at ON public.trend_snapshots (recorded_at);

-- Enable RLS
ALTER TABLE public.trend_snapshots ENABLE ROW LEVEL SECURITY;

-- Users can read their own snapshots
CREATE POLICY "Users can view their own trend snapshots"
ON public.trend_snapshots FOR SELECT
USING (auth.uid() = user_id);

-- Service role writes (from edge functions)
CREATE POLICY "Service role can manage trend snapshots"
ON public.trend_snapshots FOR ALL
USING (true)
WITH CHECK (true);
