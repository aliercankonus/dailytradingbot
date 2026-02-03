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

## Strong Trend Relaxation (v1.1)

In strong trending regimes, the gate relaxes its thresholds to prevent over-rejection of high-conviction continuation moves.

### Relaxation Triggers (any one of these)

| Condition | Threshold |
|-----------|-----------|
| ADX Strength | ≥ 28 |
| Bollinger Squeeze | Active |
| Bollinger Breakdown (SHORT) | %B ≤ 15 |
| Bollinger Breakout (LONG) | %B ≥ 85 |

### Safety Check
- **ADX Slope**: Must not be sharply declining (> -1.0)
- If ADX slope < -1.0, relaxation is blocked

### Relaxed Thresholds

| Zone | Default | Relaxed |
|------|---------|---------|
| Soft Zone | 2.5% | 3.5% |
| Hard Zone | 1.5% | 2.0% |

### Position Sizing (Relaxed)

| Zone | Multiplier |
|------|------------|
| Relaxed Soft (2.5-3.5%) | 45% |
| Relaxed Transition (1.5-2.0%) | 35% |

## Gate Logic

```
START
  │
  ├─ Check for Strong Trend Relaxation
  │   ├─ ADX >= 28? → RELAX thresholds
  │   ├─ BB Squeeze active? → RELAX thresholds
  │   ├─ %B <= 15 (SHORT) or >= 85 (LONG)? → RELAX thresholds
  │   └─ ADX slope < -1.0? → BLOCK relaxation
  │
  ├─ Is this a SHORT near 24h LOW?
  │   │
  │   ├─ Distance from low < hard zone?
  │   │   ├─ LTF bearish? → ALLOW (reduced: 40% if ADX ≥ 50, else 25%)
  │   │   └─ LTF not bearish? → BLOCK (unless relaxed)
  │   │
  │   ├─ Distance from low < soft zone?
  │   │   ├─ LTF bearish? → ALLOW (full size)
  │   │   ├─ ADX ≥ 50? → ALLOW (40% position)
  │   │   ├─ Relaxed & > default soft? → ALLOW (45% position)
  │   │   └─ LTF not bearish? → REDUCE (25% position)
  │   │
  │   └─ Distance ≥ soft zone? → Skip gate
  │
  ├─ Is this a LONG near 24h HIGH? (symmetric logic)
```

## Position Sizing Table

### Shorts Near 24h Low (Default Thresholds)

| Distance from Low | LTF Bearish | ADX ≥ 50 | Action |
|-------------------|-------------|----------|--------|
| < 1.5% | Yes | Any | 25-40% position |
| < 1.5% | No | Yes | 40% position |
| < 1.5% | No | No | **BLOCK** |
| 1.5% - 2.5% | Yes | Any | Full position |
| 1.5% - 2.5% | No | Yes | 40% position |
| 1.5% - 2.5% | No | No | 25% position |
| ≥ 2.5% | Any | Any | Skip gate |

### With Strong Trend Relaxation

| Distance from Low | Relaxed | Action |
|-------------------|---------|--------|
| < 2.0% (was 1.5%) | Yes | 35% position (transition) |
| 2.0% - 3.5% | Yes | 45% position (soft) |
| 2.5% - 3.5% | No (default would block) | Now ALLOWED with 45% |

## Configuration

```typescript
NEAR_EXTREME_PROTECTION_GATE = {
  ENABLED: true,
  
  // Default thresholds
  SHORT_NEAR_LOW_THRESHOLD_PERCENT: 2.5,
  LONG_NEAR_HIGH_THRESHOLD_PERCENT: 2.5,
  HARD_ZONE_THRESHOLD_PERCENT: 1.5,
  BLOCK_IN_HARD_ZONE: true,
  
  // Strong Trend Relaxation
  STRONG_TREND_RELAXATION: {
    ENABLED: true,
    MIN_ADX_FOR_RELAXATION: 28,
    BOLLINGER_SQUEEZE_TRIGGER: true,
    BOLLINGER_BREAKDOWN_TRIGGER: true,
    BOLLINGER_BREAKDOWN_SHORT_MAX_B: 15,
    BOLLINGER_BREAKDOWN_LONG_MIN_B: 85,
    MAX_ADX_SLOPE_DECLINE: -1.0,
    RELAXED_SOFT_THRESHOLD_PERCENT: 3.5,
    RELAXED_HARD_ZONE_PERCENT: 2.0,
    RELAXED_SOFT_MULTIPLIER: 0.45,
    RELAXED_TRANSITION_MULTIPLIER: 0.35,
  },
  
  // LTF override requirement
  REQUIRE_LTF_MISALIGNMENT: true,
  LTF_ALIGNMENT_MIN_CONFIDENCE: 60,
  
  // Position sizing
  PROXIMITY_POSITION_MULTIPLIER: 0.25,
  ADX_OVERRIDE_THRESHOLD: 50,
  ADX_OVERRIDE_MULTIPLIER: 0.40,
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
  adxSlope: number,
  ltfSupportsShort: boolean,  // or ltfSupportsLong
  hardZoneThreshold: number,
  softZoneThreshold: number,
  relaxationApplied: boolean,
  relaxationTrigger: string,  // e.g., "ADX 32.5 >= 28"
  wouldPassWith: string
}
```

## Case Study: BTC Shorts Problem (Updated)

**Before (without relaxation):**
- 4H bearish, ADX 32
- Price 2.8% above 24h low (would be blocked at 2.5% default)
- Strong BB breakdown (%B = 8)
- Result: Entry blocked despite strong structure

**After (with relaxation):**
- Gate detects: ADX 32 >= 28 → relaxation triggered
- Relaxed soft threshold: 3.5%
- Distance 2.8% < 3.5% → soft zone entry allowed
- Action: **ALLOW** with 45% position size

## Related Gates

- `LTF_CONFIRMATION_GATE`: Requires LTF alignment for continuation
- `MOVE_EXHAUSTED`: Blocks after large price moves (also has relaxation)
- `ADX_SLOPE_GRADUATED`: Bollinger Breakdown Override

## Changelog

### v1.1 (2025-02-03)
- Added Strong Trend Relaxation
- Triggers: ADX >= 28, BB Squeeze, Bollinger Breakdown
- Relaxed thresholds: soft 3.5%, hard 2.0%
- Safety check: ADX slope > -1.0
- Position sizing: 45% (relaxed soft), 35% (transition)

### v1.0 (2025-02-02)
- Initial implementation
- Dual-sided protection (longs near highs, shorts near lows)
- ADX override for parabolic moves
- LTF alignment-aware position sizing
- Hard zone blocking for extreme proximity
