# Plan: Regime-Aware Gate System with Squeeze Momentum Bypass

## Problem Summary

The `NEUTRAL_4H_LOW_CONFIDENCE` gate blocks BTCUSDT entries despite:
- Confirmed momentum (state=confirmed, genuineMomentum=true)
- Bullish MACD (+7.87, expanding)
- Oversold StochRSI (24.6)
- Bollinger squeeze on multiple timeframes
- Order flow bullish (score 68)

**Root Cause**: The momentum bypass requires `ADX >= 25` (line 7216), but ADX is 22.3. This contradicts the existing `ADX_THRESHOLDS.SQUEEZE_MINIMUM: 15` constant.

## Solution Architecture

We will implement a **regime-aware gate hierarchy** where gates compete based on context rather than veto sequentially.

```
CURRENT FLOW (Broken):
  Gate fires -> Absolute block -> Done

NEW FLOW (Regime-aware):
  Detect regime (squeeze/trending/ranging)
    -> Select appropriate gate weights
    -> Gates COMPETE (weighted voting)
    -> Final decision based on score
```

---

## Phase 1: Add Squeeze Momentum Bypass Parameters

**File**: `supabase/functions/_shared/constants.ts`

Add new constants for squeeze-aware momentum bypass:

```typescript
export const SQUEEZE_MOMENTUM_BYPASS_PARAMS = {
  ENABLED: true,
  
  // ===== SQUEEZE DETECTION REQUIREMENTS =====
  // Use existing detectBollingerSqueeze() output
  MIN_SQUEEZE_INTENSITY: 60,           // squeezeIntensity >= 60 (tight squeeze)
  MAX_BB_WIDTH_PERCENTILE: 25,         // bbWidthPercentile <= 25 (bottom 25%)
  
  // ===== MOMENTUM REQUIREMENTS FOR BYPASS =====
  // Much lower ADX threshold during squeeze (ADX naturally low in compression)
  MIN_ADX: 18,                         // Down from 25 - squeeze environments have low ADX
  REQUIRE_MOMENTUM_CONFIRMED: true,    // momentum.state === "confirmed"
  REQUIRE_GENUINE_MOMENTUM: true,      // momentum.genuineMomentum === true
  
  // ===== MACD REQUIREMENTS =====
  REQUIRE_MACD_EXPANDING: true,        // MACD histogram must be expanding
  MIN_MACD_MAGNITUDE: 2.0,             // Minimum histogram magnitude for direction confidence
  
  // ===== STOCHRSI LOADING ZONE =====
  // For LONG: StochRSI should be in lower half (not overbought)
  // For SHORT: StochRSI should be in upper half (not oversold)
  LONG_MAX_STOCHRSI_K: 55,             // K <= 55 for long entries during squeeze
  SHORT_MIN_STOCHRSI_K: 45,            // K >= 45 for short entries during squeeze
  
  // ===== ORDER FLOW CONFIRMATION (OPTIONAL BUT STRENGTHENS) =====
  USE_ORDER_FLOW_CONFIRMATION: true,
  MIN_ORDER_FLOW_SCORE: 55,            // Order flow score >= 55
  
  // ===== POSITION SIZING =====
  POSITION_SIZE_MULTIPLIER: 0.60,      // 60% position for squeeze entries (moderate risk)
  
  // ===== MULTI-TIMEFRAME SQUEEZE BONUS =====
  // If squeeze detected on multiple timeframes, increase confidence
  MULTI_TF_SQUEEZE_BONUS: true,
  MULTI_TF_POSITION_MULTIPLIER: 0.75,  // 75% position if multi-TF squeeze confirmed
  
  // ===== LOGGING =====
  LOG_BYPASS_DETAILS: true,
} as const;
```

---

## Phase 2: Implement Multi-Timeframe Squeeze Detection

**File**: `supabase/functions/_shared/smart-momentum.ts`

Add function to detect squeeze across multiple timeframes:

```typescript
export interface MultiTimeframeSqueeze {
  timeframesInSqueeze: number;         // Count of TFs in squeeze (0-4)
  avgSqueezeIntensity: number;         // Average intensity across TFs
  dominantDirection: "long" | "short" | "none";
  isMultiTFSqueeze: boolean;           // 2+ timeframes in squeeze
  squeezeByTimeframe: {
    "15m": BollingerSqueezeResult | null;
    "30m": BollingerSqueezeResult | null;
    "1h": BollingerSqueezeResult | null;
    "4h": BollingerSqueezeResult | null;
  };
}

export function detectMultiTimeframeSqueeze(
  trendData: any,
  squeeze1h: BollingerSqueezeResult
): MultiTimeframeSqueeze {
  // Extract squeeze data from trendData.volatility or calculate
  // Count timeframes in squeeze
  // Determine dominant breakout direction if any
  // Return comprehensive multi-TF squeeze status
}
```

---

## Phase 3: Modify NEUTRAL_4H_LOW_CONFIDENCE Gate

**File**: `supabase/functions/strategy-analyzer/index.ts`

**Location**: Lines 7208-7268

**Change**: Add squeeze momentum bypass BEFORE the standard momentum bypass check:

```typescript
if (is4hNeutral) {
  // ============= NEW: SQUEEZE MOMENTUM BYPASS =============
  // In squeeze regimes, neutral trends are EXPECTED - use momentum for direction
  const squeezeBypassEnabled = SQUEEZE_MOMENTUM_BYPASS_PARAMS.ENABLED;
  const bbSqueeze = bbSqueezeResult; // From earlier calculation (line ~2912)
  
  const isValidSqueeze = 
    bbSqueeze.isSqueeze && 
    bbSqueeze.squeezeIntensity >= SQUEEZE_MOMENTUM_BYPASS_PARAMS.MIN_SQUEEZE_INTENSITY;
  
  const momentumQualifiesForSqueeze = 
    momentum?.state === "confirmed" &&
    momentum?.genuineMomentum === true &&
    adx >= SQUEEZE_MOMENTUM_BYPASS_PARAMS.MIN_ADX &&  // 18, not 25!
    momentum?.macdExpanding === true &&
    Math.abs(momentum?.macdHistogram || 0) >= SQUEEZE_MOMENTUM_BYPASS_PARAMS.MIN_MACD_MAGNITUDE;
  
  // Direction from MACD histogram during squeeze
  const squeezeDirection = (momentum?.macdHistogram || 0) > 0 ? "long" : "short";
  
  // StochRSI loading zone check
  const stochRsiInLoadingZone = squeezeDirection === "long"
    ? stochRsiK1h <= SQUEEZE_MOMENTUM_BYPASS_PARAMS.LONG_MAX_STOCHRSI_K
    : stochRsiK1h >= SQUEEZE_MOMENTUM_BYPASS_PARAMS.SHORT_MIN_STOCHRSI_K;
  
  // Order flow confirmation (optional strength boost)
  const orderFlowConfirms = !SQUEEZE_MOMENTUM_BYPASS_PARAMS.USE_ORDER_FLOW_CONFIRMATION ||
    (earlyOrderFlowAnalysis?.score >= SQUEEZE_MOMENTUM_BYPASS_PARAMS.MIN_ORDER_FLOW_SCORE &&
     earlyOrderFlowAnalysis?.signal === (squeezeDirection === "long" ? "buy" : "sell"));
  
  const squeezeBypassApplies = 
    squeezeBypassEnabled &&
    isValidSqueeze &&
    momentumQualifiesForSqueeze &&
    stochRsiInLoadingZone;
  
  if (squeezeBypassApplies) {
    // BYPASS THE GATE - squeeze + momentum is sufficient evidence
    logger.forSymbol(symbol).info(`${LOG_CATEGORIES.SUCCESS} SQUEEZE_MOMENTUM_BYPASS: Bypassing NEUTRAL_4H_LOW_CONFIDENCE`);
    logger.forSymbol(symbol).info(`   Squeeze: intensity=${bbSqueeze.squeezeIntensity}%, width_pctl=${bbSqueeze.bbWidthPercentile}%`);
    logger.forSymbol(symbol).info(`   Momentum: confirmed=${momentum?.state}, genuine=${momentum?.genuineMomentum}, MACD=${momentum?.macdHistogram?.toFixed(2)}`);
    logger.forSymbol(symbol).info(`   Direction derived: ${squeezeDirection.toUpperCase()}, StochRSI K=${stochRsiK1h.toFixed(1)}`);
    
    // Apply position size multiplier for squeeze entries
    squeezeBypassPositionMultiplier = orderFlowConfirms 
      ? SQUEEZE_MOMENTUM_BYPASS_PARAMS.MULTI_TF_POSITION_MULTIPLIER
      : SQUEEZE_MOMENTUM_BYPASS_PARAMS.POSITION_SIZE_MULTIPLIER;
    
    // Override derived direction if not set
    if (!derivedDirection || derivedDirection === "neutral") {
      derivedDirection = squeezeDirection;
      derivedSource = "squeeze-momentum-bypass";
    }
    
    // DON'T reject - continue to next gates
  } else {
    // ============= EXISTING: CONFIRMED MOMENTUM BYPASS =============
    const momentumConfirmedBypass = (
      momentum?.state === "confirmed" &&
      momentum?.genuineMomentum === true &&
      adx >= 25 &&  // Keep original for non-squeeze scenarios
      (momentum?.macdExpanding === true || momentum?.adxRising === true)
    );
    
    const passesNeutralGate = conf4hForGate >= 55 || 
      (is1hDirectional && conf1hForGate >= 50) ||
      momentumConfirmedBypass;
    
    if (!passesNeutralGate) {
      // Reject as before
      rejectedByHardGates++;
      // ... existing rejection logic
      continue;
    }
  }
}
```

