// ============= SHARED TREND ANALYSIS CORE =============
// Single source of truth for trend calculations
// Used by: calculate-trend (HTTP), backtest-strategy (inline)

import { ADX_THRESHOLDS, RSI_THRESHOLDS, STOCHRSI_THRESHOLDS, NET_SIGNAL_THRESHOLDS } from "./constants.ts";
import { 
  calculateEMA, calculateRSI, calculateRSIArray, calculateMACD, 
  calculateStochasticRSI, calculateATR, calculateHistoricalATRAvg,
  calculateADXWithDirection, calculateVolumeAnalysis, ADXResult 
} from "./indicators.ts";

// Extended trend type with weak intermediate states for early impulse detection
export type ExtendedTrend = "bullish" | "bearish" | "neutral" | "weak_bullish" | "weak_bearish";

export interface TrendResult {
  trend: "bullish" | "bearish" | "neutral";
  extendedTrend: ExtendedTrend;  // NEW: Includes weak_bullish/weak_bearish for partial signals
  netSignal: number;             // NEW: Raw netSignal value for diagnostics
  confidence: number;
  indicators: {
    ema12: number;
    ema26: number;
    emaSignal: string;
    rsi: number;
    rsiSignal: string;
    rsiArray: number[];
    macd: number;
    macdSignal: number;
    macdHistogram: number;
    macdTrend: string;
    macdHistogramArray: number[];
  };
}

export function calculateTrend(prices: number[]): TrendResult {
  if (prices.length < 30) {
    return {
      trend: "neutral",
      extendedTrend: "neutral",
      netSignal: 0,
      confidence: 35,
      indicators: {
        ema12: 0, ema26: 0, emaSignal: "neutral",
        rsi: 50, rsiSignal: "neutral", rsiArray: [],
        macd: 0, macdSignal: 0, macdHistogram: 0, macdTrend: "neutral",
        macdHistogramArray: []
      }
    };
  }

  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const rsiArray = calculateRSIArray(prices, 14);
  const rsi = rsiArray.length > 0 ? rsiArray[rsiArray.length - 1] : 50;
  const { macd, signal, histogram, histogramArray } = calculateMACD(prices);

  let bullishSignals = 0, bearishSignals = 0, totalWeight = 0;

  // EMA signal (weight 3)
  const emaWeight = 3;
  let emaSignal = "neutral";
  if (ema12 > ema26) {
    const emaDiff = ema26 !== 0 ? ((ema12 - ema26) / ema26) * 100 : 0;
    if (emaDiff > 0.1) { bullishSignals += emaWeight; emaSignal = "bullish"; }
  } else if (ema12 < ema26) {
    const emaDiff = ema26 !== 0 ? ((ema26 - ema12) / ema26) * 100 : 0;
    if (emaDiff > 0.1) { bearishSignals += emaWeight; emaSignal = "bearish"; }
  }
  totalWeight += emaWeight;

  // RSI signal (weight 2.5)
  const rsiWeight = 2.5;
  let rsiSignal = "neutral";
  if (rsi > RSI_THRESHOLDS.BEARISH_RALLY) {
    bullishSignals += rsiWeight * ((rsi - RSI_THRESHOLDS.BEARISH_RALLY) / (100 - RSI_THRESHOLDS.BEARISH_RALLY));
    if (rsi > RSI_THRESHOLDS.OVERBOUGHT) rsiSignal = "overbought";
    else if (rsi > RSI_THRESHOLDS.BULLISH_STRONG) rsiSignal = "strong_bullish";
    else rsiSignal = "bullish";
  } else if (rsi < RSI_THRESHOLDS.BULLISH_PULLBACK) {
    bearishSignals += rsiWeight * ((RSI_THRESHOLDS.BULLISH_PULLBACK - rsi) / RSI_THRESHOLDS.BULLISH_PULLBACK);
    rsiSignal = rsi < RSI_THRESHOLDS.OVERSOLD ? "oversold" : "bearish";
  }
  totalWeight += rsiWeight;

  // MACD signal (weight 3.5)
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
  let confidence = 30 + (Math.abs(netSignal) / totalWeight) * 100 * 0.65;
  confidence = Math.min(Math.max(confidence, 30), 95);

  // NEUTRAL-BIAS FIX: Lower threshold from ±4.0 to ±3.0 and add weak intermediate states
  // This captures early impulse phases that would previously be labeled "neutral"
  const STRONG = NET_SIGNAL_THRESHOLDS?.STRONG_THRESHOLD ?? 4.0;
  const WEAK = NET_SIGNAL_THRESHOLDS?.WEAK_THRESHOLD ?? 3.0;
  const ENABLE_WEAK = NET_SIGNAL_THRESHOLDS?.ENABLE_WEAK_TRENDS ?? true;
  
  let trend: "bullish" | "bearish" | "neutral" = "neutral";
  let extendedTrend: ExtendedTrend = "neutral";
  
  if (netSignal >= STRONG) {
    trend = "bullish";
    extendedTrend = "bullish";
  } else if (netSignal <= -STRONG) {
    trend = "bearish";
    extendedTrend = "bearish";
  } else if (ENABLE_WEAK && netSignal >= WEAK) {
    // NEW: Weak bullish - signals directional bias without full confirmation
    trend = "neutral";  // Backward compatible: main trend stays neutral
    extendedTrend = "weak_bullish";
  } else if (ENABLE_WEAK && netSignal <= -WEAK) {
    // NEW: Weak bearish
    trend = "neutral";
    extendedTrend = "weak_bearish";
  }

  return {
    trend,
    extendedTrend,
    netSignal: Math.round(netSignal * 100) / 100,
    confidence: Math.round(confidence),
    indicators: {
      ema12: Math.round(ema12 * 100) / 100,
      ema26: Math.round(ema26 * 100) / 100,
      emaSignal,
      rsi: Math.round(rsi * 100) / 100,
      rsiSignal,
      rsiArray,
      macd: Math.round(macd * 10000) / 10000,
      macdSignal: Math.round(signal * 10000) / 10000,
      macdHistogram: Math.round(histogram * 10000) / 10000,
      macdTrend,
      macdHistogramArray: histogramArray,
    },
  };
}

