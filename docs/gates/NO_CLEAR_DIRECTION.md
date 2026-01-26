# NO_CLEAR_DIRECTION Gate - Pseudo Code

## Overview

The `NO_CLEAR_DIRECTION` rejection occurs when the `deriveTradeDirection()` function exhausts all 12 tiered derivation paths without establishing a confident trade direction. This gate ensures no trades are entered in truly ambiguous market conditions.

**Critical Understanding**: This gate is not a filter — it is a terminal decision:
> "If the engine cannot confidently infer direction after exhausting structured reasoning, do nothing."

This gate protects capital by design, not by blunt thresholds.

---

## Architecture Improvements (Implemented)

### 1. DirectionContext Object (Unified Direction Ownership)

All tiers now populate a centralized `DirectionContext` object instead of scattered direction variables:

```typescript
interface DirectionContext {
  proposedDirection: "long" | "short" | null;
  evidenceType: "HTF_CONSENSUS" | "MOMENTUM" | "ORDER_FLOW" | "STOCHRSI" | "PRICE_ACTION" | "EXHAUSTION";
  tier: number;
  confidence: number;
  positionMultiplier: number;
  isCounterTrend: boolean;
  riskClass: "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
  evidenceStrength: number;  // 0-100
  conflictsWith: string[];   // Other tiers that disagree
  tierSource: string;        // Canonical name of the tier
}
```

**Benefits:**
- Centralized direction rationale
- Improved traceability for debugging
- Unified conflict resolution
- Better post-trade analytics

### 2. Tier 0.25 Exhaustion Override Tightening

The exhaustion reversal tier now has stricter entry requirements:

```
// BEFORE: Could fire in strong trends
IF (isDeepOversold OR isHighAdxDeclining):
  RETURN reversal direction

// AFTER: Requires regime AND HTF weakening
IF regime IN [EXHAUSTION, RANGE]:
  IF conf4h < 60% AND conf1h < 55%:  // HTF weakening required
    IF (isDeepOversold OR isHighAdxDeclining):
      RETURN reversal direction
```

This prevents premature exhaustion entries while HTF structure is still dominant.

### 3. Late-Tier Epistemic Floor

For Tier >= 8 in RANGE regime, a minimum of 2 independent evidence types is now required:

```
IF tier >= 8 AND regime == RANGE:
  requiredEvidenceTypes = 2  // Epistemic floor
  
  evidenceCount = 0
  IF momentumConfirms: evidenceCount++
  IF orderFlowAligns: evidenceCount++
  IF stochRsiExtreme: evidenceCount++
  IF priceActionConfirms: evidenceCount++
  
  IF evidenceCount < requiredEvidenceTypes:
    SKIP this tier  // Insufficient evidence
```

This prevents low-conviction "somehow justified" trades in choppy markets.

### 4. Tier 10/11 Mutual Exclusivity

Tier 10 (Momentum + Order Flow fallback) and Tier 11 (Exhaustion escape) are now explicitly mutually exclusive:

```
// Tier 10: Trend continuation without TF structure
// Tier 11: Mean reversion ONLY

IF tier10Fired:
  SKIP Tier 11 entirely
  
IF tier11Applies:
  REQUIRE regime == EXHAUSTION
  REQUIRE NOT tier10Conditions
```

**Distinction:**
- **Tier 10**: Trend continuation when timeframe structure is weak
- **Tier 11**: Mean reversion at extremes (never continuation)

---

## Core Concept

