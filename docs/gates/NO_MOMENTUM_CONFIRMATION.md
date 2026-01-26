# HARD GATE: No Momentum Confirmation

## Overview

This gate prevents trades that lack directional conviction by requiring momentum confirmation before entry. It is the primary filter ensuring entries have measurable momentum support.

**Gate ID:** `NO_MOMENTUM_CONFIRMATION`  
**Type:** Hard Gate (blocks signal generation)  
**Location:** `supabase/functions/strategy-analyzer/index.ts`  
**Phase:** Early filtering (before quality scoring)

---

## Core Principle

> "Never enter a trade without momentum confirmation - unless structural conviction from ADX, price action, or multi-timeframe alignment provides equivalent evidence."

This gate enforces **directional conviction** before allowing entries. Unlike the Momentum Direction Opposing gate which checks polarity, this gate checks **presence** of momentum.

---

## Architecture Notes

### Confirmation Hierarchy
The gate uses a **five-path confirmation model**:
1. **Standard Confirmation** - Traditional momentum state + confirms flag
2. **State Presence** - Momentum state exists (even if not fully confirmed)
3. **Strong Trend Exception** - ADX provides structural conviction
4. **Trend Acceleration Bypass** - Price action proves momentum
5. **Premium Overrides** - Advanced structural alignment patterns

A signal passes if **ANY ONE** path succeeds.

### Relationship to Momentum State
The `momentumState` from `calculate-trend` engine directly gates this logic:
- `confirmed` → Full conviction, standard pass
- `building` → Partial conviction, state presence pass
- `mixed` → Weak conviction, state presence pass
- `none` → No conviction, requires exception path

---

## Thresholds (from constants.ts)

```typescript
// ===== CORE ADX THRESHOLDS =====
ADX_THRESHOLDS = {
  STRONG_TREND_EXCEPTION: 28,    // Default for no-momentum bypass
  EXCEPTIONAL: 35,               // Strong trend override
  MINIMUM: 20,                   // Floor for all entries
}

// ===== STOCHRSI-ADX ALIGNMENT =====
STOCHRSI_ADX_ALIGNMENT_PARAMS = {
  ENABLED: true,
  BEARISH_STOCHRSI_THRESHOLD: 20,   // 1h bearish + K < 20
  BULLISH_STOCHRSI_THRESHOLD: 80,   // 1h bullish + K > 80
  REDUCED_ADX_THRESHOLD: 22,        // Reduced from 28 when aligned
}

// ===== TREND ACCELERATION =====
TREND_ACCELERATION_PARAMS = {
  ENABLED: true,
  MIN_PRICE_MOVE_PERCENT: 2.5,      // Minimum price move to qualify
  LOOKBACK_HOURS: 6,                // Price move detection window
  STRONG_PRICE_MOVE_PERCENT: 3.5,   // Higher priority threshold
  MIN_ADX_FOR_MOMENTUM_BYPASS: 20,  // Minimum ADX for bypass
  REQUIRE_ADX_RISING: true,         // ADX must be rising
  MAX_STOCHRSI_K_FOR_LONG: 88,      // StochRSI safety limit for LONG
  MIN_STOCHRSI_K_FOR_SHORT: 12,     // StochRSI safety limit for SHORT
  POSITION_SIZE_MULTIPLIER: 0.70,   // 70% position for acceleration entries
  OVEREXTENDED_POSITION_MULTIPLIER: 0.50,  // 50% if move > 5%
}

// ===== PRE-MOMENTUM STOCHRSI EXTREME =====
PRE_MOMENTUM_STOCHRSI_PARAMS = {
  ENABLED: true,
  MAX_STOCHRSI_K_FOR_SHORT: 18,     // K < 18 = oversold, allow SHORT
  MIN_STOCHRSI_K_FOR_LONG: 82,      // K > 82 = overbought, allow LONG
  MIN_ADX: 18,                      // Minimum ADX for override
  MIN_1H_CONFIDENCE: 55,            // 1h must show >= 55% confidence
  POSITION_SIZE_MULTIPLIER: 0.50,   // 50% of normal
  STRONG_SETUP_MULTIPLIER: 0.60,    // 60% when 1h confidence >= 65%
}

// ===== SHORT-TERM ALIGNMENT =====
SHORT_TERM_ALIGNMENT_PARAMS = {
  ENABLED: true,
  MIN_ADX: 18,                      // Minimum ADX
  ALLOW_WHEN_MOMENTUM_NONE: true,   // Only for momentum="none"
  POSITION_SIZE_MULTIPLIER: 0.55,   // 55% of normal
}
```

