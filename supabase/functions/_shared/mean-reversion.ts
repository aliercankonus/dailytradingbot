// ============= COUNTER-TREND ADMISSION LAYER =============
// Unified authority for allowing opposite-direction (reversal) entries
// Single source of truth for all counter-trend admission decisions
//
// ARCHITECTURAL ROLE:
// This module answers: "Is the dominant trend exhausted enough to allow a reversal probe?"
// It is NOT a separate gate - it is the ADMISSION CONTROLLER for counter-trend trades.
//
// EXECUTION ORDER:
// 1. Direction is derived (LONG or SHORT)
// 2. If direction is COUNTER-TREND, this module evaluates admission
// 3. PASS → Generate reversal signal @ probe size (0.25x)
// 4. FAIL → Block + log explicit failure reason
//
// MUTUAL EXCLUSIVITY:
// Strong Trend Tier 0 Override (continuation) and Counter-Trend Admission (reversal)
// cannot both fire. Enforced by flow in strategy-analyzer.

import { 
  MEAN_REVERSION_CONFIG, 
  TREND_PHASE_GATE, 
  EXPANSION_GATE, 
  MEAN_REVERSION_REGIME_REQUIREMENTS,
  COUNTER_TREND_ADMISSION
} from "./constants.ts";
import type { MarketFeatureSnapshot } from "./market-feature-snapshot.ts";

// ============= TYPE DEFINITIONS =============

export interface GateBypass {
  gate: string;
  allowedDirection: 'long' | 'short';
  reason: 'mean_reversion_exhaustion';
  confidence: number;
}

export interface ExhaustionSignal {
  detected: boolean;
  direction: 'long' | 'short' | null;
  confidence: number;
  exhaustionScore: number;
  trendPhase: 'RANGE' | 'LATE_TREND' | 'EARLY_TREND';
  expansionState: 'NORMAL' | 'EXPANSION' | 'BREAKOUT';
  allowed: boolean;
  triggers: string[];
  gateBypasses: GateBypass[];
  positionMultiplier: number;
  qualityScore: number;
  // Extreme exhaustion tracking
  isExtremeExhaustion: boolean;   // True when K at statistical extremes
  adxWasOverridden: boolean;      // True when high ADX was bypassed
  // Pre-recovery override capability
  preRecoveryOverrideAllowed: boolean;  // True when conditions allow pre-recovery direction flip
  // Moderate exhaustion tier (K 10-15)
  isModerateExhaustion: boolean;  // True when K in moderate zone with momentum confirmation
  exhaustionTier: 'EXTREME' | 'STRONG' | 'MODERATE' | 'NONE';  // Which tier triggered
  tag: string | null;             // Strategy tag for position tracking (e.g., 'MR_MODERATE_EXHAUSTION')
  // Recommendation #3: Explicit override reason for post-mortem analysis
  overrideReason: 'EXTREME_ADX_OVERRIDE' | 'EXTREME_REGIME_OVERRIDE' | 'MODERATE_ADX_SLOPE_OVERRIDE' | null;
}

interface ExhaustionCheck {
  detected: boolean;
  direction: 'long' | 'short';
  confidence: number;
  exhaustionScore: number;
  triggers: string[];
  gatesToBypass: string[];
  isExtremeExhaustion: boolean;  // Flags when ADX override is active (K <= 10)
  adxWasOverridden: boolean;     // Logs whether ADX was bypassed
  isModerateExhaustion: boolean; // Flags when moderate tier triggered (K 10-15)
  exhaustionTier: 'EXTREME' | 'STRONG' | 'MODERATE' | 'NONE';
  tag: string | null;
  // Recommendation #3: Explicit override reason for post-mortem analysis
  overrideReason: 'EXTREME_ADX_OVERRIDE' | 'EXTREME_REGIME_OVERRIDE' | 'MODERATE_ADX_SLOPE_OVERRIDE' | null;
}

// ============= COUNTER-TREND ADMISSION RESULT =============

export interface CounterTrendAdmissionResult {
  allowed: boolean;
  reason: string;
  exhaustionStage: 'EARLY' | 'CONFIRMED' | 'NONE';
  positionSizeMultiplier: number;
  // Detailed checks
  adxExhausted: boolean;
  adxSlopePersistence: number;
  volatilityContracting: boolean;
  volatilityReason: string;
  ltfStructureFlip: boolean;
  ltfStructureScore: number;
  stochDepegged: boolean;
  // Logging
  failureReasons: string[];
  triggers: string[];
}

// ============= ADX SLOPE PERSISTENCE CHECK =============

/**
 * Checks consecutive periods where ADX slope is non-positive (flat or declining)
 * This confirms trend energy decay is persistent, not a single-candle fluke
 * 
 * @param adxArray - Array of ADX values (most recent last)
 * @param requiredCandles - Number of consecutive non-positive slope periods required
 * @returns Number of consecutive non-positive slope periods found
 */
export function checkAdxSlopePersistence(adxArray: number[], requiredCandles: number): number {
  if (!adxArray || adxArray.length < requiredCandles + 1) return 0;
  
  let consecutiveNonPositive = 0;
  
  // Work backwards from most recent
  for (let i = adxArray.length - 1; i > 0 && consecutiveNonPositive < requiredCandles + 1; i--) {
    const currentADX = adxArray[i];
    const prevADX = adxArray[i - 1];
    const slope = currentADX - prevADX;
    
    if (slope <= 0) {
      consecutiveNonPositive++;
    } else {
      break; // Streak broken by positive slope
    }
  }
  
  return consecutiveNonPositive;
}

// ============= VOLATILITY CONTRACTION CHECK =============

/**
 * Checks if volatility is contracting (BB width declining or ATR flat)
 * Confirms impulse is dying, not just oscillators resetting
 * 
 * @param currentBbWidth - Current Bollinger Band width
 * @param prevBbWidth - Previous Bollinger Band width
 * @param currentAtr - Current ATR value
 * @param prevAtr - Previous ATR value
 * @returns Object with contracting status and reason
 */
export function checkVolatilityContracting(
  currentBbWidth: number | null,
  prevBbWidth: number | null,
  currentAtr: number | null,
  prevAtr: number | null
): { contracting: boolean; reason: string } {
  const config = COUNTER_TREND_ADMISSION;
  
  // Check BB width decline
  if (currentBbWidth != null && prevBbWidth != null && prevBbWidth > 0) {
    const bbDeclinePercent = ((prevBbWidth - currentBbWidth) / prevBbWidth) * 100;
    if (bbDeclinePercent >= config.BB_WIDTH_DECLINE_MIN_PERCENT) {
      return { contracting: true, reason: 'BB_WIDTH_DECLINING' };
    }
  }
  
  // Check ATR flat/declining
  if (currentAtr != null && prevAtr != null && prevAtr > 0) {
    const atrChangePercent = Math.abs((currentAtr - prevAtr) / prevAtr) * 100;
    if (atrChangePercent < config.ATR_CHANGE_FLAT_THRESHOLD) {
      return { contracting: true, reason: 'ATR_FLAT' };
    }
    // Also accept declining ATR
    if (currentAtr < prevAtr) {
      return { contracting: true, reason: 'ATR_DECLINING' };
    }
  }
  
  // If we can't compute either, be permissive (don't block on missing data)
  if ((currentBbWidth == null || prevBbWidth == null) && (currentAtr == null || prevAtr == null)) {
    return { contracting: true, reason: 'VOLATILITY_DATA_UNAVAILABLE' };
  }
  
  return { contracting: false, reason: 'VOLATILITY_EXPANDING' };
}

