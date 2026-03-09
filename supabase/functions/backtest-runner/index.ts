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
  ADX_THRESHOLDS, ADX_GATE, STOCHRSI_THRESHOLDS,
  QUALITY_THRESHOLDS, TRADING_FEE_PARAMS,
  NEAR_EXTREME_PROTECTION_GATE, MOVE_EXHAUSTION_FILTER_PARAMS,
  MOMENTUM_SCORE_COMPONENTS,
  getSymbolParams, BTC_PARAMS, ALTCOIN_PARAMS,
} from "../_shared/constants.ts";
import { calculateFeeAwarePnL, evaluateDecayVelocity, evaluateProgressiveProfitLock,
  evaluateMicroProfitLock, type PositionContext, type MarketContext, type UserExitSettings
} from "../_shared/exit-strategies.ts";
import { calculateMomentumScore, type MomentumScoreResult } from "../_shared/smart-momentum.ts";
import { calculateQualityScore } from "../_shared/scoring.ts";
import type { MarketFeatureSnapshot, StochRsiFeatures, BollingerFeatures, VolumeFeatures,
  TimeframeFeatures, BarsAtExtremeFeatures, StochRsiAggregated
} from "../_shared/market-feature-snapshot.ts";

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
  barInterval: string; // '1h' or '4h'
  sideFilter?: 'LONG' | 'SHORT' | null; // Filter to only take one side
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
}

interface BacktestPosition {
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  entryTime: string;
  stopLoss: number;
  takeProfit: number;
  peakPnl: number;
  peakReachedAt: string;
  trailingStop: number | null;
  entryScore: number;
  qualityScore: number;
  atrAtEntry: number;
  atrPercentAtEntry: number;
  strategyName: string;
  entryMomentumScore: number;
  entryStochK: number;
  entryAdx: number;
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

// ============= BUILD LITE MFS FROM RAW KLINES =============
// Constructs a MarketFeatureSnapshot using the same indicator functions as production.
// Uses 1h klines as primary timeframe.

function buildBacktestMFS(
  symbol: string,
  closes: number[], highs: number[], lows: number[], volumes: number[],
  klines: any[],
  momentumResult: MomentumScoreResult,
  adxResult: ADXResult,
): MarketFeatureSnapshot {
  const currentPrice = closes[closes.length - 1];
  const atr = calculateATR(highs, lows, closes, 14);
  const atrPercent = atr > 0 && currentPrice > 0 ? (atr / currentPrice) * 100 : 1.5;
  const rsi = calculateRSI(closes, 14);
  
  // StochRSI
  const stochResult = calculateStochasticRSI(closes, 14, 14, 3, 3);
  
  // MACD
  const macdResult = calculateMACD(closes);
  
  // EMA
  const ema9 = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);
  const ema50 = calculateEMA(closes, 50);
  
  // Volume analysis
  const volAnalysis = calculateVolumeAnalysis(klines);
  
  // Determine primary trend from EMA alignment
  const emaBullish = ema9 > ema21 && ema21 > ema50;
  const emaBearish = ema9 < ema21 && ema21 < ema50;
  const primaryTrend = emaBullish ? 'bullish' : emaBearish ? 'bearish' : 'neutral';
  
  // Confidence from alignment strength
  const emaSpread = Math.abs((ema9 - ema21) / ema21) * 100;
  const confidence = Math.min(80, 40 + emaSpread * 10);
  
  // Bollinger Bands (simple calculation)
  const period = 20;
  const recentCloses = closes.slice(-period);
  const sma = recentCloses.reduce((s, c) => s + c, 0) / recentCloses.length;
  const variance = recentCloses.reduce((s, c) => s + (c - sma) ** 2, 0) / recentCloses.length;
  const stdDev = Math.sqrt(variance);
  const bbUpper = sma + 2 * stdDev;
  const bbLower = sma - 2 * stdDev;
  const bbWidth = bbUpper - bbLower;
  const percentB = bbWidth > 0 ? ((currentPrice - bbLower) / bbWidth) * 100 : 50;
  const bandwidth = sma > 0 ? (bbWidth / sma) * 100 : 0;
  const squeeze = bandwidth < 4; // Simple squeeze detection
  
  // 24h high/low
  const lookback24h = Math.min(24, closes.length);
  const recent24h = closes.slice(-lookback24h);
  const recentHighs24h = highs.slice(-lookback24h);
  const recentLows24h = lows.slice(-lookback24h);
  const high24h = Math.max(...recentHighs24h);
  const low24h = Math.min(...recentLows24h);
  const distFromHigh = high24h > 0 ? ((high24h - currentPrice) / high24h) * 100 : 0;
  const distFromLow = low24h > 0 ? ((currentPrice - low24h) / low24h) * 100 : 0;
  
  // MACD direction
  const macdHist = macdResult.histogram;
  const macdHistPrev = macdResult.histogramArray?.length > 1 
    ? macdResult.histogramArray[macdResult.histogramArray.length - 2] : 0;
  const macdExpanding = Math.abs(macdHist) > Math.abs(macdHistPrev);
  
  // Volume confirms direction
  const volumeConfirms = volAnalysis.volumeRatio > 1.2;
  
  // Default features for non-primary timeframes
  const defaultStochRsi: StochRsiFeatures = { k: 50, d: 50, signal: "neutral", prevK: 50, kArray: [] };
  const defaultBollinger: BollingerFeatures = {
    upper: 0, middle: 0, lower: 0, bandwidth: 0, percentB: 50,
    squeeze: false, squeezeIntensity: 0, pricePosition: "middle",
  };
  const defaultVolume: VolumeFeatures = {
    volumeRatio: 1.0, volumeTrend: "stable", volumeSpike: false, volumeDirection: "neutral",
  };
  const defaultTimeframe: TimeframeFeatures = {
    trend: "neutral", confidence: 0, rsi: 50, emaSignal: "neutral",
    macd: 0, macdSignal: 0, macdHistogram: 0, macdTrend: "neutral",
  };
  const defaultBarsAtExtreme: BarsAtExtremeFeatures = { barsOverbought: 0, barsOversold: 0 };

