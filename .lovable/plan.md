
# Plan: Strengthen Price-Based Profit Locks & Tune Decay Velocity

## Problem Summary
The BNBUSDT trade exposed a **profit capture imbalance** where:
- Position peaked at ~1.99% P&L (~$4.52 theoretical max)
- Realized only $3.04 (1.34%) - a **33% peak giveback**
- **Root cause**: Progressive price-based locks capped at 0.85%, leaving decay velocity as the de facto take-profit mechanism above that threshold

The current system has two independent protection layers that aren't properly coordinated at higher profit levels:
1. **Price-based locks**: Micro (0.15-0.50%), Progressive (0.50-0.85%), Trailing (0.85%+)
2. **Decay velocity exit**: Time + slope-based emergency exit

## Design Philosophy
- **Price-based locks should be the PRIMARY profit capture mechanism**
- **Decay velocity should remain a FAILSAFE**, not the main TP logic
- Progressive locks must extend into the 0.85-2.5% range to reduce reliance on decay exits

---

## Implementation Steps

### Step 1: Extend Progressive Profit Lock Tiers

**File**: `supabase/functions/_shared/constants.ts`

Extend `PROGRESSIVE_PROFIT_LOCK_PARAMS.TIERS` to cover peaks up to 2.5%:

**Current tiers (stop at 0.80%):**
```typescript
{ peakThreshold: 0.50, lockTarget: 0.30 },
{ peakThreshold: 0.55, lockTarget: 0.35 },
...
{ peakThreshold: 0.80, lockTarget: 0.60 },
```

**New tiers (extend to 2.5%):**
```typescript
{ peakThreshold: 0.50, lockTarget: 0.30 },
{ peakThreshold: 0.55, lockTarget: 0.35 },
{ peakThreshold: 0.60, lockTarget: 0.40 },
{ peakThreshold: 0.65, lockTarget: 0.45 },
{ peakThreshold: 0.70, lockTarget: 0.50 },
{ peakThreshold: 0.75, lockTarget: 0.55 },
{ peakThreshold: 0.80, lockTarget: 0.60 },
// NEW: Extended tiers for higher peaks
{ peakThreshold: 0.90, lockTarget: 0.70 },
{ peakThreshold: 1.00, lockTarget: 0.75 },
{ peakThreshold: 1.25, lockTarget: 0.95 },
{ peakThreshold: 1.50, lockTarget: 1.15 },
{ peakThreshold: 1.75, lockTarget: 1.35 },
{ peakThreshold: 2.00, lockTarget: 1.55 },
{ peakThreshold: 2.50, lockTarget: 2.00 },
```

**Update `DEFER_TO_TRAILING_AT`**: Raise from 0.85 to 2.75 to let progressive locks control the 0.50-2.5% range before trailing takes over.

### Step 2: Constrain BASE Decay Velocity Tier

**File**: `supabase/functions/_shared/constants.ts`

Tighten BASE tier by ~15-20% to capture peaks faster in weak/misaligned conditions:

**Current:**
```typescript
BASE_EXIT_PER_MINUTE: 0.03,        // 3%/min decay triggers exit
BASE_MAX_DECAY_MINUTES: 10,        // Max 10 minutes
```

**Updated:**
```typescript
BASE_EXIT_PER_MINUTE: 0.025,       // 2.5%/min decay triggers exit (tightened ~17%)
BASE_MAX_DECAY_MINUTES: 8,         // Max 8 minutes (reduced from 10)
```

**Leave TIER1-4 unchanged** - they correctly allow healthy pullbacks in strong trends.

### Step 3: Update Monitor-Positions Logic

**File**: `supabase/functions/monitor-positions/index.ts`

No structural changes needed - the existing progressive lock evaluation already:
1. Sorts tiers descending to find highest applicable
2. Checks monotonic stop movement
3. Defers to trailing at `DEFER_TO_TRAILING_AT`

The new tiers will automatically be picked up since the logic iterates over `PROGRESSIVE_PROFIT_LOCK_PARAMS.TIERS`.

### Step 4: Add Documentation

**File**: `docs/gates/PROGRESSIVE_PROFIT_LOCK.md` (new)

Document the extended tier structure and design rationale:
- Why progressive locks extend to 2.5%
- Relationship to trailing stop handoff
- Decay velocity as failsafe, not primary TP

---

## Technical Details

### Profit Protection Hierarchy (Post-Change)

```text
Peak P&L    Protection Layer           Lock Target
─────────────────────────────────────────────────────
0.00-0.15%  None                       -
0.15-0.50%  Micro-Profit Lock          0% to +0.25%
0.50-2.50%  Progressive Profit Lock    +0.30% to +2.00%
2.50%+      Trailing Stop              Dynamic (ATR-based)
```

### Decay Velocity as Failsafe

```text
Tier       ADX Range   Decay Threshold   Max Decay Time
───────────────────────────────────────────────────────
BASE       < 25        2.5%/min          8 min
TIER1      25-30       5%/min            15 min
TIER2      30-35       7%/min            20 min
TIER3      35-40       10%/min           30 min
TIER4      40+         15%/min           45 min
```

### Example: 1.99% Peak Trade (Post-Fix)

**Before (current):**
- Peak 1.99% → above DEFER_TO_TRAILING_AT (0.85%)
- Progressive lock doesn't apply
- Trailing hadn't locked enough
- Decay velocity triggers exit at 1.34%
- **Result: 33% peak giveback**

**After (proposed):**
- Peak 1.99% → matches tier `{ peakThreshold: 1.75, lockTarget: 1.35 }`
- Stop moved to lock +1.35%
- Even if decay triggers, minimum exit = +1.35%
- **Result: ~32% improvement (1.35% vs 1.34% minimum)**

At 2.0% peak:
- Lock +1.55%
- **Result: Only ~22% giveback maximum**

---

## Impact Assessment

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Max giveback at 1.99% peak | 33% | 22% | -11% |
| Price-lock coverage | 0-0.85% | 0-2.75% | +224% |
| Decay exit role | Primary TP | Failsafe only | ✅ Correct |
| BASE decay tolerance | 3%/min | 2.5%/min | -17% |

## Files to Modify

1. `supabase/functions/_shared/constants.ts` - Extend progressive tiers, tighten BASE decay
2. `docs/gates/PROGRESSIVE_PROFIT_LOCK.md` - New documentation file

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Over-aggressive locking kills healthy pullbacks | TIER1-4 decay unchanged; trailing still flexible above 2.75% |
| Tighter BASE decay exits too early in ranging | Only affects misaligned positions; aligned get tier exception |
| Extended tiers increase DB stop updates | Minimal impact; tiers still monotonic |

## Validation

After deployment:
1. Monitor edge function logs for `PROGRESSIVE_LOCK_APPLIED` at new tier levels (0.90%+)
2. Compare peak-to-realized ratio for positions peaking 1-2.5%
3. Verify decay exits remain rare (failsafe behavior)
