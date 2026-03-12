import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.84.0";
import {
  calculateRSI, calculateEMA, calculateEMAArray, calculateRSIArray, calculateMACD,
  calculateStochasticRSI, calculateATR, calculateADXWithDirection,
  calculateVolumeAnalysis, type ADXResult
} from "../_shared/indicators.ts";
import { parseKlinePrices } from "../_shared/binance.ts";
import { createLogger, LOG_CATEGORIES } from "../_shared/logging.ts";
import {
  ADX_THRESHOLDS, TRADING_FEE_PARAMS,
  getSymbolParams, BTC_PARAMS, ALTCOIN_PARAMS,
} from "../_shared/constants.ts";
import { calculateFeeAwarePnL } from "../_shared/exit-strategies.ts";
import { calculateMomentumScore, type MomentumScoreResult } from "../_shared/smart-momentum.ts";
import { calculateQualityScore, classify4StateRegime } from "../_shared/scoring.ts";
import type { MarketFeatureSnapshot, StochRsiFeatures, BollingerFeatures, VolumeFeatures,
  TimeframeFeatures, BarsAtExtremeFeatures, StochRsiAggregated
} from "../_shared/market-feature-snapshot.ts";

// ===== SHARED GATE & EXIT PIPELINE =====
import {
  evaluateProductionGates, checkProductionExits,
  type GateResult, type BacktestPosition
} from "../_shared/gate-pipeline.ts";

const logger = createLogger('backtest-runner');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ============= TYPES =============

interface StrategyDirectionFilter {
  strategy: string;
  blockedSide?: 'LONG' | 'SHORT';
  reducedSide?: 'LONG' | 'SHORT';
  reducedMultiplier?: number;
}

interface BacktestConfig {
  symbols: string[];
  startDate: string;
  endDate: string;
  barInterval: string;
  strategyDirectionFilters?: StrategyDirectionFilter[];
}

interface BacktestTrade {
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  entryTime: string;
  exitTime: string;
  pnlPercent: number;
  netPnlPercent: number;
  exitReason: string;
  entryScore: number;
  stopLoss: number;
  takeProfit: number;
  qualityScore: number;
  momentumScore: number;
  adx: number;
  stochK: number;
  strategyName: string;
  regime: string;
}

interface EquityPoint {
  time: string;
  equity: number;
  drawdown: number;
}

// ============= PRE-COMPUTED INDICATOR ARRAYS =============

interface PrecomputedIndicators {
  ema9: number[];
  ema21: number[];
  ema50: number[];
  rsiArray: number[];    // aligned: rsiArray[i] = RSI at closes[i], NaN for early bars
  atrArray: number[];    // aligned: atrArray[i] = ATR at bar i, NaN for early bars
  macdHistAligned: number[];  // aligned with closes index
  macdHistPrevAligned: number[]; // previous histogram value
  macdLineAligned: number[];
  macdSignalAligned: number[];
  stochKAligned: number[];
  stochDAligned: number[];
  adxAligned: number[];
  adxSlopeAligned: number[];
  adxRisingAligned: boolean[];
  plusDIAligned: number[];
  minusDIAligned: number[];
  adxPeakedAligned: boolean[];
  adxSlopeSmoothedAligned: number[];
  adxArray7Aligned: number[][];
}

// ============= VECTORIZED HELPER: ATR ARRAY =============

function computeATRArrayFromOHLC(
  highs: number[], lows: number[], closes: number[], period: number
): number[] {
  const n = closes.length;
  const result = new Array(n).fill(NaN);
  if (n < period + 1) return result;

  let atrSum = 0;
  for (let i = 1; i <= period; i++) {
    atrSum += Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
  }
  let atr = atrSum / period;
  result[period] = atr;

  for (let i = period + 1; i < n; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    atr = (atr * (period - 1) + tr) / period;
    result[i] = atr;
  }
  return result;
}

// ============= VECTORIZED HELPER: ADX ARRAYS =============

function computeADXArrays(klines: any[], period = 14): {
  adx: number[];
  adxSlope: number[];
  adxRising: boolean[];
  plusDI: number[];
  minusDI: number[];
  adxPeaked: boolean[];
  adxSlopeSmoothed: number[];
  adxArray7: number[][];
} {
  const n = klines.length;
  const defaults = {
    adx: new Array(n).fill(15),
    adxSlope: new Array(n).fill(0),
    adxRising: new Array(n).fill(false) as boolean[],
    plusDI: new Array(n).fill(0),
    minusDI: new Array(n).fill(0),
    adxPeaked: new Array(n).fill(false) as boolean[],
    adxSlopeSmoothed: new Array(n).fill(0),
    adxArray7: new Array(n).fill(null).map(() => []) as number[][],
  };
  const minRequired = 2 * period + 2;
  if (n < minRequired) return defaults;

  const trueRanges: number[] = [];
  const plusDMs: number[] = [];
  const minusDMs: number[] = [];

  for (let i = 1; i < n; i++) {
    const high = parseFloat(klines[i][2]);
    const low = parseFloat(klines[i][3]);
    const prevHigh = parseFloat(klines[i - 1][2]);
    const prevLow = parseFloat(klines[i - 1][3]);
    const prevClose = parseFloat(klines[i - 1][4]);
    if (!Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(prevClose) ||
        !Number.isFinite(prevHigh) || !Number.isFinite(prevLow) || high <= 0 || low <= 0) {
      trueRanges.push(0); plusDMs.push(0); minusDMs.push(0);
      continue;
    }
    trueRanges.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
    const upMove = high - prevHigh;
    const downMove = prevLow - low;
    plusDMs.push((upMove > downMove && upMove > 0) ? upMove : 0);
    minusDMs.push((downMove > upMove && downMove > 0) ? downMove : 0);
  }

  if (trueRanges.length < 2 * period) return defaults;

  let smoothedTR = 0, smoothedPlusDM = 0, smoothedMinusDM = 0;
  for (let i = 0; i < period; i++) {
    smoothedTR += trueRanges[i];
    smoothedPlusDM += plusDMs[i];
    smoothedMinusDM += minusDMs[i];
  }

  const dxValues: number[] = [];
  const plusDIValues: number[] = [];
  const minusDIValues: number[] = [];
  // trueRanges index to klines index: trIdx => trIdx + 1
  const diKlinesIndices: number[] = [];

  // First DI/DX from initial smoothing
  if (smoothedTR > 0) {
    const pdi = (smoothedPlusDM / smoothedTR) * 100;
    const mdi = (smoothedMinusDM / smoothedTR) * 100;
    plusDIValues.push(pdi); minusDIValues.push(mdi);
    const diSum = pdi + mdi;
    dxValues.push(diSum > 0 ? (Math.abs(pdi - mdi) / diSum) * 100 : 0);
    diKlinesIndices.push(period); // corresponds to klines[period]
  }

  for (let i = period; i < trueRanges.length; i++) {
    smoothedTR = smoothedTR - (smoothedTR / period) + trueRanges[i];
    smoothedPlusDM = smoothedPlusDM - (smoothedPlusDM / period) + plusDMs[i];
    smoothedMinusDM = smoothedMinusDM - (smoothedMinusDM / period) + minusDMs[i];
    if (smoothedTR > 0) {
      const pdi = (smoothedPlusDM / smoothedTR) * 100;
      const mdi = (smoothedMinusDM / smoothedTR) * 100;
      plusDIValues.push(pdi); minusDIValues.push(mdi);
      const diSum = pdi + mdi;
      dxValues.push(diSum > 0 ? (Math.abs(pdi - mdi) / diSum) * 100 : 0);
    } else {
      plusDIValues.push(0); minusDIValues.push(0); dxValues.push(0);
    }
    diKlinesIndices.push(i + 1);
  }

  // Fill aligned DI arrays
  for (let j = 0; j < plusDIValues.length; j++) {
    const klIdx = diKlinesIndices[j];
    if (klIdx < n) {
      defaults.plusDI[klIdx] = Math.round(plusDIValues[j] * 10) / 10;
      defaults.minusDI[klIdx] = Math.round(minusDIValues[j] * 10) / 10;
    }
  }

  // Compute ADX from DX values
  if (dxValues.length < period + 1) return defaults;

  let adx = 0;
  for (let i = 0; i < period; i++) adx += dxValues[i];
  adx /= period;
  const adxValues: number[] = [adx];

  for (let i = period; i < dxValues.length; i++) {
    adx = ((adx * (period - 1)) + dxValues[i]) / period;
    adxValues.push(adx);
  }

  // adxValues[0] uses dxValues[0..period-1], last of which is at diKlinesIndices[period-1]
  const adxStartKlIdx = diKlinesIndices[period - 1] ?? (2 * period - 1);

  for (let j = 0; j < adxValues.length; j++) {
    const klIdx = adxStartKlIdx + j;
    if (klIdx >= n) break;

    const currentAdx = Math.max(0, Math.min(100, Math.round(adxValues[j] * 10) / 10));
    defaults.adx[klIdx] = currentAdx;
    defaults.adxRising[klIdx] = j > 0 ? adxValues[j] > adxValues[j - 1] : false;

    // Slope
    const slopeLookback = Math.min(5, j);
    defaults.adxSlope[klIdx] = slopeLookback > 0
      ? Math.round(((adxValues[j] - adxValues[j - slopeLookback]) / slopeLookback) * 100) / 100
      : 0;

    // Smoothed slope
    const slopePoints = Math.min(3, j - slopeLookback);
    if (slopePoints >= 2) {
      const slopes: number[] = [];
      for (let s = 0; s < slopePoints; s++) {
        const endJ = j - s;
        const startJ = endJ - slopeLookback;
        if (startJ >= 0) slopes.push((adxValues[endJ] - adxValues[startJ]) / slopeLookback);
      }
      if (slopes.length >= 2) {
        defaults.adxSlopeSmoothed[klIdx] = Math.round((slopes.reduce((a, b) => a + b, 0) / slopes.length) * 100) / 100;
      } else {
        defaults.adxSlopeSmoothed[klIdx] = defaults.adxSlope[klIdx];
      }
    } else {
      defaults.adxSlopeSmoothed[klIdx] = defaults.adxSlope[klIdx];
    }

    // ADX peaked
    const peakLb = Math.min(5, j + 1);
    const adxMax = Math.max(...adxValues.slice(j + 1 - peakLb, j + 1));
    defaults.adxPeaked[klIdx] = adxValues[j] < adxMax * 0.99;

    // Last 7 ADX values
    defaults.adxArray7[klIdx] = adxValues.slice(Math.max(0, j - 6), j + 1).map(v => Math.round(v * 10) / 10);
  }

  return defaults;
}

