

# Implementation Plan: NO_MOMENTUM_CONFIRMATION Gate Improvements

## Problem Summary

The expert review identified three critical issues in the NO_MOMENTUM_CONFIRMATION hard gate:

1. **Path Priority Leakage** - Path 2 (`momentumState != "none"`) passes too easily without ADX floor
2. **Direction Derivation Inside the Gate** - Paths 5A/5B derive and return direction, conflicting with centralized `deriveTradeDirection()`
3. **Exception Stacking Risk** - Multiple weak justifications can stack to allow entries

---

## Phase 1: Path Priority Fix (ADX Floor for State Presence)

### Current Behavior
```
IF momentumState != "none":
    RETURN PASS  // No ADX check!
```

Path 2 immediately passes when `momentumState` is "building" or "mixed", even if:
- ADX is critically weak (< 18)
- HTF is opposing
- Momentum is actually decaying

### Proposed Fix

Add minimum ADX floor to Path 2:

```
// Path 2: State Presence - requires ADX floor
IF momentumState != "none" AND adx >= ADX_THRESHOLDS.MINIMUM:
    RETURN PASS
// Continue to Path 3+ if ADX below minimum
```

**Files to modify:**
- `supabase/functions/strategy-analyzer/index.ts` (line ~7793)

**Changes:**
1. Add ADX check to state presence condition
2. Log when Path 2 is skipped due to low ADX
3. Update rejection diagnostics to show Path 2 failure reason

**Position Sizing:**
- No change (still 100% when state presence + ADX floor passes)

---

## Phase 2: Refactor Direction Derivation (Validate, Don't Originate)

### Current Problem

Paths 5A (Pre-Momentum StochRSI) and 5B (Short-Term Alignment) return direction:
```typescript
preMomentumDirection = "short";
// This direction can conflict with deriveTradeDirection()
```

This gate should **validate** momentum presence, not **originate** trade direction.

### Proposed Refactor

Change paths 5A/5B to return **directional bias** instead of **direction override**:

```typescript
// Before: Returns direction
RETURN PASS with direction="short", positionMultiplier

// After: Returns validation result with bias
RETURN { 
  passes: true, 
  directionBias: "bearish",  // Suggestion, not override
  positionMultiplier: 0.50,
  source: "PRE_MOMENTUM_STOCHRSI"
}
```

**Files to modify:**
- `supabase/functions/strategy-analyzer/index.ts` (lines ~2740-2823)

**Changes:**
1. Refactor `preMomentumStochRsiOverrideApplied` to set a `premiumOverrideBias` flag
2. Pass bias to centralized `deriveTradeDirection()` as weighted input
3. `deriveTradeDirection()` uses bias as tie-breaker, not override
4. If derived direction conflicts with bias, log warning and reduce position size

**Integration with deriveTradeDirection():**
```typescript
// In deriveTradeDirection:
if (premiumOverrideBias && premiumOverrideBias !== derivedDirection) {
  logger.warn("Direction conflict: premium bias suggests ${premiumOverrideBias} but HTF derives ${derivedDirection}");
  positionMultiplier *= 0.7;  // Reduce confidence
}
```

---

## Phase 3: Exception Budget Integration (Stacking Prevention)

### Current Problem

The gate allows multiple weak exceptions to stack:
- Reduced ADX threshold via StochRSI alignment
- Acceleration bypass
- Pre-momentum override
- Short-term alignment override

Each individually weak justification can collectively allow entries.

### Proposed Fix

Implement `maxExceptionDepth = 1` for this gate's internal paths:

```typescript
// Track which exception path was used
let noMomentumExceptionUsed: "STOCHRSI_ADX_ALIGNMENT" | "TREND_ACCELERATION" | "PRE_MOMENTUM" | "SHORT_TERM_ALIGNMENT" | null = null;

// Once an exception is used, block additional exceptions
if (noMomentumExceptionUsed !== null && currentPath !== noMomentumExceptionUsed) {
  logger.info("Exception already used: ${noMomentumExceptionUsed}, skipping ${currentPath}");
  continue;  // Skip this exception path
}
```

**Files to modify:**
- `supabase/functions/strategy-analyzer/index.ts`
- `supabase/functions/_shared/constants.ts`

**New Constant:**
```typescript
// In constants.ts
export const NO_MOMENTUM_GATE_PARAMS = {
  // Maximum exception paths that can be combined
  MAX_EXCEPTION_DEPTH: 1,
  
  // Minimum ADX floor for Path 2 (state presence)
  STATE_PRESENCE_MIN_ADX: 20,  // ADX_THRESHOLDS.MINIMUM
  
  // Enable/disable individual paths
  ENABLE_PATH_2_ADX_FLOOR: true,
  ENABLE_EXCEPTION_BUDGET: true,
};
```

