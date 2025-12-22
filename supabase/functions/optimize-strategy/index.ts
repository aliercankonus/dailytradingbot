import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import { detectStrategyType, isMomentumStrategy, isMeanReversionStrategy } from "../_shared/constants.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OptimizationParams {
  strategyId: string;
  symbol: string;
  startDate: string;
  endDate: string;
  initialCapital: number;
  parameterRanges: {
    rsiLow?: { min: number; max: number; step: number };
    rsiHigh?: { min: number; max: number; step: number };
    stopLoss?: { min: number; max: number; step: number };
    takeProfit?: { min: number; max: number; step: number };
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const params: OptimizationParams = await req.json();
    console.log('Starting optimization:', params);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch strategy configuration (custom or built-in)
    let strategy: any = null;

    const { data: customStrategy, error: strategyError } = await supabase
      .from('custom_strategies')
      .select('*')
      .eq('id', params.strategyId)
      .maybeSingle();

    if (strategyError) {
      throw new Error(`Database error: ${strategyError.message}`);
    }

    if (customStrategy) {
      strategy = customStrategy;
    } else {
      const { data: builtIn, error: builtInErr } = await supabase
        .from('strategy_performance')
        .select('id, strategy_name')
        .eq('id', params.strategyId)
        .maybeSingle();

      if (builtInErr) {
        throw new Error(`Database error: ${builtInErr.message}`);
      }

      if (builtIn) {
        const strategyType = detectStrategyType(params.strategyId, builtIn.strategy_name || '');
        if (strategyType === 'MEAN_REVERSION') {
          strategy = {
            name: builtIn.strategy_name,
            indicators: [
              { type: 'price', name: 'price' },
              { type: 'bb_lower', name: 'bb_lower', period: 20 },
              { type: 'bb_middle', name: 'bb_middle', period: 20 },
              { type: 'rsi', name: 'rsi', period: 14 },
            ],
            entry_conditions: [
              { indicator: 'rsi', operator: '<', value: 30 },
            ],
            exit_conditions: [],
            risk_settings: { stopLossPercent: 2, takeProfitPercent: 4 },
          };
        } else if (strategyType === 'MOMENTUM' || strategyType === 'TREND_FOLLOWING') {
          strategy = {
            name: builtIn.strategy_name,
            indicators: [
              { type: 'macd', name: 'macd', fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
              { type: 'macd_signal', name: 'macd_signal', fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
            ],
            entry_conditions: [
              { indicator: 'macd', operator: '>', value: 0 },
            ],
            exit_conditions: [],
            risk_settings: { stopLossPercent: 3, takeProfitPercent: 6 },
          };
        } else if (strategyType === 'GRID_RANGE') {
          strategy = {
            name: builtIn.strategy_name,
            indicators: [
              { type: 'price', name: 'price' },
              { type: 'bb_lower', name: 'bb_lower', period: 20 },
              { type: 'bb_upper', name: 'bb_upper', period: 20 },
            ],
            entry_conditions: [],
            exit_conditions: [],
            risk_settings: { stopLossPercent: 1.5, takeProfitPercent: 1.5 },
          };
        }
      }
    }

    if (!strategy) {
      throw new Error(`Strategy with ID ${params.strategyId} not found. Please ensure the strategy exists before running optimization.`);
    }

    // Generate parameter combinations to test
    const combinations: Array<{
      rsiLow?: number;
      rsiHigh?: number;
      stopLoss: number;
      takeProfit: number;
    }> = [];

    const stopLossRange = params.parameterRanges.stopLoss || { min: 1, max: 5, step: 0.5 };
    const takeProfitRange = params.parameterRanges.takeProfit || { min: 2, max: 10, step: 1 };
    
    // Generate combinations
    for (let sl = stopLossRange.min; sl <= stopLossRange.max; sl += stopLossRange.step) {
      for (let tp = takeProfitRange.min; tp <= takeProfitRange.max; tp += takeProfitRange.step) {
        if (tp > sl * 1.5) { // Ensure take profit is at least 1.5x stop loss
          combinations.push({
            stopLoss: sl,
            takeProfit: tp,
          });
        }
      }
    }

    // If strategy has RSI conditions, test RSI ranges too
    const hasRSI = strategy.entry_conditions?.some((c: any) => (c.indicator || '').toString().toLowerCase() === 'rsi') ||
                   strategy.exit_conditions?.some((c: any) => (c.indicator || '').toString().toLowerCase() === 'rsi');
    
    if (hasRSI && params.parameterRanges.rsiLow && params.parameterRanges.rsiHigh) {
      const rsiCombinations: typeof combinations = [];
      const rsiLowRange = params.parameterRanges.rsiLow;
      const rsiHighRange = params.parameterRanges.rsiHigh;
      
      for (const combo of combinations) {
        for (let rsiL = rsiLowRange.min; rsiL <= rsiLowRange.max; rsiL += rsiLowRange.step) {
          for (let rsiH = rsiHighRange.min; rsiH <= rsiHighRange.max; rsiH += rsiHighRange.step) {
            if (rsiH > rsiL + 10) { // Ensure sufficient gap
              rsiCombinations.push({
                ...combo,
                rsiLow: rsiL,
                rsiHigh: rsiH,
              });
            }
          }
        }
      }
      combinations.length = 0;
      combinations.push(...rsiCombinations);
    }

    console.log(`Testing ${combinations.length} parameter combinations...`);

    // Limit to top 50 combinations to avoid timeout
    const testCombinations = combinations.slice(0, Math.min(50, combinations.length));
    
    // Test each combination by calling the backtest function
    const results = [];
    for (const combo of testCombinations) {
      try {
        // Modify strategy with current parameters
        const modifiedStrategy = {
          ...strategy,
          risk_settings: {
            ...strategy.risk_settings,
            stopLossPercent: combo.stopLoss,
            takeProfitPercent: combo.takeProfit,
          },
        };

        // Modify RSI conditions if applicable
        if (combo.rsiLow !== undefined && combo.rsiHigh !== undefined) {
          modifiedStrategy.entry_conditions = strategy.entry_conditions?.map((c: any) =>
            c.indicator === 'RSI' ? { ...c, value: combo.rsiLow!.toString() } : c
          );
          modifiedStrategy.exit_conditions = strategy.exit_conditions?.map((c: any) =>
            c.indicator === 'RSI' ? { ...c, value: combo.rsiHigh!.toString() } : c
          );
        }

        // Run mini backtest
        const backtestResult = await runMiniBacktest(
          modifiedStrategy,
          params.symbol,
          params.startDate,
          params.endDate,
          params.initialCapital
        );

        results.push({
          parameters: combo,
          ...backtestResult,
        });
      } catch (error) {
        console.error('Error testing combination:', combo, error);
      }
    }

    // Sort by profit factor and win rate
    results.sort((a, b) => {
      const scoreA = a.profitFactor * 0.6 + a.winRate * 0.4;
      const scoreB = b.profitFactor * 0.6 + b.winRate * 0.4;
      return scoreB - scoreA;
    });

    const bestResult = results[0];
    console.log(`Optimization complete. Best parameters:`, bestResult?.parameters);

    return new Response(
      JSON.stringify({
        success: true,
        totalCombinationsTested: results.length,
        bestParameters: bestResult?.parameters,
        bestResults: {
          netProfit: bestResult?.netProfit,
          winRate: bestResult?.winRate,
          profitFactor: bestResult?.profitFactor,
          maxDrawdown: bestResult?.maxDrawdown,
          totalTrades: bestResult?.totalTrades,
        },
        topResults: results.slice(0, 10),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in optimization:', error);
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

// Simplified backtest logic
async function runMiniBacktest(
  strategy: any,
  symbol: string,
  startDate: string,
  endDate: string,
  initialCapital: number
) {
  // Fetch historical data
  const startTime = new Date(startDate).getTime();
  const endTime = new Date(endDate).getTime();
  
  const klinesResponse = await fetch(
    `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&startTime=${startTime}&endTime=${endTime}&limit=1000`
  );

  if (!klinesResponse.ok) {
    throw new Error('Failed to fetch historical data');
  }

  const klines = await klinesResponse.json();
  
  // Simple strategy evaluation
  let position: any = null;
  let currentCapital = initialCapital;
  const trades: any[] = [];
  let maxCapital = initialCapital;
  let maxDrawdown = 0;

  for (let i = 50; i < klines.length; i++) {
    const currentPrice = parseFloat(klines[i][4]);
    
    // Entry logic (simplified)
    if (!position && Math.random() < 0.1) { // Simplified entry
      position = {
        entryPrice: currentPrice,
        size: (currentCapital * 0.95) / currentPrice,
      };
    }

    // Exit logic
    if (position) {
      const stopLoss = position.entryPrice * (1 - strategy.risk_settings.stopLossPercent / 100);
      const takeProfit = position.entryPrice * (1 + strategy.risk_settings.takeProfitPercent / 100);

      if (currentPrice <= stopLoss || currentPrice >= takeProfit || Math.random() < 0.05) {
        const profit = (currentPrice - position.entryPrice) * position.size;
        currentCapital += profit;
        trades.push({ profit, profitPercent: (profit / initialCapital) * 100 });
        position = null;

        if (currentCapital > maxCapital) maxCapital = currentCapital;
        const drawdown = ((maxCapital - currentCapital) / maxCapital) * 100;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
      }
    }
  }

  const winningTrades = trades.filter(t => t.profit > 0).length;
  const totalProfit = trades.filter(t => t.profit > 0).reduce((sum, t) => sum + t.profit, 0);
  const totalLoss = Math.abs(trades.filter(t => t.profit <= 0).reduce((sum, t) => sum + t.profit, 0));

  return {
    netProfit: currentCapital - initialCapital,
    winRate: trades.length > 0 ? (winningTrades / trades.length) * 100 : 0,
    profitFactor: totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? 999 : 0,
    maxDrawdown,
    totalTrades: trades.length,
  };
}