// ============= VECTORIZED HELPER: ALIGNED RSI =============

function computeAlignedRSI(closes: number[], period = 14): number[] {
  const n = closes.length;
  const aligned = new Array(n).fill(50);
  const rsiArr = calculateRSIArray(closes, period);
  // rsiArr[0] corresponds to closes[period], rsiArr[j] = closes[j + period]
  for (let j = 0; j < rsiArr.length; j++) {
    aligned[j + period] = rsiArr[j];
  }
  return aligned;
}

// ============= VECTORIZED HELPER: ALIGNED MACD =============

function computeAlignedMACD(closes: number[]): {
  hist: number[]; histPrev: number[]; line: number[]; signal: number[];
} {
  const n = closes.length;
  const hist = new Array(n).fill(0);
  const histPrev = new Array(n).fill(0);
  const line = new Array(n).fill(0);
  const signal = new Array(n).fill(0);

  if (n < 35) return { hist, histPrev, line, signal };

  const ema12 = calculateEMAArray(closes, 12);
  const ema26 = calculateEMAArray(closes, 26);

  // Build MACD line
  const macdLine: number[] = [];
  const macdLineIndices: number[] = [];
  for (let i = 25; i < n; i++) {
    if (!Number.isNaN(ema12[i]) && !Number.isNaN(ema26[i])) {
      macdLine.push(ema12[i] - ema26[i]);
      macdLineIndices.push(i);
    }
  }
  if (macdLine.length === 0) return { hist, histPrev, line, signal };

  // Signal EMA (9-period)
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
    const idx = macdLineIndices[i];
    line[idx] = macdLine[i];
    signal[idx] = signalEma;
    hist[idx] = histogramArray[i];
    histPrev[idx] = i > 0 ? histogramArray[i - 1] : 0;
  }

  return { hist, histPrev, line, signal };
}

// ============= VECTORIZED HELPER: ALIGNED STOCHRSI =============

function computeAlignedStochRSI(
  closes: number[], rsiAligned: number[],
  rsiPeriod = 14, stochPeriod = 14, kSmooth = 3, dSmooth = 3
): { k: number[]; d: number[] } {
  const n = closes.length;
  const kArr = new Array(n).fill(50);
  const dArr = new Array(n).fill(50);

  // Extract valid RSI values with their original indices
  const validRsi: number[] = [];
  const validIndices: number[] = [];
  for (let i = 0; i < n; i++) {
    if (i >= rsiPeriod && !isNaN(rsiAligned[i]) && rsiAligned[i] !== 50) {
      validRsi.push(rsiAligned[i]);
      validIndices.push(i);
    }
  }
  // Also include the default-50 values from rsiPeriod onwards if needed
  if (validRsi.length === 0) {
    for (let i = rsiPeriod; i < n; i++) {
      validRsi.push(rsiAligned[i]);
      validIndices.push(i);
    }
  }

  if (validRsi.length < stochPeriod + kSmooth + dSmooth) return { k: kArr, d: dArr };

  // Raw Stochastic K
  const rawK: number[] = [];
  const rawKIndices: number[] = [];
  for (let j = stochPeriod - 1; j < validRsi.length; j++) {
    let maxRsi = -Infinity, minRsi = Infinity;
    for (let k = j - stochPeriod + 1; k <= j; k++) {
      maxRsi = Math.max(maxRsi, validRsi[k]);
      minRsi = Math.min(minRsi, validRsi[k]);
    }
    rawK.push(maxRsi !== minRsi ? ((validRsi[j] - minRsi) / (maxRsi - minRsi)) * 100 : 50);
    rawKIndices.push(validIndices[j]);
  }

  if (rawK.length < kSmooth) return { k: kArr, d: dArr };

  // Smooth K (SMA)
  const smoothedK: number[] = [];
  const smoothedKIndices: number[] = [];
  let kSum = 0;
  for (let j = 0; j < rawK.length; j++) {
    kSum += rawK[j];
    if (j >= kSmooth) kSum -= rawK[j - kSmooth];
    if (j >= kSmooth - 1) {
      smoothedK.push(kSum / kSmooth);
      smoothedKIndices.push(rawKIndices[j]);
    }
  }

  if (smoothedK.length < dSmooth) return { k: kArr, d: dArr };

  // D (SMA of smoothed K)
  const smoothedD: number[] = [];
  const smoothedDIndices: number[] = [];
  let dSum = 0;
  for (let j = 0; j < smoothedK.length; j++) {
    dSum += smoothedK[j];
    if (j >= dSmooth) dSum -= smoothedK[j - dSmooth];
    if (j >= dSmooth - 1) {
      smoothedD.push(dSum / dSmooth);
      smoothedDIndices.push(smoothedKIndices[j]);
    }
  }

  // Fill aligned arrays
  for (let j = 0; j < smoothedK.length; j++) {
    const idx = smoothedKIndices[j];
    if (idx < n) kArr[idx] = Math.round(smoothedK[j] * 10) / 10;
  }
  for (let j = 0; j < smoothedD.length; j++) {
    const idx = smoothedDIndices[j];
    if (idx < n) dArr[idx] = Math.round(smoothedD[j] * 10) / 10;
  }

  return { k: kArr, d: dArr };
}

