

## Investigation Summary: Late Entry Root Cause Analysis

### The Two Active Positions

| Position | Entry Time | Entry Price | Current Price | Strategy | Confidence | Trend | Move at Entry |
|----------|-----------|-------------|---------------|----------|------------|-------|---------------|
| 1 | 19:13:09 UTC | $2,926.83 | $2,915.00 | MACD Crossover | 56% | neutral | ~4.9% from 24h low |
| 2 | 19:53:33 UTC | $2,925.01 | $2,915.00 | MACD Crossover | 56% | neutral | ~4.9% from 24h low |

### Root Causes Identified

**1. MACD Crossover Strategy Still Executing Despite Being "Disabled"**
- The `DISABLED_LEGACY_STRATEGIES` list includes "MACD Crossover"
- However, logs show "MACD Crossover" is NOT in the active strategy list but positions were opened with it
- This means the positions were created BEFORE the disabling was deployed, or there's a race condition

**2. No Move Exhaustion Gate at Entry Time**
- The `MOVE_EXHAUSTION_FILTER_PARAMS` gate exists in `strategy-analyzer` but these trades entered after a ~4.9% move from the 24h low
- ETH moved from ~$2,787 to ~$2,926 (4.99% move) - this should have been blocked as a "late entry"
- The gate was either not enforced or the threshold was too permissive

**3. Signal Deleted After Execution (Lost Traceability)**
- `execute-trade` deletes signals from `trading_signals` after creating positions (line 1996-2004)
- Result: `signal_id` is stored on position but the signal record is gone
- Cannot retrospectively analyze WHY the entry was allowed

**4. Low Confidence + Neutral Trend Still Allowed**
- Both entries had only 56% confidence with neutral trend
- The `NEUTRAL_LOW_ADX_QUALITY_GATE` should have boosted minimum quality requirement
- Entry was allowed despite weak directional conviction

**5. Entry Quality Logging Not Capturing These Trades**
- Query returned 0 records in `entry_quality_log` for ETHUSDT
- The logging happens at signal generation, but if cleanup runs too aggressively, data is lost

---

## Implementation Plan

### Phase 1: Strict Move Exhaustion Hard Gate

**File: `supabase/functions/_shared/constants.ts`**

Add/update the move exhaustion parameters with stricter thresholds:

```text
MOVE_EXHAUSTION_FILTER_PARAMS = {
  ENABLED: true,
  
  // LONG entries blocked if price already moved this much from 24h low
  LONG_SOFT_THRESHOLD_PERCENT: 3.5,  // Reduce position at 3.5%+ move
  LONG_HARD_THRESHOLD_PERCENT: 5.0,  // Hard block at 5%+ move
  
  // SHORT entries blocked if price already moved this much from 24h high  
  SHORT_SOFT_THRESHOLD_PERCENT: 3.5,
  SHORT_HARD_THRESHOLD_PERCENT: 5.0,
  
  // Exception for strong trends (ADX >= 40 AND rising)
  STRONG_TREND_EXCEPTION_ADX: 40,
  STRONG_TREND_EXCEPTION_POSITION_MULTIPLIER: 0.40,
  
  // Soft zone sizing
  SOFT_ZONE_POSITION_MULTIPLIER: 0.35,
}
```

**File: `supabase/functions/strategy-analyzer/index.ts`**

Enforce the move exhaustion gate earlier in the signal generation pipeline (before quality scoring). The gate should:
1. Fetch 24h high/low from ticker data
2. Calculate price distance from extreme
3. Hard block if beyond threshold
4. Log rejection with `MOVE_EXHAUSTION` gate type

### Phase 2: Entry Snapshot Preservation

**File: `supabase/functions/execute-trade/index.ts`**

Instead of deleting signals after execution, store a snapshot on the position:

