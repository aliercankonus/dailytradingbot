-- Update portfolio_metrics_view to exclude breakeven trades from win rate calculation
DROP VIEW IF EXISTS public.portfolio_metrics_view;

CREATE VIEW public.portfolio_metrics_view AS
SELECT 
  user_id,
  COUNT(*) FILTER (WHERE status = 'closed') as total_closed_trades,
  COUNT(*) FILTER (WHERE status = 'closed' AND realized_pnl > 0) as winning_trades,
  COUNT(*) FILTER (WHERE status = 'closed' AND realized_pnl < 0) as losing_trades,
  COUNT(*) FILTER (WHERE status = 'closed' AND realized_pnl = 0) as breakeven_trades,
  COALESCE(SUM(realized_pnl) FILTER (WHERE status = 'closed'), 0) as realized_pnl,
  CASE 
    WHEN (COUNT(*) FILTER (WHERE status = 'closed' AND realized_pnl > 0) + 
          COUNT(*) FILTER (WHERE status = 'closed' AND realized_pnl < 0)) > 0 
    THEN (COUNT(*) FILTER (WHERE status = 'closed' AND realized_pnl > 0)::numeric / 
          (COUNT(*) FILTER (WHERE status = 'closed' AND realized_pnl > 0) + 
           COUNT(*) FILTER (WHERE status = 'closed' AND realized_pnl < 0))::numeric) * 100
    ELSE 0 
  END as win_rate,
  COALESCE(
    AVG(realized_pnl) FILTER (WHERE status = 'closed' AND realized_pnl > 0),
    0
  ) as avg_win,
  COALESCE(
    ABS(AVG(realized_pnl) FILTER (WHERE status = 'closed' AND realized_pnl < 0)),
    0
  ) as avg_loss,
  COALESCE(
    MAX(realized_pnl) FILTER (WHERE status = 'closed' AND realized_pnl > 0),
    0
  ) as largest_win,
  COALESCE(
    ABS(MIN(realized_pnl) FILTER (WHERE status = 'closed' AND realized_pnl < 0)),
    0
  ) as largest_loss
FROM public.positions
GROUP BY user_id;