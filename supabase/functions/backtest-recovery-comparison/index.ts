import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import { createLogger } from "../_shared/logging.ts";
import { RECOVERY_MODE_PARAMS, QUALITY_THRESHOLDS, ADX_THRESHOLDS, CONFIDENCE_THRESHOLDS } from "../_shared/constants.ts";
import { analyzeMultiTimeframe } from "../_shared/trend-core.ts";
import { getAdxScore, getMomentumScore, getConfidencePenalty, getAlignmentScore, getVolumeScore } from "../_shared/scoring.ts";

const logger = createLogger("backtest-recovery-comparison");

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
  qualityScore: number;
  wasRecoveryTrade: boolean;
  consecutiveLosses: number;
}

interface RecoveryState {
  isActive: boolean;
  consecutiveLosses: number;
  consecutiveWins: number;
  recoveryTradesCount: number;
  cooldownUntil: number | null;
  lastRecoveryLoss: boolean;
}

interface BacktestResult {
  mode: 'before' | 'after';
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  netProfit: number;
  maxDrawdown: number;
  recoveryTrades: number;
  recoveryWins: number;
  recoveryLosses: number;
  recoveryWinRate: number;
  avgRecoveryProfit: number;
  avgRecoveryLoss: number;
  maxConsecutiveLosses: number;
  avgDrawdownDuringLosingStreak: number;
  trades: Trade[];
}

// ============= BEFORE (OLD) RECOVERY MODE LOGIC =============
// Simple: just boost quality threshold and reduce position size
function evaluateRecoveryBefore(
  qualityScore: number,
  consecutiveLosses: number,
  confidence: number,
  adx: number
): { allowed: boolean; reason?: string; positionMultiplier: number } {
  // Old logic: Hard confidence cap at 70
  if (confidence >= 70) {
    return { allowed: false, reason: "RECOVERY_BEFORE: Confidence too high (>=70)", positionMultiplier: 0 };
  }
  
  // Old logic: Fixed ADX threshold at 25
  if (adx < 25) {
    return { allowed: false, reason: "RECOVERY_BEFORE: ADX too weak (<25)", positionMultiplier: 0 };
  }
  
  // Old logic: Fixed quality boost of +10
  const boostedThreshold = QUALITY_THRESHOLDS.BASE_MIN + 10;
  if (qualityScore < boostedThreshold) {
    return { allowed: false, reason: `RECOVERY_BEFORE: Quality ${qualityScore} < ${boostedThreshold}`, positionMultiplier: 0 };
  }
  
  // Old logic: Fixed 50% position size reduction
  return { allowed: true, positionMultiplier: 0.5 };
}

