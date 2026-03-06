# REGIME: Trend Continuation Pullback (v2.0)

## Overview

This regime addresses the "Too strong to fade, too extended to buy" deadlock by allowing **pullback re-entries** during strong trends after missing the initial entry.

**Philosophy**: "If you can't enter at the start, wait for the first pullback to EMA"

## v2.0 Upgrades

### 1. ATR-Normalized Distance (replaces fixed % proximity)
- Old: Fixed 0.5–0.8% proximity threshold
- New: **0.4–1.2 ATR** optimal entry zone (adapts to volatility)

### 2. Momentum Recovery Detection (replaces static StochRSI threshold)
- Old: Static `K <= 80` check
- New: **StochRSI K cross-up above D** = momentum returning
- Fallback: K rising with Δ >= 2.0, or static threshold

## Problem It Solves

During strong rallies, the system correctly:
- Blocks LONGs at extreme overbought (K > 95) ✅
- Blocks SHORTs against strong trends (ADX > 30) ✅

But this creates a deadlock where the system can't participate at all.

**This regime** allows re-entry when:
1. Price pulls back to the EMA20/50 zone (**0.4–1.2 ATR distance**)
2. Momentum recovers (K crosses above D, or K rising)
3. Trend is still strong (ADX ≥ 30, slope ≥ 0)

## Detection Logic

```typescript
TREND_CONTINUATION_PULLBACK triggers when:
  - ADX >= 30 (strong trend)
  - ADX slope >= 0.05 (trend not dying)
  - Momentum recovery detected:
    - PRIMARY: StochRSI K crosses above D (LONG) or below D (SHORT)
    - SECONDARY: K rising with Δ >= 2.0 and K <= 80
    - FALLBACK: K <= 80 (static, weakest confirmation)
  - ATR-normalized distance to EMA in valid zone:
    - ADX < 35: 0.4–1.2 ATR
    - ADX >= 35: 0.4–1.0 ATR (tighter for strong trends)
  - Move from swing low <= 8% (6% if shallow pullback)
```

## ATR-Normalized Pullback Detection

| ATR Distance | Zone | Interpretation |
|-------------|------|----------------|
| < 0.4 ATR | Too close | Insufficient pullback |
| 0.4–0.8 ATR | Optimal | Best entry zone, higher sizing |
| 0.8–1.2 ATR | Valid | Acceptable entry, base sizing |
| > 1.2 ATR | Chasing | Not a pullback, blocked |

**ADX-based tightening:**
- ADX < 35: max 1.2 ATR
- ADX >= 35: max 1.0 ATR (strong trends have tighter structure)

## Momentum Recovery Detection

| Type | Detection | Strength |
|------|-----------|----------|
| `cross_up` | K crosses above D (LONG) | Strongest ✅ |
| `cross_down` | K crosses below D (SHORT) | Strongest ✅ |
| `k_rising` | K delta >= 2.0, K <= threshold | Medium |
| `k_falling` | K delta <= -2.0, K >= threshold (SHORT) | Medium |
| `static_fallback` | K <= 80 (LONG) or K >= 20 (SHORT) | Weakest (size capped) |

## Position Sizing

| Condition | Multiplier |
|-----------|------------|
| Optimal ATR zone (0.4–0.8 ATR) + cross confirmation | 0.70x |
| Base (valid ATR zone) | 0.50x |
| Shallow pullback (< 0.4 ATR) | 0.40x |
| Static fallback momentum | Capped to 0.40x |

## Stop Loss (Max Hierarchy)

```
STOP = max(ATR_stop, EMA_stop)
```

- **ATR-based**: 1.0x ATR (tight)
- **EMA-based**: Entry EMA + 0.3% buffer
- **Rule**: Never allow stop inside structure

## Gate Bypass Behavior

| Gate | Bypassed? |
|------|-----------|
| MOVE_EXHAUSTION | ✅ Yes |
| NEAR_EXTREME_PROTECTION | ❌ No |
| TIER_0_STOCHRSI | ❌ No |

## Continuation Cooldown

| Parameter | Value |
|-----------|-------|
| Cooldown Period | 4 hours between entries |
| Max Entries Per Leg | 1 |
| Block After Loss | Yes (same regime) |
| Leg Reset | ADX drops below 25 |

## Configuration

Located in `constants.ts` under `TREND_CONTINUATION_PULLBACK_REGIME`:

```typescript
TREND_CONTINUATION_PULLBACK_REGIME = {
  ENABLED: true,
  MIN_ADX: 30,
  MIN_ADX_SLOPE: 0.05,
  EMA_PULLBACK: {
    ATR_DISTANCE_MIN: 0.4,
    ATR_DISTANCE_MAX: 1.2,
    ATR_DISTANCE_OPTIMAL: 0.8,
    ATR_DISTANCE_MAX_STRONG_ADX: 1.0,
    STRONG_ADX_THRESHOLD: 35,
  },
  MOMENTUM_RECOVERY: {
    ENABLED: true,
    REQUIRE_STOCHRSI_CROSS: true,
    FALLBACK_STATIC_CHECK: true,
    LONG_MAX_K: 80,
    SHORT_MIN_K: 20,
    REQUIRE_K_RISING: true,
    MIN_K_DELTA: 2.0,
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

## Changelog

### v2.0 (2026-03-06) - ATR Pullback Engine Upgrade
- **ATR-normalized distance** replaces fixed % proximity (0.4–1.2 ATR optimal zone)
- **Momentum recovery detection** replaces static StochRSI threshold
  - Primary: K crosses above D (cross-up)
  - Secondary: K rising with Δ >= 2.0
  - Fallback: Static K threshold (size capped)
- ADX-based tightening (ADX >= 35 → max 1.0 ATR)
- Optimal zone sizing (0.4–0.8 ATR → 0.70x multiplier)
- Static fallback momentum caps position size to 0.40x

### v1.1 (2026-02-06) - Refinements
- Dynamic EMA proximity (ADX < 35 → 0.8%, ADX ≥ 35 → 0.5%)
- ADX slope increased from 0.0 to 0.05
- Shallow pullback exhaustion tightening
- Stop hierarchy: max(ATR, EMA)
- Continuation cooldown

### v1.0 (2026-02-06)
- Initial implementation