// ============= VECTORIZED HELPER: VOLUME PER BAR =============

function computeVolumeAtBar(
  klines: any[], i: number
): { volumeRatio: number; volumeTrend: string; volumeSpike: boolean } {
  if (i < 21) return { volumeRatio: 1.0, volumeTrend: 'neutral', volumeSpike: false };
  const volumes: number[] = [];
  for (let j = i - 20; j <= i; j++) {
    const v = parseFloat(klines[j][5]);
    if (Number.isFinite(v) && v > 0) volumes.push(v);
  }
  if (volumes.length < 21) return { volumeRatio: 1.0, volumeTrend: 'neutral', volumeSpike: false };

  const historical = volumes.slice(0, -1);
  const avg = historical.reduce((s, v) => s + v, 0) / historical.length;
  const current = volumes[volumes.length - 1];
  const ratio = avg > 0 ? Math.round((current / avg) * 100) / 100 : 1.0;
  const spike = ratio > 1.5;

  const recentAvg = volumes.slice(-3).reduce((s, v) => s + v, 0) / 3;
  const prevAvg = volumes.slice(-6, -3).reduce((s, v) => s + v, 0) / 3;
  const trend = recentAvg > prevAvg * 1.2 ? 'increasing' : recentAvg < prevAvg * 0.8 ? 'decreasing' : 'neutral';

  return { volumeRatio: ratio, volumeTrend: trend, volumeSpike: spike };
}

// ============= PRECOMPUTE ALL INDICATORS =============

function precomputeAllIndicators(
  closes: number[], highs: number[], lows: number[], volumes: number[], klines: any[]
): PrecomputedIndicators {
  const ema9 = calculateEMAArray(closes, 9);
  const ema21 = calculateEMAArray(closes, 21);
  const ema50 = calculateEMAArray(closes, 50);
  const rsiArray = computeAlignedRSI(closes, 14);
  const atrArray = computeATRArrayFromOHLC(highs, lows, closes, 14);
  const macd = computeAlignedMACD(closes);
  const stoch = computeAlignedStochRSI(closes, rsiArray);
  const adx = computeADXArrays(klines, 14);

  return {
    ema9, ema21, ema50,
    rsiArray,
    atrArray,
    macdHistAligned: macd.hist,
    macdHistPrevAligned: macd.histPrev,
    macdLineAligned: macd.line,
    macdSignalAligned: macd.signal,
    stochKAligned: stoch.k,
    stochDAligned: stoch.d,
    adxAligned: adx.adx,
    adxSlopeAligned: adx.adxSlope,
    adxRisingAligned: adx.adxRising,
    plusDIAligned: adx.plusDI,
    minusDIAligned: adx.minusDI,
    adxPeakedAligned: adx.adxPeaked,
    adxSlopeSmoothedAligned: adx.adxSlopeSmoothed,
    adxArray7Aligned: adx.adxArray7,
  };
}

// ============= BINANCE HISTORICAL KLINES FETCH =============

async function fetchHistoricalKlines(
  symbol: string, interval: string, startTime: number, endTime: number,
): Promise<any[]> {
  const allKlines: any[] = [];
  let currentStart = startTime;
  const BATCH_LIMIT = 1000;

  while (currentStart < endTime) {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${currentStart}&endTime=${endTime}&limit=${BATCH_LIMIT}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`Binance API error: ${response.status}`);
      const klines = await response.json();
      if (!Array.isArray(klines) || klines.length === 0) break;
      allKlines.push(...klines);
      const lastOpenTime = klines[klines.length - 1][0];
      currentStart = lastOpenTime + 1;
      if (klines.length === BATCH_LIMIT) await new Promise(r => setTimeout(r, 200));
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
  return allKlines;
}

// ============= BUILD PRODUCTION-PARITY MFS FROM PRE-COMPUTED =============

