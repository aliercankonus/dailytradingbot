// ============= ORDER FLOW ANALYSIS =============
// Professional-grade order flow analysis for better entry timing
// Tracks: Volume spikes, price rejections, buying/selling pressure

export interface OrderFlowAnalysis {
  // Volume spike detection
  volumeSpike: {
    detected: boolean;
    magnitude: number;        // How many times above average (e.g., 2.5x)
    type: "bullish" | "bearish" | "neutral";  // Direction based on price action
    significance: "low" | "medium" | "high" | "extreme";
  };
  
  // Price rejection detection (wick analysis)
  priceRejection: {
    detected: boolean;
    type: "bullish_rejection" | "bearish_rejection" | "none";  // Rejection direction
    wickRatio: number;        // Wick size relative to body
    strength: number;         // 0-100 rejection strength
    level: "support" | "resistance" | "none";
  };
  
  // Buying/Selling pressure estimation
  pressure: {
    buyingPressure: number;   // 0-100
    sellingPressure: number;  // 0-100
    delta: number;            // Positive = buying, Negative = selling
    trend: "accumulation" | "distribution" | "neutral";
  };
  
  // Combined order flow score
  score: number;              // 0-100, higher = better entry conditions
  signal: "strong_buy" | "buy" | "neutral" | "sell" | "strong_sell";
  confidence: number;         // 0-100
  reasons: string[];
}

/**
 * Analyze order flow from kline data
 * @param klines - Binance kline data array [timestamp, open, high, low, close, volume, ...]
 * @param intendedDirection - "long" or "short" - the direction we want to trade
 * @returns OrderFlowAnalysis with all metrics
 */
export function analyzeOrderFlow(
  klines: any[],
  intendedDirection: "long" | "short"
): OrderFlowAnalysis {
  const defaultResult: OrderFlowAnalysis = {
    volumeSpike: { detected: false, magnitude: 1, type: "neutral", significance: "low" },
    priceRejection: { detected: false, type: "none", wickRatio: 0, strength: 0, level: "none" },
    pressure: { buyingPressure: 50, sellingPressure: 50, delta: 0, trend: "neutral" },
    score: 50,
    signal: "neutral",
    confidence: 0,
    reasons: []
  };
  
  if (!klines || klines.length < 30) return defaultResult;
  
  const reasons: string[] = [];
  
  // ============= 1. VOLUME SPIKE DETECTION =============
  const volumeSpike = detectVolumeSpike(klines);
  if (volumeSpike.detected) {
    reasons.push(`Volume spike ${volumeSpike.magnitude.toFixed(1)}x (${volumeSpike.significance})`);
  }
  
  // ============= 2. PRICE REJECTION DETECTION =============
  const priceRejection = detectPriceRejection(klines);
  if (priceRejection.detected) {
    reasons.push(`${priceRejection.type.replace('_', ' ')} at ${priceRejection.level} (strength: ${priceRejection.strength})`);
  }
  
  // ============= 3. BUYING/SELLING PRESSURE =============
  const pressure = analyzeBuySellPressure(klines);
  if (Math.abs(pressure.delta) > 20) {
    reasons.push(`${pressure.trend} detected (delta: ${pressure.delta > 0 ? '+' : ''}${pressure.delta.toFixed(0)})`);
  }
  
  // ============= 4. CALCULATE COMBINED SCORE =============
  const { score, signal, confidence } = calculateOrderFlowScore(
    volumeSpike,
    priceRejection,
    pressure,
    intendedDirection
  );
  
  return {
    volumeSpike,
    priceRejection,
    pressure,
    score,
    signal,
    confidence,
    reasons
  };
}

/**
 * Detect volume spikes - large volume relative to recent average
 * Institutional activity often shows as volume spikes
 */
