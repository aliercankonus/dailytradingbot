// Shadow Mode Logging for Gate Validation
// Tracks signals that would pass with relaxed gates vs old gates

import { createLogger } from './logging.ts';

/**
 * Derive synthetic stop_loss and take_profit from ATR for shadow signals.
 * Shadow signals are logged before signal construction, so SL/TP must be estimated.
 * Uses 1.5×ATR for SL and 2.5×ATR for TP (standard risk:reward).
 */
export function deriveShadowSLTP(
  entryPrice: number | undefined,
  atr: number | undefined,
  direction: 'long' | 'short'
): { stopLoss: number | undefined; takeProfit: number | undefined } {
  if (!entryPrice || !atr || atr <= 0) {
    return { stopLoss: undefined, takeProfit: undefined };
  }
  const slDistance = atr * 1.5;
  const tpDistance = atr * 2.5;
  if (direction === 'long') {
    return {
      stopLoss: Number((entryPrice - slDistance).toFixed(6)),
      takeProfit: Number((entryPrice + tpDistance).toFixed(6)),
    };
  } else {
    return {
      stopLoss: Number((entryPrice + slDistance).toFixed(6)),
      takeProfit: Number((entryPrice - tpDistance).toFixed(6)),
    };
  }
}

export interface ShadowModeSignal {
  userId: string;
  symbol: string;
  signalType: 'long' | 'short';
  strategyName?: string;
  gateBlockedBy: 'macd_divergence' | 'adx_exhaustion' | 'stochrsi_extreme' | 'volume_filter' | 'trend_consistency';
  oldGateResult: 'blocked' | 'passed';
  newGateResult: 'blocked' | 'passed';
  gateDetails: Record<string, unknown>;
  confidenceScore?: number;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  /** ATR value for auto-deriving SL/TP when not explicitly provided */
  atr?: number;
  trend?: string;
  oldPositionMultiplier?: number;
  newPositionMultiplier?: number;
  indicators?: Record<string, unknown>;
}

export interface GateComparisonResult {
  gateName: string;
  oldThreshold: number | string;
  newThreshold: number | string;
  actualValue: number | string;
  oldResult: 'blocked' | 'passed';
  newResult: 'blocked' | 'passed';
  wouldHaveChanged: boolean;
}

// Old gate thresholds (pre-Phase 2/3/4)
export const OLD_GATE_THRESHOLDS = {
  // MACD divergence - old strict thresholds
  MACD_MIN_OPPOSING_BARS: 2, // was 2, now 3
  MACD_HISTOGRAM_MAGNITUDE_CHECK: false, // didn't exist
  MACD_ADX_OVERRIDE_ENABLED: false, // didn't exist
  
  // ADX exhaustion - old thresholds
  ADX_MIN_DECLINE_FOR_ROLLOVER: 0, // any decline triggered exhaustion
  ADX_MIN_TREND_AGE_BARS: 0, // no time context
  ADX_EXHAUSTION_THRESHOLD: 50, // was 50, now 70
  ADX_PRICE_ACTION_CONFIRM: false, // didn't exist
  
  // StochRSI - old thresholds
  STOCHRSI_MIN_BARS_FOR_PENALTY: 3, // was fixed 3, now dynamic 5-10
  STOCHRSI_PENALTY_EXTREME: 50, // was 50, now 25
  STOCHRSI_MAX_PENALTY_CAP: 100, // no cap, now 20
};

