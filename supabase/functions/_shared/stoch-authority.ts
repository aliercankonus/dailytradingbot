// ============= STOCH AUTHORITY (Phase 1 Unification) =============
// SINGLE SOURCE OF TRUTH for all StochRSI-based admission logic.
//
// Replaces 8 scattered layers previously spread across gate-pipeline.ts and
// strategy-analyzer/index.ts:
//   1. LTF_SPIKE_PROTECTION
//   2. PRE_MOMENTUM_STOCHRSI
//   3. STOCHRSI_RUNWAY
//   4. NEAR_EXTREME_PROTECTION
//   5. STRONG_TREND_STOCH_OVERBOUGHT / OVERSOLD
//   6. SQUEEZE_BUY_OVERBOUGHT
//   7. TC_SHORT_OVERSOLD_ENTRY
//   8. Soft counter-trend sizing (macro bias)
//
// Design principles (per memory: unified-authority-principle):
//   - HARD BLOCK only for absolute extremes: K > 99 (LONG) / K < 1 (SHORT).
//   - Everything else → soft `runwayMultiplier` (position sizing).
//   - Strategy modules should NEVER call `mfs.stochRsi["1h"].k` directly.
//   - ADX slope alignment can partially forgive extremes (parabolic runway).
//
// Contract:
//   evaluateStochContext(mfs, direction, { adxSlope }) → StochContext
//   StochContext {
//     kValue, dValue,
//     hardBlock: boolean,          // true iff K crosses absolute extreme against direction
//     hardBlockReason: string|null,
//     runwayMultiplier: number,    // 0.30 .. 1.15 (multiply positionMultiplier)
//     isExtreme: boolean,          // K in [0,10] or [90,100]
//     isFavorable: boolean,        // Direction has meaningful room to run
//     tier: 'DEEP_FAVORABLE' | 'FAVORABLE' | 'NEUTRAL' | 'EXTENDED' | 'EXTREME' | 'ABSOLUTE',
//     reason: string,              // Diagnostic label for logs / forensics
//   }
// ================================================================

import type { MarketFeatureSnapshot } from "./market-feature-snapshot.ts";

// ============= CANONICAL THRESHOLDS =============
// All StochRSI thresholds live here. Do NOT re-declare elsewhere.
export const STOCH_AUTHORITY_CONFIG = {
  // Absolute (hard-block) extremes — K pegged at floor/ceiling
  ABSOLUTE_MAX_K: 99,   // LONG blocked at/above this
  ABSOLUTE_MIN_K: 1,    // SHORT blocked at/below this

  // Deep favorable zones (great runway for direction)
  DEEP_FAVORABLE_LONG_MAX_K: 20,   // LONG with K<20 = deep oversold bounce room
  DEEP_FAVORABLE_SHORT_MIN_K: 80,  // SHORT with K>80 = deep overbought room

  // Favorable
  FAVORABLE_LONG_MAX_K: 40,
  FAVORABLE_SHORT_MIN_K: 60,

  // Extended (partial exhaustion — soft penalty)
  EXTENDED_LONG_MIN_K: 70,   // LONG with K>70 = extending
  EXTENDED_SHORT_MAX_K: 30,  // SHORT with K<30 = extending

  // Extreme (near-exhaustion — heavy penalty)
  EXTREME_LONG_MIN_K: 90,    // LONG with K>90 = near-parabolic
  EXTREME_SHORT_MAX_K: 10,   // SHORT with K<10 = capitulation-adjacent

  // Sizing multipliers per tier
  MULT_DEEP_FAVORABLE: 1.10,
  MULT_FAVORABLE: 1.00,
  MULT_NEUTRAL: 0.90,
  MULT_EXTENDED: 0.65,
  MULT_EXTREME: 0.40,

  // Parabolic runway forgiveness: strong rising ADX slope can offset extremes
  ADX_SLOPE_RUNWAY_THRESHOLD: 1.0,    // slope >= 1.0 = clear expansion
  RUNWAY_FORGIVENESS: 1.35,           // multiplier applied ON TOP of tier mult
} as const;

export type StochTier =
  | 'DEEP_FAVORABLE'
  | 'FAVORABLE'
  | 'NEUTRAL'
  | 'EXTENDED'
  | 'EXTREME'
  | 'ABSOLUTE';

export interface StochContext {
  kValue: number;
  dValue: number;
  hardBlock: boolean;
  hardBlockReason: 'STOCH_ABSOLUTE_OVERBOUGHT_LONG' | 'STOCH_ABSOLUTE_OVERSOLD_SHORT' | null;
  runwayMultiplier: number;
  isExtreme: boolean;
  isFavorable: boolean;
  tier: StochTier;
  reason: string;
}

export interface StochEvalOptions {
  adxSlope?: number;
  timeframe?: '1h' | '4h' | '30m' | '15m';
}

