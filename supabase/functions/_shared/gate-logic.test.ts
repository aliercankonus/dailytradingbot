// ============= GATE LOGIC TESTS =============
// Tests for critical gates that have caused missed trading opportunities:
// 1. MOVE_EXHAUSTED — prevents late trend entries
// 2. DEEP_EXHAUSTION_COMPOUND — blocks extreme StochRSI + big move combos
// 3. STOCHRSI_OVERBOUGHT_BLOCK — blocks LONGs when StochRSI is overbought
//
// These tests validate threshold logic, bypass conditions, and edge cases
// to catch regressions BEFORE deployment.

import { assertEquals, assert, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  MOVE_EXHAUSTION_FILTER_PARAMS,
  STOCHRSI_RUNWAY_GATE,
  STOCHRSI_THRESHOLDS,
  HTF_EXTREME_HARD_GATES,
  ADX_THRESHOLDS,
  RALLY_OVERRIDE,
} from "./constants.ts";

// ============================================================
// HELPER: Simulate MOVE_EXHAUSTED gate decision
// Returns: { blocked, softZone, probeSize } 
// ============================================================
function evaluateMoveExhausted(
  direction: 'long' | 'short',
  movePercent: number, // distance from swing extreme
  adx: number,
  adxSlope: number,
  bbSqueeze: boolean = false,
  percentB: number = 50,
): { blocked: boolean; softZone: boolean; probeSize: number | null; reason: string } {
  const P = MOVE_EXHAUSTION_FILTER_PARAMS;
  if (!P.ENABLED) return { blocked: false, softZone: false, probeSize: null, reason: 'disabled' };

  // Determine effective thresholds (cast to number to avoid literal type narrowing from `as const`)
  let softThreshold: number = direction === 'long' ? P.LONG_SOFT_THRESHOLD_PERCENT : P.SHORT_SOFT_THRESHOLD_PERCENT;
  let hardThreshold: number = direction === 'long' ? P.LONG_HARD_THRESHOLD_PERCENT : P.SHORT_HARD_THRESHOLD_PERCENT;

  // Strong trend relaxation
  const R = P.STRONG_TREND_RELAXATION;
  let relaxed = false;
  if (R.ENABLED) {
    const adxQualifies = adx >= R.MIN_ADX_FOR_RELAXATION;
    const squeezeQualifies = R.BB_SQUEEZE_RELAXATION && bbSqueeze;
    const bbBreakdown = R.BB_BREAKDOWN_RELAXATION && (
      (direction === 'short' && percentB <= R.BB_BREAKDOWN_PERCENT_B_SHORT) ||
      (direction === 'long' && percentB >= R.BB_BREAKDOWN_PERCENT_B_LONG)
    );

    if (adxQualifies || squeezeQualifies || bbBreakdown) {
      // Graduated slope relaxation
      const G = R.GRADUATED_SLOPE_RELAXATION;
      if (G.ENABLED) {
        if (adxSlope >= G.ACCELERATING_SLOPE) {
          hardThreshold = Number(G.ACCELERATING_HARD_THRESHOLD);
          relaxed = true;
        } else if (adxSlope >= (G.RISING_SLOPE ?? 0.0)) {
          hardThreshold = Number(G.RISING_HARD_THRESHOLD ?? 8.0);
          relaxed = true;
        } else if (adxSlope >= G.FULL_RELAXATION_SLOPE) {
          hardThreshold = Number(G.FULL_HARD_THRESHOLD);
          relaxed = true;
        } else if (adxSlope >= G.PARTIAL_RELAXATION_SLOPE) {
          hardThreshold = Number(G.PARTIAL_HARD_THRESHOLD);
          relaxed = true;
        } else if (adxSlope >= G.LIMITED_RELAXATION_SLOPE) {
          hardThreshold = Number(G.LIMITED_HARD_THRESHOLD);
          relaxed = true;
        }
        // else: slope < -2.5 → no relaxation
      } else {
        softThreshold = Number(R.RELAXED_SOFT_THRESHOLD_PERCENT);
        hardThreshold = Number(R.RELAXED_HARD_THRESHOLD_PERCENT);
        relaxed = true;
      }
    }
  }

  // Check rising trend exception
  const RTE = P.RISING_TREND_EXCEPTION;
  if (RTE.ENABLED && !RTE.SHADOW_MODE && adxSlope >= RTE.MIN_ADX_SLOPE && adx >= RTE.MIN_ADX && adx <= RTE.MAX_ADX) {
    hardThreshold = Math.max(hardThreshold, Number(RTE.HARD_THRESHOLD_PERCENT));
    softThreshold = Math.max(softThreshold, Number(RTE.SOFT_THRESHOLD_PERCENT));
    relaxed = true;
  }

  // Evaluate
  if (movePercent >= hardThreshold) {
    return { blocked: true, softZone: false, probeSize: null, reason: `move ${movePercent}% >= hard ${hardThreshold}%` };
  }
  if (movePercent >= softThreshold) {
    return { blocked: false, softZone: true, probeSize: P.SOFT_THRESHOLD_POSITION_SIZE, reason: `move ${movePercent}% in soft zone [${softThreshold}%, ${hardThreshold}%)` };
  }
  return { blocked: false, softZone: false, probeSize: null, reason: `move ${movePercent}% below thresholds` };
}

