import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Calculate EMA
function calculateEMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1] || 0;
  
  const multiplier = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }
  
  return ema;
}

// Calculate RSI
function calculateRSI(prices: number[], period = 14): number {
  if (prices.length < period + 1) return 50;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  const rs = avgGain / (avgLoss || 1);
  return 100 - (100 / (1 + rs));
}

// Calculate MACD
function calculateMACD(prices: number[]): { macd: number; signal: number; histogram: number } {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const macd = ema12 - ema26;
  
  // Calculate signal line (9-period EMA of MACD)
  const macdValues: number[] = [];
  for (let i = 26; i < prices.length; i++) {
    const shortEma = calculateEMA(prices.slice(0, i + 1), 12);
    const longEma = calculateEMA(prices.slice(0, i + 1), 26);
    macdValues.push(shortEma - longEma);
  }
  
  const signal = macdValues.length >= 9 ? calculateEMA(macdValues, 9) : macd * 0.9;
  const histogram = macd - signal;
  
  return { macd, signal, histogram };
}

// Fetch Binance klines with configurable interval
async function fetchBinanceKlines(symbol: string, interval: string = '1h', limit: number = 100): Promise<any[]> {
  try {
    const response = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
    );
    
    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status}`);
    }
    
    const klines = await response.json();
    return klines;
  } catch (error) {
    console.error(`Failed to fetch Binance klines for ${symbol} on ${interval}:`, error);
    throw error;
  }
}

// Validate market structure (higher highs/higher lows for bullish, etc.)
function validateMarketStructure(klines: any[], trend: 'bullish' | 'bearish' | 'neutral'): { valid: boolean; confidence: number } {
  if (klines.length < 10) return { valid: false, confidence: 0 };
  
  const highs = klines.slice(-10).map((k: any) => parseFloat(k[2])); // high prices
  const lows = klines.slice(-10).map((k: any) => parseFloat(k[3])); // low prices
  
  if (trend === 'bullish') {
    // Check for higher highs and higher lows
    let higherHighs = 0;
    let higherLows = 0;
    
    for (let i = 1; i < highs.length; i++) {
      if (highs[i] > highs[i - 1]) higherHighs++;
      if (lows[i] > lows[i - 1]) higherLows++;
    }
    
    const hhPercent = (higherHighs / (highs.length - 1)) * 100;
    const hlPercent = (higherLows / (lows.length - 1)) * 100;
    const structureScore = (hhPercent + hlPercent) / 2;
    
    return { valid: structureScore > 50, confidence: structureScore };
  } else if (trend === 'bearish') {
    // Check for lower highs and lower lows
    let lowerHighs = 0;
    let lowerLows = 0;
    
    for (let i = 1; i < highs.length; i++) {
      if (highs[i] < highs[i - 1]) lowerHighs++;
      if (lows[i] < lows[i - 1]) lowerLows++;
    }
    
    const lhPercent = (lowerHighs / (highs.length - 1)) * 100;
    const llPercent = (lowerLows / (lows.length - 1)) * 100;
    const structureScore = (lhPercent + llPercent) / 2;
    
    return { valid: structureScore > 50, confidence: structureScore };
  }
  
  return { valid: false, confidence: 0 };
}

// Calculate comprehensive trend using multiple indicators
function calculateTrend(prices: number[]): {
  trend: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  indicators: {
    ema12: number;
    ema26: number;
    emaSignal: string;
    rsi: number;
    rsiSignal: string;
    macd: number;
    macdSignal: number;
    macdHistogram: number;
    macdTrend: string;
  };
} {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const rsi = calculateRSI(prices, 14);
  const { macd, signal, histogram } = calculateMACD(prices);
  
  let bullishSignals = 0;
  let bearishSignals = 0;
  let totalWeight = 0;
  
  // EMA Crossover Analysis (Weight: 3)
  const emaWeight = 3;
  let emaSignal = 'neutral';
  if (ema12 > ema26) {
    const emaDiff = ((ema12 - ema26) / ema26) * 100;
    if (emaDiff > 0.1) {
      bullishSignals += emaWeight;
      emaSignal = 'bullish';
    }
  } else if (ema12 < ema26) {
    const emaDiff = ((ema26 - ema12) / ema26) * 100;
    if (emaDiff > 0.1) {
      bearishSignals += emaWeight;
      emaSignal = 'bearish';
    }
  }
  totalWeight += emaWeight;
  
  // RSI Analysis (Weight: 2)
  const rsiWeight = 2;
  let rsiSignal = 'neutral';
  if (rsi > 60) {
    bullishSignals += rsiWeight * ((rsi - 60) / 40);
    rsiSignal = rsi > 70 ? 'overbought' : 'bullish';
  } else if (rsi < 40) {
    bearishSignals += rsiWeight * ((40 - rsi) / 40);
    rsiSignal = rsi < 30 ? 'oversold' : 'bearish';
  } else {
    rsiSignal = 'neutral';
  }
  totalWeight += rsiWeight;
  
  // MACD Analysis (Weight: 3)
  const macdWeight = 3;
  let macdTrend = 'neutral';
  if (histogram > 0) {
    const macdStrength = Math.min(Math.abs(histogram) / Math.abs(macd || 1), 1);
    bullishSignals += macdWeight * macdStrength;
    macdTrend = 'bullish';
  } else if (histogram < 0) {
    const macdStrength = Math.min(Math.abs(histogram) / Math.abs(macd || 1), 1);
    bearishSignals += macdWeight * macdStrength;
    macdTrend = 'bearish';
  }
  totalWeight += macdWeight;
  
  // Calculate confidence and determine trend
  const netSignal = bullishSignals - bearishSignals;
  
  // More realistic confidence calculation
  // Max score is 8 (all indicators aligned), confidence scales from 40-90%
  const rawConfidence = (Math.abs(netSignal) / totalWeight) * 100;
  
  // Apply non-linear scaling to avoid extreme values
  // This ensures confidence stays in 40-90% range for normal conditions
  let confidence = 40 + (rawConfidence * 0.5); // Scale to 40-90% range
  confidence = Math.min(Math.max(confidence, 40), 90); // Clamp between 40-90%
  
  let trend: 'bullish' | 'bearish' | 'neutral';
  
  // Require stronger signals for trend classification
  if (netSignal > 2) {
    trend = 'bullish';
  } else if (netSignal < -2) {
    trend = 'bearish';
  } else {
    trend = 'neutral';
  }
  
  return {
    trend,
    confidence: Math.round(confidence),
    indicators: {
      ema12: Math.round(ema12 * 100) / 100,
      ema26: Math.round(ema26 * 100) / 100,
      emaSignal,
      rsi: Math.round(rsi * 100) / 100,
      rsiSignal,
      macd: Math.round(macd * 100) / 100,
      macdSignal: Math.round(signal * 100) / 100,
      macdHistogram: Math.round(histogram * 100) / 100,
      macdTrend,
    },
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol } = await req.json();
    if (!symbol) throw new Error('Symbol is required');

    console.log(`Multi-timeframe analysis for ${symbol}`);

    // Fetch multiple timeframes in parallel
    const [klines5m, klines15m, klines1h, klines4h] = await Promise.all([
      fetchBinanceKlines(symbol, '5m', 100),
      fetchBinanceKlines(symbol, '15m', 100),
      fetchBinanceKlines(symbol, '1h', 100),
      fetchBinanceKlines(symbol, '4h', 50),
    ]);

    // Extract close prices for each timeframe
    const prices5m = klines5m.map((k: any) => parseFloat(k[4]));
    const prices15m = klines15m.map((k: any) => parseFloat(k[4]));
    const prices1h = klines1h.map((k: any) => parseFloat(k[4]));
    const prices4h = klines4h.map((k: any) => parseFloat(k[4]));
    const currentPrice = prices1h[prices1h.length - 1];

    // Calculate trend for each timeframe
    const trend5m = calculateTrend(prices5m);
    const trend15m = calculateTrend(prices15m);
    const trend1h = calculateTrend(prices1h);
    const trend4h = calculateTrend(prices4h);

    // ============================================================
    // HIGHER TIMEFRAME DOMINANT WEIGHTING SYSTEM
    // 4h = 80% weight, 1h = 15%, 15m = 3%, 5m = 2%
    // ============================================================
    
    // CRITICAL: 4h timeframe determines primary direction (80% weight)
    const dominantTrend = trend4h.trend;
    const dominantConfidence = trend4h.confidence;
    
    // 1h must confirm 4h for high-quality signals (15% weight)
    const confirmation1h = trend1h.trend === dominantTrend;
    const confirmation15m = trend15m.trend === dominantTrend;
    const confirmation5m = trend5m.trend === dominantTrend;
    
    // Calculate weighted trend consistency
    const weightedConsistency = 
      (dominantConfidence * 0.80) +  // 4h: 80%
      (confirmation1h ? trend1h.confidence * 0.15 : 0) +  // 1h: 15%
      (confirmation15m ? trend15m.confidence * 0.03 : 0) +  // 15m: 3%
      (confirmation5m ? trend5m.confidence * 0.02 : 0);    // 5m: 2%
    
    // High timeframe alignment: 4h + 1h must agree for valid signals
    const highTimeframeAligned = dominantTrend !== 'neutral' && confirmation1h;
    
    let primaryTrend: 'bullish' | 'bearish' | 'neutral' | 'ranging' = dominantTrend;
    
    // ============================================================
    // RANGING MARKET DETECTION
    // ============================================================
    const atrPeriod = 14;
    const atrKlines = klines1h.slice(-atrPeriod - 1);
    let atrSum = 0;
    for (let i = 1; i < atrKlines.length; i++) {
      const high = parseFloat(atrKlines[i][2]);
      const low = parseFloat(atrKlines[i][3]);
      const prevClose = parseFloat(atrKlines[i - 1][4]);
      const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
      atrSum += tr;
    }
    const atr = atrSum / atrPeriod;
    const atrPercent = (atr / currentPrice) * 100;
    
    // Market is ranging if ATR < 2% (too tight for reliable directional trading)
    const isRanging = atrPercent < 2.0;
    const volatilityNormal = atrPercent >= 2.0 && atrPercent < 5.0;
    
    if (isRanging) {
      primaryTrend = 'ranging';
      console.log(`${symbol}: RANGING MARKET DETECTED (ATR: ${atrPercent.toFixed(2)}%) - skipping signals`);
    }

    // ============================================================
    // PULLBACK DETECTION
    // ============================================================
    let inPullback = false;
    let pullbackPercent = 0;
    
    if (dominantTrend === 'bullish' || dominantTrend === 'bearish') {
      // Find recent swing high/low over last 24 candles (24 hours on 1h chart)
      const recentKlines = klines1h.slice(-24);
      const recentHighs = recentKlines.map((k: any) => parseFloat(k[2]));
      const recentLows = recentKlines.map((k: any) => parseFloat(k[3]));
      
      if (dominantTrend === 'bullish') {
        // For bullish trend, check if we're pulling back from recent high
        const swingHigh = Math.max(...recentHighs);
        const swingLow = Math.min(...recentLows.slice(-12)); // Low from last 12 hours
        const range = swingHigh - swingLow;
        const pullback = swingHigh - currentPrice;
        pullbackPercent = (pullback / range) * 100;
        
        // Ideal entry: 30-50% retracement
        inPullback = pullbackPercent >= 30 && pullbackPercent <= 60;
      } else if (dominantTrend === 'bearish') {
        // For bearish trend, check if we're pulling back from recent low
        const swingLow = Math.min(...recentLows);
        const swingHigh = Math.max(...recentHighs.slice(-12)); // High from last 12 hours
        const range = swingHigh - swingLow;
        const pullback = currentPrice - swingLow;
        pullbackPercent = (pullback / range) * 100;
        
        // Ideal entry: 30-50% retracement
        inPullback = pullbackPercent >= 30 && pullbackPercent <= 60;
      }
    }

    // ============================================================
    // MOMENTUM CONFIRMATION (2-3 consecutive candles)
    // ============================================================
    const recentKlines = klines1h.slice(-3);
    let consecutiveBullish = 0;
    let consecutiveBearish = 0;
    
    for (let i = 0; i < recentKlines.length; i++) {
      const open = parseFloat(recentKlines[i][1]);
      const close = parseFloat(recentKlines[i][4]);
      if (close > open) consecutiveBullish++;
      if (close < open) consecutiveBearish++;
    }
    
    const momentumBuilding = 
      (dominantTrend === 'bullish' && consecutiveBullish >= 2) ||
      (dominantTrend === 'bearish' && consecutiveBearish >= 2);
    
    // MACD histogram must be expanding
    const macdHistogram = trend1h.indicators.macdHistogram;
    const momentumConfirms = Math.abs(macdHistogram) > 0.01 && momentumBuilding;

    // Validate market structure on 1h timeframe
    const marketStructure = validateMarketStructure(klines1h, trend1h.trend);

    console.log(`${symbol}: 4h=${trend4h.trend} 1h=${trend1h.trend} aligned=${highTimeframeAligned} pullback=${inPullback}(${pullbackPercent.toFixed(1)}%) momentum=${momentumConfirms} ranging=${isRanging}`);

    return new Response(JSON.stringify({
      symbol, 
      currentPrice, 
      trend: primaryTrend, 
      confidence: Math.round(weightedConsistency),
      
      // Higher timeframe dominance
      higherTimeframeFilter: {
        trend4h: trend4h.trend,
        trend1h: trend1h.trend,
        aligned: highTimeframeAligned,
        dominantConfidence: dominantConfidence,
        weightedConsistency: Math.round(weightedConsistency),
      },
      
      // Pullback detection
      pullback: {
        inPullback,
        pullbackPercent: Math.round(pullbackPercent * 10) / 10,
        ideal: inPullback && pullbackPercent >= 30 && pullbackPercent <= 50,
      },
      
      // Ranging detection
      ranging: {
        isRanging,
        atrPercent: Math.round(atrPercent * 100) / 100,
        safe: atrPercent >= 2.0 && atrPercent <= 5.0,
      },
      
      // Momentum confirmation
      momentum: { 
        confirms: momentumConfirms,
        building: momentumBuilding,
        consecutiveBullish,
        consecutiveBearish,
        macdHistogram: Math.round(macdHistogram * 1000) / 1000,
      },
      
      // Multi-timeframe details
      multiTimeframe: {
        trend5m: trend5m.trend, 
        trend15m: trend15m.trend,
        trend1h: trend1h.trend, 
        trend4h: trend4h.trend, 
        confidence5m: trend5m.confidence,
        confidence15m: trend15m.confidence, 
        confidence1h: trend1h.confidence, 
        confidence4h: trend4h.confidence,
      },
      
      marketStructure: { 
        valid: marketStructure.valid, 
        confidence: Math.round(marketStructure.confidence) 
      },
      
      volatility: { 
        atr, 
        atrPercent: Math.round(atrPercent * 100) / 100, 
        normal: volatilityNormal 
      },
      
      indicators: trend1h.indicators, 
      trendConsistency: Math.round(weightedConsistency),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error('Error in calculate-trend:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
