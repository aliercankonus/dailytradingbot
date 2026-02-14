// ============= CENTRALIZED SCORING MODULE =============
// Single source of truth for quality score and reversal score calculations
// Used by: strategy-analyzer, execute-trade, monitor-positions

import { ADX_THRESHOLDS, ADX_PHASES, STOCHRSI_THRESHOLDS, RSI_THRESHOLDS, CONFIDENCE_THRESHOLDS, BREAKOUT_MODE_PARAMS, RISK_SEPARATION_THRESHOLDS, COMPONENT_CAPS, TIME_IN_EXTREME_PARAMS, TREND_STRENGTH_PARAMS, EXCEPTION_HIERARCHY, EXCEPTION_BUDGET, PRE_RECOVERY_PARAMS, REGIME_SCORE_PARAMS, STOCHRSI_DYNAMIC_PARAMS, MARKET_REGIME_CLASSIFIER, STRONG_ADX_UNIVERSAL_OVERRIDE_PARAMS, MOMENTUM_SCORE_BEHAVIOR_PARAMS, QUALITY_NEAR_MISS_BOOST_PARAMS, TREND_CONTINUATION_REENTRY_PARAMS, IMPULSE_CONTINUATION_PARAMS, PRICE_ACTION_PULLBACK_PARAMS, MOMENTUM_FALLBACK_DIRECTION_PARAMS, DIRECTION_REGIME_PARAMS, TIER2_WEIGHTED_CONFIRMATION, DIRECTIONAL_BIAS_ESCAPE_PARAMS, EXHAUSTION_REVERSAL_OVERRIDE_PARAMS, EXHAUSTION_ESCAPE_PARAMS, FOUR_STATE_REGIME, type AdxPhase, type ExceptionType, type MasterMarketRegime, type FourStateRegime, type DirectionRegime } from "./constants.ts";

// ============= ADX PHASE STATE MACHINE =============
// PHASE 1 IMPROVEMENT: Classify ADX into phases for context-aware behavior
// Instead of raw thresholds, each phase has specific trading rules

export const getAdxPhase = (adx: number): AdxPhase => {
  if (adx < ADX_PHASES.RANGE.max) return "RANGE";
  if (adx < ADX_PHASES.TRANSITION.max) return "TRANSITION";
  if (adx < ADX_PHASES.EARLY_TREND.max) return "EARLY_TREND";
  if (adx < ADX_PHASES.STRONG_TREND.max) return "STRONG_TREND";
  return "EXHAUSTION";
};

export const getAdxPhaseInfo = (adx: number): { 
  phase: AdxPhase; 
  tradeable: boolean; 
  description: string;
  exhaustionRisk: boolean;
  reversalSensitivityMultiplier: number;
} => {
  const phase = getAdxPhase(adx);
  const phaseConfig = ADX_PHASES[phase];
  
  // EXHAUSTION phase: increase reversal sensitivity by 50%
  const exhaustionRisk = phase === "EXHAUSTION";
  const reversalSensitivityMultiplier = exhaustionRisk ? 1.5 : 
    phase === "STRONG_TREND" ? 0.75 :  // Strong trends reduce reversal sensitivity
    1.0;
  
  return {
    phase,
    tradeable: phaseConfig.tradeable,
    description: phaseConfig.description,
    exhaustionRisk,
    reversalSensitivityMultiplier,
  };
};

// ============= BREAKOUT MODE DETECTION =============
// PHASE 1 IMPROVEMENT: Consolidated breakout mode flag
// When active: reduce StochRSI penalties, disable divergence hard gate (unless HTF confirms)

export interface BreakoutModeResult {
  isActive: boolean;
  confidence: number;  // 0-100
  reasons: string[];
  stochRsiPenaltyMultiplier: number;  // 0.5 when breakout mode active
  skipDivergenceGate: boolean;
}

export const detectBreakoutMode = (trendData: any): BreakoutModeResult => {
  const reasons: string[] = [];
  let confidence = 0;
  
  if (!trendData) {
    return { isActive: false, confidence: 0, reasons: ["No trend data"], stochRsiPenaltyMultiplier: 1.0, skipDivergenceGate: false };
  }
  
  const bollinger = trendData?.bollingerBands || {};
  const squeeze4h = bollinger['4h']?.squeeze || false;
  const squeezePercent4h = bollinger['4h']?.squeezePercent || 0;
  const squeeze1h = bollinger['1h']?.squeeze || false;
  
  const momentum = trendData?.momentum || {};
  const momentumState = momentum.state || "none";
  const macdExpanding = momentum.macdExpanding || false;
  const volumeConfirms = momentum.volumeConfirms || false;
  const volumeRatio = trendData?.volatility?.volumeRatio || 1.0;
  
  const adx = trendData?.volatility?.adx || 0;
  const adxRising = trendData?.volatility?.adxRising || false;
  
  // CORE BREAKOUT CONDITIONS:
  // 1. Squeeze is active (either 4h or 1h)
  const hasSqueezeActive = squeeze4h || squeeze1h;
  if (hasSqueezeActive) {
    confidence += 25;
    reasons.push(`Squeeze active (4h: ${squeeze4h}, 1h: ${squeeze1h})`);
  }
  
  // 2. Squeeze percent is significant (4h >= 50%)
  const hasSignificantSqueeze = squeezePercent4h >= BREAKOUT_MODE_PARAMS.MIN_SQUEEZE_PERCENT;
  if (hasSignificantSqueeze) {
    confidence += 20;
    reasons.push(`4h squeeze ${squeezePercent4h.toFixed(0)}% >= ${BREAKOUT_MODE_PARAMS.MIN_SQUEEZE_PERCENT}%`);
  }
  
  // 3. Volume is expanding
  const hasVolumeExpansion = volumeRatio >= BREAKOUT_MODE_PARAMS.MIN_VOLUME_RATIO;
  if (hasVolumeExpansion) {
    confidence += 20;
    reasons.push(`Volume expansion ${volumeRatio.toFixed(2)}x >= ${BREAKOUT_MODE_PARAMS.MIN_VOLUME_RATIO}x`);
  }
  
  // 4. Momentum is building
  const hasMomentumBuilding = momentumState === "building" || momentumState === "confirmed" || macdExpanding;
  if (hasMomentumBuilding) {
    confidence += 20;
    reasons.push(`Momentum ${momentumState}${macdExpanding ? " + MACD expanding" : ""}`);
  }
  
  // 5. ADX rising (optional but adds confidence)
  if (BREAKOUT_MODE_PARAMS.REQUIRE_ADX_RISING && adxRising) {
    confidence += 15;
    reasons.push(`ADX rising (${adx.toFixed(1)})`);
  } else if (!BREAKOUT_MODE_PARAMS.REQUIRE_ADX_RISING) {
    confidence += 10;  // Partial credit when not required
  }
  
  // BREAKOUT MODE REQUIRES: Squeeze + (Volume OR Momentum)
  const isActive = hasSqueezeActive && (hasVolumeExpansion || hasMomentumBuilding);
  
  // Breakout mode benefits:
  // - StochRSI penalty reduced by 50%
  // - Divergence gate can be skipped (unless HTF confirms divergence)
  const stochRsiPenaltyMultiplier = isActive ? BREAKOUT_MODE_PARAMS.STOCHRSI_PENALTY_REDUCTION : 1.0;
  const skipDivergenceGate = isActive && volumeConfirms;  // Only skip if volume confirms too
  
  return {
    isActive,
    confidence: Math.min(100, confidence),
    reasons,
    stochRsiPenaltyMultiplier,
    skipDivergenceGate,
  };
};

// ============= PHASE 4: TIME-IN-EXTREME PENALTY (DYNAMIC) =============
// PHASE 4 UPDATE: Dynamic thresholds based on ADX + capped contribution
// Tracks how long StochRSI has been at extreme levels
// K = 95 for 1 candle = early momentum, might continue
// K = 95 for 12 candles = exhausted move, reversal likely
// NEW: Stronger trends allow more time at extremes before penalty

export interface TimeInExtremePenalty {
  penalty: number;
  rawPenalty: number;        // Before cap applied
  cappedPenalty: number;     // After MAX_STOCHRSI_PENALTY cap
  barsAtExtreme: number;
  isExhausted: boolean;
  reason: string;
  adxTier: string;           // Which ADX tier was used
  dynamicThreshold: number;  // Dynamic MIN_BARS_FOR_PENALTY based on ADX
}

export const calculateTimeInExtremePenalty = (
  trendData: any,
  signalType: string
): TimeInExtremePenalty => {
  const stochRsi = trendData?.stochasticRsi || {};
  const barsAtExtreme = stochRsi.barsAtExtreme || {};
  const barsAtExtreme1h = barsAtExtreme['1h'] || { barsOverbought: 0, barsOversold: 0 };
  const barsAtExtreme4h = barsAtExtreme['4h'] || { barsOverbought: 0, barsOversold: 0 };
  
  const isLong = signalType === "bullish" || signalType === "long";
  
  // Get ADX for dynamic threshold calculation
  const adx = trendData?.volatility?.adx || trendData?.momentum?.adx || 20;
  
  // PHASE 4: Dynamic thresholds based on ADX
  // Stronger trends allow more bars at extreme before penalty kicks in
  const DP = STOCHRSI_DYNAMIC_PARAMS;
  let minBarsForPenalty: number;
  let adxTier: string;
  
  if (adx >= 35) {
    minBarsForPenalty = DP.BARS_FOR_PENALTY_BY_ADX.ADX_ABOVE_35;  // 10 bars
    adxTier = "ADX_ABOVE_35";
  } else if (adx >= 25) {
    minBarsForPenalty = DP.BARS_FOR_PENALTY_BY_ADX.ADX_25_35;     // 7 bars
    adxTier = "ADX_25_35";
  } else {
    minBarsForPenalty = DP.BARS_FOR_PENALTY_BY_ADX.ADX_BELOW_25;  // 5 bars (standard)
    adxTier = "ADX_BELOW_25";
  }
  
  // For LONG: overbought is bad (risky), oversold is good
  // For SHORT: oversold is bad (risky), overbought is good
  const riskyBars1h = isLong ? barsAtExtreme1h.barsOverbought : barsAtExtreme1h.barsOversold;
  const riskyBars4h = isLong ? barsAtExtreme4h.barsOverbought : barsAtExtreme4h.barsOversold;
  
  // Use the higher of the two timeframes for penalty calculation
  // 4h bars at extreme are more significant than 1h
  const effectiveBars = Math.max(riskyBars4h * 1.5, riskyBars1h);
  
  let rawPenalty = 0;
  let isExhausted = false;
  let reason = "";
  
  const P = TIME_IN_EXTREME_PARAMS;
  
  // PHASE 4: Scale thresholds based on dynamic minBarsForPenalty
  // Original thresholds: MIN=5, MODERATE=8, HIGH=12, EXTREME=16
  // Scale proportionally based on ADX tier
  const scaleFactor = minBarsForPenalty / P.MIN_BARS_FOR_PENALTY;
  const moderateBars = Math.round(P.MODERATE_BARS * scaleFactor);
  const highBars = Math.round(P.HIGH_BARS * scaleFactor);
  const extremeBars = Math.round(P.EXTREME_BARS * scaleFactor);
  
  if (effectiveBars < minBarsForPenalty) {
    // No penalty for fresh extremes (early momentum)
    reason = effectiveBars > 0 
      ? `Early extreme (${effectiveBars.toFixed(0)} bars < ${minBarsForPenalty} threshold for ${adxTier}) - no penalty` 
      : "Not at extreme";
  } else if (effectiveBars >= extremeBars) {
    // Exhausted momentum - use REDUCED penalties from STOCHRSI_DYNAMIC_PARAMS
    rawPenalty = DP.PENALTY_EXTREME;  // 25 (was 35)
    isExhausted = true;
    reason = `EXHAUSTED: ${effectiveBars.toFixed(0)} bars >= ${extremeBars} (${adxTier}) → +${rawPenalty} reversal`;
  } else if (effectiveBars >= highBars) {
    // High exhaustion risk
    rawPenalty = DP.PENALTY_HIGH;     // 18 (was 25)
    reason = `HIGH exhaustion: ${effectiveBars.toFixed(0)} bars >= ${highBars} (${adxTier}) → +${rawPenalty} reversal`;
  } else if (effectiveBars >= moderateBars) {
    // Moderate exhaustion risk
    rawPenalty = DP.PENALTY_MODERATE; // 12 (was 15)
    reason = `MODERATE exhaustion: ${effectiveBars.toFixed(0)} bars >= ${moderateBars} (${adxTier}) → +${rawPenalty} reversal`;
  } else {
    // Between minBarsForPenalty and moderateBars = early warning, minimal penalty
    rawPenalty = 4;  // Reduced from 5
    reason = `EARLY WARNING: ${effectiveBars.toFixed(0)} bars (${adxTier}) → +4 reversal`;
  }
  
  // PHASE 4 KEY: Cap StochRSI penalty contribution at MAX_STOCHRSI_PENALTY (20)
  // This ensures StochRSI alone can NEVER push exhaustion score over block threshold
  const cappedPenalty = Math.min(rawPenalty, DP.MAX_STOCHRSI_PENALTY);
  
  if (rawPenalty > cappedPenalty) {
    reason += ` [CAPPED: ${rawPenalty} → ${cappedPenalty}]`;
  }
  
  return {
    penalty: cappedPenalty,  // Use capped value as the actual penalty
    rawPenalty,
    cappedPenalty,
    barsAtExtreme: effectiveBars,
    isExhausted,
    reason,
    adxTier,
    dynamicThreshold: minBarsForPenalty,
  };
};

// ============= PHASE 3: TREND STRENGTH SCORING =============
// Replaces brittle boolean checks with quantified trend strength score
// Score >= 5 = full exception, score == 4 = partial exception, < 4 = reject

export interface TrendStrengthResult {
  score: number;
  decision: 'FULL' | 'PARTIAL' | 'REJECT';
  components: {
    confidence4hPoints: number;
    confidence1hPoints: number;
    adxPoints: number;
    momentumPoints: number;
  };
  reason: string;
}

export const calculateTrendStrength = (
  confidence4h: number,
  confidence1h: number,
  adx: number,
  momentumActive: boolean
): TrendStrengthResult => {
  const P = TREND_STRENGTH_PARAMS;
  
  // Calculate points from each component
  const confidence4hPoints = confidence4h >= P.CONFIDENCE_4H_THRESHOLD ? P.CONFIDENCE_4H_POINTS : 0;
  const confidence1hPoints = confidence1h >= P.CONFIDENCE_1H_THRESHOLD ? P.CONFIDENCE_1H_POINTS : 0;
  
  let adxPoints = 0;
  if (adx >= P.ADX_STRONG_THRESHOLD) {
    adxPoints = P.ADX_STRONG_POINTS;
  } else if (adx >= P.ADX_MODERATE_THRESHOLD) {
    adxPoints = P.ADX_MODERATE_POINTS;
  }
  
  const momentumPoints = momentumActive ? P.MOMENTUM_ACTIVE_POINTS : 0;
  
  const score = confidence4hPoints + confidence1hPoints + adxPoints + momentumPoints;
  
  let decision: 'FULL' | 'PARTIAL' | 'REJECT';
  let reason: string;
  
  if (score >= P.FULL_EXCEPTION_THRESHOLD) {
    decision = 'FULL';
    reason = `Trend strength ${score}/6 >= ${P.FULL_EXCEPTION_THRESHOLD} → FULL exception (no position reduction)`;
  } else if (score >= P.PARTIAL_EXCEPTION_THRESHOLD) {
    decision = 'PARTIAL';
    reason = `Trend strength ${score}/6 >= ${P.PARTIAL_EXCEPTION_THRESHOLD} → PARTIAL exception (50% position reduction)`;
  } else {
    decision = 'REJECT';
    reason = `Trend strength ${score}/6 < ${P.PARTIAL_EXCEPTION_THRESHOLD} → REJECT (insufficient trend support)`;
  }
  
  return {
    score,
    decision,
    components: {
      confidence4hPoints,
      confidence1hPoints,
      adxPoints,
      momentumPoints,
    },
    reason,
  };
};

// ============= PHASE 3: EXCEPTION HIERARCHY =============
// Determines which exception type should be applied based on priority order
// Prevents non-deterministic behavior when multiple exceptions could apply

export interface ExceptionResult {
  exceptionType: ExceptionType;
  priority: number;
  positionMultiplier: number;
  reason: string;
  details: {
    reversalOverrideEligible: boolean;
    strongTrendEligible: boolean;
    microTrendEligible: boolean;
    trendStrength?: TrendStrengthResult;
  };
}

export const determineExceptionPriority = (
  reversalOverrideConditions: {
    eligible: boolean;
    score: number;
    positionMultiplier: number;
  },
  strongTrendConditions: {
    eligible: boolean;
    trendStrength: TrendStrengthResult;
    positionMultiplier: number;
  },
  microTrendConditions: {
    eligible: boolean;
    positionMultiplier: number;
  }
): ExceptionResult => {
  // Priority 1: Reversal Override (highest priority, rare)
  if (reversalOverrideConditions.eligible) {
    return {
      exceptionType: 'REVERSAL_OVERRIDE',
      priority: EXCEPTION_HIERARCHY.REVERSAL_OVERRIDE,
      positionMultiplier: reversalOverrideConditions.positionMultiplier,
      reason: `REVERSAL_OVERRIDE applied (score=${reversalOverrideConditions.score}) - ignoring other exceptions`,
      details: {
        reversalOverrideEligible: true,
        strongTrendEligible: strongTrendConditions.eligible,
        microTrendEligible: microTrendConditions.eligible,
      },
    };
  }
  
  // Priority 2: Strong Trend Exception
  if (strongTrendConditions.eligible) {
    return {
      exceptionType: 'STRONG_TREND',
      priority: EXCEPTION_HIERARCHY.STRONG_TREND,
      positionMultiplier: strongTrendConditions.positionMultiplier,
      reason: `STRONG_TREND exception (${strongTrendConditions.trendStrength.decision}) - ${strongTrendConditions.trendStrength.reason}`,
      details: {
        reversalOverrideEligible: false,
        strongTrendEligible: true,
        microTrendEligible: microTrendConditions.eligible,
        trendStrength: strongTrendConditions.trendStrength,
      },
    };
  }
  
  // Priority 3: Micro-Trend Bypass (lowest priority)
  if (microTrendConditions.eligible) {
    return {
      exceptionType: 'MICRO_TREND',
      priority: EXCEPTION_HIERARCHY.MICRO_TREND,
      positionMultiplier: microTrendConditions.positionMultiplier,
      reason: `MICRO_TREND bypass applied - lower TF alignment when 4h neutral`,
      details: {
        reversalOverrideEligible: false,
        strongTrendEligible: false,
        microTrendEligible: true,
      },
    };
  }
  
  // No exception applies
  return {
    exceptionType: 'NONE',
    priority: 99,
    positionMultiplier: 1.0,
    reason: 'No exception applied - standard signal processing',
    details: {
      reversalOverrideEligible: false,
      strongTrendEligible: false,
      microTrendEligible: false,
    },
  };
};

// ============= PHASE 3: EXCEPTION BUDGET TRACKING =============
// Prevents exception abuse by tracking usage and applying penalties

export interface ExceptionBudgetResult {
  withinBudget: boolean;
  exceptionsUsed: number;
  lookbackWindow: number;
  positionReduction: number;
  shouldDisableExceptions: boolean;
  reason: string;
}

export const checkExceptionBudget = (
  recentExceptions: ExceptionType[],  // Array of exception types from recent trades
  currentExceptionType: ExceptionType
): ExceptionBudgetResult => {
  const B = EXCEPTION_BUDGET;
  
  // Count non-NONE exceptions in the lookback window
  const recentNonNone = recentExceptions
    .slice(-B.LOOKBACK_TRADES)
    .filter(e => e !== 'NONE');
  
  const exceptionsUsed = recentNonNone.length;
  
  // Check for consecutive exceptions (worst case)
  let consecutiveCount = 0;
  for (let i = recentExceptions.length - 1; i >= 0 && recentExceptions[i] !== 'NONE'; i--) {
    consecutiveCount++;
  }
  
  // If adding current exception, would we exceed budget?
  const wouldExceed = exceptionsUsed >= B.MAX_EXCEPTIONS && currentExceptionType !== 'NONE';
  const shouldDisable = consecutiveCount >= B.DISABLE_THRESHOLD;
  
  if (shouldDisable) {
    return {
      withinBudget: false,
      exceptionsUsed,
      lookbackWindow: B.LOOKBACK_TRADES,
      positionReduction: 0, // Force reject
      shouldDisableExceptions: true,
      reason: `EXCEPTION BUDGET EXCEEDED: ${consecutiveCount} consecutive exceptions (>= ${B.DISABLE_THRESHOLD}) - exceptions temporarily disabled`,
    };
  }
  
  if (wouldExceed) {
    return {
      withinBudget: false,
      exceptionsUsed,
      lookbackWindow: B.LOOKBACK_TRADES,
      positionReduction: B.OVER_BUDGET_POSITION_REDUCTION,
      shouldDisableExceptions: false,
      reason: `EXCEPTION BUDGET WARNING: ${exceptionsUsed}/${B.MAX_EXCEPTIONS} exceptions in last ${B.LOOKBACK_TRADES} trades - position reduced by ${(1 - B.OVER_BUDGET_POSITION_REDUCTION) * 100}%`,
    };
  }
  
  return {
    withinBudget: true,
    exceptionsUsed,
    lookbackWindow: B.LOOKBACK_TRADES,
    positionReduction: 1.0,
    shouldDisableExceptions: false,
    reason: `Exception budget OK: ${exceptionsUsed}/${B.MAX_EXCEPTIONS} in last ${B.LOOKBACK_TRADES} trades`,
  };
};
// ============= STOCHRSI-RSI CONFLICT RESOLUTION =============
// When StochRSI is at extremes, RSI signals are weighted at 50% to prevent
// self-canceling signals where RSI momentum continuation conflicts with StochRSI reversal risk
export const getStochRsiWeightedRsiScore = (
  rsiScore: number,
  stochRsiK: number,
  isLong: boolean
): { score: number; wasReduced: boolean; isExtreme: boolean } => {
  const extremeThreshold = isLong 
    ? STOCHRSI_THRESHOLDS.EXTREME_OVERBOUGHT  // 90
    : STOCHRSI_THRESHOLDS.EXTREME_OVERSOLD;   // 10
    
  const isExtreme = isLong 
    ? stochRsiK > extremeThreshold
    : stochRsiK < extremeThreshold;
  
  if (isExtreme) {
    // StochRSI extreme = RSI signal weighted at 50%
    return { score: Math.round(rsiScore * 0.5), wasReduced: true, isExtreme: true };
  }
  
  return { score: rsiScore, wasReduced: false, isExtreme: false };
};

// ============= ADX-BASED WEIGHT =============
// ============= ADX-SCALED REVERSAL WEIGHT (Issue #6 Fix) =============
// Graduated ADX-based reduction of reversal score impact
// Stronger trends get more aggressive reduction of reversal signals
// REPLACES the flat 50% reduction previously documented
// 
// WEIGHT TABLE (see also: ADX_REVERSAL_WEIGHTS in constants.ts):
//   ADX >= 40: 0.40 (60% reduction - extreme trend)
//   ADX >= 35: 0.50 (50% reduction - exceptional trend)
//   ADX >= 30: 0.60 (40% reduction - very strong trend)
//   ADX >= 25: 0.75 (25% reduction - strong trend)
//   ADX >= 20: 0.85 (15% reduction - moderate trend)
//   ADX < 20:  1.00 (no reduction - weak/no trend)
//
export const getAdxWeight = (adxValue: number): number => {
  if (adxValue >= ADX_THRESHOLDS.EXTREME) return 0.40;      // 60% reduction
  if (adxValue >= ADX_THRESHOLDS.EXCEPTIONAL) return 0.50;  // 50% reduction
  if (adxValue >= ADX_THRESHOLDS.VERY_STRONG) return 0.60;  // 40% reduction
  if (adxValue >= ADX_THRESHOLDS.STRONG) return 0.75;       // 25% reduction
  if (adxValue >= ADX_THRESHOLDS.MINIMUM) return 0.85;      // 15% reduction
  return 1.00;  // No reduction - weak trend
};

// ============= VOLUME SCORE (0-10 points) =============
// Volume confirmation improves entry quality
export const getVolumeScore = (
  volumeConfirms: boolean, 
  volumeSpike: boolean, 
  volumeRatio: number, 
  hasRangeExpansion: boolean = false,
  trend: string = "neutral"
): number => {
  // Perfect volume signal: confirms + spike + range expansion
  if (volumeConfirms && volumeSpike && hasRangeExpansion && volumeRatio > 2.0) {
    return 10;
  }
  
  // Strong volume: confirms + spike + high ratio
  if (volumeConfirms && volumeSpike && volumeRatio > 2.0) {
    return 8;
  }
  
  // Volume confirms with above-average ratio and range expansion
  if (volumeConfirms && volumeRatio > 1.5 && hasRangeExpansion) {
    return 7;
  }
  
  // Volume confirms with above-average ratio (no range expansion)
  if (volumeConfirms && volumeRatio > 1.5) {
    return 5;
  }
  
  // Volume confirms at normal levels
  if (volumeConfirms) {
    return 4;
  }
  
  // Spike without confirmation needs range expansion to score
  if (volumeSpike && hasRangeExpansion && volumeRatio > 1.5) {
    return 4;
  }
  
  // Above average volume with range expansion
  if (volumeRatio > 1.5 && hasRangeExpansion) {
    return 3;
  }
  
  // Above average volume without range expansion (less reliable)
  if (volumeRatio > 1.5) {
    return 2;
  }
  
  // Slightly above average
  if (volumeRatio > 1.2) {
    return 2;  // IMPROVED: Was 1, now 2 (120%+ volume = decent confirmation)
  }
  
  // CRITICAL: Very low volume (< 10%) = holiday/weekend conditions = 0 points
  // This prevents false signals in illiquid markets
  if (volumeRatio < 0.1) {
    return 0;
  }
  
  // PARTIAL CREDIT: At least average volume (volumeRatio >= 1.0)
  // This prevents zero volume score in normal market conditions
  if (volumeRatio >= 1.0) {
    return 2;  // IMPROVED: Was 1, now 2 (average volume = baseline credit)
  }
  
  // IMPROVED: 50-100% volume = still reasonable for momentum trades
  // Strong moves can happen on slightly below average volume
  if (volumeRatio >= 0.5) {
    return 2;  // Was 1 at 0.3+, now 2 at 0.5+ (better scoring for near-average volume)
  }
  
  // Low but not critical volume (30-50% of average) - minimal credit
  if (volumeRatio >= 0.3) {
    return 1;  // Kept as 1 for genuinely low volume
  }
  
  // Very low volume (10-30%) in any condition - no bonus
  return 0;
};

// ============= CONFIDENCE PENALTY - REMOVED =============
// RATIONALE: High confidence indicates STRONG multi-timeframe alignment,
// which is a POSITIVE signal in professional trading systems.
// The original penalty was counterproductive:
// - Penalized 85%+ confidence by -25 points when this indicates all timeframes agree
// - This duplicated logic already handled by ADX, StochRSI, and HTF gates
// - Professional systems REWARD high confidence as it indicates institutional alignment
// 
// Compensation: MIN_QUALITY_THRESHOLD raised from 55 to 65 to maintain selectivity
export const getConfidencePenalty = (
  confidence: number, 
  adx: number = 0, 
  momentumConfirmed: boolean = false
): number => {
  // REMOVED: High confidence is a positive signal, not a negative one
  // Quality filtering is now handled by:
  // 1. ADX phase state machine (trend strength)
  // 2. StochRSI extreme gates (overextension)
  // 3. Time-in-extreme penalty (exhaustion detection)
  // 4. Unified reversal score (actual reversal signals)
  // 5. Raised quality threshold (65 instead of 55)
  return 0;
};

// ============= ADX SCORE (0-25 points) =============
// PHASE 3 UPDATE: Increased penalty for ADX falling when ADX is weak
export const getAdxScore = (adx: number, adxSlope?: number): number => {
  let baseScore: number;
  
  if (adx >= ADX_THRESHOLDS.EXTREME) baseScore = 25;
  else if (adx >= ADX_THRESHOLDS.VERY_STRONG) baseScore = 22;
  else if (adx >= ADX_THRESHOLDS.STRONG) baseScore = 18;
  else if (adx >= ADX_THRESHOLDS.MINIMUM) baseScore = 14;
  else if (adx >= ADX_THRESHOLDS.WEAK) baseScore = 8;
  else if (adx >= ADX_THRESHOLDS.VERY_WEAK) baseScore = 4;
  else baseScore = 0;
  
  // PHASE 3: Apply ADX falling penalty
  // Falling ADX with weak trend = double penalty
  if (adxSlope !== undefined && adxSlope < 0) {
    if (adx < 25) {
      // Weak AND falling ADX = -8 penalty (was -3)
      baseScore = Math.max(0, baseScore - 8);
    } else {
      // Strong but falling ADX = -5 penalty (was -3)
      baseScore = Math.max(0, baseScore - 5);
    }
  }
  
  return baseScore;
};

// ============= MOMENTUM SCORE (0-20 points) =============
// IMPROVED: Better scoring for momentum continuation during strong moves
// ENHANCED: StochRSI decline bonus for early bearish/bullish momentum detection
// PHASE 1 FIX: Add momentum floor for very strong ADX (trend strength IS momentum)
export const getMomentumScore = (momentum: any, adx: number = 0, adxRising: boolean = false, stochRsiData?: { k: number; d: number }, adxSlope?: number): number => {
  if (!momentum) {
    // PHASE 1 FIX: Even without momentum data, very high ADX IS momentum confirmation
    // ADX >= 40 with non-falling slope = trend strength is the momentum
    if (adx >= 40 && (adxSlope === undefined || adxSlope > -0.5)) {
      return 8;  // Floor at 8/20 for very strong trends
    }
    return 0;
  }
  
  const state = momentum.state || "none";
  const confirms = momentum.confirms || false;
  const volumeConfirms = momentum.volumeConfirms || false;
  // Fix: check both boolean and string state for "building"
  const building = momentum.building || state === "building";
  const macdExpanding = momentum.macdExpanding || false;
  
  let score = 0;
  
  // Strict momentum scoring - only confirmed momentum gets high scores
  if (state === "confirmed" && confirms) {
    score = 17;
  } else if (state === "confirmed" && macdExpanding) {
    score = 14;
  } else if (building && macdExpanding && confirms) {
    score = 10;
  } else if (state === "mixed" && macdExpanding && confirms) {
    score = 8;
  } else if (state === "mixed" && macdExpanding) {
    // IMPROVED: "mixed" + MACD expanding + ADX rising = ACTIVE MOMENTUM CONTINUATION
    // This is a valid entry during strong trends, not a reject scenario
    if (adx >= 25 && adxRising) {
      score = 10;  // Was 6, now 10 for active momentum continuation
    } else if (adx >= 22) {
      score = 8;   // Decent ADX + MACD expanding = 8 pts
    } else {
      score = 6;   // Original score for weaker trends
    }
  } else if (building && macdExpanding) {
    score = 4;
  } else if (state === "mixed") {
    score = 2;
  } else if (macdExpanding) {
    // MACD expanding alone should get more credit when ADX is strong
    score = adx >= 25 ? 4 : 2;
  } else {
    score = 0;
  }
  
  // Volume bonus
  if (volumeConfirms) score += 4;
  
  // ============= NEW: STOCHRSI DECLINE BONUS =============
  // When StochRSI K is at extreme and declining (K < D), add momentum bonus
  // This helps detect early bearish/bullish momentum before MACD confirms
  if (stochRsiData) {
    const { k, d } = stochRsiData;
    // Bearish bonus: K < 20 and K < D (declining from oversold = bearish momentum building)
    if (k < 20 && k < d) {
      score += 3;  // +3 for declining StochRSI in oversold zone
    }
    // Bullish bonus: K > 80 and K > D (rising from overbought = bullish momentum building)
    else if (k > 80 && k > d) {
      score += 3;  // +3 for rising StochRSI in overbought zone
    }
  }
  
  // ============= PHASE 1 FIX: MOMENTUM FLOOR FOR VERY STRONG ADX =============
  // When ADX >= 40 and not sharply falling, the trend strength IS confirmation of momentum
  // Apply minimum score of 8 to prevent false rejections during consolidation in strong trends
  const effectiveAdxSlope = adxSlope ?? (adxRising ? 0.5 : -0.3);
  if (adx >= 40 && effectiveAdxSlope > -0.5) {
    score = Math.max(score, 8);  // Floor at 8/20 for very strong trends
  } else if (adx >= 35 && effectiveAdxSlope > -0.3) {
    score = Math.max(score, 6);  // Floor at 6/20 for strong trends
  }
  
  return Math.min(20, score);
};

// ============= ALIGNMENT SCORE (0-14 points) =============
// Directional consistency with strong 1h trend credit
export const getAlignmentScore = (
  confidence: number, 
  consistency: number, 
  aligned: boolean, 
  trendData: any
): number => {
  let score = 0;
  
  const tf = trendData?.timeframes;
  const trend4h = tf?.['4h']?.trend || "neutral";
  const trend1h = tf?.['1h']?.trend || "neutral";
  const trend30m = tf?.['30m']?.trend || "neutral";
  const conf1h = tf?.['1h']?.confidence || 50;
  const conf4h = tf?.['4h']?.confidence || 50;
  const adx = trendData?.volatility?.adx || trendData?.momentum?.adx || 0;
  
  // Full alignment bonus (0-8)
  if (aligned) {
    score += 8;
  } else if (tf) {
    // ============= STRONG 1H TREND CREDIT (NEW) =============
    // When 4h is neutral but 1h has strong directional confirmation
    // This is a valid setup for shorter-term entries
    if (trend4h === "neutral" && trend1h !== "neutral" && conf1h >= 65) {
      score += 6;  // Strong 1h with neutral 4h = good setup
    }
    // 4h neutral with 1h+30m aligned = partial alignment
    else if (trend4h === "neutral" && trend1h === trend30m && trend1h !== "neutral") {
      score += 5;
    }
    // 1h and 30m agree but different from 4h
    else if (trend1h === trend30m && trend1h !== "neutral") {
      score += 3;
    }
    // Strong 1h alone (without 30m confirmation) still gets some credit
    else if (trend1h !== "neutral" && conf1h >= 60) {
      score += 3;
    }
  }
  
  // ============= PHASE 4 FIX: LOADING ZONE BONUS =============
  // Add points when StochRSI is in 30-70 loading zone AND ADX is strong
  // This rewards entries that have room to run
  const stochRsi1h = trendData?.stochasticRsi?.['1h'];
  const stochK1h = stochRsi1h?.k ?? 50;
  if (stochK1h >= 30 && stochK1h <= 70 && adx >= 35) {
    score += 3;  // +3 for loading zone with strong ADX
  } else if (stochK1h >= 35 && stochK1h <= 65 && adx >= 25) {
    score += 2;  // +2 for ideal loading zone with moderate ADX
  }
  
  // ============= 1H CONFIDENCE BONUS (NEW) =============
  // Extra credit for very strong 1h directional confidence
  if (conf1h >= 70) {
    score += 2;  // Very strong 1h direction
  } else if (conf1h >= 65) {
    score += 1;  // Strong 1h direction
  }
  
  // Consistency component (0-4, reduced from 0-6 to balance 1h credit)
  if (consistency >= 75) score += 4;
  else if (consistency >= 65) score += 3;
  else if (consistency >= 55) score += 2;
  else if (consistency >= 45) score += 1;
  
  return Math.min(14, score);
};

