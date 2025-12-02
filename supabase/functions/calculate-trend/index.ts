import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

// Fixed: Proper Wilder’s RSI from the very first average
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

// Fixed: Uses aligned EMA arrays → correct MACD line and signal
function calculateMACD(prices: number[]): { macd: number; signal: number; histogram: number } {
  if (prices.length < 35) return { macd: 0, signal: 0, histogram: 0 };

  const ema12Array = calculateEMAArray(prices, 12);
  const ema26Array = calculateEMAArray(prices, 26);

  const macdLine: number[] = [];
  const startIdx = Math.max(34, prices.length - 100);

  for (let i = startIdx; i < prices.length; i++) {
    const e12 = ema12Array[i] ?? 0;
    const e26 = ema26Array[i] ?? 0;
    macdLine.push(e12 - e26);
  }

  const macd = macdLine[macdLine.length - 1];
  const signalLine = macdLine.length >= 9 ? calculateEMA(macdLine.slice(-50), 9) : macd;
  const histogram = macd - signalLine;

  return { macd, signal: signalLine, histogram };
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

// Fixed: Proper Wilder’s ADX with correct smoothing
function calculateADX(klines: any[], period = 14): number {
  if (klines.length < period + 2) return 0;

  const trueRanges: number[] = [];
  const plusDMs: number[] = [];
  const minusDMs: number[] = [];

  for (let i = 1; i < klines.length; i++) {
    const high = parseFloat(klines[i][2]);
    const low = parseFloat(klines[i][3]);
    const prevHigh = parseFloat(klines[i - 1][2]);
    const prevLow = parseFloat(klines[i - 1][3]);
    const prevClose = parseFloat(klines[i - 1][4]);

    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    const upMove = high - prevHigh;
    const downMove = prevLow - low;

    const plusDM = upMove > downMove && upMove > 0 ? upMove : 0;
    const minusDM = downMove > upMove && downMove > 0 ? downMove : 0;

    trueRanges.push(tr);
    plusDMs.push(plusDM);
    minusDMs.push(minusDM);
  }

  if (trueRanges.length < period) return 0;

  let smoothedTR = trueRanges.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothedPlusDM = plusDMs.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothedMinusDM = minusDMs.slice(0, period).reduce((a, b) => a + b, 0);

  let dxValues: number[] = [];
  let plusDI = smoothedTR > 0 ? (smoothedPlusDM / smoothedTR) * 100 : 0;
  let minusDI = smoothedTR > 0 ? (smoothedMinusDM / smoothedTR) * 100 : 0;
  let dx = plusDI + minusDI > 0 ? Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100 : 0;
  dxValues.push(dx);

  for (let i = period; i < trueRanges.length; i++) {
    smoothedTR = smoothedTR - smoothedTR / period + trueRanges[i];
    smoothedPlusDM = smoothedPlusDM - smoothedPlusDM / period + plusDMs[i];
    smoothedMinusDM = smoothedMinusDM - smoothedMinusDM / period + minusDMs[i];

    plusDI = smoothedTR > 0 ? (smoothedPlusDM / smoothedTR) * 100 : 0;
    minusDI = smoothedTR > 0 ? (smoothedMinusDM / smoothedTR) * 100 : 0;
    dx = plusDI + minusDI > 0 ? Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100 : 0;
    dxValues.push(dx);
  }

  if (dxValues.length < period) return 0;

  let adx = dxValues.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dxValues.length; i++) {
    adx = (adx * (period - 1) + dxValues[i]) / period;
  }
  return Math.round(adx * 10) / 10;
}

