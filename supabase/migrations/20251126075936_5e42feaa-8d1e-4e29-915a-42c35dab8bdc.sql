-- Create a view for fast portfolio metrics aggregation
-- RLS is automatically enforced through the underlying trades table
CREATE OR REPLACE VIEW portfolio_metrics_view AS
SELECT 
  t.user_id,
  -- Realized P&L metrics (from closed trades)
  COALESCE(SUM(CASE WHEN t.status = 'closed' AND t.profit_loss IS NOT NULL THEN t.profit_loss ELSE 0 END), 0) as realized_pnl,
  -- Trade statistics
  COUNT(CASE WHEN t.status = 'closed' THEN 1 END) as total_closed_trades,
  COUNT(CASE WHEN t.status = 'closed' AND t.profit_loss > 0 THEN 1 END) as winning_trades,
  COUNT(CASE WHEN t.status = 'closed' AND t.profit_loss <= 0 THEN 1 END) as losing_trades,
  -- Win rate calculation
  CASE 
    WHEN COUNT(CASE WHEN t.status = 'closed' THEN 1 END) > 0 
    THEN (COUNT(CASE WHEN t.status = 'closed' AND t.profit_loss > 0 THEN 1 END)::numeric / COUNT(CASE WHEN t.status = 'closed' THEN 1 END)::numeric) * 100
    ELSE 0 
  END as win_rate,
  -- Largest win/loss
  COALESCE(MAX(CASE WHEN t.profit_loss > 0 THEN t.profit_loss END), 0) as largest_win,
  COALESCE(MIN(CASE WHEN t.profit_loss < 0 THEN t.profit_loss END), 0) as largest_loss,
  -- Average win/loss
  COALESCE(AVG(CASE WHEN t.profit_loss > 0 THEN t.profit_loss END), 0) as avg_win,
  COALESCE(AVG(CASE WHEN t.profit_loss < 0 THEN ABS(t.profit_loss) END), 0) as avg_loss
FROM trades t
GROUP BY t.user_id;

-- Grant access to authenticated users
GRANT SELECT ON portfolio_metrics_view TO authenticated;