**Behavior:**
1. First exception path that qualifies is used
2. Subsequent paths are skipped (logged but not applied)
3. Position size from first exception is used
4. `exceptionType` logged for downstream monitoring

---

## Phase 4: Documentation Update

Update `docs/gates/NO_MOMENTUM_CONFIRMATION.md` with:

1. **ADX Floor Clarification:**
   - Path 2 now requires `ADX >= 20`
   - Document why (prevents "building" momentum in dead markets)

2. **Direction Derivation Model:**
   - Clarify that this gate validates, does not originate
   - Document `directionBias` vs `direction` distinction

3. **Exception Budget Section:**
   - Add section on `MAX_EXCEPTION_DEPTH = 1`
   - Document exception priority order

4. **Updated Decision Matrix:**
   | Path | Condition | ADX Floor | Position Size |
   |------|-----------|-----------|---------------|
   | Standard Confirmation | `momentumConfirms == true` | None | 100% |
   | State Presence | `momentumState != "none"` | >= 20 | 100% |
   | Strong Trend Exception | `adx >= 28` (or 22 if aligned) | Built-in | 100% |
   | Trend Acceleration | Price move + ADX rising | >= 20 | 70% |
   | Pre-Momentum StochRSI | Deep extreme + 1h directional | >= 18 | 50-60% |
   | Short-Term Alignment | 1h+30m+micro agree | >= 18 | 55% |

---

## Implementation Order

1. **Phase 1** - Add ADX floor to Path 2 (lowest risk, immediate improvement)
2. **Phase 3** - Implement exception budget (prevents stacking)
3. **Phase 2** - Refactor direction derivation (more complex, needs careful testing)
4. **Phase 4** - Update documentation

---

## Testing Strategy

1. **Regression Test:** Run strategy-analyzer on recent signals to verify:
   - "building" momentum with ADX < 20 now blocked
   - Existing valid signals still pass

2. **Exception Budget Test:** Simulate scenarios where multiple exceptions would apply:
   - Verify only first exception is used
   - Verify position size from first exception applies

3. **Direction Conflict Test:** Trigger pre-momentum override with opposing HTF:
   - Verify warning logged
   - Verify position reduction applied

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

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/strategy-analyzer/index.ts` | ADX floor, exception budget, direction bias refactor |
| `supabase/functions/_shared/constants.ts` | New `NO_MOMENTUM_GATE_PARAMS` constant |
| `docs/gates/NO_MOMENTUM_CONFIRMATION.md` | Updated documentation |

---

## Technical Details

### Path 2 ADX Floor Implementation
```typescript
// Line ~7793 in strategy-analyzer/index.ts
const statePresencePassesWithFloor = 
  (momentumState !== "none") && 
  (adx >= ADX_THRESHOLDS.MINIMUM);  // NEW: ADX floor

const momentumPasses = 
  momentumConfirms || 
  statePresencePassesWithFloor ||  // UPDATED: With floor
  isStrongTrendException || 
  qualifiesForTrendAcceleration || 
  hasPremiumOverride;
```

### Exception Budget Implementation
```typescript
// Track exception usage
let noMomentumExceptionPath: string | null = null;
let noMomentumExceptionMultiplier = 1.0;

// In Path 3 (Strong Trend Exception):
if (isStrongTrendException && !noMomentumExceptionPath) {
  noMomentumExceptionPath = "STRONG_TREND";
  // ... existing logic
}

// In Path 4 (Trend Acceleration):
if (qualifiesForTrendAcceleration && !noMomentumExceptionPath) {
  noMomentumExceptionPath = "TREND_ACCELERATION";
  noMomentumExceptionMultiplier = 0.70;
  // ... existing logic
} else if (qualifiesForTrendAcceleration && noMomentumExceptionPath) {
  logger.info(`Skipping TREND_ACCELERATION - ${noMomentumExceptionPath} already applied`);
}
```

### Direction Bias Refactor
```typescript
// Before (current):
preMomentumDirection = "short";
preMomentumStochRsiOverrideApplied = true;

// After (proposed):
premiumOverrideBias = "bearish";  // Not "short" - this is a bias, not direction
premiumOverrideSource = "PRE_MOMENTUM_STOCHRSI";
premiumOverrideApplied = true;

// In direction resolution:
if (premiumOverrideBias && !directionResult.direction) {
  // Use bias to inform direction derivation, not override it
  directionResult = deriveTradeDirection({
    ...inputs,
    biasHint: premiumOverrideBias,
    biasSource: premiumOverrideSource
  });
}
```

