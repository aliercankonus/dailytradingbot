-- Add peak_pnl_percent column to positions table for ratcheting lock stop
ALTER TABLE public.positions 
ADD COLUMN IF NOT EXISTS peak_pnl_percent numeric DEFAULT 0;

-- Add same column to positions_archive for consistency
ALTER TABLE public.positions_archive 
ADD COLUMN IF NOT EXISTS peak_pnl_percent numeric DEFAULT 0;

-- Add comment explaining the column purpose
COMMENT ON COLUMN public.positions.peak_pnl_percent IS 'Tracks the highest P&L percentage achieved - used for lock stop ratcheting mechanism';
