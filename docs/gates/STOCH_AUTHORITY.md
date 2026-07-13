# StochRSI Authority (Phase 1 Unification)

**Status:** ACTIVE — sole authority for StochRSI-based admission logic.
**File:** `supabase/functions/_shared/stoch-authority.ts`
**Consumer:** `supabase/functions/_shared/gate-pipeline.ts` (single call after direction determination).

## Purpose
Replace 8 scattered StochRSI layers with one deterministic module:

| Legacy Layer                        | Status                                        |
| ----------------------------------- | --------------------------------------------- |
| `LTF_SPIKE_PROTECTION`              | Removed → runwayMultiplier                    |
| `PRE_MOMENTUM_STOCHRSI`             | Removed → runwayMultiplier                    |
| `STOCHRSI_RUNWAY`                   | Removed → runwayMultiplier                    |
| `NEAR_EXTREME_PROTECTION`           | Removed → runwayMultiplier                    |
| `STRONG_TREND_STOCH_OVERBOUGHT/SOLD`| Removed → runwayMultiplier (EXTENDED tier)    |
| `SQUEEZE_BUY_OVERBOUGHT`            | Removed → runwayMultiplier                    |
| `TC_SHORT_OVERSOLD_ENTRY`           | Removed → runwayMultiplier                    |
| Counter-trend soft sizing (macro)   | Refactored to use `stochCtx.tier`             |

## Tier Model (direction-relative)

| Tier             | LONG K range | SHORT K range | Multiplier | Semantics                    |
| ---------------- | ------------ | ------------- | ---------- | ---------------------------- |
| DEEP_FAVORABLE   | ≤ 20         | ≥ 80          | 1.10       | Full runway ahead            |
| FAVORABLE        | ≤ 40         | ≥ 60          | 1.00       | Ample room                   |
| NEUTRAL          | 40 – 70      | 30 – 60       | 0.90       | Mid-zone                     |
| EXTENDED         | ≥ 70         | ≤ 30          | 0.65       | Partial exhaustion           |
| EXTREME          | ≥ 90         | ≤ 10          | 0.40       | Near-parabolic exhaustion    |
| ABSOLUTE (BLOCK) | ≥ 99         | ≤ 1           | 0 (hard)   | K pegged — no valid entry    |

## Parabolic Forgiveness
When `adxSlope ≥ 1.0` and tier is EXTENDED/EXTREME, multiplier is scaled by `1.35`
(capped at 1.0). Rationale: rising ADX means the trend still has room to extend K.

## Hard Blocks
Only two rejection reasons emitted (family = `STOCH`):
- `STOCH_ABSOLUTE_OVERBOUGHT_LONG` (K ≥ 99, LONG)
- `STOCH_ABSOLUTE_OVERSOLD_SHORT` (K ≤ 1, SHORT)

## Contract
```ts
evaluateStochContext(mfs, direction, { adxSlope, timeframe }): StochContext
```
Consumers must NOT call `mfs.stochRsi["1h"].k` directly. Extend the authority module
if a new StochRSI-derived signal is needed.
