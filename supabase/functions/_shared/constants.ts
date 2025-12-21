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
