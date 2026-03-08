# LTF Micro Timing Gate

## Overview

Uses 1m/5m micro-momentum `entryTimingScore` (0-100) from the `ltfMicroMomentum` snapshot to adjust position sizing based on entry timing quality.

## Core Principle

> "Good micro-timing → bigger position, poor micro-timing → smaller position"

## Score → Position Map

| Entry Timing Score | Multiplier | Behavior |
|---|---|---|
| < 30 | 0.50x | Poor timing: 1m/5m not supporting entry |
| 30–70 | 1.00x | Neutral: no adjustment |
| > 70 | 1.20x | Excellent: 1m/5m confirm HTF direction |

## Boost Guards

The 1.20x boost only applies when:
1. **ADX ≥ 22** — Trend energy must be present (prevents boosting in chop)
2. **ltfAlignment > 0** — 1m and 5m must agree on direction

If either guard fails, score > 70 still gets 1.0x (no penalty, no boost).

## Data Source

`mfs.ltfMicroMomentum.entryTimingScore` — calculated from:
- 5m EMA slope direction vs primary trend
- 1m/5m alignment agreement
- 5m momentum acceleration
- Recent 1m candle pattern

## Configuration

```typescript
LTF_MICRO_TIMING_GATE = {
  ENABLED: true,
  POOR_TIMING_THRESHOLD: 30,
  POOR_TIMING_MULTIPLIER: 0.50,
  EXCELLENT_TIMING_THRESHOLD: 70,
  EXCELLENT_TIMING_MULTIPLIER: 1.20,
  MIN_ADX_FOR_BOOST: 22,
  REQUIRE_LTF_ALIGNMENT_FOR_BOOST: true,
};
```

## Changelog

### v1.0 (2026-03-08)
- Initial implementation
- Poor timing (<30) → 0.50x, Excellent timing (>70) → 1.20x
- ADX + alignment guards for boost
