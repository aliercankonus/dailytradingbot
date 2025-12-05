import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.84.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SignalData {
  id?: string;
  user_id: string;
  symbol: string;
  signal_type: "long" | "short";
  trend: string;
  confidence_score: number;
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  strategy_id?: string;
  strategy_name: string;
  reason: string;
  indicators: any;
  expires_at: string;
  created_by_rebalancer: boolean;
  positionSizePercent?: number;
  qualityScore?: number;
}

// ============= BUILT-IN STRATEGY TEMPLATES =============
// These templates are always available for signal generation, even if not added by user
const BUILT_IN_TEMPLATES = [
  {
    id: 'builtin-rsi-oversold',
    name: 'RSI Oversold/Overbought',
    signal_direction: 'long',
    entry_conditions: [{ indicator: 'RSI', operator: 'below', value: '30', compareToIndicator: false }],
    exit_conditions: [{ indicator: 'RSI', operator: 'above', value: '70', compareToIndicator: false }],
    indicators: [{ type: 'RSI', name: 'RSI', period: 14 }],
    risk_settings: { stopLossPercent: 3, takeProfitPercent: 6, positionSizePercent: 2 }
  },
  {
    id: 'builtin-rsi-overbought',
    name: 'RSI Overbought Short',
    signal_direction: 'short',
    entry_conditions: [{ indicator: 'RSI', operator: 'above', value: '70', compareToIndicator: false }],
    exit_conditions: [{ indicator: 'RSI', operator: 'below', value: '30', compareToIndicator: false }],
    indicators: [{ type: 'RSI', name: 'RSI', period: 14 }],
    risk_settings: { stopLossPercent: 3, takeProfitPercent: 6, positionSizePercent: 2 }
  },
  {
    id: 'builtin-macd-crossover',
    name: 'MACD Crossover',
    signal_direction: 'long',
    entry_conditions: [{ indicator: 'MACD', operator: 'above', value: '0', compareToIndicator: false }],
    exit_conditions: [{ indicator: 'MACD', operator: 'below', value: '0', compareToIndicator: false }],
    indicators: [{ type: 'MACD', name: 'MACD', fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }],
    risk_settings: { stopLossPercent: 2, takeProfitPercent: 4, positionSizePercent: 1.5 }
  },
  {
    id: 'builtin-macd-bearish',
    name: 'MACD Bearish Cross',
    signal_direction: 'short',
    entry_conditions: [{ indicator: 'MACD', operator: 'below', value: '0', compareToIndicator: false }],
    exit_conditions: [{ indicator: 'MACD', operator: 'above', value: '0', compareToIndicator: false }],
    indicators: [{ type: 'MACD', name: 'MACD', fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }],
    risk_settings: { stopLossPercent: 2, takeProfitPercent: 4, positionSizePercent: 1.5 }
  },
  {
    id: 'builtin-ema-golden',
    name: 'EMA Golden Cross',
    signal_direction: 'long',
    entry_conditions: [{ indicator: 'EMA_Fast', operator: 'above', value: '', compareToIndicator: true, targetIndicator: 'EMA_Slow' }],
    exit_conditions: [{ indicator: 'EMA_Fast', operator: 'below', value: '', compareToIndicator: true, targetIndicator: 'EMA_Slow' }],
    indicators: [{ type: 'EMA', name: 'EMA_Fast', period: 12 }, { type: 'EMA', name: 'EMA_Slow', period: 26 }],
    risk_settings: { stopLossPercent: 2.5, takeProfitPercent: 5, positionSizePercent: 2 }
  },
  {
    id: 'builtin-ema-death',
    name: 'EMA Death Cross',
    signal_direction: 'short',
    entry_conditions: [{ indicator: 'EMA_Fast', operator: 'below', value: '', compareToIndicator: true, targetIndicator: 'EMA_Slow' }],
    exit_conditions: [{ indicator: 'EMA_Fast', operator: 'above', value: '', compareToIndicator: true, targetIndicator: 'EMA_Slow' }],
    indicators: [{ type: 'EMA', name: 'EMA_Fast', period: 12 }, { type: 'EMA', name: 'EMA_Slow', period: 26 }],
    risk_settings: { stopLossPercent: 2.5, takeProfitPercent: 5, positionSizePercent: 2 }
  },
  {
    id: 'builtin-momentum-breakout',
    name: 'Momentum Breakout',
    signal_direction: 'trend',
    entry_conditions: [
      { indicator: 'RSI', operator: 'above', value: '50', compareToIndicator: false },
      { indicator: 'MACD', operator: 'above', value: '0', compareToIndicator: false }
    ],
    exit_conditions: [{ indicator: 'RSI', operator: 'below', value: '40', compareToIndicator: false }],
    indicators: [{ type: 'RSI', name: 'RSI', period: 14 }, { type: 'MACD', name: 'MACD', fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }],
    risk_settings: { stopLossPercent: 3, takeProfitPercent: 6, positionSizePercent: 1.5 }
  },
  {
    id: 'builtin-mean-reversion',
    name: 'Mean Reversion',
    signal_direction: 'long',
    entry_conditions: [{ indicator: 'RSI', operator: 'below', value: '25', compareToIndicator: false }],
    exit_conditions: [{ indicator: 'RSI', operator: 'above', value: '50', compareToIndicator: false }],
    indicators: [{ type: 'RSI', name: 'RSI', period: 14 }],
    risk_settings: { stopLossPercent: 4, takeProfitPercent: 8, positionSizePercent: 2.5 }
  },
  {
    id: 'builtin-bollinger-breakout',
    name: 'Bollinger Band Breakout',
    signal_direction: 'trend',
    entry_conditions: [{ indicator: 'Price', operator: 'above', value: '', compareToIndicator: true, targetIndicator: 'BB_Upper' }],
    exit_conditions: [{ indicator: 'Price', operator: 'below', value: '', compareToIndicator: true, targetIndicator: 'BB_Middle' }],
    indicators: [{ type: 'BB_Upper', name: 'BB_Upper', period: 20 }, { type: 'BB_Middle', name: 'BB_Middle', period: 20 }],
    risk_settings: { stopLossPercent: 3, takeProfitPercent: 6, positionSizePercent: 2 }
  },
  {
    id: 'builtin-bollinger-reversal',
    name: 'Bollinger Band Reversal',
    signal_direction: 'long',
    entry_conditions: [{ indicator: 'Price', operator: 'below', value: '', compareToIndicator: true, targetIndicator: 'BB_Lower' }],
    exit_conditions: [{ indicator: 'Price', operator: 'above', value: '', compareToIndicator: true, targetIndicator: 'BB_Upper' }],
    indicators: [{ type: 'BB_Upper', name: 'BB_Upper', period: 20 }, { type: 'BB_Lower', name: 'BB_Lower', period: 20 }],
    risk_settings: { stopLossPercent: 2.5, takeProfitPercent: 5, positionSizePercent: 2 }
  },
  {
    id: 'builtin-grid-trading',
    name: 'Grid Trading',
    signal_direction: 'trend',
    entry_conditions: [{ indicator: 'Price', operator: 'below', value: '', compareToIndicator: true, targetIndicator: 'BB_Lower' }],
    exit_conditions: [{ indicator: 'Price', operator: 'above', value: '', compareToIndicator: true, targetIndicator: 'BB_Upper' }],
    indicators: [{ type: 'BB_Upper', name: 'BB_Upper', period: 20 }, { type: 'BB_Lower', name: 'BB_Lower', period: 20 }],
    risk_settings: { stopLossPercent: 1.5, takeProfitPercent: 1.5, positionSizePercent: 2.5 }
  },
  {
    id: 'builtin-aggressive-momentum',
    name: 'Aggressive Momentum',
    signal_direction: 'trend',
    entry_conditions: [
      { indicator: 'RSI', operator: 'above', value: '60', compareToIndicator: false },
      { indicator: 'MACD', operator: 'above', value: '0', compareToIndicator: false }
    ],
    exit_conditions: [{ indicator: 'RSI', operator: 'below', value: '50', compareToIndicator: false }],
    indicators: [{ type: 'RSI', name: 'RSI', period: 14 }, { type: 'MACD', name: 'MACD', fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }],
    risk_settings: { stopLossPercent: 5, takeProfitPercent: 10, positionSizePercent: 3 }
  },
  {
    id: 'builtin-conservative-swing',
    name: 'Conservative Swing',
    signal_direction: 'long',
    entry_conditions: [{ indicator: 'RSI', operator: 'below', value: '35', compareToIndicator: false }],
    exit_conditions: [{ indicator: 'RSI', operator: 'above', value: '55', compareToIndicator: false }],
    indicators: [{ type: 'RSI', name: 'RSI', period: 14 }],
    risk_settings: { stopLossPercent: 1.5, takeProfitPercent: 3, positionSizePercent: 1 }
  },
  {
    id: 'builtin-macd-signal-cross',
    name: 'MACD Signal Cross',
    signal_direction: 'long',
    entry_conditions: [{ indicator: 'MACD', operator: 'above', value: '', compareToIndicator: true, targetIndicator: 'MACD_Signal' }],
    exit_conditions: [{ indicator: 'MACD', operator: 'below', value: '', compareToIndicator: true, targetIndicator: 'MACD_Signal' }],
    indicators: [{ type: 'MACD', name: 'MACD', fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }, { type: 'MACD_Signal', name: 'MACD_Signal', fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }],
    risk_settings: { stopLossPercent: 2, takeProfitPercent: 4, positionSizePercent: 1.5 }
  }
];

