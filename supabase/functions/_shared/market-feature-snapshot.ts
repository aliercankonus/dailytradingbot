// ============= MARKET FEATURE SNAPSHOT =============
// Single extraction point for all market features used by gates.
// Built ONCE per symbol per cycle; gates read from snapshot, never from raw trendData.
// This eliminates repeated extraction calls, fallback inconsistencies, and path divergence.

import type { TrendDataResponse, PartialTrendData, TrendDirection, MomentumState, BollingerPricePosition } from "./trend-types.ts";
import {
  extractADX,
  extractADXSlope,
  extractStochRsiK,
  extractStochRsiD,
  extractAtrPercent,
  extractAtr,
  extractCurrentPrice,
  extractMomentumState,
  extractPriceChange,
  extractTimeframeTrend,
} from "./scoring.ts";

// ============= TIMEFRAME FEATURE SET =============
export interface TimeframeFeatures {
  trend: TrendDirection | string;
  extendedTrend?: string;
  confidence: number;
  rsi: number;
  emaSignal: string;
  macd: number;
  macdSignal: number;
  macdHistogram: number;
  macdTrend: string;
}

// ============= STOCHRSI FEATURE SET =============
export interface StochRsiFeatures {
  k: number;
  d: number;
  signal: string;
}

export interface BarsAtExtremeFeatures {
  barsOverbought: number;
  barsOversold: number;
}

export interface StochRsiAggregated {
  bearishCrossCount: number;
  bullishCrossCount: number;
  overboughtCount: number;
  oversoldCount: number;
}

// ============= BOLLINGER FEATURE SET =============
export interface BollingerFeatures {
  upper: number;
  middle: number;
  lower: number;
  bandwidth: number;
  percentB: number;
  squeeze: boolean;
  squeezeIntensity: number;
  pricePosition: BollingerPricePosition | string;
}

// ============= VOLUME FEATURE SET =============
export interface VolumeFeatures {
  volumeRatio: number;
  volumeTrend: string;
  volumeSpike: boolean;
  volumeDirection: string;
}

// ============= MAIN SNAPSHOT INTERFACE =============
export interface MarketFeatureSnapshot {
  // === Identity ===
  symbol: string;
  currentPrice: number;
  timestamp: string;
  
  // === Primary Trend ===
  primaryTrend: string;
  confidence: number;
  isAligned: boolean;
  trendConsistency: number;
  
  // === ADX (authoritative, from 1h closed candles) ===
  adx: number;
  adxSlope: number;
  adxRising: boolean;
  adx15m?: number;      // diagnostic only
  adx30m?: number;
  adx4h?: number;
  
  // === StochRSI (all timeframes, extracted once) ===
  stochRsi: {
    "15m": StochRsiFeatures;
    "30m": StochRsiFeatures;
    "1h": StochRsiFeatures;
    "4h": StochRsiFeatures;
  };
  
  stochRsiAggregated: StochRsiAggregated;
  
  barsAtExtreme: {
    "1h": BarsAtExtremeFeatures;
    "4h": BarsAtExtremeFeatures;
  };
  
  // === Timeframe Trends ===
  timeframes: {
    "15m": TimeframeFeatures;
    "30m": TimeframeFeatures;
    "1h": TimeframeFeatures;
    "4h": TimeframeFeatures;
  };
  
  // === Bollinger Bands ===
  bollinger: {
    "15m": BollingerFeatures;
    "30m": BollingerFeatures;
    "1h": BollingerFeatures;
    "4h": BollingerFeatures;
    squeezeActive: boolean;
    squeezeBreakoutPotential: boolean;
  };
  
  // === Volume ===
  volume: {
    "15m": VolumeFeatures;
    "30m": VolumeFeatures;
    "1h": VolumeFeatures;
    "4h": VolumeFeatures;
    confirmsDirection: boolean;
    hasRangeExpansion1h: boolean;
  };
  
  // === Volatility / ATR ===
  atr: number;
  atrPercent: number;
  relativeATR: number;
  historicalATRAvg: number;
  isCompressed: boolean;
  volatilityNormal: boolean;
  isRanging: boolean;
  
