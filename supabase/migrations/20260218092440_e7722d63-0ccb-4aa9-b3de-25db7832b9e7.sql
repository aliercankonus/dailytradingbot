
-- Create a function to aggregate market opportunity density data server-side
-- This avoids the 1000-row limit when querying large tables
CREATE OR REPLACE FUNCTION public.get_market_opportunity_density(
  p_user_id uuid,
  p_since timestamp with time zone
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
  regime_data jsonb;
  rejection_data jsonb;
  heartbeat_data jsonb;
BEGIN
  -- Aggregate regime distribution
  SELECT jsonb_agg(row_to_json(r))
  INTO regime_data
  FROM (
    SELECT 
      effective_regime,
      COUNT(*) as count,
      ROUND(AVG(adx)::numeric, 2) as avg_adx,
      ROUND(AVG(adx_slope)::numeric, 3) as avg_slope,
      ROUND((COUNT(*) FILTER (WHERE adx_slope > 0)::numeric / NULLIF(COUNT(*), 0) * 100)::numeric, 1) as adx_rising_pct,
      ROUND((COUNT(*) FILTER (WHERE bb_squeeze = true)::numeric / NULLIF(COUNT(*), 0) * 100)::numeric, 1) as squeeze_pct
    FROM market_regime_history
    WHERE user_id = p_user_id
      AND recorded_at >= p_since
    GROUP BY effective_regime
  ) r;

  -- Aggregate rejection density by gate and symbol
  SELECT jsonb_build_object(
    'by_gate', (
      SELECT COALESCE(jsonb_object_agg(gate, cnt), '{}'::jsonb)
      FROM (
        SELECT filters_status->>'gate' as gate, COUNT(*) as cnt
        FROM signal_rejection_log
        WHERE user_id = p_user_id
          AND checked_at >= p_since
        GROUP BY filters_status->>'gate'
      ) g
    ),
    'by_symbol', (
      SELECT COALESCE(jsonb_agg(row_to_json(s)), '[]'::jsonb)
      FROM (
        SELECT 
          symbol,
          COUNT(*) as rejections,
          (SELECT filters_status->>'gate' 
           FROM signal_rejection_log sub 
           WHERE sub.user_id = p_user_id 
             AND sub.checked_at >= p_since 
             AND sub.symbol = srl.symbol 
           GROUP BY filters_status->>'gate' 
           ORDER BY COUNT(*) DESC 
           LIMIT 1) as dominant_gate
        FROM signal_rejection_log srl
        WHERE user_id = p_user_id
          AND checked_at >= p_since
        GROUP BY symbol
      ) s
    ),
    'total', (
      SELECT COUNT(*)
      FROM signal_rejection_log
      WHERE user_id = p_user_id
        AND checked_at >= p_since
    )
  )
  INTO rejection_data;

  -- Aggregate no-trade states
  SELECT COALESCE(jsonb_object_agg(state, cnt), '{}'::jsonb)
  INTO heartbeat_data
  FROM (
    SELECT COALESCE(no_trade_state, 'UNKNOWN') as state, COUNT(*) as cnt
    FROM bot_heartbeat
    WHERE user_id = p_user_id
      AND recorded_at >= p_since
    GROUP BY no_trade_state
  ) h;

  result := jsonb_build_object(
    'regimes', COALESCE(regime_data, '[]'::jsonb),
    'rejections', COALESCE(rejection_data, '{}'::jsonb),
    'heartbeats', COALESCE(heartbeat_data, '{}'::jsonb)
  );

  RETURN result;
END;
$$;
