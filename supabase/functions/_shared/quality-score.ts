// ============= QUALITY SCORE DECOMPOSITION (Phase 2) =============
// Splits the monolithic 0-100 quality score into 3 interpretable sub-scores:
//   • entryQ   — Entry timing quality (momentum + oscillator/technical)
//   • trendQ   — Trend structural quality (ADX + HTF alignment)
//   • contextQ — Market context validity (volume + expansion + confidence adj.)
//
// Design goals:
//   1. Backwards compatible — `calculateQualityScore()` (legacy) still returns
//      the same shape. This module WRAPS it and exposes richer output.
//   2. Interpretable rejections — instead of opaque `VERY_LOW_QUALITY`, the
//      forensic log can say "entryQ=18 breached floor 25".
//   3. Enable per-strategy floors (Phase 2b) without touching the aggregate.
//
// Component caps (from scoring.ts):
//   adx: 0-25, momentum: 0-20, alignment: 0-20, technical: 0-15, volume: 0-20
//
// Grouping (each normalized to 0-100):
//   trendQ   = (adx + alignment) / 45 * 100
//   entryQ   = (momentum + technical) / 35 * 100
//   contextQ = (volume + confidencePenalty_adj) / 20 * 100
// ================================================================

import type { MarketFeatureSnapshot } from "./market-feature-snapshot.ts";
import { calculateQualityScore } from "./scoring.ts";

// ============= CONFIG =============
export const QUALITY_SUB_SCORE_CONFIG = {
  // Component max caps (used for normalization)
  ADX_MAX: 25,
  MOMENTUM_MAX: 20,
  ALIGNMENT_MAX: 20,
  TECHNICAL_MAX: 15,
  VOLUME_MAX: 20,

  // Default soft-floor thresholds (0-100 scale)
  // Below these, positionMultiplier is reduced (never hard-blocked here).
  DEFAULT_FLOORS: {
    entryQ: 25,
    trendQ: 25,
    contextQ: 15,
  },

  // Sizing penalty when a floor is breached (per sub-score)
  FLOOR_PENALTY: 0.75,

  // Sizing bonus when all three sub-scores are strong (≥ 70)
  ALL_STRONG_THRESHOLD: 70,
  ALL_STRONG_BONUS: 1.10,
} as const;

export interface QualitySubScores {
  /** Overall score (0-100), unchanged from legacy calculateQualityScore. */
  total: number;
  /** Entry timing (momentum + technical), 0-100. */
  entryQ: number;
  /** Trend structural quality (adx + alignment), 0-100. */
  trendQ: number;
  /** Market context validity (volume + confidence), 0-100. */
  contextQ: number;
  /** Raw component breakdown (0-max-cap scale, unchanged). */
  breakdown: {
    adx: number;
    momentum: number;
    alignment: number;
    technical: number;
    volume: number;
    confidencePenalty: number;
  };
  /** Which floors (if any) were breached vs. `floors`. */
  breachedFloors: Array<'entryQ' | 'trendQ' | 'contextQ'>;
  /** True if entryQ, trendQ, contextQ all ≥ ALL_STRONG_THRESHOLD. */
  isAllStrong: boolean;
  /** Recommended sizing multiplier from sub-score profile (0.42 – 1.10). */
  sizingMultiplier: number;
  /** Diagnostic reason string for logs/forensics. */
  reason: string;
}

export interface QualitySubScoreOptions {
  floors?: Partial<{ entryQ: number; trendQ: number; contextQ: number }>;
}