// ============= LTF STRUCTURE FLIP DETECTION =============

/**
 * Detects lower-timeframe structure flip for counter-trend entry timing
 * For LONG: 15m or 30m shows Higher Low + Higher High
 * For SHORT: 15m or 30m shows Lower High + Lower Low
 * 
 * @param trendData - Trend data containing timeframe information
 * @param direction - Trade direction ('long' or 'short')
 * @returns Object with flip status and confidence score
 */
export function checkLtfStructureFlip(
  mfs: MarketFeatureSnapshot,
  direction: 'long' | 'short'
): { flipped: boolean; score: number; details: string } {
  const tf15m = mfs.timeframes['15m'];
  const tf30m = mfs.timeframes['30m'];
  
  let score = 0;
  const details: string[] = [];
  
  if (direction === 'long') {
    // Alternative: Check trend direction flip (structure fields not available via MFS)
    if (tf15m.trend === 'bullish') {
      score += 4;
      details.push('15m bullish');
    }
    if (tf30m.trend === 'bullish') {
      score += 5;
      details.push('30m bullish');
    }
  } else {
    if (tf15m.trend === 'bearish') {
      score += 4;
      details.push('15m bearish');
    }
    if (tf30m.trend === 'bearish') {
      score += 5;
      details.push('30m bearish');
    }
  }
  
  // Consider flipped if score meets threshold (bonus level)
  const flipped = score >= COUNTER_TREND_ADMISSION.LTF_STRUCTURE_BONUS;
  
  return {
    flipped,
    score,
    details: details.length > 0 ? details.join(', ') : 'No structure flip detected'
  };
}

// ============= UNIFIED COUNTER-TREND ADMISSION EVALUATION =============

/**
 * Main entry point for counter-trend admission evaluation
 * Single authority for allowing reversal entries
 * 
 * @param trendData - Full trend data from calculate-trend
 * @param derivedDirection - The direction derived by the signal generator
 * @param htfTrend - The higher timeframe trend ('bullish', 'bearish', 'neutral')
 * @returns CounterTrendAdmissionResult with pass/fail and detailed diagnostics
 */
export function evaluateCounterTrendAdmission(
  mfs: MarketFeatureSnapshot,
  derivedDirection: 'long' | 'short',
  htfTrend: string
): CounterTrendAdmissionResult {
  const config = COUNTER_TREND_ADMISSION;
  const failureReasons: string[] = [];
  const triggers: string[] = [];
  
  // MFS MIGRATION: All indicators read from MarketFeatureSnapshot
  const adx = mfs.adx;
  const adxSlope = mfs.adxSlope;
  const adxArray = mfs.adxArray;
  const stochK = mfs.stochRsi['4h'].k;
  
  // Volatility data from MFS
  const currentBbWidth = mfs.bollinger['4h'].bandwidth || null;
  const prevBbWidth: number | null = null; // prevWidth not available in MFS — permissive fallback
  const currentAtr = mfs.atr || null;
  const prevAtr: number | null = null; // prevAtr not available in MFS — permissive fallback
  
  // Determine if this is a counter-trend entry
  const isCounterTrend = (
    (derivedDirection === 'long' && htfTrend === 'bearish') ||
    (derivedDirection === 'short' && htfTrend === 'bullish')
  );
  
  // If NOT counter-trend, admission is automatic
  if (!isCounterTrend) {
    return {
      allowed: true,
      reason: 'NOT_COUNTER_TREND',
      exhaustionStage: 'NONE',
      positionSizeMultiplier: 1.0,
      adxExhausted: true,
      adxSlopePersistence: 0,
      volatilityContracting: true,
      volatilityReason: 'N/A',
      ltfStructureFlip: true,
      ltfStructureScore: 0,
      stochDepegged: true,
      failureReasons: [],
      triggers: ['Direction aligns with HTF - no counter-trend admission required'],
    };
  }
  
  triggers.push(`Counter-trend ${derivedDirection.toUpperCase()} against ${htfTrend} HTF`);
  
  // ===== CHECK 1: ADX EXHAUSTION =====
  // ADX must be below threshold (not in dominant trend)
  const adxExhausted = adx < config.MAX_ADX_FOR_EXHAUSTION;
  if (!adxExhausted) {
    failureReasons.push(`ADX_NOT_EXHAUSTED: ADX=${adx.toFixed(1)} >= ${config.MAX_ADX_FOR_EXHAUSTION}`);
  } else {
    triggers.push(`ADX=${adx.toFixed(1)} < ${config.MAX_ADX_FOR_EXHAUSTION} ✓`);
  }
  
  // ===== CHECK 2: ADX SLOPE PERSISTENCE =====
  // ADX slope must be non-positive for consecutive candles
  const adxSlopePersistence = checkAdxSlopePersistence(adxArray, config.MIN_ADX_SLOPE_PERSISTENCE);
  const adxSlopePasses = adxSlope <= config.MAX_ADX_SLOPE && adxSlopePersistence >= config.MIN_ADX_SLOPE_PERSISTENCE;
  
  if (adxSlope > config.MAX_ADX_SLOPE) {
    failureReasons.push(`ADX_STILL_EXPANDING: slope=${adxSlope.toFixed(2)} > ${config.MAX_ADX_SLOPE}`);
  } else if (adxSlopePersistence < config.MIN_ADX_SLOPE_PERSISTENCE) {
    failureReasons.push(`ADX_PERSISTENCE_INSUFFICIENT: ${adxSlopePersistence} < ${config.MIN_ADX_SLOPE_PERSISTENCE} consecutive candles`);
  } else {
    triggers.push(`ADX slope=${adxSlope.toFixed(2)} for ${adxSlopePersistence} candles ✓`);
  }
  
  // ===== CHECK 3: VOLATILITY CONTRACTION =====
  const volatilityCheck = checkVolatilityContracting(currentBbWidth, prevBbWidth, currentAtr, prevAtr);
  const volatilityPasses = !config.REQUIRE_VOLATILITY_CONTRACTION || volatilityCheck.contracting;
  
  if (!volatilityPasses) {
    failureReasons.push(`VOLATILITY_EXPANDING: ${volatilityCheck.reason}`);
  } else {
    triggers.push(`Volatility contracting: ${volatilityCheck.reason} ✓`);
  }
  
  // ===== CHECK 4: STOCHRSI DE-PEGGING =====
  // StochRSI must not be stuck at absolute extremes
  const stochPegged = (stochK < 5 || stochK > 95);
  const stochDepegged = !stochPegged;
  
  if (stochPegged) {
    failureReasons.push(`STOCHRSI_STILL_PEGGED: K=${stochK.toFixed(1)} at extreme`);
  } else {
    triggers.push(`StochRSI K=${stochK.toFixed(1)} de-pegged ✓`);
  }
  
  // ===== CHECK 5: LTF STRUCTURE FLIP (Optional Bonus) =====
  const ltfCheck = config.LTF_STRUCTURE_ENABLED 
    ? checkLtfStructureFlip(trendData, derivedDirection)
    : { flipped: true, score: 0, details: 'LTF check disabled' };
  
  if (ltfCheck.flipped) {
    triggers.push(`LTF structure flip: ${ltfCheck.details} (score=${ltfCheck.score}) ✓`);
  } else {
    // Not a hard failure, but log it
    triggers.push(`LTF_NO_STRUCTURE_FLIP: ${ltfCheck.details} (score=${ltfCheck.score})`);
  }
  
  // ===== DETERMINE EXHAUSTION STAGE =====
  let exhaustionStage: 'EARLY' | 'CONFIRMED' | 'NONE' = 'NONE';
  
  const coreChecksPassed = adxExhausted && adxSlopePasses && stochDepegged;
  
  if (coreChecksPassed && volatilityPasses && ltfCheck.flipped) {
    exhaustionStage = 'CONFIRMED';
  } else if (coreChecksPassed && volatilityPasses) {
    exhaustionStage = 'EARLY';
  }
  
  // ===== FINAL ADMISSION DECISION =====
  // Core checks must pass; volatility and LTF are additional confirmation
  const allowed = coreChecksPassed && volatilityPasses;
  
  // Position size multiplier (probe size for counter-trend)
  let positionSizeMultiplier = config.PROBE_POSITION_MULTIPLIER;
  
  // Bonus for confirmed exhaustion with LTF flip
  if (exhaustionStage === 'CONFIRMED') {
    positionSizeMultiplier *= 1.2; // Allow up to 30% of normal instead of 25%
  }
  
  // Log failure if not allowed
  if (!allowed && config.LOG_FAILURE_REASONS) {
    console.log(
      `[COUNTER_TREND_ADMISSION] BLOCKED: ${derivedDirection.toUpperCase()} against ${htfTrend}\n` +
      `  Failures: ${failureReasons.join('; ')}\n` +
      `  Context: ADX=${adx.toFixed(1)}, slope=${adxSlope.toFixed(2)}, K=${stochK.toFixed(1)}`
    );
  }
  
  return {
    allowed,
    reason: allowed 
      ? `COUNTER_TREND_ADMITTED: exhaustionStage=${exhaustionStage}` 
      : failureReasons[0] ?? 'UNKNOWN_FAILURE',
    exhaustionStage,
    positionSizeMultiplier,
    adxExhausted,
    adxSlopePersistence,
    volatilityContracting: volatilityCheck.contracting,
    volatilityReason: volatilityCheck.reason,
    ltfStructureFlip: ltfCheck.flipped,
    ltfStructureScore: ltfCheck.score,
    stochDepegged,
    failureReasons,
    triggers,
  };
}

