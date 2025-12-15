-- Add reversal decision tracking columns to positions table
ALTER TABLE public.positions ADD COLUMN IF NOT EXISTS reversal_decision TEXT DEFAULT 'NORMAL';
ALTER TABLE public.positions ADD COLUMN IF NOT EXISTS reversal_score INTEGER;
ALTER TABLE public.positions ADD COLUMN IF NOT EXISTS reversal_details JSONB;

-- Add same columns to positions_archive for consistency
ALTER TABLE public.positions_archive ADD COLUMN IF NOT EXISTS reversal_decision TEXT DEFAULT 'NORMAL';
ALTER TABLE public.positions_archive ADD COLUMN IF NOT EXISTS reversal_score INTEGER;
ALTER TABLE public.positions_archive ADD COLUMN IF NOT EXISTS reversal_details JSONB;

-- Add comment for documentation
COMMENT ON COLUMN public.positions.reversal_decision IS 'Reversal score decision: NORMAL, REDUCE (position size reduced), or BLOCK (should not exist as position)';
COMMENT ON COLUMN public.positions.reversal_score IS 'Unified reversal score 0-100 at time of entry';
COMMENT ON COLUMN public.positions.reversal_details IS 'Breakdown of reversal score components for analytics';