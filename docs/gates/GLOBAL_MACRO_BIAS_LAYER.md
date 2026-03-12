# Global Macro Bias Layer

## Problem
ALL LONG strategies produce negative PnL during bearish macro regimes.
90-day forensic evidence across 4 symbols:

| Side  | PnL     | PF   |
|-------|---------|------|
| LONG  | -49.21% | 0.34 |
| SHORT | +29.90% | 1.42 |

Strategy-level directional filters (STRONG_TREND, SQUEEZE_BREAKOUT, MOMENTUM_ACCELERATION)
are insufficient — even "trend-aligned" LONGs fail in persistent bearish structure.

## Solution
Global directional gate at the top of the pipeline (Gate 4.5, after direction determination):
- Block ALL `LONG` when `primaryTrend === 'bearish'`
- Block ALL `SHORT` when `primaryTrend === 'bullish'`

This supersedes per-strategy directional filters (which remain as defense-in-depth).

## Gate Labels
- `MACRO_BIAS_LONG_BLOCKED`
- `MACRO_BIAS_SHORT_BLOCKED`

## Gate Pipeline Location
After Gate 4 (Direction), before Gate 5 (Counter-Trend).

## Implementation
```typescript
if (direction === 'LONG' && primaryTrend === 'bearish') {
  return fail('MACRO_BIAS_LONG_BLOCKED');
}
if (direction === 'SHORT' && primaryTrend === 'bullish') {
  return fail('MACRO_BIAS_SHORT_BLOCKED');
}
```

## Expected Impact
- Eliminates ~69 losing LONG trades per 90-day bearish period
- Expected PF improvement from 0.43 → ~1.4 (SHORT-only equivalent)
- Trade count reduction: ~140 → ~70 (quality over quantity)

## Date Added
2026-03-12
