# SQUEEZE_BREAKOUT Surgical Fixes (v4.1)

## Date: 2026-03-16

## Forensic Findings (7 trades, 90-day)

| # | Symbol | Side | PnL% | Close Reason | Issue |
|---|--------|------|------|--------------|-------|
| 1 | BNBUSDT | BUY | +0.016% | trailing_stop | Peak 0.69% → giveback 98% |
| 2 | DOTUSDT | BUY | -3.082% | stop_loss | ATR% 2.01, SL bleeding |
| 3 | ADAUSDT | BUY | +1.426% | decay exit | OK |
| 4 | ADAUSDT | BUY | +1.426% | partial_tp_1 | OK |
| 5 | ETHUSDT | BUY | 0% | break_even | OK |
| 6 | ETHUSDT | BUY | 0% | break_even | OK |
| 7 | BNBUSDT | SELL | +0.205% | trailing_stop | Peak 0.73% → giveback 72% |

## Fix 1: SL Cap 1.5% (constants.ts)

**Problem**: DOTUSDT -3.08% SL wiped all strategy gains.

**Solution**: Added `SQUEEZE_BREAKOUT` to `STRATEGY_SL_OVERRIDES`:
```typescript
'SQUEEZE_BREAKOUT': {
  atrMultiplier: 1.0,     // Standard ATR
  maxCapOverride: 1.5,    // Hard cap at 1.5%
}
```

**Enforcement**: Added to `execute-trade/index.ts` — strategy SL cap now enforced at execution time (was only in backtest/monitor).

## Fix 2: BUY Directional Filter (gate-pipeline.ts)

**Problem**: 6 BUY trades averaged -0.036% PnL.

**Solution**: Stricter BUY entry requirements:
- Hard block: BUY in bearish trend + momentum < 10
- Hard block: BUY with StochRSI K > 70 (overbought)
- Sizing reduction: K > 60 → 60% position
- Sizing reduction: ADX slope declining → 50% position

## Fix 3: Progressive Lock Tightening (constants.ts)

**Problem**: Peak 0.69-0.73%, exits at +0.016-0.205% → 72-98% giveback.

**Solution**: Tightened all progressive lock tiers from ~64-80% protection → ~73-84%:
- 0.55% peak: lock +0.40% (was +0.35%)
- 0.70% peak: lock +0.55% (was +0.50%)
- 1.00% peak: lock +0.82% (was +0.75%)
- 2.00% peak: lock +1.65% (was +1.55%)

## Fix 4: Forensic Dashboard (UI)

Added `StrategyForensicDashboard` component to Performance page → "Forensics" tab.
- Strategy summary cards with WR, PnL, avg win/loss
- Side breakdown (BUY vs SELL)
- Close reason analysis with SL bleeding detection
- Configurable time period (30/60/90 days)

## Expected Impact

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| DOTUSDT SL loss | -3.08% | ≤-1.50% | +1.58% saved |
| BUY weak entries | 6 trades | Filtered | WR improvement |
| Peak giveback | 72-98% | 17-27% | Major improvement |
| Forensic visibility | None | Real-time dashboard | ✅ |
