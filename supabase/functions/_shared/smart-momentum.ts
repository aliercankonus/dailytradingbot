// ============= SMART MOMENTUM DETECTION SYSTEM =============
// Phase 1: Enhanced Trend Change Detection
// Phase 2: Smarter Entry Timing
// Part of the comprehensive trading intelligence upgrade

import { calculateEMAArray, calculateRSIArray, calculateMACD, calculateADXWithDirection, calculateVolumeAnalysis, calculateATR } from "./indicators.ts";
import { ADX_THRESHOLDS } from "./constants.ts";

// ============= TREND MOMENTUM SCORE =============
// Scores momentum from -100 (strong bearish) to +100 (strong bullish)
export interface MomentumScoreResult {
  score: number;                    // -100 to +100
  direction: "bullish" | "bearish" | "neutral";
  isAccelerating: boolean;
  isWeakening: boolean;
  isExhausted: boolean;
  components: {
    emaSpreadRoC: number;          // Rate of change of EMA spread
    rsiMomentum: number;           // RSI directional momentum
    macdSlope: number;             // MACD histogram slope
    adxTrend: number;              // ADX direction contribution
  };
  overextensionATR: number;        // How many ATRs from EMA
  reasons: string[];
}

export function calculateMomentumScore(
  klines: any[],
  prices: number[],
  adx: number,
  adxRising: boolean,
  currentATR: number
): MomentumScoreResult {
  const defaultResult: MomentumScoreResult = {
    score: 0,
    direction: "neutral",
    isAccelerating: false,
    isWeakening: false,
    isExhausted: false,
    components: { emaSpreadRoC: 0, rsiMomentum: 0, macdSlope: 0, adxTrend: 0 },
    overextensionATR: 0,
    reasons: []
  };

  if (prices.length < 50) return defaultResult;

  const reasons: string[] = [];
  let totalScore = 0;

  // 1. EMA Spread Rate of Change (max ±30 points)
  const ema12Array = calculateEMAArray(prices, 12);
  const ema26Array = calculateEMAArray(prices, 26);
  
  if (ema12Array.length >= 5 && ema26Array.length >= 5) {
    const spreadCurrent = ema12Array[ema12Array.length - 1] - ema26Array[ema26Array.length - 1];
    const spreadPrev1 = ema12Array[ema12Array.length - 2] - ema26Array[ema26Array.length - 2];
    const spreadPrev5 = ema12Array[ema12Array.length - 5] - ema26Array[ema26Array.length - 5];
    
    // Calculate rate of change of spread
    const currentEma = ema26Array[ema26Array.length - 1] || 1;
    const spreadRoC = ((spreadCurrent - spreadPrev5) / Math.abs(currentEma || 1)) * 100;
    const spreadChange = spreadCurrent - spreadPrev1;
    
    const emaSpreadScore = Math.min(30, Math.max(-30, spreadRoC * 10));
    totalScore += emaSpreadScore;
    
    if (spreadRoC > 0.1) reasons.push(`EMA spread widening: +${emaSpreadScore.toFixed(0)}`);
    else if (spreadRoC < -0.1) reasons.push(`EMA spread narrowing: ${emaSpreadScore.toFixed(0)}`);
    
    defaultResult.components.emaSpreadRoC = spreadRoC;
  }

  // 2. RSI Momentum (max ±25 points)
  const rsiArray = calculateRSIArray(prices, 14);
  if (rsiArray.length >= 5) {
    const rsiCurrent = rsiArray[rsiArray.length - 1];
    const rsiPrev3 = rsiArray[rsiArray.length - 4];
    
    // Track consecutive higher/lower lows
    let consecutiveHigherLows = 0;
    let consecutiveLowerHighs = 0;
    
    for (let i = rsiArray.length - 4; i < rsiArray.length - 1; i++) {
      if (rsiArray[i + 1] > rsiArray[i]) consecutiveHigherLows++;
      else if (rsiArray[i + 1] < rsiArray[i]) consecutiveLowerHighs++;
    }
    
    const rsiMomentum = (rsiCurrent - rsiPrev3) / 3; // Average change per period
    const rsiScore = Math.min(25, Math.max(-25, rsiMomentum * 2));
    totalScore += rsiScore;
    
    if (consecutiveHigherLows >= 2) reasons.push(`RSI higher lows: +${rsiScore.toFixed(0)}`);
    else if (consecutiveLowerHighs >= 2) reasons.push(`RSI lower highs: ${rsiScore.toFixed(0)}`);
    
    defaultResult.components.rsiMomentum = rsiMomentum;
  }

  // 3. MACD Histogram Slope (max ±30 points)
  const macdResult = calculateMACD(prices);
  if (macdResult.histogramArray.length >= 5) {
    const hist = macdResult.histogramArray;
    const histCurrent = hist[hist.length - 1];
    const histPrev1 = hist[hist.length - 2];
    const histPrev3 = hist[hist.length - 4];
    
    // Calculate histogram slope (acceleration/deceleration)
    const slope = (histCurrent - histPrev3) / 3;
    const isExpanding = Math.abs(histCurrent) > Math.abs(histPrev1);
    
    let macdScore = 0;
    if (histCurrent > 0) {
      macdScore = isExpanding ? Math.min(30, slope * 100) : Math.max(-15, slope * 50);
    } else {
      macdScore = isExpanding ? Math.max(-30, slope * 100) : Math.min(15, slope * 50);
    }
    
    totalScore += macdScore;
    
    if (isExpanding && histCurrent > 0) reasons.push(`MACD expanding bullish: +${macdScore.toFixed(0)}`);
    else if (isExpanding && histCurrent < 0) reasons.push(`MACD expanding bearish: ${macdScore.toFixed(0)}`);
    else if (!isExpanding) reasons.push(`MACD contracting: ${macdScore.toFixed(0)}`);
    
    defaultResult.components.macdSlope = slope;
  }

  // 4. ADX Trend Contribution (max ±15 points)
  let adxScore = 0;
  if (adx >= ADX_THRESHOLDS.STRONG) {
    adxScore = adxRising ? 15 : -5;
    if (adxRising) reasons.push(`Strong ADX rising: +${adxScore}`);
  } else if (adx >= ADX_THRESHOLDS.MINIMUM) {
    adxScore = adxRising ? 8 : -3;
  } else {
    adxScore = -10;
    reasons.push(`Weak ADX (${adx.toFixed(1)}): ${adxScore}`);
  }
  totalScore += adxScore;
  defaultResult.components.adxTrend = adxScore;

  // 5. Calculate Overextension
  const ema26Current = ema26Array.length > 0 ? ema26Array[ema26Array.length - 1] : prices[prices.length - 1];
  const currentPrice = prices[prices.length - 1];
  const distanceFromEma = Math.abs(currentPrice - ema26Current);
  const overextensionATR = currentATR > 0 ? distanceFromEma / currentATR : 0;
  defaultResult.overextensionATR = overextensionATR;

  // Determine states
  const isAccelerating = totalScore > 30 && defaultResult.components.macdSlope > 0;
  const isWeakening = 
    (totalScore > 0 && defaultResult.components.macdSlope < 0 && !adxRising) ||
    (totalScore < 0 && defaultResult.components.macdSlope > 0 && !adxRising);
  const isExhausted = 
    adx >= ADX_THRESHOLDS.EXTREME && 
    overextensionATR >= 2.0 && 
    !adxRising;

  if (isWeakening) reasons.push("⚠️ Momentum WEAKENING");
  if (isExhausted) reasons.push("🛑 Trend EXHAUSTED");
  if (isAccelerating) reasons.push("🚀 Momentum ACCELERATING");

  return {
    score: Math.min(100, Math.max(-100, Math.round(totalScore))),
    direction: totalScore > 20 ? "bullish" : totalScore < -20 ? "bearish" : "neutral",
    isAccelerating,
    isWeakening,
    isExhausted,
    components: defaultResult.components,
    overextensionATR: Math.round(overextensionATR * 100) / 100,
    reasons
  };
}

