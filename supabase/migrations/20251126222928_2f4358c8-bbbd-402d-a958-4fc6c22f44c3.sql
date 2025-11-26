-- Drop the view first to remove dependency
DROP VIEW IF EXISTS positions_with_archive;

-- Remove unrealized P&L columns from positions table
ALTER TABLE positions 
DROP COLUMN IF EXISTS unrealized_pnl,
DROP COLUMN IF EXISTS unrealized_pnl_percent;

-- Remove unrealized P&L columns from positions_archive table
ALTER TABLE positions_archive
DROP COLUMN IF EXISTS unrealized_pnl,
DROP COLUMN IF EXISTS unrealized_pnl_percent;

-- Recreate the view without unrealized P&L columns
CREATE VIEW positions_with_archive AS
SELECT 
  id, user_id, symbol, side, quantity, entry_price, current_price,
  stop_loss, take_profit, realized_pnl, realized_pnl_percent,
  status, opened_at, updated_at, closed_at, executed_at, exit_price,
  close_reason, trend, confidence_score, trend_consistency,
  opened_by_rebalancer, closed_by_rebalancer, binance_order_id,
  order_type, signal_id, strategy_name,
  false as is_archived
FROM positions
UNION ALL
SELECT 
  id, user_id, symbol, side, quantity, entry_price, current_price,
  stop_loss, take_profit, realized_pnl, realized_pnl_percent,
  status, opened_at, updated_at, closed_at, executed_at, exit_price,
  close_reason, trend, confidence_score, trend_consistency,
  opened_by_rebalancer, closed_by_rebalancer, binance_order_id,
  order_type, signal_id, strategy_name,
  true as is_archived
FROM positions_archive;