
CREATE TABLE public.coach_action_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  report_id uuid,
  action_index integer,
  action_type text,
  target text NOT NULL,
  column_name text,
  previous_value text,
  new_value text,
  status text NOT NULL DEFAULT 'success',
  error_message text,
  rationale text,
  source text NOT NULL DEFAULT 'coach_ui',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.coach_action_audit TO authenticated;
GRANT ALL ON public.coach_action_audit TO service_role;

ALTER TABLE public.coach_action_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own coach audit"
  ON public.coach_action_audit FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own coach audit"
  ON public.coach_action_audit FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_coach_action_audit_user_created
  ON public.coach_action_audit (user_id, created_at DESC);

CREATE INDEX idx_coach_action_audit_report
  ON public.coach_action_audit (report_id);
