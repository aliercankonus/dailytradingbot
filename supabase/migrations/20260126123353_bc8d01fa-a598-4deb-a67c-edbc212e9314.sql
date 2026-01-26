-- Update portfolio_metrics_view to INCLUDE partial closes in win rate calculation
-- Win rate = wins / (wins + losses), excluding only breakeven trades

DROP VIEW IF EXISTS public.portfolio_metrics_view;

CREATE VIEW public.portfolio_metrics_view AS
SELECT 
  user_id,
  -- Total closed trades
  COUNT(*) FILTER (WHERE status = 'closed') as total_closed_trades,
  -- Winning trades (all closed with positive PnL, including partial)
  COUNT(*) FILTER (WHERE status = 'closed' AND realized_pnl > 0) as winning_trades,
  -- Losing trades (all closed with negative PnL, including partial)
  COUNT(*) FILTER (WHERE status = 'closed' AND realized_pnl < 0) as losing_trades,
  -- Breakeven trades (PnL = 0)
  COUNT(*) FILTER (WHERE status = 'closed' AND realized_pnl = 0) as breakeven_trades,
  -- Total realized PnL
  COALESCE(SUM(realized_pnl) FILTER (WHERE status = 'closed'), 0) as realized_pnl,
  -- Win rate: wins / (wins + losses) excluding breakeven only
  CASE 
    WHEN (
      COUNT(*) FILTER (WHERE status = 'closed' AND realized_pnl > 0) + 
      COUNT(*) FILTER (WHERE status = 'closed' AND realized_pnl < 0)
    ) > 0 
    THEN (
      COUNT(*) FILTER (WHERE status = 'closed' AND realized_pnl > 0)::numeric / 
      (
        COUNT(*) FILTER (WHERE status = 'closed' AND realized_pnl > 0) + 
        COUNT(*) FILTER (WHERE status = 'closed' AND realized_pnl < 0)
      )::numeric
    ) * 100
    ELSE 0 
  END as win_rate,
  -- Avg win
  COALESCE(AVG(realized_pnl) FILTER (WHERE status = 'closed' AND realized_pnl > 0), 0) as avg_win,
  -- Avg loss
  COALESCE(ABS(AVG(realized_pnl) FILTER (WHERE status = 'closed' AND realized_pnl < 0)), 0) as avg_loss,
  -- Largest win
  COALESCE(MAX(realized_pnl) FILTER (WHERE status = 'closed' AND realized_pnl > 0), 0) as largest_win,
  -- Largest loss
  COALESCE(ABS(MIN(realized_pnl) FILTER (WHERE status = 'closed' AND realized_pnl < 0)), 0) as largest_loss
FROM public.positions
GROUP BY user_id;