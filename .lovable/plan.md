
# Momentum Status Details - Critical Fixes Implementation Plan

## Overview

This plan addresses four critical issues and two medium-risk design gaps identified in the external review of the Momentum Status Details subsystem. The fixes will improve logical consistency, prevent nondeterministic behavior, and enhance decision-making quality.

---

## Issue Summary

| Priority | Issue | Status | Impact |
|----------|-------|--------|--------|
| Critical | ISSUE 1: `momentumConfirms` undefined bug | **FALSE POSITIVE** | Verified defined at line 1430 |
| Critical | ISSUE 2: MACD Direction Alignment not enforced | **VALID** | Can allow misaligned entries |
| Critical | ISSUE 3: Volume is observational only | **PARTIALLY VALID** | Has soft impact but not in momentum state |
| Medium | ISSUE 4: ADX threshold drift | **VALID** | UI vs engine mismatch |
| Medium | GAP 1: No explicit "exhausted" state | **VALID** | Limits interpretability |
| Medium | GAP 2: Last-close alignment overweighted | **VALID** | Noise-sensitive in compression |

---

## Phase 1: Critical Fixes

### 1.1 ISSUE 1 Resolution: Verify `momentumConfirms` Definition

**Finding**: After thorough code review, this is a **FALSE POSITIVE**.

The variable `momentumConfirms` is explicitly defined at line 1430 of `calculate-trend/index.ts`:

```
const momentumConfirms = fullMomentumConfirms || alignedMomentumConfirms;
```

And returned in the response object at line 1498:

```
confirms: momentumConfirms,
```

**Action**: No code change required. Documentation update to confirm this is correctly implemented.

---

### 1.2 ISSUE 2: Enforce MACD Direction Alignment in Momentum Confirmation

**Problem**: `macdDirectionAligned` is calculated but not required for `fullMomentumConfirms`.

**Current Logic (line 1425)**:
```
fullMomentumConfirms = macdExpanding && lastCloseAlignsWithTrend && !hasDivergence && adx >= MODERATE && adxRising
```

**Issue**: `macdExpanding` only checks that |histogram| > 0.05 AND histogram sign matches trend. However, if `macdDirectionAligned` is false, we could still have expanding MACD in the wrong direction.

**Fix**: Add `macdDirectionAligned` as an explicit requirement.

**File**: `supabase/functions/calculate-trend/index.ts`

**Changes**:
```
Line ~1411: Modify macdExpanding to require direction alignment explicitly
Line ~1425: Add macdDirectionAligned to fullMomentumConfirms
Line ~1428: Add macdDirectionAligned to alignedMomentumConfirms
```

**Updated Logic**:
```text
fullMomentumConfirms = macdExpanding && macdDirectionAligned && lastCloseAlignsWithTrend && !hasDivergence && adx >= MODERATE && adxRising

alignedMomentumConfirms = strongAlignment && macdExpanding && macdDirectionAligned && !hasDivergence && adx >= WEAK
```

---

### 1.3 ISSUE 3: Make Volume a Decision Factor (Soft Booster)

**Problem**: `volumeConfirms` is calculated and returned but has no impact on momentum state.

**Current State**: Volume affects quality scoring and position sizing downstream, but NOT momentum state classification.

**Recommended Fix**: Option A - Make Volume a Soft Booster for state promotion.

**File**: `supabase/functions/calculate-trend/index.ts`

**Changes**:
```
Lines ~1431-1442: Update momentum state logic to allow volume-confirmed upgrades
```

**New Logic**:
```text
IF fullMomentumConfirms:
    momentumState = "confirmed"
ELSE IF alignedMomentumConfirms:
    IF volumeConfirmsDirection THEN
        momentumState = "confirmed"  // Volume promotes building → confirmed
    ELSE
        momentumState = "building"
ELSE IF fakeBreakoutRisk:
    momentumState = "mixed"
```

This makes volume actionable without creating hard gates.

---

### 1.4 ISSUE 4: Unify ADX Thresholds Between UI and Engine

**Problem**: UI displays ADX >= 20 as "passing" while engine logic uses:
- ADX >= 22 for `fullMomentumConfirms` (MODERATE threshold)
- ADX >= 15 for `alignedMomentumConfirms` (WEAK threshold)

**Files to Update**:
1. `src/components/MomentumStatusDetails.tsx` - Update display threshold
2. Document the actual thresholds in UI tooltip

**Changes**:

**File**: `src/components/MomentumStatusDetails.tsx`
```
Line 78: Change adxOK threshold to match engine logic
```

**Updated Logic**:
```text
// For "Confirmed" state: ADX >= 22 (MODERATE)
// For "Building" state: ADX >= 15 (WEAK)
// Display should show tiered status, not binary pass/fail

const adxConfirmed = (momentum?.adx ?? 0) >= 22;  // For confirmed
const adxBuilding = (momentum?.adx ?? 0) >= 15;   // For building
const adxOK = momentumState === "confirmed" ? adxConfirmed : adxBuilding;
```

**Also add tooltip** explaining:
- ADX >= 22: Strong trend (required for Confirmed)
- ADX 15-21: Early trend (allows Building state)
- ADX < 15: Range (blocks entry)

---

## Phase 2: Medium Priority Fixes

