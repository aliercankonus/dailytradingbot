

# Tier 2 State-Based Zone Reset Cooldown

## Problem
The graduated Tier 2 StochRSI gate (K 10-20 / 80-90) can allow serial re-entries during persistent band-ride scenarios. While `max_trades_per_symbol = 1` prevents simultaneous stacking, a quick TP/SL close followed by immediate re-entry into the same exhaustion cluster creates "death by repeated small entries."

## Solution: Oscillator-Native Zone Reset Gating
Replace time-based cooldown with state-based logic: allow a new Tier 2 entry only after K has **exited** the Tier 2 zone and **re-entered** it, proving a genuine oscillator reset occurred.

## How It Works

```text
Entry #1 at K=16 (Tier 2 MODERATE) --> trade opens
  |
  v
Trade closes (TP/SL/timeout)
  |
  v
Next cycle: K=14 --> STILL in Tier 2 zone --> BLOCK (no reset)
  ...
K rises to 28 --> EXIT detected, zone reset flag cleared
  ...
K drops back to 18 --> Fresh Tier 2 entry allowed
```

## Implementation Details

### 1. Constants (`_shared/constants.ts`)
Add a new `TIER_2_ZONE_RESET` configuration block inside `HTF_EXTREME_HARD_GATES`:

- `ENABLED: true` -- feature toggle
- `OVERSOLD_EXIT_THRESHOLD: 25` -- K must rise above 25 to "exit" oversold Tier 2
- `OVERBOUGHT_EXIT_THRESHOLD: 75` -- K must drop below 75 to "exit" overbought Tier 2
- `LOG_BLOCKS: true` -- forensic logging

### 2. Per-Symbol State Tracking (`strategy-analyzer/index.ts`)
Add an in-memory map at the top of the scanning loop (outside the per-symbol iteration):

```text
Map<symbol, {
  wasInTier2Zone: boolean,
  lastTier2Direction: 'long' | 'short',
  hasExitedZone: boolean
}>
```

Populated from a lightweight database query: check if the last closed trade for a symbol used a `TIER_2_GRADUATED` tag and whether StochRSI K has since exited the zone.

### 3. Zone Reset Logic (inside Tier 2 graduated blocks)
Before applying the graduated multiplier, check:

1. Query the most recent closed position for this symbol
2. If it had a `TIER_2_GRADUATED` entry tag:
   - Check current K against the exit threshold (K > 25 for oversold, K < 75 for overbought)
   - If K has NOT exited the zone since that trade closed, **block** the entry with gate `TIER2_ZONE_RESET_PENDING`
   - If K HAS exited (or no recent Tier 2 trade exists), allow the graduated entry
3. Tag all Tier 2 entries with `entry_context: 'TIER_2_GRADUATED'` so the reset logic can identify them

### 4. Data Flow
- **Entry tagging**: When a Tier 2 graduated entry fires, store the zone tag in the signal/position metadata (existing `strategy_type` or `entry_context` field)
- **Reset detection**: On each cycle, compare current K to exit thresholds. No persistent state table needed -- the query checks the last closed trade timestamp and the current K value. If K is above the exit threshold at any point between the last close and now, the zone is considered reset.

### 5. Files Modified
- `supabase/functions/_shared/constants.ts` -- Add `TIER_2_ZONE_RESET` parameters
- `supabase/functions/strategy-analyzer/index.ts` -- Add zone-reset check before both SHORT/LONG Tier 2 graduated blocks, add entry tagging to signal metadata

### 6. Edge Cases Handled
- **No previous Tier 2 trade**: Zone reset not applicable, entry allowed
- **Previous trade was a bypass (not graduated)**: Zone reset not applicable, only targets graduated entries
- **K briefly touches exit threshold then re-enters**: This IS a valid reset -- the oscillator cycled
- **Multiple symbols**: Per-symbol tracking, no cross-contamination

### 7. Risk Assessment
- **No new time-based suppression** -- entries are gated by oscillator behavior, not arbitrary timers
- **No false suppression of valid continuations** -- a genuine trend pullback will push K above 25 before resuming
- **Minimal DB overhead** -- one query per symbol per cycle to check last closed trade metadata

