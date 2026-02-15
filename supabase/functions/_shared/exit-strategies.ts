// ============= EXIT STRATEGIES: SHARED MODULE =============
// Extracted from monitor-positions to eliminate the monolith pattern.
// Single source of truth for: Decay Velocity, Micro-Profit Lock,
// Progressive Profit Lock, and Mean Reversion Exit logic.
//
// These are PURE decision functions – they compute what SHOULD happen
// but do NOT perform database writes. The caller is responsible for
// persisting the result. This keeps the module testable and side-effect-free.

import {
  DECAY_VELOCITY_TIERS,
  MICRO_PROFIT_LOCK_PARAMS,
  PROGRESSIVE_PROFIT_LOCK_PARAMS,
  SLIPPAGE_PARAMS,
  MEAN_REVERSION_CONFIG,
  TRADING_FEE_PARAMS,
} from "./constants.ts";
import { extractADX, extractADXSlope } from "./scoring.ts";

// ──────────────────────────────────────────────
// Shared types
// ──────────────────────────────────────────────

export interface PositionContext {
  id: string;
  side: "BUY" | "SELL";
  entry_price: number;
  stop_loss: number | null;
  quantity: number;
  opened_at: string | null;
  executed_at: string | null;
  peak_pnl_percent: number;
  peak_reached_at: string | null;
  trading_fee_percent: number | null;
  entry_atr: number | null;
  entry_atr_percent: number | null;
  max_adverse_excursion_atr: number | null;
  strategy_name: string | null;
}

export interface MarketContext {
  currentPrice: number;
  pnlPercent: number;
  atrPercent: number;
  atr: number;
  trendData: any; // snapshot_data from trend_snapshots
}

export interface UserExitSettings {
  activationPercent: number;
  trailingAggressiveness: number;
  progressiveLockEnabled: boolean;
  stalePeakProtectionEnabled: boolean;
  decayVelocityExitEnabled: boolean;
}

// ──────────────────────────────────────────────
// Fee-aware P&L helper (shared with monitor-positions)
// ──────────────────────────────────────────────

export interface FeeAwarePnL {
  grossPnl: number;
  grossPnlPercent: number;
  netPnl: number;
  netPnlPercent: number;
  totalFee: number;
  feeRatePercent: number;
}

export function calculateFeeAwarePnL(
  side: string,
  entryPrice: number,
  exitPrice: number,
  quantity: number,
  storedFeePercent?: number | null
): FeeAwarePnL {
  const feeRatePercent = storedFeePercent ?? TRADING_FEE_PARAMS.DEFAULT_FEE_RATE_PERCENT;
  const feeRate = feeRatePercent / 100;

  const grossPnl = side === "BUY"
    ? (exitPrice - entryPrice) * quantity
    : (entryPrice - exitPrice) * quantity;

  const grossPnlPercent = side === "BUY"
    ? ((exitPrice - entryPrice) / entryPrice) * 100
    : ((entryPrice - exitPrice) / entryPrice) * 100;

  const entryFee = entryPrice * quantity * feeRate;
  const exitFee = exitPrice * quantity * feeRate;
  const totalFee = entryFee + exitFee;

  const netPnl = grossPnl - totalFee;
  const netPnlPercent = grossPnlPercent - ((totalFee / (entryPrice * quantity)) * 100);

  return { grossPnl, grossPnlPercent, netPnl, netPnlPercent, totalFee, feeRatePercent };
}

// ──────────────────────────────────────────────
// 1) DECAY VELOCITY DETECTION (Tiered)
// ──────────────────────────────────────────────

export interface DecayVelocityResult {
  shouldExit: boolean;
  exitReason: string;
  decayVelocity: number; // % per minute
  decayTier: string;
  minutesSincePeak: number;
  /** true when tier exception is absorbing the decay */
  tierExceptionActive: boolean;
}