// ============= PULLBACK DETECTION =============
// Phase 2: Enhanced with wait-for-bounce logic and confirmation candle
export interface PullbackResult {
  isPullback: boolean;
  pullbackDepth: number;           // 0-100 (Fibonacci retracement %)
  isValidPullback: boolean;        // Meets criteria for entry
  pullbackType: "shallow" | "moderate" | "deep" | "none";
  rsiInZone: boolean;
  rsiDipped: boolean;              // RSI dipped below/above threshold before current
  rsiRecovering: boolean;          // RSI is now rising/falling in correct direction
  isRecovering: boolean;           // Price starting to bounce
  hasBounceConfirmation: boolean;  // Price closes above prev high (long) or below prev low (short)
  confirmationCandles: number;     // Number of confirmation candles after bounce
  reasons: string[];
}

export function detectPullback(
  prices: number[],
  direction: "long" | "short",
  rsi: number,
  rsiArray: number[],
  swingHigh: number,
  swingLow: number
): PullbackResult {
  const defaultResult: PullbackResult = {
    isPullback: false,
    pullbackDepth: 0,
    isValidPullback: false,
    pullbackType: "none",
    rsiInZone: false,
    rsiDipped: false,
    rsiRecovering: false,
    isRecovering: false,
    hasBounceConfirmation: false,
    confirmationCandles: 0,
    reasons: []
  };

  if (prices.length < 10) return defaultResult;

  const currentPrice = prices[prices.length - 1];
  const prevPrice = prices[prices.length - 2];
  const prevPrice2 = prices.length >= 3 ? prices[prices.length - 3] : prevPrice;
  const reasons: string[] = [];

  // Calculate Fibonacci retracement depth
  const swingRange = swingHigh - swingLow;
  if (swingRange <= 0) return defaultResult;

  let pullbackDepth = 0;
  let rsiInZone = false;
  let rsiDipped = false;
  let rsiRecovering = false;
  let isRecovering = false;
  let hasBounceConfirmation = false;
  let confirmationCandles = 0;
  
  if (direction === "long") {
    // For long: pullback is from high towards low
    const retracement = swingHigh - currentPrice;
    pullbackDepth = (retracement / swingRange) * 100;
    
    // Phase 2: Check RSI dipped below 45 at some point in last 5 bars
    const RSI_DIP_THRESHOLD = 45;
    rsiDipped = rsiArray.slice(-5).some(r => r < RSI_DIP_THRESHOLD);
    
    // Check RSI zone for longs (currently below 50, ideal below 45)
    rsiInZone = rsi < 50;
    
    // RSI recovering = current RSI > previous RSI
    rsiRecovering = rsiArray.length >= 2 && rsiArray[rsiArray.length - 1] > rsiArray[rsiArray.length - 2];
    
    // Phase 2: Wait-for-Bounce Logic
    // Price must close above previous candle high to confirm bounce
    isRecovering = currentPrice > prevPrice;
    hasBounceConfirmation = currentPrice > Math.max(prevPrice, prevPrice2) && rsiRecovering;
    
    // Count confirmation candles (consecutive higher closes)
    for (let i = prices.length - 1; i >= Math.max(0, prices.length - 5); i--) {
      if (prices[i] > prices[i - 1]) confirmationCandles++;
      else break;
    }
    
    if (rsiDipped) reasons.push(`RSI dipped below ${RSI_DIP_THRESHOLD}`);
    if (rsiRecovering) reasons.push(`RSI rising: ${rsi.toFixed(1)}`);
    if (hasBounceConfirmation) reasons.push(`✅ Bounce confirmed (${confirmationCandles} candles)`);
    else if (isRecovering) reasons.push("Price bouncing - waiting for confirmation");
    
  } else {
    // For short: pullback is from low towards high
    const retracement = currentPrice - swingLow;
    pullbackDepth = (retracement / swingRange) * 100;
    
    // Phase 2: Check RSI spiked above 55 at some point in last 5 bars
    const RSI_SPIKE_THRESHOLD = 55;
    rsiDipped = rsiArray.slice(-5).some(r => r > RSI_SPIKE_THRESHOLD);
    
    // Check RSI zone for shorts (currently above 50, ideal above 55)
    rsiInZone = rsi > 50;
    
    // RSI recovering = current RSI < previous RSI (falling for shorts)
    rsiRecovering = rsiArray.length >= 2 && rsiArray[rsiArray.length - 1] < rsiArray[rsiArray.length - 2];
    
    // Phase 2: Wait-for-Bounce Logic
    // Price must close below previous candle low to confirm rejection
    isRecovering = currentPrice < prevPrice;
    hasBounceConfirmation = currentPrice < Math.min(prevPrice, prevPrice2) && rsiRecovering;
    
    // Count confirmation candles (consecutive lower closes)
    for (let i = prices.length - 1; i >= Math.max(0, prices.length - 5); i--) {
      if (prices[i] < prices[i - 1]) confirmationCandles++;
      else break;
    }
    
    if (rsiDipped) reasons.push(`RSI spiked above ${RSI_SPIKE_THRESHOLD}`);
    if (rsiRecovering) reasons.push(`RSI falling: ${rsi.toFixed(1)}`);
    if (hasBounceConfirmation) reasons.push(`✅ Rejection confirmed (${confirmationCandles} candles)`);
    else if (isRecovering) reasons.push("Price rejecting - waiting for confirmation");
  }

  // Classify pullback type
  let pullbackType: "shallow" | "moderate" | "deep" | "none" = "none";
  if (pullbackDepth >= 61.8) pullbackType = "deep";
  else if (pullbackDepth >= 38.2) pullbackType = "moderate";
  else if (pullbackDepth >= 23.6) pullbackType = "shallow";

  const isPullback = pullbackDepth >= 23.6;
  
  // Phase 2: Valid pullback requires ALL of:
  // 1. At least 38% retracement (Fibonacci)
  // 2. RSI dipped into pullback zone and is now recovering
  // 3. Bounce confirmation (price closes above prev high for long)
  // 4. At least 1 confirmation candle
  const isValidPullback = 
    pullbackDepth >= 38.2 && 
    pullbackDepth <= 78.6 && 
    rsiDipped && 
    rsiRecovering &&
    hasBounceConfirmation &&
    confirmationCandles >= 1;

  if (isPullback) reasons.push(`${pullbackType} pullback: ${pullbackDepth.toFixed(1)}% retracement`);
  if (isValidPullback) reasons.push("✅ VALID entry pullback - all confirmations met");

  return {
    isPullback,
    pullbackDepth: Math.round(pullbackDepth * 10) / 10,
    isValidPullback,
    pullbackType,
    rsiInZone,
    rsiDipped,
    rsiRecovering,
    isRecovering,
    hasBounceConfirmation,
    confirmationCandles,
    reasons
  };
}

