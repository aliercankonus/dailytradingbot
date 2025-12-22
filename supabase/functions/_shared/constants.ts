// ============= CENTRALIZED THRESHOLDS =============
// CRITICAL: Single source of truth for all edge functions
// Changes here automatically apply to: calculate-trend, backtest-strategy, strategy-analyzer, execute-trade, monitor-positions

export const ADX_THRESHOLDS = {
  VERY_WEAK: 12,
  SEVERE_PENALTY: 15,
  WEAK: 18,
  MINIMUM: 20,
  MODERATE: 22,
  STRONG: 25,
  STRONG_TREND_EXCEPTION: 27,  // RELAXED: From 28 to 27 for better signal capture
  VERY_STRONG: 30,
  EXCEPTIONAL: 35,
  EXTREME: 40,
} as const;

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