export function evaluateDecayVelocity(
  position: PositionContext,
  market: MarketContext,
  settings: UserExitSettings,
): DecayVelocityResult {
  const noExit: DecayVelocityResult = {
    shouldExit: false, exitReason: "", decayVelocity: 0,
    decayTier: "base", minutesSincePeak: 0, tierExceptionActive: false,
  };

  if (!settings.decayVelocityExitEnabled) return noExit;

  const newPeakPnl = position.peak_pnl_percent;
  if (newPeakPnl <= settings.activationPercent) return noExit;

  const peakReachedAt = position.peak_reached_at ? new Date(position.peak_reached_at) : new Date();
  const minutesSincePeak = (Date.now() - peakReachedAt.getTime()) / (1000 * 60);

  if (minutesSincePeak < DECAY_VELOCITY_TIERS.MIN_OBSERVATION_MINUTES) return noExit;

  const decayPercent = newPeakPnl - market.pnlPercent;
  const decayVelocity = decayPercent / minutesSincePeak;

  // Tier determination
  const posAdx = extractADX(market.trendData);
  const { slope: adxSlope } = extractADXSlope(market.trendData);
  const primaryTrend = market.trendData?.primaryTrend || "ranging";
  const isAligned =
    (position.side === "BUY" && primaryTrend === "bullish") ||
    (position.side === "SELL" && primaryTrend === "bearish");

  let decayTier: string = "base";
  let decayThreshold: number = DECAY_VELOCITY_TIERS.BASE_EXIT_PER_MINUTE;
  let maxDecayMinutes: number = DECAY_VELOCITY_TIERS.BASE_MAX_DECAY_MINUTES;

  if (isAligned) {
    if (posAdx >= DECAY_VELOCITY_TIERS.TIER4_MIN_ADX && adxSlope >= DECAY_VELOCITY_TIERS.TIER4_MIN_ADX_SLOPE) {
      decayTier = "tier4"; decayThreshold = DECAY_VELOCITY_TIERS.TIER4_EXIT_PER_MINUTE; maxDecayMinutes = DECAY_VELOCITY_TIERS.TIER4_MAX_DECAY_MINUTES;
    } else if (posAdx >= DECAY_VELOCITY_TIERS.TIER3_MIN_ADX && adxSlope >= DECAY_VELOCITY_TIERS.TIER3_MIN_ADX_SLOPE) {
      decayTier = "tier3"; decayThreshold = DECAY_VELOCITY_TIERS.TIER3_EXIT_PER_MINUTE; maxDecayMinutes = DECAY_VELOCITY_TIERS.TIER3_MAX_DECAY_MINUTES;
    } else if (posAdx >= DECAY_VELOCITY_TIERS.TIER2_MIN_ADX && adxSlope >= DECAY_VELOCITY_TIERS.TIER2_MIN_ADX_SLOPE) {
      decayTier = "tier2"; decayThreshold = DECAY_VELOCITY_TIERS.TIER2_EXIT_PER_MINUTE; maxDecayMinutes = DECAY_VELOCITY_TIERS.TIER2_MAX_DECAY_MINUTES;
    } else if (posAdx >= DECAY_VELOCITY_TIERS.TIER1_MIN_ADX && adxSlope >= DECAY_VELOCITY_TIERS.TIER1_MIN_ADX_SLOPE) {
      decayTier = "tier1"; decayThreshold = DECAY_VELOCITY_TIERS.TIER1_EXIT_PER_MINUTE; maxDecayMinutes = DECAY_VELOCITY_TIERS.TIER1_MAX_DECAY_MINUTES;
    }
  }

  const forceExitByTime = minutesSincePeak > maxDecayMinutes && decayVelocity > DECAY_VELOCITY_TIERS.FORCE_EXIT_MIN_VELOCITY;

  if ((decayVelocity > decayThreshold || forceExitByTime) && market.pnlPercent > 0) {
    return {
      shouldExit: true,
      exitReason: forceExitByTime ? "smart_aits_prolonged_decay" : "smart_aits_rapid_decay",
      decayVelocity,
      decayTier,
      minutesSincePeak,
      tierExceptionActive: false,
    };
  }

  const tierExceptionActive = decayVelocity > DECAY_VELOCITY_TIERS.BASE_EXIT_PER_MINUTE && decayTier !== "base";

  return { shouldExit: false, exitReason: "", decayVelocity, decayTier, minutesSincePeak, tierExceptionActive };
}

// ──────────────────────────────────────────────
// 2) MICRO-PROFIT LOCK (0.15% – 0.50% peak)
// ──────────────────────────────────────────────

export interface ProfitLockResult {
  applied: boolean;
  newStopLoss: number | null;
  lockType: "micro" | "progressive" | "none";
  tierLabel: string;
}

export function evaluateMicroProfitLock(
  position: PositionContext,
  newPeakPnl: number,
): ProfitLockResult {
  const noLock: ProfitLockResult = { applied: false, newStopLoss: null, lockType: "none", tierLabel: "" };

  if (!MICRO_PROFIT_LOCK_PARAMS.ENABLED) return noLock;
  if (newPeakPnl <= 0 || newPeakPnl >= MICRO_PROFIT_LOCK_PARAMS.HANDOFF_THRESHOLD) return noLock;
  if (position.stop_loss === null) return noLock;

  const sortedTiers = [...MICRO_PROFIT_LOCK_PARAMS.TIERS].sort((a, b) => b.peakThreshold - a.peakThreshold);
  let matchedTier: { peakThreshold: number; lockTarget: number } | null = null;

  for (const tier of sortedTiers) {
    if (newPeakPnl >= tier.peakThreshold) { matchedTier = tier; break; }
  }
  if (!matchedTier) return noLock;

  const lockTargetPercent = matchedTier.lockTarget;
  const slippageBuffer = position.entry_price * (MICRO_PROFIT_LOCK_PARAMS.SLIPPAGE_BUFFER_PERCENT / 100);
  const lockProfit = position.entry_price * (lockTargetPercent / 100);

  let lockStop: number;
  let shouldApply: boolean;

  if (position.side === "BUY") {
    lockStop = position.entry_price + lockProfit - slippageBuffer;
    shouldApply = lockStop > position.stop_loss;
  } else {
    lockStop = position.entry_price - lockProfit + slippageBuffer;
    shouldApply = lockStop < position.stop_loss;
  }

  if (!shouldApply) return noLock;

  return {
    applied: true,
    newStopLoss: lockStop,
    lockType: "micro",
    tierLabel: `${matchedTier.peakThreshold}%→+${lockTargetPercent.toFixed(2)}%`,
  };
}

