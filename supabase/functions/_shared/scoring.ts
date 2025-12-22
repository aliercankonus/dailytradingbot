// ============= CENTRALIZED SCORING MODULE =============
// Single source of truth for quality score and reversal score calculations
// Used by: strategy-analyzer, execute-trade, monitor-positions

import { ADX_THRESHOLDS, ADX_PHASES, STOCHRSI_THRESHOLDS, RSI_THRESHOLDS, CONFIDENCE_THRESHOLDS, BREAKOUT_MODE_PARAMS, type AdxPhase } from "./constants.ts";

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
    return 1;
  }
  
  // PARTIAL CREDIT: At least average volume (volumeRatio >= 1.0)
  // This prevents zero volume score in normal market conditions
  if (volumeRatio >= 1.0) {
    return 1;  // NEW: Baseline credit for average volume
  }
  
  // Neutral trend - no volume penalty
  if (trend === "neutral") {
    return 1;
  }
  
  // Low volume in directional trend - no bonus
  return 0;
};

// ============= CONFIDENCE PENALTY =============
// High confidence = trend exhaustion, penalize entries
// Optimal entry zone: 50-60% confidence (trend confirmed but not exhausted)
export const getConfidencePenalty = (
  confidence: number, 
  adx: number = 0, 
  momentumConfirmed: boolean = false
): number => {
  // Calculate base penalty
  let basePenalty = 0;
  if (confidence >= CONFIDENCE_THRESHOLDS.PENALTY_HEAVY) basePenalty = -25;
  else if (confidence >= CONFIDENCE_THRESHOLDS.PENALTY_STRONG) basePenalty = -18;
  else if (confidence >= CONFIDENCE_THRESHOLDS.PENALTY_MODERATE) basePenalty = -12;
  else if (confidence >= CONFIDENCE_THRESHOLDS.PENALTY_LIGHT) basePenalty = -8;
  else if (confidence >= CONFIDENCE_THRESHOLDS.DEAD_ZONE_LOWER) basePenalty = -12;  // DEAD ZONE: 60-69
  else if (confidence >= CONFIDENCE_THRESHOLDS.OPTIMAL_LOWER) basePenalty = 0;       // Optimal: 50-59
  else basePenalty = -3;  // Too low confidence
  
  // Reduce penalty for favorable conditions (prevents double punishment)
  if (basePenalty < 0) {
    let reductionFactor = 1.0;
    
    // Strong trend (ADX ≥ 30) reduces penalty by 40%
    if (adx >= ADX_THRESHOLDS.VERY_STRONG) {
      reductionFactor -= 0.4;
    }
    // Confirmed momentum reduces penalty by 30%
    if (momentumConfirmed) {
      reductionFactor -= 0.3;
    }
    // Cap reduction at 60%
    reductionFactor = Math.max(0.4, reductionFactor);
    
    return Math.round(basePenalty * reductionFactor);
  }
  
  return basePenalty;
};

// ============= ADX SCORE (0-25 points) =============
export const getAdxScore = (adx: number): number => {
  if (adx >= ADX_THRESHOLDS.EXTREME) return 25;
  if (adx >= ADX_THRESHOLDS.VERY_STRONG) return 22;
  if (adx >= ADX_THRESHOLDS.STRONG) return 18;
  if (adx >= ADX_THRESHOLDS.MINIMUM) return 14;
  if (adx >= ADX_THRESHOLDS.WEAK) return 8;
  if (adx >= ADX_THRESHOLDS.VERY_WEAK) return 4;
  return 0;
};

// ============= MOMENTUM SCORE (0-20 points) =============
export const getMomentumScore = (momentum: any): number => {
  if (!momentum) return 0;
  
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
    score = 8;  // IMPROVED: Was 6, now 8 for mixed + MACD expanding + confirms
  } else if (state === "mixed" && macdExpanding) {
    score = 6;  // NEW: Mixed + MACD expanding (without confirms) = 6 pts
  } else if (building && macdExpanding) {
    score = 4;
  } else if (state === "mixed") {
    score = 2;
  } else if (macdExpanding) {
    score = 2;
  } else {
    score = 0;
  }
  
  // Volume bonus
  if (volumeConfirms) score += 4;
  
  return Math.min(20, score);
};

