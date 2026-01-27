# Signal Rejection Tiers - Complete Pseudocode Reference

## Overview

This document provides comprehensive pseudocode for ALL tiered rejection gates in the signal generation pipeline, from TIER 0 (DEEP StochRSI) through the terminal fallback gates.

**Architecture**: The system uses multiple overlapping tier systems:
1. **StochRSI Safety Hierarchy** (Tiers 0-3) - Blocks entries at extreme oscillator levels
2. **Direction Derivation Hierarchy** (Tiers 0-11) - Determines trade direction with fallbacks
3. **Hard Gates** - Binary pass/fail checks for momentum, alignment, exhaustion
4. **Soft Gates** - Position sizing adjustments based on conditions

---

## 🔴 SECTION 1: StochRSI Safety Hierarchy

### TIER 0 (DEEP) - Absolute Block, NO EXCEPTIONS

```
// ============= TIER 0: DEEP STOCHRSI EXTREME =============
// Universal block - NO exceptions, NO bypasses, NO overrides
// Probability of bounce/reversal at these levels: ~80%+

CONSTANTS:
  DEEP_OVERSOLD_K = 5       // K < 5 = BLOCK ALL SHORTs
  DEEP_OVERBOUGHT_K = 95    // K > 95 = BLOCK ALL LONGs
  ALLOW_EXCEPTIONS = false  // Hard-coded: no bypass possible

FUNCTION checkTier0DeepStochRSI(stochK4h, derivedDirection):
  
  // ===== TIER 0 LONG BLOCK =====
  IF derivedDirection == "long":
    IF stochK4h > DEEP_OVERBOUGHT_K:  // K > 95
      REJECT {
        gate: "TIER 0: DEEP_STOCHRSI_HARD_GATE",
        severity: "CRITICAL",
        reason: "4h StochRSI K={stochK4h} > 95: ABSOLUTE BLOCK for LONG",
        bypassable: false,
        positionMultiplier: 0.00,
        action: "NO ENTRY - Wait for K < 85 before LONG consideration"
      }
  
  // ===== TIER 0 SHORT BLOCK =====
  IF derivedDirection == "short":
    IF stochK4h < DEEP_OVERSOLD_K:  // K < 5
      REJECT {
        gate: "TIER 0: DEEP_STOCHRSI_HARD_GATE",
        severity: "CRITICAL",
        reason: "4h StochRSI K={stochK4h} < 5: ABSOLUTE BLOCK for SHORT",
        bypassable: false,
        positionMultiplier: 0.00,
        action: "NO ENTRY - Wait for K > 15 before SHORT consideration"
      }
  
  RETURN PASS
```

---

### TIER 1 (SEVERE) - Block, NO Bypass

```
// ============= TIER 1: SEVERE STOCHRSI EXTREME =============
// Block with no standard bypass - only Mean Reversion can override
// These levels have ~70% bounce/reversal probability

CONSTANTS:
  SEVERE_OVERSOLD_MIN = 5    // K >= 5
  SEVERE_OVERSOLD_MAX = 15   // K < 15 → TIER 1 SEVERE
  SEVERE_OVERBOUGHT_MIN = 85 // K > 85
  SEVERE_OVERBOUGHT_MAX = 95 // K <= 95 → TIER 1 SEVERE

// FIX #1 (Audit): Formal isExtremeMeanReversion definition
// All three conditions must be met for Tier 1 bypass:
TIER1_BYPASS_CRITERIA:
  ALLOWED_REGIMES = ['RANGE', 'LATE_TREND', 'EXHAUSTION']  // NOT EARLY_TREND or STRONG_TREND
  MIN_REVERSAL_SCORE = 55                                   // Strong reversal signal required
  DISALLOWED_MOMENTUM_STATES = ['confirmed']               // No active trend-following momentum

FUNCTION isExtremeMeanReversion(regime, reversalScore, momentumState):
  regimeAllowed = regime IN TIER1_BYPASS_CRITERIA.ALLOWED_REGIMES
  reversalScoreMet = reversalScore >= TIER1_BYPASS_CRITERIA.MIN_REVERSAL_SCORE
  momentumAllowed = momentumState NOT IN TIER1_BYPASS_CRITERIA.DISALLOWED_MOMENTUM_STATES
  
  RETURN regimeAllowed AND reversalScoreMet AND momentumAllowed

FUNCTION checkTier1SevereStochRSI(stochK4h, derivedDirection, meanReversionActive, regime, reversalScore, momentumState):
  
  // Skip if mean reversion override is active AND formal criteria met (FIX #1)
  IF meanReversionActive AND isExtremeMeanReversion(regime, reversalScore, momentumState):
    LOG "TIER 1 bypassed by Mean Reversion Override (FIX#1: regime={regime}, revScore={reversalScore}, momState={momentumState})"
    RETURN PASS with positionMultiplier = 0.50
  
  // ===== TIER 1 LONG BLOCK =====
  IF derivedDirection == "long":
    IF stochK4h >= SEVERE_OVERBOUGHT_MIN AND stochK4h <= SEVERE_OVERBOUGHT_MAX:  // 85 < K <= 95
      REJECT {
        gate: "TIER 1: SEVERE_HTF_OVERBOUGHT",
        severity: "CRITICAL",
        reason: "4h StochRSI K={stochK4h} in severe zone (85-95): BLOCK LONG",
        bypassable: false,
        meanReversionAllowed: true,
        positionMultiplier: 0.00,
        whatWouldPass: "K < 80 for normal entry, or Mean Reversion conditions"
      }
  
  // ===== TIER 1 SHORT BLOCK =====
  IF derivedDirection == "short":
    IF stochK4h >= SEVERE_OVERSOLD_MIN AND stochK4h < SEVERE_OVERSOLD_MAX:  // 5 <= K < 15
      REJECT {
        gate: "TIER 1: SEVERE_HTF_OVERSOLD",
        severity: "CRITICAL",
        reason: "4h StochRSI K={stochK4h} in severe zone (5-15): BLOCK SHORT",
        bypassable: false,
        meanReversionAllowed: true,
        positionMultiplier: 0.00,
        whatWouldPass: "K > 20 for normal entry, or Mean Reversion conditions"
      }
  
  RETURN PASS
```

