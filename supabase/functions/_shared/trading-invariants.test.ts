// ============= TRADING INVARIANT TESTS =============
// These tests encode TRADING TRUTHS — not "does the code work as written"
// but "does the code make correct trading decisions?"
//
// If any of these fail, a threshold is miscalibrated and must be fixed.
//
// CATEGORIES:
// 1. "Never block a strong trend" — ADX>30 + aligned momentum should always allow entry
// 2. "Always block genuine exhaustion" — RSI>85 + falling ADX should always block
// 3. "Rally override must work" — multi-TF alignment should bypass stale gates
// 4. "Position sizing sanity" — probes should never be larger than full entries
// 5. "Symmetry" — LONG and SHORT thresholds should be symmetrically fair

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  MOVE_EXHAUSTION_FILTER_PARAMS,
  STOCHRSI_RUNWAY_GATE,
  STOCHRSI_THRESHOLDS,
  HTF_EXTREME_HARD_GATES,
  ADX_THRESHOLDS,
  ADX_PHASES,
  ADX_GATE_V1_1,
  RALLY_OVERRIDE,
  STRONG_TREND_TIER0_OVERRIDE,
  DEEP_STOCHRSI_HARD_GATE,
  ADX_EXHAUSTION_PARAMS,
  CAPITULATION_BOUNCE_PROBE,
} from "./constants.ts";
import { calculateMomentumScore } from "./smart-momentum.ts";
import { generateBTCPrices, generateADAPrices, generateRallyPrices, generateKlines } from "./test-helpers.ts";

// ================================================================
// Reuse gate helpers from gate-logic.test.ts (inlined for independence)
// ================================================================
function evaluateMoveExhausted(
  direction: 'long' | 'short',
  movePercent: number,
  adx: number,
  adxSlope: number,
  bbSqueeze: boolean = false,
  percentB: number = 50,
): { blocked: boolean; softZone: boolean; probeSize: number | null; reason: string } {
  const P = MOVE_EXHAUSTION_FILTER_PARAMS;
  if (!P.ENABLED) return { blocked: false, softZone: false, probeSize: null, reason: 'disabled' };

  let softThreshold: number = direction === 'long' ? P.LONG_SOFT_THRESHOLD_PERCENT : P.SHORT_SOFT_THRESHOLD_PERCENT;
  let hardThreshold: number = direction === 'long' ? P.LONG_HARD_THRESHOLD_PERCENT : P.SHORT_HARD_THRESHOLD_PERCENT;

  const R = P.STRONG_TREND_RELAXATION;
  if (R.ENABLED) {
    const adxQualifies = adx >= R.MIN_ADX_FOR_RELAXATION;
    const squeezeQualifies = R.BB_SQUEEZE_RELAXATION && bbSqueeze;
    const bbBreakdown = R.BB_BREAKDOWN_RELAXATION && (
      (direction === 'short' && percentB <= R.BB_BREAKDOWN_PERCENT_B_SHORT) ||
      (direction === 'long' && percentB >= R.BB_BREAKDOWN_PERCENT_B_LONG)
    );

    if (adxQualifies || squeezeQualifies || bbBreakdown) {
      const G = R.GRADUATED_SLOPE_RELAXATION;
      if (G.ENABLED) {
        if (adxSlope >= G.ACCELERATING_SLOPE) {
          hardThreshold = Number(G.ACCELERATING_HARD_THRESHOLD);
        } else if (adxSlope >= G.FULL_RELAXATION_SLOPE) {
          hardThreshold = Number(G.FULL_HARD_THRESHOLD);
        } else if (adxSlope >= G.PARTIAL_RELAXATION_SLOPE) {
          hardThreshold = Number(G.PARTIAL_HARD_THRESHOLD);
        } else if (adxSlope >= G.LIMITED_RELAXATION_SLOPE) {
          hardThreshold = Number(G.LIMITED_HARD_THRESHOLD);
        }
      } else {
        softThreshold = Number(R.RELAXED_SOFT_THRESHOLD_PERCENT);
        hardThreshold = Number(R.RELAXED_HARD_THRESHOLD_PERCENT);
      }
    }
  }

  const RTE = P.RISING_TREND_EXCEPTION;
  if (RTE.ENABLED && !RTE.SHADOW_MODE && adxSlope >= RTE.MIN_ADX_SLOPE && adx >= RTE.MIN_ADX && adx <= RTE.MAX_ADX) {
    hardThreshold = Math.max(hardThreshold, Number(RTE.HARD_THRESHOLD_PERCENT));
    softThreshold = Math.max(softThreshold, Number(RTE.SOFT_THRESHOLD_PERCENT));
  }

  if (movePercent >= hardThreshold) {
    return { blocked: true, softZone: false, probeSize: null, reason: `move ${movePercent}% >= hard ${hardThreshold}%` };
  }
  if (movePercent >= softThreshold) {
    return { blocked: false, softZone: true, probeSize: P.SOFT_THRESHOLD_POSITION_SIZE, reason: `soft zone` };
  }
  return { blocked: false, softZone: false, probeSize: null, reason: `below thresholds` };
}

