import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ============= SHARED MODULES - Single source of truth =============
import { ADX_THRESHOLDS, STOCHRSI_THRESHOLDS, RSI_THRESHOLDS, CONFIDENCE_THRESHOLDS, EMERGENCY_EXIT_PARAMS, EXIT_THRESHOLDS, TIME_IN_EXTREME_PARAMS, MICRO_TREND_PARAMS, MOMENTUM_CONTINUATION_PARAMS, STEALTH_TREND_PARAMS, NEUTRAL_PERSISTENCE_PARAMS } from "../_shared/constants.ts";
import { 
  calculateEMA, calculateEMAArray, calculateRSI, calculateRSIArray, calculateMACD,
  calculateStochasticRSI, calculateBarsAtExtreme, calculateATR, calculateHistoricalATRAvg,
  calculateADXWithDirection, calculateADX, calculateVolumeAnalysis, ADXResult
} from "../_shared/indicators.ts";
import { calculateTrend, enhanceConfidenceWithIndicators, TrendResult } from "../_shared/trend-core.ts";
import { createLogger, logMetrics, logError, LOG_CATEGORIES } from "../_shared/logging.ts";
import { getKlines, parseKlinePrices } from "../_shared/binance.ts";

// Create logger for this function
const logger = createLogger('calculate-trend');

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============= BOLLINGER BANDS (specific to calculate-trend) =============
function calculateBollingerBands(prices: number[], period = 20, stdDevMultiplier = 2): {
  upper: number;
  middle: number;
  lower: number;
  bandwidth: number;
  percentB: number;
  squeeze: boolean;
  squeezeIntensity: number;
  pricePosition: "above_upper" | "upper_zone" | "middle" | "lower_zone" | "below_lower";
} {
  if (prices.length < period) {
    return {
      upper: 0, middle: 0, lower: 0, bandwidth: 0, percentB: 50,
      squeeze: false, squeezeIntensity: 0, pricePosition: "middle"
    };
  }

  const historyWindow = Math.min(50, prices.length - period);
  let rollingSum = 0, rollingSumSq = 0;
  const startIdx = prices.length - period - historyWindow;
  const actualStartIdx = Math.max(0, startIdx);
  
  for (let i = actualStartIdx; i < actualStartIdx + period; i++) {
    rollingSum += prices[i];
    rollingSumSq += prices[i] * prices[i];
  }
  
  let bandwidthSum = 0, bandwidthCount = 0;
  
  for (let windowEnd = actualStartIdx + period; windowEnd <= prices.length; windowEnd++) {
    const sma = rollingSum / period;
    const variance = (rollingSumSq / period) - (sma * sma);
    const stdDev = Math.sqrt(Math.max(0, variance));
    
    const upper = sma + (stdDevMultiplier * stdDev);
    const lower = sma - (stdDevMultiplier * stdDev);
    const bw = sma !== 0 ? ((upper - lower) / sma) * 100 : 0;
    
    if (windowEnd < prices.length) {
      bandwidthSum += bw;
      bandwidthCount++;
      const removeIdx = windowEnd - period;
      const addIdx = windowEnd;
      rollingSum = rollingSum - prices[removeIdx] + prices[addIdx];
      rollingSumSq = rollingSumSq - (prices[removeIdx] * prices[removeIdx]) + (prices[addIdx] * prices[addIdx]);
    } else {
      const currentPrice = prices[prices.length - 1];
      const bandRange = upper - lower;
      const percentB = bandRange !== 0 ? ((currentPrice - lower) / bandRange) * 100 : 50;
      const avgBandwidth = bandwidthCount > 0 ? bandwidthSum / bandwidthCount : bw;
      const squeeze = bw < avgBandwidth * 0.75;
      const squeezeIntensity = avgBandwidth > 0 
        ? Math.max(0, Math.min(100, (1 - bw / avgBandwidth) * 100)) 
        : 0;
      
      let pricePosition: "above_upper" | "upper_zone" | "middle" | "lower_zone" | "below_lower" = "middle";
      if (currentPrice > upper) pricePosition = "above_upper";
      else if (currentPrice > sma + (stdDev * 1)) pricePosition = "upper_zone";
      else if (currentPrice < lower) pricePosition = "below_lower";
      else if (currentPrice < sma - (stdDev * 1)) pricePosition = "lower_zone";
      
      return {
        upper: Math.round(upper * 100) / 100,
        middle: Math.round(sma * 100) / 100,
        lower: Math.round(lower * 100) / 100,
        bandwidth: Math.round(bw * 100) / 100,
        percentB: Math.round(percentB * 10) / 10,
        squeeze,
        squeezeIntensity: Math.round(squeezeIntensity),
        pricePosition
      };
    }
  }
  
  return {
    upper: 0, middle: 0, lower: 0, bandwidth: 0, percentB: 50,
    squeeze: false, squeezeIntensity: 0, pricePosition: "middle"
  };
}

