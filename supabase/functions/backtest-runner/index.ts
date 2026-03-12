import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.84.0";
import {
  calculateRSI, calculateEMA, calculateEMAArray, calculateMACD,
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

interface BacktestConfig {
  symbols: string[];
  startDate: string;
  endDate: string;
  barInterval: string;
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

// ============= MULTI-TF INDICATOR COMPUTATION =============
// Computes indicator set from parsed kline data for a given timeframe

interface TFIndicators {
  closes: number[];
  highs: number[];
  lows: number[];
  volumes: number[];
  klines: any[];
  ema9: number;
  ema21: number;
  ema50: number;
  rsi: number;
  stochResult: { k: number; d: number };
  macdResult: { macd: number; signal: number; histogram: number; histogramArray?: number[] };
  adxResult: ADXResult;
  atr: number;
  atrPercent: number;
  volAnalysis: { volumeRatio: number; volumeTrend: string; volumeSpike: boolean };
  primaryTrend: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
}

function computeTFIndicators(
  closes: number[], highs: number[], lows: number[], volumes: number[], klines: any[]
): TFIndicators {
  const currentPrice = closes[closes.length - 1];
  const ema9 = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);
  const ema50 = closes.length > 50 ? calculateEMA(closes, 50) : ema21;
  const rsi = closes.length > 14 ? calculateRSI(closes, 14) : 50;
  const stochResult = closes.length > 14
    ? calculateStochasticRSI(closes, 14, 14, 3, 3)
    : { k: 50, d: 50 };
  const macdResult = closes.length > 26 ? calculateMACD(closes) : { macd: 0, signal: 0, histogram: 0, histogramArray: [] };
  const adxResult = klines.length > 30
    ? calculateADXWithDirection(klines, 14)
    : { adx: 15, slope: 0, adxSlope: 0, adxRising: false, plusDI: 0, minusDI: 0, diGap: 0, prevDiGap: 0, adxArray: [], prevAdx: 15, adxPeaked: false, adxSlopeSmoothed: 0 };
  const atr = closes.length > 14 ? calculateATR(highs, lows, closes, 14) : currentPrice * 0.015;
  const atrPercent = currentPrice > 0 ? (atr / currentPrice) * 100 : 1.5;
  const volAnalysis = calculateVolumeAnalysis(klines);
  
  const emaBullish = ema9 > ema21 && ema21 > ema50;
  const emaBearish = ema9 < ema21 && ema21 < ema50;
  const primaryTrend = emaBullish ? 'bullish' as const : emaBearish ? 'bearish' as const : 'neutral' as const;
  const emaSpread = Math.abs((ema9 - ema21) / ema21) * 100;
  const confidence = Math.min(80, 40 + emaSpread * 10);

  return {
    closes, highs, lows, volumes, klines,
    ema9, ema21, ema50, rsi, stochResult, macdResult, adxResult,
    atr, atrPercent, volAnalysis, primaryTrend, confidence,
  };
}

// ============= BUILD PRODUCTION-PARITY MFS =============

function buildBacktestMFS(
  symbol: string,
  tf1h: TFIndicators,
  tf4h: TFIndicators,
  momentumResult: MomentumScoreResult,
): MarketFeatureSnapshot {
  const currentPrice = tf1h.closes[tf1h.closes.length - 1];

  // Bollinger Bands (1h)
  const period = 20;
  const recentCloses = tf1h.closes.slice(-period);
  const sma = recentCloses.reduce((s, c) => s + c, 0) / recentCloses.length;
  const variance = recentCloses.reduce((s, c) => s + (c - sma) ** 2, 0) / recentCloses.length;
  const stdDev = Math.sqrt(variance);
  const bbUpper = sma + 2 * stdDev;
  const bbLower = sma - 2 * stdDev;
  const bbWidth = bbUpper - bbLower;
  const percentB = bbWidth > 0 ? ((currentPrice - bbLower) / bbWidth) * 100 : 50;
  const bandwidth = sma > 0 ? (bbWidth / sma) * 100 : 0;
  const squeeze = bandwidth < 4;

  // 24h high/low from 1h data
  const lookback24h = Math.min(24, tf1h.closes.length);
  const recentHighs24h = tf1h.highs.slice(-lookback24h);
  const recentLows24h = tf1h.lows.slice(-lookback24h);
  const high24h = Math.max(...recentHighs24h);
  const low24h = Math.min(...recentLows24h);
  const distFromHigh = high24h > 0 ? ((high24h - currentPrice) / high24h) * 100 : 0;
  const distFromLow = low24h > 0 ? ((currentPrice - low24h) / low24h) * 100 : 0;

  // MACD details (1h)
  const macdHist = tf1h.macdResult.histogram;
  const macdHistPrev = tf1h.macdResult.histogramArray?.length > 1
    ? tf1h.macdResult.histogramArray[tf1h.macdResult.histogramArray.length - 2] : 0;
  const macdExpanding = Math.abs(macdHist) > Math.abs(macdHistPrev);
  const volumeConfirms = tf1h.volAnalysis.volumeRatio > 1.2;

  // ===== Momentum state mapping =====
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

  // ===== REAL MULTI-TF alignment (using separate 4h klines) =====
  const alignedTFs = [tf4h.primaryTrend, tf1h.primaryTrend];
  const bullishCount = alignedTFs.filter(t => t === 'bullish').length;
  const bearishCount = alignedTFs.filter(t => t === 'bearish').length;
  const maxAligned = Math.max(bullishCount, bearishCount);
  const trueAlignmentScore = maxAligned === 2 ? 85 : tf1h.adxResult.adx >= 25 ? 50 : 30;
  const adxContribution = tf1h.adxResult.adx >= 35 ? 20 : tf1h.adxResult.adx >= 25 ? 15 : tf1h.adxResult.adx >= 20 ? 10 : 5;
  const totalWeightedConf = (tf4h.confidence * 0.45 + tf1h.confidence * 0.35 + adxContribution);
  const trendConsistency = maxAligned === 2 ? 80 : 40;

  // ===== StochRSI features =====
  const defaultStochRsi: StochRsiFeatures = { k: 50, d: 50, signal: "neutral", prevK: 50, kArray: [] };
  const stoch1h: StochRsiFeatures = {
    k: tf1h.stochResult.k, d: tf1h.stochResult.d,
    signal: tf1h.stochResult.k > 80 ? "overbought" : tf1h.stochResult.k < 20 ? "oversold" : "neutral",
    prevK: tf1h.stochResult.k, kArray: [],
  };
  const stoch4h: StochRsiFeatures = {
    k: tf4h.stochResult.k, d: tf4h.stochResult.d,
    signal: tf4h.stochResult.k > 80 ? "overbought" : tf4h.stochResult.k < 20 ? "oversold" : "neutral",
    prevK: tf4h.stochResult.k, kArray: [],
  };

  // ===== Timeframe features =====
  const defaultTF: TimeframeFeatures = {
    trend: "neutral", confidence: 0, rsi: 50, emaSignal: "neutral",
    macd: 0, macdSignal: 0, macdHistogram: 0, macdTrend: "neutral",
  };
  const build_tf = (tf: TFIndicators): TimeframeFeatures => ({
    trend: tf.primaryTrend, confidence: tf.confidence, rsi: tf.rsi,
    emaSignal: tf.primaryTrend === 'bullish' ? 'bullish' : tf.primaryTrend === 'bearish' ? 'bearish' : 'neutral',
    macd: tf.macdResult.macd, macdSignal: tf.macdResult.signal,
    macdHistogram: tf.macdResult.histogram,
    macdTrend: Math.abs(tf.macdResult.histogram) > Math.abs(tf.macdResult.signal) * 0.5 ? "expanding" : "contracting",
  });

  // ===== Bollinger features =====
  const defaultBollinger: BollingerFeatures = {
    upper: 0, middle: 0, lower: 0, bandwidth: 0, percentB: 50,
    squeeze: false, squeezeIntensity: 0, pricePosition: "middle",
  };
  const primaryBollinger: BollingerFeatures = {
    upper: bbUpper, middle: sma, lower: bbLower,
    bandwidth, percentB, squeeze, squeezeIntensity: squeeze ? 70 : 0,
    pricePosition: percentB > 80 ? "upper" : percentB < 20 ? "lower" : "middle",
  };

  // ===== Volume features =====
  const defaultVolume: VolumeFeatures = {
    volumeRatio: 1.0, volumeTrend: "stable", volumeSpike: false, volumeDirection: "neutral",
  };
  const primaryVolume: VolumeFeatures = {
    volumeRatio: tf1h.volAnalysis.volumeRatio, volumeTrend: tf1h.volAnalysis.volumeTrend,
    volumeSpike: tf1h.volAnalysis.volumeSpike, volumeDirection: "neutral",
  };

  // ===== PRODUCTION REGIME CLASSIFICATION =====
  const derivedDir = tf1h.primaryTrend === 'bullish' ? 'long' : tf1h.primaryTrend === 'bearish' ? 'short' : 'neutral';
  const regimeResult = classify4StateRegime(
    tf1h.adxResult.adx,
    tf1h.adxResult.adxSlope ?? tf1h.adxResult.slope ?? 0,
    tf1h.primaryTrend,
    derivedMomentumState,
    momentumResult.score,
    tf4h.primaryTrend,  // real 4h trend
    tf1h.primaryTrend,  // 30m proxy (use 1h as fallback)
    derivedDir,
    tf4h.stochResult.k, // real 4h StochRSI K
    momentumResult.isExhausted,
    squeeze,
    maxAligned,
    Math.abs((tf1h.adxResult.plusDI || 0) - (tf1h.adxResult.minusDI || 0)),
    tf1h.atr > 0 ? tf1h.atr / (currentPrice * 0.015) : 1.0,
  );

  let barsOverbought = 0, barsOversold = 0;
  if (tf1h.stochResult.k >= 80) barsOverbought = 1;
  if (tf1h.stochResult.k <= 20) barsOversold = 1;
  const defaultBarsAtExtreme: BarsAtExtremeFeatures = { barsOverbought: 0, barsOversold: 0 };

  const mfs: MarketFeatureSnapshot = {
    symbol, currentPrice,
    timestamp: new Date().toISOString(),
    primaryTrend: tf1h.primaryTrend,
    confidence: tf1h.confidence,
    isAligned: maxAligned >= 2,
    trendConsistency,

    adx: tf1h.adxResult.adx,
    adxSlope: tf1h.adxResult.adxSlope ?? tf1h.adxResult.slope ?? 0,
    adxRising: tf1h.adxResult.adxRising,
    adxArray: tf1h.adxResult.adxArray || [],

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
      "1h": build_tf(tf1h), "4h": build_tf(tf4h),
    },

    bollinger: {
      "15m": defaultBollinger, "30m": defaultBollinger,
      "1h": primaryBollinger, "4h": defaultBollinger,
      squeezeActive: squeeze, squeezeBreakoutPotential: false,
    },

    volume: {
      "15m": defaultVolume, "30m": defaultVolume,
      "1h": primaryVolume, "4h": defaultVolume,
      confirmsDirection: volumeConfirms,
      hasRangeExpansion1h: tf1h.volAnalysis.volumeRatio > 1.5,
    },

    atr: tf1h.atr, atrPercent: tf1h.atrPercent,
    relativeATR: tf1h.atr > 0 ? tf1h.atr / (currentPrice * 0.015) : 1.0,
    historicalATRAvg: tf1h.atr,
    isCompressed: squeeze,
    volatilityNormal: tf1h.atrPercent < 3.0,
    isRanging: tf1h.primaryTrend === 'neutral',

    momentumState: derivedMomentumState,
    momentumScore: momentumResult.score,
    prevMomentumScore: momentumResult.score,
    momentumConfirms: derivedMomentumConfirms,
    macdExpanding,
    macdStrong: Math.abs(macdHist) > Math.abs(tf1h.macdResult.signal) * 0.5,
    macdHistogram: macdHist,
    macdDirectionAligned: (tf1h.primaryTrend === 'bullish' && macdHist > 0) || (tf1h.primaryTrend === 'bearish' && macdHist < 0),
    hasDivergence: false,
    volumeConfirms,
    adxRisingMomentum: tf1h.adxResult.adxRising,
    fakeBreakoutRisk: macdExpanding && !tf1h.adxResult.adxRising,
    genuineMomentum: tf1h.adxResult.adxRising && macdExpanding,
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
    prevMacdHistogram: macdHistPrev,
    squeezeJustReleased: false,

    distanceFromHighPercent: distFromHigh,
    distanceFromLowPercent: distFromLow,
    atrNormalizedFromHigh: tf1h.atr > 0 ? (high24h - currentPrice) / tf1h.atr : 0,
    atrNormalizedFromLow: tf1h.atr > 0 ? (currentPrice - low24h) / tf1h.atr : 0,
    high24h, low24h,

    priceChange4h: tf1h.closes.length > 4 ? ((currentPrice - tf1h.closes[tf1h.closes.length - 5]) / tf1h.closes[tf1h.closes.length - 5]) * 100 : 0,
    priceChange24h: tf1h.closes.length > 24 ? ((currentPrice - tf1h.closes[tf1h.closes.length - 25]) / tf1h.closes[tf1h.closes.length - 25]) * 100 : 0,

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
      isCurrentlyNeutral: tf1h.primaryTrend === 'neutral', durationMinutes: 0,
      confidenceBonus: 0, reason: "",
    },
    marketStructureValid: true, marketStructureConfidence: 50,
    trueAlignment: {
      score: trueAlignmentScore,
      tf4hConfidence: tf4h.confidence,
      tf1hConfidence: tf1h.confidence,
      adxContribution,
      totalWeightedConfidence: totalWeightedConf,
      neutralCapped: tf1h.primaryTrend === 'neutral',
      breakdown: { bullishCount, bearishCount, maxAligned },
      weightedComponents: {},
    },
    diPlus: tf1h.adxResult.plusDI || 0,
    diMinus: tf1h.adxResult.minusDI || 0,
    diSeparation: Math.abs((tf1h.adxResult.plusDI || 0) - (tf1h.adxResult.minusDI || 0)),
    priceActionMomentum: {
      hasStrongMove: false, direction: "neutral", movePercent: 0,
      isStrongMove: false, canOverrideNeutralAlignment: false,
    },
    // ===== PRODUCTION REGIME from classify4StateRegime =====
    regime: regimeResult.regime,
    volumeScore: 0, reversalScore: 0, volumeZScore: 0,
    lastCloseAlignsWithTrend: (tf1h.primaryTrend === 'bullish' && currentPrice > tf1h.ema9) || (tf1h.primaryTrend === 'bearish' && currentPrice < tf1h.ema9),
    momentumRsi: tf1h.rsi, trendAgeBars: 0,
    stochRsiHistory: { "1h": [], "4h": [] },
    klines15m: [], klines30m: [], klines5m: [], klines1m: [],
    volumeRatio: tf1h.volAnalysis.volumeRatio,
  };

  return mfs;
}