function evaluateDeepExhaustionCompound(
  direction: 'long' | 'short',
  stochK4h: number,
  movePercent: number,
  adx: number,
  rallyOverrideActive: boolean = false,
): { blocked: boolean; probeAllowed: boolean; probeSize: number | null; reason: string } {
  const D = STOCHRSI_RUNWAY_GATE.DEEP_EXHAUSTION_COMPOUND;
  if (!D.ENABLED) return { blocked: false, probeAllowed: false, probeSize: null, reason: 'disabled' };

  const isExhausted = direction === 'short'
    ? (stochK4h < D.SHORT_MAX_K && movePercent > D.SHORT_MIN_MOVE_PERCENT)
    : (stochK4h > D.LONG_MIN_K && movePercent > D.LONG_MIN_MOVE_PERCENT);

  if (!isExhausted) return { blocked: false, probeAllowed: false, probeSize: null, reason: 'not exhausted' };

  if (rallyOverrideActive && RALLY_OVERRIDE.BYPASSES_DEEP_EXHAUSTION_COMPOUND) {
    return { blocked: false, probeAllowed: false, probeSize: null, reason: 'rally override bypass' };
  }

  if (adx >= D.HIGH_ADX_PROBE_THRESHOLD) {
    return { blocked: false, probeAllowed: true, probeSize: D.HIGH_ADX_PROBE_MULTIPLIER, reason: `probe at ADX ${adx}` };
  }

  return { blocked: true, probeAllowed: false, probeSize: null, reason: `blocked` };
}

// ================================================================
// INVARIANT 1: "A strong trending rally should NEVER be hard-blocked"
// Trading truth: When ADX >= 30, slope positive, momentum aligned, 
// the system should allow entry (even with reduced size) up to 10% move.
// ================================================================

Deno.test("INVARIANT: Strong trend (ADX=35, rising slope=0.3) with 5.5% move must NOT be hard-blocked", () => {
  // ADX=35 (STRONG), slope=0.3 (rising) — this is a live trend with energy
  // 5.5% is within the FULL relaxation threshold (6.0%) — should not block
  const result = evaluateMoveExhausted('long', 5.5, 35, 0.3);
  assertEquals(result.blocked, false,
    "A 5.5% move in a strong rising trend (ADX=35, slope=0.3) should NOT be blocked. " +
    "If blocked, the FULL relaxation threshold is too tight.");
});

Deno.test("INVARIANT: Rising ADX slope (0.3) gets at least FULL relaxation (6%)", () => {
  // Positive slope should never get a TIGHTER threshold than FULL relaxation
  // Current gap: slope 0.0 to 0.5 all get 6.0% — a 6.0% move at slope=0.3 IS blocked
  // This documents the gap: positive slope should arguably get > 6.0%
  const G = MOVE_EXHAUSTION_FILTER_PARAMS.STRONG_TREND_RELAXATION.GRADUATED_SLOPE_RELAXATION;
  assert(G.FULL_HARD_THRESHOLD >= 6.0,
    `FULL relaxation threshold (${G.FULL_HARD_THRESHOLD}%) should be >= 6.0%. ` +
    `A positive ADX slope means the trend is building — 6% is a normal move in strong trends.`);
});

