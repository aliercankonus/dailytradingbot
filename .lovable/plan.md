

## Investigation Summary: Why SHORT Signals Were Blocked During 6-8% Price Drops

### What Happened

I analyzed the last 20 hours of signal rejection logs and found a **critical timing gap** that explains the missed opportunities.

### Timeline Analysis

```text
24h Highs (Reference Points):
  BTC:  $88,500
  BNB:  $906.67
  AVAX: $11.86
  ETH:  ~$2,900

First Rejection Log: 2026-01-30 05:05
  BTC:  $83,000 (-6.2% from high)
  BNB:  $850    (-6.3% from high)  
  AVAX: $10.98  (-7.3% from high)
  ETH:  $2,752  (-5.1% from high)
```

**The 5%+ drop occurred BEFORE the rejection logs started.** When logging began at 05:05, prices had already fallen past the MOVE_EXHAUSTED threshold.

### Gates That Blocked Signals

| Symbol | Gate | Reason | Was It Correct? |
|--------|------|--------|-----------------|
| BTCUSDT | MOVE_EXHAUSTED | 6.2% drop > 5% threshold | Yes - too late |
| BNBUSDT | MOVE_EXHAUSTED | 6.3% drop > 5% threshold | Yes - too late |
| AVAXUSDT | TIER 0 CIRCUIT BREAKER | StochRSI K=2.1-4.8 < 5 | Yes - deeply oversold |
| ETHUSDT | MOMENTUM_DIRECTION | Score 16-25 > 15 (bullish) | **Questionable** |

### Root Cause: 18-Hour Coverage Gap

The last successful trade was ETHUSDT closed at **2026-01-29 11:20**. The first rejection log is at **2026-01-30 05:05**. That's an **18-hour gap** where:
1. No trades were executed
2. No rejection logs were recorded
3. The 5%+ drop occurred

This suggests the strategy-analyzer may not have been running consistently during this period.

### Was ETHUSDT Correctly Blocked?

**No - this is a problem.** ETHUSDT was blocked by `MOMENTUM_DIRECTION_HARD_GATE` with:
- Momentum score: 16-25 (slightly positive)
- ADX: 54.3 (very strong)
- Price: Dropping from $2,900 to $2,700 (-7%)

The gate blocked SHORT because momentum score was "bullish" (+16 to +25), but the exception only allows ADX >= 55. At ADX=54.3, the trade missed the exception by 0.7 points.

**This is the missed opportunity.** The momentum score lagged the actual price action - price was dropping 7% but momentum indicators still showed bullish residue.

### Three Issues to Address

**Issue 1: MOMENTUM_DIRECTION_HARD_GATE Too Strict**
- Current: Block SHORT if momentum > 15, Exception requires ADX >= 55
- Problem: ADX 54 missed exception by 0.7 points during a 7% drop
- Fix: Lower exception threshold to ADX >= 50 OR add price action override

**Issue 2: Momentum Score Lag**
- Momentum score was +16 to +25 while price dropped 7%
- This is indicator lag - price leads, momentum follows
- Fix: Add "strong price move overrides momentum" exception

**Issue 3: Coverage Gap**
- 18-hour period with no logs suggests bot may have paused
- Need to verify auto-trader was running continuously
- Fix: Add bot uptime monitoring/alerting

### Recommended Changes

**Change 1: Relax MOMENTUM_DIRECTION Exception Threshold**
```typescript
// constants.ts - MOMENTUM_DIRECTION_HARD_GATE
EXCEPTION_MIN_ADX: 50,  // Was 55 - captures strong trends earlier
```

**Change 2: Add Price Action Override for MOMENTUM_DIRECTION Gate**
```typescript
// When price dropped 3%+ in direction, override momentum lag
PRICE_ACTION_OVERRIDE: {
  ENABLED: true,
  MIN_PRICE_MOVE_PERCENT: 3.0,  // 3%+ move overrides momentum reading
  LOOKBACK_HOURS: 6,
  OVERRIDE_POSITION_SIZE: 0.50,  // Conservative sizing for override
}
```

**Change 3: Verify Bot Uptime During Gap**
- Check if auto-trader edge function was invoked between Jan 29 11:20 and Jan 30 05:05
- Add monitoring for strategy-analyzer execution gaps > 15 minutes

### Technical Details

**Files to Modify:**
1. `supabase/functions/_shared/constants.ts`
   - Update `MOMENTUM_DIRECTION_HARD_GATE.EXCEPTION_MIN_ADX` from 55 to 50
   - Add `PRICE_ACTION_OVERRIDE` block to `MOMENTUM_DIRECTION_HARD_GATE`

2. `supabase/functions/strategy-analyzer/index.ts`
   - Implement price action override logic in MOMENTUM_DIRECTION gate check
   - Add logging for price action overrides

### Summary

- **BTCUSDT, BNBUSDT, AVAXUSDT**: Correctly blocked - move was already exhausted
- **ETHUSDT**: Incorrectly blocked - momentum score lagged price action, ADX missed threshold by 0.7
- **Root cause**: Bot coverage gap + momentum indicator lag + tight exception threshold
- **Fix**: Relax ADX exception to 50 + add price action override for momentum gate

