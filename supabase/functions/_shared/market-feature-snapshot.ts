// ============= MARKET FEATURE SNAPSHOT =============
// Single extraction point for all market features used by gates.
// Built ONCE per symbol per cycle; gates read from snapshot, never from raw trendData.
// This eliminates repeated extraction calls, fallback inconsistencies, and path divergence.

import type { TrendDataResponse, PartialTrendData, TrendDirection, MomentumState, BollingerPricePosition, ADXSlopeResult } from "./trend-types.ts";

// ============= INTERNAL EXTRACTORS (MFS-native) =============
// These were previously in scoring.ts. Now co-located with the only consumer: buildMarketFeatureSnapshot.
// No other module should call these — all downstream code reads from the snapshot.

const extractADX = (trendData: PartialTrendData | any, defaultValue: number = 20): number => {
  const volatilityAdx = trendData?.volatility?.adx;
  if (typeof volatilityAdx === 'number' && !isNaN(volatilityAdx)) return volatilityAdx;
  if (typeof volatilityAdx === 'object' && volatilityAdx !== null) {
    const objValue = (volatilityAdx as any).value;
    if (typeof objValue === 'number' && !isNaN(objValue)) return objValue;
  }
  const momentumAdx = (trendData?.momentum as any)?.adx;
  if (typeof momentumAdx === 'number' && !isNaN(momentumAdx)) return momentumAdx;
  return defaultValue;
};

const extractADXSlope = (trendData: PartialTrendData | any): ADXSlopeResult => {
  const volatilitySlope = (trendData?.volatility as any)?.adxSlope;
  if (typeof volatilitySlope === 'number' && !isNaN(volatilitySlope)) {
    return { slope: volatilitySlope, isRising: volatilitySlope > 0, source: 'adxSlope' };
  }
  const momentumSlope = (trendData?.momentum as any)?.adxSlope;
  if (typeof momentumSlope === 'number' && !isNaN(momentumSlope)) {
    return { slope: momentumSlope, isRising: momentumSlope > 0, source: 'momentum' };
  }
  const adxRising = trendData?.momentum?.adxRising === true;
  return { slope: 0, isRising: adxRising, source: adxRising ? 'momentum' : 'default' };
};

const extractStochRsiK = (trendData: PartialTrendData | any, timeframe: '4h' | '1h' | '30m' | '15m' = '4h', defaultValue: number = 50): number => {
  const stochRsiPath = trendData?.stochasticRsi?.[timeframe]?.k;
  if (typeof stochRsiPath === 'number' && !isNaN(stochRsiPath)) return stochRsiPath;
  const indicatorsPath = (trendData?.timeframes as any)?.[timeframe]?.indicators?.stochRsi?.k;
  if (typeof indicatorsPath === 'number' && !isNaN(indicatorsPath)) return indicatorsPath;
  if (timeframe === '4h') {
    const aggregatedPath = (trendData?.stochasticRsi as any)?.aggregated?.k;
    if (typeof aggregatedPath === 'number' && !isNaN(aggregatedPath)) return aggregatedPath;
  }
  return defaultValue;
};

const extractStochRsiD = (trendData: PartialTrendData | any, timeframe: '4h' | '1h' | '30m' | '15m' = '4h', defaultValue: number = 50): number => {
  const stochRsiPath = trendData?.stochasticRsi?.[timeframe]?.d;
  if (typeof stochRsiPath === 'number' && !isNaN(stochRsiPath)) return stochRsiPath;
  const indicatorsPath = (trendData?.timeframes as any)?.[timeframe]?.indicators?.stochRsi?.d;
  if (typeof indicatorsPath === 'number' && !isNaN(indicatorsPath)) return indicatorsPath;
  if (timeframe === '4h') {
    const aggregatedPath = (trendData?.stochasticRsi as any)?.aggregated?.d;
    if (typeof aggregatedPath === 'number' && !isNaN(aggregatedPath)) return aggregatedPath;
  }
  return defaultValue;
};

const extractAtrPercent = (trendData: PartialTrendData | any, defaultValue: number = 1.5): number => {
  const atrPercent = trendData?.volatility?.atrPercent;
  if (typeof atrPercent === 'number' && !isNaN(atrPercent)) return atrPercent;
  return defaultValue;
};

const extractAtr = (trendData: PartialTrendData | any, defaultValue: number = 0): number => {
  const atr = trendData?.volatility?.atr;
  if (typeof atr === 'number' && !isNaN(atr)) return atr;
  return defaultValue;
};

const extractCurrentPrice = (trendData: PartialTrendData | any, defaultValue: number = 0): number => {
  const price = trendData?.currentPrice;
  if (typeof price === 'number' && !isNaN(price) && price > 0) return price;
  return defaultValue;
};

const extractMomentumState = (trendData: PartialTrendData | any): 'none' | 'mixed' | 'confirmed' | 'building' | 'exhausted' => {
  const state = trendData?.momentum?.state;
  if (state === 'none' || state === 'mixed' || state === 'confirmed' || state === 'building' || state === 'exhausted') return state;
  return 'none';
};

const extractPriceChange = (trendData: PartialTrendData | any, timeframe: '4h' | '24h' = '4h'): number => {
  if (timeframe === '4h') return (trendData as any)?.priceChange?.percent4h ?? 0;
  return (trendData as any)?.priceChange?.percent24h ?? 0;
};