// ============= TECHNICAL INDICATOR SCORE (0-15 points) =============
export const getTechnicalScore = (
  trendData: any, 
  effectiveTrend: string, 
  symbol: string
): number => {
  let score = 0;
  
  const stochRsi = trendData?.stochasticRsi;
  const bollinger = trendData?.bollingerBands;
  const adx = trendData?.volatility?.adx || 0;
  const momentum = trendData?.momentum || {};
  const timeframes = trendData?.timeframes || {};
  
  if (!stochRsi || !bollinger) {
    return 0;
  }
  
  const primarySignal = stochRsi.primarySignal || stochRsi["1h"]?.signal;
  const primaryK = stochRsi.primaryK || stochRsi["1h"]?.k || 50;
  const stoch4h = stochRsi['4h'] || {};
  const k4h = stoch4h.k ?? 50;
  
  const squeeze = bollinger.squeeze || bollinger.squeezeActive || bollinger["1h"]?.squeeze;
  const pricePosition = bollinger.pricePosition || bollinger["1h"]?.pricePosition;
  const percentB = bollinger.percentB || bollinger["1h"]?.percentB || 50;
  
  let stochScore = 0;
  let bbScore = 0;
  
  const isStrongTrend = adx >= ADX_THRESHOLDS.VERY_STRONG;
  const rsi4h = trendData?.timeframes?.['4h']?.indicators?.rsi ?? 50;
  
  // Strong Trend Continuation Exception Check
  // When momentum is building/confirmed AND timeframes are aligned, allow partial credit at extremes
  const momentumState = momentum.state || "none";
  const momentumConfirmed = momentum.confirms === true;
  const macdExpanding = momentum.macdExpanding === true;
  const isActiveMomentum = momentumState === "building" || momentumState === "confirmed" || momentumConfirmed;
  
  const trend4h = timeframes['4h']?.trend || timeframes['4h']?.indicators?.emaSignal || "neutral";
  const trend1h = timeframes['1h']?.trend || timeframes['1h']?.indicators?.emaSignal || "neutral";
  
  const isBullishAligned = trend4h === "bullish" && trend1h === "bullish";
  const isBearishAligned = trend4h === "bearish" && trend1h === "bearish";
  
  // Strong trend continuation allows partial credit at StochRSI extremes
  const hasStrongTrendContinuation = isActiveMomentum && (
    (effectiveTrend === "bullish" && isBullishAligned) ||
    (effectiveTrend === "bearish" && isBearishAligned)
  );
  
  // StochRSI-RSI conflict resolution
  const isLong = effectiveTrend === "bullish";
  const isStochRsiExtreme = isLong 
    ? k4h > STOCHRSI_THRESHOLDS.EXTREME_OVERBOUGHT
    : k4h < STOCHRSI_THRESHOLDS.EXTREME_OVERSOLD;
  
  // RSI momentum zones
  const rsiInMomentumZoneLong = rsi4h > RSI_THRESHOLDS.NEUTRAL_LOW && rsi4h < RSI_THRESHOLDS.BULLISH_STRONG;
  const rsiInMomentumZoneShort = rsi4h > RSI_THRESHOLDS.BEARISH_PULLBACK && rsi4h < RSI_THRESHOLDS.NEUTRAL_HIGH;
  
  if (effectiveTrend === "bullish") {
    if (isStrongTrend) {
      let baseStochScore = 0;
      if (primaryK > 80) baseStochScore = 4;
      else if (primaryK > 60) baseStochScore = 3;
      else if (primaryK < 30) baseStochScore = 6;
      else baseStochScore = 2;
      
      const shouldReduceScore = isStochRsiExtreme || (!rsiInMomentumZoneLong && primaryK > 60);
      if (shouldReduceScore && primaryK > 60) {
        stochScore = Math.round(baseStochScore * 0.5);
      } else {
        stochScore = baseStochScore;
      }
    } else {
      // Non-strong-trend bullish scoring with strong trend continuation exception
      if (primarySignal === "oversold" || primaryK < 20) stochScore = 8;
      else if (primaryK < 30) stochScore = 5;
      else if (primaryK < 40) stochScore = 2;
      else if (primaryK > 80) {
        // StochRSI overbought: normally 0 for LONG, but allow partial credit with strong trend continuation
        if (hasStrongTrendContinuation && macdExpanding) {
          stochScore = 5; // Strong trend can push further into overbought
        } else if (hasStrongTrendContinuation) {
          stochScore = 3; // Momentum aligned but MACD not expanding
        } else {
          stochScore = 0; // Risky entry at extreme without trend continuation
        }
      }
      else stochScore = 1;
    }
    
    // Bollinger Bands scoring for bullish with trend continuation exception
    if (pricePosition === "lower_zone" || percentB < 30) bbScore = 4;
    else if (pricePosition === "middle" || (percentB >= 30 && percentB <= 70)) bbScore = 2;
    else if (isStrongTrend && percentB > 70) bbScore = 2;
    else if (hasStrongTrendContinuation && (pricePosition === "upper_zone" || percentB > 70)) {
      // Strong trend continuation: price at upper band can break further in strong bullish
      bbScore = 3;
    }
    else bbScore = 1;
    
  } else if (effectiveTrend === "bearish") {
    if (isStrongTrend) {
      let baseStochScore = 0;
      if (primaryK < 20) baseStochScore = 4;
      else if (primaryK < 40) baseStochScore = 3;
      else if (primaryK > 70) baseStochScore = 6;
      else baseStochScore = 2;
      
      const shouldReduceScore = isStochRsiExtreme || (!rsiInMomentumZoneShort && primaryK < 40);
      if (shouldReduceScore && primaryK < 40) {
        stochScore = Math.round(baseStochScore * 0.5);
      } else {
        stochScore = baseStochScore;
      }
    } else {
      // Non-strong-trend bearish scoring with strong trend continuation exception
      if (primarySignal === "overbought" || primaryK > 80) stochScore = 8;
      else if (primaryK > 70) stochScore = 5;
      else if (primaryK > 60) stochScore = 2;
      else if (primaryK < 20) {
        // StochRSI oversold: normally 0 for SHORT, but allow partial credit with strong trend continuation
        if (hasStrongTrendContinuation && macdExpanding) {
          stochScore = 5; // Strong trend can push further into oversold
        } else if (hasStrongTrendContinuation) {
          stochScore = 3; // Momentum aligned but MACD not expanding
        } else {
          stochScore = 0; // Risky entry at extreme without trend continuation
        }
      }
      else stochScore = 1;
    }
    
    // Bollinger Bands scoring for bearish with trend continuation exception
    if (pricePosition === "upper_zone" || percentB > 70) bbScore = 4;
    else if (pricePosition === "middle" || (percentB >= 30 && percentB <= 70)) bbScore = 2;
    else if (isStrongTrend && percentB < 30) bbScore = 2;
    else if (hasStrongTrendContinuation && (pricePosition === "lower_zone" || percentB < 30)) {
      // Strong trend continuation: price at lower band can break further in strong bearish
      bbScore = 3;
    }
    else bbScore = 1;
    
  } else {
    if (primaryK > 85) stochScore = 4;
    else if (primaryK > 75) stochScore = 2;
    else if (primaryK < 15) stochScore = 4;
    else if (primaryK < 25) stochScore = 2;
    else stochScore = 1;
    
    if (percentB > 85 || percentB < 15) bbScore = 3;
    else if (percentB > 75 || percentB < 25) bbScore = 2;
    else bbScore = 1;
  }
  
  // Squeeze bonus
  if (squeeze) {
    bbScore += 5;
  }
  
  score = stochScore + bbScore;
  return Math.max(0, Math.min(15, score));
};

// ============= UNIFIED REVERSAL SCORE SYSTEM =============
// Aggregates ALL reversal signals into a single comprehensive score
// Three-tier decision: BLOCK (>=60), REDUCE (40-60), NORMAL (<40)

// PHASE 2: Separated Risk Components
export interface SeparatedRiskResult {
  // Continuation Risk: Affects position size only (overbought/oversold, momentum exhaustion)
  continuationRisk: {
    score: number;        // 0-100
    positionMultiplier: number;  // 1.0, 0.75, 0.5, or 0.4
    reasons: string[];
  };
  // Reversal Probability: Can trigger hard blocks (divergence, HTF conflict, multiple opposing signals)
  reversalProbability: {
    score: number;        // 0-100
    shouldBlock: boolean;
    reasons: string[];
  };
}

export interface UnifiedReversalResult {
  score: number;
  decision: "BLOCK" | "REDUCE" | "NORMAL";
  positionSizeMultiplier: number;
  reasons: string[];
  adxWeight: number;
  // PHASE 2: Add separated risk components
  separatedRisk?: SeparatedRiskResult;
  breakdown?: {
    stochRsiScore: number;
    stochRsiZoneScore: number;
    momentumScore: number;
    macdScore: number;
    timeframeScore: number;
    volumeScore: number;
    timeInExtremeScore?: number;  // PHASE 3
  };
}

// PHASE 2: Calculate component caps based on market context
const getComponentCaps = (context: {
  adx: number;
  isBreakoutMode: boolean;
  isMomentumActive: boolean;
  macdExpanding: boolean;
  hasPartialAlignment: boolean;
}): {
  stochRsiCap: number;
  momentumCap: number;
  macdCap: number;
  timeframeCap: number;
} => {
  const { adx, isBreakoutMode, isMomentumActive, macdExpanding, hasPartialAlignment } = context;
  
  // StochRSI cap: reduced in strong trends, breakouts, or confirmed momentum
  let stochRsiCap: number = COMPONENT_CAPS.STOCHRSI.DEFAULT;
  if (adx >= ADX_THRESHOLDS.VERY_STRONG) {
    stochRsiCap = Math.min(stochRsiCap, COMPONENT_CAPS.STOCHRSI.STRONG_TREND);
  }
  if (isBreakoutMode) {
    stochRsiCap = Math.min(stochRsiCap, COMPONENT_CAPS.STOCHRSI.BREAKOUT_MODE);
  }
  if (isMomentumActive) {
    stochRsiCap = Math.min(stochRsiCap, COMPONENT_CAPS.STOCHRSI.MOMENTUM_CONFIRMED);
  }
  
  // Momentum cap: reduced when momentum is actually present (reduces own penalty)
  let momentumCap: number = COMPONENT_CAPS.MOMENTUM.DEFAULT;
  if (isMomentumActive) {
    momentumCap = Math.min(momentumCap, COMPONENT_CAPS.MOMENTUM.ACTIVE_MOMENTUM);
  }
  if (adx >= ADX_THRESHOLDS.VERY_STRONG) {
    momentumCap = Math.min(momentumCap, COMPONENT_CAPS.MOMENTUM.STRONG_TREND);
  }
  
  // MACD cap: reduced when MACD is expanding (less relevant as risk)
  let macdCap: number = COMPONENT_CAPS.MACD.DEFAULT;
  if (macdExpanding) {
    macdCap = Math.min(macdCap, COMPONENT_CAPS.MACD.EXPANDING);
  }
  
  // Timeframe cap: reduced with partial alignment
  let timeframeCap: number = COMPONENT_CAPS.TIMEFRAME.DEFAULT;
  if (hasPartialAlignment) {
    timeframeCap = Math.min(timeframeCap, COMPONENT_CAPS.TIMEFRAME.PARTIAL_ALIGNMENT);
  }
  
  return { stochRsiCap, momentumCap, macdCap, timeframeCap };
};

// PHASE 2: Calculate separated continuation risk vs reversal probability
const calculateSeparatedRisk = (
  breakdown: {
    stochRsiScore: number;
    stochRsiZoneScore: number;
    momentumScore: number;
    macdScore: number;
    timeframeScore: number;
    volumeScore: number;
  },
  trendData: any,
  signalType: string
): SeparatedRiskResult => {
  const continuationReasons: string[] = [];
  const reversalReasons: string[] = [];
  
  // CONTINUATION RISK: Zone extremes, momentum exhaustion
  // These indicate "trend may be tiring" but not necessarily "trend will reverse"
  let continuationScore = 0;
  
  // StochRSI zone extremes are continuation risk (overbought continuation, oversold bounce)
  continuationScore += breakdown.stochRsiZoneScore;
  if (breakdown.stochRsiZoneScore > 0) {
    continuationReasons.push(`StochRSI zone extreme: ${breakdown.stochRsiZoneScore} pts`);
  }
  
  // Part of momentum score is continuation risk (momentum exhausting but not reversing)
  if (breakdown.momentumScore > 0 && breakdown.momentumScore <= 15) {
    continuationScore += breakdown.momentumScore;
    continuationReasons.push(`Momentum weakening: ${breakdown.momentumScore} pts`);
  }
  
  // Low volume is continuation risk (trend may stall, not reverse)
  if (breakdown.volumeScore > 0) {
    continuationScore += breakdown.volumeScore;
    continuationReasons.push(`Low volume: ${breakdown.volumeScore} pts`);
  }
  
  // Calculate position multiplier based on continuation risk thresholds
  let positionMultiplier = 1.0;
  const CR = RISK_SEPARATION_THRESHOLDS.CONTINUATION_RISK;
  if (continuationScore >= CR.EXTREME) {
    positionMultiplier = 0.4;  // 60% reduction
    continuationReasons.push("EXTREME continuation risk → 60% position reduction");
  } else if (continuationScore >= CR.HIGH) {
    positionMultiplier = 0.5;  // 50% reduction
    continuationReasons.push("HIGH continuation risk → 50% position reduction");
  } else if (continuationScore >= CR.MEDIUM) {
    positionMultiplier = 0.75;  // 25% reduction
    continuationReasons.push("MEDIUM continuation risk → 25% position reduction");
  }
  
  // REVERSAL PROBABILITY: Crosses, divergence, HTF conflicts
  // These indicate actual directional change probability
  let reversalScore = 0;
  
  // StochRSI crosses are true reversal signals (not just extremes)
  reversalScore += breakdown.stochRsiScore;
  if (breakdown.stochRsiScore > 0) {
    reversalReasons.push(`StochRSI opposing crosses: ${breakdown.stochRsiScore} pts`);
  }
  
  // MACD divergence/misalignment indicates reversal probability
  reversalScore += breakdown.macdScore;
  if (breakdown.macdScore > 0) {
    reversalReasons.push(`MACD divergence/misalignment: ${breakdown.macdScore} pts`);
  }
  
  // Timeframe conflicts (HTF opposing) is reversal probability
  reversalScore += breakdown.timeframeScore;
  if (breakdown.timeframeScore > 0) {
    reversalReasons.push(`HTF conflict: ${breakdown.timeframeScore} pts`);
  }
  
  // Strong momentum failure (score > 15) indicates reversal, not just exhaustion
  if (breakdown.momentumScore > 15) {
    reversalScore += breakdown.momentumScore - 15;  // Only the "reversal" portion
    reversalReasons.push(`Momentum failure: ${breakdown.momentumScore - 15} pts`);
  }
  
  // Volume confirmation reduces reversal probability
  if (breakdown.volumeScore < 0) {
    reversalScore += breakdown.volumeScore;  // Negative = reduces score
    reversalReasons.push(`Volume confirms direction: ${-breakdown.volumeScore} pts reduction`);
  }
  
  // Determine if we should block based on reversal probability thresholds
  const RP = RISK_SEPARATION_THRESHOLDS.REVERSAL_PROBABILITY;
  const shouldBlock = reversalScore >= RP.BLOCK;
  
  if (shouldBlock) {
    reversalReasons.push(`REVERSAL PROBABILITY ${reversalScore} >= ${RP.BLOCK} → BLOCK`);
  } else if (reversalScore >= RP.HIGH) {
    reversalReasons.push(`HIGH reversal probability (${reversalScore}) → Consider blocking`);
  } else if (reversalScore >= RP.MEDIUM) {
    reversalReasons.push(`MEDIUM reversal probability (${reversalScore}) → Proceed with caution`);
  }
  
  return {
    continuationRisk: {
      score: Math.min(100, Math.max(0, continuationScore)),
      positionMultiplier,
      reasons: continuationReasons,
    },
    reversalProbability: {
      score: Math.min(100, Math.max(0, reversalScore)),
      shouldBlock,
      reasons: reversalReasons,
    },
  };
};

// Helper: Count StochRSI signals opposing the intended trade direction
const countOpposingStochSignals = (trendData: any, intendedDirection: string): {
  opposingCrossCount: number;
  extremeCount: number;
  crossTimeframes: string[];
  extremeTimeframes: string[];
} => {
  const stochRsi = trendData?.stochasticRsi || {};
  const aggregated = stochRsi.aggregated || {};
  const timeframes = ['4h', '1h', '30m', '15m'];
  
  let opposingCrossCount = 0;
  let extremeCount = 0;
  const crossTimeframes: string[] = [];
  const extremeTimeframes: string[] = [];
  
  const isLong = intendedDirection === "bullish" || intendedDirection === "long";
  
  if (isLong) {
    opposingCrossCount = aggregated.bearishCrossCount || 0;
    extremeCount = aggregated.overboughtCount || 0;
  } else {
    opposingCrossCount = aggregated.bullishCrossCount || 0;
    extremeCount = aggregated.oversoldCount || 0;
  }
  
  for (const tf of timeframes) {
    const tfData = stochRsi[tf];
    if (!tfData) continue;
    
    const k = tfData.k ?? 50;
    const signal = tfData.signal || "neutral";
    
    if (isLong) {
      if (signal === "bearish_cross") crossTimeframes.push(tf);
      if (k > 80) extremeTimeframes.push(tf);
    } else {
      if (signal === "bullish_cross") crossTimeframes.push(tf);
      if (k < 20) extremeTimeframes.push(tf);
    }
  }
  
  return { opposingCrossCount, extremeCount, crossTimeframes, extremeTimeframes };
};

// Options for calculateUnifiedReversalScore
interface ReversalScoreOptions {
  stochRSITier2Bypassed?: boolean;  // FIX #2: If true, cap StochRSI contribution at 10 instead of 20
}

export const calculateUnifiedReversalScore = (
  trendData: any, 
  signalType: string,
  symbol: string = "unknown",
  options: ReversalScoreOptions = {}
): UnifiedReversalResult => {
  const reasons: string[] = [];
  let totalScore = 0;
  
  if (!trendData) {
    return { 
      score: 0, 
      decision: "NORMAL", 
      positionSizeMultiplier: 1.0, 
      reasons: ['No trend data'], 
      adxWeight: 1.0 
    };
  }
  
  // PHASE 1: Get ADX phase info for context-aware scoring
  const adx = trendData?.volatility?.adx || trendData?.momentum?.adx || 20;
  const adxPhaseInfo = getAdxPhaseInfo(adx);
  
  // PHASE 1: Detect breakout mode for StochRSI penalty reduction
  const breakoutMode = detectBreakoutMode(trendData);
  
  const momentum = trendData?.momentum || {};
  const stochRSI = trendData?.stochasticRsi || {};
  const aggregated = stochRSI.aggregated || {};
  const tf = trendData?.timeframes || {};
  const tf1h = tf['1h'] || {};
  const tf4h = tf['4h'] || {};
  const volatility = trendData?.volatility || {};
  const indicators = trendData?.indicators || {};
  const rsi = tf1h.indicators?.rsi || indicators.rsi || 50;
  
  const isLong = signalType === "bullish" || signalType === "long";
  const trend1h = tf1h.trend || "neutral";
  const trend4h = tf4h.trend || "neutral";
  const stoch4h = stochRSI['4h'] || {};
  
  // RSI pullback + momentum check for StochRSI conflict resolution
  const momentumConfirms = momentum.confirms ?? false;
  const momentumState = momentum.state || "none";
  const isMomentumConfirmed = (momentumState === "confirmed" || momentumState === "building") && momentumConfirms;
  
  const rsiIndicatesPullback = isLong 
    ? rsi < RSI_THRESHOLDS.BULLISH_PULLBACK
    : rsi > RSI_THRESHOLDS.BEARISH_RALLY;
  
  const reduceStochZonePenalty = rsiIndicatesPullback && isMomentumConfirmed;
  
  // PHASE 2: Get context for component caps
  const trend30m = tf['30m']?.trend || "neutral";
  const macdExpanding = momentum.macdExpanding ?? false;
  const hasPartialAlignment = (trend1h === trend30m && trend1h !== "neutral");
  
  const componentCaps = getComponentCaps({
    adx,
    isBreakoutMode: breakoutMode.isActive,
    isMomentumActive: isMomentumConfirmed || momentumState === "building",
    macdExpanding,
    hasPartialAlignment,
  });
  
  // PHASE 3: Calculate time-in-extreme penalty
  const timeInExtremePenalty = calculateTimeInExtremePenalty(trendData, signalType);
  if (timeInExtremePenalty.penalty > 0) {
    reasons.push(`PHASE 3: ${timeInExtremePenalty.reason}`);
  }
  
  // Initialize breakdown - PHASE 3: Add timeInExtremeScore
  const breakdown = {
    stochRsiScore: 0,
    stochRsiZoneScore: 0,
    momentumScore: 0,
    macdScore: 0,
    timeframeScore: 0,
    volumeScore: 0,
    timeInExtremeScore: timeInExtremePenalty.penalty,  // PHASE 3
  };
  
  // 1. StochRSI CROSS SIGNALS (0-50 points) - PHASE 2: Apply cap
  const stochSignals = countOpposingStochSignals(trendData, signalType);
  let rawStochCrossScore = 0;
  
  if (stochSignals.opposingCrossCount >= 3) {
    rawStochCrossScore = 50;
    reasons.push(`${stochSignals.opposingCrossCount} opposing StochRSI crosses`);
  } else if (stochSignals.opposingCrossCount >= 2) {
    rawStochCrossScore = 40;
    reasons.push(`${stochSignals.opposingCrossCount} opposing StochRSI crosses`);
  } else if (stochSignals.opposingCrossCount >= 1) {
    rawStochCrossScore = 30;
    reasons.push(`Opposing StochRSI cross`);
  }
  
  // PHASE 2: Apply StochRSI cap to crosses
  breakdown.stochRsiScore = Math.min(rawStochCrossScore, componentCaps.stochRsiCap);
  if (rawStochCrossScore > componentCaps.stochRsiCap) {
    reasons.push(`StochRSI cross score capped: ${rawStochCrossScore} → ${componentCaps.stochRsiCap} (cap active)`);
  }
  
  // 2. StochRSI EXTREME ZONES (0-50 points) - INCREASED from 0-25 for extreme readings
  const k4h = stoch4h.k ?? 50;
  let rawStochZoneScore = 0;
  
  // NEW: Use high reversal thresholds from constants (default 95 for overbought, 5 for oversold)
  const HIGH_REVERSAL_OB = STOCHRSI_THRESHOLDS.HIGH_REVERSAL_OVERBOUGHT ?? 95;
  const HIGH_REVERSAL_OS = STOCHRSI_THRESHOLDS.HIGH_REVERSAL_OVERSOLD ?? 5;
  
  if (isLong) {
    // Check deeply oversold (favorable for LONG = reduces score)
    if (k4h < STOCHRSI_THRESHOLDS.DEEPLY_OVERSOLD) {
      rawStochZoneScore += 15;
      reasons.push(`4h StochRSI deeply oversold (K=${k4h.toFixed(1)})`);
    } else if (k4h < STOCHRSI_THRESHOLDS.OVERSOLD_ZONE) {
      rawStochZoneScore += 8;
      reasons.push(`4h StochRSI oversold zone (K=${k4h.toFixed(1)})`);
    }
    
    // ENHANCED: Check extremely overbought (risky for LONG = increases score significantly)
    // K >= 95: +35 points (was +10) - HIGH REVERSAL RISK
    if (k4h >= HIGH_REVERSAL_OB) {
      rawStochZoneScore += 35;
      reasons.push(`4h StochRSI at high reversal risk (K=${k4h.toFixed(1)} >= ${HIGH_REVERSAL_OB}) - nowhere to rise`);
    } else if (k4h > STOCHRSI_THRESHOLDS.EXTREME_OVERBOUGHT) {
      rawStochZoneScore += 18;
      reasons.push(`4h StochRSI extremely overbought (K=${k4h.toFixed(1)})`);
    } else if (k4h > STOCHRSI_THRESHOLDS.OVERBOUGHT) {
      rawStochZoneScore += 10;
      reasons.push(`4h StochRSI overbought (K=${k4h.toFixed(1)})`);
    }
  } else {
    // Check deeply overbought (favorable for SHORT = reduces score)
    if (k4h > STOCHRSI_THRESHOLDS.DEEPLY_OVERBOUGHT) {
      rawStochZoneScore += 15;
      reasons.push(`4h StochRSI deeply overbought (K=${k4h.toFixed(1)})`);
    } else if (k4h > STOCHRSI_THRESHOLDS.OVERBOUGHT_ZONE) {
      rawStochZoneScore += 8;
      reasons.push(`4h StochRSI overbought zone (K=${k4h.toFixed(1)})`);
    }
    
    // ENHANCED: Check extremely oversold (risky for SHORT = increases score significantly)
    // K <= 5: +35 points (was +10) - HIGH REVERSAL RISK
    if (k4h <= HIGH_REVERSAL_OS) {
      rawStochZoneScore += 35;
      reasons.push(`4h StochRSI at high reversal risk (K=${k4h.toFixed(1)} <= ${HIGH_REVERSAL_OS}) - nowhere to fall`);
    } else if (k4h < STOCHRSI_THRESHOLDS.EXTREME_OVERSOLD) {
      rawStochZoneScore += 18;
      reasons.push(`4h StochRSI extremely oversold (K=${k4h.toFixed(1)})`);
    } else if (k4h < STOCHRSI_THRESHOLDS.OVERSOLD) {
      rawStochZoneScore += 10;
      reasons.push(`4h StochRSI oversold (K=${k4h.toFixed(1)})`);
    }
  }
  
  // Apply RSI-StochRSI conflict resolution (but NOT for high reversal risk levels)
  // High reversal risk (K >= 95 or K <= 5) should not be reduced
  // PHASE 1: Also apply breakout mode penalty reduction when active
  const isAtHighReversalRisk = isLong ? k4h >= HIGH_REVERSAL_OB : k4h <= HIGH_REVERSAL_OS;
  
  // Calculate penalty reduction: RSI pullback + breakout mode can stack
  let stochZonePenaltyMultiplier = 1.0;
  if (!isAtHighReversalRisk) {
    if (reduceStochZonePenalty) {
      stochZonePenaltyMultiplier *= 0.5;
      reasons.push(`StochRSI zone penalty reduced 50% (RSI pullback + momentum)`);
    }
    if (breakoutMode.isActive) {
      stochZonePenaltyMultiplier *= breakoutMode.stochRsiPenaltyMultiplier;
      reasons.push(`BREAKOUT MODE: StochRSI penalty reduced ${((1 - breakoutMode.stochRsiPenaltyMultiplier) * 100).toFixed(0)}%`);
    }
  }
  breakdown.stochRsiZoneScore = Math.round(rawStochZoneScore * stochZonePenaltyMultiplier);
  
  // 3. MOMENTUM STATE (0-30 points) - PHASE 2: Apply cap
  // RELAXED: Allow "none" state with reduced penalty when ADX >= 28 (strong trend exception)
  const isStrongTrendException = adx >= ADX_THRESHOLDS.STRONG_TREND_EXCEPTION; // 28+ (relaxed from 30)
  let rawMomentumScore = 0;
  
  // Check "mixed" state FIRST (highest penalty) - prevents premature catch by other conditions
  if (momentumState === "mixed") {
    if (adx < ADX_THRESHOLDS.STRONG_TREND_EXCEPTION) {
      rawMomentumScore = 30;
      reasons.push(`Mixed momentum with weak ADX`);
    } else {
      rawMomentumScore = 15;
      reasons.push(`Mixed momentum (ADX allows)`);
    }
  } else if (momentumState === "none") {
    if (isStrongTrendException) {
      // Strong trend exception - reduced penalty for early entries
      rawMomentumScore = 10;
      reasons.push(`No momentum but strong trend (ADX=${adx.toFixed(1)} >= 28)`);
    } else {
      rawMomentumScore = 25;
      reasons.push(`Momentum not confirmed (state: ${momentumState})`);
    }
  } else if (!momentumConfirms && momentumState !== "building") {
    if (isStrongTrendException) {
      rawMomentumScore = 8;
      reasons.push(`Momentum unconfirmed but strong trend (ADX=${adx.toFixed(1)})`);
    } else {
      rawMomentumScore = 20;
      reasons.push(`Momentum state ${momentumState} not confirmed`);
    }
  } else if (momentumState === "building" && !momentumConfirms) {
    rawMomentumScore = 10;
    reasons.push("Momentum building but not confirmed");
  }
  
  // PHASE 2: Apply momentum cap
  breakdown.momentumScore = Math.min(rawMomentumScore, componentCaps.momentumCap);
  if (rawMomentumScore > componentCaps.momentumCap) {
    reasons.push(`Momentum score capped: ${rawMomentumScore} → ${componentCaps.momentumCap} (cap active)`);
  }
  
  // 4. MACD ALIGNMENT (0-15 points) - PHASE 2: Apply cap
  let rawMacdScore = 0;
  if (momentum.hasDivergence) {
    rawMacdScore += 15;
    reasons.push("MACD divergence detected");
  } else if (!momentum.macdDirectionAligned) {
    rawMacdScore += 10;
    reasons.push("MACD direction misaligned");
  } else if (!macdExpanding) {
    rawMacdScore += 5;
    reasons.push("MACD not expanding");
  }
  
  // PHASE 2: Apply MACD cap
  breakdown.macdScore = Math.min(rawMacdScore, componentCaps.macdCap);
  if (rawMacdScore > componentCaps.macdCap) {
    reasons.push(`MACD score capped: ${rawMacdScore} → ${componentCaps.macdCap} (cap active)`);
  }
  
  // 5. TIMEFRAME CONFLICTS (0-20 points) - PHASE 2: Apply cap
  let rawTimeframeScore = 0;
  if (isLong) {
    if (trend1h === "bearish") {
      rawTimeframeScore += 15;
      reasons.push("1h trend bearish (opposing LONG)");
    }
    if (trend4h === "bearish") {
      rawTimeframeScore += 5;
      reasons.push("4h trend bearish");
    }
  } else {
    if (trend1h === "bullish") {
      rawTimeframeScore += 15;
      reasons.push("1h trend bullish (opposing SHORT)");
    }
    if (trend4h === "bullish") {
      rawTimeframeScore += 5;
      reasons.push("4h trend bullish");
    }
  }
  
  // PHASE 2: Apply timeframe cap
  breakdown.timeframeScore = Math.min(rawTimeframeScore, componentCaps.timeframeCap);
  if (rawTimeframeScore > componentCaps.timeframeCap) {
    reasons.push(`Timeframe score capped: ${rawTimeframeScore} → ${componentCaps.timeframeCap} (cap active)`);
  }
  
  // 6. VOLUME CONFIRMATION (reduces score if confirming)
  const volumeConfirms = momentum.volumeConfirms ?? false;
  const volumeBoost = momentum.volumeBoost ?? 1.0;
  
  if (volumeConfirms && volumeBoost > 1.3) {
    breakdown.volumeScore = -10;
    reasons.push(`Volume confirms - risk reduced`);
  } else if (!volumeConfirms && volatility.volumeRatio < 0.5) {
    breakdown.volumeScore = 5;
    reasons.push("Low volume - reduced conviction");
  }
  
  // PHASE 2: Calculate separated risk scores BEFORE final decision
  const separatedRisk = calculateSeparatedRisk(breakdown, trendData, signalType);
  
  // PHASE 4: Apply overall StochRSI contribution cap
  // Sum all StochRSI-related components and cap at MAX_STOCHRSI_PENALTY (20)
  // This ensures StochRSI alone can NEVER push exhaustion over block threshold
  // FIX #2 (Audit): Use stricter cap (10) when Tier 2 was already bypassed to prevent double punishment
  const rawTotalStochRSI = breakdown.stochRsiScore + breakdown.stochRsiZoneScore + breakdown.timeInExtremeScore;
  
  // Determine which cap to use based on Tier 2 bypass status
  const effectiveStochRSICap = options.stochRSITier2Bypassed 
    ? STOCHRSI_DYNAMIC_PARAMS.TIER2_BYPASSED_STOCHRSI_CAP  // 10 - stricter cap
    : STOCHRSI_DYNAMIC_PARAMS.MAX_STOCHRSI_PENALTY;        // 20 - default cap
  
  const cappedTotalStochRSI = Math.min(rawTotalStochRSI, effectiveStochRSICap);
  
  // Calculate how much to reduce each component proportionally if cap is hit
  if (rawTotalStochRSI > cappedTotalStochRSI) {
    const reductionRatio = cappedTotalStochRSI / rawTotalStochRSI;
    breakdown.stochRsiScore = Math.round(breakdown.stochRsiScore * reductionRatio);
    breakdown.stochRsiZoneScore = Math.round(breakdown.stochRsiZoneScore * reductionRatio);
    breakdown.timeInExtremeScore = Math.round(breakdown.timeInExtremeScore * reductionRatio);
    
    if (options.stochRSITier2Bypassed) {
      reasons.push(`FIX #2: StochRSI capped at ${effectiveStochRSICap} (Tier 2 bypassed) - ${rawTotalStochRSI} → ${cappedTotalStochRSI}`);
    } else {
      reasons.push(`PHASE 4 CAP: Total StochRSI ${rawTotalStochRSI} → ${cappedTotalStochRSI} (MAX=${effectiveStochRSICap})`);
    }
  }
  
  // Calculate total with ADX weight - PHASE 3/4: Include time-in-extreme (now capped)
  const rawScore = breakdown.stochRsiScore + breakdown.stochRsiZoneScore + 
                   breakdown.momentumScore + breakdown.macdScore + 
                   breakdown.timeframeScore + breakdown.volumeScore +
                   breakdown.timeInExtremeScore;  // PHASE 3/4
  
  const adxWeight = getAdxWeight(adx);
  
  // PHASE 1: Apply ADX phase exhaustion risk - increases reversal score by 50%
  let phaseMultiplier = 1.0;
  if (adxPhaseInfo.exhaustionRisk) {
    phaseMultiplier = adxPhaseInfo.reversalSensitivityMultiplier;  // 1.5 for exhaustion
    reasons.push(`ADX EXHAUSTION RISK (${adx.toFixed(1)}): reversal sensitivity +50%`);
  }
  
  totalScore = Math.min(100, Math.max(0, Math.round(rawScore * adxWeight * phaseMultiplier)));
  
  // PHASE 2: Use separated risk for decision making
  // Reversal probability drives blocking, continuation risk drives position sizing
  let decision: "BLOCK" | "REDUCE" | "NORMAL";
  let positionSizeMultiplier: number;
  
  // Use reversal probability for blocking decision
  if (separatedRisk.reversalProbability.shouldBlock) {
    decision = "BLOCK";
    positionSizeMultiplier = 0;
    reasons.push(`PHASE 2: BLOCK by reversal probability (${separatedRisk.reversalProbability.score})`);
  } else if (totalScore >= 75) {
    // Fallback to legacy scoring if reversal probability didn't block but total is very high
    // Raised from 60 to 75 to allow more signals through during transitional markets
    decision = "BLOCK";
    positionSizeMultiplier = 0;
  } else if (totalScore >= 40 || separatedRisk.continuationRisk.positionMultiplier < 1.0) {
    decision = "REDUCE";
    // Use the more conservative of the two position multipliers
    const legacyMultiplier = totalScore >= 40 ? 0.5 : 1.0;
    positionSizeMultiplier = Math.min(legacyMultiplier, separatedRisk.continuationRisk.positionMultiplier);
    if (separatedRisk.continuationRisk.positionMultiplier < legacyMultiplier) {
      reasons.push(`PHASE 2: Position reduced by continuation risk → ${(separatedRisk.continuationRisk.positionMultiplier * 100).toFixed(0)}%`);
    }
  } else {
    decision = "NORMAL";
    positionSizeMultiplier = 1.0;
  }
  
  // Log breakout mode if active (for monitoring)
  if (breakoutMode.isActive) {
    reasons.push(`BREAKOUT MODE ACTIVE: ${breakoutMode.confidence}% confidence`);
  }
  
  // Log component caps if any were active
  const capsApplied = [];
  if (componentCaps.stochRsiCap < COMPONENT_CAPS.STOCHRSI.DEFAULT) capsApplied.push(`StochRSI:${componentCaps.stochRsiCap}`);
  if (componentCaps.momentumCap < COMPONENT_CAPS.MOMENTUM.DEFAULT) capsApplied.push(`Momentum:${componentCaps.momentumCap}`);
  if (componentCaps.macdCap < COMPONENT_CAPS.MACD.DEFAULT) capsApplied.push(`MACD:${componentCaps.macdCap}`);
  if (componentCaps.timeframeCap < COMPONENT_CAPS.TIMEFRAME.DEFAULT) capsApplied.push(`TF:${componentCaps.timeframeCap}`);
  if (capsApplied.length > 0) {
    reasons.push(`PHASE 2 CAPS: ${capsApplied.join(", ")}`);
  }
  
  return { 
    score: totalScore, 
    decision, 
    positionSizeMultiplier,
    reasons, 
    adxWeight,
    separatedRisk,
    breakdown,
  };
};

