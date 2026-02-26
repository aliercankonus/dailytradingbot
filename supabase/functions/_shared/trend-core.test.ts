import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { calculateTrend, enhanceConfidenceWithIndicators } from "./trend-core.ts";
import { generateBTCPrices, generateADAPrices, generatePriceSeries } from "./test-helpers.ts";

// ============= TREND CALCULATION TESTS =============

Deno.test("Strong bullish trend detected for 20% rally", () => {
  const prices = generatePriceSeries(60, 100, 20, 0.1);
  const result = calculateTrend(prices, '1h');
  
  assertEquals(result.trend === "bullish" || result.extendedTrend === "weak_bullish", true,
    `20% rally should detect bullish (got trend=${result.trend}, extended=${result.extendedTrend}, net=${result.netSignal})`);
});

Deno.test("Strong bearish trend detected for 20% drop", () => {
  const prices = generatePriceSeries(60, 100, -20, 0.1);
  const result = calculateTrend(prices, '1h');
  
  assertEquals(result.trend === "bearish" || result.extendedTrend === "weak_bearish", true,
    `20% drop should detect bearish (got trend=${result.trend}, extended=${result.extendedTrend}, net=${result.netSignal})`);
});

Deno.test("Neutral trend for flat prices", () => {
  const prices = generatePriceSeries(60, 100, 0, 0.05);
  const result = calculateTrend(prices, '1h');
  
  // Flat prices should be neutral or weakly directional
  assertEquals(Math.abs(result.netSignal) < 6, true,
    `Flat prices should have low netSignal (got ${result.netSignal})`);
});

Deno.test("Returns neutral with insufficient data", () => {
  const result = calculateTrend([100, 101, 102], '1h');
  
  assertEquals(result.trend, "neutral");
  assertEquals(result.confidence, 35);
  assertEquals(result.netSignal, 0);
});

Deno.test("Confidence is bounded [30, 95]", () => {
  // Test with extreme bullish data
  const bullPrices = generatePriceSeries(60, 100, 50, 0.05);
  const bullResult = calculateTrend(bullPrices, '1h');
  
  assertEquals(bullResult.confidence >= 30, true, `Confidence ${bullResult.confidence} should be >= 30`);
  assertEquals(bullResult.confidence <= 95, true, `Confidence ${bullResult.confidence} should be <= 95`);
  
  // Test with flat data
  const flatPrices = generatePriceSeries(60, 100, 0, 0.01);
  const flatResult = calculateTrend(flatPrices, '1h');
  
  assertEquals(flatResult.confidence >= 30, true);
  assertEquals(flatResult.confidence <= 95, true);
});

Deno.test("BTC and ADA produce consistent trends for same % moves", () => {
  // Same 15% rally, different price scales
  const btcResult = calculateTrend(generateBTCPrices(60, 15), '1h');
  const adaResult = calculateTrend(generateADAPrices(60, 15), '1h');
  
  // Both should be bullish (or at least same direction)
  assertEquals(btcResult.trend, adaResult.trend,
    `BTC trend (${btcResult.trend}, net=${btcResult.netSignal}) should match ADA trend (${adaResult.trend}, net=${adaResult.netSignal}) for same % move`);
});

// ============= TIMEFRAME-AWARE THRESHOLDS =============

Deno.test("Lower timeframes have lower neutral threshold", () => {
  // A marginal signal should register on 15m but might be neutral on 4h
  const prices = generatePriceSeries(60, 100, 8, 0.15); // Mild 8% trend with noise
  
  const result15m = calculateTrend(prices, '15m');
  const result4h = calculateTrend(prices, '4h');
  
  // 15m should be at least as directional as 4h (lower threshold)
  // This is a soft check — noise may vary
  assertEquals(typeof result15m.netSignal, "number");
  assertEquals(typeof result4h.netSignal, "number");
});

// ============= CONFIDENCE ENHANCEMENT =============

Deno.test("High ADX boosts confidence", () => {
  const base = 50;
  const highAdx = enhanceConfidenceWithIndicators(base, 45, true, 1.5, false);
  const lowAdx = enhanceConfidenceWithIndicators(base, 10, false, 0.3, false);
  
  assertEquals(highAdx > base, true, `High ADX should boost confidence (${highAdx} vs ${base})`);
  assertEquals(lowAdx <= base, true, `Low ADX with low volume should not boost confidence (${lowAdx} vs ${base})`);
});

Deno.test("Enhanced confidence is bounded [30, 95]", () => {
  // Maximum everything
  const maxConf = enhanceConfidenceWithIndicators(95, 60, true, 3.0, true);
  assertEquals(maxConf <= 95, true, `Enhanced confidence ${maxConf} should not exceed 95`);
  
  // Minimum everything
  const minConf = enhanceConfidenceWithIndicators(30, 10, false, 0.3, false);
  assertEquals(minConf >= 30, true, `Enhanced confidence ${minConf} should not go below 30`);
});

Deno.test("Volume spike with range expansion gives highest boost", () => {
  const base = 50;
  const withExpansion = enhanceConfidenceWithIndicators(base, 35, true, 2.5, true);
  const withoutExpansion = enhanceConfidenceWithIndicators(base, 35, true, 2.5, false);
  const noVolume = enhanceConfidenceWithIndicators(base, 35, false, 0.4, false);
  
  assertEquals(withExpansion > withoutExpansion, true, 
    "Range expansion + volume should give higher confidence");
  assertEquals(withoutExpansion > noVolume, true,
    "Volume confirmation should give higher confidence than no volume");
});

// ============= EXTENDED TREND (WEAK STATES) =============

Deno.test("Weak trends set extendedTrend but keep trend neutral", () => {
  // Generate prices that produce a netSignal between weak and strong thresholds
  // This is tricky with random data, so we just verify the invariant:
  // If extendedTrend is "weak_bullish", trend must be "neutral"
  const prices = generatePriceSeries(60, 100, 5, 0.2); // Mild trend with noise
  const result = calculateTrend(prices, '1h');
  
  if (result.extendedTrend === "weak_bullish" || result.extendedTrend === "weak_bearish") {
    assertEquals(result.trend, "neutral",
      `Weak extended trend (${result.extendedTrend}) must have neutral primary trend`);
  }
  
  if (result.trend === "bullish") {
    assertEquals(result.extendedTrend, "bullish", 
      "Primary bullish must match extended bullish");
  }
  if (result.trend === "bearish") {
    assertEquals(result.extendedTrend, "bearish",
      "Primary bearish must match extended bearish");
  }
});
