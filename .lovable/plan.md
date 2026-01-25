# Exhaustion Reversal Override - IMPLEMENTED

## Summary
Added Priority 0.25 Exhaustion Reversal Override to `deriveTradeDirection()` to detect extreme oversold/overbought conditions and override direction with conservative position sizing.

## Implementation Completed

### Files Modified
1. **`supabase/functions/_shared/constants.ts`**
   - Added `EXHAUSTION_REVERSAL_OVERRIDE_PARAMS` configuration block

2. **`supabase/functions/_shared/scoring.ts`**
   - Updated `DirectionResult` interface with `isExhaustionReversal?: boolean`
   - Added import for `EXHAUSTION_REVERSAL_OVERRIDE_PARAMS`
   - Inserted Priority 0.25 exhaustion reversal logic before Priority 0.5

### Detection Criteria
**LONG Override:**
- StochRSI 4h K ≤ 10 (deep oversold)
- Bollinger %B ≤ 20 (below lower band)
- Momentum positive OR improving
- ADX not accelerating (slope ≤ 0.05)
- NOT in expansion mode

**SHORT Override:**
- StochRSI 4h K ≥ 90 (deep overbought)
- Bollinger %B ≥ 80 (above upper band)
- Momentum negative OR declining
- ADX not accelerating
- 4h trend not strongly bullish (≥70%)

### Position Sizing
- Base: 40% of normal position
- With momentum confirmation: 50%
- With momentum + order flow: 55%

### Confidence
- Base: 55%
- +5% for each: momentum confirms, order flow aligns, MACD improving
- Maximum: 70%
