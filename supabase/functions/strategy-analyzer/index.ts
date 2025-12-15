import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.84.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============= CENTRALIZED ADX THRESHOLDS =============
// CRITICAL: Keep these aligned across all edge functions to prevent silent drift!
// Changes here should be mirrored in: calculate-trend, execute-trade, monitor-positions
const ADX_THRESHOLDS = {
  VERY_WEAK: 12,    // Essentially no trend, avoid trading
  WEAK: 18,         // Weak trend, mixed momentum allowed with caution
  MINIMUM: 20,      // Hard gate for any signal generation
  MODERATE: 22,     // Momentum confirmation threshold
  STRONG: 25,       // Strong trend, reduced reversal weight
  VERY_STRONG: 30,  // Very strong trend, momentum continuation valid
  EXCEPTIONAL: 35,  // Exceptional trend, relaxed quality thresholds
  EXTREME: 40,      // Extreme trend, maximum confidence bonus
} as const;

// ============= CENTRALIZED STOCHRSI THRESHOLDS =============
// CRITICAL: Keep these aligned across all edge functions to prevent silent drift!
// Changes here should be mirrored in: calculate-trend, execute-trade, monitor-positions, ai-signal-analyzer
const STOCHRSI_THRESHOLDS = {
  EXTREME_OVERSOLD: 10,    // Extremely oversold, strong bounce risk for SHORT
  DEEPLY_OVERSOLD: 15,     // Deeply oversold zone
  OVERSOLD: 20,            // Standard oversold threshold
  OVERSOLD_ZONE: 25,       // Entering oversold territory
  NEUTRAL_LOW: 30,         // Lower neutral boundary
  NEUTRAL_HIGH: 70,        // Upper neutral boundary
  OVERBOUGHT_ZONE: 75,     // Entering overbought territory
  OVERBOUGHT: 80,          // Standard overbought threshold
  DEEPLY_OVERBOUGHT: 85,   // Deeply overbought zone
  EXTREME_OVERBOUGHT: 90,  // Extremely overbought, strong pullback risk for LONG
} as const;

// ============= CENTRALIZED RSI THRESHOLDS =============
// CRITICAL: Keep these aligned across all edge functions to prevent silent drift!
// Changes here should be mirrored in: calculate-trend, execute-trade, monitor-positions, ai-signal-analyzer
const RSI_THRESHOLDS = {
  OVERSOLD: 30,            // Classic oversold level
  BEARISH_PULLBACK: 35,    // RSI showing bearish weakness / SHORT pullback
  BULLISH_PULLBACK: 40,    // RSI showing bullish pullback opportunity
  NEUTRAL_LOW: 45,         // Lower neutral/pullback zone for momentum continuation
  NEUTRAL: 50,             // Neutral RSI
  NEUTRAL_HIGH: 55,        // Upper neutral/rally zone for SHORT momentum continuation
  BEARISH_RALLY: 60,       // RSI showing bearish rally (SHORT entry opportunity)
  BULLISH_STRONG: 65,      // Strong bullish momentum / overbought warning
  OVERBOUGHT: 70,          // Classic overbought level
} as const;

