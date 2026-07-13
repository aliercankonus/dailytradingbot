
CREATE TABLE public.agent_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_days integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  model text,
  kpis jsonb DEFAULT '{}'::jsonb,
  systemic_errors jsonb DEFAULT '[]'::jsonb,
  strategy_verdict jsonb DEFAULT '[]'::jsonb,
  proposed_actions jsonb DEFAULT '[]'::jsonb,
  executive_summary text,
  raw_input_stats jsonb DEFAULT '{}'::jsonb,
  error_message text,
  tokens_used integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_reports TO authenticated;
GRANT ALL ON public.agent_reports TO service_role;

ALTER TABLE public.agent_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own agent reports"
  ON public.agent_reports FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX agent_reports_user_created_idx
  ON public.agent_reports (user_id, created_at DESC);
