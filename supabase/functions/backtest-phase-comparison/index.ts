// ============= BACKTEST PHASE COMPARISON =============
// Compares strategy performance with and without Phase 1-8 (9 Findings) improvements
// Tests: Pre-recovery state, drawdown scaling, regime scoring, loss clustering, graduated quality

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.84.0";
import { 
  PRE_RECOVERY_PARAMS,
  REGIME_SCORE_PARAMS,
  LOSS_CLUSTERING_PARAMS,
  GRADUATED_QUALITY_PARAMS,
  RECOVERY_EXIT_PARAMS,
  RECOVERY_MODE_PARAMS,
} from "../_shared/constants.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Trade {
  entryTime: string;
  exitTime: string;
  entryPrice: number;
  exitPrice: number;
  side: 'long' | 'short';
  pnlPercent: number;
  quality: number;
  wasRecovery: boolean;
  wasPreRecovery: boolean;
  positionSizeMultiplier: number;
  regimeScore: number;
  consecutiveLossesAtEntry: number;
}

interface BacktestResult {
  trades: Trade[];
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  netProfit: number;
  maxConsecutiveLosses: number;
  maxDrawdownPercent: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  sharpeRatio: number;
  recoveryTradesCount: number;
  recoveryWinRate: number;
  avgQuality: number;
  avgPositionSize: number;
}

interface ComparisonResult {
  baseline: BacktestResult;
  improved: BacktestResult;
  improvements: {
    winRateDelta: number;
    maxConsecutiveLossesDelta: number;
    maxDrawdownDelta: number;
    profitFactorDelta: number;
    recoveryWinRateDelta: number;
    avgQualityDelta: number;
    netProfitDelta: number;
  };
  settings: {
    symbol: string;
    startDate: string;
    endDate: string;
    initialCapital: number;
  };
  phaseImprovements: {
    preRecoveryBlocks: number;
    drawdownScalingReductions: number;
    regimeGateBlocks: number;
    lossClusteringCooldowns: number;
    graduatedQualityReductions: number;
    recoveryExits: number;
  };
}

// Fetch historical klines from Binance
async function fetchKlines(symbol: string, interval: string, startTime: number, endTime: number): Promise<any[]> {
  const limit = 1000;
  let allKlines: any[] = [];
  let currentStart = startTime;

  while (currentStart < endTime) {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${currentStart}&endTime=${endTime}&limit=${limit}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`Binance API error: ${response.status}`);
      break;
    }
    
    const klines = await response.json();
    if (klines.length === 0) break;
    
    allKlines = allKlines.concat(klines);
    currentStart = klines[klines.length - 1][0] + 1;
    
    if (klines.length < limit) break;
  }

  return allKlines.map((k: any) => ({
    openTime: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
    closeTime: k[6],
  }));
}

// Calculate RSI
function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// Calculate ADX (simplified)
function calculateADX(klines: any[], period: number = 14): number {
  if (klines.length < period * 2) return 20;
  
  const closes = klines.map(k => k.close);
  const highs = klines.map(k => k.high);
  const lows = klines.map(k => k.low);
  
  let sumTR = 0;
  let sumPlusDM = 0;
  let sumMinusDM = 0;
  
  for (let i = klines.length - period; i < klines.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    sumTR += tr;
    
    const plusDM = highs[i] - highs[i - 1] > lows[i - 1] - lows[i]
      ? Math.max(highs[i] - highs[i - 1], 0) : 0;
    const minusDM = lows[i - 1] - lows[i] > highs[i] - highs[i - 1]
      ? Math.max(lows[i - 1] - lows[i], 0) : 0;
    
    sumPlusDM += plusDM;
    sumMinusDM += minusDM;
  }
  
  const plusDI = sumTR > 0 ? (sumPlusDM / sumTR) * 100 : 0;
  const minusDI = sumTR > 0 ? (sumMinusDM / sumTR) * 100 : 0;
  const diSum = plusDI + minusDI;
  const dx = diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0;
  
  return dx;
}

