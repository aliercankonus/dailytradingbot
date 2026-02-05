

# Flash Crash Bounce Probe Implementation Plan

## Executive Summary

This plan introduces a new **Flash Crash Bounce Probe** regime to capture V-shaped reversals after rapid market drops (≥10% in ≤4h) where the existing Capitulation Bounce Probe cannot fire due to its structural guards.

**Key Insight**: The system correctly blocked shorts and correctly blocked longs during the 12-14% flash crash. This is not a bug—it's a **missing regime**. Flash crashes violate both assumptions of the Capitulation Bounce Probe:
- ADX slope stays positive into the low (no exhaustion)
- The bounce begins on the same candle or next candle (no structure stabilization)

---

## Architectural Decision

**Parallel Regime, Not Guard Relaxation**

The Flash Crash Bounce Probe will be implemented as a **separate, isolated regime** with its own configuration. This preserves:
- Capitulation Bounce Probe's conservative guards for gradual exhaustion scenarios
- Mean Reversion logic for controlled counter-trend entries
- Priority 1-2 gates remain untouched

```text
                   ┌──────────────────────────┐
                   │    Counter-Trend Entry   │
                   │         Decision         │
                   └─────────────┬────────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
          ▼                      ▼                      ▼
   ┌─────────────┐       ┌──────────────┐       ┌───────────────┐
   │  Mean       │       │ Capitulation │       │ Flash Crash   │
   │  Reversion  │       │ Bounce Probe │       │ Bounce Probe  │
   │  (gradual)  │       │ (exhaustion) │       │ (rapid V-rev) │
   └─────────────┘       └──────────────┘       └───────────────┘
                                                        │
                                                        ▼
                                                 NEW REGIME
```

---

## Detection Criteria (Hard Requirements)

| Condition | Threshold | Rationale |
|:----------|:----------|:----------|
| Price Drop | ≥10% from 24h high | Significant capitulation event |
| Drop Velocity | ≤4 hours | Flash crash, not gradual decline |
| StochRSI K (4h or 1h) | ≤1 | Absolute floor indicator |
| ADX | ≥35 | High trend energy present |
| Direction | LONG only | Bounce capture, not reversal |

**Key Differences from Capitulation Bounce Probe:**

| Parameter | Capitulation Bounce | Flash Crash Bounce |
|:----------|:--------------------|:-------------------|
| ADX slope | ≤ 0 required | **Ignored** (allowed > 0) |
| Candles since low | ≥ 2 required | **0-1 allowed** |
| Price drop | ≥ 8% | **≥ 10%** (stricter) |
| Intent | Exhaustion bounce | Forced liquidation rebound |

---

## Risk Controls (Mandatory)

Flash crash entries are inherently speculative. These controls are non-negotiable:

1. **Position Size**: 0.20-0.35x (conservative probe)
2. **Stop Loss**: Ultra-tight (≤0.5 ATR or 0.8% fixed)
3. **No Pyramiding**: One-shot attempt only
4. **Cooldown**: 6 hours after failed probe
5. **Max Probes**: 1 per symbol per day
6. **Hard Invalidation**: If K rises above 5 without price moving 0.8%, probe failed

---

## Technical Implementation

### Phase 1: Configuration (constants.ts)

Add new `FLASH_CRASH_BOUNCE_PROBE` configuration block:

