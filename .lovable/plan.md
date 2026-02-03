

# Neutral-Bias Amplification Fix: Direction Derivation Architecture Overhaul

## Executive Summary

The investigation confirms a **systemic neutral-bias amplification** causing ~3% market rallies to trigger `NO_CLEAR_DIRECTION` rejections. The core issue is not a single bug, but an architectural pattern where:

1. Conservative trend classification (netSignal ≥ ±4.0) labels 44-55% confidence as "neutral"
2. Binary neutral handling (neutral = 0 contribution) discards partial directional signals
3. Tier gating requires non-neutral labels instead of directional strength scores
4. Terminal fallback (Tier 12) masks structural failures as "no clear direction"

---

## Root Cause Analysis (Validated)

### Problem 1: Over-Strict Trend Classification (trend-core.ts)

**Location**: `supabase/functions/_shared/trend-core.ts` (lines 96-98)

**Current Logic**:
```text
if (netSignal >= 4.0) trend = "bullish";
else if (netSignal <= -4.0) trend = "bearish";
else trend = "neutral";
```

**Issue**: During a +3% impulse rally:
- EMA confirms early (weight 3)
- RSI lags, often only partial weight
- MACD histogram often weak initially

This frequently produces netSignal = 3.2–3.8, which is:
- Directionally meaningful
- Structurally aligned
- But classified as "neutral"

---

### Problem 2: Binary Neutral Contribution (scoring.ts)

**Location**: `supabase/functions/_shared/scoring.ts` (lines 2633-2644)

**Current Logic**:
```text
const trendToValue = (trend: string, conf: number): number => {
  if (trend === "neutral" && conf < 45) return 0;
  const confWeight = Math.min(1, conf / 65);
  if (trend === "bullish") return confWeight;
  if (trend === "bearish") return -confWeight;
  return 0;  // <-- neutral with conf >= 45 still returns 0
};
```

**Issue**: This is "catastrophically lossy". A state with:
- 4h: 44% confidence
- 1h: 53% confidence
- 30m: 55% confidence

Produces a weighted sum of **0.00** because all timeframes are labeled "neutral" despite strong partial directional pressure.

---

### Problem 3: Tier Gating Depends on Labels, Not Strength

**Location**: `supabase/functions/_shared/scoring.ts` (lines 3579-3690)

**Current Logic**: Multiple tiers require `trend4h !== "neutral"`:
```text
// Priority 3: 4h neutral but 1h+30m aligned
if (trend4h === "neutral" && trend1h === trend30m && trend1h !== "neutral")
```

**Issue**: If all timeframes are conservatively labeled "neutral" (even with 44-55% confidence), tiers 0-8 are skipped entirely, leading directly to Tier 12 fallback.

---

### Problem 4: Tier 12 as Silent Failure Sink

**Location**: `supabase/functions/_shared/scoring.ts` (lines 4031-4051)

**Current Logic**: After exhausting all 12 tiers, returns `direction: null` with `NO_CLEAR_DIRECTION`.

**Issue**: This masks whether the failure was:
- Trend classification lag
- Momentum opposition
- Regime mismatch
- Or genuine ambiguity

---

## Implementation Plan

### Phase 1: Replace Binary Neutral with Partial Contribution
**Priority: CRITICAL**

**File**: `supabase/functions/_shared/scoring.ts`

**Changes**:
1. Modify `trendToValue()` function to return scaled partial contribution for neutral trends
2. Add a new `neutralContribution` parameter based on confidence level

**New Logic**:
```text
const trendToValue = (trend: string, conf: number): number => {
  // Neutral with low confidence = no contribution
  if (trend === "neutral" && conf < NEUTRAL_CONTRIBUTION_FLOOR) return 0;
  
  const confWeight = Math.min(1, conf / 65);
  if (trend === "bullish") return confWeight;
  if (trend === "bearish") return -confWeight;
  
  // NEW: Neutral with meaningful confidence = partial contribution
  // Scale 45-60% confidence to ±0.2 to ±0.6 based on momentum indicators
  if (conf >= NEUTRAL_CONTRIBUTION_FLOOR) {
    const partialWeight = (conf - NEUTRAL_CONTRIBUTION_FLOOR) / (65 - NEUTRAL_CONTRIBUTION_FLOOR);
    return partialWeight * momentumDirectionHint; // -1, 0, or +1 from MACD/RSI
  }
  return 0;
};
```

