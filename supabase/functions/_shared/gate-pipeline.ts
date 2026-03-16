// ============= SIMPLIFIED GATE PIPELINE =============
// RADICAL SIMPLIFICATION: 12+ gates → 5 essential gates
// Philosophy: Participate aggressively, manage risk via position sizing + exits
// Hard blocks only for truly dangerous setups, everything else is soft sizing

import type { MarketFeatureSnapshot } from "./market-feature-snapshot.ts";
import type { MomentumScoreResult } from "./smart-momentum.ts";
import {
  ADX_THRESHOLDS, STOCHRSI_THRESHOLDS,
  QUALITY_THRESHOLDS, TRADING_FEE_PARAMS,
  getSymbolParams, BTC_PARAMS,
  DYNAMIC_SL_PARAMS, STRATEGY_SL_OVERRIDES,
  GATE_CONFLICT_DETECTOR,
} from "./constants.ts";
import { calculateQualityScore } from "./scoring.ts";
import {
  evaluateDecayVelocity, evaluateProgressiveProfitLock,
  evaluateMicroProfitLock, calculateFeeAwarePnL,
  evaluateMRTrailingTP,
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

// ============= SIMPLIFIED PRODUCTION GATE PIPELINE =============
// Only 5 hard gates. Everything else is position sizing adjustment.

export function evaluateProductionGates(
  mfs: MarketFeatureSnapshot,
  momentumResult: MomentumScoreResult,
  symbol?: string,
  klines?: any[],
): GateResult {
  const sp = getSymbolParams(symbol || mfs.symbol);
  let positionMultiplier = 1.0;

  const fail = (gate: string): GateResult => ({
    passed: false, gate, direction: null, qualityScore: 0,
    momentumScore: momentumResult.score, positionMultiplier: 0, strategyName: '',
  });

  const adx = mfs.adx;
  const adxSlope = mfs.adxSlope;
  const stochK = mfs.stochRsi["1h"].k;
  const primaryTrend = mfs.primaryTrend;

  // ═══════════════════════════════════════════════════════════════
  // GATE 1: ADX Minimum Energy (Hard Floor = 14)
  // Without ANY trend energy, no directional trade is valid
  // ═══════════════════════════════════════════════════════════════
  if (adx < 14) return fail('ADX_NO_ENERGY');

  // Graduated ADX sizing (soft adjustments, NOT hard blocks)
  if (adx < 18) {
    positionMultiplier = 0.30; // Very low energy = micro probe
  } else if (adx < 22) {
    positionMultiplier = 0.50; // Low energy = cautious
  } else if (adx < 30) {
    positionMultiplier = 0.75; // Moderate = standard
  }
  // ADX >= 30 = full position (1.0x)

  // Bonus for very strong trends
  if (adx >= 40 && adxSlope > 0) {
    positionMultiplier = Math.min(positionMultiplier * 1.15, 1.0);
  }

  // ═══════════════════════════════════════════════════════════════
  // GATE 2: Direction Determination
  // Simple: trend + momentum alignment = direction
  // ═══════════════════════════════════════════════════════════════
  let direction: 'LONG' | 'SHORT' | null = null;
  const emaBullish = primaryTrend === 'bullish';
  const emaBearish = primaryTrend === 'bearish';

  // Primary: Trend + momentum agreement
  if (emaBullish && momentumResult.score > 0) direction = 'LONG';
  else if (emaBearish && momentumResult.score < 0) direction = 'SHORT';
  // Secondary: Strong momentum with moderate ADX
  else if (momentumResult.score > 8 && adx > 20) direction = 'LONG';
  else if (momentumResult.score < -8 && adx > 20) direction = 'SHORT';
  // Tertiary: DI separation with ADX energy
  else if (adx >= 25 && adxSlope > 0) {
    const diPlus = mfs.diPlus || 0;
    const diMinus = mfs.diMinus || 0;
    if (diPlus > diMinus + 5) direction = 'LONG';
    else if (diMinus > diPlus + 5) direction = 'SHORT';
  }
  // Quaternary: Moderate momentum in moderate energy
  else if (adx >= 18) {
    if (momentumResult.score > 3) direction = 'LONG';
    else if (momentumResult.score < -3) direction = 'SHORT';
  }

  if (!direction) return fail('NO_DIRECTION');

  // ═══════════════════════════════════════════════════════════════
  // GATE 3: Macro Bias (Soft — sizing reduction, NOT hard block)
  // Counter-trend trades get 30% position, not blocked entirely
  // ═══════════════════════════════════════════════════════════════
  if (direction === 'LONG' && primaryTrend === 'bearish') {
    // Counter-trend LONG in bearish: reduced but allowed
    // Deep oversold = bigger position (bounce opportunity)
    if (stochK < 15) {
      positionMultiplier = Math.min(positionMultiplier, 0.40); // Deep oversold bounce
      logger.info(`🔄 COUNTER-TREND LONG allowed: deep oversold K=${stochK.toFixed(1)}, pos=${(positionMultiplier * 100).toFixed(0)}%`);
    } else if (stochK < 30) {
      positionMultiplier = Math.min(positionMultiplier, 0.30); // Oversold bounce probe
      logger.info(`🔄 COUNTER-TREND LONG allowed: oversold K=${stochK.toFixed(1)}, pos=${(positionMultiplier * 100).toFixed(0)}%`);
    } else {
      positionMultiplier = Math.min(positionMultiplier, 0.20); // Very small counter-trend probe
      logger.info(`🔄 COUNTER-TREND LONG micro-probe: K=${stochK.toFixed(1)}, pos=${(positionMultiplier * 100).toFixed(0)}%`);
    }
  }
  if (direction === 'SHORT' && primaryTrend === 'bullish') {
    if (stochK > 85) {
      positionMultiplier = Math.min(positionMultiplier, 0.40); // Deep overbought
    } else if (stochK > 70) {
      positionMultiplier = Math.min(positionMultiplier, 0.30);
    } else {
      positionMultiplier = Math.min(positionMultiplier, 0.20);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // GATE 4: Momentum Opposing (Hard block only for STRONG opposing)
  // Reduced threshold: only block when momentum is strongly against trade
  // ═══════════════════════════════════════════════════════════════
  if (direction === 'LONG' && momentumResult.score < -20 && momentumResult.isAccelerating) {
    // Only block if momentum is strongly accelerating AGAINST the trade
    if (adx < 35) return fail('MOMENTUM_STRONGLY_OPPOSING');
    positionMultiplier = Math.min(positionMultiplier, 0.25);
  }
  if (direction === 'SHORT' && momentumResult.score > 20 && momentumResult.isAccelerating) {
    if (adx < 35) return fail('MOMENTUM_STRONGLY_OPPOSING');
    positionMultiplier = Math.min(positionMultiplier, 0.25);
  }

  // Soft opposing penalty (not a block)
  if (direction === 'LONG' && momentumResult.score < -10) {
    positionMultiplier *= 0.70;
  } else if (direction === 'SHORT' && momentumResult.score > 10) {
    positionMultiplier *= 0.70;
  }

  // ═══════════════════════════════════════════════════════════════
  // GATE 5: Quality Score (Lowered floor — let more trades through)
  // ═══════════════════════════════════════════════════════════════
  const effectiveTrend = direction === 'LONG' ? 'bullish' : 'bearish';
  const qualityResult = calculateQualityScore(mfs, effectiveTrend, mfs.symbol);
  const qualityScore = qualityResult.score;

  // Only hard block at very low quality (< 35)
  if (qualityScore < 35) return fail('VERY_LOW_QUALITY');

  // ═══════════════════════════════════════════════════════════════
  // GATE 5b: BTC SHORT Stricter Filter
  // BTC SHORT WR %25 → require higher quality + ADX slope confirmation
  // ═══════════════════════════════════════════════════════════════
  const isBtcShort = (symbol || mfs.symbol) === 'BTCUSDT' && direction === 'SHORT';
  if (isBtcShort) {
    // Higher quality floor for BTC SHORT (55 vs 35 default)
    if (qualityScore < 55) {
      logger.info(`🚫 BTC SHORT quality filter: quality=${qualityScore} < 55, blocking`);
      return fail('BTC_SHORT_LOW_QUALITY');
    }
    // ADX slope must not be strongly decaying for BTC SHORT
    if (adxSlope < -0.5) {
      logger.info(`🚫 BTC SHORT ADX slope filter: slope=${adxSlope.toFixed(2)} < -0.5, blocking`);
      return fail('BTC_SHORT_ADX_DECAY');
    }
    // Require minimum momentum strength for BTC SHORT
    if (Math.abs(momentumResult.score) < 8) {
      positionMultiplier *= 0.50;
      logger.info(`⚠️ BTC SHORT weak momentum: score=${momentumResult.score}, pos reduced to ${(positionMultiplier * 100).toFixed(0)}%`);
    }
  }

  // Graduated quality sizing
  if (qualityScore < 50) {
    positionMultiplier *= 0.50;
  } else if (qualityScore < 60) {
    positionMultiplier *= 0.70;
  } else if (qualityScore < 70) {
    positionMultiplier *= 0.85;
  }
  // qualityScore >= 70 = full position

  // ═══════════════════════════════════════════════════════════════
  // SOFT ADJUSTMENTS (position sizing, never hard blocks)
  // ═══════════════════════════════════════════════════════════════

  // StochRSI extremes: reduce position, don't block
  if (direction === 'SHORT' && stochK < 10) {
    positionMultiplier *= 0.60; // Very oversold for SHORT = risky
  } else if (direction === 'LONG' && stochK > 90) {
    positionMultiplier *= 0.60; // Very overbought for LONG = risky
  }

  // Near 24h extreme: reduce position, don't block
  if (direction === 'SHORT' && mfs.distanceFromLowPercent < 0.5) {
    positionMultiplier *= 0.50; // Near 24h low = risky for SHORT
  } else if (direction === 'LONG' && mfs.distanceFromHighPercent < 0.5) {
    positionMultiplier *= 0.50; // Near 24h high = risky for LONG
  }

  // Overextension: reduce position, don't block
  if (momentumResult.overextensionATR > 2.0) {
    if (adx >= 35 && adxSlope > 0) {
      positionMultiplier *= 0.50; // Strong trend + overextended = cautious
    } else {
      positionMultiplier *= 0.30; // Weak trend + overextended = very cautious
    }
  }

  // ADX slope decay: reduce position
  if (adxSlope < -2.0) {
    positionMultiplier *= 0.40;
  } else if (adxSlope < -1.0) {
    positionMultiplier *= 0.60;
  } else if (adxSlope < -0.3) {
    positionMultiplier *= 0.80;
  }

  // Regime-based adjustment
  if (mfs.regime === 'RANGE_COMPRESSION') {
    positionMultiplier *= 0.35; // Small range trades, not blocked
  } else if (mfs.regime === 'TREND_EXHAUSTION') {
    positionMultiplier *= 0.50;
  }

  // Compressed/squeeze: bonus if direction confirmed
  if (mfs.isCompressed) {
    const macdHist = mfs.macdHistogram;
    const squeezeDirConfirmed = (direction === 'LONG' && macdHist > 0) || (direction === 'SHORT' && macdHist < 0);
    if (squeezeDirConfirmed) {
      positionMultiplier *= 1.10; // Squeeze breakout bonus
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // STRATEGY CLASSIFICATION (No routing blocks!)
  // ═══════════════════════════════════════════════════════════════
  let strategyName = 'TREND_CONTINUATION';
  if (adx > ADX_THRESHOLDS.VERY_STRONG) strategyName = 'STRONG_TREND';
  if (mfs.isCompressed) {
    const macdHist = mfs.macdHistogram;
    if ((direction === 'LONG' && macdHist > 0) || (direction === 'SHORT' && macdHist < 0)) {
      strategyName = 'SQUEEZE_BREAKOUT';
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // TREND_CONTINUATION Surgical Fixes v2 (Forensic 2026-03-16)
  // v1: RANGE_COMPRESSION LONG block, TREND_EXPANSION SHORT quality
  // v2: volume_relaxation_timeout bleeding (-1.212%), SELL partial_loss (-4.48$)
  //     trailing_stop avg +0.161% too low — progressive lock not capturing
  // ═══════════════════════════════════════════════════════════════
  if (strategyName === 'TREND_CONTINUATION') {
    // Fix 1 (v1): Block LONG in RANGE_COMPRESSION — 30 trades, 30% WR, -13.09 PnL
    if (mfs.regime === 'RANGE_COMPRESSION' && direction === 'LONG') {
      logger.info(`🚫 TREND_CONTINUATION LONG blocked in RANGE_COMPRESSION: regime=${mfs.regime}`);
      return fail('TC_RANGE_COMPRESSION_LONG_BLOCKED');
    }
    // Fix 2 (v1): TREND_EXPANSION SHORT requires quality >= 55
    if (mfs.regime === 'TREND_EXPANSION' && direction === 'SHORT' && qualityScore < 55) {
      logger.info(`🚫 TREND_CONTINUATION SHORT low quality in TREND_EXPANSION: quality=${qualityScore} < 55`);
      return fail('TC_EXPANSION_SHORT_LOW_QUALITY');
    }
    // Fix 3 (v2): SELL side with declining ADX → halve position
    // Forensic: 4 partial_loss trades all SELL, avg -0.85%, all with peak_pct near 0
    if (direction === 'SHORT' && adxSlope < -0.3) {
      positionMultiplier *= 0.50;
      logger.info(`⚠️ TC SHORT ADX declining: slope=${adxSlope.toFixed(2)}, pos halved`);
    }
    // Fix 4 (v2): Block SELL entry when StochK < 20 (oversold = bad SHORT timing)
    // Forensic: XRPUSDT SELL -1.226% entered at oversold levels
    if (direction === 'SHORT' && stochK < 20) {
      logger.info(`🚫 TC SHORT blocked: StochK=${stochK.toFixed(1)} < 20 (oversold entry)`);
      return fail('TC_SHORT_OVERSOLD_ENTRY');
    }
    // Fix 5 (v2): Require momentum alignment for BUY
    // Forensic: DOTUSDT BUY -0.692% with weak momentum
    if (direction === 'LONG' && momentumResult.score < 3 && adx < 25) {
      positionMultiplier *= 0.40;
      logger.info(`⚠️ TC LONG weak momentum: score=${momentumResult.score}, adx=${adx.toFixed(1)}, pos reduced`);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // STRONG_TREND Surgical Fixes v2 (Forensic 2026-03-16)
  // v1: StochRSI overbought/oversold entry blocks
  // v2: ALL top 11 worst losses are SELL side. BUY 11T 27.3% WR.
  //     SL bleeding: 8 SL + 10 partial_loss = -$25.67 total
  //     partial_loss trades avg -1.514% with peak_pct=0 (instant loss)
  // ═══════════════════════════════════════════════════════════════
  if (strategyName === 'STRONG_TREND') {
    // Fix 1 (v1): StochRSI entry filter — block overbought LONG / oversold SHORT
    if (direction === 'LONG' && stochK > 70) {
      logger.info(`🚫 STRONG_TREND LONG blocked: StochK=${stochK.toFixed(1)} > 70 (overbought entry)`);
      return fail('STRONG_TREND_STOCH_OVERBOUGHT');
    }
    if (direction === 'SHORT' && stochK < 30) {
      logger.info(`🚫 STRONG_TREND SHORT blocked: StochK=${stochK.toFixed(1)} < 30 (oversold entry)`);
      return fail('STRONG_TREND_STOCH_OVERSOLD');
    }
    // Fix 2 (v2): SELL with declining ADX slope → reduce position
    // Forensic: 10 partial_loss SELL trades with peak_pct=0, avg -1.514%
    if (direction === 'SHORT' && adxSlope < 0) {
      positionMultiplier *= 0.50;
      logger.info(`⚠️ ST SHORT declining ADX: slope=${adxSlope.toFixed(2)}, pos halved`);
    }
    // Fix 3 (v2): BUY side quality gate — BUY WR 27.3% (3/11)
    // Only allow BUY with strong momentum confirmation
    if (direction === 'LONG' && momentumResult.score < 8) {
      positionMultiplier *= 0.40;
      logger.info(`⚠️ ST LONG weak momentum: score=${momentumResult.score}, pos reduced to 40%`);
    }
    // Fix 4 (v2): High-ATR SELL guard — DOTUSDT (ATR 2.5%) losses were most severe
    const atrPct = mfs.atrPercent || 0;
    if (direction === 'SHORT' && atrPct > 1.5 && qualityScore < 65) {
      positionMultiplier *= 0.50;
      logger.info(`⚠️ ST SHORT high-ATR guard: atr=${atrPct.toFixed(2)}%, quality=${qualityScore}, pos halved`);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // SQUEEZE_BREAKOUT Optimization Layer
  // Improve WR from 47% → 50%+ by adding StochRSI directional confirmation
  // ═══════════════════════════════════════════════════════════════
  if (strategyName === 'SQUEEZE_BREAKOUT') {
    // === FIX 1: Stricter BUY directional filter (forensic: 6 BUY trades avg -0.036%) ===
    // Require momentum confirmation AND ADX slope rising for BUY entries
    if (direction === 'LONG') {
      // Hard block: BUY in bearish trend with weak momentum
      if (primaryTrend === 'bearish' && momentumResult.score < 10) {
        logger.info(`🚫 SQUEEZE_BREAKOUT LONG blocked: bearish trend + weak momentum (${momentumResult.score})`);
        return fail('SQUEEZE_BUY_COUNTER_TREND_WEAK');
      }
      // Hard block: BUY with StochRSI overbought (K > 70) — forensic: entries at high K fail
      if (stochK > 70) {
        logger.info(`🚫 SQUEEZE_BREAKOUT LONG blocked: overbought K=${stochK.toFixed(1)} > 70`);
        return fail('SQUEEZE_BUY_OVERBOUGHT');
      }
      // Sizing reduction: moderate overbought zone
      if (stochK > 60) {
        positionMultiplier *= 0.60;
        logger.info(`⚠️ SQUEEZE_BREAKOUT LONG overbought filter: K=${stochK.toFixed(1)}, pos reduced`);
      }
      // Require ADX slope rising for BUY — declining ADX = fading energy
      if (adxSlope < 0) {
        positionMultiplier *= 0.50;
        logger.info(`⚠️ SQUEEZE_BREAKOUT LONG ADX declining: slope=${adxSlope.toFixed(2)}, pos halved`);
      }
    } else if (direction === 'SHORT' && stochK < 25) {
      positionMultiplier *= 0.60; // Already oversold → risky SHORT squeeze
      logger.info(`⚠️ SQUEEZE_BREAKOUT SHORT oversold filter: K=${stochK.toFixed(1)}, pos reduced`);
    }

    // ADX minimum for squeeze: require at least 18 for meaningful breakout
    if (adx < 18) {
      positionMultiplier *= 0.50;
      logger.info(`⚠️ SQUEEZE_BREAKOUT low ADX: ${adx.toFixed(1)} < 18, pos reduced`);
    }

    // Momentum alignment bonus: when momentum strongly confirms direction
    if ((direction === 'LONG' && momentumResult.score > 15) || (direction === 'SHORT' && momentumResult.score < -15)) {
      positionMultiplier *= 1.15; // Strong momentum + squeeze = high conviction
      logger.info(`💪 SQUEEZE_BREAKOUT momentum bonus: mom=${momentumResult.score}, pos boosted`);
    }

    // Deep squeeze bonus
    const bbWidth = mfs.bollinger?.["1h"]?.width || 0;
    if (bbWidth > 0 && bbWidth < 2.0) {
      positionMultiplier *= 1.20; // Very tight squeeze = strong breakout potential
      logger.info(`🔥 SQUEEZE_BREAKOUT deep squeeze: bbWidth=${bbWidth.toFixed(2)}, 20% bonus`);
    } else if (bbWidth > 0 && bbWidth > 2.5 && bbWidth < 3.0) {
      positionMultiplier *= 0.70; // Shallow squeeze = lower conviction
    }
  }

  // Floor: minimum 10% position (never zero unless hard-blocked)
  positionMultiplier = Math.max(positionMultiplier, 0.10);

  logger.info(`✅ GATE PASS: ${symbol || mfs.symbol} ${direction} | strategy=${strategyName} | ADX=${adx.toFixed(1)} slope=${adxSlope.toFixed(2)} | K=${stochK.toFixed(1)} | mom=${momentumResult.score} | quality=${qualityScore} | pos=${(positionMultiplier * 100).toFixed(0)}%`);

  return {
    passed: true, gate: null, direction, qualityScore,
    momentumScore: momentumResult.score,
    positionMultiplier, strategyName,
  };
}

// ============= GATE CONFLICT DETECTOR =============

export function detectGateConflict(
  mfs: MarketFeatureSnapshot,
  momentumResult: MomentumScoreResult,
  symbol: string,
): { longBlocked: boolean; shortBlocked: boolean; deadlocked: boolean; reason: string } {
  const longResult = evaluateProductionGates({ ...mfs, primaryTrend: mfs.primaryTrend } as any, momentumResult, symbol);
  const shortResult = evaluateProductionGates({ ...mfs, primaryTrend: mfs.primaryTrend } as any, { ...momentumResult, score: -momentumResult.score } as any, symbol);
  
  const longBlocked = !longResult.passed;
  const shortBlocked = !shortResult.passed;
  const deadlocked = longBlocked && shortBlocked;
  
  if (deadlocked && GATE_CONFLICT_DETECTOR.ENABLED) {
    logger.warn(`⚠️ GATE DEADLOCK: ${symbol} — LONG blocked by ${longResult.gate}, SHORT blocked by ${shortResult.gate} | ADX=${mfs.adx.toFixed(1)}, K=${mfs.stochRsi["1h"].k.toFixed(1)}, trend=${mfs.primaryTrend}, regime=${mfs.regime}`);
  }
  
  return {
    longBlocked,
    shortBlocked,
    deadlocked,
    reason: deadlocked ? `LONG:${longResult.gate} + SHORT:${shortResult.gate}` : 'OK',
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
  if (position.peakPnl >= 0.8) {
    let trailDistance: number;
    if (position.peakPnl >= 2.0) trailDistance = 0.12;
    else if (position.peakPnl >= 1.5) trailDistance = 0.15;
    else if (position.peakPnl >= 1.0) trailDistance = 0.18;
    else trailDistance = 0.25;
    
    // Give more room in strong trends
    if (adx >= 35 && adxSlope > 0) trailDistance *= 1.3;
    
    const lockLevel = Math.max(0.4, position.peakPnl * (1 - trailDistance));
    if (pnlPercent < lockLevel && pnlPercent > 0) return { shouldExit: true, exitReason: 'trailing_stop' };
  }

  // 6. Micro Profit Lock (BYPASSED for STRONG_TREND & TREND_CONTINUATION — forensic: negative PnL drag)
  const skipMicroLock = position.strategyName === 'STRONG_TREND' || position.strategyName === 'TREND_CONTINUATION';
  if (!skipMicroLock && position.peakPnl > 0.10 && position.peakPnl < 0.60) {
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

  // 8. MR Trailing TP
  const mrTrailing = evaluateMRTrailingTP(posCtx, mktCtx);
  if (mrTrailing.shouldActivateTrailing && mrTrailing.suggestedStopLoss !== null) {
    const shouldExit = side === 'LONG' ? currentPrice <= mrTrailing.suggestedStopLoss : currentPrice >= mrTrailing.suggestedStopLoss;
    if (shouldExit) return { shouldExit: true, exitReason: 'mr_trailing_tp_exit' };
  }

  // 9. Time stop (24h max hold)
  const entryTime = new Date(position.entryTime).getTime();
  const currentTimestamp = new Date(currentTime).getTime();
  const hoursHeld = (currentTimestamp - entryTime) / (1000 * 60 * 60);
  if (hoursHeld > 24) return { shouldExit: true, exitReason: 'time_stop_24h' };

  // 10. Moderate exhaustion exit
  if (position.peakPnl > 0.35 && pnlPercent < position.peakPnl * 0.25) return { shouldExit: true, exitReason: 'moderate_exhaustion_exit' };

  // 11. Momentum reversal exit
  const symParams = getSymbolParams(position.symbol);
  if (hoursHeld > symParams.exits.momentumReversalMinHours) {
    if ((side === 'LONG' && momentumScore < -symParams.exits.momentumReversalScore && primaryTrend === 'bearish') ||
        (side === 'SHORT' && momentumScore > symParams.exits.momentumReversalScore && primaryTrend === 'bullish')) {
      if (pnlPercent < symParams.exits.momentumReversalThreshold) return { shouldExit: true, exitReason: 'momentum_reversal_exit' };
    }
  }

  // 12. ADX collapse exit
  if (adx < 15 && adxSlope < -1.0 && hoursHeld > 4 && pnlPercent < 0.3) return { shouldExit: true, exitReason: 'adx_collapse_exit' };

  // 13. Hard PnL floor
  let hardFloorPercent = symParams.stopLoss.maxCapPercent;
  const stratOverride = STRATEGY_SL_OVERRIDES[position.strategyName || ''];
  if (stratOverride?.maxCapOverride) {
    hardFloorPercent = Math.min(hardFloorPercent, stratOverride.maxCapOverride);
  }
  if (DYNAMIC_SL_PARAMS.ENABLED && position.atrPercentAtEntry) {
    if (position.atrPercentAtEntry > DYNAMIC_SL_PARAMS.EXTREME_ATR_THRESHOLD_PERCENT) {
      hardFloorPercent *= DYNAMIC_SL_PARAMS.EXTREME_ATR_CAP_MULTIPLIER;
    } else if (position.atrPercentAtEntry > DYNAMIC_SL_PARAMS.HIGH_ATR_THRESHOLD_PERCENT) {
      hardFloorPercent *= DYNAMIC_SL_PARAMS.HIGH_ATR_CAP_MULTIPLIER;
    }
  }
  if (pnlPercent < -hardFloorPercent) return { shouldExit: true, exitReason: 'hard_pnl_floor_exit' };

  return { shouldExit: false, exitReason: '' };
}
