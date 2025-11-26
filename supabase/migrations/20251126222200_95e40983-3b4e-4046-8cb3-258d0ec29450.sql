-- ============================================
-- POSITIONS ARCHIVE SYSTEM
-- ============================================

-- Step 1: Create archive table with same structure as positions
CREATE TABLE IF NOT EXISTS public.positions_archive (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  symbol text NOT NULL,
  side text NOT NULL,
  quantity numeric NOT NULL,
  entry_price numeric NOT NULL,
  current_price numeric,
  stop_loss numeric,
  take_profit numeric,
  unrealized_pnl numeric,
  unrealized_pnl_percent numeric,
  realized_pnl numeric,
  realized_pnl_percent numeric,
  status text NOT NULL,
  opened_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  closed_at timestamp with time zone,
  executed_at timestamp with time zone,
  exit_price numeric,
  close_reason text,
  trend text,
  confidence_score integer,
  trend_consistency numeric,
  opened_by_rebalancer boolean DEFAULT false,
  closed_by_rebalancer boolean DEFAULT false,
  binance_order_id text,
  order_type text DEFAULT 'LIMIT',
  signal_id uuid REFERENCES public.trading_signals(id) ON DELETE SET NULL,
  strategy_name text,
  archived_at timestamp with time zone DEFAULT now()
);

-- Step 2: Enable RLS on archive table
ALTER TABLE public.positions_archive ENABLE ROW LEVEL SECURITY;

-- Step 3: Create RLS policies for archive table
CREATE POLICY "Users can view their own archived positions"
ON public.positions_archive
FOR SELECT
USING (auth.uid() = user_id);

-- Service role can insert archived positions
CREATE POLICY "Service role can insert archived positions"
ON public.positions_archive
FOR INSERT
WITH CHECK (true);

-- Step 4: Create indexes for archive table
CREATE INDEX IF NOT EXISTS idx_positions_archive_user_id ON public.positions_archive(user_id);
CREATE INDEX IF NOT EXISTS idx_positions_archive_closed_at ON public.positions_archive(closed_at);
CREATE INDEX IF NOT EXISTS idx_positions_archive_symbol ON public.positions_archive(symbol);
CREATE INDEX IF NOT EXISTS idx_positions_archive_strategy ON public.positions_archive(strategy_name);

-- Step 5: Create function to archive old positions
CREATE OR REPLACE FUNCTION public.archive_old_positions()
RETURNS TABLE(archived_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  cutoff_date timestamp with time zone;
  moved_count integer := 0;
BEGIN
  -- Calculate cutoff date (30 days ago)
  cutoff_date := NOW() - INTERVAL '30 days';
  
  -- Log the archival process
  RAISE NOTICE 'Starting archival of positions closed before %', cutoff_date;
  
  -- Insert old closed positions into archive
  INSERT INTO public.positions_archive
  SELECT 
    id, user_id, symbol, side, quantity, entry_price, current_price,
    stop_loss, take_profit, unrealized_pnl, unrealized_pnl_percent,
    realized_pnl, realized_pnl_percent, status, opened_at, updated_at,
    closed_at, executed_at, exit_price, close_reason, trend,
    confidence_score, trend_consistency, opened_by_rebalancer,
    closed_by_rebalancer, binance_order_id, order_type, signal_id,
    strategy_name, NOW() as archived_at
  FROM public.positions
  WHERE status = 'closed'
    AND closed_at < cutoff_date
  ON CONFLICT (id) DO NOTHING;
  
  -- Get count of inserted rows
  GET DIAGNOSTICS moved_count = ROW_COUNT;
  
  -- Delete archived positions from main table
  DELETE FROM public.positions
  WHERE status = 'closed'
    AND closed_at < cutoff_date;
  
  RAISE NOTICE 'Archived % positions', moved_count;
  
  RETURN QUERY SELECT moved_count;
END;
$$;

-- Step 6: Grant execute permission to service role
GRANT EXECUTE ON FUNCTION public.archive_old_positions() TO service_role;

-- Step 7: Create combined view for querying both active and archived positions
CREATE OR REPLACE VIEW public.positions_with_archive AS
SELECT 
  id, user_id, symbol, side, quantity, entry_price, current_price,
  stop_loss, take_profit, unrealized_pnl, unrealized_pnl_percent,
  realized_pnl, realized_pnl_percent, status, opened_at, updated_at,
  closed_at, executed_at, exit_price, close_reason, trend,
  confidence_score, trend_consistency, opened_by_rebalancer,
  closed_by_rebalancer, binance_order_id, order_type, signal_id,
  strategy_name, false as is_archived
FROM public.positions
UNION ALL
SELECT 
  id, user_id, symbol, side, quantity, entry_price, current_price,
  stop_loss, take_profit, unrealized_pnl, unrealized_pnl_percent,
  realized_pnl, realized_pnl_percent, status, opened_at, updated_at,
  closed_at, executed_at, exit_price, close_reason, trend,
  confidence_score, trend_consistency, opened_by_rebalancer,
  closed_by_rebalancer, binance_order_id, order_type, signal_id,
  strategy_name, true as is_archived
FROM public.positions_archive;