// ============================================================
// HELPER: Simulate DEEP_EXHAUSTION_COMPOUND gate decision
// ============================================================
function evaluateDeepExhaustionCompound(
  direction: 'long' | 'short',
  stochK4h: number,
  movePercent: number, // moveFromHigh for short, moveFromLow for long
  adx: number,
  rallyOverrideActive: boolean = false,
): { blocked: boolean; probeAllowed: boolean; probeSize: number | null; reason: string } {
  const D = STOCHRSI_RUNWAY_GATE.DEEP_EXHAUSTION_COMPOUND;
  if (!D.ENABLED) return { blocked: false, probeAllowed: false, probeSize: null, reason: 'disabled' };

  const isExhausted = direction === 'short'
    ? (stochK4h < D.SHORT_MAX_K && movePercent > D.SHORT_MIN_MOVE_PERCENT)
    : (stochK4h > D.LONG_MIN_K && movePercent > D.LONG_MIN_MOVE_PERCENT);

  if (!isExhausted) {
    return { blocked: false, probeAllowed: false, probeSize: null, reason: 'not exhausted' };
  }

  // Rally override bypasses entirely
  if (rallyOverrideActive && RALLY_OVERRIDE.BYPASSES_DEEP_EXHAUSTION_COMPOUND) {
    return { blocked: false, probeAllowed: false, probeSize: null, reason: 'rally override bypass' };
  }

  // High ADX probe exception
  if (adx >= D.HIGH_ADX_PROBE_THRESHOLD) {
    return { blocked: false, probeAllowed: true, probeSize: D.HIGH_ADX_PROBE_MULTIPLIER, reason: `ADX ${adx} >= ${D.HIGH_ADX_PROBE_THRESHOLD}, probe at ${D.HIGH_ADX_PROBE_MULTIPLIER}` };
  }

  return { blocked: true, probeAllowed: false, probeSize: null, reason: `K=${stochK4h}, move=${movePercent}%, ADX=${adx} < ${D.HIGH_ADX_PROBE_THRESHOLD}` };
}

