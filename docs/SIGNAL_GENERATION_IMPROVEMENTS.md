# Signal Generation & Trade Execution Improvements

## Overview

This document summarizes the critical improvements made to both the signal generation pipeline (`strategy-analyzer`) and trade execution flow (`execute-trade`). These changes address findings from comprehensive audits of both systems.

---

# Part 1: Signal Generation Improvements

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

# Part 2: Trade Execution Improvements

## Phase 1: Security Critical Fixes

### 1.1 Signal Expiry Enforcement

**Problem:** Signals have `expires_at` (15 minutes) but execution never checked it, allowing stale signals to execute after market conditions changed.

**Solution:** Added expiry check immediately after signal fetch, before any heavy computation.

**Location:** `supabase/functions/execute-trade/index.ts` (lines ~290-310)

**Implementation:**
```typescript
if (signal.expires_at) {
  const expiryTime = new Date(signal.expires_at).getTime();
  const now = Date.now();
  if (now > expiryTime) {
    const expiredAgo = Math.round((now - expiryTime) / 1000 / 60);
    throw new Error(`Signal expired ${expiredAgo} minutes ago`);
  }
}
```

**Logging:** Logs expiry rejections to `signal_rejection_log` with reason `SIGNAL_EXPIRED`

**Expected Impact:**
- Prevents execution during regime changes
- Avoids stale entries during news spikes
- Reduces risk from delayed signal processing

---

### 1.2 Signal Ownership Validation

**Problem:** Service role key bypasses RLS, allowing potential cross-user signal execution.

**Solution:** Added explicit ownership check after signal fetch.

**Location:** `supabase/functions/execute-trade/index.ts` (lines ~315-330)

**Implementation:**
```typescript
if (signal.user_id !== user.id) {
  logger.error(`SECURITY: User ${user.id} attempted to execute signal owned by ${signal.user_id}`);
  throw new Error('Unauthorized: Signal does not belong to this user');
}
```

**Logging:** Logs security violations with reason `UNAUTHORIZED_SIGNAL`

**Expected Impact:**
- Prevents cross-user execution attacks
- Blocks privilege escalation attempts
- Ensures compliance with data isolation

---

## Phase 2: Risk Management Fixes

### 2.1 Confidence-Weighted Trend Validation

**Problem:** Binary trend mismatch check (bullish + SHORT = reject) blocked valid pullbacks and late breakouts.

**Solution:** Replace binary rejection with confidence-weighted logic.

**Location:** 
- `supabase/functions/_shared/constants.ts` - Added `TREND_VALIDATION_PARAMS`
- `supabase/functions/execute-trade/index.ts` (lines ~432-475)

**Configuration:**
```typescript
TREND_VALIDATION_PARAMS = {
  STRICT_CONFIDENCE_THRESHOLD: 70,        // Above this = strict enforcement
  COUNTER_TREND_POSITION_MULTIPLIER: 0.6, // 60% size for allowed counter-trend
}
```

**Logic:**
```
IF trend_mismatch THEN
    IF trendConfidence >= 70% THEN
        REJECT (high confidence trend = strict enforcement)
    ELSE
        ALLOW with 60% position size (possible pullback/reversal)
```

**Logging:** Counter-trend entries logged with `COUNTER-TREND ENTRY` warning

**Expected Impact:**
- Preserves discipline in strong trends
- Allows valid pullback entries in weak/uncertain trends
- Reduced position size manages counter-trend risk

---

### 2.2 Single Source of Truth for Reversal Sizing

**Problem:** Reversal risk was double-counted:
- Signal generation applied `reversalPositionMultiplier` to `positionSizePercent`
- Execution also applied `reversalPositionMultiplier` from `calculateUnifiedReversalScore`

**Solution:** Use ONLY execution-time reversal multiplier (more current market data).

**Location:** `supabase/functions/execute-trade/index.ts` (lines ~1334-1360)