```
FUNCTION deriveTradeDirection(trendData, primaryTrend, orderFlowData) → DirectionResult

  IF no trendData:
    RETURN null + "No trend data"
  
  // Initialize DirectionContext for unified ownership
  directionContext = new DirectionContext()
  
  // Extract multi-timeframe trends and confidence
  trend4h, conf4h = trendData.timeframes['4h']
  trend1h, conf1h = trendData.timeframes['1h']
  trend30m, conf30m = trendData.timeframes['30m']
  
  // Extract momentum and volatility data
  adx = trendData.volatility.adx
  adxSlope = trendData.volatility.adxSlope
  
  // ============= PRE-TIER: REGIME CLASSIFICATION =============
  regime = classifyDirectionRegime(adx, adxSlope)
  // Returns: STRONG_TREND | EARLY_TREND | RANGE | EXHAUSTION
  
  // Regime dynamically adjusts:
  // - Tier 1 consensus threshold (relaxed in STRONG_TREND)
  // - StochRSI importance (suppressed in trending regimes)
  // - Tier 2 minimum score
  // - Epistemic floor requirements for late tiers
  
  // ============= TIER-BASED DIRECTION DERIVATION =============
  // Try each tier in priority order until direction is found
  // Each tier populates DirectionContext with evidence
  
  TRY Tier 0: Weighted HTF Consensus (Primary)
  TRY Tier 0.25: Exhaustion Reversal Override (TIGHTENED - requires regime + HTF weakening)
  TRY Tier 0.5: Momentum-Aware Weighted Override
  TRY Tier 1: Price Action Momentum Override
  TRY Tier 2: Strong 4h Trend
  TRY Tier 3: Strong 1h Trend
  TRY Tier 4: Consecutive Candle Momentum
  TRY Tier 5: Building Trend Detection
  TRY Tier 6: 1h+30m Alignment
  TRY Tier 7: 2-of-3 Timeframe Agreement
  TRY Tier 8: Early Momentum 30m Entry (EPISTEMIC FLOOR: 2+ evidence types in RANGE)
  TRY Tier 9: Primary Trend Fallback (EPISTEMIC FLOOR: 2+ evidence types in RANGE)
  TRY Tier 10: Momentum + Order Flow Fallback (MUTUALLY EXCLUSIVE with Tier 11)
  TRY Tier 11: Exhaustion Escape Hatch (MUTUALLY EXCLUSIVE with Tier 10)
  
  // If ALL tiers fail:
  RETURN {
    direction: null,
    confidence: 0,
    source: "none",
    directionContext: directionContext,  // Contains all attempted evidence
    reasons: ["All timeframes neutral or conflicting..."]
  }
```

---

## Tiered Derivation Logic

### Tier 0: Weighted HTF Consensus (Primary Path)

```
// Convert trends to directional values
trendToValue(trend, conf):
  IF trend == "neutral" AND conf < 45: RETURN 0
  confWeight = MIN(1, conf / 65)
  IF trend == "bullish": RETURN +confWeight
  IF trend == "bearish": RETURN -confWeight
  RETURN 0

// Apply timeframe weights (40/35/25 split)
w4h = 0.40, w1h = 0.35, w30m = 0.25

// DYNAMIC WEIGHT REALLOCATION
// When 4h is neutral and weak, redistribute to lower TFs
IF trend4h == "neutral" AND conf4h < 45:
  w4h = 0
  w1h = 0.65  // Increased from 0.35
  w30m = 0.35 // Increased from 0.25
  weightReallocated = true

// Calculate weighted directional sum
weightedSum = (val4h * w4h) + (val1h * w1h) + (val30m * w30m)

// Apply persistence bonus if direction stable for N bars
IF directionStableBars >= 3:
  persistenceBonus = 0.05

// Regime-adjusted threshold
baseThreshold = regime == STRONG_TREND ? 0.40 : 0.55
effectiveThreshold = baseThreshold - persistenceBonus

IF |weightedSum| >= effectiveThreshold:
  direction = weightedSum > 0 ? "long" : "short"
  
  // Confidence calculation
  IF conf4h < 50:  // Weak 4h confidence fix
    derivedConf = MAX(conf1h, conf30m) * 0.95
  ELSE:
    derivedConf = 50 + |weightedSum| * 30
  
  // Populate DirectionContext
  directionContext.update({
    proposedDirection: direction,
    evidenceType: "HTF_CONSENSUS",
    tier: 0,
    confidence: derivedConf,
    positionMultiplier: 1.00,
    isCounterTrend: false,
    riskClass: "LOW",
    evidenceStrength: |weightedSum| * 100,
    tierSource: "weighted-derivation"
  })
  
  RETURN direction, derivedConf, source="weighted-derivation"

// ORDER FLOW TIEBREAKER (for marginal weighted sum 0.35-0.54)
IF 0.35 <= |weightedSum| < effectiveThreshold AND orderFlowData:
  IF ofScore >= 50 AND (ofSignal == "strong_buy" OR "strong_sell"):
    direction = ofSignal == "strong_buy" ? "long" : "short"
    
    // 30m alignment check (PHASE 2 FIX)
    IF direction == "long" AND trend30m == "bearish":
      BLOCK "30m bearish conflicts with LONG order flow"
    IF direction == "short" AND trend30m == "bullish":
      BLOCK "30m bullish conflicts with SHORT order flow"
    
    // Full alignment bonus
    IF (direction == "long" AND trend30m == "bullish") OR 
       (direction == "short" AND trend30m == "bearish"):
      alignmentBonus = 0.05
    
    directionContext.update({
      proposedDirection: direction,
      evidenceType: "ORDER_FLOW",
      tier: 0,
      positionMultiplier: 0.65,
      tierSource: "order-flow-tiebreaker"
    })
    
    RETURN direction, conf, source="order-flow-tiebreaker"
```

