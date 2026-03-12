// ============= SHARED GATE PIPELINE =============
// Production-parity gate evaluation and exit logic.
// Used by both strategy-analyzer (future) and backtest-runner.

import type { MarketFeatureSnapshot } from "./market-feature-snapshot.ts";
import type { MomentumScoreResult } from "./smart-momentum.ts";
import {
  ADX_THRESHOLDS, ADX_GATE, STOCHRSI_THRESHOLDS,
  QUALITY_THRESHOLDS, TRADING_FEE_PARAMS,
  getSymbolParams, BTC_PARAMS,
} from "./constants.ts";
import { calculateQualityScore } from "./scoring.ts";
import {
  evaluateDecayVelocity, evaluateProgressiveProfitLock,
  evaluateMicroProfitLock, calculateFeeAwarePnL,
  type PositionContext, type MarketContext, type UserExitSettings,
} from "./exit-strategies.ts";
import { createLogger } from "./logging.ts";

const logger = createLogger('gate-pipeline');

// ============= TYPES =============

export interface GateResult {
  passed: boolean;
  gate: string | null;
  direction: 'LONG' | 'SHORT' | null;
  qualityScore: number;
  momentumScore: number;
  positionMultiplier: number;
  strategyName: string;
}

export interface BacktestPosition {
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  entryTime: string;
  stopLoss: number;
  takeProfit: number;
  peakPnl: number;
  peakReachedAt: string;
  trailingStop: number | null;
  entryScore: number;
  qualityScore: number;
  atrAtEntry: number;
  atrPercentAtEntry: number;
  strategyName: string;
  entryMomentumScore: number;
  entryStochK: number;
  entryAdx: number;
}

// ============= PRODUCTION GATE PIPELINE =============