---

### TIER 2 (STANDARD) - Block with Restricted Bypass

```
// ============= TIER 2: STANDARD STOCHRSI EXTREME =============
// Block by default, but ADX + Reversal Score can bypass with position cap
// ~60% bounce probability at these levels

CONSTANTS:
  STANDARD_OVERSOLD_K = 20   // K <= 20
  STANDARD_OVERBOUGHT_K = 80 // K >= 80
  PERCENT_B_OVERSOLD = 25    // %B <= 25 (near lower band)
  PERCENT_B_OVERBOUGHT = 75  // %B >= 75 (near upper band)
  
  // Bypass Requirements
  BYPASS_MIN_ADX = 35
  BYPASS_MAX_REVERSAL_SCORE = 45
  BYPASS_POSITION_CAP = 0.50  // 50% max position if bypassed

FUNCTION checkTier2StandardStochRSI(stochK4h, percentB, derivedDirection, adx, reversalScore):
  
  // ===== TIER 2 LONG BLOCK =====
  IF derivedDirection == "long":
    isOverbought = stochK4h >= STANDARD_OVERBOUGHT_K   // K >= 80
    isAtUpperBand = percentB >= PERCENT_B_OVERBOUGHT   // %B >= 75
    
    IF isOverbought AND isAtUpperBand:
      
      // ===== BYPASS CHECK =====
      canBypass = adx >= BYPASS_MIN_ADX AND reversalScore < BYPASS_MAX_REVERSAL_SCORE
      
      IF canBypass:
        // FIX #2 (Audit): Re-calculate reversal score with stochRSITier2Bypassed=true
        // This caps StochRSI contribution at +10 instead of +20 to prevent double punishment
        bypassedReversalScore = calculateUnifiedReversalScore(trendData, "long", symbol, { stochRSITier2Bypassed: true })
        LOG "TIER 2 bypassed: ADX={adx} >= 35, reversalScore={reversalScore}→{bypassedReversalScore} (FIX#2)"
        RETURN PASS with positionMultiplier = BYPASS_POSITION_CAP, reversalMultiplier = bypassedReversalScore.positionSizeMultiplier
      
      REJECT {
        gate: "TIER 2: STANDARD_HTF_OVERBOUGHT",
        severity: "HIGH",
        reason: "4h StochRSI K={stochK4h} >= 80 AND %B={percentB} >= 75",
        bypassable: true,
        bypassRequirements: "ADX >= 35 AND Reversal Score < 45",
        currentADX: adx,
        currentReversalScore: reversalScore,
        positionMultiplier: 0.00,
        whatWouldPass: "K < 80 OR %B < 75 OR (ADX >= 35 AND reversalScore < 45)"
      }
  
  // ===== TIER 2 SHORT BLOCK =====
  IF derivedDirection == "short":
    isOversold = stochK4h <= STANDARD_OVERSOLD_K   // K <= 20
    isAtLowerBand = percentB <= PERCENT_B_OVERSOLD  // %B <= 25
    
    IF isOversold AND isAtLowerBand:
      
      canBypass = adx >= BYPASS_MIN_ADX AND reversalScore < BYPASS_MAX_REVERSAL_SCORE
      
      IF canBypass:
        // FIX #2 (Audit): Re-calculate reversal score with stochRSITier2Bypassed=true
        // This caps StochRSI contribution at +10 instead of +20 to prevent double punishment
        bypassedReversalScore = calculateUnifiedReversalScore(trendData, "short", symbol, { stochRSITier2Bypassed: true })
        LOG "TIER 2 bypassed: ADX={adx} >= 35, reversalScore={reversalScore}→{bypassedReversalScore} (FIX#2)"
        RETURN PASS with positionMultiplier = BYPASS_POSITION_CAP, reversalMultiplier = bypassedReversalScore.positionSizeMultiplier
      
      REJECT {
        gate: "TIER 2: STANDARD_HTF_OVERSOLD",
        severity: "HIGH",
        reason: "4h StochRSI K={stochK4h} <= 20 AND %B={percentB} <= 25",
        bypassable: true,
        bypassRequirements: "ADX >= 35 AND Reversal Score < 45",
        currentADX: adx,
        currentReversalScore: reversalScore,
        positionMultiplier: 0.00,
        whatWouldPass: "K > 20 OR %B > 25 OR (ADX >= 35 AND reversalScore < 45)"
      }
  
  RETURN PASS
```

