-- Add AI analysis column to signal_rejection_log
ALTER TABLE public.signal_rejection_log 
ADD COLUMN IF NOT EXISTS ai_analysis JSONB DEFAULT NULL;