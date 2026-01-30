

## ✅ IMPLEMENTED: Momentum Direction Gate Refinements

### Changes Made

**1. Relaxed MOMENTUM_DIRECTION_HARD_GATE Exception Threshold** (`constants.ts`)
- `EXCEPTION_MIN_ADX`: Changed from **55 → 50**
- This captures strong trends earlier (e.g., ADX 54.3 would now pass instead of failing by 0.7 points)

**2. Added PRICE_ACTION_OVERRIDE** (`constants.ts`)
```typescript
PRICE_ACTION_OVERRIDE: {
  ENABLED: true,
  MIN_PRICE_MOVE_PERCENT: 3.0,  // 3%+ move overrides momentum lag
  LOOKBACK_HOURS: 6,
  POSITION_SIZE_MULTIPLIER: 0.50,  // Conservative 50% sizing
  MIN_ADX: 25,  // Still need some trend strength
}
```

**3. Implemented Price Action Override Logic** (`strategy-analyzer/index.ts`)
- When price dropped 3%+ from 24h high → override bullish momentum score for SHORT
- When price rallied 3%+ from 24h low → override bearish momentum score for LONG
- Uses conservative 50% position sizing for override entries

### Summary

| Issue | Fix | Status |
|-------|-----|--------|
| ADX 54.3 missed exception by 0.7 | Lowered threshold to 50 | ✅ Done |
| Momentum score lagged 7% price drop | Added price action override | ✅ Done |
| 18-hour coverage gap | Needs separate investigation | ⏳ Pending |

### What This Fixes

The ETHUSDT scenario where:
- Price dropped 7% ($2,900 → $2,700)
- Momentum score still showed +16 to +25 (bullish lag)
- ADX was 54.3 (just below 55 threshold)

Now:
- ADX 54.3 passes the new 50 threshold, OR
- The 7% drop triggers PRICE_ACTION_OVERRIDE with 50% position sizing
