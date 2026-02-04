// ============= STRATEGY-INDEPENDENT ADAPTIVE SIGNAL GENERATION =============
// This module replaces the 12+ strategy templates with a unified adaptive engine
// that generates signals purely based on market conditions and technical indicators.
//
// KEY PRINCIPLES:
// 1. No named strategies - signals are generated from indicator confluence
// 2. Direction determined by HTF alignment + momentum + ADX
// 3. Risk parameters adapt dynamically to market conditions
// 4. Entry types classified for logging/analytics only (not for logic)

import { ADX_THRESHOLDS, STOCHRSI_THRESHOLDS, QUALITY_THRESHOLDS } from "./constants.ts";

// ============= TYPE DEFINITIONS =============

export interface AdaptiveSignalResult {
  direction: 'long' | 'short';
  entryType: AdaptiveEntryType;
  stopLossPercent: number;
  takeProfitPercent: number;
  positionSizeMultiplier: number;
  confidence: number;
  reason: string;
  qualityFactors: AdaptiveQualityFactors;
}

export interface AdaptiveQualityFactors {
  htfAlignment: number;      // 0-25 points for 4h+1h alignment
  adxStrength: number;       // 0-20 points for ADX quality
  momentumConfirmation: number; // 0-20 points for momentum
  technicalSetup: number;    // 0-15 points for technical indicators
  reversalProtection: number; // -20 to 0 points for reversal risk
  volumeConfirmation: number; // 0-10 points for volume
  orderFlowAlignment: number; // -10 to +10 points for order flow
}

export type AdaptiveEntryType = 
  | 'STRONG_TREND_CONTINUATION'  // ADX >= 35, clear HTF alignment
  | 'TREND_FOLLOWING'            // ADX 25-35, HTF directional
  | 'EARLY_MOMENTUM'             // ADX 18-25, momentum building
  | 'MOMENTUM_BREAKOUT'          // ADX rising + momentum confirmed
  | 'PULLBACK_ENTRY'             // Pullback in established trend
  | 'NEUTRAL_BREAKOUT'           // Breaking out of neutral
  | 'RANGE_BOUNCE'               // Mean reversion in ranging market
  | 'ADAPTIVE_ENTRY';            // General fallback classification

export interface AdaptiveContext {
  // Trend data
  htfTrend4h: string;
  htfTrend1h: string;
  htfConf4h: number;
  htfConf1h: number;
  primaryTrend: string;
  trendConsistency: number;
  
  // ADX data
  adx: number;
  adxSlope: number;
  adxRising: boolean;
  diGap: number;
  
  // Momentum data
  momentumScore: number;
  momentumState: string;
  momentumConfirms: boolean;
  macdHistogram: number;
  macdExpanding: boolean;
  
  // StochRSI data
  stochRsiK: number;
  stochRsiD: number;
  stochRsiTrend: string;
  
  // Bollinger data
  percentB: number;
  bbSqueeze: boolean;
  
  // Reversal data
  reversalScore: number;
  
  // Volume data
  volumeConfirms: boolean;
  volumeRatio: number;
  
  // Order flow
  orderFlowScore: number;
  orderFlowSignal: string;
  
  // Pullback analysis
  isPullback: boolean;
  pullbackDepth: number;
  entryTimingScore: number;
  
  // Price action
  priceMove6h: number;
  
  // Current price
  currentPrice: number;
  atr: number;
}

// ============= ADAPTIVE DIRECTION DETERMINATION =============
// Pure indicator-based direction detection - no strategy dependencies