---

### TIER 3 (CAUTION) - Penalty Scoring Only

```
// ============= TIER 3: CAUTION ZONE =============
// No hard block - applies scoring penalties and position reduction
// ~50% bounce probability, manageable risk with reduced sizing

CONSTANTS:
  CAUTION_OVERSOLD_K = 30    // K <= 30
  CAUTION_OVERBOUGHT_K = 70  // K >= 70
  REVERSAL_SCORE_PENALTY = 15
  POSITION_REDUCTION = 0.75  // 25% reduction

FUNCTION checkTier3CautionStochRSI(stochK4h, derivedDirection):
  
  penalty = 0
  positionMultiplier = 1.00
  
  // ===== TIER 3 LONG CAUTION =====
  IF derivedDirection == "long":
    IF stochK4h >= CAUTION_OVERBOUGHT_K:  // K >= 70
      penalty = REVERSAL_SCORE_PENALTY     // +15 to reversal score
      positionMultiplier = POSITION_REDUCTION
      
      LOG "TIER 3 CAUTION: LONG at K={stochK4h} >= 70, applying penalty"
      RETURN {
        gate: "TIER 3: CAUTION_ZONE",
        severity: "MODERATE",
        action: "ALLOW WITH PENALTY",
        reversalScorePenalty: penalty,
        positionMultiplier: positionMultiplier,
        reason: "Elevated reversal risk at K >= 70"
      }
  
  // ===== TIER 3 SHORT CAUTION =====
  IF derivedDirection == "short":
    IF stochK4h <= CAUTION_OVERSOLD_K:  // K <= 30
      penalty = REVERSAL_SCORE_PENALTY
      positionMultiplier = POSITION_REDUCTION
      
      LOG "TIER 3 CAUTION: SHORT at K={stochK4h} <= 30, applying penalty"
      RETURN {
        gate: "TIER 3: CAUTION_ZONE",
        severity: "MODERATE",
        action: "ALLOW WITH PENALTY",
        reversalScorePenalty: penalty,
        positionMultiplier: positionMultiplier,
        reason: "Elevated bounce risk at K <= 30"
      }
  
  RETURN PASS with positionMultiplier = 1.00
```

---

## 🟠 SECTION 2: Hard Gates (Binary Pass/Fail)

### HTF_NOT_ALIGNED Gate

```
// ============= HTF_NOT_ALIGNED GATE =============
// Ensures trades follow the 4h structural trend

CONSTANTS:
  STRONG_4H_CONFIDENCE = 68
  STRONG_1H_CONFIDENCE = 62
  LOCAL_CONFIDENCE_THRESHOLD = 70  // For bypass
  PRICE_ACTION_OVERRIDE_MOVE = 2.5  // %

FUNCTION checkHTFAlignment(trend4h, conf4h, trend1h, conf1h, derivedDirection, confidenceLocal, priceMove):
  
  intendedMarketDirection = derivedDirection == "long" ? "bullish" : "bearish"
  is4hCounterTrend = trend4h != "neutral" AND trend4h != intendedMarketDirection
  is1hCounterTrendTo4h = trend4h != "neutral" AND trend1h != "neutral" AND trend1h != trend4h
  
  // ===== COUNTER-TREND CHECK =====
  IF is4hCounterTrend AND conf4h >= 55:
    
    // ===== BYPASS 1: Strong Local Confidence =====
    IF confidenceLocal >= LOCAL_CONFIDENCE_THRESHOLD:
      LOG "HTF bypass: Local confidence {confidenceLocal}% >= 70%"
      RETURN PASS with positionMultiplier = 0.65
    
    // ===== BYPASS 2: Strong 1H (Non-Counter to 4H) =====
    has1hStrongDirection = trend1h == intendedMarketDirection AND conf1h >= STRONG_1H_CONFIDENCE
    IF has1hStrongDirection AND NOT is1hCounterTrendTo4h:
      LOG "HTF bypass: Strong 1H ({conf1h}%) aligned, not counter to 4H"
      RETURN PASS with positionMultiplier = 0.75
    
    // ===== BYPASS 3: Price Action Override (Directional) =====
    priceActionAligned = (derivedDirection == "long" AND priceMove > 0) OR
                         (derivedDirection == "short" AND priceMove < 0)
    IF |priceMove| >= PRICE_ACTION_OVERRIDE_MOVE AND priceActionAligned:
      LOG "HTF bypass: Price action {priceMove}% >= 2.5% aligned with direction"
      RETURN PASS with positionMultiplier = 0.60
    
    // ===== REJECT =====
    REJECT {
      gate: "HTF_NOT_ALIGNED",
      severity: "HIGH",
      reason: "4h trend is {trend4h} ({conf4h}%) opposing {derivedDirection}",
      confidenceLocal: confidenceLocal,
      confidenceGlobal: conf4h,
      whatWouldPass: {
        option1: "confidenceLocal >= 70 (current: {confidenceLocal})",
        option2: "1H {intendedMarketDirection} with conf >= 62% and not counter to 4H",
        option3: "Price move >= 2.5% in {derivedDirection} direction"
      },
      positionMultiplier: 0.00
    }
  
  RETURN PASS
```

