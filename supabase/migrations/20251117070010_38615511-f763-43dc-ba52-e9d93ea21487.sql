-- Add trend_consistency to positions table
ALTER TABLE public.positions
ADD COLUMN trend_consistency numeric;

COMMENT ON COLUMN public.positions.trend_consistency IS 'Trend consistency percentage (0-100) at the time the position was opened';