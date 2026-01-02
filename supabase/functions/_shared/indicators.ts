// ============= SHARED INDICATOR CALCULATIONS =============
// Single source of truth for all technical indicators
// Used by: calculate-trend, backtest-strategy

import { ADX_THRESHOLDS, STOCHRSI_THRESHOLDS, RSI_THRESHOLDS } from "./constants.ts";

// ============= EMA =============
export function calculateEMA(prices: number[], period: number): number {
  if (prices.length === 0) return 0;
  if (prices.length < period) return prices[prices.length - 1] || 0;

  const k = 2 / (period + 1);
  let ema = 0;
  for (let i = 0; i < period; i++) ema += prices[i];
  ema /= period;

  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

export function calculateEMAArray(prices: number[], period: number): number[] {
  const emaArray: number[] = [];
  if (prices.length < period) return emaArray;

  const k = 2 / (period + 1);
  let ema = 0;
  for (let i = 0; i < period; i++) ema += prices[i];
  ema /= period;

  for (let i = 0; i < period - 1; i++) emaArray.push(NaN);
  emaArray.push(ema);

  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
    emaArray.push(ema);
  }
  return emaArray;
}

// ============= RSI =============
export function calculateRSI(prices: number[], period = 14): number {
  if (prices.length < period + 1) return 50;

  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = period + 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    avgGain = (avgGain * (period - 1) + (change > 0 ? change : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (change < 0 ? Math.abs(change) : 0)) / period;
  }

  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

export function calculateRSIArray(prices: number[], period = 14): number[] {
  const rsiArray: number[] = [];
  if (prices.length < period + 1) return rsiArray;

  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;

  rsiArray.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));

  for (let i = period + 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    avgGain = (avgGain * (period - 1) + (change > 0 ? change : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (change < 0 ? Math.abs(change) : 0)) / period;
    rsiArray.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }
  return rsiArray;
}

// ============= STOCHASTIC RSI =============
// PHASE 3: Enhanced StochRSI result with direction tracking
export interface StochRSIResult {
  k: number;
  d: number;
  signal: string;
  strength: number;
  kArray?: number[];
  // PHASE 3: Direction tracking for easier consumption downstream
  prevK: number;
  prevD: number;
  kRising: boolean;
  kCrossedAboveD: boolean;
  kCrossedBelowD: boolean;
}