// ============= MARKET REGIME DETECTION =============
export type MarketRegime = "trending" | "ranging" | "choppy" | "volatile";

export const detectMarketRegime = (trendData: any): { 
  regime: MarketRegime; 
  tradeable: boolean; 
  reason: string 
} => {
  const adx = trendData?.volatility?.adx || 0;
  const atrPercent = trendData?.volatility?.atrPercent || 0;
  const confidence = trendData?.confidence || 0;
  const consistency = trendData?.trueAlignment?.score || 0;
  
  // Ranging market (ADX low, mixed signals)
  if (adx < 15 && confidence < 50) {
    return { 
      regime: "ranging", 
      tradeable: false, 
      reason: `Ranging market (ADX=${adx.toFixed(1)}, confidence=${confidence.toFixed(0)}%)` 
    };
  }
  
  // Choppy market (inconsistent direction)
  if (consistency < 40 && adx < ADX_THRESHOLDS.MINIMUM) {
    return { 
      regime: "choppy", 
      tradeable: false, 
      reason: `Choppy market (consistency=${consistency.toFixed(0)}%, ADX=${adx.toFixed(1)})` 
    };
  }
  
  // Volatile market (high ATR with weak trend)
  if (atrPercent > 2.5 && adx < ADX_THRESHOLDS.STRONG) {
    return { 
      regime: "volatile", 
      tradeable: false, 
      reason: `Volatile market (ATR=${atrPercent.toFixed(2)}%, ADX=${adx.toFixed(1)})` 
    };
  }
  
  // Trending market (ADX strong enough)
  if (adx >= ADX_THRESHOLDS.MINIMUM) {
    return { 
      regime: "trending", 
      tradeable: true, 
      reason: `Trending market (ADX=${adx.toFixed(1)})` 
    };
  }
  
  // Default: weak trend
  return { 
    regime: "ranging", 
    tradeable: false, 
    reason: `Weak trend (ADX=${adx.toFixed(1)})` 
  };
};

// ============= PHASE 4 (9 FINDINGS): ENHANCED MARKET REGIME DETECTION =============
// Finding 2 & 5: Returns quantified regimeScore (0-100) instead of binary gates
// Enables graduated filtering and soft penalties
export type SetupType = 'continuation' | 'pullback' | 'squeeze';

export interface MarketRegimeEnhancedResult {
  regime: MarketRegime;
  regimeScore: number;  // 0-100, quantified regime strength
  tradeable: boolean;
  allowedSetups: SetupType[];  // What setup types are allowed at this regime score
  reason: string;
  penalties: {
    adxTransitionZone: number;
    htfFlattening: number;
    volatility: number;
  };
}

export const detectMarketRegimeEnhanced = (trendData: any): MarketRegimeEnhancedResult => {
  const P = REGIME_SCORE_PARAMS;
  
  // Extract data with safe defaults
  const adx = trendData?.volatility?.adx || 0;
  const atrPercent = trendData?.volatility?.atrPercent || 0;
  const confidence = trendData?.confidence || 0;
  const consistency = trendData?.trueAlignment?.score || 0;
  const volumeRatio = trendData?.volatility?.volumeRatio || 1.0;
  const momentum = trendData?.momentum || {};
  const timeframes = trendData?.timeframes || {};
  
  // HTF slope for flattening detection
  const htf4hSlope = timeframes?.['4h']?.indicators?.emaSlope || 0;
  const htf1hSlope = timeframes?.['1h']?.indicators?.emaSlope || 0;
  
  let regimeScore = 50;  // Start at neutral baseline
  
  // ============= ADX CONTRIBUTION (0-30 points) =============
  if (adx >= 35) {
    regimeScore += 30;  // Exceptional trend
  } else if (adx >= 30) {
    regimeScore += 25;  // Very strong trend
  } else if (adx >= 25) {
    regimeScore += 20;  // Strong trend
  } else if (adx >= 22) {
    regimeScore += 15;  // Moderate trend
  } else if (adx >= 18) {
    regimeScore += 5;   // Transition zone (minimal credit)
  } else {
    regimeScore -= 15;  // Below 18 = ranging penalty
  }
  
  // ============= CONFIDENCE CONTRIBUTION (0-20 points) =============
  const confidencePoints = Math.min(20, confidence / 5);  // 100% conf = 20 points
  regimeScore += confidencePoints;
  
  // ============= CONSISTENCY CONTRIBUTION (0-15 points) =============
  const consistencyPoints = Math.min(15, consistency / 7);  // 100% consistency = ~14 points
  regimeScore += consistencyPoints;
  
  // ============= HTF ALIGNMENT CONTRIBUTION (0-15 points) =============
  const htf4hTrend = timeframes?.['4h']?.trend || "neutral";
  const htf1hTrend = timeframes?.['1h']?.trend || "neutral";
  const primaryTrend = trendData?.primaryTrend || "neutral";
  
  let htfAlignmentPoints = 0;
  if (htf4hTrend !== "neutral" && htf4hTrend === primaryTrend) {
    htfAlignmentPoints += 8;  // 4h aligned
  }
  if (htf1hTrend !== "neutral" && htf1hTrend === primaryTrend) {
    htfAlignmentPoints += 7;  // 1h aligned
  }
  regimeScore += htfAlignmentPoints;
  
  // ============= MOMENTUM CONTRIBUTION (0-10 points) =============
  let momentumPoints = 0;
  if (momentum?.state === "confirmed") {
    momentumPoints = 10;
  } else if (momentum?.state === "building") {
    momentumPoints = 7;
  } else if (momentum?.confirms) {
    momentumPoints = 5;
  }
  regimeScore += momentumPoints;
  
  // ============= VOLUME CONTRIBUTION (0-10 points) =============
  let volumePoints = 0;
  if (volumeRatio >= 2.0) {
    volumePoints = 10;
  } else if (volumeRatio >= 1.5) {
    volumePoints = 7;
  } else if (volumeRatio >= 1.2) {
    volumePoints = 4;
  }
  regimeScore += volumePoints;
  
  // ============= PENALTIES (Finding 5: Graduated Penalties) =============
  let adxTransitionPenalty = 0;
  let htfFlatteningPenalty = 0;
  let volatilityPenalty = 0;
  
  // ADX transition zone penalty (18-22)
  if (adx >= P.ADX_TRANSITION_ZONE_MIN && adx < P.ADX_TRANSITION_ZONE_MAX) {
    adxTransitionPenalty = P.ADX_TRANSITION_ZONE_PENALTY;
    regimeScore -= adxTransitionPenalty;
  }
  
  // HTF slope flattening penalty
  const avgHtfSlope = (Math.abs(htf4hSlope) + Math.abs(htf1hSlope)) / 2;
  if (avgHtfSlope < P.HTF_FLATTENING_SLOPE_THRESHOLD) {
    htfFlatteningPenalty = P.HTF_FLATTENING_PENALTY;
    regimeScore -= htfFlatteningPenalty;
  }
  
  // Volatility penalty
  if (atrPercent > P.EXTREME_ATR_PERCENT) {
    volatilityPenalty = P.EXTREME_ATR_PENALTY;
    regimeScore -= volatilityPenalty;
  } else if (atrPercent > P.HIGH_ATR_PERCENT) {
    volatilityPenalty = P.HIGH_ATR_PENALTY;
    regimeScore -= volatilityPenalty;
  }
  
  // ============= CLAMP SCORE TO 0-100 =============
  regimeScore = Math.max(0, Math.min(100, regimeScore));
  
  // ============= DETERMINE ALLOWED SETUPS =============
  const allowedSetups: SetupType[] = [];
  
  // Finding 2: Regime Confidence Gate
  if (regimeScore >= P.BLOCK_CONTINUATION_BELOW) {
    allowedSetups.push('continuation', 'pullback', 'squeeze');
  } else if (regimeScore >= P.ONLY_PULLBACK_SQUEEZE_BELOW) {
    allowedSetups.push('pullback', 'squeeze');  // No continuation entries
  } else if (regimeScore >= 30) {
    allowedSetups.push('squeeze');  // Only squeeze setups in weak regimes
  }
  // Below 30: nothing allowed
  
  // ============= DETERMINE REGIME AND TRADEABILITY =============
  let regime: MarketRegime = "ranging";
  let tradeable = false;
  
  if (regimeScore >= 60) {
    regime = "trending";
    tradeable = true;
  } else if (regimeScore >= 45) {
    regime = "volatile";  // Mixed signals but might be tradeable
    tradeable = allowedSetups.length > 0;
  } else if (regimeScore >= 30) {
    regime = "choppy";
    tradeable = allowedSetups.includes('squeeze');  // Only squeeze in choppy
  } else {
    regime = "ranging";
    tradeable = false;
  }
  
  const reason = `Regime score ${regimeScore.toFixed(0)}/100 (ADX=${adx.toFixed(1)}, conf=${confidence.toFixed(0)}%, consistency=${consistency.toFixed(0)}%, ` +
    `htfAlign=${htfAlignmentPoints}, momentum=${momentumPoints}, volume=${volumePoints}) ` +
    `Penalties: ADX transition=${adxTransitionPenalty}, HTF flat=${htfFlatteningPenalty}, volatility=${volatilityPenalty}`;
  
  return {
    regime,
    regimeScore,
    tradeable,
    allowedSetups,
    reason,
    penalties: {
      adxTransitionZone: adxTransitionPenalty,
      htfFlattening: htfFlatteningPenalty,
      volatility: volatilityPenalty,
    },
  };
};

// ============= SQUEEZE BREAKOUT VALIDATION (v1.1) =============
// Validates if a potential squeeze breakout setup is present
// Allows ADX gate bypass when conditions are met (ADX 18-22 range)
// v1.1 CHANGES: Added ADX slope requirement (≥ 0.05) to prevent fake squeezes
export interface SqueezeBreakoutResult {
  isValid: boolean;
  confidence: number;  // 0-100
  direction: "long" | "short" | null;
  positionSizeMultiplier: number;  // Reduced size for squeeze entries
  reasons: string[];
  // v1.1: Detailed check results for UI display
  checkDetails: {
    bbCompressed: boolean;
    atBandEdge: boolean;
    percentB: number;
    momentumState: string;
    slopeOk: boolean;
    adxSlope: number;
    hasDivergence: boolean;
  };
}

export const isValidSqueezeBreakout = (
  trendData: any,
  intendedDirection: "long" | "short" | null
): SqueezeBreakoutResult => {
  const reasons: string[] = [];
  let confidence = 0;
  
  // v1.1: Initialize check details
  const checkDetails = {
    bbCompressed: false,
    atBandEdge: false,
    percentB: 50,
    momentumState: 'none',
    slopeOk: false,
    adxSlope: 0,
    hasDivergence: false,
  };
  
  if (!trendData || !intendedDirection) {
    return { isValid: false, confidence: 0, direction: null, positionSizeMultiplier: 1.0, reasons: ["No trend data or direction"], checkDetails };
  }
  
  const adx = trendData?.volatility?.adx || 0;
  const adxSlope = trendData?.volatility?.adxSlope ?? 0;
  const bollinger = trendData?.bollingerBands || {};
  const momentum = trendData?.momentum || {};
  const stochRsi = trendData?.stochasticRsi || {};
  const timeframes = trendData?.timeframes || {};
  
  // v1.1: Update check details
  checkDetails.adxSlope = adxSlope;
  checkDetails.momentumState = momentum.state || 'none';
  checkDetails.hasDivergence = momentum.hasDivergence ?? false;
  
  // Get 4H data for HTF confirmation
  const bb4h = bollinger['4h'] || bollinger;
  const squeeze4h = bb4h.squeeze || bb4h.squeezeActive || false;
  const percentB4h = bb4h.percentB ?? 50;
  const bandwidth4h = bb4h.bandwidth || 0;
  
  // Get 1H data
  const bb1h = bollinger['1h'] || {};
  const squeeze1h = bb1h.squeeze || bb1h.squeezeActive || false;
  const percentB1h = bb1h.percentB ?? 50;
  
  // Condition 1: HTF squeeze active (4h preferred, 1h acceptable) - BB compressed
  const hasHTFSqueeze = squeeze4h || squeeze1h;
  checkDetails.bbCompressed = hasHTFSqueeze;
  
  if (!hasHTFSqueeze) {
    return { isValid: false, confidence: 0, direction: null, positionSizeMultiplier: 1.0, reasons: ["No HTF squeeze detected (BB not compressed)"], checkDetails };
  }
  
  if (squeeze4h) {
    confidence += 30;
    reasons.push("4h Bollinger squeeze active (BB compressed)");
  } else if (squeeze1h) {
    confidence += 20;
    reasons.push("1h Bollinger squeeze active");
  }
  
  // Condition 2: Price at band edge (confirming breakout direction)
  // v1.1: Stricter band edge check (≤20% for short, ≥80% for long)
  const isLong = intendedDirection === "long";
  const effectivePercentB = squeeze4h ? percentB4h : percentB1h;
  checkDetails.percentB = effectivePercentB;
  
  const priceAtCorrectEdge = isLong 
    ? (percentB4h >= 80 || percentB1h >= 80)  // v1.1: ≥80% for longs
    : (percentB4h <= 20 || percentB1h <= 20);  // v1.1: ≤20% for shorts
  
  checkDetails.atBandEdge = priceAtCorrectEdge;
  
  if (!priceAtCorrectEdge) {
    return { isValid: false, confidence: 0, direction: null, positionSizeMultiplier: 1.0, reasons: [`Price not at band edge (%B=${effectivePercentB.toFixed(0)}%, need ${isLong ? '≥80' : '≤20'}%)`], checkDetails };
  }
  confidence += 25;
  reasons.push(`Price at ${isLong ? "upper" : "lower"} band edge (%B4h=${percentB4h.toFixed(0)}, %B1h=${percentB1h.toFixed(0)})`);
  
  // Condition 3: Momentum building or confirmed (not 'none' or 'mixed')
  const macdExpanding = momentum.macdExpanding ?? false;
  const momentumState = momentum.state || 'none';
  const momentumBuilding = momentumState === "building" || momentumState === "confirmed";
  const stoch4h = stochRsi['4h'] || {};
  const stoch1h = stochRsi['1h'] || {};
  const stochK4h = stoch4h.k ?? 50;
  const stochK1h = stoch1h.k ?? 50;
  
  // StochRSI should be moving in trade direction
  const stochDirectionOk = isLong 
    ? (stochK1h > 30 && stochK1h < 80)
    : (stochK1h < 70 && stochK1h > 20);
  
  if (!macdExpanding && !momentumBuilding && !stochDirectionOk) {
    return { isValid: false, confidence: 0, direction: null, positionSizeMultiplier: 1.0, reasons: [`Momentum not building (state=${momentumState})`], checkDetails };
  }
  
  if (macdExpanding) {
    confidence += 20;
    reasons.push("MACD expanding");
  }
  if (momentumBuilding) {
    confidence += 15;
    reasons.push(`Momentum ${momentum.state}`);
  }
  
  // v1.1 NEW: Condition 3.5 - ADX slope must be rising (≥ 0.05)
  // This prevents fake squeezes that never expand
  const MIN_ADX_SLOPE_FOR_SQUEEZE = 0.05;
  checkDetails.slopeOk = adxSlope >= MIN_ADX_SLOPE_FOR_SQUEEZE;
  
  if (adxSlope < MIN_ADX_SLOPE_FOR_SQUEEZE) {
    return { 
      isValid: false, 
      confidence: 0, 
      direction: null, 
      positionSizeMultiplier: 1.0, 
      reasons: [`ADX slope too flat (${adxSlope.toFixed(3)} < ${MIN_ADX_SLOPE_FOR_SQUEEZE}) - squeeze may not expand`], 
      checkDetails 
    };
  }
  confidence += 10;
  reasons.push(`ADX slope rising (${adxSlope.toFixed(3)} ≥ ${MIN_ADX_SLOPE_FOR_SQUEEZE})`);
  
  // Condition 4: No reversal divergence (critical for squeeze entries)
  const hasDivergence = momentum.hasDivergence ?? false;
  if (hasDivergence) {
    return { isValid: false, confidence: 0, direction: null, positionSizeMultiplier: 1.0, reasons: ["MACD divergence detected - not safe for squeeze entry"], checkDetails };
  }
  confidence += 10;
  reasons.push("No reversal divergence");
  
  // Condition 5: HTF trend not opposing (4h neutral is OK, 4h opposite is NOT)
  const trend4h = timeframes['4h']?.trend || "neutral";
  const trend1h = timeframes['1h']?.trend || "neutral";
  
  const htfOpposing = isLong 
    ? trend4h === "bearish"
    : trend4h === "bullish";
  
  if (htfOpposing) {
    return { isValid: false, confidence: 0, direction: null, positionSizeMultiplier: 1.0, reasons: [`4h trend (${trend4h}) opposes ${intendedDirection} direction`], checkDetails };
  }
  
  // Bonus: 1h trend aligned
  const htf1hAligned = isLong ? trend1h === "bullish" : trend1h === "bearish";
  if (htf1hAligned) {
    confidence += 10;
    reasons.push(`1h trend aligned (${trend1h})`);
  }
  
  // Final validation: confidence must be >= 60 for squeeze breakout
  const isValid = confidence >= 60;
  
  // v1.1: Squeeze breakout entries get 0.65x position size
  const positionSizeMultiplier = isValid ? 0.65 : 1.0;
  
  if (isValid) {
    reasons.push(`Squeeze breakout confidence: ${confidence}%`);
  }
  
  return {
    isValid,
    confidence,
    direction: isValid ? intendedDirection : null,
    positionSizeMultiplier,
    reasons,
    checkDetails,
  };
};

// ============= EARLY IGNITION EXCEPTION (v1.1) =============
// Purpose: Allow entries in emerging trends before ADX fully registers the move
// Conditions: EARLY_TREND regime + ADX slope > 0 + 4H ≥ 55% + 1H aligned with 4H
export interface EarlyIgnitionResult {
  isValid: boolean;
  positionSizeMultiplier: number;
  reasons: string[];
  checkDetails: {
    isEarlyTrendRegime: boolean;
    regime: string;
    slopeRising: boolean;
    adxSlope: number;
    htfConfidence: number;
    is1hAligned: boolean;
    trend4h: string;
    trend1h: string;
  };
}

export const checkEarlyIgnitionException = (
  trendData: any,
  intendedDirection: "long" | "short" | null,
  regime: string
): EarlyIgnitionResult => {
  const reasons: string[] = [];
  
  // Initialize check details
  const checkDetails = {
    isEarlyTrendRegime: false,
    regime: regime || 'UNKNOWN',
    slopeRising: false,
    adxSlope: 0,
    htfConfidence: 0,
    is1hAligned: false,
    trend4h: 'neutral',
    trend1h: 'neutral',
  };
  
  if (!trendData || !intendedDirection) {
    return { isValid: false, positionSizeMultiplier: 1.0, reasons: ["No trend data or direction"], checkDetails };
  }
  
  const adxSlope = trendData?.volatility?.adxSlope ?? 0;
  const timeframes = trendData?.timeframes || {};
  const stochFilter4h = trendData?.stochFilter?.['4h'] || {};
  const stochFilter1h = trendData?.stochFilter?.['1h'] || {};
  
  const trend4h = stochFilter4h.trend || timeframes['4h']?.trend || "neutral";
  const conf4h = stochFilter4h.confidence || timeframes['4h']?.confidence || 0;
  const trend1h = stochFilter1h.trend || timeframes['1h']?.trend || "neutral";
  
  // Update check details
  checkDetails.adxSlope = adxSlope;
  checkDetails.htfConfidence = conf4h;
  checkDetails.trend4h = trend4h;
  checkDetails.trend1h = trend1h;
  
  // Condition 1: Must be EARLY_TREND regime
  const isEarlyTrendRegime = regime === 'EARLY_TREND';
  checkDetails.isEarlyTrendRegime = isEarlyTrendRegime;
  
  if (!isEarlyTrendRegime) {
    return { isValid: false, positionSizeMultiplier: 1.0, reasons: [`Regime is ${regime}, not EARLY_TREND`], checkDetails };
  }
  reasons.push(`Regime is EARLY_TREND (structural shift detected)`);
  
  // Condition 2: ADX slope must be rising (> 0)
  const slopeRising = adxSlope > 0;
  checkDetails.slopeRising = slopeRising;
  
  if (!slopeRising) {
    return { isValid: false, positionSizeMultiplier: 1.0, reasons: [`ADX slope not rising (${adxSlope.toFixed(3)} ≤ 0)`], checkDetails };
  }
  reasons.push(`ADX slope rising (${adxSlope.toFixed(3)} > 0)`);
  
  // Condition 3: 4H confidence ≥ 55%
  const MIN_4H_CONFIDENCE = 55;
  if (conf4h < MIN_4H_CONFIDENCE) {
    return { isValid: false, positionSizeMultiplier: 1.0, reasons: [`4H confidence ${conf4h.toFixed(0)}% < ${MIN_4H_CONFIDENCE}%`], checkDetails };
  }
  reasons.push(`4H confidence ${conf4h.toFixed(0)}% ≥ ${MIN_4H_CONFIDENCE}%`);
  
  // Condition 4: 1H must align with 4H direction
  const isLong = intendedDirection === 'long';
  const is1hAligned = isLong
    ? (trend4h === 'bullish' && trend1h === 'bullish')
    : (trend4h === 'bearish' && trend1h === 'bearish');
  
  checkDetails.is1hAligned = is1hAligned;
  
  if (!is1hAligned) {
    return { 
      isValid: false, 
      positionSizeMultiplier: 1.0, 
      reasons: [`1H (${trend1h}) not aligned with 4H (${trend4h}) for ${intendedDirection}`], 
      checkDetails 
    };
  }
  reasons.push(`1H aligned with 4H (both ${trend4h})`);
  
  // All conditions passed - Early Ignition allowed
  reasons.push("Early Ignition exception approved");
  
  return {
    isValid: true,
    positionSizeMultiplier: 0.70,  // v1.1: 0.70x position size
    reasons,
    checkDetails,
  };
};

// ============= EARLY IGNITION ENTRY DETECTION =============
// NEW MODULE: Captures the 30-90 minute pre-expansion window
// This is VOLATILITY IGNITION entry, not trend following or mean reversion
// Detects: compression → expansion transition with volume surge
// ONLY bypasses NO_CLEAR_DIRECTION - all other hard gates remain active
export interface EarlyIgnitionEntryResult {
  isValid: boolean;
  direction: "long" | "short" | null;
  positionSizeMultiplier: number;
  stopMultiplier: number;
  reasons: string[];
  // v1.1: Near-miss tracking for Phase A (pre-ignition watch)
  isNearMiss: boolean;  // True when squeeze active but ADX slope still negative
  nearMissReason?: string;
  checkDetails: {
    hadRecentSqueeze: boolean;
    squeezeTimeframe: string;
    widthExpanding: boolean;
    widthExpansionPercent: number;
    adxSlope: number;
    adxSlopeOk: boolean;
    adxSlopeRising: boolean;  // v1.1: Track if slope is clearly rising (> 0.05)
    adxValue: number;
    volumeSurge: boolean;
    volumeRatio: number;
    volumeZScore: number;
    rangeBreakDetected: boolean;
    rangeBreakDirection: "long" | "short" | null;
    rangeBreakPercent: number;
    stochRsiSafe: boolean;
    stochRsiK: number;
    htfOpposing: boolean;
    htfSupporting: boolean;
    htfNeutral: boolean;
    // v1.1: Phase tracking
    phase: 'A_PRE_IGNITION' | 'B_IGNITION_TRIGGER' | 'C_EXPANSION' | 'NONE';
  };
}

export const detectEarlyIgnitionEntry = (
  trendData: any,
  klineData: any[],  // Recent klines for range detection
  volumeData: { ratio: number; zScore?: number; spike?: boolean }
): EarlyIgnitionEntryResult => {
  const reasons: string[] = [];
  
  // v1.1 REFINED: Allow ADX slope >= 0 (flattening) for earlier entry
  // Key insight: ADX slope crossing from negative → flat is the signal (step 3-4, not step 5)
  const P = {
    MIN_ADX_SLOPE: 0,           // v1.1: Allow flat (>= 0) for Phase B trigger
    MIN_ADX_SLOPE_RISING: 0.05, // Clearly rising slope = bonus sizing
    MIN_ADX_FLOOR: 15,
    MIN_VOLUME_ZSCORE: 1.5,
    MIN_VOLUME_RATIO: 1.5,
    MIN_BREAK_PERCENT: 0.15,
    MAX_STOCHRSI_K_FOR_LONG: 95,
    MIN_STOCHRSI_K_FOR_SHORT: 5,
    TIER_0_BLOCK_K_FLOOR: 2,
    TIER_0_BLOCK_K_CEILING: 98,
    HTF_OPPOSING_CONFIDENCE_THRESHOLD: 60,
    POSITION_SIZE_BASE: 0.35,
    POSITION_SIZE_SLOPE_RISING: 0.40,  // v1.1: Bonus when slope clearly rising
    POSITION_SIZE_WITH_HTF_SUPPORT: 0.45,
    POSITION_SIZE_WEAK_VOLUME: 0.30,
    STOP_LOSS_ATR_MULTIPLIER: 1.0,
  };
  
  // Initialize check details with v1.1 fields
  const checkDetails = {
    hadRecentSqueeze: false,
    squeezeTimeframe: '',
    widthExpanding: false,
    widthExpansionPercent: 0,
    adxSlope: 0,
    adxSlopeOk: false,
    adxSlopeRising: false,  // v1.1: Track if clearly rising (> 0.05)
    adxValue: 0,
    volumeSurge: false,
    volumeRatio: 0,
    volumeZScore: 0,
    rangeBreakDetected: false,
    rangeBreakDirection: null as "long" | "short" | null,
    rangeBreakPercent: 0,
    stochRsiSafe: false,
    stochRsiK: 50,
    htfOpposing: false,
    htfSupporting: false,
    htfNeutral: true,
    phase: 'NONE' as 'A_PRE_IGNITION' | 'B_IGNITION_TRIGGER' | 'C_EXPANSION' | 'NONE',
  };
  
  // Helper to create consistent return result
  const createResult = (
    isValid: boolean,
    direction: "long" | "short" | null,
    positionSizeMultiplier: number,
    stopMultiplier: number,
    resultReasons: string[],
    isNearMiss: boolean = false,
    nearMissReason?: string
  ): EarlyIgnitionEntryResult => ({
    isValid,
    direction,
    positionSizeMultiplier,
    stopMultiplier,
    reasons: resultReasons,
    isNearMiss,
    nearMissReason,
    checkDetails,
  });
  
  if (!trendData) {
    return createResult(false, null, 1.0, 1.0, ["No trend data"]);
  }
  
  const bollinger = trendData?.bollingerBands || {};
  const volatility = trendData?.volatility || {};
  const timeframes = trendData?.timeframes || {};
  const stochRsi = trendData?.stochasticRsi || {};
  
  const adx = volatility.adx || 0;
  const adxSlope = volatility.adxSlope ?? 0;
  checkDetails.adxValue = adx;
  checkDetails.adxSlope = adxSlope;
  checkDetails.adxSlopeRising = adxSlope >= P.MIN_ADX_SLOPE_RISING;
  
  // ===== CONDITION 1: BB Squeeze (compression detected) =====
  const bb4h = bollinger['4h'] || {};
  const bb1h = bollinger['1h'] || {};
  const squeeze4h = bb4h.squeeze || bb4h.squeezeActive || false;
  const squeeze1h = bb1h.squeeze || bb1h.squeezeActive || false;
  const hadRecentSqueeze = squeeze4h || squeeze1h;
  
  checkDetails.hadRecentSqueeze = hadRecentSqueeze;
  checkDetails.squeezeTimeframe = squeeze4h ? '4h' : (squeeze1h ? '1h' : 'none');
  
  if (!hadRecentSqueeze) {
    return createResult(false, null, 1.0, 1.0, ["No recent BB squeeze (compression required)"]);
  }
  reasons.push(`BB squeeze detected on ${checkDetails.squeezeTimeframe}`);
  
  // ===== CONDITION 2: BB Width Expanding (breakout starting) =====
  const currentWidth = bb1h.bandwidth || bb4h.bandwidth || 0;
  const widthHistory = volatility.bandwidthHistory || [];
  let widthExpanding = false;
  let widthExpansionPercent = 0;
  
  if (widthHistory.length >= 3) {
    const avgPriorWidth = widthHistory.slice(0, 3).reduce((a: number, b: number) => a + b, 0) / 3;
    if (avgPriorWidth > 0 && currentWidth > avgPriorWidth) {
      widthExpansionPercent = ((currentWidth - avgPriorWidth) / avgPriorWidth) * 100;
      widthExpanding = widthExpansionPercent >= 10;
    }
  } else if (bb1h.widthExpanding || volatility.widthExpanding) {
    widthExpanding = true;
    widthExpansionPercent = 15;
  }
  
  checkDetails.widthExpanding = widthExpanding;
  checkDetails.widthExpansionPercent = widthExpansionPercent;
  
  if (!widthExpanding) {
    return createResult(false, null, 1.0, 1.0, 
      [`BB width not expanding (${widthExpansionPercent.toFixed(1)}% < 10% required)`]);
  }
  reasons.push(`BB width expanding ${widthExpansionPercent.toFixed(1)}%`);
  
  // ===== CONDITION 3: ADX Slope (v1.1 REFINED) =====
  // v1.1: ADX slope >= 0 (flat or rising) triggers Phase B
  // ADX slope < 0 with squeeze = Phase A (pre-ignition watch, near-miss)
  checkDetails.adxSlopeOk = adxSlope >= P.MIN_ADX_SLOPE;
  
  // Check if we're in Phase A (pre-ignition): squeeze active but ADX slope still negative
  if (adxSlope < P.MIN_ADX_SLOPE) {
    checkDetails.phase = 'A_PRE_IGNITION';
    const nearMissReason = `IGNITION_FORMING: Squeeze active but ADX slope ${adxSlope.toFixed(3)} < 0 (energy still decaying)`;
    return createResult(
      false, 
      null, 
      1.0, 
      1.0,
      [`ADX slope ${adxSlope.toFixed(3)} < ${P.MIN_ADX_SLOPE} (Phase A: pre-ignition watch)`], 
      true,  // isNearMiss = true for Phase A
      nearMissReason
    );
  }
  
  // Check ADX floor
  if (adx < P.MIN_ADX_FLOOR) {
    return createResult(false, null, 1.0, 1.0,
      [`ADX ${adx.toFixed(1)} < ${P.MIN_ADX_FLOOR} (below floor)`]);
  }
  
  // ADX slope is flat or rising - Phase B confirmed
  checkDetails.phase = 'B_IGNITION_TRIGGER';
  const slopeDesc = checkDetails.adxSlopeRising ? 'rising' : 'flat (flattening from negative)';
  reasons.push(`ADX slope ${adxSlope.toFixed(3)} ${slopeDesc}, ADX=${adx.toFixed(1)}`);
  
  // ===== CONDITION 4: Volume Surge =====
  const volumeRatio = volumeData.ratio || 1.0;
  const volumeZScore = volumeData.zScore ?? (volumeRatio > 1.5 ? 1.6 : 0.8);
  
  checkDetails.volumeRatio = volumeRatio;
  checkDetails.volumeZScore = volumeZScore;
  checkDetails.volumeSurge = volumeZScore >= P.MIN_VOLUME_ZSCORE || volumeRatio >= P.MIN_VOLUME_RATIO;
  
  if (!checkDetails.volumeSurge) {
    return createResult(false, null, 1.0, 1.0,
      [`Volume not surging (ratio=${volumeRatio.toFixed(2)}, zScore=${volumeZScore.toFixed(2)})`]);
  }
  reasons.push(`Volume surge: ratio=${volumeRatio.toFixed(2)}, zScore=${volumeZScore.toFixed(2)}`);
  
  // ===== CONDITION 5: Micro Range Break =====
  let rangeBreakDirection: "long" | "short" | null = null;
  let rangeBreakPercent = 0;
  
  if (klineData && klineData.length >= 12) {
    const recentCandles = klineData.slice(-12);
    const highs = recentCandles.map((k: any) => parseFloat(k[2]) || k.high || 0).filter(Number.isFinite);
    const lows = recentCandles.map((k: any) => parseFloat(k[3]) || k.low || 0).filter(Number.isFinite);
    const currentClose = parseFloat(recentCandles[recentCandles.length - 1]?.[4]) || 0;
    
    if (highs.length >= 10 && currentClose > 0) {
      const rangeHigh = Math.max(...highs.slice(0, -2));
      const rangeLow = Math.min(...lows.slice(0, -2));
      
      if (rangeHigh > 0 && rangeLow > 0) {
        const breakAbove = ((currentClose - rangeHigh) / rangeHigh) * 100;
        const breakBelow = ((rangeLow - currentClose) / rangeLow) * 100;
        
        if (breakAbove >= P.MIN_BREAK_PERCENT) {
          rangeBreakDirection = "long";
          rangeBreakPercent = breakAbove;
        } else if (breakBelow >= P.MIN_BREAK_PERCENT) {
          rangeBreakDirection = "short";
          rangeBreakPercent = breakBelow;
        }
      }
    }
  } else {
    const percentB1h = bb1h.percentB ?? 50;
    if (percentB1h >= 85) {
      rangeBreakDirection = "long";
      rangeBreakPercent = (percentB1h - 80) / 20 * 0.5;
    } else if (percentB1h <= 15) {
      rangeBreakDirection = "short";
      rangeBreakPercent = (20 - percentB1h) / 20 * 0.5;
    }
  }
  
  checkDetails.rangeBreakDetected = rangeBreakDirection !== null;
  checkDetails.rangeBreakDirection = rangeBreakDirection;
  checkDetails.rangeBreakPercent = rangeBreakPercent;
  
  if (!rangeBreakDirection) {
    return createResult(false, null, 1.0, 1.0, ["No micro range break detected"]);
  }
  reasons.push(`Range break ${rangeBreakDirection.toUpperCase()}: ${rangeBreakPercent.toFixed(2)}%`);
  
  // ===== CONDITION 6: StochRSI Safety =====
  const stochK4h = stochRsi['4h']?.k ?? 50;
  checkDetails.stochRsiK = stochK4h;
  
  if (stochK4h <= P.TIER_0_BLOCK_K_FLOOR || stochK4h >= P.TIER_0_BLOCK_K_CEILING) {
    return createResult(false, null, 1.0, 1.0,
      [`StochRSI K=${stochK4h.toFixed(1)} at Tier 0 extreme (blocked)`]);
  }
  
  if (rangeBreakDirection === "long" && stochK4h > P.MAX_STOCHRSI_K_FOR_LONG) {
    return createResult(false, null, 1.0, 1.0,
      [`StochRSI K=${stochK4h.toFixed(1)} > ${P.MAX_STOCHRSI_K_FOR_LONG} for LONG`]);
  }
  if (rangeBreakDirection === "short" && stochK4h < P.MIN_STOCHRSI_K_FOR_SHORT) {
    return createResult(false, null, 1.0, 1.0,
      [`StochRSI K=${stochK4h.toFixed(1)} < ${P.MIN_STOCHRSI_K_FOR_SHORT} for SHORT`]);
  }
  
  checkDetails.stochRsiSafe = true;
  reasons.push(`StochRSI K=${stochK4h.toFixed(1)} safe for ${rangeBreakDirection}`);
  
  // ===== HTF CHECK: Must NOT oppose =====
  const trend4h = timeframes['4h']?.trend || "neutral";
  const conf4h = timeframes['4h']?.confidence || 50;
  
  const htfOpposing = (rangeBreakDirection === "long" && trend4h === "bearish" && conf4h >= P.HTF_OPPOSING_CONFIDENCE_THRESHOLD) ||
                      (rangeBreakDirection === "short" && trend4h === "bullish" && conf4h >= P.HTF_OPPOSING_CONFIDENCE_THRESHOLD);
  
  const htfSupporting = (rangeBreakDirection === "long" && trend4h === "bullish") ||
                        (rangeBreakDirection === "short" && trend4h === "bearish");
  
  const htfNeutral = trend4h === "neutral";
  
  checkDetails.htfOpposing = htfOpposing;
  checkDetails.htfSupporting = htfSupporting;
  checkDetails.htfNeutral = htfNeutral;
  
  if (htfOpposing) {
    return createResult(false, null, 1.0, 1.0,
      [`HTF (4h=${trend4h}, ${conf4h.toFixed(0)}%) opposes ${rangeBreakDirection}`]);
  }
  reasons.push(`HTF not opposing (4h=${trend4h}, ${conf4h.toFixed(0)}%)`);
  
  // ===== ALL CONDITIONS PASSED - PHASE B IGNITION ENTRY VALID =====
  reasons.push("✅ EARLY IGNITION ENTRY v1.1: All conditions met (Phase B trigger)");
  
  // v1.1: Graduated position sizing based on ADX slope
  let positionSizeMultiplier = P.POSITION_SIZE_BASE;  // 0.35 for flat slope
  
  if (htfSupporting) {
    positionSizeMultiplier = P.POSITION_SIZE_WITH_HTF_SUPPORT;  // 0.45 with HTF support
  } else if (checkDetails.adxSlopeRising) {
    positionSizeMultiplier = P.POSITION_SIZE_SLOPE_RISING;  // 0.40 for clearly rising slope
  } else if (volumeZScore < 2.0) {
    positionSizeMultiplier = P.POSITION_SIZE_WEAK_VOLUME;  // 0.30 for weak volume
  }
  
  return createResult(
    true,
    rangeBreakDirection,
    positionSizeMultiplier,
    P.STOP_LOSS_ATR_MULTIPLIER,
    reasons
  );
};

