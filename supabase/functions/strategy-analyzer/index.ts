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
  PRE_RECOVERY_PARAMS,
  REGIME_SCORE_PARAMS,
  LOSS_CLUSTERING_PARAMS,
  GRADUATED_QUALITY_PARAMS,
  RECOVERY_EXIT_PARAMS,
  // IMPROVEMENT 1-4: New system-level improvement imports
  HTF_EXTREME_HARD_GATES,
  BOLLINGER_ENTRY_GATES,
  SQUEEZE_CONTEXT_PARAMS,
  STRATEGY_SPECIFIC_CONSTRAINTS,
  LOW_VOLUME_DETECTION_PARAMS,
  RANGING_MARKET_DETECTION_PARAMS,
  EARLY_MOMENTUM_ENTRY_PARAMS,
  STRONG_TREND_OVEREXTENSION_PARAMS,
  // NEW: Strong trend HTF bypass and exhaustion detection
  STRONG_TREND_HTF_BYPASS_PARAMS,
  TREND_EXHAUSTION_PARAMS,
  TREND_CONTINUATION_TIGHT_STOPS,
  // Pullback entry detection
  PULLBACK_DETECTION_PARAMS,
  // Phase 2: Smarter Entry Timing
  ENTRY_TIMING_PHASE2_PARAMS,
  // NEW: Momentum continuation for catching strong moves
  MOMENTUM_CONTINUATION_PARAMS,
  TIME_IN_EXTREME_PARAMS,
  // NEW: Trend acceleration exception for catching strong price moves
  TREND_ACCELERATION_PARAMS,
  // NEW: Continuation mode for high ADX impulse follow-through
  CONTINUATION_MODE_PARAMS,
  isMomentumStrategy,
  isNeutralStrategy,
  isTrendFollowingStrategy,
  detectStrategyType,
  type ExceptionType,
  type MarketContext
} from "../_shared/constants.ts";
// NEW: Smart Momentum Module for enhanced trend detection and entry quality
import { 
  calculateMomentumScore, 
  detectPullback, 
  calculateEntryQuality,
  checkEntryConfirmation,
  classifyMarketRegime as classifySmartRegime,
  detectBollingerSqueeze,
  findSwingPoints,
  detectContinuationMode,
  detectHigherHighLow,
  detectLowerLowHigh,
  detectContinuationCandle,
  type MomentumScoreResult,
  type PullbackResult,
  type EntryQualityResult,
  type EntryConfirmationResult,
  type MarketRegimeResult as SmartRegimeResult,
  type ContinuationModeResult
} from "../_shared/smart-momentum.ts";
import { calculateRSIArray, calculateATR } from "../_shared/indicators.ts";
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
  detectMarketRegimeEnhanced,
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
  type MarketRegimeEnhancedResult,
  type SqueezeBreakoutResult,
  type DirectionResult,
  type BreakoutModeResult,
  type TrendStrengthResult,
  type ExceptionResult,
  type ExceptionBudgetResult,
  type SetupType
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

