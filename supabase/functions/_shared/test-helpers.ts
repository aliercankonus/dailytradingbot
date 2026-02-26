// ============= TEST DATA GENERATORS =============
// Shared helpers for generating realistic price/kline data for tests

/**
 * Generate a synthetic price series with a trend
 * @param length Number of prices
 * @param startPrice Starting price
 * @param trendPercent Total % move over the series (positive = up, negative = down)
 * @param noisePercent Random noise as % of price per bar
 */
export function generatePriceSeries(
  length: number,
  startPrice: number,
  trendPercent: number = 0,
  noisePercent: number = 0.3
): number[] {
  const prices: number[] = [];
  const stepPct = trendPercent / length / 100;
  let price = startPrice;
  
  for (let i = 0; i < length; i++) {
    const noise = (Math.random() - 0.5) * 2 * (noisePercent / 100) * price;
    price = price * (1 + stepPct) + noise;
    prices.push(Math.max(price, 0.0001)); // Prevent negative prices
  }
  return prices;
}

/**
 * Generate synthetic klines (OHLCV) from a price series
 */
export function generateKlines(
  prices: number[],
  baseVolume: number = 1000
): any[] {
  return prices.map((close, i) => {
    const open = i > 0 ? prices[i - 1] : close * 0.999;
    const high = Math.max(open, close) * (1 + Math.random() * 0.005);
    const low = Math.min(open, close) * (1 - Math.random() * 0.005);
    const volume = baseVolume * (0.5 + Math.random());
    return [
      Date.now() - (prices.length - i) * 3600000, // openTime
      open.toString(),    // open
      high.toString(),    // high
      low.toString(),     // low
      close.toString(),   // close
      volume.toString(),  // volume
      Date.now() - (prices.length - i) * 3600000 + 3599999, // closeTime
      (close * volume).toString(), // quoteVolume
      Math.floor(100 + Math.random() * 50), // trades
      (volume * 0.5).toString(), // takerBuyBaseVolume
      (close * volume * 0.5).toString(), // takerBuyQuoteVolume
      "0" // ignore
    ];
  });
}

/**
 * Generate a strong bullish rally price series (for testing exhaustion/momentum)
 */
export function generateRallyPrices(
  length: number,
  startPrice: number,
  rallyPercent: number
): number[] {
  // First 60% is mild uptrend, last 40% is strong rally
  const mildLen = Math.floor(length * 0.6);
  const rallyLen = length - mildLen;
  const mildPart = generatePriceSeries(mildLen, startPrice, rallyPercent * 0.2, 0.1);
  const lastMild = mildPart[mildPart.length - 1];
  const rallyPart = generatePriceSeries(rallyLen, lastMild, rallyPercent * 0.8, 0.1);
  return [...mildPart, ...rallyPart];
}

/**
 * Generate a BTC-scale price series (~$87K)
 */
export function generateBTCPrices(length: number, trendPercent: number = 0): number[] {
  return generatePriceSeries(length, 87000, trendPercent, 0.2);
}

/**
 * Generate an ADA-scale price series (~$0.30)
 */
export function generateADAPrices(length: number, trendPercent: number = 0): number[] {
  return generatePriceSeries(length, 0.30, trendPercent, 0.3);
}