---

### MOMENTUM_DIRECTION_OPPOSING Gate

```
// ============= MOMENTUM_DIRECTION_OPPOSING GATE =============
// Prevents entries into active counter-momentum

CONSTANTS:
  NEUTRAL_BAND_LOW = -10
  NEUTRAL_BAND_HIGH = +10
  WEAK_MACD_ATR_MULTIPLIER = 0.1
  EARLY_TREND_LOW = +20
  EARLY_TREND_HIGH = +50
  EXCEPTIONAL_ADX = 35

FUNCTION checkMomentumDirection(momentumScore, derivedDirection, macdHistogram, atr, adx, momentumState):
  
  // ===== PHASE 1: SCORE POLARITY =====
  attemptingLong = derivedDirection == "long"
  momentumOpposes = (attemptingLong AND momentumScore < NEUTRAL_BAND_LOW) OR
                    (NOT attemptingLong AND momentumScore > NEUTRAL_BAND_HIGH)
  
  // Skip Phase 2 if momentum neutral
  isNeutral = momentumScore >= NEUTRAL_BAND_LOW AND momentumScore <= NEUTRAL_BAND_HIGH
  
  IF momentumOpposes:
    
    // ===== EXCEPTION 1: EXCEPTIONAL ADX OVERRIDE =====
    IF adx >= EXCEPTIONAL_ADX:
      LOG "Momentum gate bypassed: Exceptional ADX {adx} >= 35"
      RETURN PASS with positionMultiplier = 0.75
    
    // ===== EXCEPTION 2: EARLY TREND EXCEPTION =====
    absMomentum = |momentumScore|
    isEarlyTrend = absMomentum >= EARLY_TREND_LOW AND absMomentum <= EARLY_TREND_HIGH
    
    IF isEarlyTrend:
      // Graduated sizing based on score
      positionMultiplier = 
        absMomentum <= 25 ? 0.55 :
        absMomentum <= 35 ? 0.65 :
        absMomentum <= 45 ? 0.75 :
        0.80
      
      LOG "Early Trend Exception: momentum={momentumScore}, size={positionMultiplier}"
      RETURN PASS with positionMultiplier
    
    // ===== PHASE 2: MACD SYMMETRY (Skip if neutral) =====
    IF NOT isNeutral:
      atrNormalizedMacd = |macdHistogram| / (atr * WEAK_MACD_ATR_MULTIPLIER)
      macdAgrees = (attemptingLong AND macdHistogram > 0) OR
                   (NOT attemptingLong AND macdHistogram < 0)
      
      IF NOT macdAgrees AND atrNormalizedMacd > 1.0:
        
        // State-based threshold adjustment
        effectiveThreshold = NEUTRAL_BAND_LOW
        IF momentumState == "confirmed": effectiveThreshold -= 5
        IF momentumState == "exhausted": effectiveThreshold += 5
        
        REJECT {
          gate: "MOMENTUM_DIRECTION_OPPOSING",
          severity: "HIGH",
          phase: 2,
          reason: "Momentum score {momentumScore} opposes {derivedDirection}, MACD confirms opposition",
          momentumState: momentumState,
          macdHistogram: macdHistogram,
          atrNormalizedMacd: atrNormalizedMacd,
          adx: adx,
          whatWouldPass: {
            option1: "ADX >= 35 (current: {adx})",
            option2: "Momentum in Early Trend zone (±20 to ±50)",
            option3: "MACD histogram aligns with direction"
          },
          positionMultiplier: 0.00
        }
  
  RETURN PASS
```

---

### NO_MOMENTUM_CONFIRMATION Gate