// ============= MAIN ENTRY =============
export function calculateQualitySubScores(
  mfs: MarketFeatureSnapshot,
  effectiveTrend: 'bullish' | 'bearish' | string,
  symbol: string,
  options: QualitySubScoreOptions = {},
): QualitySubScores {
  const c = QUALITY_SUB_SCORE_CONFIG;
  const legacy = calculateQualityScore(mfs, effectiveTrend, symbol);
  const b = legacy.breakdown;

  // Normalize each group to 0-100. Clamp to guard against outliers.
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const trendQ = clamp(((b.adx + b.alignment) / (c.ADX_MAX + c.ALIGNMENT_MAX)) * 100);
  const entryQ = clamp(((b.momentum + b.technical) / (c.MOMENTUM_MAX + c.TECHNICAL_MAX)) * 100);
  // confidencePenalty is currently always 0 (kept for schema stability). Volume drives contextQ.
  const contextQ = clamp(((b.volume + Math.max(0, c.VOLUME_MAX + b.confidencePenalty)) / (c.VOLUME_MAX * 2)) * 100 * 2 / 2);
  // ^ The double-scale trick keeps confidencePenalty additive without changing contextQ's max.
  // Simplifies to: contextQ = clamp((b.volume / VOLUME_MAX) * 100 + b.confidencePenalty).
  const contextQFinal = clamp((b.volume / c.VOLUME_MAX) * 100 + b.confidencePenalty);

  const floors = { ...c.DEFAULT_FLOORS, ...(options.floors ?? {}) };
  const breached: Array<'entryQ' | 'trendQ' | 'contextQ'> = [];
  if (entryQ < floors.entryQ) breached.push('entryQ');
  if (trendQ < floors.trendQ) breached.push('trendQ');
  if (contextQFinal < floors.contextQ) breached.push('contextQ');

  const isAllStrong =
    entryQ >= c.ALL_STRONG_THRESHOLD &&
    trendQ >= c.ALL_STRONG_THRESHOLD &&
    contextQFinal >= c.ALL_STRONG_THRESHOLD;

  // Sizing multiplier: 0.75^n for each breached floor, +10% bonus if all strong.
  let sizingMultiplier = 1.0;
  for (let i = 0; i < breached.length; i++) sizingMultiplier *= c.FLOOR_PENALTY;
  if (isAllStrong) sizingMultiplier *= c.ALL_STRONG_BONUS;
  sizingMultiplier = Math.max(0.30, Math.min(1.15, sizingMultiplier));

  const reason = breached.length > 0
    ? `sub-score floor breach: ${breached.map((f) => {
        const val = f === 'entryQ' ? entryQ : f === 'trendQ' ? trendQ : contextQFinal;
        return `${f}=${val.toFixed(0)} < ${floors[f]}`;
      }).join(', ')}`
    : isAllStrong
      ? `all sub-scores strong (entryQ=${entryQ.toFixed(0)} trendQ=${trendQ.toFixed(0)} contextQ=${contextQFinal.toFixed(0)})`
      : `sub-scores nominal (entryQ=${entryQ.toFixed(0)} trendQ=${trendQ.toFixed(0)} contextQ=${contextQFinal.toFixed(0)})`;

  return {
    total: legacy.score,
    entryQ,
    trendQ,
    contextQ: contextQFinal,
    breakdown: b,
    breachedFloors: breached,
    isAllStrong,
    sizingMultiplier,
    reason,
  };
}

// ============= PER-STRATEGY FLOOR PRESETS =============
// Strategies with historically weak sub-score profiles get raised floors.
// Tune from forensic backtests, NOT ad-hoc.
export const STRATEGY_FLOORS: Record<string, QualitySubScoreOptions['floors']> = {
  TREND_CONTINUATION: { entryQ: 30, trendQ: 25, contextQ: 15 },
  STRONG_TREND:       { entryQ: 35, trendQ: 40, contextQ: 15 },
  SQUEEZE_BREAKOUT:   { entryQ: 30, trendQ: 20, contextQ: 20 },
  MEAN_REVERSION:     { entryQ: 25, trendQ: 15, contextQ: 20 },
};

export function getStrategyFloors(strategyName: string): QualitySubScoreOptions['floors'] {
  return STRATEGY_FLOORS[strategyName] ?? QUALITY_SUB_SCORE_CONFIG.DEFAULT_FLOORS;
}
