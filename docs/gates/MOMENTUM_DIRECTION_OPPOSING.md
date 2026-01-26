# HARD GATE: Momentum Direction Opposing

## Overview

This gate prevents trades where the smart momentum score indicates directional force opposing the intended trade direction. It is an asymmetric directional filter that protects against entering trades during active counter-momentum.

**Gate ID:** `MOMENTUM_DIRECTION_OPPOSING`  
**Type:** Hard Gate (blocks signal generation)  
**Location:** `supabase/functions/strategy-analyzer/index.ts`  
**Phase:** Early filtering (before quality scoring)

---

## Core Principle

> "Never enter a LONG when momentum is actively bearish, or a SHORT when momentum is actively bullish - unless trend strength is exceptional."

This gate enforces **directional symmetry** between the derived trade direction and the current momentum flow. Unlike the "Momentum Score Too Low" gate which checks magnitude, this gate checks **polarity**.

---

## Architecture Notes

### Phase 1 vs Phase 2 Relationship
- **Phase 1** (Momentum Score Polarity): Checks `momentumScore` from smart momentum
- **Phase 2** (MACD Direction): Uses MACD histogram for secondary validation

**CRITICAL:** Phase 2 is **subordinate** to Phase 1. If Phase 1 determines momentum is in the neutral zone (-10 to +10), Phase 2 is SKIPPED entirely. This prevents double-penalizing neutral momentum scenarios.

### Trend Source Clarification
`regimeTrendDirection` is sourced from `masterRegime.trendDirection`, which represents the **1h structural trend bias** (not momentum-derived or raw timeframe trends). This ensures the Early Trend Detection exception uses structural context, not momentum, to avoid circular logic.

---

## Thresholds (from constants.ts)

```typescript
MOMENTUM_DIRECTION_ALIGNMENT = {
  ENABLED: true,
  
  // Neutral zone: -10 to +10
  NEUTRAL_MIN: -10,
  NEUTRAL_MAX: 10,
  
  // Strong opposite thresholds (adjusted by momentum state)
  STRONG_OPPOSITE_LONG: -20,   // Block LONG if momentum < -20
  STRONG_OPPOSITE_SHORT: 20,   // Block SHORT if momentum > +20
  
  // Momentum state influence (±5 threshold adjustment)
  CONFIRMED_STATE_ADJUSTMENT: -5,  // Tighter thresholds for confirmed momentum
  MIXED_STATE_ADJUSTMENT: 5,       // Looser thresholds for mixed momentum
  
  // ADX-aware behavior (UNIFIED: aligned with ADX_THRESHOLDS.EXCEPTIONAL)
  ALLOW_NEUTRAL_ABOVE_ADX: 35,     // Strong ADX allows neutral momentum
  
  // Phase 2 subordination
  SKIP_PHASE2_FOR_NEUTRAL: true,   // Skip MACD check if Phase 1 is neutral
  
  // Normalized weak MACD check (ATR-based, not absolute)
  WEAK_MACD_ATR_MULTIPLIER: 0.0001  // |MACD| < ATR * 0.0001 = weak
}

ADX_THRESHOLDS = {
  EXCEPTIONAL: 35,  // Override for very strong trends (unified with ALLOW_NEUTRAL_ABOVE_ADX)
}
```

---

## Pseudo Code

