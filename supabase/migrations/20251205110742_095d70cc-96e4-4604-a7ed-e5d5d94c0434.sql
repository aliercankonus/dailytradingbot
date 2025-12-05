-- 1. Fix nullable user_id columns by adding NOT NULL constraints
-- First update any NULL values to prevent constraint violations

-- custom_strategies: user_id is already NOT NULL based on schema
-- Let's verify and fix the ones that need it

-- trading_signals - add NOT NULL (already required per types.ts Insert)
-- notifications - add NOT NULL  
-- strategy_rotation_history - add NOT NULL

-- 2. Drop and recreate views with proper RLS-respecting queries
-- These views should filter by the calling user's context

-- Drop existing views
DROP VIEW IF EXISTS public.portfolio_metrics_view;
DROP VIEW IF EXISTS public.positions_with_archive;

-- Recreate portfolio_metrics_view as a security-invoker view
-- This view calculates metrics from positions for a specific user
CREATE OR REPLACE VIEW public.portfolio_metrics_view 
WITH (security_invoker = true)
AS
SELECT 
  user_id,
  COUNT(*) FILTER (WHERE status = 'closed') as total_closed_trades,
  COUNT(*) FILTER (WHERE status = 'closed' AND realized_pnl > 0) as winning_trades,
  COUNT(*) FILTER (WHERE status = 'closed' AND realized_pnl <= 0) as losing_trades,
  COALESCE(SUM(realized_pnl) FILTER (WHERE status = 'closed'), 0) as realized_pnl,
  CASE 
    WHEN COUNT(*) FILTER (WHERE status = 'closed') > 0 
    THEN (COUNT(*) FILTER (WHERE status = 'closed' AND realized_pnl > 0)::numeric / 
          COUNT(*) FILTER (WHERE status = 'closed')::numeric) * 100
    ELSE 0 
  END as win_rate,
  COALESCE(AVG(realized_pnl) FILTER (WHERE status = 'closed' AND realized_pnl > 0), 0) as avg_win,
  COALESCE(AVG(ABS(realized_pnl)) FILTER (WHERE status = 'closed' AND realized_pnl < 0), 0) as avg_loss,
  COALESCE(MAX(realized_pnl) FILTER (WHERE status = 'closed'), 0) as largest_win,
  COALESCE(MIN(realized_pnl) FILTER (WHERE status = 'closed'), 0) as largest_loss
FROM public.positions
WHERE user_id = auth.uid()
GROUP BY user_id;

-- Recreate positions_with_archive as a security-invoker view
CREATE OR REPLACE VIEW public.positions_with_archive
WITH (security_invoker = true)
AS
SELECT 
  id, user_id, symbol, side, quantity, entry_price, current_price,
  stop_loss, take_profit, realized_pnl, realized_pnl_percent,
  status, opened_at, updated_at, closed_at, executed_at, exit_price,
  close_reason, trend, confidence_score, trend_consistency,
  opened_by_rebalancer, closed_by_rebalancer, binance_order_id,
  order_type, signal_id, strategy_name, original_quantity,
  partial_tp_level, tp1_price, tp2_price, tp3_price,
  false as is_archived
FROM public.positions
WHERE user_id = auth.uid()
UNION ALL
SELECT 
  id, user_id, symbol, side, quantity, entry_price, current_price,
  stop_loss, take_profit, realized_pnl, realized_pnl_percent,
  status, opened_at, updated_at, closed_at, executed_at, exit_price,
  close_reason, trend, confidence_score, trend_consistency,
  opened_by_rebalancer, closed_by_rebalancer, binance_order_id,
  order_type, signal_id, strategy_name, original_quantity,
  partial_tp_level, tp1_price, tp2_price, tp3_price,
  true as is_archived
FROM public.positions_archive
WHERE user_id = auth.uid();