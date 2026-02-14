

# Compression Micro-Range Module — Production-Grade Implementation

## Overview

Add an independent second trading engine that activates exclusively during `RANGE_COMPRESSION` regime periods. Instead of hard-blocking all entries during low-volatility compression, the system will execute small, controlled mean-reversion scalps with tight risk parameters and strict kill switches.

The existing Trend Expansion engine remains completely untouched.

## Expert Refinements Incorporated

All critical adjustments from the pressure-test review are integrated:

1. **35% position size** (not 50%) — lower R multiple and higher frequency justify smaller initial sizing
2. **Use `dynamicMinATR` threshold** (not fixed 0.9%) — compression activates exactly where trend is blocked
3. **BB width contraction stability rule** — require contracting for 2+ candles, not just low width
4. **Directional momentum check** — `momentumScore > -20` for LONG, `< +20` for SHORT (not absolute value)
5. **Large candle protection** — block if current candle range > 0.9x ATR (regime shift brewing)
6. **Cooldown strengthening** — no re-entry at same band edge without opposite band touch first

## Architecture

```text
               classify4StateRegime()
                      |
        +-------------+-------------+
        |             |             |
  TREND_EXPANSION  BREAKOUT    RANGE_COMPRESSION
  (untouched)      (untouched)      |
                              +-----+-----+
                              |           |
                         No Setup?   Compression
                         (skip)      Engine (NEW)
                                      |
                               Score extremes
                               Enter scalp
                               35% risk budget
                               Kill switch active
```

## Implementation Steps

### Step 1: New File — `supabase/functions/_shared/compression-engine.ts`

Core compression module with three exported functions:

**`checkCompressionKillSwitch()`**
- ADX > 28 = immediate kill
- ADX slope > 0 for 2+ consecutive candles = kill (check via recent regime history)
- ATR percent > dynamicMinATR = kill
- Current candle range > 0.9x ATR = kill (large candle = regime shift brewing)
- Returns: `{ killed: boolean, reason: string }`

**`calculateCompressionScore()`**
- Score range: -40 to +40
- StochRSI extreme (K < 10 or K > 90): +/-15 points
- Bollinger Band touch (%B <= 15 for LONG, >= 85 for SHORT): +/-10 points
- Momentum supportive (LONG: score > -20, SHORT: score < +20): +/-10 points
- ADX < 20: +5 bonus points
- Entry threshold: |score| >= 25
- Returns: `{ score: number, direction: 'long'|'short'|null, breakdown: object }`

**`evaluateCompressionEntry()`**
- Main entry point, calls kill switch first
- Validates structural conditions:
  - ATR percent < dynamicMinATR (use the exact same threshold that blocks trend entries)
  - ADX < 25
  - BB width contracting for >= 2 candles (stability rule)
- Derives direction from StochRSI + BB position (not trend alignment)
- Calls scoring function
- Enforces cooldown: max(30 minutes, 2 candles) AND no re-entry at same band edge without opposite band touch
- Returns: `{ allowed: boolean, direction, score, positionMultiplier: 0.35, tp, sl, reason, diagnostics }`

### Step 2: Constants — `supabase/functions/_shared/constants.ts`

Add `COMPRESSION_MODULE` configuration block:

```
COMPRESSION_MODULE = {
  ENABLED: true,
  
  // Structural conditions (use dynamicMinATR, not fixed)
  MAX_ADX: 25,
  
  // BB width stability: must be contracting for N candles
  BB_WIDTH_CONTRACTING_CANDLES: 2,
  
  // Direction from extremes
  LONG_MAX_STOCHRSI_K: 15,
  SHORT_MIN_STOCHRSI_K: 85,
  LONG_MAX_PERCENT_B: 15,
  SHORT_MIN_PERCENT_B: 85,
  
  // Momentum: directional check (not absolute)
  LONG_MIN_MOMENTUM_SCORE: -20,
  SHORT_MAX_MOMENTUM_SCORE: 20,
  
  // Scoring weights
  SCORE_STOCHRSI_EXTREME: 15,
  SCORE_BB_TOUCH: 10,
  SCORE_MOMENTUM_SUPPORTIVE: 10,
  SCORE_LOW_ADX_BONUS: 5,
  ENTRY_THRESHOLD: 25,
  
  // Risk (35% of trend base, not 50%)
  POSITION_SIZE_MULTIPLIER: 0.35,
  TP_ATR_MULTIPLIER: 0.5,
  SL_ATR_MULTIPLIER: 0.4,
  
  // Time exit
  MAX_HOLD_CANDLES: 8,  // 8 x 15m = 2 hours
  
  // Kill switches
  KILL_ADX_THRESHOLD: 28,
  KILL_CANDLE_RANGE_ATR_RATIO: 0.9,
  
  // Cooldown
  COOLDOWN_MINUTES: 30,
  REQUIRE_OPPOSITE_BAND_TOUCH: true,
  
  // Concurrency
  MAX_CONCURRENT_PER_SYMBOL: 1,
  
  // Logging
  LOG_COMPRESSION_CHECKS: true,
}
```

