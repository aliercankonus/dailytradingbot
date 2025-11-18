import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

// Calculate EMA
function calculateEMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1];
  
  const multiplier = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }
  
  return ema;
}

// Calculate RSI
function calculateRSI(prices: number[], period = 14): number {
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
  return 100 - 100 / (1 + avgGain / avgLoss);
}

// Calculate ATR (Average True Range) - FIXED to use real high/low data
function calculateATR(highs: number[], lows: number[], closes: number[], period = 14): number {
  if (closes.length < period + 1) return 0;
  
  const trueRanges: number[] = [];
  for (let i = closes.length - period; i < closes.length; i++) {
    const high = highs[i];
    const low = lows[i];
    const prevClose = closes[i - 1];
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
  }
  
  return trueRanges.reduce((a, b) => a + b, 0) / trueRanges.length;
}

// Calculate support/resistance structure strength - ATR-BASED (volatility adaptive)
function analyzeStructure(
  prices: number[],
  highs: number[],
  lows: number[],
  currentPrice: number, 
  direction: "long" | "short"
): number {
  if (prices.length < 50) return 0.5;
  
  const recentPrices = prices.slice(-50);
  const high = Math.max(...recentPrices);
  const low = Math.min(...recentPrices);
  const range = high - low;
  
  // Calculate ATR for dynamic stop/target levels
  const atr = calculateATR(highs.slice(-50), lows.slice(-50), prices.slice(-50), 14);
  
  // Check for support/resistance levels
  let structureScore = 0;
  
  // 1. Support behind stop (for longs) or resistance behind stop (for shorts)
  // Use 2x ATR for stop distance instead of fixed 2%
  const stopDistance = direction === "long" ? -2 * atr : 2 * atr;
  const stopLevel = currentPrice + stopDistance;
  const nearbyLevels = recentPrices.filter(p => 
    Math.abs(p - stopLevel) < atr * 0.5 // Look within 0.5 ATR of stop level
  ).length;
  structureScore += nearbyLevels > 2 ? 0.33 : 0;
  
  // 2. No immediate resistance (for longs) or support (for shorts)
  // Use 1.5x ATR for target distance instead of fixed 1%
  const targetDistance = direction === "long" ? 1.5 * atr : -1.5 * atr;
  const targetLevel = currentPrice + targetDistance;
  const resistanceLevels = recentPrices.filter(p => 
    direction === "long" ? (p > currentPrice && p < targetLevel) : (p < currentPrice && p > targetLevel)
  ).length;
  structureScore += resistanceLevels < 3 ? 0.33 : 0;
  
  // 3. Price position in range (prefer lows for longs, highs for shorts)
  const pricePosition = (currentPrice - low) / range;
  if (direction === "long") {
    structureScore += pricePosition < 0.5 ? 0.34 : 0;
  } else {
    structureScore += pricePosition > 0.5 ? 0.34 : 0;
  }
  
  return Math.min(structureScore, 1);
}

// Calculate EMA slope strength
function calculateEMASlope(prices: number[]): number {
  if (prices.length < 200) return 0.5;
  
  const ema20 = calculateEMA(prices, 20);
  const ema50 = calculateEMA(prices, 50);
  const ema200 = calculateEMA(prices, 200);
  
  // Check EMA alignment: 20 > 50 > 200 for uptrend, reverse for downtrend
  const bullishAlignment = ema20 > ema50 && ema50 > ema200;
  const bearishAlignment = ema20 < ema50 && ema50 < ema200;
  
  if (bullishAlignment) return 1;
  if (bearishAlignment) return -1;
  return 0;
}

// Calculate MACD - FIXED to properly calculate signal line as 9-period EMA
function calculateMACD(prices: number[]): { macd: number; signal: number; histogram: number } {
  if (prices.length < 35) {
    return { macd: 0, signal: 0, histogram: 0 };
  }

  // Calculate MACD line for all available prices
  const macdLine: number[] = [];
  for (let i = 26; i < prices.length; i++) {
    const priceSlice = prices.slice(0, i + 1);
    const ema12 = calculateEMA(priceSlice, 12);
    const ema26 = calculateEMA(priceSlice, 26);
    macdLine.push(ema12 - ema26);
  }

  // Calculate signal line as 9-period EMA of MACD line
  const signal = calculateEMA(macdLine, 9);
  
  // Current MACD value
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const macd = ema12 - ema26;
  
  // Histogram is difference between MACD and signal
  const histogram = macd - signal;

  return { macd, signal, histogram };
}

