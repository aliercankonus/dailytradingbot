# `_shared/constants/` — Category Views (Phase 3B)

The canonical definitions still live in `../constants.ts` (9,583 lines).
This folder provides **category-scoped named re-exports** so new code can
declare its intent at the import site:

| Import from                    | Scope                                                |
| ------------------------------ | ---------------------------------------------------- |
| `../constants/adx.ts`          | ADX thresholds, gates, phases, score params          |
| `../constants/stoch.ts`        | StochRSI / RSI / oscillator gates                    |
| `../constants/quality.ts`      | Quality scoring, floors, sizing                      |
| `../constants/risk.ts`         | Risk sizing, exits, trailing, correlation, symbol    |
| `../constants/strategies.ts`   | Strategy configs, name maps, regime-specific params  |
| `../constants/index.ts`        | Full re-export barrel (drop-in for `../constants.ts`)|

## Rules

1. **Do not move code here** — canonical source is `../constants.ts`. These
   files only re-export identifiers to disambiguate imports.
2. **When adding a new constant**, define it in `../constants.ts`, then add
   its identifier to the matching category view above.
3. **Consumer migration is incremental.** Legacy `import { X } from '../constants.ts'`
   continues to work. New code should prefer category views.

## Rationale (Phase 3B goal)

Splitting a 9,583-line file in one shot risks breaking 100+ import paths.
Category views deliver the *organizational* benefit (grep-friendly grouping,
clear ownership, easier code review) at zero behavioral risk. When a
category grows past ~40 identifiers we can physically move its block into
its own file and update this barrel — the import surface stays stable.
