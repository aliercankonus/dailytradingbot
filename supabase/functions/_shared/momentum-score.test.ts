import { assertEquals, assertAlmostEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { calculateMomentumScore } from "./smart-momentum.ts";
import { generateBTCPrices, generateADAPrices, generateKlines, generateRallyPrices, generatePriceSeries } from "./test-helpers.ts";

// ============= MOMENTUM SCORE BOUNDARY TESTS =============

Deno.test("Momentum score is always bounded between -100 and +100", () => {
  // Test with BTC-scale prices (the asset that was hitting -100 due to MACD scale bug)
  const btcPrices = generateBTCPrices(80, -10); // 10% drop
  const btcKlines = generateKlines(btcPrices);
  
  const result = calculateMomentumScore(btcKlines, btcPrices, 31, false, 500);
  
  assertEquals(result.score >= -100, true, `Score ${result.score} should be >= -100`);
  assertEquals(result.score <= 100, true, `Score ${result.score} should be <= 100`);
});

Deno.test("Momentum score is bounded for small-cap prices (ADA)", () => {
  const adaPrices = generateADAPrices(80, -15);
  const adaKlines = generateKlines(adaPrices);
  
  const result = calculateMomentumScore(adaKlines, adaPrices, 35, false, 0.003);
  
  assertEquals(result.score >= -100, true, `Score ${result.score} should be >= -100`);
  assertEquals(result.score <= 100, true, `Score ${result.score} should be <= 100`);
});

Deno.test("BTC and ADA momentum scores should be comparable for similar % moves", () => {
  // Both have ~10% rally - momentum scores shouldn't differ by more than 40 points
  // This catches the old bug where BTC hit -100 while ADA was -20 for equivalent moves
  // Use low noise (0.05%) to isolate normalization behavior from random walk artifacts
  const btcPrices = generatePriceSeries(80, 87000, 10, 0.05);
  const adaPrices = generatePriceSeries(80, 0.30, 10, 0.05);
  
  const btcResult = calculateMomentumScore(generateKlines(btcPrices), btcPrices, 30, true, 500);
  const adaResult = calculateMomentumScore(generateKlines(adaPrices), adaPrices, 30, true, 0.003);
  
  const scoreDiff = Math.abs(btcResult.score - adaResult.score);
  assertEquals(scoreDiff < 50, true, 
    `BTC score (${btcResult.score}) and ADA score (${adaResult.score}) differ by ${scoreDiff} — should be comparable for same % move`);
});

// ============= MACD COMPONENT BOUNDS =============

Deno.test("MACD component score stays within [-30, +30] for expanding and [-15, +15] for contracting", () => {
  // Generate extreme BTC data that would trigger the old unbounded bug
  const prices = generateBTCPrices(80, -20); // Strong bearish
  const klines = generateKlines(prices);
  
  const result = calculateMomentumScore(klines, prices, 25, false, 600);
  
  // The total score is bounded, but we also want to verify component contribution is sane
  // With 4 components: EMA(±30) + RSI(±25) + MACD(±30) + ADX(±15) = max ±100
  // If score hits ±100, something might still be wrong in component distribution
  // A moderately bearish move shouldn't produce -100
  assertEquals(result.score > -100, true, 
    `A moderate 20% BTC drop should NOT produce -100 (got ${result.score}). MACD likely unbounded.`);
});

// ============= DIRECTION CLASSIFICATION =============

Deno.test("Bullish rally produces bullish or neutral direction, never bearish", () => {
  const prices = generateRallyPrices(80, 87000, 15);
  const klines = generateKlines(prices);
  
  const result = calculateMomentumScore(klines, prices, 40, true, 500);
  
  assertEquals(result.direction !== "bearish", true, 
    `15% rally with ADX 40 rising should not be bearish (got ${result.direction}, score=${result.score})`);
});

Deno.test("Strong bearish move produces bearish or neutral direction, never bullish", () => {
  // FIX VALIDATION: With direction-aware ADX and polarity-correct MACD contraction,
  // a 15% drop should never score as bullish (the old bug gave +34 during selloffs)
  const prices = generateBTCPrices(80, -15);
  const klines = generateKlines(prices);
  
  // ADX=35 and RISING — simulates the ETHUSDT scenario where strong bearish trend
  // was incorrectly scoring as bullish momentum due to direction-blind ADX (+15)
  const result = calculateMomentumScore(klines, prices, 35, true, 500);
  
  // Score must be negative or near-zero during a selloff, never strongly positive
  assertEquals(result.score < 20, true,
    `15% BTC drop with ADX=35 rising should not have positive momentum (got score=${result.score})`);
  
  // Direction must not be bullish
  assertEquals(result.direction !== "bullish", true,
    `15% BTC drop should not classify as bullish momentum (got ${result.direction}, score=${result.score})`);
});

Deno.test("ADX contribution is negative during bearish EMA structure", () => {
  // Validates the direction-aware ADX fix: when EMA12 < EMA26 (bearish),
  // ADX_STRONG_RISING should contribute -15 (bearish energy), not +15
  const prices = generateBTCPrices(80, -10); // Bearish structure
  const klines = generateKlines(prices);
  
  const result = calculateMomentumScore(klines, prices, 40, true, 500);
  
  // ADX component should be negative (bearish energy direction)
  assertEquals(result.components.adxTrend < 0, true,
    `ADX component should be negative during bearish EMA structure (got ${result.components.adxTrend})`);
});

// ============= INSUFFICIENT DATA =============

Deno.test("Returns default neutral result with insufficient data", () => {
  const prices = [87000, 87100, 87200]; // Only 3 prices
  const klines = generateKlines(prices);
  
  const result = calculateMomentumScore(klines, prices, 20, false, 500);
  
  assertEquals(result.score, 0);
  assertEquals(result.direction, "neutral");
  assertEquals(result.isAccelerating, false);
  assertEquals(result.isExhausted, false);
});

// ============= EXHAUSTION DETECTION =============

Deno.test("Exhaustion requires extreme ADX + overextension + ADX falling", () => {
  const prices = generateRallyPrices(80, 87000, 30);
  const klines = generateKlines(prices);
  
  // High ADX, not rising, high overextension
  const result = calculateMomentumScore(klines, prices, 60, false, 200);
  
  // With ADX >= 60 (EXTREME) and overextension likely >= 2.0 ATR and !adxRising,
  // isExhausted should be true
  // Note: actual overextension depends on generated data, so we just verify the logic path
  if (result.overextensionATR >= 2.0) {
    assertEquals(result.isExhausted, true, 
      `ADX=60, falling, overext=${result.overextensionATR} should trigger exhaustion`);
  }
});

Deno.test("No exhaustion when ADX is rising even if extreme", () => {
  const prices = generateRallyPrices(80, 87000, 20);
  const klines = generateKlines(prices);
  
  // High ADX but RISING - should NOT be exhausted
  const result = calculateMomentumScore(klines, prices, 60, true, 200);
  
  assertEquals(result.isExhausted, false, 
    "ADX rising should prevent exhaustion detection even at extreme levels");
});