```
// ============= NO_MOMENTUM_CONFIRMATION GATE =============
// Requires momentum evidence before entry

CONSTANTS:
  ADX_FLOOR = 20
  STRONG_TREND_ADX = 28
  TREND_ACCEL_MOVE = 2.5  // %
  MAX_EXCEPTION_DEPTH = 1

FUNCTION checkMomentumConfirmation(momentumConfirms, momentumState, adx, adxSlope, priceMove):
  
  exceptionDepth = 0
  
  // ===== PATH 1: Standard Momentum Confirmation =====
  IF momentumConfirms:
    RETURN PASS with positionMultiplier = 1.00
  
  // ===== PATH 2: State Presence (with ADX floor) =====
  IF momentumState IN ["building", "confirmed"] AND adx >= ADX_FLOOR:
    LOG "Momentum confirmed via state: {momentumState}, ADX={adx}"
    RETURN PASS with positionMultiplier = 0.90
  
  // ===== PATH 3: Strong Trend Exception =====
  IF adx >= STRONG_TREND_ADX:
    exceptionDepth++
    LOG "Momentum exception: Strong trend ADX={adx} >= 28"
    RETURN PASS with positionMultiplier = 0.85
  
  // ===== PATH 4: Trend Acceleration Bypass =====
  IF |priceMove| >= TREND_ACCEL_MOVE AND adxSlope > 0:
    exceptionDepth++
    
    IF exceptionDepth > MAX_EXCEPTION_DEPTH:
      LOG "Acceleration bypass blocked: Max exception depth exceeded"
    ELSE:
      LOG "Momentum exception: Trend acceleration {priceMove}%, rising ADX"
      RETURN PASS with positionMultiplier = 0.70
  
  // ===== PATH 5: Premium Overrides (Direction Bias) =====
  // Pre-momentum StochRSI or Short-term alignment
  // FIX #4 (Audit): Path 5 now increments exceptionDepth like Paths 3-4
  IF hasPreMomentumStochRSI OR hasShortTermAlignment:
    exceptionDepth++  // <-- NEW: Prevents silent exception stacking
    
    IF exceptionDepth > MAX_EXCEPTION_DEPTH:
      LOG "Premium override blocked: Max exception depth exceeded"
    ELSE:
      directionBias = inferDirectionBias()
      
      IF directionBias != derivedDirection:
        LOG "Premium override: Direction bias conflicts, applying 0.70x"
        RETURN PASS with positionMultiplier = 0.70
      ELSE:
        RETURN PASS with positionMultiplier = 0.85
  
  // ===== REJECT =====
  REJECT {
    gate: "NO_MOMENTUM_CONFIRMATION",
    severity: "HIGH",
    reason: "No momentum confirmation and no exceptions apply",
    momentumState: momentumState,
    momentumConfirms: momentumConfirms,
    adx: adx,
    adxSlope: adxSlope,
    priceMove: priceMove,
    exceptionDepth: exceptionDepth,
    whatWouldPass: {
      path1: "Standard momentum confirms",
      path2: "Momentum state 'building'/'confirmed' with ADX >= 20",
      path3: "ADX >= 28 (current: {adx})",
      path4: "Price move >= 2.5% with rising ADX",
      path5: "Pre-momentum StochRSI or Short-term alignment"
    },
    positionMultiplier: 0.00
  }
```

---

### MOMENTUM_SCORE_TOO_LOW Gate

```
// ============= MOMENTUM_SCORE_TOO_LOW GATE =============
// Enforces minimum momentum score with regime adjustments

CONSTANTS:
  BASE_THRESHOLD = 5
  PULLBACK_THRESHOLD = 3
  RECOVERY_THRESHOLD = 7
  ACCELERATING_TREND_ADX = 30

FUNCTION checkMomentumScore(momentumScore, derivedDirection, adx, adxSlope, regime, momentumState, isPullback):
  
  // ===== STEP 1: BASE THRESHOLD =====
  threshold = isPullback ? PULLBACK_THRESHOLD : BASE_THRESHOLD
  
  // ===== STEP 2: REGIME ADJUSTMENT =====
  IF regime == "RANGE": threshold += 1
  IF regime == "STRONG_TREND": threshold -= 1
  
  // ===== STEP 3: STATE COUPLING =====
  IF momentumState == "confirmed": threshold -= 1
  IF momentumState == "exhausted": threshold += 1
  
  effectiveThreshold = MAX(threshold, 1)  // Floor at 1
  
  // ===== CHECK: ACCELERATING TREND EXCEPTION =====
  IF adx >= ACCELERATING_TREND_ADX AND adxSlope > 0:
    LOG "Accelerating Trend Exception: ADX={adx} >= 30, slope rising"
    RETURN PASS with positionMultiplier = 0.70
  
  // ===== SCORE CHECK =====
  IF momentumScore < effectiveThreshold:
    
    // Graduated sizing for near-miss
    deficit = effectiveThreshold - momentumScore
    IF deficit <= 2:
      positionMultiplier = 0.90 - (deficit * 0.10)
      LOG "Momentum near-miss override: score={momentumScore}, threshold={effectiveThreshold}"
      RETURN PASS with positionMultiplier
    
    REJECT {
      gate: "MOMENTUM_SCORE_TOO_LOW",
      severity: "MODERATE",
      reason: "Momentum score {momentumScore} < threshold {effectiveThreshold}",
      thresholdChain: {
        base: BASE_THRESHOLD,
        afterRegime: threshold - stateAdjustment,
        afterState: effectiveThreshold
      },
      adx: adx,
      adxSlope: adxSlope,
      acceleratingTrendCheck: {
        required: "ADX >= 30 AND slope > 0",
        current: "ADX={adx}, slope={adxSlope}",
        passed: false
      },
      whatWouldPass: {
        option1: "Score >= {effectiveThreshold}",
        option2: "ADX >= 30 with rising slope",
        option3: "Score >= {effectiveThreshold - 2} (near-miss override)"
      },
      positionMultiplier: 0.00
    }
  
  RETURN PASS
```

