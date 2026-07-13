
ALTER TABLE public.signal_rejection_log
  ADD COLUMN IF NOT EXISTS gate_family text;

CREATE OR REPLACE FUNCTION public.classify_gate_family(p_reason text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $fn$
  SELECT CASE
    WHEN p_reason IS NULL THEN 'OTHER'
    WHEN p_reason ILIKE 'ANALYZER_ERROR%' THEN 'ERROR'
    WHEN p_reason ILIKE 'EXECUTION%' THEN 'EXECUTION'
    WHEN p_reason ILIKE '%QUALITY%' THEN 'QUALITY'
    WHEN p_reason ILIKE 'NO_DIRECTION%' OR p_reason ILIKE '%DIRECTION%' THEN 'DIRECTION'
    WHEN p_reason ILIKE '%ADX%' OR p_reason ILIKE '%NO_ENERGY%' OR p_reason ILIKE '%DECAY%' THEN 'ADX'
    WHEN p_reason ILIKE '%STOCH%' OR p_reason ILIKE '%OVERBOUGHT%' OR p_reason ILIKE '%OVERSOLD%' OR p_reason ILIKE '%EXTREME%' THEN 'STOCH'
    WHEN p_reason ILIKE '%MOMENTUM%' THEN 'MOMENTUM'
    WHEN p_reason ILIKE '%RANGE_COMPRESSION%' OR p_reason ILIKE '%EXPANSION%' OR p_reason ILIKE '%EXHAUSTION%' OR p_reason ILIKE '%REGIME%' THEN 'REGIME'
    WHEN p_reason ILIKE '%PORTFOLIO%' OR p_reason ILIKE '%DAILY_LIMIT%' OR p_reason ILIKE '%POSITION_LIMIT%' OR p_reason ILIKE '%CORRELATION%' OR p_reason ILIKE '%DAILY_LOSS%' THEN 'PORTFOLIO'
    WHEN p_reason ILIKE 'SQUEEZE%' OR p_reason ILIKE 'STRONG_TREND%' OR p_reason ILIKE 'TC\_%' OR p_reason ILIKE 'BTC\_%' OR p_reason ILIKE 'ST\_%' OR p_reason ILIKE 'MR\_%' THEN 'STRATEGY'
    ELSE 'OTHER'
  END
$fn$;

REVOKE ALL ON FUNCTION public.classify_gate_family(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.classify_gate_family(text) TO authenticated, service_role;

UPDATE public.signal_rejection_log
SET gate_family = public.classify_gate_family(rejection_reason)
WHERE gate_family IS NULL;

CREATE INDEX IF NOT EXISTS idx_srl_user_family_checked
  ON public.signal_rejection_log (user_id, gate_family, checked_at DESC);