  // Build primary (1h) timeframe features
  const primaryStochRsi: StochRsiFeatures = {
    k: stochResult.k, d: stochResult.d,
    signal: stochResult.k > 80 ? "overbought" : stochResult.k < 20 ? "oversold" : "neutral",
    prevK: stochResult.k, kArray: [],
  };
  const primaryTF: TimeframeFeatures = {
    trend: primaryTrend, confidence,
    rsi, emaSignal: emaBullish ? "bullish" : emaBearish ? "bearish" : "neutral",
    macd: macdResult.macd, macdSignal: macdResult.signal,
    macdHistogram: macdHist, macdTrend: macdExpanding ? "expanding" : "contracting",
  };
  const primaryBollinger: BollingerFeatures = {
    upper: bbUpper, middle: sma, lower: bbLower,
    bandwidth, percentB, squeeze, squeezeIntensity: squeeze ? 70 : 0,
    pricePosition: percentB > 80 ? "upper" : percentB < 20 ? "lower" : "middle",
  };
  const primaryVolume: VolumeFeatures = {
    volumeRatio: volAnalysis.volumeRatio,
    volumeTrend: volAnalysis.volumeTrend,
    volumeSpike: volAnalysis.volumeSpike,
    volumeDirection: "neutral",
  };

  // Count bars at extreme
  let barsOverbought = 0, barsOversold = 0;
  if (stochResult.k >= 80) barsOverbought = 1;
  if (stochResult.k <= 20) barsOversold = 1;

  // ===== FIX #1: Rich momentum state mapping (production-accurate) =====
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

  // ===== FIX #2: Lower momentumConfirms threshold =====
  const derivedMomentumConfirms = Math.abs(momentumResult.score) >= 8 && momentumResult.direction !== "neutral";

  // ===== FIX #3: Simulated multi-TF from sub-sampling =====
  const closes4hProxy = closes.filter((_, idx) => idx % 4 === 0);
  let trend4h = primaryTrend;
  let confidence4h = confidence;
  if (closes4hProxy.length > 50) {
    const ema9_4h = calculateEMA(closes4hProxy, 9);
    const ema21_4h = calculateEMA(closes4hProxy, 21);
    const ema50_4h = calculateEMA(closes4hProxy, 50);
    const bullish4h = ema9_4h > ema21_4h && ema21_4h > ema50_4h;
    const bearish4h = ema9_4h < ema21_4h && ema21_4h < ema50_4h;
    trend4h = bullish4h ? 'bullish' : bearish4h ? 'bearish' : 'neutral';
    const spread4h = Math.abs((ema9_4h - ema21_4h) / ema21_4h) * 100;
    confidence4h = Math.min(80, 40 + spread4h * 8);
  }
  const closes30mProxy = closes.filter((_, idx) => idx % 2 === 0);
  let trend30m = primaryTrend;
  if (closes30mProxy.length > 50) {
    const ema9_30m = calculateEMA(closes30mProxy, 9);
    const ema21_30m = calculateEMA(closes30mProxy, 21);
    trend30m = ema9_30m > ema21_30m ? 'bullish' : ema9_30m < ema21_30m ? 'bearish' : 'neutral';
  }

  // ===== FIX #4: Proper trueAlignment scoring =====
  const alignedTFs = [trend4h, primaryTrend, trend30m];
  const bullishCount = alignedTFs.filter(t => t === 'bullish').length;
  const bearishCount = alignedTFs.filter(t => t === 'bearish').length;
  const maxAligned = Math.max(bullishCount, bearishCount);
  const trueAlignmentScore = maxAligned === 3 ? 85 : maxAligned === 2 ? 60 : adxResult.adx >= 25 ? 45 : 25;
  const adxContribution = adxResult.adx >= 35 ? 20 : adxResult.adx >= 25 ? 15 : adxResult.adx >= 20 ? 10 : 5;
  const totalWeightedConf = (confidence4h * 0.4 + confidence * 0.35 + (trend30m !== 'neutral' ? 60 : 30) * 0.25);
  const trendConsistency = maxAligned === 3 ? 80 : maxAligned === 2 ? 60 : 35;

  const tf4h: TimeframeFeatures = {
    trend: trend4h, confidence: confidence4h, rsi,
    emaSignal: trend4h === 'bullish' ? 'bullish' : trend4h === 'bearish' ? 'bearish' : 'neutral',
    macd: macdResult.macd, macdSignal: macdResult.signal,
    macdHistogram: macdHist, macdTrend: macdExpanding ? "expanding" : "contracting",
  };
  const tf30m: TimeframeFeatures = {
    trend: trend30m, confidence: trend30m !== 'neutral' ? 55 : 30, rsi,
    emaSignal: trend30m === 'bullish' ? 'bullish' : trend30m === 'bearish' ? 'bearish' : 'neutral',
    macd: 0, macdSignal: 0, macdHistogram: 0, macdTrend: "neutral",
  };