// New relaxed gate thresholds (current Phase 2/3/4)
// NOTE: MACD thresholds are now ATR-NORMALIZED RATIOS (|MACD/ATR|)
// This ensures consistent behavior across high-priced (BTC) and low-priced assets
// 
// CALIBRATION NOTE (2026-02-11):
// - Aligned with MACD_GATE_PARAMS in constants.ts for consistency
// - NEUTRAL_HISTOGRAM_THRESHOLD: 0.01 (1% of ATR = genuinely flat/weak)
// - MIN_HISTOGRAM_FOR_BLOCK: 0.002 (0.2% of ATR = significant opposing momentum)
export const NEW_GATE_THRESHOLDS = {
  // MACD divergence - relaxed (thresholds are |MACD/ATR| ratios)
  MACD_MIN_OPPOSING_BARS: 3,
  MACD_HISTOGRAM_MAGNITUDE_CHECK: true,
  MACD_NEUTRAL_HISTOGRAM_THRESHOLD: 0.01,    // |MACD/ATR| < 1% = neutral (aligned with constants.ts)
  MACD_MIN_HISTOGRAM_FOR_BLOCK: 0.002,       // |MACD/ATR| >= 0.2% = significant (aligned with constants.ts)
  MACD_ADX_OVERRIDE_ENABLED: true,
  MACD_ADX_SOFT_OVERRIDE: 25,
  MACD_ADX_HARD_OVERRIDE: 28,
  
  // ADX exhaustion - relaxed
  ADX_MIN_DECLINE_FOR_ROLLOVER: 3,
  ADX_MIN_TREND_AGE_BARS: 40,
  ADX_EXHAUSTION_THRESHOLD: 70,
  ADX_PRICE_ACTION_CONFIRM: true,
  ADX_SOFT_EXHAUSTION_THRESHOLD: 35,
  ADX_HARD_EXHAUSTION_THRESHOLD: 50,
  
  // StochRSI - relaxed
  STOCHRSI_MIN_BARS_FOR_PENALTY_BY_ADX: { low: 5, mid: 7, high: 10 },
  STOCHRSI_PENALTY_EXTREME: 25,
  STOCHRSI_MAX_PENALTY_CAP: 20,
};

/**
 * Compares MACD divergence gate results between old and new thresholds
 * NOTE: histogramNormalized should be |MACD histogram / ATR| (dimensionless ratio)
 * for consistent behavior across assets with different price scales
 */
export function compareMACDGate(
  opposingBars: number,
  histogramNormalized: number,  // Should be pre-normalized: |histogram| / ATR
  adx: number
): GateComparisonResult {
  // Old gate logic: blocked if >= 2 opposing bars
  const oldBlocked = opposingBars >= OLD_GATE_THRESHOLDS.MACD_MIN_OPPOSING_BARS;
  
  // New gate logic: requires 3+ bars, magnitude check (ATR-normalized), ADX override
  let newBlocked = opposingBars >= NEW_GATE_THRESHOLDS.MACD_MIN_OPPOSING_BARS;
  
  // Magnitude filter - small normalized histogram values don't count
  // Thresholds are now dimensionless ratios (|MACD/ATR|)
  if (newBlocked && histogramNormalized < NEW_GATE_THRESHOLDS.MACD_MIN_HISTOGRAM_FOR_BLOCK) {
    newBlocked = false;
  }
  
  // ADX override - strong trend bypasses MACD divergence
  if (newBlocked && adx >= NEW_GATE_THRESHOLDS.MACD_ADX_HARD_OVERRIDE) {
    newBlocked = false;
  }
  
  return {
    gateName: 'macd_divergence',
    oldThreshold: `${OLD_GATE_THRESHOLDS.MACD_MIN_OPPOSING_BARS} bars`,
    newThreshold: `${NEW_GATE_THRESHOLDS.MACD_MIN_OPPOSING_BARS} bars + normalized magnitude + ADX override`,
    actualValue: `${opposingBars} bars, normalized=${histogramNormalized.toFixed(6)}, ADX=${adx.toFixed(1)}`,
    oldResult: oldBlocked ? 'blocked' : 'passed',
    newResult: newBlocked ? 'blocked' : 'passed',
    wouldHaveChanged: oldBlocked && !newBlocked,
  };
}

/**
 * Compares ADX exhaustion gate results between old and new thresholds
 */