export const determineAdaptiveDirection = (
  ctx: AdaptiveContext
): { direction: 'long' | 'short'; confidence: number; reason: string } | null => {
  const {
    htfTrend4h, htfTrend1h, htfConf4h, htfConf1h,
    adx, adxRising, momentumScore, momentumState, momentumConfirms,
    macdHistogram, macdExpanding, primaryTrend, trendConsistency,
    stochRsiK, reversalScore, orderFlowScore, orderFlowSignal,
    atr  // Added for ATR-normalized MACD threshold
  } = ctx;

  // ===== CASE 1: Strong 4h trend - follow it unambiguously =====
  if (htfTrend4h === 'bullish' && adx >= ADX_THRESHOLDS.STRONG) {
    return {
      direction: 'long',
      confidence: Math.min(95, htfConf4h + 10),
      reason: `Strong 4h bullish trend (ADX=${adx.toFixed(1)}, conf=${htfConf4h}%)`
    };
  }
  if (htfTrend4h === 'bearish' && adx >= ADX_THRESHOLDS.STRONG) {
    return {
      direction: 'short',
      confidence: Math.min(95, htfConf4h + 10),
      reason: `Strong 4h bearish trend (ADX=${adx.toFixed(1)}, conf=${htfConf4h}%)`
    };
  }

  // ===== CASE 2: 4h directional with moderate ADX =====
  if (htfTrend4h === 'bullish' && adx >= ADX_THRESHOLDS.MINIMUM) {
    // Require 1h alignment or neutral (not opposing)
    if (htfTrend1h !== 'bearish') {
      return {
        direction: 'long',
        confidence: Math.min(85, htfConf4h),
        reason: `4h bullish trend (ADX=${adx.toFixed(1)}, 1h=${htfTrend1h})`
      };
    }
  }
  if (htfTrend4h === 'bearish' && adx >= ADX_THRESHOLDS.MINIMUM) {
    if (htfTrend1h !== 'bullish') {
      return {
        direction: 'short',
        confidence: Math.min(85, htfConf4h),
        reason: `4h bearish trend (ADX=${adx.toFixed(1)}, 1h=${htfTrend1h})`
      };
    }
  }

  // ===== CASE 2.5: Confirmed momentum with MACD direction ===== (NEW - Phase 1)
  // When HTF is neutral but momentum is confirmed and MACD shows clear direction
  // NOTE: Use ATR-normalized MACD threshold for consistent behavior across assets
  // Threshold 0.05 means MACD must be at least 5% of ATR to be considered significant
  const macdNormalizedForDirection = atr > 0 ? macdHistogram / atr : macdHistogram;
  const MACD_DIRECTION_THRESHOLD = 0.05;  // 5% of ATR
  
  if (htfTrend4h === 'neutral' && momentumConfirms && macdExpanding) {
    if (macdNormalizedForDirection < -MACD_DIRECTION_THRESHOLD && adx >= ADX_THRESHOLDS.MINIMUM) {
      return {
        direction: 'short',
        confidence: 70,
        reason: `Confirmed bearish momentum (MACD normalized=${macdNormalizedForDirection.toFixed(3)}, ADX=${adx.toFixed(1)}, expanding)`
      };
    }
    if (macdNormalizedForDirection > MACD_DIRECTION_THRESHOLD && adx >= ADX_THRESHOLDS.MINIMUM) {
      return {
        direction: 'long',
        confidence: 70,
        reason: `Confirmed bullish momentum (MACD normalized=${macdNormalizedForDirection.toFixed(3)}, ADX=${adx.toFixed(1)}, expanding)`
      };
    }
  }

  // ===== CASE 2.7: High trend consistency with moderate ADX ===== (NEW - Phase 5)
  // When primary trend direction is clear and trend consistency is high
  if (trendConsistency >= 60 && adx >= ADX_THRESHOLDS.MINIMUM) {
    if (primaryTrend === 'bearish') {
      return {
        direction: 'short',
        confidence: 68,
        reason: `High trend consistency bearish (${trendConsistency}%, ADX=${adx.toFixed(1)})`
      };
    }
    if (primaryTrend === 'bullish') {
      return {
        direction: 'long',
        confidence: 68,
        reason: `High trend consistency bullish (${trendConsistency}%, ADX=${adx.toFixed(1)})`
      };
    }
  }

  // ===== CASE 3: 4h neutral but 1h directional with momentum =====
  if (htfTrend4h === 'neutral' && adx >= ADX_THRESHOLDS.WEAK) {
    if (htfTrend1h === 'bullish' && htfConf1h >= 60 && momentumScore >= 15) {
      return {
        direction: 'long',
        confidence: Math.min(75, htfConf1h),
        reason: `1h bullish with momentum (conf=${htfConf1h}%, momentum=${momentumScore})`
      };
    }
    if (htfTrend1h === 'bearish' && htfConf1h >= 60 && momentumScore <= -15) {
      return {
        direction: 'short',
        confidence: Math.min(75, htfConf1h),
        reason: `1h bearish with momentum (conf=${htfConf1h}%, momentum=${momentumScore})`
      };
    }
  }

  // ===== CASE 4: Momentum override (both HTFs neutral) ===== (UPDATED - Phase 2)
  // REDUCED threshold from 35 to 20 for faster breakout detection
  if (htfTrend4h === 'neutral' && htfTrend1h === 'neutral') {
    if (momentumScore >= 20 && adxRising && adx >= ADX_THRESHOLDS.WEAK) {
      return {
        direction: 'long',
        confidence: 65,
        reason: `Bullish momentum breakout (score=${momentumScore}, ADX rising)`
      };
    }
    if (momentumScore <= -20 && adxRising && adx >= ADX_THRESHOLDS.WEAK) {
      return {
        direction: 'short',
        confidence: 65,
        reason: `Bearish momentum breakout (score=${momentumScore}, ADX rising)`
      };
    }
  }

  // ===== CASE 5: Order flow direction when trends unclear =====
  if (htfTrend4h === 'neutral' && orderFlowScore >= 50) {
    if (orderFlowSignal === 'bullish' && stochRsiK < 75) {
      return {
        direction: 'long',
        confidence: 60,
        reason: `Order flow bullish breakout (score=${orderFlowScore})`
      };
    }
    if (orderFlowSignal === 'bearish' && stochRsiK > 25) {
      return {
        direction: 'short',
        confidence: 60,
        reason: `Order flow bearish breakout (score=${orderFlowScore})`
      };
    }
  }

  // ===== CASE 6: Mean reversion in low ADX environment =====
  if (adx < ADX_THRESHOLDS.WEAK && reversalScore < 30) {
    // Only allow mean reversion at extremes
    if (stochRsiK <= 15 && momentumState !== 'exhausted') {
      return {
        direction: 'long',
        confidence: 55,
        reason: `Mean reversion from oversold (K=${stochRsiK.toFixed(1)}, ADX=${adx.toFixed(1)})`
      };
    }
    if (stochRsiK >= 85 && momentumState !== 'exhausted') {
      return {
        direction: 'short',
        confidence: 55,
        reason: `Mean reversion from overbought (K=${stochRsiK.toFixed(1)}, ADX=${adx.toFixed(1)})`
      };
    }
  }

  // No clear direction - return null
  return null;
};