// ============= ALIGNMENT SCORE (0-14 points) =============
// Directional consistency only - confidence logic is in getConfidencePenalty
export const getAlignmentScore = (
  confidence: number, 
  consistency: number, 
  aligned: boolean, 
  trendData: any
): number => {
  let score = 0;
  
  // Full alignment bonus (0-8)
  if (aligned) {
    score += 8;
  } else {
    // Partial alignment check - use correct field paths from calculate-trend
    const tf = trendData?.timeframes;
    if (tf) {
      const trend4h = tf['4h']?.trend || "neutral";
      const trend1h = tf['1h']?.trend || "neutral";
      const trend30m = tf['30m']?.trend || "neutral";
      
      // 4h neutral with 1h+30m aligned = partial alignment
      if (trend4h === "neutral" && trend1h === trend30m && trend1h !== "neutral") {
        score += 5;
      }
      // 1h and 30m agree but different from 4h
      else if (trend1h === trend30m && trend1h !== "neutral") {
        score += 3;
      }
    }
  }
  
  // Consistency component (0-6)
  if (consistency >= 75) score += 6;
  else if (consistency >= 65) score += 5;
  else if (consistency >= 55) score += 3;
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

export interface UnifiedReversalResult {
  score: number;
  decision: "BLOCK" | "REDUCE" | "NORMAL";
  positionSizeMultiplier: number;
  reasons: string[];
  adxWeight: number;
  breakdown?: {
    stochRsiScore: number;
    stochRsiZoneScore: number;
    momentumScore: number;
    macdScore: number;
    timeframeScore: number;
    volumeScore: number;
  };
}

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
  
  // Initialize breakdown
  const breakdown = {
    stochRsiScore: 0,
    stochRsiZoneScore: 0,
    momentumScore: 0,
    macdScore: 0,
    timeframeScore: 0,
    volumeScore: 0,
  };
  
  // 1. StochRSI CROSS SIGNALS (0-50 points)
  const stochSignals = countOpposingStochSignals(trendData, signalType);
  
  if (stochSignals.opposingCrossCount >= 3) {
    breakdown.stochRsiScore = 50;
    reasons.push(`${stochSignals.opposingCrossCount} opposing StochRSI crosses`);
  } else if (stochSignals.opposingCrossCount >= 2) {
    breakdown.stochRsiScore = 40;
    reasons.push(`${stochSignals.opposingCrossCount} opposing StochRSI crosses`);
  } else if (stochSignals.opposingCrossCount >= 1) {
    breakdown.stochRsiScore = 30;
    reasons.push(`Opposing StochRSI cross`);
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
  
  // 3. MOMENTUM STATE (0-30 points)
  // RELAXED: Allow "none" state with reduced penalty when ADX >= 28 (strong trend exception)
  const isStrongTrendException = adx >= ADX_THRESHOLDS.STRONG_TREND_EXCEPTION; // 28+ (relaxed from 30)
  
  // Check "mixed" state FIRST (highest penalty) - prevents premature catch by other conditions
  if (momentumState === "mixed") {
    if (adx < ADX_THRESHOLDS.STRONG_TREND_EXCEPTION) {
      breakdown.momentumScore = 30;
      reasons.push(`Mixed momentum with weak ADX`);
    } else {
      breakdown.momentumScore = 15;
      reasons.push(`Mixed momentum (ADX allows)`);
    }
  } else if (momentumState === "none") {
    if (isStrongTrendException) {
      // Strong trend exception - reduced penalty for early entries
      breakdown.momentumScore = 10;
      reasons.push(`No momentum but strong trend (ADX=${adx.toFixed(1)} >= 28)`);
    } else {
      breakdown.momentumScore = 25;
      reasons.push(`Momentum not confirmed (state: ${momentumState})`);
    }
  } else if (!momentumConfirms && momentumState !== "building") {
    if (isStrongTrendException) {
      breakdown.momentumScore = 8;
      reasons.push(`Momentum unconfirmed but strong trend (ADX=${adx.toFixed(1)})`);
    } else {
      breakdown.momentumScore = 20;
      reasons.push(`Momentum state ${momentumState} not confirmed`);
    }
  } else if (momentumState === "building" && !momentumConfirms) {
    breakdown.momentumScore = 10;
    reasons.push("Momentum building but not confirmed");
  }
  
  // 4. MACD ALIGNMENT (0-15 points)
  if (momentum.hasDivergence) {
    breakdown.macdScore += 15;
    reasons.push("MACD divergence detected");
  } else if (!momentum.macdDirectionAligned) {
    breakdown.macdScore += 10;
    reasons.push("MACD direction misaligned");
  } else if (!momentum.macdExpanding) {
    breakdown.macdScore += 5;
    reasons.push("MACD not expanding");
  }
  
  // 5. TIMEFRAME CONFLICTS (0-20 points)
  if (isLong) {
    if (trend1h === "bearish") {
      breakdown.timeframeScore += 15;
      reasons.push("1h trend bearish (opposing LONG)");
    }
    if (trend4h === "bearish") {
      breakdown.timeframeScore += 5;
      reasons.push("4h trend bearish");
    }
  } else {
    if (trend1h === "bullish") {
      breakdown.timeframeScore += 15;
      reasons.push("1h trend bullish (opposing SHORT)");
    }
    if (trend4h === "bullish") {
      breakdown.timeframeScore += 5;
      reasons.push("4h trend bullish");
    }
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
  
  // Calculate total with ADX weight
  const rawScore = breakdown.stochRsiScore + breakdown.stochRsiZoneScore + 
                   breakdown.momentumScore + breakdown.macdScore + 
                   breakdown.timeframeScore + breakdown.volumeScore;
  
  const adxWeight = getAdxWeight(adx);
  
  // PHASE 1: Apply ADX phase exhaustion risk - increases reversal score by 50%
  let phaseMultiplier = 1.0;
  if (adxPhaseInfo.exhaustionRisk) {
    phaseMultiplier = adxPhaseInfo.reversalSensitivityMultiplier;  // 1.5 for exhaustion
    reasons.push(`ADX EXHAUSTION RISK (${adx.toFixed(1)}): reversal sensitivity +50%`);
  }
  
  totalScore = Math.min(100, Math.max(0, Math.round(rawScore * adxWeight * phaseMultiplier)));
  
  // Three-tier decision
  let decision: "BLOCK" | "REDUCE" | "NORMAL";
  let positionSizeMultiplier: number;
  
  if (totalScore >= 60) {
    decision = "BLOCK";
    positionSizeMultiplier = 0;
  } else if (totalScore >= 40) {
    decision = "REDUCE";
    positionSizeMultiplier = 0.5;
  } else {
    decision = "NORMAL";
    positionSizeMultiplier = 1.0;
  }
  
  // Log breakout mode if active (for monitoring)
  if (breakoutMode.isActive) {
    reasons.push(`BREAKOUT MODE ACTIVE: ${breakoutMode.confidence}% confidence`);
  }
  
  return { 
    score: totalScore, 
    decision, 
    positionSizeMultiplier,
    reasons, 
    adxWeight,
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
export type TradeDirection = "long" | "short";

export interface DirectionResult {
  direction: TradeDirection | null;
  confidence: number;
  source: string;  // Which timeframe/signal determined direction
  reasons: string[];
}

export const deriveTradeDirection = (
  trendData: any,
  primaryTrend: string
): DirectionResult => {
  const reasons: string[] = [];
  
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
  
  // Priority 3: 4h neutral but 1h+30m aligned
  if (trend4h === "neutral" && trend1h === trend30m && trend1h !== "neutral") {
    const direction: TradeDirection = trend1h === "bullish" ? "long" : "short";
    const avgConf = (conf1h + conf30m) / 2;
    reasons.push(`1h+30m aligned ${trend1h} (avg ${avgConf.toFixed(0)}% confidence)`);
    reasons.push("4h neutral - lower timeframes determining direction");
    return { direction, confidence: avgConf, source: "1h+30m", reasons };
  }
  
  // Priority 4: Fall back to primary trend from 5m if directional
  if (primaryTrend === "bullish" || primaryTrend === "bearish") {
    const direction: TradeDirection = primaryTrend === "bullish" ? "long" : "short";
    const primaryConf = trendData.confidence || 50;
    reasons.push(`Primary trend ${primaryTrend} (${primaryConf.toFixed(0)}% confidence)`);
    reasons.push("Warning: Using primary trend as fallback - lower conviction");
    return { direction, confidence: primaryConf * 0.8, source: "primary", reasons };
  }
  
  // No clear direction
  reasons.push("All timeframes neutral or conflicting");
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
  const confidence = trendData?.confidence || 50;
  const consistency = trendData?.trueAlignment?.score || 50;
  const momentum = trendData?.momentum || {};
  const aligned = trendData?.isAligned ?? false;
  
  const volumeConfirms = momentum.volumeConfirms || false;
  const volumeSpike = momentum.volumeSpike || false;
  const volumeRatio = trendData?.volatility?.volumeRatio || momentum.volumeBoost || 1.0;
  const hasRangeExpansion = (trendData?.volatility?.relativeATR || 1) > 1.0;
  
  const adxScore = getAdxScore(adx);
  const momentumScore = getMomentumScore(momentum);
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
