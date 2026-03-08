import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.84.0";
import { calculateRSI, calculateEMA, calculateEMAArray, calculateMACD, calculateStochasticRSI, calculateATR, calculateADXWithDirection, type ADXResult } from "../_shared/indicators.ts";
import { parseKlinePrices } from "../_shared/binance.ts";
import { createLogger, LOG_CATEGORIES } from "../_shared/logging.ts";
import {
  ADX_THRESHOLDS,
  STOCHRSI_THRESHOLDS,
  QUALITY_THRESHOLDS,
  TRADING_FEE_PARAMS,
} from "../_shared/constants.ts";
import { calculateFeeAwarePnL } from "../_shared/exit-strategies.ts";

const logger = createLogger('backtest-runner');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ============= TYPES =============

interface BacktestConfig {
  symbols: string[];
  startDate: string;    // ISO date
  endDate: string;      // ISO date
  barInterval: string;  // '1h' or '4h'
}

interface BacktestTrade {
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  entryTime: string;
  exitTime: string;
  pnlPercent: number;
  netPnlPercent: number;
  exitReason: string;
  entryScore: number;
  stopLoss: number;
  takeProfit: number;
}

interface BacktestPosition {
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  entryTime: string;
  stopLoss: number;
  takeProfit: number;
  peakPnl: number;
  trailingStop: number | null;
  entryScore: number;
  atrAtEntry: number;
}

interface EquityPoint {
  time: string;
  equity: number;
  drawdown: number;
}

// ============= BINANCE HISTORICAL KLINES FETCH =============

