# Strong Trend Tier 0 Override Gate

## Purpose
Allow trend-continuation entries at extreme StochRSI levels (K<5 oversold or K>95 overbought) when ADX confirms a powerful capitulation move, using conservative position sizing.

## Problem Solved
Before this override:
- Tier 0 circuit breaker blocked ALL shorts when K < 5 (80% bounce probability statistically)
- In capitulation events (8%+ moves), StochRSI can remain pegged at extremes for extended periods
- Result: Missed 5-10% continuation moves during panic/capitulation events

Example (BNB 8% drop):
- 4H StochRSI K = 3.0 (deeply oversold)
- ADX = 43.2 (strong trend)
- Momentum = -45 (strongly bearish)
- System blocked 128 SHORT signals while price continued falling

## Design Philosophy

### 1. Statistical Override
The 80% bounce probability at K<5 applies to **normal market conditions**. During capitulation events:
- Price can continue 5-10%+ despite extreme readings
- ADX confirms trend energy is still present
- Momentum confirms directional pressure

### 2. Conservative Entry
When override triggers:
- Position size reduced to 25% (POSITION_SIZE_MULTIPLIER: 0.25)
- This is a late-entry probe, not a full position
- Risk is managed through sizing, not rejection

### 3. Multi-Factor Confirmation
All conditions must be met:
| Condition | Threshold | Rationale |
|-----------|-----------|-----------|
| ADX | >= 40 | Strong trend energy |
| ADX Slope | >= -1.0 | Trend not dying |
| Momentum Score | >= 30 (or <= -30 for short) | Directional confirmation |
| Momentum Direction | Aligned | No opposing momentum |
| 1H Trend | Not opposing | Structure supports direction |

## Implementation

### Configuration (constants.ts)
```typescript
export const STRONG_TREND_TIER0_OVERRIDE = {
  ENABLED: true,
  
  // ADX Requirements
  MIN_ADX: 40,
  MIN_ADX_SLOPE: -1.0,
  
  // Momentum Requirements
  MIN_MOMENTUM_SCORE: 30,
  REQUIRE_MOMENTUM_ALIGNMENT: true,
  
  // Trend Alignment
  REQUIRE_1H_ALIGNMENT: true,
  MIN_1H_CONFIDENCE: 0,
  
  // Position Sizing
  POSITION_SIZE_MULTIPLIER: 0.25,
  
  LOG_OVERRIDE_DETAILS: true,
};
```

## Gate Interaction

### Before (Standard Tier 0)
```
TIER 0 DEEP OVERSOLD: SHORT blocked at K=3.0
→ "Bounce probability ~80%+"
→ No exceptions allowed
```

### After (With Strong Trend Override)
```
TIER 0 DEEP OVERSOLD: K=3.0
→ Check Strong Trend Override conditions
→ ADX=43.2 >= 40 ✅
→ ADX Slope=2.5 >= -1.0 ✅
→ Momentum=-45 <= -30 ✅
→ Momentum Direction=bearish ✅
→ 1H Trend=bearish ✅

STRONG TREND OVERRIDE: SHORT allowed at K=3.0
→ Position size reduced to 25%
```

## Logging

Distinct log messages for forensics:
- `STRONG TREND OVERRIDE: SHORT allowed at K=X.X despite Tier 0 oversold`
- `→ Override conditions met: ADX=X.X, slope=X.XX, momentum=XX bearish`
- `→ Position size reduced to 25%`

Rejection logs include:
- `strongTrendOverrideAttempted: true`
- `strongTrendOverrideReason: "ADX 35.0 < 40"` (specific failure reason)

## When NOT Applied

1. ADX < 40 (insufficient trend energy)
2. ADX slope < -1.0 (trend dying)
3. Momentum score doesn't confirm direction
4. Momentum direction opposing trade
5. 1H trend strongly opposing (confidence >= 60)
6. Override disabled in configuration

## Risk Management

| Factor | Standard Entry | Override Entry |
|--------|---------------|----------------|
| Position Size | 100% | 25% |
| Entry Point | Normal StochRSI | Extreme StochRSI |
| Risk Level | Normal | Higher (late entry) |
| Potential Reward | Normal | Continuation capture |

## Expected Impact

| Metric | Before | After |
|--------|--------|-------|
| Tier 0 block rate at ADX>40 | 100% | ~20% (with sizing) |
| Capitulation capture | 0% | ~60% (with reduced size) |
| Late-entry risk exposure | 0% | 25% position only |

## Relationship to Other Gates

- **Tier 0 Deep StochRSI**: This override provides an escape valve when ADX confirms strong trend
- **Strong ADX Override**: Similar philosophy but for different gate (momentum confirmation)
- **Continuation Mode**: Complementary - both capture strong trend moves at higher ADX
- **Mean Reversion**: Opposite direction - MR enters counter-trend at extremes

## Monitoring

Track these metrics post-implementation:
1. Override trigger rate (should be ~5-10% of Tier 0 blocks)
2. Win rate on override entries (target: >50%)
3. Average P&L on override entries (should be positive given trend confirmation)
4. Peak-to-exit giveback (measure if 25% sizing is appropriate)