---

## Pseudo Code

```text
// ============= NO MOMENTUM CONFIRMATION GATE =============
// INPUT: momentumState (confirmed/building/mixed/none), momentumConfirms (boolean),
//        adx, htfTrend1h, stochRsiK1h, priceMove6h, trend30m, microTrend

FUNCTION checkMomentumConfirmationGate(momentumState, momentumConfirms, adx, htfTrend1h, stochRsiK1h, priceMove6h, ...):
    
    // ============= PATH 1: STANDARD CONFIRMATION =============
    // Momentum state is present AND confirms flag is true
    IF momentumConfirms == TRUE:
        LOG "PASS: Standard momentum confirmation"
        RETURN PASS
    
    // ============= PATH 2: STATE PRESENCE =============
    // Any non-"none" state provides partial conviction
    IF momentumState != "none":
        LOG "PASS: Momentum state presence ({momentumState})"
        RETURN PASS
    
    // ============= PATH 3: STRONG TREND EXCEPTION =============
    // ADX provides structural conviction when momentum is absent
    
    // Step 3A: Calculate effective ADX threshold (dynamic)
    effectiveStrongTrendADX = 28  // Default
    stochRsiAdxAlignmentActive = FALSE
    
    IF STOCHRSI_ADX_ALIGNMENT_PARAMS.ENABLED:
        // Check if StochRSI aligns with 1h trend direction
        stochRsiAlignsWithBearish = (htfTrend1h == "bearish" AND stochRsiK1h < 20)
        stochRsiAlignsWithBullish = (htfTrend1h == "bullish" AND stochRsiK1h > 80)
        
        IF stochRsiAlignsWithBearish OR stochRsiAlignsWithBullish:
            effectiveStrongTrendADX = 22  // Reduced threshold
            stochRsiAdxAlignmentActive = TRUE
            LOG "ADX threshold reduced to 22 due to StochRSI-1h alignment"
    
    // Step 3B: Check if ADX meets threshold
    isStrongTrendException = (adx >= effectiveStrongTrendADX)
    
    IF isStrongTrendException:
        LOG "PASS: Strong trend exception (ADX={adx} >= {effectiveStrongTrendADX})"
        RETURN PASS with positionMultiplier = 1.0
    
    // ============= PATH 4: TREND ACCELERATION BYPASS =============
    // Strong price move with rising ADX proves momentum without indicator confirmation
    
    IF TREND_ACCELERATION_PARAMS.ENABLED:
        hasStrongMove = (priceMove6h >= 2.5%)
        adxRising = (adxSlope > 0)
        adxSufficient = (adx >= 20)
        
        // Determine price direction
        priceDirection = (priceMove6h > 0) ? "bullish" : "bearish"
        
        // Check StochRSI safety limits
        IF priceDirection == "bullish":
            stochRsiSafe = (stochRsiK4h < 88)
        ELSE:
            stochRsiSafe = (stochRsiK4h > 12)
        
        // Check HTF alignment with price direction
        htfMatchesDirection = (
            (priceDirection == "bullish" AND htfTrend1h IN ["bullish", "neutral"]) OR
            (priceDirection == "bearish" AND htfTrend1h IN ["bearish", "neutral"])
        )
        
        qualifiesForTrendAcceleration = (
            hasStrongMove AND 
            adxSufficient AND 
            adxRising AND 
            stochRsiSafe AND 
            htfMatchesDirection
        )
        
        IF qualifiesForTrendAcceleration:
            // Apply position size reduction
            IF priceMove6h >= 5.0%:
                positionMultiplier = 0.50  // Overextended
            ELSE:
                positionMultiplier = 0.70  // Standard acceleration
            
            LOG "PASS: Trend acceleration bypass ({priceMove6h}% move, ADX={adx})"
            RETURN PASS with positionMultiplier
    
    // ============= PATH 5: PREMIUM OVERRIDES =============
    // Advanced structural patterns that provide early entry opportunity
    
    // ===== PATH 5A: PRE-MOMENTUM STOCHRSI EXTREME =====
    // Catches moves before momentum indicators confirm
    IF PRE_MOMENTUM_STOCHRSI_PARAMS.ENABLED AND momentumState IN ["none", "building"]:
        adxSufficient = (adx >= 18)
        
        // Check for SHORT: deeply oversold + 1h bearish + K declining
        isDeeplySold = (stochRsiK1h < 18)
        is1hBearish = (htfTrend1h == "bearish" AND conf1h >= 55)
        isStochDeclining = (stochRsiK1h < stochRsiD1h)
        
        // Check for LONG: deeply overbought + 1h bullish + K rising
        isDeeplyBought = (stochRsiK1h > 82)
        is1hBullish = (htfTrend1h == "bullish" AND conf1h >= 55)
        isStochRising = (stochRsiK1h > stochRsiD1h)
        
        IF adxSufficient:
            IF isDeeplySold AND is1hBearish AND isStochDeclining:
                positionMultiplier = (conf1h >= 65) ? 0.60 : 0.50
                LOG "PASS: Pre-momentum StochRSI SHORT (K={stochRsiK1h} < 18, 1h bearish)"
                RETURN PASS with direction="short", positionMultiplier
            
            IF isDeeplyBought AND is1hBullish AND isStochRising:
                positionMultiplier = (conf1h >= 65) ? 0.60 : 0.50
                LOG "PASS: Pre-momentum StochRSI LONG (K={stochRsiK1h} > 82, 1h bullish)"
                RETURN PASS with direction="long", positionMultiplier
    
    // ===== PATH 5B: SHORT-TERM ALIGNMENT OVERRIDE =====
    // When 1h, 30m, and micro all agree but momentum is "none"
    IF SHORT_TERM_ALIGNMENT_PARAMS.ENABLED AND momentumState == "none":
        adxSufficient = (adx >= 18)
        
        // All three short-term timeframes must agree
        allBullish = (htfTrend1h == "bullish" AND trend30m == "bullish" AND microTrend == "bullish")
        allBearish = (htfTrend1h == "bearish" AND trend30m == "bearish" AND microTrend == "bearish")
        
        IF adxSufficient AND (allBullish OR allBearish):
            direction = allBullish ? "long" : "short"
            positionMultiplier = 0.55
            LOG "PASS: Short-term alignment override ({direction})"
            RETURN PASS with direction, positionMultiplier
    
    // ============= NO CONFIRMATION PATH SUCCEEDED =============
    REJECT with "NO_MOMENTUM_CONFIRMATION"
    LOG gate, momentumState, momentumConfirms, adx, effectiveStrongTrendADX
    LOG trendAcceleration: { priceMove, adxRising, stochRsiSafe, htfMatches }
    LOG momentum: { state, confirms, macdHistogram, macdExpanding, consecutiveBars }
    RETURN BLOCKED
```

