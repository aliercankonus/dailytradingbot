# Micro-Profit Lock Gate

## Purpose
Fill the protection gap between 0% and 0.50% peak P&L that previously allowed profitable excursions to fully retrace.

## Problem Solved
Before this gate:
- Positions could peak at 0.21% profit
- No protection triggered (break-even at 0.30%, progressive at 0.50%)
- Price would retrace to entry
- Result: Signal confirmation value wasted

## Design Principles

### 1. Confirmation Monetization
Any favorable movement is signal confirmation worth protecting. A 0.15% move in your direction proves:
- Entry timing was good
- Direction analysis was correct
- Market structure supports the trade

### 2. Monotonic Stop Movement
Stops only ever move in one direction:
- LONG: Stop only moves UP
- SHORT: Stop only moves DOWN
- Never regresses regardless of current P&L

### 3. Fixed Locks (Not Trailing)
Below 0.50% peak, use fixed lock targets instead of trailing:
- Prevents stop "ping-pong" around entry
- More stable in choppy markets
- Clear, predictable behavior

## Tier Structure

| Peak P&L | Lock Target | Net Protection |
|----------|-------------|----------------|
| ≥ 0.15%  | 0.00%       | Break-even     |
| ≥ 0.20%  | +0.03%      | Small profit   |
| ≥ 0.25%  | +0.07%      | Small profit   |
| ≥ 0.30%  | +0.10%      | Small profit   |
| ≥ 0.35%  | +0.15%      | Small profit   |
| ≥ 0.40%  | +0.20%      | Small profit   |
| ≥ 0.45%  | +0.25%      | Small profit   |

At 0.50% peak, handoff to Progressive Profit Lock.

## Protection Order

```
original_stop
  ↓
micro_profit_lock (0.15%-0.50%)
  ↓
progressive_lock (0.50%-0.85%)
  ↓
break_even (fallback only)
  ↓
trailing_stop (0.85%+)
```

## Logging

Distinct log messages for forensics:
- `MICRO_PROFIT_LOCK_APPLIED` - New micro tier triggered
- `PROGRESSIVE_LOCK_APPLIED` - Progressive tier triggered
- `BREAK_EVEN_APPLIED` - Fallback break-even (rare)

## Example Scenario

### Before (Gap Problem)
```
Entry: $744.65 SHORT
Peak: $743.09 (0.21% profit = ~$0.48)
Protection: None (0.21% < 0.30% break-even)
Outcome: Price returns to entry, $0 profit
```

### After (With Micro-Lock)
```
Entry: $744.65 SHORT
Peak: $743.09 (0.21% profit = ~$0.48)
Protection: 0.20% tier → lock +0.03%
Stop moved: $744.65 → $744.43
Outcome: Exit at worst +0.03% = ~$0.07 profit
```

## Configuration

In `constants.ts`:
```typescript
export const MICRO_PROFIT_LOCK_PARAMS = {
  ENABLED: true,
  TIERS: [...],
  HANDOFF_THRESHOLD: 0.50,
  SLIPPAGE_BUFFER_PERCENT: 0.02,
};
```

## When NOT Applied

1. Peak P&L < 0.15% (too small to protect)
2. Peak P&L ≥ 0.50% (progressive lock takes over)
3. Stop would move in wrong direction (monotonic enforcement)
4. Position already closed
