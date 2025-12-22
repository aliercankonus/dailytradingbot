# Signal Generation Improvements Summary

## Overview

This document summarizes the critical improvements made to the signal generation pipeline in the `strategy-analyzer` edge function. These changes address 5 key findings from the signal generation audit.

---

## Phase 1: High Priority Fixes

### 1.1 Explicit Direction Derivation

**Problem:** Direction was implicitly assumed from trend but not formally defined, leading to inconsistent long/short evaluation and silent logic bugs.

**Solution:** Added `deriveTradeDirection()` function that explicitly determines trade direction early in the pipeline.

**Location:** `supabase/functions/_shared/scoring.ts`

**How it works:**
- Analyzes multi-timeframe trends (4h, 1h, 30m)
- Returns `"long" | "short" | null` with confidence score
- Called early after `trendData` extraction
- Rejects with `NO_CLEAR_DIRECTION` if no clear direction found

**Expected Impact:**
- Eliminates ambiguous signal generation
- Prevents conflicting long/short signals in mixed trends
- Improves signal quality by requiring directional clarity

---

### 1.2 Squeeze Breakout Exception for ADX Gate

**Problem:** ADX < 20 hard block killed valid compression → expansion transitions (squeeze breakouts).

**Solution:** Added `isValidSqueezeBreakout()` function that allows entries when ADX is 18-20 under strict conditions.

**Location:** `supabase/functions/_shared/scoring.ts`

**Squeeze breakout conditions (ALL must be met):**
- HTF Bollinger squeeze active (4h preferred, 1h acceptable)
- Price at band edge (percentB > 70 for long, < 30 for short)
- Momentum building (MACD expanding OR StochRSI moving in trade direction)
- No reversal divergence
- HTF trend not opposing

**Position sizing:**
- Valid squeeze breakouts get **65% position size** (reduced risk for these entries)

**New rejection reasons:**
- `ADX_TOO_LOW_NO_SQUEEZE` - ADX 18-20 but no valid squeeze
- `ADX_TOO_LOW` - ADX < 18 (hard block, no exceptions)

**Expected Impact:**
- Captures high-EV squeeze breakout trades previously missed
- Maintains discipline with strict validation
- Reduced position size manages risk appropriately

---

## Phase 2: Medium Priority Fixes

### 2.1 Reduced Double-Counting in Reversal/Divergence Gates

**Problem:** MACD divergence was penalized in both the Unified Reversal Score (URS) AND as a separate hard gate, causing over-filtering of strong trends.

**Solution:** Skip the MACD divergence hard gate if URS score ≥ 50 (already heavily penalized).

**Location:** `supabase/functions/strategy-analyzer/index.ts`

**Logic:**
```
IF unifiedReversalScore >= 50 THEN
    SKIP divergence hard gate (already penalized in URS)
ELSE
    APPLY divergence hard gate normally
```

**Logging:** Added `"MACD divergence gate skipped (URS=${score} >= 50)"` for monitoring

**Expected Impact:**
- Prevents over-filtering of valid trend continuation signals
- Makes reversal scoring orthogonal (URS handles multi-signal pressure)
- Reduces false rejections during strong trends

---

### 2.2 Momentum Directional Symmetry Check

**Problem:** Momentum gate checked for "none" or "mixed" state but didn't verify directional agreement with trade side.

**Solution:** Added hard gate that rejects when momentum direction opposes trade direction.

**Location:** `supabase/functions/strategy-analyzer/index.ts`

**Logic:**
```
IF momentum.direction != derivedDirection THEN
    IF macdHistogramAbs >= 0.0001 AND adx < EXCEPTIONAL THEN
        REJECT with "MOMENTUM_DIRECTION_OPPOSING"
```

**Exceptions (no rejection):**
- Very weak momentum (MACD histogram < 0.0001)
- Exceptional ADX (≥ 35) - strong trend overrides

**Expected Impact:**
- Prevents long entries on bearish momentum acceleration
- Prevents short entries during bullish impulse
- Improves signal-to-noise ratio

---

## Phase 3: Lower Priority Enhancement

### 3.1 Enhanced Entry Timing Weighting