  // === Momentum ===
  momentumState: MomentumState | string;
  momentumConfirms: boolean;
  macdExpanding: boolean;
  macdStrong: boolean;
  macdHistogram: number;
  macdDirectionAligned: boolean;
  hasDivergence: boolean;
  volumeConfirms: boolean;
  adxRisingMomentum: boolean;
  fakeBreakoutRisk: boolean;
  genuineMomentum: boolean;
  consecutiveBars1h: number;
  consecutiveBars15m: number;
  consecutiveBars30m: number;
  
  // === Smart Momentum (calculated from 15m klines) ===
  smartMomentum?: {
    score: number;
    direction: string;
    phase: string;
    isAccelerating: boolean;
    isExhausted: boolean;
    isWeakening: boolean;
    isTransitioning: boolean;
    overextensionATR: number;
    components?: {
      macdSlope: number;
      priceImpulse: number;
      emaSpreadRoC: number;
      rsiMomentum: number;
    };
  };
  
  // === Direction Derivation Support ===
  directionStableBars: number;
  momentumDirection: string;
  prevMacdHistogram: number;
  squeezeJustReleased: boolean;
  
  // === Price Distance ===
  distanceFromHighPercent: number;
  distanceFromLowPercent: number;
  atrNormalizedFromHigh: number;
  atrNormalizedFromLow: number;
  high24h: number;
  low24h: number;
  
  // === Price Change ===
  priceChange4h: number;
  priceChange24h: number;
  
  // === Pullback ===
  inPullback: boolean;
  pullbackPercent: number;
  pullbackConditionsMet: boolean;
  
  // === Micro Trend ===
  microTrend: {
    hasMicroTrend: boolean;
    direction: TrendDirection | string;
    confidence: number;
    alignment: number | string;
    reason: string;
    persistence?: number;
    volumeConfirmed?: boolean;
    adxSufficient?: boolean;
    blocked?: boolean;
    blockReason?: string;
  };
  
  // === Stealth Trend ===
  stealthTrend: {
    detected: boolean;
    direction: TrendDirection | string;
    driftPercent: number;
    driftDuration: number;
    adxBypassAllowed: boolean;
    htfBypassAllowed: boolean;
    stealthScore: number;
    positionMultiplier: number;
    stopMultiplier: number;
    reason: string;
  };
  
  // === Neutral Persistence ===
  neutralPersistence: {
    isCurrentlyNeutral: boolean;
    durationMinutes: number;
    confidenceBonus: number;
    reason: string;
  };
  
  // === Market Structure ===
  marketStructureValid: boolean;
  marketStructureConfidence: number;
  
  // === True Alignment (enhanced v2.0) ===
  trueAlignment: {
    score: number;
    tf4hConfidence: number;
    tf1hConfidence: number;
    adxContribution: number;
    totalWeightedConfidence: number;
    neutralCapped: boolean;
    breakdown: Record<string, number>;
    weightedComponents: Record<string, number>;
  };
  
  // === DI Separation (directional index) ===
  diPlus: number;
  diMinus: number;
  diSeparation: number;
  
  // === Price Action Momentum ===
  priceActionMomentum: {
    hasStrongMove: boolean;
    direction: TrendDirection | string;
    movePercent: number;
    isStrongMove: boolean;
    canOverrideNeutralAlignment: boolean;
  };
  
  // === Market Regime (raw from trendData) ===
  regime: string;
}

// ============= DEFAULTS =============
const defaultStochRsi: StochRsiFeatures = { k: 50, d: 50, signal: "neutral" };

const defaultBarsAtExtreme: BarsAtExtremeFeatures = { barsOverbought: 0, barsOversold: 0 };

const defaultBollinger: BollingerFeatures = {
  upper: 0, middle: 0, lower: 0,
  bandwidth: 0, percentB: 50,
  squeeze: false, squeezeIntensity: 0,
  pricePosition: "middle",
};

const defaultVolume: VolumeFeatures = {
  volumeRatio: 1.0, volumeTrend: "stable",
  volumeSpike: false, volumeDirection: "neutral",
};