export function compareADXExhaustionGate(
  exhaustionScore: number,
  adxDeclineFromPeak: number,
  trendAge: number,
  priceActionConfirmed: boolean
): GateComparisonResult {
  // Old gate logic: blocked if exhaustion score >= 50, no time/decline requirements
  const oldBlocked = exhaustionScore >= OLD_GATE_THRESHOLDS.ADX_EXHAUSTION_THRESHOLD;
  
  // New gate logic: requires 3+ point decline, 40+ bar trend age, higher threshold
  let adjustedScore = exhaustionScore;
  
  // Apply new requirements
  if (adxDeclineFromPeak < NEW_GATE_THRESHOLDS.ADX_MIN_DECLINE_FOR_ROLLOVER) {
    adjustedScore = Math.max(0, adjustedScore - 30); // Reduce score if decline not significant
  }
  if (trendAge < NEW_GATE_THRESHOLDS.ADX_MIN_TREND_AGE_BARS) {
    adjustedScore = Math.max(0, adjustedScore - 20); // Reduce score if trend too young
  }
  if (priceActionConfirmed) {
    adjustedScore += 10; // Bonus for price action
  }
  
  const newBlocked = adjustedScore >= NEW_GATE_THRESHOLDS.ADX_EXHAUSTION_THRESHOLD;
  
  return {
    gateName: 'adx_exhaustion',
    oldThreshold: `score >= ${OLD_GATE_THRESHOLDS.ADX_EXHAUSTION_THRESHOLD}`,
    newThreshold: `score >= ${NEW_GATE_THRESHOLDS.ADX_EXHAUSTION_THRESHOLD} + decline/age checks`,
    actualValue: `score=${exhaustionScore}, decline=${adxDeclineFromPeak.toFixed(1)}, age=${trendAge} bars`,
    oldResult: oldBlocked ? 'blocked' : 'passed',
    newResult: newBlocked ? 'blocked' : 'passed',
    wouldHaveChanged: oldBlocked && !newBlocked,
  };
}

/**
 * Compares StochRSI extreme gate results between old and new thresholds
 */
export function compareStochRSIGate(
  stochRsiPenalty: number,
  barsAtExtreme: number,
  adx: number
): GateComparisonResult {
  // Old gate logic: fixed 3 bar threshold, high penalty, no cap
  const oldPenalty = barsAtExtreme >= OLD_GATE_THRESHOLDS.STOCHRSI_MIN_BARS_FOR_PENALTY
    ? OLD_GATE_THRESHOLDS.STOCHRSI_PENALTY_EXTREME
    : 0;
  
  // New gate logic: dynamic bars based on ADX, lower penalty, capped at 20
  let newMinBars = NEW_GATE_THRESHOLDS.STOCHRSI_MIN_BARS_FOR_PENALTY_BY_ADX.mid;
  if (adx < 25) {
    newMinBars = NEW_GATE_THRESHOLDS.STOCHRSI_MIN_BARS_FOR_PENALTY_BY_ADX.low;
  } else if (adx > 35) {
    newMinBars = NEW_GATE_THRESHOLDS.STOCHRSI_MIN_BARS_FOR_PENALTY_BY_ADX.high;
  }
  
  let newPenalty = barsAtExtreme >= newMinBars
    ? NEW_GATE_THRESHOLDS.STOCHRSI_PENALTY_EXTREME
    : 0;
  
  // Apply cap
  newPenalty = Math.min(newPenalty, NEW_GATE_THRESHOLDS.STOCHRSI_MAX_PENALTY_CAP);
  
  // Consider "blocked" if penalty would contribute significantly (>30 for old, >15 for new)
  const oldBlocked = oldPenalty > 30;
  const newBlocked = newPenalty > 15;
  
  return {
    gateName: 'stochrsi_extreme',
    oldThreshold: `${OLD_GATE_THRESHOLDS.STOCHRSI_MIN_BARS_FOR_PENALTY} bars, penalty=${OLD_GATE_THRESHOLDS.STOCHRSI_PENALTY_EXTREME}`,
    newThreshold: `${newMinBars} bars (ADX-based), penalty=${NEW_GATE_THRESHOLDS.STOCHRSI_PENALTY_EXTREME}, cap=${NEW_GATE_THRESHOLDS.STOCHRSI_MAX_PENALTY_CAP}`,
    actualValue: `${barsAtExtreme} bars at extreme, ADX=${adx.toFixed(1)}`,
    oldResult: oldBlocked ? 'blocked' : 'passed',
    newResult: newBlocked ? 'blocked' : 'passed',
    wouldHaveChanged: oldBlocked && !newBlocked,
  };
}

/**
 * Log shadow mode signal to database
 */
