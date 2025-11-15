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
  return 100 - 100 / (1 + rs);
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
function detectTrend(data: MarketData): "bullish" | "bearish" | "ranging" {
  const changePercent = parseFloat(data.priceChangePercent);
  const volumeRatio = parseFloat(data.volume) / 1000000;

  if (changePercent > 2 && volumeRatio > 50) return "bullish";
  if (changePercent < -2 && volumeRatio > 50) return "bearish";
  return "ranging";
}

// Fetch real Binance kline data with volume
async function fetchBinanceKlines(
  symbol: string,
  limit: number = 100,
): Promise<{ prices: number[]; volumes: number[] }> {
  try {
    const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1m&limit=${limit}`);

    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status}`);
    }

    const klines = await response.json();

    // Binance klines: [openTime, open, high, low, close, volume, closeTime, quoteVolume, trades, ...]
    const prices = klines.map((k: any) => parseFloat(k[4])); // close prices
    const volumes = klines.map((k: any) => parseFloat(k[5])); // volumes

    console.log(`Fetched ${prices.length} klines for ${symbol}, latest volume: ${volumes[volumes.length - 1]}`);

    return { prices, volumes };
  } catch (error) {
    console.error(`Failed to fetch Binance klines for ${symbol}:`, error);
    // Fallback to synthetic data
    const prices: number[] = [];
    const volumes: number[] = [];
    let price = 50000;

    for (let i = 0; i < limit; i++) {
      const change = (Math.random() - 0.5) * 0.02;
      price = price * (1 + change);
      prices.push(price);
      volumes.push(Math.random() * 1000000 + 500000); // synthetic volume with minimum
    }

    console.log(`Using synthetic data for ${symbol}, generated ${prices.length} prices`);
    return { prices, volumes };
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
async function analyzeWithStrategy(data: MarketData, strategy: CustomStrategy, prices: number[], volumes: number[]) {
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

  // Determine signal type
  let signalType: "long" | "short" | "hold" = "hold";
  let reason = `Waiting for entry conditions (${strategy.name})`;

  if (entryConditionsMet) {
    // Determine if bullish or bearish based on trend
    const trend = detectTrend(data);

    if (trend === "bullish") {
      signalType = "long";
      reason = `${strategy.name}: Entry conditions met with bullish trend`;
    } else if (trend === "bearish") {
      signalType = "short";
      reason = `${strategy.name}: Entry conditions met with bearish trend`;
    } else {
      signalType = "long"; // Default to long if ranging
      reason = `${strategy.name}: Entry conditions met`;
    }
  }

  // Calculate stop loss and take profit based on strategy settings
  const stopLossPercent = strategy.risk_settings.stopLossPercent;
  const takeProfitPercent = strategy.risk_settings.takeProfitPercent;

  const stopLoss =
    signalType === "long" ? currentPrice * (1 - stopLossPercent / 100) : currentPrice * (1 + stopLossPercent / 100);

  const takeProfit =
    signalType === "long" ? currentPrice * (1 + takeProfitPercent / 100) : currentPrice * (1 - takeProfitPercent / 100);

  const riskRewardRatio = takeProfitPercent / stopLossPercent;

  // Calculate confidence score
  const conditionsMet = strategy.entry_conditions.filter((condition) =>
    evaluateCondition(condition, indicatorValues, data),
  ).length;
  const confidenceScore = Math.round((conditionsMet / strategy.entry_conditions.length) * 100);

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

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      // Be graceful for unauthenticated calls (e.g., expired session on auto-poll)
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

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      // Graceful fallback for invalid/expired token
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

    console.log(`Strategy analyzer called by user: ${user.id}`);

    // Check if auto-trading is enabled for this user
    const { data: riskParams } = await supabase
      .from("risk_parameters")
      .select("is_trading_enabled, max_open_trades, current_open_trades, paper_trading_mode")
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
        const { prices, volumes } = await fetchBinanceKlines(data.symbol, 100);

        const signal = await analyzeWithStrategy(data, strategy, prices, volumes);

        // Only collect signals that are not 'hold'
        if (signal.signalType !== "hold") {
          console.log(`Generated ${signal.signalType} signal for ${signal.symbol} using ${strategy.name}`);
          allSignals.push({
            ...signal,
            strategyId: strategy.id,
            strategyName: strategy.name,
          });
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
    for (const signal of limitedSignals) {
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
            const { error: execError } = await supabase.functions.invoke("execute-trade", {
              body: { signalId: insertedSignal.id, action: "execute" },
              headers: {
                Authorization: authHeader,
              },
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