### Tier 0.25: Exhaustion Reversal Override (TIGHTENED)

```
// Captures bounce setups at extreme exhaustion
// NOW REQUIRES: Regime gate + HTF weakening

// ===== REGIME GATE =====
IF regime NOT IN [EXHAUSTION, RANGE]:
  SKIP this tier  // Only allow in correct regimes

// ===== HTF WEAKENING REQUIREMENT =====
htfWeakening = conf4h < 60 AND conf1h < 55
IF NOT htfWeakening:
  SKIP this tier  // HTF structure still dominant

// For LONG:
isDeepOversold = stochK4h <= 10 AND percentB <= 20
isHighAdxDeclining = adx > 45 AND adxSlope < 0

IF (isDeepOversold OR isHighAdxDeclining):
  IF momentum confirms OR MACD improving:
    IF NOT expansion AND ADX not accelerating:
      
      directionContext.update({
        proposedDirection: "long",
        evidenceType: "EXHAUSTION",
        tier: 0.25,
        confidence: 50-65,
        positionMultiplier: 0.50,  // Reduced for counter-trend
        isCounterTrend: true,
        riskClass: "HIGH",
        tierSource: "exhaustion-reversal"
      })
      
      RETURN "long", conf=50-65%, source="exhaustion-reversal"

// For SHORT:
isDeepOverbought = stochK4h >= 90 AND percentB >= 80

IF (isDeepOverbought OR isHighAdxDeclining):
  IF 4h NOT strongly bullish (conf >= 70):
    IF momentum confirms OR MACD declining:
      
      directionContext.update({
        proposedDirection: "short",
        evidenceType: "EXHAUSTION",
        tier: 0.25,
        confidence: 50-65,
        positionMultiplier: 0.50,
        isCounterTrend: true,
        riskClass: "HIGH",
        tierSource: "exhaustion-reversal"
      })
      
      RETURN "short", conf=50-65%, source="exhaustion-reversal"
```

### Tier 0.5: Momentum-Aware Weighted Override (Tier 2 Scoring)

