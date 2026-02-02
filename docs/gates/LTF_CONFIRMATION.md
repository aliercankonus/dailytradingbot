# LTF Confirmation Gate

## Overview

The **LTF Confirmation Gate** prevents continuation entries when the Higher Timeframe (4H) shows a strong directional trend but the Lower Timeframes (1H and 30M) show neutrality or exhaustion. This addresses the "trend continuation misclassification" problem where entries are taken at structurally weak points.

## Problem Solved

A bearish 4H trend + high ADX only tells you:
> "The prior move was strong"

It does NOT say:
> "Continuation is currently valid"

Continuation requires LTF participation. When 1H and 30M are both neutral:
- Short covering is likely
- Range expansion UP is probable
- Failed breakdowns are common

## Gate Logic

```
START
  │
  ├─ Is 4H strongly directional?
  │   ├─ Confidence ≥ 55%
  │   └─ ADX ≥ 25
  │
  ├─ NO → Skip gate, full position
  │
  ├─ YES → Check LTF alignment
  │   │
  │   ├─ 1H + 30M both aligned → FULL SIZE (1.0x)
  │   │
  │   ├─ 1H aligned OR 30M aligned → PARTIAL (0.70x)
  │   │
  │   ├─ Both 1H and 30M neutral → PROBE ONLY (0.35x)
  │   │
  │   └─ 1H OR 30M counter-aligned → BLOCK
```

## Position Sizing Table

| LTF Alignment | Position Size | Action |
|--------------|---------------|--------|
| Both aligned | 100% | Normal entry |
| One aligned, one neutral | 70% | Reduced position |
| Both neutral | 35% | Probe only |
| Either counter-aligned | 0% | Block entry |

## Configuration

```typescript
LTF_CONFIRMATION_GATE = {
  ENABLED: true,
  MIN_4H_CONFIDENCE: 55,      // 4H must be strongly directional
  MIN_ADX_FOR_CHECK: 25,      // Only apply when trend strength is high
  STRICT_ADX_THRESHOLD: 45,   // Above this, require stricter alignment
  SIZING: {
    FULL_ALIGNMENT: 1.0,      // Both LTF aligned
    PARTIAL_ALIGNMENT: 0.70,  // One LTF aligned
    NO_ALIGNMENT: 0.35,       // Both neutral = probe only
    COUNTER_ALIGNMENT_BLOCK: true, // Block if LTF opposes
  }
}
```

## Rejection Log Fields

```typescript
{
  gate: "LTF_COUNTER_ALIGNED" | "LTF_BOTH_NEUTRAL",
  derivedDirection: "long" | "short",
  tf4hDir: string,
  tf1hDir: string,
  tf30mDir: string,
  conf4h: number,
  adx: number,
  ltfConfirmationRequired: true,
  wouldPassWith: string  // Hint showing what alignment is needed
}
```

## Related Gates

- `NEAR_EXTREME_PROTECTION_GATE`: Blocks entries near 24h lows/highs
- `HTF_NOT_ALIGNED`: Higher-level HTF alignment check

## Changelog

### v1.0 (2025-02-02)
- Initial implementation
- LTF neutrality detection with graduated sizing
- Counter-alignment blocking
- Integration with position sizing pipeline
