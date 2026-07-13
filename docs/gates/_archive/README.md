# Archived Gate Documentation

Docs here describe **hard blocks that have been demoted to softenable strategy-specific gates** as of Phase 3A. The rules still fire when `GATE_FLAGS.strategyBlockMode === 'strict'` (the default). Operators can switch to `'soft'` or `'shadow-soft'` at runtime to A/B test the reduced 8-hard-gate model.

These files remain read-only historical references. Do not delete — they document the forensic rationale (backtest WR/PnL) behind each block.

See `supabase/functions/_shared/gate-flags.ts` and Phase 3A of `.lovable/plan.md`.