// ──────────────────────────────────────────────
// 3) PROGRESSIVE PROFIT LOCK (0.50% – 2.75%)
// ──────────────────────────────────────────────

export function evaluateProgressiveProfitLock(
  position: PositionContext,
  newPeakPnl: number,
): ProfitLockResult {
  const noLock: ProfitLockResult = { applied: false, newStopLoss: null, lockType: "none", tierLabel: "" };

  if (!PROGRESSIVE_PROFIT_LOCK_PARAMS.ENABLED) return noLock;
  if (newPeakPnl < MICRO_PROFIT_LOCK_PARAMS.HANDOFF_THRESHOLD) return noLock;
  if (newPeakPnl >= PROGRESSIVE_PROFIT_LOCK_PARAMS.DEFER_TO_TRAILING_AT) return noLock;
  if (position.stop_loss === null) return noLock;

  const sortedTiers = [...PROGRESSIVE_PROFIT_LOCK_PARAMS.TIERS].sort((a, b) => b.peakThreshold - a.peakThreshold);
  let matchedTier: { peakThreshold: number; lockTarget: number } | null = null;

  for (const tier of sortedTiers) {
    if (newPeakPnl >= tier.peakThreshold) { matchedTier = tier; break; }
  }
  if (!matchedTier) return noLock;

  const lockTargetPercent = matchedTier.lockTarget;
  const slippageBuffer = position.entry_price * (SLIPPAGE_PARAMS.BREAK_EVEN_BUFFER_PERCENT / 100);
  const lockProfit = position.entry_price * (lockTargetPercent / 100);

  let lockStop: number;
  let shouldApply: boolean;

  if (position.side === "BUY") {
    lockStop = position.entry_price + lockProfit - slippageBuffer;
    shouldApply = lockStop > position.stop_loss;
  } else {
    lockStop = position.entry_price - lockProfit + slippageBuffer;
    shouldApply = lockStop < position.stop_loss;
  }

  if (!shouldApply) return noLock;

  return {
    applied: true,
    newStopLoss: lockStop,
    lockType: "progressive",
    tierLabel: `${matchedTier.peakThreshold}%→+${lockTargetPercent.toFixed(2)}%`,
  };
}

// ──────────────────────────────────────────────
// 4) MEAN REVERSION EXIT LOGIC
// ──────────────────────────────────────────────

export interface MeanReversionExitResult {
  shouldExit: boolean;
  exitReason: string;
  /** If not exiting, may still suggest a tighter stop */
  suggestedStopLoss: number | null;
  newMaeAtr: number;
}