export function evaluateProductionGates(
  mfs: MarketFeatureSnapshot,
  momentumResult: MomentumScoreResult,
  symbol?: string,
  klines?: any[],
): GateResult {
  const sp = getSymbolParams(symbol || mfs.symbol);
  const isBtcSymbol = BTC_PARAMS.symbols.includes(symbol || mfs.symbol);
  let shortOverrides: typeof BTC_PARAMS.shortGateOverrides | null = null;
  const fail = (gate: string): GateResult => ({
    passed: false, gate, direction: null, qualityScore: 0,
    momentumScore: momentumResult.score, positionMultiplier: 0, strategyName: '',
  });

  const adx = mfs.adx;
  const adxSlope = mfs.adxSlope;
  const stochK = mfs.stochRsi["1h"].k;
  const primaryTrend = mfs.primaryTrend;

  // GATE 1: ADX Hard Floor
  const effectiveHardFloor = shortOverrides?.adxHardFloor ?? ADX_GATE.HARD_FLOOR;
  if (adx < effectiveHardFloor) return fail('ADX_HARD_FLOOR');

  // GATE 2: ADX Graduated Tiers
  let adxPositionMultiplier = 1.0;
  if (adx < ADX_THRESHOLDS.MINIMUM) {
    if (ADX_GATE.GRADUATED_TIERS.ENABLED && adxSlope > 0) {
      adxPositionMultiplier = ADX_GATE.GRADUATED_TIERS.EARLY_TRANSITION.POSITION_MULTIPLIER;
    } else if (adxSlope > -0.5 && adx >= (shortOverrides ? 16 : 18)) {
      adxPositionMultiplier = 0.30;
    } else {
      return fail('ADX_TOO_LOW');
    }
  } else if (adx < ADX_THRESHOLDS.MODERATE) {
    adxPositionMultiplier = adxSlope > 0
      ? (ADX_GATE.GRADUATED_TIERS.FORMING_TREND?.POSITION_MULTIPLIER ?? 0.50)
      : 0.35;
  }

  // GATE 3: Deep StochRSI Extremes
  if (stochK < STOCHRSI_THRESHOLDS.HIGH_REVERSAL_OVERSOLD || stochK > STOCHRSI_THRESHOLDS.HIGH_REVERSAL_OVERBOUGHT) {
    if (adx >= ADX_THRESHOLDS.VERY_STRONG) {
      adxPositionMultiplier = Math.min(adxPositionMultiplier, 0.30);
    } else if (adx >= ADX_THRESHOLDS.STRONG && adxSlope > 0.2) {
      adxPositionMultiplier = Math.min(adxPositionMultiplier, 0.25);
    } else {
      return fail('DEEP_STOCHRSI_EXTREME');
    }
  }

  // GATE 4: Direction
  let direction: 'LONG' | 'SHORT' | null = null;
  const emaBullish = primaryTrend === 'bullish';
  const emaBearish = primaryTrend === 'bearish';
  const dirMinMom = shortOverrides?.directionMinMomentum ?? 10;
  const dirMinAdx = shortOverrides?.directionMinAdxForMomentum ?? ADX_THRESHOLDS.VERY_STRONG;

  if (emaBullish && momentumResult.score > 0) direction = 'LONG';
  else if (emaBearish && momentumResult.score < 0) direction = 'SHORT';
  else if (momentumResult.score > dirMinMom && adx > dirMinAdx) direction = 'LONG';
  else if (momentumResult.score < -dirMinMom && adx > dirMinAdx) direction = 'SHORT';
  else if (adx >= ADX_THRESHOLDS.VERY_STRONG && adxSlope > 0.3) {
    const diPlus = mfs.diPlus || 0;
    const diMinus = mfs.diMinus || 0;
    if (diPlus > diMinus + 5) direction = 'LONG';
    else if (diMinus > diPlus + 5) direction = 'SHORT';
  } else if (adx >= ADX_THRESHOLDS.MODERATE && adxSlope > 0.2) {
    if (momentumResult.score > 5) direction = 'LONG';
    else if (momentumResult.score < -5) direction = 'SHORT';
  }

  const isBtcShort = isBtcSymbol && direction === 'SHORT';
  if (!direction && isBtcSymbol && adx >= 20 && momentumResult.score < -3) {
    const diPlus = mfs.diPlus || 0;
    const diMinus = mfs.diMinus || 0;
    if (diMinus > diPlus + 3) {
      direction = 'SHORT';
      adxPositionMultiplier = Math.min(adxPositionMultiplier, 0.35);
    }
  }
  if (direction === 'SHORT' && isBtcSymbol) {
    shortOverrides = BTC_PARAMS.shortGateOverrides;
  }
  if (!direction) return fail('NO_DIRECTION');

  // GATE 4.5: Global Macro Bias Layer
  // Forensic evidence: LONG PF=0.34 vs SHORT PF=1.42 over 90-day bearish regime.
  // ALL LONG strategies are net negative in bearish macro — no edge exists.
  // Block all LONG trades when primaryTrend is bearish; block all SHORT when bullish.
  if (direction === 'LONG' && primaryTrend === 'bearish') {
    return fail('MACRO_BIAS_LONG_BLOCKED');
  }
  if (direction === 'SHORT' && primaryTrend === 'bullish') {
    return fail('MACRO_BIAS_SHORT_BLOCKED');
  }

  // GATE 5: Counter-Trend
  const ctMinAdx = shortOverrides?.counterTrendMinAdx ?? ADX_THRESHOLDS.EXCEPTIONAL;
  if (direction === 'LONG' && emaBearish && adx > ADX_THRESHOLDS.EXCEPTIONAL) return fail('COUNTER_TREND');
  if (direction === 'SHORT' && emaBullish && adx > ctMinAdx) return fail('COUNTER_TREND');

  // GATE 5.5: StochRSI Directional Protection
  const obThreshold = sp.gates.STOCHRSI_LONG_OVERBOUGHT;
  const osThreshold = sp.gates.STOCHRSI_SHORT_OVERSOLD;
  if (direction === 'SHORT' && stochK > obThreshold) {
    if (adx < ADX_THRESHOLDS.VERY_STRONG) return fail('STOCHRSI_DIRECTIONAL_BLOCK');
    adxPositionMultiplier = Math.min(adxPositionMultiplier, 0.20);
  }
  if (direction === 'LONG' && stochK < osThreshold) {
    if (adx < ADX_THRESHOLDS.VERY_STRONG) return fail('STOCHRSI_DIRECTIONAL_BLOCK');
    adxPositionMultiplier = Math.min(adxPositionMultiplier, 0.20);
  }

  // GATE 5.6: Overbought/Oversold Block
  if (direction === 'LONG' && stochK > obThreshold && adx < ADX_THRESHOLDS.VERY_STRONG) return fail('OVERBOUGHT_LONG_BLOCK');
  if (direction === 'SHORT' && stochK < osThreshold && adx < ADX_THRESHOLDS.VERY_STRONG) return fail('OVERSOLD_SHORT_BLOCK');

  // GATE 6: Momentum Direction Alignment
  const momOpposingThreshold = sp.gates.MOMENTUM_OPPOSING_THRESHOLD;
  if (direction === 'LONG' && momentumResult.score < -momOpposingThreshold) {
    if (adx >= ADX_THRESHOLDS.VERY_STRONG && adxSlope >= 0.3) {
      adxPositionMultiplier = Math.min(adxPositionMultiplier, 0.25);
    } else return fail('MOMENTUM_OPPOSING');
  }
  if (direction === 'SHORT' && momentumResult.score > momOpposingThreshold) {
    if (adx >= ADX_THRESHOLDS.VERY_STRONG && adxSlope >= 0.3) {
      adxPositionMultiplier = Math.min(adxPositionMultiplier, 0.25);
    } else return fail('MOMENTUM_OPPOSING');
  }

  // GATE 7: Severe StochRSI
  if (direction === 'SHORT' && stochK < STOCHRSI_THRESHOLDS.EXTREME_OVERSOLD && adx < ADX_THRESHOLDS.EXTREME) return fail('SEVERE_OVERSOLD_BLOCK');
  if (direction === 'LONG' && stochK > STOCHRSI_THRESHOLDS.EXTREME_OVERBOUGHT && adx < ADX_THRESHOLDS.EXTREME) return fail('SEVERE_OVERBOUGHT_BLOCK');

  // GATE 8: Near-Extreme Protection
  if (direction === 'SHORT' && mfs.distanceFromLowPercent < 0.5) {
    if (adx < ADX_THRESHOLDS.STRONG || adxSlope > 0) return fail('NEAR_24H_LOW');
    adxPositionMultiplier = Math.min(adxPositionMultiplier, 0.25);
  } else if (direction === 'SHORT' && mfs.distanceFromLowPercent < 0.8) {
    adxPositionMultiplier = Math.min(adxPositionMultiplier, 0.40);
  }
  if (direction === 'LONG' && mfs.distanceFromHighPercent < 0.5) {
    if (adx < ADX_THRESHOLDS.STRONG || adxSlope > 0) return fail('NEAR_24H_HIGH');
    adxPositionMultiplier = Math.min(adxPositionMultiplier, 0.25);
  } else if (direction === 'LONG' && mfs.distanceFromHighPercent < 0.8) {
    adxPositionMultiplier = Math.min(adxPositionMultiplier, 0.40);
  }

  // GATE 9: Overextension ATR
  if (momentumResult.overextensionATR > 2.0) {
    if (!(adx >= ADX_THRESHOLDS.VERY_STRONG && adxSlope >= 0.3)) return fail('OVEREXTENSION_ATR');
    adxPositionMultiplier = Math.min(adxPositionMultiplier, 0.20);
  }

  // GATE 10: Quality Score
  const effectiveTrend = direction === 'LONG' ? 'bullish' : 'bearish';
  const qualityResult = calculateQualityScore(mfs, effectiveTrend, mfs.symbol);
  const qualityScore = qualityResult.score;
  const effectiveQualityFloor = (isBtcShort && shortOverrides) ? shortOverrides.minQualityScore : sp.gates.MIN_QUALITY_SCORE;
  if (qualityScore < effectiveQualityFloor) return fail('LOW_QUALITY_HARD_FLOOR');
  if (!isBtcShort && qualityScore < QUALITY_THRESHOLDS.MIN_ENTRY_QUALITY) return fail('LOW_QUALITY');

  // GATE 11: Momentum Slope
  if (momentumResult.isAccelerating) {
    if ((direction === 'LONG' && momentumResult.direction === 'bearish') ||
        (direction === 'SHORT' && momentumResult.direction === 'bullish')) {
      return fail('MOMENTUM_SLOPE_OPPOSING');
    }
  }

  // GATE 12: ADX Slope Decay
  if (adxSlope < -2.0 && adx < ADX_THRESHOLDS.STRONG) return fail('ADX_STRUCTURAL_COLLAPSE');
  if (adxSlope < -1.0) adxPositionMultiplier = Math.min(adxPositionMultiplier, 0.40);
  else if (adxSlope < -0.2) adxPositionMultiplier = Math.min(adxPositionMultiplier, 0.80);

  // Strategy classification
  let strategyName = 'TREND_CONTINUATION';
  if (adx > ADX_THRESHOLDS.VERY_STRONG) strategyName = 'STRONG_TREND';
  // MOMENTUM_ACCELERATION disabled: 14 trades, -5.52% PnL, breakout chase pattern.
  // Accelerating momentum is reclassified into its base strategy (STRONG_TREND or TREND_CONTINUATION).
  // if (momentumResult.isAccelerating) strategyName = 'MOMENTUM_ACCELERATION';

  // GATE: STRONG_TREND Directional Alignment
  // Backtest-proven: counter-trend LONG has 18.2% WR (0 TP hits) → hard block.
  // Counter-trend SHORT also net negative at 0.40x → hard block both sides.
  // Asymmetric 0.40x SHORT tested: PF 0.83 vs symmetric block PF 0.85.
  if (strategyName === 'STRONG_TREND') {
    if (direction === 'LONG' && primaryTrend === 'bearish') {
      return fail('STRONG_TREND_COUNTER_TREND_LONG');
    }
    if (direction === 'SHORT' && primaryTrend === 'bullish') {
      return fail('STRONG_TREND_COUNTER_TREND_SHORT');
    }
  }
  if (mfs.isCompressed) {
    const macdHist = mfs.macdHistogram;
    const squeezeDirConfirmed = (direction === 'LONG' && macdHist > 0 && mfs.macdExpanding) ||
                                 (direction === 'SHORT' && macdHist < 0 && mfs.macdExpanding);
    const squeezeDirPartial = (direction === 'LONG' && macdHist > 0) || (direction === 'SHORT' && macdHist < 0);
    if (squeezeDirConfirmed) {
      strategyName = 'SQUEEZE_BREAKOUT';
    } else if (squeezeDirPartial && adx >= (shortOverrides?.squeezeMinAdxForPartial ?? ADX_THRESHOLDS.MODERATE) && adxSlope > 0) {
      strategyName = 'SQUEEZE_BREAKOUT';
      adxPositionMultiplier = Math.min(adxPositionMultiplier, 0.40);
    } else {
      return fail('SQUEEZE_NO_DIRECTION');
    }

    // Squeeze quality gates
    const sqFilter = BTC_PARAMS.squeezeDepthFilter;
    const volFilter = BTC_PARAMS.volumeExpansionFilter;
    const bodyFilter = BTC_PARAMS.candleBodyFilter;

    if (sqFilter.enabled) {
      const bw = mfs.bollinger?.["1h"]?.bandwidth ?? 99;
      if (bw > sqFilter.maxBandwidth) return fail('SQUEEZE_TOO_SHALLOW');
      if (bw > sqFilter.shallowPenaltyBandwidth) {
        adxPositionMultiplier = Math.min(adxPositionMultiplier, sqFilter.shallowPenaltyMultiplier);
      } else if (bw < sqFilter.deepSqueezeBonusBandwidth) {
        adxPositionMultiplier *= sqFilter.deepSqueezeBonusMultiplier;
      }
    }
    if (volFilter.enabled) {
      const volRatio = mfs.volume?.["1h"]?.volumeRatio ?? mfs.volumeRatio ?? 1.0;
      if (volRatio < volFilter.softMinVolumeRatio) return fail('NO_VOLUME_EXPANSION');
      if (volRatio < volFilter.minVolumeRatio) {
        adxPositionMultiplier = Math.min(adxPositionMultiplier, volFilter.softPositionMultiplier);
      }
    }
    if (bodyFilter.enabled && klines && klines.length > 0) {
      const lastKline = klines[klines.length - 1];
      const open = parseFloat(lastKline[1]);
      const close = parseFloat(lastKline[4]);
      const candleBody = Math.abs(close - open);
      const bodyAtrRatio = mfs.atr > 0 ? candleBody / mfs.atr : 0;
      if (bodyAtrRatio < bodyFilter.minBodyAtrRatio) return fail('WEAK_BREAKOUT_CANDLE');
    }
  }

  // GATE: SQUEEZE_BREAKOUT Directional Alignment
  // Forensic evidence: SQUEEZE_BREAKOUT LONG = -23.36% PnL (52 trades), SHORT = +13.55%
  // Counter-trend breakouts in bearish macro are predominantly fake breakouts.
  if (strategyName === 'SQUEEZE_BREAKOUT') {
    if (direction === 'LONG' && primaryTrend === 'bearish') {
      return fail('SQUEEZE_BREAKOUT_COUNTER_TREND_LONG');
    }
    if (direction === 'SHORT' && primaryTrend === 'bullish') {
      return fail('SQUEEZE_BREAKOUT_COUNTER_TREND_SHORT');
    }
  }

  // GATE: MOMENTUM_ACCELERATION Directional Alignment
  // Forensic evidence: 18 trades, net negative PnL. Breakout chase pattern.
  // Counter-trend momentum entries have no edge.
  if (strategyName === 'MOMENTUM_ACCELERATION') {
    if (direction === 'LONG' && primaryTrend === 'bearish') {
      return fail('MOMENTUM_ACCEL_COUNTER_TREND_LONG');
    }
    if (direction === 'SHORT' && primaryTrend === 'bullish') {
      return fail('MOMENTUM_ACCEL_COUNTER_TREND_SHORT');
    }
  }

  // Apply regime-based multiplier from MFS
  if (mfs.regime === 'RANGE_COMPRESSION' && strategyName !== 'SQUEEZE_BREAKOUT') {
    return fail('REGIME_RANGE_COMPRESSION');
  }
  if (mfs.regime === 'TREND_EXHAUSTION') {
    adxPositionMultiplier = Math.min(adxPositionMultiplier, 0.30);
  }

  return {
    passed: true, gate: null, direction, qualityScore,
    momentumScore: momentumResult.score,
    positionMultiplier: adxPositionMultiplier, strategyName,
  };
}