// ============= AFTER (NEW) RECOVERY MODE LOGIC =============
// Scenario 6 improvements with all 10 findings
function evaluateRecoveryAfter(
  qualityScore: number,
  consecutiveLosses: number,
  consecutiveWins: number,
  confidence: number,
  adx: number,
  htfConfidence: number,
  htfAligned: boolean,
  pullbackScore: number,
  isDeepPullback: boolean,
  isFirstContinuationCandle: boolean,
  recoveryState: RecoveryState,
  currentTimestamp: number
): { allowed: boolean; reason?: string; positionMultiplier: number; exitRecovery: boolean } {
  
  // Finding 1: Exit recovery on consecutive wins or low drawdown
  if (consecutiveWins >= RECOVERY_MODE_PARAMS.CONSECUTIVE_WINS_EXIT) {
    return { allowed: true, positionMultiplier: 1.0, exitRecovery: true };
  }
  
  // Finding 8: Cooldown after recovery loss
  if (recoveryState.cooldownUntil && currentTimestamp < recoveryState.cooldownUntil) {
    return { allowed: false, reason: "RECOVERY_AFTER: In cooldown after loss", positionMultiplier: 0, exitRecovery: false };
  }
  
  // Finding 10: Recovery trade counter
  if (recoveryState.recoveryTradesCount >= RECOVERY_MODE_PARAMS.DEFAULT_MAX_RECOVERY_TRADES) {
    return { allowed: false, reason: "RECOVERY_AFTER: Max recovery trades reached", positionMultiplier: 0, exitRecovery: false };
  }
  
  // Finding 3: HTF alignment as hard gate
  if (!htfAligned) {
    return { allowed: false, reason: "RECOVERY_AFTER: HTF misalignment", positionMultiplier: 0, exitRecovery: false };
  }
  
  // Finding 5: Adaptive ADX rule
  if (adx < RECOVERY_MODE_PARAMS.ADX_HARD_MINIMUM) {
    return { allowed: false, reason: `RECOVERY_AFTER: ADX ${adx.toFixed(1)} < hard minimum ${RECOVERY_MODE_PARAMS.ADX_HARD_MINIMUM}`, positionMultiplier: 0, exitRecovery: false };
  }
  
  if (adx >= RECOVERY_MODE_PARAMS.ADX_SOFT_ZONE_MIN && adx < RECOVERY_MODE_PARAMS.ADX_SOFT_ZONE_MAX) {
    if (htfConfidence < RECOVERY_MODE_PARAMS.HTF_CONFIDENCE_FOR_SOFT_ADX) {
      return { allowed: false, reason: `RECOVERY_AFTER: ADX in soft zone (${adx.toFixed(1)}) but HTF confidence ${htfConfidence.toFixed(1)} < ${RECOVERY_MODE_PARAMS.HTF_CONFIDENCE_FOR_SOFT_ADX}`, positionMultiplier: 0, exitRecovery: false };
    }
  }
  
  // Finding 2: Conditional confidence cap
  if (confidence >= RECOVERY_MODE_PARAMS.CONFIDENCE_HARD_CAP && !isDeepPullback) {
    return { allowed: false, reason: `RECOVERY_AFTER: Confidence ${confidence.toFixed(1)} >= ${RECOVERY_MODE_PARAMS.CONFIDENCE_HARD_CAP} without deep pullback`, positionMultiplier: 0, exitRecovery: false };
  }
  
  // Finding 2: Soft penalty for 70-80 confidence
  let adjustedQuality = qualityScore;
  if (confidence >= RECOVERY_MODE_PARAMS.CONFIDENCE_SOFT_PENALTY_MIN && confidence < RECOVERY_MODE_PARAMS.CONFIDENCE_SOFT_PENALTY_MAX) {
    adjustedQuality -= RECOVERY_MODE_PARAMS.CONFIDENCE_SOFT_PENALTY_AMOUNT;
  }
  
  // Finding 4: Pullback depth scoring
  if (pullbackScore < RECOVERY_MODE_PARAMS.MIN_PULLBACK_SCORE) {
    return { allowed: false, reason: `RECOVERY_AFTER: Pullback score ${pullbackScore} < ${RECOVERY_MODE_PARAMS.MIN_PULLBACK_SCORE}`, positionMultiplier: 0, exitRecovery: false };
  }
  
  // Finding 6: No first candle rule
  if (RECOVERY_MODE_PARAMS.BLOCK_FIRST_CANDLE && isFirstContinuationCandle) {
    return { allowed: false, reason: "RECOVERY_AFTER: First continuation candle blocked", positionMultiplier: 0, exitRecovery: false };
  }
  
  // Finding 9: Capped quality threshold
  const cappedThreshold = Math.min(
    QUALITY_THRESHOLDS.BASE_MIN + QUALITY_THRESHOLDS.RECOVERY_BOOST,
    QUALITY_THRESHOLDS.MAX_RECOVERY_QUALITY
  );
  
  if (adjustedQuality < cappedThreshold) {
    return { allowed: false, reason: `RECOVERY_AFTER: Adjusted quality ${adjustedQuality.toFixed(1)} < ${cappedThreshold}`, positionMultiplier: 0, exitRecovery: false };
  }
  
  // Finding 7: Dynamic position size based on quality
  const qualityRatio = Math.min(Math.max(adjustedQuality / RECOVERY_MODE_PARAMS.MAX_QUALITY_FOR_SIZING, RECOVERY_MODE_PARAMS.MIN_SIZE_MULTIPLIER), RECOVERY_MODE_PARAMS.MAX_SIZE_MULTIPLIER);
  const baseRecoverySize = 0.5; // Base 50%
  const positionMultiplier = baseRecoverySize * qualityRatio;
  
  return { allowed: true, positionMultiplier, exitRecovery: false };
}

