
# Counter-Trend Admission Layer Refactor

## Summary

Refactor the existing `mean-reversion.ts` module into a unified **Counter-Trend Admission Controller** - the single authority for allowing opposite-direction (reversal) entries. This eliminates the architectural risk of adding a standalone EXHAUSTION_GATE while preserving the original design intent.

---

## Architectural Rationale

### Why NOT a Standalone Gate

| Issue | Impact |
|-------|--------|
| **Dual Authority** | `mean-reversion.ts` already has `checkOversoldExhaustion()` and `checkOverboughtExhaustion()` doing exhaustion detection |
| **70-80% Logic Overlap** | ADX slope decay, momentum decay, StochRSI de-peg, reduced sizing already exist |
| **Gate Hierarchy Inflation** | Adding Tier 1.5 blurs responsibility and increases cognitive load |
| **Configuration Divergence** | Two systems deciding exhaustion = impossible forensics |

### The Real Problem

Mean reversion is acting like a strategy, but it is functionally an **admission controller** for counter-trend trades. This is a semantic mismatch, not a missing gate.

---

## Refactor Plan

### Phase 1: Rename and Restructure Conceptually

**File**: `supabase/functions/_shared/mean-reversion.ts`

- Keep the file name for now (less churn), but add header documentation clarifying its role as "Counter-Trend Admission Layer"
- Internal function naming stays the same for backwards compatibility
- Export a new unified function: `evaluateCounterTrendAdmission(trendData, derivedDirection)`

### Phase 2: Add Missing Features Directly

Extend the existing exhaustion checks with the 3 missing conditions from the EXHAUSTION_GATE spec:

#### 2.1 ADX Slope Persistence (N Candles)

**Current State**: ADX slope is checked instantaneously
**Gap**: No consecutive candle tracking

**Implementation**:
```
ADX < MAX_ADX_FOR_EXHAUSTION (45)
AND ADX_SLOPE <= 0
FOR >= 2 consecutive periods
```

- Add `adxSlopePersistence: number` to track consecutive negative/flat slope periods
- Use existing `adxArray` from `calculateADX()` to derive historical slopes
- New config: `MIN_ADX_SLOPE_PERSISTENCE_CANDLES: 2`

#### 2.2 Volatility Contraction Check

**Current State**: Volume exhaustion is checked (`volumeRatio < 0.8`)
**Gap**: BB width / ATR contraction not tracked

**Implementation**:
```
Bollinger Band width declining
OR ATR flat/declining
OR No new range expansion in last N candles
```

- Add check for `bbWidthPercentile < prevBbWidthPercentile` (distribution -> balance transition)
- Add check for ATR plateau: `|atrChange| < 0.5%` over last 3 candles
- This confirms impulse is dying, not just oscillators resetting

#### 2.3 LTF Structure Flip (Optional Confirmation)

**Current State**: Not implemented
**Gap**: No higher-high/lower-low detection for counter-trend entry timing

**Implementation** (as soft confirmation, not hard gate):
```
For LONG: 15m or 30m shows Higher Low + Higher High
For SHORT: 15m or 30m shows Lower High + Lower Low
```

- Add `ltfStructureFlip: boolean` and `ltfStructureScore: number` to ExhaustionSignal
- Bonus confidence (+10 points) when LTF structure confirms, but not required
- Prevents knife-catching without being overly restrictive

---

### Phase 3: Strengthen the Admission Decision Flow

Update `detectExhaustion()` to enforce the unified flow:

```text
[Direction Derived]
      |
      v
[Is Counter-Trend?] -- NO --> [Normal signal flow]
      |
      YES
      v
[Counter-Trend Admission (existing MR logic)]
      |
      +-- FAIL --> Block + log exhaustion failure reason
      |
      +-- PASS
             v
     [Generate reversal signal @ 0.25x probe size]
```

Key changes:
- Explicit `isCounterTrend` check at entry
- Single unified path for all counter-trend entries
- Clear failure reasons: `ADX_STILL_EXPANDING`, `MOMENTUM_NOT_DECAYING`, `VOLATILITY_EXPANDING`, `STOCHRSI_STILL_PEGGED`

---

### Phase 4: Mutual Exclusivity by Flow

Ensure `STRONG_TREND_TIER0_OVERRIDE` (continuation) and Counter-Trend Admission (reversal) cannot both fire:

