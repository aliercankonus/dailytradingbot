# Bot Module Inventory

## Overview

The trading bot operates through a modular architecture with strict regime-level mutual exclusivity. Each module has a defined purpose, activation conditions, and risk parameters.

---

## Trading Engines

### 1. Trend Expansion Engine (Primary)
- **Regime**: `TREND_EXPANSION`, `BREAKOUT_SETUP`
- **Purpose**: Capture directional moves in confirmed trends
- **Activation**: ADX ≥ 30, slope ≥ 0, LTF aligned
- **Sizing**: 1.0x base (gate-adjusted)
- **Target**: 1.5–3.0+ ATR
- **Config**: `FOUR_STATE_REGIME.TREND_EXPANSION`

### 2. Compression Micro-Range Engine (Secondary)
- **Regime**: `RANGE_COMPRESSION` only
- **Purpose**: Mean-reversion scalps during low-volatility compression
- **Activation**: ATR < dynamicMinATR, ADX < 25, BB width contracting
- **Sizing**: 0.35x base
- **Target**: 0.5 ATR TP / 0.4 ATR SL
- **Kill Switches**: ADX > 28, early expansion (ADX ≥ 23 + rising), ATR expansion, large candles
- **Config**: `COMPRESSION_MODULE` in `constants.ts`
- **Toggle**: `risk_parameters.compression_module_enabled`

---

## Sub-Strategies (within Trend Engine)

### 3. Mean Reversion Probes
- **Regime**: `TREND_EXHAUSTION` (also allowed in compression via Counter-Trend Admission)
- **Purpose**: Counter-trend entries at validated exhaustion points
- **Activation**: ADX < 45, slope ≤ 0 for ≥ 2 candles, BB width declining, StochRSI de-pegging
- **Sizing**: 0.25x (up to 0.30x for confirmed exhaustion)
- **Config**: `COUNTER_TREND_ADMISSION` in `constants.ts`

### 4. Strong Trend Tier 0 Override
- **Regime**: `TREND_EXPANSION` with extreme StochRSI
- **Purpose**: Entries into K < 5 or K > 95 during powerful trends
- **Activation**: ADX ≥ 40, slope ≥ -1.0, Smart Momentum ≥ 30, 1H aligned
- **Sizing**: 0.25x mandatory
- **Cooldown**: Max 1 override per 4 hours per symbol
- **Config**: `STRONG_TREND_TIER0_OVERRIDE` in `constants.ts`

### 5. Trend Continuation Pullback
- **Regime**: `TREND_EXPANSION`
- **Purpose**: Re-entry after structural pullback to EMA20/50
- **Activation**: ADX ≥ 30, slope ≥ 0.05, StochRSI K cooled < 80
- **Sizing**: 0.50x
- **Cooldown**: 4-hour minimum, 1 entry per trend leg
- **Config**: `TREND_CONTINUATION_PULLBACK_REGIME` in `constants.ts`

---

## Regime Classifier

### 4-State Regime Classifier
- **States**: `TREND_EXPANSION`, `TREND_EXHAUSTION`, `BREAKOUT_SETUP`, `RANGE_COMPRESSION`
- **Confidence**: 0–100 continuous score
- **Persistence**: Asymmetric (0 candles for compression→expansion, 1 for expansion→exhaustion, 2 for standard)
- **Age Decay**: Linear 1.0→0.60 over 20–60 candles
- **Config**: `FOUR_STATE_REGIME` in `constants.ts`

---

## Safety Gates (Priority Order)

| Priority | Gate | Type | Purpose |
|---|---|---|---|
| 1 | MOMENTUM_SLOPE_GATE | Hard | Block when opposing momentum accelerating |
| 2 | LTF_SPIKE_PROTECTION | Hard | Block at 15m climax candles |
| 3 | LTF_CONFIRMATION | Contextual | Lower timeframe alignment check |
| 4 | MOMENTUM_DIRECTION_ALIGNMENT | Soft | ADX overrides neutral only, never opposing |
| 5 | ADX Strength | Context | Energy amplifier |
| 6 | HTF Bias | Soft | Higher timeframe direction |
| 7 | Quality & Sizing | Graduated | Score-based position adjustment |

---

## Risk Management Modules

| Module | Purpose | Toggle |
|---|---|---|
| Trailing Stop | Dynamic profit protection | `trailing_stop_enabled` |
| Break-Even Lock | Move SL to entry after activation % | `break_even_enabled` |
| Progressive Profit Lock | Multi-tier profit locking | `progressive_lock_enabled` |
| Drawdown Circuit Breaker | Emergency halt on portfolio drawdown | `drawdown_circuit_breaker_enabled` |
| Dynamic Stop Tightening | Time-based stop tightening | `dynamic_stop_tightening_enabled` |
| Partial Loss Taking | Close portion at loss threshold | `partial_loss_taking_enabled` |
| Early Profit Lock | Lock profit at early threshold | `early_profit_lock_enabled` |
| Momentum Exit Guard | Exit on momentum decay | `momentum_exit_guard_enabled` |
| Decay Velocity Exit | Exit on rapid score decay | `decay_velocity_exit_enabled` |
| Stale Peak Protection | Exit if peak unrevisited | `stale_peak_protection_enabled` |

---

## Execution & Monitoring

| Module | Purpose | Config |
|---|---|---|
| Auto Signal Generator | Scheduled signal generation | `auto_execute_signals` |
| Shadow Mode | Log hypothetical signals without executing | `shadow_mode_enabled` |
| AI Rejection Analyzer | Validate rejection correctness via AI | `ai_analysis_enabled` |
| Bot Health Monitor | Heartbeat, no-trade state tracking | `BOT_HEARTBEAT_CONFIG` |
| Correlation Guard | Cross-symbol exposure limits | `CORRELATION_PARAMS` |
| Order Flow Analysis | Bid/ask imbalance scoring | Always active |
| Regime Persistence Engine | State machine hysteresis | Always active |