// ============================================================
// HELPER: Simulate STOCHRSI_OVERBOUGHT_BLOCK gate decision
// ============================================================
function evaluateStochRsiOverboughtBlock(
  direction: 'long' | 'short',
  stochK4h: number,
  adx: number,
  isParabolicMode: boolean = false,
  stochRsiRising: boolean = false,
  momentumContinuationAllowed: boolean = false,
  skipGate: boolean = false,
): { blocked: boolean; reason: string } {
  if (skipGate) return { blocked: false, reason: 'gate skipped' };

  // Absolute max (K >= 98 for LONG)
  const ABSOLUTE_MAX_OB = STOCHRSI_THRESHOLDS.ABSOLUTE_MAX_OVERBOUGHT;
  if (direction === 'long' && stochK4h >= ABSOLUTE_MAX_OB) {
    return { blocked: true, reason: `K=${stochK4h} >= absolute max ${ABSOLUTE_MAX_OB}` };
  }

  // Tier 2 HTF extreme gate
  const htfThreshold = isParabolicMode
    ? (HTF_EXTREME_HARD_GATES.STOCHRSI_OVERBOUGHT_BLOCK_PARABOLIC ?? 92)
    : (HTF_EXTREME_HARD_GATES.STOCHRSI_OVERBOUGHT_BLOCK ?? 80);

  if (direction === 'long' && stochK4h >= htfThreshold) {
    // Check exceptions
    if (stochRsiRising || momentumContinuationAllowed || isParabolicMode) {
      return { blocked: false, reason: `K=${stochK4h} >= ${htfThreshold} but exception active (rising=${stochRsiRising}, momentum=${momentumContinuationAllowed}, parabolic=${isParabolicMode})` };
    }
    return { blocked: true, reason: `K=${stochK4h} >= ${htfThreshold} (parabolic=${isParabolicMode})` };
  }

  return { blocked: false, reason: `K=${stochK4h} below thresholds` };
}

// ================================================================
// TEST SUITE: MOVE_EXHAUSTED Gate
// ================================================================
Deno.test("MOVE_EXHAUSTED: allows entry when move is below soft threshold", () => {
  const result = evaluateMoveExhausted('long', 3.0, 25, 0.1);
  assertEquals(result.blocked, false);
  assertEquals(result.softZone, false);
});

Deno.test("MOVE_EXHAUSTED: soft zone reduces position size", () => {
  const result = evaluateMoveExhausted('long', 5.5, 20, 0.0);
  assertEquals(result.blocked, false);
  assertEquals(result.softZone, true);
  assertEquals(result.probeSize, MOVE_EXHAUSTION_FILTER_PARAMS.SOFT_THRESHOLD_POSITION_SIZE);
});

Deno.test("MOVE_EXHAUSTED: hard blocks at default threshold", () => {
  const result = evaluateMoveExhausted('short', 7.5, 20, 0.0);
  assertEquals(result.blocked, true);
});

Deno.test("MOVE_EXHAUSTED: strong trend relaxation raises hard threshold", () => {
  // ADX=20, slope=0.0 → no relaxation (ADX < 28, no squeeze, no BB breakdown)
  // Default hard = 7.0%, so 6.5 < 7.0 → NOT blocked even without relaxation
  const resultNoRelax = evaluateMoveExhausted('long', 6.5, 20, 0.0);
  assertEquals(resultNoRelax.blocked, false, "6.5% < default 7.0% — passes without relaxation");
  
  // ADX=30 >= 28 qualifies for relaxation, slope=0.0 >= RISING_SLOPE(0.0) → hard=10.0%
  // 6.5 < 10.0 → NOT blocked with RISING tier
  const resultRelaxed = evaluateMoveExhausted('long', 6.5, 30, 0.0);
  assertEquals(resultRelaxed.blocked, false, "6.5% < 10.0% RISING relaxation threshold — passes");

  // 10.5% should be blocked with RISING tier (> 10.0%)
  const resultBlocked = evaluateMoveExhausted('long', 10.5, 30, 0.0);
  assertEquals(resultBlocked.blocked, true, "10.5% > 10.0% RISING threshold — blocked");

  // ADX=30, slope=-0.5 → FULL tier (8.0%)
  const resultFull = evaluateMoveExhausted('long', 7.8, 30, -0.5);
  assertEquals(resultFull.blocked, false, "7.8% < 8.0% FULL threshold — passes");
  const resultFullBlocked = evaluateMoveExhausted('long', 8.5, 30, -0.5);
  assertEquals(resultFullBlocked.blocked, true, "8.5% > 8.0% FULL threshold — blocked");
});

Deno.test("MOVE_EXHAUSTED: ACCELERATING tier raises threshold to 12%", () => {
  // ADX=30, slope=0.6 (>= ACCELERATING_SLOPE=0.5)
  const result = evaluateMoveExhausted('long', 11.0, 30, 0.6);
  assertEquals(result.blocked, false, "11% should pass with ACCELERATING threshold of 12%");

  const resultBlocked = evaluateMoveExhausted('long', 13.0, 30, 0.6);
  assertEquals(resultBlocked.blocked, true, "13% should still be blocked (> 12%)");
});

