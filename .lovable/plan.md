

# Plan: Fix Legacy Strategy Naming Mismatch

## Problem Summary

The `DISABLED_LEGACY_STRATEGIES.DISABLED_NAMES` list in `constants.ts` is missing **"MACD Signal Cross"**, which is a separate built-in strategy from "MACD Crossover". This allowed two BTCUSDT trades to enter at StochRSI K=100 because the legacy strategy bypassed the unified pipeline gates.

## Changes Required

### 1. Update `constants.ts` - Add Missing Legacy Strategies

**File:** `supabase/functions/_shared/constants.ts` (lines 3638-3650)

Add the missing legacy strategy names to the `DISABLED_NAMES` array:

```text
DISABLED_NAMES: [
  'MACD Crossover',
  'MACD Signal Cross',     // <-- ADD THIS (was missing)
  'MACD Bearish Cross',
  'EMA Golden Cross',
  'EMA Death Cross',
  'RSI Oversold/Overbought',
  'RSI Overbought Short',
  'Momentum Breakout',
  'Bollinger Band Breakout',
  'Bollinger Band Reversal',
  'Grid Trading',
  'Aggressive Momentum',
  'Conservative Swing',    // <-- ADD THIS (simple RSI strategy)
]
```

### 2. Verify Complete Strategy Coverage

Based on the investigation, here is the complete inventory of built-in strategies and their recommended status:

| Strategy Name | Current Status | Recommended |
|---------------|----------------|-------------|
| MACD Crossover | Disabled | Keep Disabled |
| **MACD Signal Cross** | **ACTIVE (bug)** | **DISABLE** |
| MACD Bearish Cross | Disabled | Keep Disabled |
| EMA Golden Cross | Disabled | Keep Disabled |
| EMA Death Cross | Disabled | Keep Disabled |
| RSI Oversold/Overbought | Disabled | Keep Disabled |
| RSI Overbought Short | Disabled | Keep Disabled |
| Momentum Breakout | Disabled | Keep Disabled |
| Bollinger Band Breakout | Disabled | Keep Disabled |
| Bollinger Band Reversal | Disabled | Keep Disabled |
| Grid Trading | Disabled | Keep Disabled |
| Aggressive Momentum | Disabled | Keep Disabled |
| **Conservative Swing** | **ACTIVE** | **DISABLE** |
| HTF Neutral Breakout | ACTIVE | Keep (has HTF gates) |
| Strong 1h Trend Follower | ACTIVE | Keep (has 1h gates) |
| Ranging Mean Reversion | ACTIVE | Keep (intentional) |
| Adaptive Trend Entry | ACTIVE | Keep (primary) |
| Mean Reversion | ACTIVE | Keep (has protections) |

### 3. Add Comment Documentation

Add a comment block above the disabled list explaining the strategy inventory to prevent future mismatches.

---

## Technical Details

### Why "MACD Signal Cross" Differs from "MACD Crossover"

| Property | MACD Crossover | MACD Signal Cross |
|----------|----------------|-------------------|
| ID | `builtin-macd-crossover` | `builtin-macd-signal-cross` |
| Entry Condition | MACD > 0 | MACD > MACD_Signal |
| Signal Type | Zero-line cross | Signal line cross |

Both are legacy MACD strategies without exhaustion protection - they should both be disabled.

### Why "Conservative Swing" Should Be Disabled

- Uses simple RSI < 35 entry
- No StochRSI extreme protection
- No ADX trend validation
- No HTF alignment check

---

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/_shared/constants.ts` | Add 'MACD Signal Cross' and 'Conservative Swing' to DISABLED_NAMES |

## Expected Outcome

After this change:
- No more legacy MACD strategies can generate signals
- All simple indicator-based strategies are blocked
- Only "Adaptive Trend Entry" and protected strategies remain active
- Future BTCUSDT-style entries at StochRSI extremes will be prevented at the strategy filtering level (in addition to the TIER 0 gate)

