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
  timestamp: string;
}

interface Condition {
  indicator: string;
  operator: string;
  value: number;
  compareToIndicator?: boolean;
  targetIndicator?: string;
}

interface IndicatorConfig {
  type: string;
  name: string;
  period?: number;
  fastPeriod?: number;
  slowPeriod?: number;
  signalPeriod?: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { strategyId, symbol, startDate, endDate, initialCapital } = await req.json();
    console.log('Running backtest:', { strategyId, symbol, startDate, endDate, initialCapital });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch strategy configuration
    const { data: strategy, error: strategyError } = await supabase
      .from('custom_strategies')
      .select('*')
      .eq('id', strategyId)
      .single();

    if (strategyError || !strategy) {
      throw new Error(`Strategy not found: ${strategyError?.message}`);
    }

    console.log('Using strategy:', strategy.name);

    // Fetch historical kline data from Binance
    const startTime = new Date(startDate).getTime();
    const endTime = new Date(endDate).getTime();
    
    const klinesResponse = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&startTime=${startTime}&endTime=${endTime}&limit=1000`
    );

    if (!klinesResponse.ok) {
      throw new Error('Failed to fetch historical data from Binance');
    }

    const klines = await klinesResponse.json();
    console.log(`Fetched ${klines.length} historical candles`);

    // Technical indicator calculations
    const calculateRSI = (prices: number[], period: number = 14): number => {
      if (prices.length < period + 1) return 50;
      
      let gains = 0;
      let losses = 0;
      
      for (let i = prices.length - period; i < prices.length; i++) {
        const change = prices[i] - prices[i - 1];
        if (change > 0) gains += change;
        else losses += Math.abs(change);
      }
      
      const avgGain = gains / period;
      const avgLoss = losses / period;
      
      if (avgLoss === 0) return 100;
      const rs = avgGain / avgLoss;
      return 100 - (100 / (1 + rs));
    };

    const calculateEMA = (prices: number[], period: number): number => {
      if (prices.length < period) return prices[prices.length - 1];
      
      const multiplier = 2 / (period + 1);
      let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
      
      for (let i = period; i < prices.length; i++) {
        ema = (prices[i] - ema) * multiplier + ema;
      }
      
      return ema;
    };

    const calculateMACD = (prices: number[], fastPeriod: number = 12, slowPeriod: number = 26, signalPeriod: number = 9) => {
      const fastEMA = calculateEMA(prices, fastPeriod);
      const slowEMA = calculateEMA(prices, slowPeriod);
      const macdLine = fastEMA - slowEMA;
      
      const macdHistory = [];
      for (let i = slowPeriod; i < prices.length; i++) {
        const fast = calculateEMA(prices.slice(0, i + 1), fastPeriod);
        const slow = calculateEMA(prices.slice(0, i + 1), slowPeriod);
        macdHistory.push(fast - slow);
      }
      
      const signalLine = calculateEMA(macdHistory, signalPeriod);
      
      return { macdLine, signalLine, histogram: macdLine - signalLine };
    };

    const calculateIndicator = (type: string, prices: number[], config: IndicatorConfig): number => {
      switch (type.toLowerCase()) {
        case 'rsi':
          return calculateRSI(prices, config.period || 14);
        case 'ema':
          return calculateEMA(prices, config.period || 20);
        case 'macd':
          const macd = calculateMACD(prices, config.fastPeriod, config.slowPeriod, config.signalPeriod);
          return macd.macdLine;
        case 'price':
          return prices[prices.length - 1];
        default:
          return 0;
      }
    };

    const evaluateCondition = (condition: Condition, indicators: { [key: string]: number }): boolean => {
      const indicatorValue = indicators[condition.indicator] || 0;
      
      // Check if comparing to another indicator
      let targetValue: number;
      if (condition.compareToIndicator && condition.targetIndicator) {
        targetValue = indicators[condition.targetIndicator] || 0;
      } else {
        targetValue = Number(condition.value || 0);
      }
      
      switch (condition.operator.toLowerCase()) {
        case '>':
        case 'above':
          return indicatorValue > targetValue;
        case '<':
        case 'below':
          return indicatorValue < targetValue;
        case '>=':
          return indicatorValue >= targetValue;
        case '<=':
          return indicatorValue <= targetValue;
        case '==':
        case 'equals':
          return Math.abs(indicatorValue - targetValue) < 0.01;
        default:
          return false;
      }
    };

    // Run backtest simulation
    const trades: Trade[] = [];
    let currentCapital = initialCapital;
    let position: { type: 'long' | 'short', entryPrice: number, size: number, timestamp: string } | null = null;
    let maxCapital = initialCapital;
    let maxDrawdown = 0;

    console.log(`Processing ${klines.length} candles for backtesting...`);

    for (let i = 50; i < klines.length; i++) {
      const currentCandle = klines[i];
      const currentPrice = parseFloat(currentCandle[4]); // Close price
      const timestamp = new Date(currentCandle[0]).toISOString();
      const historicalPrices = klines.slice(Math.max(0, i - 100), i + 1).map((k: any) => parseFloat(k[4]));
      
      // Calculate all configured indicators
      const indicators: { [key: string]: number } = {};
      for (const indicatorConfig of (strategy.indicators || []) as IndicatorConfig[]) {
        indicators[indicatorConfig.name || indicatorConfig.type] = calculateIndicator(
          indicatorConfig.type,
          historicalPrices,
          indicatorConfig
        );
      }

      // Evaluate entry conditions
      if (!position) {
        const entryConditions = (strategy.entry_conditions || []) as Condition[];
        const allEntryConditionsMet = entryConditions.every((condition) => {
          return evaluateCondition(condition, indicators);
        });

        if (allEntryConditionsMet && entryConditions.length > 0) {
          const positionSize = currentCapital * 0.95;
          position = {
            type: 'long', // TODO: Support short positions based on strategy config
            entryPrice: currentPrice,
            size: positionSize / currentPrice,
            timestamp
          };
          console.log(`Entered ${position.type.toUpperCase()} at ${currentPrice}, indicators:`, indicators);
        }
      }

      // Evaluate exit conditions
      if (position) {
        const riskParams = (strategy.risk_management || {}) as any;
        const stopLoss = position.entryPrice * (1 - (riskParams.stopLossPercent || 3) / 100);
        const takeProfit = position.entryPrice * (1 + (riskParams.takeProfitPercent || 5) / 100);
        
        let exitPrice: number | null = null;
        let exitReason = '';

        // Check exit conditions from strategy
        const exitConditions = (strategy.exit_conditions || []) as Condition[];
        const anyExitConditionMet = exitConditions.some((condition) => {
          return evaluateCondition(condition, indicators);
        });

        if (anyExitConditionMet && exitConditions.length > 0) {
          exitPrice = currentPrice;
          exitReason = 'Exit conditions met';
        }
        
        // Check stop loss
        if (position.type === 'long' && currentPrice <= stopLoss) {
          exitPrice = stopLoss;
          exitReason = 'Stop loss';
        }
        
        // Check take profit
        if (position.type === 'long' && currentPrice >= takeProfit) {
          exitPrice = takeProfit;
          exitReason = 'Take profit';
        }

        if (exitPrice) {
          const profit = position.type === 'long' 
            ? (exitPrice - position.entryPrice) * position.size
            : (position.entryPrice - exitPrice) * position.size;
          const profitPercent = position.type === 'long'
            ? ((exitPrice - position.entryPrice) / position.entryPrice) * 100
            : ((position.entryPrice - exitPrice) / position.entryPrice) * 100;
          
          currentCapital += profit;
          
          trades.push({
            entryPrice: position.entryPrice,
            exitPrice,
            type: position.type,
            profit,
            profitPercent,
            timestamp: position.timestamp
          });
          
          console.log(`Exited ${position.type.toUpperCase()} at ${exitPrice}, Profit: ${profit.toFixed(2)} (${profitPercent.toFixed(2)}%), Reason: ${exitReason}`);
          position = null;

          // Track drawdown
          if (currentCapital > maxCapital) {
            maxCapital = currentCapital;
          }
          const drawdown = ((maxCapital - currentCapital) / maxCapital) * 100;
          if (drawdown > maxDrawdown) {
            maxDrawdown = drawdown;
          }
        }
      }
    }

    // Calculate comprehensive statistics
    const winningTrades = trades.filter(t => t.profit > 0).length;
    const losingTrades = trades.filter(t => t.profit <= 0).length;
    const winRate = trades.length > 0 ? (winningTrades / trades.length) * 100 : 0;
    
    const totalProfit = trades.filter(t => t.profit > 0).reduce((sum, t) => sum + t.profit, 0);
    const totalLoss = Math.abs(trades.filter(t => t.profit <= 0).reduce((sum, t) => sum + t.profit, 0));
    const netProfit = currentCapital - initialCapital;
    
    const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? 999 : 0;
    
    const avgWin = winningTrades > 0 ? totalProfit / winningTrades : 0;
    const avgLoss = losingTrades > 0 ? totalLoss / losingTrades : 0;
    
    const largestWin = trades.length > 0 ? Math.max(...trades.map(t => t.profit)) : 0;
    const largestLoss = trades.length > 0 ? Math.min(...trades.map(t => t.profit)) : 0;
    
    // Calculate Sharpe Ratio
    const returns = trades.map(t => t.profitPercent);
    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const stdDev = returns.length > 0 
      ? Math.sqrt(returns.map(r => Math.pow(r - avgReturn, 2)).reduce((a, b) => a + b, 0) / returns.length)
      : 0;
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

    console.log(`Backtest completed: ${trades.length} trades, Win Rate: ${winRate.toFixed(2)}%, Net Profit: ${netProfit.toFixed(2)}`);

    // Store results in database
    const { data: backtestResult, error: dbError } = await supabase
      .from('backtesting_results')
      .insert({
        strategy_id: strategyId,
        strategy_name: strategy.name,
        symbol,
        start_date: startDate,
        end_date: endDate,
        initial_capital: initialCapital,
        final_capital: currentCapital,
        total_trades: trades.length,
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

    if (dbError) {
      console.error('Error storing backtest results:', dbError);
      throw dbError;
    }

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