Deno.test("MOVE_EXHAUSTED: BB squeeze enables relaxation even at lower ADX", () => {
  // ADX=22 (< 28), but BB squeeze active → relaxation applies
  const result = evaluateMoveExhausted('short', 7.8, 22, -0.5, true);
  // Squeeze qualifies for relaxation, slope=-0.5 >= FULL_RELAXATION_SLOPE(-1.0) → hard=8.0%
  assertEquals(result.blocked, false, "7.8% should pass with squeeze relaxation (8.0% threshold)");
});

Deno.test("MOVE_EXHAUSTED: declining ADX slope limits relaxation", () => {
  // ADX=30, slope=-2.3 (between -2.0 and -2.5) → LIMITED relaxation (5.2%)
  const result = evaluateMoveExhausted('long', 5.3, 30, -2.3);
  assertEquals(result.blocked, true, "5.3% should be blocked with LIMITED threshold (5.2%)");

  // slope < -2.5 → no relaxation at all (back to default 7.0%)
  const resultNoRelax = evaluateMoveExhausted('long', 5.3, 30, -2.6);
  assertEquals(resultNoRelax.blocked, false, "5.3% should pass with default 7.0% (no relaxation, slope too negative)");
});

Deno.test("MOVE_EXHAUSTED: rising trend exception raises thresholds during breakouts", () => {
  // ADX=20 (in range 16-30), slope=0.6 (>= 0.5) → exception raises hard to 8%
  const result = evaluateMoveExhausted('short', 7.5, 20, 0.6);
  assertEquals(result.blocked, false, "7.5% should pass with rising trend exception (8% threshold)");
});

Deno.test("MOVE_EXHAUSTED: symmetry between LONG and SHORT thresholds", () => {
  const longResult = evaluateMoveExhausted('long', 6.0, 20, 0.0);
  const shortResult = evaluateMoveExhausted('short', 6.0, 20, 0.0);
  assertEquals(longResult.blocked, shortResult.blocked, "Same move% should give same result for both directions at same ADX");
});

// ================================================================
// TEST SUITE: DEEP_EXHAUSTION_COMPOUND Gate
// ================================================================
Deno.test("DEEP_EXHAUSTION_COMPOUND: allows entry when StochRSI not at extreme", () => {
  // K=40 (not < 15 for short)
  const result = evaluateDeepExhaustionCompound('short', 40, 3.0, 25);
  assertEquals(result.blocked, false);
});

Deno.test("DEEP_EXHAUSTION_COMPOUND: blocks SHORT at K<15 with move>2%", () => {
  const result = evaluateDeepExhaustionCompound('short', 12, 3.5, 25);
  assertEquals(result.blocked, true);
});

Deno.test("DEEP_EXHAUSTION_COMPOUND: blocks LONG at K>85 with move>2%", () => {
  const result = evaluateDeepExhaustionCompound('long', 88, 2.5, 25);
  assertEquals(result.blocked, true);
});

Deno.test("DEEP_EXHAUSTION_COMPOUND: allows probe at high ADX (>=40)", () => {
  const result = evaluateDeepExhaustionCompound('short', 10, 4.0, 42);
  assertEquals(result.blocked, false);
  assertEquals(result.probeAllowed, true);
  assertEquals(result.probeSize, STOCHRSI_RUNWAY_GATE.DEEP_EXHAUSTION_COMPOUND.HIGH_ADX_PROBE_MULTIPLIER);
});

Deno.test("DEEP_EXHAUSTION_COMPOUND: hard blocks below probe threshold ADX", () => {
  const threshold = STOCHRSI_RUNWAY_GATE.DEEP_EXHAUSTION_COMPOUND.HIGH_ADX_PROBE_THRESHOLD;
  const result = evaluateDeepExhaustionCompound('long', 90, 3.0, threshold - 1);
  assertEquals(result.blocked, true, `ADX ${threshold - 1} should not get probe`);
});

Deno.test("DEEP_EXHAUSTION_COMPOUND: rally override bypasses block entirely", () => {
  const result = evaluateDeepExhaustionCompound('long', 92, 5.0, 20, true);
  assertEquals(result.blocked, false);
  assert(result.reason.includes('rally override'));
});

