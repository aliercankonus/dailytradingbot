import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============= CENTRALIZED ADX THRESHOLDS =============
// CRITICAL: Keep these aligned across all edge functions to prevent silent drift!
// Changes here should be mirrored in: strategy-analyzer, execute-trade, monitor-positions
const ADX_THRESHOLDS = {
  VERY_WEAK: 12,    // Essentially no trend, avoid trading
  WEAK: 18,         // Weak trend, mixed momentum allowed with caution
  MINIMUM: 20,      // Hard gate for any signal generation
  MODERATE: 22,     // Momentum confirmation threshold
  STRONG: 25,       // Strong trend, reduced reversal weight
  VERY_STRONG: 30,  // Very strong trend, momentum continuation valid
  EXCEPTIONAL: 35,  // Exceptional trend, relaxed quality thresholds
  EXTREME: 40,      // Extreme trend, maximum confidence bonus
} as const;

// Fixed: Proper EMA calculation (single value)
function calculateEMA(prices: number[], period: number): number {
  if (prices.length === 0) return 0;
  if (prices.length < period) return prices[prices.length - 1] || 0;

  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

// Fixed: Properly aligned EMA array — emaArray[i] corresponds to prices[i]
function calculateEMAArray(prices: number[], period: number): number[] {
  const emaArray: number[] = [];
  if (prices.length < period) return emaArray;

  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;

  // Align: first valid EMA at index = period - 1
  for (let i = 0; i < period - 1; i++) emaArray.push(NaN);
  emaArray.push(ema);

  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
    emaArray.push(ema);
  }
  return emaArray;
}

// Fixed: Proper Wilder's RSI from the very first average
function calculateRSI(prices: number[], period = 14): number {
  if (prices.length < period + 1) return 50;

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = period + 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// Optimized: Calculate all RSI values in a single O(n) pass using Wilder's smoothing
function calculateRSIArray(prices: number[], period = 14): number[] {
  const rsiArray: number[] = [];
  
  if (prices.length < period + 1) return rsiArray;

  let avgGain = 0;
  let avgLoss = 0;

  // Initial average calculation
  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;

  // First RSI value at index = period
  const firstRS = avgLoss === 0 ? 100 : avgGain / avgLoss;
  rsiArray.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + firstRS));

  // Subsequent RSI values using Wilder's smoothing
  for (let i = period + 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    if (avgLoss === 0) {
      rsiArray.push(100);
    } else {
      const rs = avgGain / avgLoss;
      rsiArray.push(100 - 100 / (1 + rs));
    }
  }

  return rsiArray;
}

// Stochastic RSI calculation - earlier overbought/oversold detection
// Optimized: O(n) complexity using pre-calculated RSI array instead of O(n²)
function calculateStochasticRSI(prices: number[], rsiPeriod = 14, stochPeriod = 14, kSmooth = 3, dSmooth = 3): {
  k: number;
  d: number;
  signal: "overbought" | "oversold" | "bullish_cross" | "bearish_cross" | "neutral";
  strength: number;
} {
  if (prices.length < rsiPeriod + stochPeriod + Math.max(kSmooth, dSmooth)) {
    return { k: 50, d: 50, signal: "neutral", strength: 0 };
  }

  // Optimized: Calculate all RSI values in single O(n) pass
  const rsiValues = calculateRSIArray(prices, rsiPeriod);

  if (rsiValues.length < stochPeriod) {
    return { k: 50, d: 50, signal: "neutral", strength: 0 };
  }

  // Calculate raw Stochastic K values from RSI
  const rawKValues: number[] = [];
  for (let i = stochPeriod - 1; i < rsiValues.length; i++) {
    const rsiWindow = rsiValues.slice(i - stochPeriod + 1, i + 1);
    const maxRsi = Math.max(...rsiWindow);
    const minRsi = Math.min(...rsiWindow);
    const currentRsi = rsiValues[i];
    
    // Stochastic formula: (Current - Lowest) / (Highest - Lowest) * 100
    const rawK = maxRsi !== minRsi 
      ? ((currentRsi - minRsi) / (maxRsi - minRsi)) * 100 
      : 50;
    rawKValues.push(rawK);
  }

  if (rawKValues.length < kSmooth) {
    return { k: 50, d: 50, signal: "neutral", strength: 0 };
  }

  // Smooth K with SMA (this gives us %K)
  const smoothedKValues: number[] = [];
  for (let i = kSmooth - 1; i < rawKValues.length; i++) {
    const kWindow = rawKValues.slice(i - kSmooth + 1, i + 1);
    const smoothedK = kWindow.reduce((a, b) => a + b, 0) / kSmooth;
    smoothedKValues.push(smoothedK);
  }

  if (smoothedKValues.length < dSmooth) {
    return { k: 50, d: 50, signal: "neutral", strength: 0 };
  }

  // Calculate %D (SMA of %K)
  const dValues: number[] = [];
  for (let i = dSmooth - 1; i < smoothedKValues.length; i++) {
    const dWindow = smoothedKValues.slice(i - dSmooth + 1, i + 1);
    const dValue = dWindow.reduce((a, b) => a + b, 0) / dSmooth;
    dValues.push(dValue);
  }

  const k = smoothedKValues[smoothedKValues.length - 1];
  const d = dValues[dValues.length - 1];
  const prevK = smoothedKValues.length > 1 ? smoothedKValues[smoothedKValues.length - 2] : k;
  const prevD = dValues.length > 1 ? dValues[dValues.length - 2] : d;

  // Determine signal
  let signal: "overbought" | "oversold" | "bullish_cross" | "bearish_cross" | "neutral" = "neutral";
  let strength = 0;

  // Overbought/Oversold zones (more sensitive than regular RSI)
  if (k > 80 && d > 80) {
    signal = "overbought";
    strength = Math.min((k - 80) / 20, 1) * 100;
  } else if (k < 20 && d < 20) {
    signal = "oversold";
    strength = Math.min((20 - k) / 20, 1) * 100;
  } 
  // Bullish crossover: K crosses above D from oversold zone
  else if (k > d && prevK <= prevD && k < 50) {
    signal = "bullish_cross";
    strength = Math.min((k - d) / 10, 1) * 80;
  }
  // Bearish crossover: K crosses below D from overbought zone
  else if (k < d && prevK >= prevD && k > 50) {
    signal = "bearish_cross";
    strength = Math.min((d - k) / 10, 1) * 80;
  }

  return {
    k: Math.round(k * 10) / 10,
    d: Math.round(d * 10) / 10,
    signal,
    strength: Math.round(strength)
  };
}