// ============= ENTRY CONFIRMATION FILTER =============
// Phase 2: All entry confirmation checks in one place
export interface EntryConfirmationResult {
  allConfirmed: boolean;
  confirmationCount: number;
  maxConfirmations: number;
  details: {
    confirmationCandle: boolean;    // At least 1 confirmation candle after pullback
    volumeIncreasing: boolean;      // Volume increasing on entry candle
    stochRsiCrossing: boolean;      // StochRSI K/D crossing, not at extreme
    macdExpanding: boolean;         // MACD histogram expanding in trade direction
    rsiRecovering: boolean;         // RSI recovering from pullback zone
  };
  reasons: string[];
}

export function checkEntryConfirmation(
  pullbackResult: PullbackResult | null,
  volumeRatio: number,
  stochRsiK: number,
  stochRsiD: number,
  macdHistogramExpanding: boolean,
  direction: "long" | "short"
): EntryConfirmationResult {
  const details = {
    confirmationCandle: false,
    volumeIncreasing: false,
    stochRsiCrossing: false,
    macdExpanding: false,
    rsiRecovering: false
  };
  const reasons: string[] = [];

  // 1. Confirmation Candle - at least 1 candle after bounce
  details.confirmationCandle = pullbackResult ? pullbackResult.confirmationCandles >= 1 : false;
  if (details.confirmationCandle) {
    reasons.push(`✓ ${pullbackResult?.confirmationCandles} confirmation candle(s)`);
  } else {
    reasons.push("✗ No confirmation candle yet");
  }

  // 2. Volume Increasing - volume above average on entry
  details.volumeIncreasing = volumeRatio >= 1.0;
  if (volumeRatio >= 1.5) {
    reasons.push(`✓ Strong volume (${(volumeRatio * 100).toFixed(0)}%)`);
  } else if (details.volumeIncreasing) {
    reasons.push(`✓ Volume OK (${(volumeRatio * 100).toFixed(0)}%)`);
  } else {
    reasons.push(`✗ Weak volume (${(volumeRatio * 100).toFixed(0)}%)`);
  }

  // 3. StochRSI Crossing - K crossing D, not at extreme
  // For long: K > D and K not > 80 (not overbought)
  // For short: K < D and K not < 20 (not oversold)
  if (direction === "long") {
    const isCrossing = stochRsiK > stochRsiD;
    const notExtreme = stochRsiK < 80;
    details.stochRsiCrossing = isCrossing && notExtreme;
    if (details.stochRsiCrossing) {
      reasons.push(`✓ StochRSI bullish cross (K=${stochRsiK.toFixed(0)} > D=${stochRsiD.toFixed(0)})`);
    } else if (!isCrossing) {
      reasons.push(`✗ StochRSI not crossing up (K=${stochRsiK.toFixed(0)} <= D=${stochRsiD.toFixed(0)})`);
    } else {
      reasons.push(`✗ StochRSI overbought (K=${stochRsiK.toFixed(0)})`);
    }
  } else {
    const isCrossing = stochRsiK < stochRsiD;
    const notExtreme = stochRsiK > 20;
    details.stochRsiCrossing = isCrossing && notExtreme;
    if (details.stochRsiCrossing) {
      reasons.push(`✓ StochRSI bearish cross (K=${stochRsiK.toFixed(0)} < D=${stochRsiD.toFixed(0)})`);
    } else if (!isCrossing) {
      reasons.push(`✗ StochRSI not crossing down (K=${stochRsiK.toFixed(0)} >= D=${stochRsiD.toFixed(0)})`);
    } else {
      reasons.push(`✗ StochRSI oversold (K=${stochRsiK.toFixed(0)})`);
    }
  }

  // 4. MACD Expanding
  details.macdExpanding = macdHistogramExpanding;
  if (details.macdExpanding) {
    reasons.push("✓ MACD histogram expanding");
  } else {
    reasons.push("✗ MACD histogram not expanding");
  }

  // 5. RSI Recovering
  details.rsiRecovering = pullbackResult ? pullbackResult.rsiRecovering : false;
  if (details.rsiRecovering) {
    reasons.push("✓ RSI recovering from pullback");
  } else {
    reasons.push("✗ RSI not recovering");
  }

  // Count confirmations
  const confirmationCount = Object.values(details).filter(Boolean).length;
  const maxConfirmations = 5;
  
  // All confirmed if we have at least 4 out of 5 (allow 1 missing)
  const allConfirmed = confirmationCount >= 4;

  return {
    allConfirmed,
    confirmationCount,
    maxConfirmations,
    details,
    reasons
  };
}