```typescript
export const FLASH_CRASH_BOUNCE_PROBE = {
  ENABLED: true,
  
  // ===== DETECTION THRESHOLDS =====
  MIN_DROP_PERCENT: 10,          // ≥10% drop (stricter than capitulation)
  MAX_DROP_HOURS: 4,             // Within 4 hours (velocity check)
  MAX_STOCHRSI_K: 1,             // K ≤ 1 (pinned at floor)
  MIN_ADX: 35,                   // High trend energy
  
  // ===== KEY DIFFERENCE: NO ADX SLOPE REQUIREMENT =====
  // Flash crashes keep ADX slope positive until reversal
  IGNORE_ADX_SLOPE: true,
  
  // ===== KEY DIFFERENCE: NO HTF STRUCTURE REQUIREMENT =====
  // Flash crashes bounce on same candle as low
  IGNORE_HTF_STRUCTURE: true,
  
  // ===== MOMENTUM REQUIREMENTS =====
  // More lenient than capitulation - allow directional momentum
  MOMENTUM_MAX_OPPOSING: 30,     // Block if momentum < -30 (extreme)
  
  // ===== VELOCITY CONFIRMATION =====
  // Optional: Confirm rapid decline via price action
  REQUIRE_VELOCITY_CONFIRMATION: true,
  MIN_HOURLY_DROP_RATE: 2.5,     // ≥2.5% per hour average
  
  // ===== POSITION SIZING =====
  BASE_POSITION_SIZE: 0.20,
  WITH_VOLUME_SPIKE: 0.30,
  WITH_REVERSAL_CANDLE: 0.35,    // If bullish engulfing detected
  
  // ===== STOP LOSS (ULTRA-TIGHT) =====
  STOP_LOSS_ATR_MULTIPLIER: 0.5, // 0.5x ATR
  STOP_LOSS_MAX_PERCENT: 0.8,    // Max 0.8%
  
  // ===== TAKE PROFIT =====
  TAKE_PROFIT_MIN_PERCENT: 2.0,
  TAKE_PROFIT_MAX_PERCENT: 4.0,
  TAKE_PROFIT_ATR_MULTIPLIER: 2.0,
  
  // ===== PARTIAL TP =====
  PARTIAL_TP_ENABLED: true,
  PARTIAL_TP_PERCENT: 1.0,       // First TP at 1.0%
  PARTIAL_TP_SIZE: 0.50,         // Close 50%
  
  // ===== SAFETY LIMITS =====
  MAX_PROBES_PER_SYMBOL_PER_DAY: 1,
  NO_PYRAMIDING: true,
  COOLDOWN_HOURS_AFTER_FAILED: 6,
  
  // ===== HARD INVALIDATION =====
  INVALIDATION_K_THRESHOLD: 5,
  INVALIDATION_REQUIRE_PRICE_MOVE: 0.8,
  
  // ===== REGIME TAGGING =====
  REGIME_TAG: 'FLASH_CRASH_BOUNCE' as const,
  ENTRY_TYPE_TAG: 'FLASH_CRASH_BOUNCE_PROBE' as const,
  
  // ===== LOGGING =====
  LOG_PROBE_DETAILS: true,
  LOG_NEAR_MISS: true,
};
```

### Phase 2: Strategy Analyzer Integration

Insert Flash Crash Bounce check **inside the Early Tier 0 block**, positioned after Capitulation Bounce Probe check:

```typescript
// Inside Early Tier 0 block (around line 2843)
if (earlyDirection === 'short' && earlyStochRsiK4h < DEEP_STOCHRSI_HARD_GATE.DEEP_OVERSOLD_K_THRESHOLD) {
  
  // 1. Check Capitulation Bounce Probe (existing)
  // ...
  
  // 2. Check Flash Crash Bounce Probe (NEW)
  if (!capitulationProbeTriggered && FLASH_CRASH_BOUNCE_PROBE.ENABLED) {
    const priceDropPercent = trendData?.priceDistanceFromSwing?.distanceFromHighPercent ?? 0;
    const stochK4h = earlyStochRsiK4h;
    const stochK1h = extractStochRsiK(trendData, '1h');
    
    // Check if either 4h or 1h K is pinned
    const stochRsiPinned = stochK4h <= FLASH_CRASH_BOUNCE_PROBE.MAX_STOCHRSI_K || 
                           stochK1h <= FLASH_CRASH_BOUNCE_PROBE.MAX_STOCHRSI_K;
    
    // Velocity check: drop rate per hour
    const dropHours = Math.max(1, calculateDropDuration(trendData)); // helper needed
    const dropRatePerHour = priceDropPercent / dropHours;
    const velocityOk = dropRatePerHour >= FLASH_CRASH_BOUNCE_PROBE.MIN_HOURLY_DROP_RATE;
    
    // Momentum check: not extreme opposing
    const momentumOk = earlyMomentumScore >= -FLASH_CRASH_BOUNCE_PROBE.MOMENTUM_MAX_OPPOSING;
    
    // ADX check (ignores slope)
    const adxOk = adx >= FLASH_CRASH_BOUNCE_PROBE.MIN_ADX;
    
    const sufficientDrop = priceDropPercent >= FLASH_CRASH_BOUNCE_PROBE.MIN_DROP_PERCENT;
    
    if (sufficientDrop && stochRsiPinned && adxOk && velocityOk && momentumOk) {
      flashCrashProbeTriggered = true;
      earlyDirection = 'long'; // Flip direction
      
      // Calculate position size
      const volumeRatio = trendData?.volume?.['1h']?.volumeRatio ?? 1.0;
      const hasReversalCandle = detectReversalCandle(trendData); // helper needed
      
      let probeSize = FLASH_CRASH_BOUNCE_PROBE.BASE_POSITION_SIZE;
      if (hasReversalCandle) {
        probeSize = FLASH_CRASH_BOUNCE_PROBE.WITH_REVERSAL_CANDLE;
      } else if (volumeRatio >= 1.5) {
        probeSize = FLASH_CRASH_BOUNCE_PROBE.WITH_VOLUME_SPIKE;
      }
      
      // Store metadata for downstream
      trendData.flashCrashBounceProbe = {
        active: true,
        regime: FLASH_CRASH_BOUNCE_PROBE.REGIME_TAG,
        positionMultiplier: probeSize,
        // ... details
      };
    } else {
      // Log near-miss
    }
  }
}
```

