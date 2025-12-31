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
export interface PullbackResult {
  isPullback: boolean;
  pullbackDepth: number;           // 0-100 (Fibonacci retracement %)
  isValidPullback: boolean;        // Meets criteria for entry
  pullbackType: "shallow" | "moderate" | "deep" | "none";
  rsiInZone: boolean;
  isRecovering: boolean;           // Price starting to bounce
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
    isRecovering: false,
    reasons: []
  };

  if (prices.length < 10) return defaultResult;

  const currentPrice = prices[prices.length - 1];
  const prevPrice = prices[prices.length - 2];
  const reasons: string[] = [];

  // Calculate Fibonacci retracement depth
  const swingRange = swingHigh - swingLow;
  if (swingRange <= 0) return defaultResult;

  let pullbackDepth = 0;
  
  if (direction === "long") {
    // For long: pullback is from high towards low
    const retracement = swingHigh - currentPrice;
    pullbackDepth = (retracement / swingRange) * 100;
    
    // Check RSI zone for longs (dipped below 45 and now rising)
    const rsiInZone = rsi < 45;
    const rsiRising = rsiArray.length >= 2 && rsiArray[rsiArray.length - 1] > rsiArray[rsiArray.length - 2];
    const isRecovering = currentPrice > prevPrice && rsiRising;
    
    defaultResult.rsiInZone = rsiInZone;
    defaultResult.isRecovering = isRecovering;
    
    if (rsiInZone) reasons.push(`RSI in pullback zone: ${rsi.toFixed(1)}`);
    if (isRecovering) reasons.push("Price bouncing from pullback");
    
  } else {
    // For short: pullback is from low towards high
    const retracement = currentPrice - swingLow;
    pullbackDepth = (retracement / swingRange) * 100;
    
    // Check RSI zone for shorts (spiked above 55 and now falling)
    const rsiInZone = rsi > 55;
    const rsiFalling = rsiArray.length >= 2 && rsiArray[rsiArray.length - 1] < rsiArray[rsiArray.length - 2];
    const isRecovering = currentPrice < prevPrice && rsiFalling;
    
    defaultResult.rsiInZone = rsiInZone;
    defaultResult.isRecovering = isRecovering;
    
    if (rsiInZone) reasons.push(`RSI in pullback zone: ${rsi.toFixed(1)}`);
    if (isRecovering) reasons.push("Price rejecting from pullback");
  }

  // Classify pullback type
  let pullbackType: "shallow" | "moderate" | "deep" | "none" = "none";
  if (pullbackDepth >= 61.8) pullbackType = "deep";
  else if (pullbackDepth >= 38.2) pullbackType = "moderate";
  else if (pullbackDepth >= 23.6) pullbackType = "shallow";

  const isPullback = pullbackDepth >= 23.6;
  
  // Valid pullback requires:
  // 1. At least 38% retracement
  // 2. RSI in the right zone
  // 3. Signs of recovery/bounce
  const isValidPullback = 
    pullbackDepth >= 38.2 && 
    pullbackDepth <= 78.6 && 
    defaultResult.rsiInZone && 
    defaultResult.isRecovering;

  if (isPullback) reasons.push(`${pullbackType} pullback: ${pullbackDepth.toFixed(1)}% retracement`);
  if (isValidPullback) reasons.push("✅ Valid entry pullback");

  return {
    isPullback,
    pullbackDepth: Math.round(pullbackDepth * 10) / 10,
    isValidPullback,
    pullbackType,
    rsiInZone: defaultResult.rsiInZone,
    isRecovering: defaultResult.isRecovering,
    reasons
  };
}

// ============= ENTRY QUALITY SCORING =============
export interface EntryQualityResult {
  score: number;                    // 0-100
  grade: "A" | "B" | "C" | "D" | "F";
  factors: {
    momentumAlignment: number;      // 0-25
    pullbackQuality: number;        // 0-20
    volumeConfirmation: number;     // 0-15
    timeframeAlignment: number;     // 0-20
    stochRsiPosition: number;       // 0-10
    macdExpanding: number;          // 0-10
  };
  isRecommended: boolean;
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
  direction: "long" | "short"
): EntryQualityResult {
  const factors = {
    momentumAlignment: 0,
    pullbackQuality: 0,
    volumeConfirmation: 0,
    timeframeAlignment: 0,
    stochRsiPosition: 0,
    macdExpanding: 0
  };
  const warnings: string[] = [];

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

  // 2. Pullback Quality (0-20 points)
  if (pullbackResult && pullbackResult.isValidPullback) {
    factors.pullbackQuality = 20;
  } else if (pullbackResult && pullbackResult.isPullback) {
    factors.pullbackQuality = pullbackResult.pullbackType === "moderate" ? 15 : 8;
    if (!pullbackResult.isRecovering) {
      warnings.push("Pullback not yet bouncing - wait for confirmation");
    }
  } else {
    factors.pullbackQuality = 0;
    // Not having a pullback is OK for trend continuation, but note it
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

  // 4. Timeframe Alignment (0-20 points)
  factors.timeframeAlignment = Math.min(20, timeframeAlignmentScore * 0.2);

  // 5. StochRSI Position (0-10 points)
  // Best entries: oversold for longs (K < 30), overbought for shorts (K > 70)
  if (direction === "long") {
    if (stochRsiK < 30) factors.stochRsiPosition = 10;
    else if (stochRsiK < 50) factors.stochRsiPosition = 6;
    else if (stochRsiK < 70) factors.stochRsiPosition = 3;
    else {
      factors.stochRsiPosition = 0;
      warnings.push("StochRSI overbought for long entry");
    }
  } else {
    if (stochRsiK > 70) factors.stochRsiPosition = 10;
    else if (stochRsiK > 50) factors.stochRsiPosition = 6;
    else if (stochRsiK > 30) factors.stochRsiPosition = 3;
    else {
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

  // Calculate total score
  const totalScore = 
    factors.momentumAlignment +
    factors.pullbackQuality +
    factors.volumeConfirmation +
    factors.timeframeAlignment +
    factors.stochRsiPosition +
    factors.macdExpanding;

  // Determine grade
  let grade: "A" | "B" | "C" | "D" | "F" = "F";
  if (totalScore >= 85) grade = "A";
  else if (totalScore >= 70) grade = "B";
  else if (totalScore >= 55) grade = "C";
  else if (totalScore >= 40) grade = "D";

  return {
    score: Math.round(totalScore),
    grade,
    factors,
    isRecommended: totalScore >= 60 && !momentumScore.isExhausted,
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