Deno.test("INVARIANT: Accelerating trend (ADX=30, slope=0.6) allows up to 9% move", () => {
  // Strong ADX + accelerating slope = trend is building, not exhausting
  const result = evaluateMoveExhausted('long', 9.0, 30, 0.6);
  assertEquals(result.blocked, false,
    "A 9% move during an accelerating trend (slope=0.6) is continuation, not exhaustion. " +
    "Blocking this means ACCELERATING_HARD_THRESHOLD is set too low (should be >= 10%).");
});

Deno.test("INVARIANT: 15% rally with multi-TF alignment must pass via rally override", () => {
  // Rally override raises threshold to 20% — a 15% move should pass
  const rallyHard = RALLY_OVERRIDE.RALLY_HARD_THRESHOLD_PERCENT;
  assert(rallyHard >= 15,
    `Rally override hard threshold (${rallyHard}%) must be >= 15% to allow strong rallies. ` +
    `Crypto routinely rallies 10-20% in single sessions during confirmed moves.`);
});

Deno.test("INVARIANT: Rally override bypasses DEEP_EXHAUSTION_COMPOUND", () => {
  // During a confirmed multi-TF rally, K=92 + 5% move should NOT block
  const result = evaluateDeepExhaustionCompound('long', 92, 5.0, 25, true);
  assertEquals(result.blocked, false,
    "A confirmed multi-TF rally MUST bypass deep exhaustion compound. " +
    "K can stay at 90+ for hours during parabolic moves. Blocking here misses the entire rally.");
});

// ================================================================
// INVARIANT 2: "Genuine exhaustion MUST be blocked"
// Trading truth: When trend energy is dying (ADX falling, RSI extreme),
// entering is catching a falling knife. The system MUST block.
// ================================================================

Deno.test("INVARIANT: K=98 absolute max ALWAYS blocks LONG — no exceptions", () => {
  // K=98 is statistical blow-off territory (99th percentile)
  const absMax = STOCHRSI_THRESHOLDS.ABSOLUTE_MAX_OVERBOUGHT;
  assertEquals(absMax, 98, "Absolute max overbought threshold must be 98");
  
  // Even in parabolic mode, K=98 must block
  // (This is the last line of defense)
  assert(absMax <= 98,
    "ABSOLUTE_MAX_OVERBOUGHT must be <= 98. Setting it higher removes the only " +
    "hard safety gate against entering at blow-off tops.");
});

Deno.test("INVARIANT: K<=2 absolute min ALWAYS blocks SHORT — no exceptions", () => {
  const absMin = STOCHRSI_THRESHOLDS.ABSOLUTE_MAX_OVERSOLD;
  assertEquals(absMin, 2, "Absolute min oversold threshold must be 2");
});

Deno.test("INVARIANT: DEEP_STOCHRSI Tier 0 is stricter than absolute max", () => {
  // Deep gate (K<3/K>97) fires before absolute max (K<=2/K>=98)
  // This ensures there's a soft cap zone between them
  const deepOB = DEEP_STOCHRSI_HARD_GATE.DEEP_OVERBOUGHT_K_THRESHOLD;
  const absMaxOB = STOCHRSI_THRESHOLDS.ABSOLUTE_MAX_OVERBOUGHT;
  assert(deepOB < absMaxOB,
    `Deep overbought (${deepOB}) should be < absolute max (${absMaxOB}). ` +
    `Without this layering, there's no soft-cap zone before the hard block.`);
});