**Enforcement**:
```typescript
// In strategy-analyzer direction derivation
if (strongTrendTier0OverrideApplied) {
  // Continuation mode - skip counter-trend admission entirely
  skipCounterTrendAdmission = true;
}
```

This is enforced by **flow**, not by dual flags.

---

## Configuration Updates

**File**: `supabase/functions/_shared/constants.ts`

Add to existing `MEAN_REVERSION_CONFIG`:

```typescript
COUNTER_TREND_ADMISSION: {
  // ADX Exhaustion Requirements
  MAX_ADX_FOR_EXHAUSTION: 45,
  MAX_ADX_SLOPE: 0.0,           // -0.5 for strong exhaustion
  MIN_ADX_SLOPE_PERSISTENCE: 2, // Consecutive candles
  
  // Volatility Contraction Requirements  
  REQUIRE_VOLATILITY_CONTRACTION: true,
  BB_WIDTH_DECLINE_MIN_PERCENT: 5,
  ATR_CHANGE_FLAT_THRESHOLD: 0.5,
  
  // LTF Structure (optional bonus)
  LTF_STRUCTURE_BONUS: 10,
  
  // Position Sizing
  PROBE_POSITION_MULTIPLIER: 0.25,
  
  // Failure Logging
  LOG_FAILURE_REASONS: true,
}
```

---

## Failure Reason Logging (Explicit)

The admission layer must log exact failure cause for forensics:

| Code | Meaning |
|------|---------|
| `ADX_STILL_EXPANDING` | ADX slope > 0, trend energy not decaying |
| `ADX_NOT_EXHAUSTED` | ADX >= 45, still in dominant trend |
| `MOMENTUM_NOT_DECAYING` | Momentum magnitude not decreasing |
| `VOLATILITY_EXPANDING` | BB width or ATR still increasing |
| `STOCHRSI_STILL_PEGGED` | K stuck at extreme (< 5 or > 95) |
| `LTF_NO_STRUCTURE_FLIP` | Lower timeframe shows no reversal structure |

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/_shared/mean-reversion.ts` | Add ADX persistence tracking, volatility contraction check, LTF structure bonus, unified `evaluateCounterTrendAdmission()` export |
| `supabase/functions/_shared/constants.ts` | Add `COUNTER_TREND_ADMISSION` config block |
| `supabase/functions/strategy-analyzer/index.ts` | Wire up unified counter-trend admission check, enforce mutual exclusivity with Strong Trend Override |

---

## Technical Details

### ADX Slope Persistence Implementation

```typescript
function checkAdxSlopePersistence(adxArray: number[], requiredCandles: number): number {
  if (adxArray.length < requiredCandles + 1) return 0;
  
  let consecutiveNonPositive = 0;
  for (let i = adxArray.length - 1; i > 0 && consecutiveNonPositive < requiredCandles + 1; i--) {
    const slope = (adxArray[i] - adxArray[i - 1]);
    if (slope <= 0) {
      consecutiveNonPositive++;
    } else {
      break; // Streak broken
    }
  }
  return consecutiveNonPositive;
}
```

### Volatility Contraction Check

```typescript
function checkVolatilityContracting(
  currentBbWidth: number, 
  prevBbWidth: number,
  currentAtr: number,
  prevAtr: number
): { contracting: boolean; reason: string } {
  const bbContracting = prevBbWidth > 0 && 
    ((prevBbWidth - currentBbWidth) / prevBbWidth) * 100 >= 5;
  const atrFlat = prevAtr > 0 && 
    Math.abs((currentAtr - prevAtr) / prevAtr) * 100 < 0.5;
  
  if (bbContracting) return { contracting: true, reason: 'BB_WIDTH_DECLINING' };
  if (atrFlat) return { contracting: true, reason: 'ATR_FLAT' };
  return { contracting: false, reason: 'VOLATILITY_EXPANDING' };
}
```

---

## Expected Outcome

| Metric | Before | After |
|--------|--------|-------|
| Counter-trend admission sources | 2 (MR + potential gate) | 1 (unified) |
| ADX persistence tracking | Instantaneous only | 2+ candle confirmation |
| Volatility contraction check | None | BB width + ATR |
| LTF structure confirmation | None | Optional bonus |
| Forensic clarity | Partial | Full failure reason logging |