export function calculateStochasticRSI(
  prices: number[], 
  rsiPeriod = 14, 
  stochPeriod = 14, 
  kSmooth = 3, 
  dSmooth = 3,
  preCalculatedRsiArray?: number[]
): StochRSIResult {
  if (prices.length < rsiPeriod + stochPeriod + Math.max(kSmooth, dSmooth)) {
    return { k: 50, d: 50, signal: "neutral", strength: 0, prevK: 50, prevD: 50, kRising: false, kCrossedAboveD: false, kCrossedBelowD: false };
  }

  const rsiValues = preCalculatedRsiArray ?? calculateRSIArray(prices, rsiPeriod);
  if (rsiValues.length < stochPeriod) return { k: 50, d: 50, signal: "neutral", strength: 0, prevK: 50, prevD: 50, kRising: false, kCrossedAboveD: false, kCrossedBelowD: false };

  // Calculate raw Stochastic K using sliding window
  const rawKValues: number[] = [];
  const maxDeque: number[] = [], minDeque: number[] = [];
  
  for (let i = 0; i < rsiValues.length; i++) {
    const currentRsi = rsiValues[i];
    while (maxDeque.length > 0 && maxDeque[0] <= i - stochPeriod) maxDeque.shift();
    while (minDeque.length > 0 && minDeque[0] <= i - stochPeriod) minDeque.shift();
    while (maxDeque.length > 0 && rsiValues[maxDeque[maxDeque.length - 1]] <= currentRsi) maxDeque.pop();
    while (minDeque.length > 0 && rsiValues[minDeque[minDeque.length - 1]] >= currentRsi) minDeque.pop();
    maxDeque.push(i);
    minDeque.push(i);
    
    if (i >= stochPeriod - 1) {
      const maxRsi = rsiValues[maxDeque[0]], minRsi = rsiValues[minDeque[0]];
      rawKValues.push(maxRsi !== minRsi ? ((currentRsi - minRsi) / (maxRsi - minRsi)) * 100 : 50);
    }
  }

  if (rawKValues.length < kSmooth) return { k: 50, d: 50, signal: "neutral", strength: 0, prevK: 50, prevD: 50, kRising: false, kCrossedAboveD: false, kCrossedBelowD: false };

  // Smooth K
  const smoothedKValues: number[] = [];
  let kRollingSum = 0;
  for (let i = 0; i < rawKValues.length; i++) {
    kRollingSum += rawKValues[i];
    if (i >= kSmooth) kRollingSum -= rawKValues[i - kSmooth];
    if (i >= kSmooth - 1) smoothedKValues.push(kRollingSum / kSmooth);
  }

  if (smoothedKValues.length < dSmooth) return { k: 50, d: 50, signal: "neutral", strength: 0, prevK: 50, prevD: 50, kRising: false, kCrossedAboveD: false, kCrossedBelowD: false };

  // Calculate D
  const dValues: number[] = [];
  let dRollingSum = 0;
  for (let i = 0; i < smoothedKValues.length; i++) {
    dRollingSum += smoothedKValues[i];
    if (i >= dSmooth) dRollingSum -= smoothedKValues[i - dSmooth];
    if (i >= dSmooth - 1) dValues.push(dRollingSum / dSmooth);
  }

  const k = smoothedKValues[smoothedKValues.length - 1];
  const d = dValues[dValues.length - 1];
  const prevK = smoothedKValues.length > 1 ? smoothedKValues[smoothedKValues.length - 2] : k;
  const prevD = dValues.length > 1 ? dValues[dValues.length - 2] : d;

  let signal = "neutral", strength = 0;
  if (k > STOCHRSI_THRESHOLDS.OVERBOUGHT && d > STOCHRSI_THRESHOLDS.OVERBOUGHT) {
    signal = "overbought";
    strength = Math.min((k - STOCHRSI_THRESHOLDS.OVERBOUGHT) / (100 - STOCHRSI_THRESHOLDS.OVERBOUGHT), 1) * 100;
  } else if (k < STOCHRSI_THRESHOLDS.OVERSOLD && d < STOCHRSI_THRESHOLDS.OVERSOLD) {
    signal = "oversold";
    strength = Math.min((STOCHRSI_THRESHOLDS.OVERSOLD - k) / STOCHRSI_THRESHOLDS.OVERSOLD, 1) * 100;
  } else if (k > d && prevK <= prevD && k < 50) {
    signal = "bullish_cross";
    strength = Math.min((k - d) / 10, 1) * 80;
  } else if (k < d && prevK >= prevD && k > 50) {
    signal = "bearish_cross";
    strength = Math.min((d - k) / 10, 1) * 80;
  }

  // PHASE 3: Direction tracking for easier downstream consumption
  const kRising = k > prevK;
  const kCrossedAboveD = k > d && prevK <= prevD;
  const kCrossedBelowD = k < d && prevK >= prevD;

  return { 
    k: Math.round(k * 10) / 10, 
    d: Math.round(d * 10) / 10, 
    signal, 
    strength: Math.round(strength),
    kArray: smoothedKValues,  // PHASE 3: Return K array for time-in-extreme tracking
    // PHASE 3: Direction tracking
    prevK: Math.round(prevK * 10) / 10,
    prevD: Math.round(prevD * 10) / 10,
    kRising,
    kCrossedAboveD,
    kCrossedBelowD,
  };
}

