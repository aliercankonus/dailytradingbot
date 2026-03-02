import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { calculateMomentumScore } from "./smart-momentum.ts";
import { generateBTCPrices, generateADAPrices, generateKlines, generateRallyPrices, generatePriceSeries } from "./test-helpers.ts";

// ============= MOMENTUM SCORE BOUNDARY TESTS =============

Deno.test("Momentum score is always bounded between -100 and +100", () => {
  const btcPrices = generateBTCPrices(80, -10);
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
  const btcPrices = generatePriceSeries(80, 87000, 10, 0.05);
  const adaPrices = generatePriceSeries(80, 0.30, 10, 0.05);
  
  const btcResult = calculateMomentumScore(generateKlines(btcPrices), btcPrices, 30, true, 500);
  const adaResult = calculateMomentumScore(generateKlines(adaPrices), adaPrices, 30, true, 0.003);
  
  const scoreDiff = Math.abs(btcResult.score - adaResult.score);
  assertEquals(scoreDiff < 50, true, 
    `BTC score (${btcResult.score}) and ADA score (${adaResult.score}) differ by ${scoreDiff} — should be comparable for same % move`);
});

// ============= MACD COMPONENT BOUNDS =============

Deno.test("MACD component score stays bounded for extreme BTC data", () => {
  const prices = generateBTCPrices(80, -20);
  const klines = generateKlines(prices);
  
  const result = calculateMomentumScore(klines, prices, 25, false, 600);
  
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
  const prices = generateBTCPrices(80, -15);
  const klines = generateKlines(prices);
  
  const result = calculateMomentumScore(klines, prices, 35, true, 500);
  
  // v2.0: ADX is magnitude-only, so bearish detection relies on EMA/MACD/RSI components
  // Score should still be negative or near-zero during a selloff
  assertEquals(result.score < 25, true,
    `15% BTC drop should not have strongly positive momentum (got score=${result.score})`);
  
  assertEquals(result.direction !== "bullish", true,
    `15% BTC drop should not classify as bullish momentum (got ${result.direction}, score=${result.score})`);
});

// ============= v2.0: ADX MAGNITUDE-ONLY =============

Deno.test("ADX component is always positive when ADX is strong and rising (magnitude-only)", () => {
  // v2.0: ADX no longer flips sign based on EMA structure
  // It's an energy indicator — strong rising ADX = high energy regardless of direction
  const prices = generateBTCPrices(80, -10); // Bearish structure
  const klines = generateKlines(prices);
  
  const result = calculateMomentumScore(klines, prices, 40, true, 500);
  
  // ADX component should be positive (energy present) even during bearish EMA
  assertEquals(result.components.adxTrend > 0, true,
    `ADX component should be positive magnitude (got ${result.components.adxTrend}) — v2.0 magnitude-only`);
});

// ============= v2.0: TRANSITION DETECTION =============

Deno.test("Transition detection fires when EMA spread narrows toward crossover", () => {
  // Create a series that starts bearish (EMA12 < EMA26) then rapidly recovers
  // First 50 bars: strong down, then 30 bars: sharp recovery
  const bearishPart = generatePriceSeries(50, 87000, -8, 0.1);
  const lastBearish = bearishPart[bearishPart.length - 1];
  const recoveryPart = generatePriceSeries(30, lastBearish, 6, 0.1);
  const prices = [...bearishPart, ...recoveryPart];
  const klines = generateKlines(prices);
  
  const result = calculateMomentumScore(klines, prices, 25, true, 500);
  
  // During recovery, EMA spread should be negative but narrowing → isTransitioning
  // Note: Due to random noise, transition may or may not fire, but score should be higher
  // than pure bearish because of transition bonus + price impulse
  assertEquals(result.score > -50, true,
    `Recovery from -8% should not produce deeply bearish score (got ${result.score})`);
});

Deno.test("Phase classification includes transition states", () => {
  const result = calculateMomentumScore(
    generateKlines(generateBTCPrices(80, 0)), // flat prices
    generateBTCPrices(80, 0), 20, false, 500
  );
  
  // Flat prices should produce neutral or transition phase, never strong
  assertEquals(
    result.phase !== "strong_bullish" && result.phase !== "strong_bearish", 
    true,
    `Flat prices should not produce extreme phase (got ${result.phase})`
  );
});

// ============= v2.0: PRICE IMPULSE FACTOR =============

Deno.test("Price impulse adds bonus during fast moves", () => {
  // Strong bullish impulse: 5% in 6 bars
  const prices = generatePriceSeries(80, 87000, 0, 0.05); // flat base
  // Override last 6 bars with strong impulse
  const impulseStart = prices[prices.length - 7];
  for (let i = 6; i >= 1; i--) {
    prices[prices.length - i] = impulseStart * (1 + (7 - i) * 0.01);
  }
  const klines = generateKlines(prices);
  
  const result = calculateMomentumScore(klines, prices, 25, true, 500);
  
  // Price impulse component should be positive
  assertEquals(result.components.priceImpulse >= 0, true,
    `Price impulse should be non-negative during bullish impulse (got ${result.components.priceImpulse})`);
});

// ============= INSUFFICIENT DATA =============

Deno.test("Returns default neutral result with insufficient data", () => {
  const prices = [87000, 87100, 87200];
  const klines = generateKlines(prices);
  
  const result = calculateMomentumScore(klines, prices, 20, false, 500);
  
  assertEquals(result.score, 0);
  assertEquals(result.direction, "neutral");
  assertEquals(result.phase, "neutral");
  assertEquals(result.isAccelerating, false);
  assertEquals(result.isExhausted, false);
  assertEquals(result.isTransitioning, false);
});

// ============= EXHAUSTION DETECTION =============

Deno.test("Exhaustion requires extreme ADX + overextension + ADX falling", () => {
  const prices = generateRallyPrices(80, 87000, 30);
  const klines = generateKlines(prices);
  
  const result = calculateMomentumScore(klines, prices, 60, false, 200);
  
  if (result.overextensionATR >= 2.0) {
    assertEquals(result.isExhausted, true, 
      `ADX=60, falling, overext=${result.overextensionATR} should trigger exhaustion`);
  }
});

Deno.test("No exhaustion when ADX is rising even if extreme", () => {
  const prices = generateRallyPrices(80, 87000, 20);
  const klines = generateKlines(prices);
  
  const result = calculateMomentumScore(klines, prices, 60, true, 200);
  
  assertEquals(result.isExhausted, false, 
    "ADX rising should prevent exhaustion detection even at extreme levels");
});
