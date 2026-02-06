// ============= TREND DATA RESPONSE TYPES =============
// Single source of truth for calculate-trend response structure
// Used by: strategy-analyzer, execute-trade, monitor-positions

// ============= BASIC ENUMS & TYPES =============
export type TrendDirection = "bullish" | "bearish" | "neutral";
export type PrimaryTrendDirection = "bullish" | "bearish" | "neutral" | "ranging";
export type MomentumState = "none" | "mixed" | "confirmed" | "building" | "exhausted";
export type StochRsiSignal = "bullish_cross" | "bearish_cross" | "overbought" | "oversold" | "neutral" | "rising" | "falling" | string;
export type BollingerPricePosition = "above_upper" | "upper_zone" | "middle" | "lower_zone" | "below_lower";
export type VolumeTrend = "increasing" | "decreasing" | "stable" | "neutral";
export type DivergenceType = "aligned" | "pullback" | "early_reversal" | "ranging_conflict" | "opposing";

// ============= INDICATOR INTERFACES =============
export interface TrendIndicators {
  ema12: number;
  ema26: number;
  emaSignal: string;
  rsi: number;
  rsiSignal: string;
  rsiArray?: number[];
  macd: number;
  macdSignal: number;
  macdHistogram: number;
  macdTrend: string;
  macdHistogramArray?: number[];
}

export interface TimeframeTrend {
  trend: TrendDirection;
  confidence: number;
  enhancedConfidence?: number;
  indicators: TrendIndicators;
}

export interface BarsAtExtremeData {
  barsOverbought: number;
  barsOversold: number;
}

export interface StochRsiData {
  k: number;
  d: number;
  signal: string;
  strength?: number;
  prevK?: number;
  prevD?: number;
  kRising?: boolean;
  kCrossedAboveD?: boolean;
  kCrossedBelowD?: boolean;
  barsAtExtreme?: BarsAtExtremeData;
  kArray?: number[];
}

export interface BollingerBandsData {
  upper: number;
  middle: number;
  lower: number;
  bandwidth: number;
  percentB: number;
  squeeze: boolean;
  squeezeIntensity: number;
  pricePosition: BollingerPricePosition;
}

export interface VolumeData {
  volumeRatio: number;
  volumeTrend: VolumeTrend;
  volumeSpike: boolean;
  avgVolume: number;
  currentVolume: number;
  volumeDirection?: TrendDirection;
}

// ============= COMPLEX ANALYSIS INTERFACES =============
export interface DivergenceData {
  type: DivergenceType;
  confidence: number;
  allowSignal: boolean;
  recommendedPositionSize: number;
}

export interface TrueAlignmentData {
  score: number;
  breakdown?: {
    directionScore: number;
    indicatorScore: number;
    penaltyScore: number;
  };
  neutralCapped?: boolean;
  tf4hConfidence?: number;
  tf1hConfidence?: number;
  volumeRatio?: number;
  volumeBoost?: number;
  adxStrength?: number;
  adxContribution?: number;
  totalWeightedConfidence?: number;
  weightedComponents?: {
    tf4hWeighted: number;
    tf1hWeighted: number;
    volumeWeighted: number;
    adxWeighted: number;
  };
}

export interface MomentumData {
  state: MomentumState;
  macdExpanding: boolean;
  macdStrong: boolean;
  macdHistogram: number;
  macdDirectionAligned: boolean;
  lastCloseAlignsWithTrend: boolean;
  hasDivergence: boolean;
  confirms: boolean;
  volumeConfirms: boolean;
  adxRising: boolean;
  fakeBreakoutRisk: boolean;
  genuineMomentum: boolean;
  consecutiveBars1h?: number;
  consecutiveBars15m?: number;
  consecutiveBars30m?: number;
}

export interface VolatilityData {
  atr: number;
  atrPercent: number;
  relativeATR: number;
  historicalATRAvg: number;
  isCompressed: boolean;
  adx: number;
  adx15m?: number;
  adx30m?: number;
  adx4h?: number;
  // NEW: ADX slope for graduated decision making
  adxSlope?: number;
  adxRising?: boolean;
  volatilityNormal: boolean;
  isRanging: boolean;
}

export interface MarketStructureData {
  valid: boolean;
  confidence: number;
}

export interface PullbackData {
  inPullback: boolean;
  pullbackPercent: number;
  pullbackConditionsMet: boolean;
}