// ============= DERIVE TRADE DIRECTION =============
// Explicitly derives trade direction from multi-timeframe trend data
// Returns null if no clear direction can be determined
// PHASE 1 OPTIMIZATION: Now uses weighted direction derivation + persistence bonus
export type TradeDirection = "long" | "short";

// ============= DIRECTION CONTEXT OBJECT =============
// Centralizes direction rationale for each tier to improve traceability,
// conflict resolution, and post-trade analytics
export interface DirectionContext {
  proposedDirection: TradeDirection | null;
  evidenceType: 'HTF_CONSENSUS' | 'MOMENTUM' | 'ORDER_FLOW' | 'PRICE_ACTION' | 'STOCHRSI' | 'EXHAUSTION' | 'WEIGHTED_SUM' | 'MICRO_STRUCTURE' | 'NONE';
  tier: number;
  tierSource: string;
  confidence: number;
  positionMultiplier: number;
  isCounterTrend: boolean;
  riskClass: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  evidenceStrength: 'WEAK' | 'MODERATE' | 'STRONG' | 'VERY_STRONG';
  conflictsWith: string[];  // List of conflicting tiers/sources
}

// Helper function to create DirectionContext with consistent defaults
const createDirectionContext = (
  direction: TradeDirection | null,
  params: {
    evidenceType: DirectionContext['evidenceType'];
    tier: number;
    tierSource: string;
    confidence: number;
    positionMultiplier: number;
    isCounterTrend?: boolean;
    riskClass?: DirectionContext['riskClass'];
    evidenceStrength?: DirectionContext['evidenceStrength'];
    conflictsWith?: string[];
  }
): DirectionContext => {
  // Derive riskClass from tier and position multiplier if not provided
  const inferredRiskClass = params.riskClass || (
    params.tier <= 1 ? 'LOW' :
    params.tier <= 4 ? 'MEDIUM' :
    params.tier <= 8 ? 'HIGH' : 'EXTREME'
  );
  
  // Derive evidenceStrength from confidence if not provided
  const inferredEvidenceStrength = params.evidenceStrength || (
    params.confidence >= 75 ? 'VERY_STRONG' :
    params.confidence >= 60 ? 'STRONG' :
    params.confidence >= 45 ? 'MODERATE' : 'WEAK'
  );

  return {
    proposedDirection: direction,
    evidenceType: params.evidenceType,
    tier: params.tier,
    tierSource: params.tierSource,
    confidence: params.confidence,
    positionMultiplier: params.positionMultiplier,
    isCounterTrend: params.isCounterTrend ?? false,
    riskClass: inferredRiskClass,
    evidenceStrength: inferredEvidenceStrength,
    conflictsWith: params.conflictsWith ?? [],
  };
};

export interface DirectionResult {
  direction: TradeDirection | null;
  confidence: number;
  source: string;  // Which timeframe/signal determined direction
  reasons: string[];
  isWeightedDerivation?: boolean;      // Used weighted sum
  hasPersistenceBonus?: boolean;       // Got persistence bonus
  orderFlowTiebreaker?: boolean;       // Order flow resolved tie
  positionSizeMultiplier?: number;     // Recommended position size
  isMomentumFallback?: boolean;        // Used momentum + order flow fallback
  isMomentumOverride?: boolean;        // Used momentum override (higher priority than 30m trend)
  regime?: DirectionRegime;            // Market regime used for direction derivation
  tier2Score?: number;                 // Tier 2 weighted confirmation score
  isEscapeHatch?: boolean;             // Used directional bias escape hatch
  isExhaustionReversal?: boolean;       // Used exhaustion reversal override (Priority 0.25)
  isExhaustionEscape?: boolean;         // Used exhaustion escape (Priority 8 - final escape valve)
  isBiasResolution?: boolean;           // Used Tier 9.5 bias resolution (micro-structure evidence)
  // ===== PHASE 2 ADDITIONS =====
  is4hWeak?: boolean;                  // 4H confidence was below threshold
  trend30mAligned?: boolean;           // 30m trend aligned with order flow direction
  alignmentStatus?: "blocked" | "neutral" | "full";  // 30m alignment status for analytics
  // ===== PHASE 3 ADDITIONS: MOMENTUM WEIGHT =====
  momentumImpact?: 'aligned' | 'weak_opposing' | 'strong_opposing' | 'very_strong_opposing' | 'extreme_opposing' | 'neutral';  // How momentum affected derivation
  momentumScore?: number;              // Raw momentum score at derivation time
  // ===== GRADUATED MOMENTUM PENALTY DIAGNOSTICS =====
  graduatedMomentumEffect?: {
    directionFlipped: boolean;         // Momentum penalty caused direction to flip (LONG→SHORT or vice versa)
    directionNullified: boolean;       // Momentum penalty pushed sum below threshold (no direction)
    baseDirection: 'long' | 'short' | null;  // Direction before momentum adjustment
    adjustedDirection: 'long' | 'short' | null;  // Direction after momentum adjustment
    baseWeightedSum: number;           // Sum before momentum adjustment
    adjustedWeightedSum: number;       // Sum after momentum adjustment
    penaltyApplied: number;            // Actual penalty value applied
  };
  // ===== DIRECTION CONTEXT (Orchestration) =====
  directionContext?: DirectionContext; // Centralized direction rationale for traceability
}

// Import direction params
import { GATE_RELAXATION_FLAGS, DIRECTION_DERIVATION_PARAMS, MOMENTUM_OVERRIDE_DIRECTION_PARAMS, BIAS_RESOLUTION_TIER, NET_SIGNAL_THRESHOLDS } from "./constants.ts";

// ============= PHASE 1: DIRECTION REGIME CLASSIFIER =============
// Classifies market into regime BEFORE direction derivation
interface RegimeConfig {
  relaxTier1Threshold: number;
  suppressStochImportance: boolean;
  momentumOverrideEnabled: boolean;
}

export const classifyDirectionRegime = (
  adx: number,
  adxSlope: number = 0
): { regime: DirectionRegime; config: RegimeConfig } => {
  const P = DIRECTION_REGIME_PARAMS;
  
  // Check for exhaustion first (high ADX + not accelerating)
  if (adx >= P.EXHAUSTION_ADX && adxSlope <= P.EXHAUSTION_SLOPE_THRESHOLD) {
    return { regime: 'EXHAUSTION', config: P.EXHAUSTION as RegimeConfig };
  }
  
  // Strong trend
  if (adx >= P.STRONG_TREND_ADX) {
    return { regime: 'STRONG_TREND', config: P.STRONG_TREND as RegimeConfig };
  }
  
  // Early trend
  if (adx >= P.EARLY_TREND_ADX) {
    return { regime: 'EARLY_TREND', config: P.EARLY_TREND as RegimeConfig };
  }
  
  // Range
  return { regime: 'RANGE', config: P.RANGE as RegimeConfig };
};

// ============= GRADUATED MOMENTUM PENALTY HELPER =============
// Scales penalty with momentum magnitude: extreme (+100) gets 4x penalty vs strong (+15)
type MomentumTier = 'aligned' | 'weak_opposing' | 'strong_opposing' | 'very_strong_opposing' | 'extreme_opposing' | 'neutral';

interface GraduatedPenaltyResult {
  penalty: number;
  confidenceReduction: number;
  positionMultiplier: number;
  tier: MomentumTier;
}

const calculateGraduatedMomentumPenalty = (
  absMomentum: number,
  P: typeof DIRECTION_DERIVATION_PARAMS
): GraduatedPenaltyResult => {
  const basePenalty = P.MOMENTUM_STRONG_OPPOSING_PENALTY;
  const baseConfReduction = P.MOMENTUM_CONFIDENCE_REDUCTION_STRONG;
  const basePosMult = P.MOMENTUM_POSITION_REDUCTION_STRONG;
  
  // Check if graduated penalty is enabled
  if (!P.GRADUATED_MOMENTUM_PENALTY_ENABLED) {
    return {
      penalty: basePenalty,
      confidenceReduction: baseConfReduction,
      positionMultiplier: basePosMult,
      tier: 'strong_opposing'
    };
  }
  
  // ===== v3.0: LINEAR SCALING MODE =====
  // penalty = clamp((absMomentum / 100) * MAX_PENALTY, MIN_PENALTY, MAX_PENALTY)
  // This replaces the discrete tier system for smoother penalty curves
  if (P.GRADUATED_SCALING_ENABLED) {
    const minPenalty = P.GRADUATED_MIN_PENALTY || 0.10;
    const maxPenalty = P.GRADUATED_MAX_PENALTY || 0.60;
    
    // Linear interpolation: score 15 → min, score 100 → max
    const range = 100 - 15; // 85
    const normalizedScore = Math.max(0, absMomentum - 15) / range; // 0 at 15, 1 at 100
    const scaledPenalty = minPenalty + (normalizedScore * (maxPenalty - minPenalty));
    const clampedPenalty = Math.min(maxPenalty, Math.max(minPenalty, scaledPenalty));
    
    // Scale confidence reduction and position multiplier similarly
    // At score 15: confReduction = 10%, posMult = 0.85
    // At score 100: confReduction = 50%, posMult = 0.20
    const minConfReduction = 10;
    const maxConfReduction = 50;
    const scaledConfReduction = Math.round(minConfReduction + (normalizedScore * (maxConfReduction - minConfReduction)));
    
    const minPosMult = 0.20;
    const maxPosMult = 0.85;
    const scaledPosMult = maxPosMult - (normalizedScore * (maxPosMult - minPosMult));
    
    // Determine tier for logging/UI purposes
    let tier: MomentumTier = 'strong_opposing';
    if (absMomentum >= (P.MOMENTUM_EXTREME_THRESHOLD || 50)) {
      tier = 'extreme_opposing';
    } else if (absMomentum >= (P.MOMENTUM_VERY_STRONG_THRESHOLD || 30)) {
      tier = 'very_strong_opposing';
    }
    
    return {
      penalty: clampedPenalty,
      confidenceReduction: scaledConfReduction,
      positionMultiplier: Math.max(minPosMult, scaledPosMult),
      tier
    };
  }
  
  // ===== LEGACY: DISCRETE TIER SYSTEM (when GRADUATED_SCALING_ENABLED = false) =====
  // EXTREME: |momentum| >= 50 (e.g., +100 during 5% bounce)
  if (absMomentum >= (P.MOMENTUM_EXTREME_THRESHOLD || 50)) {
    return {
      penalty: basePenalty * (P.MOMENTUM_EXTREME_PENALTY_MULTIPLIER || 4.0),
      confidenceReduction: Math.min(50, baseConfReduction * (P.MOMENTUM_EXTREME_CONFIDENCE_MULTIPLIER || 3.0)),
      positionMultiplier: P.MOMENTUM_EXTREME_POSITION_MULTIPLIER || 0.30,
      tier: 'extreme_opposing'
    };
  }
  
  // VERY STRONG: |momentum| >= 30
  if (absMomentum >= (P.MOMENTUM_VERY_STRONG_THRESHOLD || 30)) {
    return {
      penalty: basePenalty * (P.MOMENTUM_VERY_STRONG_PENALTY_MULTIPLIER || 2.5),
      confidenceReduction: Math.min(40, baseConfReduction * (P.MOMENTUM_VERY_STRONG_CONFIDENCE_MULTIPLIER || 2.0)),
      positionMultiplier: P.MOMENTUM_VERY_STRONG_POSITION_MULTIPLIER || 0.50,
      tier: 'very_strong_opposing'
    };
  }
  
  // STRONG: |momentum| >= 15 (base level, with 1.5x multiplier for safety margin)
  return {
    penalty: basePenalty * (P.MOMENTUM_STRONG_PENALTY_MULTIPLIER || 1.5),
    confidenceReduction: baseConfReduction,
    positionMultiplier: basePosMult,
    tier: 'strong_opposing'
  };
};

// ============= EXTREME MOMENTUM VETO v3.0 =============
// Hard veto before direction derivation - prevents SHORT when momentum is +50+
// and prevents LONG when momentum is -50 or below
type ExtremeVetoResult = {
  vetoed: boolean;
  reason: string | null;
  vetoedDirection: 'long' | 'short' | null;
  momentumScore: number;
};

const checkExtremeMomentumVeto = (
  momentumScore: number,
  tentativeDirection: 'long' | 'short',
  P: typeof DIRECTION_DERIVATION_PARAMS
): ExtremeVetoResult => {
  if (!P.EXTREME_MOMENTUM_VETO_ENABLED) {
    return { vetoed: false, reason: null, vetoedDirection: null, momentumScore };
  }
  
  const extremeBullThreshold = P.EXTREME_BULL_MOMENTUM_THRESHOLD || 50;
  const extremeBearThreshold = P.EXTREME_BEAR_MOMENTUM_THRESHOLD || -50;
  
  // Veto SHORT when momentum is extremely bullish
  if (tentativeDirection === 'short' && momentumScore >= extremeBullThreshold) {
    return {
      vetoed: true,
      reason: `EXTREME MOMENTUM VETO: Cannot derive SHORT with momentum +${momentumScore.toFixed(0)} >= +${extremeBullThreshold}`,
      vetoedDirection: 'short',
      momentumScore
    };
  }
  
  // Veto LONG when momentum is extremely bearish
  if (tentativeDirection === 'long' && momentumScore <= extremeBearThreshold) {
    return {
      vetoed: true,
      reason: `EXTREME MOMENTUM VETO: Cannot derive LONG with momentum ${momentumScore.toFixed(0)} <= ${extremeBearThreshold}`,
      vetoedDirection: 'long',
      momentumScore
    };
  }
  
  return { vetoed: false, reason: null, vetoedDirection: null, momentumScore };
};