// ============= IMPROVEMENT #1: Quality Score System =============
// Replace tier-based filtering with unified 0-100 quality score
interface QualityFactors {
  adxScore: number;          // 0-25 points based on trend strength
  momentumScore: number;     // 0-25 points based on momentum confirmation
  alignmentScore: number;    // 0-20 points based on timeframe alignment
  technicalScore: number;    // 0-15 points based on StochRSI/Bollinger signals
  entryTimingScore: number;  // 0-15 points based on pullback/entry timing
}

const calculateQualityScore = (factors: QualityFactors): { score: number; breakdown: string } => {
  const score = Math.min(100, Math.max(0,
    factors.adxScore +
    factors.momentumScore +
    factors.alignmentScore +
    factors.technicalScore +
    factors.entryTimingScore
  ));
  
  const breakdown = `ADX:${factors.adxScore}/25 MOM:${factors.momentumScore}/25 ALIGN:${factors.alignmentScore}/20 TECH:${factors.technicalScore}/15 ENTRY:${factors.entryTimingScore}/15`;
  
  return { score, breakdown };
};

// ADX Score (0-25 points)
const getAdxScore = (adx: number): number => {
  if (adx >= 40) return 25;      // Exceptional trend
  if (adx >= 30) return 22;      // Very strong trend
  if (adx >= 25) return 18;      // Strong trend
  if (adx >= 20) return 14;      // Moderate trend
  if (adx >= 15) return 8;       // Weak trend
  if (adx >= 12) return 4;       // Very weak
  return 0;                       // No trend
};

// Momentum Score (0-25 points)
const getMomentumScore = (momentum: any): number => {
  if (!momentum) return 0;
  
  const state = momentum.state || "none";
  const confirms = momentum.confirms || false;
  const volumeConfirms = momentum.volumeConfirms || false;
  const building = momentum.building || false;
  const macdExpanding = momentum.macdExpanding || false;
  
  let score = 0;
  
  if (state === "confirmed" && confirms) {
    score = 20;
  } else if (state === "mixed" && macdExpanding) {
    // Mixed with expanding MACD is better than just mixed
    score = 14;
  } else if (building && macdExpanding) {
    // Building momentum with MACD expansion
    score = 12;
  } else if (state === "mixed") {
    score = 7;
  } else if (macdExpanding) {
    // MACD expanding without full confirmation
    score = 5;
  } else {
    score = 0;
  }
  
  // Volume bonus
  if (volumeConfirms) score += 5;
  
  return Math.min(25, score);
};

// Alignment Score (0-20 points)
const getAlignmentScore = (confidence: number, consistency: number, aligned: boolean, trendData: any): number => {
  let score = 0;
  
  // Full alignment bonus
  if (aligned) {
    score += 8;
  } else {
    // Partial alignment: check if lower timeframes agree even if 4h is neutral
    const htf = trendData?.higherTimeframeFilter;
    const mtf = trendData?.multiTimeframe;
    if (htf && mtf) {
      const trend4h = htf.trend4h || mtf.trend4h;
      const trend1h = htf.trend1h || mtf.trend1h;
      const trend30m = mtf.trend30m;
      
      // 4h neutral with 1h+30m aligned = partial alignment
      if (trend4h === "neutral" && trend1h === trend30m && trend1h !== "neutral") {
        score += 5;
      }
      // 1h and 30m agree but different from 4h (divergence scenario)
      else if (trend1h === trend30m && trend1h !== "neutral") {
        score += 3;
      }
    }
  }
  
  // Confidence component (0-6)
  if (confidence >= 75) score += 6;
  else if (confidence >= 65) score += 5;
  else if (confidence >= 55) score += 4;
  else if (confidence >= 45) score += 2;
  
  // Consistency component (0-6)
  if (consistency >= 70) score += 6;
  else if (consistency >= 60) score += 5;
  else if (consistency >= 50) score += 4;
  else if (consistency >= 40) score += 2;
  
  return Math.min(20, score);
};

