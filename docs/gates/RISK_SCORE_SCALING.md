# Risk Score Position Scaling Architecture

## Overview

Replaces binary hard gates with cumulative risk scoring that scales position size instead of rejecting signals outright.

## Core Principle

> "Minor risk → reduced position, NOT full rejection"
> "Only cumulative high risk (score ≥ 4) triggers hard rejection"

## Risk Score Calculation

```
riskScore = Σ(risk_points) + Σ(risk_reductions)
```

### Risk Point Sources

| Factor | Points | Description |
|--------|--------|-------------|
| Deep oversold K | +2 | StochRSI K below dynamic threshold |
| Momentum opposing | +2 | Momentum score opposes trade direction |
| ATR overextension | +1 | Price extended beyond ATR limit |
| Deep exhaustion | +2 | Deep K + big move compound |
| No momentum state | +1 | No confirmed momentum |
| ADX slope declining | +1 | Trend decelerating |
| StochRSI limited runway | +1 | Limited directional runway |

### Risk Reduction Bonuses

| Factor | Points | Description |
|--------|--------|-------------|
| Strong trend (ADX ≥ 35) | -1 | Confirmed strong trend energy |
| 4H trend aligned | -1 | HTF confirms direction |
| Momentum confirming | -1 | Momentum supports direction |
| ADX slope positive (≥ 0.5) | -1 | Trend accelerating |

## Score → Position Map

| Risk Score | Multiplier | Behavior |
|------------|------------|----------|
| 0 | 1.00x | Full position |
| 1 | 0.75x | Minor risk reduction |
| 2 | 0.50x | Moderate risk |
| 3 | 0.35x | Elevated risk (probe) |
| ≥ 4 | REJECT | Hard block |

## Example: SOL (ADX=38.2, K=4, SHORT)

**Old system**: DEEP_EXHAUSTION hard block → 0 trades  
**New system**:
- Base: +2 (deep exhaustion)
- Reduction: -1 (ADX ≥ 35)
- Reduction: -1 (4H bearish = aligned with SHORT)
- Net score: 0 → 1.00x position ✅

## Gates Converted

1. `DEEP_EXHAUSTION_COMPOUND` → Risk score contributor
2. `STOCHRSI_RUNWAY` → Dynamic thresholds + risk scoring

## Gates Remaining as Hard Blocks

1. `EARLY_TIER_0` at K < 1 (absolute floor)
2. Momentum opposing > 50 (extreme)
3. Overextension ATR > 3.0x (extreme)

---

# Dynamic Entry Window

## Overview

Makes StochRSI K thresholds adaptive based on ADX slope, reflecting that oscillators behave differently in trending vs ranging markets.

## Threshold Adaptation

| ADX Slope | Tier 0 Oversold | Deep Exhaustion SHORT | Runway SHORT |
|-----------|----------------|----------------------|--------------|
| ≥ 0.6 (strong) | K < 1 | K < 8 | K > 15 |
| ≥ 0.3 (moderate) | K < 2 | K < 12 | K > 22 |
| < 0.3 (default) | K < 3 | K < 15 | K > 30 |

**Requires**: ADX ≥ 30 for dynamic thresholds to activate.

## Rationale

In strong downtrends (ADX slope > 0.6):
- K naturally stays 0-20
- K=4 is NOT "oversold" — it's trend confirmation
- Blocking SHORTs at K<15 misses continuation entries

## Changelog

### v1.0 (2026-03-07)
- Initial implementation of risk score scaling
- Converted DEEP_EXHAUSTION_COMPOUND from hard block to risk scoring
- Added dynamic entry window for adaptive oscillator thresholds
- Applied to EARLY_TIER_0, DEEP_EXHAUSTION, and STOCHRSI_RUNWAY gates
