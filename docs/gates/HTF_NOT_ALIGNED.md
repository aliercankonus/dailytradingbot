# HTF_NOT_ALIGNED Gate v4

## Overview

The **HTF Not Aligned** gate ensures trades follow the 4H and 1H structural trend unless specific bypass conditions are met. This gate prevents counter-trend entries that fight against higher timeframe momentum.

## Key Fixes (v4)

### Fix #1: Confidence Decoupling
- **Problem**: Global confidence included 4H components, causing double-counting when checking HTF bypass logic
- **Solution**: Calculate `confidenceLocal` (15m/30m/1h only) for bypass evaluation
- **Formula**: `confidenceLocal = (1h × 0.5) + (30m × 0.3) + (15m × 0.2)`

### Fix #2: Strong 1H Counter-Trend Block
- **Problem**: 1H bypass allowed entries even when 4H was strongly opposing
- **Solution**: Add `!is1hCounterTrendTo4h` check to the 1H bypass condition
- **Example**: LONG blocked if 1H=bullish 70% but 4H=bearish

### Fix #3: Directional Overrides
- **Problem**: Overrides (price action, momentum) were direction-agnostic, causing "override leakage"
- **Solution**: Overrides only bypass the gate if their direction matches `intendedMarketDirection`
- **Mapping**: `long → bullish`, `short → bearish`

### Fix #4: UI Transparency
- **Added**: "What would have passed?" hints showing exact thresholds needed
- **Added**: Local vs Global confidence badges
- **Added**: Counter-trend status indicator

---

## Gate Logic (Decision Tree)

```
START
  │
  ├─ HTF Aligned? ────────────────────────── YES → PASS (1.0x)
  │
  ├─ Local Confidence ≥ 65%? ─────────────── YES → PASS (1.0x)
  │
  ├─ Strong 1H Direction?
  │   ├─ 1H Confidence ≥ 65%
  │   ├─ 1H Trend = bullish OR bearish
  │   └─ NOT counter-trend to 4H ─────────── YES → PASS (1.0x*)
  │                                                 * reduced to 0.85x if 4H neutral
  │
  ├─ DST Weak Trend Promotion?
  │   ├─ Declining Strong Trend bypass active
  │   ├─ 1H extendedTrend = weak_bullish/weak_bearish
  │   ├─ 1H confidence ≥ 50%
  │   ├─ 4H = neutral (not directional)
  │   └─ NOT counter-trend to 4H ────────────── YES → PASS (0.50x)
  │
  ├─ Micro-Trend Bypass?
  │   ├─ ADX ≥ 23
  │   ├─ Persistence ≥ 3 bars
  │   ├─ Volume confirmed
  │   └─ NOT 4H counter-trend ────────────── YES → PASS (0.60x)
  │
  ├─ Override Active & Directionally Aligned?
  │   ├─ LOW_ADX_TREND_EXCEPTION
  │   ├─ PRICE_ACTION_OVERRIDE (direction match, NOT RANGE regime) ← FIX #3
  │   └─ STRONG_MOMENTUM_OVERRIDE (direction match)
  │   ─────────────────────────────────────── YES → PASS (override size)
  │
  └─ REJECT → Log with bypass hints
  │
  └─ REJECT → Log with bypass hints
```

---

## Position Sizing Table

| Bypass Type | Condition | Size Multiplier |
|-------------|-----------|-----------------|
| HTF Aligned | 4H + 1H agree | 1.00x |
| High Local Confidence | ≥ 65% (local only) | 1.00x |
| Strong 1H | ≥ 65% + aligned with 4H | 1.00x |
| Strong 1H | ≥ 65% + 4H neutral | 0.85x |
| DST Weak Trend | DST active + weak 1h + 4H neutral | 0.50x |
| Micro-Trend | ADX≥23, vol, 3+ bars | 0.60x |
| Price Action Override | Direction-aligned | 0.50-0.70x |
| Strong Momentum Override | Direction-aligned | 0.65x |

---

## Rejection Log Fields

When a signal is blocked by this gate, the following fields are logged:

```typescript
{
  htfAligned: boolean,
  confidence: number,        // Global (includes 4H)
  confidenceLocal: number,   // Local (15m/30m/1h only) - used for bypass
  confidence1h: number,
  confidence30m: number,
  confidence15m: number,
  trend1h: string,
  trend4h: string,
  is1hCounterTrendTo4h: boolean,  // NEW: Counter-trend flag
  microTrend: object,
  bypassHints: {              // NEW: Transparency hints
    needsConfidenceLocal: number,
    needs1hConfidence: number,
    needs4hAligned: boolean,
    is1hBlockedByCounterTrend: boolean,
    microTrendBlocked: boolean,
  },
  momentum: object,
  gate: "HTF_NOT_ALIGNED"
}
```

---

## UI Display

The `HardGateHtfDisplay` component shows:

1. **Header**: Gate name with Global and Local confidence badges
2. **Timeframe Grid**: 4H and 1H trends with counter-trend warning
3. **Requirements Check**: HTF alignment, local confidence, 1H status
4. **What Would Pass**: Actionable hints showing exact thresholds needed
5. **Why Blocked**: Explanation text

---

## Related Gates

- `NO_CLEAR_DIRECTION`: Terminal fallback when no direction can be derived
- `MOMENTUM_DIRECTION_OPPOSING`: Blocks entries against active momentum
- `NO_MOMENTUM_CONFIRMATION`: Requires momentum state presence

---

## Changelog

### v6 (2026-02-16)
- **DST Weak Trend Promotion**: Extended Declining Strong Trend bypass to HTF_NOT_ALIGNED gate
- When DST is active and 1h extendedTrend is weak_bullish/weak_bearish with ≥50% confidence:
  - Treats weak directional 1h as sufficient for HTF alignment (0.50x position)
  - Boosts confidenceLocal by +8 (capped at 65) for threshold evaluation
  - Only applies when 4H is neutral (not directional) to prevent counter-trend entries
- Added `isDSTActiveForHTF`, `extendedTrend1hForHTF`, `hasDSTWeakDirectionBypass` to rejection logs
- Added `dstBypassAvailable`, `dstBypassBlocked`, `dstBlockReason` to bypass hints

### v5 (2025-01-27)
- **FIX #3 (Audit)**: Disabled PRICE_ACTION_OVERRIDE bypass when regime == RANGE
- Prevents chop losses at range extremes where price moves are mean-reverting
- Added `priceActionBlockedByRangeRegime` to rejection log bypassHints
- Added `currentRegime` to rejection log for transparency

### v4 (2025-01-27)
- Decoupled `confidenceLocal` from HTF components
- Added `is1hCounterTrendTo4h` check to 1H bypass
- Made overrides directional (must match intended trade direction)
- Added "What would have passed?" UI hints
- Enhanced rejection logging with bypass hints

### v3 (Previous)
- Added micro-trend bypass with ADX/volume/persistence
- Added 4H counter-trend block for micro-trend

### v2 (Previous)
- Added strong 1H bypass (≥65% confidence)
- Added override exceptions (LOW_ADX, PRICE_ACTION, STRONG_MOMENTUM)
