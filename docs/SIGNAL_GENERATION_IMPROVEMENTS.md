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

# Part 3: Signal Rejection Improvements

## Phase 1: ADX State Machine, Breakout Mode & Near Miss Logging

### 3.1.1 ADX Phase State Machine

**Problem:** ADX was treated as a simple threshold (< 20 = reject), missing nuanced market phases like transition zones and exhaustion.

**Solution:** Implemented a 5-phase state machine for ADX classification with phase-specific behavior.

**Location:**
- `supabase/functions/_shared/constants.ts` - Added `ADX_PHASES` and `ADX_THRESHOLDS.EXHAUSTION`
- `supabase/functions/_shared/scoring.ts` - Added `getAdxPhase()` and `getAdxPhaseInfo()`

**Configuration:**
```typescript
ADX_PHASES = {
  RANGE: { min: 0, max: 15 },        // No trend, avoid
  TRANSITION: { min: 15, max: 20 },   // Trend developing
  EARLY_TREND: { min: 20, max: 25 },  // Trend confirmed
  STRONG_TREND: { min: 25, max: 45 }, // Peak trending
  EXHAUSTION: { min: 45, max: 100 },  // Trend exhaustion risk
}

ADX_THRESHOLDS.EXHAUSTION = 45  // Above = reversal sensitivity boost
```

**Phase Behaviors:**
| Phase | ADX Range | Behavior |
|-------|-----------|----------|
| RANGE | 0-15 | Reject most entries, very low trend strength |
| TRANSITION | 15-20 | Allow squeeze breakouts only |
| EARLY_TREND | 20-25 | Normal entries, standard validation |
| STRONG_TREND | 25-45 | High confidence entries |
| EXHAUSTION | 45+ | Apply 1.5× reversal sensitivity multiplier |

**Expected Impact:**
- Better handling of trend phase transitions
- Early detection of trend exhaustion
- More nuanced ADX-based filtering

---

### 3.1.2 Explicit Breakout Mode Flag

**Problem:** Breakout conditions were checked inconsistently, and StochRSI penalty was applied even during valid breakouts.

**Solution:** Created explicit breakout mode detection with clear parameter overrides.

**Location:**
- `supabase/functions/_shared/constants.ts` - Added `BREAKOUT_MODE_PARAMS`
- `supabase/functions/_shared/scoring.ts` - Added `detectBreakoutMode()`

**Configuration:**
```typescript
BREAKOUT_MODE_PARAMS = {
  STOCHRSI_PENALTY_REDUCTION: 0.5,  // 50% StochRSI penalty in breakout mode
  MIN_VOLUME_RATIO: 1.3,             // Require 30% volume expansion
  MIN_SQUEEZE_PERCENT: 50,           // Require active squeeze
  REQUIRE_ADX_RISING: true,          // ADX must be rising
  REQUIRE_MOMENTUM_BUILDING: true,   // Momentum must confirm
}
```

**Breakout Mode Result:**
```typescript
interface BreakoutModeResult {
  isActive: boolean;
  squeezeActive: boolean;
  volumeExpansion: boolean;
  momentumBuilding: boolean;
  adxRising: boolean;
  stochRsiPenaltyMultiplier: number;  // 0.5 if active, 1.0 otherwise
  skipDivergenceGate: boolean;         // Skip divergence in valid breakouts
}
```

**Expected Impact:**
- Clearer breakout detection logic
- Reduced StochRSI penalty during valid compression breakouts
- Proper divergence gate handling during breakouts

---

### 3.1.3 Near Miss Logging

**Problem:** Signals that just missed the quality threshold were silently rejected, making tuning difficult.

**Solution:** Log "near miss" signals with detailed breakdown for analysis.

**Location:**
- `supabase/functions/_shared/constants.ts` - Added `QUALITY_THRESHOLDS.NEAR_MISS_THRESHOLD`
- `supabase/functions/strategy-analyzer/index.ts` - Near miss detection and logging

**Configuration:**
```typescript
QUALITY_THRESHOLDS = {
  MIN_QUALITY_SCORE: 60,
  NEAR_MISS_THRESHOLD: 5,  // Log if score within 5 points of threshold
}
```