export const deriveTradeDirection = (
  trendData: any,
  primaryTrend: string,
  orderFlowData?: { score: number; signal: string } | null
): DirectionResult => {
  const reasons: string[] = [];
  const P = DIRECTION_DERIVATION_PARAMS;
  
  
  if (!trendData) {
    return { direction: null, confidence: 0, source: "none", reasons: ["No trend data"] };
  }
  
  const timeframes = trendData.timeframes || {};
  const trend4h = timeframes['4h']?.trend || "neutral";
  const trend1h = timeframes['1h']?.trend || "neutral";
  const trend30m = timeframes['30m']?.trend || "neutral";
  
  const conf4h = timeframes['4h']?.confidence || 0;
  const conf1h = timeframes['1h']?.confidence || 0;
  const conf30m = timeframes['30m']?.confidence || 0;
  
  // Get ADX for price action override check
  const adx = trendData.volatility?.adx || trendData.momentum?.adx || 0;
  const adxSlope = trendData.volatility?.adxSlope || trendData.momentum?.adxSlope || 0;
  
  // ============= PHASE 1: REGIME CLASSIFICATION =============
  // Classify market regime BEFORE direction derivation to adjust gate behavior
  const { regime, config: regimeConfig } = DIRECTION_REGIME_PARAMS.ENABLED 
    ? classifyDirectionRegime(adx, adxSlope)
    : { regime: 'EARLY_TREND' as DirectionRegime, config: DIRECTION_REGIME_PARAMS.EARLY_TREND };
  
  reasons.push(`REGIME: ${regime} (ADX=${adx.toFixed(1)}, slope=${adxSlope.toFixed(2)})`);
  
  // Get regime-adjusted Tier 1 threshold
  const regimeTier1Threshold = regimeConfig.relaxTier1Threshold;
  const suppressStochRSI = regimeConfig.suppressStochImportance;
  
  // ============= OUTER SCOPE: GRADUATED MOMENTUM EFFECT TRACKING =============
  // These are populated inside weighted derivation but used in final NO_CLEAR_DIRECTION return
  let outerGraduatedMomentumEffect: {
    directionFlipped: boolean;
    directionNullified: boolean;
    baseDirection: 'long' | 'short' | null;
    adjustedDirection: 'long' | 'short' | null;
    baseWeightedSum: number;
    adjustedWeightedSum: number;
    penaltyApplied: number;
  } | undefined = undefined;
  let outerMomentumImpact: 'aligned' | 'weak_opposing' | 'strong_opposing' | 'very_strong_opposing' | 'extreme_opposing' | 'neutral' | undefined = undefined;
  let outerMomentumScore: number | undefined = undefined;
  
  // ============= NEW: PHASE 1 WEIGHTED DIRECTION DERIVATION =============
  // Instead of requiring one strong timeframe, use weighted sum of all timeframes
  // This relaxes the NO_CLEAR_DIRECTION gate significantly
  if (GATE_RELAXATION_FLAGS.DIRECTION_WEIGHTED) {
    // ============= NEUTRAL-BIAS AMPLIFICATION FIX: ENHANCED trendToValue =============
    // Instead of returning 0 for neutral trends, return scaled partial contribution
    // This preserves directional pressure even when trend labels are conservative
    const getMomentumDirectionHint = (): number => {
      // Use MACD/RSI to infer direction when trend is neutral
      const macdHistogram = trendData.momentum?.macdHistogram ?? trendData.indicators?.macdHistogram ?? 0;
      const rsi = trendData.indicators?.rsi ?? trendData.momentum?.rsi ?? 50;
      
      if (macdHistogram > 0 && rsi > 50) return 1;  // Bullish hint
      if (macdHistogram < 0 && rsi < 50) return -1; // Bearish hint
      if (macdHistogram > 0 || rsi > 55) return 0.5;
      if (macdHistogram < 0 || rsi < 45) return -0.5;
      return 0;
    };
    
    const trendToValue = (trend: string, conf: number): number => {
      // Use lowered neutral threshold (45% instead of 55%)
      if (trend === "neutral" && conf < P.NEUTRAL_THRESHOLD) {
        // ===== PARTIAL NEUTRAL CONTRIBUTION (PHASE 1 FIX) =====
        // If enabled, neutral trends with meaningful confidence still contribute
        if (P.ENABLE_PARTIAL_NEUTRAL_CONTRIBUTION && conf >= P.NEUTRAL_CONTRIBUTION_FLOOR) {
          // Scale partial weight based on confidence: 40-60% → 0.0-0.6
          const partialWeight = ((conf - P.NEUTRAL_CONTRIBUTION_FLOOR) / 
            ((P.NEUTRAL_CONTRIBUTION_CEILING || 60) - P.NEUTRAL_CONTRIBUTION_FLOOR)) * 
            (P.NEUTRAL_PARTIAL_MAX_WEIGHT || 0.6);
          const hint = getMomentumDirectionHint();
          const contribution = partialWeight * hint;
          if (Math.abs(contribution) > 0.05) {
            reasons.push(`PARTIAL NEUTRAL: conf=${conf.toFixed(0)}% → contrib=${(contribution * 100).toFixed(0)}% (hint=${hint > 0 ? 'bull' : hint < 0 ? 'bear' : 'none'})`);
          }
          return contribution;
        }
        return 0;
      }
      // Trends with conf 45-54% contribute partial weight
      const confWeight = Math.min(1, conf / 65);  // Scale 0-65% to 0-1
      if (trend === "bullish" || trend === "weak_bullish") return confWeight;
      if (trend === "bearish" || trend === "weak_bearish") return -confWeight;
      // For "neutral" but conf >= 45%, use partial contribution if enabled
      if (P.ENABLE_PARTIAL_NEUTRAL_CONTRIBUTION && conf >= P.NEUTRAL_CONTRIBUTION_FLOOR) {
        const partialWeight = ((conf - P.NEUTRAL_CONTRIBUTION_FLOOR) / 
          ((P.NEUTRAL_CONTRIBUTION_CEILING || 60) - P.NEUTRAL_CONTRIBUTION_FLOOR)) * 
          (P.NEUTRAL_PARTIAL_MAX_WEIGHT || 0.6);
        const hint = getMomentumDirectionHint();
        return partialWeight * hint;
      }
      return 0;
    };
    
    const val4h = trendToValue(trend4h, conf4h);
    const val1h = trendToValue(trend1h, conf1h);
    const val30m = trendToValue(trend30m, conf30m);
    
    // ============= PHASE 1 FIX: DYNAMIC WEIGHT REALLOCATION =============
    // When 4H is neutral and contributes nothing (val4h = 0), redistribute its weight
    // This prevents wasting 40% of the weighted sum when 4H is indecisive
    let w4h: number = P.WEIGHT_4H;
    let w1h: number = P.WEIGHT_1H;
    let w30m: number = P.WEIGHT_30M;
    let weightReallocated = false;
    
    if (P.ENABLE_WEIGHT_REALLOCATION && trend4h === "neutral" && conf4h < P.NEUTRAL_THRESHOLD) {
      // 4H won't contribute meaningful signal - redistribute to lower TFs
      w4h = 0;
      w1h = P.REALLOCATED_WEIGHT_1H;   // 0.65
      w30m = P.REALLOCATED_WEIGHT_30M; // 0.35
      weightReallocated = true;
      reasons.push(`WEIGHT REALLOCATION: 4H neutral (${conf4h.toFixed(0)}% < ${P.NEUTRAL_THRESHOLD}%) → 1H=${(w1h * 100).toFixed(0)}%, 30M=${(w30m * 100).toFixed(0)}%`);
    }
    
    // Calculate base weighted sum with potentially reallocated weights
    let baseWeightedSum = (val4h * w4h) + (val1h * w1h) + (val30m * w30m);
    
    // ===== STOCHRSI EXTREME AS DIRECTION BIAS (PHASE 5) =====
    // Add StochRSI extremes as bias input to weighted sum
    let stochBias = 0;
    if (P.ENABLE_STOCHRSI_BIAS) {
      const stochK4h = extractStochRsiK(trendData, '4h');
      if (stochK4h >= (P.STOCHRSI_OVERBOUGHT_K || 90)) {
        stochBias = -(P.STOCHRSI_BIAS_WEIGHT || 0.10);  // Overbought = bearish bias
        reasons.push(`STOCHRSI BIAS: K=${stochK4h.toFixed(0)} >= ${P.STOCHRSI_OVERBOUGHT_K || 90} → ${(stochBias * 100).toFixed(0)}% bearish bias`);
      } else if (stochK4h <= (P.STOCHRSI_OVERSOLD_K || 10)) {
        stochBias = +(P.STOCHRSI_BIAS_WEIGHT || 0.10);  // Oversold = bullish bias
        reasons.push(`STOCHRSI BIAS: K=${stochK4h.toFixed(0)} <= ${P.STOCHRSI_OVERSOLD_K || 10} → ${(stochBias * 100).toFixed(0)}% bullish bias`);
      }
    }
    baseWeightedSum += stochBias;
    
    // ===== PHASE 3: MOMENTUM WEIGHT IN DIRECTION DERIVATION =====
    // Factor momentum score into direction confidence - opposing momentum reduces certainty
    // This prevents deriving LONG when momentum is strongly bearish (-22)
    const momentumScore = trendData.smartMomentum?.score ?? trendData.momentum?.score ?? 0;
    let momentumAdjustment = 0;
    let momentumImpact: MomentumTier = 'neutral';
    let momentumConfidenceReduction = 0;
    let momentumPositionMultiplier = 1.0;
    
    // ===== EXTREME MOMENTUM VETO CHECK (v3.0) =====
    // Hard safety rail: extreme momentum completely blocks opposing direction derivation
    // This check happens BEFORE graduated penalties are calculated
    const tentativeDirection = baseWeightedSum > 0 ? 'long' : 'short';
    const vetoCheck = checkExtremeMomentumVeto(momentumScore, tentativeDirection, P);
    
    if (vetoCheck.vetoed) {
      // Return NO_CLEAR_DIRECTION with clear veto reason
      reasons.push(vetoCheck.reason!);
      reasons.push(`⛔ EXTREME MOMENTUM VETO ACTIVE: Cannot derive ${vetoCheck.vetoedDirection?.toUpperCase()} into |momentum| = ${Math.abs(momentumScore).toFixed(0)}`);
      
      // Track the veto in graduated momentum effect for UI
      outerGraduatedMomentumEffect = {
        directionFlipped: false,
        directionNullified: true,  // Veto is a form of nullification
        baseDirection: tentativeDirection,
        adjustedDirection: null,
        baseWeightedSum,
        adjustedWeightedSum: 0,
        penaltyApplied: 0,
      };
      outerMomentumImpact = 'extreme_opposing';
      outerMomentumScore = momentumScore;
      
      return {
        direction: null,
        confidence: 0,
        source: "extreme_momentum_veto",
        reasons,
        positionSizeMultiplier: 0,
        momentumImpact: 'extreme_opposing',
        momentumScore,
        graduatedMomentumEffect: outerGraduatedMomentumEffect,
      };
    }
    
    if (P.MOMENTUM_WEIGHT_ENABLED) {
      // Determine if momentum opposes or aligns with the tentative direction
      // (tentativeDirection already calculated above for veto check)
      
      if (tentativeDirection === 'long') {
        // For LONG: positive momentum = aligned, negative = opposing
        if (momentumScore >= Math.abs(P.MOMENTUM_STRONG_OPPOSING_THRESHOLD)) {
          // Strongly aligned momentum - bonus
          momentumAdjustment = P.MOMENTUM_ALIGNMENT_BONUS;
          momentumImpact = 'aligned';
        } else if (momentumScore <= P.MOMENTUM_STRONG_OPPOSING_THRESHOLD) {
          // Strongly opposing momentum for LONG (negative momentum opposes bullish)
          // Penalty should REDUCE the positive weighted sum → subtract penalty
          const absMomentum = Math.abs(momentumScore);
          const graduatedResult = calculateGraduatedMomentumPenalty(absMomentum, P);
          
          momentumAdjustment = -graduatedResult.penalty; // Negative adjustment reduces positive sum
          momentumImpact = graduatedResult.tier;
          momentumConfidenceReduction = graduatedResult.confidenceReduction;
          momentumPositionMultiplier = graduatedResult.positionMultiplier;
          
          reasons.push(`GRADUATED MOMENTUM: |${momentumScore.toFixed(0)}| → ${graduatedResult.tier} (penalty=${graduatedResult.penalty.toFixed(2)}, conf-${graduatedResult.confidenceReduction}%, pos=${(graduatedResult.positionMultiplier * 100).toFixed(0)}%)`);
        } else if (momentumScore <= P.MOMENTUM_WEAK_OPPOSING_THRESHOLD) {
          // Weakly opposing momentum (e.g., -8 < -5)
          momentumAdjustment = -P.MOMENTUM_WEAK_OPPOSING_PENALTY;
          momentumImpact = 'weak_opposing';
          momentumConfidenceReduction = P.MOMENTUM_CONFIDENCE_REDUCTION_WEAK;
          momentumPositionMultiplier = P.MOMENTUM_POSITION_REDUCTION_WEAK;
        }
      } else {
        // For SHORT: negative momentum = aligned, positive = opposing
        if (momentumScore <= -Math.abs(P.MOMENTUM_STRONG_OPPOSING_THRESHOLD)) {
          // Strongly aligned momentum (bearish) - bonus (makes sum more negative)
          momentumAdjustment = -P.MOMENTUM_ALIGNMENT_BONUS;
          momentumImpact = 'aligned';
        } else if (momentumScore >= -P.MOMENTUM_STRONG_OPPOSING_THRESHOLD) {
          // Strongly opposing momentum for SHORT (positive momentum opposes bearish)
          // Penalty should REDUCE the negative weighted sum magnitude → add penalty (positive)
          const absMomentum = Math.abs(momentumScore);
          const graduatedResult = calculateGraduatedMomentumPenalty(absMomentum, P);
          
          momentumAdjustment = +graduatedResult.penalty; // Positive adjustment reduces negative sum magnitude
          momentumImpact = graduatedResult.tier;
          momentumConfidenceReduction = graduatedResult.confidenceReduction;
          momentumPositionMultiplier = graduatedResult.positionMultiplier;
          
          
          reasons.push(`GRADUATED MOMENTUM: |${momentumScore.toFixed(0)}| → ${graduatedResult.tier} (penalty=+${graduatedResult.penalty.toFixed(2)} to reduce SHORT, conf-${graduatedResult.confidenceReduction}%, pos=${(graduatedResult.positionMultiplier * 100).toFixed(0)}%)`);
        } else if (momentumScore >= -P.MOMENTUM_WEAK_OPPOSING_THRESHOLD) {
          // Weakly opposing momentum for SHORT → positive adjustment
          momentumAdjustment = +P.MOMENTUM_WEAK_OPPOSING_PENALTY;
          momentumImpact = 'weak_opposing';
          momentumConfidenceReduction = P.MOMENTUM_CONFIDENCE_REDUCTION_WEAK;
          momentumPositionMultiplier = P.MOMENTUM_POSITION_REDUCTION_WEAK;
        }
      }
      
      if (momentumAdjustment !== 0) {
        reasons.push(`MOMENTUM WEIGHT: score=${momentumScore.toFixed(0)} → ${momentumImpact} (adj=${momentumAdjustment >= 0 ? '+' : ''}${(momentumAdjustment * 100).toFixed(0)}%)`);
      }
    }
    
    // Apply momentum adjustment to weighted sum
    const weightedSum = baseWeightedSum + momentumAdjustment;
    
    // ============= GRADUATED MOMENTUM PENALTY IMPACT LOGGING =============
    // Track when momentum penalty changes direction outcome
    const baseDirection = baseWeightedSum > 0 ? 'long' : (baseWeightedSum < 0 ? 'short' : null);
    const adjustedDirection = weightedSum > 0 ? 'long' : (weightedSum < 0 ? 'short' : null);
    const directionFlipped = baseDirection !== null && adjustedDirection !== null && baseDirection !== adjustedDirection;
    
    if (directionFlipped) {
      reasons.push(`🔄 GRADUATED MOMENTUM FLIPPED DIRECTION: ${baseDirection.toUpperCase()} → ${adjustedDirection.toUpperCase()} (base=${baseWeightedSum.toFixed(2)}, adj=${momentumAdjustment.toFixed(2)}, final=${weightedSum.toFixed(2)})`);
      reasons.push(`   ⚠️ Counter-momentum score |${momentumScore.toFixed(0)}| caused direction reversal`);
    }
    
    // Check for direction persistence bonus
    let persistenceBonus = 0;
    if (GATE_RELAXATION_FLAGS.DIRECTION_PERSISTENCE) {
      // Check if direction has been stable for N candles (from trend data if available)
      const directionStableBars = trendData.momentum?.directionStableBars ?? 0;
      if (directionStableBars >= P.PERSISTENCE_BARS) {
        persistenceBonus = P.PERSISTENCE_BONUS;
        reasons.push(`PERSISTENCE BONUS: Direction stable for ${directionStableBars} bars → +${(persistenceBonus * 100).toFixed(0)}% threshold reduction`);
      }
    }
    
    // Adjusted threshold with persistence bonus AND regime adjustment
    // PHASE 1: Use regime-adjusted threshold instead of hardcoded 0.55
    const baseThreshold = DIRECTION_REGIME_PARAMS.ENABLED ? regimeTier1Threshold : P.WEIGHTED_SUM_THRESHOLD;
    const effectiveThreshold = baseThreshold - persistenceBonus;
    
    // ============= DIRECTION NULLIFICATION CHECK =============
    // Track when momentum penalty pushes weighted sum below threshold
    const baseExceedsThreshold = Math.abs(baseWeightedSum) >= effectiveThreshold;
    const adjustedExceedsThreshold = Math.abs(weightedSum) >= effectiveThreshold;
    const directionNullified = baseExceedsThreshold && !adjustedExceedsThreshold;
    
    if (directionNullified) {
      reasons.push(`🚫 GRADUATED MOMENTUM NULLIFIED DIRECTION: |${baseWeightedSum.toFixed(2)}| → |${weightedSum.toFixed(2)}| < threshold ${effectiveThreshold.toFixed(2)}`);
      reasons.push(`   ⚠️ Counter-momentum score |${momentumScore.toFixed(0)}| prevented ${baseDirection?.toUpperCase() || 'unknown'} derivation`);
    }
    
    // ============= STORE GRADUATED MOMENTUM EFFECT FOR OUTER SCOPE =============
    // This enables NO_CLEAR_DIRECTION returns to include momentum penalty diagnostics
    outerGraduatedMomentumEffect = {
      directionFlipped,
      directionNullified,
      baseDirection,
      adjustedDirection,
      baseWeightedSum,
      adjustedWeightedSum: weightedSum,
      penaltyApplied: momentumAdjustment,
    };
    outerMomentumImpact = momentumImpact;
    outerMomentumScore = momentumScore;
    
    // If weighted sum exceeds threshold, derive direction
    if (Math.abs(weightedSum) >= effectiveThreshold) {
      const direction: TradeDirection = weightedSum > 0 ? "long" : "short";
      
      // ===== PHASE 2 GAP 2: CONFIDENCE BLENDING FIX =====
      // When 4H is weak, use max(1h, 30m) instead of blending weak confidence
      let derivedConf: number;
      let confSource: string = "weighted-sum";
      
      const is4hWeak = conf4h < (P.WEAK_4H_CONFIDENCE_THRESHOLD || 50);
      
      if (P.USE_MAX_LOWER_TF_CONFIDENCE && is4hWeak) {
        // Don't blend weak 4H confidence - use max of lower timeframes
        const maxLowerTfConf = Math.max(conf1h, conf30m);
        derivedConf = Math.min(75, maxLowerTfConf * 0.95); // 95% of max lower TF conf
        confSource = `max(1h,30m)=${maxLowerTfConf.toFixed(0)}%`;
        reasons.push(`CONFIDENCE FIX: 4H weak (${conf4h.toFixed(0)}% < ${P.WEAK_4H_CONFIDENCE_THRESHOLD}%) → using max(1h=${conf1h.toFixed(0)}%, 30m=${conf30m.toFixed(0)}%)=${maxLowerTfConf.toFixed(0)}%`);
      } else {
        // Normal: Calculate confidence from weighted sum magnitude
        derivedConf = Math.min(70, 50 + Math.abs(weightedSum) * 30);
        confSource = "weighted-sum";
      }
      
      // ===== PHASE 3: Apply momentum confidence reduction =====
      if (momentumConfidenceReduction > 0) {
        derivedConf = Math.max(40, derivedConf - momentumConfidenceReduction);
        reasons.push(`MOMENTUM CONFIDENCE PENALTY: -${momentumConfidenceReduction}% (${momentumImpact})`);
      }
      
      reasons.push(`WEIGHTED DIRECTION: Sum=${weightedSum.toFixed(2)} (base=${baseWeightedSum.toFixed(2)}, momAdj=${momentumAdjustment >= 0 ? '+' : ''}${momentumAdjustment.toFixed(2)}, threshold=${effectiveThreshold.toFixed(2)})`);
      reasons.push(`TF values: 4h=${val4h.toFixed(2)}*${w4h.toFixed(2)}, 1h=${val1h.toFixed(2)}*${w1h.toFixed(2)}, 30m=${val30m.toFixed(2)}*${w30m.toFixed(2)}`);
      reasons.push(`Confidence source: ${confSource}`);
      
      // Apply momentum position multiplier on top of other reductions
      let posMult = weightReallocated ? 0.70 : 0.75;
      if (momentumPositionMultiplier < 1.0) {
        posMult = Math.min(posMult, momentumPositionMultiplier);
        reasons.push(`MOMENTUM POSITION REDUCTION: ${(momentumPositionMultiplier * 100).toFixed(0)}%`);
      }
      
      return { 
        direction, 
        confidence: derivedConf, 
        source: "weighted-derivation", 
        reasons,
        isWeightedDerivation: true,
        hasPersistenceBonus: persistenceBonus > 0,
        positionSizeMultiplier: posMult,
        is4hWeak,
        regime,
        momentumImpact,
        momentumScore,
        graduatedMomentumEffect: {
          directionFlipped,
          directionNullified,
          baseDirection,
          adjustedDirection,
          baseWeightedSum,
          adjustedWeightedSum: weightedSum,
          penaltyApplied: momentumAdjustment,
        },
        directionContext: createDirectionContext(direction, {
          evidenceType: 'WEIGHTED_SUM',
          tier: 0,
          tierSource: 'TIER_0_WEIGHTED_HTF_CONSENSUS',
          confidence: derivedConf,
          positionMultiplier: posMult,
          isCounterTrend: momentumImpact === 'strong_opposing' || momentumImpact === 'weak_opposing',
          riskClass: momentumImpact === 'strong_opposing' ? 'HIGH' : (momentumImpact === 'weak_opposing' ? 'MEDIUM' : 'LOW'),
          evidenceStrength: momentumImpact === 'aligned' ? 'VERY_STRONG' : (momentumImpact === 'neutral' ? 'STRONG' : 'WEAK'),
        }),
      };
    }
    
    // ============= ORDER FLOW TIEBREAKER (PHASE 2 FIX: CONTEXTUALIZED) =============
    // When weighted sum is marginal (0.35-0.54), use order flow if strong
    // PHASE 2 GAP 1: Now requires 30m trend alignment to prevent noise injection
    if (Math.abs(weightedSum) >= 0.35 && Math.abs(weightedSum) < effectiveThreshold && orderFlowData) {
      const ofScore = orderFlowData.score;
      const ofSignal = orderFlowData.signal?.toLowerCase() || "";
      
      if (ofScore >= P.ORDER_FLOW_MIN_SCORE && (ofSignal === "strong_buy" || ofSignal === "strong_sell")) {
        const direction: TradeDirection = ofSignal === "strong_buy" ? "long" : "short";
        
        // Verify order flow agrees with weighted direction tendency
        const weightedDirection = weightedSum > 0 ? "long" : "short";
        
        // ===== PHASE 2 GAP 1: 30M TREND ALIGNMENT CHECK =====
        // Order flow must not conflict with 30m trend to prevent noise injection
        let trend30mAligns = true;
        let alignmentBonus = 0;
        let alignmentStatus: "blocked" | "neutral" | "full" = "neutral";
        
        if (P.REQUIRE_30M_ALIGNMENT) {
          // For LONG: 30m must NOT be bearish
          // For SHORT: 30m must NOT be bullish
          if (direction === "long" && trend30m === "bearish") {
            trend30mAligns = false;
            alignmentStatus = "blocked";
            reasons.push(`ORDER FLOW TIEBREAKER BLOCKED: 30m bearish conflicts with LONG order flow`);
            
            // ===== ANALYTICS LOG: 30M ALIGNMENT BLOCKED =====
            console.log(`📊 [30M_ALIGNMENT_ANALYTICS] BLOCKED | dir=${direction} | 30m=${trend30m} | OF=${ofScore} ${ofSignal} | weightedSum=${weightedSum.toFixed(2)}`);
            
          } else if (direction === "short" && trend30m === "bullish") {
            trend30mAligns = false;
            alignmentStatus = "blocked";
            reasons.push(`ORDER FLOW TIEBREAKER BLOCKED: 30m bullish conflicts with SHORT order flow`);
            
            // ===== ANALYTICS LOG: 30M ALIGNMENT BLOCKED =====
            console.log(`📊 [30M_ALIGNMENT_ANALYTICS] BLOCKED | dir=${direction} | 30m=${trend30m} | OF=${ofScore} ${ofSignal} | weightedSum=${weightedSum.toFixed(2)}`);
            
          } else if (
            (direction === "long" && trend30m === "bullish") ||
            (direction === "short" && trend30m === "bearish")
          ) {
            // Full alignment - add bonus
            alignmentBonus = P.ORDER_FLOW_30M_BONUS || 0.05;
            alignmentStatus = "full";
          }
        }
        
        if (direction === weightedDirection && trend30mAligns) {
          const derivedConf = Math.min(70, 50 + ofScore * 0.2 + (alignmentBonus * 100));
          reasons.push(`ORDER FLOW TIEBREAKER: weightedSum=${weightedSum.toFixed(2)} marginal, orderFlow=${ofScore} ${ofSignal}`);
          reasons.push(`Order flow confirms weighted direction, 30m=${trend30m} (aligned=${trend30mAligns})`);
          if (alignmentBonus > 0) {
            reasons.push(`30m fully aligned → +${(alignmentBonus * 100).toFixed(0)}% confidence bonus`);
          }
          
          // ===== ANALYTICS LOG: 30M ALIGNMENT ALLOWED =====
          console.log(`📊 [30M_ALIGNMENT_ANALYTICS] ALLOWED | dir=${direction} | 30m=${trend30m} | status=${alignmentStatus} | bonus=${(alignmentBonus * 100).toFixed(0)}% | OF=${ofScore} ${ofSignal} | conf=${derivedConf.toFixed(0)}%`);
          
          return {
            direction,
            confidence: derivedConf,
            source: "order-flow-tiebreaker",
            reasons,
            isWeightedDerivation: true,
            orderFlowTiebreaker: true,
            positionSizeMultiplier: P.ORDER_FLOW_POSITION_MULTIPLIER,
            trend30mAligned: trend30mAligns,
            alignmentStatus,
            regime,
            directionContext: createDirectionContext(direction, {
              evidenceType: 'ORDER_FLOW',
              tier: 0.5,
              tierSource: 'TIER_0.5_ORDER_FLOW_TIEBREAKER',
              confidence: derivedConf,
              positionMultiplier: P.ORDER_FLOW_POSITION_MULTIPLIER,
              isCounterTrend: false,
              riskClass: 'MEDIUM',
              evidenceStrength: alignmentStatus === 'full' ? 'STRONG' : 'MODERATE',
            }),
          };
        }
      }
    }
  }
  
  // ============= PRIORITY 0.25: EXHAUSTION REVERSAL OVERRIDE =============
  // When market is at extreme exhaustion (deep oversold/overbought), override direction
  // This captures bounce setups that lagging trend labels miss
  // TIGHTENED: Now requires regime ∈ {EXHAUSTION, RANGE} AND HTF weakening (conf4h < 60% AND conf1h < 55%)
  // EXCEPTION: Absolute extreme StochRSI (K >= 98 or K <= 2) can bypass regime gate in EARLY_TREND
  if (EXHAUSTION_REVERSAL_OVERRIDE_PARAMS.ENABLED) {
    const ER = EXHAUSTION_REVERSAL_OVERRIDE_PARAMS;
    
    // Get 4h StochRSI K value early for absolute extreme check
    const stochK4hEarly = trendData.stochasticRsi?.['4h']?.k ?? 
                     trendData.timeframes?.['4h']?.indicators?.stochRsi?.k ?? 50;
    const adxValueEarly = trendData.volatility?.adx ?? trendData.momentum?.adx ?? 25;
    const momentumSlopeEarly = trendData.smartMomentum?.components?.macdSlope ?? 
                               trendData.momentum?.macdSlope ?? 0;
    
    // ===== ABSOLUTE EXTREME STOCHRSI BYPASS (K >= 98 or K <= 2) =====
    // True statistical exhaustion - allow in EARLY_TREND with basic conditions
    const isAbsoluteOverbought = stochK4hEarly >= (ER.ABSOLUTE_EXTREME_K_HIGH ?? 98);
    const isAbsoluteOversold = stochK4hEarly <= (ER.ABSOLUTE_EXTREME_K_LOW ?? 2);
    const isAbsoluteExtreme = isAbsoluteOverbought || isAbsoluteOversold;
    const adxAllowsAbsoluteExtreme = adxValueEarly < (ER.ABSOLUTE_EXTREME_MAX_ADX ?? 22);
    const slopeAllowsAbsoluteExtreme = Math.abs(momentumSlopeEarly) < (ER.ABSOLUTE_EXTREME_MAX_SLOPE ?? 0.15);
    
    const absoluteExtremeBypass = (ER.ABSOLUTE_EXTREME_ENABLED ?? true) && 
                                   isAbsoluteExtreme && 
                                   adxAllowsAbsoluteExtreme && 
                                   slopeAllowsAbsoluteExtreme &&
                                   regime === 'EARLY_TREND';
    
    // ===== NEW: CONTEXTUAL EXHAUSTION BYPASS (K 95-97 or K 3-5) =====
    // Not absolute exhaustion, but extreme extension requiring momentum deceleration evidence
    // Three zones: 90-95 (overbought bias only), 95-97 (contextual exhaustion), 98+ (absolute)
    const contextualExtremeEnabled = (ER as any).CONTEXTUAL_EXTREME_ENABLED ?? true;
    const contextualExtremeKHigh = (ER as any).CONTEXTUAL_EXTREME_K_HIGH ?? 95;
    const contextualExtremeKLow = (ER as any).CONTEXTUAL_EXTREME_K_LOW ?? 5;
    const contextualExtremeMaxAdx = (ER as any).CONTEXTUAL_EXTREME_MAX_ADX ?? 22;
    const contextualExtremeMaxSlope = (ER as any).CONTEXTUAL_EXTREME_MAX_SLOPE ?? 0.10;
    const contextualExtremeRequireDecel = (ER as any).CONTEXTUAL_EXTREME_REQUIRE_DECEL ?? true;
    
    // Check contextual extreme conditions
    const isContextualOverbought = stochK4hEarly >= contextualExtremeKHigh && !isAbsoluteOverbought;
    const isContextualOversold = stochK4hEarly <= contextualExtremeKLow && !isAbsoluteOversold;
    const isContextualExtreme = isContextualOverbought || isContextualOversold;
    const adxAllowsContextualExtreme = adxValueEarly < contextualExtremeMaxAdx;
    
    // Stricter slope requirement for contextual: must be flattening (low absolute value)
    const slopeIsFlattening = Math.abs(momentumSlopeEarly) < contextualExtremeMaxSlope;
    
    // Additional deceleration evidence: ADX slope declining or flat, or momentum score weakening
    const adxSlope = trendData.volatility?.adxSlope ?? trendData.momentum?.adxSlope ?? 0;
    const momentumDecelerating = adxSlope <= 0 || momentumSlopeEarly <= 0;
    const decelRequirementMet = !contextualExtremeRequireDecel || momentumDecelerating;
    
    const contextualExtremeBypass = contextualExtremeEnabled &&
                                     isContextualExtreme &&
                                     adxAllowsContextualExtreme &&
                                     slopeIsFlattening &&
                                     decelRequirementMet &&
                                     regime === 'EARLY_TREND';
    
    // ===== TIER 0.25 TIGHTENING: REGIME GATE =====
    // Only allow exhaustion reversal in EXHAUSTION or RANGE regimes
    // EXCEPTION: Absolute or Contextual extreme can bypass in EARLY_TREND
    const regimeAllowsExhaustionReversal = regime === 'EXHAUSTION' || regime === 'RANGE';
    
    // ===== TIER 0.25 TIGHTENING: HTF WEAKENING GATE =====
    // Require evidence of higher-timeframe trend weakening before proposing reversal
    // conf4h < 60% AND conf1h < 55%
    const TIER025_HTF_WEAKENING_4H = 60;  // 4h confidence must be below this
    const TIER025_HTF_WEAKENING_1H = 55;  // 1h confidence must be below this
    const htfIsWeakening = conf4h < TIER025_HTF_WEAKENING_4H && conf1h < TIER025_HTF_WEAKENING_1H;
    
    // Combined gate: (regime AND HTF weakening) OR absolute extreme bypass OR contextual extreme bypass
    const tier025GatePasses = (regimeAllowsExhaustionReversal && htfIsWeakening) || 
                               absoluteExtremeBypass || 
                               contextualExtremeBypass;
    
    // Track which bypass path is being used for position sizing
    const usingAbsoluteBypass = absoluteExtremeBypass;
    const usingContextualBypass = contextualExtremeBypass && !absoluteExtremeBypass;
    
    if (!tier025GatePasses) {
      // Log skip reason for debugging
      if (!regimeAllowsExhaustionReversal && !absoluteExtremeBypass && !contextualExtremeBypass) {
        if (isAbsoluteExtreme) {
          // Explain why absolute extreme bypass didn't work
          const bypassBlockReasons: string[] = [];
          if (!adxAllowsAbsoluteExtreme) bypassBlockReasons.push(`ADX=${adxValueEarly.toFixed(1)} >= ${ER.ABSOLUTE_EXTREME_MAX_ADX ?? 22}`);
          if (!slopeAllowsAbsoluteExtreme) bypassBlockReasons.push(`slope=${Math.abs(momentumSlopeEarly).toFixed(2)} >= ${ER.ABSOLUTE_EXTREME_MAX_SLOPE ?? 0.15}`);
          reasons.push(`TIER 0.25 BLOCKED: regime=${regime}, absolute extreme bypass failed (${bypassBlockReasons.join(', ')})`);
        } else if (isContextualExtreme) {
          // Explain why contextual extreme bypass didn't work
          const bypassBlockReasons: string[] = [];
          if (!adxAllowsContextualExtreme) bypassBlockReasons.push(`ADX=${adxValueEarly.toFixed(1)} >= ${contextualExtremeMaxAdx}`);
          if (!slopeIsFlattening) bypassBlockReasons.push(`slope=${Math.abs(momentumSlopeEarly).toFixed(2)} >= ${contextualExtremeMaxSlope}`);
          if (!decelRequirementMet) bypassBlockReasons.push(`momentum not decelerating (adxSlope=${adxSlope.toFixed(2)})`);
          reasons.push(`TIER 0.25 BLOCKED: regime=${regime}, contextual extreme K=${stochK4hEarly.toFixed(0)} bypass failed (${bypassBlockReasons.join(', ')})`);
        } else {
          reasons.push(`TIER 0.25 BLOCKED: regime=${regime} ∉ {EXHAUSTION, RANGE} - exhaustion reversal requires weak regime or K >= ${contextualExtremeKHigh}/${contextualExtremeKLow} with deceleration`);
        }
      } else if (!htfIsWeakening && !absoluteExtremeBypass && !contextualExtremeBypass) {
        reasons.push(`TIER 0.25 BLOCKED: HTF not weakening (4h=${conf4h.toFixed(0)}% >= ${TIER025_HTF_WEAKENING_4H} OR 1h=${conf1h.toFixed(0)}% >= ${TIER025_HTF_WEAKENING_1H})`);
      }
    }
    
    // Log bypass activation
    if (usingAbsoluteBypass) {
      reasons.push(`TIER 0.25 ABSOLUTE EXTREME BYPASS: K=${stochK4hEarly.toFixed(0)} (${isAbsoluteOverbought ? 'overbought' : 'oversold'}), ADX=${adxValueEarly.toFixed(1)}, slope=${momentumSlopeEarly.toFixed(2)} in ${regime}`);
    } else if (usingContextualBypass) {
      reasons.push(`TIER 0.25 CONTEXTUAL EXHAUSTION BYPASS: K=${stochK4hEarly.toFixed(0)} (${isContextualOverbought ? 'extreme overbought' : 'extreme oversold'}), ADX=${adxValueEarly.toFixed(1)}, slope=${momentumSlopeEarly.toFixed(2)}, adxSlope=${adxSlope.toFixed(2)} in ${regime}`);
    }
    
    if (tier025GatePasses) {
      // Position size modifier based on bypass type (more conservative for contextual)
      const absoluteExtremePositionMult = ER.ABSOLUTE_EXTREME_POSITION_MULT ?? 0.30;
      const contextualExtremePositionMult = (ER as any).CONTEXTUAL_EXTREME_POSITION_MULT ?? 0.25;
      // Get 4h StochRSI K value
      const stochK4h = trendData.stochasticRsi?.['4h']?.k ?? 
                       trendData.timeframes?.['4h']?.indicators?.stochRsi?.k ?? 50;
      
      // Get Bollinger %B (4h preferred, fall back to 1h)
      const percentB4h = trendData.bollingerBands?.['4h']?.percentB ?? 50;
      const percentB1h = trendData.bollingerBands?.['1h']?.percentB ?? 50;
      const percentB = percentB4h !== 50 ? percentB4h : percentB1h;
      
      // Get momentum data
      const momentumScore = trendData.smartMomentum?.score ?? trendData.momentum?.score ?? 0;
      const momentumSlope = trendData.smartMomentum?.components?.macdSlope ?? 
                            trendData.momentum?.macdSlope ?? 0;
      const macdHist = trendData.momentum?.macdHistogram ?? 0;
      const prevMacdHist = trendData.momentum?.prevMacdHistogram ?? macdHist;
      const macdImproving = macdHist > prevMacdHist;
      const macdDeclining = macdHist < prevMacdHist;
      
      // Get ADX slope for acceleration check
      const erAdxSlope = trendData.volatility?.adxSlope ?? trendData.momentum?.adxSlope ?? 0;
      
      // Get volume/expansion data
      const volumeRatio = trendData.volume?.ratio ?? trendData.volatility?.volumeRatio ?? 1.0;
      const squeezeJustReleased = trendData.squeeze?.justReleased ?? false;
      const isExpansion = (volumeRatio > ER.MAX_VOLUME_RATIO) || 
                          (ER.BLOCK_ON_SQUEEZE_RELEASE && squeezeJustReleased);
      
      // Get order flow data
      const ofScore = orderFlowData?.score ?? 0;
      const ofSignal = orderFlowData?.signal?.toLowerCase() ?? "";
      const ofBullish = ofSignal.includes("buy") || ofSignal === "bullish";
      const ofBearish = ofSignal.includes("sell") || ofSignal === "bearish";
      
      // Get ADX value for high ADX + declining check
      const adxValue = trendData.volatility?.adx ?? trendData.momentum?.adx ?? 25;
      
      // ===== CHECK FOR LONG EXHAUSTION REVERSAL =====
      // Path 1: Deep oversold (StochRSI K <= 10 AND %B <= 20)
      // Path 2: High ADX declining (ADX > 45 AND slope < 0)
      const isDeepOversold = stochK4h <= ER.LONG_K_THRESHOLD;
      const belowLowerBand = percentB <= ER.LONG_PERCENT_B_THRESHOLD;
      const isHighAdxDeclining = ER.ADX_HIGH_EXHAUSTION_ENABLED && 
                                 adxValue > ER.ADX_HIGH_THRESHOLD && 
                                 erAdxSlope < ER.ADX_DECLINING_SLOPE;
      
      // Momentum confirmation: score > 20 OR MACD improving
      const momentumConfirmsLong = momentumScore > ER.MIN_MOMENTUM_SCORE || 
                                   (ER.MACD_IMPROVING_COUNTS && macdImproving);
      const adxNotAccelerating = erAdxSlope <= ER.MAX_ADX_SLOPE;
      
      // Exhaustion detected via EITHER path (deep oversold OR high ADX declining)
      const exhaustionDetectedLong = (isDeepOversold && belowLowerBand) || isHighAdxDeclining;
      
      if (exhaustionDetectedLong && !isExpansion && adxNotAccelerating) {
      // Check if momentum confirms (or we don't require it)
      if (!ER.REQUIRE_MOMENTUM_CONFIRMATION || momentumConfirmsLong) {
        // Calculate confidence and position size
        // Apply contextual/absolute bypass multiplier caps for early-trend entries
        let erConfidence: number = ER.BASE_CONFIDENCE;
        let positionMult: number = ER.BASE_POSITION_MULTIPLIER;
        
        // Cap position size for early-trend bypass entries (more conservative)
        if (usingContextualBypass) {
          positionMult = Math.min(positionMult, contextualExtremePositionMult);
        } else if (usingAbsoluteBypass) {
          positionMult = Math.min(positionMult, absoluteExtremePositionMult);
        }
        const erReasons: string[] = [];
        
        // Determine which exhaustion path triggered
        const exhaustionPath = isHighAdxDeclining ? 
          `ADX_HIGH_DECLINING(${adxValue.toFixed(0)}, slope=${erAdxSlope.toFixed(2)})` :
          `DEEP_OVERSOLD(K=${stochK4h.toFixed(1)}, %B=${percentB.toFixed(1)})`;
        erReasons.push(exhaustionPath);
        
        if (momentumScore > ER.MIN_MOMENTUM_SCORE) {
          erConfidence += ER.MOMENTUM_CONFIRMS_BONUS;
          positionMult = ER.MOMENTUM_CONFIRMED_MULTIPLIER;
          erReasons.push(`momentum_strong(${momentumScore.toFixed(0)}>${ER.MIN_MOMENTUM_SCORE})`);
        }
        if (ofBullish && ofScore >= ER.MIN_ORDER_FLOW_SCORE) {
          erConfidence += ER.ORDER_FLOW_ALIGNED_BONUS;
          positionMult = Math.max(positionMult, ER.STRONG_SETUP_MULTIPLIER);
          erReasons.push(`orderFlow_bullish(${ofScore.toFixed(0)}>=${ER.MIN_ORDER_FLOW_SCORE})`);
        }
        if (macdImproving) {
          erConfidence += ER.MACD_IMPROVING_BONUS;
          erReasons.push("macd_improving");
        }
        
        erConfidence = Math.min(erConfidence, ER.MAX_CONFIDENCE);
        
        reasons.push(`EXHAUSTION REVERSAL OVERRIDE → LONG`);
        reasons.push(`Exhaustion Path: ${exhaustionPath}`);
        if (isDeepOversold && belowLowerBand) {
          reasons.push(`StochRSI 4h K=${stochK4h.toFixed(1)} <= ${ER.LONG_K_THRESHOLD} (deep oversold)`);
          reasons.push(`Bollinger %B=${percentB.toFixed(1)} <= ${ER.LONG_PERCENT_B_THRESHOLD} (below lower band)`);
        }
        if (isHighAdxDeclining) {
          reasons.push(`ADX=${adxValue.toFixed(0)} > ${ER.ADX_HIGH_THRESHOLD} with slope=${erAdxSlope.toFixed(2)} < 0 (high ADX declining)`);
        }
        reasons.push(`Confirmations: ${erReasons.join(", ")}`);
        reasons.push(`Conf=${erConfidence.toFixed(0)}% | Pos=${(positionMult * 100).toFixed(0)}%`);
        
        return {
          direction: "long",
          confidence: erConfidence,
          source: "exhaustion-reversal",
          reasons,
          positionSizeMultiplier: positionMult,
          isExhaustionReversal: true,
          regime,
          directionContext: createDirectionContext("long", {
            evidenceType: 'EXHAUSTION',
            tier: 0.25,
            tierSource: 'TIER_0.25_EXHAUSTION_REVERSAL_LONG',
            confidence: erConfidence,
            positionMultiplier: positionMult,
            isCounterTrend: true,
            riskClass: 'HIGH',
            evidenceStrength: erConfidence >= 70 ? 'STRONG' : 'MODERATE',
          }),
        };
      } else {
        if (ER.LOG_SKIPS) {
          reasons.push(`EXHAUSTION LONG SKIPPED: exhaustion detected but momentum not confirming (score=${momentumScore.toFixed(0)} <= ${ER.MIN_MOMENTUM_SCORE}, macdImproving=${macdImproving})`);
        }
      }
    }
    
      // ===== CHECK FOR SHORT EXHAUSTION REVERSAL =====
      // Path 1: Deep overbought (StochRSI K >= 90 AND %B >= 80)
      // Path 2: High ADX declining (ADX > 45 AND slope < 0) - same for SHORT
      const isDeepOverbought = stochK4h >= ER.SHORT_K_THRESHOLD;
      const aboveUpperBand = percentB >= ER.SHORT_PERCENT_B_THRESHOLD;
      
      // For SHORT, high ADX declining also applies (trend exhausting regardless of direction)
      const isHighAdxDecliningShort = ER.ADX_HIGH_EXHAUSTION_ENABLED && 
                                      adxValue > ER.ADX_HIGH_THRESHOLD && 
                                      erAdxSlope < ER.ADX_DECLINING_SLOPE;
      
      // Momentum confirmation: score < -20 OR MACD declining
      const momentumConfirmsShort = momentumScore < -ER.MIN_MOMENTUM_SCORE || 
                                    (ER.MACD_IMPROVING_COUNTS && macdDeclining);
      
      // Additional SHORT protection: block if 4h is strongly bullish
      const is4hStrongBullish = trend4h === "bullish" && conf4h >= ER.SHORT_BLOCK_IF_4H_BULLISH_CONF;
      
      // Exhaustion detected via EITHER path
      const exhaustionDetectedShort = (isDeepOverbought && aboveUpperBand) || isHighAdxDecliningShort;
      
      if (exhaustionDetectedShort && !isExpansion && adxNotAccelerating && !is4hStrongBullish) {
        if (!ER.REQUIRE_MOMENTUM_CONFIRMATION || momentumConfirmsShort) {
          // Calculate confidence and position size
          // Apply contextual/absolute bypass multiplier caps for early-trend entries
          let erConfidence: number = ER.BASE_CONFIDENCE;
          let positionMult: number = ER.BASE_POSITION_MULTIPLIER;
          
          // Cap position size for early-trend bypass entries (more conservative)
          if (usingContextualBypass) {
            positionMult = Math.min(positionMult, contextualExtremePositionMult);
          } else if (usingAbsoluteBypass) {
            positionMult = Math.min(positionMult, absoluteExtremePositionMult);
          }
          const erReasons: string[] = [];
          
          // Determine which exhaustion path triggered
          const exhaustionPath = isHighAdxDecliningShort ? 
            `ADX_HIGH_DECLINING(${adxValue.toFixed(0)}, slope=${erAdxSlope.toFixed(2)})` :
            `DEEP_OVERBOUGHT(K=${stochK4h.toFixed(1)}, %B=${percentB.toFixed(1)})`;
          erReasons.push(exhaustionPath);
          
          if (momentumScore < -ER.MIN_MOMENTUM_SCORE) {
            erConfidence += ER.MOMENTUM_CONFIRMS_BONUS;
            positionMult = ER.MOMENTUM_CONFIRMED_MULTIPLIER;
            erReasons.push(`momentum_strong(${momentumScore.toFixed(0)}<-${ER.MIN_MOMENTUM_SCORE})`);
          }
          if (ofBearish && ofScore >= ER.MIN_ORDER_FLOW_SCORE) {
            erConfidence += ER.ORDER_FLOW_ALIGNED_BONUS;
            positionMult = Math.max(positionMult, ER.STRONG_SETUP_MULTIPLIER);
            erReasons.push(`orderFlow_bearish(${ofScore.toFixed(0)}>=${ER.MIN_ORDER_FLOW_SCORE})`);
          }
          if (macdDeclining) {
            erConfidence += ER.MACD_IMPROVING_BONUS;
            erReasons.push("macd_declining");
          }
          
          erConfidence = Math.min(erConfidence, ER.MAX_CONFIDENCE);
          
          reasons.push(`EXHAUSTION REVERSAL OVERRIDE → SHORT`);
          reasons.push(`Exhaustion Path: ${exhaustionPath}`);
          if (isDeepOverbought && aboveUpperBand) {
            reasons.push(`StochRSI 4h K=${stochK4h.toFixed(1)} >= ${ER.SHORT_K_THRESHOLD} (deep overbought)`);
            reasons.push(`Bollinger %B=${percentB.toFixed(1)} >= ${ER.SHORT_PERCENT_B_THRESHOLD} (above upper band)`);
          }
          if (isHighAdxDecliningShort) {
            reasons.push(`ADX=${adxValue.toFixed(0)} > ${ER.ADX_HIGH_THRESHOLD} with slope=${erAdxSlope.toFixed(2)} < 0 (high ADX declining)`);
          }
          reasons.push(`4h trend: ${trend4h} (${conf4h.toFixed(0)}%) - not blocking`);
          reasons.push(`Confirmations: ${erReasons.join(", ")}`);
          reasons.push(`Conf=${erConfidence.toFixed(0)}% | Pos=${(positionMult * 100).toFixed(0)}%`);
          
          return {
            direction: "short",
            confidence: erConfidence,
            source: "exhaustion-reversal",
            reasons,
            positionSizeMultiplier: positionMult,
            isExhaustionReversal: true,
            regime,
            directionContext: createDirectionContext("short", {
              evidenceType: 'EXHAUSTION',
              tier: 0.25,
              tierSource: 'TIER_0.25_EXHAUSTION_REVERSAL_SHORT',
              confidence: erConfidence,
              positionMultiplier: positionMult,
              isCounterTrend: true,
              riskClass: 'HIGH',
              evidenceStrength: erConfidence >= 70 ? 'STRONG' : 'MODERATE',
            }),
          };
        } else {
          if (ER.LOG_SKIPS) {
            reasons.push(`EXHAUSTION SHORT SKIPPED: exhaustion detected but momentum not confirming (score=${momentumScore.toFixed(0)} >= -${ER.MIN_MOMENTUM_SCORE}, macdDeclining=${macdDeclining})`);
          }
        }
      }
    } // End tier025GatePasses if block
  }
  
  // ============= PRIORITY 0.5: MOMENTUM-AWARE DIRECTION OVERRIDE (WEIGHTED) =============
  // PHASE 2: Converted from 5-factor AND gate to weighted scoring system
  // This mirrors human decision-making which uses 2-3 factors, not all 5
  // FIX #5 (Audit): Track if Tier 0.5 evaluated to block Tier 10 from using same evidence
  let tier05Evaluated = false;  // True if Tier 0.5 logic ran (regardless of outcome)
  let tier05Blocked = false;    // True if Tier 0.5 would have fired but was blocked (e.g., 30m ADX)
  let tier05Score = 0;          // Score from Tier 0.5 for transparency
  
  if (MOMENTUM_OVERRIDE_DIRECTION_PARAMS.ENABLED && regimeConfig.momentumOverrideEnabled) {
    const MO = MOMENTUM_OVERRIDE_DIRECTION_PARAMS;
    const T2 = TIER2_WEIGHTED_CONFIRMATION;
    
    // Get momentum data
    const momentumScore = trendData.smartMomentum?.score ?? trendData.momentum?.score ?? 0;
    const momentumSlope = trendData.smartMomentum?.components?.macdSlope ?? trendData.momentum?.macdSlope ?? 0;
    const stochK = trendData.stochRsi?.k ?? trendData.stochRsi1h?.k ?? trendData.stochasticRsi?.['1h']?.k ?? 50;
    
    // Get 30m ADX data for blocking condition
    const adx30m = timeframes['30m']?.adx ?? trendData.volatility?.adx ?? 0;
    
    // Get order flow data
    const ofScore = orderFlowData?.score ?? 0;
    const ofSignal = orderFlowData?.signal?.toLowerCase() ?? "";
    const orderFlowBullish = ofSignal.includes("buy") || ofSignal === "bullish" || ofSignal === "strong_buy";
    const orderFlowBearish = ofSignal.includes("sell") || ofSignal === "bearish" || ofSignal === "strong_sell";
    
    // Determine direction based on momentum
    const attemptLong = momentumScore > 0;
    const absMomentum = Math.abs(momentumScore);
    
    // Blocking condition: strong established 30m trend that we shouldn't fight
    const has30mStrongTrend = adx30m > MO.BLOCK_IF_30M_ADX_ABOVE && adxSlope > MO.BLOCK_IF_ADX_SLOPE_ABOVE;
    const block30mBearish = has30mStrongTrend && trend30m === "bearish";
    const block30mBullish = has30mStrongTrend && trend30m === "bullish";
    const blocked = attemptLong ? block30mBearish : block30mBullish;
    
    if (!blocked && absMomentum > 0) {
      tier05Evaluated = true;  // FIX #5: Mark that Tier 0.5 logic ran
      
      // ============= PHASE 2: WEIGHTED TIER 2 SCORING =============
      let tier2Score = 0;
      const tier2Reasons: string[] = [];
      
      // Point 1-2: Momentum strength
      if (absMomentum >= MO.STRONG_MOMENTUM_SCORE) {
        tier2Score += T2.MOMENTUM_STRONG_POINTS;
        tier2Reasons.push(`momentum_strong(${absMomentum.toFixed(0)})+${T2.MOMENTUM_STRONG_POINTS}`);
      } else if (absMomentum >= MO.MIN_MOMENTUM_SCORE) {
        tier2Score += T2.MOMENTUM_WEAK_POINTS;
        tier2Reasons.push(`momentum_weak(${absMomentum.toFixed(0)})+${T2.MOMENTUM_WEAK_POINTS}`);
      }
      
      // Point 3-4: Order flow alignment
      const orderFlowAligned = attemptLong ? orderFlowBullish : orderFlowBearish;
      if (orderFlowAligned && ofScore >= MO.MIN_ORDER_FLOW_SCORE) {
        tier2Score += T2.ORDER_FLOW_ALIGNED_POINTS;
        tier2Reasons.push(`orderFlow(${ofScore.toFixed(0)})+${T2.ORDER_FLOW_ALIGNED_POINTS}`);
      }
      
      // Point 5: StochRSI extreme (REGIME-GATED)
      // PHASE 3: In trending regimes, StochRSI is a BONUS not a requirement
      const stochExtremeLong = stochK <= MO.STOCHRSI_OVERSOLD_THRESHOLD;
      const stochExtremeShort = stochK >= MO.STOCHRSI_OVERBOUGHT_THRESHOLD;
      const stochExtreme = attemptLong ? stochExtremeLong : stochExtremeShort;
      
      // Check if StochRSI is required in this regime
      const stochRequired = (MO.STOCHRSI_REQUIRED_IN_REGIME as readonly string[]).includes(regime);
      const stochIsBonus = suppressStochRSI || (MO.STOCHRSI_BONUS_IN_REGIME as readonly string[]).includes(regime);
      
      if (stochExtreme) {
        tier2Score += T2.STOCH_EXTREME_POINTS;
        tier2Reasons.push(`stochExtreme(${stochK.toFixed(0)})+${T2.STOCH_EXTREME_POINTS}`);
      }
      
      // Point 6: Momentum slope positive
      const slopePositive = attemptLong ? momentumSlope > MO.MIN_MOMENTUM_SLOPE : momentumSlope < -MO.MIN_MOMENTUM_SLOPE;
      if (slopePositive) {
        tier2Score += T2.SLOPE_POSITIVE_POINTS;
        tier2Reasons.push(`slope(${momentumSlope.toFixed(2)})+${T2.SLOPE_POSITIVE_POINTS}`);
      }
      
      // Point 7: HTF alignment bonus
      const htfAligned = (attemptLong && trend4h === "bullish" && conf4h >= 50) ||
                         (!attemptLong && trend4h === "bearish" && conf4h >= 50);
      if (htfAligned) {
        tier2Score += T2.HTF_ALIGNED_POINTS;
        tier2Reasons.push(`htf(${trend4h})+${T2.HTF_ALIGNED_POINTS}`);
      }
      
      // FIX #5: Store score for transparency
      tier05Score = tier2Score;
      
      // Get regime-specific minimum score
      const minScore = regime === 'RANGE' ? T2.RANGE_MIN_SCORE :
                       regime === 'STRONG_TREND' ? T2.STRONG_TREND_MIN_SCORE :
                       regime === 'EARLY_TREND' ? T2.EARLY_TREND_MIN_SCORE :
                       T2.NORMAL_MIN_SCORE;
      
      // Check if StochRSI is REQUIRED but not met (only in RANGE regime)
      const stochBlocking = stochRequired && !stochExtreme;
      
      // Evaluate if score meets threshold
      if (tier2Score >= minScore && !stochBlocking) {
        const direction: TradeDirection = attemptLong ? "long" : "short";
        
        // Calculate position multiplier based on score
        const positionMultiplier = tier2Score >= 7 ? T2.SCORE_7_POSITION_MULT :
                                   tier2Score >= 6 ? T2.SCORE_6_POSITION_MULT :
                                   tier2Score >= 5 ? T2.SCORE_5_POSITION_MULT :
                                   tier2Score >= 4 ? T2.SCORE_4_POSITION_MULT :
                                   T2.SCORE_3_POSITION_MULT;
        
        // Calculate confidence
        let confidence = T2.BASE_CONFIDENCE + (tier2Score * T2.CONFIDENCE_PER_POINT);
        // StochRSI bonus in non-required regimes
        if (stochIsBonus && stochExtreme) {
          confidence += MO.STOCHRSI_BONUS_CONFIDENCE;
        }
        confidence = Math.min(confidence, T2.MAX_CONFIDENCE);
        
        reasons.push(`WEIGHTED MOMENTUM OVERRIDE → ${direction.toUpperCase()}: Tier2 score=${tier2Score}/${minScore} (${regime})`);
        reasons.push(`Scoring: ${tier2Reasons.join(', ')}`);
        reasons.push(`StochRSI K=${stochK.toFixed(0)} (${stochIsBonus ? 'bonus' : 'required'} in ${regime})`);
        reasons.push(`Conf=${confidence.toFixed(0)}% | Pos=${(positionMultiplier * 100).toFixed(0)}%`);
        
        return {
          direction,
          confidence,
          source: "weighted-momentum-override",
          reasons,
          positionSizeMultiplier: positionMultiplier,
          isMomentumOverride: true,
          regime,
          tier2Score,
          directionContext: createDirectionContext(direction, {
            evidenceType: 'MOMENTUM',
            tier: 0.5,
            tierSource: 'TIER_0.5_WEIGHTED_MOMENTUM_OVERRIDE',
            confidence,
            positionMultiplier: positionMultiplier,
            isCounterTrend: false,
            riskClass: tier2Score >= 6 ? 'LOW' : 'MEDIUM',
            evidenceStrength: tier2Score >= 6 ? 'STRONG' : 'MODERATE',
          }),
        };
      } else {
        // Log why weighted override didn't trigger
        reasons.push(`WEIGHTED OVERRIDE SKIPPED: score=${tier2Score} < ${minScore} (${regime})${stochBlocking ? ' | StochRSI required but not extreme' : ''}`);
        reasons.push(`Factors: ${tier2Reasons.join(', ')}`);
      }
    } else if (blocked) {
      tier05Evaluated = true;   // FIX #5: Mark that Tier 0.5 logic ran (but was blocked)
      tier05Blocked = true;     // FIX #5: Mark as blocked by 30m ADX
      reasons.push(`MOMENTUM OVERRIDE BLOCKED: 30m ADX=${adx30m.toFixed(1)} > ${MO.BLOCK_IF_30M_ADX_ABOVE} with slope=${adxSlope.toFixed(2)} > 0`);
    }
  }
  
  // ============= PRIORITY 0: PRICE ACTION MOMENTUM OVERRIDE =============
  // If price has moved strongly (2%+) in a clear direction, use that direction
  // even when all timeframes show neutral. This catches continuation moves.
  // PHASE 1 FIX: But ONLY if it aligns with HTF trend OR HTF is neutral
  const priceActionMomentum = trendData.priceActionMomentum;
  if (priceActionMomentum?.canOverrideNeutralAlignment && priceActionMomentum?.hasStrongMove) {
    const priceDirection = priceActionMomentum.direction;
    const movePercent = Math.abs(priceActionMomentum.movePercent || 0);
    
    // Only override if direction is clear (not neutral)
    if (priceDirection === "bullish" || priceDirection === "bearish") {
      const direction: TradeDirection = priceDirection === "bullish" ? "long" : "short";
      const isStrongMove = priceActionMomentum.isStrongMove;
      
      // ===== NEW: CHECK HTF ALIGNMENT BEFORE DERIVING DIRECTION =====
      // A bounce against a strong HTF trend is NOT momentum - it's a pullback
      const htf4h = trendData.timeframes?.['4h'];
      const htfTrend4h = htf4h?.trend || "neutral";
      const htfConf4h = htf4h?.confidence ?? 50;
      const isHtfDirectional = htfTrend4h !== "neutral" && htfConf4h >= 60;
      
      if (isHtfDirectional && PRICE_ACTION_PULLBACK_PARAMS.ENABLED) {
        const htfAligned = (htfTrend4h === "bullish" && priceDirection === "bullish") ||
                           (htfTrend4h === "bearish" && priceDirection === "bearish");
        
        if (!htfAligned) {
          // Price action is counter to HTF - this is a pullback, not momentum
          // Consider deriving HTF-aligned direction instead if pullback is moderate
          const isPullback = movePercent < PRICE_ACTION_PULLBACK_PARAMS.MAX_PULLBACK_PERCENT;
          
          if (isPullback && htfConf4h >= PRICE_ACTION_PULLBACK_PARAMS.MIN_HTF_CONFIDENCE) {
            // Derive trend-aligned direction from pullback
            const pullbackDirection: TradeDirection = htfTrend4h === "bullish" ? "long" : "short";
            const pullbackConf = Math.min(
              PRICE_ACTION_PULLBACK_PARAMS.MAX_CONFIDENCE,
              htfConf4h * PRICE_ACTION_PULLBACK_PARAMS.CONFIDENCE_MULTIPLIER
            );
            
            if (PRICE_ACTION_PULLBACK_PARAMS.LOG_ENTRIES) {
              reasons.push(`PRICE ACTION PULLBACK: ${movePercent.toFixed(2)}% bounce against ${htfTrend4h} 4h trend (${htfConf4h.toFixed(0)}% conf)`);
              reasons.push(`Deriving ${pullbackDirection.toUpperCase()} from HTF continuation after pullback`);
              reasons.push("Pullback entry - reduced position size for safety");
            }
            
            return { 
              direction: pullbackDirection, 
              confidence: pullbackConf, 
              source: "price-action-pullback", 
              reasons,
              positionSizeMultiplier: PRICE_ACTION_PULLBACK_PARAMS.POSITION_SIZE_MULTIPLIER,
              regime,
              directionContext: createDirectionContext(pullbackDirection, {
                evidenceType: 'PRICE_ACTION',
                tier: 1,
                tierSource: 'TIER_1_PRICE_ACTION_PULLBACK',
                confidence: pullbackConf,
                positionMultiplier: PRICE_ACTION_PULLBACK_PARAMS.POSITION_SIZE_MULTIPLIER,
                isCounterTrend: true,
                riskClass: 'MEDIUM',
                evidenceStrength: 'MODERATE',
              }),
            };
          } else {
            // Strong counter-trend move OR HTF confidence too low - skip price action override entirely
            reasons.push(`Skipping price action: ${movePercent.toFixed(2)}% move against ${htfTrend4h} 4h trend (${htfConf4h.toFixed(0)}% conf)`);
            reasons.push(`Move too strong or HTF confidence too low for pullback entry`);
            // Don't return - let normal direction derivation handle it
          }
        } else {
          // Price action aligns with HTF - proceed with normal override logic
          // Calculate confidence based on move strength and ADX
          const moveConf = isStrongMove ? 70 : 60;
          const adxBonus = Math.min(15, (adx - 20) * 1.5);  // Up to +15% for ADX > 30
          const finalConf = Math.min(85, moveConf + Math.max(0, adxBonus)) * 0.9;  // 10% reduction for safety
          
          reasons.push(`PRICE ACTION OVERRIDE: ${movePercent.toFixed(2)}% ${priceDirection} move (aligned with ${htfTrend4h} 4h)`);
          reasons.push(`ADX=${adx.toFixed(1)} confirms trend strength`);
          reasons.push("HTF-aligned price action - 75% position size");
          
          return { 
            direction, 
            confidence: finalConf, 
            source: "price-action-momentum-aligned", 
            reasons,
            positionSizeMultiplier: 0.75,
            regime,
            directionContext: createDirectionContext(direction, {
              evidenceType: 'PRICE_ACTION',
              tier: 1,
              tierSource: 'TIER_1_PRICE_ACTION_HTF_ALIGNED',
              confidence: finalConf,
              positionMultiplier: 0.75,
              isCounterTrend: false,
              riskClass: 'LOW',
              evidenceStrength: isStrongMove ? 'STRONG' : 'MODERATE',
            }),
          };
        }
      } else {
        // HTF is neutral - original behavior: use price action direction
        // Calculate confidence based on move strength and ADX
        const moveConf = isStrongMove ? 70 : 60;
        const adxBonus = Math.min(15, (adx - 20) * 1.5);  // Up to +15% for ADX > 30
        const finalConf = Math.min(85, moveConf + Math.max(0, adxBonus)) * 0.9;  // 10% reduction for safety
        
        reasons.push(`PRICE ACTION OVERRIDE: ${movePercent.toFixed(2)}% ${priceDirection} move`);
        reasons.push(`ADX=${adx.toFixed(1)} confirms trend strength`);
        reasons.push("All timeframes neutral but price action clear - 75% position size");
        
        return { 
          direction, 
          confidence: finalConf, 
          source: "price-action-momentum", 
          reasons,
          positionSizeMultiplier: 0.75,
          regime,
          directionContext: createDirectionContext(direction, {
            evidenceType: 'PRICE_ACTION',
            tier: 1,
            tierSource: 'TIER_1_PRICE_ACTION_MOMENTUM',
            confidence: finalConf,
            positionMultiplier: 0.75,
            isCounterTrend: false,
            riskClass: 'MEDIUM',
            evidenceStrength: isStrongMove ? 'STRONG' : 'MODERATE',
          }),
        };
      }
    }
  }
  
  // Priority 1: Use 4h trend if directional with decent confidence
  if (trend4h !== "neutral" && conf4h >= 55) {
    const direction: TradeDirection = trend4h === "bullish" ? "long" : "short";
    reasons.push(`4h trend ${trend4h} (${conf4h.toFixed(0)}% confidence)`);
    return { 
      direction, 
      confidence: conf4h, 
      source: "4h", 
      reasons,
      regime,
      directionContext: createDirectionContext(direction, {
        evidenceType: 'HTF_CONSENSUS',
        tier: 2,
        tierSource: 'TIER_2_4H_TREND',
        confidence: conf4h,
        positionMultiplier: 1.0,
        isCounterTrend: false,
        riskClass: 'LOW',
        evidenceStrength: conf4h >= 70 ? 'VERY_STRONG' : 'STRONG',
      }),
    };
  }
  
  // Priority 2: Use 1h trend if strong and directional
  if (trend1h !== "neutral" && conf1h >= 60) {
    const direction: TradeDirection = trend1h === "bullish" ? "long" : "short";
    reasons.push(`1h trend ${trend1h} (${conf1h.toFixed(0)}% confidence)`);
    
    // Warn if 4h is opposing
    const is4hOpposing = trend4h !== "neutral" && trend4h !== trend1h;
    if (is4hOpposing) {
      reasons.push(`Warning: 4h trend ${trend4h} opposes 1h`);
    }
    
    return { 
      direction, 
      confidence: conf1h, 
      source: "1h", 
      reasons,
      regime,
      directionContext: createDirectionContext(direction, {
        evidenceType: 'HTF_CONSENSUS',
        tier: 3,
        tierSource: 'TIER_3_1H_TREND',
        confidence: conf1h,
        positionMultiplier: is4hOpposing ? 0.75 : 0.90,
        isCounterTrend: is4hOpposing,
        riskClass: is4hOpposing ? 'MEDIUM' : 'LOW',
        evidenceStrength: conf1h >= 70 ? 'STRONG' : 'MODERATE',
        conflictsWith: is4hOpposing ? ['4h'] : [],
      }),
    };
  }
  
  // ============= PRIORITY 2.3: CONSECUTIVE CANDLE MOMENTUM OVERRIDE =============
  // When 1h has 5+ consecutive candles in the same direction, allow signal even if 4h is neutral
  const consecutiveBars1h = trendData.momentum?.consecutiveBars1h ?? 0;
  const consecutiveBars30m = trendData.momentum?.consecutiveBars30m ?? 0;
  
  if (
    trend4h === "neutral" &&
    consecutiveBars1h >= 5 &&
    adx >= 20
  ) {
    const inferredDirection = trend1h !== "neutral" ? trend1h : 
                              (trend30m !== "neutral" ? trend30m : null);
    
    if (inferredDirection) {
      const direction: TradeDirection = inferredDirection === "bullish" ? "long" : "short";
      
      let baseConf = 55 + Math.min(15, (consecutiveBars1h - 5) * 3);
      const adxBonus = Math.min(10, (adx - 20) * 0.5);
      const conf30mBonus = consecutiveBars30m >= 4 ? 5 : 0;
      const conf1hBonus = conf1h >= 55 ? Math.min(5, (conf1h - 55) * 0.5) : 0;
      
      const finalConf = Math.min(75, baseConf + adxBonus + conf30mBonus + conf1hBonus) * 0.85;
      
      reasons.push(`CONSECUTIVE CANDLE OVERRIDE: ${consecutiveBars1h} consecutive 1h bars in ${inferredDirection} direction`);
      reasons.push(`4h neutral but price action confirms momentum`);
      reasons.push(`ADX=${adx.toFixed(1)}, 30m bars=${consecutiveBars30m}`);
      reasons.push("Momentum-based entry - 65% position size recommended");
      
      return { 
        direction, 
        confidence: finalConf, 
        source: "consecutive-candle-momentum", 
        reasons,
        positionSizeMultiplier: 0.65,
        regime,
        directionContext: createDirectionContext(direction, {
          evidenceType: 'MOMENTUM',
          tier: 4,
          tierSource: 'TIER_4_CONSECUTIVE_CANDLE_MOMENTUM',
          confidence: finalConf,
          positionMultiplier: 0.65,
          isCounterTrend: false,
          riskClass: 'MEDIUM',
          evidenceStrength: consecutiveBars1h >= 7 ? 'STRONG' : 'MODERATE',
        }),
      } as DirectionResult;
    }
  }
  
  // ============= PRIORITY 2.5: BUILDING TREND DIRECTION OVERRIDE =============
  const adxRising = trendData.momentum?.adxRising || trendData.volatility?.adxRising || false;
  const priceMove = trendData.priceActionMomentum?.movePercent || 0;
  
  if (
    trend4h === "neutral" &&
    trend1h !== "neutral" &&
    conf1h >= 57 && conf1h < 60 &&
    adx >= 18 && adx <= 35 &&
    adxRising &&
    Math.abs(priceMove) >= 0.8
  ) {
    const direction: TradeDirection = trend1h === "bullish" ? "long" : "short";
    const priceAligned = (trend1h === "bullish" && priceMove > 0) || (trend1h === "bearish" && priceMove < 0);
    
    if (priceAligned) {
      const earlyConf = conf1h * 0.85;
      
      reasons.push(`EARLY TREND DETECTION: 1h ${trend1h} (${conf1h.toFixed(0)}% conf, reduced to ${earlyConf.toFixed(0)}%)`);
      reasons.push(`ADX=${adx.toFixed(1)} rising in building zone (18-35)`);
      reasons.push(`Price action confirms: ${Math.abs(priceMove).toFixed(2)}% move ${priceMove > 0 ? 'up' : 'down'}`);
      reasons.push("Early signal - 75% position size recommended");
      
      return { 
        direction, 
        confidence: earlyConf, 
        source: "1h-building-override", 
        reasons,
        positionSizeMultiplier: 0.75,
        regime,
        directionContext: createDirectionContext(direction, {
          evidenceType: 'MOMENTUM',
          tier: 5,
          tierSource: 'TIER_5_BUILDING_TREND_DETECTION',
          confidence: earlyConf,
          positionMultiplier: 0.75,
          isCounterTrend: false,
          riskClass: 'MEDIUM',
          evidenceStrength: 'MODERATE',
        }),
      } as DirectionResult;
    }
  }
  
  // Priority 3: 4h neutral but 1h+30m aligned
  if (trend4h === "neutral" && trend1h === trend30m && trend1h !== "neutral") {
    const direction: TradeDirection = trend1h === "bullish" ? "long" : "short";
    const avgConf = (conf1h + conf30m) / 2;
    reasons.push(`1h+30m aligned ${trend1h} (avg ${avgConf.toFixed(0)}% confidence)`);
    reasons.push("4h neutral - lower timeframes determining direction");
    return { 
      direction, 
      confidence: avgConf, 
      source: "1h+30m", 
      reasons,
      regime,
      directionContext: createDirectionContext(direction, {
        evidenceType: 'HTF_CONSENSUS',
        tier: 6,
        tierSource: 'TIER_6_1H_30M_ALIGNED',
        confidence: avgConf,
        positionMultiplier: 0.80,
        isCounterTrend: false,
        riskClass: 'MEDIUM',
        evidenceStrength: avgConf >= 60 ? 'STRONG' : 'MODERATE',
      }),
    };
  }
  
  // Priority 4: 2 out of 3 timeframes agree WITH 4h included
  const directionalTimeframes = [
    { tf: '4h', trend: trend4h, conf: conf4h },
    { tf: '1h', trend: trend1h, conf: conf1h },
    { tf: '30m', trend: trend30m, conf: conf30m },
  ].filter(t => t.trend !== "neutral");
  
  if (directionalTimeframes.length >= 2) {
    const bullishTfs = directionalTimeframes.filter(t => t.trend === "bullish");
    const bearishTfs = directionalTimeframes.filter(t => t.trend === "bearish");
    const has4h = directionalTimeframes.some(t => t.tf === '4h');
    
    if (has4h && bullishTfs.length >= 2) {
      const avgConf = bullishTfs.reduce((sum, t) => sum + t.conf, 0) / bullishTfs.length;
      const finalConf = avgConf * 0.9;
      reasons.push(`2+ of 3 TFs bullish (${bullishTfs.map(t => t.tf).join('+')}) with 4h included`);
      reasons.push(`Avg confidence: ${avgConf.toFixed(0)}%`);
      return { 
        direction: "long", 
        confidence: finalConf, 
        source: "2-of-3", 
        reasons,
        regime,
        directionContext: createDirectionContext("long", {
          evidenceType: 'HTF_CONSENSUS',
          tier: 7,
          tierSource: 'TIER_7_2_OF_3_CONSENSUS_LONG',
          confidence: finalConf,
          positionMultiplier: 0.85,
          isCounterTrend: false,
          riskClass: 'LOW',
          evidenceStrength: bullishTfs.length >= 3 ? 'VERY_STRONG' : 'STRONG',
        }),
      };
    }
    
    if (has4h && bearishTfs.length >= 2) {
      const avgConf = bearishTfs.reduce((sum, t) => sum + t.conf, 0) / bearishTfs.length;
      const finalConf = avgConf * 0.9;
      reasons.push(`2+ of 3 TFs bearish (${bearishTfs.map(t => t.tf).join('+')}) with 4h included`);
      reasons.push(`Avg confidence: ${avgConf.toFixed(0)}%`);
      return { 
        direction: "short", 
        confidence: finalConf, 
        source: "2-of-3", 
        reasons,
        regime,
        directionContext: createDirectionContext("short", {
          evidenceType: 'HTF_CONSENSUS',
          tier: 7,
          tierSource: 'TIER_7_2_OF_3_CONSENSUS_SHORT',
          confidence: finalConf,
          positionMultiplier: 0.85,
          isCounterTrend: false,
          riskClass: 'LOW',
          evidenceStrength: bearishTfs.length >= 3 ? 'VERY_STRONG' : 'STRONG',
        }),
      };
    }
    
    if (trend4h !== "neutral" && conf4h >= 50) {
      const agreeing = directionalTimeframes.filter(t => t.trend === trend4h);
      if (agreeing.length >= 2) {
        const direction: TradeDirection = trend4h === "bullish" ? "long" : "short";
        const avgConf = agreeing.reduce((sum, t) => sum + t.conf, 0) / agreeing.length;
        const finalConf = avgConf * 0.85;
        reasons.push(`4h ${trend4h} with ${agreeing.length - 1} supporting TFs`);
        return { 
          direction, 
          confidence: finalConf, 
          source: "4h+support", 
          reasons,
          regime,
          directionContext: createDirectionContext(direction, {
            evidenceType: 'HTF_CONSENSUS',
            tier: 7,
            tierSource: 'TIER_7_4H_WITH_SUPPORT',
            confidence: finalConf,
            positionMultiplier: 0.80,
            isCounterTrend: false,
            riskClass: 'MEDIUM',
            evidenceStrength: agreeing.length >= 3 ? 'STRONG' : 'MODERATE',
          }),
        };
      }
    }
  }
  
  // Priority 5: EARLY MOMENTUM ENTRY MODE
  if (trend4h === "neutral" && trend30m !== "neutral" && conf30m >= 65) {
    const is1hLeaningSameDirection = 
      (trend1h === trend30m) ||
      (trend1h === "neutral" && conf1h >= 50 && conf1h <= 65);
    
    const inferred1hDirection = trend1h !== "neutral" ? trend1h : 
      (trendData.momentum?.confirms && trendData.momentum?.state !== "none" ? 
        (trend30m === "bullish" ? "bullish" : "bearish") : null);
    
    const is1hNotConflicting = 
      trend1h === "neutral" || 
      trend1h === trend30m ||
      (inferred1hDirection === trend30m);
    
    if (is1hLeaningSameDirection || (is1hNotConflicting && conf1h >= 55)) {
      const direction: TradeDirection = trend30m === "bullish" ? "long" : "short";
      const avgConf = (conf30m + Math.max(conf1h, 50)) / 2;
      const reducedConf = avgConf * 0.85;
      
      reasons.push(`EARLY MOMENTUM ENTRY: 30m strongly ${trend30m} (${conf30m.toFixed(0)}%)`);
      reasons.push(`1h ${trend1h} (${conf1h.toFixed(0)}%) - ${is1hLeaningSameDirection ? 'aligned' : 'not conflicting'}`);
      reasons.push(`4h neutral - catching trend early (50% position size, 0.85x confidence)`);
      
      return { 
        direction, 
        confidence: reducedConf, 
        source: "early-momentum-30m+1h", 
        reasons,
        positionSizeMultiplier: 0.50,
        regime,
        directionContext: createDirectionContext(direction, {
          evidenceType: 'MOMENTUM',
          tier: 8,
          tierSource: 'TIER_8_EARLY_MOMENTUM_30M',
          confidence: reducedConf,
          positionMultiplier: 0.50,
          isCounterTrend: false,
          riskClass: 'HIGH',
          evidenceStrength: conf30m >= 70 ? 'MODERATE' : 'WEAK',
        }),
      };
    }
  }
  
  // Priority 6: Fall back to primary trend from 5m if directional
  if (primaryTrend === "bullish" || primaryTrend === "bearish") {
    const direction: TradeDirection = primaryTrend === "bullish" ? "long" : "short";
    const primaryConf = trendData.confidence || 50;
    const finalConf = primaryConf * 0.8;
    reasons.push(`Primary trend ${primaryTrend} (${primaryConf.toFixed(0)}% confidence)`);
    reasons.push("Warning: Using primary trend as fallback - lower conviction");
    return { 
      direction, 
      confidence: finalConf, 
      source: "primary", 
      reasons,
      regime,
      directionContext: createDirectionContext(direction, {
        evidenceType: 'HTF_CONSENSUS',
        tier: 9,
        tierSource: 'TIER_9_PRIMARY_TREND_FALLBACK',
        confidence: finalConf,
        positionMultiplier: 0.50,
        isCounterTrend: false,
        riskClass: 'HIGH',
        evidenceStrength: 'WEAK',
      }),
    };
  }
  
  // ============= TIER 9.5: BIAS RESOLUTION BEFORE FALLBACK =============
  // When timeframes are neutral but price action shows clear bias
  // Prevents NO_CLEAR_DIRECTION during impulse phases
  let tier95Fired = false;
  
  if (BIAS_RESOLUTION_TIER.ENABLED) {
    const BR = BIAS_RESOLUTION_TIER;
    const biasEvidence: string[] = [];
    let biasDirection: TradeDirection | null = null;
    let biasScore = 0;
    
    // Get ADX for absolute extreme gating
    const tier95Adx = trendData.volatility?.adx ?? trendData.momentum?.adx ?? 25;
    
    // Evidence 1: Micro-direction (8+ consecutive bars)
    const consecutiveBars = trendData.momentum?.consecutiveBars || 
                           trendData.priceActionMomentum?.consecutiveBars || 0;
    const microDirection = trendData.momentum?.direction || 
                          trendData.priceActionMomentum?.direction || null;
    
    if (consecutiveBars >= (BR.MICRO_DIRECTION_MIN_BARS || 8)) {
      biasScore += BR.MICRO_DIRECTION_SCORE || 2;
      biasDirection = microDirection === "bullish" ? "long" : 
                     microDirection === "bearish" ? "short" : null;
      biasEvidence.push(`MICRO_DIRECTION(${consecutiveBars} bars → ${microDirection})`);
    }
    
    // Evidence 2: StochRSI extreme (K >= 90 or K <= 10)
    // NEW: Absolute extreme (K >= 98 or K <= 2) counts as 2 points when ADX < strong trend
    const stochK4h = extractStochRsiK(trendData, '4h');
    const absoluteExtremeHigh = BR.STOCHRSI_ABSOLUTE_EXTREME_K_HIGH ?? 98;
    const absoluteExtremeLow = BR.STOCHRSI_ABSOLUTE_EXTREME_K_LOW ?? 2;
    const absoluteExtremeMaxAdx = BR.STOCHRSI_ABSOLUTE_EXTREME_MAX_ADX ?? 30;
    const absoluteExtremeScore = BR.STOCHRSI_ABSOLUTE_EXTREME_SCORE ?? 2;
    
    // Check for absolute extreme (K >= 98 or K <= 2 with ADX check)
    const isAbsoluteOverbought = stochK4h >= absoluteExtremeHigh && tier95Adx < absoluteExtremeMaxAdx;
    const isAbsoluteOversold = stochK4h <= absoluteExtremeLow && tier95Adx < absoluteExtremeMaxAdx;
    
    if (isAbsoluteOverbought) {
      biasScore += absoluteExtremeScore;  // 2 points for absolute extreme
      if (!biasDirection) biasDirection = "short";
      biasEvidence.push(`STOCHRSI_ABSOLUTE_OVERBOUGHT(K=${stochK4h.toFixed(0)} >= ${absoluteExtremeHigh}, ADX=${tier95Adx.toFixed(1)} < ${absoluteExtremeMaxAdx})`);
    } else if (isAbsoluteOversold) {
      biasScore += absoluteExtremeScore;  // 2 points for absolute extreme
      if (!biasDirection) biasDirection = "long";
      biasEvidence.push(`STOCHRSI_ABSOLUTE_OVERSOLD(K=${stochK4h.toFixed(0)} <= ${absoluteExtremeLow}, ADX=${tier95Adx.toFixed(1)} < ${absoluteExtremeMaxAdx})`);
    } else if (stochK4h >= (BR.STOCHRSI_EXTREME_K_HIGH || 90)) {
      // Standard overbought (K >= 90 but < 98) = 1 point
      biasScore += BR.STOCHRSI_EXTREME_SCORE || 1;
      if (!biasDirection) biasDirection = "short";
      biasEvidence.push(`STOCHRSI_OVERBOUGHT(K=${stochK4h.toFixed(0)})`);
    } else if (stochK4h <= (BR.STOCHRSI_EXTREME_K_LOW || 10)) {
      // Standard oversold (K <= 10 but > 2) = 1 point
      biasScore += BR.STOCHRSI_EXTREME_SCORE || 1;
      if (!biasDirection) biasDirection = "long";
      biasEvidence.push(`STOCHRSI_OVERSOLD(K=${stochK4h.toFixed(0)})`);
    }
    
    // Evidence 3: Order flow signal
    const ofScore = orderFlowData?.score ?? 0;
    const ofSignal = orderFlowData?.signal?.toLowerCase() ?? "";
    if (ofScore >= (BR.ORDER_FLOW_MIN_SCORE || 60)) {
      biasScore += BR.ORDER_FLOW_EVIDENCE_SCORE || 1;
      const ofDir: TradeDirection = ofSignal.includes("buy") || ofSignal === "bullish" ? "long" : "short";
      if (!biasDirection) biasDirection = ofDir;
      biasEvidence.push(`ORDER_FLOW(score=${ofScore.toFixed(0)}, signal=${ofSignal})`);
    }
    
    // Evidence 4: Price action momentum (significant move in one direction)
    const priceMove = trendData.priceActionMomentum?.movePercent || 0;
    if (Math.abs(priceMove) >= 1.5) {
      biasScore += 1;
      const priceDir: TradeDirection = priceMove > 0 ? "long" : "short";
      if (!biasDirection) biasDirection = priceDir;
      biasEvidence.push(`PRICE_ACTION(${priceMove > 0 ? '+' : ''}${priceMove.toFixed(2)}%)`);
    }
    
    // Require at least MIN_EVIDENCE_SCORE sources
    if (biasScore >= (BR.MIN_EVIDENCE_SCORE || 2) && biasDirection) {
      tier95Fired = true;
      
      const confidence = BR.CONFIDENCE || 50;
      const positionMult = BR.POSITION_SIZE || 0.25;
      
      if (BR.LOG_TIER_EVALUATION) {
        reasons.push(`TIER 9.5 BIAS RESOLUTION: ${biasEvidence.join(' + ')} → ${biasDirection.toUpperCase()}`);
        reasons.push(`Evidence score: ${biasScore}/${BR.MIN_EVIDENCE_SCORE} | Confidence: ${confidence}% | Position: ${(positionMult * 100).toFixed(0)}%`);
        reasons.push(`Prevented NO_CLEAR_DIRECTION with micro-structure evidence`);
      }
      
      return {
        direction: biasDirection,
        confidence,
        source: "bias-resolution",
        reasons,
        positionSizeMultiplier: positionMult,
        isBiasResolution: true,
        regime,
        directionContext: createDirectionContext(biasDirection, {
          evidenceType: 'MICRO_STRUCTURE',
          tier: 9.5,
          tierSource: 'TIER_9.5_BIAS_RESOLUTION',
          confidence,
          positionMultiplier: positionMult,
          isCounterTrend: false,
          riskClass: 'HIGH',
          evidenceStrength: biasScore >= 3 ? 'MODERATE' : 'WEAK',
        }),
      };
    } else if (BR.LOG_TIER_EVALUATION && biasEvidence.length > 0) {
      reasons.push(`TIER 9.5 SKIPPED: Evidence score ${biasScore} < ${BR.MIN_EVIDENCE_SCORE} (found: ${biasEvidence.join(', ')})`);
    }
  }
  
  // ============= PRIORITY 7 (TIER 10): MOMENTUM + ORDER FLOW FALLBACK =============
  // When all other methods fail, use momentum score + order flow to derive direction
  // This prevents the "deadlock" where bullish momentum + buy order flow = no signal
  // NOTE: Tier 10 is for TREND CONTINUATION without strong TF structure
  // NOTE: Tier 10 and Tier 11 (Exhaustion Escape) are MUTUALLY EXCLUSIVE
  // FIX #5 (Audit): Tier 10 is SKIPPED if Tier 0.5 already evaluated (prevents double-dipping evidence)
  // NEW: Also skip if Tier 9.5 already fired
  let tier10Fired = false;  // Flag to track if Tier 10 fires (blocks Tier 11)
  
  // FIX #5 (REVISED): Only block Tier 10 if Tier 0.5 actually SUCCEEDED (returned a direction)
  // Previous logic was too aggressive - blocking Tier 10 when Tier 0.5 merely evaluated but FAILED
  // This caused deadlock: Tier 0.5 fails (score too low) → blocks Tier 10 → NO_CLEAR_DIRECTION
  // NEW LOGIC: Tier 10 is ONLY blocked if we already returned a direction from an earlier tier
  // Since we're still executing here, no earlier tier succeeded - allow Tier 10 to run
  // The tier05Evaluated flag is now ONLY used for logging, not blocking
  // NOTE: Tier 9.5 blocking is still active (tier95Fired) - that tier DID return a direction
  
  if (MOMENTUM_FALLBACK_DIRECTION_PARAMS.ENABLED) {
    const P = MOMENTUM_FALLBACK_DIRECTION_PARAMS;
    
    // Get momentum data from trendData
    const momentumScore = trendData.smartMomentum?.score ?? trendData.momentum?.score ?? 0;
    const tier10StochK = trendData.stochRsi?.k ?? trendData.stochRsi1h?.k ?? trendData.stochasticRsi?.['1h']?.k ?? 50;
    
    // Check if we have strong enough momentum signal
    const absMomentum = Math.abs(momentumScore);
    if (absMomentum >= P.MIN_MOMENTUM_SCORE && adx >= P.MIN_ADX) {
      const momentumDirection: TradeDirection = momentumScore > 0 ? "long" : "short";
      
      // Check order flow alignment
      const ofScore = orderFlowData?.score ?? 0;
      const ofSignal = orderFlowData?.signal?.toLowerCase() ?? "";
      const orderFlowDirection = 
        (ofSignal.includes("buy") || ofSignal === "bullish") ? "long" :
        (ofSignal.includes("sell") || ofSignal === "bearish") ? "short" : null;
      
      const orderFlowAligned = orderFlowDirection === momentumDirection;
      const orderFlowStrong = ofScore >= P.STRONG_ORDER_FLOW_SCORE && orderFlowAligned;
      const orderFlowSupports = ofScore >= P.MIN_ORDER_FLOW_SCORE && orderFlowAligned;
      
      // Check StochRSI context (oversold favors LONG, overbought favors SHORT for mean reversion)
      const stochOversold = tier10StochK <= P.STOCHRSI_EXTREME_OVERSOLD;
      const stochOverbought = tier10StochK >= P.STOCHRSI_EXTREME_OVERBOUGHT;
      const stochConfirmsLong = momentumDirection === "long" && stochOversold;
      const stochConfirmsShort = momentumDirection === "short" && stochOverbought;
      const stochConfirms = stochConfirmsLong || stochConfirmsShort;
      
      // ===== EPISTEMIC FLOOR FOR LATE TIERS (Tier >= 8) =====
      // In RANGE regime, require at least 2 independent evidence types
      // Evidence types: Momentum, Order Flow, StochRSI, Price Action
      let evidenceCount = 0;
      const evidenceTypes: string[] = [];
      
      if (absMomentum >= P.MIN_MOMENTUM_SCORE) {
        evidenceCount++;
        evidenceTypes.push('MOMENTUM');
      }
      if (orderFlowAligned && ofScore >= P.MIN_ORDER_FLOW_SCORE) {
        evidenceCount++;
        evidenceTypes.push('ORDER_FLOW');
      }
      if (stochConfirms) {
        evidenceCount++;
        evidenceTypes.push('STOCHRSI');
      }
      
      // Check epistemic floor: in RANGE regime, require 2+ evidence types
      const EPISTEMIC_FLOOR_TIER = 8;  // This is Tier 10 in our naming (Priority 7 = Tier 10)
      const EPISTEMIC_FLOOR_MIN_EVIDENCE = 2;
      const requiresEpistemicFloor = regime === 'RANGE';
      const epistemicFloorMet = !requiresEpistemicFloor || evidenceCount >= EPISTEMIC_FLOOR_MIN_EVIDENCE;
      
      if (!epistemicFloorMet) {
        reasons.push(`TIER 10 EPISTEMIC FLOOR BLOCKED: RANGE regime requires ${EPISTEMIC_FLOOR_MIN_EVIDENCE}+ evidence types, got ${evidenceCount} (${evidenceTypes.join(', ')})`);
      }
      
      // Calculate confidence based on signal strength
      let confidence: number = P.BASE_CONFIDENCE;
      let positionMultiplier: number = P.BASE_POSITION_MULTIPLIER;
      
      // Strong momentum bonus
      if (absMomentum >= P.STRONG_MOMENTUM_SCORE) {
        confidence += 5;
      }
      
      // Order flow confirmation bonus
      if (orderFlowStrong) {
        confidence += 8;
        positionMultiplier = P.STRONG_POSITION_MULTIPLIER;
      } else if (orderFlowSupports) {
        confidence += 4;
        positionMultiplier = 0.60;
      }
      
      // StochRSI extreme context bonus (mean reversion setup)
      if (stochConfirms) {
        confidence += 5;
      }
      
      confidence = Math.min(confidence, P.MAX_CONFIDENCE);
      
      // Only proceed if we have at least one confirmation (order flow OR stochRSI)
      // AND epistemic floor is met
      const hasConfirmation = orderFlowSupports || stochConfirms;
      
      if (hasConfirmation && epistemicFloorMet) {
        tier10Fired = true;  // Mark Tier 10 as fired to block Tier 11
        
        reasons.push(`MOMENTUM FALLBACK (TIER 10): score=${momentumScore.toFixed(0)} → ${momentumDirection.toUpperCase()}`);
        reasons.push(`Evidence types: ${evidenceTypes.join(', ')} (${evidenceCount} sources)`);
        reasons.push(`Order flow: score=${ofScore.toFixed(0)}, signal=${ofSignal}, aligned=${orderFlowAligned}`);
        reasons.push(`StochRSI K=${tier10StochK.toFixed(0)} (${stochOversold ? 'oversold' : stochOverbought ? 'overbought' : 'normal'})`);
        reasons.push(`ADX=${adx.toFixed(1)} | Confidence=${confidence.toFixed(0)}% | Position=${(positionMultiplier * 100).toFixed(0)}%`);
        reasons.push("Timeframes neutral/conflicting - momentum + order flow determining direction");
        
        return {
          direction: momentumDirection,
          confidence,
          source: "momentum-fallback",
          reasons,
          positionSizeMultiplier: positionMultiplier,
          isMomentumFallback: true,
          regime,
          directionContext: createDirectionContext(momentumDirection, {
            evidenceType: evidenceTypes.includes('ORDER_FLOW') ? 'ORDER_FLOW' : 'MOMENTUM',
            tier: 10,
            tierSource: 'TIER_10_MOMENTUM_ORDER_FLOW_FALLBACK',
            confidence,
            positionMultiplier: positionMultiplier,
            isCounterTrend: false,
            riskClass: 'HIGH',
            evidenceStrength: evidenceCount >= 3 ? 'MODERATE' : 'WEAK',
          }),
        };
      } else {
        // Log why we didn't use the fallback (for debugging)
        if (!epistemicFloorMet) {
          // Already logged above
        } else {
          reasons.push(`MOMENTUM FALLBACK SKIPPED: momentum=${momentumScore.toFixed(0)} but no confirmation (OF aligned=${orderFlowAligned}, stochConfirms=${stochConfirms})`);
        }
      }
    }
    
    // ============= TIER 10.5: STRONG ORDER FLOW OVERRIDE =============
    // NEW: When order flow is VERY strong (>= 65) and momentum is only moderate (not extreme),
    // use order flow direction. This catches scenarios like:
    // - momentum=-33 (bearish), order_flow=70 (strong buy) → derive LONG
    // Order flow is more leading than momentum score in neutral/ranging markets
    const STRONG_OF_OVERRIDE_THRESHOLD = 65;
    const EXTREME_MOMENTUM_THRESHOLD = 45;  // Only override if momentum isn't extreme
    const tier105OfScore = orderFlowData?.score ?? 0;
    const tier105OfSignal = orderFlowData?.signal?.toLowerCase() ?? "";
    const tier105OfBullish = tier105OfSignal.includes("buy") || tier105OfSignal === "bullish";
    const tier105OfBearish = tier105OfSignal.includes("sell") || tier105OfSignal === "bearish";
    const tier105MomentumScore = trendData.smartMomentum?.score ?? trendData.momentum?.score ?? 0;
    const tier105AbsMomentum = Math.abs(tier105MomentumScore);
    
    // Order flow must be strong AND momentum must be only moderate (not extreme)
    // This prevents overriding a -60 momentum (extreme bearish) with +70 order flow
    const ofIsStrongBullish = tier105OfBullish && tier105OfScore >= STRONG_OF_OVERRIDE_THRESHOLD;
    const ofIsStrongBearish = tier105OfBearish && tier105OfScore >= STRONG_OF_OVERRIDE_THRESHOLD;
    const momentumNotExtreme = tier105AbsMomentum < EXTREME_MOMENTUM_THRESHOLD;
    
    // Additional safety: StochRSI should not be at extreme that contradicts OF direction
    const tier105StochK = trendData.stochRsi?.k ?? trendData.stochRsi1h?.k ?? trendData.stochasticRsi?.['1h']?.k ?? 50;
    const stochAllowsLong = tier105StochK < 90;  // Not deeply overbought
    const stochAllowsShort = tier105StochK > 10; // Not deeply oversold
    
    if (ofIsStrongBullish && momentumNotExtreme && stochAllowsLong) {
      tier10Fired = true;
      const ofConfidence = Math.min(60, 50 + (ofScore - 50) * 0.3);
      const ofPosition = 0.55;  // Conservative 55% position
      
      reasons.push(`TIER 10.5 ORDER FLOW OVERRIDE → LONG: OF score=${tier105OfScore.toFixed(0)} (${tier105OfSignal}) overrides moderate momentum (${tier105MomentumScore.toFixed(0)})`);
      reasons.push(`Conditions: OF >= ${STRONG_OF_OVERRIDE_THRESHOLD}, |momentum|=${tier105AbsMomentum.toFixed(0)} < ${EXTREME_MOMENTUM_THRESHOLD}, StochK=${tier105StochK.toFixed(0)} < 90`);
      reasons.push(`Confidence: ${ofConfidence.toFixed(0)}% | Position: ${(ofPosition * 100).toFixed(0)}%`);
      
      return {
        direction: "long",
        confidence: ofConfidence,
        source: "order-flow-override",
        reasons,
        positionSizeMultiplier: ofPosition,
        isOrderFlowOverride: true,
        regime,
        directionContext: createDirectionContext("long", {
          evidenceType: 'ORDER_FLOW',
          tier: 10.5,
          tierSource: 'TIER_10.5_ORDER_FLOW_OVERRIDE_LONG',
          confidence: ofConfidence,
          positionMultiplier: ofPosition,
          isCounterTrend: tier105MomentumScore < 0,  // Counter to momentum direction
          riskClass: 'HIGH',
          evidenceStrength: tier105OfScore >= 70 ? 'MODERATE' : 'WEAK',
        }),
      };
    }
    
    if (ofIsStrongBearish && momentumNotExtreme && stochAllowsShort) {
      tier10Fired = true;
      const ofConfidence = Math.min(60, 50 + (ofScore - 50) * 0.3);
      const ofPosition = 0.55;  // Conservative 55% position
      
      reasons.push(`TIER 10.5 ORDER FLOW OVERRIDE → SHORT: OF score=${tier105OfScore.toFixed(0)} (${tier105OfSignal}) overrides moderate momentum (${tier105MomentumScore.toFixed(0)})`);
      reasons.push(`Conditions: OF >= ${STRONG_OF_OVERRIDE_THRESHOLD}, |momentum|=${tier105AbsMomentum.toFixed(0)} < ${EXTREME_MOMENTUM_THRESHOLD}, StochK=${tier105StochK.toFixed(0)} > 10`);
      reasons.push(`Confidence: ${ofConfidence.toFixed(0)}% | Position: ${(ofPosition * 100).toFixed(0)}%`);
      
      return {
        direction: "short",
        confidence: ofConfidence,
        source: "order-flow-override",
        reasons,
        positionSizeMultiplier: ofPosition,
        isOrderFlowOverride: true,
        regime,
        directionContext: createDirectionContext("short", {
          evidenceType: 'ORDER_FLOW',
          tier: 10.5,
          tierSource: 'TIER_10.5_ORDER_FLOW_OVERRIDE_SHORT',
          confidence: ofConfidence,
          positionMultiplier: ofPosition,
          isCounterTrend: tier105MomentumScore > 0,  // Counter to momentum direction
          riskClass: 'HIGH',
          evidenceStrength: tier105OfScore >= 70 ? 'MODERATE' : 'WEAK',
        }),
      };
    }
  // FIX #5 REVISED: Log if Tier 0.5 evaluated but we still reached here (for debugging)
  // This is now informational, not blocking
  } else if (tier05Evaluated && !tier05Blocked) {
    reasons.push(`TIER 10: Tier 0.5 evaluated (score=${tier05Score}) but didn't fire - Tier 10 allowed to evaluate`);
  }
  
  // ============= PRIORITY 8 (TIER 11): EXHAUSTION ESCAPE (PHASE 1 FIX) =============
  // Final escape valve before hard rejection when neutral 4H + extreme exhaustion
  // Captures mean reversion opportunities that would otherwise be blocked
  // NOTE: Tier 11 is for MEAN REVERSION ONLY (not trend continuation)
  // NOTE: Tier 10 and Tier 11 are MUTUALLY EXCLUSIVE - if Tier 10 fired, skip Tier 11
  if (EXHAUSTION_ESCAPE_PARAMS.ENABLED && !tier10Fired) {
    const EE = EXHAUSTION_ESCAPE_PARAMS;
    
    // Only apply in EXHAUSTION regime (or skip regime check if disabled)
    const regimeAllows = !EE.REQUIRE_EXHAUSTION_REGIME || regime === 'EXHAUSTION';
    
    if (regimeAllows) {
      // Get StochRSI and Bollinger data
      const stochK4h = trendData.stochasticRsi?.['4h']?.k ?? 
                       trendData.timeframes?.['4h']?.indicators?.stochRsi?.k ?? 50;
      const percentB = trendData.bollingerBands?.['4h']?.percentB ?? 
                       trendData.bollingerBands?.['1h']?.percentB ?? 50;
      
      // Get momentum score (use different names to avoid shadowing outer scope)
      const tier11MomentumScore = trendData.smartMomentum?.score ?? trendData.momentum?.score ?? 0;
      const tier11AbsMomentum = Math.abs(tier11MomentumScore);
      
      // Get order flow data (use different names to avoid shadowing outer scope)
      const tier11OfScore = orderFlowData?.score ?? 0;
      const tier11OfSignal = orderFlowData?.signal?.toLowerCase() ?? "";
      const tier11OfBullish = tier11OfSignal.includes("buy") || tier11OfSignal === "bullish";
      const tier11OfBearish = tier11OfSignal.includes("sell") || tier11OfSignal === "bearish";
      
      // Check for oversold escape (LONG)
      const isOversold = stochK4h <= EE.OVERSOLD_K_THRESHOLD && percentB <= EE.OVERSOLD_PERCENT_B_THRESHOLD;
      const momentumAllowsLong = tier11AbsMomentum >= EE.MIN_MOMENTUM_SCORE || tier11MomentumScore > 0;
      
      if (isOversold && momentumAllowsLong) {
        let confidence: number = EE.BASE_CONFIDENCE;
        let positionMult: number = EE.BASE_POSITION_MULTIPLIER;
        
        // Order flow alignment bonus
        if (tier11OfBullish && tier11OfScore >= EE.MIN_ORDER_FLOW_SCORE) {
          confidence += EE.ORDER_FLOW_ALIGNED_BONUS;
          positionMult = EE.STRONG_POSITION_MULTIPLIER;
        }
        
        confidence = Math.min(confidence, EE.MAX_CONFIDENCE);
        
        if (EE.LOG_ESCAPES) {
          reasons.push(`EXHAUSTION ESCAPE → LONG: All derivation methods failed, but extreme oversold detected`);
          reasons.push(`StochRSI K=${stochK4h.toFixed(1)} <= ${EE.OVERSOLD_K_THRESHOLD}, %B=${percentB.toFixed(1)} <= ${EE.OVERSOLD_PERCENT_B_THRESHOLD}`);
          reasons.push(`Momentum=${tier11MomentumScore.toFixed(0)}, OrderFlow=${tier11OfScore.toFixed(0)} (${tier11OfSignal})`);
          reasons.push(`Regime=${regime} | Conf=${confidence.toFixed(0)}% | Pos=${(positionMult * 100).toFixed(0)}%`);
        }
        
        return {
          direction: "long",
          confidence,
          source: "exhaustion-escape",
          reasons,
          positionSizeMultiplier: positionMult,
          isExhaustionEscape: true,
          regime,
          directionContext: createDirectionContext("long", {
            evidenceType: 'EXHAUSTION',
            tier: 11,
            tierSource: 'TIER_11_EXHAUSTION_ESCAPE_LONG',
            confidence,
            positionMultiplier: positionMult,
            isCounterTrend: true,
            riskClass: 'EXTREME',
            evidenceStrength: stochK4h <= 10 ? 'MODERATE' : 'WEAK',
          }),
        };
      }
      
      // Check for overbought escape (SHORT)
      const isOverbought = stochK4h >= EE.OVERBOUGHT_K_THRESHOLD && percentB >= EE.OVERBOUGHT_PERCENT_B_THRESHOLD;
      const momentumAllowsShort = tier11AbsMomentum >= EE.MIN_MOMENTUM_SCORE || tier11MomentumScore < 0;
      
      // Additional protection: don't SHORT if 4h is strongly bullish
      const is4hStrongBullish = trend4h === "bullish" && conf4h >= 70;
      
      if (isOverbought && momentumAllowsShort && !is4hStrongBullish) {
        let confidence: number = EE.BASE_CONFIDENCE;
        let positionMult: number = EE.BASE_POSITION_MULTIPLIER;
        
        // Order flow alignment bonus
        if (tier11OfBearish && tier11OfScore >= EE.MIN_ORDER_FLOW_SCORE) {
          confidence += EE.ORDER_FLOW_ALIGNED_BONUS;
          positionMult = EE.STRONG_POSITION_MULTIPLIER;
        }
        
        confidence = Math.min(confidence, EE.MAX_CONFIDENCE);
        
        if (EE.LOG_ESCAPES) {
          reasons.push(`EXHAUSTION ESCAPE → SHORT: All derivation methods failed, but extreme overbought detected`);
          reasons.push(`StochRSI K=${stochK4h.toFixed(1)} >= ${EE.OVERBOUGHT_K_THRESHOLD}, %B=${percentB.toFixed(1)} >= ${EE.OVERBOUGHT_PERCENT_B_THRESHOLD}`);
          reasons.push(`Momentum=${tier11MomentumScore.toFixed(0)}, OrderFlow=${tier11OfScore.toFixed(0)} (${tier11OfSignal})`);
          reasons.push(`Regime=${regime} | Conf=${confidence.toFixed(0)}% | Pos=${(positionMult * 100).toFixed(0)}%`);
        }
        
        return {
          direction: "short",
          confidence,
          source: "exhaustion-escape",
          reasons,
          positionSizeMultiplier: positionMult,
          isExhaustionEscape: true,
          regime,
          directionContext: createDirectionContext("short", {
            evidenceType: 'EXHAUSTION',
            tier: 11,
            tierSource: 'TIER_11_EXHAUSTION_ESCAPE_SHORT',
            confidence,
            positionMultiplier: positionMult,
            isCounterTrend: true,
            riskClass: 'EXTREME',
            evidenceStrength: stochK4h >= 90 ? 'MODERATE' : 'WEAK',
          }),
        };
      }
    }
  } else if (tier10Fired) {
    // Log that Tier 11 was skipped due to mutual exclusivity
    reasons.push(`TIER 11 (EXHAUSTION ESCAPE) SKIPPED: Tier 10 (Momentum Fallback) already fired - mutually exclusive`);
  }
  
  // No clear direction - but log what we tried
  reasons.push("NO_CLEAR_DIRECTION: All timeframes neutral or conflicting after exhausting all 12 tiered reasoning paths");
  reasons.push(`4h: ${trend4h} (${conf4h}%), 1h: ${trend1h} (${conf1h}%), 30m: ${trend30m} (${conf30m}%)`);
  reasons.push(`Regime: ${regime} | tier10Fired: ${tier10Fired}`);
  return { 
    direction: null, 
    confidence: 0, 
    source: "none", 
    reasons,
    regime,
    // ===== INCLUDE GRADUATED MOMENTUM EFFECT DIAGNOSTICS =====
    graduatedMomentumEffect: outerGraduatedMomentumEffect,
    momentumImpact: outerMomentumImpact,
    momentumScore: outerMomentumScore,
    directionContext: createDirectionContext(null, {
      evidenceType: 'NONE',
      tier: 12,
      tierSource: 'TIER_12_NO_CLEAR_DIRECTION',
      confidence: 0,
      positionMultiplier: 0,
      isCounterTrend: false,
      riskClass: 'EXTREME',
      evidenceStrength: 'WEAK',
    }),
  };
};

