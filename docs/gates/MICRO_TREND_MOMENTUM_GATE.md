# MICRO_TREND Optimized Scaling System

## Purpose

Prevents low-conviction "probe trades" and implements comprehensive position sizing for MICRO_TREND entries using a 6-step multiplicative scaling system.

## Root Cause Analysis

Forensic analysis of BE/loss trades identified common patterns:
- Trades used `MICRO_TREND` bypass without proper momentum alignment
- `momentum_state = 'mixed'` or `'none'` with weak scores
- Limited directional runway (price already moved significantly)
- Result: Low-conviction entries with insufficient momentum to sustain the move

## Scaling Logic (6 Steps)

**Note**: MICRO_TREND entries have a base position size of 60% (`MICRO_TREND_PARAMS.MAX_POSITION_SIZE_PERCENT`). The 6-step scaling system calculates an additional multiplier applied on top of this base.

### Step 1: Momentum State Check

| State | Action | Multiplier |
|-------|--------|------------|
| `none` | **BLOCK** | 0 |
| `building` | Allow (probe) | 50% |
| `confirmed`/`mixed` | Continue | 100% |

### Step 2: Smart Momentum Score

| Score Range | Action | Multiplier |
|-------------|--------|------------|
| < 15 | **BLOCK** | 0 |
| 15-30 | Partial | 60% |
| ≥ 30 | Full | 100% |

### Step 3: HTF (4H) Trend Alignment

| Condition | Multiplier |
|-----------|------------|
| 4h aligned | 100% |
| 4h neutral + score ≥ 30 | 70% |
| 4h neutral + score < 30 | 50% |
| 4h counter-trend | 50% (soft protection) |

### Step 4: Directional Runway

Uses `move_from_24h_low_percent` for LONG, `move_from_24h_high_percent` for SHORT.

| Runway | Action | Multiplier |
|--------|--------|------------|
| < 1.5% | **BLOCK** | 0 |
| 1.5-3% | Short | 60% |
| 3-5% | Medium | 80% |
| ≥ 5% | Long | 100% |

### Step 5: ADX Rescue (Graduated Exception)

When ADX is in the 22-25 transition zone:

| Requirements | Effect |
|-------------|--------|
| ADX 22-25 + rising slope + score ≥ 15 + quality ≥ 65 | Floor at 60% |

Uses `Math.max(currentMultiplier, 0.6)` to rescue trades that would otherwise be too small.

### Step 6: Minimum Floor

If multiplier > 0 but < 20%, bump to 20% minimum.

## Example Calculations

### Best Case (Full Alignment)
- State: confirmed (100%) × Score: 35 (100%) × HTF: aligned (100%) × Runway: 6% (100%)
- Tier multiplier: 100%
- Final: 60% base × 100% = **60% position**

### Moderate Case
- State: building (50%) × Score: 25 (60%) × HTF: neutral (70%) × Runway: 4% (80%)
- Tier multiplier: 0.5 × 0.6 × 0.7 × 0.8 = 16.8%
- Floor applied: 20%
- Final: 60% base × 20% = **12% position**

### Worst Non-Blocked Case
- State: confirmed (100%) × Score: 20 (60%) × HTF: counter (50%) × Runway: 2% (60%)
- Tier multiplier: 0.6 × 0.5 × 0.6 = 18%
- Floor applied: 20%
- Final: 60% base × 20% = **12% position**

## Configuration (`MICRO_TREND_MOMENTUM_SAFETY`)