**Implementation:**
```typescript
// Log both for transparency
if (signalReversalMultiplier !== 1.0 && reversalPositionMultiplier !== 1.0) {
  logger.warn(`Signal embedded ${signalReversalMultiplier}x, Execution-time ${reversalPositionMultiplier}x`);
  logger.warn(`Using ONLY execution-time multiplier to avoid double-counting`);
}

// Apply only execution-time multiplier
quantity *= reversalPositionMultiplier;
```

**Expected Impact:**
- Prevents over-shrinking position sizes
- Maximizes edge utilization
- Uses most current market conditions for sizing

---

## Phase 3: Robustness Fixes

### 3.1 Absolute Correlation Cap

**Problem:** Correlation adjustment had no floor, allowing "small" correlated positions to accumulate excessive risk.

**Solution:** Added portfolio-level correlation exposure cap.

**Location:**
- `supabase/functions/_shared/constants.ts` - Extended `CORRELATION_PARAMS`
- `supabase/functions/execute-trade/index.ts` (lines ~385-460)

**Configuration:**
```typescript
CORRELATION_PARAMS = {
  MAX_THRESHOLD: 0.75,                    // Per-pair correlation threshold
  MAX_SAME_DIRECTION: 2,                  // Max correlated positions same direction
  SIZE_REDUCTION_THRESHOLD: 30,           // Risk score for size reduction
  MAX_CORRELATED_EXPOSURE_PERCENT: 5.0,   // NEW: Absolute portfolio cap
  MIN_POSITION_SIZE_FLOOR: 0.5,           // NEW: Minimum 50% of intended size
}
```

**Logic:**
1. Check per-pair correlation using `checkPositionCorrelation()`
2. Calculate total correlated exposure as % of portfolio
3. Block if exposure ≥ 5%

**New rejection reasons:**
- `CORRELATION_BLOCK` - Too many correlated positions in same direction
- `CORRELATED_EXPOSURE_CAP` - Portfolio correlation exposure exceeds 5%

**Expected Impact:**
- Prevents silent risk accumulation
- Hard cap on correlated portfolio exposure
- Maintains diversification discipline

---

### 3.2 Partial Fill Handling with Retry Logic

**Problem:** Order execution assumed success, missing:
- Partial fills
- Transient API errors
- Status validation

**Solution:** Added comprehensive order handling with retry and reconciliation.

**Location:**
- `supabase/functions/_shared/constants.ts` - Added `ORDER_EXECUTION_PARAMS`
- `supabase/functions/execute-trade/index.ts` (lines ~1508-1650)

**Configuration:**
```typescript
ORDER_EXECUTION_PARAMS = {
  MAX_RETRIES: 2,                                    // Bounded retries
  RETRY_DELAY_MS: 500,                               // Delay between retries
  TRANSIENT_ERROR_CODES: [-1001, -1003, -1015, -1021], // Timeout, rate limit, etc.
  MIN_FILL_RATIO: 0.8,                               // Minimum 80% fill to accept
}
```

**Features:**
1. **Retry logic:** Up to 2 retries for transient errors (timeout, rate limit)
2. **Status checking:** Explicit handling for REJECTED, EXPIRED, CANCELED, PARTIALLY_FILLED
3. **Partial fill reconciliation:**
   - If fill ratio ≥ 80%: Accept and adjust quantity
   - If fill ratio < 80%: Cancel remaining, abort trade
4. **Weighted price calculation:** Average fill price for multi-fill orders

**Logging:**
```
⚠️ Transient error (code -1001), retrying 1/2...
⚠️ PARTIAL FILL: 0.85/1.0 (85% filled)
✓ Accepting partial fill - adjusted quantity to 0.85
```

**Expected Impact:**
- Resilience to API hiccups
- Accurate position quantity tracking
- Prevents phantom positions from failed orders

---

# Summary Tables

## Files Modified