**Logged to `signal_rejection_log`:**
```typescript
{
  rejection_reason: "QUALITY_NEAR_MISS",
  filters_status: {
    isNearMiss: true,
    nearMissMargin: 3,  // e.g., score 57 = 3 points below 60
    qualityScore: 57,
    breakdown: { ... }
  }
}
```

**Monitoring Query:**
```sql
SELECT 
  symbol,
  filters_status->>'nearMissMargin' as margin,
  filters_status->>'qualityScore' as score,
  checked_at
FROM signal_rejection_log 
WHERE filters_status->>'isNearMiss' = 'true'
ORDER BY checked_at DESC
LIMIT 20;
```

**Expected Impact:**
- Visibility into near-threshold rejections
- Data-driven tuning of quality thresholds
- Identification of over-strict gates

---

## Phase 2: Separated Risk Scores & Component Caps

### 3.2.1 Separated Continuation vs Reversal Risk

**Problem:** Single "Unified Reversal Score" conflated two distinct risks:
1. **Continuation Risk** - Risk the trade fails to continue (position sizing concern)
2. **Reversal Probability** - Probability of active reversal (entry blocking concern)

**Solution:** Separate risk scores with different behaviors.

**Location:**
- `supabase/functions/_shared/constants.ts` - Added `RISK_SEPARATION_THRESHOLDS`
- `supabase/functions/_shared/scoring.ts` - Added `calculateSeparatedRisk()`

**Configuration:**
```typescript
RISK_SEPARATION_THRESHOLDS = {
  CONTINUATION_RISK: {
    LOW: 15,      // Green - full size
    MEDIUM: 30,   // Yellow - reduce 20%
    HIGH: 50,     // Orange - reduce 40%
    EXTREME: 70,  // Red - reduce 60%
  },
  REVERSAL_PROBABILITY: {
    ACCEPTABLE: 40,  // Green - proceed
    ELEVATED: 60,    // Yellow - proceed with caution
    HIGH: 75,        // Orange - block in weak trends
    EXTREME: 85,     // Red - hard block
  },
}
```

**Risk Components:**

| Risk Type | Components | Action |
|-----------|------------|--------|
| Continuation Risk | StochRSI zones, momentum exhaustion | Reduce position size |
| Reversal Probability | Crosses (MACD/StochRSI), divergence, HTF conflict | Block entry |

**Result Structure:**
```typescript
interface SeparatedRisk {
  continuationRisk: {
    score: number;
    positionMultiplier: number;  // 1.0, 0.8, 0.6, or 0.4
    reasons: string[];
  };
  reversalProbability: {
    score: number;
    shouldBlock: boolean;
    reasons: string[];
  };
}
```

**Expected Impact:**
- Position sizing based on continuation risk (not blocking)
- Entry blocking based on reversal probability (not sizing)
- Clearer decision logic

---

### 3.2.2 Directional Risk Budget with Component Caps

**Problem:** Single indicators could dominate the reversal score, leading to over-aggressive filtering.

**Solution:** Apply context-aware caps to each component's contribution.

**Location:**
- `supabase/functions/_shared/constants.ts` - Added `COMPONENT_CAPS`
- `supabase/functions/_shared/scoring.ts` - Added `getComponentCaps()`

**Configuration:**
```typescript
COMPONENT_CAPS = {
  STOCHRSI: { default: 20, contextAware: 25 },     // Max StochRSI contribution
  MOMENTUM: { default: 15, contextAware: 20 },     // Max momentum contribution
  MACD: { default: 15, contextAware: 20 },         // Max MACD contribution
  TIMEFRAME: { default: 15, contextAware: 20 },    // Max HTF conflict contribution
}
```

**Context-Aware Adjustments:**
| Context | Adjustment |
|---------|------------|
| `adx < 20` | +5 to all caps (more tolerance) |
| `isBreakoutMode` | -5 to StochRSI cap (more tolerance) |
| `isMomentumActive` | -5 to momentum cap (more tolerance) |
| `macdExpanding` | -5 to MACD cap (more tolerance) |
| `hasPartialAlignment` | -3 to timeframe cap (more tolerance) |

**Example:**
```
Raw scores: stochRsi=30, momentum=20, macd=18, htf=15
Caps (breakout mode): stochRsi=15, momentum=20, macd=20, htf=20
Capped scores: stochRsi=15, momentum=20, macd=18, htf=15
```

