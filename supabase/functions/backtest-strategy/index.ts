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
  exitReason: string;
  qualityScore?: number;
}

interface BacktestPosition {
  type: 'long' | 'short';
  entryPrice: number;
  size: number;
  timestamp: string;
  stopLoss: number;
  takeProfit: number;
  breakEvenActivated: boolean;
  peakPnlPercent: number;
  qualityScore?: number;
  strategyName?: string;
}

// ============= INLINE INDICATOR CALCULATIONS =============
// These are optimized for backtest performance

function calculateEMA(prices: number[], period: number): number[] {
  const multiplier = 2 / (period + 1);
  const ema: number[] = [];
  let prevEma = prices[0];
  
  for (let i = 0; i < prices.length; i++) {
    if (i === 0) {
      ema.push(prices[0]);
    } else {
      prevEma = (prices[i] - prevEma) * multiplier + prevEma;
      ema.push(prevEma);
    }
  }
  return ema;
}

function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;
  
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = prices[prices.length - period - 1 + i] - prices[prices.length - period - 2 + i];
    if (change > 0) gains += change;
    else losses -= change;
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateStochRSI(prices: number[], rsiPeriod: number = 14, stochPeriod: number = 14): { k: number; d: number } {
  if (prices.length < rsiPeriod + stochPeriod) return { k: 50, d: 50 };
  
  // Calculate RSI values
  const rsiValues: number[] = [];
  for (let i = rsiPeriod; i < prices.length; i++) {
    const slice = prices.slice(0, i + 1);
    rsiValues.push(calculateRSI(slice, rsiPeriod));
  }
  
  if (rsiValues.length < stochPeriod) return { k: 50, d: 50 };
  
  const recentRsi = rsiValues.slice(-stochPeriod);
  const minRsi = Math.min(...recentRsi);
  const maxRsi = Math.max(...recentRsi);
  const currentRsi = rsiValues[rsiValues.length - 1];
  
  const k = maxRsi === minRsi ? 50 : ((currentRsi - minRsi) / (maxRsi - minRsi)) * 100;
  const d = recentRsi.slice(-3).reduce((a, b) => a + b, 0) / 3; // Simple 3-period SMA
  
  return { k, d: Math.min(100, Math.max(0, d)) };
}