async function fetchHistoricalKlines(
  symbol: string,
  interval: string,
  startTime: number,
  endTime: number,
): Promise<any[]> {
  const allKlines: any[] = [];
  let currentStart = startTime;
  const BATCH_LIMIT = 1000;

  while (currentStart < endTime) {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${currentStart}&endTime=${endTime}&limit=${BATCH_LIMIT}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Binance API error: ${response.status}`);
      }
      
      const klines = await response.json();
      if (!Array.isArray(klines) || klines.length === 0) break;
      
      allKlines.push(...klines);
      
      // Move start to after the last candle
      const lastOpenTime = klines[klines.length - 1][0];
      currentStart = lastOpenTime + 1;
      
      // Rate limit protection
      if (klines.length === BATCH_LIMIT) {
        await new Promise(r => setTimeout(r, 200));
      }
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  return allKlines;
}

// ============= SIGNAL GENERATION (uses same indicator logic) =============

interface SignalResult {
  type: 'LONG' | 'SHORT' | null;
  score: number;
  reason: string;
  gate: string | null;
}

function generateSignal(
  closes: number[],
  highs: number[],
  lows: number[],
  volumes: number[],
  klines: any[],
): SignalResult {
  if (closes.length < 50) return { type: null, score: 0, reason: 'insufficient_data', gate: null };

  // Calculate core indicators (same functions as production)
  const rsi = calculateRSI(closes, 14);
  const ema9 = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);
  const ema50 = calculateEMA(closes, 50);
  const currentPrice = closes[closes.length - 1];
  const atr = calculateATR(highs, lows, closes, 14);
  const atrPercent = atr > 0 && currentPrice > 0 ? (atr / currentPrice) * 100 : 1.5;

  // ADX calculation
  const adxResult: ADXResult = calculateADXWithDirection(highs, lows, closes, 14);
  const adx = adxResult.adx;
  const adxSlope = adxResult.slope;

  // StochRSI
  const stochResult = calculateStochasticRSI(closes, 14, 14, 3, 3);
  const stochK = stochResult.k;

  // MACD
  const macdResult = calculateMACD(closes);
  const macdHist = macdResult.histogram;
  const macdHistPrev = macdResult.histogramArray?.length > 1 
    ? macdResult.histogramArray[macdResult.histogramArray.length - 2] 
    : 0;

  // EMA trend alignment
  const emaTrendBullish = ema9 > ema21 && ema21 > ema50;
  const emaTrendBearish = ema9 < ema21 && ema21 < ema50;

  // ============= GATE CHECKS (using production constants) =============

  // Gate 1: ADX minimum
  if (adx < ADX_THRESHOLDS.WEAK) {
    return { type: null, score: 0, reason: 'ADX_TOO_LOW', gate: 'ADX_TOO_LOW' };
  }

  // Gate 2: Deep StochRSI extremes (K < 5 or K > 95)
  if (stochK < 5 || stochK > 95) {
    // Allow only if ADX is very strong (Strong Trend Tier0 Override)
    if (adx < 40) {
      return { type: null, score: 0, reason: 'DEEP_STOCHRSI_EXTREME', gate: 'DEEP_STOCHRSI_EXTREME' };
    }
  }

  // Determine signal direction
  let direction: 'LONG' | 'SHORT' | null = null;
  let score = 0;
  const reasons: string[] = [];

  // Bullish conditions
  if (emaTrendBullish && rsi > 40 && rsi < 70) {
    direction = 'LONG';
    score += 25;
    reasons.push('ema_bullish');
  }
  if (macdHist > 0 && macdHist > macdHistPrev) {
    if (!direction) direction = 'LONG';
    score += 20;
    reasons.push('macd_bullish_accel');
  }
  if (stochK > 20 && stochK < 80 && direction === 'LONG') {
    score += 15;
    reasons.push('stoch_neutral');
  }
  if (adx > ADX_THRESHOLDS.MODERATE && adxSlope > 0) {
    score += 15;
    reasons.push('adx_rising');
  }

  // Bearish conditions
  if (emaTrendBearish && rsi < 60 && rsi > 30) {
    direction = 'SHORT';
    score += 25;
    reasons.push('ema_bearish');
  }
  if (macdHist < 0 && macdHist < macdHistPrev) {
    if (!direction) direction = 'SHORT';
    if (direction === 'SHORT') {
      score += 20;
      reasons.push('macd_bearish_accel');
    }
  }

  // Gate 3: Minimum quality
  if (score < QUALITY_THRESHOLDS.MIN_ENTRY_QUALITY) {
    return { type: null, score, reason: 'LOW_QUALITY', gate: 'LOW_QUALITY' };
  }

  // Gate 4: Counter-trend protection
  if (direction === 'LONG' && emaTrendBearish && adx > 35) {
    return { type: null, score, reason: 'COUNTER_TREND', gate: 'COUNTER_TREND' };
  }
  if (direction === 'SHORT' && emaTrendBullish && adx > 35) {
    return { type: null, score, reason: 'COUNTER_TREND', gate: 'COUNTER_TREND' };
  }

  if (!direction) {
    return { type: null, score: 0, reason: 'NO_DIRECTION', gate: 'NO_DIRECTION' };
  }

  return { type: direction, score, reason: reasons.join(', '), gate: null };
}

// ============= POSITION MANAGEMENT =============

function checkExits(
  position: BacktestPosition,
  currentPrice: number,
  currentTime: string,
  atr: number,
): { shouldExit: boolean; exitReason: string } {
  const pnlPercent = position.side === 'LONG'
    ? ((currentPrice - position.entryPrice) / position.entryPrice) * 100
    : ((position.entryPrice - currentPrice) / position.entryPrice) * 100;

  // 1. Stop Loss
  if (position.side === 'LONG' && currentPrice <= position.stopLoss) {
    return { shouldExit: true, exitReason: 'stop_loss' };
  }
  if (position.side === 'SHORT' && currentPrice >= position.stopLoss) {
    return { shouldExit: true, exitReason: 'stop_loss' };
  }

  // 2. Take Profit
  if (position.side === 'LONG' && currentPrice >= position.takeProfit) {
    return { shouldExit: true, exitReason: 'take_profit' };
  }
  if (position.side === 'SHORT' && currentPrice <= position.takeProfit) {
    return { shouldExit: true, exitReason: 'take_profit' };
  }

  // 3. Trailing Stop (activate at 1% profit, trail at 0.5%)
  if (pnlPercent > position.peakPnl) {
    position.peakPnl = pnlPercent;
  }

  if (position.peakPnl >= 1.0) {
    const trailDistance = Math.max(0.5, position.atrAtEntry * 0.5);
    const lockLevel = position.peakPnl - trailDistance;
    
    if (pnlPercent < lockLevel && pnlPercent > 0) {
      return { shouldExit: true, exitReason: 'trailing_stop' };
    }
  }

  // 4. Time stop (24 hours max hold)
  const entryTime = new Date(position.entryTime).getTime();
  const currentTimestamp = new Date(currentTime).getTime();
  const hoursHeld = (currentTimestamp - entryTime) / (1000 * 60 * 60);
  
  if (hoursHeld > 24) {
    return { shouldExit: true, exitReason: 'time_stop_24h' };
  }

  // 5. Decay protection: if peak was > 0.8% and now below 0.3%
  if (position.peakPnl > 0.8 && pnlPercent < 0.3) {
    return { shouldExit: true, exitReason: 'profit_decay' };
  }

  return { shouldExit: false, exitReason: '' };
}

// ============= MAIN BACKTEST LOOP =============

async function runBacktest(
  config: BacktestConfig,
  userId: string,
  supabase: any,
  backtestId: string,
): Promise<void> {
  const startMs = Date.now();
  const trades: BacktestTrade[] = [];
  const equityCurve: EquityPoint[] = [];
  const gateStats: Record<string, number> = {};
  let equity = 10000; // Start with $10k
  let peakEquity = equity;

  try {
    const startTime = new Date(config.startDate).getTime();
    const endTime = new Date(config.endDate).getTime();
    const barMs = config.barInterval === '4h' ? 4 * 60 * 60 * 1000 : 60 * 60 * 1000;
    
    // Lookback needed for indicators (50 bars before start)
    const lookbackMs = 100 * barMs;
    
    for (const symbol of config.symbols) {
      logger.info(`${LOG_CATEGORIES.SUCCESS} Backtest: fetching klines for ${symbol}`);
      
      // Fetch all historical klines including lookback
      const allKlines = await fetchHistoricalKlines(
        symbol,
        config.barInterval,
        startTime - lookbackMs,
        endTime,
      );
      
      if (allKlines.length < 60) {
        logger.warn(`Insufficient klines for ${symbol}: ${allKlines.length}`);
        continue;
      }

      logger.info(`${LOG_CATEGORIES.SUCCESS} Backtest: ${symbol} loaded ${allKlines.length} bars`);

      // Parse all prices
      const allParsed = parseKlinePrices(allKlines);
      
      // Find start index (first bar >= startTime)
      let startIdx = 0;
      for (let i = 0; i < allKlines.length; i++) {
        if (allKlines[i][0] >= startTime) {
          startIdx = i;
          break;
        }
      }

      // Active positions for this symbol
      const openPositions: BacktestPosition[] = [];

      // Iterate bar by bar from startIdx
      for (let i = startIdx; i < allKlines.length; i++) {
        const barTime = new Date(allKlines[i][0]).toISOString();
        const currentPrice = allParsed.closes[i];
        
        // Slice data up to current bar (simulates "what was available")
        const windowCloses = allParsed.closes.slice(0, i + 1);
        const windowHighs = allParsed.highs.slice(0, i + 1);
        const windowLows = allParsed.lows.slice(0, i + 1);
        const windowVolumes = allParsed.volumes.slice(0, i + 1);
        const windowKlines = allKlines.slice(0, i + 1);

        // Check exits on open positions
        const atr = windowCloses.length > 14 ? calculateATR(windowHighs, windowLows, windowCloses, 14) : currentPrice * 0.015;
        
        for (let p = openPositions.length - 1; p >= 0; p--) {
          const pos = openPositions[p];
          const exitResult = checkExits(pos, currentPrice, barTime, atr);
          
          if (exitResult.shouldExit) {
            const pnl = calculateFeeAwarePnL(
              pos.side === 'LONG' ? 'BUY' : 'SELL',
              pos.entryPrice,
              currentPrice,
              1, // quantity
              TRADING_FEE_PARAMS.DEFAULT_FEE_RATE_PERCENT,
            );

            trades.push({
              symbol,
              side: pos.side,
              entryPrice: pos.entryPrice,
              exitPrice: currentPrice,
              entryTime: pos.entryTime,
              exitTime: barTime,
              pnlPercent: pnl.grossPnlPercent,
              netPnlPercent: pnl.netPnlPercent,
              exitReason: exitResult.exitReason,
              entryScore: pos.entryScore,
              stopLoss: pos.stopLoss,
              takeProfit: pos.takeProfit,
            });

            // Update equity
            const positionSize = equity * 0.015; // 1.5% position
            equity += positionSize * (pnl.netPnlPercent / 100);
            peakEquity = Math.max(peakEquity, equity);

            openPositions.splice(p, 1);
          }
        }

        // Try to generate a signal (only if no open position for this symbol)
        if (openPositions.filter(p => p.symbol === symbol).length === 0) {
          const signal = generateSignal(windowCloses, windowHighs, windowLows, windowVolumes, windowKlines);
          
          if (signal.gate) {
            gateStats[signal.gate] = (gateStats[signal.gate] || 0) + 1;
          }

          if (signal.type && !signal.gate) {
            const atrAtEntry = atr;
            const atrPct = (atrAtEntry / currentPrice) * 100;
            
            // SL/TP using ATR (same as production)
            const slMultiplier = 1.5;
            const tpMultiplier = 2.5;
            
            let stopLoss: number, takeProfit: number;
            if (signal.type === 'LONG') {
              stopLoss = currentPrice - (atrAtEntry * slMultiplier);
              takeProfit = currentPrice + (atrAtEntry * tpMultiplier);
            } else {
              stopLoss = currentPrice + (atrAtEntry * slMultiplier);
              takeProfit = currentPrice - (atrAtEntry * tpMultiplier);
            }

            openPositions.push({
              symbol,
              side: signal.type,
              entryPrice: currentPrice,
              entryTime: barTime,
              stopLoss,
              takeProfit,
              peakPnl: 0,
              trailingStop: null,
              entryScore: signal.score,
              atrAtEntry: atrPct,
            });
          }
        }

        // Record equity curve (every bar)
        const drawdown = peakEquity > 0 ? ((peakEquity - equity) / peakEquity) * 100 : 0;
        equityCurve.push({
          time: barTime,
          equity: Math.round(equity * 100) / 100,
          drawdown: Math.round(drawdown * 100) / 100,
        });
      }

      // Force-close any remaining open positions at last price
      const lastPrice = allParsed.closes[allParsed.closes.length - 1];
      const lastTime = new Date(allKlines[allKlines.length - 1][0]).toISOString();
      
      for (const pos of openPositions) {
        const pnl = calculateFeeAwarePnL(
          pos.side === 'LONG' ? 'BUY' : 'SELL',
          pos.entryPrice,
          lastPrice,
          1,
          TRADING_FEE_PARAMS.DEFAULT_FEE_RATE_PERCENT,
        );
        
        trades.push({
          symbol,
          side: pos.side,
          entryPrice: pos.entryPrice,
          exitPrice: lastPrice,
          entryTime: pos.entryTime,
          exitTime: lastTime,
          pnlPercent: pnl.grossPnlPercent,
          netPnlPercent: pnl.netPnlPercent,
          exitReason: 'backtest_end',
          entryScore: pos.entryScore,
          stopLoss: pos.stopLoss,
          takeProfit: pos.takeProfit,
        });

        const positionSize = equity * 0.015;
        equity += positionSize * (pnl.netPnlPercent / 100);
      }
    }

    // Calculate summary metrics
    const winningTrades = trades.filter(t => t.netPnlPercent > 0);
    const losingTrades = trades.filter(t => t.netPnlPercent <= 0);
    const winRate = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0;
    const avgWin = winningTrades.length > 0 ? winningTrades.reduce((s, t) => s + t.netPnlPercent, 0) / winningTrades.length : 0;
    const avgLoss = losingTrades.length > 0 ? Math.abs(losingTrades.reduce((s, t) => s + t.netPnlPercent, 0) / losingTrades.length) : 0;
    const profitFactor = avgLoss > 0 ? (avgWin * winningTrades.length) / (avgLoss * losingTrades.length) : winningTrades.length > 0 ? Infinity : 0;
    const maxDrawdown = equityCurve.length > 0 ? Math.max(...equityCurve.map(e => e.drawdown)) : 0;
    const totalReturn = ((equity - 10000) / 10000) * 100;
    
    // Exit reason breakdown
    const exitBreakdown: Record<string, number> = {};
    for (const t of trades) {
      exitBreakdown[t.exitReason] = (exitBreakdown[t.exitReason] || 0) + 1;
    }

    const summary = {
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: Math.round(winRate * 10) / 10,
      avgWinPercent: Math.round(avgWin * 1000) / 1000,
      avgLossPercent: Math.round(avgLoss * 1000) / 1000,
      profitFactor: profitFactor === Infinity ? 999 : Math.round(profitFactor * 100) / 100,
      maxDrawdownPercent: Math.round(maxDrawdown * 100) / 100,
      totalReturnPercent: Math.round(totalReturn * 100) / 100,
      finalEquity: Math.round(equity * 100) / 100,
      exitBreakdown,
    };

    const durationMs = Date.now() - startMs;

    // Downsample equity curve if too large (keep max 500 points)
    let finalEquityCurve = equityCurve;
    if (equityCurve.length > 500) {
      const step = Math.ceil(equityCurve.length / 500);
      finalEquityCurve = equityCurve.filter((_, i) => i % step === 0 || i === equityCurve.length - 1);
    }

    // Update result
    await supabase
      .from('backtest_results')
      .update({
        status: 'completed',
        summary,
        trades,
        equity_curve: finalEquityCurve,
        gate_stats: gateStats,
        duration_ms: durationMs,
      })
      .eq('id', backtestId);

    logger.info(`${LOG_CATEGORIES.SUCCESS} Backtest completed: ${trades.length} trades, ${winRate.toFixed(1)}% win rate, ${totalReturn.toFixed(2)}% return in ${durationMs}ms`);

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.warn(`Backtest failed: ${errorMsg}`);
    
    await supabase
      .from('backtest_results')
      .update({
        status: 'failed',
        error_message: errorMsg,
        duration_ms: Date.now() - startMs,
      })
      .eq('id', backtestId);
  }
}

// ============= HTTP HANDLER =============

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const body = await req.json();
    const config: BacktestConfig = {
      symbols: body.symbols || ['BTCUSDT'],
      startDate: body.startDate,
      endDate: body.endDate,
      barInterval: body.barInterval || '1h',
    };

    // Validation
    const startDate = new Date(config.startDate);
    const endDate = new Date(config.endDate);
    const daysDiff = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);

    if (daysDiff > 30) {
      return new Response(JSON.stringify({ error: 'Maximum backtest period is 30 days' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (daysDiff < 1) {
      return new Response(JSON.stringify({ error: 'Minimum backtest period is 1 day' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check for running backtests
    const { data: running } = await supabase
      .from('backtest_results')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'running')
      .limit(1);

    if (running && running.length > 0) {
      return new Response(JSON.stringify({ error: 'A backtest is already running. Please wait for it to complete.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Create backtest record
    const { data: backtestRecord, error: insertError } = await supabase
      .from('backtest_results')
      .insert({
        user_id: user.id,
        config,
        status: 'running',
      })
      .select('id')
      .single();

    if (insertError || !backtestRecord) {
      throw new Error(`Failed to create backtest record: ${insertError?.message}`);
    }

    // Run backtest (non-blocking via EdgeRuntime.waitUntil if available, else inline)
    // Since edge functions have 60s timeout, we run inline
    await runBacktest(config, user.id, supabase, backtestRecord.id);

    // Return the backtest ID immediately
    return new Response(JSON.stringify({ 
      id: backtestRecord.id,
      status: 'completed',
      message: 'Backtest completed' 
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.warn(`Backtest handler error: ${errorMsg}`);
    return new Response(JSON.stringify({ error: errorMsg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
