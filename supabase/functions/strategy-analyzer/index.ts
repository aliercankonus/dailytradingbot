import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MarketData {
  symbol: string;
  lastPrice: string;
  priceChange: string;
  priceChangePercent: string;
  volume: string;
  highPrice: string;
  lowPrice: string;
}

// Calculate RSI
function calculateRSI(prices: number[], period = 14): number {
  if (prices.length < period) return 50;
  
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

// Calculate ATR (Average True Range)
function calculateATR(high: number, low: number, close: number): number {
  return (high - low) / close;
}

// Detect trend based on price action
function detectTrend(data: MarketData): 'bullish' | 'bearish' | 'ranging' {
  const changePercent = parseFloat(data.priceChangePercent);
  const volumeRatio = parseFloat(data.volume) / 1000000; // Normalized volume
  
  if (changePercent > 2 && volumeRatio > 50) return 'bullish';
  if (changePercent < -2 && volumeRatio > 50) return 'bearish';
  return 'ranging';
}

// Analyze market and generate signals
function analyzeMarket(data: MarketData) {
  const currentPrice = parseFloat(data.lastPrice);
  const changePercent = parseFloat(data.priceChangePercent);
  const volume = parseFloat(data.volume);
  const high = parseFloat(data.highPrice);
  const low = parseFloat(data.lowPrice);
  
  // Simulate RSI calculation (in production, would use historical data)
  const rsi = 50 + (changePercent * 2); // Simplified
  
  // Calculate ATR
  const atr = calculateATR(high, low, currentPrice);
  
  // Detect trend
  const trend = detectTrend(data);
  
  // Volume confirmation (check if above average)
  const volumeConfirmed = volume > 1000000;
  
  // Count confirmations
  let confirmations = 0;
  let signals: string[] = [];
  
  // Trend confirmation
  if (trend !== 'ranging') {
    confirmations++;
    signals.push(`${trend} trend detected`);
  }
  
  // Volume confirmation
  if (volumeConfirmed) {
    confirmations++;
    signals.push('Volume confirms movement');
  }
  
  // RSI confirmation
  if ((trend === 'bullish' && rsi < 60) || (trend === 'bearish' && rsi > 40)) {
    confirmations++;
    signals.push(`RSI at ${rsi.toFixed(1)}`);
  }
  
  // Generate signal
  let signalType: 'long' | 'short' | 'hold' = 'hold';
  let reason = 'Waiting for 3+ confirmations';
  
  if (confirmations >= 3) {
    if (trend === 'bullish' && rsi < 60 && volumeConfirmed) {
      signalType = 'long';
      reason = `Strong bullish setup: ${signals.join(', ')}`;
    } else if (trend === 'bearish' && rsi > 40 && volumeConfirmed) {
      signalType = 'short';
      reason = `Strong bearish setup: ${signals.join(', ')}`;
    }
  }
  
  // Calculate stop loss and take profit
  const stopLossPercent = 1.5 * (atr * 100);
  const stopLoss = signalType === 'long' 
    ? currentPrice * (1 - stopLossPercent / 100)
    : currentPrice * (1 + stopLossPercent / 100);
    
  const riskRewardRatio = 2.0;
  const takeProfit = signalType === 'long'
    ? currentPrice + (currentPrice - stopLoss) * riskRewardRatio
    : currentPrice - (stopLoss - currentPrice) * riskRewardRatio;
  
  return {
    symbol: data.symbol,
    signalType,
    trend,
    entryPrice: currentPrice,
    stopLoss,
    takeProfit,
    riskRewardRatio,
    confidenceScore: Math.min(confirmations * 25, 100),
    indicators: {
      rsi: rsi.toFixed(2),
      atr: atr.toFixed(4),
      volume,
      changePercent,
      confirmations
    },
    reason
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch current market data
    const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'ADAUSDT'];
    const marketDataPromises = symbols.map(async (symbol) => {
      const response = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);
      return response.json();
    });

    const marketData = await Promise.all(marketDataPromises);
    
    // Analyze each market and generate signals
    const signals = marketData.map(data => analyzeMarket(data));
    
    // Store signals in database
    for (const signal of signals) {
      await supabase.from('trading_signals').insert({
        symbol: signal.symbol,
        signal_type: signal.signalType,
        trend: signal.trend,
        entry_price: signal.entryPrice,
        stop_loss: signal.stopLoss,
        take_profit: signal.takeProfit,
        risk_reward_ratio: signal.riskRewardRatio,
        confidence_score: signal.confidenceScore,
        indicators: signal.indicators,
        reason: signal.reason
      });
    }

    // Clean up old signals
    await supabase
      .from('trading_signals')
      .delete()
      .lt('expires_at', new Date().toISOString());

    return new Response(
      JSON.stringify({ 
        success: true, 
        signals,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error) {
    console.error('Error in strategy-analyzer:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
