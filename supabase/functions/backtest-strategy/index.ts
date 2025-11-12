import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Trade {
  entryPrice: number;
  exitPrice: number;
  type: 'long' | 'short';
  profit: number;
  profitPercent: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol, startDate, endDate, initialCapital, strategyName } = await req.json();
    console.log('Backtest request:', { symbol, startDate, endDate, strategyName });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch historical kline data from Binance
    const startTime = new Date(startDate).getTime();
    const endTime = new Date(endDate).getTime();
    
    const klinesResponse = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&startTime=${startTime}&endTime=${endTime}&limit=1000`
    );

    if (!klinesResponse.ok) {
      throw new Error('Failed to fetch historical data');
    }

    const klines = await klinesResponse.json();
    const trades: Trade[] = [];
    let capital = initialCapital;
    let position: { type: 'long' | 'short'; entryPrice: number; stopLoss: number; takeProfit: number } | null = null;
    let consecutiveLosses = 0;
    let maxDrawdown = 0;
    let peakCapital = initialCapital;

    // Helper functions
    const calculateRSI = (prices: number[], period = 14) => {
      if (prices.length < period) return 50;
      let gains = 0;
      let losses = 0;
      for (let i = 1; i < period; i++) {
        const change = prices[i] - prices[i - 1];
        if (change > 0) gains += change;
        else losses += Math.abs(change);
      }
      const avgGain = gains / period;
      const avgLoss = losses / period;
      const rs = avgGain / avgLoss;
      return 100 - (100 / (1 + rs));
    };

    const detectTrend = (priceChange: number, volume: number, avgVolume: number) => {
      if (priceChange > 2 && volume > avgVolume * 1.2) return 'bullish';
      if (priceChange < -2 && volume > avgVolume * 1.2) return 'bearish';
      return 'ranging';
    };

    // Process historical data
    for (let i = 50; i < klines.length; i++) {
      const [timestamp, open, high, low, close, volume] = klines[i];
      const currentPrice = parseFloat(close);
      const priceChange = ((currentPrice - parseFloat(klines[i - 1][4])) / parseFloat(klines[i - 1][4])) * 100;
      
      const recentPrices = klines.slice(i - 14, i).map((k: any) => parseFloat(k[4]));
      const rsi = calculateRSI(recentPrices);
      
      const recentVolumes = klines.slice(i - 20, i).map((k: any) => parseFloat(k[5]));
      const avgVolume = recentVolumes.reduce((a: number, b: number) => a + b, 0) / recentVolumes.length;
      const trend = detectTrend(priceChange, parseFloat(volume), avgVolume);

      // Check if position should be closed
      if (position) {
        const currentPnL = position.type === 'long'
          ? ((currentPrice - position.entryPrice) / position.entryPrice) * 100
          : ((position.entryPrice - currentPrice) / position.entryPrice) * 100;

        // Close position if stop-loss or take-profit hit
        if (
          (position.type === 'long' && (currentPrice <= position.stopLoss || currentPrice >= position.takeProfit)) ||
          (position.type === 'short' && (currentPrice >= position.stopLoss || currentPrice <= position.takeProfit))
        ) {
          const profit = (capital * currentPnL) / 100;
          const profitPercent = currentPnL;

          trades.push({
            entryPrice: position.entryPrice,
            exitPrice: currentPrice,
            type: position.type,
            profit,
            profitPercent,
          });

          capital += profit;
          
          if (profit < 0) {
            consecutiveLosses++;
          } else {
            consecutiveLosses = 0;
          }

          // Track drawdown
          if (capital > peakCapital) {
            peakCapital = capital;
          }
          const drawdown = ((peakCapital - capital) / peakCapital) * 100;
          if (drawdown > maxDrawdown) {
            maxDrawdown = drawdown;
          }

          position = null;
        }
      }

      // Entry signals
      if (!position && i < klines.length - 1) {
        const highPrice = parseFloat(high);
        const lowPrice = parseFloat(low);
        const atr = (highPrice - lowPrice) / currentPrice;

        let confirmations = 0;
        let signalType: 'long' | 'short' | null = null;

        // Long signal
        if (trend === 'bullish' && rsi < 60 && parseFloat(volume) > avgVolume * 1.1) {
          confirmations = 3;
          signalType = 'long';
        }

        // Short signal
        if (trend === 'bearish' && rsi > 40 && parseFloat(volume) > avgVolume * 1.1) {
          confirmations = 3;
          signalType = 'short';
        }

        if (confirmations >= 3 && signalType) {
          // Apply position size reduction if consecutive losses
          let positionSize = 1.0;
          if (consecutiveLosses >= 3) {
            positionSize *= 0.5;
          }

          const stopLoss = signalType === 'long'
            ? currentPrice * (1 - atr * 1.5)
            : currentPrice * (1 + atr * 1.5);
          
          const stopLossDistance = Math.abs(currentPrice - stopLoss);
          const takeProfit = signalType === 'long'
            ? currentPrice + (stopLossDistance * 2)
            : currentPrice - (stopLossDistance * 2);

          position = {
            type: signalType,
            entryPrice: currentPrice,
            stopLoss,
            takeProfit,
          };
        }
      }
    }

    // Calculate statistics
    const totalTrades = trades.length;
    const winningTrades = trades.filter(t => t.profit > 0).length;
    const losingTrades = trades.filter(t => t.profit < 0).length;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    const totalProfit = trades.filter(t => t.profit > 0).reduce((sum, t) => sum + t.profit, 0);
    const totalLoss = Math.abs(trades.filter(t => t.profit < 0).reduce((sum, t) => sum + t.profit, 0));
    const netProfit = capital - initialCapital;
    const avgWin = winningTrades > 0 ? totalProfit / winningTrades : 0;
    const avgLoss = losingTrades > 0 ? totalLoss / losingTrades : 0;
    const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : 0;
    const largestWin = trades.length > 0 ? Math.max(...trades.map(t => t.profit)) : 0;
    const largestLoss = trades.length > 0 ? Math.min(...trades.map(t => t.profit)) : 0;

    // Calculate Sharpe ratio (simplified)
    const returns = trades.map(t => t.profitPercent);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const stdDev = Math.sqrt(
      returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
    );
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

    // Store results
    const { data: backtestResult } = await supabase
      .from('backtesting_results')
      .insert({
        strategy_name: strategyName,
        symbol,
        start_date: startDate,
        end_date: endDate,
        initial_capital: initialCapital,
        final_capital: capital,
        total_trades: totalTrades,
        winning_trades: winningTrades,
        losing_trades: losingTrades,
        win_rate: winRate,
        total_profit: totalProfit,
        total_loss: totalLoss,
        net_profit: netProfit,
        max_drawdown: maxDrawdown,
        sharpe_ratio: sharpeRatio,
        profit_factor: profitFactor,
        avg_win: avgWin,
        avg_loss: avgLoss,
        largest_win: largestWin,
        largest_loss: largestLoss,
        results_data: { trades },
      })
      .select()
      .single();

    return new Response(
      JSON.stringify({
        success: true,
        results: backtestResult,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error running backtest:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});