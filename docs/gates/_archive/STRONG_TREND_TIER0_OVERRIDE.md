 # Strong Trend Tier 0 Override Gate
 
 ## Purpose
 Allow trend-continuation entries at extreme StochRSI levels (K<5 oversold or K>95 overbought) when ADX confirms a powerful capitulation move, using conservative position sizing.
 
 ## Problem Solved
 Before this override:
 - Tier 0 circuit breaker blocked ALL shorts when K < 5 (80% bounce probability statistically)
 - In capitulation events (8%+ moves), StochRSI can remain pegged at extremes for extended periods
 - Result: Missed 5-10% continuation moves during panic/capitulation events
 
 Example (BNB 8% drop):
 - 4H StochRSI K = 3.0 (deeply oversold)
 - ADX = 43.2 (strong trend)
 - Momentum = -45 (strongly bearish)
 - System blocked 128 SHORT signals while price continued falling
 
 ## Design Philosophy
 
 ### 1. Statistical Override
 The 80% bounce probability at K<5 applies to **normal market conditions**. During capitulation events:
 - Price can continue 5-10%+ despite extreme readings
 - ADX confirms trend energy is still present
 - Momentum confirms directional pressure
 
 ### 2. Conservative Entry
 When override triggers:
 - Position size reduced to 25% (POSITION_SIZE_MULTIPLIER: 0.25)
 - This is a late-entry probe, not a full position
 - Risk is managed through sizing, not rejection
 
 ### 3. Multi-Factor Confirmation
 All conditions must be met:
 | Condition | Threshold | Rationale |
 |-----------|-----------|-----------|
 | ADX | >= 40 | Strong trend energy |
 | ADX Slope | >= -1.0 | Trend not dying |
 | Momentum Score | >= 30 (long) or <= -30 (short) | Directional confirmation (score-only check) |
 | 1H Trend | Not strongly opposing (confidence < 60%) | Structure supports direction |
 
 **Note:** Momentum direction enum check was removed - the score inherently encodes direction (positive = bullish, negative = bearish), making the enum check redundant and prone to over-filtering.
 
 ## Implementation
 
 ### Configuration (constants.ts)
 ```typescript
 export const STRONG_TREND_TIER0_OVERRIDE = {
   ENABLED: true,  // Single authority - no duplicate flags
   
   // ADX Requirements
   MIN_ADX: 40,
   MIN_ADX_SLOPE: -1.0,  // Consider tightening to -0.5 for cleaner continuation
   
   // Momentum Requirements (score only - quantitative, stable)
   MIN_MOMENTUM_SCORE: 30,
   // REMOVED: REQUIRE_MOMENTUM_ALIGNMENT - redundant with score check
   
   // Trend Alignment
   REQUIRE_1H_ALIGNMENT: true,
   MIN_1H_OPPOSING_CONFIDENCE: 60,  // 1H only blocks if confidence >= this
   
   // Position Sizing
   POSITION_SIZE_MULTIPLIER: 0.25,
   
   // Cooldown Protection
   MAX_OVERRIDES_PER_SYMBOL: 1,
   COOLDOWN_HOURS: 4,
   
   // Entry Type Tagging
   ENTRY_TYPE_TAG: 'STRONG_TREND_TIER0_OVERRIDE',
   
   LOG_OVERRIDE_DETAILS: true,
 };
 ```
 
 ## Gate Interaction
 
 ### Before (Standard Tier 0)
 ```
 TIER 0 DEEP OVERSOLD: SHORT blocked at K=3.0
 → "Bounce probability ~80%+"
 → No exceptions allowed
 ```
 
 ### After (With Strong Trend Override)
 ```
 TIER 0 DEEP OVERSOLD: K=3.0
 → Check Strong Trend Override conditions
 → ADX=43.2 >= 40 ✅
 → ADX Slope=2.5 >= -1.0 ✅
 → Momentum=-45 (need <= -30 for short) ✅
 → 1H Trend: not strongly bullish ✅
 
 STRONG TREND OVERRIDE: SHORT allowed at K=3.0
 → Position size reduced to 25%
 → Entry tagged as STRONG_TREND_TIER0_OVERRIDE
 ```
 
 ## Logging
 
 Distinct log messages for forensics:
 - `STRONG TREND OVERRIDE: SHORT allowed at K=X.X despite Tier 0 oversold`
 - `→ Override conditions met: ADX=X.X, slope=X.XX, momentum=XX`
 - `→ Position size reduced to 25%`
 
 Rejection logs include:
 - `strongTrendOverrideAttempted: true`
 - `strongTrendOverrideReason: "Momentum -15 doesn't confirm short (need <= -30)"` (specific failure reason)
 
 ## When NOT Applied
 
 1. ADX < 40 (insufficient trend energy)
 2. ADX slope < -1.0 (trend dying)
 3. Momentum score doesn't confirm direction (need >= 30 for long, <= -30 for short)
 4. 1H trend strongly opposing (confidence >= 60%)
 5. Override disabled in configuration (STRONG_TREND_TIER0_OVERRIDE.ENABLED = false)
 
 ## Risk Management
 
 | Factor | Standard Entry | Override Entry |
 |--------|---------------|----------------|
 | Position Size | 100% | 25% |
 | Entry Point | Normal StochRSI | Extreme StochRSI |
 | Risk Level | Normal | Higher (late entry) |
 | Potential Reward | Normal | Continuation capture |
 | Cooldown | None | 1 per symbol per 4 hours |
 | Tagging | Standard | STRONG_TREND_TIER0_OVERRIDE |
 
 ## Expected Impact
 
 | Metric | Before | After |
 |--------|--------|-------|
 | Tier 0 block rate at ADX>40 | 100% | ~20% (with sizing) |
 | Capitulation capture | 0% | ~60% (with reduced size) |
 | Late-entry risk exposure | 0% | 25% position only |
 
 ## Relationship to Other Gates
 
 - **Tier 0 Deep StochRSI**: This override provides an escape valve when ADX confirms strong trend
 - **Strong ADX Override**: Similar philosophy but for different gate (momentum confirmation)
 - **Continuation Mode**: Complementary - both capture strong trend moves at higher ADX
 - **Mean Reversion**: Opposite direction - MR enters counter-trend at extremes
 
 ## Monitoring
 
 Track these metrics post-implementation:
 1. Override trigger rate (should be ~5-10% of Tier 0 blocks)
 2. Win rate on override entries (target: >50%)
 3. Average P&L on override entries (should be positive given trend confirmation)
 4. Peak-to-exit giveback (measure if 25% sizing is appropriate)
 5. Cooldown effectiveness (are we avoiding "death by 100 small cuts"?)
 
 ## Code Review Fixes Applied
 
 Based on system review, the following corrections were made:
 
 1. **Flag duplication fixed**: Removed `ALLOW_STRONG_TREND_OVERRIDE` from `DEEP_STOCHRSI_HARD_GATE`. Now only `STRONG_TREND_TIER0_OVERRIDE.ENABLED` controls the feature.
 
 2. **Momentum redundancy fixed**: Removed separate direction enum check. Score alone (>= 30 or <= -30) confirms direction since it inherently encodes bullish/bearish bias.
 
 3. **Config/logic consistency fixed**: 1H opposing check now uses `MIN_1H_OPPOSING_CONFIDENCE` from config instead of hardcoded 60.
 
 4. **Cooldown protection added**: `MAX_OVERRIDES_PER_SYMBOL` and `COOLDOWN_HOURS` prevent repeated late entries in grinding trends.
 
 5. **Entry type tagging added**: `ENTRY_TYPE_TAG` enables separate win rate analysis and fast kill switch if needed.
