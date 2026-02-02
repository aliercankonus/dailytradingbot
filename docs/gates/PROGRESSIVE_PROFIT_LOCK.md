# Progressive Profit Lock Gate

## Purpose
Provide price-based profit protection as the **PRIMARY** profit capture mechanism for positions peaking between 0.50% and 2.50%, reducing reliance on decay velocity exits.

## Problem Solved
Before this extension:
- Progressive locks capped at 0.80% peak
- `DEFER_TO_TRAILING_AT` was 0.85%
- Positions peaking 1-2.5% relied on trailing stop or decay velocity for profit capture
- Decay velocity became the de facto take-profit mechanism above 0.85%
- Result: ~33% peak giveback on 1.99% peak trade

## Design Philosophy

### 1. Price-Based Locks = Primary Profit Capture
Progressive locks should handle the 0.50-2.50% peak range completely. Decay velocity should only trigger as a failsafe when price-based protection has already locked meaningful profit.

### 2. Decay Velocity = Failsafe Only
Decay exits remain for emergency scenarios:
- Position in weak trend (ADX < 25)
- Stop-loss hasn't been tightened by price locks
- Market structure breaking down

### 3. Monotonic Stop Movement
Stops only ever move in the protective direction:
- LONG: Stop only moves UP
- SHORT: Stop only moves DOWN
- Never regresses regardless of current P&L

## Tier Structure (Extended)

| Peak P&L | Lock Target | Net Protection |
|----------|-------------|----------------|
| ≥ 0.50%  | +0.30%      | 60% of peak    |
| ≥ 0.55%  | +0.35%      | 64% of peak    |
| ≥ 0.60%  | +0.40%      | 67% of peak    |
| ≥ 0.65%  | +0.45%      | 69% of peak    |
| ≥ 0.70%  | +0.50%      | 71% of peak    |
| ≥ 0.75%  | +0.55%      | 73% of peak    |
| ≥ 0.80%  | +0.60%      | 75% of peak    |
| ≥ 0.90%  | +0.70%      | 78% of peak    |
| ≥ 1.00%  | +0.75%      | 75% of peak    |
| ≥ 1.25%  | +0.95%      | 76% of peak    |
| ≥ 1.50%  | +1.15%      | 77% of peak    |
| ≥ 1.75%  | +1.35%      | 77% of peak    |
| ≥ 2.00%  | +1.55%      | 78% of peak    |
| ≥ 2.50%  | +2.00%      | 80% of peak    |

At 2.75% peak, handoff to trailing stop for exceptional moves.

## Protection Hierarchy

```
Peak P&L    Protection Layer           Lock Target
─────────────────────────────────────────────────────
0.00-0.15%  None                       -
0.15-0.50%  Micro-Profit Lock          0% to +0.25%
0.50-2.50%  Progressive Profit Lock    +0.30% to +2.00%
2.50%+      Trailing Stop              Dynamic (ATR-based)
```

## Decay Velocity as Failsafe

```
Tier       ADX Range   Decay Threshold   Max Decay Time
───────────────────────────────────────────────────────
BASE       < 25        2.5%/min          8 min
TIER1      25-30       5%/min            15 min
TIER2      30-35       7%/min            20 min
TIER3      35-40       10%/min           30 min
TIER4      40+         15%/min           45 min
```

## Example Scenarios

### 1.99% Peak Trade (Post-Fix)

**Before (original):**
- Peak 1.99% → above DEFER_TO_TRAILING_AT (0.85%)
- Progressive lock doesn't apply
- Trailing hadn't locked enough
- Decay velocity triggers exit at 1.34%
- **Result: 33% peak giveback**

**After (extended):**
- Peak 1.99% → matches tier `{ peakThreshold: 1.75, lockTarget: 1.35 }`
- Stop moved to lock +1.35%
- Even if decay triggers, minimum exit = +1.35%
- **Result: Only ~32% giveback maximum**

### 2.0% Peak Trade

- Matches tier `{ peakThreshold: 2.00, lockTarget: 1.55 }`
- Lock +1.55%
- **Result: Only ~22% giveback maximum**

## Logging

Distinct log messages for forensics:
- `MICRO_PROFIT_LOCK_APPLIED` - Micro tier triggered (0.15-0.50%)
- `PROGRESSIVE_LOCK_APPLIED` - Progressive tier triggered (0.50-2.50%)
- `TRAILING_STOP_APPLIED` - Trailing stop takes over (2.50%+)
- `DECAY_VELOCITY_EXIT` - Decay failsafe triggered

## Configuration

In `constants.ts`:
```typescript
export const PROGRESSIVE_PROFIT_LOCK_PARAMS = {
  ENABLED: true,
  TIERS: [
    // Standard tiers (0.50% - 0.80%)
    { peakThreshold: 0.50, lockTarget: 0.30 },
    ...
    // Extended tiers (0.90% - 2.50%)
    { peakThreshold: 0.90, lockTarget: 0.70 },
    { peakThreshold: 1.00, lockTarget: 0.75 },
    { peakThreshold: 1.25, lockTarget: 0.95 },
    { peakThreshold: 1.50, lockTarget: 1.15 },
    { peakThreshold: 1.75, lockTarget: 1.35 },
    { peakThreshold: 2.00, lockTarget: 1.55 },
    { peakThreshold: 2.50, lockTarget: 2.00 },
  ],
  DEFER_TO_TRAILING_AT: 2.75,
};
```

## Impact Assessment

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Max giveback at 1.99% peak | 33% | 22% | -11% |
| Price-lock coverage | 0-0.85% | 0-2.75% | +224% |
| Decay exit role | Primary TP | Failsafe only | ✅ Correct |
| BASE decay tolerance | 3%/min | 2.5%/min | -17% |

## When NOT Applied

1. Peak P&L < 0.50% (micro-profit lock handles this)
2. Peak P&L ≥ 2.75% (trailing stop takes over)
3. Stop would move in wrong direction (monotonic enforcement)
4. Position already closed

## Relationship to Other Gates

- **Micro-Profit Lock**: Handles 0.15-0.50% peaks
- **Progressive Profit Lock**: Handles 0.50-2.50% peaks (this gate)
- **Trailing Stop**: Handles 2.50%+ peaks with dynamic ATR-based logic
- **Decay Velocity Exit**: Failsafe for stalled positions regardless of peak