function buildBacktestMFS(
  symbol: string,
  barIdx: number,
  closes1h: number[], highs1h: number[], lows1h: number[],
  pre1h: PrecomputedIndicators,
  pre4h: PrecomputedIndicators,
  idx4h: number,
  closes4h: number[],
  momentumResult: MomentumScoreResult,
): MarketFeatureSnapshot {
  const currentPrice = closes1h[barIdx];

  // Read pre-computed 1h indicators at barIdx
  const ema9 = pre1h.ema9[barIdx] ?? currentPrice;
  const ema21 = pre1h.ema21[barIdx] ?? currentPrice;
  const ema50 = pre1h.ema50[barIdx] ?? ema21;
  if (isNaN(ema9)) { /* fallback handled by ?? */ }
  const e9 = isNaN(ema9) ? currentPrice : ema9;
  const e21 = isNaN(ema21) ? currentPrice : ema21;
  const e50 = isNaN(ema50) ? e21 : ema50;

  const rsi1h = pre1h.rsiArray[barIdx] ?? 50;
  const atr1h = pre1h.atrArray[barIdx] ?? currentPrice * 0.015;
  const atrPercent1h = currentPrice > 0 ? (atr1h / currentPrice) * 100 : 1.5;
  const stochK1h = pre1h.stochKAligned[barIdx] ?? 50;
  const stochD1h = pre1h.stochDAligned[barIdx] ?? 50;
  const macdHist1h = pre1h.macdHistAligned[barIdx] ?? 0;
  const macdHistPrev1h = pre1h.macdHistPrevAligned[barIdx] ?? 0;
  const macdLine1h = pre1h.macdLineAligned[barIdx] ?? 0;
  const macdSignal1h = pre1h.macdSignalAligned[barIdx] ?? 0;
  const adx1h = pre1h.adxAligned[barIdx] ?? 15;
  const adxSlope1h = pre1h.adxSlopeAligned[barIdx] ?? 0;
  const adxRising1h = pre1h.adxRisingAligned[barIdx] ?? false;
  const plusDI1h = pre1h.plusDIAligned[barIdx] ?? 0;
  const minusDI1h = pre1h.minusDIAligned[barIdx] ?? 0;
  const adxArray71h = pre1h.adxArray7Aligned[barIdx] ?? [];

  // Read pre-computed 4h indicators at idx4h
  const e9_4h = isNaN(pre4h.ema9[idx4h]) ? closes4h[idx4h] : (pre4h.ema9[idx4h] ?? closes4h[idx4h]);
  const e21_4h = isNaN(pre4h.ema21[idx4h]) ? closes4h[idx4h] : (pre4h.ema21[idx4h] ?? closes4h[idx4h]);
  const e50_4h = isNaN(pre4h.ema50[idx4h]) ? e21_4h : (pre4h.ema50[idx4h] ?? e21_4h);
  const stochK4h = pre4h.stochKAligned[idx4h] ?? 50;
  const stochD4h = pre4h.stochDAligned[idx4h] ?? 50;
  const macdHist4h = pre4h.macdHistAligned[idx4h] ?? 0;
  const macdLine4h = pre4h.macdLineAligned[idx4h] ?? 0;
  const macdSignal4h = pre4h.macdSignalAligned[idx4h] ?? 0;
  const rsi4h = pre4h.rsiArray[idx4h] ?? 50;
  const adx4h = pre4h.adxAligned[idx4h] ?? 15;

  // Primary trends
  const emaBullish1h = e9 > e21 && e21 > e50;
  const emaBearish1h = e9 < e21 && e21 < e50;
  const primaryTrend1h = emaBullish1h ? 'bullish' as const : emaBearish1h ? 'bearish' as const : 'neutral' as const;
  const emaSpread1h = Math.abs((e9 - e21) / e21) * 100;
  const confidence1h = Math.min(80, 40 + emaSpread1h * 10);

  const emaBullish4h = e9_4h > e21_4h && e21_4h > e50_4h;
  const emaBearish4h = e9_4h < e21_4h && e21_4h < e50_4h;
  const primaryTrend4h = emaBullish4h ? 'bullish' as const : emaBearish4h ? 'bearish' as const : 'neutral' as const;
  const emaSpread4h = Math.abs((e9_4h - e21_4h) / e21_4h) * 100;
  const confidence4h = Math.min(80, 40 + emaSpread4h * 10);

  // Bollinger Bands (1h) - computed from pre-computed EMA (use last 20 closes)
  const bbStart = Math.max(0, barIdx - 19);
  const bbCloses = closes1h.slice(bbStart, barIdx + 1);
  const sma = bbCloses.reduce((s, c) => s + c, 0) / bbCloses.length;
  const variance = bbCloses.reduce((s, c) => s + (c - sma) ** 2, 0) / bbCloses.length;
  const stdDev = Math.sqrt(variance);
  const bbUpper = sma + 2 * stdDev;
  const bbLower = sma - 2 * stdDev;
  const bbWidth = bbUpper - bbLower;
  const percentB = bbWidth > 0 ? ((currentPrice - bbLower) / bbWidth) * 100 : 50;
  const bandwidth = sma > 0 ? (bbWidth / sma) * 100 : 0;
  const squeeze = bandwidth < 4;

  // 24h high/low (direct array access, no slice)
  const lookback24h = Math.min(24, barIdx + 1);
  let high24h = -Infinity, low24h = Infinity;
  for (let j = barIdx - lookback24h + 1; j <= barIdx; j++) {
    if (j >= 0) {
      if (highs1h[j] > high24h) high24h = highs1h[j];
      if (lows1h[j] < low24h) low24h = lows1h[j];
    }
  }
  const distFromHigh = high24h > 0 ? ((high24h - currentPrice) / high24h) * 100 : 0;
  const distFromLow = low24h > 0 ? ((currentPrice - low24h) / low24h) * 100 : 0;

  // MACD details
  const macdExpanding = Math.abs(macdHist1h) > Math.abs(macdHistPrev1h);
  const volumeConfirms = false; // Will be set from volume analysis

  // Momentum state mapping
  const derivedMomentumState = (() => {
    const score = momentumResult.score;
    const absScore = Math.abs(score);
    const phase = momentumResult.phase;
    const dir = momentumResult.direction;
    if (dir !== "neutral" && absScore >= 15 && (phase === "strong_bullish" || phase === "strong_bearish" || phase === "bullish" || phase === "bearish")) return "confirmed";
    if (dir !== "neutral" && absScore >= 8 && momentumResult.isAccelerating) return "building";
    if (dir !== "neutral" && absScore >= 5) return "building";
    if (absScore > 0 && absScore < 8) return "mixed";
    if (phase === "transition_up" || phase === "transition_down") return "mixed";
    return "none";
  })();
  const derivedMomentumConfirms = Math.abs(momentumResult.score) >= 8 && momentumResult.direction !== "neutral";

  // Multi-TF alignment
  const alignedTFs = [primaryTrend4h, primaryTrend1h];
  const bullishCount = alignedTFs.filter(t => t === 'bullish').length;
  const bearishCount = alignedTFs.filter(t => t === 'bearish').length;
  const maxAligned = Math.max(bullishCount, bearishCount);
  const trueAlignmentScore = maxAligned === 2 ? 85 : adx1h >= 25 ? 50 : 30;
  const adxContribution = adx1h >= 35 ? 20 : adx1h >= 25 ? 15 : adx1h >= 20 ? 10 : 5;
  const totalWeightedConf = (confidence4h * 0.45 + confidence1h * 0.35 + adxContribution);
  const trendConsistency = maxAligned === 2 ? 80 : 40;

  // StochRSI features
  const defaultStochRsi: StochRsiFeatures = { k: 50, d: 50, signal: "neutral", prevK: 50, kArray: [] };
  const stoch1h: StochRsiFeatures = {
    k: stochK1h, d: stochD1h,
    signal: stochK1h > 80 ? "overbought" : stochK1h < 20 ? "oversold" : "neutral",
    prevK: stochK1h, kArray: [],
  };
  const stoch4h: StochRsiFeatures = {
    k: stochK4h, d: stochD4h,
    signal: stochK4h > 80 ? "overbought" : stochK4h < 20 ? "oversold" : "neutral",
    prevK: stochK4h, kArray: [],
  };

  // Timeframe features
  const defaultTF: TimeframeFeatures = {
    trend: "neutral", confidence: 0, rsi: 50, emaSignal: "neutral",
    macd: 0, macdSignal: 0, macdHistogram: 0, macdTrend: "neutral",
  };
  const tf1hFeatures: TimeframeFeatures = {
    trend: primaryTrend1h, confidence: confidence1h, rsi: rsi1h,
    emaSignal: primaryTrend1h === 'bullish' ? 'bullish' : primaryTrend1h === 'bearish' ? 'bearish' : 'neutral',
    macd: macdLine1h, macdSignal: macdSignal1h, macdHistogram: macdHist1h,
    macdTrend: Math.abs(macdHist1h) > Math.abs(macdSignal1h) * 0.5 ? "expanding" : "contracting",
  };
  const tf4hFeatures: TimeframeFeatures = {
    trend: primaryTrend4h, confidence: confidence4h, rsi: rsi4h,
    emaSignal: primaryTrend4h === 'bullish' ? 'bullish' : primaryTrend4h === 'bearish' ? 'bearish' : 'neutral',
    macd: macdLine4h, macdSignal: macdSignal4h, macdHistogram: macdHist4h,
    macdTrend: Math.abs(macdHist4h) > Math.abs(macdSignal4h) * 0.5 ? "expanding" : "contracting",
  };

  // Bollinger features
  const defaultBollinger: BollingerFeatures = {
    upper: 0, middle: 0, lower: 0, bandwidth: 0, percentB: 50,
    squeeze: false, squeezeIntensity: 0, pricePosition: "middle",
  };
  const primaryBollinger: BollingerFeatures = {
    upper: bbUpper, middle: sma, lower: bbLower,
    bandwidth, percentB, squeeze, squeezeIntensity: squeeze ? 70 : 0,
    pricePosition: percentB > 80 ? "upper" : percentB < 20 ? "lower" : "middle",
  };

  // Volume features (computed inline - fast)
  const defaultVolume: VolumeFeatures = {
    volumeRatio: 1.0, volumeTrend: "stable", volumeSpike: false, volumeDirection: "neutral",
  };

  // PRODUCTION REGIME CLASSIFICATION
  const derivedDir = primaryTrend1h === 'bullish' ? 'long' : primaryTrend1h === 'bearish' ? 'short' : 'neutral';
  const regimeResult = classify4StateRegime(
    adx1h, adxSlope1h, primaryTrend1h, derivedMomentumState, momentumResult.score,
    primaryTrend4h, primaryTrend1h, derivedDir,
    stochK4h, momentumResult.isExhausted, squeeze, maxAligned,
    Math.abs(plusDI1h - minusDI1h),
    atr1h > 0 ? atr1h / (currentPrice * 0.015) : 1.0,
  );

  let barsOverbought = 0, barsOversold = 0;
  if (stochK1h >= 80) barsOverbought = 1;
  if (stochK1h <= 20) barsOversold = 1;
  const defaultBarsAtExtreme: BarsAtExtremeFeatures = { barsOverbought: 0, barsOversold: 0 };

  // Price changes
  const priceChange4h = barIdx >= 4 ? ((currentPrice - closes1h[barIdx - 4]) / closes1h[barIdx - 4]) * 100 : 0;
  const priceChange24h = barIdx >= 24 ? ((currentPrice - closes1h[barIdx - 24]) / closes1h[barIdx - 24]) * 100 : 0;

  const mfs: MarketFeatureSnapshot = {
    symbol, currentPrice,
    timestamp: new Date().toISOString(),
    primaryTrend: primaryTrend1h,
    confidence: confidence1h,
    isAligned: maxAligned >= 2,
    trendConsistency,

    adx: adx1h,
    adxSlope: adxSlope1h,
    adxRising: adxRising1h,
    adxArray: adxArray71h,

    stochRsi: {
      "15m": defaultStochRsi, "30m": defaultStochRsi,
      "1h": stoch1h, "4h": stoch4h,
    },
    stochRsiAggregated: { bearishCrossCount: 0, bullishCrossCount: 0, overboughtCount: 0, oversoldCount: 0 },
    barsAtExtreme: {
      "1h": { barsOverbought, barsOversold },
      "4h": defaultBarsAtExtreme,
    },

    timeframes: {
      "15m": defaultTF, "30m": defaultTF,
      "1h": tf1hFeatures, "4h": tf4hFeatures,
    },

    bollinger: {
      "15m": defaultBollinger, "30m": defaultBollinger,
      "1h": primaryBollinger, "4h": defaultBollinger,
      squeezeActive: squeeze, squeezeBreakoutPotential: false,
    },

    volume: {
      "15m": defaultVolume, "30m": defaultVolume,
      "1h": defaultVolume, "4h": defaultVolume,
      confirmsDirection: false,
      hasRangeExpansion1h: false,
    },

    atr: atr1h, atrPercent: atrPercent1h,
    relativeATR: atr1h > 0 ? atr1h / (currentPrice * 0.015) : 1.0,
    historicalATRAvg: atr1h,
    isCompressed: squeeze,
    volatilityNormal: atrPercent1h < 3.0,
    isRanging: primaryTrend1h === 'neutral',

    momentumState: derivedMomentumState,
    momentumScore: momentumResult.score,
    prevMomentumScore: momentumResult.score,
    momentumConfirms: derivedMomentumConfirms,
    macdExpanding,
    macdStrong: Math.abs(macdHist1h) > Math.abs(macdSignal1h) * 0.5,
    macdHistogram: macdHist1h,
    macdDirectionAligned: (primaryTrend1h === 'bullish' && macdHist1h > 0) || (primaryTrend1h === 'bearish' && macdHist1h < 0),
    hasDivergence: false,
    volumeConfirms: false,
    adxRisingMomentum: adxRising1h,
    fakeBreakoutRisk: macdExpanding && !adxRising1h,
    genuineMomentum: adxRising1h && macdExpanding,
    consecutiveBars1h: 0, consecutiveBars15m: 0, consecutiveBars30m: 0,

    smartMomentum: {
      score: momentumResult.score,
      direction: momentumResult.direction,
      phase: momentumResult.phase,
      isAccelerating: momentumResult.isAccelerating,
      isExhausted: momentumResult.isExhausted,
      isWeakening: momentumResult.isWeakening,
      isTransitioning: momentumResult.isTransitioning,
      overextensionATR: momentumResult.overextensionATR,
      microExhaustion: momentumResult.microExhaustion,
      components: momentumResult.components,
    },

    directionStableBars: 0,
    momentumDirection: momentumResult.direction,
    prevMacdHistogram: macdHistPrev1h,
    squeezeJustReleased: false,

    distanceFromHighPercent: distFromHigh,
    distanceFromLowPercent: distFromLow,
    atrNormalizedFromHigh: atr1h > 0 ? (high24h - currentPrice) / atr1h : 0,
    atrNormalizedFromLow: atr1h > 0 ? (currentPrice - low24h) / atr1h : 0,
    high24h, low24h,

    priceChange4h,
    priceChange24h,

    vwapValue: sma,
    vwapDistancePercent: sma > 0 ? ((currentPrice - sma) / sma) * 100 : 0,

    inPullback: false, pullbackPercent: 0, pullbackConditionsMet: false,

    microTrend: {
      hasMicroTrend: false, direction: "neutral", confidence: 0,
      alignment: 0, reason: "", persistence: 0,
    },
    stealthTrend: {
      detected: false, direction: "neutral", driftPercent: 0, driftDuration: 0,
      adxBypassAllowed: false, htfBypassAllowed: false, stealthScore: 0,
      positionMultiplier: 1.0, stopMultiplier: 1.0, reason: "",
    },
    neutralPersistence: {
      isCurrentlyNeutral: primaryTrend1h === 'neutral', durationMinutes: 0,
      confidenceBonus: 0, reason: "",
    },
    marketStructureValid: true, marketStructureConfidence: 50,
    trueAlignment: {
      score: trueAlignmentScore,
      tf4hConfidence: confidence4h,
      tf1hConfidence: confidence1h,
      adxContribution,
      totalWeightedConfidence: totalWeightedConf,
      neutralCapped: primaryTrend1h === 'neutral',
      breakdown: { bullishCount, bearishCount, maxAligned },
      weightedComponents: {},
    },
    diPlus: plusDI1h,
    diMinus: minusDI1h,
    diSeparation: Math.abs(plusDI1h - minusDI1h),
    priceActionMomentum: {
      hasStrongMove: false, direction: "neutral", movePercent: 0,
      isStrongMove: false, canOverrideNeutralAlignment: false,
    },
    regime: regimeResult.regime,
    volumeScore: 0, reversalScore: 0, volumeZScore: 0,
    lastCloseAlignsWithTrend: (primaryTrend1h === 'bullish' && currentPrice > e9) || (primaryTrend1h === 'bearish' && currentPrice < e9),
    momentumRsi: rsi1h, trendAgeBars: 0,
    stochRsiHistory: { "1h": [], "4h": [] },
    klines15m: [], klines30m: [], klines5m: [], klines1m: [],
    volumeRatio: 1.0,
  };

  return mfs;
}

