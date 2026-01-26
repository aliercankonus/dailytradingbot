# NO_CLEAR_DIRECTION Gate - Pseudo Code

## Overview

The `NO_CLEAR_DIRECTION` rejection occurs when the `deriveTradeDirection()` function exhausts all 12 tiered derivation paths without establishing a confident trade direction. This gate ensures no trades are entered in truly ambiguous market conditions.

---

## Core Concept

```
FUNCTION deriveTradeDirection(trendData, primaryTrend, orderFlowData) → DirectionResult

  IF no trendData:
    RETURN null + "No trend data"
  
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
  
  // ============= TIER-BASED DIRECTION DERIVATION =============
  // Try each tier in priority order until direction is found
  
  TRY Tier 0: Weighted HTF Consensus (Primary)
  TRY Tier 0.25: Exhaustion Reversal Override
  TRY Tier 0.5: Momentum-Aware Weighted Override
  TRY Tier 1: Price Action Momentum Override
  TRY Tier 2: Strong 4h Trend
  TRY Tier 3: Strong 1h Trend
  TRY Tier 4: Consecutive Candle Momentum
  TRY Tier 5: Building Trend Detection
  TRY Tier 6: 1h+30m Alignment
  TRY Tier 7: 2-of-3 Timeframe Agreement
  TRY Tier 8: Early Momentum 30m Entry
  TRY Tier 9: Primary Trend Fallback
  TRY Tier 10: Momentum + Order Flow Fallback
  TRY Tier 11: Exhaustion Escape Hatch
  
  // If ALL tiers fail:
  RETURN {
    direction: null,
    confidence: 0,
    source: "none",
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
    
    RETURN direction, conf, source="order-flow-tiebreaker"
```

### Tier 0.25: Exhaustion Reversal Override

```
// Captures bounce setups at extreme exhaustion

// For LONG:
isDeepOversold = stochK4h <= 10 AND percentB <= 20
isHighAdxDeclining = adx > 45 AND adxSlope < 0

IF (isDeepOversold OR isHighAdxDeclining):
  IF momentum confirms OR MACD improving:
    IF NOT expansion AND ADX not accelerating:
      RETURN "long", conf=50-65%, source="exhaustion-reversal"

// For SHORT:
isDeepOverbought = stochK4h >= 90 AND percentB >= 80

IF (isDeepOverbought OR isHighAdxDeclining):
  IF 4h NOT strongly bullish (conf >= 70):
    IF momentum confirms OR MACD declining:
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
  RETURN direction, conf4h, source="4h"
```

### Tier 3: Strong 1h Trend

```
IF trend1h != "neutral" AND conf1h >= 60:
  direction = trend1h == "bullish" ? "long" : "short"
  
  IF trend4h != "neutral" AND trend4h != trend1h:
    reasons.push("Warning: 4h opposes 1h")
  
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

### Tier 8: Early Momentum 30m Entry

```
// 30m strongly directional while 4h neutral

IF trend4h == "neutral" AND trend30m != "neutral" AND conf30m >= 65:
  is1hLeaning = (1h == 30m) OR (1h neutral AND conf1h 50-65%)
  is1hNotConflicting = 1h neutral OR 1h == 30m
  
  IF is1hLeaning OR (is1hNotConflicting AND conf1h >= 55):
    direction = trend30m == "bullish" ? "long" : "short"
    avgConf = (conf30m + MAX(conf1h, 50)) / 2
    reducedConf = avgConf * 0.85
    
    RETURN direction, reducedConf, source="early-momentum-30m+1h", pos=0.50
```

### Tier 9: Primary Trend Fallback

```
// Last resort: use primary trend from 5m data

IF primaryTrend == "bullish" OR primaryTrend == "bearish":
  direction = primaryTrend == "bullish" ? "long" : "short"
  primaryConf = trendData.confidence
  
  reasons.push("Warning: Using primary trend as fallback")
  RETURN direction, primaryConf * 0.8, source="primary"
```

### Tier 10: Momentum + Order Flow Fallback

```
// When all TF methods fail, use momentum + order flow

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
    RETURN direction, confidence, source="momentum-fallback"
