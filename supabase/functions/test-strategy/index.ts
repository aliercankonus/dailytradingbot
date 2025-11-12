import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

interface Condition {
  indicator: string;
  operator: string;
  value: string;
  compareToIndicator?: boolean;
  targetIndicator?: string;
}

interface IndicatorConfig {
  type: string;
  period?: number;
  signal?: number;
}

interface StrategyConfig {
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
  const signal = macd * 0.9;
  const histogram = macd - signal;
  
  return { macd, signal, histogram };
}

// Calculate Bollinger Bands
function calculateBollingerBands(prices: number[], period = 20, stdDev = 2): { upper: number; middle: number; lower: number } {
  if (prices.length < period) {
    const currentPrice = prices[prices.length - 1] || 0;
    return { upper: currentPrice, middle: currentPrice, lower: currentPrice };
  }
  
  const recentPrices = prices.slice(-period);
  const middle = recentPrices.reduce((a, b) => a + b, 0) / period;
  
  const variance = recentPrices.reduce((sum, price) => sum + Math.pow(price - middle, 2), 0) / period;
  const standardDeviation = Math.sqrt(variance);
  
  return {
    upper: middle + (standardDeviation * stdDev),
    middle: middle,
    lower: middle - (standardDeviation * stdDev)
  };
}

// Detect trend
function detectTrend(data: MarketData): 'bullish' | 'bearish' | 'ranging' {
  const changePercent = parseFloat(data.priceChangePercent);
  const volumeRatio = parseFloat(data.volume) / 1000000;
  
  if (changePercent > 2 && volumeRatio > 50) return 'bullish';
  if (changePercent < -2 && volumeRatio > 50) return 'bearish';
  return 'ranging';
}

// Generate historical prices
function generateHistoricalPrices(currentPrice: number, changePercent: number): number[] {
  const prices: number[] = [];
  const volatility = Math.abs(changePercent) / 100;
  
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
    case 'MACD_Signal':
      const macdData = calculateMACD(historicalPrices);
      return macdData.signal;
    case 'BB':
    case 'BB_Upper':
      const bbUpper = calculateBollingerBands(historicalPrices, indicatorConfig.period || 20);
      return bbUpper.upper;
    case 'BB_Middle':
      const bbMiddle = calculateBollingerBands(historicalPrices, indicatorConfig.period || 20);
      return bbMiddle.middle;
    case 'BB_Lower':
      const bbLower = calculateBollingerBands(historicalPrices, indicatorConfig.period || 20);
      return bbLower.lower;
    case 'Price':
      return currentPrice;
    default:
      return 0;
  }
}

// Evaluate a condition
function evaluateCondition(
  condition: Condition,
  indicatorValues: Map<string, number>
): boolean {
  const indicatorValue = indicatorValues.get(condition.indicator) || 0;
  
  // Check if comparing to another indicator
  let targetValue: number;
  if (condition.compareToIndicator && condition.targetIndicator) {
    targetValue = indicatorValues.get(condition.targetIndicator) || 0;
  } else {
    targetValue = parseFloat(condition.value || '0');
  }
  
  switch (condition.operator.toLowerCase()) {
    case 'above':
      return indicatorValue > targetValue;
    case 'below':
      return indicatorValue < targetValue;
    case 'crosses_above':
      return indicatorValue > targetValue;
    case 'crosses_below':
      return indicatorValue < targetValue;
    default:
      return false;
  }
}