// ============= AUTHORITY FUNCTION =============
export function evaluateStochContext(
  mfs: MarketFeatureSnapshot,
  direction: 'LONG' | 'SHORT',
  options: StochEvalOptions = {},
): StochContext {
  const tf = options.timeframe ?? '1h';
  const c = STOCH_AUTHORITY_CONFIG;
  const kValue = mfs.stochRsi?.[tf]?.k ?? 50;
  const dValue = mfs.stochRsi?.[tf]?.d ?? 50;
  const adxSlope = options.adxSlope ?? 0;

  // 1) ABSOLUTE HARD BLOCK (K pegged at ceiling/floor against direction)
  if (direction === 'LONG' && kValue >= c.ABSOLUTE_MAX_K) {
    return {
      kValue, dValue,
      hardBlock: true,
      hardBlockReason: 'STOCH_ABSOLUTE_OVERBOUGHT_LONG',
      runwayMultiplier: 0,
      isExtreme: true,
      isFavorable: false,
      tier: 'ABSOLUTE',
      reason: `K=${kValue.toFixed(1)} >= ${c.ABSOLUTE_MAX_K} (LONG absolute ceiling)`,
    };
  }
  if (direction === 'SHORT' && kValue <= c.ABSOLUTE_MIN_K) {
    return {
      kValue, dValue,
      hardBlock: true,
      hardBlockReason: 'STOCH_ABSOLUTE_OVERSOLD_SHORT',
      runwayMultiplier: 0,
      isExtreme: true,
      isFavorable: false,
      tier: 'ABSOLUTE',
      reason: `K=${kValue.toFixed(1)} <= ${c.ABSOLUTE_MIN_K} (SHORT absolute floor)`,
    };
  }

  // 2) TIER CLASSIFICATION (direction-relative)
  let tier: StochTier;
  let base: number;

  if (direction === 'LONG') {
    if (kValue >= c.EXTREME_LONG_MIN_K)          { tier = 'EXTREME';         base = c.MULT_EXTREME; }
    else if (kValue >= c.EXTENDED_LONG_MIN_K)    { tier = 'EXTENDED';        base = c.MULT_EXTENDED; }
    else if (kValue <= c.DEEP_FAVORABLE_LONG_MAX_K) { tier = 'DEEP_FAVORABLE'; base = c.MULT_DEEP_FAVORABLE; }
    else if (kValue <= c.FAVORABLE_LONG_MAX_K)   { tier = 'FAVORABLE';       base = c.MULT_FAVORABLE; }
    else                                          { tier = 'NEUTRAL';         base = c.MULT_NEUTRAL; }
  } else {
    if (kValue <= c.EXTREME_SHORT_MAX_K)         { tier = 'EXTREME';         base = c.MULT_EXTREME; }
    else if (kValue <= c.EXTENDED_SHORT_MAX_K)   { tier = 'EXTENDED';        base = c.MULT_EXTENDED; }
    else if (kValue >= c.DEEP_FAVORABLE_SHORT_MIN_K) { tier = 'DEEP_FAVORABLE'; base = c.MULT_DEEP_FAVORABLE; }
    else if (kValue >= c.FAVORABLE_SHORT_MIN_K)  { tier = 'FAVORABLE';       base = c.MULT_FAVORABLE; }
    else                                          { tier = 'NEUTRAL';         base = c.MULT_NEUTRAL; }
  }

  // 3) PARABOLIC RUNWAY FORGIVENESS
  // Strong rising ADX slope means the trend has room to keep extending K.
  // Partially forgive EXTENDED/EXTREME tiers.
  let runwayMultiplier = base;
  let forgiven = false;
  if ((tier === 'EXTENDED' || tier === 'EXTREME') && adxSlope >= c.ADX_SLOPE_RUNWAY_THRESHOLD) {
    runwayMultiplier = Math.min(base * c.RUNWAY_FORGIVENESS, 1.0);
    forgiven = true;
  }

  const reason = `K=${kValue.toFixed(1)} tier=${tier} slope=${adxSlope.toFixed(2)}${forgiven ? ' [parabolic-forgiven]' : ''} → mult=${runwayMultiplier.toFixed(2)}`;

  return {
    kValue,
    dValue,
    hardBlock: false,
    hardBlockReason: null,
    runwayMultiplier,
    isExtreme: tier === 'EXTREME' || tier === 'ABSOLUTE',
    isFavorable: tier === 'DEEP_FAVORABLE' || tier === 'FAVORABLE',
    tier,
    reason,
  };
}

// ============= LEGACY HELPERS (backwards compat, deprecated) =============
// These exist to help incremental migration. Do NOT add new call sites.

/** @deprecated Use evaluateStochContext().hardBlock */
export function isStochAbsoluteBlock(kValue: number, direction: 'LONG' | 'SHORT'): boolean {
  const c = STOCH_AUTHORITY_CONFIG;
  return (direction === 'LONG' && kValue >= c.ABSOLUTE_MAX_K)
    || (direction === 'SHORT' && kValue <= c.ABSOLUTE_MIN_K);
}