// ============= ENTRY QUALITY SCORING =============
// Phase 2: Enhanced with entry confirmation integration
export interface EntryQualityResult {
  score: number;                    // 0-100
  grade: "A" | "B" | "C" | "D" | "F";
  factors: {
    momentumAlignment: number;      // 0-25
    pullbackQuality: number;        // 0-25 (increased from 20)
    volumeConfirmation: number;     // 0-15
    timeframeAlignment: number;     // 0-15 (decreased from 20)
    stochRsiPosition: number;       // 0-10
    macdExpanding: number;          // 0-10
    entryConfirmation: number;      // 0-10 (NEW)
  };
  isRecommended: boolean;
  entryType: "pullback" | "breakout" | "continuation";
  warnings: string[];
}

export function calculateEntryQuality(
  momentumScore: MomentumScoreResult,
  pullbackResult: PullbackResult | null,
  volumeConfirms: boolean,
  volumeRatio: number,
  timeframeAlignmentScore: number,
  stochRsiK: number,
  stochRsiSignal: string,
  macdHistogramExpanding: boolean,
  direction: "long" | "short",
  stochRsiD?: number  // Optional for confirmation check
): EntryQualityResult {
  const factors = {
    momentumAlignment: 0,
    pullbackQuality: 0,
    volumeConfirmation: 0,
    timeframeAlignment: 0,
    stochRsiPosition: 0,
    macdExpanding: 0,
    entryConfirmation: 0
  };
  const warnings: string[] = [];

  // Determine entry type
  let entryType: "pullback" | "breakout" | "continuation" = "continuation";
  if (pullbackResult && pullbackResult.isValidPullback) {
    entryType = "pullback";
  } else if (momentumScore.isAccelerating && volumeRatio >= 1.5) {
    entryType = "breakout";
  }

  // 1. Momentum Alignment (0-25 points)
  const momentumAligned = 
    (direction === "long" && momentumScore.score > 0) ||
    (direction === "short" && momentumScore.score < 0);
  
  if (momentumAligned) {
    factors.momentumAlignment = Math.min(25, Math.abs(momentumScore.score) * 0.25);
    if (momentumScore.isAccelerating) factors.momentumAlignment = 25;
  } else {
    factors.momentumAlignment = 0;
    warnings.push("Momentum not aligned with direction");
  }
  
  if (momentumScore.isWeakening) {
    factors.momentumAlignment = Math.max(0, factors.momentumAlignment - 15);
    warnings.push("⚠️ Weakening momentum");
  }
  if (momentumScore.isExhausted) {
    factors.momentumAlignment = 0;
    warnings.push("🛑 Trend exhausted - avoid entry");
  }

  // 2. Pullback Quality (0-25 points) - ENHANCED for Phase 2
  if (pullbackResult && pullbackResult.isValidPullback) {
    // Perfect pullback with all confirmations
    factors.pullbackQuality = 25;
  } else if (pullbackResult && pullbackResult.isPullback && pullbackResult.hasBounceConfirmation) {
    // Has bounce confirmation but not all criteria
    factors.pullbackQuality = 20;
  } else if (pullbackResult && pullbackResult.isPullback && pullbackResult.isRecovering) {
    // Pullback with price recovering, waiting for confirmation
    factors.pullbackQuality = 12;
    warnings.push("Wait for bounce confirmation before entry");
  } else if (pullbackResult && pullbackResult.isPullback) {
    // Just a pullback, no recovery yet
    factors.pullbackQuality = 5;
    warnings.push("Pullback in progress - no bounce signal yet");
  } else {
    factors.pullbackQuality = 0;
    // Not having a pullback is OK for breakout/continuation
    if (entryType === "continuation") {
      warnings.push("No pullback detected - consider waiting");
    }
  }

  // 3. Volume Confirmation (0-15 points)
  if (volumeConfirms && volumeRatio >= 1.5) {
    factors.volumeConfirmation = 15;
  } else if (volumeConfirms) {
    factors.volumeConfirmation = 10;
  } else if (volumeRatio >= 0.8) {
    factors.volumeConfirmation = 5;
  } else {
    factors.volumeConfirmation = 0;
    warnings.push("Low volume - weak conviction");
  }

  // 4. Timeframe Alignment (0-15 points)
  factors.timeframeAlignment = Math.min(15, timeframeAlignmentScore * 0.15);

  // 5. StochRSI Position (0-10 points)
  // Phase 2: Best entries when StochRSI is crossing, not at extremes
  const stochRsiDValue = stochRsiD ?? stochRsiK; // Fallback if D not provided
  
  if (direction === "long") {
    // Best: K < 50 and K > D (crossing up)
    if (stochRsiK < 50 && stochRsiK > stochRsiDValue) {
      factors.stochRsiPosition = 10;
    } else if (stochRsiK < 30) {
      factors.stochRsiPosition = 8; // Oversold is good for longs
    } else if (stochRsiK < 50) {
      factors.stochRsiPosition = 6;
    } else if (stochRsiK < 70) {
      factors.stochRsiPosition = 3;
    } else {
      factors.stochRsiPosition = 0;
      warnings.push("StochRSI overbought for long entry");
    }
  } else {
    // Best: K > 50 and K < D (crossing down)
    if (stochRsiK > 50 && stochRsiK < stochRsiDValue) {
      factors.stochRsiPosition = 10;
    } else if (stochRsiK > 70) {
      factors.stochRsiPosition = 8; // Overbought is good for shorts
    } else if (stochRsiK > 50) {
      factors.stochRsiPosition = 6;
    } else if (stochRsiK > 30) {
      factors.stochRsiPosition = 3;
    } else {
      factors.stochRsiPosition = 0;
      warnings.push("StochRSI oversold for short entry");
    }
  }

  // 6. MACD Expanding (0-10 points)
  if (macdHistogramExpanding) {
    factors.macdExpanding = 10;
  } else {
    factors.macdExpanding = 0;
    warnings.push("MACD histogram not expanding");
  }

  // 7. Entry Confirmation Score (0-10 points) - NEW for Phase 2
  if (pullbackResult) {
    // Confirmation based on candle confirmation + RSI recovery
    if (pullbackResult.hasBounceConfirmation && pullbackResult.rsiRecovering) {
      factors.entryConfirmation = 10;
    } else if (pullbackResult.hasBounceConfirmation || pullbackResult.rsiRecovering) {
      factors.entryConfirmation = 5;
    }
  } else if (entryType === "breakout" && volumeRatio >= 1.5 && macdHistogramExpanding) {
    // Breakout with volume and MACD confirmation
    factors.entryConfirmation = 8;
  }

  // Calculate total score
  const totalScore = 
    factors.momentumAlignment +
    factors.pullbackQuality +
    factors.volumeConfirmation +
    factors.timeframeAlignment +
    factors.stochRsiPosition +
    factors.macdExpanding +
    factors.entryConfirmation;

  // Determine grade
  let grade: "A" | "B" | "C" | "D" | "F" = "F";
  if (totalScore >= 90) grade = "A";
  else if (totalScore >= 75) grade = "B";
  else if (totalScore >= 60) grade = "C";
  else if (totalScore >= 45) grade = "D";

  // Phase 2: isRecommended requires entry confirmation for pullbacks
  const hasConfirmation = pullbackResult ? pullbackResult.hasBounceConfirmation : true;
  const isRecommended = totalScore >= 60 && !momentumScore.isExhausted && hasConfirmation;

  return {
    score: Math.round(totalScore),
    grade,
    factors,
    isRecommended,
    entryType,
    warnings
  };
}