```
// PHASE 2: Uses weighted point system instead of strict AND gate

momentumScore = trendData.smartMomentum.score
momentumSlope = trendData.momentum.macdSlope
stochK = trendData.stochRsi.k
ofScore = orderFlowData.score

attemptLong = momentumScore > 0
absMomentum = |momentumScore|

// Blocking check: strong opposing 30m trend
IF adx30m > 30 AND adxSlope > 0:
  IF attemptLong AND trend30m == "bearish": BLOCK
  IF attemptShort AND trend30m == "bullish": BLOCK

// ===== WEIGHTED TIER 2 SCORING =====
tier2Score = 0

// Momentum strength (1-2 points)
IF absMomentum >= 35: tier2Score += 2  // Strong
ELSE IF absMomentum >= 20: tier2Score += 1  // Weak

// Order flow alignment (2 points)
IF orderFlowAligned AND ofScore >= 45:
  tier2Score += 2

// StochRSI extreme (1 point) - regime-gated
IF stochK <= 25 (for LONG) OR stochK >= 75 (for SHORT):
  tier2Score += 1
  // In RANGE regime: REQUIRED
  // In STRONG_TREND/EARLY_TREND: BONUS only

// Momentum slope (1 point)
IF slope direction aligns:
  tier2Score += 1

// HTF alignment bonus (1 point)
IF 4h trend aligns AND conf4h >= 50:
  tier2Score += 1

// Regime-specific minimum score
minScore = RANGE ? 4 : STRONG_TREND ? 2 : EARLY_TREND ? 3 : 3

IF tier2Score >= minScore AND NOT stochBlocking:
  // Position sizing by score
  positionMultiplier = 
    score >= 7 ? 0.90 :
    score >= 6 ? 0.80 :
    score >= 5 ? 0.70 :
    score >= 4 ? 0.65 :
    0.55
  
  directionContext.update({
    proposedDirection: direction,
    evidenceType: "MOMENTUM",
    tier: 0.5,
    confidence: 60-75,
    positionMultiplier: positionMultiplier,
    isCounterTrend: false,
    riskClass: score >= 6 ? "LOW" : "MEDIUM",
    evidenceStrength: tier2Score * 14,  // Scale to 0-100
    tierSource: "weighted-momentum-override"
  })
  
  RETURN direction, conf=60-75%, source="weighted-momentum-override"
```

### Tier 1: Price Action Momentum Override

```
IF priceActionMomentum.canOverrideNeutralAlignment AND hasStrongMove:
  priceDirection = priceActionMomentum.direction  // bullish/bearish
  movePercent = |priceActionMomentum.movePercent|
  
  IF priceDirection != "neutral":
    direction = priceDirection == "bullish" ? "long" : "short"
    
    // HTF ALIGNMENT CHECK (PHASE 1 FIX)
    IF 4h is directional (conf >= 60):
      htfAligned = (4h bullish AND price bullish) OR (4h bearish AND price bearish)
      
      IF NOT htfAligned:
        // This is a pullback against HTF, not momentum
        IF movePercent < 1.5%:  // Moderate pullback
          // Derive HTF-aligned direction instead
          direction = 4h == "bullish" ? "long" : "short"
          RETURN direction, conf * 0.85, source="price-action-pullback", pos=0.60
        ELSE:
          // Strong counter-move - skip this tier entirely
          CONTINUE to next tier
      ELSE:
        // Price action aligns with HTF - proceed
        RETURN direction, conf, source="price-action-momentum-aligned", pos=0.75
    ELSE:
      // HTF neutral - use price action directly
      RETURN direction, conf, source="price-action-momentum", pos=0.75
```

### Tier 2: Strong 4h Trend

```
IF trend4h != "neutral" AND conf4h >= 55:
  direction = trend4h == "bullish" ? "long" : "short"
  
  directionContext.update({
    proposedDirection: direction,
    evidenceType: "HTF_CONSENSUS",
    tier: 2,
    confidence: conf4h,
    positionMultiplier: 1.00,
    isCounterTrend: false,
    riskClass: "LOW",
    tierSource: "4h"
  })
  
  RETURN direction, conf4h, source="4h"
```

### Tier 3: Strong 1h Trend

