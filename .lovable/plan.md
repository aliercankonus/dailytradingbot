
# Plan: Add Exhaustion Reversal Override to deriveTradeDirection

## Problem Statement
The current `deriveTradeDirection` function lacks a high-priority mechanism to detect and respond to **extreme exhaustion reversal setups**. When:
- StochRSI 4h K < 10 (deep oversold)
- Price is below the Bollinger lower band (%B < 20)
- Momentum has turned positive (or is improving)

The system should override the derived direction to **LONG** regardless of HTF trend labels, since these conditions represent a statistically high-probability bounce setup.

Currently, the mean-reversion module in `mean-reversion.ts` handles exhaustion detection separately, but it does not integrate with the direction derivation flow. The direction derivation still returns SHORT or null based on lagging HTF trend labels, causing the paradox identified in the market conditions analysis.

## Solution Architecture

### New Priority Level: EXHAUSTION REVERSAL OVERRIDE (Priority 0.25)
Insert a new direction override that runs **before** the weighted momentum override (Priority 0.5). This ensures exhaustion reversal detection takes precedence over trend-following logic.

### Detection Criteria (AND gate with relaxed requirements)
For **LONG** override:
1. **StochRSI 4h K ≤ 10** (extreme oversold)
2. **Bollinger %B ≤ 20** (at or below lower band)
3. **Momentum positive OR improving** (score > 0 OR slope > 0 OR MACD histogram improving)
4. **ADX not accelerating** (slope ≤ 0) - prevents catching falling knives
5. **NOT in breakout/expansion** (volume ratio < 1.8 or no squeeze release)

For **SHORT** override (symmetric, but stricter):
1. **StochRSI 4h K ≥ 90** (extreme overbought)
2. **Bollinger %B ≥ 80** (at or near upper band)
3. **Momentum negative OR declining** (score < 0 OR slope < 0 OR MACD histogram declining)
4. **ADX not accelerating** (slope ≤ 0)
5. **4h trend not bullish with high confidence** (prevents shorting into strong uptrends)

### Position Sizing (Conservative)
- **Base**: 40% of normal position
- **With momentum confirmation**: 50% of normal position
- **With strong momentum + order flow alignment**: 55% of normal position

### Confidence Calculation
- Base: 55% confidence
- +5% if momentum confirms direction
- +5% if order flow aligns
- +5% if MACD histogram improving in direction
- Maximum: 70%

---

## Implementation Details

### File 1: `supabase/functions/_shared/constants.ts`

Add new configuration block after `MOMENTUM_OVERRIDE_DIRECTION_PARAMS`:

```text
EXHAUSTION_REVERSAL_OVERRIDE_PARAMS = {
  ENABLED: true,
  
  // ===== STOCHRSI THRESHOLDS =====
  // StochRSI 4h K thresholds for exhaustion detection
  LONG_K_THRESHOLD: 10,           // K <= 10 for LONG override
  SHORT_K_THRESHOLD: 90,          // K >= 90 for SHORT override
  
  // ===== BOLLINGER %B THRESHOLDS =====
  // Price position relative to Bollinger Bands
  LONG_PERCENT_B_THRESHOLD: 20,   // %B <= 20 (at/below lower band)
  SHORT_PERCENT_B_THRESHOLD: 80,  // %B >= 80 (at/near upper band)
  
  // ===== MOMENTUM REQUIREMENTS =====
  // At least ONE of these must be true for direction confirmation
  // For LONG: score > 0 OR slope > 0 OR MACD improving
  // For SHORT: score < 0 OR slope < 0 OR MACD declining
  REQUIRE_MOMENTUM_CONFIRMATION: true,
  MACD_IMPROVING_COUNTS: true,    // MACD histogram improving counts as confirmation
  
  // ===== ADX REQUIREMENTS =====
  // ADX must NOT be accelerating (prevents catching falling knives)
  MAX_ADX_SLOPE: 0.05,            // ADX slope must be <= 0.05
  
  // ===== EXPANSION/BREAKOUT BLOCKING =====
  // Block override during active expansion (volume spike or squeeze release)
  BLOCK_ON_EXPANSION: true,
  MAX_VOLUME_RATIO: 1.8,          // Block if volume ratio > 1.8
  BLOCK_ON_SQUEEZE_RELEASE: true, // Block if squeeze just released
  
  // ===== SHORT-SPECIFIC RESTRICTIONS =====
  // Extra protection against shorting into strong uptrends
  SHORT_BLOCK_IF_4H_BULLISH_CONF: 70, // Block SHORT if 4h bullish >= 70%
  
  // ===== POSITION SIZING =====
  BASE_POSITION_MULTIPLIER: 0.40,      // 40% base
  MOMENTUM_CONFIRMED_MULTIPLIER: 0.50, // 50% with momentum
  STRONG_SETUP_MULTIPLIER: 0.55,       // 55% with momentum + order flow
  
  // ===== CONFIDENCE CALCULATION =====
  BASE_CONFIDENCE: 55,
  MOMENTUM_CONFIRMS_BONUS: 5,
  ORDER_FLOW_ALIGNED_BONUS: 5,
  MACD_IMPROVING_BONUS: 5,
  MAX_CONFIDENCE: 70,
  
  // ===== LOGGING =====
  LOG_OVERRIDES: true,
  LOG_SKIPS: true,
}
```

