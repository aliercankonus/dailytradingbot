
# Plan: Gate Hierarchy Fixes for Counter-Momentum Entry Prevention

## Problem Summary

The BNBUSDT SHORT loss was caused by **gate precedence errors and over-trust in ADX strength**:

| Issue | Current Behavior | Impact |
|-------|-----------------|--------|
| ADX Override Bug | ADX >= 35 bypasses momentum direction checks | Allowed SHORT with bullish momentum score 48-50 |
| No Momentum Slope Gate | Only checks polarity, not acceleration | Entered during **accelerating** opposing momentum |
| LTF Confirmation Gap | 0.35x sizing but not universally enforced | Both 1h/30m neutral → should have blocked or heavily reduced |
| No 15m Spike Protection | 15m StochRSI 98.3 was ignored | Entered at momentum climax candle |

**Root cause**: ADX answered "Is there trend strength?" (yes, 57.7) but was incorrectly used to answer "Should we enter?" - those are different questions.

---

## Implementation Steps

### Step 1: Add Momentum Slope Gate (NEW HARD GATE)

**File**: `supabase/functions/_shared/constants.ts`

Add new gate constants:

```typescript
export const MOMENTUM_SLOPE_GATE = {
  ENABLED: true,
  
  // Block counter-momentum entries when momentum is ACCELERATING
  // Momentum slope > 0 = bullish acceleration, < 0 = bearish acceleration
  
  // For SHORT: block if momentum slope > this (bullish acceleration)
  BLOCK_SHORT_IF_SLOPE_ABOVE: 0,
  // For LONG: block if momentum slope < this (bearish acceleration)  
  BLOCK_LONG_IF_SLOPE_BELOW: 0,
  
  // Minimum opposing momentum score to trigger slope check
  // Only check slope when momentum is already opposing
  MIN_OPPOSING_SCORE_FOR_SLOPE_CHECK: 15,
  
  // ADX does NOT override this gate (architectural fix)
  // High ADX with accelerating opposing momentum = STRONGER block, not weaker
  ADX_AMPLIFIES_NOT_OVERRIDES: true,
  
  // Exception: If momentum is DECELERATING (slope opposite to score direction)
  // Allow entry with reduced size
  DECELERATING_MOMENTUM_POSITION_MULTIPLIER: 0.50,
  
  LOG_GATE_CHECKS: true,
};
```

**File**: `supabase/functions/strategy-analyzer/index.ts`

Add gate implementation BEFORE the existing momentum direction check (higher priority):

