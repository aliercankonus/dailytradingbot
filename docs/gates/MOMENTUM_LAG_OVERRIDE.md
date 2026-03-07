# STRUCTURAL MOMENTUM LAG OVERRIDE

## Overview

Fixes the paradox where momentum score lags behind price action due to
EMA spread smoothing, MACD averaging, and RSI smoothing. When price has
moved significantly but momentum still reads the opposite direction, this
override clamps the score toward the price direction.

## The Problem

| Metric | BTC Example | Expected | Actual |
|--------|-------------|----------|--------|
| Price move | -4.4% | bearish | — |
| ADX | 45.4 | strong trend | — |
| ADX slope | +1.80 | accelerating | — |
| StochRSI K | 0.0 | deeply oversold | — |
| **Momentum score** | **+22** | **bearish** | **bullish** ❌ |

The lagging indicators (EMA RoC, MACD slope) haven't caught up with the
price action, causing the system to read bullish momentum during a strong
bearish move.

## Solution

Post-scoring structural override in `smart-momentum.ts`:

```
IF |priceMove| >= 3%
   AND ADX >= 25
   AND |ADX slope| >= 0.8
   AND |priceImpulse| >= 3
   AND momentum score contradicts price direction
THEN
   Clamp score toward price direction (min -20 for bearish, max +20 for bullish)
```

## Configuration

```typescript
STRUCTURAL_LAG_OVERRIDE = {
  ENABLED: true,
  MIN_PRICE_MOVE_PERCENT: 3.0,
  MIN_ADX: 25,
  MIN_ADX_SLOPE: 0.5,        // was 0.8 — too high for 4H (typical strong trends: 0.3-0.7)
  OVERRIDE_SCORE: 20,
  MIN_PRICE_IMPULSE_ABS: 2,  // was 3 — 4H impulse rarely reaches 3 during lag window
}
```

## Impact on Downstream Gates

With momentum clamped to -20 (for bearish price):
- **Momentum Direction Opposing**: No longer blocks SHORT (score is now bearish)
- **STRONG_TREND_TIER0_OVERRIDE**: May still fail (-20 > -30 threshold) but...
- **TREND_ACCELERATION_PROBE**: Fallback allows 0.25x probe when ADX>30, slope>0.5

## Related Changes

### EARLY_TIER_0 Trend Acceleration Probe
- Slope threshold: 0.8 → **0.5** (matches 4H slope distribution)
- Position: 0.25x (unchanged — high variance trade)

### DEEP_EXHAUSTION Acceleration Probe
- ADX threshold: 35 → **32**
- Slope threshold: 1.2 → **0.6** (was spike-only; now captures strong expansions)
- Position: 0.20x (unchanged)

### OVEREXTENSION_ATR_BLOCK Bypass
- New: `trendAccelerationConfirmed` flag bypasses OVEREXTENSION block
- Conditions: ADX >= 35, slope >= 0.5, momentum aligned (score > 15 or < -15)
- Position: capped at 0.20x
- Rationale: During trend acceleration, ATR overextension is expected — price moves fast from EMA

### Probe Cascade Protection
- `MAX_PROBES_PER_SYMBOL_6H = 2` — prevents over-probing on same symbol
- Applied to all three probe types: EARLY_TIER_0, DEEP_EXHAUSTION, OVEREXTENSION bypass

## Changelog

### v1.1 (2026-03-07)
- MIN_ADX_SLOPE: 0.8 → 0.5 (staggered adjustment, production-safe)
- MIN_PRICE_IMPULSE_ABS: 3 → 2
- EARLY_TIER_0 probe slope: 0.8 → 0.5
- DEEP_EXHAUSTION: ADX 35→32, slope 1.2→0.6
- Added trendAcceleration bypass for OVEREXTENSION_ATR_BLOCK
- Added probe cascade protection (max 2 per symbol per 6h)

### v1.0 (2026-03-07)
- Initial implementation fixing momentum-price divergence
- Structural confirmation via ADX + slope + price impulse
- Conservative clamping (±20) preserves scoring framework integrity
