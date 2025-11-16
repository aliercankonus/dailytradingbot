-- Add rebalancing tracking fields to positions table
ALTER TABLE public.positions
ADD COLUMN IF NOT EXISTS closed_by_rebalancer boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS opened_by_rebalancer boolean DEFAULT false;

-- Add rebalancing tracking fields to trading_signals table
ALTER TABLE public.trading_signals
ADD COLUMN IF NOT EXISTS created_by_rebalancer boolean DEFAULT false;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_positions_rebalancing ON public.positions(closed_by_rebalancer, opened_by_rebalancer) WHERE status = 'closed';