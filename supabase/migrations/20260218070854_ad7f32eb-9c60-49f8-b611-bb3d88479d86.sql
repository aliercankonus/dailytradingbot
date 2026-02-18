
-- Function execution metrics table for observability
CREATE TABLE public.function_metrics (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  function_name text NOT NULL,
  user_id uuid,
  duration_ms integer NOT NULL,
  phase_timings jsonb,
  success boolean NOT NULL DEFAULT true,
  error_message text,
  symbols_count integer,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.function_metrics ENABLE ROW LEVEL SECURITY;

-- Service role can insert metrics
CREATE POLICY "Service role can insert function metrics"
ON public.function_metrics FOR INSERT
WITH CHECK (true);

-- Service role can delete old metrics  
CREATE POLICY "Service role can delete old function metrics"
ON public.function_metrics FOR DELETE
USING (true);

-- Users can view their own metrics
CREATE POLICY "Users can view their own function metrics"
ON public.function_metrics FOR SELECT
USING (auth.uid() = user_id);

-- Index for efficient querying
CREATE INDEX idx_function_metrics_name_created ON public.function_metrics (function_name, created_at DESC);
CREATE INDEX idx_function_metrics_user_created ON public.function_metrics (user_id, created_at DESC);

-- Auto-cleanup: keep only last 7 days of metrics
CREATE OR REPLACE FUNCTION public.cleanup_old_function_metrics()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.function_metrics
  WHERE created_at < NOW() - INTERVAL '7 days';
  RETURN NEW;
END;
$$;

CREATE TRIGGER cleanup_function_metrics_trigger
AFTER INSERT ON public.function_metrics
FOR EACH STATEMENT
EXECUTE FUNCTION public.cleanup_old_function_metrics();