// PHASE 3: Calculate bars at extreme for StochRSI
export function calculateBarsAtExtreme(
  kArray: number[] | undefined,
  overboughtThreshold: number = 90,
  oversoldThreshold: number = 10
): { barsOverbought: number; barsOversold: number } {
  if (!kArray || kArray.length === 0) {
    return { barsOverbought: 0, barsOversold: 0 };
  }

  // Count consecutive bars at extreme from the most recent bar going backwards
  let barsOverbought = 0;
  let barsOversold = 0;

  // Check for overbought extreme (K > 90)
  for (let i = kArray.length - 1; i >= 0; i--) {
    if (kArray[i] > overboughtThreshold) {
      barsOverbought++;
    } else {
      break; // Stop counting when we hit a non-extreme bar
    }
  }

  // Check for oversold extreme (K < 10)
  for (let i = kArray.length - 1; i >= 0; i--) {
    if (kArray[i] < oversoldThreshold) {
      barsOversold++;
    } else {
      break; // Stop counting when we hit a non-extreme bar
    }
  }

  return { barsOverbought, barsOversold };
}

// ============= MACD =============
export function calculateMACD(prices: number[]): { 
  macd: number; signal: number; histogram: number; histogramArray: number[] 
} {
  if (prices.length < 35) return { macd: 0, signal: 0, histogram: 0, histogramArray: [] };

  const ema12Array = calculateEMAArray(prices, 12);
  const ema26Array = calculateEMAArray(prices, 26);

  const macdLine: number[] = [];
  for (let i = 25; i < prices.length; i++) {
    const e12 = ema12Array[i], e26 = ema26Array[i];
    if (!Number.isNaN(e12) && !Number.isNaN(e26)) macdLine.push(e12 - e26);
  }
  if (macdLine.length === 0) return { macd: 0, signal: 0, histogram: 0, histogramArray: [] };

  const histogramArray: number[] = [];
  let signalEma = macdLine[0];
  const signalMultiplier = 2 / 10;
  
  for (let i = 0; i < macdLine.length; i++) {
    if (i < 8) {
      histogramArray.push(0);
    } else if (i === 8) {
      signalEma = macdLine.slice(0, 9).reduce((a, b) => a + b, 0) / 9;
      histogramArray.push(macdLine[i] - signalEma);
    } else {
      signalEma = (macdLine[i] - signalEma) * signalMultiplier + signalEma;
      histogramArray.push(macdLine[i] - signalEma);
    }
  }

  return { 
    macd: macdLine[macdLine.length - 1], 
    signal: signalEma, 
    histogram: histogramArray[histogramArray.length - 1] || 0,
    histogramArray 
  };
}

// ============= ATR =============
function calculateTrueRange(high: number, low: number, prevClose: number): number {
  return Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
}

export function calculateATR(klines: any[], period = 14): number {
  const atrKlines = klines.slice(-period - 1);
  if (atrKlines.length < 2) return 0;
  
  let trSum = 0;
  for (let i = 1; i < atrKlines.length; i++) {
    const high = parseFloat(atrKlines[i][2]);
    const low = parseFloat(atrKlines[i][3]);
    const prevClose = parseFloat(atrKlines[i - 1][4]);
    trSum += calculateTrueRange(high, low, prevClose);
  }
  return trSum / (atrKlines.length - 1);
}

export function calculateHistoricalATRAvg(klines: any[], atrPeriod: number, atrLookback: number, currentATR: number): number {
  const historicalKlines = klines.slice(-atrLookback - atrPeriod);
  if (historicalKlines.length < atrPeriod + 1) return currentATR;
  
  let historicalATRSum = 0, historicalATRCount = 0, windowTRSum = 0;
  
  for (let i = 1; i <= atrPeriod; i++) {
    const high = parseFloat(historicalKlines[i][2]);
    const low = parseFloat(historicalKlines[i][3]);
    const prevClose = parseFloat(historicalKlines[i - 1][4]);
    windowTRSum += calculateTrueRange(high, low, prevClose);
  }
  historicalATRSum += windowTRSum / atrPeriod;
  historicalATRCount++;
  
  for (let j = atrPeriod + 1; j < historicalKlines.length; j++) {
    const oldHigh = parseFloat(historicalKlines[j - atrPeriod][2]);
    const oldLow = parseFloat(historicalKlines[j - atrPeriod][3]);
    const oldPrevClose = parseFloat(historicalKlines[j - atrPeriod - 1][4]);
    const newHigh = parseFloat(historicalKlines[j][2]);
    const newLow = parseFloat(historicalKlines[j][3]);
    const newPrevClose = parseFloat(historicalKlines[j - 1][4]);
    
    windowTRSum = windowTRSum - calculateTrueRange(oldHigh, oldLow, oldPrevClose) + calculateTrueRange(newHigh, newLow, newPrevClose);
    historicalATRSum += windowTRSum / atrPeriod;
    historicalATRCount++;
  }
  
  return historicalATRCount > 0 ? historicalATRSum / historicalATRCount : currentATR;
}

