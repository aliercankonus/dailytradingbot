
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
  SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
  INTO regime_data
  FROM (
    SELECT 
      COALESCE(effective_regime, 'UNKNOWN') as effective_regime,
      COUNT(*) as count,
      ROUND(AVG(COALESCE(adx,0))::numeric, 2) as avg_adx,
      ROUND(AVG(COALESCE(adx_slope,0))::numeric, 3) as avg_slope,
      ROUND((COUNT(*) FILTER (WHERE adx_slope > 0)::numeric / NULLIF(COUNT(*), 0) * 100)::numeric, 1) as adx_rising_pct,
      ROUND((COUNT(*) FILTER (WHERE bb_squeeze = true)::numeric / NULLIF(COUNT(*), 0) * 100)::numeric, 1) as squeeze_pct
    FROM market_regime_history
    WHERE user_id = p_user_id
      AND recorded_at >= p_since
    GROUP BY COALESCE(effective_regime, 'UNKNOWN')
  ) r;

  SELECT jsonb_build_object(
    'by_gate', (
      SELECT COALESCE(jsonb_object_agg(COALESCE(gate, 'UNKNOWN'), cnt), '{}'::jsonb)
      FROM (
        SELECT COALESCE(filters_status->>'gate', 'UNKNOWN') as gate, COUNT(*) as cnt
        FROM signal_rejection_log
        WHERE user_id = p_user_id AND checked_at >= p_since
        GROUP BY COALESCE(filters_status->>'gate', 'UNKNOWN')
      ) g
    ),
    'by_symbol', (
      SELECT COALESCE(jsonb_agg(row_to_json(s)), '[]'::jsonb)
      FROM (
        SELECT 
          symbol,
          COUNT(*) as rejections,
          (SELECT COALESCE(filters_status->>'gate', 'UNKNOWN')
           FROM signal_rejection_log sub 
           WHERE sub.user_id = p_user_id AND sub.checked_at >= p_since AND sub.symbol = srl.symbol 
           GROUP BY COALESCE(filters_status->>'gate', 'UNKNOWN')
           ORDER BY COUNT(*) DESC LIMIT 1) as dominant_gate
        FROM signal_rejection_log srl
        WHERE user_id = p_user_id AND checked_at >= p_since
        GROUP BY symbol
      ) s
    ),
    'total', (SELECT COUNT(*) FROM signal_rejection_log WHERE user_id = p_user_id AND checked_at >= p_since)
  ) INTO rejection_data;

  SELECT COALESCE(jsonb_object_agg(COALESCE(state, 'UNKNOWN'), cnt), '{}'::jsonb)
  INTO heartbeat_data
  FROM (
    SELECT COALESCE(no_trade_state, 'UNKNOWN') as state, COUNT(*) as cnt
    FROM bot_heartbeat
    WHERE user_id = p_user_id AND recorded_at >= p_since
    GROUP BY COALESCE(no_trade_state, 'UNKNOWN')
  ) h;

  result := jsonb_build_object(
    'regimes', regime_data,
    'rejections', COALESCE(rejection_data, '{}'::jsonb),
    'heartbeats', heartbeat_data
  );

  RETURN result;
END;
$$;
