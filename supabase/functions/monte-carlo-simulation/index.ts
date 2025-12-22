import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import { detectStrategyType, isMomentumStrategy, isMeanReversionStrategy } from "../_shared/constants.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SimulationParams {
  strategyId: string;
  symbol: string;
  simulations: number;
  timeHorizonDays: number;
  initialCapital: number;
  confidenceLevel: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const params: SimulationParams = await req.json();
    console.log('Monte Carlo simulation started:', params);

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
      // Try built-in strategies
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
            risk_settings: { stopLossPercent: 2, takeProfitPercent: 4, positionSizePercent: 1 },
          };
        } else if (strategyType === 'MOMENTUM' || strategyType === 'TREND_FOLLOWING') {
          strategy = {
            name: builtIn.strategy_name,
            risk_settings: { stopLossPercent: 3, takeProfitPercent: 6, positionSizePercent: 1 },
          };
        } else if (strategyType === 'GRID_RANGE') {
          strategy = {
            name: builtIn.strategy_name,
            risk_settings: { stopLossPercent: 1.5, takeProfitPercent: 1.5, positionSizePercent: 1 },
          };
        }
      }
    }

    if (!strategy) {
      throw new Error(`Strategy with ID ${params.strategyId} not found. Please ensure the strategy exists before running Monte Carlo simulation.`);
    }

    // Fetch historical data to calculate returns statistics
    const endTime = Date.now();
    const startTime = endTime - (90 * 24 * 60 * 60 * 1000); // 90 days ago
    
    const klinesResponse = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${params.symbol}&interval=1d&startTime=${startTime}&endTime=${endTime}&limit=90`
    );

    if (!klinesResponse.ok) {
      throw new Error('Failed to fetch historical data');
    }

    const klines = await klinesResponse.json();
    
    // Calculate daily returns
    const returns: number[] = [];
    for (let i = 1; i < klines.length; i++) {
      const prevClose = parseFloat(klines[i - 1][4]);
      const currentClose = parseFloat(klines[i][4]);
      const dailyReturn = (currentClose - prevClose) / prevClose;
      returns.push(dailyReturn);
    }

    // Calculate mean and standard deviation of returns
    const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    console.log(`Historical stats - Mean: ${meanReturn.toFixed(6)}, StdDev: ${stdDev.toFixed(6)}`);

    // Run Monte Carlo simulations
    const simulationResults: number[] = [];
    const maxDrawdowns: number[] = [];
    const sharpeRatios: number[] = [];
    
    for (let sim = 0; sim < params.simulations; sim++) {
      let capital = params.initialCapital;
      let maxCapital = capital;
      let maxDrawdown = 0;
      const dailyReturns: number[] = [];
      
      // Simulate price path using Geometric Brownian Motion
      for (let day = 0; day < params.timeHorizonDays; day++) {
        // Generate random return using normal distribution (Box-Muller transform)
        const u1 = Math.random();
        const u2 = Math.random();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        const randomReturn = meanReturn + stdDev * z;
        
        // Apply strategy logic (simplified)
        const positionSize = capital * (strategy.risk_settings?.positionSizePercent || 1) / 100;
        const tradeReturn = randomReturn * positionSize;
        
        // Apply stop loss and take profit
        const stopLoss = -(strategy.risk_settings?.stopLossPercent || 2) / 100;
        const takeProfit = (strategy.risk_settings?.takeProfitPercent || 4) / 100;
        
        let finalReturn = tradeReturn;
        if (randomReturn < stopLoss) {
          finalReturn = stopLoss * positionSize;
        } else if (randomReturn > takeProfit) {
          finalReturn = takeProfit * positionSize;
        }
        
        capital += finalReturn;
        dailyReturns.push(finalReturn / capital);
        
        // Track drawdown
        if (capital > maxCapital) {
          maxCapital = capital;
        }
        const currentDrawdown = ((maxCapital - capital) / maxCapital) * 100;
        if (currentDrawdown > maxDrawdown) {
          maxDrawdown = currentDrawdown;
        }
      }
      
      const finalReturn = ((capital - params.initialCapital) / params.initialCapital) * 100;
      simulationResults.push(finalReturn);
      maxDrawdowns.push(maxDrawdown);
      
      // Calculate Sharpe ratio (assuming risk-free rate of 2% annual)
      const avgReturn = dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length;
      const returnStdDev = Math.sqrt(
        dailyReturns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / dailyReturns.length
      );
      const annualizedReturn = avgReturn * 252; // 252 trading days
      const annualizedStdDev = returnStdDev * Math.sqrt(252);
      const sharpeRatio = annualizedStdDev > 0 ? (annualizedReturn - 0.02) / annualizedStdDev : 0;
      sharpeRatios.push(sharpeRatio);
    }

    // Sort results for percentile calculations
    simulationResults.sort((a, b) => a - b);
    maxDrawdowns.sort((a, b) => a - b);
    sharpeRatios.sort((a, b) => a - b);

    // Calculate statistics
    const meanFinalReturn = simulationResults.reduce((sum, r) => sum + r, 0) / simulationResults.length;
    const medianReturn = simulationResults[Math.floor(simulationResults.length / 2)];
    
    // Confidence intervals
    const lowerIndex = Math.floor(simulationResults.length * (1 - params.confidenceLevel) / 2);
    const upperIndex = Math.floor(simulationResults.length * (1 + params.confidenceLevel) / 2);
    const lowerBound = simulationResults[lowerIndex];
    const upperBound = simulationResults[upperIndex];
    
    // Value at Risk (VaR) - potential loss at confidence level
    const varIndex = Math.floor(simulationResults.length * (1 - params.confidenceLevel));
    const valueAtRisk = -simulationResults[varIndex];
    
    // Conditional Value at Risk (CVaR) - expected loss beyond VaR
    const cvarReturns = simulationResults.slice(0, varIndex);
    const conditionalVaR = cvarReturns.length > 0 
      ? -(cvarReturns.reduce((sum, r) => sum + r, 0) / cvarReturns.length)
      : 0;
    
    // Probability of profit
    const profitableSimulations = simulationResults.filter(r => r > 0).length;
    const profitProbability = (profitableSimulations / simulationResults.length) * 100;
    
    // Average max drawdown
    const avgMaxDrawdown = maxDrawdowns.reduce((sum, d) => sum + d, 0) / maxDrawdowns.length;
    
    // Average Sharpe ratio
    const avgSharpeRatio = sharpeRatios.reduce((sum, s) => sum + s, 0) / sharpeRatios.length;
    
    // Create distribution histogram
    const numBins = 50;
    const minReturn = simulationResults[0];
    const maxReturn = simulationResults[simulationResults.length - 1];
    const binWidth = (maxReturn - minReturn) / numBins;
    const distribution: Array<{ range: string; count: number; percentage: number }> = [];
    
    for (let i = 0; i < numBins; i++) {
      const binStart = minReturn + i * binWidth;
      const binEnd = binStart + binWidth;
      const count = simulationResults.filter(r => r >= binStart && r < binEnd).length;
      distribution.push({
        range: `${binStart.toFixed(1)}% to ${binEnd.toFixed(1)}%`,
        count,
        percentage: (count / simulationResults.length) * 100
      });
    }

    console.log(`Simulation complete. Mean return: ${meanFinalReturn.toFixed(2)}%, Profit probability: ${profitProbability.toFixed(1)}%`);

    return new Response(
      JSON.stringify({
        success: true,
        statistics: {
          meanReturn: meanFinalReturn,
          medianReturn,
          stdDeviation: Math.sqrt(
            simulationResults.reduce((sum, r) => sum + Math.pow(r - meanFinalReturn, 2), 0) / simulationResults.length
          ),
          confidenceInterval: {
            level: params.confidenceLevel * 100,
            lowerBound,
            upperBound
          },
          profitProbability,
          valueAtRisk,
          conditionalValueAtRisk: conditionalVaR,
          averageMaxDrawdown: avgMaxDrawdown,
          averageSharpeRatio: avgSharpeRatio
        },
        distribution,
        percentiles: {
          p5: simulationResults[Math.floor(simulationResults.length * 0.05)],
          p10: simulationResults[Math.floor(simulationResults.length * 0.10)],
          p25: simulationResults[Math.floor(simulationResults.length * 0.25)],
          p50: medianReturn,
          p75: simulationResults[Math.floor(simulationResults.length * 0.75)],
          p90: simulationResults[Math.floor(simulationResults.length * 0.90)],
          p95: simulationResults[Math.floor(simulationResults.length * 0.95)]
        },
        rawResults: simulationResults.slice(0, 100) // Sample of results for charting
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in Monte Carlo simulation:', error);
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
