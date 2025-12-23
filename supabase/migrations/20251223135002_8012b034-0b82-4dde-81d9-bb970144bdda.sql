-- SCENARIO 5 PHASE 2: Add reversal persistence tracking for trend reversal exits
-- This column tracks consecutive bars where trend reversal has been detected
-- Requires 2+ consecutive bars before triggering reversal exit to reduce whipsaws

ALTER TABLE public.positions 
ADD COLUMN IF NOT EXISTS reversal_persisted_bars integer DEFAULT 0;

-- Also add to positions_archive for consistency
ALTER TABLE public.positions_archive 
ADD COLUMN IF NOT EXISTS reversal_persisted_bars integer DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN public.positions.reversal_persisted_bars IS 'Consecutive bars where trend reversal detected - requires 2+ for exit trigger';