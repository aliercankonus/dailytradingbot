import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============= CENTRALIZED RSI THRESHOLDS =============
// CRITICAL: Keep these aligned across all edge functions to prevent silent drift!
const RSI_THRESHOLDS = {
  OVERSOLD: 30,            // Classic oversold level
  BEARISH_PULLBACK: 35,    // RSI showing bearish weakness / SHORT pullback
  BULLISH_PULLBACK: 40,    // RSI showing bullish pullback opportunity
  NEUTRAL_LOW: 45,         // Lower neutral/pullback zone for momentum continuation
  NEUTRAL: 50,             // Neutral RSI
  NEUTRAL_HIGH: 55,        // Upper neutral/rally zone for SHORT momentum continuation
  BEARISH_RALLY: 60,       // RSI showing bearish rally (SHORT entry opportunity)
  BULLISH_STRONG: 65,      // Strong bullish momentum / overbought warning
  OVERBOUGHT: 70,          // Classic overbought level
} as const;

interface Trade {
  type: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  profit: number;
}

// Built-in strategy configurations
const BUILT_IN_STRATEGIES = {
  'Mean Reversion': {
    indicators: [{ type: 'rsi', period: 14 }],
    entry_conditions: [
      { indicator: 'rsi', comparison: 'below', value: 30 }
    ],
    exit_conditions: [
      { indicator: 'rsi', comparison: 'above', value: 70 }
    ],
    risk_settings: { stopLossPercent: 2, takeProfitPercent: 4, positionSizePercent: 1 }
  },
  'Momentum': {
    indicators: [{ type: 'ema', period: 20 }, { type: 'ema', period: 50 }],
    entry_conditions: [
      { indicator: 'ema_20', comparison: 'above', targetIndicator: 'ema_50' }
    ],
    exit_conditions: [
      { indicator: 'ema_20', comparison: 'below', targetIndicator: 'ema_50' }
    ],
    risk_settings: { stopLossPercent: 3, takeProfitPercent: 6, positionSizePercent: 1 }
  },
  'Grid': {
    indicators: [],
    entry_conditions: [],
    exit_conditions: [],
    risk_settings: { stopLossPercent: 1.5, takeProfitPercent: 1.5, positionSizePercent: 1 }
  }
};

// O(n) optimized RSI calculation
function calculateRSI(prices: number[], period = 14): number {
  if (prices.length < period + 1) return 50;
  
  // Calculate gains and losses for the last period directly without slice()
  const startIdx = prices.length - period;
  let gainSum = 0;
  let lossSum = 0;
  
  for (let i = startIdx; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gainSum += change;
    else lossSum += Math.abs(change);
  }
  
  const avgGain = gainSum / period;
  const avgLoss = lossSum / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// O(n) optimized EMA calculation
function calculateEMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1];
  const k = 2 / (period + 1);
  
  // O(n) initial SMA without slice()
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += prices[i];
  }
  let ema = sum / period;
  
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