export interface PriceDistanceData {
  high24h: number;
  low24h: number;
  distanceFromHighPercent: number;
  distanceFromLowPercent: number;
  atrNormalizedFromHigh: number;
  atrNormalizedFromLow: number;
}

export interface MicroTrendData {
  hasMicroTrend: boolean;
  direction: TrendDirection;
  confidence: number;
  alignment: number | string;
  reason: string;
  persistence?: number;
  volumeConfirmed?: boolean;
  validForCandles?: number;
  adxSufficient?: boolean;
  blocked?: boolean;
  blockReason?: string;
}

export interface PriceActionMomentumData {
  hasStrongMove: boolean;
  direction: TrendDirection;
  movePercent: number;
  isStrongMove: boolean;
  canOverrideNeutralAlignment: boolean;
}

export interface StealthTrendData {
  detected: boolean;
  direction: TrendDirection;
  driftPercent: number;
  driftDuration: number;
  adxBypassAllowed: boolean;
  htfBypassAllowed: boolean;
  stealthScore: number;
  positionMultiplier: number;
  stopMultiplier: number;
  reason: string;
}

export interface NeutralPersistenceData {
  isCurrentlyNeutral: boolean;
  durationMinutes: number;
  confidenceBonus: number;
  reason: string;
}

// ============= MAIN RESPONSE INTERFACE =============
export interface TrendDataResponse {
  symbol: string;
  timestamp: string;
  currentPrice: number;
  primaryTrend: PrimaryTrendDirection;
  confidence: number;
  isAligned: boolean;
  
  divergence: DivergenceData;
  trueAlignment: TrueAlignmentData;
  
  timeframes: {
    "15m": TimeframeTrend;
    "30m": TimeframeTrend;
    "1h": TimeframeTrend;
    "4h": TimeframeTrend;
  };
  
  stochasticRsi: {
    "15m": StochRsiData;
    "30m": StochRsiData;
    "1h": StochRsiData;
    "4h": StochRsiData;
    barsAtExtreme: {
      "1h": BarsAtExtremeData;
      "4h": BarsAtExtremeData;
    };
  };
  
  // NEW: StochRSI K history for Phase 2 Flash Crash detection
  // Stores last N K values per timeframe for temporal analysis
  stochRsiHistory?: {
    "1h"?: number[];
    "4h"?: number[];
  };
  
  momentum: MomentumData;
  volatility: VolatilityData;
  
  volume: {
    "15m": VolumeData;
    "30m": VolumeData;
    "1h": VolumeData;
    "4h": VolumeData;
    confirmsDirection: boolean;
    hasRangeExpansion1h: boolean;
  };
  
  bollingerBands: {
    "15m": BollingerBandsData;
    "30m": BollingerBandsData;
    "1h": BollingerBandsData;
    "4h": BollingerBandsData;
    squeezeActive: boolean;
    squeezeBreakoutPotential: boolean;
  };
  
  pullback: PullbackData;
  priceDistanceFromSwing: PriceDistanceData;
  marketStructure: MarketStructureData;
  microTrend: MicroTrendData;
  priceActionMomentum: PriceActionMomentumData;
  stealthTrend: StealthTrendData;
  neutralPersistence: NeutralPersistenceData;
  
  // Raw klines for downstream analysis
  klines15m?: any[];
  klines30m?: any[];
}

// ============= HELPER TYPE FOR PARTIAL DATA =============
// Use when accessing trendData that may have missing fields
export type PartialTrendData = Partial<TrendDataResponse> & {
  timeframes?: Partial<TrendDataResponse['timeframes']>;
  stochasticRsi?: Partial<TrendDataResponse['stochasticRsi']>;
  volatility?: Partial<TrendDataResponse['volatility']>;
  momentum?: Partial<TrendDataResponse['momentum']>;
  volume?: Partial<TrendDataResponse['volume']>;
  bollingerBands?: Partial<TrendDataResponse['bollingerBands']>;
};

// ============= EXTRACTION RESULT TYPES =============
// For use with the centralized extraction helpers in scoring.ts
export interface ADXExtractionResult {
  adx: number;
  source: 'direct' | 'volatility' | 'default';
}

export interface ADXSlopeResult {
  slope: number;
  isRising: boolean;
  source: string;
}

export interface StochRsiExtractionResult {
  k: number;
  d: number;
  source: string;
}