```text
// ============= MOMENTUM DIRECTION OPPOSING GATE =============
// INPUT: derivedDirection (long/short), momentumScore (-100 to +100), 
//        adx, regimeTrendDirection (1h structural trend), macdHistogram, momentumState

FUNCTION checkMomentumDirectionGate(derivedDirection, momentumScore, adx, regimeTrendDirection, macdHistogram, momentumState):
    
    // ===== STEP 1: DEFINE ZONES =====
    isNeutralMomentum = (momentumScore >= -10 AND momentumScore <= 10)
    isStrongADX = (adx >= 35)  // UNIFIED: aligned with ADX_THRESHOLDS.EXCEPTIONAL
    
    // ===== STEP 1B: MOMENTUM STATE INFLUENCE (NEW) =====
    // Adjust thresholds based on momentum state quality
    strongOppositeLongThreshold = -20
    strongOppositeShortThreshold = +20
    
    IF momentumState == "confirmed":
        // Tighter thresholds (make bypass harder)
        strongOppositeLongThreshold = -25   // -20 + (-5)
        strongOppositeShortThreshold = +15  // +20 - 5
    ELSE IF momentumState == "mixed":
        // Looser thresholds (allow more flexibility)
        strongOppositeLongThreshold = -15   // -20 + 5
        strongOppositeShortThreshold = +25  // +20 + 5
    
    // Store neutral flag for Phase 2 subordination
    phase1NeutralMomentum = isNeutralMomentum
    
    // ===== STEP 2: CHECK DIRECTION AGREEMENT =====
    // NOTE: regimeTrendDirection is from masterRegime.trendDirection (1h STRUCTURAL bias)
    trendDirectionAgrees = (
        (derivedDirection == 'long' AND regimeTrendDirection == 'bullish') OR
        (derivedDirection == 'short' AND regimeTrendDirection == 'bearish')
    )
    
    momentumDirectionMismatch = FALSE
    earlyTrendBypassApplied = FALSE
    earlyTrendPositionMultiplier = 1.0
    
    // ===== STEP 3: DIRECTION-SPECIFIC CHECKS =====
    
    IF derivedDirection == 'long':
        
        // CASE A: Strong opposing momentum (using state-adjusted threshold)
        IF momentumScore < strongOppositeLongThreshold:
            
            IF trendDirectionAgrees:
                // EARLY TREND EXCEPTION: 1h bullish allows lagging momentum
                IF momentumScore >= -30:
                    earlyTrendBypassApplied = TRUE
                    earlyTrendPositionMultiplier = 0.70  // Mild lag
                ELSE IF momentumScore >= -50:
                    earlyTrendBypassApplied = TRUE
                    earlyTrendPositionMultiplier = 0.50  // Significant lag
                ELSE:
                    // Below -50 is too extreme - block even with trend agreement
                    momentumDirectionMismatch = TRUE
                    reason = "LONG blocked: momentum < -50 (too extreme even with bullish trend)"
            ELSE:
                momentumDirectionMismatch = TRUE
                reason = "LONG blocked: momentum < -20"
        
        // CASE B: Weak ADX with mild negative momentum
        ELSE IF NOT isStrongADX AND NOT isNeutralMomentum AND momentumScore < 0:
            IF momentumScore < NEUTRAL_MIN (-10):
                IF trendDirectionAgrees:
                    earlyTrendBypassApplied = TRUE
                    earlyTrendPositionMultiplier = 0.70
                ELSE:
                    momentumDirectionMismatch = TRUE
                    reason = "LONG blocked (weak ADX): momentum negative below neutral zone"
    
    ELSE IF derivedDirection == 'short':
        
        // CASE A: Strong opposing momentum (score > +20)
        IF momentumScore > STRONG_OPPOSITE_SHORT (+20):
            
            IF trendDirectionAgrees:
                // EARLY TREND EXCEPTION: 1h bearish allows lagging momentum
                IF momentumScore <= 30:
                    earlyTrendBypassApplied = TRUE
                    earlyTrendPositionMultiplier = 0.70  // Mild lag
                ELSE IF momentumScore <= 50:
                    earlyTrendBypassApplied = TRUE
                    earlyTrendPositionMultiplier = 0.50  // Significant lag
                ELSE:
                    // Above +50 is too extreme - block even with trend agreement
                    momentumDirectionMismatch = TRUE
                    reason = "SHORT blocked: momentum > +50 (too extreme even with bearish trend)"
            ELSE:
                momentumDirectionMismatch = TRUE
                reason = "SHORT blocked: momentum > +20"
        
        // CASE B: Weak ADX with mild positive momentum
        ELSE IF NOT isStrongADX AND NOT isNeutralMomentum AND momentumScore > 0:
            IF momentumScore > NEUTRAL_MAX (+10):
                IF trendDirectionAgrees:
                    earlyTrendBypassApplied = TRUE
                    earlyTrendPositionMultiplier = 0.70
                ELSE:
                    momentumDirectionMismatch = TRUE
                    reason = "SHORT blocked (weak ADX): momentum positive above neutral zone"
    
    // ===== STEP 4: APPLY BYPASS IF EARLY TREND DETECTED =====
    IF earlyTrendBypassApplied:
        store earlyTrendPositionMultiplier for position sizing
        LOG "EARLY TREND ENTRY: {direction} allowed despite opposing momentum"
        RETURN PASS
    
    // ===== STEP 5: REJECT IF MISMATCH =====
    IF momentumDirectionMismatch:
        REJECT with "MOMENTUM_DIRECTION_OPPOSING"
        LOG gate, derivedDirection, momentumScore, momentumDirection, adx, thresholds
        RETURN BLOCKED
    
    RETURN PASS

// ============= PHASE 2: SECONDARY CHECK (SUBORDINATE TO PHASE 1) =============
// Uses MACD histogram direction for additional validation
// CRITICAL: This phase is SKIPPED if Phase 1 determined momentum is in neutral zone

FUNCTION checkMomentumDirectionalSymmetry(derivedDirection, momentum, adx, atr, phase1NeutralMomentum):
    
    // ===== SUBORDINATION CHECK (ARCHITECTURE FIX) =====
    // If Phase 1 already classified momentum as neutral, skip Phase 2 entirely
    // This prevents double-penalizing neutral momentum scenarios
    IF SKIP_PHASE2_FOR_NEUTRAL AND phase1NeutralMomentum:
        LOG "Phase 2 MACD check skipped: momentum in neutral zone (Phase 1 passed)"
        RETURN PASS
    
    momentumDirection = momentum.direction OR derive_from_macd(momentum.macdHistogram)
    macdHistogramValue = momentum.macdHistogram OR 0
    
    // Determine effective direction from MACD histogram
    effectiveMomentumDirection = momentumDirection OR
        (macdHistogramValue > 0 ? "bullish" : macdHistogramValue < 0 ? "bearish" : NULL)
    
    // Check if momentum direction opposes trade direction
    momentumOpposesDirection = (
        (derivedDirection == "long" AND effectiveMomentumDirection == "bearish") OR
        (derivedDirection == "short" AND effectiveMomentumDirection == "bullish")
    )
    
    IF momentumOpposesDirection AND effectiveMomentumDirection != NULL:
        
        // ===== EXCEPTION 1: Very weak momentum (NORMALIZED with ATR) =====
        // ARCHITECTURE FIX: Use ATR-normalized threshold instead of absolute 0.0001
        // This ensures consistent behavior across high-priced (BTC) and low-priced assets
        macdHistogramAbs = ABS(macdHistogramValue)
        weakMomentumThreshold = (atr > 0) ? (atr * 0.0001) : 0.0001
        isWeakMomentum = (macdHistogramAbs < weakMomentumThreshold)
        
        // ===== EXCEPTION 2: Exceptional ADX overrides (UNIFIED: 35) =====
        allowMomentumOverride = isWeakMomentum OR (adx >= 35)
        
        IF NOT allowMomentumOverride:
            REJECT with "MOMENTUM_DIRECTION_OPPOSING" (Phase 2)
            LOG phase, derivedDirection, effectiveMomentumDirection, macdHistogram, atr, threshold, adx
            RETURN BLOCKED
        
```

