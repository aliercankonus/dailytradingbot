# REGIME: Trend Continuation Pullback

## Overview

This regime addresses the "Too strong to fade, too extended to buy" deadlock by allowing **pullback re-entries** during strong trends after missing the initial entry.

**Philosophy**: "If you can't enter at the start, wait for the first pullback to EMA"

## Problem It Solves

During strong rallies, the system correctly:
- Blocks LONGs at extreme overbought (K > 95) ✅
- Blocks SHORTs against strong trends (ADX > 30) ✅

But this creates a deadlock where the system can't participate at all.

**This regime** allows re-entry when:
1. Price pulls back to the EMA20/50 zone
2. StochRSI cools down from extreme (K drops below 80)
3. Trend is still strong (ADX ≥ 30, slope ≥ 0)

## Detection Logic

```typescript
TREND_CONTINUATION_PULLBACK triggers when:
  - ADX >= 30 (strong trend)
  - ADX slope >= 0 (trend not dying)
  - 4H StochRSI K <= 80 (cooled from overbought for LONG)
  - Price is within 0.8% of EMA20/50 midpoint
  - Move from swing low <= 8% (some runway remains)
```

## EMA Pullback Detection

The regime checks proximity to three EMA levels:

| Level | Description | Priority |
|-------|-------------|----------|
| EMA Midpoint | (EMA20 + EMA50) / 2 | Highest |
| EMA20 | Fast EMA | Medium |
| EMA50 | Slow EMA | Lowest |

**Proximity Threshold**: 0.8% (configurable)

If price is not currently near an EMA, the regime also checks if price **touched** the EMA in the last 3 candles.

## Position Sizing

| Condition | Multiplier |
|-----------|------------|
| Base (pullback detected) | 0.50x |
| Momentum aligned | 0.70x |
| Shallow pullback (< 1.5%) | 0.40x |

## Stop Loss

- **ATR-based**: 1.0x ATR (tight)
- **EMA-based**: Entry EMA + 0.3% buffer (alternative)

## Gate Bypass Behavior

| Gate | Bypassed? |
|------|-----------|
| MOVE_EXHAUSTION | ✅ Yes (can enter > 5% moves) |
| NEAR_EXTREME_PROTECTION | ❌ No (still respects 24h proximity) |
| TIER_0_STOCHRSI | ❌ No (never bypasses deep overbought) |

## Logging

```
TREND_CONTINUATION_PULLBACK eligible for LONG
✅ Pullback to EMA midpoint (0.52% away)
ADX 32.1 (slope: +0.15)
StochRSI cooled: K=72.3 <= 80
Move from swing: 6.2% <= 8%
```

## Configuration

Located in `constants.ts` under `TREND_CONTINUATION_PULLBACK_REGIME`:

```typescript
TREND_CONTINUATION_PULLBACK_REGIME = {
  ENABLED: true,
  MIN_ADX: 30,
  MIN_ADX_SLOPE: 0.0,
  EMA_PULLBACK: {
    PROXIMITY_THRESHOLD_PERCENT: 0.8,
    EMA_TYPE: 'MIDPOINT',
  },
  STOCHRSI_COOLDOWN: {
    LONG_MAX_K: 80,
    SHORT_MIN_K: 20,
  },
  RELAXED_MOVE_EXHAUSTION: {
    LONG_MAX_MOVE_FROM_LOW_PERCENT: 8.0,
  },
  BASE_POSITION_MULTIPLIER: 0.50,
}
```

## Related

- `BOT_HEARTBEAT_CONFIG`: Monitors bot activity
- `NO_TRADE_ZONE_STATE`: Classifies "no trade" periods
- `MOVE_EXHAUSTION_FILTER_PARAMS`: Standard exhaustion thresholds

## Changelog

### v1.0 (2026-02-06)
- Initial implementation
- EMA-based pullback detection
- Integrated with heartbeat monitoring