// ============= AI REJECTION ANALYZER HELPER =============
// Calls AI to validate rejections and stores results in database
const analyzeRejectionWithAI = async (
  supabase: any,
  rejectionId: string,
  rejection: { symbol: string; rejection_reason: string; filters_status: any; trend_data: any }
) => {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    console.log(`🤖 AI analysis skipped for ${rejection.symbol}: API key not configured`);
    return;
  }

  try {
    const systemPrompt = `You are an expert trading signal analyzer. Validate whether a signal rejection was correct.

VALIDATION RULES:
1. ADX Filter: ADX >= 20 for signal generation. If ADX < 20, rejection is VALID.
2. Momentum: State should be "confirmed" or "building". "none"/"mixed" with low confidence = VALID rejection.
3. StochRSI Extremes: LONG blocked if 4h K > 90 without strong uptrend; SHORT blocked if K < 10 without strong downtrend.
4. Multi-Timeframe: 4h and 1h trends should align with trade direction.
5. Quality Score: Must be >= 60.
6. Reversal Risk: > 50% usually means VALID rejection unless ADX > 35.

Analyze and return structured assessment.`;

    const userPrompt = `Symbol: ${rejection.symbol}
Rejection Reason: ${rejection.rejection_reason}
Filters Status: ${JSON.stringify(rejection.filters_status, null, 2)}
Trend Data: ${JSON.stringify(rejection.trend_data, null, 2)}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "validate_rejection",
            description: "Validate signal rejection",
            parameters: {
              type: "object",
              properties: {
                isValid: { type: "boolean", description: "True if rejection is correct" },
                issues: { type: "array", items: { type: "string" }, description: "Concerns found" },
                confidence: { type: "string", enum: ["high", "medium", "low"] },
                summary: { type: "string", description: "Brief summary" },
              },
              required: ["isValid", "issues", "confidence", "summary"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "validate_rejection" } },
      }),
    });

    if (!response.ok) {
      console.warn(`🤖 AI analysis failed for ${rejection.symbol}: HTTP ${response.status}`);
      return;
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      console.warn(`🤖 AI analysis: No tool call in response for ${rejection.symbol}`);
      return;
    }

    const aiResult = JSON.parse(toolCall.function.arguments);
    
    // Update the rejection record with AI analysis
    const { error } = await supabase
      .from("signal_rejection_log")
      .update({ ai_analysis: aiResult })
      .eq("id", rejectionId);

    if (error) {
      console.error(`🤖 Failed to store AI analysis for ${rejection.symbol}:`, error);
    } else {
      console.log(`🤖 AI analysis stored for ${rejection.symbol}: isValid=${aiResult.isValid}, confidence=${aiResult.confidence}`);
    }
  } catch (error) {
    console.error(`🤖 AI analysis error for ${rejection.symbol}:`, error);
  }
};

// Helper function to log rejection with optional AI analysis
const logRejectionWithAI = async (
  supabase: any,
  userId: string,
  symbol: string,
  rejectionReason: string,
  filtersStatus: any,
  trendData: any,
  enableAI: boolean = false  // Default to false, controlled by ai_analysis_enabled
) => {
  const { data, error } = await supabase
    .from("signal_rejection_log")
    .insert({
      user_id: userId,
      symbol,
      rejection_reason: rejectionReason,
      filters_status: filtersStatus,
      trend_data: trendData,
      checked_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    console.error(`Failed to log rejection for ${symbol}:`, error);
    return;
  }

  // Trigger AI analysis in background (don't await to avoid slowing down signal generation)
  if (enableAI && data?.id && trendData) {
    // Fire and forget - don't block signal generation
    analyzeRejectionWithAI(supabase, data.id, {
      symbol,
      rejection_reason: rejectionReason,
      filters_status: filtersStatus,
      trend_data: trendData,
    }).catch(err => console.error(`AI analysis failed for ${symbol}:`, err));
  }
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
// NEW: Added confidence penalty, pullback bonus, volume score, and strategy performance bonus
interface QualityFactors {
  adxScore: number;          // 0-25 points based on trend strength
  momentumScore: number;     // 0-20 points based on momentum confirmation (REDUCED from 25)
  alignmentScore: number;    // 0-20 points based on timeframe alignment
  technicalScore: number;    // 0-15 points based on StochRSI/Bollinger signals
  entryTimingScore: number;  // 0-25 points based on pullback/entry timing (INCREASED from 20)
  volumeScore: number;       // 0-10 points based on volume confirmation (NEW)
  confidencePenalty: number; // 0 to -20 penalty for high confidence (inversion fix)
  directionBonus: number;    // +3 for SHORT signals (SELL outperforms BUY historically)
}

const calculateQualityScore = (factors: QualityFactors): { score: number; breakdown: string } => {
  const score = Math.min(100, Math.max(0,
    factors.adxScore +
    factors.momentumScore +
    factors.alignmentScore +
    factors.technicalScore +
    factors.entryTimingScore +
    factors.volumeScore +        // NEW: Volume score
    factors.confidencePenalty +  // Can be negative!
    factors.directionBonus       // +3 for SELL signals
  ));
  
  const penaltyStr = factors.confidencePenalty < 0 ? ` CONF_PEN:${factors.confidencePenalty}` : '';
  const bonusStr = factors.directionBonus > 0 ? ` DIR_BONUS:+${factors.directionBonus}` : '';
  const volumeStr = factors.volumeScore > 0 ? ` VOL:${factors.volumeScore}/10` : '';
  const breakdown = `ADX:${factors.adxScore}/25 MOM:${factors.momentumScore}/20 ALIGN:${factors.alignmentScore}/20 TECH:${factors.technicalScore}/15 ENTRY:${factors.entryTimingScore}/25${volumeStr}${penaltyStr}${bonusStr}`;
  
  return { score, breakdown };
};

// ============= NEW: Volume Score Component (0-10 points) =============
// Volume confirms trend direction and indicates conviction
const getVolumeScore = (trendData: any, trend: string): number => {
  const momentum = trendData?.momentum || {};
  const volatility = trendData?.volatility || {};
  
  const volumeConfirms = momentum.volumeConfirms ?? false;
  const volumeSpike = volatility.volumeSpike ?? false;
  const volumeRatio = volatility.volumeRatio ?? 1.0;
  
  // Best case: Volume confirms AND spike detected with high ratio
  if (volumeConfirms && volumeSpike && volumeRatio > 2.0) {
    return 10;  // Strong volume surge confirming trend
  }
  
  // Volume confirms with spike
  if (volumeConfirms && volumeSpike) {
    return 8;
  }
  
  // Volume confirms with above-average volume
  if (volumeConfirms && volumeRatio > 1.5) {
    return 7;
  }
  
  // Volume confirms only
  if (volumeConfirms) {
    return 5;
  }
  
  // Above average volume without confirmation
  if (volumeRatio > 1.5) {
    return 3;
  }
  
  // Slightly above average
  if (volumeRatio > 1.2) {
    return 2;
  }
  
  // Neutral trend - no volume penalty
  if (trend === "neutral") {
    return 1;
  }
  
  // Low volume in directional trend - no bonus
  return 0;
};

// ============= CONFIDENCE INVERSION FIX =============
// High confidence = trend exhaustion, penalize entries
// Optimal entry zone: 50-60% confidence (trend confirmed but not exhausted)
// CRITICAL FIX: 60-69 zone has 17% win rate vs 50-59 at 46% - add penalty!
const getConfidencePenalty = (confidence: number): number => {
  if (confidence >= 85) return -25;   // Heavy penalty for extreme confidence (increased from -20)
  if (confidence >= 80) return -18;   // Strong penalty (increased from -15)
  if (confidence >= 75) return -12;   // Moderate penalty (increased from -10)
  if (confidence >= 70) return -8;    // Light penalty (increased from -6)
  if (confidence >= 60) return -12;   // DEAD ZONE: 60-69 penalty STRENGTHENED (from -8 to -12)
  if (confidence >= 50) return 0;     // Optimal zone: 50-59 (46% win rate)
  return -3;  // Too low confidence also not ideal
};

// ADX Score (0-25 points) - Uses centralized ADX_THRESHOLDS
const getAdxScore = (adx: number): number => {
  if (adx >= ADX_THRESHOLDS.EXTREME) return 25;      // Exceptional trend
  if (adx >= ADX_THRESHOLDS.VERY_STRONG) return 22;  // Very strong trend
  if (adx >= ADX_THRESHOLDS.STRONG) return 18;       // Strong trend
  if (adx >= ADX_THRESHOLDS.MINIMUM) return 14;      // Moderate trend
  if (adx >= ADX_THRESHOLDS.WEAK) return 8;          // Weak trend
  if (adx >= ADX_THRESHOLDS.VERY_WEAK) return 4;     // Very weak
  return 0;                                           // No trend
};

// Momentum Score (0-20 points) - REDUCED from 25 based on win rate correlation
const getMomentumScore = (momentum: any): number => {
  if (!momentum) return 0;
  
  const state = momentum.state || "none";
  const confirms = momentum.confirms || false;
  const volumeConfirms = momentum.volumeConfirms || false;
  const building = momentum.building || false;
  const macdExpanding = momentum.macdExpanding || false;
  
  let score = 0;
  
  // STRICTER MOMENTUM SCORING - only confirmed momentum gets high scores
  if (state === "confirmed" && confirms) {
    score = 17;  // Confirmed momentum = best (was 22)
  } else if (state === "confirmed" && macdExpanding) {
    score = 14;  // Confirmed state with MACD expansion (was 18)
  } else if (building && macdExpanding && confirms) {
    // Building momentum with MACD expansion AND confirmation
    score = 10;  // was 12
  } else if (state === "mixed" && macdExpanding && confirms) {
    // Mixed with expanding MACD AND confirmation
    score = 6;   // was 8
  } else if (building && macdExpanding) {
    // Building without full confirmation - weak
    score = 4;   // was 5
  } else if (state === "mixed") {
    score = 2;   // Reduced from 7 - mixed momentum is poor
  } else if (macdExpanding) {
    score = 2;   // MACD expanding alone is weak (was 3)
  } else {
    score = 0;
  }
  
  // Volume bonus
  if (volumeConfirms) score += 4;  // was 5
  
  return Math.min(20, score);  // MAX 20 (was 25)
};

// Alignment Score (0-14 points) - DIRECTIONAL CONSISTENCY ONLY
// All confidence psychology logic is in getConfidencePenalty() - no double-counting
const getAlignmentScore = (confidence: number, consistency: number, aligned: boolean, trendData: any): number => {
  let score = 0;
  
  // Full alignment bonus (0-8)
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
  
  // Consistency component only (0-6) - NO confidence logic here
  if (consistency >= 75) score += 6;
  else if (consistency >= 65) score += 5;
  else if (consistency >= 55) score += 3;
  else if (consistency >= 45) score += 1;
  // Below 45% = 0 points
  
  return Math.min(14, score);  // Max 14 (was 20)
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
  
  // Strong ADX (>= VERY_STRONG) = momentum continuation is valid, don't penalize overbought/oversold
  const isStrongTrend = adx >= ADX_THRESHOLDS.VERY_STRONG;
  
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

// ============= UNIFIED REVERSAL SCORE SYSTEM =============
// Aggregates ALL reversal signals into a single comprehensive score
// Replaces fragmented individual filters with unified decision system
interface UnifiedReversalResult {
  score: number;                 // 0-100, higher = more reversal risk
  decision: "BLOCK" | "REDUCE" | "NORMAL";  // Three-tier decision
  positionSizeMultiplier: number; // 1.0 for normal, 0.5 for reduce, 0 for block
  signals: string[];             // Contributing factors
  breakdown: {
    stochRsiScore: number;       // 0-50 max
    stochRsiZoneScore: number;   // 0-25 max
    momentumScore: number;       // 0-30 max
    macdScore: number;           // 0-15 max
    timeframeScore: number;      // 0-20 max
    volumeScore: number;         // 0-15 max (optional boost)
  };
  reason: string;
  adxWeight: number;             // ADX-based weight applied to score
}

// Count StochRSI signals opposing the intended trade direction
const countOpposingStochSignals = (trendData: any, intendedDirection: string): {
  opposingCrossCount: number;
  extremeCount: number;
  crossTimeframes: string[];
  extremeTimeframes: string[];
} => {
  const stochRsi = trendData?.stochasticRsi || {};
  const aggregated = stochRsi.aggregated || {};
  const timeframes = ['4h', '1h', '30m', '15m'];
  
  let opposingCrossCount = 0;
  let extremeCount = 0;
  const crossTimeframes: string[] = [];
  const extremeTimeframes: string[] = [];
  
  const isLong = intendedDirection === "bullish" || intendedDirection === "long";
  
  // Check aggregated counts first (faster)
  if (isLong) {
    opposingCrossCount = aggregated.bearishCrossCount || 0;
    extremeCount = aggregated.overboughtCount || 0;
  } else {
    opposingCrossCount = aggregated.bullishCrossCount || 0;
    extremeCount = aggregated.oversoldCount || 0;
  }
  
  // Check individual timeframes for detailed logging
  for (const tf of timeframes) {
    const tfData = stochRsi[tf];
    if (!tfData) continue;
    
    const k = tfData.k ?? 50;
    const signal = tfData.signal || "neutral";
    
    if (isLong) {
      if (signal === "bearish_cross") crossTimeframes.push(tf);
      if (k > 80) extremeTimeframes.push(tf);
    } else {
      if (signal === "bullish_cross") crossTimeframes.push(tf);
      if (k < 20) extremeTimeframes.push(tf);
    }
  }
  
  return { opposingCrossCount, extremeCount, crossTimeframes, extremeTimeframes };
};

// Calculate Unified Reversal Score (0-100)
const calculateUnifiedReversalScore = (
  trendData: any, 
  intendedDirection: string,
  symbol: string
): UnifiedReversalResult => {
  const signals: string[] = [];
  let totalScore = 0;
  
  const momentum = trendData?.momentum || {};
  const stochRsi = trendData?.stochasticRsi || {};
  const aggregated = stochRsi.aggregated || {};
  const htf = trendData?.higherTimeframeFilter || {};
  const mtf = trendData?.multiTimeframe || {};
  const adx = trendData?.volatility?.adx || trendData?.adx || 20;
  const volatility = trendData?.volatility || {};
  
  const isLong = intendedDirection === "bullish" || intendedDirection === "long";
  const trend1h = htf.trend1h || mtf.trend1h || "neutral";
  const trend4h = htf.trend4h || "neutral";
  const stoch4h = stochRsi['4h'] || {};
  const stoch1h = stochRsi['1h'] || {};
  
  // Initialize breakdown
  const breakdown = {
    stochRsiScore: 0,
    stochRsiZoneScore: 0,
    momentumScore: 0,
    macdScore: 0,
    timeframeScore: 0,
    volumeScore: 0,
  };
  
  // ============= 1. StochRSI CROSS SIGNALS (0-50 points) =============
  // Most critical: opposing crosses indicate imminent reversal
  const stochSignals = countOpposingStochSignals(trendData, intendedDirection);
  
  if (stochSignals.opposingCrossCount >= 3) {
    breakdown.stochRsiScore = 50;  // Maximum - strong reversal signal
    signals.push(`${stochSignals.opposingCrossCount} opposing StochRSI crosses`);
  } else if (stochSignals.opposingCrossCount >= 2) {
    breakdown.stochRsiScore = 40;
    signals.push(`${stochSignals.opposingCrossCount} opposing StochRSI crosses (${stochSignals.crossTimeframes.join(', ')})`);
  } else if (stochSignals.opposingCrossCount >= 1) {
    breakdown.stochRsiScore = 30;
    signals.push(`Opposing StochRSI cross on ${stochSignals.crossTimeframes.join(', ')}`);
  }
  
  // ============= 2. StochRSI EXTREME ZONES (0-25 points) =============
  // Being in extreme zone when entering = high bounce/reversal risk
  //
  // IMPORTANT DESIGN NOTE: These scores seem to contradict the "strong ADX allows 
  // overbought/oversold continuation" rule from stochrsi-extreme-entry-exception-strong-trends.
  // This is INTENTIONAL and CORRECT because:
  // 1. The ADX-adaptive weight (calculated later) already reduces reversal score impact in strong trends
  //    - ADX ≥35: weight = 0.5 (halves this score)
  //    - ADX 20-35: weight = 0.7
  //    - ADX <20: weight = 1.0
  // 2. So a +10 extreme zone score becomes +5 in a strong trend after weighting
  // 3. This provides a "soft caution" even in strong trends, not a hard block
  // DO NOT "FIX" this by adding ADX checks here - the weighting already handles it!
  const k4h = stoch4h.k ?? 50;
  const k1h = stoch1h.k ?? 50;
  
  if (isLong) {
    // SHORT entry blocked if 4h StochRSI is oversold (bounce risk)
    if (k4h < STOCHRSI_THRESHOLDS.DEEPLY_OVERSOLD) {
      breakdown.stochRsiZoneScore += 15;
      signals.push(`4h StochRSI deeply oversold (K=${k4h.toFixed(1)})`);
    } else if (k4h < STOCHRSI_THRESHOLDS.OVERSOLD_ZONE) {
      breakdown.stochRsiZoneScore += 8;
      signals.push(`4h StochRSI oversold zone (K=${k4h.toFixed(1)})`);
    }
    
    // Overbought warning for LONG entry (reduced by ADX weight in strong trends)
    if (k4h > STOCHRSI_THRESHOLDS.EXTREME_OVERBOUGHT) {
      breakdown.stochRsiZoneScore += 10;
      signals.push(`4h StochRSI extremely overbought (K=${k4h.toFixed(1)})`);
    }
  } else {
    // LONG entry blocked if 4h StochRSI is overbought (pullback risk)
    if (k4h > STOCHRSI_THRESHOLDS.DEEPLY_OVERBOUGHT) {
      breakdown.stochRsiZoneScore += 15;
      signals.push(`4h StochRSI deeply overbought (K=${k4h.toFixed(1)})`);
    } else if (k4h > STOCHRSI_THRESHOLDS.OVERBOUGHT_ZONE) {
      breakdown.stochRsiZoneScore += 8;
      signals.push(`4h StochRSI overbought zone (K=${k4h.toFixed(1)})`);
    }
    
    // Oversold warning for SHORT entry (reduced by ADX weight in strong trends)
    if (k4h < STOCHRSI_THRESHOLDS.EXTREME_OVERSOLD) {
      breakdown.stochRsiZoneScore += 10;
      signals.push(`4h StochRSI extremely oversold (K=${k4h.toFixed(1)})`);
    }
  }
  
  // ============= 3. MOMENTUM STATE (0-30 points) =============
  // Mixed or unconfirmed momentum = directional uncertainty
  const momentumState = momentum.state || "none";
  const momentumConfirms = momentum.confirms ?? false;
  
  if (momentumState === "none" || !momentumConfirms) {
    breakdown.momentumScore = 25;
    signals.push(`Momentum not confirmed (state: ${momentumState})`);
  } else if (momentumState === "mixed") {
    // HARD GATE: Mixed momentum + weak ADX = block - Uses centralized ADX_THRESHOLDS
    if (adx < ADX_THRESHOLDS.VERY_STRONG) {
      breakdown.momentumScore = 30;  // Max score for mixed in weak trend
      signals.push(`Mixed momentum with weak trend (ADX=${adx.toFixed(1)})`);
    } else {
      breakdown.momentumScore = 15;  // Allow in strong trends
      signals.push(`Mixed momentum (ADX=${adx.toFixed(1)} allows)`);
    }
  } else if (momentumState === "building" && !momentumConfirms) {
    breakdown.momentumScore = 10;
    signals.push("Momentum building but not confirmed");
  }
  
  // ============= 4. MACD ALIGNMENT (0-15 points) =============
  // MACD divergence or misalignment = trend weakening
  if (momentum.hasDivergence) {
    breakdown.macdScore += 15;
    signals.push("MACD divergence detected");
  } else if (!momentum.macdDirectionAligned) {
    breakdown.macdScore += 10;
    signals.push("MACD direction misaligned");
  } else if (!momentum.macdExpanding) {
    breakdown.macdScore += 5;
    signals.push("MACD not expanding");
  }
  
  // ============= 5. TIMEFRAME CONFLICTS (0-20 points) =============
  // 1h or 4h opposing intended direction = significant risk
  if (isLong) {
    if (trend1h === "bearish") {
      breakdown.timeframeScore += 15;
      signals.push("1h trend bearish (opposing LONG)");
    }
    if (trend4h === "bearish") {
      breakdown.timeframeScore += 5;
      signals.push("4h trend bearish");
    }
  } else {
    if (trend1h === "bullish") {
      breakdown.timeframeScore += 15;
      signals.push("1h trend bullish (opposing SHORT)");
    }
    if (trend4h === "bullish") {
      breakdown.timeframeScore += 5;
      signals.push("4h trend bullish");
    }
  }
  
  // ============= 6. VOLUME CONFIRMATION (reduces score if confirming) =============
  // Volume supporting move = reduce reversal risk
  const volumeConfirms = momentum.volumeConfirms ?? false;
  const volumeBoost = momentum.volumeBoost ?? 1.0;
  
  if (volumeConfirms && volumeBoost > 1.3) {
    breakdown.volumeScore = -10;  // Negative = reduces total score
    signals.push(`Volume confirms (boost ${volumeBoost.toFixed(2)}x) - risk reduced`);
  } else if (!volumeConfirms && volatility.volumeRatio < 0.5) {
    breakdown.volumeScore = 5;  // Low volume = less conviction
    signals.push("Low volume - reduced conviction");
  }
  
  // ============= CALCULATE TOTAL & APPLY ADX WEIGHT =============
  const rawScore = breakdown.stochRsiScore + breakdown.stochRsiZoneScore + 
                   breakdown.momentumScore + breakdown.macdScore + 
                   breakdown.timeframeScore + breakdown.volumeScore;
  
  // ADX-based adaptive weight (strong trends reduce reversal impact) - Uses centralized ADX_THRESHOLDS
  const getAdxWeight = (adxValue: number): number => {
    if (adxValue >= ADX_THRESHOLDS.EXTREME) return 0.4;      // Extreme trend
    if (adxValue >= ADX_THRESHOLDS.EXCEPTIONAL) return 0.5;  // Exceptional trend
    if (adxValue >= ADX_THRESHOLDS.VERY_STRONG) return 0.6;  // Very strong trend
    if (adxValue >= ADX_THRESHOLDS.STRONG) return 0.75;      // Strong trend
    if (adxValue >= ADX_THRESHOLDS.MINIMUM) return 0.85;     // Moderate trend
    return 1.0;  // Weak trend = full weight
  };
  
  const adxWeight = getAdxWeight(adx);
  totalScore = Math.min(100, Math.max(0, Math.round(rawScore * adxWeight)));
  
  // ============= THREE-TIER DECISION SYSTEM =============
  // Score > 60: BLOCK - too risky
  // Score 40-60: REDUCE - proceed with 50% position size
  // Score < 40: NORMAL - full position size
  let decision: "BLOCK" | "REDUCE" | "NORMAL";
  let positionSizeMultiplier: number;
  
  if (totalScore >= 60) {
    decision = "BLOCK";
    positionSizeMultiplier = 0;
  } else if (totalScore >= 40) {
    decision = "REDUCE";
    positionSizeMultiplier = 0.5;
  } else {
    decision = "NORMAL";
    positionSizeMultiplier = 1.0;
  }
  
  const reason = decision === "BLOCK"
    ? `🛑 UNIFIED REVERSAL BLOCK (${totalScore}/100): ${signals.slice(0, 3).join(", ")}`
    : decision === "REDUCE"
    ? `⚠️ Unified reversal caution (${totalScore}/100, 50% size): ${signals.slice(0, 2).join(", ")}`
    : `✓ Unified reversal check passed (${totalScore}/100)`;
  
  console.log(`📊 ${symbol} UNIFIED REVERSAL: score=${totalScore} (raw=${rawScore}, ADX=${adx.toFixed(1)}, weight=${adxWeight.toFixed(2)}) → ${decision}`);
  console.log(`   Breakdown: StochCross=${breakdown.stochRsiScore} Zone=${breakdown.stochRsiZoneScore} Mom=${breakdown.momentumScore} MACD=${breakdown.macdScore} TF=${breakdown.timeframeScore} Vol=${breakdown.volumeScore}`);
  
  return { 
    score: totalScore, 
    decision, 
    positionSizeMultiplier,
    signals, 
    breakdown, 
    reason,
    adxWeight,
  };
};

// Legacy function for backward compatibility
// Now uses the unified reversal score internally
interface ReversalRiskResult {
  isHighRisk: boolean;
  riskScore: number;
  signals: string[];
  reason: string;
}

const detectReversalRisk = (trendData: any, intendedDirection: string): ReversalRiskResult => {
  const unifiedResult = calculateUnifiedReversalScore(trendData, intendedDirection, "unknown");
  
  return {
    isHighRisk: unifiedResult.decision === "BLOCK",
    riskScore: unifiedResult.score,
    signals: unifiedResult.signals,
    reason: unifiedResult.reason
  };
};

// ============= IMPROVEMENT #2: Market Regime Detection =============
type MarketRegime = "trending" | "ranging" | "choppy" | "volatile";

const detectMarketRegime = (trendData: any): { regime: MarketRegime; tradeable: boolean; reason: string } => {
  const adx = trendData.volatility?.adx || 0;
  const atrPercent = trendData.volatility?.atrPercent || 0;
  const confidence = trendData.confidence || 0;
  const consistency = trendData.trendConsistency || 0;
  
  // Check for ranging market (ADX low, mixed signals)
  if (adx < 15 && confidence < 50) {  // 15 is intentional (below VERY_WEAK for severe ranging detection)
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
  if (atrPercent > 4.0 && adx < ADX_THRESHOLDS.STRONG) {
    return { 
      regime: "volatile", 
      tradeable: false, 
      reason: `Excessive volatility without trend (ATR ${atrPercent.toFixed(2)}%, ADX ${adx.toFixed(1)})` 
    };
  }
  
  // Trending market - tradeable (STRICTER: require ADX >= WEAK minimum)
  if (adx >= ADX_THRESHOLDS.MODERATE || (adx >= ADX_THRESHOLDS.WEAK && confidence >= 65)) {
    return { 
      regime: "trending", 
      tradeable: true, 
      reason: `Trending market (ADX ${adx.toFixed(1)}, confidence ${confidence}%)` 
    };
  }
  
  // Edge case - REMOVED weak trend allowance (ADX >= 12) - was causing poor entries
  // Only allow borderline cases with very strong alignment
  if (adx >= ADX_THRESHOLDS.WEAK && confidence >= 70 && consistency >= 65) {
    return { 
      regime: "trending", 
      tradeable: true, 
      reason: `Moderate trend with strong alignment (ADX ${adx.toFixed(1)}, confidence ${confidence}%, consistency ${consistency}%)` 
    };
  }
  
  return { 
    regime: "ranging", 
    tradeable: false, 
    reason: `Insufficient trend conditions (ADX ${adx.toFixed(1)}, confidence ${confidence}%)` 
  };
};

// ============= IMPROVEMENT #3: ENHANCED PULLBACK ENTRY DETECTION =============
// CRITICAL FIX: Require BOTH RSI pullback AND Bollinger touch for highest score
interface PullbackAnalysis {
  isPullback: boolean;
  pullbackDepth: number;     // 0-100% of recent swing
  entryTimingScore: number;  // 0-25 bonus points (INCREASED from 20 based on win rate data)
  reason: string;
  hasBothConditions: boolean; // RSI + Bollinger combined
}

const analyzePullbackEntry = (trendData: any, trend: string): PullbackAnalysis => {
  const indicators = trendData.indicators || {};
  const stochRsi = trendData.stochasticRsi?.aggregated || {};
  const bollingerBands = trendData.bollingerBands || {};
  const bb1h = bollingerBands["1h"] || {};
  const rsi = indicators.rsi || 50;
  const adx = trendData?.volatility?.adx || 0;
  const momentum = trendData?.momentum || {};
  const percentB = bb1h.percentB || 50;
  
  // Strong ADX = momentum continuation is valid strategy
  const isStrongTrend = adx >= ADX_THRESHOLDS.VERY_STRONG;
  const hasMacdExpanding = momentum.macdExpanding === true;
  const isMomentumConfirmed = momentum.state === "confirmed" || momentum.state === "mixed";
  
  // Define pullback conditions
  const rsiPullbackBullish = rsi < RSI_THRESHOLDS.NEUTRAL_LOW;  // RSI showing pullback in uptrend
  const rsiPullbackBearish = rsi > RSI_THRESHOLDS.NEUTRAL_HIGH;  // RSI showing rally in downtrend
  const bollingerPullbackBullish = percentB < 35 || bb1h.pricePosition === "lower_zone";
  const bollingerPullbackBearish = percentB > 65 || bb1h.pricePosition === "upper_zone";
  
  // For bullish trend, look for pullback entries
  if (trend === "bullish") {
    // BEST ENTRY: Both RSI oversold AND near lower Bollinger
    if ((rsi < RSI_THRESHOLDS.BULLISH_PULLBACK || stochRsi.oversoldCount >= 1) && bollingerPullbackBullish) {
      return {
        isPullback: true,
        hasBothConditions: true,
        pullbackDepth: 100 - rsi,
        entryTimingScore: 25,  // MAX SCORE for combined conditions (was 20)
        reason: "OPTIMAL: RSI oversold + near lower Bollinger band"
      };
    }
    
    // GOOD ENTRY: RSI pullback only
    if (rsi < RSI_THRESHOLDS.BULLISH_PULLBACK || stochRsi.oversoldCount >= 1) {
      return {
        isPullback: true,
        hasBothConditions: false,
        pullbackDepth: 100 - rsi,
        entryTimingScore: 18,  // was 14
        reason: "Bullish pullback: RSI oversold in uptrend"
      };
    }
    
    // GOOD ENTRY: Bollinger pullback only
    if (bollingerPullbackBullish) {
      return {
        isPullback: true,
        hasBothConditions: false,
        pullbackDepth: 30,
        entryTimingScore: 15,  // was 12
        reason: "Bullish pullback: Price near lower Bollinger band"
      };
    }
    
    // ACCEPTABLE: StochRSI bullish cross = reversal from pullback
    if (stochRsi.bullishCrossCount >= 1) {
      return {
        isPullback: true,
        hasBothConditions: false,
        pullbackDepth: 25,
        entryTimingScore: 12,  // was 10
        reason: "Bullish pullback: StochRSI bullish cross"
      };
    }
    
    // MOMENTUM CONTINUATION: Only if very strong trend + confirmed momentum
    if (isStrongTrend && hasMacdExpanding && isMomentumConfirmed && rsi < RSI_THRESHOLDS.BULLISH_STRONG) {
      return {
        isPullback: false,
        hasBothConditions: false,
        pullbackDepth: 0,
        entryTimingScore: 8,  // was 6
        reason: "Momentum continuation: Strong ADX with MACD expansion"
      };
    }
    
    // POOR ENTRY: Strong trend but overbought - low score
    if (isStrongTrend && rsi > RSI_THRESHOLDS.BULLISH_STRONG) {
      return {
        isPullback: false,
        hasBothConditions: false,
        pullbackDepth: 0,
        entryTimingScore: 2,  // Reduced from 5
        reason: "Poor entry: Overbought in strong trend"
      };
    }
    
    // POOR ENTRY: RSI in neutral zone = not ideal timing
    if (rsi >= RSI_THRESHOLDS.BULLISH_PULLBACK && rsi <= RSI_THRESHOLDS.BULLISH_STRONG) {
      return {
        isPullback: false,
        hasBothConditions: false,
        pullbackDepth: 0,
        entryTimingScore: 4,  // Reduced from 5
        reason: "Neutral entry: RSI in middle zone"
      };
    }
    
    // AVOID: Overbought in weak trend
    if (rsi > RSI_THRESHOLDS.OVERBOUGHT || stochRsi.overboughtCount >= 2) {
      return {
        isPullback: false,
        hasBothConditions: false,
        pullbackDepth: 0,
        entryTimingScore: 0,  // Changed from 2 to 0 - bad entry
        reason: "Avoid: Overbought in weak trend"
      };
    }
  }
  
  // For bearish trend, look for rally (price spiked but downtrend intact)
  if (trend === "bearish") {
    // BEST ENTRY: Both RSI overbought AND near upper Bollinger
    if ((rsi > RSI_THRESHOLDS.BEARISH_RALLY || stochRsi.overboughtCount >= 1) && bollingerPullbackBearish) {
      return {
        isPullback: true,
        hasBothConditions: true,
        pullbackDepth: rsi - RSI_THRESHOLDS.NEUTRAL,
        entryTimingScore: 25,  // MAX SCORE (was 20)
        reason: "OPTIMAL: RSI overbought + near upper Bollinger band"
      };
    }
    
    // GOOD ENTRY: RSI rally only
    if (rsi > RSI_THRESHOLDS.BEARISH_RALLY || stochRsi.overboughtCount >= 1) {
      return {
        isPullback: true,
        hasBothConditions: false,
        pullbackDepth: rsi - RSI_THRESHOLDS.NEUTRAL,
        entryTimingScore: 18,  // was 14
        reason: "Bearish rally: RSI overbought in downtrend"
      };
    }
    
    // GOOD ENTRY: Bollinger rally only
    if (bollingerPullbackBearish) {
      return {
        isPullback: true,
        hasBothConditions: false,
        pullbackDepth: 30,
        entryTimingScore: 15,  // was 12
        reason: "Bearish rally: Price near upper Bollinger band"
      };
    }
    
    // ACCEPTABLE: StochRSI bearish cross
    if (stochRsi.bearishCrossCount >= 1) {
      return {
        isPullback: true,
        hasBothConditions: false,
        pullbackDepth: 25,
        entryTimingScore: 12,  // was 10
        reason: "Bearish rally: StochRSI bearish cross"
      };
    }
    
    // MOMENTUM CONTINUATION: Only if very strong trend + RSI > NEUTRAL_LOW (symmetric with bullish < BULLISH_STRONG)
    if (isStrongTrend && hasMacdExpanding && isMomentumConfirmed && rsi > RSI_THRESHOLDS.NEUTRAL_LOW) {
      return {
        isPullback: false,
        hasBothConditions: false,
        pullbackDepth: 0,
        entryTimingScore: 8,  // was 6
        reason: "Momentum continuation: Strong ADX with MACD expansion"
      };
    }
    
    // POOR ENTRY: RSI in neutral zone
    if (rsi <= RSI_THRESHOLDS.BEARISH_RALLY && rsi >= RSI_THRESHOLDS.BEARISH_PULLBACK) {
      return {
        isPullback: false,
        hasBothConditions: false,
        pullbackDepth: 0,
        entryTimingScore: 4,
        reason: "Neutral entry: RSI in middle zone"
      };
    }
    
    // POOR ENTRY: Strong downtrend but oversold
    if (isStrongTrend && rsi < RSI_THRESHOLDS.BEARISH_PULLBACK) {
      return {
        isPullback: false,
        hasBothConditions: false,
        pullbackDepth: 0,
        entryTimingScore: 2,
        reason: "Poor entry: Oversold in strong downtrend"
      };
    }
    
    // AVOID: Oversold in weak downtrend
    if (rsi < RSI_THRESHOLDS.OVERSOLD || stochRsi.oversoldCount >= 2) {
      return {
        isPullback: false,
        hasBothConditions: false,
        pullbackDepth: 0,
        entryTimingScore: 0,  // Bad entry
        reason: "Avoid: Oversold in weak downtrend"
      };
    }
  }
  
  // Default - neutral timing (not ideal)
  return {
    isPullback: false,
    hasBothConditions: false,
    pullbackDepth: 0,
    entryTimingScore: 2,
    reason: "No pullback detected - not ideal entry timing"
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
// Must align with MIN_QUALITY_SCORE threshold (55)
const getPositionSizeFromQuality = (qualityScore: number): number => {
  if (qualityScore >= 85) return 1.0;      // Full size for excellent signals
  if (qualityScore >= 75) return 0.85;     // Near full
  if (qualityScore >= 65) return 0.7;      // Moderate
  if (qualityScore >= 60) return 0.55;     // Good (adjusted for new threshold)
  if (qualityScore >= 55) return 0.45;     // Minimum acceptable (matches MIN_QUALITY_SCORE)
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

    // ============= SYMBOL PERFORMANCE FILTER =============
    // Disable symbols with win rate below 35% (based on last 20 trades)
    const SYMBOL_WIN_RATE_THRESHOLD = 35;
    const SYMBOL_MIN_TRADES_FOR_FILTER = 10;
    
    // ============= NEW: STRATEGY PERFORMANCE FILTER (REGIME-AWARE) =============
    // Disable strategies with win rate below 40% (based on last 20 trades per strategy PER REGIME)
    const STRATEGY_WIN_RATE_THRESHOLD = 40;
    const STRATEGY_MIN_TRADES_FOR_FILTER = 10;
    const STRATEGY_HIGH_PERFORMER_THRESHOLD = 60; // Strategies above 60% get bonus
    
    // Fetch positions with trend to determine regime at time of trade
    const { data: recentPositions } = await supabase
      .from("positions")
      .select("symbol, strategy_name, realized_pnl, trend")
      .eq("user_id", userId)
      .eq("status", "closed")
      .order("closed_at", { ascending: false })
      .limit(500);  // Get more trades to analyze both symbol and strategy performance
    
    // ============= STATISTICAL CONTAMINATION FIX =============
    // Segment stats to prevent cross-contamination:
    // - Strategy stats require minimum unique symbols (strategy-agnostic)
    // - Symbol stats require minimum unique strategies (symbol-agnostic)
    const STRATEGY_MIN_UNIQUE_SYMBOLS = 3;  // Strategy must have trades across 3+ symbols to be disabled
    const SYMBOL_MIN_UNIQUE_STRATEGIES = 2; // Symbol must have trades from 2+ strategies to be disabled
    
    // Calculate win rate per symbol with strategy diversity tracking
    const symbolWinRates = new Map<string, { wins: number; total: number; winRate: number; uniqueStrategies: Set<string> }>();
    const disabledSymbols = new Set<string>();
    
    // ============= REGIME-AWARE STRATEGY STATS =============
    // Track strategy performance per regime to prevent regime-specific bias
    type RegimeType = "trending" | "ranging";
    type StrategyRegimeStats = { wins: number; total: number; winRate: number; uniqueSymbols: Set<string> };
    const strategyWinRatesByRegime = new Map<string, Map<RegimeType, StrategyRegimeStats>>();
    const disabledStrategiesByRegime = new Map<RegimeType, Set<string>>();
    const highPerformingStrategiesByRegime = new Map<RegimeType, Set<string>>();
    
    // Initialize regime maps
    disabledStrategiesByRegime.set("trending", new Set());
    disabledStrategiesByRegime.set("ranging", new Set());
    highPerformingStrategiesByRegime.set("trending", new Set());
    highPerformingStrategiesByRegime.set("ranging", new Set());
    
    // Helper: Derive regime from trend stored in position
    const getRegimeFromTrend = (trend: string | null): RegimeType => {
      if (trend === "bullish" || trend === "bearish") return "trending";
      return "ranging"; // neutral, ranging, or null
    };
    
    if (recentPositions?.length) {
      for (const trade of recentPositions) {
        const strategyName = trade.strategy_name || "Unknown";
        const regime = getRegimeFromTrend(trade.trend);
        
        // Symbol performance with strategy diversity tracking (regime-agnostic for symbols)
        const symbolStats = symbolWinRates.get(trade.symbol) || { wins: 0, total: 0, winRate: 0, uniqueStrategies: new Set() };
        symbolStats.total++;
        if ((trade.realized_pnl || 0) > 0) symbolStats.wins++;
        symbolStats.winRate = (symbolStats.wins / symbolStats.total) * 100;
        symbolStats.uniqueStrategies.add(strategyName);
        symbolWinRates.set(trade.symbol, symbolStats);
        
        // Strategy performance BY REGIME with symbol diversity tracking
        if (!strategyWinRatesByRegime.has(strategyName)) {
          strategyWinRatesByRegime.set(strategyName, new Map());
        }
        const strategyRegimes = strategyWinRatesByRegime.get(strategyName)!;
        const strategyStats = strategyRegimes.get(regime) || { wins: 0, total: 0, winRate: 0, uniqueSymbols: new Set() };
        strategyStats.total++;
        if ((trade.realized_pnl || 0) > 0) strategyStats.wins++;
        strategyStats.winRate = (strategyStats.wins / strategyStats.total) * 100;
        strategyStats.uniqueSymbols.add(trade.symbol);
        strategyRegimes.set(regime, strategyStats);
      }
      
      // Check symbol performance (require trades from multiple strategies to prevent strategy-specific bias)
      for (const [symbol, stats] of symbolWinRates.entries()) {
        const hasEnoughTrades = stats.total >= SYMBOL_MIN_TRADES_FOR_FILTER;
        const hasEnoughDiversity = stats.uniqueStrategies.size >= SYMBOL_MIN_UNIQUE_STRATEGIES;
        const isBelowThreshold = stats.winRate < SYMBOL_WIN_RATE_THRESHOLD;
        
        if (hasEnoughTrades && hasEnoughDiversity && isBelowThreshold) {
          disabledSymbols.add(symbol);
          console.log(`⛔ SYMBOL FILTER: ${symbol} disabled - win rate ${stats.winRate.toFixed(1)}% < ${SYMBOL_WIN_RATE_THRESHOLD}% (${stats.wins}/${stats.total} trades across ${stats.uniqueStrategies.size} strategies)`);
        } else if (hasEnoughTrades && !hasEnoughDiversity && isBelowThreshold) {
          console.log(`⚠️ SYMBOL SKIP: ${symbol} low win rate ${stats.winRate.toFixed(1)}% but only ${stats.uniqueStrategies.size} strategy(s) - need ${SYMBOL_MIN_UNIQUE_STRATEGIES}+ for filter`);
        }
      }
      
      // Check strategy performance PER REGIME (require trades across multiple symbols to prevent symbol-specific bias)
      for (const [strategy, regimeStats] of strategyWinRatesByRegime.entries()) {
        for (const [regime, stats] of regimeStats.entries()) {
          const hasEnoughTrades = stats.total >= STRATEGY_MIN_TRADES_FOR_FILTER;
          const hasEnoughDiversity = stats.uniqueSymbols.size >= STRATEGY_MIN_UNIQUE_SYMBOLS;
          
          if (hasEnoughTrades && hasEnoughDiversity) {
            if (stats.winRate < STRATEGY_WIN_RATE_THRESHOLD) {
              disabledStrategiesByRegime.get(regime)!.add(strategy);
              console.log(`⛔ STRATEGY FILTER [${regime.toUpperCase()}]: "${strategy}" disabled - win rate ${stats.winRate.toFixed(1)}% < ${STRATEGY_WIN_RATE_THRESHOLD}% (${stats.wins}/${stats.total} trades across ${stats.uniqueSymbols.size} symbols)`);
            } else if (stats.winRate >= STRATEGY_HIGH_PERFORMER_THRESHOLD) {
              highPerformingStrategiesByRegime.get(regime)!.add(strategy);
              console.log(`⭐ STRATEGY BOOST [${regime.toUpperCase()}]: "${strategy}" is high performer - win rate ${stats.winRate.toFixed(1)}% (${stats.wins}/${stats.total} trades across ${stats.uniqueSymbols.size} symbols)`);
            }
          } else if (hasEnoughTrades && !hasEnoughDiversity && stats.winRate < STRATEGY_WIN_RATE_THRESHOLD) {
            console.log(`⚠️ STRATEGY SKIP [${regime.toUpperCase()}]: "${strategy}" low win rate ${stats.winRate.toFixed(1)}% but only ${stats.uniqueSymbols.size} symbol(s) - need ${STRATEGY_MIN_UNIQUE_SYMBOLS}+ for filter`);
          }
        }
      }
    }
    
    // Filter out disabled symbols
    const activeSymbols = symbols.filter(s => !disabledSymbols.has(s.symbol));
    console.log(`📊 Symbol filter: ${symbols.length} total → ${activeSymbols.length} active (${disabledSymbols.size} disabled)`);
    console.log(`📊 Strategy filter by regime: trending=${disabledStrategiesByRegime.get("trending")!.size} disabled/${highPerformingStrategiesByRegime.get("trending")!.size} high, ranging=${disabledStrategiesByRegime.get("ranging")!.size} disabled/${highPerformingStrategiesByRegime.get("ranging")!.size} high`);

    // Fetch custom strategies (REQUIRED)
    const { data: customStrategies, error: strategiesError } = await supabase
      .from("custom_strategies")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true);

    // Combine user's custom strategies with built-in templates
    // User strategies are evaluated first (they take priority), then built-ins fill gaps
    // NOTE: Strategy filtering is now DEFERRED to per-symbol evaluation based on regime
    const userStrategies = customStrategies || [];
    const userStrategyNames = new Set(userStrategies.map(s => s.name.toLowerCase()));
    
    // Add built-in templates that don't duplicate user strategies
    const builtInToInclude = BUILT_IN_TEMPLATES.filter(t => 
      !userStrategyNames.has(t.name.toLowerCase())
    );
    
    const allStrategies = [...userStrategies, ...builtInToInclude];
    
    // Helper: Check if strategy is disabled for a given regime
    const isStrategyDisabledForRegime = (strategyName: string, regime: RegimeType): boolean => {
      return disabledStrategiesByRegime.get(regime)?.has(strategyName) || false;
    };
    
    // Helper: Check if strategy is high performer for a given regime
    const isStrategyHighPerformerForRegime = (strategyName: string, regime: RegimeType): boolean => {
      return highPerformingStrategiesByRegime.get(regime)?.has(strategyName) || false;
    };
    
    console.log(`📊 ${activeSymbols.length} symbols | ${userStrategies.length} user strategies + ${builtInToInclude.length} built-in templates = ${allStrategies.length} total (regime-aware filtering applied per symbol)`);

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

    // Fetch market data in parallel - use filtered activeSymbols
    const symbolsList = activeSymbols.map((s) => s.symbol);
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

    // Fetch trend data in PARALLEL for eligible symbols (already filtered by win rate)
    const eligibleSymbols = symbolsList.filter((symbol) => {
      const count = openTradesPerSymbol.get(symbol) || 0;
      return !existingSignalsSet.has(symbol) && count < riskParams.max_trades_per_symbol;
    });

    console.log(`🚀 Fetching trend data for ${eligibleSymbols.length} eligible symbols (after win rate filter)`);

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
    let rejectedByHardGates = 0;  // NEW: Track hard gate rejections
    let rejectedByQuality = 0;
    let rejectedByStrategy = 0;
    let rejectedByReversalRisk = 0;
    let rejectedByStochRsiExtreme = 0;
    
    // Loss Recovery Mode - increase quality threshold after consecutive losses
    const isInRecoveryMode = riskParams.loss_recovery_mode_enabled && 
      (riskParams.consecutive_losses || 0) >= (riskParams.consecutive_loss_threshold || 3);
    const recoveryConfidenceBoost = riskParams.loss_recovery_confidence_boost || 10;
    const recoveryPositionSizeMultiplier = (riskParams.loss_recovery_position_size_percent || 50) / 100;
    
    // ============= DYNAMIC QUALITY THRESHOLD =============
    // Adjust threshold based on market conditions:
    // - Strong ADX (≥35): Allow lower quality (more signals in strong trends)
    // - Normal ADX (20-35): Standard threshold
    // - Recovery mode: Higher threshold (fewer, higher quality signals)
    const BASE_MIN_QUALITY_SCORE = 55;
    const DEFAULT_MIN_QUALITY = BASE_MIN_QUALITY_SCORE;
    
    const getMinQualityScore = (adx: number, inRecovery: boolean): number => {
      if (inRecovery) {
        return BASE_MIN_QUALITY_SCORE + recoveryConfidenceBoost; // 65 in recovery
      }
      // Dynamic based on ADX - strong trends = allow more signals
      if (adx >= ADX_THRESHOLDS.EXCEPTIONAL) return 50;  // Strong trend: lower threshold
      if (adx >= ADX_THRESHOLDS.STRONG) return 53;       // Good trend: slightly lower
      return BASE_MIN_QUALITY_SCORE;                      // Normal: 55
    };
    
    if (isInRecoveryMode) {
      console.log(`🔄 LOSS RECOVERY MODE ACTIVE: ${riskParams.consecutive_losses} consecutive losses`);
      console.log(`   → Quality threshold: ${BASE_MIN_QUALITY_SCORE + recoveryConfidenceBoost} (base ${BASE_MIN_QUALITY_SCORE} + ${recoveryConfidenceBoost})`);
      console.log(`   → Position size multiplier: ${recoveryPositionSizeMultiplier * 100}%`);
    }

    // Analyze each symbol (using filtered activeSymbols that passed win rate check)
    for (const { symbol } of activeSymbols) {
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
          await logRejectionWithAI(
            supabase,
            userId,
            symbol,
            `Market regime not tradeable: ${regime.reason}`,
            { regime: regime.regime, reason: regime.reason, adx, confidence, trendConsistency },
            trendData,
            riskParams.ai_analysis_enabled !== false
          );
          continue;
        }

        // ============= UNIFIED REVERSAL SCORE SYSTEM (THREE-TIER) =============
        // Uses comprehensive cross-timeframe consensus analysis
        // Tier 1: BLOCK (score >= 60) - too risky, skip signal
        // Tier 2: REDUCE (score 40-60) - proceed with 50% position size
        // Tier 3: NORMAL (score < 40) - full position size
        const unifiedReversal = calculateUnifiedReversalScore(trendData, trend, symbol);
        
        // Store multiplier for later use in position sizing
        let reversalPositionMultiplier = unifiedReversal.positionSizeMultiplier;
        
        // BLOCK: High reversal risk - skip this signal entirely
        if (unifiedReversal.decision === "BLOCK") {
          rejectedByReversalRisk++;
          console.log(`🛑 ${symbol}: ${unifiedReversal.reason}`);
          await logRejectionWithAI(
            supabase,
            userId,
            symbol,
            `Unified Reversal BLOCK: score=${unifiedReversal.score}/100 - ${unifiedReversal.signals.slice(0, 3).join(", ")}`,
            { 
              unifiedReversalScore: unifiedReversal.score,
              decision: unifiedReversal.decision,
              breakdown: unifiedReversal.breakdown,
              reversalSignals: unifiedReversal.signals,
              trend,
              adx: adx.toFixed(1),
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
            trendData,
            riskParams.ai_analysis_enabled !== false
          );
          continue;
        }
        
        // REDUCE: Medium reversal risk - log warning, reduce position size
        if (unifiedReversal.decision === "REDUCE") {
          console.log(`⚠️ ${symbol}: ${unifiedReversal.reason}`);
        } else {
          console.log(`✓ ${symbol}: Unified reversal check passed (${unifiedReversal.score}/100)`);
        }

        // ============= STOCHRSI EXTREME FILTER WITH SMART EXCEPTIONS =============
        // Prevent entries at extreme oversold/overbought 4h levels where bounces are likely
        // BUT allow if multiple strong trend continuation signals are present
        const stochRsi4h = trendData.stochasticRsi?.["4h"] || trendData.stochasticRsi?.aggregated;
        const stochRsi1h = trendData.stochasticRsi?.["1h"];
        const stochRsiK4h = stochRsi4h?.k ?? 50;
        const stochRsiD4h = stochRsi4h?.d ?? 50;
        const stochRsiK1h = stochRsi1h?.k ?? 50;
        const STOCHRSI_OVERSOLD_THRESHOLD = 10;  // Below 10 = extreme oversold
        const STOCHRSI_OVERBOUGHT_THRESHOLD = 90; // Above 90 = extreme overbought
        const STRONG_TREND_ADX_THRESHOLD = ADX_THRESHOLDS.VERY_STRONG;  // ADX >= 30 = strong trend
        
        // Get trend data for both timeframes (for StochRSI filter)
        const stochFilterTrend4h = trendData.higherTimeframeFilter?.trend4h || "neutral";
        const stochFilterTrend1h = trendData.higherTimeframeFilter?.trend1h || "neutral";
        const stochFilterConf4h = trendData.confidenceBreakdown?.["4h"]?.confidence || 50;
        const stochFilterConf1h = trendData.confidenceBreakdown?.["1h"]?.confidence || 50;
        
        // Get momentum and divergence info
        const hasBearishDivergence = trendData.momentum?.hasDivergence && trend === "bullish";
        const hasBullishDivergence = trendData.momentum?.hasDivergence && trend === "bearish";
        const macdHistogram = trendData.momentum?.macdHistogram ?? 0;
        const macdExpanding = trendData.momentum?.macdExpanding ?? false;
        
        // Get Bollinger Band info for breakout detection
        const bollingerPosition = trendData.bollingerBands?.aggregated?.pricePosition || "middle";
        const percentB = trendData.bollingerBands?.aggregated?.percentB ?? 50;
        
        // Determine if StochRSI is rising or falling (K vs D comparison)
        const stochRsiRising = stochRsiK4h > stochRsiD4h;
        const stochRsiFalling = stochRsiK4h < stochRsiD4h;
        
        // Check if we're at extreme StochRSI levels
        const isExtremeOversold4h = stochRsiK4h < STOCHRSI_OVERSOLD_THRESHOLD;
        const isExtremeOverbought4h = stochRsiK4h > STOCHRSI_OVERBOUGHT_THRESHOLD;
        const isTrendStrong = adx >= STRONG_TREND_ADX_THRESHOLD;
        
        // Determine intended trade direction from trend
        const intendedTradeDirection = trend === "bullish" ? "long" : trend === "bearish" ? "short" : null;
        
        // ===== SMART EXCEPTION FOR LONG AT OVERBOUGHT =====
        // Allow LONG when StochRSI > 90 IF:
        // 1. Strong uptrend on 4h (bullish + confidence >= 65%)
        // 2. Strong uptrend on 1h (bullish + confidence >= 60%)
        // 3. No bearish divergence
        // 4. Breakout or higher low pattern (price at/above upper BB or %B > 70)
        // 5. StochRSI is rising (K > D) - momentum still building
        if (intendedTradeDirection === "long" && isExtremeOverbought4h) {
          // MANDATORY: StochRSI must be rising (K > D) for any extreme overbought entry
          if (!stochRsiRising) {
            rejectedByStochRsiExtreme++;
            console.log(`⛔ ${symbol}: Blocking LONG - StochRSI not rising at overbought (K=${stochRsiK4h.toFixed(1)}, D=${stochRsiD4h.toFixed(1)})`);
            await supabase.from("signal_rejection_log").insert({
              user_id: userId, symbol,
              rejection_reason: `StochRSI extreme: K=${stochRsiK4h.toFixed(1)} overbought, StochRSI NOT rising (K <= D)`,
              filters_status: { stochRsiK4h, stochRsiD4h, stochRsiRising, gate: "STOCHRSI_NOT_RISING" },
              trend_data: trendData, checked_at: new Date().toISOString(),
            });
            continue;
          }
          
          // MANDATORY: No bearish divergence allowed at extreme overbought
          if (hasBearishDivergence) {
            rejectedByStochRsiExtreme++;
            console.log(`⛔ ${symbol}: Blocking LONG - Bearish divergence at overbought (K=${stochRsiK4h.toFixed(1)})`);
            await supabase.from("signal_rejection_log").insert({
              user_id: userId, symbol,
              rejection_reason: `StochRSI extreme: K=${stochRsiK4h.toFixed(1)} overbought with bearish divergence`,
              filters_status: { stochRsiK4h, hasBearishDivergence: true, gate: "BEARISH_DIVERGENCE_AT_EXTREME" },
              trend_data: trendData, checked_at: new Date().toISOString(),
            });
            continue;
          }
          
          // STRICT: Require full smart exception conditions (NO ADX-ONLY BYPASS)
          const strongUptrend4h = stochFilterTrend4h === "bullish" && stochFilterConf4h >= 75;
          const strongUptrend1h = stochFilterTrend1h === "bullish" && stochFilterConf1h >= 70;
          const breakoutOrHigherLow = bollingerPosition === "above_upper" || bollingerPosition === "upper_zone" || percentB > 70;
          const stochMomentumUp = stochRsiRising && macdHistogram > 0;
          
          const allowExtremeOverbought = strongUptrend4h && strongUptrend1h && breakoutOrHigherLow && stochMomentumUp;
          
          if (allowExtremeOverbought) {
            console.log(`📊 ${symbol}: 4h StochRSI K=${stochRsiK4h.toFixed(1)} extreme overbought - ALLOWING LONG (strong uptrend both TFs, breakout, StochRSI rising)`);
          } else {
            rejectedByStochRsiExtreme++;
            console.log(`⛔ ${symbol}: Blocking LONG - 4h StochRSI K=${stochRsiK4h.toFixed(1)} overbought | 4h=${stochFilterTrend4h}(${stochFilterConf4h}%) 1h=${stochFilterTrend1h}(${stochFilterConf1h}%) BB=${bollingerPosition}`);
            await supabase.from("signal_rejection_log").insert({
              user_id: userId, symbol,
              rejection_reason: `StochRSI extreme: K=${stochRsiK4h.toFixed(1)} overbought, failed smart exception (no ADX bypass)`,
              filters_status: { 
                stochRsiK4h: stochRsiK4h.toFixed(1), stochRsiD4h: stochRsiD4h.toFixed(1), stochRsiRising,
                trend4h: stochFilterTrend4h, confidence4h: stochFilterConf4h,
                trend1h: stochFilterTrend1h, confidence1h: stochFilterConf1h,
                bollingerPosition, percentB, macdHistogram, adx: adx.toFixed(1),
                reason: "Overbought without ALL smart exception conditions met"
              },
              trend_data: trendData, checked_at: new Date().toISOString(),
            });
            continue;
          }
        }
        
        // ===== SMART EXCEPTION FOR SHORT AT OVERSOLD =====
        // Allow SHORT when StochRSI < 10 IF:
        // 1. Strong downtrend on 4h (bearish + confidence >= 65%)
        // 2. Strong downtrend on 1h (bearish + confidence >= 60%)
        // 3. No bullish divergence
        // 4. Breakdown or lower high pattern (price at/below lower BB or %B < 30)
        // 5. StochRSI is falling (K < D) - not curling up
        if (intendedTradeDirection === "short" && isExtremeOversold4h) {
          // MANDATORY: StochRSI must be falling (K < D) for any extreme oversold entry
          if (!stochRsiFalling) {
            rejectedByStochRsiExtreme++;
            console.log(`⛔ ${symbol}: Blocking SHORT - StochRSI not falling at oversold (K=${stochRsiK4h.toFixed(1)}, D=${stochRsiD4h.toFixed(1)})`);
            await supabase.from("signal_rejection_log").insert({
              user_id: userId, symbol,
              rejection_reason: `StochRSI extreme: K=${stochRsiK4h.toFixed(1)} oversold, StochRSI NOT falling (K >= D)`,
              filters_status: { stochRsiK4h, stochRsiD4h, stochRsiFalling, gate: "STOCHRSI_NOT_FALLING" },
              trend_data: trendData, checked_at: new Date().toISOString(),
            });
            continue;
          }
          
          // MANDATORY: No bullish divergence allowed at extreme oversold
          if (hasBullishDivergence) {
            rejectedByStochRsiExtreme++;
            console.log(`⛔ ${symbol}: Blocking SHORT - Bullish divergence at oversold (K=${stochRsiK4h.toFixed(1)})`);
            await supabase.from("signal_rejection_log").insert({
              user_id: userId, symbol,
              rejection_reason: `StochRSI extreme: K=${stochRsiK4h.toFixed(1)} oversold with bullish divergence`,
              filters_status: { stochRsiK4h, hasBullishDivergence: true, gate: "BULLISH_DIVERGENCE_AT_EXTREME" },
              trend_data: trendData, checked_at: new Date().toISOString(),
            });
            continue;
          }
          
          // STRICT: Require full smart exception conditions (NO ADX-ONLY BYPASS)
          const strongDowntrend4h = stochFilterTrend4h === "bearish" && stochFilterConf4h >= 75;
          const strongDowntrend1h = stochFilterTrend1h === "bearish" && stochFilterConf1h >= 70;
          const breakdownOrLowerHigh = bollingerPosition === "below_lower" || bollingerPosition === "lower_zone" || percentB < 30;
          const stochMomentumDown = stochRsiFalling && macdHistogram < 0;
          
          const allowExtremeOversold = strongDowntrend4h && strongDowntrend1h && breakdownOrLowerHigh && stochMomentumDown;
          
          if (allowExtremeOversold) {
            console.log(`📊 ${symbol}: 4h StochRSI K=${stochRsiK4h.toFixed(1)} extreme oversold - ALLOWING SHORT (strong downtrend both TFs, breakdown, StochRSI falling)`);
          } else {
            rejectedByStochRsiExtreme++;
            console.log(`⛔ ${symbol}: Blocking SHORT - 4h StochRSI K=${stochRsiK4h.toFixed(1)} oversold | 4h=${stochFilterTrend4h}(${stochFilterConf4h}%) 1h=${stochFilterTrend1h}(${stochFilterConf1h}%) BB=${bollingerPosition}`);
            await supabase.from("signal_rejection_log").insert({
              user_id: userId, symbol,
              rejection_reason: `StochRSI extreme: K=${stochRsiK4h.toFixed(1)} oversold, failed smart exception (no ADX bypass)`,
              filters_status: { 
                stochRsiK4h: stochRsiK4h.toFixed(1), stochRsiD4h: stochRsiD4h.toFixed(1), stochRsiFalling,
                trend4h: stochFilterTrend4h, confidence4h: stochFilterConf4h,
                trend1h: stochFilterTrend1h, confidence1h: stochFilterConf1h,
                bollingerPosition, percentB, macdHistogram, adx: adx.toFixed(1),
                reason: "Oversold without ALL smart exception conditions met"
              },
              trend_data: trendData, checked_at: new Date().toISOString(),
            });
            continue;
          }
        }
        
        // Log StochRSI status for monitoring
        if (stochRsiK4h < STOCHRSI_THRESHOLDS.OVERSOLD || stochRsiK4h > STOCHRSI_THRESHOLDS.OVERBOUGHT) {
          console.log(`📊 ${symbol}: 4h StochRSI K=${stochRsiK4h.toFixed(1)} (near extreme but proceeding with ${intendedTradeDirection || "neutral"} direction)`);
        }

        // ================= HARD ENTRY GATES =================
        // These are non-negotiable requirements for ANY signal
        // Quality score should RANK good trades, not RESCUE weak ones
        
        // GATE 1: ADX must be >= MINIMUM for any trade (trend strength required)
        if (adx < ADX_THRESHOLDS.MINIMUM) {
          rejectedByHardGates++;
          await logRejectionWithAI(
            supabase, userId, symbol,
            `HARD GATE: ADX too low (${adx.toFixed(1)} < ${ADX_THRESHOLDS.MINIMUM}) - no trend strength`,
            { 
              gate: "ADX_TOO_LOW",
              adx: adx.toFixed(1),
              adxRequired: ADX_THRESHOLDS.MINIMUM,
              trend,
              confidence,
              trendConsistency: trendData.trendConsistency?.toFixed(1),
              // Additional context for UI
              momentum: {
                state: momentum?.state || "none",
                confirms: momentum?.confirms ?? false,
                macdHistogram: momentum?.macdHistogram?.toFixed(4),
                lastCloseAlignsWithTrend: momentum?.lastCloseAlignsWithTrend
              },
              stochRsi: trendData.stochasticRsi?.aggregated,
              volatility: {
                atrPercent: trendData.volatility?.atrPercent?.toFixed(2),
                isRanging: trendData.ranging?.isRanging
              }
            },
            trendData,
            riskParams.ai_analysis_enabled !== false
          );
          continue;
        }
        
        // GATE 2: Momentum must be confirmed (not "none" or unconfirmed)
        const momentumState = momentum?.state || "none";
        const momentumConfirms = momentum?.confirms ?? false;
        if (momentumState === "none" || !momentumConfirms) {
          rejectedByHardGates++;
          await logRejectionWithAI(
            supabase, userId, symbol,
            `HARD GATE: No momentum confirmation (state=${momentumState}, confirms=${momentumConfirms})`,
            { 
              gate: "NO_MOMENTUM_CONFIRMATION",
              momentumState,
              momentumConfirms,
              adx: adx.toFixed(1),
              trend,
              confidence,
              // Detailed momentum analysis
              momentum: {
                state: momentumState,
                confirms: momentumConfirms,
                macdHistogram: momentum?.macdHistogram?.toFixed(4),
                macdDirectionAligned: momentum?.macdDirectionAligned,
                lastCloseAlignsWithTrend: momentum?.lastCloseAlignsWithTrend,
                hasDivergence: momentum?.hasDivergence
              },
              stochRsi: trendData.stochasticRsi?.aggregated,
              htfFilter: {
                aligned: higherTimeframeFilter?.aligned,
                trend4h: higherTimeframeFilter?.trend4h,
                trend1h: higherTimeframeFilter?.trend1h
              }
            },
            trendData,
            riskParams.ai_analysis_enabled !== false
          );
          continue;
        }
        
        // GATE 3: Higher timeframe alignment required (or high confidence)
        const htfAligned = higherTimeframeFilter?.aligned ?? false;
        if (!htfAligned && confidence < 65) {
          rejectedByHardGates++;
          await logRejectionWithAI(
            supabase, userId, symbol,
            `HARD GATE: HTF not aligned and confidence too low (aligned=${htfAligned}, confidence=${confidence}%)`,
            { htfAligned, confidence, gate: "HTF_NOT_ALIGNED" },
            trendData,
            riskParams.ai_analysis_enabled !== false
          );
          continue;
        }
        
        // GATE 4: Confidence Dead Zone Veto (60-69% is worst performing zone) - Uses centralized ADX_THRESHOLDS
        // Data shows 60-69% confidence = 31.73% win rate vs 50-59% = 46.34%
        if (confidence >= 60 && confidence < 70 && adx < ADX_THRESHOLDS.VERY_STRONG) {
          rejectedByHardGates++;
          await logRejectionWithAI(
            supabase, userId, symbol,
            `HARD GATE: Confidence dead zone (${confidence}% in 60-69 range with ADX=${adx.toFixed(1)} < ${ADX_THRESHOLDS.VERY_STRONG})`,
            { confidence, adx: adx.toFixed(1), gate: "CONFIDENCE_DEAD_ZONE" },
            trendData,
            riskParams.ai_analysis_enabled !== false
          );
          continue;
        }
        
        console.log(`✅ ${symbol}: Passed all hard gates (ADX=${adx.toFixed(1)}, momentum=${momentumState}/${momentumConfirms}, HTF=${htfAligned || `conf=${confidence}%`}, conf=${confidence}%)`);

        // ============= GATE 5: STRATEGY SUPPORT FOR TREND DIRECTION =============
        // Check if any strategy can support the current trend direction BEFORE quality scoring
        // Strategies validate signals, not rescue weak ones
        const tradeDirectionForGate = higherTimeframeFilter?.tradeDirection || trend;
        
        // Count strategies that could generate a signal for this trend
        let strategiesWithDirectionalSupport = 0;
        let strategiesWithConditionBasis = 0;
        
        for (const strategy of allStrategies) {
          const strategyDirection = strategy.signal_direction || 'trend';
          const hasConditions = (strategy.entry_conditions?.length || 0) > 0;
          const hasIndicators = (strategy.indicators?.length || 0) > 0;
          
          // Check if this strategy can support the current trend direction
          let canSupportTrend = false;
          if (strategyDirection === 'trend') {
            // Trend-following strategies support any directional trend
            canSupportTrend = tradeDirectionForGate === 'bullish' || tradeDirectionForGate === 'bearish';
          } else if (strategyDirection === 'long' && tradeDirectionForGate === 'bullish') {
            canSupportTrend = true;
          } else if (strategyDirection === 'short' && tradeDirectionForGate === 'bearish') {
            canSupportTrend = true;
          }
          
          if (canSupportTrend) {
            strategiesWithDirectionalSupport++;
            // Check if it has actual conditions (not just trend-follow decoration)
            if (hasConditions && hasIndicators) {
              strategiesWithConditionBasis++;
            }
          }
        }
        
        // GATE: Must have at least 1 strategy with directional support
        if (strategiesWithDirectionalSupport === 0) {
          rejectedByHardGates++;
          await logRejectionWithAI(
            supabase, userId, symbol,
            `HARD GATE: No strategy supports ${tradeDirectionForGate} trend direction`,
            { tradeDirection: tradeDirectionForGate, totalStrategies: allStrategies.length, gate: "NO_STRATEGY_SUPPORT" },
            trendData,
            riskParams.ai_analysis_enabled !== false
          );
          continue;
        }
        
        // GATE: Must have at least 1 strategy with actual conditions (not just trend-follow)
        if (strategiesWithConditionBasis === 0) {
          rejectedByHardGates++;
          await logRejectionWithAI(
            supabase, userId, symbol,
            `HARD GATE: No condition-based strategy for ${tradeDirectionForGate} (${strategiesWithDirectionalSupport} trend-followers only)`,
            { tradeDirection: tradeDirectionForGate, directionalSupport: strategiesWithDirectionalSupport, conditionBased: 0, gate: "NO_CONDITION_STRATEGY" },
            trendData,
            riskParams.ai_analysis_enabled !== false
          );
          continue;
        }
        
        console.log(`📋 ${symbol}: ${strategiesWithConditionBasis}/${allStrategies.length} strategies support ${tradeDirectionForGate} with conditions`);

        // ============= Technical Indicators =============
        const stochRsiEval = evaluateStochRSI(trendData.stochasticRsi, trend);
        const bollingerEval = evaluateBollingerBands(trendData.bollingerBands, trend);

        // ============= IMPROVEMENT #3: Pullback Entry Detection =============
        const pullbackAnalysis = analyzePullbackEntry(trendData, trend);

        // ============= RECOVERY MODE = STRICT MODE =============
        // Recovery mode reduces frequency, not gambles smaller
        // Must meet ALL strict conditions to trade during recovery
        if (isInRecoveryMode) {
          // STRICT 1: ADX must be >= STRONG (stronger trend required during recovery)
          if (adx < ADX_THRESHOLDS.STRONG) {
            rejectedByHardGates++;
            await logRejectionWithAI(
              supabase, userId, symbol,
              `RECOVERY MODE: ADX too low (${adx.toFixed(1)} < ${ADX_THRESHOLDS.STRONG}) - only strong trends during recovery`,
              { adx: adx.toFixed(1), gate: "RECOVERY_ADX_STRICT", consecutiveLosses: riskParams.consecutive_losses },
              trendData,
              riskParams.ai_analysis_enabled !== false
            );
            continue;
          }
          
          // STRICT 2: Must have BOTH pullback conditions (RSI + Bollinger)
          if (!pullbackAnalysis.hasBothConditions) {
            rejectedByHardGates++;
            await logRejectionWithAI(
              supabase, userId, symbol,
              `RECOVERY MODE: No optimal pullback entry (need RSI + BB conditions)`,
              { pullbackReason: pullbackAnalysis.reason, hasBoth: false, gate: "RECOVERY_PULLBACK_STRICT", consecutiveLosses: riskParams.consecutive_losses },
              trendData,
              riskParams.ai_analysis_enabled !== false
            );
            continue;
          }
          
          // STRICT 3: Confidence must be in optimal zone (50-70%) - NOT dead zone
          if (confidence >= 70) {
            rejectedByHardGates++;
            await logRejectionWithAI(
              supabase, userId, symbol,
              `RECOVERY MODE: Confidence too high (${confidence}% >= 70) - late entries during recovery`,
              { confidence, gate: "RECOVERY_CONFIDENCE_STRICT", consecutiveLosses: riskParams.consecutive_losses },
              trendData,
              riskParams.ai_analysis_enabled !== false
            );
            continue;
          }
          
          console.log(`🔄 ${symbol}: Passed RECOVERY STRICT MODE checks (ADX=${adx.toFixed(1)}, pullback=BOTH, conf=${confidence}%)`);
        }

        // ============= IMPROVEMENT #1: Quality Score System with CONFIDENCE INVERSION =============
        const confidencePenalty = getConfidencePenalty(confidence);
        // Direction bonus: +3 for SHORT/SELL signals (historically 38% vs 31% win rate)
        const directionBonus = trend === "bearish" ? 3 : 0;
        // NEW: Volume score component
        const volumeScore = getVolumeScore(trendData, trend);
        
        // Cap pullback score when volume doesn't confirm - prevents "perfect pullback, no volume" trap
        let entryTimingScore = Math.max(0, pullbackAnalysis.entryTimingScore);
        const volumeConfirms = momentum?.volumeConfirms ?? false;
        if (!volumeConfirms && entryTimingScore > 15) {
          console.log(`⚠️ ${symbol}: Capping pullback score ${entryTimingScore}→15 (volume not confirming)`);
          entryTimingScore = 15;
        }
        
        const qualityFactors: QualityFactors = {
          adxScore: getAdxScore(adx),
          momentumScore: getMomentumScore(momentum),
          alignmentScore: getAlignmentScore(confidence, trendConsistency, higherTimeframeFilter?.aligned || false, trendData),
          technicalScore: getTechnicalScore(trendData, trend, symbol),
          entryTimingScore: entryTimingScore,
          volumeScore: volumeScore,                // NEW: Volume confirmation
          confidencePenalty: confidencePenalty,    // Penalize high confidence entries
          directionBonus: directionBonus,          // +3 for SHORT signals
        };

        const { score: qualityScore, breakdown } = calculateQualityScore(qualityFactors);

        // Log confidence inversion impact
        if (confidencePenalty < 0) {
          console.log(`⚠️ ${symbol} Confidence penalty: ${confidencePenalty} (confidence=${confidence}% is above optimal 50-70% zone)`);
        }
        // Log volume score
        if (volumeScore > 0) {
          console.log(`📊 ${symbol} Volume score: +${volumeScore}/10 pts`);
        }
        console.log(`📊 ${symbol} Quality: ${qualityScore}/100 [${breakdown}] | Regime: ${regime.regime} | Entry: ${pullbackAnalysis.reason} | Pullback: ${pullbackAnalysis.hasBothConditions ? 'OPTIMAL' : pullbackAnalysis.isPullback ? 'YES' : 'NO'}`);

        // ============= DYNAMIC QUALITY THRESHOLD =============
        // Calculate threshold based on ADX for this specific symbol
        const MIN_QUALITY_SCORE = getMinQualityScore(adx, isInRecoveryMode);
        
        // Check minimum quality threshold
        if (qualityScore < MIN_QUALITY_SCORE) {
          rejectedByQuality++;
          await supabase.from("signal_rejection_log").insert({
            user_id: userId, symbol,
            rejection_reason: `Quality score too low: ${qualityScore}/100 (min: ${MIN_QUALITY_SCORE}, ADX=${adx.toFixed(1)})`,
            filters_status: {
              qualityScore, breakdown, minRequired: MIN_QUALITY_SCORE,
              dynamicThreshold: true,
              adx: adx.toFixed(1),
              factors: qualityFactors,
              regime: regime.regime,
              entryTiming: pullbackAnalysis.reason,
            },
            trend_data: trendData,
            checked_at: new Date().toISOString(),
          });
          continue;
        }

        // NOTE: Confidence and consistency thresholds are now incorporated into the quality score
        // via alignmentScore and confidencePenalty, eliminating redundant filtering that was
        // blocking high-quality signals (e.g., 73/100 quality rejected for 61% confidence)

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

        // ============= REGIME-AWARE STRATEGY FILTERING =============
        // Convert detected regime to type for performance lookup
        const currentRegimeType: RegimeType = regime.regime === "trending" ? "trending" : "ranging";
        
        // Filter out strategies disabled for this regime
        const regimeFilteredCandidates = candidates.filter(c => 
          !isStrategyDisabledForRegime(c.strategy.name, currentRegimeType)
        );
        
        if (regimeFilteredCandidates.length === 0) {
          rejectedByStrategy++;
          console.log(`📊 ${symbol}: All ${candidates.length} strategies disabled for ${currentRegimeType} regime`);
          await logRejectionWithAI(supabase, userId, symbol, 
            `All matching strategies disabled for ${currentRegimeType} regime`, 
            { regime: currentRegimeType, strategiesFiltered: candidates.map(c => c.strategy.name) },
            trendData, riskParams.ai_analysis_enabled !== false);
          continue;
        }
        
        // Select BEST strategy (highest score)
        // Apply regime-aware strategy performance bonus for high performers
        // CAPPED to prevent bonus from overpowering technical quality differences
        const MAX_STRATEGY_BONUS = 5;
        const MIN_QUALITY_DIFF_FOR_OVERRIDE = 8; // Technical score must differ by at least this much for bonus to matter
        
        regimeFilteredCandidates.sort((a, b) => {
          const baseScoreA = a.score;
          const baseScoreB = b.score;
          
          // Calculate strategy bonus (capped)
          const isHighPerformerA = isStrategyHighPerformerForRegime(a.strategy.name, currentRegimeType);
          const isHighPerformerB = isStrategyHighPerformerForRegime(b.strategy.name, currentRegimeType);
          const bonusA = isHighPerformerA ? MAX_STRATEGY_BONUS : 0;
          const bonusB = isHighPerformerB ? MAX_STRATEGY_BONUS : 0;
          
          // Apply bonus only if technical scores are close enough
          // This prevents a mediocre setup with hot strategy from beating a clearly superior setup
          const technicalDiff = Math.abs(baseScoreA - baseScoreB);
          const effectiveBonusA = technicalDiff < MIN_QUALITY_DIFF_FOR_OVERRIDE ? bonusA : 0;
          const effectiveBonusB = technicalDiff < MIN_QUALITY_DIFF_FOR_OVERRIDE ? bonusB : 0;
          
          const finalScoreA = baseScoreA + effectiveBonusA;
          const finalScoreB = baseScoreB + effectiveBonusB;
          
          return finalScoreB - finalScoreA;
        });
        
        const best = regimeFilteredCandidates[0];
        const strategy = best.strategy;
        const signalType = best.signalType;
        const isHighPerformer = isStrategyHighPerformerForRegime(strategy.name, currentRegimeType);
        console.log(`🎯 ${symbol}: Selected "${strategy.name}"${isHighPerformer ? ' ⭐' : ''} [${currentRegimeType}] (${regimeFilteredCandidates.length}/${candidates.length} strategies after regime filter, best score: ${best.score}, direction: ${signalType})`);
        
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
            // Reversal decision tracking for analytics
            reversalDecision: unifiedReversal.decision,
            reversalScore: unifiedReversal.score,
            reversalDetails: {
              breakdown: unifiedReversal.breakdown,
              signals: unifiedReversal.signals,
              adxWeight: unifiedReversal.adxWeight,
              positionSizeMultiplier: unifiedReversal.positionSizeMultiplier,
            },
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

    console.log(`📈 Summary: ${totalSignalsGenerated} signals | Rejected: hardGates=${rejectedByHardGates} regime=${rejectedByRegime} reversal=${rejectedByReversalRisk} stochRsiExtreme=${rejectedByStochRsiExtreme} quality=${rejectedByQuality} strategy=${rejectedByStrategy}`);

    return new Response(JSON.stringify({
      signals,
      totalSignalsGenerated,
      signalsAfterDeduplication: signals.length,
      executedSignals,
      autoExecuteEnabled: riskParams.auto_execute_signals,
      rejections: {
        byRegime: rejectedByRegime,
        byReversalRisk: rejectedByReversalRisk,
        byStochRsiExtreme: rejectedByStochRsiExtreme,
        byQuality: rejectedByQuality,
        byStrategy: rejectedByStrategy,
      },
      filters: {
        disabledSymbols: Array.from(disabledSymbols),
        disabledStrategiesByRegime: {
          trending: Array.from(disabledStrategiesByRegime.get("trending") || []),
          ranging: Array.from(disabledStrategiesByRegime.get("ranging") || []),
        },
        highPerformingStrategiesByRegime: {
          trending: Array.from(highPerformingStrategiesByRegime.get("trending") || []),
          ranging: Array.from(highPerformingStrategiesByRegime.get("ranging") || []),
        },
      },
      minQualityScore: DEFAULT_MIN_QUALITY,
      message: `Quality Score System active (dynamic threshold based on ADX)`,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("Error in strategy analyzer:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Failed to analyze strategies",
      signals: [],
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