// ============= CALCULATE QUALITY SCORE =============
// Unified quality score calculation
export const calculateQualityScore = (
  trendData: any,
  effectiveTrend: string,
  symbol: string
): { 
  score: number; 
  breakdown: { 
    adx: number; 
    momentum: number; 
    alignment: number; 
    technical: number; 
    volume: number; 
    confidencePenalty: number 
  } 
} => {
  const adx = trendData?.volatility?.adx || trendData?.momentum?.adx || 0;
  const adxSlope = trendData?.volatility?.adxSlope ?? undefined;
  const confidence = trendData?.confidence || 50;
  const consistency = trendData?.trueAlignment?.score || 50;
  const momentum = trendData?.momentum || {};
  const aligned = trendData?.isAligned ?? false;
  
  const volumeConfirms = momentum.volumeConfirms || false;
  const volumeSpike = momentum.volumeSpike || false;
  const volumeRatio = trendData?.volatility?.volumeRatio || momentum.volumeBoost || 1.0;
  const hasRangeExpansion = (trendData?.volatility?.relativeATR || 1) > 1.0;
  
  const adxScore = getAdxScore(adx, adxSlope);
  const adxRising = trendData?.volatility?.adxRising ?? false;
  
  // Extract StochRSI data for the decline bonus calculation
  const stochRsi1h = trendData?.stochasticRsi?.['1h'];
  const stochRsiData = stochRsi1h ? { k: stochRsi1h.k ?? 50, d: stochRsi1h.d ?? 50 } : undefined;
  
  // PHASE 1 FIX: Pass adxSlope to getMomentumScore for momentum floor calculation
  const momentumScore = getMomentumScore(momentum, adx, adxRising, stochRsiData, adxSlope);
  const alignmentScore = getAlignmentScore(confidence, consistency, aligned, trendData);
  const technicalScore = getTechnicalScore(trendData, effectiveTrend, symbol);
  const volumeScoreVal = getVolumeScore(volumeConfirms, volumeSpike, volumeRatio, hasRangeExpansion, effectiveTrend);
  const confidencePenalty = getConfidencePenalty(confidence, adx, momentum.confirms);
  
  const totalScore = Math.max(0, Math.min(100, 
    adxScore + momentumScore + alignmentScore + technicalScore + volumeScoreVal + confidencePenalty
  ));
  
  return {
    score: totalScore,
    breakdown: {
      adx: adxScore,
      momentum: momentumScore,
      alignment: alignmentScore,
      technical: technicalScore,
      volume: volumeScoreVal,
      confidencePenalty
    }
  };
};