  const mfs: MarketFeatureSnapshot = {
    symbol, currentPrice,
    timestamp: new Date().toISOString(),
    primaryTrend, confidence,
    isAligned: (maxAligned >= 2),
    trendConsistency,

    adx: adxResult.adx, adxSlope: adxResult.adxSlope ?? adxResult.slope ?? 0,
    adxRising: adxResult.adxRising,
    adxArray: adxResult.adxArray || [],
    
    stochRsi: {
      "15m": defaultStochRsi, "30m": defaultStochRsi,
      "1h": primaryStochRsi,
      "4h": primaryStochRsi, // Use 1h as proxy for 4h in backtest
    },
    stochRsiAggregated: { bearishCrossCount: 0, bullishCrossCount: 0, overboughtCount: 0, oversoldCount: 0 },
    barsAtExtreme: {
      "1h": { barsOverbought, barsOversold },
      "4h": { barsOverbought: 0, barsOversold: 0 },
    },
    
    timeframes: {
      "15m": defaultTimeframe,
      "30m": tf30m,
      "1h": primaryTF,
      "4h": tf4h,
    },
    
    bollinger: {
      "15m": defaultBollinger, "30m": defaultBollinger,
      "1h": primaryBollinger, "4h": primaryBollinger,
      squeezeActive: squeeze, squeezeBreakoutPotential: false,
    },
    
    volume: {
      "15m": defaultVolume, "30m": defaultVolume,
      "1h": primaryVolume, "4h": defaultVolume,
      confirmsDirection: volumeConfirms,
      hasRangeExpansion1h: volAnalysis.volumeRatio > 1.5,
    },
    
    atr, atrPercent, relativeATR: 1.0, historicalATRAvg: atr,
    isCompressed: squeeze, volatilityNormal: atrPercent < 3.0, isRanging: !emaBullish && !emaBearish,
    
    momentumState: derivedMomentumState,
    momentumScore: momentumResult.score,
    prevMomentumScore: momentumResult.score,
    momentumConfirms: derivedMomentumConfirms,
    macdExpanding, macdStrong: Math.abs(macdHist) > Math.abs(macdResult.signal) * 0.5,
    macdHistogram: macdHist,
    macdDirectionAligned: (primaryTrend === 'bullish' && macdHist > 0) || (primaryTrend === 'bearish' && macdHist < 0),
    hasDivergence: false, volumeConfirms,
    adxRisingMomentum: adxResult.adxRising,
    fakeBreakoutRisk: macdExpanding && !adxResult.adxRising,
    genuineMomentum: adxResult.adxRising && macdExpanding,
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
    
    directionStableBars: 0, momentumDirection: momentumResult.direction,
    prevMacdHistogram: macdHistPrev, squeezeJustReleased: false,
    
    distanceFromHighPercent: distFromHigh, distanceFromLowPercent: distFromLow,
    atrNormalizedFromHigh: atr > 0 ? (high24h - currentPrice) / atr : 0,
    atrNormalizedFromLow: atr > 0 ? (currentPrice - low24h) / atr : 0,
    high24h, low24h,
    
    priceChange4h: closes.length > 4 ? ((currentPrice - closes[closes.length - 5]) / closes[closes.length - 5]) * 100 : 0,
    priceChange24h: closes.length > 24 ? ((currentPrice - closes[closes.length - 25]) / closes[closes.length - 25]) * 100 : 0,
    
    vwapValue: sma, vwapDistancePercent: sma > 0 ? ((currentPrice - sma) / sma) * 100 : 0,
    
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
      isCurrentlyNeutral: primaryTrend === 'neutral', durationMinutes: 0,
      confidenceBonus: 0, reason: "",
    },
    marketStructureValid: true, marketStructureConfidence: 50,
    trueAlignment: {
      score: trueAlignmentScore,
      tf4hConfidence: confidence4h, tf1hConfidence: confidence,
      adxContribution,
      totalWeightedConfidence: totalWeightedConf,
      neutralCapped: primaryTrend === 'neutral',
      breakdown: { bullishCount, bearishCount, maxAligned },
      weightedComponents: {},
    },
    diPlus: adxResult.plusDI || 0, diMinus: adxResult.minusDI || 0,
    diSeparation: Math.abs((adxResult.plusDI || 0) - (adxResult.minusDI || 0)),
    priceActionMomentum: {
      hasStrongMove: false, direction: "neutral", movePercent: 0,
      isStrongMove: false, canOverrideNeutralAlignment: false,
    },
    regime: squeeze ? 'RANGE_COMPRESSION' : adxResult.adx > 30 ? 'TREND_EXPANSION' : 'RANGING',
    volumeScore: 0, reversalScore: 0, volumeZScore: 0,
    lastCloseAlignsWithTrend: (primaryTrend === 'bullish' && currentPrice > ema9) || (primaryTrend === 'bearish' && currentPrice < ema9),
    momentumRsi: rsi, trendAgeBars: 0,
    stochRsiHistory: { "1h": [], "4h": [] },
    klines15m: [], klines30m: [], klines5m: [], klines1m: [],
    volumeRatio: volAnalysis.volumeRatio,
  };
  
  return mfs;
}

// ============= PRODUCTION GATE PIPELINE =============

interface GateResult {
  passed: boolean;
  gate: string | null;
  direction: 'LONG' | 'SHORT' | null;
  qualityScore: number;
  momentumScore: number;
  positionMultiplier: number;
  strategyName: string;
}