---

### MOVE_EXHAUSTED Gate

```
// ============= MOVE_EXHAUSTED GATE =============
// Blocks late entries after significant price expansion

CONSTANTS:
  FRESH_ZONE_MAX = 3.5      // % from 24h low/high
  SOFT_ZONE_MAX = 5.0       // %
  SOFT_ZONE_K_LONG = 65     // Max K for soft zone LONG
  SOFT_ZONE_K_SHORT = 35    // Min K for soft zone SHORT
  HARD_ZONE_ADX = 40
  HARD_ZONE_ADX_SLOPE = 0.2

FUNCTION checkMoveExhaustion(priceDistanceFrom24hLow, priceDistanceFrom24hHigh, derivedDirection, stochK, adx, adxSlope):
  
  // ===== LONG CHECK =====
  IF derivedDirection == "long":
    moveFromLow = priceDistanceFrom24hLow  // % above 24h low
    
    // FRESH ZONE: < 3.5%
    IF moveFromLow < FRESH_ZONE_MAX:
      RETURN PASS with positionMultiplier = 1.00
    
    // SOFT ZONE: 3.5% - 5.0%
    IF moveFromLow < SOFT_ZONE_MAX:
      IF stochK <= SOFT_ZONE_K_LONG:
        RETURN PASS with positionMultiplier = 0.35
      ELSE:
        REJECT {
          gate: "MOVE_EXHAUSTED",
          zone: "SOFT",
          reason: "Move {moveFromLow}% from low, K={stochK} > 65",
          whatWouldPass: "K <= 65 for soft zone entry"
        }
    
    // HARD ZONE: >= 5.0%
    IF moveFromLow >= SOFT_ZONE_MAX:
      IF adx >= HARD_ZONE_ADX AND adxSlope >= HARD_ZONE_ADX_SLOPE:
        LOG "Hard zone bypass: ADX={adx} >= 40, slope={adxSlope} >= 0.2"
        RETURN PASS with positionMultiplier = 0.40
      
      REJECT {
        gate: "MOVE_EXHAUSTED",
        zone: "HARD",
        severity: "HIGH",
        reason: "LONG blocked: {moveFromLow}% above 24h low (>= 5%)",
        priceDistanceFromSwing: moveFromLow,
        adx: adx,
        adxSlope: adxSlope,
        whatWouldPass: {
          option1: "Move < 3.5% from 24h low",
          option2: "Move 3.5-5% with K <= 65",
          option3: "ADX >= 40 AND slope >= 0.2 (current: {adx}, {adxSlope})"
        },
        positionMultiplier: 0.00
      }
  
  // ===== SHORT CHECK (symmetric) =====
  IF derivedDirection == "short":
    moveFromHigh = priceDistanceFrom24hHigh  // % below 24h high
    
    IF moveFromHigh < FRESH_ZONE_MAX:
      RETURN PASS with positionMultiplier = 1.00
    
    IF moveFromHigh < SOFT_ZONE_MAX:
      IF stochK >= SOFT_ZONE_K_SHORT:
        RETURN PASS with positionMultiplier = 0.35
      ELSE:
        REJECT {
          gate: "MOVE_EXHAUSTED",
          zone: "SOFT",
          reason: "Move {moveFromHigh}% from high, K={stochK} < 35"
        }
    
    IF moveFromHigh >= SOFT_ZONE_MAX:
      IF adx >= HARD_ZONE_ADX AND adxSlope >= HARD_ZONE_ADX_SLOPE:
        RETURN PASS with positionMultiplier = 0.40
      
      REJECT {
        gate: "MOVE_EXHAUSTED",
        zone: "HARD",
        severity: "HIGH",
        reason: "SHORT blocked: {moveFromHigh}% below 24h high (>= 5%)"
      }
  
  RETURN PASS
```

---

## 🟡 SECTION 3: Direction Derivation Hierarchy

### Complete 12-Tier Direction Derivation