const defaultTimeframe: TimeframeFeatures = {
  trend: "neutral", confidence: 0,
  rsi: 50, emaSignal: "neutral",
  macd: 0, macdSignal: 0, macdHistogram: 0, macdTrend: "neutral",
};

// ============= BUILDER FUNCTION =============
/**
 * Builds a MarketFeatureSnapshot from raw trendData.
 * Call ONCE per symbol per cycle. All gates read from this snapshot.
 */
export function buildMarketFeatureSnapshot(
  symbol: string,
  trendData: any,
): MarketFeatureSnapshot {
  // === ADX (authoritative 1h source) ===
  const adx = extractADX(trendData);
  const adxSlopeResult = extractADXSlope(trendData);
  
  // === StochRSI (all timeframes) ===
  const extractStochTF = (tf: '15m' | '30m' | '1h' | '4h'): StochRsiFeatures => ({
    k: extractStochRsiK(trendData, tf),
    d: extractStochRsiD(trendData, tf),
    signal: trendData?.stochasticRsi?.[tf]?.signal ?? "neutral",
  });
  const stochRsi = {
    "15m": extractStochTF('15m'),
    "30m": extractStochTF('30m'),
    "1h": extractStochTF('1h'),
    "4h": extractStochTF('4h'),
  };
  
  // === StochRSI Aggregated ===
  const stochAgg = trendData?.stochasticRsi?.aggregated || {};
  const stochRsiAggregated: StochRsiAggregated = {
    bearishCrossCount: stochAgg.bearishCrossCount ?? 0,
    bullishCrossCount: stochAgg.bullishCrossCount ?? 0,
    overboughtCount: stochAgg.overboughtCount ?? 0,
    oversoldCount: stochAgg.oversoldCount ?? 0,
  };
  
  // === Bars at Extreme ===
  const barsAtExtremeRaw = trendData?.stochasticRsi?.barsAtExtreme || {};
  const barsAtExtreme = {
    "1h": {
      barsOverbought: barsAtExtremeRaw['1h']?.barsOverbought ?? 0,
      barsOversold: barsAtExtremeRaw['1h']?.barsOversold ?? 0,
    },
    "4h": {
      barsOverbought: barsAtExtremeRaw['4h']?.barsOverbought ?? 0,
      barsOversold: barsAtExtremeRaw['4h']?.barsOversold ?? 0,
    },
  };
  
  // === Timeframe features ===
  const extractTF = (tf: '15m' | '30m' | '1h' | '4h'): TimeframeFeatures => {
    const tfData = trendData?.timeframes?.[tf];
    const indicators = tfData?.indicators || {};
    return {
      trend: tfData?.trend ?? "neutral",
      extendedTrend: tfData?.extendedTrend,
      confidence: tfData?.confidence ?? 0,
      rsi: indicators.rsi ?? 50,
      emaSignal: indicators.emaSignal ?? "neutral",
      macd: indicators.macd ?? 0,
      macdSignal: indicators.macdSignal ?? 0,
      macdHistogram: indicators.macdHistogram ?? 0,
      macdTrend: indicators.macdTrend ?? "neutral",
    };
  };
  
  // === Bollinger ===
  const extractBB = (tf: string): BollingerFeatures => {
    const bb = trendData?.bollingerBands?.[tf];
    if (!bb) return { ...defaultBollinger };
    return {
      upper: bb.upper ?? 0,
      middle: bb.middle ?? 0,
      lower: bb.lower ?? 0,
      bandwidth: bb.bandwidth ?? 0,
      percentB: bb.percentB ?? 50,
      squeeze: bb.squeeze ?? false,
      squeezeIntensity: bb.squeezeIntensity ?? 0,
      pricePosition: bb.pricePosition ?? "middle",
    };
  };
  
  // === Volume ===
  const extractVol = (tf: string): VolumeFeatures => {
    const vol = trendData?.volume?.[tf];
    if (!vol) return { ...defaultVolume };
    return {
      volumeRatio: vol.volumeRatio ?? 1.0,
      volumeTrend: vol.volumeTrend ?? "stable",
      volumeSpike: vol.volumeSpike ?? false,
      volumeDirection: vol.volumeDirection ?? "neutral",
    };
  };
  
  // === Momentum ===
  const momentum = trendData?.momentum || {};
  
  // === Price distance ===
  const priceDistance = trendData?.priceDistanceFromSwing || {};
  
  // === Pullback ===
  const pullback = trendData?.pullback || {};
  
  // === Micro trend ===
  const microTrend = trendData?.microTrend || {};
  
  // === Stealth trend ===
  const stealthTrend = trendData?.stealthTrend || {};
  
  // === Neutral persistence ===
  const neutralPersistence = trendData?.neutralPersistence || {};
  
  // === Market structure ===
  const marketStructure = trendData?.marketStructure || {};
  
  // === True alignment ===
  const trueAlignment = trendData?.trueAlignment || {};
  
  // === Price action momentum ===
  const priceActionMomentum = trendData?.priceActionMomentum || {};
  
  // === Smart momentum (injected by strategy-analyzer) ===
  const smartMom = trendData?.smartMomentum;
  
  // === DI separation ===
  const diPlus = trendData?.volatility?.diPlus ?? 0;
  const diMinus = trendData?.volatility?.diMinus ?? 0;
  
  return {
    // Identity
    symbol,
    currentPrice: extractCurrentPrice(trendData),
    timestamp: trendData?.timestamp ?? new Date().toISOString(),
    
    // Primary trend
    primaryTrend: trendData?.primaryTrend ?? "neutral",
    confidence: trendData?.confidence ?? 0,
    isAligned: trendData?.isAligned ?? false,
    trendConsistency: trueAlignment?.score ?? 0,
    
    // ADX
    adx,
    adxSlope: adxSlopeResult.slope,
    adxRising: adxSlopeResult.isRising,
    adx15m: trendData?.volatility?.adx15m,
    adx30m: trendData?.volatility?.adx30m,
    adx4h: trendData?.volatility?.adx4h,
    
    // StochRSI
    stochRsi,
    stochRsiAggregated,
    barsAtExtreme,
    
    // Timeframes
    timeframes: {
      "15m": extractTF('15m'),
      "30m": extractTF('30m'),
      "1h": extractTF('1h'),
      "4h": extractTF('4h'),
    },
    
    // Bollinger
    bollinger: {
      "15m": extractBB("15m"),
      "30m": extractBB("30m"),
      "1h": extractBB("1h"),
      "4h": extractBB("4h"),
      squeezeActive: trendData?.bollingerBands?.squeezeActive ?? false,
      squeezeBreakoutPotential: trendData?.bollingerBands?.squeezeBreakoutPotential ?? false,
    },
    
    // Volume
    volume: {
      "15m": extractVol("15m"),
      "30m": extractVol("30m"),
      "1h": extractVol("1h"),
      "4h": extractVol("4h"),
      confirmsDirection: trendData?.volume?.confirmsDirection ?? false,
      hasRangeExpansion1h: trendData?.volume?.hasRangeExpansion1h ?? false,
    },
    
    // Volatility
    atr: extractAtr(trendData),
    atrPercent: extractAtrPercent(trendData),
    relativeATR: trendData?.volatility?.relativeATR ?? 1.0,
    historicalATRAvg: trendData?.volatility?.historicalATRAvg ?? 0,
    isCompressed: trendData?.volatility?.isCompressed ?? false,
    volatilityNormal: trendData?.volatility?.volatilityNormal ?? true,
    isRanging: trendData?.volatility?.isRanging ?? false,
    
    // Momentum
    momentumState: extractMomentumState(trendData),
    momentumConfirms: momentum.confirms ?? false,
    macdExpanding: momentum.macdExpanding ?? false,
    macdStrong: momentum.macdStrong ?? false,
    macdHistogram: momentum.macdHistogram ?? 0,
    macdDirectionAligned: momentum.macdDirectionAligned ?? false,
    volumeConfirms: momentum.volumeConfirms ?? false,
    adxRisingMomentum: momentum.adxRising ?? false,
    fakeBreakoutRisk: momentum.fakeBreakoutRisk ?? false,
    genuineMomentum: momentum.genuineMomentum ?? false,
    consecutiveBars1h: momentum.consecutiveBars1h ?? 0,
    consecutiveBars15m: momentum.consecutiveBars15m ?? 0,
    consecutiveBars30m: momentum.consecutiveBars30m ?? 0,
    
    // Smart Momentum
    smartMomentum: smartMom ? {
      score: smartMom.score ?? 0,
      direction: smartMom.direction ?? "neutral",
      phase: smartMom.phase ?? "unknown",
      isAccelerating: smartMom.isAccelerating ?? false,
      isExhausted: smartMom.isExhausted ?? false,
      isWeakening: smartMom.isWeakening ?? false,
      isTransitioning: smartMom.isTransitioning ?? false,
      overextensionATR: smartMom.overextensionATR ?? 0,
      components: smartMom.components ? {
        macdSlope: smartMom.components.macdSlope ?? 0,
        priceImpulse: smartMom.components.priceImpulse ?? 0,
        emaSpreadRoC: smartMom.components.emaSpreadRoC ?? 0,
        rsiMomentum: smartMom.components.rsiMomentum ?? 0,
      } : undefined,
    } : undefined,
    
    // Direction derivation support
    directionStableBars: momentum.directionStableBars ?? 0,
    momentumDirection: momentum.direction ?? "neutral",
    prevMacdHistogram: momentum.prevMacdHistogram ?? 0,
    squeezeJustReleased: trendData?.squeeze?.justReleased ?? false,
    
    // Price distance
    distanceFromHighPercent: priceDistance.distanceFromHighPercent ?? 0,
    distanceFromLowPercent: priceDistance.distanceFromLowPercent ?? 0,
    atrNormalizedFromHigh: priceDistance.atrNormalizedFromHigh ?? 0,
    atrNormalizedFromLow: priceDistance.atrNormalizedFromLow ?? 0,
    high24h: priceDistance.high24h ?? 0,
    low24h: priceDistance.low24h ?? 0,
    
    // Price change
    priceChange4h: extractPriceChange(trendData, '4h'),
    priceChange24h: extractPriceChange(trendData, '24h'),
    
    // Pullback
    inPullback: pullback.inPullback ?? false,
    pullbackPercent: pullback.pullbackPercent ?? 0,
    pullbackConditionsMet: pullback.pullbackConditionsMet ?? false,
    
    // Micro trend
    microTrend: {
      hasMicroTrend: microTrend.hasMicroTrend ?? false,
      direction: microTrend.direction ?? "neutral",
      confidence: microTrend.confidence ?? 0,
      alignment: microTrend.alignment ?? 0,
      reason: microTrend.reason ?? "",
      persistence: microTrend.persistence,
      volumeConfirmed: microTrend.volumeConfirmed,
      adxSufficient: microTrend.adxSufficient,
      blocked: microTrend.blocked,
      blockReason: microTrend.blockReason,
    },
    
    // Stealth trend
    stealthTrend: {
      detected: stealthTrend.detected ?? false,
      direction: stealthTrend.direction ?? "neutral",
      driftPercent: stealthTrend.driftPercent ?? 0,
      driftDuration: stealthTrend.driftDuration ?? 0,
      adxBypassAllowed: stealthTrend.adxBypassAllowed ?? false,
      htfBypassAllowed: stealthTrend.htfBypassAllowed ?? false,
      stealthScore: stealthTrend.stealthScore ?? 0,
      positionMultiplier: stealthTrend.positionMultiplier ?? 1.0,
      stopMultiplier: stealthTrend.stopMultiplier ?? 1.0,
      reason: stealthTrend.reason ?? "",
    },
    
    // Neutral persistence
    neutralPersistence: {
      isCurrentlyNeutral: neutralPersistence.isCurrentlyNeutral ?? false,
      durationMinutes: neutralPersistence.durationMinutes ?? 0,
      confidenceBonus: neutralPersistence.confidenceBonus ?? 0,
      reason: neutralPersistence.reason ?? "No neutral persistence data",
    },
    
    // Market structure
    marketStructureValid: marketStructure.valid ?? false,
    marketStructureConfidence: marketStructure.confidence ?? 0,
    
    // True alignment
    trueAlignment: {
      score: trueAlignment.score ?? 0,
      tf4hConfidence: trueAlignment.tf4hConfidence ?? 0,
      tf1hConfidence: trueAlignment.tf1hConfidence ?? 0,
      adxContribution: trueAlignment.adxContribution ?? 0,
      totalWeightedConfidence: trueAlignment.totalWeightedConfidence ?? 0,
      neutralCapped: trueAlignment.neutralCapped === true,
      breakdown: trueAlignment.breakdown || {},
      weightedComponents: trueAlignment.weightedComponents || {},
    },
    
    // DI separation
    diPlus,
    diMinus,
    diSeparation: Math.abs(diPlus - diMinus),
    
    // Price action momentum
    priceActionMomentum: {
      hasStrongMove: priceActionMomentum.hasStrongMove ?? false,
      direction: priceActionMomentum.direction ?? "neutral",
      movePercent: priceActionMomentum.movePercent ?? 0,
      isStrongMove: priceActionMomentum.isStrongMove ?? false,
      canOverrideNeutralAlignment: priceActionMomentum.canOverrideNeutralAlignment ?? false,
    },
    
    // Market regime
    regime: trendData?.regime?.regime || 'RANGING',
  };
}