// ============= ADAPTIVE RISK PARAMETERS =============
// Dynamic stop-loss, take-profit, and position sizing based on conditions

export const calculateAdaptiveParameters = (
  direction: 'long' | 'short',
  ctx: AdaptiveContext
): { 
  stopLossPercent: number; 
  takeProfitPercent: number; 
  positionSizeMultiplier: number;
  tpMultiplier: number;
} => {
  const { adx, reversalScore, atr, momentumConfirms, htfConf4h, volumeConfirms } = ctx;

  // ===== BASE PARAMETERS =====
  let stopLossPercent = 2.5;
  let takeProfitPercent = 5.0;
  let positionSizeMultiplier = 1.0;
  let tpMultiplier = 2.0;  // R:R ratio

  // ===== ADX-BASED ADJUSTMENTS =====
  if (adx >= ADX_THRESHOLDS.EXTREME) {
    // Very strong trend: tighter stops, larger TP (expect continuation)
    stopLossPercent = 2.0;
    takeProfitPercent = 7.0;
    tpMultiplier = 3.5;
    positionSizeMultiplier = 0.55;  // Reduced for late entry
  } else if (adx >= ADX_THRESHOLDS.VERY_STRONG) {
    stopLossPercent = 2.0;
    takeProfitPercent = 6.0;
    tpMultiplier = 3.0;
    positionSizeMultiplier = 0.70;
  } else if (adx >= ADX_THRESHOLDS.STRONG) {
    stopLossPercent = 2.0;
    takeProfitPercent = 5.5;
    tpMultiplier = 2.75;
    positionSizeMultiplier = 0.85;
  } else if (adx < ADX_THRESHOLDS.MINIMUM) {
    // Weak trend: wider stops, closer TP (expect chop)
    stopLossPercent = 3.5;
    takeProfitPercent = 4.0;
    tpMultiplier = 1.15;
    positionSizeMultiplier = 0.40;  // Very conservative
  } else if (adx < ADX_THRESHOLDS.MODERATE) {
    stopLossPercent = 3.0;
    takeProfitPercent = 4.5;
    tpMultiplier = 1.5;
    positionSizeMultiplier = 0.60;
  }

  // ===== REVERSAL RISK ADJUSTMENTS =====
  if (reversalScore >= 60) {
    positionSizeMultiplier *= 0.40;  // Very high reversal risk
    stopLossPercent *= 0.75;         // Tighter stop
  } else if (reversalScore >= 45) {
    positionSizeMultiplier *= 0.60;
    stopLossPercent *= 0.85;
  } else if (reversalScore >= 30) {
    positionSizeMultiplier *= 0.80;
  }

  // ===== MOMENTUM CONFIRMATION BONUS =====
  if (momentumConfirms) {
    positionSizeMultiplier = Math.min(1.0, positionSizeMultiplier * 1.15);
    takeProfitPercent *= 1.1;
  }

  // ===== HTF CONFIDENCE BONUS =====
  if (htfConf4h >= 75) {
    positionSizeMultiplier = Math.min(1.0, positionSizeMultiplier * 1.10);
  } else if (htfConf4h < 55) {
    positionSizeMultiplier *= 0.85;
  }

  // ===== VOLUME CONFIRMATION =====
  if (!volumeConfirms) {
    positionSizeMultiplier *= 0.80;
  }

  // ===== ATR-BASED DYNAMIC STOPS =====
  // If ATR is available, scale stops with volatility
  if (atr > 0 && ctx.currentPrice > 0) {
    const atrPercent = (atr / ctx.currentPrice) * 100;
    // Use 1.5-2.5x ATR for stops
    const atrBasedStop = atrPercent * 2.0;
    // Blend with percentage-based stop
    stopLossPercent = (stopLossPercent + atrBasedStop) / 2;
    // Cap at reasonable limits
    stopLossPercent = Math.max(1.0, Math.min(5.0, stopLossPercent));
  }

  // ===== FINAL CAPS =====
  positionSizeMultiplier = Math.max(0.20, Math.min(1.0, positionSizeMultiplier));
  takeProfitPercent = stopLossPercent * tpMultiplier;

  return { stopLossPercent, takeProfitPercent, positionSizeMultiplier, tpMultiplier };
};

