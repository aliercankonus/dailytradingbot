
CREATE TABLE public.oversold_event_study (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  symbol text NOT NULL,
  event_time timestamptz NOT NULL DEFAULT now(),
  price numeric NOT NULL,
  stoch_k numeric,
  adx numeric,
  adx_slope numeric,
  momentum_score numeric,
  regime text,
  primary_trend text,
  gate_name text,
  ret_6h numeric,
  ret_12h numeric,
  ret_24h numeric,
  mae numeric,
  mfe numeric,
  shadow_entry_price numeric,
  shadow_sl numeric,
  shadow_tp numeric,
  shadow_pnl_percent numeric,
  shadow_exit_reason text,
  evaluated boolean DEFAULT false,
  evaluated_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.oversold_event_study ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage oversold events"
  ON public.oversold_event_study FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can view their own oversold events"
  ON public.oversold_event_study FOR SELECT
  USING (auth.uid() = user_id);

CREATE INDEX idx_oversold_event_study_user_symbol ON public.oversold_event_study(user_id, symbol, event_time DESC);