// ============= REGIME CLASSIFICATION (ORTHOGONAL) =============

/**
 * Classifies the current trend phase based on ADX and slope
 * Independent of expansion state for clean separation of concerns
 */
export function classifyTrendPhase(trendData: any): 'RANGE' | 'EARLY_TREND' | 'LATE_TREND' {
  const adx = trendData?.volatility?.adx ?? trendData?.adx ?? 0;
  const adxSlope = trendData?.volatility?.adxSlope ?? trendData?.adxSlope ?? 0;
  
  // RANGE: Very low ADX
  if (adx < TREND_PHASE_GATE.RANGE.ADX_MAX) {
    return 'RANGE';
  }
  
  // EARLY_TREND: Moderate ADX with rising slope
  if (adx >= TREND_PHASE_GATE.EARLY_TREND.ADX_MIN && 
      adx <= TREND_PHASE_GATE.EARLY_TREND.ADX_MAX &&
      adxSlope >= TREND_PHASE_GATE.EARLY_TREND.ADX_SLOPE_MIN) {
    return 'EARLY_TREND';
  }
  
  // LATE_TREND: High ADX with flat/declining slope
  if (adx >= TREND_PHASE_GATE.LATE_TREND.ADX_MIN && 
      adxSlope <= TREND_PHASE_GATE.LATE_TREND.ADX_SLOPE_MAX) {
    return 'LATE_TREND';
  }
  
  // Default to EARLY_TREND if ambiguous (safer - blocks mean reversion)
  return 'EARLY_TREND';
}

/**
 * Classifies the expansion state based on volume and squeeze indicators
 * Independent of trend phase for clean separation of concerns
 */
export function classifyExpansionState(trendData: any): 'NORMAL' | 'EXPANSION' | 'BREAKOUT' {
  const volumeRatio = trendData?.volume?.ratio ?? 1.0;
  const squeezeReleased = trendData?.squeeze?.justReleased ?? false;
  const adxSlope = trendData?.volatility?.adxSlope ?? trendData?.adxSlope ?? 0;
  
  // BREAKOUT: Very high volume spike
  if (volumeRatio >= EXPANSION_GATE.BREAKOUT.VOLUME_SPIKE_MIN) {
    return 'BREAKOUT';
  }
  
  // EXPANSION: High volume OR squeeze release OR ADX spike
  if (volumeRatio >= EXPANSION_GATE.EXPANSION.VOLUME_SPIKE_MIN || 
      squeezeReleased ||
      adxSlope >= EXPANSION_GATE.EXPANSION.ADX_SLOPE_MIN) {
    return 'EXPANSION';
  }
  
  return 'NORMAL';
}

/**
 * Checks if mean reversion is allowed based on orthogonal regime classification
 * Both trend phase AND expansion state must be favorable
 */
export function isMeanReversionAllowed(trendPhase: string, expansionState: string): boolean {
  const phaseAllowed = (MEAN_REVERSION_REGIME_REQUIREMENTS.ALLOWED_TREND_PHASES as readonly string[]).includes(trendPhase);
  const expansionAllowed = (MEAN_REVERSION_REGIME_REQUIREMENTS.ALLOWED_EXPANSION_STATES as readonly string[]).includes(expansionState);
  
  return phaseAllowed && expansionAllowed;
}

/**
 * FIX #1 (Audit): Formal isExtremeMeanReversion definition for Tier 1 bypass
 * 
 * Determines if a mean reversion signal qualifies for Tier 1 SEVERE StochRSI bypass.
 * All three conditions must be met:
 * 1. Regime must be RANGE, LATE_TREND, or EXHAUSTION (not EARLY_TREND or STRONG_TREND)
 * 2. Reversal score must be >= 55 (strong reversal signal)
 * 3. Momentum state must NOT be "confirmed" (no strong trend-following momentum)
 * 
 * @param regime - Current market regime classification
 * @param reversalScore - Unified reversal score (0-100)
 * @param momentumState - Current momentum state from trend engine
 * @returns Boolean indicating if Tier 1 mean reversion bypass is allowed
 */
export function isExtremeMeanReversion(
  regime: string,
  reversalScore: number,
  momentumState: string
): boolean {
  const criteria = MEAN_REVERSION_CONFIG.TIER1_BYPASS_CRITERIA;
  
  // Condition 1: Regime must be in allowed list
  const regimeAllowed = criteria.ALLOWED_REGIMES.includes(regime);
  
  // Condition 2: Reversal score must meet minimum threshold
  const reversalScoreMet = reversalScore >= criteria.MIN_REVERSAL_SCORE;
  
  // Condition 3: Momentum state must NOT be in disallowed list
  const momentumAllowed = !criteria.DISALLOWED_MOMENTUM_STATES.includes(momentumState);
  
  return regimeAllowed && reversalScoreMet && momentumAllowed;
}

/**
 * Gets position multiplier adjustment based on trend phase
 */
export function getPhasePositionMultiplier(trendPhase: string): number {
  const multipliers = MEAN_REVERSION_REGIME_REQUIREMENTS.POSITION_MULTIPLIERS as Record<string, number>;
  return multipliers[trendPhase] ?? 1.0;
}

// ============= OVERSOLD EXHAUSTION CHECK (FOR LONGS) =============