// Calculate pullback score (0-3 points)
function calculatePullbackScore(rsi: number, percentB: number, retracePercent: number, side: 'long' | 'short'): number {
  let score = 0;
  
  // RSI zone check
  if (side === 'long') {
    if (rsi >= RECOVERY_MODE_PARAMS.RSI_PULLBACK_MIN && rsi <= RECOVERY_MODE_PARAMS.RSI_PULLBACK_MAX) {
      score++;
    }
  } else {
    // Inverted for shorts: 45-60
    if (rsi >= (100 - RECOVERY_MODE_PARAMS.RSI_PULLBACK_MAX) && rsi <= (100 - RECOVERY_MODE_PARAMS.RSI_PULLBACK_MIN)) {
      score++;
    }
  }
  
  // Bollinger position check (near mid or outer)
  if (side === 'long') {
    if (percentB <= 50 && percentB >= 20) score++; // Near lower/mid band
  } else {
    if (percentB >= 50 && percentB <= 80) score++; // Near upper/mid band
  }
  
  // Retrace percent check
  if (retracePercent >= RECOVERY_MODE_PARAMS.RETRACE_MIN_PERCENT && retracePercent <= RECOVERY_MODE_PARAMS.RETRACE_MAX_PERCENT) {
    score++;
  }
  
  return score;
}

// Simulate retrace calculation from price action
function estimateRetracePercent(klines: any[], side: 'long' | 'short'): number {
  if (klines.length < 20) return 50; // Default middle value
  
  const recentKlines = klines.slice(-20);
  const highs = recentKlines.map((k: any) => parseFloat(k[2]));
  const lows = recentKlines.map((k: any) => parseFloat(k[3]));
  const currentClose = parseFloat(recentKlines[recentKlines.length - 1][4]);
  
  const swingHigh = Math.max(...highs);
  const swingLow = Math.min(...lows);
  const range = swingHigh - swingLow;
  
  if (range === 0) return 50;
  
  if (side === 'long') {
    // For longs, retrace from high
    return ((swingHigh - currentClose) / range) * 100;
  } else {
    // For shorts, retrace from low
    return ((currentClose - swingLow) / range) * 100;
  }
}

// Check if this is a "deep pullback" (RSI < 35 or > 65, or retrace >= 50%)
function isDeepPullbackCheck(rsi: number, retracePercent: number, side: 'long' | 'short'): boolean {
  if (side === 'long') {
    return rsi < 35 || retracePercent >= 50;
  } else {
    return rsi > 65 || retracePercent >= 50;
  }
}