// Enhanced confidence with ADX and volume
export function enhanceConfidenceWithIndicators(
  baseConfidence: number,
  adx: number,
  volumeConfirms: boolean,
  volumeRatio: number,
  hasRangeExpansion: boolean = false
): number {
  let enhanced = baseConfidence;
  
  if (adx >= ADX_THRESHOLDS.EXTREME) enhanced += 10;
  else if (adx >= ADX_THRESHOLDS.VERY_STRONG) enhanced += 7;
  else if (adx >= ADX_THRESHOLDS.STRONG) enhanced += 5;
  else if (adx >= ADX_THRESHOLDS.MINIMUM) enhanced += 2;
  else if (adx < ADX_THRESHOLDS.SEVERE_PENALTY) enhanced -= 10;
  else if (adx < ADX_THRESHOLDS.WEAK) enhanced -= 5;
  
  if (volumeConfirms) {
    if (volumeRatio >= 2.0 && hasRangeExpansion) enhanced += 8;
    else if (volumeRatio >= 2.0) enhanced += 5;
    else if (volumeRatio >= 1.5 && hasRangeExpansion) enhanced += 5;
    else if (volumeRatio >= 1.5) enhanced += 3;
    else enhanced += 2;
  } else if (volumeRatio < 0.5) {
    enhanced -= 5;
  }
  
  return Math.min(Math.max(Math.round(enhanced), 30), 95);
}

// Full multi-timeframe analysis for a single candle
export interface MultiTimeframeTrendData {
  trend4h: { trend: string; confidence: number };
  trend1h: { trend: string; confidence: number };
  stochRsi4h: { k: number; d: number; signal: string };
  stochRsi1h: { k: number; d: number; signal: string };
  volatility: { adx: number; atrPercent: number; relativeATR: number };
  momentum: { confirms: boolean; state: string; macdHistogram: number; adxRising: boolean };
  isAligned: boolean;
  volumeConfirms: boolean;
  currentPrice: number;
}