function checkOversoldExhaustion(trendData: any): ExhaustionCheck {
  const stochK = trendData?.timeframes?.['4h']?.indicators?.stochRsi?.k ?? 
                 trendData?.stochasticRsi?.['4h']?.k ?? 
                 trendData?.stochasticRsi?.aggregated?.k ?? 50;
  const percentB = trendData?.bollingerBands?.['4h']?.percentB ?? 50;
  const adx = trendData?.volatility?.adx ?? trendData?.adx ?? 0;
  const adxSlope = trendData?.volatility?.adxSlope ?? trendData?.adxSlope ?? 0;
  const macdHist = trendData?.momentum?.macdHistogram ?? 0;
  const prevMacdHist = trendData?.momentum?.prevMacdHistogram ?? macdHist;
  const volumeRatio = trendData?.volume?.ratio ?? 1.0;
  
  // Momentum data for moderate exhaustion gating
  const momentumScore = trendData?.momentum?.score ?? 0;
  const momentumDirection = trendData?.momentum?.direction ?? 'neutral';
  
  // VWAP distance check for extreme exhaustion validation
  const vwapDistance = trendData?.vwap?.distancePercent ?? 0;
  const atr = trendData?.volatility?.atr ?? trendData?.atr ?? 0;
  const currentPrice = trendData?.price ?? trendData?.currentPrice ?? 0;
  const vwap = trendData?.vwap?.value ?? currentPrice;
  const atrDistanceFromVwap = atr > 0 && currentPrice > 0 
    ? Math.abs(currentPrice - vwap) / atr 
    : 0;
  
  const config = MEAN_REVERSION_CONFIG.LONG;
  const extremeConfig = MEAN_REVERSION_CONFIG.EXTREME_EXHAUSTION;
  const moderateConfig = MEAN_REVERSION_CONFIG.MODERATE_EXHAUSTION;
  const triggers: string[] = [];
  let score = 0;
  let isExtremeExhaustion = false;
  let isModerateExhaustion = false;
  let adxWasOverridden = false;
  let exhaustionTier: 'EXTREME' | 'STRONG' | 'MODERATE' | 'NONE' = 'NONE';
  let tag: string | null = null;
  
  // ===== EXTREME EXHAUSTION DETECTION (K <= 10) =====
  // When K is at statistical extremes, ADX becomes informational, not blocking
  // Momentum floor prevents entries when momentum strongly opposes direction
  // Momentum delta check (Rec #1) confirms selling pressure is easing
  const isDeepExhaustion = stochK <= extremeConfig.LONG_K_EXTREME;
  const adxNotAccelerating = adxSlope <= extremeConfig.MAX_ADX_SLOPE;
  const sufficientDistance = atrDistanceFromVwap >= extremeConfig.MIN_ATR_DISTANCE_FROM_VWAP;
  
  // Momentum floor: for LONG, momentum must not be strongly bearish (score > -threshold)
  const extremeMomentumFloor = extremeConfig.MIN_MOMENTUM_SCORE ?? 20;
  const momentumNotOpposing = momentumScore > -extremeMomentumFloor;
  
  // Momentum delta check (Recommendation #1): Confirm selling pressure is easing
  // Prevents catching first bounce failure during violent selloffs
  const prevMomentumScore = trendData?.momentum?.prevScore ?? momentumScore;
  const momentumDelta = momentumScore - prevMomentumScore;
  const requireDelta = extremeConfig.REQUIRE_MOMENTUM_IMPROVING ?? true;
  const minDelta = extremeConfig.MIN_MOMENTUM_DELTA ?? 15;
  const momentumImproving = !requireDelta || momentumDelta >= minDelta;
  
  // Track override reason for diagnostics
  let overrideReason: 'EXTREME_ADX_OVERRIDE' | 'EXTREME_REGIME_OVERRIDE' | 'MODERATE_ADX_SLOPE_OVERRIDE' | null = null;
  
  if (isDeepExhaustion && adxNotAccelerating && sufficientDistance && momentumNotOpposing && momentumImproving) {
    isExtremeExhaustion = true;
    exhaustionTier = 'EXTREME';
    triggers.push(`EXTREME EXHAUSTION: K=${stochK.toFixed(1)} <= ${extremeConfig.LONG_K_EXTREME}, ADX slope=${adxSlope.toFixed(2)} <= ${extremeConfig.MAX_ADX_SLOPE}, VWAP distance=${atrDistanceFromVwap.toFixed(1)} ATRs, momentum=${momentumScore.toFixed(0)} > -${extremeMomentumFloor}, Δmomentum=${momentumDelta.toFixed(0)} >= ${minDelta}`);
  } else if (isDeepExhaustion) {
    // Log rejection with specific reason
    const reasons: string[] = [];
    if (!momentumNotOpposing) reasons.push(`momentum=${momentumScore.toFixed(0)} <= -${extremeMomentumFloor} (opposing)`);
    if (!momentumImproving) reasons.push(`Δmomentum=${momentumDelta.toFixed(0)} < ${minDelta} (not improving)`);
    if (!adxNotAccelerating) reasons.push(`adxSlope=${adxSlope.toFixed(2)} > ${extremeConfig.MAX_ADX_SLOPE} (accelerating)`);
    if (!sufficientDistance) reasons.push(`VWAP dist=${atrDistanceFromVwap.toFixed(1)} < ${extremeConfig.MIN_ATR_DISTANCE_FROM_VWAP} ATRs`);
    triggers.push(`EXTREME_EXHAUSTION_REJECTED: K=${stochK.toFixed(1)} qualifies, but ${reasons.join(', ')}`);
  }
  
  // ===== MODERATE EXHAUSTION DETECTION (K 10-15) =====
  // Probabilistic probe - requires momentum confirmation
  if (!isExtremeExhaustion && moderateConfig.ENABLED) {
    const inModerateKRange = stochK > moderateConfig.LONG_K_MIN && stochK <= moderateConfig.LONG_K_MAX;
    const hasMomentumConfirmation = momentumScore >= moderateConfig.MIN_MOMENTUM_SCORE;
    const momentumAligned = !moderateConfig.REQUIRE_ALIGNED_MOMENTUM || momentumDirection === 'bullish';
    
    // ADX check: either ADX <= 35 OR ADX slope <= 0 (trend exhausting)
    const adxInRange = adx <= moderateConfig.MAX_ADX;
    const adxSlopeOverride = moderateConfig.ALLOW_ADX_SLOPE_OVERRIDE && adxSlope <= moderateConfig.MAX_ADX_SLOPE_FOR_OVERRIDE;
    const adxConditionMet = adxInRange || adxSlopeOverride;
    
    if (inModerateKRange && hasMomentumConfirmation && momentumAligned && adxConditionMet) {
      isModerateExhaustion = true;
      exhaustionTier = 'MODERATE';
      tag = moderateConfig.TAG;
      triggers.push(
        `MODERATE EXHAUSTION: K=${stochK.toFixed(1)} in [${moderateConfig.LONG_K_MIN}-${moderateConfig.LONG_K_MAX}], ` +
        `momentum=${momentumScore.toFixed(0)} >= ${moderateConfig.MIN_MOMENTUM_SCORE}, direction=${momentumDirection}, ` +
        `ADX=${adx.toFixed(1)}${adxSlopeOverride ? ` (slope override: ${adxSlope.toFixed(2)})` : ''}`
      );
      score += 25; // Moderate tier bonus
    } else if (inModerateKRange) {
      // Log why moderate tier wasn't triggered (diagnostic)
      const reasons: string[] = [];
      if (!hasMomentumConfirmation) reasons.push(`momentum ${momentumScore.toFixed(0)} < ${moderateConfig.MIN_MOMENTUM_SCORE}`);
      if (!momentumAligned) reasons.push(`direction ${momentumDirection} != bullish`);
      if (!adxConditionMet) reasons.push(`ADX ${adx.toFixed(1)} > ${moderateConfig.MAX_ADX} and slope ${adxSlope.toFixed(2)} > 0`);
      triggers.push(`MODERATE_EXHAUSTION_REJECTED (K=${stochK.toFixed(1)}): ${reasons.join(', ')}`);
    }
  }
  
  // Check K threshold (deep oversold - Strong tier)
  if (stochK <= config.K_THRESHOLD) {
    triggers.push(`K=${stochK.toFixed(1)} <= ${config.K_THRESHOLD}`);
    score += 30;
    if (exhaustionTier === 'NONE') exhaustionTier = 'STRONG';
  }
  
  // Check %B threshold (below lower Bollinger)
  if (percentB <= config.PERCENT_B_THRESHOLD) {
    triggers.push(`%B=${percentB.toFixed(1)} <= ${config.PERCENT_B_THRESHOLD}`);
    score += 25;
  }
  
  // ===== ADX LOGIC: CONDITIONAL ON EXHAUSTION DEPTH =====
  if (adx <= config.MAX_ADX) {
    triggers.push(`ADX=${adx.toFixed(1)} <= ${config.MAX_ADX}`);
    score += 15;
  } else if (isExtremeExhaustion) {
    // EXTREME EXHAUSTION OVERRIDE: ADX becomes informational, not blocking
    adxWasOverridden = true;
    overrideReason = 'EXTREME_ADX_OVERRIDE';
    triggers.push(`ADX=${adx.toFixed(1)} > ${config.MAX_ADX} → OVERRIDDEN by extreme exhaustion (K=${stochK.toFixed(1)}, ADX slope=${adxSlope.toFixed(2)}) [${overrideReason}]`);
    score += 5;
  } else if (isModerateExhaustion) {
    // MODERATE EXHAUSTION: ADX already validated via slope override
    overrideReason = 'MODERATE_ADX_SLOPE_OVERRIDE';
    triggers.push(`ADX=${adx.toFixed(1)} validated for moderate exhaustion [${overrideReason}]`);
    score += 5;
  } else {
    // Normal case: high ADX without exhaustion = penalty
    score -= 40;
    triggers.push(`ADX=${adx.toFixed(1)} > ${config.MAX_ADX} (PENALTY - not in exhaustion tier)`);
  }
  
  // ADX slope penalty - prevents knife-catching during acceleration
  // Not applied during exhaustion tiers (already validated)
  if (!isExtremeExhaustion && !isModerateExhaustion && adxSlope > 0.25) {
    triggers.push(`ADX rising (slope=${adxSlope.toFixed(2)}) — trend acceleration risk`);
    score -= 25;
  }
  
  // Momentum shift check (MACD histogram improving)
  const macdImproving = macdHist > prevMacdHist;
  if (config.REQUIRE_MOMENTUM_SHIFT && macdImproving) {
    triggers.push('MACD histogram improving');
    score += 20;
  }
  
  // Volume exhaustion (selling drying up)
  if (volumeRatio < 0.8) {
    triggers.push(`Volume declining: ${(volumeRatio * 100).toFixed(0)}%`);
    score += 10;
  }
  
  // Detection logic: any exhaustion tier qualifies
  const detected = score >= 70 || isExtremeExhaustion || isModerateExhaustion;
  
  // Ensure minimum confidence based on tier
  let effectiveConfidence = score;
  if (isExtremeExhaustion) {
    effectiveConfidence = Math.max(70, score);
  } else if (isModerateExhaustion) {
    effectiveConfidence = Math.max(60, score); // Lower confidence floor for probe tier
  }
  
  return {
    detected,
    direction: 'long',
    confidence: Math.min(100, Math.max(0, effectiveConfidence)),
    exhaustionScore: score,
    triggers,
    gatesToBypass: detected ? [
      'TIER_0_DEEP_OVERSOLD',
      'TIER_1_SEVERE_OVERSOLD', 
      'HTF_EXTREME_OVERSOLD_BLOCK'
    ] : [],
    isExtremeExhaustion,
    adxWasOverridden,
    isModerateExhaustion,
    exhaustionTier,
    tag,
    overrideReason,
  };
}