| File | Signal Gen | Trade Exec |
|------|-----------|------------|
| `supabase/functions/_shared/constants.ts` | `ENTRY_TIMING_PARAMS`, `ADX_THRESHOLDS.SQUEEZE_MINIMUM` | `TREND_VALIDATION_PARAMS`, `CORRELATION_PARAMS` extended, `ORDER_EXECUTION_PARAMS` |
| `supabase/functions/_shared/scoring.ts` | `isValidSqueezeBreakout()`, `deriveTradeDirection()` | - |
| `supabase/functions/_shared/correlation.ts` | - | Used for correlation checks |
| `supabase/functions/strategy-analyzer/index.ts` | Phases 1-3 integrated | - |
| `supabase/functions/execute-trade/index.ts` | - | Phases 1-3 integrated |

## New Rejection Reasons

| Reason | System | Phase | Description |
|--------|--------|-------|-------------|
| `NO_CLEAR_DIRECTION` | Signal Gen | 1 | Multi-timeframe trends don't agree |
| `ADX_TOO_LOW_NO_SQUEEZE` | Signal Gen | 1 | ADX 18-20 but no valid squeeze |
| `ADX_TOO_LOW` | Signal Gen | 1 | ADX < 18, hard block |
| `MOMENTUM_DIRECTION_OPPOSING` | Signal Gen | 2 | Momentum opposes trade direction |
| `SIGNAL_EXPIRED` | Trade Exec | 1 | Signal past expiry time |
| `UNAUTHORIZED_SIGNAL` | Trade Exec | 1 | Signal ownership mismatch |
| `CORRELATION_BLOCK` | Trade Exec | 3 | Too many correlated positions |
| `CORRELATED_EXPOSURE_CAP` | Trade Exec | 3 | Portfolio correlation > 5% |

## Monitoring Recommendations

### Signal Generation
```sql
SELECT rejection_reason, COUNT(*) 
FROM signal_rejection_log 
WHERE rejection_reason LIKE '%DIRECTION%' 
   OR rejection_reason LIKE '%SQUEEZE%'
   OR rejection_reason LIKE '%MOMENTUM%'
GROUP BY rejection_reason;
```

### Trade Execution
```sql
SELECT rejection_reason, COUNT(*) 
FROM signal_rejection_log 
WHERE rejection_reason LIKE 'EXECUTION:%'
   AND (rejection_reason LIKE '%EXPIRED%' 
     OR rejection_reason LIKE '%CORRELATION%'
     OR rejection_reason LIKE '%UNAUTHORIZED%')
GROUP BY rejection_reason;
```

### Edge Function Logs to Monitor
- `[ENTRY_TIMING]` - Enhanced weighting and warnings
- `SQUEEZE BREAKOUT ALLOWED` - Valid squeeze entries
- `COUNTER-TREND ENTRY` - Allowed counter-trend trades
- `Transient error...retrying` - Order retry events
- `PARTIAL FILL` - Partial fill handling

---

## Impact Summary

| Phase | System | Fix | Risk Reduction |
|-------|--------|-----|----------------|
| 1.1 | Signal | Explicit direction | Eliminates ambiguous signals |
| 1.2 | Signal | Squeeze exception | Captures high-EV breakouts |
| 2.1 | Signal | URS/divergence dedup | Reduces over-filtering |
| 2.2 | Signal | Momentum symmetry | Prevents counter-momentum entries |
| 3.1 | Signal | Entry timing weight | Improves weak-trend entries |
| 1.1 | Exec | Signal expiry | Prevents stale executions |
| 1.2 | Exec | Ownership validation | Security - prevents cross-user |
| 2.1 | Exec | Confidence-weighted trend | Allows valid pullbacks |
| 2.2 | Exec | Reversal sizing fix | Prevents double-counting |
| 3.1 | Exec | Correlation cap | Limits portfolio correlation |
| 3.2 | Exec | Partial fill handling | Resilient order execution |

**Total improvements:** 11 fixes across 2 systems  
**Edge functions redeployed:** `strategy-analyzer`, `execute-trade`  
**Breaking changes:** None (additive improvements)