// ============= PHASE 0: MASTER MARKET REGIME CLASSIFIER =============
// Critical foundation: ADX defines regime, all other gates change meaning based on regime
// This is evaluated ONCE at the start of symbol processing, and all gates reference it
// ENHANCED: Now includes trendDirection, isMatureTrend, and regimeRuleId for better traceability

export interface MasterRegimeResult {
  regime: MasterMarketRegime;
  gateOverrides: {
    bollingerMaxPercentB: number;
    bollingerMinPercentB: number;
    stochRsiMaxK: number;
    stochRsiMinK: number;
    momentumScoreMinimum: number;
    qualityBoost: number;
    positionMultiplier: number;
  };
  requireHTFAlignment: boolean;
  isStrongTrendOverride: boolean;
  isParabolicOverride: boolean;
  reason: string;
  // NEW FIELDS (Phase 3 Enhancement)
  trendDirection: 'bullish' | 'bearish' | 'neutral';  // Actual trend direction from HTF
  isMatureTrend: boolean;        // ADX >= 45 AND slope < 0 (trend exhausting)
  requirePullback: boolean;      // When mature, require pullback for entry
  regimeRuleId: string;          // Log WHY this regime was chosen (traceability)
}

export const classifyMasterRegime = (
  adx: number,
  adxSlope: number,
  driftPercent: number = 0,
  htf4hTrend: string = "neutral",
  htf1hTrend: string = "neutral",
  isExhausted: boolean = false,
  // NEW: Optional DI values for explicit trend direction
  diPlus: number = 25,
  diMinus: number = 25
): MasterRegimeResult => {
  const RC = MARKET_REGIME_CLASSIFIER;
  const SAUO = STRONG_ADX_UNIVERSAL_OVERRIDE_PARAMS;
  
  // Derive actual trend direction from DI and HTF trends
  // Priority: 1) DI gap, 2) 4h trend, 3) 1h trend
  let trendDirection: 'bullish' | 'bearish' | 'neutral';
  const diGap = Math.abs(diPlus - diMinus);
  
  if (diGap >= 5) {
    // Significant DI gap - use DI for direction
    trendDirection = diPlus > diMinus ? 'bullish' : 'bearish';
  } else if (htf4hTrend !== "neutral") {
    // Use 4h trend if DI gap is narrow
    trendDirection = htf4hTrend === "bullish" ? 'bullish' : htf4hTrend === "bearish" ? 'bearish' : 'neutral';
  } else if (htf1hTrend !== "neutral") {
    // Fall back to 1h trend
    trendDirection = htf1hTrend === "bullish" ? 'bullish' : htf1hTrend === "bearish" ? 'bearish' : 'neutral';
  } else {
    trendDirection = 'neutral';
  }
  
  // Check for mature trend (ADX >= 45 AND slope < 0)
  // Expert insight: "ADX > 45 with declining slope often signals trend maturity, not opportunity"
  const isMatureTrend = adx >= 45 && adxSlope < 0;
  const requirePullback = isMatureTrend;
  
  // PARABOLIC: ADX >= 45 and not exhausted (or ADX >= 50 regardless)
  // In parabolic regime, ADX IS the confirmation - gates become context
  // PRIORITY 1: Check ADX thresholds FIRST, before other conditions
  if (adx >= RC.PARABOLIC.minADX && !isExhausted) {
    const overrides = RC.GATE_OVERRIDES.PARABOLIC;
    return {
      regime: 'PARABOLIC',
      gateOverrides: {
        bollingerMaxPercentB: overrides.bollingerMaxPercentB,
        bollingerMinPercentB: overrides.bollingerMinPercentB,
        stochRsiMaxK: overrides.stochRsiMaxK,
        stochRsiMinK: overrides.stochRsiMinK,
        momentumScoreMinimum: overrides.momentumScoreMinimum,
        qualityBoost: overrides.qualityBoost,
        positionMultiplier: overrides.positionMultiplier,
      },
      requireHTFAlignment: RC.REQUIRE_HTF_ALIGNMENT_BY_REGIME.PARABOLIC,
      isStrongTrendOverride: true,
      isParabolicOverride: true,
      reason: `PARABOLIC regime: ADX=${adx.toFixed(1)} >= ${RC.PARABOLIC.minADX}, exhausted=${isExhausted} - all gates become context`,
      // NEW fields
      trendDirection,
      isMatureTrend,
      requirePullback,
      regimeRuleId: 'RULE_001_PARABOLIC_ADX_45',
    };
  }
  
  // STRONG_TREND: ADX 30-45 (or 40+ with Tier 1 override)
  // Gates are relaxed but not completely bypassed
  // PRIORITY 2: Check for STRONG_TREND (ADX >= 30)
  if (adx >= RC.STRONG_TREND.minADX && !isExhausted) {
    const overrides = RC.GATE_OVERRIDES.STRONG_TREND;
    
    // Check for Tier 1 universal override (ADX 40+ with positive slope)
    const isTier1Override = SAUO.ENABLED && 
      adx >= SAUO.TIER1_MIN_ADX && 
      (!SAUO.TIER1_REQUIRE_SLOPE_POSITIVE || adxSlope >= SAUO.TIER1_MIN_SLOPE);
    
    const effectivePositionMultiplier = isTier1Override 
      ? SAUO.TIER1_POSITION_SIZE 
      : overrides.positionMultiplier;
    
    return {
      regime: 'STRONG_TREND',
      gateOverrides: {
        bollingerMaxPercentB: overrides.bollingerMaxPercentB,
        bollingerMinPercentB: overrides.bollingerMinPercentB,
        stochRsiMaxK: overrides.stochRsiMaxK,
        stochRsiMinK: overrides.stochRsiMinK,
        momentumScoreMinimum: overrides.momentumScoreMinimum,
        qualityBoost: overrides.qualityBoost,
        positionMultiplier: effectivePositionMultiplier,
      },
      requireHTFAlignment: RC.REQUIRE_HTF_ALIGNMENT_BY_REGIME.STRONG_TREND,
      isStrongTrendOverride: true,
      isParabolicOverride: false,
      reason: `STRONG_TREND regime: ADX=${adx.toFixed(1)} [${RC.STRONG_TREND.minADX}-${RC.STRONG_TREND.maxADX}], tier1=${isTier1Override} - gates relaxed`,
      // NEW fields
      trendDirection,
      isMatureTrend,
      requirePullback,
      regimeRuleId: isTier1Override ? 'RULE_002_STRONG_TREND_TIER1_ADX_40' : 'RULE_003_STRONG_TREND_ADX_30',
    };
  }
  
  // STEALTH_DRIFT: Low ADX but consistent price drift
  // This catches "stealth" moves that slip through ADX/momentum filters
  if (adx <= RC.STEALTH_DRIFT.maxADX && Math.abs(driftPercent) >= RC.STEALTH_DRIFT.minDriftPercent) {
    const overrides = RC.GATE_OVERRIDES.STEALTH_DRIFT;
    return {
      regime: 'STEALTH_DRIFT',
      gateOverrides: {
        bollingerMaxPercentB: overrides.bollingerMaxPercentB,
        bollingerMinPercentB: overrides.bollingerMinPercentB,
        stochRsiMaxK: overrides.stochRsiMaxK,
        stochRsiMinK: overrides.stochRsiMinK,
        momentumScoreMinimum: overrides.momentumScoreMinimum,
        qualityBoost: overrides.qualityBoost,
        positionMultiplier: overrides.positionMultiplier,
      },
      requireHTFAlignment: RC.REQUIRE_HTF_ALIGNMENT_BY_REGIME.STEALTH_DRIFT,
      isStrongTrendOverride: false,
      isParabolicOverride: false,
      reason: `STEALTH_DRIFT regime: ADX=${adx.toFixed(1)} <= ${RC.STEALTH_DRIFT.maxADX}, drift=${driftPercent.toFixed(2)}% - gradual price grind detected`,
      // NEW fields
      trendDirection,
      isMatureTrend: false,
      requirePullback: false,
      regimeRuleId: 'RULE_004_STEALTH_DRIFT',
    };
  }
  
  // NORMAL: Standard gates apply
  const overrides = RC.GATE_OVERRIDES.NORMAL;
  return {
    regime: 'NORMAL',
    gateOverrides: {
      bollingerMaxPercentB: overrides.bollingerMaxPercentB,
      bollingerMinPercentB: overrides.bollingerMinPercentB,
      stochRsiMaxK: overrides.stochRsiMaxK,
      stochRsiMinK: overrides.stochRsiMinK,
      momentumScoreMinimum: overrides.momentumScoreMinimum,
      qualityBoost: overrides.qualityBoost,
      positionMultiplier: overrides.positionMultiplier,
    },
    requireHTFAlignment: RC.REQUIRE_HTF_ALIGNMENT_BY_REGIME.NORMAL,
    isStrongTrendOverride: false,
    isParabolicOverride: false,
    reason: `NORMAL regime: ADX=${adx.toFixed(1)} - standard gate behavior`,
    // NEW fields
    trendDirection,
    isMatureTrend: false,
    requirePullback: false,
    regimeRuleId: 'RULE_005_NORMAL',
  };
};

