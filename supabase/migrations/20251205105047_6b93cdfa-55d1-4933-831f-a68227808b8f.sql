-- Create table for AI signal analysis history
CREATE TABLE public.ai_signal_analysis (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  strategy_name TEXT,
  recommendation TEXT NOT NULL,
  confidence_adjustment INTEGER DEFAULT 0,
  position_size_multiplier NUMERIC DEFAULT 1.0,
  risk_level TEXT,
  key_factors JSONB,
  trend_data JSONB,
  entry_price NUMERIC,
  stop_loss NUMERIC,
  take_profit NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_signal_analysis ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own AI analysis"
ON public.ai_signal_analysis
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert AI analysis"
ON public.ai_signal_analysis
FOR INSERT
WITH CHECK (true);

-- Index for faster queries
CREATE INDEX idx_ai_signal_analysis_user_created ON public.ai_signal_analysis(user_id, created_at DESC);

-- Cleanup old records (keep last 100 per user)
CREATE OR REPLACE FUNCTION cleanup_old_ai_analysis()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM public.ai_signal_analysis
  WHERE user_id = NEW.user_id
  AND id NOT IN (
    SELECT id FROM public.ai_signal_analysis
    WHERE user_id = NEW.user_id
    ORDER BY created_at DESC
    LIMIT 100
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_cleanup_ai_analysis
AFTER INSERT ON public.ai_signal_analysis
FOR EACH ROW
EXECUTE FUNCTION cleanup_old_ai_analysis();