const extractTimeframeTrend = (trendData: PartialTrendData | any, timeframe: '4h' | '1h' | '30m' | '15m'): { trend: string; confidence: number } => {
  const tf = trendData?.timeframes?.[timeframe];
  return { trend: tf?.trend ?? 'neutral', confidence: tf?.confidence ?? 0 };
};

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
  prevK: number;       // Previous K value for momentum delta
  kArray: number[];    // K history for temporal analysis
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
  adxArray: number[];     // Historical ADX values for slope persistence checks
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
  momentumScore: number;
  prevMomentumScore: number;
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
    microExhaustion?: {
      detected: boolean;
      score: number;
      recommendation: string;
      signals: string[];
      positionMultiplier: number;
      momentumDeceleration: boolean;
      accelerationFlip: boolean;
      priceDivergence: boolean;
    };
    components?: {
      macdSlope: number;
      priceImpulse: number;
      emaSpreadRoC: number;
      rsiMomentum: number;
    };
  };
  
  // === LTF Micro Momentum (calculated from 5m/1m klines) ===
  ltfMicroMomentum?: {
    score5m: number;           // -100 to +100 momentum from 5m klines
    direction5m: string;       // bullish/bearish/neutral from 5m
    phase5m: string;           // momentum phase from 5m
    score1m: number;           // -100 to +100 momentum from 1m klines
    direction1m: string;       // bullish/bearish/neutral from 1m
    isAccelerating5m: boolean; // 5m momentum accelerating
    isReverting1m: boolean;    // 1m showing reversal vs 5m
    ltfAlignment: number;      // -1 to +1: how aligned 1m/5m are
    entryTimingScore: number;  // 0-100: optimal entry timing quality
    microTrendConfirms: boolean; // 1m/5m agree with HTF direction
    recentCandlePattern: string; // pattern from last 3-5 1m candles
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
  
  // === VWAP ===
  vwapValue: number;
  vwapDistancePercent: number;
  
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
  
  // === Aggregate Scores (top-level trendData fields) ===
  volumeScore: number;           // Aggregate volume quality score
  reversalScore: number;         // Reversal risk metric
  volumeZScore: number;          // Volume z-score from volatility
  
  // === Momentum Extended ===
  lastCloseAlignsWithTrend: boolean;
  momentumRsi: number;           // RSI from momentum object
  
  // === Trend Age ===
  trendAgeBars: number;          // Bars since trend started
  
  // === StochRSI History (for Flash Crash detection) ===
  stochRsiHistory: {
    "1h": number[];
    "4h": number[];
  };
  
  // === Raw Klines (for pullback detection and LTF analysis) ===
  klines15m: any[];
  klines30m: any[];
  klines5m: any[];
  klines1m: any[];
  
  // === Top-level Volume Ratio (for early trend detection) ===
  volumeRatio: number;
}

// ============= DEFAULTS =============
const defaultStochRsi: StochRsiFeatures = { k: 50, d: 50, signal: "neutral", prevK: 50, kArray: [] };

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
    prevK: trendData?.stochasticRsi?.[tf]?.prevK ?? extractStochRsiK(trendData, tf),
    kArray: trendData?.stochasticRsi?.[tf]?.kArray ?? [],
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
    adxArray: trendData?.volatility?.adxArray ?? [],
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
    momentumScore: momentum.score ?? 0,
    prevMomentumScore: momentum.prevScore ?? momentum.score ?? 0,
    momentumConfirms: momentum.confirms ?? false,
    macdExpanding: momentum.macdExpanding ?? false,
    macdStrong: momentum.macdStrong ?? false,
    macdHistogram: momentum.macdHistogram ?? 0,
    macdDirectionAligned: momentum.macdDirectionAligned ?? false,
    hasDivergence: momentum.hasDivergence ?? false,
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
      microExhaustion: smartMom.microExhaustion ? {
        detected: smartMom.microExhaustion.detected,
        score: smartMom.microExhaustion.score,
        recommendation: smartMom.microExhaustion.recommendation,
        signals: smartMom.microExhaustion.signals,
        positionMultiplier: smartMom.microExhaustion.positionMultiplier ?? 1.0,
        momentumDeceleration: smartMom.microExhaustion.momentumDeceleration ?? false,
        accelerationFlip: smartMom.microExhaustion.accelerationFlip ?? false,
        priceDivergence: smartMom.microExhaustion.priceDivergence ?? false,
      } : undefined,
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
    
    // VWAP
    vwapValue: trendData?.vwap?.value ?? 0,
    vwapDistancePercent: trendData?.vwap?.distancePercent ?? 0,
    
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
    
    // Aggregate scores
    volumeScore: trendData?.volumeScore ?? 0,
    reversalScore: trendData?.reversalScore ?? 0,
    volumeZScore: trendData?.volatility?.volumeZScore ?? 0,
    
    // Momentum extended
    lastCloseAlignsWithTrend: momentum.lastCloseAlignsWithTrend ?? false,
    momentumRsi: momentum.rsi ?? 50,
    
    // Trend age
    trendAgeBars: trendData?.trendAge?.bars ?? 0,
    
    // StochRSI history
    stochRsiHistory: {
      "1h": trendData?.stochRsiHistory?.['1h'] ?? [],
      "4h": trendData?.stochRsiHistory?.['4h'] ?? [],
    },
    
    // Raw klines
    klines15m: trendData?.klines15m ?? [],
    klines30m: trendData?.klines30m ?? [],
    klines5m: trendData?.klines5m ?? [],
    klines1m: trendData?.klines1m ?? [],
    
    // Top-level volume ratio
    volumeRatio: trendData?.volume?.ratio ?? trendData?.volume?.['1h']?.volumeRatio ?? 1.0,
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
