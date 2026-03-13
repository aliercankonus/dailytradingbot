# Exhaustion Bounce Recovery (v2.0)

## Problem
DEADLOCK: When bearish trend is exhausting + price deeply oversold, the bot has ZERO possible trades:
- MACRO_BIAS_LONG_BLOCKED prevents LONGs (bearish trend)
- STOCHRSI_OVERSOLD_BLOCK prevents SHORTs (K < 15)
- REVERSAL_OVERRIDE_SAFETY prevents reversal (ADX >= 30)

Evidence: 5+ days of zero trades while market bounced 3-4%.

## Solution (v2.0 — Tightened)
Three-filter confluence + bounce confirmation:

### Exhaustion Structure (ALL required)
1. **ADX >= 25** — trend must have meaningful energy (not just noise)
2. **ADX slope < -1.0** — trend losing energy fast
3. **Price distance from EMA20 > 1.5x ATR** — truly overextended, not just pullback
4. **Regime = TREND_EXHAUSTION or BREAKOUT_SETUP**

### Bounce Confirmation (REQUIRED)
- **K > D** — momentum turning up (oversold ≠ bounce, recovery = bounce)
- Exception: K < 8 (extreme capitulation skips K>D check)

### v1 → v2 Changes
| Parameter | v1 | v2 | Reason |
|---|---|---|---|
| ADX minimum | none | >= 25 | Filters noise; ensures real trend exists |
| Overextension | none | >= 1.5 ATR | Confirms actual exhaustion, not just pullback |
| K > D | optional (prefer) | required | Prevents catching falling knives |
| Position multiplier | 0.35 / 0.50 | 0.25 / 0.35 | Counter-trend = smaller size |
| Max SL | 1.5% | 1.2% | Tighter risk for counter-trend |
| TP multiplier | 1.5 ATR | 1.0 ATR | Scalp bounce, don't overshoot |
| Max TP | none | 1.5% | Cap profit target for realism |

## Gate Pipeline Location
Gate 4.5 (after Direction, before Counter-Trend).

## Position Sizing
- Base: 0.25x (probe entry)
- High quality (reversal score >= 60): 0.35x

## Config
`EXHAUSTION_BOUNCE_RECOVERY` in `constants.ts`

## Date Added
2026-03-13 (v2.0 tightened)
