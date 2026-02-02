# Plan: Strengthen Price-Based Profit Locks & Tune Decay Velocity

## ✅ COMPLETED

**Implemented:** 2026-02-02

### Changes Made:

1. **Extended Progressive Profit Lock Tiers** (`constants.ts`)
   - Added 7 new tiers covering 0.90% to 2.50% peaks
   - Raised `DEFER_TO_TRAILING_AT` from 0.85 to 2.75
   - Progressive locks now primary profit capture mechanism

2. **Tightened BASE Decay Velocity** (`constants.ts`)
   - `BASE_EXIT_PER_MINUTE`: 0.03 → 0.025 (~17% tighter)
   - `BASE_MAX_DECAY_MINUTES`: 10 → 8 minutes
   - TIER1-4 unchanged for healthy pullback tolerance

3. **Created Documentation** (`docs/gates/PROGRESSIVE_PROFIT_LOCK.md`)
   - Full tier structure documentation
   - Design philosophy: price-locks primary, decay failsafe
   - Impact assessment and examples

### Validation Steps:

1. Monitor edge function logs for `PROGRESSIVE_LOCK_APPLIED` at new tier levels (0.90%+)
2. Compare peak-to-realized ratio for positions peaking 1-2.5%
3. Verify decay exits remain rare (failsafe behavior)
