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
import { calculateQualitySubScores, getStrategyFloors, type QualitySubScores } from "./quality-score.ts";
import {
  evaluateDecayVelocity, evaluateProgressiveProfitLock,
  evaluateMicroProfitLock, calculateFeeAwarePnL,
  evaluateMRTrailingTP,
  type PositionContext, type MarketContext, type UserExitSettings,
} from "./exit-strategies.ts";
import { createLogger } from "./logging.ts";
import { classifyGateFamily, type GateFamily } from "./gate-family.ts";
import { evaluateStochContext, type StochContext } from "./stoch-authority.ts";
import { strictBlock, GATE_FLAGS } from "./gate-flags.ts";

const logger = createLogger('gate-pipeline');

export { classifyGateFamily } from "./gate-family.ts";
export type { GateFamily } from "./gate-family.ts";
export { GATE_FLAGS, CANONICAL_HARD_GATES, isCanonicalHardGate } from "./gate-flags.ts";
export type { GateStrictnessMode, GateFlags } from "./gate-flags.ts";

// ============= TYPES =============

export interface GateResult {
  passed: boolean;
  gate: string | null;
  gateFamily: GateFamily | null;
  direction: 'LONG' | 'SHORT' | null;
  qualityScore: number;
  momentumScore: number;
  positionMultiplier: number;
  strategyName: string;
  // Phase 2: quality sub-scores (entry/trend/context, each 0-100)
  entryQ?: number;
  trendQ?: number;
  contextQ?: number;
  breachedFloors?: string[];
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
    passed: false, gate, gateFamily: classifyGateFamily(gate),
    direction: null, qualityScore: 0,
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
  // STOCH AUTHORITY (Phase 1 unification)
  // Single call replaces 8 scattered StochRSI layers.
  // See _shared/stoch-authority.ts for tier logic.
  // ═══════════════════════════════════════════════════════════════
  const stochCtx: StochContext = evaluateStochContext(mfs, direction, { adxSlope, timeframe: '1h' });
  if (stochCtx.hardBlock) {
    logger.info(`🚫 STOCH ABSOLUTE BLOCK: ${symbol || mfs.symbol} ${direction} | ${stochCtx.reason}`);
    return fail(stochCtx.hardBlockReason || 'STOCH_ABSOLUTE_EXTREME');
  }
  // Apply soft runway multiplier once — replaces all previous stoch-based sizing.
  positionMultiplier *= stochCtx.runwayMultiplier;