function detectVolumeSpike(klines: any[]): OrderFlowAnalysis["volumeSpike"] {
  const volumes = klines.map(k => parseFloat(k[5])).filter(v => Number.isFinite(v) && v > 0);
  if (volumes.length < 21) {
    return { detected: false, magnitude: 1, type: "neutral", significance: "low" };
  }
  
  // Calculate average volume (excluding current candle)
  const historicalVolumes = volumes.slice(-21, -1);
  const avgVolume = historicalVolumes.reduce((sum, v) => sum + v, 0) / historicalVolumes.length;
  const currentVolume = volumes[volumes.length - 1];
  const magnitude = avgVolume > 0 ? currentVolume / avgVolume : 1;
  
  // Determine spike significance
  let significance: "low" | "medium" | "high" | "extreme" = "low";
  let detected = false;
  
  if (magnitude >= 4.0) {
    significance = "extreme";
    detected = true;
  } else if (magnitude >= 2.5) {
    significance = "high";
    detected = true;
  } else if (magnitude >= 1.8) {
    significance = "medium";
    detected = true;
  } else if (magnitude >= 1.5) {
    significance = "low";
    detected = true;
  }
  
  // Determine volume type based on price action of current candle
  const currentCandle = klines[klines.length - 1];
  const open = parseFloat(currentCandle[1]);
  const close = parseFloat(currentCandle[4]);
  const priceChange = close - open;
  
  let type: "bullish" | "bearish" | "neutral" = "neutral";
  if (priceChange > 0) {
    type = "bullish";  // Volume on up candle = buying
  } else if (priceChange < 0) {
    type = "bearish";  // Volume on down candle = selling
  }
  
  return { detected, magnitude: Math.round(magnitude * 100) / 100, type, significance };
}

/**
 * Detect price rejections using wick analysis
 * Long wicks indicate rejection at a price level
 */
function detectPriceRejection(klines: any[]): OrderFlowAnalysis["priceRejection"] {
  if (klines.length < 5) {
    return { detected: false, type: "none", wickRatio: 0, strength: 0, level: "none" };
  }
  
  // Analyze last 3 candles for rejection patterns
  const recentCandles = klines.slice(-3);
  const currentCandle = klines[klines.length - 1];
  
  const open = parseFloat(currentCandle[1]);
  const high = parseFloat(currentCandle[2]);
  const low = parseFloat(currentCandle[3]);
  const close = parseFloat(currentCandle[4]);
  
  const body = Math.abs(close - open);
  const upperWick = high - Math.max(open, close);
  const lowerWick = Math.min(open, close) - low;
  const totalRange = high - low;
  
  if (totalRange === 0) {
    return { detected: false, type: "none", wickRatio: 0, strength: 0, level: "none" };
  }
  
  // Calculate wick ratios
  const upperWickRatio = body > 0 ? upperWick / body : upperWick / (totalRange * 0.1);
  const lowerWickRatio = body > 0 ? lowerWick / body : lowerWick / (totalRange * 0.1);
  
  let detected = false;
  let type: "bullish_rejection" | "bearish_rejection" | "none" = "none";
  let wickRatio = 0;
  let strength = 0;
  let level: "support" | "resistance" | "none" = "none";
  
  // Bullish rejection: Long lower wick (rejected lower prices, buyers stepped in)
  // This is BULLISH because price tried to go lower but was rejected
  if (lowerWickRatio >= 2 && lowerWick > upperWick * 1.5) {
    detected = true;
    type = "bullish_rejection";  // Rejection of lower prices = bullish
    wickRatio = lowerWickRatio;
    level = "support";
    
    // Strength based on wick size relative to range
    strength = Math.min(100, Math.round((lowerWick / totalRange) * 100 * 1.5));
    
    // Boost if it's a hammer pattern (small body at top)
    if (close > open && body / totalRange < 0.3) {
      strength = Math.min(100, strength + 20);
    }
  }
  
  // Bearish rejection: Long upper wick (rejected higher prices, sellers stepped in)
  // This is BEARISH because price tried to go higher but was rejected
  else if (upperWickRatio >= 2 && upperWick > lowerWick * 1.5) {
    detected = true;
    type = "bearish_rejection";  // Rejection of higher prices = bearish
    wickRatio = upperWickRatio;
    level = "resistance";
    
    strength = Math.min(100, Math.round((upperWick / totalRange) * 100 * 1.5));
    
    // Boost if it's a shooting star pattern (small body at bottom)
    if (close < open && body / totalRange < 0.3) {
      strength = Math.min(100, strength + 20);
    }
  }
  
  // Check for multi-candle rejection pattern
  if (!detected && recentCandles.length >= 3) {
    const rejectionPattern = detectMultiCandleRejection(recentCandles);
    if (rejectionPattern.detected) {
      detected = true;
      type = rejectionPattern.type;
      wickRatio = rejectionPattern.wickRatio;
      strength = rejectionPattern.strength;
      level = rejectionPattern.level;
    }
  }
  
  return { detected, type, wickRatio: Math.round(wickRatio * 100) / 100, strength, level };
}