export function analyzeMultiTimeframe(
  klines1h: any[],
  klines4h: any[]
): MultiTimeframeTrendData | null {
  if (klines1h.length < 50 || klines4h.length < 20) return null;
  
  // HYBRID CANDLE SEPARATION: Use closed candles for structural indicators
  // The last kline is the currently forming (incomplete) candle
  const closedKlines1h = klines1h.length > 1 ? klines1h.slice(0, -1) : klines1h;
  const closedKlines4h = klines4h.length > 1 ? klines4h.slice(0, -1) : klines4h;
  
  // Structural prices from CLOSED candles only
  const prices1h = closedKlines1h.map((k: any) => parseFloat(k[4])).filter(Number.isFinite);
  const prices4h = closedKlines4h.map((k: any) => parseFloat(k[4])).filter(Number.isFinite);
  
  if (prices1h.length === 0) return null;
  
  // Live price from the forming candle (tactical use)
  const liveCandle = klines1h[klines1h.length - 1];
  const currentPrice = parseFloat(liveCandle[4]);
  
  // All structural indicators use CLOSED candle data
  const trend1h = calculateTrend(prices1h);
  const trend4h = calculateTrend(prices4h);
  
  const stochRsi1h = calculateStochasticRSI(prices1h, 14, 14, 3, 3, trend1h.indicators.rsiArray);
  const stochRsi4h = calculateStochasticRSI(prices4h, 14, 14, 3, 3, trend4h.indicators.rsiArray);
  
  // ADX and ATR from CLOSED klines
  const adxResult = calculateADXWithDirection(closedKlines1h, 14);
  const adx = adxResult.adx;
  const currentATR = calculateATR(closedKlines1h, 14);
  const atrPercent = currentPrice !== 0 ? (currentATR / currentPrice) * 100 : 0;
  const historicalATRAvg = calculateHistoricalATRAvg(closedKlines1h, 14, 30, currentATR);
  const relativeATR = historicalATRAvg !== 0 ? currentATR / historicalATRAvg : 0;
  
  // Simplified alignment check
  const isAligned = trend4h.trend !== "neutral" && 
    (trend1h.trend === trend4h.trend || trend1h.trend === "neutral");
  
  // Volume analysis from CLOSED klines
  const volume1h = calculateVolumeAnalysis(closedKlines1h);
  
  // Momentum state (uses structural MACD from closed candles)
  const macdHistogram = trend1h.indicators.macdHistogram;
  const prevMacdHistogram = trend1h.indicators.macdHistogramArray.length > 1 
    ? trend1h.indicators.macdHistogramArray[trend1h.indicators.macdHistogramArray.length - 2] 
    : 0;
  const macdExpanding = Math.abs(macdHistogram) > Math.abs(prevMacdHistogram);
  // For close alignment, compare last two CLOSED candle closes
  const lastClose = prices1h[prices1h.length - 1] || 0;
  const prevClose = prices1h[prices1h.length - 2] || lastClose;
  const lastCloseAligns = trend4h.trend === "bullish" ? lastClose > prevClose : 
    trend4h.trend === "bearish" ? lastClose < prevClose : true;
  const momentumConfirms = macdExpanding && lastCloseAligns && adx >= ADX_THRESHOLDS.MINIMUM && adxResult.adxRising;
  
  return {
    trend4h: { trend: trend4h.trend, confidence: trend4h.confidence },
    trend1h: { trend: trend1h.trend, confidence: trend1h.confidence },
    stochRsi4h: { k: stochRsi4h.k, d: stochRsi4h.d, signal: stochRsi4h.signal },
    stochRsi1h: { k: stochRsi1h.k, d: stochRsi1h.d, signal: stochRsi1h.signal },
    volatility: { adx, atrPercent: Math.round(atrPercent * 100) / 100, relativeATR: Math.round(relativeATR * 100) / 100 },
    momentum: { 
      confirms: momentumConfirms, 
      state: momentumConfirms ? 'confirmed' : 'mixed',
      macdHistogram,
      adxRising: adxResult.adxRising
    },
    isAligned,
    volumeConfirms: volume1h.volumeTrend === 'increasing' || volume1h.volumeSpike,
    currentPrice,
  };
}