// Test strategy against market data
function testStrategy(data: MarketData, strategy: StrategyConfig) {
  const currentPrice = parseFloat(data.lastPrice);
  const changePercent = parseFloat(data.priceChangePercent);
  const historicalPrices = generateHistoricalPrices(currentPrice, changePercent);
  
  // Calculate all indicators
  const indicatorValues = new Map<string, number>();
  
  for (const indicatorConfig of strategy.indicators) {
    const value = calculateIndicator(indicatorConfig, data, historicalPrices);
    indicatorValues.set(indicatorConfig.type, value);
  }
  
  indicatorValues.set('Price', currentPrice);
  
  // Evaluate entry conditions
  const entryResults = strategy.entry_conditions.map(condition => ({
    condition: `${condition.indicator} ${condition.operator} ${condition.value}`,
    currentValue: indicatorValues.get(condition.indicator)?.toFixed(2) || 'N/A',
    met: evaluateCondition(condition, indicatorValues)
  }));
  
  const entryConditionsMet = entryResults.every(r => r.met);
  
  // Evaluate exit conditions
  const exitResults = strategy.exit_conditions.map(condition => ({
    condition: `${condition.indicator} ${condition.operator} ${condition.value}`,
    currentValue: indicatorValues.get(condition.indicator)?.toFixed(2) || 'N/A',
    met: evaluateCondition(condition, indicatorValues)
  }));
  
  // Determine signal
  let signalType: 'long' | 'short' | 'hold' = 'hold';
  let reason = 'Entry conditions not met';
  
  if (entryConditionsMet) {
    const trend = detectTrend(data);
    
    if (trend === 'bullish') {
      signalType = 'long';
      reason = 'Entry conditions met with bullish trend';
    } else if (trend === 'bearish') {
      signalType = 'short';
      reason = 'Entry conditions met with bearish trend';
    } else {
      signalType = 'long';
      reason = 'Entry conditions met (ranging market)';
    }
  }
  
  // Calculate stop loss and take profit
  const stopLossPercent = strategy.risk_settings.stopLossPercent;
  const takeProfitPercent = strategy.risk_settings.takeProfitPercent;
  
  const stopLoss = signalType === 'long' 
    ? currentPrice * (1 - stopLossPercent / 100)
    : currentPrice * (1 + stopLossPercent / 100);
    
  const takeProfit = signalType === 'long'
    ? currentPrice * (1 + takeProfitPercent / 100)
    : currentPrice * (1 - takeProfitPercent / 100);
  
  const conditionsMet = entryResults.filter(r => r.met).length;
  const confidenceScore = strategy.entry_conditions.length > 0
    ? Math.round((conditionsMet / strategy.entry_conditions.length) * 100)
    : 0;
  
  return {
    symbol: data.symbol,
    signalType,
    trend: detectTrend(data),
    entryPrice: currentPrice,
    stopLoss: stopLoss.toFixed(2),
    takeProfit: takeProfit.toFixed(2),
    confidenceScore,
    reason,
    entryConditions: entryResults,
    exitConditions: exitResults,
    indicatorValues: Object.fromEntries(
      Array.from(indicatorValues.entries()).map(([k, v]) => [k, v.toFixed(2)])
    ),
    marketData: {
      price: currentPrice.toFixed(2),
      change: changePercent.toFixed(2) + '%',
      volume: parseFloat(data.volume).toLocaleString(),
    }
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { strategy } = await req.json();
    
    if (!strategy) {
      throw new Error('Strategy configuration is required');
    }

    console.log(`Testing strategy: ${strategy.name}`);

    // Fetch current market data
    const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'ADAUSDT'];
    
    const marketDataPromises = symbols.map(async (symbol) => {
      const response = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);
      return response.json();
    });

    const marketData = await Promise.all(marketDataPromises);
    console.log('Market data fetched successfully');
    
    // Test strategy against all symbols
    const results = marketData.map(data => testStrategy(data, strategy));
    
    // Summary statistics
    const signalsGenerated = results.filter(r => r.signalType !== 'hold').length;
    const longSignals = results.filter(r => r.signalType === 'long').length;
    const shortSignals = results.filter(r => r.signalType === 'short').length;
    const avgConfidence = results.reduce((sum, r) => sum + r.confidenceScore, 0) / results.length;

    return new Response(
      JSON.stringify({ 
        success: true,
        strategyName: strategy.name,
        results,
        summary: {
          totalSymbolsTested: results.length,
          signalsGenerated,
          longSignals,
          shortSignals,
          holdSignals: results.length - signalsGenerated,
          averageConfidence: avgConfidence.toFixed(1)
        },
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error) {
    console.error('Error in test-strategy:', error);
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
