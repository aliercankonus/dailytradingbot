

# MR Bypass in ADX Transitional Zone (18-22)

## Summary
Add Mean Reversion as the third bypass priority in the ADX transitional zone (18-22) of the strategy-analyzer, after Squeeze Expansion and Early Ignition. This implements single-bypass-per-signal enforcement using the existing `earlyMeanReversionSignal` computed upstream at line 7729.

## What Changes

### File: `supabase/functions/strategy-analyzer/index.ts`

**Single edit location: Lines ~10674-10676** (between Early Ignition check and the rejection block)

Insert a new MR bypass check block after the Early Ignition check (line 10674) and before the "neither exception passed" rejection block (line 10676):

```text
Current flow (lines 10625-10732):
  1. Squeeze check (10631-10651) -> sets squeezeBreakoutActive
  2. Early Ignition check (10653-10674) -> sets earlyIgnitionActive (only if !squeezeBreakoutActive)
  3. Rejection if neither passed (10676-10731) -> continue

New flow:
  1. Squeeze check -> sets squeezeBreakoutActive
  2. Early Ignition check (only if !squeezeBreakoutActive) -> sets earlyIgnitionActive
  3. NEW: MR bypass check (only if !squeezeBreakoutActive && !earlyIgnitionActive) -> sets meanReversionTransitionalActive
  4. Rejection if none passed -> continue
```

**New block to insert (between lines 10674 and 10676):**

```typescript
// 3. MEAN REVERSION BYPASS (Priority 3 - lowest)
// Only fires if Squeeze and Early Ignition both failed
// Uses upstream earlyMeanReversionSignal (computed at line ~7729, before ADX gate)
let meanReversionTransitionalActive = false;
let meanReversionTransitionalMultiplier = 1.0;

if (!squeezeBreakoutActive && !earlyIgnitionActive && isInTransitionalZone &&
    earlyMeanReversionSignal?.detected && earlyMeanReversionSignal?.allowed) {
  meanReversionTransitionalActive = true;
  meanReversionTransitionalMultiplier = COUNTER_TREND_ADMISSION.PROBE_POSITION_MULTIPLIER; // 0.25x

  if (ADX_GATE_V1_1.LOG_BYPASS_SELECTION) {
    logger.forSymbol(symbol).info(
      `${LOG_CATEGORIES.SUCCESS} 🔄 MEAN_REVERSION_BYPASS (v1.1): ADX=${adx.toFixed(1)} allowed ` +
      `(exhaustionScore=${earlyMeanReversionSignal.exhaustionScore}, ` +
      `direction=${earlyMeanReversionSignal.direction}, ` +
      `${(meanReversionTransitionalMultiplier * 100).toFixed(0)}% size)`
    );
  }
  perSymbolGateAttribution.set(symbol, {
    gate: 'MEAN_REVERSION_TRANSITIONAL_V11',
    details: `MR bypass in ADX transitional zone (score=${earlyMeanReversionSignal.exhaustionScore})`
  });
}
```

**Update the rejection condition (line 10677):**

Change from:
```typescript
if (!squeezeBreakoutActive && !earlyIgnitionActive) {
```
To:
```typescript
if (!squeezeBreakoutActive && !earlyIgnitionActive && !meanReversionTransitionalActive) {
```

**Add position size application (after line 10751):**

After the Early Ignition position size application block, add:

```typescript
// Apply MR transitional position size reduction if active
if (meanReversionTransitionalActive && meanReversionTransitionalMultiplier < 1.0) {
  reversalPositionMultiplier = Math.min(reversalPositionMultiplier, meanReversionTransitionalMultiplier);
  logger.forSymbol(symbol).info(
    `${LOG_CATEGORIES.RISK} 🔄 MR Transitional (v1.1) - position size capped at ${(meanReversionTransitionalMultiplier * 100).toFixed(0)}%`
  );
}
```

**Update rejection log `meanReversionBypass` field** in the rejection filters_status (lines 10703-10708) -- these already log MR context correctly, no change needed there.

## Architectural Validation

| Requirement | Status |
|---|---|
| Lives inside ADX 18-22 only | Yes - guarded by `isInTransitionalZone` |
| Priority order preserved | Yes - only fires when `!squeezeBreakoutActive && !earlyIgnitionActive` |
| Single-bypass-per-signal | Yes - mutual exclusion via boolean guards; rejection uses `continue` |
| Position multiplier isolated | Yes - uses `Math.min()` invariant, scoped to this signal |
| MR signal computed upstream | Yes - `detectExhaustion()` at line 7729, before ADX gate at ~10580 |

## Technical Details

- **Position multiplier**: `COUNTER_TREND_ADMISSION.PROBE_POSITION_MULTIPLIER` = 0.25x (25% of normal)
- **Gate condition**: `earlyMeanReversionSignal.detected && earlyMeanReversionSignal.allowed`
- **Gate attribution tag**: `MEAN_REVERSION_TRANSITIONAL_V11`
- **No new constants needed** -- `BYPASS_PRIORITY_ORDER.MEAN_REVERSION: 3` already exists in `ADX_GATE_V1_1`
- **No new imports needed** -- `COUNTER_TREND_ADMISSION` is already imported