```
// ============= DIRECTION DERIVATION ENGINE =============
// Attempts 12 tiers in priority order to derive trade direction
// If ALL fail → NO_CLEAR_DIRECTION rejection

FUNCTION deriveTradeDirection(trendData, orderFlowData):
  
  // ===== PRE-TIER: REGIME CLASSIFICATION =====
  regime = classifyRegime(adx, adxSlope)
  // Returns: STRONG_TREND | EARLY_TREND | RANGE | EXHAUSTION
  
  directionContext = new DirectionContext()
  tier10Fired = false
  
  // ============= TIER 0: WEIGHTED HTF CONSENSUS =============
  weightedSum = (val4h * 0.40) + (val1h * 0.35) + (val30m * 0.25)
  
  // Dynamic weight reallocation if 4h weak
  IF trend4h == "neutral" AND conf4h < 45:
    weightedSum = (val1h * 0.65) + (val30m * 0.35)
  
  threshold = regime == STRONG_TREND ? 0.40 : 0.55
  
  IF |weightedSum| >= threshold:
    RETURN direction, conf, source="weighted-derivation", pos=1.00
  
  // Order flow tiebreaker for marginal sums
  IF 0.35 <= |weightedSum| < threshold AND orderFlowStrong:
    IF passes30mAlignmentCheck:
      RETURN direction, conf, source="order-flow-tiebreaker", pos=0.65
  
  // ============= TIER 0.25: EXHAUSTION REVERSAL =============
  // TIGHTENED: Requires regime + HTF weakening
  IF regime IN [EXHAUSTION, RANGE]:
    IF conf4h < 60 AND conf1h < 55:  // HTF weakening
      IF isDeepExhaustion AND momentumSupports:
        RETURN direction, conf, source="exhaustion-reversal", pos=0.50
  
  // ============= TIER 0.5: MOMENTUM-WEIGHTED OVERRIDE =============
  tier2Score = calculateTier2Score(momentum, orderFlow, stochRsi, macdSlope)
  minScore = regime == RANGE ? 4 : regime == STRONG_TREND ? 2 : 3
  
  IF tier2Score >= minScore:
    posMultiplier = score >= 7 ? 0.90 : score >= 5 ? 0.70 : 0.55
    RETURN direction, conf, source="weighted-momentum-override", pos=posMultiplier
  
  // ============= TIER 1: PRICE ACTION MOMENTUM =============
  IF hasStrongPriceMove AND priceActionConfirms:
    IF alignsWithHTF OR htfNeutral:
      RETURN direction, conf, source="price-action-momentum", pos=0.75
  
  // ============= TIER 2: STRONG 4H TREND =============
  IF trend4h != "neutral" AND conf4h >= 55:
    RETURN trend4h direction, conf4h, source="4h", pos=1.00
  
  // ============= TIER 3: STRONG 1H TREND =============
  IF trend1h != "neutral" AND conf1h >= 60:
    RETURN trend1h direction, conf1h, source="1h", pos=1.00
  
  // ============= TIER 4: CONSECUTIVE CANDLE MOMENTUM =============
  IF trend4h == "neutral" AND consecutiveBars1h >= 5 AND adx >= 20:
    RETURN inferred direction, conf, source="consecutive-candle-momentum", pos=0.65
  
  // ============= TIER 5: BUILDING TREND =============
  IF trend1h != "neutral" AND conf1h IN [57, 60) AND adxRising:
    RETURN trend1h direction, conf * 0.85, source="1h-building-override", pos=0.75
  
  // ============= TIER 6: 1H+30M ALIGNMENT =============
  IF trend4h == "neutral" AND trend1h == trend30m AND trend1h != "neutral":
    RETURN aligned direction, avgConf, source="1h+30m", pos=1.00
  
  // ============= TIER 7: 2-OF-3 AGREEMENT =============
  IF 2+ timeframes agree (with 4h included for bonus):
    RETURN majority direction, avgConf * 0.9, source="2-of-3", pos=0.90
  
  // ============= TIER 8: EARLY MOMENTUM 30M =============
  // EPISTEMIC FLOOR: 2+ evidence types required in RANGE
  IF trend30m != "neutral" AND conf30m >= 65:
    IF regime == RANGE AND evidenceCount < 2:
      LOG "Tier 8 blocked: Epistemic floor not met"
      SKIP
    RETURN trend30m direction, conf, source="early-momentum-30m+1h", pos=0.50
  
  // ============= TIER 9: PRIMARY TREND FALLBACK =============
  // EPISTEMIC FLOOR: 2+ evidence types required in RANGE
  IF primaryTrend IN ["bullish", "bearish"]:
    IF regime == RANGE AND evidenceCount < 2:
      LOG "Tier 9 blocked: Epistemic floor not met"
      SKIP
    RETURN primaryTrend direction, conf * 0.80, source="primary", pos=0.80
  
  // ============= TIER 10: MOMENTUM + ORDER FLOW FALLBACK =============
  // MUTUALLY EXCLUSIVE with Tier 11
  IF |momentumScore| >= 20 AND adx >= 18:
    IF orderFlowSupports OR stochConfirms:
      tier10Fired = true
      RETURN momentum direction, conf, source="momentum-fallback", pos=0.55-0.70
  
  // ============= TIER 11: EXHAUSTION ESCAPE HATCH =============
  // MUTUALLY EXCLUSIVE with Tier 10
  IF NOT tier10Fired AND regime == EXHAUSTION:
    IF isOversold AND momentumAllows:
      RETURN "long", conf=45-50, source="exhaustion-escape", pos=0.45
    IF isOverbought AND momentumAllows:
      RETURN "short", conf=45-50, source="exhaustion-escape", pos=0.45
  
  // ============= TIER 12: TERMINAL FALLBACK =============
  // All tiers exhausted - NO_CLEAR_DIRECTION
  REJECT {
    gate: "NO_CLEAR_DIRECTION",
    severity: "TERMINAL",
    reason: "All 12 tiers exhausted without confident direction",
    directionContext: directionContext,
    trend4h: trend4h,
    trend1h: trend1h,
    trend30m: trend30m,
    regime: regime,
    weightedSum: weightedSum,
    tier2Score: tier2Score,
    tier10Evaluated: true,
    tier10Fired: tier10Fired,
    epistemicFloorApplied: regime == RANGE,
    evidenceCount: evidenceCount,
    positionMultiplier: 0.00,
    action: "CAPITAL PROTECTION - No entry"
  }
```

