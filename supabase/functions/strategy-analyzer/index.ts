import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.84.0";
// RADICAL SIMPLIFICATION: Use simplified gate pipeline for signal decisions
import { evaluateProductionGates, classifyGateFamily, type GateResult } from "../_shared/gate-pipeline.ts";
import {
  LOW_CONFIDENCE_STANDARD_EXIT,
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
  // ADX Gate - single responsibility gate
  ADX_GATE,
  // LEGACY (preserved for fallback): Low ADX trend exception for strong HTF setups
  LOW_ADX_TREND_EXCEPTION_PARAMS,
  // LEGACY: Phase 2 - Regime-adaptive ADX thresholds (now superseded by ADX_GATE)
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
  SAME_DIRECTION_STACKING_PREVENTION,
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
  LIQUIDITY_SWEEP_REVERSAL,
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
  FOUR_STATE_REGIME,
  // NEW: Compression Micro-Range Module
  COMPRESSION_MODULE,
  // Centralized adaptive entry thresholds
  ADAPTIVE_ENTRY_THRESHOLDS,
  // NEW: Multi-TF Rally Override for fixing SHORT bias
  RALLY_OVERRIDE,
  // NEW: Trend Expansion StochRSI Exemption
  TREND_EXPANSION_EXEMPTION,
  // NEW: Risk Score Position Scaling & Dynamic Entry Window
  RISK_SCORE_SCALING,
  DYNAMIC_ENTRY_WINDOW,
  // NEW: LTF Micro Timing Gate (1m/5m entry timing quality)
  LTF_MICRO_TIMING_GATE,
  // Production strategy routing per symbol
  BTC_PARAMS,
  ALTCOIN_PARAMS,
  OVEREXTENSION_SYMBOL_ROUTING,
  MR_TRAILING_TP,
  EXHAUSTION_BOUNCE_RECOVERY,
  DEEP_OVERSOLD_BOUNCE,
} from "../_shared/constants.ts";
// NEW: Compression Engine for RANGE_COMPRESSION scalps
import {
  evaluateCompressionEntry,
  type CompressionEntryResult
} from "../_shared/compression-engine.ts";
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
  // NEW: Trend Continuation Pullback (EMA-based re-entry in decelerating trends)
  detectTrendContinuationPullback,
  // NEW: Liquidity Trap Detector (fake breakout, stop hunt, bull/bear trap)
  detectLiquidityTrap,
  // Liquidity Sweep Reversal Detection
  detectLiquiditySweepReversal,
  type MomentumScoreResult,
  type PullbackResult,
  type EntryQualityResult,
  type EntryConfirmationResult,
  type MarketRegimeResult as SmartRegimeResult,
  type ContinuationModeResult,
  type ADXExhaustionResult,
  type BollingerPriceActionResult,
  type MomentumFlipResult,
  type TrendContinuationPullbackResult,
  type LiquidityTrapResult
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
  // NEW: 4-State Regime Classifier + Persistence
  classify4StateRegime,
  applyRegimePersistence,
  // Legacy extractors removed — all logic reads from MarketFeatureSnapshot (mfs) directly
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
import { buildMarketFeatureSnapshot, snapshotAlignedTFCount, type MarketFeatureSnapshot } from "../_shared/market-feature-snapshot.ts";
import { analyzeOrderFlow, getOrderFlowQualityBonus, type OrderFlowAnalysis } from "../_shared/orderflow.ts";
import { checkPositionCorrelation, getCorrelationAdjustedSize } from "../_shared/correlation.ts";
import { createLogger, logError, LOG_CATEGORIES } from "../_shared/logging.ts";
import { getKlines, get24hrTicker, parseKlinePrices, getAndResetFetchStats } from "../_shared/binance.ts";
import { 
  isShadowModeEnabled, 
  logShadowSignal, 
  compareMACDGate, 
  compareADXExhaustionGate, 
  compareStochRSIGate,
  deriveShadowSLTP,
  isShadowSignalDuplicate,
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

// ============= REJECTION LOG BUFFER =============
// Collects all rejections in-memory during a cycle, then flushes once at the end
// with a single dedup SELECT + single batch INSERT. Eliminates N individual DB calls.
interface BufferedRejection {
  user_id: string;
  symbol: string;
  rejection_reason: string;
  gate_family: string;
  filters_status: any;
  trend_data?: any;
  checked_at: string;
  ai_context?: { mfs: MarketFeatureSnapshot | null; enableAI: boolean };
}

class RejectionBuffer {
  private buffer: BufferedRejection[] = [];
  private dedupKeys = new Set<string>();

  add(entry: Omit<BufferedRejection, 'checked_at' | 'gate_family'> & { gate_family?: string }) {
    const dedupKey = `${entry.symbol}::${entry.rejection_reason}`;
    if (this.dedupKeys.has(dedupKey)) return; // Same symbol+reason already in this cycle
    this.dedupKeys.add(dedupKey);
    const gate_family = entry.gate_family ?? classifyGateFamily(entry.rejection_reason);
    this.buffer.push({ ...entry, gate_family, checked_at: new Date().toISOString() });
  }

  async flush(supabase: any, logger: any) {
    if (this.buffer.length === 0) return 0;

    // Check which symbol+reason combos already exist in last 30 min
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const userId = this.buffer[0].user_id;

    const { data: recentLogs } = await supabase
      .from("signal_rejection_log")
      .select("id, symbol, rejection_reason")
      .eq("user_id", userId)
      .gte("checked_at", thirtyMinAgo);

    const recentMap = new Map<string, string>();
    (recentLogs || []).forEach((r: any) => {
      recentMap.set(`${r.symbol}::${r.rejection_reason}`, r.id);
    });

    const newEntries: typeof this.buffer = [];
    const touchEntries: { id: string; trend_data: any }[] = [];

    for (const entry of this.buffer) {
      const key = `${entry.symbol}::${entry.rejection_reason}`;
      const existingId = recentMap.get(key);
      if (existingId) {
        // Same reason still active — refresh timestamp + update trend_data with latest MFS
        touchEntries.push({ id: existingId, trend_data: entry.trend_data ?? null });
      } else {
        newEntries.push(entry);
      }
    }

    // Batch-update checked_at and trend_data for unchanged rejections
    if (touchEntries.length > 0) {
      const now = new Date().toISOString();
      // Update each entry individually to set per-record trend_data
      const touchPromises = touchEntries.map(({ id, trend_data }) =>
        supabase
          .from("signal_rejection_log")
          .update({ checked_at: now, trend_data })
          .eq("id", id)
      );
      const touchResults = await Promise.all(touchPromises);
      const touchErrors = touchResults.filter(r => r.error);
      if (touchErrors.length > 0) {
        logger.warn(`Rejection timestamp refresh failed for ${touchErrors.length}/${touchEntries.length} entries`);
      }
    }

    let insertedCount = 0;
    if (newEntries.length > 0) {
      // Strip ai_context before insert (not a DB column)
      const insertRows = newEntries.map(({ ai_context, ...row }) => row);

      const { data: inserted, error } = await supabase
        .from("signal_rejection_log")
        .insert(insertRows)
        .select("id, symbol, rejection_reason");

      if (error) {
        logger.error(`Rejection buffer flush failed: ${error.message}`);
      } else {
        insertedCount = inserted?.length || 0;

        // Fire AI analysis for entries that requested it
        for (const entry of newEntries) {
          if (entry.ai_context?.enableAI && entry.ai_context?.trendData) {
            const matchedRow = inserted?.find(
              (r: any) => r.symbol === entry.symbol && r.rejection_reason === entry.rejection_reason
            );
            if (matchedRow) {
              analyzeRejectionWithAI(supabase, matchedRow.id, {
                symbol: entry.symbol,
                rejection_reason: entry.rejection_reason,
                filters_status: entry.filters_status,
                trend_data: entry.ai_context.mfs,
              }).catch((err: any) => logger.warn(`AI analysis failed for ${entry.symbol}: ${err}`));
            }
          }
        }
      }
    }

    logger.info(`Rejection buffer: ${this.buffer.length} buffered → ${insertedCount} inserted, ${touchEntries.length} refreshed`);
    return insertedCount + touchEntries.length;
  }
}

// Module-level active buffer reference - set during each cycle, used by logRejectionWithAI
let activeRejectionBuffer: RejectionBuffer | null = null;

// Helper function to log rejection with optional AI analysis and Order Flow data
// PHASE 3 MFS MIGRATION: Now reads all indicator data from MarketFeatureSnapshot when available
// Falls back to empty defaults when mfs is null (pre-loop calls like symbol filters)
const logRejectionWithAI = async (
  supabase: any,
  userId: string,
  symbol: string,
  rejectionReason: string,
  filtersStatus: any,
  mfs: MarketFeatureSnapshot | null,
  enableAI: boolean = false,
  orderFlow?: OrderFlowAnalysis | null
) => {
  // Extract all indicator data from MarketFeatureSnapshot (single source of truth)
  // DEFENSIVE: Use optional chaining on all nested MFS accesses to prevent TypeError
  // when mfs is truthy but sub-objects are unexpectedly undefined
  const stochRsiData = mfs?.stochRsi ? {
    // FLAT FIELDS for UI compatibility (Issue #1 & #2 fix)
    stochRsiK: mfs.stochRsi["4h"]?.k ?? 50,      // Primary 4h K (legacy field)
    stochRsiD: mfs.stochRsi["4h"]?.d ?? 50,      // Primary 4h D (NEW - Issue #2)
    stochRsiK4h: mfs.stochRsi["4h"]?.k ?? 50,    // Explicit 4h K
    stochRsiD4h: mfs.stochRsi["4h"]?.d ?? 50,    // Explicit 4h D (NEW - Issue #2)
    stochRsiK1h: mfs.stochRsi["1h"]?.k ?? 50,    // 1h K (NEW - Issue #1)
    stochRsiD1h: mfs.stochRsi["1h"]?.d ?? 50,    // 1h D (NEW - Issue #1)
    stochRsiK30m: mfs.stochRsi["30m"]?.k ?? 50,  // 30m K
    stochRsiD30m: mfs.stochRsi["30m"]?.d ?? 50,  // 30m D
    stochRsiK15m: mfs.stochRsi["15m"]?.k ?? 50,  // 15m K
    stochRsiD15m: mfs.stochRsi["15m"]?.d ?? 50,  // 15m D
    // NESTED OBJECTS for structured access
    stochRsi4h: { k: mfs.stochRsi["4h"]?.k ?? 50, d: mfs.stochRsi["4h"]?.d ?? 50 },
    stochRsi1h: { k: mfs.stochRsi["1h"]?.k ?? 50, d: mfs.stochRsi["1h"]?.d ?? 50 },
    stochRsi30m: { k: mfs.stochRsi["30m"]?.k ?? 50, d: mfs.stochRsi["30m"]?.d ?? 50 },
    stochRsi15m: { k: mfs.stochRsi["15m"]?.k ?? 50, d: mfs.stochRsi["15m"]?.d ?? 50 }
  } : {};
  
  // Extract Bollinger Band %B and squeeze values from MFS
  const bollingerData = mfs?.bollinger ? {
    bollinger4h: {
      percentB: mfs.bollinger["4h"]?.percentB ?? 50,
      squeeze: mfs.bollinger["4h"]?.squeeze ?? false,
      squeezeIntensity: mfs.bollinger["4h"]?.squeezeIntensity ?? 0,
      pricePosition: mfs.bollinger["4h"]?.pricePosition ?? "middle",
    },
    bollinger1h: {
      percentB: mfs.bollinger["1h"]?.percentB ?? 50,
      squeeze: mfs.bollinger["1h"]?.squeeze ?? false,
      squeezeIntensity: mfs.bollinger["1h"]?.squeezeIntensity ?? 0,
      pricePosition: mfs.bollinger["1h"]?.pricePosition ?? "middle",
    },
    bollinger30m: {
      percentB: mfs.bollinger["30m"]?.percentB ?? 50,
      squeeze: mfs.bollinger["30m"]?.squeeze ?? false,
      squeezeIntensity: mfs.bollinger["30m"]?.squeezeIntensity ?? 0,
      pricePosition: mfs.bollinger["30m"]?.pricePosition ?? "middle",
    },
    bollinger15m: {
      percentB: mfs.bollinger["15m"]?.percentB ?? 50,
      squeeze: mfs.bollinger["15m"]?.squeeze ?? false,
      squeezeIntensity: mfs.bollinger["15m"]?.squeezeIntensity ?? 0,
      pricePosition: mfs.bollinger["15m"]?.pricePosition ?? "middle",
    }
  } : {};
  
  // Extract ADX and ADX slope from MFS
  const adxData = mfs ? {
    adx: mfs.adx,
    adxSlope: mfs.adxSlope,
    adxRising: mfs.adxRising,
    adx15m: mfs.adx15m ?? null,
    adx30m: mfs.adx30m ?? null,
    adx4h: mfs.adx4h ?? null,
  } : {};
  
  // Extract momentum data from MFS
  const momentumData = mfs ? {
    momentumScore: mfs.smartMomentum?.score ?? null,
    momentumPhase: mfs.smartMomentum?.phase ?? null,
    momentumDirection: mfs.smartMomentum?.direction ?? null,
    isAccelerating: mfs.smartMomentum?.isAccelerating ?? null,
    isWeakening: mfs.smartMomentum?.isWeakening ?? null,
    isTransitioning: mfs.smartMomentum?.isTransitioning ?? null,
  } : {};
  
  // Regime data is not in MFS (computed separately) — pass empty, let filtersStatus override
  const regimeData = {};
  
  // Extract volume data from MFS
  const volumeData = mfs?.volume ? {
    volumeRatio: mfs.volume["1h"]?.volumeRatio ?? 
                 mfs.volume["30m"]?.volumeRatio ?? 
                 mfs.volume["4h"]?.volumeRatio ?? 
                 mfs.volume["15m"]?.volumeRatio ?? 
                 null,
    volumeTrend: mfs.volume["1h"]?.volumeTrend ?? null,
    volumeSpike: mfs.volume["1h"]?.volumeSpike ?? null,
    volumeAboveMA: (mfs.volume["1h"]?.volumeRatio ?? 0) > 1.0 ? true : false,
  } : {};
  
  // Merge all extracted data into filters_status
  // CRITICAL FIX: filtersStatus takes precedence for explicitly passed values (like adxSlope from gate checks)
  let enrichedFiltersStatus = {
    ...stochRsiData,
    ...bollingerData,
    ...adxData,
    ...momentumData,
    ...regimeData,
    ...volumeData,
    ...filtersStatus, // LAST: Gate-specific values override defaults
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

  // Build MFS compact summary for trend_data column (forensic analysis)
  const mfsCompactSummary = mfs ? {
    primaryTrend: mfs.primaryTrend ?? null,
    adx: mfs.adx ?? null,
    adxSlope: mfs.adxSlope ?? null,
    reversalScore: mfs.reversalScore ?? null,
    volumeScore: mfs.volumeScore ?? null,
    stochRsi4hK: mfs.stochRsi?.["4h"]?.k ?? null,
    stochRsi1hK: mfs.stochRsi?.["1h"]?.k ?? null,
    momentumScore: mfs.smartMomentum?.score ?? null,
    momentumPhase: mfs.smartMomentum?.phase ?? null,
    confidence: mfs.confidence ?? null,
  } : null;

  // Use active buffer if set (batch mode), otherwise fall back to direct insert
  if (activeRejectionBuffer) {
    activeRejectionBuffer.add({
      user_id: userId,
      symbol,
      rejection_reason: rejectionReason,
      filters_status: enrichedFiltersStatus,
      trend_data: mfsCompactSummary,
      ai_context: { mfs, enableAI },
    });
    return;
  }

  // Legacy direct insert path (should not be reached in normal operation)
  const { data, error } = await supabase
    .from("signal_rejection_log")
    .insert({
      user_id: userId,
      symbol,
      rejection_reason: rejectionReason,
      filters_status: enrichedFiltersStatus,
      trend_data: mfsCompactSummary,
      checked_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    logger.forSymbol(symbol).error(`Failed to log rejection: ${error.message}`);
    return;
  }

  if (enableAI && data?.id && mfs) {
    analyzeRejectionWithAI(supabase, data.id, {
      symbol,
      rejection_reason: rejectionReason,
      filters_status: enrichedFiltersStatus,
      trend_data: mfs, // Pass snapshot as trend_data for AI analysis
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
  mfs: MarketFeatureSnapshot,
  derivedDirection: string
): SignalTypeValidation => {
  if (!SIGNAL_TYPE_VALIDITY_PARAMS.ENABLED) {
    return { isValid: true, violations: [], signalType: strategyName };
  }
  
  const violations: string[] = [];
  // MFS MIGRATION: All indicators read from MarketFeatureSnapshot
  const adx = mfs.adx;
  const adxSlope = mfs.adxSlope;
  const momentumScore = mfs.smartMomentum?.score ?? 0;
  const macdSlope = mfs.smartMomentum?.components?.macdSlope ?? 0;
  const regime = mfs.regime || 'RANGING';
  const bbSqueeze = mfs.bollinger["4h"].squeeze || mfs.bollinger.squeezeActive;
  
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
    // MFS MIGRATION: RSI and StochRSI from snapshot
    const rsi = mfs.timeframes["1h"].rsi;
    const stochRsi = mfs.stochRsi["4h"].k;
    
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
  mfs: MarketFeatureSnapshot,
  derivedDirection: string
): HardContradictionResult => {
  if (!SIGNAL_TYPE_VALIDITY_PARAMS.ENABLED) {
    return { hasContradiction: false };
  }
  
  const config = SIGNAL_TYPE_VALIDITY_PARAMS.HARD_CONTRADICTIONS;
  // MFS MIGRATION: All indicators read from MarketFeatureSnapshot
  const momentumScore = mfs.smartMomentum?.score ?? 0;
  const macdSlope = mfs.smartMomentum?.components?.macdSlope ?? 0;
  const adx = mfs.adx;
  
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
  mfs: MarketFeatureSnapshot,
  strategyName: string
): SqueezeClassificationResult => {
  const config = SIGNAL_TYPE_VALIDITY_PARAMS.SQUEEZE_RECLASSIFICATION;
  
  if (!config.ENABLED) {
    return { shouldReclassify: false };
  }
  
  // MFS MIGRATION: Squeeze and ADX from MarketFeatureSnapshot
  const bbSqueeze = mfs.bollinger["4h"].squeeze || mfs.bollinger.squeezeActive;
  const adx = mfs.adx;
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
// MFS MIGRATION: Reads volume data from MarketFeatureSnapshot
const getVolumeScore = (mfs: MarketFeatureSnapshot, trend: string): number => {
  const volumeConfirms = mfs.volumeConfirms;
  const volumeSpike = mfs.volume["1h"].volumeSpike;
  const volumeRatio = mfs.volume["1h"].volumeRatio;
  const hasRangeExpansion = mfs.volume.hasRangeExpansion1h;
  
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

const detectReversalRisk = (mfs: MarketFeatureSnapshot, intendedDirection: string): ReversalRiskResult => {
  // MFS MIGRATION COMPLETE: calculateUnifiedReversalScore now uses MFS directly
  const unifiedResult = calculateUnifiedReversalScore(mfs, intendedDirection);
  
  return {
    isHighRisk: unifiedResult.decision === "BLOCK",
    riskScore: unifiedResult.score,
    signals: unifiedResult.reasons,
    reason: unifiedResult.reasons.slice(0, 3).join(", ")
  };
};

// ============= IMPROVEMENT #3: ENHANCED PULLBACK ENTRY DETECTION =============
// UNIFIED: Delegates structural pullback detection to detectPullback (smart-momentum.ts)
// This function adds Bollinger, StochRSI, momentum continuation, and multi-timeframe scoring
// on top of the shared structural pullback result — single source of truth for "what is a pullback"
interface PullbackAnalysis {
  isPullback: boolean;
  pullbackDepth: number;     // 0-100% of recent swing
  entryTimingScore: number;  // 0-28 bonus points
  reason: string;
  hasBothConditions: boolean; // RSI + Bollinger combined
}

const analyzePullbackEntry = (mfs: MarketFeatureSnapshot, trend: string, smartPullback: PullbackResult): PullbackAnalysis => {
  // MFS MIGRATION: All indicators read from snapshot
  const k4h = mfs.stochRsi["4h"].k;
  const k30m = mfs.stochRsi["30m"].k;
  const bb1h = mfs.bollinger["1h"];
  const bb30m = mfs.bollinger["30m"];
  const rsi1h = mfs.timeframes["1h"].rsi;
  const rsi30m = mfs.timeframes["30m"].rsi;
  const adx = mfs.adx;
  const percentB1h = bb1h.percentB || 50;
  const percentB30m = bb30m.percentB || 50;
  
  // Use 1h RSI as primary, 30m for confirmation
  const rsi = rsi1h;
  const percentB = percentB1h;
  
  // Strong ADX = momentum continuation is valid strategy
  const isStrongTrend = adx >= ADX_THRESHOLDS.VERY_STRONG;
  const isMinTrend = adx >= ADX_THRESHOLDS.MINIMUM; // 20+
  const hasMacdExpanding = mfs.macdExpanding;
  const momentumState = mfs.momentumState || "none";
  const isMomentumConfirmed = momentumState === "confirmed" || momentumState === "mixed";
  const isMomentumBuilding = momentumState === "building";
  const isActiveMomentum = isMomentumConfirmed || isMomentumBuilding || mfs.momentumConfirms;
  
  // Strong Trend Continuation Check: 4h + 1h aligned + CONFIRMED momentum
  // PATCH: Require strict momentum confirmation for STC — 'mixed' state with score=0
  // was allowing entries on symbols like ETHUSDT where price never moved favorably
  const trend4h = mfs.timeframes['4h'].trend;
  const trend1h = mfs.timeframes['1h'].trend;
  const isBullishAligned = trend4h === "bullish" && trend1h === "bullish";
  const isBearishAligned = trend4h === "bearish" && trend1h === "bearish";
  
  // Strict momentum for STC: must be confirmed/building OR momentum.confirms=true
  // Explicitly exclude 'mixed' state unless momentum.confirms is independently true
  const isStrictMomentumConfirmed = momentumState === "confirmed" || isMomentumBuilding || mfs.momentumConfirms;
  
  const hasStrongTrendContinuation = isMinTrend && isStrictMomentumConfirmed && (
    (trend === "bullish" && isBullishAligned) ||
    (trend === "bearish" && isBearishAligned)
  );
  
  // ============= STOCHRSI-RSI CONFLICT RESOLUTION =============
  const isLong = trend === "bullish";
  const isStochRsiExtreme = isLong 
    ? k4h > STOCHRSI_THRESHOLDS.EXTREME_OVERBOUGHT
    : k4h < STOCHRSI_THRESHOLDS.EXTREME_OVERSOLD;
  
  const applyStochRsiWeight = (score: number, reason: string): { score: number; reason: string } => {
    if (isStochRsiExtreme && score > 10) {
      const weighted = Math.round(score * 0.5);
      return { score: weighted, reason: `${reason} [StochRSI extreme: score ${score} -> ${weighted}]` };
    }
    return { score, reason };
  };
  
  // Define Bollinger pullback conditions (these remain in analyzePullbackEntry — Bollinger is not in detectPullback)
  const bollingerPullbackBullish = percentB < 35 || bb1h.pricePosition === "lower_zone";
  const bollingerPullbackBearish = percentB > 65 || bb1h.pricePosition === "upper_zone";
  
  // UNIFIED: Use structural pullback + Bollinger for entry scoring
  // detectPullback handles RSI dip/recovery/bounce — we layer Bollinger and momentum on top
  
  // Extract structural pullback properties from smartPullback (PullbackResult)
  const hasStructuralPullback = smartPullback.isValidPullback;
  const structuralDepth = smartPullback.pullbackDepth;
  const rsiDipped = smartPullback.rsiDipped;
  const isRsiRecovering = smartPullback.rsiRecovering;
  const hasBounceConfirmation = smartPullback.hasBounceConfirmation;
  
  // Derive 30m pullback confirmation from 30m data
  const has30mPullbackConfirm = (() => {
    const trend30m = mfs.timeframes['30m'].trend || mfs.timeframes['30m'].emaSignal || 'neutral';
    if (trend === 'bullish') {
      return (trend30m === 'bullish' || trend30m === 'neutral') && rsi30m < 55 && k30m < 60;
    }
    if (trend === 'bearish') {
      return (trend30m === 'bearish' || trend30m === 'neutral') && rsi30m > 45 && k30m > 40;
    }
    return false;
  })();
  
  if (trend === "bullish") {
    const mtfBonus = has30mPullbackConfirm ? 3 : 0;
    const mtfSuffix = has30mPullbackConfirm ? " [30m confirmed +3]" : "";
    
    // BEST ENTRY: Structural pullback with RSI recovery + Bollinger confirmation
    if ((hasStructuralPullback && rsiDipped) && bollingerPullbackBullish) {
      const baseScore = 25 + mtfBonus;
      const bounceNote = hasBounceConfirmation ? " + bounce confirmed" : "";
      const weighted = applyStochRsiWeight(baseScore, `OPTIMAL: Structural pullback (${structuralDepth.toFixed(1)}%) + Bollinger${bounceNote}` + mtfSuffix);
      return {
        isPullback: true,
        hasBothConditions: true,
        pullbackDepth: structuralDepth,
        entryTimingScore: weighted.score,
        reason: weighted.reason
      };
    }
    
    // GOOD ENTRY: Structural pullback with RSI dip (from detectPullback)
    if (hasStructuralPullback && rsiDipped) {
      const baseScore = 18 + mtfBonus;
      const recoveryNote = isRsiRecovering ? " (RSI recovering)" : "";
      const weighted = applyStochRsiWeight(baseScore, `Bullish pullback: ${smartPullback.pullbackType} (${structuralDepth.toFixed(1)}%)${recoveryNote}` + mtfSuffix);
      return {
        isPullback: true,
        hasBothConditions: false,
        pullbackDepth: structuralDepth,
        entryTimingScore: weighted.score,
        reason: weighted.reason
      };
    }
    
    // GOOD ENTRY: Bollinger pullback only (no structural pullback from detectPullback)
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
    if (mfs.stochRsiAggregated.bullishCrossCount >= 1) {
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
    const rsiInMomentumZone = rsi > RSI_THRESHOLDS.NEUTRAL_LOW && rsi < RSI_THRESHOLDS.BULLISH_STRONG;
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
    
    // STRONG TREND CONTINUATION: 4h+1h aligned + momentum active
    if (hasStrongTrendContinuation) {
      let continuationScore = 10;
      let continuationReason = `Trend continuation: 4h+1h bullish aligned + momentum ${momentumState}`;
      if (hasMacdExpanding) { continuationScore = 14; continuationReason += " + MACD expanding"; }
      if (rsi > RSI_THRESHOLDS.BULLISH_STRONG) {
        continuationScore = Math.max(8, continuationScore - 4);
        continuationReason += ` [RSI=${rsi.toFixed(1)} slightly extended]`;
      }
      const weighted = applyStochRsiWeight(continuationScore, continuationReason);
      return { isPullback: false, hasBothConditions: false, pullbackDepth: 0, entryTimingScore: weighted.score, reason: weighted.reason };
    }
    
    // POOR ENTRY: Strong trend but overbought - low score
    if (isStrongTrend && rsi > RSI_THRESHOLDS.BULLISH_STRONG) {
      return { isPullback: false, hasBothConditions: false, pullbackDepth: 0, entryTimingScore: 2, reason: "Poor entry: Overbought in strong trend" };
    }
    
    // MOMENTUM CONTINUATION FALLBACK: ADX >= 25 with MACD expanding
    if (adx >= ADX_THRESHOLDS.STRONG && hasMacdExpanding && rsi > RSI_THRESHOLDS.BULLISH_PULLBACK && rsi < RSI_THRESHOLDS.OVERBOUGHT) {
      return { isPullback: false, hasBothConditions: false, pullbackDepth: 0, entryTimingScore: 10, reason: `Momentum continuation: ADX=${adx.toFixed(1)} + MACD expanding (RSI=${rsi.toFixed(1)})` };
    }
    
    // POOR ENTRY: RSI in neutral zone = not ideal timing
    if (rsi >= RSI_THRESHOLDS.BULLISH_PULLBACK && rsi <= RSI_THRESHOLDS.BULLISH_STRONG) {
      return { isPullback: false, hasBothConditions: false, pullbackDepth: 0, entryTimingScore: 4, reason: "Neutral entry: RSI in middle zone" };
    }
    
    // AVOID: Overbought in weak trend
    if (rsi > RSI_THRESHOLDS.OVERBOUGHT || mfs.stochRsiAggregated.overboughtCount >= 2) {
      return { isPullback: false, hasBothConditions: false, pullbackDepth: 0, entryTimingScore: 0, reason: "Avoid: Overbought in weak trend" };
    }
  }
  
  // For bearish trend, look for rally (price spiked but downtrend intact)
  if (trend === "bearish") {
    const mtfBonus = has30mPullbackConfirm ? 3 : 0;
    const mtfSuffix = has30mPullbackConfirm ? " [30m confirmed +3]" : "";
    
    // BEST ENTRY: Structural pullback with RSI spike + Bollinger confirmation
    if ((hasStructuralPullback && rsiDipped) && bollingerPullbackBearish) {
      const baseScore = 25 + mtfBonus;
      const bounceNote = hasBounceConfirmation ? " + rejection confirmed" : "";
      const weighted = applyStochRsiWeight(baseScore, `OPTIMAL: Structural rally (${structuralDepth.toFixed(1)}%) + Bollinger${bounceNote}` + mtfSuffix);
      return {
        isPullback: true,
        hasBothConditions: true,
        pullbackDepth: structuralDepth,
        entryTimingScore: weighted.score,
        reason: weighted.reason
      };
    }
    
    // GOOD ENTRY: Structural pullback with RSI spike (from detectPullback)
    if (hasStructuralPullback && rsiDipped) {
      const baseScore = 18 + mtfBonus;
      const recoveryNote = isRsiRecovering ? " (RSI falling)" : "";
      const weighted = applyStochRsiWeight(baseScore, `Bearish rally: ${smartPullback.pullbackType} (${structuralDepth.toFixed(1)}%)${recoveryNote}` + mtfSuffix);
      return {
        isPullback: true,
        hasBothConditions: false,
        pullbackDepth: structuralDepth,
        entryTimingScore: weighted.score,
        reason: weighted.reason
      };
    }
    
    // GOOD ENTRY: Bollinger rally only
    if (bollingerPullbackBearish) {
      const baseScore = 15 + mtfBonus;
      const weighted = applyStochRsiWeight(baseScore, "Bearish rally: Price near upper Bollinger band" + mtfSuffix);
      return { isPullback: true, hasBothConditions: false, pullbackDepth: 30, entryTimingScore: weighted.score, reason: weighted.reason };
    }
    
    // ACCEPTABLE: StochRSI bearish cross
    if (mfs.stochRsiAggregated.bearishCrossCount >= 1) {
      const baseScore = 12 + mtfBonus;
      const weighted = applyStochRsiWeight(baseScore, "Bearish rally: StochRSI bearish cross" + mtfSuffix);
      return { isPullback: true, hasBothConditions: false, pullbackDepth: 25, entryTimingScore: weighted.score, reason: weighted.reason };
    }
    
    // MOMENTUM CONTINUATION: Only if very strong trend + confirmed momentum
    const rsiInMomentumZone = rsi > RSI_THRESHOLDS.BEARISH_PULLBACK && rsi < RSI_THRESHOLDS.NEUTRAL_HIGH;
    if (isStrongTrend && hasMacdExpanding && isMomentumConfirmed && rsiInMomentumZone) {
      const weighted = applyStochRsiWeight(8, `Momentum continuation: Strong ADX + MACD expansion (RSI=${rsi.toFixed(1)})`);
      return { isPullback: false, hasBothConditions: false, pullbackDepth: 0, entryTimingScore: weighted.score, reason: weighted.reason };
    }
    
    // STRONG TREND CONTINUATION: 4h+1h aligned + momentum active
    if (hasStrongTrendContinuation) {
      let continuationScore = 10;
      let continuationReason = `Trend continuation: 4h+1h bearish aligned + momentum ${momentumState}`;
      if (hasMacdExpanding) { continuationScore = 14; continuationReason += " + MACD expanding"; }
      if (rsi < RSI_THRESHOLDS.BEARISH_PULLBACK) {
        continuationScore = Math.max(8, continuationScore - 4);
        continuationReason += ` [RSI=${rsi.toFixed(1)} slightly extended]`;
      }
      const weighted = applyStochRsiWeight(continuationScore, continuationReason);
      return { isPullback: false, hasBothConditions: false, pullbackDepth: 0, entryTimingScore: weighted.score, reason: weighted.reason };
    }
    
    // MOMENTUM CONTINUATION FALLBACK: ADX >= 25 with MACD expanding
    if (adx >= ADX_THRESHOLDS.STRONG && hasMacdExpanding && rsi < RSI_THRESHOLDS.BEARISH_RALLY && rsi > RSI_THRESHOLDS.OVERSOLD) {
      return { isPullback: false, hasBothConditions: false, pullbackDepth: 0, entryTimingScore: 10, reason: `Momentum continuation: ADX=${adx.toFixed(1)} + MACD expanding (RSI=${rsi.toFixed(1)})` };
    }
    
    // POOR ENTRY: RSI in neutral zone
    if (rsi <= RSI_THRESHOLDS.BEARISH_RALLY && rsi >= RSI_THRESHOLDS.BEARISH_PULLBACK) {
      return { isPullback: false, hasBothConditions: false, pullbackDepth: 0, entryTimingScore: 4, reason: "Neutral entry: RSI in middle zone" };
    }
    
    // POOR ENTRY: Strong downtrend but oversold
    if (isStrongTrend && rsi < RSI_THRESHOLDS.BEARISH_PULLBACK) {
      return { isPullback: false, hasBothConditions: false, pullbackDepth: 0, entryTimingScore: 2, reason: "Poor entry: Oversold in strong downtrend" };
    }
    
    // AVOID: Oversold in weak downtrend
    if (rsi < RSI_THRESHOLDS.OVERSOLD || mfs.stochRsiAggregated.oversoldCount >= 2) {
      return { isPullback: false, hasBothConditions: false, pullbackDepth: 0, entryTimingScore: 0, reason: "Avoid: Oversold in weak downtrend" };
    }
  }
  
  // ============= TREND CONTINUATION CREDIT =============
  // Very strong trend (ADX >= 28): Continuation is a valid strategy
  if (adx >= ADX_THRESHOLDS.VERY_STRONG && hasStrongTrendContinuation) {
    return { isPullback: false, hasBothConditions: false, pullbackDepth: 0, entryTimingScore: 15, reason: `Strong trend continuation: ADX=${adx.toFixed(1)} with aligned timeframes` };
  }
  
  // Moderate trend (ADX >= 22): Some credit for confirmed momentum
  if (adx >= ADX_THRESHOLDS.MODERATE && isActiveMomentum) {
    return { isPullback: false, hasBothConditions: false, pullbackDepth: 0, entryTimingScore: 10, reason: `Trend continuation: ADX=${adx.toFixed(1)} with active momentum` };
  }
  
  // Minimum trend (ADX >= 20): Small credit
  if (adx >= ADX_THRESHOLDS.MINIMUM && isActiveMomentum) {
    return { isPullback: false, hasBothConditions: false, pullbackDepth: 0, entryTimingScore: 6, reason: `Weak trend continuation: ADX=${adx.toFixed(1)}` };
  }
  
  // Default - no trend confirmation, poor timing
  return { isPullback: false, hasBothConditions: false, pullbackDepth: 0, entryTimingScore: 2, reason: "No pullback detected - not ideal entry timing" };
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

  const cycleStartMs = Date.now();
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
            null,  // No mfs available for symbol-level blocks
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

    // No manually paused strategies (strategy_performance table removed)
    const pausedStrategyNames = new Set<string>();

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
      .select("symbol, side, quantity, entry_price, strategy_name, opened_at, executed_at, status, entry_exception_type")
      .eq("user_id", userId)
      .eq("status", "active");

    // Count active EARLY_TREND_IGNITION positions for concurrent cap enforcement
    const activeIgnitionPositionCount = (activePositions || []).filter(
      (p: any) => p.entry_exception_type === 'EARLY_TREND_IGNITION'
    ).length;

    // ============= TIER 2 ZONE RESET: Query last closed Tier 2 graduated positions =============
    // Used to detect if a symbol had a recent Tier 2 graduated entry that closed,
    // and whether the oscillator has reset (exited the zone) since then.
    const tier2ZoneResetMap = new Map<string, { closedAt: string; side: string }>();
    if (HTF_EXTREME_HARD_GATES.TIER_2_ZONE_RESET?.ENABLED) {
      const { data: lastTier2Positions } = await supabase
        .from("positions")
        .select("symbol, side, closed_at, entry_exception_type")
        .eq("user_id", userId)
        .eq("status", "closed")
        .eq("entry_exception_type", "TIER_2_GRADUATED")
        .order("closed_at", { ascending: false })
        .limit(50);
      
      if (lastTier2Positions && lastTier2Positions.length > 0) {
        // Keep only the most recent Tier 2 closed trade per symbol
        for (const pos of lastTier2Positions) {
          if (!tier2ZoneResetMap.has(pos.symbol)) {
            tier2ZoneResetMap.set(pos.symbol, {
              closedAt: pos.closed_at,
              side: pos.side,
            });
          }
        }
        logger.info(`${LOG_CATEGORIES.GATE} Tier 2 zone reset: tracking ${tier2ZoneResetMap.size} symbols with recent graduated entries`);
      }
    }

    // ============= PROBE CASCADE PROTECTION =============
    // Track recent probe entries per symbol to prevent over-probing
    const probeCountPerSymbol6h = new Map<string, number>();
    const lastProbeTimestampPerSymbol = new Map<string, string>();
    {
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
      const { data: recentProbes } = await supabase
        .from("positions")
        .select("symbol, entry_exception_type, opened_at")
        .eq("user_id", userId)
        .gte("opened_at", sixHoursAgo)
        .in("entry_exception_type", ['TREND_ACCELERATION_PROBE', 'DEEP_EXHAUSTION_ACCEL_PROBE', 'OVEREXTENSION_ACCEL_BYPASS', 'ADX_SLOPE_DECAY_MR_PROBE', 'CAPITULATION_OVERRIDE'])
        .order("opened_at", { ascending: false });
      
      recentProbes?.forEach((p: any) => {
        probeCountPerSymbol6h.set(p.symbol, (probeCountPerSymbol6h.get(p.symbol) || 0) + 1);
        // Track most recent probe timestamp per symbol
        if (!lastProbeTimestampPerSymbol.has(p.symbol)) {
          lastProbeTimestampPerSymbol.set(p.symbol, p.opened_at);
        }
      });
      if (probeCountPerSymbol6h.size > 0) {
        logger.info(`${LOG_CATEGORIES.GATE} Probe cascade protection: ${[...probeCountPerSymbol6h.entries()].map(([s, c]) => `${s}=${c}`).join(', ')}`);
      }
    }
    
    // Helper: Check if enough bars have passed since last probe for a symbol
    // MIN_BARS_BETWEEN_PROBES = 3, using 15m bars → 45 minutes minimum gap
    const MIN_BARS_MS = STOCHRSI_RUNWAY_GATE.DEEP_EXHAUSTION_COMPOUND.MIN_BARS_BETWEEN_PROBES * 15 * 60 * 1000;
    function isProbeBarCooldownActive(sym: string): boolean {
      const lastTs = lastProbeTimestampPerSymbol.get(sym);
      if (!lastTs) return false;
      const elapsed = Date.now() - new Date(lastTs).getTime();
      return elapsed < MIN_BARS_MS;
    }

    // ============= DYNAMIC ENTRY WINDOW HELPER =============
    // Returns adaptive StochRSI K threshold based on ADX slope
    function getDynamicThreshold(
      config: { DEFAULT_K: number; STRONG_TREND_K: number; MODERATE_TREND_K: number; STRONG_SLOPE: number; MODERATE_SLOPE: number; MIN_ADX: number },
      currentAdx: number,
      currentAdxSlope: number
    ): number {
      if (!DYNAMIC_ENTRY_WINDOW.ENABLED || currentAdx < config.MIN_ADX) return config.DEFAULT_K;
      if (currentAdxSlope >= config.STRONG_SLOPE) return config.STRONG_TREND_K;
      if (currentAdxSlope >= config.MODERATE_SLOPE) return config.MODERATE_TREND_K;
      return config.DEFAULT_K;
    }

    // ============= RISK SCORE HELPER =============
    // Maps cumulative risk score to position multiplier (null = reject)
    function riskScoreToMultiplier(score: number): number | null {
      if (!RISK_SCORE_SCALING.ENABLED) return null;
      if (score >= RISK_SCORE_SCALING.REJECTION_THRESHOLD) return null;
      const clampedScore = Math.max(0, Math.min(score, 3));
      return RISK_SCORE_SCALING.SCORE_MULTIPLIER_MAP[clampedScore] ?? 0.35;
    }

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
    const fetchHistoricalKlines = async (symbol: string): Promise<{ prices: number[]; volumes: number[]; klines: any[]; livePrice: number }> => {
      try {
        const klines = await getKlines(symbol, "15m", 55);
        // HYBRID CANDLE SEPARATION: Use closed candles for indicator data
        const closedKlines = klines.length > 1 ? klines.slice(0, -1) : klines;
        const liveCandle = klines[klines.length - 1];
        const livePrice = parseFloat(liveCandle?.[4] ?? '0');
        const { closes, volumes } = parseKlinePrices(closedKlines);
        return {
          prices: closes,
          volumes: volumes,
          klines: closedKlines,  // Closed kline data for order flow analysis
          livePrice,
        };
      } catch (error) {
        logger.forSymbol(symbol).error(`Failed to fetch klines: ${error}`);
        return { prices: [], volumes: [], klines: [], livePrice: 0 };
      }
    };

    // Fetch 5m klines for LTF micro-momentum analysis (DB-cached by kline-collector)
    const fetchLtfKlines = async (symbol: string): Promise<{ klines5m: any[]; prices5m: number[]; klines1m: any[]; prices1m: number[]; rawKlines5m: any[]; rawPrices5m: number[] }> => {
      try {
        const [klines5m, klines1m] = await Promise.all([
          getKlines(symbol, "5m", 100),
          getKlines(symbol, "1m", 60),
        ]);
        const closed5m = klines5m.length > 1 ? klines5m.slice(0, -1) : klines5m;
        const closed1m = klines1m.length > 1 ? klines1m.slice(0, -1) : klines1m;
        return {
          klines5m: closed5m,
          prices5m: closed5m.map((k: any) => parseFloat(k[4])),
          klines1m: closed1m,
          prices1m: closed1m.map((k: any) => parseFloat(k[4])),
          // RAW klines INCLUDING live candle — for tactical trap detection (wick rejection, sweep)
          rawKlines5m: klines5m,
          rawPrices5m: klines5m.map((k: any) => parseFloat(k[4])),
        };
      } catch (error) {
        logger.forSymbol(symbol).debug(`Failed to fetch LTF klines: ${error}`);
        return { klines5m: [], prices5m: [], klines1m: [], prices1m: [], rawKlines5m: [], rawPrices5m: [] };
      }
    };

    // Fetch market data in parallel using shared Binance utilities - use filtered activeSymbols
    const symbolsList = activeSymbols.map((s) => s.symbol);
    const [marketDataResults, historicalResults, ltfResults] = await Promise.all([
      Promise.all(symbolsList.map(async (symbol) => {
        try {
          return await get24hrTicker(symbol);
        } catch { return null; }
      })),
      Promise.all(symbolsList.map(async (symbol) => ({ symbol, data: await fetchHistoricalKlines(symbol) }))),
      Promise.all(symbolsList.map(async (symbol) => ({ symbol, data: await fetchLtfKlines(symbol) }))),
    ]);

    const marketDataMap = new Map(marketDataResults.filter(Boolean).map((d) => [d.symbol, d]));
    const historicalDataMap = new Map<string, { prices: number[]; volumes: number[]; klines: any[]; livePrice: number }>();
    historicalResults.forEach(({ symbol, data }) => historicalDataMap.set(symbol, data));
    const ltfDataMap = new Map<string, { klines5m: any[]; prices5m: number[]; klines1m: any[]; prices1m: number[]; rawKlines5m: any[]; rawPrices5m: number[] }>();
    ltfResults.forEach(({ symbol, data }) => ltfDataMap.set(symbol, data));

    // Fetch trend data in PARALLEL for eligible symbols (already filtered by win rate)
    const eligibleSymbols = symbolsList.filter((symbol) => {
      const count = openTradesPerSymbol.get(symbol) || 0;
      return !existingSignalsSet.has(symbol) && count < riskParams.max_trades_per_symbol;
    });

    logger.info(`${LOG_CATEGORIES.SIGNAL} Fetching trend data for ${eligibleSymbols.length} eligible symbols (after win rate filter)`);

    // Bounded parallel fetch with concurrency limit to balance speed vs Binance rate limits
    // Concurrency 3 reduces ~10s sequential to ~4-5s while staying under API limits
    const TREND_CONCURRENCY = 3;
    const TREND_FETCH_DELAY_MS = 100; // Small delay between batch starts
    
    const trendResults: { symbol: string; trendData: any }[] = [];
    
    // Process in batches of TREND_CONCURRENCY
    for (let batchStart = 0; batchStart < eligibleSymbols.length; batchStart += TREND_CONCURRENCY) {
      const batch = eligibleSymbols.slice(batchStart, batchStart + TREND_CONCURRENCY);
      
      // Add delay between batches (skip first)
      if (batchStart > 0) {
        await new Promise(resolve => setTimeout(resolve, TREND_FETCH_DELAY_MS));
      }
      
      const batchResults = await Promise.all(
        batch.map(async (symbol) => {
          try {
            const { data, error } = await supabase.functions.invoke("calculate-trend", { body: { symbol } });
            return { symbol, trendData: error ? null : data };
          } catch (err) {
            logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.BINANCE} Trend fetch failed: ${err}`);
            return { symbol, trendData: null };
          }
        })
      );
      
      trendResults.push(...batchResults);
    }

    const trendDataMap = new Map<string, any>();
    trendResults.forEach(({ symbol, trendData }) => {
      if (trendData) trendDataMap.set(symbol, trendData);
    });

    logger.success(`Got trend data for ${trendDataMap.size} symbols`);
    
    // Mark end of data fetching phase for per-phase timing
    const dataFetchEndMs = Date.now();
    logger.info(`⏱️ Data fetch phase: ${dataFetchEndMs - cycleStartMs}ms`);

    // ============= CACHE TREND SNAPSHOTS FOR FRONTEND (ATOMIC) =============
    // Upsert full calculate-trend response + extracted summary columns into trend_snapshots
    // Frontend reads this instead of calling calculate-trend directly (eliminates Binance geo-block)
    // AWAITED: Ensures all snapshots are written atomically before proceeding
    const snapshotUpserts = Array.from(trendDataMap.entries()).map(([sym, td]) => ({
      user_id: userId,
      symbol: sym,
      snapshot_data: td,
      recorded_at: new Date().toISOString(),
      // Extracted summary columns for indexed queryability
      primary_trend: td?.primaryTrend ?? null,
      is_aligned: td?.isAligned ?? null,
      momentum_state: td?.momentum?.state ?? null,
      regime: td?.regime ?? td?.marketRegime ?? null,
      adx: td?.volatility?.adx ?? null,
      macd_histogram: td?.momentum?.macdHistogram ?? td?.timeframes?.["1h"]?.indicators?.macdHistogram ?? null,
    }));
    if (snapshotUpserts.length > 0) {
      const { error: snapshotError } = await supabase
        .from("trend_snapshots")
        .upsert(snapshotUpserts, { onConflict: "user_id,symbol" });
      if (snapshotError) {
        logger.warn(`⚠️ Failed to upsert trend snapshots: ${snapshotError.message}`);
      } else {
        logger.info(`📸 Cached ${snapshotUpserts.length} trend snapshots for frontend (atomic)`);
      }
    }

    // Collect effective regime per symbol for batch snapshot update after the loop
    // Initialize ALL active symbols as EARLY_BLOCK — the 4-state classifier overwrites
    // with the actual regime when reached. Any symbol that exits before classification
    // retains EARLY_BLOCK (deterministic terminal state, not NULL ambiguity).
    const symbolRegimeMap = new Map<string, string>();
    // Collect order flow analysis + price closes for batch snapshot update (cached Order Flow dashboard)
    const symbolOrderFlowMap = new Map<string, { orderFlow: OrderFlowAnalysis; closes: number[]; direction: "long" | "short"; directionSource: string }>();
    // Collect LTF micro momentum data for batch snapshot update (LTF dashboard)
    const symbolLtfMicroMap = new Map<string, { score5m: number; direction5m: string; score1m: number; direction1m: string; ltfAlignment: number; entryTimingScore: number; microTrendConfirms: boolean; recentCandlePattern: string; isAccelerating5m: boolean; isReverting1m: boolean }>();
    // Collect micro exhaustion data for batch snapshot update (Exhaustion dashboard)
    const symbolMicroExhaustionMap = new Map<string, { score: number; detected: boolean; recommendation: string; positionMultiplier: number; momentumDecay: boolean; accelerationFlip: boolean; priceDivergence: boolean; signals: string[] }>();
    // Collect liquidity trap data for batch snapshot update (Trap dashboard)
    const symbolLiquidityTrapMap = new Map<string, { score: number; detected: boolean; trapType: string; recommendation: string; positionMultiplier: number; signals: string[]; wickRejection: boolean; volumeSpikeReversal: boolean; priceRejection: boolean; sweepDetected: boolean; trapDirection: string }>();
    for (const { symbol } of activeSymbols) {
      symbolRegimeMap.set(symbol, 'EARLY_BLOCK');
    }

    // ============= OVERSOLD EVENT STUDY TRACKING =============
    // Records oversold rejection events for forward return analysis (bounce tracking)
    // Uses 6h cooldown per symbol to prevent event clustering bias
    const OVERSOLD_EVENT_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours
    const oversoldEventCooldownCache = new Map<string, boolean>();
    
    const trackOversoldEvent = async (
      sym: string,
      gateType: string,
      stochK: number,
      adxVal: number,
      adxSlopeVal: number,
      momScore: number,
      regimeVal: string,
      trendVal: string,
      price: number,
      atrVal: number,
      skipStochFilter: boolean = false
    ) => {
      try {
        // Skip if K >= 15 for stoch-based gates; location-based gates (NEAR_24H_LOW) bypass this filter
        if (!skipStochFilter && stochK >= 15) return;
        
        // 6h cooldown dedup check
        const cacheKey = `${sym}_oversold`;
        if (oversoldEventCooldownCache.has(cacheKey)) return;
        
        // Check DB for recent events (6h window)
        const cutoff = new Date(Date.now() - OVERSOLD_EVENT_COOLDOWN_MS).toISOString();
        const { data: recentEvents } = await supabase
          .from('oversold_event_study')
          .select('id')
          .eq('user_id', userId)
          .eq('symbol', sym)
          .gte('event_time', cutoff)
          .limit(1);
        
        if (recentEvents && recentEvents.length > 0) {
          oversoldEventCooldownCache.set(cacheKey, true);
          return;
        }
        
        // Calculate shadow trade parameters (hypothetical LONG probe)
        const shadowStopLoss = price * (1 - (atrVal > 0 ? (1.2 * atrVal / price) : 0.012));
        const shadowTakeProfit = price * (1 + (atrVal > 0 ? (1.5 * atrVal / price) : 0.015));
        
        const { error } = await supabase.from('oversold_event_study').insert({
          user_id: userId,
          symbol: sym,
          event_time: new Date().toISOString(),
          price,
          stoch_k: stochK,
          adx: adxVal,
          adx_slope: adxSlopeVal,
          momentum_score: momScore,
          regime: regimeVal,
          primary_trend: trendVal,
          gate_name: gateType,
          shadow_entry_price: price,
          shadow_sl: shadowStopLoss,
          shadow_tp: shadowTakeProfit,
        });
        
        if (error) {
          logger.warn(`⚠️ Failed to track oversold event for ${sym}: ${error.message}`);
        } else {
          logger.forSymbol(sym).info(`📊 OVERSOLD_EVENT_STUDY: Tracked K=${stochK.toFixed(1)}, gate=${gateType}, price=${price.toFixed(2)}`);
          oversoldEventCooldownCache.set(cacheKey, true);
        }
      } catch (e) {
        // Non-critical — don't break the pipeline
        logger.warn(`⚠️ Oversold event tracking error for ${sym}: ${e}`);
      }
    };

    // ============= PRE-COMPUTE ORDER FLOW FOR ALL SYMBOLS =============
    // Must happen BEFORE the main analysis loop because early gates (POSITION_DEDUPLICATION,
    // EXISTING_SIGNAL, MAX_TRADES_PER_SYMBOL) use `continue` and skip the order flow caching.
    // Without this, symbols blocked by those gates would never appear in the Order Flow dashboard.
    for (const { symbol } of activeSymbols) {
      const trendData = trendDataMap.get(symbol);
      const historicalData = historicalDataMap.get(symbol);
      if (!trendData || !historicalData) {
        logger.forSymbol(symbol).info(`📊 ORDER_FLOW_PRECOMPUTE: skipped — trendData=${!!trendData}, historicalData=${!!historicalData}`);
        continue;
      }
      
      const trend = trendData.primaryTrend || "neutral";
      const direction: "long" | "short" = trend === "bearish" ? "short" : "long";
      const klines = historicalData.klines || [];
      
      if (klines.length >= 30) {
        const orderFlowResult = analyzeOrderFlow(klines, direction);
        if (orderFlowResult) {
          const closes = klines.slice(-50).map((k: any) => parseFloat(k[4]));
          symbolOrderFlowMap.set(symbol, {
            orderFlow: orderFlowResult,
            closes,
            direction,
            directionSource: "strategy-analyzer"
          });
        } else {
          logger.forSymbol(symbol).debug(`📊 ORDER_FLOW_PRECOMPUTE: analyzeOrderFlow returned null`);
        }
      } else {
        logger.forSymbol(symbol).debug(`📊 ORDER_FLOW_PRECOMPUTE: insufficient klines (${klines.length} < 30)`);
      }
    }
    logger.info(`📊 Pre-computed order flow for ${symbolOrderFlowMap.size}/${activeSymbols.length} symbols`);

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
      // NEW: ADX Early Trend Ignition (strong directional bias confluence bypass)
      | 'EARLY_TREND_IGNITION'
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
      | 'COMPRESSION_NO_SETUP'
      | 'COMPRESSION_MICRO_OVERRIDE'
      | 'BREAKOUT_WATCH'
      | 'TREND_EXHAUSTION_CONTINUATION_BLOCK'
      // Fix #3: Capitulation acceleration override
      | 'CAPITULATION_ACCELERATION'
      // Error alerting: symbol-level exceptions during analysis
      | 'ANALYZER_ERROR'
      // Dead-momentum-chasing prevention
      | 'WORSE_PRICE_REENTRY_BLOCK'
      | 'SAME_DIRECTION_STACKING'
      // SIMPLIFIED PIPELINE gates
      | 'ADX_NO_ENERGY'
      | 'NO_DIRECTION'
      | 'MOMENTUM_STRONGLY_OPPOSING'
      | 'VERY_LOW_QUALITY'
      | 'UNKNOWN';
    
    const perSymbolGateAttribution = new Map<string, { gate: GateType; details: string }>();
    const rejectionBuffer = new RejectionBuffer();
    activeRejectionBuffer = rejectionBuffer; // Enable batch mode for logRejectionWithAI
    
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
      } else if (adx >= ADX_THRESHOLDS.PARABOLIC) {
        // NEW PHASE 2: Ultra-strong ADX (≥50) = ADX IS the quality confirmation
        // Very high trend strength proves the trade, lower threshold to 55
        baseThreshold = QUALITY_THRESHOLDS.ULTRA_STRONG_ADX_MIN;
      } else if (adx >= ADX_THRESHOLDS.EXHAUSTION) {
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
      const hasTrendEvidence = adxRising || adx >= ADX_THRESHOLDS.ABSOLUTE_FLOOR;
      
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

    // ============= PRE-FETCH REGIME HISTORY FOR PERSISTENCE + AGE DECAY =============
    // Query regime entries per symbol: 3 for persistence, up to 60 for age decay
    const regimeHistoryBySymbol = new Map<string, { regime: string }[]>();
    const regimeAgeBySymbol = new Map<string, number>();  // Consecutive candles in current effective regime
    try {
      const symbolNames = activeSymbols.map(s => s.symbol);
      const maxRowsPerSymbol = FOUR_STATE_REGIME.REGIME_AGE_DECAY.ENABLED ? 60 : 3;
      const { data: regimeRows } = await supabase
        .from('market_regime_history')
        .select('symbol, regime, effective_regime, recorded_at')
        .eq('user_id', userId)
        .in('symbol', symbolNames)
        .order('recorded_at', { ascending: false })
        .limit(symbolNames.length * maxRowsPerSymbol);
      
      if (regimeRows) {
        for (const row of regimeRows) {
          // Persistence uses raw regime (first 3 per symbol)
          const existing = regimeHistoryBySymbol.get(row.symbol) || [];
          if (existing.length < 3) {
            existing.push({ regime: row.regime });
            regimeHistoryBySymbol.set(row.symbol, existing);
          }
        }
        
        // Age decay: count consecutive candles in same effective regime
        if (FOUR_STATE_REGIME.REGIME_AGE_DECAY.ENABLED) {
          for (const sym of symbolNames) {
            const symbolRows = regimeRows.filter(r => r.symbol === sym);
            if (symbolRows.length === 0) continue;
            const currentEffective = symbolRows[0].effective_regime;
            let consecutiveCount = 0;
            for (const row of symbolRows) {
              if (row.effective_regime === currentEffective) {
                consecutiveCount++;
              } else {
                break;
              }
            }
            regimeAgeBySymbol.set(sym, consecutiveCount);
          }
        }
      }
    } catch (err) {
      logger.warn(`Failed to fetch regime history for persistence: ${err}`);
    }

    // ===== REGIME PERSISTENCE COUNTERS =====
    // Lightweight metrics for behavioral validation without log spam
    let regimeEvaluations = 0;
    let regimeTransitionsAttempted = 0;
    let regimeTransitionsBlocked = 0;
    let regimeTransitionsConfirmed = 0;

    // Track executions across the loop (immediate execution model)
    let executedSignals = 0;

    // Analyze each symbol (using filtered activeSymbols that passed win rate check)
    for (const { symbol } of activeSymbols) {
      const currentTradeCount = openTradesPerSymbol.get(symbol) || 0;

      if (existingSignalsSet.has(symbol)) {
        perSymbolGateAttribution.set(symbol, { gate: 'EXISTING_SIGNAL', details: 'Active signal from last minute' });
        rejectionBuffer.add({
          user_id: userId, symbol,
          rejection_reason: "Already has active signal from last minute",
          filters_status: { currentTradeCount },
        });
        continue;
      }

      if (currentTradeCount >= riskParams.max_trades_per_symbol) {
        perSymbolGateAttribution.set(symbol, { gate: 'MAX_TRADES_PER_SYMBOL', details: `${currentTradeCount}/${riskParams.max_trades_per_symbol} active` });
        rejectionBuffer.add({
          user_id: userId, symbol,
          rejection_reason: `Max trades per symbol reached: ${currentTradeCount}/${riskParams.max_trades_per_symbol} trades active`,
          filters_status: { currentTradeCount, maxTradesPerSymbol: riskParams.max_trades_per_symbol },
        });
        continue;
      }

      // ============= SAME-DIRECTION STACKING PREVENTION =============
      // Prevent opening 2 positions in the SAME direction on the same symbol
      // After "dead momentum chasing" analysis: stacking 2 shorts doubled losses
      if (SAME_DIRECTION_STACKING_PREVENTION.ENABLED && currentTradeCount >= 1) {
        const activeForSymbol = activePositions?.filter(p => p.symbol === symbol && p.status === 'active') || [];
        const activeSides = new Set(activeForSymbol.map(p => p.side?.toLowerCase()));
        // We'll check this later after direction derivation - store for now
        // (can't check yet because derivedDirection isn't known at this point)
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
        
        rejectionBuffer.add({
          user_id: userId, 
          symbol,
          rejection_reason: `POSITION_DEDUPLICATION: ${recentPosition.status} position within 30-minute window`,
          filters_status: { 
            recentPositionId: recentPosition.id,
            recentPositionStatus: recentPosition.status,
            recentPositionSide: recentPosition.side,
            openedMinutesAgo: openedAgo,
            deduplicationWindowMinutes: 30,
            gate: 'POSITION_DEDUPLICATION'
          },
        });
        continue;
      }

      // ============= PHASE 10: SAME-DIRECTION RE-ENTRY COOLDOWN =============
      // Expert insight: "When a trade closes due to timeout or trailing stop, the trend pauses"
      // Block same-direction entries for 45 minutes after ANY close
      // Enhanced after "dead momentum chasing" analysis: ALL close reasons now trigger cooldown
      let sameDirectionCooldownActive = false;
      let cooldownSide: string | null = null;
      let lastExitPrice: number | null = null;
      let lastExitSide: string | null = null;
      
      if (SAME_DIRECTION_REENTRY_PROTECTION.ENABLED) {
        const cooldownCutoff = new Date(Date.now() - SAME_DIRECTION_REENTRY_PROTECTION.COOLDOWN_MINUTES * 60 * 1000).toISOString();
        
        const { data: recentTimeoutClose } = await supabase
          .from('positions')
          .select('id, side, close_reason, closed_at, symbol, exit_price')
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
          lastExitPrice = recentClose.exit_price;
          lastExitSide = recentClose.side;
          
          if (SAME_DIRECTION_REENTRY_PROTECTION.LOG_BLOCKS) {
            logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} ⏳ SAME_DIRECTION_COOLDOWN: ${symbol} | ${recentClose.close_reason} closed ${closedMinutesAgo}min ago | Blocking ${cooldownSide === 'sell' ? 'SHORT' : 'LONG'} for ${SAME_DIRECTION_REENTRY_PROTECTION.COOLDOWN_MINUTES - closedMinutesAgo}min`);
          }
        }
      }
      
      // === WORSE-PRICE RE-ENTRY PROTECTION ===
      // Fetch last exit price for worse-price check (separate from cooldown, longer lookback)
      if (SAME_DIRECTION_REENTRY_PROTECTION.WORSE_PRICE_BLOCK_ENABLED && !lastExitPrice) {
        const worsePriceCutoff = new Date(Date.now() - SAME_DIRECTION_REENTRY_PROTECTION.WORSE_PRICE_LOOKBACK_MINUTES * 60 * 1000).toISOString();
        const { data: recentExits } = await supabase
          .from('positions')
          .select('side, exit_price, closed_at')
          .eq('user_id', userId)
          .eq('symbol', symbol)
          .eq('status', 'closed')
          .not('exit_price', 'is', null)
          .gte('closed_at', worsePriceCutoff)
          .order('closed_at', { ascending: false })
          .limit(1);
        
        if (recentExits && recentExits.length > 0) {
          lastExitPrice = recentExits[0].exit_price;
          lastExitSide = recentExits[0].side;
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
        symbolRegimeMap.set(symbol, 'ERROR');
        continue;
      }

      try {
        const { primaryTrend: trend, confidence, trueAlignment, isAligned, timeframes } = trendData;
        const trendConsistency = trueAlignment?.score || 0;
        
        // ============= MARKET FEATURE SNAPSHOT (SINGLE EXTRACTION POINT) =============
        // Build once per symbol — all gates read from this snapshot.
        // NOTE: smartMomentum is injected into trendData later, so snapshot.smartMomentum
        // will be undefined at this point. It gets populated after earlySmartMomentum calculation.
        const mfs = buildMarketFeatureSnapshot(symbol, trendData);
        
        // AUTHORITATIVE ADX SOURCE: Read from snapshot (1h CLOSED candles via calculate-trend)
        const adx = mfs.adx;
        const adxSlope = mfs.adxSlope;
        const adxRising = mfs.adxRising;
        
        // ============= MFS COMPATIBILITY SHIM =============
        // All downstream code reads from these MFS-backed aliases instead of raw trendData.
        // Fields NOT in MFS (klines15m, klines30m, klines4h, volumeZScore) remain as trendData.
        const momentum = {
          state: mfs.momentumState,
          score: mfs.momentumScore,
          prevScore: mfs.prevMomentumScore,
          confirms: mfs.momentumConfirms,
          macdExpanding: mfs.macdExpanding,
          macdStrong: mfs.macdStrong,
          macdHistogram: mfs.macdHistogram,
          macdDirectionAligned: mfs.macdDirectionAligned,
          hasDivergence: mfs.hasDivergence,
          divergence: mfs.hasDivergence,
          volumeConfirms: mfs.volumeConfirms,
          adxRising: mfs.adxRisingMomentum,
          fakeBreakoutRisk: mfs.fakeBreakoutRisk,
          genuineMomentum: mfs.genuineMomentum,
          consecutiveBars1h: mfs.consecutiveBars1h,
          consecutiveBars15m: mfs.consecutiveBars15m,
          consecutiveBars30m: mfs.consecutiveBars30m,
          directionStableBars: mfs.directionStableBars,
          direction: mfs.momentumDirection,
          prevMacdHistogram: mfs.prevMacdHistogram,
          // Fields not directly in MFS — read from raw trendData with fallbacks
          lastCloseAlignsWithTrend: trendData.momentum?.lastCloseAlignsWithTrend ?? false,
          rsi: trendData.momentum?.rsi ?? 50,
          adx: mfs.adx,
          adxSlope: mfs.adxSlope,
        };
        
        // MFS-backed sub-object aliases (replaces direct trendData access)
        const microTrend = mfs.microTrend;
        const stealthTrend = mfs.stealthTrend;
        const priceDistanceFromSwing = {
          distanceFromHighPercent: mfs.distanceFromHighPercent,
          distanceFromLowPercent: mfs.distanceFromLowPercent,
          atrNormalizedFromHigh: mfs.atrNormalizedFromHigh,
          atrNormalizedFromLow: mfs.atrNormalizedFromLow,
          high24h: mfs.high24h,
          low24h: mfs.low24h,
        };
        const priceActionMomentumData = mfs.priceActionMomentum;
        
        // ============= ENHANCED TRUE ALIGNMENT FIELDS (v2.0) =============
        // Read from snapshot for consistency
        const tf4hConfidence = mfs.trueAlignment.tf4hConfidence;
        const tf1hConfidence = mfs.trueAlignment.tf1hConfidence;
        const adxContribution = mfs.trueAlignment.adxContribution;
        const totalWeightedConfidence = mfs.trueAlignment.totalWeightedConfidence;
        const weightedComponents = mfs.trueAlignment.weightedComponents;
        const neutralCapped = mfs.trueAlignment.neutralCapped;
        const alignmentBreakdown = mfs.trueAlignment.breakdown;
        
        // Log enhanced alignment data for visibility
        if (Object.keys(weightedComponents).length > 0) {
          logger.forSymbol(symbol).debug(`📊 TrueAlignment v2.0: score=${trendConsistency}, tf4h=${tf4hConfidence.toFixed(0)}, tf1h=${tf1hConfidence.toFixed(0)}, adxContrib=${adxContribution.toFixed(1)}${neutralCapped ? ' [CAPPED]' : ''}`);
        }
        
        // ============= NEUTRAL PERSISTENCE BONUS =============
        const neutralPersistence = mfs.neutralPersistence;
        // Derive higher timeframe data from snapshot
        const htfTrend4h = mfs.timeframes["4h"].trend || mfs.timeframes["4h"].emaSignal || "neutral";
        const htfTrend1h = mfs.timeframes["1h"].trend || mfs.timeframes["1h"].emaSignal || "neutral";

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

        // Cache order flow + price closes for frontend Order Flow dashboard (batch snapshot update)
        if (earlyOrderFlowAnalysis && klines.length >= 30) {
          const closes = klines.slice(-50).map((k: any) => parseFloat(k[4]));
          symbolOrderFlowMap.set(symbol, {
            orderFlow: earlyOrderFlowAnalysis,
            closes,
            direction: earlyIntendedDirection,
            directionSource: "strategy-analyzer"
          });
        }

        // ============= EARLY SMART MOMENTUM CALCULATION =============
        // CRITICAL PIPELINE FIX: Calculate smartMomentum BEFORE deriveTradeDirection
        // This allows the graduated momentum penalty to prevent counter-momentum direction derivation
        // Previously: momentumScore was 0 during direction derivation, penalty ineffective
        // Now: Full momentum score available → extreme momentum (+100) applies 4x penalty → blocks SHORT
        const earlyPriceData = symbolHistoricalData?.prices || [];
        const earlyATR = calculateATR(klines, 14);
        
        // Calculate 15m ADX for momentum score (local context only, NOT for gate decisions)
        // Gate decisions use trendData ADX (1h closed candles) — set above as const.
        const earlyFullAdxResult = calculateADXWithDirection(klines, 14);
        const earlyAdxSlope = earlyFullAdxResult.adxSlope ?? 0;
        const earlySmartAdxRising = earlyAdxSlope > 0 || mfs.adxRising;
        
        // Log if 15m and 1h ADX diverge significantly (diagnostic only)
        const adxDrift = Math.abs(adx - earlyFullAdxResult.adx);
        if (adxDrift > 5.0) {
          logger.forSymbol(symbol).debug(
            `${LOG_CATEGORIES.GATE} 📊 ADX_TIMEFRAME_DELTA: 1h=${adx.toFixed(1)} vs 15m=${earlyFullAdxResult.adx.toFixed(1)} (Δ=${adxDrift.toFixed(1)}) — 1h is authoritative for gates`
          );
        }
        
        // Calculate momentum score (-100 to +100) EARLY in pipeline
        // Uses 15m klines for momentum granularity, but ADX gate values remain from 1h
        const earlySmartMomentum = calculateMomentumScore(klines, earlyPriceData, adx, adxRising, earlyATR, adxSlope);
        
        // INJECT into trendData for legacy code paths that still read from it
        // deriveTradeDirection now reads from MFS directly
        trendData.smartMomentum = earlySmartMomentum;
        
        // UPDATE snapshot with smartMomentum (was unavailable at initial build)
        (mfs as any).smartMomentum = {
          score: earlySmartMomentum.score ?? 0,
          direction: earlySmartMomentum.direction ?? "neutral",
          phase: earlySmartMomentum.phase ?? "unknown",
          isAccelerating: earlySmartMomentum.isAccelerating ?? false,
          isExhausted: earlySmartMomentum.isExhausted ?? false,
          isWeakening: earlySmartMomentum.isWeakening ?? false,
          isTransitioning: earlySmartMomentum.isTransitioning ?? false,
          overextensionATR: earlySmartMomentum.overextensionATR ?? 0,
          components: earlySmartMomentum.components ? {
            macdSlope: earlySmartMomentum.components.macdSlope ?? 0,
            priceImpulse: earlySmartMomentum.components.priceImpulse ?? 0,
            emaSpreadRoC: earlySmartMomentum.components.emaSpreadRoC ?? 0,
            rsiMomentum: earlySmartMomentum.components.rsiMomentum ?? 0,
          } : undefined,
        };
        
        logger.forSymbol(symbol).debug(`📊 EARLY SMART MOMENTUM: score=${earlySmartMomentum.score.toFixed(0)} (${earlySmartMomentum.direction}) phase=${earlySmartMomentum.phase} | ADX slope=${earlyAdxSlope.toFixed(3)}, rising=${earlySmartAdxRising}`);
        const _mc = earlySmartMomentum.components;

        // ═══════════════════════════════════════════════════════════════
        // RADICAL SIMPLIFICATION: Use simplified gate pipeline
        // This bypasses the 14,000 lines of legacy gate logic below
        // and generates signals directly when conditions are met.
        // ═══════════════════════════════════════════════════════════════
        const simplifiedGateResult = evaluateProductionGates(
          mfs as any,
          earlySmartMomentum,
          symbol,
          klines,
        );
        
        if (!simplifiedGateResult.passed) {
          // Gate rejected — log and skip to next symbol
          perSymbolGateAttribution.set(symbol, { 
            gate: (simplifiedGateResult.gate || 'UNKNOWN') as GateType, 
            details: `Simplified pipeline: ${simplifiedGateResult.gate} | ADX=${adx.toFixed(1)} K=${mfs.stochRsi["1h"].k.toFixed(1)} mom=${earlySmartMomentum.score.toFixed(0)}` 
          });
          symbolRegimeMap.set(symbol, mfs.regime || 'REJECTED');
          
          rejectionBuffer.add({
            user_id: userId,
            symbol,
            rejection_reason: `SIMPLIFIED_GATE: ${simplifiedGateResult.gate}`,
            filters_status: {
              gate: simplifiedGateResult.gate,
              adx: adx.toFixed(1),
              adxSlope: adxSlope.toFixed(2),
              stochK: mfs.stochRsi["1h"].k.toFixed(1),
              momentumScore: earlySmartMomentum.score.toFixed(0),
              primaryTrend: mfs.primaryTrend,
              regime: mfs.regime,
            },
          });
          
          logger.forSymbol(symbol).info(`🚫 SIMPLIFIED GATE REJECT: ${simplifiedGateResult.gate} | ADX=${adx.toFixed(1)} slope=${adxSlope.toFixed(2)} K=${mfs.stochRsi["1h"].k.toFixed(1)} mom=${earlySmartMomentum.score.toFixed(0)} trend=${mfs.primaryTrend}`);
          continue;
        }
        
        // Gate PASSED — generate signal directly, bypass all legacy gates
        const gateDirection = simplifiedGateResult.direction!;
        const gateSignalType: 'long' | 'short' = gateDirection === 'LONG' ? 'long' : 'short';
        const gatePositionMultiplier = simplifiedGateResult.positionMultiplier;
        const gateQuality = simplifiedGateResult.qualityScore;
        const gateStrategy = simplifiedGateResult.strategyName;
        
        // Get market data for signal
        const marketDataForSignal = marketDataMap.get(symbol);
        if (!marketDataForSignal) {
          logger.forSymbol(symbol).warn(`Missing market data after gate pass`);
          continue;
        }
        const signalPrice = parseFloat(marketDataForSignal.lastPrice);
        if (!Number.isFinite(signalPrice) || signalPrice <= 0) {
          logger.forSymbol(symbol).warn(`Invalid price after gate pass: ${marketDataForSignal.lastPrice}`);
          continue;
        }
        
        // Calculate SL/TP using ATR
        const signalATR = mfs.atr || earlyATR;
        const atrPercent = signalATR / signalPrice * 100;
        
        // Dynamic SL based on ADX and position multiplier
        let slMultiplier = 1.5; // Base: 1.5x ATR
        if (adx >= 35 && adxSlope > 0) slMultiplier = 2.0; // Strong trend: wider SL
        else if (adx < 20) slMultiplier = 1.0; // Low energy: tighter SL
        
        // TP proportional to SL with risk:reward based on confidence
        let tpMultiplier = slMultiplier * 2.0; // Default 1:2 R:R
        if (gateQuality >= 70) tpMultiplier = slMultiplier * 2.5; // High quality: 1:2.5
        else if (gateQuality < 50) tpMultiplier = slMultiplier * 1.5; // Low quality: 1:1.5
        
        const slAmount = signalATR * slMultiplier;
        const tpAmount = signalATR * tpMultiplier;
        
        const signalSL = gateSignalType === 'long' 
          ? signalPrice - slAmount 
          : signalPrice + slAmount;
        const signalTP = gateSignalType === 'long' 
          ? signalPrice + tpAmount 
          : signalPrice - tpAmount;
        
        // Calculate position size
        const basePositionSize = riskParams.base_position_size_percent || 2;
        const finalPositionSize = basePositionSize * gatePositionMultiplier;
        
        // Map trend for DB
        const dbTrend = mfs.primaryTrend === 'bullish' ? 'bullish' 
          : mfs.primaryTrend === 'bearish' ? 'bearish' : 'ranging';
        
        const simplifiedSignal = {
          user_id: userId,
          symbol,
          signal_type: gateSignalType,
          trend: dbTrend as 'bullish' | 'bearish' | 'ranging',
          confidence_score: Math.round(Math.min(gateQuality, 100)),
          entry_price: signalPrice,
          stop_loss: signalSL,
          take_profit: signalTP,
          strategy_name: gateStrategy,
          reason: `Simplified Pipeline: ${gateStrategy} | ADX=${adx.toFixed(1)} Mom=${earlySmartMomentum.score.toFixed(0)} Pos=${(gatePositionMultiplier * 100).toFixed(0)}%`,
          indicators: {
            pipeline: 'SIMPLIFIED_V1',
            strategyName: gateStrategy,
            qualityScore: gateQuality,
            positionSizePercent: finalPositionSize,
            positionMultiplier: gatePositionMultiplier,
            adx: adx.toFixed(1),
            adxSlope: adxSlope.toFixed(2),
            stochRsi1h_k: mfs.stochRsi["1h"].k.toFixed(1),
            stochRsi4h_k: mfs.stochRsi["4h"]?.k?.toFixed(1) ?? 'N/A',
            momentumScore: earlySmartMomentum.score.toFixed(0),
            momentumDirection: earlySmartMomentum.direction,
            momentumPhase: earlySmartMomentum.phase,
            primaryTrend: mfs.primaryTrend,
            regime: mfs.regime,
            slAtr: slMultiplier.toFixed(1),
            tpAtr: tpMultiplier.toFixed(1),
            atrPercent: atrPercent.toFixed(3),
          },
          expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 min expiry
          created_by_rebalancer: false,
        };
        
        // Store regime for dashboard
        symbolRegimeMap.set(symbol, mfs.regime || gateStrategy);
        
        logger.forSymbol(symbol).success(
          `✅ SIMPLIFIED SIGNAL: ${gateSignalType.toUpperCase()} ${symbol} via ${gateStrategy} | ` +
          `Price=${signalPrice.toFixed(2)} SL=${signalSL.toFixed(2)} TP=${signalTP.toFixed(2)} | ` +
          `ADX=${adx.toFixed(1)} Mom=${earlySmartMomentum.score.toFixed(0)} Quality=${gateQuality} | ` +
          `Position=${(gatePositionMultiplier * 100).toFixed(0)}% (${finalPositionSize.toFixed(2)}%)`
        );
        
        // Insert signal into DB
        const { data: insertedSimplifiedSignal, error: simplifiedInsertError } = await supabase
          .from("trading_signals")
          .insert(simplifiedSignal)
          .select("id")
          .single();
        
        if (simplifiedInsertError) {
          logger.forSymbol(symbol).error(`Simplified signal insert error: ${simplifiedInsertError.message}`);
          continue;
        }
        
        if (insertedSimplifiedSignal) {
          const signalWithId = { ...simplifiedSignal, id: insertedSimplifiedSignal.id };
          signals.push(signalWithId);
          totalSignalsGenerated++;
          existingSignalsSet.add(symbol);
          
          // IMMEDIATE EXECUTION
          if (riskParams.auto_execute_signals) {
            try {
              const execStartMs = Date.now();
              const { error: executeError } = await supabase.functions.invoke("execute-trade", {
                headers: { "x-user-id": userId },
                body: { signalId: insertedSimplifiedSignal.id, action: "execute" },
              });
              const execLatencyMs = Date.now() - execStartMs;
              if (!executeError) {
                executedSignals++;
                logger.forSymbol(symbol).success(`⚡ Immediately executed (${execLatencyMs}ms latency)`);
              } else {
                logger.forSymbol(symbol).error(`Immediate execution failed: ${executeError}`);
              }
            } catch (execErr) {
              logger.forSymbol(symbol).error(`Immediate execution error: ${execErr}`);
            }
          }
        }
        
        continue; // Skip ALL legacy gate logic — signal already generated

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.forSymbol(symbol).error(`Error analyzing: ${errorMsg}`);
        // Log to signal_rejection_log so ANALYZER_ERROR is visible in the dashboard
        rejectionBuffer.add({
          user_id: userId,
          symbol,
          rejection_reason: `ANALYZER_ERROR: ${errorMsg.substring(0, 200)}`,
          filters_status: { gate: 'ANALYZER_ERROR', error: errorMsg.substring(0, 500) },
        });
        perSymbolGateAttribution.set(symbol, { gate: 'ANALYZER_ERROR' as GateType, details: errorMsg.substring(0, 80) });
      }
    }

    // NOTE: Signals are now executed IMMEDIATELY after generation inside the symbol loop above.
    // This eliminates the latency gap where signals waited for all symbols to finish analysis.
    // The old batch-execution block has been removed.

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
      
      // ===== EXPANSION EPISODE SUMMARY =====
      // Track how many symbols are in expansion/breakout regimes and what's blocking them
      const expansionSymbols: string[] = [];
      const breakoutSymbols: string[] = [];
      symbolRegimeMap.forEach((regime, sym) => {
        if (regime === 'TREND_EXPANSION') expansionSymbols.push(sym);
        if (regime === 'BREAKOUT_SETUP') breakoutSymbols.push(sym);
      });
      
      if (expansionSymbols.length > 0 || breakoutSymbols.length > 0) {
        const blockedExpansions = expansionSymbols.filter(s => perSymbolGateAttribution.has(s));
        const blockedBreakouts = breakoutSymbols.filter(s => perSymbolGateAttribution.has(s));
        
        logger.info(`🔬 EXPANSION_SUMMARY: expansion=${expansionSymbols.length}(blocked=${blockedExpansions.length}) breakout=${breakoutSymbols.length}(blocked=${blockedBreakouts.length})`);
        
        // Detail which gates block expansion entries
        for (const sym of [...blockedExpansions, ...blockedBreakouts]) {
          const gate = perSymbolGateAttribution.get(sym);
          if (gate) {
            logger.warn(`🔬 EXPANSION_BLOCKED: ${sym} regime=${symbolRegimeMap.get(sym)} blocked_by=${gate.gate} details=${gate.details || '-'}`);
          }
        }
        
        if (blockedExpansions.length === expansionSymbols.length && expansionSymbols.length > 0) {
          logger.warn(`🔬 ⚠️ ZERO_CAPTURE_ALERT: ALL ${expansionSymbols.length} expansion symbols blocked — 0% capture rate this cycle`);
        }
      }
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
    
    // ============= BATCH UPDATE REGIME COLUMN IN TREND SNAPSHOTS =============
    // The regime is computed per-symbol AFTER the initial snapshot upsert,
    // so we batch-update the regime column here after the per-symbol loop completes
    if (symbolRegimeMap.size > 0) {
      const regimeUpdatePromises = Array.from(symbolRegimeMap.entries()).map(([sym, regime]) => {
        // For EARLY_BLOCK/ERROR symbols, store the specific gate name as block_reason
        const gateAttribution = perSymbolGateAttribution.get(sym);
        const block_reason = regime === 'EARLY_BLOCK' || regime === 'ERROR'
          ? (gateAttribution?.gate ?? null)
          : null;  // Classified symbols have no block reason
        return supabase
          .from("trend_snapshots")
          .update({ regime, block_reason })
          .eq("user_id", userId)
          .eq("symbol", sym);
      });
      const regimeResults = await Promise.all(regimeUpdatePromises);
      const regimeErrors = regimeResults.filter(r => r.error);
      if (regimeErrors.length > 0) {
        logger.warn(`⚠️ Failed to update regime for ${regimeErrors.length}/${symbolRegimeMap.size} symbols`);
      } else {
        logger.info(`🏷️ Updated regime column in trend_snapshots for ${symbolRegimeMap.size} symbols`);
      }
    }

    // ============= BATCH UPDATE ORDER FLOW DATA IN TREND SNAPSHOTS =============
    // Stores pre-computed order flow metrics + price closes for the frontend Order Flow dashboard
    // Frontend reads this instead of calling fetch-klines → Binance API (eliminates latency)
    if (symbolOrderFlowMap.size > 0) {
      const orderFlowUpdatePromises = Array.from(symbolOrderFlowMap.entries()).map(([sym, data]) => {
        // Read existing snapshot_data to merge (don't overwrite trend data)
        return supabase
          .from("trend_snapshots")
          .select("snapshot_data")
          .eq("user_id", userId)
          .eq("symbol", sym)
          .single()
          .then(({ data: existing }) => {
            const existingData = (existing?.snapshot_data as Record<string, unknown>) || {};
            const mergedData = {
              ...existingData,
              orderFlow: {
                volumeSpike: data.orderFlow.volumeSpike,
                priceRejection: data.orderFlow.priceRejection,
                pressure: data.orderFlow.pressure,
                score: data.orderFlow.score,
                signal: data.orderFlow.signal,
                confidence: data.orderFlow.confidence,
                reasons: data.orderFlow.reasons,
                intendedDirection: data.direction,
                directionSource: data.directionSource,
              },
              correlationCloses: data.closes, // Last 50 1H closes for live correlation matrix
            };
            return supabase
              .from("trend_snapshots")
              .update({ snapshot_data: mergedData })
              .eq("user_id", userId)
              .eq("symbol", sym);
          });
      });
      const orderFlowResults = await Promise.all(orderFlowUpdatePromises);
      const orderFlowErrors = orderFlowResults.filter(r => r?.error);
      if (orderFlowErrors.length > 0) {
        logger.warn(`⚠️ Failed to cache order flow for ${orderFlowErrors.length}/${symbolOrderFlowMap.size} symbols`);
      } else {
        logger.info(`📊 Cached order flow data in trend_snapshots for ${symbolOrderFlowMap.size} symbols`);
      }
    }

    // ============= BATCH UPDATE LTF MICRO DATA IN TREND SNAPSHOTS =============
    // Uses RPC-free jsonb_set via raw update to avoid read+write per symbol
    if (symbolLtfMicroMap.size > 0) {
      const ltfMicroUpdatePromises = Array.from(symbolLtfMicroMap.entries()).map(([sym, data]) => {
        return supabase.rpc('jsonb_set_snapshot_field' as any, {
          p_user_id: userId,
          p_symbol: sym,
          p_field: 'ltfMicroMomentum',
          p_value: data,
        }).then((result: any) => {
          if (result.error) {
            // Fallback to read+write if RPC doesn't exist
            return supabase
              .from("trend_snapshots")
              .select("snapshot_data")
              .eq("user_id", userId)
              .eq("symbol", sym)
              .single()
              .then(({ data: existing }) => {
                const existingData = (existing?.snapshot_data as Record<string, unknown>) || {};
                const mergedData = { ...existingData, ltfMicroMomentum: data };
                return supabase
                  .from("trend_snapshots")
                  .update({ snapshot_data: mergedData })
                  .eq("user_id", userId)
                  .eq("symbol", sym);
              });
          }
          return result;
        });
      });
      const ltfResults = await Promise.all(ltfMicroUpdatePromises);
      const ltfErrors = ltfResults.filter(r => r?.error);
      if (ltfErrors.length > 0) {
        logger.warn(`⚠️ Failed to cache LTF micro for ${ltfErrors.length}/${symbolLtfMicroMap.size} symbols`);
      } else {
        logger.info(`🔬 Cached LTF micro momentum in trend_snapshots for ${symbolLtfMicroMap.size} symbols`);
      }
    }

    // ============= BATCH UPDATE MICRO EXHAUSTION DATA IN TREND SNAPSHOTS =============
    if (symbolMicroExhaustionMap.size > 0) {
      const exhUpdatePromises = Array.from(symbolMicroExhaustionMap.entries()).map(([sym, data]) => {
        return supabase.rpc('jsonb_set_snapshot_field' as any, {
          p_user_id: userId,
          p_symbol: sym,
          p_field: 'microExhaustion',
          p_value: data,
        }).then((result: any) => {
          if (result.error) {
            return supabase
              .from("trend_snapshots")
              .select("snapshot_data")
              .eq("user_id", userId)
              .eq("symbol", sym)
              .single()
              .then(({ data: existing }) => {
                const existingData = (existing?.snapshot_data as Record<string, unknown>) || {};
                const mergedData = { ...existingData, microExhaustion: data };
                return supabase
                  .from("trend_snapshots")
                  .update({ snapshot_data: mergedData })
                  .eq("user_id", userId)
                  .eq("symbol", sym);
              });
          }
          return result;
        });
      });
      const exhResults = await Promise.all(exhUpdatePromises);
      const exhErrors = exhResults.filter(r => r?.error);
      if (exhErrors.length > 0) {
        logger.warn(`⚠️ Failed to cache micro exhaustion for ${exhErrors.length}/${symbolMicroExhaustionMap.size} symbols`);
      } else {
        logger.info(`🔥 Cached micro exhaustion in trend_snapshots for ${symbolMicroExhaustionMap.size} symbols`);
      }
    }

    // ============= BATCH UPDATE LIQUIDITY TRAP DATA IN TREND SNAPSHOTS =============
    if (symbolLiquidityTrapMap.size > 0) {
      const trapUpdatePromises = Array.from(symbolLiquidityTrapMap.entries()).map(([sym, data]) => {
        return supabase.rpc('jsonb_set_snapshot_field' as any, {
          p_user_id: userId,
          p_symbol: sym,
          p_field: 'liquidityTrap',
          p_value: data,
        }).then((result: any) => {
          if (result.error) {
            return supabase
              .from("trend_snapshots")
              .select("snapshot_data")
              .eq("user_id", userId)
              .eq("symbol", sym)
              .single()
              .then(({ data: existing }) => {
                const existingData = (existing?.snapshot_data as Record<string, unknown>) || {};
                const mergedData = { ...existingData, liquidityTrap: data };
                return supabase
                  .from("trend_snapshots")
                  .update({ snapshot_data: mergedData })
                  .eq("user_id", userId)
                  .eq("symbol", sym);
              });
          }
          return result;
        });
      });
      const trapResults = await Promise.all(trapUpdatePromises);
      const trapErrors = trapResults.filter(r => r?.error);
      if (trapErrors.length > 0) {
        logger.warn(`⚠️ Failed to cache liquidity trap for ${trapErrors.length}/${symbolLiquidityTrapMap.size} symbols`);
      } else {
        logger.info(`🪤 Cached liquidity trap in trend_snapshots for ${symbolLiquidityTrapMap.size} symbols`);
      }
    }

    // Log heartbeat and persist to database
    if (BOT_HEARTBEAT_CONFIG.LOG_HEARTBEAT) {
      logger.info(`💓 HEARTBEAT: ${heartbeatTimestamp} | Symbols: ${perSymbolGateAttribution.size} | Signals: ${signals.length} | State: ${noTradeState || 'OPERATIONAL'}`);
      logger.info(`🔒 REGIME PERSISTENCE METRICS: evaluations=${regimeEvaluations} | attempted=${regimeTransitionsAttempted} | blocked=${regimeTransitionsBlocked} | confirmed=${regimeTransitionsConfirmed}`);
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
              executionTimeMs: Date.now() - cycleStartMs,
              dataFetchTimeMs: dataFetchEndMs ? dataFetchEndMs - cycleStartMs : null,
              analysisTimeMs: dataFetchEndMs ? Date.now() - dataFetchEndMs : null,
              rejections: {
                byHardGates: rejectedByHardGates,
                byRegime: rejectedByRegime,
                byReversalRisk: rejectedByReversalRisk,
                byStochRsiExtreme: rejectedByStochRsiExtreme,
                byQuality: rejectedByQuality,
                byStrategy: rejectedByStrategy,
              },
              regimePersistence: {
                evaluations: regimeEvaluations,
                transitionsAttempted: regimeTransitionsAttempted,
                transitionsBlocked: regimeTransitionsBlocked,
                transitionsConfirmed: regimeTransitionsConfirmed,
              },
              dominantGate: perSymbolGateAttribution.size > 0 
                ? Array.from(perSymbolGateAttribution.values())[0]?.gate 
                : null,
              // Expansion capture diagnostics
              expansionDiagnostics: (() => {
                const expSyms: string[] = [];
                const brkSyms: string[] = [];
                const blockedDetails: Record<string, string> = {};
                symbolRegimeMap.forEach((regime, sym) => {
                  if (regime === 'TREND_EXPANSION') expSyms.push(sym);
                  if (regime === 'BREAKOUT_SETUP') brkSyms.push(sym);
                });
                [...expSyms, ...brkSyms].forEach(sym => {
                  const gate = perSymbolGateAttribution.get(sym);
                  if (gate) blockedDetails[sym] = `${gate.gate}: ${gate.details || '-'}`;
                });
                return {
                  expansionCount: expSyms.length,
                  breakoutCount: brkSyms.length,
                  blockedCount: Object.keys(blockedDetails).length,
                  capturedCount: (expSyms.length + brkSyms.length) - Object.keys(blockedDetails).length,
                  blockedDetails,
                };
              })(),
            },
          });
        
        if (heartbeatError) {
          logger.warn(`❤️ Heartbeat DB persist failed: ${heartbeatError.message}`);
        }
      } catch (heartbeatErr) {
        logger.warn(`❤️ Heartbeat persist error: ${heartbeatErr}`);
      }
    }

    // ============= FLUSH REJECTION BUFFER =============
    // Single dedup SELECT + single batch INSERT instead of N individual round-trips
    const rejectionsInserted = await rejectionBuffer.flush(supabase, logger);
    activeRejectionBuffer = null; // Disable batch mode
    logger.info(`📝 Rejection buffer flushed: ${rejectionsInserted} new entries persisted`);

    // ============= PERSIST FUNCTION METRICS =============
    const totalDurationMs = Date.now() - cycleStartMs;
    try {
      await supabase.from('function_metrics').insert({
        function_name: 'strategy-analyzer',
        user_id: userId,
        duration_ms: totalDurationMs,
        phase_timings: {
          dataFetchMs: dataFetchEndMs - cycleStartMs,
          analysisMs: totalDurationMs - (dataFetchEndMs - cycleStartMs),
        },
        success: true,
        symbols_count: perSymbolGateAttribution.size,
      });
    } catch (metricsErr) {
      logger.warn(`⏱️ Metrics persist failed: ${metricsErr}`);
    }

    // Collect Binance fetch stats from this function's memory space
    const binanceFetchStats = getAndResetFetchStats();

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
        regimePersistence: {
          evaluations: regimeEvaluations,
          transitionsAttempted: regimeTransitionsAttempted,
          transitionsBlocked: regimeTransitionsBlocked,
          transitionsConfirmed: regimeTransitionsConfirmed,
        },
      },
      noTradeState: noTradeState ? {
        state: noTradeState,
        reason: noTradeReason,
      } : null,
      // Binance fetch stats from strategy-analyzer's memory space
      binanceFetchStats,
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