// Technical Indicator Score (0-15 points)
const getTechnicalScore = (trendData: any, effectiveTrend: string, symbol: string): number => {
  let score = 0;
  
  const stochRsi = trendData?.stochasticRsi;
  const bollinger = trendData?.bollingerBands;
  const adx = trendData?.volatility?.adx || 0;
  
  if (!stochRsi || !bollinger) {
    console.log(`📊 ${symbol} TECH: No data available`);
    return 0;
  }
  
  // StochRSI signals - use actual values from calculate-trend
  const primarySignal = stochRsi.primarySignal || stochRsi["1h"]?.signal;
  const primaryK = stochRsi.primaryK || stochRsi["1h"]?.k || 50;
  
  // Bollinger signals - use actual values
  const squeeze = bollinger.squeeze || bollinger.squeezeActive || bollinger["1h"]?.squeeze;
  const pricePosition = bollinger.pricePosition || bollinger["1h"]?.pricePosition;
  const percentB = bollinger.percentB || bollinger["1h"]?.percentB || 50;
  
  let stochScore = 0;
  let bbScore = 0;
  
  // Strong ADX (>= 30) = momentum continuation is valid, don't penalize overbought/oversold
  const isStrongTrend = adx >= 30;
  
  if (effectiveTrend === "bullish") {
    if (isStrongTrend) {
      // MOMENTUM CONTINUATION: Strong trend = overbought is NOT bad, it's momentum!
      if (primaryK > 80) stochScore = 4; // Momentum continuation
      else if (primaryK > 60) stochScore = 3; // Strong momentum
      else if (primaryK < 30) stochScore = 6; // Pullback in strong trend = great entry
      else stochScore = 2; // Neutral
    } else {
      // PULLBACK ENTRY: Normal trend, prefer pullback entries
      if (primarySignal === "oversold" || primaryK < 20) stochScore = 8;
      else if (primaryK < 30) stochScore = 5;
      else if (primaryK < 40) stochScore = 2;
      else if (primaryK > 80) stochScore = 0; // Not ideal but not penalty
      else stochScore = 1;
    }
    
    // Bollinger for bullish
    if (pricePosition === "lower_zone" || percentB < 30) bbScore = 4;
    else if (pricePosition === "middle" || (percentB >= 30 && percentB <= 70)) bbScore = 2;
    else if (isStrongTrend && percentB > 70) bbScore = 2; // Momentum continuation
    else bbScore = 1;
    
  } else if (effectiveTrend === "bearish") {
    if (isStrongTrend) {
      // MOMENTUM CONTINUATION: Strong downtrend = oversold is NOT bad
      if (primaryK < 20) stochScore = 4; // Momentum continuation
      else if (primaryK < 40) stochScore = 3; // Strong momentum
      else if (primaryK > 70) stochScore = 6; // Rally in strong downtrend = great short entry
      else stochScore = 2; // Neutral
    } else {
      // PULLBACK ENTRY: Normal trend, prefer rally entries for shorts
      if (primarySignal === "overbought" || primaryK > 80) stochScore = 8;
      else if (primaryK > 70) stochScore = 5;
      else if (primaryK > 60) stochScore = 2;
      else if (primaryK < 20) stochScore = 0; // Not ideal but not penalty
      else stochScore = 1;
    }
    
    // Bollinger for bearish
    if (pricePosition === "upper_zone" || percentB > 70) bbScore = 4;
    else if (pricePosition === "middle" || (percentB >= 30 && percentB <= 70)) bbScore = 2;
    else if (isStrongTrend && percentB < 30) bbScore = 2; // Momentum continuation
    else bbScore = 1;
    
  } else {
    // Neutral trend - extremes indicate potential direction
    if (primaryK > 85) stochScore = 4;
    else if (primaryK > 75) stochScore = 2;
    else if (primaryK < 15) stochScore = 4;
    else if (primaryK < 25) stochScore = 2;
    else stochScore = 1;
    
    // Bollinger in neutral - extremes are opportunities
    if (percentB > 85 || percentB < 15) bbScore = 3;
    else if (percentB > 75 || percentB < 25) bbScore = 2;
    else bbScore = 1;
  }
  
  // Squeeze bonus applies to all trends
  if (squeeze) {
    bbScore += 5;
  }
  
  score = stochScore + bbScore;
  
  console.log(`📊 ${symbol} TECH: trend=${effectiveTrend} K=${primaryK.toFixed(1)} signal=${primarySignal} stochScore=${stochScore} | BB pos=${pricePosition} %B=${percentB.toFixed(1)} squeeze=${squeeze} bbScore=${bbScore} | total=${Math.max(0, Math.min(15, score))}`);
  
  return Math.max(0, Math.min(15, score));
};

// ============= REVERSAL RISK FILTER =============
// Block signals when leading indicators suggest potential reversal
interface ReversalRiskResult {
  isHighRisk: boolean;
  riskScore: number;      // 0-100, higher = more risk
  signals: string[];      // What indicators triggered the risk
  reason: string;
}

const detectReversalRisk = (trendData: any, intendedDirection: string): ReversalRiskResult => {
  const signals: string[] = [];
  let riskScore = 0;
  
  const momentum = trendData?.momentum || {};
  const stochRsi = trendData?.stochasticRsi?.aggregated || trendData?.stochasticRsi || {};
  const trend1h = trendData?.higherTimeframeFilter?.trend1h || trendData?.multiTimeframe?.trend1h;
  
  // 1. Momentum divergence - price moving one way, MACD moving opposite
  if (momentum.hasDivergence) {
    riskScore += 30;
    signals.push("MACD divergence detected");
  }
  
  // 2. Momentum NOT confirmed despite trend
  if (!momentum.confirms && momentum.state !== "confirmed") {
    riskScore += 15;
    signals.push(`Momentum not confirmed (state: ${momentum.state || "none"})`);
  }
  
  // 3. Last close doesn't align with trend direction
  if (!momentum.lastCloseAlignsWithTrend) {
    riskScore += 10;
    signals.push("Last close opposes trend direction");
  }
  
  // 4. MACD direction misaligned (e.g., MACD negative in bullish trend)
  if (!momentum.macdDirectionAligned) {
    riskScore += 15;
    signals.push("MACD direction misaligned with trend");
  }
  
  // 5. StochRSI showing opposing cross
  if (intendedDirection === "bullish" || intendedDirection === "long") {
    // Trying to go LONG but StochRSI shows bearish signals
    if (stochRsi.bearishCrossCount >= 1) {
      riskScore += 25;
      signals.push(`StochRSI bearish cross (${stochRsi.bearishCrossCount} timeframes)`);
    }
    if (stochRsi.overboughtCount >= 2) {
      riskScore += 15;
      signals.push(`StochRSI overbought on ${stochRsi.overboughtCount} timeframes`);
    }
    // 1h trend opposing the intended direction
    if (trend1h === "bearish") {
      riskScore += 20;
      signals.push("1h trend is bearish (opposing LONG entry)");
    }
  } else if (intendedDirection === "bearish" || intendedDirection === "short") {
    // Trying to go SHORT but StochRSI shows bullish signals
    if (stochRsi.bullishCrossCount >= 1) {
      riskScore += 25;
      signals.push(`StochRSI bullish cross (${stochRsi.bullishCrossCount} timeframes)`);
    }
    if (stochRsi.oversoldCount >= 2) {
      riskScore += 15;
      signals.push(`StochRSI oversold on ${stochRsi.oversoldCount} timeframes`);
    }
    // 1h trend opposing the intended direction
    if (trend1h === "bullish") {
      riskScore += 20;
      signals.push("1h trend is bullish (opposing SHORT entry)");
    }
  }
  
  // Cap at 100
  riskScore = Math.min(100, riskScore);
  
  // High risk threshold: 50+ blocks signal generation
  const isHighRisk = riskScore >= 50;
  
  const reason = isHighRisk 
    ? `Reversal risk HIGH (${riskScore}/100): ${signals.join(", ")}`
    : signals.length > 0 
      ? `Reversal risk moderate (${riskScore}/100): ${signals.join(", ")}`
      : `Reversal risk low (${riskScore}/100)`;
  
  return { isHighRisk, riskScore, signals, reason };
};

// ============= IMPROVEMENT #2: Market Regime Detection =============
type MarketRegime = "trending" | "ranging" | "choppy" | "volatile";

