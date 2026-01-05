import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface KlineData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface TierResult {
  tier: number;
  eligible: boolean;
  reason: string;
}

interface TradeResult {
  entryTime: string;
  exitTime: string;
  type: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  percentB: number;
  adx: number;
  adxSlope: number;
  diGap: number;
  tier: number;
  positionSize: number;
  pnlPercent: number;
  pnlAdjusted: number; // PnL adjusted for position size
  exitReason: string;
  priceActionConfirmed: boolean;
  priceActionDetails: {
    shallowPullback: boolean;
    structureIntact: boolean;
    consolidationBreakout: boolean;
    noWickRejection: boolean;
  };
}

interface BacktestSummary {
  symbol: string;
  totalCandlesAnalyzed: number;
  bypassOpportunities: {
    long: number;
    short: number;
  };
  tradesExecuted: {
    long: number;
    short: number;
  };
  tierBreakdown: {
    tier1: { attempts: number; wins: number; totalPnl: number };
    tier2: { attempts: number; wins: number; totalPnl: number };
    tier3: { attempts: number; wins: number; totalPnl: number };
  };
  priceActionStats: {
    withConfirmation: { trades: number; wins: number; avgPnl: number };
    withoutConfirmation: { trades: number; wins: number; avgPnl: number };
  };
  overallMetrics: {
    totalTrades: number;
    winRate: number;
    avgWin: number;
    avgLoss: number;
    profitFactor: number;
    netPnl: number;
    netPnlAdjusted: number; // Adjusted for reduced position sizes
  };
}

// ============= INDICATOR CALCULATIONS =============

function calculateEMA(prices: number[], period: number): number[] {
  const ema: number[] = [];
  const multiplier = 2 / (period + 1);
  ema[0] = prices[0];
  for (let i = 1; i < prices.length; i++) {
    ema[i] = (prices[i] - ema[i - 1]) * multiplier + ema[i - 1];
  }
  return ema;
}

function calculateATR(klines: KlineData[], period: number = 14): number {
  if (klines.length < period + 1) return 0;
  
  const trueRanges: number[] = [];
  for (let i = 1; i < klines.length; i++) {
    const high = klines[i].high;
    const low = klines[i].low;
    const prevClose = klines[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trueRanges.push(tr);
  }
  
  const recentTR = trueRanges.slice(-period);
  return recentTR.reduce((a, b) => a + b, 0) / recentTR.length;
}

function calculateADX(klines: KlineData[], period: number = 14): { adx: number; plusDI: number; minusDI: number; adxSlope: number } {
  if (klines.length < period * 2) return { adx: 0, plusDI: 0, minusDI: 0, adxSlope: 0 };

  const plusDM: number[] = [];
  const minusDM: number[] = [];
  const trueRanges: number[] = [];

  for (let i = 1; i < klines.length; i++) {
    const high = klines[i].high;
    const low = klines[i].low;
    const prevHigh = klines[i - 1].high;
    const prevLow = klines[i - 1].low;
    const prevClose = klines[i - 1].close;

    const upMove = high - prevHigh;
    const downMove = prevLow - low;

    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    trueRanges.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }

  const smoothedPlusDM = calculateEMA(plusDM, period);
  const smoothedMinusDM = calculateEMA(minusDM, period);
  const smoothedTR = calculateEMA(trueRanges, period);

  const plusDI: number[] = [];
  const minusDI: number[] = [];
  const dx: number[] = [];

  for (let i = 0; i < smoothedTR.length; i++) {
    const pdi = smoothedTR[i] > 0 ? (smoothedPlusDM[i] / smoothedTR[i]) * 100 : 0;
    const mdi = smoothedTR[i] > 0 ? (smoothedMinusDM[i] / smoothedTR[i]) * 100 : 0;
    plusDI.push(pdi);
    minusDI.push(mdi);
    const diSum = pdi + mdi;
    dx.push(diSum > 0 ? Math.abs(pdi - mdi) / diSum * 100 : 0);
  }

  const adxValues = calculateEMA(dx, period);
  const currentADX = adxValues[adxValues.length - 1];
  const prevADX = adxValues[adxValues.length - 2] || currentADX;
  
  return {
    adx: currentADX,
    plusDI: plusDI[plusDI.length - 1],
    minusDI: minusDI[minusDI.length - 1],
    adxSlope: currentADX - prevADX
  };
}

function calculateBollingerBands(closes: number[], period: number = 20, stdDev: number = 2): { upper: number; middle: number; lower: number; percentB: number } {
  if (closes.length < period) return { upper: 0, middle: 0, lower: 0, percentB: 50 };
  
  const slice = closes.slice(-period);
  const sma = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sum, val) => sum + Math.pow(val - sma, 2), 0) / period;
  const std = Math.sqrt(variance);
  
  const upper = sma + stdDev * std;
  const lower = sma - stdDev * std;
  const currentPrice = closes[closes.length - 1];
  const percentB = ((currentPrice - lower) / (upper - lower)) * 100;
  
  return { upper, middle: sma, lower, percentB };
}