```
IF trend1h != "neutral" AND conf1h >= 60:
  direction = trend1h == "bullish" ? "long" : "short"
  
  IF trend4h != "neutral" AND trend4h != trend1h:
    reasons.push("Warning: 4h opposes 1h")
    directionContext.conflictsWith.push("4h")
  
  directionContext.update({
    proposedDirection: direction,
    evidenceType: "HTF_CONSENSUS",
    tier: 3,
    confidence: conf1h,
    positionMultiplier: 1.00,
    isCounterTrend: trend4h != "neutral" AND trend4h != trend1h,
    riskClass: trend4h opposes ? "MEDIUM" : "LOW",
    tierSource: "1h"
  })
  
  RETURN direction, conf1h, source="1h"
```

### Tier 4: Consecutive Candle Momentum Override

```
// When 1h shows 5+ consecutive candles in same direction

IF trend4h == "neutral" AND consecutiveBars1h >= 5 AND adx >= 20:
  inferredDirection = trend1h != "neutral" ? trend1h : trend30m
  
  IF inferredDirection:
    direction = inferredDirection == "bullish" ? "long" : "short"
    baseConf = 55 + MIN(15, (consecutiveBars1h - 5) * 3)
    
    // Bonuses
    adxBonus = MIN(10, (adx - 20) * 0.5)
    conf30mBonus = consecutiveBars30m >= 4 ? 5 : 0
    
    finalConf = MIN(75, baseConf + bonuses) * 0.85
    RETURN direction, finalConf, source="consecutive-candle-momentum", pos=0.65
```

### Tier 5: Building Trend Detection (Early Entry)

```
// Catches trends forming before 1h hits 60% confidence

IF trend4h == "neutral" AND
   trend1h != "neutral" AND
   conf1h >= 57 AND conf1h < 60 AND
   adx >= 18 AND adx <= 35 AND
   adxRising AND
   |priceMove| >= 0.8%:
  
  direction = trend1h == "bullish" ? "long" : "short"
  priceAligned = (bullish AND priceMove > 0) OR (bearish AND priceMove < 0)
  
  IF priceAligned:
    earlyConf = conf1h * 0.85
    RETURN direction, earlyConf, source="1h-building-override", pos=0.75
```

### Tier 6: 1h+30m Alignment

```
IF trend4h == "neutral" AND trend1h == trend30m AND trend1h != "neutral":
  direction = trend1h == "bullish" ? "long" : "short"
  avgConf = (conf1h + conf30m) / 2
  RETURN direction, avgConf, source="1h+30m"
```

### Tier 7: 2-of-3 Timeframe Agreement

```
directionalTFs = [4h, 1h, 30m].filter(t => t.trend != "neutral")

IF directionalTFs.length >= 2:
  bullishTFs = filter(trend == "bullish")
  bearishTFs = filter(trend == "bearish")
  has4h = 4h in directionalTFs
  
  IF has4h AND bullishTFs.length >= 2:
    RETURN "long", avgConf * 0.9, source="2-of-3"
  
  IF has4h AND bearishTFs.length >= 2:
    RETURN "short", avgConf * 0.9, source="2-of-3"
  
  // 4h directional with supporting TFs
  IF trend4h != "neutral" AND conf4h >= 50:
    IF 2+ TFs agree with 4h:
      RETURN 4h direction, avgConf * 0.85, source="4h+support"
```

### Tier 8: Early Momentum 30m Entry (WITH EPISTEMIC FLOOR)

```
// 30m strongly directional while 4h neutral

IF trend4h == "neutral" AND trend30m != "neutral" AND conf30m >= 65:
  
  // ===== EPISTEMIC FLOOR CHECK =====
  IF regime == RANGE:
    evidenceCount = 0
    IF momentumConfirms: evidenceCount++
    IF orderFlowAligns: evidenceCount++
    IF stochRsiExtreme: evidenceCount++
    IF priceActionConfirms: evidenceCount++
    
    IF evidenceCount < 2:
      LOG "Tier 8 blocked: RANGE regime requires 2+ evidence types, got {evidenceCount}"
      SKIP this tier
  
  is1hLeaning = (1h == 30m) OR (1h neutral AND conf1h 50-65%)
  is1hNotConflicting = 1h neutral OR 1h == 30m
  
  IF is1hLeaning OR (is1hNotConflicting AND conf1h >= 55):
    direction = trend30m == "bullish" ? "long" : "short"
    avgConf = (conf30m + MAX(conf1h, 50)) / 2
    reducedConf = avgConf * 0.85
    
    RETURN direction, reducedConf, source="early-momentum-30m+1h", pos=0.50
```