**Problem:** `entryTimingScore` was only used inside `qualityScore`, allowing structurally poor entries if other scores compensated.

**Solution:** Instead of adding a hard gate (which could over-filter), enhanced the weighting of entry timing in low-ADX environments.

**Location:** 
- `supabase/functions/_shared/constants.ts` - Added `ENTRY_TIMING_PARAMS`
- `supabase/functions/strategy-analyzer/index.ts` - Applied dynamic weighting

**Configuration:**
```typescript
ENTRY_TIMING_PARAMS = {
  BASE_MAX: 25,           // Standard max score
  ENHANCED_MAX: 30,       // Enhanced max when ADX < 30
  ENHANCE_BELOW_ADX: 30,  // Threshold for enhancement
  WARNING_THRESHOLD: 8,   // Log warning below this
  CRITICAL_THRESHOLD: 4,  // Log critical below this
}
```

**How it works:**
- When ADX < 30: Entry timing score scaled by 1.2× (25→30 max)
- This makes timing matter MORE when trend strength is weaker
- Poor entry timing logged with WARNING/CRITICAL severity

**Logging examples:**
```
[ENTRY_TIMING] Enhanced weighting: ADX=24.5 < 30 → score 18→22 (×1.20)
[ENTRY_TIMING] WARNING: entryTimingScore=6 < 8 | reason: Neutral entry: RSI in middle zone
[ENTRY_TIMING] CRITICAL: entryTimingScore=2 < 8 | reason: Avoid: Overbought in weak trend
```

**Expected Impact:**
- Better entries in ranging/weak trend environments
- Early warning system for poor timing patterns
- Maintains flexibility (no hard rejection)

---

## Files Modified

| File | Changes |
|------|---------|
| `supabase/functions/_shared/constants.ts` | Added `ADX_THRESHOLDS.SQUEEZE_MINIMUM`, `ENTRY_TIMING_PARAMS` |
| `supabase/functions/_shared/scoring.ts` | Added `isValidSqueezeBreakout()`, `deriveTradeDirection()` |
| `supabase/functions/strategy-analyzer/index.ts` | Integrated all Phase 1-3 changes |

---

## New Rejection Reasons

| Reason | Phase | Description |
|--------|-------|-------------|
| `NO_CLEAR_DIRECTION` | 1 | Multi-timeframe trends don't agree on direction |
| `ADX_TOO_LOW_NO_SQUEEZE` | 1 | ADX 18-20 but no valid squeeze breakout |
| `ADX_TOO_LOW` | 1 | ADX < 18, hard block |
| `MOMENTUM_DIRECTION_OPPOSING` | 2 | Momentum direction opposes trade direction |

---

## Monitoring Recommendations

1. **Query rejection logs** for new rejection reasons to verify they're working:
   ```sql
   SELECT rejection_reason, COUNT(*) 
   FROM signal_rejection_log 
   WHERE rejection_reason LIKE '%DIRECTION%' 
      OR rejection_reason LIKE '%SQUEEZE%'
      OR rejection_reason LIKE '%MOMENTUM%'
   GROUP BY rejection_reason
   ORDER BY COUNT(*) DESC;
   ```

2. **Check edge function logs** for:
   - `[ENTRY_TIMING]` - Enhanced weighting and warnings
   - `MACD divergence gate skipped` - URS override working
   - `SQUEEZE BREAKOUT ALLOWED` - Valid squeeze entries

3. **Track win rates** for:
   - Squeeze breakout entries vs normal entries
   - Signals that passed vs skipped divergence gate

---

## Summary

| Phase | Fix | Priority | Risk Reduction |
|-------|-----|----------|----------------|
| 1.1 | Explicit direction | High | Eliminates ambiguous signals |
| 1.2 | Squeeze exception | High | Captures high-EV breakouts |
| 2.1 | URS/divergence dedup | Medium | Reduces over-filtering |
| 2.2 | Momentum symmetry | Medium | Prevents counter-momentum entries |
| 3.1 | Entry timing weight | Lower | Improves weak-trend entries |

**Total new lines of code:** ~250  
**Edge functions redeployed:** `strategy-analyzer`  
**Breaking changes:** None (additive improvements)