// Simulate trading with given settings
function runBacktest(
  klines: any[],
  usePhaseImprovements: boolean,
  initialCapital: number
): { result: BacktestResult; phaseStats: any } {
  const trades: Trade[] = [];
  let capital = initialCapital;
  let consecutiveLosses = 0;
  let consecutiveWins = 0;
  let maxConsecutiveLosses = 0;
  let peakCapital = initialCapital;
  let maxDrawdownPercent = 0;
  let isRecoveryMode = false;
  let lastLossQuality = 0;
  let inCooldown = false;
  let cooldownUntil = 0;
  
  // Phase improvement tracking
  const phaseStats = {
    preRecoveryBlocks: 0,
    drawdownScalingReductions: 0,
    regimeGateBlocks: 0,
    lossClusteringCooldowns: 0,
    graduatedQualityReductions: 0,
    recoveryExits: 0,
  };
  
  const closes = klines.map(k => k.close);
  
  for (let i = 50; i < klines.length - 10; i++) {
    const kline = klines[i];
    const price = kline.close;
    
    // Calculate indicators
    const rsi = calculateRSI(closes.slice(0, i + 1));
    const adx = calculateADX(klines.slice(0, i + 1));
    const priceChange = (price - klines[i - 5].close) / klines[i - 5].close * 100;
    
    // Base quality score (simplified)
    let quality = 50;
    if (adx >= 25) quality += 15;
    else if (adx >= 20) quality += 10;
    
    if (rsi > 30 && rsi < 70) quality += 10;
    quality += Math.random() * 20; // Noise for realism
    quality = Math.min(100, Math.max(0, quality));
    
    // Regime score (simplified)
    let regimeScore = 50;
    regimeScore += (adx - 20) * 2;
    regimeScore = Math.min(100, Math.max(0, regimeScore));
    
    // Skip if in cooldown
    if (usePhaseImprovements && inCooldown && kline.openTime < cooldownUntil) {
      phaseStats.lossClusteringCooldowns++;
      continue;
    }
    inCooldown = false;
    
    // Determine signal
    let signal: 'long' | 'short' | null = null;
    if (rsi < 35 && adx >= 18) signal = 'long';
    else if (rsi > 65 && adx >= 18) signal = 'short';
    
    if (!signal) continue;
    
    // ============= PHASE 1-8 IMPROVEMENTS =============
    let positionSizeMultiplier = 1.0;
    let blockEntry = false;
    const wasPreRecovery = consecutiveLosses === 2 && usePhaseImprovements;
    const wasRecovery = isRecoveryMode;
    
    if (usePhaseImprovements) {
      // Phase 4: Drawdown-Based Risk Scaling
      if (consecutiveLosses === 2) {
        positionSizeMultiplier *= (1 - PRE_RECOVERY_PARAMS.CONSECUTIVE_LOSSES_2_REDUCTION);
        phaseStats.drawdownScalingReductions++;
      } else if (consecutiveLosses >= 3) {
        positionSizeMultiplier *= (1 - PRE_RECOVERY_PARAMS.CONSECUTIVE_LOSSES_3_REDUCTION);
        phaseStats.drawdownScalingReductions++;
      }
      
      // Phase 3: Pre-Recovery State (activated at threshold - 1)
      if (wasPreRecovery) {
        positionSizeMultiplier *= (1 - PRE_RECOVERY_PARAMS.POSITION_SIZE_REDUCTION);
        
        // Block continuation without structure
        const isDeepPullback = signal === 'long' ? rsi < 35 : rsi > 65;
        if (!isDeepPullback && PRE_RECOVERY_PARAMS.BLOCK_CONTINUATION_WITHOUT_STRUCTURE) {
          blockEntry = true;
          phaseStats.preRecoveryBlocks++;
        }
      }
      
      // Phase 2: Regime Confidence Gate
      if (regimeScore < REGIME_SCORE_PARAMS.BLOCK_CONTINUATION_BELOW) {
        blockEntry = true;
        phaseStats.regimeGateBlocks++;
      }
      
      // Phase 7: Graduated Quality Penalties
      if (quality >= GRADUATED_QUALITY_PARAMS.EXCELLENT_MIN) {
        positionSizeMultiplier *= GRADUATED_QUALITY_PARAMS.EXCELLENT_MULTIPLIER;
      } else if (quality >= GRADUATED_QUALITY_PARAMS.GOOD_MIN) {
        positionSizeMultiplier *= GRADUATED_QUALITY_PARAMS.GOOD_MULTIPLIER;
        phaseStats.graduatedQualityReductions++;
      } else if (quality >= GRADUATED_QUALITY_PARAMS.ACCEPTABLE_MIN) {
        positionSizeMultiplier *= GRADUATED_QUALITY_PARAMS.ACCEPTABLE_MULTIPLIER;
        phaseStats.graduatedQualityReductions++;
      } else if (quality >= GRADUATED_QUALITY_PARAMS.MARGINAL_MIN) {
        positionSizeMultiplier *= GRADUATED_QUALITY_PARAMS.MARGINAL_MULTIPLIER;
        phaseStats.graduatedQualityReductions++;
      }
      
      // Recovery mode penalty
      if (isRecoveryMode) {
        positionSizeMultiplier *= (1 - GRADUATED_QUALITY_PARAMS.RECOVERY_MODE_PENALTY);
      }
    }
    
    if (blockEntry) continue;
    
    // Execute trade (simplified exit after N candles or SL/TP)
    const entryPrice = price;
    const stopLoss = signal === 'long' ? price * 0.98 : price * 1.02;
    const takeProfit = signal === 'long' ? price * 1.02 : price * 0.98;
    
    let exitPrice = entryPrice;
    let exitIndex = i + 1;
    
    for (let j = i + 1; j < Math.min(i + 20, klines.length); j++) {
      const checkPrice = klines[j].close;
      const checkHigh = klines[j].high;
      const checkLow = klines[j].low;
      
      if (signal === 'long') {
        if (checkLow <= stopLoss) {
          exitPrice = stopLoss;
          exitIndex = j;
          break;
        }
        if (checkHigh >= takeProfit) {
          exitPrice = takeProfit;
          exitIndex = j;
          break;
        }
      } else {
        if (checkHigh >= stopLoss) {
          exitPrice = stopLoss;
          exitIndex = j;
          break;
        }
        if (checkLow <= takeProfit) {
          exitPrice = takeProfit;
          exitIndex = j;
          break;
        }
      }
      exitPrice = checkPrice;
      exitIndex = j;
    }
    
    // Calculate PnL
    const pnlPercent = signal === 'long'
      ? ((exitPrice - entryPrice) / entryPrice) * 100
      : ((entryPrice - exitPrice) / entryPrice) * 100;
    
    const adjustedPnl = pnlPercent * positionSizeMultiplier;
    const isWin = adjustedPnl > 0;
    
    // Update consecutive tracking
    if (isWin) {
      consecutiveWins++;
      consecutiveLosses = 0;
      
      // Phase 8: Recovery Exit Logic
      if (usePhaseImprovements && isRecoveryMode) {
        if (consecutiveWins >= RECOVERY_EXIT_PARAMS.CONSECUTIVE_WINS_FOR_EXIT) {
          isRecoveryMode = false;
          phaseStats.recoveryExits++;
        }
      }
    } else {
      consecutiveLosses++;
      consecutiveWins = 0;
      maxConsecutiveLosses = Math.max(maxConsecutiveLosses, consecutiveLosses);
      
      // Phase 6: Loss Clustering - trigger cooldown on low quality loss
      if (usePhaseImprovements && quality < 55) {
        inCooldown = true;
        cooldownUntil = klines[exitIndex].openTime + LOSS_CLUSTERING_PARAMS.COOLDOWN_MINUTES * 60000;
      }
      
      // Enter recovery mode at 3 consecutive losses
      if (consecutiveLosses >= 3) {
        isRecoveryMode = true;
      }
      
      lastLossQuality = quality;
    }
    
    // Update capital and drawdown
    capital *= (1 + adjustedPnl / 100);
    peakCapital = Math.max(peakCapital, capital);
    const currentDrawdown = ((peakCapital - capital) / peakCapital) * 100;
    maxDrawdownPercent = Math.max(maxDrawdownPercent, currentDrawdown);
    
    trades.push({
      entryTime: new Date(kline.openTime).toISOString(),
      exitTime: new Date(klines[exitIndex].openTime).toISOString(),
      entryPrice,
      exitPrice,
      side: signal,
      pnlPercent: adjustedPnl,
      quality,
      wasRecovery,
      wasPreRecovery,
      positionSizeMultiplier,
      regimeScore,
      consecutiveLossesAtEntry: consecutiveLosses,
    });
    
    i = exitIndex; // Skip to exit point
  }
  
  // Calculate summary stats
  const winningTrades = trades.filter(t => t.pnlPercent > 0);
  const losingTrades = trades.filter(t => t.pnlPercent <= 0);
  const recoveryTrades = trades.filter(t => t.wasRecovery);
  const recoveryWins = recoveryTrades.filter(t => t.pnlPercent > 0);
  
  const totalGains = winningTrades.reduce((sum, t) => sum + t.pnlPercent, 0);
  const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnlPercent, 0));
  
  const result: BacktestResult = {
    trades,
    totalTrades: trades.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    winRate: trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0,
    netProfit: capital - initialCapital,
    maxConsecutiveLosses,
    maxDrawdownPercent,
    avgWin: winningTrades.length > 0 ? totalGains / winningTrades.length : 0,
    avgLoss: losingTrades.length > 0 ? totalLosses / losingTrades.length : 0,
    profitFactor: totalLosses > 0 ? totalGains / totalLosses : totalGains > 0 ? 999 : 0,
    sharpeRatio: calculateSharpeRatio(trades),
    recoveryTradesCount: recoveryTrades.length,
    recoveryWinRate: recoveryTrades.length > 0 ? (recoveryWins.length / recoveryTrades.length) * 100 : 0,
    avgQuality: trades.length > 0 ? trades.reduce((sum, t) => sum + t.quality, 0) / trades.length : 0,
    avgPositionSize: trades.length > 0 ? trades.reduce((sum, t) => sum + t.positionSizeMultiplier, 0) / trades.length : 1,
  };
  
  return { result, phaseStats };
}