### Tier 9: Primary Trend Fallback (WITH EPISTEMIC FLOOR)

```
// Last resort: use primary trend from 5m data

// ===== EPISTEMIC FLOOR CHECK =====
IF regime == RANGE:
  evidenceCount = 0
  IF momentumConfirms: evidenceCount++
  IF orderFlowAligns: evidenceCount++
  IF stochRsiExtreme: evidenceCount++
  IF priceActionConfirms: evidenceCount++
  
  IF evidenceCount < 2:
    LOG "Tier 9 blocked: RANGE regime requires 2+ evidence types, got {evidenceCount}"
    SKIP this tier

IF primaryTrend == "bullish" OR primaryTrend == "bearish":
  direction = primaryTrend == "bullish" ? "long" : "short"
  primaryConf = trendData.confidence
  
  reasons.push("Warning: Using primary trend as fallback")
  RETURN direction, primaryConf * 0.8, source="primary"
```

### Tier 10: Momentum + Order Flow Fallback (MUTUALLY EXCLUSIVE)

```
// When all TF methods fail, use momentum + order flow
// THIS TIER IS FOR TREND CONTINUATION, NOT REVERSALS

// ===== MUTUAL EXCLUSIVITY GATE =====
// Track that Tier 10 is being evaluated - blocks Tier 11
tier10Evaluated = true

momentumScore = trendData.smartMomentum.score
absMomentum = |momentumScore|
stochK = trendData.stochRsi.k

IF absMomentum >= 20 AND adx >= 18:
  direction = momentumScore > 0 ? "long" : "short"
  
  // Check confirmations
  orderFlowAligned = (bullish signal AND long) OR (bearish signal AND short)
  orderFlowStrong = ofScore >= 55 AND orderFlowAligned
  orderFlowSupports = ofScore >= 40 AND orderFlowAligned
  
  stochConfirmsLong = direction == "long" AND stochK <= 15
  stochConfirmsShort = direction == "short" AND stochK >= 85
  stochConfirms = stochConfirmsLong OR stochConfirmsShort
  
  // Calculate confidence
  confidence = 50
  positionMultiplier = 0.55
  
  IF absMomentum >= 35: confidence += 5
  IF orderFlowStrong: confidence += 8, pos = 0.70
  ELSE IF orderFlowSupports: confidence += 4, pos = 0.60
  IF stochConfirms: confidence += 5
  
  confidence = MIN(confidence, 70)
  
  // Require at least one confirmation
  IF orderFlowSupports OR stochConfirms:
    tier10Fired = true  // Mark as fired - blocks Tier 11
    
    directionContext.update({
      proposedDirection: direction,
      evidenceType: "MOMENTUM" + "ORDER_FLOW",
      tier: 10,
      confidence: confidence,
      positionMultiplier: positionMultiplier,
      isCounterTrend: false,
      riskClass: "MEDIUM",
      tierSource: "momentum-fallback"
    })
    
    RETURN direction, confidence, source="momentum-fallback"
```

### Tier 11: Exhaustion Escape Hatch (MUTUALLY EXCLUSIVE)

