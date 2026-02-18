# ADX_TOO_LOW Gate v1.1

## Overview

The **ADX Too Low** gate enforces a market energy floor, ensuring trades only occur when sufficient trend strength exists. This is a **hard gate** that answers one question only: *"Is there enough market energy to trade at all?"*

## Design Philosophy

**Role Discipline**: This gate does NOT handle:
- HTF alignment (→ `HTF_NOT_ALIGNED` gate)
- Direction derivation (→ `deriveTradeDirection`)
- Mean reversion entries (→ Mean Reversion Entry Router)
- Neutral HTF fallbacks (→ `HTF_NOT_ALIGNED` gate)

**Single Responsibility**: Gate market energy, not trend validity.

---

## Gate Logic (Decision Tree)

```
START
  │
  ├─ ADX < 18? ────────────────────────────── YES → HARD BLOCK (Tier 0)
  │                                                  No exceptions. Structural no-trend.
  │
  ├─ ADX 18–22 (Transitional Zone)?
  │   │
  │   ├─ Squeeze Expansion Exception?
  │   │   ├─ BB Width < 20th percentile (compressed)
  │   │   ├─ %B at band edge (≤20% or ≥80%)
  │   │   ├─ Momentum state = 'building' or 'confirmed'
  │   │   ├─ ADX Slope ≥ +0.05 (expanding)
  │   │   └─ No MACD divergence ──────────── YES → PASS (0.65x size)
  │   │
  │   ├─ Early Ignition Exception?
  │   │   ├─ Regime == EARLY_TREND
  │   │   ├─ ADX Slope > 0 (rising)
  │   │   ├─ 4H Confidence ≥ 55%
  │   │   └─ 1H aligned with 4H ─────────── YES → PASS (0.70x size)
  │   │
  │   ├─ Mean Reversion Exception?
  │   │   ├─ earlyMeanReversionSignal.detected
  │   │   └─ earlyMeanReversionSignal.allowed ── YES → PASS (0.25x size)
  │   │   NOTE: Tier 0.25 direction derivation passes ADX 18-22 via
  │   │         ADX_TRANSITIONAL_BYPASS (regime gate deferred to ADX gate)
  │   │
  │   └─ No exception met? ───────────────── BLOCK
  │
  ├─ TRANSITION_EXPANSION Shadow Check (ADX 16-25)?
  │   │   NOTE: This runs BEFORE the transitional zone but is SHADOW MODE ONLY
  │   │   It logs what WOULD pass but does NOT allow trades yet.
  │   │
  │   ├─ Regime == BREAKOUT_SETUP
  │   ├─ ADX BETWEEN 16 AND 25
  │   ├─ ADX Slope ≥ +0.5 (strongly rising)
  │   ├─ |priceMove4h| ≥ 1.5%
  │   ├─ Momentum direction aligned with derived direction
  │   └─ Direction matches price move ─────── YES → SHADOW LOG (0.30x size)
  │                                            Does NOT allow trade until shadow mode disabled
  │
  ├─ ADX ≥ Adaptive Threshold?
  │   │
  │   │   Threshold by Regime:
  │   │   ├─ RANGE: 22
  │   │   ├─ EARLY_TREND: 20
  │   │   ├─ STRONG_TREND: 18
  │   │   └─ EXHAUSTION: 20
  │   │
  │   └─ ADX ≥ threshold ────────────────── YES → PASS (1.0x size)
  │
  └─ DEFAULT ────────────────────────────── BLOCK
```

---

## Position Sizing Table

| Condition | ADX Range | Requirements | Size Multiplier |
|-----------|-----------|--------------|-----------------|
| Hard Floor | < 18 | None (absolute block) | 0.00x (BLOCKED) |
| Squeeze Expansion | 18–22 | BB compressed, band edge, momentum building, slope ≥ +0.05, no divergence | 0.65x |
| Early Ignition | 18–22 | EARLY_TREND regime, slope > 0, 4H ≥ 55%, 1H aligned | 0.70x |
| Mean Reversion | 18–22 | earlyMeanReversionSignal detected + allowed | 0.25x |
| Adaptive Pass (RANGE) | ≥ 22 | Regime = RANGE | 1.00x |
| Adaptive Pass (EARLY_TREND) | ≥ 20 | Regime = EARLY_TREND | 1.00x |
| Adaptive Pass (STRONG_TREND) | ≥ 18 | Regime = STRONG_TREND | 1.00x |
| Adaptive Pass (EXHAUSTION) | ≥ 20 | Regime = EXHAUSTION | 1.00x |
| **Transition Expansion** (SHADOW) | 16–25 | BREAKOUT_SETUP regime, slope ≥ 0.5, priceMove ≥ 1.5%, momentum aligned | 0.30x *(shadow only)* |

---

## Exception Details

### Squeeze Expansion (Tier 2)

**Purpose**: Allow entries during Bollinger Band compression breakouts where ADX hasn't yet responded to the expansion.