**New Constants** (in `constants.ts`):
```text
NEUTRAL_CONTRIBUTION_FLOOR: 40,
NEUTRAL_CONTRIBUTION_CEILING: 60,
NEUTRAL_PARTIAL_MAX_WEIGHT: 0.6,
```

**Outcome**: 
- 4h 44% + 1h 53% + 30m 55% now produces ~0.49 weighted sum (not 0.00)
- Partial directional pressure is preserved instead of discarded

---

### Phase 2: Lower netSignal Threshold
**Priority: HIGH**

**File**: `supabase/functions/_shared/trend-core.ts`

**Changes**:
1. Lower trend classification threshold from ±4.0 to ±3.0
2. Add a new "weak_bullish"/"weak_bearish" intermediate state for ±2.5 to ±3.0

**New Logic**:
```text
let trend: "bullish" | "bearish" | "neutral" | "weak_bullish" | "weak_bearish" = "neutral";
if (netSignal >= 4.0) trend = "bullish";
else if (netSignal >= 3.0) trend = "weak_bullish";  // NEW
else if (netSignal <= -4.0) trend = "bearish";
else if (netSignal <= -3.0) trend = "weak_bearish";  // NEW
```

**New Constants** (in `constants.ts`):
```text
NET_SIGNAL_STRONG_THRESHOLD: 4.0,
NET_SIGNAL_WEAK_THRESHOLD: 3.0,
```

**Outcome**: 
- More signals classified as directional during early impulse phases
- "weak_bullish"/"weak_bearish" contributes partial weight to direction derivation

---

### Phase 3: Add Pre-Terminal Bias Resolution Tier (Tier 9.5)
**Priority: HIGH**

**File**: `supabase/functions/_shared/scoring.ts`

**Changes**:
1. Insert new tier between Tier 9 (Primary Trend Fallback) and Tier 10 (Momentum Fallback)
2. Uses micro-direction, consecutive bars, StochRSI extremes, and order flow as bias indicators

**New Logic**:
```text
// ============= TIER 9.5: BIAS RESOLUTION BEFORE FALLBACK =============
// When timeframes are neutral but price action shows clear bias
if (BIAS_RESOLUTION_TIER_ENABLED) {
  const biasEvidence = [];
  let biasDirection: TradeDirection | null = null;
  let biasScore = 0;
  
  // Evidence 1: Micro-direction (8+ consecutive bars)
  const consecutiveBars = trendData.momentum?.consecutiveBars || 0;
  if (consecutiveBars >= 8) {
    biasScore += 2;
    biasDirection = trendData.momentum?.direction === "bullish" ? "long" : "short";
    biasEvidence.push(`MICRO_DIRECTION(${consecutiveBars} bars)`);
  }
  
  // Evidence 2: StochRSI extreme
  const stochK = extractStochRsiK(trendData, '4h');
  if (stochK >= 90) {
    biasScore += 1;
    if (!biasDirection) biasDirection = "short";
    biasEvidence.push(`STOCHRSI_OVERBOUGHT(${stochK})`);
  } else if (stochK <= 10) {
    biasScore += 1;
    if (!biasDirection) biasDirection = "long";
    biasEvidence.push(`STOCHRSI_OVERSOLD(${stochK})`);
  }
  
  // Evidence 3: Order flow signal
  if (orderFlowData?.score >= 60) {
    biasScore += 1;
    const ofDir = orderFlowData.signal.includes("buy") ? "long" : "short";
    if (!biasDirection) biasDirection = ofDir;
    biasEvidence.push(`ORDER_FLOW(${orderFlowData.score})`);
  }
  
  // Require at least 2 evidence sources
  if (biasScore >= 2 && biasDirection) {
    return {
      direction: biasDirection,
      confidence: 50,
      source: "bias-resolution",
      positionSizeMultiplier: 0.25,  // WEAK_LONG/WEAK_SHORT = minimal size
      directionContext: createDirectionContext(biasDirection, {
        tier: 9.5,
        tierSource: 'TIER_9.5_BIAS_RESOLUTION',
        evidenceType: 'MICRO_STRUCTURE',
        // ...
      }),
    };
  }
}
```