### 2.1 GAP 1: Add Explicit "exhausted" Momentum State

**Problem**: Exhaustion conditions fall into "mixed" state, reducing interpretability.

**Proposal**: Add `"exhausted"` as a fifth momentum state.

**Files to Update**:
1. `supabase/functions/calculate-trend/index.ts` - Add exhaustion detection
2. `src/hooks/useMomentumStatus.ts` - Update interface
3. `src/components/MomentumStatusDetails.tsx` - Add UI rendering

**Exhaustion Detection Logic**:
```text
isExhausted = (
    ADX >= 45 AND adxRising == false AND
    (macdSlope < 0 OR hasDivergence) AND
    (stochRsi4h.k > 90 OR stochRsi4h.k < 10)
)
```

**State Machine Update**:
```text
let momentumState: "none" | "mixed" | "confirmed" | "building" | "exhausted" = "none";

IF isExhausted:
    momentumState = "exhausted"
ELSE IF fullMomentumConfirms:
    momentumState = "confirmed"
... (existing logic)
```

**UI Changes**: Add orange/red "Exhausted" badge with warning icon.

---

### 2.2 GAP 2: Reduce Last-Close Alignment Weight in Low-Volatility Markets

**Problem**: 2/3 candle alignment is noise-sensitive during compression.

**Proposal**: Relax the requirement when ATR percentile is low OR require volume confirmation instead.

**File**: `supabase/functions/calculate-trend/index.ts`

**Changes** (around line 1377-1393):
```text
// Relaxed alignment during compression
const isCompressed = relativeATR < 0.7;  // ATR below 70% of historical average

IF isCompressed:
    // In compression, require only 1/3 alignment OR volume confirmation
    lastCloseAlignsWithTrend = effectiveTrend == "neutral" 
        OR alignedCandles >= 1 
        OR volumeConfirmsDirection
ELSE:
    // Standard 2/3 majority rule
    lastCloseAlignsWithTrend = effectiveTrend == "neutral" 
        OR alignedCandles >= ceil(candleCount * 0.67)
```

This prevents false negatives during range compression while maintaining signal quality in trending conditions.

---

## Phase 3: Documentation Updates

### 3.1 Update Constants Documentation

**File**: `supabase/functions/_shared/constants.ts`

Add a new section documenting momentum thresholds:
```text
// ============= MOMENTUM STATE THRESHOLDS =============
// Used by calculate-trend for momentum state classification
export const MOMENTUM_STATE_THRESHOLDS = {
    // ADX required for "confirmed" state
    CONFIRMED_MIN_ADX: 22,  // Matches ADX_THRESHOLDS.MODERATE
    
    // ADX required for "building" state  
    BUILDING_MIN_ADX: 15,   // Matches ADX_THRESHOLDS.WEAK
    
    // ADX required for "exhausted" state
    EXHAUSTED_MIN_ADX: 45,  // Matches ADX_THRESHOLDS.EXHAUSTION
    
    // MACD histogram minimum for "expanding"
    MACD_EXPANDING_MIN: 0.05,
    
    // Candle alignment majority (67% = 2 of 3)
    CANDLE_ALIGNMENT_RATIO: 0.67,
    
    // Relaxed alignment in compression (33% = 1 of 3)
    CANDLE_ALIGNMENT_RATIO_COMPRESSED: 0.33,
} as const;
```

### 3.2 Update Memory Documentation

Create/update memory entries for the momentum subsystem architecture to reflect the fixes.

---

## Implementation Sequence

```text
┌─────────────────────────────────────────────────────────┐
│                    PHASE 1 (Critical)                   │
├─────────────────────────────────────────────────────────┤
│ 1. Add macdDirectionAligned to momentum confirms        │
│ 2. Add volume as soft booster for state promotion       │
│ 3. Fix ADX threshold display in UI                      │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│                  PHASE 2 (Medium Priority)              │
├─────────────────────────────────────────────────────────┤
│ 4. Add "exhausted" momentum state                       │
│ 5. Relax candle alignment in compression                │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│                    PHASE 3 (Documentation)              │
├─────────────────────────────────────────────────────────┤
│ 6. Update constants.ts with MOMENTUM_STATE_THRESHOLDS   │
│ 7. Add tooltips to MomentumStatusDetails UI             │
└─────────────────────────────────────────────────────────┘
```

---

## Files Modified Summary

| File | Changes |
|------|---------|
| `supabase/functions/calculate-trend/index.ts` | MACD alignment enforcement, volume booster, exhausted state, compression logic |
| `supabase/functions/_shared/constants.ts` | New MOMENTUM_STATE_THRESHOLDS section |
| `src/hooks/useMomentumStatus.ts` | Add "exhausted" to state type |
| `src/components/MomentumStatusDetails.tsx` | Fix ADX display, add exhausted badge, add tooltips |

---

## Expected Outcomes

1. **Reduced false continuation entries** - MACD direction now enforced
2. **Volume becomes actionable** - Can promote building → confirmed
3. **UI matches engine** - ADX thresholds aligned
4. **Better interpretability** - Explicit "exhausted" state
5. **Fewer false negatives in compression** - Relaxed candle alignment
6. **Cleaner integration with mean-reversion** - Exhausted state maps directly
