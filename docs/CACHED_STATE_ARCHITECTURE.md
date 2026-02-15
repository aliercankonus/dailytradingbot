# Cached-State Architecture

## Overview

The system uses a **write-once, read-many** cached-state model centered on the `trend_snapshots` table. A single authority (`strategy-analyzer`) computes all market state and persists it atomically; all downstream consumers read from this cache instead of calling Binance directly.

```
┌─────────────┐    invokes     ┌────────────────────┐
│ auto-trader  │──────────────▶│ strategy-analyzer   │
│ (cron 5min)  │               │ (signal pipeline)   │
└─────────────┘               └────────┬───────────┘
                                       │
                              WRITES (atomic upsert)
                                       │
                                       ▼
                              ┌─────────────────┐
                              │ trend_snapshots  │
                              │ (per user×symbol)│
                              └───┬─────────┬───┘
                                  │         │
                          READS   │         │  READS
                                  ▼         ▼
                          ┌──────────┐ ┌──────────────┐
                          │ monitor- │ │  Frontend     │
                          │positions │ │  (React hooks)│
                          │(cron 1m) │ └──────────────┘
                          └──────────┘
```

## Orchestration Cadence

| Function                    | Schedule    | Role                                      |
|-----------------------------|-------------|--------------------------------------------|
| `auto-trader`               | `*/5 * * *` | Orchestrator — invokes `strategy-analyzer` per user |
| `strategy-analyzer`         | on-demand   | Sole authority for kline fetch, indicator compute, signal generation |
| `monitor-positions`         | `*/1 * * *` | Exit management — reads cached state, never fetches klines |
| `cleanup-expired-signals`   | `0 * * * *` | Housekeeping — purges expired signals hourly |
| `bot-health-monitor`        | `*/5 * * *` | Heartbeat + alert system                   |

## `trend_snapshots` Data Contract

### Write Path (strategy-analyzer → DB)

Upsert key: `(user_id, symbol)` — one row per user per symbol, overwritten each cycle.

| Column           | Type      | Source                                      |
|------------------|-----------|---------------------------------------------|
| `user_id`        | UUID      | From `auto-trader` invocation context        |
| `symbol`         | TEXT      | Active trading symbol (e.g., `BTCUSDT`)      |
| `snapshot_data`  | JSONB     | Full `calculate-trend` response (see below)  |
| `recorded_at`    | TIMESTAMPTZ | `new Date().toISOString()` at write time   |
| `primary_trend`  | TEXT      | Extracted: `td.primaryTrend`                 |
| `is_aligned`     | BOOLEAN   | Extracted: `td.isAligned`                    |
| `momentum_state` | TEXT      | Extracted: `td.momentum.state`               |
| `regime`         | TEXT      | Initially from indicators; updated to effective regime after 4-state classifier |
| `adx`            | NUMERIC   | Extracted: `td.volatility.adx`               |
| `macd_histogram` | NUMERIC   | Extracted: `td.momentum.macdHistogram`        |
| `block_reason`   | TEXT      | Set for symbols rejected before classification (e.g., `EARLY_BLOCK`) |

### `snapshot_data` JSONB Structure (Key Fields)

```jsonc
{
  "primaryTrend": "bullish" | "bearish" | "ranging",
  "isAligned": true,
  "confidence": 72,
  "regime": "TRENDING",
  "volatility": { "adx": 28.5, "atr": 450.2, "atrPercent": 1.8 },
  "momentum": {
    "state": "accelerating" | "decelerating" | "exhausted",
    "macdHistogram": 12.5,
    "rsiMomentum": 58
  },
  "timeframes": {
    "4h": { "trend": "bullish", "confidence": 75, "indicators": { ... } },
    "1h": { "trend": "bullish", "confidence": 68, "indicators": { ... } },
    "30m": { ... },
    "15m": { ... }
  },
  "stochRsiHistory": {
    "1h": [/* last 12 values */],
    "4h": [/* last 6 values */]
  },
  "trueAlignment": {
    "score": 0.82,
    "tf4hConfidence": 75,
    "tf1hConfidence": 68,
    "weightedComponents": { "tf4hWeighted": 0.3, "tf1hWeighted": 0.25, ... }
  }
}
```

## Staleness Thresholds

| Consumer              | Threshold | Rationale                                          |
|-----------------------|-----------|----------------------------------------------------|
| `monitor-positions`   | **7 min** | Strategy-analyzer writes every 5 min; 7 min allows one missed cycle before rejecting |
| Frontend hooks        | **7 min** | `useMomentumStatus` uses `SNAPSHOT_STALE_MINUTES = 7` — same contract |
| Signals query         | **30 min** | `useSignals` fetches signals created within 30 min window (signal decay, not snapshot staleness) |

### Staleness Behavior

- **`monitor-positions`**: Skips the symbol entirely if snapshot is stale. Logs `⚠️ Trend snapshot stale (Xs old)`. If majority are stale, emits aggregate warning suggesting `strategy-analyzer` may not be running.
- **Frontend**: `useMomentumStatus` marks data as `stale: true` in the returned object, allowing UI to show degraded state indicators.

## Read Path Details

### monitor-positions (Every 1 Minute)

1. Fetches all active positions + current Binance prices (live via REST)
2. Single batch `SELECT` from `trend_snapshots` for all active symbols
3. Applies 7-minute staleness guard per snapshot
4. Uses `snapshot_data` for exit decisions: trailing stops, reversal scoring, regime-aware exits
5. **Never** invokes `calculate-trend` or fetches klines

### Frontend Hooks

| Hook                      | Table              | Query Pattern                    |
|---------------------------|--------------------|----------------------------------|
| `useMomentumStatus`       | `trend_snapshots`  | Single symbol, checks `recorded_at` staleness |
| `useLiveTrend`            | `trend_snapshots`  | Per-symbol, extracts `snapshot_data` |
| `useMarketConditions`     | `trend_snapshots`  | All user symbols, summary columns |
| `useRegimeTransitions`    | `market_regime_history` | Historical regime changes     |

## Regime Update Flow

The `regime` column in `trend_snapshots` undergoes a two-phase update:

1. **Phase 1 (atomic upsert)**: Raw regime from indicators written with snapshot
2. **Phase 2 (batch update)**: After the 4-state classifier runs, `effective_regime` overwrites the `regime` column. Symbols that exit before classification retain `EARLY_BLOCK`.

This dual-write ensures `monitor-positions` always sees the finalized regime state.

## Failure Modes

| Failure                        | Impact                                        | Mitigation                          |
|--------------------------------|-----------------------------------------------|-------------------------------------|
| `strategy-analyzer` timeout    | Snapshots go stale after 7 min                | `monitor-positions` skips stale symbols; frontend shows stale indicator |
| `auto-trader` cron missed      | No new signals; snapshots age                 | `bot-health-monitor` detects missing heartbeat, sends alert |
| DB upsert failure              | Old snapshots persist                         | Logged as warning; next cycle overwrites |
| Binance 451 (geo-block)        | `strategy-analyzer` can't fetch klines        | Only affects backend (server-side); frontend reads cached state unaffected |
