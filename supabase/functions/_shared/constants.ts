// ============= CENTRALIZED THRESHOLDS =============
// CRITICAL: Single source of truth for all edge functions
// Changes here automatically apply to: calculate-trend, backtest-strategy, strategy-analyzer, execute-trade, monitor-positions

export const ADX_THRESHOLDS = {
  VERY_WEAK: 12,
  SEVERE_PENALTY: 15,
  WEAK: 18,
  // SQUEEZE_MINIMUM: Allows squeeze breakout entries when ADX is 18-20
  SQUEEZE_MINIMUM: 18,
  MINIMUM: 20,
  MODERATE: 22,
  STRONG: 25,
  // PHASE 1 FIX: Separated strong trend exception thresholds
  STRONG_TREND_EXCEPTION: 27,  // For dead zone bypass only
  STRONG_TREND_EXCEPTION_PARTIAL: 25,  // Partial exception: 25% position reduction
  STRONG_TREND_EXCEPTION_FULL: 30,     // Full exception: no position reduction
  VERY_STRONG: 30,
  EXCEPTIONAL: 35,
  EXTREME: 40,
  // PHASE 1: ADX Phase State Machine thresholds
  EXHAUSTION: 45,  // ADX > 45 = exhaustion risk, increase reversal sensitivity
  // PHASE 1 FIX: Reversal override block threshold
  REVERSAL_BLOCK: 30,  // No reversals allowed when ADX >= 30 (strong trend)
} as const;

// ============= ADX PHASE STATE MACHINE =============
// PHASE 1 IMPROVEMENT: Replace raw thresholds with phase classification
// Each phase has different behavior for signal generation
export const ADX_PHASES = {
  RANGE: { min: 0, max: 18, tradeable: false, description: "No trend - reject" },
  TRANSITION: { min: 18, max: 22, tradeable: true, description: "Emerging trend - allow squeeze/momentum only" },
  EARLY_TREND: { min: 22, max: 30, tradeable: true, description: "Early trend - normal logic" },
  STRONG_TREND: { min: 30, max: 45, tradeable: true, description: "Strong trend - reduced reversal weight" },
  EXHAUSTION: { min: 45, max: 100, tradeable: true, description: "Exhaustion risk - increase reversal sensitivity" },
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
} as const;

// ============= PHASE 3: TIME-IN-EXTREME THRESHOLDS =============
// Tracks consecutive bars at StochRSI extremes for exhaustion detection
export const TIME_IN_EXTREME_PARAMS = {
  // Threshold for "extreme" zone (K > 90 or K < 10)
  OVERBOUGHT_EXTREME: 90,
  OVERSOLD_EXTREME: 10,
  // Minimum bars at extreme before penalty kicks in
  MIN_BARS_FOR_PENALTY: 3,
  // Bars at extreme levels for increasing penalties
  MODERATE_BARS: 6,   // 6+ bars = +15 reversal score
  HIGH_BARS: 9,       // 9+ bars = +25 reversal score
  EXTREME_BARS: 12,   // 12+ bars = +35 reversal score (exhausted momentum)
  // Penalty scores for each level
  PENALTY_MODERATE: 15,
  PENALTY_HIGH: 25,
  PENALTY_EXTREME: 35,
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
  PENALTY_LIGHT: 70,
  PENALTY_MODERATE: 75,
  PENALTY_STRONG: 80,
  PENALTY_HEAVY: 85,
  WEAK_4H: 58,
  STRONG_ALIGNMENT_1H: 58,
} as const;

export const RISK_PARAMS = {
  // ADJUSTED: Increased from 0.3% to 0.5% to give positions more room to develop
  // BTC positions were hitting break-even too early, preventing +1% profit targets
  BREAK_EVEN_ACTIVATION_PERCENT: 0.5,
  // SCENARIO 5 FIX: Context-aware break-even - use 1.0% for strong trends (ADX >= 30)
  // Strong trends often retest 0.3–0.6%, so tighter break-even converts winners into scratches
  BREAK_EVEN_STRONG_TREND_ACTIVATION_PERCENT: 1.0,
  // ADJUSTED: Lowered from 1.0% to 0.7% so more positions benefit from trailing protection
  // Analysis showed positions peaked at 0.6-0.9% then fell back - this captures those gains
  TRAILING_STOP_ACTIVATION_PERCENT: 0.7,
  MIN_STOP_DISTANCE_PERCENT: 1.0,
  TRAILING_PROFIT_LOCK_PERCENT: 0.5,
  // Base quality threshold - actual threshold is dynamically adjusted:
  // - 45 for strong 1h confidence (>=65%)
  // - 50 for exceptional ADX (>=35)
  // - 53 for strong ADX (>=25)
  // - 55 base threshold
  // - 35 for neutral strategies
  // - 65 in recovery mode
  MIN_QUALITY_THRESHOLD: 55,
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
export const QUALITY_THRESHOLDS = {
  // Base minimum quality score (standard conditions)
  BASE_MIN: 55,
  // Neutral trend threshold (relies on HTF for direction)
  NEUTRAL_MIN: 35,
  // Strong 1h signal threshold (1h confidence >= 65%)
  STRONG_1H_MIN: 45,
  // Exceptional ADX threshold (ADX >= 35)
  EXCEPTIONAL_ADX_MIN: 50,
  // Strong ADX threshold (ADX >= 25)
  STRONG_ADX_MIN: 53,
  // Recovery mode boost added to base threshold
  RECOVERY_BOOST: 10,
  // PHASE 1: Near miss threshold - signals within this many points of threshold are logged for analysis
  NEAR_MISS_THRESHOLD: 5,
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
  // MANDATORY: Minimum ADX required for micro-trend bypass (was no requirement)
  MIN_ADX: 25,
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
export const EXCEPTION_HIERARCHY = {
  // Priority order (1 = highest, processed first)
  REVERSAL_OVERRIDE: 1,
  STRONG_TREND: 2,
  MICRO_TREND: 3,
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
export type ExceptionType = 'REVERSAL_OVERRIDE' | 'STRONG_TREND' | 'MICRO_TREND' | 'NONE';
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
  // Volatility spike: ATR ratio above normal requiring caution
  VOLATILITY_SPIKE_THRESHOLD: 2.0,
  // Extreme volatility: ATR ratio requiring immediate exit
  EXTREME_VOLATILITY_THRESHOLD: 3.0,
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
