# Near-Extreme Protection Gate

## Overview

The **Near-Extreme Protection Gate** prevents continuation entries when price is too close to 24-hour extremes (lows or highs). This addresses poor R:R setups:
- **Shorts near 24h low**: High bounce probability, poor reward
- **Longs near 24h high**: High pullback probability, no room for acceleration

## Problem Solved

Entry location matters. When price is only ~2% above 24h low:
- Poor R:R ratio
- High bounce probability
- No room for further acceleration

This gate blocks or reduces positions for structurally late entries.

## Gate Logic

```
START
  │
  ├─ Is this a SHORT near 24h LOW?
  │   │
  │   ├─ Distance from low < 1.5%?
  │   │   ├─ LTF bearish? → ALLOW (reduced: 40% if ADX ≥ 50, else 25%)
  │   │   └─ LTF not bearish? → BLOCK (HARD ZONE)
  │   │
  │   ├─ Distance from low < 2.5%?
  │   │   ├─ LTF bearish? → ALLOW (full size)
  │   │   ├─ ADX ≥ 50? → ALLOW (40% position)
  │   │   └─ LTF not bearish? → REDUCE (25% position)
  │   │
  │   └─ Distance ≥ 2.5%? → Skip gate
  │
  ├─ Is this a LONG near 24h HIGH? (symmetric logic)
```

## Position Sizing Table

### Shorts Near 24h Low

| Distance from Low | LTF Bearish | ADX ≥ 50 | Action |
|-------------------|-------------|----------|--------|
| < 1.5% | Yes | Any | 25-40% position |
| < 1.5% | No | Yes | 40% position |
| < 1.5% | No | No | **BLOCK** |
| 1.5% - 2.5% | Yes | Any | Full position |
| 1.5% - 2.5% | No | Yes | 40% position |
| 1.5% - 2.5% | No | No | 25% position |
| ≥ 2.5% | Any | Any | Skip gate |

### Longs Near 24h High

| Distance from High | LTF Bullish | ADX ≥ 50 | Action |
|--------------------|-------------|----------|--------|
| < 1.5% | Yes | Any | 25-40% position |
| < 1.5% | No | Yes | 40% position |
| < 1.5% | No | No | **BLOCK** |
| 1.5% - 2.5% | Yes | Any | Full position |
| 1.5% - 2.5% | No | Yes | 40% position |
| 1.5% - 2.5% | No | No | 25% position |
| ≥ 2.5% | Any | Any | Skip gate |

## Configuration

```typescript
NEAR_EXTREME_PROTECTION_GATE = {
  ENABLED: true,
  
  // Proximity thresholds
  SHORT_NEAR_LOW_THRESHOLD_PERCENT: 2.5,
  LONG_NEAR_HIGH_THRESHOLD_PERCENT: 2.5,
  
  // Hard zone (stricter protection)
  HARD_ZONE_THRESHOLD_PERCENT: 1.5,
  BLOCK_IN_HARD_ZONE: true,
  
  // LTF override requirement
  REQUIRE_LTF_MISALIGNMENT: true,
  LTF_ALIGNMENT_MIN_CONFIDENCE: 60,
  
  // Position sizing
  PROXIMITY_POSITION_MULTIPLIER: 0.25,  // Default for near-extreme
  ADX_OVERRIDE_THRESHOLD: 50,           // Very high ADX can override
  ADX_OVERRIDE_MULTIPLIER: 0.40,        // Position with ADX override
}
```

## Rejection Log Fields

```typescript
{
  gate: "NEAR_24H_LOW_HARD" | "NEAR_24H_HIGH_HARD",
  derivedDirection: "long" | "short",
  distanceFromLow: number,  // or distanceFromHigh
  low24h: number,           // or high24h
  tf1hDir: string,
  tf30mDir: string,
  adx: number,
  ltfSupportsShort: boolean,  // or ltfSupportsLong
  hardZoneThreshold: number,
  wouldPassWith: string  // Hint showing bypass conditions
}
```

## Case Study: The BTC Shorts Problem

**Before (without gate):**
- 4H bearish, ADX 59
- 1H and 30M neutral (exhaustion signs)
- Price only 2.2% above 24h low
- Result: Two SHORT entries → immediate loss as price bounced

**After (with gate):**
- Gate detects: `distanceFromLow = 2.2%` < threshold
- Gate checks: 1H = neutral, 30M = neutral (no LTF support)
- Action: **BLOCK** entry OR reduce to 25% probe

## Related Gates

- `LTF_CONFIRMATION_GATE`: Requires LTF alignment for continuation
- `MOVE_EXHAUSTED`: Blocks after large price moves

## Changelog

### v1.0 (2025-02-02)
- Initial implementation
- Dual-sided protection (longs near highs, shorts near lows)
- ADX override for parabolic moves
- LTF alignment-aware position sizing
- Hard zone blocking for extreme proximity
