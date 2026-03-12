# STRONG_TREND Directional Alignment Gate

## Purpose
Block counter-trend entries in the STRONG_TREND strategy where trade direction opposes the macro (primaryTrend) direction.

## Problem Solved
90-day backtest revealed a critical directional asymmetry:

| Side | Trades | Win Rate | PnL |
|------|--------|----------|-----|
| LONG (counter-trend) | 22 | 18.2% | -20.72% |
| SHORT (trend-aligned) | 85 | 51.8% | +12.42% |

Counter-trend LONG entries achieved **0 take-profit hits** across 90 days in a bearish-dominant market.

## Implementation

### Gate Logic (gate-pipeline.ts)
```typescript
if (strategyName === 'STRONG_TREND') {
  if (direction === 'LONG' && primaryTrend === 'bearish') {
    return fail('STRONG_TREND_COUNTER_TREND_LONG');
  }
  if (direction === 'SHORT' && primaryTrend === 'bullish') {
    return fail('STRONG_TREND_COUNTER_TREND_SHORT');
  }
}
```

Placed after strategy classification, before squeeze/quality gates.

## Backtest Validation (90-day, 4 symbols)

| Metric | Before | After |
|--------|--------|-------|
| STRONG_TREND PnL | -8.30% | **+10.87%** |
| Win Rate | 44.6% | **46.4%** |
| Profit Factor | 0.81 | **0.93** |
| TREND_EXPANSION regime PnL | -20.56% | **+1.07%** |
| Blocked counter-trend trades | 0 | 32 |

## Design Rationale

### Why hard block instead of size reduction?
Experiment 2 (25% size reduction) showed insufficient improvement (PF 0.85 vs 0.93 for hard block). Counter-trend STRONG_TREND entries have such poor edge (18.2% WR, 0 TP hits) that even reduced sizing is wasteful.

### Why only STRONG_TREND?
- STRONG_TREND requires ADX > VERY_STRONG, meaning strong directional energy
- In this high-ADX environment, counter-trend entries face maximum adverse momentum
- Other strategies (SQUEEZE_BREAKOUT, TREND_CONTINUATION) have different entry dynamics

## Rejection Log Tags
- `STRONG_TREND_COUNTER_TREND_LONG` — bearish macro, LONG blocked
- `STRONG_TREND_COUNTER_TREND_SHORT` — bullish macro, SHORT blocked