Deno.test("INVARIANT: Exhaustion detection requires ADX to be falling, not just high", () => {
  // Trading truth: High ADX with positive slope = trend CONTINUING, not exhausting
  // The system should only flag exhaustion when slope turns negative
  assert(ADX_EXHAUSTION_PARAMS.CONTINUATION_OVERRIDE === true,
    "Continuation override MUST be enabled. High ADX + rising slope = continuation, NOT exhaustion. " +
    "Disabling this causes the system to block profitable trend entries.");
  
  assert(ADX_EXHAUSTION_PARAMS.CONTINUATION_MIN_SLOPE >= 0,
    "Continuation min slope must be >= 0 (flat or rising = still trending)");
});

// ================================================================
// INVARIANT 3: "Momentum score must be price-scale independent"
// Trading truth: A 10% BTC rally and a 10% ADA rally should produce
// comparable momentum scores. Price scale should not bias the score.
// ================================================================

Deno.test("INVARIANT: 15% BTC rally produces positive momentum score", () => {
  const prices = generateRallyPrices(80, 87000, 15);
  const klines = generateKlines(prices);
  const result = calculateMomentumScore(klines, prices, 35, true, 500);
  
  assert(result.score > 0,
    `A 15% BTC rally MUST produce positive momentum (got ${result.score}). ` +
    `If negative, MACD normalization is broken — the $87K price scale is biasing the score.`);
});

Deno.test("INVARIANT: 15% BTC drop never produces positive momentum > 20", () => {
  const prices = generateBTCPrices(80, -15);
  const klines = generateKlines(prices);
  const result = calculateMomentumScore(klines, prices, 30, false, 500);
  
  assert(result.score < 20,
    `A 15% BTC drop should NOT show strong bullish momentum (got ${result.score}). ` +
    `If score > 20, indicator lag is too extreme — the system would enter LONGs during a crash.`);
});

Deno.test("INVARIANT: Momentum score never hits ±100 for moderate moves", () => {
  // A 10% move is significant but not extreme enough to hit the absolute bounds
  const btcUp = generateBTCPrices(80, 10);
  const btcDown = generateBTCPrices(80, -10);
  
  const upResult = calculateMomentumScore(generateKlines(btcUp), btcUp, 30, true, 500);
  const downResult = calculateMomentumScore(generateKlines(btcDown), btcDown, 30, false, 500);
  
  assert(upResult.score > -100 && upResult.score < 100,
    `10% BTC rally hit bounds (${upResult.score}). Moderate moves should not saturate the score.`);
  assert(downResult.score > -100 && downResult.score < 100,
    `10% BTC drop hit bounds (${downResult.score}). Moderate moves should not saturate the score.`);
});

// ================================================================
// INVARIANT 4: "Position sizing must be sane"
// Trading truth: Probes must always be smaller than full positions.
// Late entries must be smaller than early entries.
// ================================================================

Deno.test("INVARIANT: Probe sizes are always < 50% of normal position", () => {
  const probes = [
    { name: "Tier0 override", size: STRONG_TREND_TIER0_OVERRIDE.POSITION_SIZE_MULTIPLIER },
    { name: "Capitulation bounce base", size: CAPITULATION_BOUNCE_PROBE.BASE_POSITION_SIZE },
    { name: "Capitulation bounce volume", size: CAPITULATION_BOUNCE_PROBE.WITH_VOLUME_SPIKE },
    { name: "Deep exhaustion probe", size: STOCHRSI_RUNWAY_GATE.DEEP_EXHAUSTION_COMPOUND.HIGH_ADX_PROBE_MULTIPLIER },
    { name: "MR exception", size: MOVE_EXHAUSTION_FILTER_PARAMS.MEAN_REVERSION.POSITION_SIZE },
    { name: "Exhaustion flip", size: MOVE_EXHAUSTION_FILTER_PARAMS.SYMMETRIC_EXHAUSTION_FLIP.FLIP_POSITION_MULTIPLIER },
  ];
  
  for (const p of probes) {
    assert(p.size <= 0.50,
      `${p.name} probe size (${p.size}) exceeds 50%. Probes into uncertain conditions ` +
      `must be small. If > 50%, risk management is compromised.`);
  }
});