// ============= BINANCE API (using shared utilities) =============
async function fetchBinanceKlines(symbol: string, interval: string = "1h", limit: number = 100, retries: number = 2): Promise<any[]> {
  try {
    return await getKlines(symbol, interval, limit, retries);
  } catch (error) {
    logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.BINANCE} Failed to fetch klines on ${interval}: ${error}`);
    throw error;
  }
}

// ============= MARKET STRUCTURE VALIDATION =============
function validateMarketStructure(
  klines: any[],
  trend: "bullish" | "bearish" | "neutral",
): { valid: boolean; confidence: number } {
  if (klines.length < 10) return { valid: false, confidence: 0 };

  const highs = klines.slice(-10).map((k: any) => parseFloat(k[2])).filter(Number.isFinite);
  const lows = klines.slice(-10).map((k: any) => parseFloat(k[3])).filter(Number.isFinite);

  if (trend === "bullish") {
    let higherHighs = 0, higherLows = 0;
    for (let i = 1; i < highs.length; i++) {
      if (highs[i] > highs[i - 1]) higherHighs++;
      if (lows[i] > lows[i - 1]) higherLows++;
    }
    const hhPercent = highs.length > 1 ? (higherHighs / (highs.length - 1)) * 100 : 0;
    const hlPercent = lows.length > 1 ? (higherLows / (lows.length - 1)) * 100 : 0;
    const structureScore = (hhPercent + hlPercent) / 2;
    return { valid: structureScore > 50, confidence: structureScore };
  } else if (trend === "bearish") {
    let lowerHighs = 0, lowerLows = 0;
    for (let i = 1; i < highs.length; i++) {
      if (highs[i] < highs[i - 1]) lowerHighs++;
      if (lows[i] < lows[i - 1]) lowerLows++;
    }
    const lhPercent = highs.length > 1 ? (lowerHighs / (highs.length - 1)) * 100 : 0;
    const llPercent = lows.length > 1 ? (lowerLows / (lows.length - 1)) * 100 : 0;
    const structureScore = (lhPercent + llPercent) / 2;
    return { valid: structureScore > 50, confidence: structureScore };
  }
  return { valid: false, confidence: 0 };
}

// ============= HELPER FUNCTIONS =============
function calculateRecommendedPositionSize(divergenceType: string): number {
  switch (divergenceType) {
    case "aligned": return 100;
    case "pullback": return 50;
    case "early_reversal": return 40;
    default: return 0;
  }
}

function calculateTradeDirection(
  divergenceType: string,
  dominantTrend: "bullish" | "bearish" | "neutral",
  trend1hTrend: "bullish" | "bearish" | "neutral",
  primaryTrend: "bullish" | "bearish" | "neutral" | "ranging"
): "bullish" | "bearish" | "neutral" | "ranging" {
  if (divergenceType === "pullback") return dominantTrend;
  if (divergenceType === "early_reversal") return trend1hTrend;
  return primaryTrend;
}

// Helper for pullback RSI zone check
function rsiInPullbackZone(rsi: number, trend: string): boolean {
  if (trend === "bullish") {
    return rsi < RSI_THRESHOLDS.NEUTRAL_HIGH && rsi > RSI_THRESHOLDS.OVERSOLD;
  } else if (trend === "bearish") {
    return rsi > RSI_THRESHOLDS.NEUTRAL_LOW && rsi < RSI_THRESHOLDS.OVERBOUGHT;
  }
  return false;
}

// ============= PHASE 1: COUNT CONSECUTIVE BARS IN DIRECTION =============
// Accurately counts how many consecutive bars the MACD histogram has been positive or negative
// This replaces the heuristic estimation for micro-trend persistence validation
function countConsecutiveBarsInDirection(histogramArray: number[] | undefined): number {
  if (!histogramArray || histogramArray.length < 2) return 0;
  
  const lastVal = histogramArray[histogramArray.length - 1];
  if (Math.abs(lastVal) < 0.0001) return 0; // Effectively zero
  
  const isPositive = lastVal > 0;
  let count = 0;
  
  for (let i = histogramArray.length - 1; i >= 0; i--) {
    const val = histogramArray[i];
    if ((isPositive && val > 0) || (!isPositive && val < 0)) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

// ============= STEALTH TREND DETECTION =============
// Detects gradual price grinds that slip through ADX/momentum filters
// These "stealth" moves accumulate to significant drops (2-4%) while ADX stays low
interface StealthTrendResult {
  detected: boolean;
  direction: "bullish" | "bearish" | "neutral";
  driftPercent: number;
  driftDuration: number; // hours
  adxBypassAllowed: boolean;
  htfBypassAllowed: boolean;
  stealthScore: number; // 0-100
  positionMultiplier: number;
  stopMultiplier: number;
  reason: string;
}

function calculateStealthTrend(
  klines15m: any[],
  currentADX: number,
  trend1h: { trend: string; confidence: number },
  trend30m: { trend: string; confidence: number },
  stochRsiK4h: number
): StealthTrendResult {
  const params = STEALTH_TREND_PARAMS;
  
  // Default result (no stealth trend)
  const defaultResult: StealthTrendResult = {
    detected: false,
    direction: "neutral",
    driftPercent: 0,
    driftDuration: params.DRIFT_WINDOW_HOURS,
    adxBypassAllowed: false,
    htfBypassAllowed: false,
    stealthScore: 0,
    positionMultiplier: 1.0,
    stopMultiplier: 1.0,
    reason: "No stealth trend detected"
  };
  
  if (!params.ENABLED || klines15m.length < 20) {
    return defaultResult;
  }
  
  // Calculate price at start of drift window (8 hours ago using 15m candles)
  const candlesPerHour = 4; // 15-minute candles
  const lookbackCandles = params.DRIFT_WINDOW_HOURS * candlesPerHour;
  
  const currentClose = parseFloat(klines15m[klines15m.length - 1][4]);
  const pastIndex = Math.max(0, klines15m.length - 1 - lookbackCandles);
  const pastClose = parseFloat(klines15m[pastIndex][4]);
  
  if (!Number.isFinite(currentClose) || !Number.isFinite(pastClose) || pastClose === 0) {
    return defaultResult;
  }
  
  const driftPercent = ((currentClose - pastClose) / pastClose) * 100;
  const absDrift = Math.abs(driftPercent);
  
  // ===== DRIFT-BASED ADX THRESHOLD SCALING =====
  // Larger drifts can tolerate higher ADX values and still be "stealth"
  // This fixes the "ADX dead zone" (22-25) where moves are blocked
  let effectiveMaxADX: number = params.MAX_ADX_FOR_STEALTH; // Base: 25
  
  if (absDrift >= 2.5 && params.ADX_SCALE_STRONG_DRIFT) {
    effectiveMaxADX = params.ADX_SCALE_STRONG_DRIFT as number; // 28 for strong drift
  } else if (absDrift >= 2.0 && params.ADX_SCALE_MODERATE_DRIFT) {
    effectiveMaxADX = params.ADX_SCALE_MODERATE_DRIFT as number; // 26 for moderate drift
  }
  
  // Check if this qualifies as stealth trend (basic check)
  const isBasicStealthDetected = 
    absDrift >= params.MIN_DRIFT_PERCENT &&
    currentADX <= effectiveMaxADX;
  
  // Direction based on drift
  const direction: "bullish" | "bearish" | "neutral" = 
    driftPercent < -params.MIN_DRIFT_PERCENT ? "bearish" :
    driftPercent > params.MIN_DRIFT_PERCENT ? "bullish" : "neutral";
  
  // ===== MONOTONICITY CHECK =====
  // Prevents false triggers during Asia session chop, pre-news compression, range oscillation
  let isMonotonic = true;
  let monotonicConsistency = 0;
  let maxCounterMove = 0;
  
  if (params.REQUIRE_MONOTONIC_DRIFT && isBasicStealthDetected) {
    const candlesInWindow = klines15m.slice(-lookbackCandles);
    let barsInDriftDirection = 0;
    
    for (let i = 1; i < candlesInWindow.length; i++) {
      const close = parseFloat(candlesInWindow[i][4]);
      const prevClose = parseFloat(candlesInWindow[i - 1][4]);
      
      if (!Number.isFinite(close) || !Number.isFinite(prevClose) || prevClose === 0) continue;
      
      const barMove = ((close - prevClose) / prevClose) * 100;
      
      // Count bars moving in drift direction
      if ((driftPercent < 0 && barMove < 0) || (driftPercent > 0 && barMove > 0)) {
        barsInDriftDirection++;
      }
      
      // Track largest counter-move
      if ((driftPercent < 0 && barMove > 0) || (driftPercent > 0 && barMove < 0)) {
        maxCounterMove = Math.max(maxCounterMove, Math.abs(barMove));
      }
    }
    
    const totalBars = candlesInWindow.length - 1;
    monotonicConsistency = totalBars > 0 ? (barsInDriftDirection / totalBars) * 100 : 0;
    
    isMonotonic = monotonicConsistency >= params.MONOTONIC_MIN_CONSISTENCY_PERCENT &&
                  maxCounterMove <= params.MAX_COUNTER_MOVE_PERCENT;
    
    if (!isMonotonic) {
      return {
        ...defaultResult,
        driftPercent: Math.round(driftPercent * 100) / 100,
        reason: `Drift not monotonic: ${monotonicConsistency.toFixed(0)}% consistency (need ${params.MONOTONIC_MIN_CONSISTENCY_PERCENT}%), max counter-move ${maxCounterMove.toFixed(2)}% (max ${params.MAX_COUNTER_MOVE_PERCENT}%)`
      };
    }
  }
  
  // Full stealth detection after monotonicity check
  const isStealthDetected = isBasicStealthDetected && isMonotonic;
  
  // Can we bypass ADX gates?
  const adxBypassAllowed = 
    isStealthDetected && 
    currentADX >= params.ADX_BYPASS_MINIMUM;
  
  // Safety gate: Block at StochRSI extremes
  const isStochRsiSafe = !params.BLOCK_AT_STOCHRSI_EXTREMES || 
    (stochRsiK4h >= params.STOCHRSI_EXTREME_THRESHOLD && stochRsiK4h <= (100 - params.STOCHRSI_EXTREME_THRESHOLD));
  
  // Calculate stealth score (how confident are we in this pattern)
  let stealthScore = 0;
  let reason = "";
  
  if (isStealthDetected) {
    // Points for drift size (up to 40 points)
    stealthScore += Math.min(40, absDrift * 20);
    
    // Lower ADX = more stealth (up to 20 points)
    // Use effectiveMaxADX for proper scaling
    stealthScore += Math.min(20, (effectiveMaxADX - currentADX) * 2);
    
    // ===== Extra points for very large drifts =====
    // Larger drifts are stronger signals even with elevated ADX
    if (absDrift >= 2.5) {
      stealthScore += 15;  // Strong drift bonus
    } else if (absDrift >= 2.0) {
      stealthScore += 10;  // Moderate drift bonus
    }
    
    // ===== Bonus for high monotonicity (up to 15 points) =====
    // More consistent drift = higher confidence
    if (monotonicConsistency >= 80) {
      stealthScore += 15;
    } else if (monotonicConsistency >= 75) {
      stealthScore += 10;
    } else if (monotonicConsistency >= 70) {
      stealthScore += 5;
    }
    
    // Bonus if 1h trend matches drift direction (15 points)
    if (params.REQUIRE_1H_ALIGNMENT || true) {
      if ((direction === "bearish" && trend1h.trend === "bearish") ||
          (direction === "bullish" && trend1h.trend === "bullish")) {
        stealthScore += 15;
        if (trend1h.confidence >= params.MIN_1H_CONFIDENCE_FOR_ALIGNMENT) {
          stealthScore += 5;
        }
      }
    }
    
    // Bonus if 30m also aligns (10 points)
    if (!params.REQUIRE_30M_ALIGNMENT || 
        ((direction === "bearish" && trend30m.trend === "bearish") ||
         (direction === "bullish" && trend30m.trend === "bullish"))) {
      stealthScore += 10;
    }
    
    // Penalty if StochRSI is at dangerous extremes
    if (!isStochRsiSafe) {
      stealthScore -= 20;
    }
    
    stealthScore = Math.max(0, Math.min(100, stealthScore));
    reason = `${direction} drift ${driftPercent.toFixed(2)}% over ${params.DRIFT_WINDOW_HOURS}h with ADX ${currentADX.toFixed(1)} (max=${effectiveMaxADX}), monotonic ${monotonicConsistency.toFixed(0)}%, score ${stealthScore}`;
  }
  
  // Determine HTF bypass eligibility (higher bar)
  const htfBypassAllowed = isStealthDetected && 
    stealthScore >= params.MIN_SCORE_FOR_HTF_BYPASS &&
    isStochRsiSafe;
  
  // Calculate position size based on stealth strength
  let positionMultiplier = 1.0;
  if (isStealthDetected && stealthScore >= params.MIN_SCORE_FOR_ADX_BYPASS) {
    if (absDrift >= params.STRONG_DRIFT_PERCENT) {
      positionMultiplier = params.STRONG_STEALTH_POSITION_PERCENT / 100;
    } else {
      positionMultiplier = params.MAX_POSITION_PERCENT / 100;
    }
  }
  
  return {
    detected: isStealthDetected && stealthScore >= params.MIN_SCORE_FOR_ADX_BYPASS,
    direction,
    driftPercent: Math.round(driftPercent * 100) / 100,
    driftDuration: params.DRIFT_WINDOW_HOURS,
    adxBypassAllowed: adxBypassAllowed && stealthScore >= params.MIN_SCORE_FOR_ADX_BYPASS,
    htfBypassAllowed,
    stealthScore,
    positionMultiplier,
    stopMultiplier: params.STOP_MULTIPLIER,
    reason: isStealthDetected ? reason : "No stealth trend detected (drift or ADX outside range)"
  };
}

// ============= NEUTRAL PERSISTENCE MODELING =============
// Tracks how long a market has been neutral
// Longer neutral periods that resolve into drift are more meaningful
// This is a CONFIDENCE MULTIPLIER, never a gate bypass
interface NeutralPersistenceResult {
  isCurrentlyNeutral: boolean;
  neutralDurationMinutes: number;
  confidenceBonus: number;
  reason: string;
}

function calculateNeutralPersistence(
  klines15m: any[],
  trend4h: { trend: string; confidence: number },
  trend1h: { trend: string; confidence: number },
  trend30m: { trend: string; confidence: number },
  currentNetSignal: number
): NeutralPersistenceResult {
  const params = NEUTRAL_PERSISTENCE_PARAMS;
  
  // Default result
  const defaultResult: NeutralPersistenceResult = {
    isCurrentlyNeutral: false,
    neutralDurationMinutes: 0,
    confidenceBonus: 0,
    reason: "Not neutral or not tracked"
  };
  
  if (!params.ENABLED || klines15m.length < 20) {
    return defaultResult;
  }
  
  // Check if currently neutral (all TFs below threshold)
  const isNeutral = 
    trend4h.confidence < params.NEUTRAL_CONFIDENCE_THRESHOLD &&
    trend1h.confidence < params.NEUTRAL_CONFIDENCE_THRESHOLD &&
    trend30m.confidence < params.NEUTRAL_CONFIDENCE_THRESHOLD &&
    Math.abs(currentNetSignal) <= params.MAX_NET_SIGNAL_FOR_NEUTRAL;
  
  if (!isNeutral) {
    return { ...defaultResult, reason: "Market not currently neutral" };
  }
  
  // Count how many candles have been neutral (look back through 15m candles)
  // Check price oscillation pattern - true neutral shows small, alternating moves
  let neutralBars = 0;
  const candlesPerHour = 4;
  const maxLookback = Math.floor(params.MAX_DURATION_CAP_MINUTES / 15);
  const lookbackCandles = Math.min(maxLookback, klines15m.length - 1);
  
  for (let i = klines15m.length - 1; i >= klines15m.length - lookbackCandles && i >= 1; i--) {
    const close = parseFloat(klines15m[i][4]);
    const open = parseFloat(klines15m[i][1]);
    const prevClose = parseFloat(klines15m[i-1][4]);
    
    if (!Number.isFinite(close) || !Number.isFinite(open) || !Number.isFinite(prevClose) || open === 0 || prevClose === 0) {
      continue;
    }
    
    // Bar is "neutral" if it's small and doesn't strongly continue prior direction
    const barChange = Math.abs((close - open) / open) * 100;
    const interBarChange = Math.abs((close - prevClose) / prevClose) * 100;
    
    // Neutral bar criteria: small candle, no strong momentum
    if (barChange < 0.3 && interBarChange < 0.4) {
      neutralBars++;
    } else {
      break;  // Sequence broken
    }
  }
  
  const neutralDurationMinutes = neutralBars * 15;
  
  if (neutralDurationMinutes < params.MIN_DURATION_MINUTES) {
    return {
      isCurrentlyNeutral: true,
      neutralDurationMinutes,
      confidenceBonus: 0,
      reason: `Neutral for ${neutralDurationMinutes}min (min: ${params.MIN_DURATION_MINUTES})`
    };
  }
  
  // Calculate bonus (capped)
  const hours = Math.min(neutralDurationMinutes / 60, params.MAX_DURATION_CAP_MINUTES / 60);
  const confidenceBonus = Math.min(params.MAX_BONUS, Math.floor(hours * params.BONUS_PER_HOUR));
  
  return {
    isCurrentlyNeutral: true,
    neutralDurationMinutes,
    confidenceBonus,
    reason: `Neutral for ${neutralDurationMinutes}min, bonus: +${confidenceBonus}`
  };
}

// ============= MICRO-TREND DETECTION =============
// When 4h is neutral, look at 15m/30m for short-term trend direction
// This allows signals when lower timeframes show consistent direction
// PHASE 2: Added persistence, volume, ADX requirements
interface MicroTrendResult {
  hasMicroTrend: boolean;
  direction: "bullish" | "bearish" | "neutral";
  confidence: number;
  alignment: number;  // 0-100 score for how aligned 15m/30m are
  reason: string;
  // PHASE 2: New fields for hardening
  persistence: number;       // How many bars the micro-trend has persisted
  volumeConfirmed: boolean;  // Whether volume confirms the micro-trend
  validForCandles: number;   // Expiry in candles
  adxSufficient: boolean;    // Whether ADX meets minimum requirement
  blocked: boolean;          // True if micro-trend is detected but fails safety checks
  blockReason: string;       // Reason for blocking if applicable
}

function detectMicroTrend(
  trend15m: { trend: string; confidence: number; indicators: any },
  trend30m: { trend: string; confidence: number; indicators: any },
  trend1h: { trend: string; confidence: number; indicators: any },
  adx: number = 25,
  // PHASE 2: New parameters for hardening
  volumeRatio: number = 1.0,
  volumeAboveMA: boolean = false,
  barsAligned15m: number = 0,  // Number of consecutive bars 15m has been in same direction
  barsAligned30m: number = 0   // Number of consecutive bars 30m has been in same direction
): MicroTrendResult {
  const t15m = trend15m.trend;
  const t30m = trend30m.trend;
  const t1h = trend1h.trend;
  const conf15m = trend15m.confidence;
  const conf30m = trend30m.confidence;
  const conf1h = trend1h.confidence;
  
  // Get MACD histogram direction for each timeframe
  const macd15m = trend15m.indicators?.macdHistogram || 0;
  const macd30m = trend30m.indicators?.macdHistogram || 0;
  const macd1h = trend1h.indicators?.macdHistogram || 0;
  
  // Check if 15m and 30m agree on direction
  const bothBullish = t15m === "bullish" && t30m === "bullish";
  const bothBearish = t15m === "bearish" && t30m === "bearish";
  const lowerTFsAligned = bothBullish || bothBearish;
  
  // Check MACD agreement
  const macdBullish = macd15m > 0 && macd30m > 0;
  const macdBearish = macd15m < 0 && macd30m < 0;
  const macdAligned = macdBullish || macdBearish;
  
  // Calculate alignment score
  let alignmentScore = 0;
  if (lowerTFsAligned) alignmentScore += 40;
  if (macdAligned) alignmentScore += 30;
  
  // Bonus if 1h also agrees or is neutral
  if (bothBullish && (t1h === "bullish" || t1h === "neutral")) alignmentScore += 20;
  if (bothBearish && (t1h === "bearish" || t1h === "neutral")) alignmentScore += 20;
  
  // Confidence averaging
  const avgConfidence = (conf15m + conf30m) / 2;
  if (avgConfidence >= 55) alignmentScore += 10;
  
  // Determine micro-trend direction
  let direction: "bullish" | "bearish" | "neutral" = "neutral";
  let hasMicroTrend = false;
  let reason = "";
  
  // MICRO-TREND DETECTED: Lower timeframes strongly aligned
  if (lowerTFsAligned && alignmentScore >= 50) {
    direction = bothBullish ? "bullish" : "bearish";
    hasMicroTrend = true;
    reason = `15m+30m aligned ${direction} (score=${alignmentScore}, conf=${avgConfidence.toFixed(0)}%)`;
    
    // Extra strong if 1h also agrees
    if ((bothBullish && t1h === "bullish") || (bothBearish && t1h === "bearish")) {
      alignmentScore = Math.min(100, alignmentScore + 15);
      reason = `15m+30m+1h aligned ${direction} (score=${alignmentScore}, conf=${avgConfidence.toFixed(0)}%)`;
    }
  } 
  // WEAK MICRO-TREND: One lower TF directional, other neutral
  else if ((t15m !== "neutral" && t30m === "neutral") || (t15m === "neutral" && t30m !== "neutral")) {
    const directionalTF = t15m !== "neutral" ? t15m : t30m;
    const directionalConf = t15m !== "neutral" ? conf15m : conf30m;
    
    // Only accept if MACD confirms and confidence is good
    if (macdAligned && directionalConf >= 55) {
      direction = directionalTF as "bullish" | "bearish";
      hasMicroTrend = true;
      alignmentScore = Math.min(alignmentScore + 20, 60); // Cap at 60 for partial alignment
      reason = `${t15m !== "neutral" ? "15m" : "30m"} ${direction} with MACD confirm (score=${alignmentScore})`;
    }
  }
  
  // ADX bonus: strong micro-trends get extra credit
  if (hasMicroTrend && adx >= ADX_THRESHOLDS.MODERATE) {
    alignmentScore = Math.min(100, alignmentScore + 10);
  }
  
  // ===== PHASE 2: MICRO-TREND HARDENING CHECKS =====
  // Calculate persistence (minimum of both timeframes' alignment duration)
  const persistence = Math.min(barsAligned15m, barsAligned30m);
  
  // Check volume confirmation
  const volumeConfirmed = MICRO_TREND_PARAMS.REQUIRE_VOLUME_CONFIRMATION 
    ? (volumeAboveMA || volumeRatio >= MICRO_TREND_PARAMS.MIN_VOLUME_RATIO)
    : true;
  
  // Check ADX requirement
  const adxSufficient = adx >= MICRO_TREND_PARAMS.MIN_ADX;
  
  // Determine if micro-trend is blocked by safety checks
  let blocked = false;
  let blockReason = "";
  
  if (hasMicroTrend) {
    // Check all safety gates
    if (!adxSufficient) {
      blocked = true;
      blockReason = `ADX ${adx.toFixed(1)} < ${MICRO_TREND_PARAMS.MIN_ADX} required`;
    } else if (persistence < MICRO_TREND_PARAMS.MIN_PERSISTENCE_BARS) {
      blocked = true;
      blockReason = `Persistence ${persistence} bars < ${MICRO_TREND_PARAMS.MIN_PERSISTENCE_BARS} required`;
    } else if (!volumeConfirmed) {
      blocked = true;
      blockReason = `Volume not confirmed (ratio=${volumeRatio.toFixed(2)}, aboveMA=${volumeAboveMA})`;
    } else if (alignmentScore < MICRO_TREND_PARAMS.MIN_ALIGNMENT_SCORE) {
      blocked = true;
      blockReason = `Alignment ${alignmentScore} < ${MICRO_TREND_PARAMS.MIN_ALIGNMENT_SCORE} required`;
    } else if (avgConfidence < MICRO_TREND_PARAMS.MIN_AVG_CONFIDENCE) {
      blocked = true;
      blockReason = `Avg confidence ${avgConfidence.toFixed(0)}% < ${MICRO_TREND_PARAMS.MIN_AVG_CONFIDENCE}% required`;
    }
    
    if (blocked) {
      reason = `${reason} [BLOCKED: ${blockReason}]`;
    }
  }
  
  return {
    hasMicroTrend: hasMicroTrend && !blocked, // Only true if passes all checks
    direction,
    confidence: avgConfidence,
    alignment: alignmentScore,
    reason: reason || "No micro-trend detected (15m/30m not aligned)",
    // PHASE 2: New fields
    persistence,
    volumeConfirmed,
    validForCandles: MICRO_TREND_PARAMS.VALID_FOR_CANDLES,
    adxSufficient,
    blocked,
    blockReason
  };
}

// ============= TRUE ALIGNMENT SCORE =============
function calculateTrueAlignmentScore(
  trend4h: { trend: string; confidence: number; indicators: any },
  trend1h: { trend: string; confidence: number; indicators: any },
  trend30m: { trend: string; confidence: number; indicators: any },
  trend15m: { trend: string; confidence: number; indicators: any },
  dominantTrend: string,
  adx: number = 25,
  volumeConfirms: boolean = false
): { score: number; breakdown: { directionScore: number; indicatorScore: number; penaltyScore: number }; neutralCapped: boolean } {
  let directionScore = 0, indicatorScore = 0, penaltyScore = 0;
  
  const trends = [
    { tf: "4h", trend: trend4h.trend, weight: 35, indicators: trend4h.indicators },
    { tf: "1h", trend: trend1h.trend, weight: 30, indicators: trend1h.indicators },
    { tf: "30m", trend: trend30m.trend, weight: 20, indicators: trend30m.indicators },
    { tf: "15m", trend: trend15m.trend, weight: 15, indicators: trend15m.indicators },
  ];
  
  for (const tf of trends) {
    if (dominantTrend === "neutral") {
      const agreesWithMajority = tf.trend === trend1h.trend;
      if (agreesWithMajority && tf.trend !== "neutral") {
        directionScore += tf.weight * 0.6;
      } else if (tf.trend === "neutral") {
        directionScore += tf.weight * 0.3;
      }
    } else {
      if (tf.trend === dominantTrend) {
        directionScore += tf.weight * 0.6;
      } else if (tf.trend === "neutral") {
        directionScore += tf.weight * 0.3;
      } else {
        penaltyScore += tf.weight * 0.3;
      }
    }
  }
  
  const macdHistograms = [
    trend4h.indicators?.macdHistogram || 0,
    trend1h.indicators?.macdHistogram || 0,
    trend30m.indicators?.macdHistogram || 0,
    trend15m.indicators?.macdHistogram || 0,
  ];
  
  const macdBullish = macdHistograms.filter(m => m > 0).length;
  const macdBearish = macdHistograms.filter(m => m < 0).length;
  const macdAgreement = Math.max(macdBullish, macdBearish);
  
  if (macdAgreement === 4) indicatorScore += 15;
  else if (macdAgreement === 3) indicatorScore += 10;
  else if (macdAgreement === 2) indicatorScore += 5;
  
  const rsiSignals = [
    trend4h.indicators?.rsiSignal || "neutral",
    trend1h.indicators?.rsiSignal || "neutral",
    trend30m.indicators?.rsiSignal || "neutral",
    trend15m.indicators?.rsiSignal || "neutral",
  ];
  
  const rsiBullish = rsiSignals.filter(s => s === "bullish" || s === "strong_bullish" || s === "overbought").length;
  const rsiBearish = rsiSignals.filter(s => s === "bearish" || s === "oversold").length;
  const rsiAgreement = Math.max(rsiBullish, rsiBearish);
  
  if (rsiAgreement >= 3) indicatorScore += 10;
  else if (rsiAgreement >= 2) indicatorScore += 5;
  
  const rawScore = directionScore + indicatorScore - penaltyScore;
  let normalizedScore = Math.min(Math.max(Math.round(rawScore * 1.18), 0), 100);
  
  let neutralCapped = false;
  if (dominantTrend === "neutral" && adx < ADX_THRESHOLDS.MINIMUM) {
    const maxNeutralScore = volumeConfirms ? 70 : 60;
    if (normalizedScore > maxNeutralScore) {
      normalizedScore = maxNeutralScore;
      neutralCapped = true;
    }
  }
  
  return {
    score: normalizedScore,
    breakdown: {
      directionScore: Math.round(directionScore),
      indicatorScore: Math.round(indicatorScore),
      penaltyScore: Math.round(penaltyScore),
    },
    neutralCapped,
  };
}

// ============= MAIN HTTP HANDLER =============
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let body: { 
      symbol?: string; 
      historicalKlines?: { '15m': any[]; '30m': any[]; '1h': any[]; '4h': any[] };
      backtestMode?: boolean;
      batchKlines?: Array<{ timestamp: number; klines: { '15m': any[]; '30m': any[]; '1h': any[]; '4h': any[] } }>;
    };
    
    try {
      body = await req.json();
    } catch (parseError) {
      return new Response(
        JSON.stringify({ error: "Invalid JSON in request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const { symbol, historicalKlines, backtestMode, batchKlines } = body;
    
    // ============= BATCH MODE FOR BACKTESTING =============
    if (batchKlines && batchKlines.length > 0 && symbol) {
      logger.forSymbol(symbol).info(`${LOG_CATEGORIES.START} BATCH MODE: Processing ${batchKlines.length} candles`);
      
      const results: Array<{ timestamp: number; data: any; error?: string }> = [];
      
      for (const batch of batchKlines) {
        try {
          const bKlines1h = batch.klines['1h'] || [];
          const bKlines4h = batch.klines['4h'] || [];
          
          if (bKlines1h.length < 50 || bKlines4h.length < 20) {
            results.push({ timestamp: batch.timestamp, data: null, error: 'insufficient_data' });
            continue;
          }
          
          const bPrices1h = bKlines1h.map((k: any) => parseFloat(k[4])).filter(Number.isFinite);
          const bPrices4h = bKlines4h.map((k: any) => parseFloat(k[4])).filter(Number.isFinite);
          
          if (bPrices1h.length === 0) {
            results.push({ timestamp: batch.timestamp, data: null, error: 'no_price_data' });
            continue;
          }
          
          const bCurrentPrice = bPrices1h[bPrices1h.length - 1];
          const bTrend1h = calculateTrend(bPrices1h);
          const bTrend4h = calculateTrend(bPrices4h);
          
          const bStochRsi1h = calculateStochasticRSI(bPrices1h, 14, 14, 3, 3, bTrend1h.indicators.rsiArray);
          const bStochRsi4h = calculateStochasticRSI(bPrices4h, 14, 14, 3, 3, bTrend4h.indicators.rsiArray);
          
          const bAdxResult = calculateADXWithDirection(bKlines1h, 14);
          const bAdx = bAdxResult.adx;
          const bCurrentATR = calculateATR(bKlines1h, 14);
          const bAtrPercent = bCurrentPrice !== 0 ? (bCurrentATR / bCurrentPrice) * 100 : 0;
          const bHistoricalATRAvg = calculateHistoricalATRAvg(bKlines1h, 14, 30, bCurrentATR);
          const bRelativeATR = bHistoricalATRAvg !== 0 ? bCurrentATR / bHistoricalATRAvg : 0;
          
          const bIsAligned = bTrend4h.trend !== "neutral" && 
            (bTrend1h.trend === bTrend4h.trend || bTrend1h.trend === "neutral");
          
          const bVolume1h = calculateVolumeAnalysis(bKlines1h);
          
          // PHASE 2: Aligned batch mode with single mode - include adxRising, barsAtExtreme, bollingerBands
          const bAdxRising = bAdxResult.adxRising;
          const bMacdExpanding = Math.abs(bTrend1h.indicators.macdHistogram) > 
            Math.abs(bTrend1h.indicators.macdHistogramArray?.[bTrend1h.indicators.macdHistogramArray.length - 2] || 0);
          const bLastClose = bPrices1h[bPrices1h.length - 1] || 0;
          const bPrevClose = bPrices1h[bPrices1h.length - 2] || bLastClose;
          const bLastCloseAligns = bTrend4h.trend === "bullish" ? bLastClose > bPrevClose : 
            bTrend4h.trend === "bearish" ? bLastClose < bPrevClose : true;
          const bMomentumConfirms = bMacdExpanding && bLastCloseAligns && bAdx >= ADX_THRESHOLDS.MINIMUM && bAdxRising;
          
          // Calculate barsAtExtreme for StochRSI (aligned with single mode)
          const bBarsAtExtreme1h = calculateBarsAtExtreme(
            bStochRsi1h.kArray,
            TIME_IN_EXTREME_PARAMS.OVERBOUGHT_EXTREME,
            TIME_IN_EXTREME_PARAMS.OVERSOLD_EXTREME
          );
          
          // Calculate Bollinger Bands for batch mode (aligned with single mode)
          const bBollingerBands = calculateBollingerBands(bPrices1h, 20, 2);
          
          // Fake breakout detection (aligned with single mode)
          const bFakeBreakoutRisk = bMacdExpanding && !bAdxRising;
          const bGenuineMomentum = bMacdExpanding && bAdxRising;
          
          results.push({
            timestamp: batch.timestamp,
            data: {
              trend4h: { trend: bTrend4h.trend, confidence: bTrend4h.confidence },
              trend1h: { trend: bTrend1h.trend, confidence: bTrend1h.confidence },
              stochRsi4h: { k: bStochRsi4h.k, d: bStochRsi4h.d, signal: bStochRsi4h.signal },
              stochRsi1h: { k: bStochRsi1h.k, d: bStochRsi1h.d, signal: bStochRsi1h.signal, barsAtExtreme: bBarsAtExtreme1h },
              volatility: { adx: bAdx, atrPercent: bAtrPercent, adxRising: bAdxRising },
              momentum: { 
                confirms: bMomentumConfirms, 
                state: bMomentumConfirms ? 'confirmed' : 'mixed',
                fakeBreakoutRisk: bFakeBreakoutRisk,
                genuineMomentum: bGenuineMomentum,
                adxRising: bAdxRising
              },
              bollingerBands: {
                squeeze: bBollingerBands.squeeze,
                squeezeIntensity: bBollingerBands.squeezeIntensity,
                percentB: bBollingerBands.percentB,
                pricePosition: bBollingerBands.pricePosition
              },
              isAligned: bIsAligned,
              volumeConfirms: bVolume1h.volumeTrend === 'increasing' || bVolume1h.volumeSpike,
              currentPrice: bCurrentPrice,
            }
          });
        } catch (err) {
          results.push({ timestamp: batch.timestamp, data: null, error: err instanceof Error ? err.message : 'unknown' });
        }
      }
      
      logger.forSymbol(symbol).success(`BATCH MODE: Completed ${results.filter(r => r.data).length}/${batchKlines.length} successful`);
      
      return new Response(
        JSON.stringify({ batch: true, results }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    if (!symbol || typeof symbol !== "string") {
      return new Response(
        JSON.stringify({ error: "Symbol is required and must be a string" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // SINGLE MODE: Use provided historical klines OR fetch live from Binance
    let klines15m: any[], klines30m: any[], klines1h: any[], klines4h: any[];
    
    if (historicalKlines && backtestMode) {
      klines15m = historicalKlines['15m'] || [];
      klines30m = historicalKlines['30m'] || [];
      klines1h = historicalKlines['1h'] || [];
      klines4h = historicalKlines['4h'] || [];
    } else {
      logger.forSymbol(symbol).info(`${LOG_CATEGORIES.TREND} Multi-timeframe analysis starting`);
      [klines15m, klines30m, klines1h, klines4h] = await Promise.all([
        fetchBinanceKlines(symbol, "15m", 100),
        fetchBinanceKlines(symbol, "30m", 100),
        fetchBinanceKlines(symbol, "1h", 100),
        fetchBinanceKlines(symbol, "4h", 50),
      ]);
    }

    const prices15m = klines15m.map((k: any) => parseFloat(k[4])).filter(Number.isFinite);
    const prices30m = klines30m.map((k: any) => parseFloat(k[4])).filter(Number.isFinite);
    const prices1h = klines1h.map((k: any) => parseFloat(k[4])).filter(Number.isFinite);
    const prices4h = klines4h.map((k: any) => parseFloat(k[4])).filter(Number.isFinite);

    // Minimum candle requirements for accurate indicator calculations
    const MIN_CANDLES_1H = 35; // Required for MACD (26 + 9 smoothing)
    const MIN_CANDLES_4H = 20; // Required for ADX and trend analysis
    
    if (prices1h.length < MIN_CANDLES_1H) {
      throw new Error(`Insufficient 1h data for ${symbol}: ${prices1h.length} candles (need ${MIN_CANDLES_1H}+)`);
    }
    if (prices4h.length < MIN_CANDLES_4H) {
      throw new Error(`Insufficient 4h data for ${symbol}: ${prices4h.length} candles (need ${MIN_CANDLES_4H}+)`);
    }

    const currentPrice = prices1h[prices1h.length - 1];

    // Calculate trends using shared module
    const trend15m = calculateTrend(prices15m);
    const trend30m = calculateTrend(prices30m);
    const trend1h = calculateTrend(prices1h);
    const trend4h = calculateTrend(prices4h);

    // StochRSI using shared module (pass pre-calculated RSI arrays)
    const stochRsi15m = calculateStochasticRSI(prices15m, 14, 14, 3, 3, trend15m.indicators.rsiArray);
    const stochRsi30m = calculateStochasticRSI(prices30m, 14, 14, 3, 3, trend30m.indicators.rsiArray);
    const stochRsi1h = calculateStochasticRSI(prices1h, 14, 14, 3, 3, trend1h.indicators.rsiArray);
    const stochRsi4h = calculateStochasticRSI(prices4h, 14, 14, 3, 3, trend4h.indicators.rsiArray);
    
    // PHASE 3: Calculate bars at extreme for each timeframe
    const barsAtExtreme1h = calculateBarsAtExtreme(
      stochRsi1h.kArray, 
      TIME_IN_EXTREME_PARAMS.OVERBOUGHT_EXTREME, 
      TIME_IN_EXTREME_PARAMS.OVERSOLD_EXTREME
    );
    const barsAtExtreme4h = calculateBarsAtExtreme(
      stochRsi4h.kArray, 
      TIME_IN_EXTREME_PARAMS.OVERBOUGHT_EXTREME, 
      TIME_IN_EXTREME_PARAMS.OVERSOLD_EXTREME
    );

    const symLog = logger.forSymbol(symbol);
    symLog.info(`${LOG_CATEGORIES.STOCHRSI} 1h K=${stochRsi1h.k} D=${stochRsi1h.d} signal=${stochRsi1h.signal} barsOB=${barsAtExtreme1h.barsOverbought} barsOS=${barsAtExtreme1h.barsOversold} | 4h K=${stochRsi4h.k} D=${stochRsi4h.d} signal=${stochRsi4h.signal} barsOB=${barsAtExtreme4h.barsOverbought} barsOS=${barsAtExtreme4h.barsOversold}`);

    const dominantTrend = trend4h.trend;
    const dominantConfidence = trend4h.confidence;

    // ADX and ATR using shared modules
    const adxResult = calculateADXWithDirection(klines1h, 14);
    const adx = adxResult.adx;
    const adxRising = adxResult.adxRising;
    const currentATR = calculateATR(klines1h, 14);
    const atrPercent = currentPrice !== 0 ? (currentATR / currentPrice) * 100 : 0;
    const historicalATRAvg = calculateHistoricalATRAvg(klines1h, 14, 30, currentATR);
    const relativeATR = historicalATRAvg !== 0 ? currentATR / historicalATRAvg : 1.0;

    symLog.info(`${LOG_CATEGORIES.ADX} ${adx.toFixed(1)} (${adxRising ? 'rising' : 'falling'}) | ATR: ${currentATR.toFixed(4)} (${atrPercent.toFixed(2)}%) | Relative ATR: ${relativeATR.toFixed(2)}x`);

    // Alignment checks
    const opposing1h = dominantTrend !== "neutral" && trend1h.trend !== "neutral" && trend1h.trend !== dominantTrend;
    const opposing30m = dominantTrend !== "neutral" && trend30m.trend !== "neutral" && trend30m.trend !== dominantTrend;
    const opposing15m = dominantTrend !== "neutral" && trend15m.trend !== "neutral" && trend15m.trend !== dominantTrend;
    const confirmation1h = trend1h.trend === dominantTrend;
    const confirmation30m = trend30m.trend === dominantTrend;
    const confirmation15m = trend15m.trend === dominantTrend;

    // Weighted consistency calculation
    const baseWeights = {
      tf4h: 0.35, tf1h_aligned: 0.30, tf1h_neutral: 0.15, tf30m_aligned: 0.20,
      tf30m_neutral: 0.10, tf15m_aligned: 0.15, tf15m_neutral: 0.08,
    };

    let weightedConsistency = dominantConfidence;
    if (dominantTrend !== "neutral") {
      const use1h_aligned = confirmation1h;
      const use1h_neutral = !confirmation1h && trend1h.trend === "neutral" && !opposing1h;
      const use30m_aligned = confirmation30m;
      const use30m_neutral = !confirmation30m && trend30m.trend === "neutral" && !opposing30m;
      const use15m_aligned = confirmation15m;
      const use15m_neutral = !confirmation15m && trend15m.trend === "neutral" && !opposing15m;
      
      const includedWeightSum =
        baseWeights.tf4h +
        (use1h_aligned ? baseWeights.tf1h_aligned : 0) +
        (use1h_neutral ? baseWeights.tf1h_neutral : 0) +
        (use30m_aligned ? baseWeights.tf30m_aligned : 0) +
        (use30m_neutral ? baseWeights.tf30m_neutral : 0) +
        (use15m_aligned ? baseWeights.tf15m_aligned : 0) +
        (use15m_neutral ? baseWeights.tf15m_neutral : 0);
      
      const scaleFactor = includedWeightSum > 0 ? 1.0 / includedWeightSum : 0;
      const normalized4h = baseWeights.tf4h * scaleFactor;
      const normalized1h_aligned = use1h_aligned ? baseWeights.tf1h_aligned * scaleFactor : 0;
      const normalized1h_neutral = use1h_neutral ? baseWeights.tf1h_neutral * scaleFactor : 0;
      const normalized30m_aligned = use30m_aligned ? baseWeights.tf30m_aligned * scaleFactor : 0;
      const normalized30m_neutral = use30m_neutral ? baseWeights.tf30m_neutral * scaleFactor : 0;
      const normalized15m_aligned = use15m_aligned ? baseWeights.tf15m_aligned * scaleFactor : 0;
      const normalized15m_neutral = use15m_neutral ? baseWeights.tf15m_neutral * scaleFactor : 0;
      
      weightedConsistency =
        dominantConfidence * normalized4h +
        (use1h_aligned ? trend1h.confidence * normalized1h_aligned : 0) +
        (use1h_neutral ? trend1h.confidence * normalized1h_neutral : 0) +
        (use30m_aligned ? trend30m.confidence * normalized30m_aligned : 0) +
        (use30m_neutral ? trend30m.confidence * normalized30m_neutral : 0) +
        (use15m_aligned ? trend15m.confidence * normalized15m_aligned : 0) +
        (use15m_neutral ? trend15m.confidence * normalized15m_neutral : 0);
    }

    const standardAlignment = dominantTrend !== "neutral" && !opposing1h;
    symLog.info(`ALIGNMENT: 4h=${dominantTrend} 1h=${trend1h.trend} 30m=${trend30m.trend} 15m=${trend15m.trend} | opposing: 1h=${opposing1h} 30m=${opposing30m} 15m=${opposing15m} | standardAlignment=${standardAlignment}`);

    let neutralAllowedWithStrongHigherTimeframe = false;
    if (!standardAlignment && dominantTrend !== "neutral" && trend1h.trend === "neutral") {
      const strong4h = dominantConfidence >= CONFIDENCE_THRESHOLDS.STRONG_4H;
      const macd1h = trend1h.indicators.macdHistogram;
      const macdAligned = dominantTrend === "bullish" ? macd1h >= 0 : macd1h <= 0;
      const hasActivity = adx >= ADX_THRESHOLDS.MINIMUM;
      const atrNotExtremelyCompressed = relativeATR >= 0.5;
      if (strong4h && macdAligned && (hasActivity || atrNotExtremelyCompressed)) {
        neutralAllowedWithStrongHigherTimeframe = true;
        symLog.info(`${LOG_CATEGORIES.SUCCESS} 1h=neutral ALLOWED with strong 4h=${dominantTrend}(${dominantConfidence}%) - MACD=${macd1h.toFixed(3)} ADX=${adx.toFixed(1)} relATR=${relativeATR.toFixed(2)}`);
      } else {
        symLog.info(`${LOG_CATEGORIES.GATE} 1h=neutral BLOCKED - strong4h=${strong4h} macdAligned=${macdAligned} hasActivity=${hasActivity} atrOK=${atrNotExtremelyCompressed}`);
      }
    }

    const highTimeframeAligned = standardAlignment || neutralAllowedWithStrongHigherTimeframe;

    let divergenceType: "aligned" | "pullback" | "early_reversal" | "ranging_conflict" = "aligned";
    let divergenceConfidence = 100;
    let allowDivergenceSignal = false;
    
    if (!highTimeframeAligned) {
      if (dominantTrend !== "neutral" && dominantConfidence >= CONFIDENCE_THRESHOLDS.PULLBACK_4H_MIN && trend1h.confidence >= CONFIDENCE_THRESHOLDS.STRONG_1H_MIN) {
        divergenceType = "pullback";
        divergenceConfidence = Math.min(dominantConfidence * 0.7, CONFIDENCE_THRESHOLDS.HTF_EXCEPTION);
        allowDivergenceSignal = true;
        symLog.info(`${LOG_CATEGORIES.SIGNAL} ${dominantTrend.toUpperCase()} PULLBACK detected: 4h=${dominantConfidence}% vs 1h=${trend1h.trend}`);
      } else if (trend1h.confidence >= CONFIDENCE_THRESHOLDS.STRONG_1H_REVERSAL && (dominantTrend === "neutral" || dominantConfidence < CONFIDENCE_THRESHOLDS.WEAK_4H) && adx >= ADX_THRESHOLDS.WEAK) {
        divergenceType = "early_reversal";
        divergenceConfidence = Math.min(trend1h.confidence * 0.65, CONFIDENCE_THRESHOLDS.DEAD_ZONE_LOWER);
        allowDivergenceSignal = true;
        symLog.info(`${LOG_CATEGORIES.REVERSAL} EARLY REVERSAL detected: 1h=${trend1h.trend}(${trend1h.confidence}%) vs weak/neutral 4h=${dominantTrend}(${dominantConfidence}%) ADX=${adx.toFixed(1)}`);
      } else {
        divergenceType = "ranging_conflict";
        divergenceConfidence = 0;
        allowDivergenceSignal = false;
        symLog.info(`${LOG_CATEGORIES.MARKET} RANGING CONFLICT: Skipping - unclear divergence pattern`);
      }
    }
    
    let primaryTrend: "bullish" | "bearish" | "neutral" | "ranging" = dominantTrend;
    
    // Volume analysis using shared module
    const volume15m = calculateVolumeAnalysis(klines15m);
    const volume30m = calculateVolumeAnalysis(klines30m);
    const volume1h = calculateVolumeAnalysis(klines1h);
    const volume4h = calculateVolumeAnalysis(klines4h);
    
    // Bollinger Bands
    const bb15m = calculateBollingerBands(prices15m, 20, 2);
    const bb30m = calculateBollingerBands(prices30m, 20, 2);
    const bb1h = calculateBollingerBands(prices1h, 20, 2);
    const bb4h = calculateBollingerBands(prices4h, 20, 2);
    
    const bollingerSqueezeActive = bb1h.squeeze || bb4h.squeeze;
    const squeezeBreakoutPotential = bollingerSqueezeActive && bb1h.squeezeIntensity > 50;
    
    symLog.info(`${LOG_CATEGORIES.BOLLINGER} 1h squeeze=${bb1h.squeeze}(${bb1h.squeezeIntensity}%) 4h squeeze=${bb4h.squeeze}(${bb4h.squeezeIntensity}%) position=${bb1h.pricePosition} %B=${bb1h.percentB}`);

    // ADX for each timeframe for enhanced confidence
    const adx15m = calculateADX(klines15m, 14);
    const adx30m = calculateADX(klines30m, 14);
    const adx4h = calculateADX(klines4h, 14);

    // Enhanced confidence using shared module
    const hasRangeExpansion1h = relativeATR > 1.0;
    const enhancedConfidence15m = enhanceConfidenceWithIndicators(
      trend15m.confidence, adx15m, volume15m.volumeSpike || volume15m.volumeTrend === "increasing", volume15m.volumeRatio, false
    );
    const enhancedConfidence30m = enhanceConfidenceWithIndicators(
      trend30m.confidence, adx30m, volume30m.volumeSpike || volume30m.volumeTrend === "increasing", volume30m.volumeRatio, false
    );
    const enhancedConfidence1h = enhanceConfidenceWithIndicators(
      trend1h.confidence, adx, volume1h.volumeSpike || volume1h.volumeTrend === "increasing", volume1h.volumeRatio, hasRangeExpansion1h
    );
    const enhancedConfidence4h = enhanceConfidenceWithIndicators(
      trend4h.confidence, adx4h, volume4h.volumeSpike || volume4h.volumeTrend === "increasing", volume4h.volumeRatio, false
    );

    // True alignment score
    const volumeConfirmsAny = (volume1h.volumeSpike && hasRangeExpansion1h) || volume4h.volumeSpike || 
                               volume1h.volumeTrend === "increasing" || volume4h.volumeTrend === "increasing";
    const trueAlignment = calculateTrueAlignmentScore(
      trend4h, trend1h, trend30m, trend15m, dominantTrend, adx, volumeConfirmsAny
    );
    
    // ============= MICRO-TREND DETECTION =============
    // When 4h is neutral, use 15m/30m/1h to determine short-term direction
    // PHASE 2: Added volume confirmation and persistence tracking
    const volumeRatio1h = volume1h.volumeRatio ?? 1.0;
    const volumeAboveMA = volume1h.volumeTrend === "increasing" || volume1h.volumeSpike === true;
    
    // For persistence tracking, we use a simplified approach:
    // Count how many of the last N bars have been in the same direction
    // This is approximated by checking if MACD histogram has been consistent
    // PHASE 1: Use actual consecutive bar counting from MACD histogram array
    // This replaces the rough heuristic estimation for accurate persistence validation
    const barsAligned15m = countConsecutiveBarsInDirection(trend15m.indicators?.macdHistogramArray);
    const barsAligned30m = countConsecutiveBarsInDirection(trend30m.indicators?.macdHistogramArray);
    
    symLog.info(`${LOG_CATEGORIES.TREND} PERSISTENCE: 15m=${barsAligned15m} bars, 30m=${barsAligned30m} bars (from MACD histogram arrays)`);
    
    const microTrend = detectMicroTrend(
      trend15m, trend30m, trend1h, adx,
      volumeRatio1h, volumeAboveMA, barsAligned15m, barsAligned30m
    );
    
    // Log micro-trend if detected and 4h is neutral
    if (trend4h.trend === "neutral") {
      if (microTrend.hasMicroTrend) {
        symLog.info(`${LOG_CATEGORIES.TREND} MICRO-TREND: ${microTrend.direction} (alignment=${microTrend.alignment}, conf=${microTrend.confidence.toFixed(0)}%, persist=${microTrend.persistence}, volOK=${microTrend.volumeConfirmed}) - ${microTrend.reason}`);
      } else if (microTrend.blocked) {
        symLog.info(`${LOG_CATEGORIES.TREND} MICRO-TREND BLOCKED: ${microTrend.blockReason}`);
      }
    }
    
    // ============= STEALTH TREND DETECTION =============
    // Detect gradual price grinds (2-4% moves) that slip through ADX/momentum filters
    const stealthTrend = calculateStealthTrend(
      klines15m,
      adx,
      trend1h,
      trend30m,
      stochRsi4h.k
    );
    
    if (stealthTrend.detected) {
      symLog.info(`${LOG_CATEGORIES.TREND} 🕵️ STEALTH TREND: ${stealthTrend.direction} drift ${stealthTrend.driftPercent.toFixed(2)}% over ${stealthTrend.driftDuration}h | ADX=${adx.toFixed(1)}, score=${stealthTrend.stealthScore}`);
      symLog.info(`   → ADX bypass=${stealthTrend.adxBypassAllowed}, HTF bypass=${stealthTrend.htfBypassAllowed}, position=${(stealthTrend.positionMultiplier * 100).toFixed(0)}%`);
    } else if (Math.abs(stealthTrend.driftPercent) >= 1.0) {
      // Log near-misses for debugging
      symLog.info(`${LOG_CATEGORIES.TREND} 🕵️ STEALTH CHECK: drift ${stealthTrend.driftPercent.toFixed(2)}% (below threshold or ADX ${adx.toFixed(1)} too high) - ${stealthTrend.reason}`);
    }
    
    // ============= NEUTRAL PERSISTENCE MODELING =============
    // Track how long market has been neutral - longer neutral periods that
    // resolve into drift are more meaningful signals
    const netSignal = (
      (trend4h.trend === "bullish" ? 1 : trend4h.trend === "bearish" ? -1 : 0) * 4 +
      (trend1h.trend === "bullish" ? 1 : trend1h.trend === "bearish" ? -1 : 0) * 3 +
      (trend30m.trend === "bullish" ? 1 : trend30m.trend === "bearish" ? -1 : 0) * 2 +
      (trend15m.trend === "bullish" ? 1 : trend15m.trend === "bearish" ? -1 : 0) * 1
    );
    
    const neutralPersistence = calculateNeutralPersistence(
      klines15m,
      trend4h,
      trend1h,
      trend30m,
      netSignal
    );
    
    if (neutralPersistence.isCurrentlyNeutral && neutralPersistence.confidenceBonus > 0) {
      symLog.info(`${LOG_CATEGORIES.MARKET} 🔄 NEUTRAL PERSISTENCE: ${neutralPersistence.neutralDurationMinutes}min, bonus: +${neutralPersistence.confidenceBonus} - ${neutralPersistence.reason}`);
    } else if (neutralPersistence.isCurrentlyNeutral) {
      symLog.info(`${LOG_CATEGORIES.MARKET} 🔄 NEUTRAL STATE: ${neutralPersistence.neutralDurationMinutes}min (no bonus yet)`);
    }
    
    // Divergence alignment validation
    const PULLBACK_ALIGNMENT_THRESHOLD = 55;
    const EARLY_REVERSAL_ALIGNMENT_THRESHOLD = 45;
    
    if (divergenceType === "pullback" && trueAlignment.score < PULLBACK_ALIGNMENT_THRESHOLD) {
      symLog.info(`${LOG_CATEGORIES.REJECTION} PULLBACK REJECTED - alignment score ${trueAlignment.score} < ${PULLBACK_ALIGNMENT_THRESHOLD} threshold`);
      divergenceType = "ranging_conflict";
      divergenceConfidence = 0;
      allowDivergenceSignal = false;
    } else if (divergenceType === "early_reversal" && trueAlignment.score < EARLY_REVERSAL_ALIGNMENT_THRESHOLD) {
      symLog.info(`${LOG_CATEGORIES.REJECTION} EARLY REVERSAL REJECTED - alignment score ${trueAlignment.score} < ${EARLY_REVERSAL_ALIGNMENT_THRESHOLD} threshold`);
      divergenceType = "ranging_conflict";
      divergenceConfidence = 0;
      allowDivergenceSignal = false;
    }
    
    const neutralCapLog = trueAlignment.neutralCapped ? ` [NEUTRAL CAPPED]` : '';
    symLog.info(`${LOG_CATEGORIES.QUALITY} ENHANCED CONFIDENCE: 4h=${trend4h.confidence}->${enhancedConfidence4h} 1h=${trend1h.confidence}->${enhancedConfidence1h} | ALIGNMENT: score=${trueAlignment.score} (dir=${trueAlignment.breakdown.directionScore} ind=${trueAlignment.breakdown.indicatorScore} pen=${trueAlignment.breakdown.penaltyScore})${neutralCapLog}`);

    // Ranging market detection
    const atrCompressed = relativeATR < 0.6;
    const adxWeak = adx < ADX_THRESHOLDS.MINIMUM;
    const isRanging = atrCompressed && adxWeak;
    const volatilityNormal = !isRanging && atrPercent < 5.0;
    
    if (isRanging) {
      primaryTrend = "ranging";
      symLog.info(`${LOG_CATEGORIES.MARKET} RANGING MARKET DETECTED - ATR: ${atrPercent.toFixed(2)}% (relative: ${relativeATR.toFixed(2)}x), ADX: ${adx.toFixed(1)} - skipping signals`);
    } else {
      symLog.info(`${LOG_CATEGORIES.MARKET} TRENDING MARKET - ATR: ${atrPercent.toFixed(2)}% (relative: ${relativeATR.toFixed(2)}x), ADX: ${adx.toFixed(1)}`);
    }

    // ============= PRICE ACTION MOMENTUM DETECTION =============
    // Detect strong recent price movement that indicates trend continuation
    // This helps identify opportunities even when lagging indicators show extremes
    const lookbackCandles = Math.min(MOMENTUM_CONTINUATION_PARAMS.PRICE_MOVE_LOOKBACK_HOURS, prices1h.length - 1);
    let priceActionMomentum: {
      hasStrongMove: boolean;
      direction: "bullish" | "bearish" | "neutral";
      movePercent: number;
      isStrongMove: boolean;
      canOverrideNeutralAlignment: boolean;
    } = {
      hasStrongMove: false,
      direction: "neutral",
      movePercent: 0,
      isStrongMove: false,
      canOverrideNeutralAlignment: false,
    };
    
    if (prices1h.length >= lookbackCandles + 1 && MOMENTUM_CONTINUATION_PARAMS.ENABLED) {
      const currentClose = prices1h[prices1h.length - 1];
      const lookbackClose = prices1h[prices1h.length - 1 - lookbackCandles];
      const priceChange = currentClose - lookbackClose;
      const priceChangePercent = (priceChange / lookbackClose) * 100;
      const absMovePercent = Math.abs(priceChangePercent);
      
      // Check if move meets threshold
      const meetsThreshold = absMovePercent >= MOMENTUM_CONTINUATION_PARAMS.PRICE_MOVE_THRESHOLD_PERCENT;
      const meetsStrongThreshold = absMovePercent >= MOMENTUM_CONTINUATION_PARAMS.STRONG_MOVE_THRESHOLD_PERCENT;
      
      // Determine direction
      const priceDirection = priceChange > 0 ? "bullish" : priceChange < 0 ? "bearish" : "neutral";
      
      // Check if can override neutral alignment (for momentum continuation at extremes)
      const canOverride = MOMENTUM_CONTINUATION_PARAMS.OVERRIDE_NEUTRAL_ALIGNMENT &&
        meetsThreshold &&
        adx >= MOMENTUM_CONTINUATION_PARAMS.MIN_ADX_FOR_PRICE_ACTION;
      
      priceActionMomentum = {
        hasStrongMove: meetsThreshold,
        direction: priceDirection,
        movePercent: Math.round(priceChangePercent * 100) / 100,
        isStrongMove: meetsStrongThreshold,
        canOverrideNeutralAlignment: canOverride,
      };
      
      if (meetsThreshold) {
        const moveType = meetsStrongThreshold ? "STRONG" : "MODERATE";
        symLog.info(`${LOG_CATEGORIES.MOMENTUM} PRICE ACTION MOMENTUM: ${moveType} ${priceDirection.toUpperCase()} move of ${priceChangePercent.toFixed(2)}% in ${lookbackCandles}h (ADX=${adx.toFixed(1)}, canOverride=${canOverride})`);
      }
    }

    // Pullback detection
    let inPullback = false;
    let pullbackPercent = 0;
    if (dominantTrend === "bullish" || dominantTrend === "bearish") {
      const recentKlines = klines1h.slice(-24);
      const recentHighs = recentKlines.map((k: any) => parseFloat(k[2])).filter(Number.isFinite);
      const recentLows = recentKlines.map((k: any) => parseFloat(k[3])).filter(Number.isFinite);
      
      if (dominantTrend === "bullish") {
        const swingHigh = recentHighs.length > 0 ? Math.max(...recentHighs) : 0;
        const swingLow = recentLows.slice(-12).length > 0 ? Math.min(...recentLows.slice(-12)) : 0;
        const range = swingHigh - swingLow;
        const pullback = swingHigh - currentPrice;
        pullbackPercent = range !== 0 ? (pullback / range) * 100 : 0;
        inPullback = pullbackPercent >= 10 && pullbackPercent <= 65;
      } else if (dominantTrend === "bearish") {
        const swingLow = recentLows.length > 0 ? Math.min(...recentLows) : 0;
        const swingHigh = recentHighs.slice(-12).length > 0 ? Math.max(...recentHighs.slice(-12)) : 0;
        const range = swingHigh - swingLow;
        const pullback = currentPrice - swingLow;
        pullbackPercent = range !== 0 ? (pullback / range) * 100 : 0;
        inPullback = pullbackPercent >= 10 && pullbackPercent <= 65;
      }
    }

    // Momentum state calculation
    const lastClose = prices1h.length >= 1 ? prices1h[prices1h.length - 1] : 0;
    const prevClose = prices1h.length >= 2 ? prices1h[prices1h.length - 2] : lastClose;
    const macdHistogram = trend1h.indicators.macdHistogram;
    const histArr = trend1h.indicators.macdHistogramArray;
    const prevMacdHistogram = histArr.length >= 2 ? histArr[histArr.length - 2] : macdHistogram;

    let effectiveTrendForMomentum = dominantTrend;
    if (dominantTrend === "neutral") {
      const bullishVotes = [trend1h.trend, trend30m.trend, trend15m.trend].filter((t) => t === "bullish").length;
      const bearishVotes = [trend1h.trend, trend30m.trend, trend15m.trend].filter((t) => t === "bearish").length;
      const hasMinimumActivity = adx >= ADX_THRESHOLDS.WEAK;
      const strongBullishAlignment = bullishVotes >= 2 && trend1h.confidence >= CONFIDENCE_THRESHOLDS.STRONG_ALIGNMENT_1H;
      const strongBearishAlignment = bearishVotes >= 2 && trend1h.confidence >= CONFIDENCE_THRESHOLDS.STRONG_ALIGNMENT_1H;
      
      if (hasMinimumActivity) {
        if (strongBullishAlignment && bullishVotes > bearishVotes) {
          effectiveTrendForMomentum = "bullish";
          symLog.info(`${LOG_CATEGORIES.MOMENTUM} Neutral 4h → derived BULLISH momentum (votes: ${bullishVotes}/${bearishVotes}, ADX=${adx.toFixed(1)}, 1h conf=${trend1h.confidence}%)`);
        } else if (strongBearishAlignment && bearishVotes > bullishVotes) {
          effectiveTrendForMomentum = "bearish";
          symLog.info(`${LOG_CATEGORIES.MOMENTUM} Neutral 4h → derived BEARISH momentum (votes: ${bearishVotes}/${bullishVotes}, ADX=${adx.toFixed(1)}, 1h conf=${trend1h.confidence}%)`);
        } else {
          symLog.info(`${LOG_CATEGORIES.MOMENTUM} Neutral 4h → NO momentum derived (alignment insufficient: bull=${bullishVotes} bear=${bearishVotes}, 1h conf=${trend1h.confidence}%)`);
        }
      } else {
        symLog.info(`${LOG_CATEGORIES.MOMENTUM} Neutral 4h → NO momentum derived (ADX too weak: ${adx.toFixed(1)} < ${ADX_THRESHOLDS.WEAK})`);
      }
    }

    // Volume confirmation
    const priceDirectionMatches = 
      (effectiveTrendForMomentum === "bullish" && lastClose > prevClose) ||
      (effectiveTrendForMomentum === "bearish" && lastClose < prevClose);
    
    const volumeConfirmsDirection = priceDirectionMatches && (
      (effectiveTrendForMomentum === "bullish" && volume1h.volumeTrend === "increasing") ||
      (effectiveTrendForMomentum === "bearish" && volume1h.volumeTrend === "increasing") ||
      volume1h.volumeSpike
    );
    
    const volumeBoost = volumeConfirmsDirection ? 1.10 : 1.0;

    // IMPROVED: Check last 3 candles instead of just last candle (2/3 majority rule)
    // This allows occasional bounces in strong trends without failing momentum confirmation
    const candleCount = Math.min(3, prices1h.length - 1);
    let alignedCandles = 0;
    for (let i = 0; i < candleCount; i++) {
      const closeIdx = prices1h.length - 1 - i;
      const prevIdx = closeIdx - 1;
      if (prevIdx >= 0) {
        const closePrice = prices1h[closeIdx];
        const prevPrice = prices1h[prevIdx];
        if (effectiveTrendForMomentum === "bullish" && closePrice > prevPrice) alignedCandles++;
        else if (effectiveTrendForMomentum === "bearish" && closePrice < prevPrice) alignedCandles++;
        else if (effectiveTrendForMomentum === "neutral") alignedCandles++;
      }
    }
    // Require 2/3 majority (2 of 3 candles aligned) OR neutral trend
    const lastCloseAlignsWithTrend = effectiveTrendForMomentum === "neutral" || alignedCandles >= Math.ceil(candleCount * 0.67);

    // Divergence detection
    let hasDivergence = false;
    const priceMovement = lastClose - prevClose;
    const macdMovement = macdHistogram - prevMacdHistogram;
    const priceMovementPercent = prevClose !== 0 ? Math.abs(priceMovement / prevClose) : 0;
    const macdMovementPercent = prevMacdHistogram !== 0 ? Math.abs(macdMovement / prevMacdHistogram) : 0;
    
    if (priceMovementPercent > 0.001 && macdMovementPercent > 0.05) {
      hasDivergence = (priceMovement > 0 && macdMovement < 0) || (priceMovement < 0 && macdMovement > 0);
    }

    const macdDirectionAligned =
      (effectiveTrendForMomentum === "bullish" && macdHistogram > 0) ||
      (effectiveTrendForMomentum === "bearish" && macdHistogram < 0) ||
      effectiveTrendForMomentum === "neutral";

    const macdExpanding = Math.abs(macdHistogram) > 0.05 && macdDirectionAligned && adx >= ADX_THRESHOLDS.SEVERE_PENALTY;
    const macdStrong = Math.abs(macdHistogram) > 0.5 && macdDirectionAligned && adx >= ADX_THRESHOLDS.SEVERE_PENALTY;

    // Fake breakout detection
    const fakeBreakoutRisk = macdExpanding && !adxRising;
    const genuineMomentum = macdExpanding && adxRising;

    // RELAXED: Allow "confirmed" momentum with fewer conditions when trends are aligned
    // Previously required ALL: macdExpanding, lastCloseAlignsWithTrend, !hasDivergence, ADX >= 22, adxRising
    // Now: Strong aligned moves (4h+1h same direction) can pass with just MACD expanding + ADX >= 18
    const is4h1hAligned = trend4h.trend !== "neutral" && trend4h.trend === trend1h.trend;
    const strongAlignment = is4h1hAligned && trend4h.confidence >= 55 && trend1h.confidence >= 50;
    
    // Standard full confirmation
    const fullMomentumConfirms = macdExpanding && lastCloseAlignsWithTrend && !hasDivergence && adx >= ADX_THRESHOLDS.MODERATE && adxRising;
    
    // Relaxed confirmation for strong alignment (allows single-candle bounces in strong trends)
    const alignedMomentumConfirms = strongAlignment && macdExpanding && !hasDivergence && adx >= ADX_THRESHOLDS.WEAK;
    
    const momentumConfirms = fullMomentumConfirms || alignedMomentumConfirms;
    let momentumState: "none" | "mixed" | "confirmed" | "building" = "none";
    if (fullMomentumConfirms) {
      momentumState = "confirmed";
    } else if (alignedMomentumConfirms) {
      momentumState = "building"; // New state: aligned but not full confirmation
      symLog.info(`${LOG_CATEGORIES.MOMENTUM} BUILDING MOMENTUM - aligned trends (4h+1h ${trend4h.trend}) allow entry despite lastCloseAligns=${lastCloseAlignsWithTrend}`);
    } else if (macdExpanding && adxRising && (hasDivergence || !lastCloseAlignsWithTrend)) {
      momentumState = adx >= ADX_THRESHOLDS.WEAK ? "mixed" : "none";
    } else if (fakeBreakoutRisk && adx >= ADX_THRESHOLDS.MODERATE) {
      momentumState = "mixed";
      symLog.warn(`FAKE BREAKOUT WARNING - MACD expanding but ADX falling (${adxResult.prevAdx.toFixed(1)} → ${adx.toFixed(1)})`);
    }

    symLog.info(`${LOG_CATEGORIES.MOMENTUM} state=${momentumState} macdExpanding=${macdExpanding} lastCloseAligns=${lastCloseAlignsWithTrend} divergence=${hasDivergence} volumeConfirms=${volumeConfirmsDirection} ADX=${adx.toFixed(1)} adxRising=${adxRising} fakeBreakoutRisk=${fakeBreakoutRisk} genuineMomentum=${genuineMomentum}`);

    // Market structure validation
    const marketStructure = validateMarketStructure(klines1h, dominantTrend);

    // Build response
    const response = {
      symbol,
      timestamp: new Date().toISOString(),
      currentPrice,
      primaryTrend: calculateTradeDirection(divergenceType, dominantTrend, trend1h.trend, primaryTrend),
      confidence: divergenceType === "ranging_conflict" 
        ? Math.round((trend4h.confidence * 0.6 + trend1h.confidence * 0.4))  // Use weighted avg for ranging
        : divergenceType !== "aligned" 
          ? divergenceConfidence 
          : Math.round(weightedConsistency * volumeBoost),
      isAligned: highTimeframeAligned || allowDivergenceSignal,
      divergence: {
        type: divergenceType,
        confidence: divergenceConfidence,
        allowSignal: allowDivergenceSignal,
        recommendedPositionSize: calculateRecommendedPositionSize(divergenceType),
      },
      trueAlignment: trueAlignment,
      timeframes: {
        "15m": { trend: trend15m.trend, confidence: trend15m.confidence, enhancedConfidence: enhancedConfidence15m, indicators: trend15m.indicators },
        "30m": { trend: trend30m.trend, confidence: trend30m.confidence, enhancedConfidence: enhancedConfidence30m, indicators: trend30m.indicators },
        "1h": { trend: trend1h.trend, confidence: trend1h.confidence, enhancedConfidence: enhancedConfidence1h, indicators: trend1h.indicators },
        "4h": { trend: trend4h.trend, confidence: trend4h.confidence, enhancedConfidence: enhancedConfidence4h, indicators: trend4h.indicators },
      },
      stochasticRsi: {
        "15m": { ...stochRsi15m, kArray: undefined },  // Don't include large arrays in response
        "30m": { ...stochRsi30m, kArray: undefined },
        "1h": { ...stochRsi1h, kArray: undefined, barsAtExtreme: barsAtExtreme1h },
        "4h": { ...stochRsi4h, kArray: undefined, barsAtExtreme: barsAtExtreme4h },
        // PHASE 3: Aggregated bars at extreme for quick access
        barsAtExtreme: {
          "1h": barsAtExtreme1h,
          "4h": barsAtExtreme4h,
        },
      },
      momentum: {
        state: momentumState,
        macdExpanding,
        macdStrong,
        lastCloseAlignsWithTrend,
        hasDivergence,
        confirms: momentumConfirms,
        volumeConfirms: volumeConfirmsDirection,
        adxRising,
        fakeBreakoutRisk,
        genuineMomentum,
        // NEW: Consecutive bars in same direction for price action confirmation
        consecutiveBars1h: countConsecutiveBarsInDirection(trend1h.indicators?.macdHistogramArray),
        consecutiveBars15m: barsAligned15m,
        consecutiveBars30m: barsAligned30m,
      },
      volatility: {
        atr: Math.round(currentATR * 100) / 100,
        atrPercent: Math.round(atrPercent * 100) / 100,
        relativeATR: Math.round(relativeATR * 100) / 100,
        historicalATRAvg: Math.round(historicalATRAvg * 100) / 100,
        isCompressed: atrCompressed,
        adx: Math.round(adx * 10) / 10,
        adx15m: Math.round(adx15m * 10) / 10,
        adx30m: Math.round(adx30m * 10) / 10,
        adx4h: Math.round(adx4h * 10) / 10,
        volatilityNormal,
        isRanging,
      },
      volume: {
        "15m": volume15m,
        "30m": volume30m,
        "1h": volume1h,
        "4h": volume4h,
        confirmsDirection: volumeConfirmsDirection,
        hasRangeExpansion1h,
      },
      bollingerBands: {
        "15m": bb15m,
        "30m": bb30m,
        "1h": bb1h,
        "4h": bb4h,
        squeezeActive: bollingerSqueezeActive,
        squeezeBreakoutPotential,
      },
      pullback: {
        inPullback,
        pullbackPercent: Math.round(pullbackPercent * 10) / 10,
        pullbackConditionsMet: inPullback && rsiInPullbackZone(trend1h.indicators.rsi, effectiveTrendForMomentum),
      },
      marketStructure,
      // NEW: Micro-trend detection for when 4h is neutral
      // PHASE 2: Added persistence, volume confirmation, and expiry fields
      microTrend: {
        hasMicroTrend: microTrend.hasMicroTrend,
        direction: microTrend.direction,
        confidence: microTrend.confidence,
        alignment: microTrend.alignment,
        reason: microTrend.reason,
        // PHASE 2: New hardening fields
        persistence: microTrend.persistence,
        volumeConfirmed: microTrend.volumeConfirmed,
        validForCandles: microTrend.validForCandles,
        adxSufficient: microTrend.adxSufficient,
        blocked: microTrend.blocked,
        blockReason: microTrend.blockReason,
      },
      // NEW: Price action momentum for catching continuation moves
      priceActionMomentum: {
        hasStrongMove: priceActionMomentum.hasStrongMove,
        direction: priceActionMomentum.direction,
        movePercent: priceActionMomentum.movePercent,
        isStrongMove: priceActionMomentum.isStrongMove,
        canOverrideNeutralAlignment: priceActionMomentum.canOverrideNeutralAlignment,
      },
      // NEW: Stealth trend detection for catching gradual price grinds
      stealthTrend: {
        detected: stealthTrend.detected,
        direction: stealthTrend.direction,
        driftPercent: stealthTrend.driftPercent,
        driftDuration: stealthTrend.driftDuration,
        adxBypassAllowed: stealthTrend.adxBypassAllowed,
        htfBypassAllowed: stealthTrend.htfBypassAllowed,
        stealthScore: stealthTrend.stealthScore,
        positionMultiplier: stealthTrend.positionMultiplier,
        stopMultiplier: stealthTrend.stopMultiplier,
        reason: stealthTrend.reason,
      },
      // NEW: Neutral persistence modeling for confidence bonus on stealth/grind entries
      neutralPersistence: {
        isCurrentlyNeutral: neutralPersistence.isCurrentlyNeutral,
        durationMinutes: neutralPersistence.neutralDurationMinutes,
        confidenceBonus: neutralPersistence.confidenceBonus,
        reason: neutralPersistence.reason,
      },
      // NEW: Include 15m klines for Late Grind Acceptance pullback detection
      klines15m: klines15m.slice(-20),  // Last 20 candles for pullback analysis
    };

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    logError(logger, error, 'calculate-trend error');
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