// Simple first candle detection (comparing momentum direction)
function isFirstContinuationCandleCheck(klines: any[], side: 'long' | 'short'): boolean {
  if (klines.length < 3) return false;
  
  const prevCandle = klines[klines.length - 2];
  const currCandle = klines[klines.length - 1];
  const prevPrevCandle = klines[klines.length - 3];
  
  const prevClose = parseFloat(prevCandle[4]);
  const prevOpen = parseFloat(prevCandle[1]);
  const currClose = parseFloat(currCandle[4]);
  const currOpen = parseFloat(currCandle[1]);
  const prevPrevClose = parseFloat(prevPrevCandle[4]);
  
  if (side === 'long') {
    // Pullback candle was red, current is first green after it
    const wasPullback = prevClose < prevOpen;
    const isContinuation = currClose > currOpen && currClose > prevClose;
    const prevWasAlsoDown = prevPrevClose > prevClose;
    return wasPullback && isContinuation && prevWasAlsoDown;
  } else {
    // Pullback candle was green, current is first red after it
    const wasPullback = prevClose > prevOpen;
    const isContinuation = currClose < currOpen && currClose < prevClose;
    const prevWasAlsoUp = prevPrevClose < prevClose;
    return wasPullback && isContinuation && prevWasAlsoUp;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logger.boot();
    
    const { symbol, startDate, endDate, initialCapital = 10000, consecutiveLossThreshold = 3 } = await req.json();
    
    logger.info(`Running Recovery Mode Comparison: ${symbol}, ${startDate} to ${endDate}`);
    logger.info(`Consecutive loss threshold: ${consecutiveLossThreshold}`);
    
    // Fetch historical data
    const startTime = new Date(startDate).getTime();
    const endTime = new Date(endDate).getTime();
    const bufferMs = 100 * 60 * 60 * 1000;
    const fetchStartTime = startTime - bufferMs;
    
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
    
    const [allKlines1h, allKlines4h] = await Promise.all([
      fetchAllKlines(symbol, '1h', fetchStartTime, endTime),
      fetchAllKlines(symbol, '4h', fetchStartTime, endTime),
    ]);
    
    logger.info(`Fetched ${allKlines1h.length} 1h candles, ${allKlines4h.length} 4h candles`);
    
    function getKlinesSlice(allKlines: any[], endTimestamp: number, count: number): any[] {
      const endIndex = allKlines.findIndex((k: any) => k[0] > endTimestamp);
      const actualEndIndex = endIndex === -1 ? allKlines.length : endIndex;
      return allKlines.slice(Math.max(0, actualEndIndex - count), actualEndIndex);
    }
    
    // Run simulation for both modes
    async function runSimulation(mode: 'before' | 'after'): Promise<BacktestResult> {
      const trades: Trade[] = [];
      let capital = initialCapital;
      let maxCapital = initialCapital;
      let maxDrawdown = 0;
      let consecutiveLosses = 0;
      let consecutiveWins = 0;
      let maxConsecutiveLosses = 0;
      let totalDrawdownDuringStreaks = 0;
      let streakCount = 0;
      let position: { type: 'long' | 'short'; entry: number; size: number; sl: number; tp: number; quality: number; wasRecovery: boolean; lossesAtEntry: number } | null = null;
      
      const recoveryState: RecoveryState = {
        isActive: false,
        consecutiveLosses: 0,
        consecutiveWins: 0,
        recoveryTradesCount: 0,
        cooldownUntil: null,
        lastRecoveryLoss: false,
      };
      
      const simulationKlines1h = allKlines1h.filter((k: any) => k[0] >= startTime);
      const startIdx = allKlines1h.findIndex((k: any) => k[0] >= startTime);
      
      for (let i = startIdx; i < allKlines1h.length; i++) {
        const candle = allKlines1h[i];
        const timestamp = candle[0];
        const currentPrice = parseFloat(candle[4]);
        const highPrice = parseFloat(candle[2]);
        const lowPrice = parseFloat(candle[3]);
        
        const klines1h = getKlinesSlice(allKlines1h, timestamp, 100);
        const klines4h = getKlinesSlice(allKlines4h, timestamp, 50);
        
        const trendData = analyzeMultiTimeframe(klines1h, klines4h);
        if (!trendData) continue;
        
        const { trend4h, trend1h, stochRsi4h, stochRsi1h, volatility, momentum, isAligned } = trendData;
        const adx = volatility.adx;
        
        // Position management
        if (position) {
          let exitPrice: number | null = null;
          let exitReason = '';
          
          if (position.type === 'long') {
            if (lowPrice <= position.sl) {
              exitPrice = position.sl;
              exitReason = 'stop_loss';
            } else if (highPrice >= position.tp) {
              exitPrice = position.tp;
              exitReason = 'take_profit';
            }
          } else {
            if (highPrice >= position.sl) {
              exitPrice = position.sl;
              exitReason = 'stop_loss';
            } else if (lowPrice <= position.tp) {
              exitPrice = position.tp;
              exitReason = 'take_profit';
            }
          }
          
          if (exitPrice) {
            const profit = position.type === 'long'
              ? (exitPrice - position.entry) * position.size
              : (position.entry - exitPrice) * position.size;
            const profitPercent = position.type === 'long'
              ? ((exitPrice - position.entry) / position.entry) * 100
              : ((position.entry - exitPrice) / position.entry) * 100;
            
            capital += profit;
            
            if (capital > maxCapital) maxCapital = capital;
            const dd = ((maxCapital - capital) / maxCapital) * 100;
            if (dd > maxDrawdown) maxDrawdown = dd;
            
            // Track consecutive losses/wins
            if (profit < 0) {
              consecutiveLosses++;
              consecutiveWins = 0;
              if (consecutiveLosses > maxConsecutiveLosses) {
                maxConsecutiveLosses = consecutiveLosses;
              }
              // Track drawdown during losing streaks
              if (recoveryState.isActive) {
                totalDrawdownDuringStreaks += dd;
                streakCount++;
              }
              // Update recovery state
              if (position.wasRecovery) {
                recoveryState.lastRecoveryLoss = true;
                recoveryState.cooldownUntil = timestamp + RECOVERY_MODE_PARAMS.COOLDOWN_MINUTES * 60 * 1000;
              }
            } else {
              consecutiveWins++;
              consecutiveLosses = 0;
              recoveryState.consecutiveWins++;
              if (position.wasRecovery) {
                recoveryState.lastRecoveryLoss = false;
              }
            }
            
            trades.push({
              entryPrice: position.entry,
              exitPrice,
              type: position.type,
              profit,
              profitPercent,
              timestamp: new Date(timestamp).toISOString(),
              exitReason,
              qualityScore: position.quality,
              wasRecoveryTrade: position.wasRecovery,
              consecutiveLosses: position.lossesAtEntry,
            });
            
            position = null;
            
            // Check if entering/exiting recovery mode
            if (consecutiveLosses >= consecutiveLossThreshold) {
              recoveryState.isActive = true;
              recoveryState.consecutiveLosses = consecutiveLosses;
            }
            
            // Finding 1: Exit recovery on wins (after mode only)
            if (mode === 'after' && recoveryState.isActive && consecutiveWins >= RECOVERY_MODE_PARAMS.CONSECUTIVE_WINS_EXIT) {
              recoveryState.isActive = false;
              recoveryState.recoveryTradesCount = 0;
              recoveryState.consecutiveWins = 0;
            }
          }
        }
        
        // Entry logic
        if (!position) {
          if (adx < ADX_THRESHOLDS.MINIMUM) continue;
          if (!momentum.confirms && momentum.state === "none") continue;
          
          let entryType: 'long' | 'short' | null = null;
          if (trend4h.trend === 'bullish') entryType = 'long';
          else if (trend4h.trend === 'bearish') entryType = 'short';
          if (!entryType) continue;
          
          // Calculate quality score
          const adxScore = getAdxScore(adx);
          const momentumScore = getMomentumScore(momentum, adx, false);
          const confidencePenalty = getConfidencePenalty(trend4h.confidence, adx, momentum.confirms);
          const trendsAgree = trend4h.trend === trend1h.trend;
          const consistency = trendsAgree ? 75 : (isAligned ? 60 : 40);
          const alignmentScore = getAlignmentScore(trend4h.confidence, consistency, isAligned, {});
          const volumeScore = 5; // Simplified
          
          let qualityScore = 40 + adxScore + momentumScore + alignmentScore + volumeScore + confidencePenalty;
          
          // Recovery mode check
          const isInRecovery = recoveryState.isActive || consecutiveLosses >= consecutiveLossThreshold;
          let positionMultiplier = 1.0;
          let wasRecoveryTrade = false;
          
          if (isInRecovery) {
            // Calculate additional metrics for after mode
            // Use stochRSI K as proxy for RSI zone, and estimate %B from price position
            const rsi = stochRsi1h.k; // StochRSI K as momentum proxy
            const percentB = 50; // Simplified - would need BB calculation
            const retracePercent = estimateRetracePercent(klines1h, entryType);
            const pullbackScore = calculatePullbackScore(rsi, percentB, retracePercent, entryType);
            const deepPullback = isDeepPullbackCheck(rsi, retracePercent, entryType);
            const firstCandle = isFirstContinuationCandleCheck(klines1h, entryType);
            
            if (mode === 'before') {
              const result = evaluateRecoveryBefore(qualityScore, consecutiveLosses, trend4h.confidence, adx);
              if (!result.allowed) continue;
              positionMultiplier = result.positionMultiplier;
            } else {
              const result = evaluateRecoveryAfter(
                qualityScore,
                consecutiveLosses,
                consecutiveWins,
                trend4h.confidence,
                adx,
                trend4h.confidence,
                isAligned,
                pullbackScore,
                deepPullback,
                firstCandle,
                recoveryState,
                timestamp
              );
              if (!result.allowed) continue;
              positionMultiplier = result.positionMultiplier;
              if (result.exitRecovery) {
                recoveryState.isActive = false;
              }
            }
            
            wasRecoveryTrade = true;
            recoveryState.recoveryTradesCount++;
          }
          
          // Standard quality check
          if (!isInRecovery && qualityScore < QUALITY_THRESHOLDS.BASE_MIN) continue;
          
          // Calculate position
          const riskPercent = 1.5;
          const riskAmount = capital * (riskPercent / 100) * positionMultiplier;
          const atrPercent = volatility.atrPercent || 1.5;
          const stopDistance = currentPrice * (atrPercent * 1.5 / 100);
          const size = riskAmount / stopDistance;
          
          let stopLoss: number;
          let takeProfit: number;
          
          if (entryType === 'long') {
            stopLoss = currentPrice - stopDistance;
            takeProfit = currentPrice + (stopDistance * 2.5);
          } else {
            stopLoss = currentPrice + stopDistance;
            takeProfit = currentPrice - (stopDistance * 2.5);
          }
          
          position = {
            type: entryType,
            entry: currentPrice,
            size,
            sl: stopLoss,
            tp: takeProfit,
            quality: qualityScore,
            wasRecovery: wasRecoveryTrade,
            lossesAtEntry: consecutiveLosses,
          };
        }
      }
      
      // Calculate stats
      const recoveryTrades = trades.filter(t => t.wasRecoveryTrade);
      const recoveryWins = recoveryTrades.filter(t => t.profit > 0);
      const recoveryLosses = recoveryTrades.filter(t => t.profit <= 0);
      
      return {
        mode,
        totalTrades: trades.length,
        winningTrades: trades.filter(t => t.profit > 0).length,
        losingTrades: trades.filter(t => t.profit <= 0).length,
        winRate: trades.length > 0 ? (trades.filter(t => t.profit > 0).length / trades.length) * 100 : 0,
        netProfit: capital - initialCapital,
        maxDrawdown,
        recoveryTrades: recoveryTrades.length,
        recoveryWins: recoveryWins.length,
        recoveryLosses: recoveryLosses.length,
        recoveryWinRate: recoveryTrades.length > 0 ? (recoveryWins.length / recoveryTrades.length) * 100 : 0,
        avgRecoveryProfit: recoveryWins.length > 0 ? recoveryWins.reduce((sum, t) => sum + t.profit, 0) / recoveryWins.length : 0,
        avgRecoveryLoss: recoveryLosses.length > 0 ? Math.abs(recoveryLosses.reduce((sum, t) => sum + t.profit, 0) / recoveryLosses.length) : 0,
        maxConsecutiveLosses,
        avgDrawdownDuringLosingStreak: streakCount > 0 ? totalDrawdownDuringStreaks / streakCount : 0,
        trades,
      };
    }
    
    const [beforeResult, afterResult] = await Promise.all([
      runSimulation('before'),
      runSimulation('after'),
    ]);
    
    // Calculate improvement metrics
    const comparison = {
      winRateImprovement: afterResult.winRate - beforeResult.winRate,
      drawdownImprovement: beforeResult.maxDrawdown - afterResult.maxDrawdown,
      profitImprovement: afterResult.netProfit - beforeResult.netProfit,
      recoveryWinRateImprovement: afterResult.recoveryWinRate - beforeResult.recoveryWinRate,
      tradeCountDiff: afterResult.totalTrades - beforeResult.totalTrades,
      recoveryTradeCountDiff: afterResult.recoveryTrades - beforeResult.recoveryTrades,
    };
    
    logger.info(`Comparison complete: Win Rate ${beforeResult.winRate.toFixed(1)}% -> ${afterResult.winRate.toFixed(1)}% (${comparison.winRateImprovement >= 0 ? '+' : ''}${comparison.winRateImprovement.toFixed(1)}%)`);
    logger.info(`Max Drawdown: ${beforeResult.maxDrawdown.toFixed(1)}% -> ${afterResult.maxDrawdown.toFixed(1)}% (${comparison.drawdownImprovement >= 0 ? '+' : ''}${comparison.drawdownImprovement.toFixed(1)}% improvement)`);
    
    return new Response(JSON.stringify({
      success: true,
      symbol,
      period: { startDate, endDate },
      before: beforeResult,
      after: afterResult,
      comparison,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Error: ${errorMessage}`);
    return new Response(JSON.stringify({
      success: false,
      error: errorMessage,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
