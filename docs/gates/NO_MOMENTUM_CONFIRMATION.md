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

## Expert Review Improvements (v2)

Based on expert review, three critical improvements were implemented:

### 1. Path 2 ADX Floor (Path Priority Leakage Fix)
**Problem:** `momentumState != "none"` passed too easily without ADX check.  
**Solution:** Path 2 now requires `adx >= STATE_PRESENCE_MIN_ADX (20)`.

```typescript
// Before: Passes immediately
IF momentumState != "none":
    RETURN PASS

// After: Requires ADX floor
IF momentumState != "none" AND adx >= 20:
    RETURN PASS
// ELSE: Continue to Path 3+
```

### 2. Exception Budget (Stacking Prevention)
**Problem:** Multiple weak exceptions could stack to allow entries.  
**Solution:** `MAX_EXCEPTION_DEPTH = 1` - only the first qualifying exception is used.

```typescript
// Track which exception was used
let noMomentumExceptionUsed: ExceptionType | null = null;

// Once an exception is used, block additional exceptions
if (noMomentumExceptionUsed !== null) {
  logger.info(`Skipping ${currentPath} - ${noMomentumExceptionUsed} already applied`);
  continue;
}
```

### 3. Direction Bias Model (Validate, Don't Originate)
**Problem:** Paths 5A/5B derived and returned direction, conflicting with centralized `deriveTradeDirection()`.  
**Solution:** Premium overrides set a `directionalBias`, not a `direction` override.

```typescript
// Before: Direct override
preMomentumDirection = "short";

// After: Bias that informs derivation
premiumOverrideBias = "bearish";  // Suggestion, not override
premiumOverrideSource = "PRE_MOMENTUM_STOCHRSI";

// If derived direction conflicts with bias:
if (derivedDirection !== expectedFromBias) {
  positionMultiplier *= 0.70;  // Reduce position on conflict
  logger.warn("Direction bias conflict detected");
}
```

---

## Architecture Notes

### Confirmation Hierarchy
The gate uses a **five-path confirmation model**:
1. **Standard Confirmation** - Traditional momentum state + confirms flag
2. **State Presence** - Momentum state exists (requires ADX floor)
3. **Strong Trend Exception** - ADX provides structural conviction
4. **Trend Acceleration Bypass** - Price action proves momentum
5. **Premium Overrides** - Advanced structural alignment patterns

A signal passes if **ANY ONE** path succeeds. Only **ONE exception** can be applied per signal.

### Relationship to Momentum State
The `momentumState` from `calculate-trend` engine directly gates this logic:
- `confirmed` → Full conviction, standard pass
- `building` → Partial conviction, state presence pass (if ADX >= 20)
- `mixed` → Weak conviction, state presence pass (if ADX >= 20)
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

// ===== NO_MOMENTUM_GATE_PARAMS (NEW) =====
NO_MOMENTUM_GATE_PARAMS = {
  // Feature flags
  ENABLE_PATH_2_ADX_FLOOR: true,
  ENABLE_EXCEPTION_BUDGET: true,
  
  // Path 2: State presence requires ADX floor
  STATE_PRESENCE_MIN_ADX: 20,
  
  // Exception budget: Only 1 exception per signal
  MAX_EXCEPTION_DEPTH: 1,
  
  // Direction bias conflict handling
  DIRECTION_CONFLICT_POSITION_REDUCTION: 0.70,
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
  MIN_PRICE_MOVE_PERCENT: 2.5,
  LOOKBACK_HOURS: 6,
  MIN_ADX_FOR_MOMENTUM_BYPASS: 20,
  REQUIRE_ADX_RISING: true,
  POSITION_SIZE_MULTIPLIER: 0.70,
  OVEREXTENDED_POSITION_MULTIPLIER: 0.50,
}

// ===== PRE-MOMENTUM STOCHRSI EXTREME =====
PRE_MOMENTUM_STOCHRSI_PARAMS = {
  ENABLED: true,
  MAX_STOCHRSI_K_FOR_SHORT: 18,
  MIN_STOCHRSI_K_FOR_LONG: 82,
  MIN_ADX: 18,
  MIN_1H_CONFIDENCE: 55,
  POSITION_SIZE_MULTIPLIER: 0.50,
  STRONG_SETUP_MULTIPLIER: 0.60,
}

// ===== SHORT-TERM ALIGNMENT =====
SHORT_TERM_ALIGNMENT_PARAMS = {
  ENABLED: true,
  MIN_ADX: 18,
  ALLOW_WHEN_MOMENTUM_NONE: true,
  POSITION_SIZE_MULTIPLIER: 0.55,
}
```

---

## Pseudo Code

```text
// ============= NO MOMENTUM CONFIRMATION GATE (v2) =============
// INPUT: momentumState, momentumConfirms, adx, htfTrend1h, stochRsiK1h, priceMove6h, ...

