# Exhaustion Bounce Recovery

## Problem
DEADLOCK: When bearish trend is exhausting + price deeply oversold, the bot has ZERO possible trades:
- MACRO_BIAS_LONG_BLOCKED prevents LONGs (bearish trend)
- STOCHRSI_OVERSOLD_BLOCK prevents SHORTs (K < 15)
- REVERSAL_OVERRIDE_SAFETY prevents reversal (ADX >= 30)

Evidence: 5+ days of zero trades while market bounced 3-4%.

## Solution
Three-level exemption for exhaustion bounces:

### Level 1: Reversal Safety Gate (strategy-analyzer)
When ADX >= 30 BUT adxSlope < -1.0 AND regime = TREND_EXHAUSTION:
- Allow reversal override (bypass ADX >= 30 block)
- Relax reversal score requirement (65 → 40)

### Level 2: MACRO_BIAS Gate (gate-pipeline)
When direction = LONG AND primaryTrend = bearish:
- If StochRSI K < 20 AND adxSlope < -1.0 AND regime ∈ [TREND_EXHAUSTION, BREAKOUT_SETUP]:
  - Allow LONG with 0.35x position multiplier
  - Log as EXHAUSTION_BOUNCE_RECOVERY

### Level 3: Direction Derivation (strategy-analyzer)
Existing oversold reversal candidate detection (K < 20, K > D, 1h bullish turn)
now passes through safety gates due to Level 1 exemption.

## Detection Criteria
- ADX slope < -1.0 (trend losing energy)
- StochRSI K < 20 (deeply oversold)
- Regime = TREND_EXHAUSTION or BREAKOUT_SETUP
- K > D preferred (momentum turning up)

## Position Sizing
- Base: 0.35x (probe entry)
- High quality (reversal score >= 60): 0.50x

## Config
`EXHAUSTION_BOUNCE_RECOVERY` in `constants.ts`

## Date Added
2026-03-13
