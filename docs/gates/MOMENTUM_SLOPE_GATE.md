# HARD GATE: Momentum Slope Gate (Priority 1)

## Overview

This gate prevents entries when momentum is **accelerating in the opposing direction**.
It addresses the fundamental flaw where ADX strength was used to override directional momentum checks.

## Core Principle

> "ADX answers 'Is there trend strength?' - it does NOT answer 'Should we enter?'"
> "Accelerating opposing momentum = STRONGER block, not weaker"

## Gate Hierarchy Position

This gate is **Priority 1** - it runs BEFORE:
- LTF Spike Protection (Priority 2)
- Momentum Direction Alignment (polarity check)
- LTF Confirmation
- ADX-based exceptions

**ADX does NOT override this gate.** This is the key architectural fix.

## Logic

```
IF opposing momentum score (|score| > 15 in wrong direction)
  AND momentum slope indicates acceleration
    (slope > 0 for bullish acceleration blocking SHORT)
    (slope < 0 for bearish acceleration blocking LONG)
THEN
  HARD BLOCK - no exceptions
```

## Configuration

```typescript
MOMENTUM_SLOPE_GATE = {
  ENABLED: true,
  
  // For SHORT: block if momentum slope > this (bullish acceleration)
  BLOCK_SHORT_IF_SLOPE_ABOVE: 0,
  // For LONG: block if momentum slope < this (bearish acceleration)  
  BLOCK_LONG_IF_SLOPE_BELOW: 0,
  
  // Minimum opposing momentum score to trigger slope check
  MIN_OPPOSING_SCORE_FOR_SLOPE_CHECK: 15,
  
  // ADX does NOT override this gate
  ADX_AMPLIFIES_NOT_OVERRIDES: true,
  
  // Deceleration exception: allow with reduced size
  DECELERATING_MOMENTUM_POSITION_MULTIPLIER: 0.50,
}
```

## Example (BNBUSDT Case)

| Metric | Value | Analysis |
|--------|-------|----------|
| Trade Direction | SHORT | - |
| Momentum Score | +48 | Strongly bullish (opposing) |
| Momentum Slope | +0.05 | Accelerating bullish |
| ADX | 57.7 | Very strong trend |
| **Old Result** | ALLOWED | ADX override bypassed momentum check |
| **New Result** | BLOCKED | Accelerating opposing momentum = hard block |

## Rejection Log Fields

```typescript
{
  gate: "MOMENTUM_SLOPE_GATE",
  derivedDirection: "long" | "short",
  momentumScore: number,
  momentumSlope: number,
  adx: number,
  adxDoesNotOverride: true,
  architecture: "Priority 1 gate - no ADX exception"
}
```

## Related Gates

- `LTF_SPIKE_PROTECTION_GATE`: Priority 2, blocks entries at 15m StochRSI spikes
- `MOMENTUM_DIRECTION_ALIGNMENT`: Priority 4, now respects acceleration check
- `LTF_CONFIRMATION_GATE`: Priority 3, now blocks when LTF neutral + momentum opposing

## Changelog

### v1.0 (2025-02-02)
- Initial implementation
- Prevents ADX from overriding accelerating opposing momentum
- Integration with MOMENTUM_DIRECTION_ALIGNMENT ADX check