// ============= OVERBOUGHT EXHAUSTION CHECK (FOR SHORTS) =============

function checkOverboughtExhaustion(trendData: any): ExhaustionCheck {
  const stochK = trendData?.timeframes?.['4h']?.indicators?.stochRsi?.k ?? 
                 trendData?.stochasticRsi?.['4h']?.k ?? 
                 trendData?.stochasticRsi?.aggregated?.k ?? 50;
  const percentB = trendData?.bollingerBands?.['4h']?.percentB ?? 50;
  const adx = trendData?.volatility?.adx ?? trendData?.adx ?? 0;
  const adxSlope = trendData?.volatility?.adxSlope ?? trendData?.adxSlope ?? 0;
  const htf4h = trendData?.timeframes?.['4h']?.trend ?? trendData?.htfTrend4h ?? 'neutral';
  const hasDivergence = trendData?.momentum?.hasDivergence ?? false;
  const momentumDirection = trendData?.momentum?.direction ?? 'neutral';
  const momentumScore = trendData?.momentum?.score ?? 0;
  
  // VWAP distance check for extreme exhaustion validation
  const vwapDistance = trendData?.vwap?.distancePercent ?? 0;
  const atr = trendData?.volatility?.atr ?? trendData?.atr ?? 0;
  const currentPrice = trendData?.price ?? trendData?.currentPrice ?? 0;
  const vwap = trendData?.vwap?.value ?? currentPrice;
  const atrDistanceFromVwap = atr > 0 && currentPrice > 0 
    ? Math.abs(currentPrice - vwap) / atr 
    : 0;
  
  const config = MEAN_REVERSION_CONFIG.SHORT;
  const extremeConfig = MEAN_REVERSION_CONFIG.EXTREME_EXHAUSTION;
  const moderateConfig = MEAN_REVERSION_CONFIG.MODERATE_EXHAUSTION;
  const triggers: string[] = [];
  let score = 0;
  let isExtremeExhaustion = false;
  let isModerateExhaustion = false;
  let adxWasOverridden = false;
  let exhaustionTier: 'EXTREME' | 'STRONG' | 'MODERATE' | 'NONE' = 'NONE';
  let tag: string | null = null;
  
  // ===== EXTREME EXHAUSTION DETECTION (K >= 90) =====
  // When K is at statistical extremes, ADX becomes informational, not blocking
  // Momentum floor prevents entries when momentum strongly opposes direction
  // Momentum delta check (Rec #1) confirms buying pressure is easing
  const isDeepExhaustion = stochK >= extremeConfig.SHORT_K_EXTREME;
  const adxNotAccelerating = adxSlope <= extremeConfig.MAX_ADX_SLOPE;
  const sufficientDistance = atrDistanceFromVwap >= extremeConfig.MIN_ATR_DISTANCE_FROM_VWAP;
  
  // Momentum floor: for SHORT, momentum must not be strongly bullish (score < threshold)
  const extremeMomentumFloor = extremeConfig.MIN_MOMENTUM_SCORE ?? 20;
  const momentumNotOpposing = momentumScore < extremeMomentumFloor;
  
  // Momentum delta check (Recommendation #1): Confirm buying pressure is easing
  // For SHORTS: momentum should be declining (delta negative)
  const prevMomentumScore = trendData?.momentum?.prevScore ?? momentumScore;
  const momentumDelta = momentumScore - prevMomentumScore;
  const requireDelta = extremeConfig.REQUIRE_MOMENTUM_IMPROVING ?? true;
  const minDelta = extremeConfig.MIN_MOMENTUM_DELTA ?? 15;
  const momentumImproving = !requireDelta || momentumDelta <= -minDelta; // For SHORT: delta must be negative
  
  // Track override reason for diagnostics
  let overrideReason: 'EXTREME_ADX_OVERRIDE' | 'EXTREME_REGIME_OVERRIDE' | 'MODERATE_ADX_SLOPE_OVERRIDE' | null = null;
  
  if (isDeepExhaustion && adxNotAccelerating && sufficientDistance && momentumNotOpposing && momentumImproving) {
    isExtremeExhaustion = true;
    exhaustionTier = 'EXTREME';
    triggers.push(`EXTREME EXHAUSTION: K=${stochK.toFixed(1)} >= ${extremeConfig.SHORT_K_EXTREME}, ADX slope=${adxSlope.toFixed(2)} <= ${extremeConfig.MAX_ADX_SLOPE}, VWAP distance=${atrDistanceFromVwap.toFixed(1)} ATRs, momentum=${momentumScore.toFixed(0)} < ${extremeMomentumFloor}, Δmomentum=${momentumDelta.toFixed(0)} <= -${minDelta}`);
  } else if (isDeepExhaustion) {
    // Log rejection with specific reason
    const reasons: string[] = [];
    if (!momentumNotOpposing) reasons.push(`momentum=${momentumScore.toFixed(0)} >= ${extremeMomentumFloor} (opposing)`);
    if (!momentumImproving) reasons.push(`Δmomentum=${momentumDelta.toFixed(0)} > -${minDelta} (not declining)`);
    if (!adxNotAccelerating) reasons.push(`adxSlope=${adxSlope.toFixed(2)} > ${extremeConfig.MAX_ADX_SLOPE} (accelerating)`);
    if (!sufficientDistance) reasons.push(`VWAP dist=${atrDistanceFromVwap.toFixed(1)} < ${extremeConfig.MIN_ATR_DISTANCE_FROM_VWAP} ATRs`);
    triggers.push(`EXTREME_EXHAUSTION_REJECTED: K=${stochK.toFixed(1)} qualifies, but ${reasons.join(', ')}`);
  }
  
  // ===== MODERATE EXHAUSTION DETECTION (K 85-90) =====
  // Probabilistic probe - requires momentum confirmation (bearish for shorts)
  if (!isExtremeExhaustion && moderateConfig.ENABLED) {
    const inModerateKRange = stochK >= moderateConfig.SHORT_K_MIN && stochK < moderateConfig.SHORT_K_MAX;
    // For SHORTS: momentum must be negative (bearish)
    const hasMomentumConfirmation = momentumScore <= -moderateConfig.MIN_MOMENTUM_SCORE;
    const momentumAligned = !moderateConfig.REQUIRE_ALIGNED_MOMENTUM || momentumDirection === 'bearish';
    
    // ADX check: either ADX <= 35 OR ADX slope <= 0 (trend exhausting)
    const adxInRange = adx <= moderateConfig.MAX_ADX;
    const adxSlopeOverride = moderateConfig.ALLOW_ADX_SLOPE_OVERRIDE && adxSlope <= moderateConfig.MAX_ADX_SLOPE_FOR_OVERRIDE;
    const adxConditionMet = adxInRange || adxSlopeOverride;
    
    if (inModerateKRange && hasMomentumConfirmation && momentumAligned && adxConditionMet) {
      isModerateExhaustion = true;
      exhaustionTier = 'MODERATE';
      tag = moderateConfig.TAG;
      triggers.push(
        `MODERATE EXHAUSTION: K=${stochK.toFixed(1)} in [${moderateConfig.SHORT_K_MIN}-${moderateConfig.SHORT_K_MAX}], ` +
        `momentum=${momentumScore.toFixed(0)} <= -${moderateConfig.MIN_MOMENTUM_SCORE}, direction=${momentumDirection}, ` +
        `ADX=${adx.toFixed(1)}${adxSlopeOverride ? ` (slope override: ${adxSlope.toFixed(2)})` : ''}`
      );
      score += 25;
    } else if (inModerateKRange) {
      // Log why moderate tier wasn't triggered (diagnostic)
      const reasons: string[] = [];
      if (!hasMomentumConfirmation) reasons.push(`momentum ${momentumScore.toFixed(0)} > -${moderateConfig.MIN_MOMENTUM_SCORE}`);
      if (!momentumAligned) reasons.push(`direction ${momentumDirection} != bearish`);
      if (!adxConditionMet) reasons.push(`ADX ${adx.toFixed(1)} > ${moderateConfig.MAX_ADX} and slope ${adxSlope.toFixed(2)} > 0`);
      triggers.push(`MODERATE_EXHAUSTION_REJECTED (K=${stochK.toFixed(1)}): ${reasons.join(', ')}`);
    }
  }
  
  // Stricter thresholds for SHORT (Strong tier)
  if (stochK >= config.K_THRESHOLD) {
    triggers.push(`K=${stochK.toFixed(1)} >= ${config.K_THRESHOLD}`);
    score += 30;
    if (exhaustionTier === 'NONE') exhaustionTier = 'STRONG';
  }
  
  if (percentB >= config.PERCENT_B_THRESHOLD) {
    triggers.push(`%B=${percentB.toFixed(1)} >= ${config.PERCENT_B_THRESHOLD}`);
    score += 25;
  }
  
  // ===== ADX LOGIC: CONDITIONAL ON EXHAUSTION DEPTH =====
  if (adx <= config.MAX_ADX) {
    triggers.push(`ADX=${adx.toFixed(1)} <= ${config.MAX_ADX}`);
    score += 15;
  } else if (isExtremeExhaustion) {
    // EXTREME EXHAUSTION OVERRIDE: ADX becomes informational, not blocking
    adxWasOverridden = true;
    overrideReason = 'EXTREME_ADX_OVERRIDE';
    triggers.push(`ADX=${adx.toFixed(1)} > ${config.MAX_ADX} → OVERRIDDEN by extreme exhaustion (K=${stochK.toFixed(1)}, ADX slope=${adxSlope.toFixed(2)}) [${overrideReason}]`);
    score += 5;
  } else if (isModerateExhaustion) {
    // MODERATE EXHAUSTION: ADX already validated via slope override
    overrideReason = 'MODERATE_ADX_SLOPE_OVERRIDE';
    triggers.push(`ADX=${adx.toFixed(1)} validated for moderate exhaustion [${overrideReason}]`);
    score += 5;
  } else {
    // Normal case: high ADX without extreme exhaustion = even stronger penalty for shorts
    score -= 50;
    triggers.push(`ADX=${adx.toFixed(1)} > ${config.MAX_ADX} (STRONG PENALTY - not in exhaustion tier)`);
  }
  
  // HTF veto for shorts - HARD BLOCK if 4h is bullish
  // Note: This remains a hard block even during exhaustion tiers
  if (config.REQUIRE_HTF_NOT_BULLISH && htf4h === 'bullish') {
    triggers.push('4h bullish - SHORT blocked');
    score -= 100; // Hard block
  }
  
  // Require divergence for shorts (relaxed for moderate tier)
  if (config.REQUIRE_BEARISH_DIVERGENCE && !isModerateExhaustion) {
    if (hasDivergence && momentumDirection !== 'bullish') {
      triggers.push('Bearish divergence confirmed');
      score += 25;
    } else {
      score -= 20;
      triggers.push('No bearish divergence (PENALTY)');
    }
  }
  
  // Additional safety: momentum must not be strongly bullish
  if (momentumDirection === 'bullish' && momentumScore >= 15) {
    triggers.push(`Momentum still strongly bullish (score=${momentumScore})`);
    score -= 30;
  }
  
  // Detection logic: any exhaustion tier qualifies
  const detected = score >= 75 || isExtremeExhaustion || isModerateExhaustion;
  
  // Ensure minimum confidence based on tier
  let effectiveConfidence = score;
  if (isExtremeExhaustion) {
    effectiveConfidence = Math.max(70, score);
  } else if (isModerateExhaustion) {
    effectiveConfidence = Math.max(60, score);
  }
  
  return {
    detected,
    direction: 'short',
    confidence: Math.min(100, Math.max(0, effectiveConfidence)),
    exhaustionScore: score,
    triggers,
    gatesToBypass: detected ? [
      'TIER_0_DEEP_OVERBOUGHT',
      'TIER_1_SEVERE_OVERBOUGHT',
      'HTF_EXTREME_OVERBOUGHT_BLOCK'
    ] : [],
    isExtremeExhaustion,
    adxWasOverridden,
    isModerateExhaustion,
    exhaustionTier,
    tag,
    overrideReason,
  };
}

