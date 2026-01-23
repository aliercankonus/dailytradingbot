

# Plan: Add Momentum & Order Flow Fallback in deriveTradeDirection

## Problem Summary
The current `deriveTradeDirection` function relies heavily on timeframe trend analysis (4h, 1h, 30m) to determine trade direction. When these trends conflict or are neutral, the function returns `direction: null`, causing a deadlock where:
- Momentum score indicates bullish (e.g., +27)
- Order flow shows "buy" signal
- StochRSI is oversold (K=5)
- Yet **no signal is generated** because timeframe trends don't agree

This is why the system has generated **zero LONG signals** despite bullish market conditions.

## Solution Overview
Add a new fallback mechanism at the end of `deriveTradeDirection` that uses **momentum score** and **order flow** to determine direction when:
1. All timeframes are neutral OR
2. Timeframes are conflicting with no clear winner

## Technical Implementation

### File: `supabase/functions/_shared/constants.ts`

Add new configuration parameters:

```typescript
// ============= MOMENTUM FALLBACK DIRECTION PARAMS =============
// When timeframe trends conflict or are neutral, use momentum + order flow
export const MOMENTUM_FALLBACK_DIRECTION_PARAMS = {
  // Enable this fallback mechanism
  ENABLED: true,
  
  // ===== MOMENTUM SCORE THRESHOLDS =====
  // Minimum absolute momentum score to derive direction
  MIN_MOMENTUM_SCORE: 20,           // |score| >= 20 to derive direction
  // Strong momentum threshold for higher confidence
  STRONG_MOMENTUM_SCORE: 35,        // |score| >= 35 = strong signal
  
  // ===== ORDER FLOW REQUIREMENTS =====
  // Minimum order flow score to support momentum direction
  MIN_ORDER_FLOW_SCORE: 50,         // Order flow must be >= 50
  // Strong order flow for confirmation
  STRONG_ORDER_FLOW_SCORE: 65,      // >= 65 = strong confirmation
  
  // ===== STOCHRSI CONTEXT =====
  // If StochRSI is extreme AND momentum confirms, boost confidence
  STOCHRSI_EXTREME_OVERSOLD: 15,    // K <= 15 = oversold context for LONG
  STOCHRSI_EXTREME_OVERBOUGHT: 85,  // K >= 85 = overbought context for SHORT (mean reversion)
  
  // ===== ADX REQUIREMENTS =====
  // Minimum ADX for momentum fallback (still need some trend structure)
  MIN_ADX: 18,
  
  // ===== POSITION SIZING =====
  // Reduced position for momentum-derived entries
  BASE_POSITION_MULTIPLIER: 0.55,   // 55% of normal
  STRONG_POSITION_MULTIPLIER: 0.70, // 70% when both momentum + order flow are strong
  
  // ===== CONFIDENCE CALCULATION =====
  // Base confidence for momentum fallback
  BASE_CONFIDENCE: 50,
  // Maximum confidence achievable
  MAX_CONFIDENCE: 65,
} as const;
```

### File: `supabase/functions/_shared/scoring.ts`

Modify the `deriveTradeDirection` function to add a new fallback before the final "no direction" return:

**Location**: Insert before line 2352 (the final "No clear direction" return)

