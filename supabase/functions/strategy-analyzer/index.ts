import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.84.0";
import { 
  ADX_THRESHOLDS, 
  STOCHRSI_THRESHOLDS, 
  RSI_THRESHOLDS, 
  CONFIDENCE_THRESHOLDS,
  QUALITY_THRESHOLDS,
  MOMENTUM_THRESHOLDS,
  CORRELATION_PARAMS,
  STRATEGY_PARAMS,
  SYMBOL_PARAMS,
  RISK_PARAMS,
  EMERGENCY_EXIT_PARAMS,
  EXIT_THRESHOLDS,
  ENTRY_TIMING_PARAMS,
  REVERSAL_OVERRIDE_SAFETY,
  BREAKOUT_THRESHOLDS,
  MICRO_TREND_PARAMS,
  TREND_STRENGTH_PARAMS,
  EXCEPTION_BUDGET,
  RECOVERY_MODE_PARAMS,
  isMomentumStrategy,
  isNeutralStrategy,
  detectStrategyType,
  type ExceptionType
} from "../_shared/constants.ts";
import { 
  getTechnicalScore, 
  getMomentumScore, 
  getAlignmentScore, 
  getConfidencePenalty, 
  getAdxScore,
  getVolumeScore as sharedGetVolumeScore,
  getAdxWeight,
  calculateUnifiedReversalScore,
  detectMarketRegime,
  isValidSqueezeBreakout,
  deriveTradeDirection,
  getAdxPhase,
  getAdxPhaseInfo,
  detectBreakoutMode,
  calculateTrendStrength,
  determineExceptionPriority,
  checkExceptionBudget,
  type UnifiedReversalResult,
  type MarketRegime,
  type SqueezeBreakoutResult,
  type DirectionResult,
  type BreakoutModeResult,
  type TrendStrengthResult,
  type ExceptionResult,
  type ExceptionBudgetResult
} from "../_shared/scoring.ts";
import { analyzeOrderFlow, getOrderFlowQualityBonus, type OrderFlowAnalysis } from "../_shared/orderflow.ts";
import { checkPositionCorrelation, getCorrelationAdjustedSize } from "../_shared/correlation.ts";
import { createLogger, logError, LOG_CATEGORIES } from "../_shared/logging.ts";
import { getKlines, get24hrTicker, parseKlinePrices } from "../_shared/binance.ts";

// Create logger for this function
const logger = createLogger('strategy-analyzer');

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============= AI REJECTION ANALYZER HELPER =============
// Calls AI to validate rejections and stores results in database
const analyzeRejectionWithAI = async (
  supabase: any,
  rejectionId: string,
  rejection: { symbol: string; rejection_reason: string; filters_status: any; trend_data: any }
) => {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    logger.forSymbol(rejection.symbol).debug(`🤖 AI analysis skipped: API key not configured`);
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
      logger.forSymbol(rejection.symbol).warn(`🤖 AI analysis failed: HTTP ${response.status}`);
      return;
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      logger.forSymbol(rejection.symbol).warn(`🤖 AI analysis: No tool call in response`);
      return;
    }

    const aiResult = JSON.parse(toolCall.function.arguments);
    
    // Update the rejection record with AI analysis
    const { error } = await supabase
      .from("signal_rejection_log")
      .update({ ai_analysis: aiResult })
      .eq("id", rejectionId);

    if (error) {
      logger.forSymbol(rejection.symbol).error(`🤖 Failed to store AI analysis: ${error.message}`);
    } else {
      logger.forSymbol(rejection.symbol).info(`🤖 AI analysis stored: isValid=${aiResult.isValid}, confidence=${aiResult.confidence}`);
    }
  } catch (error) {
    logger.forSymbol(rejection.symbol).error(`🤖 AI analysis error: ${error}`);
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
    logger.forSymbol(symbol).error(`Failed to log rejection: ${error.message}`);
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
    }).catch(err => logger.forSymbol(symbol).error(`AI analysis failed: ${err}`));
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
  },
  // NEW: Neutral trend strategy - trades when 5m is neutral but HTF (1h) shows strong directional bias
  {
    id: 'builtin-htf-neutral-breakout',
    name: 'HTF Neutral Breakout',
    signal_direction: 'neutral',  // Supports neutral 5m trend when HTF is directional
    entry_conditions: [
      { indicator: 'RSI', operator: 'above', value: '40', compareToIndicator: false },
      { indicator: 'RSI', operator: 'below', value: '60', compareToIndicator: false }
    ],
    exit_conditions: [{ indicator: 'RSI', operator: 'above', value: '70', compareToIndicator: false }],
    indicators: [{ type: 'RSI', name: 'RSI', period: 14 }],
    risk_settings: { stopLossPercent: 2, takeProfitPercent: 4, positionSizePercent: 1.5 }
  }
];

// ============= IMPROVEMENT #1: Quality Score System =============
// Replace tier-based filtering with unified 0-100 quality score
// NEW: Added confidence penalty, pullback bonus, volume score, and strategy performance bonus
interface QualityFactors {
  adxScore: number;          // 0-25 points based on trend strength
  momentumScore: number;     // 0-20 points based on momentum confirmation
  alignmentScore: number;    // 0-14 points based on timeframe alignment (FIX: was showing /20)
  technicalScore: number;    // 0-15 points based on StochRSI/Bollinger signals
  entryTimingScore: number;  // 0-25 points based on pullback/entry timing
  volumeScore: number;       // 0-10 points based on volume confirmation
  orderFlowScore: number;    // -15 to +15 based on order flow analysis (NEW)
  confidencePenalty: number; // 0 to -25 penalty for high confidence (inversion fix)
  directionBonus: number;    // +3 for SHORT signals (SELL outperforms BUY historically)
}

const calculateQualityScore = (factors: QualityFactors): { score: number; breakdown: string } => {
  const score = Math.min(100, Math.max(0,
    factors.adxScore +
    factors.momentumScore +
    factors.alignmentScore +
    factors.technicalScore +
    factors.entryTimingScore +
    factors.volumeScore +        // Volume confirmation score
    factors.orderFlowScore +     // NEW: Order flow analysis (-15 to +15)
    factors.confidencePenalty +  // Can be negative!
    factors.directionBonus       // +3 for SELL signals
  ));
  
  const penaltyStr = factors.confidencePenalty < 0 ? ` CONF_PEN:${factors.confidencePenalty}` : '';
  const bonusStr = factors.directionBonus > 0 ? ` DIR_BONUS:+${factors.directionBonus}` : '';
  // FIX: Volume always shows even if 0 to make debugging easier
  const volumeStr = ` VOL:${factors.volumeScore}/10`;
  // NEW: Order flow score display
  const orderFlowStr = factors.orderFlowScore !== 0 ? ` OF:${factors.orderFlowScore > 0 ? '+' : ''}${factors.orderFlowScore}` : '';
  // FIX: Correct max values to match actual scoring functions:
  // - ADX: 0-25 ✓
  // - Momentum: 0-20 ✓
  // - Alignment: 0-14 (was showing /20)
  // - Technical: 0-15 ✓
  // - Entry: 0-25 ✓
  // - Order Flow: -15 to +15 (NEW)
  const breakdown = `ADX:${factors.adxScore}/25 MOM:${factors.momentumScore}/20 ALIGN:${factors.alignmentScore}/14 TECH:${factors.technicalScore}/15 ENTRY:${factors.entryTimingScore}/25${volumeStr}${orderFlowStr}${penaltyStr}${bonusStr}`;
  
  return { score, breakdown };
};

// ============= VOLUME SCORE WRAPPER =============
// Wraps shared getVolumeScore with trendData extraction for local usage
const getVolumeScore = (trendData: any, trend: string): number => {
  const momentum = trendData?.momentum || {};
  const volatility = trendData?.volatility || {};
  
  const volumeConfirms = momentum.volumeConfirms ?? false;
  const volumeSpike = volatility.volumeSpike ?? false;
  const volumeRatio = volatility.volumeRatio ?? 1.0;
  const relativeATR = volatility.relativeATR ?? 1.0;
  const hasRangeExpansion = relativeATR > 1.0;
  
  return sharedGetVolumeScore(volumeConfirms, volumeSpike, volumeRatio, hasRangeExpansion, trend);
};