// ============= PER-SYMBOL BACKTEST (parallelizable) =============

interface SymbolBacktestResult {
  trades: BacktestTrade[];
  equityCurve: EquityPoint[];
  gateStats: Record<string, number>;
  finalEquityDelta: number; // percentage change to apply to portfolio
}

async function backtestSymbol(
  symbol: string, config: BacktestConfig,
): Promise<SymbolBacktestResult> {
  const trades: BacktestTrade[] = [];
  const equityCurve: EquityPoint[] = [];
  const gateStats: Record<string, number> = {};
  let equity = 10000;
  let peakEquity = equity;

  const startTime = new Date(config.startDate).getTime();
  const endTime = new Date(config.endDate).getTime();
  const barMs = config.barInterval === '4h' ? 4 * 60 * 60 * 1000 : 60 * 60 * 1000;
  const lookbackMs = 100 * barMs;

  logger.info(`${LOG_CATEGORIES.SUCCESS} Backtest: fetching multi-TF klines for ${symbol}`);

  // ===== FETCH REAL MULTI-TF KLINES =====
  const [allKlines1h, allKlines4h] = await Promise.all([
    fetchHistoricalKlines(symbol, '1h', startTime - lookbackMs, endTime),
    fetchHistoricalKlines(symbol, '4h', startTime - lookbackMs, endTime),
  ]);

  if (allKlines1h.length < 60) {
    logger.warn(`Insufficient 1h klines for ${symbol}: ${allKlines1h.length}`);
    return { trades, equityCurve, gateStats, finalEquityDelta: 0 };
  }
  logger.info(`${LOG_CATEGORIES.SUCCESS} Backtest: ${symbol} loaded ${allKlines1h.length} 1h bars, ${allKlines4h.length} 4h bars`);

  // ===== PARSE ALL DATA ONCE =====
  const parsed1h = parseKlinePrices(allKlines1h);
  const parsed4h = parseKlinePrices(allKlines4h);

  // ===== PRE-COMPUTE ALL INDICATORS (VECTORIZED) =====
  const precompStart = Date.now();
  const pre1h = precomputeAllIndicators(
    parsed1h.closes, parsed1h.highs, parsed1h.lows, parsed1h.volumes, allKlines1h
  );
  const pre4h = precomputeAllIndicators(
    parsed4h.closes, parsed4h.highs, parsed4h.lows, parsed4h.volumes, allKlines4h
  );
  logger.info(`${LOG_CATEGORIES.SUCCESS} Backtest: ${symbol} pre-computed indicators in ${Date.now() - precompStart}ms`);

  // Find start index for 1h bars
  let startIdx = 0;
  for (let i = 0; i < allKlines1h.length; i++) {
    if (allKlines1h[i][0] >= startTime) { startIdx = i; break; }
  }

  const openPositions: (BacktestPosition & { entryRegime: string })[] = [];
  let lastTradeTime = 0;
  let cachedMomentumScore = 0;
  let cachedMomentumDirection: "bullish" | "bearish" | "neutral" = "neutral";
  let momentumCacheBar = -999;

  // Pre-build 4h index lookup table for O(1) access instead of O(n) scan per bar
  const idx4hLookup = new Int32Array(allKlines1h.length);
  {
    let j4h = 0;
    for (let i = 0; i < allKlines1h.length; i++) {
      const barTimeMs = allKlines1h[i][0];
      while (j4h + 1 < allKlines4h.length && allKlines4h[j4h + 1][0] <= barTimeMs) {
        j4h++;
      }
      idx4hLookup[i] = j4h;
    }
  }

  for (let i = startIdx; i < allKlines1h.length; i++) {
    const barTime = new Date(allKlines1h[i][0]).toISOString();
    const barTimeMs = allKlines1h[i][0];
    const currentPrice = parsed1h.closes[i];

    // Read pre-computed 1h indicators at index i (O(1) lookup!)
    const atr = isNaN(pre1h.atrArray[i]) ? currentPrice * 0.015 : pre1h.atrArray[i];
    const atrPercent = (atr / currentPrice) * 100;
    const adx = pre1h.adxAligned[i];
    const adxSlope = pre1h.adxSlopeAligned[i];
    const e9 = isNaN(pre1h.ema9[i]) ? currentPrice : pre1h.ema9[i];
    const e21 = isNaN(pre1h.ema21[i]) ? currentPrice : pre1h.ema21[i];
    const primaryTrend = currentPrice > e21 ? 'bullish' : 'bearish';

    // O(1) 4h index lookup
    const idx4h = idx4hLookup[i];

    // Update cached momentum score every 4 bars (not every bar)
    if (i - momentumCacheBar >= 4 && i > 50) {
      const momSliceStart = Math.max(0, i - 99);
      const momKlines = allKlines1h.slice(momSliceStart, i + 1);
      const momCloses = parsed1h.closes.slice(momSliceStart, i + 1);
      const momResult = calculateMomentumScore(
        momKlines, momCloses, adx, pre1h.adxRisingAligned[i], atr, adxSlope
      );
      cachedMomentumScore = momResult.score;
      cachedMomentumDirection = momResult.direction;
      momentumCacheBar = i;
    }

    // ===== CHECK EXITS ON OPEN POSITIONS =====
    for (let p = openPositions.length - 1; p >= 0; p--) {
      const pos = openPositions[p];

      const exitResult = checkProductionExits(
        pos, currentPrice, barTime, atr, atrPercent,
        adx, adxSlope, primaryTrend, cachedMomentumScore,
      );

      if (exitResult.shouldExit) {
        const pnl = calculateFeeAwarePnL(
          pos.side === 'LONG' ? 'BUY' : 'SELL',
          pos.entryPrice, currentPrice, 1,
          TRADING_FEE_PARAMS.DEFAULT_FEE_RATE_PERCENT,
        );

        trades.push({
          symbol, side: pos.side,
          entryPrice: pos.entryPrice, exitPrice: currentPrice,
          entryTime: pos.entryTime, exitTime: barTime,
          pnlPercent: pnl.grossPnlPercent, netPnlPercent: pnl.netPnlPercent,
          exitReason: exitResult.exitReason, entryScore: pos.entryScore,
          stopLoss: pos.stopLoss, takeProfit: pos.takeProfit,
          qualityScore: pos.qualityScore, momentumScore: pos.entryMomentumScore,
          adx: pos.entryAdx, stochK: pos.entryStochK,
          strategyName: pos.strategyName,
          regime: pos.entryRegime,
        });

        const positionSize = equity * 0.015 * 1.0;
        equity += positionSize * (pnl.netPnlPercent / 100);
        peakEquity = Math.max(peakEquity, equity);
        openPositions.splice(p, 1);
        lastTradeTime = barTimeMs;
      }
    }

    // ===== SIGNAL GENERATION =====
    const cooldownMs = 2 * 60 * 60 * 1000;
    const hasOpenPos = openPositions.some(p => p.symbol === symbol);
    const cooldownPassed = (barTimeMs - lastTradeTime) > cooldownMs;

    if (!hasOpenPos && cooldownPassed && i > 50 && idx4h > 20) {
      const momSliceStart = Math.max(0, i - 99);
      const momKlines = allKlines1h.slice(momSliceStart, i + 1);
      const momCloses = parsed1h.closes.slice(momSliceStart, i + 1);
      const momResult = calculateMomentumScore(
        momKlines, momCloses, adx, pre1h.adxRisingAligned[i], atr, adxSlope
      );

      cachedMomentumScore = momResult.score;
      cachedMomentumDirection = momResult.direction;
      momentumCacheBar = i;

      const mfs = buildBacktestMFS(
        symbol, i,
        parsed1h.closes, parsed1h.highs, parsed1h.lows,
        pre1h, pre4h, idx4h, parsed4h.closes,
        momResult,
      );

      const volInfo = computeVolumeAtBar(allKlines1h, i);
      mfs.volume["1h"] = {
        volumeRatio: volInfo.volumeRatio,
        volumeTrend: volInfo.volumeTrend as any,
        volumeSpike: volInfo.volumeSpike,
        volumeDirection: "neutral",
      };
      mfs.volumeConfirms = volInfo.volumeRatio > 1.2;
      mfs.volume.confirmsDirection = volInfo.volumeRatio > 1.2;
      mfs.volume.hasRangeExpansion1h = volInfo.volumeRatio > 1.5;
      mfs.volumeRatio = volInfo.volumeRatio;

      const lastKlines = allKlines1h.slice(Math.max(0, i - 2), i + 1);
      const gateResult = evaluateProductionGates(mfs, momResult, symbol, lastKlines);

      if (gateResult.gate) {
        gateStats[gateResult.gate] = (gateStats[gateResult.gate] || 0) + 1;
      }

      if (gateResult.passed && gateResult.direction) {
        const isBtcShortRouting = BTC_PARAMS.symbols.includes(symbol) &&
          gateResult.direction === 'SHORT' &&
          BTC_PARAMS.shortStrategyRouting.enabled;

        if (isBtcShortRouting) {
          if (!BTC_PARAMS.shortStrategyRouting.enabledStrategies.includes(gateResult.strategyName)) {
            gateStats[`BTC_SHORT_ROUTING_${gateResult.strategyName}_BLOCKED`] = (gateStats[`BTC_SHORT_ROUTING_${gateResult.strategyName}_BLOCKED`] || 0) + 1;
            continue;
          }
        }

        const symP = getSymbolParams(symbol);
        const slMultiplier = symP.stopLoss.atrMultiplier;
        const tpMultiplier = symP.takeProfit.atrMultiplier;
        const maxSlPercent = symP.stopLoss.maxCapPercent;
        const dir = gateResult.direction;
        const atrStop = atr * slMultiplier;
        const maxStop = currentPrice * (maxSlPercent / 100);
        const effectiveStop = Math.min(atrStop, maxStop);
        let stopLoss: number, takeProfit: number;
        if (dir === 'LONG') {
          stopLoss = currentPrice - effectiveStop;
          takeProfit = currentPrice + (atr * tpMultiplier);
        } else {
          stopLoss = currentPrice + effectiveStop;
          takeProfit = currentPrice - (atr * tpMultiplier);
        }

        openPositions.push({
          symbol, side: dir,
          entryPrice: currentPrice, entryTime: barTime,
          stopLoss, takeProfit,
          peakPnl: 0, peakReachedAt: barTime,
          trailingStop: null,
          entryScore: gateResult.qualityScore,
          qualityScore: gateResult.qualityScore,
          atrAtEntry: atrPercent,
          atrPercentAtEntry: atrPercent,
          strategyName: gateResult.strategyName,
          entryMomentumScore: gateResult.momentumScore,
          entryStochK: pre1h.stochKAligned[i],
          entryAdx: adx,
          entryRegime: mfs.regime,
        });

        logger.info(`${LOG_CATEGORIES.SUCCESS} Backtest ENTRY: ${symbol} ${dir} @ ${currentPrice} | regime=${mfs.regime} strategy=${gateResult.strategyName} ADX=${adx.toFixed(1)} mom=${gateResult.momentumScore}`);
      }
    }

    // Equity curve (downsample: every 4th bar)
    if (i % 4 === 0) {
      const drawdown = peakEquity > 0 ? ((peakEquity - equity) / peakEquity) * 100 : 0;
      equityCurve.push({
        time: barTime,
        equity: Math.round(equity * 100) / 100,
        drawdown: Math.round(drawdown * 100) / 100,
      });
    }
  }

  // Force-close remaining
  const lastPrice = parsed1h.closes[parsed1h.closes.length - 1];
  const lastTime = new Date(allKlines1h[allKlines1h.length - 1][0]).toISOString();
  for (const pos of openPositions) {
    const pnl = calculateFeeAwarePnL(
      pos.side === 'LONG' ? 'BUY' : 'SELL',
      pos.entryPrice, lastPrice, 1,
      TRADING_FEE_PARAMS.DEFAULT_FEE_RATE_PERCENT,
    );
    trades.push({
      symbol, side: pos.side,
      entryPrice: pos.entryPrice, exitPrice: lastPrice,
      entryTime: pos.entryTime, exitTime: lastTime,
      pnlPercent: pnl.grossPnlPercent, netPnlPercent: pnl.netPnlPercent,
      exitReason: 'backtest_end', entryScore: pos.entryScore,
      stopLoss: pos.stopLoss, takeProfit: pos.takeProfit,
      qualityScore: pos.qualityScore, momentumScore: pos.entryMomentumScore,
      adx: pos.entryAdx, stochK: pos.entryStochK,
      strategyName: pos.strategyName,
      regime: pos.entryRegime,
    });
    const positionSize = equity * 0.015;
    equity += positionSize * (pnl.netPnlPercent / 100);
  }

  const finalEquityDelta = ((equity - 10000) / 10000) * 100;
  return { trades, equityCurve, gateStats, finalEquityDelta };
}