// ============= MARKET REGIME CLASSIFICATION =============
export type MarketRegimeType = "TRENDING" | "RANGING" | "TRANSITIONING" | "EXHAUSTED";

export interface MarketRegimeResult {
  regime: MarketRegimeType;
  regimeScore: number;              // 0-100
  tradeable: boolean;
  allowedStrategies: string[];
  qualityThreshold: number;         // Minimum quality for this regime
  positionSizeMultiplier: number;
  bbSqueeze: boolean;
  bbWidth: number;
  reason: string;
}

export function classifyMarketRegime(
  adx: number,
  adxRising: boolean,
  momentumScore: MomentumScoreResult,
  bbWidth: number,
  bbSqueeze: boolean,
  volumeRatio: number
): MarketRegimeResult {
  // Calculate regime score (0-100)
  let regimeScore = 0;
  let regime: MarketRegimeType = "RANGING";
  let reason = "";

  // ADX contribution (0-40 points)
  if (adx >= ADX_THRESHOLDS.EXTREME) regimeScore += 40;
  else if (adx >= ADX_THRESHOLDS.STRONG) regimeScore += 30;
  else if (adx >= ADX_THRESHOLDS.MINIMUM) regimeScore += 20;
  else if (adx >= 15) regimeScore += 10;

  // Momentum contribution (0-30 points)
  if (!momentumScore.isExhausted && !momentumScore.isWeakening) {
    regimeScore += Math.min(30, Math.abs(momentumScore.score) * 0.3);
  }

  // ADX direction contribution (0-15 points)
  if (adxRising && adx >= ADX_THRESHOLDS.MINIMUM) regimeScore += 15;
  else if (!adxRising && adx >= ADX_THRESHOLDS.STRONG) regimeScore -= 10;

  // Volume contribution (0-15 points)
  if (volumeRatio >= 1.5) regimeScore += 15;
  else if (volumeRatio >= 1.0) regimeScore += 8;
  else if (volumeRatio < 0.7) regimeScore -= 10;

  // Classify regime
  if (adx >= ADX_THRESHOLDS.EXHAUSTION || momentumScore.isExhausted) {
    regime = "EXHAUSTED";
    reason = adx >= ADX_THRESHOLDS.EXHAUSTION 
      ? `ADX exhausted at ${adx.toFixed(1)}` 
      : "Momentum exhausted";
  } else if (regimeScore >= 60) {
    regime = "TRENDING";
    reason = `Strong trend (score: ${regimeScore.toFixed(0)}, ADX: ${adx.toFixed(1)})`;
  } else if (regimeScore >= 35) {
    regime = "TRANSITIONING";
    reason = `Emerging trend (score: ${regimeScore.toFixed(0)}, ADX: ${adx.toFixed(1)})`;
  } else {
    regime = "RANGING";
    reason = `No clear trend (score: ${regimeScore.toFixed(0)}, ADX: ${adx.toFixed(1)})`;
  }

  // Determine allowed strategies per regime
  let allowedStrategies: string[] = [];
  let qualityThreshold = 65;
  let positionSizeMultiplier = 1.0;
  let tradeable = true;

  switch (regime) {
    case "TRENDING":
      allowedStrategies = ["trend-following", "momentum", "ema-cross", "macd"];
      qualityThreshold = 60;
      positionSizeMultiplier = 1.0;
      break;
    case "TRANSITIONING":
      allowedStrategies = ["squeeze-breakout", "momentum", "pullback"];
      qualityThreshold = 70;
      positionSizeMultiplier = 0.75;
      break;
    case "RANGING":
      allowedStrategies = ["mean-reversion", "bollinger-reversal"];
      qualityThreshold = 75;
      positionSizeMultiplier = 0.5;
      tradeable = bbSqueeze; // Only trade ranging if squeeze breakout
      break;
    case "EXHAUSTED":
      allowedStrategies = [];
      qualityThreshold = 100; // Block all new entries
      positionSizeMultiplier = 0;
      tradeable = false;
      break;
  }

  return {
    regime,
    regimeScore: Math.min(100, Math.max(0, Math.round(regimeScore))),
    tradeable,
    allowedStrategies,
    qualityThreshold,
    positionSizeMultiplier,
    bbSqueeze,
    bbWidth,
    reason
  };
}

