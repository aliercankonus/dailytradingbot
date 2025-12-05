-- Add peak_pnl_percent column to track the highest P&L achieved (for ratcheting trailing stops)
ALTER TABLE public.positions 
ADD COLUMN IF NOT EXISTS peak_pnl_percent numeric DEFAULT 0;

-- Also add to archive table for historical consistency
ALTER TABLE public.positions_archive 
ADD COLUMN IF NOT EXISTS peak_pnl_percent numeric DEFAULT 0;

-- Add comment explaining the purpose
COMMENT ON COLUMN public.positions.peak_pnl_percent IS 'Highest unrealized P&L percentage reached - used for trailing stop ratcheting mechanism';