// Fixed: Uses aligned EMA arrays → correct MACD line and signal with full EMA history
function calculateMACD(prices: number[]): { macd: number; signal: number; histogram: number } {
  if (prices.length < 35) return { macd: 0, signal: 0, histogram: 0 };

  const ema12Array = calculateEMAArray(prices, 12);
  const ema26Array = calculateEMAArray(prices, 26);

  // Build full MACD line from index 25 (first valid point where both EMAs exist)
  const macdLine: number[] = [];
  for (let i = 25; i < prices.length; i++) {
    const e12 = ema12Array[i];
    const e26 = ema26Array[i];
    if (!Number.isNaN(e12) && !Number.isNaN(e26)) {
      macdLine.push(e12 - e26);
    }
  }

  if (macdLine.length === 0) return { macd: 0, signal: 0, histogram: 0 };

  const macd = macdLine[macdLine.length - 1];
  // Use full MACD line for signal EMA calculation (not truncated slice)
  const signalLine = macdLine.length >= 9 ? calculateEMA(macdLine, 9) : macd;
  const histogram = macd - signalLine;

  return { macd, signal: signalLine, histogram };
}

// Bollinger Bands calculation with squeeze detection
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

  const recentPrices = prices.slice(-period);
  const sma = recentPrices.reduce((a, b) => a + b, 0) / period;
  
  // Calculate standard deviation
  const squaredDiffs = recentPrices.map(price => Math.pow(price - sma, 2));
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / period;
  const stdDev = Math.sqrt(avgSquaredDiff);
  
  const upper = sma + (stdDevMultiplier * stdDev);
  const lower = sma - (stdDevMultiplier * stdDev);
  const currentPrice = prices[prices.length - 1];
  
  // Bandwidth: (Upper - Lower) / Middle * 100
  const bandwidth = sma !== 0 ? ((upper - lower) / sma) * 100 : 0;
  
  // %B: (Price - Lower) / (Upper - Lower) * 100
  const bandRange = upper - lower;
  const percentB = bandRange !== 0 ? ((currentPrice - lower) / bandRange) * 100 : 50;
  
  // Squeeze detection: Compare current bandwidth to historical average
  // Calculate historical bandwidths for last 50 periods
  let historicalBandwidths: number[] = [];
  for (let i = period; i <= Math.min(prices.length, period + 50); i++) {
    const histPrices = prices.slice(i - period, i);
    const histSma = histPrices.reduce((a, b) => a + b, 0) / period;
    const histSquaredDiffs = histPrices.map(p => Math.pow(p - histSma, 2));
    const histStdDev = Math.sqrt(histSquaredDiffs.reduce((a, b) => a + b, 0) / period);
    const histUpper = histSma + (stdDevMultiplier * histStdDev);
    const histLower = histSma - (stdDevMultiplier * histStdDev);
    const histBandwidth = histSma !== 0 ? ((histUpper - histLower) / histSma) * 100 : 0;
    historicalBandwidths.push(histBandwidth);
  }
  
  const avgBandwidth = historicalBandwidths.length > 0 
    ? historicalBandwidths.reduce((a, b) => a + b, 0) / historicalBandwidths.length 
    : bandwidth;
  
  // Squeeze: current bandwidth < 75% of average bandwidth
  const squeeze = bandwidth < avgBandwidth * 0.75;
  // Squeeze intensity: how tight (0-100, higher = tighter)
  const squeezeIntensity = avgBandwidth > 0 
    ? Math.max(0, Math.min(100, (1 - bandwidth / avgBandwidth) * 100)) 
    : 0;
  
  // Price position relative to bands
  let pricePosition: "above_upper" | "upper_zone" | "middle" | "lower_zone" | "below_lower" = "middle";
  if (currentPrice > upper) {
    pricePosition = "above_upper";
  } else if (currentPrice > sma + (stdDev * 1)) {
    pricePosition = "upper_zone";
  } else if (currentPrice < lower) {
    pricePosition = "below_lower";
  } else if (currentPrice < sma - (stdDev * 1)) {
    pricePosition = "lower_zone";
  }
  
  return {
    upper: Math.round(upper * 100) / 100,
    middle: Math.round(sma * 100) / 100,
    lower: Math.round(lower * 100) / 100,
    bandwidth: Math.round(bandwidth * 100) / 100,
    percentB: Math.round(percentB * 10) / 10,
    squeeze,
    squeezeIntensity: Math.round(squeezeIntensity),
    pricePosition
  };
}

function calculateVolumeAnalysis(klines: any[]): {
  volumeSpike: boolean;
  volumeRatio: number;
  volumeTrend: "increasing" | "decreasing" | "neutral";
  currentVolume: number;
  avgVolume: number;
} {
  if (klines.length < 21) {
    return { volumeSpike: false, volumeRatio: 1.0, volumeTrend: "neutral", currentVolume: 0, avgVolume: 0 };
  }

  const volumes = klines.map((k: any) => parseFloat(k[5])).filter(v => Number.isFinite(v) && v > 0);
  if (volumes.length < 21) return { volumeSpike: false, volumeRatio: 1.0, volumeTrend: "neutral", currentVolume: 0, avgVolume: 0 };

  const historicalVolumes = volumes.slice(-21, -1);
  const avgVolume = historicalVolumes.reduce((sum, v) => sum + v, 0) / historicalVolumes.length;
  const currentVolume = volumes[volumes.length - 1];
  const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 1.0;
  const volumeSpike = volumeRatio > 1.5;

  const recentVolumes = volumes.slice(-3);
  const previousVolumes = volumes.slice(-6, -3);
  const recentAvg = recentVolumes.reduce((sum, v) => sum + v, 0) / recentVolumes.length;
  const previousAvg = previousVolumes.reduce((sum, v) => sum + v, 0) / previousVolumes.length;

  let volumeTrend: "increasing" | "decreasing" | "neutral" = "neutral";
  if (recentAvg > previousAvg * 1.2) volumeTrend = "increasing";
  else if (recentAvg < previousAvg * 0.8) volumeTrend = "decreasing";

  return {
    volumeSpike,
    volumeRatio: Math.round(volumeRatio * 100) / 100,
    volumeTrend,
    currentVolume: Math.round(currentVolume),
    avgVolume: Math.round(avgVolume),
  };
}

// Helper: Calculate historical ATR average using optimized sliding window O(n)
function calculateHistoricalATRAvg(klines: any[], atrPeriod: number, atrLookback: number, currentATR: number): number {
  const historicalKlines = klines.slice(-atrLookback - atrPeriod);
  if (historicalKlines.length < atrPeriod + 1) return currentATR;
  
  let historicalATRSum = 0;
  let historicalATRCount = 0;
  let windowTRSum = 0;
  
  // Initialize first window
  for (let i = 1; i <= atrPeriod; i++) {
    const high = parseFloat(historicalKlines[i][2]);
    const low = parseFloat(historicalKlines[i][3]);
    const prevClose = parseFloat(historicalKlines[i - 1][4]);
    windowTRSum += Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
  }
  historicalATRSum += windowTRSum / atrPeriod;
  historicalATRCount++;
  
  // Slide window through remaining data
  for (let j = atrPeriod + 1; j < historicalKlines.length; j++) {
    const oldHigh = parseFloat(historicalKlines[j - atrPeriod][2]);
    const oldLow = parseFloat(historicalKlines[j - atrPeriod][3]);
    const oldPrevClose = parseFloat(historicalKlines[j - atrPeriod - 1][4]);
    const oldTR = Math.max(oldHigh - oldLow, Math.abs(oldHigh - oldPrevClose), Math.abs(oldLow - oldPrevClose));
    
    const newHigh = parseFloat(historicalKlines[j][2]);
    const newLow = parseFloat(historicalKlines[j][3]);
    const newPrevClose = parseFloat(historicalKlines[j - 1][4]);
    const newTR = Math.max(newHigh - newLow, Math.abs(newHigh - newPrevClose), Math.abs(newLow - newPrevClose));
    
    windowTRSum = windowTRSum - oldTR + newTR;
    historicalATRSum += windowTRSum / atrPeriod;
    historicalATRCount++;
  }
  
  return historicalATRCount > 0 ? historicalATRSum / historicalATRCount : currentATR;
}

