# MICRO_TREND Momentum Confirmation Gate

## Purpose

Prevents low-conviction "probe trades" that historically result in break-even or small losses when using the MICRO_TREND bypass without proper momentum alignment.

## Root Cause Analysis

Forensic analysis of BE/loss trades identified a common pattern:
- Both trades used `MICRO_TREND` bypass
- Both had `momentum_state = 'mixed'`
- Both had `momentum_confirms = false`
- Result: Low-conviction entries with insufficient momentum to sustain the move

## Gate Logic

**Note**: MICRO_TREND entries have a base position size of 60% (`MICRO_TREND_PARAMS.MAX_POSITION_SIZE_PERCENT`). The momentum confirmation gate applies an additional multiplier on top of this base.

### Sizing Tiers

| Condition | Tier Multiplier | Final Size* | Rationale |
|-----------|-----------------|-------------|-----------|
| Momentum confirmed/building + ADX rising | 100% | 60% | Full confirmation - high probability |
| Momentum confirmed/building but ADX not rising | 55% | 33% | Moderate confirmation - trend may be stalling |
| Momentum partially aligned (confirms=true, state=mixed/none) | 55% | 33% | Partial confirmation - probe cautiously |
| Momentum mixed/none AND confirms=false | **BLOCKED** | 0% | Low probability - prevents BE trades |

\* Final size = Base 60% × Tier Multiplier

### Configuration (`MICRO_TREND_MOMENTUM_SAFETY`)

```typescript
{
  REQUIRE_MOMENTUM_CONFIRMATION: true,
  CONFIRMED_MOMENTUM_STATES: ['confirmed', 'building'],
  PARTIAL_ALIGNMENT_MULTIPLIER: 0.55,  // 55% for partial
  BLOCK_ON_MIXED_UNCONFIRMED: true,     // Hard block when both unconfirmed
  FULL_CONFIRMATION_MULTIPLIER: 1.0,
  MODERATE_CONFIRMATION_MULTIPLIER: 0.55,
  WEAK_CONFIRMATION_MULTIPLIER: 0.35,
}
```

## Decision Flow

```
                    ┌─────────────────┐
                    │  MICRO_TREND    │
                    │   Detected?     │
                    └────────┬────────┘
                             │ Yes
                    ┌────────▼────────┐
                    │ momentum_state  │
                    │ = confirmed OR  │
                    │   building?     │
                    └────────┬────────┘
                        │         │
                   Yes  │         │ No
                        ▼         ▼
               ┌──────────────┐  ┌──────────────┐
               │ ADX Rising?  │  │momentum_confirms│
               └──────┬───────┘  │   = true?      │
                  │       │      └───────┬────────┘
              Yes │       │ No       │         │
                  ▼       ▼      Yes │         │ No
            ┌────────┐ ┌────────┐    ▼         ▼
            │ 100%   │ │  55%   │ ┌────────┐ ┌────────┐
            │ SIZE   │ │  SIZE  │ │  55%   │ │ BLOCK  │
            └────────┘ └────────┘ │  SIZE  │ │ 0%     │
                                  └────────┘ └────────┘
```

## Logging

When enabled (`LOG_SIZING_TIERS: true`), logs include:
- Tier label: FULL, MODERATE, PARTIAL, or BLOCKED
- Momentum state and confirms values
- ADX rising status
- Resulting position size percentage

Example:
```
[RISK] MICRO-TREND momentum tier: PARTIAL (state=mixed, confirms=true, adxRising=false) → 33% size (base 60% × 55% tier)
[RISK] MICRO-TREND momentum tier: FULL (state=confirmed, confirms=true, adxRising=true) → 60% size (base 60% × 100% tier)
```

## Related Gates

- `MICRO_TREND_PARAMS`: Base micro-trend detection requirements
- `LTF_CONFIRMATION_GATE`: Lower timeframe alignment
- `MOMENTUM_SLOPE_GATE`: Priority 1 momentum protection
