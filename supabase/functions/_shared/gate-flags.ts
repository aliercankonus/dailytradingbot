// ============= GATE FLAGS (Phase 3A) =============
// Runtime toggles that let the operator collapse the pipeline from
// 19 hard fail-sites (5 canonical + 14 strategy-specific) down to the
// 8-hard-gate model specified in the simplification plan.
//
// The 14 strategy-specific hard blocks (BTC SHORT, TC, STRONG_TREND, SQUEEZE
// variants) are forensically justified — turning them into soft sizing risks
// reintroducing known losing patterns. This module keeps them as the default
// but lets a canonical-mode run soften them to position multipliers.
//
// Modes:
//   'strict'      — legacy: strategy-specific hard blocks fully active
//   'soft'        — strategy-specific hard blocks demoted to sizing penalties
//   'shadow-soft' — hard blocks still fire, BUT the soft-decision is logged
//                   in parallel for A/B comparison via signal_rejection_log
// =====================================================
export type GateStrictnessMode = 'strict' | 'soft' | 'shadow-soft';

export interface GateFlags {
  /** Overall strictness mode for strategy-specific hard blocks. */
  strategyBlockMode: GateStrictnessMode;
  /** Sizing multiplier applied when a strategy-specific block is softened. */
  softStrategyBlockMultiplier: number;
  /** Sizing multiplier for symbol-level historical WR blocks (e.g. ADA SHORT 0% WR). */
  softSymbolBlockMultiplier: number;
}

// Defaults preserve pre-Phase-3A behavior. Flip to 'soft' or 'shadow-soft'
// only after canonical backtest confirms parity or improvement.
export const GATE_FLAGS: GateFlags = {
  strategyBlockMode: 'soft',
  softStrategyBlockMultiplier: 0.30,
  softSymbolBlockMultiplier: 0.20,
} as const;

/**
 * strictBlock() — soft/strict decision helper for strategy-specific hard blocks.
 *
 * Usage inside a gate:
 *   const decision = strictBlock('TC_LOW_QUALITY');
 *   if (decision.hardBlock) return fail(decision.reason);
 *   positionMultiplier *= decision.softMultiplier;
 *
 * In 'strict' mode → returns { hardBlock: true, reason }.
 * In 'soft' mode   → returns { hardBlock: false, softMultiplier }.
 * In 'shadow-soft' → returns { hardBlock: true, reason, shadowSoft: true } so
 *   the pipeline still blocks BUT the caller can log the counterfactual
 *   sizing that would have been used.
 */
export function strictBlock(
  reason: string,
  opts?: { symbolLevel?: boolean },
): {
  hardBlock: boolean;
  reason: string;
  softMultiplier: number;
  shadowSoft: boolean;
} {
  const mult = opts?.symbolLevel
    ? GATE_FLAGS.softSymbolBlockMultiplier
    : GATE_FLAGS.softStrategyBlockMultiplier;

  switch (GATE_FLAGS.strategyBlockMode) {
    case 'strict':
      return { hardBlock: true, reason, softMultiplier: mult, shadowSoft: false };
    case 'soft':
      return { hardBlock: false, reason, softMultiplier: mult, shadowSoft: false };
    case 'shadow-soft':
      return { hardBlock: true, reason, softMultiplier: mult, shadowSoft: true };
  }
}

/**
 * The 8 canonical hard-gate identifiers per the Phase 3 plan.
 * All other rejections should ideally be soft sizing.
 */
export const CANONICAL_HARD_GATES = new Set<string>([
  'ADX_NO_ENERGY',          // ADX_MINIMUM
  'NO_DIRECTION',           // DIRECTION_CONVICTION
  'MOMENTUM_STRONGLY_OPPOSING', // MOMENTUM_POLARITY
  'STOCH_ABSOLUTE_EXTREME', // STOCH_EXTREME_HARD_BLOCK (+ any stoch-authority ABSOLUTE_* reason)
  'VERY_LOW_QUALITY',       // QUALITY_FLOOR
  'REGIME_ALLOWLIST',       // (enforced upstream in strategy-analyzer)
  'STRATEGY_PERFORMANCE',   // (enforced via useStrategyPerformanceGate)
  'PORTFOLIO_LIMIT',        // (enforced in execute-trade)
]);

export function isCanonicalHardGate(reason: string): boolean {
  if (CANONICAL_HARD_GATES.has(reason)) return true;
  // stoch-authority emits reasons like STOCH_ABSOLUTE_OVERBOUGHT_LONG.
  if (reason.startsWith('STOCH_ABSOLUTE_')) return true;
  return false;
}