async function fetchBinanceKlines(symbol: string, interval: string = "1h", limit: number = 100): Promise<any[]> {
  try {
    const response = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
    );
    if (!response.ok) throw new Error(`Binance API error: ${response.status}`);
    const klines = await response.json();
    return Array.isArray(klines) ? klines : [];
  } catch (error) {
    console.error(`Failed to fetch Binance klines for ${symbol} on ${interval}:`, error);
    throw error;
  }
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
      confidence: 40,
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

  const rsiWeight = 2;
  let rsiSignal = "neutral";
  if (rsi > 55) {
    bullishSignals += rsiWeight * ((rsi - 55) / 45);
    if (rsi > 70) rsiSignal = "overbought";
    else if (rsi > 65) rsiSignal = "strong_bullish";
    else rsiSignal = "bullish";
  } else if (rsi < 35) {
    bearishSignals += rsiWeight * ((35 - rsi) / 35);
    rsiSignal = rsi < 30 ? "oversold" : "bearish";
  } else {
    rsiSignal = "neutral";
  }
  totalWeight += rsiWeight;

  const macdWeight = 3;
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
  let confidence = 40 + rawConfidence * 0.5;
  confidence = Math.min(Math.max(confidence, 40), 90);

  let trend: "bullish" | "bearish" | "neutral" = "neutral";
  if (netSignal >= 3.0) trend = "bullish";
  else if (netSignal <= -3.0) trend = "bearish";

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
    if (!symbol || typeof symbol !== "string") throw new Error("Symbol is required and must be a string");

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

    const currentPrice = prices1h[prices1h.length - 1];

    const trend15m = calculateTrend(prices15m);
    const trend30m = calculateTrend(prices30m);
    const trend1h = calculateTrend(prices1h);
    const trend4h = calculateTrend(prices4h);

    const dominantTrend = trend4h.trend;
    const dominantConfidence = trend4h.confidence;

    const isOpposing = (tfTrend: string, dominantTrend: string) => {
      if (dominantTrend === "neutral") return false;
      if (tfTrend === "neutral") return false;
      return tfTrend !== dominantTrend;
    };

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
      // 1) If ALL lower timeframes agree, we already use full weighting
      const lowerTimeframesAligned =
        trend1h.trend === trend30m.trend && trend30m.trend === trend15m.trend && trend1h.trend !== "neutral";
      if (lowerTimeframesAligned) {
        // All lower timeframes aligned - weight them normally plus 4h contribution
        weightedConsistency =
          dominantConfidence * 0.3 + // 4h contributes but with reduced weight when neutral
          trend1h.confidence * 0.35 + // 1h: 35%
          trend30m.confidence * 0.2 + // 30m: 20%
          trend15m.confidence * 0.15; // 15m: 15%
      } else {
        // 2) PARTIAL ALIGNMENT: use majority vote among 1h/30m/15m
        const trends = [trend1h.trend, trend30m.trend, trend15m.trend].filter((t) => t !== "neutral");
        const bullishCount = trends.filter((t) => t === "bullish").length;
        const bearishCount = trends.filter((t) => t === "bearish").length;
        const majorityTrend =
          bullishCount > bearishCount ? "bullish" : bearishCount > bullishCount ? "bearish" : "neutral";
        if (majorityTrend === "neutral") {
          // No clear majority - fall back to 4h only
          weightedConsistency = dominantConfidence * 0.3;
        } else {
          // Use only timeframes that match the majority direction
          const use1h = trend1h.trend === majorityTrend;
          const use30m = trend30m.trend === majorityTrend;
          const use15m = trend15m.trend === majorityTrend;
          // Base weights (must sum to 1.0)
          const baseWeights = {
            tf4h: 0.25,
            tf1h: 0.3,
            tf30m: 0.25,
            tf15m: 0.2,
          };
          // Calculate sum of included weights
          const includedWeightSum =
            baseWeights.tf4h + // 4h always included as stabilizer
            (use1h ? baseWeights.tf1h : 0) +
            (use30m ? baseWeights.tf30m : 0) +
            (use15m ? baseWeights.tf15m : 0);
          // Normalize: scale weights so they sum to 1.0
          const scaleFactor = includedWeightSum > 0 ? 1.0 / includedWeightSum : 0;
          // Apply normalized weights
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
      // Standard calculation when 4h has a directional trend
      // Base weights for standard case
      const baseWeights = {
        tf4h: 0.45,
        tf1h_aligned: 0.3,
        tf1h_neutral: 0.15, // 0.5x multiplier for neutral 1h
        tf30m_aligned: 0.15,
        tf30m_neutral: 0.075, // 0.5x multiplier for neutral 30m
        tf15m_aligned: 0.1,
        tf15m_neutral: 0.05, // 0.5x multiplier for neutral 15m
      };
      // Determine timeframe contributions
      // Aligned = full weight, Neutral = 0.5x weight, Opposing = excluded
      const use1h_aligned = confirmation1h;
      const use1h_neutral = !confirmation1h && trend1h.trend === "neutral" && !opposing1h;
      const use30m_aligned = confirmation30m;
      const use30m_neutral = !confirmation30m && trend30m.trend === "neutral" && !opposing30m;
      const use15m_aligned = confirmation15m;
      const use15m_neutral = !confirmation15m && trend15m.trend === "neutral" && !opposing15m;
      // Calculate sum of included weights
      const includedWeightSum =
        baseWeights.tf4h + // 4h always included
        (use1h_aligned ? baseWeights.tf1h_aligned : 0) +
        (use1h_neutral ? baseWeights.tf1h_neutral : 0) +
        (use30m_aligned ? baseWeights.tf30m_aligned : 0) +
        (use30m_neutral ? baseWeights.tf30m_neutral : 0) +
        (use15m_aligned ? baseWeights.tf15m_aligned : 0) +
        (use15m_neutral ? baseWeights.tf15m_neutral : 0);
      // Normalize: scale weights so they sum to 1.0
      const scaleFactor = includedWeightSum > 0 ? 1.0 / includedWeightSum : 0;
      // Apply normalized weights
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
    // ============================================================
    // ENHANCED ALIGNMENT: Allow 1h=neutral with strong 4h trend
    // ============================================================
    // Standard alignment: 4h directional and 1h does NOT oppose (neutral is OK)
    const standardAlignment = dominantTrend !== "neutral" && !opposing1h;
    console.log(
      `${symbol} ALIGNMENT: 4h=${dominantTrend} 1h=${trend1h.trend} 30m=${trend30m.trend} 15m=${trend15m.trend} | opposing: 1h=${opposing1h} 30m=${opposing30m} 15m=${opposing15m} | standardAlignment=${standardAlignment}`,
    );
    // Enhanced alignment: Allow 1h=neutral when 4h is strong and conditions are met
    let neutralAllowedWithStrongHigherTimeframe = false;
    if (!standardAlignment && dominantTrend !== "neutral" && trend1h.trend === "neutral") {
      // Check if 4h trend is strong enough (≥60% confidence)
      const strong4h = dominantConfidence >= 60;
      // Check if 1h MACD histogram aligns with 4h direction
      const macd1h = trend1h.indicators.macdHistogram;
      const macdAligned = dominantTrend === "bullish" ? macd1h >= 0 : macd1h <= 0;
      // Check if 1h has sufficient activity (not dead/ranging)
      const adx1h = calculateADX(klines1h, 14);
      const hasActivity = adx1h >= 20; // Standardized ADX threshold
      // Check relative ATR on 1h (not extremely compressed)
      const atr1hPeriod = 14;
      const atr1hLookback = 30;
      const atr1hKlines = klines1h.slice(-atr1hPeriod - 1);
      let atr1hSum = 0;
      for (let i = 1; i < atr1hKlines.length; i++) {
        const high = parseFloat(atr1hKlines[i][2]);
        const low = parseFloat(atr1hKlines[i][3]);
        const prevClose = parseFloat(atr1hKlines[i - 1][4]);
        const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
        atr1hSum += tr;
      }
      const currentATR1h = atr1hKlines.length > 1 ? atr1hSum / (atr1hKlines.length - 1) : 0;
      // Optimized: Calculate historical ATR using sliding window (O(n) instead of O(n²))
      const historical1hKlines = klines1h.slice(-atr1hLookback - atr1hPeriod);
      let historical1hATRSum = 0;
      let historical1hATRCount = 0;
      
      if (historical1hKlines.length >= atr1hPeriod + 1) {
        // Initialize first window
        let windowTRSum = 0;
        for (let i = 1; i <= atr1hPeriod; i++) {
          const high = parseFloat(historical1hKlines[i][2]);
          const low = parseFloat(historical1hKlines[i][3]);
          const prevClose = parseFloat(historical1hKlines[i - 1][4]);
          const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
          windowTRSum += tr;
        }
        historical1hATRSum += windowTRSum / atr1hPeriod;
        historical1hATRCount++;
        
        // Slide window through remaining data
        for (let j = atr1hPeriod + 1; j < historical1hKlines.length; j++) {
          // Remove oldest TR from window
          const oldHigh = parseFloat(historical1hKlines[j - atr1hPeriod][2]);
          const oldLow = parseFloat(historical1hKlines[j - atr1hPeriod][3]);
          const oldPrevClose = parseFloat(historical1hKlines[j - atr1hPeriod - 1][4]);
          const oldTR = Math.max(oldHigh - oldLow, Math.abs(oldHigh - oldPrevClose), Math.abs(oldLow - oldPrevClose));
          
          // Add new TR to window
          const newHigh = parseFloat(historical1hKlines[j][2]);
          const newLow = parseFloat(historical1hKlines[j][3]);
          const newPrevClose = parseFloat(historical1hKlines[j - 1][4]);
          const newTR = Math.max(newHigh - newLow, Math.abs(newHigh - newPrevClose), Math.abs(newLow - newPrevClose));
          
          windowTRSum = windowTRSum - oldTR + newTR;
          historical1hATRSum += windowTRSum / atr1hPeriod;
          historical1hATRCount++;
        }
      }
      const historical1hATRAvg = historical1hATRCount > 0 ? historical1hATRSum / historical1hATRCount : currentATR1h;
      const relative1hATR = historical1hATRAvg !== 0 ? currentATR1h / historical1hATRAvg : 0;
      const atrNotExtremelyCompressed = relative1hATR >= 0.5; // Less strict than ranging detection (0.6)
      // Allow if all conditions are met
      if (strong4h && macdAligned && (hasActivity || atrNotExtremelyCompressed)) {
        neutralAllowedWithStrongHigherTimeframe = true;
        console.log(
          `${symbol}: 1h=neutral ALLOWED with strong 4h=${dominantTrend}(${dominantConfidence}%) - MACD=${macd1h.toFixed(3)} ADX=${adx1h.toFixed(1)} relATR=${relative1hATR.toFixed(2)}`,
        );
      } else {
        console.log(
          `${symbol}: 1h=neutral BLOCKED - strong4h=${strong4h} macdAligned=${macdAligned} hasActivity=${hasActivity} atrOK=${atrNotExtremelyCompressed}`,
        );
      }
    }
    // High timeframe alignment: standard OR enhanced neutral allowance
    const highTimeframeAligned = standardAlignment || neutralAllowedWithStrongHigherTimeframe;
    // ============================================================
    // DIVERGENCE CLASSIFICATION FOR OPPORTUNITY CAPTURE
    // ============================================================
    let divergenceType: "aligned" | "pullback" | "early_reversal" | "ranging_conflict" = "aligned";
    let divergenceConfidence = 100; // Base confidence, will be adjusted
    let allowDivergenceSignal = false;
    if (!highTimeframeAligned) {
      // Case 1: PULLBACK - 4h strong, 1h temporarily opposes (trade WITH 4h direction)
      if (dominantTrend !== "neutral" && dominantConfidence >= 60 && trend1h.confidence >= 50) {
        // Strong 4h trend, moderate 1h counter-move = pullback opportunity
        divergenceType = "pullback";
        divergenceConfidence = Math.min(dominantConfidence * 0.75, 70); // Max 70% confidence
        allowDivergenceSignal = true;
        console.log(
          `${dominantTrend.toUpperCase()} PULLBACK detected: 4h=${dominantConfidence}% vs 1h=${trend1h.trend}`,
        );
      }
      // Case 2: EARLY REVERSAL - 1h strongly reversing, 4h weak/neutral
      else if (trend1h.confidence >= 70 && (dominantTrend === "neutral" || dominantConfidence < 60)) {
        // Strong 1h reversal, weak 4h = early trend change (trade WITH 1h direction)
        divergenceType = "early_reversal";
        divergenceConfidence = Math.min(trend1h.confidence * 0.7, 65); // Max 65% confidence
        allowDivergenceSignal = true;
        console.log(
          `EARLY REVERSAL detected: 1h=${trend1h.trend}(${trend1h.confidence}%) vs weak/neutral 4h=${dominantTrend}(${dominantConfidence}%)`,
        );
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
    const currentATR = atrKlines.length > 1 ? atrSum / (atrKlines.length - 1) : 0;
    const atrPercent = currentPrice !== 0 ? (currentATR / currentPrice) * 100 : 0;
    // Optimized: Calculate historical ATR using sliding window (O(n) instead of O(n²))
    const historicalKlines = klines1h.slice(-atrLookback - atrPeriod);
    let historicalATRSum = 0;
    let historicalATRCount = 0;
    
    if (historicalKlines.length >= atrPeriod + 1) {
      // Initialize first window
      let windowTRSum = 0;
      for (let i = 1; i <= atrPeriod; i++) {
        const high = parseFloat(historicalKlines[i][2]);
        const low = parseFloat(historicalKlines[i][3]);
        const prevClose = parseFloat(historicalKlines[i - 1][4]);
        const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
        windowTRSum += tr;
      }
      historicalATRSum += windowTRSum / atrPeriod;
      historicalATRCount++;
      
      // Slide window through remaining data
      for (let j = atrPeriod + 1; j < historicalKlines.length; j++) {
        // Remove oldest TR from window
        const oldHigh = parseFloat(historicalKlines[j - atrPeriod][2]);
        const oldLow = parseFloat(historicalKlines[j - atrPeriod][3]);
        const oldPrevClose = parseFloat(historicalKlines[j - atrPeriod - 1][4]);
        const oldTR = Math.max(oldHigh - oldLow, Math.abs(oldHigh - oldPrevClose), Math.abs(oldLow - oldPrevClose));
        
        // Add new TR to window
        const newHigh = parseFloat(historicalKlines[j][2]);
        const newLow = parseFloat(historicalKlines[j][3]);
        const newPrevClose = parseFloat(historicalKlines[j - 1][4]);
        const newTR = Math.max(newHigh - newLow, Math.abs(newHigh - newPrevClose), Math.abs(newLow - newPrevClose));
        
        windowTRSum = windowTRSum - oldTR + newTR;
        historicalATRSum += windowTRSum / atrPeriod;
        historicalATRCount++;
      }
    }
    const historicalATRAvg = historicalATRCount > 0 ? historicalATRSum / historicalATRCount : currentATR;
    const relativeATR = historicalATRAvg !== 0 ? currentATR / historicalATRAvg : 0;
    // Calculate ADX for trend strength
    const adx = calculateADX(klines1h, 14);

    // Calculate volume analysis for all timeframes
    const volume15m = calculateVolumeAnalysis(klines15m);
    const volume30m = calculateVolumeAnalysis(klines30m);
    const volume1h = calculateVolumeAnalysis(klines1h);
    const volume4h = calculateVolumeAnalysis(klines4h);
    // COMBINED RANGING DETECTION:
    // Market is ranging if BOTH conditions are true:
    // 1. Relative ATR < 0.6 (current volatility 40% below historical average)
    // 2. ADX < 20 (weak trend strength) - standardized threshold
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
    // ============================================================
    // PULLBACK DETECTION
    // ============================================================
    let inPullback = false;
    let pullbackPercent = 0;
    if (dominantTrend === "bullish" || dominantTrend === "bearish") {
      // Find recent swing high/low over last 24 candles (24 hours on 1h chart)
      const recentKlines = klines1h.slice(-24);
      const recentHighs = recentKlines.map((k: any) => parseFloat(k[2])).filter(Number.isFinite);
      const recentLows = recentKlines.map((k: any) => parseFloat(k[3])).filter(Number.isFinite);
      if (dominantTrend === "bullish") {
        // For bullish trend, check if we're pulling back from recent high
        const swingHigh = recentHighs.length > 0 ? Math.max(...recentHighs) : 0;
        const swingLow = recentLows.slice(-12).length > 0 ? Math.min(...recentLows.slice(-12)) : 0; // Low from last 12 hours
        const range = swingHigh - swingLow;
        const pullback = swingHigh - currentPrice;
        pullbackPercent = range !== 0 ? (pullback / range) * 100 : 0;
        // Ideal entry: 10-55% retracement (more natural range)
        inPullback = pullbackPercent >= 10 && pullbackPercent <= 65;
      } else if (dominantTrend === "bearish") {
        // For bearish trend, check if we're pulling back from recent low
        const swingLow = recentLows.length > 0 ? Math.min(...recentLows) : 0;
        const swingHigh = recentHighs.slice(-12).length > 0 ? Math.max(...recentHighs.slice(-12)) : 0; // High from last 12 hours
        const range = swingHigh - swingLow;
        const pullback = currentPrice - swingLow;
        pullbackPercent = range !== 0 ? (pullback / range) * 100 : 0;
        // Ideal entry: 10-55% retracement (more natural range)
        inPullback = pullbackPercent >= 10 && pullbackPercent <= 65;
      }
    }
    // ============================================================
    // SIMPLIFIED MOMENTUM CONFIRMATION WITH VOLUME
    // ============================================================
    // Check last 3 candles from 15m for price movement direction
    const recentKlines15m = klines15m.slice(-3);

    // Get last and previous close prices
    const lastClose = prices15m[prices15m.length - 1];
    const prevClose = prices15m[prices15m.length - 2];

    // Get MACD histogram from 1h timeframe (primary momentum timeframe)
    // Using 1h instead of 15m provides more stable momentum signals
    const macdHistogram = trend1h.indicators.macdHistogram;
    const macdValues: number[] = [];

    // Calculate MACD for recent candles to check for divergence
    for (let i = Math.max(0, prices15m.length - 3); i < prices15m.length; i++) {
      const closes = prices15m.slice(0, i + 1);
      if (closes.length >= 26) {
        const ema12 = calculateEMA(closes, 12);
        const ema26 = calculateEMA(closes, 26);
        macdValues.push(ema12 - ema26);
      }
    }

    // Determine effective trend for momentum direction
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

    // Volume confirmation: check if volume supports the momentum
    // Bullish trends need increasing volume, bearish trends need volume (either direction works in downtrends)
    const volumeConfirmsDirection = 
      (effectiveTrendForMomentum === "bullish" && volume1h.volumeTrend === "increasing") ||
      (effectiveTrendForMomentum === "bearish" && (volume1h.volumeTrend === "increasing" || volume1h.volumeTrend === "decreasing")) ||
      volume1h.volumeSpike; // Volume spike is always confirmatory
    
    const volumeBoost = volumeConfirmsDirection ? 1.15 : 1.0; // 15% confidence boost with volume confirmation

    // Check if last close aligns with trend direction
    const lastCloseAlignsWithTrend =
      (effectiveTrendForMomentum === "bullish" && lastClose > prevClose) ||
      (effectiveTrendForMomentum === "bearish" && lastClose < prevClose) ||
      effectiveTrendForMomentum === "neutral";

    // Check for divergence (price vs MACD)
    let hasDivergence = false;
    if (macdValues.length >= 2) {
      const priceMovement = lastClose - prevClose;
      const macdMovement = macdValues[macdValues.length - 1] - macdValues[macdValues.length - 2];

      // Bearish divergence: price up but MACD down
      // Bullish divergence: price down but MACD up
      hasDivergence = (priceMovement > 0 && macdMovement < 0) || (priceMovement < 0 && macdMovement > 0);
    }

    // MACD histogram must be expanding AND aligned with trend direction
    // For bullish: histogram > 0 AND expanding
    // For bearish: histogram < 0 AND expanding (more negative)
    const macdDirectionAligned =
      (effectiveTrendForMomentum === "bullish" && macdHistogram > 0) ||
      (effectiveTrendForMomentum === "bearish" && macdHistogram < 0) ||
      effectiveTrendForMomentum === "neutral";

    // Increased threshold from 0.01 to 0.05 to reduce noise sensitivity
    const macdExpanding = Math.abs(macdHistogram) > 0.05 && macdDirectionAligned;
    const macdStrong = Math.abs(macdHistogram) > 0.5 && macdDirectionAligned;

    // NEW SIMPLIFIED MOMENTUM GATE (volume is optional boost, not required):
    // 1. MACD histogram expanding in correct direction
    // 2. Last close aligns with trend direction
    // 3. No divergence detected
    // 4. ADX >= 20 for sufficient trend strength (calculated earlier for ranging detection)
    // Volume confirmation is NOT required but provides 10% position size boost when present
    const momentumConfirms = macdExpanding && lastCloseAlignsWithTrend && !hasDivergence && adx >= 20;
    // Momentum state classification
    let momentumState: "none" | "mixed" | "confirmed" = "none";
    if (momentumConfirms) {
      momentumState = "confirmed";
    } else if (macdStrong) {
      momentumState = "mixed";
    }
    console.log(
      `${symbol} MOMENTUM: lastClose=${lastClose.toFixed(2)} prevClose=${prevClose.toFixed(2)} alignsWithTrend=${lastCloseAlignsWithTrend} divergence=${hasDivergence} macd=${macdHistogram.toFixed(3)} expanding=${macdExpanding} adx=${adx.toFixed(1)} volumeConfirms=${volumeConfirmsDirection} confirms=${momentumConfirms} state=${momentumState}`,
    );
    // Validate market structure on 1h timeframe
    const marketStructure = validateMarketStructure(klines1h, trend1h.trend);
    console.log(
      `${symbol}: 4h=${trend4h.trend} 1h=${trend1h.trend} 30m=${trend30m.trend} aligned=${highTimeframeAligned} pullback=${inPullback}(${pullbackPercent.toFixed(1)}%) momentum=${momentumConfirms} ranging=${isRanging}`,
    );
    return new Response(
      JSON.stringify({
        symbol,
        currentPrice,
        trend: dominantTrend,
        confidence: dominantConfidence,
        // Higher timeframe dominance
        higherTimeframeFilter: {
          trend4h: trend4h.trend,
          trend1h: trend1h.trend,
          aligned: highTimeframeAligned,
          neutralAllowedWithStrongHigherTimeframe: neutralAllowedWithStrongHigherTimeframe,
          dominantConfidence: dominantConfidence,
          weightedConsistency: Math.round(weightedConsistency),
          // NEW: Divergence opportunity detection
          divergenceType: divergenceType,
          divergenceConfidence: Math.round(divergenceConfidence),
          allowDivergenceSignal: allowDivergenceSignal,
          // Guidance for signal generators - refactored for readability
          recommendedPositionSize: calculateRecommendedPositionSize(divergenceType),
          tradeDirection: calculateTradeDirection(divergenceType, dominantTrend, trend1h.trend, primaryTrend),
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
        // Multi-timeframe details (legacy format for compatibility)
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
        // Structured timeframes for divergence validation
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
        // Volume analysis across timeframes
        volume: {
          "15m": volume15m,
          "30m": volume30m,
          "1h": volume1h,
          "4h": volume4h,
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
