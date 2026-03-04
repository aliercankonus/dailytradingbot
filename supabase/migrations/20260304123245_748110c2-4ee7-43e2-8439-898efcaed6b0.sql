
CREATE OR REPLACE FUNCTION public.get_ignition_tier_audit(p_user_id uuid, p_hours_back integer DEFAULT 48)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  cutoff timestamptz;
BEGIN
  cutoff := NOW() - (p_hours_back || ' hours')::interval;

  SELECT jsonb_build_object(
    'period_hours', p_hours_back,
    'generated_at', NOW(),
    'tier_summary', (
      SELECT COALESCE(jsonb_agg(tier_row), '[]'::jsonb)
      FROM (
        SELECT
          COALESCE(
            gate_details->'ignitionAudit'->>'ignitionTier',
            gate_details->>'ignitionTier',
            CASE 
              WHEN gate_details->>'gate' = 'BREAKOUT_MICRO_PROBE' THEN 'MICRO_PROBE'
              WHEN gate_details->>'gate' = 'BREAKOUT_IGNITION_MOMENTUM_BYPASS' THEN 'IGNITION'
              ELSE 'OTHER'
            END
          ) AS tier,
          COUNT(*) AS trade_count,
          COUNT(*) FILTER (WHERE outcome_tracked = true) AS evaluated,
          COUNT(*) FILTER (WHERE would_have_won = true) AS wins,
          COUNT(*) FILTER (WHERE would_have_won = false) AS losses,
          COUNT(*) FILTER (WHERE outcome_tracked = false) AS pending,
          ROUND(
            CASE WHEN COUNT(*) FILTER (WHERE outcome_tracked = true) > 0
              THEN COUNT(*) FILTER (WHERE would_have_won = true)::numeric / 
                   COUNT(*) FILTER (WHERE outcome_tracked = true) * 100
              ELSE 0 END, 1
          ) AS win_rate_pct,
          ROUND(AVG(simulated_pnl_percent) FILTER (WHERE outcome_tracked = true)::numeric, 3) AS avg_pnl_pct,
          ROUND(AVG(simulated_pnl_percent) FILTER (WHERE would_have_won = true)::numeric, 3) AS avg_win_pct,
          ROUND(AVG(simulated_pnl_percent) FILTER (WHERE would_have_won = false)::numeric, 3) AS avg_loss_pct,
          ROUND(
            CASE WHEN COUNT(*) FILTER (WHERE outcome_tracked = true) > 0
              THEN (
                (COUNT(*) FILTER (WHERE would_have_won = true)::numeric / 
                 COUNT(*) FILTER (WHERE outcome_tracked = true) *
                 COALESCE(AVG(simulated_pnl_percent) FILTER (WHERE would_have_won = true), 0))
                -
                (COUNT(*) FILTER (WHERE would_have_won = false)::numeric / 
                 COUNT(*) FILTER (WHERE outcome_tracked = true) *
                 ABS(COALESCE(AVG(simulated_pnl_percent) FILTER (WHERE would_have_won = false), 0)))
              )
              ELSE 0 END::numeric, 4
          ) AS expectancy_pct,
          ROUND(AVG((gate_details->'ignitionAudit'->>'adxAtEntry')::numeric) FILTER (WHERE gate_details->'ignitionAudit'->>'adxAtEntry' IS NOT NULL)::numeric, 1) AS avg_adx_at_entry,
          ROUND(AVG((gate_details->'ignitionAudit'->>'slopeAtEntry')::numeric) FILTER (WHERE gate_details->'ignitionAudit'->>'slopeAtEntry' IS NOT NULL)::numeric, 3) AS avg_slope_at_entry,
          ROUND(MIN(simulated_pnl_percent) FILTER (WHERE outcome_tracked = true)::numeric, 3) AS max_adverse_pnl_pct,
          -- Tier multiplier for weighted expectancy calculation
          COALESCE(
            CASE 
              WHEN COALESCE(gate_details->'ignitionAudit'->>'ignitionTier', gate_details->>'ignitionTier') = 'ELITE' THEN 1.00
              WHEN COALESCE(gate_details->'ignitionAudit'->>'ignitionTier', gate_details->>'ignitionTier') = 'CONFIRMED' THEN 0.75
              WHEN COALESCE(gate_details->'ignitionAudit'->>'ignitionTier', gate_details->>'ignitionTier') = 'SPECULATIVE' THEN 0.50
              WHEN COALESCE(gate_details->'ignitionAudit'->>'ignitionTier', gate_details->>'ignitionTier') = 'MICRO_PROBE' THEN 0.25
              ELSE 0.50
            END, 0.50
          ) AS tier_weight
        FROM shadow_mode_signals
        WHERE user_id = p_user_id
          AND created_at >= cutoff
          AND (
            gate_details->>'gate' IN ('BREAKOUT_IGNITION_MOMENTUM_BYPASS', 'BREAKOUT_MICRO_PROBE', 'IGNITION_FLAT_TOLERANCE')
            OR gate_details->'ignitionAudit' IS NOT NULL
          )
        GROUP BY tier
        ORDER BY trade_count DESC
      ) tier_row
    ),
    -- NEW: Tier-Weighted Portfolio Expectancy KPI
    -- Σ (TierExpectancy × TierWeight × TierTradeShare)
    'tier_weighted_expectancy', (
      WITH tier_data AS (
        SELECT
          COALESCE(
            gate_details->'ignitionAudit'->>'ignitionTier',
            gate_details->>'ignitionTier',
            CASE 
              WHEN gate_details->>'gate' = 'BREAKOUT_MICRO_PROBE' THEN 'MICRO_PROBE'
              WHEN gate_details->>'gate' = 'BREAKOUT_IGNITION_MOMENTUM_BYPASS' THEN 'IGNITION'
              ELSE 'OTHER'
            END
          ) AS tier,
          outcome_tracked,
          would_have_won,
          simulated_pnl_percent
        FROM shadow_mode_signals
        WHERE user_id = p_user_id
          AND created_at >= cutoff
          AND (
            gate_details->>'gate' IN ('BREAKOUT_IGNITION_MOMENTUM_BYPASS', 'BREAKOUT_MICRO_PROBE', 'IGNITION_FLAT_TOLERANCE')
            OR gate_details->'ignitionAudit' IS NOT NULL
          )
      ),
      tier_stats AS (
        SELECT
          tier,
          COUNT(*) FILTER (WHERE outcome_tracked = true) AS evaluated,
          COUNT(*) AS total,
          CASE WHEN COUNT(*) FILTER (WHERE outcome_tracked = true) > 0
            THEN (
              (COUNT(*) FILTER (WHERE would_have_won = true)::numeric / COUNT(*) FILTER (WHERE outcome_tracked = true)
               * COALESCE(AVG(simulated_pnl_percent) FILTER (WHERE would_have_won = true), 0))
              -
              (COUNT(*) FILTER (WHERE would_have_won = false)::numeric / COUNT(*) FILTER (WHERE outcome_tracked = true)
               * ABS(COALESCE(AVG(simulated_pnl_percent) FILTER (WHERE would_have_won = false), 0)))
            )
            ELSE 0 END AS expectancy,
          CASE tier
            WHEN 'ELITE' THEN 1.00
            WHEN 'CONFIRMED' THEN 0.75
            WHEN 'SPECULATIVE' THEN 0.50
            WHEN 'MICRO_PROBE' THEN 0.25
            ELSE 0.50
          END AS weight
        FROM tier_data
        GROUP BY tier
      ),
      total_weighted AS (
        SELECT SUM(total) AS grand_total FROM tier_stats
      )
      SELECT ROUND(
        COALESCE(
          SUM(ts.expectancy * ts.weight * (ts.total::numeric / NULLIF(tw.grand_total, 0)))
        , 0)::numeric, 4
      )
      FROM tier_stats ts
      CROSS JOIN total_weighted tw
    ),
    'by_symbol', (
      SELECT COALESCE(jsonb_agg(sym_row), '[]'::jsonb)
      FROM (
        SELECT
          symbol,
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE would_have_won = true) AS wins,
          COUNT(*) FILTER (WHERE would_have_won = false) AS losses,
          ROUND(AVG(simulated_pnl_percent) FILTER (WHERE outcome_tracked = true)::numeric, 3) AS avg_pnl_pct
        FROM shadow_mode_signals
        WHERE user_id = p_user_id
          AND created_at >= cutoff
          AND (
            gate_details->>'gate' IN ('BREAKOUT_IGNITION_MOMENTUM_BYPASS', 'BREAKOUT_MICRO_PROBE', 'IGNITION_FLAT_TOLERANCE')
            OR gate_details->'ignitionAudit' IS NOT NULL
          )
        GROUP BY symbol
        ORDER BY total DESC
      ) sym_row
    ),
    'exit_method_breakdown', (
      SELECT COALESCE(jsonb_agg(exit_row), '[]'::jsonb)
      FROM (
        SELECT
          CASE
            WHEN outcome_notes LIKE 'TP_HIT%' THEN 'TP_HIT'
            WHEN outcome_notes LIKE 'SL_HIT%' THEN 'SL_HIT'
            WHEN outcome_notes LIKE 'TIME_STOP_SPECULATIVE%' THEN 'TIME_STOP_SPECULATIVE'
            WHEN outcome_notes LIKE 'TIME_STOP_MICRO_PROBE%' THEN 'TIME_STOP_MICRO_PROBE'
            WHEN outcome_notes LIKE 'TIME_EXIT_24H%' THEN 'TIME_EXIT_24H'
            ELSE 'OTHER'
          END AS exit_method,
          COUNT(*) AS count,
          ROUND(AVG(simulated_pnl_percent)::numeric, 3) AS avg_pnl_pct
        FROM shadow_mode_signals
        WHERE user_id = p_user_id
          AND created_at >= cutoff
          AND outcome_tracked = true
          AND (
            gate_details->>'gate' IN ('BREAKOUT_IGNITION_MOMENTUM_BYPASS', 'BREAKOUT_MICRO_PROBE', 'IGNITION_FLAT_TOLERANCE')
            OR gate_details->'ignitionAudit' IS NOT NULL
          )
        GROUP BY exit_method
        ORDER BY count DESC
      ) exit_row
    )
  ) INTO result;

  RETURN result;
END;
$function$;