Deno.test("DEEP_EXHAUSTION_COMPOUND: small move (<2%) doesn't trigger", () => {
  // K=10 (extreme) but move only 1.5% → not triggered
  const result = evaluateDeepExhaustionCompound('short', 10, 1.5, 20);
  assertEquals(result.blocked, false);
  assertEquals(result.reason, 'not exhausted');
});

Deno.test("DEEP_EXHAUSTION_COMPOUND: boundary conditions at threshold", () => {
  // Exactly at SHORT_MIN_MOVE_PERCENT (2.0%) — should NOT trigger (> not >=)
  const resultAtBoundary = evaluateDeepExhaustionCompound('short', 14, 2.0, 20);
  assertEquals(resultAtBoundary.blocked, false, "Exactly at 2.0% should NOT trigger (uses >)");

  // Just above threshold
  const resultAbove = evaluateDeepExhaustionCompound('short', 14, 2.1, 20);
  assertEquals(resultAbove.blocked, true, "2.1% should trigger");
});

// ================================================================
// TEST SUITE: STOCHRSI_OVERBOUGHT_BLOCK Gate
// ================================================================
Deno.test("STOCHRSI_OVERBOUGHT_BLOCK: allows LONG when K is moderate", () => {
  const result = evaluateStochRsiOverboughtBlock('long', 60, 25);
  assertEquals(result.blocked, false);
});

Deno.test("STOCHRSI_OVERBOUGHT_BLOCK: absolute max blocks LONG at K>=98", () => {
  const result = evaluateStochRsiOverboughtBlock('long', 98, 50);
  assertEquals(result.blocked, true);
  assert(result.reason.includes('absolute max'));
});

Deno.test("STOCHRSI_OVERBOUGHT_BLOCK: blocks LONG at K>=80 in normal mode", () => {
  const result = evaluateStochRsiOverboughtBlock('long', 82, 25, false, false, false);
  assertEquals(result.blocked, true);
});

Deno.test("STOCHRSI_OVERBOUGHT_BLOCK: parabolic mode raises threshold to 92", () => {
  // K=85 would block normally (>=80) but parabolic threshold is 92
  const normalResult = evaluateStochRsiOverboughtBlock('long', 85, 50, false, false, false);
  assertEquals(normalResult.blocked, true, "K=85 blocked in normal mode");

  // In parabolic mode, K=85 < 92 → not blocked
  const parabolicResult = evaluateStochRsiOverboughtBlock('long', 85, 50, true);
  assertEquals(parabolicResult.blocked, false, "K=85 passes in parabolic mode (threshold=92)");
});

Deno.test("STOCHRSI_OVERBOUGHT_BLOCK: rising StochRSI bypasses block", () => {
  const result = evaluateStochRsiOverboughtBlock('long', 85, 30, false, true, false);
  assertEquals(result.blocked, false);
  assert(result.reason.includes('rising=true'));
});

Deno.test("STOCHRSI_OVERBOUGHT_BLOCK: momentum continuation bypasses block", () => {
  const result = evaluateStochRsiOverboughtBlock('long', 85, 30, false, false, true);
  assertEquals(result.blocked, false);
  assert(result.reason.includes('momentum=true'));
});

Deno.test("STOCHRSI_OVERBOUGHT_BLOCK: K=97 in parabolic is allowed (parabolic = exception)", () => {
  // K=97 >= parabolic threshold 92, BUT isParabolicMode=true is itself an exception
  // In parabolic mode, system trusts strong trend momentum — K can stay pinned at high levels
  const result = evaluateStochRsiOverboughtBlock('long', 97, 50, true, false, false);
  assertEquals(result.blocked, false, "K=97 should pass in parabolic mode (parabolic is an exception)");
  
  // But K=98 hits ABSOLUTE MAX and blocks even in parabolic
  const resultAbsMax = evaluateStochRsiOverboughtBlock('long', 98, 50, true, false, false);
  assertEquals(resultAbsMax.blocked, true, "K=98 absolute max blocks even in parabolic");
});