---

## Phase 4: Add Regime Context to Gate Decisions

**File**: `supabase/functions/strategy-analyzer/index.ts`

Create a regime context object early in the symbol loop that other gates can reference:

```typescript
// After masterRegime calculation (~line 3000)
const regimeContext = {
  isSqueeze: bbSqueeze.isSqueeze,
  squeezeIntensity: bbSqueeze.squeezeIntensity,
  isTransitional: masterRegime.regime === "NORMAL" && adx >= 15 && adx < 22,
  isTrending: adx >= 25,
  isRanging: adx < 15,
  
  // Gate behavior modifiers based on regime
  gateModifiers: {
    trendConfidenceRequired: bbSqueeze.isSqueeze ? 0 : (adx >= 30 ? 70 : 55),
    momentumWeight: bbSqueeze.isSqueeze ? 1.5 : 1.0,  // Momentum matters MORE in squeeze
    trendWeight: bbSqueeze.isSqueeze ? 0.5 : 1.0,     // Trend matters LESS in squeeze
  }
};
```

This context can then be used by other gates to adjust their behavior:

- During squeeze: Lower trend confidence requirements, higher momentum weight
- During trending: Normal trend requirements
- During ranging (ADX < 15): Block most entries

---

## Phase 5: Add Squeeze Breakout Detection Enhancement

**File**: `supabase/functions/_shared/constants.ts`

Add squeeze breakout as a PRIMARY signal type:

```typescript
export const SQUEEZE_BREAKOUT_SIGNAL_PARAMS = {
  ENABLED: true,
  
  // ===== BREAKOUT DETECTION =====
  // Triggered when price crosses band during or just after squeeze
  DETECT_BREAKOUT_DURING_SQUEEZE: true,
  DETECT_BREAKOUT_POST_SQUEEZE: true,
  POST_SQUEEZE_LOOKBACK_BARS: 3,       // Check last 3 bars for recent squeeze exit
  
  // ===== SIGNAL GENERATION =====
  GENERATE_SIGNAL_ON_BREAKOUT: true,
  SIGNAL_CONFIDENCE_BASE: 65,          // Base confidence for squeeze breakout signals
  SIGNAL_CONFIDENCE_BONUS_PER_TF: 5,   // +5% confidence per additional TF in squeeze
  
  // ===== CONFIRMATION REQUIREMENTS =====
  REQUIRE_VOLUME_CONFIRMATION: true,
  MIN_VOLUME_RATIO: 1.2,               // 20% above average volume
  REQUIRE_MACD_ALIGNMENT: true,        // MACD must agree with breakout direction
  
  // ===== RISK PARAMETERS =====
  STOP_LOSS_ATR_MULTIPLIER: 1.5,       // Tighter stop for breakouts
  TAKE_PROFIT_ATR_MULTIPLIER: 3.0,     // Higher R:R for breakouts
  
  // ===== POSITION SIZING =====
  POSITION_SIZE_MULTIPLIER: 0.70,      // 70% position for breakout entries
} as const;
```

---

## Phase 6: Update Signal Rejection Logging

**File**: `supabase/functions/strategy-analyzer/index.ts`

Update rejection logs to include squeeze context so we can track when squeeze bypass was checked but failed:

```typescript
// In rejection logging
{
  gate: "NEUTRAL_4H_LOW_CONFIDENCE",
  // ... existing fields
  squeezeBypassChecked: true,
  squeezeBypassResult: {
    isSqueeze: bbSqueeze.isSqueeze,
    squeezeIntensity: bbSqueeze.squeezeIntensity,
    momentumQualified: momentumQualifiesForSqueeze,
    stochRsiInZone: stochRsiInLoadingZone,
    orderFlowConfirms: orderFlowConfirms,
    failedRequirement: squeezeBypassApplies ? null : "identify_which_failed"
  }
}
```

---

## Summary of Changes

| Phase | File | Change | Purpose |
|-------|------|--------|---------|
| 1 | constants.ts | Add SQUEEZE_MOMENTUM_BYPASS_PARAMS | Define squeeze bypass rules |
| 2 | smart-momentum.ts | Add detectMultiTimeframeSqueeze | Multi-TF squeeze detection |
| 3 | strategy-analyzer/index.ts | Modify NEUTRAL_4H_LOW_CONFIDENCE gate | Add squeeze bypass logic |
| 4 | strategy-analyzer/index.ts | Add regimeContext object | Enable regime-aware gate decisions |
| 5 | constants.ts | Add SQUEEZE_BREAKOUT_SIGNAL_PARAMS | Define squeeze breakout as signal type |
| 6 | strategy-analyzer/index.ts | Update rejection logging | Track squeeze bypass attempts |

---

## Expected Behavior After Implementation

| Scenario | Before | After |
|----------|--------|-------|
| BTCUSDT: ADX 22.3, squeeze, momentum confirmed | Blocked by NEUTRAL_4H_LOW_CONFIDENCE | **PASSES via SQUEEZE_MOMENTUM_BYPASS** |
| BTCUSDT: ADX 22, no squeeze, momentum confirmed | Blocked (ADX < 25) | Still blocked (no squeeze context) |
| ETHUSDT: ADX 18, squeeze, MACD bearish, StochRSI 75 | Would be blocked | **PASSES as SHORT via squeeze bypass** |
| Random coin: ADX 22, no squeeze, weak momentum | Blocked | Still blocked (safety maintained) |

---

## Safety Considerations

1. **Position sizing**: Squeeze bypass entries use 60-75% position (reduced risk)
2. **StochRSI loading zone**: Prevents chasing overbought/oversold
3. **Momentum confirmation required**: Must have confirmed, genuine momentum
4. **MACD expanding required**: Ensures momentum is building, not fading
5. **ADX minimum 18**: Prevents entries in dead-flat markets (ADX < 15)

---

## Validation Criteria

After implementation, we should see:
1. BTCUSDT in current conditions would generate a LONG signal
2. Rejection logs show `squeezeBypassApplies: true` when conditions met
3. Position sizes correctly reduced for squeeze entries
4. No increase in false positives during ranging (non-squeeze) markets