/**
 * Wilder's Average Directional Index (ADX) - measures trend strength (0-100)
 * Reference: J. Welles Wilder Jr., "New Concepts in Technical Trading Systems" (1978)
 * 
 * Interpretation:
 *   0-15  = Absent or very weak trend (avoid trend-following strategies)
 *   15-25 = Weak trend (use with caution)
 *   25-50 = Strong trend (ideal for trend-following)
 *   50-75 = Very strong trend
 *   75-100 = Extremely strong trend (rare)
 * 
 * Algorithm:
 *   1. Calculate True Range (TR), +DM, -DM for each bar
 *   2. Apply Wilder's smoothing to TR, +DM, -DM (initial sum, then recursive smoothing)
 *   3. Calculate +DI and -DI from smoothed values
 *   4. Calculate DX = |+DI - -DI| / (+DI + -DI) * 100
 *   5. Apply Wilder's smoothing to DX to get ADX
 */
function calculateADX(klines: any[], period = 14): number {
  // Minimum data requirement: 2*period candles for TR/DM smoothing + ADX smoothing
  const minRequired = 2 * period + 1;
  if (!klines || klines.length < minRequired) {
    return 0;
  }

  // Step 1: Calculate True Range (TR) and Directional Movement (+DM, -DM) arrays
  const trueRanges: number[] = [];
  const plusDMs: number[] = [];
  const minusDMs: number[] = [];

  for (let i = 1; i < klines.length; i++) {
    const high = parseFloat(klines[i][2]);
    const low = parseFloat(klines[i][3]);
    const prevHigh = parseFloat(klines[i - 1][2]);
    const prevLow = parseFloat(klines[i - 1][3]);
    const prevClose = parseFloat(klines[i - 1][4]);

    // Skip bars with invalid/missing data
    if (!Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(prevClose) ||
        !Number.isFinite(prevHigh) || !Number.isFinite(prevLow) || high <= 0 || low <= 0) {
      continue;
    }

    // True Range = max(High-Low, |High-PrevClose|, |Low-PrevClose|)
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );

    // Directional Movement
    const upMove = high - prevHigh;
    const downMove = prevLow - low;

    // +DM = upMove if upMove > downMove AND upMove > 0, else 0
    // -DM = downMove if downMove > upMove AND downMove > 0, else 0
    const plusDM = (upMove > downMove && upMove > 0) ? upMove : 0;
    const minusDM = (downMove > upMove && downMove > 0) ? downMove : 0;

    trueRanges.push(tr);
    plusDMs.push(plusDM);
    minusDMs.push(minusDM);
  }

  // Validate we have enough data after filtering invalid bars
  if (trueRanges.length < 2 * period) {
    return 0;
  }

  // Step 2: Initialize Wilder's smoothing with SUM of first 'period' values
  // Wilder's method uses sum (not average) for initialization to maintain proper scale
  let smoothedTR = 0;
  let smoothedPlusDM = 0;
  let smoothedMinusDM = 0;
  
  for (let i = 0; i < period; i++) {
    smoothedTR += trueRanges[i];
    smoothedPlusDM += plusDMs[i];
    smoothedMinusDM += minusDMs[i];
  }

  // Step 3: Calculate DX values array using continuous Wilder smoothing
  const dxValues: number[] = [];

  // First DX from initial smoothed values
  if (smoothedTR > 0) {
    const plusDI = (smoothedPlusDM / smoothedTR) * 100;
    const minusDI = (smoothedMinusDM / smoothedTR) * 100;
    const diSum = plusDI + minusDI;
    const dx = diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0;
    dxValues.push(dx);
  } else {
    dxValues.push(0);
  }

  // Continue calculating DX with Wilder's smoothing: smoothed = prev - prev/N + current
  for (let i = period; i < trueRanges.length; i++) {
    // Wilder's smoothing formula maintains the sum scale
    smoothedTR = smoothedTR - (smoothedTR / period) + trueRanges[i];
    smoothedPlusDM = smoothedPlusDM - (smoothedPlusDM / period) + plusDMs[i];
    smoothedMinusDM = smoothedMinusDM - (smoothedMinusDM / period) + minusDMs[i];

    if (smoothedTR > 0) {
      const plusDI = (smoothedPlusDM / smoothedTR) * 100;
      const minusDI = (smoothedMinusDM / smoothedTR) * 100;
      const diSum = plusDI + minusDI;
      const dx = diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0;
      dxValues.push(dx);
    } else {
      dxValues.push(0);
    }
  }

  // Validate DX values
  if (dxValues.length < period) {
    return 0;
  }

  // Step 4: Calculate ADX using Wilder's smoothing of DX values
  // Initial ADX = simple average of first 'period' DX values
  let adx = 0;
  for (let i = 0; i < period; i++) {
    adx += dxValues[i];
  }
  adx /= period;

  // Continue Wilder's smoothing: ADX = (prevADX * (N-1) + currentDX) / N
  for (let i = period; i < dxValues.length; i++) {
    adx = ((adx * (period - 1)) + dxValues[i]) / period;
  }

  // Clamp to valid range [0, 100] and round to 1 decimal place
  return Math.max(0, Math.min(100, Math.round(adx * 10) / 10));
}

async function fetchBinanceKlines(symbol: string, interval: string = "1h", limit: number = 100, retries: number = 2): Promise<any[]> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
      );
      
      if (!response.ok) {
        // Don't retry on client errors (4xx)
        if (response.status >= 400 && response.status < 500) {
          throw new Error(`Binance API error: ${response.status} - ${response.statusText}`);
        }
        throw new Error(`Binance API error: ${response.status}`);
      }
      
      const klines = await response.json();
      return Array.isArray(klines) ? klines : [];
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`Failed to fetch Binance klines for ${symbol} on ${interval} (attempt ${attempt + 1}/${retries + 1}):`, lastError.message);
      
      // Wait before retry (exponential backoff)
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, attempt)));
      }
    }
  }
  
  throw lastError || new Error(`Failed to fetch klines for ${symbol}`);
}