```typescript
// ============= CRITICAL: MOMENTUM SLOPE GATE (PRIORITY 1) =============
// ADX must NEVER override this - accelerating opposing momentum is a hard block
if (MOMENTUM_SLOPE_GATE.ENABLED) {
  const momentumScore = smartMomentum.score;
  const momentumSlope = trendData?.momentum?.macdSlope ?? 0;
  
  // Check for accelerating opposing momentum
  const isOpposingMomentum = 
    (derivedDirection === 'long' && momentumScore < -MOMENTUM_SLOPE_GATE.MIN_OPPOSING_SCORE_FOR_SLOPE_CHECK) ||
    (derivedDirection === 'short' && momentumScore > MOMENTUM_SLOPE_GATE.MIN_OPPOSING_SCORE_FOR_SLOPE_CHECK);
  
  if (isOpposingMomentum) {
    const isAccelerating = 
      (derivedDirection === 'short' && momentumSlope > MOMENTUM_SLOPE_GATE.BLOCK_SHORT_IF_SLOPE_ABOVE) ||
      (derivedDirection === 'long' && momentumSlope < MOMENTUM_SLOPE_GATE.BLOCK_LONG_IF_SLOPE_BELOW);
    
    if (isAccelerating) {
      // HARD BLOCK - no ADX exception
      rejectedByHardGates++;
      const blockReason = `MOMENTUM_SLOPE_GATE: ${derivedDirection.toUpperCase()} blocked - opposing momentum (${momentumScore.toFixed(0)}) is ACCELERATING (slope=${momentumSlope.toFixed(3)})`;
      perSymbolGateAttribution.set(symbol, { gate: 'MOMENTUM_SLOPE_GATE', details: blockReason });
      
      logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.GATE} 🚫 ${blockReason}`);
      logger.forSymbol(symbol).warn(`   → ADX=${adx.toFixed(1)} does NOT override accelerating opposing momentum`);
      
      await logRejectionWithAI(supabase, userId, symbol, blockReason, {
        gate: "MOMENTUM_SLOPE_GATE",
        derivedDirection,
        momentumScore,
        momentumSlope,
        adx,
        adxDoesNotOverride: true,
      }, trendData, riskParams.ai_analysis_enabled !== false, earlyOrderFlowAnalysis);
      continue;
    }
  }
}
```

---

### Step 2: Add 15m StochRSI Spike Protection Gate (NEW)

**File**: `supabase/functions/_shared/constants.ts`

```typescript
export const LTF_SPIKE_PROTECTION_GATE = {
  ENABLED: true,
  
  // 15m StochRSI thresholds for spike detection
  // Block SHORT if 15m K > this (momentum spike, not exhaustion)
  BLOCK_SHORT_IF_15M_K_ABOVE: 95,
  // Block LONG if 15m K < this (momentum spike)
  BLOCK_LONG_IF_15M_K_BELOW: 5,
  
  // Exception: Only block if momentum is aligned with spike direction
  // This prevents blocking valid exhaustion reversals
  REQUIRE_MOMENTUM_ALIGNED_WITH_SPIKE: true,
  
  // Exception: ADX slope must be rising (trend still accelerating)
  REQUIRE_ADX_SLOPE_RISING: true,
  MIN_ADX_SLOPE_FOR_BLOCK: 0,
  
  // Reduced position alternative (instead of full block)
  ALLOW_REDUCED_POSITION: false,  // For now, hard block
  REDUCED_POSITION_MULTIPLIER: 0.25,
  
  LOG_GATE_CHECKS: true,
};
```

**File**: `supabase/functions/strategy-analyzer/index.ts`

Add gate after momentum slope gate:

```typescript
// ============= CRITICAL: 15M SPIKE PROTECTION GATE (PRIORITY 2) =============
// Prevents entering at momentum climax candles
if (LTF_SPIKE_PROTECTION_GATE.ENABLED) {
  const stochRsiK15m = extractStochRsiK(trendData, '15m');
  const adxSlope = trendData?.volatility?.adxSlope ?? 0;
  const momentumScore = smartMomentum.score;
  
  // Check for spike condition
  const is15mBullishSpike = stochRsiK15m > LTF_SPIKE_PROTECTION_GATE.BLOCK_SHORT_IF_15M_K_ABOVE;
  const is15mBearishSpike = stochRsiK15m < LTF_SPIKE_PROTECTION_GATE.BLOCK_LONG_IF_15M_K_BELOW;
  
  // Check if momentum aligns with spike (not a valid reversal setup)
  const momentumAlignsWithBullishSpike = momentumScore > 0;
  const momentumAlignsWithBearishSpike = momentumScore < 0;
  
  // Check if ADX is still rising (spike hasn't exhausted)
  const adxStillRising = adxSlope >= LTF_SPIKE_PROTECTION_GATE.MIN_ADX_SLOPE_FOR_BLOCK;
  
  // Block SHORT at bullish spike
  if (derivedDirection === 'short' && is15mBullishSpike) {
    const shouldBlock = (!LTF_SPIKE_PROTECTION_GATE.REQUIRE_MOMENTUM_ALIGNED_WITH_SPIKE || momentumAlignsWithBullishSpike) &&
                        (!LTF_SPIKE_PROTECTION_GATE.REQUIRE_ADX_SLOPE_RISING || adxStillRising);
    
    if (shouldBlock) {
      rejectedByHardGates++;
      const blockReason = `LTF_SPIKE_PROTECTION: SHORT blocked - 15m StochRSI K=${stochRsiK15m.toFixed(0)} > ${LTF_SPIKE_PROTECTION_GATE.BLOCK_SHORT_IF_15M_K_ABOVE} (bullish momentum spike)`;
      perSymbolGateAttribution.set(symbol, { gate: 'LTF_SPIKE_PROTECTION', details: blockReason });
      
      logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.GATE} 🚫 ${blockReason}`);
      
      await logRejectionWithAI(supabase, userId, symbol, blockReason, {
        gate: "LTF_SPIKE_PROTECTION",
        derivedDirection,
        stochRsiK15m,
        momentumScore,
        adxSlope,
        adx,
      }, trendData, riskParams.ai_analysis_enabled !== false, earlyOrderFlowAnalysis);
      continue;
    }
  }
  
  // Block LONG at bearish spike (symmetric)
  if (derivedDirection === 'long' && is15mBearishSpike) {
    const shouldBlock = (!LTF_SPIKE_PROTECTION_GATE.REQUIRE_MOMENTUM_ALIGNED_WITH_SPIKE || momentumAlignsWithBearishSpike) &&
                        (!LTF_SPIKE_PROTECTION_GATE.REQUIRE_ADX_SLOPE_RISING || adxStillRising);
    
    if (shouldBlock) {
      rejectedByHardGates++;
      const blockReason = `LTF_SPIKE_PROTECTION: LONG blocked - 15m StochRSI K=${stochRsiK15m.toFixed(0)} < ${LTF_SPIKE_PROTECTION_GATE.BLOCK_LONG_IF_15M_K_BELOW} (bearish momentum spike)`;
      perSymbolGateAttribution.set(symbol, { gate: 'LTF_SPIKE_PROTECTION', details: blockReason });
      
      logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.GATE} 🚫 ${blockReason}`);
      
      await logRejectionWithAI(supabase, userId, symbol, blockReason, {
        gate: "LTF_SPIKE_PROTECTION",
        derivedDirection,
        stochRsiK15m,
        momentumScore,
        adxSlope,
        adx,
      }, trendData, riskParams.ai_analysis_enabled !== false, earlyOrderFlowAnalysis);
      continue;
    }
  }
}
```

---

### Step 3: Strengthen LTF Confirmation Gate

**File**: `supabase/functions/_shared/constants.ts`

Update existing `LTF_CONFIRMATION_GATE`:

```typescript
export const LTF_CONFIRMATION_GATE = {
  ENABLED: true,
  
  // ===== WHEN TO APPLY =====
  REQUIRE_STRONG_4H: true,
  MIN_4H_CONFIDENCE: 55,
  
  // ===== LTF NEUTRALITY CHECK =====
  BLOCK_IF_BOTH_LTF_NEUTRAL: true,
  
  // ===== GRADUATED POSITION SIZING (UPDATED) =====
  SIZING: {
    FULL_ALIGNMENT: 1.0,
    PARTIAL_ALIGNMENT: 0.70,
    // TIGHTENED: Reduce from 0.35 to 0.25 when both LTF neutral
    NO_ALIGNMENT: 0.25,  // Was 0.35
    COUNTER_ALIGNMENT_BLOCK: true,
  },
  
  // ===== ADX THRESHOLDS =====
  MIN_ADX_FOR_CHECK: 25,
  STRICT_ADX_THRESHOLD: 45,
  
  // ===== NEW: BLOCK INSTEAD OF REDUCE WHEN MOMENTUM ALSO OPPOSING =====
  // If both LTF neutral AND momentum opposing, BLOCK entirely
  BLOCK_WHEN_MOMENTUM_ALSO_OPPOSING: true,
  MOMENTUM_OPPOSING_THRESHOLD: 15,  // |score| > 15 in opposing direction
  
  LOG_GATE_CHECKS: true,
};
```

**File**: `supabase/functions/strategy-analyzer/index.ts`

Enhance the existing LTF confirmation check (~line 4330):

```typescript
} else if (is1hNeutral && is30mNeutral) {
  // BOTH LTF neutral - check if momentum is also opposing
  const momentumOpposing = 
    (derivedDirection === 'long' && smartMomentum.score < -LTF_CONFIRMATION_GATE.MOMENTUM_OPPOSING_THRESHOLD) ||
    (derivedDirection === 'short' && smartMomentum.score > LTF_CONFIRMATION_GATE.MOMENTUM_OPPOSING_THRESHOLD);
  
  if (LTF_CONFIRMATION_GATE.BLOCK_WHEN_MOMENTUM_ALSO_OPPOSING && momentumOpposing) {
    // Double-warning: LTF neutral + momentum opposing = BLOCK
    rejectedByHardGates++;
    const blockReason = `LTF_CONFIRMATION_BLOCK: ${derivedDirection.toUpperCase()} at 4h=${tf4hDir} blocked - BOTH 1h/30m neutral AND momentum opposing (${smartMomentum.score.toFixed(0)})`;
    perSymbolGateAttribution.set(symbol, { 
      gate: 'LTF_BOTH_NEUTRAL_PLUS_MOMENTUM',
      details: blockReason,
      wouldPassWith: 'Either 1h or 30m must align with direction, OR momentum must not oppose'
    });
    
    logger.forSymbol(symbol).warn(`${LOG_CATEGORIES.GATE} 🚫 ${blockReason}`);
    
    await logRejectionWithAI(supabase, userId, symbol, blockReason, {
      gate: "LTF_BOTH_NEUTRAL_PLUS_MOMENTUM",
      derivedDirection,
      tf4hDir,
      tf1hDir,
      tf30mDir,
      momentumScore: smartMomentum.score,
      ltfConfirmationRequired: true,
    }, trendData, riskParams.ai_analysis_enabled !== false, earlyOrderFlowAnalysis);
    continue;
  }
  
  // Otherwise, reduce to probe size
  ltfConfirmationPositionMultiplier = LTF_CONFIRMATION_GATE.SIZING.NO_ALIGNMENT;
  ltfConfirmationApplied = true;
  
  logger.forSymbol(symbol).info(`${LOG_CATEGORIES.GATE} ⚠️ LTF_NEUTRAL: ${derivedDirection.toUpperCase()} at 4h=${tf4hDir} but 1h/30m both neutral - reducing to ${(LTF_CONFIRMATION_GATE.SIZING.NO_ALIGNMENT * 100).toFixed(0)}% position`);
}
```

---

### Step 4: Fix ADX Override Logic (Architectural Fix)

**File**: `supabase/functions/strategy-analyzer/index.ts`

Modify the ADX exception in the momentum direction check to NOT override momentum slope:

Current (~line 4601):
```typescript
const isStrongADX = adx >= MOMENTUM_DIRECTION_ALIGNMENT.ALLOW_NEUTRAL_ABOVE_ADX;
```

Add check that momentum is not accelerating:
```typescript
const momentumSlope = trendData?.momentum?.macdSlope ?? 0;
const isMomentumAccelerating = 
  (derivedDirection === 'short' && momentumSlope > 0) ||
  (derivedDirection === 'long' && momentumSlope < 0);

