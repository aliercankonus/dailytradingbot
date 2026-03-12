# MOMENTUM_ACCELERATION Directional Alignment Gate

## Problem
MOMENTUM_ACCELERATION counter-trend entries are breakout chase patterns with no edge.  
Forensic evidence: 18 trades across 90 days, net negative PnL consistently.

## Solution
Symmetric directional alignment filter:
- Block LONG when `primaryTrend === 'bearish'`
- Block SHORT when `primaryTrend === 'bullish'`

## Gate Labels
- `MOMENTUM_ACCEL_COUNTER_TREND_LONG`
- `MOMENTUM_ACCEL_COUNTER_TREND_SHORT`

## Gate Pipeline Location
After strategy classification, alongside STRONG_TREND and SQUEEZE_BREAKOUT directional gates.

## Backtest Validation
90-day, 4-symbol backtest gate activations:
- MOMENTUM_ACCEL_COUNTER_TREND_LONG: 5 blocked
- MOMENTUM_ACCEL_COUNTER_TREND_SHORT: 0 blocked

## Implementation
```typescript
if (strategyName === 'MOMENTUM_ACCELERATION') {
  if (direction === 'LONG' && primaryTrend === 'bearish') {
    return fail('MOMENTUM_ACCEL_COUNTER_TREND_LONG');
  }
  if (direction === 'SHORT' && primaryTrend === 'bullish') {
    return fail('MOMENTUM_ACCEL_COUNTER_TREND_SHORT');
  }
}
```

## Date Added
2026-03-12