  // ═══════════════════════════════════════════════════════════════
  // GATE 3: Macro Bias (counter-trend sizing)
  // Uses StochContext tier (deep-favorable = better bounce opportunity).
  // ═══════════════════════════════════════════════════════════════
  if (direction === 'LONG' && primaryTrend === 'bearish') {
    if (stochCtx.tier === 'DEEP_FAVORABLE') {
      positionMultiplier = Math.min(positionMultiplier, 0.40);
    } else if (stochCtx.tier === 'FAVORABLE') {
      positionMultiplier = Math.min(positionMultiplier, 0.30);
    } else {
      positionMultiplier = Math.min(positionMultiplier, 0.20);
    }
    logger.info(`🔄 COUNTER-TREND LONG: tier=${stochCtx.tier} K=${stochCtx.kValue.toFixed(1)} pos=${(positionMultiplier * 100).toFixed(0)}%`);
  }
  if (direction === 'SHORT' && primaryTrend === 'bullish') {
    if (stochCtx.tier === 'DEEP_FAVORABLE') {
      positionMultiplier = Math.min(positionMultiplier, 0.40);
    } else if (stochCtx.tier === 'FAVORABLE') {
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
  // GATE 5: Quality Score — DECOMPOSED (Phase 2)
  // Legacy total score kept for VERY_LOW_QUALITY hard floor.
  // New: entryQ / trendQ / contextQ sub-scores drive interpretable sizing.
  // ═══════════════════════════════════════════════════════════════
  const effectiveTrend = direction === 'LONG' ? 'bullish' : 'bearish';
  const subScores: QualitySubScores = calculateQualitySubScores(mfs, effectiveTrend, mfs.symbol);
  const qualityScore = subScores.total;

  // Hard floor unchanged: aggregate quality below 35 is dangerous.
  if (qualityScore < 35) return fail('VERY_LOW_QUALITY');

  // Sub-score soft sizing (0.42 – 1.10x). Reason is preserved for forensics.
  positionMultiplier *= subScores.sizingMultiplier;
  if (subScores.breachedFloors.length > 0) {
    logger.info(`⚠️ QUALITY SUB-SCORE: ${symbol || mfs.symbol} ${direction} | ${subScores.reason} → sizing x${subScores.sizingMultiplier.toFixed(2)}`);
  } else if (subScores.isAllStrong) {
    logger.info(`✨ QUALITY ALL-STRONG: ${symbol || mfs.symbol} ${direction} | ${subScores.reason} → sizing x${subScores.sizingMultiplier.toFixed(2)}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // GATE 5b: BTC SHORT Stricter Filter
  // BTC SHORT WR %25 → require higher quality + ADX slope confirmation
  // ═══════════════════════════════════════════════════════════════
  const isBtcShort = (symbol || mfs.symbol) === 'BTCUSDT' && direction === 'SHORT';
  if (isBtcShort) {
    // Higher quality floor for BTC SHORT (55 vs 35 default)
    if (qualityScore < 55) {
      const d = strictBlock('BTC_SHORT_LOW_QUALITY');
      if (d.hardBlock) {
        logger.info(`🚫 BTC SHORT quality filter: quality=${qualityScore} < 55, blocking${d.shadowSoft ? ' [shadow-soft]' : ''}`);
        return fail(d.reason);
      }
      positionMultiplier *= d.softMultiplier;
      logger.info(`⚠️ BTC SHORT quality soft: quality=${qualityScore} < 55, pos x${d.softMultiplier}`);
    }
    // ADX slope must not be strongly decaying for BTC SHORT
    if (adxSlope < -0.5) {
      const d = strictBlock('BTC_SHORT_ADX_DECAY');
      if (d.hardBlock) {
        logger.info(`🚫 BTC SHORT ADX slope filter: slope=${adxSlope.toFixed(2)} < -0.5, blocking${d.shadowSoft ? ' [shadow-soft]' : ''}`);
        return fail(d.reason);
      }
      positionMultiplier *= d.softMultiplier;
    }
    // Require minimum momentum strength for BTC SHORT
    if (Math.abs(momentumResult.score) < 8) {
      positionMultiplier *= 0.50;
      logger.info(`⚠️ BTC SHORT weak momentum: score=${momentumResult.score}, pos reduced to ${(positionMultiplier * 100).toFixed(0)}%`);
    }
  }


  // ═══════════════════════════════════════════════════════════════
  // SOFT ADJUSTMENTS (position sizing, never hard blocks)
  // ═══════════════════════════════════════════════════════════════

  // NOTE: StochRSI extreme sizing is handled by stoch-authority (runwayMultiplier)
  // applied earlier. Do NOT add stochK-based checks here — extend stoch-authority instead.


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
    // Hard block: quality < 40 (backtest: low quality TC trades are negative expectancy)
    if (qualityScore < 40) {
      const d = strictBlock('TC_LOW_QUALITY');
      if (d.hardBlock) {
        logger.info(`🚫 TREND_CONTINUATION blocked: quality=${qualityScore} < 40${d.shadowSoft ? ' [shadow-soft]' : ''}`);
        return fail(d.reason);
      }
      positionMultiplier *= d.softMultiplier;
    }
    // Fix 1 (v1): Block LONG in RANGE_COMPRESSION — 30 trades, 30% WR, -13.09 PnL
    if (mfs.regime === 'RANGE_COMPRESSION' && direction === 'LONG') {
      const d = strictBlock('TC_RANGE_COMPRESSION_LONG_BLOCKED');
      if (d.hardBlock) {
        logger.info(`🚫 TREND_CONTINUATION LONG blocked in RANGE_COMPRESSION${d.shadowSoft ? ' [shadow-soft]' : ''}`);
        return fail(d.reason);
      }
      positionMultiplier *= d.softMultiplier;
    }
    // Fix 2 (v1): TREND_EXPANSION SHORT requires quality >= 55
    if (mfs.regime === 'TREND_EXPANSION' && direction === 'SHORT' && qualityScore < 55) {
      const d = strictBlock('TC_EXPANSION_SHORT_LOW_QUALITY');
      if (d.hardBlock) {
        logger.info(`🚫 TREND_CONTINUATION SHORT low quality in TREND_EXPANSION: quality=${qualityScore} < 55${d.shadowSoft ? ' [shadow-soft]' : ''}`);
        return fail(d.reason);
      }
      positionMultiplier *= d.softMultiplier;
    }
    // Fix 3 (v2): SELL side with declining ADX → halve position
    if (direction === 'SHORT' && adxSlope < -0.3) {
      positionMultiplier *= 0.50;
      logger.info(`⚠️ TC SHORT ADX declining: slope=${adxSlope.toFixed(2)}, pos halved`);
    }
    // Fix 4 (v2): OBSOLETE — replaced by stoch-authority runwayMultiplier (EXTENDED_SHORT tier at K<30).

    // Fix 5 (v2): Require momentum alignment for BUY
    if (direction === 'LONG' && momentumResult.score < 3 && adx < 25) {
      positionMultiplier *= 0.40;
      logger.info(`⚠️ TC LONG weak momentum: score=${momentumResult.score}, adx=${adx.toFixed(1)}, pos reduced`);
    }
    // Fix 6 (v3): Block LONG with very weak momentum in any trend
    if (direction === 'LONG' && momentumResult.score < 0) {
      positionMultiplier *= 0.30;
      logger.info(`⚠️ TC LONG negative momentum: score=${momentumResult.score}, pos 30%`);
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
    const stSymbol = symbol || mfs.symbol;
    const atrPct = mfs.atrPercent || 0;

    // Fix 1 (v1): OBSOLETE — replaced by stoch-authority runwayMultiplier.
    // Previously: hard-block STRONG_TREND LONG at K>70 / SHORT at K<30.
    // Now: EXTENDED/EXTREME tiers reduce position by 35-60%; ABSOLUTE still hard-blocks.


    // Fix 2 (v3): BUY hard block — 90d forensic: 11T, 27.3% WR, -$0.78
    if (direction === 'LONG' && momentumResult.score < 15) {
      const d = strictBlock('STRONG_TREND_BUY_WEAK_MOMENTUM');
      if (d.hardBlock) {
        logger.info(`🚫 STRONG_TREND LONG blocked: momentum=${momentumResult.score} < 15 (27.3% WR historically)${d.shadowSoft ? ' [shadow-soft]' : ''}`);
        return fail(d.reason);
      }
      positionMultiplier *= d.softMultiplier;
    }

    // Fix 3 (v3): SELL instant-loss prevention
    if (direction === 'SHORT' && Math.abs(momentumResult.score) < 5) {
      const d = strictBlock('STRONG_TREND_SHORT_NO_MOMENTUM');
      if (d.hardBlock) {
        logger.info(`🚫 STRONG_TREND SHORT blocked: |momentum|=${Math.abs(momentumResult.score)} < 5 (instant-loss pattern)${d.shadowSoft ? ' [shadow-soft]' : ''}`);
        return fail(d.reason);
      }
      positionMultiplier *= d.softMultiplier;
    }

    // Fix 4 (v3): ETHUSDT SELL quality floor 60
    if (stSymbol === 'ETHUSDT' && direction === 'SHORT' && qualityScore < 60) {
      const d = strictBlock('STRONG_TREND_ETH_SHORT_LOW_QUALITY', { symbolLevel: true });
      if (d.hardBlock) {
        logger.info(`🚫 STRONG_TREND ETHUSDT SHORT blocked: quality=${qualityScore} < 60${d.shadowSoft ? ' [shadow-soft]' : ''}`);
        return fail(d.reason);
      }
      positionMultiplier *= d.softMultiplier;
    }

    // Fix 5 (v3): ADAUSDT SELL — 0% WR
    if (stSymbol === 'ADAUSDT' && direction === 'SHORT') {
      const d = strictBlock('STRONG_TREND_ADA_SHORT_BLOCKED', { symbolLevel: true });
      if (d.hardBlock) {
        logger.info(`🚫 STRONG_TREND ADAUSDT SHORT blocked: 0% WR historically${d.shadowSoft ? ' [shadow-soft]' : ''}`);
        return fail(d.reason);
      }
      positionMultiplier *= d.softMultiplier;
    }

    // Fix 6 (v2→v3): SELL with declining ADX slope → reduce position (keeps profitable trailing trades)
    if (direction === 'SHORT' && adxSlope < 0) {
      positionMultiplier *= 0.50;
      logger.info(`⚠️ ST SHORT declining ADX: slope=${adxSlope.toFixed(2)}, pos halved`);
    }

    // Fix 7 (v2): High-ATR SELL guard
    if (direction === 'SHORT' && atrPct > 1.5 && qualityScore < 65) {
      positionMultiplier *= 0.50;
      logger.info(`⚠️ ST SHORT high-ATR guard: atr=${atrPct.toFixed(2)}%, quality=${qualityScore}, pos halved`);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // SQUEEZE_BREAKOUT Optimization Layer v3 (Backtest 2026-03-16)
  // Backtest: 705 trades, 36.2% WR, -$221 → need quality floor + frequency reduction
  // ═══════════════════════════════════════════════════════════════
  if (strategyName === 'SQUEEZE_BREAKOUT') {
    // Quality floor 45
    if (qualityScore < 45) {
      const d = strictBlock('SQUEEZE_LOW_QUALITY');
      if (d.hardBlock) {
        logger.info(`🚫 SQUEEZE_BREAKOUT blocked: quality=${qualityScore} < 45${d.shadowSoft ? ' [shadow-soft]' : ''}`);
        return fail(d.reason);
      }
      positionMultiplier *= d.softMultiplier;
    }
    // ADX floor 20
    if (adx < 20) {
      const d = strictBlock('SQUEEZE_ADX_TOO_LOW');
      if (d.hardBlock) {
        logger.info(`🚫 SQUEEZE_BREAKOUT blocked: ADX=${adx.toFixed(1)} < 20${d.shadowSoft ? ' [shadow-soft]' : ''}`);
        return fail(d.reason);
      }
      positionMultiplier *= d.softMultiplier;
    }
    // Momentum floor 5
    if (Math.abs(momentumResult.score) < 5) {
      const d = strictBlock('SQUEEZE_NO_MOMENTUM');
      if (d.hardBlock) {
        logger.info(`🚫 SQUEEZE_BREAKOUT blocked: |momentum|=${Math.abs(momentumResult.score)} < 5${d.shadowSoft ? ' [shadow-soft]' : ''}`);
        return fail(d.reason);
      }
      positionMultiplier *= d.softMultiplier;
    }

    // === Directional filter (StochRSI handled by stoch-authority) ===
    if (direction === 'LONG') {
      if (primaryTrend === 'bearish' && momentumResult.score < 10) {
        const d = strictBlock('SQUEEZE_BUY_COUNTER_TREND_WEAK');
        if (d.hardBlock) {
          logger.info(`🚫 SQUEEZE_BREAKOUT LONG blocked: bearish trend + weak momentum (${momentumResult.score})${d.shadowSoft ? ' [shadow-soft]' : ''}`);
          return fail(d.reason);
        }
        positionMultiplier *= d.softMultiplier;
      }
      if (adxSlope < 0) {
        positionMultiplier *= 0.50;
      }
    } else if (direction === 'SHORT') {
      if (primaryTrend === 'bullish' && momentumResult.score > -10) {
        const d = strictBlock('SQUEEZE_SELL_COUNTER_TREND_WEAK');
        if (d.hardBlock) {
          logger.info(`🚫 SQUEEZE_BREAKOUT SHORT blocked: bullish trend + weak momentum${d.shadowSoft ? ' [shadow-soft]' : ''}`);
          return fail(d.reason);
        }
        positionMultiplier *= d.softMultiplier;
      }
    }
    // NOTE: Removed stochK>70 hard block for LONG (SQUEEZE_BUY_OVERBOUGHT) and
    // stochK>60/<25 soft penalties — stoch-authority runwayMultiplier now covers these.


    // Momentum alignment bonus: when momentum strongly confirms direction
    if ((direction === 'LONG' && momentumResult.score > 15) || (direction === 'SHORT' && momentumResult.score < -15)) {
      positionMultiplier *= 1.15;
    }

    // Deep squeeze bonus
    const bbWidth = mfs.bollinger?.["1h"]?.width || 0;
    if (bbWidth > 0 && bbWidth < 2.0) {
      positionMultiplier *= 1.20;
    } else if (bbWidth > 0 && bbWidth > 2.5 && bbWidth < 3.0) {
      positionMultiplier *= 0.70;
    }
  }

  // Per-strategy sub-score floor pass (Phase 2b): raises floors for strategies
  // with historically weak sub-score profiles. Soft sizing only, no hard block.
  const stratFloors = getStrategyFloors(strategyName);
  const stratSubScores = calculateQualitySubScores(mfs, effectiveTrend, mfs.symbol, { floors: stratFloors });
  if (stratSubScores.breachedFloors.length > 0 && stratSubScores.breachedFloors.length > subScores.breachedFloors.length) {
    const extraPenalty = 0.80;
    positionMultiplier *= extraPenalty;
    logger.info(`⚠️ STRATEGY FLOOR (${strategyName}): ${stratSubScores.reason} → extra x${extraPenalty}`);
  }

  // Floor: minimum 10% position (never zero unless hard-blocked)
  positionMultiplier = Math.max(positionMultiplier, 0.10);

  logger.info(`✅ GATE PASS: ${symbol || mfs.symbol} ${direction} | strategy=${strategyName} | ADX=${adx.toFixed(1)} slope=${adxSlope.toFixed(2)} | K=${stochK.toFixed(1)} | mom=${momentumResult.score} | Q=${qualityScore}(e${subScores.entryQ.toFixed(0)}/t${subScores.trendQ.toFixed(0)}/c${subScores.contextQ.toFixed(0)}) | pos=${(positionMultiplier * 100).toFixed(0)}%`);

  return {
    passed: true, gate: null, gateFamily: null, direction, qualityScore,
    momentumScore: momentumResult.score,
    positionMultiplier, strategyName,
    entryQ: subScores.entryQ,
    trendQ: subScores.trendQ,
    contextQ: subScores.contextQ,
    breachedFloors: stratSubScores.breachedFloors,
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