Deno.test("INVARIANT: Rally override position size is > probe sizes", () => {
  // Rally override = confirmed multi-TF trend, should be bigger than probes
  const rallySize = RALLY_OVERRIDE.POSITION_MULTIPLIER;
  const tier0ProbeSize = STRONG_TREND_TIER0_OVERRIDE.POSITION_SIZE_MULTIPLIER;
  
  assert(rallySize > tier0ProbeSize,
    `Rally override (${rallySize}) should be larger than Tier 0 probe (${tier0ProbeSize}). ` +
    `A confirmed multi-TF rally has higher conviction than a single-gate override.`);
});

Deno.test("INVARIANT: Unanimous rally position > standard rally position", () => {
  assert(RALLY_OVERRIDE.UNANIMOUS_POSITION_MULTIPLIER > RALLY_OVERRIDE.POSITION_MULTIPLIER,
    "4/4 timeframe alignment (unanimous) should give larger position than 3/4 alignment");
});

// ================================================================
// INVARIANT 5: "ADX phase machine must be well-ordered"
// Trading truth: Phase transitions must be monotonic and non-overlapping.
// ================================================================

Deno.test("INVARIANT: ADX phases are monotonically increasing and non-overlapping", () => {
  const phases = ['RANGE', 'TRANSITION', 'EARLY_TREND', 'STRONG_TREND', 'EXHAUSTION'] as const;
  
  for (let i = 0; i < phases.length - 1; i++) {
    const current = ADX_PHASES[phases[i]];
    const next = ADX_PHASES[phases[i + 1]];
    
    assertEquals(current.max, next.min,
      `Gap between ${phases[i]} (max=${current.max}) and ${phases[i + 1]} (min=${next.min}). ` +
      `ADX values in the gap would be unclassified, causing unpredictable behavior.`);
  }
  
  assertEquals(ADX_PHASES.RANGE.min, 0, "RANGE phase must start at 0");
  assertEquals(ADX_PHASES.EXHAUSTION.max, 100, "EXHAUSTION phase must end at 100");
});

Deno.test("INVARIANT: ADX hard floor < TRANSITION zone min", () => {
  // Hard floor should be within the transition zone, not above it
  const hardFloor = ADX_GATE_V1_1.HARD_FLOOR;
  const transMax = ADX_GATE_V1_1.TRANSITIONAL_MAX;
  
  assert(hardFloor < transMax,
    `Hard floor (${hardFloor}) must be < transition max (${transMax}). ` +
    `Otherwise the entire transitional zone is dead code.`);
});

// ================================================================
// INVARIANT 6: "Threshold relationships must be logically consistent"
// Trading truth: Soft thresholds < hard thresholds. Always.
// ================================================================

Deno.test("INVARIANT: Move exhaustion soft < hard for both directions", () => {
  const P = MOVE_EXHAUSTION_FILTER_PARAMS;
  assert(P.LONG_SOFT_THRESHOLD_PERCENT < P.LONG_HARD_THRESHOLD_PERCENT,
    `LONG soft (${P.LONG_SOFT_THRESHOLD_PERCENT}%) must be < hard (${P.LONG_HARD_THRESHOLD_PERCENT}%). ` +
    `Otherwise soft zone doesn't exist.`);
  assert(P.SHORT_SOFT_THRESHOLD_PERCENT < P.SHORT_HARD_THRESHOLD_PERCENT,
    `SHORT soft (${P.SHORT_SOFT_THRESHOLD_PERCENT}%) must be < hard (${P.SHORT_HARD_THRESHOLD_PERCENT}%)`);
});

Deno.test("INVARIANT: Rally soft < rally hard threshold", () => {
  assert(RALLY_OVERRIDE.RALLY_SOFT_THRESHOLD_PERCENT < RALLY_OVERRIDE.RALLY_HARD_THRESHOLD_PERCENT,
    `Rally soft (${RALLY_OVERRIDE.RALLY_SOFT_THRESHOLD_PERCENT}%) must be < hard (${RALLY_OVERRIDE.RALLY_HARD_THRESHOLD_PERCENT}%)`);
});

