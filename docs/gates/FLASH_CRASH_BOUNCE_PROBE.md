# Flash Crash Bounce Probe

## Overview

The Flash Crash Bounce Probe is a dedicated, isolated regime (`REGIME_TAG: 'FLASH_CRASH_BOUNCE'`) designed to capture rapid V-shaped reversals during liquidation cascade events. Unlike trend-following or classical capitulation logic, this probe targets ultra-fast velocity drops with immediate snapbacks.

## Key Architecture

- **Isolation**: Separate constants, detection logic, and metadata
- **No ADX slope requirement**: Flash crashes keep ADX positive until reversal
- **No HTF structure requirement**: Bounces occur on same candle as low
- **Direction flip**: Automatically flips from SHORT to LONG when triggered

## Detection Phases

### Phase 1: Static Exhaustion
**Condition**: K currently pinned at absolute floor

```
stochRsiK4h <= 1 OR stochRsiK1h <= 1
```

This catches scenarios where the oscillator is still at rock bottom.

### Phase 2: Release State (Temporal Logic)
**Purpose**: Catches V-shaped bounces where momentum leads price

Phase 2 triggers when:
1. **K was recently at floor**: `recentMinK <= 3` (within last 3 candles)
2. **Current K still recovering**: `K <= 30` (4h OR 1h with `INCLUDE_1H_RECOVERY`)
3. **Minimum rise occurred**: `kRise >= 5` (momentum snapback)
4. **K is actively rising**: At least 2 consecutive rising steps (anti-jitter)
5. **Momentum stabilizing**: Score > `-28` (70% of max opposing threshold)

### Phase 2 Safety Guardrails

| Guardrail | Purpose | Implementation |
|-----------|---------|----------------|
| 2-step rising confirmation | Prevents single-candle jitter | `risingSteps >= 2` |
| Momentum stabilization | Prevents counter-trend knife-catching | `momentum > -28` |
| 1h recovery inclusion | Catches faster V-bottoms | `stochK1h <= 30` allowed |
| Asymmetric floor threshold | Matches liquidation overshoots | `FLOOR_THRESHOLD: 3` |

## Core Triggers

| Condition | Threshold | Purpose |
|-----------|-----------|---------|
| Price Drop | ≥ 10% | Significant magnitude |
| Drop Duration | ≤ 4 hours | Velocity check |
| ADX | ≥ 35 | High trend energy |
| Momentum | > -40 | Not extreme opposing |
| Drop Rate | ≥ 2.5%/hr | Rapid decline confirmation |

## Risk Controls

| Control | Value | Rationale |
|---------|-------|-----------|
| Position Size | 20-35% | One-shot probe |
| Stop Loss | 0.5x ATR or 0.8% | Ultra-tight |
| Partial TP | 50% at 1% | Lock quick gains |
| Max Probes/Day | 1 per symbol | Capital preservation |
| Cooldown | 6 hours after failure | Prevent revenge trading |

## Metadata Structure

```typescript
flashCrashBounceProbe: {
  active: true,
  regime: 'FLASH_CRASH_BOUNCE',
  triggerPhase: 'PHASE_1_STATIC' | 'PHASE_2_RELEASE',
  positionMultiplier: number,
  stochK4h: number,
  stochK1h: number,
  recentMinK: number,
  priceDrop: number,
  dropHours: number,
  dropRatePerHour: number,
  momentum: number,
  adx: number,
  adxSlope: number,
  hasReversalCandle: boolean,
  volumeRatio: number,
  sizeReason: string,
  // Phase 2 diagnostics (when applicable)
  phase2?: {
    triggered: boolean,
    recentMinK: number,
    currentK: number,
    kRise: number,
    risingSteps: number,
    minRisingSteps: number,
    momentumStabilizing: boolean,
    historySource: '4h' | '1h' | 'none',
    include1hRecovery: boolean
  }
}
```

## Key Differences from Capitulation Bounce Probe

| Aspect | Flash Crash | Capitulation |
|--------|-------------|--------------|
| Drop threshold | ≥ 10% | ≥ 8% |
| ADX slope | IGNORED | Required ≤ 0 |
| HTF structure | IGNORED | Required 2+ candles since low |
| Momentum tolerance | -40 | -30 |
| Velocity check | Required | Not required |
| Time window | 4 hours max | No time limit |

## Historical Context

The Phase 2 Release State was added after analysis of the BTC $64,250 flash crash event, where:
- Price drop: 10.7% ✅
- ADX: 58.5 ✅
- StochRSI K (4h): 19.1 at analysis time (had recovered from floor)

The probe missed the bounce because momentum led price - K rebounded from floor before price confirmed reversal. Phase 2 temporal logic addresses this by tracking "K was recently at floor" instead of "K is currently at floor".

## Logging

Near-misses and triggers are logged with full diagnostic details:
- Phase 1 vs Phase 2 status
- All condition pass/fail states
- Rising steps count
- Momentum stabilization status
- History source (4h/1h)