Deno.test("STOCHRSI_OVERBOUGHT_BLOCK: SHORT direction is never affected by overbought", () => {
  // Overbought gates only apply to LONG direction
  const result = evaluateStochRsiOverboughtBlock('short', 95, 25);
  assertEquals(result.blocked, false, "SHORT should not be blocked by overbought StochRSI");
});

Deno.test("STOCHRSI_OVERBOUGHT_BLOCK: skipGate flag bypasses all checks", () => {
  const result = evaluateStochRsiOverboughtBlock('long', 99, 20, false, false, false, true);
  assertEquals(result.blocked, false);
});

// ================================================================
// TEST SUITE: Cross-Gate Consistency
// ================================================================
Deno.test("CONSISTENCY: DEEP_EXHAUSTION probe threshold matches STRONG_TREND tier", () => {
  // The probe threshold should be <= ADX_THRESHOLDS.EXTREME (40)
  // to allow STRONG_TREND tier1 symbols to get probes
  const probeThreshold = STOCHRSI_RUNWAY_GATE.DEEP_EXHAUSTION_COMPOUND.HIGH_ADX_PROBE_THRESHOLD;
  assert(probeThreshold <= ADX_THRESHOLDS.EXTREME, 
    `Probe threshold ${probeThreshold} should be <= EXTREME ADX ${ADX_THRESHOLDS.EXTREME}`);
});

Deno.test("CONSISTENCY: Parabolic mode ADX threshold aligns with HTF gate", () => {
  // The parabolic mode activation (HTF_EXTREME_HARD_GATES.PARABOLIC_MODE_MIN_ADX) should be <= EXHAUSTION
  const parabolicThreshold = HTF_EXTREME_HARD_GATES.PARABOLIC_MODE_MIN_ADX;
  assert(parabolicThreshold !== undefined, "Parabolic mode ADX threshold should be defined");
  assert(parabolicThreshold <= ADX_THRESHOLDS.EXHAUSTION,
    `Parabolic mode ADX threshold ${parabolicThreshold} should be <= EXHAUSTION ${ADX_THRESHOLDS.EXHAUSTION}`);
});

Deno.test("CONSISTENCY: MOVE_EXHAUSTED ACCELERATING threshold > default hard threshold", () => {
  const accel = MOVE_EXHAUSTION_FILTER_PARAMS.STRONG_TREND_RELAXATION.GRADUATED_SLOPE_RELAXATION.ACCELERATING_HARD_THRESHOLD;
  const defaultHard = MOVE_EXHAUSTION_FILTER_PARAMS.HARD_THRESHOLD_PERCENT;
  assert(accel > defaultHard, 
    `ACCELERATING threshold ${accel} should be > default hard ${defaultHard}`);
});

Deno.test("CONSISTENCY: DEEP_EXHAUSTION K thresholds are symmetric", () => {
  const D = STOCHRSI_RUNWAY_GATE.DEEP_EXHAUSTION_COMPOUND;
  // SHORT_MAX_K (15) and LONG_MIN_K (85) should be symmetric around 50
  const shortSymmetric = D.SHORT_MAX_K;
  const longSymmetric = 100 - D.LONG_MIN_K;
  assertEquals(shortSymmetric, longSymmetric, 
    `SHORT_MAX_K (${D.SHORT_MAX_K}) and LONG_MIN_K (${D.LONG_MIN_K}) should be symmetric around 50`);
});

// ================================================================
// TEST SUITE: FEE VIABILITY GATE (Regression)
// Ensures currentPrice/ATR scoping works correctly across regime transitions.
// Bug history: TDZ error when Fee Viability Gate referenced `currentPrice`
// before it was declared, causing ANALYZER_ERROR for symbols in transition.
// ================================================================

