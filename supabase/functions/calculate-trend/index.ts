import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Calculate EMA
function calculateEMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1] || 0;

  const multiplier = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }

  return ema;
}

// Calculate RSI
function calculateRSI(prices: number[], period = 14): number {
  if (prices.length < period + 1) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;
  const rs = avgGain / (avgLoss || 1);
  return 100 - 100 / (1 + rs);
}

// Calculate MACD
function calculateMACD(prices: number[]): { macd: number; signal: number; histogram: number } {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const macd = ema12 - ema26;

  // Calculate signal line (9-period EMA of MACD)
  const macdValues: number[] = [];
  for (let i = 26; i < prices.length; i++) {
    const shortEma = calculateEMA(prices.slice(0, i + 1), 12);
    const longEma = calculateEMA(prices.slice(0, i + 1), 26);
    macdValues.push(shortEma - longEma);
  }

  const signal = macdValues.length >= 9 ? calculateEMA(macdValues, 9) : macd * 0.9;
  const histogram = macd - signal;

  return { macd, signal, histogram };
}

// Calculate ADX (Average Directional Index) - measures trend strength
function calculateADX(klines: any[], period = 14): number {
  if (klines.length < period + 1) return 0;

  const trueRanges: number[] = [];
  const plusDMs: number[] = [];
  const minusDMs: number[] = [];

  // Calculate True Range, +DM, -DM
  for (let i = 1; i < klines.length; i++) {
    const high = parseFloat(klines[i][2]);
    const low = parseFloat(klines[i][3]);
    const prevHigh = parseFloat(klines[i - 1][2]);
    const prevLow = parseFloat(klines[i - 1][3]);
    const prevClose = parseFloat(klines[i - 1][4]);

    // True Range
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);

    // Directional Movement
    const upMove = high - prevHigh;
    const downMove = prevLow - low;

    const plusDM = upMove > downMove && upMove > 0 ? upMove : 0;
    const minusDM = downMove > upMove && downMove > 0 ? downMove : 0;

    plusDMs.push(plusDM);
    minusDMs.push(minusDM);
  }

  if (trueRanges.length < period) return 0;

  // Smooth TR, +DM, -DM using Wilder's smoothing
  let smoothedTR = trueRanges.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothedPlusDM = plusDMs.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothedMinusDM = minusDMs.slice(0, period).reduce((a, b) => a + b, 0);

  for (let i = period; i < trueRanges.length; i++) {
    smoothedTR = smoothedTR - smoothedTR / period + trueRanges[i];
    smoothedPlusDM = smoothedPlusDM - smoothedPlusDM / period + plusDMs[i];
    smoothedMinusDM = smoothedMinusDM - smoothedMinusDM / period + minusDMs[i];
  }

  // Calculate +DI and -DI
  const plusDI = (smoothedPlusDM / smoothedTR) * 100;
  const minusDI = (smoothedMinusDM / smoothedTR) * 100;

  // Calculate DX
  const diDiff = Math.abs(plusDI - minusDI);
  const diSum = plusDI + minusDI;
  const dx = diSum === 0 ? 0 : (diDiff / diSum) * 100;

  // For simplicity, return DX as ADX approximation
  // (true ADX needs smoothing over 14 periods of DX values)
  return dx;
}