---

## Decision Matrix

### Core Paths

| Path | Condition | Position Size | Priority |
|------|-----------|---------------|----------|
| Standard Confirmation | `momentumConfirms == true` | 100% | 1 (highest) |
| State Presence | `momentumState != "none"` | 100% | 2 |
| Strong Trend Exception | `adx >= 28` (or 22 if aligned) | 100% | 3 |
| Trend Acceleration | `priceMove >= 2.5%` + ADX rising | 70% (50% if overextended) | 4 |
| Pre-Momentum StochRSI | Deep extreme + 1h directional | 50-60% | 5 |
| Short-Term Alignment | 1h+30m+micro agree | 55% | 6 |

### Dynamic ADX Threshold

| 1h Trend | StochRSI K | ADX Threshold |
|----------|------------|---------------|
| Bearish | < 20 | 22 (reduced) |
| Bullish | > 80 | 22 (reduced) |
| Any other | Any | 28 (default) |

### Trend Acceleration Requirements

| Condition | Requirement |
|-----------|-------------|
| Price Move | >= 2.5% in 6 hours |
| ADX | >= 20 |
| ADX Slope | Must be rising (> 0) |
| StochRSI Safety (LONG) | 4h K < 88 |
| StochRSI Safety (SHORT) | 4h K > 12 |
| HTF Alignment | 1h trend not opposing |

---

## Position Size Multipliers