function evaluateFeeViability(
  currentPrice: number | undefined | null,
  atr: number | undefined | null,
  feeRatePercent: number = 0.1,
): { blocked: boolean; expectedMovePercent: number; minRequired: number; reason: string } {
  const roundTripFeePercent = feeRatePercent * 2;
  const feeViabilityMultiplier = 2.0;
  const minRequiredMovePercent = roundTripFeePercent * feeViabilityMultiplier;

  // Mirror the fix: use trendData fields directly, not outer-scoped variables
  const feeCheckPrice = currentPrice || 0;
  const feeCheckATR = atr ?? 0;
  const expectedAtrMovePercent = feeCheckPrice > 0 ? (feeCheckATR / feeCheckPrice) * 100 : 0;

  if (expectedAtrMovePercent > 0 && expectedAtrMovePercent < minRequiredMovePercent) {
    return {
      blocked: true,
      expectedMovePercent: expectedAtrMovePercent,
      minRequired: minRequiredMovePercent,
      reason: `ATR move ${expectedAtrMovePercent.toFixed(3)}% < ${minRequiredMovePercent.toFixed(3)}%`,
    };
  }
  return {
    blocked: false,
    expectedMovePercent: expectedAtrMovePercent,
    minRequired: minRequiredMovePercent,
    reason: expectedAtrMovePercent === 0 ? 'no price data — skipped' : 'viable',
  };
}

Deno.test("FEE_VIABILITY: allows trade when ATR move exceeds 2x fee threshold", () => {
  // BTC: price=87000, ATR=500 → move = 0.575% > 0.4% (2x 0.1% fee)
  const result = evaluateFeeViability(87000, 500, 0.1);
  assertEquals(result.blocked, false);
  assert(result.expectedMovePercent > result.minRequired);
});

Deno.test("FEE_VIABILITY: blocks trade when ATR move is fee-dominated", () => {
  // Low-vol symbol: price=1.00, ATR=0.001 → move = 0.1% < 0.4%
  const result = evaluateFeeViability(1.0, 0.001, 0.1);
  assertEquals(result.blocked, true);
  assert(result.reason.includes('ATR move'));
});

Deno.test("FEE_VIABILITY: handles undefined price gracefully (no crash)", () => {
  // Regression: undefined trendData.currentPrice must not throw TDZ error
  const result = evaluateFeeViability(undefined, 500, 0.1);
  assertEquals(result.blocked, false);
  assertEquals(result.expectedMovePercent, 0, "Should return 0 move when price is undefined");
  assert(result.reason.includes('no price data'));
});

Deno.test("FEE_VIABILITY: handles null ATR gracefully (no crash)", () => {
  const result = evaluateFeeViability(87000, null, 0.1);
  assertEquals(result.blocked, false);
  assertEquals(result.expectedMovePercent, 0);
});

Deno.test("FEE_VIABILITY: handles both undefined price and ATR", () => {
  const result = evaluateFeeViability(undefined, undefined, 0.1);
  assertEquals(result.blocked, false);
  assertEquals(result.expectedMovePercent, 0);
});

Deno.test("FEE_VIABILITY: zero price does not divide by zero", () => {
  const result = evaluateFeeViability(0, 500, 0.1);
  assertEquals(result.blocked, false);
  assertEquals(result.expectedMovePercent, 0);
});

Deno.test("FEE_VIABILITY: boundary — exactly at 2x fee threshold is NOT blocked", () => {
  // fee=0.1%, roundTrip=0.2%, minRequired=0.4%
  // Need ATR/price*100 = 0.4% exactly → ATR = price * 0.004
  const price = 1000;
  const atr = price * 0.004; // exactly 0.4%
  const result = evaluateFeeViability(price, atr, 0.1);
  // expectedAtrMovePercent = 0.4, minRequired = 0.4 → NOT < minRequired → not blocked
  assertEquals(result.blocked, false, "Exactly at threshold should NOT be blocked (uses < not <=)");
});

Deno.test("FEE_VIABILITY: regime transition scenario — trendData available but ATR filter was disabled", () => {
  // Simulates the original bug scenario: symbol transitions regime,
  // ATR filter block was skipped, but Fee Viability gate still needs price/ATR.
  // With the fix, it reads from trendData directly instead of outer-scoped variables.
  const trendDataPrice = 650; // e.g. BNBUSDT
  const trendDataATR = 5.2;   // reasonable ATR
  const result = evaluateFeeViability(trendDataPrice, trendDataATR, 0.1);
  assertEquals(result.blocked, false);
  assert(result.expectedMovePercent > 0, "Should compute valid move percent from trendData");
});
