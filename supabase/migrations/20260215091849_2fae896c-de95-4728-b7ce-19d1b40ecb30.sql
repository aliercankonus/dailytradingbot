
-- Add indexed summary columns to trend_snapshots for queryability
-- These are extracted from snapshot_data JSONB for fast filtering
ALTER TABLE public.trend_snapshots
  ADD COLUMN primary_trend TEXT,
  ADD COLUMN is_aligned BOOLEAN,
  ADD COLUMN momentum_state TEXT,
  ADD COLUMN regime TEXT,
  ADD COLUMN adx NUMERIC,
  ADD COLUMN macd_histogram NUMERIC;

-- Indexes for scanner/backtest queries
CREATE INDEX idx_trend_snapshots_trend ON public.trend_snapshots (primary_trend);
CREATE INDEX idx_trend_snapshots_regime ON public.trend_snapshots (regime);
CREATE INDEX idx_trend_snapshots_momentum ON public.trend_snapshots (momentum_state);
