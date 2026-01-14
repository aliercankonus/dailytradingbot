// ============= CENTRALIZED SCORING MODULE =============
// Single source of truth for quality score and reversal score calculations
// Used by: strategy-analyzer, execute-trade, monitor-positions

import { ADX_THRESHOLDS, ADX_PHASES, STOCHRSI_THRESHOLDS, RSI_THRESHOLDS, CONFIDENCE_THRESHOLDS, BREAKOUT_MODE_PARAMS, RISK_SEPARATION_THRESHOLDS, COMPONENT_CAPS, TIME_IN_EXTREME_PARAMS, TREND_STRENGTH_PARAMS, EXCEPTION_HIERARCHY, EXCEPTION_BUDGET, PRE_RECOVERY_PARAMS, REGIME_SCORE_PARAMS, STOCHRSI_DYNAMIC_PARAMS, MARKET_REGIME_CLASSIFIER, STRONG_ADX_UNIVERSAL_OVERRIDE_PARAMS, MOMENTUM_SCORE_BEHAVIOR_PARAMS, QUALITY_NEAR_MISS_BOOST_PARAMS, TREND_CONTINUATION_REENTRY_PARAMS, IMPULSE_CONTINUATION_PARAMS, type AdxPhase, type ExceptionType, type MasterMarketRegime } from "./constants.ts";

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
// Strong trends reduce reversal impact
export const getAdxWeight = (adxValue: number): number => {
  if (adxValue >= ADX_THRESHOLDS.EXTREME) return 0.4;      // Extreme trend
  if (adxValue >= ADX_THRESHOLDS.EXCEPTIONAL) return 0.5;  // Exceptional trend
  if (adxValue >= ADX_THRESHOLDS.VERY_STRONG) return 0.6;  // Very strong trend
  if (adxValue >= ADX_THRESHOLDS.STRONG) return 0.75;      // Strong trend
  if (adxValue >= ADX_THRESHOLDS.MINIMUM) return 0.85;     // Moderate trend
  return 1.0;  // Weak trend = full weight
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

export const calculateUnifiedReversalScore = (
  trendData: any, 
  signalType: string,
  symbol: string = "unknown"
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
  const rawTotalStochRSI = breakdown.stochRsiScore + breakdown.stochRsiZoneScore + breakdown.timeInExtremeScore;
  const cappedTotalStochRSI = Math.min(rawTotalStochRSI, STOCHRSI_DYNAMIC_PARAMS.MAX_STOCHRSI_PENALTY);
  
  // Calculate how much to reduce each component proportionally if cap is hit
  if (rawTotalStochRSI > cappedTotalStochRSI) {
    const reductionRatio = cappedTotalStochRSI / rawTotalStochRSI;
    breakdown.stochRsiScore = Math.round(breakdown.stochRsiScore * reductionRatio);
    breakdown.stochRsiZoneScore = Math.round(breakdown.stochRsiZoneScore * reductionRatio);
    breakdown.timeInExtremeScore = Math.round(breakdown.timeInExtremeScore * reductionRatio);
    reasons.push(`PHASE 4 CAP: Total StochRSI ${rawTotalStochRSI} → ${cappedTotalStochRSI} (MAX=${STOCHRSI_DYNAMIC_PARAMS.MAX_STOCHRSI_PENALTY})`);
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

// ============= SQUEEZE BREAKOUT VALIDATION =============
// Validates if a potential squeeze breakout setup is present
// Allows ADX gate bypass when conditions are met (ADX 18-20 range)
export interface SqueezeBreakoutResult {
  isValid: boolean;
  confidence: number;  // 0-100
  direction: "long" | "short" | null;
  positionSizeMultiplier: number;  // Reduced size for squeeze entries
  reasons: string[];
}

export const isValidSqueezeBreakout = (
  trendData: any,
  intendedDirection: "long" | "short" | null
): SqueezeBreakoutResult => {
  const reasons: string[] = [];
  let confidence = 0;
  
  if (!trendData || !intendedDirection) {
    return { isValid: false, confidence: 0, direction: null, positionSizeMultiplier: 1.0, reasons: ["No trend data or direction"] };
  }
  
  const adx = trendData?.volatility?.adx || 0;
  const bollinger = trendData?.bollingerBands || {};
  const momentum = trendData?.momentum || {};
  const stochRsi = trendData?.stochasticRsi || {};
  const timeframes = trendData?.timeframes || {};
  
  // Get 4H data for HTF confirmation
  const bb4h = bollinger['4h'] || bollinger;
  const squeeze4h = bb4h.squeeze || bb4h.squeezeActive || false;
  const percentB4h = bb4h.percentB ?? 50;
  const bandwidth4h = bb4h.bandwidth || 0;
  
  // Get 1H data
  const bb1h = bollinger['1h'] || {};
  const squeeze1h = bb1h.squeeze || bb1h.squeezeActive || false;
  const percentB1h = bb1h.percentB ?? 50;
  
  // Condition 1: HTF squeeze active (4h preferred, 1h acceptable)
  const hasHTFSqueeze = squeeze4h || squeeze1h;
  if (!hasHTFSqueeze) {
    return { isValid: false, confidence: 0, direction: null, positionSizeMultiplier: 1.0, reasons: ["No HTF squeeze detected"] };
  }
  
  if (squeeze4h) {
    confidence += 30;
    reasons.push("4h Bollinger squeeze active");
  } else if (squeeze1h) {
    confidence += 20;
    reasons.push("1h Bollinger squeeze active");
  }
  
  // Condition 2: Price at band edge (confirming breakout direction)
  const isLong = intendedDirection === "long";
  const priceAtCorrectEdge = isLong 
    ? (percentB4h > 70 || percentB1h > 70)  // Breaking upward
    : (percentB4h < 30 || percentB1h < 30);  // Breaking downward
  
  if (!priceAtCorrectEdge) {
    return { isValid: false, confidence: 0, direction: null, positionSizeMultiplier: 1.0, reasons: ["Price not at band edge for breakout direction"] };
  }
  confidence += 25;
  reasons.push(`Price at ${isLong ? "upper" : "lower"} band edge (%B4h=${percentB4h.toFixed(0)}, %B1h=${percentB1h.toFixed(0)})`);
  
  // Condition 3: Momentum building (MACD expanding or StochRSI crossing)
  const macdExpanding = momentum.macdExpanding ?? false;
  const momentumBuilding = momentum.state === "building" || momentum.state === "confirmed";
  const stoch4h = stochRsi['4h'] || {};
  const stoch1h = stochRsi['1h'] || {};
  const stochK4h = stoch4h.k ?? 50;
  const stochK1h = stoch1h.k ?? 50;
  
  // StochRSI should be moving in trade direction
  const stochDirectionOk = isLong 
    ? (stochK1h > 30 && stochK1h < 80)  // Not oversold, not extreme overbought
    : (stochK1h < 70 && stochK1h > 20);  // Not overbought, not extreme oversold
  
  if (!macdExpanding && !momentumBuilding && !stochDirectionOk) {
    return { isValid: false, confidence: 0, direction: null, positionSizeMultiplier: 1.0, reasons: ["No momentum building for squeeze breakout"] };
  }
  
  if (macdExpanding) {
    confidence += 20;
    reasons.push("MACD expanding");
  }
  if (momentumBuilding) {
    confidence += 15;
    reasons.push(`Momentum ${momentum.state}`);
  }
  
  // Condition 4: No reversal divergence (critical for squeeze entries)
  const hasDivergence = momentum.hasDivergence ?? false;
  if (hasDivergence) {
    return { isValid: false, confidence: 0, direction: null, positionSizeMultiplier: 1.0, reasons: ["Divergence detected - not safe for squeeze entry"] };
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
    return { isValid: false, confidence: 0, direction: null, positionSizeMultiplier: 1.0, reasons: [`4h trend (${trend4h}) opposes ${intendedDirection} direction`] };
  }
  
  // Bonus: 1h trend aligned
  const htf1hAligned = isLong ? trend1h === "bullish" : trend1h === "bearish";
  if (htf1hAligned) {
    confidence += 10;
    reasons.push(`1h trend aligned (${trend1h})`);
  }
  
  // Final validation: confidence must be >= 60 for squeeze breakout
  const isValid = confidence >= 60;
  
  // Squeeze breakout entries get 60-70% position size (reduced risk for ADX < 20 entries)
  const positionSizeMultiplier = isValid ? 0.65 : 1.0;
  
  if (isValid) {
    reasons.push(`Squeeze breakout confidence: ${confidence}%`);
  }
  
  return {
    isValid,
    confidence,
    direction: isValid ? intendedDirection : null,
    positionSizeMultiplier,
    reasons
  };
};

// ============= DERIVE TRADE DIRECTION =============
// Explicitly derives trade direction from multi-timeframe trend data
// Returns null if no clear direction can be determined
// PHASE 1 OPTIMIZATION: Now uses weighted direction derivation + persistence bonus
export type TradeDirection = "long" | "short";

export interface DirectionResult {
  direction: TradeDirection | null;
  confidence: number;
  source: string;  // Which timeframe/signal determined direction
  reasons: string[];
  isWeightedDerivation?: boolean;      // NEW: Used weighted sum
  hasPersistenceBonus?: boolean;       // NEW: Got persistence bonus
  orderFlowTiebreaker?: boolean;       // NEW: Order flow resolved tie
  positionSizeMultiplier?: number;     // NEW: Recommended position size
}

// Import direction params
import { GATE_RELAXATION_FLAGS, DIRECTION_DERIVATION_PARAMS } from "./constants.ts";

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
  
  // ============= NEW: PHASE 1 WEIGHTED DIRECTION DERIVATION =============
  // Instead of requiring one strong timeframe, use weighted sum of all timeframes
  // This relaxes the NO_CLEAR_DIRECTION gate significantly
  if (GATE_RELAXATION_FLAGS.DIRECTION_WEIGHTED) {
    // Convert trend to directional value: bullish=+1, neutral=0, bearish=-1
    const trendToValue = (trend: string, conf: number): number => {
      // Use lowered neutral threshold (45% instead of 55%)
      if (trend === "neutral" && conf < P.NEUTRAL_THRESHOLD) return 0;
      // Trends with conf 45-54% contribute partial weight
      const confWeight = Math.min(1, conf / 65);  // Scale 0-65% to 0-1
      if (trend === "bullish") return confWeight;
      if (trend === "bearish") return -confWeight;
      // For "neutral" but conf >= 45%, infer from nearby timeframes
      return 0;
    };
    
    const val4h = trendToValue(trend4h, conf4h);
    const val1h = trendToValue(trend1h, conf1h);
    const val30m = trendToValue(trend30m, conf30m);
    
    // Calculate weighted sum
    const weightedSum = (val4h * P.WEIGHT_4H) + (val1h * P.WEIGHT_1H) + (val30m * P.WEIGHT_30M);
    
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
    
    // Adjusted threshold with persistence bonus
    const effectiveThreshold = P.WEIGHTED_SUM_THRESHOLD - persistenceBonus;
    
    // If weighted sum exceeds threshold, derive direction
    if (Math.abs(weightedSum) >= effectiveThreshold) {
      const direction: TradeDirection = weightedSum > 0 ? "long" : "short";
      // Calculate confidence from weighted sum magnitude
      const derivedConf = Math.min(70, 50 + Math.abs(weightedSum) * 30);
      
      reasons.push(`WEIGHTED DIRECTION: Sum=${weightedSum.toFixed(2)} (threshold=${effectiveThreshold.toFixed(2)})`);
      reasons.push(`TF values: 4h=${val4h.toFixed(2)}*${P.WEIGHT_4H}, 1h=${val1h.toFixed(2)}*${P.WEIGHT_1H}, 30m=${val30m.toFixed(2)}*${P.WEIGHT_30M}`);
      
      return { 
        direction, 
        confidence: derivedConf, 
        source: "weighted-derivation", 
        reasons,
        isWeightedDerivation: true,
        hasPersistenceBonus: persistenceBonus > 0,
        positionSizeMultiplier: 0.75,  // Reduced position for weighted signals
      };
    }
    
    // ============= ORDER FLOW TIEBREAKER =============
    // When weighted sum is marginal (0.35-0.54), use order flow if strong
    if (Math.abs(weightedSum) >= 0.35 && Math.abs(weightedSum) < effectiveThreshold && orderFlowData) {
      const ofScore = orderFlowData.score;
      const ofSignal = orderFlowData.signal?.toLowerCase() || "";
      
      if (ofScore >= P.ORDER_FLOW_MIN_SCORE && (ofSignal === "strong_buy" || ofSignal === "strong_sell")) {
        const direction: TradeDirection = ofSignal === "strong_buy" ? "long" : "short";
        
        // Verify order flow agrees with weighted direction tendency
        const weightedDirection = weightedSum > 0 ? "long" : "short";
        if (direction === weightedDirection) {
          const derivedConf = Math.min(65, 50 + ofScore * 0.2);
          reasons.push(`ORDER FLOW TIEBREAKER: weightedSum=${weightedSum.toFixed(2)} marginal, orderFlow=${ofScore} ${ofSignal}`);
          reasons.push(`Order flow confirms weighted direction → allowing entry with reduced size`);
          
          return {
            direction,
            confidence: derivedConf,
            source: "order-flow-tiebreaker",
            reasons,
            isWeightedDerivation: true,
            orderFlowTiebreaker: true,
            positionSizeMultiplier: P.ORDER_FLOW_POSITION_MULTIPLIER,
          };
        }
      }
    }
  }
  
  // ============= PRIORITY 0: PRICE ACTION MOMENTUM OVERRIDE =============
  // If price has moved strongly (2%+) in a clear direction, use that direction
  // even when all timeframes show neutral. This catches continuation moves.
  const priceActionMomentum = trendData.priceActionMomentum;
  if (priceActionMomentum?.canOverrideNeutralAlignment && priceActionMomentum?.hasStrongMove) {
    const priceDirection = priceActionMomentum.direction;
    const movePercent = Math.abs(priceActionMomentum.movePercent || 0);
    
    // Only override if direction is clear (not neutral)
    if (priceDirection === "bullish" || priceDirection === "bearish") {
      const direction: TradeDirection = priceDirection === "bullish" ? "long" : "short";
      const isStrongMove = priceActionMomentum.isStrongMove;
      
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
      };
    }
  }
  
  // Priority 1: Use 4h trend if directional with decent confidence
  if (trend4h !== "neutral" && conf4h >= 55) {
    const direction: TradeDirection = trend4h === "bullish" ? "long" : "short";
    reasons.push(`4h trend ${trend4h} (${conf4h.toFixed(0)}% confidence)`);
    return { direction, confidence: conf4h, source: "4h", reasons };
  }
  
  // Priority 2: Use 1h trend if strong and directional
  if (trend1h !== "neutral" && conf1h >= 60) {
    const direction: TradeDirection = trend1h === "bullish" ? "long" : "short";
    reasons.push(`1h trend ${trend1h} (${conf1h.toFixed(0)}% confidence)`);
    
    // Warn if 4h is opposing
    if (trend4h !== "neutral" && trend4h !== trend1h) {
      reasons.push(`Warning: 4h trend ${trend4h} opposes 1h`);
    }
    
    return { direction, confidence: conf1h, source: "1h", reasons };
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
      } as DirectionResult;
    }
  }
  
  // Priority 3: 4h neutral but 1h+30m aligned
  if (trend4h === "neutral" && trend1h === trend30m && trend1h !== "neutral") {
    const direction: TradeDirection = trend1h === "bullish" ? "long" : "short";
    const avgConf = (conf1h + conf30m) / 2;
    reasons.push(`1h+30m aligned ${trend1h} (avg ${avgConf.toFixed(0)}% confidence)`);
    reasons.push("4h neutral - lower timeframes determining direction");
    return { direction, confidence: avgConf, source: "1h+30m", reasons };
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
      reasons.push(`2+ of 3 TFs bullish (${bullishTfs.map(t => t.tf).join('+')}) with 4h included`);
      reasons.push(`Avg confidence: ${avgConf.toFixed(0)}%`);
      return { direction: "long", confidence: avgConf * 0.9, source: "2-of-3", reasons };
    }
    
    if (has4h && bearishTfs.length >= 2) {
      const avgConf = bearishTfs.reduce((sum, t) => sum + t.conf, 0) / bearishTfs.length;
      reasons.push(`2+ of 3 TFs bearish (${bearishTfs.map(t => t.tf).join('+')}) with 4h included`);
      reasons.push(`Avg confidence: ${avgConf.toFixed(0)}%`);
      return { direction: "short", confidence: avgConf * 0.9, source: "2-of-3", reasons };
    }
    
    if (trend4h !== "neutral" && conf4h >= 50) {
      const agreeing = directionalTimeframes.filter(t => t.trend === trend4h);
      if (agreeing.length >= 2) {
        const direction: TradeDirection = trend4h === "bullish" ? "long" : "short";
        const avgConf = agreeing.reduce((sum, t) => sum + t.conf, 0) / agreeing.length;
        reasons.push(`4h ${trend4h} with ${agreeing.length - 1} supporting TFs`);
        return { direction, confidence: avgConf * 0.85, source: "4h+support", reasons };
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
      };
    }
  }
  
  // Priority 6: Fall back to primary trend from 5m if directional
  if (primaryTrend === "bullish" || primaryTrend === "bearish") {
    const direction: TradeDirection = primaryTrend === "bullish" ? "long" : "short";
    const primaryConf = trendData.confidence || 50;
    reasons.push(`Primary trend ${primaryTrend} (${primaryConf.toFixed(0)}% confidence)`);
    reasons.push("Warning: Using primary trend as fallback - lower conviction");
    return { direction, confidence: primaryConf * 0.8, source: "primary", reasons };
  }
  
  // No clear direction - but log what we tried
  reasons.push("All timeframes neutral or conflicting after weighted derivation");
  reasons.push(`4h: ${trend4h} (${conf4h}%), 1h: ${trend1h} (${conf1h}%), 30m: ${trend30m} (${conf30m}%)`);
  return { direction: null, confidence: 0, source: "none", reasons };
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
}

export const classifyMasterRegime = (
  adx: number,
  adxSlope: number,
  driftPercent: number = 0,
  htf4hTrend: string = "neutral",
  htf1hTrend: string = "neutral",
  isExhausted: boolean = false
): MasterRegimeResult => {
  const RC = MARKET_REGIME_CLASSIFIER;
  const SAUO = STRONG_ADX_UNIVERSAL_OVERRIDE_PARAMS;
  
  // PARABOLIC: ADX >= 45 and not exhausted (or ADX >= 50 regardless)
  // In parabolic regime, ADX IS the confirmation - gates become context
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
    };
  }
  
  // STRONG_TREND: ADX 30-45 (or 40+ with Tier 1 override)
  // Gates are relaxed but not completely bypassed
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
  };
};

// ============= PHASE 2: ADX-AWARE MOMENTUM THRESHOLD =============
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