// ============= MAIN EXHAUSTION DETECTION =============

/**
 * Main entry point for exhaustion detection
 * Runs BEFORE blocking gates to prevent gate collision
 * Returns signal with direction-aware gate bypasses
 * 
 * FIX: Evaluates exhaustion FIRST, then applies regime as modifier (not blocker)
 * when extreme exhaustion is detected. This prevents the deadlock where
 * regime blocks MR before exhaustion is even evaluated.
 * 
 * @param options.skipRegimeGating - When true, bypasses isMeanReversionAllowed() check.
 *   Used by the ADX transitional zone (18-22) bypass, which already constrains the ADX range
 *   and doesn't need the regime filter to re-block based on trend phase classification.
 */
export function detectExhaustion(trendData: any, options?: { skipRegimeGating?: boolean }): ExhaustionSignal {
  // 1. FIRST: Evaluate exhaustion checks BEFORE regime gating
  // This prevents the regime from blocking detection of extreme exhaustion
  const oversoldSignal = checkOversoldExhaustion(trendData);
  const overboughtSignal = checkOverboughtExhaustion(trendData);
  
  // 2. Classify regime using orthogonal checks
  const trendPhase = classifyTrendPhase(trendData);
  const expansionState = classifyExpansionState(trendData);
  
  // 3. Check if regime allows mean reversion
  //    skipRegimeGating: ADX transitional zone (18-22) already constrains the range,
  //    so we don't need classifyTrendPhase to re-block (avoids the EARLY_TREND dead zone)
  const skipRegime = options?.skipRegimeGating === true;
  const regimeAllowsMR = skipRegime || isMeanReversionAllowed(trendPhase, expansionState);
  
  // 4. CRITICAL: Extreme exhaustion can override regime blocking
  // If K is at statistical extremes, regime becomes informational, not blocking
  const extremeExhaustionDetected = oversoldSignal.isExtremeExhaustion || overboughtSignal.isExtremeExhaustion;
  
  // Log regime override for diagnostics
  if (skipRegime) {
    console.log(
      `[MEAN_REVERSION] REGIME_GATING_SKIPPED: Called with skipRegimeGating=true ` +
      `(phase=${trendPhase}/${expansionState}, would have ${isMeanReversionAllowed(trendPhase, expansionState) ? 'PASSED' : 'BLOCKED'})`
    );
  } else if (extremeExhaustionDetected && !regimeAllowsMR) {
    const stochK = trendData?.timeframes?.['4h']?.indicators?.stochRsi?.k ?? 
                   trendData?.stochasticRsi?.['4h']?.k ?? 
                   trendData?.stochasticRsi?.aggregated?.k ?? 50;
    console.log(
      `[MEAN_REVERSION] EXTREME_EXHAUSTION_OVERRIDE: Regime ${trendPhase}/${expansionState} would block, ` +
      `but K=${stochK.toFixed(1)} at extreme → allowing evaluation`
    );
  }
  
  // 5. Determine if we should proceed
  // Proceed if: regime allows MR OR extreme exhaustion detected OR regime gating skipped
  const allowed = regimeAllowsMR || extremeExhaustionDetected;
  
  if (!allowed) {
    // NEAR-MISS DIAGNOSTICS: Log how close we were to qualifying
    const stochK = trendData?.timeframes?.['4h']?.indicators?.stochRsi?.k ?? 
                   trendData?.stochasticRsi?.['4h']?.k ?? 
                   trendData?.stochasticRsi?.aggregated?.k ?? 50;
    const percentB = trendData?.bollingerBands?.['4h']?.percentB ?? 50;
    const adx = trendData?.volatility?.adx ?? trendData?.adx ?? 0;
    const adxSlope = trendData?.volatility?.adxSlope ?? trendData?.adxSlope ?? 0;
    const momentumScore = trendData?.momentum?.score ?? 0;
    const symbol = trendData?.symbol ?? 'unknown';
    const distToExtremeOversold = Math.abs(stochK - 10);
    const distToExtremeOverbought = Math.abs(stochK - 90);
    const nearestExtremeK = Math.min(distToExtremeOversold, distToExtremeOverbought);
    console.log(
      `[EXHAUSTION_NEAR_MISS] ${symbol} REGIME_BLOCKED | ` +
      `phase=${trendPhase}/${expansionState} | ` +
      `K=${stochK.toFixed(1)} (dist_to_extreme=${nearestExtremeK.toFixed(1)}) | ` +
      `%B=${percentB.toFixed(1)} | ADX=${adx.toFixed(1)} slope=${adxSlope.toFixed(2)} | ` +
      `momentum=${momentumScore.toFixed(0)} | ` +
      `oversold_score=${oversoldSignal.exhaustionScore} overbought_score=${overboughtSignal.exhaustionScore} | ` +
      `oversold_triggers=[${oversoldSignal.triggers.join('; ')}] | ` +
      `overbought_triggers=[${overboughtSignal.triggers.join('; ')}]`
    );
    return {
      detected: false,
      direction: null,
      confidence: 0,
      exhaustionScore: 0,
      trendPhase,
      expansionState,
      allowed: false,
      triggers: [`Regime ${trendPhase}/${expansionState} blocks mean reversion`],
      gateBypasses: [],
      positionMultiplier: 0,
      qualityScore: 0,
      isExtremeExhaustion: false,
      adxWasOverridden: false,
      preRecoveryOverrideAllowed: false,
      isModerateExhaustion: false,
      exhaustionTier: 'NONE' as const,
      tag: null,
      overrideReason: null,
    };
  }
  
  // 6. Select stronger signal
  let selectedSignal: ExhaustionCheck;
  if (oversoldSignal.detected && overboughtSignal.detected) {
    // Both detected - use stronger
    selectedSignal = oversoldSignal.exhaustionScore >= overboughtSignal.exhaustionScore 
      ? oversoldSignal 
      : overboughtSignal;
  } else if (oversoldSignal.detected) {
    selectedSignal = oversoldSignal;
  } else if (overboughtSignal.detected) {
    selectedSignal = overboughtSignal;
  } else {
    // Neither detected - NEAR-MISS DIAGNOSTICS
    const stochK = trendData?.timeframes?.['4h']?.indicators?.stochRsi?.k ?? 
                   trendData?.stochasticRsi?.['4h']?.k ?? 
                   trendData?.stochasticRsi?.aggregated?.k ?? 50;
    const percentB = trendData?.bollingerBands?.['4h']?.percentB ?? 50;
    const adx = trendData?.volatility?.adx ?? trendData?.adx ?? 0;
    const adxSlope = trendData?.volatility?.adxSlope ?? trendData?.adxSlope ?? 0;
    const momentumScore = trendData?.momentum?.score ?? 0;
    const momentumDir = trendData?.momentum?.direction ?? 'neutral';
    const symbol = trendData?.symbol ?? 'unknown';
    const distToExtremeOversold = Math.abs(stochK - 10);
    const distToExtremeOverbought = Math.abs(stochK - 90);
    const nearestExtremeK = Math.min(distToExtremeOversold, distToExtremeOverbought);
    // Only log if reasonably close to any threshold (K within 25 of extreme)
    if (nearestExtremeK <= 25) {
      console.log(
        `[EXHAUSTION_NEAR_MISS] ${symbol} NOT_DETECTED | ` +
        `K=${stochK.toFixed(1)} (dist_to_extreme=${nearestExtremeK.toFixed(1)}, need ≤10 or ≥90) | ` +
        `%B=${percentB.toFixed(1)} | ADX=${adx.toFixed(1)} slope=${adxSlope.toFixed(2)} | ` +
        `momentum=${momentumScore.toFixed(0)} dir=${momentumDir} | ` +
        `phase=${trendPhase}/${expansionState} | ` +
        `oversold: score=${oversoldSignal.exhaustionScore} detected=${oversoldSignal.detected} tier=${oversoldSignal.exhaustionTier} | ` +
        `overbought: score=${overboughtSignal.exhaustionScore} detected=${overboughtSignal.detected} tier=${overboughtSignal.exhaustionTier} | ` +
        `oversold_triggers=[${oversoldSignal.triggers.join('; ')}] | ` +
        `overbought_triggers=[${overboughtSignal.triggers.join('; ')}]`
      );
    }
    return {
      detected: false,
      direction: null,
      confidence: 0,
      exhaustionScore: 0,
      trendPhase,
      expansionState,
      allowed: true,
      triggers: ['No exhaustion detected'],
      gateBypasses: [],
      positionMultiplier: 0,
      qualityScore: 0,
      isExtremeExhaustion: false,
      adxWasOverridden: false,
      preRecoveryOverrideAllowed: false,
      isModerateExhaustion: false,
      exhaustionTier: 'NONE' as const,
      tag: null,
      overrideReason: null,
    };
  }
  
  // 6. Calculate position multiplier with regime adjustment
  // Apply tier-specific sizing
  const moderateConfig = MEAN_REVERSION_CONFIG.MODERATE_EXHAUSTION;
  let positionMultiplier: number;
  
  if (selectedSignal.isModerateExhaustion) {
    // Moderate exhaustion uses its own position size (0.35x)
    positionMultiplier = moderateConfig.POSITION_SIZE;
  } else {
    // Standard calculation for extreme/strong tiers
    const config = selectedSignal.direction === 'long' 
      ? MEAN_REVERSION_CONFIG.LONG 
      : MEAN_REVERSION_CONFIG.SHORT;
    const phaseMultiplier = getPhasePositionMultiplier(trendPhase);
    positionMultiplier = config.POSITION_SIZE * phaseMultiplier;
    
    // Apply extreme exhaustion risk reduction
    if (selectedSignal.isExtremeExhaustion && selectedSignal.adxWasOverridden) {
      const extremeMultiplier = MEAN_REVERSION_CONFIG.EXTREME_EXHAUSTION.POSITION_SIZE_MULTIPLIER;
      positionMultiplier *= extremeMultiplier;
    }
  }
  
  // 7. Calculate quality score with CAP at 78
  const rawQuality = 55 + (selectedSignal.confidence * 0.3);
  const cappedQuality = Math.min(MEAN_REVERSION_CONFIG.MAX_QUALITY_SCORE, rawQuality);
  
  // 8. Build direction-aware gate bypasses
  const gateBypasses: GateBypass[] = selectedSignal.gatesToBypass.map(gate => ({
    gate,
    allowedDirection: selectedSignal.direction,
    reason: 'mean_reversion_exhaustion' as const,
    confidence: selectedSignal.confidence,
  }));
  
  // 9. Determine if pre-recovery override is allowed
  // Pre-recovery override requires: extreme exhaustion + non-accelerating ADX + sufficient VWAP distance
  const preRecoveryOverrideAllowed = 
    selectedSignal.isExtremeExhaustion && 
    selectedSignal.adxWasOverridden;
  
  // 10. Determine final override reason (may include regime override)
  let finalOverrideReason = selectedSignal.overrideReason;
  if (extremeExhaustionDetected && !regimeAllowsMR && !finalOverrideReason) {
    // Regime was overridden by extreme exhaustion
    finalOverrideReason = 'EXTREME_REGIME_OVERRIDE';
  }
  
  return {
    detected: true,
    direction: selectedSignal.direction,
    confidence: selectedSignal.confidence,
    exhaustionScore: selectedSignal.exhaustionScore,
    trendPhase,
    expansionState,
    allowed: true,
    triggers: selectedSignal.triggers,
    gateBypasses,
    positionMultiplier,
    qualityScore: cappedQuality,
    isExtremeExhaustion: selectedSignal.isExtremeExhaustion,
    adxWasOverridden: selectedSignal.adxWasOverridden,
    preRecoveryOverrideAllowed,
    isModerateExhaustion: selectedSignal.isModerateExhaustion,
    exhaustionTier: selectedSignal.exhaustionTier,
    tag: selectedSignal.tag,
    overrideReason: finalOverrideReason,
  };
}

