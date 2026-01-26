
# Momentum Score Hard Gate - Implementation Plan

## Overview

This plan addresses the valid findings from the system-level review of the "HARD GATE: Momentum Score Too Low" logic. After thorough code analysis, I've identified which issues are valid, which are false positives, and the specific changes needed.

---

## Issue Analysis Summary

| Issue | Status | Action Required |
|-------|--------|-----------------|
| ISSUE 1: ADX Slope not used in canBlock | **PARTIALLY VALID** | Add accelerating trend bypass |
| ISSUE 2: Threshold range 6-7 underspecified | **FALSE POSITIVE** | No action - code uses explicit constants |
| ISSUE 3: Momentum State not used | **VALID** | Add state-based threshold adjustment |
| ISSUE 4: Pullback over-relaxation | **PARTIALLY ADDRESSED** | Strengthen ADX guard |
| GAP 1: Position multiplier vague | **VALID** | Add graduated calculation |
| GAP 2: Order undocumented | **VALID** | Add documentation to constants |

---

## Phase 1: Critical Fixes

### 1.1 Add ADX Slope to canBlock Logic (ISSUE 1)

**Problem**: In accelerating trends (ADX >= 30 AND adxSlope > 0), low momentum score can still block entries. This is incorrect because in accelerating trends, price leads momentum.

**File**: `supabase/functions/strategy-analyzer/index.ts`

**Current Logic** (around line 8004):
```text
IF earlyMomentumScore < effectiveMomentumThreshold:
    reject signal
```

**Proposed Logic**:
```text
// NEW: Accelerating trend exception
// If ADX is strong AND rising, allow reduced-size entry even with low momentum
acceleratingTrendException = (
    adx >= 30 AND
    adxSlopeForOverride > 0 AND
    !adxExhaustion.isExhausted AND
    !isReversalEntry
)

IF earlyMomentumScore < effectiveMomentumThreshold:
    IF acceleratingTrendException:
        // Allow with 70% position size instead of blocking
        acceleratingTrendPositionMultiplier = 0.70
        log "ACCELERATING TREND EXCEPTION: Allowing entry with reduced size"
        // Continue to next gate (don't reject)
    ELSE:
        reject signal
```

---

### 1.2 Add Momentum State to Threshold Adjustment (ISSUE 3)

**Problem**: The `momentumState` from the Momentum Status Details system is logged but not used to influence the threshold. This is a missed opportunity for tighter integration.

**File**: `supabase/functions/strategy-analyzer/index.ts`

**Location**: After line 7992 (after regime-aware threshold is calculated)

**Proposed Addition**:
```text
// ============= MOMENTUM STATE THRESHOLD ADJUSTMENT =============
// Tightly couple momentum state classification with gate threshold
// This ensures consistent behavior between Momentum Status Details UI and signal generation

const momentumStateForGate = momentum?.state || "none";
let stateAdjustedThreshold = effectiveMomentumThreshold;
let momentumStateAdjustmentApplied = false;

IF momentumStateForGate == "confirmed":
    // Confirmed momentum = strong follow-through, relax threshold by 1
    stateAdjustedThreshold = MAX(0, effectiveMomentumThreshold - 1)
    momentumStateAdjustmentApplied = true
    log "MOMENTUM STATE BONUS: state=confirmed, threshold reduced by 1"

ELSE IF momentumStateForGate == "exhausted":
    // Exhausted momentum = reversal risk, increase threshold by 1
    stateAdjustedThreshold = effectiveMomentumThreshold + 1
    momentumStateAdjustmentApplied = true
    log "MOMENTUM STATE PENALTY: state=exhausted, threshold increased by 1"

effectiveMomentumThreshold = stateAdjustedThreshold
```

**Also update rejection log** (line 8088-8116):
Add `momentumStateAdjustmentApplied` to the logged filters_status.

---

### 1.3 Strengthen Pullback ADX Guard (ISSUE 4)

**Problem**: The pullback threshold relaxation (5 → 3) applies before the ADX check, which can allow pullback logic in weak trends.

**File**: `supabase/functions/strategy-analyzer/index.ts`

**Current Logic** (line 7930-7932):
```text
let baseMomentumThreshold = isPullbackValid 
    ? PULLBACK_MIN_SCORE  // 3
    : MIN_SCORE;          // 5
```

**Problem**: `isPullbackValid` already checks `adx >= 22`, but the threshold is set based on `isPullbackSetupDetected` earlier.

**Proposed Fix**: Make the guard explicit in the threshold logic:
```text
// Only use pullback threshold if pullback is VALID (includes ADX check)
// AND ADX is genuinely in trending territory (>= 22)
let baseMomentumThreshold = (isPullbackValid AND adx >= PULLBACK_DETECTION_PARAMS.MIN_ADX)
    ? PULLBACK_MIN_SCORE  // 3
    : MIN_SCORE;          // 5
```

This is a defensive double-check that makes the logic more explicit and prevents future regressions.

---

## Phase 2: Medium Priority Enhancements

### 2.1 Graduated Position Multiplier Based on Threshold Distance (GAP 1)

**Problem**: Current position multipliers are fixed values (0.65, 0.80). A graduated approach based on how far the score is from the threshold would be more precise.

**File**: `supabase/functions/strategy-analyzer/index.ts`

**Location**: In the Strong ADX Override section (around line 8028)

