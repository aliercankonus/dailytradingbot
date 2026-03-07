# MarketFeatureSnapshot Architecture

## Overview

Centralizes all market feature extraction into a single snapshot object built **once per symbol per cycle**. Gates read from the snapshot instead of calling extractors individually.

## Problem Solved

Before: Each gate independently called `extractStochRsiK(trendData, '4h')`, `extractADX(trendData)`, etc. — 145+ extraction calls per cycle, each with its own fallback chain. This caused:
1. **Redundant computation**: Same values extracted 5-10x per symbol
2. **Fallback inconsistency**: Different gates used different fallback paths for the same field
3. **Path divergence risk**: One gate reading `trendData.volume.ratio`, another reading `trendData.volume["1h"].volumeRatio`

## Architecture

```
trendData (raw)
     │
     ▼
buildMarketFeatureSnapshot(symbol, trendData)
     │
     ▼
MarketFeatureSnapshot (mfs)
     │
     ├── mfs.adx, mfs.adxSlope, mfs.adxRising
     ├── mfs.stochRsi["4h"].k, mfs.stochRsi["1h"].k, ...
     ├── mfs.timeframes["4h"].trend, .confidence, .rsi
     ├── mfs.bollinger["1h"].squeeze, .percentB
     ├── mfs.volume["1h"].volumeRatio
     ├── mfs.atrPercent, mfs.relativeATR
     ├── mfs.smartMomentum?.score
     └── ... (all fields)
```

## Usage

```typescript
import { buildMarketFeatureSnapshot, snapshotStochK, snapshotAlignedTFCount } from "../_shared/market-feature-snapshot.ts";

// Build once per symbol
const mfs = buildMarketFeatureSnapshot(symbol, trendData);

// Read from snapshot (direct)
if (mfs.adx >= 30 && mfs.stochRsi["4h"].k < 10) { ... }

// Read from snapshot (convenience)
const k4h = snapshotStochK(mfs, '4h');
const aligned = snapshotAlignedTFCount(mfs, 'long');
```

## Migration Strategy

1. **Phase 1** (current): Snapshot is built and available as `mfs` in the symbol loop. Existing gate code continues using direct `trendData` access.
2. **Phase 2**: Gate by gate, replace `extractStochRsiK(trendData, '4h')` → `mfs.stochRsi["4h"].k`, `extractADX(trendData)` → `mfs.adx`, etc.
3. **Phase 3**: Remove individual extractor calls from strategy-analyzer entirely.

## Smart Momentum Note

`mfs.smartMomentum` is `undefined` at initial build because smartMomentum is calculated from local 15m klines AFTER the snapshot is created. It's updated immediately after `calculateMomentumScore()`.

## File

`supabase/functions/_shared/market-feature-snapshot.ts`

## Changelog

### v1.0 (2026-03-07)
- Initial creation of MarketFeatureSnapshot interface
- Builder function with all extractors centralized
- Convenience accessor functions (snapshotStochK, snapshotAlignedTFCount, etc.)
- Integrated into strategy-analyzer symbol loop