// ============= BOLLINGER BAND SQUEEZE DETECTION =============
export interface BollingerSqueezeResult {
  isSqueeze: boolean;
  squeezeIntensity: number;         // 0-100
  isBreakingOut: boolean;
  breakoutDirection: "long" | "short" | "none";
  bbWidth: number;
  bbWidthPercentile: number;        // Current width vs historical
}

export function detectBollingerSqueeze(
  prices: number[],
  period: number = 20,
  stdDevMultiplier: number = 2
): BollingerSqueezeResult {
  const defaultResult: BollingerSqueezeResult = {
    isSqueeze: false,
    squeezeIntensity: 0,
    isBreakingOut: false,
    breakoutDirection: "none",
    bbWidth: 0,
    bbWidthPercentile: 50
  };

  if (prices.length < period + 20) return defaultResult;

  // Calculate current BB
  const recentPrices = prices.slice(-period);
  const sma = recentPrices.reduce((a, b) => a + b, 0) / period;
  const variance = recentPrices.reduce((sum, p) => sum + Math.pow(p - sma, 2), 0) / period;
  const stdDev = Math.sqrt(variance);
  
  const upperBand = sma + (stdDev * stdDevMultiplier);
  const lowerBand = sma - (stdDev * stdDevMultiplier);
  const bbWidth = ((upperBand - lowerBand) / sma) * 100;

  // Calculate historical BB widths for percentile
  const historicalWidths: number[] = [];
  for (let i = period + 20; i <= prices.length; i++) {
    const histPrices = prices.slice(i - period, i);
    const histSma = histPrices.reduce((a, b) => a + b, 0) / period;
    const histVar = histPrices.reduce((sum, p) => sum + Math.pow(p - histSma, 2), 0) / period;
    const histStdDev = Math.sqrt(histVar);
    const histWidth = ((histSma + histStdDev * stdDevMultiplier) - (histSma - histStdDev * stdDevMultiplier)) / histSma * 100;
    historicalWidths.push(histWidth);
  }

  // Calculate percentile
  const sortedWidths = [...historicalWidths].sort((a, b) => a - b);
  const bbWidthPercentile = (sortedWidths.filter(w => w < bbWidth).length / sortedWidths.length) * 100;

  // Squeeze = width in bottom 20% of historical
  const isSqueeze = bbWidthPercentile < 20;
  const squeezeIntensity = Math.max(0, 100 - bbWidthPercentile * 5);

  // Check for breakout
  const currentPrice = prices[prices.length - 1];
  const prevPrice = prices[prices.length - 2];
  let isBreakingOut = false;
  let breakoutDirection: "long" | "short" | "none" = "none";

  if (isSqueeze || bbWidthPercentile < 30) {
    if (currentPrice > upperBand && prevPrice <= upperBand) {
      isBreakingOut = true;
      breakoutDirection = "long";
    } else if (currentPrice < lowerBand && prevPrice >= lowerBand) {
      isBreakingOut = true;
      breakoutDirection = "short";
    }
  }

  return {
    isSqueeze,
    squeezeIntensity: Math.round(squeezeIntensity),
    isBreakingOut,
    breakoutDirection,
    bbWidth: Math.round(bbWidth * 100) / 100,
    bbWidthPercentile: Math.round(bbWidthPercentile)
  };
}

// ============= SWING HIGH/LOW DETECTION =============
export function findSwingPoints(
  klines: any[],
  lookback: number = 20
): { swingHigh: number; swingLow: number; swingHighIndex: number; swingLowIndex: number } {
  const recentKlines = klines.slice(-lookback);
  
  let swingHigh = -Infinity;
  let swingLow = Infinity;
  let swingHighIndex = 0;
  let swingLowIndex = 0;

  for (let i = 0; i < recentKlines.length; i++) {
    const high = parseFloat(recentKlines[i][2]);
    const low = parseFloat(recentKlines[i][3]);
    
    if (high > swingHigh) {
      swingHigh = high;
      swingHighIndex = i;
    }
    if (low < swingLow) {
      swingLow = low;
      swingLowIndex = i;
    }
  }

  return { swingHigh, swingLow, swingHighIndex, swingLowIndex };
}