---

## Decision Matrix

| Trade Direction | Momentum Score | ADX | 1h Trend | Result |
|-----------------|----------------|-----|----------|--------|
| LONG | < -50 | any | bullish | **BLOCK** (too extreme) |
| LONG | -50 to -30 | any | bullish | PASS (50% position) |
| LONG | -30 to -20 | any | bullish | PASS (70% position) |
| LONG | < -20 | any | ≠ bullish | **BLOCK** |
| LONG | -20 to -10 | < 40 | ≠ bullish | **BLOCK** |
| LONG | -10 to +10 | any | any | PASS (neutral zone) |
| LONG | > 0 | any | any | PASS (aligned) |
| SHORT | > +50 | any | bearish | **BLOCK** (too extreme) |
| SHORT | +30 to +50 | any | bearish | PASS (50% position) |
| SHORT | +20 to +30 | any | bearish | PASS (70% position) |
| SHORT | > +20 | any | ≠ bearish | **BLOCK** |
| SHORT | +10 to +20 | < 40 | ≠ bearish | **BLOCK** |
| SHORT | -10 to +10 | any | any | PASS (neutral zone) |
| SHORT | < 0 | any | any | PASS (aligned) |

---

## Exceptions

### Exception 1: Early Trend Detection
- **Trigger:** 1h trend direction agrees with trade direction
- **Effect:** Allows entry with graduated position sizing (50%-70%)
- **Limit:** Still blocks if momentum is extremely opposite (< -50 for LONG, > +50 for SHORT)