export function evaluateMeanReversionExit(
  position: PositionContext,
  market: MarketContext,
  positionAgeMinutes: number,
): MeanReversionExitResult {
  const noExit: MeanReversionExitResult = { shouldExit: false, exitReason: "", suggestedStopLoss: null, newMaeAtr: 0 };

  if (!MEAN_REVERSION_CONFIG.ENABLED) return noExit;

  const entryAtr = position.entry_atr || (market.atr || market.currentPrice * 0.02);
  const entryAtrPercent = position.entry_atr_percent || market.atrPercent;

  // MAE tracking
  const currentAdverseMove = position.side === "BUY"
    ? Math.max(0, position.entry_price - market.currentPrice)
    : Math.max(0, market.currentPrice - position.entry_price);
  const currentAdverseAtr = entryAtr > 0 ? currentAdverseMove / entryAtr : 0;

  const currentFavorableMove = position.side === "BUY"
    ? Math.max(0, market.currentPrice - position.entry_price)
    : Math.max(0, position.entry_price - market.currentPrice);
  const currentFavorableAtr = entryAtr > 0 ? currentFavorableMove / entryAtr : 0;

  const existingMae = position.max_adverse_excursion_atr || 0;
  const newMaeAtr = Math.max(existingMae, currentAdverseAtr);
  const positionAgeBars = positionAgeMinutes / 60;

  // Early adverse exit
  if (positionAgeBars <= MEAN_REVERSION_CONFIG.EXIT.FAILURE_TIME_BARS &&
      currentAdverseAtr >= MEAN_REVERSION_CONFIG.EXIT.FAILURE_ATR_THRESHOLD) {
    return { shouldExit: true, exitReason: "mean_reversion_early_failure", suggestedStopLoss: null, newMaeAtr };
  }

  // ATR-based target (tighten stop to lock 70% of gain)
  let suggestedStopLoss: number | null = null;
  if (currentFavorableAtr >= MEAN_REVERSION_CONFIG.EXIT.BASE_TIMEOUT_ATR_MULTIPLE) {
    const lockPrice = position.side === "BUY"
      ? position.entry_price + (currentFavorableMove * 0.7)
      : position.entry_price - (currentFavorableMove * 0.7);

    if ((position.side === "BUY" && lockPrice > (position.stop_loss || 0)) ||
        (position.side === "SELL" && lockPrice < (position.stop_loss || Infinity))) {
      suggestedStopLoss = lockPrice;
    }
  }

  // Quick profit trailing
  if (market.pnlPercent >= MEAN_REVERSION_CONFIG.EXIT.QUICK_PROFIT_TARGET_PERCENT) {
    const dist = position.entry_price * (MEAN_REVERSION_CONFIG.EXIT.TRAILING_DISTANCE_PERCENT / 100);
    const qStop = position.side === "BUY"
      ? market.currentPrice - dist
      : market.currentPrice + dist;

    if ((position.side === "BUY" && qStop > (suggestedStopLoss || position.stop_loss || 0)) ||
        (position.side === "SELL" && qStop < (suggestedStopLoss || position.stop_loss || Infinity))) {
      suggestedStopLoss = qStop;
    }
  }

  // Time-based failure
  const maxHoldMinutes = MEAN_REVERSION_CONFIG.EXIT.MAX_HOLD_HOURS * 60;
  if (positionAgeMinutes >= maxHoldMinutes && market.pnlPercent < MEAN_REVERSION_CONFIG.EXIT.QUICK_PROFIT_TARGET_PERCENT) {
    return { shouldExit: true, exitReason: "mean_reversion_time_exit", suggestedStopLoss, newMaeAtr };
  }

  // Trend continuation failure
  const posAdx = extractADX(market.trendData);
  const { slope: mrAdxSlope } = extractADXSlope(market.trendData);
  if (posAdx >= MEAN_REVERSION_CONFIG.LONG.MAX_ADX && mrAdxSlope > 0.5 && market.pnlPercent < 0) {
    return { shouldExit: true, exitReason: "mean_reversion_trend_continuation", suggestedStopLoss, newMaeAtr };
  }

  // Moderate exhaustion momentum invalidation
  const isModerateExhaustion = position.strategy_name?.includes("MR_MODERATE_EXHAUSTION");
  if (isModerateExhaustion) {
    const momentumScore = market.trendData?.momentum?.score ?? 0;
    const momentumFloor = MEAN_REVERSION_CONFIG.MODERATE_EXHAUSTION?.INVALIDATION_MOMENTUM_FLOOR ?? 30;
    const isLong = position.side === "BUY";
    const invalidated = isLong ? momentumScore < momentumFloor : momentumScore > -momentumFloor;
    if (invalidated && market.pnlPercent < 0.5) {
      return { shouldExit: true, exitReason: "moderate_exhaustion_momentum_invalidated", suggestedStopLoss, newMaeAtr };
    }
  }

  return { shouldExit: false, exitReason: "", suggestedStopLoss, newMaeAtr };
}

// ──────────────────────────────────────────────
// 5) SMART AITS helpers (progressive lock % + stale peak)
// ──────────────────────────────────────────────

/** Dynamic profit lock percentage based on peak P&L and aggressiveness setting */
export function getProgressiveLockPercent(peakPnl: number, aggressiveness: number): number {
  const baseLock = 0.30 + (aggressiveness * 0.05);
  let tierBonus = 0;
  if (peakPnl >= 5) tierBonus = 0.30;
  else if (peakPnl >= 3) tierBonus = 0.20;
  else if (peakPnl >= 2) tierBonus = 0.15;
  else if (peakPnl >= 1) tierBonus = 0.10;
  return Math.min(0.85, baseLock + tierBonus);
}

/** Extra lock tightening when peak hasn't been refreshed */
export function getStalePeakBonus(minutesSincePeak: number, enabled: boolean): number {
  if (!enabled) return 0;
  if (minutesSincePeak > 120) return 0.25;
  if (minutesSincePeak > 60) return 0.20;
  if (minutesSincePeak > 30) return 0.10;
  if (minutesSincePeak > 15) return 0.05;
  return 0;
}