```

### Tier 11: Exhaustion Escape Hatch (Final Safety Valve)

```
// Captures mean reversion at extremes after all else fails

// Only apply in EXHAUSTION regime (or if regime check disabled)
IF regime == EXHAUSTION:
  
  // LONG escape
  isOversold = stochK4h <= 15 AND percentB <= 25
  momentumAllowsLong = absMomentum >= 15 OR momentumScore > 0
  
  IF isOversold AND momentumAllowsLong:
    confidence = 45
    IF ofBullish AND ofScore >= 40: confidence += 5, pos = 0.55
    RETURN "long", confidence, source="exhaustion-escape"
  
  // SHORT escape
  isOverbought = stochK4h >= 85 AND percentB >= 75
  momentumAllowsShort = absMomentum >= 15 OR momentumScore < 0
  is4hNotStrongBullish = NOT (trend4h == "bullish" AND conf4h >= 70)
  
  IF isOverbought AND momentumAllowsShort AND is4hNotStrongBullish:
    confidence = 45
    IF ofBearish AND ofScore >= 40: confidence += 5, pos = 0.55
    RETURN "short", confidence, source="exhaustion-escape"
```

---

## Final Rejection

```
// All 12 tiers exhausted without finding direction
IF direction == null:
  reasons.push("All timeframes neutral or conflicting after weighted derivation + exhaustion escape check")
  reasons.push("4h: {trend4h} ({conf4h}%), 1h: {trend1h} ({conf1h}%), 30m: {trend30m} ({conf30m}%)")
  
  RETURN {
    direction: null,
    confidence: 0,
    source: "none",
    reasons: reasons
  }
```

---

## Why This Gate Exists

1. **Prevents Random Entries**: Without clear directional conviction, entries become coin-flips
2. **Protects Capital**: Ambiguous markets often mean choppy price action and whipsaws
3. **Forces Patience**: Better to wait for clarity than enter uncertain trades
4. **Reduces Overtrading**: Naturally limits signal frequency in indecisive markets

---

## Rejection Scenarios

| Scenario | Description |
|----------|-------------|
| All TFs Neutral | 4h, 1h, 30m all showing neutral trend with low confidence |
| HTF Conflict | 4h bearish, 1h bullish - no clear majority |
| Weak Momentum | Momentum score near zero, no order flow alignment |
| No Confirmations | Marginal weighted sum but order flow doesn't confirm |
| Regime Mismatch | RANGE regime but no StochRSI extreme confirmation |

---

## Position Size Multipliers by Source

| Source | Position Multiplier | Rationale |
|--------|---------------------|-----------|
| weighted-derivation | 0.70-0.75 | Primary path, moderate confidence |
| order-flow-tiebreaker | 0.65 | Marginal TF, order flow assisted |
| exhaustion-reversal | 0.45-0.70 | Counter-trend, needs protection |
| weighted-momentum-override | 0.55-0.90 | Score-based sizing |
| price-action-momentum | 0.75 | HTF neutral, price-driven |
| price-action-pullback | 0.60 | Counter-price, HTF-aligned |
| 4h / 1h | 1.00 | High conviction |
| consecutive-candle-momentum | 0.65 | Lower TF momentum |
| 1h-building-override | 0.75 | Early entry |
| 1h+30m | 1.00 | Multi-TF alignment |
| 2-of-3 | 0.90 | Majority agreement |
| early-momentum-30m+1h | 0.50 | Very early, high risk |
| primary | 0.80 | Fallback, lower conviction |
| momentum-fallback | 0.55-0.70 | Confirmation-dependent |
| exhaustion-escape | 0.45-0.55 | Last resort, extreme caution |

---

## UI Diagnostics (filters_status)

When logging NO_CLEAR_DIRECTION rejections:

```json
{
  "gate": "NO_CLEAR_DIRECTION",
  "derivedDirection": null,
  "direction": null,
  "source": "none",
  "reasons": [
    "REGIME: RANGE (ADX=18.5, slope=-0.05)",
    "WEIGHTED OVERRIDE SKIPPED: score=2 < 4 (RANGE)",
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
  "tier2Score": 2
}
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-01-26 | Initial documentation |