// ============= TIER EVALUATION =============

const TIER_CONFIG = {
  TIER1: { maxPercentBLong: 95, minPercentBShort: 5, minADX: 25, minADXSlope: 0.02, minDIGap: 10, positionSize: 40 },
  TIER2: { maxPercentBLong: 97, minPercentBShort: 3, minADX: 35, minADXSlope: 0.03, minDIGap: 15, positionSize: 50 },
  TIER3: { maxPercentBLong: 97, minPercentBShort: 3, minADX: 40, minADXSlope: 0, minDIGap: 18, positionSize: 60 },
};

function evaluateTier(
  percentB: number,
  adx: number,
  adxSlope: number,
  diGap: number,
  type: 'long' | 'short'
): TierResult {
  // Check if in bypass zone
  const inBypassZone = type === 'long' 
    ? percentB >= 90 && percentB <= 97
    : percentB >= 3 && percentB <= 10;
  
  if (!inBypassZone) {
    return { tier: 0, eligible: false, reason: `%B ${percentB.toFixed(1)} not in bypass zone` };
  }

  // Check tiers from highest to lowest
  for (const [tierName, config] of [['TIER3', TIER_CONFIG.TIER3], ['TIER2', TIER_CONFIG.TIER2], ['TIER1', TIER_CONFIG.TIER1]] as const) {
    const tierNum = tierName === 'TIER3' ? 3 : tierName === 'TIER2' ? 2 : 1;
    const withinPercentB = type === 'long' 
      ? percentB <= config.maxPercentBLong
      : percentB >= config.minPercentBShort;
    
    if (withinPercentB && adx >= config.minADX && adxSlope >= config.minADXSlope && diGap >= config.minDIGap) {
      return { tier: tierNum, eligible: true, reason: `${tierName} eligible: ADX ${adx.toFixed(1)}, slope ${adxSlope.toFixed(3)}, DI gap ${diGap.toFixed(1)}` };
    }
  }

  return { tier: 0, eligible: false, reason: `No tier eligible: ADX ${adx.toFixed(1)}, slope ${adxSlope.toFixed(3)}, DI gap ${diGap.toFixed(1)}` };
}

// ============= PRICE ACTION CONFIRMATION =============