// Detect trend based on price action
function detectTrend(data: MarketData): "bullish" | "bearish" | "ranging" {
  const changePercent = parseFloat(data.priceChangePercent);
  
  // More realistic thresholds for trend detection
  // Bullish: Price up by more than 1%
  if (changePercent > 1) return "bullish";
  
  // Bearish: Price down by more than 1%
  if (changePercent < -1) return "bearish";
  
  // Ranging: Price moving between -1% and +1%
  return "ranging";
}

// Fetch real Binance kline data with volume
async function fetchBinanceKlines(
  symbol: string,
  limit: number = 100,
): Promise<{ prices: number[]; highs: number[]; lows: number[]; volumes: number[] }> {
  try {
    const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1m&limit=${limit}`);

    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status}`);
    }

    const klines = await response.json();

    // Binance klines: [openTime, open, high, low, close, volume, closeTime, quoteVolume, trades, ...]
    const prices = klines.map((k: any) => parseFloat(k[4])); // close prices
    const highs = klines.map((k: any) => parseFloat(k[2])); // high prices
    const lows = klines.map((k: any) => parseFloat(k[3])); // low prices
    const volumes = klines.map((k: any) => parseFloat(k[5])); // volumes

    console.log(`Fetched ${prices.length} klines for ${symbol}, latest volume: ${volumes[volumes.length - 1]}`);

    return { prices, highs, lows, volumes };
  } catch (error) {
    console.error(`Failed to fetch Binance klines for ${symbol}:`, error);
    // Fallback to synthetic data
    const prices: number[] = [];
    const highs: number[] = [];
    const lows: number[] = [];
    const volumes: number[] = [];
    let price = 50000;

    for (let i = 0; i < limit; i++) {
      const change = (Math.random() - 0.5) * 0.02;
      price = price * (1 + change);
      prices.push(price);
      highs.push(price * 1.005); // synthetic high 0.5% above close
      lows.push(price * 0.995); // synthetic low 0.5% below close
      volumes.push(Math.random() * 1000000 + 500000); // synthetic volume with minimum
    }

    console.log(`Using synthetic data for ${symbol}, generated ${prices.length} prices`);
    return { prices, highs, lows, volumes };
  }
}

// Calculate indicator value
function calculateIndicator(
  indicatorConfig: IndicatorConfig,
  marketData: MarketData,
  historicalPrices: number[],
  volumes: number[],
): number {
  const currentPrice = parseFloat(marketData.lastPrice);

  switch (indicatorConfig.type) {
    case "RSI":
      return calculateRSI(historicalPrices, indicatorConfig.period || 14);
    case "EMA":
      return calculateEMA(historicalPrices, indicatorConfig.period || 20);
    case "MACD":
      const macd = calculateMACD(historicalPrices);
      return macd.macd;
    case "Price":
      return currentPrice;
    case "Volume":
      return volumes[volumes.length - 1] || 0;
    case "Volume_Avg": {
      const period = indicatorConfig.period || 20;
      const recentVolumes = volumes.slice(-period);
      return recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
    }
    default:
      return 0;
  }
}

// Evaluate a condition
function evaluateCondition(
  condition: Condition,
  indicatorValues: Map<string, number>,
  marketData: MarketData,
): boolean {
  // Skip conditions with empty or invalid thresholds
  if (!condition.value || condition.value.trim() === "") {
    console.log(`Skipping invalid condition: ${condition.indicator} ${condition.operator} (empty threshold)`);
    return true; // Don't block signal due to invalid config
  }

  const targetValue = parseFloat(condition.value);
  if (isNaN(targetValue)) {
    console.log(
      `Skipping invalid condition: ${condition.indicator} ${condition.operator} ${condition.value} (not a number)`,
    );
    return true;
  }

  const indicatorValue = indicatorValues.get(condition.indicator) || 0;

  console.log(
    `Evaluating: ${condition.indicator} ${condition.operator} ${condition.value} (current: ${indicatorValue})`,
  );

  switch (condition.operator) {
    case "above":
      return indicatorValue > targetValue;
    case "below":
      return indicatorValue < targetValue;
    case "crosses_above":
      // Simplified: just check if currently above
      return indicatorValue > targetValue;
    case "crosses_below":
      // Simplified: just check if currently below
      return indicatorValue < targetValue;
    default:
      return false;
  }
}

