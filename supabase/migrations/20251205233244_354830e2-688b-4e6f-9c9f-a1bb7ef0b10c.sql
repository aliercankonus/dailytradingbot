-- Remove peak_pnl_percent column from positions table
ALTER TABLE public.positions DROP COLUMN IF EXISTS peak_pnl_percent;

-- Remove peak_pnl_percent column from positions_archive table
ALTER TABLE public.positions_archive DROP COLUMN IF EXISTS peak_pnl_percent;