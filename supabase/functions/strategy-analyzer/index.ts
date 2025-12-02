import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.84.0";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
interface SignalData {
  id?: string;
  user_id: string;
  symbol: string;
  signal_type: "long" | "short";
  trend: string;
  confidence_score: number;
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  strategy_id?: string;
  strategy_name: string;
  reason: string;
  indicators: any;
  expires_at: string;
  created_by_rebalancer: boolean;
  positionSizePercent?: number;
}

// Calculate adaptive thresholds based on market volatility
const calculateAdaptiveThresholds = (atrPercent: number, adx: number) => {
  // Higher volatility = more forgiving thresholds (trends are stronger)
  // Lower volatility = stricter thresholds (need more confirmation)
  const volatilityFactor = Math.min(1.5, Math.max(0.7, atrPercent / 1.5)); // Normalize around 1.5% ATR
  
  return {
    minConfidence: Math.max(40, Math.round(50 / volatilityFactor)), // Lower in high volatility
    minConsistency: Math.max(35, Math.round(45 / volatilityFactor)),
    adxThresholdStrong: Math.round(20 / volatilityFactor),
    adxThresholdModerate: Math.round(15 / volatilityFactor),
    adxThresholdWeak: Math.round(12 / volatilityFactor),
  };
};

// Evaluate StochRSI signals for entry timing
const evaluateStochRSI = (stochRsi: any, trend: string): { boost: number; signal: string } => {
  if (!stochRsi) return { boost: 0, signal: "none" };
  
  const { aggregated } = stochRsi;
  if (!aggregated) return { boost: 0, signal: "none" };
  
  // For bullish trend, look for oversold conditions or bullish crosses
  if (trend === "bullish") {
    if (aggregated.oversoldCount >= 2) {
      return { boost: 0.15, signal: "strong_oversold" }; // Great entry
    }
    if (aggregated.bullishCrossCount >= 1) {
      return { boost: 0.1, signal: "bullish_cross" }; // Good entry timing
    }
    if (aggregated.overboughtCount >= 2) {
      return { boost: -0.1, signal: "overbought_warning" }; // Potential top
    }
  }
  
  // For bearish trend, look for overbought conditions or bearish crosses
  if (trend === "bearish") {
    if (aggregated.overboughtCount >= 2) {
      return { boost: 0.15, signal: "strong_overbought" }; // Great short entry
    }
    if (aggregated.bearishCrossCount >= 1) {
      return { boost: 0.1, signal: "bearish_cross" }; // Good entry timing
    }
    if (aggregated.oversoldCount >= 2) {
      return { boost: -0.1, signal: "oversold_warning" }; // Potential bottom
    }
  }
  
  return { boost: 0, signal: "neutral" };
};

