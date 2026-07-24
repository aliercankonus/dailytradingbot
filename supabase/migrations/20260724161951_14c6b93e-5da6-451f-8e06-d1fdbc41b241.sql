
CREATE TABLE public.future_state_accuracy (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  symbol text NOT NULL,
  series text NOT NULL,
  horizon_hours integer NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  n_samples integer NOT NULL,
  mape double precision,
  dir_hit_rate double precision,
  rank_ic double precision,
  mean_predicted_gap_rel double precision,
  mean_realized_gap_rel double precision,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.future_state_accuracy TO authenticated;
GRANT ALL ON public.future_state_accuracy TO service_role;

ALTER TABLE public.future_state_accuracy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own future state accuracy"
  ON public.future_state_accuracy FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users write own future state accuracy"
  ON public.future_state_accuracy FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own future state accuracy"
  ON public.future_state_accuracy FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own future state accuracy"
  ON public.future_state_accuracy FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_fsa_lookup
  ON public.future_state_accuracy (user_id, symbol, horizon_hours, computed_at DESC);
