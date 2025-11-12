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
  openPrice: string;
  closePrice: string;
}

interface Condition {
  indicator: string;
  operator: string;
  value: string;
}

interface IndicatorConfig {
  type: string;
  period?: number;
  signal?: number;
}

interface CustomStrategy {
  id: string;
  name: string;
  entry_conditions: Condition[];
  exit_conditions: Condition[];
  indicators: IndicatorConfig[];
  risk_settings: {
    stopLossPercent: number;
    takeProfitPercent: number;
    positionSizePercent: number;
  };
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

// Calculate MACD
function calculateMACD(prices: number[]): { macd: number; signal: number; histogram: number } {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const macd = ema12 - ema26;
  
  // For signal line, we'd need more historical data, so we'll approximate
  const signal = macd * 0.9; // Simplified signal line
  const histogram = macd - signal;
  
  return { macd, signal, histogram };
}

// Detect trend based on price action
function detectTrend(data: MarketData): 'bullish' | 'bearish' | 'ranging' {
  const changePercent = parseFloat(data.priceChangePercent);
  const volumeRatio = parseFloat(data.volume) / 1000000;
  
  if (changePercent > 2 && volumeRatio > 50) return 'bullish';
  if (changePercent < -2 && volumeRatio > 50) return 'bearish';
  return 'ranging';
}

// Fetch historical prices (simplified - using current price with variations)
function generateHistoricalPrices(currentPrice: number, changePercent: number): number[] {
  const prices: number[] = [];
  const volatility = Math.abs(changePercent) / 100;
  
  // Generate 30 historical prices
  for (let i = 30; i >= 0; i--) {
    const variation = (Math.random() - 0.5) * volatility * currentPrice;
    const trend = (changePercent / 100) * currentPrice * (i / 30);
    prices.push(currentPrice - trend + variation);
  }
  
  return prices;
}

// Calculate indicator value
function calculateIndicator(
  indicatorConfig: IndicatorConfig,
  marketData: MarketData,
  historicalPrices: number[]
): number {
  const currentPrice = parseFloat(marketData.lastPrice);
  
  switch (indicatorConfig.type) {
    case 'RSI':
      return calculateRSI(historicalPrices, indicatorConfig.period || 14);
    case 'EMA':
      return calculateEMA(historicalPrices, indicatorConfig.period || 20);
    case 'MACD':
      const macd = calculateMACD(historicalPrices);
      return macd.macd;
    case 'Price':
      return currentPrice;
    default:
      return 0;
  }
}

// Evaluate a condition
function evaluateCondition(
  condition: Condition,
  indicatorValues: Map<string, number>,
  marketData: MarketData
): boolean {
  const indicatorValue = indicatorValues.get(condition.indicator) || 0;
  const targetValue = parseFloat(condition.value);
  
  console.log(`Evaluating: ${condition.indicator} ${condition.operator} ${condition.value} (current: ${indicatorValue})`);
  
  switch (condition.operator) {
    case 'above':
      return indicatorValue > targetValue;
    case 'below':
      return indicatorValue < targetValue;
    case 'crosses_above':
      // Simplified: just check if currently above
      return indicatorValue > targetValue;
    case 'crosses_below':
      // Simplified: just check if currently below
      return indicatorValue < targetValue;
    default:
      return false;
  }
}

// Analyze market using custom strategy
function analyzeWithStrategy(data: MarketData, strategy: CustomStrategy) {
  const currentPrice = parseFloat(data.lastPrice);
  const changePercent = parseFloat(data.priceChangePercent);
  const historicalPrices = generateHistoricalPrices(currentPrice, changePercent);
  
  // Calculate all indicators for this strategy
  const indicatorValues = new Map<string, number>();
  
  for (const indicatorConfig of strategy.indicators) {
    const value = calculateIndicator(indicatorConfig, data, historicalPrices);
    indicatorValues.set(indicatorConfig.type, value);
    console.log(`Calculated ${indicatorConfig.type}: ${value}`);
  }
  
  // Add Price as an indicator
  indicatorValues.set('Price', currentPrice);
  
  // Evaluate entry conditions
  const entryConditionsMet = strategy.entry_conditions.every(condition =>
    evaluateCondition(condition, indicatorValues, data)
  );
  
  console.log(`Strategy ${strategy.name} - Entry conditions met: ${entryConditionsMet}`);
  
  // Determine signal type
  let signalType: 'long' | 'short' | 'hold' = 'hold';
  let reason = `Waiting for entry conditions (${strategy.name})`;
  
  if (entryConditionsMet) {
    // Determine if bullish or bearish based on trend
    const trend = detectTrend(data);
    
    if (trend === 'bullish') {
      signalType = 'long';
      reason = `${strategy.name}: Entry conditions met with bullish trend`;
    } else if (trend === 'bearish') {
      signalType = 'short';
      reason = `${strategy.name}: Entry conditions met with bearish trend`;
    } else {
      signalType = 'long'; // Default to long if ranging
      reason = `${strategy.name}: Entry conditions met`;
    }
  }
  
  // Calculate stop loss and take profit based on strategy settings
  const stopLossPercent = strategy.risk_settings.stopLossPercent;
  const takeProfitPercent = strategy.risk_settings.takeProfitPercent;
  
  const stopLoss = signalType === 'long' 
    ? currentPrice * (1 - stopLossPercent / 100)
    : currentPrice * (1 + stopLossPercent / 100);
    
  const takeProfit = signalType === 'long'
    ? currentPrice * (1 + takeProfitPercent / 100)
    : currentPrice * (1 - takeProfitPercent / 100);
  
  const riskRewardRatio = takeProfitPercent / stopLossPercent;
  
  // Calculate confidence score
  const conditionsMet = strategy.entry_conditions.filter(condition =>
    evaluateCondition(condition, indicatorValues, data)
  ).length;
  const confidenceScore = Math.round(
    (conditionsMet / strategy.entry_conditions.length) * 100
  );
  
  return {
    symbol: data.symbol,
    signalType,
    trend: detectTrend(data),
    entryPrice: currentPrice,
    stopLoss,
    takeProfit,
    riskRewardRatio,
    confidenceScore,
    indicators: Object.fromEntries(indicatorValues),
    reason,
    strategyName: strategy.name
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

    console.log('Fetching active custom strategies...');
    
    // Check if auto-trading is enabled
    const { data: riskParams } = await supabase
      .from('risk_parameters')
      .select('is_trading_enabled, max_open_trades, current_open_trades')
      .single();

    const autoExecute = riskParams?.is_trading_enabled && 
                       (riskParams?.current_open_trades || 0) < (riskParams?.max_open_trades || 5);
    
    console.log(`Auto-execute enabled: ${autoExecute}`);

    // Fetch active custom strategies
    const { data: strategies, error: strategiesError } = await supabase
      .from('custom_strategies')
      .select('*')
      .eq('is_active', true);

    if (strategiesError) {
      console.error('Error fetching strategies:', strategiesError);
      throw strategiesError;
    }

    console.log(`Found ${strategies?.length || 0} active strategies`);

    if (!strategies || strategies.length === 0) {
      console.log('No active strategies found, skipping signal generation');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No active strategies to analyze',
          signals: [],
          timestamp: new Date().toISOString()
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    // Fetch current market data for common symbols
    const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'ADAUSDT'];
    console.log(`Fetching market data for ${symbols.length} symbols...`);
    
    const marketDataPromises = symbols.map(async (symbol) => {
      const response = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);
      return response.json();
    });

    const marketData = await Promise.all(marketDataPromises);
    console.log(`Market data fetched successfully`);
    
    // Analyze each market with each active strategy
    const allSignals = [];
    const executedSignals = [];
    
    for (const strategy of strategies as CustomStrategy[]) {
      console.log(`Analyzing with strategy: ${strategy.name}`);
      
      for (const data of marketData) {
        const signal = analyzeWithStrategy(data, strategy);
        
        // Only store signals that are not 'hold'
        if (signal.signalType !== 'hold') {
          console.log(`Generated ${signal.signalType} signal for ${signal.symbol} using ${strategy.name}`);
          allSignals.push(signal);
          
          // Store signal in database
          const { data: insertedSignal, error: insertError } = await supabase
            .from('trading_signals')
            .insert({
              symbol: signal.symbol,
              signal_type: signal.signalType,
              trend: signal.trend,
              entry_price: signal.entryPrice,
              stop_loss: signal.stopLoss,
              take_profit: signal.takeProfit,
              risk_reward_ratio: signal.riskRewardRatio,
              confidence_score: signal.confidenceScore,
              indicators: signal.indicators,
              reason: signal.reason,
              strategy_id: strategy.id,
              strategy_name: strategy.name
            })
            .select()
            .single();
          
          if (insertError) {
            console.error('Error inserting signal:', insertError);
          } else if (autoExecute && insertedSignal) {
            // Automatically execute the signal
            try {
              console.log(`Auto-executing signal ${insertedSignal.id} for ${signal.symbol}`);
              const { error: execError } = await supabase.functions.invoke('execute-trade', {
                body: { signalId: insertedSignal.id, action: 'execute' }
              });
              
              if (execError) {
                console.error(`Failed to auto-execute signal ${insertedSignal.id}:`, execError);
              } else {
                executedSignals.push(insertedSignal.id);
                console.log(`Successfully executed signal ${insertedSignal.id}`);
              }
            } catch (execError) {
              console.error(`Error executing signal ${insertedSignal.id}:`, execError);
            }
          }
        }
      }
    }

    console.log(`Generated ${allSignals.length} signals total, executed ${executedSignals.length}`);

    // Clean up old signals
    const { error: deleteError } = await supabase
      .from('trading_signals')
      .delete()
      .lt('expires_at', new Date().toISOString());

    if (deleteError) {
      console.error('Error cleaning up old signals:', deleteError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        signals: allSignals,
        executedSignals: executedSignals.length,
        autoExecuteEnabled: autoExecute,
        strategiesAnalyzed: strategies.length,
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
