-- Fix search_path for the cleanup function
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
$$ LANGUAGE plpgsql SET search_path = public;