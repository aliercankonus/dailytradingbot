

# Backtest Engine — Production Code Replay

## Problem
The bot has no way to validate its signal generation, gate logic, and exit management against historical data. Currently, the only way to assess performance is live trading or shadow mode, which requires waiting days/weeks.

## Architecture

The backtest engine will **replay historical klines through the exact same production functions** — no duplicate logic. The key insight: `strategy-analyzer` already reads klines via `getKlines()` and `calculate-trend` does the same. By injecting historical klines into the `kline_cache` table for a specific time window and invoking the same edge functions, we get a true production replay.

```text
┌────────────────────┐
│  backtest-runner    │  (new edge function)
│  (orchestrator)     │
└────────┬───────────┘
         │
         │ For each bar in [startTime..endTime]:
         │
         │ 1. Fetch historical klines from Binance
         │    (endTime = current bar timestamp)
         │
         │ 2. Write to kline_cache with source='backtest'
         │
         │ 3. Invoke strategy-analyzer (same production code)
         │    → generates signals (written to backtest_signals table)
         │
         │ 4. Simulate position management using exit-strategies logic
         │    → tracks entries, exits, P&L
         │
         │ 5. Advance to next bar
         │
         └─→ Return full trade log + metrics
```

## Implementation Plan

### 1. Database: `backtest_results` table
Stores backtest run metadata and results.

```sql
CREATE TABLE public.backtest_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'running',  -- running, completed, failed
  config JSONB NOT NULL,          -- {symbols, startDate, endDate, barInterval}
  summary JSONB,                  -- {totalTrades, winRate, profitFactor, ...}
  trades JSONB DEFAULT '[]',      -- [{symbol, side, entry, exit, pnl, ...}]
  signals_log JSONB DEFAULT '[]', -- all generated+rejected signals per bar
  duration_ms INTEGER,
  error_message TEXT
);

ALTER TABLE public.backtest_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own backtests"
  ON public.backtest_results FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### 2. Edge Function: `backtest-runner`

Core orchestrator that:

- Accepts `{symbols, startDate, endDate, barInterval}` from user
- Fetches full historical klines from Binance for the period (all required timeframes: 1m, 5m, 15m, 30m, 1h, 4h)
- Iterates bar-by-bar through time:
  - **Slices klines** up to the current bar (simulating "what was available at that moment")
  - **Injects into `kline_cache`** with `source='backtest'` so `getKlines()` in `strategy-analyzer` reads them
  - **Invokes `strategy-analyzer`** with the user's real `risk_parameters` — same gates, same quality scoring, same MFS
  - Captures generated signals
  - **Simulates position tracking**: opens positions on signals, applies the same trailing stop / exit logic from `exit-strategies.ts` and `monitor-positions` constants
  - Tracks P&L per trade

Key design decisions:
- Uses a **dedicated `kline_cache` key prefix** (e.g., `BACKTEST_{runId}_`) or a separate `backtest_kline_cache` table to avoid polluting live cache
- Runs with `verify_jwt = true` — user must be authenticated
- Rate-limited: max 1 concurrent backtest per user
- Bar step size configurable (default: 1h bars, iterating 4h for faster runs)

### 3. Kline Data Strategy

Instead of injecting into live `kline_cache` (which would disrupt production), the backtest will:

1. Pre-fetch ALL historical klines for the period from Binance (bulk fetch using `startTime`/`endTime` params)
2. Hold them in-memory within the edge function
3. For each simulated bar, **call the same indicator functions** directly (`buildMarketFeatureSnapshot`, `calculateMomentumScore`, `detectPullback`, etc.) with sliced kline arrays
4. Feed the resulting MFS into the same gate/scoring pipeline that `strategy-analyzer` uses

This avoids DB writes per bar and keeps the backtest self-contained while using identical production logic.

### 4. Position Simulation Engine

Re-uses the same constants and exit logic:
- `PEAK_ADAPTIVE_TRAILING` tiers
- `VOLATILITY_ADAPTIVE_TRAILING` (the new system)
- `evaluateDecayVelocity`, `evaluateProgressiveProfitLock`, `evaluateMicroProfitLock`
- Partial TP ladder from `PARTIAL_TP_LADDER`
- Time stops from `TIME_STOP_MULT`

Each bar checks:
- Current price vs stop loss / take profit
- Trailing stop activation and distance
- All exit conditions from `exit-strategies.ts`

### 5. Frontend: Backtest Dashboard Page

New page at `/backtest` with:
- **Config form**: Symbol selection, date range picker, bar interval
- **Run button**: Invokes `backtest-runner`
- **Results table**: Shows all simulated trades with entry/exit/P&L
- **Summary metrics**: Win rate, profit factor, max drawdown, Sharpe ratio, avg trade duration
- **Equity curve chart**: Using recharts (already installed)
- **Gate rejection breakdown**: Which gates blocked the most signals during the period

### 6. What Stays Identical to Production

| Component | Source | Backtest Usage |
|-----------|--------|---------------|
| Gate logic | `strategy-analyzer` constants | Same constants imported |
| Quality scoring | `calculateQualityScore` | Same function |
| MFS construction | `buildMarketFeatureSnapshot` | Same function with historical klines |
| Momentum analysis | `smart-momentum.ts` | Same functions |
| Exit strategies | `exit-strategies.ts` | Same functions |
| Trailing stops | `PEAK_ADAPTIVE_TRAILING` + `VOLATILITY_ADAPTIVE_TRAILING` | Same constants |
| Risk parameters | `risk_parameters` table | User's actual settings |

### 7. Implementation Order

1. Create `backtest_results` DB table with RLS
2. Build `backtest-runner` edge function (orchestrator + position simulator)
3. Build frontend Backtest page (config form + results display + equity curve)
4. Add navigation link to backtest page
5. Deploy and test

### 8. Constraints & Limits

- Maximum backtest period: 30 days (to avoid Binance rate limits and edge function timeouts)
- Bar resolution: minimum 1h (15m would be too many iterations)
- Edge function timeout: 60s — for longer periods, the function processes in chunks and updates `backtest_results.status` progressively
- Binance historical klines: max 1000 per request, need pagination for longer periods