---

## 🟢 SECTION 4: Unified Reversal Score System

```
// ============= UNIFIED REVERSAL SCORE =============
// Consolidates reversal risk signals into single 0-100 score

CONSTANTS:
  BLOCK_THRESHOLD = 60
  REDUCE_THRESHOLD = 40
  STRONG_TREND_REDUCTION = 0.5  // 50% impact reduction

FUNCTION calculateUnifiedReversalScore(indicators):
  
  score = 0
  
  // StochRSI extremes
  IF stochK4h >= 90: score += 25
  ELSE IF stochK4h >= 80: score += 15
  IF stochK4h <= 10: score += 25
  ELSE IF stochK4h <= 20: score += 15
  
  // StochRSI cross
  IF stochKCrossedD AND crossDirection opposes trade: score += 10
  
  // MACD divergence
  IF macdDivergesFromPrice: score += 20
  
  // Momentum exhaustion
  IF momentumState == "exhausted": score += 15
  
  // Volume declining
  IF volumeRatio < 0.7: score += 10
  
  // HTF counter-trend
  IF trend4h opposes derivedDirection AND conf4h >= 60: score += 20
  
  // Time in extreme
  IF barsAtExtreme >= 8: score += 15
  IF barsAtExtreme >= 12: score += 10  // Additional
  
  // ===== STRONG TREND REDUCTION =====
  IF adx >= 30:
    score = score * (1 - STRONG_TREND_REDUCTION)  // 50% reduction
  
  score = MIN(score, 100)
  
  // ===== APPLY SCORE =====
  IF score >= BLOCK_THRESHOLD:
    REJECT {
      gate: "UNIFIED_REVERSAL_SCORE",
      tier: 1,
      severity: "HIGH",
      reason: "Reversal score {score} >= 60: Trade blocked",
      scoreBreakdown: breakdown,
      positionMultiplier: 0.00
    }
  
  IF score >= REDUCE_THRESHOLD:
    RETURN PASS with positionMultiplier = 0.50, note="Reversal score {score}: 50% position reduction"
  
  RETURN PASS with positionMultiplier = 1.00
```

---

## 📊 Summary: Tier Interaction Matrix

| Tier System | Tier | Severity | Bypassable | Position Multiplier |
|-------------|------|----------|------------|---------------------|
| **StochRSI** | 0 (Deep) | CRITICAL | ❌ Never | 0.00 |
| **StochRSI** | 1 (Severe) | CRITICAL | 🔄 Mean Reversion only | 0.50 |
| **StochRSI** | 2 (Standard) | HIGH | ✅ ADX >= 35 + Rev < 45 | 0.50 |
| **StochRSI** | 3 (Caution) | MODERATE | ✅ Always (penalty) | 0.75 |
| **Direction** | 0-1 | LOW | N/A | 1.00-0.75 |
| **Direction** | 2-7 | LOW-MEDIUM | N/A | 0.65-1.00 |
| **Direction** | 8-9 | MEDIUM | Epistemic Floor | 0.50-0.80 |
| **Direction** | 10-11 | MEDIUM-HIGH | Mutual Exclusivity | 0.45-0.70 |
| **Direction** | 12 | TERMINAL | ❌ Never | 0.00 |
| **Hard Gates** | HTF_NOT_ALIGNED | HIGH | ✅ Multiple paths | 0.60-0.75 |
| **Hard Gates** | MOMENTUM_DIRECTION | HIGH | ✅ ADX/Early Trend | 0.55-0.80 |
| **Hard Gates** | NO_MOMENTUM_CONF | HIGH | ✅ 5 paths | 0.70-1.00 |
| **Hard Gates** | MOVE_EXHAUSTED | HIGH | ✅ Zone-based | 0.35-0.40 |
| **Reversal Score** | 60+ | HIGH | ❌ Block | 0.00 |
| **Reversal Score** | 40-60 | MODERATE | ✅ Reduce | 0.50 |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.3 | 2025-01-27 | **FIX #1 (Audit)**: Added formal `isExtremeMeanReversion` definition for Tier 1 bypass. Requires: regime IN [RANGE, LATE_TREND, EXHAUSTION], reversalScore >= 55, momentumState != 'confirmed'. Prevents trend-continuation logic from leaking into Tier 1 bypasses. |
| 1.2 | 2025-01-27 | **FIX #2 (Audit)**: Added `stochRSITier2Bypassed` flag to `calculateUnifiedReversalScore`. When Tier 2 bypass is applied, StochRSI contribution capped at +10 (vs default +20) to prevent double punishment. |
| 1.1 | 2025-01-27 | **FIX #4 (Audit)**: Added exception depth tracking to Path 5 (Premium Overrides) in NO_MOMENTUM_CONFIRMATION gate. |
| 1.0 | 2025-01-27 | Initial comprehensive pseudocode documentation |
