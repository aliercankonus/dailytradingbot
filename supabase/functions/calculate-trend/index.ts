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

// Fetch Binance klines - return full kline data for ATR calculation
async function fetchBinanceKlines(symbol: string, limit: number = 100): Promise<any[]> {
  try {
    const response = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1m&limit=${limit}`
    );
    
    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status}`);
    }
    
    const klines = await response.json();
    return klines;
  } catch (error) {
    console.error(`Failed to fetch Binance klines for ${symbol}:`, error);
    throw error;
  }
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
  const confidence = Math.min((Math.abs(netSignal) / totalWeight) * 100, 100);
  
  let trend: 'bullish' | 'bearish' | 'neutral';
  if (netSignal > 1) {
    trend = 'bullish';
  } else if (netSignal < -1) {
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
    
    if (!symbol) {
      return new Response(
        JSON.stringify({ error: 'Symbol is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Calculating trend for ${symbol}`);
    
    // Fetch last 100 1-minute candles
    const klines = await fetchBinanceKlines(symbol, 100);
    const prices = klines.map((k: any) => parseFloat(k[4])); // close prices
    
    // Calculate trend using technical indicators
    const trendData = calculateTrend(prices);
    
    // Calculate ATR (Average True Range) for volatility-based stop loss
    const atrPeriod = 14;
    let atrSum = 0;
    for (let i = klines.length - atrPeriod; i < klines.length - 1; i++) {
      const high = parseFloat(klines[i][2]);
      const low = parseFloat(klines[i][3]);
      const prevClose = parseFloat(klines[i - 1][4]);
      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      atrSum += tr;
    }
    const atr = atrSum / atrPeriod;
    const currentPrice = prices[prices.length - 1];
    const atrPercent = (atr / currentPrice) * 100;

    // Check if recent price movements align with current trend
    // Look at last 10 periods (10 minutes) for consistency
    let consistentPeriods = 0;
    const periodsToCheck = Math.min(10, prices.length - 1);
    
    for (let i = prices.length - periodsToCheck; i < prices.length; i++) {
      const periodChange = ((prices[i] - prices[i - 1]) / prices[i - 1]) * 100;
      
      // Check if price movement aligns with current trend
      if (trendData.trend === 'bullish' && periodChange > 0) {
        consistentPeriods++;
      } else if (trendData.trend === 'bearish' && periodChange < 0) {
        consistentPeriods++;
      } else if (trendData.trend === 'neutral' && Math.abs(periodChange) < 0.3) {
        consistentPeriods++;
      }
    }

    // Calculate trend consistency as percentage
    const trendConsistency = Math.round((consistentPeriods / periodsToCheck) * 100);
    
    console.log(`Trend for ${symbol}: ${trendData.trend} (confidence: ${trendData.confidence}%, consistency: ${trendConsistency}%, ATR: ${atrPercent.toFixed(2)}%)`);
    
    return new Response(
      JSON.stringify({
        symbol,
        currentPrice,
        ...trendData,
        atr: Math.round(atr * 100) / 100,
        atrPercent: Math.round(atrPercent * 100) / 100,
        trendConsistency,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error calculating trend:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Failed to calculate trend' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