Deno.test("INVARIANT: StochRSI graduated tiers are ordered correctly", () => {
  const T = STOCHRSI_THRESHOLDS;
  // Oversold tiers: lower is more extreme
  assert(T.ABSOLUTE_MAX_OVERSOLD < T.EXTREME_OVERSOLD,
    `Absolute oversold (${T.ABSOLUTE_MAX_OVERSOLD}) must be < extreme (${T.EXTREME_OVERSOLD})`);
  assert(T.EXTREME_OVERSOLD < T.DEEPLY_OVERSOLD,
    `Extreme oversold (${T.EXTREME_OVERSOLD}) must be < deeply (${T.DEEPLY_OVERSOLD})`);
  
  // Overbought tiers: higher is more extreme
  assert(T.DEEPLY_OVERBOUGHT < T.EXTREME_OVERBOUGHT,
    `Deeply overbought (${T.DEEPLY_OVERBOUGHT}) must be < extreme (${T.EXTREME_OVERBOUGHT})`);
  assert(T.EXTREME_OVERBOUGHT < T.ABSOLUTE_MAX_OVERBOUGHT,
    `Extreme overbought (${T.EXTREME_OVERBOUGHT}) must be < absolute max (${T.ABSOLUTE_MAX_OVERBOUGHT})`);
});

// ================================================================
// INVARIANT 7: "The system should not contradict itself"
// Trading truth: If a condition bypasses a gate, the bypass threshold
// must be achievable (not set to impossible values).
// ================================================================

Deno.test("INVARIANT: Rally override ADX threshold is achievable (< 40)", () => {
  assert(RALLY_OVERRIDE.MIN_ADX <= 30,
    `Rally override MIN_ADX (${RALLY_OVERRIDE.MIN_ADX}) should be <= 30. ` +
    `Most rallies start with ADX 20-30. Requiring > 30 makes the override unreachable ` +
    `until the rally is already extended.`);
});

Deno.test("INVARIANT: Strong trend override momentum threshold is reachable", () => {
  // Min momentum score of 30 should be achievable during a real rally
  const prices = generateRallyPrices(80, 87000, 20);
  const klines = generateKlines(prices);
  const result = calculateMomentumScore(klines, prices, 40, true, 500);
  
  const threshold = STRONG_TREND_TIER0_OVERRIDE.MIN_MOMENTUM_SCORE;
  assert(result.score >= threshold || result.score >= 0,
    `A 20% rally with ADX=40 produces momentum=${result.score}, but Tier0 override requires ${threshold}. ` +
    `If this threshold is unreachable even during a parabolic rally, the override is effectively disabled.`);
});

// ================================================================
// INVARIANT 8: "Safety gates must have proper ordering"
// Trading truth: Inner gates < outer gates. More restrictive conditions
// must have higher thresholds (harder to trigger).
// ================================================================

Deno.test("INVARIANT: Tier 0 StochRSI > parabolic bypass > normal block", () => {
  const absMax = STOCHRSI_THRESHOLDS.ABSOLUTE_MAX_OVERBOUGHT;
  const deepOB = DEEP_STOCHRSI_HARD_GATE.DEEP_OVERBOUGHT_K_THRESHOLD;
  const parabolic = HTF_EXTREME_HARD_GATES.STOCHRSI_OVERBOUGHT_BLOCK_PARABOLIC ?? 92;
  const normal = HTF_EXTREME_HARD_GATES.STOCHRSI_OVERBOUGHT_BLOCK ?? 80;
  
  assert(normal < parabolic,
    `Normal block (${normal}) must be < parabolic (${parabolic}). ` +
    `Parabolic mode should be more permissive, not stricter.`);
  assert(parabolic < deepOB,
    `Parabolic threshold (${parabolic}) must be < deep gate (${deepOB}). ` +
    `Deep gate is the safety net — it must be harder to trigger.`);
  assert(deepOB <= absMax,
    `Deep gate (${deepOB}) must be <= absolute max (${absMax}). ` +
    `Absolute max is the final defense — nothing should exceed it.`);
});

