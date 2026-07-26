/**
 * Future-State Feature — TimesFM Prediction Gap consumer.
 *
 * Sprint 2 (in-sample) + walk-forward findings:
 *   - ETHUSDT × regime=RANGE × horizon ∈ {24,48,72}h → OI-gap has POSITIVE IC
 *     with future log-return (momentum-confirming). Mean IC ≈ 0.10 – 0.17,
 *     hit-rate 83% across 6 folds. Best stability: h=48.
 *   - h=6 rejected (noise / mean-reverting).
 *   - Other symbols/regimes: not yet validated → treated as no-op.
 *
 * Integration policy (locked):
 *   - Shadow-only for the first 30 days (`FUTURE_STATE_SHADOW_MODE = true`).
 *   - Compute suggested multiplier, log it to `future_state_shadow_log`, but
 *     DO NOT modify the actual position size.
 *   - After 30-day validation window, flip the flag; still capped to [0.7, 1.3].
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// ────────────────────────────────────────────────────────────────────
// Flags
// ────────────────────────────────────────────────────────────────────
// Phase A2 (live, conservative) — re-scoped after the 180-day OI backfill:
//   - ETH h=24 is the most stable horizon (Rank IC ≈ +0.40 forecast quality,
//     +0.11…+0.15 alpha; positive in every 45-day fold).
//   - ETH h=48 collapsed in the most recent fold → dropped.
//   - Best regime cut: TREND_EXPANSION (IC ≈ +0.32). RANGE_COMPRESSION was
//     negative (IC ≈ -0.07) → removed from live sizing.
//   - BTC is near-noise (+0.03…+0.05) → shadow only, never sizes positions.
export const FUTURE_STATE_SHADOW_MODE = false;
export const FUTURE_STATE_HORIZON_HOURS = 24;   // best walk-forward stability
export const FUTURE_STATE_MAX_STALE_MIN = 90;   // fresher than 1.5h
export const FUTURE_STATE_MULT_MIN = 0.85;
export const FUTURE_STATE_MULT_MAX = 1.15;

// Confirmed scope from walk-forward validation + 180d backfill.
// (symbol, regime) -> allowed for LIVE sizing
const VALIDATED_SCOPES: Record<string, Record<string, boolean>> = {
  ETHUSDT: { TREND_EXPANSION: true },
};

export interface FutureStateSignal {
  applied: boolean;
  multiplier: number;
  reason: string;
  featureId: string | null;
  gapRel: number | null;
  horizon: number;
}

const noopSignal = (reason: string): FutureStateSignal => ({
  applied: false,
  multiplier: 1.0,
  reason,
  featureId: null,
  gapRel: null,
  horizon: FUTURE_STATE_HORIZON_HOURS,
});

/**
 * Compute the suggested sizing multiplier for a candidate signal, based on
 * the freshest TimesFM future-state feature. When shadow mode is on, always
 * returns `applied=false, multiplier=1.0` after logging its recommendation.
 */
export async function getFutureStateMultiplier(params: {
  supabaseUrl: string;
  supabaseServiceKey: string;
  userId: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  regime: string;
  strategyName?: string;
  logger?: { info: (msg: string) => void; warn: (msg: string) => void };
}): Promise<FutureStateSignal> {
  const { supabaseUrl, supabaseServiceKey, userId, symbol, direction, regime,
          strategyName, logger } = params;

  // 1) Scope guard — only where walk-forward confirms the anomaly.
  const scope = VALIDATED_SCOPES[symbol];
  if (!scope || !scope[regime]) {
    return noopSignal(`out_of_scope symbol=${symbol} regime=${regime}`);
  }

  // 2) Fetch freshest feature row.
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase
    .from('future_state_features')
    .select('id, anchor_ts, gap_rel, gap_z, created_at')
    .eq('user_id', userId)
    .eq('symbol', symbol)
    .eq('series', 'log_oi')
    .eq('horizon_hours', FUTURE_STATE_HORIZON_HOURS)
    .order('anchor_ts', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return noopSignal(`no_feature err=${error?.message ?? 'none'}`);
  }

  const ageMin = (Date.now() - Number(data.anchor_ts)) / 60_000;
  if (ageMin > FUTURE_STATE_MAX_STALE_MIN) {
    return noopSignal(`stale age=${ageMin.toFixed(1)}min`);
  }

  // 3) Directional agreement.
  //    ETH-RANGE anomaly is momentum-confirming:
  //      gap_rel > 0  ⇒ future price expected to rise ⇒ favors LONG
  //      gap_rel < 0  ⇒ favors SHORT
  const gapRel = Number(data.gap_rel);
  const signalDir = direction === 'LONG' ? +1 : -1;
  const gapDir = Math.sign(gapRel);

  // Strength: |gap_rel| capped at 2% → maps to ±0.15 multiplier deltas
  // (Phase A1 conservative band: [0.85, 1.15]).
  const strength = Math.min(Math.abs(gapRel) / 0.02, 1.0);
  const delta = 0.15 * strength * (gapDir === signalDir ? +1 : -1);
  const rawMult = 1.0 + delta;
  const suggested = Math.max(FUTURE_STATE_MULT_MIN,
                             Math.min(FUTURE_STATE_MULT_MAX, rawMult));

  const reason = `${symbol}/${regime}/h${FUTURE_STATE_HORIZON_HOURS} ` +
                 `gap_rel=${gapRel.toFixed(4)} dir=${direction} ` +
                 `agree=${gapDir === signalDir} → x${suggested.toFixed(2)}`;

  // 4) Shadow log (best-effort — never block on this).
  try {
    await supabase.from('future_state_shadow_log').insert({
      user_id: userId,
      symbol,
      direction,
      regime,
      strategy_name: strategyName ?? null,
      feature_id: data.id,
      horizon_hours: FUTURE_STATE_HORIZON_HOURS,
      gap_rel: gapRel,
      suggested_multiplier: suggested,
      applied: !FUTURE_STATE_SHADOW_MODE,
      reason,
    });
  } catch (e) {
    logger?.warn?.(`future_state shadow log insert failed: ${(e as Error).message}`);
  }

  if (FUTURE_STATE_SHADOW_MODE) {
    logger?.info?.(`🔮 FUTURE_STATE [shadow] ${reason}`);
    return {
      applied: false,
      multiplier: 1.0,
      reason: `shadow: ${reason}`,
      featureId: data.id,
      gapRel,
      horizon: FUTURE_STATE_HORIZON_HOURS,
    };
  }

  logger?.info?.(`🔮 FUTURE_STATE [live] ${reason}`);
  return {
    applied: true,
    multiplier: suggested,
    reason,
    featureId: data.id,
    gapRel,
    horizon: FUTURE_STATE_HORIZON_HOURS,
  };
}