```
// Captures mean reversion at extremes after all else fails
// THIS TIER IS FOR MEAN REVERSION ONLY - NEVER CONTINUATION

// ===== MUTUAL EXCLUSIVITY GATE =====
IF tier10Fired:
  LOG "Tier 11 skipped: Tier 10 already provided direction (mutual exclusivity)"
  SKIP this tier

// Only apply in EXHAUSTION regime (or if regime check disabled)
IF regime == EXHAUSTION:
  
  // LONG escape
  isOversold = stochK4h <= 15 AND percentB <= 25
  momentumAllowsLong = absMomentum >= 15 OR momentumScore > 0
  
  IF isOversold AND momentumAllowsLong:
    confidence = 45
    positionMultiplier = 0.45
    
    IF ofBullish AND ofScore >= 40: 
      confidence += 5
      positionMultiplier = 0.55
    
    directionContext.update({
      proposedDirection: "long",
      evidenceType: "EXHAUSTION",
      tier: 11,
      confidence: confidence,
      positionMultiplier: positionMultiplier,
      isCounterTrend: true,
      riskClass: "EXTREME",
      tierSource: "exhaustion-escape"
    })
    
    RETURN "long", confidence, source="exhaustion-escape"
  
  // SHORT escape
  isOverbought = stochK4h >= 85 AND percentB >= 75
  momentumAllowsShort = absMomentum >= 15 OR momentumScore < 0
  is4hNotStrongBullish = NOT (trend4h == "bullish" AND conf4h >= 70)
  
  IF isOverbought AND momentumAllowsShort AND is4hNotStrongBullish:
    confidence = 45
    positionMultiplier = 0.45
    
    IF ofBearish AND ofScore >= 40: 
      confidence += 5
      positionMultiplier = 0.55
    
    directionContext.update({
      proposedDirection: "short",
      evidenceType: "EXHAUSTION",
      tier: 11,
      confidence: confidence,
      positionMultiplier: positionMultiplier,
      isCounterTrend: true,
      riskClass: "EXTREME",
      tierSource: "exhaustion-escape"
    })
    
    RETURN "short", confidence, source="exhaustion-escape"
```

---

## Final Rejection

```
// All 12 tiers exhausted without finding direction
IF direction == null:
  reasons.push("All timeframes neutral or conflicting after weighted derivation + exhaustion escape check")
  reasons.push("4h: {trend4h} ({conf4h}%), 1h: {trend1h} ({conf1h}%), 30m: {trend30m} ({conf30m}%)")
  
  // Include DirectionContext for debugging
  RETURN {
    direction: null,
    confidence: 0,
    source: "none",
    directionContext: directionContext,
    tier10Evaluated: tier10Evaluated,
    tier10Fired: tier10Fired,
    epistemicFloorApplied: regime == RANGE AND tier >= 8,
    reasons: reasons
  }
```

---

## Why This Gate Exists

1. **Prevents Random Entries**: Without clear directional conviction, entries become coin-flips
2. **Protects Capital**: Ambiguous markets often mean choppy price action and whipsaws
3. **Forces Patience**: Better to wait for clarity than enter uncertain trades
4. **Reduces Overtrading**: Naturally limits signal frequency in indecisive markets
5. **Terminal Decision**: This gate is not a filter — it is a formal declaration of epistemic uncertainty

---

## Rejection Scenarios

| Scenario | Description |
|----------|-------------|
| All TFs Neutral | 4h, 1h, 30m all showing neutral trend with low confidence |
| HTF Conflict | 4h bearish, 1h bullish - no clear majority |
| Weak Momentum | Momentum score near zero, no order flow alignment |
| No Confirmations | Marginal weighted sum but order flow doesn't confirm |
| Regime Mismatch | RANGE regime but no StochRSI extreme confirmation |
| Epistemic Floor Failed | Tier >= 8 in RANGE with < 2 evidence types |
| Exhaustion Regime Wrong | Tier 0.25 attempted but regime not EXHAUSTION/RANGE |
| HTF Still Strong | Tier 0.25 attempted but conf4h >= 60 OR conf1h >= 55 |

---

## Position Size Multipliers by Source