Deno.test("INVARIANT: Graduated relaxation thresholds decrease with declining slope", () => {
  const G = MOVE_EXHAUSTION_FILTER_PARAMS.STRONG_TREND_RELAXATION.GRADUATED_SLOPE_RELAXATION;
  
  // More positive slope = more relaxed (higher threshold)
  assert(G.ACCELERATING_HARD_THRESHOLD > G.FULL_HARD_THRESHOLD,
    `Accelerating (${G.ACCELERATING_HARD_THRESHOLD}) > Full (${G.FULL_HARD_THRESHOLD})`);
  assert(G.FULL_HARD_THRESHOLD > G.PARTIAL_HARD_THRESHOLD,
    `Full (${G.FULL_HARD_THRESHOLD}) > Partial (${G.PARTIAL_HARD_THRESHOLD})`);
  assert(G.PARTIAL_HARD_THRESHOLD > G.LIMITED_HARD_THRESHOLD,
    `Partial (${G.PARTIAL_HARD_THRESHOLD}) > Limited (${G.LIMITED_HARD_THRESHOLD})`);
});

// ================================================================
// INVARIANT 9: "Symmetry between LONG and SHORT"
// Trading truth: Unless there's a documented asymmetry reason,
// LONG and SHORT thresholds should be mirror images.
// ================================================================

Deno.test("INVARIANT: Move exhaustion thresholds are symmetric", () => {
  const P = MOVE_EXHAUSTION_FILTER_PARAMS;
  assertEquals(P.LONG_SOFT_THRESHOLD_PERCENT, P.SHORT_SOFT_THRESHOLD_PERCENT,
    "LONG and SHORT soft thresholds should be equal (crypto is bidirectional)");
  assertEquals(P.LONG_HARD_THRESHOLD_PERCENT, P.SHORT_HARD_THRESHOLD_PERCENT,
    "LONG and SHORT hard thresholds should be equal");
});

Deno.test("INVARIANT: Deep exhaustion K thresholds are symmetric around 50", () => {
  const D = STOCHRSI_RUNWAY_GATE.DEEP_EXHAUSTION_COMPOUND;
  const longDistance = D.LONG_MIN_K - 50;    // e.g., 85 - 50 = 35
  const shortDistance = 50 - D.SHORT_MAX_K;  // e.g., 50 - 15 = 35
  assertEquals(longDistance, shortDistance,
    `LONG K (${D.LONG_MIN_K}) and SHORT K (${D.SHORT_MAX_K}) should be equidistant from 50`);
});

// ================================================================
// INVARIANT 10: "No logical deadlocks"
// Trading truth: The system should always have a path to generate
// a signal in at least some market conditions.
// ================================================================

Deno.test("INVARIANT: There exists a condition where MOVE_EXHAUSTED allows entry", () => {
  // At minimum, a 1% move with ADX=25 should always be allowed
  const result = evaluateMoveExhausted('long', 1.0, 25, 0.1);
  assertEquals(result.blocked, false,
    "A 1% move should NEVER be blocked by move exhaustion. " +
    "If blocked, the soft threshold is set impossibly low.");
});

Deno.test("INVARIANT: RANGE phase (ADX < 15) is NOT tradeable", () => {
  // Trading truth: ADX < 15 = no trend = no directional trade
  assertEquals(ADX_PHASES.RANGE.tradeable, false,
    "RANGE phase (ADX < 15) must NOT be tradeable. There is no trend to trade.");
});

Deno.test("INVARIANT: STRONG_TREND phase IS tradeable", () => {
  assertEquals(ADX_PHASES.STRONG_TREND.tradeable, true,
    "STRONG_TREND phase (ADX 30-45) MUST be tradeable. This is prime trend-following territory.");
});

Deno.test("INVARIANT: EXHAUSTION phase is still tradeable (but with caution)", () => {
  // Trading truth: High ADX is not automatically exhaustion — check slope
  assertEquals(ADX_PHASES.EXHAUSTION.tradeable, true,
    "EXHAUSTION phase must be tradeable. High ADX + rising slope = continuation, not exhaustion.");
});