function evaluateProductionGates(
  mfs: MarketFeatureSnapshot,
  momentumResult: MomentumScoreResult,
  symbol?: string,
): GateResult {
  const sp = getSymbolParams(symbol || mfs.symbol);
  const fail = (gate: string): GateResult => ({
    passed: false, gate, direction: null, qualityScore: 0,
    momentumScore: momentumResult.score, positionMultiplier: 0, strategyName: '',
  });

  const adx = mfs.adx;
  const adxSlope = mfs.adxSlope;
  const stochK = mfs.stochRsi["1h"].k;
  const primaryTrend = mfs.primaryTrend;

  // ===== GATE 1: ADX Hard Floor (production ADX_GATE) =====
  if (adx < ADX_GATE.HARD_FLOOR) {
    return fail('ADX_HARD_FLOOR');
  }

  // ===== GATE 2: ADX Graduated Tiers =====
  let adxPositionMultiplier = 1.0;
  if (adx < ADX_THRESHOLDS.MINIMUM) {
    if (ADX_GATE.GRADUATED_TIERS.ENABLED && adxSlope > 0) {
      // Early transition probe
      adxPositionMultiplier = ADX_GATE.GRADUATED_TIERS.EARLY_TRANSITION.POSITION_MULTIPLIER;
    } else if (adxSlope > -0.5 && adx >= 18) {
      // RELAXED: Allow flat/slightly declining slope at ADX 18-20 with reduced size
      adxPositionMultiplier = 0.30;
    } else {
      return fail('ADX_TOO_LOW');
    }
  } else if (adx < ADX_THRESHOLDS.MODERATE) {
    if (adxSlope > 0) {
      adxPositionMultiplier = ADX_GATE.GRADUATED_TIERS.FORMING_TREND?.POSITION_MULTIPLIER ?? 0.50;
    } else {
      adxPositionMultiplier = 0.35;
    }
  }

  // ===== GATE 3: Deep StochRSI Extremes — OPTIMIZED: ADX-aware relaxation =====
  if (stochK < STOCHRSI_THRESHOLDS.HIGH_REVERSAL_OVERSOLD || stochK > STOCHRSI_THRESHOLDS.HIGH_REVERSAL_OVERBOUGHT) {
    // Strong Trend Tier0 Override — expanded from EXTREME to VERY_STRONG
    if (adx >= ADX_THRESHOLDS.VERY_STRONG) {
      adxPositionMultiplier = Math.min(adxPositionMultiplier, 0.30);
    } else if (adx >= ADX_THRESHOLDS.STRONG && adxSlope > 0.2) {
      // NEW: Allow with reduced sizing when trend is building
      adxPositionMultiplier = Math.min(adxPositionMultiplier, 0.25);
    } else {
      return fail('DEEP_STOCHRSI_EXTREME');
    }
  }

  // ===== GATE 4: Determine Direction — OPTIMIZED: relaxed thresholds =====
  let direction: 'LONG' | 'SHORT' | null = null;
  const emaBullish = primaryTrend === 'bullish';
  const emaBearish = primaryTrend === 'bearish';
  
  if (emaBullish && momentumResult.score > 0) {
    direction = 'LONG';
  } else if (emaBearish && momentumResult.score < 0) {
    direction = 'SHORT';
  } else if (momentumResult.score > 10 && adx > ADX_THRESHOLDS.STRONG) {
    // RELAXED: from >15 to >10 — allows moderate momentum with strong ADX
    direction = 'LONG';
  } else if (momentumResult.score < -10 && adx > ADX_THRESHOLDS.STRONG) {
    direction = 'SHORT';
  } else if (adx >= ADX_THRESHOLDS.VERY_STRONG && adxSlope > 0.3) {
    // Strong structural trend can derive direction from DI
    const diPlus = mfs.diPlus || 0;
    const diMinus = mfs.diMinus || 0;
    if (diPlus > diMinus + 5) direction = 'LONG';
    else if (diMinus > diPlus + 5) direction = 'SHORT';
  } else if (adx >= ADX_THRESHOLDS.MODERATE && adxSlope > 0.2) {
    // NEW: Rising ADX with moderate momentum can derive direction
    if (momentumResult.score > 5) direction = 'LONG';
    else if (momentumResult.score < -5) direction = 'SHORT';
  }
  
  if (!direction) {
    return fail('NO_DIRECTION');
  }

  // ===== GATE 5: Counter-Trend Protection (production) =====
  if (direction === 'LONG' && emaBearish && adx > ADX_THRESHOLDS.EXCEPTIONAL) {
    return fail('COUNTER_TREND');
  }
  if (direction === 'SHORT' && emaBullish && adx > ADX_THRESHOLDS.EXCEPTIONAL) {
    return fail('COUNTER_TREND');
  }

  // ===== GATE 5.5: StochRSI Directional Protection — SYMBOL-ADAPTIVE =====
  const obThreshold = sp.gates.STOCHRSI_LONG_OVERBOUGHT;
  const osThreshold = sp.gates.STOCHRSI_SHORT_OVERSOLD;
  if (direction === 'SHORT' && stochK > obThreshold) {
    if (adx < ADX_THRESHOLDS.VERY_STRONG) {
      return fail('STOCHRSI_DIRECTIONAL_BLOCK');
    }
    adxPositionMultiplier = Math.min(adxPositionMultiplier, 0.20);
  }
  if (direction === 'LONG' && stochK < osThreshold) {
    if (adx < ADX_THRESHOLDS.VERY_STRONG) {
      return fail('STOCHRSI_DIRECTIONAL_BLOCK');
    }
    adxPositionMultiplier = Math.min(adxPositionMultiplier, 0.20);
  }

  // ===== GATE 5.6: Overbought LONG / Oversold SHORT Block — SYMBOL-ADAPTIVE =====
  if (direction === 'LONG' && stochK > obThreshold && adx < ADX_THRESHOLDS.VERY_STRONG) {
    return fail('OVERBOUGHT_LONG_BLOCK');
  }
  if (direction === 'SHORT' && stochK < osThreshold && adx < ADX_THRESHOLDS.VERY_STRONG) {
    return fail('OVERSOLD_SHORT_BLOCK');
  }

  // ===== GATE 6: Momentum Direction Alignment — SYMBOL-ADAPTIVE =====
  const momOpposingThreshold = sp.gates.MOMENTUM_OPPOSING_THRESHOLD;
  if (direction === 'LONG' && momentumResult.score < -momOpposingThreshold) {
    if (adx >= ADX_THRESHOLDS.VERY_STRONG && adxSlope >= 0.3) {
      adxPositionMultiplier = Math.min(adxPositionMultiplier, 0.25);
    } else {
      return fail('MOMENTUM_OPPOSING');
    }
  }
  if (direction === 'SHORT' && momentumResult.score > momOpposingThreshold) {
    if (adx >= ADX_THRESHOLDS.VERY_STRONG && adxSlope >= 0.3) {
      adxPositionMultiplier = Math.min(adxPositionMultiplier, 0.25);
    } else {
      return fail('MOMENTUM_OPPOSING');
    }
  }

  // ===== GATE 7: StochRSI Oversold/Overbought Protection =====
  if (direction === 'SHORT' && stochK < STOCHRSI_THRESHOLDS.EXTREME_OVERSOLD) {
    if (adx < ADX_THRESHOLDS.EXTREME) {
      return fail('SEVERE_OVERSOLD_BLOCK');
    }
  }
  if (direction === 'LONG' && stochK > STOCHRSI_THRESHOLDS.EXTREME_OVERBOUGHT) {
    if (adx < ADX_THRESHOLDS.EXTREME) {
      return fail('SEVERE_OVERBOUGHT_BLOCK');
    }
  }

  // ===== GATE 8: Near-Extreme Protection (24h high/low proximity) — RELAXED =====
  if (direction === 'SHORT' && mfs.distanceFromLowPercent < 0.5) {
    if (adx < ADX_THRESHOLDS.STRONG || adxSlope > 0) {
      return fail('NEAR_24H_LOW');
    }
    adxPositionMultiplier = Math.min(adxPositionMultiplier, 0.25);
  } else if (direction === 'SHORT' && mfs.distanceFromLowPercent < 0.8) {
    // Graduated: 0.5-0.8% range gets reduced position instead of block
    adxPositionMultiplier = Math.min(adxPositionMultiplier, 0.40);
  }
  if (direction === 'LONG' && mfs.distanceFromHighPercent < 0.5) {
    if (adx < ADX_THRESHOLDS.STRONG || adxSlope > 0) {
      return fail('NEAR_24H_HIGH');
    }
    adxPositionMultiplier = Math.min(adxPositionMultiplier, 0.25);
  } else if (direction === 'LONG' && mfs.distanceFromHighPercent < 0.8) {
    adxPositionMultiplier = Math.min(adxPositionMultiplier, 0.40);
  }

  // ===== GATE 9: Overextension ATR Block =====
  if (momentumResult.overextensionATR > 2.0) {
    if (!(adx >= ADX_THRESHOLDS.VERY_STRONG && adxSlope >= 0.3)) {
      return fail('OVEREXTENSION_ATR');
    }
    adxPositionMultiplier = Math.min(adxPositionMultiplier, 0.20);
  }

  // ===== GATE 10: Quality Score (production calculateQualityScore) =====
  const effectiveTrend = direction === 'LONG' ? 'bullish' : 'bearish';
  const qualityResult = calculateQualityScore(mfs, effectiveTrend, mfs.symbol);
  const qualityScore = qualityResult.score;

  // Hard floor — SYMBOL-ADAPTIVE quality minimum
  if (qualityScore < sp.gates.MIN_QUALITY_SCORE) {
    return fail('LOW_QUALITY_HARD_FLOOR');
  }

  if (qualityScore < QUALITY_THRESHOLDS.MIN_ENTRY_QUALITY) {
    return fail('LOW_QUALITY');
  }

  // ===== GATE 11: Momentum Slope Gate (priority 1 in production) =====
  if (momentumResult.isAccelerating) {
    // Momentum accelerating in opposing direction
    if ((direction === 'LONG' && momentumResult.direction === 'bearish') ||
        (direction === 'SHORT' && momentumResult.direction === 'bullish')) {
      return fail('MOMENTUM_SLOPE_OPPOSING');
    }
  }

  // ===== GATE 12: ADX Slope Decay Penalty =====
  if (adxSlope < -2.0 && adx < ADX_THRESHOLDS.STRONG) {
    return fail('ADX_STRUCTURAL_COLLAPSE');
  }
  if (adxSlope < -1.0) {
    adxPositionMultiplier = Math.min(adxPositionMultiplier, 0.40);
  } else if (adxSlope < -0.2) {
    adxPositionMultiplier = Math.min(adxPositionMultiplier, 0.80);
  }

  // Strategy name based on conditions
  let strategyName = 'TREND_CONTINUATION';
  if (adx > ADX_THRESHOLDS.VERY_STRONG) strategyName = 'STRONG_TREND';
  if (momentumResult.isAccelerating) strategyName = 'MOMENTUM_ACCELERATION';
  if (mfs.isCompressed) {
    // SQUEEZE_BREAKOUT requires directional confirmation: MACD expanding in trade direction
    const macdHist = mfs.macdHistogram;
    const squeezeDirConfirmed = (direction === 'LONG' && macdHist > 0 && mfs.macdExpanding) ||
                                 (direction === 'SHORT' && macdHist < 0 && mfs.macdExpanding);
    // RELAXED: Also allow squeeze with MACD direction match (even without expansion) at strong ADX
    const squeezeDirPartial = (direction === 'LONG' && macdHist > 0) ||
                               (direction === 'SHORT' && macdHist < 0);
    if (squeezeDirConfirmed) {
      strategyName = 'SQUEEZE_BREAKOUT';
    } else if (squeezeDirPartial && adx >= ADX_THRESHOLDS.MODERATE && adxSlope > 0) {
      // Partial confirmation: MACD direction matches but not yet expanding
      strategyName = 'SQUEEZE_BREAKOUT';
      adxPositionMultiplier = Math.min(adxPositionMultiplier, 0.40);
    } else {
      // No direction confirmation after squeeze — block entry
      return fail('SQUEEZE_NO_DIRECTION');
    }
  }

  return {
    passed: true,
    gate: null,
    direction,
    qualityScore,
    momentumScore: momentumResult.score,
    positionMultiplier: adxPositionMultiplier,
    strategyName,
  };
}

