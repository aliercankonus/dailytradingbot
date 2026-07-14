// Helpers for turning Trading Coach agent proposed_actions into safe DB updates.
// Only whitelisted numeric/boolean columns on `risk_parameters` are auto-applicable.
// Everything else (code, edge functions, gate flags in code, strategy toggles not in DB)
// stays copy-as-prompt so a human (or Lovable agent) can review and apply.

export type ProposedAction = {
  type: string;
  target: string;
  current: string;
  proposed: string;
  rationale: string;
  expected_impact: string;
  applied?: boolean;
  applied_at?: string;
  applied_value?: string;
};

// Whitelisted risk_parameters columns the Coach can auto-apply.
// Kept intentionally narrow — only well-understood tuning knobs.
const NUMERIC_COLUMNS = new Set<string>([
  "max_risk_per_trade_percent",
  "max_open_trades",
  "max_trades_per_symbol",
  "daily_loss_limit_percent",
  "consecutive_loss_threshold",
  "position_size_reduction_percent",
  "min_confidence_threshold",
  "min_trend_consistency",
  "trailing_stop_activation_percent",
  "trailing_stop_distance_multiplier",
  "rebalance_loss_threshold_percent",
  "max_positions_to_close_per_cycle",
  "pullback_position_size_percent",
  "early_reversal_position_size_percent",
  "standard_tp_multiplier",
  "divergence_tp_multiplier",
  "divergence_sl_multiplier",
  "break_even_activation_percent",
  "trailing_stop_profit_lock_percent",
  "drawdown_circuit_breaker_percent",
  "time_based_stop_hours",
  "dynamic_stop_tightening_hours",
  "dynamic_stop_tightening_percent",
  "partial_loss_trigger_percent",
  "partial_loss_close_percent",
  "loss_recovery_position_size_percent",
  "loss_recovery_confidence_boost",
  "kelly_max_risk_cap",
  "min_trades_for_kelly",
  "hedge_reversal_risk_min",
  "hedge_reversal_risk_max",
  "hedge_position_size_percent",
  "min_hold_time_minutes",
  "trailing_aggressiveness",
  "early_profit_lock_threshold",
  "recovery_exit_drawdown_percent",
  "max_recovery_trades_per_day",
  "min_momentum_score",
  "max_overextension_atr",
  "min_pullback_depth",
  "min_entry_quality_score",
  "trending_regime_min_adx",
  "ranging_regime_max_adx",
  "base_position_size_percent",
  "base_stop_loss_percent",
  "base_take_profit_multiplier",
]);

const BOOLEAN_COLUMNS = new Set<string>([
  "is_trading_enabled",
  "paper_trading_mode",
  "auto_execute_signals",
  "trailing_stop_enabled",
  "auto_rebalance_enabled",
  "enable_pullback_signals",
  "enable_early_reversal_signals",
  "break_even_enabled",
  "drawdown_circuit_breaker_enabled",
  "time_based_stop_enabled",
  "dynamic_stop_tightening_enabled",
  "partial_loss_taking_enabled",
  "loss_recovery_mode_enabled",
  "dynamic_max_trades_enabled",
  "kelly_criterion_enabled",
  "trailing_daily_limit_enabled",
  "hedging_enabled",
  "ai_analysis_enabled",
  "progressive_lock_enabled",
  "stale_peak_protection_enabled",
  "decay_velocity_exit_enabled",
  "early_profit_lock_enabled",
  "momentum_exit_guard_enabled",
  "regime_aware_trading",
  "require_volume_confirmation",
  "exhaustion_block_enabled",
  "shadow_mode_enabled",
  "enable_atr_based_stops",
  "enable_adx_position_scaling",
  "enable_quality_based_sizing",
  "compression_module_enabled",
]);

const APPLICABLE_TYPES = new Set(["threshold_change", "sizing_change"]);

function normalizeTarget(target: string): string | null {
  if (!target) return null;
  // Strip common prefixes like "risk_parameters.foo", "settings.foo", "config.foo".
  const cleaned = target
    .trim()
    .replace(/^(risk_parameters|settings|config)\./i, "")
    .replace(/["'`]/g, "")
    .trim();
  // Only accept a bare snake_case identifier.
  if (!/^[a-z_][a-z0-9_]*$/i.test(cleaned)) return null;
  return cleaned.toLowerCase();
}

function parseNumeric(raw: string): number | null {
  if (raw == null) return null;
  const m = String(raw).match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function parseBoolean(raw: string): boolean | null {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (["true", "1", "on", "enabled", "yes", "aç", "acik", "açık"].includes(s)) return true;
  if (["false", "0", "off", "disabled", "no", "kapa", "kapali", "kapalı"].includes(s)) return false;
  return null;
}

export type ApplyPlan =
  | {
      applicable: true;
      column: string;
      kind: "numeric" | "boolean";
      value: number | boolean;
      displayValue: string;
    }
  | { applicable: false; reason: string };

export function planActionApply(action: ProposedAction): ApplyPlan {
  if (!APPLICABLE_TYPES.has(action.type)) {
    return {
      applicable: false,
      reason: `Bu aksiyon tipi ('${action.type}') otomatik uygulanamaz. Kod, gate-flag veya strateji değişiklikleri Lovable chat üzerinden yapılmalı.`,
    };
  }
  const col = normalizeTarget(action.target);
  if (!col) {
    return { applicable: false, reason: `Hedef ('${action.target}') tanımlı bir risk_parameters kolonu değil.` };
  }
  if (NUMERIC_COLUMNS.has(col)) {
    const v = parseNumeric(action.proposed);
    if (v == null) {
      return { applicable: false, reason: `Önerilen değer sayısal olarak okunamadı: '${action.proposed}'.` };
    }
    return { applicable: true, column: col, kind: "numeric", value: v, displayValue: String(v) };
  }
  if (BOOLEAN_COLUMNS.has(col)) {
    const v = parseBoolean(action.proposed);
    if (v == null) {
      return { applicable: false, reason: `Önerilen değer boolean olarak okunamadı: '${action.proposed}'.` };
    }
    return { applicable: true, column: col, kind: "boolean", value: v, displayValue: v ? "true" : "false" };
  }
  return {
    applicable: false,
    reason: `'${col}' otomatik uygulama beyaz listesinde yok. Bu değişiklik için Lovable chat kullan.`,
  };
}