// ============= PRODUCTION EXIT LOGIC =============

export function checkProductionExits(
  position: BacktestPosition,
  currentPrice: number,
  currentTime: string,
  atr: number,
  atrPercent: number,
  adx: number,
  adxSlope: number,
  primaryTrend: string,
  momentumScore: number,
): { shouldExit: boolean; exitReason: string } {
  const side = position.side;
  const pnlPercent = side === 'LONG'
    ? ((currentPrice - position.entryPrice) / position.entryPrice) * 100
    : ((position.entryPrice - currentPrice) / position.entryPrice) * 100;

  // 1. Stop Loss
  if (side === 'LONG' && currentPrice <= position.stopLoss) return { shouldExit: true, exitReason: 'stop_loss' };
  if (side === 'SHORT' && currentPrice >= position.stopLoss) return { shouldExit: true, exitReason: 'stop_loss' };

  // 2. Take Profit
  if (side === 'LONG' && currentPrice >= position.takeProfit) return { shouldExit: true, exitReason: 'take_profit' };
  if (side === 'SHORT' && currentPrice <= position.takeProfit) return { shouldExit: true, exitReason: 'take_profit' };

  // 3. Peak tracking
  if (pnlPercent > position.peakPnl) {
    position.peakPnl = pnlPercent;
    position.peakReachedAt = currentTime;
  }

  // 4. Decay Velocity Exit
  const posCtx: PositionContext = {
    id: 'bt', side: side === 'LONG' ? 'BUY' : 'SELL',
    entry_price: position.entryPrice, stop_loss: position.stopLoss,
    quantity: 1, opened_at: position.entryTime, executed_at: position.entryTime,
    peak_pnl_percent: position.peakPnl, peak_reached_at: position.peakReachedAt,
    trading_fee_percent: TRADING_FEE_PARAMS.DEFAULT_FEE_RATE_PERCENT,
    entry_atr: position.atrAtEntry * position.entryPrice / 100,
    entry_atr_percent: position.atrPercentAtEntry,
    max_adverse_excursion_atr: null, strategy_name: position.strategyName,
  };
  const mktCtx: MarketContext = { currentPrice, pnlPercent, atrPercent, atr, adx, adxSlope, primaryTrend, momentumScore };
  const exitSettings: UserExitSettings = {
    activationPercent: 0.5, trailingAggressiveness: 3,
    progressiveLockEnabled: true, stalePeakProtectionEnabled: true,
    decayVelocityExitEnabled: true,
  };
  const decayResult = evaluateDecayVelocity(posCtx, mktCtx, exitSettings);
  if (decayResult.shouldExit) return { shouldExit: true, exitReason: decayResult.exitReason };

  // 5. Trailing Stop
  const isBtcShort = position.symbol.startsWith('BTC') && side === 'SHORT';
  const btcShortTrail = BTC_PARAMS.shortTrailing;
  if (isBtcShort && position.peakPnl >= btcShortTrail.activationPercent) {
    let trailDistance = btcShortTrail.tiers[0].trailDistance;
    for (const tier of btcShortTrail.tiers) {
      if (position.peakPnl >= tier.peakThreshold) trailDistance = tier.trailDistance;
    }
    if (adx >= btcShortTrail.adxRelaxationThreshold) trailDistance *= btcShortTrail.adxRelaxationMultiplier;
    const lockLevel = Math.max(btcShortTrail.minTrailFloor, position.peakPnl * (1 - trailDistance));
    if (pnlPercent < lockLevel && pnlPercent > 0) return { shouldExit: true, exitReason: 'trailing_stop' };
  } else if (!isBtcShort && position.peakPnl >= 0.8) {
    let trailDistance: number;
    if (position.peakPnl >= 2.0) trailDistance = 0.12;
    else if (position.peakPnl >= 1.5) trailDistance = 0.15;
    else if (position.peakPnl >= 1.0) trailDistance = 0.18;
    else trailDistance = 0.25;
    const lockLevel = Math.max(0.5, position.peakPnl * (1 - trailDistance));
    if (pnlPercent < lockLevel && pnlPercent > 0) return { shouldExit: true, exitReason: 'trailing_stop' };
  }

  // 6. Micro Profit Lock
  if (position.peakPnl > 0.10 && position.peakPnl < 0.60) {
    const microResult = evaluateMicroProfitLock(posCtx, position.peakPnl);
    if (microResult.applied && microResult.newStopLoss !== null) {
      const shouldExit = side === 'LONG' ? currentPrice <= microResult.newStopLoss : currentPrice >= microResult.newStopLoss;
      if (shouldExit) return { shouldExit: true, exitReason: 'micro_profit_lock' };
    }
  }

  // 7. Progressive Profit Lock
  if (position.peakPnl >= 0.40 && position.peakPnl < 2.75) {
    const progResult = evaluateProgressiveProfitLock(posCtx, position.peakPnl);
    if (progResult.applied && progResult.newStopLoss !== null) {
      const shouldExit = side === 'LONG' ? currentPrice <= progResult.newStopLoss : currentPrice >= progResult.newStopLoss;
      if (shouldExit) return { shouldExit: true, exitReason: 'progressive_profit_lock' };
    }
  }

  // 8. Time stop
  const entryTime = new Date(position.entryTime).getTime();
  const currentTimestamp = new Date(currentTime).getTime();
  const hoursHeld = (currentTimestamp - entryTime) / (1000 * 60 * 60);
  if (hoursHeld > 24) return { shouldExit: true, exitReason: 'time_stop_24h' };

  // 9. Moderate exhaustion exit
  if (position.peakPnl > 0.35 && pnlPercent < position.peakPnl * 0.25) return { shouldExit: true, exitReason: 'moderate_exhaustion_exit' };

  // 10. Momentum reversal exit
  const symParams = getSymbolParams(position.symbol);
  if (hoursHeld > symParams.exits.momentumReversalMinHours) {
    if ((side === 'LONG' && momentumScore < -symParams.exits.momentumReversalScore && primaryTrend === 'bearish') ||
        (side === 'SHORT' && momentumScore > symParams.exits.momentumReversalScore && primaryTrend === 'bullish')) {
      if (pnlPercent < symParams.exits.momentumReversalThreshold) return { shouldExit: true, exitReason: 'momentum_reversal_exit' };
    }
  }

  // 10b. Early momentum flip
  if (hoursHeld > symParams.exits.earlyFlipMinHours && hoursHeld <= symParams.exits.earlyFlipMaxHours) {
    if ((side === 'LONG' && momentumScore < -symParams.exits.earlyMomentumFlipScore) ||
        (side === 'SHORT' && momentumScore > symParams.exits.earlyMomentumFlipScore)) {
      if (pnlPercent < symParams.exits.earlyMomentumFlipThreshold) return { shouldExit: true, exitReason: 'early_momentum_flip_exit' };
    }
  }

  // 11. ADX collapse exit
  if (adx < 15 && adxSlope < -1.0 && hoursHeld > 4 && pnlPercent < 0.3) return { shouldExit: true, exitReason: 'adx_collapse_exit' };

  // 12. Altcoin hard PnL floor
  const isBtc = position.symbol.startsWith('BTC');
  if (!isBtc && pnlPercent < -symParams.stopLoss.maxCapPercent) return { shouldExit: true, exitReason: 'hard_pnl_floor_exit' };

  // 13. Altcoin stale loss cut
  if (!isBtc && hoursHeld > 3 && pnlPercent < -0.5 && pnlPercent < position.peakPnl - 0.3) return { shouldExit: true, exitReason: 'stale_loss_exit' };

  return { shouldExit: false, exitReason: '' };
}