**Expected Impact:**
- Prevents single-indicator domination
- Context-sensitive filtering
- More balanced reversal scoring

---

## Phase 3: Time-in-Extreme Filter

### 3.3.1 Track Bars Spent at StochRSI Extremes

**Problem:** StochRSI could stay overbought/oversold for extended periods in strong trends, but no mechanism tracked duration.

**Solution:** Count consecutive bars at StochRSI extremes and apply graduated penalties.

**Location:**
- `supabase/functions/_shared/constants.ts` - Added `TIME_IN_EXTREME_PARAMS`
- `supabase/functions/_shared/indicators.ts` - Added `calculateBarsAtExtreme()`
- `supabase/functions/calculate-trend/index.ts` - Integrated bars tracking
- `supabase/functions/_shared/scoring.ts` - Added `calculateTimeInExtremePenalty()`

**Configuration:**
```typescript
TIME_IN_EXTREME_PARAMS = {
  OVERBOUGHT_EXTREME: 90,   // K >= 90 = extreme overbought
  OVERSOLD_EXTREME: 10,     // K <= 10 = extreme oversold
  MIN_BARS_FOR_PENALTY: 3,  // Only penalize after 3+ bars
  PENALTY_MODERATE: 5,      // 3-5 bars: +5 reversal score
  PENALTY_HIGH: 15,         // 6-8 bars: +15 reversal score
  PENALTY_EXTREME: 35,      // 12+ bars: +35 reversal score
}
```

**Penalty Schedule:**
| Consecutive Bars | Penalty | Interpretation |
|-----------------|---------|----------------|
| 0-2 | 0 | Normal oscillation |
| 3-5 | +5 | Early warning |
| 6-8 | +15 | Elevated exhaustion risk |
| 9-11 | +25 | High exhaustion risk |
| 12+ | +35 | Extreme - likely momentum exhaustion |

**Multi-Timeframe Weighting:**
```typescript
effectiveBars = Math.max(barsAtExtreme4h * 1.5, barsAtExtreme1h);
// 4H extremes weighted 1.5× (more significant)
```

**Trend Data Extension:**
```typescript
stochasticRsi: {
  ...existing,
  barsAtExtreme1h: number,  // Consecutive extreme bars on 1H
  barsAtExtreme4h: number,  // Consecutive extreme bars on 4H
}
```

**Integration with Reversal Score:**
```typescript
const timeInExtremePenalty = calculateTimeInExtremePenalty(barsAtExtreme1h, barsAtExtreme4h);
totalScore += timeInExtremePenalty.penalty;

// In breakdown:
breakdown.timeInExtremeScore = timeInExtremePenalty.penalty;
```

**Expected Impact:**
- Early warning for momentum exhaustion
- Graduated penalty prevents over-filtering
- Multi-timeframe awareness
- Better reversal detection in extended moves

---

# Summary Tables

## Files Modified (Including Rejection Improvements)

| File | Signal Gen | Trade Exec | Rejection Improvements |
|------|-----------|------------|------------------------|
| `supabase/functions/_shared/constants.ts` | `ENTRY_TIMING_PARAMS`, `ADX_THRESHOLDS.SQUEEZE_MINIMUM` | `TREND_VALIDATION_PARAMS`, `CORRELATION_PARAMS` extended, `ORDER_EXECUTION_PARAMS` | `ADX_PHASES`, `BREAKOUT_MODE_PARAMS`, `RISK_SEPARATION_THRESHOLDS`, `COMPONENT_CAPS`, `TIME_IN_EXTREME_PARAMS`, `QUALITY_THRESHOLDS.NEAR_MISS_THRESHOLD` |
| `supabase/functions/_shared/scoring.ts` | `isValidSqueezeBreakout()`, `deriveTradeDirection()` | - | `getAdxPhase()`, `getAdxPhaseInfo()`, `detectBreakoutMode()`, `calculateSeparatedRisk()`, `getComponentCaps()`, `calculateTimeInExtremePenalty()` |
| `supabase/functions/_shared/indicators.ts` | - | - | `calculateBarsAtExtreme()` |
| `supabase/functions/calculate-trend/index.ts` | - | - | Bars at extreme tracking |
| `supabase/functions/strategy-analyzer/index.ts` | Phases 1-3 integrated | - | Near miss logging |
| `supabase/functions/execute-trade/index.ts` | - | Phases 1-3 integrated | - |