```typescript
{
  ENABLED: true,
  
  // Step 1: Momentum State
  MOMENTUM_STATE: {
    BLOCK_ON_NONE: true,
    BUILDING_MULTIPLIER: 0.5,
    CONFIRMED_MULTIPLIER: 1.0,
    MIXED_MULTIPLIER: 1.0,
  },
  
  // Step 2: Momentum Score
  MOMENTUM_SCORE: {
    MIN_SCORE_THRESHOLD: 15,
    MODERATE_SCORE_THRESHOLD: 30,
    MODERATE_MULTIPLIER: 0.6,
    FULL_MULTIPLIER: 1.0,
  },
  
  // Step 3: HTF Alignment
  HTF_ALIGNMENT: {
    ENABLED: true,
    NEUTRAL_STRONG_MOMENTUM_MULTIPLIER: 0.7,
    NEUTRAL_WEAK_MOMENTUM_MULTIPLIER: 0.5,
    COUNTER_TREND_MULTIPLIER: 0.5,
    ALIGNED_MULTIPLIER: 1.0,
  },
  
  // Step 4: Directional Runway
  RUNWAY: {
    ENABLED: true,
    MIN_RUNWAY_PERCENT: 1.5,
    SHORT_RUNWAY_MAX: 3.0,
    SHORT_RUNWAY_MULTIPLIER: 0.6,
    MEDIUM_RUNWAY_MAX: 5.0,
    MEDIUM_RUNWAY_MULTIPLIER: 0.8,
    LONG_RUNWAY_MULTIPLIER: 1.0,
  },
  
  // Step 5: ADX Rescue
  ADX_RESCUE: {
    ENABLED: true,
    MIN_ADX: 22,
    MAX_ADX: 25,
    REQUIRE_ADX_RISING: true,
    MIN_MOMENTUM_SCORE: 15,
    MIN_QUALITY_SCORE: 65,
    RESCUE_FLOOR: 0.6,
  },
  
  // Step 6: Minimum Floor
  MIN_SIZE_MULTIPLIER: 0.2,
}
```

## Decision Flow

```
                    ┌─────────────────┐
                    │  MICRO_TREND    │
                    │   Detected?     │
                    └────────┬────────┘
                             │ Yes
                    ┌────────▼────────┐
                    │ Step 1: State   │
                    │  = 'none'?      │
                    └────────┬────────┘
                        │         │
                   Yes  │         │ No
                        ▼         ▼
                 ┌──────────┐  ┌──────────────┐
                 │ BLOCKED  │  │ Apply state  │
                 │   (0%)   │  │ multiplier   │
                 └──────────┘  └──────┬───────┘
                                      │
                    ┌────────▼────────┐
                    │ Step 2: Score   │
                    │  < 15?          │
                    └────────┬────────┘
                        │         │
                   Yes  │         │ No
                        ▼         ▼
                 ┌──────────┐  ┌──────────────┐
                 │ BLOCKED  │  │ Apply score  │
                 │   (0%)   │  │ multiplier   │
                 └──────────┘  └──────┬───────┘
                                      │
                    ┌────────▼────────┐
                    │ Step 3: HTF     │
                    │ Alignment       │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ Step 4: Runway  │
                    │  < 1.5%?        │
                    └────────┬────────┘
                        │         │
                   Yes  │         │ No
                        ▼         ▼
                 ┌──────────┐  ┌──────────────┐
                 │ BLOCKED  │  │ Apply runway │
                 │   (0%)   │  │ multiplier   │
                 └──────────┘  └──────┬───────┘
                                      │
                    ┌────────▼────────┐
                    │ Step 5: ADX     │
                    │ Rescue Check    │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ Step 6: Floor   │
                    │  < 20%?         │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ FINAL SIZE      │
                    │ base × tier     │
                    └─────────────────┘
```

## Logging

When enabled (`LOG_SIZING_TIERS: true`), logs include detailed step breakdown:

```
[RISK] MICRO-TREND OPTIMIZED SCALING: Partial: moderate momentum (score=22, 60%); 4h neutral: 70% (strong momentum); Medium runway: 4.5% (80%)
[RISK]   → State: State=building, continue to score check
[RISK]   → Score: Partial: moderate momentum (score=22, 60%)
[RISK]   → HTF: 4h neutral: 70% (strong momentum)
[RISK]   → Runway: Medium runway: 4.50% (80%)
[RISK]   → FINAL: 34% tier × 60% base = 20% position
```

## Related Gates

- `MICRO_TREND_PARAMS`: Base micro-trend detection requirements
- `LTF_CONFIRMATION_GATE`: Lower timeframe alignment
- `MOMENTUM_SLOPE_GATE`: Priority 1 momentum protection
- `NEAR_EXTREME_PROTECTION_GATE`: 24h high/low distance checks