### Phase 3: Gate Type Registration

Add new gate type to the GateType union:

```typescript
type GateType = 
  | ... existing types
  | 'FLASH_CRASH_BOUNCE_PROBE';  // Flash crash V-reversal entry
```

### Phase 4: Execute-Trade Support

Handle the new regime in execute-trade for proper SL/TP application:

```typescript
// In execute-trade/index.ts
const flashCrashProbe = signal.indicators?.flashCrashBounceProbe;
if (flashCrashProbe?.active) {
  // Apply ultra-tight stop
  const flashCrashStop = Math.min(
    atrPercent * FLASH_CRASH_BOUNCE_PROBE.STOP_LOSS_ATR_MULTIPLIER,
    FLASH_CRASH_BOUNCE_PROBE.STOP_LOSS_MAX_PERCENT
  );
  stopLossPercent = flashCrashStop;
  
  // Apply wider TP for bounce capture
  const flashCrashTP = Math.max(
    FLASH_CRASH_BOUNCE_PROBE.TAKE_PROFIT_MIN_PERCENT,
    Math.min(
      atrPercent * FLASH_CRASH_BOUNCE_PROBE.TAKE_PROFIT_ATR_MULTIPLIER,
      FLASH_CRASH_BOUNCE_PROBE.TAKE_PROFIT_MAX_PERCENT
    )
  );
  takeProfitPercent = flashCrashTP;
}
```

### Phase 5: UI Hook Updates

Update `useBlockedSignals.ts` to recognize new gate type and display relevant metadata.

---

## Helper Functions Required

### 1. Drop Duration Calculator

```typescript
function calculateDropDuration(trendData: any): number {
  // Estimate hours from 24h high to current using klines
  const klines1h = trendData?.klines1h ?? [];
  const high24h = trendData?.priceDistanceFromSwing?.high24h ?? 0;
  
  if (!klines1h.length || !high24h) return 24; // Default to full 24h
  
  // Find the candle where price was at 24h high
  for (let i = klines1h.length - 1; i >= 0; i--) {
    if (klines1h[i].high >= high24h * 0.999) {
      return klines1h.length - i;
    }
  }
  return 24;
}
```

### 2. Reversal Candle Detector

```typescript
function detectReversalCandle(trendData: any): boolean {
  // Check for bullish engulfing or hammer on recent candles
  const klines15m = trendData?.klines15m ?? [];
  if (klines15m.length < 2) return false;
  
  const current = klines15m[klines15m.length - 1];
  const prior = klines15m[klines15m.length - 2];
  
  // Bullish engulfing
  const isBullishEngulfing = 
    prior.close < prior.open &&  // Prior bearish
    current.close > current.open && // Current bullish
    current.close > prior.open &&   // Close above prior open
    current.open < prior.close;     // Open below prior close
  
  // Hammer pattern
  const bodySize = Math.abs(current.close - current.open);
  const lowerWick = Math.min(current.open, current.close) - current.low;
  const isHammer = lowerWick >= bodySize * 2;
  
  return isBullishEngulfing || isHammer;
}
```

---

## Files to Modify

| File | Changes |
|:-----|:--------|
| `supabase/functions/_shared/constants.ts` | Add `FLASH_CRASH_BOUNCE_PROBE` config |
| `supabase/functions/strategy-analyzer/index.ts` | Import new config, add detection logic in Tier 0, register gate type |
| `supabase/functions/execute-trade/index.ts` | Handle SL/TP for flash crash probe entries |
| `src/hooks/useBlockedSignals.ts` | Add new gate type for UI display |

---

## Monitoring & Validation

After deployment, monitor logs for:
- `FLASH_CRASH_BOUNCE_PROBE ACTIVATED` - Successful probe triggers
- `FLASH_CRASH_BOUNCE_PROBE NEAR-MISS` - Close but conditions not met
- Compare with historical data to validate detection accuracy

Add dashboard metrics:
- Flash crash detection rate
- Probe success rate (TP hit vs SL hit)
- Average return per probe

---

## Risk Assessment

| Risk | Mitigation |
|:-----|:-----------|
| False positives (entering dead cat bounces) | Ultra-tight stop (0.5 ATR / 0.8%) limits loss |
| Over-trading | Max 1 probe per symbol per day, 6h cooldown |
| Exposure creep | Position size capped at 0.35x |
| Reversal candle false signals | Optional enhancement, not required for entry |

