import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SignalData {
  id?: string;
  user_id: string;
  symbol: string;
  signal_type: 'long' | 'short';
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    console.log(`Analyzing signals for user ${user.id}`);

    // Fetch user's risk parameters including divergence settings
    const { data: riskParams, error: riskError } = await supabase
      .from('risk_parameters')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (riskError || !riskParams) {
      throw new Error('Failed to fetch risk parameters');
    }

    // Check if trading is enabled
    if (!riskParams.is_trading_enabled) {
      return new Response(
        JSON.stringify({ message: 'Trading is disabled', signals: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch user's active trading symbols
    const { data: symbols, error: symbolsError } = await supabase
      .from('trading_symbols_config')
      .select('symbol')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (symbolsError || !symbols || symbols.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No active symbols configured', signals: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Analyzing ${symbols.length} symbols`);

    // Fetch active custom strategies (REQUIRED for signal generation)
    const { data: customStrategies, error: strategiesError } = await supabase
      .from('custom_strategies')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (strategiesError) {
      console.error('Failed to fetch custom strategies:', strategiesError);
    }

    if (!customStrategies || customStrategies.length === 0) {
      return new Response(
        JSON.stringify({ 
          message: 'No active custom strategies configured. Multi-Timeframe Analysis is used as a prerequisite only - signals are generated for custom strategies.',
          signals: [],
          totalSignalsGenerated: 0,
          rejectedByMultiTimeframeAnalysis: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${customStrategies.length} active custom strategies`);

    // Calculate timestamp for 1 minute ago to match UI filter
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();

    // Fetch recent signals (last 1 minute) to avoid generating duplicate signals
    const { data: existingSignals } = await supabase
      .from('trading_signals')
      .select('symbol')
      .eq('user_id', user.id)
      .gte('created_at', oneMinuteAgo);

    const existingSignalsSet = new Set(existingSignals?.map(s => s.symbol) || []);

    // Fetch open trades and count per symbol to respect max_trades_per_symbol
    const { data: openTrades } = await supabase
      .from('trades')
      .select('symbol')
      .eq('user_id', user.id)
      .eq('status', 'open');

    // Count open trades per symbol
    const openTradesPerSymbol = new Map<string, number>();
    openTrades?.forEach(trade => {
      const count = openTradesPerSymbol.get(trade.symbol) || 0;
      openTradesPerSymbol.set(trade.symbol, count + 1);
    });

    const signals: SignalData[] = [];
    let totalSignalsGenerated = 0;
    let rejectedByMultiTimeframeAnalysis = 0;

    // Helper functions for custom strategy evaluation
    const calculateRSI = (prices: number[], period = 14): number => {
      if (prices.length < period + 1) return 50;
      let gains = 0, losses = 0;
      for (let i = 1; i <= period; i++) {
        const change = prices[i] - prices[i - 1];
        if (change > 0) gains += change;
        else losses += Math.abs(change);
      }
      const avgGain = gains / period;
      const avgLoss = losses / period;
      const rs = avgGain / (avgLoss || 1);
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

    const calculateMACD = (prices: number[]): { macd: number; signal: number; histogram: number } => {
      const ema12 = calculateEMA(prices, 12);
      const ema26 = calculateEMA(prices, 26);
      const macd = ema12 - ema26;
      const signal = macd * 0.9;
      return { macd, signal, histogram: macd - signal };
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

    const calculateIndicator = (indicatorConfig: any, currentPrice: number, currentVolume: number, historicalPrices: number[], historicalVolumes: number[]): number => {
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

    const evaluateCondition = (condition: any, indicatorValues: Map<string, number>): boolean => {
      const indicatorValue = indicatorValues.get(condition.indicator) || 0;
      const targetValue = condition.compareToIndicator && condition.targetIndicator 
        ? indicatorValues.get(condition.targetIndicator) || 0
        : parseFloat(condition.value || "0");

      switch (condition.operator.toLowerCase()) {
        case "above":
        case "crosses_above":
          return indicatorValue > targetValue;
        case "below":
        case "crosses_below":
          return indicatorValue < targetValue;
        default:
          return false;
      }
    };

    const fetchHistoricalKlines = async (symbol: string): Promise<{ prices: number[]; volumes: number[] }> => {
      try {
        // Fetch 50 candles of 15m data for indicator calculations (MACD needs ~26+ periods)
        const response = await fetch(
          `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=15m&limit=50`
        );
        
        if (!response.ok) {
          throw new Error(`Binance API error: ${response.status}`);
        }
        
        const klines = await response.json();
        
        // Binance kline format: [openTime, open, high, low, close, volume, closeTime, ...]
        const prices = klines.map((k: any) => parseFloat(k[4])); // close price
        const volumes = klines.map((k: any) => parseFloat(k[5])); // volume
        
        return { prices, volumes };
      } catch (error) {
        console.error(`Failed to fetch klines for ${symbol}:`, error);
        // Return empty arrays as fallback - strategy evaluation will skip if insufficient data
        return { prices: [], volumes: [] };
      }
    };

    // Fetch market data for all active symbols
    const symbolsList = symbols.map(s => s.symbol);
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
    const marketDataMap = new Map(
      marketDataResults
        .filter(data => data !== null)
        .map(data => [data.symbol, data])
    );

    // Analyze each symbol
    for (const { symbol } of symbols) {
      const currentTradeCount = openTradesPerSymbol.get(symbol) || 0;
      const hasRecentSignal = existingSignalsSet.has(symbol);
      
      // Skip if already has a recent signal (prevents duplicate signals)
      if (hasRecentSignal) {
        const statusMsg = currentTradeCount > 0 
          ? `${currentTradeCount}/${riskParams.max_trades_per_symbol} trades active, but has recent signal`
          : 'has recent signal (no open trades)';
        console.log(`⏭️ Skipping ${symbol} - ${statusMsg}`);
        await supabase
          .from('signal_rejection_log')
          .insert({
            user_id: user.id,
            symbol,
            rejection_reason: `Already has active signal from last minute (${statusMsg})`,
            filters_status: { currentTradeCount, maxTradesPerSymbol: riskParams.max_trades_per_symbol },
            trend_data: null,
            checked_at: new Date().toISOString()
          });
        continue;
      }

      // Check if symbol has reached max trades per symbol limit
      if (currentTradeCount >= riskParams.max_trades_per_symbol) {
        console.log(`⏭️ Skipping ${symbol} - max trades limit reached (${currentTradeCount}/${riskParams.max_trades_per_symbol} trades active)`);
        await supabase
          .from('signal_rejection_log')
          .insert({
            user_id: user.id,
            symbol,
            rejection_reason: `Max trades per symbol reached: ${currentTradeCount}/${riskParams.max_trades_per_symbol} trades active`,
            filters_status: { currentTradeCount, maxTradesPerSymbol: riskParams.max_trades_per_symbol },
            trend_data: null,
            checked_at: new Date().toISOString()
          });
        continue;
      }
      
      // Log symbol evaluation start with current state
      console.log(`🔍 Evaluating ${symbol} (${currentTradeCount}/${riskParams.max_trades_per_symbol} trades active, no recent signals)`);
    

      try {
        // ============= STEP 1: Multi-Timeframe Analysis Validation =============
        // First, validate market conditions using Multi-Timeframe Analysis
        // This acts as a PREREQUISITE for all custom strategies
        
        const { data: trendData, error: trendError } = await supabase.functions.invoke('calculate-trend', {
          body: { symbol }
        });

        if (trendError || !trendData) {
          console.warn(`Failed to analyze ${symbol}:`, trendError);
          continue;
        }

        const { trend, confidence, trendConsistency, higherTimeframeFilter } = trendData;

        // Validate Multi-Timeframe conditions
        let multiTimeframePass = false;
        let positionSizeMultiplier = 1.0;
        let confidenceCap = 100;
        let multiTimeframeReason = '';

        if (higherTimeframeFilter.aligned) {
          const meetsThreshold = confidence >= riskParams.min_confidence_threshold &&
                                trendConsistency >= riskParams.min_trend_consistency;
          const hasMomentumConfirmation = trendData.momentum?.confirms || false;
          
          if (meetsThreshold && hasMomentumConfirmation) {
            multiTimeframePass = true;
            // Check if this was neutral allowance or standard alignment
            const neutralAllowed = higherTimeframeFilter.neutralAllowedWithStrongHigherTimeframe || false;
            multiTimeframeReason = neutralAllowed 
              ? 'Enhanced alignment: 1h=neutral with strong 4h trend and momentum confirmation'
              : 'Standard aligned timeframes with momentum confirmation';
          } else {
            rejectedByMultiTimeframeAnalysis++;
            
            // Detailed rejection data - use correct momentum structure
            const rejectionData = {
              confidence,
              trendConsistency,
              meetsThreshold,
              momentum: trendData.momentum,
              consecutive15mBullish: trendData.momentum?.consecutive15mBullish || 0,
              consecutive15mBearish: trendData.momentum?.consecutive15mBearish || 0,
              consecutive30mBullish: trendData.momentum?.consecutive30mBullish || 0,
              consecutive30mBearish: trendData.momentum?.consecutive30mBearish || 0,
              trend4h: trendData.higherTimeframeFilter?.trend4h,
              trend1h: trendData.higherTimeframeFilter?.trend1h,
              aligned: higherTimeframeFilter.aligned,
              neutralAllowedWithStrongHigherTimeframe: higherTimeframeFilter.neutralAllowedWithStrongHigherTimeframe || false,
              required: !hasMomentumConfirmation 
                ? 'momentum confirmation (≥2 consecutive candles on 15m OR 30m + MACD expansion)'
                : 'confidence/consistency threshold'
            };
            
            await supabase
              .from('signal_rejection_log')
              .insert({
                user_id: user.id,
                symbol,
                rejection_reason: !hasMomentumConfirmation 
                  ? 'Multi-Timeframe prerequisite failed: momentum not confirmed'
                  : 'Multi-Timeframe prerequisite failed: confidence or trend consistency below threshold',
                filters_status: rejectionData,
                trend_data: trendData,
                checked_at: new Date().toISOString()
              });
            continue;
          }
        } else if (higherTimeframeFilter.allowDivergenceSignal) {
          const { divergenceType } = higherTimeframeFilter;
          
          if (divergenceType === 'pullback' && riskParams.enable_pullback_signals) {
            const tf30m = trendData.timeframes?.['30m'];
            const tf15m = trendData.timeframes?.['15m'];
            const tf4h = trendData.timeframes?.['4h'];
            const trendAligned = tf30m && tf15m && tf4h && 
                tf30m.trend === tf4h.trend && tf15m.trend === tf4h.trend;
            const hasMomentumConfirmation = trendData.momentum?.confirms || false;
            
            if (trendAligned && hasMomentumConfirmation) {
              multiTimeframePass = true;
              positionSizeMultiplier = (riskParams.pullback_position_size_percent || 50) / 100;
              confidenceCap = 70;
              multiTimeframeReason = 'Pullback opportunity with momentum';
            }
          } else if (divergenceType === 'early_reversal' && riskParams.enable_early_reversal_signals) {
            const tf30m = trendData.timeframes?.['30m'];
            const tf15m = trendData.timeframes?.['15m'];
            const tf1h = trendData.timeframes?.['1h'];
            const trendAligned = tf30m && tf15m && tf1h && 
                tf30m.trend === tf1h.trend && tf15m.trend === tf1h.trend;
            const hasMomentumConfirmation = trendData.momentum?.confirms || false;
            
            if (trendAligned && hasMomentumConfirmation) {
              multiTimeframePass = true;
              positionSizeMultiplier = (riskParams.early_reversal_position_size_percent || 40) / 100;
              confidenceCap = 65;
              multiTimeframeReason = 'Early reversal with strong momentum';
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
              consecutive15mBullish: trendData.momentum?.consecutive15mBullish || 0,
              consecutive15mBearish: trendData.momentum?.consecutive15mBearish || 0,
              consecutive30mBullish: trendData.momentum?.consecutive30mBullish || 0,
              consecutive30mBearish: trendData.momentum?.consecutive30mBearish || 0,
              trend4h: trendData.multiTimeframe?.trend4h,
              trend1h: trendData.multiTimeframe?.trend1h,
              trend30m: trendData.multiTimeframe?.trend30m,
              trend15m: trendData.multiTimeframe?.trend15m
            };
            
            await supabase
              .from('signal_rejection_log')
              .insert({
                user_id: user.id,
                symbol,
                rejection_reason: 'Multi-Timeframe prerequisite failed: divergence conditions not met or momentum missing',
                filters_status: rejectionData,
                trend_data: trendData,
                checked_at: new Date().toISOString()
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
            consecutive15mBullish: trendData.momentum?.consecutive15mBullish || 0,
            consecutive15mBearish: trendData.momentum?.consecutive15mBearish || 0,
            consecutive30mBullish: trendData.momentum?.consecutive30mBullish || 0,
            consecutive30mBearish: trendData.momentum?.consecutive30mBearish || 0,
            trend4h: trendData.multiTimeframe?.trend4h,
            trend1h: trendData.multiTimeframe?.trend1h,
            trend30m: trendData.multiTimeframe?.trend30m,
            trend15m: trendData.multiTimeframe?.trend15m,
            isRanging: trendData.ranging?.isRanging || false,
            required: 'higher timeframes NOT aligned or ranging market detected'
          };
          
          await supabase
            .from('signal_rejection_log')
            .insert({
              user_id: user.id,
              symbol,
              rejection_reason: 'Multi-Timeframe prerequisite failed: timeframes not aligned, no divergence opportunity',
              filters_status: rejectionData,
              trend_data: trendData,
              checked_at: new Date().toISOString()
            });
          continue;
        }

        // Determine signal type
        const signalType = trend === 'bullish' ? 'long' : trend === 'bearish' ? 'short' : null;
        if (!signalType) {
          await supabase
            .from('signal_rejection_log')
            .insert({
              user_id: user.id,
              symbol,
              rejection_reason: 'Multi-Timeframe prerequisite failed: ranging market',
              filters_status: { trend },
              trend_data: trendData,
              checked_at: new Date().toISOString()
            });
          continue;
        }

        // ============= STEP 2: Custom Strategy Evaluation =============
        // Now evaluate custom strategies since Multi-Timeframe prerequisite passed
        
        const marketData = marketDataMap.get(symbol);
        if (!marketData) continue;

        const currentPrice = parseFloat(marketData.lastPrice);
        const currentVolume = parseFloat(marketData.volume);

        const { prices: historicalPrices, volumes: historicalVolumes } = await fetchHistoricalKlines(symbol);
        
        // Skip if insufficient historical data
        if (historicalPrices.length < 26) {
          console.warn(`Insufficient historical data for ${symbol} (${historicalPrices.length} candles)`);
          continue;
        }

        // Evaluate each custom strategy
        for (const strategy of customStrategies) {
          // Skip if this strategy already has a signal for this symbol
          if (signals.some(s => s.symbol === symbol && s.strategy_id === strategy.id)) {
            continue;
          }

          // Calculate all indicators for this strategy
          const indicatorValues = new Map<string, number>();
          for (const indicatorConfig of strategy.indicators) {
            const value = calculateIndicator(
              indicatorConfig,
              currentPrice,
              currentVolume,
              historicalPrices,
              historicalVolumes
            );
            indicatorValues.set(indicatorConfig.name || indicatorConfig.type, value);
          }
          indicatorValues.set("Price", currentPrice);
          indicatorValues.set("Volume", currentVolume);

          // Evaluate entry conditions
          const entryConditionsMet = strategy.entry_conditions.every((condition: any) => 
            evaluateCondition(condition, indicatorValues)
          );

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
            user_id: user.id,
            symbol,
            signal_type: signalType,
            trend,
            confidence_score: strategyConfidence,
            entry_price: currentPrice,
            stop_loss: signalType === 'long'
              ? currentPrice * (1 - (stopLossPercent / 100))
              : currentPrice * (1 + (stopLossPercent / 100)),
            take_profit: signalType === 'long'
              ? currentPrice * (1 + (takeProfitPercent / 100))
              : currentPrice * (1 - (takeProfitPercent / 100)),
            strategy_id: strategy.id,
            strategy_name: strategy.name,
            reason: `${strategy.name} conditions met (Multi-Timeframe: ${multiTimeframeReason})`,
            indicators: {
              ...Object.fromEntries(indicatorValues.entries()),
              multiTimeframeReason,
              stopLossPercent,
              takeProfitPercent,
              positionSizePercent: strategyPositionSize
            },
            expires_at: new Date(Date.now() + 60000).toISOString(),
            created_by_rebalancer: false
          };

          const { data: insertedSignal, error: insertError } = await supabase
            .from('trading_signals')
            .insert(customSignal)
            .select('id')
            .single();

          if (insertError) {
            console.error(`Failed to insert custom strategy signal for ${symbol}:`, insertError);
          } else if (insertedSignal) {
            signals.push({ 
              ...customSignal, 
              id: insertedSignal.id, 
              positionSizePercent: strategyPositionSize 
            } as SignalData);
            totalSignalsGenerated++;
            console.log(`✅ Created ${signalType.toUpperCase()} signal for ${symbol} using "${strategy.name}" (now ${currentTradeCount}/${riskParams.max_trades_per_symbol} trades, 1 active signal)`);
            
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
          const { error: executeError } = await supabase.functions.invoke('execute-trade', {
            headers: {
              Authorization: authHeader,
            },
            body: {
              signalId: signal.id,
              action: 'execute'
            }
          });

          if (!executeError) {
            executedSignals++;
            console.log(`✓ Executed trade for ${signal.symbol}`);
          } else {
            console.error(`Failed to execute trade for ${signal.symbol}:`, executeError);
          }
        } catch (error) {
          console.error('Error executing signal:', error);
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
        message: `Multi-Timeframe Analysis used as prerequisite - ${customStrategies.length} custom strategies evaluated`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in strategy analyzer:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Failed to analyze strategies',
        signals: []
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
