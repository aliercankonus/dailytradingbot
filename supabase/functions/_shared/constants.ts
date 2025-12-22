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
  BREAK_EVEN_ACTIVATION_PERCENT: 0.3,  // Lowered from 0.5% to 0.3% for earlier protection
  TRAILING_STOP_ACTIVATION_PERCENT: 1.0,
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