export async function logShadowSignal(
  supabaseClient: ReturnType<typeof import('https://esm.sh/@supabase/supabase-js@2.49.1').createClient>,
  signal: ShadowModeSignal
): Promise<void> {
  const logger = createLogger('shadow-mode');
  
  try {
    // Auto-derive SL/TP from ATR when not explicitly provided
    let { stopLoss, takeProfit } = signal;
    if ((!stopLoss || !takeProfit) && signal.atr && signal.entryPrice) {
      const derived = deriveShadowSLTP(signal.entryPrice, signal.atr, signal.signalType);
      stopLoss = stopLoss ?? derived.stopLoss;
      takeProfit = takeProfit ?? derived.takeProfit;
    }

    const { error } = await supabaseClient
      .from('shadow_mode_signals')
      .insert({
        user_id: signal.userId,
        symbol: signal.symbol,
        signal_type: signal.signalType,
        strategy_name: signal.strategyName,
        gate_blocked_by: signal.gateBlockedBy,
        old_gate_result: signal.oldGateResult,
        new_gate_result: signal.newGateResult,
        gate_details: signal.gateDetails,
        confidence_score: signal.confidenceScore,
        entry_price: signal.entryPrice,
        stop_loss: stopLoss,
        take_profit: takeProfit,
        trend: signal.trend,
        old_position_multiplier: signal.oldPositionMultiplier,
        new_position_multiplier: signal.newPositionMultiplier,
        indicators: signal.indicators,
      });

    if (error) {
      logger.error(`Failed to log shadow signal: ${error.message}`);
    } else {
      logger.info(`🔮 Shadow signal logged: ${signal.symbol} ${signal.signalType} - ${signal.gateBlockedBy} changed from ${signal.oldGateResult} to ${signal.newGateResult}`);
    }
  } catch (err) {
    logger.error(`Shadow mode logging error: ${err}`);
  }
}

/**
 * Get shadow mode statistics for a user
 */
interface ShadowSignalRow {
  gate_blocked_by: string;
  symbol: string;
  outcome_tracked: boolean;
  would_have_won: boolean;
}

export async function getShadowModeStats(
  supabaseClient: ReturnType<typeof import('https://esm.sh/@supabase/supabase-js@2.49.1').createClient>,
  userId: string,
  hoursBack: number = 72
): Promise<{
  totalSignals: number;
  byGate: Record<string, number>;
  bySymbol: Record<string, number>;
  wouldHaveWon: number;
  wouldHaveLost: number;
  pending: number;
}> {
  const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
  
  const { data, error } = await supabaseClient
    .from('shadow_mode_signals')
    .select('gate_blocked_by, symbol, outcome_tracked, would_have_won')
    .eq('user_id', userId)
    .gte('created_at', cutoff);

  if (error || !data) {
    return {
      totalSignals: 0,
      byGate: {},
      bySymbol: {},
      wouldHaveWon: 0,
      wouldHaveLost: 0,
      pending: 0,
    };
  }

  const signals = data as ShadowSignalRow[];
  const byGate: Record<string, number> = {};
  const bySymbol: Record<string, number> = {};
  let wouldHaveWon = 0;
  let wouldHaveLost = 0;
  let pending = 0;

  for (const signal of signals) {
    const gateKey = signal.gate_blocked_by;
    const symbolKey = signal.symbol;
    byGate[gateKey] = (byGate[gateKey] || 0) + 1;
    bySymbol[symbolKey] = (bySymbol[symbolKey] || 0) + 1;
    
    if (signal.outcome_tracked) {
      if (signal.would_have_won) {
        wouldHaveWon++;
      } else {
        wouldHaveLost++;
      }
    } else {
      pending++;
    }
  }

  return {
    totalSignals: data.length,
    byGate,
    bySymbol,
    wouldHaveWon,
    wouldHaveLost,
    pending,
  };
}

/**
 * Check if shadow mode is enabled for a user
 */
export async function isShadowModeEnabled(
  supabaseClient: ReturnType<typeof import('https://esm.sh/@supabase/supabase-js@2.49.1').createClient>,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabaseClient
    .from('risk_parameters')
    .select('shadow_mode_enabled')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return true; // Default to enabled for validation period
  }

  const shadowEnabled = (data as { shadow_mode_enabled?: boolean }).shadow_mode_enabled;
  return shadowEnabled ?? true;
}