function checkPriceActionConfirmation(
  klines: KlineData[],
  type: 'long' | 'short',
  atr: number
): { anyPassed: boolean; shallowPullback: boolean; structureIntact: boolean; consolidationBreakout: boolean; noWickRejection: boolean } {
  if (klines.length < 10) {
    return { anyPassed: false, shallowPullback: false, structureIntact: false, consolidationBreakout: false, noWickRejection: false };
  }

  const recent = klines.slice(-10);
  const currentCandle = recent[recent.length - 1];
  
  // 1. Shallow Pullback (< 38.2% retracement)
  const highs = recent.map(k => k.high);
  const lows = recent.map(k => k.low);
  const swingHigh = Math.max(...highs);
  const swingLow = Math.min(...lows);
  const range = swingHigh - swingLow;
  
  let shallowPullback = false;
  if (range > 0) {
    if (type === 'long') {
      const pullbackDepth = ((swingHigh - currentCandle.low) / range) * 100;
      shallowPullback = pullbackDepth <= 38.2;
    } else {
      const pullbackDepth = ((currentCandle.high - swingLow) / range) * 100;
      shallowPullback = pullbackDepth <= 38.2;
    }
  }

  // 2. Structure Intact (higher-lows for LONG, lower-highs for SHORT)
  let structureIntact = false;
  if (type === 'long') {
    // Check for higher lows in last 4 candles
    const recentLows = recent.slice(-4).map(k => k.low);
    structureIntact = recentLows.every((low, i) => i === 0 || low >= recentLows[i - 1] * 0.998);
  } else {
    // Check for lower highs in last 4 candles
    const recentHighs = recent.slice(-4).map(k => k.high);
    structureIntact = recentHighs.every((high, i) => i === 0 || high <= recentHighs[i - 1] * 1.002);
  }

  // 3. Consolidation Breakout (low volatility compression before current move)
  const last4Ranges = recent.slice(-5, -1).map(k => k.high - k.low);
  const avgRange = last4Ranges.reduce((a, b) => a + b, 0) / last4Ranges.length;
  const consolidationBreakout = avgRange < atr * 0.6;

  // 4. No Wick Rejection Cluster
  const last5 = recent.slice(-5);
  let rejectionCount = 0;
  for (const candle of last5) {
    const candleRange = candle.high - candle.low;
    if (candleRange > 0) {
      if (type === 'long') {
        const upperWick = candle.high - Math.max(candle.open, candle.close);
        if ((upperWick / candleRange) * 100 > 50) rejectionCount++;
      } else {
        const lowerWick = Math.min(candle.open, candle.close) - candle.low;
        if ((lowerWick / candleRange) * 100 > 50) rejectionCount++;
      }
    }
  }
  const noWickRejection = rejectionCount < 3;

  const anyPassed = shallowPullback || structureIntact || consolidationBreakout || noWickRejection;
  
  return { anyPassed, shallowPullback, structureIntact, consolidationBreakout, noWickRejection };
}