// ============= PRODUCTION EXIT LOGIC =============

function checkProductionExits(
  position: BacktestPosition,
  currentPrice: number,
  currentTime: string,
  atr: number,
  atrPercent: number,
  adx: number,
  adxSlope: number,
  primaryTrend: string,
  momentumScore: number,
): { shouldExit: boolean; exitReason: string } {
  const side = position.side;
  const pnlPercent = side === 'LONG'
    ? ((currentPrice - position.entryPrice) / position.entryPrice) * 100
    : ((position.entryPrice - currentPrice) / position.entryPrice) * 100;

  // 1. Stop Loss (hard)
  if (side === 'LONG' && currentPrice <= position.stopLoss) {
    return { shouldExit: true, exitReason: 'stop_loss' };
  }
  if (side === 'SHORT' && currentPrice >= position.stopLoss) {
    return { shouldExit: true, exitReason: 'stop_loss' };
  }

  // 2. Take Profit
  if (side === 'LONG' && currentPrice >= position.takeProfit) {
    return { shouldExit: true, exitReason: 'take_profit' };
  }
  if (side === 'SHORT' && currentPrice <= position.takeProfit) {
    return { shouldExit: true, exitReason: 'take_profit' };
  }

  // 3. Track peak P&L
  if (pnlPercent > position.peakPnl) {
    position.peakPnl = pnlPercent;
    position.peakReachedAt = currentTime;
  }

  // 4. Production Decay Velocity Exit
  const posCtx: PositionContext = {
    id: 'bt', side: side === 'LONG' ? 'BUY' : 'SELL',
    entry_price: position.entryPrice, stop_loss: position.stopLoss,
    quantity: 1, opened_at: position.entryTime, executed_at: position.entryTime,
    peak_pnl_percent: position.peakPnl, peak_reached_at: position.peakReachedAt,
    trading_fee_percent: TRADING_FEE_PARAMS.DEFAULT_FEE_RATE_PERCENT,
    entry_atr: position.atrAtEntry * position.entryPrice / 100,
    entry_atr_percent: position.atrPercentAtEntry,
    max_adverse_excursion_atr: null, strategy_name: position.strategyName,
  };
  const mktCtx: MarketContext = {
    currentPrice, pnlPercent, atrPercent, atr,
    adx, adxSlope, primaryTrend, momentumScore,
  };
  const exitSettings: UserExitSettings = {
    activationPercent: 0.5, trailingAggressiveness: 3,
    progressiveLockEnabled: true, stalePeakProtectionEnabled: true,
    decayVelocityExitEnabled: true,
  };

  const decayResult = evaluateDecayVelocity(posCtx, mktCtx, exitSettings);
  if (decayResult.shouldExit) {
    return { shouldExit: true, exitReason: decayResult.exitReason };
  }

  // 5. Production Trailing Stop (peak-adaptive) — OPTIMIZED: tighter distances
  if (position.peakPnl >= 0.8) {
    let trailDistance: number;
    if (position.peakPnl >= 2.0) {
      trailDistance = 0.12; // Capture zone (was 0.15)
    } else if (position.peakPnl >= 1.5) {
      trailDistance = 0.15; // Harvest zone (was 0.18)
    } else if (position.peakPnl >= 1.0) {
      trailDistance = 0.18; // Probe zone (was 0.22)
    } else {
      trailDistance = 0.25; // Early zone — new tier for 0.8-1.0 peak
    }
    
    const minTrailFloor = 0.5; // Lowered from 0.8 to lock profits earlier
    const lockLevel = Math.max(minTrailFloor, position.peakPnl * (1 - trailDistance));
    
    if (pnlPercent < lockLevel && pnlPercent > 0) {
      return { shouldExit: true, exitReason: 'trailing_stop' };
    }
  }

  // 6. Micro Profit Lock (production) — OPTIMIZED: wider window
  if (position.peakPnl > 0.10 && position.peakPnl < 0.60) {
    const microResult = evaluateMicroProfitLock(posCtx, position.peakPnl);
    if (microResult.applied && microResult.newStopLoss !== null) {
      const shouldExit = side === 'LONG'
        ? currentPrice <= microResult.newStopLoss
        : currentPrice >= microResult.newStopLoss;
      if (shouldExit) {
        return { shouldExit: true, exitReason: 'micro_profit_lock' };
      }
    }
  }

  // 7. Progressive Profit Lock (production) — OPTIMIZED: earlier activation
  if (position.peakPnl >= 0.40 && position.peakPnl < 2.75) {
    const progResult = evaluateProgressiveProfitLock(posCtx, position.peakPnl);
    if (progResult.applied && progResult.newStopLoss !== null) {
      const shouldExit = side === 'LONG'
        ? currentPrice <= progResult.newStopLoss
        : currentPrice >= progResult.newStopLoss;
      if (shouldExit) {
        return { shouldExit: true, exitReason: 'progressive_profit_lock' };
      }
    }
  }

  // 8. Time stop (24 hours max hold - production)
  const entryTime = new Date(position.entryTime).getTime();
  const currentTimestamp = new Date(currentTime).getTime();
  const hoursHeld = (currentTimestamp - entryTime) / (1000 * 60 * 60);
  if (hoursHeld > 24) {
    return { shouldExit: true, exitReason: 'time_stop_24h' };
  }

  // 9. Moderate exhaustion exit — reverted to working threshold
  if (position.peakPnl > 0.35 && pnlPercent < position.peakPnl * 0.25) {
    return { shouldExit: true, exitReason: 'moderate_exhaustion_exit' };
  }

  // 10. Momentum reversal exit — SYMBOL-ADAPTIVE thresholds
  // Get params from position's symbol
  const symParams = getSymbolParams(position.symbol);
  if (hoursHeld > symParams.exits.momentumReversalMinHours) {
    if ((side === 'LONG' && momentumScore < -symParams.exits.momentumReversalScore && primaryTrend === 'bearish') ||
        (side === 'SHORT' && momentumScore > symParams.exits.momentumReversalScore && primaryTrend === 'bullish')) {
      if (pnlPercent < symParams.exits.momentumReversalThreshold) {
        return { shouldExit: true, exitReason: 'momentum_reversal_exit' };
      }
    }
  }

  // 10b. Early momentum flip — SYMBOL-ADAPTIVE
  if (hoursHeld > symParams.exits.earlyFlipMinHours && hoursHeld <= symParams.exits.earlyFlipMaxHours) {
    if ((side === 'LONG' && momentumScore < -symParams.exits.earlyMomentumFlipScore) ||
        (side === 'SHORT' && momentumScore > symParams.exits.earlyMomentumFlipScore)) {
      if (pnlPercent < symParams.exits.earlyMomentumFlipThreshold) {
        return { shouldExit: true, exitReason: 'early_momentum_flip_exit' };
      }
    }
  }

  // 11. ADX collapse exit — exit when structure breaks down
  if (adx < 15 && adxSlope < -1.0 && hoursHeld > 4 && pnlPercent < 0.3) {
    return { shouldExit: true, exitReason: 'adx_collapse_exit' };
  }

  // 12. ALTCOIN-ONLY: Hard PnL floor — prevent runaway losses on volatile altcoins
  const isBtc = position.symbol.startsWith('BTC');
  if (!isBtc && pnlPercent < -symParams.stopLoss.maxCapPercent) {
    return { shouldExit: true, exitReason: 'hard_pnl_floor_exit' };
  }

  // 13. ALTCOIN-ONLY: Quick loss cut — if losing after 3+ hours with no recovery
  if (!isBtc && hoursHeld > 3 && pnlPercent < -0.5 && pnlPercent < position.peakPnl - 0.3) {
    return { shouldExit: true, exitReason: 'stale_loss_exit' };
  }

  return { shouldExit: false, exitReason: '' };
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
      logger.info(`${LOG_CATEGORIES.SUCCESS} Backtest: fetching klines for ${symbol}`);
      
      // Fetch primary timeframe klines
      const allKlines = await fetchHistoricalKlines(symbol, config.barInterval, startTime - lookbackMs, endTime);
      if (allKlines.length < 60) {
        logger.warn(`Insufficient klines for ${symbol}: ${allKlines.length}`);
        continue;
      }
      logger.info(`${LOG_CATEGORIES.SUCCESS} Backtest: ${symbol} loaded ${allKlines.length} bars`);

      const allParsed = parseKlinePrices(allKlines);
      
      // Find start index
      let startIdx = 0;
      for (let i = 0; i < allKlines.length; i++) {
        if (allKlines[i][0] >= startTime) { startIdx = i; break; }
      }

      const openPositions: BacktestPosition[] = [];
      let lastTradeTime = 0; // Cooldown tracking

      for (let i = startIdx; i < allKlines.length; i++) {
        const barTime = new Date(allKlines[i][0]).toISOString();
        const barTimeMs = allKlines[i][0];
        const currentPrice = allParsed.closes[i];

        // Window slices up to current bar
        const wCloses = allParsed.closes.slice(0, i + 1);
        const wHighs = allParsed.highs.slice(0, i + 1);
        const wLows = allParsed.lows.slice(0, i + 1);
        const wVolumes = allParsed.volumes.slice(0, i + 1);
        const wKlines = allKlines.slice(0, i + 1);

        // Calculate indicators for exit checks
        const atr = wCloses.length > 14 ? calculateATR(wHighs, wLows, wCloses, 14) : currentPrice * 0.015;
        const atrPercent = (atr / currentPrice) * 100;
        const adxResult = wKlines.length > 30 ? calculateADXWithDirection(wKlines, 14) : { adx: 15, slope: 0, adxSlope: 0, adxRising: false, plusDI: 0, minusDI: 0, diGap: 0, prevDiGap: 0, adxArray: [], prevAdx: 15, adxPeaked: false, adxSlopeSmoothed: 0 };

        // Check exits on open positions
        for (let p = openPositions.length - 1; p >= 0; p--) {
          const pos = openPositions[p];
          
          // Calculate momentum for exit context
          const momResult = wCloses.length > 50
            ? calculateMomentumScore(wKlines, wCloses, adxResult.adx, adxResult.adxRising, atr, adxResult.adxSlope ?? 0)
            : { score: 0, direction: "neutral" as const, phase: "neutral" as const, isAccelerating: false, isWeakening: false, isExhausted: false, isTransitioning: false, microExhaustion: { detected: false, score: 0, signals: [], momentumDeceleration: false, accelerationFlip: false, priceDivergence: false, volumeDryUp: false, rsiDivergence: false, recommendation: "hold" as const, positionMultiplier: 1.0 }, components: { emaSpreadRoC: 0, rsiMomentum: 0, macdSlope: 0, adxTrend: 0, transitionBonus: 0, priceImpulse: 0 }, overextensionATR: 0, reasons: [] };

          const ema21 = calculateEMA(wCloses, 21);
          const primaryTrend = currentPrice > ema21 ? 'bullish' : 'bearish';

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
            });

            const positionSize = equity * 0.015 * 1.0; // 1.5% base
            equity += positionSize * (pnl.netPnlPercent / 100);
            peakEquity = Math.max(peakEquity, equity);
            openPositions.splice(p, 1);
            lastTradeTime = barTimeMs;
          }
        }

        // Signal generation with production gates (only if no open position and cooldown passed)
        const cooldownMs = 2 * 60 * 60 * 1000; // 2-hour cooldown between trades
        const hasOpenPos = openPositions.some(p => p.symbol === symbol);
        const cooldownPassed = (barTimeMs - lastTradeTime) > cooldownMs;

        if (!hasOpenPos && cooldownPassed && wCloses.length > 50) {
          // Calculate production momentum score
          const momResult = calculateMomentumScore(wKlines, wCloses, adxResult.adx, adxResult.adxRising, atr, adxResult.adxSlope ?? 0);
          
          // Build production MFS
          const mfs = buildBacktestMFS(symbol, wCloses, wHighs, wLows, wVolumes, wKlines, momResult, adxResult);
          
          // Run production gate pipeline
          const gateResult = evaluateProductionGates(mfs, momResult, symbol);

          if (gateResult.gate) {
            gateStats[gateResult.gate] = (gateStats[gateResult.gate] || 0) + 1;
          }

          if (gateResult.passed && gateResult.direction) {
            // Side filter: skip if direction doesn't match requested side
            if (config.sideFilter && gateResult.direction !== config.sideFilter) {
              gateStats[`SIDE_FILTER_${gateResult.direction}_SKIPPED`] = (gateStats[`SIDE_FILTER_${gateResult.direction}_SKIPPED`] || 0) + 1;
              continue;
            }
            const dir = gateResult.direction;
            
            // ATR-based SL/TP with SYMBOL-ADAPTIVE caps
            const symP = getSymbolParams(symbol);
            const slMultiplier = symP.stopLoss.atrMultiplier;
            const tpMultiplier = symP.takeProfit.atrMultiplier;
            const maxSlPercent = symP.stopLoss.maxCapPercent;
            let stopLoss: number, takeProfit: number;
            const atrStop = atr * slMultiplier;
            const maxStop = currentPrice * (maxSlPercent / 100);
            const effectiveStop = Math.min(atrStop, maxStop);
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
              entryStochK: mfs.stochRsi["1h"].k,
              entryAdx: mfs.adx,
            });
            
            logger.info(`${LOG_CATEGORIES.SUCCESS} Backtest ENTRY: ${symbol} ${dir} @ ${currentPrice} | entryMom=${gateResult.momentumScore} K=${mfs.stochRsi["1h"].k.toFixed(1)} ADX=${mfs.adx.toFixed(1)} strategy=${gateResult.strategyName}`);
          }
        }

        // Equity curve
        const drawdown = peakEquity > 0 ? ((peakEquity - equity) / peakEquity) * 100 : 0;
        equityCurve.push({
          time: barTime,
          equity: Math.round(equity * 100) / 100,
          drawdown: Math.round(drawdown * 100) / 100,
        });
      }

      // Force-close remaining
      const lastPrice = allParsed.closes[allParsed.closes.length - 1];
      const lastTime = new Date(allKlines[allKlines.length - 1][0]).toISOString();
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
        });
        const positionSize = equity * 0.015;
        equity += positionSize * (pnl.netPnlPercent / 100);
      }
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
    for (const t of trades) {
      exitBreakdown[t.exitReason] = (exitBreakdown[t.exitReason] || 0) + 1;
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

    logger.info(`${LOG_CATEGORIES.SUCCESS} Backtest completed: ${trades.length} trades, ${winRate.toFixed(1)}% win rate, ${totalReturn.toFixed(2)}% return in ${durationMs}ms`);
    logger.info(`${LOG_CATEGORIES.SUCCESS} Gate stats: ${JSON.stringify(gateStats)}`);

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

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body = await req.json();
    
    // Support "days" shorthand: auto-calculate startDate/endDate
    let startDate = body.startDate;
    let endDate = body.endDate;
    if (!startDate || !endDate) {
      const days = body.days || 7;
      const now = new Date();
      endDate = now.toISOString();
      startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
    }
    
    const config: BacktestConfig = {
      symbols: body.symbols || ['BTCUSDT'],
      startDate,
      endDate,
      barInterval: body.barInterval || '1h',
    };

    const parsedStart = new Date(config.startDate);
    const parsedEnd = new Date(config.endDate);
    const daysDiff = (parsedEnd.getTime() - parsedStart.getTime()) / (1000 * 60 * 60 * 24);

    if (daysDiff > 30) {
      return new Response(JSON.stringify({ error: 'Maximum backtest period is 30 days' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    if (daysDiff < 1) {
      return new Response(JSON.stringify({ error: 'Minimum backtest period is 1 day' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: running } = await supabase.from('backtest_results')
      .select('id').eq('user_id', user.id).eq('status', 'running').limit(1);
    if (running && running.length > 0) {
      return new Response(JSON.stringify({ error: 'A backtest is already running.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: backtestRecord, error: insertError } = await supabase
      .from('backtest_results').insert({ user_id: user.id, config, status: 'running' })
      .select('id').single();

    if (insertError || !backtestRecord) {
      throw new Error(`Failed to create backtest record: ${insertError?.message}`);
    }

    await runBacktest(config, user.id, supabase, backtestRecord.id);

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