// ============= SCORING FUNCTIONS IMPORTED FROM SHARED MODULE =============
// getConfidencePenalty, calculateUnifiedReversalScore, detectMarketRegime
// UnifiedReversalResult, MarketRegime types
// are now imported from "../_shared/scoring.ts" for centralized maintenance

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
    signals: unifiedResult.reasons,
    reason: unifiedResult.reasons.slice(0, 3).join(", ")
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
  const stoch4h = trendData.stochasticRsi?.['4h'] || {};
  const k4h = stoch4h.k ?? 50;
  const bollingerBands = trendData.bollingerBands || {};
  const bb1h = bollingerBands["1h"] || {};
  const rsi = indicators.rsi || 50;
  const adx = trendData?.volatility?.adx || 0;
  const momentum = trendData?.momentum || {};
  const percentB = bb1h.percentB || 50;
  const timeframes = trendData?.timeframes || {};
  
  // Strong ADX = momentum continuation is valid strategy
  const isStrongTrend = adx >= ADX_THRESHOLDS.VERY_STRONG;
  const isMinTrend = adx >= ADX_THRESHOLDS.MINIMUM; // 20+
  const hasMacdExpanding = momentum.macdExpanding === true;
  const momentumState = momentum.state || "none";
  const isMomentumConfirmed = momentumState === "confirmed" || momentumState === "mixed";
  const isMomentumBuilding = momentumState === "building";
  const isActiveMomentum = isMomentumConfirmed || isMomentumBuilding || momentum.confirms === true;
  
  // Strong Trend Continuation Check: 4h + 1h aligned + momentum active
  const trend4h = timeframes['4h']?.trend || timeframes['4h']?.indicators?.emaSignal || "neutral";
  const trend1h = timeframes['1h']?.trend || timeframes['1h']?.indicators?.emaSignal || "neutral";
  const isBullishAligned = trend4h === "bullish" && trend1h === "bullish";
  const isBearishAligned = trend4h === "bearish" && trend1h === "bearish";
  
  const hasStrongTrendContinuation = isMinTrend && isActiveMomentum && (
    (trend === "bullish" && isBullishAligned) ||
    (trend === "bearish" && isBearishAligned)
  );
  
  // ============= STOCHRSI-RSI CONFLICT RESOLUTION =============
  // Check if StochRSI is at extreme that would reduce RSI signal reliability
  const isLong = trend === "bullish";
  const isStochRsiExtreme = isLong 
    ? k4h > STOCHRSI_THRESHOLDS.EXTREME_OVERBOUGHT  // 90+ for bullish
    : k4h < STOCHRSI_THRESHOLDS.EXTREME_OVERSOLD;   // 10- for bearish
  
  // Helper to apply StochRSI extreme weight reduction to RSI-based scores
  const applyStochRsiWeight = (score: number, reason: string): { score: number; reason: string } => {
    if (isStochRsiExtreme && score > 10) {
      const weighted = Math.round(score * 0.5);
      return { 
        score: weighted, 
        reason: `${reason} [StochRSI extreme: score ${score} -> ${weighted}]` 
      };
    }
    return { score, reason };
  };
  
  // Define pullback conditions
  const rsiPullbackBullish = rsi < RSI_THRESHOLDS.NEUTRAL_LOW;  // RSI showing pullback in uptrend
  const rsiPullbackBearish = rsi > RSI_THRESHOLDS.NEUTRAL_HIGH;  // RSI showing rally in downtrend
  const bollingerPullbackBullish = percentB < 35 || bb1h.pricePosition === "lower_zone";
  const bollingerPullbackBearish = percentB > 65 || bb1h.pricePosition === "upper_zone";
  
  // For bullish trend, look for pullback entries
  if (trend === "bullish") {
    // BEST ENTRY: Both RSI oversold AND near lower Bollinger
    if ((rsi < RSI_THRESHOLDS.BULLISH_PULLBACK || stochRsi.oversoldCount >= 1) && bollingerPullbackBullish) {
      const weighted = applyStochRsiWeight(25, "OPTIMAL: RSI oversold + near lower Bollinger band");
      return {
        isPullback: true,
        hasBothConditions: true,
        pullbackDepth: 100 - rsi,
        entryTimingScore: weighted.score,
        reason: weighted.reason
      };
    }
    
    // GOOD ENTRY: RSI pullback only
    if (rsi < RSI_THRESHOLDS.BULLISH_PULLBACK || stochRsi.oversoldCount >= 1) {
      const weighted = applyStochRsiWeight(18, "Bullish pullback: RSI oversold in uptrend");
      return {
        isPullback: true,
        hasBothConditions: false,
        pullbackDepth: 100 - rsi,
        entryTimingScore: weighted.score,
        reason: weighted.reason
      };
    }
    
    // GOOD ENTRY: Bollinger pullback only
    if (bollingerPullbackBullish) {
      const weighted = applyStochRsiWeight(15, "Bullish pullback: Price near lower Bollinger band");
      return {
        isPullback: true,
        hasBothConditions: false,
        pullbackDepth: 30,
        entryTimingScore: weighted.score,
        reason: weighted.reason
      };
    }
    
    // ACCEPTABLE: StochRSI bullish cross = reversal from pullback
    if (stochRsi.bullishCrossCount >= 1) {
      const weighted = applyStochRsiWeight(12, "Bullish pullback: StochRSI bullish cross");
      return {
        isPullback: true,
        hasBothConditions: false,
        pullbackDepth: 25,
        entryTimingScore: weighted.score,
        reason: weighted.reason
      };
    }
    
    // MOMENTUM CONTINUATION: Only if very strong trend + confirmed momentum
    // RSI must be in 45-65 range to prevent late entries near trend reversals
    const rsiInMomentumZone = rsi > RSI_THRESHOLDS.NEUTRAL_LOW && rsi < RSI_THRESHOLDS.BULLISH_STRONG; // 45-65
    if (isStrongTrend && hasMacdExpanding && isMomentumConfirmed && rsiInMomentumZone) {
      const weighted = applyStochRsiWeight(8, `Momentum continuation: Strong ADX + MACD expansion (RSI=${rsi.toFixed(1)})`);
      return {
        isPullback: false,
        hasBothConditions: false,
        pullbackDepth: 0,
        entryTimingScore: weighted.score,
        reason: weighted.reason
      };
    }
    
    // STRONG TREND CONTINUATION: 4h+1h aligned + momentum active (even if RSI not in ideal zone)
    // This gives partial credit when timeframes strongly agree even without perfect RSI setup
    if (hasStrongTrendContinuation) {
      let continuationScore = 10;
      let continuationReason = `Trend continuation: 4h+1h bullish aligned + momentum ${momentumState}`;
      
      // Bonus for MACD expanding
      if (hasMacdExpanding) {
        continuationScore = 14;
        continuationReason += " + MACD expanding";
      }
      
      // Slight reduction if RSI is getting overbought (but not blocking)
      if (rsi > RSI_THRESHOLDS.BULLISH_STRONG) {
        continuationScore = Math.max(8, continuationScore - 4);
        continuationReason += ` [RSI=${rsi.toFixed(1)} slightly extended]`;
      }
      
      const weighted = applyStochRsiWeight(continuationScore, continuationReason);
      return {
        isPullback: false,
        hasBothConditions: false,
        pullbackDepth: 0,
        entryTimingScore: weighted.score,
        reason: weighted.reason
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
    
    // MOMENTUM CONTINUATION FALLBACK: ADX >= 25 with MACD expanding
    // This catches entries where trend is strong but no clear pullback pattern
    if (adx >= ADX_THRESHOLDS.STRONG && hasMacdExpanding && rsi > RSI_THRESHOLDS.BULLISH_PULLBACK && rsi < RSI_THRESHOLDS.OVERBOUGHT) {
      return {
        isPullback: false,
        hasBothConditions: false,
        pullbackDepth: 0,
        entryTimingScore: 10,  // NEW: Momentum continuation credit
        reason: `Momentum continuation: ADX=${adx.toFixed(1)} + MACD expanding (RSI=${rsi.toFixed(1)})`
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
      const weighted = applyStochRsiWeight(25, "OPTIMAL: RSI overbought + near upper Bollinger band");
      return {
        isPullback: true,
        hasBothConditions: true,
        pullbackDepth: rsi - RSI_THRESHOLDS.NEUTRAL,
        entryTimingScore: weighted.score,
        reason: weighted.reason
      };
    }
    
    // GOOD ENTRY: RSI rally only
    if (rsi > RSI_THRESHOLDS.BEARISH_RALLY || stochRsi.overboughtCount >= 1) {
      const weighted = applyStochRsiWeight(18, "Bearish rally: RSI overbought in downtrend");
      return {
        isPullback: true,
        hasBothConditions: false,
        pullbackDepth: rsi - RSI_THRESHOLDS.NEUTRAL,
        entryTimingScore: weighted.score,
        reason: weighted.reason
      };
    }
    
    // GOOD ENTRY: Bollinger rally only
    if (bollingerPullbackBearish) {
      const weighted = applyStochRsiWeight(15, "Bearish rally: Price near upper Bollinger band");
      return {
        isPullback: true,
        hasBothConditions: false,
        pullbackDepth: 30,
        entryTimingScore: weighted.score,
        reason: weighted.reason
      };
    }
    
    // ACCEPTABLE: StochRSI bearish cross
    if (stochRsi.bearishCrossCount >= 1) {
      const weighted = applyStochRsiWeight(12, "Bearish rally: StochRSI bearish cross");
      return {
        isPullback: true,
        hasBothConditions: false,
        pullbackDepth: 25,
        entryTimingScore: weighted.score,
        reason: weighted.reason
      };
    }
    
    // MOMENTUM CONTINUATION: Only if very strong trend + confirmed momentum
    // RSI must be in 35-55 range to prevent late entries near trend reversals (inverted for shorts)
    const rsiInMomentumZone = rsi > RSI_THRESHOLDS.BEARISH_PULLBACK && rsi < RSI_THRESHOLDS.NEUTRAL_HIGH; // 35-55
    if (isStrongTrend && hasMacdExpanding && isMomentumConfirmed && rsiInMomentumZone) {
      const weighted = applyStochRsiWeight(8, `Momentum continuation: Strong ADX + MACD expansion (RSI=${rsi.toFixed(1)})`);
      return {
        isPullback: false,
        hasBothConditions: false,
        pullbackDepth: 0,
        entryTimingScore: weighted.score,
        reason: weighted.reason
      };
    }
    
    // STRONG TREND CONTINUATION: 4h+1h aligned + momentum active (even if RSI not in ideal zone)
    // This gives partial credit when timeframes strongly agree even without perfect RSI setup
    if (hasStrongTrendContinuation) {
      let continuationScore = 10;
      let continuationReason = `Trend continuation: 4h+1h bearish aligned + momentum ${momentumState}`;
      
      // Bonus for MACD expanding
      if (hasMacdExpanding) {
        continuationScore = 14;
        continuationReason += " + MACD expanding";
      }
      
      // Slight reduction if RSI is getting oversold (but not blocking)
      if (rsi < RSI_THRESHOLDS.BEARISH_PULLBACK) {
        continuationScore = Math.max(8, continuationScore - 4);
        continuationReason += ` [RSI=${rsi.toFixed(1)} slightly extended]`;
      }
      
      const weighted = applyStochRsiWeight(continuationScore, continuationReason);
      return {
        isPullback: false,
        hasBothConditions: false,
        pullbackDepth: 0,
        entryTimingScore: weighted.score,
        reason: weighted.reason
      };
    }
    
    // MOMENTUM CONTINUATION FALLBACK: ADX >= 25 with MACD expanding
    // This catches entries where trend is strong but no clear pullback pattern
    if (adx >= ADX_THRESHOLDS.STRONG && hasMacdExpanding && rsi < RSI_THRESHOLDS.BEARISH_RALLY && rsi > RSI_THRESHOLDS.OVERSOLD) {
      return {
        isPullback: false,
        hasBothConditions: false,
        pullbackDepth: 0,
        entryTimingScore: 10,  // NEW: Momentum continuation credit
        reason: `Momentum continuation: ADX=${adx.toFixed(1)} + MACD expanding (RSI=${rsi.toFixed(1)})`
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
      logger.forUser(userId).info(`Service role call`);
    } else {
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      if (userError || !user) throw new Error("Unauthorized");
      userId = user.id;
    }
    
    logger.forUser(userId).info(`${LOG_CATEGORIES.START} Analyzing signals`);

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
    // Disable symbols with win rate below threshold (based on last 20 trades)
    // Uses centralized SYMBOL_PARAMS from _shared/constants.ts
    const SYMBOL_WIN_RATE_THRESHOLD = SYMBOL_PARAMS.WIN_RATE_DISABLE_THRESHOLD;
    const SYMBOL_MIN_TRADES_FOR_FILTER = SYMBOL_PARAMS.MIN_TRADES_FOR_FILTER;
    
    // ============= NEW: STRATEGY PERFORMANCE FILTER (REGIME-AWARE) =============
    // Disable strategies with win rate below threshold (based on last 20 trades per strategy PER REGIME)
    // Uses centralized STRATEGY_PARAMS from _shared/constants.ts
    const STRATEGY_WIN_RATE_THRESHOLD = STRATEGY_PARAMS.WIN_RATE_DISABLE_THRESHOLD;
    const STRATEGY_MIN_TRADES_FOR_FILTER = STRATEGY_PARAMS.MIN_TRADES_FOR_FILTER;
    const STRATEGY_HIGH_PERFORMER_THRESHOLD = STRATEGY_PARAMS.WIN_RATE_HIGH_PERFORMER;
    
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
    const STRATEGY_MIN_UNIQUE_SYMBOLS = STRATEGY_PARAMS.MIN_UNIQUE_SYMBOLS;
    const SYMBOL_MIN_UNIQUE_STRATEGIES = STRATEGY_PARAMS.MIN_UNIQUE_STRATEGIES;
    
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
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.REJECTION} SYMBOL FILTER: disabled - win rate ${stats.winRate.toFixed(1)}% < ${SYMBOL_WIN_RATE_THRESHOLD}% (${stats.wins}/${stats.total} trades across ${stats.uniqueStrategies.size} strategies)`);
        } else if (hasEnoughTrades && !hasEnoughDiversity && isBelowThreshold) {
          logger.forSymbol(symbol).warn(`SYMBOL SKIP: low win rate ${stats.winRate.toFixed(1)}% but only ${stats.uniqueStrategies.size} strategy(s) - need ${SYMBOL_MIN_UNIQUE_STRATEGIES}+ for filter`);
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
              logger.info(`${LOG_CATEGORIES.REJECTION} STRATEGY FILTER [${regime.toUpperCase()}]: "${strategy}" disabled - win rate ${stats.winRate.toFixed(1)}% < ${STRATEGY_WIN_RATE_THRESHOLD}% (${stats.wins}/${stats.total} trades across ${stats.uniqueSymbols.size} symbols)`);
            } else if (stats.winRate >= STRATEGY_HIGH_PERFORMER_THRESHOLD) {
              highPerformingStrategiesByRegime.get(regime)!.add(strategy);
              logger.info(`${LOG_CATEGORIES.QUALITY} STRATEGY BOOST [${regime.toUpperCase()}]: "${strategy}" is high performer - win rate ${stats.winRate.toFixed(1)}% (${stats.wins}/${stats.total} trades across ${stats.uniqueSymbols.size} symbols)`);
            }
          } else if (hasEnoughTrades && !hasEnoughDiversity && stats.winRate < STRATEGY_WIN_RATE_THRESHOLD) {
            logger.warn(`STRATEGY SKIP [${regime.toUpperCase()}]: "${strategy}" low win rate ${stats.winRate.toFixed(1)}% but only ${stats.uniqueSymbols.size} symbol(s) - need ${STRATEGY_MIN_UNIQUE_SYMBOLS}+ for filter`);
          }
        }
      }
    }
    
    // Filter out disabled symbols
    const activeSymbols = symbols.filter(s => !disabledSymbols.has(s.symbol));
    logger.info(`${LOG_CATEGORIES.SUMMARY} Symbol filter: ${symbols.length} total → ${activeSymbols.length} active (${disabledSymbols.size} disabled)`);
    logger.info(`${LOG_CATEGORIES.SUMMARY} Strategy filter by regime: trending=${disabledStrategiesByRegime.get("trending")!.size} disabled/${highPerformingStrategiesByRegime.get("trending")!.size} high, ranging=${disabledStrategiesByRegime.get("ranging")!.size} disabled/${highPerformingStrategiesByRegime.get("ranging")!.size} high`);

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
    
    logger.info(`${LOG_CATEGORIES.SUMMARY} ${activeSymbols.length} symbols | ${userStrategies.length} user strategies + ${builtInToInclude.length} built-in templates = ${allStrategies.length} total (regime-aware filtering applied per symbol)`);

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
      .select("symbol, side, quantity, entry_price")
      .eq("user_id", userId)
      .eq("status", "active");

    const openTradesPerSymbol = new Map<string, number>();
    activePositions?.forEach((p) => {
      openTradesPerSymbol.set(p.symbol, (openTradesPerSymbol.get(p.symbol) || 0) + 1);
    });
    
    // Log active positions for correlation analysis
    logger.info(`${LOG_CATEGORIES.SUMMARY} Active positions for correlation check: ${activePositions?.length || 0} positions`);

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

    // O(n) EMA without slice()
    const calculateEMA = (prices: number[], period: number): number => {
      if (prices.length < period) return prices[prices.length - 1] || 0;
      const multiplier = 2 / (period + 1);
      let ema = 0;
      for (let i = 0; i < period; i++) ema += prices[i];
      ema /= period;
      for (let i = period; i < prices.length; i++) {
        ema = (prices[i] - ema) * multiplier + ema;
      }
      return ema;
    };

    // O(n) EMA Array without slice()
    const calculateEMAArray = (prices: number[], period: number): number[] => {
      const emaArray: number[] = [];
      if (prices.length < period) return emaArray;
      const multiplier = 2 / (period + 1);
      let ema = 0;
      for (let i = 0; i < period; i++) ema += prices[i];
      ema /= period;
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

    // O(n) Bollinger Bands using sum and sum-of-squares for variance
    const calculateBollingerBands = (prices: number[], period = 20, stdDevMultiplier = 2) => {
      if (prices.length < period) {
        const p = prices[prices.length - 1] || 0;
        return { upper: p, middle: p, lower: p };
      }
      // Calculate using rolling sum from last `period` elements
      const startIdx = prices.length - period;
      let sum = 0, sumSq = 0;
      for (let i = startIdx; i < prices.length; i++) {
        sum += prices[i];
        sumSq += prices[i] * prices[i];
      }
      const middle = sum / period;
      // Variance = E[X²] - E[X]²
      const variance = Math.max(0, (sumSq / period) - (middle * middle));
      const sd = Math.sqrt(variance);
      return { upper: middle + sd * stdDevMultiplier, middle, lower: middle - sd * stdDevMultiplier };
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

    // Fetch historical klines using shared Binance utilities
    const fetchHistoricalKlines = async (symbol: string): Promise<{ prices: number[]; volumes: number[]; klines: any[] }> => {
      try {
        const klines = await getKlines(symbol, "15m", 50);
        const { closes, volumes } = parseKlinePrices(klines);
        return {
          prices: closes,
          volumes: volumes,
          klines: klines,  // Keep full kline data for order flow analysis
        };
      } catch (error) {
        logger.forSymbol(symbol).error(`Failed to fetch klines: ${error}`);
        return { prices: [], volumes: [], klines: [] };
      }
    };

    // Fetch market data in parallel using shared Binance utilities - use filtered activeSymbols
    const symbolsList = activeSymbols.map((s) => s.symbol);
    const [marketDataResults, historicalResults] = await Promise.all([
      Promise.all(symbolsList.map(async (symbol) => {
        try {
          return await get24hrTicker(symbol);
        } catch { return null; }
      })),
      Promise.all(symbolsList.map(async (symbol) => ({ symbol, data: await fetchHistoricalKlines(symbol) })))
    ]);

    const marketDataMap = new Map(marketDataResults.filter(Boolean).map((d) => [d.symbol, d]));
    const historicalDataMap = new Map<string, { prices: number[]; volumes: number[]; klines: any[] }>();
    historicalResults.forEach(({ symbol, data }) => historicalDataMap.set(symbol, data));

    // Fetch trend data in PARALLEL for eligible symbols (already filtered by win rate)
    const eligibleSymbols = symbolsList.filter((symbol) => {
      const count = openTradesPerSymbol.get(symbol) || 0;
      return !existingSignalsSet.has(symbol) && count < riskParams.max_trades_per_symbol;
    });

    logger.info(`${LOG_CATEGORIES.SIGNAL} Fetching trend data for ${eligibleSymbols.length} eligible symbols (after win rate filter)`);

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

    logger.success(`Got trend data for ${trendDataMap.size} symbols`);

    // Track statistics
    const signals: SignalData[] = [];
    let totalSignalsGenerated = 0;
    let rejectedByRegime = 0;
    let rejectedByHardGates = 0;  // NEW: Track hard gate rejections
    let rejectedByQuality = 0;
    let rejectedByStrategy = 0;
    let rejectedByReversalRisk = 0;
    let rejectedByStochRsiExtreme = 0;
    let strongTrendExceptionUsed = 0;  // Track when strong trend exception allows signal
    let strongTrendExceptionNotApplicable = 0;  // Track when exception didn't apply (conditions not met)
    
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
    const BASE_MIN_QUALITY_SCORE = QUALITY_THRESHOLDS.BASE_MIN;
    const DEFAULT_MIN_QUALITY = BASE_MIN_QUALITY_SCORE;
    
    const getMinQualityScore = (adx: number, inRecovery: boolean, confidence1h?: number, isNeutralTrend?: boolean): number => {
      if (inRecovery) {
        // SCENARIO 6 FIX (Finding 9): Cap recovery quality escalation to prevent system paralysis
        const recoveryQuality = BASE_MIN_QUALITY_SCORE + recoveryConfidenceBoost;
        return Math.min(recoveryQuality, QUALITY_THRESHOLDS.MAX_RECOVERY_QUALITY);
      }
      // Neutral trends (with HTF direction) get lower threshold since quality scoring
      // is optimized for directional 5m trends - neutral relies on 1h direction instead
      if (isNeutralTrend) {
        return QUALITY_THRESHOLDS.NEUTRAL_MIN;
      }
      // RELAXED: If 1h shows strong direction (≥65% confidence), allow lower threshold
      // Changed from 70% to 65% to capture more early entries when 1h is directional
      if (confidence1h && confidence1h >= 65) {
        return QUALITY_THRESHOLDS.STRONG_1H_MIN;
      }
      // Dynamic based on ADX - strong trends = allow more signals
      if (adx >= ADX_THRESHOLDS.EXCEPTIONAL) return QUALITY_THRESHOLDS.EXCEPTIONAL_ADX_MIN;
      if (adx >= ADX_THRESHOLDS.STRONG) return QUALITY_THRESHOLDS.STRONG_ADX_MIN;
      return BASE_MIN_QUALITY_SCORE;
    };
    
    if (isInRecoveryMode) {
      logger.info(`${LOG_CATEGORIES.REVERSAL} LOSS RECOVERY MODE ACTIVE: ${riskParams.consecutive_losses} consecutive losses`);
      logger.info(`   → Quality threshold: ${BASE_MIN_QUALITY_SCORE + recoveryConfidenceBoost} (base ${BASE_MIN_QUALITY_SCORE} + ${recoveryConfidenceBoost})`);
      logger.info(`   → Position size multiplier: ${recoveryPositionSizeMultiplier * 100}%`);
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
        const { primaryTrend: trend, confidence, trueAlignment, isAligned, timeframes } = trendData;
        const trendConsistency = trueAlignment?.score || 0;
        const adx = trendData.volatility?.adx || 0;
        const momentum = trendData.momentum;
        // Derive higher timeframe data from correct paths
        const htfTrend4h = timeframes?.['4h']?.trend || timeframes?.['4h']?.indicators?.emaSignal || "neutral";
        const htfTrend1h = timeframes?.['1h']?.trend || timeframes?.['1h']?.indicators?.emaSignal || "neutral";

        // ============= PHASE 1 IMPROVEMENT: EXPLICIT DIRECTION DERIVATION =============
        // Derive trade direction early in the pipeline to prevent inconsistent direction evaluation
        // This ensures all downstream gates use the same direction logic
        const directionResult = deriveTradeDirection(trendData, trend);
        
        // REJECT EARLY: If no clear trade direction can be determined
        if (!directionResult.direction) {
          rejectedByHardGates++;
          await logRejectionWithAI(
            supabase, userId, symbol,
            `No clear trade direction: ${directionResult.reasons.join(", ")}`,
            { 
              gate: "NO_CLEAR_DIRECTION",
              source: directionResult.source,
              reasons: directionResult.reasons,
              trend4h: htfTrend4h,
              trend1h: htfTrend1h,
              primaryTrend: trend,
              confidence: directionResult.confidence
            },
            trendData,
            riskParams.ai_analysis_enabled !== false
          );
          continue;
        }
        
        // Use derived direction consistently throughout signal generation
        const derivedDirection = directionResult.direction;
        logger.forSymbol(symbol).info(`${LOG_CATEGORIES.TREND} Direction derived: ${derivedDirection} from ${directionResult.source} (${directionResult.confidence.toFixed(0)}% conf)`);
        if (directionResult.reasons.some(r => r.includes("Warning"))) {
          logger.forSymbol(symbol).warn(`   ${directionResult.reasons.filter(r => r.includes("Warning")).join(", ")}`);
        }

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
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.REJECTION} Unified Reversal BLOCK (${unifiedReversal.score}/100) - ${unifiedReversal.reasons.slice(0, 3).join(", ")}`);
          await logRejectionWithAI(
            supabase,
            userId,
            symbol,
            `Unified Reversal BLOCK: score=${unifiedReversal.score}/100 - ${unifiedReversal.reasons.slice(0, 3).join(", ")}`,
            { 
              unifiedReversalScore: unifiedReversal.score,
              decision: unifiedReversal.decision,
              breakdown: unifiedReversal.breakdown,
              reversalSignals: unifiedReversal.reasons,
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
              trend1h: htfTrend1h
            },
            trendData,
            riskParams.ai_analysis_enabled !== false
          );
          continue;
        }
        
        // REDUCE: Medium reversal risk - log warning, reduce position size
        if (unifiedReversal.decision === "REDUCE") {
          logger.forSymbol(symbol).warn(`Unified Reversal REDUCE (${unifiedReversal.score}/100) - ${unifiedReversal.reasons.slice(0, 2).join(", ")}`);
        } else {
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} Unified reversal check passed (${unifiedReversal.score}/100)`);
        }

        // ============= STOCHRSI EXTREME FILTER WITH SMART EXCEPTIONS =============
        // Prevent entries at extreme oversold/overbought 4h levels where bounces are likely
        // BUT allow if multiple strong trend continuation signals are present
        const stochRsi4h = trendData.stochasticRsi?.["4h"] || trendData.stochasticRsi?.aggregated;
        const stochRsi1h = trendData.stochasticRsi?.["1h"];
        const stochRsiK4h = stochRsi4h?.k ?? 50;
        const stochRsiD4h = stochRsi4h?.d ?? 50;
        const stochRsiK1h = stochRsi1h?.k ?? 50;
        // CRITICAL FIX: Using shared thresholds for consistency across all edge functions
        // Smart exception still allows legitimate continuation in strong trends
        const STOCHRSI_OVERSOLD_THRESHOLD = STOCHRSI_THRESHOLDS.OVERSOLD;  // 20 - bounce risk for shorts
        const STOCHRSI_OVERBOUGHT_THRESHOLD = STOCHRSI_THRESHOLDS.OVERBOUGHT; // 80 - bounce risk for longs
        const STRONG_TREND_ADX_THRESHOLD = ADX_THRESHOLDS.VERY_STRONG;  // ADX >= 30 = strong trend
        
        // Get trend data for both timeframes (for StochRSI filter) - use correct paths with emaSignal fallback
        const stochFilterTrend4h = trendData.timeframes?.['4h']?.trend || trendData.timeframes?.['4h']?.indicators?.emaSignal || "neutral";
        const stochFilterTrend1h = trendData.timeframes?.['1h']?.trend || trendData.timeframes?.['1h']?.indicators?.emaSignal || "neutral";
        const stochFilterConf4h = trendData.timeframes?.['4h']?.confidence || 50;
        const stochFilterConf1h = trendData.timeframes?.['1h']?.confidence || 50;
        
        // Get momentum and divergence info
        const hasBearishDivergence = trendData.momentum?.hasDivergence && trend === "bullish";
        const hasBullishDivergence = trendData.momentum?.hasDivergence && trend === "bearish";
        const macdHistogram = trendData.momentum?.macdHistogram ?? 0;
        const macdExpanding = trendData.momentum?.macdExpanding ?? false;
        
        // Get Bollinger Band info for breakout detection (use 4h as primary, 1h as fallback)
        const bollingerPosition = trendData.bollingerBands?.['4h']?.pricePosition ?? 
                                  trendData.bollingerBands?.['1h']?.pricePosition ?? "middle";
        const percentB = trendData.bollingerBands?.['4h']?.percentB ?? 
                         trendData.bollingerBands?.['1h']?.percentB ?? 50;
        
        // Determine if StochRSI is rising or falling (K vs D comparison)
        const stochRsiRising = stochRsiK4h > stochRsiD4h;
        const stochRsiFalling = stochRsiK4h < stochRsiD4h;
        
        // Check if we're at extreme StochRSI levels
        const isExtremeOversold4h = stochRsiK4h < STOCHRSI_OVERSOLD_THRESHOLD;
        const isExtremeOverbought4h = stochRsiK4h > STOCHRSI_OVERBOUGHT_THRESHOLD;
        const isTrendStrong = adx >= STRONG_TREND_ADX_THRESHOLD;
        
        // ===== DIRECTION OVERRIDE: BULLISH REVERSAL AT EXTREME OVERSOLD =====
        // When at extreme oversold (K < 20) with bullish reversal signals, OVERRIDE to LONG
        // even though the dominant trend is bearish - this catches reversal opportunities
        const isOversoldReversalCandidate = stochRsiK4h < STOCHRSI_THRESHOLDS.OVERSOLD; // K < 20
        const stochRsiTurningUpCheck = stochRsiK4h > stochRsiD4h; // K > D = momentum turning up
        const has1hBullishTurnCheck = stochFilterTrend1h === "bullish" || 
          (stochRsi1h?.signal === "bullish_cross") ||
          (stochRsiK1h > 30 && stochRsiK1h > (stochRsi1h?.d ?? 0));
        const bollingerAtLowerCheck = bollingerPosition === "below_lower" || bollingerPosition === "lower_zone" || percentB < 30;
        
        // Check for bullish divergence (price lower but RSI/MACD higher)
        const has1hBullishDivergenceCheck = hasBullishDivergence;
        
        // OVERRIDE: Switch to LONG direction if bullish reversal conditions met at oversold
        const overrideToLongReversal = isOversoldReversalCandidate && 
          stochRsiTurningUpCheck && 
          (has1hBullishDivergenceCheck || has1hBullishTurnCheck) && 
          bollingerAtLowerCheck;
        
        // ===== DIRECTION OVERRIDE: BEARISH REVERSAL AT EXTREME OVERBOUGHT =====
        const isOverboughtReversalCandidate = stochRsiK4h > STOCHRSI_THRESHOLDS.OVERBOUGHT; // K > 80
        const stochRsiTurningDownCheck = stochRsiK4h < stochRsiD4h; // K < D = momentum turning down
        const has1hBearishTurnCheck = stochFilterTrend1h === "bearish" || 
          (stochRsi1h?.signal === "bearish_cross") ||
          (stochRsiK1h < 70 && stochRsiK1h < (stochRsi1h?.d ?? 100));
        const bollingerAtUpperCheck = bollingerPosition === "above_upper" || bollingerPosition === "upper_zone" || percentB > 70;
        
        const overrideToShortReversal = isOverboughtReversalCandidate && 
          stochRsiTurningDownCheck && 
          (hasBearishDivergence || has1hBearishTurnCheck) && 
          bollingerAtUpperCheck;
        
        // Determine intended trade direction from trend, WITH REVERSAL OVERRIDES
        let intendedTradeDirection: "long" | "short" | null = trend === "bullish" ? "long" : trend === "bearish" ? "short" : null;
        let isReversalEntry = false;
        let reversalPositionSizeOverride = 1.0;
        
        // ===== PHASE 1 FIX: REVERSAL OVERRIDE SAFETY GATES =====
        // Block reversal overrides in strong trends or when HTF is strongly aligned against
        const isSafeForReversal = (() => {
          // SAFETY GATE 1: No reversals in strong trends (ADX >= 30)
          if (adx >= REVERSAL_OVERRIDE_SAFETY.MAX_ADX_FOR_REVERSAL) {
            logger.forSymbol(symbol).debug(`[REVERSAL_SAFETY] Blocked: ADX=${adx.toFixed(1)} >= ${REVERSAL_OVERRIDE_SAFETY.MAX_ADX_FOR_REVERSAL} (strong trend)`);
            return false;
          }
          
          // SAFETY GATE 2: Check unified reversal score (must be high enough to justify reversal)
          if (unifiedReversal.score < REVERSAL_OVERRIDE_SAFETY.MIN_REVERSAL_SCORE) {
            logger.forSymbol(symbol).debug(`[REVERSAL_SAFETY] Blocked: Reversal score ${unifiedReversal.score} < ${REVERSAL_OVERRIDE_SAFETY.MIN_REVERSAL_SCORE}`);
            return false;
          }
          
          // SAFETY GATE 3: Check if HTF is strongly aligned in original direction
          // For bullish->short reversal: check if 4h bullish confidence is too high
          // For bearish->long reversal: check if 4h bearish confidence is too high
          const htf4hTrend = stochFilterTrend4h;
          const htf4hConf = stochFilterConf4h;
          
          if (trend === "bearish" && htf4hTrend === "bearish" && htf4hConf >= REVERSAL_OVERRIDE_SAFETY.MAX_HTF_CONFIDENCE_AGAINST) {
            logger.forSymbol(symbol).debug(`[REVERSAL_SAFETY] Blocked: 4h strongly bearish (${htf4hConf}% >= ${REVERSAL_OVERRIDE_SAFETY.MAX_HTF_CONFIDENCE_AGAINST}%)`);
            return false;
          }
          if (trend === "bullish" && htf4hTrend === "bullish" && htf4hConf >= REVERSAL_OVERRIDE_SAFETY.MAX_HTF_CONFIDENCE_AGAINST) {
            logger.forSymbol(symbol).debug(`[REVERSAL_SAFETY] Blocked: 4h strongly bullish (${htf4hConf}% >= ${REVERSAL_OVERRIDE_SAFETY.MAX_HTF_CONFIDENCE_AGAINST}%)`);
            return false;
          }
          
          return true;
        })();
        
        if (overrideToLongReversal && trend === "bearish") {
          if (isSafeForReversal) {
            intendedTradeDirection = "long";
            isReversalEntry = true;
            // PHASE 1 FIX: Cap reversal position size
            reversalPositionSizeOverride = Math.min(
              (riskParams.early_reversal_position_size_percent || 40) / 100,
              REVERSAL_OVERRIDE_SAFETY.MAX_POSITION_SIZE_PERCENT / 100
            );
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.REVERSAL} BULLISH REVERSAL OVERRIDE - Switching from SHORT to LONG at oversold K=${stochRsiK4h.toFixed(1)}`);
            logger.forSymbol(symbol).debug(`   StochRSI rising: K=${stochRsiK4h.toFixed(1)} > D=${stochRsiD4h.toFixed(1)}, 1h bullish: ${has1hBullishTurnCheck}, divergence: ${has1hBullishDivergenceCheck}`);
            logger.forSymbol(symbol).debug(`   Bollinger: ${bollingerPosition} (%B=${percentB.toFixed(1)}), Position size: ${(reversalPositionSizeOverride * 100).toFixed(0)}%`);
            logger.forSymbol(symbol).debug(`   Safety checks passed: ADX=${adx.toFixed(1)}, reversalScore=${unifiedReversal.score}, 4hConf=${stochFilterConf4h}%`);
          } else {
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.REVERSAL} BULLISH REVERSAL BLOCKED by safety gates - ADX=${adx.toFixed(1)}, reversalScore=${unifiedReversal.score}, 4h=${stochFilterTrend4h} ${stochFilterConf4h}%`);
          }
        } else if (overrideToShortReversal && trend === "bullish") {
          if (isSafeForReversal) {
            intendedTradeDirection = "short";
            isReversalEntry = true;
            // PHASE 1 FIX: Cap reversal position size
            reversalPositionSizeOverride = Math.min(
              (riskParams.early_reversal_position_size_percent || 40) / 100,
              REVERSAL_OVERRIDE_SAFETY.MAX_POSITION_SIZE_PERCENT / 100
            );
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.REVERSAL} BEARISH REVERSAL OVERRIDE - Switching from LONG to SHORT at overbought K=${stochRsiK4h.toFixed(1)}`);
            logger.forSymbol(symbol).debug(`   StochRSI falling: K=${stochRsiK4h.toFixed(1)} < D=${stochRsiD4h.toFixed(1)}, 1h bearish: ${has1hBearishTurnCheck}, divergence: ${hasBearishDivergence}`);
            logger.forSymbol(symbol).debug(`   Bollinger: ${bollingerPosition} (%B=${percentB.toFixed(1)}), Position size: ${(reversalPositionSizeOverride * 100).toFixed(0)}%`);
            logger.forSymbol(symbol).debug(`   Safety checks passed: ADX=${adx.toFixed(1)}, reversalScore=${unifiedReversal.score}, 4hConf=${stochFilterConf4h}%`);
          } else {
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.REVERSAL} BEARISH REVERSAL BLOCKED by safety gates - ADX=${adx.toFixed(1)}, reversalScore=${unifiedReversal.score}, 4h=${stochFilterTrend4h} ${stochFilterConf4h}%`);
          }
        } else if (isOversoldReversalCandidate && trend === "bearish" && !overrideToLongReversal) {
          logger.forSymbol(symbol).debug(`Oversold but NO reversal override - K=${stochRsiK4h.toFixed(1)} rising:${stochRsiTurningUpCheck} 1hBullish:${has1hBullishTurnCheck} divergence:${has1hBullishDivergenceCheck} BBLower:${bollingerAtLowerCheck}`);
        }
        
        // Apply reversal position size override if direction was overridden
        if (isReversalEntry && reversalPositionSizeOverride < 1.0) {
          reversalPositionMultiplier = Math.min(reversalPositionMultiplier, reversalPositionSizeOverride);
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK} Reversal entry - position size reduced to ${(reversalPositionMultiplier * 100).toFixed(0)}%`);
        }
        
        // ===== CRITICAL: ABSOLUTE MAXIMUM STOCHRSI HARD BLOCK GATES =====
        // These gates have NO EXCEPTIONS - K>=98 for LONG or K<=2 for SHORT means BLOCK
        // At these levels, there is physically no more room for the indicator to continue
        const ABSOLUTE_MAX_OB = STOCHRSI_THRESHOLDS.ABSOLUTE_MAX_OVERBOUGHT ?? 98;
        const ABSOLUTE_MAX_OS = STOCHRSI_THRESHOLDS.ABSOLUTE_MAX_OVERSOLD ?? 2;
        
        if (intendedTradeDirection === "long" && stochRsiK4h >= ABSOLUTE_MAX_OB) {
          rejectedByStochRsiExtreme++;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} HARD BLOCK - 4h StochRSI at absolute maximum (K=${stochRsiK4h.toFixed(1)} >= ${ABSOLUTE_MAX_OB}) - nowhere to rise, no exceptions allowed`);
          await supabase.from("signal_rejection_log").insert({
            user_id: userId, symbol,
            rejection_reason: `HARD BLOCK: StochRSI K=${stochRsiK4h.toFixed(1)} at absolute maximum (>=${ABSOLUTE_MAX_OB}) - no LONG entries allowed`,
            filters_status: { 
              stochRsiK4h: stochRsiK4h.toFixed(1),
              stochRsiD4h: stochRsiD4h.toFixed(1),
              gate: "ABSOLUTE_MAX_STOCHRSI_HARD_BLOCK",
              threshold: ABSOLUTE_MAX_OB,
              message: "StochRSI at ceiling - nowhere to rise - no exceptions",
              // Include reversal score breakdown for debugging
              reversal_score: unifiedReversal.score,
              reversal_decision: unifiedReversal.decision,
              reversal_breakdown: unifiedReversal.breakdown,
              reversal_reasons: unifiedReversal.reasons,
              // Additional context
              trend,
              adx: adx.toFixed(1),
              momentum_state: momentum?.state,
              momentum_confirms: momentum?.confirms,
              percentB: percentB.toFixed(1),
              bollingerPosition
            },
            trend_data: trendData, checked_at: new Date().toISOString(),
          });
          continue;
        }
        
        if (intendedTradeDirection === "short" && stochRsiK4h <= ABSOLUTE_MAX_OS) {
          rejectedByStochRsiExtreme++;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} HARD BLOCK - 4h StochRSI at absolute minimum (K=${stochRsiK4h.toFixed(1)} <= ${ABSOLUTE_MAX_OS}) - nowhere to fall, no exceptions allowed`);
          await supabase.from("signal_rejection_log").insert({
            user_id: userId, symbol,
            rejection_reason: `HARD BLOCK: StochRSI K=${stochRsiK4h.toFixed(1)} at absolute minimum (<=${ABSOLUTE_MAX_OS}) - no SHORT entries allowed`,
            filters_status: { 
              stochRsiK4h: stochRsiK4h.toFixed(1),
              stochRsiD4h: stochRsiD4h.toFixed(1),
              gate: "ABSOLUTE_MIN_STOCHRSI_HARD_BLOCK",
              threshold: ABSOLUTE_MAX_OS,
              message: "StochRSI at floor - nowhere to fall - no exceptions",
              // Include reversal score breakdown for debugging
              reversal_score: unifiedReversal.score,
              reversal_decision: unifiedReversal.decision,
              reversal_breakdown: unifiedReversal.breakdown,
              reversal_reasons: unifiedReversal.reasons,
              // Additional context
              trend,
              adx: adx.toFixed(1),
              momentum_state: momentum?.state,
              momentum_confirms: momentum?.confirms,
              percentB: percentB.toFixed(1),
              bollingerPosition
            },
            trend_data: trendData, checked_at: new Date().toISOString(),
          });
          continue;
        }
        
        // ===== NEW: BOLLINGER BAND OVEREXTENSION GATE =====
        // Block LONG when price is extremely above upper Bollinger (percentB > 110) AND StochRSI >= 90
        const isExtremelyOverextended = percentB > 110;
        if (intendedTradeDirection === "long" && isExtremelyOverextended && stochRsiK4h >= STOCHRSI_THRESHOLDS.EXTREME_OVERBOUGHT) {
          rejectedByStochRsiExtreme++;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} BLOCK - Price extremely overextended (%B=${percentB.toFixed(1)} > 110) with overbought StochRSI (K=${stochRsiK4h.toFixed(1)})`);
          await supabase.from("signal_rejection_log").insert({
            user_id: userId, symbol,
            rejection_reason: `BLOCK: Price overextended (%B=${percentB.toFixed(1)} > 110) + StochRSI K=${stochRsiK4h.toFixed(1)} overbought`,
            filters_status: { 
              percentB: percentB.toFixed(1), 
              stochRsiK4h: stochRsiK4h.toFixed(1),
              gate: "BOLLINGER_OVEREXTENSION_GATE",
              message: "Price extremely above upper Bollinger with overbought StochRSI"
            },
            trend_data: trendData, checked_at: new Date().toISOString(),
          });
          continue;
        }
        
        // Block SHORT when price is extremely below lower Bollinger (percentB < -10) AND StochRSI <= 10
        const isExtremelyUnderextended = percentB < -10;
        if (intendedTradeDirection === "short" && isExtremelyUnderextended && stochRsiK4h <= STOCHRSI_THRESHOLDS.EXTREME_OVERSOLD) {
          rejectedByStochRsiExtreme++;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} BLOCK - Price extremely underextended (%B=${percentB.toFixed(1)} < -10) with oversold StochRSI (K=${stochRsiK4h.toFixed(1)})`);
          await supabase.from("signal_rejection_log").insert({
            user_id: userId, symbol,
            rejection_reason: `BLOCK: Price underextended (%B=${percentB.toFixed(1)} < -10) + StochRSI K=${stochRsiK4h.toFixed(1)} oversold`,
            filters_status: { 
              percentB: percentB.toFixed(1), 
              stochRsiK4h: stochRsiK4h.toFixed(1),
              gate: "BOLLINGER_UNDEREXTENSION_GATE",
              message: "Price extremely below lower Bollinger with oversold StochRSI"
            },
            trend_data: trendData, checked_at: new Date().toISOString(),
          });
          continue;
        }
        
        // ===== NEW: MACD ALIGNMENT AND VOLUME CHECKS FOR MOMENTUM STRATEGIES =====
        // These will be applied per-strategy during strategy evaluation loop
        // Store the thresholds for later use
        const HIGH_REVERSAL_OB = STOCHRSI_THRESHOLDS.HIGH_REVERSAL_OVERBOUGHT ?? 95;
        const HIGH_REVERSAL_OS = STOCHRSI_THRESHOLDS.HIGH_REVERSAL_OVERSOLD ?? 5;
        const isAtHighReversalLong = stochRsiK4h >= HIGH_REVERSAL_OB && intendedTradeDirection === "long";
        const isAtHighReversalShort = stochRsiK4h <= HIGH_REVERSAL_OS && intendedTradeDirection === "short";
        
        // Track if momentum strategy checks should reduce position size
        let momentumVolumeReduction = 1.0;
        
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
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} Blocking LONG - StochRSI not rising at overbought (K=${stochRsiK4h.toFixed(1)}, D=${stochRsiD4h.toFixed(1)})`);
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
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} Blocking LONG - Bearish divergence at overbought (K=${stochRsiK4h.toFixed(1)})`);
            await supabase.from("signal_rejection_log").insert({
              user_id: userId, symbol,
              rejection_reason: `StochRSI extreme: K=${stochRsiK4h.toFixed(1)} overbought with bearish divergence`,
              filters_status: { stochRsiK4h, hasBearishDivergence: true, gate: "BEARISH_DIVERGENCE_AT_EXTREME" },
              trend_data: trendData, checked_at: new Date().toISOString(),
            });
            continue;
          }
          
          // RELAXED: Allow entries at extreme overbought if trends are strongly aligned
          // FIX: Previously required momentum.confirms=true AND 75%+ confidence which rejected valid signals
          const strongUptrend4h = stochFilterTrend4h === "bullish" && stochFilterConf4h >= 60;
          const strongUptrend1h = stochFilterTrend1h === "bullish" && stochFilterConf1h >= 55;
          
          // ===== PHASE 1 FIX: TIGHTER BREAKOUT DEFINITION =====
          // OLD: percentB > 70 (too loose, allows late entries inside bands)
          // NEW: Require expansion confirmation, not just location
          const volatility = trendData.volatility || {};
          const volumeRatio = volatility.volumeRatio ?? 1.0;
          const bollingerBand = trendData.bollingerBand || {};
          const bbData4h = trendData.bb?.["4h"] || trendData.bollingerBand || {};
          const currentBandwidth = bbData4h.bandwidth || bollingerBand.bandwidth || 0;
          
          // True breakout requires:
          // 1. %B > 80 (strong upper zone, not just > 70)
          // 2. AND (bandwidth expanding OR volume spike)
          const isAboveBreakoutThreshold = percentB > BREAKOUT_THRESHOLDS.MIN_PERCENT_B;
          const hasVolumeConfirmation = volumeRatio >= BREAKOUT_THRESHOLDS.MIN_VOLUME_RATIO;
          const isBandwidthExpanding = currentBandwidth > 0 && !bbData4h.squeeze; // Not in squeeze = expanding
          
          const isValidBreakout = isAboveBreakoutThreshold && (hasVolumeConfirmation || isBandwidthExpanding);
          
          // Legacy fallback for position-based check (less strict)
          const breakoutOrHigherLowLegacy = bollingerPosition === "above_upper" || bollingerPosition === "upper_zone";
          
          // Use stricter breakout for primary path, legacy for aligned trend override
          const breakoutOrHigherLow = isValidBreakout;
          
          const stochMomentumUp = stochRsiRising && macdHistogram > 0;
          // RELAXED: Accept "building" OR "confirmed" momentum state
          const momentumAcceptable = (momentum?.confirms === true || momentum?.state === "building") && momentum?.state !== "none";
          
          // PRIMARY: Full smart exception conditions (now with stricter breakout)
          const allowExtremeOverbought = strongUptrend4h && strongUptrend1h && breakoutOrHigherLow && stochMomentumUp && momentumAcceptable;
          
          // ===== PHASE 3: TREND STRENGTH SCORING =====
          // Replace boolean checks with quantified trend strength score
          const isMomentumActiveForStrength = momentum?.confirms === true || 
            momentum?.state === "building" || 
            momentum?.state === "confirmed";
          
          const trendStrengthResult = calculateTrendStrength(
            stochFilterConf4h,
            stochFilterConf1h,
            adx,
            isMomentumActiveForStrength
          );
          
          // Additional safety conditions that MUST pass regardless of score
          const baseSafetyConditions = stochFilterTrend4h === "bullish" && 
            stochFilterTrend1h === "bullish" && 
            !hasBearishDivergence && 
            stochRsiRising;
          
          // Use trend strength for decision instead of separate FULL/PARTIAL checks
          let strongTrendExceptionApplied = false;
          let strongTrendPositionMultiplier = 1.0;
          
          if (allowExtremeOverbought) {
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.STOCHRSI} 4h StochRSI K=${stochRsiK4h.toFixed(1)} extreme overbought - ALLOWING LONG (strong uptrend both TFs, valid breakout %B=${percentB.toFixed(1)}, StochRSI rising, momentum ${momentum?.state})`);
            strongTrendExceptionApplied = true;
          } else if (baseSafetyConditions && trendStrengthResult.decision === 'FULL') {
            // FULL exception: no position reduction
            strongTrendExceptionApplied = true;
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.STOCHRSI} 4h StochRSI K=${stochRsiK4h.toFixed(1)} extreme overbought - FULL STRONG TREND EXCEPTION via trend strength score ${trendStrengthResult.score}/6`);
            logger.forSymbol(symbol).debug(`   Trend strength breakdown: 4hConf=${trendStrengthResult.components.confidence4hPoints}, 1hConf=${trendStrengthResult.components.confidence1hPoints}, ADX=${trendStrengthResult.components.adxPoints}, momentum=${trendStrengthResult.components.momentumPoints}`);
          } else if (baseSafetyConditions && trendStrengthResult.decision === 'PARTIAL' && (breakoutOrHigherLowLegacy || isValidBreakout)) {
            // PARTIAL exception: 50% position reduction
            strongTrendExceptionApplied = true;
            strongTrendPositionMultiplier = 0.5;
            reversalPositionMultiplier = Math.min(reversalPositionMultiplier, 0.5);
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.STOCHRSI} 4h StochRSI K=${stochRsiK4h.toFixed(1)} extreme overbought - PARTIAL STRONG TREND EXCEPTION via trend strength score ${trendStrengthResult.score}/6 with 50% position`);
            logger.forSymbol(symbol).debug(`   Trend strength breakdown: 4hConf=${trendStrengthResult.components.confidence4hPoints}, 1hConf=${trendStrengthResult.components.confidence1hPoints}, ADX=${trendStrengthResult.components.adxPoints}, momentum=${trendStrengthResult.components.momentumPoints}`);
          } else {
            rejectedByStochRsiExtreme++;
            const blockReason = !baseSafetyConditions
              ? `base safety conditions failed (4h=${stochFilterTrend4h}, 1h=${stochFilterTrend1h}, divergence=${hasBearishDivergence}, rising=${stochRsiRising})`
              : trendStrengthResult.decision === 'REJECT'
                ? `trend strength too low: ${trendStrengthResult.reason}`
                : `no valid breakout (%B=${percentB.toFixed(1)}, volumeRatio=${volumeRatio.toFixed(2)})`;
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} Blocking LONG - 4h StochRSI K=${stochRsiK4h.toFixed(1)} overbought | ${blockReason}`);
            await supabase.from("signal_rejection_log").insert({
              user_id: userId, symbol,
              rejection_reason: `StochRSI extreme: K=${stochRsiK4h.toFixed(1)} overbought, ${blockReason}`,
              filters_status: { 
                stochRsiK4h: stochRsiK4h.toFixed(1), stochRsiD4h: stochRsiD4h.toFixed(1), stochRsiRising,
                trend4h: stochFilterTrend4h, confidence4h: stochFilterConf4h,
                trend1h: stochFilterTrend1h, confidence1h: stochFilterConf1h,
                bollingerPosition, percentB, macdHistogram, adx: adx.toFixed(1),
                momentumConfirms: momentum?.confirms, momentumState: momentum?.state,
                // PHASE 3: Enhanced with trend strength scoring
                trendStrengthScore: trendStrengthResult.score,
                trendStrengthDecision: trendStrengthResult.decision,
                trendStrengthComponents: trendStrengthResult.components,
                isValidBreakout,
                breakoutThreshold: BREAKOUT_THRESHOLDS.MIN_PERCENT_B,
                volumeRatio: volumeRatio.toFixed(2),
                hasVolumeConfirmation,
                isBandwidthExpanding,
                reason: blockReason
              },
              trend_data: trendData, checked_at: new Date().toISOString(),
            });
            continue;
          }
        }
        
        // ===== NEW: BEARISH REVERSAL SHORT ENTRY AT OVERBOUGHT =====
        // Allow SHORT when 4h StochRSI is overbought AND showing bearish reversal signals
        // This catches trend reversal opportunities (inverse of bullish reversal logic)
        const isOverboughtReversalZone = stochRsiK4h > STOCHRSI_THRESHOLDS.OVERBOUGHT; // K > 80
        
        if (intendedTradeDirection === "short" && isOverboughtReversalZone && !isExtremeOverbought4h) {
          // Check for bearish reversal conditions
          const stochRsiTurningDown = stochRsiFalling; // K < D
          const has1hBearishTurn = stochFilterTrend1h === "bearish" || 
            (stochRsi1h?.signal === "bearish_cross") ||
            (stochRsiK1h < 70 && stochRsiK1h < (stochRsi1h?.d ?? 100)); // 1h showing early bearish
          const bollingerAtUpper = bollingerPosition === "above_upper" || bollingerPosition === "upper_zone" || percentB > 70;
          
          // ALLOW bearish reversal SHORT if:
          // - StochRSI turning down (K < D)
          // - AND (bearish divergence OR 1h bearish turn)
          // - AND price at upper Bollinger (overbought confirmation)
          const allowBearishReversal = stochRsiTurningDown && 
            (hasBearishDivergence || has1hBearishTurn) && 
            bollingerAtUpper;
          
          if (allowBearishReversal) {
            const reversalSizePercent = (riskParams.early_reversal_position_size_percent || 40) / 100;
            reversalPositionMultiplier = Math.min(reversalPositionMultiplier, reversalSizePercent);
            
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.REVERSAL} BEARISH REVERSAL SHORT ALLOWED at overbought K=${stochRsiK4h.toFixed(1)}`);
            logger.forSymbol(symbol).debug(`   StochRSI falling: K=${stochRsiK4h.toFixed(1)} < D=${stochRsiD4h.toFixed(1)}`);
            logger.forSymbol(symbol).debug(`   1h bearish turn: ${has1hBearishTurn}, Bearish divergence: ${hasBearishDivergence}`);
            logger.forSymbol(symbol).debug(`   Bollinger: ${bollingerPosition} (%B=${percentB.toFixed(1)})`);
            logger.forSymbol(symbol).debug(`   Position size reduced to ${(reversalSizePercent * 100).toFixed(0)}% for reversal entry`);
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
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} Blocking SHORT - StochRSI not falling at oversold (K=${stochRsiK4h.toFixed(1)}, D=${stochRsiD4h.toFixed(1)})`);
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
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} Blocking SHORT - Bullish divergence at oversold (K=${stochRsiK4h.toFixed(1)})`);
            await supabase.from("signal_rejection_log").insert({
              user_id: userId, symbol,
              rejection_reason: `StochRSI extreme: K=${stochRsiK4h.toFixed(1)} oversold with bullish divergence`,
              filters_status: { stochRsiK4h, hasBullishDivergence: true, gate: "BULLISH_DIVERGENCE_AT_EXTREME" },
              trend_data: trendData, checked_at: new Date().toISOString(),
            });
            continue;
          }
          
          // RELAXED: Allow entries at extreme oversold if trends are strongly aligned
          // FIX: Previously required momentum.confirms=true AND 75%+ confidence which rejected valid signals
          // Now: Accept "building" momentum state AND 60%+ confidence for both timeframes
          const strongDowntrend4h = stochFilterTrend4h === "bearish" && stochFilterConf4h >= 60;
          const strongDowntrend1h = stochFilterTrend1h === "bearish" && stochFilterConf1h >= 55;
          const breakdownOrLowerHigh = bollingerPosition === "below_lower" || bollingerPosition === "lower_zone" || percentB < 30;
          const stochMomentumDown = stochRsiFalling && macdHistogram < 0;
          // RELAXED: Accept "building" OR "confirmed" momentum state
          const momentumAcceptable = (momentum?.confirms === true || momentum?.state === "building") && momentum?.state !== "none";
          
          // PRIMARY: Full smart exception conditions
          const allowExtremeOversold = strongDowntrend4h && strongDowntrend1h && breakdownOrLowerHigh && stochMomentumDown && momentumAcceptable;
          
          // SECONDARY: Strong aligned trends override (allows entry with reduced position size)
          // This captures continuation during strong downtrends even without all conditions
          const alignedTrendOverride = stochFilterTrend4h === "bearish" && stochFilterTrend1h === "bearish" && 
            adx >= ADX_THRESHOLDS.MINIMUM && // ADX >= 20
            !hasBullishDivergence && 
            stochRsiFalling;
          
          if (allowExtremeOversold) {
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.STOCHRSI} 4h StochRSI K=${stochRsiK4h.toFixed(1)} extreme oversold - ALLOWING SHORT (strong downtrend both TFs, breakdown, StochRSI falling, momentum ${momentum?.state})`);
          } else if (alignedTrendOverride) {
            reversalPositionMultiplier = Math.min(reversalPositionMultiplier, 0.5);
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.STOCHRSI} 4h StochRSI K=${stochRsiK4h.toFixed(1)} extreme oversold - ALLOWING SHORT with 50% position (aligned 4h+1h bearish, ADX=${adx.toFixed(1)}, StochRSI falling)`);
          } else {
            rejectedByStochRsiExtreme++;
            const blockReason = !momentumAcceptable 
              ? `momentum not acceptable (confirms=${momentum?.confirms}, state=${momentum?.state})` 
              : "failed smart exception conditions";
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} Blocking SHORT - 4h StochRSI K=${stochRsiK4h.toFixed(1)} oversold | ${blockReason}`);
            await supabase.from("signal_rejection_log").insert({
              user_id: userId, symbol,
              rejection_reason: `StochRSI extreme: K=${stochRsiK4h.toFixed(1)} oversold, ${blockReason}`,
              filters_status: { 
                stochRsiK4h: stochRsiK4h.toFixed(1), stochRsiD4h: stochRsiD4h.toFixed(1), stochRsiFalling,
                trend4h: stochFilterTrend4h, confidence4h: stochFilterConf4h,
                trend1h: stochFilterTrend1h, confidence1h: stochFilterConf1h,
                bollingerPosition, percentB, macdHistogram, adx: adx.toFixed(1),
                momentumConfirms: momentum?.confirms, momentumState: momentum?.state,
                alignedTrendOverride,
                reason: blockReason
              },
              trend_data: trendData, checked_at: new Date().toISOString(),
            });
            continue;
          }
        }
        
        // ===== NEW: BULLISH REVERSAL LONG ENTRY AT OVERSOLD =====
        // Allow LONG when 4h StochRSI is oversold AND showing bullish reversal signals
        // This catches trend reversal opportunities that were previously missed
        // Key conditions:
        // 1. StochRSI oversold (K < 20) - reversal zone
        // 2. StochRSI rising (K > D) - momentum turning up
        // 3. Bullish divergence OR 1h turning bullish - reversal confirmation
        // 4. No strong downtrend continuation (ADX not extreme + stoch falling)
        const isOversoldReversalZone = stochRsiK4h < STOCHRSI_THRESHOLDS.OVERSOLD; // K < 20
        
        if (intendedTradeDirection === "long" && isOversoldReversalZone) {
          // Check for bullish reversal conditions
          const stochRsiTurningUp = stochRsiRising; // K > D
          const has1hBullishTurn = stochFilterTrend1h === "bullish" || 
            (stochRsi1h?.signal === "bullish_cross") ||
            (stochRsiK1h > 30 && stochRsiK1h > (stochRsi1h?.d ?? 0)); // 1h showing early bullish
          const bollingerAtLower = bollingerPosition === "below_lower" || bollingerPosition === "lower_zone" || percentB < 30;
          
          // ALLOW bullish reversal LONG if:
          // - StochRSI turning up (K > D)
          // - AND (bullish divergence OR 1h bullish turn)
          // - AND price at lower Bollinger (oversold confirmation)
          const allowBullishReversal = stochRsiTurningUp && 
            (hasBullishDivergence || has1hBullishTurn) && 
            bollingerAtLower;
          
          if (allowBullishReversal) {
            // Reversal entries get reduced position size (configurable, default 40%)
            const reversalSizePercent = (riskParams.early_reversal_position_size_percent || 40) / 100;
            reversalPositionMultiplier = Math.min(reversalPositionMultiplier, reversalSizePercent);
            
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.REVERSAL} BULLISH REVERSAL LONG ALLOWED at oversold K=${stochRsiK4h.toFixed(1)}`);
            logger.forSymbol(symbol).info(`   StochRSI rising: K=${stochRsiK4h.toFixed(1)} > D=${stochRsiD4h.toFixed(1)}`);
            logger.forSymbol(symbol).info(`   1h bullish turn: ${has1hBullishTurn}, Bullish divergence: ${hasBullishDivergence}`);
            logger.forSymbol(symbol).info(`   Bollinger: ${bollingerPosition} (%B=${percentB.toFixed(1)})`);
            logger.forSymbol(symbol).info(`   Position size reduced to ${(reversalSizePercent * 100).toFixed(0)}% for reversal entry`);
          } else if (!stochRsiTurningUp) {
            // Log why reversal was not allowed - StochRSI not rising
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.STOCHRSI} Oversold LONG blocked - StochRSI not rising (K=${stochRsiK4h.toFixed(1)} <= D=${stochRsiD4h.toFixed(1)})`);
          } else {
            // Log other missing conditions
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.STOCHRSI} Oversold LONG blocked - missing reversal confirmation (1h bullish: ${has1hBullishTurn}, divergence: ${hasBullishDivergence}, BB lower: ${bollingerAtLower})`);
          }
        }
        
        // Log StochRSI status for monitoring
        if (stochRsiK4h < STOCHRSI_THRESHOLDS.OVERSOLD || stochRsiK4h > STOCHRSI_THRESHOLDS.OVERBOUGHT) {
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.STOCHRSI} 4h StochRSI K=${stochRsiK4h.toFixed(1)} (proceeding with ${intendedTradeDirection || "neutral"} direction)`);
        }

        // ================= HARD ENTRY GATES =================
        // These are non-negotiable requirements for ANY signal
        // Quality score should RANK good trades, not RESCUE weak ones
        
        // GATE 1: ADX must be >= MINIMUM for any trade (trend strength required)
        // EXCEPTION: Squeeze breakout allows ADX 18-20 if strict conditions are met
        let squeezeBreakoutActive = false;
        let squeezePositionMultiplier = 1.0;
        
        if (adx < ADX_THRESHOLDS.MINIMUM) {
          // Check for squeeze breakout exception (only if ADX >= 18)
          if (adx >= ADX_THRESHOLDS.SQUEEZE_MINIMUM) {
            const squeezeResult = isValidSqueezeBreakout(trendData, derivedDirection);
            
            if (squeezeResult.isValid) {
              // SQUEEZE BREAKOUT EXCEPTION - allow entry with reduced position size
              squeezeBreakoutActive = true;
              squeezePositionMultiplier = squeezeResult.positionSizeMultiplier;
              logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} SQUEEZE BREAKOUT EXCEPTION - ADX ${adx.toFixed(1)} allowed (${squeezeResult.confidence}% confidence)`);
              logger.forSymbol(symbol).debug(`   Squeeze reasons: ${squeezeResult.reasons.join(", ")}`);
              logger.forSymbol(symbol).debug(`   Position size reduced to ${(squeezePositionMultiplier * 100).toFixed(0)}%`);
            } else {
              // Squeeze conditions not met - reject with ADX reason + squeeze failure reasons
              rejectedByHardGates++;
              await logRejectionWithAI(
                supabase, userId, symbol,
                `HARD GATE: ADX too low (${adx.toFixed(1)} < ${ADX_THRESHOLDS.MINIMUM}) - squeeze breakout not valid: ${squeezeResult.reasons.join(", ")}`,
                { 
                  gate: "ADX_TOO_LOW_NO_SQUEEZE",
                  adx: adx.toFixed(1),
                  adxRequired: ADX_THRESHOLDS.MINIMUM,
                  squeezeMinimum: ADX_THRESHOLDS.SQUEEZE_MINIMUM,
                  squeezeValid: false,
                  squeezeReasons: squeezeResult.reasons,
                  trend,
                  confidence,
                  derivedDirection,
                  trendConsistency: trendData.trueAlignment?.score?.toFixed(1),
                  momentum: {
                    state: momentum?.state || "none",
                    confirms: momentum?.confirms ?? false,
                    macdExpanding: momentum?.macdExpanding ?? false
                  },
                  bollinger: {
                    squeeze4h: trendData.bollingerBands?.['4h']?.squeeze,
                    squeeze1h: trendData.bollingerBands?.['1h']?.squeeze,
                    percentB4h: trendData.bollingerBands?.['4h']?.percentB,
                    percentB1h: trendData.bollingerBands?.['1h']?.percentB
                  }
                },
                trendData,
                riskParams.ai_analysis_enabled !== false
              );
              continue;
            }
          } else {
            // ADX < 18: No squeeze exception possible
            rejectedByHardGates++;
            await logRejectionWithAI(
              supabase, userId, symbol,
              `HARD GATE: ADX too low (${adx.toFixed(1)} < ${ADX_THRESHOLDS.SQUEEZE_MINIMUM}) - no trend strength, below squeeze minimum`,
              { 
                gate: "ADX_TOO_LOW",
                adx: adx.toFixed(1),
                adxRequired: ADX_THRESHOLDS.MINIMUM,
                squeezeMinimum: ADX_THRESHOLDS.SQUEEZE_MINIMUM,
                trend,
                confidence,
                trendConsistency: trendData.trueAlignment?.score?.toFixed(1),
                momentum: {
                  state: momentum?.state || "none",
                  confirms: momentum?.confirms ?? false,
                  macdHistogram: momentum?.macdHistogram?.toFixed(4),
                  lastCloseAlignsWithTrend: momentum?.lastCloseAlignsWithTrend
                },
                stochRsi: trendData.stochasticRsi?.aggregated,
                volatility: {
                  atrPercent: trendData.volatility?.atrPercent?.toFixed(2),
                  isRanging: trendData.volatility?.isRanging
                }
              },
              trendData,
              riskParams.ai_analysis_enabled !== false
            );
            continue;
          }
        }
        
        // Apply squeeze breakout position size reduction if active
        if (squeezeBreakoutActive && squeezePositionMultiplier < 1.0) {
          reversalPositionMultiplier = Math.min(reversalPositionMultiplier, squeezePositionMultiplier);
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK} Squeeze breakout - position size capped at ${(squeezePositionMultiplier * 100).toFixed(0)}%`);
        }

        // RELAXED: Allow entry when momentum.state is "none" IF ADX >= 28 (strong trend exception)
        // This enables early entries when trend strength itself provides conviction
        const momentumState = momentum?.state || "none";
        const momentumConfirms = momentum?.confirms ?? false;
        const isStrongTrendException = adx >= ADX_THRESHOLDS.STRONG_TREND_EXCEPTION; // 28+ (relaxed from 30)
        
        // Momentum passes if:
        // 1. State is confirmed/building/mixed AND confirms is true, OR
        // 2. State is "none" BUT ADX >= 28 (strong trend exception for early entries)
        const momentumPasses = momentumConfirms || (momentumState !== "none") || isStrongTrendException;
        
        if (!momentumPasses) {
          rejectedByHardGates++;
          await logRejectionWithAI(
            supabase, userId, symbol,
            `HARD GATE: No momentum confirmation (state=${momentumState}, confirms=${momentumConfirms}, ADX=${adx.toFixed(1)} < 28)`,
            { 
              gate: "NO_MOMENTUM_CONFIRMATION",
              momentumState,
              momentumConfirms,
              adx: adx.toFixed(1),
              isStrongTrendException,
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
                aligned: isAligned,
                trend4h: htfTrend4h,
                trend1h: htfTrend1h
              }
            },
            trendData,
            riskParams.ai_analysis_enabled !== false
          );
          continue;
        }
        
        // Log when using strong trend exception for early entry
        if (isStrongTrendException && momentumState === "none" && !momentumConfirms) {
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.MOMENTUM} EARLY ENTRY via strong trend exception (ADX=${adx.toFixed(1)} >= 28, momentum=${momentumState})`);
        }
        
        // ============= NEW GATE: MOMENTUM SCORE >= 5 =============
        // Data shows trades with momentumScore = 0 have extremely low win rates
        // Require minimum momentum score to proceed (from shared constants)
        const earlyMomentumScore = getMomentumScore(momentum);
        const MIN_MOMENTUM_SCORE = MOMENTUM_THRESHOLDS.MIN_SCORE;
        if (earlyMomentumScore < MIN_MOMENTUM_SCORE) {
          rejectedByHardGates++;
          await logRejectionWithAI(
            supabase, userId, symbol,
            `HARD GATE: Momentum score too low (${earlyMomentumScore} < ${MIN_MOMENTUM_SCORE}) - insufficient momentum confirmation`,
            { 
              gate: "MOMENTUM_SCORE_TOO_LOW",
              momentumScore: earlyMomentumScore,
              momentumRequired: MIN_MOMENTUM_SCORE,
              momentumState: momentum?.state || "none",
              momentumConfirms: momentum?.confirms ?? false,
              macdExpanding: momentum?.macdExpanding ?? false,
              volumeConfirms: momentum?.volumeConfirms ?? false,
              adx: adx.toFixed(1),
              trend,
              confidence
            },
            trendData,
            riskParams.ai_analysis_enabled !== false
          );
          continue;
        }
        logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} Momentum score gate passed (${earlyMomentumScore} >= ${MIN_MOMENTUM_SCORE})`);
        
        // ============= PHASE 2 IMPROVEMENT: MOMENTUM DIRECTIONAL SYMMETRY =============
        // Verify that momentum direction agrees with the derived trade direction
        // This prevents entries where overall momentum is moving opposite to trade side
        const momentumDirection = momentum?.direction || null;  // "bullish", "bearish", or null
        const macdHistogramValue = momentum?.macdHistogram ?? 0;
        
        // Determine momentum direction from MACD histogram if not explicitly set
        const effectiveMomentumDirection = momentumDirection || 
          (macdHistogramValue > 0 ? "bullish" : macdHistogramValue < 0 ? "bearish" : null);
        
        // Check if momentum direction opposes trade direction
        const momentumOpposesDirection = (
          (derivedDirection === "long" && effectiveMomentumDirection === "bearish") ||
          (derivedDirection === "short" && effectiveMomentumDirection === "bullish")
        );
        
        if (momentumOpposesDirection && effectiveMomentumDirection !== null) {
          // Allow if momentum is weak (close to zero) or ADX is very strong
          const macdHistogramAbs = Math.abs(macdHistogramValue);
          const isWeakMomentum = macdHistogramAbs < 0.0001;  // Very small MACD histogram
          const allowMomentumOverride = isWeakMomentum || adx >= ADX_THRESHOLDS.EXCEPTIONAL;
          
          if (!allowMomentumOverride) {
            rejectedByHardGates++;
            await logRejectionWithAI(
              supabase, userId, symbol,
              `HARD GATE: Momentum direction (${effectiveMomentumDirection}) opposes ${derivedDirection} trade`,
              { 
                gate: "MOMENTUM_DIRECTION_OPPOSING",
                derivedDirection,
                momentumDirection: effectiveMomentumDirection,
                macdHistogram: macdHistogramValue.toFixed(6),
                momentumState: momentum?.state,
                adx: adx.toFixed(1),
                adxRequiredForOverride: ADX_THRESHOLDS.EXCEPTIONAL,
                trend,
                confidence
              },
              trendData,
              riskParams.ai_analysis_enabled !== false
            );
            continue;
          }
          if (isWeakMomentum) {
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.MOMENTUM} Momentum direction opposes but weak (MACD histogram ${macdHistogramValue.toFixed(6)}) - allowing`);
          } else {
            logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.MOMENTUM} Momentum direction opposes but ADX strong (${adx.toFixed(1)}) - allowing with caution`);
          }
        }
        
        // ============= NEW GATE: NEUTRAL 4H TREND REQUIRES 70%+ CONFIDENCE =============
        // When 4h trend is neutral, require higher confidence (70%+) OR directional 1h with 65%+
        // This prevents low-quality entries in ranging/neutral conditions
        const trend4hForNeutralGate = htfTrend4h;
        const is4hNeutral = trend4hForNeutralGate === "neutral";
        const conf4hForGate = timeframes?.['4h']?.confidence || confidence;
        const conf1hForGate = timeframes?.['1h']?.confidence || 0;
        const is1hDirectional = htfTrend1h === "bullish" || htfTrend1h === "bearish";
        
        if (is4hNeutral) {
          const passesNeutralGate = conf4hForGate >= 70 || (is1hDirectional && conf1hForGate >= 65);
          if (!passesNeutralGate) {
            rejectedByHardGates++;
            await logRejectionWithAI(
              supabase, userId, symbol,
              `HARD GATE: Neutral 4h requires 70%+ confidence OR directional 1h with 65%+ (4h=${trend4hForNeutralGate} ${conf4hForGate.toFixed(0)}%, 1h=${htfTrend1h} ${conf1hForGate.toFixed(0)}%)`,
              { 
                gate: "NEUTRAL_4H_LOW_CONFIDENCE",
                trend4h: trend4hForNeutralGate,
                confidence4h: conf4hForGate,
                trend1h: htfTrend1h,
                confidence1h: conf1hForGate,
                requiredConfidence: 70,
                is1hDirectional,
                adx: adx.toFixed(1)
              },
              trendData,
              riskParams.ai_analysis_enabled !== false
            );
            continue;
          }
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} Neutral 4h gate passed (4h=${conf4hForGate.toFixed(0)}%, 1h=${htfTrend1h} ${conf1hForGate.toFixed(0)}%)`);
        }
        
        // ============= PHASE 2 IMPROVEMENT: MACD ALIGNMENT HARD GATE =============
        // When MACD direction is misaligned with intended trade direction, block the signal
        // This prevents entries where MACD contradicts the trade direction
        // EXCEPTION: Skip this gate if Unified Reversal Score >= 50 (already penalized in URS)
        const macdDirectionAligned = momentum?.macdDirectionAligned ?? true;
        const hasMacdDivergence = momentum?.hasDivergence ?? false;
        
        // PHASE 2: Reduce double-counting - if URS already penalized reversal risk heavily,
        // don't apply MACD divergence hard gate again (orthogonal logic)
        const ursAlreadyPenalizedMacd = unifiedReversal.score >= 50;
        
        if ((!macdDirectionAligned || hasMacdDivergence) && !ursAlreadyPenalizedMacd) {
          // Allow if ADX is very strong (>= 35) - strong trends can override MACD misalignment
          const allowMacdOverride = adx >= ADX_THRESHOLDS.EXCEPTIONAL;
          
          if (!allowMacdOverride) {
            rejectedByHardGates++;
            const macdReason = hasMacdDivergence 
              ? "MACD divergence detected" 
              : "MACD direction misaligned with trade";
            await logRejectionWithAI(
              supabase, userId, symbol,
              `HARD GATE: ${macdReason} (ADX=${adx.toFixed(1)} < ${ADX_THRESHOLDS.EXCEPTIONAL} for override)`,
              { 
                gate: "MACD_MISALIGNED",
                macdDirectionAligned,
                hasMacdDivergence,
                macdHistogram: momentum?.macdHistogram?.toFixed(4),
                macdExpanding: momentum?.macdExpanding,
                adx: adx.toFixed(1),
                adxRequiredForOverride: ADX_THRESHOLDS.EXCEPTIONAL,
                ursScore: unifiedReversal.score,
                trend,
                confidence
              },
              trendData,
              riskParams.ai_analysis_enabled !== false
            );
            continue;
          }
          logger.forSymbol(symbol).warn(`MACD misalignment overridden by strong trend (ADX=${adx.toFixed(1)} >= ${ADX_THRESHOLDS.EXCEPTIONAL})`);
        } else if ((!macdDirectionAligned || hasMacdDivergence) && ursAlreadyPenalizedMacd) {
          // Log that we're skipping the gate due to URS already handling it
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} MACD divergence gate skipped - already penalized in URS (score=${unifiedReversal.score})`);
        }
        
        // GATE 3: Higher timeframe alignment required (or high confidence or strong 1h or micro-trend)
        // RELAXED: Allow if 1h trend is strong (≥65% confidence) even if 4h is neutral
        // NEW: Also allow if micro-trend is detected (15m/30m aligned) when 4h is neutral
        const htfAligned = isAligned ?? false;
        const confidence1h = timeframes?.['1h']?.confidence || 0;
        const trend1h = timeframes?.['1h']?.trend || "neutral";
        const has1hStrongDirection = confidence1h >= 65 && (trend1h === "bullish" || trend1h === "bearish");
        
        // ===== PHASE 2: HARDENED MICRO-TREND CHECK =====
        // Allows signals when 4h is neutral but lower TFs are aligned
        // Now requires: ADX >= 25, persistence >= 3 bars, volume confirmation
        const microTrend = trendData.microTrend;
        
        // PHASE 2: Stricter micro-trend validation
        const hasMicroTrendBypass = microTrend?.hasMicroTrend === true && 
          !microTrend?.blocked &&  // Must not be blocked by safety checks
          microTrend?.alignment >= MICRO_TREND_PARAMS.MIN_ALIGNMENT_SCORE && 
          microTrend?.adxSufficient === true &&  // ADX >= 25 required
          microTrend?.volumeConfirmed === true &&  // Volume confirmation required
          microTrend?.persistence >= MICRO_TREND_PARAMS.MIN_PERSISTENCE_BARS &&  // 3+ bars persistence
          (microTrend?.direction === "bullish" || microTrend?.direction === "bearish");
        
        // Position size reduction for micro-trend entries
        let microTrendPositionMultiplier = 1.0;
        if (hasMicroTrendBypass) {
          microTrendPositionMultiplier = MICRO_TREND_PARAMS.MAX_POSITION_SIZE_PERCENT / 100; // 60% max
        }
        
        // Log micro-trend bypass when used
        if (hasMicroTrendBypass && !htfAligned && confidence < 65) {
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.TREND} HTF gate bypassed via MICRO-TREND (${microTrend.direction}, alignment=${microTrend.alignment}%, persist=${microTrend.persistence}, volOK=${microTrend.volumeConfirmed}, ADX=${adx.toFixed(1)})`);
        } else if (microTrend?.blocked && !htfAligned && confidence < 65) {
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.TREND} MICRO-TREND detected but BLOCKED: ${microTrend.blockReason}`);
        }
        
        if (!htfAligned && confidence < 65 && !has1hStrongDirection && !hasMicroTrendBypass) {
          rejectedByHardGates++;
          const microTrendInfo = microTrend?.blocked 
            ? `blocked (${microTrend.blockReason})`
            : microTrend?.hasMicroTrend === false 
              ? "not detected"
              : `insufficient (align=${microTrend?.alignment}, persist=${microTrend?.persistence}, volOK=${microTrend?.volumeConfirmed})`;
          await logRejectionWithAI(
            supabase, userId, symbol,
            `HARD GATE: HTF not aligned, confidence too low, 1h not strong, and micro-trend ${microTrendInfo}`,
            { 
              htfAligned, 
              confidence, 
              confidence1h, 
              trend1h, 
              microTrend: microTrend || null,
              microTrendInfo,
              gate: "HTF_NOT_ALIGNED" 
            },
            trendData,
            riskParams.ai_analysis_enabled !== false
          );
          continue;
        }
        
        // Log if using 1h strong direction exception
        if (!htfAligned && confidence < 65 && has1hStrongDirection) {
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.TREND} HTF gate passed via strong 1h (1h=${trend1h} ${confidence1h}%)`);
        }
        
        // GATE 4: Confidence Dead Zone Veto (60-69% is worst performing zone)
        // Data shows 60-69% confidence = 31.73% win rate vs 50-59% = 46.34%
        // RELAXED: Allow if ADX >= 28 (strong trend exception) instead of 30
        if (confidence >= 60 && confidence < 70 && adx < ADX_THRESHOLDS.STRONG_TREND_EXCEPTION) {
          rejectedByHardGates++;
          await logRejectionWithAI(
            supabase, userId, symbol,
            `HARD GATE: Confidence dead zone (${confidence}% in 60-69 range with ADX=${adx.toFixed(1)} < ${ADX_THRESHOLDS.STRONG_TREND_EXCEPTION})`,
            { confidence, adx: adx.toFixed(1), gate: "CONFIDENCE_DEAD_ZONE" },
            trendData,
            riskParams.ai_analysis_enabled !== false
          );
          continue;
        }
        
        logger.forSymbol(symbol).gate(`Passed all hard gates (ADX=${adx.toFixed(1)}, momentum=${momentumState}/${momentumConfirms}, HTF=${htfAligned || `conf=${confidence}%`}, conf=${confidence}%)`, true);

        // ============= GATE 5: STRATEGY SUPPORT FOR TREND DIRECTION =============
        // Check if any strategy can support the current trend direction BEFORE quality scoring
        // Strategies validate signals, not rescue weak ones
        const tradeDirectionForGate = trendData.primaryTrend || trend;
        
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
          } else if (strategyDirection === 'neutral' && tradeDirectionForGate === 'neutral') {
            // NEW: Neutral strategies support neutral trends (rely on HTF for direction)
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
        // EXCEPTION: Allow trend-followers when market conditions are exceptionally strong
        const hasStrongTrendException = 
          adx >= ADX_THRESHOLDS.EXCEPTIONAL &&  // ADX ≥ 35 (very strong trend)
          momentum?.confirms === true &&         // Momentum confirmed
          momentum?.state === "confirmed" &&
          (isAligned || false); // HTF aligned
        
        if (strategiesWithConditionBasis === 0 && !hasStrongTrendException) {
          rejectedByHardGates++;
          strongTrendExceptionNotApplicable++;
          await logRejectionWithAI(
            supabase, userId, symbol,
            `HARD GATE: No condition-based strategy for ${tradeDirectionForGate} (${strategiesWithDirectionalSupport} trend-followers only). Strong Trend Exception not met: ADX=${adx.toFixed(1)} (need ≥35), momentum=${momentum?.state}/${momentum?.confirms}, HTF=${isAligned}`,
            { 
              tradeDirection: tradeDirectionForGate, 
              directionalSupport: strategiesWithDirectionalSupport, 
              conditionBased: 0, 
              gate: "NO_CONDITION_STRATEGY",
              strongTrendExceptionCheck: {
                adx: adx.toFixed(1),
                adxRequired: ADX_THRESHOLDS.EXCEPTIONAL,
                momentumState: momentum?.state,
                momentumConfirms: momentum?.confirms,
                htfAligned: isAligned,
                exceptionApplied: false
              }
            },
            trendData,
            riskParams.ai_analysis_enabled !== false
          );
          continue;
        }
        
        if (strategiesWithConditionBasis === 0 && hasStrongTrendException) {
          strongTrendExceptionUsed++;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} STRONG TREND EXCEPTION USED - No condition-based strategies, but ADX=${adx.toFixed(1)} ≥ 35, momentum confirmed, HTF aligned`);
        } else {
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.QUALITY} ${strategiesWithConditionBasis}/${allStrategies.length} strategies support ${tradeDirectionForGate} with conditions`);
        }

        // ============= Technical Indicators =============
        const stochRsiEval = evaluateStochRSI(trendData.stochasticRsi, trend);
        const bollingerEval = evaluateBollingerBands(trendData.bollingerBands, trend);

        // ============= IMPROVEMENT #3: Pullback Entry Detection =============
        const pullbackAnalysis = analyzePullbackEntry(trendData, trend);

        // ============= SCENARIO 6: ENHANCED RECOVERY MODE =============
        // Recovery mode = precision trading only, not punishment loop
        // Implements Findings 1-10 from Scenario 6 analysis
        if (isInRecoveryMode) {
          const htfTrend4hForRecovery = timeframes?.['4h']?.trend || "neutral";
          const htfConf4hForRecovery = timeframes?.['4h']?.confidence || 0;
          const htfTrend1hForRecovery = timeframes?.['1h']?.trend || "neutral";
          
          // Extract RSI for recovery mode checks
          const recoveryRsi = trendData?.indicators?.rsi || 50;
          
          // ===== FINDING 8: COOLDOWN AFTER RECOVERY LOSS =====
          // Check if we're in cooldown period after a recovery loss
          const recoveryCooldownUntil = riskParams.recovery_cooldown_until 
            ? new Date(riskParams.recovery_cooldown_until) 
            : null;
          const now = new Date();
          
          if (recoveryCooldownUntil && now < recoveryCooldownUntil) {
            rejectedByHardGates++;
            const cooldownRemaining = Math.ceil((recoveryCooldownUntil.getTime() - now.getTime()) / 60000);
            await logRejectionWithAI(
              supabase, userId, symbol,
              `RECOVERY COOLDOWN: ${cooldownRemaining}min remaining after recovery loss`,
              { gate: "RECOVERY_COOLDOWN", cooldownRemaining, cooldownUntil: recoveryCooldownUntil.toISOString() },
              trendData,
              riskParams.ai_analysis_enabled !== false
            );
            continue;
          }
          
          // ===== FINDING 10: RECOVERY TRADE COUNTER =====
          const maxRecoveryTrades = riskParams.max_recovery_trades_per_day ?? RECOVERY_MODE_PARAMS.DEFAULT_MAX_RECOVERY_TRADES;
          const recoveryTradesToday = riskParams.recovery_trades_today ?? 0;
          
          if (recoveryTradesToday >= maxRecoveryTrades) {
            rejectedByHardGates++;
            await logRejectionWithAI(
              supabase, userId, symbol,
              `RECOVERY: Max recovery trades reached (${recoveryTradesToday}/${maxRecoveryTrades})`,
              { gate: "RECOVERY_MAX_TRADES", recoveryTradesToday, maxRecoveryTrades },
              trendData,
              riskParams.ai_analysis_enabled !== false
            );
            continue;
          }
          
          // ===== FINDING 3: HTF ALIGNMENT AS HARD GATE =====
          // Recovery mode is trend continuation ONLY - no counter-trend trades
          const htfAlignedForRecovery = (
            (htfTrend4hForRecovery === "bullish" && derivedDirection === "long") ||
            (htfTrend4hForRecovery === "bearish" && derivedDirection === "short") ||
            (htfTrend4hForRecovery === "neutral" && htfTrend1hForRecovery !== "neutral" &&
              ((htfTrend1hForRecovery === "bullish" && derivedDirection === "long") ||
               (htfTrend1hForRecovery === "bearish" && derivedDirection === "short")))
          );
          
          if (!htfAlignedForRecovery) {
            rejectedByHardGates++;
            await logRejectionWithAI(
              supabase, userId, symbol,
              `RECOVERY: HTF misalignment - trend continuation only (4h=${htfTrend4hForRecovery}, 1h=${htfTrend1hForRecovery}, direction=${derivedDirection})`,
              { gate: "RECOVERY_HTF_MISALIGN", htfTrend4h: htfTrend4hForRecovery, htfTrend1h: htfTrend1hForRecovery, derivedDirection },
              trendData,
              riskParams.ai_analysis_enabled !== false
            );
            continue;
          }
          
          // ===== FINDING 5: ADAPTIVE ADX RULE =====
          // Hard reject below 23, allow 23-25 if HTF is strong (4h conf >= 70)
          if (adx < RECOVERY_MODE_PARAMS.ADX_HARD_MINIMUM) {
            rejectedByHardGates++;
            await logRejectionWithAI(
              supabase, userId, symbol,
              `RECOVERY: ADX too low (${adx.toFixed(1)} < ${RECOVERY_MODE_PARAMS.ADX_HARD_MINIMUM}) - hard minimum`,
              { adx: adx.toFixed(1), gate: "RECOVERY_ADX_HARD_MIN", adxRequired: RECOVERY_MODE_PARAMS.ADX_HARD_MINIMUM },
              trendData,
              riskParams.ai_analysis_enabled !== false
            );
            continue;
          }
          
          // Soft zone 23-25: Allow only if HTF is strong
          if (adx < RECOVERY_MODE_PARAMS.ADX_SOFT_ZONE_MAX && adx >= RECOVERY_MODE_PARAMS.ADX_SOFT_ZONE_MIN) {
            const htfStrong = htfConf4hForRecovery >= RECOVERY_MODE_PARAMS.HTF_CONFIDENCE_FOR_SOFT_ADX;
            if (!htfStrong) {
              rejectedByHardGates++;
              await logRejectionWithAI(
                supabase, userId, symbol,
                `RECOVERY: ADX in soft zone (${adx.toFixed(1)}) but HTF not strong (4h conf=${htfConf4hForRecovery}% < ${RECOVERY_MODE_PARAMS.HTF_CONFIDENCE_FOR_SOFT_ADX}%)`,
                { adx: adx.toFixed(1), gate: "RECOVERY_ADX_SOFT_ZONE", htfConf4h: htfConf4hForRecovery },
                trendData,
                riskParams.ai_analysis_enabled !== false
              );
              continue;
            }
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.REVERSAL} Recovery ADX soft zone (${adx.toFixed(1)}) allowed - HTF strong (4h conf=${htfConf4hForRecovery}%)`);
          }
          
          // ===== FINDING 2: CONDITIONAL CONFIDENCE CAP =====
          // Hard reject >=80 without deep pullback, soft penalty 70-80
          const isDeepPullback = pullbackAnalysis.pullbackDepth >= 50 || 
            (trend === "bullish" && recoveryRsi < 35) || 
            (trend === "bearish" && recoveryRsi > 65);
          
          if (confidence >= RECOVERY_MODE_PARAMS.CONFIDENCE_HARD_CAP && !isDeepPullback) {
            rejectedByHardGates++;
            await logRejectionWithAI(
              supabase, userId, symbol,
              `RECOVERY: Euphoric entry (conf=${confidence}% >= ${RECOVERY_MODE_PARAMS.CONFIDENCE_HARD_CAP}%) without deep pullback`,
              { confidence, gate: "RECOVERY_EUPHORIC_ENTRY", isDeepPullback, pullbackDepth: pullbackAnalysis.pullbackDepth },
              trendData,
              riskParams.ai_analysis_enabled !== false
            );
            continue;
          }
          
          // ===== FINDING 4: PULLBACK DEPTH SCORING =====
          // Replace binary check with weighted scoring (0-3 points)
          let pullbackScore = 0;
          
          // Point 1: RSI in pullback zone (40-55 for longs, inverted for shorts)
          const rsiInPullbackZone = trend === "bullish" 
            ? (recoveryRsi >= RECOVERY_MODE_PARAMS.RSI_PULLBACK_MIN && recoveryRsi <= RECOVERY_MODE_PARAMS.RSI_PULLBACK_MAX)
            : (recoveryRsi >= (100 - RECOVERY_MODE_PARAMS.RSI_PULLBACK_MAX) && recoveryRsi <= (100 - RECOVERY_MODE_PARAMS.RSI_PULLBACK_MIN));
          if (rsiInPullbackZone) pullbackScore++;
          
          // Point 2: Price near mid/outer Bollinger Band
          const nearBBZone = bollingerPosition === "lower_zone" || bollingerPosition === "upper_zone" || 
            bollingerPosition === "middle_zone" || percentB < 30 || percentB > 70;
          if (nearBBZone) pullbackScore++;
          
          // Point 3: Retrace percentage in Fibonacci zone (38-61%)
          // Use pullback depth as proxy for retrace
          const inRetraceZone = pullbackAnalysis.pullbackDepth >= RECOVERY_MODE_PARAMS.RETRACE_MIN_PERCENT && 
            pullbackAnalysis.pullbackDepth <= RECOVERY_MODE_PARAMS.RETRACE_MAX_PERCENT;
          if (inRetraceZone) pullbackScore++;
          
          if (pullbackScore < RECOVERY_MODE_PARAMS.MIN_PULLBACK_SCORE) {
            rejectedByHardGates++;
            await logRejectionWithAI(
              supabase, userId, symbol,
              `RECOVERY: Pullback too shallow (score=${pullbackScore}/${RECOVERY_MODE_PARAMS.MIN_PULLBACK_SCORE} required)`,
              { 
                gate: "RECOVERY_PULLBACK_SHALLOW", 
                pullbackScore,
                minRequired: RECOVERY_MODE_PARAMS.MIN_PULLBACK_SCORE,
                rsiInPullbackZone, nearBBZone, inRetraceZone,
                rsi: recoveryRsi.toFixed(1), percentB: percentB.toFixed(1),
                pullbackDepth: pullbackAnalysis.pullbackDepth
              },
              trendData,
              riskParams.ai_analysis_enabled !== false
            );
            continue;
          }
          
          // ===== FINDING 6: NO FIRST CANDLE RULE =====
          // Block entry on first continuation candle after pullback (stop-hunt protection)
          // Detect via pullback analysis - if isPullback but entryTimingScore is very high, it's first candle
          const isFirstContinuationCandle = pullbackAnalysis.isPullback && 
            pullbackAnalysis.entryTimingScore >= 20 && 
            !pullbackAnalysis.hasBothConditions;
          
          if (RECOVERY_MODE_PARAMS.BLOCK_FIRST_CANDLE && isFirstContinuationCandle) {
            rejectedByHardGates++;
            await logRejectionWithAI(
              supabase, userId, symbol,
              `RECOVERY: First candle continuation blocked (stop-hunt protection)`,
              { 
                gate: "RECOVERY_FIRST_CANDLE", 
                isPullback: pullbackAnalysis.isPullback,
                entryTimingScore: pullbackAnalysis.entryTimingScore,
                hasBothConditions: pullbackAnalysis.hasBothConditions
              },
              trendData,
              riskParams.ai_analysis_enabled !== false
            );
            continue;
          }
          
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.REVERSAL} Passed ENHANCED RECOVERY checks (ADX=${adx.toFixed(1)}, pullbackScore=${pullbackScore}/3, HTF=${htfTrend4hForRecovery}, conf=${confidence}%)`);
        }

        // ============= IMPROVEMENT #1: Quality Score System with CONFIDENCE INVERSION =============
        // Pass ADX and momentum state to reduce penalty for favorable conditions (avoids double punishment with hard gate)
        const momentumConfirmed = momentum?.confirms === true && momentum?.state === "confirmed";
        let confidencePenalty = getConfidencePenalty(confidence, adx, momentumConfirmed);
        
        // ===== SCENARIO 6 FINDING 2: RECOVERY SOFT PENALTY =====
        // Apply additional -10 penalty for confidence 70-80 during recovery
        if (isInRecoveryMode && 
            confidence >= RECOVERY_MODE_PARAMS.CONFIDENCE_SOFT_PENALTY_MIN && 
            confidence < RECOVERY_MODE_PARAMS.CONFIDENCE_SOFT_PENALTY_MAX) {
          confidencePenalty -= RECOVERY_MODE_PARAMS.CONFIDENCE_SOFT_PENALTY_AMOUNT;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.REVERSAL} Recovery soft penalty: -${RECOVERY_MODE_PARAMS.CONFIDENCE_SOFT_PENALTY_AMOUNT} for conf=${confidence}% in 70-80 zone`);
        }
        
        // Direction bonus: +3 for SHORT/SELL signals (historically 38% vs 31% win rate)
        const directionBonus = trend === "bearish" ? 3 : 0;
        // Volume score component
        const volumeScore = getVolumeScore(trendData, trend);
        
        // ============= ORDER FLOW ANALYSIS (NEW) =============
        // Analyze volume spikes, price rejections, and buying/selling pressure
        const intendedDirection: "long" | "short" = trend === "bearish" ? "short" : "long";
        const symbolHistoricalData = historicalDataMap.get(symbol);
        const klines = symbolHistoricalData?.klines || [];
        const orderFlowAnalysis = analyzeOrderFlow(klines, intendedDirection);
        const orderFlowScore = getOrderFlowQualityBonus(orderFlowAnalysis, intendedDirection);
        
        // Log order flow analysis
        if (orderFlowAnalysis.reasons.length > 0) {
          logger.forSymbol(symbol).trade(`Order Flow: score=${orderFlowAnalysis.score}/100 signal=${orderFlowAnalysis.signal} | ${orderFlowAnalysis.reasons.join(' | ')}`);
        }
        
        // Cap pullback score when volume doesn't confirm - prevents "perfect pullback, no volume" trap
        let entryTimingScore = Math.max(0, pullbackAnalysis.entryTimingScore);
        const volumeConfirms = momentum?.volumeConfirms ?? false;
        if (!volumeConfirms && entryTimingScore > 15) {
          logger.forSymbol(symbol).warn(`Capping pullback score ${entryTimingScore}→15 (volume not confirming)`);
          entryTimingScore = 15;
        }
        
        // ============= PHASE 3: ENHANCED ENTRY TIMING WEIGHTING =============
        // When ADX is below threshold, entry timing becomes MORE important
        // This replaces a hard gate with dynamic weighting - poor timing penalized more, good timing rewarded more
        const isLowAdxEnvironment = adx < ENTRY_TIMING_PARAMS.ENHANCE_BELOW_ADX; // ADX < 30
        
        if (isLowAdxEnvironment) {
          // Scale entry timing from 0-25 to 0-30 (20% boost to max) in low ADX environments
          // This makes entry timing matter more when trend strength is weaker
          const scaleFactor = ENTRY_TIMING_PARAMS.ENHANCED_MAX / ENTRY_TIMING_PARAMS.BASE_MAX; // 30/25 = 1.2
          const originalScore = entryTimingScore;
          entryTimingScore = Math.round(entryTimingScore * scaleFactor);
          
          if (originalScore !== entryTimingScore) {
            logger.forSymbol(symbol).info(`[ENTRY_TIMING] Enhanced weighting: ADX=${adx.toFixed(1)} < ${ENTRY_TIMING_PARAMS.ENHANCE_BELOW_ADX} → score ${originalScore}→${entryTimingScore} (×${scaleFactor.toFixed(2)})`);
          }
        }
        
        // Log warning when entry timing is poor (for monitoring)
        if (entryTimingScore < ENTRY_TIMING_PARAMS.WARNING_THRESHOLD) {
          const severity = entryTimingScore < ENTRY_TIMING_PARAMS.CRITICAL_THRESHOLD ? "CRITICAL" : "WARNING";
          logger.forSymbol(symbol).warn(`[ENTRY_TIMING] ${severity}: entryTimingScore=${entryTimingScore} < ${ENTRY_TIMING_PARAMS.WARNING_THRESHOLD} | reason: ${pullbackAnalysis.reason}`);
        }
        
        const qualityFactors: QualityFactors = {
          adxScore: getAdxScore(adx),
          momentumScore: getMomentumScore(momentum),
          alignmentScore: getAlignmentScore(confidence, trendConsistency, isAligned || false, trendData),
          technicalScore: getTechnicalScore(trendData, trend, symbol),
          entryTimingScore: entryTimingScore,
          volumeScore: volumeScore,                // Volume confirmation
          orderFlowScore: orderFlowScore,          // NEW: Order flow analysis (-15 to +15)
          confidencePenalty: confidencePenalty,    // Penalize high confidence entries
          directionBonus: directionBonus,          // +3 for SHORT signals
        };

        const { score: qualityScore, breakdown } = calculateQualityScore(qualityFactors);
        
        // ===== SCENARIO 6 FINDING 7: DYNAMIC POSITION SIZE =====
        // In recovery mode, size position based on quality score instead of flat reduction
        let recoveryDynamicSizeMultiplier = 1.0;
        if (isInRecoveryMode) {
          // Calculate quality-based multiplier: clamp(qualityScore / MAX_QUALITY, 0.5, 1.0)
          const rawMultiplier = qualityScore / RECOVERY_MODE_PARAMS.MAX_QUALITY_FOR_SIZING;
          recoveryDynamicSizeMultiplier = Math.max(
            RECOVERY_MODE_PARAMS.MIN_SIZE_MULTIPLIER,
            Math.min(RECOVERY_MODE_PARAMS.MAX_SIZE_MULTIPLIER, rawMultiplier)
          );
          // Apply on top of the base recovery position size
          const finalRecoverySize = recoveryPositionSizeMultiplier * recoveryDynamicSizeMultiplier;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.REVERSAL} Recovery dynamic sizing: quality=${qualityScore} → multiplier=${recoveryDynamicSizeMultiplier.toFixed(2)} → final=${(finalRecoverySize * 100).toFixed(0)}%`);
        }

        // Log confidence inversion impact
        if (confidencePenalty < 0) {
          logger.forSymbol(symbol).warn(`Confidence penalty: ${confidencePenalty} (confidence=${confidence}% is above optimal 50-70% zone)`);
        }
        // Log volume score
        if (volumeScore > 0) {
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.QUALITY} Volume score: +${volumeScore}/10 pts`);
        }
        // Log order flow impact
        if (orderFlowScore !== 0) {
          logger.forSymbol(symbol).trade(`Order Flow bonus: ${orderFlowScore > 0 ? '+' : ''}${orderFlowScore} pts (signal: ${orderFlowAnalysis.signal}, confidence: ${orderFlowAnalysis.confidence}%)`);
        }
        logger.forSymbol(symbol).info(`${LOG_CATEGORIES.QUALITY} Quality: ${qualityScore}/100 [${breakdown}] | Regime: ${regime.regime} | Entry: ${pullbackAnalysis.reason} | Pullback: ${pullbackAnalysis.hasBothConditions ? 'OPTIMAL' : pullbackAnalysis.isPullback ? 'YES' : 'NO'}`);

        // ============= DYNAMIC QUALITY THRESHOLD =============
        // Calculate threshold based on ADX, 1h confidence, and neutral trend for this specific symbol
        const isNeutralTrend = tradeDirectionForGate === 'neutral';
        const MIN_QUALITY_SCORE = getMinQualityScore(adx, isInRecoveryMode, confidence1h, isNeutralTrend);
        
        // Check minimum quality threshold
        if (qualityScore < MIN_QUALITY_SCORE) {
          rejectedByQuality++;
          
          // PHASE 1: Near Miss Logging - signals within 5 points of threshold
          const isNearMiss = qualityScore >= (MIN_QUALITY_SCORE - QUALITY_THRESHOLDS.NEAR_MISS_THRESHOLD);
          
          await supabase.from("signal_rejection_log").insert({
            user_id: userId, symbol,
            rejection_reason: isNearMiss 
              ? `NEAR MISS: Quality score ${qualityScore}/100 (threshold: ${MIN_QUALITY_SCORE}, missed by ${MIN_QUALITY_SCORE - qualityScore} pts)`
              : `Quality score too low: ${qualityScore}/100 (min: ${MIN_QUALITY_SCORE}, ADX=${adx.toFixed(1)})`,
            filters_status: {
              qualityScore, breakdown, minRequired: MIN_QUALITY_SCORE,
              dynamicThreshold: true,
              adx: adx.toFixed(1),
              factors: qualityFactors,
              regime: regime.regime,
              entryTiming: pullbackAnalysis.reason,
              isNearMiss,  // Flag for later analysis
              nearMissMargin: isNearMiss ? MIN_QUALITY_SCORE - qualityScore : null,
            },
            trend_data: trendData,
            checked_at: new Date().toISOString(),
          });
          
          // Log near misses at higher visibility for monitoring
          if (isNearMiss) {
            logger.forSymbol(symbol).warn(`[NEAR_MISS] Quality ${qualityScore}/${MIN_QUALITY_SCORE} - missed by ${MIN_QUALITY_SCORE - qualityScore} pts | ${breakdown}`);
          }
          continue;
        }

        // NOTE: Confidence and consistency thresholds are now incorporated into the quality score
        // via alignmentScore and confidencePenalty, eliminating redundant filtering that was
        // blocking high-quality signals (e.g., 73/100 quality rejected for 61% confidence)

        // Store trend info for strategy-level filtering
        // NEW: Use micro-trend direction when 4h is neutral and micro-trend is detected
        let tradeDirection = trendData.primaryTrend || trend;
        const strategyTrend1h = timeframes?.['1h']?.trend || "neutral";
        
        // If trade direction is neutral but we have a valid micro-trend, use it
        if (tradeDirection === "neutral" && hasMicroTrendBypass && microTrend?.direction !== "neutral") {
          tradeDirection = microTrend.direction;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.TREND} Using MICRO-TREND direction (${tradeDirection}) instead of neutral 4h`);
        }

        // Get market data
        const marketData = marketDataMap.get(symbol);
        if (!marketData) {
          logger.forSymbol(symbol).warn(`Missing market data`);
          continue;
        }
        const currentPrice = parseFloat(marketData.lastPrice);
        if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
          logger.forSymbol(symbol).warn(`Invalid price: ${marketData.lastPrice}`);
          continue;
        }
        const currentVolume = parseFloat(marketData.volume) || 0;

        const historicalData = historicalDataMap.get(symbol);
        if (!historicalData || historicalData.prices.length < 26) {
          logger.forSymbol(symbol).warn(`Missing or insufficient historical data (${historicalData?.prices?.length || 0} candles)`);
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

        logger.forSymbol(symbol).info(`${LOG_CATEGORIES.QUALITY} Evaluating ${allStrategies.length} strategies`);
        
        for (const strategy of allStrategies) {
          const indicators = strategy.indicators || [];
          const entryConditions = strategy.entry_conditions || [];
          if (!indicators.length || !entryConditions.length) {
            logger.forSymbol(symbol).warn(`Strategy "${strategy.name}" skipped - no indicators/conditions`);
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
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.QUALITY} "${strategy.name}": ${conditionsMet ? '✅ PASS' : '❌ FAIL'} - ${JSON.stringify(conditionResults)}`);
            
            if (conditionsMet) {
              // ============= SIGNAL DIRECTION FILTERING =============
              // Check if strategy's signal_direction is compatible with current trend
              const strategyDirection = strategy.signal_direction || 'trend';
              
              // ============= ROBUST STRATEGY TYPE DETECTION =============
              // Uses centralized strategy type detection from _shared/constants.ts
              // instead of fragile substring matching
              const strategyType = detectStrategyType(strategy.id, strategy.name);
              const isMomentumType = strategyType === 'MOMENTUM';
              const is4hDirectional = htfTrend4h === "bullish" || htfTrend4h === "bearish";
              
              if (isMomentumType && !is4hDirectional) {
                // 4h is neutral - check if we can allow via 1h directional + momentum building
                const is1hDirectional = htfTrend1h === "bullish" || htfTrend1h === "bearish";
                const conf1h = trendData.timeframes?.['1h']?.confidence || 0;
                const is1hConfident = conf1h >= 60;
                const isMomentumBuilding = earlyMomentumScore >= MOMENTUM_THRESHOLDS.MIN_SCORE;
                const momentumState = momentum?.state || "unknown";
                const isMomentumStateGood = momentumState === "confirmed" || momentumState === "building";
                
                // Allow if: 1h is directional with >= 60% confidence AND momentum score >= threshold
                const allowMomentumEntry = is1hDirectional && is1hConfident && isMomentumBuilding && isMomentumStateGood;
                
                if (allowMomentumEntry) {
                  logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} "${strategy.name}" [${strategyType}]: MOMENTUM ALLOWED - 4h neutral but 1h ${htfTrend1h} (${conf1h}%), momentum ${momentumState} (score=${earlyMomentumScore})`);
                  // Continue with strategy evaluation - don't skip
                } else {
                  const skipReason = !is1hDirectional ? `1h neutral` : 
                    !is1hConfident ? `1h conf ${conf1h}% < 60%` :
                    !isMomentumBuilding ? `momentum score ${earlyMomentumScore} < ${MOMENTUM_THRESHOLDS.MIN_SCORE}` :
                    `momentum state ${momentumState}`;
                  logger.forSymbol(symbol).warn(`"${strategy.name}" [${strategyType}]: SKIP - momentum strategy, 4h ${htfTrend4h}, ${skipReason}`);
                  continue;
                }
              }
              
              // Determine what signal type this strategy would generate
              let strategySignalType: "long" | "short" | null = null;
              if (strategyDirection === 'long') {
                // Strategy only generates LONG signals - only valid in bullish/neutral trends
                if (tradeDirection === 'bearish') {
                  logger.forSymbol(symbol).warn(`"${strategy.name}": SKIP - long-only strategy in bearish trend`);
                  continue;
                }
                strategySignalType = 'long';
              } else if (strategyDirection === 'short') {
                // Strategy only generates SHORT signals - only valid in bearish/neutral trends  
                if (tradeDirection === 'bullish') {
                  logger.forSymbol(symbol).warn(`"${strategy.name}": SKIP - short-only strategy in bullish trend`);
                  continue;
                }
                strategySignalType = 'short';
              } else {
                // 'trend' mode - follow the current trend direction
                if (tradeDirection === 'bullish') strategySignalType = 'long';
                else if (tradeDirection === 'bearish') strategySignalType = 'short';
                else {
                  logger.forSymbol(symbol).warn(`"${strategy.name}": SKIP - neutral trend, no clear direction`);
                  continue;
                }
              }
              
              // 1H TREND VALIDATION - prevent opening against immediate trend
              if (strategySignalType === 'long' && strategyTrend1h === 'bearish') {
                logger.forSymbol(symbol).warn(`"${strategy.name}": SKIP - LONG signal but 1h is bearish`);
                continue;
              }
              if (strategySignalType === 'short' && strategyTrend1h === 'bullish') {
                logger.forSymbol(symbol).warn(`"${strategy.name}": SKIP - SHORT signal but 1h is bullish`);
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
            logger.forSymbol(symbol).error(`Strategy "${strategy.name}" error: ${err}`);
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
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.QUALITY} All ${candidates.length} strategies disabled for ${currentRegimeType} regime`);
          await logRejectionWithAI(supabase, userId, symbol, 
            `All matching strategies disabled for ${currentRegimeType} regime`, 
            { regime: currentRegimeType, strategiesFiltered: candidates.map(c => c.strategy.name) },
            trendData, riskParams.ai_analysis_enabled !== false);
          continue;
        }
        
        // Select BEST strategy (highest score)
        // Apply regime-aware strategy performance bonus for high performers
        // CAPPED to prevent bonus from overpowering technical quality differences
        const MAX_STRATEGY_BONUS = STRATEGY_PARAMS.MAX_PERFORMANCE_BONUS;
        const MIN_QUALITY_DIFF_FOR_OVERRIDE = STRATEGY_PARAMS.MIN_QUALITY_DIFF_FOR_OVERRIDE;
        
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
        logger.forSymbol(symbol).signal(`Selected "${strategy.name}"${isHighPerformer ? ' ⭐' : ''} [${currentRegimeType}] (${regimeFilteredCandidates.length}/${candidates.length} strategies after regime filter, best score: ${best.score}, direction: ${signalType})`);
        
        // ===== MOMENTUM STRATEGY GATE: MACD ALIGNMENT + VOLUME REQUIREMENT AT HIGH REVERSAL RISK =====
        // For momentum strategies at K>=95 (overbought) or K<=5 (oversold), require MACD alignment
        const isMomentumStrat = isMomentumStrategy(strategy.id, strategy.name);
        const volumeConfirmsNow = momentum?.volumeConfirms === true;
        
        // High reversal thresholds (from constants)
        const HIGH_REVERSAL_OVERBOUGHT = STOCHRSI_THRESHOLDS.HIGH_REVERSAL_OVERBOUGHT ?? 95;
        const HIGH_REVERSAL_OVERSOLD = STOCHRSI_THRESHOLDS.HIGH_REVERSAL_OVERSOLD ?? 5;
        
        if (isMomentumStrat && signalType === "long" && stochRsiK4h >= HIGH_REVERSAL_OVERBOUGHT) {
          const macdAlignedForLong = macdHistogram > 0;
          
          if (!macdAlignedForLong) {
            rejectedByHardGates++;
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} BLOCK - Momentum strategy "${strategy.name}" LONG at K=${stochRsiK4h.toFixed(1)} without MACD alignment (histogram=${macdHistogram.toFixed(4)})`);
            await supabase.from("signal_rejection_log").insert({
              user_id: userId, symbol,
              rejection_reason: `BLOCK: Momentum strategy "${strategy.name}" at K=${stochRsiK4h.toFixed(1)} requires MACD > 0 for LONG`,
              filters_status: { 
                strategyName: strategy.name, 
                stochRsiK4h: stochRsiK4h.toFixed(1),
                macdHistogram: macdHistogram.toFixed(4),
                macdAligned: false,
                gate: "MOMENTUM_MACD_ALIGNMENT_GATE"
              },
              trend_data: trendData, checked_at: new Date().toISOString(),
            });
            continue;
          }
          
          // Volume requirement: reduce position size to 30% if no volume confirmation
          if (!volumeConfirmsNow) {
            reversalPositionMultiplier = Math.min(reversalPositionMultiplier, 0.3);
            logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.RISK} Momentum strategy "${strategy.name}" at K=${stochRsiK4h.toFixed(1)} without volume - position reduced to 30%`);
          }
        }
        
        if (isMomentumStrat && signalType === "short" && stochRsiK4h <= HIGH_REVERSAL_OVERSOLD) {
          const macdAlignedForShort = macdHistogram < 0;
          
          if (!macdAlignedForShort) {
            rejectedByHardGates++;
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} BLOCK - Momentum strategy "${strategy.name}" SHORT at K=${stochRsiK4h.toFixed(1)} without MACD alignment (histogram=${macdHistogram.toFixed(4)})`);
            await supabase.from("signal_rejection_log").insert({
              user_id: userId, symbol,
              rejection_reason: `BLOCK: Momentum strategy "${strategy.name}" at K=${stochRsiK4h.toFixed(1)} requires MACD < 0 for SHORT`,
              filters_status: { 
                strategyName: strategy.name, 
                stochRsiK4h: stochRsiK4h.toFixed(1),
                macdHistogram: macdHistogram.toFixed(4),
                macdAligned: false,
                gate: "MOMENTUM_MACD_ALIGNMENT_GATE"
              },
              trend_data: trendData, checked_at: new Date().toISOString(),
            });
            continue;
          }
          
          // Volume requirement: reduce position size to 30% if no volume confirmation
          if (!volumeConfirmsNow) {
            reversalPositionMultiplier = Math.min(reversalPositionMultiplier, 0.3);
            logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.RISK} Momentum strategy "${strategy.name}" at K=${stochRsiK4h.toFixed(1)} without volume - position reduced to 30%`);
          }
        }
        
        const indicatorValues = best.indicatorValues;

        // ============= CORRELATION CHECK =============
        // Check if opening this position would increase correlated risk
        const correlationCheck = checkPositionCorrelation(
          symbol,
          signalType,
          activePositions || [],
          CORRELATION_PARAMS.MAX_THRESHOLD,
          CORRELATION_PARAMS.MAX_SAME_DIRECTION
        );
        
        if (!correlationCheck.canOpen) {
          rejectedByHardGates++;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK} CORRELATION BLOCK - ${correlationCheck.reason}`);
          await supabase.from("signal_rejection_log").insert({
            user_id: userId, symbol,
            rejection_reason: `Correlation risk: ${correlationCheck.reason}`,
            filters_status: {
              correlationRiskScore: correlationCheck.riskScore,
              correlatedPositions: correlationCheck.correlatedPositions,
              signalType,
              gate: "CORRELATION_RISK",
            },
            trend_data: trendData,
            checked_at: new Date().toISOString(),
          });
          continue;
        }
        
        // Log correlation info if there are correlated positions
        if (correlationCheck.correlatedPositions.length > 0) {
          logger.forSymbol(symbol).info(`🔗 Correlation check PASSED (risk: ${correlationCheck.riskScore.toFixed(0)}%, correlated: ${correlationCheck.correlatedPositions.map(p => `${p.symbol}:${(p.correlation * 100).toFixed(0)}%`).join(', ')})`);
        }

        // ============= PHASE 3: EXCEPTION HIERARCHY & BUDGET =============
        // Determine which exception type applies using global priority order
        // Priority: REVERSAL_OVERRIDE > STRONG_TREND > MICRO_TREND
        
        // Determine exception eligibility for hierarchy
        const reversalOverrideEligible = isReversalEntry && reversalPositionSizeOverride < 1.0;
        const strongTrendEligible = intendedTradeDirection === "long" && 
          stochRsiK4h > STOCHRSI_THRESHOLDS.EXTREME_OVERBOUGHT && 
          stochFilterTrend4h === "bullish" && 
          stochFilterTrend1h === "bullish";
        
        // Calculate trend strength for strong trend exception
        const isMomentumActiveForHierarchy = momentum?.confirms === true || 
          momentum?.state === "building" || 
          momentum?.state === "confirmed";
        const trendStrengthForHierarchy = calculateTrendStrength(
          stochFilterConf4h,
          stochFilterConf1h,
          adx,
          isMomentumActiveForHierarchy
        );
        
        // Determine exception using hierarchy
        const exceptionResult = determineExceptionPriority(
          {
            eligible: reversalOverrideEligible,
            score: unifiedReversal.score,
            positionMultiplier: reversalPositionSizeOverride,
          },
          {
            eligible: strongTrendEligible && (trendStrengthForHierarchy.decision === 'FULL' || trendStrengthForHierarchy.decision === 'PARTIAL'),
            trendStrength: trendStrengthForHierarchy,
            positionMultiplier: trendStrengthForHierarchy.decision === 'FULL' ? 1.0 : 0.5,
          },
          {
            eligible: hasMicroTrendBypass,
            positionMultiplier: microTrendPositionMultiplier,
          }
        );
        
        // Log exception hierarchy decision
        if (exceptionResult.exceptionType !== 'NONE') {
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK} EXCEPTION HIERARCHY: ${exceptionResult.exceptionType} applied (priority ${exceptionResult.priority}) - ${exceptionResult.reason}`);
        }
        
        // Track current exception type for the signal
        const appliedExceptionType: ExceptionType = exceptionResult.exceptionType;
        
        // ============= POSITION SIZE CALCULATION WITH PROPER MULTIPLIER CHAINING =============
        // All multipliers are applied in sequence to ensure proper size reduction
        // Order: quality -> correlation -> recovery -> exception hierarchy
        
        // Step 1: Base size from quality score
        let positionSizeMultiplier = getPositionSizeFromQuality(qualityScore);
        logger.forSymbol(symbol).debug(`Position size: base=${(positionSizeMultiplier * 100).toFixed(0)}% (quality=${qualityScore})`);
        
        // Step 2: Reduce for correlation risk (0% risk = 100% size, 100% risk = 50% size)
        if (correlationCheck.riskScore > CORRELATION_PARAMS.SIZE_REDUCTION_THRESHOLD) {
          const correlationAdjustment = getCorrelationAdjustedSize(1.0, correlationCheck.riskScore);
          positionSizeMultiplier *= correlationAdjustment;
          logger.forSymbol(symbol).info(`🔗 Correlation adjustment - position size reduced to ${(correlationAdjustment * 100).toFixed(0)}% due to ${correlationCheck.riskScore.toFixed(0)}% correlation risk`);
        }
        
        // Step 3: Apply recovery mode reduction
        if (isInRecoveryMode) {
          positionSizeMultiplier *= recoveryPositionSizeMultiplier;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.REVERSAL} Recovery mode - position size reduced to ${(positionSizeMultiplier * 100).toFixed(0)}%`);
        }
        
        // Step 4: Apply exception hierarchy position multiplier (PHASE 3)
        // Uses the unified exception result instead of separate multipliers
        if (exceptionResult.positionMultiplier < 1.0) {
          positionSizeMultiplier *= exceptionResult.positionMultiplier;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK} Exception ${exceptionResult.exceptionType} - position size: ${(positionSizeMultiplier * 100).toFixed(0)}%`);
        }
        
        // Step 5: Apply any remaining reversal reduction not captured by hierarchy
        // (This handles edge cases where reversal entry is detected but not as primary exception)
        if (reversalPositionMultiplier < 1.0 && !reversalOverrideEligible) {
          positionSizeMultiplier *= reversalPositionMultiplier;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.REVERSAL} Additional reversal entry reduction - final position size: ${(positionSizeMultiplier * 100).toFixed(0)}%`);
        }
        
        // Step 6: Apply micro-trend reduction if not already applied via hierarchy
        if (hasMicroTrendBypass && exceptionResult.exceptionType !== 'MICRO_TREND' && microTrendPositionMultiplier < 1.0) {
          positionSizeMultiplier *= microTrendPositionMultiplier;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK} Micro-trend entry - position size capped at ${(positionSizeMultiplier * 100).toFixed(0)}%`);
        }
        
        // Final position size as percentage
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
          confidence_score: Math.round(Math.min(confidence, 100)),  // Round to integer for DB
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
              signals: unifiedReversal.reasons,
              adxWeight: unifiedReversal.adxWeight,
              positionSizeMultiplier: unifiedReversal.positionSizeMultiplier,
            },
            // PHASE 3: Exception hierarchy tracking for analytics
            exceptionType: appliedExceptionType,
            exceptionDetails: {
              type: exceptionResult.exceptionType,
              priority: exceptionResult.priority,
              positionMultiplier: exceptionResult.positionMultiplier,
              reason: exceptionResult.reason,
              trendStrength: exceptionResult.details.trendStrength ? {
                score: exceptionResult.details.trendStrength.score,
                decision: exceptionResult.details.trendStrength.decision,
                components: exceptionResult.details.trendStrength.components,
              } : null,
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
          logger.forSymbol(symbol).error(`Signal insert error: ${insertError.message}`);
        }

        if (!insertError && insertedSignal) {
          signals.push({ ...signal, id: insertedSignal.id });
          totalSignalsGenerated++;
          existingSignalsSet.add(symbol);
          logger.forSymbol(symbol).success(`${signalType.toUpperCase()} via "${strategy.name}" | Quality: ${qualityScore} | Entry: ${pullbackAnalysis.isPullback ? "PULLBACK" : "STANDARD"}`);
        }
      } catch (error) {
        logger.forSymbol(symbol).error(`Error analyzing: ${error}`);
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
            logger.forSymbol(signal.symbol).success(`Executed (quality: ${signal.qualityScore})`);
          }
        } catch (error) {
          logger.error(`Error executing signal: ${error}`);
        }
      }
    }

    logger.summary(`${totalSignalsGenerated} signals | Rejected: hardGates=${rejectedByHardGates} regime=${rejectedByRegime} reversal=${rejectedByReversalRisk} stochRsiExtreme=${rejectedByStochRsiExtreme} quality=${rejectedByQuality} strategy=${rejectedByStrategy} | StrongTrendException: used=${strongTrendExceptionUsed} notApplicable=${strongTrendExceptionNotApplicable}`);

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
      strongTrendException: {
        used: strongTrendExceptionUsed,
        notApplicable: strongTrendExceptionNotApplicable,
        effectivenessRatio: strongTrendExceptionUsed + strongTrendExceptionNotApplicable > 0 
          ? (strongTrendExceptionUsed / (strongTrendExceptionUsed + strongTrendExceptionNotApplicable) * 100).toFixed(1) + '%'
          : 'N/A'
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
    logError(logger, error, 'strategy-analyzer error');
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Failed to analyze strategies",
      signals: [],
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