/**
 * Detect multi-candle rejection patterns (e.g., double top/bottom rejection)
 */
function detectMultiCandleRejection(candles: any[]): {
  detected: boolean;
  type: "bullish_rejection" | "bearish_rejection" | "none";
  wickRatio: number;
  strength: number;
  level: "support" | "resistance" | "none";
} {
  const default_result = { detected: false, type: "none" as const, wickRatio: 0, strength: 0, level: "none" as const };
  
  if (candles.length < 3) return default_result;
  
  // Get highs and lows
  const highs = candles.map(c => parseFloat(c[2]));
  const lows = candles.map(c => parseFloat(c[3]));
  const closes = candles.map(c => parseFloat(c[4]));
  
  const maxHigh = Math.max(...highs);
  const minLow = Math.min(...lows);
  const latestClose = closes[closes.length - 1];
  
  // Check for resistance rejection (multiple touches at high, then reversal)
  const highTouches = highs.filter(h => h >= maxHigh * 0.998).length;
  if (highTouches >= 2 && latestClose < maxHigh * 0.995) {
    return {
      detected: true,
      type: "bearish_rejection",
      wickRatio: 2,
      strength: Math.min(80, highTouches * 25),
      level: "resistance"
    };
  }
  
  // Check for support rejection (multiple touches at low, then reversal)
  const lowTouches = lows.filter(l => l <= minLow * 1.002).length;
  if (lowTouches >= 2 && latestClose > minLow * 1.005) {
    return {
      detected: true,
      type: "bullish_rejection",
      wickRatio: 2,
      strength: Math.min(80, lowTouches * 25),
      level: "support"
    };
  }
  
  return default_result;
}

/**
 * Analyze buying vs selling pressure using candle analysis
 * Estimates order flow delta from price action
 */
function analyzeBuySellPressure(klines: any[]): OrderFlowAnalysis["pressure"] {
  const lookback = Math.min(10, klines.length);
  const recentCandles = klines.slice(-lookback);
  
  let buyingPressure = 0;
  let sellingPressure = 0;
  
  for (const candle of recentCandles) {
    const open = parseFloat(candle[1]);
    const high = parseFloat(candle[2]);
    const low = parseFloat(candle[3]);
    const close = parseFloat(candle[4]);
    const volume = parseFloat(candle[5]);
    
    const range = high - low;
    if (range === 0) continue;
    
    // Calculate buying/selling volume based on close position within range
    // Close near high = buying pressure, close near low = selling pressure
    const closePosition = (close - low) / range;  // 0 to 1
    
    const buyVolume = volume * closePosition;
    const sellVolume = volume * (1 - closePosition);
    
    buyingPressure += buyVolume;
    sellingPressure += sellVolume;
  }
  
  const totalPressure = buyingPressure + sellingPressure;
  if (totalPressure === 0) {
    return { buyingPressure: 50, sellingPressure: 50, delta: 0, trend: "neutral" };
  }
  
  // Normalize to 0-100
  const normalizedBuying = (buyingPressure / totalPressure) * 100;
  const normalizedSelling = (sellingPressure / totalPressure) * 100;
  const delta = normalizedBuying - normalizedSelling;  // -100 to +100
  
  // Determine trend
  let trend: "accumulation" | "distribution" | "neutral" = "neutral";
  if (delta > 15) {
    trend = "accumulation";  // More buying than selling
  } else if (delta < -15) {
    trend = "distribution";  // More selling than buying
  }
  
  return {
    buyingPressure: Math.round(normalizedBuying),
    sellingPressure: Math.round(normalizedSelling),
    delta: Math.round(delta * 10) / 10,
    trend
  };
}