| Source | Position Multiplier | Risk Class | Rationale |
|--------|---------------------|------------|-----------|
| weighted-derivation | 1.00 | LOW | Primary path, highest conviction |
| order-flow-tiebreaker | 0.65 | MEDIUM | Marginal TF, order flow assisted |
| exhaustion-reversal | 0.50 | HIGH | Counter-trend, needs protection |
| weighted-momentum-override | 0.55-0.90 | LOW-MEDIUM | Score-based sizing |
| price-action-momentum-aligned | 0.75 | LOW | HTF-aligned price action |
| price-action-pullback | 0.60 | MEDIUM | Counter-price, HTF-aligned |
| 4h / 1h | 1.00 | LOW | High conviction HTF |
| consecutive-candle-momentum | 0.65 | MEDIUM | Lower TF momentum |
| 1h-building-override | 0.75 | MEDIUM | Early entry |
| 1h+30m | 1.00 | LOW | Multi-TF alignment |
| 2-of-3 | 0.90 | LOW | Majority agreement |
| early-momentum-30m+1h | 0.50 | MEDIUM | Very early, high risk |
| primary | 0.80 | MEDIUM | Fallback, lower conviction |
| momentum-fallback | 0.55-0.70 | MEDIUM | Tier 10, confirmation-dependent |
| exhaustion-escape | 0.45-0.55 | EXTREME | Tier 11, last resort mean reversion |

---

## Tier Interaction Matrix

| Tier | Evidence Type | Can Fire If | Blocks |
|------|---------------|-------------|--------|
| 0 | HTF_CONSENSUS | Always first | All lower tiers |
| 0.25 | EXHAUSTION | regime ∈ {EXHAUSTION, RANGE} AND HTF weakening | All lower tiers |
| 0.5 | MOMENTUM | tier2Score >= minScore | All lower tiers |
| 1 | PRICE_ACTION | Strong move + HTF check | All lower tiers |
| 2-7 | HTF_CONSENSUS | Various TF conditions | Lower tiers |
| 8-9 | HTF_CONSENSUS | TF conditions + epistemic floor in RANGE | Lower tiers |
| 10 | MOMENTUM + ORDER_FLOW | Fallback conditions | Tier 11 |
| 11 | EXHAUSTION | regime == EXHAUSTION AND NOT tier10Fired | None |

---

## UI Diagnostics (filters_status)

When logging NO_CLEAR_DIRECTION rejections:

```json
{
  "gate": "NO_CLEAR_DIRECTION",
  "derivedDirection": null,
  "direction": null,
  "source": "none",
  "directionContext": {
    "proposedDirection": null,
    "evidenceType": null,
    "tier": null,
    "tierSource": null,
    "evidenceStrength": 0,
    "conflictsWith": ["4h", "1h"]
  },
  "reasons": [
    "REGIME: RANGE (ADX=18.5, slope=-0.05)",
    "TIER 0.25 SKIPPED: regime=RANGE but conf4h=62% (requires <60%)",
    "WEIGHTED OVERRIDE SKIPPED: score=2 < 4 (RANGE minScore)",
    "TIER 8 BLOCKED: epistemic floor requires 2+ evidence types, got 1",
    "TIER 10: Evaluated but no confirmation",
    "TIER 11 SKIPPED: regime != EXHAUSTION",
    "All timeframes neutral or conflicting..."
  ],
  "trend4h": "neutral",
  "trend1h": "neutral",
  "trend30m": "bearish",
  "primaryTrend": "ranging",
  "confidence": 0,
  "adx": 18.5,
  "adxSlope": -0.05,
  "regime": "RANGE",
  "weightedSum": 0.28,
  "tier2Score": 2,
  "tier10Evaluated": true,
  "tier10Fired": false,
  "epistemicFloorApplied": true,
  "evidenceCount": 1,
  "htfWeakeningCheck": {
    "conf4h": 62,
    "conf1h": 58,
    "passed": false,
    "requiredConf4h": "<60",
    "requiredConf1h": "<55"
  }
}
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-01-26 | Initial documentation |
| 2.0 | 2025-01-26 | Added DirectionContext object, Tier 0.25 tightening, Epistemic floor for late tiers, Tier 10/11 mutual exclusivity |