```text
// Line ~1907-1945: When creating position, add entry_snapshot column
entry_snapshot: JSON.stringify({
  signal_id: signalId,
  signal_created_at: signal.created_at,
  strategy_name: signal.strategy_name,
  quality_score: signal.indicators?.qualityScore,
  confidence_score: signal.confidence_score,
  adx: trendData?.volatility?.adx,
  adx_slope: trendData?.volatility?.adxSlope,
  stoch_rsi_4h_k: trendData?.stochasticRsi?.['4h']?.k,
  regime: trendData?.marketRegime,
  move_from_24h_low_percent: moveFrom24hLowPercent,
  move_from_24h_high_percent: moveFrom24hHighPercent,
  entry_exception_type: entryExceptionType,
  direction_context: directionContext,
  entry_gates_passed: [...gates that were checked],
})
```

**Database Migration:**

Add `entry_snapshot JSONB` column to `positions` table.

### Phase 3: Keep Executed Signals (Mark as Executed)

**File: `supabase/functions/execute-trade/index.ts`**

Instead of deleting signals (lines 1996-2004), update their status:

```text
// Replace DELETE with UPDATE
await supabase
  .from('trading_signals')
  .update({ 
    status: 'executed',
    executed_at: new Date().toISOString(),
    position_id: position.id
  })
  .eq('id', signalId);
```

**Database Migration:**

Add columns to `trading_signals`:
- `status TEXT DEFAULT 'active'` (active, executed, expired)
- `executed_at TIMESTAMPTZ`
- `position_id UUID`

Update `cleanup-expired-signals` to only delete `status = 'expired'` signals, keeping executed ones for traceability.

### Phase 4: Trade Forensics UI Component

**File: `src/components/TradeForensicsPanel.tsx` (new)**

Create a panel that shows for each active position:

**Simple View (default):**
- Strategy used
- Entry reason (momentum, pullback, mean reversion)
- Key indicator values at entry (ADX, StochRSI K, regime)
- Why it's currently losing (trend changed, momentum reversed, etc.)

**Expandable Technical Details:**
- Full entry snapshot
- All gates that were checked
- Direction context tier and evidence
- Quality score breakdown
- Move exhaustion status at entry

### Phase 5: Enforce Legacy Strategy Disabling

**File: `supabase/functions/strategy-analyzer/index.ts`**

Add an explicit early-exit check for disabled strategies BEFORE any signal generation:

```text
// Near line ~600, before strategy loop
const isDisabledLegacy = DISABLED_LEGACY_STRATEGIES.ENABLED && 
  DISABLED_LEGACY_STRATEGIES.DISABLED_NAMES.some(
    name => strategy.name.toLowerCase() === name.toLowerCase()
  );

if (isDisabledLegacy) {
  logger.info(`⛔ DISABLED_LEGACY: Skipping ${strategy.name}`);
  continue; // Skip to next strategy
}
```

Verify this check exists and is positioned before any signal generation or quality calculation.

---

## Technical Changes Summary

| File | Change Type | Purpose |
|------|-------------|---------|
| `constants.ts` | Update | Stricter move exhaustion thresholds |
| `strategy-analyzer/index.ts` | Update | Enforce move exhaustion gate, verify legacy disable |
| `execute-trade/index.ts` | Update | Store entry snapshot, mark signals as executed |
| `cleanup-expired-signals/index.ts` | Update | Preserve executed signals |
| Database migration | New | Add `entry_snapshot` to positions, `status/executed_at/position_id` to signals |
| `TradeForensicsPanel.tsx` | New | UI for entry diagnostics |
| `ActivePositions.tsx` | Update | Integrate forensics panel |

---

## Expected Outcomes

1. **Late entries prevented**: Trades entering after >5% move from 24h extremes will be hard-blocked
2. **Full traceability**: Every position retains its complete entry context in `entry_snapshot`
3. **Signal history preserved**: Executed signals remain queryable for analysis
4. **UI visibility**: You can see exactly why each trade entered and why it's losing
5. **Legacy strategies truly disabled**: Explicit check prevents any MACD Crossover signals

---

## Risk Mitigation

- The strict 5% move exhaustion threshold may reduce signal volume in strong trends
- Strong trend exception (ADX ≥ 40 + rising) allows continuation entries with reduced size
- Entry snapshot adds ~1KB per position (minimal storage impact)
- Keeping executed signals requires adjusting cleanup to avoid table bloat (retain 30 days)

