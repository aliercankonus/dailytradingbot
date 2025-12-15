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

    // Get authenticated user (optional for public backtests)
    let userId: string | null = null;
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        userId = user.id;
      }
    }

    // Fetch strategy configuration (custom or built-in)
    let strategy: any = null;
    let isCustomStrategy = false;

    // First check if strategyId is a built-in strategy name
    const builtInStrategies: { [key: string]: any } = {
      'mean-reversion': {
        name: 'Mean Reversion',
        indicators: [
          { type: 'price', name: 'price' },
          { type: 'bb_lower', name: 'bb_lower', period: 20 },
          { type: 'bb_middle', name: 'bb_middle', period: 20 },
          { type: 'rsi', name: 'rsi', period: 14 },
        ],
        entry_conditions: [
          { indicator: 'price', operator: '<', value: 0, compareToIndicator: true, targetIndicator: 'bb_lower' },
          { indicator: 'rsi', operator: '<', value: 30 },
        ],
        exit_conditions: [
          { indicator: 'price', operator: '>=', value: 0, compareToIndicator: true, targetIndicator: 'bb_middle' },
        ],
        risk_management: { stopLossPercent: 2, takeProfitPercent: 4 },
      },
      'momentum': {
        name: 'Momentum',
        indicators: [
          { type: 'macd', name: 'macd', fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
          { type: 'macd_signal', name: 'macd_signal', fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
        ],
        entry_conditions: [
          { indicator: 'macd', operator: '>', value: 0, compareToIndicator: true, targetIndicator: 'macd_signal' },
        ],
        exit_conditions: [
          { indicator: 'macd', operator: '<', value: 0, compareToIndicator: true, targetIndicator: 'macd_signal' },
        ],
        risk_management: { stopLossPercent: 3, takeProfitPercent: 6 },
      },
      'grid': {
        name: 'Grid Trading',
        indicators: [
          { type: 'price', name: 'price' },
          { type: 'bb_lower', name: 'bb_lower', period: 20 },
          { type: 'bb_upper', name: 'bb_upper', period: 20 },
        ],
        entry_conditions: [
          { indicator: 'price', operator: '<=', value: 0, compareToIndicator: true, targetIndicator: 'bb_lower' },
        ],
        exit_conditions: [
          { indicator: 'price', operator: '>=', value: 0, compareToIndicator: true, targetIndicator: 'bb_upper' },
        ],
        risk_management: { stopLossPercent: 1.5, takeProfitPercent: 1.5 },
      },
    };

    if (builtInStrategies[strategyId]) {
      strategy = builtInStrategies[strategyId];
      console.log('Using built-in strategy:', strategyId);
    } else {
      // Try to fetch as custom strategy UUID
      const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(strategyId);
      
      if (isValidUUID) {
        const { data: customStrategy, error: strategyError } = await supabase
          .from('custom_strategies')
          .select('*')
          .eq('id', strategyId)
          .maybeSingle();

        if (strategyError) {
          console.error('Strategy query error:', strategyError);
        }

        if (customStrategy) {
          strategy = customStrategy;
          isCustomStrategy = true;
        }
      }
    }

    if (!strategy) {
      throw new Error(`Strategy with ID ${strategyId} not found. Please ensure the strategy exists before running a backtest.`);
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

    // O(n) EMA without slice()
    const calculateEMA = (prices: number[], period: number): number => {
      if (prices.length < period) return prices[prices.length - 1];
      const multiplier = 2 / (period + 1);
      let ema = 0;
      for (let i = 0; i < period; i++) ema += prices[i];
      ema /= period;
      for (let i = period; i < prices.length; i++) {
        ema = (prices[i] - ema) * multiplier + ema;
      }
      return ema;
    };

    // O(n) MACD using incremental EMA calculation instead of O(n²) slice() per iteration
    const calculateMACD = (prices: number[], fastPeriod: number = 12, slowPeriod: number = 26, signalPeriod: number = 9) => {
      if (prices.length < slowPeriod) {
        return { macdLine: 0, signalLine: 0, histogram: 0 };
      }
      
      const fastMult = 2 / (fastPeriod + 1);
      const slowMult = 2 / (slowPeriod + 1);
      
      // Initialize EMAs
      let fastEMA = 0, slowEMA = 0;
      for (let i = 0; i < fastPeriod; i++) fastEMA += prices[i];
      fastEMA /= fastPeriod;
      for (let i = 0; i < slowPeriod; i++) slowEMA += prices[i];
      slowEMA /= slowPeriod;
      
      // Build MACD history incrementally
      const macdHistory: number[] = [];
      for (let i = slowPeriod; i < prices.length; i++) {
        fastEMA = (prices[i] - fastEMA) * fastMult + fastEMA;
        slowEMA = (prices[i] - slowEMA) * slowMult + slowEMA;
        macdHistory.push(fastEMA - slowEMA);
      }
      
      const macdLine = macdHistory[macdHistory.length - 1] || 0;
      const signalLine = macdHistory.length >= signalPeriod ? calculateEMA(macdHistory, signalPeriod) : macdLine * 0.9;
      
      return { macdLine, signalLine, histogram: macdLine - signalLine };
    };

    // O(n) Bollinger Bands using sum and sum-of-squares for variance
    const calculateBollingerBands = (prices: number[], period: number = 20, stdDevMultiplier: number = 2) => {
      if (prices.length < period) {
        const currentPrice = prices[prices.length - 1] || 0;
        return { upper: currentPrice, middle: currentPrice, lower: currentPrice };
      }
      
      const startIdx = prices.length - period;
      let sum = 0, sumSq = 0;
      for (let i = startIdx; i < prices.length; i++) {
        sum += prices[i];
        sumSq += prices[i] * prices[i];
      }
      const middle = sum / period;
      // Variance = E[X²] - E[X]²
      const variance = Math.max(0, (sumSq / period) - (middle * middle));
      const standardDeviation = Math.sqrt(variance);
      
      return {
        upper: middle + (standardDeviation * stdDevMultiplier),
        middle: middle,
        lower: middle - (standardDeviation * stdDevMultiplier)
      };
    };

    const calculateOBV = (prices: number[], volumes: number[]): number => {
      if (prices.length !== volumes.length || prices.length < 2) return 0;
      
      let obv = 0;
      for (let i = 1; i < prices.length; i++) {
        if (prices[i] > prices[i - 1]) {
          obv += volumes[i];
        } else if (prices[i] < prices[i - 1]) {
          obv -= volumes[i];
        }
      }
      
      return obv;
    };

    // O(n) average volume calculation without slice()
    const calculateAverageVolume = (volumes: number[], period: number = 20): number => {
      if (volumes.length === 0) return 0;
      if (volumes.length < period) {
        let sum = 0;
        for (let i = 0; i < volumes.length; i++) sum += volumes[i];
        return sum / volumes.length;
      }
      let sum = 0;
      const startIdx = volumes.length - period;
      for (let i = startIdx; i < volumes.length; i++) sum += volumes[i];
      return sum / period;
    };

    const calculateIndicator = (type: string, prices: number[], volumes: number[], config: IndicatorConfig): number => {
      switch (type.toLowerCase()) {
        case 'rsi':
          return calculateRSI(prices, config.period || 14);
        case 'ema':
          return calculateEMA(prices, config.period || 20);
        case 'macd':
          const macd = calculateMACD(prices, config.fastPeriod, config.slowPeriod, config.signalPeriod);
          return macd.macdLine;
        case 'macd_signal':
          const macdData = calculateMACD(prices, config.fastPeriod, config.slowPeriod, config.signalPeriod);
          return macdData.signalLine;
        case 'bb':
        case 'bb_upper':
          const bbUpper = calculateBollingerBands(prices, config.period || 20);
          return bbUpper.upper;
        case 'bb_middle':
          const bbMiddle = calculateBollingerBands(prices, config.period || 20);
          return bbMiddle.middle;
        case 'bb_lower':
          const bbLower = calculateBollingerBands(prices, config.period || 20);
          return bbLower.lower;
        case 'volume':
          return volumes[volumes.length - 1];
        case 'volume_avg':
          return calculateAverageVolume(volumes, config.period || 20);
        case 'obv':
          return calculateOBV(prices, volumes);
        case 'obv_avg':
          const obvValues: number[] = [];
          for (let i = Math.max(0, prices.length - (config.period || 20)); i < prices.length; i++) {
            obvValues.push(calculateOBV(prices.slice(0, i + 1), volumes.slice(0, i + 1)));
          }
          return obvValues.reduce((a, b) => a + b, 0) / (obvValues.length || 1);
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
    const volumeData: Array<{ timestamp: string; price: number; volume: number }> = [];
    let currentCapital = initialCapital;
    let position: { type: 'long' | 'short', entryPrice: number, size: number, timestamp: string } | null = null;
    let maxCapital = initialCapital;
    let maxDrawdown = 0;

    console.log(`Processing ${klines.length} candles for backtesting...`);

    for (let i = 50; i < klines.length; i++) {
      const currentCandle = klines[i];
      const currentPrice = parseFloat(currentCandle[4]); // Close price
      const currentVolume = parseFloat(currentCandle[5]); // Volume
      const timestamp = new Date(currentCandle[0]).toISOString();
      const historicalPrices = klines.slice(Math.max(0, i - 100), i + 1).map((k: any) => parseFloat(k[4]));
      const historicalVolumes = klines.slice(Math.max(0, i - 100), i + 1).map((k: any) => parseFloat(k[5]));
      
      // Store volume data for charting (sample every 10th candle to reduce size)
      if (i % 10 === 0) {
        volumeData.push({
          timestamp,
          price: currentPrice,
          volume: currentVolume
        });
      }
      
      // Calculate all configured indicators
      const indicators: { [key: string]: number } = {};
      for (const indicatorConfig of (strategy.indicators || []) as IndicatorConfig[]) {
        indicators[indicatorConfig.name || indicatorConfig.type] = calculateIndicator(
          indicatorConfig.type,
          historicalPrices,
          historicalVolumes,
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
        user_id: userId,
        strategy_id: isCustomStrategy ? strategyId : null, // Only set for custom strategies
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
        results_data: { trades, volumeData },
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