// ============= 4-STATE REGIME CLASSIFIER =============
// Forensic audit revealed 100% of recent losses came from neutral/ranging entries.
// This classifier replaces binary "ranging vs trending" with 4 distinct market states,
// each with specific trading rules and position sizing.
//
// Decision tree:
//   1. ADX >= 30 AND slope >= 0 AND LTF aligned → TREND_EXPANSION (full trades)
//   2. ADX >= 30 AND (slope < 0 OR exhausted) → TREND_EXHAUSTION (MR probes only)
//   3. ADX < 25 AND neutral trend AND weak momentum → RANGE_COMPRESSION (hard block)
//   4. ADX 18-30 AND slope rising > 0.5 → BREAKOUT_SETUP (confirmation required)
//   5. Fallback → RANGE_COMPRESSION (default safe state)

export interface FourStateRegimeResult {
  regime: FourStateRegime;
  positionMultiplier: number;
  allowContinuation: boolean;
  allowMeanReversion: boolean;
  requireConfirmation: boolean;
  reason: string;
  // NEW: Continuous regime confidence score (0-100)
  regimeConfidence: number;
  // NEW: Whether this is in the transition buffer zone
  isTransitionZone: boolean;
  diagnostics: {
    adx: number;
    adxSlope: number;
    primaryTrend: string;
    momentumState: string;
    momentumScore: number;
    ltfAligned: boolean;
    stochRsiK4h: number;
    isExhausted: boolean;
    isSqueeze: boolean;
    // NEW: Confidence breakdown for diagnostics
    confidenceBreakdown?: {
      adxComponent: number;
      adxSlopeComponent: number;
      atrExpansionComponent: number;
      diSeparationComponent: number;
      momentumComponent: number;
      rawScore: number;
    };
  };
}

export const classify4StateRegime = (
  adx: number,
  adxSlope: number,
  primaryTrend: string,
  momentumState: string,
  momentumScore: number,
  htf1hTrend: string,
  htf30mTrend: string,
  derivedDirection: string,
  stochRsiK4h: number,
  isExhausted: boolean,
  isSqueeze: boolean,
  alignedTimeframeCount: number = 0,
  // NEW: Optional inputs for transition buffer confidence scoring
  diSeparation: number = 0,
  relativeATR: number = 1.0
): FourStateRegimeResult => {
  const R = FOUR_STATE_REGIME;
  
  // ===== TRANSITION BUFFER: Compute continuous confidence score =====
  const TB = R.TRANSITION_BUFFER;
  let regimeConfidence = 50; // Neutral baseline
  let confidenceBreakdown = {
    adxComponent: 0,
    adxSlopeComponent: 0,
    atrExpansionComponent: 0,
    diSeparationComponent: 0,
    momentumComponent: 0,
    rawScore: 0,
  };
  
  if (TB.ENABLED) {
    // Normalize each component to 0-1 range, then weight
    const normalize = (val: number, min: number, max: number) => 
      Math.max(0, Math.min(1, (val - min) / (max - min)));
    
    const adxNorm = normalize(adx, TB.ADX_NORM_MIN, TB.ADX_NORM_MAX);
    const adxSlopeNorm = normalize(adxSlope, TB.ADX_SLOPE_NORM_MIN, TB.ADX_SLOPE_NORM_MAX);
    const atrExpNorm = normalize(relativeATR, TB.ATR_EXP_NORM_MIN, TB.ATR_EXP_NORM_MAX);
    const diSepNorm = normalize(diSeparation, TB.DI_SEP_NORM_MIN, TB.DI_SEP_NORM_MAX);
    
    // Momentum alignment: 1.0 if aligned, 0.5 if neutral, 0.0 if opposing
    const momentumAligned = derivedDirection === 'long' ? momentumScore > 10 : momentumScore < -10;
    const momentumNeutral = Math.abs(momentumScore) <= 10;
    const momentumNorm = momentumAligned ? 1.0 : momentumNeutral ? 0.5 : 0.0;
    
    // Weighted sum → 0-100 scale
    const rawScore = (
      adxNorm * TB.WEIGHTS.ADX_NORMALIZED +
      adxSlopeNorm * TB.WEIGHTS.ADX_SLOPE +
      atrExpNorm * TB.WEIGHTS.ATR_EXPANSION_RATE +
      diSepNorm * TB.WEIGHTS.DI_SEPARATION +
      momentumNorm * TB.WEIGHTS.MOMENTUM_ALIGNMENT
    ) * 100;
    
    regimeConfidence = Math.max(0, Math.min(100, Math.round(rawScore)));
    
    confidenceBreakdown = {
      adxComponent: Math.round(adxNorm * TB.WEIGHTS.ADX_NORMALIZED * 100),
      adxSlopeComponent: Math.round(adxSlopeNorm * TB.WEIGHTS.ADX_SLOPE * 100),
      atrExpansionComponent: Math.round(atrExpNorm * TB.WEIGHTS.ATR_EXPANSION_RATE * 100),
      diSeparationComponent: Math.round(diSepNorm * TB.WEIGHTS.DI_SEPARATION * 100),
      momentumComponent: Math.round(momentumNorm * TB.WEIGHTS.MOMENTUM_ALIGNMENT * 100),
      rawScore: Math.round(rawScore * 10) / 10,
    };
  }
  
  if (!R.ENABLED) {
    return {
      regime: 'TREND_EXPANSION',
      positionMultiplier: 1.0,
      allowContinuation: true,
      allowMeanReversion: true,
      requireConfirmation: false,
      reason: '4-state regime classifier disabled',
      regimeConfidence: 100,
      isTransitionZone: false,
      diagnostics: { adx, adxSlope, primaryTrend, momentumState, momentumScore, ltfAligned: true, stochRsiK4h, isExhausted, isSqueeze, confidenceBreakdown },
    };
  }
  
  // Check if LTF (1h or 30m) aligns with derived direction
  const ltfAligned = (
    (htf1hTrend === 'bullish' && derivedDirection === 'long') ||
    (htf1hTrend === 'bearish' && derivedDirection === 'short') ||
    (htf30mTrend === 'bullish' && derivedDirection === 'long') ||
    (htf30mTrend === 'bearish' && derivedDirection === 'short')
  );
  
  const diag = { adx, adxSlope, primaryTrend, momentumState, momentumScore, ltfAligned, stochRsiK4h, isExhausted, isSqueeze, confidenceBreakdown };
  
  // ===== STATE 1: TREND EXPANSION =====
  if (adx >= R.TREND_EXPANSION.MIN_ADX && adxSlope >= R.TREND_EXPANSION.MIN_ADX_SLOPE && ltfAligned) {
    // Apply transition buffer: if confidence is in the upper transition zone, reduce sizing
    let posMultiplier = R.TREND_EXPANSION.POSITION_MULTIPLIER;
    let isTransition = false;
    if (TB.ENABLED && regimeConfidence < TB.EXPANSION_THRESHOLD && regimeConfidence >= TB.TRANSITION_LOW) {
      posMultiplier = TB.TRANSITION_POSITION_MULTIPLIER_HIGH;
      isTransition = true;
    }
    
    return {
      regime: 'TREND_EXPANSION',
      positionMultiplier: posMultiplier,
      allowContinuation: true,
      allowMeanReversion: true,
      requireConfirmation: isTransition,
      reason: `TREND_EXPANSION: ADX=${adx.toFixed(1)}≥${R.TREND_EXPANSION.MIN_ADX}, slope=${adxSlope.toFixed(2)}≥0, LTF aligned, confidence=${regimeConfidence}${isTransition ? ' [TRANSITION BUFFER: 70% sizing]' : ''} → full continuation`,
      regimeConfidence,
      isTransitionZone: isTransition,
      diagnostics: diag,
    };
  }
  
  // ===== STATE 2: TREND EXHAUSTION =====
  const isStochExhausted = derivedDirection === 'long' 
    ? stochRsiK4h >= R.TREND_EXHAUSTION.STOCHRSI_EXHAUSTION_K_LONG 
    : stochRsiK4h <= R.TREND_EXHAUSTION.STOCHRSI_EXHAUSTION_K_SHORT;
  const isMomentumExhausted = R.TREND_EXHAUSTION.EXHAUSTION_MOMENTUM_STATES.includes(momentumState);
  
  if (adx >= R.TREND_EXHAUSTION.MIN_ADX && (adxSlope < R.TREND_EXHAUSTION.MAX_ADX_SLOPE || isExhausted || isMomentumExhausted || isStochExhausted)) {
    const exhaustionReasons: string[] = [];
    if (adxSlope < 0) exhaustionReasons.push(`slope=${adxSlope.toFixed(2)}<0`);
    if (isExhausted) exhaustionReasons.push('behavioral_exhaustion');
    if (isMomentumExhausted) exhaustionReasons.push(`momentum=${momentumState}`);
    if (isStochExhausted) exhaustionReasons.push(`stochK4h=${stochRsiK4h.toFixed(1)}`);
    
    return {
      regime: 'TREND_EXHAUSTION',
      positionMultiplier: R.TREND_EXHAUSTION.POSITION_MULTIPLIER,
      allowContinuation: false,
      allowMeanReversion: true,
      requireConfirmation: false,
      reason: `TREND_EXHAUSTION: ADX=${adx.toFixed(1)}≥${R.TREND_EXHAUSTION.MIN_ADX}, exhaustion=[${exhaustionReasons.join(', ')}], confidence=${regimeConfidence} → MR probes only`,
      regimeConfidence,
      isTransitionZone: false,
      diagnostics: diag,
    };
  }
  
  // ===== STATE 4: BREAKOUT SETUP =====
  const absMomentumScore = Math.abs(momentumScore);
  const trendIsNeutral = primaryTrend === 'neutral' || primaryTrend === 'ranging';
  const hasDirectionalMomentum = absMomentumScore >= R.BREAKOUT_SETUP.MIN_MOMENTUM_SCORE;
  const hasBreakoutStructure = (
    adx >= R.BREAKOUT_SETUP.MIN_ADX && 
    adx < R.BREAKOUT_SETUP.MAX_ADX &&
    adxSlope >= R.BREAKOUT_SETUP.MIN_ADX_SLOPE
  );
  const hasSqueezeBreakout = R.BREAKOUT_SETUP.ALLOW_SQUEEZE_BREAKOUT && isSqueeze && adxSlope > 0;
  const hasBreakoutConfirmation = !trendIsNeutral || (hasDirectionalMomentum && alignedTimeframeCount >= R.BREAKOUT_SETUP.MIN_ALIGNED_TIMEFRAMES);
  
  if ((hasBreakoutStructure || hasSqueezeBreakout) && hasBreakoutConfirmation && (hasDirectionalMomentum || alignedTimeframeCount >= R.BREAKOUT_SETUP.MIN_ALIGNED_TIMEFRAMES)) {
    return {
      regime: 'BREAKOUT_SETUP',
      positionMultiplier: R.BREAKOUT_SETUP.POSITION_MULTIPLIER,
      allowContinuation: true,
      allowMeanReversion: true,
      requireConfirmation: true,
      reason: `BREAKOUT_SETUP: ADX=${adx.toFixed(1)}, slope=${adxSlope.toFixed(2)}≥${R.BREAKOUT_SETUP.MIN_ADX_SLOPE}, |momentum|=${absMomentumScore.toFixed(0)}, confidence=${regimeConfidence} → confirmed directional entry`,
      regimeConfidence,
      isTransitionZone: false,
      diagnostics: diag,
    };
  }
  
  // ===== STATE 3: RANGE COMPRESSION =====
  const momentumHasNoEdge = R.RANGE_COMPRESSION.NO_EDGE_MOMENTUM_STATES.includes(momentumState);
  const adxBelowThreshold = adx < R.RANGE_COMPRESSION.MAX_ADX;
  const momentumScoreTooLow = absMomentumScore < R.RANGE_COMPRESSION.MAX_ABS_MOMENTUM_SCORE;
  
  const isExplicitRangeCompression = trendIsNeutral && (adxBelowThreshold || (momentumHasNoEdge && momentumScoreTooLow));
  
  // Transition buffer: if confidence is in the lower transition zone (45-55), allow cautious entries
  if (isExplicitRangeCompression) {
    const isLowerTransition = TB.ENABLED && regimeConfidence >= TB.TRANSITION_LOW && regimeConfidence < TB.TRANSITION_HIGH;
    
    if (isLowerTransition) {
      // Lower transition zone: cautious entries allowed at reduced sizing
      return {
        regime: 'RANGE_COMPRESSION',
        positionMultiplier: TB.TRANSITION_POSITION_MULTIPLIER_LOW,
        allowContinuation: true,
        allowMeanReversion: true,
        requireConfirmation: true,
        reason: `RANGE_COMPRESSION [TRANSITION BUFFER]: confidence=${regimeConfidence} (${TB.TRANSITION_LOW}-${TB.TRANSITION_HIGH}), ADX=${adx.toFixed(1)}, trend=${primaryTrend} → cautious 40% sizing allowed`,
        regimeConfidence,
        isTransitionZone: true,
        diagnostics: diag,
      };
    }
    
    return {
      regime: 'RANGE_COMPRESSION',
      positionMultiplier: 0,
      allowContinuation: false,
      allowMeanReversion: R.RANGE_COMPRESSION.ALLOW_MR_BYPASS,
      requireConfirmation: false,
      reason: `RANGE_COMPRESSION: primaryTrend=${primaryTrend}, ADX=${adx.toFixed(1)}<${R.RANGE_COMPRESSION.MAX_ADX}, momentum=${momentumState}, |score|=${absMomentumScore.toFixed(0)}, confidence=${regimeConfidence} → HARD BLOCK`,
      regimeConfidence,
      isTransitionZone: false,
      diagnostics: diag,
    };
  }
  
  // ===== FALLBACK: Default safe state =====
  return {
    regime: 'RANGE_COMPRESSION',
    positionMultiplier: 0,
    allowContinuation: false,
    allowMeanReversion: R.RANGE_COMPRESSION.ALLOW_MR_BYPASS,
    requireConfirmation: false,
    reason: `RANGE_COMPRESSION (fallback): ADX=${adx.toFixed(1)}, trend=${primaryTrend}, momentum=${momentumState}, confidence=${regimeConfidence} → default safe state`,
    regimeConfidence,
    isTransitionZone: false,
    diagnostics: diag,
  };
};

// ============= REGIME PERSISTENCE ENGINE =============
// Asymmetric persistence: require N consecutive candles of a new regime before switching.
// Prevents boundary-condition flip-flopping without delaying explosive moves.

export interface RegimePersistenceInput {
  currentDetectedRegime: FourStateRegime;
  recentRegimeHistory: { regime: string }[];  // Most recent first (last 3 rows)
}

export interface RegimePersistenceResult {
  effectiveRegime: FourStateRegime;
  wasOverridden: boolean;
  candidateRegime: FourStateRegime | null;
  candidateCount: number;
  requiredCandles: number;
  reason: string;
}

export const applyRegimePersistence = (
  input: RegimePersistenceInput
): RegimePersistenceResult => {
  const P = FOUR_STATE_REGIME.PERSISTENCE;
  const { currentDetectedRegime, recentRegimeHistory } = input;
  
  if (!P.ENABLED || recentRegimeHistory.length === 0) {
    return {
      effectiveRegime: currentDetectedRegime,
      wasOverridden: false,
      candidateRegime: null,
      candidateCount: 0,
      requiredCandles: 0,
      reason: P.ENABLED ? 'No regime history available, using raw classification' : 'Persistence disabled',
    };
  }
  
  const lastConfirmedRegime = recentRegimeHistory[0].regime as FourStateRegime;
  
  if (currentDetectedRegime === lastConfirmedRegime) {
    return {
      effectiveRegime: currentDetectedRegime,
      wasOverridden: false,
      candidateRegime: null,
      candidateCount: 0,
      requiredCandles: 0,
      reason: `Regime stable: ${currentDetectedRegime}`,
    };
  }
  
  const transitionKey = `${lastConfirmedRegime}_TO_${currentDetectedRegime}`;
  const requiredCandles = P.TRANSITIONS[transitionKey] ?? P.DEFAULT_REQUIRED_CANDLES;
  
  if (requiredCandles === 0) {
    return {
      effectiveRegime: currentDetectedRegime,
      wasOverridden: false,
      candidateRegime: null,
      candidateCount: 0,
      requiredCandles: 0,
      reason: `Immediate transition: ${transitionKey} (0 candles required)`,
    };
  }
  
  let candidateCount = 0;
  for (const entry of recentRegimeHistory) {
    if (entry.regime === currentDetectedRegime) {
      candidateCount++;
    } else {
      break;
    }
  }
  
  const totalCount = candidateCount + 1;
  
  if (totalCount >= requiredCandles) {
    return {
      effectiveRegime: currentDetectedRegime,
      wasOverridden: false,
      candidateRegime: currentDetectedRegime,
      candidateCount: totalCount,
      requiredCandles,
      reason: `Transition confirmed: ${transitionKey} (${totalCount}/${requiredCandles} candles)`,
    };
  }
  
  return {
    effectiveRegime: lastConfirmedRegime,
    wasOverridden: true,
    candidateRegime: currentDetectedRegime,
    candidateCount: totalCount,
    requiredCandles,
    reason: `Transition blocked: ${transitionKey} (${totalCount}/${requiredCandles} candles, holding ${lastConfirmedRegime})`,
  };
};


// Returns the effective minimum momentum score based on ADX level
// Key insight: At high ADX, momentum score should not block, only adjust position

export const getEffectiveMomentumThreshold = (
  adx: number,
  adxSlope: number = 0
): { threshold: number; canBlock: boolean; adjustmentType: string } => {
  const MSB = MOMENTUM_SCORE_BEHAVIOR_PARAMS;
  
  if (!MSB.ENABLED) {
    return { threshold: MSB.DEFAULT_MIN_SCORE, canBlock: true, adjustmentType: 'disabled' };
  }
  
  // At very high ADX, momentum score cannot block - only adjust position
  if (adx >= MSB.CANNOT_BLOCK_ABOVE_ADX) {
    return { 
      threshold: MSB.ADX_40_MIN_SCORE, 
      canBlock: false, 
      adjustmentType: 'adx_override_no_block' 
    };
  }
  
  // Graduated thresholds based on ADX level
  if (adx >= 40) {
    return { threshold: MSB.ADX_40_MIN_SCORE, canBlock: true, adjustmentType: 'adx_40' };
  }
  if (adx >= 35) {
    return { threshold: MSB.ADX_35_MIN_SCORE, canBlock: true, adjustmentType: 'adx_35' };
  }
  if (adx >= 30) {
    return { threshold: MSB.ADX_30_MIN_SCORE, canBlock: true, adjustmentType: 'adx_30' };
  }
  if (adx >= 25) {
    return { threshold: MSB.ADX_25_MIN_SCORE, canBlock: true, adjustmentType: 'adx_25' };
  }
  
  return { threshold: MSB.DEFAULT_MIN_SCORE, canBlock: true, adjustmentType: 'default' };
};

// ============= PHASE 4: QUALITY NEAR-MISS BOOST =============
// Apply boost to quality scores that are within range of threshold

export const applyQualityNearMissBoost = (
  qualityScore: number,
  threshold: number,
  adx: number,
  htfAligned: boolean
): { boostedScore: number; boostApplied: number; reason: string } => {
  const NMB = QUALITY_NEAR_MISS_BOOST_PARAMS;
  
  if (!NMB.ENABLED) {
    return { boostedScore: qualityScore, boostApplied: 0, reason: 'boost_disabled' };
  }
  
  // Check if score is in near-miss range
  const gapToThreshold = threshold - qualityScore;
  if (gapToThreshold <= 0 || gapToThreshold > NMB.NEAR_MISS_RANGE) {
    return { 
      boostedScore: qualityScore, 
      boostApplied: 0, 
      reason: gapToThreshold <= 0 ? 'already_passing' : 'not_near_miss' 
    };
  }
  
  // Calculate boost based on ADX level
  let boost = 0;
  let reasons: string[] = [];
  
  if (adx >= 45) {
    boost += NMB.ADX_45_BOOST;
    reasons.push(`ADX_45+: +${NMB.ADX_45_BOOST}`);
  } else if (adx >= 40) {
    boost += NMB.ADX_40_BOOST;
    reasons.push(`ADX_40+: +${NMB.ADX_40_BOOST}`);
  } else if (adx >= 35) {
    boost += NMB.ADX_35_BOOST;
    reasons.push(`ADX_35+: +${NMB.ADX_35_BOOST}`);
  }
  
  // HTF alignment boost
  if (htfAligned) {
    boost += NMB.HTF_ALIGNED_BOOST;
    reasons.push(`HTF_ALIGNED: +${NMB.HTF_ALIGNED_BOOST}`);
  }
  
  // Apply cap
  const boostedScore = Math.min(qualityScore + boost, NMB.MAX_BOOSTED_SCORE);
  const actualBoost = boostedScore - qualityScore;
  
  if (actualBoost > 0) {
    reasons.push(`capped_at_${NMB.MAX_BOOSTED_SCORE}`);
  }
  
  return {
    boostedScore,
    boostApplied: actualBoost,
    reason: actualBoost > 0 ? reasons.join(', ') : 'no_boost_applied'
  };
};

// ============= PHASE 7: IMPULSE CONTINUATION CHECK =============
// Detect impulse continuation conditions for exception entry

export interface ImpulseContinuationResult {
  isActive: boolean;
  gatesBecomeContext: boolean;
  positionMultiplier: number;
  stopMultiplier: number;
  reason: string;
}

export const checkImpulseContinuation = (
  adx: number,
  priceMovePct: number,
  htf4hTrend: string,
  htf1hTrend: string,
  derivedDirection: string,
  reversalScore: number,
  isExhausted: boolean
): ImpulseContinuationResult => {
  const ICP = IMPULSE_CONTINUATION_PARAMS;
  
  if (!ICP.ENABLED) {
    return { isActive: false, gatesBecomeContext: false, positionMultiplier: 1.0, stopMultiplier: 1.0, reason: 'disabled' };
  }
  
  // Safety: Block if exhausted
  if (ICP.BLOCK_IF_EXHAUSTED && isExhausted) {
    return { isActive: false, gatesBecomeContext: false, positionMultiplier: 1.0, stopMultiplier: 1.0, reason: 'blocked_exhausted' };
  }
  
  // Safety: Block if reversal score too high
  if (reversalScore >= ICP.MAX_REVERSAL_SCORE) {
    return { isActive: false, gatesBecomeContext: false, positionMultiplier: 1.0, stopMultiplier: 1.0, reason: 'blocked_high_reversal' };
  }
  
  // Check minimum ADX
  if (adx < ICP.MIN_ADX) {
    return { isActive: false, gatesBecomeContext: false, positionMultiplier: 1.0, stopMultiplier: 1.0, reason: 'adx_too_low' };
  }
  
  // Check minimum price move
  if (priceMovePct < ICP.MIN_PRICE_MOVE_PERCENT) {
    return { isActive: false, gatesBecomeContext: false, positionMultiplier: 1.0, stopMultiplier: 1.0, reason: 'price_move_insufficient' };
  }
  
  // Check HTF alignment if required
  if (ICP.REQUIRE_HTF_ALIGNMENT) {
    const htfAligned = (derivedDirection === 'long' && htf4hTrend === 'bullish' && htf1hTrend === 'bullish') ||
                       (derivedDirection === 'short' && htf4hTrend === 'bearish' && htf1hTrend === 'bearish');
    if (!htfAligned) {
      return { isActive: false, gatesBecomeContext: false, positionMultiplier: 1.0, stopMultiplier: 1.0, reason: 'htf_not_aligned' };
    }
  }
  
  // Impulse continuation active - gates become context
  return {
    isActive: true,
    gatesBecomeContext: ICP.BOLLINGER_BECOMES_CONTEXT && ICP.STOCHRSI_BECOMES_CONTEXT && ICP.MOMENTUM_SCORE_BECOMES_CONTEXT,
    positionMultiplier: ICP.POSITION_SIZE,
    stopMultiplier: ICP.STOP_MULTIPLIER,
    reason: `IMPULSE_CONTINUATION: ADX=${adx.toFixed(1)}, move=${priceMovePct.toFixed(2)}%`,
  };
};

// ============= SHARED DATA EXTRACTION HELPERS =============
// IMPROVEMENT: Centralized extraction to ensure consistency across all edge functions
// Used by: strategy-analyzer, execute-trade, monitor-positions
// Types defined in: trend-types.ts

import type { 
  PartialTrendData, 
  ADXExtractionResult, 
  ADXSlopeResult, 
  StochRsiExtractionResult 
} from "./trend-types.ts";

/**
 * Extract ADX value from trend data with support for both number and object formats.
 * Provides consistent extraction pattern across all edge functions.
 * @param trendData - The trend data response (typed as PartialTrendData for flexibility)
 * @param defaultValue - Default value if ADX cannot be extracted (default: 20)
 * @returns The extracted ADX value
 */
export const extractADX = (trendData: PartialTrendData | any, defaultValue: number = 20): number => {
  // Primary path: volatility.adx
  const volatilityAdx = trendData?.volatility?.adx;
  if (typeof volatilityAdx === 'number' && !isNaN(volatilityAdx)) {
    return volatilityAdx;
  }
  // Handle object format (some responses may have {value: number})
  if (typeof volatilityAdx === 'object' && volatilityAdx !== null) {
    const objValue = (volatilityAdx as any).value;
    if (typeof objValue === 'number' && !isNaN(objValue)) {
      return objValue;
    }
  }
  
  // Fallback path: momentum.adx
  const momentumAdx = (trendData?.momentum as any)?.adx;
  if (typeof momentumAdx === 'number' && !isNaN(momentumAdx)) {
    return momentumAdx;
  }
  
  return defaultValue;
};

/**
 * Extract ADX value with detailed source information for debugging.
 * @param trendData - The trend data response
 * @param defaultValue - Default value if ADX cannot be extracted
 * @returns Object with ADX value and source path
 */
export const extractADXWithSource = (
  trendData: PartialTrendData | any, 
  defaultValue: number = 20
): ADXExtractionResult => {
  const volatilityAdx = trendData?.volatility?.adx;
  if (typeof volatilityAdx === 'number' && !isNaN(volatilityAdx)) {
    return { adx: volatilityAdx, source: 'volatility' };
  }
  if (typeof volatilityAdx === 'object' && volatilityAdx !== null) {
    const objValue = (volatilityAdx as any).value;
    if (typeof objValue === 'number' && !isNaN(objValue)) {
      return { adx: objValue, source: 'volatility' };
    }
  }
  
  const momentumAdx = (trendData?.momentum as any)?.adx;
  if (typeof momentumAdx === 'number' && !isNaN(momentumAdx)) {
    return { adx: momentumAdx, source: 'direct' };
  }
  
  return { adx: defaultValue, source: 'default' };
};

/**
 * Extract ADX slope and rising status from trend data.
 * Returns { slope, isRising } for momentum calculations.
 * @param trendData - The trend data response
 * @returns ADX slope result with slope value and rising flag
 */
export const extractADXSlope = (trendData: PartialTrendData | any): ADXSlopeResult => {
  // Check volatility path first
  const volatilitySlope = (trendData?.volatility as any)?.adxSlope;
  if (typeof volatilitySlope === 'number' && !isNaN(volatilitySlope)) {
    return { 
      slope: volatilitySlope, 
      isRising: volatilitySlope > 0,
      source: 'adxSlope'
    };
  }
  
  // Fallback to momentum path
  const momentumSlope = (trendData?.momentum as any)?.adxSlope;
  if (typeof momentumSlope === 'number' && !isNaN(momentumSlope)) {
    return { 
      slope: momentumSlope, 
      isRising: momentumSlope > 0,
      source: 'momentum'
    };
  }
  
  // Use adxRising flag if slope not available
  const adxRising = trendData?.momentum?.adxRising === true;
  return { 
    slope: 0, 
    isRising: adxRising,
    source: adxRising ? 'momentum' : 'default'
  };
};

/**
 * Extract StochRSI K value from trend data with consistent fallback chain.
 * Supports multiple extraction paths and timeframes.
 * @param trendData - The trend data response
 * @param timeframe - Target timeframe ('4h', '1h', '30m', '15m')
 * @param defaultValue - Default value if K cannot be extracted (default: 50)
 * @returns The extracted StochRSI K value
 */
export const extractStochRsiK = (
  trendData: PartialTrendData | any, 
  timeframe: '4h' | '1h' | '30m' | '15m' = '4h',
  defaultValue: number = 50
): number => {
  // Path 1: stochasticRsi.[timeframe].k
  const stochRsiPath = trendData?.stochasticRsi?.[timeframe]?.k;
  if (typeof stochRsiPath === 'number' && !isNaN(stochRsiPath)) {
    return stochRsiPath;
  }
  
  // Path 2: timeframes.[timeframe].indicators.stochRsi.k
  const indicatorsPath = (trendData?.timeframes as any)?.[timeframe]?.indicators?.stochRsi?.k;
  if (typeof indicatorsPath === 'number' && !isNaN(indicatorsPath)) {
    return indicatorsPath;
  }
  
  // Path 3: Aggregated fallback (for 4h primarily)
  if (timeframe === '4h') {
    const aggregatedPath = (trendData?.stochasticRsi as any)?.aggregated?.k;
    if (typeof aggregatedPath === 'number' && !isNaN(aggregatedPath)) {
      return aggregatedPath;
    }
  }
  
  return defaultValue;
};

/**
 * Extract StochRSI D value from trend data with consistent fallback chain.
 * @param trendData - The trend data response
 * @param timeframe - Target timeframe ('4h', '1h', '30m', '15m')
 * @param defaultValue - Default value if D cannot be extracted (default: 50)
 * @returns The extracted StochRSI D value
 */
export const extractStochRsiD = (
  trendData: PartialTrendData | any, 
  timeframe: '4h' | '1h' | '30m' | '15m' = '4h',
  defaultValue: number = 50
): number => {
  const stochRsiPath = trendData?.stochasticRsi?.[timeframe]?.d;
  if (typeof stochRsiPath === 'number' && !isNaN(stochRsiPath)) {
    return stochRsiPath;
  }
  
  const indicatorsPath = (trendData?.timeframes as any)?.[timeframe]?.indicators?.stochRsi?.d;
  if (typeof indicatorsPath === 'number' && !isNaN(indicatorsPath)) {
    return indicatorsPath;
  }
  
  if (timeframe === '4h') {
    const aggregatedPath = (trendData?.stochasticRsi as any)?.aggregated?.d;
    if (typeof aggregatedPath === 'number' && !isNaN(aggregatedPath)) {
      return aggregatedPath;
    }
  }
  
  return defaultValue;
};

/**
 * Extract both StochRSI K and D values with source information.
 * Useful for debugging data extraction issues.
 */
export const extractStochRsiWithSource = (
  trendData: PartialTrendData | any,
  timeframe: '4h' | '1h' | '30m' | '15m' = '4h'
): StochRsiExtractionResult => {
  // Try stochasticRsi path
  const stochRsi = trendData?.stochasticRsi?.[timeframe];
  if (stochRsi && typeof stochRsi.k === 'number') {
    return { 
      k: stochRsi.k, 
      d: stochRsi.d ?? 50, 
      source: `stochasticRsi.${timeframe}` 
    };
  }
  
  // Try timeframes path
  const indicators = (trendData?.timeframes as any)?.[timeframe]?.indicators?.stochRsi;
  if (indicators && typeof indicators.k === 'number') {
    return { 
      k: indicators.k, 
      d: indicators.d ?? 50, 
      source: `timeframes.${timeframe}.indicators` 
    };
  }
  
  // Aggregated fallback for 4h
  if (timeframe === '4h') {
    const aggregated = (trendData?.stochasticRsi as any)?.aggregated;
    if (aggregated && typeof aggregated.k === 'number') {
      return { 
        k: aggregated.k, 
        d: aggregated.d ?? 50, 
        source: 'stochasticRsi.aggregated' 
      };
    }
  }
  
  return { k: 50, d: 50, source: 'default' };
};

/**
 * Extract ATR percent from trend data with consistent fallback.
 * Uses unified default of 1.5 (aligned across all functions).
 * @param trendData - The trend data response
 * @param defaultValue - Default value if ATR% cannot be extracted (default: 1.5)
 * @returns The extracted ATR percent value
 */
export const extractAtrPercent = (trendData: PartialTrendData | any, defaultValue: number = 1.5): number => {
  const atrPercent = trendData?.volatility?.atrPercent;
  if (typeof atrPercent === 'number' && !isNaN(atrPercent)) {
    return atrPercent;
  }
  return defaultValue;
};

/**
 * Extract raw ATR value from trend data.
 * @param trendData - The trend data response
 * @param defaultValue - Default value if ATR cannot be extracted (default: 0)
 * @returns The extracted ATR value
 */
export const extractAtr = (trendData: PartialTrendData | any, defaultValue: number = 0): number => {
  const atr = trendData?.volatility?.atr;
  if (typeof atr === 'number' && !isNaN(atr)) {
    return atr;
  }
  return defaultValue;
};

/**
 * Extract price change percent for a specific timeframe.
 * Used for move exhaustion and flash crash detection.
 * @param trendData - The trend data response
 * @param timeframe - Target timeframe ('4h' or '24h')
 * @returns The price change percent for the specified timeframe
 */
export const extractPriceChange = (trendData: PartialTrendData | any, timeframe: '4h' | '24h' = '4h'): number => {
  if (timeframe === '4h') {
    return (trendData as any)?.priceChange?.percent4h ?? 0;
  }
  return (trendData as any)?.priceChange?.percent24h ?? 0;
};

/**
 * Extract momentum state from trend data.
 * @param trendData - The trend data response
 * @returns The momentum state or 'none' if not available
 */
export const extractMomentumState = (
  trendData: PartialTrendData | any
): 'none' | 'mixed' | 'confirmed' | 'building' | 'exhausted' => {
  const state = trendData?.momentum?.state;
  if (state === 'none' || state === 'mixed' || state === 'confirmed' || 
      state === 'building' || state === 'exhausted') {
    return state;
  }
  return 'none';
};

/**
 * Extract current price from trend data.
 * @param trendData - The trend data response
 * @param defaultValue - Default value if price cannot be extracted (default: 0)
 * @returns The current price
 */
export const extractCurrentPrice = (trendData: PartialTrendData | any, defaultValue: number = 0): number => {
  const price = trendData?.currentPrice;
  if (typeof price === 'number' && !isNaN(price) && price > 0) {
    return price;
  }
  return defaultValue;
};

/**
 * Extract timeframe trend data.
 * @param trendData - The trend data response
 * @param timeframe - Target timeframe ('4h', '1h', '30m', '15m')
 * @returns Object with trend direction and confidence
 */
export const extractTimeframeTrend = (
  trendData: PartialTrendData | any,
  timeframe: '4h' | '1h' | '30m' | '15m'
): { trend: string; confidence: number } => {
  const tf = trendData?.timeframes?.[timeframe];
  return {
    trend: tf?.trend ?? 'neutral',
    confidence: tf?.confidence ?? 0,
  };
};