// O(n) optimized RSI calculation at specific index without slice()
function calculateRSIWindow(prices: number[], endIdx: number, period = 14): number {
  if (endIdx < period) return 50;
  
  let gainSum = 0;
  let lossSum = 0;
  
  for (let i = endIdx - period + 1; i <= endIdx; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gainSum += change;
    else lossSum += Math.abs(change);
  }
  
  const avgGain = gainSum / period;
  const avgLoss = lossSum / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

async function runBacktest(strategyName: string, config: any, symbol: string, supabase: any) {
  console.log(`Running backtest for ${strategyName} on ${symbol}`);
  
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000); // 90 days

  // Fetch historical data from Binance
  const binanceUrl = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&startTime=${startDate.getTime()}&endTime=${endDate.getTime()}&limit=1000`;
  const response = await fetch(binanceUrl);
  const klines = await response.json();

  if (!Array.isArray(klines) || klines.length === 0) {
    console.log(`No data for ${symbol}`);
    return null;
  }

  const closePrices = klines.map((k: any) => parseFloat(k[4]));
  const trades: Trade[] = [];
  let capital = 10000;
  let position: { type: 'long' | 'short'; entryPrice: number; quantity: number } | null = null;

  // Pre-calculate EMA values incrementally for O(n) total complexity
  const ema20Values: number[] = new Array(closePrices.length).fill(0);
  const ema50Values: number[] = new Array(closePrices.length).fill(0);
  
  // Initialize EMAs
  let sum20 = 0, sum50 = 0;
  for (let i = 0; i < 20 && i < closePrices.length; i++) sum20 += closePrices[i];
  for (let i = 0; i < 50 && i < closePrices.length; i++) sum50 += closePrices[i];
  
  const k20 = 2 / 21, k50 = 2 / 51;
  ema20Values[19] = closePrices.length >= 20 ? sum20 / 20 : closePrices[closePrices.length - 1];
  ema50Values[49] = closePrices.length >= 50 ? sum50 / 50 : closePrices[closePrices.length - 1];
  
  for (let i = 20; i < closePrices.length; i++) {
    ema20Values[i] = closePrices[i] * k20 + ema20Values[i - 1] * (1 - k20);
  }
  for (let i = 50; i < closePrices.length; i++) {
    ema50Values[i] = closePrices[i] * k50 + ema50Values[i - 1] * (1 - k50);
  }

  for (let i = 50; i < closePrices.length; i++) {
    const currentPrice = closePrices[i];

    // Use pre-calculated EMA values and calculate RSI for current window
    const rsi = calculateRSIWindow(closePrices, i, 14);
    const ema20 = ema20Values[i];
    const ema50 = ema50Values[i];

    // Check exit conditions first
    if (position) {
      let shouldExit = false;
      const stopLossPrice = position.type === 'long' 
        ? position.entryPrice * (1 - config.risk_settings.stopLossPercent / 100)
        : position.entryPrice * (1 + config.risk_settings.stopLossPercent / 100);
      const takeProfitPrice = position.type === 'long'
        ? position.entryPrice * (1 + config.risk_settings.takeProfitPercent / 100)
        : position.entryPrice * (1 - config.risk_settings.takeProfitPercent / 100);

      if (position.type === 'long' && (currentPrice <= stopLossPrice || currentPrice >= takeProfitPrice)) {
        shouldExit = true;
      } else if (position.type === 'short' && (currentPrice >= stopLossPrice || currentPrice <= takeProfitPrice)) {
        shouldExit = true;
      }

      // Check strategy exit conditions
      if (strategyName === 'Mean Reversion' && rsi > RSI_THRESHOLDS.OVERBOUGHT) shouldExit = true;
      if (strategyName === 'Momentum' && ema20 < ema50) shouldExit = true;

      if (shouldExit) {
        const profit = position.type === 'long'
          ? (currentPrice - position.entryPrice) * position.quantity
          : (position.entryPrice - currentPrice) * position.quantity;
        
        capital += profit;
        trades.push({
          type: position.type,
          entryPrice: position.entryPrice,
          exitPrice: currentPrice,
          quantity: position.quantity,
          profit
        });
        position = null;
      }
    }

    // Check entry conditions
    if (!position) {
      let shouldEnter = false;
      let entryType: 'long' | 'short' = 'long';

      if (strategyName === 'Mean Reversion' && rsi < RSI_THRESHOLDS.OVERSOLD) {
        shouldEnter = true;
        entryType = 'long';
      } else if (strategyName === 'Momentum' && ema20 > ema50) {
        shouldEnter = true;
        entryType = 'long';
      } else if (strategyName === 'Grid') {
        // Grid strategy: enter on price drops
        if (i > 0 && closePrices[i - 1] > currentPrice * 1.01) {
          shouldEnter = true;
          entryType = 'long';
        }
      }

      if (shouldEnter && capital > 0) {
        const positionSize = capital * (config.risk_settings.positionSizePercent / 100);
        const quantity = positionSize / currentPrice;
        position = { type: entryType, entryPrice: currentPrice, quantity };
      }
    }
  }

  // Calculate metrics
  const winningTrades = trades.filter(t => t.profit > 0).length;
  const losingTrades = trades.filter(t => t.profit <= 0).length;
  const totalProfit = trades.reduce((sum, t) => sum + t.profit, 0);
  const winRate = trades.length > 0 ? (winningTrades / trades.length) * 100 : 0;
  
  // Calculate max drawdown
  let peak = 10000;
  let maxDrawdown = 0;
  let runningCapital = 10000;
  for (const trade of trades) {
    runningCapital += trade.profit;
    if (runningCapital > peak) peak = runningCapital;
    const drawdown = ((peak - runningCapital) / peak) * 100;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  return {
    total_trades: trades.length,
    winning_trades: winningTrades,
    total_profit: totalProfit,
    max_drawdown: maxDrawdown,
    win_rate: winRate
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

    console.log('Updating built-in strategy performance...');

    // Get all built-in strategies from database
    const { data: strategies, error: fetchError } = await supabase
      .from('strategy_performance')
      .select('id, strategy_name');

    if (fetchError) throw fetchError;

    const symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'];
    const updates = [];

    for (const strategy of strategies || []) {
      const strategyName = strategy.strategy_name;
      const config = BUILT_IN_STRATEGIES[strategyName as keyof typeof BUILT_IN_STRATEGIES];
      
      if (!config) {
        console.log(`No configuration found for ${strategyName}`);
        continue;
      }

      // Run backtest on multiple symbols and aggregate results
      const results = [];
      for (const symbol of symbols) {
        const result = await runBacktest(strategyName, config, symbol, supabase);
        if (result) results.push(result);
      }

      if (results.length > 0) {
        // Aggregate results
        const avgTotalTrades = Math.round(results.reduce((sum, r) => sum + r.total_trades, 0) / results.length);
        const avgWinningTrades = Math.round(results.reduce((sum, r) => sum + r.winning_trades, 0) / results.length);
        const avgTotalProfit = results.reduce((sum, r) => sum + r.total_profit, 0) / results.length;
        const avgMaxDrawdown = results.reduce((sum, r) => sum + r.max_drawdown, 0) / results.length;

        updates.push({
          id: strategy.id,
          total_trades: avgTotalTrades,
          winning_trades: avgWinningTrades,
          total_profit: avgTotalProfit,
          max_drawdown: avgMaxDrawdown,
          last_updated: new Date().toISOString()
        });
      }
    }

    // Update all strategies
    for (const update of updates) {
      const { error: updateError } = await supabase
        .from('strategy_performance')
        .update({
          total_trades: update.total_trades,
          winning_trades: update.winning_trades,
          total_profit: update.total_profit,
          max_drawdown: update.max_drawdown,
          last_updated: update.last_updated
        })
        .eq('id', update.id);

      if (updateError) {
        console.error(`Error updating ${update.id}:`, updateError);
      } else {
        console.log(`Updated strategy ${update.id} with ${update.total_trades} trades`);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Strategy performance updated',
        updated: updates.length 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