// ============= MAIN BACKTEST ORCHESTRATOR =============

async function runBacktest(
  config: BacktestConfig, userId: string, supabase: any, backtestId: string,
): Promise<void> {
  const startMs = Date.now();

  try {
    // ===== PARALLEL MULTI-SYMBOL BACKTEST =====
    const symbolResults = await Promise.all(
      config.symbols.map(symbol => backtestSymbol(symbol, config))
    );

    // ===== MERGE RESULTS =====
    const trades: BacktestTrade[] = [];
    const gateStats: Record<string, number> = {};
    let equity = 10000;

    for (const result of symbolResults) {
      trades.push(...result.trades);
      // Merge gate stats
      for (const [gate, count] of Object.entries(result.gateStats)) {
        gateStats[gate] = (gateStats[gate] || 0) + count;
      }
      // Apply per-symbol equity delta (proportional allocation)
      const allocation = 1 / config.symbols.length;
      equity += 10000 * allocation * (result.finalEquityDelta / 100);
    }

    // Sort trades by entry time for proper timeline
    trades.sort((a, b) => new Date(a.entryTime).getTime() - new Date(b.entryTime).getTime());

    // Merge & sort equity curves, then rebuild combined curve
    const allEquityPoints: EquityPoint[] = [];
    for (const result of symbolResults) {
      allEquityPoints.push(...result.equityCurve);
    }
    allEquityPoints.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    // Rebuild combined equity curve from merged trades
    let combinedEquity = 10000;
    let peakEquity = combinedEquity;
    const equityCurve: EquityPoint[] = [];
    const tradesByTime = [...trades].sort((a, b) => new Date(a.exitTime).getTime() - new Date(b.exitTime).getTime());
    let tradeIdx = 0;

    // Use time points from all symbols
    const timePoints = [...new Set(allEquityPoints.map(e => e.time))].sort();
    for (const time of timePoints) {
      const timeMs = new Date(time).getTime();
      while (tradeIdx < tradesByTime.length && new Date(tradesByTime[tradeIdx].exitTime).getTime() <= timeMs) {
        const t = tradesByTime[tradeIdx];
        const positionSize = combinedEquity * 0.015 / config.symbols.length;
        combinedEquity += positionSize * (t.netPnlPercent / 100);
        peakEquity = Math.max(peakEquity, combinedEquity);
        tradeIdx++;
      }
      const drawdown = peakEquity > 0 ? ((peakEquity - combinedEquity) / peakEquity) * 100 : 0;
      equityCurve.push({
        time,
        equity: Math.round(combinedEquity * 100) / 100,
        drawdown: Math.round(drawdown * 100) / 100,
      });
    }

    // Summary
    const winningTrades = trades.filter(t => t.netPnlPercent > 0);
    const losingTrades = trades.filter(t => t.netPnlPercent <= 0);
    const winRate = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0;
    const avgWin = winningTrades.length > 0 ? winningTrades.reduce((s, t) => s + t.netPnlPercent, 0) / winningTrades.length : 0;
    const avgLoss = losingTrades.length > 0 ? Math.abs(losingTrades.reduce((s, t) => s + t.netPnlPercent, 0) / losingTrades.length) : 0;
    const profitFactor = avgLoss > 0 ? (avgWin * winningTrades.length) / (avgLoss * losingTrades.length) : winningTrades.length > 0 ? Infinity : 0;
    const maxDrawdown = equityCurve.length > 0 ? Math.max(...equityCurve.map(e => e.drawdown)) : 0;
    const totalReturn = ((combinedEquity - 10000) / 10000) * 100;

    const exitBreakdown: Record<string, number> = {};
    for (const t of trades) exitBreakdown[t.exitReason] = (exitBreakdown[t.exitReason] || 0) + 1;

    const strategyBreakdown: Record<string, { count: number; wins: number; totalPnl: number }> = {};
    const regimeBreakdown: Record<string, { count: number; wins: number; totalPnl: number }> = {};
    const symbolBreakdown: Record<string, { count: number; wins: number; totalPnl: number; winRate: number }> = {};
    for (const t of trades) {
      if (!strategyBreakdown[t.strategyName]) strategyBreakdown[t.strategyName] = { count: 0, wins: 0, totalPnl: 0 };
      strategyBreakdown[t.strategyName].count++;
      if (t.netPnlPercent > 0) strategyBreakdown[t.strategyName].wins++;
      strategyBreakdown[t.strategyName].totalPnl += t.netPnlPercent;

      const regime = t.regime || 'UNKNOWN';
      if (!regimeBreakdown[regime]) regimeBreakdown[regime] = { count: 0, wins: 0, totalPnl: 0 };
      regimeBreakdown[regime].count++;
      if (t.netPnlPercent > 0) regimeBreakdown[regime].wins++;
      regimeBreakdown[regime].totalPnl += t.netPnlPercent;

      if (!symbolBreakdown[t.symbol]) symbolBreakdown[t.symbol] = { count: 0, wins: 0, totalPnl: 0, winRate: 0 };
      symbolBreakdown[t.symbol].count++;
      if (t.netPnlPercent > 0) symbolBreakdown[t.symbol].wins++;
      symbolBreakdown[t.symbol].totalPnl += t.netPnlPercent;
    }
    // Calculate per-symbol win rates
    for (const sym of Object.keys(symbolBreakdown)) {
      const s = symbolBreakdown[sym];
      s.winRate = s.count > 0 ? Math.round((s.wins / s.count) * 1000) / 10 : 0;
    }

    const summary = {
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: Math.round(winRate * 10) / 10,
      avgWinPercent: Math.round(avgWin * 1000) / 1000,
      avgLossPercent: Math.round(avgLoss * 1000) / 1000,
      profitFactor: profitFactor === Infinity ? 999 : Math.round(profitFactor * 100) / 100,
      maxDrawdownPercent: Math.round(maxDrawdown * 100) / 100,
      totalReturnPercent: Math.round(totalReturn * 100) / 100,
      finalEquity: Math.round(combinedEquity * 100) / 100,
      exitBreakdown,
      strategyBreakdown,
      regimeBreakdown,
      symbolBreakdown,
      symbolsParallel: config.symbols.length,
      expectancy: trades.length > 0
        ? Math.round(((winRate / 100) * avgWin - ((100 - winRate) / 100) * avgLoss) * 1000) / 1000
        : 0,
    };

    const durationMs = Date.now() - startMs;

    // Downsample equity curve
    let finalEquityCurve = equityCurve;
    if (equityCurve.length > 500) {
      const step = Math.ceil(equityCurve.length / 500);
      finalEquityCurve = equityCurve.filter((_, i) => i % step === 0 || i === equityCurve.length - 1);
    }

    await supabase.from('backtest_results').update({
      status: 'completed', summary, trades,
      equity_curve: finalEquityCurve, gate_stats: gateStats, duration_ms: durationMs,
    }).eq('id', backtestId);

    logger.info(`${LOG_CATEGORIES.SUCCESS} Backtest completed: ${trades.length} trades across ${config.symbols.length} symbols (parallel), ${winRate.toFixed(1)}% WR, PF=${summary.profitFactor}, ${totalReturn.toFixed(2)}% return in ${durationMs}ms`);

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.warn(`Backtest failed: ${errorMsg}`);
    await supabase.from('backtest_results').update({
      status: 'failed', error_message: errorMsg, duration_ms: Date.now() - startMs,
    }).eq('id', backtestId);
  }
}