### Step 3: Strategy Analyzer Integration — `supabase/functions/strategy-analyzer/index.ts`

Modify the RANGE_COMPRESSION hard block (around line 4313-4346):

Currently the block does:
1. Check MR bypass via StochRSI extreme
2. If no bypass, log rejection and `continue`

Change to:
1. Check existing MR bypass (unchanged)
2. If MR bypass not allowed, check `COMPRESSION_MODULE.ENABLED`
3. If enabled, call `evaluateCompressionEntry()` with available indicators (atrPercent, adx, adxSlope, stochK, percentB from 1h BB, momentumScore, dynamicMinATR)
4. If compression entry allowed:
   - Generate signal with `strategy_name: 'Compression Scalp'`
   - Tag with `REGIME_TAG: 'RANGE_COMPRESSION_SCALP'`
   - Include `compressionScore` and `compressionReason` in signal indicators
   - Use compression-specific TP/SL/sizing (0.35x base)
   - Set shorter signal expiry (30 minutes)
   - Skip all trend gates (they do not apply to compression logic)
5. If compression also didn't fire, log rejection as before with added `COMPRESSION_NO_SETUP` diagnostics

Also handle the second RANGE block location (around line 6870-6915) with the same compression check.

### Step 4: Monitor Positions Updates — `supabase/functions/monitor-positions/index.ts`

Add compression-specific exit logic by detecting `strategy_name === 'Compression Scalp'`:

- **Time-based exit**: Close after 8 candles (2 hours) — no trailing stops for range trades
- **Regime shift exit**: If ADX rises above 28 during position lifetime, close immediately
- **ATR expansion exit**: If ATR expands above dynamicMinATR, close immediately
- **No trailing**: Standard fee-aware micro-profit protection still applies, but no progressive trailing
- Standard SL/TP still enforced

### Step 5: Database Migration

Add `compression_module_enabled` boolean to `risk_parameters` table (default: `true`).

No new tables needed — signals and positions use existing tables with strategy type differentiation via `strategy_name` and `indicators` JSON fields.

### Step 6: UI Updates

**SignalRejectionReasons.tsx**: When compression module evaluates but doesn't fire, display `COMPRESSION_NO_SETUP` with score and conditions checked.

**ActivePositions.tsx**: Show "Compression" badge for positions with `strategy_name === 'Compression Scalp'`.

**Settings page**: Add toggle for compression module enable/disable linked to `compression_module_enabled` in risk parameters.

**useRiskParameters.ts**: Add `compression_module_enabled` field to the interface.

## What Stays Untouched

- All existing trend gates (momentum slope, ADX slope graduated, LTF confirmation, etc.)
- Direction derivation engine
- Trend position sizing and exit logic
- Mean reversion admission layer
- Strong Trend Tier 0 Override
- All existing constants and thresholds
- The `classify4StateRegime()` function itself

## Expected Behavior After Implementation

| Market Condition | Current | After |
|---|---|---|
| ATR 0.5%, ADX 20, neutral trend, StochRSI K=8 | HARD BLOCK | Compression LONG scalp at 35% size |
| ATR 0.5%, ADX 20, neutral trend, StochRSI K=50 | HARD BLOCK | Still blocked (no compression setup) |
| ATR 0.5%, ADX 20, StochRSI K=8, large candle | HARD BLOCK | Still blocked (kill switch: regime shift brewing) |
| ATR 1.5%, ADX 32, strong trend | Full trend trades | Unchanged |
| ADX rising from 22 to 30 | Breakout setup | Compression auto-kills, trend takes over |

## Risk Controls Summary

- Position size: 35% of trend base (raisable to 50% after 200+ trades if expectancy holds)
- Maximum 1 compression trade per symbol
- 30-minute cooldown with opposite-band-touch requirement
- Instant kill switch on ADX > 28, ATR expansion, or large candle
- Time-based forced exit at 2 hours (no open-ended compression positions)
- Separate `strategy_name` tagging for isolated performance tracking