// ============= MAIN BACKTEST LOGIC =============

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol, startDate, endDate, requirePriceAction } = await req.json();
    
    console.log(`[BOLLINGER-BACKTEST] Starting: ${symbol} from ${startDate} to ${endDate}`);

    // Fetch historical klines
    const startTime = new Date(startDate).getTime();
    const endTime = new Date(endDate).getTime();
    const bufferMs = 50 * 60 * 60 * 1000; // 50 hours buffer

    async function fetchAllKlines(sym: string, interval: string, start: number, end: number): Promise<any[]> {
      const allKlines: any[] = [];
      let currentStart = start - bufferMs;
      
      while (currentStart < end) {
        const response = await fetch(
          `https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${interval}&startTime=${currentStart}&endTime=${end}&limit=1000`
        );
        if (!response.ok) throw new Error(`Failed to fetch klines: ${response.statusText}`);
        const klines = await response.json();
        if (klines.length === 0) break;
        allKlines.push(...klines);
        currentStart = klines[klines.length - 1][0] + 1;
        if (currentStart < end) await new Promise(r => setTimeout(r, 100));
      }
      return allKlines;
    }

    const rawKlines = await fetchAllKlines(symbol, '1h', startTime, endTime);
    console.log(`[BOLLINGER-BACKTEST] Fetched ${rawKlines.length} klines`);

    // Parse klines
    const klines: KlineData[] = rawKlines.map((k: any) => ({
      timestamp: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5])
    }));

    // Find simulation start
    const simStartIdx = klines.findIndex(k => k.timestamp >= startTime);
    if (simStartIdx < 50) {
      return new Response(JSON.stringify({ error: 'Not enough historical data' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      });
    }

    const trades: TradeResult[] = [];
    let bypassOpportunities = { long: 0, short: 0 };
    let position: { type: 'long' | 'short'; entryPrice: number; entryTime: string; tier: number; positionSize: number; percentB: number; adx: number; adxSlope: number; diGap: number; priceAction: any } | null = null;

    // Simulate
    for (let i = simStartIdx; i < klines.length; i++) {
      const slice = klines.slice(0, i + 1);
      const current = slice[slice.length - 1];
      const closes = slice.map(k => k.close);
      
      // Calculate indicators
      const bb = calculateBollingerBands(closes);
      const adxData = calculateADX(slice);
      const atr = calculateATR(slice);
      const diGap = Math.abs(adxData.plusDI - adxData.minusDI);

      // Manage existing position
      if (position) {
        const pnlPercent = position.type === 'long'
          ? ((current.close - position.entryPrice) / position.entryPrice) * 100
          : ((position.entryPrice - current.close) / position.entryPrice) * 100;

        // Simple exit: 2% TP, 1% SL, or 12 candles (12h)
        const holdTime = i - klines.findIndex(k => new Date(k.timestamp).toISOString() === position!.entryTime);
        let exitReason = '';
        
        if (pnlPercent >= 2) exitReason = 'take_profit';
        else if (pnlPercent <= -1) exitReason = 'stop_loss';
        else if (holdTime >= 12) exitReason = 'time_exit';

        if (exitReason) {
          const pnlAdjusted = pnlPercent * (position.positionSize / 100);
          trades.push({
            entryTime: position.entryTime,
            exitTime: new Date(current.timestamp).toISOString(),
            type: position.type,
            entryPrice: position.entryPrice,
            exitPrice: current.close,
            percentB: position.percentB,
            adx: position.adx,
            adxSlope: position.adxSlope,
            diGap: position.diGap,
            tier: position.tier,
            positionSize: position.positionSize,
            pnlPercent,
            pnlAdjusted,
            exitReason,
            priceActionConfirmed: position.priceAction.anyPassed,
            priceActionDetails: {
              shallowPullback: position.priceAction.shallowPullback,
              structureIntact: position.priceAction.structureIntact,
              consolidationBreakout: position.priceAction.consolidationBreakout,
              noWickRejection: position.priceAction.noWickRejection
            }
          });
          position = null;
        }
        continue;
      }

      // Entry logic - only in bypass zones
      const longBypassZone = bb.percentB >= 90 && bb.percentB <= 97;
      const shortBypassZone = bb.percentB >= 3 && bb.percentB <= 10;

      if (longBypassZone) {
        bypassOpportunities.long++;
        const tierResult = evaluateTier(bb.percentB, adxData.adx, adxData.adxSlope, diGap, 'long');
        
        if (tierResult.eligible && adxData.plusDI > adxData.minusDI) {
          const priceAction = checkPriceActionConfirmation(slice, 'long', atr);
          
          if (!requirePriceAction || priceAction.anyPassed) {
            position = {
              type: 'long',
              entryPrice: current.close,
              entryTime: new Date(current.timestamp).toISOString(),
              tier: tierResult.tier,
              positionSize: tierResult.tier === 3 ? 60 : tierResult.tier === 2 ? 50 : 40,
              percentB: bb.percentB,
              adx: adxData.adx,
              adxSlope: adxData.adxSlope,
              diGap,
              priceAction
            };
          }
        }
      }

      if (shortBypassZone && !position) {
        bypassOpportunities.short++;
        const tierResult = evaluateTier(bb.percentB, adxData.adx, adxData.adxSlope, diGap, 'short');
        
        if (tierResult.eligible && adxData.minusDI > adxData.plusDI) {
          const priceAction = checkPriceActionConfirmation(slice, 'short', atr);
          
          if (!requirePriceAction || priceAction.anyPassed) {
            position = {
              type: 'short',
              entryPrice: current.close,
              entryTime: new Date(current.timestamp).toISOString(),
              tier: tierResult.tier,
              positionSize: tierResult.tier === 3 ? 60 : tierResult.tier === 2 ? 50 : 40,
              percentB: bb.percentB,
              adx: adxData.adx,
              adxSlope: adxData.adxSlope,
              diGap,
              priceAction
            };
          }
        }
      }
    }

    // Calculate summary
    const tierBreakdown = {
      tier1: { attempts: 0, wins: 0, totalPnl: 0 },
      tier2: { attempts: 0, wins: 0, totalPnl: 0 },
      tier3: { attempts: 0, wins: 0, totalPnl: 0 }
    };

    const priceActionStats = {
      withConfirmation: { trades: 0, wins: 0, totalPnl: 0 },
      withoutConfirmation: { trades: 0, wins: 0, totalPnl: 0 }
    };

    let totalWins = 0;
    let totalLosses = 0;
    let sumWins = 0;
    let sumLosses = 0;

    for (const trade of trades) {
      const isWin = trade.pnlPercent > 0;
      
      // Tier breakdown
      if (trade.tier === 1) {
        tierBreakdown.tier1.attempts++;
        if (isWin) tierBreakdown.tier1.wins++;
        tierBreakdown.tier1.totalPnl += trade.pnlAdjusted;
      } else if (trade.tier === 2) {
        tierBreakdown.tier2.attempts++;
        if (isWin) tierBreakdown.tier2.wins++;
        tierBreakdown.tier2.totalPnl += trade.pnlAdjusted;
      } else if (trade.tier === 3) {
        tierBreakdown.tier3.attempts++;
        if (isWin) tierBreakdown.tier3.wins++;
        tierBreakdown.tier3.totalPnl += trade.pnlAdjusted;
      }

      // Price action breakdown
      if (trade.priceActionConfirmed) {
        priceActionStats.withConfirmation.trades++;
        if (isWin) priceActionStats.withConfirmation.wins++;
        priceActionStats.withConfirmation.totalPnl += trade.pnlAdjusted;
      } else {
        priceActionStats.withoutConfirmation.trades++;
        if (isWin) priceActionStats.withoutConfirmation.wins++;
        priceActionStats.withoutConfirmation.totalPnl += trade.pnlAdjusted;
      }

      if (isWin) {
        totalWins++;
        sumWins += trade.pnlPercent;
      } else {
        totalLosses++;
        sumLosses += Math.abs(trade.pnlPercent);
      }
    }

    const summary: BacktestSummary = {
      symbol,
      totalCandlesAnalyzed: klines.length - simStartIdx,
      bypassOpportunities,
      tradesExecuted: {
        long: trades.filter(t => t.type === 'long').length,
        short: trades.filter(t => t.type === 'short').length
      },
      tierBreakdown,
      priceActionStats: {
        withConfirmation: {
          trades: priceActionStats.withConfirmation.trades,
          wins: priceActionStats.withConfirmation.wins,
          avgPnl: priceActionStats.withConfirmation.trades > 0 
            ? priceActionStats.withConfirmation.totalPnl / priceActionStats.withConfirmation.trades 
            : 0
        },
        withoutConfirmation: {
          trades: priceActionStats.withoutConfirmation.trades,
          wins: priceActionStats.withoutConfirmation.wins,
          avgPnl: priceActionStats.withoutConfirmation.trades > 0 
            ? priceActionStats.withoutConfirmation.totalPnl / priceActionStats.withoutConfirmation.trades 
            : 0
        }
      },
      overallMetrics: {
        totalTrades: trades.length,
        winRate: trades.length > 0 ? (totalWins / trades.length) * 100 : 0,
        avgWin: totalWins > 0 ? sumWins / totalWins : 0,
        avgLoss: totalLosses > 0 ? sumLosses / totalLosses : 0,
        profitFactor: sumLosses > 0 ? sumWins / sumLosses : sumWins > 0 ? 999 : 0,
        netPnl: trades.reduce((sum, t) => sum + t.pnlPercent, 0),
        netPnlAdjusted: trades.reduce((sum, t) => sum + t.pnlAdjusted, 0)
      }
    };

    console.log(`[BOLLINGER-BACKTEST] Complete: ${trades.length} trades, ${summary.overallMetrics.winRate.toFixed(1)}% win rate`);

    return new Response(JSON.stringify({ summary, trades }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[BOLLINGER-BACKTEST] Error:', errMessage);
    return new Response(JSON.stringify({ error: errMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});
