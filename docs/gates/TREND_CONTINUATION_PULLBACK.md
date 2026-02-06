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
  - ADX slope >= 0.05 (trend not dying, REFINED from 0.0)
  - 4H StochRSI K <= 80 (cooled from overbought for LONG)
  - Price is within dynamic threshold of EMA20/50 midpoint:
    - ADX < 35: 0.8% threshold (looser for moderate trends)
    - ADX >= 35: 0.5% threshold (tighter for strong trends)
  - Move from swing low <= 8% (6% if shallow pullback)
```

## EMA Pullback Detection

The regime checks proximity to three EMA levels:

| Level | Description | Priority |
|-------|-------------|----------|
| EMA Midpoint | (EMA20 + EMA50) / 2 | Highest |
| EMA20 | Fast EMA | Medium |
| EMA50 | Slow EMA | Lowest |

**Dynamic Proximity Threshold** (REFINED):
- ADX < 35: 0.8% (moderate trends need larger pullback zone)
- ADX >= 35: 0.5% (strong trends have tighter structure)

If price is not currently near an EMA, the regime also checks if price **touched** the EMA in the last 3 candles.

## Position Sizing

| Condition | Multiplier |
|-----------|------------|
| Base (pullback detected) | 0.50x |
| Momentum aligned | 0.70x |
| Shallow pullback (< 1.5%) | 0.40x |

## Stop Loss (REFINED: Max Hierarchy)

```
STOP = max(ATR_stop, EMA_stop)
```

- **ATR-based**: 1.0x ATR (tight)
- **EMA-based**: Entry EMA + 0.3% buffer
- **Rule**: Never allow stop inside structure (use whichever is wider)

## Gate Bypass Behavior

| Gate | Bypassed? |
|------|-----------|
| MOVE_EXHAUSTION | ✅ Yes (can enter > 5% moves) |
| NEAR_EXTREME_PROTECTION | ❌ No (still respects 24h proximity) |
| TIER_0_STOCHRSI | ❌ No (never bypasses deep overbought) |

## Continuation Cooldown (REFINED: Anti-Overtrade)

To prevent "death-by-a-thousand-pullbacks":

| Parameter | Value |
|-----------|-------|
| Cooldown Period | 4 hours between entries |
| Max Entries Per Leg | 1 |
| Block After Loss | Yes (same regime) |
| Leg Reset | ADX drops below 25 |

## Logging

```
TREND_CONTINUATION_PULLBACK eligible for LONG
✅ Pullback to EMA midpoint (0.52% away)
ADX 32.1 (slope: +0.15)
EMA proximity threshold: 0.50% (ADX >= 35)
StochRSI cooled: K=72.3 <= 80
Move from swing: 6.2% <= 8%
Stop: max(ATR 245.00, EMA 180.00) = 245.00
```

## Configuration

Located in `constants.ts` under `TREND_CONTINUATION_PULLBACK_REGIME`:

```typescript
TREND_CONTINUATION_PULLBACK_REGIME = {
  ENABLED: true,
  MIN_ADX: 30,
  MIN_ADX_SLOPE: 0.05,  // REFINED from 0.0
  EMA_PULLBACK: {
    PROXIMITY_THRESHOLD_PERCENT: 0.8,      // For ADX < 35
    PROXIMITY_THRESHOLD_STRONG_ADX: 0.5,   // For ADX >= 35
    STRONG_ADX_THRESHOLD: 35,
  },
  STOCHRSI_COOLDOWN: {
    LONG_MAX_K: 80,
    SHORT_MIN_K: 20,
  },
  RELAXED_MOVE_EXHAUSTION: {
    LONG_MAX_MOVE_FROM_LOW_PERCENT: 8.0,
    SHALLOW_PULLBACK_MAX_MOVE_PERCENT: 6.0,
    SHALLOW_PULLBACK_THRESHOLD: 1.5,
  },
  COOLDOWN: {
    ENABLED: true,
    COOLDOWN_HOURS: 4,
    MAX_ENTRIES_PER_LEG: 1,
    BLOCK_AFTER_LOSS: true,
  },
  BASE_POSITION_MULTIPLIER: 0.50,
  USE_MAX_STOP: true,
}
```

## Related

- `BOT_HEARTBEAT_CONFIG`: Monitors bot activity
- `NO_TRADE_ZONE_STATE`: Classifies "no trade" periods
- `MOVE_EXHAUSTION_FILTER_PARAMS`: Standard exhaustion thresholds

## Changelog

### v1.1 (2026-02-06) - Refinements
- Dynamic EMA proximity (ADX < 35 → 0.8%, ADX ≥ 35 → 0.5%)
- ADX slope increased from 0.0 to 0.05
- Shallow pullback exhaustion tightening (6% max move if pullback < 1.5%)
- Stop hierarchy: max(ATR, EMA) to never allow stop inside structure
- Continuation cooldown (4h, max 1 per leg, block after loss)

### v1.0 (2026-02-06)
- Initial implementation
- EMA-based pullback detection
- Integrated with heartbeat monitoring
