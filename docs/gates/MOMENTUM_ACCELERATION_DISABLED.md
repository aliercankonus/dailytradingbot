# MOMENTUM_ACCELERATION Strategy — Disabled

## Problem
MOMENTUM_ACCELERATION strategy consistently produces negative PnL across all regimes.
Forensic evidence from multiple 90-day backtests:
- 14 trades, **-5.52% PnL** (with Global Macro Bias Layer active)
- 18 trades, net negative PnL (pre-bias layer)
- Pattern: breakout chase — bot enters after momentum peak, gets reversed

## Solution
Strategy fully disabled by commenting out the classification line.
Signals that would have been classified as MOMENTUM_ACCELERATION now fall through
to their base strategy (STRONG_TREND if ADX > VERY_STRONG, otherwise TREND_CONTINUATION).

## Implementation
```typescript
// MOMENTUM_ACCELERATION disabled: breakout chase pattern with no edge.
// if (momentumResult.isAccelerating) strategyName = 'MOMENTUM_ACCELERATION';
```

## Expected Impact
- Removes ~14 losing trades per 90-day period
- Signals reclassified into base strategies that have proven edge
- Expected PF improvement: 0.94 → 1.0+

## Date Added
2026-03-12
