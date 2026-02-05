
# Trading Bot Development Plan

## Recent Changes

### ✅ Capitulation Bounce Probe v1.1 (2025-02-05)
- **Explicit Override Mechanism**: Uses `forcedDirectionOverride` flag instead of direct `directionResult` mutation
- **HTF Structure Guard**: Added `REQUIRE_HTF_STRUCTURE_STABLE` - blocks if price made new 4H low within last 2 candles
- **Volatility Instrumentation**: Logs which sub-condition (ATR slope vs BB width) validated the entry
- **Partial TP Logic**: 50% position close at 1.0% profit to capture fast impulse + stall pattern
- **Regime Tagging**: Explicit `REGIME_TAG: 'TRANSITION_CAPITULATION'` for analytics

### ✅ Capitulation Bounce Probe (2025-02-05)
- Added `CAPITULATION_BOUNCE_PROBE` config to constants.ts
- New micro-regime for post-capitulation balance zone entries
- Conditions: K ≤ 1, drop ≥ 8%, momentum ±5 (collapsed), ADX ≥ 35 slope ≤ 0
- Position size: 15-20% (probe), LONG only (bounce capture)
- Separate from MR (which requires decaying momentum) and continuation (which requires strong momentum)
- Addresses the gap where neither logic fires during capitulation → balance transition

### ✅ Contextual TP Expansion (2025-02-05)
- Added `CONTEXTUAL_TP_EXPANSION` config to constants.ts
- Implements +30% wider TP for Counter-Trend Exhaustion and Strong Trend Override entries
- Implements +20% wider TP for Squeeze Breakout entries
- Philosophy: "Be selective on entry, patient on exit" - increases PnL by expectancy, not leverage
- Applied in execute-trade after SL validation, before R:R check

---

# Counter-Trend Admission Layer Refactor

## Status: ✅ COMPLETE (2025-02-05)

All safety mechanisms are now implemented and deployed.

---

## Summary

Refactor the existing `mean-reversion.ts` module into a unified **Counter-Trend Admission Controller** - the single authority for allowing opposite-direction (reversal) entries. This eliminates the architectural risk of adding a standalone EXHAUSTION_GATE while preserving the original design intent.

---

## Implementation Status

### ✅ Phase 1: MR Bypass for MOVE_EXHAUSTED (Complete)
- Direction flip logic when entering MEAN_REVERSION zone
- Mean reversion exception added alongside strong-trend continuation exception
- `evaluateCounterTrendAdmission()` exported and integrated

### ✅ Phase 2: Momentum Tolerance for MR Probes (Complete)
- Relaxed opposing threshold (±25 vs standard ±15)
- Extreme opposing threshold (±50) remains as hard block
- Moderate opposition multiplier (0.20x)

### ✅ Phase 3: Safety Mechanisms (Complete - 2025-02-05)

| Item | Status | Implementation |
|------|--------|----------------|
| Delta decay enforcement | ✅ | `REQUIRE_IMPROVING_DELTA: true` + enforcement in LTF gate |
| ADX persistence gating | ✅ | `adxSlopePersistence >= 2` required for MR tolerance |
| Size safety invariant | ✅ | `Math.min(baseMrProbeMultiplier, mrMomentumMultiplier)` |
| New rejection reason | ✅ | `MR_SAFETY_CHECK_FAILED` gate type added |

---

## Configuration (constants.ts)

```typescript
COUNTER_TREND_ADMISSION: {
  ENABLED: true,
  
  // ADX Exhaustion Requirements
  MAX_ADX_FOR_EXHAUSTION: 45,
  MAX_ADX_SLOPE: 0.0,
  MIN_ADX_SLOPE_PERSISTENCE: 2,
  
  // Volatility Contraction Requirements  
  REQUIRE_VOLATILITY_CONTRACTION: true,
  BB_WIDTH_DECLINE_MIN_PERCENT: 5,
  ATR_CHANGE_FLAT_THRESHOLD: 0.5,
  
  // Position Sizing
  PROBE_POSITION_MULTIPLIER: 0.25,
  
  // Momentum Tolerance for MR Probes
  MOMENTUM_TOLERANCE: {
    ENABLED: true,
    RELAXED_OPPOSING_THRESHOLD: 25,
    EXTREME_OPPOSING_THRESHOLD: 50,
    MODERATE_OPPOSITION_MULTIPLIER: 0.20,
    REQUIRE_IMPROVING_DELTA: true,
    IMPROVING_DELTA_THRESHOLD: 0.0,
    ADX_PERSISTENCE_BYPASS_THRESHOLD: 2,
    LOG_TOLERANCE_APPLIED: true,
  },
}
```

---

## Failure Reason Logging

| Code | Meaning |
|------|---------|
| `ADX_STILL_EXPANDING` | ADX slope > 0, trend energy not decaying |
| `ADX_NOT_EXHAUSTED` | ADX >= 45, still in dominant trend |
| `ADX_PERSISTENCE_INSUFFICIENT` | ADX slope not negative for required consecutive candles |
| `MOMENTUM_NOT_DECAYING` | Momentum magnitude not decreasing |
| `VOLATILITY_EXPANDING` | BB width or ATR still increasing |
| `STOCHRSI_STILL_PEGGED` | K stuck at extreme (< 5 or > 95) |
| `MR_SAFETY_CHECK_FAILED` | MR probe blocked by safety checks (ADX persistence, delta) |
| `MR_EXTREME_MOMENTUM_BLOCK` | MR probe blocked by extreme opposing momentum (>±50) |

---

## Decision Flow (Final)

```text
[Direction Derived]
      |
      v
[Is Counter-Trend?] -- NO --> [Normal signal flow]
      |
      YES
      v
[Counter-Trend Admission Layer]
      |
      +-- FAIL --> Block + log failure reason
      |
      +-- PASS --> Generate probe @ 0.25x
              |
              v
      [LTF Confirmation Gate]
              |
              +-- LTF Neutral + Momentum Opposing?
                      |
                      +-- Check MR Tolerance Eligibility
                              |
                              +-- ADX persistence >= 2?
                              +-- Momentum delta improving?
                              |
                              +-- BOTH YES --> Apply relaxed threshold (±25)
                              |                Position = min(0.25x, 0.20x) = 0.20x
                              |
                              +-- EITHER NO --> MR_SAFETY_CHECK_FAILED
```

---

## Files Modified

| File | Changes |
|------|---------|
| `supabase/functions/_shared/mean-reversion.ts` | `evaluateCounterTrendAdmission()` export |
| `supabase/functions/_shared/constants.ts` | `COUNTER_TREND_ADMISSION.MOMENTUM_TOLERANCE` config |
| `supabase/functions/strategy-analyzer/index.ts` | ADX persistence gating, delta enforcement, multiplier stacking, `MR_SAFETY_CHECK_FAILED` gate type |
| `docs/gates/LTF_CONFIRMATION.md` | Documentation for MR tolerance behavior |

---

## Verification

Monitor the Signal Rejection Monitor for:
- `MR_MOMENTUM_TOLERANCE APPLIED` - MR probes passing with relaxed threshold
- `MR_SAFETY_CHECK_FAILED` - MR probes blocked by safety checks
- `MR_EXTREME_MOMENTUM_BLOCK` - MR probes blocked by extreme momentum
