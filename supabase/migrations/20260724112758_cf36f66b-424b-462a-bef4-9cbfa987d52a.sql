
-- ============================================================
-- future_state_features: predicted market state from TimesFM
-- ============================================================
CREATE TABLE public.future_state_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  series text NOT NULL,                 -- 'log_oi' | 'funding' | future series
  horizon_hours integer NOT NULL,       -- 6,12,24,48,72
  regime text,                          -- MFS regime at anchor time (nullable)
  anchor_ts bigint NOT NULL,            -- ms epoch of forecast anchor bar
  current_value double precision NOT NULL,
  predicted_value double precision NOT NULL,
  gap_abs double precision NOT NULL,    -- pred - current (native units)
  gap_rel double precision NOT NULL,    -- gap_abs / current_value
  gap_z double precision,               -- gap normalized by rolling std (nullable)
  source_model text NOT NULL DEFAULT 'timesfm-2.5',
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT future_state_features_unique_anchor UNIQUE (user_id, symbol, series, horizon_hours, anchor_ts)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.future_state_features TO authenticated;
GRANT ALL ON public.future_state_features TO service_role;

ALTER TABLE public.future_state_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own future state features"
  ON public.future_state_features FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users write own future state features"
  ON public.future_state_features FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own future state features"
  ON public.future_state_features FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own future state features"
  ON public.future_state_features FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access future state features"
  ON public.future_state_features FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_fsf_lookup
  ON public.future_state_features (user_id, symbol, horizon_hours, anchor_ts DESC);

CREATE INDEX idx_fsf_regime
  ON public.future_state_features (user_id, symbol, regime, horizon_hours);

-- ============================================================
-- future_state_shadow_log: what sizing multiplier WOULD have been applied
-- (30-day validation window before real integration)
-- ============================================================
CREATE TABLE public.future_state_shadow_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  direction text NOT NULL,              -- 'LONG' | 'SHORT'
  regime text,
  strategy_name text,
  feature_id uuid REFERENCES public.future_state_features(id) ON DELETE SET NULL,
  horizon_hours integer NOT NULL,
  gap_rel double precision NOT NULL,
  suggested_multiplier double precision NOT NULL,
  applied boolean NOT NULL DEFAULT false,  -- false = shadow only
  reason text,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.future_state_shadow_log TO authenticated;
GRANT ALL ON public.future_state_shadow_log TO service_role;

ALTER TABLE public.future_state_shadow_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own future state shadow log"
  ON public.future_state_shadow_log FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own future state shadow log"
  ON public.future_state_shadow_log FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access future state shadow log"
  ON public.future_state_shadow_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_fssl_recent
  ON public.future_state_shadow_log (user_id, symbol, created_at DESC);
