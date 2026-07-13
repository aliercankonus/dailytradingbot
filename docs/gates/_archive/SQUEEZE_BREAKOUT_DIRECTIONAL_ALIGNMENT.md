# SQUEEZE_BREAKOUT Directional Alignment Gate

## Problem
SQUEEZE_BREAKOUT LONG trades in bearish macro regimes produce fake breakout entries.  
Forensic evidence from 90-day backtest:
- SQUEEZE_BREAKOUT LONG: **-23.36% PnL** (52 trades)
- SQUEEZE_BREAKOUT SHORT: **+13.55% PnL**

Pattern: `downtrend → volatility compression → fake breakout up → dump`

## Solution
Symmetric directional alignment filter:
- Block LONG when `primaryTrend === 'bearish'`
- Block SHORT when `primaryTrend === 'bullish'`

## Gate Labels
- `SQUEEZE_BREAKOUT_COUNTER_TREND_LONG`
- `SQUEEZE_BREAKOUT_COUNTER_TREND_SHORT`

## Gate Pipeline Location
After squeeze quality gates (depth, volume, candle body), before regime multipliers.

## Backtest Validation
90-day, 4-symbol backtest gate activations:
- SQUEEZE_BREAKOUT_COUNTER_TREND_LONG: 21 blocked
- SQUEEZE_BREAKOUT_COUNTER_TREND_SHORT: 4 blocked

## Implementation
```typescript
if (strategyName === 'SQUEEZE_BREAKOUT') {
  if (direction === 'LONG' && primaryTrend === 'bearish') {
    return fail('SQUEEZE_BREAKOUT_COUNTER_TREND_LONG');
  }
  if (direction === 'SHORT' && primaryTrend === 'bullish') {
    return fail('SQUEEZE_BREAKOUT_COUNTER_TREND_SHORT');
  }
}
```

## Date Added
2026-03-12