## New Rejection Reasons

| Reason | System | Phase | Description |
|--------|--------|-------|-------------|
| `NO_CLEAR_DIRECTION` | Signal Gen | 1 | Multi-timeframe trends don't agree |
| `ADX_TOO_LOW_NO_SQUEEZE` | Signal Gen | 1 | ADX 18-20 but no valid squeeze |
| `ADX_TOO_LOW` | Signal Gen | 1 | ADX < 18, hard block |
| `MOMENTUM_DIRECTION_OPPOSING` | Signal Gen | 2 | Momentum opposes trade direction |
| `QUALITY_NEAR_MISS` | Signal Gen | Rej-1 | Score within 5 points of threshold |
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

### Near Miss Analysis
```sql
SELECT 
  symbol,
  filters_status->>'nearMissMargin' as margin,
  filters_status->>'qualityScore' as score,
  filters_status->'breakdown' as breakdown,
  checked_at
FROM signal_rejection_log 
WHERE filters_status->>'isNearMiss' = 'true'
ORDER BY checked_at DESC
LIMIT 50;
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
- `[ADX_PHASE]` - ADX state machine transitions
- `[BREAKOUT_MODE]` - Breakout detection results
- `[NEAR_MISS]` - Near threshold rejections
- `[TIME_IN_EXTREME]` - Bars at StochRSI extremes

---

## Impact Summary

| Phase | System | Fix | Risk Reduction |
|-------|--------|-----|----------------|
| 1.1 | Signal | Explicit direction | Eliminates ambiguous signals |
| 1.2 | Signal | Squeeze exception | Captures high-EV breakouts |
| 2.1 | Signal | URS/divergence dedup | Reduces over-filtering |
| 2.2 | Signal | Momentum symmetry | Prevents counter-momentum entries |
| 3.1 | Signal | Entry timing weight | Improves weak-trend entries |
| Rej-1.1 | Signal | ADX state machine | Nuanced phase handling |
| Rej-1.2 | Signal | Breakout mode flag | Proper breakout filtering |
| Rej-1.3 | Signal | Near miss logging | Enables threshold tuning |
| Rej-2.1 | Signal | Separated risk scores | Clearer risk categorization |
| Rej-2.2 | Signal | Component caps | Prevents indicator domination |
| Rej-3.1 | Signal | Time-in-extreme filter | Detects momentum exhaustion |
| 1.1 | Exec | Signal expiry | Prevents stale executions |
| 1.2 | Exec | Ownership validation | Security - prevents cross-user |
| 2.1 | Exec | Confidence-weighted trend | Allows valid pullbacks |
| 2.2 | Exec | Reversal sizing fix | Prevents double-counting |
| 3.1 | Exec | Correlation cap | Limits portfolio correlation |
| 3.2 | Exec | Partial fill handling | Resilient order execution |

---

# Part 4: Smart Exception Safety Improvements

These improvements address the need for safer exception handling in the trading system, ensuring that bypass mechanisms don't create excessive risk.

## Phase 1: Core Safety Gates

**Files Modified:**
- `supabase/functions/_shared/constants.ts`
- `supabase/functions/strategy-analyzer/index.ts`

### 4.1.1 Tiered ADX Requirements for Strong Trend Exception

Added tiered thresholds for strong trend exceptions:

```typescript
// constants.ts
ADX_THRESHOLDS: {
  STRONG_TREND_EXCEPTION_PARTIAL: 25,  // Partial exception (50% position)
  STRONG_TREND_EXCEPTION_FULL: 30,     // Full exception (no reduction)
}
```

**Behavior:**
- **ADX >= 30**: Full position size allowed (aligned with strong trend)
- **ADX 25-29**: Partial position (50% reduction) as a safety measure
- **ADX < 25**: No strong trend exception applies

### 4.1.2 Reversal Override Safety Gates

Prevents dangerous reversal overrides in unsuitable conditions:

```typescript
// constants.ts
REVERSAL_OVERRIDE_SAFETY: {
  MAX_ADX_FOR_REVERSAL: 30,        // Block reversals in strong trends
  MIN_REVERSAL_SCORE: 65,          // Require high reversal confidence
  MAX_HTF_CONFIDENCE_AGAINST: 65,  // Block if 4h strongly opposes
  MAX_POSITION_SIZE_PERCENT: 60,   // Cap reversal position sizes
  MIN_REQUIRED_RR: 2.0,            // Require 2:1 reward-to-risk
}
```

**Gates Applied:**
1. Block reversal if ADX >= 30 (trend too strong)
2. Block if reversal score < 65 (not confident enough)
3. Block if 4h timeframe strongly aligned against reversal (>= 65% confidence)
4. Cap position size to 60% for all reversal overrides

### 4.1.3 Tighter Breakout Definition

Stricter breakout criteria to prevent false breakout signals:

```typescript
// constants.ts
BREAKOUT_THRESHOLDS: {
  MIN_PERCENT_B: 80,              // Require strong %B
  MIN_VOLUME_RATIO: 1.5,          // Require volume confirmation
  MIN_BANDWIDTH_EXPANSION: true,  // Require expanding bandwidth
  MAX_PERCENT_B_SHORT: 20,        // For short breakouts
}
```

**New Breakout Logic:**
- Requires `%B > 80` AND (`volumeRatio >= 1.5` OR `bandwidthExpanding`)
- For shorts: `%B < 20` with volume/bandwidth confirmation

---

## Phase 2: Micro-Trend Hardening

**Files Modified:**
- `supabase/functions/_shared/constants.ts`
- `supabase/functions/calculate-trend/index.ts`
- `supabase/functions/strategy-analyzer/index.ts`

### 4.2.1 Stricter Micro-Trend Requirements

```typescript
// constants.ts
MICRO_TREND_PARAMS: {
  MIN_ADX: 25,                      // Require meaningful trend strength
  MIN_PERSISTENCE_BARS: 3,          // Require 3+ aligned candles
  REQUIRE_VOLUME_CONFIRMATION: true, // Must have volume support
  MIN_VOLUME_RATIO: 1.0,            // Minimum volume vs MA
  VALID_FOR_CANDLES: 2,             // Time-bound validity
  MIN_ALIGNMENT_SCORE: 60,          // Require decent alignment
  MAX_POSITION_SIZE_PERCENT: 60,    // Cap position sizes
}
```

### 4.2.2 Enhanced `detectMicroTrend` Function

The micro-trend detection now validates:

1. **ADX Sufficient**: ADX >= 25 required
2. **Persistence Check**: 3+ consecutive aligned candles (approximated from MACD histogram)
3. **Volume Confirmation**: Volume above MA or ratio >= 1.0
4. **Blocking Logic**: Returns `blocked: true` with `blockReason` if any check fails

```typescript
// calculate-trend/index.ts - MicroTrendResult interface
interface MicroTrendResult {
  detected: boolean;
  direction: 'bullish' | 'bearish' | 'neutral';
  strength: number;
  confidence: number;
  persistence: number;           // Number of aligned bars
  volumeConfirmed: boolean;      // Volume validation passed
  validForCandles: number;       // Time-bound expiry
  adxSufficient: boolean;        // ADX check passed
  blocked: boolean;              // Final blocking decision
  blockReason: string | null;    // Why it was blocked
}
```

### 4.2.3 Position Size Reduction

When micro-trend bypass is used, position size is capped to 60%:

```typescript
// strategy-analyzer/index.ts
if (hasMicroTrendBypass) {
  microTrendPositionMultiplier = MICRO_TREND_PARAMS.MAX_POSITION_SIZE_PERCENT / 100;
}
```

---

## Phase 3: Exception Hierarchy & Budget Tracking

**Files Modified:**
- `supabase/functions/_shared/constants.ts`
- `supabase/functions/_shared/scoring.ts`
- `supabase/functions/strategy-analyzer/index.ts`

### 4.3.1 Trend Strength Scoring

New function to quantify trend strength with configurable parameters:

```typescript
// constants.ts
TREND_STRENGTH_PARAMS: {
  CONFIDENCE_4H_WEIGHT: 1,       // Points per 20% 4h confidence
  CONFIDENCE_1H_WEIGHT: 0.5,     // Points per 20% 1h confidence
  ADX_THRESHOLDS: [20, 25, 30],  // ADX scoring tiers
  ADX_POINTS: [1, 2, 3],         // Points for each tier
  MOMENTUM_ALIGNMENT_BONUS: 1,   // Extra point for aligned momentum
  FULL_THRESHOLD: 4,             // Score for FULL exception
  PARTIAL_THRESHOLD: 2,          // Score for PARTIAL exception
}
```

```typescript
// scoring.ts
function calculateTrendStrength(params: {
  adx: number;
  conf4h: number;
  conf1h: number;
  trendDirection: string;
  momentumDirection: string;
}): { score: number; decision: 'FULL' | 'PARTIAL' | 'REJECT' }
```

**Scoring Logic:**
- +1 point per 20% of 4h confidence (max 5 points)
- +0.5 points per 20% of 1h confidence (max 2.5 points)
- +1/2/3 points based on ADX tier (20/25/30)
- +1 bonus if momentum aligns with trend
- **FULL** if score >= 4, **PARTIAL** if score >= 2, else **REJECT**

### 4.3.2 Global Exception Hierarchy

Establishes clear priority when multiple exceptions could apply:

```typescript
// constants.ts
EXCEPTION_HIERARCHY: {
  REVERSAL_OVERRIDE: 1,   // Highest priority
  STRONG_TREND: 2,        // Second priority
  MICRO_TREND: 3,         // Lowest priority
}