/**
 * Calculate combined order flow score based on intended trade direction
 */
function calculateOrderFlowScore(
  volumeSpike: OrderFlowAnalysis["volumeSpike"],
  priceRejection: OrderFlowAnalysis["priceRejection"],
  pressure: OrderFlowAnalysis["pressure"],
  intendedDirection: "long" | "short"
): { score: number; signal: OrderFlowAnalysis["signal"]; confidence: number } {
  let score = 50;  // Neutral baseline
  let confidence = 0;
  const isLong = intendedDirection === "long";
  
  // ============= VOLUME SPIKE CONTRIBUTION =============
  // Volume spike aligned with direction = positive
  // Volume spike against direction = negative
  if (volumeSpike.detected) {
    const volumePoints = volumeSpike.significance === "extreme" ? 15 :
                        volumeSpike.significance === "high" ? 10 :
                        volumeSpike.significance === "medium" ? 6 : 3;
    
    if (isLong && volumeSpike.type === "bullish") {
      score += volumePoints;
      confidence += 15;
    } else if (!isLong && volumeSpike.type === "bearish") {
      score += volumePoints;
      confidence += 15;
    } else if (volumeSpike.type !== "neutral") {
      // Against our direction
      score -= volumePoints * 0.7;  // Less penalty than bonus
      confidence += 10;  // Still adds confidence in the reading
    }
  }
  
  // ============= PRICE REJECTION CONTRIBUTION =============
  // Rejection aligned with direction = very positive
  // Rejection against direction = very negative
  if (priceRejection.detected) {
    const rejectionPoints = Math.min(20, priceRejection.strength * 0.3);
    
    if (isLong && priceRejection.type === "bullish_rejection") {
      // Bullish rejection (rejected lower prices) supports long
      score += rejectionPoints;
      confidence += 20;
    } else if (!isLong && priceRejection.type === "bearish_rejection") {
      // Bearish rejection (rejected higher prices) supports short
      score += rejectionPoints;
      confidence += 20;
    } else if (priceRejection.type !== "none") {
      // Against our direction
      score -= rejectionPoints * 0.8;
      confidence += 15;
    }
  }
  
  // ============= PRESSURE CONTRIBUTION =============
  // Aligned pressure = positive, contrary pressure = negative
  const pressurePoints = Math.abs(pressure.delta) * 0.15;  // Max ~15 points
  
  if (isLong && pressure.delta > 0) {
    score += pressurePoints;
    confidence += Math.min(15, Math.abs(pressure.delta) * 0.3);
  } else if (!isLong && pressure.delta < 0) {
    score += pressurePoints;
    confidence += Math.min(15, Math.abs(pressure.delta) * 0.3);
  } else if (Math.abs(pressure.delta) > 10) {
    // Against our direction
    score -= pressurePoints * 0.5;
  }
  
  // Clamp values
  score = Math.max(0, Math.min(100, Math.round(score)));
  confidence = Math.max(0, Math.min(100, Math.round(confidence)));
  
  // Determine signal
  let signal: OrderFlowAnalysis["signal"];
  if (score >= 75) signal = "strong_buy";
  else if (score >= 60) signal = "buy";
  else if (score >= 40) signal = "neutral";
  else if (score >= 25) signal = "sell";
  else signal = "strong_sell";
  
  return { score, signal, confidence };
}

/**
 * Get order flow bonus/penalty for quality score
 * Returns points to add to quality score (-15 to +15)
 */
export function getOrderFlowQualityBonus(
  orderFlow: OrderFlowAnalysis,
  intendedDirection: "long" | "short"
): number {
  // Scale the order flow score to a -15 to +15 range
  // 50 = neutral (0 bonus)
  // 100 = max bonus (+15)
  // 0 = max penalty (-15)
  const normalized = (orderFlow.score - 50) / 50;  // -1 to +1
  const bonus = Math.round(normalized * 15);
  
  // Only apply significant bonus if we have confidence in the reading
  if (orderFlow.confidence < 20) {
    return Math.round(bonus * 0.3);  // Reduce impact if low confidence
  }
  
  return bonus;
}