**Proposed Logic**:
```text
// Calculate graduated position multiplier based on score deficit
const scoreDeficit = effectiveMomentumThreshold - earlyMomentumScore;
const graduatedMultiplier = clamp(0.5, 0.9, 1.0 - (scoreDeficit * 0.1));

// Apply the more conservative of graduated and tier-specific multiplier
strongAdxPositionMultiplier = MIN(graduatedMultiplier, tierSpecificMultiplier);
```

**Helper function to add**:
```text
function clamp(min: number, max: number, value: number): number {
    return Math.max(min, Math.min(max, value));
}
```

**Example outcomes**:
- Score deficit 1 → multiplier = 0.90
- Score deficit 2 → multiplier = 0.80
- Score deficit 3 → multiplier = 0.70
- Score deficit 5+ → multiplier = 0.50 (floor)

---

### 2.2 Document Threshold Adjustment Order (GAP 2)

**File**: `supabase/functions/_shared/constants.ts`

**Location**: After MOMENTUM_THRESHOLDS section (around line 1102)

**Proposed Addition**:
```text
// ============= MOMENTUM GATE THRESHOLD ADJUSTMENT ORDER =============
// CRITICAL: The order of threshold adjustments affects final behavior
// This order must be preserved in strategy-analyzer implementation:
//
// 1. BASE THRESHOLD
//    - Normal entries: MIN_SCORE (5)
//    - Valid pullbacks: PULLBACK_MIN_SCORE (3)
//
// 2. REGIME-AWARE ADJUSTMENT
//    - Very Strong ADX (>=35): threshold → 0
//    - Near Very Strong (33-35, slope >= -0.3): threshold → 1
//    - Strong ADX (>=30, rising): threshold → 2
//
// 3. MOMENTUM STATE ADJUSTMENT (NEW)
//    - confirmed: threshold -= 1
//    - exhausted: threshold += 1
//
// 4. STRONG ADX OVERRIDE
//    - If still failing threshold AND ADX qualifies: threshold → 0
//    - Position size reduced based on tier
//
// 5. ACCELERATING TREND EXCEPTION (NEW)
//    - If ADX >= 30 AND slope > 0: allow with 70% size
//
// Final threshold = result after all adjustments
// Rejection occurs if score < final threshold AND no exceptions apply
```

---

## Phase 3: UI Enhancements

### 3.1 Enhance HardGateMomentumScoreDisplay Component

**File**: `src/components/SignalRejectionReasons.tsx`

**Current Display**: Shows score, state, and ADX in a grid.

**Proposed Enhancements**:

1. **Show threshold adjustment breakdown**:
```text
<div className="space-y-1 text-[10px]">
    <div>Base threshold: {baseMomentumThreshold}</div>
    {regimeAwareApplied && (
        <div>→ Regime [{regimeAwareTier}]: {regimeAwareMomentumThreshold}</div>
    )}
    {momentumStateAdjustmentApplied && (
        <div>→ State [{momentumState}]: {stateAdjustedThreshold}</div>
    )}
    <div className="font-medium">Final required: {momentumRequired}</div>
</div>
```

2. **Show why override didn't apply**:
```text
{strongAdxOverrideAttempted && !strongAdxOverrideApplied && (
    <div className="text-[9px] text-yellow-400 mt-2">
        ⚠️ Strong ADX Override attempted but failed:
        {/* Show specific failure reasons */}
    </div>
)}
```

3. **Add tooltip explaining threshold tiers**:
```text
<TooltipContent>
    Threshold adjusts based on trend strength:
    • ADX ≥35: Threshold = 0 (very strong trend)
    • ADX 33-35: Threshold = 1 (near very strong)
    • ADX ≥30 rising: Threshold = 2 (strong trend)
    • Otherwise: Threshold = 5 (normal)
</TooltipContent>
```

---

## Files Modified Summary

| File | Changes |
|------|---------|
| `supabase/functions/strategy-analyzer/index.ts` | Add accelerating trend exception, momentum state adjustment, strengthen pullback guard, graduated multiplier |
| `supabase/functions/_shared/constants.ts` | Add threshold adjustment order documentation |
| `src/components/SignalRejectionReasons.tsx` | Enhanced HardGateMomentumScoreDisplay with adjustment breakdown |

---

## Implementation Sequence

```text
Phase 1 (Critical)
├── 1.1 Add accelerating trend exception (adxSlope > 0)
├── 1.2 Add momentum state threshold adjustment
└── 1.3 Strengthen pullback ADX guard

Phase 2 (Medium Priority)
├── 2.1 Implement graduated position multiplier
└── 2.2 Document threshold adjustment order

Phase 3 (UI)
└── 3.1 Enhance rejection display with adjustment breakdown
```

---

## Expected Outcomes

1. **Fewer missed entries in accelerating trends** - ADX slope now prevents blocking when trend is actively strengthening
2. **Tighter integration with Momentum Status Details** - `confirmed` state rewards, `exhausted` state penalizes
3. **Cleaner pullback logic** - Explicit ADX guard prevents weak-trend pullback entries
4. **More predictable position sizing** - Graduated multiplier based on threshold distance
5. **Better debuggability** - UI shows full threshold adjustment chain

---

## Technical Notes

### Clamp Function
A utility `clamp` function should be added to the shared utilities if not already present:
```typescript
export function clamp(min: number, max: number, value: number): number {
    return Math.max(min, Math.min(max, value));
}
```

### Logging Enhancement
All new logic paths should use the existing `Logger` infrastructure with appropriate categories (`LOG_CATEGORIES.MOMENTUM`, `LOG_CATEGORIES.GATE`).

### Backward Compatibility
All changes are additive - existing behavior is preserved unless the new conditions trigger. No breaking changes to existing signal generation.