### File 2: `supabase/functions/_shared/scoring.ts`

#### 2.1 Update DirectionResult Interface

Add new field:

```typescript
interface DirectionResult {
  // ... existing fields ...
  isExhaustionReversal?: boolean;  // NEW: Used exhaustion reversal override
}
```

#### 2.2 Add Import

Update the import statement to include the new params:

```typescript
import { 
  // ... existing imports ...
  EXHAUSTION_REVERSAL_OVERRIDE_PARAMS 
} from "./constants.ts";
```

#### 2.3 Add Exhaustion Reversal Override Logic

Insert new priority block **BEFORE** the weighted momentum override (Priority 0.5), at approximately line 2127 in `deriveTradeDirection`:

```text
// ============= PRIORITY 0.25: EXHAUSTION REVERSAL OVERRIDE =============
// When market is at extreme exhaustion (deep oversold/overbought), override direction
// This captures bounce setups that lagging trend labels miss
if (EXHAUSTION_REVERSAL_OVERRIDE_PARAMS.ENABLED) {
  const ER = EXHAUSTION_REVERSAL_OVERRIDE_PARAMS;
  
  // Get 4h StochRSI K value
  const stochK4h = trendData.stochasticRsi?.['4h']?.k ?? 
                   trendData.timeframes?.['4h']?.indicators?.stochRsi?.k ?? 50;
  
  // Get Bollinger %B (4h preferred, fall back to 1h)
  const percentB4h = trendData.bollingerBands?.['4h']?.percentB ?? 50;
  const percentB1h = trendData.bollingerBands?.['1h']?.percentB ?? 50;
  const percentB = percentB4h !== 50 ? percentB4h : percentB1h;
  
  // Get momentum data
  const momentumScore = trendData.smartMomentum?.score ?? trendData.momentum?.score ?? 0;
  const momentumSlope = trendData.smartMomentum?.components?.macdSlope ?? 
                        trendData.momentum?.macdSlope ?? 0;
  const macdHist = trendData.momentum?.macdHistogram ?? 0;
  const prevMacdHist = trendData.momentum?.prevMacdHistogram ?? macdHist;
  const macdImproving = macdHist > prevMacdHist;
  const macdDeclining = macdHist < prevMacdHist;
  
  // Get ADX data
  const adxSlope = trendData.volatility?.adxSlope ?? trendData.momentum?.adxSlope ?? 0;
  
  // Get volume/expansion data
  const volumeRatio = trendData.volume?.ratio ?? trendData.volatility?.volumeRatio ?? 1.0;
  const squeezeJustReleased = trendData.squeeze?.justReleased ?? false;
  const isExpansion = (volumeRatio > ER.MAX_VOLUME_RATIO) || 
                      (ER.BLOCK_ON_SQUEEZE_RELEASE && squeezeJustReleased);
  
  // Get order flow data
  const ofScore = orderFlowData?.score ?? 0;
  const ofSignal = orderFlowData?.signal?.toLowerCase() ?? "";
  const ofBullish = ofSignal.includes("buy") || ofSignal === "bullish";
  const ofBearish = ofSignal.includes("sell") || ofSignal === "bearish";
  
  // ===== CHECK FOR LONG EXHAUSTION REVERSAL =====
  const isDeepOversold = stochK4h <= ER.LONG_K_THRESHOLD;
  const belowLowerBand = percentB <= ER.LONG_PERCENT_B_THRESHOLD;
  const momentumConfirmsLong = momentumScore > 0 || momentumSlope > 0 || 
                               (ER.MACD_IMPROVING_COUNTS && macdImproving);
  const adxNotAccelerating = adxSlope <= ER.MAX_ADX_SLOPE;
  
  if (isDeepOversold && belowLowerBand && !isExpansion && adxNotAccelerating) {
    // Check if momentum confirms (or we don't require it)
    if (!ER.REQUIRE_MOMENTUM_CONFIRMATION || momentumConfirmsLong) {
      // Calculate confidence and position size
      let confidence = ER.BASE_CONFIDENCE;
      let positionMult = ER.BASE_POSITION_MULTIPLIER;
      const erReasons: string[] = [];
      
      if (momentumScore > 0) {
        confidence += ER.MOMENTUM_CONFIRMS_BONUS;
        positionMult = ER.MOMENTUM_CONFIRMED_MULTIPLIER;
        erReasons.push(`momentum_positive(${momentumScore.toFixed(0)})`);
      }
      if (ofBullish && ofScore >= 50) {
        confidence += ER.ORDER_FLOW_ALIGNED_BONUS;
        positionMult = Math.max(positionMult, ER.STRONG_SETUP_MULTIPLIER);
        erReasons.push(`orderFlow_bullish(${ofScore.toFixed(0)})`);
      }
      if (macdImproving) {
        confidence += ER.MACD_IMPROVING_BONUS;
        erReasons.push("macd_improving");
      }
      
      confidence = Math.min(confidence, ER.MAX_CONFIDENCE);
      
      reasons.push(`EXHAUSTION REVERSAL OVERRIDE → LONG`);
      reasons.push(`StochRSI 4h K=${stochK4h.toFixed(1)} <= ${ER.LONG_K_THRESHOLD} (deep oversold)`);
      reasons.push(`Bollinger %B=${percentB.toFixed(1)} <= ${ER.LONG_PERCENT_B_THRESHOLD} (below lower band)`);
      reasons.push(`ADX slope=${adxSlope.toFixed(2)} <= ${ER.MAX_ADX_SLOPE} (not accelerating)`);
      reasons.push(`Confirmations: ${erReasons.length > 0 ? erReasons.join(", ") : "base setup only"}`);
      reasons.push(`Conf=${confidence.toFixed(0)}% | Pos=${(positionMult * 100).toFixed(0)}%`);
      
      return {
        direction: "long",
        confidence,
        source: "exhaustion-reversal",
        reasons,
        positionSizeMultiplier: positionMult,
        isExhaustionReversal: true,
        regime,
      };
    } else {
      if (ER.LOG_SKIPS) {
        reasons.push(`EXHAUSTION LONG SKIPPED: K=${stochK4h.toFixed(1)}, %B=${percentB.toFixed(1)} but momentum not confirming (score=${momentumScore.toFixed(0)}, slope=${momentumSlope.toFixed(2)}, macdImproving=${macdImproving})`);
      }
    }
  }
  
  // ===== CHECK FOR SHORT EXHAUSTION REVERSAL =====
  const isDeepOverbought = stochK4h >= ER.SHORT_K_THRESHOLD;
  const aboveUpperBand = percentB >= ER.SHORT_PERCENT_B_THRESHOLD;
  const momentumConfirmsShort = momentumScore < 0 || momentumSlope < 0 || 
                                (ER.MACD_IMPROVING_COUNTS && macdDeclining);
  
  // Additional SHORT protection: block if 4h is strongly bullish
  const is4hStrongBullish = trend4h === "bullish" && conf4h >= ER.SHORT_BLOCK_IF_4H_BULLISH_CONF;
  
  if (isDeepOverbought && aboveUpperBand && !isExpansion && adxNotAccelerating && !is4hStrongBullish) {
    if (!ER.REQUIRE_MOMENTUM_CONFIRMATION || momentumConfirmsShort) {
      let confidence = ER.BASE_CONFIDENCE;
      let positionMult = ER.BASE_POSITION_MULTIPLIER;
      const erReasons: string[] = [];
      
      if (momentumScore < 0) {
        confidence += ER.MOMENTUM_CONFIRMS_BONUS;
        positionMult = ER.MOMENTUM_CONFIRMED_MULTIPLIER;
        erReasons.push(`momentum_negative(${momentumScore.toFixed(0)})`);
      }
      if (ofBearish && ofScore >= 50) {
        confidence += ER.ORDER_FLOW_ALIGNED_BONUS;
        positionMult = Math.max(positionMult, ER.STRONG_SETUP_MULTIPLIER);
        erReasons.push(`orderFlow_bearish(${ofScore.toFixed(0)})`);
      }
      if (macdDeclining) {
        confidence += ER.MACD_IMPROVING_BONUS;
        erReasons.push("macd_declining");
      }
      
      confidence = Math.min(confidence, ER.MAX_CONFIDENCE);
      
      reasons.push(`EXHAUSTION REVERSAL OVERRIDE → SHORT`);
      reasons.push(`StochRSI 4h K=${stochK4h.toFixed(1)} >= ${ER.SHORT_K_THRESHOLD} (deep overbought)`);
      reasons.push(`Bollinger %B=${percentB.toFixed(1)} >= ${ER.SHORT_PERCENT_B_THRESHOLD} (above upper band)`);
      reasons.push(`ADX slope=${adxSlope.toFixed(2)} <= ${ER.MAX_ADX_SLOPE} (not accelerating)`);
      reasons.push(`4h trend: ${trend4h} (${conf4h.toFixed(0)}%) - not blocking`);
      reasons.push(`Confirmations: ${erReasons.length > 0 ? erReasons.join(", ") : "base setup only"}`);
      reasons.push(`Conf=${confidence.toFixed(0)}% | Pos=${(positionMult * 100).toFixed(0)}%`);
      
      return {
        direction: "short",
        confidence,
        source: "exhaustion-reversal",
        reasons,
        positionSizeMultiplier: positionMult,
        isExhaustionReversal: true,
        regime,
      };
    } else {
      if (ER.LOG_SKIPS) {
        reasons.push(`EXHAUSTION SHORT SKIPPED: K=${stochK4h.toFixed(1)}, %B=${percentB.toFixed(1)} but momentum not confirming (score=${momentumScore.toFixed(0)}, slope=${momentumSlope.toFixed(2)}, macdDeclining=${macdDeclining})`);
      }
    }
  }
}
```