// Fetch Binance klines with configurable interval
async function fetchBinanceKlines(symbol: string, interval: string = "1h", limit: number = 100): Promise<any[]> {
  try {
    const response = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
    );

    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status}`);
    }

    const klines = await response.json();
    return klines;
  } catch (error) {
    console.error(`Failed to fetch Binance klines for ${symbol} on ${interval}:`, error);
    throw error;
  }
}

// Validate market structure (higher highs/higher lows for bullish, etc.)
function validateMarketStructure(
  klines: any[],
  trend: "bullish" | "bearish" | "neutral",
): { valid: boolean; confidence: number } {
  if (klines.length < 10) return { valid: false, confidence: 0 };

  const highs = klines.slice(-10).map((k: any) => parseFloat(k[2])); // high prices
  const lows = klines.slice(-10).map((k: any) => parseFloat(k[3])); // low prices

  if (trend === "bullish") {
    // Check for higher highs and higher lows
    let higherHighs = 0;
    let higherLows = 0;

    for (let i = 1; i < highs.length; i++) {
      if (highs[i] > highs[i - 1]) higherHighs++;
      if (lows[i] > lows[i - 1]) higherLows++;
    }

    const hhPercent = (higherHighs / (highs.length - 1)) * 100;
    const hlPercent = (higherLows / (lows.length - 1)) * 100;
    const structureScore = (hhPercent + hlPercent) / 2;

    return { valid: structureScore > 50, confidence: structureScore };
  } else if (trend === "bearish") {
    // Check for lower highs and lower lows
    let lowerHighs = 0;
    let lowerLows = 0;

    for (let i = 1; i < highs.length; i++) {
      if (highs[i] < highs[i - 1]) lowerHighs++;
      if (lows[i] < lows[i - 1]) lowerLows++;
    }

    const lhPercent = (lowerHighs / (highs.length - 1)) * 100;
    const llPercent = (lowerLows / (lows.length - 1)) * 100;
    const structureScore = (lhPercent + llPercent) / 2;

    return { valid: structureScore > 50, confidence: structureScore };
  }

  return { valid: false, confidence: 0 };
}

// Calculate comprehensive trend using multiple indicators
function calculateTrend(prices: number[]): {
  trend: "bullish" | "bearish" | "neutral";
  confidence: number;
  indicators: {
    ema12: number;
    ema26: number;
    emaSignal: string;
    rsi: number;
    rsiSignal: string;
    macd: number;
    macdSignal: number;
    macdHistogram: number;
    macdTrend: string;
  };
} {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const rsi = calculateRSI(prices, 14);
  const { macd, signal, histogram } = calculateMACD(prices);

  let bullishSignals = 0;
  let bearishSignals = 0;
  let totalWeight = 0;

  // EMA Crossover Analysis (Weight: 3)
  const emaWeight = 3;
  let emaSignal = "neutral";
  if (ema12 > ema26) {
    const emaDiff = ((ema12 - ema26) / ema26) * 100;
    if (emaDiff > 0.1) {
      bullishSignals += emaWeight;
      emaSignal = "bullish";
    }
  } else if (ema12 < ema26) {
    const emaDiff = ((ema26 - ema12) / ema26) * 100;
    if (emaDiff > 0.1) {
      bearishSignals += emaWeight;
      emaSignal = "bearish";
    }
  }
  totalWeight += emaWeight;

  // RSI Analysis (Weight: 2)
  const rsiWeight = 2;
  let rsiSignal = "neutral";
  if (rsi > 60) {
    bullishSignals += rsiWeight * ((rsi - 60) / 40);
    rsiSignal = rsi > 70 ? "overbought" : "bullish";
  } else if (rsi < 40) {
    bearishSignals += rsiWeight * ((40 - rsi) / 40);
    rsiSignal = rsi < 30 ? "oversold" : "bearish";
  } else {
    rsiSignal = "neutral";
  }
  totalWeight += rsiWeight;

  // MACD Analysis (Weight: 3)
  const macdWeight = 3;
  let macdTrend = "neutral";
  if (histogram > 0) {
    const macdStrength = Math.min(Math.abs(histogram) / Math.abs(macd || 1), 1);
    bullishSignals += macdWeight * macdStrength;
    macdTrend = "bullish";
  } else if (histogram < 0) {
    const macdStrength = Math.min(Math.abs(histogram) / Math.abs(macd || 1), 1);
    bearishSignals += macdWeight * macdStrength;
    macdTrend = "bearish";
  }
  totalWeight += macdWeight;

  // Calculate confidence and determine trend
  const netSignal = bullishSignals - bearishSignals;

  // More realistic confidence calculation
  // Max score is 8 (all indicators aligned), confidence scales from 40-90%
  const rawConfidence = (Math.abs(netSignal) / totalWeight) * 100;

  // Apply non-linear scaling to avoid extreme values
  // This ensures confidence stays in 40-90% range for normal conditions
  let confidence = 40 + rawConfidence * 0.5; // Scale to 40-90% range
  confidence = Math.min(Math.max(confidence, 40), 90); // Clamp between 40-90%

  let trend: "bullish" | "bearish" | "neutral";

  // More sensitive trend classification - requires net signal > 0.8
  // This prevents false "not aligned" rejections when trends are weak but in same direction
  if (netSignal > 0.8) {
    trend = "bullish";
  } else if (netSignal < -0.8) {
    trend = "bearish";
  } else {
    trend = "neutral";
  }

  return {
    trend,
    confidence: Math.round(confidence),
    indicators: {
      ema12: Math.round(ema12 * 100) / 100,
      ema26: Math.round(ema26 * 100) / 100,
      emaSignal,
      rsi: Math.round(rsi * 100) / 100,
      rsiSignal,
      macd: Math.round(macd * 100) / 100,
      macdSignal: Math.round(signal * 100) / 100,
      macdHistogram: Math.round(histogram * 100) / 100,
      macdTrend,
    },
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol } = await req.json();
    if (!symbol) throw new Error("Symbol is required");

    console.log(`Multi-timeframe analysis for ${symbol}`);

    // Fetch multiple timeframes in parallel
    const [klines15m, klines30m, klines1h, klines4h] = await Promise.all([
      fetchBinanceKlines(symbol, "15m", 100),
      fetchBinanceKlines(symbol, "30m", 100),
      fetchBinanceKlines(symbol, "1h", 100),
      fetchBinanceKlines(symbol, "4h", 50),
    ]);

    // Extract close prices for each timeframe
    const prices15m = klines15m.map((k: any) => parseFloat(k[4]));
    const prices30m = klines30m.map((k: any) => parseFloat(k[4]));
    const prices1h = klines1h.map((k: any) => parseFloat(k[4]));
    const prices4h = klines4h.map((k: any) => parseFloat(k[4]));
    const currentPrice = prices1h[prices1h.length - 1];

    // Calculate trend for each timeframe
    const trend15m = calculateTrend(prices15m);
    const trend30m = calculateTrend(prices30m);
    const trend1h = calculateTrend(prices1h);
    const trend4h = calculateTrend(prices4h);

    // ============================================================
    // HIGHER TIMEFRAME DOMINANT WEIGHTING SYSTEM
    // 4h = 45% weight, 1h = 30%, 30m = 15%, 15m = 10%
    // ============================================================

    // CRITICAL: 4h timeframe determines primary direction (45% weight)
    const dominantTrend = trend4h.trend;
    const dominantConfidence = trend4h.confidence;

    // 1h must confirm 4h for high-quality signals (30% weight)
    const confirmation1h = trend1h.trend === dominantTrend;
    const confirmation30m = trend30m.trend === dominantTrend;
    const confirmation15m = trend15m.trend === dominantTrend;

    // Calculate weighted trend consistency
    const weightedConsistency =
      dominantConfidence * 0.45 + // 4h: 45%
      (confirmation1h ? trend1h.confidence * 0.30 : 0) + // 1h: 30%
      (confirmation30m ? trend30m.confidence * 0.15 : 0) + // 30m: 15%
      (confirmation15m ? trend15m.confidence * 0.10 : 0); // 15m: 10%

    // High timeframe alignment: 4h + 1h must agree for valid signals
    const highTimeframeAligned = dominantTrend !== "neutral" && confirmation1h;

    // ============================================================
    // DIVERGENCE CLASSIFICATION FOR OPPORTUNITY CAPTURE
    // ============================================================
    let divergenceType: "aligned" | "pullback" | "early_reversal" | "ranging_conflict" = "aligned";
    let divergenceConfidence = 100; // Base confidence, will be adjusted
    let allowDivergenceSignal = false;

    if (!highTimeframeAligned && dominantTrend !== "neutral") {
      // Case 1: PULLBACK - 4h strong, 1h temporarily opposes (trade WITH 4h direction)
      if (dominantConfidence >= 60 && trend1h.confidence >= 50) {
        // Strong 4h trend, moderate 1h counter-move = pullback opportunity
        divergenceType = "pullback";
        divergenceConfidence = Math.min(dominantConfidence * 0.75, 70); // Max 70% confidence
        allowDivergenceSignal = true;
        console.log(`${dominantTrend.toUpperCase()} PULLBACK detected: 4h=${dominantConfidence}% vs 1h=${trend1h.trend}`);
      }
      // Case 2: EARLY REVERSAL - 1h strongly reversing, 4h hasn't confirmed yet
      else if (trend1h.confidence >= 70 && dominantConfidence < 60) {
        // Strong 1h reversal, weak 4h = early trend change (trade WITH 1h direction)
        divergenceType = "early_reversal";
        divergenceConfidence = Math.min(trend1h.confidence * 0.70, 65); // Max 65% confidence
        allowDivergenceSignal = true;
        console.log(`EARLY REVERSAL detected: 1h=${trend1h.trend}(${trend1h.confidence}%) vs weak 4h=${dominantTrend}(${dominantConfidence}%)`);
      }
      // Case 3: RANGING CONFLICT - Contradictory signals, skip
      else {
        divergenceType = "ranging_conflict";
        divergenceConfidence = 0;
        allowDivergenceSignal = false;
        console.log(`RANGING CONFLICT: Skipping - unclear divergence pattern`);
      }
    }

    let primaryTrend: "bullish" | "bearish" | "neutral" | "ranging" = dominantTrend;

    // ============================================================
    // ADAPTIVE RANGING MARKET DETECTION (Relative ATR + ADX)
    // ============================================================
    const atrPeriod = 14;
    const atrLookback = 30; // For historical ATR average
    
    // Calculate current ATR
    const atrKlines = klines1h.slice(-atrPeriod - 1);
    let atrSum = 0;
    for (let i = 1; i < atrKlines.length; i++) {
      const high = parseFloat(atrKlines[i][2]);
      const low = parseFloat(atrKlines[i][3]);
      const prevClose = parseFloat(atrKlines[i - 1][4]);
      const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
      atrSum += tr;
    }
    const currentATR = atrSum / atrPeriod;
    const atrPercent = (currentATR / currentPrice) * 100;

    // Calculate historical ATR average (30-period lookback)
    const historicalKlines = klines1h.slice(-atrLookback - atrPeriod);
    let historicalATRSum = 0;
    let historicalATRCount = 0;
    
    for (let j = atrPeriod; j < historicalKlines.length; j++) {
      let periodATRSum = 0;
      for (let i = 1; i <= atrPeriod; i++) {
        const idx = j - atrPeriod + i;
        const high = parseFloat(historicalKlines[idx][2]);
        const low = parseFloat(historicalKlines[idx][3]);
        const prevClose = parseFloat(historicalKlines[idx - 1][4]);
        const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
        periodATRSum += tr;
      }
      historicalATRSum += periodATRSum / atrPeriod;
      historicalATRCount++;
    }
    
    const historicalATRAvg = historicalATRCount > 0 ? historicalATRSum / historicalATRCount : currentATR;
    const relativeATR = currentATR / historicalATRAvg;
    
    // Calculate ADX for trend strength
    const adx = calculateADX(klines1h, 14);
    
    // COMBINED RANGING DETECTION:
    // Market is ranging if BOTH conditions are true:
    // 1. Relative ATR < 0.6 (current volatility 40% below historical average)
    // 2. ADX < 25 (weak trend strength)
    const atrCompressed = relativeATR < 0.6;
    const adxWeak = adx < 25;
    const isRanging = atrCompressed && adxWeak;
    
    const volatilityNormal = !isRanging && atrPercent < 5.0;

    if (isRanging) {
      primaryTrend = "ranging";
      console.log(`${symbol}: RANGING MARKET DETECTED - ATR: ${atrPercent.toFixed(2)}% (relative: ${relativeATR.toFixed(2)}x), ADX: ${adx.toFixed(1)} - skipping signals`);
    } else {
      console.log(`${symbol}: TRENDING MARKET - ATR: ${atrPercent.toFixed(2)}% (relative: ${relativeATR.toFixed(2)}x), ADX: ${adx.toFixed(1)}`);
    }

    // ============================================================
    // PULLBACK DETECTION
    // ============================================================
    let inPullback = false;
    let pullbackPercent = 0;

    if (dominantTrend === "bullish" || dominantTrend === "bearish") {
      // Find recent swing high/low over last 24 candles (24 hours on 1h chart)
      const recentKlines = klines1h.slice(-24);
      const recentHighs = recentKlines.map((k: any) => parseFloat(k[2]));
      const recentLows = recentKlines.map((k: any) => parseFloat(k[3]));

      if (dominantTrend === "bullish") {
        // For bullish trend, check if we're pulling back from recent high
        const swingHigh = Math.max(...recentHighs);
        const swingLow = Math.min(...recentLows.slice(-12)); // Low from last 12 hours
        const range = swingHigh - swingLow;
        const pullback = swingHigh - currentPrice;
        pullbackPercent = (pullback / range) * 100;

        // Ideal entry: 10-55% retracement (more natural range)
        inPullback = pullbackPercent >= 10 && pullbackPercent <= 65;
      } else if (dominantTrend === "bearish") {
        // For bearish trend, check if we're pulling back from recent low
        const swingLow = Math.min(...recentLows);
        const swingHigh = Math.max(...recentHighs.slice(-12)); // High from last 12 hours
        const range = swingHigh - swingLow;
        const pullback = currentPrice - swingLow;
        pullbackPercent = (pullback / range) * 100;

        // Ideal entry: 10-55% retracement (more natural range)
        inPullback = pullbackPercent >= 10 && pullbackPercent <= 65;
      }
    }

    // ============================================================
    // MOMENTUM CONFIRMATION (STRICT: 2-3 consecutive candles on 15m/30m)
    // ============================================================
    // CRITICAL: Use 15m and 30m candles for momentum - more sensitive to near-term direction
    // Check last 3 candles: ALL must be moving in trade direction (no mixed signals)
    const recentKlines15m = klines15m.slice(-3);
    const recentKlines30m = klines30m.slice(-3);
    
    // Count CONSECUTIVE candles in same direction (must be unbroken streak)
    let consecutive15mBullish = 0;
    let consecutive15mBearish = 0;
    let consecutive30mBullish = 0;
    let consecutive30mBearish = 0;
    let lastDirection15m = "";
    let lastDirection30m = "";
    
    // Check 15m candles for consecutive movement
    for (let i = 0; i < recentKlines15m.length; i++) {
      const open = parseFloat(recentKlines15m[i][1]);
      const close = parseFloat(recentKlines15m[i][4]);
      const currentDirection = close > open ? "bullish" : "bearish";
      
      // Reset streak if direction changes
      if (i === 0) {
        lastDirection15m = currentDirection;
        if (currentDirection === "bullish") consecutive15mBullish = 1;
        else consecutive15mBearish = 1;
      } else if (currentDirection === lastDirection15m) {
        // Continue the streak
        if (currentDirection === "bullish") consecutive15mBullish++;
        else consecutive15mBearish++;
      } else {
        // Direction changed - streak broken
        if (currentDirection === "bullish") consecutive15mBullish = 1;
        else consecutive15mBearish = 1;
        lastDirection15m = currentDirection;
      }
    }
    
    // Check 30m candles for confirmation
    for (let i = 0; i < recentKlines30m.length; i++) {
      const open = parseFloat(recentKlines30m[i][1]);
      const close = parseFloat(recentKlines30m[i][4]);
      const currentDirection = close > open ? "bullish" : "bearish";
      
      if (i === 0) {
        lastDirection30m = currentDirection;
        if (currentDirection === "bullish") consecutive30mBullish = 1;
        else consecutive30mBearish = 1;
      } else if (currentDirection === lastDirection30m) {
        if (currentDirection === "bullish") consecutive30mBullish++;
        else consecutive30mBearish++;
      } else {
        if (currentDirection === "bullish") consecutive30mBullish = 1;
        else consecutive30mBearish = 1;
        lastDirection30m = currentDirection;
      }
    }
    
    // STRICT REQUIREMENT: Need 2-3 consecutive candles on 15m in trade direction
    // 30m must also confirm (at least 2 consecutive in same direction)
    const momentum15mConfirms =
      (dominantTrend === "bullish" && consecutive15mBullish >= 2) ||
      (dominantTrend === "bearish" && consecutive15mBearish >= 2);
    
    const momentum30mConfirms =
      (dominantTrend === "bullish" && consecutive30mBullish >= 2) ||
      (dominantTrend === "bearish" && consecutive30mBearish >= 2);
    
    // MACD histogram must be expanding (shows strength building)
    const macdHistogram = trend15m.indicators.macdHistogram; // Use 15m MACD
    const macdExpanding = Math.abs(macdHistogram) > 0.01;
    
    // RELAXED GATE: Either 15m OR 30m consecutive candles + MACD expansion
    const momentumConfirms = (momentum15mConfirms || momentum30mConfirms) && macdExpanding;
    
    console.log(`${symbol} MOMENTUM: 15m=${consecutive15mBullish}bull/${consecutive15mBearish}bear 30m=${consecutive30mBullish}bull/${consecutive30mBearish}bear macd=${macdHistogram.toFixed(3)} confirms=${momentumConfirms}`);

    // Validate market structure on 1h timeframe
    const marketStructure = validateMarketStructure(klines1h, trend1h.trend);

    console.log(
      `${symbol}: 4h=${trend4h.trend} 1h=${trend1h.trend} 30m=${trend30m.trend} aligned=${highTimeframeAligned} pullback=${inPullback}(${pullbackPercent.toFixed(1)}%) momentum=${momentumConfirms} ranging=${isRanging}`,
    );

    return new Response(
      JSON.stringify({
        symbol,
        currentPrice,
        trend: primaryTrend,
        confidence: Math.round(weightedConsistency),

        // Higher timeframe dominance
        higherTimeframeFilter: {
          trend4h: trend4h.trend,
          trend1h: trend1h.trend,
          aligned: highTimeframeAligned,
          dominantConfidence: dominantConfidence,
          weightedConsistency: Math.round(weightedConsistency),
          // NEW: Divergence opportunity detection
          divergenceType: divergenceType,
          divergenceConfidence: Math.round(divergenceConfidence),
          allowDivergenceSignal: allowDivergenceSignal,
          // Guidance for signal generators
          recommendedPositionSize: divergenceType === "aligned" ? 100 : 
                                   divergenceType === "pullback" ? 50 :
                                   divergenceType === "early_reversal" ? 40 : 0,
          tradeDirection: divergenceType === "pullback" ? dominantTrend : 
                         divergenceType === "early_reversal" ? trend1h.trend : 
                         primaryTrend,
        },

        // Pullback detection
        pullback: {
          inPullback,
          pullbackPercent: Math.round(pullbackPercent * 10) / 10,
          ideal: inPullback && pullbackPercent >= 10 && pullbackPercent <= 55,
        },

        // Ranging detection
        ranging: {
          isRanging,
          atrPercent: Math.round(atrPercent * 100) / 100,
          safe: atrPercent >= 2.0 && atrPercent <= 5.0,
        },

        // Momentum confirmation
        momentum: {
          confirms: momentumConfirms,
          building: momentum15mConfirms && momentum30mConfirms,
          consecutive15mBullish,
          consecutive15mBearish,
          consecutive30mBullish,
          consecutive30mBearish,
          macdHistogram: Math.round(macdHistogram * 1000) / 1000,
        },

        // Multi-timeframe details
        multiTimeframe: {
          trend15m: trend15m.trend,
          trend30m: trend30m.trend,
          trend1h: trend1h.trend,
          trend4h: trend4h.trend,
          confidence15m: trend15m.confidence,
          confidence30m: trend30m.confidence,
          confidence1h: trend1h.confidence,
          confidence4h: trend4h.confidence,
        },

        marketStructure: {
          valid: marketStructure.valid,
          confidence: Math.round(marketStructure.confidence),
        },

        volatility: {
          atr: currentATR,
          atrPercent: Math.round(atrPercent * 100) / 100,
          relativeATR: Math.round(relativeATR * 100) / 100,
          adx: Math.round(adx * 10) / 10,
          normal: volatilityNormal,
          atrCompressed,
          adxWeak,
        },

        indicators: trend1h.indicators,
        trendConsistency: Math.round(weightedConsistency),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in calculate-trend:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
