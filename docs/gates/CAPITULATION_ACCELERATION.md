# CAPITULATION_ACCELERATION Gate (Fix #3)

## Purpose

Detects **sustained momentum acceleration** — not just a snapshot — by comparing the current `momentum_score` against the score from 3 analysis cycles ago. When the delta exceeds the threshold during a directional move, this is classified as **capitulation** (not exhaustion), and continuation entries are allowed at reduced size.

## Problem Solved

The `MOVE_EXHAUSTED` gate uses percentage distance from 24h high/low to block late entries. However, during capitulation events (panic selling / FOMO buying), price moves 3–5% extremely fast with accelerating momentum. The snapshot-based momentum check sees "oversold" and blocks continuation, but the **acceleration** proves the move is still intensifying — oversold ≠ exhausted when momentum is accelerating.

## Detection Method

```
momentum_acceleration = current_momentum_score - momentum_score_3_cycles_ago
```

Query: Last 3 records from `momentum_analysis` for the same user + symbol within the last 30 minutes, ordered by `recorded_at DESC`.

## Activation Conditions (ALL must be true)

1. `MOVE_EXHAUSTED` would have blocked the entry
2. At least 3 historical `momentum_analysis` records exist within 30 min
3. `|momentum_acceleration| >= 15` (strong acceleration)
4. Acceleration direction aligns with derived trade direction:
   - SHORT: acceleration ≤ -15 (bearish acceleration)
   - LONG: acceleration ≥ +15 (bullish acceleration)
5. ADX slope ≥ 0 (energy not decaying)
6. Move distance < 10% (absolute hard block preserved)

## Shadow Mode

Currently deployed in **SHADOW MODE** (`SHADOW_MODE: true`). The system logs what **would have happened** to the `shadow_mode_signals` table but does NOT override the block.

Set `SHADOW_MODE: false` after 3–5 days of observation to enable live execution.

## Position Sizing

| Condition | Multiplier |
|-----------|-----------|
| Base capitulation entry | 0.30x |
| With HTF alignment support | 0.40x |

## Safety Rails

- **Absolute hard block at 10%+** — never overrides extreme moves
- **ADX slope must be ≥ 0** — decaying energy = not capitulation
- **Direction alignment required** — acceleration must match trade direction

## Interaction with Other Gates

- Only fires when `MOVE_EXHAUSTED` would block (hard or soft zone)
- Does NOT bypass: Tier 0 StochRSI, ADX floor, Priority 1-2 gates
- Logged alongside existing move exhaustion diagnostics

## Configuration

Located in `constants.ts` → `MOVE_EXHAUSTION_FILTER_PARAMS.CAPITULATION_ACCELERATION`

## Expected Impact

- Captures 1–2 additional continuation entries per week during fast moves
- Win rate may decrease 2–3% but R:R improves due to catching middle third
- Shadow mode observation period: 3–5 trading days minimum