// Helper function to log rejection with optional AI analysis and Order Flow data
const logRejectionWithAI = async (
  supabase: any,
  userId: string,
  symbol: string,
  rejectionReason: string,
  filtersStatus: any,
  trendData: any,
  enableAI: boolean = false,  // Default to false, controlled by ai_analysis_enabled
  orderFlow?: OrderFlowAnalysis | null  // Optional Order Flow data
) => {
  // Merge Order Flow data into filters_status if provided
  const enrichedFiltersStatus = orderFlow ? {
    ...filtersStatus,
    order_flow: {
      score: orderFlow.score,
      signal: orderFlow.signal,
      confidence: orderFlow.confidence,
      volumeSpike: orderFlow.volumeSpike,
      priceRejection: orderFlow.priceRejection,
      pressure: orderFlow.pressure,
      reasons: orderFlow.reasons
    }
  } : filtersStatus;

  const { data, error } = await supabase
    .from("signal_rejection_log")
    .insert({
      user_id: userId,
      symbol,
      rejection_reason: rejectionReason,
      filters_status: enrichedFiltersStatus,
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
      filters_status: enrichedFiltersStatus,
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
  },
  // NEW: Strong 1h Trend Follower - captures trending moves when 1h is directional but 4h is neutral
  // Uses relaxed momentum state requirements and reduced ADX threshold when 1h confidence is high
  // FIX: RSI 45-55 was too narrow and never matched - widened to RSI 40-70 to capture healthy trends
  {
    id: 'builtin-strong-1h-trend',
    name: 'Strong 1h Trend Follower',
    signal_direction: 'trend',  // Follow 1h trend direction
    entry_conditions: [
      { indicator: 'RSI', operator: 'above', value: '40', compareToIndicator: false },  // Healthy uptrend (not oversold)
      { indicator: 'RSI', operator: 'below', value: '70', compareToIndicator: false }   // Not overbought
    ],
    exit_conditions: [{ indicator: 'RSI', operator: 'above', value: '75', compareToIndicator: false }],
    indicators: [{ type: 'RSI', name: 'RSI', period: 14 }],
    risk_settings: { 
      stopLossPercent: 2, 
      takeProfitPercent: 3.5, 
      positionSizePercent: 1,  // Smaller position for these "in-between" setups
      priority: 4  // Lower priority than confirmed trend strategies
    }
  },
  // NEW: Ranging Market Mean Reversion - specifically for low ADX (ranging) markets
  // Trades StochRSI extremes expecting mean reversion when there's no clear trend
  // This strategy ONLY activates when ADX is low (< 23) - the opposite of trend-following strategies
  {
    id: 'builtin-ranging-mean-reversion',
    name: 'Ranging Mean Reversion',
    signal_direction: 'ranging',  // Special: only active when ADX is low
    entry_conditions: [
      // For LONG: StochRSI deeply oversold (K < 15) 
      // For SHORT: StochRSI deeply overbought (K > 85)
      // These are handled dynamically based on direction
      { indicator: 'StochRSI_K', operator: 'below', value: '15', compareToIndicator: false }  // Oversold for LONG
    ],
    exit_conditions: [
      { indicator: 'StochRSI_K', operator: 'above', value: '50', compareToIndicator: false }  // Exit at midline
    ],
    indicators: [{ type: 'StochRSI', name: 'StochRSI_K', period: 14 }],
    risk_settings: { 
      stopLossPercent: 1.5,   // Tighter stops for ranging markets
      takeProfitPercent: 2.5, // Smaller targets (mean reversion, not trend)
      positionSizePercent: 0.75,  // Reduced position size for ranging conditions
      priority: 5  // Lower priority - only use when other strategies don't match
    }
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
  
  // ============= TREND CONTINUATION CREDIT =============
  // In strong confirmed trends, not having a pullback is acceptable for continuation entries
  // ADX confirms trend strength, so we give partial credit instead of heavy penalty
  
  // Very strong trend (ADX >= 28): Continuation is a valid strategy
  if (adx >= ADX_THRESHOLDS.VERY_STRONG && hasStrongTrendContinuation) {
    return {
      isPullback: false,
      hasBothConditions: false,
      pullbackDepth: 0,
      entryTimingScore: 15,  // Good credit for strong trend continuation
      reason: `Strong trend continuation: ADX=${adx.toFixed(1)} with aligned timeframes`
    };
  }
  
  // Moderate trend (ADX >= 22): Some credit for trend following
  if (adx >= ADX_THRESHOLDS.MODERATE && isActiveMomentum) {
    return {
      isPullback: false,
      hasBothConditions: false,
      pullbackDepth: 0,
      entryTimingScore: 10,  // Moderate credit for confirmed momentum
      reason: `Trend continuation: ADX=${adx.toFixed(1)} with active momentum`
    };
  }
  
  // Minimum trend (ADX >= 20): Small credit
  if (adx >= ADX_THRESHOLDS.MINIMUM && isActiveMomentum) {
    return {
      isPullback: false,
      hasBothConditions: false,
      pullbackDepth: 0,
      entryTimingScore: 6,  // Small credit for minimum trend
      reason: `Weak trend continuation: ADX=${adx.toFixed(1)}`
    };
  }
  
  // Default - no trend confirmation, poor timing
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

// ============= PHASE 7: GRADUATED QUALITY POSITION SIZING =============
// Calculate position size based on quality score with graduated penalties
// Uses GRADUATED_QUALITY_PARAMS for tier-based position sizing
const getPositionSizeFromQuality = (
  qualityScore: number, 
  isPreRecovery: boolean = false, 
  isRecoveryMode: boolean = false
): { multiplier: number; tier: string } => {
  let multiplier = 0;
  let tier = "BELOW_THRESHOLD";
  
  if (qualityScore >= GRADUATED_QUALITY_PARAMS.EXCELLENT_MIN) {
    multiplier = GRADUATED_QUALITY_PARAMS.EXCELLENT_MULTIPLIER;
    tier = "EXCELLENT";
  } else if (qualityScore >= GRADUATED_QUALITY_PARAMS.GOOD_MIN) {
    multiplier = GRADUATED_QUALITY_PARAMS.GOOD_MULTIPLIER;
    tier = "GOOD";
  } else if (qualityScore >= GRADUATED_QUALITY_PARAMS.ACCEPTABLE_MIN) {
    multiplier = GRADUATED_QUALITY_PARAMS.ACCEPTABLE_MULTIPLIER;
    tier = "ACCEPTABLE";
  } else if (qualityScore >= GRADUATED_QUALITY_PARAMS.MARGINAL_MIN) {
    multiplier = GRADUATED_QUALITY_PARAMS.MARGINAL_MULTIPLIER;
    tier = "MARGINAL";
  }
  
  // Apply additional penalties for pre-recovery and recovery modes
  if (isRecoveryMode && multiplier > 0) {
    multiplier = multiplier * (1 - GRADUATED_QUALITY_PARAMS.RECOVERY_MODE_PENALTY);
    tier += "_RECOVERY";
  } else if (isPreRecovery && multiplier > 0) {
    multiplier = multiplier * (1 - GRADUATED_QUALITY_PARAMS.PRE_RECOVERY_PENALTY);
    tier += "_PRE_RECOVERY";
  }
  
  return { multiplier, tier };
};

// ============= PHASE 8: RECOVERY EXIT LOGIC =============
// Check if recovery mode should be exited based on consecutive wins or drawdown recovery
const shouldExitRecoveryMode = (
  consecutiveWins: number,
  consecutiveLosses: number,
  portfolioValue: number,
  portfolioPeakValue: number,
  recoveryTradesCount: number
): { shouldExit: boolean; reason: string } => {
  // Don't exit if minimum trades not met
  if (recoveryTradesCount < RECOVERY_EXIT_PARAMS.MIN_TRADES_BEFORE_EXIT) {
    return { shouldExit: false, reason: "MIN_TRADES_NOT_MET" };
  }
  
  // Exit on consecutive wins
  if (consecutiveWins >= RECOVERY_EXIT_PARAMS.CONSECUTIVE_WINS_FOR_EXIT) {
    return { 
      shouldExit: true, 
      reason: `CONSECUTIVE_WINS: ${consecutiveWins} >= ${RECOVERY_EXIT_PARAMS.CONSECUTIVE_WINS_FOR_EXIT}` 
    };
  }
  
  // Exit on drawdown recovery
  if (portfolioPeakValue > 0) {
    const currentDrawdownPercent = ((portfolioPeakValue - portfolioValue) / portfolioPeakValue) * 100;
    if (currentDrawdownPercent <= RECOVERY_EXIT_PARAMS.DRAWDOWN_RECOVERY_PERCENT) {
      return { 
        shouldExit: true, 
        reason: `DRAWDOWN_RECOVERED: ${currentDrawdownPercent.toFixed(2)}% <= ${RECOVERY_EXIT_PARAMS.DRAWDOWN_RECOVERY_PERCENT}%` 
      };
    }
  }
  
  return { shouldExit: false, reason: "CONDITIONS_NOT_MET" };
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

    // Fetch manually paused strategies from strategy_performance table
    const { data: pausedStrategiesData } = await supabase
      .from("strategy_performance")
      .select("strategy_name")
      .eq("user_id", userId)
      .eq("status", "paused");
    
    const pausedStrategyNames = new Set(
      (pausedStrategiesData || []).map(s => s.strategy_name.toLowerCase())
    );
    
    if (pausedStrategyNames.size > 0) {
      logger.info(`${LOG_CATEGORIES.SUMMARY} Manually paused strategies: ${Array.from(pausedStrategyNames).join(', ')}`);
    }

    // Combine user's custom strategies with built-in templates
    // User strategies are evaluated first (they take priority), then built-ins fill gaps
    // NOTE: Strategy filtering is now DEFERRED to per-symbol evaluation based on regime
    const userStrategies = (customStrategies || []).filter(s => 
      !pausedStrategyNames.has(s.name.toLowerCase())
    );
    const userStrategyNames = new Set(userStrategies.map(s => s.name.toLowerCase()));
    
    // Add built-in templates that don't duplicate user strategies AND are not paused
    const builtInToInclude = BUILT_IN_TEMPLATES.filter(t => 
      !userStrategyNames.has(t.name.toLowerCase()) && 
      !pausedStrategyNames.has(t.name.toLowerCase())
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
    
    // ===== PER-SYMBOL GATE ATTRIBUTION TRACKING =====
    // Track which specific gate rejected each symbol for debugging
    type GateType = 
      | 'EXISTING_SIGNAL' 
      | 'MAX_TRADES_PER_SYMBOL' 
      | 'LOSS_CLUSTERING_COOLDOWN'
      | 'NO_TREND_DATA'
      | 'REGIME_TRENDING_BLOCK'
      | 'REGIME_RANGING_BLOCK'
      | 'REGIME_CONTINUATION_BLOCK'
      | 'UNIFIED_REVERSAL_BLOCK'
      | 'HTF_EXTREME_OVERSOLD_BLOCK'
      | 'HTF_EXTREME_OVERBOUGHT_BLOCK'
      | 'BOLLINGER_PERCENTB_SHORT'
      | 'BOLLINGER_PERCENTB_LONG'
      | 'SQUEEZE_CONTEXT_MEAN_REVERSION'
      | 'STOCHRSI_NOT_RISING'
      | 'STOCHRSI_NOT_FALLING'
      | 'BEARISH_DIVERGENCE_AT_EXTREME'
      | 'BULLISH_DIVERGENCE_AT_EXTREME'
      | 'STOCHRSI_OVERBOUGHT_BLOCK'
      | 'STOCHRSI_OVERSOLD_BLOCK'
      | 'STOCHRSI_ABSOLUTE_MAX_OVERBOUGHT'
      | 'STOCHRSI_ABSOLUTE_MAX_OVERSOLD'
      | 'REGIME_STRATEGY_MISMATCH'
      | 'CONFIDENCE_BELOW_THRESHOLD'
      | 'ADX_TOO_LOW'
      | 'ADX_TOO_LOW_NO_SQUEEZE'
      | 'MOMENTUM_DIRECTION_OPPOSING'
      | 'NEUTRAL_4H_LOW_CONFIDENCE'
      | 'MACD_MISALIGNED'
      | 'HTF_NOT_ALIGNED'
      | 'CONFIDENCE_DEAD_ZONE'
      | 'NO_STRATEGY_SUPPORT'
      | 'NO_CONDITION_STRATEGY'
      | 'QUALITY_TOO_LOW'
      | 'NO_STRATEGY_MATCH'
      | 'STRATEGY_CONSTRAINT_BLOCK'
      | 'SIGNAL_GENERATED'
      // NEW: Smart momentum gates
      | 'MOMENTUM_EXHAUSTED'
      | 'MOMENTUM_WEAKENING'
      | 'REGIME_EXHAUSTED'
      // Phase 2: Smarter Entry Timing gates
      | 'PHASE2_NO_BOUNCE_CONFIRMATION'
      | 'PHASE2_RECOVERY_NO_CONFIRMATION'
      // NEW: Trend acceleration gates
      | 'TREND_ACCELERATION_ALLOWED'
      | 'TREND_ACCELERATION_BOLLINGER_BYPASS'
      | 'TREND_ACCELERATION_MOMENTUM_BYPASS';
    
    const perSymbolGateAttribution = new Map<string, { gate: GateType; details: string }>();
    
    // Loss Recovery Mode - increase quality threshold after consecutive losses
    const consecutiveLosses = riskParams.consecutive_losses || 0;
    const consecutiveWins = riskParams.consecutive_wins || 0;
    const lossThreshold = riskParams.consecutive_loss_threshold || 3;
    let isInRecoveryMode = riskParams.loss_recovery_mode_enabled && 
      consecutiveLosses >= lossThreshold;
    const recoveryConfidenceBoost = riskParams.loss_recovery_confidence_boost || 10;
    const recoveryPositionSizeMultiplier = (riskParams.loss_recovery_position_size_percent || 50) / 100;
    
    // ============= PHASE 8: RECOVERY EXIT LOGIC (Finding 8) =============
    // Check if recovery mode should be exited based on consecutive wins or drawdown recovery
    const portfolioValue = riskParams.portfolio_value || 10000;
    const portfolioPeakValue = riskParams.portfolio_peak_value || portfolioValue;
    const recoveryTradesCount = riskParams.recovery_trades_today || 0;
    
    if (isInRecoveryMode) {
      const recoveryExitCheck = shouldExitRecoveryMode(
        consecutiveWins,
        consecutiveLosses,
        portfolioValue,
        portfolioPeakValue,
        recoveryTradesCount
      );
      
      if (recoveryExitCheck.shouldExit) {
        logger.info(`${LOG_CATEGORIES.SUCCESS} RECOVERY EXIT: ${recoveryExitCheck.reason}`);
        logger.info(`   → Exiting recovery mode, resetting to normal trading`);
        
        // Reset recovery mode in database
        const { error: resetError } = await supabase
          .from("risk_parameters")
          .update({
            consecutive_losses: 0,
            recovery_trades_today: 0,
            recovery_cooldown_until: null,
            low_quality_cooldown_until: null,
          })
          .eq("user_id", userId);
        
        if (resetError) {
          logger.error(`Failed to reset recovery mode: ${resetError.message}`);
        } else {
          logger.success(`Recovery mode reset - normal trading resumed`);
          isInRecoveryMode = false; // Update local state
        }
      } else {
        logger.info(`${LOG_CATEGORIES.REVERSAL} RECOVERY EXIT CHECK: ${recoveryExitCheck.reason} (wins=${consecutiveWins}, losses=${consecutiveLosses})`);
      }
    }
    
    // ============= PHASE 4 (9 FINDINGS): PRE-RECOVERY STATE (Finding 1) =============
    // Activate pre-recovery at (threshold - 1) losses to prevent "last bad trade"
    const isPreRecovery = !isInRecoveryMode && 
      consecutiveLosses === (lossThreshold - PRE_RECOVERY_PARAMS.ACTIVATION_THRESHOLD_OFFSET);
    
    // ============= PHASE 4 (9 FINDINGS): DRAWDOWN-BASED RISK SCALING (Finding 4) =============
    // Graduated position size reduction before hitting recovery threshold
    let drawdownPositionMultiplier = 1.0;
    if (consecutiveLosses >= 3) {
      drawdownPositionMultiplier = 1 - PRE_RECOVERY_PARAMS.CONSECUTIVE_LOSSES_3_REDUCTION;
      logger.info(`${LOG_CATEGORIES.REVERSAL} DRAWDOWN SCALING: ${consecutiveLosses} losses → ${(drawdownPositionMultiplier * 100).toFixed(0)}% position size`);
    } else if (consecutiveLosses >= 2) {
      drawdownPositionMultiplier = 1 - PRE_RECOVERY_PARAMS.CONSECUTIVE_LOSSES_2_REDUCTION;
      logger.info(`${LOG_CATEGORIES.REVERSAL} DRAWDOWN SCALING: ${consecutiveLosses} losses → ${(drawdownPositionMultiplier * 100).toFixed(0)}% position size`);
    }
    
    // Pre-recovery applies additional reduction on top of drawdown scaling
    if (isPreRecovery) {
      drawdownPositionMultiplier *= (1 - PRE_RECOVERY_PARAMS.POSITION_SIZE_REDUCTION);
      logger.info(`${LOG_CATEGORIES.REVERSAL} PRE-RECOVERY STATE ACTIVE: ${consecutiveLosses}/${lossThreshold} losses`);
      logger.info(`   → Combined position multiplier: ${(drawdownPositionMultiplier * 100).toFixed(0)}%`);
      logger.info(`   → Requires: deep pullback OR squeeze breakout for entry`);
    }
    
    // ============= PHASE 6 (9 FINDINGS): LOSS-CLUSTERING PROTECTION (Finding 7) =====
    // Check if we're in cooldown after a low-quality loss
    const cooldownUntil = riskParams.low_quality_cooldown_until;
    const isInLossCooldown = cooldownUntil && new Date(cooldownUntil) > new Date();
    
    if (isInLossCooldown) {
      const remainingMs = new Date(cooldownUntil).getTime() - Date.now();
      const remainingMins = Math.ceil(remainingMs / (1000 * 60));
      logger.warn(`${LOG_CATEGORIES.REVERSAL} LOSS-CLUSTERING COOLDOWN: ${remainingMins}min remaining after low-quality loss`);
    }
    
    // ============= DYNAMIC QUALITY THRESHOLD =============
    // Adjust threshold based on market conditions:
    // - Strong ADX (≥35): Allow lower quality (more signals in strong trends)
    // - Normal ADX (20-35): Standard threshold
    // - Recovery mode: Higher threshold (fewer, higher quality signals)
    // - Low volume: Higher threshold (informational, not rejection)
    const BASE_MIN_QUALITY_SCORE = QUALITY_THRESHOLDS.BASE_MIN;
    const DEFAULT_MIN_QUALITY = BASE_MIN_QUALITY_SCORE;
    
    const getMinQualityScore = (adx: number, inRecovery: boolean, confidence1h?: number, isNeutralTrend?: boolean, lowVolumeBoost: number = 0): number => {
      let baseThreshold: number;
      
      if (inRecovery) {
        // SCENARIO 6 FIX (Finding 9): Cap recovery quality escalation to prevent system paralysis
        const recoveryQuality = BASE_MIN_QUALITY_SCORE + recoveryConfidenceBoost;
        baseThreshold = Math.min(recoveryQuality, QUALITY_THRESHOLDS.MAX_RECOVERY_QUALITY);
      } else if (isNeutralTrend) {
        // Neutral trends (with HTF direction) get lower threshold since quality scoring
        // is optimized for directional 5m trends - neutral relies on 1h direction instead
        baseThreshold = QUALITY_THRESHOLDS.NEUTRAL_MIN;
      } else if (confidence1h && confidence1h >= 65) {
        // RELAXED: If 1h shows strong direction (≥65% confidence), allow lower threshold
        baseThreshold = QUALITY_THRESHOLDS.STRONG_1H_MIN;
      } else if (adx >= ADX_THRESHOLDS.EXCEPTIONAL) {
        // Very strong trends = allow more signals
        baseThreshold = QUALITY_THRESHOLDS.EXCEPTIONAL_ADX_MIN;
      } else if (adx >= ADX_THRESHOLDS.STRONG) {
        baseThreshold = QUALITY_THRESHOLDS.STRONG_ADX_MIN;
      } else {
        baseThreshold = BASE_MIN_QUALITY_SCORE;
      }
      
      // Apply low-volume boost (informational tightening during low-activity periods)
      return baseThreshold + lowVolumeBoost;
    };
    
    if (isInRecoveryMode) {
      logger.info(`${LOG_CATEGORIES.REVERSAL} LOSS RECOVERY MODE ACTIVE: ${consecutiveLosses} consecutive losses`);
      logger.info(`   → Quality threshold: ${BASE_MIN_QUALITY_SCORE + recoveryConfidenceBoost} (base ${BASE_MIN_QUALITY_SCORE} + ${recoveryConfidenceBoost})`);
      logger.info(`   → Position size multiplier: ${recoveryPositionSizeMultiplier * 100}%`);
    }

    // Analyze each symbol (using filtered activeSymbols that passed win rate check)
    for (const { symbol } of activeSymbols) {
      const currentTradeCount = openTradesPerSymbol.get(symbol) || 0;

      if (existingSignalsSet.has(symbol)) {
        perSymbolGateAttribution.set(symbol, { gate: 'EXISTING_SIGNAL', details: 'Active signal from last minute' });
        await supabase.from("signal_rejection_log").insert({
          user_id: userId, symbol,
          rejection_reason: "Already has active signal from last minute",
          filters_status: { currentTradeCount },
          checked_at: new Date().toISOString(),
        });
        continue;
      }

      if (currentTradeCount >= riskParams.max_trades_per_symbol) {
        perSymbolGateAttribution.set(symbol, { gate: 'MAX_TRADES_PER_SYMBOL', details: `${currentTradeCount}/${riskParams.max_trades_per_symbol} active` });
        await supabase.from("signal_rejection_log").insert({
          user_id: userId, symbol,
          rejection_reason: `Max trades per symbol reached: ${currentTradeCount}/${riskParams.max_trades_per_symbol} trades active`,
          filters_status: { currentTradeCount, maxTradesPerSymbol: riskParams.max_trades_per_symbol },
          checked_at: new Date().toISOString(),
        });
        continue;
      }

      // ============= PHASE 6 (9 FINDINGS): LOSS-CLUSTERING COOLDOWN CHECK =====
      // Block new entries during cooldown after low-quality loss (Finding 7)
      if (isInLossCooldown) {
        const remainingMs = new Date(cooldownUntil!).getTime() - Date.now();
        const remainingMins = Math.ceil(remainingMs / (1000 * 60));
        perSymbolGateAttribution.set(symbol, { gate: 'LOSS_CLUSTERING_COOLDOWN', details: `${remainingMins}min remaining` });
        await logRejectionWithAI(
          supabase, userId, symbol,
          `LOSS-CLUSTERING COOLDOWN: ${remainingMins}min remaining - blocking new entries after low-quality loss`,
          { 
            gate: "LOSS_CLUSTERING_COOLDOWN",
            cooldownUntil,
            remainingMinutes: remainingMins,
            lastTradeQuality: riskParams.last_trade_quality,
            medianQuality: riskParams.median_trade_quality
          },
          null,
          false
        );
        continue;
      }

      const trendData = trendDataMap.get(symbol);
      if (!trendData) {
        perSymbolGateAttribution.set(symbol, { gate: 'NO_TREND_DATA', details: 'calculate-trend returned null' });
        continue;
      }

      try {
        const { primaryTrend: trend, confidence, trueAlignment, isAligned, timeframes } = trendData;
        const trendConsistency = trueAlignment?.score || 0;
        const adx = trendData.volatility?.adx || 0;
        const momentum = trendData.momentum;
        // Derive higher timeframe data from correct paths
        const htfTrend4h = timeframes?.['4h']?.trend || timeframes?.['4h']?.indicators?.emaSignal || "neutral";
        const htfTrend1h = timeframes?.['1h']?.trend || timeframes?.['1h']?.indicators?.emaSignal || "neutral";

        // ============= EARLY ORDER FLOW ANALYSIS =============
        // Calculate Order Flow data BEFORE rejection gates so it's available for rejection logs
        // This provides volume spike, price rejection, and pressure analysis for debugging
        const earlyIntendedDirection: "long" | "short" = trend === "bearish" ? "short" : "long";
        const symbolHistoricalData = historicalDataMap.get(symbol);
        const klines = symbolHistoricalData?.klines || [];
        const earlyOrderFlowAnalysis = klines.length > 0 ? analyzeOrderFlow(klines, earlyIntendedDirection) : null;
        
        if (earlyOrderFlowAnalysis && earlyOrderFlowAnalysis.reasons.length > 0) {
          logger.forSymbol(symbol).debug(`[EARLY_ORDER_FLOW] score=${earlyOrderFlowAnalysis.score}/100 signal=${earlyOrderFlowAnalysis.signal} | ${earlyOrderFlowAnalysis.reasons.slice(0, 2).join(' | ')}`);
        }

        // ============= RANGING MARKET DETECTION =============
        // Log informational message when market is genuinely ranging (all timeframes neutral, low ADX, low volume)
        if (RANGING_MARKET_DETECTION_PARAMS.ENABLE_LOGGING) {
          const tf4h = timeframes?.['4h'];
          const tf1h = timeframes?.['1h'];
          const tf30m = timeframes?.['30m'];
          
          // Check if all timeframes are neutral (confidence below threshold for any direction)
          const is4hNeutral = !tf4h?.trend || tf4h.trend === "neutral" || (tf4h.confidence ?? 0) < RANGING_MARKET_DETECTION_PARAMS.NEUTRAL_CONFIDENCE_THRESHOLD;
          const is1hNeutral = !tf1h?.trend || tf1h.trend === "neutral" || (tf1h.confidence ?? 0) < RANGING_MARKET_DETECTION_PARAMS.NEUTRAL_CONFIDENCE_THRESHOLD;
          const is30mNeutral = !tf30m?.trend || tf30m.trend === "neutral" || (tf30m.confidence ?? 0) < RANGING_MARKET_DETECTION_PARAMS.NEUTRAL_CONFIDENCE_THRESHOLD;
          
          const allTimeframesNeutral = is4hNeutral && is1hNeutral && is30mNeutral;
          const isLowAdx = adx < RANGING_MARKET_DETECTION_PARAMS.ADX_THRESHOLD;
          const volumeRatio = trendData.volume?.ratio ?? 1.0;
          const isLowVolume = volumeRatio < RANGING_MARKET_DETECTION_PARAMS.VOLUME_RATIO_THRESHOLD;
          
        if (allTimeframesNeutral && isLowAdx && isLowVolume) {
            logger.forSymbol(symbol).info(`📊 RANGING MARKET DETECTED: All timeframes neutral, ADX=${adx.toFixed(1)}, Volume=${(volumeRatio * 100).toFixed(0)}% of avg. Trend strategies paused.`);
          } else if (allTimeframesNeutral && isLowAdx) {
            // Volume is OK but still ranging - log at info level for visibility
            logger.forSymbol(symbol).info(`📊 RANGING (ADX only): ADX=${adx.toFixed(1)}, neutral TFs, Volume=${(volumeRatio * 100).toFixed(0)}% of avg`);
          } else if (isLowAdx) {
            // Low ADX but not all timeframes neutral
            logger.forSymbol(symbol).debug(`📊 [RANGING_CHECK] ADX=${adx.toFixed(1)} low, but TFs not all neutral: 4h=${is4hNeutral} 1h=${is1hNeutral} 30m=${is30mNeutral}, Vol=${(volumeRatio * 100).toFixed(0)}%`);
          }
        }

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
            riskParams.ai_analysis_enabled !== false,
            earlyOrderFlowAnalysis
          );
          continue;
        }
        
        // Use derived direction consistently throughout signal generation
        const derivedDirection = directionResult.direction;
        logger.forSymbol(symbol).info(`${LOG_CATEGORIES.TREND} Direction derived: ${derivedDirection} from ${directionResult.source} (${directionResult.confidence.toFixed(0)}% conf)`);
        if (directionResult.reasons.some(r => r.includes("Warning"))) {
          logger.forSymbol(symbol).warn(`   ${directionResult.reasons.filter(r => r.includes("Warning")).join(", ")}`);
        }
        
        // ============= EARLY MOMENTUM ENTRY POSITION SIZING =============
        // Apply 50% position size reduction for early momentum entries (30m+1h without 4h)
        let earlyMomentumPositionMultiplier = 1.0;
        if (directionResult.source === "early-momentum-30m+1h" && EARLY_MOMENTUM_ENTRY_PARAMS.ENABLED) {
          earlyMomentumPositionMultiplier = EARLY_MOMENTUM_ENTRY_PARAMS.POSITION_SIZE_MULTIPLIER;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK} EARLY MOMENTUM ENTRY: Position size reduced to ${(earlyMomentumPositionMultiplier * 100).toFixed(0)}%`);
        }
        
        // ============= PRICE ACTION MOMENTUM POSITION SIZING =============
        // Apply 75% position size reduction for price action momentum entries (neutral TFs but strong price move)
        let priceActionMomentumPositionMultiplier = 1.0;
        if (directionResult.source === "price-action-momentum") {
          priceActionMomentumPositionMultiplier = MOMENTUM_CONTINUATION_PARAMS.POSITION_SIZE_MULTIPLIER;
          const priceMove = trendData.priceActionMomentum?.movePercent || 0;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} PRICE ACTION MOMENTUM: ${priceMove.toFixed(2)}% move detected - position size ${(priceActionMomentumPositionMultiplier * 100).toFixed(0)}%`);
        }

        // ============= PHASE 4 (9 FINDINGS): ENHANCED MARKET REGIME DETECTION =============
        // Finding 2 & 5: Use quantified regime score with graduated penalties
        const regimeEnhanced = detectMarketRegimeEnhanced(trendData);
        const regime = detectMarketRegime(trendData);  // Keep legacy for compatibility
        
        if (!regimeEnhanced.tradeable) {
          rejectedByRegime++;
          const gateType: GateType = regimeEnhanced.regime === 'trending' ? 'REGIME_TRENDING_BLOCK' : 'REGIME_RANGING_BLOCK';
          perSymbolGateAttribution.set(symbol, { gate: gateType, details: regimeEnhanced.reason });
          await logRejectionWithAI(
            supabase,
            userId,
            symbol,
            `Market regime not tradeable: ${regimeEnhanced.reason}`,
            { 
              regime: regimeEnhanced.regime, 
              regimeScore: regimeEnhanced.regimeScore,
              allowedSetups: regimeEnhanced.allowedSetups,
              penalties: regimeEnhanced.penalties,
              reason: regimeEnhanced.reason, 
              adx, confidence, trendConsistency 
            },
            trendData,
            riskParams.ai_analysis_enabled !== false,
            earlyOrderFlowAnalysis
          );
          continue;
        }
        
        // ============= NEW: SMART MOMENTUM ANALYSIS =============
        // Phase 1 & 2: Calculate momentum score, pullback detection, and entry quality
        const symbolHistData = historicalDataMap.get(symbol);
        const klineData = symbolHistData?.klines || [];
        const priceData = symbolHistData?.prices || [];
        const smartAdxRising = trendData.volatility?.adxRising ?? false;
        const currentATR = calculateATR(klineData, 14);
        
        // Calculate momentum score (-100 to +100)
        const smartMomentum = calculateMomentumScore(klineData, priceData, adx, smartAdxRising, currentATR);
        
        // Find swing points for pullback detection
        const swingPoints = findSwingPoints(klineData, 20);
        
        // Calculate RSI array for pullback detection
        const rsiArrayForPullback = calculateRSIArray(priceData, 14);
        const currentRsi = rsiArrayForPullback.length > 0 ? rsiArrayForPullback[rsiArrayForPullback.length - 1] : 50;
        
        // Detect pullback
        const smartPullback = detectPullback(
          priceData, 
          derivedDirection, 
          currentRsi, 
          rsiArrayForPullback,
          swingPoints.swingHigh,
          swingPoints.swingLow
        );
        
        // Detect Bollinger Squeeze
        const bbSqueeze = detectBollingerSqueeze(priceData, 20, 2);
        
        // Classify market regime using smart module
        const volume1hDataForRegime = trendData.volume?.["1h"] || {};
        const volumeRatioForRegime = volume1hDataForRegime.volumeRatio ?? 1.0;
        const smartRegime = classifySmartRegime(
          adx,
          smartAdxRising,
          smartMomentum,
          bbSqueeze.bbWidth,
          bbSqueeze.isSqueeze,
          volumeRatioForRegime
        );
        
        // Log smart momentum analysis
        logger.forSymbol(symbol).info(`${LOG_CATEGORIES.MOMENTUM} SMART MOMENTUM: score=${smartMomentum.score} dir=${smartMomentum.direction} accel=${smartMomentum.isAccelerating} weak=${smartMomentum.isWeakening} exhaust=${smartMomentum.isExhausted}`);
        if (smartMomentum.reasons.length > 0) {
          logger.forSymbol(symbol).debug(`   Components: ${smartMomentum.reasons.slice(0, 3).join(' | ')}`);
        }
        if (smartPullback.isPullback) {
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.ENTRY} PULLBACK: type=${smartPullback.pullbackType} depth=${smartPullback.pullbackDepth.toFixed(1)}% valid=${smartPullback.isValidPullback} recovering=${smartPullback.isRecovering}`);
        }
        logger.forSymbol(symbol).info(`${LOG_CATEGORIES.TREND} SMART REGIME: ${smartRegime.regime} (score=${smartRegime.regimeScore}) tradeable=${smartRegime.tradeable} threshold=${smartRegime.qualityThreshold}`);
        
        // ============= SMART MOMENTUM GATES =============
        const regimeAwareEnabled = riskParams.regime_aware_trading !== false;
        const minMomentumScore = riskParams.min_momentum_score ?? 30;
        const exhaustionBlockEnabled = riskParams.exhaustion_block_enabled !== false;
        
        // ============= CONTINUATION MODE: Check BEFORE exhaustion gate =============
        // Allows entries at ADX 45-55 when ALL factors are strongly aligned
        // This captures impulse continuation that would otherwise be blocked as "exhausted"
        let qualifiesForContinuationMode = false;
        let continuationModeResult: ContinuationModeResult | null = null;
        let continuationPositionMultiplier = 1.0;
        
        // Check continuation mode when momentum is exhausted
        if (CONTINUATION_MODE_PARAMS.ENABLED && smartMomentum.isExhausted) {
          // Get trend data for continuation check
          const conf1h = trendData.timeframes?.['1h']?.confidence || 50;
          const trend1h = trendData.timeframes?.['1h']?.trend || "neutral";
          const conf4h = trendData.timeframes?.['4h']?.confidence || 50;
          const trend4h = trendData.timeframes?.['4h']?.trend || "neutral";
          const hasDivergence = trendData.momentum?.hasDivergence || false;
          const adxSlope = smartAdxRising ? 0.5 : -0.5;
          
          // Detect price action structure
          const hasHigherHighLow = detectHigherHighLow(priceData, 10);
          const hasLowerLowHigh = detectLowerLowHigh(priceData, 10);
          const isContinuationCandleNow = detectContinuationCandle(klineData, derivedDirection);
          
          // Calculate candle size in ATR for volatility check
          const lastCandle = klineData[klineData.length - 1];
          const candleSize = lastCandle ? Math.abs(parseFloat(lastCandle[4]) - parseFloat(lastCandle[1])) : 0;
          const candleSizeATR = currentATR > 0 ? candleSize / currentATR : 0;
          
          // Get StochRSI K
          const stochRsiK = trendData.stochasticRsi?.["1h"]?.k ?? trendData.stochasticRsi?.aggregated?.k ?? 50;
          
          continuationModeResult = detectContinuationMode(
            adx,
            smartAdxRising,
            adxSlope,
            conf1h,
            trend1h,
            conf4h,
            trend4h,
            Math.abs(smartMomentum.score),
            hasDivergence,
            hasHigherHighLow,
            hasLowerLowHigh,
            isContinuationCandleNow,
            candleSizeATR,
            stochRsiK,
            derivedDirection
          );
          
          qualifiesForContinuationMode = continuationModeResult.qualifies;
          
          if (qualifiesForContinuationMode) {
            continuationPositionMultiplier = continuationModeResult.positionSizeMultiplier;
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} ✅ CONTINUATION MODE QUALIFIED: ${continuationModeResult.reason}`);
            for (const gate of continuationModeResult.gateResults) {
              logger.forSymbol(symbol).info(`   ${gate.passed ? '✓' : '✗'} ${gate.gate}: ${gate.value}`);
            }
          } else {
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} 📋 CONTINUATION MODE EVALUATED: Not qualified - ${continuationModeResult.reason}`);
            // Log first few failed gates for visibility
            const failedGates = continuationModeResult.gateResults.filter(g => !g.passed).slice(0, 3);
            for (const gate of failedGates) {
              logger.forSymbol(symbol).debug(`   ✗ ${gate.gate}: ${gate.value}`);
            }
          }
        }
        
        // Gate 1: Block entries when momentum is EXHAUSTED (unless squeeze breakout OR continuation mode)
        if (exhaustionBlockEnabled && smartMomentum.isExhausted && !bbSqueeze.isBreakingOut && !qualifiesForContinuationMode) {
          rejectedByHardGates++;
          perSymbolGateAttribution.set(symbol, { 
            gate: 'MOMENTUM_EXHAUSTED', 
            details: `score=${smartMomentum.score}, overext=${smartMomentum.overextensionATR.toFixed(1)}ATR${continuationModeResult ? `, continuation rejected: ${continuationModeResult.reason}` : ''}` 
          });
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} SMART MOMENTUM GATE: Trend EXHAUSTED - blocking entry`);
          logger.forSymbol(symbol).debug(`   Score=${smartMomentum.score}, OverextATR=${smartMomentum.overextensionATR.toFixed(1)}, ADX=${adx.toFixed(1)}, rising=${smartAdxRising}`);
          await logRejectionWithAI(
            supabase, userId, symbol,
            `SMART MOMENTUM: Trend exhausted (score=${smartMomentum.score}, ${smartMomentum.overextensionATR.toFixed(1)} ATR from EMA)${continuationModeResult ? ` | Continuation rejected: ${continuationModeResult.reason}` : ''}`,
            {
              gate: "MOMENTUM_EXHAUSTED",
              momentumScore: smartMomentum.score,
              direction: smartMomentum.direction,
              overextensionATR: smartMomentum.overextensionATR,
              adx: adx.toFixed(1),
              adxRising: smartAdxRising,
              components: smartMomentum.components,
              reasons: smartMomentum.reasons,
              continuationModeAttempted: CONTINUATION_MODE_PARAMS.ENABLED,
              continuationModeRejection: continuationModeResult?.reason || "N/A",
              continuationGateResults: continuationModeResult?.gateResults || []
            },
            trendData,
            riskParams.ai_analysis_enabled !== false,
            earlyOrderFlowAnalysis
          );
          continue;
        }
        
        // Gate 2: Block entries when momentum is WEAKENING against trade direction
        const momentumAligned = (derivedDirection === "long" && smartMomentum.score > 0) ||
                                (derivedDirection === "short" && smartMomentum.score < 0);
        const isMomentumWeakeningAgainstTrade = smartMomentum.isWeakening && !momentumAligned;
        
        if (regimeAwareEnabled && isMomentumWeakeningAgainstTrade && Math.abs(smartMomentum.score) < minMomentumScore) {
          rejectedByHardGates++;
          perSymbolGateAttribution.set(symbol, { gate: 'MOMENTUM_WEAKENING', details: `score=${smartMomentum.score}, need=${minMomentumScore}` });
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} SMART MOMENTUM GATE: Momentum weakening against ${derivedDirection} (score=${smartMomentum.score})`);
          await logRejectionWithAI(
            supabase, userId, symbol,
            `SMART MOMENTUM: Weakening momentum (${smartMomentum.score}) against ${derivedDirection} direction`,
            {
              gate: "MOMENTUM_WEAKENING",
              momentumScore: smartMomentum.score,
              derivedDirection,
              isWeakening: smartMomentum.isWeakening,
              minRequired: minMomentumScore,
              components: smartMomentum.components
            },
            trendData,
            riskParams.ai_analysis_enabled !== false,
            earlyOrderFlowAnalysis
          );
          continue;
        }
        
        // Gate 3: Block entries in EXHAUSTED regime (smart regime classification)
        // NOTE: Continuation mode is already checked above before MOMENTUM_EXHAUSTED gate
        if (regimeAwareEnabled && smartRegime.regime === "EXHAUSTED" && !qualifiesForContinuationMode) {
          rejectedByHardGates++;
          perSymbolGateAttribution.set(symbol, { gate: 'REGIME_EXHAUSTED', details: smartRegime.reason });
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} SMART REGIME GATE: Market regime EXHAUSTED - blocking new entries`);
          await logRejectionWithAI(
            supabase, userId, symbol,
            `SMART REGIME: ${smartRegime.reason}`,
            {
              gate: "REGIME_EXHAUSTED",
              regime: smartRegime.regime,
              regimeScore: smartRegime.regimeScore,
              momentumScore: smartMomentum.score,
              adx: adx.toFixed(1),
              bbSqueeze: bbSqueeze.isSqueeze,
              continuationModeAttempted: CONTINUATION_MODE_PARAMS.ENABLED,
              continuationModeRejection: continuationModeResult?.reason || "N/A"
            },
            trendData,
            riskParams.ai_analysis_enabled !== false,
            earlyOrderFlowAnalysis
          );
          continue;
        }
        
        // Store momentum analysis in database (async, don't block)
        supabase
          .from("momentum_analysis")
          .insert({
            user_id: userId,
            symbol,
            momentum_score: smartMomentum.score,
            trend_direction: smartMomentum.direction,
            ema_spread_roc: smartMomentum.components.emaSpreadRoC,
            rsi_momentum: smartMomentum.components.rsiMomentum,
            macd_slope: smartMomentum.components.macdSlope,
            is_accelerating: smartMomentum.isAccelerating,
            is_exhausted: smartMomentum.isExhausted,
            overextension_atr: smartMomentum.overextensionATR,
            pullback_depth: smartPullback.pullbackDepth,
            timeframe_alignment: { 
              pullbackType: smartPullback.pullbackType,
              isValidPullback: smartPullback.isValidPullback,
              rsiInZone: smartPullback.rsiInZone 
            }
          })
          .then(({ error }) => {
            if (error) logger.forSymbol(symbol).debug(`Failed to store momentum analysis: ${error.message}`);
          });
        
        // Store market regime history (async, don't block)
        supabase
          .from("market_regime_history")
          .insert({
            user_id: userId,
            symbol,
            regime: smartRegime.regime,
            adx: adx,
            adx_slope: smartAdxRising ? 1 : -1,
            trend_strength: smartRegime.regimeScore,
            trend_direction: smartMomentum.direction,
            bb_squeeze: bbSqueeze.isSqueeze,
            bb_width: bbSqueeze.bbWidth
          })
          .then(({ error }) => {
            if (error) logger.forSymbol(symbol).debug(`Failed to store regime history: ${error.message}`);
          });
        // Finding 1: In pre-recovery state, require deep pullback OR squeeze breakout
        // Get pullback analysis early for pre-recovery gate check
        const rsi = trendData.rsi?.value ?? 50;
        const squeezeBreakoutForPreRecovery = isValidSqueezeBreakout(trendData, derivedDirection);
        
        // Check for deep pullback conditions (RSI + structure)
        const isDeepPullbackLong = derivedDirection === "long" && 
          rsi < PRE_RECOVERY_PARAMS.DEEP_PULLBACK_RSI_LONG;
        const isDeepPullbackShort = derivedDirection === "short" && 
          rsi > PRE_RECOVERY_PARAMS.DEEP_PULLBACK_RSI_SHORT;
        const hasDeepPullback = isDeepPullbackLong || isDeepPullbackShort;
        
        if (isPreRecovery && PRE_RECOVERY_PARAMS.BLOCK_CONTINUATION_WITHOUT_STRUCTURE) {
          // Pre-recovery requires either deep pullback OR valid squeeze breakout
          if (!hasDeepPullback && !squeezeBreakoutForPreRecovery.isValid) {
            rejectedByHardGates++;
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} PRE-RECOVERY GATE: Blocking entry - requires deep pullback OR squeeze breakout`);
            logger.forSymbol(symbol).debug(`   RSI=${rsi.toFixed(1)}, deepPullback=${hasDeepPullback}, squeeze=${squeezeBreakoutForPreRecovery.isValid}`);
            await logRejectionWithAI(
              supabase,
              userId,
              symbol,
              `PRE-RECOVERY GATE: Requires deep pullback (RSI) OR squeeze breakout`,
              {
                gate: "PRE_RECOVERY_STRUCTURE",
                consecutiveLosses,
                lossThreshold,
                rsi: rsi.toFixed(1),
                hasDeepPullback,
                squeezeValid: squeezeBreakoutForPreRecovery.isValid,
                squeezeReasons: squeezeBreakoutForPreRecovery.reasons,
                derivedDirection
              },
              trendData,
              riskParams.ai_analysis_enabled !== false,
              earlyOrderFlowAnalysis
            );
            continue;
          }
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} PRE-RECOVERY: Entry allowed via ${hasDeepPullback ? 'deep pullback' : 'squeeze breakout'}`);
        }
        
        // ============= PHASE 4 (9 FINDINGS): REGIME CONFIDENCE GATE =============
        // Finding 2: Block continuation entries when regimeScore < 45
        // Determine setup type for this signal
        const isPullbackSetup = hasDeepPullback || (rsi > 40 && rsi < 60);  // Basic pullback detection
        const isSqueezeSetup = squeezeBreakoutForPreRecovery.isValid;
        const isContinuationSetup = !isPullbackSetup && !isSqueezeSetup;
        
        if (isContinuationSetup && !regimeEnhanced.allowedSetups.includes('continuation')) {
          rejectedByHardGates++;
          perSymbolGateAttribution.set(symbol, { gate: 'REGIME_CONTINUATION_BLOCK', details: `regimeScore=${regimeEnhanced.regimeScore}` });
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} REGIME GATE: Continuation blocked (regimeScore=${regimeEnhanced.regimeScore} < ${REGIME_SCORE_PARAMS.BLOCK_CONTINUATION_BELOW})`);
          await logRejectionWithAI(
            supabase,
            userId,
            symbol,
            `REGIME GATE: Continuation entries blocked at regimeScore=${regimeEnhanced.regimeScore}`,
            {
              gate: "REGIME_CONTINUATION_BLOCK",
              regimeScore: regimeEnhanced.regimeScore,
              allowedSetups: regimeEnhanced.allowedSetups,
              setupType: 'continuation',
              threshold: REGIME_SCORE_PARAMS.BLOCK_CONTINUATION_BELOW,
              penalties: regimeEnhanced.penalties
            },
            trendData,
            riskParams.ai_analysis_enabled !== false,
            earlyOrderFlowAnalysis
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
          perSymbolGateAttribution.set(symbol, { gate: 'UNIFIED_REVERSAL_BLOCK', details: `score=${unifiedReversal.score}/100` });
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.REJECTION} Unified Reversal BLOCK (${unifiedReversal.score}/100) - ${unifiedReversal.reasons.slice(0, 3).join(", ")}`);
          await logRejectionWithAI(
            supabase,
            userId,
            symbol,
            `Unified Reversal BLOCK: score=${unifiedReversal.score}/100 - ${unifiedReversal.reasons.slice(0, 3).join(", ")}`,
            { 
              unifiedReversalScore: unifiedReversal.score,
              unifiedReversalRawScore: Object.values(unifiedReversal.breakdown || {}).reduce((sum: number, val) => sum + (Number(val) || 0), 0),
              unifiedReversalAdxWeight: unifiedReversal.adxWeight,
              decision: unifiedReversal.decision,
              direction: trend === "bullish" ? "long" : trend === "bearish" ? "short" : "unknown",
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
            riskParams.ai_analysis_enabled !== false,
            earlyOrderFlowAnalysis
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
        const stochRsiD1h = stochRsi1h?.d ?? 50;  // Added for pullback K/D turn detection
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
        
        // ============= NEW: ABSOLUTE STOCHRSI MAXIMUM HARD GATES =============
        // PLAN FIX C: Block trades against HTF StochRSI extremes - NO EXCEPTIONS
        // K >= 98 = at absolute maximum, no room to rise, BLOCK all LONG entries
        // K <= 2 = at absolute minimum, no room to fall, BLOCK all SHORT entries
        if (stochRsiK4h >= STOCHRSI_THRESHOLDS.ABSOLUTE_MAX_OVERBOUGHT) {
          // Block LONG entries at absolute maximum - StochRSI has nowhere to go
          if (derivedDirection === "long") {
            rejectedByStochRsiExtreme++;
            perSymbolGateAttribution.set(symbol, { gate: 'STOCHRSI_ABSOLUTE_MAX_OVERBOUGHT', details: `K=${stochRsiK4h.toFixed(1)} absolute max` });
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} HARD BLOCK - 4h StochRSI at absolute maximum (K=${stochRsiK4h.toFixed(1)} >= ${STOCHRSI_THRESHOLDS.ABSOLUTE_MAX_OVERBOUGHT}) - nowhere to rise, no exceptions allowed`);
            await logRejectionWithAI(
              supabase, userId, symbol,
              `PLAN FIX C - STOCHRSI ABSOLUTE BLOCK: LONG blocked at K=${stochRsiK4h.toFixed(1)} (absolute max >= ${STOCHRSI_THRESHOLDS.ABSOLUTE_MAX_OVERBOUGHT})`,
              { 
                gate: "STOCHRSI_ABSOLUTE_MAX_OVERBOUGHT",
                direction: "long",
                stochRsiK4h: stochRsiK4h.toFixed(1),
                threshold: STOCHRSI_THRESHOLDS.ABSOLUTE_MAX_OVERBOUGHT,
                message: "No exceptions - StochRSI at physical maximum has no room to rise"
              },
              trendData,
              riskParams.ai_analysis_enabled !== false,
              earlyOrderFlowAnalysis
            );
            continue;
          }
        }
        
        if (stochRsiK4h <= STOCHRSI_THRESHOLDS.ABSOLUTE_MAX_OVERSOLD) {
          // Block SHORT entries at absolute minimum - StochRSI has nowhere to go
          if (derivedDirection === "short") {
            rejectedByStochRsiExtreme++;
            perSymbolGateAttribution.set(symbol, { gate: 'STOCHRSI_ABSOLUTE_MAX_OVERSOLD', details: `K=${stochRsiK4h.toFixed(1)} absolute min` });
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} HARD BLOCK - 4h StochRSI at absolute minimum (K=${stochRsiK4h.toFixed(1)} <= ${STOCHRSI_THRESHOLDS.ABSOLUTE_MAX_OVERSOLD}) - nowhere to fall, no exceptions allowed`);
            await logRejectionWithAI(
              supabase, userId, symbol,
              `PLAN FIX C - STOCHRSI ABSOLUTE BLOCK: SHORT blocked at K=${stochRsiK4h.toFixed(1)} (absolute min <= ${STOCHRSI_THRESHOLDS.ABSOLUTE_MAX_OVERSOLD})`,
              { 
                gate: "STOCHRSI_ABSOLUTE_MAX_OVERSOLD",
                direction: "short",
                stochRsiK4h: stochRsiK4h.toFixed(1),
                threshold: STOCHRSI_THRESHOLDS.ABSOLUTE_MAX_OVERSOLD,
                message: "No exceptions - StochRSI at physical minimum has no room to fall"
              },
              trendData,
              riskParams.ai_analysis_enabled !== false,
              earlyOrderFlowAnalysis
            );
            continue;
          }
        }
        
        // ============= NEW: PLAN FIX B - REGIME-STRATEGY COMPATIBILITY CHECK =============
        // Block trend-following/directional strategies in ranging markets with ADX < 25 AND not rising
        // These strategies need momentum to work - in ranging markets they generate whipsaws
        const REGIME_STRATEGY_MIN_ADX = 25;
        const isRangingMarketForStrategies = adx < REGIME_STRATEGY_MIN_ADX && !smartAdxRising;
        const is4hNeutralWithLowConf = stochFilterTrend4h === "neutral" || stochFilterConf4h < 55;
        const isUnfavorableForDirectionalTrades = isRangingMarketForStrategies && is4hNeutralWithLowConf;
        
        // Track this for use in strategy evaluation - directional strategies will be blocked
        // but mean-reversion strategies will be allowed
        const regimeBlocksDirectionalStrategies = isUnfavorableForDirectionalTrades;
        
        if (regimeBlocksDirectionalStrategies) {
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} REGIME-STRATEGY CHECK: Ranging market (ADX=${adx.toFixed(1)} < ${REGIME_STRATEGY_MIN_ADX}, rising=${smartAdxRising}, 4h=${stochFilterTrend4h} ${stochFilterConf4h}%) - will block trend-following strategies`);
        }
        
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
          perSymbolGateAttribution.set(symbol, { gate: 'STOCHRSI_OVERBOUGHT_BLOCK', details: `K=${stochRsiK4h.toFixed(1)} absolute max` });
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} HARD BLOCK - 4h StochRSI at absolute maximum (K=${stochRsiK4h.toFixed(1)} >= ${ABSOLUTE_MAX_OB}) - nowhere to rise, no exceptions allowed`);
          await logRejectionWithAI(
            supabase, userId, symbol,
            `HARD BLOCK: StochRSI K=${stochRsiK4h.toFixed(1)} at absolute maximum (>=${ABSOLUTE_MAX_OB}) - no LONG entries allowed`,
            { 
              stochRsiK4h: stochRsiK4h.toFixed(1),
              stochRsiD4h: stochRsiD4h.toFixed(1),
              gate: "ABSOLUTE_MAX_STOCHRSI_HARD_BLOCK",
              direction: "long",
              threshold: ABSOLUTE_MAX_OB,
              message: "StochRSI at ceiling - nowhere to rise - no exceptions",
              reversal_score: unifiedReversal.score,
              reversal_raw_score: Object.values(unifiedReversal.breakdown || {}).reduce((sum: number, val) => sum + (Number(val) || 0), 0),
              reversal_adx_weight: unifiedReversal.adxWeight,
              reversal_decision: unifiedReversal.decision,
              reversal_breakdown: unifiedReversal.breakdown,
              reversal_reasons: unifiedReversal.reasons,
              trend,
              adx: adx.toFixed(1),
              momentum_state: momentum?.state,
              momentum_confirms: momentum?.confirms,
              percentB: percentB.toFixed(1),
              bollingerPosition
            },
            trendData,
            false,
            earlyOrderFlowAnalysis
          );
          continue;
        }
        
        if (intendedTradeDirection === "short" && stochRsiK4h <= ABSOLUTE_MAX_OS) {
          rejectedByStochRsiExtreme++;
          perSymbolGateAttribution.set(symbol, { gate: 'STOCHRSI_OVERSOLD_BLOCK', details: `K=${stochRsiK4h.toFixed(1)} absolute min` });
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} HARD BLOCK - 4h StochRSI at absolute minimum (K=${stochRsiK4h.toFixed(1)} <= ${ABSOLUTE_MAX_OS}) - nowhere to fall, no exceptions allowed`);
          await logRejectionWithAI(
            supabase, userId, symbol,
            `HARD BLOCK: StochRSI K=${stochRsiK4h.toFixed(1)} at absolute minimum (<=${ABSOLUTE_MAX_OS}) - no SHORT entries allowed`,
            { 
              stochRsiK4h: stochRsiK4h.toFixed(1),
              stochRsiD4h: stochRsiD4h.toFixed(1),
              gate: "ABSOLUTE_MIN_STOCHRSI_HARD_BLOCK",
              direction: "short",
              threshold: ABSOLUTE_MAX_OS,
              message: "StochRSI at floor - nowhere to fall - no exceptions",
              reversal_score: unifiedReversal.score,
              reversal_raw_score: Object.values(unifiedReversal.breakdown || {}).reduce((sum: number, val) => sum + (Number(val) || 0), 0),
              reversal_adx_weight: unifiedReversal.adxWeight,
              reversal_decision: unifiedReversal.decision,
              reversal_breakdown: unifiedReversal.breakdown,
              reversal_reasons: unifiedReversal.reasons,
              trend,
              adx: adx.toFixed(1),
              momentum_state: momentum?.state,
              momentum_confirms: momentum?.confirms,
              percentB: percentB.toFixed(1),
              bollingerPosition
            },
            trendData,
            false,
            earlyOrderFlowAnalysis
          );
          continue;
        }
        
        // ===== NEW: BOLLINGER BAND OVEREXTENSION GATE =====
        // Block LONG when price is extremely above upper Bollinger (percentB > 110) AND StochRSI >= 90
        // RELAXATION: For strong trends (ADX > 30, rising, HTF aligned), raise threshold to 120
        const adxRising = trendData.momentum?.adxRising === true || 
          (trendData.volatility?.adxSlope && trendData.volatility.adxSlope > 0);
        const htf4hAligned = htfTrend4h === (derivedDirection === "long" ? "bullish" : "bearish");
        const htf1hAligned = htfTrend1h === (derivedDirection === "long" ? "bullish" : "bearish");
        const isStrongTrendMode = STRONG_TREND_OVEREXTENSION_PARAMS.ENABLED &&
          adx >= STRONG_TREND_OVEREXTENSION_PARAMS.MIN_ADX &&
          (!STRONG_TREND_OVEREXTENSION_PARAMS.REQUIRE_ADX_RISING || adxRising) &&
          (!STRONG_TREND_OVEREXTENSION_PARAMS.REQUIRE_HTF_ALIGNMENT || (htf4hAligned && htf1hAligned));
        
        // Determine overextension threshold based on trend strength
        const overextensionThresholdLong = isStrongTrendMode 
          ? STRONG_TREND_OVEREXTENSION_PARAMS.PERCENT_B_THRESHOLD_LONG  // 120
          : 110;  // Default
        const overextensionThresholdShort = isStrongTrendMode 
          ? STRONG_TREND_OVEREXTENSION_PARAMS.PERCENT_B_THRESHOLD_SHORT  // -20
          : -10;  // Default
        
        let strongTrendOverextensionApplied = false;
        
        const isExtremelyOverextended = percentB > overextensionThresholdLong;
        if (intendedTradeDirection === "long" && isExtremelyOverextended && stochRsiK4h >= STOCHRSI_THRESHOLDS.EXTREME_OVERBOUGHT) {
          rejectedByStochRsiExtreme++;
          perSymbolGateAttribution.set(symbol, { gate: 'STOCHRSI_OVERBOUGHT_BLOCK', details: `K=${stochRsiK4h.toFixed(1)}, %B=${percentB.toFixed(1)} overext` });
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} BLOCK - Price extremely overextended (%B=${percentB.toFixed(1)} > ${overextensionThresholdLong}) with overbought StochRSI (K=${stochRsiK4h.toFixed(1)})`);
          await logRejectionWithAI(
            supabase, userId, symbol,
            `BLOCK: Price overextended (%B=${percentB.toFixed(1)} > ${overextensionThresholdLong}) + StochRSI K=${stochRsiK4h.toFixed(1)} overbought`,
            { 
              percentB: percentB.toFixed(1), 
              stochRsiK4h: stochRsiK4h.toFixed(1),
              gate: "BOLLINGER_OVEREXTENSION_GATE",
              direction: "long",
              threshold: overextensionThresholdLong,
              isStrongTrendMode,
              adx: adx.toFixed(1),
              adxRising,
              htf4hAligned,
              htf1hAligned,
              message: "Price extremely above upper Bollinger with overbought StochRSI"
            },
            trendData,
            false,
            earlyOrderFlowAnalysis
          );
          continue;
        }
        
        // Log if strong trend relaxation allowed entry that would have been blocked
        if (intendedTradeDirection === "long" && percentB > 110 && percentB <= overextensionThresholdLong && isStrongTrendMode) {
          strongTrendOverextensionApplied = true;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} STRONG TREND RELAXATION: Allowing LONG at %B=${percentB.toFixed(1)} (threshold raised to ${overextensionThresholdLong} due to ADX=${adx.toFixed(1)} rising=${adxRising})`);
        }
        
        // Block SHORT when price is extremely below lower Bollinger (percentB < threshold) AND StochRSI <= 10
        const isExtremelyUnderextended = percentB < overextensionThresholdShort;
        if (intendedTradeDirection === "short" && isExtremelyUnderextended && stochRsiK4h <= STOCHRSI_THRESHOLDS.EXTREME_OVERSOLD) {
          rejectedByStochRsiExtreme++;
          perSymbolGateAttribution.set(symbol, { gate: 'STOCHRSI_OVERSOLD_BLOCK', details: `K=${stochRsiK4h.toFixed(1)}, %B=${percentB.toFixed(1)} underext` });
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} BLOCK - Price extremely underextended (%B=${percentB.toFixed(1)} < ${overextensionThresholdShort}) with oversold StochRSI (K=${stochRsiK4h.toFixed(1)})`);
          await logRejectionWithAI(
            supabase, userId, symbol,
            `BLOCK: Price underextended (%B=${percentB.toFixed(1)} < ${overextensionThresholdShort}) + StochRSI K=${stochRsiK4h.toFixed(1)} oversold`,
            { 
              percentB: percentB.toFixed(1), 
              stochRsiK4h: stochRsiK4h.toFixed(1),
              gate: "BOLLINGER_UNDEREXTENSION_GATE",
              direction: "short",
              threshold: overextensionThresholdShort,
              isStrongTrendMode,
              adx: adx.toFixed(1),
              adxRising,
              message: "Price extremely below lower Bollinger with oversold StochRSI"
            },
            trendData,
            false,
            earlyOrderFlowAnalysis
          );
          continue;
        }
        
        // Log if strong trend relaxation allowed short entry
        if (intendedTradeDirection === "short" && percentB < -10 && percentB >= overextensionThresholdShort && isStrongTrendMode) {
          strongTrendOverextensionApplied = true;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} STRONG TREND RELAXATION: Allowing SHORT at %B=${percentB.toFixed(1)} (threshold lowered to ${overextensionThresholdShort} due to ADX=${adx.toFixed(1)} rising=${adxRising})`);
        }
        
        // ============= IMPROVEMENT 1: HTF OVERSOLD/OVERBOUGHT HARD GATE =============
        // Global rule for ALL strategies: Block counter-trend continuation at 4h extremes
        // This is market structure, not indicator noise - prevents trading against probability asymmetry
        const isHTFOversold = stochRsiK4h <= HTF_EXTREME_HARD_GATES.STOCHRSI_OVERSOLD_BLOCK && 
                              percentB <= HTF_EXTREME_HARD_GATES.PERCENT_B_OVERSOLD_BLOCK;
        const isHTFOverbought = stochRsiK4h >= HTF_EXTREME_HARD_GATES.STOCHRSI_OVERBOUGHT_BLOCK && 
                                percentB >= HTF_EXTREME_HARD_GATES.PERCENT_B_OVERBOUGHT_BLOCK;
        
        // ============= NEW: STRONG TREND HTF BYPASS CHECK =============
        // Allow bypass when trend is very strong and no exhaustion signals
        const adxRisingForBypass = trendData.volatility?.adxRising ?? false;
        const tf30m = trendData.timeframes?.['30m'];
        const allTimeframesAligned = (() => {
          // Check if 4h, 1h, and 30m are all aligned in same direction
          const tf4hDir = stochFilterTrend4h;
          const tf1hDir = stochFilterTrend1h;
          const tf30mDir = tf30m?.trend || tf30m?.indicators?.emaSignal || "neutral";
          
          if (intendedTradeDirection === "long") {
            return tf4hDir === "bullish" && tf1hDir === "bullish" && tf30mDir === "bullish";
          } else if (intendedTradeDirection === "short") {
            return tf4hDir === "bearish" && tf1hDir === "bearish" && tf30mDir === "bearish";
          }
          return false;
        })();
        
        // Detect trend exhaustion (actual reversal likely vs just overbought in strong trend)
        const isExhausted = (() => {
          if (!TREND_EXHAUSTION_PARAMS.ENABLED) return false;
          
          // Check if StochRSI K is at extreme AND decreasing
          const isAtExtreme = intendedTradeDirection === "long" 
            ? stochRsiK4h >= TREND_EXHAUSTION_PARAMS.STOCHRSI_EXTREME_THRESHOLD
            : stochRsiK4h <= (100 - TREND_EXHAUSTION_PARAMS.STOCHRSI_EXTREME_THRESHOLD);
          
          const stochRsiDecreasing = TREND_EXHAUSTION_PARAMS.STOCHRSI_K_DECREASING 
            ? (intendedTradeDirection === "long" ? stochRsiK4h < stochRsiD4h : stochRsiK4h > stochRsiD4h)
            : false;
          
          // ADX declining from peak indicates momentum waning
          const adxDeclining = !adxRisingForBypass && adx < TREND_EXHAUSTION_PARAMS.ADX_DECLINE_FROM_PEAK;
          
          // Exhaustion = extreme + decreasing + (optional: ADX declining)
          return isAtExtreme && stochRsiDecreasing && adxDeclining;
        })();
        
        // Determine if strong trend bypass should apply
        let strongTrendHTFBypassApplied = false;
        let trendContinuationPositionMultiplier = 1.0;
        
        const canBypassHTFGate = STRONG_TREND_HTF_BYPASS_PARAMS.ENABLED &&
          adx >= STRONG_TREND_HTF_BYPASS_PARAMS.MIN_ADX &&
          (!STRONG_TREND_HTF_BYPASS_PARAMS.REQUIRE_ADX_RISING || adxRisingForBypass) &&
          unifiedReversal.score < STRONG_TREND_HTF_BYPASS_PARAMS.MAX_REVERSAL_SCORE &&
          (!STRONG_TREND_HTF_BYPASS_PARAMS.REQUIRE_ALL_TF_ALIGNED || allTimeframesAligned) &&
          !isExhausted;
        
        // Block SHORT continuation at 4h oversold (bounce is statistically likely)
        if (intendedTradeDirection === "short" && isHTFOversold) {
          if (canBypassHTFGate) {
            // Allow with reduced position size
            strongTrendHTFBypassApplied = true;
            trendContinuationPositionMultiplier = STRONG_TREND_HTF_BYPASS_PARAMS.POSITION_SIZE_MULTIPLIER;
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} STRONG TREND HTF BYPASS: Allowing SHORT at 4h oversold`);
            logger.forSymbol(symbol).info(`   ADX=${adx.toFixed(1)} rising=${adxRisingForBypass}, reversal=${unifiedReversal.score}, allTFsAligned=${allTimeframesAligned}, exhausted=${isExhausted}`);
            logger.forSymbol(symbol).info(`   Position size reduced to ${(trendContinuationPositionMultiplier * 100).toFixed(0)}%`);
          } else {
            rejectedByHardGates++;
            perSymbolGateAttribution.set(symbol, { gate: 'HTF_EXTREME_OVERSOLD_BLOCK', details: `K=${stochRsiK4h.toFixed(1)}, %B=${percentB.toFixed(1)}` });
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} HTF EXTREME GATE - Blocking SHORT at 4h oversold (StochRSI K=${stochRsiK4h.toFixed(1)} <= ${HTF_EXTREME_HARD_GATES.STOCHRSI_OVERSOLD_BLOCK}, %B=${percentB.toFixed(1)} <= ${HTF_EXTREME_HARD_GATES.PERCENT_B_OVERSOLD_BLOCK})`);

            if (!canBypassHTFGate) {
              logger.forSymbol(symbol).debug(`   Bypass check failed: ADX=${adx.toFixed(1)}>=${STRONG_TREND_HTF_BYPASS_PARAMS.MIN_ADX}? rising=${adxRisingForBypass}, reversal=${unifiedReversal.score}<${STRONG_TREND_HTF_BYPASS_PARAMS.MAX_REVERSAL_SCORE}?, TFsAligned=${allTimeframesAligned}, exhausted=${isExhausted}`);
            }
            await logRejectionWithAI(
              supabase, userId, symbol,
              `IMPROVEMENT 1 - HTF EXTREME GATE: SHORT blocked at 4h oversold (K=${stochRsiK4h.toFixed(1)}, %B=${percentB.toFixed(1)})`,
              { 
                gate: "HTF_EXTREME_OVERSOLD_BLOCK",
                direction: "short",
                stochRsiK4h: stochRsiK4h.toFixed(1),
                percentB: percentB.toFixed(1),
                thresholds: {
                  stochRsiK_threshold: HTF_EXTREME_HARD_GATES.STOCHRSI_OVERSOLD_BLOCK,
                  percentB_threshold: HTF_EXTREME_HARD_GATES.PERCENT_B_OVERSOLD_BLOCK
                },
                bypassCheck: {
                  adx: adx.toFixed(1),
                  adxRising: adxRisingForBypass,
                  reversalScore: unifiedReversal.score,
                  allTimeframesAligned,
                  isExhausted,
                  canBypass: false
                },
                message: "Bounce statistically likely at 4h oversold - blocking SHORT continuation"
              },
              trendData,
              false,
              earlyOrderFlowAnalysis
            );
            continue;
          }
        }
        
        // Block LONG continuation at 4h overbought (reversal is statistically likely)
        if (intendedTradeDirection === "long" && isHTFOverbought) {
          if (canBypassHTFGate) {
            // Allow with reduced position size
            strongTrendHTFBypassApplied = true;
            trendContinuationPositionMultiplier = STRONG_TREND_HTF_BYPASS_PARAMS.POSITION_SIZE_MULTIPLIER;
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} STRONG TREND HTF BYPASS: Allowing LONG at 4h overbought`);
            logger.forSymbol(symbol).info(`   ADX=${adx.toFixed(1)} rising=${adxRisingForBypass}, reversal=${unifiedReversal.score}, allTFsAligned=${allTimeframesAligned}, exhausted=${isExhausted}`);
            logger.forSymbol(symbol).info(`   Position size reduced to ${(trendContinuationPositionMultiplier * 100).toFixed(0)}%`);
          } else {
            rejectedByHardGates++;
            perSymbolGateAttribution.set(symbol, { gate: 'HTF_EXTREME_OVERBOUGHT_BLOCK', details: `K=${stochRsiK4h.toFixed(1)}, %B=${percentB.toFixed(1)}` });
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} HTF EXTREME GATE - Blocking LONG at 4h overbought (StochRSI K=${stochRsiK4h.toFixed(1)} >= ${HTF_EXTREME_HARD_GATES.STOCHRSI_OVERBOUGHT_BLOCK}, %B=${percentB.toFixed(1)} >= ${HTF_EXTREME_HARD_GATES.PERCENT_B_OVERBOUGHT_BLOCK})`);

            if (!canBypassHTFGate) {
              logger.forSymbol(symbol).debug(`   Bypass check failed: ADX=${adx.toFixed(1)}>=${STRONG_TREND_HTF_BYPASS_PARAMS.MIN_ADX}? rising=${adxRisingForBypass}, reversal=${unifiedReversal.score}<${STRONG_TREND_HTF_BYPASS_PARAMS.MAX_REVERSAL_SCORE}?, TFsAligned=${allTimeframesAligned}, exhausted=${isExhausted}`);
            }
            await logRejectionWithAI(
              supabase, userId, symbol,
              `IMPROVEMENT 1 - HTF EXTREME GATE: LONG blocked at 4h overbought (K=${stochRsiK4h.toFixed(1)}, %B=${percentB.toFixed(1)})`,
              { 
                gate: "HTF_EXTREME_OVERBOUGHT_BLOCK",
                direction: "long",
                stochRsiK4h: stochRsiK4h.toFixed(1),
                percentB: percentB.toFixed(1),
                thresholds: {
                  stochRsiK_threshold: HTF_EXTREME_HARD_GATES.STOCHRSI_OVERBOUGHT_BLOCK,
                  percentB_threshold: HTF_EXTREME_HARD_GATES.PERCENT_B_OVERBOUGHT_BLOCK
                },
                bypassCheck: {
                  adx: adx.toFixed(1),
                  adxRising: adxRisingForBypass,
                  reversalScore: unifiedReversal.score,
                  allTimeframesAligned,
                  isExhausted,
                  canBypass: false
                },
                message: "Reversal statistically likely at 4h overbought - blocking LONG continuation"
              },
              trendData,
              false,
              earlyOrderFlowAnalysis
            );
            continue;
          }
        }
        
        // ============= NEW: TREND ACCELERATION DETECTION =============
        // Detect strong price moves (2.5%+) that should bypass momentum/Bollinger gates
        // This addresses the AVAXUSDT miss - 9% move blocked because ADX was 21-23 during acceleration
        const priceActionMomentum = trendData.priceActionMomentum;
        const priceMove = priceActionMomentum?.movePercent || 0;
        const priceDirection = priceActionMomentum?.direction || "none";
        const hasStrongMove = priceActionMomentum?.hasStrongMove || false;
        
        // Calculate trend acceleration eligibility
        const isTrendAccelerationEnabled = TREND_ACCELERATION_PARAMS.ENABLED;
        const meetsMinPriceMove = Math.abs(priceMove) >= TREND_ACCELERATION_PARAMS.MIN_PRICE_MOVE_PERCENT;
        const isStrongPriceMove = Math.abs(priceMove) >= TREND_ACCELERATION_PARAMS.STRONG_PRICE_MOVE_PERCENT;
        const adxRisingForAcceleration = smartAdxRising || (trendData.volatility?.adxRising ?? false);
        const meetsMinAdxForAcceleration = adx >= TREND_ACCELERATION_PARAMS.MIN_ADX_FOR_MOMENTUM_BYPASS;
        const adxCrossingBuildingThreshold = adx >= TREND_ACCELERATION_PARAMS.ADX_BUILDING_THRESHOLD;
        
        // Direction must match derived direction
        const priceDirectionMatchesTrade = (
          (derivedDirection === "long" && priceDirection === "bullish") ||
          (derivedDirection === "short" && priceDirection === "bearish")
        );
        
        // StochRSI safety checks for acceleration entries
        const stochRsiSafeForLongAcceleration = stochRsiK4h < TREND_ACCELERATION_PARAMS.MAX_STOCHRSI_K_FOR_LONG;
        const stochRsiSafeForShortAcceleration = stochRsiK4h > TREND_ACCELERATION_PARAMS.MIN_STOCHRSI_K_FOR_SHORT;
        const stochRsiSafeForAcceleration = derivedDirection === "long" 
          ? stochRsiSafeForLongAcceleration 
          : stochRsiSafeForShortAcceleration;
        
        // 4h confidence check
        const meets4hConfForAcceleration = stochFilterConf4h >= TREND_ACCELERATION_PARAMS.MIN_4H_CONFIDENCE;
        
        // HTF alignment bonus - if 4h trend matches, we can relax StochRSI limits
        const htfMatchesDirection = (
          (derivedDirection === "long" && stochFilterTrend4h === "bullish") ||
          (derivedDirection === "short" && stochFilterTrend4h === "bearish")
        );
        const relaxedStochRsiForHTFMatch = htfMatchesDirection && TREND_ACCELERATION_PARAMS.HTF_MATCH_RELAXES_STOCHRSI;
        
        // Final acceleration eligibility
        const qualifiesForTrendAcceleration = isTrendAccelerationEnabled &&
          meetsMinPriceMove &&
          priceDirectionMatchesTrade &&
          (adxRisingForAcceleration || adxCrossingBuildingThreshold) &&
          meetsMinAdxForAcceleration &&
          (stochRsiSafeForAcceleration || relaxedStochRsiForHTFMatch) &&
          meets4hConfForAcceleration;
        
        // Position size multiplier for acceleration entries
        let trendAccelerationPositionMultiplier = 1.0;
        if (qualifiesForTrendAcceleration) {
          trendAccelerationPositionMultiplier = TREND_ACCELERATION_PARAMS.POSITION_SIZE_MULTIPLIER;
          
          // Extra reduction for very overextended moves
          if (Math.abs(priceMove) >= TREND_ACCELERATION_PARAMS.OVEREXTENDED_MOVE_PERCENT) {
            trendAccelerationPositionMultiplier = TREND_ACCELERATION_PARAMS.OVEREXTENDED_POSITION_MULTIPLIER;
          }
          
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.MOMENTUM} 🚀 TREND ACCELERATION DETECTED: ${priceMove.toFixed(1)}% ${priceDirection} move`);
          logger.forSymbol(symbol).info(`   → ADX=${adx.toFixed(1)} rising=${adxRisingForAcceleration}, StochRSI K=${stochRsiK4h.toFixed(1)}, 4h=${stochFilterTrend4h} ${stochFilterConf4h.toFixed(0)}%`);
          logger.forSymbol(symbol).info(`   → Position size: ${(trendAccelerationPositionMultiplier * 100).toFixed(0)}% (acceleration entry)`);
        }
        
        // ============= IMPROVEMENT 2: BOLLINGER POSITION FILTER (CONTEXT-AWARE) =============
        // Base rule: Shorts below lower Bollinger are risky (mean reversion bounce)
        // Exception: In confirmed bearish trends, low %B indicates trend continuation - shorts are VALID
        // Same logic applies symmetrically for longs at high %B
        // NEW: Trend acceleration can bypass Bollinger gates
        const isInSqueeze4h = trendData.bollingerBands?.['4h']?.squeeze || 
                              (trendData.bb?.['4h']?.squeezePercent ?? 0) > SQUEEZE_CONTEXT_PARAMS.MIN_SQUEEZE_PERCENT_4H;
        const isRangingMarket = adx < BOLLINGER_ENTRY_GATES.RANGING_ADX_THRESHOLD;
        
        // Determine if we have trend confirmation for context-aware thresholds
        // FIX: Add 1h trend override - when 4h is neutral but 1h is very strong (75%+), use 1h for confirmation
        // Note: stochFilterTrend1h and stochFilterConf1h already declared above
        const is1hVeryStrongBullish = stochFilterTrend1h === "bullish" && stochFilterConf1h >= 75;
        const is1hVeryStrongBearish = stochFilterTrend1h === "bearish" && stochFilterConf1h >= 75;
        
        // Allow 4h OR very strong 1h to satisfy trend confirmation
        // NEW: Trend acceleration also satisfies trend confirmation
        const isBearishTrendConfirmed = (stochFilterTrend4h === "bearish" && stochFilterConf4h >= BOLLINGER_ENTRY_GATES.TREND_CONFIDENCE_THRESHOLD) ||
                                        (stochFilterTrend4h === "neutral" && is1hVeryStrongBearish) ||
                                        (qualifiesForTrendAcceleration && derivedDirection === "short");
        const isStrongBearishTrend = isBearishTrendConfirmed && adx >= ADX_THRESHOLDS.MODERATE; // ADX >= 22
        const isBullishTrendConfirmed = (stochFilterTrend4h === "bullish" && stochFilterConf4h >= BOLLINGER_ENTRY_GATES.TREND_CONFIDENCE_THRESHOLD) ||
                                        (stochFilterTrend4h === "neutral" && is1hVeryStrongBullish) ||
                                        (qualifiesForTrendAcceleration && derivedDirection === "long");
        const isStrongBullishTrend = isBullishTrendConfirmed && adx >= ADX_THRESHOLDS.MODERATE;
        
        // SHORT gate: Determine appropriate %B threshold based on trend, squeeze, and ranging
        let shortMinPercentB: number;
        if (isStrongBearishTrend) {
          // Strong bearish trend: allow shorts much lower (trend continuation)
          shortMinPercentB = BOLLINGER_ENTRY_GATES.SHORT_STRONG_BEARISH_MIN_PERCENT_B; // 5
        } else if (isBearishTrendConfirmed) {
          // Confirmed bearish: allow shorts lower (trend continuation)
          shortMinPercentB = BOLLINGER_ENTRY_GATES.SHORT_BEARISH_TREND_MIN_PERCENT_B; // 15
        } else if (isInSqueeze4h && isRangingMarket) {
          // Squeeze + ranging = use relaxed threshold (genuine range, not trend exhaustion)
          shortMinPercentB = BOLLINGER_ENTRY_GATES.SHORT_SQUEEZE_RANGING_MIN_PERCENT_B; // 40
        } else if (isInSqueeze4h) {
          // Squeeze without ranging = use strict threshold (possible trend continuation)
          shortMinPercentB = BOLLINGER_ENTRY_GATES.SHORT_SQUEEZE_MIN_PERCENT_B; // 50
        } else {
          // No squeeze, no confirmed trend = use base threshold
          shortMinPercentB = BOLLINGER_ENTRY_GATES.SHORT_MIN_PERCENT_B; // 35
        }
        
        if (intendedTradeDirection === "short" && percentB < shortMinPercentB) {
          rejectedByHardGates++;
          const trendContext = isStrongBearishTrend ? " (strong bearish trend)" : 
                               isBearishTrendConfirmed ? " (bearish trend)" :
                               isInSqueeze4h ? (isRangingMarket ? " (ranging squeeze)" : " (squeeze)") : "";
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} BOLLINGER POSITION FILTER - Blocking SHORT at %B=${percentB.toFixed(1)} < ${shortMinPercentB}${trendContext}`);
          await logRejectionWithAI(
            supabase, userId, symbol,
            `IMPROVEMENT 2 - BOLLINGER GATE: SHORT blocked at %B=${percentB.toFixed(1)} < ${shortMinPercentB}${trendContext}`,
            { 
              gate: "BOLLINGER_POSITION_FILTER_SHORT",
              direction: "short",
              percentB: percentB.toFixed(1),
              requiredPercentB: shortMinPercentB,
              isInSqueeze4h,
              isRangingMarket,
              isBearishTrendConfirmed,
              isStrongBearishTrend,
              stochFilterTrend4h,
              stochFilterConf4h: stochFilterConf4h.toFixed(1),
              adx: adx.toFixed(1),
              message: "Shorts at low %B blocked - no bearish trend confirmation"
            },
            trendData,
            false,
            earlyOrderFlowAnalysis
          );
          continue;
        }
        
        // Log if trend context allowed a SHORT that would otherwise be blocked
        if (intendedTradeDirection === "short" && 
            percentB < BOLLINGER_ENTRY_GATES.SHORT_MIN_PERCENT_B && 
            (isBearishTrendConfirmed || isStrongBearishTrend)) {
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} TREND CONTEXT RELAXATION: Allowing SHORT at %B=${percentB.toFixed(1)} (4h bearish ${stochFilterConf4h.toFixed(0)}%, ADX=${adx.toFixed(1)})`);
        }
        
        // LONG gate: Determine appropriate %B threshold based on trend, squeeze, and ranging
        let longMaxPercentB: number;
        if (isStrongBullishTrend) {
          // Strong bullish trend: allow longs much higher (trend continuation)
          longMaxPercentB = BOLLINGER_ENTRY_GATES.LONG_STRONG_BULLISH_MAX_PERCENT_B; // 95
        } else if (isBullishTrendConfirmed) {
          // Confirmed bullish: allow longs higher (trend continuation)
          longMaxPercentB = BOLLINGER_ENTRY_GATES.LONG_BULLISH_TREND_MAX_PERCENT_B; // 85
        } else if (isInSqueeze4h && isRangingMarket) {
          // Squeeze + ranging = use relaxed threshold
          longMaxPercentB = BOLLINGER_ENTRY_GATES.LONG_SQUEEZE_RANGING_MAX_PERCENT_B; // 60
        } else if (isInSqueeze4h) {
          // Squeeze without ranging = use strict threshold
          longMaxPercentB = BOLLINGER_ENTRY_GATES.LONG_SQUEEZE_MAX_PERCENT_B; // 50
        } else {
          // No squeeze, no confirmed trend = use base threshold
          longMaxPercentB = BOLLINGER_ENTRY_GATES.LONG_MAX_PERCENT_B; // 65
        }
        
        if (intendedTradeDirection === "long" && percentB > longMaxPercentB) {
          rejectedByHardGates++;
          const trendContext = isStrongBullishTrend ? " (strong bullish trend)" : 
                               isBullishTrendConfirmed ? " (bullish trend)" :
                               isInSqueeze4h ? (isRangingMarket ? " (ranging squeeze)" : " (squeeze)") : "";
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} BOLLINGER POSITION FILTER - Blocking LONG at %B=${percentB.toFixed(1)} > ${longMaxPercentB}${trendContext}`);
          await logRejectionWithAI(
            supabase, userId, symbol,
            `IMPROVEMENT 2 - BOLLINGER GATE: LONG blocked at %B=${percentB.toFixed(1)} > ${longMaxPercentB}${trendContext}`,
            { 
              gate: "BOLLINGER_POSITION_FILTER_LONG",
              direction: "long",
              percentB: percentB.toFixed(1),
              requiredPercentB: longMaxPercentB,
              isInSqueeze4h,
              isRangingMarket,
              isBullishTrendConfirmed,
              isStrongBullishTrend,
              stochFilterTrend4h,
              stochFilterConf4h: stochFilterConf4h.toFixed(1),
              adx: adx.toFixed(1),
              message: "Longs at high %B blocked - no bullish trend confirmation"
            },
            trendData,
            false,
            earlyOrderFlowAnalysis
          );
          continue;
        }
        
        // Log if trend context allowed a LONG that would otherwise be blocked
        if (intendedTradeDirection === "long" && 
            percentB > BOLLINGER_ENTRY_GATES.LONG_MAX_PERCENT_B && 
            (isBullishTrendConfirmed || isStrongBullishTrend)) {
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} TREND CONTEXT RELAXATION: Allowing LONG at %B=${percentB.toFixed(1)} (4h bullish ${stochFilterConf4h.toFixed(0)}%, ADX=${adx.toFixed(1)})`);
        }
        
        // ============= IMPROVEMENT 3: SQUEEZE CONTEXT ARBITRATION =============
        // Squeeze defines regime, not entry - regime must constrain strategy choice
        // When 4h squeeze active + StochRSI extreme, context becomes MEAN_REVERSION
        const determineMarketContext = (): MarketContext => {
          const squeezeActive4h = (trendData.bb?.['4h']?.squeezePercent ?? 0) >= SQUEEZE_CONTEXT_PARAMS.MIN_SQUEEZE_PERCENT_4H ||
                                  trendData.bollingerBands?.['4h']?.squeeze === true;
          
          if (squeezeActive4h && stochRsiK4h <= SQUEEZE_CONTEXT_PARAMS.STOCHRSI_OVERSOLD_FOR_MEAN_REVERSION) {
            return 'MEAN_REVERSION'; // Bullish reversal context - favor longs
          }
          if (squeezeActive4h && stochRsiK4h >= SQUEEZE_CONTEXT_PARAMS.STOCHRSI_OVERBOUGHT_FOR_MEAN_REVERSION) {
            return 'MEAN_REVERSION'; // Bearish reversal context - favor shorts
          }
          return 'TREND_CONTINUATION';
        };
        
        const marketContext = determineMarketContext();
        
        // Block trend-continuation shorts in MEAN_REVERSION (oversold) context
        if (marketContext === 'MEAN_REVERSION' && 
            stochRsiK4h <= SQUEEZE_CONTEXT_PARAMS.STOCHRSI_OVERSOLD_FOR_MEAN_REVERSION && 
            intendedTradeDirection === "short") {
          rejectedByHardGates++;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} CONTEXT GATE - Blocking SHORT in MEAN_REVERSION context (4h squeeze + oversold K=${stochRsiK4h.toFixed(1)})`);
          await logRejectionWithAI(
            supabase, userId, symbol,
            `IMPROVEMENT 3 - CONTEXT GATE: SHORT blocked in MEAN_REVERSION context (squeeze + oversold K=${stochRsiK4h.toFixed(1)})`,
            { 
              gate: "SQUEEZE_CONTEXT_MEAN_REVERSION",
              direction: "short",
              marketContext,
              stochRsiK4h: stochRsiK4h.toFixed(1),
              isInSqueeze4h,
              message: "4h squeeze + oversold StochRSI = MEAN_REVERSION context, blocking trend-continuation shorts"
            },
            trendData,
            false,
            earlyOrderFlowAnalysis
          );
          continue;
        }
        
        // Block trend-continuation longs in MEAN_REVERSION (overbought) context
        if (marketContext === 'MEAN_REVERSION' && 
            stochRsiK4h >= SQUEEZE_CONTEXT_PARAMS.STOCHRSI_OVERBOUGHT_FOR_MEAN_REVERSION && 
            intendedTradeDirection === "long") {
          rejectedByHardGates++;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} CONTEXT GATE - Blocking LONG in MEAN_REVERSION context (4h squeeze + overbought K=${stochRsiK4h.toFixed(1)})`);
          await logRejectionWithAI(
            supabase, userId, symbol,
            `IMPROVEMENT 3 - CONTEXT GATE: LONG blocked in MEAN_REVERSION context (squeeze + overbought K=${stochRsiK4h.toFixed(1)})`,
            { 
              gate: "SQUEEZE_CONTEXT_MEAN_REVERSION",
              direction: "long",
              marketContext,
              stochRsiK4h: stochRsiK4h.toFixed(1),
              isInSqueeze4h,
              message: "4h squeeze + overbought StochRSI = MEAN_REVERSION context, blocking trend-continuation longs"
            },
            trendData,
            false,
            earlyOrderFlowAnalysis
          );
          continue;
        }
        
        // Log market context for debugging
        if (marketContext === 'MEAN_REVERSION') {
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} Market context: MEAN_REVERSION (squeeze + extreme StochRSI) - ${intendedTradeDirection} allowed`);
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
          // ============= MOMENTUM CONTINUATION EXCEPTION =============
          // Allow LONG entries even when StochRSI is not rising if:
          // 1. Price action shows strong recent upward movement (2%+ in 6h)
          // 2. ADX confirms trend strength (>= 25)
          // 3. 4h confidence is bullish (>= 60%)
          // 4. No bearish divergence (price still making higher highs)
          // This prevents missing continuation opportunities just because K <= D
          const priceActionMomentumLong = trendData.priceActionMomentum;
          const hasPriceActionMomentumUp = priceActionMomentumLong?.hasStrongMove && 
            priceActionMomentumLong?.direction === "bullish" &&
            Math.abs(priceActionMomentumLong?.movePercent || 0) >= MOMENTUM_CONTINUATION_PARAMS.PRICE_MOVE_THRESHOLD_PERCENT;
          
          const barsAtExtreme4hLong = trendData.stochasticRsi?.barsAtExtreme?.["4h"] || 0;
          const notTrueExhaustionLong = barsAtExtreme4hLong < MOMENTUM_CONTINUATION_PARAMS.MIN_BARS_AT_EXTREME_FOR_BLOCK;
          
          const momentumContinuationAllowedLong = MOMENTUM_CONTINUATION_PARAMS.ENABLED &&
            hasPriceActionMomentumUp &&
            adx >= MOMENTUM_CONTINUATION_PARAMS.MIN_ADX_FOR_OVERRIDE &&
            stochFilterTrend4h === "bullish" &&
            stochFilterConf4h >= MOMENTUM_CONTINUATION_PARAMS.MIN_4H_CONFIDENCE &&
            !hasBearishDivergence &&
            notTrueExhaustionLong;
          
          // MANDATORY: StochRSI must be rising (K > D) for any extreme overbought entry
          // EXCEPTION: Allow if momentum continuation conditions are met
          if (!stochRsiRising && !momentumContinuationAllowedLong) {
            rejectedByStochRsiExtreme++;
            perSymbolGateAttribution.set(symbol, { gate: 'STOCHRSI_OVERBOUGHT_BLOCK', details: `K=${stochRsiK4h.toFixed(1)} not rising` });
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} Blocking LONG - StochRSI not rising at overbought (K=${stochRsiK4h.toFixed(1)}, D=${stochRsiD4h.toFixed(1)})`);
            await logRejectionWithAI(
              supabase, userId, symbol,
              `StochRSI extreme: K=${stochRsiK4h.toFixed(1)} overbought, StochRSI NOT rising (K <= D)`,
              { 
                stochRsiK4h, stochRsiD4h, stochRsiRising, 
                gate: "STOCHRSI_NOT_RISING", 
                direction: "long",
                priceActionMomentum: priceActionMomentumLong || null,
                barsAtExtreme4h: barsAtExtreme4hLong,
                momentumContinuationCheck: {
                  enabled: MOMENTUM_CONTINUATION_PARAMS.ENABLED,
                  hasPriceActionMomentumUp,
                  adxSufficient: adx >= MOMENTUM_CONTINUATION_PARAMS.MIN_ADX_FOR_OVERRIDE,
                  confidenceSufficient: stochFilterConf4h >= MOMENTUM_CONTINUATION_PARAMS.MIN_4H_CONFIDENCE,
                  noDivergence: !hasBearishDivergence,
                  notExhausted: notTrueExhaustionLong,
                  result: momentumContinuationAllowedLong
                }
              },
              trendData,
              false,
              earlyOrderFlowAnalysis
            );
            continue;
          }
          
          // If momentum continuation allowed, apply position size reduction and log
          // NEW: RSI momentum zone validation for MOMENTUM_CONTINUATION entries
          // LONG momentum zone: 45-65 (neutral-to-bullish bias)
          // SHORT momentum zone: 35-55 (bearish-to-neutral bias)
          // Entries outside these zones get 25% additional position reduction
          if (momentumContinuationAllowedLong && !stochRsiRising) {
            const rsi4h = trendData.timeframes?.['4h']?.indicators?.rsi ?? 50;
            const rsiInMomentumZone = rsi4h >= 45 && rsi4h <= 65; // LONG zone
            
            if (rsiInMomentumZone) {
              reversalPositionMultiplier = Math.min(reversalPositionMultiplier, MOMENTUM_CONTINUATION_PARAMS.POSITION_SIZE_MULTIPLIER);
              logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} MOMENTUM CONTINUATION: Allowing LONG at overbought (K=${stochRsiK4h.toFixed(1)}, K<=D) with RSI ${rsi4h.toFixed(1)} in zone [45-65]`);
            } else {
              // RSI outside optimal zone - apply 25% additional reduction
              const outsideZoneMultiplier = MOMENTUM_CONTINUATION_PARAMS.POSITION_SIZE_MULTIPLIER * 0.75;
              reversalPositionMultiplier = Math.min(reversalPositionMultiplier, outsideZoneMultiplier);
              logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.SUCCESS} MOMENTUM CONTINUATION: Allowing LONG at overbought with RSI ${rsi4h.toFixed(1)} OUTSIDE zone [45-65] - extra 25% reduction`);
            }
            logger.forSymbol(symbol).info(`   Price moved ${priceActionMomentumLong?.movePercent?.toFixed(2)}% ${priceActionMomentumLong?.direction}, ADX=${adx.toFixed(1)}, bars@extreme=${barsAtExtreme4hLong}`);
            logger.forSymbol(symbol).info(`   Position size reduced to ${(reversalPositionMultiplier * 100).toFixed(0)}%`);
          }
          
          // MANDATORY: No bearish divergence allowed at extreme overbought
          if (hasBearishDivergence) {
            rejectedByStochRsiExtreme++;
            perSymbolGateAttribution.set(symbol, { gate: 'BEARISH_DIVERGENCE_AT_EXTREME', details: `K=${stochRsiK4h.toFixed(1)}` });
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} Blocking LONG - Bearish divergence at overbought (K=${stochRsiK4h.toFixed(1)})`);
            await logRejectionWithAI(
              supabase, userId, symbol,
              `StochRSI extreme: K=${stochRsiK4h.toFixed(1)} overbought with bearish divergence`,
              { stochRsiK4h, hasBearishDivergence: true, gate: "BEARISH_DIVERGENCE_AT_EXTREME", direction: "long" },
              trendData,
              false,
              earlyOrderFlowAnalysis
            );
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
            perSymbolGateAttribution.set(symbol, { gate: 'STOCHRSI_OVERBOUGHT_BLOCK', details: `K=${stochRsiK4h.toFixed(1)}, ${blockReason.slice(0, 30)}` });
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} Blocking LONG - 4h StochRSI K=${stochRsiK4h.toFixed(1)} overbought | ${blockReason}`);
            await logRejectionWithAI(
              supabase, userId, symbol,
              `StochRSI extreme: K=${stochRsiK4h.toFixed(1)} overbought, ${blockReason}`,
              { 
                stochRsiK4h: stochRsiK4h.toFixed(1), stochRsiD4h: stochRsiD4h.toFixed(1), stochRsiRising,
                trend4h: stochFilterTrend4h, confidence4h: stochFilterConf4h,
                trend1h: stochFilterTrend1h, confidence1h: stochFilterConf1h,
                bollingerPosition, percentB, macdHistogram, adx: adx.toFixed(1),
                momentumConfirms: momentum?.confirms, momentumState: momentum?.state,
                trendStrengthScore: trendStrengthResult.score,
                trendStrengthDecision: trendStrengthResult.decision,
                trendStrengthComponents: trendStrengthResult.components,
                isValidBreakout,
                breakoutThreshold: BREAKOUT_THRESHOLDS.MIN_PERCENT_B,
                volumeRatio: volumeRatio.toFixed(2),
                hasVolumeConfirmation,
                isBandwidthExpanding,
                reason: blockReason,
                gate: "STOCHRSI_OVERBOUGHT_BLOCK"
              },
              trendData,
              false,
              earlyOrderFlowAnalysis
            );
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
          // ============= MOMENTUM CONTINUATION EXCEPTION =============
          // Allow SHORT entries even when StochRSI is not falling if:
          // 1. Price action shows strong recent downward movement (2%+ in 6h)
          // 2. ADX confirms trend strength (>= 25)
          // 3. 4h confidence is bearish (>= 60%)
          // 4. No bullish divergence (price still making lower lows)
          // This prevents missing continuation opportunities just because K >= D
          const priceActionMomentum = trendData.priceActionMomentum;
          const hasPriceActionMomentumDown = priceActionMomentum?.hasStrongMove && 
            priceActionMomentum?.direction === "bearish" &&
            Math.abs(priceActionMomentum?.movePercent || 0) >= MOMENTUM_CONTINUATION_PARAMS.PRICE_MOVE_THRESHOLD_PERCENT;
          
          const barsAtExtreme4h = trendData.stochasticRsi?.barsAtExtreme?.["4h"] || 0;
          const notTrueExhaustion = barsAtExtreme4h < MOMENTUM_CONTINUATION_PARAMS.MIN_BARS_AT_EXTREME_FOR_BLOCK;
          
          const momentumContinuationAllowed = MOMENTUM_CONTINUATION_PARAMS.ENABLED &&
            hasPriceActionMomentumDown &&
            adx >= MOMENTUM_CONTINUATION_PARAMS.MIN_ADX_FOR_OVERRIDE &&
            stochFilterTrend4h === "bearish" &&
            stochFilterConf4h >= MOMENTUM_CONTINUATION_PARAMS.MIN_4H_CONFIDENCE &&
            !hasBullishDivergence &&
            notTrueExhaustion;
          
          // MANDATORY: StochRSI must be falling (K < D) for any extreme oversold entry
          // EXCEPTION: Allow if momentum continuation conditions are met
          if (!stochRsiFalling && !momentumContinuationAllowed) {
            rejectedByStochRsiExtreme++;
            perSymbolGateAttribution.set(symbol, { gate: 'STOCHRSI_OVERSOLD_BLOCK', details: `K=${stochRsiK4h.toFixed(1)} not falling` });
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} Blocking SHORT - StochRSI not falling at oversold (K=${stochRsiK4h.toFixed(1)}, D=${stochRsiD4h.toFixed(1)})`);
            await logRejectionWithAI(
              supabase, userId, symbol,
              `StochRSI extreme: K=${stochRsiK4h.toFixed(1)} oversold, StochRSI NOT falling (K >= D)`,
              { 
                stochRsiK4h, stochRsiD4h, stochRsiFalling, 
                gate: "STOCHRSI_NOT_FALLING",
                priceActionMomentum: priceActionMomentum || null,
                barsAtExtreme4h,
                momentumContinuationCheck: {
                  enabled: MOMENTUM_CONTINUATION_PARAMS.ENABLED,
                  hasPriceActionMomentumDown,
                  adxSufficient: adx >= MOMENTUM_CONTINUATION_PARAMS.MIN_ADX_FOR_OVERRIDE,
                  confidenceSufficient: stochFilterConf4h >= MOMENTUM_CONTINUATION_PARAMS.MIN_4H_CONFIDENCE,
                  noDivergence: !hasBullishDivergence,
                  notExhausted: notTrueExhaustion,
                  result: momentumContinuationAllowed
                }
              },
              trendData,
              false,
              earlyOrderFlowAnalysis
            );
            continue;
          }
          
          // If momentum continuation allowed, apply position size reduction and log
          // NEW: RSI momentum zone validation for MOMENTUM_CONTINUATION entries
          // LONG momentum zone: 45-65 (neutral-to-bullish bias)
          // SHORT momentum zone: 35-55 (bearish-to-neutral bias)
          // Entries outside these zones get 25% additional position reduction
          if (momentumContinuationAllowed && !stochRsiFalling) {
            const rsi4h = trendData.timeframes?.['4h']?.indicators?.rsi ?? 50;
            const rsiInMomentumZone = rsi4h >= 35 && rsi4h <= 55; // SHORT zone
            
            if (rsiInMomentumZone) {
              reversalPositionMultiplier = Math.min(reversalPositionMultiplier, MOMENTUM_CONTINUATION_PARAMS.POSITION_SIZE_MULTIPLIER);
              logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} MOMENTUM CONTINUATION: Allowing SHORT at oversold (K=${stochRsiK4h.toFixed(1)}, K>=D) with RSI ${rsi4h.toFixed(1)} in zone [35-55]`);
            } else {
              // RSI outside optimal zone - apply 25% additional reduction
              const outsideZoneMultiplier = MOMENTUM_CONTINUATION_PARAMS.POSITION_SIZE_MULTIPLIER * 0.75;
              reversalPositionMultiplier = Math.min(reversalPositionMultiplier, outsideZoneMultiplier);
              logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.SUCCESS} MOMENTUM CONTINUATION: Allowing SHORT at oversold with RSI ${rsi4h.toFixed(1)} OUTSIDE zone [35-55] - extra 25% reduction`);
            }
            logger.forSymbol(symbol).info(`   Price moved ${priceActionMomentum?.movePercent?.toFixed(2)}% ${priceActionMomentum?.direction}, ADX=${adx.toFixed(1)}, bars@extreme=${barsAtExtreme4h}`);
            logger.forSymbol(symbol).info(`   Position size reduced to ${(reversalPositionMultiplier * 100).toFixed(0)}%`);
          }
          
          // MANDATORY: No bullish divergence allowed at extreme oversold
          if (hasBullishDivergence) {
            rejectedByStochRsiExtreme++;
            perSymbolGateAttribution.set(symbol, { gate: 'BULLISH_DIVERGENCE_AT_EXTREME', details: `K=${stochRsiK4h.toFixed(1)}` });
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} Blocking SHORT - Bullish divergence at oversold (K=${stochRsiK4h.toFixed(1)})`);
            await logRejectionWithAI(
              supabase, userId, symbol,
              `StochRSI extreme: K=${stochRsiK4h.toFixed(1)} oversold with bullish divergence`,
              { stochRsiK4h, hasBullishDivergence: true, gate: "BULLISH_DIVERGENCE_AT_EXTREME" },
              trendData,
              false,
              earlyOrderFlowAnalysis
            );
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
            perSymbolGateAttribution.set(symbol, { gate: 'STOCHRSI_OVERSOLD_BLOCK', details: `K=${stochRsiK4h.toFixed(1)}, ${blockReason.slice(0, 30)}` });
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} Blocking SHORT - 4h StochRSI K=${stochRsiK4h.toFixed(1)} oversold | ${blockReason}`);
            await logRejectionWithAI(
              supabase, userId, symbol,
              `StochRSI extreme: K=${stochRsiK4h.toFixed(1)} oversold, ${blockReason}`,
              { 
                stochRsiK4h: stochRsiK4h.toFixed(1), stochRsiD4h: stochRsiD4h.toFixed(1), stochRsiFalling,
                trend4h: stochFilterTrend4h, confidence4h: stochFilterConf4h,
                trend1h: stochFilterTrend1h, confidence1h: stochFilterConf1h,
                bollingerPosition, percentB, macdHistogram, adx: adx.toFixed(1),
                momentumConfirms: momentum?.confirms, momentumState: momentum?.state,
                alignedTrendOverride,
                reason: blockReason,
                gate: "STOCHRSI_OVERSOLD_BLOCK"
              },
              trendData,
              false,
              earlyOrderFlowAnalysis
            );
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
              perSymbolGateAttribution.set(symbol, { gate: 'ADX_TOO_LOW_NO_SQUEEZE', details: `ADX=${adx.toFixed(1)}, squeeze failed` });
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
                riskParams.ai_analysis_enabled !== false,
                earlyOrderFlowAnalysis
              );
              continue;
            }
          } else {
            // ADX < 18: No squeeze exception possible
            rejectedByHardGates++;
            perSymbolGateAttribution.set(symbol, { gate: 'ADX_TOO_LOW', details: `ADX=${adx.toFixed(1)}<18` });
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
              riskParams.ai_analysis_enabled !== false,
              earlyOrderFlowAnalysis
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
        // NEW: Also allow if trend acceleration detected (strong price move with ADX rising)
        const momentumState = momentum?.state || "none";
        const momentumConfirms = momentum?.confirms ?? false;
        const isStrongTrendException = adx >= ADX_THRESHOLDS.STRONG_TREND_EXCEPTION; // 28+ (relaxed from 30)
        
        // Momentum passes if:
        // 1. State is confirmed/building/mixed AND confirms is true, OR
        // 2. State is "none" BUT ADX >= 28 (strong trend exception for early entries), OR
        // 3. Trend acceleration detected (2.5%+ price move with ADX >= 20 and rising)
        const momentumPasses = momentumConfirms || (momentumState !== "none") || isStrongTrendException || qualifiesForTrendAcceleration;
        
        if (!momentumPasses) {
          rejectedByHardGates++;
          perSymbolGateAttribution.set(symbol, { gate: 'ADX_TOO_LOW', details: `Momentum=${momentumState}, ADX=${adx.toFixed(1)}<28, PriceMove=${priceMove.toFixed(1)}%` });
          await logRejectionWithAI(
            supabase, userId, symbol,
            `HARD GATE: No momentum confirmation (state=${momentumState}, confirms=${momentumConfirms}, ADX=${adx.toFixed(1)} < 28, priceMove=${priceMove.toFixed(1)}%)`,
            { 
              gate: "NO_MOMENTUM_CONFIRMATION",
              momentumState,
              momentumConfirms,
              adx: adx.toFixed(1),
              isStrongTrendException,
              trend,
              confidence,
              // NEW: Trend acceleration diagnostics
              trendAcceleration: {
                priceMove: priceMove.toFixed(1),
                priceDirection,
                hasStrongMove,
                qualifiesForBypass: qualifiesForTrendAcceleration,
                adxRising: adxRisingForAcceleration,
                stochRsiK4h: stochRsiK4h.toFixed(1),
                stochRsiSafe: stochRsiSafeForAcceleration,
                htfMatches: htfMatchesDirection
              },
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
            riskParams.ai_analysis_enabled !== false,
            earlyOrderFlowAnalysis
          );
          continue;
        }
        
        // Log when using strong trend exception for early entry
        if (isStrongTrendException && momentumState === "none" && !momentumConfirms) {
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.MOMENTUM} EARLY ENTRY via strong trend exception (ADX=${adx.toFixed(1)} >= 28, momentum=${momentumState})`);
        }
        
        // Log when using trend acceleration exception
        if (qualifiesForTrendAcceleration && momentumState === "none" && !momentumConfirms && !isStrongTrendException) {
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.MOMENTUM} 🚀 TREND ACCELERATION BYPASS: Allowing entry despite no momentum confirmation (${priceMove.toFixed(1)}% move, ADX=${adx.toFixed(1)} rising=${adxRisingForAcceleration})`);
        }
        
        // ============= CONTEXT-AWARE MOMENTUM GATE FOR PULLBACK ENTRIES =============
        // Pullbacks by definition lack strong momentum - that's the opportunity!
        // Detect pullback setups and use reduced momentum threshold (3 vs 5)
        const earlyMomentumScore = getMomentumScore(momentum, adx, trendData.volatility?.adxRising ?? false);
        
        // ===== STOCHRSI DATA VALIDATION =====
        // Validate StochRSI values before pullback detection to prevent false signals
        const isStochRsiDataValid = (
          stochRsiK1h > 0 && stochRsiK1h <= 100 &&
          stochRsiD1h > 0 && stochRsiD1h <= 100
        );
        
        if (!isStochRsiDataValid) {
          logger.forSymbol(symbol).debug(`${LOG_CATEGORIES.MOMENTUM} StochRSI data invalid (K=${stochRsiK1h.toFixed(1)}, D=${stochRsiD1h.toFixed(1)}) - skipping pullback detection`);
        }
        
        // ===== PULLBACK SETUP DETECTION =====
        // LONG pullback: 4h bullish + 1h oversold (buying the dip in an uptrend)
        // SHORT pullback: 4h bearish + 1h overbought (selling the rally in a downtrend)
        const isPullbackSetupDetected = (() => {
          // Skip if StochRSI data is invalid (K=0, D=0 indicates no data)
          if (!isStochRsiDataValid) {
            return false;
          }
          
          // LONG pullback conditions
          if (derivedDirection === "long" && 
              stochFilterTrend4h === "bullish" && 
              stochFilterConf4h >= PULLBACK_DETECTION_PARAMS.MIN_4H_CONFIDENCE && 
              stochRsiK1h <= PULLBACK_DETECTION_PARAMS.STOCHRSI_OVERSOLD_THRESHOLD) {
            return true;
          }
          // SHORT pullback conditions
          if (derivedDirection === "short" && 
              stochFilterTrend4h === "bearish" && 
              stochFilterConf4h >= PULLBACK_DETECTION_PARAMS.MIN_4H_CONFIDENCE && 
              stochRsiK1h >= PULLBACK_DETECTION_PARAMS.STOCHRSI_OVERBOUGHT_THRESHOLD) {
            return true;
          }
          return false;
        })();
        
        // ===== PULLBACK VALIDATION =====
        // For pullbacks, check reversal signs instead of momentum confirmation
        let isPullbackValid = false;
        let pullbackPositionMultiplier = 1.0;
        
        if (isPullbackSetupDetected) {
          // Check if StochRSI is starting to turn (K approaching or crossing D)
          const kTurningUp = stochRsiK1h >= stochRsiD1h * PULLBACK_DETECTION_PARAMS.KD_TURN_TOLERANCE;
          const kTurningDown = stochRsiK1h <= stochRsiD1h * (2 - PULLBACK_DETECTION_PARAMS.KD_TURN_TOLERANCE);
          
          isPullbackValid = (
            // StochRSI starting to turn in trade direction
            (derivedDirection === "long" && kTurningUp) ||
            (derivedDirection === "short" && kTurningDown)
          ) && (
            // ADX still strong enough (trend intact, just pulled back)
            adx >= PULLBACK_DETECTION_PARAMS.MIN_ADX
          );
          
          if (isPullbackValid) {
            // Apply pullback position size reduction (50% default)
            pullbackPositionMultiplier = (riskParams.pullback_position_size_percent ?? PULLBACK_DETECTION_PARAMS.DEFAULT_POSITION_SIZE_PERCENT) / 100;
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.MOMENTUM} PULLBACK SETUP DETECTED & VALID: 4h ${stochFilterTrend4h} (${stochFilterConf4h}%), 1h K=${stochRsiK1h.toFixed(1)} D=${stochRsiD1h.toFixed(1)}, ADX=${adx.toFixed(1)} - using reduced momentum threshold (${MOMENTUM_THRESHOLDS.PULLBACK_MIN_SCORE})`);
          } else {
            logger.forSymbol(symbol).debug(`${LOG_CATEGORIES.MOMENTUM} Pullback detected but not valid: K_turn=${derivedDirection === "long" ? kTurningUp : kTurningDown}, ADX=${adx.toFixed(1)} >= ${PULLBACK_DETECTION_PARAMS.MIN_ADX}`);
          }
        }
        
        // ===== CONTEXT-AWARE MOMENTUM THRESHOLD =====
        // Use reduced threshold for valid pullback setups (they lack momentum by definition)
        const effectiveMomentumThreshold = isPullbackValid 
          ? MOMENTUM_THRESHOLDS.PULLBACK_MIN_SCORE  // 3 for pullbacks
          : MOMENTUM_THRESHOLDS.MIN_SCORE;          // 5 for normal entries
        
        if (earlyMomentumScore < effectiveMomentumThreshold) {
          rejectedByHardGates++;
          await logRejectionWithAI(
            supabase, userId, symbol,
            `HARD GATE: Momentum score too low (${earlyMomentumScore} < ${effectiveMomentumThreshold}${isPullbackSetupDetected ? ' [pullback threshold]' : ''}) - insufficient momentum confirmation`,
            { 
              gate: "MOMENTUM_SCORE_TOO_LOW",
              momentumScore: earlyMomentumScore,
              momentumRequired: effectiveMomentumThreshold,
              isPullbackSetup: isPullbackSetupDetected,
              isPullbackValid,
              momentumState: momentum?.state || "none",
              momentumConfirms: momentum?.confirms ?? false,
              macdExpanding: momentum?.macdExpanding ?? false,
              volumeConfirms: momentum?.volumeConfirms ?? false,
              stochRsiK1h: stochRsiK1h.toFixed(1),
              stochRsiD1h: stochRsiD1h.toFixed(1),
              stochFilterTrend4h,
              stochFilterConf4h,
              adx: adx.toFixed(1),
              trend,
              confidence
            },
            trendData,
            riskParams.ai_analysis_enabled !== false,
            earlyOrderFlowAnalysis
          );
          continue;
        }
        
        // Log success with context
        if (isPullbackValid) {
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} PULLBACK ENTRY: Momentum gate passed with reduced threshold (${earlyMomentumScore} >= ${effectiveMomentumThreshold}) - position size ${(pullbackPositionMultiplier * 100).toFixed(0)}%`);
        } else {
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} Momentum score gate passed (${earlyMomentumScore} >= ${effectiveMomentumThreshold})`);
        }
        
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
        
        // ============= RELAXED GATE: NEUTRAL 4H TREND CONFIDENCE REQUIREMENT =============
        // UPDATED: Lowered from 70% to 55% based on actual data analysis showing:
        // - 60-69% confidence: 86.67% win rate (15 trades)
        // - 50-59% confidence: 92.86% win rate (28 trades)
        // The original 70% threshold was too restrictive and blocked profitable signals
        const trend4hForNeutralGate = htfTrend4h;
        const is4hNeutral = trend4hForNeutralGate === "neutral";
        const conf4hForGate = timeframes?.['4h']?.confidence || confidence;
        const conf1hForGate = timeframes?.['1h']?.confidence || 0;
        const is1hDirectional = htfTrend1h === "bullish" || htfTrend1h === "bearish";
        
        if (is4hNeutral) {
          // Relaxed thresholds: 55% for 4h OR directional 1h with 50%+
          const passesNeutralGate = conf4hForGate >= 55 || (is1hDirectional && conf1hForGate >= 50);
          if (!passesNeutralGate) {
            rejectedByHardGates++;
            perSymbolGateAttribution.set(symbol, { gate: 'NEUTRAL_4H_LOW_CONFIDENCE', details: `4h=${conf4hForGate.toFixed(0)}%, 1h=${conf1hForGate.toFixed(0)}%` });
            await logRejectionWithAI(
              supabase, userId, symbol,
              `HARD GATE: Neutral 4h requires 55%+ confidence OR directional 1h with 50%+ (4h=${trend4hForNeutralGate} ${conf4hForGate.toFixed(0)}%, 1h=${htfTrend1h} ${conf1hForGate.toFixed(0)}%)`,
              { 
                gate: "NEUTRAL_4H_LOW_CONFIDENCE",
                trend4h: trend4hForNeutralGate,
                confidence4h: conf4hForGate,
                trend1h: htfTrend1h,
                confidence1h: conf1hForGate,
                requiredConfidence: 55,
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
            perSymbolGateAttribution.set(symbol, { gate: 'MACD_MISALIGNED', details: macdReason });
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
          perSymbolGateAttribution.set(symbol, { gate: 'HTF_NOT_ALIGNED', details: `conf=${confidence}%, 1h=${confidence1h}%` });
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
        
        // GATE 4: Confidence Dead Zone - REMOVED
        // Original claim: 60-69% confidence = 31.73% win rate
        // Actual data analysis (Dec 2024): 60-69% confidence = 86.67% win rate (15 trades, $21.25 profit)
        // Gate removed as it was blocking highly profitable signals based on outdated/incorrect statistics
        
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
          perSymbolGateAttribution.set(symbol, { gate: 'NO_STRATEGY_SUPPORT', details: `${tradeDirectionForGate} trend` });
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
          perSymbolGateAttribution.set(symbol, { gate: 'NO_CONDITION_STRATEGY', details: `${strategiesWithDirectionalSupport} trend-followers, ADX=${adx.toFixed(1)}` });
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
          
          // ===== PHASE 5: RECOVERY SQUEEZE EXCEPTION (Finding 6) =====
          // Allow recovery trade if squeeze breakout + HTF aligned, skip pullback score check
          const squeezeBreakoutRecovery = isValidSqueezeBreakout(trendData, derivedDirection);
          const hasRecoverySqueezeException = squeezeBreakoutRecovery.isValid && htfAlignedForRecovery;
          
          if (hasRecoverySqueezeException) {
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} RECOVERY SQUEEZE EXCEPTION: Squeeze breakout (conf=${squeezeBreakoutRecovery.confidence}%) + HTF aligned - skipping pullback check`);
          }
          
          // ===== FINDING 4: PULLBACK DEPTH SCORING =====
          // Replace binary check with weighted scoring (0-3 points)
          // SKIP if squeeze exception applies
          let pullbackScore = 0;
          
          if (!hasRecoverySqueezeException) {
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
          } else {
            // Squeeze exception grants max pullback score for quality calculation
            pullbackScore = 3;
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
        
        // ============= PHASE 4: FAKE BREAKOUT RISK & GENUINE MOMENTUM ADJUSTMENT =============
        // Use fakeBreakoutRisk and genuineMomentum from calculate-trend for quality adjustment
        const fakeBreakoutRisk = momentum?.fakeBreakoutRisk === true;
        const genuineMomentum = momentum?.genuineMomentum === true;
        const localMacdExpanding = momentum?.macdExpanding === true;
        const localAdxRising = trendData.volatility?.adxRising ?? false;
        let fakeBreakoutPenalty = 0;
        let genuineMomentumBonus = 0;
        let momentumContinuationBonus = 0;
        
        if (fakeBreakoutRisk) {
          fakeBreakoutPenalty = -8; // -8 quality points for MACD expanding but ADX falling
          logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.MOMENTUM} FAKE BREAKOUT RISK: MACD expanding but ADX falling → quality penalty ${fakeBreakoutPenalty}`);
        }
        
        if (genuineMomentum) {
          genuineMomentumBonus = 5; // +5 quality points for MACD expanding + ADX rising
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.MOMENTUM} GENUINE MOMENTUM: MACD expanding + ADX rising → quality bonus +${genuineMomentumBonus}`);
        }
        
        // ============= NEW: MOMENTUM CONTINUATION BONUS =============
        // When ADX >= 25, MACD expanding, and 4h trend confidence >= 60%
        // This catches strong momentum moves that might miss due to "mixed" state
        const conf4hForBonus = timeframes?.['4h']?.confidence || 50;
        if (adx >= 25 && localMacdExpanding && conf4hForBonus >= 60 && !fakeBreakoutRisk) {
          // Active momentum continuation - add +3 quality bonus
          momentumContinuationBonus = 3;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.MOMENTUM} MOMENTUM CONTINUATION: ADX=${adx.toFixed(1)} ≥25, MACD expanding, 4h conf=${conf4hForBonus}% ≥60% → +${momentumContinuationBonus} quality`);
          
          // Extra bonus if ADX is rising (truly accelerating)
          if (localAdxRising) {
            momentumContinuationBonus += 2;
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.MOMENTUM}   → ADX rising: total continuation bonus +${momentumContinuationBonus}`);
          }
        }
        
        // Direction bonus: +3 for SHORT/SELL signals (historically 38% vs 31% win rate)
        const directionBonus = trend === "bearish" ? 3 : 0;
        // Volume score component
        const volumeScore = getVolumeScore(trendData, trend);
        
        // ============= ORDER FLOW ANALYSIS =============
        // Use the early Order Flow analysis calculated before rejection gates
        // This ensures consistency and the same data is available in rejection logs
        const orderFlowAnalysis = earlyOrderFlowAnalysis || analyzeOrderFlow([], earlyIntendedDirection);
        const orderFlowScore = getOrderFlowQualityBonus(orderFlowAnalysis, earlyIntendedDirection);
        
        // Log order flow analysis (detailed logging for signals that passed all gates)
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
          momentumScore: getMomentumScore(momentum, adx, trendData.volatility?.adxRising ?? false),
          alignmentScore: getAlignmentScore(confidence, trendConsistency, isAligned || false, trendData),
          technicalScore: getTechnicalScore(trendData, trend, symbol),
          entryTimingScore: entryTimingScore,
          volumeScore: volumeScore,                // Volume confirmation
          orderFlowScore: orderFlowScore,          // NEW: Order flow analysis (-15 to +15)
          confidencePenalty: confidencePenalty,    // Penalize high confidence entries
          directionBonus: directionBonus,          // +3 for SHORT signals
        };

        const { score: rawQualityScore, breakdown: rawBreakdown } = calculateQualityScore(qualityFactors);
        
        // ============= PHASE 4: Apply Fake Breakout Penalty, Genuine Momentum Bonus, and Continuation Bonus =============
        const qualityScore = Math.max(0, Math.min(100, rawQualityScore + fakeBreakoutPenalty + genuineMomentumBonus + momentumContinuationBonus));
        
        // Build final breakdown string including adjustments
        let breakdown = rawBreakdown;
        if (fakeBreakoutPenalty !== 0) {
          breakdown += ` FAKE:${fakeBreakoutPenalty}`;
        }
        if (genuineMomentumBonus !== 0) {
          breakdown += ` GMOM:+${genuineMomentumBonus}`;
        }
        if (momentumContinuationBonus !== 0) {
          breakdown += ` MCONT:+${momentumContinuationBonus}`;
        }
        
        // Log if adjustments were applied
        if (fakeBreakoutPenalty !== 0 || genuineMomentumBonus !== 0 || momentumContinuationBonus !== 0) {
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.QUALITY} Quality adjusted: ${rawQualityScore}→${qualityScore} (FAKE:${fakeBreakoutPenalty}, GMOM:+${genuineMomentumBonus}, MCONT:+${momentumContinuationBonus})`);
        }
        
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

        // ============= NEW: SMART ENTRY QUALITY SCORING =============
        // Calculate entry quality using smart momentum module for additional validation
        const stochRsiData = trendData.stochasticRsi?.["4h"] || trendData.stochasticRsi || {};
        const stochRsiK = stochRsiData.k ?? 50;
        const stochRsiD = stochRsiData.d ?? stochRsiK;
        const stochRsiSignal = stochRsiData.signal ?? "neutral";
        const macdHistExpanding = trendData.macd?.isExpanding ?? false;
        const timeframeAlignmentScoreForEntry = trendConsistency || 50;
        
        const smartEntryQuality = calculateEntryQuality(
          smartMomentum,
          smartPullback,
          volumeConfirms,
          volumeRatioForRegime, // Use the volume ratio already calculated earlier
          timeframeAlignmentScoreForEntry,
          stochRsiK,
          stochRsiSignal,
          macdHistExpanding,
          derivedDirection,
          stochRsiD  // Pass D for crossing detection
        );
        
        // ============= PHASE 2: ENTRY CONFIRMATION CHECK =============
        // Check all entry confirmation filters for smarter entry timing
        const entryConfirmation = checkEntryConfirmation(
          smartPullback,
          volumeRatioForRegime,
          stochRsiK,
          stochRsiD,
          macdHistExpanding,
          derivedDirection
        );
        
        // Log smart entry quality assessment
        logger.forSymbol(symbol).info(`${LOG_CATEGORIES.ENTRY} SMART ENTRY QUALITY: ${smartEntryQuality.score}/100 Grade=${smartEntryQuality.grade} Type=${smartEntryQuality.entryType} Recommended=${smartEntryQuality.isRecommended}`);
        logger.forSymbol(symbol).info(`${LOG_CATEGORIES.ENTRY} ENTRY CONFIRMATION: ${entryConfirmation.confirmationCount}/${entryConfirmation.maxConfirmations} filters passed`);
        if (smartEntryQuality.warnings.length > 0) {
          logger.forSymbol(symbol).debug(`   Warnings: ${smartEntryQuality.warnings.slice(0, 3).join(' | ')}`);
        }
        if (!entryConfirmation.allConfirmed) {
          const failedFilters = entryConfirmation.reasons.filter(r => r.startsWith("✗"));
          logger.forSymbol(symbol).debug(`   Missing confirmations: ${failedFilters.join(' | ')}`);
        }
        
        // ============= PHASE 2: WAIT-FOR-BOUNCE GATE =============
        // For pullback entries, require bounce confirmation before entry
        const isPullbackEntry = smartPullback.isPullback && smartEntryQuality.entryType === "pullback";
        const waitForBounceEnabled = ENTRY_TIMING_PHASE2_PARAMS.WAIT_FOR_BOUNCE_ENABLED;
        const isAtStochRsiExtreme = stochRsiK > 80 || stochRsiK < 20;
        
        if (waitForBounceEnabled && isPullbackEntry && !smartPullback.hasBounceConfirmation) {
          // Block pullback entries without bounce confirmation
          if (ENTRY_TIMING_PHASE2_PARAMS.BLOCK_NO_CONFIRMATION_AT_EXTREMES && isAtStochRsiExtreme) {
            rejectedByHardGates++;
            perSymbolGateAttribution.set(symbol, { gate: 'PHASE2_NO_BOUNCE_CONFIRMATION', details: `StochRSI at extreme (${stochRsiK.toFixed(0)})` });
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} PHASE 2 GATE: Pullback entry blocked - waiting for bounce confirmation at StochRSI extreme`);
            await logRejectionWithAI(
              supabase, userId, symbol,
              `PHASE 2: Pullback entry without bounce confirmation at StochRSI extreme (K=${stochRsiK.toFixed(0)})`,
              {
                gate: "PHASE2_WAIT_FOR_BOUNCE",
                stochRsiK: stochRsiK.toFixed(1),
                pullbackDepth: smartPullback.pullbackDepth,
                hasBounceConfirmation: smartPullback.hasBounceConfirmation,
                rsiRecovering: smartPullback.rsiRecovering,
                confirmationCandles: smartPullback.confirmationCandles,
                entryConfirmation: entryConfirmation.confirmationCount,
                reasons: smartPullback.reasons
              },
              trendData,
              riskParams.ai_analysis_enabled !== false,
              earlyOrderFlowAnalysis
            );
            continue;
          } else {
            // Log warning but allow entry with reduced position size
            logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.ENTRY} Pullback without bounce confirmation - position size will be reduced`);
          }
        }
        
        // ============= PHASE 2: RECOVERY MODE CONFIRMATION GATE =============
        // In recovery mode, require full entry confirmation
        if (isInRecoveryMode && ENTRY_TIMING_PHASE2_PARAMS.BLOCK_NO_CONFIRMATION_IN_RECOVERY && !entryConfirmation.allConfirmed) {
          rejectedByHardGates++;
          perSymbolGateAttribution.set(symbol, { gate: 'PHASE2_RECOVERY_NO_CONFIRMATION', details: `${entryConfirmation.confirmationCount}/${ENTRY_TIMING_PHASE2_PARAMS.MIN_CONFIRMATIONS_REQUIRED}` });
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} PHASE 2 GATE: Recovery mode requires full entry confirmation`);
          await logRejectionWithAI(
            supabase, userId, symbol,
            `PHASE 2 RECOVERY: Entry blocked - only ${entryConfirmation.confirmationCount}/${ENTRY_TIMING_PHASE2_PARAMS.MIN_CONFIRMATIONS_REQUIRED} confirmations`,
            {
              gate: "PHASE2_RECOVERY_CONFIRMATION",
              confirmationCount: entryConfirmation.confirmationCount,
              minRequired: ENTRY_TIMING_PHASE2_PARAMS.MIN_CONFIRMATIONS_REQUIRED,
              confirmationDetails: entryConfirmation.details,
              pullbackValid: smartPullback.isValidPullback,
              reasons: entryConfirmation.reasons
            },
            trendData,
            riskParams.ai_analysis_enabled !== false,
            earlyOrderFlowAnalysis
          );
          continue;
        }
        
        // Apply smart entry quality gate (only when regime-aware trading is enabled)
        const minEntryQuality = riskParams.min_entry_quality_score ?? 60;
        if (regimeAwareEnabled && !smartEntryQuality.isRecommended && smartEntryQuality.score < minEntryQuality) {
          // Log but don't hard reject - use as quality adjustment instead
          logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.QUALITY} Smart entry quality below threshold: ${smartEntryQuality.score}/${minEntryQuality}`);
        }
        
        // ============= PHASE 2: POSITION SIZE ADJUSTMENT BY ENTRY QUALITY =============
        // Higher quality entries get full position, lower quality gets reduced
        let phase2PositionMultiplier = 1.0;
        switch (smartEntryQuality.grade) {
          case "A":
            phase2PositionMultiplier = ENTRY_TIMING_PHASE2_PARAMS.QUALITY_GRADE_A_MULTIPLIER;
            break;
          case "B":
            phase2PositionMultiplier = ENTRY_TIMING_PHASE2_PARAMS.QUALITY_GRADE_B_MULTIPLIER;
            break;
          case "C":
            phase2PositionMultiplier = ENTRY_TIMING_PHASE2_PARAMS.QUALITY_GRADE_C_MULTIPLIER;
            break;
          case "D":
            phase2PositionMultiplier = ENTRY_TIMING_PHASE2_PARAMS.QUALITY_GRADE_D_MULTIPLIER;
            break;
          default:
            phase2PositionMultiplier = 0.4; // F grade gets minimal position
        }
        
        // Additional reduction if pullback lacks bounce confirmation
        if (isPullbackEntry && !smartPullback.hasBounceConfirmation) {
          phase2PositionMultiplier *= 0.7; // 30% reduction for unconfirmed bounces
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK} PHASE 2: Position reduced to ${(phase2PositionMultiplier * 100).toFixed(0)}% (no bounce confirmation)`);
        }
        
        // Store entry quality in database (async, don't block) - will be linked to position later if signal executes
        const entryQualityLog = {
          user_id: userId,
          symbol,
          entry_score: smartEntryQuality.score,
          momentum_score: smartMomentum.score,
          pullback_depth: smartPullback.pullbackDepth,
          volume_confirmation: volumeConfirms,
          timeframe_alignment_score: timeframeAlignmentScoreForEntry,
          stochrsi_position: stochRsiK < 30 ? "oversold" : stochRsiK > 70 ? "overbought" : "neutral",
          macd_expanding: macdHistExpanding,
          regime: smartRegime.regime,
          entry_factors: {
            ...smartEntryQuality.factors,
            grade: smartEntryQuality.grade,
            entryType: smartEntryQuality.entryType,
            warnings: smartEntryQuality.warnings,
            // Phase 2 additions
            entryConfirmation: entryConfirmation.confirmationCount,
            hasBounceConfirmation: smartPullback.hasBounceConfirmation,
            confirmationCandles: smartPullback.confirmationCandles,
            rsiDipped: smartPullback.rsiDipped,
            rsiRecovering: smartPullback.rsiRecovering,
            phase2PositionMultiplier
          }
        };

        // ============= LOW VOLUME DETECTION =============
        // Detect holiday/low-activity periods and adjust quality threshold
        // This is INFORMATIONAL - logs why signals are scarce, not a hard rejection
        // volumeRatio is in the volume object per timeframe, use 1h as primary reference
        const volume1hData = trendData.volume?.["1h"] || {};
        const volumeRatio = volume1hData.volumeRatio ?? 1.0;
        let lowVolumeBoost = 0;
        
        if (volumeRatio < LOW_VOLUME_DETECTION_PARAMS.VERY_LOW_VOLUME_RATIO) {
          // Very low volume (holiday-like conditions)
          lowVolumeBoost = LOW_VOLUME_DETECTION_PARAMS.QUALITY_THRESHOLD_BOOST;
          logger.forSymbol(symbol).info(`📉 LOW VOLUME DETECTED: volumeRatio=${(volumeRatio * 100).toFixed(0)}% (<${LOW_VOLUME_DETECTION_PARAMS.VERY_LOW_VOLUME_RATIO * 100}% avg) - HOLIDAY-LIKE CONDITIONS`);
          logger.forSymbol(symbol).info(`   → Quality threshold boosted by +${lowVolumeBoost} points (informational tightening)`);
        } else if (volumeRatio < LOW_VOLUME_DETECTION_PARAMS.VOLUME_RATIO_THRESHOLD) {
          // Low volume (below 50% average)
          lowVolumeBoost = LOW_VOLUME_DETECTION_PARAMS.QUALITY_THRESHOLD_BOOST;
          logger.forSymbol(symbol).info(`📉 LOW VOLUME: volumeRatio=${(volumeRatio * 100).toFixed(0)}% (<${LOW_VOLUME_DETECTION_PARAMS.VOLUME_RATIO_THRESHOLD * 100}% avg)`);
          logger.forSymbol(symbol).info(`   → Quality threshold boosted by +${lowVolumeBoost} points`);
        }

        // ============= DYNAMIC QUALITY THRESHOLD =============
        // Calculate threshold based on ADX, 1h confidence, neutral trend, and low volume for this specific symbol
        const isNeutralTrend = tradeDirectionForGate === 'neutral';
        const MIN_QUALITY_SCORE = getMinQualityScore(adx, isInRecoveryMode, confidence1h, isNeutralTrend, lowVolumeBoost);
        
        // Check minimum quality threshold
        if (qualityScore < MIN_QUALITY_SCORE) {
          rejectedByQuality++;
          perSymbolGateAttribution.set(symbol, { gate: 'QUALITY_TOO_LOW', details: `${qualityScore}/${MIN_QUALITY_SCORE}` });
          
          // PHASE 1: Near Miss Logging - signals within 5 points of threshold
          const isNearMiss = qualityScore >= (MIN_QUALITY_SCORE - QUALITY_THRESHOLDS.NEAR_MISS_THRESHOLD);
          
          await logRejectionWithAI(
            supabase, userId, symbol,
            isNearMiss 
              ? `NEAR MISS: Quality score ${qualityScore}/100 (threshold: ${MIN_QUALITY_SCORE}, missed by ${MIN_QUALITY_SCORE - qualityScore} pts)`
              : lowVolumeBoost > 0
                ? `Quality score too low: ${qualityScore}/100 (min: ${MIN_QUALITY_SCORE} incl. +${lowVolumeBoost} low-volume boost, ADX=${adx.toFixed(1)})`
                : `Quality score too low: ${qualityScore}/100 (min: ${MIN_QUALITY_SCORE}, ADX=${adx.toFixed(1)})`,
            {
              gate: "QUALITY_THRESHOLD",
              qualityScore, breakdown, minRequired: MIN_QUALITY_SCORE,
              dynamicThreshold: true,
              adx: adx.toFixed(1),
              factors: qualityFactors,
              regime: regime.regime,
              entryTiming: pullbackAnalysis.reason,
              isNearMiss,
              nearMissMargin: isNearMiss ? MIN_QUALITY_SCORE - qualityScore : null,
              lowVolumeBoost: lowVolumeBoost > 0 ? lowVolumeBoost : undefined,
              volumeRatio: volumeRatio.toFixed(2),
              isLowVolume: volumeRatio < LOW_VOLUME_DETECTION_PARAMS.VOLUME_RATIO_THRESHOLD,
            },
            trendData,
            false,
            earlyOrderFlowAnalysis
          );
          
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
          positionSizeMultiplier?: number;  // Added for convergence entries
          convergenceEntry?: boolean;       // Flag for logging
        }
        const candidates: StrategyCandidate[] = [];
        
        // IMPROVEMENT 4: Track strategies that pass conditions but fail secondary filters
        // Used for multi-strategy convergence fallback
        const passedConditionsButFiltered: { name: string; reason: string; direction: "long" | "short" }[] = [];
        
        // ============= NEAR-MISS DIAGNOSTICS =============
        // Track top N closest strategies for "why no signal" debugging
        interface StrategyNearMiss {
          name: string;
          passedCount: number;
          totalConditions: number;
          failedConditions: { condition: string; currentValue: number | undefined; targetValue: string }[];
          skipReason?: string;
        }
        const strategyNearMisses: StrategyNearMiss[] = [];

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

          // ============= NEAR-MISS DIAGNOSTICS TRACKING =============
          // Track strategy evaluation results for "closest match" diagnostics
          interface ConditionEvalResult {
            condition: string;
            result: boolean;
            currentValue: number | undefined;
            targetValue: string;
          }
          
          try {
            const conditionResults: ConditionEvalResult[] = entryConditions.map((c: any) => {
              if (!c) return { condition: '', result: false, currentValue: undefined, targetValue: '' };
              const result = evaluateCondition(c, indicatorValues, prevIndicatorValues);
              return { 
                condition: `${c.indicator} ${c.operator} ${c.value}`, 
                result,
                currentValue: indicatorValues.get(c.indicator),
                targetValue: c.value || c.targetIndicator || ''
              };
            });
            
            const conditionsMet = conditionResults.every((r: { result: boolean }) => r.result);
            const passedCount = conditionResults.filter((r: { result: boolean }) => r.result).length;
            
            // ============= TRACK NEAR-MISS FOR DIAGNOSTICS =============
            // Store strategies that came close to matching for debugging
            if (!conditionsMet && passedCount > 0) {
              const failedConditions = conditionResults
                .filter((r: ConditionEvalResult) => !r.result)
                .map((r: ConditionEvalResult) => ({
                  condition: r.condition,
                  currentValue: r.currentValue,
                  targetValue: r.targetValue
                }));
              
              strategyNearMisses.push({
                name: strategy.name,
                passedCount,
                totalConditions: entryConditions.length,
                failedConditions
              });
            }
            
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
              const isTrendFollowingType = strategyType === 'TREND_FOLLOWING';
              const is4hDirectional = htfTrend4h === "bullish" || htfTrend4h === "bearish";
              
              // Pre-calculate intended signal type for convergence tracking
              let intendedSignalType: "long" | "short" | null = null;
              if (strategyDirection === 'long') {
                if (tradeDirection !== 'bearish') intendedSignalType = 'long';
              } else if (strategyDirection === 'short') {
                if (tradeDirection !== 'bullish') intendedSignalType = 'short';
              } else {
                if (tradeDirection === 'bullish') intendedSignalType = 'long';
                else if (tradeDirection === 'bearish') intendedSignalType = 'short';
              }
              
              // ============= PLAN FIX B: REGIME-STRATEGY COMPATIBILITY CHECK =============
              // Block trend-following/directional strategies in ranging markets
              // Mean-reversion and ranging strategies are allowed
              const isTrendFollowingOrMomentum = isMomentumType || isTrendFollowingType || 
                strategyDirection === 'long' || strategyDirection === 'short' || strategyDirection === 'trend';
              const isRangingOrMeanReversion = strategyDirection === 'ranging' || 
                strategy.name.toLowerCase().includes('reversion') || 
                strategy.name.toLowerCase().includes('ranging');
              
              if (regimeBlocksDirectionalStrategies && isTrendFollowingOrMomentum && !isRangingOrMeanReversion) {
                rejectedByStrategy++;
                perSymbolGateAttribution.set(symbol, { gate: 'REGIME_STRATEGY_MISMATCH', details: `${strategy.name} in ranging mkt` });
                logger.forSymbol(symbol).warn(`"${strategy.name}": REGIME-STRATEGY MISMATCH - Trend-following strategy blocked in ranging market (ADX=${adx.toFixed(1)}, 4h=${stochFilterTrend4h})`);
                
                // Track for near-miss diagnostics
                strategyNearMisses.push({ 
                  name: strategy.name, 
                  passedCount: entryConditions.length, 
                  totalConditions: entryConditions.length, 
                  failedConditions: [], 
                  skipReason: `Regime mismatch: trend strategy in ranging market (ADX=${adx.toFixed(1)})` 
                });
                continue;
              }
              
              // ============= IMPROVEMENT 4: STRATEGY-SPECIFIC CONSTRAINTS =============
              // EMA Death Cross needs context-awareness to prevent signals in inappropriate conditions
              const fakeBreakoutRisk = trendData.momentum?.fakeBreakoutRisk ?? false;
              
              // EMA Death Cross validation (SHORT signals)
              if (strategy.name === 'EMA Death Cross' || strategy.id === 'builtin-ema-death') {
                const constraints = STRATEGY_SPECIFIC_CONSTRAINTS.EMA_DEATH_CROSS;
                const stochRsiFalling = stochRsiK4h < stochRsiD4h;
                const isStrongTrendMode = adx >= constraints.STRONG_TREND_ADX_THRESHOLD;
                
                // IMPROVEMENT 2: Get 1h confidence for ADX relaxation
                const conf1h = trendData.timeframes?.['1h']?.confidence || 0;
                const is1hVeryConfident = conf1h >= 70;
                const is1hBearish = htfTrend1h === "bearish";
                
                // Allow reduced ADX (22 vs 25) when 1h is very confident AND aligned with SHORT
                const useReducedAdx = is1hVeryConfident && is1hBearish;
                const effectiveMinAdx = useReducedAdx ? 22 : constraints.MIN_ADX;
                
                // Determine effective thresholds based on trend strength
                const effectiveMinStochRsi = isStrongTrendMode ? constraints.STRONG_TREND_MIN_STOCHRSI_K : constraints.MIN_STOCHRSI_K;
                const effectiveMinPercentB = isStrongTrendMode ? constraints.STRONG_TREND_MIN_PERCENT_B : constraints.MIN_PERCENT_B;
                
                // StochRSI validation with strong trend exception
                if (stochRsiK4h < effectiveMinStochRsi) {
                  rejectedByStrategy++;
                  logger.forSymbol(symbol).warn(`"${strategy.name}": IMPROVEMENT 4 BLOCK - StochRSI K=${stochRsiK4h.toFixed(1)} < ${effectiveMinStochRsi} (oversold${isStrongTrendMode ? ', strong trend mode' : ''})`);
                  continue;
                }
                
                // In strong trend mode with low StochRSI, require it to be falling
                if (isStrongTrendMode && stochRsiK4h < constraints.MIN_STOCHRSI_K && constraints.STRONG_TREND_REQUIRE_FALLING && !stochRsiFalling) {
                  rejectedByStrategy++;
                  logger.forSymbol(symbol).warn(`"${strategy.name}": IMPROVEMENT 4 BLOCK - StochRSI K=${stochRsiK4h.toFixed(1)} oversold but NOT falling (K >= D) - bounce risk`);
                  continue;
                }
                
                // ADX requirement with 1h confidence override
                if (adx < effectiveMinAdx) {
                  rejectedByStrategy++;
                  const overrideNote = useReducedAdx ? ` (relaxed from ${constraints.MIN_ADX} due to 1h conf ${conf1h}%)` : '';
                  logger.forSymbol(symbol).warn(`"${strategy.name}": IMPROVEMENT 4 BLOCK - ADX ${adx.toFixed(1)} < ${effectiveMinAdx}${overrideNote}`);
                  continue;
                }
                
                // %B requirement with strong trend exception
                if (percentB < effectiveMinPercentB) {
                  rejectedByStrategy++;
                  logger.forSymbol(symbol).warn(`"${strategy.name}": IMPROVEMENT 4 BLOCK - %B ${percentB.toFixed(1)} < ${effectiveMinPercentB}${isStrongTrendMode ? ' (strong trend mode)' : ''}`);
                  continue;
                }
                
                // Fake breakout risk block
                if (constraints.BLOCK_ON_FAKE_BREAKOUT && fakeBreakoutRisk) {
                  rejectedByStrategy++;
                  logger.forSymbol(symbol).warn(`"${strategy.name}": IMPROVEMENT 4 BLOCK - fakeBreakoutRisk=true`);
                  continue;
                }
                
                const modeLabel = isStrongTrendMode ? ' [STRONG TREND MODE]' : '';
                const adxRelaxLabel = useReducedAdx ? ' [ADX RELAXED - 1h conf]' : '';
                logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} "${strategy.name}": IMPROVEMENT 4 constraints passed${modeLabel}${adxRelaxLabel} (ADX=${adx.toFixed(1)}, K=${stochRsiK4h.toFixed(1)}, %B=${percentB.toFixed(1)}, falling=${stochRsiFalling})`);
              }
              
              // EMA Golden Cross validation (LONG signals)
              if (strategy.name === 'EMA Golden Cross' || strategy.id === 'builtin-ema-golden') {
                const constraints = STRATEGY_SPECIFIC_CONSTRAINTS.EMA_GOLDEN_CROSS;
                const stochRsiRising = stochRsiK4h > stochRsiD4h;
                const isStrongTrendMode = adx >= constraints.STRONG_TREND_ADX_THRESHOLD;
                
                // IMPROVEMENT 2: Get 1h confidence for ADX relaxation
                const conf1h = trendData.timeframes?.['1h']?.confidence || 0;
                const is1hVeryConfident = conf1h >= 70;
                const is1hBullish = htfTrend1h === "bullish";
                
                // Allow reduced ADX (22 vs 25) when 1h is very confident AND aligned with LONG
                const useReducedAdx = is1hVeryConfident && is1hBullish;
                const effectiveMinAdx = useReducedAdx ? 22 : constraints.MIN_ADX;
                
                // Determine effective thresholds based on trend strength
                const effectiveMaxStochRsi = isStrongTrendMode ? constraints.STRONG_TREND_MAX_STOCHRSI_K : constraints.MAX_STOCHRSI_K;
                const effectiveMaxPercentB = isStrongTrendMode ? constraints.STRONG_TREND_MAX_PERCENT_B : constraints.MAX_PERCENT_B;
                
                // StochRSI validation with strong trend exception
                if (stochRsiK4h > effectiveMaxStochRsi) {
                  rejectedByStrategy++;
                  logger.forSymbol(symbol).warn(`"${strategy.name}": IMPROVEMENT 4 BLOCK - StochRSI K=${stochRsiK4h.toFixed(1)} > ${effectiveMaxStochRsi} (overbought${isStrongTrendMode ? ', strong trend mode' : ''})`);
                  continue;
                }
                
                // In strong trend mode with high StochRSI, require it to be rising
                if (isStrongTrendMode && stochRsiK4h > constraints.MAX_STOCHRSI_K && constraints.STRONG_TREND_REQUIRE_RISING && !stochRsiRising) {
                  rejectedByStrategy++;
                  logger.forSymbol(symbol).warn(`"${strategy.name}": IMPROVEMENT 4 BLOCK - StochRSI K=${stochRsiK4h.toFixed(1)} overbought but NOT rising (K <= D) - reversal risk`);
                  continue;
                }
                
                // ADX requirement with 1h confidence override
                if (adx < effectiveMinAdx) {
                  rejectedByStrategy++;
                  const overrideNote = useReducedAdx ? ` (relaxed from ${constraints.MIN_ADX} due to 1h conf ${conf1h}%)` : '';
                  logger.forSymbol(symbol).warn(`"${strategy.name}": IMPROVEMENT 4 BLOCK - ADX ${adx.toFixed(1)} < ${effectiveMinAdx}${overrideNote}`);
                  continue;
                }
                
                // %B requirement with strong trend exception
                if (percentB > effectiveMaxPercentB) {
                  rejectedByStrategy++;
                  logger.forSymbol(symbol).warn(`"${strategy.name}": IMPROVEMENT 4 BLOCK - %B ${percentB.toFixed(1)} > ${effectiveMaxPercentB}${isStrongTrendMode ? ' (strong trend mode)' : ''}`);
                  continue;
                }
                
                // Fake breakout risk block
                if (constraints.BLOCK_ON_FAKE_BREAKOUT && fakeBreakoutRisk) {
                  rejectedByStrategy++;
                  logger.forSymbol(symbol).warn(`"${strategy.name}": IMPROVEMENT 4 BLOCK - fakeBreakoutRisk=true`);
                  continue;
                }
                
                const modeLabel = isStrongTrendMode ? ' [STRONG TREND MODE]' : '';
                const adxRelaxLabel = useReducedAdx ? ' [ADX RELAXED - 1h conf]' : '';
                logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} "${strategy.name}": IMPROVEMENT 4 constraints passed${modeLabel}${adxRelaxLabel} (ADX=${adx.toFixed(1)}, K=${stochRsiK4h.toFixed(1)}, %B=${percentB.toFixed(1)}, rising=${stochRsiRising})`);
              }
              
              if (isMomentumType && !is4hDirectional) {
                // 4h is neutral - check if we can allow via 1h directional + momentum building
                const is1hDirectional = htfTrend1h === "bullish" || htfTrend1h === "bearish";
                const conf1h = trendData.timeframes?.['1h']?.confidence || 0;
                const is1hConfident = conf1h >= 60;
                const is1hVeryConfident = conf1h >= 70;  // IMPROVEMENT: Very high 1h confidence
                const isMomentumBuilding = earlyMomentumScore >= MOMENTUM_THRESHOLDS.MIN_SCORE;
                const momentumState = momentum?.state || "unknown";
                
                // IMPROVEMENT 1: Allow "mixed" momentum state when 1h confidence is very high (>=70%)
                // The strong 1h trend itself is the signal - we don't need momentum state confirmation
                const isMomentumStateGood = momentumState === "confirmed" || momentumState === "building" || 
                  (momentumState === "mixed" && is1hVeryConfident);
                
                // Allow if: 1h is directional with >= 60% confidence AND momentum score >= threshold
                const allowMomentumEntry = is1hDirectional && is1hConfident && isMomentumBuilding && isMomentumStateGood;
                
                if (allowMomentumEntry) {
                  const mixedOverride = momentumState === "mixed" ? " [MIXED STATE OVERRIDE - 1h conf >= 70%]" : "";
                  logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} "${strategy.name}" [${strategyType}]: MOMENTUM ALLOWED - 4h neutral but 1h ${htfTrend1h} (${conf1h}%), momentum ${momentumState} (score=${earlyMomentumScore})${mixedOverride}`);
                  // Continue with strategy evaluation - don't skip
                } else {
                  const skipReason = !is1hDirectional ? `1h neutral` : 
                    !is1hConfident ? `1h conf ${conf1h}% < 60%` :
                    !isMomentumBuilding ? `momentum score ${earlyMomentumScore} < ${MOMENTUM_THRESHOLDS.MIN_SCORE}` :
                    `momentum state ${momentumState} (need confirmed/building, or mixed with 1h conf >= 70%)`;
                  logger.forSymbol(symbol).warn(`"${strategy.name}" [${strategyType}]: SKIP - momentum strategy, 4h ${htfTrend4h}, ${skipReason}`);
                  
                  // Track for convergence fallback - strategy passed conditions but failed momentum filter
                  if (intendedSignalType) {
                    passedConditionsButFiltered.push({ name: strategy.name, reason: `momentum: ${skipReason}`, direction: intendedSignalType });
                  }
                  continue;
                }
              }
              
              // Determine what signal type this strategy would generate
              let strategySignalType: "long" | "short" | null = null;
              if (strategyDirection === 'long') {
                // Strategy only generates LONG signals - only valid in bullish/neutral trends
                if (tradeDirection === 'bearish') {
                  logger.forSymbol(symbol).warn(`"${strategy.name}": SKIP - long-only strategy in bearish trend`);
                  strategyNearMisses.push({ name: strategy.name, passedCount: entryConditions.length, totalConditions: entryConditions.length, failedConditions: [], skipReason: 'long-only in bearish trend' });
                  continue;
                }
                strategySignalType = 'long';
              } else if (strategyDirection === 'short') {
                // Strategy only generates SHORT signals - only valid in bearish/neutral trends  
                if (tradeDirection === 'bullish') {
                  logger.forSymbol(symbol).warn(`"${strategy.name}": SKIP - short-only strategy in bullish trend`);
                  strategyNearMisses.push({ name: strategy.name, passedCount: entryConditions.length, totalConditions: entryConditions.length, failedConditions: [], skipReason: 'short-only in bullish trend' });
                  continue;
                }
                strategySignalType = 'short';
              } else if (strategyDirection === 'neutral') {
                // ============= NEW: NEUTRAL STRATEGY DIRECTION DERIVATION =============
                // Neutral strategies work when 5m/15m trend is neutral but HTF shows direction
                // Derive direction from 4h first, then 1h if 4h is neutral
                const htf4hTrend = htfTrend4h;
                const htf4hConf = stochFilterConf4h || 0;
                const htf1hTrend = htfTrend1h;
                const htf1hConf = stochFilterConf1h || 0;
                
                if (htf4hTrend === 'bullish' && htf4hConf >= 55) {
                  strategySignalType = 'long';
                  logger.forSymbol(symbol).info(`${LOG_CATEGORIES.QUALITY} "${strategy.name}" (neutral): Using 4h direction → LONG (4h ${htf4hConf.toFixed(0)}% bullish)`);
                } else if (htf4hTrend === 'bearish' && htf4hConf >= 55) {
                  strategySignalType = 'short';
                  logger.forSymbol(symbol).info(`${LOG_CATEGORIES.QUALITY} "${strategy.name}" (neutral): Using 4h direction → SHORT (4h ${htf4hConf.toFixed(0)}% bearish)`);
                } else if (htf1hTrend === 'bullish' && htf1hConf >= 65) {
                  // 1h needs higher confidence since it's shorter timeframe
                  strategySignalType = 'long';
                  logger.forSymbol(symbol).info(`${LOG_CATEGORIES.QUALITY} "${strategy.name}" (neutral): Using 1h direction → LONG (4h neutral, 1h ${htf1hConf.toFixed(0)}% bullish)`);
                } else if (htf1hTrend === 'bearish' && htf1hConf >= 65) {
                  strategySignalType = 'short';
                  logger.forSymbol(symbol).info(`${LOG_CATEGORIES.QUALITY} "${strategy.name}" (neutral): Using 1h direction → SHORT (4h neutral, 1h ${htf1hConf.toFixed(0)}% bearish)`);
                } else {
                  // No clear HTF direction - skip neutral strategy
                  logger.forSymbol(symbol).warn(`"${strategy.name}": SKIP - neutral strategy but no clear HTF direction (4h=${htf4hTrend} ${htf4hConf.toFixed(0)}%, 1h=${htf1hTrend} ${htf1hConf.toFixed(0)}%)`);
                  strategyNearMisses.push({ name: strategy.name, passedCount: entryConditions.length, totalConditions: entryConditions.length, failedConditions: [], skipReason: `no HTF direction (4h=${htf4hTrend} ${htf4hConf.toFixed(0)}%, 1h=${htf1hTrend} ${htf1hConf.toFixed(0)}%)` });
                  continue;
                }
              } else if (strategyDirection === 'ranging') {
                // ============= NEW: RANGING MARKET MEAN REVERSION =============
                // This strategy ONLY activates when ADX is low (no clear trend)
                // Uses StochRSI extremes for mean reversion entries
                const RANGING_MAX_ADX = 23;  // Must be below this to be considered ranging
                const RANGING_STOCHRSI_OVERSOLD = 15;  // K below this = LONG opportunity
                const RANGING_STOCHRSI_OVERBOUGHT = 85; // K above this = SHORT opportunity
                
                // First check: ADX must be low (ranging market)
                if (adx >= RANGING_MAX_ADX) {
                  logger.forSymbol(symbol).warn(`"${strategy.name}": SKIP - ADX ${adx.toFixed(1)} >= ${RANGING_MAX_ADX} (not ranging)`);
                  strategyNearMisses.push({ name: strategy.name, passedCount: entryConditions.length, totalConditions: entryConditions.length, failedConditions: [], skipReason: `ADX ${adx.toFixed(1)} >= ${RANGING_MAX_ADX} (need ranging market)` });
                  continue;
                }
                
                // Determine direction based on StochRSI extremes
                if (stochRsiK4h <= RANGING_STOCHRSI_OVERSOLD) {
                  // Deeply oversold = LONG opportunity (expect bounce)
                  strategySignalType = 'long';
                  logger.forSymbol(symbol).info(`${LOG_CATEGORIES.QUALITY} "${strategy.name}" (ranging): ADX=${adx.toFixed(1)} < ${RANGING_MAX_ADX}, StochRSI K=${stochRsiK4h.toFixed(1)} <= ${RANGING_STOCHRSI_OVERSOLD} → LONG (mean reversion)`);
                } else if (stochRsiK4h >= RANGING_STOCHRSI_OVERBOUGHT) {
                  // Deeply overbought = SHORT opportunity (expect pullback)
                  strategySignalType = 'short';
                  logger.forSymbol(symbol).info(`${LOG_CATEGORIES.QUALITY} "${strategy.name}" (ranging): ADX=${adx.toFixed(1)} < ${RANGING_MAX_ADX}, StochRSI K=${stochRsiK4h.toFixed(1)} >= ${RANGING_STOCHRSI_OVERBOUGHT} → SHORT (mean reversion)`);
                } else {
                  // StochRSI not at extremes - no mean reversion opportunity
                  logger.forSymbol(symbol).warn(`"${strategy.name}": SKIP - StochRSI K=${stochRsiK4h.toFixed(1)} not at extremes (need <${RANGING_STOCHRSI_OVERSOLD} or >${RANGING_STOCHRSI_OVERBOUGHT})`);
                  strategyNearMisses.push({ name: strategy.name, passedCount: entryConditions.length, totalConditions: entryConditions.length, failedConditions: [], skipReason: `StochRSI K=${stochRsiK4h.toFixed(1)} not at extremes` });
                  continue;
                }
              } else {
                // 'trend' mode - follow the current trend direction
                if (tradeDirection === 'bullish') strategySignalType = 'long';
                else if (tradeDirection === 'bearish') strategySignalType = 'short';
                else {
                  // ============= NEW: DERIVE DIRECTION FROM HTF FOR TREND STRATEGIES TOO =============
                  // When tradeDirection is neutral, try to derive from HTF instead of skipping
                  const htf4hTrend = htfTrend4h;
                  const htf4hConf = stochFilterConf4h || 0;
                  const htf1hTrend = htfTrend1h;
                  const htf1hConf = stochFilterConf1h || 0;
                  
                  if (htf4hTrend === 'bullish' && htf4hConf >= 60) {
                    strategySignalType = 'long';
                    logger.forSymbol(symbol).info(`${LOG_CATEGORIES.QUALITY} "${strategy.name}" (trend): Neutral 5m → using 4h direction LONG (${htf4hConf.toFixed(0)}% bullish)`);
                  } else if (htf4hTrend === 'bearish' && htf4hConf >= 60) {
                    strategySignalType = 'short';
                    logger.forSymbol(symbol).info(`${LOG_CATEGORIES.QUALITY} "${strategy.name}" (trend): Neutral 5m → using 4h direction SHORT (${htf4hConf.toFixed(0)}% bearish)`);
                  } else if (htf1hTrend === 'bullish' && htf1hConf >= 70) {
                    strategySignalType = 'long';
                    logger.forSymbol(symbol).info(`${LOG_CATEGORIES.QUALITY} "${strategy.name}" (trend): Neutral 5m → using 1h direction LONG (${htf1hConf.toFixed(0)}% bullish)`);
                  } else if (htf1hTrend === 'bearish' && htf1hConf >= 70) {
                    strategySignalType = 'short';
                    logger.forSymbol(symbol).info(`${LOG_CATEGORIES.QUALITY} "${strategy.name}" (trend): Neutral 5m → using 1h direction SHORT (${htf1hConf.toFixed(0)}% bearish)`);
                  } else {
                    logger.forSymbol(symbol).warn(`"${strategy.name}": SKIP - neutral trend and no strong HTF direction`);
                    strategyNearMisses.push({ name: strategy.name, passedCount: entryConditions.length, totalConditions: entryConditions.length, failedConditions: [], skipReason: `neutral trend, HTF not strong (4h=${htf4hTrend} ${htf4hConf.toFixed(0)}%, 1h=${htf1hTrend} ${htf1hConf.toFixed(0)}%)` });
                    continue;
                  }
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

        // ============= IMPROVEMENT 4: MULTI-STRATEGY CONVERGENCE FALLBACK =============
        // When no single strategy passes all filters, but multiple agree on conditions
        // This captures setups that pass hard gates and quality checks but fail strategy-specific filters
        const CONVERGENCE_MIN_STRATEGIES = 2;
        const CONVERGENCE_MIN_QUALITY = 60;
        const CONVERGENCE_MIN_1H_CONF = 65;
        const CONVERGENCE_MAX_REVERSAL = 45;
        const CONVERGENCE_POSITION_MULT = 0.50;
        
        if (candidates.length === 0 && passedConditionsButFiltered.length >= CONVERGENCE_MIN_STRATEGIES) {
          // Check if convergence conditions are met
          const conf1h = trendData.timeframes?.['1h']?.confidence || 0;
          const reversalResult = calculateUnifiedReversalScore(trendData, tradeDirection === 'bullish' ? 'long' : 'short', 'unknown');
          
          // All filtered strategies must agree on direction
          const uniqueDirections = new Set(passedConditionsButFiltered.map(s => s.direction));
          const isDirectionConsensus = uniqueDirections.size === 1;
          const consensusDirection = passedConditionsButFiltered[0].direction;
          
          const canUseConvergence = 
            qualityScore >= CONVERGENCE_MIN_QUALITY &&
            conf1h >= CONVERGENCE_MIN_1H_CONF &&
            reversalResult.score < CONVERGENCE_MAX_REVERSAL &&
            isDirectionConsensus;
          
          if (canUseConvergence) {
            // Create a convergence candidate
            const convergenceStrategy = {
              id: 'convergence-entry',
              name: `Multi-Strategy Convergence (${passedConditionsButFiltered.map(s => s.name).join(' + ')})`,
              risk_settings: {
                stopLossPercent: 2.5,
                takeProfitPercent: 4,
                positionSizePercent: 1,  // Will be multiplied by CONVERGENCE_POSITION_MULT
                priority: 3
              }
            };
            
            // Get indicator values from the first filtered strategy's evaluation
            // (We don't have them stored, so use empty map - signal generation will recalculate)
            const convergenceIndicators = new Map<string, number>();
            convergenceIndicators.set("Price", parseFloat(marketDataMap.get(symbol)?.lastPrice || "0"));
            
            candidates.push({
              strategy: convergenceStrategy,
              score: qualityScore,
              indicatorValues: convergenceIndicators,
              signalType: consensusDirection,
              positionSizeMultiplier: CONVERGENCE_POSITION_MULT,
              convergenceEntry: true
            });
            
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} CONVERGENCE ENTRY: ${passedConditionsButFiltered.length} strategies agreed (${passedConditionsButFiltered.map(s => s.name).join(', ')}), direction=${consensusDirection}, quality=${qualityScore}, 1h conf=${conf1h}%`);
          } else {
            const blockReason = qualityScore < CONVERGENCE_MIN_QUALITY ? `quality ${qualityScore} < ${CONVERGENCE_MIN_QUALITY}` :
              conf1h < CONVERGENCE_MIN_1H_CONF ? `1h conf ${conf1h}% < ${CONVERGENCE_MIN_1H_CONF}%` :
              reversalResult.score >= CONVERGENCE_MAX_REVERSAL ? `reversal ${reversalResult.score} >= ${CONVERGENCE_MAX_REVERSAL}` :
              `no direction consensus`;
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} CONVERGENCE blocked: ${passedConditionsButFiltered.length} strategies agreed but ${blockReason}`);
          }
        }
        
        // ============= HIGH-QUALITY FALLBACK ENTRY =============
        // When quality is high, momentum is confirmed, but no strategy matched
        // Create a controlled fallback entry with reduced position size
        const FALLBACK_MIN_QUALITY = 70;
        const FALLBACK_MIN_HTF_CONF = 60;
        const FALLBACK_MAX_REVERSAL = 40;
        const FALLBACK_POSITION_MULT = 0.40;
        
        if (candidates.length === 0) {
          const conf4h = stochFilterConf4h || 0;
          const conf1h = stochFilterConf1h || 0;
          const htf4hDir = htfTrend4h;
          const htf1hDir = htfTrend1h;
          const momentumConfirmed = momentum?.state === 'confirmed' || momentum?.state === 'building';
          const reversalScore = unifiedReversal.score;
          
          // Determine fallback direction from HTF
          let fallbackDirection: "long" | "short" | null = null;
          if (htf4hDir === 'bullish' && conf4h >= FALLBACK_MIN_HTF_CONF) {
            fallbackDirection = 'long';
          } else if (htf4hDir === 'bearish' && conf4h >= FALLBACK_MIN_HTF_CONF) {
            fallbackDirection = 'short';
          } else if (htf1hDir === 'bullish' && conf1h >= 70) {
            fallbackDirection = 'long';
          } else if (htf1hDir === 'bearish' && conf1h >= 70) {
            fallbackDirection = 'short';
          }
          
          const canUseFallback = 
            qualityScore >= FALLBACK_MIN_QUALITY &&
            fallbackDirection !== null &&
            (momentumConfirmed || adx >= ADX_THRESHOLDS.STRONG) &&
            reversalScore < FALLBACK_MAX_REVERSAL;
          
          if (canUseFallback && fallbackDirection) {
            // Create fallback candidate
            const fallbackStrategy = {
              id: 'quality-fallback',
              name: `Quality+Momentum Fallback (Q=${qualityScore}, HTF=${fallbackDirection === 'long' ? htf4hDir : htf4hDir})`,
              risk_settings: {
                stopLossPercent: 2.0,  // Tighter stops for fallback
                takeProfitPercent: 3.5,
                positionSizePercent: 1,
                priority: 2
              }
            };
            
            const fallbackIndicators = new Map<string, number>();
            fallbackIndicators.set("Price", currentPrice);
            
            candidates.push({
              strategy: fallbackStrategy,
              score: qualityScore,
              indicatorValues: fallbackIndicators,
              signalType: fallbackDirection,
              positionSizeMultiplier: FALLBACK_POSITION_MULT,
              convergenceEntry: false
            });
            
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} HIGH-QUALITY FALLBACK ENTRY: quality=${qualityScore}, direction=${fallbackDirection}, momentum=${momentum?.state}, reversal=${reversalScore}`);
            logger.forSymbol(symbol).info(`   → Position size reduced to ${FALLBACK_POSITION_MULT * 100}% for fallback entry`);
          }
        }

        if (candidates.length === 0) {
          rejectedByStrategy++;
          const convergenceNote = passedConditionsButFiltered.length >= CONVERGENCE_MIN_STRATEGIES 
            ? ` (${passedConditionsButFiltered.length} passed conditions but failed convergence check)` 
            : '';
          perSymbolGateAttribution.set(symbol, { gate: 'NO_STRATEGY_MATCH', details: `0/${allStrategies.length} conditions met${convergenceNote}` });
          
          // Sort near-misses by how close they were (most conditions passed first)
          strategyNearMisses.sort((a, b) => {
            const aRatio = a.passedCount / a.totalConditions;
            const bRatio = b.passedCount / b.totalConditions;
            return bRatio - aRatio;
          });
          
          // Take top 5 closest strategies
          const topNearMisses = strategyNearMisses.slice(0, 5);
          
          await logRejectionWithAI(
            supabase, userId, symbol,
            `No strategy conditions met (quality passed: ${qualityScore}/100)${convergenceNote}`,
            {
              gate: "NO_STRATEGY_MATCH",
              qualityScore, breakdown,
              strategiesEvaluated: allStrategies.length,
              regime: regime.regime,
              passedConditionsButFiltered: passedConditionsButFiltered.length > 0 ? passedConditionsButFiltered : undefined,
              // NEW: Near-miss diagnostics for debugging
              strategyNearMisses: topNearMisses.length > 0 ? topNearMisses : undefined,
              // Fallback check info
              fallbackCheck: {
                qualityScore,
                minRequired: FALLBACK_MIN_QUALITY,
                htf4h: `${htfTrend4h} ${stochFilterConf4h?.toFixed(0) ?? 0}%`,
                htf1h: `${htfTrend1h} ${stochFilterConf1h?.toFixed(0) ?? 0}%`,
                momentumState: momentum?.state,
                reversalScore: unifiedReversal.score,
                eligible: qualityScore >= FALLBACK_MIN_QUALITY ? 'yes' : 'quality too low'
              }
            },
            trendData,
            false,
            earlyOrderFlowAnalysis
          );
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
          perSymbolGateAttribution.set(symbol, { gate: 'NO_STRATEGY_MATCH', details: `${candidates.length} disabled for ${currentRegimeType}` });
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
        
        // ============= PLAN FIX A: CONFIDENCE THRESHOLD ENFORCEMENT =============
        // Hard reject signals below min_confidence_threshold from risk_parameters
        // This prevents low-confidence entries like the BNBUSDT 53% case
        const minConfidenceThreshold = riskParams.min_confidence_threshold ?? 60;
        if (confidence < minConfidenceThreshold) {
          rejectedByHardGates++;
          perSymbolGateAttribution.set(symbol, { gate: 'CONFIDENCE_BELOW_THRESHOLD', details: `${confidence}% < ${minConfidenceThreshold}%` });
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} HARD BLOCK - Confidence ${confidence}% below threshold ${minConfidenceThreshold}% - "${strategy.name}" rejected`);
          await logRejectionWithAI(
            supabase, userId, symbol,
            `PLAN FIX A - CONFIDENCE BLOCK: ${confidence}% < ${minConfidenceThreshold}% threshold - "${strategy.name}" blocked`,
            { 
              gate: "CONFIDENCE_BELOW_THRESHOLD",
              confidence,
              threshold: minConfidenceThreshold,
              strategyName: strategy.name,
              signalType,
              qualityScore: best.score,
              message: "Signal confidence too low for reliable entry"
            },
            trendData,
            riskParams.ai_analysis_enabled !== false,
            earlyOrderFlowAnalysis
          );
          continue;
        }
        
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
            await logRejectionWithAI(
              supabase, userId, symbol,
              `BLOCK: Momentum strategy "${strategy.name}" at K=${stochRsiK4h.toFixed(1)} requires MACD > 0 for LONG`,
              { 
                strategyName: strategy.name, 
                stochRsiK4h: stochRsiK4h.toFixed(1),
                macdHistogram: macdHistogram.toFixed(4),
                macdAligned: false,
                gate: "MOMENTUM_MACD_ALIGNMENT_GATE"
              },
              trendData,
              false,
              earlyOrderFlowAnalysis
            );
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
            await logRejectionWithAI(
              supabase, userId, symbol,
              `BLOCK: Momentum strategy "${strategy.name}" at K=${stochRsiK4h.toFixed(1)} requires MACD < 0 for SHORT`,
              { 
                strategyName: strategy.name, 
                stochRsiK4h: stochRsiK4h.toFixed(1),
                macdHistogram: macdHistogram.toFixed(4),
                macdAligned: false,
                gate: "MOMENTUM_MACD_ALIGNMENT_GATE"
              },
              trendData,
              false,
              earlyOrderFlowAnalysis
            );
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
        // If pullback momentum bypass was applied but no exception type set, use MOMENTUM_CONTINUATION
        // This ensures all pullback momentum entries are consistently tracked for exit logic
        let appliedExceptionType: ExceptionType = exceptionResult.exceptionType;
        if (isPullbackValid && appliedExceptionType === 'NONE') {
          appliedExceptionType = 'MOMENTUM_CONTINUATION';
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK} EXCEPTION OVERRIDE: isPullbackValid=true with no hierarchy exception → setting exceptionType to MOMENTUM_CONTINUATION`);
        }
        
        // ============= POSITION SIZE CALCULATION WITH PROPER MULTIPLIER CHAINING =============
        // All multipliers are applied in sequence to ensure proper size reduction
        // Order: quality -> correlation -> recovery -> exception hierarchy
        
        // Step 1: Base size from quality score (using graduated quality penalties)
        const qualityPositionResult = getPositionSizeFromQuality(qualityScore, isPreRecovery, isInRecoveryMode);
        let positionSizeMultiplier = qualityPositionResult.multiplier;
        logger.forSymbol(symbol).debug(`Position size: base=${(positionSizeMultiplier * 100).toFixed(0)}% (quality=${qualityScore}, tier=${qualityPositionResult.tier})`);
        
        // Step 2: Reduce for correlation risk (0% risk = 100% size, 100% risk = 50% size)
        if (correlationCheck.riskScore > CORRELATION_PARAMS.SIZE_REDUCTION_THRESHOLD) {
          const correlationAdjustment = getCorrelationAdjustedSize(1.0, correlationCheck.riskScore);
          positionSizeMultiplier *= correlationAdjustment;
          logger.forSymbol(symbol).info(`🔗 Correlation adjustment - position size reduced to ${(correlationAdjustment * 100).toFixed(0)}% due to ${correlationCheck.riskScore.toFixed(0)}% correlation risk`);
        }
        
        // Step 3: Apply drawdown-based risk scaling (Finding 4) - applies before recovery
        if (drawdownPositionMultiplier < 1.0 && !isInRecoveryMode) {
          positionSizeMultiplier *= drawdownPositionMultiplier;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.REVERSAL} Drawdown scaling (${consecutiveLosses} losses) - position size: ${(positionSizeMultiplier * 100).toFixed(0)}%`);
        }
        
        // Step 4: Apply recovery mode reduction
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
        
        // Step 7: Apply strong trend HTF bypass reduction
        if (strongTrendHTFBypassApplied && trendContinuationPositionMultiplier < 1.0) {
          positionSizeMultiplier *= trendContinuationPositionMultiplier;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK} Strong trend HTF bypass - position size capped at ${(positionSizeMultiplier * 100).toFixed(0)}%`);
        }
        
        // Step 8: Apply pullback entry position reduction (50% default)
        if (isPullbackValid && pullbackPositionMultiplier < 1.0) {
          positionSizeMultiplier *= pullbackPositionMultiplier;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK} Pullback entry - position size reduced to ${(positionSizeMultiplier * 100).toFixed(0)}%`);
        }
        
        // Step 9: Apply early momentum position reduction (50%)
        if (earlyMomentumPositionMultiplier < 1.0) {
          positionSizeMultiplier *= earlyMomentumPositionMultiplier;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK} Early momentum entry - position size reduced to ${(positionSizeMultiplier * 100).toFixed(0)}%`);
        }
        
        // Step 10: Apply price action momentum position reduction (75%)
        if (priceActionMomentumPositionMultiplier < 1.0) {
          positionSizeMultiplier *= priceActionMomentumPositionMultiplier;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK} Price action momentum entry - position size reduced to ${(positionSizeMultiplier * 100).toFixed(0)}%`);
        }
        
        // Step 11: Apply trend acceleration position reduction (70% or 50% if overextended)
        if (trendAccelerationPositionMultiplier < 1.0) {
          positionSizeMultiplier *= trendAccelerationPositionMultiplier;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK} 🚀 Trend acceleration entry - position size reduced to ${(positionSizeMultiplier * 100).toFixed(0)}%`);
        }
        
        // Step 12: Apply continuation mode position reduction (55%)
        if (qualifiesForContinuationMode && continuationPositionMultiplier < 1.0) {
          positionSizeMultiplier *= continuationPositionMultiplier;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK} 📈 CONTINUATION MODE entry - position size: ${(positionSizeMultiplier * 100).toFixed(0)}%`);
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
          strategy_id: strategy.id?.startsWith('builtin-') ? null : strategy.id,  // Built-in strategies use string IDs, DB expects UUID
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
            // NEW: Track strong trend HTF bypass for execute-trade risk management
            strongTrendHTFBypass: strongTrendHTFBypassApplied,
            trendContinuationAtExtreme: strongTrendHTFBypassApplied,
            trendContinuationParams: strongTrendHTFBypassApplied ? {
              stopLossMultiplier: STRONG_TREND_HTF_BYPASS_PARAMS.STOP_LOSS_MULTIPLIER,
              breakEvenActivationPercent: STRONG_TREND_HTF_BYPASS_PARAMS.BREAK_EVEN_ACTIVATION_PERCENT,
              trailingActivationPercent: STRONG_TREND_HTF_BYPASS_PARAMS.TRAILING_ACTIVATION_PERCENT,
              positionSizeMultiplier: trendContinuationPositionMultiplier,
            } : null,
            // NEW: Track pullback momentum bypass for analytics
            isPullbackMomentumBypass: isPullbackValid,
            pullbackEntryDetails: isPullbackValid ? {
              stochFilterTrend4h,
              stochFilterConf4h,
              stochRsiK1h: stochRsiK1h.toFixed(1),
              stochRsiD1h: stochRsiD1h.toFixed(1),
              adx: adx.toFixed(1),
              momentumThresholdUsed: MOMENTUM_THRESHOLDS.PULLBACK_MIN_SCORE,
              positionSizePercent: (pullbackPositionMultiplier * 100).toFixed(0),
            } : null,
            // NEW: Trend acceleration tracking for dashboard indicator
            trendAcceleration: {
              detected: qualifiesForTrendAcceleration,
              movePercent: Math.abs(priceMove),
              adxRising: adxRisingForAcceleration,
              adx: adx,
              stochRsiK4h: stochRsiK4h,
              bypassType: qualifiesForTrendAcceleration ? 
                (momentumState === "none" && !momentumConfirms && !isStrongTrendException ? "MOMENTUM_BYPASS" : "TREND_ACCELERATION") : null,
              positionSizeMultiplier: qualifiesForTrendAcceleration ? trendAccelerationPositionMultiplier : 1.0,
              gatesBypassed: qualifiesForTrendAcceleration ? 
                [momentumState === "none" ? "NO_MOMENTUM_CONFIRMATION" : null].filter(Boolean) : [],
            },
            // Price action momentum for dashboard
            priceActionMomentum: {
              hasStrongMove: hasStrongMove,
              movePercent: Math.abs(priceMove),
              direction: priceDirection,
            },
            // NEW: Continuation mode tracking for dashboard
            continuationMode: {
              active: qualifiesForContinuationMode,
              adx: adx.toFixed(1),
              positionSizeMultiplier: continuationPositionMultiplier,
              gateResults: continuationModeResult?.gateResults || [],
              reason: continuationModeResult?.reason || null,
            },
            // NEW: Order flow analysis for dashboard consistency
            orderFlow: {
              score: orderFlowAnalysis.score,
              signal: orderFlowAnalysis.signal,
              confidence: orderFlowAnalysis.confidence,
              intendedDirection: earlyIntendedDirection,
              volumeSpike: orderFlowAnalysis.volumeSpike,
              priceRejection: orderFlowAnalysis.priceRejection,
              pressure: orderFlowAnalysis.pressure,
              qualityBonus: orderFlowScore, // The -15 to +15 impact
              reasons: orderFlowAnalysis.reasons,
            },
          },
          expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 minute TTL for actionable signals
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
    
    // ===== PER-SYMBOL GATE ATTRIBUTION LOG =====
    // Log which specific gate blocked each symbol for easy debugging
    if (perSymbolGateAttribution.size > 0) {
      // Group symbols by gate type for a concise summary
      const gateGroups = new Map<GateType, string[]>();
      perSymbolGateAttribution.forEach((value, symbol) => {
        const existing = gateGroups.get(value.gate) || [];
        existing.push(`${symbol}(${value.details})`);
        gateGroups.set(value.gate, existing);
      });
      
      // Log each gate type with its symbols
      logger.info(`${LOG_CATEGORIES.GATE} === PER-SYMBOL GATE ATTRIBUTION ===`);
      gateGroups.forEach((symbols, gate) => {
        logger.info(`${LOG_CATEGORIES.GATE} ${gate}: ${symbols.join(', ')}`);
      });
      logger.info(`${LOG_CATEGORIES.GATE} ===================================`);
    }

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
        byHardGates: rejectedByHardGates,
      },
      // Per-symbol attribution for API response
      perSymbolAttribution: Object.fromEntries(
        Array.from(perSymbolGateAttribution.entries()).map(([sym, val]) => [sym, val])
      ),
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
