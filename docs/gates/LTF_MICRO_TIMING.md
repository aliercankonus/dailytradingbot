# LTF Micro Timing Gate

## Overview

Uses 1m/5m micro-momentum `entryTimingScore` (0-100) from the `ltfMicroMomentum` snapshot to adjust position sizing based on entry timing quality.

## Entry Timing Score Calculation (Weighted Composite)

```
entryTimingScore = 50 (baseline) + htfAlignBonus + accelBonus + momMagBonus + alignBonus
```

### Weight Distribution

| Factor | Weight | Range | Description |
|--------|--------|-------|-------------|
| HTF Alignment | ~35% | -15 to +20 | Does 5m/1m agree with primary trend? |
| 5m Acceleration | ~25% | 0 to +20 | Is 5m momentum accelerating toward HTF? |
| 5m Momentum Magnitude | ~25% | -15 to +15 | How strong is 5m directional score? |
| 1m/5m Alignment | ~10% | -6 to +6 | Do 1m and 5m timeframes agree? (reduced from ±10 to ±6 to avoid double counting with boost guard) |

### Score Examples

| Scenario | Score | Gate Effect |
|----------|-------|-------------|
| 5m accel + HTF confirms + aligned | 85-100 | ×1.20 boost |
| HTF confirms + strong 5m | 73-80 | ×1.10 boost |
| HTF confirms + moderate 5m | 65-70 | ×1.00 neutral |
| Baseline (neutral) | 50 | ×1.00 neutral |
| Opposing 5m momentum (>40) | 20-25 | ×0.50 penalty |

## Score → Position Map (Graduated)

| Entry Timing Score | Multiplier | Tier |
|---|---|---|
| < 30 | 0.50x | POOR |
| 30–70, align < 0 | 0.75x | CONFLICT |
| 30–70 | 1.00x | NEUTRAL |
| 70–80 | 1.10x | GOOD |
| > 80 | 1.20x | EXCELLENT |

## Boost Guards

The boost (GOOD/EXCELLENT) only applies when:
1. **ADX ≥ 22** — Trend energy must be present
2. **ltfAlignment > 0** — 1m and 5m must agree on direction

## Configuration

```typescript
LTF_MICRO_TIMING_GATE = {
  ENABLED: true,
  POOR_TIMING_THRESHOLD: 30,
  POOR_TIMING_MULTIPLIER: 0.50,
  GOOD_TIMING_THRESHOLD: 70,
  GOOD_TIMING_MULTIPLIER: 1.10,
  EXCELLENT_TIMING_THRESHOLD: 80,
  EXCELLENT_TIMING_MULTIPLIER: 1.20,
  MIN_ADX_FOR_BOOST: 22,
  REQUIRE_LTF_ALIGNMENT_FOR_BOOST: true,
};
```

## Dashboard

LTF Micro Momentum widget (`LtfMicroMomentumWidget.tsx`) reads `ltfMicroMomentum` from `trend_snapshots.snapshot_data` and displays per-symbol: 5m/1m scores, alignment, timing score with progress bar, grade badge, and effective multiplier.

## Changelog

### v1.3 (2026-03-08)
- **LTF Conflict Gate**: `ltfAlignment < 0` → ×0.75 soft penalty (catches 1m/5m opposing micro-reversals)
- **Cap ordering fix**: LTF_MICRO_TIMING moved BEFORE position cap (was after — boost could exceed 5% max)
- **jsonb_set `create_if_missing`**: Added `true` flag to prevent first-run errors on empty snapshot_data
- **Dashboard sort**: Changed from `abs(score-50)` to `abs(multiplier-1)` for trade-impact ranking
- **Enhanced logging**: Full component breakdown in LTF_MICRO_TIMING log (5m/1m scores, direction, acceleration)

### v1.2 (2026-03-08)
- Reduced alignBonus from ±10 to ±6: prevents double counting with boost guard (alignment checked twice)
- DB persist optimization: jsonb_set RPC (single UPDATE) replaces read+write pattern (2 ops → 1 op per symbol)
- Created `jsonb_set_snapshot_field` database function with fallback

### v1.1 (2026-03-08)
- Graduated boost tiers: 70-80 → 1.10x, 80+ → 1.20x (was flat 70+ → 1.20x)
- Weighted composite scoring: HTF align (35%), accel (25%), magnitude (25%), LTF align (15%)
- Added LTF Micro Momentum dashboard widget
- Persisted ltfMicroMomentum to trend_snapshots for frontend

### v1.0 (2026-03-08)
- Initial implementation
