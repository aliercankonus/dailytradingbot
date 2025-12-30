-- Add entry_exception_type column to positions table
-- This tracks how the position was entered (MOMENTUM_CONTINUATION, REVERSAL_OVERRIDE, MICRO_TREND, STRONG_TREND)
ALTER TABLE public.positions 
ADD COLUMN entry_exception_type TEXT DEFAULT NULL;

-- Add same column to positions_archive for consistency
ALTER TABLE public.positions_archive 
ADD COLUMN entry_exception_type TEXT DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.positions.entry_exception_type IS 'Entry exception type used: MOMENTUM_CONTINUATION, REVERSAL_OVERRIDE, MICRO_TREND, STRONG_TREND, or NULL for standard entries';