type ExceptionType = 'REVERSAL_OVERRIDE' | 'STRONG_TREND' | 'MICRO_TREND' | 'NONE';
```

```typescript
// scoring.ts
function determineExceptionPriority(params: {
  reversalEligible: boolean;
  strongTrendEligible: boolean;
  microTrendEligible: boolean;
  reversalScore: number;
  trendStrength: number;
  adx: number;
}): {
  selectedType: ExceptionType;
  positionMultiplier: number;
  reason: string;
}
```

**Priority Rules:**
1. **REVERSAL_OVERRIDE** (priority 1): Takes precedence if eligible, caps position at 60%
2. **STRONG_TREND** (priority 2): Full or partial based on trend strength score
3. **MICRO_TREND** (priority 3): Caps position at 60%
4. **NONE**: No exception applies, normal flow

### 4.3.3 Exception Budget Tracking

Prevents overuse of exceptions that bypass normal filters:

```typescript
// constants.ts
EXCEPTION_BUDGET: {
  MAX_EXCEPTIONS_PER_WINDOW: 3,         // Max 3 exceptions per window
  LOOKBACK_WINDOW_HOURS: 4,             // 4-hour lookback window
  POSITION_REDUCTION_WHEN_EXCEEDED: 0.5, // 50% reduction when over budget
  DISABLE_AFTER_CONSECUTIVE: 5,         // Disable after 5 consecutive
}
```

```typescript
// scoring.ts
function checkExceptionBudget(params: {
  recentExceptions: ExceptionType[];
  proposedType: ExceptionType;
}): {
  allowed: boolean;
  positionMultiplier: number;
  reason: string;
  exceptionsUsed: number;
  budgetRemaining: number;
}
```

**Budget Logic:**
1. Track exceptions in 4-hour rolling window
2. If budget exceeded (>3 exceptions), reduce position by 50%
3. If 5+ consecutive exceptions, temporarily disable exception bypasses
4. Budget resets as older exceptions fall outside the window

### 4.3.4 Signal Indicators Enhancement

Exception details are now included in signal indicators for analytics:

```typescript
// strategy-analyzer/index.ts - signal indicators
indicators: {
  // ... existing indicators
  exceptionType: exceptionDecision.selectedType,
  exceptionDetails: {
    positionMultiplier: exceptionDecision.positionMultiplier,
    reason: exceptionDecision.reason,
    budgetStatus: budgetCheck,
  }
}
```

---

## Smart Exception Safety Summary

| Feature | Before | After |
|---------|--------|-------|
| **Strong Trend ADX** | Single threshold | Tiered (25/30) with position scaling |
| **Reversal Overrides** | Could override in any condition | Blocked if ADX>30, score<65, or 4h opposes |
| **Breakout Definition** | Loose %B check | Requires %B>80 + volume OR bandwidth |
| **Micro-Trend Bypass** | Basic detection | ADX≥25 + 3 bars + volume + time expiry |
| **Exception Priority** | Unclear when multiple apply | Clear hierarchy (Reversal > Trend > Micro) |
| **Exception Budget** | Unlimited | Max 3/4h window, position reduction |
| **Position Caps** | None for exceptions | 60% cap for reversals and micro-trends |

### New Constants Added

| Constant | Location | Purpose |
|----------|----------|---------|
| `ADX_THRESHOLDS.STRONG_TREND_EXCEPTION_PARTIAL` | constants.ts | 25 - Partial exception threshold |
| `ADX_THRESHOLDS.STRONG_TREND_EXCEPTION_FULL` | constants.ts | 30 - Full exception threshold |
| `REVERSAL_OVERRIDE_SAFETY` | constants.ts | Safety gates for reversal overrides |
| `BREAKOUT_THRESHOLDS` | constants.ts | Stricter breakout detection criteria |
| `MICRO_TREND_PARAMS` | constants.ts | Micro-trend hardening parameters |
| `TREND_STRENGTH_PARAMS` | constants.ts | Trend strength scoring configuration |
| `EXCEPTION_HIERARCHY` | constants.ts | Exception type priorities |
| `EXCEPTION_BUDGET` | constants.ts | Exception usage limits |

### New Functions Added

| Function | Location | Purpose |
|----------|----------|---------|
| `calculateTrendStrength()` | scoring.ts | Quantifies trend strength for exception decisions |
| `determineExceptionPriority()` | scoring.ts | Selects highest-priority applicable exception |
| `checkExceptionBudget()` | scoring.ts | Tracks and limits exception usage |

### Edge Function Logs to Monitor

- `[EXCEPTION_HIERARCHY]` - Exception priority decisions
- `[TREND_STRENGTH]` - Trend strength scoring results
- `[EXCEPTION_BUDGET]` - Budget tracking and warnings
- `[MICRO_TREND_BYPASS]` - Micro-trend bypass allowed/blocked
- `[REVERSAL_OVERRIDE]` - Reversal override gate results

---

## Impact Summary (Updated)

| Phase | System | Fix | Risk Reduction |
|-------|--------|-----|----------------|
| 1.1 | Signal | Explicit direction | Eliminates ambiguous signals |
| 1.2 | Signal | Squeeze exception | Captures high-EV breakouts |
| 2.1 | Signal | URS/divergence dedup | Reduces over-filtering |
| 2.2 | Signal | Momentum symmetry | Prevents counter-momentum entries |
| 3.1 | Signal | Entry timing weight | Improves weak-trend entries |
| Rej-1.1 | Signal | ADX state machine | Nuanced phase handling |
| Rej-1.2 | Signal | Breakout mode flag | Proper breakout filtering |
| Rej-1.3 | Signal | Near miss logging | Enables threshold tuning |
| Rej-2.1 | Signal | Separated risk scores | Clearer risk categorization |
| Rej-2.2 | Signal | Component caps | Prevents indicator domination |
| Rej-3.1 | Signal | Time-in-extreme filter | Detects momentum exhaustion |
| **Exc-1.1** | Signal | Tiered ADX exception | Safer strong trend bypasses |
| **Exc-1.2** | Signal | Reversal safety gates | Prevents dangerous reversals |
| **Exc-1.3** | Signal | Tighter breakout def | Reduces false breakouts |
| **Exc-2.1** | Signal | Micro-trend hardening | Stricter micro-trend bypass |
| **Exc-3.1** | Signal | Trend strength scoring | Quantified exception decisions |
| **Exc-3.2** | Signal | Exception hierarchy | Clear priority when multiple apply |
| **Exc-3.3** | Signal | Exception budget | Limits exception overuse |
| 1.1 | Exec | Signal expiry | Prevents stale executions |
| 1.2 | Exec | Ownership validation | Security - prevents cross-user |
| 2.1 | Exec | Confidence-weighted trend | Allows valid pullbacks |
| 2.2 | Exec | Reversal sizing fix | Prevents double-counting |
| 3.1 | Exec | Correlation cap | Limits portfolio correlation |
| 3.2 | Exec | Partial fill handling | Resilient order execution |

**Total improvements:** 24 fixes across 2 systems (7 smart exception safety improvements added)  
**Edge functions redeployed:** `strategy-analyzer`, `execute-trade`, `calculate-trend`  
**Breaking changes:** None (additive improvements)