// ============= ENTRY TYPE CLASSIFICATION =============
// Labels entries for logging/analytics - does NOT affect trading logic

export const classifyEntryType = (ctx: AdaptiveContext): AdaptiveEntryType => {
  const { adx, htfTrend4h, htfTrend1h, momentumState, isPullback, bbSqueeze, adxRising } = ctx;

  // Strong trend continuation
  if (adx >= ADX_THRESHOLDS.VERY_STRONG && htfTrend4h !== 'neutral') {
    return 'STRONG_TREND_CONTINUATION';
  }

  // Pullback entry
  if (isPullback && adx >= ADX_THRESHOLDS.MINIMUM && htfTrend4h !== 'neutral') {
    return 'PULLBACK_ENTRY';
  }

  // Momentum breakout
  if (adxRising && (momentumState === 'confirmed' || momentumState === 'building') && bbSqueeze) {
    return 'MOMENTUM_BREAKOUT';
  }

  // Trend following
  if (adx >= ADX_THRESHOLDS.STRONG && htfTrend4h !== 'neutral') {
    return 'TREND_FOLLOWING';
  }

  // Early momentum
  if (adx >= ADX_THRESHOLDS.WEAK && adx < ADX_THRESHOLDS.STRONG && 
      (momentumState === 'building' || momentumState === 'confirmed')) {
    return 'EARLY_MOMENTUM';
  }

  // Neutral breakout
  if (htfTrend4h === 'neutral' && htfTrend1h !== 'neutral' && adxRising) {
    return 'NEUTRAL_BREAKOUT';
  }

  // Range bounce (mean reversion)
  if (adx < ADX_THRESHOLDS.MINIMUM) {
    return 'RANGE_BOUNCE';
  }

  return 'ADAPTIVE_ENTRY';
};