// ============= ADX =============
// ENHANCED: Now returns +DI, -DI, slope, and peak detection for behavioral exhaustion analysis
export interface ADXResult {
  adx: number;
  prevAdx: number;
  adxRising: boolean;
  // NEW: Full DI data for exhaustion detection
  plusDI: number;
  minusDI: number;
  diGap: number;           // Current +DI - -DI (absolute)
  prevDiGap: number;       // Previous bar's DI gap
  // NEW: ADX historical data for slope calculation
  adxArray: number[];      // Last 7 ADX values for trend analysis
  adxSlope: number;        // Rate of change over last 5 bars
  adxPeaked: boolean;      // ADX < max of last 5 bars (rollover detection)
}

export function calculateADXWithDirection(klines: any[], period = 14): ADXResult {
  const defaultResult: ADXResult = { 
    adx: 0, 
    prevAdx: 0, 
    adxRising: false,
    plusDI: 0,
    minusDI: 0,
    diGap: 0,
    prevDiGap: 0,
    adxArray: [],
    adxSlope: 0,
    adxPeaked: false
  };
  const minRequired = 2 * period + 2;
  if (!klines || klines.length < minRequired) return defaultResult;

  const trueRanges: number[] = [], plusDMs: number[] = [], minusDMs: number[] = [];

  for (let i = 1; i < klines.length; i++) {
    const high = parseFloat(klines[i][2]);
    const low = parseFloat(klines[i][3]);
    const prevHigh = parseFloat(klines[i - 1][2]);
    const prevLow = parseFloat(klines[i - 1][3]);
    const prevClose = parseFloat(klines[i - 1][4]);

    if (!Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(prevClose) ||
        !Number.isFinite(prevHigh) || !Number.isFinite(prevLow) || high <= 0 || low <= 0) continue;

    trueRanges.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
    const upMove = high - prevHigh, downMove = prevLow - low;
    plusDMs.push((upMove > downMove && upMove > 0) ? upMove : 0);
    minusDMs.push((downMove > upMove && downMove > 0) ? downMove : 0);
  }

  if (trueRanges.length < 2 * period) return defaultResult;

  let smoothedTR = 0, smoothedPlusDM = 0, smoothedMinusDM = 0;
  for (let i = 0; i < period; i++) {
    smoothedTR += trueRanges[i];
    smoothedPlusDM += plusDMs[i];
    smoothedMinusDM += minusDMs[i];
  }

  const dxValues: number[] = [];
  // NEW: Track DI values for DI gap compression detection
  const plusDIValues: number[] = [];
  const minusDIValues: number[] = [];
  
  if (smoothedTR > 0) {
    const plusDI = (smoothedPlusDM / smoothedTR) * 100;
    const minusDI = (smoothedMinusDM / smoothedTR) * 100;
    plusDIValues.push(plusDI);
    minusDIValues.push(minusDI);
    const diSum = plusDI + minusDI;
    dxValues.push(diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0);
  } else {
    dxValues.push(0);
    plusDIValues.push(0);
    minusDIValues.push(0);
  }

  for (let i = period; i < trueRanges.length; i++) {
    smoothedTR = smoothedTR - (smoothedTR / period) + trueRanges[i];
    smoothedPlusDM = smoothedPlusDM - (smoothedPlusDM / period) + plusDMs[i];
    smoothedMinusDM = smoothedMinusDM - (smoothedMinusDM / period) + minusDMs[i];

    if (smoothedTR > 0) {
      const plusDI = (smoothedPlusDM / smoothedTR) * 100;
      const minusDI = (smoothedMinusDM / smoothedTR) * 100;
      plusDIValues.push(plusDI);
      minusDIValues.push(minusDI);
      const diSum = plusDI + minusDI;
      dxValues.push(diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0);
    } else {
      dxValues.push(0);
      plusDIValues.push(0);
      minusDIValues.push(0);
    }
  }

  if (dxValues.length < period + 1) return defaultResult;

  let adx = 0;
  for (let i = 0; i < period; i++) adx += dxValues[i];
  adx /= period;
  const adxValues: number[] = [adx];

  for (let i = period; i < dxValues.length; i++) {
    adx = ((adx * (period - 1)) + dxValues[i]) / period;
    adxValues.push(adx);
  }

  const currentAdx = Math.max(0, Math.min(100, Math.round(adx * 10) / 10));
  const prevAdx = adxValues.length >= 2 
    ? Math.max(0, Math.min(100, Math.round(adxValues[adxValues.length - 2] * 10) / 10))
    : currentAdx;
  
  // NEW: Get current and previous DI values
  const currentPlusDI = plusDIValues.length > 0 ? plusDIValues[plusDIValues.length - 1] : 0;
  const currentMinusDI = minusDIValues.length > 0 ? minusDIValues[minusDIValues.length - 1] : 0;
  const prevPlusDI = plusDIValues.length > 1 ? plusDIValues[plusDIValues.length - 2] : currentPlusDI;
  const prevMinusDI = minusDIValues.length > 1 ? minusDIValues[minusDIValues.length - 2] : currentMinusDI;
  
  const currentDiGap = Math.abs(currentPlusDI - currentMinusDI);
  const prevDiGap = Math.abs(prevPlusDI - prevMinusDI);
  
  // NEW: Get last 7 ADX values for slope and peak detection
  const recentAdxValues = adxValues.slice(-7);
  
  // NEW: Calculate ADX slope over last 5 bars
  // Slope = (ADX[current] - ADX[n bars ago]) / n
  const slopeLookback = Math.min(5, adxValues.length - 1);
  const adxSlope = slopeLookback > 0 
    ? (adxValues[adxValues.length - 1] - adxValues[adxValues.length - 1 - slopeLookback]) / slopeLookback
    : 0;
  
  // NEW: Detect ADX peak (rollover) - current < max of last 5 bars
  const peakLookback = Math.min(5, adxValues.length);
  const adxMax = Math.max(...adxValues.slice(-peakLookback));
  const adxPeaked = adxValues[adxValues.length - 1] < adxMax * 0.99; // 1% tolerance
  
  return { 
    adx: currentAdx, 
    prevAdx, 
    adxRising: currentAdx > prevAdx,
    plusDI: Math.round(currentPlusDI * 10) / 10,
    minusDI: Math.round(currentMinusDI * 10) / 10,
    diGap: Math.round(currentDiGap * 10) / 10,
    prevDiGap: Math.round(prevDiGap * 10) / 10,
    adxArray: recentAdxValues.map(v => Math.round(v * 10) / 10),
    adxSlope: Math.round(adxSlope * 100) / 100,
    adxPeaked
  };
}

export function calculateADX(klines: any[], period = 14): number {
  return calculateADXWithDirection(klines, period).adx;
}

// ============= VOLUME ANALYSIS =============
export function calculateVolumeAnalysis(klines: any[]): {
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

  const recentAvg = volumes.slice(-3).reduce((sum, v) => sum + v, 0) / 3;
  const previousAvg = volumes.slice(-6, -3).reduce((sum, v) => sum + v, 0) / 3;

  let volumeTrend: "increasing" | "decreasing" | "neutral" = "neutral";
  if (recentAvg > previousAvg * 1.2) volumeTrend = "increasing";
  else if (recentAvg < previousAvg * 0.8) volumeTrend = "decreasing";

  return { volumeSpike, volumeRatio: Math.round(volumeRatio * 100) / 100, volumeTrend, currentVolume: Math.round(currentVolume), avgVolume: Math.round(avgVolume) };
}
