# HARD GATE: LTF Spike Protection (Priority 2)

## Overview

This gate prevents entries at **15m momentum climax candles**. When 15m StochRSI is at extreme levels (K > 95 for bullish spike or K < 5 for bearish spike) AND momentum aligns with the spike direction, this is a climax candle - NOT early exhaustion.

## Core Principle

> "15m StochRSI at 98 with bullish momentum is a SPIKE TOP, not early reversal opportunity"
> "Enter exhaustion reversals, not climax continuations"

## Gate Hierarchy Position

This gate is **Priority 2** - it runs AFTER:
- Momentum Slope Gate (Priority 1)

And BEFORE:
- LTF Confirmation Gate
- Momentum Direction Alignment
- ADX-based exceptions

**ADX does NOT override this gate.**

## Logic

```
IF 15m StochRSI K > 95 AND direction = SHORT
  AND momentum > 0 (aligns with bullish spike)
  AND ADX slope >= 0 (trend still accelerating)
THEN
  HARD BLOCK

IF 15m StochRSI K < 5 AND direction = LONG
  AND momentum < 0 (aligns with bearish spike)
  AND ADX slope >= 0 (trend still accelerating)
THEN
  HARD BLOCK
```

## Configuration

```typescript
LTF_SPIKE_PROTECTION_GATE = {
  ENABLED: true,
  
  // 15m StochRSI thresholds for spike detection
  BLOCK_SHORT_IF_15M_K_ABOVE: 95,
  BLOCK_LONG_IF_15M_K_BELOW: 5,
  
  // Only block if momentum aligns with spike (not valid reversal)
  REQUIRE_MOMENTUM_ALIGNED_WITH_SPIKE: true,
  
  // Only block if ADX slope rising (spike hasn't exhausted)
  REQUIRE_ADX_SLOPE_RISING: true,
  MIN_ADX_SLOPE_FOR_BLOCK: 0,
  
  // Hard block, no reduced position alternative
  ALLOW_REDUCED_POSITION: false,
}
```

## Example

| Metric | Value | Analysis |
|--------|-------|----------|
| Trade Direction | SHORT | - |
| 15m StochRSI K | 98.3 | Extreme bullish spike |
| Momentum Score | +48 | Bullish (aligns with spike) |
| ADX Slope | +0.05 | Rising (trend accelerating) |
| **Result** | BLOCKED | Entering at momentum climax candle |

## Exception: Valid Exhaustion Reversal

When momentum OPPOSES the spike direction, this is a valid exhaustion setup:

| Metric | Value | Analysis |
|--------|-------|----------|
| 15m StochRSI K | 98.3 | Extreme bullish spike |
| Momentum Score | -20 | Bearish (opposes spike) |
| **Result** | ALLOWED | Valid exhaustion reversal |

## Rejection Log Fields

```typescript
{
  gate: "LTF_SPIKE_PROTECTION",
  derivedDirection: "long" | "short",
  stochRsiK15m: number,
  momentumScore: number,
  adxSlope: number,
  adx: number,
  architecture: "Priority 2 gate - no ADX exception"
}
```

## Related Gates

- `MOMENTUM_SLOPE_GATE`: Priority 1, checks momentum acceleration
- `DEEP_STOCHRSI_HARD_GATE`: Tier 0, blocks entries at K < 5 or K > 95 on 4h

## Changelog

### v1.0 (2025-02-02)
- Initial implementation
- Prevents entering at 15m momentum climax candles
- Symmetric protection for both LONG and SHORT directions
