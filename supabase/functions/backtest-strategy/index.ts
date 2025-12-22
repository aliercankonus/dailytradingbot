import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

// Import shared modules - same code as calculate-trend uses
import { ADX_THRESHOLDS, STOCHRSI_THRESHOLDS, RISK_PARAMS, CONFIDENCE_THRESHOLDS, QUALITY_THRESHOLDS, EMERGENCY_EXIT_PARAMS, EXIT_THRESHOLDS, detectStrategyType, isMomentumStrategy, isMeanReversionStrategy } from "../_shared/constants.ts";
import { calculateATR } from "../_shared/indicators.ts";
import { analyzeMultiTimeframe, MultiTimeframeTrendData } from "../_shared/trend-core.ts";
import { 
  getAdxScore, 
  getMomentumScore, 
  getConfidencePenalty, 
  getAlignmentScore,
  getVolumeScore,
  calculateUnifiedReversalScore
} from "../_shared/scoring.ts";
import { createLogger, logError } from "../_shared/logging.ts";

// Create logger instance
const logger = createLogger("backtest-strategy");

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

/**
 * ============= ALIGNED BACKTEST SYSTEM =============
 * 
 * Uses the SAME shared modules as calculate-trend to ensure
 * 100% alignment between backtest results and live trading.
 * 
 * Changes to _shared/indicators.ts or _shared/trend-core.ts
 * automatically apply to both live trading and backtesting.
 * =================================================
 */

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logger.boot();
    
    const { strategyId, symbol, startDate, endDate, initialCapital } = await req.json();
    const symLogger = logger.forSymbol(symbol);
    symLogger.info(`Running ALIGNED backtest: strategy=${strategyId}, period=${startDate} to ${endDate}, capital=$${initialCapital}`);

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
    symLogger.info(`Using strategy: ${strategy.name}, Direction: ${signalDirection}`);

    // ============= FETCH HISTORICAL KLINES =============
    const startTime = new Date(startDate).getTime();
    const endTime = new Date(endDate).getTime();
    const bufferMs = 100 * 60 * 60 * 1000; // 100 hours buffer for indicators
    const fetchStartTime = startTime - bufferMs;

    symLogger.info('Fetching historical klines...');
    
    async function fetchAllKlines(sym: string, interval: string, start: number, end: number): Promise<any[]> {
      const allKlines: any[] = [];
      let currentStart = start;
      
      while (currentStart < end) {
        const response = await fetch(
          `https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${interval}&startTime=${currentStart}&endTime=${end}&limit=1000`
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

    // Fetch both timeframes in parallel
    const [allKlines1h, allKlines4h] = await Promise.all([
      fetchAllKlines(symbol, '1h', fetchStartTime, endTime),
      fetchAllKlines(symbol, '4h', fetchStartTime, endTime),
    ]);

    symLogger.info(`Fetched klines: 1h=${allKlines1h.length}, 4h=${allKlines4h.length}`);

    // Filter to simulation period
    const simulationKlines1h = allKlines1h.filter((k: any) => k[0] >= startTime);
    symLogger.info(`Simulating ${simulationKlines1h.length} candles`);

    // ============= BACKTEST SIMULATION =============
    const trades: Trade[] = [];
    const volumeData: Array<{ timestamp: string; price: number; volume: number }> = [];
    let currentCapital = initialCapital;
    let position: BacktestPosition | null = null;
    let maxCapital = initialCapital;
    let maxDrawdown = 0;

    // Find start index in allKlines1h
    const startIdx = allKlines1h.findIndex((k: any) => k[0] >= startTime);
    if (startIdx === -1) throw new Error('No klines found for simulation period');

    symLogger.debug(`Starting simulation from index ${startIdx}...`);

    // Helper to get klines slice for a timestamp
    function getKlinesSlice(allKlines: any[], endTimestamp: number, count: number): any[] {
      const endIndex = allKlines.findIndex((k: any) => k[0] > endTimestamp);
      const actualEndIndex = endIndex === -1 ? allKlines.length : endIndex;
      return allKlines.slice(Math.max(0, actualEndIndex - count), actualEndIndex);
    }

    // ============= VOLUME ANALYSIS HELPER =============
    // Calculates volume metrics from kline data for scoring
    function analyzeVolume(klines: any[], trend: string): {
      volumeConfirms: boolean;
      volumeSpike: boolean;
      volumeRatio: number;
      hasRangeExpansion: boolean;
    } {
      if (klines.length < 20) {
        return { volumeConfirms: false, volumeSpike: false, volumeRatio: 1.0, hasRangeExpansion: false };
      }

      // Get current and recent volumes
      const currentVolume = parseFloat(klines[klines.length - 1][5]);
      const recentVolumes = klines.slice(-20).map((k: any) => parseFloat(k[5]));
      const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
      
      // Volume ratio (current vs average)
      const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 1.0;
      
      // Volume spike detection (>2x average) - uses centralized threshold
      const volumeSpike = volumeRatio > EMERGENCY_EXIT_PARAMS.VOLATILITY_SPIKE_THRESHOLD;
      
      // Volume confirms trend direction
      // For bullish: volume should increase on up candles
      // For bearish: volume should increase on down candles
      const currentCandle = klines[klines.length - 1];
      const prevCandle = klines[klines.length - 2];
      const currentClose = parseFloat(currentCandle[4]);
      const currentOpen = parseFloat(currentCandle[1]);
      const prevVolume = parseFloat(prevCandle[5]);
      
      const isBullishCandle = currentClose > currentOpen;
      const isBearishCandle = currentClose < currentOpen;
      const volumeIncreasing = currentVolume > prevVolume;
      
      let volumeConfirms = false;
      if (trend === 'bullish' && isBullishCandle && volumeIncreasing && volumeRatio > 1.2) {
        volumeConfirms = true;
      } else if (trend === 'bearish' && isBearishCandle && volumeIncreasing && volumeRatio > 1.2) {
        volumeConfirms = true;
      }
      
      // Range expansion: current candle range vs recent average range
      const currentRange = parseFloat(currentCandle[2]) - parseFloat(currentCandle[3]);
      const recentRanges = klines.slice(-20).map((k: any) => parseFloat(k[2]) - parseFloat(k[3]));
      const avgRange = recentRanges.reduce((a, b) => a + b, 0) / recentRanges.length;
      const hasRangeExpansion = avgRange > 0 ? (currentRange / avgRange) > 1.0 : false;
      
      return { volumeConfirms, volumeSpike, volumeRatio, hasRangeExpansion };
    }

    for (let i = startIdx; i < allKlines1h.length; i++) {
      const currentCandle = allKlines1h[i];
      const candleTimestamp = currentCandle[0];
      const currentPrice = parseFloat(currentCandle[4]);
      const highPrice = parseFloat(currentCandle[2]);
      const lowPrice = parseFloat(currentCandle[3]);
      const currentVolume = parseFloat(currentCandle[5]);
      const timestamp = new Date(candleTimestamp).toISOString();

      // Sample volume data
      if ((i - startIdx) % 10 === 0) {
        volumeData.push({ timestamp, price: currentPrice, volume: currentVolume });
      }

      // Get kline slices for this timestamp
      const klines1hSlice = getKlinesSlice(allKlines1h, candleTimestamp, 100);
      const klines4hSlice = getKlinesSlice(allKlines4h, candleTimestamp, 50);

      // Use shared trend analysis - SAME CODE AS CALCULATE-TREND
      const trendData = analyzeMultiTimeframe(klines1hSlice, klines4hSlice);
      if (!trendData) continue;

      const { trend4h, trend1h, stochRsi4h, stochRsi1h, volatility, momentum, isAligned } = trendData;
      const adx = volatility.adx;
      const atrPercent = volatility.atrPercent;

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

        // Trend reversal exit - uses centralized threshold (slightly lower than EXIT_THRESHOLDS.TREND_CONFIDENCE_EXIT for backtest)
        if (!exitPrice) {
          const trendReversalConfidence = EXIT_THRESHOLDS.TREND_CONFIDENCE_EXIT - 5; // 60% for backtest (softer than live 65%)
          if (position.type === 'long' && trend4h.trend === 'bearish' && trend4h.confidence >= trendReversalConfidence) {
            exitPrice = currentPrice;
            exitReason = 'trend_reversal';
          } else if (position.type === 'short' && trend4h.trend === 'bullish' && trend4h.confidence >= trendReversalConfidence) {
            exitPrice = currentPrice;
            exitReason = 'trend_reversal';
          }
        }

        // Break-even protection
        if (!position.breakEvenActivated && pnlPercent >= RISK_PARAMS.BREAK_EVEN_ACTIVATION_PERCENT) {
          const minDist = position.entryPrice * (RISK_PARAMS.MIN_STOP_DISTANCE_PERCENT / 100);
          if (position.type === 'long') {
            const newStop = position.entryPrice + minDist;
            if (newStop > position.stopLoss) { position.stopLoss = newStop; position.breakEvenActivated = true; }
          } else {
            const newStop = position.entryPrice - minDist;
            if (newStop < position.stopLoss) { position.stopLoss = newStop; position.breakEvenActivated = true; }
          }
        }

        // Trailing stop
        if (position.breakEvenActivated && pnlPercent >= RISK_PARAMS.TRAILING_STOP_ACTIVATION_PERCENT) {
          const trailDist = atrPercent * 1.5;
          const locked = position.peakPnlPercent * RISK_PARAMS.TRAILING_PROFIT_LOCK_PERCENT;
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

      // ============= ENTRY LOGIC (aligned with live system) =============
      if (!position) {
        // Hard gates (same as strategy-analyzer)
        if (adx < ADX_THRESHOLDS.MINIMUM) continue;
        
        // RELAXED momentum gate: Allow entry when momentum.state is "none" IF ADX >= 28 (strong trend exception)
        const isStrongTrendException = adx >= ADX_THRESHOLDS.STRONG_TREND_EXCEPTION; // 28+ (relaxed from 30)
        const momentumPasses = momentum.confirms || (momentum.state !== "none") || isStrongTrendException;
        if (!momentumPasses) continue;
        
        if (!isAligned && trend4h.confidence < 65) continue;

        // Determine entry direction
        let entryType: 'long' | 'short' | null = null;
        if (signalDirection === 'long') {
          if (trend4h.trend === 'bullish' || (trend4h.trend === 'neutral' && trend1h.trend === 'bullish')) entryType = 'long';
        } else if (signalDirection === 'short') {
          if (trend4h.trend === 'bearish' || (trend4h.trend === 'neutral' && trend1h.trend === 'bearish')) entryType = 'short';
        } else {
          if (trend4h.trend === 'bullish') entryType = 'long';
          else if (trend4h.trend === 'bearish') entryType = 'short';
        }
        if (!entryType) continue;

        // StochRSI extreme filter (same as strategy-analyzer)
        if (entryType === 'short' && stochRsi4h.k < STOCHRSI_THRESHOLDS.OVERSOLD) continue;
        if (entryType === 'long' && stochRsi4h.k > STOCHRSI_THRESHOLDS.OVERBOUGHT) continue;

        // Quality score using SHARED scoring module (aligned with live system)
        const adxScore = getAdxScore(adx);
        const momentumScore = getMomentumScore(momentum);
        const confidencePenalty = getConfidencePenalty(trend4h.confidence, adx, momentum.confirms);
        
        // Calculate consistency from trend agreement
        const trendsAgree = trend4h.trend === trend1h.trend && trend1h.trend !== 'neutral';
        const calculatedConsistency = trendsAgree ? 75 : (isAligned ? 60 : 40);
        
        const alignmentScore = getAlignmentScore(
          trend4h.confidence, 
          calculatedConsistency, 
          isAligned, 
          { higherTimeframeFilter: { trend4h: trend4h.trend, trend1h: trend1h.trend } }
        );
        
        // Volume analysis from real kline data
        const volumeAnalysis = analyzeVolume(klines1hSlice, trend4h.trend);
        const volumeScore = getVolumeScore(
          volumeAnalysis.volumeConfirms, 
          volumeAnalysis.volumeSpike, 
          volumeAnalysis.volumeRatio, 
          volumeAnalysis.hasRangeExpansion, 
          trend4h.trend
        );
        
        // Base quality score (40) + components
        let qualityScore = 40 + adxScore + momentumScore + alignmentScore + volumeScore + confidencePenalty;
        
        // Unified reversal score check (aligned with execute-trade)
        const reversalResult = calculateUnifiedReversalScore(
          { 
            momentum, 
            stochasticRsi: { '4h': stochRsi4h, '1h': stochRsi1h },
            higherTimeframeFilter: { trend4h: trend4h.trend, trend1h: trend1h.trend },
            volatility: { adx, atrPercent }
          }, 
          entryType, 
          symbol
        );
        if (reversalResult.decision === "BLOCK") continue;
        if (reversalResult.decision === "REDUCE") {
          qualityScore = Math.round(qualityScore * 0.8); // Reduce quality for high reversal risk
        }

        // ============= DYNAMIC QUALITY THRESHOLD (aligned with strategy-analyzer & execute-trade) =============
        // Determines min quality score based on market conditions
        // Uses centralized QUALITY_THRESHOLDS from _shared/constants.ts
        const getMinQualityScore = (currentAdx: number, confidence1h?: number, isNeutralStrategy?: boolean): number => {
          // Neutral strategies rely on HTF direction rather than 5m quality
          if (isNeutralStrategy) return QUALITY_THRESHOLDS.NEUTRAL_MIN;
          // Strong 1h alignment exception (confidence >= 65%)
          if (confidence1h && confidence1h >= CONFIDENCE_THRESHOLDS.HTF_EXCEPTION) return QUALITY_THRESHOLDS.STRONG_1H_MIN;
          // ADX-based thresholds
          if (currentAdx >= ADX_THRESHOLDS.EXCEPTIONAL) return QUALITY_THRESHOLDS.EXCEPTIONAL_ADX_MIN;
          if (currentAdx >= ADX_THRESHOLDS.STRONG) return QUALITY_THRESHOLDS.STRONG_ADX_MIN;
          return QUALITY_THRESHOLDS.BASE_MIN; // Base threshold
        };
        
        // Check if strategy is neutral type
        const isNeutralStrategy = signalDirection === 'trend' && 
          (trend4h.trend === 'neutral' || trend1h.trend === 'neutral');
        
        const dynamicMinQuality = getMinQualityScore(adx, trend1h.confidence, isNeutralStrategy);
        if (qualityScore < dynamicMinQuality) continue;

        // Position sizing and levels
        const posSize = currentCapital * 0.95;
        const slDist = Math.max(atrPercent * 1.5, RISK_PARAMS.MIN_STOP_DISTANCE_PERCENT);
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

    symLogger.summary(`Backtest complete: ${trades.length} trades, Win Rate: ${winRate.toFixed(1)}%, Net: $${netProfit.toFixed(2)}`);
    symLogger.info(`Exit reasons: ${JSON.stringify(exitReasons)}`);

    // Store results
    let backtestResult: any = {
      strategy_name: strategy.name, symbol, start_date: startDate, end_date: endDate,
      initial_capital: initialCapital, final_capital: currentCapital,
      total_trades: trades.length, winning_trades: winningTrades, losing_trades: losingTrades,
      win_rate: winRate, total_profit: totalProfit, total_loss: totalLoss, net_profit: netProfit,
      max_drawdown: maxDrawdown, sharpe_ratio: sharpeRatio, profit_factor: profitFactor,
      avg_win: avgWin, avg_loss: avgLoss, largest_win: largestWin, largest_loss: largestLoss,
      results_data: { trades, volumeData, exitReasons, systemVersion: '3.0-shared-modules', alignedWithLiveSystem: true },
    };

    if (userId) {
      const { data: dbResult, error: dbError } = await supabase
        .from('backtesting_results')
        .insert({ user_id: userId, strategy_id: isCustomStrategy ? strategyId : null, ...backtestResult })
        .select().single();
      if (!dbError && dbResult) backtestResult = dbResult;
    }

    return new Response(JSON.stringify({ success: true, results: backtestResult, alignedWithLiveSystem: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logError(logger, error, "running backtest");
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500,
    });
  }
});