function calculateADX(highs: number[], lows: number[], closes: number[], period: number = 14): number {
  if (highs.length < period * 2) return 20;
  
  const tr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  
  for (let i = 1; i < highs.length; i++) {
    const high = highs[i], low = lows[i], prevHigh = highs[i-1], prevLow = lows[i-1], prevClose = closes[i-1];
    
    tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
    
    const upMove = high - prevHigh;
    const downMove = prevLow - low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  
  // Smooth using Wilder's method
  let atr = tr.slice(0, period).reduce((a, b) => a + b, 0);
  let plusDI = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
  let minusDI = minusDM.slice(0, period).reduce((a, b) => a + b, 0);
  
  const dx: number[] = [];
  for (let i = period; i < tr.length; i++) {
    atr = atr - atr / period + tr[i];
    plusDI = plusDI - plusDI / period + plusDM[i];
    minusDI = minusDI - minusDI / period + minusDM[i];
    
    const pdi = atr > 0 ? (plusDI / atr) * 100 : 0;
    const mdi = atr > 0 ? (minusDI / atr) * 100 : 0;
    const sum = pdi + mdi;
    dx.push(sum > 0 ? Math.abs(pdi - mdi) / sum * 100 : 0);
  }
  
  if (dx.length < period) return 20;
  return dx.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calculateMACD(prices: number[]): { macd: number; signal: number; histogram: number } {
  if (prices.length < 35) return { macd: 0, signal: 0, histogram: 0 };
  
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = calculateEMA(macdLine.slice(-35), 9);
  
  const macd = macdLine[macdLine.length - 1];
  const signal = signalLine[signalLine.length - 1];
  
  return { macd, signal, histogram: macd - signal };
}

function calculateATR(highs: number[], lows: number[], closes: number[], period: number = 14): number {
  if (highs.length < period + 1) return 0;
  
  const tr: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    tr.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i-1]),
      Math.abs(lows[i] - closes[i-1])
    ));
  }
  
  return tr.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function determineTrend(prices: number[], period: number = 20): { trend: string; confidence: number } {
  if (prices.length < period) return { trend: 'neutral', confidence: 50 };
  
  const recentPrices = prices.slice(-period);
  const sma = recentPrices.reduce((a, b) => a + b, 0) / period;
  const currentPrice = prices[prices.length - 1];
  
  const priceVsSma = ((currentPrice - sma) / sma) * 100;
  
  // Calculate trend strength using linear regression slope
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < period; i++) {
    sumX += i;
    sumY += recentPrices[i];
    sumXY += i * recentPrices[i];
    sumX2 += i * i;
  }
  const slope = (period * sumXY - sumX * sumY) / (period * sumX2 - sumX * sumX);
  const normalizedSlope = (slope / sma) * 100 * period;
  
  let trend: string;
  let confidence: number;
  
  if (normalizedSlope > 0.5 && priceVsSma > 0.5) {
    trend = 'bullish';
    confidence = Math.min(85, 50 + Math.abs(normalizedSlope) * 10 + Math.abs(priceVsSma) * 5);
  } else if (normalizedSlope < -0.5 && priceVsSma < -0.5) {
    trend = 'bearish';
    confidence = Math.min(85, 50 + Math.abs(normalizedSlope) * 10 + Math.abs(priceVsSma) * 5);
  } else {
    trend = 'neutral';
    confidence = 50 - Math.min(20, Math.abs(normalizedSlope) * 5);
  }
  
  return { trend, confidence };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { strategyId, symbol, startDate, endDate, initialCapital } = await req.json();
    console.log('Running optimized backtest:', { strategyId, symbol, startDate, endDate, initialCapital });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get authenticated user
    let userId: string | null = null;
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) userId = user.id;
    }

    // Fetch strategy configuration
    let strategy: any = null;
    let isCustomStrategy = false;
    let signalDirection: 'long' | 'short' | 'trend' = 'trend';

    const builtInStrategies: { [key: string]: any } = {
      'mean-reversion': { name: 'Mean Reversion', signal_direction: 'trend', risk_management: { stopLossPercent: 2, takeProfitPercent: 4 } },
      'momentum': { name: 'Momentum', signal_direction: 'trend', risk_management: { stopLossPercent: 3, takeProfitPercent: 6 } },
      'grid': { name: 'Grid Trading', signal_direction: 'trend', risk_management: { stopLossPercent: 1.5, takeProfitPercent: 1.5 } },
    };

    if (builtInStrategies[strategyId]) {
      strategy = builtInStrategies[strategyId];
      signalDirection = strategy.signal_direction || 'trend';
    } else {
      const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(strategyId);
      if (isValidUUID) {
        const { data: customStrategy } = await supabase.from('custom_strategies').select('*').eq('id', strategyId).maybeSingle();
        if (customStrategy) {
          strategy = customStrategy;
          isCustomStrategy = true;
          signalDirection = customStrategy.signal_direction || 'trend';
        }
      }
    }

    if (!strategy) throw new Error(`Strategy with ID ${strategyId} not found.`);
    console.log('Using strategy:', strategy.name, 'Direction:', signalDirection);

    // ============= FETCH HISTORICAL KLINES (1h only for speed) =============
    const startTime = new Date(startDate).getTime();
    const endTime = new Date(endDate).getTime();
    const bufferMs = 100 * 60 * 60 * 1000; // 100 hours buffer for indicators
    const fetchStartTime = startTime - bufferMs;

    console.log('Fetching 1h klines...');
    
    async function fetchAllKlines(symbol: string, interval: string, start: number, end: number): Promise<any[]> {
      const allKlines: any[] = [];
      let currentStart = start;
      
      while (currentStart < end) {
        const response = await fetch(
          `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${currentStart}&endTime=${end}&limit=1000`
        );
        if (!response.ok) throw new Error(`Failed to fetch klines: ${response.statusText}`);
        const klines = await response.json();
        if (klines.length === 0) break;
        allKlines.push(...klines);
        currentStart = klines[klines.length - 1][0] + 1;
        if (currentStart < end) await new Promise(r => setTimeout(r, 50));
      }
      return allKlines;
    }

    const allKlines1h = await fetchAllKlines(symbol, '1h', fetchStartTime, endTime);
    console.log(`Fetched ${allKlines1h.length} 1h klines`);

    // Filter to simulation period
    const simulationKlines = allKlines1h.filter((k: any) => k[0] >= startTime);
    console.log(`Simulating ${simulationKlines.length} candles`);

    // ============= PREPARE PRICE ARRAYS =============
    const closes: number[] = allKlines1h.map((k: any) => parseFloat(k[4]));
    const highs: number[] = allKlines1h.map((k: any) => parseFloat(k[2]));
    const lows: number[] = allKlines1h.map((k: any) => parseFloat(k[3]));

    // ============= BACKTEST SIMULATION =============
    const trades: Trade[] = [];
    const volumeData: Array<{ timestamp: string; price: number; volume: number }> = [];
    let currentCapital = initialCapital;
    let position: BacktestPosition | null = null;
    let maxCapital = initialCapital;
    let maxDrawdown = 0;

    // Risk parameters
    const MIN_ADX = 20;
    const MIN_QUALITY = 50;
    const BREAK_EVEN_ACTIVATION = 0.5;
    const TRAILING_ACTIVATION = 1.0;
    const MIN_STOP_DISTANCE = 1.0;
    const TRAILING_LOCK = 0.5;
    const STOCHRSI_OVERSOLD = 20;
    const STOCHRSI_OVERBOUGHT = 80;

    // Find start index in allKlines1h
    const startIdx = allKlines1h.findIndex((k: any) => k[0] >= startTime);
    if (startIdx === -1) throw new Error('No klines found for simulation period');

    console.log(`Starting simulation from index ${startIdx}...`);

    for (let i = startIdx; i < allKlines1h.length; i++) {
      const currentCandle = allKlines1h[i];
      const currentPrice = parseFloat(currentCandle[4]);
      const highPrice = parseFloat(currentCandle[2]);
      const lowPrice = parseFloat(currentCandle[3]);
      const currentVolume = parseFloat(currentCandle[5]);
      const timestamp = new Date(currentCandle[0]).toISOString();

      // Sample volume data
      if ((i - startIdx) % 10 === 0) {
        volumeData.push({ timestamp, price: currentPrice, volume: currentVolume });
      }

      // Get price slices for indicators
      const priceSlice = closes.slice(0, i + 1);
      const highSlice = highs.slice(0, i + 1);
      const lowSlice = lows.slice(0, i + 1);

      // Calculate indicators (only if we have enough data)
      if (priceSlice.length < 50) continue;

      const adx = calculateADX(highSlice, lowSlice, priceSlice);
      const { trend: trend1h, confidence: confidence1h } = determineTrend(priceSlice, 20);
      const { trend: trend4h, confidence: confidence4h } = determineTrend(priceSlice, 80); // Approximate 4h using 80 1h candles
      const stochRsi = calculateStochRSI(priceSlice);
      const macd = calculateMACD(priceSlice);
      const atr = calculateATR(highSlice, lowSlice, priceSlice);
      const atrPercent = (atr / currentPrice) * 100;

      // Momentum check
      const momentumConfirms = macd.histogram > 0 ? trend1h === 'bullish' : trend1h === 'bearish';

      // ============= POSITION MANAGEMENT =============
      if (position) {
        const pnlPercent = position.type === 'long'
          ? ((currentPrice - position.entryPrice) / position.entryPrice) * 100
          : ((position.entryPrice - currentPrice) / position.entryPrice) * 100;

        if (pnlPercent > position.peakPnlPercent) position.peakPnlPercent = pnlPercent;

        let exitPrice: number | null = null;
        let exitReason = '';

        // Stop loss check
        if (position.type === 'long' && lowPrice <= position.stopLoss) {
          exitPrice = position.stopLoss;
          exitReason = position.breakEvenActivated ? 'break_even_stop' : 'stop_loss';
        } else if (position.type === 'short' && highPrice >= position.stopLoss) {
          exitPrice = position.stopLoss;
          exitReason = position.breakEvenActivated ? 'break_even_stop' : 'stop_loss';
        }

        // Take profit check
        if (!exitPrice) {
          if (position.type === 'long' && highPrice >= position.takeProfit) {
            exitPrice = position.takeProfit;
            exitReason = 'take_profit';
          } else if (position.type === 'short' && lowPrice <= position.takeProfit) {
            exitPrice = position.takeProfit;
            exitReason = 'take_profit';
          }
        }

        // Trend reversal exit
        if (!exitPrice) {
          if (position.type === 'long' && trend4h === 'bearish' && confidence4h >= 60) {
            exitPrice = currentPrice;
            exitReason = 'trend_reversal';
          } else if (position.type === 'short' && trend4h === 'bullish' && confidence4h >= 60) {
            exitPrice = currentPrice;
            exitReason = 'trend_reversal';
          }
        }

        // Break-even protection
        if (!position.breakEvenActivated && pnlPercent >= BREAK_EVEN_ACTIVATION) {
          const minDist = position.entryPrice * (MIN_STOP_DISTANCE / 100);
          if (position.type === 'long') {
            const newStop = position.entryPrice + minDist;
            if (newStop > position.stopLoss) { position.stopLoss = newStop; position.breakEvenActivated = true; }
          } else {
            const newStop = position.entryPrice - minDist;
            if (newStop < position.stopLoss) { position.stopLoss = newStop; position.breakEvenActivated = true; }
          }
        }

        // Trailing stop
        if (position.breakEvenActivated && pnlPercent >= TRAILING_ACTIVATION) {
          const trailDist = atrPercent * 1.5;
          const locked = position.peakPnlPercent * TRAILING_LOCK;
          if (position.type === 'long') {
            const trailStop = currentPrice * (1 - trailDist / 100);
            const lockStop = position.entryPrice * (1 + locked / 100);
            const newStop = Math.max(trailStop, lockStop, position.stopLoss);
            if (newStop > position.stopLoss) position.stopLoss = newStop;
          } else {
            const trailStop = currentPrice * (1 + trailDist / 100);
            const lockStop = position.entryPrice * (1 - locked / 100);
            const newStop = Math.min(trailStop, lockStop, position.stopLoss);
            if (newStop < position.stopLoss) position.stopLoss = newStop;
          }
        }

        // Execute exit
        if (exitPrice) {
          const profit = position.type === 'long'
            ? (exitPrice - position.entryPrice) * position.size
            : (position.entryPrice - exitPrice) * position.size;
          const profitPercent = position.type === 'long'
            ? ((exitPrice - position.entryPrice) / position.entryPrice) * 100
            : ((position.entryPrice - exitPrice) / position.entryPrice) * 100;

          currentCapital += profit;
          trades.push({
            entryPrice: position.entryPrice, exitPrice, type: position.type,
            profit, profitPercent, timestamp: position.timestamp, exitReason,
            qualityScore: position.qualityScore,
          });

          if (currentCapital > maxCapital) maxCapital = currentCapital;
          const dd = ((maxCapital - currentCapital) / maxCapital) * 100;
          if (dd > maxDrawdown) maxDrawdown = dd;

          position = null;
        }
      }

      // ============= ENTRY LOGIC =============
      if (!position) {
        // Hard gates
        if (adx < MIN_ADX) continue;
        if (!momentumConfirms) continue;

        // Determine entry direction
        let entryType: 'long' | 'short' | null = null;
        if (signalDirection === 'long') {
          if (trend4h === 'bullish' || (trend4h === 'neutral' && trend1h === 'bullish')) entryType = 'long';
        } else if (signalDirection === 'short') {
          if (trend4h === 'bearish' || (trend4h === 'neutral' && trend1h === 'bearish')) entryType = 'short';
        } else {
          if (trend4h === 'bullish') entryType = 'long';
          else if (trend4h === 'bearish') entryType = 'short';
        }
        if (!entryType) continue;

        // StochRSI filter
        if (entryType === 'short' && stochRsi.k < STOCHRSI_OVERSOLD) continue;
        if (entryType === 'long' && stochRsi.k > STOCHRSI_OVERBOUGHT) continue;

        // Quality score
        let qualityScore = 40;
        if (adx >= 35) qualityScore += 20;
        else if (adx >= 25) qualityScore += 15;
        else if (adx >= 20) qualityScore += 10;
        if (momentumConfirms) qualityScore += 15;
        if (trend4h === trend1h && trend1h !== 'neutral') qualityScore += 10;
        if (confidence4h >= 85) qualityScore -= 20;
        else if (confidence4h >= 80) qualityScore -= 15;
        else if (confidence4h >= 75) qualityScore -= 10;
        else if (confidence4h >= 70) qualityScore -= 6;

        if (qualityScore < MIN_QUALITY) continue;

        // Position sizing and levels
        const posSize = currentCapital * 0.95;
        const slDist = Math.max(atrPercent * 1.5, MIN_STOP_DISTANCE);
        const tpDist = slDist * 2.5;

        let stopLoss: number, takeProfit: number;
        if (entryType === 'long') {
          stopLoss = currentPrice * (1 - slDist / 100);
          takeProfit = currentPrice * (1 + tpDist / 100);
        } else {
          stopLoss = currentPrice * (1 + slDist / 100);
          takeProfit = currentPrice * (1 - tpDist / 100);
        }

        position = {
          type: entryType, entryPrice: currentPrice, size: posSize / currentPrice,
          timestamp, stopLoss, takeProfit, breakEvenActivated: false,
          peakPnlPercent: 0, qualityScore, strategyName: strategy.name,
        };
      }
    }

    // ============= CALCULATE STATISTICS =============
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

    // Sharpe Ratio
    const returns = trades.map(t => t.profitPercent);
    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const stdDev = returns.length > 0 ? Math.sqrt(returns.map(r => Math.pow(r - avgReturn, 2)).reduce((a, b) => a + b, 0) / returns.length) : 0;
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

    const exitReasons = trades.reduce((acc, t) => { acc[t.exitReason] = (acc[t.exitReason] || 0) + 1; return acc; }, {} as Record<string, number>);

    console.log(`Backtest complete: ${trades.length} trades, Win Rate: ${winRate.toFixed(1)}%, Net: $${netProfit.toFixed(2)}`);
    console.log('Exit reasons:', exitReasons);

    // Store results
    let backtestResult: any = {
      strategy_name: strategy.name, symbol, start_date: startDate, end_date: endDate,
      initial_capital: initialCapital, final_capital: currentCapital,
      total_trades: trades.length, winning_trades: winningTrades, losing_trades: losingTrades,
      win_rate: winRate, total_profit: totalProfit, total_loss: totalLoss, net_profit: netProfit,
      max_drawdown: maxDrawdown, sharpe_ratio: sharpeRatio, profit_factor: profitFactor,
      avg_win: avgWin, avg_loss: avgLoss, largest_win: largestWin, largest_loss: largestLoss,
      results_data: { trades, volumeData, exitReasons, systemVersion: '2.2-inline' },
    };

    if (userId) {
      const { data: dbResult, error: dbError } = await supabase
        .from('backtesting_results')
        .insert({ user_id: userId, strategy_id: isCustomStrategy ? strategyId : null, ...backtestResult })
        .select().single();
      if (!dbError && dbResult) backtestResult = dbResult;
    }

    return new Response(JSON.stringify({ success: true, results: backtestResult }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Backtest error:', error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500,
    });
  }
});
