# Position Sizing Flow per Trade

## Overview

Every trade passes through a multi-stage sizing pipeline that transforms raw regime classification into a final position multiplier. The system prioritizes **capital preservation** through graduated sizing rather than binary allow/block decisions.

---

## Flow Diagram

```
START → classify4StateRegime()
         ├── Regime Type (4 states)
         ├── Regime Confidence (0–100)
         └── Diagnostics (ADX, slope, momentum, LTF alignment)
                  │
                  ▼
        ┌─────────────────────┐
        │  CHECK REGIME TYPE  │
        └─────────────────────┘
                  │
    ┌─────────┬──┴──────────┬───────────────┐
    ▼         ▼             ▼               ▼
TREND_EXP  TREND_EXH   BREAKOUT_SETUP  RANGE_COMP
    │         │             │               │
    ▼         ▼             ▼               ▼
Conf ≥70   MR Only      Directional     Conf <45
Base 1.0x  Base 0.25x   0.5–1.0x        HARD BLOCK
    │         │             │               │
    └─────────┴──────┬──────┘               │
                     ▼                      │
           ┌──────────────────┐             │
           │ REGIME AGE ≥ 20? │             │
           └──────────────────┘             │
              YES │    │ NO                 │
                  ▼    │                    │
           Apply Age   │                    │
           Decay       │                    │
           (→ 0.60x    │                    │
            at 60      │                    │
            candles)   │                    │
                  │    │                    │
                  ▼    ▼                    │
           ┌──────────────────┐             │
           │ TRANSITION BUFFER│             │
           └──────────────────┘             │
              │              │              │
    Conf ≥55          Conf 45–54            │
    → 0.70x           → 0.40x              │
              │              │              │
              ▼              ▼              ▼
           ┌──────────────────────┐
           │ FINAL POSITION SIZE  │
           └──────────────────────┘
                     │
                     ▼
              TRADE EXECUTION
```

---

## Stage 1: Regime Classification

`classify4StateRegime()` in `scoring.ts` evaluates market structure and outputs one of four states:

| Regime | Conditions | Base Sizing | Behavior |
|--------|-----------|-------------|----------|
| **TREND_EXPANSION** | ADX ≥ 30, slope ≥ 0, LTF aligned | 1.0x | Full continuation allowed |
| **TREND_EXHAUSTION** | ADX ≥ 30, slope declining OR behavioral exhaustion | 0.25x | MR probes only, continuation blocked |
| **BREAKOUT_SETUP** | ADX 18–30, slope rising ≥ 0.5, directional momentum | 0.50x | Conditional directional entry, confirmation required |
| **RANGE_COMPRESSION** | Neutral trend, ADX < 25, weak momentum | 0x (blocked) | Hard block; Compression Micro-Range engine operates independently |

---

## Stage 2: Regime Confidence Score (0–100)

A continuous score replaces binary regime thresholds to reduce whipsaw:

```
regimeConfidence = (
  ADX_normalized      × 0.30 +
  ADX_slope_normalized × 0.25 +
  ATR_expansion_rate   × 0.20 +
  DI_separation        × 0.15 +
  Momentum_alignment   × 0.10
) × 100
```

### Normalization Ranges
- **ADX**: 15 (min) → 45 (max)
- **ADX Slope**: -1.0 → +2.0
- **ATR Expansion**: 0.5 → 1.5 (relative to rolling average)
- **DI Separation**: 0 → 30
- **Momentum**: 1.0 (aligned), 0.5 (neutral), 0.0 (opposing)

---

## Stage 3: Regime Age Decay

Markets statistically rotate. Position sizing is graduated down as regimes age:

| Candles in Regime | Sizing Multiplier | Note |
|---|---|---|
| 0–19 | 1.0x | Full sizing |
| 20 | 1.0x (decay begins) | Start of fatigue |
| 40 | 0.80x | Mid-fatigue |
| 60+ | 0.60x | Maximum fatigue |

**Affected regimes**: `TREND_EXPANSION`, `TREND_EXHAUSTION`  
**Unaffected**: `RANGE_COMPRESSION` (already blocked), `BREAKOUT_SETUP` (transitional by nature)

Formula: `multiplier = 1.0 - fatigueProgress × (1.0 - 0.60)`

---

## Stage 4: Transition Buffer

When confidence falls in the transition zone, sizing is graduated:

| Confidence Range | Zone | Sizing | Behavior |
|---|---|---|---|
| ≥ 70 | Confirmed Expansion | 1.0x | Full sizing |
| 55–69 | Upper Transition | 0.70x | Cautious expansion, confirmation required |
| 45–54 | Lower Transition | 0.40x | Cautious compression entries |
| < 45 | Hard Block | 0x | No entries (RANGE_COMPRESSION) |

---

## Final Multiplier Calculation

```
finalMultiplier = baseRegimeSize × ageDecayFactor × transitionBufferFactor
```

This multiplier is then further adjusted by:
- Gate-specific reductions (momentum, spike protection, etc.)
- Quality score penalties (Excellent 1.0x → Marginal 0.5x)
- Recovery mode reductions
- Correlation risk adjustments

---

## Configuration

All parameters are centralized in `constants.ts`:

```typescript
FOUR_STATE_REGIME.TRANSITION_BUFFER = {
  WEIGHTS: { ADX: 0.30, ADX_SLOPE: 0.25, ATR_EXP: 0.20, DI_SEP: 0.15, MOMENTUM: 0.10 },
  EXPANSION_THRESHOLD: 70,
  TRANSITION_HIGH: 70,
  TRANSITION_LOW: 45,
  TRANSITION_POSITION_MULTIPLIER_HIGH: 0.70,
  TRANSITION_POSITION_MULTIPLIER_LOW: 0.40,
};

FOUR_STATE_REGIME.REGIME_AGE_DECAY = {
  FATIGUE_START_CANDLES: 20,
  FULL_FATIGUE_CANDLES: 60,
  MAX_FATIGUE_MULTIPLIER: 0.60,
  AFFECTED_REGIMES: ['TREND_EXPANSION', 'TREND_EXHAUSTION'],
};
```