### Exception 2: Very Weak Momentum (MACD-based)
- **Trigger:** |MACD histogram| < 0.0001
- **Effect:** Allows entry (momentum too weak to matter)
- **Rationale:** Near-zero MACD means no directional force

### Exception 3: Exceptional ADX Override
- **Trigger:** ADX >= 35
- **Effect:** Allows entry despite opposing momentum
- **Rationale:** Very strong trends override momentum direction

---

## Position Size Multipliers

| Scenario | Multiplier |
|----------|------------|
| Aligned momentum | 1.00 (100%) |
| Neutral momentum | 1.00 (100%) |
| Early trend entry (mild lag: ±20-30) | 0.70 (70%) |
| Early trend entry (significant lag: ±30-50) | 0.50 (50%) |

---

## Logged Data (filters_status)

```json
{
  "gate": "MOMENTUM_DIRECTION_OPPOSING",
  "blockReasonCode": "MOMENTUM_DIRECTION_MISMATCH",
  "primaryGateFailed": "long_negative_momentum" | "short_positive_momentum",
  "derivedDirection": "long" | "short",
  "momentumScore": -25,
  "momentumDirection": "bearish",
  "momentumState": "confirmed" | "building" | "mixed" | "none",
  "adx": "28.5",
  "isStrongADX": false,
  "isNeutralMomentum": false,
  "thresholds": {
    "strongOppositeLong": -20,
    "strongOppositeShort": 20,
    "neutralMin": -10,
    "neutralMax": 10,
    "allowNeutralAboveADX": 40
  }
}
```

---

## UI Display (SignalRejectionReasons.tsx)

The `MomentumDirectionOpposingDisplay` component shows:
1. Trade direction vs opposing momentum direction
2. Current momentum score and derived direction
3. ADX value and whether exceptional threshold is met
4. MACD histogram value (for weak momentum check)
5. Bypass conditions status

---

## Interaction with Other Gates

| Gate | Relationship |
|------|--------------|
| Momentum Score Too Low | Complementary - this gate checks polarity, that gate checks magnitude |
| ADX Minimum | Must pass first - low ADX means stricter momentum requirements |
| HTF Alignment | Can conflict - HTF bullish but momentum bearish triggers this gate |
| Early Trend Detection | Exception pathway - bypasses with position reduction |

---

## Common Rejection Scenarios

1. **LONG during bearish impulse:** Momentum score -35, 1h trend neutral → Blocked
2. **SHORT during bullish breakout:** Momentum score +28, ADX 22 → Blocked
3. **Weak ADX counter-trend:** LONG with momentum -15, ADX 25 → Blocked (not in neutral zone, weak ADX)

---

## Expected Impact

- Prevents long entries during bearish momentum acceleration
- Prevents short entries during bullish impulse
- Improves signal-to-noise ratio
- Reduces whipsaw entries in transitional markets