// Evaluate Bollinger Bands for entry opportunities
const evaluateBollingerBands = (bollingerBands: any, trend: string): { boost: number; signal: string } => {
  if (!bollingerBands) return { boost: 0, signal: "none" };
  
  const { squeezed, breakoutPotential } = bollingerBands;
  
  // Squeeze with breakout potential = high opportunity
  if (squeezed && breakoutPotential) {
    return { boost: 0.2, signal: "squeeze_breakout" };
  }
  
  // Just squeeze = building energy
  if (squeezed) {
    return { boost: 0.1, signal: "squeeze" };
  }
  
  // Check price position relative to bands for each timeframe
  const tf1h = bollingerBands["1h"];
  if (tf1h) {
    // For bullish, price near lower band is good entry
    if (trend === "bullish" && tf1h.pricePosition === "lower_zone") {
      return { boost: 0.1, signal: "near_lower_band" };
    }
    // For bearish, price near upper band is good short entry
    if (trend === "bearish" && tf1h.pricePosition === "upper_zone") {
      return { boost: 0.1, signal: "near_upper_band" };
    }
  }
  
  return { boost: 0, signal: "neutral" };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing required environment variables");
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    // Get user from auth header or request body (for auto-trader service role calls)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }
    
    let userId: string;
    const token = authHeader.replace("Bearer ", "");
    
    // Check if this is a service role call with user_id in body
    let requestBody: any = {};
    try {
      requestBody = await req.json();
    } catch {
      // No body or invalid JSON - that's ok for direct user calls
    }
    
    if (requestBody?.user_id && token === supabaseServiceKey) {
      // Service role call from auto-trader with explicit user_id
      userId = requestBody.user_id;
      console.log(`Service role call for user ${userId}`);
    } else {
      // Regular user auth call
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser(token);
      if (userError || !user) {
        throw new Error("Unauthorized");
      }
      userId = user.id;
    }
    
    console.log(`Analyzing signals for user ${userId}`);
    // Fetch user's risk parameters including divergence settings
    const { data: riskParams, error: riskError } = await supabase
      .from("risk_parameters")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (riskError) {
      console.error("Error fetching risk parameters:", riskError);
      throw new Error("Failed to fetch risk parameters");
    }
    if (!riskParams) {
      return new Response(JSON.stringify({ message: "Risk parameters not configured", signals: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Check if trading is enabled
    if (!riskParams.is_trading_enabled) {
      return new Response(JSON.stringify({ message: "Trading is disabled", signals: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Fetch user's active trading symbols
    const { data: symbols, error: symbolsError } = await supabase
      .from("trading_symbols_config")
      .select("symbol")
      .eq("user_id", userId)
      .eq("is_active", true);
    if (symbolsError || !symbols || symbols.length === 0) {
      return new Response(JSON.stringify({ message: "No active symbols configured", signals: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.log(`Analyzing ${symbols.length} symbols`);
    // Fetch active custom strategies (REQUIRED for signal generation)
    const { data: customStrategies, error: strategiesError } = await supabase
      .from("custom_strategies")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true);
    if (strategiesError) {
      console.error("Failed to fetch custom strategies:", strategiesError);
    }
    if (!customStrategies || customStrategies.length === 0) {
      return new Response(
        JSON.stringify({
          message:
            "No active custom strategies configured. Multi-Timeframe Analysis is used as a prerequisite only - signals are generated for custom strategies.",
          signals: [],
          totalSignalsGenerated: 0,
          rejectedByMultiTimeframeAnalysis: 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    console.log(`Found ${customStrategies.length} active custom strategies`);
    // Calculate timestamp for 1 minute ago to match UI filter
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
    // Fetch recent signals (last 1 minute) to avoid generating duplicate signals
    const { data: existingSignals } = await supabase
      .from("trading_signals")
      .select("symbol")
      .eq("user_id", userId)
      .gte("created_at", oneMinuteAgo);
    const existingSignalsSet = new Set(existingSignals?.map((s) => s.symbol) || []);
    // Fetch active positions and count per symbol to respect max_trades_per_symbol
    const { data: activePositions } = await supabase
      .from("positions")
      .select("symbol")
      .eq("user_id", userId)
      .eq("status", "active");
    // Count active positions per symbol
    const openTradesPerSymbol = new Map<string, number>();
    activePositions?.forEach((position) => {
      const count = openTradesPerSymbol.get(position.symbol) || 0;
      openTradesPerSymbol.set(position.symbol, count + 1);
    });
    const signals: SignalData[] = [];
    let totalSignalsGenerated = 0;
    let rejectedByMultiTimeframeAnalysis = 0;
    // Helper functions for custom strategy evaluation
    const calculateRSI = (prices: number[], period = 14): number => {
      if (prices.length < period + 1) return 50;
      let gains = 0,
        losses = 0;
      for (let i = 1; i <= period; i++) {
        const change = prices[i] - prices[i - 1];
        if (change > 0) gains += change;
        else losses += Math.abs(change);
      }
      let avgGain = gains / period;
      let avgLoss = losses / period;
      for (let i = period + 1; i < prices.length; i++) {
        const change = prices[i] - prices[i - 1];
        const gain = change > 0 ? change : 0;
        const loss = Math.abs(change < 0 ? change : 0);
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
      }
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      return 100 - 100 / (1 + rs);
    };
    const calculateEMA = (prices: number[], period: number): number => {
      if (prices.length < period) return prices[prices.length - 1] || 0;
      const multiplier = 2 / (period + 1);
      let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
      for (let i = period; i < prices.length; i++) {
        ema = (prices[i] - ema) * multiplier + ema;
      }
      return ema;
    };
    const calculateEMAArray = (prices: number[], period: number): number[] => {
      const emaArray: number[] = [];
      if (prices.length < period) return emaArray;
      const multiplier = 2 / (period + 1);
      let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
      for (let i = 0; i < period - 1; i++) {
        emaArray.push(0);
      }
      emaArray.push(ema);
      for (let i = period; i < prices.length; i++) {
        ema = (prices[i] - ema) * multiplier + ema;
        emaArray.push(ema);
      }
      return emaArray;
    };
    const calculateMACD = (prices: number[]): { macd: number; signal: number; histogram: number } => {
      if (prices.length < 26) {
        return { macd: 0, signal: 0, histogram: 0 };
      }
      const ema12Array = calculateEMAArray(prices, 12);
      const ema26Array = calculateEMAArray(prices, 26);
      if (ema12Array.length === 0 || ema26Array.length === 0) {
        return { macd: 0, signal: 0, histogram: 0 };
      }
      const ema12 = ema12Array[ema12Array.length - 1] || 0;
      const ema26 = ema26Array[ema26Array.length - 1] || 0;
      const macd = ema12 - ema26;
      const macdValues: number[] = [];
      // Safe index calculation - ensure we don't go negative
      const minLength = Math.min(ema12Array.length, ema26Array.length);
      const startIndex = Math.max(0, minLength - Math.min(prices.length - 26, minLength));
      for (let i = startIndex; i < minLength; i++) {
        const ema12Val = ema12Array[i] || 0;
        const ema26Val = ema26Array[i] || 0;
        macdValues.push(ema12Val - ema26Val);
      }
      const signal = macdValues.length >= 9 ? calculateEMA(macdValues, 9) : macd * 0.9;
      const histogram = macd - signal;
      return { macd, signal, histogram };
    };
    const calculateBollingerBands = (prices: number[], period = 20, stdDev = 2) => {
      if (prices.length < period) {
        const currentPrice = prices[prices.length - 1] || 0;
        return { upper: currentPrice, middle: currentPrice, lower: currentPrice };
      }
      const recentPrices = prices.slice(-period);
      const middle = recentPrices.reduce((a, b) => a + b, 0) / period;
      const variance = recentPrices.reduce((sum, price) => sum + Math.pow(price - middle, 2), 0) / period;
      const standardDeviation = Math.sqrt(variance);
      return {
        upper: middle + standardDeviation * stdDev,
        middle,
        lower: middle - standardDeviation * stdDev,
      };
    };
    const calculateIndicator = (
      indicatorConfig: any,
      currentPrice: number,
      currentVolume: number,
      historicalPrices: number[],
      historicalVolumes: number[],
    ): number => {
      switch (indicatorConfig.type) {
        case "RSI":
          return calculateRSI(historicalPrices, indicatorConfig.period || 14);
        case "EMA":
          return calculateEMA(historicalPrices, indicatorConfig.period || 20);
        case "MACD":
          return calculateMACD(historicalPrices).macd;
        case "MACD_Signal":
          return calculateMACD(historicalPrices).signal;
        case "BB_Upper":
          return calculateBollingerBands(historicalPrices, indicatorConfig.period || 20).upper;
        case "BB_Middle":
          return calculateBollingerBands(historicalPrices, indicatorConfig.period || 20).middle;
        case "BB_Lower":
          return calculateBollingerBands(historicalPrices, indicatorConfig.period || 20).lower;
        case "Volume":
          return currentVolume;
        case "Price":
          return currentPrice;
        default:
          return 0;
      }
    };
    const evaluateCondition = (condition: any, indicatorValues: Map<string, number>, previousIndicatorValues: Map<string, number>): boolean => {
      const indicatorValue = indicatorValues.get(condition.indicator) || 0;
      const previousIndicatorValue = previousIndicatorValues.get(condition.indicator) || 0;
      const targetValue =
        condition.compareToIndicator && condition.targetIndicator
          ? indicatorValues.get(condition.targetIndicator) || 0
          : parseFloat(condition.value || "0");
      const previousTargetValue =
        condition.compareToIndicator && condition.targetIndicator
          ? previousIndicatorValues.get(condition.targetIndicator) || 0
          : parseFloat(condition.value || "0");
      switch (condition.operator.toLowerCase()) {
        case "above":
          return indicatorValue > targetValue;
        case "crosses_above":
          return previousIndicatorValue <= previousTargetValue && indicatorValue > targetValue;
        case "below":
          return indicatorValue < targetValue;
        case "crosses_below":
          return previousIndicatorValue >= previousTargetValue && indicatorValue < targetValue;
        default:
          return false;
      }
    };
    const fetchHistoricalKlines = async (symbol: string): Promise<{ prices: number[]; volumes: number[] }> => {
      try {
        // Fetch 50 candles of 15m data for indicator calculations (MACD needs ~26+ periods)
        const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=15m&limit=50`);
        if (!response.ok) {
          throw new Error(`Binance API error: ${response.status}`);
        }
        const klines = await response.json();
        // Binance kline format: [openTime, open, high, low, close, volume, closeTime, ...]
        const prices = klines.map((k: any) => parseFloat(k[4])).filter(Number.isFinite); // close price
        const volumes = klines.map((k: any) => parseFloat(k[5])).filter(Number.isFinite); // volume
        return { prices, volumes };
      } catch (error) {
        console.error(`Failed to fetch klines for ${symbol}:`, error);
        // Return empty arrays as fallback - strategy evaluation will skip if insufficient data
        return { prices: [], volumes: [] };
      }
    };
    // Fetch market data for all active symbols
    const symbolsList = symbols.map((s) => s.symbol);
    const marketDataPromises = symbolsList.map(async (symbol) => {
      try {
        const response = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);
        return await response.json();
      } catch (error) {
        console.error(`Failed to fetch market data for ${symbol}:`, error);
        return null;
      }
    });
    const marketDataResults = await Promise.all(marketDataPromises);
    const marketDataMap = new Map(marketDataResults.filter((data) => data != null).map((data) => [data.symbol, data]));
    
    // Pre-fetch historical klines for ALL symbols in PARALLEL (performance optimization)
    const historicalDataMap = new Map<string, { prices: number[]; volumes: number[] }>();
    const historicalPromises = symbolsList.map(async (symbol) => {
      const data = await fetchHistoricalKlines(symbol);
      return { symbol, data };
    });
    const historicalResults = await Promise.all(historicalPromises);
    historicalResults.forEach(({ symbol, data }) => {
      historicalDataMap.set(symbol, data);
    });
    console.log(`Pre-fetched historical data for ${historicalDataMap.size} symbols`);
    
    // =====================================================================
    // IMPROVEMENT #1: PARALLEL calculate-trend calls for ALL symbols
    // =====================================================================
    const trendDataMap = new Map<string, any>();
    const eligibleSymbols = symbolsList.filter((symbol) => {
      const currentTradeCount = openTradesPerSymbol.get(symbol) || 0;
      const hasRecentSignal = existingSignalsSet.has(symbol);
      return !hasRecentSignal && currentTradeCount < riskParams.max_trades_per_symbol;
    });
    
    console.log(`🚀 Fetching trend data for ${eligibleSymbols.length} eligible symbols in PARALLEL`);
    
    const trendPromises = eligibleSymbols.map(async (symbol) => {
      try {
        const { data: trendData, error: trendError } = await supabase.functions.invoke("calculate-trend", {
          body: { symbol },
        });
        if (trendError || !trendData) {
          console.warn(`Failed to analyze ${symbol}:`, trendError);
          return { symbol, trendData: null };
        }
        return { symbol, trendData };
      } catch (error) {
        console.error(`Error fetching trend for ${symbol}:`, error);
        return { symbol, trendData: null };
      }
    });
    
    const trendResults = await Promise.all(trendPromises);
    trendResults.forEach(({ symbol, trendData }) => {
      if (trendData) {
        trendDataMap.set(symbol, trendData);
      }
    });
    console.log(`✅ Fetched trend data for ${trendDataMap.size} symbols`);
    
    // Analyze each symbol (now using pre-fetched trend data)
    for (const { symbol } of symbols) {
      const currentTradeCount = openTradesPerSymbol.get(symbol) || 0;
      const hasRecentSignal = existingSignalsSet.has(symbol);
      // Skip if already has a recent signal (prevents duplicate signals)
      if (hasRecentSignal) {
        const statusMsg =
          currentTradeCount > 0
            ? `${currentTradeCount}/${riskParams.max_trades_per_symbol} trades active, but has recent signal`
            : "has recent signal (no open trades)";
        console.log(`⏭️ Skipping ${symbol} - ${statusMsg}`);
        await supabase.from("signal_rejection_log").insert({
          user_id: userId,
          symbol,
          rejection_reason: `Already has active signal from last minute (${statusMsg})`,
          filters_status: { currentTradeCount, maxTradesPerSymbol: riskParams.max_trades_per_symbol },
          trend_data: null,
          checked_at: new Date().toISOString(),
        });
        continue;
      }
      // Check if symbol has reached max trades per symbol limit
      if (currentTradeCount >= riskParams.max_trades_per_symbol) {
        console.log(
          `⏭️ Skipping ${symbol} - max trades limit reached (${currentTradeCount}/${riskParams.max_trades_per_symbol} trades active)`,
        );
        await supabase.from("signal_rejection_log").insert({
          user_id: userId,
          symbol,
          rejection_reason: `Max trades per symbol reached: ${currentTradeCount}/${riskParams.max_trades_per_symbol} trades active`,
          filters_status: { currentTradeCount, maxTradesPerSymbol: riskParams.max_trades_per_symbol },
          trend_data: null,
          checked_at: new Date().toISOString(),
        });
        continue;
      }
      // Log symbol evaluation start with current state
      console.log(
        `🔍 Evaluating ${symbol} (${currentTradeCount}/${riskParams.max_trades_per_symbol} trades active, no recent signals)`,
      );
      try {
        // ============= STEP 1: Multi-Timeframe Analysis Validation =============
        // Use pre-fetched trend data (PARALLEL optimization)
        const trendData = trendDataMap.get(symbol);
        if (!trendData) {
          console.warn(`No trend data available for ${symbol}`);
          continue;
        }
        const { trend, confidence, trendConsistency, higherTimeframeFilter } = trendData;

        // =====================================================================
        // IMPROVEMENT #2: ADAPTIVE THRESHOLDS based on market volatility
        // =====================================================================
        const atrPercent = trendData.volatility?.atrPercent || 1.5;
        const adx = trendData.volatility?.adx || 0;
        const adaptiveThresholds = calculateAdaptiveThresholds(atrPercent, adx);
        
        // Use adaptive or configured thresholds (whichever is more permissive)
        const effectiveMinConfidence = Math.min(
          riskParams.min_confidence_threshold,
          adaptiveThresholds.minConfidence
        );
        const effectiveMinConsistency = Math.min(
          riskParams.min_trend_consistency,
          adaptiveThresholds.minConsistency
        );

        // =====================================================================
        // IMPROVEMENT #3: StochRSI + Bollinger Bands evaluation
        // =====================================================================
        const stochRsiEval = evaluateStochRSI(trendData.stochasticRsi, trend);
        const bollingerEval = evaluateBollingerBands(trendData.bollingerBands, trend);
        const technicalBoost = stochRsiEval.boost + bollingerEval.boost;
        
        // Log technical indicator signals
        if (stochRsiEval.signal !== "neutral" && stochRsiEval.signal !== "none") {
          console.log(`📊 ${symbol} StochRSI: ${stochRsiEval.signal} (boost: ${(stochRsiEval.boost * 100).toFixed(0)}%)`);
        }
        if (bollingerEval.signal !== "neutral" && bollingerEval.signal !== "none") {
          console.log(`📊 ${symbol} Bollinger: ${bollingerEval.signal} (boost: ${(bollingerEval.boost * 100).toFixed(0)}%)`);
        }

        // TIERED ADX FILTERING with ADAPTIVE thresholds
        let adxTier: "strong" | "moderate" | "weak" | "reject" = "reject";
        let adxPositionMultiplier = 1.0;

        if (adx >= adaptiveThresholds.adxThresholdStrong) {
          adxTier = "strong"; // Full confidence in trend strength
          adxPositionMultiplier = 1.0;
        } else if (adx >= adaptiveThresholds.adxThresholdModerate) {
          adxTier = "moderate"; // Building trend, reduce position size
          adxPositionMultiplier = 0.75;
        } else if (adx >= adaptiveThresholds.adxThresholdWeak && confidence >= 65) {
          adxTier = "weak"; // Early trend, good confidence - minimal size
          adxPositionMultiplier = 0.5;
        } else if (adx >= 10 && technicalBoost >= 0.2) {
          // NEW: Allow weak ADX if strong technical signals (StochRSI + Bollinger)
          adxTier = "weak";
          adxPositionMultiplier = 0.4;
          console.log(`📈 ${symbol} ADX weak but strong technical signals - allowing with reduced size`);
        } else {
          // Only reject if ADX too low AND no strong technical signals
          rejectedByMultiTimeframeAnalysis++;
          await supabase.from("signal_rejection_log").insert({
            user_id: userId,
            symbol,
            rejection_reason: `Multi-Timeframe prerequisite failed: ADX too weak (${adx.toFixed(1)}) with insufficient technical confirmation`,
            filters_status: {
              adx,
              confidence,
              adaptiveThresholds,
              stochRsiSignal: stochRsiEval.signal,
              bollingerSignal: bollingerEval.signal,
              technicalBoost,
              required: `ADX ≥ ${adaptiveThresholds.adxThresholdWeak} with confidence ≥65%, or strong technical signals`,
              trendConsistency,
            },
            trend_data: trendData,
            checked_at: new Date().toISOString(),
          });
          continue;
        }

        // Validate Multi-Timeframe conditions with TIERED FILTERING
        let multiTimeframePass = false;
        let positionSizeMultiplier = 1.0;
        let confidenceCap = 100;
        let multiTimeframeReason = "";

        if (higherTimeframeFilter.aligned) {
          const meetsThreshold =
            confidence >= effectiveMinConfidence && trendConsistency >= effectiveMinConsistency;
          const hasMomentumConfirmation = trendData.momentum?.confirms || false;
          const momentumState = trendData.momentum?.state || "none";
          const volumeConfirms = trendData.momentum?.volumeConfirms || false;

          // TIERED MOMENTUM FILTERING: Accept confirmed OR building momentum based on other conditions
          const confirmedMomentum = hasMomentumConfirmation && momentumState === "confirmed";
          const buildingMomentum = momentumState === "building";
          const mixedMomentum = momentumState === "mixed";

          // Volume boost: 10% additional position size when volume confirms direction
          const volumeBoostMultiplier = volumeConfirms ? 1.1 : 1.0;
          
          // Apply technical indicator boost to position size (max +30%)
          const technicalBoostMultiplier = 1 + Math.min(0.3, Math.max(0, technicalBoost));

          // Tier 1: Perfect conditions - full position size
          if (meetsThreshold && confirmedMomentum) {
            multiTimeframePass = true;
            positionSizeMultiplier = 1.0 * adxPositionMultiplier * volumeBoostMultiplier * technicalBoostMultiplier;
            const neutralAllowed = higherTimeframeFilter.neutralAllowedWithStrongHigherTimeframe || false;
            const volumeNote = volumeConfirms ? " + volume" : "";
            const techNote = technicalBoost > 0 ? ` + tech(${stochRsiEval.signal}/${bollingerEval.signal})` : "";
            multiTimeframeReason = neutralAllowed
              ? `Tier 1 (${(positionSizeMultiplier * 100).toFixed(0)}%): Enhanced alignment + confirmed momentum${volumeNote}${techNote}`
              : `Tier 1 (${(positionSizeMultiplier * 100).toFixed(0)}%): Aligned + confirmed momentum${volumeNote}${techNote}`;
          }
          // Tier 2a: Building momentum with strong ADX (≥25) - early entry opportunity
          else if (meetsThreshold && buildingMomentum && adx >= 25 && confidence >= 55) {
            multiTimeframePass = true;
            positionSizeMultiplier = 0.75 * adxPositionMultiplier * volumeBoostMultiplier * technicalBoostMultiplier;
            const volumeNote = volumeConfirms ? " + volume" : "";
            const techNote = technicalBoost > 0 ? ` + tech signals` : "";
            multiTimeframeReason = `Tier 2a (${(positionSizeMultiplier * 100).toFixed(0)}%): Building momentum + strong trend (ADX ${adx.toFixed(1)})${volumeNote}${techNote}`;
          }
          // Tier 2b: Building momentum with strong alignment - reduced position size
          else if (meetsThreshold && buildingMomentum && confidence >= 60) {
            multiTimeframePass = true;
            positionSizeMultiplier = 0.7 * adxPositionMultiplier * volumeBoostMultiplier * technicalBoostMultiplier;
            const volumeNote = volumeConfirms ? " + volume" : "";
            const techNote = technicalBoost > 0 ? ` + tech signals` : "";
            multiTimeframeReason = `Tier 2b (${(positionSizeMultiplier * 100).toFixed(0)}%): Building momentum + strong alignment${volumeNote}${techNote}`;
          }
          // NEW Tier 2c: Strong technical signals with building/mixed momentum
          else if (meetsThreshold && (buildingMomentum || mixedMomentum) && technicalBoost >= 0.15) {
            multiTimeframePass = true;
            positionSizeMultiplier = 0.6 * adxPositionMultiplier * volumeBoostMultiplier * technicalBoostMultiplier;
            multiTimeframeReason = `Tier 2c (${(positionSizeMultiplier * 100).toFixed(0)}%): Strong tech signals (${stochRsiEval.signal}/${bollingerEval.signal}) + ${momentumState} momentum`;
          }
          // Tier 3: Mixed momentum but very strong confidence - minimal position size
          else if (meetsThreshold && mixedMomentum && confidence >= 65 && adx >= 16) {
            multiTimeframePass = true;
            positionSizeMultiplier = 0.5 * adxPositionMultiplier * volumeBoostMultiplier * technicalBoostMultiplier;
            const volumeNote = volumeConfirms ? " + volume" : "";
            multiTimeframeReason = `Tier 3 (${(positionSizeMultiplier * 100).toFixed(0)}%): Mixed momentum + strong confidence${volumeNote}`;
          }
          // Tier 4: Exceptional ADX - very strong trend strength compensates for no momentum
          else if (meetsThreshold && adx >= 35 && confidence >= 60) {
            multiTimeframePass = true;
            positionSizeMultiplier = 0.5 * volumeBoostMultiplier * technicalBoostMultiplier;
            const volumeNote = volumeConfirms ? " + volume" : "";
            multiTimeframeReason = `Tier 4 (${(positionSizeMultiplier * 100).toFixed(0)}%): Exceptional trend strength (ADX ${adx.toFixed(1)})${volumeNote}`;
          }
          // Tier 5: No momentum but exceptional alignment - very minimal size
          else if (meetsThreshold && confidence >= 70 && trendConsistency >= 65 && adx >= 18) {
            multiTimeframePass = true;
            positionSizeMultiplier = 0.4 * volumeBoostMultiplier * technicalBoostMultiplier;
            const volumeNote = volumeConfirms ? " + volume" : "";
            multiTimeframeReason = `Tier 5 (${(positionSizeMultiplier * 100).toFixed(0)}%): Exceptional alignment, weak momentum${volumeNote}`;
          }
          // NEW Tier 6: Squeeze breakout opportunity - even with weak momentum
          else if (meetsThreshold && bollingerEval.signal === "squeeze_breakout" && adx >= 15) {
            multiTimeframePass = true;
            positionSizeMultiplier = 0.5 * adxPositionMultiplier;
            multiTimeframeReason = `Tier 6 (${(positionSizeMultiplier * 100).toFixed(0)}%): Bollinger squeeze breakout opportunity`;
          }
          // NEW Tier 7: StochRSI extreme with decent alignment
          else if (meetsThreshold && (stochRsiEval.signal === "strong_oversold" || stochRsiEval.signal === "strong_overbought")) {
            multiTimeframePass = true;
            positionSizeMultiplier = 0.45 * adxPositionMultiplier;
            multiTimeframeReason = `Tier 7 (${(positionSizeMultiplier * 100).toFixed(0)}%): StochRSI extreme (${stochRsiEval.signal})`;
          }
          // Reject only if none of the tiers pass
          else {
            rejectedByMultiTimeframeAnalysis++;
            const rejectionData = {
              confidence,
              trendConsistency,
              meetsThreshold,
              momentum: trendData.momentum,
              momentumState,
              adx,
              adxTier,
              adaptiveThresholds,
              stochRsiSignal: stochRsiEval.signal,
              bollingerSignal: bollingerEval.signal,
              technicalBoost,
              trend4h: trendData.timeframes?.["4h"]?.trend,
              trend1h: trendData.timeframes?.["1h"]?.trend,
              aligned: higherTimeframeFilter.aligned,
              required: !meetsThreshold
                ? `confidence ≥${effectiveMinConfidence}% / consistency ≥${effectiveMinConsistency}%`
                : `stronger momentum/technical conditions needed`,
            };
            await supabase.from("signal_rejection_log").insert({
              user_id: userId,
              symbol,
              rejection_reason: !meetsThreshold
                ? `Multi-Timeframe prerequisite failed: confidence (${confidence}%) or consistency (${trendConsistency}%) below adaptive threshold`
                : `Multi-Timeframe prerequisite failed: insufficient signal quality (momentum: ${momentumState}, tech boost: ${(technicalBoost * 100).toFixed(0)}%)`,
              filters_status: rejectionData,
              trend_data: trendData,
              checked_at: new Date().toISOString(),
            });
            continue;
          }
        } else if (higherTimeframeFilter.allowDivergenceSignal) {
          const { divergenceType } = higherTimeframeFilter;
          const momentumState = trendData.momentum?.state || "none";
          const hasMomentumConfirmation = trendData.momentum?.confirms || false;
          if (divergenceType === "pullback" && riskParams.enable_pullback_signals) {
            const tf30m = trendData.timeframes?.["30m"];
            const tf15m = trendData.timeframes?.["15m"];
            const tf4h = trendData.timeframes?.["4h"];
            const trendAligned = tf30m && tf15m && tf4h && tf30m.trend === tf4h.trend && tf15m.trend === tf4h.trend;
            // RELAXED: Accept pullback with confirmed, building OR mixed momentum + technical signals
            const momentumOk = hasMomentumConfirmation || momentumState === "building" || (momentumState === "mixed" && technicalBoost >= 0.1);
            if (trendAligned && momentumOk) {
              multiTimeframePass = true;
              const baseSize = (riskParams.pullback_position_size_percent || 50) / 100;
              const momentumReduction = hasMomentumConfirmation ? 1.0 : momentumState === "building" ? 0.85 : 0.7;
              positionSizeMultiplier = baseSize * momentumReduction * (1 + Math.min(0.15, technicalBoost));
              confidenceCap = 70;
              multiTimeframeReason = `Pullback opportunity (${momentumState} momentum, tech: ${stochRsiEval.signal})`;
            }
          } else if (divergenceType === "early_reversal" && riskParams.enable_early_reversal_signals) {
            const tf30m = trendData.timeframes?.["30m"];
            const tf15m = trendData.timeframes?.["15m"];
            const tf1h = trendData.timeframes?.["1h"];
            const trendAligned = tf30m && tf15m && tf1h && tf30m.trend === tf1h.trend && tf15m.trend === tf1h.trend;
            // RELAXED: Accept early reversal with confirmed, building OR mixed momentum + technical signals
            const momentumOk = hasMomentumConfirmation || momentumState === "building" || (momentumState === "mixed" && technicalBoost >= 0.1);
            if (trendAligned && momentumOk) {
              multiTimeframePass = true;
              const baseSize = (riskParams.early_reversal_position_size_percent || 40) / 100;
              const momentumReduction = hasMomentumConfirmation ? 1.0 : momentumState === "building" ? 0.85 : 0.7;
              positionSizeMultiplier = baseSize * momentumReduction * (1 + Math.min(0.15, technicalBoost));
              confidenceCap = 65;
              multiTimeframeReason = `Early reversal (${momentumState} momentum, tech: ${stochRsiEval.signal})`;
            }
          }
          if (!multiTimeframePass) {
            rejectedByMultiTimeframeAnalysis++;
            // Detailed divergence rejection data - use correct structure
            const rejectionData = {
              divergenceType,
              aligned: false,
              divergenceAllowed: true,
              pullbackEnabled: riskParams.enable_pullback_signals,
              earlyReversalEnabled: riskParams.enable_early_reversal_signals,
              momentum: trendData.momentum,
              stochRsiSignal: stochRsiEval.signal,
              bollingerSignal: bollingerEval.signal,
              technicalBoost,
              consecutive15mBullish: trendData.momentum?.consecutive15mBullish || 0,
              consecutive15mBearish: trendData.momentum?.consecutive15mBearish || 0,
              consecutive30mBullish: trendData.momentum?.consecutive30mBullish || 0,
              consecutive30mBearish: trendData.momentum?.consecutive30mBearish || 0,
              trend4h: trendData.timeframes?.["4h"]?.trend,
              trend1h: trendData.timeframes?.["1h"]?.trend,
              trend30m: trendData.timeframes?.["30m"]?.trend,
              trend15m: trendData.timeframes?.["15m"]?.trend,
            };
            await supabase.from("signal_rejection_log").insert({
              user_id: userId,
              symbol,
              rejection_reason:
                "Multi-Timeframe prerequisite failed: divergence conditions not met or insufficient momentum/technical confirmation",
              filters_status: rejectionData,
              trend_data: trendData,
              checked_at: new Date().toISOString(),
            });
            continue;
          }
        } else {
          rejectedByMultiTimeframeAnalysis++;
          // Detailed rejection data showing why timeframes aren't aligned and no divergence
          const rejectionData = {
            aligned: false,
            divergenceAllowed: false,
            confidence,
            trendConsistency,
            momentum: trendData.momentum,
            stochRsiSignal: stochRsiEval.signal,
            bollingerSignal: bollingerEval.signal,
            technicalBoost,
            consecutive15mBullish: trendData.momentum?.consecutive15mBullish || 0,
            consecutive15mBearish: trendData.momentum?.consecutive15mBearish || 0,
            consecutive30mBullish: trendData.momentum?.consecutive30mBullish || 0,
            consecutive30mBearish: trendData.momentum?.consecutive30mBearish || 0,
            trend4h: trendData.timeframes?.["4h"]?.trend,
            trend1h: trendData.timeframes?.["1h"]?.trend,
            trend30m: trendData.timeframes?.["30m"]?.trend,
            trend15m: trendData.timeframes?.["15m"]?.trend,
            isRanging: trendData.ranging?.isRanging || false,
            required: "higher timeframes NOT aligned or ranging market detected",
          };
          await supabase.from("signal_rejection_log").insert({
            user_id: userId,
            symbol,
            rejection_reason: "Multi-Timeframe prerequisite failed: timeframes not aligned, no divergence opportunity",
            filters_status: rejectionData,
            trend_data: trendData,
            checked_at: new Date().toISOString(),
          });
          continue;
        }
        // Determine signal type using tradeDirection from calculate-trend (considers divergence signals)
        const tradeDirection = higherTimeframeFilter.tradeDirection || trend;
        const signalType = tradeDirection === "bullish" ? "long" : tradeDirection === "bearish" ? "short" : null;
        if (!signalType) {
          await supabase.from("signal_rejection_log").insert({
            user_id: userId,
            symbol,
            rejection_reason: "Multi-Timeframe prerequisite failed: ranging market",
            filters_status: { trend },
            trend_data: trendData,
            checked_at: new Date().toISOString(),
          });
          continue;
        }
        // ============= STEP 2: Custom Strategy Evaluation =============
        // Now evaluate custom strategies since Multi-Timeframe prerequisite passed
        const marketData = marketDataMap.get(symbol);
        if (!marketData) continue;
        const currentPrice = parseFloat(marketData.lastPrice);
        const currentVolume = parseFloat(marketData.volume);
        
        // Validate price and volume are valid numbers
        if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
          console.warn(`Invalid price for ${symbol}: ${marketData.lastPrice}`);
          continue;
        }
        if (!Number.isFinite(currentVolume)) {
          console.warn(`Invalid volume for ${symbol}, using 0`);
        }
        const safeCurrentVolume = Number.isFinite(currentVolume) ? currentVolume : 0;
        
        // Use pre-fetched historical data (parallelized earlier)
        const historicalData = historicalDataMap.get(symbol);
        if (!historicalData) continue;
        const { prices: historicalPrices, volumes: historicalVolumes } = historicalData;
        
        // Skip if insufficient historical data
        if (historicalPrices.length < 26) {
          console.warn(`Insufficient historical data for ${symbol} (${historicalPrices.length} candles)`);
          continue;
        }
        // Evaluate each custom strategy
        for (const strategy of customStrategies) {
          // Skip if this strategy already has a signal for this symbol
          if (signals.some((s) => s.symbol === symbol && s.strategy_id === strategy.id)) {
            continue;
          }
          
          // Validate strategy has required fields
          const indicators = strategy.indicators || [];
          const entryConditions = strategy.entry_conditions || [];
          
          if (indicators.length === 0 || entryConditions.length === 0) {
            console.warn(`Strategy "${strategy.name}" missing indicators or entry conditions`);
            continue;
          }
          
          // Calculate all indicators for this strategy
          const indicatorValues = new Map<string, number>();
          for (const indicatorConfig of indicators) {
            if (!indicatorConfig || !indicatorConfig.type) continue;
            const value = calculateIndicator(
              indicatorConfig,
              currentPrice,
              safeCurrentVolume,
              historicalPrices,
              historicalVolumes,
            );
            indicatorValues.set(indicatorConfig.name || indicatorConfig.type, value);
          }
          indicatorValues.set("Price", currentPrice);
          indicatorValues.set("Volume", safeCurrentVolume);
          
          // Safe access for previous values
          const previousPrice = historicalPrices.length >= 2 ? historicalPrices[historicalPrices.length - 2] : currentPrice;
          const previousVolume = historicalVolumes.length >= 2 ? historicalVolumes[historicalVolumes.length - 2] : safeCurrentVolume;
          const previousHistoricalPrices = historicalPrices.length >= 2 ? historicalPrices.slice(0, -1) : historicalPrices;
          const previousHistoricalVolumes = historicalVolumes.length >= 2 ? historicalVolumes.slice(0, -1) : historicalVolumes;
          
          const previousIndicatorValues = new Map<string, number>();
          for (const indicatorConfig of indicators) {
            if (!indicatorConfig || !indicatorConfig.type) continue;
            const previousValue = calculateIndicator(
              indicatorConfig,
              previousPrice,
              previousVolume,
              previousHistoricalPrices,
              previousHistoricalVolumes,
            );
            previousIndicatorValues.set(indicatorConfig.name || indicatorConfig.type, previousValue);
          }
          previousIndicatorValues.set("Price", previousPrice);
          previousIndicatorValues.set("Volume", previousVolume);
          
          // Evaluate entry conditions with error handling
          let entryConditionsMet = false;
          try {
            entryConditionsMet = entryConditions.every((condition: any) =>
              condition ? evaluateCondition(condition, indicatorValues, previousIndicatorValues) : false,
            );
          } catch (conditionError) {
            console.warn(`Error evaluating conditions for strategy "${strategy.name}":`, conditionError);
            continue;
          }
          
          if (!entryConditionsMet) {
            continue; // Skip this strategy if entry conditions not met
          }
          // Calculate confidence (capped by Multi-Timeframe analysis)
          const strategyConfidence = Math.min(confidence, confidenceCap);
          // Apply risk settings from custom strategy
          const stopLossPercent = strategy.risk_settings?.stopLossPercent || riskParams.max_risk_per_trade_percent;
          const takeProfitPercent = strategy.risk_settings?.takeProfitPercent || stopLossPercent * 2.5;
          const strategyPositionSize = (strategy.risk_settings?.positionSizePercent || 100) * positionSizeMultiplier;
          // Create signal for custom strategy
          const customSignal = {
            user_id: userId,
            symbol,
            signal_type: signalType,
            trend,
            confidence_score: strategyConfidence,
            entry_price: currentPrice,
            stop_loss:
              signalType === "long"
                ? currentPrice * (1 - stopLossPercent / 100)
                : currentPrice * (1 + stopLossPercent / 100),
            take_profit:
              signalType === "long"
                ? currentPrice * (1 + takeProfitPercent / 100)
                : currentPrice * (1 - takeProfitPercent / 100),
            strategy_id: strategy.id,
            strategy_name: strategy.name,
            reason: `${strategy.name} conditions met (Multi-Timeframe: ${multiTimeframeReason})`,
            indicators: {
              ...Object.fromEntries(indicatorValues.entries()),
              multiTimeframeReason,
              stopLossPercent,
              takeProfitPercent,
              positionSizePercent: strategyPositionSize,
              // Include technical indicator signals in the response
              stochRsiSignal: stochRsiEval.signal,
              bollingerSignal: bollingerEval.signal,
              technicalBoost: (technicalBoost * 100).toFixed(0) + "%",
            },
            expires_at: new Date(Date.now() + 60000).toISOString(),
            created_by_rebalancer: false,
          };
          const { data: insertedSignal, error: insertError } = await supabase
            .from("trading_signals")
            .insert(customSignal)
            .select("id")
            .single();
          if (insertError) {
            console.error(`Failed to insert custom strategy signal for ${symbol}:`, insertError);
          } else if (insertedSignal) {
            signals.push({
              ...customSignal,
              id: insertedSignal.id,
              positionSizePercent: strategyPositionSize,
            } as SignalData);
            totalSignalsGenerated++;
            console.log(
              `✅ Created ${signalType.toUpperCase()} signal for ${symbol} using "${strategy.name}" (${multiTimeframeReason})`,
            );
            // Mark symbol as having a signal to avoid duplicates within this cycle
            existingSignalsSet.add(symbol);
            break; // Only one signal per symbol (first matching strategy)
          }
        }
      } catch (error) {
        console.error(`Error analyzing ${symbol}:`, error);
      }
    }
    const signalsAfterDeduplication = signals.length;
    // Auto-execute if enabled
    let executedSignals = 0;
    if (riskParams.auto_execute_signals && signals.length > 0) {
      for (const signal of signals) {
        try {
          const { error: executeError } = await supabase.functions.invoke("execute-trade", {
            headers: {
              Authorization: authHeader,
            },
            body: {
              signalId: signal.id,
              action: "execute",
            },
          });
          if (!executeError) {
            executedSignals++;
            console.log(`✓ Executed trade for ${signal.symbol}`);
          } else {
            console.error(`Failed to execute trade for ${signal.symbol}:`, executeError);
          }
        } catch (error) {
          console.error("Error executing signal:", error);
        }
      }
    }
    return new Response(
      JSON.stringify({
        signals,
        totalSignalsGenerated,
        signalsAfterDeduplication,
        rejectedByMultiTimeframeAnalysis,
        executedSignals,
        autoExecuteEnabled: riskParams.auto_execute_signals,
        message: `Multi-Timeframe Analysis used as prerequisite - ${customStrategies.length} custom strategies evaluated`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in strategy analyzer:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to analyze strategies",
        signals: [],
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