**Requirements** (ALL must be true):
```typescript
bbWidth < bbWidth20thPercentile    // Compressed bands
AND (%B <= 0.20 OR %B >= 0.80)     // At band edge
AND momentumState IN ['building', 'confirmed']
AND adxSlope >= 0.05               // ADX expanding (not flat)
AND !hasMACDDivergence             // No divergence
```

**Rationale**: Squeezes often precede explosive moves. ADX lags band expansion by 2-4 bars. The slope requirement ensures this isn't a fake squeeze that never expands.

---

### Early Ignition (Tier 3)

**Purpose**: Allow entries in emerging trends before ADX fully registers the move.

**Requirements** (ALL must be true):
```typescript
regime == 'EARLY_TREND'
AND adxSlope > 0                   // Rising (not flat or falling)
AND confidence4h >= 55%            // HTF structure emerging
AND trend1h == trend4h             // Timeframe alignment
```

**Rationale**: EARLY_TREND regime indicates structural shift detected. Rising ADX slope confirms energy is building, not fading.

---

## What This Gate Does NOT Handle

| Logic | Moved To | Rationale |
|-------|----------|-----------|
| 1H Confidence Fallback | `deriveTradeDirection` | Direction logic, not energy gating |
| Neutral 4H Handling | `HTF_NOT_ALIGNED` gate | HTF structure logic |
| Mean Reversion (K < 5, > 95) | Mean Reversion Router | Different strategy class; edge is absence of trend |
| Quiet Trend Bypass (BTC/ETH) | REMOVED | Too permissive; admitted range chop |
| Low ADX Trend Exception (12–25) | REMOVED | Trend validation, not energy gating |

---

## Rejection Log Fields

When a signal is blocked by this gate:

```typescript
{
  gate: "ADX_TOO_LOW",
  adx: number,
  adxSlope: number,
  regime: string,
  adaptiveThreshold: number,
  
  // Squeeze check details
  squeezeCheck: {
    bbCompressed: boolean,
    atBandEdge: boolean,
    percentB: number,
    momentumState: string,
    slopeOk: boolean,
    hasDivergence: boolean,
    wouldPass: boolean,
  },
  
  // Early ignition check details  
  earlyIgnitionCheck: {
    isEarlyTrendRegime: boolean,
    slopeRising: boolean,
    htfConfidence: number,
    is1hAligned: boolean,
    wouldPass: boolean,
  },
  
  // Bypass hints for UI
  bypassHints: {
    needsADX: number,           // ADX needed to pass adaptive threshold
    needsSqueeze: string[],     // Missing squeeze requirements
    needsIgnition: string[],    // Missing ignition requirements
  }
}
```

---

## UI Display

The `HardGateADXDisplay` component should show:

1. **Header**: Gate name with current ADX and adaptive threshold
2. **ADX Gauge**: Visual representation of ADX vs threshold
3. **Exception Checklist**: Squeeze and Ignition requirements with pass/fail status
4. **What Would Pass**: Actionable hints (e.g., "Needs ADX ≥ 22 for RANGE regime")
5. **Why Blocked**: Clear explanation text

---

## Related Gates

- `HTF_NOT_ALIGNED`: Handles HTF structure and confidence bypasses
- `NO_MOMENTUM_CONFIRMATION`: Requires momentum state presence
- `MOVE_EXHAUSTED`: Blocks late entries after significant expansion

---

## Changelog

### v1.2 (2026-02-18)
- **ADDED**: TRANSITION_EXPANSION bypass tier (SHADOW MODE ONLY)
  - Captures BREAKOUT_SETUP → TREND_EXPANSION transition window
  - ADX 16-25 with slope ≥ 0.5, priceMove ≥ 1.5%, momentum aligned
  - Position size: 0.30x (max 0.40x with HTF support)
  - Shadow mode: logs to `shadow_mode_signals` table for 3-5 day observation
  - Set `ADX_GATE_V1_1.TRANSITION_EXPANSION.SHADOW_MODE = false` to enable live

### v1.1 (2025-01-27)
- **BREAKING**: Reduced exceptions from 6 to 2 (Squeeze, Early Ignition)
- **REMOVED**: 1H Fallback (moved to direction derivation)
- **REMOVED**: Neutral 4H Handling (moved to HTF_NOT_ALIGNED)
- **REMOVED**: Mean Reversion Override (moved to dedicated router)
- **REMOVED**: Quiet Trend Bypass (too permissive)
- **REMOVED**: Low ADX Trend Exception (wrong responsibility)
- **ADDED**: ADX slope requirement (≥ +0.05) for Squeeze Expansion
- **ADDED**: ADX slope requirement (> 0) for Early Ignition
- **FIXED**: Adaptive thresholds simplified (RANGE=22, EARLY_TREND=20, etc.)
- Role discipline enforced: gate answers only "Is there market energy?"

### v1.0 (Previous)
- Initial implementation with 6 exception tiers
- Over-permissive; behaved as meta-router rather than hard gate