// Analyze market using custom strategy
async function analyzeWithStrategy(
  data: MarketData, 
  strategy: CustomStrategy, 
  prices: number[],
  highs: number[],
  lows: number[],
  volumes: number[],
  supabase: any,
  minConfidenceThreshold: number,
  userId: string
) {
  const currentPrice = parseFloat(data.lastPrice);

  // Calculate all indicators for this strategy
  const indicatorValues = new Map<string, number>();

  for (const indicatorConfig of strategy.indicators) {
    const value = calculateIndicator(indicatorConfig, data, prices, volumes);
    indicatorValues.set(indicatorConfig.type, value);
    console.log(`Calculated ${indicatorConfig.type}: ${value}`);
  }

  // Add Price as an indicator
  indicatorValues.set("Price", currentPrice);

  // Evaluate entry conditions
  const entryConditionsMet = strategy.entry_conditions.every((condition) =>
    evaluateCondition(condition, indicatorValues, data),
  );

  console.log(`Strategy ${strategy.name} - Entry conditions met: ${entryConditionsMet}`);

  // Return null if entry conditions not met
  if (!entryConditionsMet) {
    return null;
  }

  // ============================================================
  // HIGHER TIMEFRAME TREND FILTER + PULLBACK ENTRY SYSTEM
  // ============================================================
  let marketTrend: "bullish" | "bearish" | "ranging" = "ranging";
  let trendConsistency = 0;
  let higherTimeframeAligned = false;
  let inPullback = false;
  let pullbackIdeal = false;
  let momentumConfirms = false;
  let isRanging = false;
  
  try {
    const { data: trendData, error: trendError } = await supabase.functions.invoke('calculate-trend', {
      body: { symbol: data.symbol }
    });
    
    if (trendError) {
      console.error(`Error fetching trend for ${data.symbol}:`, trendError);
      return null; // Don't trade without trend data
    } 
    
    if (trendData) {
      marketTrend = trendData.trend;
      trendConsistency = trendData.trendConsistency || 0;
      
      // Extract new filter data
      higherTimeframeAligned = trendData.higherTimeframeFilter?.aligned || false;
      inPullback = trendData.pullback?.inPullback || false;
      pullbackIdeal = trendData.pullback?.ideal || false;
      momentumConfirms = trendData.momentum?.confirms || false;
      isRanging = trendData.ranging?.isRanging || false;
      
      console.log(`${data.symbol} FILTERS: 4h+1h=${higherTimeframeAligned} pullback=${inPullback}(${trendData.pullback?.pullbackPercent}%) momentum=${momentumConfirms} ranging=${isRanging}`);
    }
  } catch (error) {
    console.error(`Failed to fetch trend for ${data.symbol}:`, error);
    return null; // Don't trade without trend data
  }

  // Helper function to log rejection reason
  const logRejection = async (reason: string, filtersStatus: any) => {
    try {
      await supabase
        .from('signal_rejection_log')
        .insert({
          user_id: userId,
          symbol: data.symbol,
          rejection_reason: reason,
          filters_status: filtersStatus,
          trend_data: {
            marketTrend: marketTrend,
            trendConsistency: trendConsistency,
            higherTimeframeAligned: higherTimeframeAligned,
            inPullback: inPullback,
            pullbackIdeal: pullbackIdeal,
            momentumConfirms: momentumConfirms,
            isRanging: isRanging
          }
        });
    } catch (error) {
      console.error('Failed to log rejection:', error);
    }
  };

  // ============================================================
  // FILTER 1: RANGING MARKET DETECTION
  // ============================================================
  if (isRanging || marketTrend === "ranging") {
    console.log(`❌ ${data.symbol}: RANGING MARKET - ATR too low for directional trading`);
    await logRejection('Ranging market detected', {
      isRanging: true,
      marketTrend: marketTrend,
      required: 'Clear trend direction needed'
    });
    return null;
  }

  // ============================================================
  // FILTER 2: HIGHER TIMEFRAME ALIGNMENT (MOST IMPORTANT)
  // ============================================================
  // CRITICAL: Only trade when 4h + 1h agree on direction
  if (!higherTimeframeAligned) {
    console.log(`❌ ${data.symbol}: Higher timeframes NOT aligned (4h and 1h must agree)`);
    await logRejection('Higher timeframes not aligned', {
      higherTimeframeAligned: false,
      marketTrend: marketTrend,
      required: '4h and 1h must agree on direction'
    });
    return null;
  }

  // ============================================================
  // DETERMINE SIGNAL TYPE BASED ON ALIGNED HIGHER TIMEFRAME TREND
  // ============================================================
  // NOTE: We've already verified higherTimeframeAligned (4h + 1h agree)
  // marketTrend here is the 4h trend, which now matches 1h due to alignment check
  let signalType: "long" | "short";
  let reason = `${strategy.name}: Entry conditions met`;

  if (marketTrend === "bullish" && higherTimeframeAligned) {
    signalType = "long";
    reason = `${strategy.name}: 4h+1h confirmed bullish`;
  } 
  else if (marketTrend === "bearish" && higherTimeframeAligned) {
    signalType = "short";
    reason = `${strategy.name}: 4h+1h confirmed bearish`;
  } 
  else {
    // Should never reach here due to earlier alignment check, but defensive
    console.log(`❌ ${data.symbol}: Invalid trend state after alignment check`);
    await logRejection('Invalid trend state', {
      marketTrend: marketTrend,
      higherTimeframeAligned: higherTimeframeAligned,
      required: 'Aligned bullish or bearish trend'
    });
    return null;
  }

  // ============================================================
  // FILTER 3: MOMENTUM CONFIRMATION
  // ============================================================
  // Require 2-3 consecutive candles + MACD histogram expanding
  if (!momentumConfirms) {
    console.log(`❌ ${data.symbol}: Momentum NOT building (need 2+ consecutive candles)`);
    await logRejection('Momentum not confirmed', {
      higherTimeframeAligned: true,
      momentumConfirms: false,
      required: '2-3 consecutive candles on 15m and 5m + MACD expanding'
    });
    return null;
  }

  // ============================================================
  // FILTER 4: PULLBACK DETECTION (STRICT REQUIREMENT)
  // ============================================================
  // MANDATORY: Only enter trades in pullback zone (20-60% retracement)
  // This prevents entering at extended prices that immediately reverse
  if (!inPullback) {
    console.log(`❌ ${data.symbol}: NOT IN PULLBACK ZONE - trade rejected (must be 20-60% retracement)`);
    await logRejection('Not in pullback zone', {
      higherTimeframeAligned: true,
      momentumConfirms: true,
      isRanging: false,
      inPullback: false,
      required: '20-60% retracement'
    });
    return null; // STRICT REJECTION - no trades outside pullback
  }
  
  if (pullbackIdeal) {
    reason += ` + ideal pullback entry`;
    console.log(`✓ ${data.symbol}: IDEAL PULLBACK ENTRY (20-50% retracement)`);
  } else {
    reason += ` + pullback zone entry`;
  }

  // Calculate stop loss and take profit based on strategy settings
  const stopLossPercent = strategy.risk_settings.stopLossPercent;
  const takeProfitPercent = strategy.risk_settings.takeProfitPercent;

  const stopLoss =
    signalType === "long" ? currentPrice * (1 - stopLossPercent / 100) : currentPrice * (1 + stopLossPercent / 100);

  const takeProfit =
    signalType === "long" ? currentPrice * (1 + takeProfitPercent / 100) : currentPrice * (1 - takeProfitPercent / 100);

  const riskRewardRatio = takeProfitPercent / stopLossPercent;

  // Calculate confidence score based on multiple factors (0-100)
  
  // 1. TREND (30%): Structure + EMA Slope + Multi-TF Agreement
  const structureStrength = analyzeStructure(prices, highs, lows, currentPrice, signalType);
  const emaSlope = calculateEMASlope(prices);
  const mtfAgreement = trendConsistency / 100; // Convert to 0-1
  const trendNorm = Math.min(Math.max(
    0.55 * structureStrength + 0.35 * emaSlope + 0.10 * mtfAgreement,
    0
  ), 1);
  const trendWeight = trendNorm * 30;
  
  // 2. STRUCTURE (15%): Support/resistance and clean path
  const structureScore = analyzeStructure(prices, highs, lows, currentPrice, signalType);
  const structureWeight = structureScore * 15;
  
  // 3. MOMENTUM (15%): EMA gap + MACD direction + RSI slope
  // RECALIBRATED for tight stops (0.5-2% range): Lower EMA gap threshold
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const emaGap = Math.abs((ema12 - ema26) / currentPrice) * 100;
  const emaGapNorm = Math.min(emaGap / 0.2, 1); // Changed from 0.5% to 0.2% for tighter stops
  
  const macd = indicatorValues.get("MACD") || 0;
  const macdDirection = (macd > 0 && signalType === "long") || (macd < 0 && signalType === "short") ? 1 : 0.5; // Partial credit instead of 0
  
  const rsi = indicatorValues.get("RSI") || 50;
  const rsiSlope = signalType === "long" ? Math.max(0, (50 - rsi) / 30) : Math.max(0, (rsi - 50) / 30);
  
  const momentumNorm = Math.min(Math.max(
    0.5 * emaGapNorm + 0.3 * macdDirection + 0.2 * rsiSlope, // Rebalanced weights
    0
  ), 1);
  const momentumWeight = momentumNorm * 15;
  
  // 4. VOLUME (15%): Current volume vs average
  // RECALIBRATED: More forgiving volume requirements
  const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const currentVolume = volumes[volumes.length - 1];
  const volumeRatio = currentVolume / avgVolume;
  const volumeNorm = Math.min(Math.max((volumeRatio - 0.3) / (1.2 - 0.3), 0), 1); // Lowered from 0.5-1.5 to 0.3-1.2
  const volumeWeight = volumeNorm * 15;
  
  // 5. RISK/REWARD (15%): R:R ratio quality
  // RECALIBRATED for tight stops: Accept 0.8:1 to 2.0:1 range instead of 1.0:1 to 2.5:1
  const rrNorm = Math.min(Math.max((riskRewardRatio - 0.8) / (2.0 - 0.8), 0), 1);
  const rrWeight = rrNorm * 15;
  
  // 6. VOLATILITY (10%): ATR-based volatility check
  // RECALIBRATED for tight stops: More forgiving volatility ranges
  const atr14 = calculateATR(highs, lows, prices, 14);
  const atr50 = calculateATR(highs, lows, prices, 50);
  const volRatio = atr50 > 0 ? atr14 / atr50 : 1;
  let volNorm = 0.5; // Default neutral
  if (volRatio < 0.7) volNorm = 0.4; // Low volatility is more acceptable now
  else if (volRatio >= 0.7 && volRatio <= 1.3) volNorm = 1; // Wider ideal range
  else if (volRatio > 1.3 && volRatio <= 1.6) volNorm = 0.7; // More forgiving high volatility
  else volNorm = 0.5; // Still penalize extreme volatility but less harsh
  const volWeight = volNorm * 10;
  
  // 7. ENTRY TIMING BONUS (10%): Pullback quality
  // Since pullback is now MANDATORY, reward ideal pullback entries (20-50% retracement)
  let entryTimingBonus = 0;
  if (pullbackIdeal) {
    entryTimingBonus = 10; // Full bonus for ideal pullback (20-50%)
  } else if (inPullback) {
    entryTimingBonus = 7; // Good bonus for being in pullback zone (20-60%)
  }
  // Note: momentumConfirms is already checked earlier as a hard requirement
  
  // Final confidence score (now out of 110%, scaled back to 100%)
  const rawConfidence = 
    trendWeight + structureWeight + momentumWeight + volumeWeight + rrWeight + volWeight + entryTimingBonus;
  
  // Scale to ensure max is 100%
  const confidenceScore = Math.round(Math.min(rawConfidence * (100 / 110), 100));
  
  console.log(`Confidence breakdown for ${data.symbol}:`, {
    trend: `${trendWeight.toFixed(1)}% (struct: ${structureStrength.toFixed(2)}, ema: ${emaSlope.toFixed(2)}, mtf: ${mtfAgreement.toFixed(2)})`,
    structure: `${structureWeight.toFixed(1)}% (score: ${structureScore.toFixed(2)})`,
    momentum: `${momentumWeight.toFixed(1)}% (ema: ${emaGapNorm.toFixed(2)}, macd: ${macdDirection}, rsi: ${rsiSlope.toFixed(2)})`,
    volume: `${volumeWeight.toFixed(1)}% (ratio: ${volumeRatio.toFixed(2)}x)`,
    riskReward: `${rrWeight.toFixed(1)}% (R:R ${riskRewardRatio.toFixed(2)})`,
    volatility: `${volWeight.toFixed(1)}% (atr ratio: ${volRatio.toFixed(2)})`,
    entryTiming: `${entryTimingBonus.toFixed(1)}% (pullbackIdeal: ${pullbackIdeal}, inPullback: ${inPullback}, momentum: ${momentumConfirms})`,
    raw: `${rawConfidence.toFixed(1)}%`,
    final: `${confidenceScore}%`
  });

  // Filter out low confidence signals using user's configured threshold
  if (confidenceScore < minConfidenceThreshold) {
    console.log(`Skipping signal for ${data.symbol}: Confidence too low (${confidenceScore}% < ${minConfidenceThreshold}%)`);
    return null;
  }
  
  return {
    symbol: data.symbol,
    signalType,
    trend: marketTrend,
    entryPrice: currentPrice,
    stopLoss,
    takeProfit,
    riskRewardRatio,
    confidenceScore,
    indicators: Object.fromEntries(indicatorValues),
    reason,
    strategyName: strategy.name,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check for service-level user ID (from auto-trader)
    const serviceUserId = req.headers.get("x-user-id");
    
    let user;
    let authHeader = req.headers.get("Authorization");

    if (serviceUserId) {
      // Service-level call from auto-trader
      const { data: userData, error: userError } = await supabase.auth.admin.getUserById(serviceUserId);
      
      if (userError || !userData.user) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Invalid service user ID",
          }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      
      user = userData.user;
      console.log(`Strategy analyzer called by auto-trader for user: ${user.id}`);
    } else if (authHeader) {
      // Regular authenticated call from frontend
      const token = authHeader.replace("Bearer ", "");
      const {
        data: { user: authenticatedUser },
        error: userError,
      } = await supabase.auth.getUser(token);

      if (userError || !authenticatedUser) {
        return new Response(
          JSON.stringify({
            success: true,
            signals: [],
            executedSignals: 0,
            autoExecuteEnabled: false,
            message: "Not authenticated",
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      
      user = authenticatedUser;
      console.log(`Strategy analyzer called by user: ${user.id}`);
    } else {
      // No authentication provided
      return new Response(
        JSON.stringify({
          success: true,
          signals: [],
          executedSignals: 0,
          autoExecuteEnabled: false,
          message: "Not authenticated",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Check if auto-trading is enabled for this user
    const { data: riskParams } = await supabase
      .from("risk_parameters")
      .select("is_trading_enabled, max_open_trades, current_open_trades, paper_trading_mode, min_confidence_threshold")
      .eq("user_id", user.id)
      .single();

    // Sync current_open_trades with actual active positions count
    const { count: activePositionsCount } = await supabase
      .from("positions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "active");

    const actualOpenTrades = activePositionsCount || 0;

    // Update if mismatch
    if (riskParams && riskParams.current_open_trades !== actualOpenTrades) {
      console.log(`Syncing current_open_trades from ${riskParams.current_open_trades} to ${actualOpenTrades}`);
      await supabase.from("risk_parameters").update({ current_open_trades: actualOpenTrades }).eq("user_id", user.id);
    }

    const maxOpenTrades = riskParams?.max_open_trades || 5;
    const availableSlots = maxOpenTrades - actualOpenTrades;
    const autoExecute = riskParams?.is_trading_enabled && availableSlots > 0;

    console.log(
      `Auto-execute enabled: ${autoExecute} (is_trading_enabled: ${riskParams?.is_trading_enabled}, open: ${actualOpenTrades}/${maxOpenTrades}, available slots: ${availableSlots})`,
    );

    // If trading is disabled, don't generate signals at all
    if (!riskParams?.is_trading_enabled) {
      console.log("Trading is disabled, skipping signal generation");
      return new Response(
        JSON.stringify({
          success: true,
          message: "Trading is currently disabled",
          signals: [],
          executedSignals: 0,
          autoExecuteEnabled: false,
          timestamp: new Date().toISOString(),
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    // If no available slots, don't generate any signals
    if (availableSlots <= 0) {
      console.log("No available trade slots, skipping signal generation");
      return new Response(
        JSON.stringify({
          success: true,
          message: `Maximum open trades reached (${actualOpenTrades}/${maxOpenTrades})`,
          signals: [],
          executedSignals: 0,
          autoExecuteEnabled: false,
          timestamp: new Date().toISOString(),
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    // Fetch active custom strategies for this user
    const { data: customStrategies, error: customError } = await supabase
      .from("custom_strategies")
      .select("*")
      .eq("is_active", true)
      .eq("user_id", user.id);

    if (customError) {
      console.error("Error fetching custom strategies:", customError);
    }

    // Fetch active built-in strategies for this user
    const { data: builtInStrategies, error: builtInError } = await supabase
      .from("strategy_performance")
      .select("*")
      .eq("status", "active")
      .eq("user_id", user.id);

    if (builtInError) {
      console.error("Error fetching built-in strategies:", builtInError);
    }

    // Fetch active trading symbols for this user
    const { data: userSymbols, error: symbolsError } = await supabase
      .from("trading_symbols_config")
      .select("symbol")
      .eq("user_id", user.id)
      .eq("is_active", true);

    if (symbolsError) {
      console.error("Error fetching symbols:", symbolsError);
    }

    // Use user's active symbols, fallback to defaults if none
    const symbols = userSymbols && userSymbols.length > 0
      ? userSymbols.map(s => s.symbol)
      : ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"];

    console.log(`Using ${symbols.length} active symbols:`, symbols);

    // Define predefined logic for built-in strategies
    const builtInStrategyConfigs: Record<string, any> = {
      "Grid Trading": {
        id: "grid-trading-builtin",
        name: "Grid Trading",
        description: "Buy at support levels, sell at resistance with multiple grid orders",
        indicators: [
          { type: "RSI", name: "RSI", period: 14 },
          { type: "EMA", name: "EMA_20", period: 20 },
        ],
        entry_conditions: [
          { indicator: "RSI", operator: "below", value: "45", compareToIndicator: false },
          { indicator: "Price", operator: "below", value: "", compareToIndicator: true, targetIndicator: "EMA_20" },
        ],
        exit_conditions: [{ indicator: "RSI", operator: "above", value: "60", compareToIndicator: false }],
        risk_settings: {
          stopLossPercent: 2,
          takeProfitPercent: 3,
          positionSizePercent: 1.5,
        },
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      "Momentum Trading": {
        id: "momentum-trading-builtin",
        name: "Momentum Trading",
        description: "Ride strong momentum with RSI and MACD confirmation",
        indicators: [
          { type: "RSI", name: "RSI", period: 14 },
          { type: "MACD", name: "MACD", fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
        ],
        entry_conditions: [
          { indicator: "RSI", operator: "above", value: "55", compareToIndicator: false },
          { indicator: "MACD", operator: "above", value: "0", compareToIndicator: false },
        ],
        exit_conditions: [{ indicator: "RSI", operator: "below", value: "45", compareToIndicator: false }],
        risk_settings: {
          stopLossPercent: 2.5,
          takeProfitPercent: 5,
          positionSizePercent: 2,
        },
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      "Mean Reversion": {
        id: "mean-reversion-builtin",
        name: "Mean Reversion",
        description: "Buy oversold conditions, sell overbought",
        indicators: [{ type: "RSI", name: "RSI", period: 14 }],
        entry_conditions: [{ indicator: "RSI", operator: "below", value: "30", compareToIndicator: false }],
        exit_conditions: [{ indicator: "RSI", operator: "above", value: "70", compareToIndicator: false }],
        risk_settings: {
          stopLossPercent: 3,
          takeProfitPercent: 6,
          positionSizePercent: 2,
        },
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    };

    // Convert built-in strategies to custom strategy format
    const builtInAsCustom = (builtInStrategies || [])
      .filter((s) => builtInStrategyConfigs[s.strategy_name])
      .map((s) => builtInStrategyConfigs[s.strategy_name]);

    // Combine all strategies
    const strategies = [...(customStrategies || []), ...builtInAsCustom];

    console.log(
      `Found ${customStrategies?.length || 0} custom strategies and ${builtInAsCustom.length} built-in strategies (${strategies.length} total)`,
    );

    if (strategies.length === 0) {
      console.log("No active strategies found, skipping signal generation");
      return new Response(
        JSON.stringify({
          success: true,
          message: "No active strategies to analyze",
          signals: [],
          timestamp: new Date().toISOString(),
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    // Fetch current market data for active symbols
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
        // Fetch real Binance kline data with volume
        const { prices, highs, lows, volumes } = await fetchBinanceKlines(data.symbol, 100);

        const signal = await analyzeWithStrategy(data, strategy, prices, highs, lows, volumes, supabase, riskParams?.min_confidence_threshold || 60, user.id);

        // Apply multi-layer confirmation strategy
        if (signal) {
          // Get comprehensive trend analysis
          const trendResponse = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=' + data.symbol);
          const trendData = await trendResponse.json();
          
          // Fetch setup performance for historical win rate
          const setupPattern = `${strategy.name}_${signal.signalType === 'long' ? 'LONG' : 'SHORT'}`;
          const { data: setupPerf } = await supabase
            .from('setup_performance')
            .select('win_rate, total_trades')
            .eq('user_id', user.id)
            .eq('setup_pattern', setupPattern)
            .eq('symbol', data.symbol)
            .maybeSingle();
          
          // Multi-layer confirmation checks
          const trendConfirmed = signal.trend === 'bullish' || signal.trend === 'bearish';
          const volatilityNormal = signal.confidenceScore >= (riskParams?.min_confidence_threshold || 60);
          const setupWinRate = setupPerf?.win_rate || 0;
          const hasHistoricalData = (setupPerf?.total_trades || 0) >= 5;
          const historicalWinRateOk = !hasHistoricalData || setupWinRate >= 50;
          
          // CRITICAL: All confirmations must pass
          if (trendConfirmed && volatilityNormal && historicalWinRateOk) {
            console.log(`✓ Multi-layer pass: ${signal.symbol} ${strategy.name} (winRate: ${setupWinRate.toFixed(1)}%)`);
            allSignals.push({
              ...signal,
              strategyId: strategy.id,
              strategyName: strategy.name,
            });
          } else {
            console.log(`✗ Multi-layer fail: ${signal.symbol} trend=${trendConfirmed} vol=${volatilityNormal} hist=${historicalWinRateOk} (${setupWinRate.toFixed(1)}%)`);
          }
        }
      }
    }

    // Deduplicate signals: for same symbol+signalType+strategy, keep highest confidence
    const deduplicatedSignals = new Map();

    for (const signal of allSignals) {
      const key = `${signal.symbol}_${signal.signalType}_${signal.strategyName}`;
      const existing = deduplicatedSignals.get(key);

      if (!existing || signal.confidenceScore > existing.confidenceScore) {
        deduplicatedSignals.set(key, signal);
      }
    }

    const finalSignals = Array.from(deduplicatedSignals.values());
    console.log(`Deduplicated ${allSignals.length} signals to ${finalSignals.length} unique signals`);

    // Sort signals by confidence score (highest first) for priority execution
    finalSignals.sort((a, b) => b.confidenceScore - a.confidenceScore);

    // Limit signals to available slots
    const limitedSignals = finalSignals.slice(0, availableSlots);
    
    if (limitedSignals.length < finalSignals.length) {
      console.log(`Limited signals from ${finalSignals.length} to ${limitedSignals.length} based on available slots (${availableSlots})`);
    }

    // Insert limited signals and execute if auto-execute is enabled
    for (let i = 0; i < limitedSignals.length; i++) {
      const signal = limitedSignals[i];
      // Check if a similar signal already exists (within last 60 seconds)
      const { data: existingSignals } = await supabase
        .from("trading_signals")
        .select("id")
        .eq("symbol", signal.symbol)
        .eq("signal_type", signal.signalType)
        .eq("strategy_name", signal.strategyName)
        .eq("user_id", user.id)
        .gte("created_at", new Date(Date.now() - 60000).toISOString());

      if (existingSignals && existingSignals.length > 0) {
        console.log(`Skipping duplicate signal for ${signal.symbol} (${signal.strategyName})`);
        continue;
      }

      const { data: insertedSignal, error: insertError } = await supabase
        .from("trading_signals")
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
          strategy_id: signal.strategyId,
          strategy_name: signal.strategyName,
          user_id: user.id,
        })
        .select()
        .single();

      if (insertError) {
        console.error("Error inserting signal:", insertError);
      } else if (autoExecute && insertedSignal) {
        // Check if signal is already expired (older than 60 seconds)
        const signalAge = new Date().getTime() - new Date(insertedSignal.created_at).getTime();
        const isExpired = signalAge > 60000; // 60 seconds in milliseconds

        if (isExpired) {
          console.log(`Signal ${insertedSignal.id} expired (age: ${signalAge}ms), deleting without execution`);
          await supabase.from("trading_signals").delete().eq("id", insertedSignal.id);
        } else {
          // Automatically execute the signal
          try {
            console.log(`Auto-executing signal ${insertedSignal.id} for ${signal.symbol} (age: ${signalAge}ms)`);
            
            // Prepare headers for execute-trade
            const executeHeaders: Record<string, string> = {};
            if (authHeader) {
              executeHeaders.Authorization = authHeader;
            }
            if (serviceUserId) {
              executeHeaders["x-user-id"] = serviceUserId;
            }
            
            const { error: execError } = await supabase.functions.invoke("execute-trade", {
              body: { signalId: insertedSignal.id, action: "execute" },
              headers: executeHeaders,
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

    console.log(
      `Generated ${limitedSignals.length} signals total (${allSignals.length} before deduplication, ${finalSignals.length} after deduplication, limited to ${availableSlots} slots), executed ${executedSignals.length}`,
    );

    // Clean up expired signals (>60 seconds old) that are NOT referenced by trades
    try {
      // First, get IDs of signals that are referenced by trades
      const { data: referencedSignals } = await supabase
        .from("trades")
        .select("signal_id")
        .not("signal_id", "is", null);

      const referencedIds = referencedSignals?.map((t) => t.signal_id) || [];

      // Delete only expired signals (>60 seconds) that are NOT referenced
      const sixtySecondsAgo = new Date(Date.now() - 60000).toISOString();
      const { data: expiredSignals } = await supabase
        .from("trading_signals")
        .select("id, created_at")
        .lt("created_at", sixtySecondsAgo);

      if (expiredSignals && expiredSignals.length > 0) {
        const idsToDelete = expiredSignals.filter((s) => !referencedIds.includes(s.id)).map((s) => s.id);

        if (idsToDelete.length > 0) {
          const { error: deleteError } = await supabase.from("trading_signals").delete().in("id", idsToDelete);

          if (deleteError) {
            console.error("Error cleaning up expired signals:", deleteError);
          } else {
            console.log(`Cleaned up ${idsToDelete.length} expired signals (>60s old)`);
          }
        }
      }
    } catch (cleanupError) {
      console.error("Error during signal cleanup:", cleanupError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        signals: limitedSignals,
        totalSignalsGenerated: allSignals.length,
        signalsAfterDeduplication: finalSignals.length,
        signalsAfterLimiting: limitedSignals.length,
        availableSlots: availableSlots,
        executedSignals: executedSignals.length,
        autoExecuteEnabled: autoExecute,
        strategiesAnalyzed: strategies.length,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    console.error("Error in strategy-analyzer:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