// ============= MAIN ADAPTIVE SIGNAL GENERATOR =============

export const generateAdaptiveSignal = (
  symbol: string,
  ctx: AdaptiveContext,
  qualityScore: number,
  qualityBreakdown: string
): AdaptiveSignalResult | null => {
  // Step 1: Determine direction from indicators
  const directionResult = determineAdaptiveDirection(ctx);
  if (!directionResult) {
    // NEW: Add logging when no direction is found (Phase 3)
    console.log(`[ADAPTIVE] No direction for ${symbol}: ` +
      `4h=${ctx.htfTrend4h} 1h=${ctx.htfTrend1h} ADX=${ctx.adx.toFixed(1)} ` +
      `momentum=${ctx.momentumScore} confirms=${ctx.momentumConfirms} ` +
      `macd=${ctx.macdHistogram.toFixed(1)} expanding=${ctx.macdExpanding} ` +
      `trendConsist=${ctx.trendConsistency}% primary=${ctx.primaryTrend}`);
    return null;  // No clear direction
  }

  const { direction, confidence: directionConfidence, reason: directionReason } = directionResult;

  // Step 2: Calculate dynamic risk parameters
  const params = calculateAdaptiveParameters(direction, ctx);

  // Step 3: Classify entry type (for logging only)
  const entryType = classifyEntryType(ctx);

  // Step 4: Calculate quality factors breakdown
  const qualityFactors = calculateQualityFactors(ctx, direction);

  // Step 5: Build result
  return {
    direction,
    entryType,
    stopLossPercent: params.stopLossPercent,
    takeProfitPercent: params.takeProfitPercent,
    positionSizeMultiplier: params.positionSizeMultiplier,
    confidence: directionConfidence,
    reason: directionReason,
    qualityFactors
  };
};

// ============= QUALITY FACTORS CALCULATION =============

const calculateQualityFactors = (
  ctx: AdaptiveContext,
  direction: 'long' | 'short'
): AdaptiveQualityFactors => {
  const {
    htfTrend4h, htfTrend1h, htfConf4h, htfConf1h,
    adx, momentumScore, momentumConfirms,
    reversalScore, volumeConfirms, volumeRatio,
    orderFlowScore
  } = ctx;

  // HTF Alignment (0-25 points)
  let htfAlignment = 0;
  const expectedTrend = direction === 'long' ? 'bullish' : 'bearish';
  if (htfTrend4h === expectedTrend) htfAlignment += 15;
  else if (htfTrend4h === 'neutral') htfAlignment += 5;
  if (htfTrend1h === expectedTrend) htfAlignment += 10;
  else if (htfTrend1h === 'neutral') htfAlignment += 3;
  // Bonus for high confidence
  if (htfConf4h >= 70 && htfTrend4h === expectedTrend) htfAlignment = Math.min(25, htfAlignment + 3);

  // ADX Strength (0-20 points)
  let adxStrength = 0;
  if (adx >= ADX_THRESHOLDS.EXTREME) adxStrength = 20;
  else if (adx >= ADX_THRESHOLDS.VERY_STRONG) adxStrength = 17;
  else if (adx >= ADX_THRESHOLDS.STRONG) adxStrength = 14;
  else if (adx >= ADX_THRESHOLDS.MODERATE) adxStrength = 10;
  else if (adx >= ADX_THRESHOLDS.MINIMUM) adxStrength = 6;
  else if (adx >= ADX_THRESHOLDS.WEAK) adxStrength = 3;

  // Momentum Confirmation (0-20 points)
  let momentumConfirmation = 0;
  const momentumAligned = (direction === 'long' && momentumScore > 0) || 
                          (direction === 'short' && momentumScore < 0);
  if (momentumConfirms && momentumAligned) {
    momentumConfirmation = 20;
  } else if (momentumAligned) {
    momentumConfirmation = Math.min(15, Math.abs(momentumScore) / 2);
  } else if (Math.abs(momentumScore) < 10) {
    momentumConfirmation = 5;  // Neutral momentum
  }

  // Technical Setup (0-15 points)
  let technicalSetup = 10;  // Base points
  if (ctx.isPullback && ctx.pullbackDepth >= 30 && ctx.pullbackDepth <= 70) {
    technicalSetup += 5;  // Good pullback depth
  }
  if (ctx.entryTimingScore >= 15) {
    technicalSetup = Math.min(15, technicalSetup + 3);
  }

  // Reversal Protection (-20 to 0 points)
  let reversalProtection = 0;
  if (reversalScore >= 50) reversalProtection = -20;
  else if (reversalScore >= 40) reversalProtection = -15;
  else if (reversalScore >= 30) reversalProtection = -10;
  else if (reversalScore >= 20) reversalProtection = -5;

  // Volume Confirmation (0-10 points)
  let volumeConfirmationScore = 0;
  if (volumeConfirms) {
    volumeConfirmationScore = 10;
  } else if (volumeRatio >= 0.8) {
    volumeConfirmationScore = 5;
  }

  // Order Flow Alignment (-10 to +10 points)
  let orderFlowAlignment = 0;
  if (orderFlowScore >= 60 && ctx.orderFlowSignal === (direction === 'long' ? 'bullish' : 'bearish')) {
    orderFlowAlignment = 10;
  } else if (orderFlowScore >= 40) {
    orderFlowAlignment = 5;
  } else if (orderFlowScore <= -40) {
    orderFlowAlignment = -10;
  }

  return {
    htfAlignment,
    adxStrength,
    momentumConfirmation,
    technicalSetup,
    reversalProtection,
    volumeConfirmation: volumeConfirmationScore,
    orderFlowAlignment
  };
};

