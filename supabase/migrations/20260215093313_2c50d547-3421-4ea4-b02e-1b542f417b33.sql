ALTER TABLE public.trend_snapshots ADD COLUMN block_reason TEXT;
CREATE INDEX idx_trend_snapshots_block_reason ON public.trend_snapshots (block_reason);