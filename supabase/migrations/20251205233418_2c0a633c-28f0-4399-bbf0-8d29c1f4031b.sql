-- Add peak_pnl_percent column to positions table for trailing stop ratcheting
ALTER TABLE public.positions ADD COLUMN IF NOT EXISTS peak_pnl_percent numeric DEFAULT 0;

-- Add peak_pnl_percent column to positions_archive table
ALTER TABLE public.positions_archive ADD COLUMN IF NOT EXISTS peak_pnl_percent numeric DEFAULT 0;

COMMENT ON COLUMN public.positions.peak_pnl_percent IS 'Tracks the highest P&L percentage reached for trailing stop ratcheting';
COMMENT ON COLUMN public.positions_archive.peak_pnl_percent IS 'Tracks the highest P&L percentage reached for trailing stop ratcheting';