// ============= ADAPTIVE QUALITY SCORE CALCULATION =============
// Alternative to strategy-specific quality scoring

export const calculateAdaptiveQualityScore = (factors: AdaptiveQualityFactors): { score: number; breakdown: string } => {
  const {
    htfAlignment, adxStrength, momentumConfirmation,
    technicalSetup, reversalProtection, volumeConfirmation, orderFlowAlignment
  } = factors;

  const score = Math.max(0, Math.min(100,
    htfAlignment +
    adxStrength +
    momentumConfirmation +
    technicalSetup +
    reversalProtection +
    volumeConfirmation +
    orderFlowAlignment
  ));

  const breakdown = `HTF:${htfAlignment} ADX:${adxStrength} MOM:${momentumConfirmation} ` +
    `TECH:${technicalSetup} REV:${reversalProtection} VOL:${volumeConfirmation} OF:${orderFlowAlignment}`;

  return { score, breakdown };
};

// ============= MINIMUM QUALITY THRESHOLD =============
// Dynamic threshold based on market conditions

export const getAdaptiveMinQuality = (ctx: AdaptiveContext): number => {
  const { adx, htfTrend4h, reversalScore } = ctx;

  let minQuality = QUALITY_THRESHOLDS.BASE_MIN;  // Default 65

  // Strong trend reduces requirement
  if (adx >= ADX_THRESHOLDS.EXTREME) {
    minQuality -= 10;
  } else if (adx >= ADX_THRESHOLDS.VERY_STRONG) {
    minQuality -= 5;
  }

  // Neutral trend increases requirement
  if (htfTrend4h === 'neutral' && adx < ADX_THRESHOLDS.STRONG) {
    minQuality += 10;
  }

  // High reversal risk increases requirement
  if (reversalScore >= 40) {
    minQuality += 5;
  }

  return Math.max(45, Math.min(75, minQuality));
};

// ============= ENTRY TYPE LABELS FOR LOGGING =============

export const getEntryTypeLabel = (entryType: AdaptiveEntryType): string => {
  const labels: Record<AdaptiveEntryType, string> = {
    'STRONG_TREND_CONTINUATION': 'Strong Trend Continuation',
    'TREND_FOLLOWING': 'Trend Following',
    'EARLY_MOMENTUM': 'Early Momentum Entry',
    'MOMENTUM_BREAKOUT': 'Momentum Breakout',
    'PULLBACK_ENTRY': 'Pullback Entry',
    'NEUTRAL_BREAKOUT': 'Neutral Breakout',
    'RANGE_BOUNCE': 'Range Bounce',
    'ADAPTIVE_ENTRY': 'Adaptive Entry'
  };
  return labels[entryType] || 'Adaptive Entry';
};
