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

## Thresholds (from constants.ts)

```typescript
MOMENTUM_DIRECTION_ALIGNMENT = {
  ENABLED: true,
  
  // Neutral zone: -10 to +10
  NEUTRAL_MIN: -10,
  NEUTRAL_MAX: 10,
  
  // Strong opposite thresholds
  STRONG_OPPOSITE_LONG: -20,   // Block LONG if momentum < -20
  STRONG_OPPOSITE_SHORT: 20,   // Block SHORT if momentum > +20
  
  // ADX-aware behavior
  ALLOW_NEUTRAL_ABOVE_ADX: 40, // Strong ADX allows neutral momentum
}

ADX_THRESHOLDS = {
  EXCEPTIONAL: 35,  // Override for very strong trends
}
```

---

## Pseudo Code

```text
// ============= MOMENTUM DIRECTION OPPOSING GATE =============
// INPUT: derivedDirection (long/short), momentumScore (-100 to +100), 
//        adx, regimeTrendDirection (1h trend), macdHistogram

FUNCTION checkMomentumDirectionGate(derivedDirection, momentumScore, adx, regimeTrendDirection, macdHistogram):
    
    // ===== STEP 1: DEFINE ZONES =====
    isNeutralMomentum = (momentumScore >= -10 AND momentumScore <= 10)
    isStrongADX = (adx >= 40)
    
    // ===== STEP 2: CHECK DIRECTION AGREEMENT =====
    // For early trend detection exception
    trendDirectionAgrees = (
        (derivedDirection == 'long' AND regimeTrendDirection == 'bullish') OR
        (derivedDirection == 'short' AND regimeTrendDirection == 'bearish')
    )
    
    momentumDirectionMismatch = FALSE
    earlyTrendBypassApplied = FALSE
    earlyTrendPositionMultiplier = 1.0
    
    // ===== STEP 3: DIRECTION-SPECIFIC CHECKS =====
    
    IF derivedDirection == 'long':
        
        // CASE A: Strong opposing momentum (score < -20)
        IF momentumScore < STRONG_OPPOSITE_LONG (-20):
            
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

// ============= SECONDARY CHECK (Phase 2 after Momentum Score Gate) =============
// Uses MACD histogram direction for additional validation

FUNCTION checkMomentumDirectionalSymmetry(derivedDirection, momentum, adx):
    
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
        
        // ===== EXCEPTION 1: Very weak momentum (negligible MACD) =====
        macdHistogramAbs = ABS(macdHistogramValue)
        isWeakMomentum = (macdHistogramAbs < 0.0001)
        
        // ===== EXCEPTION 2: Exceptional ADX overrides =====
        allowMomentumOverride = isWeakMomentum OR (adx >= ADX_THRESHOLDS.EXCEPTIONAL)
        
        IF NOT allowMomentumOverride:
            REJECT with "MOMENTUM_DIRECTION_OPPOSING"
            LOG derivedDirection, effectiveMomentumDirection, macdHistogram, adx
            RETURN BLOCKED
        
        // Log why we allowed
        IF isWeakMomentum:
            LOG "Momentum opposes but weak (MACD ~0) - allowing"
        ELSE:
            LOG "Momentum opposes but ADX exceptional (>= 35) - allowing with caution"
    
    RETURN PASS
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