// ============= CONVENIENCE ACCESSORS =============
// Shorthand functions for the most commonly accessed snapshot fields

/** Get StochRSI K for a timeframe from snapshot */
export const snapshotStochK = (snap: MarketFeatureSnapshot, tf: '4h' | '1h' | '30m' | '15m'): number => snap.stochRsi[tf].k;

/** Get StochRSI D for a timeframe from snapshot */
export const snapshotStochD = (snap: MarketFeatureSnapshot, tf: '4h' | '1h' | '30m' | '15m'): number => snap.stochRsi[tf].d;

/** Get timeframe trend direction */
export const snapshotTFTrend = (snap: MarketFeatureSnapshot, tf: '4h' | '1h' | '30m' | '15m'): string => snap.timeframes[tf].trend;

/** Get timeframe confidence */
export const snapshotTFConf = (snap: MarketFeatureSnapshot, tf: '4h' | '1h' | '30m' | '15m'): number => snap.timeframes[tf].confidence;

/** Get Bollinger squeeze status for a timeframe */
export const snapshotBBSqueeze = (snap: MarketFeatureSnapshot, tf: '4h' | '1h' | '30m' | '15m'): boolean => snap.bollinger[tf].squeeze;

/** Get volume ratio for a timeframe */
export const snapshotVolumeRatio = (snap: MarketFeatureSnapshot, tf: '4h' | '1h' | '30m' | '15m'): number => snap.volume[tf].volumeRatio;

/** Check if a timeframe trend aligns with direction */
export const snapshotTFAligns = (snap: MarketFeatureSnapshot, tf: '4h' | '1h' | '30m' | '15m', direction: 'long' | 'short'): boolean => {
  const trend = snap.timeframes[tf].trend;
  return direction === 'long' 
    ? (trend === 'bullish' || trend === 'weak_bullish')
    : (trend === 'bearish' || trend === 'weak_bearish');
};

/** Count how many timeframes align with a direction */
export const snapshotAlignedTFCount = (snap: MarketFeatureSnapshot, direction: 'long' | 'short'): number => {
  let count = 0;
  for (const tf of ['15m', '30m', '1h', '4h'] as const) {
    if (snapshotTFAligns(snap, tf, direction)) count++;
  }
  return count;
};

/** Get primary volume ratio (1h with fallbacks) */
export const snapshotPrimaryVolumeRatio = (snap: MarketFeatureSnapshot): number => {
  return snap.volume["1h"].volumeRatio || snap.volume["30m"].volumeRatio || snap.volume["4h"].volumeRatio || 1.0;
};