const detectMarketRegime = (trendData: any): { regime: MarketRegime; tradeable: boolean; reason: string } => {
  const adx = trendData.volatility?.adx || 0;
  const atrPercent = trendData.volatility?.atrPercent || 0;
  const confidence = trendData.confidence || 0;
  const consistency = trendData.trendConsistency || 0;
  
  // Check for ranging market (ADX low, mixed signals)
  if (adx < 15 && confidence < 50) {
    return { 
      regime: "ranging", 
      tradeable: false, 
      reason: `Ranging market (ADX ${adx.toFixed(1)}, confidence ${confidence}%)` 
    };
  }
  
  // Check for choppy market (conflicting timeframes, inconsistent)
  if (consistency < 40 && confidence < 55) {
    return { 
      regime: "choppy", 
      tradeable: false, 
      reason: `Choppy market (consistency ${consistency}%, confidence ${confidence}%)` 
    };
  }
  
  // Check for excessive volatility (may be news event)
  if (atrPercent > 4.0 && adx < 25) {
    return { 
      regime: "volatile", 
      tradeable: false, 
      reason: `Excessive volatility without trend (ATR ${atrPercent.toFixed(2)}%, ADX ${adx.toFixed(1)})` 
    };
  }
  
  // Trending market - tradeable
  if (adx >= 20 || (adx >= 15 && confidence >= 60)) {
    return { 
      regime: "trending", 
      tradeable: true, 
      reason: `Trending market (ADX ${adx.toFixed(1)}, confidence ${confidence}%)` 
    };
  }
  
  // Edge case - weak trend but acceptable
  if (adx >= 12 && confidence >= 65 && consistency >= 55) {
    return { 
      regime: "trending", 
      tradeable: true, 
      reason: `Weak trend with good alignment (ADX ${adx.toFixed(1)}, confidence ${confidence}%)` 
    };
  }
  
  return { 
    regime: "ranging", 
    tradeable: false, 
    reason: `Insufficient trend conditions (ADX ${adx.toFixed(1)}, confidence ${confidence}%)` 
  };
};

// ============= IMPROVEMENT #3: Pullback Entry Detection =============
interface PullbackAnalysis {
  isPullback: boolean;
  pullbackDepth: number;     // 0-100% of recent swing
  entryTimingScore: number;  // 0-15 bonus points
  reason: string;
}

const analyzePullbackEntry = (trendData: any, trend: string): PullbackAnalysis => {
  const indicators = trendData.indicators || {};
  const stochRsi = trendData.stochasticRsi?.aggregated || {};
  const bollingerBands = trendData.bollingerBands || {};
  const rsi = indicators.rsi || 50;
  const adx = trendData?.volatility?.adx || 0;
  const momentum = trendData?.momentum || {};
  
  // Strong ADX = momentum continuation is valid strategy
  const isStrongTrend = adx >= 30;
  const hasMacdExpanding = momentum.macdExpanding === true;
  const isMomentumConfirmed = momentum.state === "confirmed" || momentum.state === "mixed";
  
  // For bullish trend, look for pullback OR momentum continuation
  if (trend === "bullish") {
    // PULLBACK ENTRIES: Oversold RSI in bullish trend = great entry
    if (rsi < 40 || stochRsi.oversoldCount >= 1) {
      return {
        isPullback: true,
        pullbackDepth: 100 - rsi,
        entryTimingScore: 12,
        reason: "Bullish pullback: RSI oversold in uptrend"
      };
    }
    
    // Near lower Bollinger band in bullish trend
    if (bollingerBands["1h"]?.pricePosition === "lower_zone") {
      return {
        isPullback: true,
        pullbackDepth: 30,
        entryTimingScore: 10,
        reason: "Bullish pullback: Price near lower Bollinger band"
      };
    }
    
    // StochRSI bullish cross = reversal from pullback
    if (stochRsi.bullishCrossCount >= 1) {
      return {
        isPullback: true,
        pullbackDepth: 25,
        entryTimingScore: 8,
        reason: "Bullish pullback: StochRSI bullish cross"
      };
    }
    
    // MOMENTUM CONTINUATION: Strong trend + MACD expanding = ride the momentum!
    if (isStrongTrend && (hasMacdExpanding || isMomentumConfirmed)) {
      return {
        isPullback: false,
        pullbackDepth: 0,
        entryTimingScore: 8,
        reason: "Momentum continuation: Strong ADX with MACD expansion"
      };
    }
    
    // Strong trend but overbought - still give some points (momentum play)
    if (isStrongTrend && rsi > 65) {
      return {
        isPullback: false,
        pullbackDepth: 0,
        entryTimingScore: 5,
        reason: "Momentum continuation: Strong trend despite overbought"
      };
    }
    
    // RSI in neutral zone = acceptable entry
    if (rsi >= 40 && rsi <= 65) {
      return {
        isPullback: false,
        pullbackDepth: 0,
        entryTimingScore: 5,
        reason: "Acceptable entry: RSI in neutral zone"
      };
    }
    
    // Overbought in weak trend - cautious but not blocking
    if (rsi > 70 || stochRsi.overboughtCount >= 2) {
      return {
        isPullback: false,
        pullbackDepth: 0,
        entryTimingScore: 2, // Changed from -5 to 2 - don't block, just reduce score
        reason: "Cautious entry: Overbought but trend intact"
      };
    }
  }
  
  // For bearish trend, look for rally (price spiked but downtrend intact)
  if (trend === "bearish") {
    // Overbought RSI in bearish trend = shorting opportunity
    if (rsi > 60 || stochRsi.overboughtCount >= 1) {
      return {
        isPullback: true,
        pullbackDepth: rsi - 50,
        entryTimingScore: 12,
        reason: "Bearish rally: RSI overbought in downtrend"
      };
    }
    
    // Near upper Bollinger band in bearish trend
    if (bollingerBands["1h"]?.pricePosition === "upper_zone") {
      return {
        isPullback: true,
        pullbackDepth: 30,
        entryTimingScore: 10,
        reason: "Bearish rally: Price near upper Bollinger band"
      };
    }
    
    // StochRSI bearish cross = reversal from rally
    if (stochRsi.bearishCrossCount >= 1) {
      return {
        isPullback: true,
        pullbackDepth: 25,
        entryTimingScore: 8,
        reason: "Bearish rally: StochRSI bearish cross"
      };
    }
    
    // RSI in neutral zone (not oversold) = acceptable entry
    if (rsi <= 60 && rsi >= 35) {
      return {
        isPullback: false,
        pullbackDepth: 0,
        entryTimingScore: 5,
        reason: "Acceptable entry: RSI in neutral zone"
      };
    }
    
    // MOMENTUM CONTINUATION: Strong downtrend + momentum = ride the momentum!
    if (isStrongTrend && (hasMacdExpanding || isMomentumConfirmed)) {
      return {
        isPullback: false,
        pullbackDepth: 0,
        entryTimingScore: 8,
        reason: "Momentum continuation: Strong ADX with MACD expansion"
      };
    }
    
    // Strong downtrend but oversold - still give some points
    if (isStrongTrend && rsi < 35) {
      return {
        isPullback: false,
        pullbackDepth: 0,
        entryTimingScore: 5,
        reason: "Momentum continuation: Strong downtrend despite oversold"
      };
    }
    
    // Oversold in weak downtrend - cautious but not blocking
    if (rsi < 30 || stochRsi.oversoldCount >= 2) {
      return {
        isPullback: false,
        pullbackDepth: 0,
        entryTimingScore: 2, // Changed from -5 to 2 - don't block, just reduce score
        reason: "Cautious entry: Oversold but downtrend intact"
      };
    }
  }
  
  // Default - neutral timing
  return {
    isPullback: false,
    pullbackDepth: 0,
    entryTimingScore: 3,
    reason: "Neutral entry timing"
  };
};

