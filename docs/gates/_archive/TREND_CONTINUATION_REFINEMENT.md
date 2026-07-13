# TREND_CONTINUATION Refinement — Forensic v2 (2026-03-16)

## Trade-by-Trade Forensic Summary

| Metric | Value |
|--------|-------|
| Total Trades | 69 |
| Win Rate | 50.7% |
| Total PnL | +$36.73 |
| Trailing Stop Trades | 38 (avg +0.161%) |
| Partial Loss | 4 (avg -0.85%) |
| SL Cap Breaches | 2 (-1.226%, -1.212%) |

## Critical Findings

### 1. SL Cap Breach
The 1.0% SL cap was breached by two trades:
- XRPUSDT SELL: -1.226% (stop_loss) — ATR 0.57%
- BNBUSDT SELL: -1.212% (volume_relaxation_timeout) — ATR 0.98%

**Root cause**: `volume_relaxation_timeout` exits bypass SL cap enforcement. Legacy strategy name variants (`Adaptive Trend Entry (Q=64, dir=short)`) didn't match `STRATEGY_SL_OVERRIDES` lookup.

### 2. Trailing Stop Low Capture
38 trailing_stop trades with avg +0.161% — most trades ending near zero:
- Many trades peak at 0.3-0.5% but exit at -0.05% to -0.1%
- Progressive lock tiers not tight enough for small peaks

### 3. SELL Side Weakness
Worst losses concentrated on SELL side:
| Symbol | Side | PnL% | Close | ATR% |
|--------|------|------|-------|------|
| XRPUSDT | SELL | -1.226% | stop_loss | 0.57% |
| BNBUSDT | SELL | -1.212% | vol_relax_timeout | 0.98% |
| XRPUSDT | SELL | -1.103% | partial_loss | 0.57% |
| ADAUSDT | SELL | -1.054% | partial_loss | 0.62% |

## Surgical Fixes Applied (v2)

### 1. SL Cap Tightening + Legacy Name Fix
- `maxCapOverride`: 1.0% → **0.85%**
- `atrMultiplier`: 0.9 → **0.8**
- Added legacy name aliases (`Adaptive Trend Entry`, `Quality+Momentum`, `Near-Quality`) to SL override lookup
- Expected: eliminates all SL breaches

### 2. SHORT + Declining ADX → 50% Position
- `adxSlope < -0.3` on SHORT → position halved
- Expected: reduces SELL side loss magnitude

### 3. SHORT Oversold Block
- `stochK < 20` blocks SHORT entry entirely
- Forensic: XRPUSDT entered SHORT at oversold = instant reversal

### 4. BUY Weak Momentum Guard
- `momentumScore < 3 && adx < 25` → 40% position
- Forensic: DOTUSDT BUY -0.692% with weak momentum

## Performance Drivers (Keep)
- `partial_tp_1`: 7 trades, avg +5.857% → **best exit type**
- `smart_aits_rapid_decay`: 3 trades, avg +1.3% → solid
- `trailing_stop`: 2 trades, avg +1.02% → when trailing works well