| Entry Type | Multiplier | Rationale |
|------------|------------|-----------|
| Standard confirmation | 1.00 (100%) | Full conviction |
| State presence | 1.00 (100%) | Partial conviction acceptable |
| Strong trend exception | 1.00 (100%) | ADX provides conviction |
| Trend acceleration (normal) | 0.70 (70%) | Chasing risk |
| Trend acceleration (overextended) | 0.50 (50%) | High chase risk |
| Pre-momentum (strong 1h) | 0.60 (60%) | Early entry with confirmation |
| Pre-momentum (standard) | 0.50 (50%) | Early entry risk |
| Short-term alignment | 0.55 (55%) | Structural alignment only |

---

## Logged Data (filters_status)

```json
{
  "gate": "NO_MOMENTUM_CONFIRMATION",
  "momentumState": "none",
  "momentumConfirms": false,
  "adx": "22.5",
  "isStrongTrendException": false,
  "trend": "bearish",
  "confidence": 58,
  "trendAcceleration": {
    "priceMove": "1.8",
    "priceDirection": "bearish",
    "hasStrongMove": false,
    "qualifiesForBypass": false,
    "adxRising": true,
    "stochRsiK4h": "45.2",
    "stochRsiSafe": true,
    "htfMatches": true
  },
  "momentum": {
    "state": "none",
    "confirms": false,
    "macdHistogram": "-0.0012",
    "macdDirectionAligned": true,
    "macdExpanding": false,
    "lastCloseAlignsWithTrend": true,
    "hasDivergence": false,
    "consecutiveBars1h": 2,
    "consecutiveBars30m": 3,
    "consecutiveBars15m": 4
  },
  "stochRsi": {
    "k": 45.2,
    "d": 48.5
  },
  "htfFilter": {
    "aligned": true,
    "trend4h": "neutral",
    "trend1h": "bearish"
  }
}
```

---

## UI Display (SignalRejectionReasons.tsx)

The `NoMomentumConfirmationDisplay` component shows:
1. Current momentum state and confirms status
2. ADX value vs required threshold (with alignment status)
3. Trend acceleration diagnostic checklist:
   - Price move % vs 2.5% requirement
   - ADX rising status
   - StochRSI safety check
   - HTF alignment status
4. Premium override eligibility (Pre-momentum StochRSI, Short-term alignment)
5. Failure reason summary

---

## Interaction with Other Gates

| Gate | Relationship |
|------|--------------|
| Momentum Direction Opposing | Complementary - this gate checks presence, that gate checks polarity |
| ADX Minimum | Prerequisite - ADX minimum must pass before this gate evaluates exceptions |
| HTF Alignment | Input - 1h/4h trends used for dynamic threshold and acceleration checks |
| StochRSI Extremes | Input - StochRSI values affect threshold reduction and premium overrides |

---

## Common Rejection Scenarios

1. **No momentum, weak ADX:** `momentumState="none"`, ADX=18, no price acceleration → Blocked
2. **Building momentum, no confirms:** `momentumState="building"`, `confirms=false` → **PASS** (state presence)
3. **Price move but ADX flat:** 3% price move, ADX=22, adxRising=false → Blocked (acceleration requires rising ADX)
4. **Near-extreme StochRSI but wrong direction:** K=15 (oversold) but 1h bullish → Blocked (pre-momentum requires alignment)
5. **Mixed timeframe alignment:** 1h bearish, 30m bullish, micro neutral → Blocked (short-term alignment requires unanimity)

---

## Expected Impact

- Prevents entries without measurable momentum or structural conviction
- Allows early entries when ADX provides trend strength evidence
- Catches strong price moves before momentum indicators confirm
- Multi-path architecture prevents over-filtering while maintaining signal quality

---

## Unified Momentum Scoring

The gate uses a **unified momentum score** to prevent false rejections:

```typescript
// Legacy score can be 0 while smartMomentum shows 15-20
// Solution: Use HIGHER of the two scores
const absSmartMomentum = Math.abs(smartMomentum.score);
const normalizedSmartMomentumScore = absSmartMomentum > 0 
  ? Math.max(1, Math.ceil(absSmartMomentum / 10))
  : 0;

const earlyMomentumScore = Math.max(legacyMomentumScore, normalizedSmartMomentumScore);
```

This ensures that if **either** scoring system detects momentum, the gate acknowledges its presence.