---

## Priority Order After Implementation

```text
deriveTradeDirection():
  0. REGIME CLASSIFICATION (STRONG_TREND, EARLY_TREND, RANGE, EXHAUSTION)
  
  0.25 NEW: EXHAUSTION REVERSAL OVERRIDE  ← Added here
       └─ If deep oversold + below BB + momentum confirms: LONG
       └─ If deep overbought + above BB + momentum confirms: SHORT
     
  0.5  WEIGHTED MOMENTUM OVERRIDE (Tier 2 scoring)
       └─ Regime-aware weighted confirmation system
     
  1.0  WEIGHTED DIRECTION (weighted sum of 4h/1h/30m)
  
  ... rest of existing priorities ...
```

---

## Expected Behavior

### Scenario: BTC 4h K=6, %B=12, momentum=+27
**Current**: Returns SHORT or null (lagging HTF labels)
**After**: Returns LONG with 60-65% confidence, 50% position size

### Scenario: ETH 4h K=4, %B=8, momentum=+15, order flow=buy
**Current**: Returns null (no clear direction)
**After**: Returns LONG with 70% confidence, 55% position size

### Scenario: AVAX 4h K=8, %B=15, momentum=-5 (declining), ADX slope=0.5
**Current**: Could still try LONG from exhaustion
**After**: SKIPPED - ADX accelerating (slope > 0.05), momentum negative

---

## Files to Modify

1. **`supabase/functions/_shared/constants.ts`**
   - Add `EXHAUSTION_REVERSAL_OVERRIDE_PARAMS` configuration block

2. **`supabase/functions/_shared/scoring.ts`**
   - Update `DirectionResult` interface with `isExhaustionReversal` field
   - Add import for new params
   - Insert exhaustion reversal override logic at Priority 0.25

---

## Testing Criteria

After deployment, verify in rejection logs:
1. **"EXHAUSTION REVERSAL OVERRIDE → LONG"** appears when K ≤ 10 AND %B ≤ 20 AND momentum positive
2. **Position sizes are 40-55%** of normal for exhaustion reversal entries
3. **Skips are logged** when conditions are met but momentum doesn't confirm
4. **No exhaustion reversals** during expansion (high volume or squeeze release)
5. **SHORT exhaustion blocked** when 4h is strongly bullish (≥70% confidence)