// ADX can override NEUTRAL momentum, but NOT accelerating opposing momentum
const isStrongADX = adx >= MOMENTUM_DIRECTION_ALIGNMENT.ALLOW_NEUTRAL_ABOVE_ADX && !isMomentumAccelerating;
```

---

### Step 5: Add Documentation

**File**: `docs/gates/MOMENTUM_SLOPE_GATE.md` (NEW)

```markdown
# HARD GATE: Momentum Slope Gate

## Overview

This gate prevents entries when momentum is **accelerating in the opposing direction**.
It addresses the fundamental flaw where ADX strength was used to override directional momentum checks.

## Core Principle

> "ADX answers 'Is there trend strength?' - it does NOT answer 'Should we enter?'"
> "Accelerating opposing momentum = STRONGER block, not weaker"

## Gate Hierarchy Position

This gate is **Priority 1** - it runs BEFORE:
- Momentum Direction Alignment (polarity check)
- LTF Confirmation
- ADX-based exceptions

**ADX does NOT override this gate.**

## Logic

```
IF opposing momentum score (|score| > 15 in wrong direction)
  AND momentum slope indicates acceleration
    (slope > 0 for bullish acceleration blocking SHORT)
    (slope < 0 for bearish acceleration blocking LONG)
THEN
  HARD BLOCK - no exceptions
```