```typescript
// ============= PRIORITY 7: MOMENTUM + ORDER FLOW FALLBACK =============
// When all other methods fail, use momentum score + order flow to derive direction
// This prevents the "deadlock" where bullish momentum + buy order flow = no signal
if (MOMENTUM_FALLBACK_DIRECTION_PARAMS.ENABLED) {
  const P = MOMENTUM_FALLBACK_DIRECTION_PARAMS;
  
  // Get momentum data from trendData
  const momentumScore = trendData.smartMomentum?.score ?? trendData.momentum?.score ?? 0;
  const stochK = trendData.stochRsi?.k ?? trendData.stochRsi1h?.k ?? 50;
  
  // Check if we have strong enough momentum signal
  const absMomentum = Math.abs(momentumScore);
  if (absMomentum >= P.MIN_MOMENTUM_SCORE && adx >= P.MIN_ADX) {
    const momentumDirection: TradeDirection = momentumScore > 0 ? "long" : "short";
    
    // Check order flow alignment
    const ofScore = orderFlowData?.score ?? 0;
    const ofSignal = orderFlowData?.signal?.toLowerCase() ?? "";
    const orderFlowDirection = 
      (ofSignal.includes("buy") || ofSignal === "bullish") ? "long" :
      (ofSignal.includes("sell") || ofSignal === "bearish") ? "short" : null;
    
    const orderFlowAligned = orderFlowDirection === momentumDirection;
    const orderFlowStrong = ofScore >= P.STRONG_ORDER_FLOW_SCORE && orderFlowAligned;
    const orderFlowSupports = ofScore >= P.MIN_ORDER_FLOW_SCORE && orderFlowAligned;
    
    // Check StochRSI context (oversold favors LONG, overbought favors SHORT for mean reversion)
    const stochOversold = stochK <= P.STOCHRSI_EXTREME_OVERSOLD;
    const stochOverbought = stochK >= P.STOCHRSI_EXTREME_OVERBOUGHT;
    const stochConfirmsLong = momentumDirection === "long" && stochOversold;
    const stochConfirmsShort = momentumDirection === "short" && stochOverbought;
    const stochConfirms = stochConfirmsLong || stochConfirmsShort;
    
    // Calculate confidence based on signal strength
    let confidence = P.BASE_CONFIDENCE;
    let positionMultiplier = P.BASE_POSITION_MULTIPLIER;
    
    // Strong momentum bonus
    if (absMomentum >= P.STRONG_MOMENTUM_SCORE) {
      confidence += 5;
    }
    
    // Order flow confirmation bonus
    if (orderFlowStrong) {
      confidence += 8;
      positionMultiplier = P.STRONG_POSITION_MULTIPLIER;
    } else if (orderFlowSupports) {
      confidence += 4;
      positionMultiplier = 0.60;
    }
    
    // StochRSI extreme context bonus (mean reversion setup)
    if (stochConfirms) {
      confidence += 5;
    }
    
    confidence = Math.min(confidence, P.MAX_CONFIDENCE);
    
    // Only proceed if we have at least one confirmation (order flow OR stochRSI)
    const hasConfirmation = orderFlowSupports || stochConfirms;
    
    if (hasConfirmation) {
      reasons.push(`MOMENTUM FALLBACK: score=${momentumScore.toFixed(0)} → ${momentumDirection.toUpperCase()}`);
      reasons.push(`Order flow: score=${ofScore.toFixed(0)}, signal=${ofSignal}, aligned=${orderFlowAligned}`);
      reasons.push(`StochRSI K=${stochK.toFixed(0)} (${stochOversold ? 'oversold' : stochOverbought ? 'overbought' : 'normal'})`);
      reasons.push(`ADX=${adx.toFixed(1)} | Confidence=${confidence.toFixed(0)}% | Position=${(positionMultiplier * 100).toFixed(0)}%`);
      reasons.push("Timeframes neutral/conflicting - momentum + order flow determining direction");
      
      return {
        direction: momentumDirection,
        confidence,
        source: "momentum-fallback",
        reasons,
        positionSizeMultiplier: positionMultiplier,
        isMomentumFallback: true,
      };
    } else {
      // Log why we didn't use the fallback (for debugging)
      reasons.push(`MOMENTUM FALLBACK SKIPPED: momentum=${momentumScore.toFixed(0)} but no confirmation (OF aligned=${orderFlowAligned}, stochConfirms=${stochConfirms})`);
    }
  }
}
```

### Update DirectionResult Interface

Also need to update the `DirectionResult` interface to include the new field:

```typescript
interface DirectionResult {
  direction: TradeDirection;
  confidence: number;
  source: string;
  reasons: string[];
  positionSizeMultiplier?: number;
  isWeightedDerivation?: boolean;
  hasPersistenceBonus?: boolean;
  orderFlowTiebreaker?: boolean;
  isMomentumFallback?: boolean;  // NEW: Added for momentum fallback
}
```

## Logic Flow After Implementation

```text
deriveTradeDirection():
  1. WEIGHTED DIRECTION (weighted sum of 4h/1h/30m)
     └─ If passes: Return direction
     
  2. ORDER FLOW TIEBREAKER (when weighted sum is marginal)
     └─ If passes: Return direction
     
  3. PRICE ACTION MOMENTUM OVERRIDE
     └─ If strong price move: Return direction
     
  4. INDIVIDUAL TIMEFRAME CHECKS (4h → 1h → 30m)
     └─ If any strong enough: Return direction
     
  5. CONSECUTIVE CANDLE OVERRIDE
     └─ If 5+ consecutive bars: Return direction
     
  6. EARLY TREND / 2-OF-3 / PRIMARY TREND fallbacks
     └─ Various legacy fallbacks
     
  7. **NEW: MOMENTUM + ORDER FLOW FALLBACK** ← Added here
     └─ If momentum >= 20 AND (order flow aligned OR StochRSI extreme):
        Return direction with reduced position
     
  8. Return { direction: null } - No clear direction
```

## Expected Impact

After implementation, the system will:
1. **Generate LONG signals** when momentum is bullish (+20) and order flow is "buy", even when timeframes are neutral/conflicting
2. **Break the deadlock** that caused zero LONG signals in the past 48+ hours
3. **Use conservative position sizing** (55-70%) for momentum-derived entries
4. **Require at least one confirmation** (order flow OR StochRSI extreme) to prevent false signals

## Files to Modify
1. `supabase/functions/_shared/constants.ts` - Add `MOMENTUM_FALLBACK_DIRECTION_PARAMS`
2. `supabase/functions/_shared/scoring.ts` - Add momentum fallback logic in `deriveTradeDirection` and update `DirectionResult` interface

## Testing Criteria
After deployment, verify:
- Rejection logs show "MOMENTUM FALLBACK" entries being considered
- LONG signals are generated when momentum > 20 and order flow is bullish
- Position sizes are correctly reduced (55-70%)
- No false signals in strongly bearish markets (gate checks still apply downstream)