FUNCTION checkMomentumConfirmationGate(...):
    
    // Initialize exception budget tracking
    noMomentumExceptionUsed = NULL
    noMomentumExceptionMultiplier = 1.0
    premiumOverrideBias = NULL
    
    // ============= PATH 1: STANDARD CONFIRMATION =============
    IF momentumConfirms == TRUE:
        LOG "PASS: Standard momentum confirmation"
        RETURN PASS
    
    // ============= PATH 2: STATE PRESENCE WITH ADX FLOOR =============
    IF momentumState != "none":
        IF ENABLE_PATH_2_ADX_FLOOR AND adx < STATE_PRESENCE_MIN_ADX:
            LOG "Path 2 skipped: momentumState={momentumState} but ADX={adx} < 20"
            // Continue to Path 3+
        ELSE:
            LOG "PASS: Momentum state presence ({momentumState})"
            RETURN PASS
    
    // ============= PATH 3: STRONG TREND EXCEPTION =============
    // Calculate effective ADX threshold (dynamic with StochRSI alignment)
    effectiveStrongTrendADX = 28  // Default
    
    IF STOCHRSI_ADX_ALIGNMENT.ENABLED:
        IF (htfTrend1h == "bearish" AND stochRsiK1h < 20) OR
           (htfTrend1h == "bullish" AND stochRsiK1h > 80):
            effectiveStrongTrendADX = 22
            
            // Mark as exception (with budget check)
            IF ENABLE_EXCEPTION_BUDGET AND noMomentumExceptionUsed == NULL:
                noMomentumExceptionUsed = "STOCHRSI_ADX_ALIGNMENT"
    
    IF adx >= effectiveStrongTrendADX:
        // Check exception budget
        IF ENABLE_EXCEPTION_BUDGET AND noMomentumExceptionUsed != NULL:
            LOG "Skipping STRONG_TREND - {noMomentumExceptionUsed} already applied"
        ELSE:
            noMomentumExceptionUsed = "STRONG_TREND"
            LOG "PASS: Strong trend exception (ADX={adx})"
            RETURN PASS
    
    // ============= PATH 4: TREND ACCELERATION BYPASS =============
    IF qualifiesForTrendAcceleration:
        IF ENABLE_EXCEPTION_BUDGET AND noMomentumExceptionUsed != NULL:
            LOG "Skipping TREND_ACCELERATION - {noMomentumExceptionUsed} already applied"
        ELSE:
            noMomentumExceptionUsed = "TREND_ACCELERATION"
            noMomentumExceptionMultiplier = 0.70
            LOG "PASS: Trend acceleration bypass ({priceMove}% move)"
            RETURN PASS
    
    // ============= PATH 5A: PRE-MOMENTUM STOCHRSI EXTREME =============
    IF preMomentumStochRsiQualifies:
        IF ENABLE_EXCEPTION_BUDGET AND noMomentumExceptionUsed != NULL:
            LOG "Skipping PRE_MOMENTUM_STOCHRSI - {noMomentumExceptionUsed} already applied"
        ELSE:
            noMomentumExceptionUsed = "PRE_MOMENTUM_STOCHRSI"
            noMomentumExceptionMultiplier = 0.50-0.60
            
            // Set directional BIAS (not override)
            premiumOverrideBias = (direction == "long") ? "bullish" : "bearish"
            
            LOG "PASS: Pre-momentum StochRSI (bias={premiumOverrideBias})"
            RETURN PASS with bias
    
    // ============= PATH 5B: SHORT-TERM ALIGNMENT OVERRIDE =============
    IF shortTermAlignmentQualifies:
        IF ENABLE_EXCEPTION_BUDGET AND noMomentumExceptionUsed != NULL:
            LOG "Skipping SHORT_TERM_ALIGNMENT - {noMomentumExceptionUsed} already applied"
        ELSE:
            noMomentumExceptionUsed = "SHORT_TERM_ALIGNMENT"
            noMomentumExceptionMultiplier = 0.55
            
            // Set directional BIAS (not override)
            premiumOverrideBias = (direction == "long") ? "bullish" : "bearish"
            
            LOG "PASS: Short-term alignment (bias={premiumOverrideBias})"
            RETURN PASS with bias
    
    // ============= DIRECTION BIAS CONFLICT CHECK =============
    IF premiumOverrideBias != NULL AND derivedDirection != expectedFromBias:
        noMomentumExceptionMultiplier *= 0.70  // Reduce position on conflict
        LOG "Direction bias conflict: bias suggests {premiumOverrideBias} but derived={derivedDirection}"
    
    // ============= NO PATH SUCCEEDED =============
    REJECT with "NO_MOMENTUM_CONFIRMATION"
    LOG detailed diagnostics for all paths
    RETURN BLOCKED