function calculateSharpeRatio(trades: Trade[]): number {
  if (trades.length < 2) return 0;
  
  const returns = trades.map(t => t.pnlPercent);
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  
  return stdDev > 0 ? (mean / stdDev) * Math.sqrt(252) : 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol = "BTCUSDT", startDate, endDate, initialCapital = 10000 } = await req.json();
    
    const start = new Date(startDate || Date.now() - 30 * 24 * 60 * 60 * 1000).getTime();
    const end = new Date(endDate || Date.now()).getTime();
    
    console.log(`Running backtest comparison for ${symbol} from ${new Date(start).toISOString()} to ${new Date(end).toISOString()}`);
    
    // Fetch historical data
    const klines = await fetchKlines(symbol, "1h", start, end);
    console.log(`Fetched ${klines.length} klines`);
    
    if (klines.length < 100) {
      return new Response(
        JSON.stringify({ error: "Insufficient historical data", klineCount: klines.length }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Run baseline backtest (no Phase 1-8 improvements)
    console.log("Running baseline backtest...");
    const { result: baseline, phaseStats: baselineStats } = runBacktest(klines, false, initialCapital);
    
    // Run improved backtest (with Phase 1-8 improvements)
    console.log("Running improved backtest with Phase 1-8...");
    const { result: improved, phaseStats: improvedStats } = runBacktest(klines, true, initialCapital);
    
    const comparison: ComparisonResult = {
      baseline,
      improved,
      improvements: {
        winRateDelta: improved.winRate - baseline.winRate,
        maxConsecutiveLossesDelta: baseline.maxConsecutiveLosses - improved.maxConsecutiveLosses,
        maxDrawdownDelta: baseline.maxDrawdownPercent - improved.maxDrawdownPercent,
        profitFactorDelta: improved.profitFactor - baseline.profitFactor,
        recoveryWinRateDelta: improved.recoveryWinRate - baseline.recoveryWinRate,
        avgQualityDelta: improved.avgQuality - baseline.avgQuality,
        netProfitDelta: improved.netProfit - baseline.netProfit,
      },
      settings: {
        symbol,
        startDate: new Date(start).toISOString(),
        endDate: new Date(end).toISOString(),
        initialCapital,
      },
      phaseImprovements: improvedStats,
    };
    
    console.log("=== BACKTEST COMPARISON RESULTS ===");
    console.log(`Baseline: ${baseline.totalTrades} trades, ${baseline.winRate.toFixed(1)}% win rate, ${baseline.maxConsecutiveLosses} max consecutive losses`);
    console.log(`Improved: ${improved.totalTrades} trades, ${improved.winRate.toFixed(1)}% win rate, ${improved.maxConsecutiveLosses} max consecutive losses`);
    console.log(`Win Rate Delta: ${comparison.improvements.winRateDelta > 0 ? '+' : ''}${comparison.improvements.winRateDelta.toFixed(1)}%`);
    console.log(`Max Consecutive Losses Delta: ${comparison.improvements.maxConsecutiveLossesDelta > 0 ? '-' : '+'}${Math.abs(comparison.improvements.maxConsecutiveLossesDelta)}`);
    console.log(`Phase Stats:`, improvedStats);
    
    return new Response(
      JSON.stringify(comparison),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Backtest comparison error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
