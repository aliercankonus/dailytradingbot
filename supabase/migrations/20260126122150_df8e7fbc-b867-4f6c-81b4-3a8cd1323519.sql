-- Update portfolio_metrics_view to exclude partial closes from win rate calculation
-- This makes it consistent with the History tab which shows "full close" stats only

DROP VIEW IF EXISTS public.portfolio_metrics_view;

CREATE VIEW public.portfolio_metrics_view AS
SELECT 
  user_id,
  -- Total closed trades (all, for reference)
  COUNT(*) FILTER (WHERE status = 'closed') as total_closed_trades,
  -- Winning full closes only (exclude partial)
  COUNT(*) FILTER (WHERE status = 'closed' AND realized_pnl > 0 
    AND (close_reason IS NULL OR close_reason NOT IN ('partial_loss', 'partial_tp_close', 'partial_tp_1', 'partial_tp_2', 'partial_tp_3'))
  ) as winning_trades,
  -- Losing full closes only (exclude partial)
  COUNT(*) FILTER (WHERE status = 'closed' AND realized_pnl < 0
    AND (close_reason IS NULL OR close_reason NOT IN ('partial_loss', 'partial_tp_close', 'partial_tp_1', 'partial_tp_2', 'partial_tp_3'))
  ) as losing_trades,
  -- Breakeven full closes only (exclude partial)
  COUNT(*) FILTER (WHERE status = 'closed' AND realized_pnl = 0
    AND (close_reason IS NULL OR close_reason NOT IN ('partial_loss', 'partial_tp_close', 'partial_tp_1', 'partial_tp_2', 'partial_tp_3'))
  ) as breakeven_trades,
  -- Total realized PnL (all trades including partial)
  COALESCE(SUM(realized_pnl) FILTER (WHERE status = 'closed'), 0) as realized_pnl,
  -- Win rate: wins / (wins + losses) excluding partial closes and breakeven
  CASE 
    WHEN (
      COUNT(*) FILTER (WHERE status = 'closed' AND realized_pnl > 0 
        AND (close_reason IS NULL OR close_reason NOT IN ('partial_loss', 'partial_tp_close', 'partial_tp_1', 'partial_tp_2', 'partial_tp_3'))
      ) + 
      COUNT(*) FILTER (WHERE status = 'closed' AND realized_pnl < 0
        AND (close_reason IS NULL OR close_reason NOT IN ('partial_loss', 'partial_tp_close', 'partial_tp_1', 'partial_tp_2', 'partial_tp_3'))
      )
    ) > 0 
    THEN (
      COUNT(*) FILTER (WHERE status = 'closed' AND realized_pnl > 0 
        AND (close_reason IS NULL OR close_reason NOT IN ('partial_loss', 'partial_tp_close', 'partial_tp_1', 'partial_tp_2', 'partial_tp_3'))
      )::numeric / 
      (
        COUNT(*) FILTER (WHERE status = 'closed' AND realized_pnl > 0 
          AND (close_reason IS NULL OR close_reason NOT IN ('partial_loss', 'partial_tp_close', 'partial_tp_1', 'partial_tp_2', 'partial_tp_3'))
        ) + 
        COUNT(*) FILTER (WHERE status = 'closed' AND realized_pnl < 0
          AND (close_reason IS NULL OR close_reason NOT IN ('partial_loss', 'partial_tp_close', 'partial_tp_1', 'partial_tp_2', 'partial_tp_3'))
        )
      )::numeric
    ) * 100
    ELSE 0 
  END as win_rate,
  -- Avg win (full closes only)
  COALESCE(
    AVG(realized_pnl) FILTER (WHERE status = 'closed' AND realized_pnl > 0
      AND (close_reason IS NULL OR close_reason NOT IN ('partial_loss', 'partial_tp_close', 'partial_tp_1', 'partial_tp_2', 'partial_tp_3'))
    ),
    0
  ) as avg_win,
  -- Avg loss (full closes only)
  COALESCE(
    ABS(AVG(realized_pnl) FILTER (WHERE status = 'closed' AND realized_pnl < 0
      AND (close_reason IS NULL OR close_reason NOT IN ('partial_loss', 'partial_tp_close', 'partial_tp_1', 'partial_tp_2', 'partial_tp_3'))
    )),
    0
  ) as avg_loss,
  -- Largest win (full closes only)
  COALESCE(
    MAX(realized_pnl) FILTER (WHERE status = 'closed' AND realized_pnl > 0
      AND (close_reason IS NULL OR close_reason NOT IN ('partial_loss', 'partial_tp_close', 'partial_tp_1', 'partial_tp_2', 'partial_tp_3'))
    ),
    0
  ) as largest_win,
  -- Largest loss (full closes only)
  COALESCE(
    ABS(MIN(realized_pnl) FILTER (WHERE status = 'closed' AND realized_pnl < 0
      AND (close_reason IS NULL OR close_reason NOT IN ('partial_loss', 'partial_tp_close', 'partial_tp_1', 'partial_tp_2', 'partial_tp_3'))
    )),
    0
  ) as largest_loss
FROM public.positions
GROUP BY user_id;