CREATE OR REPLACE FUNCTION public.get_strategy_forensic_report(p_user_id uuid, p_days integer DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
  cutoff timestamptz;
BEGIN
  cutoff := NOW() - (p_days || ' days')::interval;

  SELECT jsonb_build_object(
    'period_days', p_days,
    'generated_at', NOW(),
    'by_normalized_strategy', (
      SELECT COALESCE(jsonb_agg(row_to_json(s)), '[]'::jsonb)
      FROM (
        SELECT
          CASE
            WHEN strategy_name IN ('STRONG_TREND', 'Strong Trend Continuation') THEN 'STRONG_TREND'
            WHEN strategy_name IN ('TREND_CONTINUATION', 'Adaptive Trend Entry') OR strategy_name LIKE 'Adaptive Trend Entry%' OR strategy_name LIKE 'Quality+Momentum%' OR strategy_name LIKE 'Near-Quality%' THEN 'TREND_CONTINUATION'
            WHEN strategy_name IN ('SQUEEZE_BREAKOUT', 'Neutral Breakout', 'HTF Neutral Breakout') THEN 'SQUEEZE_BREAKOUT'
            WHEN strategy_name = 'Compression Scalp' THEN 'COMPRESSION_SCALP'
            WHEN strategy_name LIKE 'MACD%' OR strategy_name = 'Trend Following' THEN 'TREND_FOLLOWING'
            WHEN strategy_name LIKE 'Hedge%' THEN 'HEDGE'
            ELSE 'OTHER'
          END AS normalized_strategy,
          COUNT(*) AS total_trades,
          COUNT(*) FILTER (WHERE realized_pnl > 0) AS wins,
          COUNT(*) FILTER (WHERE realized_pnl <= 0) AS losses,
          ROUND((COUNT(*) FILTER (WHERE realized_pnl > 0)::numeric / NULLIF(COUNT(*), 0) * 100)::numeric, 1) AS win_rate,
          ROUND(SUM(COALESCE(realized_pnl, 0))::numeric, 2) AS total_pnl,
          ROUND(AVG(COALESCE(realized_pnl_percent, 0))::numeric, 3) AS avg_pnl_pct,
          ROUND(AVG(realized_pnl_percent) FILTER (WHERE realized_pnl > 0)::numeric, 3) AS avg_win_pct,
          ROUND(AVG(realized_pnl_percent) FILTER (WHERE realized_pnl <= 0)::numeric, 3) AS avg_loss_pct,
          ROUND(MAX(realized_pnl_percent)::numeric, 3) AS best_trade_pct,
          ROUND(MIN(realized_pnl_percent)::numeric, 3) AS worst_trade_pct,
          jsonb_agg(DISTINCT strategy_name) AS db_name_variants
        FROM positions
        WHERE user_id = p_user_id AND status = 'closed' AND closed_at >= cutoff
        GROUP BY normalized_strategy
        ORDER BY total_trades DESC
      ) s
    ),
    'by_strategy_and_side', (
      SELECT COALESCE(jsonb_agg(row_to_json(ss)), '[]'::jsonb)
      FROM (
        SELECT
          CASE
            WHEN strategy_name IN ('STRONG_TREND', 'Strong Trend Continuation') THEN 'STRONG_TREND'
            WHEN strategy_name IN ('TREND_CONTINUATION', 'Adaptive Trend Entry') OR strategy_name LIKE 'Adaptive Trend Entry%' OR strategy_name LIKE 'Quality+Momentum%' OR strategy_name LIKE 'Near-Quality%' THEN 'TREND_CONTINUATION'
            WHEN strategy_name IN ('SQUEEZE_BREAKOUT', 'Neutral Breakout', 'HTF Neutral Breakout') THEN 'SQUEEZE_BREAKOUT'
            WHEN strategy_name = 'Compression Scalp' THEN 'COMPRESSION_SCALP'
            WHEN strategy_name LIKE 'MACD%' OR strategy_name = 'Trend Following' THEN 'TREND_FOLLOWING'
            ELSE 'OTHER'
          END AS normalized_strategy,
          side,
          COUNT(*) AS trades,
          ROUND((COUNT(*) FILTER (WHERE realized_pnl > 0)::numeric / NULLIF(COUNT(*), 0) * 100)::numeric, 1) AS win_rate,
          ROUND(SUM(COALESCE(realized_pnl, 0))::numeric, 2) AS total_pnl,
          ROUND(AVG(COALESCE(realized_pnl_percent, 0))::numeric, 3) AS avg_pnl_pct
        FROM positions
        WHERE user_id = p_user_id AND status = 'closed' AND closed_at >= cutoff
        GROUP BY normalized_strategy, side
        ORDER BY normalized_strategy, side
      ) ss
    ),
    'by_strategy_and_close_reason', (
      SELECT COALESCE(jsonb_agg(row_to_json(cr)), '[]'::jsonb)
      FROM (
        SELECT
          CASE
            WHEN strategy_name IN ('STRONG_TREND', 'Strong Trend Continuation') THEN 'STRONG_TREND'
            WHEN strategy_name IN ('TREND_CONTINUATION', 'Adaptive Trend Entry') OR strategy_name LIKE 'Adaptive Trend Entry%' OR strategy_name LIKE 'Quality+Momentum%' OR strategy_name LIKE 'Near-Quality%' THEN 'TREND_CONTINUATION'
            WHEN strategy_name IN ('SQUEEZE_BREAKOUT', 'Neutral Breakout', 'HTF Neutral Breakout') THEN 'SQUEEZE_BREAKOUT'
            ELSE 'OTHER'
          END AS normalized_strategy,
          COALESCE(close_reason, 'unknown') AS close_reason,
          COUNT(*) AS trades,
          ROUND(SUM(COALESCE(realized_pnl, 0))::numeric, 2) AS total_pnl,
          ROUND(AVG(COALESCE(realized_pnl_percent, 0))::numeric, 3) AS avg_pnl_pct
        FROM positions
        WHERE user_id = p_user_id AND status = 'closed' AND closed_at >= cutoff
        GROUP BY normalized_strategy, close_reason
        HAVING COUNT(*) >= 2
        ORDER BY normalized_strategy, trades DESC
      ) cr
    ),
    'name_mapping', jsonb_build_object(
      'STRONG_TREND', jsonb_build_array('Strong Trend Continuation', 'STRONG_TREND'),
      'TREND_CONTINUATION', jsonb_build_array('Adaptive Trend Entry', 'TREND_CONTINUATION', 'Quality+Momentum Fallback', 'Near-Quality Fallback'),
      'SQUEEZE_BREAKOUT', jsonb_build_array('Neutral Breakout', 'HTF Neutral Breakout', 'SQUEEZE_BREAKOUT'),
      'COMPRESSION_SCALP', jsonb_build_array('Compression Scalp'),
      'TREND_FOLLOWING', jsonb_build_array('MACD Bearish Cross', 'MACD Crossover', 'Trend Following', 'Multi-Timeframe Trend')
    )
  ) INTO result;

  RETURN result;
END;
$$;