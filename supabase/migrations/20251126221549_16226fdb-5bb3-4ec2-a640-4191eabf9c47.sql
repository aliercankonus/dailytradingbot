-- ============================================
-- CONSOLIDATE TRADES AND POSITIONS TABLES
-- ============================================

-- Step 1: Add missing fields from trades table to positions table
ALTER TABLE public.positions
ADD COLUMN IF NOT EXISTS binance_order_id text,
ADD COLUMN IF NOT EXISTS order_type text DEFAULT 'LIMIT',
ADD COLUMN IF NOT EXISTS executed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS closed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS exit_price numeric,
ADD COLUMN IF NOT EXISTS realized_pnl numeric,
ADD COLUMN IF NOT EXISTS realized_pnl_percent numeric,
ADD COLUMN IF NOT EXISTS signal_id uuid REFERENCES public.trading_signals(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS strategy_name text;

-- Step 2: Migrate existing data from trades to positions
-- Update positions with corresponding trade data where trade_id exists
UPDATE public.positions p
SET 
  binance_order_id = t.binance_order_id,
  order_type = t.order_type,
  executed_at = t.executed_at,
  closed_at = t.closed_at,
  exit_price = t.exit_price,
  realized_pnl = t.profit_loss,
  realized_pnl_percent = t.profit_loss_percent,
  signal_id = t.signal_id,
  strategy_name = t.strategy_name
FROM public.trades t
WHERE p.trade_id = t.id;

-- Step 3: Update notifications table to reference positions instead of trades
ALTER TABLE public.notifications
DROP CONSTRAINT IF EXISTS notifications_trade_id_fkey,
ADD COLUMN IF NOT EXISTS position_id uuid REFERENCES public.positions(id) ON DELETE SET NULL;

-- Migrate notification references from trade_id to position_id
UPDATE public.notifications n
SET position_id = p.id
FROM public.positions p
WHERE n.trade_id = p.trade_id;

-- Drop old trade_id column from notifications
ALTER TABLE public.notifications
DROP COLUMN IF EXISTS trade_id;

-- Step 4: Remove trade_id from positions (no longer needed)
ALTER TABLE public.positions
DROP CONSTRAINT IF EXISTS positions_trade_id_fkey,
DROP COLUMN IF EXISTS trade_id;

-- Step 5: Update setup_performance trigger to work with positions
DROP TRIGGER IF EXISTS update_setup_performance_trigger ON public.trades;
DROP FUNCTION IF EXISTS public.update_setup_performance_from_trade();

-- Create new trigger function for positions
CREATE OR REPLACE FUNCTION public.update_setup_performance_from_position()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Only process closed positions
  IF NEW.status = 'closed' AND OLD.status = 'active' THEN
    -- Update or insert setup performance
    INSERT INTO public.setup_performance (
      user_id,
      setup_pattern,
      symbol,
      strategy_name,
      total_trades,
      winning_trades,
      losing_trades,
      win_rate,
      avg_profit,
      avg_loss
    )
    SELECT
      NEW.user_id,
      COALESCE(NEW.strategy_name || '_' || 
        CASE 
          WHEN NEW.side = 'buy' THEN 'LONG'
          ELSE 'SHORT'
        END, 'UNKNOWN'),
      NEW.symbol,
      COALESCE(NEW.strategy_name, 'UNKNOWN'),
      1,
      CASE WHEN NEW.realized_pnl > 0 THEN 1 ELSE 0 END,
      CASE WHEN NEW.realized_pnl <= 0 THEN 1 ELSE 0 END,
      CASE WHEN NEW.realized_pnl > 0 THEN 100.0 ELSE 0.0 END,
      CASE WHEN NEW.realized_pnl > 0 THEN NEW.realized_pnl ELSE 0 END,
      CASE WHEN NEW.realized_pnl <= 0 THEN ABS(NEW.realized_pnl) ELSE 0 END
    ON CONFLICT (user_id, setup_pattern, symbol, strategy_name)
    DO UPDATE SET
      total_trades = setup_performance.total_trades + 1,
      winning_trades = setup_performance.winning_trades + CASE WHEN NEW.realized_pnl > 0 THEN 1 ELSE 0 END,
      losing_trades = setup_performance.losing_trades + CASE WHEN NEW.realized_pnl <= 0 THEN 1 ELSE 0 END,
      win_rate = ((setup_performance.winning_trades + CASE WHEN NEW.realized_pnl > 0 THEN 1 ELSE 0 END)::NUMERIC / 
                  (setup_performance.total_trades + 1)::NUMERIC) * 100,
      avg_profit = CASE 
        WHEN NEW.realized_pnl > 0 THEN
          ((setup_performance.avg_profit * setup_performance.winning_trades) + NEW.realized_pnl) / 
          (setup_performance.winning_trades + 1)
        ELSE setup_performance.avg_profit
      END,
      avg_loss = CASE 
        WHEN NEW.realized_pnl <= 0 THEN
          ((setup_performance.avg_loss * setup_performance.losing_trades) + ABS(NEW.realized_pnl)) / 
          (setup_performance.losing_trades + 1)
        ELSE setup_performance.avg_loss
      END,
      profit_factor = CASE
        WHEN ((setup_performance.avg_loss * setup_performance.losing_trades) + 
              CASE WHEN NEW.realized_pnl <= 0 THEN ABS(NEW.realized_pnl) ELSE 0 END) > 0 THEN
          ((setup_performance.avg_profit * setup_performance.winning_trades) + 
           CASE WHEN NEW.realized_pnl > 0 THEN NEW.realized_pnl ELSE 0 END) /
          ((setup_performance.avg_loss * setup_performance.losing_trades) + 
           CASE WHEN NEW.realized_pnl <= 0 THEN ABS(NEW.realized_pnl) ELSE 0 END)
        ELSE 0
      END,
      updated_at = now();
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on positions table
CREATE TRIGGER update_setup_performance_trigger
AFTER UPDATE ON public.positions
FOR EACH ROW
EXECUTE FUNCTION public.update_setup_performance_from_position();

-- Step 6: Update portfolio_metrics_view to use positions instead of trades
DROP VIEW IF EXISTS public.portfolio_metrics_view;

CREATE VIEW public.portfolio_metrics_view AS
SELECT 
  user_id,
  COUNT(*) FILTER (WHERE status = 'closed') as total_closed_trades,
  COUNT(*) FILTER (WHERE status = 'closed' AND realized_pnl > 0) as winning_trades,
  COUNT(*) FILTER (WHERE status = 'closed' AND realized_pnl <= 0) as losing_trades,
  SUM(realized_pnl) FILTER (WHERE status = 'closed') as realized_pnl,
  CASE 
    WHEN COUNT(*) FILTER (WHERE status = 'closed') > 0 
    THEN (COUNT(*) FILTER (WHERE status = 'closed' AND realized_pnl > 0)::numeric / COUNT(*) FILTER (WHERE status = 'closed')::numeric * 100)
    ELSE 0 
  END as win_rate,
  AVG(realized_pnl) FILTER (WHERE status = 'closed' AND realized_pnl > 0) as avg_win,
  AVG(ABS(realized_pnl)) FILTER (WHERE status = 'closed' AND realized_pnl <= 0) as avg_loss,
  MAX(realized_pnl) FILTER (WHERE status = 'closed') as largest_win,
  MIN(realized_pnl) FILTER (WHERE status = 'closed') as largest_loss
FROM public.positions
GROUP BY user_id;

-- Step 7: Drop the trades table
DROP TABLE IF EXISTS public.trades CASCADE;

-- Step 8: Add index for better query performance on closed positions
CREATE INDEX IF NOT EXISTS idx_positions_status_closed ON public.positions(user_id, status) WHERE status = 'closed';
CREATE INDEX IF NOT EXISTS idx_positions_strategy_name ON public.positions(strategy_name) WHERE strategy_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_positions_signal_id ON public.positions(signal_id) WHERE signal_id IS NOT NULL;