// Evaluate StochRSI signals for entry timing
const evaluateStochRSI = (stochRsi: any, trend: string): { boost: number; signal: string } => {
  if (!stochRsi) return { boost: 0, signal: "none" };
  
  const { aggregated } = stochRsi;
  if (!aggregated) return { boost: 0, signal: "none" };
  
  if (trend === "bullish") {
    if (aggregated.oversoldCount >= 2) return { boost: 0.15, signal: "strong_oversold" };
    if (aggregated.bullishCrossCount >= 1) return { boost: 0.1, signal: "bullish_cross" };
    if (aggregated.overboughtCount >= 2) return { boost: -0.1, signal: "overbought_warning" };
  }
  
  if (trend === "bearish") {
    if (aggregated.overboughtCount >= 2) return { boost: 0.15, signal: "strong_overbought" };
    if (aggregated.bearishCrossCount >= 1) return { boost: 0.1, signal: "bearish_cross" };
    if (aggregated.oversoldCount >= 2) return { boost: -0.1, signal: "oversold_warning" };
  }
  
  return { boost: 0, signal: "neutral" };
};

// Evaluate Bollinger Bands for entry opportunities
const evaluateBollingerBands = (bollingerBands: any, trend: string): { boost: number; signal: string } => {
  if (!bollingerBands) return { boost: 0, signal: "none" };
  
  const { squeezed, breakoutPotential } = bollingerBands;
  
  if (squeezed && breakoutPotential) return { boost: 0.2, signal: "squeeze_breakout" };
  if (squeezed) return { boost: 0.1, signal: "squeeze" };
  
  const tf1h = bollingerBands["1h"];
  if (tf1h) {
    if (trend === "bullish" && tf1h.pricePosition === "lower_zone") return { boost: 0.1, signal: "near_lower_band" };
    if (trend === "bearish" && tf1h.pricePosition === "upper_zone") return { boost: 0.1, signal: "near_upper_band" };
  }
  
  return { boost: 0, signal: "neutral" };
};

