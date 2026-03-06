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
  MIN_ADX_SLOPE: 0.8,
  OVERRIDE_SCORE: 20,
  MIN_PRICE_IMPULSE_ABS: 3,
}
```

## Impact on Downstream Gates

With momentum clamped to -20 (for bearish price):
- **Momentum Direction Opposing**: No longer blocks SHORT (score is now bearish)
- **STRONG_TREND_TIER0_OVERRIDE**: May still fail (-20 > -30 threshold) but...
- **TREND_ACCELERATION_PROBE**: New fallback allows 0.25x probe when ADX>30, slope>0.8

## Related Changes

- `EARLY_TIER_0`: Added Trend Acceleration Probe (0.25x) when override fails but ADX confirms
- `DEEP_EXHAUSTION_COMPOUND`: Added Acceleration Probe (0.20x) when slope > 1.2 and ADX > 35

## Changelog

### v1.0 (2026-03-07)
- Initial implementation fixing momentum-price divergence
- Structural confirmation via ADX + slope + price impulse
- Conservative clamping (±20) preserves scoring framework integrity
