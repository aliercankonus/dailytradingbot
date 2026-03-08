CREATE TABLE public.backtest_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'running',
  config JSONB NOT NULL,
  summary JSONB,
  trades JSONB DEFAULT '[]'::jsonb,
  equity_curve JSONB DEFAULT '[]'::jsonb,
  gate_stats JSONB DEFAULT '{}'::jsonb,
  signals_log JSONB DEFAULT '[]'::jsonb,
  duration_ms INTEGER,
  error_message TEXT
);

ALTER TABLE public.backtest_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own backtests"
  ON public.backtest_results FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);