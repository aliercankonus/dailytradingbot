// ============= CENTRALIZED THRESHOLDS =============
// CRITICAL: Single source of truth for all edge functions
// Changes here automatically apply to: calculate-trend, backtest-strategy, strategy-analyzer, execute-trade, monitor-positions

// ============= TRADING FEE PARAMETERS =============
// Exchange trading fees for accurate P&L calculation
export const TRADING_FEE_PARAMS = {
  // Default fee rate per side (Binance taker = 0.1%, maker = 0.04%)
  DEFAULT_FEE_RATE_PERCENT: 0.1,
  // Minimum fee rate (for high-volume/VIP users)
  MIN_FEE_RATE_PERCENT: 0.02,
  // Maximum fee rate (safety cap)
  MAX_FEE_RATE_PERCENT: 0.2,
  // Round-trip fee (entry + exit) - used for fee-aware calculations
  ROUND_TRIP_FEE_PERCENT: 0.2,
  // Safety buffer above round-trip fee for true break-even
  TRUE_BE_SAFETY_BUFFER_PERCENT: 0.02,
} as const;

// ============= CONTEXTUAL TP EXPANSION PARAMETERS =============
// High-conviction inflection points get wider TP targets to capture larger moves
// Philosophy: "Be selective on entry, patient on exit"
// This increases PnL per position by expanding expectancy (wider TP), not risk (larger size)
export const CONTEXTUAL_TP_EXPANSION = {
  ENABLED: true,
  
  // ===== COUNTER-TREND EXHAUSTION ENTRIES =====
  // MR probes at validated exhaustion points have asymmetric upside
  COUNTER_TREND_EXHAUSTION: {
    ENABLED: true,
    TP_MULTIPLIER: 1.30,  // +30% wider TP
    // Entry types that qualify
    QUALIFYING_TYPES: ['COUNTER_TREND_EXHAUSTION', 'MR_PROBE', 'MEAN_REVERSION'] as string[],
  },
  
  // ===== STRONG TREND OVERRIDE ENTRIES =====
  // Entries into extreme StochRSI during powerful trends (ADX >= 40)
  STRONG_TREND_OVERRIDE: {
    ENABLED: true,
    TP_MULTIPLIER: 1.30,  // +30% wider TP
    // Entry types that qualify
    QUALIFYING_TYPES: ['STRONG_TREND_TIER0_OVERRIDE', 'STRONG_TREND', 'STRONG_TREND_HTF_BYPASS'] as string[],
  },
  
  // ===== SQUEEZE BREAKOUT ENTRIES =====
  // Entries during volatility expansion from compression
  SQUEEZE_BREAKOUT: {
    ENABLED: true,
    TP_MULTIPLIER: 1.20,  // +20% wider TP (more volatile, less predictable)
    QUALIFYING_TYPES: ['SQUEEZE_EXPANSION', 'EARLY_IGNITION'] as string[],
  },
  
  // ===== LOGGING =====
  LOG_TP_EXPANSION: true,
} as const;

export const ADX_THRESHOLDS = {
  VERY_WEAK: 12,
  SEVERE_PENALTY: 15,
  // PHASE 1 FIX: Reduced from 18 to 15 to allow earlier entries during breakout initiation
  // ADX 15-18 is where impulsive moves START - waiting for 18 misses 30-50% of the move
  WEAK: 15,
  // SQUEEZE_MINIMUM: Allows squeeze breakout entries when ADX is 15-20 (relaxed from 18)
  // This enables more signals during transitional/ranging markets when squeeze breakouts occur
  SQUEEZE_MINIMUM: 15,
  MINIMUM: 20,
  MODERATE: 22,
  STRONG: 25,
  // PHASE 1 FIX: Separated strong trend exception thresholds
  STRONG_TREND_EXCEPTION: 23,  // For dead zone bypass only (lowered from 25 to capture ranging markets)
  STRONG_TREND_EXCEPTION_PARTIAL: 21,  // Partial exception: 25% position reduction (lowered from 23)
  STRONG_TREND_EXCEPTION_FULL: 23,     // Full exception: no position reduction (lowered from 28 to 23)
  VERY_STRONG: 30,
  EXCEPTIONAL: 35,
  EXTREME: 40,
  // PHASE 1: ADX Phase State Machine thresholds
  EXHAUSTION: 45,  // ADX > 45 = exhaustion risk, increase reversal sensitivity
  // PHASE 1 FIX: Reversal override block threshold
  REVERSAL_BLOCK: 30,  // No reversals allowed when ADX >= 30 (strong trend)
  // V1.1: Absolute floor for ADX gate - no exceptions below this
  ABSOLUTE_FLOOR: 18,
} as const;

// ============= ADX GATE V1.1 PARAMETERS =============
// v1.1 Minimal Gate: Role discipline - only answers "Is there market energy?"
// REMOVED in v1.1: 1H Fallback, Neutral 4H Handling, Mean Reversion Override, 
// Quiet Trend Bypass, Low ADX Trend Exception (moved to dedicated handlers)
// v1.2 FIX: Only ONE bypass allowed per signal in transitional zone
export const ADX_GATE_V1_1 = {
  ENABLED: true,
  
  // ===== TIER 0: ABSOLUTE FLOOR (NO EXCEPTIONS) =====
  // ADX < 18 = structural no-trend, hard block
  HARD_FLOOR: 18,
  
  // ===== TRANSITIONAL ZONE (18-22) =====
  // Only 2 exception paths allowed: Squeeze Expansion + Early Ignition
  // CRITICAL FIX v1.2: Only ONE bypass allowed per signal (prevents over-admission)
  TRANSITIONAL_MIN: 18,
  TRANSITIONAL_MAX: 22,
  
  // BYPASS PRIORITY ORDER (only highest-priority applicable bypass fires)
  // 1 = highest priority, lower numbers win
  BYPASS_PRIORITY_ORDER: {
    SQUEEZE_EXPANSION: 1,    // Highest priority - structure-based
    EARLY_IGNITION: 2,       // Second priority - regime-based
    MEAN_REVERSION: 3,       // Lowest priority - counter-trend probe
  } as Record<string, number>,
  
  // Log which bypass was selected
  LOG_BYPASS_SELECTION: true,
  
  // ===== SQUEEZE EXPANSION EXCEPTION (Tier 2) =====
  // Purpose: Allow entries during BB compression breakouts where ADX hasn't yet responded
  SQUEEZE_EXPANSION: {
    ENABLED: true,
    // BB Width must be compressed (< 20th percentile - checked via squeeze flag)
    REQUIRE_BB_COMPRESSED: true,
    // %B must be at band edge (≤20% for short, ≥80% for long)
    LONG_MIN_PERCENT_B: 80,
    SHORT_MAX_PERCENT_B: 20,
    // Momentum state must be 'building' or 'confirmed'
    VALID_MOMENTUM_STATES: ['building', 'confirmed'] as string[],
    // ADX slope must be rising (not flat or falling) - key v1.1 addition
    MIN_ADX_SLOPE: 0.05,
    // No MACD divergence allowed
    BLOCK_ON_DIVERGENCE: true,
    // Position size multiplier for squeeze expansion entries
    POSITION_MULTIPLIER: 0.65,
  },
  
  // ===== EARLY IGNITION EXCEPTION (Tier 3) =====
  // Purpose: Allow entries in emerging trends before ADX fully registers the move
  EARLY_IGNITION: {
    ENABLED: true,
    // Regime must be EARLY_TREND (structural shift detected)
    REQUIRE_EARLY_TREND_REGIME: true,
    // ADX slope must be rising (> 0, not just flat)
    MIN_ADX_SLOPE: 0,
    // 4H confidence must show emerging structure
    MIN_4H_CONFIDENCE: 55,
    // 1H must align with 4H direction
    REQUIRE_1H_4H_ALIGNMENT: true,
    // Position size multiplier for early ignition entries
    POSITION_MULTIPLIER: 0.70,
  },
  
  // ===== ADAPTIVE THRESHOLDS BY REGIME =====
  // ADX must be >= this threshold for regime to allow normal entry
  ADAPTIVE_THRESHOLDS: {
    RANGE: 22,        // Ranging markets need higher ADX to confirm trend
    EARLY_TREND: 20,  // Emerging trends can enter earlier
    STRONG_TREND: 18, // Strong trends are self-confirming
    EXHAUSTION: 20,   // Exhaustion requires caution
  } as Record<string, number>,
  
  // ===== LOGGING =====
  LOG_GATE_CHECKS: true,
  LOG_EXCEPTION_DETAILS: true,
} as const;

// ============= EARLY IGNITION ENTRY MODULE v1.1 =============
// NEW MODULE: Captures the 30-90 minute window between compression and expansion
// Purpose: Address the "pre-move blind spot" - system catches moves AFTER they happen
// Key insight: This is VOLATILITY IGNITION entry, not trend following or mean reversion
//
// v1.1 REFINEMENT: ADX slope crossing from negative → flat is the signal
// The sequence is: Squeeze → ADX slope flattens → Volume spike → Range break → Expansion
// Original v1.0 required adxSlope > 0 (step 5), but optimal entry is step 3-4
//
// PHASE A (Pre-Ignition Watch - NO ENTRY):
//   bb_squeeze = true AND adxSlope < 0 → tag as IGNITION_FORMING, log near-miss
//
// PHASE B (Ignition Trigger - ENTRY):
//   bb_squeeze = true AND adxSlope >= 0 (flattening allowed) AND volume surge AND range break
//
// PHASE C (Expansion Confirmation - NORMAL SYSTEM):
//   adxSlope > 0 AND ADX rising → normal trend logic resumes
//
// STRICT CONDITIONS (all must be true for Phase B):
// 1. bb_squeeze == TRUE (recent compression)
// 2. bb_width expanding (breakout starting)
// 3. adxSlope >= 0 (flattening OR rising - key v1.1 change)
// 4. volume_zscore >= +1.5 (volume surge)
// 5. price breaks micro range high/low
// 6. NOT stochRSI in Tier 0 (K < 2 or K > 98)
//
// BEHAVIOR:
// - Direction: Derived from breakout, NOT from HTF
// - HTF: Must NOT oppose (but may be neutral)
// - Position Size: 0.30x-0.45x (conservative)
// - Stop: Tight, structure-based
// - Gate Bypass: Only NO_CLEAR_DIRECTION
//
// DOES NOT BYPASS:
// - MOVE_EXHAUSTED
// - EXTREME StochRSI (Tier 0)
// - HARD ADX floor (<18)
export const EARLY_IGNITION_ENTRY = {
  ENABLED: true,
  
  // ===== COMPRESSION DETECTION (Condition 1) =====
  // BB squeeze must have been active recently
  REQUIRE_BB_SQUEEZE: true,
  SQUEEZE_LOOKBACK_BARS: 6,  // Squeeze in last 6 bars on 1h = 6 hours
  
  // ===== EXPANSION DETECTION (Condition 2) =====
  // Bollinger width must be expanding (breakout starting)
  REQUIRE_BB_WIDTH_EXPANDING: true,
  MIN_WIDTH_EXPANSION_PERCENT: 10,  // Width expanding by at least 10%
  EXPANSION_LOOKBACK_BARS: 3,       // Compare width over 3 bars
  
  // ===== ADX SLOPE (Condition 3) - v1.1 REFINED =====
  // v1.0: Required adxSlope > 0.05 (too late - step 5)
  // v1.1: Allow adxSlope >= 0 (flattening = step 3-4 entry)
  // Key insight: ADX slope crossing from negative → flat is the signal
  MIN_ADX_SLOPE: 0,           // v1.1: Allow flat (>= 0), not just rising
  MIN_ADX_SLOPE_RISING: 0.05, // Threshold for "clearly rising" (bonus sizing)
  // Minimum ADX floor - still respect the absolute floor
  MIN_ADX_FLOOR: 15,    // Below this, no ignition (pre-trend too weak)
  
  // ===== PRE-IGNITION WATCH (Phase A) =====
  // When squeeze is active but ADX slope still negative, log as "forming"
  ENABLE_PRE_IGNITION_WATCH: true,
  PRE_IGNITION_TAG: 'IGNITION_FORMING' as const,
  // Threshold for "still decaying" - below this, log as near-miss
  PRE_IGNITION_ADX_SLOPE_THRESHOLD: 0,
  
  // ===== VOLUME SURGE (Condition 4) =====
  // Volume must spike to confirm breakout
  REQUIRE_VOLUME_SURGE: true,
  MIN_VOLUME_ZSCORE: 1.5,     // Volume must be 1.5 std above average
  MIN_VOLUME_RATIO: 1.5,      // Alternative: 1.5x average volume
  
  // ===== MICRO RANGE BREAK (Condition 5) =====
  // Price must break recent consolidation high/low
  REQUIRE_RANGE_BREAK: true,
  RANGE_LOOKBACK_BARS: 12,    // Look back 12 bars for range high/low
  MIN_BREAK_PERCENT: 0.15,    // Must break range by at least 0.15%
  
  // ===== STOCHRSI SAFETY (Condition 6) =====
  // Never enter at absolute extremes
  MAX_STOCHRSI_K_FOR_LONG: 95,   // Block LONG if K > 95
  MIN_STOCHRSI_K_FOR_SHORT: 5,   // Block SHORT if K < 5
  TIER_0_BLOCK_K_FLOOR: 2,       // Absolute block below K=2
  TIER_0_BLOCK_K_CEILING: 98,    // Absolute block above K=98
  
  // ===== HTF ALIGNMENT (Not opposing) =====
  // HTF may be neutral, but must NOT oppose
  BLOCK_IF_HTF_OPPOSING: true,
  // 4h confidence threshold for "opposing" determination
  HTF_OPPOSING_CONFIDENCE_THRESHOLD: 60,
  
  // ===== POSITION SIZING =====
  // Conservative sizing for ignition entries
  POSITION_SIZE_BASE: 0.35,         // Base: 35% of normal position (slope flat)
  POSITION_SIZE_SLOPE_RISING: 0.40, // Bonus if ADX slope clearly rising
  POSITION_SIZE_WITH_HTF_SUPPORT: 0.45,  // If HTF aligned: 45%
  POSITION_SIZE_WEAK_VOLUME: 0.30,  // If volume zscore < 2.0: 30%
  
  // ===== STOP LOSS =====
  // Tight, structure-based stops
  STOP_LOSS_ATR_MULTIPLIER: 1.0,    // 1x ATR (tight)
  USE_RANGE_LOW_AS_STOP: true,      // Use recent range low/high as stop
  
  // ===== WHAT THIS BYPASSES =====
  // ONLY bypasses direction paralysis
  BYPASSES_NO_CLEAR_DIRECTION: true,
  // Does NOT bypass these critical gates
  DOES_NOT_BYPASS_MOVE_EXHAUSTED: true,
  DOES_NOT_BYPASS_TIER_0_STOCHRSI: true,
  DOES_NOT_BYPASS_ADX_FLOOR: true,
  
  // ===== LOGGING =====
  LOG_IGNITION_CHECKS: true,
  LOG_DETAILED_CONDITIONS: true,
  LOG_NEAR_MISS: true,  // Log Phase A near-misses for diagnostics
  
  // ===== GATE TYPE LABELS =====
  GATE_TYPE: 'EARLY_IGNITION_ENTRY' as const,
  NEAR_MISS_GATE_TYPE: 'IGNITION_FORMING' as const,
} as const;

// ============= ADX PHASE STATE MACHINE =============
// PHASE 1 IMPROVEMENT: Replace raw thresholds with phase classification
// Each phase has different behavior for signal generation
export const ADX_PHASES = {
  RANGE: { min: 0, max: 15, tradeable: false, description: "No trend - reject (reduced from 18)" },
  TRANSITION: { min: 15, max: 22, tradeable: true, description: "Emerging trend - allow squeeze/momentum/price action entry" },
  EARLY_TREND: { min: 22, max: 30, tradeable: true, description: "Early trend - normal logic" },
  STRONG_TREND: { min: 30, max: 45, tradeable: true, description: "Strong trend - reduced reversal weight" },
  // UPDATED: High ADX alone is NOT exhaustion - check slope/DI for behavioral exhaustion
  EXHAUSTION: { min: 45, max: 100, tradeable: true, description: "High ADX - check slope/DI for true exhaustion" },
} as const;

// ============= BEHAVIORAL ADX EXHAUSTION PARAMETERS =============
// NEW: Exhaustion is about CHANGE, not absolute value
// A trend is exhausted when strength stops accelerating and decays, even if ADX is high
export const ADX_EXHAUSTION_PARAMS = {
  // ADX must be above this for exhaustion checks to matter
  MIN_ADX_FOR_EXHAUSTION_CHECK: 35,
  
  // ===== ADX SLOPE (RULE 1) =====
  // ADX slope thresholds for exhaustion detection
  SLOPE_NEUTRAL: 0,           // Flat ADX = cruising
  SLOPE_DECLINING: -0.3,      // Slope below this = decelerating
  SLOPE_ACCELERATING: 0.5,    // Slope above this = still accelerating (not exhausted)
  
  // ===== ADX ROLLOVER (RULE 1A) =====
  // Detect ADX peak - current < max of recent bars
  ROLLOVER_LOOKBACK_BARS: 5,
  
  // ===== DI COMPRESSION (RULE 3) =====
  // +DI / -DI gap compression detection
  DI_COMPRESSION_BARS: 3,     // Consecutive bars of shrinking DI gap
  DI_COMPRESSION_MIN_SHRINK: 0.05, // Gap must shrink by 5% per bar to count
  
  // ===== EXHAUSTION SCORING =====
  // Points added for each exhaustion signal
  SCORE_ADX_ROLLOVER: 35,     // ADX peaked and declining
  SCORE_DI_COMPRESSING: 25,   // DI gap shrinking for 3+ bars
  SCORE_MOMENTUM_DIVERGENCE: 25, // Price HH but RSI not HH
  SCORE_ADX_SLOPE_NEGATIVE: 15,  // ADX slope below 0
  
  // Composite exhaustion threshold (score above this = exhausted)
  EXHAUSTION_THRESHOLD: 50,
  
  // ===== CONTINUATION OVERRIDE =====
  // High ADX + rising = continuation, NOT exhaustion
  // This prevents blocking strong trends incorrectly
  CONTINUATION_OVERRIDE: true,
  CONTINUATION_MIN_ADX: 40,
  CONTINUATION_MIN_SLOPE: 0,  // Slope must be >= 0 (not falling)
} as const;

export type AdxPhase = keyof typeof ADX_PHASES;

export const STOCHRSI_THRESHOLDS = {
  EXTREME_OVERSOLD: 10,
  DEEPLY_OVERSOLD: 15,
  OVERSOLD: 20,
  OVERSOLD_ZONE: 25,
  NEUTRAL_LOW: 30,
  NEUTRAL_HIGH: 70,
  OVERBOUGHT_ZONE: 75,
  OVERBOUGHT: 80,
  DEEPLY_OVERBOUGHT: 85,
  EXTREME_OVERBOUGHT: 90,
  // NEW: Absolute maximum thresholds - no exceptions allowed beyond these
  ABSOLUTE_MAX_OVERBOUGHT: 98,  // Hard gate: K>=98 = BLOCK all LONG entries
  ABSOLUTE_MAX_OVERSOLD: 2,     // Hard gate: K<=2 = BLOCK all SHORT entries
  // High reversal risk threshold - used for increased penalty scoring
  HIGH_REVERSAL_OVERBOUGHT: 95, // K>=95 = +35 reversal score for LONG
  HIGH_REVERSAL_OVERSOLD: 5,    // K<=5 = +35 reversal score for SHORT
  // NEW: Tiered parabolic bypass for absolute max gates
  // In parabolic trends, K can stay pegged at 100 while price continues rising
  // FOUR tiers provide graduated access based on trend strength
  
  // PHASE 1 FIX: NEW Tier 0 (Ultra Strong) - ADX >= 50, no continuation requirement
  // Allows entries when ADX is very high even if slope slightly negative or DI shrinking
  // This fixes missed opportunities during strong trend continuation
  TIER0_MIN_ADX: 50,
  TIER0_MIN_ADX_SLOPE: -0.5,  // Allow slightly negative slope (trend cruising)
  TIER0_MIN_DI_GAP: 8,        // Relaxed DI gap (gap can shrink during consolidation)
  TIER0_POSITION_SIZE: 30,    // Conservative 30% position due to late entry
  TIER0_REQUIRE_CONTINUATION: false,  // NO continuation requirement
  
  // Tier 1: Base level - moderate trend strength (NO LONGER requires continuation)
  // PHASE 1 FIX: Removed continuation requirement to allow more entries
  TIER1_MIN_ADX: 25,
  TIER1_MIN_ADX_SLOPE: 0.03,
  TIER1_MIN_DI_GAP: 10,
  TIER1_POSITION_SIZE: 40,  // Most conservative
  TIER1_REQUIRE_CONTINUATION: false,  // Removed continuation requirement
  
  // Tier 2: Strong trend
  TIER2_MIN_ADX: 30,
  TIER2_MIN_ADX_SLOPE: 0.05,
  TIER2_MIN_DI_GAP: 12,
  TIER2_POSITION_SIZE: 50,
  
  // Tier 3: Very strong trend
  TIER3_MIN_ADX: 35,
  TIER3_MIN_ADX_SLOPE: 0.08,
  TIER3_MIN_DI_GAP: 15,
  TIER3_POSITION_SIZE: 60,
  
  // Legacy aliases for backward compatibility
  PARABOLIC_BYPASS_MIN_ADX: 35,          // Points to Tier 3 for legacy checks
  PARABOLIC_BYPASS_MIN_ADX_SLOPE: 0.08,
  PARABOLIC_BYPASS_MIN_DI_GAP: 15,
  PARABOLIC_BYPASS_POSITION_SIZE: 50,    // Default position size
} as const;

// ============= TIER 0: DEEP STOCHRSI EXTREME HARD GATE =============
// TIER HIERARCHY:
//   Tier 0 (DEEP): K < 5 or K > 95 - Universal block, NO EXCEPTIONS
//   Tier 1 (SEVERE): 5 <= K < 15 or 85 < K <= 95 - Block, NO BYPASS
//   Tier 2 (STANDARD): K <= 20 & %B <= 25 or K >= 80 & %B >= 75 - Block with RESTRICTED bypass
//   Tier 3 (CAUTION): K <= 30 or K >= 70 - Penalty scoring, no hard block
//
// Universal block for deep oversold/overbought - NO EXCEPTIONS ALLOWED
// When StochRSI is at extreme levels (K < 5 or K > 95), bounce/reversal probability is very high (~80%+)
// This gate executes BEFORE any bypass logic and cannot be overridden by momentum, ADX, or trend confirmation
export const DEEP_STOCHRSI_HARD_GATE = {
  ENABLED: true,
  TIER: 0 as const,  // Explicit tier label
  
  // Tier 0: Deep oversold threshold - HARD BLOCK ALL SHORTs when 4h K below this
  // At K < 3, bounce probability is ~90%+ (statistical blow-off territory)
  DEEP_OVERSOLD_K_THRESHOLD: 3,
  
  // Tier 0: Deep overbought threshold - HARD BLOCK ALL LONGs when 4h K above this
  // At K > 97, pullback probability is ~90%+ (statistical blow-off territory)
  DEEP_OVERBOUGHT_K_THRESHOLD: 97,
  
  // Tier 0 SOFT CAP: Reduced sizing zone before hard block
  // K 95-97 for LONGs, K 3-5 for SHORTs → allow entry with 0.5x position cap
  // Rationale: 95 is early climax, 97+ is real statistical blow-off
  SOFT_CAP_OVERBOUGHT_K_THRESHOLD: 95,  // LONGs soft-capped above this
  SOFT_CAP_OVERSOLD_K_THRESHOLD: 5,     // SHORTs soft-capped below this
  SOFT_CAP_POSITION_MULTIPLIER: 0.50,   // 50% position size in soft cap zone
  
   // NOTE: Strong Trend Override is controlled solely by STRONG_TREND_TIER0_OVERRIDE.ENABLED
   // REMOVED: ALLOW_STRONG_TREND_OVERRIDE (was causing configuration divergence risk)
} as const;

// ============= STRONG TREND TIER 0 OVERRIDE =============
// Allows entries at Tier 0 extremes (K<5 or K>95) when ADX confirms powerful capitulation
// This addresses missed opportunities during 8%+ moves where StochRSI remains pegged at extremes
// 
// RATIONALE:
// - Standard Tier 0: 80% bounce probability at K<5 → block SHORT
// - BUT: In capitulation events (ADX>40, strong momentum), price can continue 5-10%+ further
// - The 80% statistic applies to NORMAL markets, not panic/capitulation moves
//
// SAFETY REQUIREMENTS (ALL must be true):
// 1. ADX >= 40 (strong trend energy)
// 2. ADX not falling sharply (slope > -1.0, trend not dying)
// 3. Momentum score confirms direction (>= 30 for trend, no opposing momentum)
// 4. 1H trend aligns with direction (not counter-trend)
// 5. Position size reduced to 0.25x (conservative for late entry)
export const STRONG_TREND_TIER0_OVERRIDE = {
  ENABLED: true,
  
  // ===== ADX REQUIREMENTS =====
  // Minimum ADX for override consideration
  MIN_ADX: 40,
  // ADX slope must not be sharply falling (trend still has energy)
   // NOTE: Consider tightening to -0.5 for cleaner continuation if false positives occur
  MIN_ADX_SLOPE: -1.0,
  
  // ===== MOMENTUM REQUIREMENTS =====
   // Momentum score must confirm trade direction (>= 30 for long, <= -30 for short)
   // SIMPLIFIED: Use score only (quantitative), not direction enum (categorical)
   // Score inherently encodes direction: positive = bullish, negative = bearish
  MIN_MOMENTUM_SCORE: 30,
   // REMOVED: REQUIRE_MOMENTUM_ALIGNMENT - redundant with score check
   // Score >= 30 implies bullish direction, score <= -30 implies bearish direction
  
  // ===== TREND ALIGNMENT =====
  // 1H timeframe must align with trade direction
  REQUIRE_1H_ALIGNMENT: true,
   // Minimum 1H confidence for "opposing" determination
   // 1H trend is only considered opposing if confidence >= this threshold
   // Set to 60 by default - neutral or weak 1H trends don't block
   MIN_1H_OPPOSING_CONFIDENCE: 60,
  
  // ===== POSITION SIZING =====
  // Conservative position size for late-entry at extremes
  POSITION_SIZE_MULTIPLIER: 0.25,
  
   // ===== COOLDOWN PROTECTION =====
   // Prevents repeated late entries in a grinding trend ("death by 100 small cuts")
   // Maximum override entries per symbol per N hours
   MAX_OVERRIDES_PER_SYMBOL: 1,
   COOLDOWN_HOURS: 4,
   
   // ===== ENTRY TYPE TAGGING =====
   // Tag for forensics and separate win rate analysis
   ENTRY_TYPE_TAG: 'STRONG_TREND_TIER0_OVERRIDE' as const,
   
   // ===== LOGGING =====
  LOG_OVERRIDE_DETAILS: true,
} as const;

// ============= CAPITULATION BOUNCE PROBE =============
// NEW MICRO-REGIME: Post-capitulation balance zone entry
// 
// RATIONALE:
// During capitulation events (10%+ drops), the system correctly blocks:
// - SHORTs via Tier 0 DEEP_OVERSOLD (K < 5 → 80% bounce probability)
// - LONGs via LTF_COUNTER_ALIGNED (structure still bearish)
// 
// BUT: Neither MR nor continuation logic fires in this regime because:
// - Trend: Momentum has COLLAPSED to ~0 (not directional)
// - Mean Reversion: Requires momentum decay, but momentum is already at zero
// - Continuation: Requires strong momentum, but momentum is at zero
//
// This is a TRANSITIONAL REGIME - liquidity vacuum rebound capture
// NOT mean reversion (which requires decaying momentum)
// NOT trend continuation (which requires strong directional momentum)
//
// STRICT CONDITIONS (ALL REQUIRED):
// 1. StochRSI 4H K ≤ 1 (pinned at absolute extreme)
// 2. Price dropped ≥ 8% in ≤ 24h (significant capitulation move)
// 3. Momentum score between -5 and +5 (collapsed, not directional)
// 4. ADX ≥ 35 but slope ≤ 0 (high energy but exhausting)
// 5. Volatility not expanding (ATR flat or BB width stabilizing)
//
// BEHAVIOR:
// - Direction: LONG only (bounce capture from oversold extreme)
// - Size: 0.15-0.20x (very conservative probe)
// - TP: Modest (1.5-2.5% target, not trend reversal)
// - No pyramiding allowed
// - Hard invalidation if K > 5 without price move (bounce failed)
export const CAPITULATION_BOUNCE_PROBE = {
  ENABLED: true,
  
  // ===== STOCHRSI REQUIREMENTS =====
  // Must be at absolute extreme (pinned)
  MAX_STOCHRSI_K: 1,  // K ≤ 1 (pinned at bottom)
  
  // ===== PRICE DROP REQUIREMENTS =====
  // Significant drop must have occurred
  MIN_DROP_PERCENT: 8,   // At least 8% drop from 24h high
  MAX_LOOKBACK_HOURS: 24,
  
  // ===== MOMENTUM REQUIREMENTS =====
  // Momentum must have COLLAPSED (not directional)
  // This distinguishes from continuation (strong momentum) and MR (decaying momentum)
  MOMENTUM_COLLAPSED_MIN: -5,  // Score must be >= -5
  MOMENTUM_COLLAPSED_MAX: 5,   // Score must be <= 5
  // Block if momentum is still strong in either direction
  BLOCK_IF_MOMENTUM_DIRECTIONAL: true,
  
  // ===== ADX REQUIREMENTS =====
  // High energy trend that is EXHAUSTING (not accelerating)
  MIN_ADX: 35,           // Must have had strong trend
  MAX_ADX_SLOPE: 0,      // Trend energy not expanding (flat or falling)
  
  // ===== VOLATILITY REQUIREMENTS =====
  // Volatility must not be expanding (calm after storm)
  REQUIRE_VOLATILITY_NOT_EXPANDING: true,
  ATR_EXPANSION_THRESHOLD: 1.0,  // ATR slope must be < 1.0
  // OR BB width stabilizing
  BB_WIDTH_STABILIZING_THRESHOLD: 0.5,  // BB width change < 0.5%
  // Log which volatility condition validated entry
  LOG_VOLATILITY_CONDITION: true,
  
  // ===== HTF STRUCTURE GUARD =====
  // Block if HTF structure still making new lows (4h close below prior low)
  // This prevents entering during capitulation continuation
  REQUIRE_HTF_STRUCTURE_STABLE: true,
  MIN_CANDLES_SINCE_NEW_LOW: 2,  // At least 2 candles since last 4h low
  
  // ===== POSITION SIZING =====
  // Very conservative - this is a speculative probe
  BASE_POSITION_SIZE: 0.15,      // 15% of normal position
  WITH_VOLUME_SPIKE: 0.20,       // 20% if volume spike confirms bounce interest
  
  // ===== VOLUME CONFIRMATION (OPTIONAL BOOST) =====
  // If volume spikes at the bottom, increases size from 15% to 20%
  VOLUME_SPIKE_THRESHOLD: 1.5,   // 1.5x average volume
  
  // ===== STOP LOSS =====
  // Tight stop - invalidation is clear
  STOP_LOSS_ATR_MULTIPLIER: 0.8, // 0.8x ATR (tight)
  STOP_LOSS_MAX_PERCENT: 1.0,    // Max 1.0% stop loss
  
  // ===== TAKE PROFIT =====
  // Modest target - bounce capture, not reversal
  TAKE_PROFIT_MIN_PERCENT: 1.5,  // Minimum 1.5% target
  TAKE_PROFIT_MAX_PERCENT: 2.5,  // Maximum 2.5% target
  TAKE_PROFIT_ATR_MULTIPLIER: 1.5, // 1.5x ATR target
  
  // ===== PARTIAL TP (Fast Impulse Capture) =====
  // Capitulation bounces often give fast impulse + stall
  // Take 50% at 1.0% to lock in gains
  PARTIAL_TP_ENABLED: true,
  PARTIAL_TP_PERCENT: 1.0,       // First TP at 1.0%
  PARTIAL_TP_SIZE: 0.50,         // Close 50% of position at first TP
  
  // ===== SAFETY LIMITS =====
  // Prevent overexposure to this speculative setup
  MAX_PROBES_PER_SYMBOL_PER_DAY: 1,  // Only 1 probe per symbol per day
  NO_PYRAMIDING: true,
  
  // ===== COOLDOWN =====
  // Cooldown after failed probe
  COOLDOWN_HOURS_AFTER_FAILED: 4,
  
  // ===== HARD INVALIDATION =====
  // If K rises above this without price moving 1%, probe is invalidated
  INVALIDATION_K_THRESHOLD: 5,
  INVALIDATION_REQUIRE_PRICE_MOVE: 1.0,  // 1% minimum move for K rise to be valid
  
  // ===== REGIME TAGGING =====
  // Explicit regime attribution for analytics and downstream pipeline
  REGIME_TAG: 'TRANSITION_CAPITULATION' as const,
  ENTRY_TYPE_TAG: 'CAPITULATION_BOUNCE_PROBE' as const,
  
  // ===== LOGGING =====
  LOG_PROBE_DETAILS: true,
  LOG_NEAR_MISS: true,  // Log when close but conditions not met
} as const;

// ============= FLASH CRASH BOUNCE PROBE =============
// NEW MICRO-REGIME: V-shaped reversal capture after rapid market drops
// 
// RATIONALE:
// Flash crashes (≥10% drops in ≤4h) violate both assumptions of the Capitulation Bounce Probe:
// - ADX slope stays positive into the low (no exhaustion signal)
// - The bounce begins on the same candle or next candle (no structure stabilization)
//
// This is a PARALLEL REGIME to Capitulation Bounce Probe, not a replacement:
// - Capitulation Bounce: Gradual exhaustion, momentum collapsed, ADX slope ≤ 0
// - Flash Crash Bounce: Rapid V-reversal, forced liquidation rebound, ADX slope > 0 allowed
//
// STRICT CONDITIONS (ALL REQUIRED):
// 1. StochRSI 4H or 1H K ≤ 1 (pinned at absolute floor)
// 2. Price dropped ≥ 10% within ≤ 4 hours (flash crash velocity)
// 3. ADX ≥ 35 (high trend energy present)
// 4. Momentum not extreme opposing (score >= -30)
// 5. Direction: LONG only (bounce capture)
//
// KEY DIFFERENCES FROM CAPITULATION BOUNCE:
// - ADX slope: IGNORED (allowed > 0)
// - Candles since low: 0-1 allowed (immediate entry)
// - Price drop: Stricter (≥10% vs ≥8%)
// - Velocity: Required (≥2.5% per hour average)
//
// RISK CONTROLS (NON-NEGOTIABLE):
// - Position size: 0.20-0.35x (conservative probe)
// - Stop loss: Ultra-tight (≤0.5 ATR or 0.8% fixed)
// - No pyramiding: One-shot attempt only
// - Cooldown: 6 hours after failed probe
// - Max probes: 1 per symbol per day
export const FLASH_CRASH_BOUNCE_PROBE = {
  ENABLED: true,
  
  // ===== DETECTION THRESHOLDS =====
  MIN_DROP_PERCENT: 10,          // ≥10% drop (stricter than capitulation's 8%)
  MAX_DROP_HOURS: 4,             // Within 4 hours (velocity check)
  MIN_ADX: 35,                   // High trend energy present
  
  // ===== PHASE 1: STATIC EXHAUSTION (Original Logic) =====
  // K currently pinned at absolute floor
  PHASE_1_MAX_STOCHRSI_K: 1,     // K ≤ 1 (pinned at floor NOW)
  
  // ===== PHASE 2: RELEASE STATE (NEW - Temporal Logic) =====
  // K was recently pinned but has started recovering (momentum leads price)
  // This catches V-shaped bounces where oscillators rebound before price confirms
  PHASE_2_ENABLED: true,
  PHASE_2_FLOOR_THRESHOLD: 3,    // K was ≤ 3 within lookback (asymmetric - liquidations overshoot to 0-2)
  PHASE_2_LOOKBACK_CANDLES: 3,   // Check last 3 candles (4h = 12 hours lookback)
  PHASE_2_CURRENT_MAX_K: 30,     // Current K must still be < 30 (relaxed to capture fast recoveries)
  PHASE_2_MIN_K_RISE: 5,         // K must have risen at least 5 points (momentum snapback)
  PHASE_2_REQUIRE_K_RISING: true, // K must be actively rising (not stalling)
  PHASE_2_MIN_RISING_STEPS: 2,   // Require 2 consecutive rising K values (anti-jitter)
  PHASE_2_COOLDOWN_CANDLES: 3,   // Cooldown: don't retrigger for 3 candles after Phase 2 trigger
  PHASE_2_INCLUDE_1H_RECOVERY: true, // Allow recovery detection via 1h (catches faster V-bottoms)
  
  // ===== KEY DIFFERENCE: NO ADX SLOPE REQUIREMENT =====
  // Flash crashes keep ADX slope positive until reversal
  // Unlike Capitulation Bounce which requires slope ≤ 0
  IGNORE_ADX_SLOPE: true,
  
  // ===== KEY DIFFERENCE: NO HTF STRUCTURE REQUIREMENT =====
  // Flash crashes bounce on same candle as low
  // Unlike Capitulation which requires MIN_CANDLES_SINCE_NEW_LOW ≥ 2
  IGNORE_HTF_STRUCTURE: true,
  
  // ===== MOMENTUM REQUIREMENTS =====
  // More lenient than capitulation - allow directional momentum
  // Block only if momentum is extreme opposing
  // NOTE: Raised from 30 to 40 per historical analysis - true liquidation events
  // often print momentum -35 to -45 but still violently bounce
  MOMENTUM_MAX_OPPOSING: 40,     // Block if momentum < -40 (extreme bearish)
  
  // ===== PHASE 2 MOMENTUM SAFETY GUARDRAIL =====
  // Phase 2 (release state) can trigger while ADX is still expanding and 
  // momentum is deeply negative - this risks counter-trend knife-catching.
  // Require momentum to be STABILIZING (not at worst opposing level) for Phase 2
  PHASE_2_MOMENTUM_STABILIZATION: true,
  PHASE_2_MOMENTUM_MAX_OPPOSING: 28, // Phase 2 requires momentum > -28 (70% of -40)
  
  // ===== VELOCITY CONFIRMATION =====
  // Confirm rapid decline via price action (not gradual drift)
  REQUIRE_VELOCITY_CONFIRMATION: true,
  MIN_HOURLY_DROP_RATE: 2.5,     // ≥2.5% per hour average
  
  // ===== POSITION SIZING =====
  BASE_POSITION_SIZE: 0.20,      // 20% of normal (conservative probe)
  WITH_VOLUME_SPIKE: 0.30,       // 30% if volume spike confirms bounce interest
  WITH_REVERSAL_CANDLE: 0.35,    // 35% if bullish engulfing/hammer detected
  VOLUME_SPIKE_THRESHOLD: 1.5,   // 1.5x average volume
  
  // ===== STOP LOSS (ULTRA-TIGHT) =====
  STOP_LOSS_ATR_MULTIPLIER: 0.5, // 0.5x ATR (ultra-tight for flash crash)
  STOP_LOSS_MAX_PERCENT: 0.8,    // Max 0.8% (flash crashes require tight stops)
  
  // ===== TAKE PROFIT =====
  TAKE_PROFIT_MIN_PERCENT: 2.0,  // Minimum 2.0% target (flash bounces can be significant)
  TAKE_PROFIT_MAX_PERCENT: 4.0,  // Maximum 4.0% target (don't overstay)
  TAKE_PROFIT_ATR_MULTIPLIER: 2.0, // 2.0x ATR target
  
  // ===== PARTIAL TP =====
  // Flash bounces often give fast impulse + stall - take profits quickly
  PARTIAL_TP_ENABLED: true,
  PARTIAL_TP_PERCENT: 1.0,       // First TP at 1.0%
  PARTIAL_TP_SIZE: 0.50,         // Close 50% of position at first TP
  
  // ===== SAFETY LIMITS =====
  MAX_PROBES_PER_SYMBOL_PER_DAY: 1,  // Only 1 probe per symbol per day
  NO_PYRAMIDING: true,
  COOLDOWN_HOURS_AFTER_FAILED: 6,    // 6 hour cooldown after failed probe
  
  // ===== HARD INVALIDATION =====
  // If K rises above 5 without price moving 0.8%, probe is invalidated
  INVALIDATION_K_THRESHOLD: 5,
  INVALIDATION_REQUIRE_PRICE_MOVE: 0.8,  // 0.8% minimum move for K rise to be valid
  
  // ===== REGIME TAGGING =====
  REGIME_TAG: 'FLASH_CRASH_BOUNCE' as const,
  ENTRY_TYPE_TAG: 'FLASH_CRASH_BOUNCE_PROBE' as const,
  
  // ===== LOGGING =====
  LOG_PROBE_DETAILS: true,
  LOG_NEAR_MISS: true,
} as const;

// ============= PHASE 3: TIME-IN-EXTREME THRESHOLDS =============
// Tracks consecutive bars at StochRSI extremes for exhaustion detection
// UPDATED: Raised thresholds to allow more room for trend continuation
export const TIME_IN_EXTREME_PARAMS = {
  // Threshold for "extreme" zone (K > 90 or K < 10)
  OVERBOUGHT_EXTREME: 90,
  OVERSOLD_EXTREME: 10,
  // Minimum bars at extreme before penalty kicks in (RAISED from 3 to 5)
  // Strong trends can stay at extremes longer without exhausting
  MIN_BARS_FOR_PENALTY: 5,
  // Bars at extreme levels for increasing penalties (RAISED from 6/9/12 to 8/12/16)
  MODERATE_BARS: 8,   // 8+ bars = +15 reversal score (was 6)
  HIGH_BARS: 12,      // 12+ bars = +25 reversal score (was 9)
  EXTREME_BARS: 16,   // 16+ bars = +35 reversal score (exhausted momentum) (was 12)
  // Penalty scores for each level
  PENALTY_MODERATE: 15,
  PENALTY_HIGH: 25,
  PENALTY_EXTREME: 35,
} as const;

// ============= CONTINUATION MODE PARAMETERS =============
// Allows entries at higher ADX (40-75) when ALL factors are strongly aligned
// This is a separate trade archetype from pullback/breakout - captures impulse follow-through
// UPDATED: Expanded ADX range to 40-75 to allow super-strong trends (previously 45-55 was too narrow)
export const CONTINUATION_MODE_PARAMS = {
  // Enable continuation mode
  ENABLED: true,
  
  // ===== ADX REQUIREMENTS =====
  // ADX range for continuation entries (above normal "exhaustion" threshold)
  // UPDATED: Expanded from 45-55 to 40-75 - ADX 60-70 with rising momentum is CONTINUATION, not exhaustion
  MIN_ADX: 40,
  MAX_ADX: 75,
  // ADX must not be falling sharply
  REQUIRE_ADX_NOT_FALLING: true,
  // UPDATED: More tolerance for brief dips (was -0.5)
  ADX_FALLING_THRESHOLD: -1.0, // ADX slope below this = "falling"
  
  // ===== TREND STRUCTURE GATES (NON-NEGOTIABLE) =====
  // 1h must be strongly bullish/bearish
  MIN_1H_CONFIDENCE: 70,
  // 4h must match direction or be neutral (never opposing)
  ALLOW_4H_NEUTRAL: true,
  BLOCK_4H_OPPOSING: true,
  
  // ===== MOMENTUM GATES =====
  // Momentum score must be ABOVE standard threshold
  MIN_MOMENTUM_SCORE: 35,
  // No divergence allowed (RSI/MACD divergence blocks entry)
  BLOCK_ON_DIVERGENCE: true,
  
  // ===== PRICE ACTION GATES =====
  // Higher high + higher low for LONG (or lower low + lower high for SHORT)
  REQUIRE_STRUCTURE_CONFIRMATION: true,
  // Entry only on continuation candle (current candle in trend direction)
  REQUIRE_CONTINUATION_CANDLE: true,
  // OR break-and-hold above prior local high/low
  ALLOW_BREAKOUT_ENTRY: true,
  
  // ===== VOLATILITY CONTROL =====
  // Block if candle > 2x ATR (parabolic move)
  MAX_CANDLE_SIZE_ATR: 2.0,
  
  // ===== STOCHRSI SAFETY =====
  // Maximum StochRSI K for LONG continuation (not at absolute extreme)
  MAX_STOCHRSI_K_LONG: 92,
  MIN_STOCHRSI_K_SHORT: 8,
  
  // ===== POSITION SIZING =====
  // Base position size multiplier (55% of normal for safety)
  POSITION_SIZE_MULTIPLIER: 0.55,
  
  // ===== EXIT LOGIC PARAMETERS =====
  // Faster partial at +0.8R to +1R
  PARTIAL_EXIT_R_MULTIPLE: 0.8,
  PARTIAL_EXIT_PERCENT: 50, // Take 50% off at 0.8R
  // Use structure-based trailing instead of ATR
  USE_STRUCTURE_TRAILING: true,
  // Immediate exit triggers
  EXIT_ON_MOMENTUM_ROLLOVER: true,
  EXIT_ON_ADX_FLATTEN_PLUS_BEARISH_CANDLE: true,
} as const;

// ============= MOMENTUM CONTINUATION PARAMETERS =============
// Allows catching trend continuation during strong moves even when StochRSI is at extremes
// This addresses the issue of missing 3%+ price moves because StochRSI was already oversold/overbought
export const MOMENTUM_CONTINUATION_PARAMS = {
  // Enable momentum continuation exception
  ENABLED: true,
  
  // ===== STOCHRSI "NOT FALLING" GATE RELAXATION =====
  // Standard rule: Block SHORT if K < 10 and K >= D (not falling)
  // Exception: Allow if ADX >= this threshold and price action confirms
  MIN_ADX_FOR_OVERRIDE: 22,  // Lowered from 25 to allow momentum in slightly weaker trends
  // Minimum 4h confidence for continuation override
  MIN_4H_CONFIDENCE: 60,
  // Position size multiplier when using this exception (reduced for safety)
  POSITION_SIZE_MULTIPLIER: 0.75,  // 75% of normal position
  
  // ===== PRICE ACTION MOMENTUM DETECTION =====
  // If price dropped/rose this much in recent hours, consider trend continuation likely
  PRICE_MOVE_THRESHOLD_PERCENT: 1.5,  // 1.5% move - lowered to catch smaller but significant moves earlier
  PRICE_MOVE_LOOKBACK_HOURS: 6,       // Look back 6 hours (6 1h candles)
  // Override neutral alignment when price action confirms direction
  OVERRIDE_NEUTRAL_ALIGNMENT: true,
  // ADX requirement for price action override - TIERED based on move strength
  // For 2%+ moves, ADX 18 is enough (price action is clear)
  // For 1.5-2% moves, ADX 20 required
  MIN_ADX_FOR_PRICE_ACTION: 18,       // Lowered from 22 - a 2.8% move with ADX 20.7 is clearly trending!
  MIN_ADX_FOR_MODERATE_MOVE: 20,      // Slightly higher for smaller moves
  
  // ===== EXHAUSTION SENSITIVITY (LOWERED) =====
  // Require MORE bars at extreme before blocking (was 4, now 8)
  MIN_BARS_AT_EXTREME_FOR_BLOCK: 8,
  // Also require price divergence (price moving opposite to indicator) before blocking
  REQUIRE_PRICE_DIVERGENCE_FOR_BLOCK: true,
  
  // ===== STRONG MOVE CONTINUATION =====
  // For catching continuation during very strong moves
  STRONG_MOVE_THRESHOLD_PERCENT: 2.0,  // 2.0% move in lookback period (lowered from 2.5%)
  STRONG_MOVE_MIN_ADX: 18,             // Lowered from 23 - strong price moves override weak ADX
  // Ignore StochRSI extremes if MACD histogram is expanding in trend direction
  ALLOW_WITH_MACD_EXPANSION: true,
  
  // ===== SAFETY LIMITS =====
  // Maximum continuation trades per symbol per day (prevents overexposure)
  MAX_CONTINUATION_TRADES_PER_DAY: 1,
  // Tighter stop loss multiplier for continuation entries at extremes
  STOP_LOSS_MULTIPLIER: 1.5,  // 1.5x ATR instead of 2x
} as const;

// ============= PHASE 2: TREND CONTINUATION AFTER EXIT =============
// Allows re-entry with relaxed thresholds after profitable exit
// Addresses: Missing continuation moves after taking profit too early
export const TREND_CONTINUATION_AFTER_EXIT_PARAMS = {
  // Enable this feature
  ENABLED: true,
  
  // ===== RECENT PROFITABLE EXIT DETECTION =====
  // How long ago can the profitable exit have been (hours)
  LOOKBACK_HOURS: 2,
  // Minimum profit % to qualify as "profitable exit"
  MIN_PROFIT_PERCENT: 2.0,
  // Only count take_profit closes, not stop losses
  REQUIRE_TP_EXIT: true,
  
  // ===== RELAXED STOCHRSI THRESHOLDS FOR RE-ENTRY =====
  // Allow LONG re-entry even when K is very high (normally blocked at 80+)
  MAX_STOCHRSI_K_LONG_REENTRY: 95,  // Allow up to K=95 for re-entry
  // Allow SHORT re-entry even when K is very low (normally blocked at 20-)
  MIN_STOCHRSI_K_SHORT_REENTRY: 5,   // Allow down to K=5 for re-entry
  
  // ===== ADX REQUIREMENTS =====
  // ADX must still be strong for re-entry
  MIN_ADX: 30,
  // ADX slope can be slightly negative (trend cruising, not accelerating)
  MIN_ADX_SLOPE: -0.3,
  
  // ===== POSITION SIZING =====
  // Reduced position size for re-entries (safety first)
  POSITION_SIZE_MULTIPLIER: 0.40,  // 40% of normal
  
  // ===== TREND DIRECTION MATCH =====
  // Re-entry must be same direction as original trade
  REQUIRE_SAME_DIRECTION: true,
  // 4h trend must still align
  MIN_HTF_4H_CONFIDENCE: 60,
  
  // ===== STOP LOSS TIGHTENING =====
  // Tighter stop for re-entries (use 1.5% instead of normal)
  TIGHT_STOP_PERCENT: 1.5,
} as const;

// ============= PHASE 3: STRONG TREND BOLLINGER EXTENSION =============
// Allows entries at %B > 97 when trend is exceptionally strong
// Addresses: Missing continuation when price stays above upper band
export const STRONG_TREND_BOLLINGER_EXTENSION_PARAMS = {
  // Enable this feature
  ENABLED: true,
  
  // ===== EXTENDED %B THRESHOLDS =====
  // Maximum %B for LONG when strong trend (beyond normal 97 cap)
  EXTENDED_MAX_PERCENT_B_LONG: 105,   // Allow up to 105% (5% outside upper band)
  // Minimum %B for SHORT when strong trend (beyond normal 3 cap)
  EXTENDED_MIN_PERCENT_B_SHORT: -5,   // Allow down to -5% (5% outside lower band)
  
  // ===== ADX REQUIREMENTS FOR EXTENSION =====
  // Very high ADX required for this extension
  MIN_ADX: 45,
  // ADX slope can be flat but not falling sharply
  MIN_ADX_SLOPE: -0.2,
  // DI gap must be strong
  MIN_DI_GAP: 12,
  
  // ===== HTF ALIGNMENT =====
  // 4h must strongly align
  MIN_HTF_4H_CONFIDENCE: 70,
  REQUIRE_HTF_ALIGNED: true,
  
  // ===== POSITION SIZING =====
  // Reduced position for extended entries
  POSITION_SIZE_MULTIPLIER: 0.35,  // 35% of normal
  
  // ===== STOP LOSS TIGHTENING =====
  // Tighter stop for extended entries
  TIGHT_STOP_PERCENT: 1.5,
  
  // ===== STOCHRSI SAFETY =====
  // StochRSI must not be at absolute extreme (still has some room)
  MAX_STOCHRSI_K_LONG: 96,   // Block if K >= 96
  MIN_STOCHRSI_K_SHORT: 4,   // Block if K <= 4
} as const;

// ============= PHASE 4: EARLY TREND DETECTION =============
// Catch trends earlier when ADX is rising and direction is clear
// Addresses: Missing early moves because waiting for ADX >= 25
export const EARLY_TREND_DETECTION_PARAMS = {
  // Enable this feature
  ENABLED: true,
  
  // ===== ADX RISING DETECTION =====
  // Minimum ADX for early entry (lower than normal 25 threshold)
  MIN_ADX: 18,
  // ADX must be rising (positive slope)
  MIN_ADX_SLOPE: 0.1,  // Slope > 0.1 = clearly rising
  
  // ===== TIMEFRAME ALIGNMENT =====
  // Both 4h and 1h must agree on direction
  REQUIRE_4H_1H_ALIGNMENT: true,
  // Minimum confidence on each timeframe
  MIN_4H_CONFIDENCE: 55,
  MIN_1H_CONFIDENCE: 55,
  
  // ===== STOCHRSI LOADING ZONE =====
  // StochRSI must be in "loading" zone (not at extremes)
  // This catches moves BEFORE they become overbought/oversold
  LONG_STOCHRSI_MIN: 30,   // K must be >= 30
  LONG_STOCHRSI_MAX: 70,   // K must be <= 70
  SHORT_STOCHRSI_MIN: 30,  // K must be >= 30
  SHORT_STOCHRSI_MAX: 70,  // K must be <= 70
  
  // ===== VOLUME CONFIRMATION =====
  // Volume should be above average for early entries
  REQUIRE_ABOVE_AVERAGE_VOLUME: true,
  MIN_VOLUME_RATIO: 1.1,  // 10% above average
  
  // ===== POSITION SIZING =====
  // Moderate position size for early entries
  POSITION_SIZE_MULTIPLIER: 0.50,  // 50% of normal
  
  // ===== ENTRY TYPE LOGGING =====
  ENTRY_TYPE_LABEL: "EARLY_TREND_DETECTION",
} as const;

// ============= BOLLINGER TIERED BYPASS FOR STRONG TREND RE-ENTRIES =============
// Allows LONG entries at %B 90-97 when trend is confirmed strong
// Similar to StochRSI tiered bypass - graduated access based on ADX/DI
// Addresses missed continuation trades when %B is high but trend is valid
export const BOLLINGER_TIERED_BYPASS_PARAMS = {
  // Enable tiered bypass for high %B entries
  ENABLED: true,
  
  // Base %B threshold (no bypass)
  BASE_MAX_PERCENT_B_LONG: 90,      // Default: block LONG above 90
  BASE_MIN_PERCENT_B_SHORT: 10,     // Default: block SHORT below 10
  
  // Absolute ceiling - NEVER bypass above this
  ABSOLUTE_MAX_PERCENT_B_LONG: 97,  // Hard cap: no LONG above 97
  ABSOLUTE_MIN_PERCENT_B_SHORT: 3,  // Hard cap: no SHORT below 3
  
  // Extended ceiling for confirmed HTF bypass scenarios (strong trend already validated)
  HTF_BYPASS_EXTENDED_MAX_PERCENT_B_LONG: 115,  // Allow up to 115% when HTF bypass confirmed
  HTF_BYPASS_EXTENDED_MIN_PERCENT_B_SHORT: -15, // Allow down to -15% when HTF bypass confirmed
  
  // ============= TIER 1: Moderate trend (conditional allow %B 90-95) =============
  TIER1: {
    MAX_PERCENT_B_LONG: 95,
    MIN_PERCENT_B_SHORT: 5,
    MIN_ADX: 25,
    MIN_ADX_SLOPE: 0.02,
    MIN_DI_GAP: 10,
    POSITION_SIZE: 40,  // 40% position size
    REQUIRE_CONTINUATION: true,  // Must be re-entry/continuation
  },
  
  // ============= TIER 2: Strong trend (allow %B 90-97) =============
  TIER2: {
    MAX_PERCENT_B_LONG: 97,
    MIN_PERCENT_B_SHORT: 3,
    MIN_ADX: 35,
    MIN_ADX_SLOPE: 0.03,
    MIN_DI_GAP: 15,
    POSITION_SIZE: 50,  // 50% position size
    REQUIRE_CONTINUATION: true,
  },
  
  // ============= TIER 3: Very strong trend (allow %B 90-97 with higher size) =============
  TIER3: {
    MAX_PERCENT_B_LONG: 97,
    MIN_PERCENT_B_SHORT: 3,
    MIN_ADX: 40,
    MIN_ADX_SLOPE: 0,     // Not falling
    MIN_DI_GAP: 18,
    POSITION_SIZE: 60,    // 60% position size
    REQUIRE_CONTINUATION: false,  // Can be initial entry at tier 3
  },
  
// ============= SAFETY GATES (All must pass) =============
  // Exhaustion check - block if exhausted
  REQUIRE_NO_EXHAUSTION: true,
  
  // HTF alignment requirement
  MIN_HTF_4H_CONFIDENCE: 65,  // 4h must be 65%+ aligned
  REQUIRE_HTF_ALIGNED: true,
  
  // Entry type detection
  IS_CONTINUATION_LOOKBACK_MINUTES: 240,  // 4 hours - if closed position in last 4h, it's re-entry
  
  // ============= PRICE ACTION CONFIRMATION (At least ONE must pass) =============
  // Prevents chasing single-candle expansions at extreme %B
  REQUIRE_PRICE_ACTION_CONFIRMATION: true,
  
  // 1. Shallow pullback - must be ≤ 38.2% Fib retracement (not chasing overextended move)
  SHALLOW_PULLBACK_MAX_DEPTH: 38.2,
  
  // 2. Higher-low/Lower-high structure - trend structure must be intact
  //    Checked via detectHigherHighLow / detectLowerLowHigh
  STRUCTURE_LOOKBACK_BARS: 10,
  
  // 3. Consolidation/Flag detection - low volatility before breakout
  //    Requires current candle range < ATR * multiplier AND recent candles compacting
  CONSOLIDATION_MAX_CANDLE_ATR: 0.6,    // Current candle must be < 0.6x ATR
  CONSOLIDATION_LOOKBACK_BARS: 4,       // Check last 4 candles for compression
  CONSOLIDATION_COMPRESSION_FACTOR: 0.8, // Each candle range should be ≤ 80% of average
  
  // 4. Wick rejection cluster detection - blocks if too many wick rejections near band
  //    Long entries blocked if upper wicks > 50% of candle range on 3+ of last 5 candles
  //    Short entries blocked if lower wicks > 50% of candle range on 3+ of last 5 candles
  WICK_REJECTION_LOOKBACK_BARS: 5,
  WICK_REJECTION_MIN_COUNT: 3,          // Min candles with rejection wicks
  WICK_REJECTION_WICK_PERCENT: 50,      // Wick must be > 50% of candle range
} as const;

// ============= TREND ACCELERATION PARAMETERS =============
// Allows catching strong price moves (3%+) that would otherwise be blocked by:
// - NO_MOMENTUM_CONFIRMATION (ADX < 28)
// - BOLLINGER_POSITION_FILTER (price above upper/below lower band)
// These gates are designed for normal conditions but miss accelerating trends
export const TREND_ACCELERATION_PARAMS = {
  // Enable trend acceleration exception
  ENABLED: true,
  
  // ===== PRICE ACTION DETECTION =====
  // Minimum price move to qualify as "acceleration" (strong move)
  MIN_PRICE_MOVE_PERCENT: 2.5,
  // Lookback period for price move detection (hours)
  LOOKBACK_HOURS: 6,
  // Strong price move that gets higher priority
  STRONG_PRICE_MOVE_PERCENT: 3.5,
  
  // ===== ADX REQUIREMENTS FOR OVERRIDE =====
  // Minimum ADX to allow momentum gate bypass (lower than normal 28 threshold)
  MIN_ADX_FOR_MOMENTUM_BYPASS: 20,
  // ADX must be rising for the override to apply
  REQUIRE_ADX_RISING: true,
  // ADX crossing this threshold opens "building trend window"
  ADX_BUILDING_THRESHOLD: 23,
  
  // ===== STOCHRSI SAFETY LIMITS =====
  // Maximum StochRSI K for LONG acceleration entries (not at extreme)
  MAX_STOCHRSI_K_FOR_LONG: 88,
  // Minimum StochRSI K for SHORT acceleration entries
  MIN_STOCHRSI_K_FOR_SHORT: 12,
  
  // ===== BOLLINGER OVERRIDE =====
  // Allow longs above upper band if:
  // - ADX rising + price move >= threshold + StochRSI < 90
  BOLLINGER_OVERRIDE_MAX_PERCENT_B_LONG: 130,
  // Allow shorts below lower band if:
  // - ADX rising + price move >= threshold + StochRSI > 10
  BOLLINGER_OVERRIDE_MIN_PERCENT_B_SHORT: -30,
  
  // ===== POSITION SIZE ADJUSTMENTS =====
  // Position size multiplier for acceleration entries (reduced for safety)
  POSITION_SIZE_MULTIPLIER: 0.70,
  // Extra reduction when price is very extended (overextended entry)
  OVEREXTENDED_POSITION_MULTIPLIER: 0.50,
  // Overextended threshold (price move > this gets extra reduction)
  OVEREXTENDED_MOVE_PERCENT: 5.0,
  
  // ===== 4H REQUIREMENTS =====
  // Minimum 4h confidence for acceleration override
  MIN_4H_CONFIDENCE: 55,
  // If 4h trend is directional and matches, boost allowance
  HTF_MATCH_RELAXES_STOCHRSI: true,
  // With HTF match, relax StochRSI limits by this much
  HTF_MATCH_STOCHRSI_RELAXATION: 5,
} as const;

export const RSI_THRESHOLDS = {
  OVERSOLD: 30,
  BEARISH_PULLBACK: 35,
  BULLISH_PULLBACK: 40,
  NEUTRAL_LOW: 45,
  NEUTRAL: 50,
  NEUTRAL_HIGH: 55,
  BEARISH_RALLY: 60,
  BULLISH_STRONG: 65,
  OVERBOUGHT: 70,
} as const;

export const CONFIDENCE_THRESHOLDS = {
  VERY_LOW: 40,
  LOW: 50,
  OPTIMAL_LOWER: 50,
  OPTIMAL_UPPER: 59,
  DEAD_ZONE_LOWER: 60,
  STRONG_1H_MIN: 62,
  HTF_EXCEPTION: 65,
  STRONG_4H: 68,
  DEAD_ZONE_UPPER: 69,
  PULLBACK_4H_MIN: 70,
  RECOVERY_MAX: 70,
  STRONG_1H_REVERSAL: 75,
  // REMOVED: Confidence penalty thresholds - high confidence is now REWARDED not penalized
  // See scoring.ts getConfidencePenalty() for rationale
  // PENALTY_LIGHT: 70,      // REMOVED
  // PENALTY_MODERATE: 75,   // REMOVED
  // PENALTY_STRONG: 80,     // REMOVED
  // PENALTY_HEAVY: 85,      // REMOVED
  WEAK_4H: 58,
  STRONG_ALIGNMENT_1H: 55,
} as const;

export const RISK_PARAMS = {
  // ADJUSTED: Increased from 0.3% to 0.5% to give positions more room to develop
  // BTC positions were hitting break-even too early, preventing +1% profit targets
  BREAK_EVEN_ACTIVATION_PERCENT: 0.5,
  // SCENARIO 5 FIX: Context-aware break-even - use 1.0% for strong trends (ADX >= 30)
  // Strong trends often retest 0.3–0.6%, so tighter break-even converts winners into scratches
  BREAK_EVEN_STRONG_TREND_ACTIVATION_PERCENT: 1.0,
  // PHASE 3: TRAILING_STOP_ACTIVATION_PERCENT is now a FALLBACK for positions without valid stop loss
  // Primary activation is R-multiple based (see R_MULTIPLE_TRAILING_PARAMS below)
  TRAILING_STOP_ACTIVATION_PERCENT: 0.7,
  MIN_STOP_DISTANCE_PERCENT: 1.0,
  TRAILING_PROFIT_LOCK_PERCENT: 0.5,
  // Base quality threshold - RAISED from 55 to 65 to compensate for removing confidence penalty
  // Confidence penalty was applying -25 to -8 points for high confidence (which is wrong)
  // Now that it's removed, scores will be ~10-20 points higher, so threshold raised accordingly
  // Dynamic adjustments still apply:
  // - 55 for strong 1h confidence (>=65%) - raised from 45
  // - 60 for exceptional ADX (>=35) - raised from 50
  // - 63 for strong ADX (>=25) - raised from 53
  // - 65 base threshold - raised from 55
  // - 45 for neutral strategies - raised from 35
  // - 75 in recovery mode - raised from 65
  MIN_QUALITY_THRESHOLD: 65,
} as const;

// ============= PHASE 3: R-MULTIPLE TRAILING PARAMETERS =============
// Ties trailing activation to R-multiple instead of fixed percentage
// R = (currentPrice - entry) / (entry - stopLoss) for longs, inverted for shorts
export const R_MULTIPLE_TRAILING_PARAMS = {
  // Activate trailing at 1.2R (120% of risk captured as profit)
  ACTIVATION_R_MULTIPLE: 1.2,
  // Maximum tightening speed per hour (prevents death by a thousand cuts)
  MAX_TIGHTENING_R_PER_HOUR: 0.3,
  // Minimum time between stop tightening updates (minutes)
  MIN_TIGHTENING_INTERVAL_MINUTES: 10,
  // Fallback to percent-based activation if stop_loss is null or invalid
  FALLBACK_TO_PERCENT: true,
} as const;

// ============= SMART AITS DECAY VELOCITY TIERS =============
// Tiered decay velocity thresholds based on trend strength
// Strong trends get more tolerance for pullbacks (normal retracements)
// Addresses the BTCUSDT case where 0.03%/min threshold exited too early
export const DECAY_VELOCITY_TIERS = {
  // Minimum observation time before evaluating decay velocity
  // Prevents false positives from brief sub-minute pullbacks
  MIN_OBSERVATION_MINUTES: 2,
  
  // Base tier (tightened for weak/misaligned trends)
  // Reduced from 0.03 → 0.025 (~17% tighter) to capture peaks faster in BASE tier
  // This only affects positions in weak/misaligned conditions (ADX < 25)
  BASE_EXIT_PER_MINUTE: 0.025,       // 2.5%/min decay triggers exit (was 3%)
  BASE_MAX_DECAY_MINUTES: 8,         // Max 8 minutes of decay before forced exit (was 10)
  
  // Tier 1: Moderate trend (ADX 25-30)
  TIER1_MIN_ADX: 25,
  TIER1_MIN_ADX_SLOPE: 0,            // Not falling
  TIER1_EXIT_PER_MINUTE: 0.05,       // 5%/min tolerance
  TIER1_MAX_DECAY_MINUTES: 15,       // 15 min cap
  
  // Tier 2: Strong trend (ADX 30-35)
  TIER2_MIN_ADX: 30,
  TIER2_MIN_ADX_SLOPE: 0.02,         // Rising
  TIER2_EXIT_PER_MINUTE: 0.07,       // 7%/min tolerance
  TIER2_MAX_DECAY_MINUTES: 20,       // 20 min cap
  
  // Tier 3: Very strong trend (ADX 35-40)
  TIER3_MIN_ADX: 35,
  TIER3_MIN_ADX_SLOPE: 0.03,         // Clearly rising
  TIER3_EXIT_PER_MINUTE: 0.10,       // 10%/min tolerance
  TIER3_MAX_DECAY_MINUTES: 30,       // 30 min cap
  
  // Tier 4: Extremely strong trend (ADX >= 40)
  // Maximum tolerance for very strong volatility pullbacks
  TIER4_MIN_ADX: 40,
  TIER4_MIN_ADX_SLOPE: 0.02,         // Rising (relaxed from 0.03)
  TIER4_EXIT_PER_MINUTE: 0.15,       // 15%/min tolerance - handles strong trend volatility
  TIER4_MAX_DECAY_MINUTES: 45,       // 45 min cap for extended moves
  
  // Force exit threshold: minimum decay velocity for time-based exit
  FORCE_EXIT_MIN_VELOCITY: 0.02,     // 2%/min - any decay above this can trigger time cap
} as const;

// ============= MICRO-PROFIT LOCK PARAMETERS =============
// NEW: Fill the gap between 0% and break-even activation (0.30%)
// Prevents profitable excursions from fully retracing to entry
// Key insight: Any favorable movement is signal confirmation worth monetizing
export const MICRO_PROFIT_LOCK_PARAMS = {
  ENABLED: true,
  // FEE-AWARE MICRO TIERS (v2.0):
  // CRITICAL FIX: Remove tiers below fee coverage (~0.22% round-trip fees)
  // Previous tiers at 0.15%, 0.20% locked in guaranteed losses after fees
  // Now: Only lock BE once peak >= 0.22% (covers ~0.20% fees + 0.02% buffer)
  // Each tier only moves stop UP - monotonic, never regresses
  TIERS: [
    // TRUE break-even: Only after fees are covered (0.22% = 0.20% fees + 0.02% buffer)
    { peakThreshold: 0.22, lockTarget: 0.0 },    // At 0.22% peak → TRUE break-even (net $0)
    { peakThreshold: 0.28, lockTarget: 0.05 },   // At 0.28% peak → lock +0.05% net
    { peakThreshold: 0.33, lockTarget: 0.10 },   // At 0.33% peak → lock +0.10% net
    { peakThreshold: 0.38, lockTarget: 0.15 },   // At 0.38% peak → lock +0.15% net
    { peakThreshold: 0.43, lockTarget: 0.20 },   // At 0.43% peak → lock +0.20% net
    { peakThreshold: 0.48, lockTarget: 0.25 },   // At 0.48% peak → lock +0.25% net
  ],
  // Handoff to progressive/break-even logic at this threshold
  HANDOFF_THRESHOLD: 0.50,
  // Slippage buffer: ensures locked profit survives execution
  SLIPPAGE_BUFFER_PERCENT: 0.02,
  // TRUE_BE_FLOOR: Minimum peak required before ANY protection triggers
  // Prevents "accept fee loss" scenarios that create artificial churn
  TRUE_BE_FLOOR_PERCENT: 0.22,
} as const;

// ============= PROGRESSIVE PROFIT LOCK PARAMETERS =============
// Bridge the gap between break-even (0.5%) and trailing activation (2.75%)
// Progressive locks are the PRIMARY profit capture mechanism up to 2.5% peak
// Decay velocity exits remain a FAILSAFE, not the main TP logic
export const PROGRESSIVE_PROFIT_LOCK_PARAMS = {
  // Enable progressive profit locking (works between break-even and trailing activation)
  ENABLED: true,
  // Define profit lock tiers: when peak P&L reaches threshold, lock to target
  // Extended tiers provide continuous profit protection from 0.50% to 2.50% peak
  // This ensures price-based locks are primary, decay exits are failsafe only
  TIERS: [
    // Standard tiers (0.50% - 0.80%)
    { peakThreshold: 0.50, lockTarget: 0.30 },  // At 0.50% peak → lock +0.30%
    { peakThreshold: 0.55, lockTarget: 0.35 },  // Lock +0.35% at +0.55% peak
    { peakThreshold: 0.60, lockTarget: 0.40 },  // Lock +0.40% at +0.60% peak
    { peakThreshold: 0.65, lockTarget: 0.45 },  // Lock +0.45% at +0.65% peak
    { peakThreshold: 0.70, lockTarget: 0.50 },  // Lock +0.50% at +0.70% peak
    { peakThreshold: 0.75, lockTarget: 0.55 },  // Lock +0.55% at +0.75% peak
    { peakThreshold: 0.80, lockTarget: 0.60 },  // Lock +0.60% at +0.80% peak
    // Extended tiers (0.90% - 2.50%) - NEW: Prevent over-reliance on decay exits
    { peakThreshold: 0.90, lockTarget: 0.70 },  // Lock +0.70% at +0.90% peak
    { peakThreshold: 1.00, lockTarget: 0.75 },  // Lock +0.75% at +1.00% peak
    { peakThreshold: 1.25, lockTarget: 0.95 },  // Lock +0.95% at +1.25% peak
    { peakThreshold: 1.50, lockTarget: 1.15 },  // Lock +1.15% at +1.50% peak
    { peakThreshold: 1.75, lockTarget: 1.35 },  // Lock +1.35% at +1.75% peak
    { peakThreshold: 2.00, lockTarget: 1.55 },  // Lock +1.55% at +2.00% peak
    { peakThreshold: 2.50, lockTarget: 2.00 },  // Lock +2.00% at +2.50% peak
  ],
  // Raised from 0.85 to 2.75 - progressive locks now control 0.50-2.50% range
  // Trailing stop takes over only for exceptional moves above 2.75%
  DEFER_TO_TRAILING_AT: 2.75,
} as const;

// Slippage buffer constants for stop loss calculations
export const SLIPPAGE_PARAMS = {
  // Buffer added to break-even stop to ensure small profit after execution slippage
  // Set to 0.05% above entry to protect against slippage/gaps
  BREAK_EVEN_BUFFER_PERCENT: 0.05,  // Increased from 0.03% to 0.05% for better protection
  // Round-trip slippage deducted from locked profit calculations
  ROUND_TRIP_SLIPPAGE_PERCENT: 0.05,
} as const;

// Quality score thresholds for signal generation
// ADJUSTED: All thresholds raised by ~10 points to compensate for removing confidence penalty
// Confidence penalty was incorrectly penalizing high multi-timeframe alignment by -25 to -8 points
// Now removed, so scores will naturally be higher - thresholds adjusted accordingly
export const QUALITY_THRESHOLDS = {
  // Base minimum quality score (standard conditions) - raised from 55 to 65
  BASE_MIN: 65,
  // Neutral trend threshold (relies on HTF for direction) - raised from 35 to 45
  NEUTRAL_MIN: 45,
  // Strong 1h signal threshold (1h confidence >= 65%) - raised from 45 to 55
  STRONG_1H_MIN: 55,
  // Very strong 1h signal threshold (1h confidence >= 75%) - allows lower quality with high 1h conviction
  VERY_STRONG_1H_MIN: 50,
  // Exceptional ADX threshold (ADX >= 35) - raised from 50 to 60
  EXCEPTIONAL_ADX_MIN: 60,
  // Strong ADX threshold (ADX >= 25) - raised from 53 to 63
  STRONG_ADX_MIN: 63,
  // NEW PHASE 2: Ultra-strong ADX threshold (ADX >= 50) - very high ADX IS the quality confirmation
  ULTRA_STRONG_ADX_MIN: 55,
  // NEW PHASE 2: Very high ADX threshold (ADX >= 45) - allows lower quality for confirmed strong trends
  VERY_HIGH_ADX_MIN: 58,
  // Recovery mode boost added to base threshold
  RECOVERY_BOOST: 10,
  // PHASE 1: Near miss threshold - signals within this many points of threshold are logged for analysis
  NEAR_MISS_THRESHOLD: 5,
  // SCENARIO 6 FIX: Maximum recovery quality threshold (caps escalation - Finding 9) - raised from 70 to 80
  MAX_RECOVERY_QUALITY: 80,
} as const;

// ============= SCENARIO 6: RECOVERY MODE PARAMETERS =============
// Comprehensive recovery mode improvements for state-aware exits and strict entry
export const RECOVERY_MODE_PARAMS = {
  // Finding 1: Recovery Exit Logic
  // Exit recovery when consecutive_wins >= this value
  CONSECUTIVE_WINS_EXIT: 2,
  // Exit recovery when drawdown drops below this (default from DB: 2%)
  DEFAULT_EXIT_DRAWDOWN_PERCENT: 2.0,
  
  // Finding 2: Conditional Confidence Cap
  // Hard reject above this if no deep pullback
  CONFIDENCE_HARD_CAP: 80,
  // Soft penalty range: 70-80 gets -10 quality score
  CONFIDENCE_SOFT_PENALTY_MIN: 70,
  CONFIDENCE_SOFT_PENALTY_MAX: 80,
  CONFIDENCE_SOFT_PENALTY_AMOUNT: 10,
  
  // Finding 4: Pullback Depth Scoring
  // Minimum pullback score required (0-3 points) - relaxed from 2 to 1 for trending markets
  MIN_PULLBACK_SCORE: 1,
  // RSI zone for pullback (40-55 for longs, inverted for shorts)
  RSI_PULLBACK_MIN: 40,
  RSI_PULLBACK_MAX: 55,
  // Fibonacci retrace range
  RETRACE_MIN_PERCENT: 38,
  RETRACE_MAX_PERCENT: 61,
  
  // Finding 5: Adaptive ADX Rule
  // Hard reject below this ADX
  ADX_HARD_MINIMUM: 23,
  // Soft zone: 23-25, allow if HTF strong (4h confidence >= 70)
  ADX_SOFT_ZONE_MIN: 23,
  ADX_SOFT_ZONE_MAX: 25,
  HTF_CONFIDENCE_FOR_SOFT_ADX: 70,
  
  // Finding 6: No First Candle Rule
  // Block entry on first continuation candle after pullback
  BLOCK_FIRST_CANDLE: true,
  
  // Finding 7: Dynamic Position Size
  // Base recovery size (from DB setting, typically 50%)
  // Position size = baseRecoverySize * clamp(qualityScore / MAX_QUALITY_FOR_SIZING, 0.5, 1.0)
  MAX_QUALITY_FOR_SIZING: 80,
  MIN_SIZE_MULTIPLIER: 0.5,
  MAX_SIZE_MULTIPLIER: 1.0,
  
  // Finding 8: Cooldown After Recovery Loss
  // Cooldown duration in minutes after a recovery loss
  COOLDOWN_MINUTES: 10,  // 2 candles @ 5min
  
  // Finding 10: Recovery Trade Counter
  // Default max recovery trades per day (can be overridden in DB) - increased from 3 to 5
  DEFAULT_MAX_RECOVERY_TRADES: 5,
} as const;

// ============= PHASE 4 (9 FINDINGS): PRE-RECOVERY STATE PARAMETERS =============
// Finding 1: Soft Pre-Recovery State & Finding 4: Drawdown-Based Risk Scaling
// Prevents "last bad trade" by activating conservative rules BEFORE full recovery mode
export const PRE_RECOVERY_PARAMS = {
  // Finding 1: Pre-Recovery Soft State
  // Activate pre-recovery at (threshold - 1) consecutive losses
  ACTIVATION_THRESHOLD_OFFSET: 1,
  // Position size reduction in pre-recovery state (35% reduction)
  POSITION_SIZE_REDUCTION: 0.35,
  // Pre-recovery requires either deep pullback OR squeeze breakout
  REQUIRE_DEEP_PULLBACK: true,
  REQUIRE_SQUEEZE_BREAKOUT: true,
  // Block continuation entries without structure in pre-recovery
  BLOCK_CONTINUATION_WITHOUT_STRUCTURE: true,
  // Deep pullback thresholds (RSI + BB conditions)
  DEEP_PULLBACK_RSI_LONG: 35,   // RSI must be below this for LONG pullback
  DEEP_PULLBACK_RSI_SHORT: 65,  // RSI must be above this for SHORT pullback
  DEEP_PULLBACK_DEPTH_MIN: 50,  // Minimum pullback depth percentage
  
  // Finding 4: Drawdown-Based Risk Scaling (graduated position reduction)
  // Applied in NORMAL mode, before recovery threshold
  CONSECUTIVE_LOSSES_2_REDUCTION: 0.20,  // 20% position reduction at 2 losses
  CONSECUTIVE_LOSSES_3_REDUCTION: 0.35,  // 35% position reduction at 3 losses
} as const;

// ============= PHASE 4 (9 FINDINGS): REGIME SCORE PARAMETERS =============
// Finding 2 & 5: Market Regime Confidence Gate + Graduated Penalties
export const REGIME_SCORE_PARAMS = {
  // Finding 2: Market Regime Confidence Gate
  // Block continuation entries when regimeScore < this threshold
  BLOCK_CONTINUATION_BELOW: 45,
  // Only allow pullback/squeeze setups when regimeScore < this threshold
  ONLY_PULLBACK_SQUEEZE_BELOW: 40,
  
  // Finding 5: Graduated Penalties (soft suppression)
  // ADX 18-22 transition zone penalty (instead of binary gate)
  ADX_TRANSITION_ZONE_MIN: 18,
  ADX_TRANSITION_ZONE_MAX: 22,
  ADX_TRANSITION_ZONE_PENALTY: 10,
  
  // HTF slope flattening penalty (when 4h EMA slope is near zero)
  HTF_FLATTENING_SLOPE_THRESHOLD: 0.1,
  HTF_FLATTENING_PENALTY: 10,
  
  // Regime score component weights
  WEIGHT_ADX: 30,           // Max 30 points from ADX
  WEIGHT_CONFIDENCE: 20,    // Max 20 points from confidence
  WEIGHT_CONSISTENCY: 15,   // Max 15 points from consistency
  WEIGHT_HTF_ALIGNMENT: 15, // Max 15 points from HTF alignment
  WEIGHT_MOMENTUM: 10,      // Max 10 points from momentum
  WEIGHT_VOLUME: 10,        // Max 10 points from volume
  
  // ATR volatility penalties
  HIGH_ATR_PERCENT: 2.5,
  EXTREME_ATR_PERCENT: 3.0,
  HIGH_ATR_PENALTY: 10,
  EXTREME_ATR_PENALTY: 20,
} as const;

// ============= PHASE 4 (9 FINDINGS): LOSS CLUSTERING PARAMETERS =============
// Finding 7: Loss-Clustering Protection - Cooldown after low-quality losses
export const LOSS_CLUSTERING_PARAMS = {
  // Cooldown duration in candles after a low-quality loss
  COOLDOWN_CANDLES: 2,
  // Quality threshold for triggering cooldown (below median quality)
  QUALITY_THRESHOLD_PERCENT: 50,
  // Cooldown duration in minutes (for 5-min candles: 2 candles = 10 min)
  COOLDOWN_MINUTES: 10,
} as const;

// ============= PHASE 7 (9 FINDINGS): GRADUATED QUALITY PENALTIES =============
// Finding 7: Apply graduated penalties based on quality score tiers
// Lower quality trades get progressively reduced position sizes
export const GRADUATED_QUALITY_PARAMS = {
  // Quality score tiers for graduated penalties
  EXCELLENT_MIN: 85,      // 85+: Full position size
  GOOD_MIN: 75,           // 75-84: 90% position size
  ACCEPTABLE_MIN: 65,     // 65-74: 75% position size
  MARGINAL_MIN: 55,       // 55-64: 60% position size (minimum threshold)
  
  // Position size multipliers for each tier
  EXCELLENT_MULTIPLIER: 1.0,   // Full size
  GOOD_MULTIPLIER: 0.90,       // 90%
  ACCEPTABLE_MULTIPLIER: 0.75, // 75%
  MARGINAL_MULTIPLIER: 0.60,   // 60%
  
  // Recovery mode penalty - additional reduction for recovery trades
  RECOVERY_MODE_PENALTY: 0.10, // Extra 10% reduction in recovery mode
  
  // Pre-recovery mode penalty - slight reduction before full recovery
  PRE_RECOVERY_PENALTY: 0.05, // Extra 5% reduction in pre-recovery
} as const;

// ============= PHASE 8 (9 FINDINGS): RECOVERY EXIT PARAMETERS =============
// Finding 8: Recovery Exit Logic - Exit recovery mode on consecutive wins or drawdown recovery
export const RECOVERY_EXIT_PARAMS = {
  // Exit recovery after N consecutive wins (2 wins = trend is regained)
  CONSECUTIVE_WINS_FOR_EXIT: 2,
  // Exit recovery when equity drawdown recovers to this % from peak
  DRAWDOWN_RECOVERY_PERCENT: 1.5,
  // Minimum trades in recovery before allowing exit (prevent premature exit)
  MIN_TRADES_BEFORE_EXIT: 1,
  // Track win rate in recovery - if >= this, consider exiting early
  MIN_RECOVERY_WIN_RATE: 60,
  // Alternative exit: 3 out of last 4 trades are wins
  WINS_IN_LAST_N_FOR_EXIT: 3,
  LAST_N_TRADES_WINDOW: 4,
} as const;

// ============= PHASE 2: RISK SEPARATION THRESHOLDS =============
// Separates continuation risk (position size) from reversal probability (hard block)
export const RISK_SEPARATION_THRESHOLDS = {
  // Continuation Risk: Overbought/oversold zones, momentum exhaustion
  // → Affects position size only, never blocks trades
  CONTINUATION_RISK: {
    LOW: 20,      // 0-20: No reduction
    MEDIUM: 40,   // 20-40: 25% position reduction
    HIGH: 60,     // 40-60: 50% position reduction
    EXTREME: 80,  // 60+: 60% position reduction (max)
  },
  // Reversal Probability: Divergence, HTF conflict, multiple opposing signals
  // → Can block trades when probability is high enough
  REVERSAL_PROBABILITY: {
    LOW: 30,      // 0-30: Normal execution
    MEDIUM: 50,   // 30-50: Reduce position + log warning
    HIGH: 65,     // 50-65: Strongly consider blocking
    BLOCK: 75,    // 65+: Hard block - actual reversal likely
  },
} as const;

// ============= PHASE 1 FIX: REVERSAL OVERRIDE SAFETY THRESHOLDS =============
// Mandatory safety gates for reversal override feature
export const REVERSAL_OVERRIDE_SAFETY = {
  // ADX must be BELOW this to allow reversal override (no reversals in strong trends)
  MAX_ADX_FOR_REVERSAL: 30,
  // Minimum unified reversal score required to allow reversal override
  MIN_REVERSAL_SCORE: 65,
  // Maximum 4h HTF confidence in original direction before blocking reversal
  MAX_HTF_CONFIDENCE_AGAINST: 65,
  // Position size cap for reversal entries
  MAX_POSITION_SIZE_PERCENT: 40,
  // Minimum required R:R for reversal entries
  MIN_REQUIRED_RR: 2.2,
} as const;

// ============= PHASE 1 FIX: BREAKOUT DEFINITION THRESHOLDS =============
// Tighter breakout definition to prevent late entries
export const BREAKOUT_THRESHOLDS = {
  // Minimum %B for valid breakout (was 70, now 80)
  MIN_PERCENT_B: 80,
  // Minimum volume ratio for breakout confirmation
  MIN_VOLUME_RATIO: 1.5,
  // Minimum bandwidth expansion factor (current vs recent avg)
  MIN_BANDWIDTH_EXPANSION: 1.1,
  // For short breakouts, max %B
  MAX_PERCENT_B_SHORT: 20,
} as const;

// ============= PHASE 2: COMPONENT CAPS =============
// Context-aware maximum contributions per indicator to prevent single-indicator domination
export const COMPONENT_CAPS = {
  // StochRSI maximum penalty contribution
  STOCHRSI: {
    DEFAULT: 35,
    STRONG_TREND: 20,        // ADX >= 30 reduces StochRSI impact
    BREAKOUT_MODE: 15,       // Breakout mode further reduces
    MOMENTUM_CONFIRMED: 25,  // Active momentum reduces slightly
  },
  // Momentum maximum penalty contribution
  MOMENTUM: {
    DEFAULT: 30,
    ACTIVE_MOMENTUM: 15,     // Building/confirmed momentum reduces own penalty cap
    STRONG_TREND: 20,        // Strong trend reduces momentum penalty impact
  },
  // MACD maximum penalty contribution
  MACD: {
    DEFAULT: 15,
    EXPANDING: 8,            // Expanding MACD reduces its own penalty cap
  },
  // Timeframe conflict maximum penalty contribution
  TIMEFRAME: {
    DEFAULT: 20,
    PARTIAL_ALIGNMENT: 12,   // 1h+30m aligned reduces 4h conflict impact
  },
} as const;

// ============= BREAKOUT MODE PARAMETERS =============
// PHASE 1 IMPROVEMENT: Explicit breakout mode flag with reduced penalties
export const BREAKOUT_MODE_PARAMS = {
  // StochRSI penalty reduction when in breakout mode (50% = half penalty)
  STOCHRSI_PENALTY_REDUCTION: 0.5,
  // Minimum volume ratio required to confirm breakout
  MIN_VOLUME_RATIO: 1.3,
  // Minimum squeeze percent (4h) to qualify as breakout setup
  MIN_SQUEEZE_PERCENT: 50,
  // ADX must be rising for valid breakout
  REQUIRE_ADX_RISING: true,
  // Momentum must be building/confirmed for breakout
  REQUIRE_MOMENTUM_BUILDING: true,
} as const;

// ============= PHASE 2: MICRO-TREND HARDENING PARAMETERS =============
// Stricter requirements for micro-trend bypass when 4h is neutral
export const MICRO_TREND_PARAMS = {
  // MANDATORY: Minimum ADX required for micro-trend bypass
  // LOWERED from 25 to 23 to include edge cases like BNBUSDT (ADX 24.9)
  MIN_ADX: 23,
  // MANDATORY: Minimum consecutive bars the micro-trend must persist
  MIN_PERSISTENCE_BARS: 3,
  // MANDATORY: Volume must be above 20-period MA
  REQUIRE_VOLUME_CONFIRMATION: true,
  // Minimum volume ratio above average for confirmation
  MIN_VOLUME_RATIO: 1.0,
  // Time-bound expiry: micro-trend signals valid for N candles only
  VALID_FOR_CANDLES: 2,
  // Minimum alignment score required (now stricter)
  MIN_ALIGNMENT_SCORE: 60,  // Was 50
  // Minimum average confidence for lower TFs
  MIN_AVG_CONFIDENCE: 55,
  // Position size cap for micro-trend entries
  MAX_POSITION_SIZE_PERCENT: 60,
} as const;

// ============= PHASE 3: TREND STRENGTH SCORING =============
// Replaces boolean checks with quantified trend strength score
// Score >= 5 = full exception, score == 4 = partial exception, < 4 = reject
export const TREND_STRENGTH_PARAMS = {
  // Points for 4h confidence >= 60%
  CONFIDENCE_4H_POINTS: 2,
  CONFIDENCE_4H_THRESHOLD: 60,
  // Points for 1h confidence >= 55%
  CONFIDENCE_1H_POINTS: 1,
  CONFIDENCE_1H_THRESHOLD: 55,
  // Points for ADX levels
  ADX_STRONG_POINTS: 2,
  ADX_STRONG_THRESHOLD: 30,
  ADX_MODERATE_POINTS: 1,
  ADX_MODERATE_THRESHOLD: 25,
  // Points for active momentum
  MOMENTUM_ACTIVE_POINTS: 1,
  // Score thresholds for exception decisions
  FULL_EXCEPTION_THRESHOLD: 5,
  PARTIAL_EXCEPTION_THRESHOLD: 4,
} as const;

// ============= PHASE 3: EXCEPTION HIERARCHY & BUDGET =============
// Global priority order for exception types to prevent non-deterministic behavior
// EXCEPTION TYPES EXPLAINED:
// - REVERSAL_OVERRIDE: Entry against current trend based on reversal signals (highest risk, lowest priority for bypass)
// - STRONG_TREND: Entry during strong ADX trend that bypasses StochRSI extremes (medium risk)
// - MOMENTUM_CONTINUATION: Entry at StochRSI extremes when price action confirms trend continuation (medium risk)
// - MICRO_TREND: Entry during short-term micro-trend within neutral HTF (lowest risk exception)
// These exceptions allow entries that would normally be blocked, each with specific validation requirements
export const EXCEPTION_HIERARCHY = {
  // Priority order (1 = highest priority, processed first)
  // Lower number = more lenient (easier to grant exception)
  // Higher number = stricter (harder to grant exception, used as last resort)
  REVERSAL_OVERRIDE: 4,    // Last resort - going against trend is dangerous
  MOMENTUM_CONTINUATION: 3, // Medium priority - catching continuation at extremes
  STRONG_TREND: 2,          // Higher priority - strong ADX validates entry
  MICRO_TREND: 1,           // Highest priority - safest exception type
} as const;

export const EXCEPTION_BUDGET = {
  // Maximum exceptions allowed in last N trades
  MAX_EXCEPTIONS: 2,
  // Lookback window for exception counting
  LOOKBACK_TRADES: 10,
  // Position size reduction when budget exceeded
  OVER_BUDGET_POSITION_REDUCTION: 0.5,
  // Disable exceptions entirely when this many consecutive exceptions used
  DISABLE_THRESHOLD: 4,
} as const;

// Exception types for logging and tracking
// IMPORTANT: All edge functions (strategy-analyzer, execute-trade, monitor-positions) must handle all these types
// - REVERSAL_OVERRIDE: Trading against trend, requires early exit on trend resumption
// - STRONG_TREND: StochRSI bypass during strong ADX, use tighter stops
// - MOMENTUM_CONTINUATION: Entered at StochRSI extreme due to price action, extra divergence sensitivity
// - MICRO_TREND: Short-term trend within neutral HTF, time-bound expiry applies
// - NONE: Normal entry without exceptions
export type ExceptionType = 'REVERSAL_OVERRIDE' | 'STRONG_TREND' | 'MOMENTUM_CONTINUATION' | 'MICRO_TREND' | 'NONE';

export const ENTRY_TIMING_PARAMS = {
  // Base maximum entry timing score
  BASE_MAX: 25,
  // Enhanced maximum when ADX is below threshold (more weight on timing)
  ENHANCED_MAX: 30,
  // ADX threshold below which entry timing weight is enhanced
  ENHANCE_BELOW_ADX: 30,
  // Warning threshold - log when entry timing score is below this
  WARNING_THRESHOLD: 8,
  // Critical threshold - strongly discouraged entries
  CRITICAL_THRESHOLD: 4,
} as const;

// Momentum validation thresholds
export const MOMENTUM_THRESHOLDS = {
  // Minimum momentum score required for signal generation
  MIN_SCORE: 5,
  // Minimum momentum score for pullback entries
  PULLBACK_MIN_SCORE: 3,
} as const;

// ============= MOMENTUM GATE THRESHOLD ADJUSTMENT ORDER =============
// CRITICAL: The order of threshold adjustments affects final behavior
// This order must be preserved in strategy-analyzer implementation:
//
// 1. BASE THRESHOLD
//    - Normal entries: MIN_SCORE (5)
//    - Valid pullbacks (ADX >= 22): PULLBACK_MIN_SCORE (3)
//
// 2. REGIME-AWARE ADJUSTMENT
//    - Very Strong ADX (>=35): threshold → 0
//    - Near Very Strong (33-35, slope >= -0.3): threshold → 1
//    - Strong ADX (>=30, rising): threshold → 2
//
// 3. MOMENTUM STATE ADJUSTMENT
//    - confirmed: threshold -= 1 (reward strong follow-through)
//    - exhausted: threshold += 1 (penalize reversal risk)
//
// 4. STRONG ADX OVERRIDE
//    - If still failing threshold AND ADX qualifies: threshold → 0
//    - Position size reduced based on tier AND graduated by score deficit
//    - Score deficit multiplier: 1.0 - (deficit * 0.1), clamped to [0.5, 0.9]
//
// 5. ACCELERATING TREND EXCEPTION
//    - If ADX >= 30 AND slope > 0 AND not exhausted: allow with 70% size
//    - This catches strong trends where price leads momentum
//
// Final threshold = result after all adjustments
// Rejection occurs if score < final threshold AND no exceptions apply

// ============= STRONG ADX OVERRIDE PARAMETERS =============
// Allows momentum score gate bypass when ADX confirms strong trend
// Scoped to trend-following entries only with exhaustion checks
export const STRONG_ADX_OVERRIDE_PARAMS = {
  // Enable strong ADX override
  ENABLED: true,
  
  // Minimum ADX to qualify for override
  MIN_ADX: 30,
  
  // ADX must be rising (not falling) for override at lower ADX levels
  // When ADX >= VERY_STRONG_ADX or NEAR_VERY_STRONG_ADX with acceptable slope, rising is not required
  REQUIRE_ADX_RISING: true,
  
  // Very strong ADX threshold - at this level, ADX rising is not required
  // because the trend is already strongly confirmed
  VERY_STRONG_ADX: 35,
  
  // NEW: Near very strong ADX threshold (33-35)
  // At this level, allow override if ADX slope is not sharply negative
  // This captures moves like AVAXUSDT where ADX=34.7 but not rising
  NEAR_VERY_STRONG_ADX: 33,
  
  // ADX slope threshold for near-very-strong tier
  // If slope >= this, consider it "not falling sharply" and allow override
  // -0.3 allows slight decline while blocking sharp drops
  NEAR_VERY_STRONG_MIN_SLOPE: -0.3,
  
  // Position size multiplier for near-very-strong tier (80% for safety)
  NEAR_VERY_STRONG_POSITION_MULTIPLIER: 0.80,
  
  // Maximum ADX before exhaustion concerns (reduce size above this)
  EXHAUSTION_ADX: 45,
  
  // Position size reduction when ADX > EXHAUSTION_ADX (65% of normal)
  EXHAUSTION_POSITION_MULTIPLIER: 0.65,
  
  // Require exhaustion check to pass (isContinuation or !isExhausted)
  REQUIRE_EXHAUSTION_CHECK: true,
  
  // Only allow for trend-following entry types (not reversal entries)
  SCOPE_TO_TREND_FOLLOWING: true,
  
  // Block if unified reversal score is too high
  MAX_REVERSAL_SCORE: 50,
  
  // Reduced effective threshold when override active (momentum requirement drops to 0)
  OVERRIDE_MOMENTUM_THRESHOLD: 0,
} as const;

// ============= REGIME-AWARE MOMENTUM THRESHOLD PARAMETERS =============
// Don't lower momentum threshold globally - only relax when ADX confirms trend strength
// This is a separate mechanism from Strong ADX Override (both can apply)
export const REGIME_AWARE_MOMENTUM_PARAMS = {
  // Enable regime-aware momentum thresholds
  ENABLED: true,
  
  // Base threshold (used when ADX < 30 or conditions not met)
  BASE_THRESHOLD: 5,
  
  // Strong trend threshold: ADX >= 30, rising, not exhausted
  // Relaxed from 5 to 2 when ADX confirms strong trend
  STRONG_TREND_THRESHOLD: 2,
  STRONG_TREND_MIN_ADX: 30,
  
  // Very strong trend threshold: ADX >= 35, not exhausted
  // Relaxed from 5 to 0 when ADX confirms very strong trend
  // NOTE: At very strong ADX (>=35), ADX rising is NOT required
  // because the trend is already confirmed by the high ADX value
  VERY_STRONG_TREND_THRESHOLD: 0,
  VERY_STRONG_TREND_MIN_ADX: 35,
  
  // NEW: Near very strong tier (ADX 33-35)
  // Threshold = 1 when ADX is 33-35 and slope is not sharply negative
  // This captures moves like AVAXUSDT where ADX=34.7 but not rising
  NEAR_VERY_STRONG_TREND_THRESHOLD: 1,
  NEAR_VERY_STRONG_TREND_MIN_ADX: 33,
  NEAR_VERY_STRONG_MIN_SLOPE: -0.3,
  
  // ADX must be rising for reduced thresholds at lower ADX (30-33)
  // At very strong ADX (>=35) or near-very-strong with acceptable slope, rising is not required
  REQUIRE_ADX_RISING: true,
  
  // Block exhausted trends from using reduced threshold
  BLOCK_IF_EXHAUSTED: true,
  
  // Only apply to trend-following entries (not reversal entries)
  SCOPE_TO_TREND_FOLLOWING: true,
} as const;

// ============= PULLBACK ENTRY DETECTION PARAMETERS =============
// Context-aware momentum gate for pullback entries
// Pullbacks by definition lack strong momentum (that's the opportunity!)
// Uses reduced momentum threshold with pullback-specific validation
export const PULLBACK_DETECTION_PARAMS = {
  // Minimum 4h confidence required for pullback setup (strong HTF bias)
  MIN_4H_CONFIDENCE: 60,
  // StochRSI threshold for oversold (long pullback)
  STOCHRSI_OVERSOLD_THRESHOLD: 20,
  // StochRSI threshold for overbought (short pullback)
  STOCHRSI_OVERBOUGHT_THRESHOLD: 80,
  // Minimum ADX for valid pullback (trend must still be intact)
  MIN_ADX: 22,
  // K/D ratio tolerance for detecting StochRSI turn
  // For longs: K >= D * 0.9 (starting to turn up)
  // For shorts: K <= D * 1.1 (starting to turn down)
  KD_TURN_TOLERANCE: 0.9,
  // Position size multiplier for pullback entries (default 50%)
  DEFAULT_POSITION_SIZE_PERCENT: 50,
  // ===== ADX SLOPE GATE (NEW) =====
  // Minimum ADX slope for momentum continuation entries
  // Negative slope indicates trend weakening/exhaustion - high risk for continuation
  // Block continuation entries when slope is strongly negative (< -0.5)
  MIN_ADX_SLOPE: -0.5,
  // Stricter threshold for short continuation (more sensitive to bounce risk)
  MIN_ADX_SLOPE_SHORT: -0.3,
} as const;

// ============= PHASE 2: SMARTER ENTRY TIMING PARAMETERS =============
// True pullback detection, entry confirmation, and wait-for-bounce logic
export const ENTRY_TIMING_PHASE2_PARAMS = {
  // RSI thresholds for pullback detection
  RSI_DIP_THRESHOLD_LONG: 45,      // RSI must dip below this for long pullback
  RSI_SPIKE_THRESHOLD_SHORT: 55,   // RSI must spike above this for short pullback
  
  // Minimum bars to look back for RSI dip/spike
  RSI_LOOKBACK_BARS: 5,
  
  // Minimum confirmation candles after bounce
  MIN_CONFIRMATION_CANDLES: 1,
  OPTIMAL_CONFIRMATION_CANDLES: 2,
  
  // Entry confirmation requirements (minimum confirmations to proceed)
  MIN_CONFIRMATIONS_REQUIRED: 4,    // Out of 5 total confirmations
  
  // Pullback depth requirements (Fibonacci levels)
  MIN_PULLBACK_DEPTH: 38.2,        // Minimum retracement for valid pullback
  MAX_PULLBACK_DEPTH: 78.6,        // Maximum before considered failed trend
  IDEAL_PULLBACK_MIN: 50.0,        // Ideal pullback zone start
  IDEAL_PULLBACK_MAX: 61.8,        // Ideal pullback zone end (golden ratio)
  
  // Volume confirmation
  MIN_VOLUME_RATIO: 1.0,           // Minimum volume for entry
  STRONG_VOLUME_RATIO: 1.5,        // Strong volume confirmation
  
  // Wait-for-bounce logic
  WAIT_FOR_BOUNCE_ENABLED: true,   // Require price to close above prev high (long)
  BOUNCE_CONFIRMATION_BARS: 2,     // Bars to check for bounce confirmation
  
  // Position size adjustments for entry quality
  QUALITY_GRADE_A_MULTIPLIER: 1.0,  // Full size for A grade
  QUALITY_GRADE_B_MULTIPLIER: 0.9,  // 90% for B grade
  QUALITY_GRADE_C_MULTIPLIER: 0.75, // 75% for C grade
  QUALITY_GRADE_D_MULTIPLIER: 0.5,  // 50% for D grade (borderline)
  
  // Block entries without confirmation in these scenarios
  BLOCK_NO_CONFIRMATION_IN_RECOVERY: true,
  BLOCK_NO_CONFIRMATION_AT_EXTREMES: true,  // StochRSI > 80 or < 20
} as const;

// Correlation risk parameters
export const CORRELATION_PARAMS = {
  // Maximum correlation threshold between positions (0-1)
  MAX_THRESHOLD: 0.75,
  // Maximum correlated positions allowed in same direction
  MAX_SAME_DIRECTION: 2,
  // Correlation risk score threshold for position size reduction
  SIZE_REDUCTION_THRESHOLD: 30,
  // PHASE 3: Maximum total correlated exposure as percentage of portfolio
  // Prevents accumulation of "small" correlated positions that add up
  MAX_CORRELATED_EXPOSURE_PERCENT: 5.0,
  // Position size floor when correlation adjustment is applied (minimum 50% of intended size)
  MIN_POSITION_SIZE_FLOOR: 0.5,
} as const;

// ============= STEALTH TREND DETECTION PARAMETERS =============
// Detects gradual price grinds (2-4% drops/rises) that slip through ADX/momentum filters
// These "stealth" moves have low ADX because they're slow and steady, not impulsive
// This addresses the scenario: BTC/ETH/BNB/SOL all dropping 2-4% but ADX staying < 20
export const STEALTH_TREND_PARAMS = {
  // Enable stealth trend detection
  ENABLED: true,
  
  // ===== CUMULATIVE DRIFT DETECTION =====
  // Minimum cumulative price drift to trigger stealth detection
  MIN_DRIFT_PERCENT: 1.5,
  // Time window for drift calculation (hours) - uses 15m candles internally
  // UPDATED: Extended from 4h to 8h to capture slow grinds distributed over 6-8 hours
  DRIFT_WINDOW_HOURS: 8,
  // Minimum drift to consider as "strong" stealth trend
  STRONG_DRIFT_PERCENT: 2.0,
  
  // ===== MONOTONICITY REQUIREMENT =====
  // Drift must be consistent (not oscillating) to qualify as stealth trend
  // This prevents false triggers during Asia session chop, pre-news compression, range oscillation
  REQUIRE_MONOTONIC_DRIFT: true,
  // Minimum percentage of bars that must move in drift direction
  // e.g., 70% = 7 of 10 bars must close in same direction as drift
  MONOTONIC_MIN_CONSISTENCY_PERCENT: 70,
  // Allow brief counter-moves of up to this percentage before disqualifying
  MAX_COUNTER_MOVE_PERCENT: 0.3,  // 0.3% counter-moves allowed mid-grind
  
  // ===== ADX THRESHOLDS =====
  // Maximum ADX for stealth trend (if higher, use normal logic - it's not "stealth")
  // UPDATED: Raised from 22 to 25 to catch "dead zone" ADX (22-25) moves
  MAX_ADX_FOR_STEALTH: 25,
  // Minimum ADX to allow stealth bypass (still need some directional movement)
  // Below this, there's truly no trend even for stealth
  ADX_BYPASS_MINIMUM: 12,
  
  // ===== DRIFT-BASED ADX SCALING =====
  // For larger drifts, allow higher ADX values to still qualify as "stealth"
  // This addresses moves where drift is significant but ADX rises to 22-28 range
  ADX_SCALE_STRONG_DRIFT: 28,    // Allow up to ADX 28 when drift >= 2.5%
  ADX_SCALE_MODERATE_DRIFT: 26,  // Allow up to ADX 26 when drift >= 2.0%
  
  // ===== DIRECTION ALIGNMENT =====
  // Require 1h trend to match drift direction (reduces false positives)
  REQUIRE_1H_ALIGNMENT: true,
  // Require 30m to also match (stricter filter)
  REQUIRE_30M_ALIGNMENT: false,
  // Minimum 1h confidence when alignment is checked
  MIN_1H_CONFIDENCE_FOR_ALIGNMENT: 50,
  
  // ===== POSITION SIZING (Risk Management) =====
  // Maximum position size for stealth entries (percentage of normal)
  MAX_POSITION_PERCENT: 50,
  // Position size for strong stealth trends (drift >= STRONG_DRIFT_PERCENT)
  STRONG_STEALTH_POSITION_PERCENT: 60,
  
  // ===== STOP LOSS ADJUSTMENT =====
  // Tighter stops for stealth entries (multiplier on normal ATR-based stop)
  STOP_MULTIPLIER: 0.6,
  // Take profit multiplier (earlier exits for stealth entries)
  TP_MULTIPLIER: 1.5,
  
  // ===== STEALTH SCORE THRESHOLDS =====
  // Minimum stealth score (0-100) to allow ADX gate bypass
  MIN_SCORE_FOR_ADX_BYPASS: 50,
  // Minimum stealth score to allow HTF floor bypass (higher requirement)
  MIN_SCORE_FOR_HTF_BYPASS: 60,
  
  // ===== SAFETY GATES =====
  // Block stealth entries if StochRSI is at absolute extremes (truly exhausted)
  BLOCK_AT_STOCHRSI_EXTREMES: true,
  STOCHRSI_EXTREME_THRESHOLD: 3, // Block if K < 3 or K > 97
  
  // Require direction alignment with drift (drift bearish + signal SHORT must match)
  REQUIRE_DIRECTION_ALIGNMENT: true,
  
  // ===== NEUTRAL MARKET DRIFT MULTIPLIER (Phase 2) =====
  // When all TFs are neutral, accept smaller drift as confirmation
  NEUTRAL_MARKET_DRIFT_MULTIPLIER: 0.6,  // 60% of normal threshold
  NEUTRAL_MARKET_LOG_AGGRESSIVELY: true,
} as const;

// ============= LATE GRIND ACCEPTANCE MODE =============
// Allows entry AFTER 1.5-2.0% has already occurred
// Only if pullback fails (continuation proven)
// This captures the middle 30% of the move, not the dangerous start
export const LATE_GRIND_ACCEPTANCE_PARAMS = {
  ENABLED: true,
  
  // ===== ENTRY REQUIREMENTS =====
  // Minimum drift already occurred before entry considered
  MIN_PRIOR_DRIFT_PERCENT: 1.5,
  
  // Drift threshold for "strong" late grind (allows slightly larger position)
  STRONG_PRIOR_DRIFT_PERCENT: 2.5,
  
  // ===== PULLBACK FAILURE DETECTION =====
  // Entry only on failed pullback - price tried to reverse but couldn't
  REQUIRE_FAILED_PULLBACK: true,
  
  // Maximum pullback depth allowed (% of prior move)
  // If pullback > this, trend may be reversing
  MAX_PULLBACK_DEPTH_PERCENT: 38.2,  // Fibonacci 38.2% retracement
  
  // Minimum pullback that must have occurred (proves buyers/sellers tried)
  MIN_PULLBACK_DEPTH_PERCENT: 15,
  
  // Pullback must fail within this many bars
  MAX_PULLBACK_BARS: 8,  // 8 x 15min = 2 hours
  
  // ===== CONFIRMATION REQUIREMENTS =====
  // After pullback fails, require continuation candle
  REQUIRE_CONTINUATION_CANDLE: true,
  
  // HTF must be at least "biased" (not neutral-flat)
  REQUIRE_HTF_BIAS: true,
  MIN_HTF_CONFIDENCE: 50,  // 4h must show some directional bias
  
  // ===== POSITION SIZING (Conservative) =====
  // Small size - we're entering mid-move
  POSITION_SIZE_MULTIPLIER: 0.40,  // 40% of normal
  
  // Stronger grind = slightly larger size
  STRONG_GRIND_POSITION_SIZE_MULTIPLIER: 0.50,  // 50% for 2.5%+ drift
  
  // ===== STOP LOSS (Tight) =====
  // Tighter stop - market could snap back
  STOP_MULTIPLIER: 0.50,  // 50% of normal ATR-based stop
  
  // Alternative: structure-based stop at pullback low/high
  USE_STRUCTURE_STOP: true,
  
  // ===== SAFETY GATES =====
  // Block if StochRSI at absolute extremes
  BLOCK_AT_STOCHRSI_EXTREMES: true,
  STOCHRSI_EXTREME_LONG: 95,   // Block LONG if K >= 95
  STOCHRSI_EXTREME_SHORT: 5,   // Block SHORT if K <= 5
  
  // Block if ADX is collapsing (trend dying)
  REQUIRE_ADX_NOT_COLLAPSING: true,
  ADX_COLLAPSE_THRESHOLD: -0.5,  // ADX slope below this = collapsing
  
  // Exception type for tracking
  EXCEPTION_TYPE: "LATE_GRIND_ACCEPTANCE" as const,
} as const;

// ============= CORRELATION CONFIDENCE MULTIPLIER =============
// When multiple symbols drift together, INCREASE confidence score
// This does NOT bypass gates - it makes stealth trend more believable
export const CORRELATION_CONFIDENCE_PARAMS = {
  ENABLED: true,
  
  // Minimum symbols drifting in same direction to apply bonus
  MIN_CORRELATED_SYMBOLS: 3,
  
  // Minimum average drift across correlated symbols
  MIN_AVG_DRIFT_PERCENT: 0.5,
  
  // Must persist for at least this duration
  MIN_PERSISTENCE_MINUTES: 90,
  
  // Confidence score bonus (added to stealth score)
  CONFIDENCE_BONUS: 15,  // +15 points to stealth score
  
  // Position size stays conservative (no bypass)
  // This just makes the signal more likely to pass thresholds
} as const;

// Order execution parameters
export const ORDER_EXECUTION_PARAMS = {
  // Maximum number of retries for transient order failures
  MAX_RETRIES: 2,
  // Delay between retries in milliseconds
  RETRY_DELAY_MS: 500,
  // Transient error codes that warrant a retry
  TRANSIENT_ERROR_CODES: [-1001, -1003, -1015, -1021], // Timeout, too many requests, rate limit, timestamp
  // Minimum fill ratio to accept (below this, cancel remaining and adjust position)
  MIN_FILL_RATIO: 0.8,
} as const;

// Trend validation parameters for execution
export const TREND_VALIDATION_PARAMS = {
  // Minimum confidence required to enforce strict trend-direction agreement
  // Below this threshold, allow counter-trend entries (pullbacks/reversals) with warning
  STRICT_CONFIDENCE_THRESHOLD: 70,
  // Position size reduction for counter-trend entries allowed through
  COUNTER_TREND_POSITION_MULTIPLIER: 0.6,
} as const;

// Strategy performance and selection parameters
export const STRATEGY_PARAMS = {
  // Maximum bonus points for high-performing strategies
  MAX_PERFORMANCE_BONUS: 5,
  // Minimum quality score difference for bonus to apply
  MIN_QUALITY_DIFF_FOR_OVERRIDE: 8,
  // Win rate threshold for disabling strategies (%)
  WIN_RATE_DISABLE_THRESHOLD: 35,
  // Win rate threshold for high performer status (%)
  WIN_RATE_HIGH_PERFORMER: 60,
  // Minimum trades required for strategy filtering
  MIN_TRADES_FOR_FILTER: 8,
  // Minimum unique symbols for strategy stats validity
  MIN_UNIQUE_SYMBOLS: 3,
  // Minimum unique strategies for symbol stats validity  
  MIN_UNIQUE_STRATEGIES: 2,
} as const;

// Symbol filtering parameters
export const SYMBOL_PARAMS = {
  // Win rate threshold for disabling symbols (%)
  WIN_RATE_DISABLE_THRESHOLD: 30,
  // Minimum trades required for symbol filtering
  MIN_TRADES_FOR_FILTER: 10,
} as const;

// ============= EMERGENCY EXIT PARAMETERS =============
// Thresholds for emergency exit conditions in position monitoring
export const EMERGENCY_EXIT_PARAMS = {
  // Flash crash: sudden adverse price move requiring immediate exit
  FLASH_CRASH_THRESHOLD_PERCENT: 5.0,
  // PHASE 3: Flash crash must occur within N candles to be considered sudden
  // Slow trends over 24h should not trigger flash crash exit
  FLASH_CRASH_MAX_CANDLES: 2,
  // Volatility spike: ATR ratio above normal requiring caution
  VOLATILITY_SPIKE_THRESHOLD: 2.0,
  // Extreme volatility: ATR ratio requiring immediate exit (base threshold)
  EXTREME_VOLATILITY_THRESHOLD: 3.0,
  // ADAPTIVE VOLATILITY: Higher threshold for strong trends (ADX >= 30)
  // Strong trends can sustain higher volatility without indicating reversal
  EXTREME_VOLATILITY_THRESHOLD_STRONG_TREND: 4.5,
  // Moderate trend threshold (ADX >= 25)
  EXTREME_VOLATILITY_THRESHOLD_MODERATE_TREND: 3.75,
  // ADX threshold for "strong trend" - volatility is expected in strong trends
  ADAPTIVE_VOLATILITY_ADX_STRONG: 30,
  // ADX threshold for "moderate trend"
  ADAPTIVE_VOLATILITY_ADX_MODERATE: 25,
  // Volume spike: unusual volume indicating potential reversal
  VOLUME_SPIKE_THRESHOLD: 3.0,
  // Decay velocity: rapid profit loss per minute triggering exit
  DECAY_VELOCITY_EXIT_PER_MINUTE: 0.03,
} as const;

// ============= EXIT THRESHOLDS =============
// Thresholds for various exit conditions in position monitoring
export const EXIT_THRESHOLDS = {
  // Minimum loss % before reversal risk exits apply
  MIN_LOSS_FOR_REVERSAL_EXIT_PERCENT: -0.5,
  // Minimum position age (hours) before reversal exits apply
  MIN_AGE_FOR_REVERSAL_EXIT_HOURS: 1.0,
  // Early warning exit: minimum loss % before early warning applies
  EARLY_WARNING_MIN_LOSS_PERCENT: -1.0,
  // Early warning exit: 4h confidence must be below this
  EARLY_WARNING_MIN_CONFIDENCE_4H: 50,
  // Trend exit: confidence must be at or above this for trend-based exit
  TREND_CONFIDENCE_EXIT: 65,
  // Break-even: minimum distance % from current price for BE stop
  BREAK_EVEN_MIN_DISTANCE_PERCENT: 0.5,
  // Time-based exit: minimum P&L % for stale losing position exit
  // ADJUSTED: From -0.5% to -0.8% to give consolidating positions more room to recover
  // Prevents premature exits on positions still well above their stop loss
  TIME_BASED_MIN_PNL_PERCENT: -0.8,
  // SCENARIO 5 FIX: ADX threshold for time-based exit - only exit in stagnation (ADX < 20)
  // Time exits should punish stagnation, not volatility
  TIME_BASED_MAX_ADX: 20,
  // SCENARIO 5 FIX: ADX threshold for reversal exit block - skip reversal exits in strong trends
  // Reversal exits should never fight strong trends (ADX >= 30)
  REVERSAL_EXIT_BLOCK_ADX: 30,
  // SCENARIO 5 PHASE 2: Trend reversal persistence requirement
  // Require N consecutive bars of reversal before triggering exit (reduces whipsaws)
  TREND_REVERSAL_PERSISTENCE_BARS: 2,
  // Minimum confidence for persistent reversal to trigger exit
  TREND_REVERSAL_MIN_CONFIDENCE: 65,
} as const;

// ============= EXIT HIERARCHY =============
// SCENARIO 5 PHASE 2: Explicit priority order for exit conditions
// Higher number = higher priority (processed first with early return)
export const EXIT_PRIORITY = {
  CIRCUIT_BREAKER: 100,        // Portfolio-level emergency - always first
  FLASH_CRASH: 90,             // Market emergency - immediate
  EXTREME_VOLATILITY: 85,      // Extreme ATR - urgent
  STOP_LOSS_HIT: 80,           // Hard stop triggered
  TAKE_PROFIT_HIT: 75,         // TP triggered
  SMART_AITS_DECAY: 70,        // Rapid profit decay
  REVERSAL_RISK_HIGH: 60,      // High reversal score
  TREND_REVERSAL: 55,          // Trend flipped with persistence
  EARLY_WARNING: 50,           // 1h flip + weak 4h
  TIME_BASED: 40,              // Stale losing position
} as const;

// ============= PARTIAL TAKE PROFIT PARAMETERS =============
// Professional ladder exit system for partial position closes
export const PARTIAL_TP_PARAMS = {
  // TP1: Close at 33% of distance to full TP
  TP1_DISTANCE_PERCENT: 33,
  // TP1: Close this percentage of position
  TP1_CLOSE_PERCENT: 50,
  // TP2: Close at 66% of distance to full TP
  TP2_DISTANCE_PERCENT: 66,
  // TP2: Close this percentage of remaining position
  TP2_CLOSE_PERCENT: 60,
} as const;

// ============= STRATEGY TYPE DETECTION =============
// Robust strategy type classification for consistent behavior across edge functions
// Uses strategy ID prefixes and name patterns for reliable detection

export const STRATEGY_TYPES = {
  // Momentum strategies - can enter when 4h is neutral if 1h is directional + momentum building
  MOMENTUM: {
    ids: [
      'builtin-momentum-breakout',
      'builtin-aggressive-momentum',
      'builtin-ema-golden',
      'builtin-macd-crossover',
      'builtin-macd-signal-cross',
    ],
    // Fallback name patterns (case-insensitive) for custom strategies
    namePatterns: [
      'momentum',
      'breakout',
      'surge',
      'ema.*cross',
      'golden.*cross',
      'death.*cross',
    ],
  },
  // Mean reversion strategies - trade counter-trend at extremes
  MEAN_REVERSION: {
    ids: [
      'builtin-rsi-oversold',
      'builtin-rsi-overbought',
      'builtin-mean-reversion',
      'builtin-bollinger-reversal',
    ],
    namePatterns: [
      'mean.*reversion',
      'reversal',
      'oversold',
      'overbought',
      'bollinger.*reversal',
    ],
  },
  // Trend following strategies - require aligned HTF
  TREND_FOLLOWING: {
    ids: [
      'builtin-ema-death',
      'builtin-conservative-swing',
    ],
    namePatterns: [
      'trend.*follow',
      'swing',
      'conservative',
    ],
  },
  // Grid/range strategies - work in ranging conditions
  GRID_RANGE: {
    ids: [
      'builtin-grid-trading',
      'builtin-bollinger-breakout',
    ],
    namePatterns: [
      'grid',
      'range',
      'scalp',
    ],
  },
  // Neutral strategies - trade when 5m neutral but HTF directional
  NEUTRAL_BREAKOUT: {
    ids: [
      'builtin-htf-neutral-breakout',
    ],
    namePatterns: [
      'neutral.*breakout',
      'htf.*neutral',
    ],
  },
} as const;

// Strategy type detection function
export function detectStrategyType(strategyId: string | undefined, strategyName: string): keyof typeof STRATEGY_TYPES | 'UNKNOWN' {
  const normalizedName = (strategyName || '').toLowerCase();
  const normalizedId = (strategyId || '').toLowerCase();
  
  for (const [type, config] of Object.entries(STRATEGY_TYPES)) {
    // Check by ID first (most reliable)
    if (config.ids.some(id => normalizedId === id || normalizedId.includes(id))) {
      return type as keyof typeof STRATEGY_TYPES;
    }
    
    // Fall back to name pattern matching
    for (const pattern of config.namePatterns) {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(normalizedName)) {
        return type as keyof typeof STRATEGY_TYPES;
      }
    }
  }
  
  return 'UNKNOWN';
}

// Check if strategy is a momentum-type strategy
export function isMomentumStrategy(strategyId: string | undefined, strategyName: string): boolean {
  return detectStrategyType(strategyId, strategyName) === 'MOMENTUM';
}

// Check if strategy is a mean-reversion type
export function isMeanReversionStrategy(strategyId: string | undefined, strategyName: string): boolean {
  return detectStrategyType(strategyId, strategyName) === 'MEAN_REVERSION';
}

// Check if strategy is neutral-breakout type
export function isNeutralStrategy(strategyId: string | undefined, strategyName: string): boolean {
  return detectStrategyType(strategyId, strategyName) === 'NEUTRAL_BREAKOUT';
}

// Check if strategy is trend-following type (includes EMA Death Cross)
export function isTrendFollowingStrategy(strategyId: string | undefined, strategyName: string): boolean {
  return detectStrategyType(strategyId, strategyName) === 'TREND_FOLLOWING';
}

// ============= HTF OVERSOLD/OVERBOUGHT HARD GATES (TIERS 1 & 2) =============
// TIER HIERARCHY:
//   Tier 0 (DEEP): K < 5 or K > 95 - Universal block, NO EXCEPTIONS (see DEEP_STOCHRSI_HARD_GATE)
//   Tier 1 (SEVERE): 5 <= K < 15 or 85 < K <= 95 - Block, NO BYPASS
//   Tier 2 (STANDARD): K <= 20 & %B <= 25 or K >= 80 & %B >= 75 - Block with RESTRICTED bypass
//   Tier 3 (CAUTION): K <= 30 or K >= 70 - Penalty scoring, no hard block
//
// Global rule for ALL strategies: Block counter-trend continuation at extremes
export const HTF_EXTREME_HARD_GATES = {
  // ============= TIER 1: SEVERE STOCHRSI-ONLY GATE (NO BYPASS) =============
  // Tier 1 catches 5 <= K < 15 (shorts) or 85 < K <= 95 (longs) - where Tier 0 doesn't reach
  // When StochRSI is in severe zone, block WITHOUT bypass - %B confirmation not required
  TIER_1_LABEL: 'SEVERE' as const,
  SEVERE_OVERSOLD_K_THRESHOLD: 15,   // Tier 1: K < 15 = block SHORT with no bypass
  SEVERE_OVERBOUGHT_K_THRESHOLD: 85, // Tier 1: K > 85 = block LONG with no bypass
  SEVERE_GATE_ALLOW_BYPASS: false,   // Tier 1: NO bypass allowed
  
  // ============= TIER 2: STANDARD COMBINED GATE (WITH BYPASS) =============
  // Tier 2 requires BOTH K AND %B to be in extreme zone - more permissive than Tier 1
  TIER_2_LABEL: 'STANDARD' as const,
  STOCHRSI_OVERSOLD_BLOCK: 20,   // Tier 2: K <= 20 for shorts (combined with %B)
  STOCHRSI_OVERBOUGHT_BLOCK: 80, // Tier 2: K >= 80 for longs (combined with %B)
  
  // PARABOLIC MODE: Relaxed thresholds only apply to Tier 2 (NOT Tier 1)
  // But parabolic bypass only works if K is NOT in Tier 1 severe zone
  STOCHRSI_OVERBOUGHT_BLOCK_PARABOLIC: 92, // Tier 2 parabolic: relaxed from 80
  STOCHRSI_OVERSOLD_BLOCK_PARABOLIC: 8,    // Tier 2 parabolic: relaxed from 20
  
  // ADX thresholds for parabolic mode activation
  PARABOLIC_MODE_MIN_ADX: 45,
  PARABOLIC_MODE_REQUIRE_ADX_RISING: true,
  
  // Bollinger %B thresholds for Tier 2 combined gate
  PERCENT_B_OVERSOLD_BLOCK: 25,  // Tier 2: %B <= 25 for shorts
  PERCENT_B_OVERBOUGHT_BLOCK: 75, // Tier 2: %B >= 75 for longs
  
  // ============= TIER 2 BYPASS RESTRICTIONS =============
  // Bypass is ONLY allowed for Tier 2 (not Tier 0 or Tier 1), and must meet ALL conditions
  BYPASS_MIN_ADX: 35,              // Tier 2 bypass: ADX must be >= 35
  BYPASS_MAX_REVERSAL_SCORE: 45,   // Tier 2 bypass: Reversal score must be < 45
  BYPASS_POSITION_REDUCTION: 0.50, // Tier 2 bypass: 50% position size
} as const;

// ============= TIER 3: CAUTION ZONE (PENALTY SCORING) =============
// Tier 3 is informational - adds penalties to quality/reversal scoring but doesn't hard block
// Applied via reversal score calculations when K is in caution zone
export const TIER_3_CAUTION_ZONE = {
  TIER_3_LABEL: 'CAUTION' as const,
  // Caution zone thresholds - penalty scoring, no hard block
  OVERSOLD_K_THRESHOLD: 30,   // K <= 30 = caution zone for shorts
  OVERBOUGHT_K_THRESHOLD: 70, // K >= 70 = caution zone for longs
  // Penalty points added to reversal score when in caution zone
  CAUTION_ZONE_PENALTY: 10,
} as const;

// ============= IMPROVEMENT 2: BOLLINGER POSITION FILTER (CONTEXT-AWARE) =============
// Base rule: Shorts below lower Bollinger are risky (mean reversion bounce risk)
// Exception: In confirmed bearish trends, low %B indicates trend continuation - shorts are VALID
// Same logic applies symmetrically for longs at high %B
// UPDATED: Relaxed LONG thresholds based on actual performance data showing LONGs performing well
// PHASE 1 FIX: Allow shorts when %B < 0 (price below lower band = continuation, not bounce risk)
export const BOLLINGER_ENTRY_GATES = {
  // BASE THRESHOLDS (applied in neutral/unclear trend)
  SHORT_MIN_PERCENT_B: 35,        // Shorts require %B >= 35 (relaxed from 40 to allow more signals)
  SHORT_SQUEEZE_MIN_PERCENT_B: 50, // During squeeze, require %B >= 50
  SHORT_SQUEEZE_RANGING_MIN_PERCENT_B: 40, // During squeeze + ranging (ADX < 23), relax to %B >= 40
  LONG_MAX_PERCENT_B: 75,         // Longs require %B <= 75 (relaxed from 65 based on actual win rate data)
  LONG_SQUEEZE_MAX_PERCENT_B: 60, // During squeeze, require %B <= 60 (relaxed from 50)
  LONG_SQUEEZE_RANGING_MAX_PERCENT_B: 70, // During squeeze + ranging (ADX < 23), relax to %B <= 70
  
  // TREND-CONTEXT RELAXATION FOR SHORTS (allow continuation in bearish trends)
  // If 4h is bearish with 60%+ confidence, shorts are continuation - allow lower %B
  SHORT_BEARISH_TREND_MIN_PERCENT_B: 15,      // Bearish 4h trend: allow shorts down to %B >= 15
  SHORT_STRONG_BEARISH_MIN_PERCENT_B: 5,      // Strong bearish (ADX >= 22): allow down to %B >= 5
  
  // PHASE 1 NEW: Allow shorts when %B is NEGATIVE (price broke below lower band)
  // This is a momentum continuation signal, NOT a bounce risk
  // HOWEVER: Must respect deep oversold floor - if StochRSI is too low, bypass is disabled
  ALLOW_SHORTS_BELOW_ZERO_PERCENT_B: true,    // NEW: Allow shorts when %B < 0
  SHORT_BELOW_ZERO_REQUIRE_MOMENTUM: true,    // Require MACD expanding OR 1h directional
  SHORT_BELOW_ZERO_POSITION_REDUCTION: 0.60,  // 60% position size for extreme %B entries
  
  // NEW: StochRSI floor for negative %B bypass - if K is deeply oversold, don't bypass
  // This prevents the bypass from activating when bounce probability is too high
  SHORT_BELOW_ZERO_MIN_STOCHRSI_K: 15,        // Don't bypass if K < 15 (too oversold for short)
  
  // TREND-CONTEXT RELAXATION FOR LONGS (allow continuation in bullish trends)
  // If 4h is bullish with 60%+ confidence, longs are continuation - allow higher %B
  LONG_BULLISH_TREND_MAX_PERCENT_B: 85,       // Bullish 4h trend: allow longs up to %B <= 85
  LONG_STRONG_BULLISH_MAX_PERCENT_B: 95,      // Strong bullish (ADX >= 22): allow up to %B <= 95
  
  // Minimum confidence required for trend-context relaxation
  TREND_CONFIDENCE_THRESHOLD: 60,
  
  // ADX threshold for "ranging market" - below this, apply relaxed squeeze rules
  RANGING_ADX_THRESHOLD: 23,
} as const;

// ============= PHASE 3: PRICE ACTION DIRECTION OVERRIDE =============
// When all timeframes show neutral/low confidence, derive direction from price action
// This allows entries based on significant price moves even without HTF confirmation
export const PRICE_ACTION_DIRECTION_OVERRIDE_PARAMS = {
  ENABLED: true,
  
  // Minimum price move in 6 hours to derive direction
  MIN_PRICE_MOVE_PERCENT: 1.5,
  // Strong price move threshold (more aggressive entry)
  STRONG_PRICE_MOVE_PERCENT: 2.0,
  
  // Additional requirements for override
  REQUIRE_MACD_EXPANDING: true,           // MACD must be expanding
  REQUIRE_MACD_DIRECTION_MATCH: true,     // MACD histogram must match price direction
  
  // Maximum ADX for price action override (in strong trends, use normal flow)
  MAX_ADX: 28,                            // Only apply in moderate/weak trend environments
  // Minimum ADX required (avoid completely dead markets)
  MIN_ADX: 15,
  
  // Position sizing for price action override entries
  STANDARD_POSITION_REDUCTION: 0.50,      // 50% for 1.5%+ moves
  STRONG_POSITION_REDUCTION: 0.65,        // 65% for 2%+ moves (more confidence)
  
  // Maximum reversal score allowed
  MAX_REVERSAL_SCORE: 45,
  
  // Direction derived from price action becomes the "intended direction"
  EXCEPTION_TYPE: "PRICE_ACTION_OVERRIDE" as const,
} as const;

// ============= PHASE 5: STRONG MOMENTUM OVERRIDE =============
// Bypass HTF alignment gates when momentum is undeniably strong
// This is the "momentum is overwhelming" exception path
export const STRONG_MOMENTUM_OVERRIDE_PARAMS = {
  ENABLED: true,
  
  // ALL of these must be true to activate override
  REQUIRE_MACD_EXPANDING: true,
  REQUIRE_MACD_STRONG: true,              // MACD must be in "strong" state
  MIN_PRICE_MOVE_PERCENT: 1.5,            // Price must have moved 1.5%+
  MIN_ADX: 20,                            // ADX must be >= 20 (some trend)
  MAX_REVERSAL_SCORE: 50,                 // Reversal score must be < 50
  
  // Optional relaxations
  ALLOW_WITHOUT_STRONG_MACD: false,       // Strict: require strong MACD
  FALLBACK_EXPANDING_ONLY_MIN_MOVE: 2.0,  // If MACD only expanding (not strong), need 2%+ move
  
  // Position sizing
  POSITION_SIZE_MULTIPLIER: 0.55,         // 55% position size for momentum override entries
  
  // Stop loss adjustment (tighter)
  STOP_LOSS_MULTIPLIER: 0.75,             // 0.75x normal stop (tighter)
  
  EXCEPTION_TYPE: "STRONG_MOMENTUM_OVERRIDE" as const,
} as const;

// ============= PHASE 6: MOMENTUM BONUS SYSTEM =============
// Apply bonuses to confidence/quality scores when momentum is strong
// Helps borderline cases pass gates without removing gate safety
export const MOMENTUM_BONUS_PARAMS = {
  ENABLED: true,
  
  // Bonus for strong price action momentum (1.5%+ move)
  PRICE_ACTION_BONUS: 8,                  // +8 points to confidence
  // Bonus for expanding MACD
  MACD_EXPANDING_BONUS: 5,                // +5 points
  // Bonus for MACD strong state
  MACD_STRONG_BONUS: 5,                   // +5 points (stacks with expanding)
  
  // Maximum total bonus from momentum
  MAX_TOTAL_BONUS: 15,
  
  // Threshold reduction for gates when momentum is strong
  // Applied multiplicatively to gate thresholds (0.8 = 20% easier)
  GATE_THRESHOLD_REDUCTION_MULTIPLIER: 0.80,
  // Only apply reduction when price moved >= this
  MIN_PRICE_MOVE_FOR_REDUCTION: 1.5,
  
  // Log when bonus is applied
  LOG_BONUS_APPLICATION: true,
} as const;

// ============= RANGING MARKET DETECTION PARAMETERS =============
// Detect when all timeframes are neutral and market is truly ranging
export const RANGING_MARKET_DETECTION_PARAMS = {
  // ADX threshold for ranging detection
  ADX_THRESHOLD: 23,
  // Minimum neutral confidence across timeframes to consider "all neutral"
  NEUTRAL_CONFIDENCE_THRESHOLD: 50,
  // Volume ratio threshold - below this confirms low activity
  VOLUME_RATIO_THRESHOLD: 0.7,
  // Enable informational logging for ranging markets
  ENABLE_LOGGING: true,
} as const;

// ============= LOW VOLUME DETECTION PARAMETERS =============
// Detect holiday/low-activity periods and adjust thresholds
// When volume is significantly below average, log informational message and tighten quality
export const LOW_VOLUME_DETECTION_PARAMS = {
  // Volume ratio threshold - below this is considered "low volume"
  VOLUME_RATIO_THRESHOLD: 0.5,  // <50% of 20-day average = low volume
  // Quality threshold boost when low volume detected
  // REDUCED from +5 to +3 to allow more signals during normal low-volume periods
  // +5 was too aggressive - caused valid momentum signals to miss by 2-3 points
  QUALITY_THRESHOLD_BOOST: 3,   // Add +3 to minimum quality threshold (was +5)
  // Minimum volume ratio to log as "very low" (holiday-like conditions)
  VERY_LOW_VOLUME_RATIO: 0.3,   // <30% = very low volume (log as holiday-like)
} as const;

// ============= IMPROVEMENT 3: SQUEEZE CONTEXT ARBITRATION =============
// Squeeze defines regime, not entry - regime must constrain strategy choice
// When 4h squeeze active AND StochRSI extreme, switch to MEAN_REVERSION context
export const SQUEEZE_CONTEXT_PARAMS = {
  // Thresholds for mean-reversion context
  STOCHRSI_OVERSOLD_FOR_MEAN_REVERSION: 20,  // K <= 20 = bullish mean-reversion context
  STOCHRSI_OVERBOUGHT_FOR_MEAN_REVERSION: 80, // K >= 80 = bearish mean-reversion context
  // Minimum squeeze intensity to trigger context arbitration
  MIN_SQUEEZE_PERCENT_4H: 30,
} as const;

// Market context types for regime-aware strategy filtering
export type MarketContext = 'TREND_CONTINUATION' | 'MEAN_REVERSION' | 'NEUTRAL';

// ============= IMPROVEMENT 4: STRATEGY-SPECIFIC CONSTRAINTS =============
// Lagging strategies like EMA Death Cross need context-awareness
// Prevents signals in inappropriate conditions
// UPDATED: Relaxed thresholds - oversold/overbought in trend direction is continuation, not risk
export const STRATEGY_SPECIFIC_CONSTRAINTS = {
  EMA_DEATH_CROSS: {
    // Minimum ADX required (strong trend validation) - LOWERED from 25 to 23
    MIN_ADX: 23,
    // StochRSI must be above this (not oversold - bounce risk) - NORMAL mode
    // RELAXED: Lowered from 30 to 15 - oversold in bearish trend is momentum continuation
    MIN_STOCHRSI_K: 15,
    // STRONG TREND EXCEPTION: When ADX >= this, allow lower StochRSI
    // PHASE 1 FIX: LOWERED from 25 to 20 - ADX 20-25 is gap zone where good signals get blocked
    STRONG_TREND_ADX_THRESHOLD: 20,
    // Minimum StochRSI allowed even in strong trend mode (absolute floor)
    // LOWERED from 10 to 3 - in strong bearish, K near 0 is continuation
    STRONG_TREND_MIN_STOCHRSI_K: 3,
    // Require StochRSI falling (K < D) for strong trend exception
    // DISABLED - in continuation moves, K can stay pinned low while price falls
    STRONG_TREND_REQUIRE_FALLING: false,
    // %B must be above this (not at lower band)
    // LOWERED from 40 to 20 - price below lower band in bearish is continuation
    MIN_PERCENT_B: 20,
    // In strong trend mode, allow lower %B
    // LOWERED from 20 to 0 - allow negative %B in strong trends
    STRONG_TREND_MIN_PERCENT_B: 0,
    // Hard block on fake breakout risk
    BLOCK_ON_FAKE_BREAKOUT: true,
  },
  EMA_GOLDEN_CROSS: {
    // Minimum ADX required - LOWERED from 25 to 23
    MIN_ADX: 23,
    // StochRSI must be below this (not overbought - reversal risk) - NORMAL mode
    // RELAXED: Raised from 70 to 85 - overbought in bullish trend is momentum continuation
    MAX_STOCHRSI_K: 85,
    // STRONG TREND EXCEPTION: When ADX >= this, allow higher StochRSI
    // PHASE 1 FIX: LOWERED from 25 to 20 - ADX 20-25 is gap zone where good signals get blocked
    STRONG_TREND_ADX_THRESHOLD: 20,
    // Maximum StochRSI allowed even in strong trend mode (absolute ceiling)
    // RAISED from 90 to 97 - in strong bullish, K near 100 is continuation
    STRONG_TREND_MAX_STOCHRSI_K: 97,
    // Require StochRSI rising (K > D) for strong trend exception
    // DISABLED - in continuation moves, K can stay pinned high while price rises
    STRONG_TREND_REQUIRE_RISING: false,
    // %B must be below this (not at upper band)
    // RAISED from 60 to 80 - price above upper band in bullish is continuation
    MAX_PERCENT_B: 80,
    // In strong trend mode, allow higher %B
    // RAISED from 80 to 100+ - allow very high %B in strong trends
    STRONG_TREND_MAX_PERCENT_B: 110,
    // Hard block on fake breakout risk
    BLOCK_ON_FAKE_BREAKOUT: true,
  },
} as const;

// ============= PHASE 2: ADX RISING %B BYPASS PARAMETERS =============
// Allows %B block bypass when ADX is rising, indicating trend strengthening
// In rising ADX scenarios, extended %B is continuation, not exhaustion
export const ADX_RISING_PERCENT_B_BYPASS = {
  // Enable ADX rising %B bypass
  ENABLED: true,
  // Use smoothed slope to avoid single-bar spikes (average of last 3 calculations)
  USE_SMOOTHED_SLOPE: true,
  // Minimum smoothed slope required for bypass
  MIN_SLOPE: 0.3,
  // Minimum ADX for bypass eligibility
  MIN_ADX: 18,
  // Maximum %B allowed even with bypass (absolute cap for LONG)
  MAX_PERCENT_B_CAP: 115,
  // Minimum %B allowed even with bypass (absolute floor for SHORT)
  MIN_PERCENT_B_FLOOR: -15,
  // Position size reduction for bypassed entries (70% = 30% reduction)
  POSITION_SIZE_MULTIPLIER: 0.70,
} as const;

// ============= EARLY MOMENTUM ENTRY PARAMETERS =============
// Allow entries based on 30m+1h alignment when 4h is still neutral
// This catches trending moves earlier before they become overextended
export const EARLY_MOMENTUM_ENTRY_PARAMS = {
  // Enable early momentum entry mode
  ENABLED: true,
  // 30m must be strongly directional (confidence >= this threshold)
  TIMEFRAME_30M_MIN_CONFIDENCE: 65,
  // 1h can be less strong but must lean same direction (confidence >= this threshold)
  TIMEFRAME_1H_MIN_CONFIDENCE: 55,
  // Minimum ADX required for early momentum entry (prevents ranging false signals)
  MIN_ADX: 20,
  // ADX must be rising for early momentum entry
  REQUIRE_ADX_RISING: true,
  // Position size reduction for early momentum entries (50% = half size)
  POSITION_SIZE_MULTIPLIER: 0.50,
  // Confidence reduction applied to derived direction (safety margin)
  CONFIDENCE_REDUCTION: 0.85,
  // Stop loss multiplier (tighter stops for early entries)
  STOP_LOSS_MULTIPLIER: 1.2,  // 1.2x ATR instead of 2x
} as const;

// ============= VOLUME RELAXATION PARAMETERS =============
// Relax volume requirements during trend formation when indicators align
export const VOLUME_RELAXATION_PARAMS = {
  // Enable volume gate relaxation during trend formation
  ENABLED: true,
  // Minimum volume ratio when ADX is rising AND 30m+1h agree (default is 0.2 = 20%)
  MIN_VOLUME_RATIO_WITH_TREND: 0.10, // 10% of average (relaxed from 20%)
  // Minimum ADX for volume relaxation
  MIN_ADX: 18,
  // ADX must be rising to relax volume requirement
  REQUIRE_ADX_RISING: true,
  // 30m and 1h must both be directional and agree
  REQUIRE_TIMEFRAME_AGREEMENT: true,
  // Position size reduction when entering on relaxed volume (70% = 30% reduction)
  POSITION_SIZE_MULTIPLIER: 0.70,
} as const;

// ============= STRONG TREND OVEREXTENSION RELAXATION =============
// Raise overextension thresholds during confirmed strong trends
// Allows riding momentum in genuinely strong trends without premature blocking
// NEW: Tiered approach - very strong ADX (35+) gets highest thresholds, near-very-strong (33-35) gets intermediate
export const STRONG_TREND_OVEREXTENSION_PARAMS = {
  // Enable overextension threshold relaxation for strong trends
  ENABLED: true,
  // Minimum ADX required for strong trend mode
  MIN_ADX: 30,
  
  // NEW: Very strong ADX tier (35+) - ADX rising NOT required, highest thresholds
  VERY_STRONG_ADX: 35,
  
  // NEW: Near-very-strong ADX tier (33-35) - requires slope not falling sharply
  NEAR_VERY_STRONG_ADX: 33,
  NEAR_VERY_STRONG_MIN_SLOPE: -0.3,
  
  // ADX must be rising for strong trend mode (only required below VERY_STRONG_ADX)
  REQUIRE_ADX_RISING: true,
  // 4h and 1h must be aligned in same direction
  REQUIRE_HTF_ALIGNMENT: true,
  
  // NEW: Price action momentum can override HTF alignment requirement
  // If price moved 2%+ in trend direction, HTF alignment is less critical
  PRICE_ACTION_OVERRIDE_ENABLED: true,
  PRICE_ACTION_MIN_MOVE_PERCENT: 2.0,
  
  // Relaxed overextension threshold for LONG (default is 110, strong trend allows 120)
  PERCENT_B_THRESHOLD_LONG: 120,
  // Relaxed underextension threshold for SHORT (default is -10, strong trend allows -20)
  PERCENT_B_THRESHOLD_SHORT: -20,
  
  // NEW: Very strong trend allows even higher thresholds (130)
  VERY_STRONG_PERCENT_B_THRESHOLD_LONG: 130,
  VERY_STRONG_PERCENT_B_THRESHOLD_SHORT: -30,
  
  // Position size reduction when entering at relaxed threshold (60% = 40% reduction)
  POSITION_SIZE_MULTIPLIER: 0.60,
  
  // NEW: Very strong trend mode gets less reduction (70%)
  VERY_STRONG_POSITION_SIZE_MULTIPLIER: 0.70,
} as const;

// ============= STRONG TREND HTF BYPASS PARAMETERS =============
// Allow HTF Extreme Gate bypass when trend is very strong and no exhaustion signals
// This prevents missing strong trend continuation moves blocked by overbought/oversold readings
export const STRONG_TREND_HTF_BYPASS_PARAMS = {
  // Enable HTF gate bypass for very strong trends
  ENABLED: true,
  // Minimum ADX required for bypass (very strong trend)
  // UPDATED: Lowered from 30 to 25 to catch ETHUSDT-like situations (ADX 25.2)
  MIN_ADX: 25,
  // ADX must be rising (momentum still building)
  // UPDATED: Relaxed - only require not falling sharply (was strict rising)
  REQUIRE_ADX_RISING: false,
  // NEW: Slope threshold - ADX slope must be >= this (not falling sharply)
  // Positive slope gets priority for bypass even at lower ADX
  MIN_ADX_SLOPE: -0.3,
  // NEW: Rising slope threshold - if ADX >= 25 AND slope >= this, allow bypass
  RISING_SLOPE_THRESHOLD: 0.02,
  // Maximum reversal score to allow bypass (no reversal signals)
  // UPDATED: Raised from 40 to 50 to allow more bypasses in strong trends
  MAX_REVERSAL_SCORE: 50,
  // Require all timeframes aligned in same direction
  // UPDATED: Relaxed - allow if 4h is neutral but 1h is strong
  REQUIRE_ALL_TF_ALIGNED: false,
  // NEW: Relaxed alignment ADX threshold - above this, only require 4h alignment
  // BTCUSDT had ADX 41.6 but 1h/30m were neutral - this allows bypass
  RELAXED_ALIGNMENT_MIN_ADX: 35,
  // NEW: Alternative to all TF aligned - if ADX is super strong, bypass anyway
  // UPDATED: Lowered from 55 to 45 - ADX 40-50 is already very strong
  SUPER_STRONG_ADX_BYPASS: 45,
  // Position size reduction for trend continuation at extreme
  // UPDATED: Increased from 50% to 65% - strong trends deserve more position
  POSITION_SIZE_MULTIPLIER: 0.65,
  // NEW: Reduced position for borderline cases (ADX 25-30)
  BORDERLINE_POSITION_SIZE_MULTIPLIER: 0.50,
  // Tighter stop loss multiplier for these entries (0.8x ATR instead of normal)
  STOP_LOSS_MULTIPLIER: 0.8,
  // Earlier break-even activation for protection
  BREAK_EVEN_ACTIVATION_PERCENT: 0.3,
  // Earlier trailing stop activation
  TRAILING_ACTIVATION_PERCENT: 0.5,
} as const;

// ============= TREND EXHAUSTION DETECTION PARAMETERS =============
// Detect actual trend exhaustion vs normal overbought in strong trend
// Only block when genuine exhaustion signals are present
export const TREND_EXHAUSTION_PARAMS = {
  // Enable trend exhaustion detection
  ENABLED: true,
  // ADX must be declining from peak (was above this, now below)
  ADX_DECLINE_FROM_PEAK: 40,
  // ADX decline percentage threshold (e.g., dropped 15% from peak)
  ADX_DECLINE_PERCENT: 15,
  // Volume must be declining for consecutive candles
  VOLUME_DECLINE_CANDLES: 3,
  // Volume decline ratio (current vs average of previous candles)
  VOLUME_DECLINE_RATIO: 0.7,
  // MACD histogram showing divergence (price up, MACD down)
  REQUIRE_MACD_DIVERGENCE: false,  // Optional - can be too strict
  // StochRSI K must be decreasing (turning over)
  STOCHRSI_K_DECREASING: true,
  // Extreme StochRSI that triggers exhaustion check (K > 95)
  STOCHRSI_EXTREME_THRESHOLD: 95,
  // Points to add to reversal score when exhaustion detected
  EXHAUSTION_REVERSAL_BONUS: 25,
} as const;

// ============= TREND CONTINUATION TIGHT STOPS PARAMETERS =============
// Tighter risk management for entries at extreme overbought/oversold levels
export const TREND_CONTINUATION_TIGHT_STOPS = {
  // Enable tighter stops for trend continuation at extremes
  ENABLED: true,
  // Trailing stop distance multiplier (tighter than normal 1.5x)
  TRAILING_DISTANCE_MULTIPLIER: 0.8,
  // Trailing stop activation at lower profit threshold
  TRAILING_ACTIVATION_PERCENT: 0.5,
  // Break-even activation at lower profit threshold
  BREAK_EVEN_ACTIVATION_PERCENT: 0.3,
  // Mark entry as "trend_continuation_at_extreme" for special handling
  ENTRY_TAG: "trend_continuation_at_extreme",
} as const;

// ============= VOLUME RELAXATION EXIT PARAMETERS =============
// Exit logic for entries made during low-volume conditions (higher false breakout risk)
export const VOLUME_RELAXATION_EXIT_PARAMS = {
  // Maximum hold time for low-volume entries (minutes)
  MAX_AGE_MINUTES: 90,
  // Minimum profit required to continue holding after max age
  MIN_PROFIT_PERCENT: 0.4,
  // Extra trailing stop tightness for volume relaxation entries
  TRAILING_TIGHTNESS_MULTIPLIER: 0.85,
} as const;

// ============= R-MULTIPLE PROFIT LOCK PARAMETERS =============
// Use initial_risk_amount for consistent risk-based profit locking
export const R_MULTIPLE_LOCK_PARAMS = {
  // Start R-locking at this profit level
  ACTIVATION_R: 2.0,
  // Only lock if peak reached this R-multiple
  PEAK_REQUIRED_R: 2.5,
  // Lock at minimum this R-multiple when conditions met
  MIN_LOCK_R: 1.5,
  // Log R-multiple status for trades with initial_risk_amount
  ENABLE_LOGGING: true,
} as const;

// ============= MULTI-STRATEGY CONVERGENCE PARAMETERS =============
// Fallback when no single strategy passes all filters, but multiple agree on conditions
// This captures setups that pass hard gates and quality checks but fail strategy-specific filters
export const CONVERGENCE_PARAMS = {
  // Enable multi-strategy convergence fallback
  ENABLED: true,
  // Minimum strategies that must pass conditions (before secondary filters)
  MIN_STRATEGIES_AGREEING: 2,
  // Minimum quality score required for convergence entry
  MIN_QUALITY_SCORE: 60,
  // Position size multiplier for convergence entries (50% = half size for safety)
  POSITION_SIZE_MULTIPLIER: 0.50,
  // Minimum 1h confidence for convergence to be allowed
  MIN_1H_CONFIDENCE: 65,
  // Maximum reversal score allowed for convergence entries
  MAX_REVERSAL_SCORE: 45,
} as const;

// ============= STRONG 1H TREND ENTRY PARAMETERS =============
// Allow entries when 1h trend is very strong even when 4h is neutral/mixed
// This captures trending moves that haven't propagated to higher timeframes yet
export const STRONG_1H_TREND_PARAMS = {
  // Enable strong 1h trend entries
  ENABLED: true,
  // Minimum 1h confidence required
  MIN_1H_CONFIDENCE: 70,
  // Allow "mixed" momentum state when 1h is very strong
  ALLOW_MIXED_MOMENTUM_STATE: true,
  // ADX relaxation for EMA strategies when 1h is strong
  EMA_REDUCED_ADX: 22,  // Reduced from 25
  // Position size multiplier for strong 1h entries with neutral 4h
  POSITION_SIZE_MULTIPLIER: 0.75,
} as const;

// ============= PHASE 3: CONTEXT-AWARE EXIT MANAGEMENT =============
// Smart stop loss and trailing activation based on market context

// ADX-based stop loss width adjustment
export const CONTEXT_AWARE_STOP_PARAMS = {
  // Enable context-aware stop placement
  ENABLED: true,
  
  // === ADX-BASED STOP WIDTH ===
  // Strong trend (ADX > 30): Use tighter stops (trend is directional)
  STRONG_TREND_ADX: 30,
  STRONG_TREND_ATR_MULTIPLIER: 1.2,  // 1.2x ATR stop
  
  // Medium trend (ADX 22-30): Use normal stops
  MEDIUM_TREND_ADX_MIN: 22,
  MEDIUM_TREND_ADX_MAX: 30,
  MEDIUM_TREND_ATR_MULTIPLIER: 1.5,  // 1.5x ATR stop
  
  // Weak trend (ADX < 22): Use wider stops (choppy market needs room)
  WEAK_TREND_ADX: 22,
  WEAK_TREND_ATR_MULTIPLIER: 2.0,    // 2.0x ATR stop
  
  // === SWING-BASED STOP PLACEMENT ===
  // Use recent swing high/low for stop placement when available
  SWING_STOP_ENABLED: true,
  // Lookback period for finding swing points (candles)
  SWING_LOOKBACK: 20,
  // Buffer beyond swing point (ATR multiplier)
  SWING_BUFFER_ATR: 0.3,
  // Maximum distance from entry for swing stop (ATR multiplier)
  MAX_SWING_DISTANCE_ATR: 3.0,
  // Minimum distance from entry for swing stop (ATR multiplier)
  MIN_SWING_DISTANCE_ATR: 0.8,
  
  // === VOLATILITY ADJUSTMENT ===
  // Expand stops in high volatility conditions
  HIGH_VOLATILITY_ATR_RATIO: 1.5,    // Current ATR / historical ATR > 1.5
  HIGH_VOLATILITY_EXPANSION: 1.3,    // 30% wider stops in high volatility
  
  // Contract stops in low volatility conditions
  LOW_VOLATILITY_ATR_RATIO: 0.7,     // Current ATR / historical ATR < 0.7
  LOW_VOLATILITY_CONTRACTION: 0.85,  // 15% tighter stops in low volatility
} as const;

// Enhanced R-multiple trailing with dynamic activation
export const PHASE3_R_MULTIPLE_PARAMS = {
  // Enable dynamic R-multiple trailing
  ENABLED: true,
  
  // === DYNAMIC ACTIVATION BASED ON ADX ===
  // Strong trend: Activate earlier (more directional = can trail sooner)
  STRONG_TREND_ACTIVATION_R: 1.0,    // Activate at 1R in strong trends
  // Medium trend: Standard activation
  MEDIUM_TREND_ACTIVATION_R: 1.2,    // Activate at 1.2R (default)
  // Weak trend: Activate later (need more buffer for chop)
  WEAK_TREND_ACTIVATION_R: 1.5,      // Activate at 1.5R in weak trends
  
  // === TRAILING DISTANCE BASED ON ADX ===
  // Strong trend: Trail tighter
  STRONG_TREND_TRAIL_R: 0.5,         // Trail 0.5R behind
  // Medium trend: Standard trailing
  MEDIUM_TREND_TRAIL_R: 0.75,        // Trail 0.75R behind
  // Weak trend: Trail looser
  WEAK_TREND_TRAIL_R: 1.0,           // Trail 1R behind (more room)
  
  // === PROFIT LOCK TIERS (R-multiple based) ===
  // Lock profits at increasingly protective levels as R increases
  LOCK_TIERS: [
    { rMultiple: 1.0, lockR: 0.25 },   // At 1R profit, lock 0.25R
    { rMultiple: 1.5, lockR: 0.5 },    // At 1.5R profit, lock 0.5R
    { rMultiple: 2.0, lockR: 0.75 },   // At 2R profit, lock 0.75R
    { rMultiple: 2.5, lockR: 1.0 },    // At 2.5R profit, lock 1R (break-even on risk)
    { rMultiple: 3.0, lockR: 1.5 },    // At 3R profit, lock 1.5R
    { rMultiple: 4.0, lockR: 2.0 },    // At 4R profit, lock 2R
    { rMultiple: 5.0, lockR: 3.0 },    // At 5R profit, lock 3R
  ],
  
  // === ACCELERATION ZONE ===
  // When momentum is accelerating, use tighter trails
  ACCELERATION_TRAIL_MULTIPLIER: 0.7, // 30% tighter trailing when accelerating
  
  // === EXHAUSTION PROTECTION ===
  // When momentum shows exhaustion signs, lock more aggressively
  EXHAUSTION_LOCK_BONUS_R: 0.5,       // Add 0.5R to lock level when exhausted
} as const;

// Exit priority scoring
export const EXIT_MANAGEMENT_PRIORITY = {
  // Priority weights for exit decisions
  MOMENTUM_EXHAUSTION_WEIGHT: 30,
  SWING_VIOLATION_WEIGHT: 25,
  REVERSAL_SIGNAL_WEIGHT: 20,
  TIME_DECAY_WEIGHT: 15,
  VOLATILITY_SPIKE_WEIGHT: 10,
  
  // Minimum combined score to trigger exit
  MIN_EXIT_SCORE: 50,
  
  // Emergency exit threshold (skip normal checks)
  EMERGENCY_THRESHOLD: 80,
} as const;

// ============= QUIET TREND DETECTION PARAMETERS =============
// Catches sustained directional price moves when ADX is low but price is grinding consistently
// These are "quiet declines/rises" that slip through traditional ADX gates
// Phase 1: BTC/ETH only with conservative position sizing
export const QUIET_TREND_PARAMS = {
  // Enable quiet trend detection
  ENABLED: true,
  
  // ===== ASSET RESTRICTIONS (Phase 1: BTC/ETH only) =====
  // Only liquid, large-cap assets that can sustain quiet directional drifts
  ALLOWED_SYMBOLS: ["BTCUSDT", "ETHUSDT"],
  
  // ===== PRICE SLOPE DETECTION (replaces simple persistence count) =====
  // Total price move required over lookback period
  MIN_PRICE_MOVE_PERCENT: 1.5,      // 1.5% total move over lookback
  LOOKBACK_HOURS: 6,                // Check last 6 hours
  // Minimum slope (move per hour) - ensures move is sustained, not single-bar
  MIN_AVG_MOVE_PER_HOUR: 0.20,      // 0.2% per hour minimum slope
  
  // ===== ADX REQUIREMENTS =====
  // ADX must be in "quiet" range (low but not dead)
  MIN_ADX: 15,                      // Relaxed from 20 - still requires some trend
  MAX_ADX: 22,                      // Only applies when ADX is below normal threshold
  // ADX stability check - block if ADX is collapsing (end of move entries)
  REQUIRE_ADX_NOT_FALLING: true,
  MAX_ADX_DROP: 3,                  // Max ADX points drop over lookback (blocks end-of-move)
  
  // ===== MICRO-TREND PERSISTENCE =====
  // Minimum consecutive micro-trend readings in same direction
  MIN_CONSECUTIVE_READINGS: 3,      // 3+ consecutive readings (tracked in signal flow)
  
  // ===== HTF GATES =====
  ALLOW_4H_NEUTRAL: true,           // Allow when 4H is neutral (the common case)
  BLOCK_4H_OPPOSING: true,          // ALWAYS block when 4H actively opposes direction
  
  // ===== ENTRY TIMING (prevent late chasing) =====
  // Don't enter if price already moved too far from recent swing
  MAX_DISTANCE_FROM_4H_EXTREME_PERCENT: 1.2,  // Don't enter if 1.2%+ from swing
  
  // ===== VOLUME & STOCHRSI SAFETY =====
  REQUIRE_VOLUME_CONFIRM: true,     // Volume should support direction
  BLOCK_IF_STOCHRSI_EXTREME: true,  // Don't chase at absolute extremes
  MAX_STOCHRSI_K_LONG: 85,          // Don't chase overbought for longs
  MIN_STOCHRSI_K_SHORT: 15,         // Don't chase oversold for shorts
  
  // ===== POSITION SIZING (Conservative) =====
  POSITION_SIZE_MULTIPLIER: 0.50,   // 50% position size for safety
  
  // ===== STOP LOSS (Tighter for low ADX) =====
  STOP_LOSS_ATR_MULTIPLIER: 1.25,   // Tighter than normal 1.5x
} as const;

// ============= MOMENTUM EXHAUSTION OVERRIDE PARAMETERS =============
// Allows entries in REGIME_EXHAUSTED when momentum is still confirmed and trend is strong
// This addresses over-blocking in strong-ADX, confirmed-momentum scenarios
// All safety conditions must pass - this is a disciplined exception, not a bypass
export const MOMENTUM_EXHAUSTION_OVERRIDE_PARAMS = {
  ENABLED: true,
  
  // ===== CORE REQUIREMENTS =====
  MIN_ADX: 30,                           // Only in genuinely strong trends
  REQUIRED_MOMENTUM_STATE: "confirmed",  // Strongest momentum signal required
  
  // ===== CRITICAL SAFETY GATES =====
  // Gap 1 Fix: StochRSI floor/ceiling protection
  // Block shorts at absolute floor (high snapback risk)
  // Block longs at absolute ceiling
  BLOCK_IF_STOCHRSI_K_BELOW: 2,          // No shorts when K <= 2
  BLOCK_IF_STOCHRSI_K_ABOVE: 98,         // No longs when K >= 98
  
  // Gap 2 Fix: Strict timeframe alignment
  // 1h MUST align with direction (not optional)
  REQUIRE_1H_ALIGNMENT: true,
  // 30m alignment adds confidence but not required
  ALLOW_30M_AS_BONUS: true,
  BONUS_30M_POSITION_INCREASE: 0.10,     // +10% position if 30m also aligns
  
  // Gap 3 Fix: Time-in-regime constraint
  // Don't override fresh exhaustion signals (often correct)
  MIN_EXHAUSTION_AGE_MINUTES: 30,
  // Proxy: if regimeScore < 70, exhaustion has been present for a while
  MATURE_EXHAUSTION_SCORE_THRESHOLD: 70,
  
  // ===== RISK MANAGEMENT =====
  POSITION_SIZE_MULTIPLIER: 0.60,        // 60% of normal position
  MAX_POSITION_WITH_30M_BONUS: 0.70,     // Max 70% even with 30m alignment
  STOP_MULTIPLIER: 0.70,                 // Tighter stops (30% tighter)
  
  // ===== TRACKING =====
  EXCEPTION_TYPE: "MOMENTUM_OVERRIDE_EXHAUSTION" as const,
} as const;

// ============= LOW ADX TREND EXCEPTION =============
// Allows entries when ADX is low BUT higher timeframe trend is strong
// AND price action structure confirms direction (not just indicator alignment)
// Phase 1 improvement to capture strong HTF setups in low-energy markets
// 
// TIERED APPROACH (Market-aware):
// - Core Zone (12-20): Standard confirmations (HTF + structure)
// - Transitional Zone (20-25): Requires ADDITIONAL momentum confirmation
//   This prevents false positives in choppy 20-25 ADX environments
export const LOW_ADX_TREND_EXCEPTION_PARAMS = {
  ENABLED: true,
  
  // ===== ADX BOUNDS =====
  MIN_ADX: 12,                    // Allow down to ADX 12 (lowered from 15 for current market)
  MAX_ADX: 25,                    // RAISED from 20 to 25 to capture emerging trends (BNBUSDT ADX 22.6)
  
  // ===== TIERED ADX ZONES =====
  // Core Zone: ADX 12-20 - standard confirmations apply
  CORE_ZONE_MAX_ADX: 20,
  // Transitional Zone: ADX 20-25 - requires additional momentum confirmation
  TRANSITIONAL_ZONE_MIN_ADX: 20,
  TRANSITIONAL_ZONE_MAX_ADX: 25,
  
  // ===== TRANSITIONAL ZONE REQUIREMENTS (20-25 ADX) =====
  // These ADDITIONAL requirements apply only in the 20-25 ADX zone
  // to prevent false positives in choppy emerging-trend environments
  TRANSITIONAL_REQUIRE_MOMENTUM_EXPANDING: true,    // MACD must be expanding
  TRANSITIONAL_REQUIRE_MACD_STRONG: false,          // MACD strong is optional (too strict)
  TRANSITIONAL_REQUIRE_DIRECTION_CONSISTENT: true,  // Recent candles must confirm direction
  TRANSITIONAL_CONSISTENT_CANDLES: 3,               // Min 3 of last 5 candles in direction
  TRANSITIONAL_REQUIRE_NO_HTF_CONFLICT: true,       // 4h must not oppose 1h direction
  TRANSITIONAL_MIN_1H_CONFIDENCE: 60,               // Higher 1h confidence requirement
  TRANSITIONAL_POSITION_REDUCTION: 0.45,            // Extra position reduction (45% vs 50%)
  
  // ===== HTF REQUIREMENTS (Significantly relaxed - Phase 4 Gate Relaxation) =====
  // LOWERED from 60% to 50% to allow more signals through
  MIN_HTF_CONFIDENCE: 50,         // 4h trend must be >= 50% confidence
  MIN_1H_CONFIDENCE: 50,          // 1h must also show direction (lowered from 55%)
  REQUIRE_TREND_ALIGNMENT: true,  // 4h and 1h must agree on direction
  
  // ===== 1H FALLBACK =====
  // If 4h is moderate (60-65%) but 1h is very strong (>=70%), still allow entry
  ALLOW_1H_FALLBACK: true,
  FALLBACK_MIN_4H_CONFIDENCE: 60,   // 4h must be at least 60% for fallback
  FALLBACK_MIN_1H_CONFIDENCE: 70,   // 1h must be >= 70% for fallback to apply
  
  // ===== NEUTRAL 4H HANDLING (CRITICAL FIX) =====
  // Low ADX environments often have neutral 4h - allow exception if 1h is strong
  ALLOW_NEUTRAL_4H: true,               // Allow exception when 4h is neutral
  NEUTRAL_4H_MIN_1H_CONFIDENCE: 60,     // Lowered to match TRANSITIONAL_MIN_1H_CONFIDENCE (60%+)
  NEUTRAL_4H_POSITION_REDUCTION: 0.40,  // Extra conservative (40% vs 50%)
  
  // ===== STRUCTURE CONFIRMATION (Critical - not just indicator alignment) =====
  REQUIRE_STRUCTURE_CONFIRMATION: true,
  // For LONG: higher high + higher low (HH/HL)
  // For SHORT: lower low + lower high (LL/LH)
  STRUCTURE_LOOKBACK_BARS: 12,    // 12 x 15min = 3 hours of structure
  
  // ===== STRUCTURE FALLBACK (if 1h is very strong) =====
  ALLOW_STRUCTURE_FALLBACK: true,       // Allow bypass if 1h very strong
  STRUCTURE_FALLBACK_MIN_1H: 70,        // Require 70%+ 1h confidence
  STRUCTURE_FALLBACK_MIN_MOVE: 0.5,     // And 0.5%+ price move momentum
  
  // ===== ADDITIONAL SAFETY =====
  REQUIRE_MOMENTUM_NOT_OPPOSING: true,
  // Block if momentum state is "exhausted" or opposing direction
  BLOCK_IF_MOMENTUM_EXHAUSTED: true,
  // Block if reversal score is already elevated
  MAX_REVERSAL_SCORE: 50,
  
  // ===== POSITION SIZING (Conservative) =====
  POSITION_SIZE_MULTIPLIER: 0.50,  // 50% position size for safety
  STOP_LOSS_MULTIPLIER: 0.8,       // Tighter stops
  
  // ===== TRACKING =====
  EXCEPTION_TYPE: "LOW_ADX_TREND_EXCEPTION" as const,
} as const;

// ============= REGIME-ADAPTIVE ADX THRESHOLDS =============
// ADX threshold should not be fixed - it should scale with market regime
// Phase 2 improvement: different thresholds for different market conditions
export const REGIME_ADAPTIVE_ADX_PARAMS = {
  ENABLED: true,
  
  // Threshold by regime - FIXED: Lower thresholds for ranging to HELP entries, not block them
  // These are thresholds for exception paths - lower = easier to enter
  THRESHOLDS: {
    RANGING: 18,      // Ranging: use LOWER threshold (18) to ALLOW exception entries
    TRANSITION: 16,   // Emerging trends: even lower (16) - good time to enter
    TRENDING: 15,     // Established trends: keep low (15)
    SQUEEZE: 14,      // Squeeze breakouts: lowest (14) - prime entry zone
  } as Record<string, number>,
  
  // Log when regime-adaptive threshold is applied
  LOG_REGIME_THRESHOLD: true,
} as const;

// ============= CONFIRMED MOMENTUM DIRECTION OVERRIDE =============
// When all timeframes are neutral but momentum is CONFIRMED, use MACD histogram
// direction to derive trade direction. This addresses the disconnect between
// strong momentum confirmation and neutral EMA-based trend classification.
export const MOMENTUM_DIRECTION_OVERRIDE_PARAMS = {
  ENABLED: true,
  
  // ===== ACTIVATION CONDITIONS =====
  // Requires momentum state to be "confirmed"
  REQUIRE_CONFIRMED_MOMENTUM: true,
  // Requires genuine momentum (MACD expanding + ADX rising)
  REQUIRE_GENUINE_MOMENTUM: true,
  // Minimum ADX for override to apply
  MIN_ADX: 20,
  
  // ===== MACD DIRECTION THRESHOLDS =====
  // Minimum MACD histogram magnitude to use as direction source
  // (avoids noise from near-zero histograms)
  MIN_MACD_MAGNITUDE: 0.00005,
  // Strong MACD magnitude (gets higher position size)
  STRONG_MACD_MAGNITUDE: 0.0002,
  
  // ===== POSITION SIZING =====
  // Base position size multiplier for momentum-derived direction
  POSITION_SIZE_MULTIPLIER: 0.60,    // 60% of normal
  // Higher size for strong MACD signal
  STRONG_MACD_POSITION_MULTIPLIER: 0.70,  // 70% of normal
  
  // ===== EXCEPTION TYPE FOR TRACKING =====
  EXCEPTION_TYPE: "MOMENTUM_DIRECTION_OVERRIDE" as const,
} as const;

// ============= ORDER FLOW DIRECTION FALLBACK =============
// When trends are neutral but order flow shows strong buy/sell pressure,
// use order flow signal to derive trade direction.
export const ORDER_FLOW_DIRECTION_PARAMS = {
  ENABLED: true,
  
  // ===== ACTIVATION CONDITIONS =====
  // Minimum order flow score to use as direction source
  MIN_ORDER_FLOW_SCORE: 70,
  // Order flow signal must be strong_buy or strong_sell
  REQUIRE_STRONG_SIGNAL: true,
  // Minimum ADX (must not be completely flat market)
  MIN_ADX: 18,
  
  // ===== POSITION SIZING =====
  // Position size multiplier for order-flow-derived direction
  POSITION_SIZE_MULTIPLIER: 0.55,    // 55% of normal (more conservative)
  
  // ===== EXCEPTION TYPE FOR TRACKING =====
  EXCEPTION_TYPE: "ORDER_FLOW_DIRECTION" as const,
} as const;

// ============= PRE-MOMENTUM STOCHRSI EXTREME ENTRY =============
// When StochRSI is at deep extremes with directional 1h trend but momentum not yet confirmed,
// allow reduced-size entry. This catches moves like AVAX 2.30% drop that indicators lag.
export const PRE_MOMENTUM_STOCHRSI_PARAMS = {
  ENABLED: true,
  
  // ===== STOCHRSI THRESHOLDS =====
  // Relaxed threshold for SHORT to catch more moves like AVAX (K=15.7)
  MAX_STOCHRSI_K_FOR_SHORT: 18,   // K < 18 = oversold zone, allow SHORT (was 15)
  MIN_STOCHRSI_K_FOR_LONG: 82,    // K > 82 = overbought zone, allow LONG (was 85)
  
  // ===== ADX REQUIREMENTS =====
  // Must have some trend strength (not completely flat)
  MIN_ADX: 18,
  
  // ===== 1H TREND REQUIREMENTS =====
  // 1h must be directional and match the intended direction
  REQUIRE_1H_DIRECTIONAL: true,
  MIN_1H_CONFIDENCE: 55,          // 1h must show >= 55% confidence in direction
  
  // ===== POSITION SIZING =====
  POSITION_SIZE_MULTIPLIER: 0.50, // 50% of normal for safety
  STRONG_SETUP_MULTIPLIER: 0.60,  // 60% when 1h confidence >= 65%
  
  // ===== STOP LOSS =====
  STOP_LOSS_MULTIPLIER: 0.8,      // Tighter stops (0.8x ATR)
  
  // ===== EXCEPTION TYPE FOR TRACKING =====
  EXCEPTION_TYPE: "PRE_MOMENTUM_STOCHRSI_EXTREME" as const,
} as const;

// ============= SHORT-TERM ALIGNMENT OVERRIDE =============
// When 1h, 30m, and micro trend all agree but momentum is "none",
// allow entry with reduced size. This captures coordinated moves across timeframes.
export const SHORT_TERM_ALIGNMENT_PARAMS = {
  ENABLED: true,
  
  // ===== TIMEFRAME REQUIREMENTS =====
  // All 3 short-term timeframes must agree on direction
  REQUIRE_1H_DIRECTION: true,
  REQUIRE_30M_DIRECTION: true,
  REQUIRE_MICRO_DIRECTION: true,
  
  // ===== ADX REQUIREMENTS =====
  MIN_ADX: 18,                    // Must not be completely ranging
  
  // ===== MOMENTUM OVERRIDE =====
  // Only applies when momentum state is "none" (not blocking for other reasons)
  ALLOW_WHEN_MOMENTUM_NONE: true,
  
  // ===== POSITION SIZING =====
  POSITION_SIZE_MULTIPLIER: 0.55, // 55% of normal
  
  // ===== EXCEPTION TYPE =====
  EXCEPTION_TYPE: "SHORT_TERM_ALIGNMENT_OVERRIDE" as const,
} as const;

// ============= NO_MOMENTUM_CONFIRMATION GATE PARAMETERS =============
// Controls the behavior of the NO_MOMENTUM_CONFIRMATION hard gate
// This gate ensures signals have directional conviction before entry
// 
// KEY IMPROVEMENTS (Expert Review):
// 1. Path 2 ADX Floor - Prevents weak "building" state from passing without ADX minimum
// 2. Exception Budget - Prevents multiple weak justifications from stacking
// 3. Direction Bias Model - Premium overrides suggest direction, don't override it
export const NO_MOMENTUM_GATE_PARAMS = {
  // ===== FEATURE FLAGS =====
  // Enable Path 2 ADX floor requirement
  ENABLE_PATH_2_ADX_FLOOR: true,
  // Enable exception budget (max 1 exception per signal)
  ENABLE_EXCEPTION_BUDGET: true,
  
  // ===== PATH 2: STATE PRESENCE ADX FLOOR =====
  // When momentumState is "building" or "mixed", require minimum ADX
  // This prevents weak momentum states from passing in dead markets
  STATE_PRESENCE_MIN_ADX: 20,  // ADX_THRESHOLDS.MINIMUM
  
  // ===== EXCEPTION BUDGET =====
  // Maximum exception paths that can be combined for a single signal
  // Setting to 1 means only the FIRST qualifying exception is used
  MAX_EXCEPTION_DEPTH: 1,
  
  // ===== EXCEPTION PRIORITY ORDER =====
  // Lower number = higher priority, evaluated first
  // If priority 1 qualifies, priorities 2+ are skipped
  EXCEPTION_PRIORITIES: {
    STOCHRSI_ADX_ALIGNMENT: 1,  // StochRSI-ADX threshold reduction
    STRONG_TREND: 2,            // ADX >= 28 (or 22 if aligned)
    TREND_ACCELERATION: 3,      // 2.5%+ price move with ADX rising
    PRE_MOMENTUM_STOCHRSI: 4,   // Deep StochRSI extreme + 1h directional
    SHORT_TERM_ALIGNMENT: 5,    // 1h+30m+micro all agree
  } as const,
  
  // ===== DIRECTION BIAS VS OVERRIDE =====
  // When premium overrides (5A/5B) set direction, it's a "bias" not an override
  // If centralized deriveTradeDirection conflicts, apply position reduction
  DIRECTION_CONFLICT_POSITION_REDUCTION: 0.70,  // 30% reduction on conflict
  
  // ===== LOGGING =====
  LOG_EXCEPTION_USAGE: true,
  LOG_ADX_FLOOR_SKIPS: true,
} as const;

// Exception types for the NO_MOMENTUM_CONFIRMATION gate
export type NoMomentumExceptionType = 
  | "STOCHRSI_ADX_ALIGNMENT"
  | "STRONG_TREND"
  | "TREND_ACCELERATION"
  | "PRE_MOMENTUM_STOCHRSI"
  | "SHORT_TERM_ALIGNMENT"
  | null;

// ============= STOCHRSI DECLINE MOMENTUM BONUS =============
// When StochRSI K is already low and declining (K < D), indicates building bearish momentum
// Add momentum score bonus for scoring purposes
export const STOCHRSI_DECLINE_BONUS_PARAMS = {
  ENABLED: true,
  
  // ===== THRESHOLDS =====
  // K must be below this for bearish bonus
  MAX_K_FOR_BEARISH_BONUS: 20,
  // K must be above this for bullish bonus
  MIN_K_FOR_BULLISH_BONUS: 80,
  
  // ===== BONUS VALUE =====
  MOMENTUM_SCORE_BONUS: 3,        // +3 to momentum score when K declining from extreme
} as const;

// ============= DYNAMIC ADX THRESHOLD WITH STOCHRSI ALIGNMENT =============
// When 1h bearish AND StochRSI < 20, reduce ADX threshold from 28 to 22
// This allows strong-trend exceptions at lower ADX when indicators align
export const STOCHRSI_ADX_ALIGNMENT_PARAMS = {
  ENABLED: true,
  
  // ===== STOCHRSI THRESHOLDS =====
  // For bearish: StochRSI K must be below this
  BEARISH_STOCHRSI_THRESHOLD: 20,
  // For bullish: StochRSI K must be above this
  BULLISH_STOCHRSI_THRESHOLD: 80,
  
  // ===== ADX THRESHOLD REDUCTION =====
  // Original strong trend ADX threshold is 28, reduce to this when aligned
  REDUCED_ADX_THRESHOLD: 22,
  
  // ===== 1H REQUIREMENT =====
  REQUIRE_1H_MATCH: true,         // 1h trend must match direction
} as const;

// ============= RELAXED ORDER FLOW WHEN 1H DIRECTIONAL =============
// When 1h trend is clear, accept lower order flow score for direction fallback
export const RELAXED_ORDER_FLOW_PARAMS = {
  ENABLED: true,
  
  // When 1h is directional, reduce order flow requirement from 70 to 60
  RELAXED_MIN_ORDER_FLOW_SCORE: 60,
} as const;

// ============= NEUTRAL PERSISTENCE MODELING =============
// Tracks how long a market has been neutral
// Longer neutral periods that resolve into drift are more meaningful
// This is a CONFIDENCE MULTIPLIER, never a gate bypass
export const NEUTRAL_PERSISTENCE_PARAMS = {
  ENABLED: true,
  
  // ===== NEUTRAL STATE DEFINITION =====
  // All timeframes must have confidence below this to count as "neutral"
  NEUTRAL_CONFIDENCE_THRESHOLD: 55,
  // Maximum netSignal magnitude for neutral state
  MAX_NET_SIGNAL_FOR_NEUTRAL: 4,
  
  // ===== PERSISTENCE TRACKING =====
  // Minimum duration to consider persistence meaningful (minutes)
  MIN_DURATION_MINUTES: 60,
  // Maximum duration bonus cap (minutes) - beyond this, no additional bonus
  MAX_DURATION_CAP_MINUTES: 480,  // 8 hours
  
  // ===== CONFIDENCE BONUSES =====
  // Bonus per hour of neutral persistence (added to stealth/grind score)
  BONUS_PER_HOUR: 2,  // +2 points per hour neutral
  // Maximum bonus from persistence
  MAX_BONUS: 10,  // Cap at +10 points
  
  // ===== APPLICATION =====
  // Apply bonus to Late Grind Acceptance scoring
  APPLY_TO_LATE_GRIND: true,
  // Apply bonus to Stealth Trend scoring  
  APPLY_TO_STEALTH_TREND: true,
  // Apply bonus to Quiet Trend detection
  APPLY_TO_QUIET_TREND: true,
} as const;

// ============= GATE RELAXATION FLAGS =============
// Per-gate feature flags for phased rollout of probabilistic gate system
// Each flag can be independently disabled for immediate rollback
export const GATE_RELAXATION_FLAGS = {
  // Phase 1: Direction derivation improvements
  DIRECTION_WEIGHTED: true,           // Use weighted sum instead of requiring one strong TF
  DIRECTION_PERSISTENCE: true,        // Bonus for consistent direction over 3-5 candles
  
  // Phase 2: MACD gate optimization
  MACD_DURATION_CHECK: true,          // Only block after 3+ consecutive opposing bars
  MACD_MAGNITUDE_CHECK: true,         // Ignore small divergences
  
  // Phase 3: ADX exhaustion refinement
  EXHAUSTION_TIME_CONTEXT: true,      // Require minimum trend age for exhaustion
  EXHAUSTION_PRICE_ACTION: true,      // Require price action confirmation
  
  // Phase 4: StochRSI optimization
  STOCHRSI_DYNAMIC: true,             // Dynamic thresholds based on ADX
  STOCHRSI_PENALTY_CAP: true,         // Cap StochRSI penalty contribution
} as const;

// ============= DIRECTION DERIVATION PARAMS =============
// Phase 1: Weighted direction derivation with persistence bonus
// Replaces brittle single-timeframe requirements with probabilistic aggregation
export const DIRECTION_DERIVATION_PARAMS = {
  // Neutral confidence threshold (was 55, lowered to 45)
  // Confidence 40-54% now contributes to weighted sum instead of being "neutral"
  NEUTRAL_THRESHOLD: 45,
  
  // Weighted sum threshold for direction derivation
  // If weighted sum exceeds this, derive direction from it
  WEIGHTED_SUM_THRESHOLD: 0.55,
  
  // Timeframe weights for direction derivation
  // 4h: 40%, 1h: 40%, 30m: 20%
  WEIGHT_4H: 0.40,
  WEIGHT_1H: 0.40,
  WEIGHT_30M: 0.20,
  
  // ===== DYNAMIC WEIGHT REALLOCATION (PHASE 1 FIX) =====
  // When 4H is neutral and contributes nothing, redistribute its weight to lower TFs
  // This prevents wasting 40% of the weighted sum when 4H is indecisive
  ENABLE_WEIGHT_REALLOCATION: true,
  REALLOCATED_WEIGHT_1H: 0.65,      // 1H gets 65% when 4H neutral
  REALLOCATED_WEIGHT_30M: 0.35,     // 30M gets 35% when 4H neutral
  
  // Direction persistence bonus
  // If direction remains stable for N bars, reduce confidence threshold
  PERSISTENCE_BARS: 4,              // 4 bars of consistent direction
  PERSISTENCE_BONUS: 0.08,          // 8% confidence boost
  
  // Order flow as direction tiebreaker
  // When weighted sum is marginal (0.35-0.54), use order flow if strong
  ORDER_FLOW_MIN_SCORE: 60,         // Minimum order flow score to use as tiebreaker
  ORDER_FLOW_POSITION_MULTIPLIER: 0.60,  // 60% position when using order flow direction
  
  // ===== PHASE 2 GAP 1: CONTEXTUALIZED ORDER FLOW =====
  // Require 30m trend alignment to prevent order flow noise injection
  REQUIRE_30M_ALIGNMENT: true,      // Order flow must align with 30m trend
  ORDER_FLOW_30M_BONUS: 0.05,       // Extra confidence when 30m fully aligned
  
  // ===== PHASE 2 GAP 2: CONFIDENCE BLENDING FIX =====
  // When 4H is weak, use max(1h, 30m) instead of blending weak confidence
  WEAK_4H_CONFIDENCE_THRESHOLD: 50, // 4H confidence below this = "weak"
  USE_MAX_LOWER_TF_CONFIDENCE: true, // Use max(1h, 30m) when 4H weak
  
  // ===== PHASE 3: MOMENTUM WEIGHT IN DIRECTION DERIVATION =====
  // Factor momentum score into weighted sum - strongly opposing momentum reduces confidence
  // This prevents deriving LONG when momentum is -22 (strongly bearish)
  MOMENTUM_WEIGHT_ENABLED: true,
  MOMENTUM_WEIGHT_FACTOR: 0.15,       // 15% weight allocated to momentum alignment
  MOMENTUM_STRONG_OPPOSING_THRESHOLD: -15, // For LONG: momentum below this = strongly opposing
  MOMENTUM_WEAK_OPPOSING_THRESHOLD: -5,    // For LONG: momentum below this = weakly opposing
  MOMENTUM_ALIGNMENT_BONUS: 0.10,     // Bonus to weighted sum when momentum aligns
  MOMENTUM_WEAK_OPPOSING_PENALTY: 0.08, // Penalty when momentum weakly opposes
  MOMENTUM_STRONG_OPPOSING_PENALTY: 0.15, // BASE penalty when momentum strongly opposes (scaled by magnitude)
  MOMENTUM_CONFIDENCE_REDUCTION_STRONG: 15, // BASE confidence reduction when strongly opposing (scaled)
  MOMENTUM_CONFIDENCE_REDUCTION_WEAK: 8,   // Reduce confidence by 8% when weakly opposing
  MOMENTUM_POSITION_REDUCTION_STRONG: 0.70, // 70% position when momentum strongly opposes
  MOMENTUM_POSITION_REDUCTION_WEAK: 0.85,   // 85% position when momentum weakly opposes
  
  // ===== EXTREME MOMENTUM VETO (v3.0) =====
  // Hard veto BEFORE direction derivation - prevents nonsensical directions
  // This is the primary safety rail: momentum magnitude should influence confidence non-linearly
  EXTREME_MOMENTUM_VETO_ENABLED: true,
  EXTREME_BULL_MOMENTUM_THRESHOLD: 50,  // Momentum >= +50 blocks SHORT derivation
  EXTREME_BEAR_MOMENTUM_THRESHOLD: -50, // Momentum <= -50 blocks LONG derivation
  
  // ===== GRADUATED MOMENTUM PENALTY (v3.0) =====
  // For non-extreme cases (15-50): scaled penalty based on magnitude
  // Replaces flat penalty model - penalty = (score/100) * MAX_PENALTY
  GRADUATED_MOMENTUM_PENALTY_ENABLED: true,
  GRADUATED_SCALING_ENABLED: true,      // NEW: Linear scaling instead of tier steps
  GRADUATED_MAX_PENALTY: 0.60,          // Maximum penalty at |momentum| = 100
  GRADUATED_MIN_PENALTY: 0.10,          // Minimum penalty at |momentum| = 15
  
  // Tier thresholds (used when GRADUATED_SCALING_ENABLED = false)
  MOMENTUM_EXTREME_THRESHOLD: 50,       // Score magnitude >= 50 = "extreme" momentum
  MOMENTUM_VERY_STRONG_THRESHOLD: 30,   // Score magnitude >= 30 = "very strong" momentum
  MOMENTUM_EXTREME_PENALTY_MULTIPLIER: 4.0,      // 4x base penalty at extreme
  MOMENTUM_VERY_STRONG_PENALTY_MULTIPLIER: 2.5,  // 2.5x base penalty at very strong
  MOMENTUM_STRONG_PENALTY_MULTIPLIER: 1.5,       // 1.5x base penalty at strong (15-29)
  MOMENTUM_EXTREME_CONFIDENCE_MULTIPLIER: 3.0,   // 3x confidence reduction at extreme
  MOMENTUM_VERY_STRONG_CONFIDENCE_MULTIPLIER: 2.0, // 2x confidence reduction at very strong
  MOMENTUM_EXTREME_POSITION_MULTIPLIER: 0.30,    // Only 30% position at extreme momentum opposition
  MOMENTUM_VERY_STRONG_POSITION_MULTIPLIER: 0.50, // Only 50% position at very strong opposition
  
  // ===== NEUTRAL-BIAS AMPLIFICATION FIX: PARTIAL NEUTRAL CONTRIBUTION =====
  // Instead of discarding neutral trends (contribution = 0), use partial weight based on confidence
  // This preserves directional pressure even when trend labels are conservative
  ENABLE_PARTIAL_NEUTRAL_CONTRIBUTION: true,
  NEUTRAL_CONTRIBUTION_FLOOR: 40,     // Min confidence for neutral to contribute
  NEUTRAL_CONTRIBUTION_CEILING: 60,   // Max confidence for partial scaling
  NEUTRAL_PARTIAL_MAX_WEIGHT: 0.60,   // Maximum weight a neutral trend can contribute
  
  // ===== TIER-BASED DIRECTION THRESHOLDS =====
  // Use confidence scores instead of string labels for tier eligibility
  TIER_DIRECTIONAL_THRESHOLD: 50,     // Confidence >= 50 = directional (regardless of label)
  
  // ===== STOCHRSI EXTREME AS DIRECTION BIAS =====
  // Add StochRSI extremes as bias input to weighted sum
  ENABLE_STOCHRSI_BIAS: true,
  STOCHRSI_OVERBOUGHT_K: 90,          // K >= 90 adds bearish bias
  STOCHRSI_OVERSOLD_K: 10,            // K <= 10 adds bullish bias
  STOCHRSI_BIAS_WEIGHT: 0.10,         // ±0.10 bias adjustment to weighted sum
} as const;

// ============= BIAS RESOLUTION TIER (TIER 9.5) PARAMETERS =============
// Pre-terminal tier that resolves direction when all tiers fail but micro-evidence exists
// Prevents NO_CLEAR_DIRECTION during impulse phases
export const BIAS_RESOLUTION_TIER = {
  ENABLED: true,
  
  // ===== EVIDENCE REQUIREMENTS =====
  // Require at least 2 evidence sources to assign direction
  MIN_EVIDENCE_SCORE: 2,
  
  // ===== MICRO-DIRECTION EVIDENCE =====
  // Consecutive bars in same direction
  MICRO_DIRECTION_MIN_BARS: 8,        // 8+ consecutive bars = +2 score
  MICRO_DIRECTION_SCORE: 2,
  
  // ===== STOCHRSI EXTREME EVIDENCE =====
  STOCHRSI_EXTREME_K_HIGH: 90,        // K >= 90 = bearish bias
  STOCHRSI_EXTREME_K_LOW: 10,         // K <= 10 = bullish bias
  STOCHRSI_EXTREME_SCORE: 1,
  
  // ===== ABSOLUTE STOCHRSI EXTREME (K >= 98 or K <= 2) =====
  // Counts as 2 evidence points instead of 1 when ADX is not in strong trend
  // This allows single-evidence resolution during impulse extremes
  STOCHRSI_ABSOLUTE_EXTREME_K_HIGH: 98,   // K >= 98 = absolute overbought
  STOCHRSI_ABSOLUTE_EXTREME_K_LOW: 2,     // K <= 2 = absolute oversold
  STOCHRSI_ABSOLUTE_EXTREME_SCORE: 2,     // Counts as 2 evidence points
  STOCHRSI_ABSOLUTE_EXTREME_MAX_ADX: 30,  // Only boost if ADX < this (not strong trend)
  
  // ===== ORDER FLOW EVIDENCE =====
  ORDER_FLOW_MIN_SCORE: 60,           // Order flow score >= 60 = valid evidence
  ORDER_FLOW_EVIDENCE_SCORE: 1,
  
  // ===== POSITION SIZING =====
  // Minimal position for bias-resolution signals (WEAK_LONG/WEAK_SHORT)
  POSITION_SIZE: 0.25,
  
  // ===== CONFIDENCE =====
  CONFIDENCE: 50,
  
  // ===== LOGGING =====
  LOG_TIER_EVALUATION: true,
} as const;

// ============= NET SIGNAL THRESHOLDS =============
// Controls trend classification sensitivity in trend-core.ts
export const NET_SIGNAL_THRESHOLDS = {
  // Strong trend thresholds (±4.0 = definitive bullish/bearish)
  STRONG_THRESHOLD: 4.0,
  // Weak trend thresholds (±3.0 = weak_bullish/weak_bearish intermediate state)
  // Lowered from ±4.0 to ±3.0 to capture early impulse phases
  WEAK_THRESHOLD: 3.0,
  // Enable weak trend intermediate states
  ENABLE_WEAK_TRENDS: true,
} as const;

// ============= EXHAUSTION ESCAPE PARAMS =============
// Final escape valve before hard rejection when neutral 4H + extreme exhaustion
// Captures mean reversion opportunities that would otherwise be blocked
export const EXHAUSTION_ESCAPE_PARAMS = {
  ENABLED: true,
  
  // ===== REGIME REQUIREMENT =====
  // Only trigger in EXHAUSTION regime (prevents noise in other regimes)
  REQUIRE_EXHAUSTION_REGIME: true,
  
  // ===== MOMENTUM REQUIREMENT =====
  // Minimum momentum score for exhaustion escape
  MIN_MOMENTUM_SCORE: 20,
  
  // ===== STOCHRSI THRESHOLDS =====
  // Oversold for LONG escape
  OVERSOLD_K_THRESHOLD: 20,
  OVERSOLD_PERCENT_B_THRESHOLD: 25,
  // Overbought for SHORT escape
  OVERBOUGHT_K_THRESHOLD: 80,
  OVERBOUGHT_PERCENT_B_THRESHOLD: 75,
  
  // ===== ORDER FLOW ALIGNMENT BONUS =====
  // Order flow alignment boosts confidence
  ORDER_FLOW_ALIGNED_BONUS: 5,
  MIN_ORDER_FLOW_SCORE: 50,
  
  // ===== POSITION SIZING =====
  BASE_POSITION_MULTIPLIER: 0.50,   // 50% base for mean reversion
  STRONG_POSITION_MULTIPLIER: 0.60, // 60% with order flow alignment
  
  // ===== CONFIDENCE =====
  BASE_CONFIDENCE: 50,
  MAX_CONFIDENCE: 60,
  
  // ===== LOGGING =====
  LOG_ESCAPES: true,
} as const;

// ============= MACD GATE PARAMS =============
// Phase 2: Softened MACD gate with duration and magnitude checks
// Converts hard block to score multiplier in most cases
export const MACD_GATE_PARAMS = {
  ENABLED: true,
  
  // ADX override thresholds (lowered from 35)
  ADX_OVERRIDE_WITH_RISING: 25,       // Allow override if ADX >= 25 AND rising
  ADX_OVERRIDE_UNCONDITIONAL: 28,     // Allow override if ADX >= 28 regardless of slope
  
  // MACD opposition duration check (NEW)
  // Only block if MACD has opposed for N+ consecutive bars
  MIN_OPPOSITION_BARS: 3,             // Require 3 bars of opposing MACD
  
  // MACD magnitude check (NEW) - NOW ATR-NORMALIZED RATIOS
  // Values represent |MACD histogram / ATR| thresholds (dimensionless)
  // This ensures consistent behavior across high-priced (BTC: ~$95k) and low-priced assets
  // Example: BTC MACD=36, ATR=585 → normalized=0.0615; threshold 0.002 → significant
  MIN_HISTOGRAM_FOR_BLOCK: 0.002,       // Only block if |histogram/ATR| > this (was 0.0002 absolute)
  NEUTRAL_HISTOGRAM_THRESHOLD: 0.01,    // Below this = treat as neutral (raised from 0.0005; 1% of ATR)
  
  // Position sizing for soft blocks (instead of hard block)
  POSITION_MULTIPLIER_SOFT: 0.75,     // 75% position when not blocking
  POSITION_MULTIPLIER_WEAK: 0.85,     // 85% when misalignment is weak
  
  // Reclassify to score multiplier below this ADX
  SCORE_MULTIPLIER_BELOW_ADX: 25,     // Below ADX 25, use score multiplier not block
} as const;

// ============= ADX EXHAUSTION REFINED PARAMS =============
// Phase 3: More nuanced exhaustion detection with time context
// Prevents blocking strong trends incorrectly
export const ADX_EXHAUSTION_REFINED_PARAMS = {
  // Minimum ADX decline for rollover (NEW)
  // ADX must decline by at least this many points from peak
  MIN_ADX_DECLINE_FOR_ROLLOVER: 3,    // 3 point minimum decline
  
  // Current ADX must also be below this
  MAX_ADX_FOR_EXHAUSTION: 40,         // Only exhaustion if ADX < 40
  
  // Time-in-trend context (NEW from expert review)
  // Short trends rolling over != exhaustion
  MIN_TREND_AGE_BARS: 40,             // Minimum 40 bars (40 1h candles) for exhaustion
  MIN_TREND_AGE_FOR_EXHAUSTION: 40,   // Alias for clarity in smart-momentum.ts
  
  // ===== SCORING (Reduced weights for score multiplier approach) =====
  SCORE_ADX_ROLLOVER: 35,             // Was 60, now 35 (allows with reduced position)
  SCORE_HIDDEN_WEAKNESS: 12,          // Reduced from 15
  SCORE_DI_COMPRESSION: 20,           // Reduced from 25
  SCORE_MOMENTUM_DIVERGENCE: 20,      // Reduced from 25
  SCORE_PRICE_ACTION_CONFIRM: 15,     // NEW: Bonus when reversal candle confirms
  SCORE_SLOPE_NEGATIVE: 10,           // Reduced from 15
  
  // ===== EXHAUSTION THRESHOLDS =====
  EXHAUSTION_THRESHOLD: 70,           // Was 50, now 70 (requires multiple signals)
  SOFT_EXHAUSTION_THRESHOLD: 35,      // Score 35-49: use POSITION_MULTIPLIER_SOFT
  HARD_EXHAUSTION_THRESHOLD: 50,      // Score 50-69: use POSITION_MULTIPLIER_HARD
  
  // ===== POSITION SIZING (Score-based instead of hard block) =====
  POSITION_MULTIPLIER_35_49: 0.80,    // Score 35-49: 80% position
  POSITION_MULTIPLIER_50_69: 0.65,    // Score 50-69: 65% position
  POSITION_MULTIPLIER_SOFT: 0.80,     // Alias: Score 35-49
  POSITION_MULTIPLIER_HARD: 0.65,     // Alias: Score 50-69
  // Score >= 70: BLOCK (multiple signals confirm exhaustion)
} as const;

// ============= STOCHRSI DYNAMIC PARAMS =============
// Phase 4: Dynamic thresholds and capped penalty contribution
// Prevents StochRSI from alone blocking strong momentum moves
export const STOCHRSI_DYNAMIC_PARAMS = {
  // Dynamic extreme thresholds based on ADX
  // Stronger trends allow more room at extremes
  EXTREME_THRESHOLDS: {
    ADX_LOW: { adxMax: 20, oversold: 10, overbought: 90 },      // Standard
    ADX_MODERATE: { adxMax: 30, oversold: 8, overbought: 92 },  // Tighter
    ADX_HIGH: { adxMax: 100, oversold: 5, overbought: 95 },     // Tightest
  },
  
  // Time-in-extreme penalty adjustments
  // Raised thresholds to allow more room for trend continuation
  BARS_FOR_PENALTY_BY_ADX: {
    ADX_BELOW_25: 5,    // Standard: 5 bars before penalty
    ADX_25_35: 7,       // Moderate trend: 7 bars before penalty
    ADX_ABOVE_35: 10,   // Strong trend: 10 bars before penalty
  },
  
  // Penalty score adjustments (reduced from original)
  PENALTY_MODERATE: 12,   // Was 15
  PENALTY_HIGH: 18,       // Was 25
  PENALTY_EXTREME: 25,    // Was 35
  
  // CAP: Maximum StochRSI contribution to reversal score (NEW)
  // StochRSI alone can NEVER push exhaustion over block threshold
  MAX_STOCHRSI_PENALTY: 20,  // Capped at 20 points (default)
  
  // FIX #2 (Audit): Stricter cap when Tier 2 was already bypassed
  // Prevents "double punishment" where StochRSI penalizes both at gate AND in reversal score
  TIER2_BYPASSED_STOCHRSI_CAP: 10,  // Reduced cap when Tier 2 bypass was applied
} as const;

// ============= PRE-SIGNAL VALIDITY GATE PARAMS =============
// Phase 1: Semantic consistency checks for signal types
// Blocks signals that don't meet fundamental requirements for their type
export const SIGNAL_TYPE_VALIDITY_PARAMS = {
  // Enable the pre-signal validity gate
  ENABLED: true,
  
  // ===== MOMENTUM BREAKOUT REQUIREMENTS =====
  // Momentum Breakout signals MUST satisfy ALL of:
  MOMENTUM_BREAKOUT: {
    MIN_ADX: 25,              // Trend must be confirmed (ADX >= 25)
    REQUIRE_ADX_NOT_FALLING: true,  // ADX slope must be >= 0
    REQUIRE_POSITIVE_MOMENTUM: true, // Momentum score must be > 0
    REQUIRE_MACD_ALIGNED: true,      // MACD slope must align with direction
    BLOCK_IF_RANGING: true,          // Block if regime is RANGING (unless squeeze)
  },
  
  // ===== MEAN REVERSION REQUIREMENTS =====
  // Mean Reversion signals should only trigger at extremes, NOT during strong trends
  MEAN_REVERSION: {
    MAX_ADX: 35,                        // Block if ADX > 35 (trend too strong for reversal)
    BLOCK_IF_ADX_EXPANDING: true,       // Block if ADX slope is positive and high
    ADX_EXPANSION_THRESHOLD: 1.5,       // ADX slope threshold for "expanding"
    REQUIRE_EXTREME_READING: true,      // Require RSI/StochRSI at extremes
    RSI_OVERSOLD: 35,                   // RSI threshold for oversold (long signals)
    RSI_OVERBOUGHT: 65,                 // RSI threshold for overbought (short signals)
    STOCH_OVERSOLD: 25,                 // StochRSI threshold for oversold
    STOCH_OVERBOUGHT: 75,               // StochRSI threshold for overbought
    BLOCK_IF_MOMENTUM_CONFIRMS_TREND: true,  // Block if momentum strongly supports opposite
    MOMENTUM_TREND_THRESHOLD: 15,       // Block if momentum > 15 (or < -15) confirms trend
  },
  
  // ===== TREND FOLLOWING REQUIREMENTS =====
  // Trend Following signals need a confirmed trend, NOT ranging markets
  TREND_FOLLOWING: {
    MIN_ADX: 20,                        // Require ADX >= 20 (trend must exist)
    REQUIRE_MOMENTUM_ALIGNED: true,     // Momentum must match signal direction
    MIN_ALIGNED_MOMENTUM: 5,            // Minimum momentum score in signal direction
    BLOCK_IF_EXHAUSTED: true,           // Block at trend exhaustion
    EXHAUSTION_ADX: 50,                 // ADX level considered potentially exhausted
    EXHAUSTION_SLOPE: -0.5,             // Negative slope threshold for exhaustion
    BLOCK_IF_RANGING: true,             // Block in RANGING regime
  },
  
  // ===== HARD CONTRADICTION BLOCKS =====
  // These block signals regardless of quality score
  HARD_CONTRADICTIONS: {
    // Block if momentum score strongly contradicts direction
    // e.g., momentum score -15 for a LONG signal
    MOMENTUM_CONTRADICTION_THRESHOLD: -10,  // Block long if momentum < -10
    MOMENTUM_CONTRADICTION_ENABLED: true,
    
    // Block if MACD slope opposes direction at low ADX
    // Strong trends (ADX >= 30) can tolerate MACD divergence
    MACD_CONTRADICTION_MIN_ADX: 30,
    MACD_CONTRADICTION_MIN_SLOPE: 0.1,  // MACD slope must oppose by at least this
    MACD_CONTRADICTION_ENABLED: true,
  },
  
  // ===== VOLUME MINIMUM REQUIREMENTS =====
  VOLUME_MIN_THRESHOLD: 5,  // Volume score must be >= 5/10
  VOLUME_PENALTY_PER_POINT: 3,  // -3 quality per point below threshold
  
  // ===== SQUEEZE STATE HANDLING =====
  // Delay breakout classification during squeeze with low ADX
  SQUEEZE_RECLASSIFICATION: {
    ENABLED: true,
    MAX_ADX_FOR_RECLASSIFICATION: 25,  // Reclassify if ADX < 25 during squeeze
    RECLASSIFY_TO: 'WATCHLIST',        // Mark as watchlist instead of generating signal
    BLOCK_BREAKOUT_STRATEGIES: true,   // Block breakout strategies during low-ADX squeeze
  },
} as const;

// ============= PRICE ACTION EARLY ENTRY OVERRIDE =============
// PHASE 2: When ADX is below threshold BUT price action shows clear direction,
// allow early entry with conservative sizing. This catches moves before lagging indicators confirm.
// CRITICAL: This addresses the "confirmation trap" where ADX lags behind breakout initiation
export const PRICE_ACTION_EARLY_ENTRY_PARAMS = {
  ENABLED: true,
  
  // Minimum price move in last 6 hours to trigger override
  MIN_PRICE_MOVE_PERCENT: 0.8,
  
  // ADX range where this applies (below normal threshold but not dead)
  MIN_ADX: 12,
  MAX_ADX: 18,  // Above this, normal gates apply
  
  // REFINEMENT (per technical review): Require ADX slope >= 0 (momentum building, not decaying)
  // Changed from false/-0.2 to true/0.0 to avoid fake spikes during low-energy ranges
  REQUIRE_ADX_RISING: true,
  MIN_ADX_SLOPE: 0.0,  // Slope must be non-negative (momentum building)
  
  // Require price direction to match derived direction
  REQUIRE_DIRECTION_MATCH: true,
  
  // StochRSI limits - don't enter at extremes even with price action
  MAX_STOCHRSI_FOR_LONG: 85,  // Still some room before extreme
  MIN_STOCHRSI_FOR_SHORT: 15,
  
  // Position sizing for early entries (conservative)
  POSITION_SIZE_MULTIPLIER: 0.50,  // 50% position
  
  // Tighter risk management for early entries
  STOP_LOSS_MULTIPLIER: 0.7,       // 70% of normal ATR stop
  TAKE_PROFIT_MULTIPLIER: 1.2,     // Tighter TP target
  BREAK_EVEN_ACTIVATION_PERCENT: 0.3,  // Move to BE at 0.3%
} as const;

// ============= ADX RISING DIRECTIONAL BYPASS FOR HTF EXTREME =============
// PHASE 4: When ADX is rising strongly AND 1h trend matches direction,
// allow bypass of HTF extreme gates even without other conditions.
// This prevents blocking valid longs during trending markets.
export const ADX_RISING_DIRECTIONAL_BYPASS_PARAMS = {
  ENABLED: true,
  
  // ADX requirements
  MIN_ADX: 15,                    // Minimum ADX for bypass
  MIN_ADX_SLOPE: 0.5,             // ADX must be rising strongly (slope >= 0.5)
  
  // Reversal check
  MAX_REVERSAL_SCORE: 45,         // No significant reversal signals
  
  // REFINEMENT (per technical review): Require directional confirmation
  // 1h trend direction must match derived direction
  REQUIRE_DIRECTIONAL_CONFIRMATION: true,
  
  // Position sizing for bypass
  POSITION_SIZE_MULTIPLIER: 0.60,  // 60% position for this bypass path
} as const;

// ============= PHASE 0: MASTER MARKET REGIME CLASSIFIER =============
// Critical foundation: ADX defines regime, all other gates change meaning based on regime
// This formalizes the insight that "indicators are treated as peers instead of regime-dependent authorities"
export const MARKET_REGIME_CLASSIFIER = {
  // Regime definitions with ADX thresholds
  NORMAL: { minADX: 15, maxADX: 30 },
  STRONG_TREND: { minADX: 30, maxADX: 45 },
  PARABOLIC: { minADX: 45, maxADX: 100 },
  STEALTH_DRIFT: { maxADX: 28, minDriftPercent: 1.5 },  // Low ADX but consistent drift
  
  // Gate behavior by regime - when in STRONG_TREND or PARABOLIC, gates downgrade to "context"
  GATE_OVERRIDES: {
    PARABOLIC: {
      bollingerMaxPercentB: 115,         // Allow 115% B (price 15% above upper band)
      bollingerMinPercentB: -15,         // Allow -15% B for shorts
      stochRsiMaxK: 98,                  // Nearly no StochRSI limit
      stochRsiMinK: 2,
      momentumScoreMinimum: 0,           // Momentum score cannot block
      qualityBoost: 10,                  // +10 to quality score
      positionMultiplier: 0.45,          // 45% position for safety
    },
    STRONG_TREND: {
      bollingerMaxPercentB: 105,         // Allow 105% B
      bollingerMinPercentB: -5,
      stochRsiMaxK: 95,
      stochRsiMinK: 5,
      momentumScoreMinimum: 0,           // Momentum score cannot block at strong trend
      qualityBoost: 5,                   // +5 to quality score
      positionMultiplier: 0.55,          // 55% position
    },
    NORMAL: {
      bollingerMaxPercentB: 90,
      bollingerMinPercentB: 10,
      stochRsiMaxK: 85,
      stochRsiMinK: 15,
      momentumScoreMinimum: 5,           // Standard momentum requirement
      qualityBoost: 0,
      positionMultiplier: 1.0,
    },
    STEALTH_DRIFT: {
      bollingerMaxPercentB: 85,
      bollingerMinPercentB: 15,
      stochRsiMaxK: 80,
      stochRsiMinK: 20,
      momentumScoreMinimum: 3,
      qualityBoost: 3,
      positionMultiplier: 0.50,
    }
  },
  
  // Additional requirements per regime
  REQUIRE_HTF_ALIGNMENT_BY_REGIME: {
    PARABOLIC: false,        // In parabolic, ADX IS the confirmation
    STRONG_TREND: true,      // Need 4h aligned
    NORMAL: true,            // Need 4h aligned
    STEALTH_DRIFT: true,     // Need 1h aligned
  }
} as const;

// Market regime type
export type MasterMarketRegime = 'PARABOLIC' | 'STRONG_TREND' | 'NORMAL' | 'STEALTH_DRIFT';

// ============= 4-STATE REGIME CLASSIFIER =============
// Purpose: Eliminate noise trades by classifying market into 4 distinct states
// Based on forensic audit: 100% of recent losses came from neutral/ranging entries
// 
// States:
//   TREND_EXPANSION   → Full continuation trades allowed (1.0x sizing)
//   TREND_EXHAUSTION   → Block continuation, allow MR probes only (0.25x sizing)
//   RANGE_COMPRESSION  → HARD BLOCK - no trades (noise dominates)
//   BREAKOUT_SETUP     → Allow only on directional confirmation (0.50x sizing)
export type FourStateRegime = 'TREND_EXPANSION' | 'TREND_EXHAUSTION' | 'RANGE_COMPRESSION' | 'BREAKOUT_SETUP';

export const FOUR_STATE_REGIME = {
  ENABLED: true,
  
  // ===== TREND EXPANSION =====
  // Strong directional move with aligned structure - best entries
  TREND_EXPANSION: {
    // ADX must show trend energy
    MIN_ADX: 30,
    // ADX slope must be non-negative for full expansion (not decaying)
    MIN_ADX_SLOPE: 0,
    // Buffer zone: slopes between -0.5 and 0 are noise, still EXPANSION at reduced sizing
    BUFFER_SLOPE_THRESHOLD: -0.5,
    BUFFER_POSITION_MULTIPLIER: 0.85,
    // At least one LTF must align with direction
    REQUIRE_LTF_ALIGNMENT: true,
    // Position multiplier (full conviction)
    POSITION_MULTIPLIER: 1.0,
    // Allowed entry types
    ALLOWED_ENTRIES: ['continuation', 'pullback', 'breakout'] as string[],
  },
  
  // ===== TREND EXHAUSTION (GRADUATED) =====
  // Replaces binary slope<0 cliff with graduated tiers
  // Consistent with ADX_SLOPE_GRADUATED and MOVE_EXHAUSTION graduated architectures
  TREND_EXHAUSTION: {
    // ADX still elevated but slope is declining
    MIN_ADX: 30,
    
    // === GRADUATED SLOPE TIERS ===
    // TIER: CONDITIONAL (slope -1.5 to -0.5)
    // Secondary signals must confirm exhaustion before classifying
    CONDITIONAL_SLOPE_THRESHOLD: -0.5,   // Enters conditional zone
    CONDITIONAL_EXHAUSTION_SLOPE: -1.5,  // Below this = confirmed exhaustion
    CONDITIONAL_POSITION_MULTIPLIER_CONFIRMED: 0.50,  // If secondary signals confirm
    CONDITIONAL_POSITION_MULTIPLIER_DENIED: 0.70,     // If secondary signals deny exhaustion
    // Minimum secondary signals needed to confirm exhaustion in conditional zone
    CONDITIONAL_MIN_SECONDARY_SIGNALS: 1,
    
    // TIER: CONFIRMED EXHAUSTION (slope < -1.5)
    // Hard reduction — confirmed energy drain
    CONFIRMED_POSITION_MULTIPLIER: 0.25,
    
    // === SECONDARY EXHAUSTION SIGNALS ===
    // OR: Momentum state exhausted
    EXHAUSTION_MOMENTUM_STATES: ['exhausted'] as string[],
    // OR: StochRSI at extreme for sustained period
    STOCHRSI_EXHAUSTION_K_LONG: 90,   // K > 90 for longs = exhausted
    STOCHRSI_EXHAUSTION_K_SHORT: 10,  // K < 10 for shorts = exhausted
    
    // Legacy fallback multiplier (used when secondary signals force exhaustion regardless of slope)
    POSITION_MULTIPLIER: 0.25,
    // Only mean reversion / counter-trend allowed in confirmed exhaustion
    ALLOWED_ENTRIES: ['mean_reversion', 'counter_trend'] as string[],
    // Block continuation trades in confirmed exhaustion
    BLOCK_CONTINUATION: true,
  },
  
  // ===== RANGE COMPRESSION =====
  // No directional edge - HARD BLOCK all entries
  RANGE_COMPRESSION: {
    // ADX below this = no trend energy
    MAX_ADX: 25,
    // Primary trend must be neutral/ranging
    REQUIRE_NEUTRAL_TREND: true,
    // Momentum must lack conviction
    NO_EDGE_MOMENTUM_STATES: ['mixed', 'none'] as string[],
    // Maximum absolute momentum score (below this = noise)
    MAX_ABS_MOMENTUM_SCORE: 20,
    // ATR compression detection
    LOW_ATR_MULTIPLIER: 0.7,  // ATR < 70% of historical = compressed
    // HARD BLOCK - no entries at all (except MR probes with strict conditions)
    ALLOW_MR_BYPASS: true,
    MR_BYPASS_MIN_STOCHRSI_DISTANCE: 15,  // StochRSI K must be < 15 or > 85 for MR
  },
  
  // ===== BREAKOUT SETUP =====
  // ADX rising from compression - potential new trend forming
  BREAKOUT_SETUP: {
    // ADX transitional zone
    MIN_ADX: 18,
    MAX_ADX: 30,
    // ADX slope must be clearly rising (new energy entering)
    MIN_ADX_SLOPE: 0.5,
    // Require directional confirmation from at least 2 timeframes
    MIN_ALIGNED_TIMEFRAMES: 2,
    // OR: Bollinger squeeze breaking out
    ALLOW_SQUEEZE_BREAKOUT: true,
    // Position multiplier (cautious)
    POSITION_MULTIPLIER: 0.50,
    // Require momentum confirmation
    REQUIRE_MOMENTUM_CONFIRMATION: true,
    MIN_MOMENTUM_SCORE: 15,  // |score| must be >= 15 in trade direction
  },
  
  // ===== REGIME PERSISTENCE =====
  // Asymmetric persistence: require N consecutive candles of a new regime before switching
  // This eliminates boundary-condition flip-flopping without delaying explosive moves
  PERSISTENCE: {
    ENABLED: true,
    // Default: require 2 consecutive candles of new regime before switching
    DEFAULT_REQUIRED_CANDLES: 2,
    // Transition-specific overrides (asymmetric persistence)
    TRANSITIONS: {
      // COMPRESSION → EXPANSION: Immediate (explosive breakout from compression)
      RANGE_COMPRESSION_TO_TREND_EXPANSION: 0,  // No delay - compression breakouts are explosive
      // EXPANSION → EXHAUSTION: Fast (1 candle) - don't delay risk reduction
      TREND_EXPANSION_TO_TREND_EXHAUSTION: 1,
      // EXHAUSTION → EXPANSION: Standard (2 candles) - confirm recovery
      TREND_EXHAUSTION_TO_TREND_EXPANSION: 2,
      // BREAKOUT ↔ EXPANSION: Standard (2 candles)
      BREAKOUT_SETUP_TO_TREND_EXPANSION: 2,
      TREND_EXPANSION_TO_BREAKOUT_SETUP: 2,
      // Any → COMPRESSION: Standard (2 candles) - confirm energy truly gone
      TREND_EXPANSION_TO_RANGE_COMPRESSION: 2,
      BREAKOUT_SETUP_TO_RANGE_COMPRESSION: 2,
      TREND_EXHAUSTION_TO_RANGE_COMPRESSION: 2,
      // COMPRESSION → BREAKOUT: Standard (2 candles)
      RANGE_COMPRESSION_TO_BREAKOUT_SETUP: 2,
      // COMPRESSION → EXHAUSTION: Immediate (already in low-energy state)
      RANGE_COMPRESSION_TO_TREND_EXHAUSTION: 0,
    } as Record<string, number>,
    LOG_PERSISTENCE_DECISIONS: true,
  },
  
  // ===== TRANSITION BUFFER SCORING =====
  // Continuous regime confidence score (0-100) to replace binary thresholds
  // Reduces whipsaw losses during regime transitions
  TRANSITION_BUFFER: {
    ENABLED: true,
    // Weighted components for regime confidence calculation
    WEIGHTS: {
      ADX_NORMALIZED: 0.30,       // ADX contribution (normalized 0-1 from ADX value)
      ADX_SLOPE: 0.25,            // ADX slope (positive = expansion energy)
      ATR_EXPANSION_RATE: 0.20,   // ATR expansion rate (change over recent candles)
      DI_SEPARATION: 0.15,        // DI+/DI- gap (directional conviction)
      MOMENTUM_ALIGNMENT: 0.10,   // Momentum aligned with direction
    },
    // ADX normalization range
    ADX_NORM_MIN: 15,   // ADX below this = 0 contribution
    ADX_NORM_MAX: 45,   // ADX above this = max contribution
    // ADX slope normalization
    ADX_SLOPE_NORM_MIN: -1.0,
    ADX_SLOPE_NORM_MAX: 2.0,
    // DI separation normalization
    DI_SEP_NORM_MIN: 0,
    DI_SEP_NORM_MAX: 30,
    // ATR expansion rate normalization (ratio of current ATR to rolling avg)
    ATR_EXP_NORM_MIN: 0.5,  // Very compressed
    ATR_EXP_NORM_MAX: 1.5,  // Expanding
    // Regime confidence thresholds
    EXPANSION_THRESHOLD: 70,   // >= 70 = TREND_EXPANSION
    TRANSITION_HIGH: 70,       // 55-70 = upper transition (cautious expansion)
    TRANSITION_LOW: 45,        // 45-55 = lower transition (cautious compression)
    COMPRESSION_THRESHOLD: 45, // < 45 = RANGE_COMPRESSION
    // Transition zone sizing (graduated between full and blocked)
    TRANSITION_POSITION_MULTIPLIER_HIGH: 0.70,  // Upper transition: 70% sizing
    TRANSITION_POSITION_MULTIPLIER_LOW: 0.40,   // Lower transition: 40% sizing
    // Log confidence calculations
    LOG_CONFIDENCE_CALC: true,
  },
  
  // ===== REGIME AGE DECAY =====
  // Markets statistically rotate — long-running regimes are more likely to transition
  // Applies graduated fatigue factor to position sizing as regimes age
  REGIME_AGE_DECAY: {
    ENABLED: true,
    // Number of candles at which regime starts to fatigue
    FATIGUE_START_CANDLES: 20,
    // Maximum decay factor (position size multiplier at full fatigue)
    // 0.60 means at max fatigue, sizing reduced to 60% of normal
    MAX_FATIGUE_MULTIPLIER: 0.60,
    // Candle count for full fatigue (linear interpolation from 1.0 to MAX_FATIGUE_MULTIPLIER)
    FULL_FATIGUE_CANDLES: 60,
    // Regimes affected by age decay (expansion and exhaustion benefit most)
    AFFECTED_REGIMES: ['TREND_EXPANSION', 'TREND_EXHAUSTION'] as string[],
    // Compression doesn't decay — it's already a blocked state
    // Breakout doesn't decay — it's transitional by nature
    LOG_AGE_DECAY: true,
  },
  
  // ===== LOGGING =====
  LOG_REGIME_CLASSIFICATION: true,
  LOG_BLOCK_DETAILS: true,
} as const;

// ============= COMPRESSION MICRO-RANGE MODULE =============
// Independent second engine for RANGE_COMPRESSION regimes
// Executes small mean-reversion scalps during low-volatility compression
// Mutual exclusivity: only active when fourStateRegime === RANGE_COMPRESSION
// Kill switches ensure immediate shutdown on expansion signals
export const COMPRESSION_MODULE = {
  ENABLED: true,
  
  // ===== STRUCTURAL CONDITIONS =====
  // ATR threshold uses dynamicMinATR (not fixed) — activates exactly where trend is blocked
  MAX_ADX: 25,
  
  // BB width stability: must be contracting for N candles (prevents false compression)
  BB_WIDTH_CONTRACTING_CANDLES: 2,
  
  // ===== DIRECTION FROM EXTREMES =====
  // Direction derived from StochRSI + BB position, NOT trend alignment
  LONG_MAX_STOCHRSI_K: 15,
  SHORT_MIN_STOCHRSI_K: 85,
  LONG_MAX_PERCENT_B: 15,
  SHORT_MIN_PERCENT_B: 85,
  
  // ===== MOMENTUM: DIRECTIONAL CHECK (not absolute value) =====
  // LONG: momentumScore > -20 (not strongly bearish)
  // SHORT: momentumScore < +20 (not strongly bullish)
  LONG_MIN_MOMENTUM_SCORE: -20,
  SHORT_MAX_MOMENTUM_SCORE: 20,
  
  // ===== EARLY EXPANSION GUARD =====
  // ADX 23-25 with rising slope = early expansion zone, block new compression entries
  EARLY_EXPANSION_ADX: 23,
  
  // ===== SCORING WEIGHTS (±40 range, threshold ≥ 25) =====
  SCORE_STOCHRSI_EXTREME: 15,  // K < 10 or K > 90: ±15
  SCORE_BB_TOUCH: 10,          // %B ≤ 10 or ≥ 90: ±10
  SCORE_MOMENTUM_ALIGNED: 10,  // Momentum in entry direction: ±10
  SCORE_MOMENTUM_NEUTRAL: 5,   // Momentum neutral (not aligned, not opposing): ±5
  // Momentum mildly opposing but within tolerance: +0 (no contribution)
  SCORE_LOW_ADX_BONUS: 5,      // ADX < 20: +5
  ENTRY_THRESHOLD: 25,         // |score| must be ≥ 25
  
  // ===== RISK (35% of trend base, not 50%) =====
  // Lower R multiple + higher frequency justify smaller initial sizing
  POSITION_SIZE_MULTIPLIER: 0.35,
  TP_ATR_MULTIPLIER: 0.5,   // Tight TP for range
  SL_ATR_MULTIPLIER: 0.4,   // Tight SL for range
  
  // ===== TIME EXIT =====
  MAX_HOLD_CANDLES: 8,  // 8 × 15m = 2 hours max hold
  MAX_HOLD_MINUTES: 120, // 2 hours
  
  // ===== KILL SWITCHES =====
  KILL_ADX_THRESHOLD: 28,  // ADX > 28 = immediate kill
  KILL_CANDLE_RANGE_ATR_RATIO: 0.9, // Large candle = regime shift brewing
  
  // ===== COOLDOWN =====
  COOLDOWN_MINUTES: 30,
  REQUIRE_OPPOSITE_BAND_TOUCH: true, // No re-entry at same band edge
  
  // ===== CONCURRENCY =====
  MAX_CONCURRENT_PER_SYMBOL: 1,
  
  // ===== SIGNAL CONFIGURATION =====
  STRATEGY_NAME: 'Compression Scalp' as const,
  REGIME_TAG: 'RANGE_COMPRESSION_SCALP' as const,
  SIGNAL_EXPIRY_MINUTES: 30, // Shorter than trend signals (30 min vs 2 hours)
  
  // ===== LOGGING =====
  LOG_COMPRESSION_CHECKS: true,
} as const;

// ============= PHASE 1: STRONG ADX UNIVERSAL OVERRIDE =============
// When ADX confirms regime, gates downgrade from "hard block" to "context adjustment"
// Key insight: "Bollinger should downgrade from 'gate' to 'context'"
export const STRONG_ADX_UNIVERSAL_OVERRIDE_PARAMS = {
  ENABLED: true,
  
  // Tier 1: Strong trend override (ADX 40+)
  TIER1_MIN_ADX: 40,
  TIER1_REQUIRE_SLOPE_POSITIVE: true,
  TIER1_MIN_SLOPE: 0,              // Slope must be non-negative
  TIER1_BOLLINGER_BECOMES_CONTEXT: true,
  TIER1_STOCHRSI_BECOMES_CONTEXT: true,
  TIER1_MOMENTUM_BECOMES_CONTEXT: true,
  TIER1_POSITION_SIZE: 0.55,       // 55% of normal position
  
  // Tier 2: Parabolic override (ADX 50+)
  TIER2_MIN_ADX: 50,
  TIER2_SLOPE_TOLERANCE: -0.5,     // Allow slight decline (trend cruising)
  TIER2_ALL_GATES_CONTEXT: true,   // All gates become context, not blockers
  TIER2_POSITION_SIZE: 0.40,       // 40% position (late entry, higher risk)
  TIER2_TIGHTER_STOP: 1.2,         // 1.2x ATR instead of 2x
  
  // Safety: Still respect behavioral exhaustion
  RESPECT_BEHAVIORAL_EXHAUSTION: true,
  MAX_REVERSAL_SCORE: 50,
} as const;

// ============= PHASE 2: MOMENTUM SCORE BEHAVIOR CHANGE =============
// At high ADX, momentum score cannot BLOCK - it can only adjust position size and stops
// Key insight: "At ADX ≥ 40: Momentum score cannot block. It can only reduce position size or increase stop tightness."
export const MOMENTUM_SCORE_BEHAVIOR_PARAMS = {
  ENABLED: true,
  
  // ADX threshold above which momentum score cannot block signals
  CANNOT_BLOCK_ABOVE_ADX: 40,
  
  // Instead of blocking, low momentum score adjusts these:
  LOW_SCORE_POSITION_REDUCTION: 0.30,    // 30% smaller position
  LOW_SCORE_STOP_TIGHTENING: 0.75,       // 25% tighter stop (0.75 multiplier)
  
  // Momentum divergence detection (replacing binary "confirms")
  // "Is momentum diverging or confirming?" replaces binary check
  DIVERGING_POSITION_PENALTY: 0.40,      // 40% reduction if diverging
  CONFIRMING_POSITION_BONUS: 0.10,       // 10% bonus if confirming
  
  // Graduated ADX-based momentum thresholds
  // Replaces flat MIN_MOMENTUM_SCORE with ADX-aware thresholds
  ADX_40_MIN_SCORE: 0,    // At ADX ≥ 40, no minimum momentum score
  ADX_35_MIN_SCORE: 2,    // At ADX ≥ 35, minimum 2
  ADX_30_MIN_SCORE: 3,    // At ADX ≥ 30, minimum 3
  ADX_25_MIN_SCORE: 4,    // At ADX ≥ 25, minimum 4
  DEFAULT_MIN_SCORE: 5,   // Below ADX 25, standard threshold
  
  // Require price action confirmation when bypassing momentum
  REQUIRE_PRICE_ACTION_CONFIRMATION: true,
} as const;

// ============= PHASE 3: TREND CONTINUATION RE-ENTRY (ENHANCED) =============
// "Exit logic is 'stateful', Entry logic is 'stateless' - This is one of the most expensive bugs in trend systems"
// This enhancement makes entry logic stateful by remembering recent profitable exits
export const TREND_CONTINUATION_REENTRY_PARAMS = {
  ENABLED: true,
  
  // ===== RECENT PROFITABLE EXIT DETECTION =====
  LOOKBACK_HOURS: 4,              // Extended from 2 to catch more opportunities
  MIN_PROFIT_PERCENT: 1.0,        // Reduced from 2.0 to capture smaller wins
  ALLOW_SAME_CANDLE_REENTRY: true, // Don't wait if trend still valid
  POSITION_SIZE_MULTIPLIER: 0.50, // 50% position for re-entries
  
  // ===== THRESHOLD RELAXATION FOR RE-ENTRY =====
  QUALITY_THRESHOLD_REDUCTION: 15,  // -15 points from normal threshold
  STOCHRSI_RELAXATION: 10,          // Allow +10 higher K for LONG re-entry
  BOLLINGER_RELAXATION: 10,         // Allow +10% higher %B for LONG
  
  // ===== ADX REQUIREMENTS =====
  MIN_ADX: 25,                    // Lowered from 30 to catch more re-entries
  MIN_ADX_SLOPE: -0.5,            // Allow slightly declining (cruising trend)
  
  // ===== DIRECTION AND HTF =====
  REQUIRE_SAME_DIRECTION: true,
  MIN_HTF_4H_CONFIDENCE: 55,      // Lowered from 60
  
  // ===== STOP LOSS =====
  TIGHT_STOP_PERCENT: 1.5,        // Tighter stop for re-entries
} as const;

// ============= PHASE 4: QUALITY SCORE NEAR-MISS BOOST =============
// Boost quality scores that are within range of threshold when ADX is strong
// Key insight: "Cap the boost so quality score cannot exceed 'normal max'"
export const QUALITY_NEAR_MISS_BOOST_PARAMS = {
  ENABLED: true,
  
  // Range within threshold to be considered "near miss"
  NEAR_MISS_RANGE: 5,
  
  // Boosts by ADX level
  ADX_35_BOOST: 3,              // +3 points if ADX ≥ 35
  ADX_40_BOOST: 5,              // +5 points if ADX ≥ 40
  ADX_45_BOOST: 7,              // +7 points if ADX ≥ 45
  
  // HTF alignment boost
  HTF_ALIGNED_BOOST: 2,         // +2 if 4H+1H aligned
  
  // Critical: Cap to prevent artificial inflation
  MAX_BOOSTED_SCORE: 75,        // Never boost above 75 regardless of conditions
} as const;

// ============= PHASE 5: STEALTH TREND ADX + SLOPE LOGGING =============
// "Log ADX slope more aggressively. Flat ADX at 28 ≠ rising ADX at 28."
export const STEALTH_TREND_ENHANCED_PARAMS = {
  // Extended ADX thresholds
  MAX_ADX_FOR_STEALTH: 30,       // Raised from 25 to catch more opportunities
  STRONG_DRIFT_ADX_EXTENSION: 32, // For 2.5%+ drift, allow up to ADX 32
  
  // Slope-aware detection
  REQUIRE_SLOPE_LOG: true,
  FLAT_SLOPE_THRESHOLD: 0.1,     // |slope| < 0.1 = flat
  RISING_SLOPE_BONUS: 5,         // +5 quality for rising ADX
  FALLING_SLOPE_PENALTY: 10,     // -10 quality for falling ADX
} as const;

// ============= PHASE 6: LATE GRIND RELAXATION (CONSOLIDATION PAUSE) =============
// "Many strong trends do not pull back - they pause, compress, resume."
export const LATE_GRIND_ENHANCED_PARAMS = {
  REQUIRE_FAILED_PULLBACK: false,    // Make optional
  MIN_PRIOR_DRIFT_PERCENT: 2.0,      // Reduced from 3%
  
  // Alternative entry condition: consolidation pause
  ALLOW_CONSOLIDATION_PAUSE: true,
  CONSOLIDATION_MIN_CANDLES: 3,      // 3+ small candles in a row
  CONSOLIDATION_MAX_CANDLE_ATR: 0.5, // Each candle < 0.5 ATR
  CONSOLIDATION_POSITION_SIZE: 0.45, // 45% position for pause entries
} as const;

// ============= PHASE 7: IMPULSE CONTINUATION EXCEPTION =============
// New exception type for catching moves mid-impulse
export const IMPULSE_CONTINUATION_PARAMS = {
  ENABLED: true,
  
  // Trigger conditions
  MIN_ADX: 35,
  MIN_PRICE_MOVE_PERCENT: 2.0,
  PRICE_MOVE_LOOKBACK_HOURS: 4,
  REQUIRE_HTF_ALIGNMENT: true,      // 1h+4h must match
  
  // Gate bypasses (becomes context, not gate)
  BOLLINGER_BECOMES_CONTEXT: true,
  STOCHRSI_BECOMES_CONTEXT: true,
  MOMENTUM_SCORE_BECOMES_CONTEXT: true,
  
  // Risk controls
  POSITION_SIZE: 0.45,              // 45% position for late impulse entry
  STOP_MULTIPLIER: 1.5,             // Tighter stop for late entry
  
  // Safety gates
  MAX_REVERSAL_SCORE: 50,
  BLOCK_IF_EXHAUSTED: true,
} as const;

// ============= PHASE 8: COUNTER-TREND PROTECTION GATE (CRITICAL) =============
// PREVENTS: Trading LONG when trend is strongly bearish, or SHORT when strongly bullish
// ROOT CAUSE: These 5 losses were all counter-trend entries blocked by this gate
export const COUNTER_TREND_PROTECTION = {
  ENABLED: true,
  
  // ===== ADX THRESHOLD FOR BLOCK =====
  // Block LONG when ADX > threshold AND trend is bearish (and vice versa)
  ADX_THRESHOLD_FOR_BLOCK: 35,
  
  // ===== MOMENTUM OPPOSITION THRESHOLDS (TIGHTLY BOUNDED) =====
  // Block when momentum is strongly opposite to intended direction
  MOMENTUM: {
    // Block LONG if momentum < -20
    STRONG_OPPOSITE_LONG: -20,
    // Block SHORT if momentum > +20
    STRONG_OPPOSITE_SHORT: 20,
    // "Neutral" momentum zone (neither confirms nor opposes)
    NEUTRAL_MIN: -10,
    NEUTRAL_MAX: 10,
  },
  
  // ===== TREND DIRECTION CONFIDENCE =====
  // Use trend direction confidence, not just label
  USE_DIRECTION_CONFIDENCE: true,
  // If trend confidence < this, fall back to momentum-only logic
  DIRECTION_CONFIDENCE_FALLBACK: 50,
  
  // ===== LOGGING =====
  LOG_BLOCKS: true,
  
  // ===== PHASE 2 FIX: FALLBACK TO TREND-ALIGNED DIRECTION =====
  // DISABLED: This was causing 100% SHORT bias by flipping valid LONG signals into SHORTs
  // ROOT CAUSE OF 30% WIN RATE: Signals were being flipped to SHORT during bullish reversals
  // When counter-trend is blocked, attempt to derive the opposite (trend-aligned) direction
  // This prevents missing SHORT opportunities when LONG is blocked against bearish trend
  FALLBACK_TO_TREND_ALIGNED: false,  // DISABLED - was causing directional bias
  
  // Position multiplier for fallback entries (reduced for safety)
  FALLBACK_POSITION_MULTIPLIER: 0.50,
  
  // Only allow fallback if regime is not RANGING
  REQUIRE_TRENDING_REGIME: true,
  
  // Log fallback entries
  LOG_FALLBACKS: true,
} as const;

// ============= PHASE 9: ADX EXHAUSTION / LATE TREND PROTECTION (NEW) =============
// Expert insight: "ADX > 45 with declining slope often signals trend maturity, not opportunity"
// Prevents entries during late-stage trend exhaustion
export const ADX_EXHAUSTION_LATE_ENTRY_PROTECTION = {
  ENABLED: true,
  
  // ===== MATURE TREND DETECTION =====
  // When ADX >= this AND slope < 0: trend is mature/exhausting
  MIN_ADX_FOR_CHECK: 45,
  DECLINING_SLOPE_THRESHOLD: 0,  // Slope < 0 = declining
  
  // ===== ACTION WHEN MATURE TREND DETECTED =====
  // Option A: Block new entries entirely (conservative)
  BLOCK_NEW_ENTRIES: false,
  
  // Option B: Require pullback confirmation (recommended)
  REQUIRE_PULLBACK_CONFIRMATION: true,
  PULLBACK_MIN_PERCENT: 0.5,  // At least 0.5% pullback from recent high/low
  
  // ===== ALTERNATIVE: REDUCED POSITION + TIGHTER STOP =====
  // If not blocking, apply these risk reductions
  ALTERNATIVE_POSITION_REDUCTION: 0.25,  // 25% of normal position
  TIGHTER_STOP_MULTIPLIER: 0.75,         // 75% of normal stop (tighter)
} as const;

// ============= PHASE 10: STRATEGY-SPECIFIC ADX RESTRICTIONS =============
// Expert insight: "HTF Neutral Breakout strategy must be explicitly disabled when ADX ≥ 35"
// Certain strategies are only valid in specific ADX ranges
export const STRATEGY_ADX_RESTRICTIONS: Record<string, {
  MAX_ADX?: number;
  MIN_ADX?: number;
  REASON: string;
}> = {
  'HTF Neutral Breakout': {
    MAX_ADX: 35,              // Disable when ADX >= 35 (not designed for strong trends)
    MIN_ADX: 15,              // Require some trend (not dead market)
    REASON: 'Strategy designed for HTF neutral conditions, not strong trends'
  },
  'Mean Reversion': {
    MAX_ADX: 40,
    REASON: 'Mean reversion fails in strong trends'
  },
  'Bollinger Band Breakout': {
    MAX_ADX: 50,              // Allow in most conditions
    MIN_ADX: 18,              // Require some volatility
    REASON: 'Breakout needs volatility but not parabolic moves'
  },
  // Trend-following strategies have MIN requirements instead
  'Momentum Breakout': {
    MIN_ADX: 22,
    REASON: 'Requires established momentum'
  },
  'EMA Golden Cross': {
    MIN_ADX: 20,
    REASON: 'EMA crossovers need trend development'
  },
  'EMA Death Cross': {
    MIN_ADX: 20,
    REASON: 'EMA crossovers need trend development'
  },
} as const;

// ============= PHASE 11: MOMENTUM-DIRECTION ALIGNMENT (TIGHTLY BOUNDED) =============
// Expert insight: "Neutral" must be tightly bounded (-10 to +10), not loosely defined
// Ensures momentum score aligns with intended trade direction
// 
// ARCHITECTURE FIX (Phase 1): Aligned ALLOW_NEUTRAL_ABOVE_ADX with ADX_THRESHOLDS.EXCEPTIONAL (35)
// This eliminates the "fuzzy boundary" between 35-40 where different gates had inconsistent behavior
// 
// MOMENTUM STATE INFLUENCE: Thresholds are adjusted by ±5 based on momentum state:
// - "confirmed" state: tighter thresholds (harder to bypass)
// - "mixed" state: looser thresholds (easier to allow)
export const MOMENTUM_DIRECTION_ALIGNMENT = {
  ENABLED: true,
  
  // ===== TIGHTLY BOUNDED "NEUTRAL" ZONE =====
  NEUTRAL_MIN: -10,
  NEUTRAL_MAX: 10,
  
  // ===== STRONG OPPOSITE THRESHOLDS =====
  // Block LONG if momentum < this (adjusted by momentum state)
  STRONG_OPPOSITE_LONG: -20,
  // Block SHORT if momentum > this (adjusted by momentum state)
  STRONG_OPPOSITE_SHORT: 20,
  
  // ===== MOMENTUM STATE INFLUENCE =====
  // "confirmed" momentum = tighten opposite thresholds (make override harder)
  // "mixed" momentum = loosen opposite thresholds (allow more flexibility)
  CONFIRMED_STATE_ADJUSTMENT: -5,  // -20 becomes -25 for LONG, +20 becomes +15 for SHORT
  MIXED_STATE_ADJUSTMENT: 5,       // -20 becomes -15 for LONG, +20 becomes +25 for SHORT
  
  // ===== ADX-AWARE BEHAVIOR =====
  // UNIFIED: Now aligned with ADX_THRESHOLDS.EXCEPTIONAL (35) - no more 35 vs 40 inconsistency
  // In strong ADX (>= 35), allow neutral momentum but never opposite
  // In weaker ADX (< 35), require aligned momentum
  ALLOW_NEUTRAL_ABOVE_ADX: 35,
  
  // ===== PHASE 2 SUBORDINATION =====
  // When Phase 1 determines momentum is in neutral zone, Phase 2 (MACD-based check) is SKIPPED
  // This prevents double-penalizing neutral momentum scenarios
  SKIP_PHASE2_FOR_NEUTRAL: true,
  
  // ===== NORMALIZED WEAK MOMENTUM CHECK =====
  // Phase 2 uses ATR-normalized MACD threshold for bypass eligibility
  // macdHistogramNormalized < WEAK_MACD_ATR_MULTIPLIER = weak momentum (bypass allowed)
  // 
  // CALIBRATION NOTE (2026-02-11):
  // - Typical normalized MACD values in ranging markets: 0.01–0.10
  // - Typical normalized MACD values in trending markets: 0.05–0.30
  // - Previous 0.0005 was 360x below typical ranging values, making bypass nearly inert
  // - 0.05 allows bypass when MACD is ≤5% of ATR (genuine range/early reversal)
  // - Combined with ADX < 25 dual condition for safety (Option B)
  WEAK_MACD_ATR_MULTIPLIER: 0.05,
  // ADX ceiling for weak-MACD bypass (dual condition safety)
  // Only allow weak-MACD bypass in range environments (ADX < 25)
  WEAK_MACD_MAX_ADX: 25,
} as const;

// ============= PHASE 12: STRUCTURED LOGGING FOR BLOCK DECISIONS =============
// Expert insight: Log block_reason_code (enum), primary_gate_failed, and rule IDs
// Enables post-mortem analysis and system iteration
export const BLOCK_DECISION_LOGGING = {
  ENABLED: true,
  
  // Block reason codes (for structured logging)
  REASON_CODES: {
    COUNTER_TREND: 'COUNTER_TREND',
    STRATEGY_ADX_LIMIT: 'STRATEGY_ADX_LIMIT',
    MOMENTUM_DIRECTION_MISMATCH: 'MOMENTUM_DIRECTION_MISMATCH',
    MATURE_TREND_NO_PULLBACK: 'MATURE_TREND_NO_PULLBACK',
    QUALITY_THRESHOLD: 'QUALITY_THRESHOLD',
    BOLLINGER_GATE: 'BOLLINGER_GATE',
    STOCHRSI_GATE: 'STOCHRSI_GATE',
    EXHAUSTION: 'EXHAUSTION',
    DEDUPLICATION: 'DEDUPLICATION',
  } as const,
  
  // Include timeframe labels in logs
  INCLUDE_TIMEFRAME_LABELS: true,
  // ADX timeframe (for clarity)
  ADX_TIMEFRAME: '1h',
  // Regime timeframe (for clarity)
  REGIME_TIMEFRAME: '4h',
  // Signal timeframe (for clarity)
  SIGNAL_TIMEFRAME: '15m',
} as const;

// Type for block reason codes
export type BlockReasonCode = typeof BLOCK_DECISION_LOGGING.REASON_CODES[keyof typeof BLOCK_DECISION_LOGGING.REASON_CODES];

// ============= PHASE 13: STRATEGY-SPECIFIC HTF ALIGNMENT REQUIREMENTS =============
// Expert insight: "EMA Death Cross generated SELL signals during neutral trend"
// Solution: Crossover-based strategies require HTF confirmation in the trade direction
// This prevents trading EMA crossovers when higher timeframes don't support the direction
export const STRATEGY_DIRECTION_REQUIREMENTS: Record<string, {
  side: 'BUY' | 'SELL';
  require1hDirectional?: boolean;
  requireMinADX?: number;
  requireMomentumAligned?: boolean;
  minMomentumScore?: number;  // Positive for BUY, negative for SELL
  allowNeutral4h?: boolean;   // Allow if 1h is directional
  REASON: string;
}> = {
  'EMA Death Cross': {
    side: 'SELL',
    require1hDirectional: true,
    requireMinADX: 22,
    requireMomentumAligned: true,
    minMomentumScore: -10,  // Must be negative for SHORT
    allowNeutral4h: true,   // Allow if 1h is bearish
    REASON: 'EMA Death Cross requires 1h bearish confirmation and negative momentum'
  },
  'EMA Golden Cross': {
    side: 'BUY',
    require1hDirectional: true,
    requireMinADX: 22,
    requireMomentumAligned: true,
    minMomentumScore: 10,   // Must be positive for LONG
    allowNeutral4h: true,   // Allow if 1h is bullish
    REASON: 'EMA Golden Cross requires 1h bullish confirmation and positive momentum'
  },
  'MACD Bearish Cross': {
    side: 'SELL',
    require1hDirectional: true,
    requireMinADX: 20,
    requireMomentumAligned: true,
    minMomentumScore: -5,
    allowNeutral4h: true,
    REASON: 'MACD Bearish Cross requires bearish momentum confirmation'
  },
  'MACD Crossover': {
    side: 'BUY',
    require1hDirectional: true,
    requireMinADX: 20,
    requireMomentumAligned: true,
    minMomentumScore: 5,
    allowNeutral4h: true,
    REASON: 'MACD Crossover requires bullish momentum confirmation'
  },
} as const;

// ============= PHASE 14: RANGING MARKET PROTECTION =============
// Expert insight: System keeps checking for signals in ranging markets, potentially allowing low-quality entries
// Solution: Pause most strategies when all timeframes are neutral for extended periods
export const RANGING_MARKET_PROTECTION = {
  ENABLED: true,
  
  // ===== NEUTRAL STREAK DETECTION =====
  // How many consecutive neutral readings before pausing
  // Each check is ~5 minutes, so 6 = ~30 minutes of all-neutral
  NEUTRAL_STREAK_THRESHOLD: 6,
  
  // Minimum confidence for any timeframe to break ranging mode
  MIN_CONFIDENCE_TO_BREAK_RANGE: 60,
  
  // ===== STRATEGY ALLOWLISTING =====
  // When in ranging mode, ONLY allow these strategies (designed for range trading)
  ALLOWED_STRATEGIES_IN_RANGE: [
    'Mean Reversion',
    'Mean Reversion Scalp',
    'Bollinger Band Breakout',  // Can detect range expansion
    'RSI Oversold/Overbought',  // Mean reversion
    'RSI Overbought Short',     // Mean reversion
  ] as readonly string[],
  
  // ===== POSITION SIZING IN RANGING MARKET =====
  // Reduce position size when in ranging market
  RANGING_POSITION_MULTIPLIER: 0.25,  // 25% of normal position
  
  // ===== QUALITY GATE TIGHTENING =====
  // Require higher quality score when primary trend is neutral AND ADX < 30
  NEUTRAL_TREND_QUALITY_BOOST: 10,  // Add +10 to quality threshold
  NEUTRAL_ADX_THRESHOLD: 30,        // ADX must be below this for the boost
  
  // ===== HARD BLOCK: NO-TRADE RANGE REGIME =====
  // Improvement #1: Hard block when NO directional edge exists
  // Addresses: 7/15 recent losses from fee-eaten micro profits in directionless markets
  // When all of these conditions are true, there is NO statistical edge → hard block
  HARD_BLOCK: {
    ENABLED: true,
    // primary_trend must be neutral
    REQUIRE_NEUTRAL_TREND: true,
    // momentum_state must be in these states (no directional conviction)
    NO_EDGE_MOMENTUM_STATES: ['mixed', 'none'] as string[],
    // ADX below this = no trend energy
    MAX_ADX: 28,
    // Optional: Also check momentum score magnitude (abs < this = no directional edge)
    MAX_ABS_MOMENTUM_SCORE: 15,
    REQUIRE_LOW_MOMENTUM_SCORE: true,
  },
  
  // ===== MINIMUM ATR FILTER (Dynamic) =====
  // Improvement #2: Block when volatility is too compressed for fee-positive expectancy
  // Dynamic threshold: max(ABSOLUTE_FLOOR, ADAPTIVE_MULTIPLIER * 30d_avg_ATR%)
  // Adapts to volatility regime shifts without manual retuning
  MIN_ATR_FILTER: {
    ENABLED: true,
    // Hard block floor — never trade below this (true compression, no edge)
    ABSOLUTE_FLOOR_ATR_PERCENT: 0.70,
    // Graduated soft penalty zones replace the old 1.10% cliff
    // ATR between ABSOLUTE_FLOOR and SOFT_ZONE_LOW → reduced multiplier
    // ATR between SOFT_ZONE_LOW and SOFT_ZONE_HIGH → moderate multiplier
    // ATR >= SOFT_ZONE_HIGH → full sizing (no penalty)
    SOFT_ZONE_LOW: 0.90,
    SOFT_ZONE_LOW_MULTIPLIER: 0.25,   // 0.70% – 0.90%: heavy reduction
    SOFT_ZONE_HIGH: 1.10,
    SOFT_ZONE_HIGH_MULTIPLIER: 0.50,  // 0.90% – 1.10%: moderate reduction
    // Adaptive multiplier applied to 30-bar rolling average ATR%
    ADAPTIVE_MULTIPLIER: 0.8,
    // Legacy fallback if historical ATR is unavailable
    FALLBACK_MIN_ATR_PERCENT: 1.8,
    // Allow mean reversion to bypass (they profit from range-bound conditions)
    ALLOW_MR_BYPASS: true,
  },
  
  // ===== LOGGING =====
  LOG_BLOCKS: true,
} as const;

// ============= PHASE 15: NEUTRAL TREND + LOW ADX QUALITY GATE =============
// Expert insight: Trades allowed with ADX < 35 and neutral trend led to losses
// Solution: Require higher confidence when ADX is low and trend is neutral
export const NEUTRAL_LOW_ADX_QUALITY_GATE = {
  ENABLED: true,
  
  // ===== THRESHOLDS =====
  // Apply extra quality requirement when:
  // 1. Primary trend is neutral
  // 2. ADX is below this threshold
  ADX_THRESHOLD: 30,
  
  // ===== QUALITY BOOST =====
  // Add this many points to the minimum quality threshold
  QUALITY_THRESHOLD_BOOST: 10,  // Minimum quality becomes 70 instead of 60
  
  // ===== LOGGING =====
  LOG_APPLICATION: true,
} as const;

// ============= DISABLED LEGACY STRATEGIES =============
// PHASE 17: Strategy Deprecation
// These legacy built-in strategies use simple indicator checks without:
// - Exhaustion protection (enter at tops/bottoms)
// - HTF alignment requirements
// - Momentum confirmation gates
// - Quality score thresholds
//
// They are DEPRECATED in favor of Adaptive Trend Entry which includes
// all necessary protections and is the PRIMARY signal source.
//
// ============= STRATEGY INVENTORY =============
// DISABLED (legacy, no protections):
//   - MACD Crossover: Zero-line cross, no exhaustion check
//   - MACD Signal Cross: Signal line cross, no exhaustion check (ADDED: was missing)
//   - MACD Bearish Cross: Bearish crossover, no exhaustion check
//   - EMA Golden Cross / Death Cross: Simple MA crossovers
//   - RSI Oversold/Overbought / RSI Overbought Short: Simple RSI thresholds
//   - Momentum Breakout / Aggressive Momentum: Simple momentum without gates
//   - Bollinger Band Breakout / Reversal: BB-based without exhaustion
//   - Grid Trading: Grid-based, no trend alignment
//   - Conservative Swing: Simple RSI < 35, no ADX/HTF validation (ADDED: was missing)
//
// ALLOWED (have proper protections):
//   - Adaptive Trend Entry: Primary strategy, full gate pipeline
//   - Mean Reversion: Extreme StochRSI requirements, VWAP distance check
//   - Ranging Mean Reversion: Regime-aware with ADX gating
//   - HTF Neutral Breakout: Has HTF alignment gates
//   - Strong 1h Trend Follower: Has 1h momentum confirmation
export const DISABLED_LEGACY_STRATEGIES = {
  ENABLED: true,  // Set to false to re-enable legacy strategies
  
  // List of strategy names (case-insensitive) to disable
  // These are the simple indicator-based strategies that lack exhaustion protection
  DISABLED_NAMES: [
    'MACD Crossover',
    'MACD Signal Cross',       // ADDED: Signal line cross (was missing - caused BTCUSDT K=100 entries)
    'MACD Bearish Cross',
    'EMA Golden Cross',
    'EMA Death Cross',
    'RSI Oversold/Overbought',
    'RSI Overbought Short',
    'Momentum Breakout',
    'Bollinger Band Breakout',
    'Bollinger Band Reversal',
    'Grid Trading',
    'Aggressive Momentum',
    'Conservative Swing',      // ADDED: Simple RSI < 35 without StochRSI/ADX/HTF gates
  ] as readonly string[],
  
  // Strategies that remain ACTIVE (have proper protections built-in)
  ALLOWED_STRATEGIES: [
    'Adaptive Trend Entry',
    'Mean Reversion',           // Has extreme oversold/overbought requirements
    'Ranging Mean Reversion',   // Regime-aware with ADX gating
    'HTF Neutral Breakout',     // Has HTF alignment gates
    'Strong 1h Trend Follower', // Has 1h momentum confirmation
  ] as readonly string[],
  
  // Logging
  LOG_DISABLED: true,
} as const;

// ============= ADAPTIVE SIGNAL GENERATION MODE =============
// PHASE 16: Strategy-Independent Signal Generation
// When enabled, signals are generated purely from technical indicators
// without relying on named strategies or templates.
//
// This is a phased migration:
// - DISABLED (0): Use traditional strategy loop (12+ strategies)
// - SHADOW (1): Run adaptive in shadow mode, compare with strategy-based
// - HYBRID (2): Use adaptive for symbols with no strategy match
// - FULL (3): Replace strategy loop entirely with adaptive generation
export const ADAPTIVE_SIGNAL_MODE = {
  // Current mode - FULL: replace strategy loop entirely with adaptive generation
  MODE: 'FULL' as 'DISABLED' | 'SHADOW' | 'HYBRID' | 'FULL',
  
  // ===== SHADOW MODE SETTINGS =====
  // When MODE='SHADOW', log adaptive signals without executing
  // This allows comparing adaptive vs strategy-based signals
  SHADOW_LOG_ENABLED: true,
  SHADOW_COMPARE_DIRECTION: true,  // Compare direction match %
  SHADOW_COMPARE_QUALITY: true,    // Compare quality score deltas
  
  // ===== HYBRID MODE SETTINGS =====
  // When MODE='HYBRID', use adaptive as fallback
  HYBRID_FALLBACK_ONLY: true,       // Only use adaptive if no strategy matches
  HYBRID_MIN_QUALITY: 65,           // Higher quality threshold for adaptive
  HYBRID_POSITION_MULTIPLIER: 0.6,  // Reduced position for adaptive signals
  
  // ===== FULL MODE SETTINGS =====
  // When MODE='FULL', only use adaptive generation
  FULL_MIN_QUALITY: 60,             // Standard quality threshold
  FULL_POSITION_MULTIPLIER: 1.0,    // Full position sizing
  
  // ===== LOGGING =====
  LOG_ADAPTIVE_SIGNALS: true,
  LOG_COMPARISON_RESULTS: true,
} as const;

export type AdaptiveSignalModeType = typeof ADAPTIVE_SIGNAL_MODE.MODE;

// ============= PHASE 10: SAME-DIRECTION RE-ENTRY PROTECTION =============
// Prevents same-direction re-entry after timeout/trailing stop closes
// Expert insight: "When a trade closes due to timeout or trailing stop, the trend often pauses"
// This cooldown prevents entering same direction before trend confirms continuation
export const SAME_DIRECTION_REENTRY_PROTECTION = {
  ENABLED: true,
  
  // Cooldown minutes after these close reasons
  COOLDOWN_MINUTES: 45,
  
  // Close reasons that trigger cooldown (non-loss exits that indicate trend pause)
  TRIGGER_CLOSE_REASONS: [
    'trailing_stop_loss',
    'micro_trend_timeout', 
    'volume_relaxation_timeout',
    'break_even',
  ] as readonly string[],
  
  // Allow opposite direction entries during cooldown
  ALLOW_OPPOSITE_DIRECTION: true,
  
  // Logging
  LOG_BLOCKS: true,
} as const;

// ============= PRICE ACTION PULLBACK PARAMETERS =============
// Expert insight: "A bounce against a strong HTF trend is a pullback, not momentum"
// When price action derives counter-trend direction, check if it's a pullback for HTF-aligned entry
export const PRICE_ACTION_PULLBACK_PARAMS = {
  ENABLED: true,
  
  // Maximum move % to consider a pullback (larger moves = breakout, not pullback)
  MAX_PULLBACK_PERCENT: 2.5,
  
  // Minimum 4h confidence for pullback entry
  MIN_HTF_CONFIDENCE: 65,
  
  // Position size multiplier for pullback entries (reduced for safety)
  POSITION_SIZE_MULTIPLIER: 0.50,
  
  // Confidence reduction for pullback-derived direction (safety)
  CONFIDENCE_MULTIPLIER: 0.85,
  
  // Max confidence for pullback entries
  MAX_CONFIDENCE: 70,
  
  // Logging
  LOG_ENTRIES: true,
} as const;

// ============= PHASE 11: TREND EXHAUSTION DETECTION (ADX SLOPE + TREND STRENGTH) =============
// Expert insight: "ADX > 40 declining with weak trend strength = trend exhaustion"
// This blocks entries when trend is running out of steam
export const TREND_EXHAUSTION_PROTECTION = {
  ENABLED: true,
  
  // Block when ADX slope < 0 AND trend strength < this threshold
  TREND_STRENGTH_THRESHOLD: 40,
  
  // Only check when ADX is above this (trend was meaningful)
  MIN_ADX_FOR_CHECK: 25,
  
  // ADX slope considered "declining"
  ADX_SLOPE_DECLINE_THRESHOLD: 0,
  
  // Optional: reduce position instead of blocking
  REDUCE_POSITION_INSTEAD_OF_BLOCK: false,
  EXHAUSTION_POSITION_MULTIPLIER: 0.25,
  
  // Logging
  LOG_BLOCKS: true,
} as const;

// ============= PHASE 12: REGIME TRANSITION PROTECTION =============
// Expert insight: "When regime weakens, require stronger confirmation"
// Transitions from PARABOLIC → NORMAL or STRONG_TREND → RANGING need higher quality
export const REGIME_TRANSITION_PROTECTION = {
  ENABLED: true,
  
  // Additional quality score required after regime weakening
  QUALITY_BOOST_ON_WEAKENING: 20,
  
  // Time window to consider regime transition (minutes)
  TRANSITION_WINDOW_MINUTES: 30,
  
  // Regime weakening transitions that trigger boost
  WEAKENING_TRANSITIONS: {
    FROM_PARABOLIC: ['STRONG_TREND', 'NORMAL', 'STEALTH_DRIFT', 'RANGE'],
    FROM_STRONG_TREND: ['NORMAL', 'STEALTH_DRIFT', 'RANGE'],
    FROM_NORMAL: ['RANGE'],
  } as const,
  
  // Logging
  LOG_BLOCKS: true,
} as const;

// ============= PHASE 13: MOMENTUM REVERSAL PROTECTION =============
// Expert insight: "Momentum flipping from strongly directional to neutral = reversal risk"
// This blocks same-direction entries when momentum has reversed
export const MOMENTUM_REVERSAL_PROTECTION = {
  ENABLED: true,
  
  // Was strongly directional at > |this value|
  STRONG_MOMENTUM_THRESHOLD: 25,
  
  // Now in neutral zone at |< this value|
  NEUTRAL_ZONE_THRESHOLD: 10,
  
  // Lookback window for checking previous momentum (minutes)
  LOOKBACK_MINUTES: 30,
  
  // Block same-direction entry on momentum reversal
  BLOCK_SAME_DIRECTION: true,
  
  // Allow opposite direction entries (momentum reversal may signal new direction)
  ALLOW_OPPOSITE_DIRECTION: true,
  
  // Logging
  LOG_BLOCKS: true,
} as const;

// ============= SQUEEZE MOMENTUM BYPASS PARAMETERS =============
// NEW: Regime-aware gate system - allows entries during Bollinger squeeze when momentum is confirmed
// In squeeze regimes, neutral trends are EXPECTED - use momentum for direction instead of trend confidence
// This addresses the NEUTRAL_4H_LOW_CONFIDENCE gate blocking valid entries during compression phases
export const SQUEEZE_MOMENTUM_BYPASS_PARAMS = {
  ENABLED: true,
  
  // ===== SQUEEZE DETECTION REQUIREMENTS =====
  // Use existing detectBollingerSqueeze() output
  MIN_SQUEEZE_INTENSITY: 60,           // squeezeIntensity >= 60 (tight squeeze)
  MAX_BB_WIDTH_PERCENTILE: 25,         // bbWidthPercentile <= 25 (bottom 25%)
  
  // ===== MOMENTUM REQUIREMENTS FOR BYPASS =====
  // Much lower ADX threshold during squeeze (ADX naturally low in compression)
  MIN_ADX: 18,                         // Down from 25 - squeeze environments have low ADX
  REQUIRE_MOMENTUM_CONFIRMED: true,    // momentum.state === "confirmed"
  REQUIRE_GENUINE_MOMENTUM: true,      // momentum.genuineMomentum === true
  
  // ===== MACD REQUIREMENTS =====
  REQUIRE_MACD_EXPANDING: true,        // MACD histogram must be expanding
  MIN_MACD_MAGNITUDE: 1.5,             // Reduced from 2.0 to catch early squeeze momentum (ETH had 1.78)
  
  // ===== STOCHRSI LOADING ZONE =====
  // For LONG: StochRSI should be in lower half (not overbought)
  // For SHORT: StochRSI should be in upper half (not oversold)
  LONG_MAX_STOCHRSI_K: 55,             // K <= 55 for long entries during squeeze
  SHORT_MIN_STOCHRSI_K: 45,            // K >= 45 for short entries during squeeze
  
  // ===== ORDER FLOW CONFIRMATION (OPTIONAL BUT STRENGTHENS) =====
  USE_ORDER_FLOW_CONFIRMATION: true,
  MIN_ORDER_FLOW_SCORE: 55,            // Order flow score >= 55
  
  // ===== POSITION SIZING =====
  POSITION_SIZE_MULTIPLIER: 0.60,      // 60% position for squeeze entries (moderate risk)
  
  // ===== MULTI-TIMEFRAME SQUEEZE BONUS =====
  // If order flow confirms, increase position size slightly
  ORDER_FLOW_CONFIRMED_MULTIPLIER: 0.75,  // 75% position if order flow confirms
  
  // ===== LOGGING =====
  LOG_BYPASS_DETAILS: true,
} as const;

// ============= SQUEEZE BREAKOUT SIGNAL PARAMETERS =============
// Defines squeeze breakout as a primary signal type with specific confidence and risk parameters
// Triggered when price crosses Bollinger band during or just after squeeze
export const SQUEEZE_BREAKOUT_SIGNAL_PARAMS = {
  ENABLED: true,
  
  // ===== BREAKOUT DETECTION =====
  // Triggered when price crosses band during or just after squeeze
  DETECT_BREAKOUT_DURING_SQUEEZE: true,
  DETECT_BREAKOUT_POST_SQUEEZE: true,
  POST_SQUEEZE_LOOKBACK_BARS: 3,       // Check last 3 bars for recent squeeze exit
  
  // ===== SIGNAL GENERATION =====
  GENERATE_SIGNAL_ON_BREAKOUT: true,
  SIGNAL_CONFIDENCE_BASE: 65,          // Base confidence for squeeze breakout signals
  SIGNAL_CONFIDENCE_BONUS_PER_TF: 5,   // +5% confidence per additional TF indicator alignment
  
  // ===== CONFIRMATION REQUIREMENTS =====
  REQUIRE_VOLUME_CONFIRMATION: true,
  MIN_VOLUME_RATIO: 1.2,               // 20% above average volume
  REQUIRE_MACD_ALIGNMENT: true,        // MACD must agree with breakout direction
  
  // ===== RISK PARAMETERS =====
  STOP_LOSS_ATR_MULTIPLIER: 1.5,       // Tighter stop for breakouts
  TAKE_PROFIT_ATR_MULTIPLIER: 3.0,     // Higher R:R for breakouts
  
  // ===== POSITION SIZING =====
  POSITION_SIZE_MULTIPLIER: 0.70,      // 70% position for breakout entries
} as const;

// ============= MOVE EXHAUSTION FILTER =============
// Prevents entries when price has already moved significantly from swing points
// Addresses: Late entries into exhausted trends (e.g., shorting after 10% drop)
export const MOVE_EXHAUSTION_FILTER_PARAMS = {
  ENABLED: true,
  
  // ===== BASE THRESHOLDS (Default) =====
  // LONG entries blocked if price already moved this much from 24h low
  LONG_SOFT_THRESHOLD_PERCENT: 3.5,   // Reduce position at 3.5%+ move
  LONG_HARD_THRESHOLD_PERCENT: 5.0,   // Hard block at 5%+ move
  
  // SHORT entries blocked if price already moved this much from 24h high
  SHORT_SOFT_THRESHOLD_PERCENT: 3.5,
  SHORT_HARD_THRESHOLD_PERCENT: 5.0,
  
  // Legacy unified thresholds (for backward compatibility)
  SOFT_THRESHOLD_PERCENT: 3.5,        // Use direction-specific thresholds above
  SOFT_THRESHOLD_POSITION_SIZE: 0.35, // 35% position for late entries
  HARD_THRESHOLD_PERCENT: 5.0,        // Use direction-specific thresholds above
  
  // ===== STRONG TREND THRESHOLD RELAXATION =====
  // In strong trending regimes (high ADX, Bollinger squeeze/breakdown), relax thresholds
  // to avoid systematically rejecting high-conviction continuation moves
  STRONG_TREND_RELAXATION: {
    ENABLED: true,
    
    // ===== CONDITIONS FOR RELAXATION =====
    // Must meet at least one condition to activate relaxed thresholds:
    // 1. ADX >= 28 (confirmed strong trend)
    // 2. Bollinger squeeze active (BB width compressed)
    // 3. Bollinger breakdown (price beyond bands - %B <= 15 or >= 85)
    MIN_ADX_FOR_RELAXATION: 28,
    BB_SQUEEZE_RELAXATION: true,        // Relax if BB squeeze active
    BB_BREAKDOWN_RELAXATION: true,      // Relax if price at/beyond bands
    BB_BREAKDOWN_PERCENT_B_SHORT: 15,   // %B <= 15 = short breakdown
    BB_BREAKDOWN_PERCENT_B_LONG: 85,    // %B >= 85 = long breakdown
    
    // ===== RELAXED THRESHOLDS =====
    // Soft zone: 3.5% → 5.0%
    // Hard zone: 5.0% → 6.0% (reduced from 8% to catch LONGs earlier when ADX slope turns positive)
    RELAXED_SOFT_THRESHOLD_PERCENT: 5.0,
    RELAXED_HARD_THRESHOLD_PERCENT: 6.0,
    
    // Position sizing for relaxed zone entries (between original soft and relaxed hard)
    // Original soft (3.5-5%): 35% → Relaxed soft (5-6%): 45% → Relaxed transition (6-8%): 35%
    RELAXED_SOFT_POSITION_SIZE: 0.45,   // Better R:R due to strong trend
    RELAXED_TRANSITION_POSITION_SIZE: 0.35, // Between old hard and new hard
    
    // ===== ADDITIONAL SAFETY CHECKS =====
    // Even with relaxation, require StochRSI runway
    REQUIRE_STOCHRSI_RUNWAY: true,
    STOCHRSI_RUNWAY_MIN_K_FOR_SHORT: 15,  // K must be >= 15 for continued short
    STOCHRSI_RUNWAY_MAX_K_FOR_LONG: 85,   // K must be <= 85 for continued long
    
    // Graduated relaxation slope check (matches ADX_SLOPE_GRADUATED philosophy)
    // Instead of binary block, slope determines relaxation DEGREE
    BLOCK_IF_ADX_SLOPE_DECLINING: true,
    ADX_SLOPE_DECLINE_THRESHOLD: -2.5,  // Only fully block relaxation at structural decline
    // Graduated relaxation tiers based on slope
    GRADUATED_SLOPE_RELAXATION: {
      ENABLED: true,
      // slope >= -1.0: full relaxation (6.0% hard threshold)
      FULL_RELAXATION_SLOPE: -1.0,
      FULL_HARD_THRESHOLD: 6.0,
      // slope -1.0 to -2.0: partial relaxation (5.5% hard threshold, reduced size)
      PARTIAL_RELAXATION_SLOPE: -2.0,
      PARTIAL_HARD_THRESHOLD: 5.5,
      PARTIAL_POSITION_SIZE: 0.35,
      // slope -2.0 to -2.5: limited relaxation (5.2% hard threshold, minimal size)
      LIMITED_RELAXATION_SLOPE: -2.5,
      LIMITED_HARD_THRESHOLD: 5.2,
      LIMITED_POSITION_SIZE: 0.30,
      // slope < -2.5: no relaxation (default 5.0% hard block)
    },
  },
  
  // ===== STOCHRSI ALIGNMENT REQUIRED =====
  // In soft zone, block if StochRSI indicates exhaustion
  // FIX: For SHORTs - K <= 65 was WRONG (blocked good continuation shorts)
  // Now using K >= 20: avoid ONLY extreme oversold exhaustion, not moderate oversold
  // Logic: In a falling market, K can be 15-40 (oversold) but trend still has room
  // We only block if K < 20 (extreme exhaustion = bounce imminent)
  REQUIRE_STOCHRSI_ALIGNMENT: true,
  STOCHRSI_MIN_FOR_SHORT: 20,           // K must be >= 20 for late short (avoid extreme oversold only)
  STOCHRSI_NOT_OVERBOUGHT_FOR_LONG: 50, // K must be < 50 for late long (tightened from 65)
  
  // Legacy alias (backward compatibility)
  STOCHRSI_NOT_OVERSOLD_FOR_SHORT: 20,  // Renamed - now means MIN K for short entry
  
  // ===== EXCEPTION: STRONG TREND CONTINUATION =====
  // Allow entry despite exhaustion ONLY if ADX is VERY strong (>=40) and clearly rising
  ALLOW_STRONG_TREND_EXCEPTION: true,
  EXCEPTION_MIN_ADX: 40,              // Very strong trend required
  EXCEPTION_MIN_ADX_SLOPE: 0.2,       // ADX must be rising
  EXCEPTION_POSITION_SIZE: 0.40,      // 40% position for exception entries
  
  // ===== EXCEPTION: MEAN REVERSION BOUNCE/FADE =====
  // Allow counter-trend probes when move is exhausted AND trend energy is decaying
  // This captures bounces after extended moves when ADX confirms trend exhaustion
  ALLOW_MEAN_REVERSION_EXCEPTION: true,
  MEAN_REVERSION: {
    // ADX must be below this (not in dominant trend) OR slope must be declining
    MAX_ADX_FOR_EXCEPTION: 45,
    // ADX slope must be <= 0 (flat or declining) - trend energy decay required
    MAX_ADX_SLOPE: 0,
    // StochRSI extremes required for counter-trend entry
    // LONG bounce: K must be < 15 (oversold)
    LONG_MAX_K_FOR_EXCEPTION: 15,
    // SHORT fade: K must be > 85 (overbought)
    SHORT_MIN_K_FOR_EXCEPTION: 85,
    // Position size for mean reversion exceptions (probe size)
    POSITION_SIZE: 0.25,
    // Minimum move percentage before mean reversion is allowed
    // Prevents MR entries on small moves - only after extended ones
    MIN_MOVE_PERCENT_FOR_EXCEPTION: 5.0,
  },
  
  // ===== ADDITIONAL ENTRY QUALITY GATES =====
  SOFT_SHORT_MIN_STOCHRSI: 35,
  SOFT_LONG_MAX_STOCHRSI: 50,         // Tightened from 65
  
  // ===== LOOKBACK PERIOD =====
  SWING_LOOKBACK_HOURS: 24,
  
  // ===== ATR-BASED ALTERNATIVE =====
  USE_ATR_BASED_THRESHOLD: false,
  MAX_ATR_DISTANCE_FOR_ENTRY: 4.0,
  
  // ===== LOGGING =====
  LOG_EXHAUSTION_CHECKS: true,
} as const;

// ============= MEAN REVERSION STRATEGY CONFIGURATION =============
// Asymmetric thresholds for LONG (Bounce) vs SHORT (Reversal)
// SHORTs have stricter requirements due to crypto's upward bias

export const MEAN_REVERSION_CONFIG = {
  ENABLED: true,
  
  // LONG (Bounce) - More Aggressive
  LONG: {
    K_THRESHOLD: 5,               // K < 5 triggers bounce detection
    PERCENT_B_THRESHOLD: 15,      // %B < 15 (below lower Bollinger)
    POSITION_SIZE: 0.40,          // 40% of normal position
    STOP_LOSS_PERCENT: 1.8,       // Wider stop for reversals
    TAKE_PROFIT_PERCENT: 2.5,     // Target mean reversion to middle
    MAX_ADX: 30,                  // Normal max ADX (informational at extremes)
    REQUIRE_MOMENTUM_SHIFT: true,
    MIN_BARS_AT_EXTREME: 3,
  },
  
  // SHORT (Reversal) - More Conservative
  SHORT: {
    K_THRESHOLD: 97,              // K > 97 (stricter than LONG's 5)
    PERCENT_B_THRESHOLD: 90,      // %B > 90 (well above upper Bollinger)
    POSITION_SIZE: 0.25,          // Only 25% of normal position
    STOP_LOSS_PERCENT: 2.2,       // Even wider stop
    TAKE_PROFIT_PERCENT: 2.0,     // Modest target
    MAX_ADX: 25,                  // Normal max ADX (informational at extremes)
    REQUIRE_HTF_NOT_BULLISH: true,
    REQUIRE_BEARISH_DIVERGENCE: true,
    MIN_BARS_AT_EXTREME: 4,
  },
  
  // Quality Score Capping - prevents outranking trend trades
  MAX_QUALITY_SCORE: 78,
  
  // ===== EXTREME EXHAUSTION OVERRIDE =====
  // When exhaustion is extreme, ADX becomes informational, not blocking
  // This addresses late-stage moves where ADX peaks near local exhaustion
  EXTREME_EXHAUSTION: {
    // Thresholds where ADX veto is lifted
    // UPDATED: Relaxed from K<=5 to K<=10 to capture more oversold bounce opportunities
    // Safety maintained via ADX slope requirement (must be flat/declining)
    LONG_K_EXTREME: 10,           // K <= 10 = oversold exhaustion (was 5)
    SHORT_K_EXTREME: 90,          // K >= 90 = overbought exhaustion (was 95)
    
    // Safety requirements when overriding ADX
    MAX_ADX_SLOPE: 0,             // ADX must be flat/declining (not accelerating)
    MIN_ATR_DISTANCE_FROM_VWAP: 1.5,  // Price must be extended from VWAP
    
    // ===== MOMENTUM FLOOR (prevents counter-momentum extreme entries) =====
    // Even at statistical extremes, require minimum momentum alignment
    // Prevents LONG when momentum is strongly bearish, SHORT when strongly bullish
    MIN_MOMENTUM_SCORE: 20,       // Momentum must not strongly oppose direction
    
    // ===== MOMENTUM DELTA CHECK (Recommendation #1) =====
    // Confirms selling/buying pressure is EASING before entry
    // Prevents catching first bounce failure during violent selloffs
    REQUIRE_MOMENTUM_IMPROVING: true,
    MIN_MOMENTUM_DELTA: 15,       // momentum - prevMomentum >= +15 for LONG, <= -15 for SHORT
    
    // Risk adjustments for high-ADX mean reversion
    POSITION_SIZE_MULTIPLIER: 0.50,   // 50% of normal MR size
    FASTER_STOP_MULTIPLIER: 0.75,     // Tighter stop (volatility-based)
    NO_REENTRY: true,                 // No averaging or re-entries
    TARGET_PARTIAL_REVERSION: true,   // Only target VWAP/mid-BB, not full reversion
  },
  
  // ===== FIX #1 (Audit): FORMAL isExtremeMeanReversion DEFINITION =====
  // This defines the criteria for Tier 1 SEVERE bypass via mean reversion
  // All conditions must be met for the bypass to be valid
  TIER1_BYPASS_CRITERIA: {
    // Regime must be RANGE or EXHAUSTION (not EARLY_TREND or STRONG_TREND)
    ALLOWED_REGIMES: ['RANGE', 'LATE_TREND', 'EXHAUSTION'] as readonly string[],
    // Reversal score must be >= this threshold (strong reversal signal)
    MIN_REVERSAL_SCORE: 55,
    // Momentum state must NOT be "confirmed" (no strong trend-following momentum)
    DISALLOWED_MOMENTUM_STATES: ['confirmed'] as readonly string[],
    // Position size when Tier 1 bypass is applied
    BYPASS_POSITION_MULTIPLIER: 0.50,
  },
  
  // ===== MODERATE EXHAUSTION TIER (K 10-15) =====
  // Fills gap between Extreme tier (≤10) and noise zone (15-25)
  // Probabilistic probe for early bounce detection, NOT conviction trade
  // Requires momentum confirmation to avoid knife-catching
  MODERATE_EXHAUSTION: {
    ENABLED: true,
    
    // ===== K RANGE (Non-overlapping with Extreme tier) =====
    LONG_K_MIN: 10,               // Must be > Extreme tier threshold
    LONG_K_MAX: 15,               // Upper bound before noise zone
    SHORT_K_MIN: 85,              // Symmetric for shorts
    SHORT_K_MAX: 90,              // Must be < Extreme tier threshold
    
    // ===== MOMENTUM GATING (Critical safety) =====
    // Prevents entries when momentum is still bearish/opposing
    MIN_MOMENTUM_SCORE: 40,       // Must have positive momentum tilt
    REQUIRE_ALIGNED_MOMENTUM: true, // Momentum direction must match trade direction
    
    // ===== ADX CONDITIONS (Dual-path) =====
    // Path 1: ADX is moderate (not in strong trend)
    MAX_ADX: 35,
    // Path 2: Any ADX allowed if slope is flat/declining (trend exhausting)
    ALLOW_ADX_SLOPE_OVERRIDE: true,
    MAX_ADX_SLOPE_FOR_OVERRIDE: 0, // ADX slope must be <= 0
    
    // ===== POSITION SIZING =====
    POSITION_SIZE: 0.35,          // 35% of normal - below Extreme tier's 0.40x
    
    // ===== TAGGING =====
    TAG: 'MR_MODERATE_EXHAUSTION' as const,
    
    // ===== INVALIDATION RULES (Risk containment) =====
    // If momentum deteriorates, position should be exited
    INVALIDATION_MOMENTUM_FLOOR: 30,  // Exit if momentum drops below this
    INVALIDATION_TIME_BARS: 8,        // Max bars without favorable move (2 candles on 4h = 8h)
  },
  
  // Volatility-Adjusted Exit
  EXIT: {
    BASE_TIMEOUT_ATR_MULTIPLE: 1.5,
    MAX_HOLD_HOURS: 4,
    FAILURE_ATR_THRESHOLD: 0.8,
    FAILURE_TIME_BARS: 4,
    QUICK_PROFIT_TARGET_PERCENT: 1.5,
    TRAILING_ACTIVATION_PERCENT: 0.8,
    TRAILING_DISTANCE_PERCENT: 0.3,
  },
} as const;

// ============= ADX REVERSAL WEIGHTS (Issue #6 Fix) =============
// Graduated ADX-based reduction of reversal score impact
// Stronger trends get more aggressive reduction of reversal signals
// This replaces the flat 50% reduction previously documented
export const ADX_REVERSAL_WEIGHTS = {
  // ADX >= 40 = Extreme trend = 60% reduction (weight 0.40)
  EXTREME_WEIGHT: 0.40,
  EXTREME_THRESHOLD: ADX_THRESHOLDS.EXTREME,  // 40
  
  // ADX >= 35 = Exceptional trend = 50% reduction (weight 0.50)
  EXCEPTIONAL_WEIGHT: 0.50,
  EXCEPTIONAL_THRESHOLD: ADX_THRESHOLDS.EXCEPTIONAL,  // 35
  
  // ADX >= 30 = Very strong trend = 40% reduction (weight 0.60)
  VERY_STRONG_WEIGHT: 0.60,
  VERY_STRONG_THRESHOLD: ADX_THRESHOLDS.VERY_STRONG,  // 30
  
  // ADX >= 25 = Strong trend = 25% reduction (weight 0.75)
  STRONG_WEIGHT: 0.75,
  STRONG_THRESHOLD: ADX_THRESHOLDS.STRONG,  // 25
  
  // ADX >= 20 = Moderate trend = 15% reduction (weight 0.85)
  MODERATE_WEIGHT: 0.85,
  MODERATE_THRESHOLD: ADX_THRESHOLDS.MINIMUM,  // 20
  
  // ADX < 20 = Weak/no trend = no reduction (weight 1.00)
  WEAK_WEIGHT: 1.00,
} as const;

// ============= TREND PHASE GATE (Orthogonal to Expansion) =============
// Classifies trend phase independently for clean regime separation

export const TREND_PHASE_GATE = {
  EARLY_TREND: {
    ADX_MIN: 20,
    ADX_MAX: 35,
    ADX_SLOPE_MIN: 0.3,           // Rising ADX = early trend
  },
  LATE_TREND: {
    ADX_MIN: 35,
    ADX_SLOPE_MAX: 0,             // Flat/declining ADX = late trend
    DI_COMPRESSION: true,
  },
  RANGE: {
    ADX_MAX: 20,
  },
} as const;

// ============= EXPANSION GATE (Orthogonal to Trend Phase) =============
// Classifies expansion state independently for clean regime separation

export const EXPANSION_GATE = {
  NORMAL: {
    VOLUME_RATIO_MAX: 1.5,
    NO_SQUEEZE_RELEASE: true,
  },
  EXPANSION: {
    VOLUME_SPIKE_MIN: 2.0,
    OR_SQUEEZE_RELEASE: true,
    ADX_SLOPE_MIN: 0.5,
  },
  BREAKOUT: {
    VOLUME_SPIKE_MIN: 2.5,
    ADX_SPIKE: true,
    PRICE_RANGE_EXPANSION: true,
  },
} as const;

// ============= MEAN REVERSION REGIME REQUIREMENTS =============
// Mean reversion requires BOTH favorable trend phase AND expansion state

export const MEAN_REVERSION_REGIME_REQUIREMENTS = {
  ALLOWED_TREND_PHASES: ['RANGE', 'LATE_TREND'] as const,
  ALLOWED_EXPANSION_STATES: ['NORMAL'] as const,  // Never in expansion
  
  // Position adjustments by phase
  POSITION_MULTIPLIERS: {
    'RANGE': 1.0,
    'LATE_TREND': 0.70,
  } as const,
} as const;

// ============= COUNTER-TREND ADMISSION LAYER =============
// Unified configuration for allowing counter-trend (reversal) entries
// Single source of truth for all exhaustion/mean-reversion admission decisions
// This module answers: "Is the dominant trend exhausted enough to allow a reversal probe?"

export const COUNTER_TREND_ADMISSION = {
  ENABLED: true,
  
  // ===== ADX EXHAUSTION REQUIREMENTS =====
  // Trend energy must be decaying, not expanding
  MAX_ADX_FOR_EXHAUSTION: 45,       // ADX must be below this (not in dominant trend)
  MAX_ADX_SLOPE: 0.0,               // ADX slope must be flat/declining
  MAX_ADX_SLOPE_STRONG: -0.5,       // Strong exhaustion: ADX clearly declining
  MIN_ADX_SLOPE_PERSISTENCE: 2,     // Consecutive candles with non-positive slope
  
  // ===== VOLATILITY CONTRACTION REQUIREMENTS =====
  // Confirms impulse is dying, not just oscillators resetting
  REQUIRE_VOLATILITY_CONTRACTION: true,
  BB_WIDTH_DECLINE_MIN_PERCENT: 5,  // BB width must decline by at least 5%
  ATR_CHANGE_FLAT_THRESHOLD: 0.5,   // ATR change < 0.5% = flat (acceptable)
  
  // ===== LTF STRUCTURE FLIP (Optional Confirmation) =====
  // Soft confirmation for counter-trend entry timing
  LTF_STRUCTURE_ENABLED: true,
  LTF_STRUCTURE_BONUS: 10,          // Confidence bonus when LTF structure confirms
  LTF_LOOKBACK_BARS: 12,            // Bars to check for HH/HL or LH/LL
  
  // ===== POSITION SIZING =====
  // Counter-trend entries are probes, not convictions
  PROBE_POSITION_MULTIPLIER: 0.25,  // 25% of normal position
  MAX_SCALE_IN: 1,                  // Maximum additional entries
  
  // ===== SCALE-IN REQUIREMENTS =====
  SCALE_IN_REQUIREMENTS: {
    MAX_ADX_FOR_SCALE: 35,          // ADX must drop further before scaling
    REQUIRE_STRUCTURE_HOLD: true,   // LTF structure must maintain
    REQUIRE_MOMENTUM_SUPPORT: true, // Momentum must turn supportive
  },
  
  // ===== MOMENTUM TOLERANCE FOR MR PROBES =====
  // MR probes are counter-trend by definition → opposing momentum is EXPECTED
  // Standard gates treat them identically to trend entries → too strict
  // These relaxed thresholds apply ONLY when meanReversionDirectionFlipped = true
  MOMENTUM_TOLERANCE: {
    ENABLED: true,
    
    // Standard gates block at ±15 score - MR probes allow up to ±25
    // Rationale: Counter-trend entries naturally face opposing momentum
    RELAXED_OPPOSING_THRESHOLD: 25,
    
    // Absolute block threshold - even MR probes blocked beyond this
    // Score > 50 = extreme momentum, not worth fighting
    EXTREME_OPPOSING_THRESHOLD: 50,
    
    // Position multiplier when momentum opposition is in the 15-25 range
    // More conservative than standard but still allows probe entry
    MODERATE_OPPOSITION_MULTIPLIER: 0.20,  // 20% position for moderate opposition
    
    // Require momentum DELTA to be improving (slope flattening), not positive
    // This confirms the impulse is weakening, not just oscillators
    REQUIRE_IMPROVING_DELTA: true,
    IMPROVING_DELTA_THRESHOLD: 0.0,  // Delta >= 0 means not getting worse
    
    // Allow bypass if ADX slope persistence >= 2 candles (additional safety)
    // More consecutive decaying candles = higher confidence of exhaustion
    ADX_PERSISTENCE_BYPASS_THRESHOLD: 2,
    
    // Logging for forensics
    LOG_TOLERANCE_APPLIED: true,
  },
  
  // ===== FAILURE REASON LOGGING =====
  LOG_FAILURE_REASONS: true,        // Log exact failure cause for forensics
  
  // ===== FAILURE REASON CODES =====
  // These codes are used for explicit failure logging
  FAILURE_REASONS: {
    ADX_STILL_EXPANDING: 'ADX slope > 0, trend energy not decaying',
    ADX_NOT_EXHAUSTED: 'ADX >= 45, still in dominant trend',
    MOMENTUM_NOT_DECAYING: 'Momentum magnitude not decreasing',
    VOLATILITY_EXPANDING: 'BB width or ATR still increasing',
    STOCHRSI_STILL_PEGGED: 'K stuck at extreme (< 5 or > 95)',
    LTF_NO_STRUCTURE_FLIP: 'Lower timeframe shows no reversal structure',
    ADX_PERSISTENCE_INSUFFICIENT: 'ADX slope not negative for required consecutive candles',
  } as Record<string, string>,
} as const;

// Type for counter-trend admission failure reasons
export type CounterTrendFailureReason = keyof typeof COUNTER_TREND_ADMISSION.FAILURE_REASONS;

// ============= PHASE: MOMENTUM DIRECTION HARD GATE =============
// CRITICAL FIX: Prevents counter-trend entries when momentum has flipped
// This gate runs BEFORE any exception overrides (MICRO_TREND, STRONG_TREND, etc.)
// Root cause: System entered SHORT just as momentum flipped bullish (from -64 to +36)
export const MOMENTUM_DIRECTION_HARD_GATE = {
  ENABLED: true,
  
  // ===== CORE BLOCKING THRESHOLDS =====
  // Block SHORT when momentum score is above this (positive = bullish momentum)
  BLOCK_SHORT_ABOVE_SCORE: 15,  // Tightened from 20 - block SHORT earlier when momentum is bullish
  // Block LONG when momentum score is below this (negative = bearish momentum)
  BLOCK_LONG_BELOW_SCORE: -15,  // Tightened from -20 - block LONG earlier when momentum is bearish
  
  // ===== EXCEPTION CONDITIONS =====
  // Only allow override if ADX is high (trend is undeniable)
  // UPDATED: Lowered from 55 to 50 - ADX 54 missed exception by 0.7 during 7% drop
  EXCEPTION_MIN_ADX: 50,
  // Even with high ADX, require 4h trend to match
  EXCEPTION_REQUIRE_HTF_ALIGNMENT: true,
  // Position size if exception applied
  EXCEPTION_POSITION_MULTIPLIER: 0.30,  // 30% position for risky override
  
  // ===== 1H TREND AGREEMENT BYPASS (Phase 1 MODERATE) =====
  // When 1h trend aligns with trade direction, allow lagging momentum bypass
  // Root cause: SHORT with bullish momentum (+26) blocked despite 1h bearish trend
  // This fixes the control flow bug where bypass was logged but not applied
  HTF_1H_AGREEMENT_BYPASS: {
    ENABLED: true,
    // Allow bypass when momentum is between ±15 and ±50 (MODERATE zone)
    // Scores beyond ±50 (EXTREME) are blocked regardless
    MODERATE_MIN_SCORE: 15,
    MODERATE_MAX_SCORE: 50,
    // Position multipliers based on momentum severity
    POSITION_MULT_MILD: 0.70,      // |score| 15-30: 70% position
    POSITION_MULT_MODERATE: 0.50,  // |score| 30-50: 50% position
    // Logging
    LOG_BYPASSES: true,
  },
  
  // ===== PRICE ACTION OVERRIDE =====
  // When price moved significantly in trade direction, override momentum lag
  // Root cause: Momentum score lagged 7% price drop (still showed +16 to +25 bullish)
  PRICE_ACTION_OVERRIDE: {
    ENABLED: true,
    // Minimum price move percent to trigger override (3%+ move in direction overrides momentum reading)
    MIN_PRICE_MOVE_PERCENT: 3.0,
    // Lookback period in hours for price move detection
    LOOKBACK_HOURS: 6,
    // Position size multiplier for price action override entries (conservative)
    POSITION_SIZE_MULTIPLIER: 0.50,
    // Minimum ADX required for override (still need some trend strength)
    MIN_ADX: 25,
    
    // ===== FIX: PERSISTENCE REQUIREMENT =====
    // Prevents single impulse candle / news wick from triggering override
    // Move must have persisted for N bars (on 15m timeframe)
    REQUIRE_PERSISTENCE: true,
    MIN_BARS_SINCE_EXTREME: 3,  // At least 3 bars (45min on 15m) since high/low
    
    // ===== FIX: HARD ZONE PROTECTION =====
    // When in HARD_ZONE (>=5% move), require higher ADX to prevent nullifying MOVE_EXHAUSTED
    HARD_ZONE_MIN_ADX: 35,  // Higher ADX required when move >= 5%
    HARD_ZONE_THRESHOLD_PERCENT: 5.0,  // Matches MOVE_EXHAUSTION_FILTER_PARAMS.HARD_THRESHOLD_PERCENT
  },
  
  // ===== LOGGING =====
  LOG_ALL_CHECKS: true,
  LOG_BLOCKS: true,
} as const;

// ============= PHASE: TREND REVERSAL DETECTION GATE =============
// Detects when price action indicates a trend is reversing
// Blocks entries in the OLD direction when reversal signals are present
export const TREND_REVERSAL_DETECTION_GATE = {
  ENABLED: true,
  
  // ===== STOCHRSI REVERSAL SIGNALS =====
  // Detect StochRSI crossing up from oversold (bullish reversal)
  STOCH_CROSSING_UP_THRESHOLD: 30,  // K was below this
  STOCH_CROSSING_UP_MIN_K: 20,      // K is now above this
  // Detect StochRSI crossing down from overbought (bearish reversal)
  STOCH_CROSSING_DOWN_THRESHOLD: 70, // K was above this
  STOCH_CROSSING_DOWN_MAX_K: 80,     // K is now below this
  
  // ===== MACD REVERSAL SIGNALS =====
  // Detect MACD histogram flipping positive (bullish reversal) or negative (bearish reversal)
  MACD_FLIP_DETECTION: true,
  
  // ===== PRICE ACTION REVERSAL SIGNALS =====
  // Detect recent price direction change
  PRICE_REVERSAL_LOOKBACK_HOURS: 4,
  MIN_PRICE_CHANGE_PERCENT: 1.0,  // Price must have moved at least 1% in new direction
  
  // ===== BLOCK BEHAVIOR =====
  // Block SHORT when bullish reversal detected
  BLOCK_SHORT_ON_BULLISH_REVERSAL: true,
  // Block LONG when bearish reversal detected
  BLOCK_LONG_ON_BEARISH_REVERSAL: true,
  
  // ===== POSITION SIZE FOR NEW DIRECTION =====
  // When entering in new direction after reversal detection
  NEW_DIRECTION_POSITION_MULTIPLIER: 0.60,
  
  // ===== EXCEPTION: STRONG TREND CONTINUATION =====
  // Allow entry against reversal signals if ADX is very high AND 4h confirms
  EXCEPTION_MIN_ADX: 50,
  EXCEPTION_REQUIRE_HTF_ALIGNMENT: true,
  
  // ===== LOGGING =====
  LOG_BLOCKS: true,
} as const;

// ============= PHASE: MOVE EXHAUSTED REVERSAL GATE (SHORT SYMMETRY) =============
// CRITICAL: Adds symmetric protection for SHORTs that LONGs already have
// Prevents shorting when price is RALLYING (just like we block LONGs when price is dumping)
export const MOVE_EXHAUSTED_REVERSAL_GATE = {
  ENABLED: true,
  
  // ===== PRICE RALLY DETECTION FOR SHORT BLOCK =====
  // Block SHORT if price ROSE more than this in last 4 hours
  BLOCK_SHORT_IF_PRICE_ROSE_PERCENT: 1.5,
  // Lookback period for price move detection
  LOOKBACK_HOURS: 4,
  
  // ===== STOCHRSI ALIGNMENT FOR LATE SHORTS =====
  // For shorts during price rally: StochRSI K must be ABOVE this (not oversold)
  MIN_STOCHRSI_K_FOR_LATE_SHORT: 40,
  
  // ===== EXCEPTION: STRONG DOWNTREND =====
  // Allow SHORT despite rally if ADX >= this AND 4h is bearish
  EXCEPTION_MIN_ADX: 35,
  EXCEPTION_REQUIRE_BEARISH_4H: true,
  EXCEPTION_POSITION_SIZE: 0.40,
  
  // ===== LOGGING =====
  LOG_BLOCKS: true,
} as const;

// ============= PHASE: MOMENTUM FLIP DETECTION =============
// Detects when momentum recently changed direction (e.g., bearish to bullish)
// Implements a cooldown period after flip to avoid "catching falling knives" or "shorting breakouts"
export const MOMENTUM_FLIP_DETECTION = {
  ENABLED: true,
  
  // ===== FLIP DETECTION THRESHOLDS =====
  // Minimum score magnitude to be considered "directional" (not neutral)
  DIRECTIONAL_THRESHOLD: 25,
  // Minimum score change to be considered a "flip"
  MIN_FLIP_DELTA: 40,  // e.g., from -30 to +10 = 40 point swing
  
  // ===== COOLDOWN AFTER FLIP =====
  // Number of minutes to wait after a momentum flip before allowing same-direction entries
  COOLDOWN_MINUTES: 30,
  // Block entries that go WITH the old direction immediately after flip
  // e.g., if momentum just flipped from -50 to +20, block SHORT entries
  BLOCK_OLD_DIRECTION_ENTRIES: true,
  
  // ===== POSITION SIZE DURING COOLDOWN =====
  // If allowing entries during cooldown (in new direction), reduce position
  NEW_DIRECTION_POSITION_MULTIPLIER: 0.50,  // 50% position for new direction during cooldown
  
  // ===== EXCEPTION: STRONG CONFIRMATION =====
  // Allow entry if new direction has very strong confirmation
  BYPASS_COOLDOWN_MIN_ADX: 45,
  BYPASS_COOLDOWN_MIN_SCORE: 50,  // New direction must be strongly confirmed
  BYPASS_COOLDOWN_REQUIRE_HTF: true,  // 4h must align with new direction
} as const;

// ============= OPTIMIZED MICRO_TREND SCALING SYSTEM =============
// Comprehensive position sizing for MICRO_TREND entries based on:
// 1. Momentum State + Score (primary filter)
// 2. HTF (4h) Trend Alignment (counter-trend protection)
// 3. Directional Runway (late entry protection)
// 4. ADX Rescue (graduated exception)
// 5. Minimum Floor (prevents insignificant positions)
//
// All multipliers are MULTIPLICATIVE and apply to the base 60% MICRO_TREND size
// Worst case (not blocked): 0.5 × 0.6 × 0.5 × 0.6 = 9% → floor bumps to 20%
export const MICRO_TREND_MOMENTUM_SAFETY = {
  ENABLED: true,
  
  // ===== STEP 1: MOMENTUM STATE HANDLING =====
  // Determines base eligibility and initial multiplier
  MOMENTUM_STATE: {
    // 'none' state = hard block (no directional energy detected)
    BLOCK_ON_NONE: true,
    // 'building' state = allow with reduced size (probe trade)
    // CRITICAL FIX: 'building' state requires score >= 30 (tighter coupling)
    BUILDING_MULTIPLIER: 0.5,
    // 'confirmed' or 'mixed' state = continue to score check
    CONFIRMED_MULTIPLIER: 1.0,
    MIXED_MULTIPLIER: 1.0,  // Will be evaluated in score step
  },
  
  // ===== STEP 2: SMART MOMENTUM SCORE TIERS =====
  // Uses |smart_momentum_score| for magnitude-based sizing
  // CRITICAL FIX: Non-confirmed states require score >= 30 (not just 15)
  MOMENTUM_SCORE: {
    // Block if score < 15 (insufficient directional conviction)
    MIN_SCORE_THRESHOLD: 15,
    // CRITICAL FIX: For non-confirmed states, require >= 30
    MIN_SCORE_IF_NOT_CONFIRMED: 30,
    // Partial size if score 15-30 (moderate conviction) - ONLY for 'confirmed' state
    MODERATE_SCORE_THRESHOLD: 30,
    MODERATE_MULTIPLIER: 0.6,
    // Full size if score >= 30 (strong conviction)
    FULL_MULTIPLIER: 1.0,
  },
  
  // ===== STEP 3: HTF (4H) TREND ALIGNMENT =====
  // Applies penalty when 4h trend is neutral or counter-trend
  HTF_ALIGNMENT: {
    ENABLED: true,
    // 4h neutral + score >= 30 = moderate reduction
    NEUTRAL_STRONG_MOMENTUM_MULTIPLIER: 0.7,
    // 4h neutral + score < 30 = larger reduction
    NEUTRAL_WEAK_MOMENTUM_MULTIPLIER: 0.5,
    // Counter-trend (4h opposes direction) = soft protection
    COUNTER_TREND_MULTIPLIER: 0.5,
    // 4h aligned with direction = no adjustment
    ALIGNED_MULTIPLIER: 1.0,
  },
  
  // ===== STEP 4: DIRECTIONAL RUNWAY (Late Entry Scaling) =====
  // Uses move_from_24h_low_percent for LONG, move_from_24h_high_percent for SHORT
  RUNWAY: {
    ENABLED: true,
    // Block if < 1.5% runway remains (insufficient room)
    MIN_RUNWAY_PERCENT: 1.5,
    // MICRO_TREND minimum expected expansion (projected RR)
    // Prevents mathematically disadvantaged trades where peak < fees + trailing
    MIN_EXPECTED_EXPANSION_PERCENT: 0.8,
    // 1.5-3% runway = partial size
    SHORT_RUNWAY_MAX: 3.0,
    SHORT_RUNWAY_MULTIPLIER: 0.6,
    // 3-5% runway = moderate size
    MEDIUM_RUNWAY_MAX: 5.0,
    MEDIUM_RUNWAY_MULTIPLIER: 0.8,
    // >= 5% runway = full size
    LONG_RUNWAY_MULTIPLIER: 1.0,
  },
  
  // ===== STEP 5: GRADUATED ADX EXCEPTION (Rescue) =====
  // Allows recovery when ADX is in transition zone with confirmations
  ADX_RESCUE: {
    ENABLED: true,
    // ADX range for rescue eligibility
    MIN_ADX: 22,
    MAX_ADX: 25,
    // Requirements for rescue
    REQUIRE_ADX_RISING: true,
    MIN_MOMENTUM_SCORE: 15,
    MIN_QUALITY_SCORE: 65,
    // Rescue floor: Math.max(currentMultiplier, 0.6)
    RESCUE_FLOOR: 0.6,
  },
  
  // ===== STEP 6: MINIMUM FLOOR =====
  // Prevents positions from becoming insignificantly small
  MIN_SIZE_MULTIPLIER: 0.2,  // 20% minimum if not blocked
  
  // ===== LEGACY PARAMETERS (for backwards compatibility) =====
  MIN_MOMENTUM_FOR_BULLISH: 0,
  MAX_MOMENTUM_FOR_BEARISH: 0,
  REQUIRE_MOMENTUM_CONFIRMATION: true,
  CONFIRMED_MOMENTUM_STATES: ['confirmed', 'building'] as string[],
  PARTIAL_ALIGNMENT_MULTIPLIER: 0.55,
  BLOCK_ON_MIXED_UNCONFIRMED: true,
  BLOCK_SHORT_IF_4H_BULLISH: true,
  BLOCK_LONG_IF_4H_BEARISH: true,
  MIN_PERSISTENCE_CANDLES: 3,
  MIN_ADX_FOR_MICRO_TREND: 20,
  FULL_CONFIRMATION_MULTIPLIER: 1.0,
  MODERATE_CONFIRMATION_MULTIPLIER: 0.55,
  WEAK_CONFIRMATION_MULTIPLIER: 0.35,
  
  // ===== LOGGING =====
  LOG_DENIALS: true,
  LOG_SIZING_TIERS: true,
  LOG_DETAILED_SCALING: true,
} as const;

// ============= MICRO_TREND SCALING RESULT TYPE =============
export interface MicroTrendScalingResult {
  sizeMultiplier: number;
  blocked: boolean;
  blockReason: string;
  scalingReasons: string[];
  appliedSteps: {
    momentumState: { multiplier: number; reason: string };
    momentumScore: { multiplier: number; reason: string };
    htfAlignment: { multiplier: number; reason: string };
    runway: { multiplier: number; reason: string };
    adxRescue: { applied: boolean; reason: string };
    floor: { applied: boolean; reason: string };
  };
}

// ============= MICRO_TREND SCALING INPUT TYPE =============
export interface MicroTrendScalingInput {
  smartMomentumScore: number;
  momentumState: string;  // 'confirmed' | 'building' | 'mixed' | 'none'
  trend4h: string;        // 'bullish' | 'bearish' | 'neutral'
  isLong: boolean;
  moveFromLowPercent: number;   // For LONG runway check
  moveFromHighPercent: number;  // For SHORT runway check
  adx: number;
  adxSlope: number;
  qualityScore: number;
}

// ============= MICRO_TREND SCALING CALCULATOR =============
// Centralized function for calculating MICRO_TREND position sizing
// Called by strategy-analyzer with pre-extracted values
export function calculateMicroTrendScaling(input: MicroTrendScalingInput): MicroTrendScalingResult {
  const config = MICRO_TREND_MOMENTUM_SAFETY;
  let sizeMultiplier = 1.0;
  const scalingReasons: string[] = [];
  let blocked = false;
  let blockReason = '';
  
  const appliedSteps = {
    momentumState: { multiplier: 1.0, reason: '' },
    momentumScore: { multiplier: 1.0, reason: '' },
    htfAlignment: { multiplier: 1.0, reason: '' },
    runway: { multiplier: 1.0, reason: '' },
    adxRescue: { applied: false, reason: '' },
    floor: { applied: false, reason: '' },
  };
  
  // ===== STEP 1: MOMENTUM STATE CHECK =====
  if (input.momentumState === 'none' && config.MOMENTUM_STATE.BLOCK_ON_NONE) {
    blocked = true;
    blockReason = `Blocked: momentum state 'none' (no directional energy)`;
    appliedSteps.momentumState = { multiplier: 0, reason: blockReason };
    return { sizeMultiplier: 0, blocked, blockReason, scalingReasons: [blockReason], appliedSteps };
  } else if (input.momentumState === 'building') {
    sizeMultiplier *= config.MOMENTUM_STATE.BUILDING_MULTIPLIER;
    const reason = `Partial: momentum building (${config.MOMENTUM_STATE.BUILDING_MULTIPLIER * 100}%)`;
    scalingReasons.push(reason);
    appliedSteps.momentumState = { multiplier: config.MOMENTUM_STATE.BUILDING_MULTIPLIER, reason };
  } else {
    // 'confirmed' or 'mixed' - continue to score check
    appliedSteps.momentumState = { multiplier: 1.0, reason: `State=${input.momentumState}, continue to score check` };
  }
  
  // ===== STEP 2: MOMENTUM SCORE CHECK =====
  // CRITICAL FIX: Non-confirmed states require score >= 30 (tighter admission)
  const absScore = Math.abs(input.smartMomentumScore);
  const isConfirmedState = input.momentumState === 'confirmed';
  const effectiveMinScore = isConfirmedState 
    ? config.MOMENTUM_SCORE.MIN_SCORE_THRESHOLD 
    : config.MOMENTUM_SCORE.MIN_SCORE_IF_NOT_CONFIRMED;
  
  if (absScore < effectiveMinScore) {
    blocked = true;
    blockReason = isConfirmedState
      ? `Blocked: momentum score ${absScore.toFixed(0)} < ${effectiveMinScore} required`
      : `Blocked: non-confirmed state (${input.momentumState}) requires score >= ${effectiveMinScore}, got ${absScore.toFixed(0)}`;
    appliedSteps.momentumScore = { multiplier: 0, reason: blockReason };
    return { sizeMultiplier: 0, blocked, blockReason, scalingReasons: [...scalingReasons, blockReason], appliedSteps };
  } else if (absScore < config.MOMENTUM_SCORE.MODERATE_SCORE_THRESHOLD && isConfirmedState) {
    // Only allow moderate tier for confirmed state
    sizeMultiplier *= config.MOMENTUM_SCORE.MODERATE_MULTIPLIER;
    const reason = `Partial: confirmed + moderate momentum (score=${absScore.toFixed(0)}, ${config.MOMENTUM_SCORE.MODERATE_MULTIPLIER * 100}%)`;
    scalingReasons.push(reason);
    appliedSteps.momentumScore = { multiplier: config.MOMENTUM_SCORE.MODERATE_MULTIPLIER, reason };
  } else {
    const reason = `Full: strong momentum (score=${absScore.toFixed(0)}, state=${input.momentumState})`;
    scalingReasons.push(reason);
    appliedSteps.momentumScore = { multiplier: config.MOMENTUM_SCORE.FULL_MULTIPLIER, reason };
  }
  
  // ===== STEP 3: HTF (4H) TREND ALIGNMENT =====
  if (config.HTF_ALIGNMENT.ENABLED) {
    const isCounterTrend = (input.isLong && input.trend4h === 'bearish') || 
                           (!input.isLong && input.trend4h === 'bullish');
    const isNeutral = input.trend4h === 'neutral';
    
    if (isCounterTrend) {
      sizeMultiplier *= config.HTF_ALIGNMENT.COUNTER_TREND_MULTIPLIER;
      const reason = `Counter-trend 4h: size halved (${config.HTF_ALIGNMENT.COUNTER_TREND_MULTIPLIER * 100}%)`;
      scalingReasons.push(reason);
      appliedSteps.htfAlignment = { multiplier: config.HTF_ALIGNMENT.COUNTER_TREND_MULTIPLIER, reason };
    } else if (isNeutral) {
      const htfMultiplier = absScore >= config.MOMENTUM_SCORE.MODERATE_SCORE_THRESHOLD
        ? config.HTF_ALIGNMENT.NEUTRAL_STRONG_MOMENTUM_MULTIPLIER
        : config.HTF_ALIGNMENT.NEUTRAL_WEAK_MOMENTUM_MULTIPLIER;
      sizeMultiplier *= htfMultiplier;
      const reason = `4h neutral: ${htfMultiplier * 100}% (${absScore >= config.MOMENTUM_SCORE.MODERATE_SCORE_THRESHOLD ? 'strong' : 'moderate'} momentum)`;
      scalingReasons.push(reason);
      appliedSteps.htfAlignment = { multiplier: htfMultiplier, reason };
    } else {
      appliedSteps.htfAlignment = { multiplier: 1.0, reason: `4h aligned (${input.trend4h}), no adjustment` };
    }
  }
  
  // ===== STEP 4: DIRECTIONAL RUNWAY CHECK =====
  if (config.RUNWAY.ENABLED) {
    const movePercent = input.isLong ? input.moveFromLowPercent : input.moveFromHighPercent;
    // For MICRO_TREND: distance from the OPPOSITE extreme is the projected expansion room
    // SHORT: distance from low = expansion room; LONG: distance from high = expansion room  
    const expansionRoom = input.isLong ? input.moveFromHighPercent : input.moveFromLowPercent;
    
    // NEW: Minimum expected expansion check
    // If expansion room < 0.8%, peak P&L will likely not survive fees + trailing
    if (expansionRoom < config.RUNWAY.MIN_EXPECTED_EXPANSION_PERCENT) {
      blocked = true;
      blockReason = `Blocked: insufficient expansion room (${expansionRoom.toFixed(2)}% from ${input.isLong ? 'high' : 'low'} < ${config.RUNWAY.MIN_EXPECTED_EXPANSION_PERCENT}% min expected expansion)`;
      appliedSteps.runway = { multiplier: 0, reason: blockReason };
      return { sizeMultiplier: 0, blocked, blockReason, scalingReasons: [...scalingReasons, blockReason], appliedSteps };
    }
    
    if (movePercent < config.RUNWAY.MIN_RUNWAY_PERCENT) {
      blocked = true;
      blockReason = `Blocked: insufficient runway (${movePercent.toFixed(2)}% < ${config.RUNWAY.MIN_RUNWAY_PERCENT}% min)`;
      appliedSteps.runway = { multiplier: 0, reason: blockReason };
      return { sizeMultiplier: 0, blocked, blockReason, scalingReasons: [...scalingReasons, blockReason], appliedSteps };
    } else if (movePercent < config.RUNWAY.SHORT_RUNWAY_MAX) {
      sizeMultiplier *= config.RUNWAY.SHORT_RUNWAY_MULTIPLIER;
      const reason = `Short runway: ${movePercent.toFixed(2)}% (${config.RUNWAY.SHORT_RUNWAY_MULTIPLIER * 100}%)`;
      scalingReasons.push(reason);
      appliedSteps.runway = { multiplier: config.RUNWAY.SHORT_RUNWAY_MULTIPLIER, reason };
    } else if (movePercent < config.RUNWAY.MEDIUM_RUNWAY_MAX) {
      sizeMultiplier *= config.RUNWAY.MEDIUM_RUNWAY_MULTIPLIER;
      const reason = `Medium runway: ${movePercent.toFixed(2)}% (${config.RUNWAY.MEDIUM_RUNWAY_MULTIPLIER * 100}%)`;
      scalingReasons.push(reason);
      appliedSteps.runway = { multiplier: config.RUNWAY.MEDIUM_RUNWAY_MULTIPLIER, reason };
    } else {
      const reason = `Long runway: ${movePercent.toFixed(2)}% (full size)`;
      scalingReasons.push(reason);
      appliedSteps.runway = { multiplier: config.RUNWAY.LONG_RUNWAY_MULTIPLIER, reason };
    }
  }
  
  // ===== STEP 5: ADX RESCUE (Graduated Exception) =====
  if (config.ADX_RESCUE.ENABLED) {
    const inRescueRange = input.adx >= config.ADX_RESCUE.MIN_ADX && input.adx < config.ADX_RESCUE.MAX_ADX;
    const adxRising = input.adxSlope > 0;
    const meetsRequirements = inRescueRange && 
                              (!config.ADX_RESCUE.REQUIRE_ADX_RISING || adxRising) &&
                              absScore >= config.ADX_RESCUE.MIN_MOMENTUM_SCORE &&
                              input.qualityScore >= config.ADX_RESCUE.MIN_QUALITY_SCORE;
    
    if (meetsRequirements && sizeMultiplier < config.ADX_RESCUE.RESCUE_FLOOR) {
      const oldMultiplier = sizeMultiplier;
      sizeMultiplier = config.ADX_RESCUE.RESCUE_FLOOR;
      const reason = `ADX rescue: ${(oldMultiplier * 100).toFixed(0)}% → ${config.ADX_RESCUE.RESCUE_FLOOR * 100}% (ADX=${input.adx.toFixed(1)}, rising=${adxRising}, quality=${input.qualityScore})`;
      scalingReasons.push(reason);
      appliedSteps.adxRescue = { applied: true, reason };
    } else if (inRescueRange && !meetsRequirements) {
      const missingReqs: string[] = [];
      if (config.ADX_RESCUE.REQUIRE_ADX_RISING && !adxRising) missingReqs.push('ADX not rising');
      if (absScore < config.ADX_RESCUE.MIN_MOMENTUM_SCORE) missingReqs.push(`score ${absScore.toFixed(0)} < ${config.ADX_RESCUE.MIN_MOMENTUM_SCORE}`);
      if (input.qualityScore < config.ADX_RESCUE.MIN_QUALITY_SCORE) missingReqs.push(`quality ${input.qualityScore} < ${config.ADX_RESCUE.MIN_QUALITY_SCORE}`);
      appliedSteps.adxRescue = { applied: false, reason: `Not eligible: ${missingReqs.join(', ')}` };
    } else {
      appliedSteps.adxRescue = { applied: false, reason: 'ADX not in rescue range' };
    }
  }
  
  // ===== STEP 6: MINIMUM FLOOR =====
  if (sizeMultiplier > 0 && sizeMultiplier < config.MIN_SIZE_MULTIPLIER) {
    const oldMultiplier = sizeMultiplier;
    sizeMultiplier = config.MIN_SIZE_MULTIPLIER;
    const reason = `Floor applied: ${(oldMultiplier * 100).toFixed(0)}% → ${config.MIN_SIZE_MULTIPLIER * 100}% minimum`;
    scalingReasons.push(reason);
    appliedSteps.floor = { applied: true, reason };
  }
  
  return {
    sizeMultiplier,
    blocked,
    blockReason,
    scalingReasons,
    appliedSteps,
  };
}

// ============= PHASE 1: DIRECTION REGIME CLASSIFIER =============
// Determines market regime BEFORE direction derivation to adjust gate behavior
// IMPROVEMENT: Explicitly labels market state to avoid implicit regime inference
export const DIRECTION_REGIME_PARAMS = {
  ENABLED: true,
  
  // ===== REGIME DETECTION THRESHOLDS =====
  STRONG_TREND_ADX: 30,         // ADX >= 30 = STRONG_TREND
  EARLY_TREND_ADX: 18,          // ADX 18-30 = EARLY_TREND
  RANGE_ADX_MAX: 18,            // ADX < 18 = RANGE
  EXHAUSTION_ADX: 45,           // ADX > 45 = check for exhaustion
  EXHAUSTION_SLOPE_THRESHOLD: 0, // ADX slope <= 0 = exhausted (not accelerating)
  
  // ===== REGIME-SPECIFIC TIER 1 THRESHOLD RELAXATION =====
  // Lower weighted sum threshold for specific regimes
  STRONG_TREND: {
    relaxTier1Threshold: 0.40,     // Lower from 0.55 to 0.40
    suppressStochImportance: true, // StochRSI becomes bonus, not requirement
    momentumOverrideEnabled: true,
  },
  EARLY_TREND: {
    relaxTier1Threshold: 0.45,     // Lower from 0.55 to 0.45
    suppressStochImportance: false,
    momentumOverrideEnabled: true,
  },
  RANGE: {
    relaxTier1Threshold: 0.55,     // Standard threshold
    suppressStochImportance: false,
    momentumOverrideEnabled: false,
  },
  EXHAUSTION: {
    relaxTier1Threshold: 0.45,     // Allow counter-trend
    suppressStochImportance: true, // StochRSI extremes expected
    momentumOverrideEnabled: false,// Don't override exhausted trends
  },
} as const;

export type DirectionRegime = 'STRONG_TREND' | 'EARLY_TREND' | 'RANGE' | 'EXHAUSTION';

// ============= PHASE 2: TIER 2 WEIGHTED CONFIRMATION =============
// Converts Tier 2 (Momentum Override) from 5-factor AND gate to weighted scoring
// IMPROVEMENT: Human traders use 2-3 factors, not all 5
export const TIER2_WEIGHTED_CONFIRMATION = {
  ENABLED: true,
  
  // ===== POINT VALUES =====
  MOMENTUM_STRONG_POINTS: 2,    // score > 35 = +2
  MOMENTUM_WEAK_POINTS: 1,      // score > 20 = +1
  ORDER_FLOW_ALIGNED_POINTS: 2, // Order flow aligns with momentum = +2
  STOCH_EXTREME_POINTS: 1,      // StochRSI at extreme (bonus, not required) = +1
  SLOPE_POSITIVE_POINTS: 1,     // Momentum slope positive = +1
  HTF_ALIGNED_POINTS: 1,        // 4h trend aligns = +1 (bonus)
  
  // ===== THRESHOLDS PER REGIME =====
  STRONG_TREND_MIN_SCORE: 3,    // Relaxed: only 3 of 7 points needed
  EARLY_TREND_MIN_SCORE: 3,     // Relaxed: only 3 of 7 points needed
  NORMAL_MIN_SCORE: 4,          // Standard: 4 of 7 points needed
  RANGE_MIN_SCORE: 5,           // Stricter: 5 of 7 for ranging markets
  
  // ===== POSITION SIZING BASED ON SCORE =====
  SCORE_3_POSITION_MULT: 0.55,  // Just met threshold
  SCORE_4_POSITION_MULT: 0.65,  // Moderate confirmation
  SCORE_5_POSITION_MULT: 0.75,  // Good confirmation
  SCORE_6_POSITION_MULT: 0.85,  // Strong confirmation
  SCORE_7_POSITION_MULT: 0.90,  // Full confirmation
  
  // ===== CONFIDENCE CALCULATION =====
  BASE_CONFIDENCE: 50,
  MAX_CONFIDENCE: 70,
  CONFIDENCE_PER_POINT: 3,      // +3 confidence per point
} as const;

// ============= PHASE 4: DIRECTIONAL BIAS ESCAPE HATCH =============
// Final safety valve when all tiers fail but momentum is clearly building
// IMPROVEMENT: Prevents paralysis during regime transitions
export const DIRECTIONAL_BIAS_ESCAPE_PARAMS = {
  ENABLED: true,
  
  // ===== CONDITIONS (all must be true) =====
  HTF_NEUTRAL_REQUIRED: true,           // 4h must be neutral
  MOMENTUM_RISING_BARS: 3,              // Momentum score rising for 3+ bars
  ORDER_FLOW_NOT_OPPOSING: true,        // Order flow NOT in opposite direction
  
  // ===== MOMENTUM MAGNITUDE REQUIREMENT =====
  MIN_MOMENTUM_MAGNITUDE: 15,           // |score| >= 15 (lower than fallback)
  MOMENTUM_RISING_THRESHOLD: 5,         // Score must have increased by 5+ over bars
  
  // ===== POSITION SIZING (very conservative) =====
  ESCAPE_POSITION_MULTIPLIER: 0.45,     // 45% position size max
  
  // ===== CONFIDENCE =====
  ESCAPE_BASE_CONFIDENCE: 45,
  ESCAPE_MAX_CONFIDENCE: 55,
} as const;

// ============= MOMENTUM OVERRIDE DIRECTION PARAMS =============
// HIGH PRIORITY: When momentum conditions are met, OVERRIDE the 30m trend direction
// This allows LONG signals when momentum is bullish even if 30m trend is bearish
// UPDATED: Now uses weighted confirmation in trending regimes
export const MOMENTUM_OVERRIDE_DIRECTION_PARAMS = {
  // Enable this momentum override mechanism
  ENABLED: true,
  
  // ===== MOMENTUM SCORE THRESHOLDS =====
  // Minimum momentum score to trigger override (positive for LONG)
  MIN_MOMENTUM_SCORE: 20,           // score > 20 for LONG override
  // Strong momentum for enhanced confidence
  STRONG_MOMENTUM_SCORE: 35,        // score >= 35 = strong signal
  
  // ===== MOMENTUM SLOPE REQUIREMENT =====
  // Momentum must be INCREASING (slope > 0) to confirm direction
  MIN_MOMENTUM_SLOPE: 0,            // macdSlope > 0 = momentum accelerating
  
  // ===== ORDER FLOW REQUIREMENTS =====
  // Order flow must align with momentum direction
  MIN_ORDER_FLOW_SCORE: 45,         // Order flow must be >= 45
  STRONG_ORDER_FLOW_SCORE: 60,      // >= 60 = strong confirmation
  
  // ===== STOCHRSI OVERSOLD/OVERBOUGHT =====
  // PHASE 3 UPDATE: StochRSI is regime-gated (bonus in trends, required in ranges)
  STOCHRSI_OVERSOLD_THRESHOLD: 25,  // K <= 25 favors LONG override
  STOCHRSI_OVERBOUGHT_THRESHOLD: 75, // K >= 75 favors SHORT override
  // Regimes where StochRSI is a REQUIREMENT
  STOCHRSI_REQUIRED_IN_REGIME: ['RANGE'] as DirectionRegime[],
  // Regimes where StochRSI is just a BONUS
  STOCHRSI_BONUS_IN_REGIME: ['STRONG_TREND', 'EARLY_TREND', 'EXHAUSTION'] as DirectionRegime[],
  STOCHRSI_BONUS_CONFIDENCE: 5,     // +5 confidence if StochRSI confirms in bonus mode
  
  // ===== ADX BLOCKING CONDITION =====
  // Block override if 30m has established strong trend (ADX > 30 AND rising)
  // This prevents fighting a confirmed 30m trend
  BLOCK_IF_30M_ADX_ABOVE: 30,       // If 30m ADX > 30...
  BLOCK_IF_ADX_SLOPE_ABOVE: 0,      // ...AND slope > 0, BLOCK override
  
  // ===== POSITION SIZING =====
  BASE_POSITION_MULTIPLIER: 0.60,   // 60% of normal for override entries
  STRONG_POSITION_MULTIPLIER: 0.75, // 75% when all conditions strongly met
  
  // ===== CONFIDENCE CALCULATION =====
  BASE_CONFIDENCE: 55,
  MAX_CONFIDENCE: 70,
} as const;

// ============= EXHAUSTION REVERSAL OVERRIDE PARAMS =============
// HIGH PRIORITY (0.25): Detects extreme exhaustion (deep oversold/overbought) and overrides direction
// This captures bounce setups that lagging HTF trend labels miss
// Runs BEFORE Tier 2 Momentum Override to catch mean-reversion opportunities
export const EXHAUSTION_REVERSAL_OVERRIDE_PARAMS = {
  ENABLED: true,
  
  // ===== STOCHRSI THRESHOLDS =====
  // StochRSI 4h K thresholds for exhaustion detection
  LONG_K_THRESHOLD: 10,           // K <= 10 for LONG override (deep oversold)
  SHORT_K_THRESHOLD: 90,          // K >= 90 for SHORT override (deep overbought)
  
  // ===== ABSOLUTE EXTREME STOCHRSI (K >= 98 or K <= 2) =====
  // When K is at absolute statistical extreme, allow exhaustion override in EARLY_TREND regime
  // This addresses the regime-exhaustion coupling error where exhaustion can occur BEFORE
  // ADX reaches full EXHAUSTION classification
  ABSOLUTE_EXTREME_ENABLED: true,
  ABSOLUTE_EXTREME_K_HIGH: 98,    // K >= 98 = absolute overbought (SHORT)
  ABSOLUTE_EXTREME_K_LOW: 2,      // K <= 2 = absolute oversold (LONG)
  ABSOLUTE_EXTREME_MAX_ADX: 22,   // Only in early trend (ADX < 22)
  ABSOLUTE_EXTREME_MAX_SLOPE: 0.15, // Momentum slope must be flattening (< 0.15)
  ABSOLUTE_EXTREME_POSITION_MULT: 0.30, // 30% position for early-trend exhaustion
  
  // ===== CONTEXTUAL EXHAUSTION (K 95-97 / K 3-5) =====
  // K 95-97 is extreme extension but NOT absolute exhaustion
  // Allow exhaustion override in EARLY_TREND only with stricter conditions:
  // - K >= 95 (or K <= 5)
  // - ADX < 22 (not strong trend)
  // - Momentum slope flattening OR decelerating (evidence of impulse energy loss)
  // This captures early impulse exhaustion WITHOUT misclassifying strong trends
  CONTEXTUAL_EXTREME_ENABLED: true,
  CONTEXTUAL_EXTREME_K_HIGH: 95,   // K >= 95 = contextual overbought (need extra evidence)
  CONTEXTUAL_EXTREME_K_LOW: 5,     // K <= 5 = contextual oversold (need extra evidence)
  CONTEXTUAL_EXTREME_MAX_ADX: 22,  // Only in early trend (ADX < 22)
  CONTEXTUAL_EXTREME_MAX_SLOPE: 0.10, // Stricter slope requirement (must be clearly flattening)
  CONTEXTUAL_EXTREME_REQUIRE_DECEL: true, // Require momentum deceleration evidence
  CONTEXTUAL_EXTREME_POSITION_MULT: 0.25, // 25% position (more conservative than absolute)
  
  // ===== BOLLINGER %B THRESHOLDS =====
  // Price position relative to Bollinger Bands
  LONG_PERCENT_B_THRESHOLD: 20,   // %B <= 20 (at/below lower band)
  SHORT_PERCENT_B_THRESHOLD: 80,  // %B >= 80 (at/near upper band)
  
  // ===== ADX HIGH + DECLINING (ALTERNATIVE EXHAUSTION PATH) =====
  // ADX > 45 with declining slope indicates trend exhaustion even without extreme StochRSI
  ADX_HIGH_EXHAUSTION_ENABLED: true,
  ADX_HIGH_THRESHOLD: 45,         // ADX > 45 = high (potential exhaustion)
  ADX_DECLINING_SLOPE: 0,         // Slope < 0 = declining (trend losing steam)
  
  // ===== MOMENTUM REQUIREMENTS =====
  // For LONG: score > 20 OR MACD improving
  // For SHORT: score < -20 OR MACD declining
  REQUIRE_MOMENTUM_CONFIRMATION: true,
  MIN_MOMENTUM_SCORE: 20,         // Minimum |momentum| for confirmation (tightened from 0)
  MACD_IMPROVING_COUNTS: true,    // MACD histogram improving counts as confirmation
  
  // ===== ADX REQUIREMENTS =====
  // ADX must NOT be accelerating (prevents catching falling knives)
  MAX_ADX_SLOPE: 0.05,            // ADX slope must be <= 0.05
  
  // ===== ORDER FLOW REQUIREMENTS =====
  // Order flow must align with direction
  MIN_ORDER_FLOW_SCORE: 60,       // Minimum score for order flow bonus (tightened from 50)
  
  // ===== EXPANSION/BREAKOUT BLOCKING =====
  // Block override during active expansion (volume spike or squeeze release)
  BLOCK_ON_EXPANSION: true,
  MAX_VOLUME_RATIO: 1.8,          // Block if volume ratio > 1.8
  BLOCK_ON_SQUEEZE_RELEASE: true, // Block if squeeze just released
  
  // ===== SHORT-SPECIFIC RESTRICTIONS =====
  // Extra protection against shorting into strong uptrends
  SHORT_BLOCK_IF_4H_BULLISH_CONF: 70, // Block SHORT if 4h bullish >= 70%
  
  // ===== POSITION SIZING =====
  BASE_POSITION_MULTIPLIER: 0.40,      // 40% base
  MOMENTUM_CONFIRMED_MULTIPLIER: 0.50, // 50% with momentum confirmation
  STRONG_SETUP_MULTIPLIER: 0.55,       // 55% with momentum + order flow
  
  // ===== CONFIDENCE CALCULATION =====
  BASE_CONFIDENCE: 55,
  MOMENTUM_CONFIRMS_BONUS: 5,
  ORDER_FLOW_ALIGNED_BONUS: 5,
  MACD_IMPROVING_BONUS: 5,
  MAX_CONFIDENCE: 70,
  
  // ===== LOGGING =====
  LOG_OVERRIDES: true,
  LOG_SKIPS: true,
} as const;

// ============= MOMENTUM FALLBACK DIRECTION PARAMS =============
// LOWER PRIORITY: When timeframe trends conflict or are neutral, use momentum + order flow
// This is the fallback after all other direction methods fail
export const MOMENTUM_FALLBACK_DIRECTION_PARAMS = {
  // Enable this fallback mechanism
  ENABLED: true,
  
  // ===== MOMENTUM SCORE THRESHOLDS =====
  // Minimum absolute momentum score to derive direction
  MIN_MOMENTUM_SCORE: 20,           // |score| >= 20 to derive direction
  // Strong momentum threshold for higher confidence
  STRONG_MOMENTUM_SCORE: 35,        // |score| >= 35 = strong signal
  
  // ===== ORDER FLOW REQUIREMENTS =====
  // Minimum order flow score to support momentum direction
  MIN_ORDER_FLOW_SCORE: 50,         // Order flow must be >= 50
  // Strong order flow for confirmation
  STRONG_ORDER_FLOW_SCORE: 65,      // >= 65 = strong confirmation
  
  // ===== STOCHRSI CONTEXT =====
  // If StochRSI is extreme AND momentum confirms, boost confidence
  STOCHRSI_EXTREME_OVERSOLD: 15,    // K <= 15 = oversold context for LONG
  STOCHRSI_EXTREME_OVERBOUGHT: 85,  // K >= 85 = overbought context for SHORT (mean reversion)
  
  // ===== ADX REQUIREMENTS =====
  // Minimum ADX for momentum fallback (still need some trend structure)
  MIN_ADX: 18,
  
  // ===== POSITION SIZING =====
  // Reduced position for momentum-derived entries
  BASE_POSITION_MULTIPLIER: 0.55,   // 55% of normal
  STRONG_POSITION_MULTIPLIER: 0.70, // 70% when both momentum + order flow are strong
  
  // ===== CONFIDENCE CALCULATION =====
  // Base confidence for momentum fallback
  BASE_CONFIDENCE: 50,
  // Maximum confidence achievable
  MAX_CONFIDENCE: 65,
} as const;

// ============= MOMENTUM SLOPE GATE (PRIORITY 1 - NO ADX OVERRIDE) =============
// CRITICAL ARCHITECTURE FIX: Prevents entries when momentum is ACCELERATING in opposing direction
// This gate addresses the fundamental bug where ADX strength was used to override directional momentum
// ADX answers "Is there trend strength?" - NOT "Should we enter?"
// High ADX + accelerating opposing momentum = STRONGER block, not weaker
export const MOMENTUM_SLOPE_GATE = {
  ENABLED: true,
  
  // ===== BLOCK THRESHOLDS =====
  // Block counter-momentum entries when momentum is ACCELERATING
  // Momentum slope > 0 = bullish acceleration, < 0 = bearish acceleration
  
  // For SHORT: block if momentum slope > this (bullish acceleration)
  BLOCK_SHORT_IF_SLOPE_ABOVE: 0,
  // For LONG: block if momentum slope < this (bearish acceleration)  
  BLOCK_LONG_IF_SLOPE_BELOW: 0,
  
  // ===== MINIMUM OPPOSING SCORE TO TRIGGER =====
  // Only check slope when momentum is already opposing
  // Below this threshold, momentum is considered neutral (slope check not needed)
  MIN_OPPOSING_SCORE_FOR_SLOPE_CHECK: 15,
  
  // ===== ARCHITECTURAL FIX =====
  // ADX does NOT override this gate (this is the key architectural fix)
  // High ADX with accelerating opposing momentum = STRONGER block, not weaker
  ADX_AMPLIFIES_NOT_OVERRIDES: true,
  
  // ===== DECELERATION EXCEPTION =====
  // If momentum is DECELERATING (slope opposite to score direction), allow entry with reduced size
  // e.g., Score = +30 (bullish) but slope = -0.05 (decelerating) - momentum is losing steam
  DECELERATING_MOMENTUM_POSITION_MULTIPLIER: 0.50,
  
  LOG_GATE_CHECKS: true,
} as const;

// ============= LTF SPIKE PROTECTION GATE (PRIORITY 2 - NO ADX OVERRIDE) =============
// Prevents entering at momentum climax candles (15m StochRSI extremes)
// When 15m StochRSI > 95 and momentum aligns with spike, this is a climax candle, not early exhaustion
export const LTF_SPIKE_PROTECTION_GATE = {
  ENABLED: true,
  
  // ===== 15M STOCHRSI THRESHOLDS =====
  // Block SHORT if 15m K > this (bullish momentum spike, not exhaustion)
  BLOCK_SHORT_IF_15M_K_ABOVE: 95,
  // Block LONG if 15m K < this (bearish momentum spike)
  BLOCK_LONG_IF_15M_K_BELOW: 5,
  
  // ===== EXCEPTION CONDITIONS =====
  // Only block if momentum is aligned with spike direction (not a valid reversal setup)
  // This prevents blocking valid exhaustion reversals where we WANT to fade the spike
  REQUIRE_MOMENTUM_ALIGNED_WITH_SPIKE: true,
  
  // ADX slope must be rising (trend still accelerating, not exhausted)
  REQUIRE_ADX_SLOPE_RISING: true,
  MIN_ADX_SLOPE_FOR_BLOCK: 0,
  
  // ===== REDUCED POSITION ALTERNATIVE =====
  // For now, use hard block. Set to true to allow reduced position instead.
  ALLOW_REDUCED_POSITION: false,
  REDUCED_POSITION_MULTIPLIER: 0.25,
  
  LOG_GATE_CHECKS: true,
} as const;

// ============= LTF CONFIRMATION GATE =============
// Requires lower timeframe (1h or 30m) confirmation for continuation entries
// Prevents entries where HTF (4h) is directional but LTF shows exhaustion/neutrality
// This addresses the "trend continuation misclassification" problem at 24h extremes
export const LTF_CONFIRMATION_GATE = {
  // Enable this gate
  ENABLED: true,
  
  // ===== WHEN TO APPLY =====
  // Only apply when 4h is strongly directional (not neutral)
  REQUIRE_STRONG_4H: true,
  MIN_4H_CONFIDENCE: 55,
  
  // ===== LTF NEUTRALITY CHECK =====
  // If BOTH 1h and 30m are neutral, this is a warning sign
  // Block or reduce position for continuation entries
  BLOCK_IF_BOTH_LTF_NEUTRAL: true,
  
  // ===== GRADUATED POSITION SIZING (TIGHTENED) =====
  // Instead of binary block, use graduated sizing based on LTF alignment
  SIZING: {
    // 4h bearish + 1h/30m bearish = full size
    FULL_ALIGNMENT: 1.0,
    // 4h bearish + 1h neutral + 30m bearish = 70%
    PARTIAL_ALIGNMENT: 0.70,
    // 4h bearish + 1h neutral + 30m neutral = 25% (was 35%, tightened)
    NO_ALIGNMENT: 0.25,
    // 4h bearish + 1h/30m bullish = BLOCK
    COUNTER_ALIGNMENT_BLOCK: true,
  },
  
  // ===== ADX THRESHOLDS =====
  // Only apply LTF check when 4h ADX is above this (strong trend context)
  MIN_ADX_FOR_CHECK: 25,
  // Above this ADX, require stricter LTF alignment
  STRICT_ADX_THRESHOLD: 45,
  
  // ===== NEW: BLOCK WHEN BOTH LTF NEUTRAL + MOMENTUM OPPOSING =====
  // If both 1h/30m are neutral AND momentum is opposing, BLOCK entirely (not just reduce)
  // This is the double-warning signal that was missed in BNBUSDT
  BLOCK_WHEN_MOMENTUM_ALSO_OPPOSING: true,
  MOMENTUM_OPPOSING_THRESHOLD: 15,  // |score| > 15 in opposing direction
  
  // ===== LOGGING =====
  LOG_GATE_CHECKS: true,
} as const;

// ============= NEAR-LOW/HIGH PROTECTION GATE =============
// Prevents continuation entries when price is too close to 24h extremes
// Shorts near 24h low have poor R:R and high bounce probability
// Longs near 24h high have poor R:R and high pullback probability
export const NEAR_EXTREME_PROTECTION_GATE = {
  // Enable this gate
  ENABLED: true,
  
  // ===== PROXIMITY THRESHOLDS (DEFAULT) =====
  // Block/reduce SHORTs when price is within this % of 24h low
  SHORT_NEAR_LOW_THRESHOLD_PERCENT: 2.5,
  // Block/reduce LONGs when price is within this % of 24h high
  LONG_NEAR_HIGH_THRESHOLD_PERCENT: 2.5,
  
  // ===== HARD ZONE (DEFAULT) =====
  // Full block if in hard zone (even closer to extreme)
  HARD_ZONE_THRESHOLD_PERCENT: 1.5,
  BLOCK_IN_HARD_ZONE: true,
  
  // ===== STRONG TREND RELAXATION =====
  // Similar to MOVE_EXHAUSTION: relax thresholds during strong trending regimes
  // Prevents over-rejection of high-conviction continuation moves
  STRONG_TREND_RELAXATION: {
    ENABLED: true,
    // Conditions to trigger relaxation (any one of these)
    MIN_ADX_FOR_RELAXATION: 28,           // Strong trend energy
    BOLLINGER_SQUEEZE_TRIGGER: true,       // BB compression indicates breakout potential
    BOLLINGER_BREAKDOWN_TRIGGER: true,     // Price outside bands
    BOLLINGER_BREAKDOWN_SHORT_MAX_B: 15,   // %B <= 15 for SHORT breakdown
    BOLLINGER_BREAKDOWN_LONG_MIN_B: 85,    // %B >= 85 for LONG breakout
    
    // Safety: Don't relax if ADX slope is sharply declining
    MAX_ADX_SLOPE_DECLINE: -1.0,
    
    // Relaxed thresholds
    RELAXED_SOFT_THRESHOLD_PERCENT: 3.5,   // Expanded from 2.5% to 3.5%
    RELAXED_HARD_ZONE_PERCENT: 2.0,        // Expanded from 1.5% to 2.0%
    
    // Position sizing in relaxed zones
    RELAXED_SOFT_MULTIPLIER: 0.45,         // Soft zone: 45% (vs 25% default)
    RELAXED_TRANSITION_MULTIPLIER: 0.35,   // Between hard and soft: 35%
  },
  
  // ===== LTF OVERRIDE =====
  // Only apply protection if LTF is NOT aligned with trade direction
  // If 1h or 30m strongly supports direction, allow entry (reduced size)
  REQUIRE_LTF_MISALIGNMENT: true,
  LTF_ALIGNMENT_MIN_CONFIDENCE: 60,
  
  // ===== POSITION SIZING =====
  // When in proximity zone without LTF support
  PROXIMITY_POSITION_MULTIPLIER: 0.25,
  
  // ===== ADX EXCEPTION =====
  // Very high ADX can override (parabolic moves)
  ADX_OVERRIDE_THRESHOLD: 50,
  ADX_OVERRIDE_MULTIPLIER: 0.40,
  
  // ===== REGIME-AWARE EXTREME PROXIMITY BLOCK =====
  // Block entries very close to extremes unless in strong expansion regime
  // Addresses: shorts at 0.1-0.4% from 24h low with moderate ADX = location failure
  REGIME_AWARE_BLOCK: {
    ENABLED: true,
    // Block if distance from extreme < this AND regime is not strong
    PROXIMITY_THRESHOLD_PERCENT: 0.4,
    // Regime strength requirements to bypass the block
    MIN_ADX_TO_BYPASS: 32,
    // Momentum must be decisive (absolute score) to bypass
    MIN_MOMENTUM_SCORE_TO_BYPASS: 20,
    // Order flow must confirm breakdown to bypass
    MIN_ORDER_FLOW_SCORE_TO_BYPASS: 20,
    // If ANY of these bypass conditions met, allow with reduced size
    BYPASS_POSITION_MULTIPLIER: 0.35,
  },
  
  // ===== IMPROVEMENT #3: EXPANDED NEAR-EXTREME HARD BLOCK =====
  // Block shorts within 1.2% of 24h low unless momentum is BEARISH (not just neutral)
  // Neutral momentum = absence of confirmation, NOT confirmation
  // Addresses: 3/15 losses from near-extreme bounce shorts
  EXPANDED_HARD_BLOCK: {
    ENABLED: true,
    // Expanded hard zone for shorts near low / longs near high
    SHORT_NEAR_LOW_THRESHOLD_PERCENT: 1.2,
    LONG_NEAR_HIGH_THRESHOLD_PERCENT: 1.2,
    // Must have STRONG directional momentum to enter within this zone
    MIN_MOMENTUM_SCORE_SHORT: -25,   // momentum score must be <= -25 for SHORT
    MIN_MOMENTUM_SCORE_LONG: 25,     // momentum score must be >= 25 for LONG
    // Require momentum direction to match trade direction (neutral = NOT a pass)
    REQUIRE_DIRECTIONAL_MOMENTUM: true,
  },
  
  // ===== LOGGING =====
  LOG_GATE_CHECKS: true,
} as const;

// ============= ADX SLOPE GRADUATED GATE =============
// ADX Slope Gate v2.0: Graduated Penalty Architecture
// Philosophy: ADX slope decline = reduce exposure, not reject entry
// Only structural collapse (slope < -3.0) warrants hard blocking
// Everything else scales position size to handle uncertainty
export const ADX_SLOPE_GRADUATED_GATE = {
  ENABLED: true,
  
  // ===== HARD BLOCK: Only true structural collapse =====
  // Slope < -3.0 means ADX is collapsing rapidly — trend structure is breaking
  HARD_BLOCK_SLOPE_THRESHOLD: -3.0,
  // Direction-specific hard blocks (both at -3.0 for symmetry)
  SHORT_HARD_BLOCK_SLOPE: -3.0,
  LONG_HARD_BLOCK_SLOPE: -3.0,
  
  // ===== GRADUATED PENALTY TIERS (soft — reduce size, never block) =====
  // Tier 1: Severe decline (-3.0 to -2.0) — significant size reduction
  SEVERE_DECLINE_THRESHOLD: -2.0,
  SEVERE_DECLINE_MULTIPLIER: 0.40,
  // Tier 2: Steep decline (-2.0 to -1.0) — moderate size reduction
  STEEP_DECLINE_THRESHOLD: -1.0,
  STEEP_DECLINE_MULTIPLIER: 0.60,
  // Tier 3: Moderate decline (-1.0 to -0.2) — mild size reduction
  MODERATE_DECLINE_THRESHOLD: -0.2,
  MODERATE_DECLINE_MULTIPLIER: 0.80,
  // Tier 4: Flat/positive (>= -0.2) — no penalty
  // (handled implicitly: multiplier stays 1.0)
  
  // ===== ADX VALUE BONUS =====
  // High ADX = trend energy reservoir — improves multiplier by one tier
  HIGH_ADX_EXCEPTION_THRESHOLD: 40,
  HIGH_ADX_TIER_BONUS_MULTIPLIER: 1.25, // e.g., 0.60 * 1.25 = 0.75 (capped at 1.0)
  
  // ===== CONTINUATION REQUIREMENTS (for moderate zone, ADX 35+) =====
  // When ADX is strong but declining, LTF alignment determines if it's exhaustion or normalization
  CONTINUATION_REQUIREMENTS: {
    ENABLED: true,
    MIN_ADX: 35,
    MIN_ADX_SLOPE: 0,
    REQUIRE_LTF_ALIGNMENT: true,
    // LTF aligned: boost multiplier (trend is continuing, just normalizing)
    LTF_ALIGNED_BONUS: 1.15, // e.g., 0.60 * 1.15 = 0.69
    // No LTF alignment: additional penalty (trend may be exhausting)
    NO_LTF_PENALTY: 0.70,
    // Position multiplier when continuation passes with marginal LTF support (only 30m)
    MARGINAL_LTF_MULTIPLIER: 0.60,
    // Secondary hard block REMOVED — only slope < -3.0 is structural invalidation
    // Everything else = size scaling (architecturally clean)
    BLOCK_DECLINING_NO_LTF: false,
    BLOCK_DECLINING_NO_LTF_SLOPE_THRESHOLD: -2.0, // Kept for reference but inactive
    // Cap: bonuses cannot push multiplier above 0.9 when slope is declining
    MAX_DECLINING_SLOPE_MULTIPLIER: 0.90,
  },
  
  // ===== GRADUATED POSITIVE SLOPE TIERING FOR LONGS =====
  LONG_POSITIVE_SLOPE_TIERS: {
    ENABLED: true,
    FULL_SIZE_MIN_SLOPE: 0.3,
    FULL_SIZE_MULTIPLIER: 1.0,
    STABILIZING_MIN_SLOPE: 0.0,
    STABILIZING_MULTIPLIER: 0.60,
  },
  
  // ===== BOLLINGER BREAKDOWN OVERRIDE =====
  // Additional bonus for price-at-extreme entries (unchanged)
  BOLLINGER_BREAKDOWN_OVERRIDE: {
    ENABLED: true,
    SHORT_MAX_PERCENT_B: 20,
    LONG_MIN_PERCENT_B: 80,
    SHORT_MAX_STOCHRSI_K: 85,
    SHORT_MIN_STOCHRSI_K: 15,
    LONG_MIN_STOCHRSI_K: 15,
    LONG_MAX_STOCHRSI_K: 85,
    POSITION_MULTIPLIER: 0.55,
    MIN_ADX_FOR_OVERRIDE: 20,
  },
  
  // ===== REDUCE_POSITION_SLOPE_THRESHOLD (legacy compat) =====
  REDUCE_POSITION_SLOPE_THRESHOLD: -0.2,
  
  LOG_GATE_CHECKS: true,
} as const;

// ============= 1H CONFIRMATION GATE FOR HIGH ADX =============
// Data shows: 12 BE trades had ADX >= 55 but 10/12 had 1h = neutral
// Key differentiator: Profitable high-ADX trades had 1h confirmation
export const HIGH_ADX_1H_CONFIRMATION_GATE = {
  ENABLED: true,
  
  // Only apply when ADX is in the "should work" zone
  MIN_ADX_FOR_CHECK: 55,
  
  // Require 1h to NOT be neutral for full position
  // If 1h is neutral at high ADX, we're entering when momentum hasn't reached LTF yet
  REQUIRE_1H_NON_NEUTRAL: true,
  
  // Position sizing when 1h is neutral despite high ADX
  NEUTRAL_1H_POSITION_MULTIPLIER: 0.40,
  
  // Exception: If 30m is strongly aligned, allow partial size
  ALLOW_30M_EXCEPTION: true,
  EXCEPTION_30M_MULTIPLIER: 0.60,
  
  LOG_GATE_CHECKS: true,
} as const;

// ============= STOCHRSI RUNWAY FILTER =============
// Data shows: 75% of BE shorts entered with StochRSI < 40 (limited downside runway)
// Apply conditionally: only when ADX slope declining OR LTF neutral
export const STOCHRSI_RUNWAY_GATE = {
  ENABLED: true,
  
  // ===== RUNWAY THRESHOLDS =====
  // For SHORTs: require StochRSI above this to ensure downside runway
  SHORT_MIN_STOCHRSI_FOR_RUNWAY: 30,
  // For LONGs: require StochRSI below this to ensure upside runway
  LONG_MAX_STOCHRSI_FOR_RUNWAY: 70,
  
  // ===== CONDITIONAL APPLICATION =====
  // Only apply when one of these conditions is true:
  // 1. ADX slope is declining (< 0)
  // 2. BOTH LTF (1h and 30m) are neutral
  REQUIRE_DECLINING_ADX_OR_LTF_NEUTRAL: true,
  ADX_SLOPE_DECLINING_THRESHOLD: 0,
  
  // ===== POSITION SIZING =====
  // Instead of hard block, reduce position when runway is limited
  LIMITED_RUNWAY_MULTIPLIER: 0.35,
  
  // ===== EXCEPTION =====
  // Very high ADX can override (momentum continuation)
  HIGH_ADX_EXCEPTION_THRESHOLD: 60,
  
  LOG_GATE_CHECKS: true,
} as const;

// ============= TREND CONTINUATION PULLBACK REGIME =============
// NEW: Addresses "Too strong to fade, too extended to buy" deadlock
// Allows pullback re-entries during strong trends after missing initial entry
// Philosophy: "If you can't enter at the start, wait for the first pullback"
export const TREND_CONTINUATION_PULLBACK_REGIME = {
  ENABLED: true,
  
  // ===== REGIME IDENTIFICATION =====
  // Active when: strong uptrend blocked by extreme overbought, now pulling back
  REGIME_TAG: 'TREND_CONTINUATION_PULLBACK',
  
  // ===== TREND STRENGTH REQUIREMENTS =====
  // Must be in a strong trend (ADX >= 30, not 40 which is too restrictive)
  MIN_ADX: 30,
  // ADX slope must be meaningfully positive (trend gaining strength)
  // REFINED: Increased from 0.0 to 0.05 - slope hovering at 0 is often trend plateau
  MIN_ADX_SLOPE: 0.05,
  // 4H trend must be directional (not neutral)
  REQUIRE_4H_DIRECTIONAL: true,
  MIN_4H_CONFIDENCE: 50,
  // 1H trend should align or be neutral
  REQUIRE_1H_NOT_OPPOSING: true,
  
  // ===== PULLBACK DETECTION (EMA-based) =====
  // Price must have pulled back to EMA zone
  EMA_PULLBACK: {
    // Check if price is near EMA20/EMA50 midline
    ENABLED: true,
    // REFINED: Dynamic proximity based on ADX strength
    // ADX < 35: use looser 0.8% (moderate trends need larger pullback zone)
    // ADX >= 35: use tighter 0.5% (strong trends have tighter structure)
    PROXIMITY_THRESHOLD_PERCENT: 0.8,  // Default/base value
    PROXIMITY_THRESHOLD_STRONG_ADX: 0.5,  // For ADX >= 35
    STRONG_ADX_THRESHOLD: 35,  // ADX level to switch to tighter proximity
    // Which EMA to use: 'EMA20', 'EMA50', or 'MIDPOINT'
    EMA_TYPE: 'MIDPOINT' as 'EMA20' | 'EMA50' | 'MIDPOINT',
    // Alternative: check if price touched EMA in last N candles
    RECENT_TOUCH_CANDLES: 3,
  },
  
  // ===== STOCHRSI COOLDOWN =====
  // Must have cooled down from overbought (for LONG) or oversold (for SHORT)
  // This ensures we're not re-entering at the same extreme
  STOCHRSI_COOLDOWN: {
    ENABLED: true,
    // For LONG: 4H StochRSI K must be below this (cooled from overbought)
    LONG_MAX_K: 80,
    // For SHORT: 4H StochRSI K must be above this (cooled from oversold)
    SHORT_MIN_K: 20,
    // 1H StochRSI can have more tolerance (it moves faster)
    LONG_1H_MAX_K: 85,
    SHORT_1H_MIN_K: 15,
  },
  
  // ===== MOVE EXHAUSTION CHECK =====
  // Even with pullback, we need some remaining runway
  // This is RELAXED from normal thresholds (allows more extended moves)
  // REFINED: Shallow pullbacks get tighter exhaustion limits
  RELAXED_MOVE_EXHAUSTION: {
    // Maximum move from swing for pullback entry (vs 5-6% normal)
    LONG_MAX_MOVE_FROM_LOW_PERCENT: 8.0,
    SHORT_MAX_MOVE_FROM_HIGH_PERCENT: 8.0,
    // Even more relaxed for very strong trends (ADX >= 40)
    VERY_STRONG_TREND_MAX_MOVE_PERCENT: 10.0,
    // REFINED: Tighten exhaustion for shallow pullbacks (< 1.5%)
    SHALLOW_PULLBACK_MAX_MOVE_PERCENT: 6.0,  // Only 6% if pullback is shallow
    SHALLOW_PULLBACK_THRESHOLD: 1.5,  // "Shallow" = less than 1.5% from EMA
  },
  
  // ===== POSITION SIZING =====
  // Conservative sizing for pullback entries
  BASE_POSITION_MULTIPLIER: 0.50,  // 50% base size
  // Boost if momentum is aligned
  MOMENTUM_ALIGNED_MULTIPLIER: 0.70,  // 70% if momentum confirms
  // Reduce further if pullback is shallow (less confirmation)
  SHALLOW_PULLBACK_MULTIPLIER: 0.40,  // 40% if pullback < 1.5%
  
  // ===== STOP LOSS =====
  // Structure-based stops for pullback entries
  // REFINED: Use MAX of ATR and EMA stops (never allow stop inside structure)
  STOP_LOSS_ATR_MULTIPLIER: 1.0,  // Tight 1.0 ATR stop
  USE_EMA_AS_STOP: true,
  EMA_STOP_BUFFER_PERCENT: 0.3,  // 0.3% below EMA
  USE_MAX_STOP: true,  // STOP = max(ATR_stop, EMA_stop) - never inside structure
  
  // ===== CONTINUATION COOLDOWN =====
  // REFINED: Prevent death-by-a-thousand-pullbacks
  // Only ONE continuation entry per symbol per trend leg
  COOLDOWN: {
    ENABLED: true,
    // Cooldown period after a continuation entry (prevents overtrading)
    COOLDOWN_HOURS: 4,  // 4 hours between continuation entries
    // Max entries per trend leg (reset on direction change or ADX < 25)
    MAX_ENTRIES_PER_LEG: 1,
    // Block if last trade was same regime and resulted in loss
    BLOCK_AFTER_LOSS: true,
    // Trend leg reset conditions
    LEG_RESET_ADX_THRESHOLD: 25,  // ADX drops below this = new leg
  },
  
  // ===== GATE BYPASS =====
  // This regime can bypass certain gates that would normally block
  BYPASSES_MOVE_EXHAUSTION: true,  // Can enter > 5% moves if pullback occurred
  BYPASSES_NEAR_EXTREME: false,    // Still respect if too close to 24h high/low
  BYPASSES_TIER_0_STOCHRSI: false, // Never bypass deep overbought/oversold
  
  // ===== LOGGING =====
  LOG_REGIME_CHECKS: true,
  LOG_PULLBACK_DETECTION: true,
} as const;

// ============= BOT HEARTBEAT MONITORING =============
// Prevents "silent failures" where bot stops running without alerting
// Tracks each strategy-analyzer execution for operational health monitoring
export const BOT_HEARTBEAT_CONFIG = {
  ENABLED: true,
  
  // ===== HEARTBEAT LOGGING =====
  LOG_HEARTBEAT: true,
  INCLUDE_REGIME_SUMMARY: true,
  
  // ===== DATABASE PERSISTENCE =====
  // Persist heartbeats to bot_heartbeat table for health monitoring
  PERSIST_TO_DB: true,
  // Keep heartbeats for 24 hours (cleanup happens in health monitor)
  HEARTBEAT_RETENTION_HOURS: 24,
  
  // ===== ALERTING THRESHOLDS =====
  // CRITICAL: No heartbeat for 30+ minutes
  ALERT_NO_HEARTBEAT_MINUTES: 30,
  // WARNING: Same no-trade state persists for X hours
  ALERT_STATE_THRESHOLDS: {
    EXTREME_OVERBOUGHT: 6,    // 6 hours
    EXTREME_OVERSOLD: 6,      // 6 hours
    COUNTER_TREND_ONLY: 8,    // 8 hours
    NO_ENERGY: 8,             // 8 hours
    MIXED_BLOCK: 12,          // 12 hours
    PULLBACK_WAITING: 10,     // 10 hours
  } as Record<string, number>,
  // Default threshold for any state not listed above
  ALERT_STATE_DEFAULT_HOURS: 12,
  
  // CRITICAL: OPERATIONAL_CONCERN triggers immediately
  ALERT_OPERATIONAL_CONCERN_IMMEDIATE: true,
  
  // ===== ALERT COOLDOWN =====
  // Prevent alert spam - minimum time between same alert type
  ALERT_COOLDOWN_MINUTES: 60,
  
  // ===== STATE PERSISTENCE TRACKING =====
  // Track how long a state has been active before alerting
  TRACK_STATE_PERSISTENCE: true,
} as const;

// ============= NO-TRADE ZONE STATE =============
// Makes "no trades" an explicit, observable state rather than an invisible outcome
export const NO_TRADE_ZONE_STATE = {
  ENABLED: true,
  
  // ===== STATE TYPES =====
  STATES: {
    PULLBACK_WAITING: 'PULLBACK_WAITING',
    EXTREME_OVERBOUGHT: 'EXTREME_OVERBOUGHT',
    EXTREME_OVERSOLD: 'EXTREME_OVERSOLD',
    COUNTER_TREND_ONLY: 'COUNTER_TREND_ONLY',
    NO_ENERGY: 'NO_ENERGY',
    MIXED_BLOCK: 'MIXED_BLOCK',
    OPERATIONAL: 'OPERATIONAL',
    OPERATIONAL_CONCERN: 'OPERATIONAL_CONCERN',
  } as Record<string, string>,
  
  // ===== CLASSIFICATION THRESHOLDS =====
  OVERBOUGHT_THRESHOLD: 95,
  OVERSOLD_THRESHOLD: 5,
  LOW_ENERGY_ADX: 18,
  
  // ===== LOGGING =====
  LOG_STATE_CLASSIFICATION: true,
  INCLUDE_IN_RESPONSE: true,
} as const;

// ============= HEALTH ALERT TYPES =============
// Alert classifications for the 3-tier alerting system
export const HEALTH_ALERT_TYPES = {
  // TIER 1: CRITICAL - System not running
  HEARTBEAT_MISSING: {
    code: 'HEARTBEAT_MISSING',
    severity: 'critical',
    subject: '🚨 CRITICAL: Trading bot heartbeat missing',
    description: 'No bot activity detected for 30+ minutes',
  },
  
  // TIER 2: WARNING - System stuck in a state too long
  STATE_PROLONGED: {
    code: 'STATE_PROLONGED',
    severity: 'warning',
    subject: '⚠️ WARNING: Bot stuck in no-trade state',
    description: 'Same no-trade state persisting beyond threshold',
  },
  
  // TIER 3: CRITICAL - Logic failure (running but doing nothing)
  OPERATIONAL_CONCERN: {
    code: 'OPERATIONAL_CONCERN',
    severity: 'critical',
    subject: '🚨 LOGIC FAILURE: No signals AND no rejections',
    description: 'Bot running but not processing - check data feeds',
  },
} as const;

// ============= GRADUATED QUALITY GATE (execute-trade) =============
// Centralized thresholds for the graduated quality scoring system
// Used in execute-trade to apply position reductions for borderline quality scores
export const GRADUATED_QUALITY_GATE = {
  // Hard minimum quality score - trades below this are always blocked
  HARD_MIN: 55,
  // Soft zone upper bound - scores between HARD_MIN and this get 30% position reduction
  SOFT_ZONE_UPPER: 60,
  // Position reduction percentages for each zone
  SOFT_ZONE_REDUCTION_PERCENT: 30,      // 55-60 zone
  BORDERLINE_REDUCTION_PERCENT: 15,     // 60-threshold zone
  // ADX-based quality relaxation tiers
  ADX_RELAXATION: {
    ULTRA_STRONG_ADX: 50,     // ADX >= 50 → 5pt relaxation
    ULTRA_STRONG_RELAX: 5,
    STRONG_ADX: 40,           // ADX >= 40 → 3pt relaxation
    STRONG_RELAX: 3,
  },
} as const;

// ============= ADAPTIVE TREND ENTRY THRESHOLDS (strategy-analyzer) =============
// Used by Phase 3 Adaptive Trend Entry in strategy-analyzer
// These are more permissive than standard thresholds since all gates have already passed
export const ADAPTIVE_ENTRY_THRESHOLDS = {
  MIN_QUALITY: 55,
  MIN_HTF_CONFIDENCE: 55,
  MAX_REVERSAL_SCORE: 45,
  // Graduated position sizing by quality + ADX
  SIZING: {
    HIGH_QUALITY_STRONG_TREND: { minQuality: 75, minAdx: 30, multiplier: 0.85 },
    HIGH_QUALITY:              { minQuality: 70, multiplier: 0.75 },
    GOOD_QUALITY:              { minQuality: 65, multiplier: 0.65 },
    ABOVE_AVERAGE:             { minQuality: 60, multiplier: 0.55 },
    BASELINE:                  { multiplier: 0.45 },
  },
} as const;

// ============= RSI ZONE THRESHOLDS =============
// Centralized RSI thresholds used across scoring and pullback detection
export const RSI_ZONE_THRESHOLDS = {
  // Directional bias zones (scoring.ts micro-structure)
  BULLISH_HINT: 50,        // RSI > 50 with bullish MACD = bullish hint
  BEARISH_HINT: 50,        // RSI < 50 with bearish MACD = bearish hint
  MILD_BULLISH: 55,        // RSI > 55 alone = mild bullish hint
  MILD_BEARISH: 45,        // RSI < 45 alone = mild bearish hint
  // Pullback detection zone (strategy-analyzer)
  PULLBACK_ZONE_LOW: 40,   // RSI > 40 = possible pullback
  PULLBACK_ZONE_HIGH: 60,  // RSI < 60 = possible pullback
} as const;

// ============= DYNAMIC REVERSAL EXIT THRESHOLDS (monitor-positions) =============
// Controls the adaptive reversal risk threshold for position exit decisions
export const DYNAMIC_REVERSAL_EXIT = {
  BASE_THRESHOLD: 60,
  // ADX-based adjustments
  ADX_EXCEPTIONAL_BONUS: 10,     // ADX >= EXCEPTIONAL → +10
  ADX_STRONG_BONUS: 5,           // ADX >= STRONG → +5
  ADX_WEAK_PENALTY: -5,          // ADX < MINIMUM → -5
  // Volume adjustments
  VOLUME_CONFIRM_BONUS: 5,       // volumeScore >= 7 → +5
  VOLUME_CONFIRM_MIN_SCORE: 7,
  VOLUME_WEAK_PENALTY: -5,       // volumeScore <= 2 + weak ADX → -5
  VOLUME_WEAK_MAX_SCORE: 2,
  // Confidence penalty adjustment
  CONFIDENCE_PENALTY_THRESHOLD: -10,  // confidencePenalty < this → -5
  CONFIDENCE_PENALTY_ADJ: -5,
  // Final clamp bounds
  CLAMP_MIN: 50,
  CLAMP_MAX: 85,
} as const;

// ============= COMPRESSION TRADE EXIT (monitor-positions) =============
// Special exit rules for Compression Scalp strategy entries
export const COMPRESSION_TRADE_EXIT = {
  MAX_HOLD_MINUTES: 120,         // 2 hours max hold for range trades
  ADX_REGIME_SHIFT_THRESHOLD: 28, // ADX > this = trend energy returning
  ATR_EXPANSION_THRESHOLD: 1.8,  // ATR% > this = volatility returning
} as const;

// ============= STRATEGY EXIT ADJUSTMENTS (monitor-positions) =============
// Per-strategy-type reversal threshold adjustments
export const STRATEGY_EXIT_ADJUSTMENTS = {
  MOMENTUM: {
    BASE_ADJ: -8,                // Lower threshold = exit sooner
    DIVERGENCE_PENALTY: -5,      // Extra penalty on MACD divergence
    DIVERGENCE_EXIT_PNL_THRESHOLD: -0.3,  // Only emergency exit below this P&L
  },
  MEAN_REVERSION: {
    BASE_ADJ: 10,                // Higher threshold = more patience
    STRONG_TREND_PENALTY: -5,    // Strong ADX = MR thesis may be wrong
  },
  TREND_FOLLOWING: {
    BASE_ADJ: 5,                 // Patient exits
  },
  GRID_RANGE: {
    BASE_ADJ: -5,                // Quick exits for small gains
  },
} as const;

// ============= HTF ALIGNMENT EXIT ADJUSTMENTS (monitor-positions) =============
// True Alignment v2.0-based exit threshold and trailing distance adjustments
export const HTF_ALIGNMENT_EXIT = {
  // Premium alignment (strong 4H + 1H + ADX) WITH position aligned
  PREMIUM_ALIGNED: { thresholdAdj: 8, trailingMult: 1.15 },
  // Premium alignment but COUNTER to position
  PREMIUM_COUNTER: { thresholdAdj: -10, trailingMult: 0.85 },
  // Weak/neutral capped alignment
  WEAK: { thresholdAdj: -5, trailingMult: 0.90 },
  // Solid alignment (4H weighted >= 20)
  SOLID: { thresholdAdj: 3, trailingMult: 1.05 },
  SOLID_MIN_TF4H_WEIGHTED: 20,
  // Volume confirmation adjustments
  VOLUME_CONFIRM_BONUS: 2,
  VOLUME_CONFIRM_MIN_WEIGHTED: 4,
  VOLUME_WEAK_PENALTY: -2,
  VOLUME_WEAK_MAX_WEIGHTED: 1.5,
  // True Alignment component thresholds for isPremium / isWeak
  PREMIUM_MIN_TF4H_WEIGHTED: 30,
  PREMIUM_MIN_TF1H_WEIGHTED: 15,
  PREMIUM_MIN_ADX_CONTRIBUTION: 15,
  WEAK_MAX_TF4H_CONFIDENCE: 40,
} as const;

// ============= TRAILING STOP INLINE PARAMS (monitor-positions) =============
// Inline trailing stop thresholds that were previously hardcoded
export const TRAILING_STOP_INLINE = {
  // Minimum trailing distance as % of current price
  MIN_TRAILING_DISTANCE_PERCENT: 1.5,
  // Aggressive stop distance from current price (for Phase 3 exit signals)
  AGGRESSIVE_STOP_DISTANCE_PERCENT: 0.5,
  // Decay velocity override in smart AITS
  DECAY_OVERRIDE_VELOCITY_THRESHOLD: 0.02,  // %/min
  DECAY_OVERRIDE_LOCK_PERCENT: 0.80,
  // Maximum adaptive lock cap
  MAX_ADAPTIVE_LOCK: 0.85,
  // Volatility grace period (minutes)
  VOLATILITY_GRACE_PERIOD_MINUTES: 5,
  // Conditional volatility exit confidence threshold
  CONDITIONAL_VOLATILITY_MIN_CONFIDENCE: 55,
} as const;

// ============= MICRO TREND EXIT PARAMS (monitor-positions) =============
// Time-bound exit rules for MICRO_TREND entry exception type
export const MICRO_TREND_EXIT = {
  MAX_AGE_MINUTES: 120,
  MIN_PROFIT_PERCENT: 0.3,
} as const;

// ============= HEDGE EXIT PARAMS (monitor-positions) =============
// Hedge position sizing and stop/TP parameters
export const HEDGE_EXIT_PARAMS = {
  // TP coverage = max(parentLoss * COVERAGE_MULTIPLIER, MIN_TP_PERCENT)
  TP_COVERAGE_MULTIPLIER: 1.5,
  MIN_TP_PERCENT: 1.0,
  // Fixed SL distance for hedge positions
  HEDGE_SL_PERCENT: 1.5,
} as const;

// ============= REVERSAL RISK EXIT SCORES (monitor-positions) =============
// Individual component scores for the exit reversal risk detector
export const REVERSAL_RISK_EXIT_SCORES = {
  MACD_DIVERGENCE: 25,
  MOMENTUM_WEAKENING: 15,
  LAST_CLOSE_OPPOSES: 10,
  MACD_DIRECTION_MISALIGNED: 15,
  STOCHRSI_CROSS: 25,
  STOCHRSI_EXTREME_ZONE: 15,
  TREND_1H_FLIPPED: 20,
  // Reduction factor when RSI pullback + momentum confirms
  RSI_PULLBACK_REDUCTION_FACTOR: 0.5,
} as const;

// ============= TIME STOP MULTIPLIER (monitor-positions) =============
// Time-based stop uses configured hours * this multiplier for effective limit
export const TIME_STOP_MULTIPLIER = 1.5;

// ============= PARTIAL TP LADDER (monitor-positions) =============
// Take-profit ladder distances and close percentages
export const PARTIAL_TP_LADDER = {
  TP1_DISTANCE_FRACTION: 0.33,   // 33% of TP distance
  TP2_DISTANCE_FRACTION: 0.66,   // 66% of TP distance
  TP1_CLOSE_PERCENT: 50,         // Close 50% at TP1
  TP2_CLOSE_PERCENT: 60,         // Close 60% of remaining at TP2
} as const;

// ============= DYNAMIC MAX TRADES (execute-trade) =============
// Adjusts max open trades based on recent performance
export const DYNAMIC_MAX_TRADES = {
  // Recent trades lookback
  LOOKBACK_COUNT: 10,
  MIN_TRADES_FOR_EVAL: 5,
  // High performance bonus
  HIGH_WIN_RATE_THRESHOLD: 70,
  HIGH_WIN_RATE_BONUS: 2,
  MAX_TRADES_CAP: 10,
  // Poor performance reduction
  LOW_WIN_RATE_THRESHOLD: 40,
  LOW_WIN_RATE_MULTIPLIER: 0.5,
  MIN_TRADES_FLOOR: 1,
} as const;

// ============= TRAILING DAILY LIMIT (execute-trade) =============
// Lock daily profits by tightening loss limit when in profit
export const TRAILING_DAILY_LIMIT = {
  // Lock this fraction of peak daily gains
  PEAK_LOCK_FRACTION: 0.5,
  // Minimum daily loss limit (never go below this %)
  MIN_LIMIT_PERCENT: 1.0,
} as const;

// ============= DYNAMIC CONSISTENCY THRESHOLDS (execute-trade) =============
// Context-dependent trend consistency requirements
export const DYNAMIC_CONSISTENCY = {
  NEUTRAL_STRATEGY_MIN: 40,
  STRONG_1H_ALIGNMENT_MIN: 50,
  STRONG_ADX_MIN: 55,
} as const;

// ============= VOLUME FILTER (execute-trade) =============
// 24h volume requirements to avoid illiquid markets
export const VOLUME_FILTER = {
  MAIN_PAIRS: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT'] as string[],
  MIN_QUOTE_VOLUME_MAIN: 10_000_000,   // $10M for major pairs
  MIN_QUOTE_VOLUME_OTHER: 1_000_000,   // $1M for others
  // Current period volume ratio thresholds
  MIN_VOLUME_RATIO_DEFAULT: 0.2,       // 20% of average
  // Volume spike detection (informational)
  VOLUME_SPIKE_RATIO: 2.0,
  // Confidence requirements for trend formation relaxation
  TREND_FORMATION_CONF_30M: 55,
  TREND_FORMATION_CONF_1H: 50,
} as const;

// ============= OBV FILTER (execute-trade) =============
// On-Balance Volume divergence detection thresholds
export const OBV_FILTER = {
  // Strong divergence = BLOCK trade
  STRONG_DIVERGENCE_BLOCK_PERCENT: 15,
  // Moderate divergence = WARNING only
  MODERATE_DIVERGENCE_WARN_PERCENT: 10,
  // Confirmation threshold for boost
  CONFIRMATION_PERCENT: 5,
  // Position multipliers
  CONFIRMATION_BOOST: 1.15,
  DIVERGENCE_REDUCTION: 0.85,
} as const;

// ============= VWAP FILTER (execute-trade) =============
// VWAP overextension and entry optimization thresholds
export const VWAP_FILTER = {
  // Deviation thresholds for position boost
  EXCELLENT_ENTRY_DEVIATION_PERCENT: 1.0,
  EXCELLENT_ENTRY_BOOST: 1.2,
  GOOD_ENTRY_BOOST: 1.1,
  // Moderate deviation reductions
  MODERATE_DEVIATION_PERCENT: 1.0,
  MODERATE_REDUCTION: 0.75,
  SLIGHT_DEVIATION_PERCENT: 0.5,
  SLIGHT_REDUCTION: 0.9,
  // ADX exception thresholds for overextension bypass
  ADX_EXCEPTION_THRESHOLD: 25,
  ADX_GRADUATED_MIN: 22,
  GRADUATED_MIN_QUALITY: 65,
  // Exception position multipliers
  VALID_EXCEPTION_MULTIPLIER: 0.8,
  WEAK_EXCEPTION_MULTIPLIER: 0.7,
  GRADUATED_EXCEPTION_MULTIPLIER: 0.6,
} as const;

// ============= SLIPPAGE PROTECTION (execute-trade) =============
// Pre-trade and post-trade slippage limits
export const SLIPPAGE_PROTECTION = {
  // Pre-execution: max deviation from signal entry price
  MAX_PRE_SLIPPAGE_PERCENT: 0.5,
  // Post-execution: warn threshold (order already filled)
  POST_SLIPPAGE_WARN_PERCENT: 0.3,
  // Order book spread: max bid-ask spread
  MAX_SPREAD_PERCENT: 0.1,
} as const;

// ============= MOMENTUM POSITION ADJUSTMENTS (execute-trade) =============
// Position size adjustments based on momentum state
export const MOMENTUM_POSITION_ADJ = {
  WEAK_MOMENTUM_MULTIPLIER: 0.90,
  MIXED_MOMENTUM_MULTIPLIER: 0.95,
  FAKE_BREAKOUT_MULTIPLIER: 0.85,
  GENUINE_MOMENTUM_BOOST: 1.05,
} as const;

// ============= ALIGNMENT POSITION ADJUSTMENTS (execute-trade) =============
// Position size adjustments based on True Alignment v2.0
export const ALIGNMENT_POSITION_ADJ = {
  // Premium alignment thresholds
  PREMIUM_MIN_TF4H: 30,
  PREMIUM_MIN_TF1H: 15,
  PREMIUM_MIN_ADX: 15,
  PREMIUM_MULTIPLIER: 1.10,
  // Solid alignment thresholds
  SOLID_MIN_TF4H: 25,
  SOLID_MIN_TF1H: 10,
  SOLID_MULTIPLIER: 1.05,
  // Weak alignment
  WEAK_MAX_TF4H_CONF: 40,
  WEAK_MULTIPLIER: 0.90,
} as const;

// ============= BOLLINGER POSITION ADJUSTMENTS (execute-trade) =============
// Bollinger Bands squeeze/entry position sizing
export const BOLLINGER_POSITION_ADJ = {
  DOUBLE_SQUEEZE_BOOST: 1.2,
  SINGLE_SQUEEZE_BOOST: 1.1,
  // %B thresholds
  OVERBOUGHT_PERCENT_B: 100,
  OVERBOUGHT_REDUCTION: 0.85,
  LONG_LOWER_BAND_1H: 20,
  LONG_LOWER_BAND_4H: 30,
  MEAN_REVERSION_BOOST: 1.15,
  OVERSOLD_PERCENT_B: 0,
  SHORT_UPPER_BAND_1H: 80,
  SHORT_UPPER_BAND_4H: 70,
  BREAKOUT_POTENTIAL_BOOST: 1.1,
} as const;

// ============= QUALITY BASED SIZING (execute-trade) =============
// Default position size tiers when signal lacks positionSizePercent
export const QUALITY_BASED_SIZING = {
  HIGH_QUALITY_MIN: 80,
  HIGH_QUALITY_SIZE_PERCENT: 2.0,
  MEDIUM_QUALITY_MIN: 70,
  MEDIUM_QUALITY_SIZE_PERCENT: 1.5,
  DEFAULT_SIZE_PERCENT: 1.0,
} as const;

// ============= LEGACY STRATEGY MULTIPLIERS (execute-trade) =============
// Position size multipliers for strategy types (fallback when unified risk not active)
export const LEGACY_STRATEGY_MULTIPLIERS = {
  // Momentum strategy
  MOMENTUM_STRONG_ADX_MULTIPLIER: 1.25,
  MOMENTUM_CONFIRMED_MULTIPLIER: 1.15,
  MOMENTUM_UNCONFIRMED_MULTIPLIER: 0.8,
  // Mean reversion
  MR_EXTREME_MULTIPLIER: 1.1,
  MR_STANDARD_MULTIPLIER: 0.75,
  // Trend following
  TREND_STRONG_MULTIPLIER: 1.2,
  TREND_WEAK_MULTIPLIER: 0.7,
  // Grid/range
  GRID_RANGE_MULTIPLIER: 0.6,
  // Low confidence
  LOW_CONFIDENCE_MULTIPLIER: 0.7,
} as const;

// ============= RISK REWARD FILTER (execute-trade) =============
// Minimum risk/reward ratio for trade acceptance
export const RISK_REWARD_FILTER = {
  MIN_RATIO: 1.5,
} as const;

// ============= TRADE QUALITY ESTIMATION (close-trade) =============
// Scoring weights for estimating trade quality at close time
export const TRADE_QUALITY_ESTIMATION = {
  BASELINE: 50,
  // Confidence contribution (0-20 points)
  MAX_CONFIDENCE_POINTS: 20,
  CONFIDENCE_DIVISOR: 2.5,
  CONFIDENCE_BASELINE: 50,
  // Trend consistency contribution (0-15 points)
  MAX_CONSISTENCY_POINTS: 15,
  CONSISTENCY_DIVISOR: 3.33,
  CONSISTENCY_BASELINE: 50,
  // P&L quality adjustments
  PNL_TIERS: [
    { minPercent: 1.5, points: 15 },
    { minPercent: 0.5, points: 10 },
    { minPercent: 0, points: 5 },
    { minPercent: -1, points: -5 },
    { minPercent: -2, points: -10 },
  ] as { minPercent: number; points: number }[],
  PNL_WORST_POINTS: -20,
  // Hold time adjustments
  LONG_HOLD_MINUTES: 60,
  LONG_HOLD_BONUS: 5,
  SHORT_HOLD_MINUTES: 5,
  SHORT_HOLD_PENALTY: -5,
  // Quality clamp
  MIN_QUALITY: 0,
  MAX_QUALITY: 100,
} as const;

// ============= BOLLINGER CALCULATION PARAMS (calculate-trend) =============
// Parameters for Bollinger Bands squeeze detection
export const BOLLINGER_CALC_PARAMS = {
  // Bandwidth ratio threshold for squeeze detection
  // Squeeze = current bandwidth < avgBandwidth * this ratio
  SQUEEZE_RATIO: 0.75,
} as const;

// ============= MARKET STRUCTURE VALIDATION (calculate-trend) =============
// Parameters for validating higher-high/lower-low patterns
export const MARKET_STRUCTURE_VALIDATION = {
  // Number of recent candles to analyze for structure
  LOOKBACK_BARS: 10,
  // Minimum structure score (%) to consider pattern valid
  VALID_THRESHOLD_PERCENT: 50,
} as const;

// ============= DIVERGENCE POSITION SIZING (calculate-trend) =============
// Recommended position size based on divergence type
export const DIVERGENCE_POSITION_SIZING = {
  ALIGNED_PERCENT: 100,
  PULLBACK_PERCENT: 50,
  EARLY_REVERSAL_PERCENT: 40,
} as const;

// ============= TRUE ALIGNMENT SCORING (calculate-trend) =============
// Weights and parameters for multi-timeframe alignment calculation
export const TRUE_ALIGNMENT_SCORING = {
  // Timeframe weights (must sum to 100)
  TF_4H_WEIGHT: 35,
  TF_1H_WEIGHT: 30,
  TF_30M_WEIGHT: 20,
  TF_15M_WEIGHT: 15,
  // Scoring multipliers per condition
  ALIGNED_MULTIPLIER: 0.6,
  NEUTRAL_MULTIPLIER: 0.3,
  OPPOSING_PENALTY: 0.3,
  // MACD agreement scoring
  MACD_4_AGREE_POINTS: 15,
  MACD_3_AGREE_POINTS: 10,
  MACD_2_AGREE_POINTS: 5,
  // RSI agreement scoring
  RSI_3_PLUS_AGREE_POINTS: 10,
  RSI_2_AGREE_POINTS: 5,
  // Score normalization factor
  NORMALIZATION_FACTOR: 1.18,
  // Neutral market score caps
  NEUTRAL_CAP_WITH_VOLUME: 70,
  NEUTRAL_CAP_WITHOUT_VOLUME: 60,
  // ADX contribution to weighted confidence
  ADX_CONTRIBUTION_MAX: 10,
  ADX_CONTRIBUTION_SCALE: 0.5,
  ADX_CONTRIBUTION_OFFSET: 15,
  // Volume ratio weight in total confidence
  VOLUME_RATIO_WEIGHT: 5,
  // Volume boost for aligned direction
  VOLUME_BOOST_MULTIPLIER: 0.10,
} as const;

// ============= MICRO_TREND_SCORING (calculate-trend) =============
// Point values for micro-trend alignment detection
export const MICRO_TREND_SCORING = {
  // Alignment scores per condition
  BOTH_LTF_ALIGNED_POINTS: 40,
  MACD_ALIGNED_POINTS: 30,
  TF_1H_AGREES_POINTS: 20,
  CONFIDENCE_HIGH_POINTS: 10,  // avgConfidence >= 55
  ADX_MODERATE_POINTS: 10,
  EXTRA_1H_ALIGNED_POINTS: 15,
  PARTIAL_MACD_ALIGNED_POINTS: 20,
  // Minimum alignment score for micro-trend
  MIN_ALIGNMENT_SCORE: 50,
  // Cap for partial alignment
  PARTIAL_ALIGNMENT_CAP: 60,
  // Minimum avg confidence for partial micro-trend
  PARTIAL_MIN_CONFIDENCE: 55,
  // High confidence threshold for bonus points
  HIGH_CONFIDENCE_THRESHOLD: 55,
} as const;

// ============= NEUTRAL BAR CRITERIA (calculate-trend) =============
// Thresholds for identifying neutral/choppy bars in persistence calculation
export const NEUTRAL_BAR_CRITERIA = {
  MAX_BAR_CHANGE_PERCENT: 0.3,
  MAX_INTER_BAR_CHANGE_PERCENT: 0.4,
} as const;

// ============= STEALTH SCORING POINTS (calculate-trend) =============
// Point allocations for stealth trend confidence scoring
export const STEALTH_SCORING_POINTS = {
  // Drift size (up to this max)
  MAX_DRIFT_POINTS: 40,
  DRIFT_MULTIPLIER: 20,
  // ADX distance points (lower ADX = more stealth)
  MAX_ADX_DISTANCE_POINTS: 20,
  ADX_DISTANCE_MULTIPLIER: 2,
  // Large drift bonuses
  STRONG_DRIFT_BONUS: 15,     // absDrift >= 2.5
  STRONG_DRIFT_THRESHOLD: 2.5,
  MODERATE_DRIFT_BONUS: 10,   // absDrift >= 2.0
  MODERATE_DRIFT_THRESHOLD: 2.0,
  // Monotonicity bonuses
  HIGH_MONOTONIC_BONUS: 15,    // consistency >= 80%
  HIGH_MONOTONIC_THRESHOLD: 80,
  MEDIUM_MONOTONIC_BONUS: 10,  // consistency >= 75%
  MEDIUM_MONOTONIC_THRESHOLD: 75,
  LOW_MONOTONIC_BONUS: 5,      // consistency >= 70%
  LOW_MONOTONIC_THRESHOLD: 70,
  // Alignment bonuses
  TF_1H_ALIGNED_POINTS: 15,
  TF_1H_HIGH_CONF_BONUS: 5,
  TF_30M_ALIGNED_POINTS: 10,
  // Penalty
  STOCHRSI_EXTREME_PENALTY: 20,
} as const;

// ============= ATR REGIME THRESHOLDS (calculate-trend) =============
// ATR-based volatility regime classification
export const ATR_REGIME_THRESHOLDS = {
  // ATR compression threshold (relative to historical avg)
  COMPRESSION_RATIO: 0.6,
  // Low compression for candle alignment relaxation
  LOW_COMPRESSION_RATIO: 0.7,
  // Volatility normal range (ATR percent of price)
  VOLATILITY_NORMAL_MIN: 0.3,
  VOLATILITY_NORMAL_MAX: 5.0,
  // Range expansion detection
  RANGE_EXPANSION_RATIO: 1.0,
  // Volume expansion detection for hasRangeExpansion1h
  VOLUME_EXPANSION_RATIO: 1.3,
} as const;

// ============= DIVERGENCE CONFIDENCE SCALING (calculate-trend) =============
// Confidence multipliers for divergence signal types
export const DIVERGENCE_CONFIDENCE_SCALING = {
  // Pullback divergence confidence = 4h_confidence * this
  PULLBACK_MULTIPLIER: 0.7,
  // Early reversal confidence = 1h_confidence * this
  EARLY_REVERSAL_MULTIPLIER: 0.65,
  // Ranging conflict weights
  RANGING_4H_WEIGHT: 0.6,
  RANGING_1H_WEIGHT: 0.4,
} as const;

// ============= PULLBACK RANGE DETECTION (calculate-trend) =============
// Range thresholds for pullback identification
export const PULLBACK_RANGE_DETECTION = {
  MIN_PULLBACK_PERCENT: 10,
  MAX_PULLBACK_PERCENT: 65,
} as const;

// ============= DIVERGENCE ALIGNMENT THRESHOLDS (calculate-trend) =============
// Minimum True Alignment scores for divergence signals
export const DIVERGENCE_ALIGNMENT_THRESHOLDS = {
  PULLBACK_MIN_SCORE: 55,
  EARLY_REVERSAL_MIN_SCORE: 45,
} as const;

// ============= MACD NORMALIZED THRESHOLDS (calculate-trend) =============
// ATR-normalized MACD thresholds for momentum classification
export const MACD_NORMALIZED_THRESHOLDS = {
  // MACD must be this fraction of ATR to count as "expanding"
  EXPANDING_RATIO: 0.005,
  // MACD must be this fraction of ATR to count as "strong"
  STRONG_RATIO: 0.05,
  // Batch mode: MACD-signal gap ATR ratio for "strong"
  BATCH_STRONG_RATIO: 0.001,
} as const;

// ============= MOMENTUM STATE INLINE (calculate-trend) =============
// Inline thresholds for momentum state classification
export const MOMENTUM_STATE_PARAMS = {
  // StochRSI extremes for exhaustion detection
  EXHAUSTION_STOCHRSI_HIGH: 90,
  EXHAUSTION_STOCHRSI_LOW: 10,
  // Strong alignment confidence thresholds
  STRONG_4H_CONFIDENCE: 55,
  STRONG_1H_CONFIDENCE: 50,
  // Candle alignment thresholds
  STANDARD_ALIGNMENT_RATIO: 0.67,   // 2/3 majority
  COMPRESSED_ALIGNMENT_RATIO: 0.34, // 1/3 majority in compression
  // Divergence detection thresholds
  PRICE_MOVEMENT_MIN_PERCENT: 0.001,
  MACD_MOVEMENT_MIN_PERCENT: 0.05,
  // Swing distance log threshold
  SWING_DISTANCE_LOG_THRESHOLD: 5,
  // Volume boost for confirmed direction
  VOLUME_DIRECTION_BOOST: 1.10,
} as const;

// ============= VOLUME SCORE THRESHOLDS (scoring.ts) =============
// Graduated volume scoring for entry quality assessment
export const VOLUME_SCORE_PARAMS = {
  // Volume ratio thresholds (current / average)
  SPIKE_WITH_EXPANSION: 2.0,  // +10 with range expansion, +8 without
  ABOVE_AVG_HIGH: 1.5,        // +7 with expansion, +5 without
  ABOVE_AVG: 1.2,             // +2
  AT_AVG: 1.0,                // +2 baseline
  BELOW_AVG: 0.5,             // +2 (still reasonable)
  LOW: 0.3,                   // +1
  VERY_LOW: 0.1,              // 0 (holiday/weekend)
  // Score values
  SCORE_PERFECT: 10,
  SCORE_STRONG: 8,
  SCORE_CONFIRMS_EXPANSION: 7,
  SCORE_CONFIRMS: 5,
  SCORE_CONFIRMS_BASIC: 4,
  SCORE_SPIKE_NO_CONFIRM: 4,
  SCORE_EXPANSION_NO_CONFIRM: 3,
  SCORE_ABOVE_AVG: 2,
  SCORE_BASELINE: 2,
  SCORE_LOW: 1,
} as const;

// ============= ADX SCORE PARAMS (scoring.ts) =============
// ADX quality scoring with falling-ADX penalties
export const ADX_SCORE_PARAMS = {
  // Base scores by ADX level (uses ADX_THRESHOLDS for levels)
  SCORE_EXTREME: 25,
  SCORE_VERY_STRONG: 22,
  SCORE_STRONG: 18,
  SCORE_MINIMUM: 14,
  SCORE_WEAK: 8,
  SCORE_VERY_WEAK: 4,
  // Falling ADX penalties
  FALLING_WEAK_PENALTY: 8,    // ADX < 25 and falling
  FALLING_STRONG_PENALTY: 5,  // ADX >= 25 and falling
  FALLING_THRESHOLD: 25,      // Divider between weak/strong falling
} as const;

// ============= ALIGNMENT SCORE PARAMS (scoring.ts) =============
// Timeframe alignment quality scoring
export const ALIGNMENT_SCORE_PARAMS = {
  // Full alignment
  FULL_ALIGNMENT_SCORE: 8,
  // Strong 1H with neutral 4H
  STRONG_1H_NEUTRAL_4H_SCORE: 6,
  STRONG_1H_MIN_CONFIDENCE: 65,
  // Partial alignment (1h+30m agree, 4h neutral)
  PARTIAL_ALIGNMENT_SCORE: 5,
  // 1h+30m agree but differ from 4h
  LOWER_TF_ALIGNMENT_SCORE: 3,
  // Strong 1h alone
  STRONG_1H_ALONE_SCORE: 3,
  STRONG_1H_ALONE_MIN_CONFIDENCE: 60,
  // Loading zone bonus
  LOADING_ZONE_WIDE_K_MIN: 30,
  LOADING_ZONE_WIDE_K_MAX: 70,
  LOADING_ZONE_WIDE_ADX_MIN: 35,
  LOADING_ZONE_WIDE_BONUS: 3,
  LOADING_ZONE_NARROW_K_MIN: 35,
  LOADING_ZONE_NARROW_K_MAX: 65,
  LOADING_ZONE_NARROW_ADX_MIN: 25,
  LOADING_ZONE_NARROW_BONUS: 2,
  // 1H confidence bonus
  VERY_STRONG_1H_CONFIDENCE: 70,
  VERY_STRONG_1H_BONUS: 2,
  STRONG_1H_CONFIDENCE: 65,
  STRONG_1H_BONUS: 1,
  // Consistency tiers
  CONSISTENCY_EXCELLENT: 75,
  CONSISTENCY_EXCELLENT_SCORE: 4,
  CONSISTENCY_GOOD: 65,
  CONSISTENCY_GOOD_SCORE: 3,
  CONSISTENCY_FAIR: 55,
  CONSISTENCY_FAIR_SCORE: 2,
  CONSISTENCY_BASIC: 45,
  CONSISTENCY_BASIC_SCORE: 1,
  // Max cap
  MAX_SCORE: 14,
} as const;

// NOTE: ADX_REVERSAL_WEIGHTS is defined earlier (line ~5192) with threshold references — single source of truth

// ============= REVERSAL SCORE CROSS POINTS (scoring.ts) =============
// StochRSI cross signal scoring in unified reversal score
export const REVERSAL_CROSS_SCORES = {
  THREE_PLUS_CROSSES: 50,
  TWO_CROSSES: 40,
  ONE_CROSS: 30,
  // Zone extreme scores
  HIGH_REVERSAL_RISK: 35,
  EXTREME_ZONE: 18,
  DEEPLY_ZONE: 15,
  STANDARD_ZONE: 10,
  OUTER_ZONE: 8,
  // Momentum reversal scores
  MIXED_WEAK_ADX: 30,
  NONE_STATE: 25,
  UNCONFIRMED: 20,
  MIXED_STRONG_ADX: 15,
  NONE_STRONG_ADX: 10,
  BUILDING_UNCONFIRMED: 10,
  UNCONFIRMED_STRONG: 8,
  // MACD reversal scores
  DIVERGENCE: 15,
  DIRECTION_MISALIGNED: 10,
  NOT_EXPANDING: 5,
  // Timeframe conflict scores
  OPPOSING_1H: 15,
  OPPOSING_4H: 5,
  // Volume scores
  VOLUME_CONFIRMS: -10,
  LOW_VOLUME: 5,
  // Decision thresholds
  BLOCK_THRESHOLD: 75,
  REDUCE_THRESHOLD: 40,
} as const;

// ============= MARKET REGIME DETECTION PARAMS (scoring.ts) =============
// Legacy market regime detection thresholds
export const MARKET_REGIME_DETECTION = {
  RANGING_ADX_MAX: 15,
  RANGING_CONFIDENCE_MAX: 50,
  CHOPPY_CONSISTENCY_MAX: 40,
  VOLATILE_ATR_MIN: 2.5,
} as const;

// ============= MOMENTUM SCORE COMPONENT LIMITS (smart-momentum.ts) =============
// Max contribution per component in momentum score calculation
export const MOMENTUM_SCORE_COMPONENTS = {
  EMA_SPREAD_MAX: 30,
  RSI_MOMENTUM_MAX: 25,
  MACD_HISTOGRAM_MAX: 30,
  ADX_TREND_MAX: 15,
  // ADX contribution scores
  ADX_STRONG_RISING: 15,
  ADX_STRONG_FALLING: -5,
  ADX_MODERATE_RISING: 8,
  ADX_MODERATE_FALLING: -3,
  ADX_WEAK: -10,
  // Direction determination
  BULLISH_THRESHOLD: 20,
  BEARISH_THRESHOLD: -20,
  // State thresholds
  ACCELERATING_THRESHOLD: 30,
  // Overextension
  EXHAUSTION_ATR_THRESHOLD: 2.0,
  // EMA spread significance
  EMA_SPREAD_WIDENING: 0.1,
  EMA_SPREAD_NARROWING: -0.1,
  EMA_SPREAD_SCORE_MULTIPLIER: 10,
} as const;

// ============= DYNAMIC TRAILING R-MULTIPLE PARAMS (smart-momentum.ts) =============
// R-multiple based trailing stop parameters
export const DYNAMIC_TRAILING_PARAMS = {
  // ADX-based activation thresholds
  STRONG_ADX: 30,
  MEDIUM_ADX: 22,
  STRONG_ACTIVATION_R: 1.0,
  MEDIUM_ACTIVATION_R: 1.2,
  WEAK_ACTIVATION_R: 1.5,
  // Trail distances in R
  STRONG_TRAIL_R: 0.5,
  MEDIUM_TRAIL_R: 0.75,
  WEAK_TRAIL_R: 1.0,
  // Momentum adjustments
  ACCELERATION_MULTIPLIER: 0.7,
  EXHAUSTION_BONUS_R: 0.5,
  // Lock tiers: [rMultiple, lockR]
  LOCK_TIERS: [
    { rMultiple: 1.0, lockR: 0.25 },
    { rMultiple: 1.5, lockR: 0.5 },
    { rMultiple: 2.0, lockR: 0.75 },
    { rMultiple: 2.5, lockR: 1.0 },
    { rMultiple: 3.0, lockR: 1.5 },
    { rMultiple: 4.0, lockR: 2.0 },
    { rMultiple: 5.0, lockR: 3.0 },
  ],
} as const;

// ============= CONTEXT AWARE STOP PARAMS (smart-momentum.ts) =============
// ATR-based and swing-based stop loss parameters
export const CONTEXT_STOP_PARAMS = {
  // ADX tiers
  STRONG_TREND_ADX: 30,
  MEDIUM_TREND_ADX: 22,
  // ATR multipliers by trend strength
  STRONG_ATR_MULT: 1.2,
  MEDIUM_ATR_MULT: 1.5,
  WEAK_ATR_MULT: 2.0,
  // Volatility adjustments
  HIGH_VOL_RATIO: 1.5,
  HIGH_VOL_EXPANSION: 1.3,
  LOW_VOL_RATIO: 0.7,
  LOW_VOL_CONTRACTION: 0.85,
  // Swing-based stop
  SWING_BUFFER_ATR: 0.3,
  MAX_SWING_DISTANCE_ATR: 3.0,
  MIN_SWING_DISTANCE_ATR: 0.8,
  // Hybrid detection
  HYBRID_PROXIMITY_ATR: 0.2,
} as const;

// ============= EXIT SIGNAL SCORING (smart-momentum.ts) =============
// Component weights for exit signal calculation
export const EXIT_SIGNAL_SCORING = {
  // Max component scores
  MOMENTUM_EXHAUSTION_MAX: 30,
  MOMENTUM_WEAKENING_AGAINST: 20,
  SWING_VIOLATION_MAX: 25,
  REVERSAL_HIGH: 20,
  REVERSAL_MODERATE: 10,
  REVERSAL_HIGH_THRESHOLD: 70,
  REVERSAL_MODERATE_THRESHOLD: 50,
  TIME_DECAY_STALE: 15,
  TIME_DECAY_AGING: 8,
  VOLATILITY_EXTREME: 10,
  VOLATILITY_HIGH: 5,
  // Time thresholds (hours)
  STALE_POSITION_HOURS: 4,
  AGING_POSITION_HOURS: 2,
  // Decay thresholds (percent)
  STALE_PROFIT_DECAY: 0.5,
  AGING_PROFIT_DECAY: 0.3,
  // Volatility ratio thresholds
  EXTREME_VOLATILITY_RATIO: 2.0,
  HIGH_VOLATILITY_RATIO: 1.5,
  // Exit decision thresholds
  SHOULD_EXIT_THRESHOLD: 50,
  EMERGENCY_EXIT_THRESHOLD: 80,
} as const;

// NOTE: PULLBACK_DETECTION_PARAMS is defined earlier (line ~1832) for strategy-analyzer
// The smart-momentum pullback detection function uses hardcoded Fibonacci levels inline
// No duplicate needed here

// ============= ENTRY CONFIRMATION PARAMS (smart-momentum.ts) =============
// Entry confirmation check thresholds
export const ENTRY_CONFIRMATION_PARAMS = {
  // Volume thresholds
  VOLUME_STRONG: 1.5,
  VOLUME_OK: 1.0,
  // StochRSI extremes
  LONG_STOCHRSI_MAX: 80,
  SHORT_STOCHRSI_MIN: 20,
  // Confirmation count
  MIN_CONFIRMATIONS: 4,
  MAX_CONFIRMATIONS: 5,
} as const;

// ============= ENTRY QUALITY GRADES (smart-momentum.ts) =============
// Quality grade thresholds and factor limits
export const ENTRY_QUALITY_GRADES = {
  GRADE_A: 90,
  GRADE_B: 75,
  GRADE_C: 60,
  GRADE_D: 45,
  // Factor max scores
  MOMENTUM_ALIGNMENT_MAX: 25,
  PULLBACK_QUALITY_MAX: 25,
  VOLUME_CONFIRMATION_MAX: 15,
  TIMEFRAME_ALIGNMENT_MAX: 15,
  STOCHRSI_POSITION_MAX: 10,
  MACD_EXPANDING_MAX: 10,
  ENTRY_CONFIRMATION_MAX: 10,
  // Minimum recommended score
  MIN_RECOMMENDED: 60,
  // Breakout volume threshold
  BREAKOUT_VOLUME: 1.5,
} as const;