**New Constants** (in `constants.ts`):
```text
BIAS_RESOLUTION_TIER: {
  ENABLED: true,
  MIN_EVIDENCE_SCORE: 2,
  MICRO_DIRECTION_MIN_BARS: 8,
  STOCHRSI_EXTREME_K_HIGH: 90,
  STOCHRSI_EXTREME_K_LOW: 10,
  ORDER_FLOW_MIN_SCORE: 60,
  POSITION_SIZE: 0.25,
  CONFIDENCE: 50,
},
```

**Outcome**:
- Prevents Tier 12 terminal fallback during impulse phases
- Provides `WEAK_LONG` or `WEAK_SHORT` direction with minimal position size
- Direction must not be `NONE` when clear micro-evidence exists

---

### Phase 4: Decouple Tier Eligibility from Labels
**Priority: MEDIUM**

**File**: `supabase/functions/_shared/scoring.ts`

**Changes**:
1. Replace label-based tier conditions with strength-based conditions
2. Use confidence scores instead of "neutral"/"bullish"/"bearish" labels

**Before**:
```text
if (trend4h === "neutral" && trend1h === trend30m && trend1h !== "neutral")
```

**After**:
```text
if (conf4h < TIER_DIRECTIONAL_THRESHOLD && conf1h >= TIER_DIRECTIONAL_THRESHOLD && ...)
```

**New Constants**:
```text
TIER_DIRECTIONAL_THRESHOLD: 50,  // Confidence >= 50 = directional (regardless of label)
```

---

### Phase 5: Add StochRSI Extreme as Direction Bias
**Priority: MEDIUM**

**File**: `supabase/functions/_shared/scoring.ts`

**Changes**:
1. In weighted direction derivation, add StochRSI extreme as a bias input
2. K >= 90 adds bearish bias (-0.1 to weighted sum)
3. K <= 10 adds bullish bias (+0.1 to weighted sum)

**New Logic** (in `deriveTradeDirection`):
```text
// StochRSI extreme bias (only for direction hint, not override)
let stochBias = 0;
const stochK4h = extractStochRsiK(trendData, '4h');
if (stochK4h >= 90) stochBias = -0.10;  // Overbought = bearish bias
else if (stochK4h <= 10) stochBias = +0.10;  // Oversold = bullish bias

const weightedSum = baseWeightedSum + momentumAdjustment + stochBias;
```

---

### Phase 6: Enhanced Tier 12 Diagnostics
**Priority: LOW**

**File**: `supabase/functions/_shared/scoring.ts`

**Changes**:
1. Log detailed breakdown of why each tier was skipped
2. Add `tierSkipReasons` array to DirectionResult
3. Include raw netSignal values and confidence scores in rejection metadata

**Outcome**: When Tier 12 fires during a +3% day, logs will show exactly which upstream tier failed and why.

---

## Validation Criteria

After implementation, verify:

1. **+2-3% impulse** → Produces `WEAK_LONG` or directional signal (not `NO_CLEAR_DIRECTION`)
2. **NO_CLEAR_DIRECTION rate** → Becomes rare, only in:
   - Low volatility (ADX < 15)
   - Flat chop (all TFs truly indecisive)
   - Conflicting HTF/LTF states (e.g., 4h bearish, 1h bullish)
3. **Tier 12 fires during +3% BTC day** → System is still broken (regression test)

---

## Technical Summary

| Phase | File | Change | Risk |
|-------|------|--------|------|
| 1 | scoring.ts | Partial neutral contribution | Medium - core logic |
| 2 | trend-core.ts | Lower netSignal threshold | Low - additive |
| 3 | scoring.ts | Bias Resolution Tier 9.5 | Medium - new tier |
| 4 | scoring.ts | Decouple tier eligibility | Medium - multiple tiers |
| 5 | scoring.ts | StochRSI bias input | Low - additive |
| 6 | scoring.ts | Enhanced diagnostics | Low - logging only |

---

## Files to Modify

1. `supabase/functions/_shared/constants.ts` - Add new thresholds and tier parameters
2. `supabase/functions/_shared/trend-core.ts` - Lower netSignal threshold, add weak labels
3. `supabase/functions/_shared/scoring.ts` - Partial contribution, Tier 9.5, StochRSI bias
4. `src/components/SignalRejectionReasons.tsx` - Enhanced UI for new tier reasons (optional)