```

---

## Decision Matrix

### Core Paths

| Path | Condition | ADX Floor | Position Size | Exception Budget |
|------|-----------|-----------|---------------|------------------|
| Standard Confirmation | `momentumConfirms == true` | None | 100% | N/A |
| State Presence | `momentumState != "none"` | >= 20 | 100% | N/A |
| Strong Trend Exception | `adx >= 28` (or 22 if aligned) | Built-in | 100% | Counted |
| Trend Acceleration | `priceMove >= 2.5%` + ADX rising | >= 20 | 70% (50% if overextended) | Counted |
| Pre-Momentum StochRSI | Deep extreme + 1h directional | >= 18 | 50-60% | Counted |
| Short-Term Alignment | 1h+30m+micro agree | >= 18 | 55% | Counted |

### Exception Priority Order

| Priority | Exception Type | When Applied |
|----------|---------------|--------------|
| 1 | STOCHRSI_ADX_ALIGNMENT | StochRSI aligns with 1h trend |
| 2 | STRONG_TREND | ADX >= threshold |
| 3 | TREND_ACCELERATION | Price move + ADX rising |
| 4 | PRE_MOMENTUM_STOCHRSI | Deep StochRSI + 1h directional |
| 5 | SHORT_TERM_ALIGNMENT | All short-term agree |

Once an exception is used, lower-priority exceptions are skipped.

### Dynamic ADX Threshold

| 1h Trend | StochRSI K | ADX Threshold |
|----------|------------|---------------|
| Bearish | < 20 | 22 (reduced) |
| Bullish | > 80 | 22 (reduced) |
| Any other | Any | 28 (default) |

---

## Position Size Multipliers

| Entry Type | Multiplier | Rationale |
|------------|------------|-----------|
| Standard confirmation | 1.00 (100%) | Full conviction |
| State presence (with ADX floor) | 1.00 (100%) | Partial conviction acceptable |
| Strong trend exception | 1.00 (100%) | ADX provides conviction |
| Trend acceleration (normal) | 0.70 (70%) | Chasing risk |
| Trend acceleration (overextended) | 0.50 (50%) | High chase risk |
| Pre-momentum (strong 1h) | 0.60 (60%) | Early entry with confirmation |
| Pre-momentum (standard) | 0.50 (50%) | Early entry risk |
| Short-term alignment | 0.55 (55%) | Structural alignment only |
| **Direction bias conflict** | **0.70x of exception** | Reduced confidence |

---

## Logged Data (filters_status)

```json
{
  "gate": "NO_MOMENTUM_CONFIRMATION",
  "momentumState": "none",
  "momentumConfirms": false,
  "adx": "22.5",
  "effectiveADXThreshold": 28,
  "path2": {
    "statePresencePasses": false,
    "statePresenceSkippedDueToADX": true,
    "adxFloorEnabled": true,
    "adxFloorRequired": 20
  },
  "exceptionBudget": {
    "enabled": true,
    "exceptionUsed": "STOCHRSI_ADX_ALIGNMENT",
    "maxDepth": 1
  },
  "paths": {
    "path1_standardConfirmation": false,
    "path2_statePresence": false,
    "path3_strongTrend": false,
    "path4_acceleration": false,
    "path5a_preMomentum": false,
    "path5b_shortTermAlignment": false
  },
  "isStrongTrendException": false,
  "stochRsiAdxAlignmentActive": true,
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
    "consecutiveBars1h": 2,
    "consecutiveBars30m": 3,
    "consecutiveBars15m": 4
  }
}
```

---

## UI Display (SignalRejectionReasons.tsx)

The `NoMomentumConfirmationDisplay` component should show:
1. Current momentum state and confirms status
2. Path 2 ADX floor status (new)
3. Exception budget usage (new)
4. ADX value vs required threshold (with alignment status)
5. Path-by-path diagnostic checklist
6. Direction bias conflict warning (if applicable)
7. Failure reason summary

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
2. **Building momentum but ADX too low:** `momentumState="building"`, ADX=15 → Blocked (new: ADX floor)
3. **Price move but ADX flat:** 3% price move, ADX=22, adxRising=false → Blocked (acceleration requires rising ADX)
4. **Exception stacking blocked:** StochRSI-ADX alignment used, then trend acceleration also qualifies → Only first used (new: budget)
5. **Direction bias conflict:** Pre-momentum suggests SHORT but derived direction is LONG → Position reduced 30%

---

## Expected Impact

| Metric | Before | After |
|--------|--------|-------|
| Weak "building" state entries | Allowed at ADX 15 | Blocked below ADX 20 |
| Exception stacking | Unlimited | Max 1 per signal |
| Direction conflicts | Silently overridden | Logged with position reduction |
| False positive rate | Higher | Lower |
| Legitimate early entries | May be blocked | Preserved via exception paths |

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