// ============= HTTP HANDLER =============

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const authHeader = req.headers.get('Authorization');
    let userId: string;

    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
      if (token === serviceKey) {
        userId = body.user_id || 'd21aecef-ebef-4bc6-b260-b9a24b984e68';
      } else if (token === anonKey) {
        if (body.user_id) {
          userId = body.user_id;
        } else {
          return new Response(JSON.stringify({ error: 'Unauthorized - no user_id provided' }), {
            status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      } else {
        const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
          global: { headers: { Authorization: `Bearer ${token}` } },
        });
        const { data: { user }, error: authError } = await userClient.auth.getUser();
        if (authError || !user) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        userId = user.id;
      }
    } else {
      if (body.user_id) {
        userId = body.user_id;
      } else {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    let startDate = body.startDate;
    let endDate = body.endDate;
    if (!startDate || !endDate) {
      const days = body.periodDays || body.days || 7;
      const now = new Date();
      endDate = now.toISOString();
      startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
    }

    const config: BacktestConfig = {
      symbols: body.symbols || ['BTCUSDT'],
      startDate, endDate,
      barInterval: body.barInterval || '1h',
      strategyDirectionFilters: body.strategyDirectionFilters || undefined,
    };

    const parsedStart = new Date(config.startDate);
    const parsedEnd = new Date(config.endDate);
    const daysDiff = (parsedEnd.getTime() - parsedStart.getTime()) / (1000 * 60 * 60 * 24);

    if (daysDiff > 180) {
      return new Response(JSON.stringify({ error: 'Maximum backtest period is 180 days' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    if (daysDiff < 1) {
      return new Response(JSON.stringify({ error: 'Minimum backtest period is 1 day' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Clear stale running backtests
    await supabase.from('backtest_results')
      .update({ status: 'failed', error_message: 'timeout_cleanup' })
      .eq('user_id', userId).eq('status', 'running')
      .lt('created_at', new Date(Date.now() - 2 * 60 * 1000).toISOString());

    const { data: running } = await supabase.from('backtest_results')
      .select('id').eq('user_id', userId).eq('status', 'running').limit(1);
    if (running && running.length > 0) {
      return new Response(JSON.stringify({ error: 'A backtest is already running.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: backtestRecord, error: insertError } = await supabase
      .from('backtest_results').insert({ user_id: userId, config, status: 'running' })
      .select('id').single();

    if (insertError || !backtestRecord) {
      throw new Error(`Failed to create backtest record: ${insertError?.message}`);
    }

    await runBacktest(config, userId, supabase, backtestRecord.id);

    return new Response(JSON.stringify({
      id: backtestRecord.id, status: 'completed', message: 'Backtest completed'
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.warn(`Backtest handler error: ${errorMsg}`);
    return new Response(JSON.stringify({ error: errorMsg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