// Calculate position size based on quality score
// Must align with MIN_QUALITY_SCORE threshold (50)
const getPositionSizeFromQuality = (qualityScore: number): number => {
  if (qualityScore >= 85) return 1.0;      // Full size for excellent signals
  if (qualityScore >= 75) return 0.85;     // Near full
  if (qualityScore >= 65) return 0.7;      // Reduced
  if (qualityScore >= 55) return 0.5;      // Lower acceptable
  if (qualityScore >= 50) return 0.35;     // Minimum acceptable (matches MIN_QUALITY_SCORE)
  return 0;                                 // Don't trade
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing required environment variables");
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    
    let userId: string;
    const token = authHeader.replace("Bearer ", "");
    
    let requestBody: any = {};
    try {
      requestBody = await req.json();
    } catch { }
    
    if (requestBody?.user_id && token === supabaseServiceKey) {
      userId = requestBody.user_id;
      console.log(`Service role call for user ${userId}`);
    } else {
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      if (userError || !user) throw new Error("Unauthorized");
      userId = user.id;
    }
    
    console.log(`🔍 Analyzing signals for user ${userId}`);

    // Fetch risk parameters
    const { data: riskParams, error: riskError } = await supabase
      .from("risk_parameters")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (riskError || !riskParams) {
      return new Response(JSON.stringify({ message: "Risk parameters not configured", signals: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!riskParams.is_trading_enabled) {
      return new Response(JSON.stringify({ message: "Trading is disabled", signals: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch active trading symbols
    const { data: symbols, error: symbolsError } = await supabase
      .from("trading_symbols_config")
      .select("symbol")
      .eq("user_id", userId)
      .eq("is_active", true);

    if (symbolsError || !symbols?.length) {
      return new Response(JSON.stringify({ message: "No active symbols configured", signals: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch custom strategies (REQUIRED)
    const { data: customStrategies, error: strategiesError } = await supabase
      .from("custom_strategies")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true);

    // Combine user's custom strategies with built-in templates
    // User strategies are evaluated first (they take priority), then built-ins fill gaps
    const userStrategies = customStrategies || [];
    const userStrategyNames = new Set(userStrategies.map(s => s.name.toLowerCase()));
    
    // Add built-in templates that don't duplicate user strategies
    const builtInToInclude = BUILT_IN_TEMPLATES.filter(t => 
      !userStrategyNames.has(t.name.toLowerCase())
    );
    
    const allStrategies = [...userStrategies, ...builtInToInclude];
    
    console.log(`📊 ${symbols.length} symbols | ${userStrategies.length} user strategies + ${builtInToInclude.length} built-in templates = ${allStrategies.length} total`);

    // Fetch recent signals and active positions
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const { data: existingSignals } = await supabase
      .from("trading_signals")
      .select("symbol")
      .eq("user_id", userId)
      .gte("created_at", oneMinuteAgo);
    const existingSignalsSet = new Set(existingSignals?.map((s) => s.symbol) || []);

    const { data: activePositions } = await supabase
      .from("positions")
      .select("symbol")
      .eq("user_id", userId)
      .eq("status", "active");

    const openTradesPerSymbol = new Map<string, number>();
    activePositions?.forEach((p) => {
      openTradesPerSymbol.set(p.symbol, (openTradesPerSymbol.get(p.symbol) || 0) + 1);
    });

    // Helper functions
    const calculateRSI = (prices: number[], period = 14): number => {
      if (prices.length < period + 1) return 50;
      let gains = 0, losses = 0;
      for (let i = 1; i <= period; i++) {
        const change = prices[i] - prices[i - 1];
        if (change > 0) gains += change;
        else losses += Math.abs(change);
      }
      let avgGain = gains / period;
      let avgLoss = losses / period;
      for (let i = period + 1; i < prices.length; i++) {
        const change = prices[i] - prices[i - 1];
        avgGain = (avgGain * (period - 1) + (change > 0 ? change : 0)) / period;
        avgLoss = (avgLoss * (period - 1) + (change < 0 ? Math.abs(change) : 0)) / period;
      }
      return avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    };

    const calculateEMA = (prices: number[], period: number): number => {
      if (prices.length < period) return prices[prices.length - 1] || 0;
      const multiplier = 2 / (period + 1);
      let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
      for (let i = period; i < prices.length; i++) {
        ema = (prices[i] - ema) * multiplier + ema;
      }
      return ema;
    };

    const calculateEMAArray = (prices: number[], period: number): number[] => {
      const emaArray: number[] = [];
      if (prices.length < period) return emaArray;
      const multiplier = 2 / (period + 1);
      let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
      for (let i = 0; i < period - 1; i++) emaArray.push(0);
      emaArray.push(ema);
      for (let i = period; i < prices.length; i++) {
        ema = (prices[i] - ema) * multiplier + ema;
        emaArray.push(ema);
      }
      return emaArray;
    };

    const calculateMACD = (prices: number[]): { macd: number; signal: number; histogram: number } => {
      if (prices.length < 26) return { macd: 0, signal: 0, histogram: 0 };
      const ema12Array = calculateEMAArray(prices, 12);
      const ema26Array = calculateEMAArray(prices, 26);
      if (!ema12Array.length || !ema26Array.length) return { macd: 0, signal: 0, histogram: 0 };
      const macd = (ema12Array[ema12Array.length - 1] || 0) - (ema26Array[ema26Array.length - 1] || 0);
      const macdValues: number[] = [];
      const minLength = Math.min(ema12Array.length, ema26Array.length);
      for (let i = Math.max(0, minLength - Math.min(prices.length - 26, minLength)); i < minLength; i++) {
        macdValues.push((ema12Array[i] || 0) - (ema26Array[i] || 0));
      }
      const signal = macdValues.length >= 9 ? calculateEMA(macdValues, 9) : macd * 0.9;
      return { macd, signal, histogram: macd - signal };
    };

    const calculateBollingerBands = (prices: number[], period = 20, stdDev = 2) => {
      if (prices.length < period) {
        const p = prices[prices.length - 1] || 0;
        return { upper: p, middle: p, lower: p };
      }
      const recentPrices = prices.slice(-period);
      const middle = recentPrices.reduce((a, b) => a + b, 0) / period;
      const variance = recentPrices.reduce((sum, p) => sum + Math.pow(p - middle, 2), 0) / period;
      const sd = Math.sqrt(variance);
      return { upper: middle + sd * stdDev, middle, lower: middle - sd * stdDev };
    };

    const calculateIndicator = (config: any, price: number, volume: number, prices: number[], volumes: number[]): number => {
      switch (config.type) {
        case "RSI": return calculateRSI(prices, config.period || 14);
        case "EMA": return calculateEMA(prices, config.period || 20);
        case "MACD": return calculateMACD(prices).macd;
        case "MACD_Signal": return calculateMACD(prices).signal;
        case "BB_Upper": return calculateBollingerBands(prices, config.period || 20).upper;
        case "BB_Middle": return calculateBollingerBands(prices, config.period || 20).middle;
        case "BB_Lower": return calculateBollingerBands(prices, config.period || 20).lower;
        case "Volume": return volume;
        case "Price": return price;
        default: return 0;
      }
    };

    const evaluateCondition = (condition: any, values: Map<string, number>, prevValues: Map<string, number>): boolean => {
      const val = values.get(condition.indicator) || 0;
      const prevVal = prevValues.get(condition.indicator) || 0;
      const target = condition.compareToIndicator ? (values.get(condition.targetIndicator) || 0) : parseFloat(condition.value || "0");
      const prevTarget = condition.compareToIndicator ? (prevValues.get(condition.targetIndicator) || 0) : parseFloat(condition.value || "0");
      switch (condition.operator?.toLowerCase()) {
        case "above": return val > target;
        case "crosses_above": return prevVal <= prevTarget && val > target;
        case "below": return val < target;
        case "crosses_below": return prevVal >= prevTarget && val < target;
        default: return false;
      }
    };

    const fetchHistoricalKlines = async (symbol: string): Promise<{ prices: number[]; volumes: number[] }> => {
      try {
        const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=15m&limit=50`);
        if (!response.ok) throw new Error(`Binance API error: ${response.status}`);
        const klines = await response.json();
        return {
          prices: klines.map((k: any) => parseFloat(k[4])).filter(Number.isFinite),
          volumes: klines.map((k: any) => parseFloat(k[5])).filter(Number.isFinite),
        };
      } catch (error) {
        console.error(`Failed to fetch klines for ${symbol}:`, error);
        return { prices: [], volumes: [] };
      }
    };

    // Fetch market data in parallel
    const symbolsList = symbols.map((s) => s.symbol);
    const [marketDataResults, historicalResults] = await Promise.all([
      Promise.all(symbolsList.map(async (symbol) => {
        try {
          const response = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);
          return await response.json();
        } catch { return null; }
      })),
      Promise.all(symbolsList.map(async (symbol) => ({ symbol, data: await fetchHistoricalKlines(symbol) })))
    ]);

    const marketDataMap = new Map(marketDataResults.filter(Boolean).map((d) => [d.symbol, d]));
    const historicalDataMap = new Map<string, { prices: number[]; volumes: number[] }>();
    historicalResults.forEach(({ symbol, data }) => historicalDataMap.set(symbol, data));

    // Fetch trend data in PARALLEL for eligible symbols
    const eligibleSymbols = symbolsList.filter((symbol) => {
      const count = openTradesPerSymbol.get(symbol) || 0;
      return !existingSignalsSet.has(symbol) && count < riskParams.max_trades_per_symbol;
    });

    console.log(`🚀 Fetching trend data for ${eligibleSymbols.length} eligible symbols`);

    const trendResults = await Promise.all(eligibleSymbols.map(async (symbol) => {
      try {
        const { data, error } = await supabase.functions.invoke("calculate-trend", { body: { symbol } });
        return { symbol, trendData: error ? null : data };
      } catch { return { symbol, trendData: null }; }
    }));

    const trendDataMap = new Map<string, any>();
    trendResults.forEach(({ symbol, trendData }) => {
      if (trendData) trendDataMap.set(symbol, trendData);
    });

    console.log(`✅ Got trend data for ${trendDataMap.size} symbols`);

    // Track statistics
    const signals: SignalData[] = [];
    let totalSignalsGenerated = 0;
    let rejectedByRegime = 0;
    let rejectedByQuality = 0;
    let rejectedByStrategy = 0;
    let rejectedByReversalRisk = 0;
    
    // Loss Recovery Mode - increase quality threshold after consecutive losses
    const isInRecoveryMode = riskParams.loss_recovery_mode_enabled && 
      (riskParams.consecutive_losses || 0) >= (riskParams.consecutive_loss_threshold || 3);
    const recoveryConfidenceBoost = riskParams.loss_recovery_confidence_boost || 10;
    const recoveryPositionSizeMultiplier = (riskParams.loss_recovery_position_size_percent || 50) / 100;
    
    const BASE_MIN_QUALITY_SCORE = 50;
    const MIN_QUALITY_SCORE = isInRecoveryMode 
      ? BASE_MIN_QUALITY_SCORE + recoveryConfidenceBoost 
      : BASE_MIN_QUALITY_SCORE;
    
    if (isInRecoveryMode) {
      console.log(`🔄 LOSS RECOVERY MODE ACTIVE: ${riskParams.consecutive_losses} consecutive losses`);
      console.log(`   → Quality threshold: ${MIN_QUALITY_SCORE} (base ${BASE_MIN_QUALITY_SCORE} + ${recoveryConfidenceBoost})`);
      console.log(`   → Position size multiplier: ${recoveryPositionSizeMultiplier * 100}%`);
    }

    // Analyze each symbol
    for (const { symbol } of symbols) {
      const currentTradeCount = openTradesPerSymbol.get(symbol) || 0;

      if (existingSignalsSet.has(symbol)) {
        await supabase.from("signal_rejection_log").insert({
          user_id: userId, symbol,
          rejection_reason: "Already has active signal from last minute",
          filters_status: { currentTradeCount },
          checked_at: new Date().toISOString(),
        });
        continue;
      }

      if (currentTradeCount >= riskParams.max_trades_per_symbol) {
        await supabase.from("signal_rejection_log").insert({
          user_id: userId, symbol,
          rejection_reason: `Max trades per symbol reached: ${currentTradeCount}/${riskParams.max_trades_per_symbol} trades active`,
          filters_status: { currentTradeCount, maxTradesPerSymbol: riskParams.max_trades_per_symbol },
          checked_at: new Date().toISOString(),
        });
        continue;
      }

      const trendData = trendDataMap.get(symbol);
      if (!trendData) continue;

      try {
        const { trend, confidence, trendConsistency, higherTimeframeFilter } = trendData;
        const adx = trendData.volatility?.adx || 0;
        const momentum = trendData.momentum;

        // ============= IMPROVEMENT #2: Market Regime Filter =============
        const regime = detectMarketRegime(trendData);
        if (!regime.tradeable) {
          rejectedByRegime++;
          await supabase.from("signal_rejection_log").insert({
            user_id: userId, symbol,
            rejection_reason: `Market regime not tradeable: ${regime.reason}`,
            filters_status: { regime: regime.regime, reason: regime.reason, adx, confidence, trendConsistency },
            trend_data: trendData,
            checked_at: new Date().toISOString(),
          });
          continue;
        }

        // ============= REVERSAL RISK FILTER =============
        // Check for leading indicators that suggest potential reversal
        const reversalRisk = detectReversalRisk(trendData, trend);
        if (reversalRisk.isHighRisk) {
          rejectedByReversalRisk++;
          console.log(`⚠️ ${symbol}: ${reversalRisk.reason}`);
          await supabase.from("signal_rejection_log").insert({
            user_id: userId, symbol,
            rejection_reason: `Reversal risk too high: ${reversalRisk.reason}`,
            filters_status: { 
              reversalRiskScore: reversalRisk.riskScore,
              reversalSignals: reversalRisk.signals,
              trend,
              momentum: {
                confirms: momentum?.confirms,
                state: momentum?.state,
                hasDivergence: momentum?.hasDivergence,
                lastCloseAlignsWithTrend: momentum?.lastCloseAlignsWithTrend,
                macdDirectionAligned: momentum?.macdDirectionAligned
              },
              stochRsi: trendData.stochasticRsi?.aggregated,
              trend1h: higherTimeframeFilter?.trend1h
            },
            trend_data: trendData,
            checked_at: new Date().toISOString(),
          });
          continue;
        } else if (reversalRisk.riskScore > 0) {
          console.log(`📊 ${symbol}: ${reversalRisk.reason}`);
        }

        // ============= Technical Indicators =============
        const stochRsiEval = evaluateStochRSI(trendData.stochasticRsi, trend);
        const bollingerEval = evaluateBollingerBands(trendData.bollingerBands, trend);

        // ============= IMPROVEMENT #3: Pullback Entry Detection =============
        const pullbackAnalysis = analyzePullbackEntry(trendData, trend);

        // ============= IMPROVEMENT #1: Quality Score System =============
        const qualityFactors: QualityFactors = {
          adxScore: getAdxScore(adx),
          momentumScore: getMomentumScore(momentum),
          alignmentScore: getAlignmentScore(confidence, trendConsistency, higherTimeframeFilter?.aligned || false, trendData),
          technicalScore: getTechnicalScore(trendData, trend, symbol),
          entryTimingScore: Math.max(0, pullbackAnalysis.entryTimingScore),
        };

        const { score: qualityScore, breakdown } = calculateQualityScore(qualityFactors);

        console.log(`📊 ${symbol} Quality: ${qualityScore}/100 [${breakdown}] | Regime: ${regime.regime} | Entry: ${pullbackAnalysis.reason}`);

        // Check minimum quality threshold
        if (qualityScore < MIN_QUALITY_SCORE) {
          rejectedByQuality++;
          await supabase.from("signal_rejection_log").insert({
            user_id: userId, symbol,
            rejection_reason: `Quality score too low: ${qualityScore}/100 (min: ${MIN_QUALITY_SCORE})`,
            filters_status: {
              qualityScore, breakdown, minRequired: MIN_QUALITY_SCORE,
              factors: qualityFactors,
              regime: regime.regime,
              entryTiming: pullbackAnalysis.reason,
            },
            trend_data: trendData,
            checked_at: new Date().toISOString(),
          });
          continue;
        }

        // Store trend info for strategy-level filtering
        const tradeDirection = higherTimeframeFilter?.tradeDirection || trend;
        const trend1h = higherTimeframeFilter?.trend1h || trendData.multiTimeframe?.trend1h;

        // Get market data
        const marketData = marketDataMap.get(symbol);
        if (!marketData) {
          console.log(`⚠️ ${symbol}: Missing market data`);
          continue;
        }
        const currentPrice = parseFloat(marketData.lastPrice);
        if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
          console.log(`⚠️ ${symbol}: Invalid price: ${marketData.lastPrice}`);
          continue;
        }
        const currentVolume = parseFloat(marketData.volume) || 0;

        const historicalData = historicalDataMap.get(symbol);
        if (!historicalData || historicalData.prices.length < 26) {
          console.log(`⚠️ ${symbol}: Missing or insufficient historical data (${historicalData?.prices?.length || 0} candles)`);
          continue;
        }
        const { prices: historicalPrices, volumes: historicalVolumes } = historicalData;

        // ============= IMPROVEMENT #4: Evaluate ALL strategies, pick best =============
        interface StrategyCandidate {
          strategy: any;
          score: number;
          indicatorValues: Map<string, number>;
          signalType: "long" | "short";
        }
        const candidates: StrategyCandidate[] = [];

        console.log(`📋 ${symbol}: Evaluating ${allStrategies.length} strategies`);
        
        for (const strategy of allStrategies) {
          const indicators = strategy.indicators || [];
          const entryConditions = strategy.entry_conditions || [];
          if (!indicators.length || !entryConditions.length) {
            console.log(`⚠️ ${symbol}: Strategy "${strategy.name}" skipped - no indicators/conditions`);
            continue;
          }

          const indicatorValues = new Map<string, number>();
          for (const config of indicators) {
            if (!config?.type) continue;
            indicatorValues.set(config.name || config.type, calculateIndicator(config, currentPrice, currentVolume, historicalPrices, historicalVolumes));
          }
          indicatorValues.set("Price", currentPrice);
          indicatorValues.set("Volume", currentVolume);

          const prevPrice = historicalPrices[historicalPrices.length - 2] || currentPrice;
          const prevVolume = historicalVolumes[historicalVolumes.length - 2] || currentVolume;
          const prevPrices = historicalPrices.slice(0, -1);
          const prevVolumes = historicalVolumes.slice(0, -1);

          const prevIndicatorValues = new Map<string, number>();
          for (const config of indicators) {
            if (!config?.type) continue;
            prevIndicatorValues.set(config.name || config.type, calculateIndicator(config, prevPrice, prevVolume, prevPrices, prevVolumes));
          }
          prevIndicatorValues.set("Price", prevPrice);
          prevIndicatorValues.set("Volume", prevVolume);

          try {
            const conditionResults = entryConditions.map((c: any) => {
              if (!c) return { condition: null, result: false };
              const result = evaluateCondition(c, indicatorValues, prevIndicatorValues);
              return { 
                condition: `${c.indicator} ${c.comparison} ${c.value}`, 
                result,
                currentValue: indicatorValues.get(c.indicator)
              };
            });
            
            const conditionsMet = conditionResults.every((r: { result: boolean }) => r.result);
            console.log(`📊 ${symbol} "${strategy.name}": ${conditionsMet ? '✅ PASS' : '❌ FAIL'} - ${JSON.stringify(conditionResults)}`);
            
            if (conditionsMet) {
              // ============= SIGNAL DIRECTION FILTERING =============
              // Check if strategy's signal_direction is compatible with current trend
              const strategyDirection = strategy.signal_direction || 'trend';
              
              // Determine what signal type this strategy would generate
              let strategySignalType: "long" | "short" | null = null;
              if (strategyDirection === 'long') {
                // Strategy only generates LONG signals - only valid in bullish/neutral trends
                if (tradeDirection === 'bearish') {
                  console.log(`⚠️ ${symbol} "${strategy.name}": SKIP - long-only strategy in bearish trend`);
                  continue;
                }
                strategySignalType = 'long';
              } else if (strategyDirection === 'short') {
                // Strategy only generates SHORT signals - only valid in bearish/neutral trends  
                if (tradeDirection === 'bullish') {
                  console.log(`⚠️ ${symbol} "${strategy.name}": SKIP - short-only strategy in bullish trend`);
                  continue;
                }
                strategySignalType = 'short';
              } else {
                // 'trend' mode - follow the current trend direction
                if (tradeDirection === 'bullish') strategySignalType = 'long';
                else if (tradeDirection === 'bearish') strategySignalType = 'short';
                else {
                  console.log(`⚠️ ${symbol} "${strategy.name}": SKIP - neutral trend, no clear direction`);
                  continue;
                }
              }
              
              // 1H TREND VALIDATION - prevent opening against immediate trend
              if (strategySignalType === 'long' && trend1h === 'bearish') {
                console.log(`⚠️ ${symbol} "${strategy.name}": SKIP - LONG signal but 1h is bearish`);
                continue;
              }
              if (strategySignalType === 'short' && trend1h === 'bullish') {
                console.log(`⚠️ ${symbol} "${strategy.name}": SKIP - SHORT signal but 1h is bullish`);
                continue;
              }
              
              // Calculate strategy-specific score bonus
              const strategyBonus = (strategy.risk_settings?.priority || 5) / 10; // 0-1 bonus
              candidates.push({
                strategy,
                score: qualityScore + strategyBonus * 5,
                indicatorValues,
                signalType: strategySignalType,
              });
            }
          } catch (err) {
            console.log(`❌ ${symbol}: Strategy "${strategy.name}" error: ${err}`);
            continue;
          }
        }

        if (candidates.length === 0) {
          rejectedByStrategy++;
          await supabase.from("signal_rejection_log").insert({
            user_id: userId, symbol,
            rejection_reason: `No strategy conditions met (quality passed: ${qualityScore}/100)`,
            filters_status: {
              qualityScore, breakdown,
              strategiesEvaluated: allStrategies.length,
              regime: regime.regime,
            },
            trend_data: trendData,
            checked_at: new Date().toISOString(),
          });
          continue;
        }

        // Select BEST strategy (highest score)
        candidates.sort((a, b) => b.score - a.score);
        const best = candidates[0];
        const strategy = best.strategy;
        const signalType = best.signalType;
        console.log(`🎯 ${symbol}: Selected "${strategy.name}" (${candidates.length} strategies matched, best score: ${best.score}, direction: ${signalType})`);
        
        const indicatorValues = best.indicatorValues;

        // Calculate position size from quality score, apply recovery mode reduction
        let positionSizeMultiplier = getPositionSizeFromQuality(qualityScore);
        if (isInRecoveryMode) {
          positionSizeMultiplier *= recoveryPositionSizeMultiplier;
          console.log(`🔄 ${symbol}: Recovery mode - position size reduced to ${(positionSizeMultiplier * 100).toFixed(0)}%`);
        }
        const strategyPositionSize = (strategy.risk_settings?.positionSizePercent || 100) * positionSizeMultiplier;

        const stopLossPercent = strategy.risk_settings?.stopLossPercent || riskParams.max_risk_per_trade_percent;
        const takeProfitPercent = strategy.risk_settings?.takeProfitPercent || stopLossPercent * 2.5;

        // Map "neutral" to "ranging" for database enum compatibility
        const dbTrend = trend === "neutral" ? "ranging" : trend;
        
        const signal: SignalData = {
          user_id: userId,
          symbol,
          signal_type: signalType,
          trend: dbTrend,
          confidence_score: Math.min(confidence, 100),
          entry_price: currentPrice,
          stop_loss: signalType === "long"
            ? currentPrice * (1 - stopLossPercent / 100)
            : currentPrice * (1 + stopLossPercent / 100),
          take_profit: signalType === "long"
            ? currentPrice * (1 + takeProfitPercent / 100)
            : currentPrice * (1 - takeProfitPercent / 100),
          strategy_id: strategy.id,
          strategy_name: strategy.name,
          reason: `${strategy.name} | Quality: ${qualityScore}/100 | ${pullbackAnalysis.reason}`,
          indicators: {
            ...Object.fromEntries(indicatorValues.entries()),
            qualityScore,
            qualityBreakdown: breakdown,
            marketRegime: regime.regime,
            entryTiming: pullbackAnalysis.reason,
            isPullbackEntry: pullbackAnalysis.isPullback,
            stochRsiSignal: stochRsiEval.signal,
            bollingerSignal: bollingerEval.signal,
            positionSizePercent: strategyPositionSize,
            stopLossPercent,
            takeProfitPercent,
          },
          expires_at: new Date(Date.now() + 60000).toISOString(),
          created_by_rebalancer: false,
        };

        const { data: insertedSignal, error: insertError } = await supabase
          .from("trading_signals")
          .insert(signal)
          .select("id")
          .single();

        if (insertError) {
          console.log(`❌ ${symbol}: Signal insert error: ${insertError.message}`);
        }

        if (!insertError && insertedSignal) {
          signals.push({ ...signal, id: insertedSignal.id });
          totalSignalsGenerated++;
          existingSignalsSet.add(symbol);
          console.log(`✅ ${signalType.toUpperCase()} ${symbol} via "${strategy.name}" | Quality: ${qualityScore} | Entry: ${pullbackAnalysis.isPullback ? "PULLBACK" : "STANDARD"}`);
        }
      } catch (error) {
        console.error(`Error analyzing ${symbol}:`, error);
      }
    }

    // Auto-execute if enabled
    let executedSignals = 0;
    if (riskParams.auto_execute_signals && signals.length > 0) {
      // Sort by quality score - execute best signals first
      signals.sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0));
      
      for (const signal of signals) {
        try {
          const { error: executeError } = await supabase.functions.invoke("execute-trade", {
            headers: { "x-user-id": userId },
            body: { signalId: signal.id, action: "execute" },
          });
          if (!executeError) {
            executedSignals++;
            console.log(`✓ Executed ${signal.symbol} (quality: ${signal.qualityScore})`);
          }
        } catch (error) {
          console.error("Error executing signal:", error);
        }
      }
    }

    console.log(`📈 Summary: ${totalSignalsGenerated} signals | Rejected: regime=${rejectedByRegime} reversal=${rejectedByReversalRisk} quality=${rejectedByQuality} strategy=${rejectedByStrategy}`);

    return new Response(JSON.stringify({
      signals,
      totalSignalsGenerated,
      signalsAfterDeduplication: signals.length,
      executedSignals,
      autoExecuteEnabled: riskParams.auto_execute_signals,
      rejections: {
        byRegime: rejectedByRegime,
        byReversalRisk: rejectedByReversalRisk,
        byQuality: rejectedByQuality,
        byStrategy: rejectedByStrategy,
      },
      minQualityScore: MIN_QUALITY_SCORE,
      message: `Quality Score System active (min: ${MIN_QUALITY_SCORE}/100)`,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("Error in strategy analyzer:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Failed to analyze strategies",
      signals: [],
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