// ============= MAIN BACKTEST LOOP =============

async function runBacktest(
  config: BacktestConfig, userId: string, supabase: any, backtestId: string,
): Promise<void> {
  const startMs = Date.now();
  const trades: BacktestTrade[] = [];
  const equityCurve: EquityPoint[] = [];
  const gateStats: Record<string, number> = {};
  let equity = 10000;
  let peakEquity = equity;

  try {
    const startTime = new Date(config.startDate).getTime();
    const endTime = new Date(config.endDate).getTime();
    const barMs = config.barInterval === '4h' ? 4 * 60 * 60 * 1000 : 60 * 60 * 1000;
    const lookbackMs = 100 * barMs;

    for (const symbol of config.symbols) {
      logger.info(`${LOG_CATEGORIES.SUCCESS} Backtest: fetching multi-TF klines for ${symbol}`);

      // ===== FETCH REAL MULTI-TF KLINES =====
      const [allKlines1h, allKlines4h] = await Promise.all([
        fetchHistoricalKlines(symbol, '1h', startTime - lookbackMs, endTime),
        fetchHistoricalKlines(symbol, '4h', startTime - lookbackMs, endTime),
      ]);

      if (allKlines1h.length < 60) {
        logger.warn(`Insufficient 1h klines for ${symbol}: ${allKlines1h.length}`);
        continue;
      }
      logger.info(`${LOG_CATEGORIES.SUCCESS} Backtest: ${symbol} loaded ${allKlines1h.length} 1h bars, ${allKlines4h.length} 4h bars`);

      const parsed1h = parseKlinePrices(allKlines1h);

      // Pre-parse 4h klines
      const parsed4h = parseKlinePrices(allKlines4h);

      // Build 4h timestamp index for fast lookup
      const kline4hByTime = new Map<number, number>();
      for (let j = 0; j < allKlines4h.length; j++) {
        kline4hByTime.set(allKlines4h[j][0], j);
      }

      // Find start index for 1h bars
      let startIdx = 0;
      for (let i = 0; i < allKlines1h.length; i++) {
        if (allKlines1h[i][0] >= startTime) { startIdx = i; break; }
      }

      const openPositions: BacktestPosition[] = [];
      let lastTradeTime = 0;

      for (let i = startIdx; i < allKlines1h.length; i++) {
        const barTime = new Date(allKlines1h[i][0]).toISOString();
        const barTimeMs = allKlines1h[i][0];
        const currentPrice = parsed1h.closes[i];

        // 1h window slices
        const wCloses = parsed1h.closes.slice(0, i + 1);
        const wHighs = parsed1h.highs.slice(0, i + 1);
        const wLows = parsed1h.lows.slice(0, i + 1);
        const wVolumes = parsed1h.volumes.slice(0, i + 1);
        const wKlines = allKlines1h.slice(0, i + 1);

        // Find corresponding 4h window: all 4h bars with openTime <= current 1h bar openTime
        let idx4h = 0;
        for (let j = allKlines4h.length - 1; j >= 0; j--) {
          if (allKlines4h[j][0] <= barTimeMs) { idx4h = j + 1; break; }
        }
        const w4hCloses = parsed4h.closes.slice(0, idx4h);
        const w4hHighs = parsed4h.highs.slice(0, idx4h);
        const w4hLows = parsed4h.lows.slice(0, idx4h);
        const w4hVolumes = parsed4h.volumes.slice(0, idx4h);
        const w4hKlines = allKlines4h.slice(0, idx4h);

        // Compute 1h indicators for exit checks
        const atr = wCloses.length > 14 ? calculateATR(wHighs, wLows, wCloses, 14) : currentPrice * 0.015;
        const atrPercent = (atr / currentPrice) * 100;
        const adxResult = wKlines.length > 30
          ? calculateADXWithDirection(wKlines, 14)
          : { adx: 15, slope: 0, adxSlope: 0, adxRising: false, plusDI: 0, minusDI: 0, diGap: 0, prevDiGap: 0, adxArray: [], prevAdx: 15, adxPeaked: false, adxSlopeSmoothed: 0 };

        // ===== CHECK EXITS ON OPEN POSITIONS =====
        for (let p = openPositions.length - 1; p >= 0; p--) {
          const pos = openPositions[p];
          const momResult = wCloses.length > 50
            ? calculateMomentumScore(wKlines, wCloses, adxResult.adx, adxResult.adxRising, atr, adxResult.adxSlope ?? 0)
            : { score: 0, direction: "neutral" as const, phase: "neutral" as const, isAccelerating: false, isWeakening: false, isExhausted: false, isTransitioning: false, microExhaustion: { detected: false, score: 0, signals: [], momentumDeceleration: false, accelerationFlip: false, priceDivergence: false, volumeDryUp: false, rsiDivergence: false, recommendation: "hold" as const, positionMultiplier: 1.0 }, components: { emaSpreadRoC: 0, rsiMomentum: 0, macdSlope: 0, adxTrend: 0, transitionBonus: 0, priceImpulse: 0 }, overextensionATR: 0, reasons: [] };

          const ema21 = calculateEMA(wCloses, 21);
          const primaryTrend = currentPrice > ema21 ? 'bullish' : 'bearish';

          // ===== SHARED EXIT PIPELINE =====
          const exitResult = checkProductionExits(
            pos, currentPrice, barTime, atr, atrPercent,
            adxResult.adx, adxResult.adxSlope ?? 0, primaryTrend, momResult.score,
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
              adx: pos.entryAdx, stochK: pos.entryStochK, strategyName: pos.strategyName,
              regime: '', // captured at entry
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

        if (!hasOpenPos && cooldownPassed && wCloses.length > 50 && w4hCloses.length > 20) {
          // Compute indicators per timeframe
          const tf1h = computeTFIndicators(wCloses, wHighs, wLows, wVolumes, wKlines);
          const tf4h = computeTFIndicators(w4hCloses, w4hHighs, w4hLows, w4hVolumes, w4hKlines);

          // Momentum score (from 1h klines — production standard)
          const momResult = calculateMomentumScore(wKlines, wCloses, tf1h.adxResult.adx, tf1h.adxResult.adxRising, tf1h.atr, tf1h.adxResult.adxSlope ?? 0);

          // Build production-parity MFS with real multi-TF data + classify4StateRegime
          const mfs = buildBacktestMFS(symbol, tf1h, tf4h, momResult);

          // ===== SHARED GATE PIPELINE =====
          const gateResult = evaluateProductionGates(mfs, momResult, symbol, wKlines);

          if (gateResult.gate) {
            gateStats[gateResult.gate] = (gateStats[gateResult.gate] || 0) + 1;
          }

          if (gateResult.passed && gateResult.direction) {
            // Strategy routing
            const isBtcShortRouting = BTC_PARAMS.symbols.includes(symbol) &&
              gateResult.direction === 'SHORT' &&
              BTC_PARAMS.shortStrategyRouting.enabled;

            if (isBtcShortRouting) {
              if (!BTC_PARAMS.shortStrategyRouting.enabledStrategies.includes(gateResult.strategyName)) {
                gateStats[`BTC_SHORT_ROUTING_${gateResult.strategyName}_BLOCKED`] = (gateStats[`BTC_SHORT_ROUTING_${gateResult.strategyName}_BLOCKED`] || 0) + 1;
                continue;
              }
            }

            // ATR-based SL/TP
            const symP = getSymbolParams(symbol);
            const slMultiplier = symP.stopLoss.atrMultiplier;
            const tpMultiplier = symP.takeProfit.atrMultiplier;
            const maxSlPercent = symP.stopLoss.maxCapPercent;
            const dir = gateResult.direction;
            const atrStop = tf1h.atr * slMultiplier;
            const maxStop = currentPrice * (maxSlPercent / 100);
            const effectiveStop = Math.min(atrStop, maxStop);
            let stopLoss: number, takeProfit: number;
            if (dir === 'LONG') {
              stopLoss = currentPrice - effectiveStop;
              takeProfit = currentPrice + (tf1h.atr * tpMultiplier);
            } else {
              stopLoss = currentPrice + effectiveStop;
              takeProfit = currentPrice - (tf1h.atr * tpMultiplier);
            }

            openPositions.push({
              symbol, side: dir,
              entryPrice: currentPrice, entryTime: barTime,
              stopLoss, takeProfit,
              peakPnl: 0, peakReachedAt: barTime,
              trailingStop: null,
              entryScore: gateResult.qualityScore,
              qualityScore: gateResult.qualityScore,
              atrAtEntry: tf1h.atrPercent,
              atrPercentAtEntry: tf1h.atrPercent,
              strategyName: gateResult.strategyName,
              entryMomentumScore: gateResult.momentumScore,
              entryStochK: mfs.stochRsi["1h"].k,
              entryAdx: mfs.adx,
            });

            // Log regime in the last trade when it closes
            logger.info(`${LOG_CATEGORIES.SUCCESS} Backtest ENTRY: ${symbol} ${dir} @ ${currentPrice} | regime=${mfs.regime} strategy=${gateResult.strategyName} ADX=${mfs.adx.toFixed(1)} mom=${gateResult.momentumScore}`);
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
          adx: pos.entryAdx, stochK: pos.entryStochK, strategyName: pos.strategyName,
          regime: '',
        });
        const positionSize = equity * 0.015;
        equity += positionSize * (pnl.netPnlPercent / 100);
      }
      openPositions.length = 0;
    }

    // Summary
    const winningTrades = trades.filter(t => t.netPnlPercent > 0);
    const losingTrades = trades.filter(t => t.netPnlPercent <= 0);
    const winRate = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0;
    const avgWin = winningTrades.length > 0 ? winningTrades.reduce((s, t) => s + t.netPnlPercent, 0) / winningTrades.length : 0;
    const avgLoss = losingTrades.length > 0 ? Math.abs(losingTrades.reduce((s, t) => s + t.netPnlPercent, 0) / losingTrades.length) : 0;
    const profitFactor = avgLoss > 0 ? (avgWin * winningTrades.length) / (avgLoss * losingTrades.length) : winningTrades.length > 0 ? Infinity : 0;
    const maxDrawdown = equityCurve.length > 0 ? Math.max(...equityCurve.map(e => e.drawdown)) : 0;
    const totalReturn = ((equity - 10000) / 10000) * 100;

    const exitBreakdown: Record<string, number> = {};
    for (const t of trades) exitBreakdown[t.exitReason] = (exitBreakdown[t.exitReason] || 0) + 1;

    // Strategy & regime breakdown
    const strategyBreakdown: Record<string, { count: number; wins: number; totalPnl: number }> = {};
    for (const t of trades) {
      if (!strategyBreakdown[t.strategyName]) strategyBreakdown[t.strategyName] = { count: 0, wins: 0, totalPnl: 0 };
      strategyBreakdown[t.strategyName].count++;
      if (t.netPnlPercent > 0) strategyBreakdown[t.strategyName].wins++;
      strategyBreakdown[t.strategyName].totalPnl += t.netPnlPercent;
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
      finalEquity: Math.round(equity * 100) / 100,
      exitBreakdown,
      strategyBreakdown,
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

    logger.info(`${LOG_CATEGORIES.SUCCESS} Backtest completed: ${trades.length} trades, ${winRate.toFixed(1)}% WR, PF=${summary.profitFactor}, ${totalReturn.toFixed(2)}% return in ${durationMs}ms`);

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