// ============= SIGNAL PRECEDENCE CHECK =============

/**
 * Checks if a qualified trend signal exists that should take precedence
 * Returns adjustment to apply to mean reversion signal
 */
export function checkSignalPrecedence(
  meanReversionSignal: ExhaustionSignal,
  pendingTrendSignals: Array<{ symbol: string; qualityScore: number; strategy_name?: string }>
): { suppress: boolean; reduceSize: boolean; reason: string } {
  if (!meanReversionSignal.detected) {
    return { suppress: false, reduceSize: false, reason: '' };
  }
  
  // Find qualified trend signal for same symbol (would need symbol passed in real implementation)
  // For now, this is a template for integration
  const qualifiedTrendSignal = pendingTrendSignals.find(s => 
    s.qualityScore >= 70 &&
    !s.strategy_name?.includes('MEAN_REVERSION')
  );
  
  if (!qualifiedTrendSignal) {
    return { suppress: false, reduceSize: false, reason: '' };
  }
  
  if (qualifiedTrendSignal.qualityScore >= 78) {
    return { 
      suppress: true, 
      reduceSize: false, 
      reason: `Suppressed by trend signal Q=${qualifiedTrendSignal.qualityScore}` 
    };
  }
  
  return { 
    suppress: false, 
    reduceSize: true, 
    reason: `Reduced 50% due to trend signal Q=${qualifiedTrendSignal.qualityScore}` 
  };
}

// ============= STOP LOSS & TAKE PROFIT CALCULATION =============

export function calculateMeanReversionStop(
  entryPrice: number, 
  stopLossPercent: number, 
  direction: 'long' | 'short'
): number {
  if (direction === 'long') {
    return entryPrice * (1 - stopLossPercent / 100);
  } else {
    return entryPrice * (1 + stopLossPercent / 100);
  }
}

export function calculateMeanReversionTP(
  entryPrice: number, 
  takeProfitPercent: number, 
  direction: 'long' | 'short'
): number {
  if (direction === 'long') {
    return entryPrice * (1 + takeProfitPercent / 100);
  } else {
    return entryPrice * (1 - takeProfitPercent / 100);
  }
}