function validateMarketStructure(
  klines: any[],
  trend: "bullish" | "bearish" | "neutral",
): { valid: boolean; confidence: number } {
  if (klines.length < 10) return { valid: false, confidence: 0 };

  const highs = klines.slice(-10).map((k: any) => parseFloat(k[2])).filter(Number.isFinite);
  const lows = klines.slice(-10).map((k: any) => parseFloat(k[3])).filter(Number.isFinite);

  if (trend === "bullish") {
    let higherHighs = 0;
    let higherLows = 0;
    for (let i = 1; i < highs.length; i++) {
      if (highs[i] > highs[i - 1]) higherHighs++;
      if (lows[i] > lows[i - 1]) higherLows++;
    }
    const hhPercent = highs.length > 1 ? (higherHighs / (highs.length - 1)) * 100 : 0;
    const hlPercent = lows.length > 1 ? (higherLows / (lows.length - 1)) * 100 : 0;
    const structureScore = (hhPercent + hlPercent) / 2;
    return { valid: structureScore > 50, confidence: structureScore };
  } else if (trend === "bearish") {
    let lowerHighs = 0;
    let lowerLows = 0;
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

// Helper functions for cleaner divergence handling
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

// Enhanced confidence calculation - adds ADX and volume to base confidence
function enhanceConfidenceWithIndicators(
  baseConfidence: number,
  adx: number,
  volumeConfirms: boolean,
  volumeRatio: number
): number {
  let enhanced = baseConfidence;
  
  // ADX contribution - Uses centralized ADX_THRESHOLDS
  // Strong trend (ADX > 25) adds up to 10 points, Weak trend (ADX < 15) subtracts up to 10 points
  if (adx >= ADX_THRESHOLDS.EXTREME) {
    enhanced += 10;
  } else if (adx >= ADX_THRESHOLDS.VERY_STRONG) {
    enhanced += 7;
  } else if (adx >= ADX_THRESHOLDS.STRONG) {
    enhanced += 5;
  } else if (adx >= ADX_THRESHOLDS.MINIMUM) {
    enhanced += 2;
  } else if (adx < 15) {
    enhanced -= 10;
  } else if (adx < ADX_THRESHOLDS.WEAK) {
    enhanced -= 5;
  }
  
  // Volume contribution: Confirming volume adds up to 8 points
  if (volumeConfirms) {
    if (volumeRatio >= 2.0) {
      enhanced += 8; // Strong volume spike
    } else if (volumeRatio >= 1.5) {
      enhanced += 5;
    } else {
      enhanced += 3;
    }
  } else if (volumeRatio < 0.5) {
    enhanced -= 5; // Very low volume = less confidence
  }
  
  // Clamp to 30-95 range (wider than before)
  return Math.min(Math.max(Math.round(enhanced), 30), 95);
}

// True alignment score - measures actual direction agreement across timeframes
function calculateTrueAlignmentScore(
  trend4h: { trend: string; confidence: number; indicators: any },
  trend1h: { trend: string; confidence: number; indicators: any },
  trend30m: { trend: string; confidence: number; indicators: any },
  trend15m: { trend: string; confidence: number; indicators: any },
  dominantTrend: string
): { score: number; breakdown: { directionScore: number; indicatorScore: number; penaltyScore: number } } {
  let directionScore = 0;
  let indicatorScore = 0;
  let penaltyScore = 0;
  
  const trends = [
    { tf: "4h", trend: trend4h.trend, weight: 35, indicators: trend4h.indicators },
    { tf: "1h", trend: trend1h.trend, weight: 30, indicators: trend1h.indicators },
    { tf: "30m", trend: trend30m.trend, weight: 20, indicators: trend30m.indicators },
    { tf: "15m", trend: trend15m.trend, weight: 15, indicators: trend15m.indicators },
  ];
  
  // Direction alignment scoring (max 60 points)
  // Full points if matches dominant trend, half if neutral, penalty if opposing
  for (const tf of trends) {
    if (dominantTrend === "neutral") {
      // When dominant is neutral, score based on internal agreement
      const agreesWithMajority = tf.trend === trend1h.trend;
      if (agreesWithMajority && tf.trend !== "neutral") {
        directionScore += tf.weight * 0.6;
      } else if (tf.trend === "neutral") {
        directionScore += tf.weight * 0.3;
      }
    } else {
      if (tf.trend === dominantTrend) {
        directionScore += tf.weight * 0.6; // Full points for alignment
      } else if (tf.trend === "neutral") {
        directionScore += tf.weight * 0.3; // Half points for neutral
      } else {
        // Opposing trend - apply penalty
        penaltyScore += tf.weight * 0.3;
      }
    }
  }
  
  // Indicator agreement scoring (max 25 points)
  // Check if MACD histograms agree across timeframes
  const macdHistograms = [
    trend4h.indicators?.macdHistogram || 0,
    trend1h.indicators?.macdHistogram || 0,
    trend30m.indicators?.macdHistogram || 0,
    trend15m.indicators?.macdHistogram || 0,
  ];
  
  const macdBullish = macdHistograms.filter(m => m > 0).length;
  const macdBearish = macdHistograms.filter(m => m < 0).length;
  const macdAgreement = Math.max(macdBullish, macdBearish);
  
  if (macdAgreement === 4) {
    indicatorScore += 15; // All MACDs agree
  } else if (macdAgreement === 3) {
    indicatorScore += 10;
  } else if (macdAgreement === 2) {
    indicatorScore += 5;
  }
  
  // Check if RSI signals agree
  const rsiSignals = [
    trend4h.indicators?.rsiSignal || "neutral",
    trend1h.indicators?.rsiSignal || "neutral",
    trend30m.indicators?.rsiSignal || "neutral",
    trend15m.indicators?.rsiSignal || "neutral",
  ];
  
  const rsiBullish = rsiSignals.filter(s => s === "bullish" || s === "strong_bullish" || s === "overbought").length;
  const rsiBearish = rsiSignals.filter(s => s === "bearish" || s === "oversold").length;
  const rsiAgreement = Math.max(rsiBullish, rsiBearish);
  
  if (rsiAgreement >= 3) {
    indicatorScore += 10;
  } else if (rsiAgreement >= 2) {
    indicatorScore += 5;
  }
  
  // Calculate final score (max 85 points possible, subtract penalties)
  const rawScore = directionScore + indicatorScore - penaltyScore;
  
  // Normalize to 0-100 scale
  const normalizedScore = Math.min(Math.max(Math.round(rawScore * 1.18), 0), 100);
  
  return {
    score: normalizedScore,
    breakdown: {
      directionScore: Math.round(directionScore),
      indicatorScore: Math.round(indicatorScore),
      penaltyScore: Math.round(penaltyScore),
    },
  };
}

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
  if (prices.length < 30) {
    return {
      trend: "neutral",
      confidence: 35, // Lower floor for insufficient data
      indicators: {
        ema12: 0, ema26: 0, emaSignal: "neutral",
        rsi: 50, rsiSignal: "neutral",
        macd: 0, macdSignal: 0, macdHistogram: 0, macdTrend: "neutral"
      }
    };
  }

  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const rsi = calculateRSI(prices, 14);
  const { macd, signal, histogram } = calculateMACD(prices);

  let bullishSignals = 0;
  let bearishSignals = 0;
  let totalWeight = 0;

  // EMA signal (weight 3)
  const emaWeight = 3;
  let emaSignal = "neutral";
  if (ema12 > ema26) {
    const emaDiff = ema26 !== 0 ? ((ema12 - ema26) / ema26) * 100 : 0;
    if (emaDiff > 0.1) {
      bullishSignals += emaWeight;
      emaSignal = "bullish";
    }
  } else if (ema12 < ema26) {
    const emaDiff = ema26 !== 0 ? ((ema26 - ema12) / ema26) * 100 : 0;
    if (emaDiff > 0.1) {
      bearishSignals += emaWeight;
      emaSignal = "bearish";
    }
  }
  totalWeight += emaWeight;

  // RSI signal (weight 2.5) - TIGHTENED thresholds to reduce weak signals
  // Previous: >55 bullish, <35 bearish - too permissive
  const rsiWeight = 2.5;
  let rsiSignal = "neutral";
  if (rsi > 60) { // Raised from 55 to 60
    bullishSignals += rsiWeight * ((rsi - 60) / 40); // Scaled from 60
    if (rsi > 70) rsiSignal = "overbought";
    else if (rsi > 65) rsiSignal = "strong_bullish";
    else rsiSignal = "bullish";
  } else if (rsi < 40) { // Raised from 35 to 40
    bearishSignals += rsiWeight * ((40 - rsi) / 40); // Scaled from 40
    rsiSignal = rsi < 30 ? "oversold" : "bearish";
  } else {
    rsiSignal = "neutral";
  }
  totalWeight += rsiWeight;

  // MACD signal (weight 3.5 - slightly increased)
  const macdWeight = 3.5;
  let macdTrend = "neutral";
  if (histogram > 0 && macd > signal) {
    const macdStrength = Math.min(Math.abs(histogram) / Math.abs(macd || 1), 1);
    bullishSignals += macdWeight * macdStrength;
    macdTrend = "bullish";
  } else if (histogram < 0 && macd < signal) {
    const macdStrength = Math.min(Math.abs(histogram) / Math.abs(macd || 1), 1);
    bearishSignals += macdWeight * macdStrength;
    macdTrend = "bearish";
  }
  totalWeight += macdWeight;

  const netSignal = bullishSignals - bearishSignals;
  const rawConfidence = (Math.abs(netSignal) / totalWeight) * 100;
  
  // Wider confidence range: 30-95 instead of 40-90
  // More sensitive to signal strength
  let confidence = 30 + rawConfidence * 0.65;
  confidence = Math.min(Math.max(confidence, 30), 95);

  // TIGHTENED: Require higher net signal for trend determination
  // Previous threshold of 3.0 was too loose
  let trend: "bullish" | "bearish" | "neutral" = "neutral";
  if (netSignal >= 4.0) trend = "bullish"; // Raised from 3.0 to 4.0
  else if (netSignal <= -4.0) trend = "bearish"; // Raised from -3.0 to -4.0

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
    // Parse request body with proper error handling
    let body: { symbol?: string };
    try {
      body = await req.json();
    } catch (parseError) {
      return new Response(
        JSON.stringify({ error: "Invalid JSON in request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const { symbol } = body;
    if (!symbol || typeof symbol !== "string") {
      return new Response(
        JSON.stringify({ error: "Symbol is required and must be a string" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Multi-timeframe analysis for ${symbol}`);

    const [klines15m, klines30m, klines1h, klines4h] = await Promise.all([
      fetchBinanceKlines(symbol, "15m", 100),
      fetchBinanceKlines(symbol, "30m", 100),
      fetchBinanceKlines(symbol, "1h", 100),
      fetchBinanceKlines(symbol, "4h", 50),
    ]);

    const prices15m = klines15m.map((k: any) => parseFloat(k[4])).filter(Number.isFinite);
    const prices30m = klines30m.map((k: any) => parseFloat(k[4])).filter(Number.isFinite);
    const prices1h = klines1h.map((k: any) => parseFloat(k[4])).filter(Number.isFinite);
    const prices4h = klines4h.map((k: any) => parseFloat(k[4])).filter(Number.isFinite);

    // Safety check for empty price arrays
    if (prices1h.length === 0) {
      throw new Error(`No valid 1h price data for ${symbol}`);
    }

    const currentPrice = prices1h[prices1h.length - 1];

    const trend15m = calculateTrend(prices15m);
    const trend30m = calculateTrend(prices30m);
    const trend1h = calculateTrend(prices1h);
    const trend4h = calculateTrend(prices4h);

    // Calculate Stochastic RSI for all timeframes
    const stochRsi15m = calculateStochasticRSI(prices15m);
    const stochRsi30m = calculateStochasticRSI(prices30m);
    const stochRsi1h = calculateStochasticRSI(prices1h);
    const stochRsi4h = calculateStochasticRSI(prices4h);

    console.log(
      `${symbol} StochRSI: 1h K=${stochRsi1h.k} D=${stochRsi1h.d} signal=${stochRsi1h.signal} | 4h K=${stochRsi4h.k} D=${stochRsi4h.d} signal=${stochRsi4h.signal}`
    );

    const dominantTrend = trend4h.trend;
    const dominantConfidence = trend4h.confidence;

    // Pre-calculate ADX and ATR once to avoid duplicate calculations
    const adx = calculateADX(klines1h, 14);
    const atrPeriod = 14;
    const atrLookback = 30;
    const atrKlines = klines1h.slice(-atrPeriod - 1);
    let atrSum = 0;
    for (let i = 1; i < atrKlines.length; i++) {
      const high = parseFloat(atrKlines[i][2]);
      const low = parseFloat(atrKlines[i][3]);
      const prevClose = parseFloat(atrKlines[i - 1][4]);
      const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
      atrSum += tr;
    }
    const currentATR = atrKlines.length > 1 ? atrSum / (atrKlines.length - 1) : 0;
    const atrPercent = currentPrice !== 0 ? (currentATR / currentPrice) * 100 : 0;
    const historicalATRAvg = calculateHistoricalATRAvg(klines1h, atrPeriod, atrLookback, currentATR);
    const relativeATR = historicalATRAvg !== 0 ? currentATR / historicalATRAvg : 0;

    const isOpposing = (tfTrend: string, dominantTrend: string) => {
      if (dominantTrend === "neutral") return false;
      if (tfTrend === "neutral") return false;
      return tfTrend !== dominantTrend;
    };

    // Check trend alignment and opposition for weighted consistency calculation
    const confirmation1h = trend1h.trend === dominantTrend;
    const confirmation30m = trend30m.trend === dominantTrend;
    const confirmation15m = trend15m.trend === dominantTrend;
    const opposing1h = isOpposing(trend1h.trend, dominantTrend);
    const opposing30m = isOpposing(trend30m.trend, dominantTrend);
    const opposing15m = isOpposing(trend15m.trend, dominantTrend);

    // Calculate weighted trend consistency
    let weightedConsistency: number;
    if (dominantTrend === "neutral") {
      // When 4h is neutral, derive direction from lower timeframes
      const lowerTimeframesAligned =
        trend1h.trend === trend30m.trend && trend30m.trend === trend15m.trend && trend1h.trend !== "neutral";
      if (lowerTimeframesAligned) {
        weightedConsistency =
          dominantConfidence * 0.3 +
          trend1h.confidence * 0.35 +
          trend30m.confidence * 0.2 +
          trend15m.confidence * 0.15;
      } else {
        const trends = [trend1h.trend, trend30m.trend, trend15m.trend].filter((t) => t !== "neutral");
        const bullishCount = trends.filter((t) => t === "bullish").length;
        const bearishCount = trends.filter((t) => t === "bearish").length;
        const majorityTrend =
          bullishCount > bearishCount ? "bullish" : bearishCount > bullishCount ? "bearish" : "neutral";
        if (majorityTrend === "neutral") {
          weightedConsistency = dominantConfidence * 0.3;
        } else {
          const use1h = trend1h.trend === majorityTrend;
          const use30m = trend30m.trend === majorityTrend;
          const use15m = trend15m.trend === majorityTrend;
          const baseWeights = { tf4h: 0.25, tf1h: 0.3, tf30m: 0.25, tf15m: 0.2 };
          const includedWeightSum =
            baseWeights.tf4h +
            (use1h ? baseWeights.tf1h : 0) +
            (use30m ? baseWeights.tf30m : 0) +
            (use15m ? baseWeights.tf15m : 0);
          const scaleFactor = includedWeightSum > 0 ? 1.0 / includedWeightSum : 0;
          const normalized4h = baseWeights.tf4h * scaleFactor;
          const normalized1h = use1h ? baseWeights.tf1h * scaleFactor : 0;
          const normalized30m = use30m ? baseWeights.tf30m * scaleFactor : 0;
          const normalized15m = use15m ? baseWeights.tf15m * scaleFactor : 0;
          weightedConsistency =
            dominantConfidence * normalized4h +
            (use1h ? trend1h.confidence * normalized1h : 0) +
            (use30m ? trend30m.confidence * normalized30m : 0) +
            (use15m ? trend15m.confidence * normalized15m : 0);
        }
      }
    } else {
      const baseWeights = {
        tf4h: 0.45,
        tf1h_aligned: 0.3,
        tf1h_neutral: 0.15,
        tf30m_aligned: 0.15,
        tf30m_neutral: 0.075,
        tf15m_aligned: 0.1,
        tf15m_neutral: 0.05,
      };
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
    console.log(
      `${symbol} ALIGNMENT: 4h=${dominantTrend} 1h=${trend1h.trend} 30m=${trend30m.trend} 15m=${trend15m.trend} | opposing: 1h=${opposing1h} 30m=${opposing30m} 15m=${opposing15m} | standardAlignment=${standardAlignment}`,
    );

    let neutralAllowedWithStrongHigherTimeframe = false;
    if (!standardAlignment && dominantTrend !== "neutral" && trend1h.trend === "neutral") {
      const strong4h = dominantConfidence >= 60;
      const macd1h = trend1h.indicators.macdHistogram;
      const macdAligned = dominantTrend === "bullish" ? macd1h >= 0 : macd1h <= 0;
      const hasActivity = adx >= 20;
      const atrNotExtremelyCompressed = relativeATR >= 0.5;
      if (strong4h && macdAligned && (hasActivity || atrNotExtremelyCompressed)) {
        neutralAllowedWithStrongHigherTimeframe = true;
        console.log(
          `${symbol}: 1h=neutral ALLOWED with strong 4h=${dominantTrend}(${dominantConfidence}%) - MACD=${macd1h.toFixed(3)} ADX=${adx.toFixed(1)} relATR=${relativeATR.toFixed(2)}`,
        );
      } else {
        console.log(
          `${symbol}: 1h=neutral BLOCKED - strong4h=${strong4h} macdAligned=${macdAligned} hasActivity=${hasActivity} atrOK=${atrNotExtremelyCompressed}`,
        );
      }
    }

    const highTimeframeAligned = standardAlignment || neutralAllowedWithStrongHigherTimeframe;

    let divergenceType: "aligned" | "pullback" | "early_reversal" | "ranging_conflict" = "aligned";
    let divergenceConfidence = 100;
    let allowDivergenceSignal = false;
    if (!highTimeframeAligned) {
      // TIGHTENED: Pullback requires stronger 4h confirmation (70% vs 60%)
      // and 1h must be sufficiently strong (60% vs 50%)
      if (dominantTrend !== "neutral" && dominantConfidence >= 70 && trend1h.confidence >= 60) {
        divergenceType = "pullback";
        divergenceConfidence = Math.min(dominantConfidence * 0.7, 65); // Reduced from 0.75, 70
        allowDivergenceSignal = true;
        console.log(
          `${dominantTrend.toUpperCase()} PULLBACK detected: 4h=${dominantConfidence}% vs 1h=${trend1h.trend}`,
        );
      } 
      // TIGHTENED: Early reversal requires very strong 1h (75% vs 70%)
      // and ADX must show trend strength
      else if (trend1h.confidence >= 75 && (dominantTrend === "neutral" || dominantConfidence < 55) && adx >= 18) {
        divergenceType = "early_reversal";
        divergenceConfidence = Math.min(trend1h.confidence * 0.65, 60); // Reduced from 0.7, 65
        allowDivergenceSignal = true;
        console.log(
          `EARLY REVERSAL detected: 1h=${trend1h.trend}(${trend1h.confidence}%) vs weak/neutral 4h=${dominantTrend}(${dominantConfidence}%) ADX=${adx.toFixed(1)}`,
        );
      } else {
        divergenceType = "ranging_conflict";
        divergenceConfidence = 0;
        allowDivergenceSignal = false;
        console.log(`RANGING CONFLICT: Skipping - unclear divergence pattern`);
      }
    }
    let primaryTrend: "bullish" | "bearish" | "neutral" | "ranging" = dominantTrend;
    
    const volume15m = calculateVolumeAnalysis(klines15m);
    const volume30m = calculateVolumeAnalysis(klines30m);
    const volume1h = calculateVolumeAnalysis(klines1h);
    
    const bb15m = calculateBollingerBands(prices15m, 20, 2);
    const bb30m = calculateBollingerBands(prices30m, 20, 2);
    const bb1h = calculateBollingerBands(prices1h, 20, 2);
    const bb4h = calculateBollingerBands(prices4h, 20, 2);
    
    const bollingerSqueezeActive = bb1h.squeeze || bb4h.squeeze;
    const squeezeBreakoutPotential = bollingerSqueezeActive && bb1h.squeezeIntensity > 50;
    
    console.log(
      `${symbol} BOLLINGER: 1h squeeze=${bb1h.squeeze}(${bb1h.squeezeIntensity}%) 4h squeeze=${bb4h.squeeze}(${bb4h.squeezeIntensity}%) position=${bb1h.pricePosition} %B=${bb1h.percentB}`
    );
    const volume4h = calculateVolumeAnalysis(klines4h);

    // Calculate ADX for each timeframe for enhanced confidence
    const adx15m = calculateADX(klines15m, 14);
    const adx30m = calculateADX(klines30m, 14);
    const adx4h = calculateADX(klines4h, 14);

    // Enhance confidence with ADX and volume for each timeframe
    const enhancedConfidence15m = enhanceConfidenceWithIndicators(
      trend15m.confidence, adx15m, volume15m.volumeSpike || volume15m.volumeTrend === "increasing", volume15m.volumeRatio
    );
    const enhancedConfidence30m = enhanceConfidenceWithIndicators(
      trend30m.confidence, adx30m, volume30m.volumeSpike || volume30m.volumeTrend === "increasing", volume30m.volumeRatio
    );
    const enhancedConfidence1h = enhanceConfidenceWithIndicators(
      trend1h.confidence, adx, volume1h.volumeSpike || volume1h.volumeTrend === "increasing", volume1h.volumeRatio
    );
    const enhancedConfidence4h = enhanceConfidenceWithIndicators(
      trend4h.confidence, adx4h, volume4h.volumeSpike || volume4h.volumeTrend === "increasing", volume4h.volumeRatio
    );

    // Calculate true alignment score (replaces old weightedConsistency)
    const trueAlignment = calculateTrueAlignmentScore(trend4h, trend1h, trend30m, trend15m, dominantTrend);
    
    console.log(
      `${symbol} ENHANCED CONFIDENCE: 4h=${trend4h.confidence}->${enhancedConfidence4h} 1h=${trend1h.confidence}->${enhancedConfidence1h} | ALIGNMENT: score=${trueAlignment.score} (dir=${trueAlignment.breakdown.directionScore} ind=${trueAlignment.breakdown.indicatorScore} pen=${trueAlignment.breakdown.penaltyScore})`
    );

    const atrCompressed = relativeATR < 0.6;
    const adxWeak = adx < 20;
    const isRanging = atrCompressed && adxWeak;
    const volatilityNormal = !isRanging && atrPercent < 5.0;
    if (isRanging) {
      primaryTrend = "ranging";
      console.log(
        `${symbol}: RANGING MARKET DETECTED - ATR: ${atrPercent.toFixed(2)}% (relative: ${relativeATR.toFixed(2)}x), ADX: ${adx.toFixed(1)} - skipping signals`,
      );
    } else {
      console.log(
        `${symbol}: TRENDING MARKET - ATR: ${atrPercent.toFixed(2)}% (relative: ${relativeATR.toFixed(2)}x), ADX: ${adx.toFixed(1)}`,
      );
    }

    let inPullback = false;
    let pullbackPercent = 0;
    if (dominantTrend === "bullish" || dominantTrend === "bearish") {
      const recentKlines = klines1h.slice(-24);
      const recentHighs = recentKlines.map((k: any) => parseFloat(k[2])).filter(Number.isFinite);
      const recentLows = recentKlines.map((k: any) => parseFloat(k[3])).filter(Number.isFinite);
      if (dominantTrend === "bullish") {
        const swingHigh = recentHighs.length > 0 ? Math.max(...recentHighs) : 0;
        const recentLows12 = recentLows.slice(-12);
        const swingLow = recentLows12.length > 0 ? Math.min(...recentLows12) : 0;
        const range = swingHigh - swingLow;
        const pullback = swingHigh - currentPrice;
        pullbackPercent = range !== 0 ? (pullback / range) * 100 : 0;
        inPullback = pullbackPercent >= 10 && pullbackPercent <= 65;
      } else if (dominantTrend === "bearish") {
        const swingLow = recentLows.length > 0 ? Math.min(...recentLows) : 0;
        const recentHighs12 = recentHighs.slice(-12);
        const swingHigh = recentHighs12.length > 0 ? Math.max(...recentHighs12) : 0;
        const range = swingHigh - swingLow;
        const pullback = currentPrice - swingLow;
        pullbackPercent = range !== 0 ? (pullback / range) * 100 : 0;
        inPullback = pullbackPercent >= 10 && pullbackPercent <= 65;
      }
    }

    const lastClose = prices1h.length >= 1 ? prices1h[prices1h.length - 1] : 0;
    const prevClose = prices1h.length >= 2 ? prices1h[prices1h.length - 2] : lastClose;

    const macdHistogram = trend1h.indicators.macdHistogram;
    
    const prevMacdHistogram = prices1h.length >= 36 ? 
      calculateMACD(prices1h.slice(0, -1)).histogram : macdHistogram;

    let effectiveTrendForMomentum = dominantTrend;
    if (dominantTrend === "neutral") {
      const bullishVotes = [trend1h.trend, trend30m.trend, trend15m.trend].filter((t) => t === "bullish").length;
      const bearishVotes = [trend1h.trend, trend30m.trend, trend15m.trend].filter((t) => t === "bearish").length;
      if (bullishVotes > bearishVotes) {
        effectiveTrendForMomentum = "bullish";
      } else if (bearishVotes > bullishVotes) {
        effectiveTrendForMomentum = "bearish";
      }
    }

    // TIGHTENED: Volume confirmation now requires price alignment too
    // Volume spikes alone don't confirm direction - need price movement agreement
    const priceDirectionMatches = 
      (effectiveTrendForMomentum === "bullish" && lastClose > prevClose) ||
      (effectiveTrendForMomentum === "bearish" && lastClose < prevClose);
    
    const volumeConfirmsDirection = priceDirectionMatches && (
      (effectiveTrendForMomentum === "bullish" && volume1h.volumeTrend === "increasing") ||
      (effectiveTrendForMomentum === "bearish" && volume1h.volumeTrend === "increasing") ||
      volume1h.volumeSpike
    );
    
    // Reduce volume boost - was giving too much credit to volume
    const volumeBoost = volumeConfirmsDirection ? 1.10 : 1.0; // Reduced from 1.15

    const lastCloseAlignsWithTrend =
      (effectiveTrendForMomentum === "bullish" && lastClose > prevClose) ||
      (effectiveTrendForMomentum === "bearish" && lastClose < prevClose) ||
      effectiveTrendForMomentum === "neutral";

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

    // TIGHTENED: MACD expanding now requires minimum ADX threshold - Uses centralized ADX_THRESHOLDS
    // Previously macdExpanding had no ADX check, allowing weak signals as "mixed"
    const macdExpanding = Math.abs(macdHistogram) > 0.05 && macdDirectionAligned && adx >= 15;
    const macdStrong = Math.abs(macdHistogram) > 0.5 && macdDirectionAligned && adx >= 15;

    // TIGHTENED: Momentum confirmation requires ADX >= MODERATE (22)
    const momentumConfirms = macdExpanding && lastCloseAlignsWithTrend && !hasDivergence && adx >= ADX_THRESHOLDS.MODERATE;
    let momentumState: "none" | "mixed" | "confirmed" = "none";
    if (momentumConfirms) {
      momentumState = "confirmed";
    } else if (macdExpanding && (hasDivergence || !lastCloseAlignsWithTrend)) {
      // Mixed: MACD expanding but divergence exists or price doesn't align
      // Only allow mixed if ADX shows some trend (prevents weak signals)
      momentumState = adx >= ADX_THRESHOLDS.WEAK ? "mixed" : "none";
    } else if (macdStrong && adx >= ADX_THRESHOLDS.MINIMUM) {
      // Mixed: Strong MACD magnitude even without expansion, but needs ADX confirmation
      momentumState = "mixed";
    }
    console.log(
      `${symbol} MOMENTUM: lastClose=${lastClose.toFixed(2)} prevClose=${prevClose.toFixed(2)} alignsWithTrend=${lastCloseAlignsWithTrend} divergence=${hasDivergence} macd=${macdHistogram.toFixed(3)} expanding=${macdExpanding} adx=${adx.toFixed(1)} volumeConfirms=${volumeConfirmsDirection} confirms=${momentumConfirms} state=${momentumState}`,
    );
    const marketStructure = validateMarketStructure(klines1h, trend1h.trend);
    console.log(
      `${symbol}: 4h=${trend4h.trend} 1h=${trend1h.trend} 30m=${trend30m.trend} aligned=${highTimeframeAligned} pullback=${inPullback}(${pullbackPercent.toFixed(1)}%) momentum=${momentumConfirms} ranging=${isRanging}`,
    );
    return new Response(
      JSON.stringify({
        symbol,
        currentPrice,
        trend: dominantTrend,
        confidence: enhancedConfidence4h, // Use enhanced confidence
        higherTimeframeFilter: {
          trend4h: trend4h.trend,
          trend1h: trend1h.trend,
          aligned: highTimeframeAligned,
          neutralAllowedWithStrongHigherTimeframe: neutralAllowedWithStrongHigherTimeframe,
          dominantConfidence: enhancedConfidence4h, // Enhanced
          weightedConsistency: trueAlignment.score, // Use true alignment score
          divergenceType: divergenceType,
          divergenceConfidence: Math.round(divergenceConfidence),
          allowDivergenceSignal: allowDivergenceSignal,
          recommendedPositionSize: calculateRecommendedPositionSize(divergenceType),
          tradeDirection: calculateTradeDirection(divergenceType, dominantTrend, trend1h.trend, primaryTrend),
        },
        pullback: {
          inPullback,
          pullbackPercent: Math.round(pullbackPercent * 10) / 10,
          ideal: inPullback && pullbackPercent >= 10 && pullbackPercent <= 55,
        },
        ranging: {
          isRanging,
          atrPercent: Math.round(atrPercent * 100) / 100,
          safe: atrPercent >= 2.0 && atrPercent <= 5.0,
        },
        momentum: {
          confirms: momentumConfirms,
          state: momentumState,
          building: macdExpanding && !hasDivergence,
          lastCloseAlignsWithTrend,
          hasDivergence,
          macdHistogram: Math.round(macdHistogram * 1000) / 1000,
          macdExpanding,
          macdDirectionAligned,
          adx: Math.round(adx * 10) / 10,
          volumeConfirms: volumeConfirmsDirection,
          volumeBoost: volumeBoost,
        },
        multiTimeframe: {
          trend15m: trend15m.trend,
          trend30m: trend30m.trend,
          trend1h: trend1h.trend,
          trend4h: trend4h.trend,
          confidence15m: enhancedConfidence15m, // Enhanced
          confidence30m: enhancedConfidence30m, // Enhanced
          confidence1h: enhancedConfidence1h, // Enhanced
          confidence4h: enhancedConfidence4h, // Enhanced
        },
        alignmentBreakdown: trueAlignment.breakdown, // New: detailed breakdown
        timeframes: {
          "15m": trend15m,
          "30m": trend30m,
          "1h": trend1h,
          "4h": trend4h,
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
        volume: {
          "15m": volume15m,
          "30m": volume30m,
          "1h": volume1h,
          "4h": volume4h,
        },
        // NEW: Volume Score for strategy-analyzer quality scoring (0-10 points)
        volumeScore: (() => {
          const volumeConfirms = volumeConfirmsDirection;
          const volumeSpike = volume1h.volumeSpike ?? false;
          const volumeRatio = volume1h.volumeRatio ?? 1.0;
          
          // Best case: Volume confirms AND spike detected with high ratio
          if (volumeConfirms && volumeSpike && volumeRatio > 2.0) return 10;
          if (volumeConfirms && volumeSpike) return 8;
          if (volumeConfirms && volumeRatio > 1.5) return 7;
          if (volumeConfirms) return 5;
          if (volumeRatio > 1.5) return 3;
          if (volumeRatio > 1.2) return 2;
          if (dominantTrend === "neutral") return 1;
          return 0;
        })(),
        bollingerBands: {
          "15m": bb15m,
          "30m": bb30m,
          "1h": bb1h,
          "4h": bb4h,
          squeezeActive: bollingerSqueezeActive,
          breakoutPotential: squeezeBreakoutPotential,
          squeeze: bb1h.squeeze,
          squeezeIntensity: bb1h.squeezeIntensity,
          pricePosition: bb1h.pricePosition,
          percentB: bb1h.percentB,
          bandwidth: bb1h.bandwidth,
        },
        stochasticRsi: (() => {
          const allStochRsi = [stochRsi15m, stochRsi30m, stochRsi1h, stochRsi4h];
          const overboughtCount = allStochRsi.filter(s => s.signal === "overbought").length;
          const oversoldCount = allStochRsi.filter(s => s.signal === "oversold").length;
          const bullishCrossCount = allStochRsi.filter(s => s.signal === "bullish_cross").length;
          const bearishCrossCount = allStochRsi.filter(s => s.signal === "bearish_cross").length;
          
          let recommendation = "neutral";
          if (overboughtCount >= 3) recommendation = "strong_sell_warning";
          else if (oversoldCount >= 3) recommendation = "strong_buy_opportunity";
          else if (overboughtCount >= 2 && stochRsi1h.signal === "overbought") recommendation = "sell_warning";
          else if (oversoldCount >= 2 && stochRsi1h.signal === "oversold") recommendation = "buy_opportunity";
          else if (bullishCrossCount >= 2) recommendation = "bullish_momentum";
          else if (bearishCrossCount >= 2) recommendation = "bearish_momentum";
          
          return {
            "15m": stochRsi15m,
            "30m": stochRsi30m,
            "1h": stochRsi1h,
            "4h": stochRsi4h,
            primarySignal: stochRsi1h.signal,
            primaryK: stochRsi1h.k,
            primaryD: stochRsi1h.d,
            overboughtCount,
            oversoldCount,
            bullishCrossCount,
            bearishCrossCount,
            recommendation,
          };
        })(),
        aggregated: {
          overboughtCount: [stochRsi15m, stochRsi30m, stochRsi1h, stochRsi4h].filter(s => s.signal === "overbought").length,
          oversoldCount: [stochRsi15m, stochRsi30m, stochRsi1h, stochRsi4h].filter(s => s.signal === "oversold").length,
          bullishCrossCount: [stochRsi15m, stochRsi30m, stochRsi1h, stochRsi4h].filter(s => s.signal === "bullish_cross").length,
          bearishCrossCount: [stochRsi15m, stochRsi30m, stochRsi1h, stochRsi4h].filter(s => s.signal === "bearish_cross").length,
        },
        indicators: trend1h.indicators,
        trendConsistency: trueAlignment.score,
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
