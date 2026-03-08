
CREATE TABLE public.kline_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  interval text NOT NULL DEFAULT '1h',
  candles jsonb NOT NULL DEFAULT '[]'::jsonb,
  candle_count integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'rest',
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(symbol, interval)
);

-- RLS
ALTER TABLE public.kline_cache ENABLE ROW LEVEL SECURITY;

-- Service role can manage (cron functions write here)
CREATE POLICY "Service role can manage kline cache"
  ON public.kline_cache FOR ALL
  USING (true)
  WITH CHECK (true);

-- Anyone can read (auto-trader reads with service role anyway)
CREATE POLICY "Anyone can read kline cache"
  ON public.kline_cache FOR SELECT
  USING (true);

-- Index for fast lookups
CREATE INDEX idx_kline_cache_symbol_interval ON public.kline_cache(symbol, interval);
CREATE INDEX idx_kline_cache_updated_at ON public.kline_cache(updated_at);
