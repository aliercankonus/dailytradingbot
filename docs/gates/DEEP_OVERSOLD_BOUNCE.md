# Deep Oversold Bounce

## Problem
EXHAUSTION_BOUNCE_RECOVERY requires ADX slope < -1.0 (trend losing energy) and price overextension from EMA20.
But during strong bearish trends with ADX slope ≥ 0, price can be deeply oversold (K < 15) without trend exhaustion structure.
Result: DEADLOCK continues — no LONG (bearish macro), no SHORT (oversold block).

## Solution
Independent micro-probe mechanism that does NOT require:
- ADX slope decay
- Price overextension from EMA

### Entry Criteria (ALL required)
1. **StochRSI K < 15** — deeply oversold
2. **ADX ≥ 25** — meaningful trend energy (not noise)
3. **Regime = TREND_EXHAUSTION** — structural confirmation
4. **Trend = bearish** — counter-trend bounce context

### Position Sizing
- **0.20x** (20% of normal) — ultra-conservative micro probe

### Risk Parameters
- SL: 0.6x ATR (max 1.0%)
- TP: 0.8x ATR (max 1.0%)

## Gate Pipeline Location
Gate 4.5 fallback — triggers AFTER EXHAUSTION_BOUNCE_RECOVERY fails.

## Relationship to EXHAUSTION_BOUNCE_RECOVERY
- EXHAUSTION_BOUNCE = strict (slope + overext + bounce confirmation) → 0.25x
- DEEP_OVERSOLD_BOUNCE = relaxed (just oversold + regime) → 0.20x (smaller)
- DEEP_OVERSOLD_BOUNCE is the fallback when EXHAUSTION_BOUNCE conditions aren't met

## Config
`DEEP_OVERSOLD_BOUNCE` in `constants.ts`

## Date Added
2026-03-14
