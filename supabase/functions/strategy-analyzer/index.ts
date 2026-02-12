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
  // NEW: Deep StochRSI extreme hard gate (universal block, no exceptions)
  DEEP_STOCHRSI_HARD_GATE,
  // NEW: Strong Trend Override for Tier 0 gate (allows entries during capitulation moves)
  STRONG_TREND_TIER0_OVERRIDE,
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
  // NEW: Strong ADX Override and Regime-Aware Momentum
  STRONG_ADX_OVERRIDE_PARAMS,
  REGIME_AWARE_MOMENTUM_PARAMS,
  // NEW: Bollinger tiered bypass for strong trend re-entries
  BOLLINGER_TIERED_BYPASS_PARAMS,
  // NEW: Quiet trend detection for catching sustained directional drifts at low ADX
  QUIET_TREND_PARAMS,
  // NEW: Stealth trend detection for catching gradual price grinds
  STEALTH_TREND_PARAMS,
  // NEW: Late Grind Acceptance Mode - enter mid-move on failed pullback
  LATE_GRIND_ACCEPTANCE_PARAMS,
  // NEW: Correlation Confidence Multiplier - boost stealth score when symbols drift together
  CORRELATION_CONFIDENCE_PARAMS,
  // NEW: Momentum exhaustion override for strong-ADX confirmed-momentum scenarios
  MOMENTUM_EXHAUSTION_OVERRIDE_PARAMS,
  // NEW: Neutral persistence modeling for confidence bonus
  NEUTRAL_PERSISTENCE_PARAMS,
  // v1.1: ADX Gate minimal spec - single responsibility gate
  ADX_GATE_V1_1,
  // LEGACY (preserved for fallback): Low ADX trend exception for strong HTF setups
  LOW_ADX_TREND_EXCEPTION_PARAMS,
  // LEGACY: Phase 2 - Regime-adaptive ADX thresholds (now superseded by ADX_GATE_V1_1)
  REGIME_ADAPTIVE_ADX_PARAMS,
  // NEW: Phase 3 - Price Action Direction Override
  PRICE_ACTION_DIRECTION_OVERRIDE_PARAMS,
  // NEW: Phase 5 - Strong Momentum Override for undeniable momentum
  STRONG_MOMENTUM_OVERRIDE_PARAMS,
  // NEW: Phase 6 - Momentum Bonus System for gate relaxation
  MOMENTUM_BONUS_PARAMS,
  // NEW: Confirmed Momentum Direction Override - use MACD direction when trends neutral
  MOMENTUM_DIRECTION_OVERRIDE_PARAMS,
  // NEW: Phase 2 - Price Action Early Entry Override
  PRICE_ACTION_EARLY_ENTRY_PARAMS,
  // NEW: Phase 4 - ADX Rising Directional Bypass for HTF Extreme
  ADX_RISING_DIRECTIONAL_BYPASS_PARAMS,
  // NEW: Order Flow Direction Fallback - use order flow when trends neutral
  ORDER_FLOW_DIRECTION_PARAMS,
  // NEW: Pre-Momentum StochRSI Extreme Entry - catch moves before momentum confirms
  PRE_MOMENTUM_STOCHRSI_PARAMS,
  // NEW: Short-Term Alignment Override - when 1h/30m/micro all agree
  SHORT_TERM_ALIGNMENT_PARAMS,
  // NEW: StochRSI-ADX Alignment - reduce ADX threshold when indicators align
  STOCHRSI_ADX_ALIGNMENT_PARAMS,
  // NEW: Relaxed Order Flow when 1h directional
  RELAXED_ORDER_FLOW_PARAMS,
  // NEW: NO_MOMENTUM_CONFIRMATION gate parameters (ADX floor, exception budget)
  NO_MOMENTUM_GATE_PARAMS,
  type NoMomentumExceptionType,
  // PHASE 2: MACD Gate Optimization - duration and magnitude checks
  MACD_GATE_PARAMS,
  // NEW: Pre-Signal Validity Gate for semantic consistency
  SIGNAL_TYPE_VALIDITY_PARAMS,
  // PHASE 2: ADX Rising %B Bypass - allows extended %B when ADX rising
  ADX_RISING_PERCENT_B_BYPASS,
  // PHASE 8: Counter-Trend Protection Gate - single source of truth
  COUNTER_TREND_PROTECTION,
  // PHASE 1-4: Missed opportunity fixes
  TREND_CONTINUATION_AFTER_EXIT_PARAMS,
  STRONG_TREND_BOLLINGER_EXTENSION_PARAMS,
  EARLY_TREND_DETECTION_PARAMS,
  STRATEGY_ADX_RESTRICTIONS,
  MOMENTUM_DIRECTION_ALIGNMENT,
  // PHASE 13-15: Strategy-specific HTF alignment and ranging market protection
  STRATEGY_DIRECTION_REQUIREMENTS,
  RANGING_MARKET_PROTECTION,
  NEUTRAL_LOW_ADX_QUALITY_GATE,
  // PHASE 16: Strategy-independent adaptive signal generation
  ADAPTIVE_SIGNAL_MODE,
  // PHASE 17: Disable legacy strategies without exhaustion protection
  DISABLED_LEGACY_STRATEGIES,
  // PHASE 10-13: Trend exhaustion protection gates
  SAME_DIRECTION_REENTRY_PROTECTION,
  TREND_EXHAUSTION_PROTECTION,
  REGIME_TRANSITION_PROTECTION,
  MOMENTUM_REVERSAL_PROTECTION,
  // NEW: Squeeze momentum bypass for regime-aware gate system
  SQUEEZE_MOMENTUM_BYPASS_PARAMS,
  SQUEEZE_BREAKOUT_SIGNAL_PARAMS,
  // NEW: Move exhaustion filter to prevent late trend entries
  MOVE_EXHAUSTION_FILTER_PARAMS,
  // NEW: Momentum direction hard gate and flip detection
  MOMENTUM_DIRECTION_HARD_GATE,
  MOMENTUM_FLIP_DETECTION,
  MICRO_TREND_MOMENTUM_SAFETY,
  calculateMicroTrendScaling,
  type MicroTrendScalingInput,
  // NEW: Trend reversal detection and move exhausted reversal gates
  TREND_REVERSAL_DETECTION_GATE,
  MOVE_EXHAUSTED_REVERSAL_GATE,
  isMomentumStrategy,
  isNeutralStrategy,
  isTrendFollowingStrategy,
  isMeanReversionStrategy,
  detectStrategyType,
  MEAN_REVERSION_CONFIG,
  // NEW: LTF Confirmation Gate and Near-Extreme Protection
  LTF_CONFIRMATION_GATE,
  NEAR_EXTREME_PROTECTION_GATE,
  // NEW: Priority 1-2 Gates (no ADX override)
  MOMENTUM_SLOPE_GATE,
  LTF_SPIKE_PROTECTION_GATE,
  // NEW: BE Analysis Gates (ADX slope graduated, 1h confirmation, StochRSI runway)
  ADX_SLOPE_GRADUATED_GATE,
  HIGH_ADX_1H_CONFIRMATION_GATE,
  STOCHRSI_RUNWAY_GATE,
  // NEW: Counter-Trend Admission Layer (MR probe momentum tolerance)
  COUNTER_TREND_ADMISSION,
  // NEW: Capitulation Bounce Probe (post-capitulation balance zone entry)
  CAPITULATION_BOUNCE_PROBE,
  // NEW: Flash Crash Bounce Probe (rapid V-reversal capture)
  FLASH_CRASH_BOUNCE_PROBE,
  // NEW: Trend Continuation Pullback Regime (EMA-based re-entry)
  TREND_CONTINUATION_PULLBACK_REGIME,
  // NEW: Heartbeat and No-Trade State monitoring
  BOT_HEARTBEAT_CONFIG,
  NO_TRADE_ZONE_STATE,
  type ExceptionType,
  type MarketContext,
  // NEW: 4-State Regime Classifier
  FOUR_STATE_REGIME
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
  // NEW: Behavioral ADX exhaustion detection
  detectADXExhaustion,
  // NEW: Price action confirmation for Bollinger bypass
  checkBollingerBypassPriceAction,
  // NEW: Momentum flip detection and direction alignment
  detectMomentumFlip,
  checkMomentumDirectionAlignment,
  type MomentumScoreResult,
  type PullbackResult,
  type EntryQualityResult,
  type EntryConfirmationResult,
  type MarketRegimeResult as SmartRegimeResult,
  type ContinuationModeResult,
  type ADXExhaustionResult,
  type BollingerPriceActionResult,
  type MomentumFlipResult
} from "../_shared/smart-momentum.ts";
import { calculateRSIArray, calculateATR, calculateADXWithDirection, type ADXResult } from "../_shared/indicators.ts";
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
  checkEarlyIgnitionException,
  detectEarlyIgnitionEntry,
  deriveTradeDirection,
  getAdxPhase,
  getAdxPhaseInfo,
  detectBreakoutMode,
  calculateTrendStrength,
  determineExceptionPriority,
  checkExceptionBudget,
  // NEW: Phase 0-7 imports
  classifyMasterRegime,
  getEffectiveMomentumThreshold,
  applyQualityNearMissBoost,
  checkImpulseContinuation,
  // NEW: 4-State Regime Classifier
  classify4StateRegime,
  // CENTRALIZED EXTRACTION HELPERS (consistency across all edge functions)
  extractADX,
  extractADXSlope,
  extractStochRsiK,
  extractStochRsiD,
  extractAtrPercent,
  extractPriceChange,
  type UnifiedReversalResult,
  type MarketRegime,
  type MarketRegimeEnhancedResult,
  type SqueezeBreakoutResult,
  type EarlyIgnitionResult,
  type EarlyIgnitionEntryResult,
  type DirectionResult,
  type BreakoutModeResult,
  type TrendStrengthResult,
  type ExceptionResult,
  type ExceptionBudgetResult,
  type SetupType,
  type MasterRegimeResult,
  type ImpulseContinuationResult,
  type FourStateRegimeResult
} from "../_shared/scoring.ts";
import { analyzeOrderFlow, getOrderFlowQualityBonus, type OrderFlowAnalysis } from "../_shared/orderflow.ts";
import { checkPositionCorrelation, getCorrelationAdjustedSize } from "../_shared/correlation.ts";
import { createLogger, logError, LOG_CATEGORIES } from "../_shared/logging.ts";
import { getKlines, get24hrTicker, parseKlinePrices } from "../_shared/binance.ts";
import { 
  isShadowModeEnabled, 
  logShadowSignal, 
  compareMACDGate, 
  compareADXExhaustionGate, 
  compareStochRSIGate,
  type ShadowModeSignal 
} from "../_shared/shadow-mode.ts";
// NEW: Mean Reversion Strategy Module
import {
  detectExhaustion,
  checkSignalPrecedence,
  calculateMeanReversionStop,
  calculateMeanReversionTP,
  isExtremeMeanReversion,  // FIX #1 (Audit): Formal definition for Tier 1 bypass
  evaluateCounterTrendAdmission,  // Counter-Trend Admission Layer
  type ExhaustionSignal,
  type GateBypass,
  type CounterTrendAdmissionResult
} from "../_shared/mean-reversion.ts";
// NEW: Strategy-Independent Adaptive Signal Generation Module
import {
  generateAdaptiveSignal,
  determineAdaptiveDirection,
  calculateAdaptiveParameters,
  classifyEntryType,
  calculateAdaptiveQualityScore,
  getAdaptiveMinQuality,
  getEntryTypeLabel,
  type AdaptiveSignalResult,
  type AdaptiveContext,
  type AdaptiveEntryType
} from "../_shared/adaptive-signal.ts";

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
// ENHANCED: Automatically extracts StochRSI K/D and Bollinger %B values from trendData for all rejection logs
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
  // CENTRALIZED: Use shared extractors for consistent StochRSI extraction across all edge functions
  // Extract all timeframe K/D values for full diagnostic visibility
  const stochK4h = extractStochRsiK(trendData, '4h');
  const stochD4h = extractStochRsiD(trendData, '4h');
  const stochK1h = extractStochRsiK(trendData, '1h');
  const stochD1h = extractStochRsiD(trendData, '1h');
  const stochK30m = extractStochRsiK(trendData, '30m');
  const stochD30m = extractStochRsiD(trendData, '30m');
  const stochK15m = extractStochRsiK(trendData, '15m');
  const stochD15m = extractStochRsiD(trendData, '15m');
  
  const stochRsiData = {
    // FLAT FIELDS for UI compatibility (Issue #1 & #2 fix)
    stochRsiK: stochK4h,      // Primary 4h K (legacy field)
    stochRsiD: stochD4h,      // Primary 4h D (NEW - Issue #2)
    stochRsiK4h: stochK4h,    // Explicit 4h K
    stochRsiD4h: stochD4h,    // Explicit 4h D (NEW - Issue #2)
    stochRsiK1h: stochK1h,    // 1h K (NEW - Issue #1)
    stochRsiD1h: stochD1h,    // 1h D (NEW - Issue #1)
    stochRsiK30m: stochK30m,  // 30m K
    stochRsiD30m: stochD30m,  // 30m D
    stochRsiK15m: stochK15m,  // 15m K
    stochRsiD15m: stochD15m,  // 15m D
    // NESTED OBJECTS for structured access
    stochRsi4h: { k: stochK4h, d: stochD4h },
    stochRsi1h: { k: stochK1h, d: stochD1h },
    stochRsi30m: { k: stochK30m, d: stochD30m },
    stochRsi15m: { k: stochK15m, d: stochD15m }
  };
  
  // Extract Bollinger Band %B and squeeze values from trendData for consistent logging (all timeframes)
  const bb4h = trendData?.bollingerBands?.["4h"];
  const bb1h = trendData?.bollingerBands?.["1h"];
  const bb30m = trendData?.bollingerBands?.["30m"];
  const bb15m = trendData?.bollingerBands?.["15m"];
  const bollingerData = {
    bollinger4h: {
      percentB: bb4h?.percentB ?? null,
      squeeze: bb4h?.squeeze ?? null,
      squeezeIntensity: bb4h?.squeezeIntensity ?? null,
      pricePosition: bb4h?.pricePosition ?? null,
    },
    bollinger1h: {
      percentB: bb1h?.percentB ?? null,
      squeeze: bb1h?.squeeze ?? null,
      squeezeIntensity: bb1h?.squeezeIntensity ?? null,
      pricePosition: bb1h?.pricePosition ?? null,
    },
    bollinger30m: {
      percentB: bb30m?.percentB ?? null,
      squeeze: bb30m?.squeeze ?? null,
      squeezeIntensity: bb30m?.squeezeIntensity ?? null,
      pricePosition: bb30m?.pricePosition ?? null,
    },
    bollinger15m: {
      percentB: bb15m?.percentB ?? null,
      squeeze: bb15m?.squeeze ?? null,
      squeezeIntensity: bb15m?.squeezeIntensity ?? null,
      pricePosition: bb15m?.pricePosition ?? null,
    }
  };
  
  // Extract ADX and ADX slope for mean reversion diagnostics
  // IMPORTANT: Only use trendData values as FALLBACKS - never overwrite explicitly passed values
  const adxData = {
    adx: trendData?.volatility?.adx ?? trendData?.adx ?? null,
    adxSlope: trendData?.volatility?.adxSlope ?? trendData?.adxSlope ?? null,
    adxRising: trendData?.volatility?.adxRising ?? trendData?.momentum?.adxRising ?? null,
    // Also include ADX from other timeframes if available
    adx15m: trendData?.volatility?.adx15m ?? null,
    adx30m: trendData?.volatility?.adx30m ?? null,
    adx4h: trendData?.volatility?.adx4h ?? null,
  };
  
  // PHASE FIX: Always include volumeRatio unconditionally in rejection logs
  // Contract: volumeRatio must always be present (null = not computed, number = actual value)
  // This fixes the UI bug where missing volumeRatio defaulted to 1.0 ("100% Normal") incorrectly
  const volumeData = {
    // Extract volumeRatio from 1h timeframe (primary reference) with fallbacks to other timeframes
    // The volume object is structured as { "15m": {...volumeRatio...}, "30m": {...}, "1h": {...}, "4h": {...} }
    volumeRatio: trendData?.volume?.["1h"]?.volumeRatio ?? 
                 trendData?.volume?.["30m"]?.volumeRatio ?? 
                 trendData?.volume?.["4h"]?.volumeRatio ?? 
                 trendData?.volume?.["15m"]?.volumeRatio ?? 
                 trendData?.volume?.ratio ?? 
                 null,  // null = not computed, DO NOT default to 1.0
    volumeTrend: trendData?.volume?.["1h"]?.volumeTrend ?? 
                 trendData?.volume?.trend ?? 
                 null,
    volumeSpike: trendData?.volume?.["1h"]?.volumeSpike ?? 
                 trendData?.volume?.spike ?? 
                 null,
    volumeAboveMA: trendData?.volume?.aboveMA ?? 
                   (trendData?.volume?.["1h"]?.volumeRatio > 1.0 ? true : 
                    trendData?.volume?.["1h"]?.volumeRatio !== undefined ? false : null),
  };
  
  // Merge Order Flow data, StochRSI data, Bollinger data, ADX data, and Volume data into filters_status
  // CRITICAL FIX: filtersStatus takes precedence for explicitly passed values (like adxSlope from gate checks)
  // Spread order: base data first, then filtersStatus last to preserve gate-specific values
  let enrichedFiltersStatus = {
    ...stochRsiData, // Always include StochRSI K/D values
    ...bollingerData, // Always include Bollinger %B values
    ...adxData, // ADX and slope from trendData as fallback
    ...volumeData, // ALWAYS include volume data (null = unknown, not 1.0)
    ...filtersStatus, // LAST: Gate-specific values override defaults (e.g., adxSlope from ADX_SLOPE_GRADUATED)
  };
  
  // Add Order Flow data if provided
  if (orderFlow) {
    enrichedFiltersStatus = {
      ...enrichedFiltersStatus,
      order_flow: {
        score: orderFlow.score,
        signal: orderFlow.signal,
        confidence: orderFlow.confidence,
        volumeSpike: orderFlow.volumeSpike,
        priceRejection: orderFlow.priceRejection,
        pressure: orderFlow.pressure,
        reasons: orderFlow.reasons
      }
    };
  }

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

// ============= PHASE 1: PRE-SIGNAL VALIDITY GATE =============
// Checks semantic consistency between signal type and market state BEFORE quality scoring
// This prevents invalid signal types from reaching the scoring phase

interface SignalTypeValidation {
  isValid: boolean;
  blockReason?: string;
  violations: string[];
  signalType: string;
}

const validateSignalTypeRequirements = (
  strategyId: string,
  strategyName: string,
  trendData: any,
  derivedDirection: string
): SignalTypeValidation => {
  if (!SIGNAL_TYPE_VALIDITY_PARAMS.ENABLED) {
    return { isValid: true, violations: [], signalType: strategyName };
  }
  
  const violations: string[] = [];
  const adx = trendData?.volatility?.adx || 0;
  const adxSlope = trendData?.volatility?.adxSlope || 0;
  const momentum = trendData?.momentum || {};
  const momentumScore = momentum?.momentumScore || 0;
  const macdSlope = momentum?.macdSlope || 0;
  const regime = trendData?.regime?.regime || 'RANGING';
  const bbSqueeze = trendData?.bollingerBand?.squeeze || trendData?.bollingerBands?.['4h']?.squeeze || false;
  
  // MOMENTUM BREAKOUT strategy requirements
  const isMomentumBreakout = strategyId === 'builtin-momentum-breakout' || 
    strategyName === 'Momentum Breakout' ||
    strategyName.toLowerCase().includes('momentum');
  
  if (isMomentumBreakout) {
    const config = SIGNAL_TYPE_VALIDITY_PARAMS.MOMENTUM_BREAKOUT;
    
    // Requirement 1: ADX >= 25 (confirmed trend)
    if (adx < config.MIN_ADX) {
      violations.push(`ADX ${adx.toFixed(1)} < ${config.MIN_ADX} required`);
    }
    
    // Requirement 2: ADX slope >= 0 (not decaying)
    if (config.REQUIRE_ADX_NOT_FALLING && adxSlope < 0) {
      violations.push(`ADX slope ${adxSlope.toFixed(2)} negative (trend decaying)`);
    }
    
    // Requirement 3: Momentum score > 0 (positive momentum)
    if (config.REQUIRE_POSITIVE_MOMENTUM && momentumScore <= 0) {
      violations.push(`Momentum score ${momentumScore} not positive`);
    }
    
    // Requirement 4: MACD slope aligned with direction
    if (config.REQUIRE_MACD_ALIGNED) {
      const macdAligned = (derivedDirection === 'long' && macdSlope >= 0) ||
                         (derivedDirection === 'short' && macdSlope <= 0);
      if (!macdAligned) {
        violations.push(`MACD slope ${macdSlope.toFixed(3)} opposes ${derivedDirection}`);
      }
    }
    
    // Requirement 5: Market regime != RANGING (unless squeeze)
    if (config.BLOCK_IF_RANGING && regime === 'RANGING' && !bbSqueeze) {
      violations.push(`Regime RANGING without squeeze setup`);
    }
  }
  
  // ===== MEAN REVERSION strategy requirements =====
  const isMeanReversion = isMeanReversionStrategy(strategyId, strategyName);
  
  if (isMeanReversion) {
    const config = SIGNAL_TYPE_VALIDITY_PARAMS.MEAN_REVERSION;
    const rsi = trendData?.timeframes?.['1h']?.indicators?.rsi ?? 50;
    const stochRsi = momentum?.stochRsi || momentum?.stochRsiK || 50;
    
    // Requirement 1: ADX must NOT be too high (strong trends crush reversals)
    if (adx > config.MAX_ADX) {
      violations.push(`ADX ${adx.toFixed(1)} > ${config.MAX_ADX} (trend too strong for reversal)`);
    }
    
    // Requirement 2: ADX should NOT be expanding rapidly
    if (config.BLOCK_IF_ADX_EXPANDING && adxSlope > config.ADX_EXPANSION_THRESHOLD) {
      violations.push(`ADX slope ${adxSlope.toFixed(2)} > ${config.ADX_EXPANSION_THRESHOLD} (trend expanding)`);
    }
    
    // Requirement 3: RSI or StochRSI must be at extremes for the signal direction
    if (config.REQUIRE_EXTREME_READING) {
      const atExtreme = 
        (derivedDirection === 'long' && (rsi < config.RSI_OVERSOLD || stochRsi < config.STOCH_OVERSOLD)) ||
        (derivedDirection === 'short' && (rsi > config.RSI_OVERBOUGHT || stochRsi > config.STOCH_OVERBOUGHT));
      
      if (!atExtreme) {
        violations.push(`No extreme: RSI=${rsi.toFixed(1)}, StochRSI=${stochRsi.toFixed(1)} for ${derivedDirection}`);
      }
    }
    
    // Requirement 4: Momentum should NOT strongly confirm the trend (else not reversing)
    if (config.BLOCK_IF_MOMENTUM_CONFIRMS_TREND) {
      const momentumConfirmsTrend = 
        (derivedDirection === 'long' && momentumScore < -config.MOMENTUM_TREND_THRESHOLD) ||
        (derivedDirection === 'short' && momentumScore > config.MOMENTUM_TREND_THRESHOLD);
      
      if (momentumConfirmsTrend) {
        violations.push(`Momentum ${momentumScore} strongly confirms trend, not reversal`);
      }
    }
  }
  
  // ===== TREND FOLLOWING strategy requirements =====
  const isTrendFollowing = isTrendFollowingStrategy(strategyId, strategyName);
  
  if (isTrendFollowing) {
    const config = SIGNAL_TYPE_VALIDITY_PARAMS.TREND_FOLLOWING;
    
    // Requirement 1: ADX must be >= minimum (trend must exist)
    if (adx < config.MIN_ADX) {
      violations.push(`ADX ${adx.toFixed(1)} < ${config.MIN_ADX} (no trend for trend-following)`);
    }
    
    // Requirement 2: Momentum must be aligned with direction
    if (config.REQUIRE_MOMENTUM_ALIGNED) {
      const momentumAligned = 
        (derivedDirection === 'long' && momentumScore > config.MIN_ALIGNED_MOMENTUM) ||
        (derivedDirection === 'short' && momentumScore < -config.MIN_ALIGNED_MOMENTUM);
      
      if (!momentumAligned) {
        violations.push(`Momentum ${momentumScore} not aligned with ${derivedDirection} (need >${config.MIN_ALIGNED_MOMENTUM})`);
      }
    }
    
    // Requirement 3: ADX should NOT be exhausted (> threshold with negative slope)
    if (config.BLOCK_IF_EXHAUSTED && adx > config.EXHAUSTION_ADX && adxSlope < config.EXHAUSTION_SLOPE) {
      violations.push(`Trend exhausted: ADX ${adx.toFixed(1)} > ${config.EXHAUSTION_ADX} with slope ${adxSlope.toFixed(2)}`);
    }
    
    // Requirement 4: Market regime should NOT be RANGING
    if (config.BLOCK_IF_RANGING && regime === 'RANGING') {
      violations.push(`Regime RANGING not suitable for trend-following`);
    }
  }
  
  return {
    isValid: violations.length === 0,
    blockReason: violations.length > 0 ? violations.join(' | ') : undefined,
    violations,
    signalType: strategyName
  };
};

// ============= PHASE 2: HARD CONTRADICTION CHECKS =============
// These are checked at the symbol level (before per-strategy evaluation)

interface HardContradictionResult {
  hasContradiction: boolean;
  contradictionType?: string;
  details?: string;
}

const checkHardContradictions = (
  trendData: any,
  derivedDirection: string
): HardContradictionResult => {
  if (!SIGNAL_TYPE_VALIDITY_PARAMS.ENABLED) {
    return { hasContradiction: false };
  }
  
  const config = SIGNAL_TYPE_VALIDITY_PARAMS.HARD_CONTRADICTIONS;
  const momentum = trendData?.momentum || {};
  const momentumScore = momentum?.momentumScore || 0;
  const macdSlope = momentum?.macdSlope || 0;
  const adx = trendData?.volatility?.adx || 0;
  
  // CHECK 1: Momentum Direction Contradiction
  // Block if momentum score strongly contradicts direction
  // For LONG: momentum must not be strongly negative (< -10)
  // For SHORT: momentum must not be strongly positive (> +10)
  if (config.MOMENTUM_CONTRADICTION_ENABLED) {
    const threshold = Math.abs(config.MOMENTUM_CONTRADICTION_THRESHOLD); // Ensure positive
    const momentumContradicts = 
      (derivedDirection === 'long' && momentumScore < -threshold) ||
      (derivedDirection === 'short' && momentumScore > threshold);
    
    if (momentumContradicts) {
      return {
        hasContradiction: true,
        contradictionType: 'MOMENTUM_DIRECTION_OPPOSING',
        details: `MomScore=${momentumScore.toFixed(1)}, Dir=${derivedDirection}, Threshold=±${threshold}`
      };
    }
  }
  
  // CHECK 2: MACD + Low ADX Contradiction
  // MACD slope opposing direction at ADX < 30 = dangerous entry
  if (config.MACD_CONTRADICTION_ENABLED && adx < config.MACD_CONTRADICTION_MIN_ADX) {
    const macdOpposesDirection = 
      (derivedDirection === 'long' && macdSlope < -config.MACD_CONTRADICTION_MIN_SLOPE) ||
      (derivedDirection === 'short' && macdSlope > config.MACD_CONTRADICTION_MIN_SLOPE);
    
    if (macdOpposesDirection) {
      return {
        hasContradiction: true,
        contradictionType: 'MACD_DIRECTION_CONTRADICTION',
        details: `Slope=${macdSlope.toFixed(3)}, Dir=${derivedDirection}, ADX=${adx.toFixed(1)}`
      };
    }
  }
  
  return { hasContradiction: false };
};

// ============= PHASE 4: SQUEEZE STATE CLASSIFICATION =============
// Delay breakout classification during BB squeeze with low ADX

interface SqueezeClassificationResult {
  shouldReclassify: boolean;
  newClassification?: string;
  reason?: string;
}

const classifySqueezeState = (
  trendData: any,
  strategyName: string
): SqueezeClassificationResult => {
  const config = SIGNAL_TYPE_VALIDITY_PARAMS.SQUEEZE_RECLASSIFICATION;
  
  if (!config.ENABLED) {
    return { shouldReclassify: false };
  }
  
  const bbSqueeze = trendData?.bollingerBand?.squeeze || trendData?.bollingerBands?.['4h']?.squeeze || false;
  const adx = trendData?.volatility?.adx || 0;
  const isBreakoutStrategy = strategyName.toLowerCase().includes('breakout');
  
  if (bbSqueeze && adx < config.MAX_ADX_FOR_RECLASSIFICATION && isBreakoutStrategy && config.BLOCK_BREAKOUT_STRATEGIES) {
    return {
      shouldReclassify: true,
      newClassification: config.RECLASSIFY_TO,
      reason: `squeeze=true, ADX=${adx.toFixed(1)} < ${config.MAX_ADX_FOR_RECLASSIFICATION}`
    };
  }
  
  return { shouldReclassify: false };
};

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

// ============= PHASE 2: REGIME-ADAPTIVE ADX THRESHOLD FUNCTION =============
// Returns ADX threshold based on current market regime instead of fixed value
// FIXED: These thresholds are for EXCEPTION PATHS - lower = easier to qualify
// The main ADX gate still uses ADX_THRESHOLDS.MINIMUM (20)
// This function returns the threshold for LOW_ADX exceptions to apply
const getAdaptiveAdxThreshold = (regime: string | undefined): number => {
  if (!REGIME_ADAPTIVE_ADX_PARAMS.ENABLED) {
    return ADX_THRESHOLDS.MINIMUM;  // Default: 20
  }
  
  const normalizedRegime = (regime || 'ranging').toUpperCase();
  const thresholds = REGIME_ADAPTIVE_ADX_PARAMS.THRESHOLDS;
  
  // CRITICAL FIX: These should be LOWER for ranging/transition to HELP entries
  // Lower threshold = exception applies more easily = more entries allowed
  switch (normalizedRegime) {
    case 'RANGING':
      // Ranging: 18 - allows exceptions to trigger more easily
      return thresholds.RANGING || 18;
    case 'TRANSITION':
    case 'TRANSITIONING':
      // Transition: 16 - prime time for catching emerging trends
      return thresholds.TRANSITION || 16;
    case 'TRENDING':
    case 'STRONG_TREND':
      // Trending: 15 - established trends, ADX may be consolidating
      return thresholds.TRENDING || 15;
    case 'SQUEEZE':
    case 'SQUEEZE_BUILDING':
      // Squeeze: 14 - lowest threshold, breakouts work at low ADX
      return thresholds.SQUEEZE || 14;
    default:
      // Unknown regime - use moderate default (18)
      return 18;
  }
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
  const indicators1h = trendData?.timeframes?.['1h']?.indicators || {};
  const indicators30m = trendData?.timeframes?.['30m']?.indicators || {};
  // CENTRALIZED: Use shared extractors for StochRSI K values
  const k4h = extractStochRsiK(trendData, '4h');
  const k30m = extractStochRsiK(trendData, '30m');
  const stochRsi = trendData.stochasticRsi?.aggregated || {};
  const bollingerBands = trendData.bollingerBands || {};
  const bb1h = bollingerBands["1h"] || {};
  const bb30m = bollingerBands["30m"] || {};
  const rsi1h = indicators1h.rsi ?? 50;
  const rsi30m = indicators30m.rsi ?? 50;
  const adx = extractADX(trendData);
  const momentum = trendData?.momentum || {};
  const percentB1h = bb1h.percentB || 50;
  const percentB30m = bb30m.percentB || 50;
  const timeframes = trendData?.timeframes || {};
  
  // Use 1h RSI as primary, 30m for confirmation
  const rsi = rsi1h;
  const percentB = percentB1h;
  
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
  const trend30m = timeframes['30m']?.trend || timeframes['30m']?.indicators?.emaSignal || "neutral";
  const isBullishAligned = trend4h === "bullish" && trend1h === "bullish";
  const isBearishAligned = trend4h === "bearish" && trend1h === "bearish";
  
  // NEW: 30m pullback confirmation - pullback visible on 30m timeframe too
  const has30mPullbackConfirm = trend === "bullish" 
    ? (percentB30m < 40 || rsi30m < 45 || k30m < 40)  // Bullish: 30m showing oversold/pullback
    : (percentB30m > 60 || rsi30m > 55 || k30m > 60); // Bearish: 30m showing overbought/rally
  
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
    // 30m confirmation bonus: +3 points when 30m also shows pullback structure
    const mtfBonus = has30mPullbackConfirm ? 3 : 0;
    const mtfSuffix = has30mPullbackConfirm ? " [30m confirmed +3]" : "";
    
    // BEST ENTRY: Both RSI oversold AND near lower Bollinger
    if ((rsi < RSI_THRESHOLDS.BULLISH_PULLBACK || stochRsi.oversoldCount >= 1) && bollingerPullbackBullish) {
      const baseScore = 25 + mtfBonus;
      const weighted = applyStochRsiWeight(baseScore, "OPTIMAL: RSI oversold + near lower Bollinger band" + mtfSuffix);
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
      const baseScore = 18 + mtfBonus;
      const weighted = applyStochRsiWeight(baseScore, "Bullish pullback: RSI oversold in uptrend" + mtfSuffix);
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
      const baseScore = 15 + mtfBonus;
      const weighted = applyStochRsiWeight(baseScore, "Bullish pullback: Price near lower Bollinger band" + mtfSuffix);
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
      const baseScore = 12 + mtfBonus;
      const weighted = applyStochRsiWeight(baseScore, "Bullish pullback: StochRSI bullish cross" + mtfSuffix);
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
    // 30m confirmation bonus: +3 points when 30m also shows rally structure
    const mtfBonus = has30mPullbackConfirm ? 3 : 0;
    const mtfSuffix = has30mPullbackConfirm ? " [30m confirmed +3]" : "";
    
    // BEST ENTRY: Both RSI overbought AND near upper Bollinger
    if ((rsi > RSI_THRESHOLDS.BEARISH_RALLY || stochRsi.overboughtCount >= 1) && bollingerPullbackBearish) {
      const baseScore = 25 + mtfBonus;
      const weighted = applyStochRsiWeight(baseScore, "OPTIMAL: RSI overbought + near upper Bollinger band" + mtfSuffix);
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
      const baseScore = 18 + mtfBonus;
      const weighted = applyStochRsiWeight(baseScore, "Bearish rally: RSI overbought in downtrend" + mtfSuffix);
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
      const baseScore = 15 + mtfBonus;
      const weighted = applyStochRsiWeight(baseScore, "Bearish rally: Price near upper Bollinger band" + mtfSuffix);
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
      const baseScore = 12 + mtfBonus;
      const weighted = applyStochRsiWeight(baseScore, "Bearish rally: StochRSI bearish cross" + mtfSuffix);
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

    // Check if shadow mode is enabled for this user (defaults to true during validation period)
    const shadowModeEnabled = riskParams.shadow_mode_enabled ?? true;
    if (shadowModeEnabled) {
      logger.info(`🔮 Shadow mode ENABLED - tracking gate relaxation changes`);
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
    
    // ============= PARTIAL WIN CONFIGURATION =============
    // Break-even exits should not count as losses - they preserved capital
    // Trades that reached profitable peaks but ended flat/negative get partial credit
    const PARTIAL_WIN_WEIGHT = 0.5;  // How much a partial win counts (0.5 = half a win)
    const PARTIAL_WIN_PEAK_THRESHOLD = 0.3;  // Minimum peak P&L % to qualify as partial win
    const BREAK_EVEN_CLOSE_REASONS = ['break_even', 'break_even_stop'];  // Exclude from win rate
    
    // Fetch positions with trend, close_reason, and peak_pnl_percent for fair win rate calculation
    const { data: recentPositions } = await supabase
      .from("positions")
      .select("symbol, strategy_name, realized_pnl, trend, close_reason, peak_pnl_percent")
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
    // NEW: Track break-even and partial wins for fairer calculation
    const symbolWinRates = new Map<string, { 
      wins: number; 
      total: number; 
      winRate: number; 
      uniqueStrategies: Set<string>;
      breakEvenCount: number;
      partialWinCount: number;
    }>();
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
        const closeReason = trade.close_reason || '';
        const peakPnlPercent = trade.peak_pnl_percent || 0;
        const realizedPnl = trade.realized_pnl || 0;
        
        // ===== IMPROVED WIN RATE: Exclude break-even and credit partial wins =====
        // Skip break-even trades entirely (they preserved capital, not wins or losses)
        const isBreakEven = BREAK_EVEN_CLOSE_REASONS.includes(closeReason);
        
        // Partial win: reached profitable peak but ended flat/negative
        const isPartialWin = !isBreakEven && 
                             realizedPnl <= 0 && 
                             peakPnlPercent > PARTIAL_WIN_PEAK_THRESHOLD;
        
        // Full win: positive realized P&L
        const isFullWin = realizedPnl > 0;
        
        // Symbol performance with strategy diversity tracking (regime-agnostic for symbols)
        const symbolStats = symbolWinRates.get(trade.symbol) || { 
          wins: 0, 
          total: 0, 
          winRate: 0, 
          uniqueStrategies: new Set(),
          breakEvenCount: 0,
          partialWinCount: 0
        };
        
        if (isBreakEven) {
          // Break-even: don't count toward win rate at all
          symbolStats.breakEvenCount++;
        } else {
          // Count this trade
          symbolStats.total++;
          
          if (isFullWin) {
            symbolStats.wins += 1;
          } else if (isPartialWin) {
            symbolStats.wins += PARTIAL_WIN_WEIGHT;  // 0.5 win
            symbolStats.partialWinCount++;
          }
          // else: full loss, wins stays the same
          
          symbolStats.winRate = symbolStats.total > 0 ? (symbolStats.wins / symbolStats.total) * 100 : 0;
        }
        
        symbolStats.uniqueStrategies.add(strategyName);
        symbolWinRates.set(trade.symbol, symbolStats);
        
        // Strategy performance BY REGIME with symbol diversity tracking
        if (!strategyWinRatesByRegime.has(strategyName)) {
          strategyWinRatesByRegime.set(strategyName, new Map());
        }
        const strategyRegimes = strategyWinRatesByRegime.get(strategyName)!;
        const strategyStats = strategyRegimes.get(regime) || { wins: 0, total: 0, winRate: 0, uniqueSymbols: new Set() };
        
        // Apply same partial win logic to strategy stats
        if (!isBreakEven) {
          strategyStats.total++;
          if (isFullWin) {
            strategyStats.wins += 1;
          } else if (isPartialWin) {
            strategyStats.wins += PARTIAL_WIN_WEIGHT;
          }
          strategyStats.winRate = strategyStats.total > 0 ? (strategyStats.wins / strategyStats.total) * 100 : 0;
        }
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
          const lossCount = stats.total - stats.wins;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.REJECTION} SYMBOL FILTER: disabled - win rate ${stats.winRate.toFixed(1)}% < ${SYMBOL_WIN_RATE_THRESHOLD}% (${stats.wins.toFixed(1)}W/${lossCount.toFixed(1)}L, ${stats.breakEvenCount}BE, ${stats.partialWinCount} partial across ${stats.uniqueStrategies.size} strategies)`);
          
          // Log to rejection table so it appears in dashboard
          await logRejectionWithAI(
            supabase,
            userId,
            symbol,
            `SYMBOL DISABLED: Win rate ${stats.winRate.toFixed(1)}% below ${SYMBOL_WIN_RATE_THRESHOLD}% threshold (${stats.wins.toFixed(1)}W/${lossCount.toFixed(1)}L, ${stats.breakEvenCount} break-even excluded, ${stats.partialWinCount} partial wins across ${stats.uniqueStrategies.size} strategies)`,
            { 
              filterType: 'symbol_performance',
              winRate: stats.winRate,
              wins: stats.wins,
              losses: lossCount,
              totalTrades: stats.total,
              breakEvenCount: stats.breakEvenCount,
              partialWinCount: stats.partialWinCount,
              strategiesCount: stats.uniqueStrategies.size,
              threshold: SYMBOL_WIN_RATE_THRESHOLD
            },
            { direction: 'blocked' },
            false  // No AI analysis for symbol-level blocks
          );
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

    // ============================================================
    // UNIFIED ADAPTIVE STRATEGY SYSTEM
    // Only use built-in templates - no custom user strategies
    // The system automatically selects the best strategy based on:
    // - Market regime (trending/ranging)
    // - Quality scoring
    // - ADX/momentum conditions
    // ============================================================

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

    // Use only built-in templates that are not paused AND not in disabled legacy list
    // PHASE 17: Disable legacy strategies that lack exhaustion protection
    const disabledLegacySet = new Set(
      DISABLED_LEGACY_STRATEGIES.ENABLED 
        ? DISABLED_LEGACY_STRATEGIES.DISABLED_NAMES.map(n => n.toLowerCase())
        : []
    );
    
    const allStrategies = BUILT_IN_TEMPLATES.filter(t => {
      const nameLower = t.name.toLowerCase();
      
      // Check if manually paused
      if (pausedStrategyNames.has(nameLower)) {
        return false;
      }
      
      // Check if in disabled legacy list
      if (disabledLegacySet.has(nameLower)) {
        if (DISABLED_LEGACY_STRATEGIES.LOG_DISABLED) {
          logger.debug(`[LEGACY_DISABLED] Strategy "${t.name}" disabled - lacks exhaustion protection`);
        }
        return false;
      }
      
      return true;
    });
    
    // Log what strategies remain active
    if (DISABLED_LEGACY_STRATEGIES.ENABLED && DISABLED_LEGACY_STRATEGIES.LOG_DISABLED) {
      const disabledCount = DISABLED_LEGACY_STRATEGIES.DISABLED_NAMES.length;
      const activeNames = allStrategies.map(s => s.name).join(', ');
      logger.info(`${LOG_CATEGORIES.SUMMARY} PHASE 17: ${disabledCount} legacy strategies disabled. Active: ${activeNames || 'Adaptive Trend Entry only'}`);
    }
    
    // Helper: Check if strategy is disabled for a given regime
    const isStrategyDisabledForRegime = (strategyName: string, regime: RegimeType): boolean => {
      return disabledStrategiesByRegime.get(regime)?.has(strategyName) || false;
    };
    
    // Helper: Check if strategy is high performer for a given regime
    const isStrategyHighPerformerForRegime = (strategyName: string, regime: RegimeType): boolean => {
      return highPerformingStrategiesByRegime.get(regime)?.has(strategyName) || false;
    };
    
    logger.info(`${LOG_CATEGORIES.SUMMARY} ${activeSymbols.length} symbols | ${allStrategies.length} built-in strategies active (regime-aware filtering applied per symbol)`);

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

    // Sequential fetch with delay to reduce Binance API rate limiting (429 errors)
    // Each calculate-trend call makes multiple Binance API requests, so we need spacing
    const TREND_FETCH_DELAY_MS = 150; // 150ms between symbols to stay under rate limits
    
    const trendResults: { symbol: string; trendData: any }[] = [];
    for (let i = 0; i < eligibleSymbols.length; i++) {
      const symbol = eligibleSymbols[i];
      try {
        // Add delay between requests (skip first one)
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, TREND_FETCH_DELAY_MS));
        }
        const { data, error } = await supabase.functions.invoke("calculate-trend", { body: { symbol } });
        trendResults.push({ symbol, trendData: error ? null : data });
      } catch (err) {
        logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.BINANCE} Trend fetch failed: ${err}`);
        trendResults.push({ symbol, trendData: null });
      }
    }

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
      | 'NO_MOMENTUM_CONFIRMATION'
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
      | 'TREND_ACCELERATION_MOMENTUM_BYPASS'
      // NEW: Quiet trend detection gates
      | 'QUIET_TREND_ALLOWED'
      | 'QUIET_TREND_BLOCKED'
      // NEW: Stealth trend detection gates
      | 'STEALTH_TREND_ALLOWED'
      | 'STEALTH_TREND_HTF_BYPASS'
      // NEW: Momentum exhaustion override
      | 'MOMENTUM_EXHAUSTION_OVERRIDE'
      // Phase 1: Low ADX trend exception
      | 'LOW_ADX_TREND_EXCEPTION'
      // NEW: Pre-signal validity gates
      | 'SIGNAL_TYPE_SEMANTIC_MISMATCH'
      | 'SQUEEZE_RECLASSIFICATION'
      | 'HARD_CONTRADICTION'
      | 'MOMENTUM_DIRECTION_OPPOSING'
      | 'MACD_DIRECTION_CONTRADICTION'
      // PHASE 2: Price action early entry gate
      | 'PRICE_ACTION_EARLY_ALLOWED'
      // PHASE 8-9: Counter-trend and mature trend protection
      | 'COUNTER_TREND_PROTECTION'
      | 'MATURE_TREND_NO_PULLBACK'
      | 'STRATEGY_ADX_LIMIT'
      // PHASE 5: Position deduplication
      | 'POSITION_DEDUPLICATION'
      // PHASE 13-14: Strategy HTF alignment and ranging market protection
      | 'STRATEGY_HTF_ALIGNMENT'
      | 'RANGING_MARKET_PAUSE'
      // PHASE 10-13: Trend exhaustion protection gates
      | 'SAME_DIRECTION_COOLDOWN'
      | 'TREND_EXHAUSTION_PROTECTION'
      | 'REGIME_TRANSITION_PROTECTION'
      | 'MOMENTUM_REVERSAL_PROTECTION'
      // NEW: Move exhaustion gate to prevent late trend entries
      | 'MOVE_EXHAUSTED_SHORT'
      | 'MOVE_EXHAUSTED_LONG'
      // TIER 0: Deep StochRSI extreme hard gate (no exceptions)
      | 'TIER_0_DEEP_OVERSOLD'
      | 'TIER_0_DEEP_OVERBOUGHT'
      // EARLY TIER 0: Pre-strategy circuit breaker (runs before direction overrides)
      | 'EARLY_TIER_0_DEEP_OVERSOLD'
      | 'EARLY_TIER_0_DEEP_OVERBOUGHT'
      // Legacy aliases for backward compatibility
      | 'DEEP_STOCHRSI_OVERSOLD_HARD_GATE'
      | 'DEEP_STOCHRSI_OVERBOUGHT_HARD_GATE'
      // TIER 1: Severe HTF gate (no bypass, covers K 5-15 for shorts, 85-95 for longs)
      | 'SEVERE_HTF_OVERSOLD_BLOCK'
      | 'SEVERE_HTF_OVERBOUGHT_BLOCK'
      // Momentum direction hard gates
      | 'MOMENTUM_DIRECTION_HARD_GATE'
      | 'MOMENTUM_FLIP_COOLDOWN'
      // NEW: Trend reversal and move exhausted reversal gates
      | 'MOVE_EXHAUSTED_REVERSAL'
      | 'TREND_REVERSAL_DETECTION'
      // v1.1: ADX Gate minimal spec exceptions
      | 'SQUEEZE_EXPANSION_V11'
      | 'EARLY_IGNITION_V11'
      // NEW: Early Ignition Entry module (pre-expansion detection)
      | 'EARLY_IGNITION_ENTRY'
      // NEW: LTF Confirmation and Near-Extreme Protection Gates
      | 'LTF_COUNTER_ALIGNED'
      | 'LTF_BOTH_NEUTRAL'
      | 'LTF_BOTH_NEUTRAL_PLUS_MOMENTUM'
      | 'NEAR_24H_LOW_HARD'
      | 'NEAR_24H_LOW_SOFT'
      | 'NEAR_24H_HIGH_HARD'
      | 'NEAR_24H_HIGH_SOFT'
      // NEW: Priority 1-2 Gates (no ADX override)
      | 'MOMENTUM_SLOPE_GATE'
      | 'LTF_SPIKE_PROTECTION'
      // NEW: BE Analysis Gates
      | 'ADX_SLOPE_GRADUATED'
      | 'HIGH_ADX_1H_CONFIRMATION'
      | 'STOCHRSI_RUNWAY'
      // Counter-Trend Admission Layer
      | 'COUNTER_TREND_ADMISSION'
      // NEW: MR Probe Momentum Tolerance
      | 'MR_EXTREME_MOMENTUM_BLOCK'
      | 'MR_SAFETY_CHECK_FAILED'
      // NEW: Capitulation Bounce Probe
      | 'CAPITULATION_BOUNCE_PROBE'  // Post-capitulation balance zone entry
      // NEW: 4-State Regime Classifier gates
      | 'RANGE_COMPRESSION_BLOCK'
      | 'TREND_EXHAUSTION_CONTINUATION_BLOCK';
    
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
    // - Ultra-strong ADX (≥50): Allow lowest quality (ADX IS the confirmation)
    // - Very high ADX (≥45): Allow lower quality
    // - Strong ADX (≥35): Allow lower quality (more signals in strong trends)
    // - Normal ADX (20-35): Standard threshold
    // - Recovery mode: Higher threshold (fewer, higher quality signals)
    // - Low volume: Higher threshold (informational, not rejection)
    const BASE_MIN_QUALITY_SCORE = QUALITY_THRESHOLDS.BASE_MIN;
    const DEFAULT_MIN_QUALITY = BASE_MIN_QUALITY_SCORE;
    
    // ============= PHASE 4: ENHANCED QUALITY THRESHOLD WITH EARLY TREND DETECTION =============
    // Added: momentumScore and adxRising parameters for early trend exception
    const getMinQualityScore = (
      adx: number, 
      inRecovery: boolean, 
      confidence1h?: number, 
      isNeutralTrend?: boolean, 
      lowVolumeBoost: number = 0,
      momentumScore: number = 0,      // NEW: Smart momentum score for early trend detection
      adxRising: boolean = false,     // NEW: ADX direction for early trend detection
      macdExpanding: boolean = false  // NEW: MACD expansion for genuine momentum
    ): number => {
      let baseThreshold: number;
      
      if (inRecovery) {
        // SCENARIO 6 FIX (Finding 9): Cap recovery quality escalation to prevent system paralysis
        const recoveryQuality = BASE_MIN_QUALITY_SCORE + recoveryConfidenceBoost;
        baseThreshold = Math.min(recoveryQuality, QUALITY_THRESHOLDS.MAX_RECOVERY_QUALITY);
      } else if (isNeutralTrend) {
        // Neutral trends (with HTF direction) get lower threshold since quality scoring
        // is optimized for directional 5m trends - neutral relies on 1h direction instead
        // PHASE 15: If ADX is also below threshold, boost quality requirement
        if (NEUTRAL_LOW_ADX_QUALITY_GATE.ENABLED && adx < NEUTRAL_LOW_ADX_QUALITY_GATE.ADX_THRESHOLD) {
          baseThreshold = QUALITY_THRESHOLDS.NEUTRAL_MIN + NEUTRAL_LOW_ADX_QUALITY_GATE.QUALITY_THRESHOLD_BOOST;
        } else {
          baseThreshold = QUALITY_THRESHOLDS.NEUTRAL_MIN;
        }
      } else if (confidence1h && confidence1h >= 65) {
        // RELAXED: If 1h shows strong direction (≥65% confidence), allow lower threshold
        baseThreshold = QUALITY_THRESHOLDS.STRONG_1H_MIN;
      } else if (adx >= 50) {
        // NEW PHASE 2: Ultra-strong ADX (≥50) = ADX IS the quality confirmation
        // Very high trend strength proves the trade, lower threshold to 55
        baseThreshold = QUALITY_THRESHOLDS.ULTRA_STRONG_ADX_MIN;
      } else if (adx >= 45) {
        // NEW PHASE 2: Very high ADX (≥45) = strong trend, lower threshold to 58
        baseThreshold = QUALITY_THRESHOLDS.VERY_HIGH_ADX_MIN;
      } else if (adx >= ADX_THRESHOLDS.EXCEPTIONAL) {
        // Very strong trends = allow more signals
        baseThreshold = QUALITY_THRESHOLDS.EXCEPTIONAL_ADX_MIN;
      } else if (adx >= ADX_THRESHOLDS.STRONG) {
        baseThreshold = QUALITY_THRESHOLDS.STRONG_ADX_MIN;
      } else {
        baseThreshold = BASE_MIN_QUALITY_SCORE;
      }
      
      // ===== PHASE 4: EARLY TREND DETECTION EXCEPTION =====
      // Skip or reduce lowVolumeBoost when genuine momentum is present
      // This catches ETH-type scenarios where volume is temporarily depressed but momentum is real
      let effectiveLowVolumeBoost = lowVolumeBoost;
      
      // Conditions for early trend exception:
      // 1. Smart momentum score >= 12 (indicating genuine momentum)
      // 2. MACD is expanding (confirming directional pressure)
      // 3. ADX is rising OR already >= 18 (trend is building/present)
      const hasGenuineMomentum = momentumScore >= 12;
      const hasExpandingMacd = macdExpanding;
      const hasTrendEvidence = adxRising || adx >= 18;
      
      const qualifiesForEarlyTrendException = hasGenuineMomentum && hasExpandingMacd && hasTrendEvidence;
      
      if (qualifiesForEarlyTrendException && lowVolumeBoost > 0) {
        // Reduce or skip the low volume boost when genuine momentum is present
        // Halve the boost instead of eliminating it completely (conservative approach)
        effectiveLowVolumeBoost = Math.floor(lowVolumeBoost / 2);
        
        // Log when early trend exception is applied (will be logged in the main loop)
        // This is just a marker that can be used for logging
      }
      
      // Apply low-volume boost (informational tightening during low-activity periods)
      return baseThreshold + effectiveLowVolumeBoost;
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

      // ============= PHASE 5: POSITION DEDUPLICATION (30-MINUTE WINDOW) =============
      // Expert insight: Prevent multiple concurrent entries on the same symbol within 30 minutes
      // This reduces compound losses from duplicate entries during rapid signal generation
      // Uses .limit(1) defensively instead of .single() to prevent errors if multiple rows exist
      const deduplicationWindowMs = 30 * 60 * 1000; // 30 minutes
      const deduplicationCutoff = new Date(Date.now() - deduplicationWindowMs).toISOString();
      
      const { data: recentPositions, error: dedupError } = await supabase
        .from('positions')
        .select('id, opened_at, side, status')
        .eq('user_id', userId)
        .eq('symbol', symbol)
        .gte('opened_at', deduplicationCutoff)
        .limit(1);
      
      if (!dedupError && recentPositions && recentPositions.length > 0) {
        const recentPosition = recentPositions[0];
        const openedAgo = Math.round((Date.now() - new Date(recentPosition.opened_at).getTime()) / (1000 * 60));
        perSymbolGateAttribution.set(symbol, { gate: 'POSITION_DEDUPLICATION', details: `Position opened ${openedAgo}min ago` });
        
        logger.forSymbol(symbol).info(`POSITION_DEDUP: Skipping - ${recentPosition.status} position opened ${openedAgo}min ago (within 30min window)`);
        
        await supabase.from("signal_rejection_log").insert({
          user_id: userId, 
          symbol,
          rejection_reason: `Position deduplication: ${recentPosition.status} position opened ${openedAgo} minutes ago (within 30-minute window)`,
          filters_status: { 
            recentPositionId: recentPosition.id,
            recentPositionStatus: recentPosition.status,
            recentPositionSide: recentPosition.side,
            openedMinutesAgo: openedAgo,
            deduplicationWindowMinutes: 30,
            gate: 'POSITION_DEDUPLICATION'
          },
          checked_at: new Date().toISOString(),
        });
        continue;
      }

      // ============= PHASE 10: SAME-DIRECTION RE-ENTRY COOLDOWN =============
      // Expert insight: "When a trade closes due to timeout or trailing stop, the trend pauses"
      // Block same-direction entries for 45 minutes after non-loss exits
      // This was added after analyzing AVAXUSDT losses from re-entering same direction too quickly
      let sameDirectionCooldownActive = false;
      let cooldownSide: string | null = null;
      
      if (SAME_DIRECTION_REENTRY_PROTECTION.ENABLED) {
        const cooldownCutoff = new Date(Date.now() - SAME_DIRECTION_REENTRY_PROTECTION.COOLDOWN_MINUTES * 60 * 1000).toISOString();
        
        const { data: recentTimeoutClose } = await supabase
          .from('positions')
          .select('id, side, close_reason, closed_at, symbol')
          .eq('user_id', userId)
          .eq('symbol', symbol)
          .eq('status', 'closed')
          .in('close_reason', SAME_DIRECTION_REENTRY_PROTECTION.TRIGGER_CLOSE_REASONS as unknown as string[])
          .gte('closed_at', cooldownCutoff)
          .order('closed_at', { ascending: false })
          .limit(1);
        
        if (recentTimeoutClose && recentTimeoutClose.length > 0) {
          const recentClose = recentTimeoutClose[0];
          const closedMinutesAgo = Math.round((Date.now() - new Date(recentClose.closed_at).getTime()) / (1000 * 60));
          cooldownSide = recentClose.side;
          sameDirectionCooldownActive = true;
          
          if (SAME_DIRECTION_REENTRY_PROTECTION.LOG_BLOCKS) {
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} ⏳ SAME_DIRECTION_COOLDOWN: ${symbol} | ${recentClose.close_reason} closed ${closedMinutesAgo}min ago | Blocking ${cooldownSide === 'sell' ? 'SHORT' : 'LONG'} for ${SAME_DIRECTION_REENTRY_PROTECTION.COOLDOWN_MINUTES - closedMinutesAgo}min`);
          }
        }
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
        // CENTRALIZED: Use shared extractors for consistency across edge functions
        const adx = extractADX(trendData);
        const { slope: adxSlope, isRising: adxRising } = extractADXSlope(trendData);
        const momentum = trendData.momentum;
        
        // ============= ENHANCED TRUE ALIGNMENT FIELDS (v2.0) =============
        // Extract weighted components for smarter quality scoring and gate decisions
        const tf4hConfidence = trueAlignment?.tf4hConfidence ?? 0;
        const tf1hConfidence = trueAlignment?.tf1hConfidence ?? 0;
        const adxContribution = trueAlignment?.adxContribution ?? 0;
        const totalWeightedConfidence = trueAlignment?.totalWeightedConfidence ?? 0;
        const weightedComponents = trueAlignment?.weightedComponents || {};
        const neutralCapped = trueAlignment?.neutralCapped === true;
        const alignmentBreakdown = trueAlignment?.breakdown || {};
        
        // Log enhanced alignment data for visibility
        if (Object.keys(weightedComponents).length > 0) {
          logger.forSymbol(symbol).debug(`📊 TrueAlignment v2.0: score=${trendConsistency}, tf4h=${tf4hConfidence.toFixed(0)}, tf1h=${tf1hConfidence.toFixed(0)}, adxContrib=${adxContribution.toFixed(1)}${neutralCapped ? ' [CAPPED]' : ''}`);
        }
        
        // ============= NEUTRAL PERSISTENCE BONUS =============
        // Extract neutral persistence data for confidence bonuses on stealth/grind entries
        const neutralPersistence = trendData.neutralPersistence || {
          isCurrentlyNeutral: false,
          durationMinutes: 0,
          confidenceBonus: 0,
          reason: "No neutral persistence data"
        };
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

        // ============= EARLY SMART MOMENTUM CALCULATION =============
        // CRITICAL PIPELINE FIX: Calculate smartMomentum BEFORE deriveTradeDirection
        // This allows the graduated momentum penalty to prevent counter-momentum direction derivation
        // Previously: momentumScore was 0 during direction derivation, penalty ineffective
        // Now: Full momentum score available → extreme momentum (+100) applies 4x penalty → blocks SHORT
        const earlyPriceData = symbolHistoricalData?.prices || [];
        const earlyATR = calculateATR(klines, 14);
        
        // Calculate full ADX result for accurate slope
        const earlyFullAdxResult = calculateADXWithDirection(klines, 14);
        const earlyAdxSlope = earlyFullAdxResult.adxSlope ?? 0;
        const earlySmartAdxRising = earlyAdxSlope > 0 || (trendData.volatility?.adxRising === true);
        
        // Calculate momentum score (-100 to +100) EARLY in pipeline
        const earlySmartMomentum = calculateMomentumScore(klines, earlyPriceData, adx, earlySmartAdxRising, earlyATR);
        
        // INJECT into trendData so deriveTradeDirection can access it
        // This is critical: deriveTradeDirection reads trendData.smartMomentum?.score
        trendData.smartMomentum = earlySmartMomentum;
        
        logger.forSymbol(symbol).debug(`📊 EARLY SMART MOMENTUM: score=${earlySmartMomentum.score.toFixed(0)} (${earlySmartMomentum.direction}) | ADX slope=${earlyAdxSlope.toFixed(3)}, rising=${earlySmartAdxRising}`);

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
        const directionResult = deriveTradeDirection(trendData, trend, earlyOrderFlowAnalysis ? { score: earlyOrderFlowAnalysis.score, signal: earlyOrderFlowAnalysis.signal } : null);
        
        // Track if Strong Trend Tier 0 Override was applied (for position sizing)
        let strongTrendTier0OverrideApplied = false;
        let strongTrendTier0PositionMultiplier = 1.0;
        
        // ============= EARLY TIER 0: DEEP STOCHRSI CIRCUIT BREAKER (PRE-STRATEGY) =============
        // CRITICAL: This gate runs BEFORE any direction overrides (late-grind, momentum, order-flow, etc.)
        // This prevents legacy strategies from bypassing the unified pipeline gate by entering
        // at extreme StochRSI levels where reversal probability is ~80%+
        // 
        // ROOT CAUSE FIX: BTCUSDT K=100 entries bypassed the later TIER 0 gate because
        // the "MACD Signal Cross" strategy used a different code path. This early gate
        // catches ALL entries regardless of strategy path.
        if (DEEP_STOCHRSI_HARD_GATE.ENABLED) {
          // CENTRALIZED: Use shared extractor for StochRSI K
          const earlyStochRsiK4h = extractStochRsiK(trendData, '4h');
          const earlyDirection = directionResult.direction;  // May be null if no clear direction yet
          
          // Only check if we have an early direction - otherwise let downstream gates handle it
          if (earlyDirection) {
            // ===== STRONG TREND OVERRIDE PREPARATION =====
            // Extract values needed to check if Strong Trend Override applies
            const earlyAdxSlope = trendData?.volatility?.adxSlope ?? 0;
            const earlyMomentumScore = trendData?.momentum?.smartMomentum?.score ?? 0;
            const earlyMomentumDirection = trendData?.momentum?.smartMomentum?.direction ?? 'neutral';
            const early1hTrend = timeframes?.['1h']?.trend ?? 'neutral';
            const early1hConfidence = timeframes?.['1h']?.confidence ?? 0;
            
            // Helper: Check if Strong Trend Override conditions are met
            const checkStrongTrendOverride = (direction: 'long' | 'short'): { allowed: boolean; reason: string } => {
               // FIXED: Single authority - only check STRONG_TREND_TIER0_OVERRIDE.ENABLED
               // Removed ALLOW_STRONG_TREND_OVERRIDE to prevent configuration divergence
               if (!STRONG_TREND_TIER0_OVERRIDE.ENABLED) {
                return { allowed: false, reason: 'Strong Trend Override disabled' };
              }
              
              // Check ADX minimum
              if (adx < STRONG_TREND_TIER0_OVERRIDE.MIN_ADX) {
                return { allowed: false, reason: `ADX ${adx.toFixed(1)} < ${STRONG_TREND_TIER0_OVERRIDE.MIN_ADX}` };
              }
              
              // Check ADX slope (not falling sharply)
              if (earlyAdxSlope < STRONG_TREND_TIER0_OVERRIDE.MIN_ADX_SLOPE) {
                return { allowed: false, reason: `ADX slope ${earlyAdxSlope.toFixed(2)} < ${STRONG_TREND_TIER0_OVERRIDE.MIN_ADX_SLOPE}` };
              }
              
               // SIMPLIFIED: Check momentum score only (quantitative, stable)
               // Score inherently encodes direction: positive = bullish, negative = bearish
               // This removes the redundant direction enum check that caused over-filtering
              const momentumRequirement = direction === 'short' 
                ? earlyMomentumScore <= -STRONG_TREND_TIER0_OVERRIDE.MIN_MOMENTUM_SCORE  // Negative for shorts
                : earlyMomentumScore >= STRONG_TREND_TIER0_OVERRIDE.MIN_MOMENTUM_SCORE;   // Positive for longs
               if (!momentumRequirement) {
                 return { allowed: false, reason: `Momentum ${earlyMomentumScore.toFixed(0)} doesn't confirm ${direction} (need ${direction === 'short' ? '<=' : '>='} ${direction === 'short' ? '-' : ''}${STRONG_TREND_TIER0_OVERRIDE.MIN_MOMENTUM_SCORE})` };
              }
              
               // FIXED: Check 1H alignment using config value instead of hardcoded 60
               // 1H is only considered "opposing" if confidence >= MIN_1H_OPPOSING_CONFIDENCE
              if (STRONG_TREND_TIER0_OVERRIDE.REQUIRE_1H_ALIGNMENT) {
                const is1hOpposing = direction === 'short' 
                   ? early1hTrend === 'bullish' && early1hConfidence >= STRONG_TREND_TIER0_OVERRIDE.MIN_1H_OPPOSING_CONFIDENCE
                   : early1hTrend === 'bearish' && early1hConfidence >= STRONG_TREND_TIER0_OVERRIDE.MIN_1H_OPPOSING_CONFIDENCE;
                if (is1hOpposing) {
                   return { allowed: false, reason: `1H trend ${early1hTrend} (${early1hConfidence}%) opposes ${direction} (threshold: ${STRONG_TREND_TIER0_OVERRIDE.MIN_1H_OPPOSING_CONFIDENCE}%)` };
                }
              }
              
              return { 
                allowed: true, 
                 reason: `ADX=${adx.toFixed(1)}, slope=${earlyAdxSlope.toFixed(2)}, momentum=${earlyMomentumScore.toFixed(0)}` 
              };
            };
            
            // TIER 0 DEEP OVERSOLD: Block SHORTs when K < 5
            // EXCEPTION 1: Mean reversion strategies targeting bounce (LONG) are allowed at K < 5
            // EXCEPTION 2: Strong Trend Override allows SHORT if ADX>40 and momentum confirms
            // EXCEPTION 3: Capitulation Bounce Probe - flip to LONG if probe conditions met
            if (earlyDirection === 'short' && earlyStochRsiK4h < DEEP_STOCHRSI_HARD_GATE.DEEP_OVERSOLD_K_THRESHOLD) {
              const overrideCheck = checkStrongTrendOverride('short');
              
              // ===== CAPITULATION BOUNCE PROBE CHECK (before blocking) =====
              // If probe conditions are met, we flip direction to LONG instead of blocking
              let capitulationProbeTriggered = false;
              if (CAPITULATION_BOUNCE_PROBE.ENABLED && earlyStochRsiK4h <= CAPITULATION_BOUNCE_PROBE.MAX_STOCHRSI_K) {
                const priceDropPercent = trendData?.priceDistanceFromSwing?.distanceFromHighPercent ?? 0;
                const momentumCollapsed = earlyMomentumScore >= CAPITULATION_BOUNCE_PROBE.MOMENTUM_COLLAPSED_MIN && 
                                          earlyMomentumScore <= CAPITULATION_BOUNCE_PROBE.MOMENTUM_COLLAPSED_MAX;
                const highAdxExhausting = adx >= CAPITULATION_BOUNCE_PROBE.MIN_ADX && 
                                          earlyAdxSlope <= CAPITULATION_BOUNCE_PROBE.MAX_ADX_SLOPE;
                
                // Check HTF structure stability
                let htfStructureStable = true;
                let candlesSinceNewLow = 0;
                if (CAPITULATION_BOUNCE_PROBE.REQUIRE_HTF_STRUCTURE_STABLE) {
                  const klines4h = trendData?.klines4h ?? [];
                  if (klines4h.length >= 3) {
                    const recentLows = klines4h.slice(-5).map((k: { low?: number }) => k.low ?? 0);
                    const currentLow = recentLows[recentLows.length - 1] ?? 0;
                    for (let i = recentLows.length - 2; i >= 0; i--) {
                      if (currentLow < recentLows[i]) break;
                      candlesSinceNewLow++;
                    }
                    htfStructureStable = candlesSinceNewLow >= CAPITULATION_BOUNCE_PROBE.MIN_CANDLES_SINCE_NEW_LOW;
                  }
                }
                
                // Check volatility stabilization
                let volatilityOk = true;
                let volatilityValidatedBy = 'not_required';
                if (CAPITULATION_BOUNCE_PROBE.REQUIRE_VOLATILITY_NOT_EXPANDING) {
                  const atrChange = trendData?.volatility?.atrSlope ?? 0;
                  const bbWidthChange = trendData?.volatility?.bbWidthChange ?? 0;
                  const atrStabilized = atrChange < CAPITULATION_BOUNCE_PROBE.ATR_EXPANSION_THRESHOLD;
                  const bbStabilized = Math.abs(bbWidthChange) < CAPITULATION_BOUNCE_PROBE.BB_WIDTH_STABILIZING_THRESHOLD;
                  volatilityOk = atrStabilized || bbStabilized;
                  if (volatilityOk) {
                    volatilityValidatedBy = atrStabilized ? `atr_slope=${atrChange.toFixed(2)}` : `bb_width_change=${bbWidthChange.toFixed(2)}%`;
                  }
                }
                
                const sufficientDrop = priceDropPercent >= CAPITULATION_BOUNCE_PROBE.MIN_DROP_PERCENT;
                
                if (sufficientDrop && momentumCollapsed && highAdxExhausting && htfStructureStable && volatilityOk) {
                  capitulationProbeTriggered = true;
                  earlyDirection = 'long'; // Flip direction for probe
                  
                  // Calculate position size
                  const volumeRatio = trendData?.volume?.['1h']?.volumeRatio ?? trendData?.timeframes?.['1h']?.volumeRatio ?? 1.0;
                  const probeSize = volumeRatio >= CAPITULATION_BOUNCE_PROBE.VOLUME_SPIKE_THRESHOLD 
                    ? CAPITULATION_BOUNCE_PROBE.WITH_VOLUME_SPIKE 
                    : CAPITULATION_BOUNCE_PROBE.BASE_POSITION_SIZE;
                  
                  logger.forSymbol(symbol).info(
                    `${LOG_CATEGORIES.SUCCESS} 🔄 CAPITULATION BOUNCE PROBE ACTIVATED (at Tier 0):\n` +
                    `   → Regime: ${CAPITULATION_BOUNCE_PROBE.REGIME_TAG}\n` +
                    `   → StochRSI K: ${earlyStochRsiK4h.toFixed(1)} (pinned at extreme)\n` +
                    `   → Price Drop: ${priceDropPercent.toFixed(1)}% (significant capitulation)\n` +
                    `   → Momentum: ${earlyMomentumScore.toFixed(0)} (collapsed to neutral)\n` +
                    `   → ADX: ${adx.toFixed(1)} slope=${earlyAdxSlope.toFixed(2)} (high but exhausting)\n` +
                    `   → HTF Structure: ${candlesSinceNewLow} candles since new low (stable)\n` +
                    `   → Volatility: ${volatilityValidatedBy}\n` +
                    `   → Direction: FLIPPED to LONG (from SHORT)\n` +
                    `   → Position: ${(probeSize * 100).toFixed(0)}% (probe size)`
                  );
                  
                  // Store probe metadata for downstream use
                  (trendData as Record<string, unknown>).capitulationBounceProbe = {
                    active: true,
                    regime: CAPITULATION_BOUNCE_PROBE.REGIME_TAG,
                    positionMultiplier: probeSize,
                    stochK4h: earlyStochRsiK4h,
                    priceDrop: priceDropPercent,
                    momentum: earlyMomentumScore,
                    adx: adx,
                    adxSlope: earlyAdxSlope,
                    volatilityValidatedBy,
                    candlesSinceNewLow
                  };
                  
                  // Continue processing with flipped direction (don't block)
                } else {
                  // Log near-miss for diagnostics
                  const failedConditions: string[] = [];
                  if (!sufficientDrop) failedConditions.push(`drop=${priceDropPercent.toFixed(1)}% < ${CAPITULATION_BOUNCE_PROBE.MIN_DROP_PERCENT}%`);
                  if (!momentumCollapsed) failedConditions.push(`momentum=${earlyMomentumScore.toFixed(0)} not in [${CAPITULATION_BOUNCE_PROBE.MOMENTUM_COLLAPSED_MIN}, ${CAPITULATION_BOUNCE_PROBE.MOMENTUM_COLLAPSED_MAX}]`);
                  if (!highAdxExhausting) failedConditions.push(`ADX=${adx.toFixed(1)} < ${CAPITULATION_BOUNCE_PROBE.MIN_ADX} or slope=${earlyAdxSlope.toFixed(2)} > ${CAPITULATION_BOUNCE_PROBE.MAX_ADX_SLOPE}`);
                  if (!htfStructureStable) failedConditions.push(`HTF unstable (${candlesSinceNewLow} candles < ${CAPITULATION_BOUNCE_PROBE.MIN_CANDLES_SINCE_NEW_LOW})`);
                  if (!volatilityOk) failedConditions.push('volatility expanding');
                  
                  logger.forSymbol(symbol).info(
                    `${LOG_CATEGORIES.GATE} 📋 CAPITULATION BOUNCE NEAR-MISS: K=${earlyStochRsiK4h.toFixed(1)}\n` +
                    `   → Price drop: ${priceDropPercent.toFixed(1)}% (need >=${CAPITULATION_BOUNCE_PROBE.MIN_DROP_PERCENT}%)\n` +
                    `   → Momentum: ${earlyMomentumScore.toFixed(0)} (need ${CAPITULATION_BOUNCE_PROBE.MOMENTUM_COLLAPSED_MIN} to ${CAPITULATION_BOUNCE_PROBE.MOMENTUM_COLLAPSED_MAX})\n` +
                    `   → ADX: ${adx.toFixed(1)} slope=${earlyAdxSlope.toFixed(2)} (need >=${CAPITULATION_BOUNCE_PROBE.MIN_ADX}, slope<=${CAPITULATION_BOUNCE_PROBE.MAX_ADX_SLOPE})\n` +
                    `   → HTF Structure: ${candlesSinceNewLow} candles since new low (need >=${CAPITULATION_BOUNCE_PROBE.MIN_CANDLES_SINCE_NEW_LOW})\n` +
                    `   → Failed: ${failedConditions.join(', ')}`
                  );
                }
              }
              
              // ===== FLASH CRASH BOUNCE PROBE CHECK (NEW) =====
              // Fires when Capitulation Bounce didn't trigger due to ADX slope/structure guards
              // Flash crashes keep ADX slope positive and bounce on same candle as low
              let flashCrashProbeTriggered = false;
              if (!capitulationProbeTriggered && FLASH_CRASH_BOUNCE_PROBE.ENABLED) {
                const priceDropPercent = trendData?.priceDistanceFromSwing?.distanceFromHighPercent ?? 0;
                const stochK4h = earlyStochRsiK4h;
                const stochK1h = extractStochRsiK(trendData, '1h');
                
                // ===== PHASE 1: STATIC EXHAUSTION (K currently pinned) =====
                const phase1Triggered = stochK4h <= FLASH_CRASH_BOUNCE_PROBE.PHASE_1_MAX_STOCHRSI_K || 
                                        stochK1h <= FLASH_CRASH_BOUNCE_PROBE.PHASE_1_MAX_STOCHRSI_K;
                
                // ===== PHASE 2: RELEASE STATE (K was recently pinned, now recovering) =====
                // This catches V-shaped bounces where momentum leads price
                let phase2Triggered = false;
                let phase2Details = '';
                let recentMinK = stochK4h;
                let phase2Diagnostics: Record<string, unknown> = {};
                
                if (!phase1Triggered && FLASH_CRASH_BOUNCE_PROBE.PHASE_2_ENABLED) {
                  // Extract recent StochRSI K values from klines
                  const klines4h = trendData?.klines4h ?? trendData?.timeframes?.['4h']?.klines ?? [];
                  const lookback = FLASH_CRASH_BOUNCE_PROBE.PHASE_2_LOOKBACK_CANDLES;
                  
                  // Try to get historical K values from indicators or compute from klines
                  const recentKValues: number[] = [];
                  let historySource = 'none';
                  
                  // Method 1: Check if we have stochRsi history in trend data (4h)
                  const stochHistory4h = trendData?.stochRsiHistory?.['4h'] ?? trendData?.timeframes?.['4h']?.stochRsiHistory ?? [];
                  if (Array.isArray(stochHistory4h) && stochHistory4h.length >= lookback) {
                    // Use last N K values
                    for (let i = stochHistory4h.length - lookback; i < stochHistory4h.length; i++) {
                      const kValue = typeof stochHistory4h[i] === 'object' && stochHistory4h[i]?.k !== undefined
                        ? stochHistory4h[i].k
                        : (typeof stochHistory4h[i] === 'number' ? stochHistory4h[i] : null);
                      if (kValue !== null) recentKValues.push(kValue);
                    }
                    historySource = '4h';
                  }
                  
                  // Method 2: Fall back to computing from 1h data (more granular)
                  if (recentKValues.length < 2) {
                    const stochHistory1h = trendData?.stochRsiHistory?.['1h'] ?? trendData?.timeframes?.['1h']?.stochRsiHistory ?? [];
                    if (Array.isArray(stochHistory1h) && stochHistory1h.length >= 4) {
                      // Check last 12 hours of 1h data (3 x 4h candles equivalent)
                      const lookback1h = Math.min(12, stochHistory1h.length);
                      for (let i = stochHistory1h.length - lookback1h; i < stochHistory1h.length; i++) {
                        const kValue = typeof stochHistory1h[i] === 'object' && stochHistory1h[i]?.k !== undefined
                          ? stochHistory1h[i].k
                          : (typeof stochHistory1h[i] === 'number' ? stochHistory1h[i] : null);
                        if (kValue !== null) recentKValues.push(kValue);
                      }
                      historySource = '1h';
                    }
                  }
                  
                  // Find minimum K in recent history
                  if (recentKValues.length > 0) {
                    recentMinK = Math.min(...recentKValues);
                  }
                  
                  // Check Phase 2 conditions:
                  // 1. K was recently at floor (within lookback)
                  const wasAtFloor = recentMinK <= FLASH_CRASH_BOUNCE_PROBE.PHASE_2_FLOOR_THRESHOLD;
                  
                  // 2. Current K is still low but recovering (INCLUDE 1H - Issue 3 fix)
                  const include1hRecovery = FLASH_CRASH_BOUNCE_PROBE.PHASE_2_INCLUDE_1H_RECOVERY ?? true;
                  const currentKRecovering = include1hRecovery 
                    ? (stochK4h <= FLASH_CRASH_BOUNCE_PROBE.PHASE_2_CURRENT_MAX_K || stochK1h <= FLASH_CRASH_BOUNCE_PROBE.PHASE_2_CURRENT_MAX_K)
                    : stochK4h <= FLASH_CRASH_BOUNCE_PROBE.PHASE_2_CURRENT_MAX_K;
                  
                  // Determine which K to use for rise calculation (use the one that's recovering)
                  const effectiveCurrentK = (include1hRecovery && stochK1h <= FLASH_CRASH_BOUNCE_PROBE.PHASE_2_CURRENT_MAX_K && stochK4h > FLASH_CRASH_BOUNCE_PROBE.PHASE_2_CURRENT_MAX_K)
                    ? stochK1h
                    : stochK4h;
                  
                  // 3. K has risen enough (momentum snapback)
                  const kRise = effectiveCurrentK - recentMinK;
                  const hasMinRise = kRise >= FLASH_CRASH_BOUNCE_PROBE.PHASE_2_MIN_K_RISE;
                  
                  // 4. K is actively rising (not stalling) - FIXED: Use 2-step confirmation (Issue 2)
                  let kIsRising = true;
                  let risingSteps = 0;
                  const minRisingSteps = FLASH_CRASH_BOUNCE_PROBE.PHASE_2_MIN_RISING_STEPS ?? 2;
                  
                  if (FLASH_CRASH_BOUNCE_PROBE.PHASE_2_REQUIRE_K_RISING && recentKValues.length >= 3) {
                    // Count how many consecutive rising steps in last 3 values
                    // FIXED Issue 1: Use last element as most recent comparison (not second-to-last)
                    const checkValues = recentKValues.slice(-3);
                    for (let i = 1; i < checkValues.length; i++) {
                      if (checkValues[i] > checkValues[i - 1]) {
                        risingSteps++;
                      }
                    }
                    // Also check current value against last history value
                    if (recentKValues.length > 0) {
                      const lastHistoryK = recentKValues[recentKValues.length - 1];
                      if (effectiveCurrentK > lastHistoryK) {
                        risingSteps++;
                      }
                    }
                    kIsRising = risingSteps >= minRisingSteps;
                  } else if (FLASH_CRASH_BOUNCE_PROBE.PHASE_2_REQUIRE_K_RISING && recentKValues.length >= 1) {
                    // Fallback: at least check current vs last
                    const lastHistoryK = recentKValues[recentKValues.length - 1];
                    kIsRising = effectiveCurrentK > lastHistoryK;
                    risingSteps = kIsRising ? 1 : 0;
                  }
                  
                  // 5. Momentum stabilization guardrail (Issue 4 fix)
                  // Phase 2 requires momentum to be stabilizing (not at worst opposing level)
                  const phase2MomentumEnabled = FLASH_CRASH_BOUNCE_PROBE.PHASE_2_MOMENTUM_STABILIZATION ?? true;
                  const phase2MomentumMax = FLASH_CRASH_BOUNCE_PROBE.PHASE_2_MOMENTUM_MAX_OPPOSING ?? 28;
                  const momentumStabilizing = !phase2MomentumEnabled || earlyMomentumScore >= -phase2MomentumMax;
                  
                  // Store diagnostics for logging and metadata
                  phase2Diagnostics = {
                    recentMinK,
                    currentK: effectiveCurrentK,
                    kRise,
                    kIsRising,
                    risingSteps,
                    minRisingSteps,
                    wasAtFloor,
                    currentKRecovering,
                    hasMinRise,
                    momentumStabilizing,
                    momentumScore: earlyMomentumScore,
                    phase2MomentumMax,
                    historySource,
                    recentKValuesCount: recentKValues.length,
                    include1hRecovery
                  };
                  
                  phase2Triggered = wasAtFloor && currentKRecovering && hasMinRise && kIsRising && momentumStabilizing;
                  
                  if (phase2Triggered) {
                    phase2Details = `Phase 2 RELEASE: min_K=${recentMinK.toFixed(1)} → current=${effectiveCurrentK.toFixed(1)} (rise=${kRise.toFixed(1)}, risingSteps=${risingSteps}/${minRisingSteps}, momentum=${earlyMomentumScore.toFixed(0)})`;
                  } else if (wasAtFloor && priceDropPercent >= 8) {
                    // Log near-miss for Phase 2 with detailed diagnostics
                    const failedReasons: string[] = [];
                    if (!currentKRecovering) failedReasons.push(`current_K too high (4h=${stochK4h.toFixed(1)}, 1h=${stochK1h.toFixed(1)} > ${FLASH_CRASH_BOUNCE_PROBE.PHASE_2_CURRENT_MAX_K})`);
                    if (!hasMinRise) failedReasons.push(`rise insufficient (${kRise.toFixed(1)} < ${FLASH_CRASH_BOUNCE_PROBE.PHASE_2_MIN_K_RISE})`);
                    if (!kIsRising) failedReasons.push(`not enough rising steps (${risingSteps} < ${minRisingSteps})`);
                    if (!momentumStabilizing) failedReasons.push(`momentum not stabilizing (${earlyMomentumScore.toFixed(0)} < ${-phase2MomentumMax})`);
                    
                    logger.forSymbol(symbol).info(
                      `${LOG_CATEGORIES.INFO} 📊 FLASH CRASH PHASE 2 CHECK:\n` +
                      `   → Recent min K: ${recentMinK.toFixed(1)} (threshold ≤${FLASH_CRASH_BOUNCE_PROBE.PHASE_2_FLOOR_THRESHOLD})\n` +
                      `   → Current K: 4h=${stochK4h.toFixed(1)}, 1h=${stochK1h.toFixed(1)} (effective=${effectiveCurrentK.toFixed(1)}, max allowed: ${FLASH_CRASH_BOUNCE_PROBE.PHASE_2_CURRENT_MAX_K})\n` +
                      `   → K Rise: ${kRise.toFixed(1)} (min required: ${FLASH_CRASH_BOUNCE_PROBE.PHASE_2_MIN_K_RISE})\n` +
                      `   → K Rising Steps: ${risingSteps}/${minRisingSteps}\n` +
                      `   → Momentum Stabilizing: ${momentumStabilizing} (score=${earlyMomentumScore.toFixed(0)}, max opposing=${-phase2MomentumMax})\n` +
                      `   → History Source: ${historySource} (${recentKValues.length} values)\n` +
                      `   → Phase 2 result: ${wasAtFloor ? '✓floor' : '✗floor'} ${currentKRecovering ? '✓current' : '✗current'} ${hasMinRise ? '✓rise' : '✗rise'} ${kIsRising ? '✓rising' : '✗rising'} ${momentumStabilizing ? '✓momentum' : '✗momentum'}\n` +
                      `   → Failed: ${failedReasons.join(', ') || 'none'}`
                    );
                  }
                }
                
                // Combined check: Phase 1 (static) OR Phase 2 (release state)
                const stochRsiConditionMet = phase1Triggered || phase2Triggered;
                
                // Velocity check: estimate drop duration and calculate drop rate per hour
                const calculateDropDuration = (): number => {
                  const klines1h = trendData?.klines1h ?? [];
                  const high24h = trendData?.priceDistanceFromSwing?.high24h ?? 0;
                  const lookbackHours = FLASH_CRASH_BOUNCE_PROBE.MAX_DROP_HOURS;
                  
                  if (!klines1h.length) return 24; // Default to full 24h
                  
                  // IMPROVED: First try to find local high within MAX_DROP_HOURS window
                  // This handles post-consolidation breakdowns where 24h high is stale
                  const recentKlines = klines1h.slice(-lookbackHours);
                  if (recentKlines.length > 0) {
                    // Find the highest candle within recent window
                    let localHighIdx = 0;
                    let localHighPrice = 0;
                    for (let i = 0; i < recentKlines.length; i++) {
                      const candleHigh = typeof recentKlines[i] === 'object' && 'high' in recentKlines[i] 
                        ? recentKlines[i].high 
                        : (Array.isArray(recentKlines[i]) ? parseFloat(recentKlines[i][2]) : 0);
                      if (candleHigh > localHighPrice) {
                        localHighPrice = candleHigh;
                        localHighIdx = i;
                      }
                    }
                    // If we found a local high within the window, use that duration
                    const localDropHours = recentKlines.length - localHighIdx;
                    if (localDropHours > 0 && localDropHours <= lookbackHours) {
                      return localDropHours;
                    }
                  }
                  
                  // Fallback: Find candle where price was at or near 24h high
                  if (high24h > 0) {
                    for (let i = klines1h.length - 1; i >= 0; i--) {
                      const candleHigh = typeof klines1h[i] === 'object' && 'high' in klines1h[i] 
                        ? klines1h[i].high 
                        : (Array.isArray(klines1h[i]) ? parseFloat(klines1h[i][2]) : 0);
                      if (candleHigh >= high24h * 0.999) {
                        return klines1h.length - i;
                      }
                    }
                  }
                  return 24;
                };
                
                const dropHours = Math.max(1, calculateDropDuration());
                const dropRatePerHour = priceDropPercent / dropHours;
                const velocityOk = !FLASH_CRASH_BOUNCE_PROBE.REQUIRE_VELOCITY_CONFIRMATION || 
                                   dropRatePerHour >= FLASH_CRASH_BOUNCE_PROBE.MIN_HOURLY_DROP_RATE;
                
                // Velocity also requires drop happened quickly (within MAX_DROP_HOURS)
                const dropWithinTimeWindow = dropHours <= FLASH_CRASH_BOUNCE_PROBE.MAX_DROP_HOURS;
                
                // Momentum check: not extreme opposing (allow more momentum than capitulation)
                const momentumOk = earlyMomentumScore >= -FLASH_CRASH_BOUNCE_PROBE.MOMENTUM_MAX_OPPOSING;
                
                // ADX check (ignores slope - key difference from Capitulation)
                const adxOk = adx >= FLASH_CRASH_BOUNCE_PROBE.MIN_ADX;
                
                const sufficientDrop = priceDropPercent >= FLASH_CRASH_BOUNCE_PROBE.MIN_DROP_PERCENT;
                
                // Reversal candle detection (optional size boost)
                const detectReversalCandle = (): boolean => {
                  const klines15m = trendData?.klines15m ?? [];
                  if (klines15m.length < 2) return false;
                  
                  const getCandleData = (k: any) => {
                    if (typeof k === 'object' && 'open' in k) {
                      return { open: k.open, high: k.high, low: k.low, close: k.close };
                    } else if (Array.isArray(k)) {
                      return { 
                        open: parseFloat(k[1]), 
                        high: parseFloat(k[2]), 
                        low: parseFloat(k[3]), 
                        close: parseFloat(k[4]) 
                      };
                    }
                    return null;
                  };
                  
                  const current = getCandleData(klines15m[klines15m.length - 1]);
                  const prior = getCandleData(klines15m[klines15m.length - 2]);
                  
                  if (!current || !prior) return false;
                  
                  // Bullish engulfing
                  const isBullishEngulfing = 
                    prior.close < prior.open &&  // Prior bearish
                    current.close > current.open && // Current bullish
                    current.close > prior.open &&   // Close above prior open
                    current.open < prior.close;     // Open below prior close
                  
                  // Hammer pattern
                  const bodySize = Math.abs(current.close - current.open);
                  const lowerWick = Math.min(current.open, current.close) - current.low;
                  const isHammer = bodySize > 0 && lowerWick >= bodySize * 2;
                  
                  return isBullishEngulfing || isHammer;
                };
                
                if (sufficientDrop && stochRsiConditionMet && adxOk && velocityOk && dropWithinTimeWindow && momentumOk) {
                  flashCrashProbeTriggered = true;
                  earlyDirection = 'long'; // Flip direction for bounce capture
                  
                  // Calculate position size with scaling
                  const volumeRatio = trendData?.volume?.['1h']?.volumeRatio ?? 
                                      trendData?.timeframes?.['1h']?.volumeRatio ?? 1.0;
                  const hasReversalCandle = detectReversalCandle();
                  
                  let probeSize = FLASH_CRASH_BOUNCE_PROBE.BASE_POSITION_SIZE;
                  let sizeReason = 'base';
                  if (hasReversalCandle) {
                    probeSize = FLASH_CRASH_BOUNCE_PROBE.WITH_REVERSAL_CANDLE;
                    sizeReason = 'reversal_candle';
                  } else if (volumeRatio >= FLASH_CRASH_BOUNCE_PROBE.VOLUME_SPIKE_THRESHOLD) {
                    probeSize = FLASH_CRASH_BOUNCE_PROBE.WITH_VOLUME_SPIKE;
                    sizeReason = 'volume_spike';
                  }
                  
                  // Determine trigger phase for logging
                  const triggerPhase = phase1Triggered ? 'Phase 1 (STATIC)' : 'Phase 2 (RELEASE)';
                  const stochDetails = phase1Triggered 
                    ? `4h=${stochK4h.toFixed(1)}, 1h=${stochK1h.toFixed(1)} (pinned at floor NOW)`
                    : `4h=${stochK4h.toFixed(1)} (recent_min=${recentMinK.toFixed(1)}, RECOVERING)`;
                  
                  logger.forSymbol(symbol).info(
                    `${LOG_CATEGORIES.SUCCESS} 🔥 FLASH CRASH BOUNCE PROBE ACTIVATED (at Tier 0):\n` +
                    `   → Regime: ${FLASH_CRASH_BOUNCE_PROBE.REGIME_TAG}\n` +
                    `   → Trigger: ${triggerPhase}\n` +
                    `   → StochRSI K: ${stochDetails}\n` +
                    `   → Price Drop: ${priceDropPercent.toFixed(1)}% in ${dropHours}h (${dropRatePerHour.toFixed(1)}%/h)\n` +
                    `   → Momentum: ${earlyMomentumScore.toFixed(0)} (within tolerance >=${-FLASH_CRASH_BOUNCE_PROBE.MOMENTUM_MAX_OPPOSING})\n` +
                    `   → ADX: ${adx.toFixed(1)} slope=${earlyAdxSlope.toFixed(2)} (slope IGNORED for flash crash)\n` +
                    `   → Reversal Candle: ${hasReversalCandle ? 'DETECTED' : 'none'}\n` +
                    `   → Volume Ratio: ${volumeRatio.toFixed(2)}${volumeRatio >= FLASH_CRASH_BOUNCE_PROBE.VOLUME_SPIKE_THRESHOLD ? ' (SPIKE)' : ''}\n` +
                    `   → Direction: FLIPPED to LONG (from SHORT)\n` +
                    `   → Position: ${(probeSize * 100).toFixed(0)}% (${sizeReason})`
                  );
                  
                  // Store probe metadata for downstream use (with phase-specific diagnostics)
                  (trendData as Record<string, unknown>).flashCrashBounceProbe = {
                    active: true,
                    regime: FLASH_CRASH_BOUNCE_PROBE.REGIME_TAG,
                    triggerPhase: phase1Triggered ? 'PHASE_1_STATIC' : 'PHASE_2_RELEASE',
                    positionMultiplier: probeSize,
                    stochK4h: stochK4h,
                    stochK1h: stochK1h,
                    recentMinK: recentMinK,
                    priceDrop: priceDropPercent,
                    dropHours: dropHours,
                    dropRatePerHour: dropRatePerHour,
                    momentum: earlyMomentumScore,
                    adx: adx,
                    adxSlope: earlyAdxSlope,
                    hasReversalCandle: hasReversalCandle,
                    volumeRatio: volumeRatio,
                    sizeReason: sizeReason,
                    // Phase 2 specific diagnostics (stored separately for tuning/post-mortem)
                    phase2: phase2Triggered ? {
                      triggered: true,
                      recentMinK: phase2Diagnostics.recentMinK,
                      currentK: phase2Diagnostics.currentK,
                      kRise: phase2Diagnostics.kRise,
                      risingSteps: phase2Diagnostics.risingSteps,
                      minRisingSteps: phase2Diagnostics.minRisingSteps,
                      momentumStabilizing: phase2Diagnostics.momentumStabilizing,
                      historySource: phase2Diagnostics.historySource,
                      include1hRecovery: phase2Diagnostics.include1hRecovery
                    } : null
                  };
                } else if (FLASH_CRASH_BOUNCE_PROBE.LOG_NEAR_MISS && 
                           priceDropPercent >= 8 && 
                           (stochK4h <= 25 || stochK1h <= 25 || recentMinK <= 5)) {
                  // Log near-miss for diagnostics (expanded threshold for Phase 2 visibility)
                  const failedConditions: string[] = [];
                  if (!sufficientDrop) failedConditions.push(`drop=${priceDropPercent.toFixed(1)}% < ${FLASH_CRASH_BOUNCE_PROBE.MIN_DROP_PERCENT}%`);
                  if (!stochRsiConditionMet) {
                    if (!phase1Triggered) {
                      failedConditions.push(`Phase1: K not pinned (4h=${stochK4h.toFixed(1)}, 1h=${stochK1h.toFixed(1)} > ${FLASH_CRASH_BOUNCE_PROBE.PHASE_1_MAX_STOCHRSI_K})`);
                    }
                    if (!phase2Triggered && FLASH_CRASH_BOUNCE_PROBE.PHASE_2_ENABLED) {
                      failedConditions.push(`Phase2: recent_min=${recentMinK.toFixed(1)}, current=${stochK4h.toFixed(1)} (need floor≤${FLASH_CRASH_BOUNCE_PROBE.PHASE_2_FLOOR_THRESHOLD}, current≤${FLASH_CRASH_BOUNCE_PROBE.PHASE_2_CURRENT_MAX_K}, rise≥${FLASH_CRASH_BOUNCE_PROBE.PHASE_2_MIN_K_RISE})`);
                    }
                  }
                  if (!adxOk) failedConditions.push(`ADX=${adx.toFixed(1)} < ${FLASH_CRASH_BOUNCE_PROBE.MIN_ADX}`);
                  if (!velocityOk) failedConditions.push(`velocity=${dropRatePerHour.toFixed(1)}%/h < ${FLASH_CRASH_BOUNCE_PROBE.MIN_HOURLY_DROP_RATE}%/h`);
                  if (!dropWithinTimeWindow) failedConditions.push(`duration=${dropHours}h > ${FLASH_CRASH_BOUNCE_PROBE.MAX_DROP_HOURS}h`);
                  if (!momentumOk) failedConditions.push(`momentum=${earlyMomentumScore.toFixed(0)} < ${-FLASH_CRASH_BOUNCE_PROBE.MOMENTUM_MAX_OPPOSING} (extreme opposing)`);
                  
                  logger.forSymbol(symbol).info(
                    `${LOG_CATEGORIES.GATE} 📋 FLASH CRASH BOUNCE NEAR-MISS:\n` +
                    `   → Price Drop: ${priceDropPercent.toFixed(1)}% in ${dropHours}h (${dropRatePerHour.toFixed(1)}%/h)\n` +
                    `   → StochRSI K: 4h=${stochK4h.toFixed(1)}, 1h=${stochK1h.toFixed(1)}, recent_min=${recentMinK.toFixed(1)}\n` +
                    `   → Phase 1 (static): ${phase1Triggered ? '✓' : '✗'} | Phase 2 (release): ${phase2Triggered ? '✓' : '✗'}\n` +
                    `   → ADX: ${adx.toFixed(1)} slope=${earlyAdxSlope.toFixed(2)}\n` +
                    `   → Momentum: ${earlyMomentumScore.toFixed(0)}\n` +
                    `   → Failed: ${failedConditions.join(', ')}`
                  );
                }
              }
              
              // If capitulation or flash crash probe triggered, skip the standard Tier 0 block
              if (capitulationProbeTriggered || flashCrashProbeTriggered) {
                // Continue to normal processing with flipped direction
              } else if (overrideCheck.allowed) {
                // STRONG TREND OVERRIDE ACTIVATED - allow SHORT with reduced size
                strongTrendTier0OverrideApplied = true;
                strongTrendTier0PositionMultiplier = STRONG_TREND_TIER0_OVERRIDE.POSITION_SIZE_MULTIPLIER;
                logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} 🚀 STRONG TREND OVERRIDE: SHORT allowed at K=${earlyStochRsiK4h.toFixed(1)} despite Tier 0 oversold`);
                logger.forSymbol(symbol).info(`   → Override conditions met: ${overrideCheck.reason}`);
                logger.forSymbol(symbol).info(`   → Position size reduced to ${(strongTrendTier0PositionMultiplier * 100).toFixed(0)}%`);
                
                // Continue processing instead of blocking
              } else {
                // Standard block - no override allowed
                rejectedByHardGates++;
                perSymbolGateAttribution.set(symbol, { 
                  gate: 'EARLY_TIER_0_DEEP_OVERSOLD', 
                  details: `K=${earlyStochRsiK4h.toFixed(1)} < ${DEEP_STOCHRSI_HARD_GATE.DEEP_OVERSOLD_K_THRESHOLD} (pre-strategy)` 
                });
                logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.GATE} 🚫 EARLY TIER 0 (CIRCUIT BREAKER) - SHORT blocked at 4h K=${earlyStochRsiK4h.toFixed(1)} < ${DEEP_STOCHRSI_HARD_GATE.DEEP_OVERSOLD_K_THRESHOLD}`);
                logger.forSymbol(symbol).warn(`   → Strong Trend Override check: ${overrideCheck.reason}`);
                await logRejectionWithAI(
                  supabase, userId, symbol,
                  `EARLY TIER 0 CIRCUIT BREAKER: SHORT blocked - 4h StochRSI K=${earlyStochRsiK4h.toFixed(1)} is deeply oversold (< ${DEEP_STOCHRSI_HARD_GATE.DEEP_OVERSOLD_K_THRESHOLD})`,
                  { 
                    gate: "EARLY_TIER_0_DEEP_OVERSOLD",
                    tier: 0,
                    direction: "short",
                    earlyDirection,
                    stochRsiK4h: earlyStochRsiK4h.toFixed(1),
                    stochRsiK1h: extractStochRsiK(trendData, '1h').toFixed(1),
                    threshold: DEEP_STOCHRSI_HARD_GATE.DEEP_OVERSOLD_K_THRESHOLD,
                    adx: adx.toFixed(1),
                    adxSlope: earlyAdxSlope.toFixed(2),
                    momentumScore: earlyMomentumScore.toFixed(0),
                    momentumDirection: earlyMomentumDirection,
                    strongTrendOverrideAttempted: true,
                    strongTrendOverrideReason: overrideCheck.reason,
                    // Add Capitulation Bounce Probe near-miss data
                    capitulationProbeChecked: CAPITULATION_BOUNCE_PROBE.ENABLED && earlyStochRsiK4h <= CAPITULATION_BOUNCE_PROBE.MAX_STOCHRSI_K,
                    capitulationProbeFailed: CAPITULATION_BOUNCE_PROBE.ENABLED && earlyStochRsiK4h <= CAPITULATION_BOUNCE_PROBE.MAX_STOCHRSI_K,
                    // Add Flash Crash Bounce Probe Phase 2 diagnostics for temporal visibility
                    flashCrashProbeChecked: FLASH_CRASH_BOUNCE_PROBE.ENABLED,
                    flashCrashProbeActive: flashCrashProbeTriggered,
                    flashCrashPhase1Triggered: phase1Triggered ?? false,
                    flashCrashPhase2Triggered: phase2Triggered ?? false,
                    flashCrashPhase2Diagnostics: Object.keys(phase2Diagnostics).length > 0 ? {
                      recentMinK: phase2Diagnostics.recentMinK,
                      currentK: phase2Diagnostics.currentK,
                      kRise: phase2Diagnostics.kRise,
                      risingSteps: phase2Diagnostics.risingSteps,
                      minRisingSteps: phase2Diagnostics.minRisingSteps,
                      wasAtFloor: phase2Diagnostics.wasAtFloor,
                      currentKRecovering: phase2Diagnostics.currentKRecovering,
                      hasMinRise: phase2Diagnostics.hasMinRise,
                      momentumStabilizing: phase2Diagnostics.momentumStabilizing,
                      momentumScore: phase2Diagnostics.momentumScore,
                      phase2MomentumMax: phase2Diagnostics.phase2MomentumMax,
                      historySource: phase2Diagnostics.historySource,
                      recentKValuesCount: phase2Diagnostics.recentKValuesCount,
                    } : null,
                    flashCrashDropPercent: trendData?.priceDistanceFromSwing?.distanceFromHighPercent?.toFixed(1) ?? null,
                    isPreStrategy: true,
                    message: `Bounce probability ~80%+ at K=${earlyStochRsiK4h.toFixed(1)}. Strong Trend Override failed: ${overrideCheck.reason}. Flash Crash Phase 2: ${phase2Triggered ? 'TRIGGERED' : (Object.keys(phase2Diagnostics).length > 0 ? 'EVALUATED' : 'NOT_CHECKED')}`
                  },
                  trendData,
                  riskParams.ai_analysis_enabled !== false,
                  earlyOrderFlowAnalysis
                );
                continue;
              }
            }
            
            // TIER 0 DEEP OVERBOUGHT: Block LONGs when K > 95
            // EXCEPTION 1: Mean reversion strategies targeting reversal (SHORT) are allowed at K > 95
            // EXCEPTION 2: Strong Trend Override allows LONG if ADX>40 and momentum confirms
            if (earlyDirection === 'long' && earlyStochRsiK4h > DEEP_STOCHRSI_HARD_GATE.DEEP_OVERBOUGHT_K_THRESHOLD) {
              const overrideCheck = checkStrongTrendOverride('long');
              
              if (overrideCheck.allowed) {
                // STRONG TREND OVERRIDE ACTIVATED - allow LONG with reduced size
                strongTrendTier0OverrideApplied = true;
                strongTrendTier0PositionMultiplier = STRONG_TREND_TIER0_OVERRIDE.POSITION_SIZE_MULTIPLIER;
                logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} 🚀 STRONG TREND OVERRIDE: LONG allowed at K=${earlyStochRsiK4h.toFixed(1)} despite Tier 0 overbought`);
                logger.forSymbol(symbol).info(`   → Override conditions met: ${overrideCheck.reason}`);
                logger.forSymbol(symbol).info(`   → Position size reduced to ${(strongTrendTier0PositionMultiplier * 100).toFixed(0)}%`);
                
                // Continue processing instead of blocking
              } else {
                // Standard block - no override allowed
                rejectedByHardGates++;
                perSymbolGateAttribution.set(symbol, { 
                  gate: 'EARLY_TIER_0_DEEP_OVERBOUGHT', 
                  details: `K=${earlyStochRsiK4h.toFixed(1)} > ${DEEP_STOCHRSI_HARD_GATE.DEEP_OVERBOUGHT_K_THRESHOLD} (pre-strategy)` 
                });
                logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.GATE} 🚫 EARLY TIER 0 (CIRCUIT BREAKER) - LONG blocked at 4h K=${earlyStochRsiK4h.toFixed(1)} > ${DEEP_STOCHRSI_HARD_GATE.DEEP_OVERBOUGHT_K_THRESHOLD}`);
                logger.forSymbol(symbol).warn(`   → Strong Trend Override check: ${overrideCheck.reason}`);
                await logRejectionWithAI(
                  supabase, userId, symbol,
                  `EARLY TIER 0 CIRCUIT BREAKER: LONG blocked - 4h StochRSI K=${earlyStochRsiK4h.toFixed(1)} is deeply overbought (> ${DEEP_STOCHRSI_HARD_GATE.DEEP_OVERBOUGHT_K_THRESHOLD})`,
                  { 
                    gate: "EARLY_TIER_0_DEEP_OVERBOUGHT",
                    tier: 0,
                    direction: "long",
                    earlyDirection,
                    stochRsiK4h: earlyStochRsiK4h.toFixed(1),
                    threshold: DEEP_STOCHRSI_HARD_GATE.DEEP_OVERBOUGHT_K_THRESHOLD,
                    adx: adx.toFixed(1),
                    adxSlope: earlyAdxSlope.toFixed(2),
                    momentumScore: earlyMomentumScore.toFixed(0),
                    momentumDirection: earlyMomentumDirection,
                    strongTrendOverrideAttempted: true,
                    strongTrendOverrideReason: overrideCheck.reason,
                    isPreStrategy: true,
                    message: `Pullback probability ~80%+ at K=${earlyStochRsiK4h.toFixed(1)}. Strong Trend Override failed: ${overrideCheck.reason}`
                  },
                  trendData,
                  riskParams.ai_analysis_enabled !== false,
                  earlyOrderFlowAnalysis
                );
                continue;
              }
            }
            
            // Log if at extreme but direction is compatible (mean reversion allowed)
            if (earlyStochRsiK4h > DEEP_STOCHRSI_HARD_GATE.DEEP_OVERBOUGHT_K_THRESHOLD && earlyDirection === 'short') {
              logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} ✅ EARLY TIER 0: SHORT at K=${earlyStochRsiK4h.toFixed(1)} allowed (mean reversion direction)`);
            } else if (earlyStochRsiK4h < DEEP_STOCHRSI_HARD_GATE.DEEP_OVERSOLD_K_THRESHOLD && earlyDirection === 'long') {
              logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} ✅ EARLY TIER 0: LONG at K=${earlyStochRsiK4h.toFixed(1)} allowed (mean reversion direction)`);
            }
          }
        }
        
        // ============= CAPITULATION BOUNCE PROBE =============
        // NEW MICRO-REGIME: Post-capitulation balance zone entry
        // This fires when NEITHER continuation NOR mean reversion logic applies:
        // - Continuation blocked: momentum collapsed to ~0
        // - Mean Reversion blocked: LTF structure still bearish
        // - BUT: Price at absolute extreme (K ≤ 1) after significant drop (≥8%)
        //
        // This is TRANSITIONAL REGIME entry - liquidity vacuum rebound capture
        // 
        // ARCHITECTURAL PATTERN: Uses explicit override flags instead of direct directionResult mutation
        // This prevents "last writer wins" bugs and makes regime attribution explicit in analytics
        let capitulationBounceProbeActive = false;
        let capitulationBouncePositionMultiplier = 0.15;
        let forcedDirectionOverride: { direction: 'long' | 'short'; regime: string; reason: string } | null = null;
        
        if (CAPITULATION_BOUNCE_PROBE.ENABLED) {
          // Extract required data using centralized extractors
          const stochK4h = extractStochRsiK(trendData, '4h');
          const priceDropPercent = trendData?.priceDistanceFromSwing?.distanceFromHighPercent ?? 0;
          const momentumScoreRaw = trendData?.smartMomentum?.score ?? trendData?.smart_momentum?.normalized_score ?? 0;
          const adxValue = extractADX(trendData);
          // ADX slope - extractADXSlope returns an object, get the value
          const adxSlopeResult = extractADXSlope(trendData);
          const adxSlopeValue = typeof adxSlopeResult === 'number' ? adxSlopeResult : (adxSlopeResult?.slope ?? trendData?.volatility?.adxSlope ?? 0);
          
          // Check all required conditions
          const stochAtExtreme = stochK4h <= CAPITULATION_BOUNCE_PROBE.MAX_STOCHRSI_K;
          const sufficientDrop = priceDropPercent >= CAPITULATION_BOUNCE_PROBE.MIN_DROP_PERCENT;
          const momentumCollapsed = momentumScoreRaw >= CAPITULATION_BOUNCE_PROBE.MOMENTUM_COLLAPSED_MIN && 
                                    momentumScoreRaw <= CAPITULATION_BOUNCE_PROBE.MOMENTUM_COLLAPSED_MAX;
          const highAdxExhausting = adxValue >= CAPITULATION_BOUNCE_PROBE.MIN_ADX && 
                                    adxSlopeValue <= CAPITULATION_BOUNCE_PROBE.MAX_ADX_SLOPE;
          
          // Check volatility not expanding with instrumentation
          let volatilityOk = true;
          let volatilityValidatedBy = 'not_required';
          if (CAPITULATION_BOUNCE_PROBE.REQUIRE_VOLATILITY_NOT_EXPANDING) {
            const atrChange = trendData?.volatility?.atrSlope ?? 0;
            const bbWidthChange = trendData?.volatility?.bbWidthChange ?? 0;
            const atrStabilized = atrChange < CAPITULATION_BOUNCE_PROBE.ATR_EXPANSION_THRESHOLD;
            const bbStabilized = Math.abs(bbWidthChange) < CAPITULATION_BOUNCE_PROBE.BB_WIDTH_STABILIZING_THRESHOLD;
            volatilityOk = atrStabilized || bbStabilized;
            
            // Log which condition validated (for post-mortem analysis)
            if (volatilityOk) {
              if (atrStabilized && bbStabilized) {
                volatilityValidatedBy = 'both_atr_and_bb';
              } else if (atrStabilized) {
                volatilityValidatedBy = `atr_slope=${atrChange.toFixed(2)}`;
              } else {
                volatilityValidatedBy = `bb_width_change=${bbWidthChange.toFixed(2)}`;
              }
            }
          }
          
          // ===== HTF STRUCTURE GUARD =====
          // Block if HTF structure still making new lows (capitulation continuation)
          let htfStructureStable = true;
          let candlesSinceNewLow = 0;
          if (CAPITULATION_BOUNCE_PROBE.REQUIRE_HTF_STRUCTURE_STABLE) {
            // Check 4h klines for structure - look for no new low in recent candles
            const klines4h = trendData?.klines4h ?? [];
            if (klines4h.length >= 3) {
              // Find the lowest low in last N candles
              const recentLows = klines4h.slice(-5).map((k: any) => parseFloat(k[3])); // Low prices
              const lowestLow = Math.min(...recentLows);
              const currentLow = parseFloat(klines4h[klines4h.length - 1][3]);
              
              // Check how many candles since the lowest low
              for (let i = recentLows.length - 1; i >= 0; i--) {
                if (recentLows[i] === lowestLow) {
                  candlesSinceNewLow = recentLows.length - 1 - i;
                  break;
                }
              }
              
              htfStructureStable = candlesSinceNewLow >= CAPITULATION_BOUNCE_PROBE.MIN_CANDLES_SINCE_NEW_LOW;
            }
          }
          
          // All conditions met = Capitulation Bounce Probe
          if (stochAtExtreme && sufficientDrop && momentumCollapsed && highAdxExhausting && volatilityOk && htfStructureStable) {
            capitulationBounceProbeActive = true;
            
            // Check for volume spike bonus
            const volumeRatio = trendData?.volume?.['1h']?.volumeRatio ?? trendData?.timeframes?.['1h']?.volumeRatio ?? 1.0;
            if (volumeRatio >= CAPITULATION_BOUNCE_PROBE.VOLUME_SPIKE_THRESHOLD) {
              capitulationBouncePositionMultiplier = CAPITULATION_BOUNCE_PROBE.WITH_VOLUME_SPIKE;
            } else {
              capitulationBouncePositionMultiplier = CAPITULATION_BOUNCE_PROBE.BASE_POSITION_SIZE;
            }
            
            // Set explicit override flag (NOT direct mutation)
            const originalDirection = directionResult.direction;
            forcedDirectionOverride = {
              direction: 'long',
              regime: CAPITULATION_BOUNCE_PROBE.REGIME_TAG,
              reason: `K=${stochK4h.toFixed(1)}, drop=${priceDropPercent.toFixed(1)}%, momentum=${momentumScoreRaw.toFixed(0)}, ADX=${adxValue.toFixed(1)} slope=${adxSlopeValue.toFixed(2)}`
            };
            
            logger.forSymbol(symbol).info(
              `${LOG_CATEGORIES.SUCCESS} 🔄 CAPITULATION BOUNCE PROBE ACTIVATED:\n` +
              `   → Regime: ${CAPITULATION_BOUNCE_PROBE.REGIME_TAG}\n` +
              `   → StochRSI K: ${stochK4h.toFixed(1)} (pinned at extreme)\n` +
              `   → Price Drop: ${priceDropPercent.toFixed(1)}% (significant capitulation)\n` +
              `   → Momentum: ${momentumScoreRaw.toFixed(0)} (collapsed to neutral)\n` +
              `   → ADX: ${adxValue.toFixed(1)}, Slope: ${adxSlopeValue.toFixed(2)} (exhausting)\n` +
              `   → HTF Structure: ${candlesSinceNewLow} candles since new low (stable)\n` +
              `   → Volatility: ${volatilityValidatedBy}\n` +
              `   → Volume Ratio: ${volumeRatio.toFixed(2)}${volumeRatio >= CAPITULATION_BOUNCE_PROBE.VOLUME_SPIKE_THRESHOLD ? ' (SPIKE)' : ''}\n` +
              `   → Position: ${(capitulationBouncePositionMultiplier * 100).toFixed(0)}% (probe size)\n` +
              `   → Partial TP: ${CAPITULATION_BOUNCE_PROBE.PARTIAL_TP_ENABLED ? `${CAPITULATION_BOUNCE_PROBE.PARTIAL_TP_SIZE * 100}% @ ${CAPITULATION_BOUNCE_PROBE.PARTIAL_TP_PERCENT}%` : 'disabled'}\n` +
              `   → Direction: LONG (bounce capture from ${originalDirection ?? 'undefined'})`
            );
            
            // Apply override to directionResult via explicit mechanism
            directionResult.direction = forcedDirectionOverride.direction;
            directionResult.confidence = Math.min(80, (directionResult.confidence || 50) + 20);
            directionResult.reasons = [`CAPITULATION_BOUNCE_PROBE: ${forcedDirectionOverride.reason}`];
          } else if (CAPITULATION_BOUNCE_PROBE.LOG_NEAR_MISS && stochK4h <= 5) {
            // Log near-miss for diagnostics (when close but conditions not met)
            const failedConditions: string[] = [];
            if (!stochAtExtreme) failedConditions.push(`K=${stochK4h.toFixed(1)} > ${CAPITULATION_BOUNCE_PROBE.MAX_STOCHRSI_K}`);
            if (!sufficientDrop) failedConditions.push(`drop=${priceDropPercent.toFixed(1)}% < ${CAPITULATION_BOUNCE_PROBE.MIN_DROP_PERCENT}%`);
            if (!momentumCollapsed) failedConditions.push(`momentum=${momentumScoreRaw.toFixed(0)} not in [${CAPITULATION_BOUNCE_PROBE.MOMENTUM_COLLAPSED_MIN}, ${CAPITULATION_BOUNCE_PROBE.MOMENTUM_COLLAPSED_MAX}]`);
            if (!highAdxExhausting) failedConditions.push(`ADX=${adxValue.toFixed(1)} < ${CAPITULATION_BOUNCE_PROBE.MIN_ADX} or slope=${adxSlopeValue.toFixed(2)} > ${CAPITULATION_BOUNCE_PROBE.MAX_ADX_SLOPE}`);
            if (!volatilityOk) failedConditions.push('volatility still expanding');
            if (!htfStructureStable) failedConditions.push(`HTF structure unstable (${candlesSinceNewLow} candles since new low < ${CAPITULATION_BOUNCE_PROBE.MIN_CANDLES_SINCE_NEW_LOW})`);
            
            logger.forSymbol(symbol).info(
              `${LOG_CATEGORIES.GATE} 📋 CAPITULATION BOUNCE NEAR-MISS: K=${stochK4h.toFixed(1)}\n` +
              `   → Price drop: ${priceDropPercent.toFixed(1)}% (need >=${CAPITULATION_BOUNCE_PROBE.MIN_DROP_PERCENT}%)\n` +
              `   → Momentum: ${momentumScoreRaw.toFixed(0)} (need ${CAPITULATION_BOUNCE_PROBE.MOMENTUM_COLLAPSED_MIN} to ${CAPITULATION_BOUNCE_PROBE.MOMENTUM_COLLAPSED_MAX})\n` +
              `   → ADX: ${adxValue.toFixed(1)} slope=${adxSlopeValue.toFixed(2)} (need >=${CAPITULATION_BOUNCE_PROBE.MIN_ADX}, slope<=${CAPITULATION_BOUNCE_PROBE.MAX_ADX_SLOPE})\n` +
              `   → HTF Structure: ${candlesSinceNewLow} candles since new low (need >=${CAPITULATION_BOUNCE_PROBE.MIN_CANDLES_SINCE_NEW_LOW})\n` +
              `   → Failed: ${failedConditions.join(', ')}`
            );
          }
        }
        // ============= COUNTER-TREND ADMISSION LAYER =============
        // Unified authority for allowing counter-trend (reversal) entries
        // This check runs AFTER direction derivation but BEFORE strategy logic
        // 
        // MUTUAL EXCLUSIVITY: If Strong Trend Override was applied (continuation mode),
        // skip counter-trend admission entirely - we're in trend-following mode
        let counterTrendAdmissionResult: CounterTrendAdmissionResult | null = null;
        let counterTrendAdmissionMultiplier = 1.0;
        
        if (!strongTrendTier0OverrideApplied && directionResult.direction) {
          // Get HTF trend for counter-trend determination
          const htfTrend4h = timeframes?.['4h']?.trend ?? 'neutral';
          
          // Evaluate counter-trend admission
          counterTrendAdmissionResult = evaluateCounterTrendAdmission(
            trendData,
            directionResult.direction,
            htfTrend4h
          );
          
          // If counter-trend and NOT admitted, block the signal
          const isCounterTrend = (
            (directionResult.direction === 'long' && htfTrend4h === 'bearish') ||
            (directionResult.direction === 'short' && htfTrend4h === 'bullish')
          );
          
          if (isCounterTrend && !counterTrendAdmissionResult.allowed) {
            // Counter-trend entry blocked by admission layer
            rejectedByHardGates++;
            perSymbolGateAttribution.set(symbol, { 
              gate: 'COUNTER_TREND_ADMISSION', 
              details: counterTrendAdmissionResult.reason 
            });
            
            logger.forSymbol(symbol).warn(
              `${LOG_CATEGORIES.GATE} 🚫 COUNTER_TREND_ADMISSION BLOCKED: ${directionResult.direction.toUpperCase()} against ${htfTrend4h} HTF\n` +
              `   → Reason: ${counterTrendAdmissionResult.reason}\n` +
              `   → Failures: ${counterTrendAdmissionResult.failureReasons.join('; ')}`
            );
            
            await logRejectionWithAI(
              supabase, userId, symbol,
              `COUNTER_TREND_ADMISSION: ${directionResult.direction.toUpperCase()} blocked - ${counterTrendAdmissionResult.reason}`,
              { 
                gate: "COUNTER_TREND_ADMISSION",
                direction: directionResult.direction,
                htfTrend: htfTrend4h,
                reason: counterTrendAdmissionResult.reason,
                exhaustionStage: counterTrendAdmissionResult.exhaustionStage,
                adxExhausted: counterTrendAdmissionResult.adxExhausted,
                adxSlopePersistence: counterTrendAdmissionResult.adxSlopePersistence,
                volatilityContracting: counterTrendAdmissionResult.volatilityContracting,
                volatilityReason: counterTrendAdmissionResult.volatilityReason,
                stochDepegged: counterTrendAdmissionResult.stochDepegged,
                ltfStructureFlip: counterTrendAdmissionResult.ltfStructureFlip,
                failureReasons: counterTrendAdmissionResult.failureReasons,
                triggers: counterTrendAdmissionResult.triggers,
                message: `Counter-trend ${directionResult.direction.toUpperCase()} blocked: trend energy not exhausted`
              },
              trendData,
              riskParams.ai_analysis_enabled !== false,
              earlyOrderFlowAnalysis
            );
            continue;
          }
          
          // If counter-trend and admitted, apply probe position sizing
          if (isCounterTrend && counterTrendAdmissionResult.allowed) {
            counterTrendAdmissionMultiplier = counterTrendAdmissionResult.positionSizeMultiplier;
            logger.forSymbol(symbol).info(
              `${LOG_CATEGORIES.SUCCESS} ✅ COUNTER_TREND_ADMITTED: ${directionResult.direction.toUpperCase()} against ${htfTrend4h}\n` +
              `   → Stage: ${counterTrendAdmissionResult.exhaustionStage}\n` +
              `   → Position: ${(counterTrendAdmissionMultiplier * 100).toFixed(0)}% (probe size)\n` +
              `   → ADX: exhausted=${counterTrendAdmissionResult.adxExhausted}, persistence=${counterTrendAdmissionResult.adxSlopePersistence}\n` +
              `   → Volatility: ${counterTrendAdmissionResult.volatilityReason}`
            );
          }
        } else if (strongTrendTier0OverrideApplied) {
          // Log that counter-trend admission was skipped due to continuation mode
          logger.forSymbol(symbol).debug(
            `${LOG_CATEGORIES.GATE} ⏭️ COUNTER_TREND_ADMISSION skipped: Strong Trend Override active (continuation mode)`
          );
        }
        
        // ============= LATE GRIND ACCEPTANCE MODE =============
        // Allows entry AFTER 1.5%+ drift has occurred, ONLY if pullback fails (continuation proven)
        // This captures the middle 30% of slow grinds, not the dangerous start
        let lateGrindAccepted = false;
        let lateGrindPositionMultiplier = 1.0;
        let lateGrindStopMultiplier = 1.0;
        let lateGrindExceptionType = "";
        let lateGrindDirection: "long" | "short" | null = null;
        
        if (LATE_GRIND_ACCEPTANCE_PARAMS.ENABLED && !directionResult.direction) {
          const stealthTrend = trendData.stealthTrend || { detected: false, driftPercent: 0, direction: "neutral", stealthScore: 0 };
          const stealthDrift = Math.abs(stealthTrend.driftPercent || 0);
          const driftDirection = stealthTrend.direction;
          const adxSlope = trendData.volatility?.adxSlope ?? 0;
          const stochK4h = extractStochRsiK(trendData, '4h');
          const htf4hConfidence = timeframes?.['4h']?.confidence ?? 0;
          
          // Check if sufficient drift has occurred
          // Apply neutral persistence bonus to relax Late Grind thresholds
          const lateGrindNeutralBonus = NEUTRAL_PERSISTENCE_PARAMS.APPLY_TO_LATE_GRIND ? neutralPersistence.confidenceBonus : 0;
          
          // Lower min drift requirement by bonus (e.g., bonus of 5 reduces 3% to 2.5%)
          const effectiveMinDrift = Math.max(1.5, LATE_GRIND_ACCEPTANCE_PARAMS.MIN_PRIOR_DRIFT_PERCENT - (lateGrindNeutralBonus * 0.1));
          
          if (stealthDrift >= effectiveMinDrift) {
            // Determine intended direction from drift
            const intendedDirection: "long" | "short" = driftDirection === "bullish" ? "long" : "short";
            
            // Check HTF bias (4h must show some directional bias, not flat neutral)
            // Neutral bonus reduces required confidence
            const effectiveHTFConfidence = Math.max(20, LATE_GRIND_ACCEPTANCE_PARAMS.MIN_HTF_CONFIDENCE - lateGrindNeutralBonus);
            const hasHTFBias = !LATE_GRIND_ACCEPTANCE_PARAMS.REQUIRE_HTF_BIAS || 
              htf4hConfidence >= effectiveHTFConfidence;
            
            // Check ADX not collapsing (trend not dying)
            const adxNotCollapsing = !LATE_GRIND_ACCEPTANCE_PARAMS.REQUIRE_ADX_NOT_COLLAPSING || 
              adxSlope >= LATE_GRIND_ACCEPTANCE_PARAMS.ADX_COLLAPSE_THRESHOLD;
            
            // Check StochRSI safety (not at absolute extremes)
            let stochSafe = true;
            if (LATE_GRIND_ACCEPTANCE_PARAMS.BLOCK_AT_STOCHRSI_EXTREMES) {
              if (intendedDirection === "long" && stochK4h >= LATE_GRIND_ACCEPTANCE_PARAMS.STOCHRSI_EXTREME_LONG) {
                stochSafe = false;
              } else if (intendedDirection === "short" && stochK4h <= LATE_GRIND_ACCEPTANCE_PARAMS.STOCHRSI_EXTREME_SHORT) {
                stochSafe = false;
              }
            }
            
            // Detect failed pullback using recent price action (multi-timeframe: 15m + 30m)
            // Failed pullback = price retraced 15-38.2% of prior move but couldn't continue reversal
            const klines15m = trendData.klines15m || [];
            const klines30m = trendData.klines30m || [];
            let failedPullbackDetected = false;
            let pullbackDepth = 0;
            let pullbackConfirmed30m = false;
            
            // ===== 15m PULLBACK DETECTION (Primary) =====
            if (klines15m.length >= LATE_GRIND_ACCEPTANCE_PARAMS.MAX_PULLBACK_BARS + 2) {
              const recentCandles = klines15m.slice(-LATE_GRIND_ACCEPTANCE_PARAMS.MAX_PULLBACK_BARS);
              const closes = recentCandles.map((k: any) => parseFloat(k[4])).filter(Number.isFinite);
              const highs = recentCandles.map((k: any) => parseFloat(k[2])).filter(Number.isFinite);
              const lows = recentCandles.map((k: any) => parseFloat(k[3])).filter(Number.isFinite);
              
              if (closes.length >= 3) {
                // For bearish drift (looking for SHORT): find high point in pullback, current should be below it
                // For bullish drift (looking for LONG): find low point in pullback, current should be above it
                if (driftDirection === "bearish") {
                  const highOfPullback = Math.max(...highs);
                  const currentClose = closes[closes.length - 1];
                  const lowBeforePullback = Math.min(...lows.slice(0, 3));
                  const moveRange = highOfPullback - lowBeforePullback;
                  
                  if (moveRange > 0 && stealthDrift > 0) {
                    pullbackDepth = ((highOfPullback - lowBeforePullback) / (stealthDrift / 100 * currentClose)) * 100;
                    // Pullback failed if current is below high of pullback (sellers regained control)
                    const pullbackFailed = currentClose < highOfPullback * 0.998; // Allow 0.2% tolerance
                    failedPullbackDetected = pullbackFailed && 
                      pullbackDepth >= LATE_GRIND_ACCEPTANCE_PARAMS.MIN_PULLBACK_DEPTH_PERCENT &&
                      pullbackDepth <= LATE_GRIND_ACCEPTANCE_PARAMS.MAX_PULLBACK_DEPTH_PERCENT;
                  }
                } else if (driftDirection === "bullish") {
                  const lowOfPullback = Math.min(...lows);
                  const currentClose = closes[closes.length - 1];
                  const highBeforePullback = Math.max(...highs.slice(0, 3));
                  const moveRange = highBeforePullback - lowOfPullback;
                  
                  if (moveRange > 0 && stealthDrift > 0) {
                    pullbackDepth = ((highBeforePullback - lowOfPullback) / (stealthDrift / 100 * currentClose)) * 100;
                    // Pullback failed if current is above low of pullback (buyers regained control)
                    const pullbackFailed = currentClose > lowOfPullback * 1.002; // Allow 0.2% tolerance
                    failedPullbackDetected = pullbackFailed && 
                      pullbackDepth >= LATE_GRIND_ACCEPTANCE_PARAMS.MIN_PULLBACK_DEPTH_PERCENT &&
                      pullbackDepth <= LATE_GRIND_ACCEPTANCE_PARAMS.MAX_PULLBACK_DEPTH_PERCENT;
                  }
                }
              }
            }
            
            // ===== 30m PULLBACK CONFIRMATION (Secondary - Multi-Timeframe Validation) =====
            // Use 30m klines to confirm the pullback structure is visible on higher timeframe
            if (failedPullbackDetected && klines30m.length >= 4) {
              const recent30mCandles = klines30m.slice(-4); // Last 2 hours on 30m
              const closes30m = recent30mCandles.map((k: any) => parseFloat(k[4])).filter(Number.isFinite);
              const highs30m = recent30mCandles.map((k: any) => parseFloat(k[2])).filter(Number.isFinite);
              const lows30m = recent30mCandles.map((k: any) => parseFloat(k[3])).filter(Number.isFinite);
              
              if (closes30m.length >= 3) {
                if (driftDirection === "bearish") {
                  // 30m should also show pullback high being rejected
                  const high30m = Math.max(...highs30m);
                  const current30m = closes30m[closes30m.length - 1];
                  pullbackConfirmed30m = current30m < high30m * 0.998;
                } else if (driftDirection === "bullish") {
                  // 30m should also show pullback low being defended
                  const low30m = Math.min(...lows30m);
                  const current30m = closes30m[closes30m.length - 1];
                  pullbackConfirmed30m = current30m > low30m * 1.002;
                }
              }
              
              // Log 30m confirmation status
              if (pullbackConfirmed30m) {
                logger.forSymbol(symbol).debug(`${LOG_CATEGORIES.TREND} [30M_PULLBACK_CONFIRM] Pullback structure confirmed on 30m timeframe`);
              }
            }
            
            // Skip pullback check if not required
            const pullbackCheckPassed = !LATE_GRIND_ACCEPTANCE_PARAMS.REQUIRE_FAILED_PULLBACK || failedPullbackDetected;
            
            if (pullbackCheckPassed && hasHTFBias && adxNotCollapsing && stochSafe) {
              // Allow late grind entry!
              lateGrindAccepted = true;
              lateGrindDirection = intendedDirection;
              lateGrindExceptionType = LATE_GRIND_ACCEPTANCE_PARAMS.EXCEPTION_TYPE;
              
              // Determine position size (40% normal, 50% for strong grind, +5% bonus for 30m confirmation)
              const isStrongGrind = stealthDrift >= LATE_GRIND_ACCEPTANCE_PARAMS.STRONG_PRIOR_DRIFT_PERCENT;
              let baseMultiplier = isStrongGrind 
                ? LATE_GRIND_ACCEPTANCE_PARAMS.STRONG_GRIND_POSITION_SIZE_MULTIPLIER 
                : LATE_GRIND_ACCEPTANCE_PARAMS.POSITION_SIZE_MULTIPLIER;
              
              // NEW: 30m confirmation bonus - pullback structure visible on both 15m AND 30m = higher conviction
              const multiTimeframeBonus = pullbackConfirmed30m ? 0.05 : 0;
              lateGrindPositionMultiplier = Math.min(0.60, baseMultiplier + multiTimeframeBonus);
              
              lateGrindStopMultiplier = LATE_GRIND_ACCEPTANCE_PARAMS.STOP_MULTIPLIER;
              // Neutral bonus was already applied to thresholds above
              const bonusAppliedMsg = lateGrindNeutralBonus > 0 
                ? `, neutralBonus=+${lateGrindNeutralBonus} (minDrift=${effectiveMinDrift.toFixed(1)}%, minHTF=${effectiveHTFConfidence}%)` 
                : '';
              const mtfMsg = pullbackConfirmed30m ? ', 30m confirmed (+5%)' : '';
              
              logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} 🐌 LATE GRIND ACCEPTANCE: drift=${stealthDrift.toFixed(2)}%, pullback ${failedPullbackDetected ? 'failed' : 'skipped'} (depth=${pullbackDepth.toFixed(1)}%), allowing ${intendedDirection} at ${(lateGrindPositionMultiplier * 100).toFixed(0)}% size${mtfMsg}`);
              logger.forSymbol(symbol).info(`   HTF bias=${htf4hConfidence.toFixed(0)}%, ADX slope=${adxSlope.toFixed(2)}, StochK4h=${stochK4h.toFixed(1)}${bonusAppliedMsg}`);
            }
          }
        }
        
        // ============= NEW: CONFIRMED MOMENTUM DIRECTION OVERRIDE =============
        // When all timeframes are neutral but momentum is CONFIRMED, use MACD histogram
        // direction to derive trade direction. This addresses momentum-trend disconnect.
        let momentumDirectionOverrideApplied = false;
        let momentumDerivedDirection: "long" | "short" | null = null;
        let momentumDerivedPositionMultiplier = 1.0;
        
        if (!directionResult.direction && !lateGrindAccepted && MOMENTUM_DIRECTION_OVERRIDE_PARAMS.ENABLED) {
          const momentumConfirmed = momentum?.state === "confirmed";
          const genuineMomentum = momentum?.genuineMomentum === true;
          const adxSufficient = adx >= MOMENTUM_DIRECTION_OVERRIDE_PARAMS.MIN_ADX;
          const macdHist = momentum?.macdHistogram ?? 0;
          const macdMagnitude = Math.abs(macdHist);
          
          if (momentumConfirmed && genuineMomentum && adxSufficient && macdMagnitude >= MOMENTUM_DIRECTION_OVERRIDE_PARAMS.MIN_MACD_MAGNITUDE) {
            // Use MACD histogram to determine direction
            momentumDerivedDirection = macdHist > 0 ? "long" : "short";
            momentumDirectionOverrideApplied = true;
            
            // Determine position size based on MACD strength
            momentumDerivedPositionMultiplier = macdMagnitude >= MOMENTUM_DIRECTION_OVERRIDE_PARAMS.STRONG_MACD_MAGNITUDE
              ? MOMENTUM_DIRECTION_OVERRIDE_PARAMS.STRONG_MACD_POSITION_MULTIPLIER
              : MOMENTUM_DIRECTION_OVERRIDE_PARAMS.POSITION_SIZE_MULTIPLIER;
            
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} 🎯 MOMENTUM DIRECTION OVERRIDE: Deriving ${momentumDerivedDirection} from MACD histogram=${macdHist.toFixed(6)}`);
            logger.forSymbol(symbol).info(`   → Momentum confirmed=${momentumConfirmed}, genuine=${genuineMomentum}, ADX=${adx.toFixed(1)}, MACD expanding=${momentum?.macdExpanding}`);
            logger.forSymbol(symbol).info(`   → Position size: ${(momentumDerivedPositionMultiplier * 100).toFixed(0)}%`);
          }
        }
        
        // ============= NEW: ORDER FLOW DIRECTION FALLBACK =============
        // When trends are neutral but order flow shows strong buy/sell pressure
        let orderFlowDirectionOverrideApplied = false;
        let orderFlowDerivedDirection: "long" | "short" | null = null;
        let orderFlowDerivedPositionMultiplier = 1.0;
        
        // ============= RELAXED ORDER FLOW WHEN 1H DIRECTIONAL =============
        // When 1h trend is clear, accept lower order flow score
        if (!directionResult.direction && !lateGrindAccepted && !momentumDirectionOverrideApplied && ORDER_FLOW_DIRECTION_PARAMS.ENABLED) {
          const orderFlowScore = earlyOrderFlowAnalysis?.score ?? 0;
          const orderFlowSignal = earlyOrderFlowAnalysis?.signal ?? "neutral";
          const adxSufficient = adx >= ORDER_FLOW_DIRECTION_PARAMS.MIN_ADX;
          
          // IMPROVED: Use relaxed order flow score when 1h is directional
          const is1hDirectional = htfTrend1h === "bearish" || htfTrend1h === "bullish";
          const effectiveMinScore = is1hDirectional && RELAXED_ORDER_FLOW_PARAMS.ENABLED
            ? RELAXED_ORDER_FLOW_PARAMS.RELAXED_MIN_ORDER_FLOW_SCORE
            : ORDER_FLOW_DIRECTION_PARAMS.MIN_ORDER_FLOW_SCORE;
          
          const isStrongSignal = ORDER_FLOW_DIRECTION_PARAMS.REQUIRE_STRONG_SIGNAL
            ? (orderFlowSignal === "strong_buy" || orderFlowSignal === "strong_sell")
            : true;
          
          if (orderFlowScore >= effectiveMinScore && isStrongSignal && adxSufficient) {
            orderFlowDerivedDirection = orderFlowSignal === "strong_buy" || orderFlowSignal === "buy" ? "long" : "short";
            orderFlowDirectionOverrideApplied = true;
            orderFlowDerivedPositionMultiplier = ORDER_FLOW_DIRECTION_PARAMS.POSITION_SIZE_MULTIPLIER;
            
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} 📊 ORDER FLOW DIRECTION FALLBACK: Deriving ${orderFlowDerivedDirection} from ${orderFlowSignal} (score=${orderFlowScore}, minRequired=${effectiveMinScore})`);
            logger.forSymbol(symbol).info(`   → ADX=${adx.toFixed(1)}, 1h_directional=${is1hDirectional}, Position size: ${(orderFlowDerivedPositionMultiplier * 100).toFixed(0)}%`);
          }
        }
        
        // ============= NEW: PRE-MOMENTUM STOCHRSI EXTREME ENTRY =============
        // When StochRSI is at deep extremes (K < 15 for SHORT, K > 85 for LONG)
        // with directional 1h trend but momentum not yet confirmed, allow entry
        let preMomentumStochRsiOverrideApplied = false;
        let preMomentumDirection: "long" | "short" | null = null;
        let preMomentumPositionMultiplier = 1.0;
        
        // CENTRALIZED: Use shared extractors for StochRSI K/D values
        const stochK1h = extractStochRsiK(trendData, '1h');
        const stochD1h = extractStochRsiD(trendData, '1h');
        const conf1hForPreMomentum = timeframes?.['1h']?.confidence ?? 50;
        
        if (!directionResult.direction && !lateGrindAccepted && !momentumDirectionOverrideApplied && !orderFlowDirectionOverrideApplied && PRE_MOMENTUM_STOCHRSI_PARAMS.ENABLED) {
          const adxSufficient = adx >= PRE_MOMENTUM_STOCHRSI_PARAMS.MIN_ADX;
          const momentumState = momentum?.state || "none";
          const isNotConfirmed = momentumState === "none" || momentumState === "building";
          
          // Check for SHORT: deeply oversold StochRSI + 1h bearish
          const isDeeplySold = stochK1h < PRE_MOMENTUM_STOCHRSI_PARAMS.MAX_STOCHRSI_K_FOR_SHORT;
          const is1hBearish = htfTrend1h === "bearish" && conf1hForPreMomentum >= PRE_MOMENTUM_STOCHRSI_PARAMS.MIN_1H_CONFIDENCE;
          const isStochDeclining = stochK1h < stochD1h;  // K < D = declining
          
          // Check for LONG: deeply overbought StochRSI + 1h bullish
          const isDeeplyBought = stochK1h > PRE_MOMENTUM_STOCHRSI_PARAMS.MIN_STOCHRSI_K_FOR_LONG;
          const is1hBullish = htfTrend1h === "bullish" && conf1hForPreMomentum >= PRE_MOMENTUM_STOCHRSI_PARAMS.MIN_1H_CONFIDENCE;
          const isStochRising = stochK1h > stochD1h;  // K > D = rising
          
          if (adxSufficient && isNotConfirmed) {
            if (isDeeplySold && is1hBearish && isStochDeclining) {
              preMomentumDirection = "short";
              preMomentumStochRsiOverrideApplied = true;
              preMomentumPositionMultiplier = conf1hForPreMomentum >= 65
                ? PRE_MOMENTUM_STOCHRSI_PARAMS.STRONG_SETUP_MULTIPLIER
                : PRE_MOMENTUM_STOCHRSI_PARAMS.POSITION_SIZE_MULTIPLIER;
              
              logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} 🔴 PRE-MOMENTUM STOCHRSI: Deeply oversold (K=${stochK1h.toFixed(1)} < ${PRE_MOMENTUM_STOCHRSI_PARAMS.MAX_STOCHRSI_K_FOR_SHORT}) + 1h bearish (${conf1hForPreMomentum.toFixed(0)}%) → SHORT`);
              logger.forSymbol(symbol).info(`   → ADX=${adx.toFixed(1)}, StochRSI K<D=${isStochDeclining}, Position: ${(preMomentumPositionMultiplier * 100).toFixed(0)}%`);
            } else if (isDeeplyBought && is1hBullish && isStochRising) {
              preMomentumDirection = "long";
              preMomentumStochRsiOverrideApplied = true;
              preMomentumPositionMultiplier = conf1hForPreMomentum >= 65
                ? PRE_MOMENTUM_STOCHRSI_PARAMS.STRONG_SETUP_MULTIPLIER
                : PRE_MOMENTUM_STOCHRSI_PARAMS.POSITION_SIZE_MULTIPLIER;
              
              logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} 🟢 PRE-MOMENTUM STOCHRSI: Deeply overbought (K=${stochK1h.toFixed(1)} > ${PRE_MOMENTUM_STOCHRSI_PARAMS.MIN_STOCHRSI_K_FOR_LONG}) + 1h bullish (${conf1hForPreMomentum.toFixed(0)}%) → LONG`);
              logger.forSymbol(symbol).info(`   → ADX=${adx.toFixed(1)}, StochRSI K>D=${isStochRising}, Position: ${(preMomentumPositionMultiplier * 100).toFixed(0)}%`);
            }
          }
        }
        
        // ============= NEW: SHORT-TERM ALIGNMENT OVERRIDE =============
        // When 1h, 30m, and micro trend all agree but momentum is "none"
        let shortTermAlignmentOverrideApplied = false;
        let shortTermAlignmentDirection: "long" | "short" | null = null;
        let shortTermAlignmentPositionMultiplier = 1.0;
        
        if (!directionResult.direction && !lateGrindAccepted && !momentumDirectionOverrideApplied && 
            !orderFlowDirectionOverrideApplied && !preMomentumStochRsiOverrideApplied && SHORT_TERM_ALIGNMENT_PARAMS.ENABLED) {
          
          const trend30m = trendData.multiTimeframeTrends?.timeframe30m?.trend || timeframes?.['30m']?.trend || "neutral";
          const microDirection = trendData.microTrend?.direction || "neutral";
          const momentumState = momentum?.state || "none";
          const adxSufficient = adx >= SHORT_TERM_ALIGNMENT_PARAMS.MIN_ADX;
          
          // Check if all 3 short-term timeframes align for bearish
          const allBearish = htfTrend1h === "bearish" && trend30m === "bearish" && microDirection === "bearish";
          // Check if all 3 short-term timeframes align for bullish
          const allBullish = htfTrend1h === "bullish" && trend30m === "bullish" && microDirection === "bullish";
          
          // Only apply when momentum is "none" (not conflicting for other reasons)
          const momentumNone = momentumState === "none" && SHORT_TERM_ALIGNMENT_PARAMS.ALLOW_WHEN_MOMENTUM_NONE;
          
          if (adxSufficient && momentumNone) {
            if (allBearish) {
              shortTermAlignmentDirection = "short";
              shortTermAlignmentOverrideApplied = true;
              shortTermAlignmentPositionMultiplier = SHORT_TERM_ALIGNMENT_PARAMS.POSITION_SIZE_MULTIPLIER;
              
              logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} 📉 SHORT-TERM ALIGNMENT: All bearish (1h=${htfTrend1h}, 30m=${trend30m}, micro=${microDirection}) → SHORT`);
              logger.forSymbol(symbol).info(`   → ADX=${adx.toFixed(1)}, momentum=${momentumState}, Position: ${(shortTermAlignmentPositionMultiplier * 100).toFixed(0)}%`);
            } else if (allBullish) {
              shortTermAlignmentDirection = "long";
              shortTermAlignmentOverrideApplied = true;
              shortTermAlignmentPositionMultiplier = SHORT_TERM_ALIGNMENT_PARAMS.POSITION_SIZE_MULTIPLIER;
              
              logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} 📈 SHORT-TERM ALIGNMENT: All bullish (1h=${htfTrend1h}, 30m=${trend30m}, micro=${microDirection}) → LONG`);
              logger.forSymbol(symbol).info(`   → ADX=${adx.toFixed(1)}, momentum=${momentumState}, Position: ${(shortTermAlignmentPositionMultiplier * 100).toFixed(0)}%`);
            }
          }
        }
        
        // ============= NEW: EARLY IGNITION ENTRY MODULE =============
        // Captures the 30-90 minute pre-expansion window when all direction tiers fail
        // This is VOLATILITY IGNITION entry, not trend following or mean reversion
        // ONLY bypasses NO_CLEAR_DIRECTION - all other hard gates remain active
        let earlyIgnitionEntryApplied = false;
        let earlyIgnitionEntryDirection: "long" | "short" | null = null;
        let earlyIgnitionEntryPositionMultiplier = 0.35;
        let earlyIgnitionEntryStopMultiplier = 1.0;
        
        const hasDirectionOverride = momentumDirectionOverrideApplied || orderFlowDirectionOverrideApplied || 
                                     preMomentumStochRsiOverrideApplied || shortTermAlignmentOverrideApplied;
        
        // Only check Early Ignition if no direction determined and no other overrides
        if (!directionResult.direction && !lateGrindAccepted && !hasDirectionOverride) {
          // Get kline data from historical data map (already fetched earlier)
          const earlyIgnitionHistData = historicalDataMap.get(symbol);
          
          // Check for early ignition entry conditions
          const volumeInfo = {
            ratio: trendData.volatility?.volumeRatio || 1.0,
            zScore: trendData.volatility?.volumeZScore || 0,
            spike: trendData.volatility?.volumeSpike || false,
          };
          
          const earlyIgnitionResult = detectEarlyIgnitionEntry(
            trendData,
            earlyIgnitionHistData?.klines || [],
            volumeInfo
          );
          
          if (earlyIgnitionResult.isValid && earlyIgnitionResult.direction) {
            // CRITICAL: Early Ignition ONLY bypasses NO_CLEAR_DIRECTION
            // It does NOT bypass other hard gates - those are checked later
            earlyIgnitionEntryApplied = true;
            earlyIgnitionEntryDirection = earlyIgnitionResult.direction;
            earlyIgnitionEntryPositionMultiplier = earlyIgnitionResult.positionSizeMultiplier;
            earlyIgnitionEntryStopMultiplier = earlyIgnitionResult.stopMultiplier;
            
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} 🔥 EARLY IGNITION ENTRY: ${earlyIgnitionEntryDirection.toUpperCase()} detected`);
            logger.forSymbol(symbol).info(`   → ${earlyIgnitionResult.reasons.join(", ")}`);
            logger.forSymbol(symbol).info(`   → Position: ${(earlyIgnitionEntryPositionMultiplier * 100).toFixed(0)}%, Stop: ${earlyIgnitionEntryStopMultiplier.toFixed(1)}x ATR`);
            logger.forSymbol(symbol).debug(`   → Details: squeeze=${earlyIgnitionResult.checkDetails.squeezeTimeframe}, widthExp=${earlyIgnitionResult.checkDetails.widthExpansionPercent.toFixed(1)}%, adxSlope=${earlyIgnitionResult.checkDetails.adxSlope.toFixed(3)}, volRatio=${earlyIgnitionResult.checkDetails.volumeRatio.toFixed(2)}`);
            
            // Track for gate attribution
            perSymbolGateAttribution.set(symbol, { 
              gate: 'EARLY_IGNITION_ENTRY', 
              details: `Early ignition ${earlyIgnitionEntryDirection} at ${(earlyIgnitionEntryPositionMultiplier * 100).toFixed(0)}% size` 
            });
          } else if (earlyIgnitionResult.reasons.length > 0) {
            // Log why early ignition didn't apply (for debugging)
            logger.forSymbol(symbol).debug(`${LOG_CATEGORIES.GATE} Early Ignition not applicable: ${earlyIgnitionResult.reasons[0]}`);
          }
        }
        
        // REJECT EARLY: If no clear trade direction can be determined AND no overrides applied (including early ignition)
        const hasAnyDirectionSource = hasDirectionOverride || earlyIgnitionEntryApplied;
        if (!directionResult.direction && !lateGrindAccepted && !hasAnyDirectionSource) {
          rejectedByHardGates++;
          await logRejectionWithAI(
            supabase, userId, symbol,
            `No clear trade direction: ${directionResult.reasons.join(", ")}`,
            {
              gate: "NO_CLEAR_DIRECTION",
              derivedDirection: directionResult.direction || null,
              direction: directionResult.direction || null,
              source: directionResult.source,
              reasons: directionResult.reasons,
              // Include DirectionContext for UI visualization
              directionContext: directionResult.directionContext || null,
              // ===== GRADUATED MOMENTUM PENALTY DIAGNOSTICS =====
              graduatedMomentumEffect: directionResult.graduatedMomentumEffect || null,
              momentumImpact: directionResult.momentumImpact || null,
              momentumScore: directionResult.momentumScore ?? null,
              trend4h: htfTrend4h,
              trend1h: htfTrend1h,
              primaryTrend: trend,
              confidence: directionResult.confidence,
              lateGrindChecked: LATE_GRIND_ACCEPTANCE_PARAMS.ENABLED,
              momentumDirectionOverrideChecked: MOMENTUM_DIRECTION_OVERRIDE_PARAMS.ENABLED,
              orderFlowDirectionChecked: ORDER_FLOW_DIRECTION_PARAMS.ENABLED,
              preMomentumStochRsiChecked: PRE_MOMENTUM_STOCHRSI_PARAMS.ENABLED,
              shortTermAlignmentChecked: SHORT_TERM_ALIGNMENT_PARAMS.ENABLED,
              stochK1h: stochK1h.toFixed(1),
              stochD1h: stochD1h.toFixed(1),
              orderFlowScore: earlyOrderFlowAnalysis?.score ?? 0,
              orderFlowSignal: earlyOrderFlowAnalysis?.signal ?? "neutral",
              stealthDrift: trendData.stealthTrend?.driftPercent || 0,
              trend30m: trendData.multiTimeframeTrends?.timeframe30m?.trend || timeframes?.['30m']?.trend || "neutral",
              microDirection: trendData.microTrend?.direction || "neutral",
              momentum: {
                confirms: momentum?.confirms ?? false,
                state: momentum?.state ?? 'none',
                genuineMomentum: momentum?.genuineMomentum ?? false,
                hasDivergence: momentum?.hasDivergence ?? false,
                lastCloseAlignsWithTrend: momentum?.lastCloseAlignsWithTrend ?? false,
                macdDirectionAligned: momentum?.macdDirectionAligned ?? false,
                macdExpanding: momentum?.macdExpanding ?? false,
                macdHistogram: momentum?.macdHistogram?.toFixed(4) ?? '0.0000',
                consecutiveBars1h: momentum?.consecutiveBars1h ?? 0,
                consecutiveBars30m: momentum?.consecutiveBars30m ?? 0,
                consecutiveBars15m: momentum?.consecutiveBars15m ?? 0
              }
            },
            trendData,
            riskParams.ai_analysis_enabled !== false,
            earlyOrderFlowAnalysis
          );
          continue;
        }
        
        // Use derived direction consistently throughout signal generation
        // Priority: original direction > late grind > momentum override > order flow > pre-momentum > short-term alignment
        // NOTE: Using 'let' to allow COUNTER_TREND fallback to override direction
        let derivedDirection = (
          directionResult.direction || 
          lateGrindDirection || 
          momentumDerivedDirection || 
          orderFlowDerivedDirection ||
          preMomentumDirection ||
          shortTermAlignmentDirection
        ) as "long" | "short";
        
        // Determine source for logging (can be updated by fallback)
        let derivedSource = preMomentumStochRsiOverrideApplied
          ? "pre-momentum-stochrsi-extreme"
          : shortTermAlignmentOverrideApplied
            ? "short-term-alignment"
            : momentumDirectionOverrideApplied 
              ? "momentum-direction-override"
              : orderFlowDirectionOverrideApplied 
                ? "order-flow-direction"
                : lateGrindAccepted 
                  ? "late-grind-acceptance" 
                  : directionResult.source;
        
        // Apply override position multipliers if used
        let overridePositionMultiplier = 1.0;
        if (preMomentumStochRsiOverrideApplied) {
          overridePositionMultiplier = preMomentumPositionMultiplier;
        } else if (shortTermAlignmentOverrideApplied) {
          overridePositionMultiplier = shortTermAlignmentPositionMultiplier;
        } else if (momentumDirectionOverrideApplied) {
          overridePositionMultiplier = momentumDerivedPositionMultiplier;
        } else if (orderFlowDirectionOverrideApplied) {
          overridePositionMultiplier = orderFlowDerivedPositionMultiplier;
        }
        
        // Track if counter-trend fallback was applied (for position sizing)
        let counterTrendFallbackApplied = false;
        let counterTrendFallbackMultiplier = 1.0;
        
        const overrideSuffix = preMomentumStochRsiOverrideApplied ? ' [PRE_MOMENTUM_STOCHRSI]'
          : shortTermAlignmentOverrideApplied ? ' [SHORT_TERM_ALIGNMENT]'
          : momentumDirectionOverrideApplied ? ' [MOMENTUM_OVERRIDE]' 
          : orderFlowDirectionOverrideApplied ? ' [ORDER_FLOW_OVERRIDE]' 
          : lateGrindAccepted ? ' [LATE_GRIND]' : '';
        logger.forSymbol(symbol).info(`${LOG_CATEGORIES.TREND} Direction derived: ${derivedDirection} from ${derivedSource} (${directionResult.confidence.toFixed(0)}% conf)${overrideSuffix}`);
        if (directionResult.reasons.some(r => r.includes("Warning"))) {
          logger.forSymbol(symbol).warn(`   ${directionResult.reasons.filter(r => r.includes("Warning")).join(", ")}`);
        }
        
        // ============= 4-STATE REGIME CLASSIFIER GATE =============
        // Forensic audit: 100% of recent losses came from neutral/ranging entries.
        // This gate classifies market into 4 states and hard-blocks RANGE_COMPRESSION.
        const htf1hTrendForRegime = trendData.timeframes?.['1h']?.trend || htfTrend1h || 'neutral';
        const htf30mTrendForRegime = trendData.timeframes?.['30m']?.trend || 'neutral';
        const momentumStateForRegime = trendData?.momentum?.state || 'none';
        const stochK4hForRegime = extractStochRsiK(trendData, '4h');
        const primaryTrendForRegime = trendData?.primaryTrend || 'neutral';
        const isBBSqueeze = trendData?.bollingerBands?.squeezeActive || bbSqueeze?.isSqueeze || false;
        
        // Count aligned timeframes for breakout confirmation
        let alignedTFCount = 0;
        const tfTrends = trendData.timeframes || {};
        for (const tf of ['15m', '30m', '1h', '4h']) {
          const tfTrend = tfTrends[tf]?.trend;
          if ((derivedDirection === 'long' && tfTrend === 'bullish') || 
              (derivedDirection === 'short' && tfTrend === 'bearish')) {
            alignedTFCount++;
          }
        }
        
        const fourStateRegime = classify4StateRegime(
          adx,
          adxSlope,
          primaryTrendForRegime,
          momentumStateForRegime,
          earlySmartMomentum?.score ?? 0,
          htf1hTrendForRegime,
          htf30mTrendForRegime,
          derivedDirection,
          stochK4hForRegime,
          false,  // adxExhaustion not yet calculated; conservative default
          isBBSqueeze,
          alignedTFCount
        );
        
        logger.forSymbol(symbol).info(`${LOG_CATEGORIES.TREND} 🏷️ 4-STATE REGIME: ${fourStateRegime.regime} - ${fourStateRegime.reason}`);
        logger.forSymbol(symbol).info(`   → allowContinuation=${fourStateRegime.allowContinuation}, allowMR=${fourStateRegime.allowMeanReversion}, posMultiplier=${fourStateRegime.positionMultiplier.toFixed(2)}`);
        
        // HARD BLOCK: RANGE_COMPRESSION - no statistical edge exists
        // Note: MR bypass is checked via StochRSI extreme only (strategy-level MR check happens later)
        if (fourStateRegime.regime === 'RANGE_COMPRESSION') {
          const stochK = stochK4hForRegime;
          const mrStochCondition = stochK < FOUR_STATE_REGIME.RANGE_COMPRESSION.MR_BYPASS_MIN_STOCHRSI_DISTANCE || 
                                   stochK > (100 - FOUR_STATE_REGIME.RANGE_COMPRESSION.MR_BYPASS_MIN_STOCHRSI_DISTANCE);
          const mrBypassAllowed = fourStateRegime.allowMeanReversion && mrStochCondition;
          
          if (!mrBypassAllowed) {
            rejectedByHardGates++;
            const blockReason = `RANGE_COMPRESSION_BLOCK: 4-State regime=RANGE_COMPRESSION, primaryTrend=${primaryTrendForRegime}, momentum=${momentumStateForRegime}, ADX=${adx.toFixed(1)}, |score|=${Math.abs(earlySmartMomentum?.score ?? 0).toFixed(0)} → noise dominates, no edge`;
            perSymbolGateAttribution.set(symbol, { gate: 'RANGE_COMPRESSION_BLOCK', details: blockReason });
            
            logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.GATE} 🚫 ${blockReason}`);
            
            await logRejectionWithAI(supabase, userId, symbol, blockReason, {
              gate: 'RANGE_COMPRESSION_BLOCK',
              fourStateRegime: fourStateRegime.regime,
              derivedDirection,
              primaryTrend: primaryTrendForRegime,
              momentumState: momentumStateForRegime,
              momentumScore: (earlySmartMomentum?.score ?? 0).toFixed(1),
              adx: adx.toFixed(1),
              adxSlope: adxSlope.toFixed(2),
              alignedTimeframes: alignedTFCount,
              stochRsiK4h: stochK4hForRegime.toFixed(1),
              isSqueeze: isBBSqueeze,
              diagnostics: fourStateRegime.diagnostics,
            }, trendData, riskParams.ai_analysis_enabled !== false, earlyOrderFlowAnalysis);
            continue;
          } else {
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} 📊 RANGE_COMPRESSION: Would block but MR bypass allowed (stochK=${stochK.toFixed(1)} at extreme)`);
          }
        }
        
        // TREND_EXHAUSTION: Log regime state - continuation hard-block enforced at per-strategy level
        if (fourStateRegime.regime === 'TREND_EXHAUSTION' && !fourStateRegime.allowContinuation) {
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} ⚠️ TREND_EXHAUSTION: Continuation strategies will be HARD BLOCKED at strategy level, only MR probes proceed`);
        }
        
        // Apply 4-state regime position multiplier (stacks with other multipliers)
        let fourStatePositionMultiplier = fourStateRegime.positionMultiplier;
        
        // NOTE: MOMENTUM_DIRECTION_HARD_GATE and MOMENTUM_FLIP_DETECTION gates moved after smartMomentum calculation
        // (see after line ~3250 where smartMomentum is calculated)
        // ============= PHASE 10: SAME-DIRECTION RE-ENTRY COOLDOWN GATE =============
        // Check if derived direction matches the cooldown side
        // cooldownSide is 'sell' for SHORT positions, 'buy' for LONG positions
        if (SAME_DIRECTION_REENTRY_PROTECTION.ENABLED && sameDirectionCooldownActive && cooldownSide) {
          const isSameDirection = (cooldownSide === 'sell' && derivedDirection === 'short') ||
                                   (cooldownSide === 'buy' && derivedDirection === 'long');
          
          if (isSameDirection) {
            rejectedByHardGates++;
            const blockMsg = `Same-direction ${derivedDirection.toUpperCase()} blocked during cooldown (${cooldownSide === 'sell' ? 'SHORT' : 'LONG'} position closed recently)`;
            perSymbolGateAttribution.set(symbol, { gate: 'SAME_DIRECTION_COOLDOWN', details: blockMsg });
            
            if (SAME_DIRECTION_REENTRY_PROTECTION.LOG_BLOCKS) {
              logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.GATE} 🚫 SAME_DIRECTION_COOLDOWN: ${blockMsg}`);
              logger.forSymbol(symbol).warn(`   → This prevents re-entering same direction after timeout/trailing closes`);
            }
            
            await logRejectionWithAI(
              supabase, userId, symbol,
              `SAME_DIRECTION_COOLDOWN: ${blockMsg}`,
              {
                gate: "SAME_DIRECTION_COOLDOWN",
                derivedDirection,
                cooldownSide,
                cooldownMinutes: SAME_DIRECTION_REENTRY_PROTECTION.COOLDOWN_MINUTES,
                triggerCloseReasons: SAME_DIRECTION_REENTRY_PROTECTION.TRIGGER_CLOSE_REASONS,
              },
              trendData,
              riskParams.ai_analysis_enabled !== false,
              earlyOrderFlowAnalysis
            );
            continue;
          } else if (SAME_DIRECTION_REENTRY_PROTECTION.LOG_BLOCKS) {
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} ✅ SAME_DIRECTION_COOLDOWN: Opposite direction ${derivedDirection.toUpperCase()} allowed during cooldown`);
          }
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
        
        // ============= CONSECUTIVE CANDLE MOMENTUM POSITION SIZING =============
        // Apply 65% position size for consecutive candle momentum entries (5+ consecutive 1h bars with neutral 4h)
        let consecutiveCandlePositionMultiplier = 1.0;
        if (directionResult.source === "consecutive-candle-momentum") {
          consecutiveCandlePositionMultiplier = 0.65;  // 65% position size
          const consecutiveBars1h = momentum?.consecutiveBars1h ?? 0;
          const consecutiveBars30m = momentum?.consecutiveBars30m ?? 0;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} CONSECUTIVE CANDLE MOMENTUM: ${consecutiveBars1h} 1h bars (30m=${consecutiveBars30m}) - position size ${(consecutiveCandlePositionMultiplier * 100).toFixed(0)}%`);
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
        
        // ============= SMART MOMENTUM ANALYSIS (REUSE EARLY CALCULATION) =============
        // CRITICAL: smartMomentum was calculated EARLY in pipeline (before deriveTradeDirection)
        // This ensures graduated momentum penalty can prevent counter-momentum direction derivation
        // Reuse the early values to avoid duplicate computation
        const symbolHistData = historicalDataMap.get(symbol);
        const klineData = symbolHistData?.klines || [];
        const priceData = symbolHistData?.prices || [];
        const currentATR = earlyATR;  // Reuse early calculation
        
        // Reuse early calculations
        const fullAdxResult = earlyFullAdxResult;
        const adxSlopeForMomentum = earlyAdxSlope;
        const smartAdxRising = earlySmartAdxRising;
        
        // REUSE early momentum calculation (already injected into trendData.smartMomentum)
        const smartMomentum = earlySmartMomentum;
        
        // ============= CRITICAL: MOMENTUM DIRECTION HARD GATE =============
        // This gate runs BEFORE any exception overrides (MICRO_TREND, STRONG_TREND, etc.)
        // Root cause fix: System entered SHORT just as momentum flipped bullish (from -64 to +36)
        if (MOMENTUM_DIRECTION_HARD_GATE.ENABLED) {
          const momentumCheck = checkMomentumDirectionAlignment(
            smartMomentum.score,
            derivedDirection,
            MOMENTUM_DIRECTION_HARD_GATE.BLOCK_SHORT_ABOVE_SCORE,
            MOMENTUM_DIRECTION_HARD_GATE.BLOCK_LONG_BELOW_SCORE
          );
          
          if (momentumCheck.blocked) {
            // Check for exception #1: High ADX with HTF alignment
            const htfAlignedWithDir = (derivedDirection === 'long' && htfTrend4h === 'bullish') ||
                                       (derivedDirection === 'short' && htfTrend4h === 'bearish');
            const adxExceptionAllowed = adx >= MOMENTUM_DIRECTION_HARD_GATE.EXCEPTION_MIN_ADX &&
              (!MOMENTUM_DIRECTION_HARD_GATE.EXCEPTION_REQUIRE_HTF_ALIGNMENT || htfAlignedWithDir);
            
            // Check for exception #2: Price Action Override
            // When price moved 3%+ in trade direction, override lagging momentum indicators
            let priceActionOverrideAllowed = false;
            let priceActionPositionMultiplier = 1.0;
            const priceActionOverride = MOMENTUM_DIRECTION_HARD_GATE.PRICE_ACTION_OVERRIDE;
            
            if (priceActionOverride?.ENABLED && adx >= priceActionOverride.MIN_ADX) {
              // Get current price from the latest kline data
              const latestPrice = priceData.length > 0 ? priceData[priceData.length - 1] : 
                                  (klineData.length > 0 ? parseFloat(klineData[klineData.length - 1][4]) : 0);
              
              // Get price change from 24h high/low based on direction
              const priceHigh24h = trendData.priceChange?.high24h ?? latestPrice;
              const priceLow24h = trendData.priceChange?.low24h ?? latestPrice;
              
              if (derivedDirection === 'short' && latestPrice > 0) {
                // For SHORT: Check if price dropped significantly from 24h high
                const dropFromHigh = ((priceHigh24h - latestPrice) / priceHigh24h) * 100;
                
                if (dropFromHigh >= priceActionOverride.MIN_PRICE_MOVE_PERCENT) {
                  // FIX: Check persistence requirement (move must not be single-candle impulse)
                  let persistenceOk = true;
                  if (priceActionOverride.REQUIRE_PERSISTENCE && priceActionOverride.MIN_BARS_SINCE_EXTREME) {
                    // Find bar index where high was made (simplified: check last N bars)
                    const recentHighBars = klineData.slice(-12); // Last 12 bars (3h on 15m)
                    const highPrices = recentHighBars.map(k => parseFloat(k[2])); // k[2] = high
                    const maxHighPrice = Math.max(...highPrices);
                    const barsAgoMax = highPrices.length - 1 - highPrices.lastIndexOf(maxHighPrice);
                    persistenceOk = barsAgoMax >= priceActionOverride.MIN_BARS_SINCE_EXTREME;
                    
                    if (!persistenceOk) {
                      logger.forSymbol(symbol).debug(`${LOG_CATEGORIES.GATE} 📉 PRICE_ACTION_OVERRIDE blocked: High was ${barsAgoMax} bars ago (need ${priceActionOverride.MIN_BARS_SINCE_EXTREME})`);
                    }
                  }
                  
                  // FIX: Hard zone protection - require higher ADX when in exhausted zone
                  let hardZoneOk = true;
                  const hardZoneThreshold = priceActionOverride.HARD_ZONE_THRESHOLD_PERCENT ?? 5.0;
                  const hardZoneMinAdx = priceActionOverride.HARD_ZONE_MIN_ADX ?? 35;
                  if (dropFromHigh >= hardZoneThreshold && adx < hardZoneMinAdx) {
                    hardZoneOk = false;
                    logger.forSymbol(symbol).debug(`${LOG_CATEGORIES.GATE} 📉 PRICE_ACTION_OVERRIDE blocked: In HARD_ZONE (${dropFromHigh.toFixed(1)}% >= ${hardZoneThreshold}%) but ADX=${adx.toFixed(1)} < ${hardZoneMinAdx}`);
                  }
                  
                  if (persistenceOk && hardZoneOk) {
                    priceActionOverrideAllowed = true;
                    priceActionPositionMultiplier = priceActionOverride.POSITION_SIZE_MULTIPLIER;
                    logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} 📉 PRICE_ACTION_OVERRIDE: Price dropped ${dropFromHigh.toFixed(1)}% from 24h high, overriding bullish momentum lag`);
                  }
                }
              } else if (derivedDirection === 'long' && latestPrice > 0) {
                // For LONG: Check if price rallied significantly from 24h low
                const riseFromLow = ((latestPrice - priceLow24h) / priceLow24h) * 100;
                
                if (riseFromLow >= priceActionOverride.MIN_PRICE_MOVE_PERCENT) {
                  // FIX: Check persistence requirement
                  let persistenceOk = true;
                  if (priceActionOverride.REQUIRE_PERSISTENCE && priceActionOverride.MIN_BARS_SINCE_EXTREME) {
                    const recentLowBars = klineData.slice(-12);
                    const lowPrices = recentLowBars.map(k => parseFloat(k[3])); // k[3] = low
                    const minLowPrice = Math.min(...lowPrices);
                    const barsAgoMin = lowPrices.length - 1 - lowPrices.lastIndexOf(minLowPrice);
                    persistenceOk = barsAgoMin >= priceActionOverride.MIN_BARS_SINCE_EXTREME;
                    
                    if (!persistenceOk) {
                      logger.forSymbol(symbol).debug(`${LOG_CATEGORIES.GATE} 📈 PRICE_ACTION_OVERRIDE blocked: Low was ${barsAgoMin} bars ago (need ${priceActionOverride.MIN_BARS_SINCE_EXTREME})`);
                    }
                  }
                  
                  // FIX: Hard zone protection
                  let hardZoneOk = true;
                  const hardZoneThreshold = priceActionOverride.HARD_ZONE_THRESHOLD_PERCENT ?? 5.0;
                  const hardZoneMinAdx = priceActionOverride.HARD_ZONE_MIN_ADX ?? 35;
                  if (riseFromLow >= hardZoneThreshold && adx < hardZoneMinAdx) {
                    hardZoneOk = false;
                    logger.forSymbol(symbol).debug(`${LOG_CATEGORIES.GATE} 📈 PRICE_ACTION_OVERRIDE blocked: In HARD_ZONE (${riseFromLow.toFixed(1)}% >= ${hardZoneThreshold}%) but ADX=${adx.toFixed(1)} < ${hardZoneMinAdx}`);
                  }
                  
                  if (persistenceOk && hardZoneOk) {
                    priceActionOverrideAllowed = true;
                    priceActionPositionMultiplier = priceActionOverride.POSITION_SIZE_MULTIPLIER;
                    logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} 📈 PRICE_ACTION_OVERRIDE: Price rallied ${riseFromLow.toFixed(1)}% from 24h low, overriding bearish momentum lag`);
                  }
                }
              }
            }
            
            // ===== EXCEPTION #3: 1H TREND AGREEMENT BYPASS (Phase 1 MODERATE) =====
            // When 1h trend aligns with trade direction, allow bypass with reduced position
            // Root cause fix: SHORT with bullish momentum (+26) blocked despite 1h bearish trend
            let htf1hAgreementBypassAllowed = false;
            let htf1hAgreementPositionMultiplier = 1.0;
            const htf1hBypass = MOMENTUM_DIRECTION_HARD_GATE.HTF_1H_AGREEMENT_BYPASS;
            
            if (htf1hBypass?.ENABLED) {
              const absMomentumScore = Math.abs(smartMomentum.score);
              const isInModerateZone = absMomentumScore >= htf1hBypass.MODERATE_MIN_SCORE && 
                                        absMomentumScore <= htf1hBypass.MODERATE_MAX_SCORE;
              
              // Check if 1h trend agrees with trade direction
              const htf1hAlignedWithDir = (derivedDirection === 'long' && htfTrend1h === 'bullish') ||
                                           (derivedDirection === 'short' && htfTrend1h === 'bearish');
              
              if (isInModerateZone && htf1hAlignedWithDir) {
                htf1hAgreementBypassAllowed = true;
                // Graduate position sizing based on momentum severity
                if (absMomentumScore <= 30) {
                  htf1hAgreementPositionMultiplier = htf1hBypass.POSITION_MULT_MILD;  // 70%
                } else {
                  htf1hAgreementPositionMultiplier = htf1hBypass.POSITION_MULT_MODERATE;  // 50%
                }
                
                if (htf1hBypass.LOG_BYPASSES) {
                  logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} ⚠️ 1H_TREND_AGREEMENT_BYPASS: ${derivedDirection.toUpperCase()} allowed despite opposing momentum`);
                  logger.forSymbol(symbol).info(`   → 1h trend=${htfTrend1h} aligns with ${derivedDirection}, momentum=${smartMomentum.score.toFixed(0)}`);
                  logger.forSymbol(symbol).info(`   → Position reduced to ${(htf1hAgreementPositionMultiplier * 100).toFixed(0)}%`);
                }
              }
            }
            
            if (!adxExceptionAllowed && !priceActionOverrideAllowed && !htf1hAgreementBypassAllowed) {
              // Determine phase for diagnostic transparency
              const absMomentumScore = Math.abs(smartMomentum.score);
              const phase = absMomentumScore > 50 ? 'EXTREME' : absMomentumScore >= 15 ? 'MODERATE' : 'MILD';
              const htf1hAlignedWithDir = (derivedDirection === 'long' && htfTrend1h === 'bullish') ||
                                           (derivedDirection === 'short' && htfTrend1h === 'bearish');
              
              rejectedByHardGates++;
              perSymbolGateAttribution.set(symbol, { gate: 'MOMENTUM_DIRECTION_HARD_GATE', details: momentumCheck.reason });
              logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.GATE} 🚫 MOMENTUM_DIRECTION_HARD_GATE: ${momentumCheck.reason}`);
              logger.forSymbol(symbol).warn(`   → Momentum=${smartMomentum.score.toFixed(0)}, ADX=${adx.toFixed(1)}, 4h=${htfTrend4h}, 1h=${htfTrend1h}`);
              logger.forSymbol(symbol).warn(`   → Phase=${phase}, 1hAligned=${htf1hAlignedWithDir}`);
              
              await logRejectionWithAI(supabase, userId, symbol, `MOMENTUM_DIRECTION_HARD_GATE: ${momentumCheck.reason}`,
                { 
                  gate: "MOMENTUM_DIRECTION_HARD_GATE", 
                  derivedDirection, 
                  momentumScore: smartMomentum.score, 
                  momentumState: trendData?.momentum?.state || 'none',
                  adx,
                  adxSlope: fullAdxResult.adxSlope,
                  htfTrend4h, 
                  htfTrend1h,
                  phase,
                  htf1hAlignedWithDir,
                  bypassConditions: {
                    adxException: { met: adxExceptionAllowed, requiredAdx: MOMENTUM_DIRECTION_HARD_GATE.EXCEPTION_MIN_ADX },
                    priceActionOverride: { met: priceActionOverrideAllowed },
                    htf1hAgreement: { 
                      met: false, 
                      reason: absMomentumScore > 50 ? 'EXTREME_MOMENTUM_NO_BYPASS' : 
                              !htf1hAlignedWithDir ? '1H_TREND_NOT_ALIGNED' : 'OTHER',
                      htf1hTrend: htfTrend1h,
                      expectedTrend: derivedDirection === 'long' ? 'bullish' : 'bearish'
                    }
                  },
                  severity: momentumCheck.severity 
                },
                trendData, riskParams.ai_analysis_enabled !== false, earlyOrderFlowAnalysis);
              continue;
            } else if (adxExceptionAllowed) {
              logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.GATE} ⚠️ MOMENTUM_HARD_GATE bypassed: ADX=${adx.toFixed(1)} >= ${MOMENTUM_DIRECTION_HARD_GATE.EXCEPTION_MIN_ADX}`);
            } else if (priceActionOverrideAllowed) {
              // Apply position size reduction for price action override
              logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.GATE} ⚠️ MOMENTUM_HARD_GATE bypassed via PRICE_ACTION_OVERRIDE: position at ${(priceActionPositionMultiplier * 100).toFixed(0)}%`);
              // Store for later position sizing
              (trendData as any).priceActionOverrideMultiplier = priceActionPositionMultiplier;
            } else if (htf1hAgreementBypassAllowed) {
              // Store for later position sizing
              (trendData as any).htf1hAgreementMultiplier = htf1hAgreementPositionMultiplier;
            }
          }
        }

        // ============= CRITICAL: MOVE EXHAUSTED REVERSAL GATE (SHORT SYMMETRY FIX) =============
        // ROOT CAUSE FIX: SHORTs have no equivalent gate to block entries during rallies
        // LONGs are blocked by "MOVE_EXHAUSTED: Price rallied 5%" but SHORTs were missing this
        if (MOVE_EXHAUSTED_REVERSAL_GATE.ENABLED && derivedDirection === 'short') {
          // CENTRALIZED: Use shared extractors
          const priceChange4h = extractPriceChange(trendData, '4h');
          const stochRsiK4h = extractStochRsiK(trendData, '4h');
          
          // Block SHORT if price ROSE significantly in last hours
          if (priceChange4h > MOVE_EXHAUSTED_REVERSAL_GATE.BLOCK_SHORT_IF_PRICE_ROSE_PERCENT) {
            // Check for exception: strong downtrend with 4h bearish
            const exceptionAllowed = MOVE_EXHAUSTED_REVERSAL_GATE.EXCEPTION_MIN_ADX &&
              adx >= MOVE_EXHAUSTED_REVERSAL_GATE.EXCEPTION_MIN_ADX &&
              (!MOVE_EXHAUSTED_REVERSAL_GATE.EXCEPTION_REQUIRE_BEARISH_4H || htfTrend4h === 'bearish');
            
            if (!exceptionAllowed) {
              rejectedByHardGates++;
              const blockReason = `MOVE_EXHAUSTED_REVERSAL: Price rose ${priceChange4h.toFixed(1)}% in last 4h (threshold: ${MOVE_EXHAUSTED_REVERSAL_GATE.BLOCK_SHORT_IF_PRICE_ROSE_PERCENT}%), too late to SHORT`;
              perSymbolGateAttribution.set(symbol, { gate: 'MOVE_EXHAUSTED_REVERSAL', details: blockReason });
              
              logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.GATE} 🚫 ${blockReason}`);
              logger.forSymbol(symbol).warn(`   → This prevents shorting into rallies (symmetric with LONG protection)`);
              
              await logRejectionWithAI(supabase, userId, symbol, blockReason, {
                gate: "MOVE_EXHAUSTED_REVERSAL",
                derivedDirection,
                priceChange4h: priceChange4h.toFixed(2),
                stochRsiK4h: stochRsiK4h.toFixed(1),
                htfTrend4h,
                adx: adx.toFixed(1),
                threshold: MOVE_EXHAUSTED_REVERSAL_GATE.BLOCK_SHORT_IF_PRICE_ROSE_PERCENT,
              }, trendData, riskParams.ai_analysis_enabled !== false, earlyOrderFlowAnalysis);
              continue;
            } else {
              logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} ⚠️ MOVE_EXHAUSTED_REVERSAL bypassed: ADX=${adx.toFixed(1)}, 4h=${htfTrend4h}`);
            }
          }
          
          // Also check: StochRSI already oversold during rally = bad short
          if (priceChange4h > 0.5 && stochRsiK4h < MOVE_EXHAUSTED_REVERSAL_GATE.MIN_STOCHRSI_K_FOR_LATE_SHORT) {
            rejectedByHardGates++;
            const blockReason = `MOVE_EXHAUSTED_REVERSAL: Price rising (${priceChange4h.toFixed(1)}%) + StochRSI K=${stochRsiK4h.toFixed(0)} < ${MOVE_EXHAUSTED_REVERSAL_GATE.MIN_STOCHRSI_K_FOR_LATE_SHORT} (oversold), can't SHORT`;
            perSymbolGateAttribution.set(symbol, { gate: 'MOVE_EXHAUSTED_REVERSAL', details: blockReason });
            
            logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.GATE} 🚫 ${blockReason}`);
            
            await logRejectionWithAI(supabase, userId, symbol, blockReason, {
              gate: "MOVE_EXHAUSTED_REVERSAL",
              derivedDirection,
              priceChange4h: priceChange4h.toFixed(2),
              stochRsiK4h: stochRsiK4h.toFixed(1),
              reason: "oversold_during_rally",
            }, trendData, riskParams.ai_analysis_enabled !== false, earlyOrderFlowAnalysis);
            continue;
          }
        }
        
        // ============= CRITICAL: TREND REVERSAL DETECTION GATE =============
        // Detects when indicators show a trend is reversing and blocks entries in OLD direction
        if (TREND_REVERSAL_DETECTION_GATE.ENABLED) {
          // CENTRALIZED: Use shared extractors for StochRSI K values
          const stochK = extractStochRsiK(trendData, '4h');
          const stochKPrev = trendData.stochasticRsi?.['4h']?.prevK ?? stochK;
          const macdHist = trendData.momentum?.macdHistogram ?? 0;
          const macdHistPrev = trendData.momentum?.macdHistogramPrevious ?? macdHist;
          const priceChange4h = trendData.priceChange?.percent4h ?? 0;
          
          // Detect BULLISH reversal (blocks SHORT)
          const stochCrossingUp = stochKPrev < TREND_REVERSAL_DETECTION_GATE.STOCH_CROSSING_UP_MIN_K && 
                                  stochK > TREND_REVERSAL_DETECTION_GATE.STOCH_CROSSING_UP_MIN_K &&
                                  stochK < 50; // Still in lower half but rising
          const macdFlippingPositive = TREND_REVERSAL_DETECTION_GATE.MACD_FLIP_DETECTION && 
                                       macdHistPrev < 0 && macdHist > 0;
          const priceRisingSignificantly = priceChange4h > TREND_REVERSAL_DETECTION_GATE.MIN_PRICE_CHANGE_PERCENT;
          
          const bullishReversalDetected = (stochCrossingUp || macdFlippingPositive) && priceRisingSignificantly;
          
          // Detect BEARISH reversal (blocks LONG)
          const stochCrossingDown = stochKPrev > TREND_REVERSAL_DETECTION_GATE.STOCH_CROSSING_DOWN_MAX_K && 
                                    stochK < TREND_REVERSAL_DETECTION_GATE.STOCH_CROSSING_DOWN_MAX_K &&
                                    stochK > 50; // Still in upper half but falling
          const macdFlippingNegative = TREND_REVERSAL_DETECTION_GATE.MACD_FLIP_DETECTION && 
                                       macdHistPrev > 0 && macdHist < 0;
          const priceFallingSignificantly = priceChange4h < -TREND_REVERSAL_DETECTION_GATE.MIN_PRICE_CHANGE_PERCENT;
          
          const bearishReversalDetected = (stochCrossingDown || macdFlippingNegative) && priceFallingSignificantly;
          
          // Block entries in OLD direction
          if (derivedDirection === 'short' && bullishReversalDetected && TREND_REVERSAL_DETECTION_GATE.BLOCK_SHORT_ON_BULLISH_REVERSAL) {
            // Check exception
            const exceptionAllowed = adx >= TREND_REVERSAL_DETECTION_GATE.EXCEPTION_MIN_ADX &&
              (!TREND_REVERSAL_DETECTION_GATE.EXCEPTION_REQUIRE_HTF_ALIGNMENT || htfTrend4h === 'bearish');
            
            if (!exceptionAllowed) {
              rejectedByHardGates++;
              const blockReason = `TREND_REVERSAL: Bullish reversal detected (StochRSI crossing up: ${stochCrossingUp}, MACD flipping positive: ${macdFlippingPositive}, price +${priceChange4h.toFixed(1)}%) - blocking SHORT`;
              perSymbolGateAttribution.set(symbol, { gate: 'TREND_REVERSAL_DETECTION', details: blockReason });
              
              logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.GATE} 🚫 ${blockReason}`);
              
              await logRejectionWithAI(supabase, userId, symbol, blockReason, {
                gate: "TREND_REVERSAL_DETECTION",
                derivedDirection,
                reversalType: "bullish",
                stochK: stochK.toFixed(1),
                stochKPrev: stochKPrev.toFixed(1),
                macdHist: macdHist.toFixed(4),
                macdHistPrev: macdHistPrev.toFixed(4),
                priceChange4h: priceChange4h.toFixed(2),
                stochCrossingUp,
                macdFlippingPositive,
              }, trendData, riskParams.ai_analysis_enabled !== false, earlyOrderFlowAnalysis);
              continue;
            }
          }
          
          if (derivedDirection === 'long' && bearishReversalDetected && TREND_REVERSAL_DETECTION_GATE.BLOCK_LONG_ON_BEARISH_REVERSAL) {
            // Check exception
            const exceptionAllowed = adx >= TREND_REVERSAL_DETECTION_GATE.EXCEPTION_MIN_ADX &&
              (!TREND_REVERSAL_DETECTION_GATE.EXCEPTION_REQUIRE_HTF_ALIGNMENT || htfTrend4h === 'bullish');
            
            if (!exceptionAllowed) {
              rejectedByHardGates++;
              const blockReason = `TREND_REVERSAL: Bearish reversal detected (StochRSI crossing down: ${stochCrossingDown}, MACD flipping negative: ${macdFlippingNegative}, price ${priceChange4h.toFixed(1)}%) - blocking LONG`;
              perSymbolGateAttribution.set(symbol, { gate: 'TREND_REVERSAL_DETECTION', details: blockReason });
              
              logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.GATE} 🚫 ${blockReason}`);
              
              await logRejectionWithAI(supabase, userId, symbol, blockReason, {
                gate: "TREND_REVERSAL_DETECTION",
                derivedDirection,
                reversalType: "bearish",
                stochK: stochK.toFixed(1),
                stochKPrev: stochKPrev.toFixed(1),
                macdHist: macdHist.toFixed(4),
                macdHistPrev: macdHistPrev.toFixed(4),
                priceChange4h: priceChange4h.toFixed(2),
                stochCrossingDown,
                macdFlippingNegative,
              }, trendData, riskParams.ai_analysis_enabled !== false, earlyOrderFlowAnalysis);
              continue;
            }
          }
        }

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
        
        // NEW: Detect BEHAVIORAL ADX exhaustion (slope-based, not absolute threshold)
        const adxExhaustion = detectADXExhaustion(
          fullAdxResult,
          priceData,
          rsiArrayForPullback,
          derivedDirection
        );
        
        // Log ADX exhaustion analysis
        if (fullAdxResult.adx >= 35) {
          logger.forSymbol(symbol).info(`📊 ADX BEHAVIORAL: adx=${fullAdxResult.adx.toFixed(1)} slope=${fullAdxResult.adxSlope.toFixed(2)} peaked=${fullAdxResult.adxPeaked} diGap=${fullAdxResult.diGap.toFixed(1)}`);
          logger.forSymbol(symbol).info(`📊 EXHAUSTION CHECK: isExhausted=${adxExhaustion.isExhausted} isContinuation=${adxExhaustion.isContinuation} type=${adxExhaustion.exhaustionType} score=${adxExhaustion.exhaustionScore}`);
          if (adxExhaustion.reasons.length > 0) {
            logger.forSymbol(symbol).info(`   ${adxExhaustion.reasons.join(' | ')}`);
          }
          
          // ===== SHADOW MODE: Compare old vs new ADX exhaustion gate logic =====
          // Get trend age from trend data (bars since trend started)
          const trendAgeBars = trendData.trendAge?.bars ?? 0;
          // Price action confirmed = continuation candles or structure intact
          const priceActionConfirmed = adxExhaustion.isContinuation || !adxExhaustion.isExhausted;
          
          const adxExhaustionComparison = compareADXExhaustionGate(
            adxExhaustion.exhaustionScore,
            fullAdxResult.adxSlope < 0 ? Math.abs(fullAdxResult.adxSlope * 10) : 0, // Approximate decline
            trendAgeBars,
            priceActionConfirmed
          );
          
          // Log shadow signal if gate behavior changed (old would have blocked, new passes)
          if (adxExhaustionComparison.wouldHaveChanged && shadowModeEnabled) {
            logShadowSignal(supabase as any, {
              userId,
              symbol,
              signalType: derivedDirection as 'long' | 'short',
              strategyName: 'N/A',
              gateBlockedBy: 'adx_exhaustion',
              oldGateResult: 'blocked',
              newGateResult: 'passed',
              gateDetails: {
                exhaustionScore: adxExhaustion.exhaustionScore,
                adx: fullAdxResult.adx,
                adxSlope: fullAdxResult.adxSlope,
                trendAgeBars,
                priceActionConfirmed,
                isContinuation: adxExhaustion.isContinuation,
                oldThreshold: adxExhaustionComparison.oldThreshold,
                newThreshold: adxExhaustionComparison.newThreshold,
              },
              confidenceScore: confidence,
              trend,
              indicators: {
                adxPeaked: fullAdxResult.adxPeaked,
                diGap: fullAdxResult.diGap,
                exhaustionType: adxExhaustion.exhaustionType,
              }
            }).catch(err => logger.forSymbol(symbol).error(`Shadow mode ADX exhaustion log failed: ${err}`));
          }
        }
        
        // Classify market regime using smart module WITH behavioral exhaustion
        const volume1hDataForRegime = trendData.volume?.["1h"] || {};
        const volumeRatioForRegime = volume1hDataForRegime.volumeRatio ?? 1.0;
        const smartRegime = classifySmartRegime(
          adx,
          smartAdxRising,
          smartMomentum,
          bbSqueeze.bbWidth,
          bbSqueeze.isSqueeze,
          volumeRatioForRegime,
          adxExhaustion  // NEW: Pass behavioral exhaustion result
        );
        
        // ============= PHASE 0: MASTER MARKET REGIME CLASSIFICATION =============
        // Critical foundation: ADX defines regime, all other gates change meaning based on regime
        // This runs ONCE at start of symbol processing - all subsequent gates reference this
        const driftPercent = trendData.stealthTrend?.driftPercent || 0;
        
        // NEW: Pass DI values for accurate trend direction derivation
        const diPlusForRegime = fullAdxResult.plusDI ?? 25;
        const diMinusForRegime = fullAdxResult.minusDI ?? 25;
        
        const masterRegime = classifyMasterRegime(
          adx,
          fullAdxResult.adxSlope ?? (smartAdxRising ? 0.5 : -0.3),
          driftPercent,
          htfTrend4h,
          htfTrend1h,
          adxExhaustion.isExhausted,
          diPlusForRegime,    // NEW: Pass DI+ for trend direction
          diMinusForRegime    // NEW: Pass DI- for trend direction
        );
        
        // ============= MASTER REGIME GATE OVERRIDES =============
        // Extract regime-aware thresholds for use in all gate checks
        const regimeGates = masterRegime.gateOverrides;
        const isRegimeOverrideActive = masterRegime.isStrongTrendOverride || masterRegime.isParabolicOverride;
        
        // Regime-aware Bollinger thresholds (used in %B gate checks)
        const regimeBollingerMaxPercentB = regimeGates.bollingerMaxPercentB;
        const regimeBollingerMinPercentB = regimeGates.bollingerMinPercentB;
        
        // Regime-aware StochRSI thresholds (used in overbought/oversold checks)
        const regimeStochRsiMaxK = regimeGates.stochRsiMaxK;
        const regimeStochRsiMinK = regimeGates.stochRsiMinK;
        
        // Regime-aware momentum minimum (used in momentum gate)
        const regimeMomentumMinimum = regimeGates.momentumScoreMinimum;
        
        // Regime-aware quality boost (applied to entry quality scores)
        const regimeQualityBoost = regimeGates.qualityBoost;
        
        // Regime-aware position multiplier (applied to position sizing)
        const regimePositionMultiplier = regimeGates.positionMultiplier;
        
        // NEW: Extract enhanced regime fields for counter-trend protection
        const regimeTrendDirection = masterRegime.trendDirection;
        const regimeIsMatureTrend = masterRegime.isMatureTrend;
        const regimeRequirePullback = masterRegime.requirePullback;
        const regimeRuleId = masterRegime.regimeRuleId;
        
        logger.forSymbol(symbol).info(`${LOG_CATEGORIES.TREND} 🎯 MASTER REGIME: ${masterRegime.regime} (${regimeRuleId}) - ${masterRegime.reason}`);
        logger.forSymbol(symbol).info(`   → Trend direction: ${regimeTrendDirection}, isMatureTrend: ${regimeIsMatureTrend}, requirePullback: ${regimeRequirePullback}`);
        if (isRegimeOverrideActive) {
          logger.forSymbol(symbol).info(`   → Gates become CONTEXT: BB max=${regimeBollingerMaxPercentB}%, min=${regimeBollingerMinPercentB}%`);
          logger.forSymbol(symbol).info(`   → StochRSI: max K=${regimeStochRsiMaxK}, min K=${regimeStochRsiMinK}`);
          logger.forSymbol(symbol).info(`   → Momentum min=${regimeMomentumMinimum}, Quality boost: +${regimeQualityBoost}, Position: ${(regimePositionMultiplier * 100).toFixed(0)}%`);
        }
        
        // ============= PHASE 12: REGIME TRANSITION QUALITY BOOST =============
        // Expert insight: "When regime weakens, require stronger confirmation"
        // Track regime transitions and add quality boost for same-direction entries
        let regimeTransitionQualityBoost = 0;
        
        if (REGIME_TRANSITION_PROTECTION.ENABLED) {
          // Query last signal for this symbol to check if regime changed
          const transitionCutoff = new Date(Date.now() - REGIME_TRANSITION_PROTECTION.TRANSITION_WINDOW_MINUTES * 60 * 1000).toISOString();
          
          const { data: lastSignalForRegime } = await supabase
            .from('trading_signals')
            .select('id, indicators')
            .eq('user_id', userId)
            .eq('symbol', symbol)
            .gte('created_at', transitionCutoff)
            .order('created_at', { ascending: false })
            .limit(1);
          
          if (lastSignalForRegime && lastSignalForRegime.length > 0) {
            const previousRegime = lastSignalForRegime[0].indicators?.masterRegime?.regime;
            const currentRegime = masterRegime.regime;
            
            if (previousRegime && previousRegime !== currentRegime) {
              // Check for weakening transitions
              let isWeakeningTransition = false;
              
              if (previousRegime === 'PARABOLIC' && REGIME_TRANSITION_PROTECTION.WEAKENING_TRANSITIONS.FROM_PARABOLIC.includes(currentRegime as any)) {
                isWeakeningTransition = true;
              } else if (previousRegime === 'STRONG_TREND' && REGIME_TRANSITION_PROTECTION.WEAKENING_TRANSITIONS.FROM_STRONG_TREND.includes(currentRegime as any)) {
                isWeakeningTransition = true;
              } else if (previousRegime === 'NORMAL' && REGIME_TRANSITION_PROTECTION.WEAKENING_TRANSITIONS.FROM_NORMAL.includes(currentRegime as any)) {
                isWeakeningTransition = true;
              }
              
              if (isWeakeningTransition) {
                regimeTransitionQualityBoost = REGIME_TRANSITION_PROTECTION.QUALITY_BOOST_ON_WEAKENING;
                
                if (REGIME_TRANSITION_PROTECTION.LOG_BLOCKS) {
                  logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.GATE} ⚠️ REGIME_TRANSITION: ${previousRegime} → ${currentRegime} | +${regimeTransitionQualityBoost} quality required`);
                }
              }
            }
          }
        }
        
        // ============= CRITICAL: COUNTER-TREND PROTECTION GATE (Phase 8) =============
        // PREVENTS: Trading LONG when trend is strongly bearish, or SHORT when strongly bullish
        // This gate runs IMMEDIATELY after regime classification to block counter-trend entries
        // NOW USES: Shared COUNTER_TREND_PROTECTION from constants.ts (single source of truth)
        
        // Check for counter-trend entry (LONG against bearish trend, or SHORT against bullish trend)
        // ===== CRITICAL BUG FIX =====
        // Previous logic: Momentum alone could trigger block, even when trend aligned!
        // Example bug: ETH LONG blocked because momentum=-42, even though trend was BULLISH
        // Fix: Momentum opposition should ONLY block when COMBINED with adverse trend direction
        // OR when momentum is VERY strongly opposite (score < -35 for long, > 35 for short)
        
        const isCounterTrendLong = derivedDirection === "long" && (
          // CASE 1: Strong trend in opposite direction = BLOCK LONG
          (adx >= COUNTER_TREND_PROTECTION.ADX_THRESHOLD_FOR_BLOCK && regimeTrendDirection === 'bearish') ||
          // CASE 2: Bearish trend + strongly negative momentum = BLOCK LONG
          // (Both conditions required - momentum alone doesn't block anymore)
          (regimeTrendDirection === 'bearish' && smartMomentum.score < COUNTER_TREND_PROTECTION.MOMENTUM.STRONG_OPPOSITE_LONG) ||
          // CASE 3: EXTREME momentum opposition ONLY blocks if trend is NOT aligned
          // This prevents ETH-style false blocks: bullish trend + long direction should not be blocked by momentum score alone
          (regimeTrendDirection !== 'bullish' && smartMomentum.score < -35)
        );
        
        const isCounterTrendShort = derivedDirection === "short" && (
          // CASE 1: Strong trend in opposite direction = BLOCK SHORT
          (adx >= COUNTER_TREND_PROTECTION.ADX_THRESHOLD_FOR_BLOCK && regimeTrendDirection === 'bullish') ||
          // CASE 2: Bullish trend + strongly positive momentum = BLOCK SHORT
          // (Both conditions required - momentum alone doesn't block anymore)
          (regimeTrendDirection === 'bullish' && smartMomentum.score > COUNTER_TREND_PROTECTION.MOMENTUM.STRONG_OPPOSITE_SHORT) ||
          // CASE 3: EXTREME momentum opposition ONLY blocks if trend is NOT aligned
          (regimeTrendDirection !== 'bearish' && smartMomentum.score > 35)
        );
        
        if (COUNTER_TREND_PROTECTION.ENABLED && (isCounterTrendLong || isCounterTrendShort)) {
          const blockReason = isCounterTrendLong 
            ? `LONG blocked against ${regimeTrendDirection} trend (ADX=${adx.toFixed(1)}, momentum=${smartMomentum.score})`
            : `SHORT blocked against ${regimeTrendDirection} trend (ADX=${adx.toFixed(1)}, momentum=${smartMomentum.score})`;
          
          // ===== PHASE 2 FIX: ATTEMPT FALLBACK TO TREND-ALIGNED DIRECTION =====
          // Instead of rejecting immediately, try to derive the opposite (trend-aligned) direction
          const fallbackDirection: "long" | "short" = isCounterTrendLong ? "short" : "long";
          const fallbackAligns = (fallbackDirection === "short" && regimeTrendDirection === "bearish") ||
                                 (fallbackDirection === "long" && regimeTrendDirection === "bullish");
          
          // Only apply fallback if: enabled, regime is trending (not low-ADX), and fallback aligns with regime
          // Note: MasterMarketRegime doesn't include "RANGING" - use ADX < 20 as proxy for non-trending
          const isRangingMarket = adx < 20 && (masterRegime.regime === "NORMAL" || masterRegime.regime === "STEALTH_DRIFT");
          const canApplyFallback = COUNTER_TREND_PROTECTION.FALLBACK_TO_TREND_ALIGNED && 
                                   fallbackAligns && 
                                   (!COUNTER_TREND_PROTECTION.REQUIRE_TRENDING_REGIME || !isRangingMarket);
          
          if (canApplyFallback) {
            // Override derived direction to trend-aligned
            const originalDirection = derivedDirection;
            derivedDirection = fallbackDirection;
            derivedSource = "counter-trend-fallback";
            counterTrendFallbackApplied = true;
            counterTrendFallbackMultiplier = COUNTER_TREND_PROTECTION.FALLBACK_POSITION_MULTIPLIER;
            
            if (COUNTER_TREND_PROTECTION.LOG_FALLBACKS) {
              logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} 🔄 COUNTER_TREND_FALLBACK: ${originalDirection.toUpperCase()} → ${fallbackDirection.toUpperCase()}`);
              logger.forSymbol(symbol).info(`   → Original ${originalDirection.toUpperCase()} was counter to ${regimeTrendDirection} trend (ADX=${adx.toFixed(1)})`);
              logger.forSymbol(symbol).info(`   → Switching to trend-aligned ${fallbackDirection.toUpperCase()} with ${(counterTrendFallbackMultiplier * 100).toFixed(0)}% position`);
            }
            
            // DON'T continue - let the rest of the gates evaluate this new direction
          } else {
            // No valid fallback - reject as before
            rejectedByHardGates++;
            perSymbolGateAttribution.set(symbol, { 
              gate: 'COUNTER_TREND_PROTECTION', 
              details: blockReason 
            });
            
            if (COUNTER_TREND_PROTECTION.LOG_BLOCKS) {
              logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.GATE} 🚫 COUNTER_TREND_BLOCK: ${symbol} | ${derivedDirection.toUpperCase()} blocked`);
              logger.forSymbol(symbol).warn(`   → ADX=${adx.toFixed(1)}, regime=${masterRegime.regime}, trendDirection=${regimeTrendDirection}`);
              logger.forSymbol(symbol).warn(`   → Momentum score=${smartMomentum.score}, direction=${smartMomentum.direction}`);
              logger.forSymbol(symbol).warn(`   → Fallback not possible: fallbackAligns=${fallbackAligns}, regime=${masterRegime.regime}`);
            }
            
            await logRejectionWithAI(
              supabase, userId, symbol,
              `COUNTER_TREND_PROTECTION: ${blockReason}`,
              {
                gate: "COUNTER_TREND_PROTECTION",
                blockReasonCode: "COUNTER_TREND",
                primaryGateFailed: isCounterTrendLong ? "long_against_bearish" : "short_against_bullish",
                regimeRuleId,
                derivedDirection,
                fallbackDirection,
                fallbackAttempted: COUNTER_TREND_PROTECTION.FALLBACK_TO_TREND_ALIGNED,
                fallbackReason: !fallbackAligns ? "direction_mismatch" : "regime_ranging",
                adx: adx.toFixed(1),
                adxSlope: (fullAdxResult.adxSlope ?? 0).toFixed(2),
                regimeTrendDirection,
                momentumScore: smartMomentum.score,
                momentumDirection: smartMomentum.direction,
                masterRegime: masterRegime.regime,
                threshold: COUNTER_TREND_PROTECTION.ADX_THRESHOLD_FOR_BLOCK,
                momentumThresholds: COUNTER_TREND_PROTECTION.MOMENTUM,
                // Timeframe labels for debugging
                timeframes: {
                  adxTimeframe: '1h',
                  regimeTimeframe: '4h',
                  signalTimeframe: '15m',
                }
              },
              trendData,
              riskParams.ai_analysis_enabled !== false,
              earlyOrderFlowAnalysis
            );
            continue;
          }
        }
        
        // ============= PHASE 11: TREND EXHAUSTION PROTECTION =============
        // Expert insight: "ADX declining + weak trend strength = exhausted trend"
        // Block CONTINUATION entries when trend is running out of steam (AVAXUSDT losses at 19:20)
        // BUT ALLOW reversal/counter-trend entries - exhaustion is a SETUP for reversals
        if (TREND_EXHAUSTION_PROTECTION.ENABLED) {
          // Calculate trend strength from timeframe confidences (0-100 scale)
          // Uses 4h and 1h confidence weighted average as proxy for trend strength
          const conf4h = trendData.timeframes?.['4h']?.confidence ?? 50;
          const conf1h = trendData.timeframes?.['1h']?.confidence ?? 50;
          const trendStrength = Math.round((conf4h * 0.6 + conf1h * 0.4));  // Weighted average
          const adxSlope = fullAdxResult.adxSlope ?? 0;
          const adxDeclining = adxSlope < TREND_EXHAUSTION_PROTECTION.ADX_SLOPE_DECLINE_THRESHOLD;
          const weakTrendStrength = trendStrength < TREND_EXHAUSTION_PROTECTION.TREND_STRENGTH_THRESHOLD;
          const adxWasMeaningful = adx >= TREND_EXHAUSTION_PROTECTION.MIN_ADX_FOR_CHECK;
          
          // Get the prior trend direction to determine if entry is continuation or reversal
          const trend4h = trendData.timeframes?.['4h']?.trend ?? "neutral";
          const trend1h = trendData.timeframes?.['1h']?.trend ?? "neutral";
          const priorTrendBullish = trend4h === "bullish" || (trend4h === "neutral" && trend1h === "bullish");
          const priorTrendBearish = trend4h === "bearish" || (trend4h === "neutral" && trend1h === "bearish");
          
          // Is this a continuation entry (same direction as exhausting trend)?
          const isContinuationEntry = 
            (derivedDirection === 'long' && priorTrendBullish) ||
            (derivedDirection === 'short' && priorTrendBearish);
          
          // Is this a reversal/counter-trend entry (opposite direction)?
          const isReversalEntry = 
            (derivedDirection === 'long' && priorTrendBearish) ||
            (derivedDirection === 'short' && priorTrendBullish);
          
          if (adxDeclining && weakTrendStrength && adxWasMeaningful) {
            // KEY INSIGHT: Only block CONTINUATION entries
            // Reversal entries should be ALLOWED when trend is exhausted (that's the setup!)
            if (isContinuationEntry) {
              if (TREND_EXHAUSTION_PROTECTION.REDUCE_POSITION_INSTEAD_OF_BLOCK) {
                // Reduce position instead of blocking
                const exhaustionMultiplier = TREND_EXHAUSTION_PROTECTION.EXHAUSTION_POSITION_MULTIPLIER;
                logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.GATE} ⚠️ TREND_EXHAUSTION: ADX=${adx.toFixed(1)} declining (slope=${adxSlope.toFixed(2)}), trendStrength=${trendStrength}% - position reduced to ${(exhaustionMultiplier * 100).toFixed(0)}%`);
              } else {
                // Block continuation entry entirely
                rejectedByHardGates++;
                const blockMsg = `ADX=${adx.toFixed(1)} declining (slope=${adxSlope.toFixed(2)}) with weak trend strength (${trendStrength}%)`;
                perSymbolGateAttribution.set(symbol, { gate: 'TREND_EXHAUSTION_PROTECTION', details: blockMsg });
                
                if (TREND_EXHAUSTION_PROTECTION.LOG_BLOCKS) {
                  logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.GATE} 🚫 TREND_EXHAUSTION_GATE: ${blockMsg}`);
                  logger.forSymbol(symbol).warn(`   → Trend is exhausted - blocking CONTINUATION ${derivedDirection} entry (prior trend: ${trend4h}/${trend1h})`);
                }
                
                await logRejectionWithAI(
                  supabase, userId, symbol,
                  `TREND_EXHAUSTION_PROTECTION: ${blockMsg}`,
                  {
                    gate: "TREND_EXHAUSTION_PROTECTION",
                    derivedDirection,
                    direction: derivedDirection,
                    adx: adx.toFixed(1),
                    adxSlope: adxSlope.toFixed(2),
                    trendStrength,
                    priorTrend4h: trend4h,
                    priorTrend1h: trend1h,
                    isContinuationEntry: true,
                    thresholds: {
                      adxSlopeDeclineThreshold: TREND_EXHAUSTION_PROTECTION.ADX_SLOPE_DECLINE_THRESHOLD,
                      trendStrengthThreshold: TREND_EXHAUSTION_PROTECTION.TREND_STRENGTH_THRESHOLD,
                      minAdxForCheck: TREND_EXHAUSTION_PROTECTION.MIN_ADX_FOR_CHECK,
                    }
                  },
                  trendData,
                  riskParams.ai_analysis_enabled !== false,
                  earlyOrderFlowAnalysis
                );
                continue;
              }
            } else if (isReversalEntry) {
              // ALLOW reversal entries but log for transparency
              logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} ✅ TREND_EXHAUSTION_BYPASS: Allowing REVERSAL ${derivedDirection} entry (prior trend exhausted: ${trend4h}/${trend1h})`);
              logger.forSymbol(symbol).info(`   → ADX=${adx.toFixed(1)} declining (slope=${adxSlope.toFixed(2)}), trendStrength=${trendStrength}% - reversal setup`);
            }
            // If neither continuation nor reversal (neutral prior trend), allow with reduced position
          }
        }
        
        // ============= CRITICAL: MOMENTUM SLOPE GATE (PRIORITY 1) =============
        // ADX must NEVER override this - accelerating opposing momentum is a hard block
        // This gate prevents the BNBUSDT bug where ADX=57.7 allowed SHORT into bullish momentum
        if (MOMENTUM_SLOPE_GATE.ENABLED) {
          const momentumScore = smartMomentum.score;
          const momentumSlope = trendData?.momentum?.macdSlope ?? (fullAdxResult.adxSlope ?? 0);
          
          // Check for accelerating opposing momentum
          const isOpposingMomentum = 
            (derivedDirection === 'long' && momentumScore < -MOMENTUM_SLOPE_GATE.MIN_OPPOSING_SCORE_FOR_SLOPE_CHECK) ||
            (derivedDirection === 'short' && momentumScore > MOMENTUM_SLOPE_GATE.MIN_OPPOSING_SCORE_FOR_SLOPE_CHECK);
          
          if (isOpposingMomentum) {
            const isAccelerating = 
              (derivedDirection === 'short' && momentumSlope > MOMENTUM_SLOPE_GATE.BLOCK_SHORT_IF_SLOPE_ABOVE) ||
              (derivedDirection === 'long' && momentumSlope < MOMENTUM_SLOPE_GATE.BLOCK_LONG_IF_SLOPE_BELOW);
            
            if (isAccelerating) {
              // HARD BLOCK - NO ADX EXCEPTION (architectural fix)
              rejectedByHardGates++;
              const blockReason = `MOMENTUM_SLOPE_GATE: ${derivedDirection.toUpperCase()} blocked - opposing momentum (${momentumScore.toFixed(0)}) is ACCELERATING (slope=${momentumSlope.toFixed(3)})`;
              perSymbolGateAttribution.set(symbol, { gate: 'MOMENTUM_SLOPE_GATE', details: blockReason });
              
              logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.GATE} 🚫 ${blockReason}`);
              logger.forSymbol(symbol).warn(`   → ADX=${adx.toFixed(1)} does NOT override accelerating opposing momentum`);
              
              await logRejectionWithAI(supabase, userId, symbol, blockReason, {
                gate: "MOMENTUM_SLOPE_GATE",
                derivedDirection,
                momentumScore,
                momentumSlope: momentumSlope.toFixed(3),
                adx: adx.toFixed(1),
                adxDoesNotOverride: true,
                architecture: "Priority 1 gate - no ADX exception",
                thresholds: {
                  minOpposingScore: MOMENTUM_SLOPE_GATE.MIN_OPPOSING_SCORE_FOR_SLOPE_CHECK,
                  blockShortIfSlopeAbove: MOMENTUM_SLOPE_GATE.BLOCK_SHORT_IF_SLOPE_ABOVE,
                  blockLongIfSlopeBelow: MOMENTUM_SLOPE_GATE.BLOCK_LONG_IF_SLOPE_BELOW,
                }
              }, trendData, riskParams.ai_analysis_enabled !== false, earlyOrderFlowAnalysis);
              continue;
            }
          }
        }
        
        // ============= CRITICAL: 15M SPIKE PROTECTION GATE (PRIORITY 2) =============
        // Prevents entering at momentum climax candles (15m StochRSI extremes)
        // At K=98.3 with bullish momentum - this is a spike TOP, not early exhaustion
        if (LTF_SPIKE_PROTECTION_GATE.ENABLED) {
          const stochRsiK15m = extractStochRsiK(trendData, '15m');
          const adxSlope = fullAdxResult.adxSlope ?? 0;
          const momentumScore = smartMomentum.score;
          
          // Check for spike condition
          const is15mBullishSpike = stochRsiK15m > LTF_SPIKE_PROTECTION_GATE.BLOCK_SHORT_IF_15M_K_ABOVE;
          const is15mBearishSpike = stochRsiK15m < LTF_SPIKE_PROTECTION_GATE.BLOCK_LONG_IF_15M_K_BELOW;
          
          // Check if momentum aligns with spike (not a valid reversal setup)
          const momentumAlignsWithBullishSpike = momentumScore > 0;
          const momentumAlignsWithBearishSpike = momentumScore < 0;
          
          // Check if ADX is still rising (spike hasn't exhausted)
          const adxStillRising = adxSlope >= LTF_SPIKE_PROTECTION_GATE.MIN_ADX_SLOPE_FOR_BLOCK;
          
          // Block SHORT at bullish spike
          if (derivedDirection === 'short' && is15mBullishSpike) {
            const shouldBlock = (!LTF_SPIKE_PROTECTION_GATE.REQUIRE_MOMENTUM_ALIGNED_WITH_SPIKE || momentumAlignsWithBullishSpike) &&
                                (!LTF_SPIKE_PROTECTION_GATE.REQUIRE_ADX_SLOPE_RISING || adxStillRising);
            
            if (shouldBlock) {
              rejectedByHardGates++;
              const blockReason = `LTF_SPIKE_PROTECTION: SHORT blocked - 15m StochRSI K=${stochRsiK15m.toFixed(0)} > ${LTF_SPIKE_PROTECTION_GATE.BLOCK_SHORT_IF_15M_K_ABOVE} (bullish momentum spike)`;
              perSymbolGateAttribution.set(symbol, { gate: 'LTF_SPIKE_PROTECTION', details: blockReason });
              
              logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.GATE} 🚫 ${blockReason}`);
              logger.forSymbol(symbol).warn(`   → Momentum=${momentumScore.toFixed(0)} aligns with spike, ADX slope=${adxSlope.toFixed(2)} rising`);
              
              await logRejectionWithAI(supabase, userId, symbol, blockReason, {
                gate: "LTF_SPIKE_PROTECTION",
                derivedDirection,
                stochRsiK15m: stochRsiK15m.toFixed(1),
                momentumScore,
                adxSlope: adxSlope.toFixed(2),
                adx: adx.toFixed(1),
                architecture: "Priority 2 gate - no ADX exception",
              }, trendData, riskParams.ai_analysis_enabled !== false, earlyOrderFlowAnalysis);
              continue;
            }
          }
          
          // Block LONG at bearish spike (symmetric)
          if (derivedDirection === 'long' && is15mBearishSpike) {
            const shouldBlock = (!LTF_SPIKE_PROTECTION_GATE.REQUIRE_MOMENTUM_ALIGNED_WITH_SPIKE || momentumAlignsWithBearishSpike) &&
                                (!LTF_SPIKE_PROTECTION_GATE.REQUIRE_ADX_SLOPE_RISING || adxStillRising);
            
            if (shouldBlock) {
              rejectedByHardGates++;
              const blockReason = `LTF_SPIKE_PROTECTION: LONG blocked - 15m StochRSI K=${stochRsiK15m.toFixed(0)} < ${LTF_SPIKE_PROTECTION_GATE.BLOCK_LONG_IF_15M_K_BELOW} (bearish momentum spike)`;
              perSymbolGateAttribution.set(symbol, { gate: 'LTF_SPIKE_PROTECTION', details: blockReason });
              
              logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.GATE} 🚫 ${blockReason}`);
              logger.forSymbol(symbol).warn(`   → Momentum=${momentumScore.toFixed(0)} aligns with spike, ADX slope=${adxSlope.toFixed(2)} rising`);
              
              await logRejectionWithAI(supabase, userId, symbol, blockReason, {
                gate: "LTF_SPIKE_PROTECTION",
                derivedDirection,
                stochRsiK15m: stochRsiK15m.toFixed(1),
                momentumScore,
                adxSlope: adxSlope.toFixed(2),
                adx: adx.toFixed(1),
                architecture: "Priority 2 gate - no ADX exception",
              }, trendData, riskParams.ai_analysis_enabled !== false, earlyOrderFlowAnalysis);
              continue;
            }
          }
        }
        
        // ============= NEW: ADX SLOPE GRADUATED GATE =============
        // Data-driven insight: BE trades had declining ADX slope but KEY differentiator is ADX VALUE
        // ADX >= 55 with declining slope still profitable; ADX < 50 with declining slope = BE cluster
        let adxSlopeGraduatedMultiplier = 1.0;
        let adxSlopeGateApplied = false;
        
        if (ADX_SLOPE_GRADUATED_GATE.ENABLED) {
          const adxSlope = fullAdxResult.adxSlope ?? 0;
          const directionSpecificThreshold = derivedDirection === 'short' 
            ? ADX_SLOPE_GRADUATED_GATE.SHORT_HARD_BLOCK_SLOPE 
            : ADX_SLOPE_GRADUATED_GATE.LONG_HARD_BLOCK_SLOPE;
          
          // Check for severe decline
          if (adxSlope < directionSpecificThreshold) {
            // Exception: High ADX (>= 55) can still work with declining slope
            // BUT: Now also requires LTF alignment (Improvement #4)
            if (adx >= ADX_SLOPE_GRADUATED_GATE.HIGH_ADX_EXCEPTION_THRESHOLD) {
              // IMPROVEMENT #4: Even at ADX >= 55, check LTF alignment
              const contReq = ADX_SLOPE_GRADUATED_GATE.CONTINUATION_REQUIREMENTS;
              const tf1hTrend = trendData.timeframes?.['1h']?.trend || 'neutral';
              const tf30mTrend = trendData.timeframes?.['30m']?.trend || 'neutral';
              const ltfAligned = (derivedDirection === 'long' && (tf1hTrend === 'bullish' || tf30mTrend === 'bullish')) ||
                                 (derivedDirection === 'short' && (tf1hTrend === 'bearish' || tf30mTrend === 'bearish'));
              
              if (contReq?.ENABLED && contReq.REQUIRE_LTF_ALIGNMENT && !ltfAligned) {
                // High ADX but NO LTF alignment + declining slope = late-stage exhaustion
                // This is the -2.3% loss pattern: ADX 55 + slope -0.42 + 1h neutral + 30m neutral
                rejectedByHardGates++;
                const blockReason = `ADX_SLOPE_CONTINUATION_FAIL: ${derivedDirection.toUpperCase()} blocked - ADX=${adx.toFixed(1)} (high) but slope=${adxSlope.toFixed(2)} (declining) AND no LTF alignment (1h=${tf1hTrend}, 30m=${tf30mTrend}) → late-stage trend exhaustion`;
                perSymbolGateAttribution.set(symbol, { gate: 'ADX_SLOPE_GRADUATED', details: blockReason });
                
                logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.GATE} 🚫 ${blockReason}`);
                
                await logRejectionWithAI(supabase, userId, symbol, blockReason, {
                  gate: "ADX_SLOPE_GRADUATED",
                  subGate: "CONTINUATION_FAIL",
                  derivedDirection,
                  adx: adx.toFixed(1),
                  adxSlope: adxSlope.toFixed(2),
                  tf1hTrend,
                  tf30mTrend,
                  ltfAligned: false,
                  wouldPassWith: `ADX slope >= 0 OR 1h/30m aligned with ${derivedDirection}`,
                }, trendData, riskParams.ai_analysis_enabled !== false, earlyOrderFlowAnalysis);
                continue;
              }
              
              adxSlopeGraduatedMultiplier = ADX_SLOPE_GRADUATED_GATE.HIGH_ADX_DECLINE_MULTIPLIER;
              adxSlopeGateApplied = true;
              
              if (ADX_SLOPE_GRADUATED_GATE.LOG_GATE_CHECKS) {
                logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} ⚠️ ADX_SLOPE_GRADUATED: Slope=${adxSlope.toFixed(2)} severely declining but ADX=${adx.toFixed(1)} >= ${ADX_SLOPE_GRADUATED_GATE.HIGH_ADX_EXCEPTION_THRESHOLD} + LTF aligned (1h=${tf1hTrend}, 30m=${tf30mTrend}) - allowing with ${(adxSlopeGraduatedMultiplier * 100).toFixed(0)}% position`);
              }
            }
            // Exception 2: Bollinger Breakdown Override - price outside bands with StochRSI runway
            else if (ADX_SLOPE_GRADUATED_GATE.BOLLINGER_BREAKDOWN_OVERRIDE?.ENABLED) {
              const bbOverride = ADX_SLOPE_GRADUATED_GATE.BOLLINGER_BREAKDOWN_OVERRIDE;
              const bb4h = trendData?.bollingerBands?.["4h"];
              const stochRsi4h = trendData?.stochasticRsi?.["4h"];
              const percentB = bb4h?.percentB ?? 50;
              const stochRsiK = stochRsi4h?.k ?? 50;
              
              let bollingerBreakdownAllowed = false;
              let breakdownReason = '';
              
              // Check if ADX meets minimum for override
              if (adx >= bbOverride.MIN_ADX_FOR_OVERRIDE) {
                if (derivedDirection === 'short') {
                  // SHORT breakdown: price below lower band (%B <= 20) AND StochRSI has runway (15 < K < 85)
                  const isBelowLowerBand = percentB <= bbOverride.SHORT_MAX_PERCENT_B;
                  const hasRunway = stochRsiK > bbOverride.SHORT_MIN_STOCHRSI_K && stochRsiK < bbOverride.SHORT_MAX_STOCHRSI_K;
                  
                  if (isBelowLowerBand && hasRunway) {
                    bollingerBreakdownAllowed = true;
                    breakdownReason = `SHORT breakdown: %B=${percentB.toFixed(1)}% (below lower band), StochRSI K=${stochRsiK.toFixed(1)} (has runway)`;
                  }
                } else {
                  // LONG breakout: price above upper band (%B >= 80) AND StochRSI has runway (15 < K < 85)
                  const isAboveUpperBand = percentB >= bbOverride.LONG_MIN_PERCENT_B;
                  const hasRunway = stochRsiK > bbOverride.LONG_MIN_STOCHRSI_K && stochRsiK < bbOverride.LONG_MAX_STOCHRSI_K;
                  
                  if (isAboveUpperBand && hasRunway) {
                    bollingerBreakdownAllowed = true;
                    breakdownReason = `LONG breakout: %B=${percentB.toFixed(1)}% (above upper band), StochRSI K=${stochRsiK.toFixed(1)} (has runway)`;
                  }
                }
              }
              
              if (bollingerBreakdownAllowed) {
                adxSlopeGraduatedMultiplier = bbOverride.POSITION_MULTIPLIER;
                adxSlopeGateApplied = true;
                
                if (ADX_SLOPE_GRADUATED_GATE.LOG_GATE_CHECKS) {
                  logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} ✅ ADX_SLOPE_GRADUATED BOLLINGER OVERRIDE: Slope=${adxSlope.toFixed(2)} declining but ${breakdownReason} - allowing with ${(adxSlopeGraduatedMultiplier * 100).toFixed(0)}% position`);
                }
              } else {
                // No override applies - hard block
                rejectedByHardGates++;
                const blockReason = `ADX_SLOPE_GRADUATED: ${derivedDirection.toUpperCase()} blocked - ADX slope=${adxSlope.toFixed(2)} severely declining AND ADX=${adx.toFixed(1)} < ${ADX_SLOPE_GRADUATED_GATE.HIGH_ADX_EXCEPTION_THRESHOLD} (BE zone), Bollinger override not met (%B=${percentB.toFixed(1)}, StochRSI K=${stochRsiK.toFixed(1)})`;
                perSymbolGateAttribution.set(symbol, { gate: 'ADX_SLOPE_GRADUATED', details: blockReason });
                
                logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.GATE} 🚫 ${blockReason}`);
                
                await logRejectionWithAI(supabase, userId, symbol, blockReason, {
                  gate: "ADX_SLOPE_GRADUATED",
                  derivedDirection,
                  adx: adx.toFixed(1),
                  adxSlope: adxSlope.toFixed(2),
                  percentB: percentB.toFixed(1),
                  stochRsiK4h: stochRsiK.toFixed(1),
                  bollingerBreakdownChecked: true,
                  thresholds: {
                    hardBlockSlope: directionSpecificThreshold,
                    highAdxException: ADX_SLOPE_GRADUATED_GATE.HIGH_ADX_EXCEPTION_THRESHOLD,
                    bollingerOverride: bbOverride,
                  },
                  analysis: "BE trades cluster when ADX < 50 with declining slope, Bollinger breakdown override not satisfied"
                }, trendData, riskParams.ai_analysis_enabled !== false, earlyOrderFlowAnalysis);
                continue;
              }
            } else {
              // Hard block for low-ADX with severe decline (no override configured)
              rejectedByHardGates++;
              const blockReason = `ADX_SLOPE_GRADUATED: ${derivedDirection.toUpperCase()} blocked - ADX slope=${adxSlope.toFixed(2)} severely declining AND ADX=${adx.toFixed(1)} < ${ADX_SLOPE_GRADUATED_GATE.HIGH_ADX_EXCEPTION_THRESHOLD} (BE zone)`;
              perSymbolGateAttribution.set(symbol, { gate: 'ADX_SLOPE_GRADUATED', details: blockReason });
              
              logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.GATE} 🚫 ${blockReason}`);
              
              await logRejectionWithAI(supabase, userId, symbol, blockReason, {
                gate: "ADX_SLOPE_GRADUATED",
                derivedDirection,
                adx: adx.toFixed(1),
                adxSlope: adxSlope.toFixed(2),
                thresholds: {
                  hardBlockSlope: directionSpecificThreshold,
                  highAdxException: ADX_SLOPE_GRADUATED_GATE.HIGH_ADX_EXCEPTION_THRESHOLD,
                },
                analysis: "BE trades cluster when ADX < 50 with declining slope"
              }, trendData, riskParams.ai_analysis_enabled !== false, earlyOrderFlowAnalysis);
              continue;
            }
          } else if (adxSlope < ADX_SLOPE_GRADUATED_GATE.REDUCE_POSITION_SLOPE_THRESHOLD && adxSlope >= directionSpecificThreshold) {
            // Moderate decline: reduce position unless high ADX
            if (adx < ADX_SLOPE_GRADUATED_GATE.HIGH_ADX_EXCEPTION_THRESHOLD) {
              // IMPROVEMENT #4: For ADX 35+ with moderate decline, also check LTF alignment
              const contReq = ADX_SLOPE_GRADUATED_GATE.CONTINUATION_REQUIREMENTS;
              if (contReq?.ENABLED && adx >= contReq.MIN_ADX && adxSlope < contReq.MIN_ADX_SLOPE && contReq.BLOCK_DECLINING_NO_LTF) {
                const tf1hTrend = trendData.timeframes?.['1h']?.trend || 'neutral';
                const tf30mTrend = trendData.timeframes?.['30m']?.trend || 'neutral';
                const ltfAligned = (derivedDirection === 'long' && (tf1hTrend === 'bullish' || tf30mTrend === 'bullish')) ||
                                   (derivedDirection === 'short' && (tf1hTrend === 'bearish' || tf30mTrend === 'bearish'));
                
                if (!ltfAligned) {
                  // ADX 35+ with declining slope AND no LTF = trend exhaustion, not continuation
                  rejectedByHardGates++;
                  const blockReason = `ADX_SLOPE_CONTINUATION_FAIL: ${derivedDirection.toUpperCase()} blocked - ADX=${adx.toFixed(1)} >= ${contReq.MIN_ADX} but slope=${adxSlope.toFixed(2)} < 0 AND no LTF alignment (1h=${tf1hTrend}, 30m=${tf30mTrend}) → trend decaying without LTF follow-through`;
                  perSymbolGateAttribution.set(symbol, { gate: 'ADX_SLOPE_GRADUATED', details: blockReason });
                  
                  logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.GATE} 🚫 ${blockReason}`);
                  
                  await logRejectionWithAI(supabase, userId, symbol, blockReason, {
                    gate: "ADX_SLOPE_GRADUATED",
                    subGate: "CONTINUATION_FAIL_MODERATE",
                    derivedDirection,
                    adx: adx.toFixed(1),
                    adxSlope: adxSlope.toFixed(2),
                    tf1hTrend,
                    tf30mTrend,
                    ltfAligned: false,
                    wouldPassWith: `ADX slope >= 0 OR 1h/30m aligned with ${derivedDirection}`,
                  }, trendData, riskParams.ai_analysis_enabled !== false, earlyOrderFlowAnalysis);
                  continue;
                }
                
                // LTF aligned but declining slope → marginal entry with reduced size
                adxSlopeGraduatedMultiplier = contReq.MARGINAL_LTF_MULTIPLIER;
                adxSlopeGateApplied = true;
                
                if (ADX_SLOPE_GRADUATED_GATE.LOG_GATE_CHECKS) {
                  const tf1hTrendLog = trendData.timeframes?.['1h']?.trend || 'neutral';
                  const tf30mTrendLog = trendData.timeframes?.['30m']?.trend || 'neutral';
                  logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} ⚠️ ADX_SLOPE_CONTINUATION: ADX=${adx.toFixed(1)} >= ${contReq.MIN_ADX}, slope=${adxSlope.toFixed(2)} declining BUT LTF aligned (1h=${tf1hTrendLog}, 30m=${tf30mTrendLog}) - allowing with ${(adxSlopeGraduatedMultiplier * 100).toFixed(0)}%`);
                }
              } else {
                adxSlopeGraduatedMultiplier = ADX_SLOPE_GRADUATED_GATE.MODERATE_DECLINE_MULTIPLIER;
                adxSlopeGateApplied = true;
                
                if (ADX_SLOPE_GRADUATED_GATE.LOG_GATE_CHECKS) {
                  logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} ⚠️ ADX_SLOPE_GRADUATED: Slope=${adxSlope.toFixed(2)} moderately declining, ADX=${adx.toFixed(1)} - reducing to ${(adxSlopeGraduatedMultiplier * 100).toFixed(0)}%`);
                }
              }
            }
          } else if (derivedDirection === 'long' && ADX_SLOPE_GRADUATED_GATE.LONG_POSITIVE_SLOPE_TIERS?.ENABLED) {
            // ===== NEW: GRADUATED POSITIVE SLOPE TIERING FOR LONGS =====
            // Allows earlier continuation entries during stabilizing phases
            const positiveTiers = ADX_SLOPE_GRADUATED_GATE.LONG_POSITIVE_SLOPE_TIERS;
            
            if (adxSlope >= positiveTiers.FULL_SIZE_MIN_SLOPE) {
              // Tier 1: Trend strengthening - full size
              adxSlopeGraduatedMultiplier = positiveTiers.FULL_SIZE_MULTIPLIER;
              // Don't mark as "applied" for full size - no reduction needed
              
              if (ADX_SLOPE_GRADUATED_GATE.LOG_GATE_CHECKS) {
                logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} ✅ ADX_SLOPE_GRADUATED LONG: Slope=${adxSlope.toFixed(2)} >= ${positiveTiers.FULL_SIZE_MIN_SLOPE} (trend strengthening) - full ${(adxSlopeGraduatedMultiplier * 100).toFixed(0)}% position`);
              }
            } else if (adxSlope >= positiveTiers.STABILIZING_MIN_SLOPE) {
              // Tier 2: Stabilizing/flat slope (0.0 to +0.3) - reduced size for early continuation
              adxSlopeGraduatedMultiplier = positiveTiers.STABILIZING_MULTIPLIER;
              adxSlopeGateApplied = true;
              
              if (ADX_SLOPE_GRADUATED_GATE.LOG_GATE_CHECKS) {
                logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} ⚠️ ADX_SLOPE_GRADUATED LONG: Slope=${adxSlope.toFixed(2)} in stabilizing range [${positiveTiers.STABILIZING_MIN_SLOPE}, ${positiveTiers.FULL_SIZE_MIN_SLOPE}) - reducing to ${(adxSlopeGraduatedMultiplier * 100).toFixed(0)}% (early continuation)`);
              }
            }
            // Note: slopes < 0.0 are handled by the decline logic above
          }
        }
        
        // ============= NEW: HIGH ADX 1H CONFIRMATION GATE =============
        // Key finding: 10/12 BE trades with ADX >= 55 had 1h = neutral
        // Profitable high-ADX trades had 1h confirmation
        let highAdx1hConfirmationMultiplier = 1.0;
        let highAdx1hGateApplied = false;
        
        if (HIGH_ADX_1H_CONFIRMATION_GATE.ENABLED && adx >= HIGH_ADX_1H_CONFIRMATION_GATE.MIN_ADX_FOR_CHECK) {
          const tf1hDir = trendData.timeframes?.['1h']?.direction?.toLowerCase() || 'neutral';
          const tf30mDir = trendData.timeframes?.['30m']?.direction?.toLowerCase() || 'neutral';
          const is1hNeutral = tf1hDir === 'neutral';
          const expectedDir = derivedDirection === 'long' ? 'bullish' : 'bearish';
          const is30mAligned = tf30mDir === expectedDir;
          
          if (is1hNeutral && HIGH_ADX_1H_CONFIRMATION_GATE.REQUIRE_1H_NON_NEUTRAL) {
            // 1h is neutral at high ADX - this is the BE pattern
            if (HIGH_ADX_1H_CONFIRMATION_GATE.ALLOW_30M_EXCEPTION && is30mAligned) {
              // 30m aligned can partially compensate
              highAdx1hConfirmationMultiplier = HIGH_ADX_1H_CONFIRMATION_GATE.EXCEPTION_30M_MULTIPLIER;
              highAdx1hGateApplied = true;
              
              if (HIGH_ADX_1H_CONFIRMATION_GATE.LOG_GATE_CHECKS) {
                logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} ⚠️ HIGH_ADX_1H: ADX=${adx.toFixed(1)} but 1h=${tf1hDir} (neutral) - 30m=${tf30mDir} aligned, allowing ${(highAdx1hConfirmationMultiplier * 100).toFixed(0)}%`);
              }
            } else {
              // No LTF confirmation at high ADX - significant reduction
              highAdx1hConfirmationMultiplier = HIGH_ADX_1H_CONFIRMATION_GATE.NEUTRAL_1H_POSITION_MULTIPLIER;
              highAdx1hGateApplied = true;
              
              if (HIGH_ADX_1H_CONFIRMATION_GATE.LOG_GATE_CHECKS) {
                logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.GATE} ⚠️ HIGH_ADX_1H: ADX=${adx.toFixed(1)} (high) but 1h=${tf1hDir}, 30m=${tf30mDir} (no LTF confirmation) - BE pattern detected, reducing to ${(highAdx1hConfirmationMultiplier * 100).toFixed(0)}%`);
              }
            }
          }
        }
        
        // ============= NEW: STOCHRSI RUNWAY GATE =============
        // Data: 75% of BE shorts entered with StochRSI < 40 (limited downside runway)
        // Apply only when ADX slope declining OR both LTF neutral
        let stochRsiRunwayMultiplier = 1.0;
        let stochRsiRunwayGateApplied = false;
        
        if (STOCHRSI_RUNWAY_GATE.ENABLED) {
          const stochRsiK4h = extractStochRsiK(trendData, '4h');
          const adxSlope = fullAdxResult.adxSlope ?? 0;
          const tf1hDir = trendData.timeframes?.['1h']?.direction?.toLowerCase() || 'neutral';
          const tf30mDir = trendData.timeframes?.['30m']?.direction?.toLowerCase() || 'neutral';
          const bothLtfNeutral = tf1hDir === 'neutral' && tf30mDir === 'neutral';
          
          // Conditional application: only when ADX slope declining OR both LTF neutral
          const shouldApplyRunwayGate = STOCHRSI_RUNWAY_GATE.REQUIRE_DECLINING_ADX_OR_LTF_NEUTRAL
            ? (adxSlope < STOCHRSI_RUNWAY_GATE.ADX_SLOPE_DECLINING_THRESHOLD || bothLtfNeutral)
            : true;
          
          if (shouldApplyRunwayGate) {
            // Check runway for direction
            const limitedRunway = 
              (derivedDirection === 'short' && stochRsiK4h < STOCHRSI_RUNWAY_GATE.SHORT_MIN_STOCHRSI_FOR_RUNWAY) ||
              (derivedDirection === 'long' && stochRsiK4h > STOCHRSI_RUNWAY_GATE.LONG_MAX_STOCHRSI_FOR_RUNWAY);
            
            if (limitedRunway) {
              // Exception: Very high ADX can override
              if (adx >= STOCHRSI_RUNWAY_GATE.HIGH_ADX_EXCEPTION_THRESHOLD) {
                if (STOCHRSI_RUNWAY_GATE.LOG_GATE_CHECKS) {
                  logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} ✓ STOCHRSI_RUNWAY: Limited runway (K=${stochRsiK4h.toFixed(0)}) but ADX=${adx.toFixed(1)} >= ${STOCHRSI_RUNWAY_GATE.HIGH_ADX_EXCEPTION_THRESHOLD} - exception applied`);
                }
              } else {
                stochRsiRunwayMultiplier = STOCHRSI_RUNWAY_GATE.LIMITED_RUNWAY_MULTIPLIER;
                stochRsiRunwayGateApplied = true;
                
                const reason = derivedDirection === 'short' 
                  ? `StochRSI K=${stochRsiK4h.toFixed(0)} < ${STOCHRSI_RUNWAY_GATE.SHORT_MIN_STOCHRSI_FOR_RUNWAY} (limited downside runway)`
                  : `StochRSI K=${stochRsiK4h.toFixed(0)} > ${STOCHRSI_RUNWAY_GATE.LONG_MAX_STOCHRSI_FOR_RUNWAY} (limited upside runway)`;
                
                if (STOCHRSI_RUNWAY_GATE.LOG_GATE_CHECKS) {
                  logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.GATE} ⚠️ STOCHRSI_RUNWAY: ${reason}, ADX slope=${adxSlope.toFixed(2)}, LTF neutral=${bothLtfNeutral} - reducing to ${(stochRsiRunwayMultiplier * 100).toFixed(0)}%`);
                }
              }
            }
          }
        }
        
        // ============= NEW: MOVE EXHAUSTION FILTER =============
        // Prevents late entries when price has already moved significantly from swing points
        // Example: AVAX dropped 10%+ from swing high - too late to SHORT
        let moveExhaustionPositionMultiplier = 1.0;
        
        // Zone analytics tracking
        type MoveZone = 'FRESH' | 'SOFT' | 'HARD' | 'EXCEPTION' | 'RELAXED_SOFT' | 'RELAXED_HARD' | 'MEAN_REVERSION';
        let moveZone: MoveZone = 'FRESH';
        let moveZoneDetails: {
          zone: MoveZone;
          distancePercent: number;
          direction: 'short' | 'long' | null;
          stochRsiK: number;
          adx: number;
          adxSlope: number;
          outcome: 'ALLOWED' | 'REDUCED' | 'BLOCKED' | 'EXCEPTION_ALLOWED' | 'MEAN_REVERSION_ALLOWED';
          positionMultiplier: number;
          overrideReason?: string;
          relaxationApplied?: boolean;
          relaxationCondition?: string;
          // Mean reversion specific fields
          meanReversionAllowed?: boolean;
          meanReversionScore?: number;
          meanReversionBlockReason?: string;
        } | null = null;
        
        if (MOVE_EXHAUSTION_FILTER_PARAMS.ENABLED) {
          const priceDistance = trendData.priceDistanceFromSwing;
          // CENTRALIZED: Use shared extractor for StochRSI K
          const stochRsiK4h = extractStochRsiK(trendData, '4h');
          const adxSlope = fullAdxResult.adxSlope ?? 0;
          
          let moveExhaustionBlocked = false;
          let moveExhaustionReason = '';
          let moveExhaustionSoftGate = false;
          
          // ===== STRONG TREND THRESHOLD RELAXATION =====
          // Check if we should use relaxed thresholds (5%→8% for strong trends)
          const relaxation = MOVE_EXHAUSTION_FILTER_PARAMS.STRONG_TREND_RELAXATION;
          let useRelaxedThresholds = false;
          let relaxationCondition = '';
          
          // Get Bollinger data for relaxation check
          const bb4h = trendData?.bollingerBands?.["4h"];
          const percentB4h = bb4h?.percentB ?? 50;
          const bbSqueeze = bb4h?.squeeze ?? false;
          
          if (relaxation?.ENABLED) {
            // Check if ADX slope is too negative (trend exhausting)
            const slopeBlocksRelaxation = relaxation.BLOCK_IF_ADX_SLOPE_DECLINING && 
              adxSlope < relaxation.ADX_SLOPE_DECLINE_THRESHOLD;
            
            if (!slopeBlocksRelaxation) {
              // Check relaxation conditions
              const adxCondition = adx >= relaxation.MIN_ADX_FOR_RELAXATION;
              const squeezeCondition = relaxation.BB_SQUEEZE_RELAXATION && bbSqueeze;
              
              // Bollinger breakdown conditions (direction-aware)
              let breakdownCondition = false;
              if (relaxation.BB_BREAKDOWN_RELAXATION) {
                if (derivedDirection === 'short') {
                  breakdownCondition = percentB4h <= relaxation.BB_BREAKDOWN_PERCENT_B_SHORT;
                } else if (derivedDirection === 'long') {
                  breakdownCondition = percentB4h >= relaxation.BB_BREAKDOWN_PERCENT_B_LONG;
                }
              }
              
              // StochRSI runway check for relaxation
              let hasStochRsiRunway = true;
              if (relaxation.REQUIRE_STOCHRSI_RUNWAY) {
                if (derivedDirection === 'short') {
                  hasStochRsiRunway = stochRsiK4h >= relaxation.STOCHRSI_RUNWAY_MIN_K_FOR_SHORT;
                } else if (derivedDirection === 'long') {
                  hasStochRsiRunway = stochRsiK4h <= relaxation.STOCHRSI_RUNWAY_MAX_K_FOR_LONG;
                }
              }
              
              // Apply relaxation if any condition is met AND runway exists
              if (hasStochRsiRunway && (adxCondition || squeezeCondition || breakdownCondition)) {
                useRelaxedThresholds = true;
                const conditions = [];
                if (adxCondition) conditions.push(`ADX=${adx.toFixed(1)}>=${relaxation.MIN_ADX_FOR_RELAXATION}`);
                if (squeezeCondition) conditions.push('BB_SQUEEZE');
                if (breakdownCondition) conditions.push(`%B=${percentB4h.toFixed(1)}%`);
                relaxationCondition = conditions.join(' + ');
                
                logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} 📈 MOVE_EXHAUSTION relaxation activated: ${relaxationCondition} | Thresholds: soft=${relaxation.RELAXED_SOFT_THRESHOLD_PERCENT}%, hard=${relaxation.RELAXED_HARD_THRESHOLD_PERCENT}%`);
              }
            } else {
              logger.forSymbol(symbol).debug(`${LOG_CATEGORIES.GATE} MOVE_EXHAUSTION relaxation blocked: ADX slope=${adxSlope.toFixed(2)} < ${relaxation.ADX_SLOPE_DECLINE_THRESHOLD} (trend exhausting)`);
            }
          }
          
          // Determine effective thresholds based on relaxation
          const effectiveSoftThreshold = useRelaxedThresholds 
            ? relaxation.RELAXED_SOFT_THRESHOLD_PERCENT 
            : MOVE_EXHAUSTION_FILTER_PARAMS.SOFT_THRESHOLD_PERCENT;
          const effectiveHardThreshold = useRelaxedThresholds 
            ? relaxation.RELAXED_HARD_THRESHOLD_PERCENT 
            : MOVE_EXHAUSTION_FILTER_PARAMS.HARD_THRESHOLD_PERCENT;
          
          if (derivedDirection === 'short' && priceDistance) {
            const distanceFromHigh = priceDistance.distanceFromHighPercent ?? 0;
            
            // ===== HARD BLOCK: Price dropped too far already =====
            if (distanceFromHigh >= effectiveHardThreshold) {
              moveZone = useRelaxedThresholds ? 'RELAXED_HARD' : 'HARD';
              // Check for strong trend exception (continuation)
              const strongTrendException = MOVE_EXHAUSTION_FILTER_PARAMS.ALLOW_STRONG_TREND_EXCEPTION &&
                adx >= MOVE_EXHAUSTION_FILTER_PARAMS.EXCEPTION_MIN_ADX &&
                adxSlope >= MOVE_EXHAUSTION_FILTER_PARAMS.EXCEPTION_MIN_ADX_SLOPE;
              
              // NEW: Check for mean reversion exception (counter-trend bounce)
              // For SHORT exhaustion → allows LONG bounce entry
              const mrConfig = MOVE_EXHAUSTION_FILTER_PARAMS.MEAN_REVERSION;
              const meanReversionException = MOVE_EXHAUSTION_FILTER_PARAMS.ALLOW_MEAN_REVERSION_EXCEPTION &&
                mrConfig &&
                // Trend energy must be decaying (ADX not too high OR slope declining)
                (adx < mrConfig.MAX_ADX_FOR_EXCEPTION || adxSlope <= mrConfig.MAX_ADX_SLOPE) &&
                adxSlope <= mrConfig.MAX_ADX_SLOPE &&
                // StochRSI must be at oversold extreme (for LONG bounce)
                stochRsiK4h <= mrConfig.LONG_MAX_K_FOR_EXCEPTION &&
                // Move must be significant enough to warrant reversal
                distanceFromHigh >= mrConfig.MIN_MOVE_PERCENT_FOR_EXCEPTION;
              
              if (strongTrendException) {
                moveZone = 'EXCEPTION';
                moveExhaustionPositionMultiplier = MOVE_EXHAUSTION_FILTER_PARAMS.EXCEPTION_POSITION_SIZE;
                moveZoneDetails = {
                  zone: 'EXCEPTION',
                  distancePercent: distanceFromHigh,
                  direction: 'short',
                  stochRsiK: stochRsiK4h,
                  adx,
                  adxSlope,
                  outcome: 'EXCEPTION_ALLOWED',
                  positionMultiplier: moveExhaustionPositionMultiplier,
                  overrideReason: `Strong trend: ADX=${adx.toFixed(1)} >= ${MOVE_EXHAUSTION_FILTER_PARAMS.EXCEPTION_MIN_ADX}, slope=${adxSlope.toFixed(2)} >= ${MOVE_EXHAUSTION_FILTER_PARAMS.EXCEPTION_MIN_ADX_SLOPE}`,
                  relaxationApplied: useRelaxedThresholds,
                  relaxationCondition
                };
                logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} ⚠️ MOVE_EXHAUSTION EXCEPTION: Price dropped ${distanceFromHigh.toFixed(1)}% but ADX=${adx.toFixed(1)} rising (slope=${adxSlope.toFixed(2)}) - allowing with ${(moveExhaustionPositionMultiplier * 100).toFixed(0)}% position`);
              } else if (meanReversionException) {
                // Mean Reversion bypass: allow LONG bounce after extended drop
                moveZone = 'MEAN_REVERSION';
                moveExhaustionPositionMultiplier = mrConfig.POSITION_SIZE;
                moveZoneDetails = {
                  zone: 'MEAN_REVERSION',
                  distancePercent: distanceFromHigh,
                  direction: 'long',  // Opposite direction for MR
                  stochRsiK: stochRsiK4h,
                  adx,
                  adxSlope,
                  outcome: 'MEAN_REVERSION_ALLOWED',
                  positionMultiplier: moveExhaustionPositionMultiplier,
                  overrideReason: `Mean Reversion Bounce: ADX=${adx.toFixed(1)}, slope=${adxSlope.toFixed(2)} <= 0, K=${stochRsiK4h.toFixed(0)} <= ${mrConfig.LONG_MAX_K_FOR_EXCEPTION} (oversold)`,
                  meanReversionAllowed: true,
                  meanReversionScore: Math.min(100, Math.round((distanceFromHigh / 10) * 50 + ((15 - stochRsiK4h) / 15) * 50)),
                  relaxationApplied: useRelaxedThresholds,
                  relaxationCondition
                };
                logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} 🔄 MOVE_EXHAUSTION MEAN_REVERSION: Price dropped ${distanceFromHigh.toFixed(1)}%, ADX=${adx.toFixed(1)} decaying (slope=${adxSlope.toFixed(2)}), K=${stochRsiK4h.toFixed(0)} (oversold) - allowing LONG bounce at ${(moveExhaustionPositionMultiplier * 100).toFixed(0)}% position`);
              } else {
                moveExhaustionBlocked = true;
                moveExhaustionReason = `MOVE_EXHAUSTED: Price dropped ${distanceFromHigh.toFixed(1)}% from 24h high ($${priceDistance.high24h.toFixed(2)}), too late to SHORT (threshold: ${effectiveHardThreshold}%${useRelaxedThresholds ? ' [relaxed]' : ''})`;
                moveZoneDetails = {
                  zone: useRelaxedThresholds ? 'RELAXED_HARD' : 'HARD',
                  distancePercent: distanceFromHigh,
                  direction: 'short',
                  stochRsiK: stochRsiK4h,
                  adx,
                  adxSlope,
                  outcome: 'BLOCKED',
                  positionMultiplier: 0,
                  // Add mean reversion diagnostics to blocked signals
                  meanReversionAllowed: false,
                  meanReversionBlockReason: mrConfig ? 
                    (adx >= mrConfig.MAX_ADX_FOR_EXCEPTION && adxSlope > mrConfig.MAX_ADX_SLOPE ? 
                      `ADX=${adx.toFixed(1)} >= ${mrConfig.MAX_ADX_FOR_EXCEPTION} with slope=${adxSlope.toFixed(2)} > 0 (trend still expanding)` :
                      stochRsiK4h > mrConfig.LONG_MAX_K_FOR_EXCEPTION ? 
                        `K=${stochRsiK4h.toFixed(0)} > ${mrConfig.LONG_MAX_K_FOR_EXCEPTION} (not oversold enough for bounce)` :
                        'Mean reversion conditions not met') : 
                    'Mean reversion not configured',
                  relaxationApplied: useRelaxedThresholds,
                  relaxationCondition
                };
              }
            }
            // ===== SOFT GATE: Check StochRSI alignment =====
            else if (distanceFromHigh >= effectiveSoftThreshold) {
              // Determine if we're in original soft (3.5-5%) or relaxed soft (5-6%) or relaxed transition (6-8%)
              const originalSoftThreshold = MOVE_EXHAUSTION_FILTER_PARAMS.SOFT_THRESHOLD_PERCENT;
              const originalHardThreshold = MOVE_EXHAUSTION_FILTER_PARAMS.HARD_THRESHOLD_PERCENT;
              
              if (useRelaxedThresholds && distanceFromHigh >= originalHardThreshold) {
                // In relaxed transition zone (between original hard 5% and relaxed hard 8%)
                moveZone = 'RELAXED_SOFT';
              } else {
                moveZone = 'SOFT';
              }
              
              // FIX: For late shorts - only block at EXTREME oversold (K < 20), not moderate (K < 35)
              // Logic: In a falling market, K = 15-40 is normal continuation territory
              // We only block if K < 20 (extreme exhaustion = bounce imminent)
              const stochRsiMinForShort = MOVE_EXHAUSTION_FILTER_PARAMS.STOCHRSI_MIN_FOR_SHORT ?? 
                                           MOVE_EXHAUSTION_FILTER_PARAMS.STOCHRSI_NOT_OVERSOLD_FOR_SHORT ?? 20;
              if (MOVE_EXHAUSTION_FILTER_PARAMS.REQUIRE_STOCHRSI_ALIGNMENT && 
                  stochRsiK4h < stochRsiMinForShort) {
                moveExhaustionBlocked = true;
                moveExhaustionReason = `MOVE_EXHAUSTED: Price dropped ${distanceFromHigh.toFixed(1)}% + StochRSI K=${stochRsiK4h.toFixed(0)} < ${stochRsiMinForShort} (extreme oversold), too late to SHORT`;
                moveZoneDetails = {
                  zone: moveZone,
                  distancePercent: distanceFromHigh,
                  direction: 'short',
                  stochRsiK: stochRsiK4h,
                  adx,
                  adxSlope,
                  outcome: 'BLOCKED',
                  positionMultiplier: 0,
                  overrideReason: `StochRSI K=${stochRsiK4h.toFixed(0)} < ${stochRsiMinForShort} (extreme oversold)`,
                  relaxationApplied: useRelaxedThresholds,
                  relaxationCondition
                };
              } else {
                // Allow with reduced position - use appropriate sizing based on zone
                moveExhaustionSoftGate = true;
                
                if (useRelaxedThresholds && distanceFromHigh >= originalHardThreshold) {
                  // Relaxed transition zone (5-8%): use relaxed transition sizing
                  moveExhaustionPositionMultiplier = relaxation.RELAXED_TRANSITION_POSITION_SIZE;
                } else if (useRelaxedThresholds && distanceFromHigh >= originalSoftThreshold) {
                  // Relaxed soft zone (3.5-5%): use relaxed soft sizing (better R:R)
                  moveExhaustionPositionMultiplier = relaxation.RELAXED_SOFT_POSITION_SIZE;
                } else {
                  // Original soft zone
                  moveExhaustionPositionMultiplier = MOVE_EXHAUSTION_FILTER_PARAMS.SOFT_THRESHOLD_POSITION_SIZE;
                }
                
                moveZoneDetails = {
                  zone: moveZone,
                  distancePercent: distanceFromHigh,
                  direction: 'short',
                  stochRsiK: stochRsiK4h,
                  adx,
                  adxSlope,
                  outcome: 'REDUCED',
                  positionMultiplier: moveExhaustionPositionMultiplier,
                  relaxationApplied: useRelaxedThresholds,
                  relaxationCondition
                };
                logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} ⚠️ MOVE_EXHAUSTION SOFT: Price dropped ${distanceFromHigh.toFixed(1)}% with StochRSI K=${stochRsiK4h.toFixed(0)} >= ${stochRsiMinForShort}, reducing position to ${(moveExhaustionPositionMultiplier * 100).toFixed(0)}%${useRelaxedThresholds ? ` [relaxed: ${relaxationCondition}]` : ''}`);
              }
            } else {
              // FRESH zone - no exhaustion
              moveZoneDetails = {
                zone: 'FRESH',
                distancePercent: distanceFromHigh,
                direction: 'short',
                stochRsiK: stochRsiK4h,
                adx,
                adxSlope,
                outcome: 'ALLOWED',
                positionMultiplier: 1.0,
                relaxationApplied: useRelaxedThresholds,
                relaxationCondition
              };
            }
          } else if (derivedDirection === 'long' && priceDistance) {
            const distanceFromLow = priceDistance.distanceFromLowPercent ?? 0;
            
            // ===== HARD BLOCK: Price rallied too far already =====
            if (distanceFromLow >= effectiveHardThreshold) {
              moveZone = useRelaxedThresholds ? 'RELAXED_HARD' : 'HARD';
              // Check for strong trend exception (continuation)
              const strongTrendException = MOVE_EXHAUSTION_FILTER_PARAMS.ALLOW_STRONG_TREND_EXCEPTION &&
                adx >= MOVE_EXHAUSTION_FILTER_PARAMS.EXCEPTION_MIN_ADX &&
                adxSlope >= MOVE_EXHAUSTION_FILTER_PARAMS.EXCEPTION_MIN_ADX_SLOPE;
              
              // NEW: Check for mean reversion exception (counter-trend fade)
              // For LONG exhaustion → allows SHORT fade entry
              const mrConfig = MOVE_EXHAUSTION_FILTER_PARAMS.MEAN_REVERSION;
              const meanReversionException = MOVE_EXHAUSTION_FILTER_PARAMS.ALLOW_MEAN_REVERSION_EXCEPTION &&
                mrConfig &&
                // Trend energy must be decaying (ADX not too high OR slope declining)
                (adx < mrConfig.MAX_ADX_FOR_EXCEPTION || adxSlope <= mrConfig.MAX_ADX_SLOPE) &&
                adxSlope <= mrConfig.MAX_ADX_SLOPE &&
                // StochRSI must be at overbought extreme (for SHORT fade)
                stochRsiK4h >= mrConfig.SHORT_MIN_K_FOR_EXCEPTION &&
                // Move must be significant enough to warrant reversal
                distanceFromLow >= mrConfig.MIN_MOVE_PERCENT_FOR_EXCEPTION;
              
              if (strongTrendException) {
                moveZone = 'EXCEPTION';
                moveExhaustionPositionMultiplier = MOVE_EXHAUSTION_FILTER_PARAMS.EXCEPTION_POSITION_SIZE;
                moveZoneDetails = {
                  zone: 'EXCEPTION',
                  distancePercent: distanceFromLow,
                  direction: 'long',
                  stochRsiK: stochRsiK4h,
                  adx,
                  adxSlope,
                  outcome: 'EXCEPTION_ALLOWED',
                  positionMultiplier: moveExhaustionPositionMultiplier,
                  overrideReason: `Strong trend: ADX=${adx.toFixed(1)} >= ${MOVE_EXHAUSTION_FILTER_PARAMS.EXCEPTION_MIN_ADX}, slope=${adxSlope.toFixed(2)} >= ${MOVE_EXHAUSTION_FILTER_PARAMS.EXCEPTION_MIN_ADX_SLOPE}`,
                  relaxationApplied: useRelaxedThresholds,
                  relaxationCondition
                };
                logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} ⚠️ MOVE_EXHAUSTION EXCEPTION: Price rallied ${distanceFromLow.toFixed(1)}% but ADX=${adx.toFixed(1)} rising (slope=${adxSlope.toFixed(2)}) - allowing with ${(moveExhaustionPositionMultiplier * 100).toFixed(0)}% position`);
              } else if (meanReversionException) {
                // Mean Reversion bypass: allow SHORT fade after extended rally
                moveZone = 'MEAN_REVERSION';
                moveExhaustionPositionMultiplier = mrConfig.POSITION_SIZE;
                moveZoneDetails = {
                  zone: 'MEAN_REVERSION',
                  distancePercent: distanceFromLow,
                  direction: 'short',  // Opposite direction for MR
                  stochRsiK: stochRsiK4h,
                  adx,
                  adxSlope,
                  outcome: 'MEAN_REVERSION_ALLOWED',
                  positionMultiplier: moveExhaustionPositionMultiplier,
                  overrideReason: `Mean Reversion Fade: ADX=${adx.toFixed(1)}, slope=${adxSlope.toFixed(2)} <= 0, K=${stochRsiK4h.toFixed(0)} >= ${mrConfig.SHORT_MIN_K_FOR_EXCEPTION} (overbought)`,
                  meanReversionAllowed: true,
                  meanReversionScore: Math.min(100, Math.round((distanceFromLow / 10) * 50 + ((stochRsiK4h - 85) / 15) * 50)),
                  relaxationApplied: useRelaxedThresholds,
                  relaxationCondition
                };
                logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} 🔄 MOVE_EXHAUSTION MEAN_REVERSION: Price rallied ${distanceFromLow.toFixed(1)}%, ADX=${adx.toFixed(1)} decaying (slope=${adxSlope.toFixed(2)}), K=${stochRsiK4h.toFixed(0)} (overbought) - allowing SHORT fade at ${(moveExhaustionPositionMultiplier * 100).toFixed(0)}% position`);
              } else {
                moveExhaustionBlocked = true;
                moveExhaustionReason = `MOVE_EXHAUSTED: Price rallied ${distanceFromLow.toFixed(1)}% from 24h low ($${priceDistance.low24h.toFixed(2)}), too late to LONG (threshold: ${effectiveHardThreshold}%${useRelaxedThresholds ? ' [relaxed]' : ''})`;
                moveZoneDetails = {
                  zone: useRelaxedThresholds ? 'RELAXED_HARD' : 'HARD',
                  distancePercent: distanceFromLow,
                  direction: 'long',
                  stochRsiK: stochRsiK4h,
                  adx,
                  adxSlope,
                  outcome: 'BLOCKED',
                  positionMultiplier: 0,
                  // Add mean reversion diagnostics to blocked signals
                  meanReversionAllowed: false,
                  meanReversionBlockReason: mrConfig ? 
                    (adx >= mrConfig.MAX_ADX_FOR_EXCEPTION && adxSlope > mrConfig.MAX_ADX_SLOPE ? 
                      `ADX=${adx.toFixed(1)} >= ${mrConfig.MAX_ADX_FOR_EXCEPTION} with slope=${adxSlope.toFixed(2)} > 0 (trend still expanding)` :
                      stochRsiK4h < mrConfig.SHORT_MIN_K_FOR_EXCEPTION ? 
                        `K=${stochRsiK4h.toFixed(0)} < ${mrConfig.SHORT_MIN_K_FOR_EXCEPTION} (not overbought enough for fade)` :
                        'Mean reversion conditions not met') : 
                    'Mean reversion not configured',
                  relaxationApplied: useRelaxedThresholds,
                  relaxationCondition
                };
              }
            }
            // ===== SOFT GATE: Check StochRSI alignment =====
            else if (distanceFromLow >= effectiveSoftThreshold) {
              // Determine if we're in original soft (3.5-5%) or relaxed soft (5-6%) or relaxed transition (6-8%)
              const originalSoftThreshold = MOVE_EXHAUSTION_FILTER_PARAMS.SOFT_THRESHOLD_PERCENT;
              const originalHardThreshold = MOVE_EXHAUSTION_FILTER_PARAMS.HARD_THRESHOLD_PERCENT;
              
              if (useRelaxedThresholds && distanceFromLow >= originalHardThreshold) {
                // In relaxed transition zone (between original hard 5% and relaxed hard 8%)
                moveZone = 'RELAXED_SOFT';
              } else {
                moveZone = 'SOFT';
              }
              
              // For late longs: StochRSI must NOT be already overbought (K > 50)
              if (MOVE_EXHAUSTION_FILTER_PARAMS.REQUIRE_STOCHRSI_ALIGNMENT && 
                  stochRsiK4h > MOVE_EXHAUSTION_FILTER_PARAMS.STOCHRSI_NOT_OVERBOUGHT_FOR_LONG) {
                moveExhaustionBlocked = true;
                moveExhaustionReason = `MOVE_EXHAUSTED: Price rallied ${distanceFromLow.toFixed(1)}% + StochRSI K=${stochRsiK4h.toFixed(0)} > ${MOVE_EXHAUSTION_FILTER_PARAMS.STOCHRSI_NOT_OVERBOUGHT_FOR_LONG} (overbought), too late to LONG`;
                moveZoneDetails = {
                  zone: moveZone,
                  distancePercent: distanceFromLow,
                  direction: 'long',
                  stochRsiK: stochRsiK4h,
                  adx,
                  adxSlope,
                  outcome: 'BLOCKED',
                  positionMultiplier: 0,
                  overrideReason: `StochRSI K=${stochRsiK4h.toFixed(0)} > ${MOVE_EXHAUSTION_FILTER_PARAMS.STOCHRSI_NOT_OVERBOUGHT_FOR_LONG} (overbought)`,
                  relaxationApplied: useRelaxedThresholds,
                  relaxationCondition
                };
              } else {
                // Allow with reduced position - use appropriate sizing based on zone
                moveExhaustionSoftGate = true;
                
                if (useRelaxedThresholds && distanceFromLow >= originalHardThreshold) {
                  // Relaxed transition zone (5-8%): use relaxed transition sizing
                  moveExhaustionPositionMultiplier = relaxation.RELAXED_TRANSITION_POSITION_SIZE;
                } else if (useRelaxedThresholds && distanceFromLow >= originalSoftThreshold) {
                  // Relaxed soft zone (3.5-5%): use relaxed soft sizing (better R:R)
                  moveExhaustionPositionMultiplier = relaxation.RELAXED_SOFT_POSITION_SIZE;
                } else {
                  // Original soft zone
                  moveExhaustionPositionMultiplier = MOVE_EXHAUSTION_FILTER_PARAMS.SOFT_THRESHOLD_POSITION_SIZE;
                }
                
                moveZoneDetails = {
                  zone: moveZone,
                  distancePercent: distanceFromLow,
                  direction: 'long',
                  stochRsiK: stochRsiK4h,
                  adx,
                  adxSlope,
                  outcome: 'REDUCED',
                  positionMultiplier: moveExhaustionPositionMultiplier,
                  relaxationApplied: useRelaxedThresholds,
                  relaxationCondition
                };
                logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} ⚠️ MOVE_EXHAUSTION SOFT: Price rallied ${distanceFromLow.toFixed(1)}% with StochRSI K=${stochRsiK4h.toFixed(0)} <= ${MOVE_EXHAUSTION_FILTER_PARAMS.STOCHRSI_NOT_OVERBOUGHT_FOR_LONG}, reducing position to ${(moveExhaustionPositionMultiplier * 100).toFixed(0)}%${useRelaxedThresholds ? ` [relaxed: ${relaxationCondition}]` : ''}`);
              }
            } else {
              // FRESH zone - no exhaustion
              moveZoneDetails = {
                zone: 'FRESH',
                distancePercent: distanceFromLow,
                direction: 'long',
                stochRsiK: stochRsiK4h,
                adx,
                adxSlope,
                outcome: 'ALLOWED',
                positionMultiplier: 1.0,
                relaxationApplied: useRelaxedThresholds,
                relaxationCondition
              };
            }
          }
          
          // ===== ZONE ANALYTICS LOGGING =====
          // Log zone distribution for all symbols (not just blocked ones)
          if (moveZoneDetails) {
            const relaxedTag = moveZoneDetails.relaxationApplied ? ` [RELAXED: ${moveZoneDetails.relaxationCondition}]` : '';
            logger.forSymbol(symbol).info(`📊 ZONE_ANALYTICS: ${moveZoneDetails.zone} | move=${moveZoneDetails.distancePercent.toFixed(1)}% | dir=${moveZoneDetails.direction} | outcome=${moveZoneDetails.outcome} | size=${(moveZoneDetails.positionMultiplier * 100).toFixed(0)}% | K=${moveZoneDetails.stochRsiK.toFixed(0)} | ADX=${moveZoneDetails.adx.toFixed(1)}${moveZoneDetails.overrideReason ? ` | reason=${moveZoneDetails.overrideReason}` : ''}${relaxedTag}`);
          }
          
          // ===== MEAN REVERSION DIRECTION FLIP =====
          // When mean reversion is triggered, flip the trade direction to counter-trend
          let meanReversionDirectionFlipped = false;
          let meanReversionReason = '';
          if (moveZone === 'MEAN_REVERSION' && moveZoneDetails?.meanReversionAllowed) {
            const originalDirection = derivedDirection;
            // Flip direction for mean reversion
            derivedDirection = derivedDirection === 'long' ? 'short' : 'long';
            meanReversionDirectionFlipped = true;
            meanReversionReason = `MEAN_REVERSION: Flipped from ${originalDirection} due to exhausted move (${moveZoneDetails.distancePercent.toFixed(1)}% from swing)`;
            
            logger.forSymbol(symbol).info(
              `${LOG_CATEGORIES.SUCCESS} 🔄 MEAN_REVERSION DIRECTION FLIP: ${originalDirection?.toUpperCase()} → ${derivedDirection.toUpperCase()}\n` +
              `   → ADX: ${moveZoneDetails.adx.toFixed(1)}, slope: ${moveZoneDetails.adxSlope.toFixed(2)}\n` +
              `   → K: ${moveZoneDetails.stochRsiK.toFixed(0)}, move: ${moveZoneDetails.distancePercent.toFixed(1)}%\n` +
              `   → Position: ${(moveExhaustionPositionMultiplier * 100).toFixed(0)}%`
            );
          }
          
          // Log swing distance for debugging if significant
          if (MOVE_EXHAUSTION_FILTER_PARAMS.LOG_EXHAUSTION_CHECKS && priceDistance) {
            const highDist = priceDistance.distanceFromHighPercent ?? 0;
            const lowDist = priceDistance.distanceFromLowPercent ?? 0;
            if (highDist >= 3 || lowDist >= 3) {
              logger.forSymbol(symbol).debug(`📊 SWING DISTANCE: ${highDist.toFixed(1)}% from high, ${lowDist.toFixed(1)}% from low | StochRSI K=${stochRsiK4h.toFixed(0)}`);
            }
          }
          
          if (moveExhaustionBlocked) {
            rejectedByHardGates++;
            perSymbolGateAttribution.set(symbol, { 
              gate: derivedDirection === 'short' ? 'MOVE_EXHAUSTED_SHORT' : 'MOVE_EXHAUSTED_LONG', 
              details: moveExhaustionReason 
            });
            
            logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.GATE} 🚫 ${moveExhaustionReason}`);
            
            await logRejectionWithAI(
              supabase, userId, symbol,
              moveExhaustionReason,
              {
                gate: derivedDirection === 'short' ? 'MOVE_EXHAUSTED_SHORT' : 'MOVE_EXHAUSTED_LONG',
                derivedDirection,
                priceDistanceFromSwing: priceDistance,
                stochRsiK4h: stochRsiK4h.toFixed(1),
                adx: adx.toFixed(1),
                adxSlope: adxSlope.toFixed(2),
                // NEW: Zone analytics data
                moveZone,
                moveZoneDetails,
                thresholds: {
                  hardThresholdPercent: effectiveHardThreshold,
                  softThresholdPercent: effectiveSoftThreshold,
                  stochRsiNotOversoldForShort: MOVE_EXHAUSTION_FILTER_PARAMS.STOCHRSI_NOT_OVERSOLD_FOR_SHORT,
                  stochRsiNotOverboughtForLong: MOVE_EXHAUSTION_FILTER_PARAMS.STOCHRSI_NOT_OVERBOUGHT_FOR_LONG,
                  exceptionMinAdx: MOVE_EXHAUSTION_FILTER_PARAMS.EXCEPTION_MIN_ADX,
                  // NEW: Relaxation info
                  relaxationApplied: useRelaxedThresholds,
                  relaxationCondition,
                  originalHardThreshold: MOVE_EXHAUSTION_FILTER_PARAMS.HARD_THRESHOLD_PERCENT,
                  originalSoftThreshold: MOVE_EXHAUSTION_FILTER_PARAMS.SOFT_THRESHOLD_PERCENT,
                },
                // Context for debugging
                swingHigh24h: priceDistance?.high24h,
                swingLow24h: priceDistance?.low24h,
                currentPrice: trendData.currentPrice,
              },
              trendData,
              riskParams.ai_analysis_enabled !== false,
              earlyOrderFlowAnalysis
            );
            continue;
          }
        }
        
        // ============= LTF CONFIRMATION GATE =============
        // Prevents continuation entries when HTF (4h) is directional but LTF (1h/30m) shows exhaustion/neutrality
        // This addresses the "trend continuation misclassification" problem
        let ltfConfirmationPositionMultiplier = 1.0;
        let ltfConfirmationApplied = false;
        
        if (LTF_CONFIRMATION_GATE.ENABLED) {
          const priceDistance = trendData.priceDistanceFromSwing;
          const tf30m = trendData.timeframes?.['30m'];
          const tf30mDir = tf30m?.trend || tf30m?.indicators?.emaSignal || "neutral";
          // Extract directly from trendData instead of using later-declared variables
          const tf1hDir = trendData.timeframes?.['1h']?.trend || trendData.timeframes?.['1h']?.indicators?.emaSignal || "neutral";
          const tf4hDir = trendData.timeframes?.['4h']?.trend || trendData.timeframes?.['4h']?.indicators?.emaSignal || "neutral";
          const conf4h = trendData.timeframes?.['4h']?.confidence || 50;
          
          // Only apply when 4h is strongly directional
          const is4hStronglyDirectional = (tf4hDir === 'bullish' || tf4hDir === 'bearish') && 
            conf4h >= LTF_CONFIRMATION_GATE.MIN_4H_CONFIDENCE;
          
          // Check if ADX is above threshold for this check
          const shouldApplyLtfCheck = adx >= LTF_CONFIRMATION_GATE.MIN_ADX_FOR_CHECK;
          
          if (is4hStronglyDirectional && shouldApplyLtfCheck) {
            const expectedLtfTrend = derivedDirection === 'long' ? 'bullish' : 'bearish';
            const expectedOppositeTrend = derivedDirection === 'long' ? 'bearish' : 'bullish';
            
            // Check LTF alignment
            const is1hAligned = tf1hDir === expectedLtfTrend;
            const is30mAligned = tf30mDir === expectedLtfTrend;
            const is1hNeutral = tf1hDir === 'neutral';
            const is30mNeutral = tf30mDir === 'neutral';
            const is1hOpposing = tf1hDir === expectedOppositeTrend;
            const is30mOpposing = tf30mDir === expectedOppositeTrend;
            
            // Determine position sizing based on alignment
            if (is1hAligned || is30mAligned) {
              // At least one LTF is aligned - full or partial size
              if (is1hAligned && is30mAligned) {
                ltfConfirmationPositionMultiplier = LTF_CONFIRMATION_GATE.SIZING.FULL_ALIGNMENT;
              } else if (is1hAligned) {
                ltfConfirmationPositionMultiplier = LTF_CONFIRMATION_GATE.SIZING.PARTIAL_ALIGNMENT;
                ltfConfirmationApplied = true;
              } else {
                // Only 30m aligned, 1h neutral
                ltfConfirmationPositionMultiplier = LTF_CONFIRMATION_GATE.SIZING.PARTIAL_ALIGNMENT;
                ltfConfirmationApplied = true;
              }
            } else if (is1hOpposing || is30mOpposing) {
              // LTF is opposing - BLOCK
              if (LTF_CONFIRMATION_GATE.SIZING.COUNTER_ALIGNMENT_BLOCK) {
                rejectedByHardGates++;
                perSymbolGateAttribution.set(symbol, { 
                  gate: 'LTF_COUNTER_ALIGNED', 
                  details: `${derivedDirection.toUpperCase()} blocked: 4h=${tf4hDir} but 1h=${tf1hDir}, 30m=${tf30mDir}` 
                });
                
                const blockReason = `LTF_COUNTER_ALIGNED: ${derivedDirection.toUpperCase()} blocked - 4h is ${tf4hDir} (${conf4h}%) but 1h=${tf1hDir}, 30m=${tf30mDir} (LTF shows counter-trend)`;
                logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.GATE} 🚫 ${blockReason}`);
                
                await logRejectionWithAI(
                  supabase, userId, symbol,
                  blockReason,
                  {
                    gate: 'LTF_COUNTER_ALIGNED',
                    derivedDirection,
                    tf4hDir, tf1hDir, tf30mDir,
                    conf4h,
                    adx: adx.toFixed(1),
                    ltfConfirmationRequired: true,
                    wouldPassWith: `1h or 30m trend must be ${expectedLtfTrend} or neutral`,
                  },
                  trendData,
                  riskParams.ai_analysis_enabled !== false,
                  earlyOrderFlowAnalysis
                );
                continue;
              }
            } else if (is1hNeutral && is30mNeutral) {
              // BOTH LTF neutral - check if momentum is also opposing (double-warning signal)
              
              // ===== MR PROBE MOMENTUM TOLERANCE =====
              // For Mean Reversion probes, opposing momentum is EXPECTED (we just flipped direction)
              // Use relaxed thresholds from COUNTER_TREND_ADMISSION.MOMENTUM_TOLERANCE
              const mrTolerance = COUNTER_TREND_ADMISSION.MOMENTUM_TOLERANCE;
              const baseMrProbeCheck = moveZone === 'MEAN_REVERSION' && moveZoneDetails?.meanReversionAllowed && mrTolerance.ENABLED;
              
              // ===== SAFETY #1: ADX PERSISTENCE GATING =====
              // MR tolerance only applies when trend energy is CONFIRMED decaying
              // Prevents early MR probes during shallow pullbacks
              const mrAdxPersistence = counterTrendAdmissionResult?.adxSlopePersistence ?? 0;
              const adxPersistenceMet = mrAdxPersistence >= mrTolerance.ADX_PERSISTENCE_BYPASS_THRESHOLD;
              
              // ===== SAFETY #2: MOMENTUM DELTA IMPROVEMENT =====
              // For LONG MR probes: momentum delta should be >= 0 (not getting worse)
              // For SHORT MR probes: momentum delta should be <= 0 (not getting worse)
              const prevMomentumScore = trendData?.momentum?.prevScore ?? smartMomentum.score;
              const momentumDelta = smartMomentum.score - prevMomentumScore;
              const deltaMeetsCriteria = !mrTolerance.REQUIRE_IMPROVING_DELTA || (
                (derivedDirection === 'long' && momentumDelta >= mrTolerance.IMPROVING_DELTA_THRESHOLD) ||
                (derivedDirection === 'short' && momentumDelta <= -mrTolerance.IMPROVING_DELTA_THRESHOLD)
              );
              
              // MR probe is ONLY eligible if both safety conditions are met
              const isMrProbe = baseMrProbeCheck && adxPersistenceMet && deltaMeetsCriteria;
              
              // Log MR tolerance eligibility for diagnostics
              if (baseMrProbeCheck && !isMrProbe) {
                const failureReasons: string[] = [];
                if (!adxPersistenceMet) failureReasons.push(`ADX persistence ${mrAdxPersistence} < ${mrTolerance.ADX_PERSISTENCE_BYPASS_THRESHOLD}`);
                if (!deltaMeetsCriteria) failureReasons.push(`Momentum delta ${momentumDelta.toFixed(1)} not improving for ${derivedDirection.toUpperCase()}`);
                
                logger.forSymbol(symbol).info(
                  `${LOG_CATEGORIES.GATE} ⚠️ MR_TOLERANCE_NOT_MET: ${failureReasons.join('; ')}\n` +
                  `   → Will use standard momentum threshold instead of relaxed MR threshold`
                );
              }
              
              // Determine effective momentum opposing threshold
              const effectiveThreshold = isMrProbe 
                ? mrTolerance.RELAXED_OPPOSING_THRESHOLD 
                : LTF_CONFIRMATION_GATE.MOMENTUM_OPPOSING_THRESHOLD;
              
              // Check if momentum is in EXTREME opposing zone (block even MR probes)
              const extremeMomentumOpposing = isMrProbe && (
                (derivedDirection === 'long' && smartMomentum.score < -mrTolerance.EXTREME_OPPOSING_THRESHOLD) ||
                (derivedDirection === 'short' && smartMomentum.score > mrTolerance.EXTREME_OPPOSING_THRESHOLD)
              );
              
              // Standard momentum opposition check (uses relaxed threshold for MR probes)
              const momentumOpposing = 
                (derivedDirection === 'long' && smartMomentum.score < -effectiveThreshold) ||
                (derivedDirection === 'short' && smartMomentum.score > effectiveThreshold);
              
              // MR probe with moderate opposition: allow entry with reduced size
              const mrModerateOpposition = isMrProbe && momentumOpposing && !extremeMomentumOpposing;
              
              if (LTF_CONFIRMATION_GATE.BLOCK_WHEN_MOMENTUM_ALSO_OPPOSING && (momentumOpposing || extremeMomentumOpposing)) {
                // Check for MR probe bypass
                if (mrModerateOpposition) {
                  // ===== SAFETY #3: POSITION MULTIPLIER STACKING =====
                  // Ensure MR tolerance cannot INCREASE position size
                  // Take the minimum of: base MR probe size, moderate opposition size
                  const baseMrProbeMultiplier = COUNTER_TREND_ADMISSION.PROBE_POSITION_MULTIPLIER;
                  const mrMomentumMultiplier = mrTolerance.MODERATE_OPPOSITION_MULTIPLIER;
                  ltfConfirmationPositionMultiplier = Math.min(baseMrProbeMultiplier, mrMomentumMultiplier);
                  ltfConfirmationApplied = true;
                  
                  if (mrTolerance.LOG_TOLERANCE_APPLIED) {
                    logger.forSymbol(symbol).info(
                      `${LOG_CATEGORIES.GATE} 🔄 MR_MOMENTUM_TOLERANCE APPLIED:\n` +
                      `   → MR probe ${derivedDirection.toUpperCase()} allowed despite momentum=${smartMomentum.score.toFixed(0)}\n` +
                      `   → Standard threshold: ${LTF_CONFIRMATION_GATE.MOMENTUM_OPPOSING_THRESHOLD}, MR relaxed: ${mrTolerance.RELAXED_OPPOSING_THRESHOLD}\n` +
                      `   → ADX persistence: ${mrAdxPersistence} >= ${mrTolerance.ADX_PERSISTENCE_BYPASS_THRESHOLD} ✓\n` +
                      `   → Momentum delta: ${momentumDelta.toFixed(1)} (${deltaMeetsCriteria ? 'improving ✓' : 'not improving'})\n` +
                      `   → Position: min(${(baseMrProbeMultiplier * 100).toFixed(0)}%, ${(mrMomentumMultiplier * 100).toFixed(0)}%) = ${(ltfConfirmationPositionMultiplier * 100).toFixed(0)}%`
                    );
                  }
                } else if (extremeMomentumOpposing) {
                  // Even MR probes blocked at extreme momentum
                  rejectedByHardGates++;
                  const blockReason = `MR_EXTREME_MOMENTUM_BLOCK: ${derivedDirection.toUpperCase()} MR probe blocked - momentum (${smartMomentum.score.toFixed(0)}) exceeds extreme threshold (±${mrTolerance.EXTREME_OPPOSING_THRESHOLD})`;
                  perSymbolGateAttribution.set(symbol, { 
                    gate: 'MR_EXTREME_MOMENTUM_BLOCK',
                    details: blockReason 
                  });
                  
                  logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.GATE} 🚫 ${blockReason}`);
                  
                  await logRejectionWithAI(
                    supabase, userId, symbol,
                    blockReason,
                    {
                      gate: "MR_EXTREME_MOMENTUM_BLOCK",
                      derivedDirection,
                      meanReversionDirectionFlipped: true,
                      tf4hDir, tf1hDir, tf30mDir,
                      conf4h,
                      momentumScore: smartMomentum.score,
                      momentumDelta,
                      adxPersistence: mrAdxPersistence,
                      extremeThreshold: mrTolerance.EXTREME_OPPOSING_THRESHOLD,
                      adx: adx.toFixed(1),
                      mrProbe: true,
                      wouldPassWith: `Momentum must be less extreme (|score| <= ${mrTolerance.EXTREME_OPPOSING_THRESHOLD})`,
                    },
                    trendData,
                    riskParams.ai_analysis_enabled !== false,
                    earlyOrderFlowAnalysis
                  );
                  continue;
                } else if (baseMrProbeCheck && !isMrProbe) {
                  // MR probe was detected but safety conditions not met - block with specific reason
                  rejectedByHardGates++;
                  const failureReasons: string[] = [];
                  if (!adxPersistenceMet) failureReasons.push(`MR_ADX_PERSISTENCE_NOT_MET (${mrAdxPersistence} < ${mrTolerance.ADX_PERSISTENCE_BYPASS_THRESHOLD})`);
                  if (!deltaMeetsCriteria) failureReasons.push(`MR_DELTA_NOT_IMPROVING (Δ=${momentumDelta.toFixed(1)})`);
                  const blockReason = `MR_SAFETY_CHECK_FAILED: ${derivedDirection.toUpperCase()} MR probe blocked - ${failureReasons.join(', ')}`;
                  perSymbolGateAttribution.set(symbol, { 
                    gate: 'MR_SAFETY_CHECK_FAILED',
                    details: blockReason 
                  });
                  
                  logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.GATE} 🚫 ${blockReason}`);
                  
                  await logRejectionWithAI(
                    supabase, userId, symbol,
                    blockReason,
                    {
                      gate: "MR_SAFETY_CHECK_FAILED",
                      derivedDirection,
                      meanReversionDirectionFlipped: true,
                      tf4hDir, tf1hDir, tf30mDir,
                      conf4h,
                      momentumScore: smartMomentum.score,
                      momentumDelta,
                      adxPersistence: mrAdxPersistence,
                      requiredAdxPersistence: mrTolerance.ADX_PERSISTENCE_BYPASS_THRESHOLD,
                      deltaMeetsCriteria,
                      adx: adx.toFixed(1),
                      mrProbe: true,
                      failureReasons,
                      wouldPassWith: `ADX persistence >= ${mrTolerance.ADX_PERSISTENCE_BYPASS_THRESHOLD} AND momentum delta improving`,
                    },
                    trendData,
                    riskParams.ai_analysis_enabled !== false,
                    earlyOrderFlowAnalysis
                  );
                  continue;
                } else {
                  // Standard block for non-MR entries
                  rejectedByHardGates++;
                  const blockReason = `LTF_CONFIRMATION_BLOCK: ${derivedDirection.toUpperCase()} blocked - BOTH 1h/30m neutral AND momentum opposing (${smartMomentum.score.toFixed(0)})`;
                  perSymbolGateAttribution.set(symbol, { 
                    gate: 'LTF_BOTH_NEUTRAL_PLUS_MOMENTUM',
                    details: blockReason 
                  });
                  
                  logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.GATE} 🚫 ${blockReason}`);
                  logger.forSymbol(symbol).warn(`   → 4h=${tf4hDir} at ${conf4h}% but LTF and momentum both unfavorable`);
                  
                  await logRejectionWithAI(
                    supabase, userId, symbol,
                    blockReason,
                    {
                      gate: "LTF_BOTH_NEUTRAL_PLUS_MOMENTUM",
                      derivedDirection,
                      tf4hDir, tf1hDir, tf30mDir,
                      conf4h,
                      momentumScore: smartMomentum.score,
                      adx: adx.toFixed(1),
                      ltfConfirmationRequired: true,
                      wouldPassWith: `Either 1h or 30m must align with direction, OR momentum must not oppose (|score| <= ${LTF_CONFIRMATION_GATE.MOMENTUM_OPPOSING_THRESHOLD})`,
                    },
                    trendData,
                    riskParams.ai_analysis_enabled !== false,
                    earlyOrderFlowAnalysis
                  );
                  continue;
                }
              }
              
              // No momentum opposition (or MR tolerance applied) - reduce to probe size
              if (!ltfConfirmationApplied) {
                ltfConfirmationPositionMultiplier = LTF_CONFIRMATION_GATE.SIZING.NO_ALIGNMENT;
                ltfConfirmationApplied = true;
                
                logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} ⚠️ LTF_NEUTRAL: ${derivedDirection.toUpperCase()} at 4h=${tf4hDir} but 1h/30m both neutral - reducing to ${(LTF_CONFIRMATION_GATE.SIZING.NO_ALIGNMENT * 100).toFixed(0)}% position`);
              }
            }
            
            if (ltfConfirmationApplied && ltfConfirmationPositionMultiplier < 1.0) {
              logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} LTF_CONFIRMATION: Position reduced to ${(ltfConfirmationPositionMultiplier * 100).toFixed(0)}% (4h=${tf4hDir}, 1h=${tf1hDir}, 30m=${tf30mDir})`);
            }
          }
        }
        
        // ============= NEAR-EXTREME PROTECTION GATE =============
        // Prevents continuation entries when price is too close to 24h lows/highs
        // Shorts near 24h low have poor R:R, Longs near 24h high have high reversal probability
        let nearExtremePositionMultiplier = 1.0;
        let nearExtremeBlocked = false;
        let nearExtremeRelaxationApplied = false;
        let nearExtremeRelaxationTrigger: string | null = null;
        
        if (NEAR_EXTREME_PROTECTION_GATE.ENABLED) {
          const priceDistance = trendData.priceDistanceFromSwing;
          
          if (priceDistance) {
            const distanceFromLow = priceDistance.distanceFromLowPercent ?? 0;
            const distanceFromHigh = priceDistance.distanceFromHighPercent ?? 0;
            
            // ===== STRONG TREND RELAXATION CHECK =====
            const relaxConfig = NEAR_EXTREME_PROTECTION_GATE.STRONG_TREND_RELAXATION;
            let useRelaxedThresholds = false;
            let relaxationReason = '';
            
            if (relaxConfig.ENABLED) {
              // Safety check: ADX slope must not be sharply declining
              const slopeAllowsRelaxation = adxSlope >= relaxConfig.MAX_ADX_SLOPE_DECLINE;
              
              if (slopeAllowsRelaxation) {
                // Check relaxation triggers
                if (adx >= relaxConfig.MIN_ADX_FOR_RELAXATION) {
                  useRelaxedThresholds = true;
                  relaxationReason = `ADX ${adx.toFixed(1)} >= ${relaxConfig.MIN_ADX_FOR_RELAXATION}`;
                } else if (relaxConfig.BOLLINGER_SQUEEZE_TRIGGER && trendData.volatility?.bbSqueeze) {
                  useRelaxedThresholds = true;
                  relaxationReason = 'BB Squeeze active';
                } else if (relaxConfig.BOLLINGER_BREAKDOWN_TRIGGER) {
                  const percentB = parseFloat(trendData.volatility?.percentB ?? '50');
                  if (derivedDirection === 'short' && percentB <= relaxConfig.BOLLINGER_BREAKDOWN_SHORT_MAX_B) {
                    useRelaxedThresholds = true;
                    relaxationReason = `%B ${percentB.toFixed(1)} <= ${relaxConfig.BOLLINGER_BREAKDOWN_SHORT_MAX_B} (SHORT breakdown)`;
                  } else if (derivedDirection === 'long' && percentB >= relaxConfig.BOLLINGER_BREAKDOWN_LONG_MIN_B) {
                    useRelaxedThresholds = true;
                    relaxationReason = `%B ${percentB.toFixed(1)} >= ${relaxConfig.BOLLINGER_BREAKDOWN_LONG_MIN_B} (LONG breakout)`;
                  }
                }
              }
              
              if (useRelaxedThresholds) {
                nearExtremeRelaxationApplied = true;
                nearExtremeRelaxationTrigger = relaxationReason;
                logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} 📈 NEAR_EXTREME_PROTECTION RELAXATION: ${relaxationReason}, thresholds expanded (soft: ${relaxConfig.RELAXED_SOFT_THRESHOLD_PERCENT}%, hard: ${relaxConfig.RELAXED_HARD_ZONE_PERCENT}%)`);
              }
            }
            
            // Determine effective thresholds
            const effectiveSoftThreshold = useRelaxedThresholds 
              ? relaxConfig.RELAXED_SOFT_THRESHOLD_PERCENT 
              : NEAR_EXTREME_PROTECTION_GATE.SHORT_NEAR_LOW_THRESHOLD_PERCENT;
            const effectiveHardThreshold = useRelaxedThresholds 
              ? relaxConfig.RELAXED_HARD_ZONE_PERCENT 
              : NEAR_EXTREME_PROTECTION_GATE.HARD_ZONE_THRESHOLD_PERCENT;
            
            // Check for shorts near 24h low
            if (derivedDirection === 'short' && distanceFromLow <= effectiveSoftThreshold) {
              // Get LTF alignment check
              const tf1hDir = trendData.timeframes?.['1h']?.trend || trendData.timeframes?.['1h']?.indicators?.emaSignal || "neutral";
              const tf30mDir = trendData.timeframes?.['30m']?.trend || 'neutral';
              const ltfSupportsShort = tf1hDir === 'bearish' || tf30mDir === 'bearish';
              
              // Check for hard zone (very close to low)
              const inHardZone = distanceFromLow <= effectiveHardThreshold;
              
              // ADX exception check
              const adxOverrideAllowed = adx >= NEAR_EXTREME_PROTECTION_GATE.ADX_OVERRIDE_THRESHOLD;
              
              // ===== REGIME-AWARE EXTREME PROXIMITY BLOCK =====
              // Block shorts extremely close to 24h low unless strong expansion regime
              const regimeBlock = NEAR_EXTREME_PROTECTION_GATE.REGIME_AWARE_BLOCK;
              if (regimeBlock.ENABLED && distanceFromLow < regimeBlock.PROXIMITY_THRESHOLD_PERCENT) {
                const absMomentumScore = Math.abs(smartMomentum.score);
                const absOrderFlowScore = Math.abs(earlyOrderFlowAnalysis?.score ?? 0);
                const adxBypass = adx >= regimeBlock.MIN_ADX_TO_BYPASS;
                const momentumBypass = absMomentumScore >= regimeBlock.MIN_MOMENTUM_SCORE_TO_BYPASS && smartMomentum.score < 0;
                const orderFlowBypass = absOrderFlowScore >= regimeBlock.MIN_ORDER_FLOW_SCORE_TO_BYPASS && (earlyOrderFlowAnalysis?.score ?? 0) < 0;
                
                if (!adxBypass && !momentumBypass && !orderFlowBypass) {
                  // HARD BLOCK: Location failure - no expansion regime to justify entry
                  nearExtremeBlocked = true;
                  rejectedByHardGates++;
                  perSymbolGateAttribution.set(symbol, { 
                    gate: 'NEAR_24H_LOW_HARD', 
                    details: `SHORT blocked: ${distanceFromLow.toFixed(2)}% from 24h low (regime-aware: ADX=${adx.toFixed(1)}<${regimeBlock.MIN_ADX_TO_BYPASS}, momentum=${smartMomentum.score.toFixed(0)}, OF=${earlyOrderFlowAnalysis?.score?.toFixed(0) ?? 'N/A'})` 
                  });
                  
                  const blockReason = `NEAR_24H_LOW_REGIME_BLOCK: SHORT blocked - only ${distanceFromLow.toFixed(2)}% above 24h low ($${priceDistance.low24h.toFixed(2)}), ADX=${adx.toFixed(1)}<${regimeBlock.MIN_ADX_TO_BYPASS}, sm_score=${smartMomentum.score.toFixed(0)} (need <=-${regimeBlock.MIN_MOMENTUM_SCORE_TO_BYPASS}), OF=${earlyOrderFlowAnalysis?.score?.toFixed(0) ?? 'N/A'} (need <=-${regimeBlock.MIN_ORDER_FLOW_SCORE_TO_BYPASS})`;
                  logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.GATE} 🚫 ${blockReason}`);
                  
                  await logRejectionWithAI(
                    supabase, userId, symbol,
                    blockReason,
                    {
                      gate: 'NEAR_24H_LOW_HARD',
                      subGate: 'REGIME_AWARE_BLOCK',
                      derivedDirection,
                      distanceFromLow: distanceFromLow.toFixed(3),
                      low24h: priceDistance.low24h,
                      proximityThreshold: regimeBlock.PROXIMITY_THRESHOLD_PERCENT,
                      adx: adx.toFixed(1),
                      adxRequired: regimeBlock.MIN_ADX_TO_BYPASS,
                      smartMomentumScore: smartMomentum.score.toFixed(1),
                      momentumRequired: `-${regimeBlock.MIN_MOMENTUM_SCORE_TO_BYPASS}`,
                      orderFlowScore: earlyOrderFlowAnalysis?.score?.toFixed(1) ?? 'N/A',
                      orderFlowRequired: `-${regimeBlock.MIN_ORDER_FLOW_SCORE_TO_BYPASS}`,
                      tf1hDir, tf30mDir,
                      relaxationApplied: nearExtremeRelaxationApplied,
                      wouldPassWith: `ADX >= ${regimeBlock.MIN_ADX_TO_BYPASS} OR momentum <= -${regimeBlock.MIN_MOMENTUM_SCORE_TO_BYPASS} OR orderFlow <= -${regimeBlock.MIN_ORDER_FLOW_SCORE_TO_BYPASS}`,
                    },
                    trendData,
                    riskParams.ai_analysis_enabled !== false,
                    earlyOrderFlowAnalysis
                  );
                  continue;
                } else {
                  // Bypass allowed but with reduced size
                  const bypassReason = adxBypass ? `ADX ${adx.toFixed(1)}>=${regimeBlock.MIN_ADX_TO_BYPASS}` : momentumBypass ? `momentum ${smartMomentum.score.toFixed(0)}<=-${regimeBlock.MIN_MOMENTUM_SCORE_TO_BYPASS}` : `orderFlow ${earlyOrderFlowAnalysis?.score?.toFixed(0)}<=-${regimeBlock.MIN_ORDER_FLOW_SCORE_TO_BYPASS}`;
                  nearExtremePositionMultiplier = Math.min(nearExtremePositionMultiplier, regimeBlock.BYPASS_POSITION_MULTIPLIER);
                  logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} ⚠️ NEAR_24H_LOW REGIME BYPASS: SHORT ${distanceFromLow.toFixed(2)}% from low, allowed via ${bypassReason} - position ${(regimeBlock.BYPASS_POSITION_MULTIPLIER * 100).toFixed(0)}%`);
                }
              }
              
              // ===== IMPROVEMENT #3: EXPANDED HARD BLOCK (1.2% zone) =====
              // Block shorts within 1.2% of 24h low unless momentum is BEARISH (not neutral)
              // Neutral momentum = absence of confirmation, NOT confirmation
              const expandedBlock = NEAR_EXTREME_PROTECTION_GATE.EXPANDED_HARD_BLOCK;
              if (!nearExtremeBlocked && expandedBlock?.ENABLED && distanceFromLow <= expandedBlock.SHORT_NEAR_LOW_THRESHOLD_PERCENT) {
                const momentumIsBearish = smartMomentum.score <= expandedBlock.MIN_MOMENTUM_SCORE_SHORT;
                
                if (!momentumIsBearish && !adxOverrideAllowed) {
                  nearExtremeBlocked = true;
                  rejectedByHardGates++;
                  const blockReason = `NEAR_24H_LOW_EXPANDED: SHORT blocked - ${distanceFromLow.toFixed(2)}% from 24h low ($${priceDistance.low24h.toFixed(2)}), momentum_score=${smartMomentum.score.toFixed(0)} (need <=${expandedBlock.MIN_MOMENTUM_SCORE_SHORT}) - neutral momentum is NOT confirmation`;
                  perSymbolGateAttribution.set(symbol, { 
                    gate: 'NEAR_24H_LOW_HARD', 
                    details: blockReason 
                  });
                  
                  logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.GATE} 🚫 ${blockReason}`);
                  
                  await logRejectionWithAI(
                    supabase, userId, symbol,
                    blockReason,
                    {
                      gate: 'NEAR_24H_LOW_HARD',
                      subGate: 'EXPANDED_MOMENTUM_BLOCK',
                      derivedDirection,
                      distanceFromLow: distanceFromLow.toFixed(3),
                      low24h: priceDistance.low24h,
                      expandedThreshold: expandedBlock.SHORT_NEAR_LOW_THRESHOLD_PERCENT,
                      smartMomentumScore: smartMomentum.score.toFixed(1),
                      momentumRequired: expandedBlock.MIN_MOMENTUM_SCORE_SHORT,
                      momentumState: trendData?.momentum?.state || 'unknown',
                      tf1hDir, tf30mDir,
                      wouldPassWith: `momentum_score <= ${expandedBlock.MIN_MOMENTUM_SCORE_SHORT} OR ADX >= ${NEAR_EXTREME_PROTECTION_GATE.ADX_OVERRIDE_THRESHOLD}`,
                    },
                    trendData,
                    riskParams.ai_analysis_enabled !== false,
                    earlyOrderFlowAnalysis
                  );
                  continue;
                }
              }
              
              if (!nearExtremeBlocked && inHardZone && NEAR_EXTREME_PROTECTION_GATE.BLOCK_IN_HARD_ZONE && !adxOverrideAllowed && !ltfSupportsShort) {
                // Hard block - too close to 24h low with no LTF support
                nearExtremeBlocked = true;
                rejectedByHardGates++;
                perSymbolGateAttribution.set(symbol, { 
                  gate: 'NEAR_24H_LOW_HARD', 
                  details: `SHORT blocked: ${distanceFromLow.toFixed(1)}% from 24h low, LTF not bearish` 
                });
                
                const blockReason = `NEAR_24H_LOW_HARD: SHORT blocked - only ${distanceFromLow.toFixed(1)}% above 24h low ($${priceDistance.low24h.toFixed(2)}), 1h=${tf1hDir}, 30m=${tf30mDir} (need LTF bearish for near-low shorts)`;
                logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.GATE} 🚫 ${blockReason}`);
                
                await logRejectionWithAI(
                  supabase, userId, symbol,
                  blockReason,
                  {
                    gate: 'NEAR_24H_LOW_HARD',
                    derivedDirection,
                    distanceFromLow: distanceFromLow.toFixed(2),
                    low24h: priceDistance.low24h,
                    tf1hDir, tf30mDir,
                    adx: adx.toFixed(1),
                    adxSlope: adxSlope.toFixed(2),
                    ltfSupportsShort,
                    hardZoneThreshold: effectiveHardThreshold,
                    softZoneThreshold: effectiveSoftThreshold,
                    relaxationApplied: nearExtremeRelaxationApplied,
                    relaxationTrigger: nearExtremeRelaxationTrigger,
                    wouldPassWith: `LTF (1h or 30m) must be bearish, or ADX >= ${NEAR_EXTREME_PROTECTION_GATE.ADX_OVERRIDE_THRESHOLD}`,
                  },
                  trendData,
                  riskParams.ai_analysis_enabled !== false,
                  earlyOrderFlowAnalysis
                );
                continue;
              } else if (!nearExtremeBlocked && !ltfSupportsShort) {
                // Soft gate - reduce position for near-low shorts without LTF support
                if (adxOverrideAllowed) {
                  nearExtremePositionMultiplier = Math.min(nearExtremePositionMultiplier, NEAR_EXTREME_PROTECTION_GATE.ADX_OVERRIDE_MULTIPLIER);
                  logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} ⚠️ NEAR_24H_LOW ADX OVERRIDE: SHORT ${distanceFromLow.toFixed(1)}% from low, ADX=${adx.toFixed(1)} >= ${NEAR_EXTREME_PROTECTION_GATE.ADX_OVERRIDE_THRESHOLD} - position ${(nearExtremePositionMultiplier * 100).toFixed(0)}%`);
                } else if (useRelaxedThresholds && distanceFromLow > NEAR_EXTREME_PROTECTION_GATE.SHORT_NEAR_LOW_THRESHOLD_PERCENT) {
                  // In relaxed zone but outside default soft zone - use relaxed multiplier
                  nearExtremePositionMultiplier = Math.min(nearExtremePositionMultiplier, relaxConfig.RELAXED_SOFT_MULTIPLIER);
                  logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} 📈 NEAR_24H_LOW RELAXED: SHORT ${distanceFromLow.toFixed(1)}% from low (relaxed threshold: ${effectiveSoftThreshold}%), ${relaxationReason} - position ${(nearExtremePositionMultiplier * 100).toFixed(0)}%`);
                } else if (useRelaxedThresholds && distanceFromLow <= NEAR_EXTREME_PROTECTION_GATE.HARD_ZONE_THRESHOLD_PERCENT) {
                  // In original hard zone but relaxed to transition zone
                  nearExtremePositionMultiplier = Math.min(nearExtremePositionMultiplier, relaxConfig.RELAXED_TRANSITION_MULTIPLIER);
                  logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} 📈 NEAR_24H_LOW RELAXED (transition): SHORT ${distanceFromLow.toFixed(1)}% from low, ${relaxationReason} - position ${(nearExtremePositionMultiplier * 100).toFixed(0)}%`);
                } else {
                  nearExtremePositionMultiplier = Math.min(nearExtremePositionMultiplier, NEAR_EXTREME_PROTECTION_GATE.PROXIMITY_POSITION_MULTIPLIER);
                  logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} ⚠️ NEAR_24H_LOW: SHORT ${distanceFromLow.toFixed(1)}% from low, LTF not bearish - position reduced to ${(nearExtremePositionMultiplier * 100).toFixed(0)}%`);
                }
              }
            }
            
            // Check for longs near 24h high
            if (derivedDirection === 'long' && distanceFromHigh <= effectiveSoftThreshold) {
              const tf1hDir = trendData.timeframes?.['1h']?.trend || trendData.timeframes?.['1h']?.indicators?.emaSignal || "neutral";
              const tf30mDir = trendData.timeframes?.['30m']?.trend || 'neutral';
              const ltfSupportsLong = tf1hDir === 'bullish' || tf30mDir === 'bullish';
              
              const inHardZone = distanceFromHigh <= effectiveHardThreshold;
              const adxOverrideAllowed = adx >= NEAR_EXTREME_PROTECTION_GATE.ADX_OVERRIDE_THRESHOLD;
              
              // ===== REGIME-AWARE EXTREME PROXIMITY BLOCK (LONG near high) =====
              const regimeBlockLong = NEAR_EXTREME_PROTECTION_GATE.REGIME_AWARE_BLOCK;
              if (regimeBlockLong.ENABLED && distanceFromHigh < regimeBlockLong.PROXIMITY_THRESHOLD_PERCENT) {
                const absMomentumScore = Math.abs(smartMomentum.score);
                const absOrderFlowScore = Math.abs(earlyOrderFlowAnalysis?.score ?? 0);
                const adxBypass = adx >= regimeBlockLong.MIN_ADX_TO_BYPASS;
                const momentumBypass = absMomentumScore >= regimeBlockLong.MIN_MOMENTUM_SCORE_TO_BYPASS && smartMomentum.score > 0;
                const orderFlowBypass = absOrderFlowScore >= regimeBlockLong.MIN_ORDER_FLOW_SCORE_TO_BYPASS && (earlyOrderFlowAnalysis?.score ?? 0) > 0;
                
                if (!adxBypass && !momentumBypass && !orderFlowBypass) {
                  nearExtremeBlocked = true;
                  rejectedByHardGates++;
                  perSymbolGateAttribution.set(symbol, { 
                    gate: 'NEAR_24H_HIGH_HARD', 
                    details: `LONG blocked: ${distanceFromHigh.toFixed(2)}% from 24h high (regime-aware: ADX=${adx.toFixed(1)}<${regimeBlockLong.MIN_ADX_TO_BYPASS}, momentum=${smartMomentum.score.toFixed(0)}, OF=${earlyOrderFlowAnalysis?.score?.toFixed(0) ?? 'N/A'})` 
                  });
                  
                  const blockReason = `NEAR_24H_HIGH_REGIME_BLOCK: LONG blocked - only ${distanceFromHigh.toFixed(2)}% below 24h high ($${priceDistance.high24h.toFixed(2)}), ADX=${adx.toFixed(1)}<${regimeBlockLong.MIN_ADX_TO_BYPASS}, sm_score=${smartMomentum.score.toFixed(0)} (need >=${regimeBlockLong.MIN_MOMENTUM_SCORE_TO_BYPASS}), OF=${earlyOrderFlowAnalysis?.score?.toFixed(0) ?? 'N/A'} (need >=${regimeBlockLong.MIN_ORDER_FLOW_SCORE_TO_BYPASS})`;
                  logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.GATE} 🚫 ${blockReason}`);
                  
                  await logRejectionWithAI(
                    supabase, userId, symbol,
                    blockReason,
                    {
                      gate: 'NEAR_24H_HIGH_HARD',
                      subGate: 'REGIME_AWARE_BLOCK',
                      derivedDirection,
                      distanceFromHigh: distanceFromHigh.toFixed(3),
                      high24h: priceDistance.high24h,
                      proximityThreshold: regimeBlockLong.PROXIMITY_THRESHOLD_PERCENT,
                      adx: adx.toFixed(1),
                      adxRequired: regimeBlockLong.MIN_ADX_TO_BYPASS,
                      smartMomentumScore: smartMomentum.score.toFixed(1),
                      momentumRequired: `+${regimeBlockLong.MIN_MOMENTUM_SCORE_TO_BYPASS}`,
                      orderFlowScore: earlyOrderFlowAnalysis?.score?.toFixed(1) ?? 'N/A',
                      orderFlowRequired: `+${regimeBlockLong.MIN_ORDER_FLOW_SCORE_TO_BYPASS}`,
                      tf1hDir, tf30mDir,
                      relaxationApplied: nearExtremeRelaxationApplied,
                      wouldPassWith: `ADX >= ${regimeBlockLong.MIN_ADX_TO_BYPASS} OR momentum >= +${regimeBlockLong.MIN_MOMENTUM_SCORE_TO_BYPASS} OR orderFlow >= +${regimeBlockLong.MIN_ORDER_FLOW_SCORE_TO_BYPASS}`,
                    },
                    trendData,
                    riskParams.ai_analysis_enabled !== false,
                    earlyOrderFlowAnalysis
                  );
                  continue;
                } else {
                  const bypassReason = adxBypass ? `ADX ${adx.toFixed(1)}>=${regimeBlockLong.MIN_ADX_TO_BYPASS}` : momentumBypass ? `momentum ${smartMomentum.score.toFixed(0)}>=${regimeBlockLong.MIN_MOMENTUM_SCORE_TO_BYPASS}` : `orderFlow ${earlyOrderFlowAnalysis?.score?.toFixed(0)}>=${regimeBlockLong.MIN_ORDER_FLOW_SCORE_TO_BYPASS}`;
                  nearExtremePositionMultiplier = Math.min(nearExtremePositionMultiplier, regimeBlockLong.BYPASS_POSITION_MULTIPLIER);
                  logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} ⚠️ NEAR_24H_HIGH REGIME BYPASS: LONG ${distanceFromHigh.toFixed(2)}% from high, allowed via ${bypassReason} - position ${(regimeBlockLong.BYPASS_POSITION_MULTIPLIER * 100).toFixed(0)}%`);
                }
              }
              
              // ===== IMPROVEMENT #3: EXPANDED HARD BLOCK for LONG near high =====
              const expandedBlockLong = NEAR_EXTREME_PROTECTION_GATE.EXPANDED_HARD_BLOCK;
              if (!nearExtremeBlocked && expandedBlockLong?.ENABLED && distanceFromHigh <= expandedBlockLong.LONG_NEAR_HIGH_THRESHOLD_PERCENT) {
                const momentumIsBullish = smartMomentum.score >= expandedBlockLong.MIN_MOMENTUM_SCORE_LONG;
                
                if (!momentumIsBullish && !adxOverrideAllowed) {
                  nearExtremeBlocked = true;
                  rejectedByHardGates++;
                  const blockReason = `NEAR_24H_HIGH_EXPANDED: LONG blocked - ${distanceFromHigh.toFixed(2)}% from 24h high ($${priceDistance.high24h.toFixed(2)}), momentum_score=${smartMomentum.score.toFixed(0)} (need >=${expandedBlockLong.MIN_MOMENTUM_SCORE_LONG}) - neutral momentum is NOT confirmation`;
                  perSymbolGateAttribution.set(symbol, { gate: 'NEAR_24H_HIGH_HARD', details: blockReason });
                  
                  logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.GATE} 🚫 ${blockReason}`);
                  
                  await logRejectionWithAI(
                    supabase, userId, symbol,
                    blockReason,
                    {
                      gate: 'NEAR_24H_HIGH_HARD',
                      subGate: 'EXPANDED_MOMENTUM_BLOCK',
                      derivedDirection,
                      distanceFromHigh: distanceFromHigh.toFixed(3),
                      high24h: priceDistance.high24h,
                      expandedThreshold: expandedBlockLong.LONG_NEAR_HIGH_THRESHOLD_PERCENT,
                      smartMomentumScore: smartMomentum.score.toFixed(1),
                      momentumRequired: expandedBlockLong.MIN_MOMENTUM_SCORE_LONG,
                      momentumState: trendData?.momentum?.state || 'unknown',
                      tf1hDir, tf30mDir,
                      wouldPassWith: `momentum_score >= ${expandedBlockLong.MIN_MOMENTUM_SCORE_LONG} OR ADX >= ${NEAR_EXTREME_PROTECTION_GATE.ADX_OVERRIDE_THRESHOLD}`,
                    },
                    trendData,
                    riskParams.ai_analysis_enabled !== false,
                    earlyOrderFlowAnalysis
                  );
                  continue;
                }
              }
              
              if (!nearExtremeBlocked && inHardZone && NEAR_EXTREME_PROTECTION_GATE.BLOCK_IN_HARD_ZONE && !adxOverrideAllowed && !ltfSupportsLong) {
                nearExtremeBlocked = true;
                rejectedByHardGates++;
                perSymbolGateAttribution.set(symbol, { 
                  gate: 'NEAR_24H_HIGH_HARD', 
                  details: `LONG blocked: ${distanceFromHigh.toFixed(1)}% from 24h high, LTF not bullish` 
                });
                
                const blockReason = `NEAR_24H_HIGH_HARD: LONG blocked - only ${distanceFromHigh.toFixed(1)}% below 24h high ($${priceDistance.high24h.toFixed(2)}), 1h=${tf1hDir}, 30m=${tf30mDir} (need LTF bullish for near-high longs)`;
                logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.GATE} 🚫 ${blockReason}`);
                
                await logRejectionWithAI(
                  supabase, userId, symbol,
                  blockReason,
                  {
                    gate: 'NEAR_24H_HIGH_HARD',
                    derivedDirection,
                    distanceFromHigh: distanceFromHigh.toFixed(2),
                    high24h: priceDistance.high24h,
                    tf1hDir, tf30mDir,
                    adx: adx.toFixed(1),
                    adxSlope: adxSlope.toFixed(2),
                    ltfSupportsLong,
                    hardZoneThreshold: effectiveHardThreshold,
                    softZoneThreshold: effectiveSoftThreshold,
                    relaxationApplied: nearExtremeRelaxationApplied,
                    relaxationTrigger: nearExtremeRelaxationTrigger,
                    wouldPassWith: `LTF (1h or 30m) must be bullish, or ADX >= ${NEAR_EXTREME_PROTECTION_GATE.ADX_OVERRIDE_THRESHOLD}`,
                  },
                  trendData,
                  riskParams.ai_analysis_enabled !== false,
                  earlyOrderFlowAnalysis
                );
                continue;
              } else if (!nearExtremeBlocked && !ltfSupportsLong) {
                if (adxOverrideAllowed) {
                  nearExtremePositionMultiplier = Math.min(nearExtremePositionMultiplier, NEAR_EXTREME_PROTECTION_GATE.ADX_OVERRIDE_MULTIPLIER);
                  logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} ⚠️ NEAR_24H_HIGH ADX OVERRIDE: LONG ${distanceFromHigh.toFixed(1)}% from high, ADX=${adx.toFixed(1)} >= ${NEAR_EXTREME_PROTECTION_GATE.ADX_OVERRIDE_THRESHOLD} - position ${(nearExtremePositionMultiplier * 100).toFixed(0)}%`);
                } else if (useRelaxedThresholds && distanceFromHigh > NEAR_EXTREME_PROTECTION_GATE.LONG_NEAR_HIGH_THRESHOLD_PERCENT) {
                  nearExtremePositionMultiplier = Math.min(nearExtremePositionMultiplier, relaxConfig.RELAXED_SOFT_MULTIPLIER);
                  logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} 📈 NEAR_24H_HIGH RELAXED: LONG ${distanceFromHigh.toFixed(1)}% from high (relaxed threshold: ${effectiveSoftThreshold}%), ${relaxationReason} - position ${(nearExtremePositionMultiplier * 100).toFixed(0)}%`);
                } else if (useRelaxedThresholds && distanceFromHigh <= NEAR_EXTREME_PROTECTION_GATE.HARD_ZONE_THRESHOLD_PERCENT) {
                  nearExtremePositionMultiplier = Math.min(nearExtremePositionMultiplier, relaxConfig.RELAXED_TRANSITION_MULTIPLIER);
                  logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} 📈 NEAR_24H_HIGH RELAXED (transition): LONG ${distanceFromHigh.toFixed(1)}% from high, ${relaxationReason} - position ${(nearExtremePositionMultiplier * 100).toFixed(0)}%`);
                } else {
                  nearExtremePositionMultiplier = Math.min(nearExtremePositionMultiplier, NEAR_EXTREME_PROTECTION_GATE.PROXIMITY_POSITION_MULTIPLIER);
                  logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} ⚠️ NEAR_24H_HIGH: LONG ${distanceFromHigh.toFixed(1)}% from high, LTF not bullish - position reduced to ${(nearExtremePositionMultiplier * 100).toFixed(0)}%`);
                }
              }
            }
          }
        }
        
        // ============= PHASE 12: MOMENTUM REVERSAL PROTECTION =============
        // Expert insight: "Momentum flipping from strongly directional to neutral = reversal risk"
        // Block same-direction entries when momentum has reversed (e.g., was -35, now -9)
        if (MOMENTUM_REVERSAL_PROTECTION.ENABLED) {
          const currentMomentum = smartMomentum.score;
          
          // Query recent signal/position momentum for this symbol
          const momentumLookbackCutoff = new Date(Date.now() - MOMENTUM_REVERSAL_PROTECTION.LOOKBACK_MINUTES * 60 * 1000).toISOString();
          
          const { data: recentSignalWithMomentum } = await supabase
            .from('trading_signals')
            .select('id, signal_type, indicators')
            .eq('user_id', userId)
            .eq('symbol', symbol)
            .gte('created_at', momentumLookbackCutoff)
            .order('created_at', { ascending: false })
            .limit(1);
          
          if (recentSignalWithMomentum && recentSignalWithMomentum.length > 0) {
            const recentSignal = recentSignalWithMomentum[0];
            const previousMomentum = recentSignal.indicators?.smartMomentum?.score ?? recentSignal.indicators?.momentumScore;
            
            if (previousMomentum !== undefined && typeof previousMomentum === 'number') {
              const wasStronglyBearish = previousMomentum <= -MOMENTUM_REVERSAL_PROTECTION.STRONG_MOMENTUM_THRESHOLD;
              const wasStronglyBullish = previousMomentum >= MOMENTUM_REVERSAL_PROTECTION.STRONG_MOMENTUM_THRESHOLD;
              const nowNeutral = Math.abs(currentMomentum) < MOMENTUM_REVERSAL_PROTECTION.NEUTRAL_ZONE_THRESHOLD;
              
              // Check for momentum reversal against intended direction
              let momentumReversalDetected = false;
              let reversalType = '';
              
              // Block short if was strongly bearish but now neutral (momentum lost)
              if (wasStronglyBearish && nowNeutral && derivedDirection === 'short') {
                momentumReversalDetected = true;
                reversalType = 'bearish_to_neutral';
              }
              // Block long if was strongly bullish but now neutral (momentum lost)
              else if (wasStronglyBullish && nowNeutral && derivedDirection === 'long') {
                momentumReversalDetected = true;
                reversalType = 'bullish_to_neutral';
              }
              
              if (momentumReversalDetected && MOMENTUM_REVERSAL_PROTECTION.BLOCK_SAME_DIRECTION) {
                rejectedByHardGates++;
                const blockMsg = `Momentum reversed (${reversalType}): was ${previousMomentum}, now ${currentMomentum}`;
                perSymbolGateAttribution.set(symbol, { gate: 'MOMENTUM_REVERSAL_PROTECTION', details: blockMsg });
                
                if (MOMENTUM_REVERSAL_PROTECTION.LOG_BLOCKS) {
                  logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.GATE} 🚫 MOMENTUM_REVERSAL: ${blockMsg}`);
                  logger.forSymbol(symbol).warn(`   → ${derivedDirection.toUpperCase()} blocked because momentum flipped from strong to neutral`);
                }
                
                await logRejectionWithAI(
                  supabase, userId, symbol,
                  `MOMENTUM_REVERSAL_PROTECTION: ${blockMsg}`,
                  {
                    gate: "MOMENTUM_REVERSAL_PROTECTION",
                    reversalType,
                    previousMomentum,
                    currentMomentum,
                    derivedDirection,
                    thresholds: {
                      strongMomentumThreshold: MOMENTUM_REVERSAL_PROTECTION.STRONG_MOMENTUM_THRESHOLD,
                      neutralZoneThreshold: MOMENTUM_REVERSAL_PROTECTION.NEUTRAL_ZONE_THRESHOLD,
                    }
                  },
                  trendData,
                  riskParams.ai_analysis_enabled !== false,
                  earlyOrderFlowAnalysis
                );
                continue;
              }
            }
          }
        }
        
        // ============= PHASE 14: RANGING MARKET DETECTION & PROTECTION =============
        // Expert insight: System keeps checking for signals in ranging markets, potentially allowing low-quality entries
        // When ALL timeframes are neutral for extended periods, pause non-range strategies
        let isInRangingMarket = false;
        let rangingMarketPositionMultiplier = 1.0;
        
        if (RANGING_MARKET_PROTECTION.ENABLED) {
          // Check if all timeframes are neutral/low confidence
          const htf4hConf = trendData.timeframes?.['4h']?.confidence ?? 0;
          const htf1hConf = trendData.timeframes?.['1h']?.confidence ?? 0;
          const htf30mConf = trendData.timeframes?.['30m']?.confidence ?? 0;
          
          const all4hNeutral = htfTrend4h === 'neutral' || htf4hConf < RANGING_MARKET_PROTECTION.MIN_CONFIDENCE_TO_BREAK_RANGE;
          const all1hNeutral = htfTrend1h === 'neutral' || htf1hConf < RANGING_MARKET_PROTECTION.MIN_CONFIDENCE_TO_BREAK_RANGE;
          const adxBelowThreshold = adx < RANGING_MARKET_PROTECTION.NEUTRAL_ADX_THRESHOLD;
          
          // Ranging market = both 4h and 1h are neutral + ADX is below threshold
          isInRangingMarket = all4hNeutral && all1hNeutral && adxBelowThreshold;
          
          // ===== IMPROVEMENT #1: HARD BLOCK - NO-TRADE RANGE REGIME =====
          // When primary_trend=neutral AND momentum_state IN (mixed,none) AND ADX < 28 → HARD BLOCK
          // This regime statistically does not produce follow-through. Noise > edge.
          const hardBlock = RANGING_MARKET_PROTECTION.HARD_BLOCK;
          if (hardBlock?.ENABLED) {
            const momentumState = trendData?.momentum?.state || 'none';
            const primaryTrend = trendData?.primaryTrend || 'neutral';
            const absMomentumScore = Math.abs(smartMomentum?.score ?? 0);
            
            const trendIsNeutral = primaryTrend === 'neutral' || primaryTrend === 'ranging';
            const momentumHasNoEdge = hardBlock.NO_EDGE_MOMENTUM_STATES.includes(momentumState);
            const adxTooLow = adx < hardBlock.MAX_ADX;
            const momentumScoreTooLow = !hardBlock.REQUIRE_LOW_MOMENTUM_SCORE || absMomentumScore < hardBlock.MAX_ABS_MOMENTUM_SCORE;
            
            if (trendIsNeutral && momentumHasNoEdge && adxTooLow && momentumScoreTooLow) {
              // Check if this is a mean reversion entry (allowed through)
              const isMREntry = isMeanReversionStrategy(activeStrategyName || '');
              
              if (!isMREntry) {
                rejectedByHardGates++;
                const blockReason = `NO_TRADE_RANGE_REGIME: HARD BLOCK - primaryTrend=${primaryTrend}, momentum=${momentumState}, ADX=${adx.toFixed(1)}<${hardBlock.MAX_ADX}, |score|=${absMomentumScore.toFixed(0)}<${hardBlock.MAX_ABS_MOMENTUM_SCORE} → no statistical edge, noise dominates`;
                perSymbolGateAttribution.set(symbol, { gate: 'NO_TRADE_RANGE_REGIME', details: blockReason });
                
                logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.GATE} 🚫 ${blockReason}`);
                
                await logRejectionWithAI(supabase, userId, symbol, blockReason, {
                  gate: 'NO_TRADE_RANGE_REGIME',
                  derivedDirection,
                  primaryTrend,
                  momentumState,
                  momentumScore: smartMomentum?.score?.toFixed(1),
                  adx: adx.toFixed(1),
                  adxSlope: adxSlope.toFixed(2),
                  maxAdxThreshold: hardBlock.MAX_ADX,
                  maxAbsMomentumScore: hardBlock.MAX_ABS_MOMENTUM_SCORE,
                  wouldPassWith: `ADX >= ${hardBlock.MAX_ADX} OR momentum_state=confirmed/building OR |momentum_score| >= ${hardBlock.MAX_ABS_MOMENTUM_SCORE}`,
                }, trendData, riskParams.ai_analysis_enabled !== false, earlyOrderFlowAnalysis);
                continue;
              } else {
                logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} 📊 NO_TRADE_RANGE_REGIME: Would block but allowing Mean Reversion entry`);
              }
            }
          }
          
          // ===== IMPROVEMENT #2: MINIMUM ATR FILTER =====
          // Block when volatility is too compressed for fee-positive expectancy
          const atrFilter = RANGING_MARKET_PROTECTION.MIN_ATR_FILTER;
          if (atrFilter?.ENABLED) {
            const currentPrice = trendData?.currentPrice || 0;
            const currentATR = trendData?.volatility?.atr ?? 0;
            const atrPercent24h = currentPrice > 0 ? (currentATR / currentPrice) * 100 : 0;
            
            if (atrPercent24h > 0 && atrPercent24h < atrFilter.MIN_ATR_PERCENT) {
              const isMREntry = atrFilter.ALLOW_MR_BYPASS && isMeanReversionStrategy(activeStrategyName || '');
              
              if (!isMREntry) {
                rejectedByHardGates++;
                const blockReason = `LOW_ATR_BLOCK: ATR=${atrPercent24h.toFixed(2)}% < ${atrFilter.MIN_ATR_PERCENT}% minimum → compressed volatility, negative expectancy after fees (0.2% round-trip)`;
                perSymbolGateAttribution.set(symbol, { gate: 'LOW_ATR_BLOCK', details: blockReason });
                
                logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.GATE} 🚫 ${blockReason}`);
                
                await logRejectionWithAI(supabase, userId, symbol, blockReason, {
                  gate: 'LOW_ATR_BLOCK',
                  derivedDirection,
                  atrPercent: atrPercent24h.toFixed(3),
                  minAtrRequired: atrFilter.MIN_ATR_PERCENT,
                  currentPrice: currentPrice.toFixed(2),
                  atr: currentATR.toFixed(4),
                  wouldPassWith: `ATR% >= ${atrFilter.MIN_ATR_PERCENT}%`,
                }, trendData, riskParams.ai_analysis_enabled !== false, earlyOrderFlowAnalysis);
                continue;
              } else {
                logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} 📊 LOW_ATR: ATR=${atrPercent24h.toFixed(2)}% < ${atrFilter.MIN_ATR_PERCENT}% but allowing Mean Reversion`);
              }
            }
          }
          
          if (isInRangingMarket) {
            rangingMarketPositionMultiplier = RANGING_MARKET_PROTECTION.RANGING_POSITION_MULTIPLIER;
            if (RANGING_MARKET_PROTECTION.LOG_BLOCKS) {
              logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} 📊 RANGING MARKET DETECTED: 4h=${htfTrend4h}(${htf4hConf}%), 1h=${htfTrend1h}(${htf1hConf}%), ADX=${adx.toFixed(1)}`);
              logger.forSymbol(symbol).info(`   → Position reduced to ${(rangingMarketPositionMultiplier * 100).toFixed(0)}%, only range strategies allowed`);
            }
          }
        }
        
        // Expert insight: "ADX > 45 with declining slope often signals trend maturity, not opportunity"
        // Requires pullback confirmation for entries during mature trends
        let matureTrendPositionMultiplier = 1.0;
        if (regimeIsMatureTrend && regimeRequirePullback) {
          // Check if we have a valid pullback
          const hasPullbackConfirmation = smartPullback.isPullback && 
                                          smartPullback.pullbackDepth >= 0.5 &&
                                          smartPullback.isValidPullback;
          
          if (!hasPullbackConfirmation) {
            // No pullback in mature trend - reduce position significantly or block
            matureTrendPositionMultiplier = 0.25;  // 25% position for no pullback
            logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.GATE} ⚠️ MATURE_TREND: ADX=${adx.toFixed(1)} with declining slope - no pullback confirmation`);
            logger.forSymbol(symbol).warn(`   → Position reduced to 25% for safety (alternative to blocking)`);
          } else {
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.ENTRY} ✅ MATURE_TREND with pullback confirmation: depth=${smartPullback.pullbackDepth.toFixed(1)}%`);
          }
        }
        
        // ============= PHASE 11: MOMENTUM-DIRECTION ALIGNMENT CHECK =============
        // Expert insight: "Neutral" must be tightly bounded (-10 to +10), not loosely defined
        // Ensures momentum score aligns with intended trade direction
        // In strong ADX (>= 40), allow neutral momentum but NEVER opposite
        // In weaker ADX (< 40), require aligned or neutral momentum
        // 
        // EARLY TREND DETECTION EXCEPTION:
        // If the regime trend direction (1h) agrees with trade direction but momentum is lagging,
        // allow entry with reduced position. Momentum often lags price action in early trends.
        if (MOMENTUM_DIRECTION_ALIGNMENT.ENABLED) {
          const momentumScore = smartMomentum.score;
          const isNeutralMomentum = momentumScore >= MOMENTUM_DIRECTION_ALIGNMENT.NEUTRAL_MIN && 
                                    momentumScore <= MOMENTUM_DIRECTION_ALIGNMENT.NEUTRAL_MAX;
          
          // ===== ARCHITECTURAL FIX: ADX can override NEUTRAL momentum, but NOT accelerating opposing momentum =====
          // This fixes the BNBUSDT bug where ADX=57.7 allowed SHORT into bullish accelerating momentum
          const momentumSlope = trendData?.momentum?.macdSlope ?? (fullAdxResult.adxSlope ?? 0);
          const isMomentumAccelerating = 
            (derivedDirection === 'short' && momentumSlope > 0 && momentumScore > MOMENTUM_SLOPE_GATE.MIN_OPPOSING_SCORE_FOR_SLOPE_CHECK) ||
            (derivedDirection === 'long' && momentumSlope < 0 && momentumScore < -MOMENTUM_SLOPE_GATE.MIN_OPPOSING_SCORE_FOR_SLOPE_CHECK);
          
          // ADX can only override neutral momentum, not accelerating opposing momentum
          const isStrongADX = adx >= MOMENTUM_DIRECTION_ALIGNMENT.ALLOW_NEUTRAL_ABOVE_ADX && !isMomentumAccelerating;
          
          // ===== MOMENTUM STATE INFLUENCE (PHASE 2 FIX) =====
          // Adjust opposite thresholds based on momentum state:
          // - "confirmed" state: tighter thresholds (make bypass harder)
          // - "mixed" state: looser thresholds (allow more flexibility)
          const momentumState = trendData?.momentum?.state || "none";
          let strongOppositeLongThreshold = MOMENTUM_DIRECTION_ALIGNMENT.STRONG_OPPOSITE_LONG;
          let strongOppositeShortThreshold = MOMENTUM_DIRECTION_ALIGNMENT.STRONG_OPPOSITE_SHORT;
          
          if (momentumState === "confirmed") {
            // Tighter thresholds when momentum is confirmed
            strongOppositeLongThreshold += MOMENTUM_DIRECTION_ALIGNMENT.CONFIRMED_STATE_ADJUSTMENT;  // -20 + (-5) = -25
            strongOppositeShortThreshold -= MOMENTUM_DIRECTION_ALIGNMENT.CONFIRMED_STATE_ADJUSTMENT; // +20 - (-5) = +15
          } else if (momentumState === "mixed") {
            // Looser thresholds when momentum is mixed (allow more flexibility)
            strongOppositeLongThreshold += MOMENTUM_DIRECTION_ALIGNMENT.MIXED_STATE_ADJUSTMENT;      // -20 + 5 = -15
            strongOppositeShortThreshold -= MOMENTUM_DIRECTION_ALIGNMENT.MIXED_STATE_ADJUSTMENT;     // +20 - 5 = +25
          }
          
          // Store neutral state for Phase 2 subordination
          (trendData as any).phase1NeutralMomentum = isNeutralMomentum;
          
          // Check for momentum-direction mismatch
          let momentumDirectionMismatch = false;
          let mismatchReason = '';
          let earlyTrendBypassApplied = false;
          let earlyTrendPositionMultiplier = 1.0;
          
          // EARLY TREND DETECTION: If regime direction agrees, allow lagging momentum
          // NOTE: regimeTrendDirection is from masterRegime.trendDirection (1h structural bias)
          const trendDirectionAgrees = (
            (derivedDirection === 'long' && regimeTrendDirection === 'bullish') ||
            (derivedDirection === 'short' && regimeTrendDirection === 'bearish')
          );
          
          if (derivedDirection === 'long') {
            // For LONG: block if momentum strongly negative (using state-adjusted threshold)
            if (momentumScore < strongOppositeLongThreshold) {
              // Check for early trend detection exception with graduated position scaling
              // When 1h trend is bullish, allow LONG entries even with lagging momentum
              if (trendDirectionAgrees) {
                earlyTrendBypassApplied = true;
                // Graduated position sizing based on how far momentum lags
                if (momentumScore >= -30) {
                  earlyTrendPositionMultiplier = 0.7; // 70% for mild lag (-20 to -30)
                } else if (momentumScore >= -50) {
                  earlyTrendPositionMultiplier = 0.5; // 50% for significant lag (-30 to -50)
                } else {
                  // Below -50 is too extreme - block even with trend agreement
                  earlyTrendBypassApplied = false;
                  momentumDirectionMismatch = true;
                  mismatchReason = `LONG blocked: momentum ${momentumScore} < -50 (too extreme even with bullish trend)`;
                }
                
                if (earlyTrendBypassApplied) {
                  logger.forSymbol(symbol).info(`${LOG_CATEGORIES.MOMENTUM} 🌅 EARLY TREND ENTRY: LONG allowed despite negative momentum (${momentumScore})`);
                  logger.forSymbol(symbol).info(`   → 1h trend is bullish (${regimeTrendDirection}), momentum will catch up - position at ${(earlyTrendPositionMultiplier * 100).toFixed(0)}%`);
                }
              } else {
                momentumDirectionMismatch = true;
                mismatchReason = `LONG blocked: momentum ${momentumScore} < ${MOMENTUM_DIRECTION_ALIGNMENT.STRONG_OPPOSITE_LONG}`;
              }
            }
            // In weak ADX, also require positive or neutral momentum
            else if (!isStrongADX && !isNeutralMomentum && momentumScore < 0) {
              // Only block if momentum is significantly negative (between -10 and -20)
              if (momentumScore < MOMENTUM_DIRECTION_ALIGNMENT.NEUTRAL_MIN) {
                // Check for early trend detection exception
                if (trendDirectionAgrees) {
                  earlyTrendBypassApplied = true;
                  earlyTrendPositionMultiplier = 0.7; // 70% position for weak ADX early entries
                  logger.forSymbol(symbol).info(`${LOG_CATEGORIES.MOMENTUM} 🌅 EARLY TREND ENTRY: LONG allowed despite negative momentum in weak ADX`);
                  logger.forSymbol(symbol).info(`   → momentum=${momentumScore}, ADX=${adx.toFixed(1)}, 1h trend=${regimeTrendDirection} - reducing position to 70%`);
                } else {
                  momentumDirectionMismatch = true;
                  mismatchReason = `LONG blocked (weak ADX=${adx.toFixed(1)}): momentum ${momentumScore} is negative but below neutral zone`;
                }
              }
            }
          } else if (derivedDirection === 'short') {
            // For SHORT: block if momentum strongly positive
            if (momentumScore > MOMENTUM_DIRECTION_ALIGNMENT.STRONG_OPPOSITE_SHORT) {
              // Check for early trend detection exception with graduated position scaling
              if (trendDirectionAgrees) {
                earlyTrendBypassApplied = true;
                // Graduated position sizing based on how far momentum lags
                if (momentumScore <= 30) {
                  earlyTrendPositionMultiplier = 0.7; // 70% for mild lag (+20 to +30)
                } else if (momentumScore <= 50) {
                  earlyTrendPositionMultiplier = 0.5; // 50% for significant lag (+30 to +50)
                } else {
                  // Above +50 is too extreme - block even with trend agreement
                  earlyTrendBypassApplied = false;
                  momentumDirectionMismatch = true;
                  mismatchReason = `SHORT blocked: momentum ${momentumScore} > +50 (too extreme even with bearish trend)`;
                }
                
                if (earlyTrendBypassApplied) {
                  logger.forSymbol(symbol).info(`${LOG_CATEGORIES.MOMENTUM} 🌅 EARLY TREND ENTRY: SHORT allowed despite positive momentum (${momentumScore})`);
                  logger.forSymbol(symbol).info(`   → 1h trend is bearish (${regimeTrendDirection}), momentum will catch up - position at ${(earlyTrendPositionMultiplier * 100).toFixed(0)}%`);
                }
              } else {
                momentumDirectionMismatch = true;
                mismatchReason = `SHORT blocked: momentum ${momentumScore} > ${MOMENTUM_DIRECTION_ALIGNMENT.STRONG_OPPOSITE_SHORT}`;
              }
            }
            // In weak ADX, also require negative or neutral momentum
            else if (!isStrongADX && !isNeutralMomentum && momentumScore > 0) {
              // Only block if momentum is significantly positive (between +10 and +20)
              if (momentumScore > MOMENTUM_DIRECTION_ALIGNMENT.NEUTRAL_MAX) {
                // Check for early trend detection exception
                if (trendDirectionAgrees) {
                  earlyTrendBypassApplied = true;
                  earlyTrendPositionMultiplier = 0.7;
                  logger.forSymbol(symbol).info(`${LOG_CATEGORIES.MOMENTUM} 🌅 EARLY TREND ENTRY: SHORT allowed despite positive momentum in weak ADX`);
                  logger.forSymbol(symbol).info(`   → momentum=${momentumScore}, ADX=${adx.toFixed(1)}, 1h trend=${regimeTrendDirection} - reducing position to 70%`);
                } else {
                  momentumDirectionMismatch = true;
                  mismatchReason = `SHORT blocked (weak ADX=${adx.toFixed(1)}): momentum ${momentumScore} is positive but above neutral zone`;
                }
              }
            }
          }
          
          // Track early trend bypass for position sizing later
          if (earlyTrendBypassApplied) {
            // Store the multiplier to apply later during signal generation
            (trendData as any).earlyTrendPositionMultiplier = earlyTrendPositionMultiplier;
          }
          
          if (momentumDirectionMismatch) {
            rejectedByHardGates++;
            perSymbolGateAttribution.set(symbol, { 
              gate: 'MOMENTUM_DIRECTION_OPPOSING', 
              details: mismatchReason 
            });
            
            logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.GATE} 🚫 MOMENTUM_DIRECTION_MISMATCH: ${mismatchReason}`);
            logger.forSymbol(symbol).warn(`   → ADX=${adx.toFixed(1)}, isStrongADX=${isStrongADX}, neutralZone=[${MOMENTUM_DIRECTION_ALIGNMENT.NEUTRAL_MIN}, ${MOMENTUM_DIRECTION_ALIGNMENT.NEUTRAL_MAX}]`);
            
            await logRejectionWithAI(
              supabase, userId, symbol,
              `MOMENTUM_DIRECTION_MISMATCH: ${mismatchReason}`,
              {
                gate: "MOMENTUM_DIRECTION_OPPOSING",
                blockReasonCode: "MOMENTUM_DIRECTION_MISMATCH",
                primaryGateFailed: derivedDirection === 'long' ? "long_negative_momentum" : "short_positive_momentum",
                derivedDirection,
                momentumScore,
                momentumDirection: momentumScore > 10 ? "bullish" : momentumScore < -10 ? "bearish" : "neutral",
                momentumState: trendData?.momentum?.state || "none",
                adx: adx.toFixed(1),
                isStrongADX,
                isNeutralMomentum,
                thresholds: {
                  strongOppositeLong: MOMENTUM_DIRECTION_ALIGNMENT.STRONG_OPPOSITE_LONG,
                  strongOppositeShort: MOMENTUM_DIRECTION_ALIGNMENT.STRONG_OPPOSITE_SHORT,
                  neutralMin: MOMENTUM_DIRECTION_ALIGNMENT.NEUTRAL_MIN,
                  neutralMax: MOMENTUM_DIRECTION_ALIGNMENT.NEUTRAL_MAX,
                  allowNeutralAboveADX: MOMENTUM_DIRECTION_ALIGNMENT.ALLOW_NEUTRAL_ABOVE_ADX,
                }
              },
              trendData,
              riskParams.ai_analysis_enabled !== false,
              earlyOrderFlowAnalysis
            );
            continue;
          }
          
          // Log successful momentum-direction alignment
          const alignmentStatus = isNeutralMomentum ? 'neutral' : (
            (derivedDirection === 'long' && momentumScore > 0) || 
            (derivedDirection === 'short' && momentumScore < 0) ? 'aligned' : 'weak'
          );
          logger.forSymbol(symbol).debug(`${LOG_CATEGORIES.MOMENTUM} ✅ MOMENTUM-DIRECTION: ${alignmentStatus} (momentum=${momentumScore}, direction=${derivedDirection}, ADX=${adx.toFixed(1)})`);
        }
        
        // ============= PHASE 2: ADX-AWARE MOMENTUM THRESHOLD =============
        // Get effective momentum threshold based on ADX level
        const masterMomentumThreshold = getEffectiveMomentumThreshold(adx, fullAdxResult.adxSlope ?? 0);
        if (masterMomentumThreshold.adjustmentType !== 'default') {
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.MOMENTUM} 📊 MOMENTUM THRESHOLD: ${masterMomentumThreshold.threshold} (${masterMomentumThreshold.adjustmentType}), canBlock=${masterMomentumThreshold.canBlock}`);
        }
        
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
        // PHASE 2: Use regime-aware momentum threshold
        // When master regime indicates strong trend, use regime gate override (which may be 0)
        // Otherwise fall back to ADX-aware threshold or user setting
        const minMomentumScore = isRegimeOverrideActive 
          ? Math.min(regimeMomentumMinimum, masterMomentumThreshold.threshold)  // Regime minimum or ADX-aware, whichever is lower
          : (riskParams.min_momentum_score ?? 30);
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
          
          // CENTRALIZED: Use shared extractor for StochRSI K
          const stochRsiK = extractStochRsiK(trendData, '1h');
          
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
              derivedDirection,
              direction: smartMomentum.direction,
              momentumScore: smartMomentum.score,
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
        
        // NEW: Strong ADX Override for Momentum Weakening Gate
        // If ADX is >= 30 and rising (or very strong), the trend is confirmed enough to bypass the weakening gate
        // This prevents blocking entries in strong trends where momentum score may be slightly negative
        const momentumWeakeningAdxSlope = fullAdxResult?.adxSlope ?? 0;
        const isVeryStrongAdxForWeakening = adx >= (STRONG_ADX_OVERRIDE_PARAMS.VERY_STRONG_ADX ?? 35);
        const isNearVeryStrongAdxForWeakening = (
          adx >= (STRONG_ADX_OVERRIDE_PARAMS.NEAR_VERY_STRONG_ADX ?? 33) &&
          adx < (STRONG_ADX_OVERRIDE_PARAMS.VERY_STRONG_ADX ?? 35) &&
          momentumWeakeningAdxSlope >= (STRONG_ADX_OVERRIDE_PARAMS.NEAR_VERY_STRONG_MIN_SLOPE ?? -0.3)
        );
        const adxRisingForWeakeningBypass = smartAdxRising || isVeryStrongAdxForWeakening || isNearVeryStrongAdxForWeakening;
        const hasStrongADXOverrideForWeakening = (
          STRONG_ADX_OVERRIDE_PARAMS.ENABLED &&
          adx >= STRONG_ADX_OVERRIDE_PARAMS.MIN_ADX &&
          adxRisingForWeakeningBypass &&
          !adxExhaustion.isExhausted  // Don't override if ADX is exhausting
        );
        
        if (hasStrongADXOverrideForWeakening && isMomentumWeakeningAgainstTrade) {
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} 💪 STRONG ADX OVERRIDE: Bypassing momentum weakening gate (ADX=${adx.toFixed(1)}, slope=${momentumWeakeningAdxSlope.toFixed(3)}, rising=${smartAdxRising}, score=${smartMomentum.score})`);
        }
        
        if (regimeAwareEnabled && isMomentumWeakeningAgainstTrade && Math.abs(smartMomentum.score) < minMomentumScore && !hasStrongADXOverrideForWeakening) {
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
              components: smartMomentum.components,
              strongAdxOverrideChecked: true,
              strongAdxOverrideApplied: false,
              adx: adx.toFixed(1),
              adxSlope: momentumWeakeningAdxSlope.toFixed(3),
              adxRising: smartAdxRising,
              isExhausted: adxExhaustion.isExhausted
            },
            trendData,
            riskParams.ai_analysis_enabled !== false,
            earlyOrderFlowAnalysis
          );
          continue;
        }
        
        // Gate 3: Block entries in EXHAUSTED regime (smart regime classification)
        // NOTE: Continuation mode is already checked above before MOMENTUM_EXHAUSTED gate
        // NEW: Allow momentum override if ALL safety conditions pass
        // Track override state for later position sizing
        let momentumExhaustionOverrideApplied = false;
        let momentumExhaustionPositionMultiplier = 1.0;
        let momentumExhaustionStopMultiplier = 1.0;
        
        if (regimeAwareEnabled && smartRegime.regime === "EXHAUSTED" && !qualifiesForContinuationMode) {
          const overrideParams = MOMENTUM_EXHAUSTION_OVERRIDE_PARAMS;
          let allowMomentumOverride = false;
          
          if (overrideParams.ENABLED) {
            const adxValue = adx || 0;
            const momentumState = trendData.momentum?.state || "none";
            // CENTRALIZED: Use shared extractor for StochRSI K
            const stoch4h = extractStochRsiK(trendData, '4h');
            const trend1h = trendData.timeframes?.['1h'];
            const trend30m = trendData.timeframes?.['30m'];
            
            // Calculate exhaustion age proxy: if regimeScore < 70, it's been a while (mature)
            const exhaustionMature = smartRegime.regimeScore < overrideParams.MATURE_EXHAUSTION_SCORE_THRESHOLD;
            const estimatedAge = exhaustionMature ? 45 : 15; // Simplified proxy
            
            // ===== SAFETY CHECKS =====
            // Gap 1: StochRSI absolute floor/ceiling protection
            const stochSafe = derivedDirection === "short" 
              ? stoch4h > overrideParams.BLOCK_IF_STOCHRSI_K_BELOW
              : stoch4h < overrideParams.BLOCK_IF_STOCHRSI_K_ABOVE;
            
            // Gap 2: Strict 1h alignment (MUST match, not optional)
            const trend1hDirection = trend1h?.trend?.toLowerCase() || trend1h?.direction?.toLowerCase() || "";
            const has1hAlignment = trend1hDirection === derivedDirection.toLowerCase();
            
            // Gap 3: Time-in-regime constraint
            const isExhaustionMature = estimatedAge >= overrideParams.MIN_EXHAUSTION_AGE_MINUTES;
            
            // Core requirements
            const hasStrongADX = adxValue >= overrideParams.MIN_ADX;
            const hasMomentumConfirmed = momentumState === overrideParams.REQUIRED_MOMENTUM_STATE;
            
            // ===== DETERMINE IF OVERRIDE ALLOWED =====
            allowMomentumOverride = 
              hasMomentumConfirmed &&
              hasStrongADX &&
              has1hAlignment &&
              stochSafe &&
              isExhaustionMature;
            
            if (allowMomentumOverride) {
              // Check for 30m bonus
              const trend30mDirection = trend30m?.trend?.toLowerCase() || trend30m?.direction?.toLowerCase() || "";
              const has30mAlignment = trend30mDirection === derivedDirection.toLowerCase();
              
              // Calculate position multiplier
              let calcPositionMultiplier: number = overrideParams.POSITION_SIZE_MULTIPLIER;
              if (has30mAlignment && overrideParams.ALLOW_30M_AS_BONUS) {
                calcPositionMultiplier = Math.min(
                  overrideParams.MAX_POSITION_WITH_30M_BONUS,
                  overrideParams.POSITION_SIZE_MULTIPLIER + overrideParams.BONUS_30M_POSITION_INCREASE
                );
              }
              
              // Store for later application
              momentumExhaustionOverrideApplied = true;
              momentumExhaustionPositionMultiplier = calcPositionMultiplier;
              momentumExhaustionStopMultiplier = overrideParams.STOP_MULTIPLIER;
              
              logger.forSymbol(symbol).info(`⚡ MOMENTUM OVERRIDE: Bypassing regime exhaustion (score: ${smartRegime.regimeScore})`);
              logger.forSymbol(symbol).info(`   ADX=${adxValue.toFixed(1)}, momentum=${momentumState}, stoch4h=${stoch4h.toFixed(1)}`);
              logger.forSymbol(symbol).info(`   1h_aligned=${has1hAlignment}, 30m_aligned=${has30mAlignment}`);
              logger.forSymbol(symbol).info(`   Position: ${(calcPositionMultiplier * 100).toFixed(0)}%, Stop: ${(overrideParams.STOP_MULTIPLIER * 100).toFixed(0)}%`);
            } else {
              // Log detailed override failure reasons
              logger.forSymbol(symbol).debug(`   Override check failed: ADX=${adxValue.toFixed(1)} (need>=${overrideParams.MIN_ADX}), momentum=${momentumState} (need=confirmed)`);
              logger.forSymbol(symbol).debug(`   Safety: 1h_aligned=${has1hAlignment}, stoch4h=${stoch4h.toFixed(1)} (safe=${stochSafe}), mature=${isExhaustionMature}`);
            }
          }
          
          // If override not allowed, reject
          if (!allowMomentumOverride) {
            rejectedByHardGates++;
            perSymbolGateAttribution.set(symbol, { 
              gate: 'REGIME_EXHAUSTED', 
              details: `${smartRegime.reason} (override conditions not met)` 
            });
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} SMART REGIME GATE: Market regime EXHAUSTED - blocking new entries`);
            const overrideParams = MOMENTUM_EXHAUSTION_OVERRIDE_PARAMS;
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
                continuationModeRejection: continuationModeResult?.reason || "N/A",
                overrideAttempted: overrideParams.ENABLED,
                overrideConditions: overrideParams.ENABLED ? {
                  adxCheck: { value: adx, required: overrideParams.MIN_ADX, passed: adx >= overrideParams.MIN_ADX },
                  momentumCheck: { value: trendData.momentum?.state, required: "confirmed", passed: trendData.momentum?.state === "confirmed" },
                  stochSafe: { value: trendData.stochasticRsi?.['4h']?.k, safeForDirection: derivedDirection === "short" ? `>${overrideParams.BLOCK_IF_STOCHRSI_K_BELOW}` : `<${overrideParams.BLOCK_IF_STOCHRSI_K_ABOVE}` },
                  alignment1h: { checked: true },
                  exhaustionMature: { regimeScore: smartRegime.regimeScore, threshold: overrideParams.MATURE_EXHAUSTION_SCORE_THRESHOLD }
                } : undefined
              },
              trendData,
              riskParams.ai_analysis_enabled !== false,
              earlyOrderFlowAnalysis
            );
            continue;
          }
          // If override allowed, continue processing (don't reject)
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
        
        // ============= MEAN REVERSION EARLY DETECTION (BEFORE PRE_RECOVERY GATE) =============
        // CRITICAL: Runs BEFORE PRE_RECOVERY to potentially flip direction for extreme oversold/overbought
        // This allows mean reversion to suggest LONG when direction would be SHORT at extreme oversold
        // PRE-RECOVERY MR OVERRIDE: When in pre-recovery with extreme exhaustion opposite to trend,
        // allow direction flip with stacked position sizing (~32.5% of normal)
        const earlyMeanReversionSignal = MEAN_REVERSION_CONFIG.ENABLED ? detectExhaustion(trendData) : null;
        let meanReversionDirectionFlipApplied = false;
        let originalDerivedDirection = derivedDirection;
        let preRecoveryMROverrideApplied = false;
        let preRecoveryMRPositionMultiplier = 1.0;
        
        // DIAGNOSTIC: Always log raw MR detection values for debugging
        // CENTRALIZED: Use shared extractor for StochRSI K
        const stochK4h = extractStochRsiK(trendData, '4h');
        const rsi4h = trendData?.timeframes?.['4h']?.indicators?.rsi ?? 
                      trendData?.rsi?.['4h'] ?? null;
        logger.forSymbol(symbol).debug(
          `[MEAN_REVERSION] Raw detection: detected=${earlyMeanReversionSignal?.detected ?? 'N/A'}, ` +
          `allowed=${earlyMeanReversionSignal?.allowed ?? 'N/A'}, ` +
          `isExtremeExhaustion=${earlyMeanReversionSignal?.isExtremeExhaustion ?? 'N/A'}, ` +
          `phase=${earlyMeanReversionSignal?.trendPhase ?? 'N/A'}/${earlyMeanReversionSignal?.expansionState ?? 'N/A'}, ` +
          `4hK=${stochK4h?.toFixed(1) ?? 'N/A'}, 4hRSI=${rsi4h?.toFixed(1) ?? 'N/A'}, ` +
          `derivedDir=${derivedDirection}`
        );
        
        if (earlyMeanReversionSignal?.detected && earlyMeanReversionSignal?.allowed) {
          // Log mean reversion detection regardless of direction match
          logger.forSymbol(symbol).info(
            `${LOG_CATEGORIES.ENTRY} 🔄 MEAN_REVERSION EARLY CHECK: ${earlyMeanReversionSignal.direction?.toUpperCase() || 'NONE'} exhaustion detected ` +
            `(score=${earlyMeanReversionSignal.exhaustionScore}, phase=${earlyMeanReversionSignal.trendPhase}, ` +
            `preRecoveryOverride=${earlyMeanReversionSignal.preRecoveryOverrideAllowed})`
          );
          logger.forSymbol(symbol).info(`   Triggers: ${earlyMeanReversionSignal.triggers.slice(0, 3).join(' | ')}`);
          
          // Check if mean reversion suggests OPPOSITE direction to derived direction
          // This is the key fix: allow direction flip when at extreme exhaustion
          const suggestsOppositeDirection = 
            (earlyMeanReversionSignal.direction === 'long' && derivedDirection === 'short') ||
            (earlyMeanReversionSignal.direction === 'short' && derivedDirection === 'long');
          
          if (suggestsOppositeDirection && earlyMeanReversionSignal.exhaustionScore >= 70) {
            // ============= PRE-RECOVERY MR OVERRIDE =============
            // Special handling when in pre-recovery: apply stacked position multipliers
            // Pre-recovery reduction (35%) * MR extreme exhaustion (50%) = ~32.5% of normal
            if (isPreRecovery && earlyMeanReversionSignal.preRecoveryOverrideAllowed) {
              preRecoveryMROverrideApplied = true;
              // Stack: pre-recovery reduction (65%) * MR extreme exhaustion (50%) = 32.5%
              const preRecoveryReduction = 1 - PRE_RECOVERY_PARAMS.POSITION_SIZE_REDUCTION; // 0.65
              const mrExtremeReduction = MEAN_REVERSION_CONFIG.EXTREME_EXHAUSTION.POSITION_SIZE_MULTIPLIER; // 0.50
              preRecoveryMRPositionMultiplier = preRecoveryReduction * mrExtremeReduction; // ~0.325
              
              logger.forSymbol(symbol).info(
                `${LOG_CATEGORIES.SUCCESS} 🔄 PRE_RECOVERY_MR_OVERRIDE: Allowing ${earlyMeanReversionSignal.direction?.toUpperCase()} ` +
                `despite pre-recovery state (losses=${consecutiveLosses})`
              );
              logger.forSymbol(symbol).info(
                `   Stacked position: ${(preRecoveryMRPositionMultiplier * 100).toFixed(1)}% ` +
                `(pre-recovery ${(preRecoveryReduction * 100).toFixed(0)}% × MR extreme ${(mrExtremeReduction * 100).toFixed(0)}%)`
              );
            }
            
            // FLIP DIRECTION: Mean reversion detected extreme exhaustion opposite to trend
            originalDerivedDirection = derivedDirection;
            derivedDirection = earlyMeanReversionSignal.direction!;
            meanReversionDirectionFlipApplied = true;
            derivedSource = preRecoveryMROverrideApplied ? "pre_recovery_mr_override" : "mean_reversion_flip";
            
            logger.forSymbol(symbol).info(
              `${LOG_CATEGORIES.SUCCESS} 🔄 MEAN_REVERSION DIRECTION FLIP: ${originalDerivedDirection.toUpperCase()} → ${derivedDirection.toUpperCase()}`
            );
            logger.forSymbol(symbol).info(
              `   Exhaustion score ${earlyMeanReversionSignal.exhaustionScore} >= 70, phase=${earlyMeanReversionSignal.trendPhase}, ` +
              `position=${(earlyMeanReversionSignal.positionMultiplier * 100).toFixed(0)}%` +
              (preRecoveryMROverrideApplied ? ` (PRE_RECOVERY_MR_OVERRIDE active)` : '')
            );
          }
        } else if (earlyMeanReversionSignal && !earlyMeanReversionSignal.allowed) {
          logger.forSymbol(symbol).debug(
            `[MEAN_REVERSION] Early check blocked by regime: ${earlyMeanReversionSignal.trendPhase}/${earlyMeanReversionSignal.expansionState}`
          );
        }
        
        // Finding 1: In pre-recovery state, require deep pullback OR squeeze breakout
        // Get pullback analysis early for pre-recovery gate check
        const rsi = trendData?.timeframes?.['1h']?.indicators?.rsi ?? 50;
        const squeezeBreakoutForPreRecovery = isValidSqueezeBreakout(trendData, derivedDirection);
        
        // Check for deep pullback conditions (RSI + structure)
        const isDeepPullbackLong = derivedDirection === "long" && 
          rsi < PRE_RECOVERY_PARAMS.DEEP_PULLBACK_RSI_LONG;
        const isDeepPullbackShort = derivedDirection === "short" && 
          rsi > PRE_RECOVERY_PARAMS.DEEP_PULLBACK_RSI_SHORT;
        const hasDeepPullback = isDeepPullbackLong || isDeepPullbackShort;
        
        // Mean reversion direction flip bypasses PRE_RECOVERY gate (it's a different strategy)
        // PRE_RECOVERY_MR_OVERRIDE is the special case where we're in pre-recovery AND flipping direction
        const meanReversionBypassPreRecovery = meanReversionDirectionFlipApplied && 
          ((earlyMeanReversionSignal?.exhaustionScore ?? 0) >= 70 || preRecoveryMROverrideApplied);
        
        if (isPreRecovery && PRE_RECOVERY_PARAMS.BLOCK_CONTINUATION_WITHOUT_STRUCTURE && !meanReversionBypassPreRecovery) {
          // Pre-recovery requires either deep pullback OR valid squeeze breakout
          if (!hasDeepPullback && !squeezeBreakoutForPreRecovery.isValid) {
            rejectedByHardGates++;
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} PRE-RECOVERY GATE: Blocking entry - requires deep pullback OR squeeze breakout`);
            logger.forSymbol(symbol).debug(`   RSI=${rsi.toFixed(1)}, deepPullback=${hasDeepPullback}, squeeze=${squeezeBreakoutForPreRecovery.isValid}`);
            // Extract squeeze breakdown data for UI display
            const bollinger = trendData?.bollingerBands || {};
            const bb4h = bollinger['4h'] || bollinger;
            const bb1h = bollinger['1h'] || {};
            const squeeze4h = bb4h.squeeze || bb4h.squeezeActive || false;
            const squeeze1h = bb1h.squeeze || bb1h.squeezeActive || false;
            const percentB4h = bb4h.percentB ?? 50;
            const percentB1h = bb1h.percentB ?? 50;
            
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
                // NEW: Squeeze breakdown for detailed UI display
                squeeze4h,
                squeeze1h,
                percentB4h,
                percentB1h,
                derivedDirection,
                direction: derivedDirection, // Ensure both fields present
                meanReversionChecked: true,
                meanReversionDetected: earlyMeanReversionSignal?.detected ?? false,
                meanReversionDirection: earlyMeanReversionSignal?.direction ?? null,
                meanReversionScore: earlyMeanReversionSignal?.exhaustionScore ?? 0,
                preRecoveryOverrideAllowed: earlyMeanReversionSignal?.preRecoveryOverrideAllowed ?? false
              },
              trendData,
              riskParams.ai_analysis_enabled !== false,
              earlyOrderFlowAnalysis
            );
            continue;
          }
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} PRE-RECOVERY: Entry allowed via ${hasDeepPullback ? 'deep pullback' : 'squeeze breakout'}`);
        } else if (meanReversionBypassPreRecovery) {
          const bypassType = preRecoveryMROverrideApplied 
            ? `PRE_RECOVERY_MR_OVERRIDE (${(preRecoveryMRPositionMultiplier * 100).toFixed(1)}% position)` 
            : 'MEAN_REVERSION direction flip';
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} PRE-RECOVERY: Bypassed via ${bypassType} (${derivedDirection.toUpperCase()})`);
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
                macdDirectionAligned: momentum?.macdDirectionAligned,
                macdExpanding: momentum?.macdExpanding,
                macdHistogram: momentum?.macdHistogram?.toFixed(4) ?? '0.0000',
                consecutiveBars1h: momentum?.consecutiveBars1h ?? 0,
                consecutiveBars30m: momentum?.consecutiveBars30m ?? 0,
                consecutiveBars15m: momentum?.consecutiveBars15m ?? 0
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
        // PHASE 4: In FULL adaptive mode, skip StochRSI gate - adaptive engine handles extremes
        const skipStochRSIGate = ADAPTIVE_SIGNAL_MODE.MODE === 'FULL';
        if (skipStochRSIGate) {
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} ADAPTIVE FULL MODE: Skipping StochRSI gate - adaptive engine will handle extremes`);
        }
        // CENTRALIZED: Use shared extractors for StochRSI K/D values
        const stochRsiK4h = extractStochRsiK(trendData, '4h');
        const stochRsiD4h = extractStochRsiD(trendData, '4h');
        const stochRsiK1h = extractStochRsiK(trendData, '1h');
        const stochRsiD1h = extractStochRsiD(trendData, '1h');  // Added for pullback K/D turn detection
        // Keep raw object reference for signal property access (bullish_cross, bearish_cross)
        const stochRsi1h = trendData.stochasticRsi?.["1h"];
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
        
        // ============= ABSOLUTE STOCHRSI MAXIMUM HARD GATES (with Parabolic Bypass) =============
        // PLAN FIX C: Block trades against HTF StochRSI extremes
        // K >= 98 = at absolute maximum, no room to rise, BLOCK all LONG entries
        // K <= 2 = at absolute minimum, no room to fall, BLOCK all SHORT entries
        // NEW: Parabolic bypass - in genuine parabolic trends, K can stay at 100 while price rises
        
        // Check tiered parabolic bypass conditions (strong trend + no exhaustion)
        const diGap = fullAdxResult?.diGap ?? 0;
        // CENTRALIZED: Use previously extracted adxSlope from extractADXSlope (line 2552)
        // Fallback to fullAdxResult if we're in a different scope (safety)
        
        // ============= PHASE 2: TREND CONTINUATION AFTER EXIT =============
        // Check for recent profitable exits to allow relaxed re-entry thresholds
        // This catches continuation moves after taking profit too early
        let trendContinuationAfterExitAllowed = false;
        let afterExitPositionMultiplier = 1.0;
        let afterExitDirection: "long" | "short" | null = null;
        
        if (TREND_CONTINUATION_AFTER_EXIT_PARAMS.ENABLED) {
          // Calculate lookback time
          const lookbackHours = TREND_CONTINUATION_AFTER_EXIT_PARAMS.LOOKBACK_HOURS;
          const lookbackTime = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();
          
          // Query recent profitable closes for this symbol
          const { data: recentProfitableExits } = await supabase
            .from("positions")
            .select("id, symbol, side, realized_pnl_percent, close_reason, closed_at, trend")
            .eq("user_id", userId)
            .eq("symbol", symbol)
            .eq("status", "closed")
            .gte("closed_at", lookbackTime)
            .order("closed_at", { ascending: false })
            .limit(5);
          
          if (recentProfitableExits && recentProfitableExits.length > 0) {
            // Check for qualifying profitable exits
            const qualifyingExit = recentProfitableExits.find(exit => {
              const profitPercent = exit.realized_pnl_percent || 0;
              const closeReason = exit.close_reason || '';
              const meetsProfit = profitPercent >= TREND_CONTINUATION_AFTER_EXIT_PARAMS.MIN_PROFIT_PERCENT;
              const meetsTpRequirement = !TREND_CONTINUATION_AFTER_EXIT_PARAMS.REQUIRE_TP_EXIT || 
                closeReason.includes('take_profit') || closeReason.includes('tp') || closeReason === 'partial_tp';
              return meetsProfit && meetsTpRequirement;
            });
            
            if (qualifyingExit) {
              // Determine direction from the original trade
              const originalDirection: "long" | "short" = qualifyingExit.side === "buy" ? "long" : "short";
              
              // Check ADX requirements
              const meetsAdx = adx >= TREND_CONTINUATION_AFTER_EXIT_PARAMS.MIN_ADX;
              const meetsAdxSlope = adxSlope >= TREND_CONTINUATION_AFTER_EXIT_PARAMS.MIN_ADX_SLOPE;
              
              // Check HTF alignment
              const htf4hConfidenceForExit = trendData.timeframes?.['4h']?.confidence ?? 0;
              const meetsHtf = htf4hConfidenceForExit >= TREND_CONTINUATION_AFTER_EXIT_PARAMS.MIN_HTF_4H_CONFIDENCE;
              
              // Check if current direction matches original
              const currentDirection = derivedDirection;
              const directionMatches = !TREND_CONTINUATION_AFTER_EXIT_PARAMS.REQUIRE_SAME_DIRECTION || 
                currentDirection === originalDirection;
              
              if (meetsAdx && meetsAdxSlope && meetsHtf && directionMatches) {
                trendContinuationAfterExitAllowed = true;
                afterExitPositionMultiplier = TREND_CONTINUATION_AFTER_EXIT_PARAMS.POSITION_SIZE_MULTIPLIER;
                afterExitDirection = originalDirection;
                
                const minutesSinceClose = Math.round((Date.now() - new Date(qualifyingExit.closed_at).getTime()) / 60000);
                logger.forSymbol(symbol).info(`${LOG_CATEGORIES.ENTRY} TREND CONTINUATION AFTER EXIT - Allowing relaxed re-entry`);
                logger.forSymbol(symbol).info(`   → Original trade: ${qualifyingExit.side} with +${qualifyingExit.realized_pnl_percent?.toFixed(2)}% profit`);
                logger.forSymbol(symbol).info(`   → Closed ${minutesSinceClose}min ago via ${qualifyingExit.close_reason}`);
                logger.forSymbol(symbol).info(`   → ADX=${adx.toFixed(1)} (>=${TREND_CONTINUATION_AFTER_EXIT_PARAMS.MIN_ADX}), slope=${adxSlope.toFixed(2)} (>=${TREND_CONTINUATION_AFTER_EXIT_PARAMS.MIN_ADX_SLOPE})`);
                logger.forSymbol(symbol).info(`   → Position size: ${(afterExitPositionMultiplier * 100).toFixed(0)}%, StochRSI relaxed to K=${TREND_CONTINUATION_AFTER_EXIT_PARAMS.MAX_STOCHRSI_K_LONG_REENTRY} (LONG) / K=${TREND_CONTINUATION_AFTER_EXIT_PARAMS.MIN_STOCHRSI_K_SHORT_REENTRY} (SHORT)`);
              } else {
                logger.forSymbol(symbol).debug(`[TREND_CONTINUATION_EXIT] Qualifying exit found but conditions not met: ADX=${meetsAdx}, slope=${meetsAdxSlope}, HTF=${meetsHtf}, direction=${directionMatches}`);
              }
            }
          }
        }
        
        // ============= PHASE 3: STRONG TREND BOLLINGER EXTENSION =============
        // Allow entries at %B > 97 when ADX >= 45 and 4h trend strongly aligns
        // This catches continuation moves when price is riding above upper Bollinger band
        let bollingerExtensionAllowed = false;
        let bollingerExtPositionMultiplier = 1.0;
        
        if (STRONG_TREND_BOLLINGER_EXTENSION_PARAMS.ENABLED) {
          const htfConf4hForBB = trendData.timeframes?.['4h']?.confidence ?? 0;
          const htfDir4hForBB = trendData.timeframes?.['4h']?.trend ?? 'neutral';
          
          // Check if direction matches 4h trend
          const htf4hAlignedForBB = (derivedDirection === 'long' && htfDir4hForBB === 'bullish') ||
                                    (derivedDirection === 'short' && htfDir4hForBB === 'bearish');
          
          // Check ADX requirements
          const meetsAdxForBB = adx >= STRONG_TREND_BOLLINGER_EXTENSION_PARAMS.MIN_ADX;
          const meetsAdxSlopeForBB = adxSlope >= STRONG_TREND_BOLLINGER_EXTENSION_PARAMS.MIN_ADX_SLOPE;
          const meetsDiGapForBB = diGap >= STRONG_TREND_BOLLINGER_EXTENSION_PARAMS.MIN_DI_GAP;
          
          // Check HTF alignment
          const meetsHtfForBB = !STRONG_TREND_BOLLINGER_EXTENSION_PARAMS.REQUIRE_HTF_ALIGNED ||
                               (htf4hAlignedForBB && htfConf4hForBB >= STRONG_TREND_BOLLINGER_EXTENSION_PARAMS.MIN_HTF_4H_CONFIDENCE);
          
          // Check StochRSI safety - must not be at absolute extreme
          const stochRsiSafeForLongBB = stochRsiK4h < STRONG_TREND_BOLLINGER_EXTENSION_PARAMS.MAX_STOCHRSI_K_LONG;
          const stochRsiSafeForShortBB = stochRsiK4h > STRONG_TREND_BOLLINGER_EXTENSION_PARAMS.MIN_STOCHRSI_K_SHORT;
          
          // Check if %B is in the extension zone (> 97 for long, < 3 for short)
          const isLongBBExtension = derivedDirection === 'long' && percentB > 97 && percentB <= STRONG_TREND_BOLLINGER_EXTENSION_PARAMS.EXTENDED_MAX_PERCENT_B_LONG;
          const isShortBBExtension = derivedDirection === 'short' && percentB < 3 && percentB >= STRONG_TREND_BOLLINGER_EXTENSION_PARAMS.EXTENDED_MIN_PERCENT_B_SHORT;
          
          // Apply extension logic
          if (meetsAdxForBB && meetsAdxSlopeForBB && meetsDiGapForBB && meetsHtfForBB) {
            if ((isLongBBExtension && stochRsiSafeForLongBB) || (isShortBBExtension && stochRsiSafeForShortBB)) {
              bollingerExtensionAllowed = true;
              bollingerExtPositionMultiplier = STRONG_TREND_BOLLINGER_EXTENSION_PARAMS.POSITION_SIZE_MULTIPLIER;
              
              const direction = derivedDirection === 'long' ? 'LONG' : 'SHORT';
              logger.forSymbol(symbol).info(`${LOG_CATEGORIES.ENTRY} PHASE 3: BOLLINGER EXTENSION BYPASS - Allowing ${direction} at %B=${percentB.toFixed(1)}`);
              logger.forSymbol(symbol).info(`   → ADX=${adx.toFixed(1)} (>=${STRONG_TREND_BOLLINGER_EXTENSION_PARAMS.MIN_ADX}), slope=${adxSlope.toFixed(2)}, DI gap=${diGap.toFixed(1)}`);
              logger.forSymbol(symbol).info(`   → 4h trend: ${htfDir4hForBB} at ${htfConf4hForBB.toFixed(0)}% confidence (aligned=${htf4hAlignedForBB})`);
              logger.forSymbol(symbol).info(`   → StochRSI K=${stochRsiK4h.toFixed(1)} (within safety limit), Position size: ${(bollingerExtPositionMultiplier * 100).toFixed(0)}%`);
            }
          } else {
            // Log why extension wasn't allowed (debug level)
            if (isLongBBExtension || isShortBBExtension) {
              logger.forSymbol(symbol).debug(`[BOLLINGER_EXT] %B=${percentB.toFixed(1)} in extension zone but conditions not met: ADX=${meetsAdxForBB}, slope=${meetsAdxSlopeForBB}, DI=${meetsDiGapForBB}, HTF=${meetsHtfForBB}`);
            }
          }
        }
        
        // ============= PHASE 4: EARLY TREND DETECTION =============
        // Allow entries at lower ADX (18-25) when ADX is clearly rising and timeframes align
        // This catches the beginning of trends before ADX reaches normal thresholds
        let earlyTrendDetectionAllowed = false;
        let earlyTrendPositionMultiplier = 1.0;
        
        if (EARLY_TREND_DETECTION_PARAMS.ENABLED) {
          const htfConf4hForET = trendData.timeframes?.['4h']?.confidence ?? 0;
          const htfDir4hForET = trendData.timeframes?.['4h']?.trend ?? 'neutral';
          const htfConf1hForET = trendData.timeframes?.['1h']?.confidence ?? 0;
          const htfDir1hForET = trendData.timeframes?.['1h']?.trend ?? 'neutral';
          
          // Check if ADX is in early trend range (18-25) with rising slope
          const isEarlyAdxRange = adx >= EARLY_TREND_DETECTION_PARAMS.MIN_ADX && adx < ADX_THRESHOLDS.STRONG;
          const isAdxRisingForET = adxSlope >= EARLY_TREND_DETECTION_PARAMS.MIN_ADX_SLOPE;
          
          // Check 4h and 1h alignment with direction
          const htf4hAlignedForET = (derivedDirection === 'long' && htfDir4hForET === 'bullish') ||
                                    (derivedDirection === 'short' && htfDir4hForET === 'bearish');
          const htf1hAlignedForET = (derivedDirection === 'long' && htfDir1hForET === 'bullish') ||
                                    (derivedDirection === 'short' && htfDir1hForET === 'bearish');
          
          // Check confidence requirements
          const meets4hConfForET = htfConf4hForET >= EARLY_TREND_DETECTION_PARAMS.MIN_4H_CONFIDENCE;
          const meets1hConfForET = htfConf1hForET >= EARLY_TREND_DETECTION_PARAMS.MIN_1H_CONFIDENCE;
          
          // Check alignment requirement
          const meetsAlignmentForET = !EARLY_TREND_DETECTION_PARAMS.REQUIRE_4H_1H_ALIGNMENT ||
                                      (htf4hAlignedForET && htf1hAlignedForET && meets4hConfForET && meets1hConfForET);
          
          // Check StochRSI is in "loading zone" (not at extremes)
          const stochRsiInLoadingZone = derivedDirection === 'long'
            ? (stochRsiK4h >= EARLY_TREND_DETECTION_PARAMS.LONG_STOCHRSI_MIN && stochRsiK4h <= EARLY_TREND_DETECTION_PARAMS.LONG_STOCHRSI_MAX)
            : (stochRsiK4h >= EARLY_TREND_DETECTION_PARAMS.SHORT_STOCHRSI_MIN && stochRsiK4h <= EARLY_TREND_DETECTION_PARAMS.SHORT_STOCHRSI_MAX);
          
          // Check volume confirmation (optional)
          const volumeRatio = trendData.volume?.ratio ?? 1.0;
          const meetsVolumeForET = !EARLY_TREND_DETECTION_PARAMS.REQUIRE_ABOVE_AVERAGE_VOLUME ||
                                   volumeRatio >= EARLY_TREND_DETECTION_PARAMS.MIN_VOLUME_RATIO;
          
          // Apply early trend detection
          if (isEarlyAdxRange && isAdxRisingForET && meetsAlignmentForET && stochRsiInLoadingZone && meetsVolumeForET) {
            earlyTrendDetectionAllowed = true;
            earlyTrendPositionMultiplier = EARLY_TREND_DETECTION_PARAMS.POSITION_SIZE_MULTIPLIER;
            
            const direction = derivedDirection === 'long' ? 'LONG' : 'SHORT';
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.ENTRY} PHASE 4: EARLY TREND DETECTION - Allowing ${direction} at ADX=${adx.toFixed(1)}`);
            logger.forSymbol(symbol).info(`   → ADX=${adx.toFixed(1)} (>=${EARLY_TREND_DETECTION_PARAMS.MIN_ADX}, <${ADX_THRESHOLDS.STRONG}), slope=${adxSlope.toFixed(2)} (>=${EARLY_TREND_DETECTION_PARAMS.MIN_ADX_SLOPE})`);
            logger.forSymbol(symbol).info(`   → 4h: ${htfDir4hForET} at ${htfConf4hForET.toFixed(0)}%, 1h: ${htfDir1hForET} at ${htfConf1hForET.toFixed(0)}%`);
            logger.forSymbol(symbol).info(`   → StochRSI K=${stochRsiK4h.toFixed(1)} (in loading zone 30-70), Volume ratio=${volumeRatio.toFixed(2)}`);
            logger.forSymbol(symbol).info(`   → Position size: ${(earlyTrendPositionMultiplier * 100).toFixed(0)}%`);
          } else if (isEarlyAdxRange) {
            // Log why early detection wasn't allowed (debug level)
            logger.forSymbol(symbol).debug(`[EARLY_TREND] ADX=${adx.toFixed(1)} in early range but conditions not met: rising=${isAdxRisingForET}, aligned=${meetsAlignmentForET}, loadingZone=${stochRsiInLoadingZone}, volume=${meetsVolumeForET}`);
          }
        }
        
        // Determine which tier applies (highest tier wins, including all phases)
        let bypassTier: 'none' | 'tier0' | 'tier1' | 'tier2' | 'tier3' | 'after_exit' | 'bollinger_ext' | 'early_trend' = 'none';
        let tieredPositionSizePercent = 100;
        
        // PHASE 3: Check Bollinger Extension first (allows entries at extreme %B)
        if (bollingerExtensionAllowed) {
          bypassTier = 'bollinger_ext';
          tieredPositionSizePercent = bollingerExtPositionMultiplier * 100;
        }
        // PHASE 2: Check Trend Continuation After Exit (second priority when applicable)
        // This allows re-entry with relaxed StochRSI thresholds after profitable exits
        else if (trendContinuationAfterExitAllowed && afterExitDirection === derivedDirection) {
          bypassTier = 'after_exit';
          tieredPositionSizePercent = afterExitPositionMultiplier * 100;
        }
        // PHASE 4: Early Trend Detection - catches trends when ADX is 18-25 but rising
        else if (earlyTrendDetectionAllowed) {
          bypassTier = 'early_trend';
          tieredPositionSizePercent = earlyTrendPositionMultiplier * 100;
        }
        // PHASE 1 FIX: NEW Tier 0 (Ultra Strong) - ADX >= 50, no continuation requirement
        // Allows entries when ADX is very high even if slope slightly negative
        else if (
          adx >= STOCHRSI_THRESHOLDS.TIER0_MIN_ADX &&
          adxSlope >= STOCHRSI_THRESHOLDS.TIER0_MIN_ADX_SLOPE &&
          diGap >= STOCHRSI_THRESHOLDS.TIER0_MIN_DI_GAP &&
          !adxExhaustion.isExhausted
        ) {
          bypassTier = 'tier0';
          tieredPositionSizePercent = STOCHRSI_THRESHOLDS.TIER0_POSITION_SIZE;
        }
        // Tier 3 (Very Strong) - highest thresholds, most confidence
        else if (
          adx >= STOCHRSI_THRESHOLDS.TIER3_MIN_ADX &&
          adxSlope >= STOCHRSI_THRESHOLDS.TIER3_MIN_ADX_SLOPE &&
          diGap >= STOCHRSI_THRESHOLDS.TIER3_MIN_DI_GAP &&
          !adxExhaustion.isExhausted
        ) {
          bypassTier = 'tier3';
          tieredPositionSizePercent = STOCHRSI_THRESHOLDS.TIER3_POSITION_SIZE;
        }
        // Tier 2 (Strong) - moderate thresholds
        else if (
          adx >= STOCHRSI_THRESHOLDS.TIER2_MIN_ADX &&
          adxSlope >= STOCHRSI_THRESHOLDS.TIER2_MIN_ADX_SLOPE &&
          diGap >= STOCHRSI_THRESHOLDS.TIER2_MIN_DI_GAP &&
          !adxExhaustion.isExhausted
        ) {
          bypassTier = 'tier2';
          tieredPositionSizePercent = STOCHRSI_THRESHOLDS.TIER2_POSITION_SIZE;
        }
        // Tier 1 (Base) - lowest thresholds
        // PHASE 1 FIX: Removed continuation requirement - now just needs ADX/slope/DI thresholds
        else if (
          adx >= STOCHRSI_THRESHOLDS.TIER1_MIN_ADX &&
          adxSlope >= STOCHRSI_THRESHOLDS.TIER1_MIN_ADX_SLOPE &&
          diGap >= STOCHRSI_THRESHOLDS.TIER1_MIN_DI_GAP &&
          !adxExhaustion.isExhausted
        ) {
          bypassTier = 'tier1';
          tieredPositionSizePercent = STOCHRSI_THRESHOLDS.TIER1_POSITION_SIZE;
        }
        
        // Phase 2/3: For after_exit or bollinger_ext bypass, use relaxed StochRSI thresholds
        // NOTE: early_trend does NOT relax thresholds - it operates in the 30-70 loading zone
        const effectiveAbsoluteMaxOverbought = (trendContinuationAfterExitAllowed && afterExitDirection === "long" && derivedDirection === "long")
          ? TREND_CONTINUATION_AFTER_EXIT_PARAMS.MAX_STOCHRSI_K_LONG_REENTRY
          : (bollingerExtensionAllowed && derivedDirection === "long")
            ? STRONG_TREND_BOLLINGER_EXTENSION_PARAMS.MAX_STOCHRSI_K_LONG
            : STOCHRSI_THRESHOLDS.ABSOLUTE_MAX_OVERBOUGHT;
        const effectiveAbsoluteMaxOversold = (trendContinuationAfterExitAllowed && afterExitDirection === "short" && derivedDirection === "short")
          ? TREND_CONTINUATION_AFTER_EXIT_PARAMS.MIN_STOCHRSI_K_SHORT_REENTRY
          : (bollingerExtensionAllowed && derivedDirection === "short")
            ? STRONG_TREND_BOLLINGER_EXTENSION_PARAMS.MIN_STOCHRSI_K_SHORT
            : STOCHRSI_THRESHOLDS.ABSOLUTE_MAX_OVERSOLD;
        
        const canBypassAbsoluteMax = bypassTier !== 'none';
        
        let parabolicBypassApplied = false;
        
        if (stochRsiK4h >= effectiveAbsoluteMaxOverbought && !skipStochRSIGate) {
          // Block LONG entries at absolute maximum - StochRSI has nowhere to go
          // NOTE: effectiveAbsoluteMaxOverbought is 95 for trend continuation after exit, 98 otherwise
          // PHASE 4: Skip this gate entirely in FULL adaptive mode
          if (derivedDirection === "long") {
            if (canBypassAbsoluteMax) {
              // Allow entry despite K>=threshold - tiered bypass based on trend strength or recent profitable exit
              parabolicBypassApplied = true;
              const bypassReason = bypassTier === 'after_exit' ? 'TREND_CONTINUATION_AFTER_EXIT' : bypassTier === 'bollinger_ext' ? 'BOLLINGER_EXTENSION' : bypassTier === 'early_trend' ? 'EARLY_TREND_DETECTION' : bypassTier.toUpperCase();
              logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} TIERED BYPASS [${bypassReason}] - Allowing LONG at K=${stochRsiK4h.toFixed(1)} (threshold=${effectiveAbsoluteMaxOverbought}, ADX=${adx.toFixed(1)} slope=${adxSlope.toFixed(2)}, DI gap=${diGap.toFixed(1)})`);
              logger.forSymbol(symbol).info(`   → Position size reduced to ${tieredPositionSizePercent}% due to extreme StochRSI`);
            } else {
              rejectedByStochRsiExtreme++;
              perSymbolGateAttribution.set(symbol, { gate: 'STOCHRSI_ABSOLUTE_MAX_OVERBOUGHT', details: `K=${stochRsiK4h.toFixed(1)} >= ${effectiveAbsoluteMaxOverbought}` });
              logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} HARD BLOCK - 4h StochRSI at maximum (K=${stochRsiK4h.toFixed(1)} >= ${effectiveAbsoluteMaxOverbought}) - nowhere to rise`);
              logger.forSymbol(symbol).info(`   → Tiered bypass failed: ADX=${adx.toFixed(1)} (tier1>=${STOCHRSI_THRESHOLDS.TIER1_MIN_ADX}), slope=${adxSlope.toFixed(2)} (tier1>=${STOCHRSI_THRESHOLDS.TIER1_MIN_ADX_SLOPE}), DI gap=${diGap.toFixed(1)} (tier1>=${STOCHRSI_THRESHOLDS.TIER1_MIN_DI_GAP}), exhausted=${adxExhaustion.isExhausted}, continuation=${adxExhaustion.isContinuation}, afterExitAllowed=${trendContinuationAfterExitAllowed}, bollingerExtAllowed=${bollingerExtensionAllowed}, earlyTrendAllowed=${earlyTrendDetectionAllowed}`);
              await logRejectionWithAI(
                supabase, userId, symbol,
                `STOCHRSI ABSOLUTE BLOCK: LONG blocked at K=${stochRsiK4h.toFixed(1)} (parabolic bypass conditions not met)`,
                { 
                  gate: "STOCHRSI_ABSOLUTE_MAX_OVERBOUGHT",
                  derivedDirection,
                  direction: "long",
                  stochRsiK4h: stochRsiK4h.toFixed(1),
                  threshold: effectiveAbsoluteMaxOverbought,
                  normalThreshold: STOCHRSI_THRESHOLDS.ABSOLUTE_MAX_OVERBOUGHT,
                  trendContinuationAfterExitAllowed,
                  bollingerExtensionAllowed,
                  earlyTrendDetectionAllowed,
                  adx: adx.toFixed(1),
                  adxSlope: adxSlope.toFixed(2),
                  diGap: diGap.toFixed(1),
                  isExhausted: adxExhaustion.isExhausted,
                  isContinuation: adxExhaustion.isContinuation,
                  tier1Thresholds: { adx: STOCHRSI_THRESHOLDS.TIER1_MIN_ADX, slope: STOCHRSI_THRESHOLDS.TIER1_MIN_ADX_SLOPE, diGap: STOCHRSI_THRESHOLDS.TIER1_MIN_DI_GAP },
                  message: "Tiered bypass conditions not met - need ADX>=25/30/35, slope>=0.03/0.05/0.08, DI gap>=10/12/15, no exhaustion OR recent profitable exit with ADX>=30"
                },
                trendData,
                riskParams.ai_analysis_enabled !== false,
                earlyOrderFlowAnalysis
              );
              continue;
            }
          }
        }
        
        if (stochRsiK4h <= effectiveAbsoluteMaxOversold && !skipStochRSIGate) {
          // Block SHORT entries at absolute minimum - StochRSI has nowhere to go
          // NOTE: effectiveAbsoluteMaxOversold is 5 for trend continuation after exit, 2 otherwise
          // PHASE 4: Skip this gate entirely in FULL adaptive mode
          if (derivedDirection === "short") {
            if (canBypassAbsoluteMax) {
              // Allow entry despite K<=threshold - tiered bypass based on trend strength or recent profitable exit
              parabolicBypassApplied = true;
              const bypassReason = bypassTier === 'after_exit' ? 'TREND_CONTINUATION_AFTER_EXIT' : bypassTier === 'bollinger_ext' ? 'BOLLINGER_EXTENSION' : bypassTier === 'early_trend' ? 'EARLY_TREND_DETECTION' : bypassTier.toUpperCase();
              logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} TIERED BYPASS [${bypassReason}] - Allowing SHORT at K=${stochRsiK4h.toFixed(1)} (threshold=${effectiveAbsoluteMaxOversold}, ADX=${adx.toFixed(1)} slope=${adxSlope.toFixed(2)}, DI gap=${diGap.toFixed(1)})`);
              logger.forSymbol(symbol).info(`   → Position size reduced to ${tieredPositionSizePercent}% due to extreme StochRSI`);
            } else {
              rejectedByStochRsiExtreme++;
              perSymbolGateAttribution.set(symbol, { gate: 'STOCHRSI_ABSOLUTE_MAX_OVERSOLD', details: `K=${stochRsiK4h.toFixed(1)} <= ${effectiveAbsoluteMaxOversold}` });
              logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} HARD BLOCK - 4h StochRSI at minimum (K=${stochRsiK4h.toFixed(1)} <= ${effectiveAbsoluteMaxOversold}) - nowhere to fall`);
              logger.forSymbol(symbol).info(`   → Tiered bypass failed: ADX=${adx.toFixed(1)} (tier1>=${STOCHRSI_THRESHOLDS.TIER1_MIN_ADX}), slope=${adxSlope.toFixed(2)} (tier1>=${STOCHRSI_THRESHOLDS.TIER1_MIN_ADX_SLOPE}), DI gap=${diGap.toFixed(1)} (tier1>=${STOCHRSI_THRESHOLDS.TIER1_MIN_DI_GAP}), exhausted=${adxExhaustion.isExhausted}, continuation=${adxExhaustion.isContinuation}, afterExitAllowed=${trendContinuationAfterExitAllowed}, bollingerExtAllowed=${bollingerExtensionAllowed}, earlyTrendAllowed=${earlyTrendDetectionAllowed}`);
              await logRejectionWithAI(
                supabase, userId, symbol,
                `STOCHRSI ABSOLUTE BLOCK: SHORT blocked at K=${stochRsiK4h.toFixed(1)} (parabolic bypass conditions not met)`,
                { 
                  gate: "STOCHRSI_ABSOLUTE_MAX_OVERSOLD",
                  derivedDirection,
                  direction: "short",
                  stochRsiK4h: stochRsiK4h.toFixed(1),
                  threshold: effectiveAbsoluteMaxOversold,
                  normalThreshold: STOCHRSI_THRESHOLDS.ABSOLUTE_MAX_OVERSOLD,
                  trendContinuationAfterExitAllowed,
                  bollingerExtensionAllowed,
                  earlyTrendDetectionAllowed,
                  adx: adx.toFixed(1),
                  adxSlope: adxSlope.toFixed(2),
                  diGap: diGap.toFixed(1),
                  isExhausted: adxExhaustion.isExhausted,
                  isContinuation: adxExhaustion.isContinuation,
                  tier1Thresholds: { adx: STOCHRSI_THRESHOLDS.TIER1_MIN_ADX, slope: STOCHRSI_THRESHOLDS.TIER1_MIN_ADX_SLOPE, diGap: STOCHRSI_THRESHOLDS.TIER1_MIN_DI_GAP },
                  message: "Tiered bypass conditions not met - need ADX>=25/30/35, slope>=0.03/0.05/0.08, DI gap>=10/12/15, no exhaustion OR recent profitable exit with ADX>=30"
                },
                trendData,
                riskParams.ai_analysis_enabled !== false,
                earlyOrderFlowAnalysis
              );
              continue;
            }
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
        // PHASE 4: Skip these gates in FULL adaptive mode - adaptive engine handles extremes
        const ABSOLUTE_MAX_OB = STOCHRSI_THRESHOLDS.ABSOLUTE_MAX_OVERBOUGHT ?? 98;
        const ABSOLUTE_MAX_OS = STOCHRSI_THRESHOLDS.ABSOLUTE_MAX_OVERSOLD ?? 2;
        
        if (intendedTradeDirection === "long" && stochRsiK4h >= ABSOLUTE_MAX_OB && !skipStochRSIGate) {
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
        
        if (intendedTradeDirection === "short" && stochRsiK4h <= ABSOLUTE_MAX_OS && !skipStochRSIGate) {
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
        // RELAXATION: Tiered approach based on ADX strength:
        // - Very strong (ADX 35+): threshold 130, no rising requirement
        // - Near-very-strong (ADX 33-35, slope >= -0.3): threshold 130
        // - Strong (ADX 30+, rising, HTF aligned): threshold 120
        // - Default: threshold 110
        // CENTRALIZED: Use previously extracted adxRising from extractADXSlope (line 2552)
        // No need to re-extract - adxRising was already set at symbol scope start
        const htf4hAligned = htfTrend4h === (derivedDirection === "long" ? "bullish" : "bearish");
        const htf1hAligned = htfTrend1h === (derivedDirection === "long" ? "bullish" : "bearish");
        
        // Get ADX slope for tiered checks
        const adxSlopeForOverextension = fullAdxResult.adxSlope ?? (adxRising ? 0.5 : -0.5);
        
        // Check for very strong ADX tier (35+) - no rising requirement
        const isVeryStrongAdxForOverextension = adx >= STRONG_TREND_OVEREXTENSION_PARAMS.VERY_STRONG_ADX;
        
        // Check for near-very-strong tier (33-35) with slope check
        const isNearVeryStrongAdxForOverextension = (
          adx >= STRONG_TREND_OVEREXTENSION_PARAMS.NEAR_VERY_STRONG_ADX &&
          adx < STRONG_TREND_OVEREXTENSION_PARAMS.VERY_STRONG_ADX &&
          adxSlopeForOverextension >= STRONG_TREND_OVEREXTENSION_PARAMS.NEAR_VERY_STRONG_MIN_SLOPE
        );
        
        // Relaxed ADX rising check - not required for very strong or near-very-strong
        const adxRisingForOverextension = (
          adxRising || 
          !STRONG_TREND_OVEREXTENSION_PARAMS.REQUIRE_ADX_RISING || 
          isVeryStrongAdxForOverextension ||
          isNearVeryStrongAdxForOverextension
        );
        
        // Price action momentum can override HTF alignment requirement
        // Extract priceActionMomentum here since we need it early for this gate
        const priceActionMomentumEarly = trendData.priceActionMomentum;
        const priceActionMomentumOverride = (
          STRONG_TREND_OVEREXTENSION_PARAMS.PRICE_ACTION_OVERRIDE_ENABLED &&
          priceActionMomentumEarly?.hasStrongMove &&
          Math.abs(priceActionMomentumEarly?.movePercent || 0) >= STRONG_TREND_OVEREXTENSION_PARAMS.PRICE_ACTION_MIN_MOVE_PERCENT &&
          priceActionMomentumEarly?.direction === (derivedDirection === "long" ? "bullish" : "bearish")
        );
        
        // HTF alignment check with price action override
        const htfAlignedOrOverride = (
          !STRONG_TREND_OVEREXTENSION_PARAMS.REQUIRE_HTF_ALIGNMENT ||
          (htf4hAligned && htf1hAligned) ||
          priceActionMomentumOverride
        );
        
        // Determine if strong trend mode applies (base level)
        const isStrongTrendMode = STRONG_TREND_OVEREXTENSION_PARAMS.ENABLED &&
          adx >= STRONG_TREND_OVEREXTENSION_PARAMS.MIN_ADX &&
          adxRisingForOverextension &&
          htfAlignedOrOverride;
        
        // Determine if VERY strong trend mode applies (higher thresholds)
        const isVeryStrongTrendMode = isStrongTrendMode && 
          (isVeryStrongAdxForOverextension || isNearVeryStrongAdxForOverextension);
        
        // Determine the active tier for logging
        const overextensionTier = isVeryStrongAdxForOverextension ? "very-strong" :
          isNearVeryStrongAdxForOverextension ? "near-very-strong" :
          isStrongTrendMode ? "strong" : "none";
        
        // Select appropriate threshold based on mode
        const overextensionThresholdLong = isVeryStrongTrendMode 
          ? STRONG_TREND_OVEREXTENSION_PARAMS.VERY_STRONG_PERCENT_B_THRESHOLD_LONG  // 130
          : isStrongTrendMode 
            ? STRONG_TREND_OVEREXTENSION_PARAMS.PERCENT_B_THRESHOLD_LONG  // 120
            : 110;  // Default
        const overextensionThresholdShort = isVeryStrongTrendMode 
          ? STRONG_TREND_OVEREXTENSION_PARAMS.VERY_STRONG_PERCENT_B_THRESHOLD_SHORT  // -30
          : isStrongTrendMode 
            ? STRONG_TREND_OVEREXTENSION_PARAMS.PERCENT_B_THRESHOLD_SHORT  // -20
            : -10;  // Default
        
        let strongTrendOverextensionApplied = false;
        
        const isExtremelyOverextended = percentB > overextensionThresholdLong;
        if (intendedTradeDirection === "long" && isExtremelyOverextended && stochRsiK4h >= STOCHRSI_THRESHOLDS.EXTREME_OVERBOUGHT) {
          rejectedByStochRsiExtreme++;
          perSymbolGateAttribution.set(symbol, { gate: 'STOCHRSI_OVERBOUGHT_BLOCK', details: `K=${stochRsiK4h.toFixed(1)}, %B=${percentB.toFixed(1)} overext` });
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} BLOCK - Price extremely overextended (%B=${percentB.toFixed(1)} > ${overextensionThresholdLong}) with overbought StochRSI (K=${stochRsiK4h.toFixed(1)}) [tier=${overextensionTier}, ADX=${adx.toFixed(1)}, slope=${adxSlopeForOverextension.toFixed(2)}]`);
          await logRejectionWithAI(
            supabase, userId, symbol,
            `BLOCK: Price overextended (%B=${percentB.toFixed(1)} > ${overextensionThresholdLong}) + StochRSI K=${stochRsiK4h.toFixed(1)} overbought [tier=${overextensionTier}]`,
            { 
              percentB: percentB.toFixed(1), 
              stochRsiK4h: stochRsiK4h.toFixed(1),
              gate: "BOLLINGER_OVEREXTENSION_GATE",
              direction: "long",
              threshold: overextensionThresholdLong,
              overextensionTier,
              isStrongTrendMode,
              isVeryStrongTrendMode,
              adx: adx.toFixed(1),
              adxSlope: adxSlopeForOverextension.toFixed(2),
              adxRising,
              htf4hAligned,
              htf1hAligned,
              priceActionOverride: priceActionMomentumOverride,
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
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} 📈 STRONG TREND RELAXATION [tier=${overextensionTier}]: Allowing LONG at %B=${percentB.toFixed(1)} (threshold raised to ${overextensionThresholdLong} due to ADX=${adx.toFixed(1)}, slope=${adxSlopeForOverextension.toFixed(2)}, priceActionOverride=${priceActionMomentumOverride})`);
        }
        
        // Block SHORT when price is extremely below lower Bollinger (percentB < threshold) AND StochRSI <= 10
        const isExtremelyUnderextended = percentB < overextensionThresholdShort;
        if (intendedTradeDirection === "short" && isExtremelyUnderextended && stochRsiK4h <= STOCHRSI_THRESHOLDS.EXTREME_OVERSOLD) {
          rejectedByStochRsiExtreme++;
          perSymbolGateAttribution.set(symbol, { gate: 'STOCHRSI_OVERSOLD_BLOCK', details: `K=${stochRsiK4h.toFixed(1)}, %B=${percentB.toFixed(1)} underext` });
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} BLOCK - Price extremely underextended (%B=${percentB.toFixed(1)} < ${overextensionThresholdShort}) with oversold StochRSI (K=${stochRsiK4h.toFixed(1)}) [tier=${overextensionTier}, ADX=${adx.toFixed(1)}, slope=${adxSlopeForOverextension.toFixed(2)}]`);
          await logRejectionWithAI(
            supabase, userId, symbol,
            `BLOCK: Price underextended (%B=${percentB.toFixed(1)} < ${overextensionThresholdShort}) + StochRSI K=${stochRsiK4h.toFixed(1)} oversold [tier=${overextensionTier}]`,
            { 
              percentB: percentB.toFixed(1), 
              stochRsiK4h: stochRsiK4h.toFixed(1),
              gate: "BOLLINGER_UNDEREXTENSION_GATE",
              direction: "short",
              threshold: overextensionThresholdShort,
              overextensionTier,
              isStrongTrendMode,
              isVeryStrongTrendMode,
              adx: adx.toFixed(1),
              adxSlope: adxSlopeForOverextension.toFixed(2),
              adxRising,
              priceActionOverride: priceActionMomentumOverride,
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
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} 📉 STRONG TREND RELAXATION [tier=${overextensionTier}]: Allowing SHORT at %B=${percentB.toFixed(1)} (threshold lowered to ${overextensionThresholdShort} due to ADX=${adx.toFixed(1)}, slope=${adxSlopeForOverextension.toFixed(2)}, priceActionOverride=${priceActionMomentumOverride})`);
        }
        
        // ============= HTF HARD GATES (TIER 0/1/2 SYSTEM) =============
        // TIER HIERARCHY:
        //   Tier 0 (DEEP): K < 5 or K > 95 - Universal block, NO EXCEPTIONS (already checked above)
        //   Tier 1 (SEVERE): 5 <= K < 15 or 85 < K <= 95 - Block, NO BYPASS
        //   Tier 2 (STANDARD): K <= 20 & %B <= 25 or K >= 80 & %B >= 75 - Block with RESTRICTED bypass
        //   Tier 3 (CAUTION): K <= 30 or K >= 70 - Penalty scoring only (handled in reversal score)
        
        const adxRisingForBypass = trendData.volatility?.adxRising ?? smartAdxRising ?? false;
        const adxSlopeForParabolic = fullAdxResult.adxSlope ?? (adxRisingForBypass ? 0.5 : -0.5);
        const isInParabolicMode = adx >= (HTF_EXTREME_HARD_GATES.PARABOLIC_MODE_MIN_ADX ?? 45) && 
          (!HTF_EXTREME_HARD_GATES.PARABOLIC_MODE_REQUIRE_ADX_RISING || adxSlopeForParabolic >= 0);
        
        // ============= TIER 1: SEVERE STOCHRSI-ONLY GATE (NO BYPASS) =============
        // Tier 1 catches K in range [5, 15) for shorts or (85, 95] for longs that Tier 0 (Deep Gate) misses
        const severeOversoldThreshold = HTF_EXTREME_HARD_GATES.SEVERE_OVERSOLD_K_THRESHOLD ?? 15;
        const severeOverboughtThreshold = HTF_EXTREME_HARD_GATES.SEVERE_OVERBOUGHT_K_THRESHOLD ?? 85;
        const severeGateAllowsBypass = HTF_EXTREME_HARD_GATES.SEVERE_GATE_ALLOW_BYPASS ?? false;
        
        // Tier 1 blocks based on StochRSI alone (K between Tier 0 and Tier 1 threshold)
        // Note: Tier 0 already caught K < 5, so Tier 1 catches 5 <= K < 15 for shorts
        const isSevereOversold = stochRsiK4h >= DEEP_STOCHRSI_HARD_GATE.DEEP_OVERSOLD_K_THRESHOLD && 
                                  stochRsiK4h < severeOversoldThreshold;
        const isSevereOverbought = stochRsiK4h > severeOverboughtThreshold && 
                                    stochRsiK4h <= DEEP_STOCHRSI_HARD_GATE.DEEP_OVERBOUGHT_K_THRESHOLD;
        
        // ============= TIER 2: STANDARD COMBINED GATE (WITH BYPASS) =============
        // Tier 2 uses parabolic mode thresholds when ADX is super-strong (Tier 1 is never bypassed)
        const htfOverboughtThreshold = isInParabolicMode 
          ? (HTF_EXTREME_HARD_GATES.STOCHRSI_OVERBOUGHT_BLOCK_PARABOLIC ?? 92)
          : (HTF_EXTREME_HARD_GATES.STOCHRSI_OVERBOUGHT_BLOCK ?? 80);
        const htfOversoldThreshold = isInParabolicMode
          ? (HTF_EXTREME_HARD_GATES.STOCHRSI_OVERSOLD_BLOCK_PARABOLIC ?? 8)
          : (HTF_EXTREME_HARD_GATES.STOCHRSI_OVERSOLD_BLOCK ?? 20);
        
        // Tier 2 requires BOTH K AND %B to be in extreme zone
        const isHTFOversold = stochRsiK4h <= htfOversoldThreshold && 
                              percentB <= (HTF_EXTREME_HARD_GATES.PERCENT_B_OVERSOLD_BLOCK ?? 25);
        const isHTFOverbought = stochRsiK4h >= htfOverboughtThreshold && 
                                percentB >= (HTF_EXTREME_HARD_GATES.PERCENT_B_OVERBOUGHT_BLOCK ?? 75);
        
        // Log tier status with explicit tier labels
        if (isSevereOversold || isSevereOverbought) {
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} ⚠️ TIER 1 (SEVERE) HTF ZONE: K=${stochRsiK4h.toFixed(1)} (Tier 1 thresholds: OS<${severeOversoldThreshold}, OB>${severeOverboughtThreshold})`);
        }
        if (isInParabolicMode) {
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.MOMENTUM} 🚀 PARABOLIC MODE ACTIVE: ADX=${adx.toFixed(1)}, slope=${adxSlopeForParabolic.toFixed(2)} - Tier 2 thresholds relaxed (OB=${htfOverboughtThreshold}, OS=${htfOversoldThreshold})`);
        }
        
        // ============= NEW: STRONG TREND HTF BYPASS CHECK =============
        // Allow bypass when trend is very strong and no exhaustion signals
        // Note: adxRisingForBypass already declared above
        const tf30m = trendData.timeframes?.['30m'];
        
        // Check 4h alignment for relaxed mode
        const tf4hDir = stochFilterTrend4h;
        const tf1hDir = stochFilterTrend1h;
        const tf30mDir = tf30m?.trend || tf30m?.indicators?.emaSignal || "neutral";
        
        const is4hAligned = (() => {
          if (intendedTradeDirection === "long") {
            return tf4hDir === "bullish";
          } else if (intendedTradeDirection === "short") {
            return tf4hDir === "bearish";
          }
          return false;
        })();
        
        const allTimeframesAligned = (() => {
          // Check if 4h, 1h, and 30m are all aligned in same direction
          if (intendedTradeDirection === "long") {
            return tf4hDir === "bullish" && tf1hDir === "bullish" && tf30mDir === "bullish";
          } else if (intendedTradeDirection === "short") {
            return tf4hDir === "bearish" && tf1hDir === "bearish" && tf30mDir === "bearish";
          }
          return false;
        })();
        
        // NEW: Relaxed alignment - when ADX is strong (>=35), only require 4h alignment
        // This addresses BTCUSDT case: ADX 41.6, 4h bullish, but 1h/30m neutral
        const relaxedAlignmentMinADX = STRONG_TREND_HTF_BYPASS_PARAMS.RELAXED_ALIGNMENT_MIN_ADX ?? 35;
        const hasRelaxedAlignment = adx >= relaxedAlignmentMinADX && is4hAligned;
        
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
        
        // Get ADX slope for bypass check
        const adxSlopeForBypass = fullAdxResult.adxSlope ?? (smartAdxRising ? 0.5 : -0.5);
        const risingSlope = adxSlopeForBypass >= (STRONG_TREND_HTF_BYPASS_PARAMS.RISING_SLOPE_THRESHOLD ?? 0.02);
        
        // NEW: Check for parabolic mode (super-strong trends get automatic bypass)
        // UPDATED: Lowered from 55 to 45 - ADX 40-50 is already very strong
        const isParabolicMode = adx >= (STRONG_TREND_HTF_BYPASS_PARAMS.SUPER_STRONG_ADX_BYPASS ?? 45) && 
          adxSlopeForBypass >= 0 && 
          !adxExhaustion.isExhausted;
        
        // UPDATED: Relaxed bypass logic - allow if ADX slope is above minimum threshold
        const adxSlopeMeetsRequirement = STRONG_TREND_HTF_BYPASS_PARAMS.MIN_ADX_SLOPE !== undefined
          ? adxSlopeForBypass >= STRONG_TREND_HTF_BYPASS_PARAMS.MIN_ADX_SLOPE
          : (!STRONG_TREND_HTF_BYPASS_PARAMS.REQUIRE_ADX_RISING || adxRisingForBypass);
        
        // TIGHTENED: Get bypass thresholds from HTF_EXTREME_HARD_GATES (stricter than STRONG_TREND_HTF_BYPASS_PARAMS)
        const htfBypassMinADXForPaths = HTF_EXTREME_HARD_GATES.BYPASS_MIN_ADX ?? 35;
        const htfBypassMaxReversalForPaths = HTF_EXTREME_HARD_GATES.BYPASS_MAX_REVERSAL_SCORE ?? 45;
        
        // NEW: Alternative bypass path - 4h aligned + ADX >= tightened threshold + rising slope
        // TIGHTENED: Uses 35 instead of 25 for MIN_ADX
        const alternativeBypassPath = is4hAligned && 
          adx >= htfBypassMinADXForPaths &&  // TIGHTENED from STRONG_TREND_HTF_BYPASS_PARAMS.MIN_ADX (25)
          risingSlope &&
          unifiedReversal.score < htfBypassMaxReversalForPaths && // ADDED: reversal check
          !isExhausted;
        
        // NEW: High ADX bypass path - when ADX >= 40, allow bypass with just 4h alignment
        // TIGHTENED: Must also meet bypass thresholds
        const highADXBypassPath = is4hAligned &&
          adx >= Math.max(40, htfBypassMinADXForPaths) && // Must meet both 40 AND tightened threshold
          unifiedReversal.score < Math.min(35, htfBypassMaxReversalForPaths) && // Tightest reversal check
          !isExhausted &&
          !adxExhaustion.isExhausted;
        
        // Determine alignment status for bypass
        const alignmentMet = isParabolicMode || 
          hasRelaxedAlignment || 
          allTimeframesAligned || 
          !STRONG_TREND_HTF_BYPASS_PARAMS.REQUIRE_ALL_TF_ALIGNED;
        
        // ===== NEW: Extract stealth trend data for HTF bypass check =====
        const stealthTrendHTF = trendData.stealthTrend || { 
          detected: false, 
          htfBypassAllowed: false,
          direction: "neutral",
          stealthScore: 0,
          driftPercent: 0,
          positionMultiplier: 0.5,
          stopMultiplier: 0.6
        };
        
        // Check if stealth trend direction matches intended trade direction
        const stealthDirectionMatchesHTF = (
          (intendedTradeDirection === "short" && stealthTrendHTF.direction === "bearish") ||
          (intendedTradeDirection === "long" && stealthTrendHTF.direction === "bullish")
        );
        
        // NEW: Stealth HTF bypass path - when stealth trend detected with high score
        const stealthHTFBypassPath = stealthTrendHTF.detected && 
          stealthTrendHTF.htfBypassAllowed && 
          stealthDirectionMatchesHTF &&
          stealthTrendHTF.stealthScore >= 60; // Require high score for HTF bypass
        
        // ============= MEAN REVERSION GATE BYPASS SETUP =============
        // Uses the early detection signal from before PRE_RECOVERY gate
        // Sets up bypass flags for tiered gates based on direction alignment
        // PRE_RECOVERY_MR_OVERRIDE: Uses stacked position multiplier when in pre-recovery + direction flip
        let meanReversionSignal: ExhaustionSignal | null = earlyMeanReversionSignal;
        let meanReversionBypassGates: Set<string> = new Set();
        // Use stacked pre-recovery MR multiplier if PRE_RECOVERY_MR_OVERRIDE was applied
        let meanReversionPositionMultiplier = preRecoveryMROverrideApplied 
          ? preRecoveryMRPositionMultiplier 
          : (earlyMeanReversionSignal?.positionMultiplier ?? 1.0);
        let meanReversionQualityScore = earlyMeanReversionSignal?.qualityScore ?? 0;
        let meanReversionActive = false;
        
        // If direction flip was applied, the signal already matches the (new) derivedDirection
        if (meanReversionDirectionFlipApplied && meanReversionSignal?.detected && meanReversionSignal?.allowed) {
          // Direction flip means MR detection matches current direction - set up bypasses
          meanReversionSignal.gateBypasses.forEach(bypass => {
            if (bypass.allowedDirection === derivedDirection) {
              meanReversionBypassGates.add(bypass.gate);
            }
          });
          meanReversionActive = meanReversionBypassGates.size > 0;
          
          const overrideType = preRecoveryMROverrideApplied ? 'PRE_RECOVERY_MR_OVERRIDE' : 'direction flip';
          logger.forSymbol(symbol).info(
            `${LOG_CATEGORIES.SUCCESS} 🔄 MEAN_REVERSION gate bypass active (from ${overrideType}): ` +
            `${Array.from(meanReversionBypassGates).join(', ')} | Position: ${(meanReversionPositionMultiplier * 100).toFixed(0)}%`
          );
        } else if (meanReversionSignal?.detected && meanReversionSignal?.allowed) {
          // No flip - check if detection matches intended direction (original logic)
          const meanReversionMatchesDirection = 
            (meanReversionSignal.direction === 'long' && intendedTradeDirection === 'long') ||
            (meanReversionSignal.direction === 'short' && intendedTradeDirection === 'short');
          
          if (meanReversionMatchesDirection) {
            // Set bypass flags for the gate system - direction-aware
            meanReversionSignal.gateBypasses.forEach(bypass => {
              if (bypass.allowedDirection === intendedTradeDirection) {
                meanReversionBypassGates.add(bypass.gate);
              }
            });
            
            meanReversionPositionMultiplier = meanReversionSignal.positionMultiplier;
            meanReversionQualityScore = meanReversionSignal.qualityScore;
            meanReversionActive = meanReversionBypassGates.size > 0;
            
            if (meanReversionActive) {
              logger.forSymbol(symbol).info(
                `${LOG_CATEGORIES.SUCCESS} 🔄 MEAN_REVERSION bypass active: ${meanReversionSignal.direction?.toUpperCase()} ` +
                `(confidence=${meanReversionSignal.confidence.toFixed(0)}%, gates=${Array.from(meanReversionBypassGates).join(', ')})`
              );
            }
          } else if (meanReversionSignal.direction) {
            // Detected opposite direction - this is a signal AGAINST our current direction
            // Direction flip should have been handled earlier, but log if it wasn't
            logger.forSymbol(symbol).debug(
              `[MEAN_REVERSION] Direction mismatch: ${meanReversionSignal.direction?.toUpperCase()} vs intended ${intendedTradeDirection?.toUpperCase()}`
            );
          }
        }
        
        // Helper function to check if a gate should be bypassed for mean reversion
        const shouldBypassForMeanReversion = (gateName: string, direction: string): boolean => {
          if (!meanReversionActive) return false;
          if (!meanReversionBypassGates.has(gateName)) return false;
          // Ensure bypass is direction-specific
          const bypass = meanReversionSignal?.gateBypasses.find(b => b.gate === gateName);
          return bypass?.allowedDirection === direction;
        };
        
        // PHASE 4: ADX Rising + Directional Bypass (per technical review refinement)
        // When ADX is rising strongly AND 1h trend matches direction, allow bypass
        // This prevents blocking valid longs during trending markets
        const adxRisingDirectionalBypass = (
          ADX_RISING_DIRECTIONAL_BYPASS_PARAMS.ENABLED &&
          adxSlopeForBypass >= ADX_RISING_DIRECTIONAL_BYPASS_PARAMS.MIN_ADX_SLOPE && // ADX rising strongly (>= 0.5)
          adx >= ADX_RISING_DIRECTIONAL_BYPASS_PARAMS.MIN_ADX &&                     // Minimum ADX (>= 15)
          unifiedReversal.score < ADX_RISING_DIRECTIONAL_BYPASS_PARAMS.MAX_REVERSAL_SCORE && // No reversal signals
          !isExhausted &&
          // REFINEMENT: Require directional confirmation (1h trend matches derived direction)
          (!ADX_RISING_DIRECTIONAL_BYPASS_PARAMS.REQUIRE_DIRECTIONAL_CONFIRMATION || (
            (derivedDirection === 'long' && tf1hDir === 'bullish') ||
            (derivedDirection === 'short' && tf1hDir === 'bearish')
          ))
        );
        
        // ============= TIER 2 HTF BYPASS ELIGIBILITY =============
        // High ADX bypass path - use the earlier-defined tightened thresholds
        // htfBypassMinADXForPaths and htfBypassMaxReversalForPaths are defined above (line ~5089)
        const highADXBypassPathTightened = is4hAligned &&
          adx >= Math.max(40, htfBypassMinADXForPaths) && // Must meet both 40 AND bypass min
          unifiedReversal.score < Math.min(35, htfBypassMaxReversalForPaths) && // Tightest of both
          !isExhausted &&
          !adxExhaustion.isExhausted;
        
        // FIXED: Allow bypass if high ADX path is met, even without rising slope
        // OR if stealth HTF bypass is valid
        // OR if ADX rising directional bypass is valid (NEW - Phase 4)
        // TIGHTENED: Use HTF_EXTREME_HARD_GATES thresholds (htfBypassMinADXForPaths=35, htfBypassMaxReversalForPaths=45)
        // NEW: Also allow bypass for mean reversion trades
        const canBypassHTFGate = (
          STRONG_TREND_HTF_BYPASS_PARAMS.ENABLED &&
          adx >= htfBypassMinADXForPaths &&  // TIGHTENED: 35 instead of 25
          unifiedReversal.score < htfBypassMaxReversalForPaths &&  // TIGHTENED: 45 instead of 50
          !isExhausted &&
          (
            // Path 1: Normal bypass with slope requirement
            (adxSlopeMeetsRequirement && (alignmentMet || alternativeBypassPath)) ||
            // Path 2: High ADX (40+) with 4h alignment - no slope requirement (TIGHTENED)
            highADXBypassPathTightened
          )
        ) || stealthHTFBypassPath      // Path 3: Stealth trend with high score
          || adxRisingDirectionalBypass // Path 4: ADX rising + directional confirmation
          || meanReversionActive;       // Path 5: Mean reversion detected - bypass for counter-trend entries
        
        // Determine position size based on bypass type
        // TIGHTENED: Use HTF_EXTREME_HARD_GATES.BYPASS_POSITION_REDUCTION as maximum cap
        const htfBypassMaxPosition = HTF_EXTREME_HARD_GATES.BYPASS_POSITION_REDUCTION ?? 0.50;
        
        const getBypassPositionMultiplier = () => {
          // All bypass position sizes are CAPPED at htfBypassMaxPosition (50%)
          // NEW: Mean reversion bypass - use the calculated mean reversion multiplier
          if (meanReversionActive) {
            return Math.min(meanReversionPositionMultiplier, htfBypassMaxPosition);
          } else if (stealthHTFBypassPath) {
            return Math.min(stealthTrendHTF.positionMultiplier, htfBypassMaxPosition);
          } else if (adxRisingDirectionalBypass) {
            // PHASE 4: ADX Rising Directional bypass - use configured multiplier (capped)
            return Math.min(ADX_RISING_DIRECTIONAL_BYPASS_PARAMS.POSITION_SIZE_MULTIPLIER, htfBypassMaxPosition);
          } else if (isParabolicMode) {
            // Parabolic mode - strongest confidence, but still capped
            return htfBypassMaxPosition; // Was 0.65, now capped at 0.50
          } else if (adx >= relaxedAlignmentMinADX && allTimeframesAligned) {
            // Strong ADX + full alignment - capped bypass size
            return htfBypassMaxPosition;
          } else if (hasRelaxedAlignment) {
            // Relaxed alignment (4h only) - reduced from cap
            return htfBypassMaxPosition * 0.9; // 45%
          } else if (alternativeBypassPath) {
            // Alternative path (rising slope) - conservative
            return htfBypassMaxPosition * 0.9; // 45%
          } else if (adx >= htfBypassMinADXForPaths) {
            // ADX meets tightened bypass threshold
            return htfBypassMaxPosition;
          } else if (highADXBypassPathTightened) {
            // High ADX (40+) path - conservative due to potentially falling slope
            return htfBypassMaxPosition * 0.9; // 45%
          } else {
            // Fallback - most conservative
            return htfBypassMaxPosition * 0.8; // 40%
          }
        };
        // ============= TIER 0: DEEP STOCHRSI EXTREME HARD GATE (NO EXCEPTIONS) =============
        // Tier 0 is the most restrictive - absolute block at K < 5 or K > 95
        // When K < 5 (deeply oversold) or K > 95 (deeply overbought), bounce/reversal probability is ~80%+
        // NO EXCEPTIONS: Not even strong ADX, momentum, or trend confirmation can override this gate
        // EXCEPTION: Mean reversion LONG at deeply oversold (K < 5) IS allowed - that's the entry signal
        if (DEEP_STOCHRSI_HARD_GATE.ENABLED) {
          // Tier 0: Block ALL shorts when deeply oversold (K < 5)
          // Mean reversion LONG bypass: When detecting a bounce opportunity, allow LONG at K < 5
          const tier0OversoldBypass = shouldBypassForMeanReversion('TIER_0_DEEP_OVERSOLD', 'long') && 
                                       intendedTradeDirection === 'long';
          
          if (intendedTradeDirection === "short" && stochRsiK4h < DEEP_STOCHRSI_HARD_GATE.DEEP_OVERSOLD_K_THRESHOLD) {
            rejectedByHardGates++;
            perSymbolGateAttribution.set(symbol, { gate: 'TIER_0_DEEP_OVERSOLD', details: `K=${stochRsiK4h.toFixed(1)} < ${DEEP_STOCHRSI_HARD_GATE.DEEP_OVERSOLD_K_THRESHOLD}` });
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} 🚫 TIER 0 (DEEP) OVERSOLD GATE - Blocking SHORT at 4h K=${stochRsiK4h.toFixed(1)} < ${DEEP_STOCHRSI_HARD_GATE.DEEP_OVERSOLD_K_THRESHOLD} (NO EXCEPTIONS)`);
            logger.forSymbol(symbol).info(`   → Bounce probability ~80%+ at K < ${DEEP_STOCHRSI_HARD_GATE.DEEP_OVERSOLD_K_THRESHOLD}, %B=${percentB.toFixed(1)}`);
            await logRejectionWithAI(
              supabase, userId, symbol,
              `TIER 0 (DEEP) OVERSOLD GATE: SHORT blocked - 4h StochRSI K=${stochRsiK4h.toFixed(1)} is deeply oversold (< ${DEEP_STOCHRSI_HARD_GATE.DEEP_OVERSOLD_K_THRESHOLD})`,
              { 
                gate: "TIER_0_DEEP_OVERSOLD",
                tier: 0,
                direction: "short",
                stochRsiK4h: stochRsiK4h.toFixed(1),
                threshold: DEEP_STOCHRSI_HARD_GATE.DEEP_OVERSOLD_K_THRESHOLD,
                percentB: percentB.toFixed(1),
                adx: adx.toFixed(1),
                 allowStrongTrendOverride: STRONG_TREND_TIER0_OVERRIDE.ENABLED,
                meanReversionBypass: false,
                message: `Bounce probability extremely high (~80%+) at K=${stochRsiK4h.toFixed(1)}, blocking SHORT with NO EXCEPTIONS`
              },
              trendData,
              false,
              earlyOrderFlowAnalysis
            );
            continue;
          }
          
          // Log if mean reversion bypass allowed a LONG at deeply oversold
          if (tier0OversoldBypass && stochRsiK4h < DEEP_STOCHRSI_HARD_GATE.DEEP_OVERSOLD_K_THRESHOLD) {
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} 🔄 TIER 0 BYPASSED for MEAN_REVERSION_LONG at K=${stochRsiK4h.toFixed(1)}`);
          }
          
          // Tier 0: Block ALL longs when deeply overbought (K > 95)
          // Mean reversion SHORT bypass: When detecting a reversal opportunity, allow SHORT at K > 95
          const tier0OverboughtBypass = shouldBypassForMeanReversion('TIER_0_DEEP_OVERBOUGHT', 'short') && 
                                         intendedTradeDirection === 'short';
          
          if (intendedTradeDirection === "long" && stochRsiK4h > DEEP_STOCHRSI_HARD_GATE.DEEP_OVERBOUGHT_K_THRESHOLD) {
            rejectedByHardGates++;
            perSymbolGateAttribution.set(symbol, { gate: 'TIER_0_DEEP_OVERBOUGHT', details: `K=${stochRsiK4h.toFixed(1)} > ${DEEP_STOCHRSI_HARD_GATE.DEEP_OVERBOUGHT_K_THRESHOLD}` });
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} 🚫 TIER 0 (DEEP) OVERBOUGHT GATE - Blocking LONG at 4h K=${stochRsiK4h.toFixed(1)} > ${DEEP_STOCHRSI_HARD_GATE.DEEP_OVERBOUGHT_K_THRESHOLD} (NO EXCEPTIONS)`);
            logger.forSymbol(symbol).info(`   → Pullback probability ~80%+ at K > ${DEEP_STOCHRSI_HARD_GATE.DEEP_OVERBOUGHT_K_THRESHOLD}, %B=${percentB.toFixed(1)}`);
            await logRejectionWithAI(
              supabase, userId, symbol,
              `TIER 0 (DEEP) OVERBOUGHT GATE: LONG blocked - 4h StochRSI K=${stochRsiK4h.toFixed(1)} is deeply overbought (> ${DEEP_STOCHRSI_HARD_GATE.DEEP_OVERBOUGHT_K_THRESHOLD})`,
              { 
                gate: "TIER_0_DEEP_OVERBOUGHT",
                tier: 0,
                direction: "long",
                stochRsiK4h: stochRsiK4h.toFixed(1),
                threshold: DEEP_STOCHRSI_HARD_GATE.DEEP_OVERBOUGHT_K_THRESHOLD,
                percentB: percentB.toFixed(1),
                adx: adx.toFixed(1),
                 allowStrongTrendOverride: STRONG_TREND_TIER0_OVERRIDE.ENABLED,
                meanReversionBypass: false,
                message: `Pullback probability extremely high (~80%+) at K=${stochRsiK4h.toFixed(1)}, blocking LONG with NO EXCEPTIONS`
              },
              trendData,
              false,
              earlyOrderFlowAnalysis
            );
            continue;
          }
          
          // Log if mean reversion bypass allowed a SHORT at deeply overbought
          if (tier0OverboughtBypass && stochRsiK4h > DEEP_STOCHRSI_HARD_GATE.DEEP_OVERBOUGHT_K_THRESHOLD) {
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} 🔄 TIER 0 BYPASSED for MEAN_REVERSION_SHORT at K=${stochRsiK4h.toFixed(1)}`);
          }
        }
        
        // ============= TIER 1: SEVERE STOCHRSI GATE (NO BYPASS ALLOWED - EXCEPT MEAN REVERSION) =============
        // This catches K values between Deep Gate (5/95) and Severe threshold (15/85)
        // Unlike Tier 2, this gate has NO bypass - if K is in severe zone, block the trade
        // EXCEPTION: Mean reversion trades CAN bypass Tier 1 if detection confidence is high
        // FIX #1 (Audit): Added formal isExtremeMeanReversion check for bypass validation
        if (!severeGateAllowsBypass) {
          // Check for mean reversion Tier 1 bypasses
          const tier1OversoldBypass = shouldBypassForMeanReversion('TIER_1_SEVERE_OVERSOLD', 'long');
          const tier1OverboughtBypass = shouldBypassForMeanReversion('TIER_1_SEVERE_OVERBOUGHT', 'short');
          
          // FIX #1 (Audit): Formal isExtremeMeanReversion check requires:
          // 1. Regime must be RANGE, LATE_TREND, or EXHAUSTION
          // 2. Reversal score >= 55
          // 3. Momentum state != "confirmed"
          const currentRegime = directionResult?.regime || 'UNKNOWN';
          const momentumState = momentum?.state || 'none';
          const tier1MRValidForLong = tier1OversoldBypass && 
            isExtremeMeanReversion(currentRegime, unifiedReversal.score, momentumState);
          const tier1MRValidForShort = tier1OverboughtBypass && 
            isExtremeMeanReversion(currentRegime, unifiedReversal.score, momentumState);
          
          // Block SHORT when K is in severe oversold zone (5 <= K < 15)
          // BUT allow LONG if mean reversion detected AND formal criteria met
          if (intendedTradeDirection === "short" && isSevereOversold) {
            rejectedByHardGates++;
            perSymbolGateAttribution.set(symbol, { gate: 'SEVERE_HTF_OVERSOLD_BLOCK', details: `K=${stochRsiK4h.toFixed(1)} in severe zone [${DEEP_STOCHRSI_HARD_GATE.DEEP_OVERSOLD_K_THRESHOLD}-${severeOversoldThreshold})` });
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} 🚫 SEVERE OVERSOLD GATE - Blocking SHORT at 4h K=${stochRsiK4h.toFixed(1)} (in severe zone ${DEEP_STOCHRSI_HARD_GATE.DEEP_OVERSOLD_K_THRESHOLD}-${severeOversoldThreshold}, NO BYPASS)`);
            logger.forSymbol(symbol).info(`   → Bounce probability ~70%+ in severe zone, %B=${percentB.toFixed(1)}, ADX=${adx.toFixed(1)}`);
            await logRejectionWithAI(
              supabase, userId, symbol,
              `SEVERE OVERSOLD GATE (TIER 1): SHORT blocked - 4h StochRSI K=${stochRsiK4h.toFixed(1)} is in severe oversold zone (${DEEP_STOCHRSI_HARD_GATE.DEEP_OVERSOLD_K_THRESHOLD} <= K < ${severeOversoldThreshold})`,
              { 
                gate: "SEVERE_HTF_OVERSOLD",
                tier: 1,
                direction: "short",
                stochRsiK4h: stochRsiK4h.toFixed(1),
                severeThreshold: severeOversoldThreshold,
                deepThreshold: DEEP_STOCHRSI_HARD_GATE.DEEP_OVERSOLD_K_THRESHOLD,
                percentB: percentB.toFixed(1),
                adx: adx.toFixed(1),
                bypassAllowed: false,
                meanReversionBypass: false,
                message: `Bounce probability ~70%+ in severe zone K=${stochRsiK4h.toFixed(1)}, blocking SHORT with NO bypass allowed`
              },
              trendData,
              false,
              earlyOrderFlowAnalysis
            );
            continue;
          }
          
          // Log if mean reversion bypass allowed a LONG in severe oversold zone
          // FIX #1: Now includes formal criteria validation
          if (tier1MRValidForLong && isSevereOversold && intendedTradeDirection === 'long') {
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} 🔄 TIER 1 BYPASSED for MEAN_REVERSION_LONG at K=${stochRsiK4h.toFixed(1)} (FIX#1: regime=${currentRegime}, revScore=${unifiedReversal.score}, momState=${momentumState})`);
          }
          
          // Block LONG when K is in severe overbought zone (85 < K <= 95)
          // BUT allow SHORT if mean reversion detected (that's the entry opportunity)
          if (intendedTradeDirection === "long" && isSevereOverbought) {
            rejectedByHardGates++;
            perSymbolGateAttribution.set(symbol, { gate: 'SEVERE_HTF_OVERBOUGHT_BLOCK', details: `K=${stochRsiK4h.toFixed(1)} in severe zone (${severeOverboughtThreshold}-${DEEP_STOCHRSI_HARD_GATE.DEEP_OVERBOUGHT_K_THRESHOLD}]` });
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} 🚫 SEVERE OVERBOUGHT GATE - Blocking LONG at 4h K=${stochRsiK4h.toFixed(1)} (in severe zone ${severeOverboughtThreshold}-${DEEP_STOCHRSI_HARD_GATE.DEEP_OVERBOUGHT_K_THRESHOLD}, NO BYPASS)`);
            logger.forSymbol(symbol).info(`   → Pullback probability ~70%+ in severe zone, %B=${percentB.toFixed(1)}, ADX=${adx.toFixed(1)}`);
            await logRejectionWithAI(
              supabase, userId, symbol,
              `SEVERE OVERBOUGHT GATE (TIER 1): LONG blocked - 4h StochRSI K=${stochRsiK4h.toFixed(1)} is in severe overbought zone (${severeOverboughtThreshold} < K <= ${DEEP_STOCHRSI_HARD_GATE.DEEP_OVERBOUGHT_K_THRESHOLD})`,
              { 
                gate: "SEVERE_HTF_OVERBOUGHT",
                tier: 1,
                direction: "long",
                stochRsiK4h: stochRsiK4h.toFixed(1),
                severeThreshold: severeOverboughtThreshold,
                deepThreshold: DEEP_STOCHRSI_HARD_GATE.DEEP_OVERBOUGHT_K_THRESHOLD,
                percentB: percentB.toFixed(1),
                adx: adx.toFixed(1),
                bypassAllowed: false,
                meanReversionBypass: false,
                message: `Pullback probability ~70%+ in severe zone K=${stochRsiK4h.toFixed(1)}, blocking LONG with NO bypass allowed`
              },
              trendData,
              false,
              earlyOrderFlowAnalysis
            );
            continue;
          }
          
          // Log if mean reversion bypass allowed a SHORT in severe overbought zone
          // FIX #1: Now includes formal criteria validation
          if (tier1MRValidForShort && isSevereOverbought && intendedTradeDirection === 'short') {
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} 🔄 TIER 1 BYPASSED for MEAN_REVERSION_SHORT at K=${stochRsiK4h.toFixed(1)} (FIX#1: regime=${currentRegime}, revScore=${unifiedReversal.score}, momState=${momentumState})`);
          }
        }
        
        // ============= TIER 2: STANDARD HTF GATE (BYPASS ALLOWED) =============
        // Include mean reversion as a valid bypass type
        // Log bypass decision details for debugging (only for Tier 2 - standard combined gate)
        if (isHTFOverbought || isHTFOversold) {
          const bypassType = meanReversionActive ? 'MEAN_REVERSION' :
            stealthHTFBypassPath ? 'STEALTH_TREND' :
            adxRisingDirectionalBypass ? 'ADX_RISING_DIRECTIONAL' :
            isParabolicMode ? 'PARABOLIC' : 
            highADXBypassPath ? 'HIGH_ADX_4H_ALIGNED' :
            hasRelaxedAlignment ? 'RELAXED_ALIGNMENT' : 
            alternativeBypassPath ? 'RISING_SLOPE' : 
            allTimeframesAligned ? 'FULL_ALIGNMENT' : 'BASIC';
          
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} TIER 2 HTF BYPASS CHECK: type=${bypassType}, ADX=${adx.toFixed(1)}, slope=${adxSlopeForBypass.toFixed(3)}, 4h=${tf4hDir}, 1h=${tf1hDir}, 30m=${tf30mDir}`);
          logger.forSymbol(symbol).info(`   → canBypass=${canBypassHTFGate}, parabolic=${isParabolicMode}, relaxedAlign=${hasRelaxedAlignment}, altPath=${alternativeBypassPath}, highADX=${highADXBypassPath}, stealth=${stealthHTFBypassPath}, adxRisingDir=${adxRisingDirectionalBypass}, exhausted=${isExhausted}`);
          
          // Extra logging for stealth bypass
          if (stealthTrendHTF.detected) {
            logger.forSymbol(symbol).info(`   🕵️ STEALTH: detected=${stealthTrendHTF.detected}, htfBypass=${stealthTrendHTF.htfBypassAllowed}, score=${stealthTrendHTF.stealthScore}, drift=${stealthTrendHTF.driftPercent?.toFixed(2) || 0}%, dirMatch=${stealthDirectionMatchesHTF}`);
          }
        }
        
        // Block SHORT continuation at 4h oversold (bounce is statistically likely)
        if (intendedTradeDirection === "short" && isHTFOversold) {
          if (canBypassHTFGate) {
            // Allow with reduced position size - use dynamic multiplier based on bypass type
            strongTrendHTFBypassApplied = true;
            trendContinuationPositionMultiplier = getBypassPositionMultiplier();
            const bypassType = stealthHTFBypassPath ? 'STEALTH_TREND' : isParabolicMode ? 'PARABOLIC' : highADXBypassPath ? 'HIGH_ADX' : hasRelaxedAlignment ? 'RELAXED_ALIGN' : alternativeBypassPath ? 'RISING_SLOPE' : 'BASIC';
            
            // FIX #2 (Audit): Re-calculate reversal score with stricter StochRSI cap to prevent double punishment
            const bypassedReversalScore = calculateUnifiedReversalScore(trendData, trend, symbol, { stochRSITier2Bypassed: true });
            reversalPositionMultiplier = bypassedReversalScore.positionSizeMultiplier;
            
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} ${stealthHTFBypassPath ? '🕵️' : ''} HTF BYPASS [${bypassType}]: Allowing SHORT at 4h oversold`);
            logger.forSymbol(symbol).info(`   ADX=${adx.toFixed(1)} slope=${adxSlopeForBypass.toFixed(3)}, 4h=${tf4hDir}, reversal=${unifiedReversal.score}→${bypassedReversalScore.score} (FIX#2), exhausted=${isExhausted}${stealthHTFBypassPath ? `, stealth_drift=${stealthTrendHTF.driftPercent?.toFixed(2) || 0}%, stealth_score=${stealthTrendHTF.stealthScore}` : ''}`);
            logger.forSymbol(symbol).info(`   Position size reduced to ${(trendContinuationPositionMultiplier * 100).toFixed(0)}%`);
          } else {
            rejectedByHardGates++;
            perSymbolGateAttribution.set(symbol, { gate: 'HTF_EXTREME_OVERSOLD_BLOCK', details: `K=${stochRsiK4h.toFixed(1)}, %B=${percentB.toFixed(1)}` });
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} HTF EXTREME GATE - Blocking SHORT at 4h oversold (StochRSI K=${stochRsiK4h.toFixed(1)} <= ${HTF_EXTREME_HARD_GATES.STOCHRSI_OVERSOLD_BLOCK}, %B=${percentB.toFixed(1)} <= ${HTF_EXTREME_HARD_GATES.PERCENT_B_OVERSOLD_BLOCK})`);

            // Enhanced debug logging for bypass failure
            logger.forSymbol(symbol).debug(`   Bypass check: ADX=${adx.toFixed(1)}>=${STRONG_TREND_HTF_BYPASS_PARAMS.MIN_ADX}? slope=${adxSlopeForBypass.toFixed(3)}>=${STRONG_TREND_HTF_BYPASS_PARAMS.MIN_ADX_SLOPE}? reversal=${unifiedReversal.score}<${STRONG_TREND_HTF_BYPASS_PARAMS.MAX_REVERSAL_SCORE}?`);
            logger.forSymbol(symbol).debug(`   → 4hAligned=${is4hAligned}, relaxedAlign=${hasRelaxedAlignment}, altPath=${alternativeBypassPath}, parabolic=${isParabolicMode}, exhausted=${isExhausted}`);
            
            await logRejectionWithAI(
              supabase, userId, symbol,
              `IMPROVEMENT 1 - HTF EXTREME GATE: SHORT blocked at 4h oversold (K=${stochRsiK4h.toFixed(1)}, %B=${percentB.toFixed(1)})`,
              { 
                gate: "HTF_EXTREME_OVERSOLD_BLOCK",
                derivedDirection,
                direction: "short",
                stochRsiK4h: stochRsiK4h.toFixed(1),
                percentB: percentB.toFixed(1),
                thresholds: {
                  stochRsiK_threshold: HTF_EXTREME_HARD_GATES.STOCHRSI_OVERSOLD_BLOCK,
                  percentB_threshold: HTF_EXTREME_HARD_GATES.PERCENT_B_OVERSOLD_BLOCK
                },
                bypassCheck: {
                  adx: adx.toFixed(1),
                  adxSlope: adxSlopeForBypass.toFixed(3),
                  is4hAligned,
                  hasRelaxedAlignment,
                  alternativeBypassPath,
                  isParabolicMode,
                  reversalScore: unifiedReversal.score,
                  isExhausted,
                  canBypass: false,
                  stealthTrend: {
                    detected: stealthTrendHTF.detected,
                    htfBypassAllowed: stealthTrendHTF.htfBypassAllowed,
                    score: stealthTrendHTF.stealthScore,
                    drift: stealthTrendHTF.driftPercent,
                    directionMatch: stealthDirectionMatchesHTF
                  }
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
            // Allow with reduced position size - use dynamic multiplier based on bypass type
            strongTrendHTFBypassApplied = true;
            trendContinuationPositionMultiplier = getBypassPositionMultiplier();
            const bypassType = stealthHTFBypassPath ? 'STEALTH_TREND' : isParabolicMode ? 'PARABOLIC' : highADXBypassPath ? 'HIGH_ADX' : hasRelaxedAlignment ? 'RELAXED_ALIGN' : alternativeBypassPath ? 'RISING_SLOPE' : 'BASIC';
            
            // FIX #2 (Audit): Re-calculate reversal score with stricter StochRSI cap to prevent double punishment
            const bypassedReversalScore = calculateUnifiedReversalScore(trendData, trend, symbol, { stochRSITier2Bypassed: true });
            reversalPositionMultiplier = bypassedReversalScore.positionSizeMultiplier;
            
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} ${stealthHTFBypassPath ? '🕵️' : ''} HTF BYPASS [${bypassType}]: Allowing LONG at 4h overbought`);
            logger.forSymbol(symbol).info(`   ADX=${adx.toFixed(1)} slope=${adxSlopeForBypass.toFixed(3)}, 4h=${tf4hDir}, reversal=${unifiedReversal.score}→${bypassedReversalScore.score} (FIX#2), exhausted=${isExhausted}${stealthHTFBypassPath ? `, stealth_drift=${stealthTrendHTF.driftPercent?.toFixed(2) || 0}%, stealth_score=${stealthTrendHTF.stealthScore}` : ''}`);
            logger.forSymbol(symbol).info(`   Position size reduced to ${(trendContinuationPositionMultiplier * 100).toFixed(0)}%`);
          } else {
            rejectedByHardGates++;
            perSymbolGateAttribution.set(symbol, { gate: 'HTF_EXTREME_OVERBOUGHT_BLOCK', details: `K=${stochRsiK4h.toFixed(1)}, %B=${percentB.toFixed(1)}` });
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} HTF EXTREME GATE - Blocking LONG at 4h overbought (StochRSI K=${stochRsiK4h.toFixed(1)} >= ${HTF_EXTREME_HARD_GATES.STOCHRSI_OVERBOUGHT_BLOCK}, %B=${percentB.toFixed(1)} >= ${HTF_EXTREME_HARD_GATES.PERCENT_B_OVERBOUGHT_BLOCK})`);

            // Enhanced debug logging for bypass failure
            logger.forSymbol(symbol).debug(`   Bypass check: ADX=${adx.toFixed(1)}>=${STRONG_TREND_HTF_BYPASS_PARAMS.MIN_ADX}? slope=${adxSlopeForBypass.toFixed(3)}>=${STRONG_TREND_HTF_BYPASS_PARAMS.MIN_ADX_SLOPE}? reversal=${unifiedReversal.score}<${STRONG_TREND_HTF_BYPASS_PARAMS.MAX_REVERSAL_SCORE}?`);
            logger.forSymbol(symbol).debug(`   → 4hAligned=${is4hAligned}, relaxedAlign=${hasRelaxedAlignment}, altPath=${alternativeBypassPath}, parabolic=${isParabolicMode}, exhausted=${isExhausted}`);
            
            await logRejectionWithAI(
              supabase, userId, symbol,
              `IMPROVEMENT 1 - HTF EXTREME GATE: LONG blocked at 4h overbought (K=${stochRsiK4h.toFixed(1)}, %B=${percentB.toFixed(1)})`,
              { 
                gate: "HTF_EXTREME_OVERBOUGHT_BLOCK",
                derivedDirection,
                direction: "long",
                stochRsiK4h: stochRsiK4h.toFixed(1),
                percentB: percentB.toFixed(1),
                thresholds: {
                  stochRsiK_threshold: HTF_EXTREME_HARD_GATES.STOCHRSI_OVERBOUGHT_BLOCK,
                  percentB_threshold: HTF_EXTREME_HARD_GATES.PERCENT_B_OVERBOUGHT_BLOCK
                },
                bypassCheck: {
                  adx: adx.toFixed(1),
                  adxSlope: adxSlopeForBypass.toFixed(3),
                  is4hAligned,
                  hasRelaxedAlignment,
                  alternativeBypassPath,
                  isParabolicMode,
                  reversalScore: unifiedReversal.score,
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
        
        // SHORT gate: Determine appropriate %B threshold based on trend, squeeze, ranging, AND master regime
        // Master regime overrides take precedence when active (PARABOLIC or STRONG_TREND)
        let shortMinPercentB: number;
        if (isRegimeOverrideActive) {
          // REGIME OVERRIDE: Use regime-based minimum (can be negative for shorts in strong downtrends)
          shortMinPercentB = regimeBollingerMinPercentB;
          logger.forSymbol(symbol).debug(`${LOG_CATEGORIES.GATE} BOLLINGER SHORT: Using regime override min %B=${shortMinPercentB} (${masterRegime.regime})`);
        } else if (isStrongBearishTrend) {
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
        
        // ============= PHASE 1 FIX: NEGATIVE %B MOMENTUM CONTINUATION FOR SHORTS =============
        // When %B < 0 (price below lower Bollinger band), this is momentum continuation, NOT bounce risk
        // Allow shorts with momentum confirmation (MACD expanding OR 1h directional OR strong price move)
        // NEW: Must also respect StochRSI floor - if K is too deeply oversold, bypass is blocked
        let negativePercentBBypassApplied = false;
        let negativePercentBPositionMultiplier = 1.0;
        
        // Get StochRSI floor for negative %B bypass (default 15 if not set)
        const stochRsiFloorForNegativeB = BOLLINGER_ENTRY_GATES.SHORT_BELOW_ZERO_MIN_STOCHRSI_K ?? 15;
        const stochRsiAboveFloor = stochRsiK4h >= stochRsiFloorForNegativeB;
        
        if (intendedTradeDirection === "short" && percentB < 0 && 
            BOLLINGER_ENTRY_GATES.ALLOW_SHORTS_BELOW_ZERO_PERCENT_B) {
          
          // NEW: Check StochRSI floor first - block bypass if too deeply oversold
          if (!stochRsiAboveFloor) {
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} NEGATIVE %B BYPASS BLOCKED BY STOCHRSI FLOOR: K=${stochRsiK4h.toFixed(1)} < ${stochRsiFloorForNegativeB}`);
            logger.forSymbol(symbol).info(`   → %B=${percentB.toFixed(1)} < 0 but StochRSI too oversold for SHORT continuation`);
          } else {
            // FIX: Use stochFilterTrend1h/stochFilterConf1h instead of timeframes object
            // Also check for strong price moves as additional confirmation
            const priceMove = trendData.priceActionMomentum?.movePercent || 0;
            const hasPriceActionConfirmation = Math.abs(priceMove) >= 1.0 && priceMove < 0; // Negative = bearish
            
            // Check momentum confirmation - multiple sources
            const hasMomentumConfirmation = !BOLLINGER_ENTRY_GATES.SHORT_BELOW_ZERO_REQUIRE_MOMENTUM ||
              momentum?.macdExpanding === true ||
              (stochFilterTrend1h === "bearish" && stochFilterConf1h >= 55) ||
              hasPriceActionConfirmation;
            
            if (hasMomentumConfirmation) {
              negativePercentBBypassApplied = true;
              negativePercentBPositionMultiplier = BOLLINGER_ENTRY_GATES.SHORT_BELOW_ZERO_POSITION_REDUCTION;
              const confirmSource = momentum?.macdExpanding ? "MACD expanding" : 
                (stochFilterTrend1h === "bearish" && stochFilterConf1h >= 55) ? `1h bearish ${stochFilterConf1h.toFixed(0)}%` :
                hasPriceActionConfirmation ? `price drop ${priceMove.toFixed(1)}%` : "unknown";
              logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} 🔥 NEGATIVE %B BYPASS ACTIVATED: %B=${percentB.toFixed(1)} < 0 via ${confirmSource}`);
              logger.forSymbol(symbol).info(`   → MACD expanding=${momentum?.macdExpanding}, 1h=${stochFilterTrend1h} ${stochFilterConf1h.toFixed(0)}%, price=${priceMove.toFixed(1)}%, K=${stochRsiK4h.toFixed(1)} (floor=${stochRsiFloorForNegativeB})`);
              logger.forSymbol(symbol).info(`   → Position size reduced to ${(negativePercentBPositionMultiplier * 100).toFixed(0)}% for safety`);
            } else {
              logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} NEGATIVE %B BYPASS FAILED: %B=${percentB.toFixed(1)} but no momentum confirmation`);
              logger.forSymbol(symbol).info(`   → MACD expanding=${momentum?.macdExpanding}, 1h=${stochFilterTrend1h} ${stochFilterConf1h.toFixed(0)}%, price=${priceMove.toFixed(1)}%`);
            }
          }
        }
        
        // ============= BOLLINGER TIERED BYPASS FOR STRONG BEARISH TRENDS (SHORT) =============
        // Allows SHORT entries at %B 3-10 when trend is confirmed strong bearish
        // Similar to StochRSI tiered bypass - graduated access based on ADX/DI
        let bollingerBypassAppliedShort = false;
        let bollingerBypassTierShort: 'none' | 'tier1' | 'tier2' | 'tier3' = 'none';
        let bollingerBypassPositionMultiplierShort = 1.0;
        
        // Skip standard Bollinger bypass checks if negative %B bypass already applied
        if (intendedTradeDirection === "short" && percentB < shortMinPercentB && !negativePercentBBypassApplied) {
          // Check if bypass is enabled and within bypassable range (down to 3, not below)
          if (BOLLINGER_TIERED_BYPASS_PARAMS.ENABLED && 
              percentB < BOLLINGER_TIERED_BYPASS_PARAMS.BASE_MIN_PERCENT_B_SHORT &&
              percentB >= BOLLINGER_TIERED_BYPASS_PARAMS.ABSOLUTE_MIN_PERCENT_B_SHORT) {
            
            // Get DI gap for bypass check (use ADXResult properties)
            const diPlus = fullAdxResult.plusDI ?? 25;
            const diMinus = fullAdxResult.minusDI ?? 25;
            const diGap = fullAdxResult.diGap ?? Math.abs(diPlus - diMinus);
            const diAlignedShort = diMinus > diPlus; // For SHORT: DI- must be > DI+
            
            // Check exhaustion (must NOT be exhausted)
            const isExhausted = adxExhaustion?.isExhausted === true;
            const isContinuation = adxExhaustion?.isContinuation === true;
            
            // HTF alignment check - 4h must be bearish for SHORT bypass
            // When HTF bypass is already applied, relax confidence requirement since trend was validated
            const htfBypassConfidenceThresholdShort = strongTrendHTFBypassApplied 
              ? BOLLINGER_TIERED_BYPASS_PARAMS.MIN_HTF_4H_CONFIDENCE - 10  // Lower threshold (55% instead of 65%)
              : BOLLINGER_TIERED_BYPASS_PARAMS.MIN_HTF_4H_CONFIDENCE;
            const htf4hAlignedForBypassShort = stochFilterTrend4h === "bearish" && 
                                               stochFilterConf4h >= htfBypassConfidenceThresholdShort;
            
            // Determine eligible tier (check from highest to lowest)
            const tier3EligibleShort = (
              adx >= BOLLINGER_TIERED_BYPASS_PARAMS.TIER3.MIN_ADX &&
              adxSlope >= BOLLINGER_TIERED_BYPASS_PARAMS.TIER3.MIN_ADX_SLOPE &&
              diGap >= BOLLINGER_TIERED_BYPASS_PARAMS.TIER3.MIN_DI_GAP &&
              diAlignedShort &&
              !isExhausted &&
              htf4hAlignedForBypassShort
            );
            
            const tier2EligibleShort = (
              adx >= BOLLINGER_TIERED_BYPASS_PARAMS.TIER2.MIN_ADX &&
              adxSlope >= BOLLINGER_TIERED_BYPASS_PARAMS.TIER2.MIN_ADX_SLOPE &&
              diGap >= BOLLINGER_TIERED_BYPASS_PARAMS.TIER2.MIN_DI_GAP &&
              diAlignedShort &&
              !isExhausted &&
              htf4hAlignedForBypassShort &&
              (isContinuation || !BOLLINGER_TIERED_BYPASS_PARAMS.TIER2.REQUIRE_CONTINUATION)
            );
            
            const tier1EligibleShort = (
              adx >= BOLLINGER_TIERED_BYPASS_PARAMS.TIER1.MIN_ADX &&
              adxSlope >= BOLLINGER_TIERED_BYPASS_PARAMS.TIER1.MIN_ADX_SLOPE &&
              diGap >= BOLLINGER_TIERED_BYPASS_PARAMS.TIER1.MIN_DI_GAP &&
              diAlignedShort &&
              !isExhausted &&
              htf4hAlignedForBypassShort &&
              (isContinuation || !BOLLINGER_TIERED_BYPASS_PARAMS.TIER1.REQUIRE_CONTINUATION)
            );
            
            // Determine tier and thresholds (for SHORT: %B must be >= tier minimum)
            if (tier3EligibleShort && percentB >= BOLLINGER_TIERED_BYPASS_PARAMS.TIER3.MIN_PERCENT_B_SHORT) {
              bollingerBypassTierShort = 'tier3';
              bollingerBypassPositionMultiplierShort = BOLLINGER_TIERED_BYPASS_PARAMS.TIER3.POSITION_SIZE / 100;
              bollingerBypassAppliedShort = true;
            } else if (tier2EligibleShort && percentB >= BOLLINGER_TIERED_BYPASS_PARAMS.TIER2.MIN_PERCENT_B_SHORT) {
              bollingerBypassTierShort = 'tier2';
              bollingerBypassPositionMultiplierShort = BOLLINGER_TIERED_BYPASS_PARAMS.TIER2.POSITION_SIZE / 100;
              bollingerBypassAppliedShort = true;
            } else if (tier1EligibleShort && percentB >= BOLLINGER_TIERED_BYPASS_PARAMS.TIER1.MIN_PERCENT_B_SHORT) {
              bollingerBypassTierShort = 'tier1';
              bollingerBypassPositionMultiplierShort = BOLLINGER_TIERED_BYPASS_PARAMS.TIER1.POSITION_SIZE / 100;
              bollingerBypassAppliedShort = true;
            }
            
            // ============= NEW: PRICE ACTION CONFIRMATION FOR SHORT BYPASS =============
            // At least ONE confirmation must pass to prevent chasing single-candle expansions
            let priceActionConfirmedShort = false;
            let priceActionResultShort: BollingerPriceActionResult | null = null;
            
            if (bollingerBypassAppliedShort && BOLLINGER_TIERED_BYPASS_PARAMS.REQUIRE_PRICE_ACTION_CONFIRMATION) {
              priceActionResultShort = checkBollingerBypassPriceAction(
                klineData,
                "short",
                smartPullback?.pullbackDepth ?? 0,
                currentATR,
                {
                  shallowPullbackMaxDepth: BOLLINGER_TIERED_BYPASS_PARAMS.SHALLOW_PULLBACK_MAX_DEPTH,
                  structureLookbackBars: BOLLINGER_TIERED_BYPASS_PARAMS.STRUCTURE_LOOKBACK_BARS,
                  consolidationMaxCandleAtr: BOLLINGER_TIERED_BYPASS_PARAMS.CONSOLIDATION_MAX_CANDLE_ATR,
                  consolidationLookbackBars: BOLLINGER_TIERED_BYPASS_PARAMS.CONSOLIDATION_LOOKBACK_BARS,
                  consolidationCompressionFactor: BOLLINGER_TIERED_BYPASS_PARAMS.CONSOLIDATION_COMPRESSION_FACTOR,
                  wickRejectionLookbackBars: BOLLINGER_TIERED_BYPASS_PARAMS.WICK_REJECTION_LOOKBACK_BARS,
                  wickRejectionMinCount: BOLLINGER_TIERED_BYPASS_PARAMS.WICK_REJECTION_MIN_COUNT,
                  wickRejectionWickPercent: BOLLINGER_TIERED_BYPASS_PARAMS.WICK_REJECTION_WICK_PERCENT
                }
              );
              
              priceActionConfirmedShort = priceActionResultShort.anyConfirmationPassed;
              
              if (!priceActionConfirmedShort) {
                // Price action not confirmed - revoke bypass
                bollingerBypassAppliedShort = false;
                bollingerBypassTierShort = 'none';
                bollingerBypassPositionMultiplierShort = 1.0;
                
                logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} BOLLINGER BYPASS REVOKED (SHORT) - No price action confirmation`);
                logger.forSymbol(symbol).info(`   → ${priceActionResultShort.reasons.join(' | ')}`);
              }
            }
            
            if (bollingerBypassAppliedShort) {
              logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} 🎯 BOLLINGER TIERED BYPASS [${bollingerBypassTierShort.toUpperCase()}] - Allowing SHORT at %B=${percentB.toFixed(1)}`);
              logger.forSymbol(symbol).info(`   → ADX=${adx.toFixed(1)}, slope=${adxSlope.toFixed(2)}, DI gap=${diGap.toFixed(1)}, DI->${diMinus.toFixed(1)} > DI+=${diPlus.toFixed(1)}`);
              logger.forSymbol(symbol).info(`   → Position size reduced to ${(bollingerBypassPositionMultiplierShort * 100).toFixed(0)}% due to low %B`);
              if (priceActionResultShort) {
                const confirmedList = Object.entries(priceActionResultShort.confirmations)
                  .filter(([_, v]) => v)
                  .map(([k, _]) => k)
                  .join(', ');
                logger.forSymbol(symbol).info(`   → Price action confirmed: ${confirmedList || 'none'}`);
              }
            } else {
              // Log why bypass failed
              logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} BOLLINGER BYPASS FAILED for SHORT at %B=${percentB.toFixed(1)}`);
              logger.forSymbol(symbol).info(`   → ADX=${adx.toFixed(1)} (tier1>=${BOLLINGER_TIERED_BYPASS_PARAMS.TIER1.MIN_ADX}), slope=${adxSlope.toFixed(2)}`);
              logger.forSymbol(symbol).info(`   → DI gap=${diGap.toFixed(1)}, DI- aligned=${diAlignedShort}, exhausted=${isExhausted}`);
              const htfRelaxedNote = strongTrendHTFBypassApplied ? ` [HTF relaxed: ${htfBypassConfidenceThresholdShort}%]` : '';
              logger.forSymbol(symbol).info(`   → 4h aligned=${htf4hAlignedForBypassShort} (trend=${stochFilterTrend4h}, conf=${stochFilterConf4h.toFixed(0)}%${htfRelaxedNote})`);
            }
          }
          
          // If bypass not applied AND negative %B bypass not applied, block the entry
          if (!bollingerBypassAppliedShort && !negativePercentBBypassApplied) {
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
                negativePercentBBypassChecked: percentB < 0,
                message: "Shorts at low %B blocked - no bearish trend confirmation"
              },
              trendData,
              false,
              earlyOrderFlowAnalysis
            );
            continue;
          }
        }
        
        // Log if trend context or bypass allowed a SHORT that would otherwise be blocked
        if (intendedTradeDirection === "short" && 
            percentB < BOLLINGER_ENTRY_GATES.SHORT_MIN_PERCENT_B && 
            (isBearishTrendConfirmed || isStrongBearishTrend || bollingerBypassAppliedShort || negativePercentBBypassApplied)) {
          const relaxationReasonShort = negativePercentBBypassApplied
            ? `negative %B bypass (${(negativePercentBPositionMultiplier * 100).toFixed(0)}% size)`
            : bollingerBypassAppliedShort 
              ? `tiered bypass ${bollingerBypassTierShort} (${(bollingerBypassPositionMultiplierShort * 100).toFixed(0)}% size)`
              : `trend confirmation (4h ${stochFilterConf4h.toFixed(0)}%)`;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} TREND CONTEXT RELAXATION: Allowing SHORT at %B=${percentB.toFixed(1)} via ${relaxationReasonShort}, ADX=${adx.toFixed(1)}`);
        }
        
        // LONG gate: Determine appropriate %B threshold based on trend, squeeze, ranging, AND master regime
        // Master regime overrides take precedence when active (PARABOLIC or STRONG_TREND)
        let longMaxPercentB: number;
        if (isRegimeOverrideActive) {
          // REGIME OVERRIDE: Use regime-based maximum (can be >100 for longs in strong uptrends)
          longMaxPercentB = regimeBollingerMaxPercentB;
          logger.forSymbol(symbol).debug(`${LOG_CATEGORIES.GATE} BOLLINGER LONG: Using regime override max %B=${longMaxPercentB} (${masterRegime.regime})`);
        } else if (isStrongBullishTrend) {
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
        
        // ============= BOLLINGER TIERED BYPASS FOR STRONG TRENDS =============
        // Allows LONG entries at %B 90-97 when trend is confirmed strong
        // Similar to StochRSI tiered bypass - graduated access based on ADX/DI
        let bollingerBypassApplied = false;
        let bollingerBypassTier: 'none' | 'tier1' | 'tier2' | 'tier3' = 'none';
        let bollingerBypassPositionMultiplier = 1.0;
        
        if (intendedTradeDirection === "long" && percentB > longMaxPercentB) {
          // Determine the absolute ceiling based on whether HTF bypass was already applied
          // When HTF bypass is active, we know trend is strong - allow higher %B with reduced size
          const absoluteMaxPercentB = strongTrendHTFBypassApplied 
            ? BOLLINGER_TIERED_BYPASS_PARAMS.HTF_BYPASS_EXTENDED_MAX_PERCENT_B_LONG 
            : BOLLINGER_TIERED_BYPASS_PARAMS.ABSOLUTE_MAX_PERCENT_B_LONG;
          
          // Check if bypass is enabled and within bypassable range
          if (BOLLINGER_TIERED_BYPASS_PARAMS.ENABLED && 
              percentB > BOLLINGER_TIERED_BYPASS_PARAMS.BASE_MAX_PERCENT_B_LONG &&
              percentB <= absoluteMaxPercentB) {
            
            // Get DI gap for bypass check (use ADXResult properties)
            const diPlus = fullAdxResult.plusDI ?? 25;
            const diMinus = fullAdxResult.minusDI ?? 25;
            const diGap = fullAdxResult.diGap ?? Math.abs(diPlus - diMinus);
            const diAligned = (derivedDirection === "long" && diPlus > diMinus) ||
                              (derivedDirection === "short" && diMinus > diPlus);
            
            // Check exhaustion (must NOT be exhausted)
            const isExhausted = adxExhaustion?.isExhausted === true;
            const isContinuation = adxExhaustion?.isContinuation === true;
            
            // HTF alignment check
            // When HTF bypass is already applied, relax confidence requirement since trend was validated
            const htfBypassConfidenceThreshold = strongTrendHTFBypassApplied 
              ? BOLLINGER_TIERED_BYPASS_PARAMS.MIN_HTF_4H_CONFIDENCE - 10  // Lower threshold (55% instead of 65%)
              : BOLLINGER_TIERED_BYPASS_PARAMS.MIN_HTF_4H_CONFIDENCE;
            const htf4hAlignedForBypass = stochFilterTrend4h === "bullish" && 
                                           stochFilterConf4h >= htfBypassConfidenceThreshold;
            
            // Determine eligible tier (check from highest to lowest)
            const tier3Eligible = (
              adx >= BOLLINGER_TIERED_BYPASS_PARAMS.TIER3.MIN_ADX &&
              adxSlope >= BOLLINGER_TIERED_BYPASS_PARAMS.TIER3.MIN_ADX_SLOPE &&
              diGap >= BOLLINGER_TIERED_BYPASS_PARAMS.TIER3.MIN_DI_GAP &&
              diAligned &&
              !isExhausted &&
              htf4hAlignedForBypass
            );
            
            const tier2Eligible = (
              adx >= BOLLINGER_TIERED_BYPASS_PARAMS.TIER2.MIN_ADX &&
              adxSlope >= BOLLINGER_TIERED_BYPASS_PARAMS.TIER2.MIN_ADX_SLOPE &&
              diGap >= BOLLINGER_TIERED_BYPASS_PARAMS.TIER2.MIN_DI_GAP &&
              diAligned &&
              !isExhausted &&
              htf4hAlignedForBypass &&
              (isContinuation || !BOLLINGER_TIERED_BYPASS_PARAMS.TIER2.REQUIRE_CONTINUATION)
            );
            
            const tier1Eligible = (
              adx >= BOLLINGER_TIERED_BYPASS_PARAMS.TIER1.MIN_ADX &&
              adxSlope >= BOLLINGER_TIERED_BYPASS_PARAMS.TIER1.MIN_ADX_SLOPE &&
              diGap >= BOLLINGER_TIERED_BYPASS_PARAMS.TIER1.MIN_DI_GAP &&
              diAligned &&
              !isExhausted &&
              htf4hAlignedForBypass &&
              (isContinuation || !BOLLINGER_TIERED_BYPASS_PARAMS.TIER1.REQUIRE_CONTINUATION)
            );
            
            // Determine tier and thresholds
            // When HTF bypass is active, extend the %B thresholds for each tier
            const htfExtendedBonus = strongTrendHTFBypassApplied ? 15 : 0; // Allow 15% higher %B
            const tier3MaxPercentB = BOLLINGER_TIERED_BYPASS_PARAMS.TIER3.MAX_PERCENT_B_LONG + htfExtendedBonus;
            const tier2MaxPercentB = BOLLINGER_TIERED_BYPASS_PARAMS.TIER2.MAX_PERCENT_B_LONG + htfExtendedBonus;
            const tier1MaxPercentB = BOLLINGER_TIERED_BYPASS_PARAMS.TIER1.MAX_PERCENT_B_LONG + htfExtendedBonus;
            
            // Additional position size reduction for extended %B
            const htfExtendedPositionReduction = (strongTrendHTFBypassApplied && percentB > 97) ? 0.65 : 1.0;
            
            if (tier3Eligible && percentB <= tier3MaxPercentB) {
              bollingerBypassTier = 'tier3';
              bollingerBypassPositionMultiplier = (BOLLINGER_TIERED_BYPASS_PARAMS.TIER3.POSITION_SIZE / 100) * htfExtendedPositionReduction;
              bollingerBypassApplied = true;
            } else if (tier2Eligible && percentB <= tier2MaxPercentB) {
              bollingerBypassTier = 'tier2';
              bollingerBypassPositionMultiplier = (BOLLINGER_TIERED_BYPASS_PARAMS.TIER2.POSITION_SIZE / 100) * htfExtendedPositionReduction;
              bollingerBypassApplied = true;
            } else if (tier1Eligible && percentB <= tier1MaxPercentB) {
              bollingerBypassTier = 'tier1';
              bollingerBypassPositionMultiplier = (BOLLINGER_TIERED_BYPASS_PARAMS.TIER1.POSITION_SIZE / 100) * htfExtendedPositionReduction;
              bollingerBypassApplied = true;
            }
            
            // ============= NEW: PRICE ACTION CONFIRMATION FOR LONG BYPASS =============
            // At least ONE confirmation must pass to prevent chasing single-candle expansions
            let priceActionConfirmedLong = false;
            let priceActionResultLong: BollingerPriceActionResult | null = null;
            
            if (bollingerBypassApplied && BOLLINGER_TIERED_BYPASS_PARAMS.REQUIRE_PRICE_ACTION_CONFIRMATION) {
              priceActionResultLong = checkBollingerBypassPriceAction(
                klineData,
                "long",
                smartPullback?.pullbackDepth ?? 0,
                currentATR,
                {
                  shallowPullbackMaxDepth: BOLLINGER_TIERED_BYPASS_PARAMS.SHALLOW_PULLBACK_MAX_DEPTH,
                  structureLookbackBars: BOLLINGER_TIERED_BYPASS_PARAMS.STRUCTURE_LOOKBACK_BARS,
                  consolidationMaxCandleAtr: BOLLINGER_TIERED_BYPASS_PARAMS.CONSOLIDATION_MAX_CANDLE_ATR,
                  consolidationLookbackBars: BOLLINGER_TIERED_BYPASS_PARAMS.CONSOLIDATION_LOOKBACK_BARS,
                  consolidationCompressionFactor: BOLLINGER_TIERED_BYPASS_PARAMS.CONSOLIDATION_COMPRESSION_FACTOR,
                  wickRejectionLookbackBars: BOLLINGER_TIERED_BYPASS_PARAMS.WICK_REJECTION_LOOKBACK_BARS,
                  wickRejectionMinCount: BOLLINGER_TIERED_BYPASS_PARAMS.WICK_REJECTION_MIN_COUNT,
                  wickRejectionWickPercent: BOLLINGER_TIERED_BYPASS_PARAMS.WICK_REJECTION_WICK_PERCENT
                }
              );
              
              priceActionConfirmedLong = priceActionResultLong.anyConfirmationPassed;
              
              if (!priceActionConfirmedLong) {
                // Price action not confirmed - revoke bypass
                bollingerBypassApplied = false;
                bollingerBypassTier = 'none';
                bollingerBypassPositionMultiplier = 1.0;
                
                logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} BOLLINGER BYPASS REVOKED (LONG) - No price action confirmation`);
                logger.forSymbol(symbol).info(`   → ${priceActionResultLong.reasons.join(' | ')}`);
              }
            }
            
            if (bollingerBypassApplied) {
              const htfExtendedNote = (strongTrendHTFBypassApplied && percentB > 97) ? ' [HTF EXTENDED]' : '';
              logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} 🎯 BOLLINGER TIERED BYPASS [${bollingerBypassTier.toUpperCase()}]${htfExtendedNote} - Allowing LONG at %B=${percentB.toFixed(1)}`);
              logger.forSymbol(symbol).info(`   → ADX=${adx.toFixed(1)}, slope=${adxSlope.toFixed(2)}, DI gap=${diGap.toFixed(1)}, 4h conf=${stochFilterConf4h.toFixed(0)}%`);
              logger.forSymbol(symbol).info(`   → Position size reduced to ${(bollingerBypassPositionMultiplier * 100).toFixed(0)}% due to elevated %B${htfExtendedNote ? ' (extra reduction for extended %B)' : ''}`);
              if (priceActionResultLong) {
                const confirmedList = Object.entries(priceActionResultLong.confirmations)
                  .filter(([_, v]) => v)
                  .map(([k, _]) => k)
                  .join(', ');
                logger.forSymbol(symbol).info(`   → Price action confirmed: ${confirmedList || 'none'}`);
              }
            } else {
              // Log why bypass failed
              logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} BOLLINGER BYPASS FAILED at %B=${percentB.toFixed(1)}`);
              logger.forSymbol(symbol).info(`   → ADX=${adx.toFixed(1)} (tier1>=${BOLLINGER_TIERED_BYPASS_PARAMS.TIER1.MIN_ADX}), slope=${adxSlope.toFixed(2)} (tier1>=${BOLLINGER_TIERED_BYPASS_PARAMS.TIER1.MIN_ADX_SLOPE})`);
              logger.forSymbol(symbol).info(`   → DI gap=${diGap.toFixed(1)} (tier1>=${BOLLINGER_TIERED_BYPASS_PARAMS.TIER1.MIN_DI_GAP}), exhausted=${isExhausted}, continuation=${isContinuation}`);
              const htfRelaxedNote = strongTrendHTFBypassApplied ? ` [HTF relaxed: ${htfBypassConfidenceThreshold}%]` : '';
              logger.forSymbol(symbol).info(`   → 4h aligned=${htf4hAlignedForBypass} (conf=${stochFilterConf4h.toFixed(0)}%, trend=${stochFilterTrend4h}${htfRelaxedNote})`);
            }
          }
          
          // If bypass not applied, block the entry
          if (!bollingerBypassApplied) {
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
        }
        
        // Log if trend context or bypass allowed a LONG that would otherwise be blocked
        if (intendedTradeDirection === "long" && 
            percentB > BOLLINGER_ENTRY_GATES.LONG_MAX_PERCENT_B && 
            (isBullishTrendConfirmed || isStrongBullishTrend || bollingerBypassApplied)) {
          const relaxationReason = bollingerBypassApplied 
            ? `tiered bypass ${bollingerBypassTier} (${(bollingerBypassPositionMultiplier * 100).toFixed(0)}% size)`
            : `trend confirmation (4h ${stochFilterConf4h.toFixed(0)}%)`;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} TREND CONTEXT RELAXATION: Allowing LONG at %B=${percentB.toFixed(1)} via ${relaxationReason}, ADX=${adx.toFixed(1)}`);
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
          
          // ============= PHASE 5 FIX: VERY HIGH ADX RISING GATE RELAXATION =============
          // When ADX >= 50 and 4h is aligned, ignore the "K <= D" (not rising) condition
          // for K values in the 80-92 range. Only hard block if K >= 93 AND K <= D
          // This fixes false rejections in very strong trends during consolidation
          const veryHighAdxBypassAllowed = (
            adx >= 50 &&
            stochFilterTrend4h === "bullish" &&
            stochFilterConf4h >= 60 &&
            stochRsiK4h >= 80 &&
            stochRsiK4h < 93 &&  // Only relax for K 80-92, not at true extremes
            !hasBearishDivergence
          );
          
          if (veryHighAdxBypassAllowed && !stochRsiRising) {
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} VERY HIGH ADX BYPASS: ADX=${adx.toFixed(1)} >= 50, K=${stochRsiK4h.toFixed(1)} in 80-92 zone, 4h aligned - ignoring "K <= D" condition`);
          }
          
          // MANDATORY: StochRSI must be rising (K > D) for any extreme overbought entry
          // EXCEPTION 1: Allow if momentum continuation conditions are met
          // EXCEPTION 2: Allow if very high ADX bypass conditions are met (Phase 5)
          // EXCEPTION 3: Allow if ADAPTIVE_FULL_MODE bypass is active (skipStochRSIGate)
          if (!stochRsiRising && !momentumContinuationAllowedLong && !veryHighAdxBypassAllowed && !skipStochRSIGate) {
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
                },
                veryHighAdxBypassCheck: {
                  adx: adx.toFixed(1),
                  adxSufficient: adx >= 50,
                  kInRange: stochRsiK4h >= 80 && stochRsiK4h < 93,
                  htfAligned: stochFilterTrend4h === "bullish" && stochFilterConf4h >= 60,
                  noDivergence: !hasBearishDivergence,
                  result: veryHighAdxBypassAllowed
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
          // RELAXED: When HTF bypass was already applied (confirming strong trend), accept neutral 1h
          const tf1hAcceptable = stochFilterTrend1h === "bullish" || 
            (strongTrendHTFBypassApplied && stochFilterTrend1h !== "bearish"); // Neutral OK if HTF bypassed
          
          const baseSafetyConditions = stochFilterTrend4h === "bullish" && 
            tf1hAcceptable && 
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
            const htfBypassNote = strongTrendHTFBypassApplied ? ` [HTF bypassed, 1h=${stochFilterTrend1h} relaxed]` : '';
            const blockReason = !baseSafetyConditions
              ? `base safety conditions failed (4h=${stochFilterTrend4h}, 1h=${stochFilterTrend1h}, divergence=${hasBearishDivergence}, rising=${stochRsiRising})${htfBypassNote}`
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
          
          // ============= PHASE 5 FIX: VERY HIGH ADX FALLING GATE RELAXATION (SHORT) =============
          // Mirror of LONG bypass: When ADX >= 50 and 4h is aligned bearish, ignore the "K >= D" 
          // (not falling) condition for K values in the 8-20 range. Only hard block if K <= 7 AND K >= D
          // This fixes false rejections in very strong downtrends during consolidation
          const veryHighAdxBypassAllowedShort = (
            adx >= 50 &&
            stochFilterTrend4h === "bearish" &&
            stochFilterConf4h >= 60 &&
            stochRsiK4h > 7 &&    // Only relax for K 8-20, not at true extremes
            stochRsiK4h <= 20 &&
            !hasBullishDivergence
          );
          
          if (veryHighAdxBypassAllowedShort && !stochRsiFalling) {
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} VERY HIGH ADX BYPASS (SHORT): ADX=${adx.toFixed(1)} >= 50, K=${stochRsiK4h.toFixed(1)} in 8-20 zone, 4h aligned bearish - ignoring "K >= D" condition`);
          }
          
          // MANDATORY: StochRSI must be falling (K < D) for any extreme oversold entry
          // EXCEPTION 1: Allow if momentum continuation conditions are met
          // EXCEPTION 2: Allow if very high ADX bypass conditions are met (Phase 5)
          // EXCEPTION 3: Allow if ADAPTIVE_FULL_MODE bypass is active (skipStochRSIGate)
          if (!stochRsiFalling && !momentumContinuationAllowed && !veryHighAdxBypassAllowedShort && !skipStochRSIGate) {
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
                },
                veryHighAdxBypassCheck: {
                  adx: adx.toFixed(1),
                  adxSufficient: adx >= 50,
                  kInRange: stochRsiK4h > 7 && stochRsiK4h <= 20,
                  htfAligned: stochFilterTrend4h === "bearish" && stochFilterConf4h >= 60,
                  noDivergence: !hasBullishDivergence,
                  result: veryHighAdxBypassAllowedShort
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
        
        // Log StochRSI status for monitoring - use regime-aware thresholds
        const effectiveOversoldThreshold = isRegimeOverrideActive ? regimeStochRsiMinK : STOCHRSI_THRESHOLDS.OVERSOLD;
        const effectiveOverboughtThreshold = isRegimeOverrideActive ? regimeStochRsiMaxK : STOCHRSI_THRESHOLDS.OVERBOUGHT;
        if (stochRsiK4h < effectiveOversoldThreshold || stochRsiK4h > effectiveOverboughtThreshold) {
          const regimeNote = isRegimeOverrideActive ? ` [REGIME: oversold<${effectiveOversoldThreshold}, overbought>${effectiveOverboughtThreshold}]` : '';
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.STOCHRSI} 4h StochRSI K=${stochRsiK4h.toFixed(1)} (proceeding with ${intendedTradeDirection || "neutral"} direction)${regimeNote}`);
        }

        // ================= HARD ENTRY GATES =================
        // These are non-negotiable requirements for ANY signal
        // Quality score should RANK good trades, not RESCUE weak ones
        
        // ============= PHASE 2: HARD CONTRADICTION CHECK =============
        // Block if momentum/MACD strongly contradicts derived direction
        const hardContradiction = checkHardContradictions(trendData, derivedDirection);
        if (hardContradiction.hasContradiction) {
          rejectedByHardGates++;
          perSymbolGateAttribution.set(symbol, { 
            gate: (hardContradiction.contradictionType || 'HARD_CONTRADICTION') as GateType, 
            details: hardContradiction.details || '' 
          });
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} HARD BLOCK: ${hardContradiction.contradictionType} - ${hardContradiction.details}`);
          await logRejectionWithAI(
            supabase, userId, symbol,
            `HARD CONTRADICTION: ${hardContradiction.contradictionType} - ${hardContradiction.details}`,
            {
              gate: hardContradiction.contradictionType,
              details: hardContradiction.details,
              derivedDirection,
              momentumScore: trendData?.momentum?.momentumScore,
              macdSlope: trendData?.momentum?.macdSlope,
              adx: adx.toFixed(1)
            },
            trendData,
            riskParams.ai_analysis_enabled !== false,
            earlyOrderFlowAnalysis
          );
          continue;
        }
        
        // ============= ADX GATE v1.1: MINIMAL SPEC =============
        // v1.1 Role Discipline: Only answers "Is there enough market energy to trade?"
        // REMOVED in v1.1: QUIET_TREND, STEALTH_TREND, LOW_ADX_TREND_EXCEPTION
        // Only 2 exception paths allowed: Squeeze Expansion + Early Ignition
        
        // v1.1: Track ADX gate results
        let adxGateV11Passed = false;
        let adxGateV11Exception: 'SQUEEZE_EXPANSION' | 'EARLY_IGNITION' | 'ADAPTIVE_PASS' | null = null;
        let adxGateV11PositionMultiplier = 1.0;
        let adxGateV11Reason = "";
        
        const adxGateEnabled = ADX_GATE_V1_1.ENABLED;
        // v1.1: ADX slope for exception checks
        const adxSlopeV11 = fullAdxResult.adxSlope ?? 0;
        
        // ============= ADX GATE v1.1: MINIMAL SPEC IMPLEMENTATION =============
        // Role Discipline: Only answers "Is there enough market energy to trade?"
        // Only 2 exception paths allowed: Squeeze Expansion + Early Ignition
        // REMOVED in v1.1: QUIET_TREND, STEALTH_TREND, LOW_ADX_TREND_EXCEPTION
        
        let squeezeBreakoutActive = false;
        let squeezePositionMultiplier = 1.0;
        let earlyIgnitionActive = false;
        let earlyIgnitionPositionMultiplier = 1.0;
        
        // Get the v1.1 adaptive threshold based on regime
        const v11AdaptiveThreshold = ADX_GATE_V1_1.ADAPTIVE_THRESHOLDS[regime.regime] ?? 
          ADX_GATE_V1_1.ADAPTIVE_THRESHOLDS.RANGE;
        
        // Log v1.1 gate check
        if (ADX_GATE_V1_1.LOG_GATE_CHECKS) {
          logger.forSymbol(symbol).info(
            `${LOG_CATEGORIES.GATE} ADX_GATE_v1.1: ADX=${adx.toFixed(1)}, slope=${adxSlopeV11.toFixed(3)}, ` +
            `regime=${regime.regime}, adaptiveThreshold=${v11AdaptiveThreshold}, hardFloor=${ADX_GATE_V1_1.HARD_FLOOR}`
          );
        }
        
        // ===== TIER 0: HARD FLOOR (NO EXCEPTIONS) =====
        if (adx < ADX_GATE_V1_1.HARD_FLOOR) {
          // Absolute block - no exceptions allowed below ADX 18
          rejectedByHardGates++;
          perSymbolGateAttribution.set(symbol, { 
            gate: 'ADX_TOO_LOW', 
            details: `ADX=${adx.toFixed(1)} < ${ADX_GATE_V1_1.HARD_FLOOR} (HARD FLOOR - no exceptions)` 
          });
          await logRejectionWithAI(
            supabase, userId, symbol,
            `HARD GATE (v1.1): ADX ${adx.toFixed(1)} below absolute floor ${ADX_GATE_V1_1.HARD_FLOOR} - structural no-trend`,
            { 
              gate: "ADX_TOO_LOW",
              tier: "TIER_0_HARD_FLOOR",
              adx: adx.toFixed(1),
              hardFloor: ADX_GATE_V1_1.HARD_FLOOR,
              regime: regime.regime,
              adxSlope: adxSlopeV11.toFixed(3),
              derivedDirection,
              // NEW: Momentum context for ADX gate cognitive completeness
              momentumScore: smartMomentum?.score ?? 0,
              momentumDirection: smartMomentum?.direction ?? 'neutral',
              momentumState: momentum?.state ?? 'none',
              // NEW: Mean reversion context - was it checked? Did it qualify?
              meanReversionChecked: true,
              meanReversionDetected: earlyMeanReversionSignal?.detected ?? false,
              meanReversionDirection: earlyMeanReversionSignal?.direction ?? null,
              meanReversionScore: earlyMeanReversionSignal?.exhaustionScore ?? 0,
              meanReversionAllowed: earlyMeanReversionSignal?.allowed ?? false,
              // v1.1 bypass hints
              bypassHints: {
                needsADX: ADX_GATE_V1_1.HARD_FLOOR,
                message: "No exceptions below ADX 18. Wait for market energy to build."
              }
            },
            trendData,
            riskParams.ai_analysis_enabled !== false,
            earlyOrderFlowAnalysis
          );
          continue;
        }
        
        // ===== TRANSITIONAL ZONE (18-22): Only Squeeze or Early Ignition allowed =====
        if (adx < v11AdaptiveThreshold) {
          // ADX below adaptive threshold - check for v1.1 exceptions
          const isInTransitionalZone = adx >= ADX_GATE_V1_1.TRANSITIONAL_MIN && adx < ADX_GATE_V1_1.TRANSITIONAL_MAX;
          
          // Check Squeeze Expansion Exception first
          if (ADX_GATE_V1_1.SQUEEZE_EXPANSION.ENABLED && isInTransitionalZone) {
            const squeezeResult = isValidSqueezeBreakout(trendData, derivedDirection);
            
            if (squeezeResult.isValid) {
              // Squeeze Expansion exception approved
              squeezeBreakoutActive = true;
              squeezePositionMultiplier = ADX_GATE_V1_1.SQUEEZE_EXPANSION.POSITION_MULTIPLIER;
              
              if (ADX_GATE_V1_1.LOG_EXCEPTION_DETAILS) {
                logger.forSymbol(symbol).info(
                  `${LOG_CATEGORIES.SUCCESS} 🔄 SQUEEZE_EXPANSION (v1.1): ADX=${adx.toFixed(1)} allowed ` +
                  `(${squeezeResult.confidence}% confidence, ${(squeezePositionMultiplier * 100).toFixed(0)}% size)`
                );
                logger.forSymbol(symbol).debug(`   Squeeze check: ${JSON.stringify(squeezeResult.checkDetails)}`);
              }
              perSymbolGateAttribution.set(symbol, { 
                gate: 'SQUEEZE_EXPANSION_V11', 
                details: squeezeResult.reasons.join(", ") 
              });
            }
          }
          
          // Check Early Ignition Exception if squeeze didn't pass
          if (!squeezeBreakoutActive && ADX_GATE_V1_1.EARLY_IGNITION.ENABLED && isInTransitionalZone) {
            const ignitionResult = checkEarlyIgnitionException(trendData, derivedDirection, regime.regime);
            
            if (ignitionResult.isValid) {
              // Early Ignition exception approved
              earlyIgnitionActive = true;
              earlyIgnitionPositionMultiplier = ADX_GATE_V1_1.EARLY_IGNITION.POSITION_MULTIPLIER;
              
              if (ADX_GATE_V1_1.LOG_EXCEPTION_DETAILS) {
                logger.forSymbol(symbol).info(
                  `${LOG_CATEGORIES.SUCCESS} 🚀 EARLY_IGNITION (v1.1): ADX=${adx.toFixed(1)} allowed ` +
                  `(regime=${regime.regime}, slope=${adxSlopeV11.toFixed(3)}, ${(earlyIgnitionPositionMultiplier * 100).toFixed(0)}% size)`
                );
                logger.forSymbol(symbol).debug(`   Ignition check: ${JSON.stringify(ignitionResult.checkDetails)}`);
              }
              perSymbolGateAttribution.set(symbol, { 
                gate: 'EARLY_IGNITION_V11', 
                details: ignitionResult.reasons.join(", ") 
              });
            }
          }
          
          // If neither exception passed, block the signal
          if (!squeezeBreakoutActive && !earlyIgnitionActive) {
            // Get diagnostic info for squeeze and ignition checks
            const squeezeCheck = isValidSqueezeBreakout(trendData, derivedDirection);
            const ignitionCheck = checkEarlyIgnitionException(trendData, derivedDirection, regime.regime);
            
            rejectedByHardGates++;
            perSymbolGateAttribution.set(symbol, { 
              gate: 'ADX_TOO_LOW', 
              details: `ADX=${adx.toFixed(1)} < ${v11AdaptiveThreshold} (no v1.1 exception qualified)` 
            });
            await logRejectionWithAI(
              supabase, userId, symbol,
              `HARD GATE (v1.1): ADX ${adx.toFixed(1)} below adaptive threshold ${v11AdaptiveThreshold} (${regime.regime}) - no exception qualified`,
              { 
                gate: "ADX_TOO_LOW",
                tier: "TRANSITIONAL_ZONE",
                adx: adx.toFixed(1),
                adaptiveThreshold: v11AdaptiveThreshold,
                hardFloor: ADX_GATE_V1_1.HARD_FLOOR,
                regime: regime.regime,
                adxSlope: adxSlopeV11.toFixed(3),
                derivedDirection,
                // NEW: Momentum context for ADX gate cognitive completeness
                momentumScore: smartMomentum?.score ?? 0,
                momentumDirection: smartMomentum?.direction ?? 'neutral',
                momentumState: momentum?.state ?? 'none',
                // NEW: Mean reversion context - was it checked? Did it qualify?
                meanReversionChecked: true,
                meanReversionDetected: earlyMeanReversionSignal?.detected ?? false,
                meanReversionDirection: earlyMeanReversionSignal?.direction ?? null,
                meanReversionScore: earlyMeanReversionSignal?.exhaustionScore ?? 0,
                meanReversionAllowed: earlyMeanReversionSignal?.allowed ?? false,
                // v1.1 exception diagnostic
                squeezeCheck: {
                  wouldPass: squeezeCheck.isValid,
                  ...squeezeCheck.checkDetails,
                  failReasons: squeezeCheck.reasons
                },
                earlyIgnitionCheck: {
                  wouldPass: ignitionCheck.isValid,
                  ...ignitionCheck.checkDetails,
                  failReasons: ignitionCheck.reasons
                },
                // v1.1 bypass hints
                bypassHints: {
                  needsADX: v11AdaptiveThreshold,
                  needsSqueeze: squeezeCheck.reasons.filter(r => r.includes("not") || r.includes("No")),
                  needsIgnition: ignitionCheck.reasons.filter(r => r.includes("not") || r.includes("No")),
                }
              },
              trendData,
              riskParams.ai_analysis_enabled !== false,
              earlyOrderFlowAnalysis
            );
            continue;
          }
        } else {
          // ADX >= adaptive threshold - normal pass (1.0x size)
          logger.forSymbol(symbol).debug(
            `${LOG_CATEGORIES.SUCCESS} ADX_GATE_v1.1 PASS: ADX=${adx.toFixed(1)} >= ${v11AdaptiveThreshold} (regime=${regime.regime})`
          );
        }
        
        // ============= v1.1 POSITION SIZE APPLICATION =============
        // Apply squeeze breakout position size reduction if active
        if (squeezeBreakoutActive && squeezePositionMultiplier < 1.0) {
          reversalPositionMultiplier = Math.min(reversalPositionMultiplier, squeezePositionMultiplier);
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK} 🔄 Squeeze Expansion (v1.1) - position size capped at ${(squeezePositionMultiplier * 100).toFixed(0)}%`);
        }
        
        // Apply early ignition position size reduction if active
        if (earlyIgnitionActive && earlyIgnitionPositionMultiplier < 1.0) {
          reversalPositionMultiplier = Math.min(reversalPositionMultiplier, earlyIgnitionPositionMultiplier);
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK} 🚀 Early Ignition (v1.1) - position size capped at ${(earlyIgnitionPositionMultiplier * 100).toFixed(0)}%`);
        }

        // ============= LEGACY VARIABLE STUBS (v1.1 compatibility) =============
        // These variables are referenced elsewhere but were removed in v1.1
        // Set to false/1.0 to disable legacy exception paths
        const lowAdxTrendExceptionActive = false;
        const priceActionEarlyEntryActive = false;
        const priceActionEarlyPositionMultiplier = 1.0;

        // ============= NO_MOMENTUM_CONFIRMATION HARD GATE =============
        // RELAXED: Allow entry when momentum.state is "none" IF ADX >= 28 (strong trend exception)
        // This enables early entries when trend strength itself provides conviction
        // NEW: Also allow if trend acceleration detected (strong price move with ADX rising)
        // NEW: StochRSI-ADX alignment reduces threshold from 28 to 22 when indicators align
        // 
        // EXPERT REVIEW IMPROVEMENTS:
        // 1. Path 2 ADX Floor - "building"/"mixed" state requires ADX >= 20
        // 2. Exception Budget - Only first qualifying exception path is used (prevents stacking)
        // 3. Direction Bias - Premium overrides suggest direction, don't override centralized derivation
        const momentumState = momentum?.state || "none";
        const momentumConfirms = momentum?.confirms ?? false;
        
        // ============= EXCEPTION BUDGET TRACKING =============
        // Track which exception path is used (max 1 per signal to prevent stacking)
        // FIX #4 (Audit): Add exceptionDepth counter to ALL paths including Path 5
        let noMomentumExceptionUsed: NoMomentumExceptionType = null;
        let noMomentumExceptionMultiplier = 1.0;
        let noMomentumExceptionDepth = 0;  // Tracks total exceptions consumed
        
        // ============= PREMIUM OVERRIDE DIRECTION BIAS =============
        // Instead of directly setting direction, premium overrides set a "bias"
        // This bias informs direction derivation but doesn't override it
        let premiumOverrideBias: "bullish" | "bearish" | null = null;
        let premiumOverrideSource: string | null = null;
        
        // ============= DYNAMIC ADX THRESHOLD WITH STOCHRSI ALIGNMENT =============
        // When 1h bearish AND StochRSI < 20, OR 1h bullish AND StochRSI > 80,
        // reduce the strong trend exception threshold from 28 to 22
        let effectiveStrongTrendADX: number = ADX_THRESHOLDS.STRONG_TREND_EXCEPTION; // Default 23
        let stochRsiAdxAlignmentActive = false;
        
        if (STOCHRSI_ADX_ALIGNMENT_PARAMS.ENABLED) {
          const stochRsiAlignsWithBearish = 
            htfTrend1h === "bearish" && stochK1h < STOCHRSI_ADX_ALIGNMENT_PARAMS.BEARISH_STOCHRSI_THRESHOLD;
          const stochRsiAlignsWithBullish = 
            htfTrend1h === "bullish" && stochK1h > STOCHRSI_ADX_ALIGNMENT_PARAMS.BULLISH_STOCHRSI_THRESHOLD;
          
          if (stochRsiAlignsWithBearish || stochRsiAlignsWithBullish) {
            effectiveStrongTrendADX = STOCHRSI_ADX_ALIGNMENT_PARAMS.REDUCED_ADX_THRESHOLD as number;
            stochRsiAdxAlignmentActive = true;
            
            // Mark as first exception if exception budget enabled
            if (NO_MOMENTUM_GATE_PARAMS.ENABLE_EXCEPTION_BUDGET && !noMomentumExceptionUsed) {
              noMomentumExceptionUsed = "STOCHRSI_ADX_ALIGNMENT";
              noMomentumExceptionDepth++;  // FIX #4: Increment exception depth
              if (NO_MOMENTUM_GATE_PARAMS.LOG_EXCEPTION_USAGE) {
                logger.forSymbol(symbol).debug(`📊 EXCEPTION_BUDGET: Using STOCHRSI_ADX_ALIGNMENT as exception #${noMomentumExceptionDepth}`);
              }
            }
            
            logger.forSymbol(symbol).debug(`📊 STOCHRSI-ADX ALIGNMENT: 1h=${htfTrend1h}, StochK=${stochK1h.toFixed(1)} → ADX threshold reduced to ${effectiveStrongTrendADX}`);
          }
        }
        
        const isStrongTrendException = adx >= effectiveStrongTrendADX;
        
        // ============= PATH 2: STATE PRESENCE WITH ADX FLOOR =============
        // EXPERT REVIEW FIX: Path 2 (momentumState != "none") now requires ADX floor
        // This prevents "building" or "mixed" momentum from passing in dead markets (ADX < 20)
        let statePresencePasses = false;
        let statePresenceSkippedDueToADX = false;
        
        if (momentumState !== "none") {
          if (NO_MOMENTUM_GATE_PARAMS.ENABLE_PATH_2_ADX_FLOOR) {
            // NEW: Require ADX >= minimum for state presence path
            if (adx >= NO_MOMENTUM_GATE_PARAMS.STATE_PRESENCE_MIN_ADX) {
              statePresencePasses = true;
            } else {
              statePresenceSkippedDueToADX = true;
              if (NO_MOMENTUM_GATE_PARAMS.LOG_ADX_FLOOR_SKIPS) {
                logger.forSymbol(symbol).debug(`📊 PATH_2_ADX_FLOOR: momentumState="${momentumState}" but ADX=${adx.toFixed(1)} < ${NO_MOMENTUM_GATE_PARAMS.STATE_PRESENCE_MIN_ADX}, skipping to Path 3+`);
              }
            }
          } else {
            // Legacy behavior: state presence always passes
            statePresencePasses = true;
          }
        }
        
        // ============= PATH 3: STRONG TREND EXCEPTION =============
        // Check if ADX provides structural conviction (with exception budget)
        let strongTrendExceptionApplied = false;
        if (isStrongTrendException && !statePresencePasses && !momentumConfirms) {
          // Check exception budget
          if (!NO_MOMENTUM_GATE_PARAMS.ENABLE_EXCEPTION_BUDGET || !noMomentumExceptionUsed) {
            strongTrendExceptionApplied = true;
            if (NO_MOMENTUM_GATE_PARAMS.ENABLE_EXCEPTION_BUDGET && !noMomentumExceptionUsed) {
              noMomentumExceptionUsed = "STRONG_TREND";
              noMomentumExceptionDepth++;  // FIX #4: Increment exception depth
              if (NO_MOMENTUM_GATE_PARAMS.LOG_EXCEPTION_USAGE) {
                logger.forSymbol(symbol).debug(`📊 EXCEPTION_BUDGET: Using STRONG_TREND as exception #${noMomentumExceptionDepth} (ADX=${adx.toFixed(1)})`);
              }
            }
          } else {
            logger.forSymbol(symbol).debug(`📊 EXCEPTION_BUDGET: Skipping STRONG_TREND - ${noMomentumExceptionUsed} already applied`);
          }
        }
        
        // ============= PATH 4: TREND ACCELERATION =============
        // Check if trend acceleration qualifies (with exception budget)
        let trendAccelerationApplied = false;
        if (qualifiesForTrendAcceleration && !statePresencePasses && !momentumConfirms && !strongTrendExceptionApplied) {
          // Check exception budget
          if (!NO_MOMENTUM_GATE_PARAMS.ENABLE_EXCEPTION_BUDGET || !noMomentumExceptionUsed) {
            trendAccelerationApplied = true;
            noMomentumExceptionMultiplier = 0.70;  // Standard acceleration position size
            if (NO_MOMENTUM_GATE_PARAMS.ENABLE_EXCEPTION_BUDGET && !noMomentumExceptionUsed) {
              noMomentumExceptionUsed = "TREND_ACCELERATION";
              noMomentumExceptionDepth++;  // FIX #4: Increment exception depth
              if (NO_MOMENTUM_GATE_PARAMS.LOG_EXCEPTION_USAGE) {
                logger.forSymbol(symbol).debug(`📊 EXCEPTION_BUDGET: Using TREND_ACCELERATION as exception #${noMomentumExceptionDepth} (${priceMove.toFixed(1)}% move)`);
              }
            }
          } else {
            logger.forSymbol(symbol).debug(`📊 EXCEPTION_BUDGET: Skipping TREND_ACCELERATION - ${noMomentumExceptionUsed} already applied`);
          }
        }
        
        // ============= PATH 5A: PRE-MOMENTUM STOCHRSI =============
        // Set directional bias (not override) with exception budget
        let preMomentumApplied = false;
        if (preMomentumStochRsiOverrideApplied && !statePresencePasses && !momentumConfirms && !strongTrendExceptionApplied && !trendAccelerationApplied) {
          // Check exception budget
          if (!NO_MOMENTUM_GATE_PARAMS.ENABLE_EXCEPTION_BUDGET || !noMomentumExceptionUsed) {
            preMomentumApplied = true;
            noMomentumExceptionMultiplier = preMomentumPositionMultiplier;
            
            // Set directional BIAS (not override) - this informs direction derivation
            premiumOverrideBias = preMomentumDirection === "long" ? "bullish" : "bearish";
            premiumOverrideSource = "PRE_MOMENTUM_STOCHRSI";
            
            if (NO_MOMENTUM_GATE_PARAMS.ENABLE_EXCEPTION_BUDGET && !noMomentumExceptionUsed) {
              noMomentumExceptionUsed = "PRE_MOMENTUM_STOCHRSI";
              noMomentumExceptionDepth++;  // FIX #4: Path 5A now increments exception depth
              if (NO_MOMENTUM_GATE_PARAMS.LOG_EXCEPTION_USAGE) {
                logger.forSymbol(symbol).debug(`📊 EXCEPTION_BUDGET: Using PRE_MOMENTUM_STOCHRSI as exception #${noMomentumExceptionDepth} (bias=${premiumOverrideBias})`);
              }
            }
          } else {
            logger.forSymbol(symbol).debug(`📊 EXCEPTION_BUDGET: Skipping PRE_MOMENTUM_STOCHRSI - ${noMomentumExceptionUsed} already applied`);
          }
        }
        
        // ============= PATH 5B: SHORT-TERM ALIGNMENT =============
        // Set directional bias (not override) with exception budget
        let shortTermAlignmentApplied = false;
        if (shortTermAlignmentOverrideApplied && !statePresencePasses && !momentumConfirms && !strongTrendExceptionApplied && !trendAccelerationApplied && !preMomentumApplied) {
          // Check exception budget
          if (!NO_MOMENTUM_GATE_PARAMS.ENABLE_EXCEPTION_BUDGET || !noMomentumExceptionUsed) {
            shortTermAlignmentApplied = true;
            noMomentumExceptionMultiplier = shortTermAlignmentPositionMultiplier;
            
            // Set directional BIAS (not override)
            premiumOverrideBias = shortTermAlignmentDirection === "long" ? "bullish" : "bearish";
            premiumOverrideSource = "SHORT_TERM_ALIGNMENT";
            
            if (NO_MOMENTUM_GATE_PARAMS.ENABLE_EXCEPTION_BUDGET && !noMomentumExceptionUsed) {
              noMomentumExceptionUsed = "SHORT_TERM_ALIGNMENT";
              noMomentumExceptionDepth++;  // FIX #4: Path 5B now increments exception depth
              if (NO_MOMENTUM_GATE_PARAMS.LOG_EXCEPTION_USAGE) {
                logger.forSymbol(symbol).debug(`📊 EXCEPTION_BUDGET: Using SHORT_TERM_ALIGNMENT as exception #${noMomentumExceptionDepth} (bias=${premiumOverrideBias})`);
              }
            }
          } else {
            logger.forSymbol(symbol).debug(`📊 EXCEPTION_BUDGET: Skipping SHORT_TERM_ALIGNMENT - ${noMomentumExceptionUsed} already applied`);
          }
        }
        
        // ============= DIRECTION BIAS CONFLICT CHECK =============
        // If premium override set a bias but derived direction conflicts, apply position reduction
        let directionBiasConflict = false;
        if (premiumOverrideBias && derivedDirection) {
          const expectedDirection = premiumOverrideBias === "bullish" ? "long" : "short";
          if (derivedDirection !== expectedDirection) {
            directionBiasConflict = true;
            noMomentumExceptionMultiplier *= NO_MOMENTUM_GATE_PARAMS.DIRECTION_CONFLICT_POSITION_REDUCTION;
            logger.forSymbol(symbol).warn(`⚠️ DIRECTION_BIAS_CONFLICT: Premium bias suggests ${premiumOverrideBias} (${expectedDirection}) but derived=${derivedDirection} → position reduced to ${(noMomentumExceptionMultiplier * 100).toFixed(0)}%`);
          }
        }
        
        // ============= FINAL MOMENTUM PASSES CHECK =============
        // Momentum passes if any path succeeds:
        // 1. Standard confirmation (momentumConfirms)
        // 2. State presence with ADX floor (statePresencePasses)
        // 3. Strong trend exception (strongTrendExceptionApplied)
        // 4. Trend acceleration (trendAccelerationApplied)
        // 5. Premium overrides (preMomentumApplied OR shortTermAlignmentApplied)
        const hasPremiumOverride = preMomentumApplied || shortTermAlignmentApplied;
        const momentumPasses = momentumConfirms || statePresencePasses || strongTrendExceptionApplied || trendAccelerationApplied || hasPremiumOverride;
        
        if (!momentumPasses) {
          rejectedByHardGates++;
          perSymbolGateAttribution.set(symbol, { gate: 'NO_MOMENTUM_CONFIRMATION', details: `Momentum=${momentumState}, ADX=${adx.toFixed(1)}<${effectiveStrongTrendADX}, PriceMove=${priceMove.toFixed(1)}%` });
          await logRejectionWithAI(
            supabase, userId, symbol,
            `HARD GATE: No momentum confirmation (state=${momentumState}, confirms=${momentumConfirms}, ADX=${adx.toFixed(1)} < ${effectiveStrongTrendADX}, priceMove=${priceMove.toFixed(1)}%)`,
            { 
              gate: "NO_MOMENTUM_CONFIRMATION",
              momentumState,
              momentumConfirms,
              adx: adx.toFixed(1),
              effectiveADXThreshold: effectiveStrongTrendADX,
              // Path 2 ADX floor diagnostics
              path2: {
                statePresencePasses,
                statePresenceSkippedDueToADX,
                adxFloorEnabled: NO_MOMENTUM_GATE_PARAMS.ENABLE_PATH_2_ADX_FLOOR,
                adxFloorRequired: NO_MOMENTUM_GATE_PARAMS.STATE_PRESENCE_MIN_ADX,
              },
              // Exception budget diagnostics (FIX #4: Now tracks depth)
              exceptionBudget: {
                enabled: NO_MOMENTUM_GATE_PARAMS.ENABLE_EXCEPTION_BUDGET,
                exceptionUsed: noMomentumExceptionUsed,
                exceptionDepth: noMomentumExceptionDepth,
                maxDepth: NO_MOMENTUM_GATE_PARAMS.MAX_EXCEPTION_DEPTH,
              },
              // Path status
              paths: {
                path1_standardConfirmation: momentumConfirms,
                path2_statePresence: statePresencePasses,
                path3_strongTrend: strongTrendExceptionApplied,
                path4_acceleration: trendAccelerationApplied,
                path5a_preMomentum: preMomentumApplied,
                path5b_shortTermAlignment: shortTermAlignmentApplied,
              },
              isStrongTrendException,
              stochRsiAdxAlignmentActive,
              trend,
              confidence,
              // Trend acceleration diagnostics
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
                macdExpanding: momentum?.macdExpanding,
                lastCloseAlignsWithTrend: momentum?.lastCloseAlignsWithTrend,
                hasDivergence: momentum?.hasDivergence,
                consecutiveBars1h: momentum?.consecutiveBars1h ?? 0,
                consecutiveBars30m: momentum?.consecutiveBars30m ?? 0,
                consecutiveBars15m: momentum?.consecutiveBars15m ?? 0
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
        
        // Apply exception position multiplier to reversal multiplier
        if (noMomentumExceptionUsed && noMomentumExceptionMultiplier < 1.0) {
          reversalPositionMultiplier = Math.min(reversalPositionMultiplier, noMomentumExceptionMultiplier);
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK} NO_MOMENTUM_CONFIRMATION exception (${noMomentumExceptionUsed}) - position capped at ${(noMomentumExceptionMultiplier * 100).toFixed(0)}%`);
        }
        
        // Log when using strong trend exception for early entry
        if (strongTrendExceptionApplied && momentumState === "none" && !momentumConfirms) {
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.MOMENTUM} EARLY ENTRY via strong trend exception (ADX=${adx.toFixed(1)} >= ${effectiveStrongTrendADX}, momentum=${momentumState}, exception=${noMomentumExceptionUsed})`);
        }
        
        // Log when using trend acceleration exception
        if (trendAccelerationApplied && momentumState === "none" && !momentumConfirms) {
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.MOMENTUM} 🚀 TREND ACCELERATION BYPASS: Allowing entry despite no momentum confirmation (${priceMove.toFixed(1)}% move, ADX=${adx.toFixed(1)} rising=${adxRisingForAcceleration}, exception=${noMomentumExceptionUsed})`);
        }
        
        // ============= CONTEXT-AWARE MOMENTUM GATE FOR PULLBACK ENTRIES =============
        // Pullbacks by definition lack strong momentum - that's the opportunity!
        // Detect pullback setups and use reduced momentum threshold (3 vs 5)
        const legacyMomentumScore = getMomentumScore(momentum, adx, trendData.volatility?.adxRising ?? false);
        
        // ===== PHASE 2 FIX: UNIFIED MOMENTUM GATING =====
        // The legacy getMomentumScore() can return 0 while smartMomentum.score shows 15-20
        // This mismatch causes AVAX-type rejections where momentum is clearly present
        // Solution: Use the HIGHER of the two scores to prevent false rejections
        // 
        // ===== BUG FIX: Normalization was too aggressive =====
        // Previous: Math.round(4/10) = 0, so score of 4 became 0
        // Fix: Use Math.ceil to preserve weak-but-present momentum, with minimum floor of 1 if any momentum exists
        // Also: smartMomentum.score can be NEGATIVE (bearish), so we use absolute value for gate
        const absSmartMomentum = Math.abs(smartMomentum.score);
        const normalizedSmartMomentumScore = absSmartMomentum > 0 
          ? Math.max(1, Math.ceil(absSmartMomentum / 10))  // Minimum 1 if any momentum present
          : 0;
        
        // Use the higher score - if either system sees momentum, we have momentum
        const earlyMomentumScore = Math.max(legacyMomentumScore, normalizedSmartMomentumScore);
        
        // Log when smart momentum rescued a would-be rejection
        if (normalizedSmartMomentumScore > legacyMomentumScore) {
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.MOMENTUM} 🔧 UNIFIED MOMENTUM: smartMomentum.score=${smartMomentum.score} (abs=${absSmartMomentum}, normalized=${normalizedSmartMomentumScore}) > legacy=${legacyMomentumScore} → using ${earlyMomentumScore}`);
        }
        
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
          
          // ===== ADX SLOPE GATE (NEW) =====
          // Block momentum continuation when ADX slope is strongly negative (trend exhausting)
          // Use stricter threshold for SHORTs as they're more vulnerable to bounce risk
          const adxSlopeThreshold = derivedDirection === "short" 
            ? PULLBACK_DETECTION_PARAMS.MIN_ADX_SLOPE_SHORT  // -0.3 for shorts (stricter)
            : PULLBACK_DETECTION_PARAMS.MIN_ADX_SLOPE;       // -0.5 for longs
          
          const adxSlopeOk = adxSlope >= adxSlopeThreshold;
          
          isPullbackValid = (
            // StochRSI starting to turn in trade direction
            (derivedDirection === "long" && kTurningUp) ||
            (derivedDirection === "short" && kTurningDown)
          ) && (
            // ADX still strong enough (trend intact, just pulled back)
            adx >= PULLBACK_DETECTION_PARAMS.MIN_ADX
          ) && (
            // ADX slope not strongly negative (trend not exhausting)
            adxSlopeOk
          );
          
          if (isPullbackValid) {
            // Apply pullback position size reduction (50% default)
            pullbackPositionMultiplier = (riskParams.pullback_position_size_percent ?? PULLBACK_DETECTION_PARAMS.DEFAULT_POSITION_SIZE_PERCENT) / 100;
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.MOMENTUM} PULLBACK SETUP DETECTED & VALID: 4h ${stochFilterTrend4h} (${stochFilterConf4h}%), 1h K=${stochRsiK1h.toFixed(1)} D=${stochRsiD1h.toFixed(1)}, ADX=${adx.toFixed(1)}, ADX_slope=${adxSlope.toFixed(2)} - using reduced momentum threshold (${MOMENTUM_THRESHOLDS.PULLBACK_MIN_SCORE})`);
          } else if (!adxSlopeOk) {
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.MOMENTUM} PULLBACK BLOCKED: ADX slope ${adxSlope.toFixed(2)} < ${adxSlopeThreshold} (trend exhausting) - direction: ${derivedDirection.toUpperCase()}`);
          } else {
            logger.forSymbol(symbol).debug(`${LOG_CATEGORIES.MOMENTUM} Pullback detected but not valid: K_turn=${derivedDirection === "long" ? kTurningUp : kTurningDown}, ADX=${adx.toFixed(1)} >= ${PULLBACK_DETECTION_PARAMS.MIN_ADX}`);
          }
        }
        
        // ===== CONTEXT-AWARE MOMENTUM THRESHOLD =====
        // ISSUE 4 FIX: Only use pullback threshold if pullback is VALID (includes ADX check)
        // AND ADX is genuinely in trending territory (>= 22)
        // This is a defensive double-check that makes the logic more explicit
        let baseMomentumThreshold: number = (isPullbackValid && adx >= PULLBACK_DETECTION_PARAMS.MIN_ADX)
          ? MOMENTUM_THRESHOLDS.PULLBACK_MIN_SCORE  // 3 for pullbacks
          : MOMENTUM_THRESHOLDS.MIN_SCORE;          // 5 for normal entries
        
        // ============= REGIME-AWARE MOMENTUM THRESHOLD =============
        // Don't lower threshold globally - only relax when ADX confirms trend strength
        // This is a graduated approach based on ADX level
        let regimeAwareMomentumThreshold: number = baseMomentumThreshold;
        let regimeAwareApplied = false;
        let regimeAwareTier = 'none'; // Track which tier was applied for logging
        
        // Get ADX slope for near-very-strong tier checks
        const adxSlopeForRegime = fullAdxResult?.adxSlope ?? 0;
        
        if (REGIME_AWARE_MOMENTUM_PARAMS.ENABLED && !isReversalEntry) {
          // Check if ADX qualifies for each tier
          const isVeryStrongAdx = adx >= REGIME_AWARE_MOMENTUM_PARAMS.VERY_STRONG_TREND_MIN_ADX;
          // NEW: Near very strong tier (ADX 33-35, slope not sharply negative)
          const isNearVeryStrongAdx = (
            adx >= (REGIME_AWARE_MOMENTUM_PARAMS.NEAR_VERY_STRONG_TREND_MIN_ADX ?? 33) &&
            adx < REGIME_AWARE_MOMENTUM_PARAMS.VERY_STRONG_TREND_MIN_ADX &&
            adxSlopeForRegime >= (REGIME_AWARE_MOMENTUM_PARAMS.NEAR_VERY_STRONG_MIN_SLOPE ?? -0.3)
          );
          const adxRisingForRegime = smartAdxRising || !REGIME_AWARE_MOMENTUM_PARAMS.REQUIRE_ADX_RISING || isVeryStrongAdx || isNearVeryStrongAdx;
          const notExhaustedForRegime = !REGIME_AWARE_MOMENTUM_PARAMS.BLOCK_IF_EXHAUSTED || 
                                        !adxExhaustion.isExhausted || 
                                        adxExhaustion.isContinuation;
          const scopeOk = !REGIME_AWARE_MOMENTUM_PARAMS.SCOPE_TO_TREND_FOLLOWING || !isReversalEntry;
          
          if (notExhaustedForRegime && scopeOk) {
            if (isVeryStrongAdx) {
              // Very strong trend (ADX >= 35): threshold = 0, ADX rising NOT required
              regimeAwareMomentumThreshold = REGIME_AWARE_MOMENTUM_PARAMS.VERY_STRONG_TREND_THRESHOLD;
              regimeAwareApplied = true;
              regimeAwareTier = 'very-strong';
              logger.forSymbol(symbol).info(
                `${LOG_CATEGORIES.MOMENTUM} 🚀 REGIME-AWARE THRESHOLD: Very strong ADX=${adx.toFixed(1)} >= ${REGIME_AWARE_MOMENTUM_PARAMS.VERY_STRONG_TREND_MIN_ADX} (rising not required), ` +
                `threshold relaxed ${baseMomentumThreshold} → ${regimeAwareMomentumThreshold}`
              );
            } else if (isNearVeryStrongAdx) {
              // NEW: Near very strong trend (ADX 33-35, slope >= -0.3): threshold = 1
              regimeAwareMomentumThreshold = REGIME_AWARE_MOMENTUM_PARAMS.NEAR_VERY_STRONG_TREND_THRESHOLD ?? 1;
              regimeAwareApplied = true;
              regimeAwareTier = 'near-very-strong';
              logger.forSymbol(symbol).info(
                `${LOG_CATEGORIES.MOMENTUM} 🚀 REGIME-AWARE THRESHOLD: Near-very-strong ADX=${adx.toFixed(1)} (33-35 range), slope=${adxSlopeForRegime.toFixed(2)} >= -0.3, ` +
                `threshold relaxed ${baseMomentumThreshold} → ${regimeAwareMomentumThreshold}`
              );
            } else if (adx >= REGIME_AWARE_MOMENTUM_PARAMS.STRONG_TREND_MIN_ADX && adxRisingForRegime) {
              // Strong trend (ADX >= 30, rising): threshold = 2
              regimeAwareMomentumThreshold = REGIME_AWARE_MOMENTUM_PARAMS.STRONG_TREND_THRESHOLD;
              regimeAwareApplied = true;
              regimeAwareTier = 'strong';
              logger.forSymbol(symbol).info(
                `${LOG_CATEGORIES.MOMENTUM} REGIME-AWARE THRESHOLD: Strong ADX=${adx.toFixed(1)} >= ${REGIME_AWARE_MOMENTUM_PARAMS.STRONG_TREND_MIN_ADX} rising=${smartAdxRising}, ` +
                `threshold relaxed ${baseMomentumThreshold} → ${regimeAwareMomentumThreshold}`
              );
            }
          }
        }
        
        // Use the lower of pullback threshold and regime-aware threshold
        let effectiveMomentumThreshold = Math.min(baseMomentumThreshold, regimeAwareMomentumThreshold);
        
        // ============= MOMENTUM STATE THRESHOLD ADJUSTMENT (ISSUE 3 FIX) =============
        // Tightly couple momentum state classification with gate threshold
        // This ensures consistent behavior between Momentum Status Details UI and signal generation
        const momentumStateForGate = momentum?.state || "none";
        let stateAdjustedThreshold = effectiveMomentumThreshold;
        let momentumStateAdjustmentApplied = false;
        let momentumStateAdjustmentDelta = 0;
        
        if (momentumStateForGate === "confirmed") {
          // Confirmed momentum = strong follow-through, relax threshold by 1
          stateAdjustedThreshold = Math.max(0, effectiveMomentumThreshold - 1);
          momentumStateAdjustmentApplied = true;
          momentumStateAdjustmentDelta = -1;
          logger.forSymbol(symbol).info(
            `${LOG_CATEGORIES.MOMENTUM} MOMENTUM STATE BONUS: state=confirmed, threshold reduced ${effectiveMomentumThreshold} → ${stateAdjustedThreshold}`
          );
        } else if (momentumStateForGate === "exhausted") {
          // Exhausted momentum = reversal risk, increase threshold by 1
          stateAdjustedThreshold = effectiveMomentumThreshold + 1;
          momentumStateAdjustmentApplied = true;
          momentumStateAdjustmentDelta = 1;
          logger.forSymbol(symbol).info(
            `${LOG_CATEGORIES.MOMENTUM} MOMENTUM STATE PENALTY: state=exhausted, threshold increased ${effectiveMomentumThreshold} → ${stateAdjustedThreshold}`
          );
        }
        
        // Apply state adjustment
        effectiveMomentumThreshold = stateAdjustedThreshold;
        
        // ============= STRONG ADX OVERRIDE FOR MOMENTUM SCORE GATE =============
        // When ADX confirms strong trend, allow complete bypass of momentum score requirement
        // Scoped to trend-following entries only with exhaustion checks
        let strongAdxOverrideApplied = false;
        let strongAdxPositionMultiplier = 1.0;
        let strongAdxOverrideTier = 'none'; // Track which tier was used
        
        // Get ADX slope for near-very-strong tier checks
        const adxSlopeForOverride = fullAdxResult?.adxSlope ?? 0;
        
        if (STRONG_ADX_OVERRIDE_PARAMS.ENABLED && earlyMomentumScore < effectiveMomentumThreshold) {
          // At very strong ADX (>= VERY_STRONG_ADX), ADX rising is NOT required
          const isVeryStrongAdxForOverride = adx >= (STRONG_ADX_OVERRIDE_PARAMS.VERY_STRONG_ADX ?? 35);
          // NEW: Near very strong tier (ADX 33-35, slope >= -0.3)
          const isNearVeryStrongAdxForOverride = (
            adx >= (STRONG_ADX_OVERRIDE_PARAMS.NEAR_VERY_STRONG_ADX ?? 33) &&
            adx < (STRONG_ADX_OVERRIDE_PARAMS.VERY_STRONG_ADX ?? 35) &&
            adxSlopeForOverride >= (STRONG_ADX_OVERRIDE_PARAMS.NEAR_VERY_STRONG_MIN_SLOPE ?? -0.3)
          );
          const adxRisingForOverride = smartAdxRising || !STRONG_ADX_OVERRIDE_PARAMS.REQUIRE_ADX_RISING || isVeryStrongAdxForOverride || isNearVeryStrongAdxForOverride;
          const scopeOkForOverride = !STRONG_ADX_OVERRIDE_PARAMS.SCOPE_TO_TREND_FOLLOWING || !isReversalEntry;
          const reversalScoreOk = unifiedReversal.score <= STRONG_ADX_OVERRIDE_PARAMS.MAX_REVERSAL_SCORE;
          const exhaustionCheckPasses = !STRONG_ADX_OVERRIDE_PARAMS.REQUIRE_EXHAUSTION_CHECK || 
                                        adxExhaustion.isContinuation || 
                                        !adxExhaustion.isExhausted;
          
          const strongAdxOverrideEligible = (
            adx >= STRONG_ADX_OVERRIDE_PARAMS.MIN_ADX &&
            adxRisingForOverride &&
            scopeOkForOverride &&
            reversalScoreOk &&
            exhaustionCheckPasses
          );
          
          if (strongAdxOverrideEligible) {
            strongAdxOverrideApplied = true;
            effectiveMomentumThreshold = STRONG_ADX_OVERRIDE_PARAMS.OVERRIDE_MOMENTUM_THRESHOLD;
            
            // GAP 1 FIX: Calculate graduated position multiplier based on score deficit
            const scoreDeficit = baseMomentumThreshold - earlyMomentumScore;
            const graduatedMultiplier = Math.max(0.5, Math.min(0.9, 1.0 - (scoreDeficit * 0.1)));
            
            // Determine which tier applied and set position multiplier accordingly
            if (isVeryStrongAdxForOverride) {
              strongAdxOverrideTier = 'very-strong';
              // Reduce position size if ADX indicates exhaustion risk
              if (adx > STRONG_ADX_OVERRIDE_PARAMS.EXHAUSTION_ADX) {
                const tierMultiplier = STRONG_ADX_OVERRIDE_PARAMS.EXHAUSTION_POSITION_MULTIPLIER;
                // Apply the more conservative of graduated and tier-specific multiplier
                strongAdxPositionMultiplier = Math.min(graduatedMultiplier, tierMultiplier);
                logger.forSymbol(symbol).info(
                  `${LOG_CATEGORIES.MOMENTUM} STRONG ADX OVERRIDE: ADX=${adx.toFixed(1)} > ${STRONG_ADX_OVERRIDE_PARAMS.EXHAUSTION_ADX}, ` +
                  `graduated=${(graduatedMultiplier * 100).toFixed(0)}%, tier=${(tierMultiplier * 100).toFixed(0)}%, ` +
                  `using ${(strongAdxPositionMultiplier * 100).toFixed(0)}%`
                );
              } else {
                strongAdxPositionMultiplier = graduatedMultiplier;
              }
            } else if (isNearVeryStrongAdxForOverride) {
              // Near very strong tier - apply 80% position size for safety
              strongAdxOverrideTier = 'near-very-strong';
              const tierMultiplier = STRONG_ADX_OVERRIDE_PARAMS.NEAR_VERY_STRONG_POSITION_MULTIPLIER ?? 0.80;
              // Apply the more conservative of graduated and tier-specific multiplier
              strongAdxPositionMultiplier = Math.min(graduatedMultiplier, tierMultiplier);
              logger.forSymbol(symbol).info(
                `${LOG_CATEGORIES.MOMENTUM} NEAR-VERY-STRONG ADX OVERRIDE: ADX=${adx.toFixed(1)} (33-35 range), slope=${adxSlopeForOverride.toFixed(2)}, ` +
                `graduated=${(graduatedMultiplier * 100).toFixed(0)}%, tier=${(tierMultiplier * 100).toFixed(0)}%, ` +
                `using ${(strongAdxPositionMultiplier * 100).toFixed(0)}%`
              );
            } else {
              strongAdxOverrideTier = 'strong';
              strongAdxPositionMultiplier = graduatedMultiplier;
            }
            
            logger.forSymbol(symbol).info(
              `${LOG_CATEGORIES.MOMENTUM} ✓ STRONG ADX OVERRIDE ACTIVE [${strongAdxOverrideTier}]: ADX=${adx.toFixed(1)} slope=${adxSlopeForOverride.toFixed(2)} rising=${smartAdxRising}, ` +
              `exhausted=${adxExhaustion.isExhausted}, continuation=${adxExhaustion.isContinuation}, ` +
              `reversalScore=${unifiedReversal.score} - bypassing momentum threshold (${baseMomentumThreshold} → ${effectiveMomentumThreshold})`
            );
          } else {
            // Log why override didn't apply
            const failureReasons: string[] = [];
            if (adx < STRONG_ADX_OVERRIDE_PARAMS.MIN_ADX) failureReasons.push(`ADX=${adx.toFixed(1)} < ${STRONG_ADX_OVERRIDE_PARAMS.MIN_ADX}`);
            if (!adxRisingForOverride) failureReasons.push(`ADX not rising/stable (veryStrong=${isVeryStrongAdxForOverride}, nearVeryStrong=${isNearVeryStrongAdxForOverride}, slope=${adxSlopeForOverride.toFixed(2)})`);
            if (!scopeOkForOverride) failureReasons.push('reversal entry (scoped out)');
            if (!reversalScoreOk) failureReasons.push(`reversalScore=${unifiedReversal.score} > ${STRONG_ADX_OVERRIDE_PARAMS.MAX_REVERSAL_SCORE}`);
            if (!exhaustionCheckPasses) failureReasons.push('exhaustion check failed');
            
            logger.forSymbol(symbol).debug(
              `${LOG_CATEGORIES.MOMENTUM} Strong ADX override not eligible: ${failureReasons.join(', ')}`
            );
          }
        }
        
        // ============= ACCELERATING TREND EXCEPTION (ISSUE 1 FIX) =============
        // If ADX is strong AND rising, allow reduced-size entry even with low momentum
        // In accelerating trends, price leads momentum - this prevents blocking valid entries
        const acceleratingTrendException = (
          adx >= 30 &&
          adxSlopeForOverride > 0 &&
          !adxExhaustion.isExhausted &&
          !isReversalEntry
        );
        let acceleratingTrendPositionMultiplier = 1.0;
        let acceleratingTrendExceptionApplied = false;
        
        if (earlyMomentumScore < effectiveMomentumThreshold) {
          if (acceleratingTrendException) {
            // Allow with 70% position size instead of blocking
            acceleratingTrendPositionMultiplier = 0.70;
            acceleratingTrendExceptionApplied = true;
            logger.forSymbol(symbol).info(
              `${LOG_CATEGORIES.MOMENTUM} ✓ ACCELERATING TREND EXCEPTION: ADX=${adx.toFixed(1)} slope=${adxSlopeForOverride.toFixed(2)} > 0, ` +
              `allowing entry with ${(acceleratingTrendPositionMultiplier * 100).toFixed(0)}% size despite low momentum (${earlyMomentumScore} < ${effectiveMomentumThreshold})`
            );
            // Continue to next gate (don't reject) - but we need to track this for position sizing
          } else {
            // Normal rejection path
            rejectedByHardGates++;
            perSymbolGateAttribution.set(symbol, { 
              gate: 'MOMENTUM_WEAKENING', 
              details: `score=${earlyMomentumScore}, need=${effectiveMomentumThreshold}, adx=${adx.toFixed(1)}, slope=${adxSlopeForOverride.toFixed(2)}` 
            });
            await logRejectionWithAI(
              supabase, userId, symbol,
              `HARD GATE: Momentum score too low (${earlyMomentumScore} < ${effectiveMomentumThreshold}${isPullbackSetupDetected ? ' [pullback threshold]' : ''}${regimeAwareApplied ? ` [regime-aware:${regimeAwareTier}]` : ''}${momentumStateAdjustmentApplied ? ` [state:${momentumStateForGate}]` : ''}) - insufficient momentum confirmation`,
              { 
                gate: "MOMENTUM_SCORE_TOO_LOW",
                derivedDirection,
                direction: derivedDirection,
                momentumScore: earlyMomentumScore,
                momentumRequired: effectiveMomentumThreshold,
                baseMomentumThreshold,
                regimeAwareApplied,
                regimeAwareTier,
                regimeAwareMomentumThreshold,
                momentumStateAdjustmentApplied,
                momentumStateForGate,
                momentumStateAdjustmentDelta,
                strongAdxOverrideAttempted: STRONG_ADX_OVERRIDE_PARAMS.ENABLED,
                strongAdxOverrideApplied,
                strongAdxOverrideTier,
                acceleratingTrendExceptionAttempted: acceleratingTrendException,
                acceleratingTrendExceptionApplied: false,
                acceleratingTrendExceptionReason: !acceleratingTrendException ? 
                  (adx < 30 ? `ADX=${adx.toFixed(1)} < 30` : 
                   adxSlopeForOverride <= 0 ? `slope=${adxSlopeForOverride.toFixed(2)} <= 0` :
                   adxExhaustion.isExhausted ? 'exhausted' :
                   isReversalEntry ? 'reversal entry' : 'unknown') : null,
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
                adxSlope: adxSlopeForOverride.toFixed(2),
                adxRising: smartAdxRising,
                exhausted: adxExhaustion.isExhausted,
                continuation: adxExhaustion.isContinuation,
                reversalScore: unifiedReversal.score,
                isReversalEntry,
                trend,
                confidence
              },
              trendData,
              riskParams.ai_analysis_enabled !== false,
              earlyOrderFlowAnalysis
            );
            continue;
          }
        }
        
        // Log success with context
        if (acceleratingTrendExceptionApplied) {
          logger.forSymbol(symbol).info(
            `${LOG_CATEGORIES.SUCCESS} ✓ ACCELERATING TREND EXCEPTION: Momentum gate bypassed (ADX=${adx.toFixed(1)} rising, slope=${adxSlopeForOverride.toFixed(2)}) - ` +
            `position size ${(acceleratingTrendPositionMultiplier * 100).toFixed(0)}%`
          );
        } else if (strongAdxOverrideApplied) {
          logger.forSymbol(symbol).info(
            `${LOG_CATEGORIES.SUCCESS} ✓ STRONG ADX OVERRIDE [${strongAdxOverrideTier}]: Momentum gate bypassed (ADX=${adx.toFixed(1)}, slope=${adxSlopeForOverride.toFixed(2)}) - ` +
            `position size ${(strongAdxPositionMultiplier * 100).toFixed(0)}%`
          );
        } else if (isPullbackValid) {
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} PULLBACK ENTRY: Momentum gate passed with reduced threshold (${earlyMomentumScore} >= ${effectiveMomentumThreshold}) - position size ${(pullbackPositionMultiplier * 100).toFixed(0)}%`);
        } else if (regimeAwareApplied) {
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} REGIME-AWARE [${regimeAwareTier}]: Momentum gate passed with relaxed threshold (${earlyMomentumScore} >= ${effectiveMomentumThreshold})`);
        } else if (momentumStateAdjustmentApplied) {
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} MOMENTUM STATE [${momentumStateForGate}]: Momentum gate passed with adjusted threshold (${earlyMomentumScore} >= ${effectiveMomentumThreshold})`);
        } else {
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} Momentum score gate passed (${earlyMomentumScore} >= ${effectiveMomentumThreshold})`);
        }
        
        // ============= PHASE 2 IMPROVEMENT: MOMENTUM DIRECTIONAL SYMMETRY =============
        // Verify that momentum direction agrees with the derived trade direction
        // This prevents entries where overall momentum is moving opposite to trade side
        // 
        // ARCHITECTURE FIX: Phase 2 is now SUBORDINATE to Phase 1
        // If Phase 1 determined momentum is in neutral zone, SKIP Phase 2 entirely
        // This prevents double-penalizing neutral momentum scenarios
        const phase1NeutralMomentum = (trendData as any).phase1NeutralMomentum ?? false;
        
        // Hoist macdHistogramValue to outer scope (used later in MACD alignment gate)
        const macdHistogramValue = momentum?.macdHistogram ?? 0;
        
        if (MOMENTUM_DIRECTION_ALIGNMENT.SKIP_PHASE2_FOR_NEUTRAL && phase1NeutralMomentum) {
          // Phase 1 already classified momentum as neutral - skip Phase 2 MACD check
          logger.forSymbol(symbol).debug(`${LOG_CATEGORIES.MOMENTUM} Phase 2 MACD check skipped: momentum in neutral zone (Phase 1 passed)`);
        } else {
          // Phase 2: Check MACD-based momentum direction
          const momentumDirection = momentum?.direction || null;  // "bullish", "bearish", or null
          
          // Determine momentum direction from MACD histogram if not explicitly set
          const effectiveMomentumDirection = momentumDirection || 
            (macdHistogramValue > 0 ? "bullish" : macdHistogramValue < 0 ? "bearish" : null);
          
          // Check if momentum direction opposes trade direction
          const momentumOpposesDirection = (
            (derivedDirection === "long" && effectiveMomentumDirection === "bearish") ||
            (derivedDirection === "short" && effectiveMomentumDirection === "bullish")
          );
          
          if (momentumOpposesDirection && effectiveMomentumDirection !== null) {
            // ===== NORMALIZED WEAK MOMENTUM CHECK (PHASE 2 FIX) =====
            // CRITICAL FIX: Both MACD histogram AND threshold must be in the SAME scale
            // Raw MACD histogram varies wildly by asset price (BTC: ~36, low-cap: ~0.001)
            // Solution: Normalize MACD histogram by ATR to get a dimensionless ratio
            
            // FIX: ATR is stored in volatility.atr, not directly in trendData.atr
            const atrForNormalization = trendData?.volatility?.atr || trendData?.atr || trendData?.atrValue || 0;
            
            // Normalize MACD histogram by ATR (both values now in same scale: ~0-2 typically)
            // Raw MACD histogram = 36.56, ATR = 584.8 → normalized = 36.56/584.8 = 0.0625
            const macdHistogramNormalized = atrForNormalization > 0 
              ? Math.abs(macdHistogramValue) / atrForNormalization 
              : Math.abs(macdHistogramValue);  // Fallback to raw if no ATR
            
            // Threshold is now a realistic ratio: 0.05 = MACD must be ≤5% of ATR to be "weak"
            // Combined with ADX dual condition for safety (Option B):
            // Weak MACD bypass only in range environments (ADX < 25)
            const weakMomentumThreshold = MOMENTUM_DIRECTION_ALIGNMENT.WEAK_MACD_ATR_MULTIPLIER;
            const weakMacdMaxAdx = MOMENTUM_DIRECTION_ALIGNMENT.WEAK_MACD_MAX_ADX;
            
            const isWeakMomentum = macdHistogramNormalized < weakMomentumThreshold;
            const isRangeEnvironment = adx < weakMacdMaxAdx;
            const weakMacdBypass = isWeakMomentum && isRangeEnvironment;
            const adxExceptionalBypass = adx >= ADX_THRESHOLDS.EXCEPTIONAL;
            const allowMomentumOverride = weakMacdBypass || adxExceptionalBypass;
            
            if (!allowMomentumOverride) {
              rejectedByHardGates++;
              await logRejectionWithAI(
                supabase, userId, symbol,
                `HARD GATE: Momentum direction (${effectiveMomentumDirection}) opposes ${derivedDirection} trade`,
                { 
                  gate: "MOMENTUM_DIRECTION_OPPOSING",
                  phase: 2,
                  phase1NeutralMomentum,
                  derivedDirection,
                  momentumDirection: effectiveMomentumDirection,
                  momentumScore: earlyMomentumScore?.toFixed(1) ?? "0",
                  // Log both raw and normalized for full transparency
                  macdHistogramRaw: macdHistogramValue.toFixed(6),
                  macdHistogramNormalized: macdHistogramNormalized.toFixed(6),
                  weakMomentumThreshold: weakMomentumThreshold.toFixed(6),
                  atrForNormalization: atrForNormalization.toFixed(4),
                  // Dual condition diagnostics
                  isWeakMomentum,
                  isRangeEnvironment,
                  weakMacdMaxAdx,
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
            if (weakMacdBypass) {
              logger.forSymbol(symbol).info(`${LOG_CATEGORIES.MOMENTUM} Phase 2: Momentum opposes but weak MACD in range (normalized |MACD/ATR| ${macdHistogramNormalized.toFixed(6)} < ${weakMomentumThreshold.toFixed(6)}, ADX ${adx.toFixed(1)} < ${weakMacdMaxAdx}) - allowing`);
            } else {
              logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.MOMENTUM} Phase 2: Momentum opposes but ADX exceptional (${adx.toFixed(1)} >= ${ADX_THRESHOLDS.EXCEPTIONAL}) - allowing with caution`);
            }
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
          // ============= NEW: SQUEEZE MOMENTUM BYPASS =============
          // In squeeze regimes, neutral trends are EXPECTED - use momentum for direction
          // This bypass fires BEFORE the standard momentum bypass to catch compression-before-breakout patterns
          const squeezeBypassEnabled = SQUEEZE_MOMENTUM_BYPASS_PARAMS.ENABLED;
          const bbSqueezeResult = bbSqueeze; // From earlier calculation (line ~2912)
          
          const isValidSqueeze = 
            bbSqueezeResult.isSqueeze && 
            bbSqueezeResult.squeezeIntensity >= SQUEEZE_MOMENTUM_BYPASS_PARAMS.MIN_SQUEEZE_INTENSITY;
          
          const momentumQualifiesForSqueeze = 
            momentum?.state === "confirmed" &&
            momentum?.genuineMomentum === true &&
            adx >= SQUEEZE_MOMENTUM_BYPASS_PARAMS.MIN_ADX &&  // 18, not 25!
            momentum?.macdExpanding === true &&
            Math.abs(momentum?.macdHistogram || 0) >= SQUEEZE_MOMENTUM_BYPASS_PARAMS.MIN_MACD_MAGNITUDE;
          
          // Direction from MACD histogram during squeeze
          const squeezeDirection: "long" | "short" = (momentum?.macdHistogram || 0) > 0 ? "long" : "short";
          
          // StochRSI loading zone check - extended zones for extreme conditions
          // CENTRALIZED: Use shared extractors for StochRSI K values
          const stochRsiK1hForSqueeze = extractStochRsiK(trendData, '1h');
          const stochRsiK4h = extractStochRsiK(trendData, '4h');
          
          // Standard loading zone check
          const stochRsiInStandardLoadingZone = squeezeDirection === "long"
            ? stochRsiK1hForSqueeze <= SQUEEZE_MOMENTUM_BYPASS_PARAMS.LONG_MAX_STOCHRSI_K
            : stochRsiK1hForSqueeze >= SQUEEZE_MOMENTUM_BYPASS_PARAMS.SHORT_MIN_STOCHRSI_K;
          
          // NEW: StochRSI Divergence Pattern Exception
          // For LONG in squeeze: 1h in loading zone (30-55) + 4h overbought (>80) = mean-reversion entry
          // For SHORT in squeeze: 1h in loading zone (45-70) + 4h oversold (<20) = mean-reversion entry
          // This catches reversions when 4h is at extreme but 1h is resetting
          const stochRsiDivergencePattern = squeezeDirection === "long"
            ? (stochRsiK1hForSqueeze >= 25 && stochRsiK1hForSqueeze <= 60 && stochRsiK4h >= 75)
            : (stochRsiK1hForSqueeze >= 40 && stochRsiK1hForSqueeze <= 75 && stochRsiK4h <= 25);
          
          // Allow bypass if standard loading zone OR divergence pattern
          const stochRsiInLoadingZone = stochRsiInStandardLoadingZone || stochRsiDivergencePattern;
          
          // EXTREME StochRSI check - for alternative bypass when squeeze detection fails
          // Long: StochRSI K <= 25 (deeply oversold)
          // Short: StochRSI K >= 75 (deeply overbought)
          // (stochRsiK4h already declared above for divergence pattern check)
          const isStochRsiExtremeFor4h = squeezeDirection === "long"
            ? stochRsiK4h <= 30 // 4h deeply oversold
            : stochRsiK4h >= 70; // 4h deeply overbought
          const isStochRsiExtremeFor1h = squeezeDirection === "long"
            ? stochRsiK1hForSqueeze <= 35 // 1h oversold area
            : stochRsiK1hForSqueeze >= 65; // 1h overbought area
          
          // Order flow confirmation (optional strength boost)
          const orderFlowConfirms = !SQUEEZE_MOMENTUM_BYPASS_PARAMS.USE_ORDER_FLOW_CONFIRMATION ||
            ((earlyOrderFlowAnalysis?.score ?? 0) >= SQUEEZE_MOMENTUM_BYPASS_PARAMS.MIN_ORDER_FLOW_SCORE &&
             earlyOrderFlowAnalysis?.signal === (squeezeDirection === "long" ? "buy" : "sell"));
          
          // ALTERNATIVE BYPASS PATH: Strong momentum + extreme StochRSI + low ADX
          // This catches the "pre-expansion" regime where:
          // - Trend is neutral (ADX < 25) so traditional squeeze may not trigger
          // - But momentum is confirmed and building
          // - And price is at extreme (StochRSI oversold/overbought)
          // - MACD histogram magnitude is significant (>= 5.0 for extra confidence)
          const strongMomentumBypassPath = 
            momentumQualifiesForSqueeze &&
            !isValidSqueeze && // Squeeze not detected by percentile method
            adx >= 18 && adx < 25 && // Low-ADX transitional zone
            isStochRsiExtremeFor4h && // 4h StochRSI extreme
            isStochRsiExtremeFor1h && // 1h StochRSI also loaded
            Math.abs(momentum?.macdHistogram || 0) >= 5.0; // Strong MACD signal
          
          // Standard squeeze bypass
          const standardSqueezeBypass = 
            isValidSqueeze &&
            momentumQualifiesForSqueeze &&
            stochRsiInLoadingZone;
          
          const squeezeBypassApplies = 
            squeezeBypassEnabled &&
            (standardSqueezeBypass || strongMomentumBypassPath);
          
          // DEBUG: Log squeeze bypass check details
          logger.forSymbol(symbol).info(`🔍 SQUEEZE_BYPASS_CHECK: enabled=${squeezeBypassEnabled} isSqueeze=${bbSqueezeResult.isSqueeze} intensity=${bbSqueezeResult.squeezeIntensity?.toFixed(0) ?? 'N/A'}% (need>=${SQUEEZE_MOMENTUM_BYPASS_PARAMS.MIN_SQUEEZE_INTENSITY})`);
          logger.forSymbol(symbol).info(`   → Momentum: state=${momentum?.state} genuine=${momentum?.genuineMomentum} ADX=${adx.toFixed(1)} (need>=${SQUEEZE_MOMENTUM_BYPASS_PARAMS.MIN_ADX})`);
          logger.forSymbol(symbol).info(`   → MACD: expanding=${momentum?.macdExpanding} histogram=${(momentum?.macdHistogram ?? 0).toFixed(2)} (need>=${SQUEEZE_MOMENTUM_BYPASS_PARAMS.MIN_MACD_MAGNITUDE})`);
          logger.forSymbol(symbol).info(`   → StochRSI: 1h K=${stochRsiK1hForSqueeze.toFixed(1)} 4h K=${stochRsiK4h.toFixed(1)} | standardLoading=${stochRsiInStandardLoadingZone} divergencePattern=${stochRsiDivergencePattern}`);
          logger.forSymbol(symbol).info(`   → Bypass paths: standardSqueeze=${standardSqueezeBypass} strongMomentum=${strongMomentumBypassPath} → APPLIES=${squeezeBypassApplies}`);
          
          // Track squeeze bypass position multiplier for later use
          let squeezeBypassPositionMultiplier = 1.0;
          let squeezeBypassUsed = false;
          
          if (squeezeBypassApplies) {
            // BYPASS THE GATE - squeeze + momentum is sufficient evidence
            squeezeBypassUsed = true;
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} 🎯 SQUEEZE_MOMENTUM_BYPASS: Bypassing NEUTRAL_4H_LOW_CONFIDENCE`);
            logger.forSymbol(symbol).info(`   Squeeze: intensity=${bbSqueezeResult.squeezeIntensity}%, width_pctl=${bbSqueezeResult.bbWidthPercentile}%`);
            logger.forSymbol(symbol).info(`   Momentum: confirmed=${momentum?.state}, genuine=${momentum?.genuineMomentum}, MACD=${(momentum?.macdHistogram ?? 0).toFixed(2)}`);
            logger.forSymbol(symbol).info(`   Direction derived: ${squeezeDirection.toUpperCase()}, StochRSI K=${stochRsiK1hForSqueeze.toFixed(1)}`);
            
            // Apply position size multiplier for squeeze entries
            squeezeBypassPositionMultiplier = orderFlowConfirms 
              ? SQUEEZE_MOMENTUM_BYPASS_PARAMS.ORDER_FLOW_CONFIRMED_MULTIPLIER
              : SQUEEZE_MOMENTUM_BYPASS_PARAMS.POSITION_SIZE_MULTIPLIER;
            
            // Log squeeze bypass and record the source
            derivedSource = "squeeze-momentum-bypass";
            logger.forSymbol(symbol).info(`   → Squeeze bypass active, using derivedDirection=${derivedDirection.toUpperCase()}, squeezeDirection=${squeezeDirection.toUpperCase()}`);
            
            // DON'T reject - continue to next gates
          } else {
            // ============= EXISTING: CONFIRMED MOMENTUM BYPASS =============
            // When momentum is confirmed with genuine momentum and ADX is trending,
            // bypass the strict neutral 4h confidence gate since momentum confirmation
            // provides sufficient directional evidence
            const momentumConfirmedBypass = (
              momentum?.state === "confirmed" &&
              momentum?.genuineMomentum === true &&
              adx >= 25 &&  // ADX must be in trending range
              (momentum?.macdExpanding === true || momentum?.adxRising === true)
            );
            
            // Relaxed thresholds: 55% for 4h OR directional 1h with 50%+ OR momentum confirmed
            const passesNeutralGate = conf4hForGate >= 55 || 
              (is1hDirectional && conf1hForGate >= 50) ||
              momentumConfirmedBypass;
            
            if (!passesNeutralGate) {
              rejectedByHardGates++;
              perSymbolGateAttribution.set(symbol, { gate: 'NEUTRAL_4H_LOW_CONFIDENCE', details: `4h=${conf4hForGate.toFixed(0)}%, 1h=${conf1hForGate.toFixed(0)}%` });
              
              // Build squeeze bypass result for logging
              const squeezeBypassResult = {
                isSqueezeValid: isValidSqueeze,
                squeezeIntensity: bbSqueezeResult.squeezeIntensity,
                bbWidthPercentile: bbSqueezeResult.bbWidthPercentile,
                momentumQualified: momentumQualifiesForSqueeze,
                adx: adx,
                adxRequired: SQUEEZE_MOMENTUM_BYPASS_PARAMS.MIN_ADX,
                stochRsiK: stochRsiK1hForSqueeze,
                stochRsiInZone: stochRsiInLoadingZone,
                orderFlowConfirms: orderFlowConfirms,
                orderFlowScore: earlyOrderFlowAnalysis?.score ?? 0,
                macdHistogram: momentum?.macdHistogram ?? 0,
                macdExpanding: momentum?.macdExpanding ?? false,
                failedRequirement: !squeezeBypassEnabled ? "disabled" :
                  !isValidSqueeze ? "squeeze_not_valid" :
                  !momentumQualifiesForSqueeze ? "momentum_not_qualified" :
                  !stochRsiInLoadingZone ? "stochrsi_not_in_zone" : null
              };
              
              await logRejectionWithAI(
                supabase, userId, symbol,
                `HARD GATE: Neutral 4h requires 55%+ confidence OR directional 1h with 50%+ OR confirmed momentum (4h=${trend4hForNeutralGate} ${conf4hForGate.toFixed(0)}%, 1h=${htfTrend1h} ${conf1hForGate.toFixed(0)}%)`,
                { 
                  gate: "NEUTRAL_4H_LOW_CONFIDENCE",
                  derivedDirection,
                  direction: derivedDirection,
                  trend4h: trend4hForNeutralGate,
                  confidence4h: conf4hForGate,
                  trend1h: htfTrend1h,
                  confidence1h: conf1hForGate,
                  requiredConfidence: 55,
                  is1hDirectional,
                  adx: adx.toFixed(1),
                  momentumConfirmedBypassChecked: true,
                  momentumConfirmed: momentum?.state === "confirmed",
                  genuineMomentum: momentum?.genuineMomentum === true,
                  macdExpanding: momentum?.macdExpanding === true,
                  // NEW: Include squeeze bypass attempt details
                  squeezeBypassChecked: true,
                  squeezeBypassResult,
                  momentum: {
                    confirms: momentum?.confirms ?? false,
                    state: momentum?.state ?? 'none',
                    hasDivergence: momentum?.hasDivergence ?? false,
                    lastCloseAlignsWithTrend: momentum?.lastCloseAlignsWithTrend ?? false,
                    macdDirectionAligned: momentum?.macdDirectionAligned ?? false,
                    macdExpanding: momentum?.macdExpanding ?? false,
                    macdHistogram: momentum?.macdHistogram?.toFixed(4) ?? '0.0000',
                    consecutiveBars1h: momentum?.consecutiveBars1h ?? 0,
                    consecutiveBars30m: momentum?.consecutiveBars30m ?? 0,
                    consecutiveBars15m: momentum?.consecutiveBars15m ?? 0
                  }
                },
                trendData,
                riskParams.ai_analysis_enabled !== false
              );
              continue;
            }
            
            // Log if momentum bypass was used
            if (momentumConfirmedBypass && !(conf4hForGate >= 55) && !(is1hDirectional && conf1hForGate >= 50)) {
              logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} 🎯 MOMENTUM CONFIRMED BYPASS: Neutral 4h gate bypassed due to confirmed momentum (ADX=${adx.toFixed(1)}, MACD expanding=${momentum?.macdExpanding})`);
            }
          }
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} Neutral 4h gate passed (4h=${conf4hForGate.toFixed(0)}%, 1h=${htfTrend1h} ${conf1hForGate.toFixed(0)}%${squeezeBypassUsed ? ', via SQUEEZE_BYPASS' : ''})`);
        }
        
        // ============= PHASE 2 OPTIMIZATION: MACD ALIGNMENT GATE (DURATION + MAGNITUDE) =============
        // UPDATED: Convert hard block to probabilistic scoring with duration and magnitude checks
        // Now uses MACD_GATE_PARAMS for optimized thresholds
        const macdDirectionAligned = momentum?.macdDirectionAligned ?? true;
        const hasMacdDivergence = momentum?.hasDivergence ?? false;
        // Use already-defined macdHistogramValue from line 5769
        // CRITICAL FIX: Normalize MACD histogram by ATR for consistent magnitude checks
        // Raw MACD varies by asset price (BTC: ~36, low-cap: ~0.001)
        const atrForMacdGate = trendData?.volatility?.atr || trendData?.atr || trendData?.atrValue || 0;
        const macdHistNormalized = atrForMacdGate > 0 
          ? Math.abs(macdHistogramValue) / atrForMacdGate 
          : Math.abs(macdHistogramValue);  // Fallback to raw if no ATR
        const adxRisingForMacd = smartAdxRising || (trendData.volatility?.adxRising ?? false);
        
        // Get MACD histogram history for duration check (from trendData if available)
        // We need to check if MACD has been opposing for 3+ consecutive bars
        const macdHistogramHistory = trendData.momentum?.macdHistogramHistory || [];
        
        // Calculate consecutive opposing bars
        let consecutiveOpposingBars = 0;
        if (macdHistogramHistory.length > 0 && derivedDirection) {
          const isLong = derivedDirection === "long";
          for (let i = macdHistogramHistory.length - 1; i >= 0; i--) {
            const hist = macdHistogramHistory[i];
            const isOpposing = isLong ? hist < 0 : hist > 0;
            if (isOpposing) {
              consecutiveOpposingBars++;
            } else {
              break;
            }
          }
        } else if (!macdDirectionAligned) {
          // Fallback: if no history, assume current bar is opposing
          consecutiveOpposingBars = 1;
        }
        
        // PHASE 2: Reduce double-counting - if URS already penalized reversal risk heavily,
        // don't apply MACD divergence hard gate again (orthogonal logic)
        const ursAlreadyPenalizedMacd = unifiedReversal.score >= 50;
        
        // Position multiplier for MACD soft blocks
        let macdPositionMultiplier = 1.0;
        let macdGateAction: 'ALLOW' | 'SOFT_BLOCK' | 'HARD_BLOCK' = 'ALLOW';
        
        if ((!macdDirectionAligned || hasMacdDivergence) && !ursAlreadyPenalizedMacd && MACD_GATE_PARAMS.ENABLED) {
          // ===== NEW PHASE 2 LOGIC: Duration + Magnitude + ADX Checks =====
          
          // Check 1: Magnitude check - ignore if MACD is too small to matter
          // NOW USES ATR-NORMALIZED MACD for consistent behavior across assets
          const isMacdNeutral = macdHistNormalized < MACD_GATE_PARAMS.NEUTRAL_HISTOGRAM_THRESHOLD;
          const isMacdSignificant = macdHistNormalized >= MACD_GATE_PARAMS.MIN_HISTOGRAM_FOR_BLOCK;
          
          // Check 2: Duration check - only block if opposing for 3+ bars
          const hasOpposedLongEnough = consecutiveOpposingBars >= MACD_GATE_PARAMS.MIN_OPPOSITION_BARS;
          
          // Check 3: ADX override - lowered thresholds
          const adxOverrideWithRising = adx >= MACD_GATE_PARAMS.ADX_OVERRIDE_WITH_RISING && adxRisingForMacd;
          const adxOverrideUnconditional = adx >= MACD_GATE_PARAMS.ADX_OVERRIDE_UNCONDITIONAL;
          const hasAdxOverride = adxOverrideWithRising || adxOverrideUnconditional;
          
          // ===== SHADOW MODE: Compare old vs new MACD gate logic =====
          // Pass normalized MACD value for consistent comparison
          const macdGateComparison = compareMACDGate(
            consecutiveOpposingBars,
            macdHistNormalized,  // Now uses ATR-normalized value
            adx
          );
          
          // Log shadow signal if gate behavior changed (old blocked, new passes)
          if (macdGateComparison.wouldHaveChanged && shadowModeEnabled) {
            logShadowSignal(supabase as any, {
              userId,
              symbol,
              signalType: derivedDirection as 'long' | 'short',
              strategyName: 'N/A',
              gateBlockedBy: 'macd_divergence',
              oldGateResult: 'blocked',
              newGateResult: 'passed',
              gateDetails: {
                opposingBars: consecutiveOpposingBars,
                histogramRaw: macdHistogramValue,
                histogramNormalized: macdHistNormalized,
                atrUsed: atrForMacdGate,
                adx,
                adxRising: adxRisingForMacd,
                oldThreshold: macdGateComparison.oldThreshold,
                newThreshold: macdGateComparison.newThreshold,
              },
              confidenceScore: confidence,
              trend,
              indicators: {
                macdHistogram: macdHistogramValue,
                macdDirectionAligned,
                hasMacdDivergence,
              }
            }).catch(err => logger.forSymbol(symbol).error(`Shadow mode MACD log failed: ${err}`));
          }
          
          // Determine gate action based on conditions
          if (isMacdNeutral) {
            // MACD is too small to matter - treat as neutral, allow entry
            macdGateAction = 'ALLOW';
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} MACD MAGNITUDE CHECK: Histogram ${macdHistogramValue.toFixed(6)} is neutral (< ${MACD_GATE_PARAMS.NEUTRAL_HISTOGRAM_THRESHOLD}) - ignoring misalignment`);
          } else if (hasAdxOverride) {
            // ADX override allows entry (lowered from 35 to 25/28)
            macdGateAction = 'ALLOW';
            const overrideType = adxOverrideUnconditional ? 'UNCONDITIONAL' : 'WITH_RISING';
            const threshold = adxOverrideUnconditional ? MACD_GATE_PARAMS.ADX_OVERRIDE_UNCONDITIONAL : MACD_GATE_PARAMS.ADX_OVERRIDE_WITH_RISING;
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} MACD gate bypassed via ADX override [${overrideType}] (ADX=${adx.toFixed(1)} >= ${threshold}, rising=${adxRisingForMacd})`);
          } else if (!hasOpposedLongEnough) {
            // MACD hasn't opposed long enough - soft block with reduced position
            macdGateAction = 'SOFT_BLOCK';
            macdPositionMultiplier = MACD_GATE_PARAMS.POSITION_MULTIPLIER_WEAK;
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} MACD DURATION CHECK: Only ${consecutiveOpposingBars} opposing bars (< ${MACD_GATE_PARAMS.MIN_OPPOSITION_BARS}) - soft block at ${(macdPositionMultiplier * 100).toFixed(0)}% position`);
          } else if (!isMacdSignificant) {
            // MACD magnitude not significant enough for hard block - soft block
            macdGateAction = 'SOFT_BLOCK';
            macdPositionMultiplier = MACD_GATE_PARAMS.POSITION_MULTIPLIER_SOFT;
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} MACD MAGNITUDE CHECK: Normalized ${macdHistNormalized.toFixed(6)} < ${MACD_GATE_PARAMS.MIN_HISTOGRAM_FOR_BLOCK} - soft block at ${(macdPositionMultiplier * 100).toFixed(0)}% position`);
          } else if (adx < MACD_GATE_PARAMS.SCORE_MULTIPLIER_BELOW_ADX) {
            // Below ADX 25, use score multiplier instead of hard block
            macdGateAction = 'SOFT_BLOCK';
            macdPositionMultiplier = MACD_GATE_PARAMS.POSITION_MULTIPLIER_SOFT;
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} MACD gate converted to soft block (ADX=${adx.toFixed(1)} < ${MACD_GATE_PARAMS.SCORE_MULTIPLIER_BELOW_ADX}) - ${(macdPositionMultiplier * 100).toFixed(0)}% position`);
          } else {
            // All conditions met for hard block: significant magnitude + 3+ bars opposing + no ADX override
            macdGateAction = 'HARD_BLOCK';
            rejectedByHardGates++;
            const macdReason = hasMacdDivergence 
              ? `MACD divergence (${consecutiveOpposingBars} bars opposing, normalized=${macdHistNormalized.toFixed(6)})` 
              : `MACD misaligned ${consecutiveOpposingBars} bars (normalized=${macdHistNormalized.toFixed(6)})`;
            perSymbolGateAttribution.set(symbol, { gate: 'MACD_MISALIGNED', details: macdReason });
            await logRejectionWithAI(
              supabase, userId, symbol,
              `HARD GATE: ${macdReason} (ADX=${adx.toFixed(1)}, override needs >= ${MACD_GATE_PARAMS.ADX_OVERRIDE_WITH_RISING} rising or >= ${MACD_GATE_PARAMS.ADX_OVERRIDE_UNCONDITIONAL})`,
              { 
                gate: "MACD_MISALIGNED",
                macdDirectionAligned,
                hasMacdDivergence,
                macdHistogramRaw: macdHistogramValue.toFixed(6),
                macdHistogramNormalized: macdHistNormalized.toFixed(6),
                atrForNormalization: atrForMacdGate.toFixed(4),
                consecutiveOpposingBars,
                minOppositionBars: MACD_GATE_PARAMS.MIN_OPPOSITION_BARS,
                minMagnitudeForBlock: MACD_GATE_PARAMS.MIN_HISTOGRAM_FOR_BLOCK,
                macdExpanding: momentum?.macdExpanding,
                adx: adx.toFixed(1),
                adxRising: adxRisingForMacd,
                adxOverrideWithRising: MACD_GATE_PARAMS.ADX_OVERRIDE_WITH_RISING,
                adxOverrideUnconditional: MACD_GATE_PARAMS.ADX_OVERRIDE_UNCONDITIONAL,
                ursScore: unifiedReversal.score,
                trend,
                confidence
              },
              trendData,
              riskParams.ai_analysis_enabled !== false
            );
            continue;
          }
        } else if ((!macdDirectionAligned || hasMacdDivergence) && ursAlreadyPenalizedMacd) {
          // Log that we're skipping the gate due to URS already handling it
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} MACD divergence gate skipped - already penalized in URS (score=${unifiedReversal.score})`);
        }
        
        // GATE 3: Higher timeframe alignment required (or high confidence or strong 1h or micro-trend)
        // RELAXED: Allow if 1h trend is strong (≥65% confidence) even if 4h is neutral
        // NEW: Also allow if micro-trend is detected (15m/30m aligned) when 4h is neutral
        const htfAligned = isAligned ?? false;
        const confidence1h = timeframes?.['1h']?.confidence || 0;
        const confidence30m = timeframes?.['30m']?.confidence || 0;
        const confidence15m = timeframes?.['15m']?.confidence || 0;
        const trend1h = timeframes?.['1h']?.trend || "neutral";
        
        // FIX #1: Calculate confidenceLocal (15m/30m/1h only) to avoid double-counting HTF in bypass logic
        // This prevents the self-reinforcing rejection cycle where low confidence (which includes HTF) 
        // blocks bypasses that are meant to compensate for HTF weakness
        const confidenceLocal = Math.round(
          (confidence1h * 0.5) + (confidence30m * 0.3) + (confidence15m * 0.2)
        );
        
        // Get 4h trend for counter-trend validation
        const trend4hForHTFGate = htfTrend4h || "neutral";
        
        // FIX #2: Strong 1H bypass now requires non-counter-trend to 4H
        // This prevents unintentional counter-trend entries (e.g., LONG when 4H is bearish)
        const is1hCounterTrendTo4h = (trend1h === "bullish" && trend4hForHTFGate === "bearish") ||
                                     (trend1h === "bearish" && trend4hForHTFGate === "bullish");
        const has1hStrongDirection = confidence1h >= 65 && 
                                     (trend1h === "bullish" || trend1h === "bearish") &&
                                     !is1hCounterTrendTo4h;  // FIX: Block counter-trend 1H bypass
        
        // ===== PHASE 2: HARDENED MICRO-TREND CHECK =====
        // Allows signals when 4h is neutral but lower TFs are aligned
        // Now requires: ADX >= 23 (lowered from 25), persistence >= 3 bars, volume confirmation
        // FIX: Added HTF alignment check to prevent counter-trend entries
        const microTrend = trendData.microTrend;
        
        // Get 4h trend direction for counter-trend validation
        const htfTrend4hForMicroTrend = htfTrend4h || "neutral";
        
        // PHASE 2: Stricter micro-trend validation (with lowered ADX threshold)
        // FIX: Now includes 4h counter-trend check - don't allow MICRO_TREND if 4h is strongly opposing
        const microTrendDirection = microTrend?.direction || "neutral";
        const is4hCounterTrend = (microTrendDirection === "bullish" && htfTrend4hForMicroTrend === "bearish") ||
                                  (microTrendDirection === "bearish" && htfTrend4hForMicroTrend === "bullish");
        
        // ===== OPTIMIZED MICRO_TREND SCALING (NEW) =====
        // Uses centralized scaling function with 6-step logic:
        // 1. Momentum State, 2. Momentum Score, 3. HTF Alignment, 
        // 4. Directional Runway, 5. ADX Rescue, 6. Minimum Floor
        const momentumStateForMicroTrend = momentum?.state || "none";
        const smartMomentumScore = smartMomentum?.score || 0;
        
        // Extract directional runway values
        const priceDistanceData = trendData.priceDistanceFromSwing;
        const moveFromLowPercent = priceDistanceData?.distanceFromLowPercent || 0;
        const moveFromHighPercent = priceDistanceData?.distanceFromHighPercent || 0;
        
        // Determine if this is a LONG (bullish) direction
        const isLongDirection = microTrendDirection === "bullish";
        
        // Prepare input for scaling calculator
        const microTrendScalingInput: MicroTrendScalingInput = {
          smartMomentumScore,
          momentumState: momentumStateForMicroTrend,
          trend4h: htfTrend4hForMicroTrend,
          isLong: isLongDirection,
          moveFromLowPercent,
          moveFromHighPercent,
          adx,
          adxSlope: extractADXSlope(trendData).slope,
          qualityScore: 0, // Will be calculated later, use 0 for initial check
        };
        
        // Calculate optimized scaling
        const microTrendScaling = calculateMicroTrendScaling(microTrendScalingInput);
        
        // Calculate momentum-based sizing tier (using optimized result)
        let microTrendMomentumMultiplier = microTrendScaling.sizeMultiplier;
        let microTrendMomentumBlockReason = microTrendScaling.blockReason;
        let microTrendMomentumBlocked = microTrendScaling.blocked;
        
        // FIX: Block micro-trend if 4h trend is strongly opposing (prevents counter-trend entries)
        // Allow if 4h is neutral or aligned with micro-trend direction
        // NEW: Also block if momentum is unconfirmed
        const hasMicroTrendBypass = microTrend?.hasMicroTrend === true && 
          !microTrend?.blocked &&  // Must not be blocked by safety checks
          !microTrendMomentumBlocked &&  // NEW: Must not be blocked by optimized scaling gate
          microTrend?.alignment >= MICRO_TREND_PARAMS.MIN_ALIGNMENT_SCORE && 
          microTrend?.adxSufficient === true &&  // ADX >= 23 required (lowered from 25)
          microTrend?.volumeConfirmed === true &&  // Volume confirmation required
          microTrend?.persistence >= MICRO_TREND_PARAMS.MIN_PERSISTENCE_BARS &&  // 3+ bars persistence
          (microTrend?.direction === "bullish" || microTrend?.direction === "bearish") &&
          !is4hCounterTrend;  // FIX: Block if 4h trend is opposing
        
        // Position size reduction for micro-trend entries (now includes optimized scaling)
        let microTrendPositionMultiplier = 1.0;
        if (hasMicroTrendBypass) {
          // Base micro-trend reduction (60%) combined with optimized multiplier
          const baseMicroTrendMultiplier = MICRO_TREND_PARAMS.MAX_POSITION_SIZE_PERCENT / 100;
          microTrendPositionMultiplier = baseMicroTrendMultiplier * microTrendMomentumMultiplier;
          
          // Log the detailed scaling breakdown
          if (MICRO_TREND_MOMENTUM_SAFETY.LOG_SIZING_TIERS) {
            const scalingSteps = microTrendScaling.appliedSteps;
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK} MICRO-TREND OPTIMIZED SCALING: ${microTrendScaling.scalingReasons.join('; ')}`);
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK}   → State: ${scalingSteps.momentumState.reason}`);
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK}   → Score: ${scalingSteps.momentumScore.reason}`);
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK}   → HTF: ${scalingSteps.htfAlignment.reason}`);
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK}   → Runway: ${scalingSteps.runway.reason}`);
            if (scalingSteps.adxRescue.applied) {
              logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK}   → ADX Rescue: ${scalingSteps.adxRescue.reason}`);
            }
            if (scalingSteps.floor.applied) {
              logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK}   → Floor: ${scalingSteps.floor.reason}`);
            }
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK}   → FINAL: ${(microTrendMomentumMultiplier * 100).toFixed(0)}% tier × ${(baseMicroTrendMultiplier * 100).toFixed(0)}% base = ${(microTrendPositionMultiplier * 100).toFixed(0)}% position`);
          }
        }
        
        // Log micro-trend bypass when used
        if (hasMicroTrendBypass && !htfAligned && confidence < 65) {
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.TREND} HTF gate bypassed via MICRO-TREND (${microTrend.direction}, alignment=${microTrend.alignment}%, persist=${microTrend.persistence}, volOK=${microTrend.volumeConfirmed}, ADX=${adx.toFixed(1)}, 4h=${htfTrend4hForMicroTrend}, momState=${momentumStateForMicroTrend})`);
        } else if (microTrendMomentumBlocked && microTrend?.hasMicroTrend && !htfAligned && confidence < 65) {
          // NEW: Log when micro-trend is blocked due to optimized scaling gate
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} 🚫 MICRO-TREND BLOCKED (OPTIMIZED): ${microTrendMomentumBlockReason}`);
        } else if (is4hCounterTrend && microTrend?.hasMicroTrend && !htfAligned && confidence < 65) {
          // FIX: Log when micro-trend is blocked due to counter-trend
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.TREND} MICRO-TREND BLOCKED: 4h trend (${htfTrend4hForMicroTrend}) opposes micro-trend (${microTrendDirection}) - preventing counter-trend entry`);
        } else if (microTrend?.blocked && !htfAligned && confidence < 65) {
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.TREND} MICRO-TREND detected but BLOCKED: ${microTrend.blockReason}`);
        }
        
        // ===== PHASE 3: PRICE ACTION DIRECTION OVERRIDE =====
        // When all timeframes show neutral/low confidence, derive direction from price action
        // This allows entries based on significant price moves even without HTF confirmation
        // FIX #3 (Audit): Disable in RANGE regime to prevent chop losses at range extremes
        let priceActionOverrideActive = false;
        let priceActionOverrideDirection: "bullish" | "bearish" | "neutral" = "neutral";
        let priceActionOverridePositionMultiplier = 1.0;
        let priceActionBlockedByRangeRegime = false;
        
        // FIX #3: Check if regime is RANGE - block price action override in ranging markets
        const currentRegimeForPAO = regime?.regime?.toUpperCase() || 'UNKNOWN';
        const isRangeRegime = currentRegimeForPAO === 'RANGE' || currentRegimeForPAO === 'RANGING';
        
        if (PRICE_ACTION_DIRECTION_OVERRIDE_PARAMS.ENABLED) {
          // FIX #3: Block price action override in RANGE regime
          if (isRangeRegime) {
            priceActionBlockedByRangeRegime = true;
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} 🚫 PRICE ACTION OVERRIDE BLOCKED: Regime=${currentRegimeForPAO} - disabled in RANGE to prevent chop losses`);
          } else {
            const priceActionMomentum = trendData.priceActionMomentum;
            const priceMovePercent = Math.abs(priceActionMomentum?.movePercent || 0);
            const priceDirection = priceActionMomentum?.direction || "neutral";
            const macdExpandingForOverride = momentum?.macdExpanding === true;
            const macdHistogramForOverride = momentum?.macdHistogram || 0;
            const macdMatchesDirection = (priceDirection === "bullish" && macdHistogramForOverride > 0) ||
                                         (priceDirection === "bearish" && macdHistogramForOverride < 0);
            
            // Check if conditions for price action override are met
            const meetsMinMove = priceMovePercent >= PRICE_ACTION_DIRECTION_OVERRIDE_PARAMS.MIN_PRICE_MOVE_PERCENT;
            const isStrongMove = priceMovePercent >= PRICE_ACTION_DIRECTION_OVERRIDE_PARAMS.STRONG_PRICE_MOVE_PERCENT;
            const macdOk = !PRICE_ACTION_DIRECTION_OVERRIDE_PARAMS.REQUIRE_MACD_EXPANDING || macdExpandingForOverride;
            const macdDirectionOk = !PRICE_ACTION_DIRECTION_OVERRIDE_PARAMS.REQUIRE_MACD_DIRECTION_MATCH || macdMatchesDirection;
            const adxInRange = adx >= PRICE_ACTION_DIRECTION_OVERRIDE_PARAMS.MIN_ADX && 
                              adx <= PRICE_ACTION_DIRECTION_OVERRIDE_PARAMS.MAX_ADX;
            const reversalScoreOk = unifiedReversal.score <= PRICE_ACTION_DIRECTION_OVERRIDE_PARAMS.MAX_REVERSAL_SCORE;
            
            if (meetsMinMove && macdOk && macdDirectionOk && adxInRange && reversalScoreOk && 
                (priceDirection === "bullish" || priceDirection === "bearish")) {
              priceActionOverrideActive = true;
              priceActionOverrideDirection = priceDirection;
              priceActionOverridePositionMultiplier = isStrongMove 
                ? PRICE_ACTION_DIRECTION_OVERRIDE_PARAMS.STRONG_POSITION_REDUCTION
                : PRICE_ACTION_DIRECTION_OVERRIDE_PARAMS.STANDARD_POSITION_REDUCTION;
              
              logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} 🚀 PRICE ACTION OVERRIDE ACTIVE: ${priceMovePercent.toFixed(2)}% ${priceDirection.toUpperCase()} move (regime=${currentRegimeForPAO})`);
              logger.forSymbol(symbol).info(`   → MACD expanding=${macdExpandingForOverride}, direction match=${macdMatchesDirection}`);
              logger.forSymbol(symbol).info(`   → ADX=${adx.toFixed(1)}, reversal score=${unifiedReversal.score}`);
              logger.forSymbol(symbol).info(`   → Position size: ${(priceActionOverridePositionMultiplier * 100).toFixed(0)}%`);
            }
          }
        }
        
        // ===== PHASE 5: STRONG MOMENTUM OVERRIDE =====
        // Bypass HTF alignment gates when momentum is undeniably strong
        // This is the "momentum is overwhelming" exception path
        let strongMomentumOverrideActive = false;
        let strongMomentumOverridePositionMultiplier = 1.0;
        
        if (STRONG_MOMENTUM_OVERRIDE_PARAMS.ENABLED && !htfAligned && confidence < 65) {
          const priceActionMomentum = trendData.priceActionMomentum;
          const priceMovePercent = Math.abs(priceActionMomentum?.movePercent || 0);
          const macdExpandingForSMO = momentum?.macdExpanding === true;
          const macdStrongForSMO = momentum?.macdStrong === true;
          const reversalScoreOkForSMO = unifiedReversal.score < STRONG_MOMENTUM_OVERRIDE_PARAMS.MAX_REVERSAL_SCORE;
          const adxOkForSMO = adx >= STRONG_MOMENTUM_OVERRIDE_PARAMS.MIN_ADX;
          
          // Primary path: All conditions met (expanding + strong + move + adx + reversal)
          const primaryPathMet = macdExpandingForSMO && 
                                macdStrongForSMO && 
                                priceMovePercent >= STRONG_MOMENTUM_OVERRIDE_PARAMS.MIN_PRICE_MOVE_PERCENT &&
                                adxOkForSMO &&
                                reversalScoreOkForSMO;
          
          // Fallback path: Expanding only (no strong) but larger move required
          const fallbackPathMet = STRONG_MOMENTUM_OVERRIDE_PARAMS.ALLOW_WITHOUT_STRONG_MACD &&
                                 macdExpandingForSMO &&
                                 !macdStrongForSMO &&
                                 priceMovePercent >= STRONG_MOMENTUM_OVERRIDE_PARAMS.FALLBACK_EXPANDING_ONLY_MIN_MOVE &&
                                 adxOkForSMO &&
                                 reversalScoreOkForSMO;
          
          if (primaryPathMet || fallbackPathMet) {
            strongMomentumOverrideActive = true;
            strongMomentumOverridePositionMultiplier = STRONG_MOMENTUM_OVERRIDE_PARAMS.POSITION_SIZE_MULTIPLIER;
            
            const pathUsed = primaryPathMet ? "PRIMARY" : "FALLBACK";
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} ⚡ STRONG MOMENTUM OVERRIDE (${pathUsed}): Bypassing HTF alignment`);
            logger.forSymbol(symbol).info(`   → MACD: expanding=${macdExpandingForSMO}, strong=${macdStrongForSMO}`);
            logger.forSymbol(symbol).info(`   → Price move: ${priceMovePercent.toFixed(2)}%, ADX=${adx.toFixed(1)}, reversal=${unifiedReversal.score}`);
            logger.forSymbol(symbol).info(`   → Position size: ${(strongMomentumOverridePositionMultiplier * 100).toFixed(0)}%`);
          }
        }
        
        // ===== PHASE 6: MOMENTUM BONUS SYSTEM =====
        // Apply bonuses to gate thresholds when momentum is strong
        let momentumBonus = 0;
        let gateThresholdMultiplier = 1.0;
        
        if (MOMENTUM_BONUS_PARAMS.ENABLED) {
          const priceActionMomentum = trendData.priceActionMomentum;
          const priceMovePercent = Math.abs(priceActionMomentum?.movePercent || 0);
          
          // Accumulate bonuses
          if (priceMovePercent >= MOMENTUM_BONUS_PARAMS.MIN_PRICE_MOVE_FOR_REDUCTION) {
            momentumBonus += MOMENTUM_BONUS_PARAMS.PRICE_ACTION_BONUS;
          }
          if (momentum?.macdExpanding === true) {
            momentumBonus += MOMENTUM_BONUS_PARAMS.MACD_EXPANDING_BONUS;
          }
          if (momentum?.macdStrong === true) {
            momentumBonus += MOMENTUM_BONUS_PARAMS.MACD_STRONG_BONUS;
          }
          
          // Cap bonus
          momentumBonus = Math.min(momentumBonus, MOMENTUM_BONUS_PARAMS.MAX_TOTAL_BONUS);
          
          // Apply gate threshold reduction when strong momentum
          if (priceMovePercent >= MOMENTUM_BONUS_PARAMS.MIN_PRICE_MOVE_FOR_REDUCTION) {
            gateThresholdMultiplier = MOMENTUM_BONUS_PARAMS.GATE_THRESHOLD_REDUCTION_MULTIPLIER;
          }
          
          if (momentumBonus > 0 && MOMENTUM_BONUS_PARAMS.LOG_BONUS_APPLICATION) {
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.MOMENTUM} MOMENTUM BONUS: +${momentumBonus} points, gate threshold multiplier: ${gateThresholdMultiplier}`);
          }
        }
        
        // CRITICAL FIX: Also bypass HTF gate if LOW_ADX_TREND_EXCEPTION is active
        // OR if PRICE_ACTION_OVERRIDE is active OR if STRONG_MOMENTUM_OVERRIDE is active
        // This allows transitional zone (ADX 20-25) entries when HTF confirmation exists via the exception
        
        // FIX #3: Make overrides directional - they must align with intended trade direction
        // Prevents "override leakage" where a bearish override could bypass gates for a LONG entry
        // Convert derivedDirection ("long"/"short") to market direction ("bullish"/"bearish")
        const intendedMarketDirection: "bullish" | "bearish" | "neutral" = 
          derivedDirection === "long" ? "bullish" : 
          derivedDirection === "short" ? "bearish" : 
          htfTrend4h || "neutral";
        
        const lowAdxOverrideAligned = lowAdxTrendExceptionActive; // Already direction-validated in its logic
        const priceActionOverrideAligned = priceActionOverrideActive && 
                                           (priceActionOverrideDirection === intendedMarketDirection || intendedMarketDirection === "neutral");
        const momentumDirection = momentum?.direction as "bullish" | "bearish" | "neutral" | undefined;
        const strongMomentumOverrideAligned = strongMomentumOverrideActive && 
                                              (momentumDirection === intendedMarketDirection || intendedMarketDirection === "neutral");
        
        const anyOverrideActive = lowAdxOverrideAligned || priceActionOverrideAligned || strongMomentumOverrideAligned;
        
        // Log when override is blocked due to direction mismatch
        if ((priceActionOverrideActive && !priceActionOverrideAligned) ||
            (strongMomentumOverrideActive && !strongMomentumOverrideAligned)) {
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} OVERRIDE DIRECTION MISMATCH: price=${priceActionOverrideDirection}, momentum=${momentumDirection}, intended=${intendedMarketDirection}`);
        }
        
        // FIX #1 APPLIED: Use confidenceLocal instead of global confidence for bypass logic
        if (!htfAligned && confidenceLocal < 65 && !has1hStrongDirection && !hasMicroTrendBypass && !anyOverrideActive) {
          rejectedByHardGates++;
          const microTrendInfo = microTrend?.blocked 
            ? `blocked (${microTrend.blockReason})`
            : microTrend?.hasMicroTrend === false 
              ? "not detected"
              : `insufficient (align=${microTrend?.alignment}, persist=${microTrend?.persistence}, volOK=${microTrend?.volumeConfirmed})`;
          const lowAdxInfo = lowAdxTrendExceptionActive ? ` (LOW_ADX_EXCEPTION active)` : '';
          const counterTrendInfo = is1hCounterTrendTo4h ? ' (1h counter-trend to 4h)' : '';
          perSymbolGateAttribution.set(symbol, { gate: 'HTF_NOT_ALIGNED', details: `confLocal=${confidenceLocal}%, 1h=${confidence1h}%${lowAdxInfo}${counterTrendInfo}` });
          await logRejectionWithAI(
            supabase, userId, symbol,
            `HARD GATE: HTF not aligned, confidence too low, 1h not strong, and micro-trend ${microTrendInfo}`,
            { 
              htfAligned, 
              confidence,  // Keep global for reference
              confidenceLocal,  // FIX #1: Add local confidence for transparency
              confidence1h,
              confidence30m,
              confidence15m,
              trend1h,
              trend4h: trend4hForHTFGate,
              is1hCounterTrendTo4h,  // FIX #2: Log counter-trend status
              microTrend: microTrend || null,
              microTrendInfo,
              gate: "HTF_NOT_ALIGNED",
              // FIX #4: Add "what would have passed" hints
              bypassHints: {
                needsConfidenceLocal: 65 - confidenceLocal,  // Points needed
                needs1hConfidence: 65 - confidence1h,
                needs4hAligned: !htfAligned,
                is1hBlockedByCounterTrend: is1hCounterTrendTo4h,
                microTrendBlocked: is4hCounterTrend,
                priceActionBlockedByRangeRegime,  // FIX #3: Track RANGE regime blocking
                currentRegime: currentRegimeForPAO,
              },
              momentum: {
                confirms: momentum?.confirms ?? false,
                state: momentum?.state ?? 'none',
                direction: momentumDirection ?? 'neutral',
                hasDivergence: momentum?.hasDivergence ?? false,
                lastCloseAlignsWithTrend: momentum?.lastCloseAlignsWithTrend ?? false,
                macdDirectionAligned: momentum?.macdDirectionAligned ?? false,
                macdExpanding: momentum?.macdExpanding ?? false,
                consecutiveBars1h: momentum?.consecutiveBars1h ?? 0,
                consecutiveBars30m: momentum?.consecutiveBars30m ?? 0,
                consecutiveBars15m: momentum?.consecutiveBars15m ?? 0
              }
            },
            trendData,
            riskParams.ai_analysis_enabled !== false
          );
          continue;
        }
        
        // Log if using 1h strong direction exception (now with counter-trend info)
        if (!htfAligned && confidenceLocal < 65 && has1hStrongDirection) {
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.TREND} HTF gate passed via strong 1h (1h=${trend1h} ${confidence1h}%, 4h=${trend4hForHTFGate}, non-counter-trend)`);
        }
        
        // Log if using LOW_ADX_TREND_EXCEPTION to bypass HTF gate
        if (!htfAligned && confidence < 65 && !has1hStrongDirection && !hasMicroTrendBypass && lowAdxTrendExceptionActive) {
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.TREND} HTF gate passed via LOW_ADX_TREND_EXCEPTION (ADX=${adx.toFixed(1)} in 12-25 range with HTF confirmation)`);
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
          const recoveryRsi = trendData?.timeframes?.['1h']?.indicators?.rsi ?? 50;
          
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
          // Check if price action confirms the move (3+ consecutive bars in same direction)
          const consecutiveBars1h = momentum?.consecutiveBars1h ?? 0;
          const consecutiveBars15m = momentum?.consecutiveBars15m ?? 0;
          const consecutiveBars30m = momentum?.consecutiveBars30m ?? 0;
          
          // Price action confirmation: 3+ consecutive 1h bars OR 4+ bars on lower timeframes
          const priceActionConfirms = consecutiveBars1h >= 3 || 
                                       (consecutiveBars15m >= 4 && consecutiveBars30m >= 4);
          
          if (priceActionConfirms) {
            // Reduced penalty when price action confirms the move
            fakeBreakoutPenalty = -3; // Reduced from -8 to -3
            logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.MOMENTUM} FAKE BREAKOUT RISK (REDUCED): ADX falling but price action confirms (1h=${consecutiveBars1h}, 15m=${consecutiveBars15m}, 30m=${consecutiveBars30m} consecutive bars) → reduced penalty ${fakeBreakoutPenalty}`);
          } else {
            fakeBreakoutPenalty = -8; // Full penalty when price action doesn't confirm
            logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.MOMENTUM} FAKE BREAKOUT RISK: MACD expanding but ADX falling, no price action confirmation (1h=${consecutiveBars1h}, 15m=${consecutiveBars15m}, 30m=${consecutiveBars30m} bars) → quality penalty ${fakeBreakoutPenalty}`);
          }
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
        
        // ============= PHASE 4: Apply Fake Breakout Penalty, Genuine Momentum Bonus, Continuation Bonus, AND Regime Quality Boost =============
        let qualityScore = Math.max(0, Math.min(100, rawQualityScore + fakeBreakoutPenalty + genuineMomentumBonus + momentumContinuationBonus));
        
        // ============= ENHANCED TRUE ALIGNMENT QUALITY BOOST (v2.0) =============
        // Use weighted components for smarter quality adjustments
        let alignmentQualityBoost = 0;
        const tf4hWeighted = weightedComponents.tf4hWeighted ?? 0;
        const tf1hWeighted = weightedComponents.tf1hWeighted ?? 0;
        const adxWeighted = weightedComponents.adxWeighted ?? 0;
        
        // Premium alignment: Both timeframes strongly contribute + ADX contributes
        if (tf4hWeighted >= 30 && tf1hWeighted >= 15 && adxContribution >= 15) {
          alignmentQualityBoost = 5; // +5 pts for premium aligned entries
        } else if (tf4hWeighted >= 25 && tf1hWeighted >= 10) {
          alignmentQualityBoost = 3; // +3 pts for solid alignment
        } else if (neutralCapped || tf4hConfidence < 40) {
          alignmentQualityBoost = -3; // -3 pts for weak/uncertain direction
        }
        
        if (alignmentQualityBoost !== 0) {
          qualityScore = Math.max(0, Math.min(100, qualityScore + alignmentQualityBoost));
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.QUALITY} TrueAlignment v2.0 boost: ${alignmentQualityBoost > 0 ? '+' : ''}${alignmentQualityBoost} pts (tf4h=${tf4hWeighted.toFixed(1)}, tf1h=${tf1hWeighted.toFixed(1)}, adx=${adxContribution.toFixed(1)}${neutralCapped ? ', CAPPED' : ''})`);
        }
        
        // Apply regime-aware quality boost for strong trend/parabolic regimes
        let regimeQualityBoostApplied = 0;
        if (isRegimeOverrideActive && regimeQualityBoost > 0) {
          // Cap the boosted score at 85 to avoid over-boosting marginal entries
          const boostedScore = Math.min(qualityScore + regimeQualityBoost, 85);
          regimeQualityBoostApplied = boostedScore - qualityScore;
          qualityScore = boostedScore;
        }
        
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
        if (alignmentQualityBoost !== 0) {
          breakdown += ` ALIGN2:${alignmentQualityBoost > 0 ? '+' : ''}${alignmentQualityBoost}`;
        }
        if (regimeQualityBoostApplied > 0) {
          breakdown += ` REGIME:+${regimeQualityBoostApplied}`;
        }
        
        // Log if adjustments were applied
        if (fakeBreakoutPenalty !== 0 || genuineMomentumBonus !== 0 || momentumContinuationBonus !== 0 || alignmentQualityBoost !== 0 || regimeQualityBoostApplied > 0) {
          const alignNote = alignmentQualityBoost !== 0 ? `, ALIGN2:${alignmentQualityBoost > 0 ? '+' : ''}${alignmentQualityBoost}` : '';
          const regimeNote = regimeQualityBoostApplied > 0 ? `, REGIME:+${regimeQualityBoostApplied}` : '';
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.QUALITY} Quality adjusted: ${rawQualityScore}→${qualityScore} (FAKE:${fakeBreakoutPenalty}, GMOM:+${genuineMomentumBonus}, MCONT:+${momentumContinuationBonus}${alignNote}${regimeNote})`);
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
        // PHASE 4: Now includes momentum data for early trend detection exception
        const isNeutralTrend = tradeDirectionForGate === 'neutral';
        const macdExpandingForQuality = momentum?.macdExpanding === true;
        const MIN_QUALITY_SCORE = getMinQualityScore(
          adx, isInRecoveryMode, confidence1h, isNeutralTrend, lowVolumeBoost,
          smartMomentum.score, smartAdxRising, macdExpandingForQuality
        ) + regimeTransitionQualityBoost;
        
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
              derivedDirection,
              direction: derivedDirection,
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
          percentBBypassMultiplier?: number; // PHASE 2 FIX: Carry %B bypass multiplier (0.70) through to position sizing
        }
        const candidates: StrategyCandidate[] = [];
        
        // ============= PHASE 16: ADAPTIVE SIGNAL GENERATION =============
        // Strategy-independent signal generation based purely on market conditions
        // Runs in parallel with strategy loop for shadow comparison, or replaces it in FULL mode
        let adaptiveSignalResult: AdaptiveSignalResult | null = null;
        let adaptiveSignalLogged = false;
        
        if (ADAPTIVE_SIGNAL_MODE.MODE !== 'DISABLED') {
          // Build adaptive context from all calculated values
          const adaptiveContext: AdaptiveContext = {
            // Trend data
            htfTrend4h: htfTrend4h || 'neutral',
            htfTrend1h: htfTrend1h || 'neutral',
            htfConf4h: stochFilterConf4h || 50,
            htfConf1h: stochFilterConf1h || 50,
            primaryTrend: trend,
            trendConsistency: trendConsistency || 50,
            
            // ADX data
            adx: adx,
            adxSlope: fullAdxResult?.adxSlope ?? 0,
            adxRising: trendData.volatility?.adxRising ?? false,
            diGap: fullAdxResult?.diGap ?? 0,
            
            // Momentum data
            momentumScore: earlyMomentumScore || 0,
            momentumState: momentum?.state || 'none',
            momentumConfirms: momentum?.confirms ?? false,
            macdHistogram: trendData.macd?.histogram ?? 0,
            macdExpanding: momentum?.macdExpanding ?? false,
            
            // StochRSI data
            stochRsiK: stochRsiK4h,
            stochRsiD: stochRsiD4h,
            stochRsiTrend: stochFilterTrend4h || 'neutral',
            
            // Bollinger data
            percentB: percentB,
            bbSqueeze: trendData.bollinger?.squeeze ?? false,
            
            // Reversal data
            reversalScore: unifiedReversal.score,
            
            // Volume data
            volumeConfirms: momentum?.volumeConfirms ?? false,
            volumeRatio: volumeRatio,
            
            // Order flow
            orderFlowScore: earlyOrderFlowAnalysis?.score ?? 0,
            orderFlowSignal: earlyOrderFlowAnalysis?.signal ?? 'neutral',
            
            // Pullback analysis
            isPullback: pullbackAnalysis.isPullback,
            pullbackDepth: pullbackAnalysis.pullbackDepth || 0,
            entryTimingScore: pullbackAnalysis.entryTimingScore || 0,
            
            // Price action
            priceMove6h: priceMove || 0,
            
            // Current price and ATR
            currentPrice: parseFloat(marketDataMap.get(symbol)?.lastPrice || '0'),
            atr: trendData.volatility?.atr ?? 0,
          };
          
          // Generate adaptive signal
          adaptiveSignalResult = generateAdaptiveSignal(
            symbol,
            adaptiveContext,
            qualityScore,
            breakdown
          );
          
          if (adaptiveSignalResult) {
            const entryLabel = getEntryTypeLabel(adaptiveSignalResult.entryType);
            
            // Log adaptive signal generation
            if (ADAPTIVE_SIGNAL_MODE.LOG_ADAPTIVE_SIGNALS) {
              logger.forSymbol(symbol).info(
                `${LOG_CATEGORIES.SUCCESS} ADAPTIVE SIGNAL: ${adaptiveSignalResult.direction.toUpperCase()} | ` +
                `Type: ${entryLabel} | Conf: ${adaptiveSignalResult.confidence}% | ` +
                `SL: ${adaptiveSignalResult.stopLossPercent.toFixed(2)}% | TP: ${adaptiveSignalResult.takeProfitPercent.toFixed(2)}% | ` +
                `Position: ${(adaptiveSignalResult.positionSizeMultiplier * 100).toFixed(0)}% | ` +
                `Reason: ${adaptiveSignalResult.reason}`
              );
            }
            
            // In FULL mode, add adaptive signal as primary candidate
            if (ADAPTIVE_SIGNAL_MODE.MODE === 'FULL') {
              const adaptiveStrategy = {
                id: `adaptive-${adaptiveSignalResult.entryType.toLowerCase()}`,
                name: entryLabel,
                risk_settings: {
                  stopLossPercent: adaptiveSignalResult.stopLossPercent,
                  takeProfitPercent: adaptiveSignalResult.takeProfitPercent,
                  positionSizePercent: 1,
                  priority: 10  // High priority
                }
              };
              
              const adaptiveIndicators = new Map<string, number>();
              adaptiveIndicators.set("Price", adaptiveContext.currentPrice);
              
              candidates.push({
                strategy: adaptiveStrategy,
                score: qualityScore,
                indicatorValues: adaptiveIndicators,
                signalType: adaptiveSignalResult.direction,
                positionSizeMultiplier: adaptiveSignalResult.positionSizeMultiplier * ADAPTIVE_SIGNAL_MODE.FULL_POSITION_MULTIPLIER,
                convergenceEntry: false
              });
              
              logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} ADAPTIVE MODE (FULL): Added "${entryLabel}" as primary candidate`);
              adaptiveSignalLogged = true;
            }
          }
        }
        
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
          
          // ============= PHASE 1: PRE-SIGNAL VALIDITY GATE =============
          // Check semantic consistency BEFORE any other evaluation
          const signalTypeValidation = validateSignalTypeRequirements(
            strategy.id || '',
            strategy.name,
            trendData,
            derivedDirection
          );
          
          if (!signalTypeValidation.isValid) {
            rejectedByStrategy++;
            perSymbolGateAttribution.set(symbol, { 
              gate: 'SIGNAL_TYPE_SEMANTIC_MISMATCH', 
              details: signalTypeValidation.violations[0] || '' 
            });
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} PRE-SIGNAL VALIDITY: ${strategy.name} invalid - ${signalTypeValidation.blockReason}`);
            strategyNearMisses.push({
              name: strategy.name,
              passedCount: 0,
              totalConditions: entryConditions.length,
              failedConditions: [],
              skipReason: `Signal type invalid: ${signalTypeValidation.violations.join(', ')}`
            });
            continue;
          }
          
          // ============= 4-STATE REGIME: TREND_EXHAUSTION HARD BLOCK FOR CONTINUATION =============
          // If regime is TREND_EXHAUSTION, only Mean Reversion strategies pass.
          // Continuation strategies are hard-blocked at strategy level to prevent regime leakage.
          if (fourStateRegime.regime === 'TREND_EXHAUSTION' && !fourStateRegime.allowContinuation) {
            const stratIsMR = isMeanReversionStrategy(strategy.id || '', strategy.name);
            if (!stratIsMR) {
              rejectedByStrategy++;
              perSymbolGateAttribution.set(symbol, { 
                gate: 'TREND_EXHAUSTION_CONTINUATION_BLOCK', 
                details: `Strategy "${strategy.name}" is continuation but regime=TREND_EXHAUSTION (ADX declining/exhausted) → only MR probes allowed` 
              });
              logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} 🚫 TREND_EXHAUSTION: Continuation strategy "${strategy.name}" hard-blocked (regime forbids continuation)`);
              strategyNearMisses.push({
                name: strategy.name,
                passedCount: 0,
                totalConditions: entryConditions.length,
                failedConditions: [],
                skipReason: `TREND_EXHAUSTION regime blocks continuation strategies`
              });
              continue;
            }
          }
          
          // ============= PHASE 4: SQUEEZE STATE CLASSIFICATION =============
          // Block breakout strategies during low-ADX squeeze (reclassify as watchlist)
          const squeezeClass = classifySqueezeState(trendData, strategy.name);
          if (squeezeClass.shouldReclassify) {
            rejectedByStrategy++;
            perSymbolGateAttribution.set(symbol, { 
              gate: 'SQUEEZE_RECLASSIFICATION', 
              details: squeezeClass.reason || '' 
            });
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} SQUEEZE RECLASSIFICATION: ${strategy.name} → ${squeezeClass.newClassification} (${squeezeClass.reason})`);
            strategyNearMisses.push({
              name: strategy.name,
              passedCount: 0,
              totalConditions: entryConditions.length,
              failedConditions: [],
              skipReason: `Squeeze reclassified: ${squeezeClass.reason}`
            });
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
              
              // ============= PHASE 14: RANGING MARKET STRATEGY CHECK =============
              // When in ranging market, only allow strategies designed for range trading
              if (isInRangingMarket && RANGING_MARKET_PROTECTION.ENABLED) {
                const isAllowedInRange = RANGING_MARKET_PROTECTION.ALLOWED_STRATEGIES_IN_RANGE.includes(strategy.name);
                
                if (!isAllowedInRange) {
                  rejectedByStrategy++;
                  perSymbolGateAttribution.set(symbol, { gate: 'RANGING_MARKET_PAUSE', details: `${strategy.name} not allowed in ranging` });
                  logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.GATE} RANGING_MARKET_PAUSE: "${strategy.name}" blocked - not in allowed list for ranging markets`);
                  
                  strategyNearMisses.push({ 
                    name: strategy.name, 
                    passedCount: entryConditions.length, 
                    totalConditions: entryConditions.length, 
                    failedConditions: [], 
                    skipReason: `Ranging market: strategy not allowed (only ${RANGING_MARKET_PROTECTION.ALLOWED_STRATEGIES_IN_RANGE.join(', ')})` 
                  });
                  continue;
                }
              }
              
              // ============= PHASE 4: STRATEGY-SPECIFIC ADX RESTRICTIONS =============
              // Expert insight: "HTF Neutral Breakout strategy must be explicitly disabled when ADX ≥ 35"
              // Check if current ADX violates strategy's allowed range
              const strategyRestriction = STRATEGY_ADX_RESTRICTIONS[strategy.name];
              if (strategyRestriction) {
                // Check MAX_ADX: Strategy blocked if ADX is too high
                if (strategyRestriction.MAX_ADX !== undefined && adx >= strategyRestriction.MAX_ADX) {
                  rejectedByStrategy++;
                  perSymbolGateAttribution.set(symbol, { gate: 'STRATEGY_ADX_LIMIT', details: `${strategy.name} ADX ${adx.toFixed(1)} >= ${strategyRestriction.MAX_ADX}` });
                  logger.forSymbol(symbol).warn(`STRATEGY_ADX_BLOCK: "${strategy.name}" disabled at ADX=${adx.toFixed(1)} >= ${strategyRestriction.MAX_ADX} (${strategyRestriction.REASON})`);
                  
                  // Log rejection with AI for analysis
                  logRejectionWithAI(
                    supabase,
                    userId,
                    symbol,
                    `Strategy ${strategy.name} blocked by ADX restriction`,
                    trendData,
                    {
                      strategy_name: strategy.name,
                      adx: adx.toFixed(1),
                      max_allowed_adx: strategyRestriction.MAX_ADX,
                      reason: strategyRestriction.REASON,
                      blockReasonCode: 'STRATEGY_ADX_LIMIT',
                      primaryGateFailed: 'strategy_max_adx'
                    }
                  );
                  
                  strategyNearMisses.push({ 
                    name: strategy.name, 
                    passedCount: entryConditions.length, 
                    totalConditions: entryConditions.length, 
                    failedConditions: [], 
                    skipReason: `ADX ${adx.toFixed(1)} >= max ${strategyRestriction.MAX_ADX}: ${strategyRestriction.REASON}` 
                  });
                  continue;
                }
                
                // Check MIN_ADX: Strategy blocked if ADX is too low
                if (strategyRestriction.MIN_ADX !== undefined && adx < strategyRestriction.MIN_ADX) {
                  rejectedByStrategy++;
                  perSymbolGateAttribution.set(symbol, { gate: 'STRATEGY_ADX_LIMIT', details: `${strategy.name} ADX ${adx.toFixed(1)} < ${strategyRestriction.MIN_ADX}` });
                  logger.forSymbol(symbol).info(`STRATEGY_ADX_BLOCK: "${strategy.name}" requires ADX >= ${strategyRestriction.MIN_ADX}, current=${adx.toFixed(1)} (${strategyRestriction.REASON})`);
                  
                  strategyNearMisses.push({ 
                    name: strategy.name, 
                    passedCount: entryConditions.length, 
                    totalConditions: entryConditions.length, 
                    failedConditions: [], 
                    skipReason: `ADX ${adx.toFixed(1)} < min ${strategyRestriction.MIN_ADX}: ${strategyRestriction.REASON}` 
                  });
                  continue;
                }
              }
              
              // ============= PHASE 13: STRATEGY-SPECIFIC HTF ALIGNMENT REQUIREMENT =============
              // Expert insight: "EMA Death Cross generated SELL signals during neutral trend"
              // Crossover-based strategies require HTF confirmation in the trade direction
              const strategyDirReq = STRATEGY_DIRECTION_REQUIREMENTS[strategy.name];
              if (strategyDirReq) {
                const htf1hTrend = htfTrend1h;
                const htf4hTrend = htfTrend4h;
                const currentMomentumScore = smartMomentum.score;
                
                // Check 1h directional requirement
                let htfRequirementMet = true;
                let htfMismatchReason = '';
                
                if (strategyDirReq.require1hDirectional) {
                  // For SELL strategies: 1h must be bearish (or 4h bearish with neutral 1h allowed)
                  // For BUY strategies: 1h must be bullish (or 4h bullish with neutral 1h allowed)
                  const expectedDirection = strategyDirReq.side === 'SELL' ? 'bearish' : 'bullish';
                  
                  const htf1hMatches = htf1hTrend === expectedDirection;
                  const htf4hMatches = htf4hTrend === expectedDirection;
                  const htf4hNeutralAllowed = strategyDirReq.allowNeutral4h && htf4hTrend === 'neutral' && htf1hMatches;
                  
                  if (!htf1hMatches && !htf4hMatches && !htf4hNeutralAllowed) {
                    htfRequirementMet = false;
                    htfMismatchReason = `1h=${htf1hTrend}, 4h=${htf4hTrend} (need ${expectedDirection})`;
                  }
                }
                
                // Check ADX requirement
                if (htfRequirementMet && strategyDirReq.requireMinADX !== undefined) {
                  if (adx < strategyDirReq.requireMinADX) {
                    htfRequirementMet = false;
                    htfMismatchReason = `ADX=${adx.toFixed(1)} < ${strategyDirReq.requireMinADX}`;
                  }
                }
                
                // Check momentum alignment requirement
                if (htfRequirementMet && strategyDirReq.requireMomentumAligned && strategyDirReq.minMomentumScore !== undefined) {
                  const minMom = strategyDirReq.minMomentumScore;
                  // For SELL: momentum must be <= minMomentumScore (negative)
                  // For BUY: momentum must be >= minMomentumScore (positive)
                  if (strategyDirReq.side === 'SELL' && currentMomentumScore > minMom) {
                    htfRequirementMet = false;
                    htfMismatchReason = `Momentum=${currentMomentumScore} > ${minMom} (need negative for SHORT)`;
                  } else if (strategyDirReq.side === 'BUY' && currentMomentumScore < minMom) {
                    htfRequirementMet = false;
                    htfMismatchReason = `Momentum=${currentMomentumScore} < ${minMom} (need positive for LONG)`;
                  }
                }
                
                if (!htfRequirementMet) {
                  rejectedByStrategy++;
                  perSymbolGateAttribution.set(symbol, { 
                    gate: 'STRATEGY_HTF_ALIGNMENT', 
                    details: `${strategy.name}: ${htfMismatchReason}` 
                  });
                  logger.forSymbol(symbol).warn(
                    `${LOG_CATEGORIES.GATE} STRATEGY_HTF_ALIGNMENT: "${strategy.name}" blocked - ${strategyDirReq.REASON}`
                  );
                  logger.forSymbol(symbol).warn(
                    `   → Mismatch: ${htfMismatchReason}`
                  );
                  
                  // Log rejection for analysis
                  logRejectionWithAI(
                    supabase,
                    userId,
                    symbol,
                    `STRATEGY_HTF_ALIGNMENT: ${strategy.name} blocked - ${htfMismatchReason}`,
                    {
                      gate: 'STRATEGY_HTF_ALIGNMENT',
                      strategy_name: strategy.name,
                      expected_side: strategyDirReq.side,
                      htf1h: htf1hTrend,
                      htf4h: htf4hTrend,
                      adx: adx.toFixed(1),
                      minAdxRequired: strategyDirReq.requireMinADX,
                      momentumScore: currentMomentumScore,
                      minMomentumRequired: strategyDirReq.minMomentumScore,
                      reason: strategyDirReq.REASON,
                      blockReasonCode: 'STRATEGY_HTF_MISMATCH',
                    },
                    trendData,
                    riskParams.ai_analysis_enabled !== false
                  );
                  
                  strategyNearMisses.push({ 
                    name: strategy.name, 
                    passedCount: entryConditions.length, 
                    totalConditions: entryConditions.length, 
                    failedConditions: [], 
                    skipReason: `HTF alignment: ${htfMismatchReason}` 
                  });
                  continue;
                }
                
                logger.forSymbol(symbol).info(
                  `${LOG_CATEGORIES.SUCCESS} STRATEGY_HTF_ALIGNMENT: "${strategy.name}" passed - 1h=${htf1hTrend}, 4h=${htf4hTrend}, momentum=${currentMomentumScore}, ADX=${adx.toFixed(1)}`
                );
              }
              
              // ============= IMPROVEMENT 4: STRATEGY-SPECIFIC CONSTRAINTS =============
              // EMA Death Cross needs context-awareness to prevent signals in inappropriate conditions
              const fakeBreakoutRisk = trendData.momentum?.fakeBreakoutRisk ?? false;
              
              // PHASE 2 FIX: Track %B bypass multiplier at strategy level to carry through to position sizing
              let strategyPercentBBypassMultiplier = 1.0;
              
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
                
                // %B requirement with strong trend exception AND ADX rising bypass
                // PHASE 2: ADX Rising %B Bypass - when ADX is rising, extended %B is continuation
                const slopeForBypassDeath = ADX_RISING_PERCENT_B_BYPASS.USE_SMOOTHED_SLOPE 
                  ? (fullAdxResult?.adxSlopeSmoothed ?? fullAdxResult?.adxSlope ?? 0)
                  : (fullAdxResult?.adxSlope ?? 0);
                
                const adxRisingBypassPercentBDeath = 
                  ADX_RISING_PERCENT_B_BYPASS.ENABLED &&
                  slopeForBypassDeath >= ADX_RISING_PERCENT_B_BYPASS.MIN_SLOPE &&
                  adx >= ADX_RISING_PERCENT_B_BYPASS.MIN_ADX &&
                  percentB >= ADX_RISING_PERCENT_B_BYPASS.MIN_PERCENT_B_FLOOR;
                
                let deathCrossPercentBBypassActive = false;
                let deathCrossPercentBBypassMultiplier = 1.0;
                
                if (percentB < effectiveMinPercentB) {
                  if (adxRisingBypassPercentBDeath) {
                    // STRUCTURED OVERRIDE LOG: OVERRIDE_REASON=ADX_RISING_EXTENSION
                    logger.forSymbol(symbol).info(
                      `${LOG_CATEGORIES.SUCCESS} "${strategy.name}": OVERRIDE_REASON=ADX_RISING_EXTENSION | ` +
                      `%B=${percentB.toFixed(1)} bypassed (<${effectiveMinPercentB}, >${ADX_RISING_PERCENT_B_BYPASS.MIN_PERCENT_B_FLOOR}) | ` +
                      `ADX=${adx.toFixed(1)}, slope_smoothed=${slopeForBypassDeath.toFixed(3)}`
                    );
                    deathCrossPercentBBypassActive = true;
                    deathCrossPercentBBypassMultiplier = ADX_RISING_PERCENT_B_BYPASS.POSITION_SIZE_MULTIPLIER;
                  } else {
                    rejectedByStrategy++;
                    logger.forSymbol(symbol).warn(
                      `"${strategy.name}": IMPROVEMENT 4 BLOCK - %B ${percentB.toFixed(1)} < ${effectiveMinPercentB}` +
                      `${isStrongTrendMode ? ' (strong trend mode)' : ''} | ` +
                      `bypass_failed: slope=${slopeForBypassDeath.toFixed(3)} (need>=${ADX_RISING_PERCENT_B_BYPASS.MIN_SLOPE}), adx=${adx.toFixed(1)} (need>=${ADX_RISING_PERCENT_B_BYPASS.MIN_ADX})`
                    );
                    continue;
                  }
                }
                
                // Fake breakout risk block
                if (constraints.BLOCK_ON_FAKE_BREAKOUT && fakeBreakoutRisk) {
                  rejectedByStrategy++;
                  logger.forSymbol(symbol).warn(`"${strategy.name}": IMPROVEMENT 4 BLOCK - fakeBreakoutRisk=true`);
                  continue;
                }
                
                const modeLabel = isStrongTrendMode ? ' [STRONG TREND MODE]' : '';
                const adxRelaxLabel = useReducedAdx ? ' [ADX RELAXED - 1h conf]' : '';
                const bypassLabel = deathCrossPercentBBypassActive ? ' [%B BYPASS - ADX RISING]' : '';
                logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} "${strategy.name}": IMPROVEMENT 4 constraints passed${modeLabel}${adxRelaxLabel}${bypassLabel} (ADX=${adx.toFixed(1)}, K=${stochRsiK4h.toFixed(1)}, %B=${percentB.toFixed(1)}, falling=${stochRsiFalling})`);
                
                // PHASE 2 FIX: Carry bypass multiplier to candidate for position sizing
                if (deathCrossPercentBBypassActive && deathCrossPercentBBypassMultiplier < 1.0) {
                  strategyPercentBBypassMultiplier = deathCrossPercentBBypassMultiplier;
                }
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
                
                // %B requirement with strong trend exception AND ADX rising bypass
                // PHASE 2: ADX Rising %B Bypass - when ADX is rising, extended %B is continuation
                const slopeForBypass = ADX_RISING_PERCENT_B_BYPASS.USE_SMOOTHED_SLOPE 
                  ? (fullAdxResult?.adxSlopeSmoothed ?? fullAdxResult?.adxSlope ?? 0)
                  : (fullAdxResult?.adxSlope ?? 0);
                
                const adxRisingBypassPercentB = 
                  ADX_RISING_PERCENT_B_BYPASS.ENABLED &&
                  slopeForBypass >= ADX_RISING_PERCENT_B_BYPASS.MIN_SLOPE &&
                  adx >= ADX_RISING_PERCENT_B_BYPASS.MIN_ADX &&
                  percentB <= ADX_RISING_PERCENT_B_BYPASS.MAX_PERCENT_B_CAP;
                
                let goldenCrossPercentBBypassActive = false;
                let goldenCrossPercentBBypassMultiplier = 1.0;
                
                if (percentB > effectiveMaxPercentB) {
                  if (adxRisingBypassPercentB) {
                    // STRUCTURED OVERRIDE LOG: OVERRIDE_REASON=ADX_RISING_EXTENSION
                    logger.forSymbol(symbol).info(
                      `${LOG_CATEGORIES.SUCCESS} "${strategy.name}": OVERRIDE_REASON=ADX_RISING_EXTENSION | ` +
                      `%B=${percentB.toFixed(1)} bypassed (>${effectiveMaxPercentB}, <${ADX_RISING_PERCENT_B_BYPASS.MAX_PERCENT_B_CAP}) | ` +
                      `ADX=${adx.toFixed(1)}, slope_smoothed=${slopeForBypass.toFixed(3)}`
                    );
                    goldenCrossPercentBBypassActive = true;
                    goldenCrossPercentBBypassMultiplier = ADX_RISING_PERCENT_B_BYPASS.POSITION_SIZE_MULTIPLIER;
                  } else {
                    rejectedByStrategy++;
                    logger.forSymbol(symbol).warn(
                      `"${strategy.name}": IMPROVEMENT 4 BLOCK - %B ${percentB.toFixed(1)} > ${effectiveMaxPercentB}` +
                      `${isStrongTrendMode ? ' (strong trend mode)' : ''} | ` +
                      `bypass_failed: slope=${slopeForBypass.toFixed(3)} (need>=${ADX_RISING_PERCENT_B_BYPASS.MIN_SLOPE}), adx=${adx.toFixed(1)} (need>=${ADX_RISING_PERCENT_B_BYPASS.MIN_ADX})`
                    );
                    continue;
                  }
                }
                
                // Fake breakout risk block
                if (constraints.BLOCK_ON_FAKE_BREAKOUT && fakeBreakoutRisk) {
                  rejectedByStrategy++;
                  logger.forSymbol(symbol).warn(`"${strategy.name}": IMPROVEMENT 4 BLOCK - fakeBreakoutRisk=true`);
                  continue;
                }
                
                const modeLabel = isStrongTrendMode ? ' [STRONG TREND MODE]' : '';
                const adxRelaxLabel = useReducedAdx ? ' [ADX RELAXED - 1h conf]' : '';
                const bypassLabel = goldenCrossPercentBBypassActive ? ' [%B BYPASS - ADX RISING]' : '';
                logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} "${strategy.name}": IMPROVEMENT 4 constraints passed${modeLabel}${adxRelaxLabel}${bypassLabel} (ADX=${adx.toFixed(1)}, K=${stochRsiK4h.toFixed(1)}, %B=${percentB.toFixed(1)}, rising=${stochRsiRising})`);
                
                // PHASE 2 FIX: Carry bypass multiplier to candidate for position sizing
                if (goldenCrossPercentBBypassActive && goldenCrossPercentBBypassMultiplier < 1.0) {
                  strategyPercentBBypassMultiplier = goldenCrossPercentBBypassMultiplier;
                }
              }
              
              if (isMomentumType && !is4hDirectional) {
                // 4h is neutral - check if we can allow via 1h directional + momentum building
                const is1hDirectional = htfTrend1h === "bullish" || htfTrend1h === "bearish";
                const conf1h = trendData.timeframes?.['1h']?.confidence || 0;
                const is1hConfident = conf1h >= 60;
                const is1hVeryConfident = conf1h >= 62;  // PHASE 1 FIX: Lowered from 70 - 62%+ 1h conf is already directional
                const isMomentumBuilding = earlyMomentumScore >= MOMENTUM_THRESHOLDS.MIN_SCORE;
                const momentumState = momentum?.state || "unknown";
                
                // IMPROVEMENT 1: Allow "mixed" momentum state when 1h confidence is solid (>=62%)
                // The strong 1h trend itself is the signal - we don't need momentum state confirmation
                const isMomentumStateGood = momentumState === "confirmed" || momentumState === "building" || 
                  (momentumState === "mixed" && is1hVeryConfident);
                
                // Allow if: 1h is directional with >= 60% confidence AND momentum score >= threshold
                const allowMomentumEntry = is1hDirectional && is1hConfident && isMomentumBuilding && isMomentumStateGood;
                
                if (allowMomentumEntry) {
                  const mixedOverride = momentumState === "mixed" ? " [MIXED STATE OVERRIDE - 1h conf >= 62%]" : "";
                  logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} "${strategy.name}" [${strategyType}]: MOMENTUM ALLOWED - 4h neutral but 1h ${htfTrend1h} (${conf1h}%), momentum ${momentumState} (score=${earlyMomentumScore})${mixedOverride}`);
                  // Continue with strategy evaluation - don't skip
                } else {
                  const skipReason = !is1hDirectional ? `1h neutral` : 
                    !is1hConfident ? `1h conf ${conf1h}% < 60%` :
                    !isMomentumBuilding ? `momentum score ${earlyMomentumScore} < ${MOMENTUM_THRESHOLDS.MIN_SCORE}` :
                    `momentum state ${momentumState} (need confirmed/building, or mixed with 1h conf >= 62%)`;
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
                // PHASE 2 FIX: Carry %B bypass multiplier through to position sizing
                percentBBypassMultiplier: strategyPercentBBypassMultiplier < 1.0 ? strategyPercentBBypassMultiplier : undefined,
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
          
          // PHASE 3 FIX: Allow dominant direction with HTF alignment, not just strict consensus
          const longCount = passedConditionsButFiltered.filter(s => s.direction === 'long').length;
          const shortCount = passedConditionsButFiltered.filter(s => s.direction === 'short').length;
          const isDirectionConsensus = longCount === 0 || shortCount === 0;
          
          // NEW: Allow if one direction has clear majority (2:1 or better) AND HTF aligns
          const htfAlignment = (htfTrend4h === 'bullish' && longCount > shortCount) || 
                              (htfTrend4h === 'bearish' && shortCount > longCount);
          const directionDominance = Math.max(longCount, shortCount) >= Math.min(longCount, shortCount) * 2;
          const canUseConvergenceWithDominance = 
            !isDirectionConsensus && directionDominance && htfAlignment &&
            Math.max(longCount, shortCount) >= CONVERGENCE_MIN_STRATEGIES;
          
          const consensusDirection = isDirectionConsensus 
            ? passedConditionsButFiltered[0].direction
            : (longCount > shortCount ? 'long' : 'short');
          
          const canUseConvergence = 
            qualityScore >= CONVERGENCE_MIN_QUALITY &&
            conf1h >= CONVERGENCE_MIN_1H_CONF &&
            reversalResult.score < CONVERGENCE_MAX_REVERSAL &&
            (isDirectionConsensus || canUseConvergenceWithDominance);
          
          if (canUseConvergence) {
            // Create a convergence candidate
            const convergenceLabel = isDirectionConsensus ? 'Consensus' : 'Dominant Direction';
            const convergenceStrategy = {
              id: 'convergence-entry',
              name: `Multi-Strategy ${convergenceLabel} (${passedConditionsButFiltered.map(s => s.name).join(' + ')})`,
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
            
            // Use reduced position size if using dominance mode (not full consensus)
            const positionMult = isDirectionConsensus ? CONVERGENCE_POSITION_MULT : CONVERGENCE_POSITION_MULT * 0.80;
            
            candidates.push({
              strategy: convergenceStrategy,
              score: qualityScore,
              indicatorValues: convergenceIndicators,
              signalType: consensusDirection,
              positionSizeMultiplier: positionMult,
              convergenceEntry: true
            });
            
            const dominanceNote = !isDirectionConsensus ? ` [DOMINANCE MODE: ${longCount}L/${shortCount}S + 4h=${htfTrend4h}]` : '';
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} CONVERGENCE ENTRY: ${passedConditionsButFiltered.length} strategies (${passedConditionsButFiltered.map(s => s.name).join(', ')}), direction=${consensusDirection}, quality=${qualityScore}, 1h conf=${conf1h}%${dominanceNote}`);
          } else {
            const blockReason = qualityScore < CONVERGENCE_MIN_QUALITY ? `quality ${qualityScore} < ${CONVERGENCE_MIN_QUALITY}` :
              conf1h < CONVERGENCE_MIN_1H_CONF ? `1h conf ${conf1h}% < ${CONVERGENCE_MIN_1H_CONF}%` :
              reversalResult.score >= CONVERGENCE_MAX_REVERSAL ? `reversal ${reversalResult.score} >= ${CONVERGENCE_MAX_REVERSAL}` :
              `no direction consensus (${longCount}L/${shortCount}S, 4h=${htfTrend4h}, dominance=${directionDominance}, htfAlign=${htfAlignment})`;
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
        
        // ============= PHASE 2: NEAR-QUALITY FALLBACK ENTRY =============
        // When quality is close (60-69), HTF is directional, ADX confirms trend
        // This captures setups that narrowly miss the quality threshold
        const NEAR_QUALITY_MIN = 60;
        const NEAR_QUALITY_MAX = 69;  // Below regular fallback
        const NEAR_QUALITY_MIN_ADX = 20;  // Need confirmed trend
        const NEAR_QUALITY_MIN_HTF_CONF = 60;
        const NEAR_QUALITY_MAX_REVERSAL = 35;  // Stricter than regular fallback
        const NEAR_QUALITY_POSITION_MULT = 0.30;  // Much smaller position
        
        if (candidates.length === 0) {
          const conf4h = stochFilterConf4h || 0;
          const conf1h = stochFilterConf1h || 0;
          const htf4hDir = htfTrend4h;
          const htf1hDir = htfTrend1h;
          const reversalScore = unifiedReversal.score;
          
          // Determine fallback direction from HTF
          let nearQualityDirection: "long" | "short" | null = null;
          if (htf4hDir === 'bullish' && conf4h >= NEAR_QUALITY_MIN_HTF_CONF) {
            nearQualityDirection = 'long';
          } else if (htf4hDir === 'bearish' && conf4h >= NEAR_QUALITY_MIN_HTF_CONF) {
            nearQualityDirection = 'short';
          } else if (htf1hDir === 'bullish' && conf1h >= 70) {
            nearQualityDirection = 'long';
          } else if (htf1hDir === 'bearish' && conf1h >= 70) {
            nearQualityDirection = 'short';
          }
          
          const canUseNearQualityFallback = 
            qualityScore >= NEAR_QUALITY_MIN &&
            qualityScore <= NEAR_QUALITY_MAX &&  // Between 60-69
            adx >= NEAR_QUALITY_MIN_ADX &&  // Confirmed trend
            nearQualityDirection !== null &&
            reversalScore < NEAR_QUALITY_MAX_REVERSAL;  // Stricter reversal check
          
          if (canUseNearQualityFallback && nearQualityDirection) {
            // Create near-quality fallback candidate
            const nearQualityStrategy = {
              id: 'near-quality-fallback',
              name: `Near-Quality Fallback (Q=${qualityScore}, ADX=${adx.toFixed(1)})`,
              risk_settings: {
                stopLossPercent: 1.8,  // Tighter stops
                takeProfitPercent: 3.0,
                positionSizePercent: 1,
                priority: 1
              }
            };
            
            const nearQualityIndicators = new Map<string, number>();
            nearQualityIndicators.set("Price", currentPrice);
            
            candidates.push({
              strategy: nearQualityStrategy,
              score: qualityScore,
              indicatorValues: nearQualityIndicators,
              signalType: nearQualityDirection,
              positionSizeMultiplier: NEAR_QUALITY_POSITION_MULT,
              convergenceEntry: false
            });
            
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} NEAR-QUALITY FALLBACK: quality=${qualityScore}, ADX=${adx.toFixed(1)}, direction=${nearQualityDirection}, reversal=${reversalScore}`);
            logger.forSymbol(symbol).info(`   → Position size reduced to ${NEAR_QUALITY_POSITION_MULT * 100}% for near-quality entry`);
          }
        }
        
        // ============= PHASE 3: ADAPTIVE TREND ENTRY - PRIMARY STRATEGY =============
        // PHASE 17: This is now the PRIMARY signal source after legacy strategies disabled
        // Uses comprehensive direction derivation with full gate protection
        // Position sizing based on quality score and market conditions
        
        // Adaptive thresholds - more permissive since all gates already passed
        const ADAPTIVE_MIN_QUALITY = 55;
        const ADAPTIVE_MIN_HTF_CONF = 55;
        const ADAPTIVE_MAX_REVERSAL = 45;
        
        // PHASE 17: Graduated position sizing based on quality (no longer conservative fallback)
        const getAdaptivePositionMultiplier = (quality: number, adxValue: number): number => {
          if (quality >= 75 && adxValue >= 30) return 0.85;  // High quality + strong trend
          if (quality >= 70) return 0.75;  // High quality
          if (quality >= 65) return 0.65;  // Good quality
          if (quality >= 60) return 0.55;  // Above average
          return 0.45;  // Baseline for Q55-59
        };
        
        if (candidates.length === 0 && qualityScore >= ADAPTIVE_MIN_QUALITY) {
          const conf4h = stochFilterConf4h || 0;
          const conf1h = stochFilterConf1h || 0;
          const htf4hDir = htfTrend4h;
          const htf1hDir = htfTrend1h;
          const reversalScore = unifiedReversal.score;
          
          // Use derivedDirection if available, otherwise derive from HTF
          let adaptiveDirection: "long" | "short" | null = null;
          
          if (derivedDirection === "long" || derivedDirection === "short") {
            adaptiveDirection = derivedDirection;
          } else if (htf4hDir === 'bullish' && conf4h >= ADAPTIVE_MIN_HTF_CONF) {
            adaptiveDirection = 'long';
          } else if (htf4hDir === 'bearish' && conf4h >= ADAPTIVE_MIN_HTF_CONF) {
            adaptiveDirection = 'short';
          } else if (htf1hDir === 'bullish' && conf1h >= 60) {
            adaptiveDirection = 'long';
          } else if (htf1hDir === 'bearish' && conf1h >= 60) {
            adaptiveDirection = 'short';
          }
          
          // Momentum check - require at least one momentum signal
          const hasMomentumEvidence = 
            momentum?.state === 'confirmed' || 
            momentum?.state === 'building' ||
            smartMomentum.score >= 10 ||
            (momentum?.macdExpanding === true && adx >= 18);
          
          const canUseAdaptive = 
            adaptiveDirection !== null &&
            hasMomentumEvidence &&
            reversalScore < ADAPTIVE_MAX_REVERSAL;
          
          if (canUseAdaptive && adaptiveDirection) {
            // PHASE 17: Calculate graduated position size based on quality
            const adaptivePositionMult = getAdaptivePositionMultiplier(qualityScore, adx);
            
            // Create adaptive trend entry candidate
            const adaptiveStrategy = {
              id: 'adaptive-trend-entry',
              name: 'Adaptive Trend Entry',  // Clean name without parameters
              risk_settings: {
                stopLossPercent: 2.0,
                takeProfitPercent: 3.5,
                positionSizePercent: 1,
                priority: 1  // Highest priority since it's now the primary strategy
              }
            };
            
            const adaptiveIndicators = new Map<string, number>();
            adaptiveIndicators.set("Price", currentPrice);
            
            candidates.push({
              strategy: adaptiveStrategy,
              score: qualityScore,
              indicatorValues: adaptiveIndicators,
              signalType: adaptiveDirection,
              positionSizeMultiplier: adaptivePositionMult,
              convergenceEntry: false
            });
            
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} 🎯 ADAPTIVE TREND ENTRY [PRIMARY]: Quality=${qualityScore}, Direction=${adaptiveDirection}`);
            logger.forSymbol(symbol).info(`   → Momentum: ${momentum?.state}/${smartMomentum.score}, ADX=${adx.toFixed(1)}`);
            logger.forSymbol(symbol).info(`   → HTF: 4h=${htf4hDir} (${conf4h}%), 1h=${htf1hDir} (${conf1h}%), Reversal=${reversalScore}`);
            logger.forSymbol(symbol).info(`   → Position size: ${(adaptivePositionMult * 100).toFixed(0)}% (quality-based sizing)`);
          } else {
            // Log why adaptive entry didn't apply for debugging
            const blockReasons: string[] = [];
            if (!adaptiveDirection) blockReasons.push('no direction');
            if (!hasMomentumEvidence) blockReasons.push(`no momentum (state=${momentum?.state}, smart=${smartMomentum.score})`);
            if (reversalScore >= ADAPTIVE_MAX_REVERSAL) blockReasons.push(`reversal=${reversalScore}>=${ADAPTIVE_MAX_REVERSAL}`);
            
            logger.forSymbol(symbol).debug(`${LOG_CATEGORIES.GATE} ADAPTIVE TREND ENTRY blocked: ${blockReasons.join(', ')}`);
          }
        }

        // ============= PHASE 16: HYBRID MODE FALLBACK =============
        // If no strategy candidates but we have a valid adaptive signal, use it as fallback
        if (candidates.length === 0 && ADAPTIVE_SIGNAL_MODE.MODE === 'HYBRID' && adaptiveSignalResult) {
          const adaptiveQuality = calculateAdaptiveQualityScore(adaptiveSignalResult.qualityFactors);
          
          if (adaptiveQuality.score >= ADAPTIVE_SIGNAL_MODE.HYBRID_MIN_QUALITY) {
            const entryLabel = getEntryTypeLabel(adaptiveSignalResult.entryType);
            const adaptiveStrategy = {
              id: `adaptive-${adaptiveSignalResult.entryType.toLowerCase()}`,
              name: `[HYBRID] ${entryLabel}`,
              risk_settings: {
                stopLossPercent: adaptiveSignalResult.stopLossPercent,
                takeProfitPercent: adaptiveSignalResult.takeProfitPercent,
                positionSizePercent: 1,
                priority: 5
              }
            };
            
            const adaptiveIndicators = new Map<string, number>();
            adaptiveIndicators.set("Price", parseFloat(marketDataMap.get(symbol)?.lastPrice || '0'));
            
            candidates.push({
              strategy: adaptiveStrategy,
              score: adaptiveQuality.score,
              indicatorValues: adaptiveIndicators,
              signalType: adaptiveSignalResult.direction,
              positionSizeMultiplier: adaptiveSignalResult.positionSizeMultiplier * ADAPTIVE_SIGNAL_MODE.HYBRID_POSITION_MULTIPLIER,
              convergenceEntry: false
            });
            
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} ADAPTIVE HYBRID FALLBACK: No strategy matched, using ${entryLabel} (quality=${adaptiveQuality.score}, dir=${adaptiveSignalResult.direction})`);
          } else {
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} ADAPTIVE HYBRID blocked: quality ${adaptiveQuality.score} < ${ADAPTIVE_SIGNAL_MODE.HYBRID_MIN_QUALITY}`);
          }
        }
        
        // ============= MEAN REVERSION SIGNAL GENERATION =============
        // Generate mean reversion signals when exhaustion is detected and conditions are met
        // This runs as an alternative/additional path to strategy-based signals
        if (MEAN_REVERSION_CONFIG.ENABLED && meanReversionSignal?.detected && meanReversionSignal.allowed) {
          // Check signal precedence - qualified trend signals (Q >= 70) take priority
          const trendSignalsForPrecedence = candidates.map(c => ({
            symbol,
            qualityScore: c.score,
            strategy_name: c.strategy.name
          }));
          
          const precedenceResult = checkSignalPrecedence(meanReversionSignal, trendSignalsForPrecedence);
          
          if (!precedenceResult.suppress) {
            // Mean reversion signal is allowed - add as candidate
            const mrDirection = meanReversionSignal.direction as 'long' | 'short';
            const mrConfig = mrDirection === 'long' ? MEAN_REVERSION_CONFIG.LONG : MEAN_REVERSION_CONFIG.SHORT;
            
            // Calculate stop loss and take profit using ATR-based approach
            const currentPrice = parseFloat(marketDataMap.get(symbol)?.lastPrice || '0');
            const currentATR = trendData?.volatility?.atr ?? (currentPrice * 0.02); // Fallback: 2% of price
            const atrPercent = (currentATR / currentPrice) * 100;
            
            // Mean reversion uses tighter stops (1.5 ATR) and tighter TP (1.5 ATR target)
            const mrStopLossPercent = Math.min(mrConfig.STOP_LOSS_PERCENT, atrPercent * 1.5);
            const mrTakeProfitPercent = Math.min(mrConfig.TAKE_PROFIT_PERCENT, atrPercent * 1.5);
            
            // Apply precedence reduction if needed
            let mrPositionMultiplier = meanReversionSignal.positionMultiplier;
            if (precedenceResult.reduceSize) {
              mrPositionMultiplier *= 0.5;
              logger.forSymbol(symbol).info(
                `${LOG_CATEGORIES.RISK} 🔄 MEAN_REVERSION size reduced 50%: ${precedenceResult.reason}`
              );
            }
            
            // Create mean reversion strategy object
            const mrStrategyName = mrDirection === 'long' 
              ? 'Mean Reversion Bounce' 
              : 'Mean Reversion Reversal';
              
            const mrStrategy = {
              id: `mean-reversion-${mrDirection}`,
              name: mrStrategyName,
              risk_settings: {
                stopLossPercent: mrStopLossPercent,
                takeProfitPercent: mrTakeProfitPercent,
                positionSizePercent: 1,
                priority: 8  // High priority for mean reversion signals
              }
            };
            
            const mrIndicators = new Map<string, number>();
            mrIndicators.set("Price", currentPrice);
            mrIndicators.set("StochRSI_K", trendData?.stochasticRsi?.['4h']?.k ?? 50);
            mrIndicators.set("PercentB", trendData?.bollingerBands?.['4h']?.percentB ?? 50);
            mrIndicators.set("ADX", trendData?.volatility?.adx ?? 20);
            mrIndicators.set("ExhaustionScore", meanReversionSignal.exhaustionScore);
            
            candidates.push({
              strategy: mrStrategy,
              score: meanReversionSignal.qualityScore,
              indicatorValues: mrIndicators,
              signalType: mrDirection,
              positionSizeMultiplier: mrPositionMultiplier,
              convergenceEntry: false
            });
            
            logger.forSymbol(symbol).info(
              `${LOG_CATEGORIES.SUCCESS} 🔄 MEAN_REVERSION SIGNAL: ${mrDirection.toUpperCase()} | ` +
              `Quality: ${meanReversionSignal.qualityScore.toFixed(0)} | ` +
              `Confidence: ${meanReversionSignal.confidence.toFixed(0)}% | ` +
              `Position: ${(mrPositionMultiplier * 100).toFixed(0)}% | ` +
              `SL: ${mrStopLossPercent.toFixed(2)}% | TP: ${mrTakeProfitPercent.toFixed(2)}%`
            );
            logger.forSymbol(symbol).info(
              `   → Regime: ${meanReversionSignal.trendPhase}/${meanReversionSignal.expansionState} | ` +
              `Triggers: ${meanReversionSignal.triggers.slice(0, 3).join(', ')}`
            );
          } else {
            logger.forSymbol(symbol).info(
              `${LOG_CATEGORIES.GATE} 🔄 MEAN_REVERSION SUPPRESSED: ${precedenceResult.reason}`
            );
          }
        }
        
        // ============= SHADOW MODE COMPARISON =============
        // Compare adaptive signal vs selected strategy for analytics
        if (ADAPTIVE_SIGNAL_MODE.MODE === 'SHADOW' && adaptiveSignalResult && candidates.length > 0 && ADAPTIVE_SIGNAL_MODE.LOG_COMPARISON_RESULTS) {
          const strategyCandidate = candidates[0];
          const directionMatch = adaptiveSignalResult.direction === strategyCandidate.signalType;
          const qualityDelta = (calculateAdaptiveQualityScore(adaptiveSignalResult.qualityFactors).score) - strategyCandidate.score;
          
          logger.forSymbol(symbol).info(
            `📊 SHADOW COMPARISON: ` +
            `Strategy=${strategyCandidate.strategy.name}(${strategyCandidate.signalType}) vs ` +
            `Adaptive=${adaptiveSignalResult.entryType}(${adaptiveSignalResult.direction}) | ` +
            `Direction: ${directionMatch ? '✅ MATCH' : '❌ MISMATCH'} | ` +
            `Quality Delta: ${qualityDelta > 0 ? '+' : ''}${qualityDelta.toFixed(1)}`
          );
        }
        
        if (candidates.length === 0) {
          rejectedByStrategy++;
          const convergenceNote = passedConditionsButFiltered.length >= CONVERGENCE_MIN_STRATEGIES 
            ? ` (${passedConditionsButFiltered.length} passed conditions but failed convergence check)` 
            : '';
          const adaptiveNote = adaptiveSignalResult 
            ? ` | Adaptive would signal: ${adaptiveSignalResult.direction} (${adaptiveSignalResult.entryType})` 
            : '';
          perSymbolGateAttribution.set(symbol, { gate: 'NO_STRATEGY_MATCH', details: `0/${allStrategies.length} conditions met${convergenceNote}${adaptiveNote}` });
          
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
              derivedDirection,
              direction: derivedDirection,
              qualityScore, breakdown,
              strategiesEvaluated: allStrategies.length,
              regime: regime.regime,
              passedConditionsButFiltered: passedConditionsButFiltered.length > 0 ? passedConditionsButFiltered : undefined,
              // NEW: Near-miss diagnostics for debugging
              strategyNearMisses: topNearMisses.length > 0 ? topNearMisses : undefined,
              // NEW: Adaptive signal that would have been generated
              adaptiveSignal: adaptiveSignalResult ? {
                direction: adaptiveSignalResult.direction,
                entryType: adaptiveSignalResult.entryType,
                confidence: adaptiveSignalResult.confidence,
                reason: adaptiveSignalResult.reason
              } : null,
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
            { 
              gate: "NO_STRATEGY_MATCH_REGIME_FILTER",
              derivedDirection,
              direction: derivedDirection,
              regime: currentRegimeType, 
              strategiesFiltered: candidates.map(c => c.strategy.name) 
            },
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
        
        // ============= PHASE 3: GRADUATED CONFIDENCE THRESHOLD =============
        // Graduated system: hard block below 55%, soft gates above with position reduction
        // ADX-based relaxation: very strong trends confirm direction independently
        const baseConfidenceThreshold = riskParams.min_confidence_threshold ?? 60;
        const htfBypassConfidenceRelaxation = strongTrendHTFBypassApplied ? 5 : 0;
        
        // NEW: ADX-based confidence relaxation - very strong trends confirm direction
        const adxBasedConfidenceRelaxation = adx >= 50 ? 10 : adx >= 40 ? 5 : 0;
        const effectiveConfidenceRelaxation = Math.max(htfBypassConfidenceRelaxation, adxBasedConfidenceRelaxation);
        
        const minConfidenceThreshold = baseConfidenceThreshold - effectiveConfidenceRelaxation;
        const hardBlockThreshold = 55; // Never allow below 55%
        
        let confidencePositionReduction = 0;
        
        if (confidence < hardBlockThreshold) {
          // HARD BLOCK: Below 55% is never allowed
          rejectedByHardGates++;
          perSymbolGateAttribution.set(symbol, { gate: 'CONFIDENCE_BELOW_THRESHOLD', details: `${confidence}% < ${hardBlockThreshold}% (hard minimum)` });
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} HARD BLOCK - Confidence ${confidence}% below hard minimum ${hardBlockThreshold}%`);
          await logRejectionWithAI(
            supabase, userId, symbol,
            `HARD BLOCK: Confidence ${confidence}% < ${hardBlockThreshold}% hard minimum - "${strategy.name}" blocked`,
            { 
              gate: "CONFIDENCE_BELOW_HARD_MINIMUM",
              confidence,
              threshold: hardBlockThreshold,
              strategyName: strategy.name,
              signalType,
              qualityScore: best.score,
              message: "Signal confidence below hard minimum (55%) - too unreliable for any entry"
            },
            trendData,
            riskParams.ai_analysis_enabled !== false,
            earlyOrderFlowAnalysis
          );
          continue;
        } else if (confidence < 60) {
          // SOFT GATE: 55-60% → Allow with 30% position reduction
          confidencePositionReduction = 30;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} GRADUATED CONFIDENCE: ${confidence}% in 55-60 zone → -30% position (ADX=${adx.toFixed(1)}, relaxation=${effectiveConfidenceRelaxation}%)`);
        } else if (confidence < minConfidenceThreshold) {
          // SOFT GATE: 60-threshold → Allow with 15% position reduction
          confidencePositionReduction = 15;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} GRADUATED CONFIDENCE: ${confidence}% in 60-${minConfidenceThreshold} zone → -15% position (ADX=${adx.toFixed(1)}, relaxation=${effectiveConfidenceRelaxation}%)`);
        }
        
        // Apply confidence-based position reduction to reversal multiplier
        if (confidencePositionReduction > 0) {
          const confidenceMultiplier = (100 - confidencePositionReduction) / 100;
          reversalPositionMultiplier = Math.min(reversalPositionMultiplier, confidenceMultiplier);
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK} Confidence position reduction applied: ${confidencePositionReduction}% → multiplier=${confidenceMultiplier.toFixed(2)}`);
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
        
        // Step 10b: Apply consecutive candle momentum position reduction (65%)
        if (consecutiveCandlePositionMultiplier < 1.0) {
          positionSizeMultiplier *= consecutiveCandlePositionMultiplier;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK} Consecutive candle momentum entry - position size reduced to ${(positionSizeMultiplier * 100).toFixed(0)}%`);
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
        
        // Step 13: Apply tiered parabolic bypass position reduction
        // Entering at K>=98 or K<=2 is risky even in strong trends - position size scales with tier
        if (parabolicBypassApplied && tieredPositionSizePercent < 100) {
          const tieredMultiplier = tieredPositionSizePercent / 100;
          positionSizeMultiplier *= tieredMultiplier;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK} 🚀 TIERED BYPASS [${bypassTier.toUpperCase()}] entry - position size reduced to ${(positionSizeMultiplier * 100).toFixed(0)}% (extreme StochRSI)`);
        }
        
        // Step 14: Apply Bollinger tiered bypass position reduction
        // Entering at high %B (90-97) for LONG or low %B (3-10) for SHORT requires reduced position size
        if (bollingerBypassApplied && bollingerBypassPositionMultiplier < 1.0) {
          positionSizeMultiplier *= bollingerBypassPositionMultiplier;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK} 🎯 BOLLINGER BYPASS [${bollingerBypassTier.toUpperCase()}] LONG entry - position size reduced to ${(positionSizeMultiplier * 100).toFixed(0)}% (high %B)`);
        }
        
        // Step 14b: Apply Bollinger tiered bypass position reduction for SHORT
        // Entering at low %B (3-10) requires reduced position size even with bypass
        if (bollingerBypassAppliedShort && bollingerBypassPositionMultiplierShort < 1.0) {
          positionSizeMultiplier *= bollingerBypassPositionMultiplierShort;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK} 🎯 BOLLINGER BYPASS [${bollingerBypassTierShort.toUpperCase()}] SHORT entry - position size reduced to ${(positionSizeMultiplier * 100).toFixed(0)}% (low %B)`);
        }
        
        // Step 15: Apply Strong ADX Override position reduction (65% when ADX > 45)
        // Entries via Strong ADX Override with high ADX get reduced position size
        if (strongAdxOverrideApplied && strongAdxPositionMultiplier < 1.0) {
          positionSizeMultiplier *= strongAdxPositionMultiplier;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK} ✓ STRONG ADX OVERRIDE entry (ADX > ${STRONG_ADX_OVERRIDE_PARAMS.EXHAUSTION_ADX}) - position size reduced to ${(positionSizeMultiplier * 100).toFixed(0)}%`);
        }
        
        // Step 16: Apply Momentum Exhaustion Override position reduction (60-70%)
        // Entries via momentum override in exhausted regime get reduced position and tighter stops
        if (momentumExhaustionOverrideApplied && momentumExhaustionPositionMultiplier < 1.0) {
          positionSizeMultiplier *= momentumExhaustionPositionMultiplier;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK} ⚡ MOMENTUM EXHAUSTION OVERRIDE entry - position size reduced to ${(positionSizeMultiplier * 100).toFixed(0)}%`);
        }
        
        // Step 17: Apply Late Grind Acceptance position reduction (40-50%)
        // Entries via late grind acceptance get reduced position and tighter stops
        if (lateGrindAccepted && lateGrindPositionMultiplier < 1.0) {
          positionSizeMultiplier *= lateGrindPositionMultiplier;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK} 🐌 LATE GRIND ACCEPTANCE entry - position size reduced to ${(positionSizeMultiplier * 100).toFixed(0)}%`);
        }
        
        // Step 18: Apply Momentum/Order Flow Direction Override position reduction (55-70%)
        // Entries derived from momentum or order flow when trends are neutral get reduced position
        if (overridePositionMultiplier < 1.0) {
          positionSizeMultiplier *= overridePositionMultiplier;
          const overrideType = momentumDirectionOverrideApplied ? "MOMENTUM DIRECTION" : "ORDER FLOW DIRECTION";
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK} 🎯 ${overrideType} OVERRIDE entry - position size reduced to ${(positionSizeMultiplier * 100).toFixed(0)}%`);
        }
        
        // Step 19: Apply Price Action Early Entry position reduction (50%)
        // PHASE 2 FIX: Entries via price action early entry (ADX 12-18) get reduced position
        if (priceActionEarlyEntryActive && priceActionEarlyPositionMultiplier < 1.0) {
          positionSizeMultiplier *= priceActionEarlyPositionMultiplier;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK} 📈 PRICE ACTION EARLY ENTRY - position size reduced to ${(positionSizeMultiplier * 100).toFixed(0)}%`);
        }
        
        // Step 20: Apply ADX Rising %B Bypass position reduction (70%)
        // PHASE 2 FIX: Entries via %B bypass (ADX rising, extended %B) get reduced position
        const candidatePercentBBypassMultiplier = best.percentBBypassMultiplier ?? 1.0;
        if (candidatePercentBBypassMultiplier < 1.0) {
          positionSizeMultiplier *= candidatePercentBBypassMultiplier;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK} 📊 ADX RISING %B BYPASS entry - position size reduced to ${(positionSizeMultiplier * 100).toFixed(0)}%`);
        }
        
        // Step 21: Apply convergence entry position reduction (if applicable)
        const candidateConvergenceMultiplier = best.positionSizeMultiplier ?? 1.0;
        if (candidateConvergenceMultiplier < 1.0) {
          positionSizeMultiplier *= candidateConvergenceMultiplier;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK} 🔀 CONVERGENCE ENTRY - position size reduced to ${(positionSizeMultiplier * 100).toFixed(0)}%`);
        }
        
        // Step 22: Apply MASTER REGIME position multiplier (PARABOLIC/STRONG_TREND get reduced size for safety)
        if (isRegimeOverrideActive && regimePositionMultiplier < 1.0) {
          positionSizeMultiplier *= regimePositionMultiplier;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK} 🎯 MASTER REGIME (${masterRegime.regime}) - position size capped at ${(positionSizeMultiplier * 100).toFixed(0)}%`);
        }
        
        // Step 22b: Apply 4-STATE REGIME position multiplier (BREAKOUT_SETUP=50%, TREND_EXHAUSTION=25%)
        if (fourStatePositionMultiplier < 1.0) {
          positionSizeMultiplier *= fourStatePositionMultiplier;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK} 🏷️ 4-STATE REGIME (${fourStateRegime.regime}) - position size reduced to ${(positionSizeMultiplier * 100).toFixed(0)}%`);
        }
        
        // Step 23: Apply Strong Trend Tier 0 Override position reduction (25%)
        // Entries at extreme StochRSI (K<5 or K>95) via Strong Trend Override get heavily reduced position
        if (strongTrendTier0OverrideApplied && strongTrendTier0PositionMultiplier < 1.0) {
          positionSizeMultiplier *= strongTrendTier0PositionMultiplier;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK} 🚀 STRONG TREND TIER 0 OVERRIDE entry - position size reduced to ${(positionSizeMultiplier * 100).toFixed(0)}% (late entry at extreme StochRSI)`);
        }
        
        // ============= UNIFIED RISK CALCULATION (NEW) =============
        // Use user-configured base values from risk_parameters instead of legacy strategy templates
        // The system applies intelligent adjustments based on market conditions
        
        // Get base values from unified settings (fallback to legacy values if not set)
        const basePositionSize = riskParams.base_position_size_percent ?? 1.5;
        const baseStopLoss = riskParams.base_stop_loss_percent ?? 2.0;
        const baseTpMultiplier = riskParams.base_take_profit_multiplier ?? 2.5;
        const riskProfile = riskParams.risk_profile ?? 'balanced';
        const enableAtrStops = riskParams.enable_atr_based_stops ?? true;
        const enableAdxScaling = riskParams.enable_adx_position_scaling ?? true;
        const enableQualityScaling = riskParams.enable_quality_based_sizing ?? true;
        
        // Risk profile multipliers
        const profileMultipliers: Record<string, { size: number; sl: number }> = {
          conservative: { size: 0.7, sl: 0.8 },
          balanced: { size: 1.0, sl: 1.0 },
          aggressive: { size: 1.3, sl: 1.2 }
        };
        const profileMult = profileMultipliers[riskProfile] || profileMultipliers.balanced;
        
        // Start with base position size adjusted by risk profile
        let unifiedPositionSize = basePositionSize * profileMult.size;
        
        // Apply cumulative position size multiplier from gates/overrides
        unifiedPositionSize *= positionSizeMultiplier;
        
        // ADX-based position scaling (optional)
        if (enableAdxScaling) {
          const adxValue = trendData?.volatility?.adx || 0;
          if (adxValue >= 35) {
            unifiedPositionSize *= 0.85; // Late in trend, reduce
          } else if (adxValue >= 25) {
            unifiedPositionSize *= 1.0; // Sweet spot
          } else if (adxValue < 18) {
            unifiedPositionSize *= 0.6; // Weak trend, cautious
          }
        }
        
        // Quality-based sizing (optional)
        if (enableQualityScaling) {
          if (qualityScore >= 80) {
            unifiedPositionSize *= 1.15; // High quality bonus
          } else if (qualityScore < 60) {
            unifiedPositionSize *= 0.7; // Low quality penalty
          }
        }
        
        // Cap position size
        unifiedPositionSize = Math.max(0.2, Math.min(5.0, unifiedPositionSize));
        
        const strategyPositionSize = unifiedPositionSize;
        
        // Calculate stop loss with risk profile adjustment
        let stopLossPercent = baseStopLoss * profileMult.sl;
        
        // ATR-based dynamic stops (optional)
        if (enableAtrStops) {
          const atr = trendData?.volatility?.atr || 0;
          if (atr > 0 && currentPrice > 0) {
            const atrPercent = (atr / currentPrice) * 100;
            const atrBasedStop = atrPercent * 2.0;
            // Blend with base stop
            stopLossPercent = (stopLossPercent + atrBasedStop) / 2;
            // Cap at reasonable limits
            stopLossPercent = Math.max(1.0, Math.min(5.0, stopLossPercent));
          }
        }
        
        // Apply tighter stops for momentum exhaustion override entries (70% of normal = 30% tighter)
        if (momentumExhaustionOverrideApplied && momentumExhaustionStopMultiplier < 1.0) {
          stopLossPercent *= momentumExhaustionStopMultiplier;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK} ⚡ MOMENTUM EXHAUSTION OVERRIDE - tighter stop applied: ${stopLossPercent.toFixed(2)}%`);
        }
        
        // Apply position reduction for move exhaustion (soft gate entries at 35%)
        if (moveExhaustionPositionMultiplier < 1.0) {
          positionSizeMultiplier *= moveExhaustionPositionMultiplier;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK} ⛔ MOVE EXHAUSTION entry - position size reduced to ${(positionSizeMultiplier * 100).toFixed(0)}%`);
        }
        
        // Apply position reduction for LTF Confirmation Gate (when 1h/30m neutral with 4h directional)
        if (ltfConfirmationPositionMultiplier < 1.0) {
          positionSizeMultiplier *= ltfConfirmationPositionMultiplier;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK} 🔻 LTF CONFIRMATION - position size reduced to ${(positionSizeMultiplier * 100).toFixed(0)}% (lower timeframes not aligned)`);
        }
        
        // Apply position reduction for Near-Extreme Protection (shorts near 24h low, longs near 24h high)
        if (nearExtremePositionMultiplier < 1.0) {
          positionSizeMultiplier *= nearExtremePositionMultiplier;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK} ⚠️ NEAR 24H EXTREME - position size reduced to ${(positionSizeMultiplier * 100).toFixed(0)}% (near price extreme)`);
        }
        
        // ===== NEW: BE ANALYSIS GATES =====
        // Apply ADX slope graduated gate multiplier (BE trade prevention)
        if (adxSlopeGraduatedMultiplier < 1.0) {
          positionSizeMultiplier *= adxSlopeGraduatedMultiplier;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK} ⚠️ ADX SLOPE GRADUATED - position size reduced to ${(positionSizeMultiplier * 100).toFixed(0)}% (declining trend energy)`);
        }
        
        // Apply high ADX 1h confirmation gate multiplier
        if (highAdx1hConfirmationMultiplier < 1.0) {
          positionSizeMultiplier *= highAdx1hConfirmationMultiplier;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK} ⚠️ HIGH_ADX_1H - position size reduced to ${(positionSizeMultiplier * 100).toFixed(0)}% (1h not confirming high ADX)`);
        }
        
        // Apply StochRSI runway gate multiplier
        if (stochRsiRunwayMultiplier < 1.0) {
          positionSizeMultiplier *= stochRsiRunwayMultiplier;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK} ⚠️ STOCHRSI RUNWAY - position size reduced to ${(positionSizeMultiplier * 100).toFixed(0)}% (limited directional runway)`);
        }
        
        // ===== TRIPLE STACK MONITORING (BE Prevention Analysis) =====
        // Log when multiple BE gates stack to create very small positions (<15%)
        // This helps identify if these probe trades add value or should be skipped
        const beGatesApplied = [
          adxSlopeGraduatedMultiplier < 1.0 ? `ADX_SLOPE(${(adxSlopeGraduatedMultiplier * 100).toFixed(0)}%)` : null,
          highAdx1hConfirmationMultiplier < 1.0 ? `HIGH_ADX_1H(${(highAdx1hConfirmationMultiplier * 100).toFixed(0)}%)` : null,
          stochRsiRunwayMultiplier < 1.0 ? `STOCHRSI_RUNWAY(${(stochRsiRunwayMultiplier * 100).toFixed(0)}%)` : null,
        ].filter(Boolean);
        
        if (positionSizeMultiplier < 0.15 && beGatesApplied.length >= 2) {
          const tf1hDir = trendData.timeframes?.['1h']?.direction || 'N/A';
          const tf30mDir = trendData.timeframes?.['30m']?.direction || 'N/A';
          logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.RISK} 🛡️ TRIPLE STACK REDUCTION: Final multiplier ${(positionSizeMultiplier * 100).toFixed(1)}% - effectively a probe trade. Gates: ${beGatesApplied.join(' × ')}. ADX=${trendData.adx?.toFixed(1)}, Slope=${trendData.adxSlope?.toFixed(2)}, StochK=${trendData.stochrsiK?.toFixed(0)}, 1h=${tf1hDir}, 30m=${tf30mDir}`);
        }
        
        // Apply tighter stops for late grind acceptance entries (50% of normal = 50% tighter)
        if (lateGrindAccepted && lateGrindStopMultiplier < 1.0) {
          stopLossPercent *= lateGrindStopMultiplier;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK} 🐌 LATE GRIND ACCEPTANCE - tighter stop applied: ${stopLossPercent.toFixed(2)}%`);
        }
        
        // Apply tighter stops for price action early entry (70% of normal = 30% tighter)
        if (priceActionEarlyEntryActive && PRICE_ACTION_EARLY_ENTRY_PARAMS.STOP_LOSS_MULTIPLIER < 1.0) {
          stopLossPercent *= PRICE_ACTION_EARLY_ENTRY_PARAMS.STOP_LOSS_MULTIPLIER;
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK} 📈 PRICE ACTION EARLY ENTRY - tighter stop applied: ${stopLossPercent.toFixed(2)}%`);
        }
        
        // Take profit = stop loss × user-configured multiplier
        let takeProfitPercent = stopLossPercent * baseTpMultiplier;
        
        // Apply tighter TP for price action early entry
        if (priceActionEarlyEntryActive && PRICE_ACTION_EARLY_ENTRY_PARAMS.TAKE_PROFIT_MULTIPLIER < 2.5) {
          takeProfitPercent *= (PRICE_ACTION_EARLY_ENTRY_PARAMS.TAKE_PROFIT_MULTIPLIER / baseTpMultiplier);
          logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK} 📈 PRICE ACTION EARLY ENTRY - tighter TP applied: ${takeProfitPercent.toFixed(2)}%`);
        }
        
        // Log unified risk calculation
        logger.forSymbol(symbol).info(`${LOG_CATEGORIES.RISK} 💰 UNIFIED RISK: Profile=${riskProfile}, Position=${strategyPositionSize.toFixed(2)}% (base ${basePositionSize}%), SL=${stopLossPercent.toFixed(2)}% (base ${baseStopLoss}%), TP=${takeProfitPercent.toFixed(2)}% (${baseTpMultiplier}x)`);


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
            // NEW: Strong ADX Override tracking for dashboard
            strongAdxOverride: {
              applied: strongAdxOverrideApplied,
              adx: adx.toFixed(1),
              adxRising: smartAdxRising,
              regimeAwareApplied,
              regimeAwareMomentumThreshold,
              originalMomentumThreshold: baseMomentumThreshold,
              effectiveMomentumThreshold,
              positionSizeMultiplier: strongAdxPositionMultiplier,
              exhaustionCheck: {
                isExhausted: adxExhaustion.isExhausted,
                isContinuation: adxExhaustion.isContinuation,
              },
            },
            // NEW: Momentum Exhaustion Override tracking for dashboard analytics
            momentumExhaustionOverride: {
              applied: momentumExhaustionOverrideApplied,
              positionSizeMultiplier: momentumExhaustionPositionMultiplier,
              stopMultiplier: momentumExhaustionStopMultiplier,
              effectiveStopLossPercent: momentumExhaustionOverrideApplied ? stopLossPercent : null,
              conditions: momentumExhaustionOverrideApplied ? {
                adx: adx.toFixed(1),
                momentumState: trendData.momentum?.state || "none",
                stoch4h: (trendData.stochasticRsi?.['4h']?.k ?? 50).toFixed(1),
                regimeScore: smartRegime.regimeScore,
                regime: smartRegime.regime,
              } : null,
            },
            // NEW: Late Grind Acceptance tracking for dashboard analytics
            lateGrindAcceptance: {
              applied: lateGrindAccepted,
              exceptionType: lateGrindExceptionType,
              positionSizeMultiplier: lateGrindPositionMultiplier,
              stopMultiplier: lateGrindStopMultiplier,
              stealthDrift: trendData.stealthTrend?.driftPercent || 0,
              direction: lateGrindDirection,
              conditions: lateGrindAccepted ? {
                htfBias: trendData.timeframes?.['4h']?.confidence || 0,
                adxSlope: trendData.volatility?.adxSlope || 0,
                stochK4h: (trendData.stochasticRsi?.['4h']?.k ?? 50),
              } : null,
            },
            // PHASE 2: Price Action Early Entry tracking for dashboard analytics
            priceActionEarlyEntry: {
              applied: priceActionEarlyEntryActive,
              positionSizeMultiplier: priceActionEarlyPositionMultiplier,
              stopMultiplier: PRICE_ACTION_EARLY_ENTRY_PARAMS.STOP_LOSS_MULTIPLIER,
              takeProfitMultiplier: PRICE_ACTION_EARLY_ENTRY_PARAMS.TAKE_PROFIT_MULTIPLIER,
              breakEvenActivationPercent: PRICE_ACTION_EARLY_ENTRY_PARAMS.BREAK_EVEN_ACTIVATION_PERCENT,
              conditions: priceActionEarlyEntryActive ? {
                adx: adx.toFixed(1),
                adxSlope: (fullAdxResult.adxSlope ?? 0).toFixed(3),
                priceMove: Math.abs(trendData.priceActionMomentum?.movePercent || 0).toFixed(2),
                minRequired: PRICE_ACTION_EARLY_ENTRY_PARAMS.MIN_PRICE_MOVE_PERCENT,
                direction: trendData.priceActionMomentum?.direction || 'none',
              } : null,
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
            // NEW: Smart Momentum tracking for complete forensic traceability
            smartMomentum: {
              score: smartMomentum.score,
              direction: smartMomentum.direction,
              isAccelerating: smartMomentum.isAccelerating,
              isWeakening: smartMomentum.isWeakening,
              isExhausted: smartMomentum.isExhausted,
              components: smartMomentum.components,
              overextensionATR: smartMomentum.overextensionATR,
              reasons: smartMomentum.reasons?.slice(0, 3), // Top 3 reasons for brevity
            },
            // Momentum state from trendData for dual-source verification
            momentumState: trendData.momentum?.state || 'none',
            momentumConfirms: trendData.momentum?.confirms || false,
            // NEW: Mean Reversion tracking for dashboard analytics
            meanReversion: meanReversionSignal ? {
              detected: meanReversionSignal.detected,
              allowed: meanReversionSignal.allowed,
              direction: meanReversionSignal.direction,
              confidence: meanReversionSignal.confidence,
              exhaustionScore: meanReversionSignal.exhaustionScore,
              qualityScore: meanReversionSignal.qualityScore,
              trendPhase: meanReversionSignal.trendPhase,
              expansionState: meanReversionSignal.expansionState,
              positionMultiplier: meanReversionPositionMultiplier,
              triggers: meanReversionSignal.triggers?.slice(0, 5),
              gateBypasses: meanReversionBypassGates.size > 0 ? Array.from(meanReversionBypassGates) : [],
              isMeanReversionSignal: strategy.name.includes('Mean Reversion'),
            } : {
              detected: false,
              allowed: false,
              direction: null,
              isMeanReversionSignal: false,
            },
            // NEW: TrueAlignment v2.0 tracking for enhanced downstream decision making
            trueAlignmentV2: {
              score: trendConsistency,
              tf4hConfidence: tf4hConfidence,
              tf1hConfidence: tf1hConfidence,
              adxContribution: adxContribution,
              totalWeightedConfidence: totalWeightedConfidence,
              neutralCapped: neutralCapped,
              qualityBoost: alignmentQualityBoost,
              breakdown: alignmentBreakdown,
              weightedComponents: {
                tf4h: weightedComponents.tf4hWeighted ?? 0,
                tf1h: weightedComponents.tf1hWeighted ?? 0,
                volume: weightedComponents.volumeWeighted ?? 0,
                adx: weightedComponents.adxWeighted ?? 0,
              },
            },
            // NEW: 4-State Regime Classifier tracking for forensic traceability
            fourStateRegime: {
              regime: fourStateRegime.regime,
              positionMultiplier: fourStatePositionMultiplier,
              allowContinuation: fourStateRegime.allowContinuation,
              allowMeanReversion: fourStateRegime.allowMeanReversion,
              requireConfirmation: fourStateRegime.requireConfirmation,
              reason: fourStateRegime.reason,
              diagnostics: fourStateRegime.diagnostics,
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
      
      // ===== COMPACT SUMMARY FOR AUTO-TRADER =====
      // Format: "SYM1:GATE1, SYM2:GATE2, ..."
      const compactAttribution = Array.from(perSymbolGateAttribution.entries())
        .map(([sym, { gate, details }]) => `${sym}:${gate}(${details || '-'})`)
        .join(' | ');
      logger.info(`🚧 GATE_SUMMARY: ${compactAttribution || 'NO_REJECTIONS'}`);
    }

    // ===== HEARTBEAT & REGIME SUMMARY =====
    // NEW: Provides observability into "no trade" periods
    const heartbeatTimestamp = new Date().toISOString();
    
    // Classify the no-trade state if no signals were generated
    let noTradeState: string | null = null;
    let noTradeReason: string | null = null;
    
    if (signals.length === 0 && perSymbolGateAttribution.size > 0) {
      // Count gate types to find dominant blocker
      const gateCounts = new Map<string, number>();
      perSymbolGateAttribution.forEach((value) => {
        const current = gateCounts.get(value.gate) || 0;
        gateCounts.set(value.gate, current + 1);
      });
      
      // Find the most common gate
      let dominantGate = '';
      let dominantCount = 0;
      gateCounts.forEach((count, gate) => {
        if (count > dominantCount) {
          dominantGate = gate;
          dominantCount = count;
        }
      });
      
      // Classify based on dominant gate
      const totalSymbols = perSymbolGateAttribution.size;
      const isUniformBlock = dominantCount === totalSymbols;
      
      if (isUniformBlock) {
        if (dominantGate === 'EARLY_TIER_0_DEEP_OVERBOUGHT' || dominantGate === 'TIER_0_DEEP_OVERBOUGHT') {
          noTradeState = NO_TRADE_ZONE_STATE.STATES.EXTREME_OVERBOUGHT;
          noTradeReason = `All ${totalSymbols} symbols blocked by deep overbought (4H K > 95)`;
        } else if (dominantGate === 'EARLY_TIER_0_DEEP_OVERSOLD' || dominantGate === 'TIER_0_DEEP_OVERSOLD') {
          noTradeState = NO_TRADE_ZONE_STATE.STATES.EXTREME_OVERSOLD;
          noTradeReason = `All ${totalSymbols} symbols blocked by deep oversold (4H K < 5)`;
        } else if (dominantGate === 'COUNTER_TREND_PROTECTION') {
          noTradeState = NO_TRADE_ZONE_STATE.STATES.COUNTER_TREND_ONLY;
          noTradeReason = `All ${totalSymbols} symbols blocked by counter-trend protection`;
        } else if (dominantGate === 'ADX_TOO_LOW' || dominantGate === 'ADX_GATE') {
          noTradeState = NO_TRADE_ZONE_STATE.STATES.NO_ENERGY;
          noTradeReason = `All ${totalSymbols} symbols blocked by low ADX (< 18)`;
        } else if (dominantGate === 'NO_CLEAR_DIRECTION') {
          noTradeState = NO_TRADE_ZONE_STATE.STATES.PULLBACK_WAITING;
          noTradeReason = `All ${totalSymbols} symbols have no clear direction - waiting for pullback`;
        } else if (dominantGate === 'RANGE_COMPRESSION_BLOCK') {
          noTradeState = NO_TRADE_ZONE_STATE.STATES.NO_ENERGY;
          noTradeReason = `All ${totalSymbols} symbols in RANGE_COMPRESSION (ADX < 25, no momentum) - no edge exists`;
        } else {
          noTradeState = NO_TRADE_ZONE_STATE.STATES.MIXED_BLOCK;
          noTradeReason = `All ${totalSymbols} symbols blocked by ${dominantGate}`;
        }
      } else {
        noTradeState = NO_TRADE_ZONE_STATE.STATES.MIXED_BLOCK;
        noTradeReason = `${totalSymbols} symbols blocked by various gates (dominant: ${dominantGate} - ${dominantCount}/${totalSymbols})`;
      }
      
      // Log the no-trade state for monitoring
      logger.info(`💤 NO_TRADE_STATE: ${noTradeState} | ${noTradeReason}`);
    } else if (signals.length === 0 && perSymbolGateAttribution.size === 0) {
      noTradeState = 'OPERATIONAL_CONCERN';
      noTradeReason = 'No rejections logged but no signals generated either';
      logger.warn(`⚠️ OPERATIONAL_CONCERN: No rejections and no signals - check if trend data was fetched`);
    }
    
    // Log heartbeat and persist to database
    if (BOT_HEARTBEAT_CONFIG.LOG_HEARTBEAT) {
      logger.info(`💓 HEARTBEAT: ${heartbeatTimestamp} | Symbols: ${perSymbolGateAttribution.size} | Signals: ${signals.length} | State: ${noTradeState || 'OPERATIONAL'}`);
    }
    
    // Persist heartbeat to database for health monitoring
    if (BOT_HEARTBEAT_CONFIG.PERSIST_TO_DB) {
      try {
        const { error: heartbeatError } = await supabase
          .from('bot_heartbeat')
          .insert({
            user_id: userId,
            recorded_at: heartbeatTimestamp,
            symbols_scanned: perSymbolGateAttribution.size,
            signals_generated: signals.length,
            rejections_logged: perSymbolGateAttribution.size,
            no_trade_state: noTradeState,
            no_trade_reason: noTradeReason,
            details: {
              rejections: {
                byHardGates: rejectedByHardGates,
                byRegime: rejectedByRegime,
                byReversalRisk: rejectedByReversalRisk,
                byStochRsiExtreme: rejectedByStochRsiExtreme,
                byQuality: rejectedByQuality,
                byStrategy: rejectedByStrategy,
              },
              dominantGate: perSymbolGateAttribution.size > 0 
                ? Array.from(perSymbolGateAttribution.values())[0]?.gate 
                : null,
            },
          });
        
        if (heartbeatError) {
          logger.warn(`❤️ Heartbeat DB persist failed: ${heartbeatError.message}`);
        }
      } catch (heartbeatErr) {
        logger.warn(`❤️ Heartbeat persist error: ${heartbeatErr}`);
      }
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
      // NEW: Heartbeat and No-Trade State for observability
      heartbeat: {
        timestamp: heartbeatTimestamp,
        symbolsScanned: perSymbolGateAttribution.size,
        signalsGenerated: signals.length,
      },
      noTradeState: noTradeState ? {
        state: noTradeState,
        reason: noTradeReason,
      } : null,
      minQualityScore: DEFAULT_MIN_QUALITY,
      message: noTradeState 
        ? `No trade zone: ${noTradeState} - ${noTradeReason}`
        : `Quality Score System active (dynamic threshold based on ADX)`,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    logError(logger, error, 'strategy-analyzer error');
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Failed to analyze strategies",
      signals: [],
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