## Example (BNBUSDT Case)

| Metric | Value | Analysis |
|--------|-------|----------|
| Trade Direction | SHORT | - |
| Momentum Score | +48 | Strongly bullish (opposing) |
| Momentum Slope | +0.05 | Accelerating bullish |
| ADX | 57.7 | Very strong trend |
| **Old Result** | ALLOWED | ADX override bypassed momentum check |
| **New Result** | BLOCKED | Accelerating opposing momentum = hard block |
```

---

## Technical Details

### Gate Priority Order (Post-Fix)

```text
Priority   Gate                          Can ADX Override?
─────────────────────────────────────────────────────────
1          MOMENTUM_SLOPE_GATE           NO
2          LTF_SPIKE_PROTECTION          NO
3          LTF_CONFIRMATION              Contextual only
4          MOMENTUM_DIRECTION_ALIGNMENT  Only for neutral (not accelerating)
5          ADX Strength                  Context amplifier
6          HTF Bias                      Yes
7          Quality & Sizing              Yes
```

### What This Fixes

| Trade Type | Before | After |
|------------|--------|-------|
| SHORT during bullish acceleration | Allowed (ADX override) | BLOCKED |
| LONG during bearish acceleration | Allowed (ADX override) | BLOCKED |
| Entry at 15m momentum spike | Allowed | BLOCKED |
| Entry with LTF neutral + momentum opposing | 35% position | BLOCKED |

---

## Files to Modify

1. `supabase/functions/_shared/constants.ts` - Add new gate constants
2. `supabase/functions/strategy-analyzer/index.ts` - Add gate implementations
3. `docs/gates/MOMENTUM_SLOPE_GATE.md` - New documentation

---

## Impact Assessment

| Metric | Before | After |
|--------|--------|-------|
| Counter-momentum SHORT entries | Allowed with high ADX | BLOCKED |
| 15m spike entries | Allowed | BLOCKED |
| LTF neutral + momentum opposing | 35% position | BLOCKED |
| False positive rate (blocking valid entries) | Low | Slightly higher (acceptable) |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Over-blocking valid early trend entries | Momentum slope check only triggers when BOTH score AND slope oppose |
| Blocking valid mean-reversion | Mean-reversion entries have momentum aligned with direction (not opposing) |
| Reduced signal count | Acceptable trade-off for higher win rate |
