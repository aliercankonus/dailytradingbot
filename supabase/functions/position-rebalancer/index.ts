import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.84.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Position {
  id: string;
  user_id: string;
  symbol: string;
  side: string;
  quantity: number;
  entry_price: number;
  current_price: number;
  trend: string;
  confidence_score: number;
  opened_at: string;
}

interface RebalanceConfig {
  user_id: string;
  auto_rebalance_enabled: boolean;
  rebalance_loss_threshold_percent: number;
  max_positions_to_close_per_cycle: number;
  is_trading_enabled: boolean;
}

interface RebalanceResult {
  user_id: string;
  success: boolean;
  positions_closed?: number;
  signals_generated?: number;
  positions_analyzed?: number;
  positions_underwater?: number;
  positions_conflicting?: number;
  error?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing required environment variables');
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Starting position rebalancing cycle...');

    // Get all users with auto rebalancing enabled
    const { data: configs, error: configError } = await supabase
      .from('risk_parameters')
      .select('user_id, auto_rebalance_enabled, rebalance_loss_threshold_percent, max_positions_to_close_per_cycle, is_trading_enabled')
      .eq('auto_rebalance_enabled', true)
      .eq('is_trading_enabled', true);

    if (configError) {
      console.error('Error fetching rebalance configs:', configError);
      throw configError;
    }

    if (!configs || configs.length === 0) {
      console.log('No users with auto rebalancing enabled');
      return new Response(
        JSON.stringify({ message: 'No users with auto rebalancing enabled' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results: RebalanceResult[] = [];

    for (const config of configs) {
      console.log(`\n=== Processing rebalancing for user ${config.user_id} ===`);
      
      try {
        const result = await rebalanceUserPositions(supabase, config);
        results.push({
          user_id: config.user_id,
          ...result
        });
      } catch (error) {
        console.error(`Error rebalancing for user ${config.user_id}:`, error);
        results.push({
          user_id: config.user_id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    console.log('\n=== Rebalancing cycle complete ===');
    console.log(`Processed ${results.length} users`);

    return new Response(
      JSON.stringify({
        message: 'Rebalancing cycle complete',
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in position rebalancer:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Failed to rebalance positions' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function rebalanceUserPositions(
  supabase: any, 
  config: RebalanceConfig
) {
  const { user_id, rebalance_loss_threshold_percent, max_positions_to_close_per_cycle } = config;

  // Fetch all active positions for the user
  const { data: positions, error: positionsError } = await supabase
    .from('positions')
    .select('*')
    .eq('user_id', user_id)
    .eq('status', 'active');

  if (positionsError) {
    throw positionsError;
  }

  if (!positions || positions.length === 0) {
    console.log(`User ${user_id}: No active positions`);
    return { success: true, positions_closed: 0, signals_generated: 0 };
  }

  // Fetch live prices from Binance for accurate P&L calculation - PARALLEL
  const symbolSet = new Set<string>();
  positions.forEach((p: any) => symbolSet.add(String(p.symbol)));
  const priceMap = new Map<string, number>();
  
  const pricePromises = Array.from(symbolSet).map(async (symbol) => {
    try {
      const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
      const data = await response.json() as { price?: string };
      if (data.price) {
        const price = parseFloat(data.price);
        if (Number.isFinite(price) && price > 0) {
          console.log(`Fetched live price for ${symbol}: ${data.price}`);
          return { symbol, price };
        }
      }
      return { symbol, price: null };
    } catch (error) {
      console.error(`Failed to fetch price for ${symbol}:`, error);
      return { symbol, price: null };
    }
  });

  const priceResults = await Promise.all(pricePromises);
  priceResults.forEach(({ symbol, price }) => {
    if (price !== null) {
      priceMap.set(symbol, price);
    }
  });

  // Calculate unrealized P&L for each position using live prices
  const positionsWithPnL = positions.map((pos: any) => {
    const currentPrice = priceMap.get(pos.symbol) || pos.entry_price;
    const entryPrice = pos.entry_price || 0;
    
    // Protect against division by zero
    if (entryPrice <= 0) {
      console.warn(`Invalid entry price for position ${pos.id}: ${entryPrice}`);
      return { ...pos, unrealized_pnl_percent: 0 };
    }
    
    const unrealized_pnl_percent = pos.side === 'BUY'
      ? ((currentPrice - entryPrice) / entryPrice) * 100
      : ((entryPrice - currentPrice) / entryPrice) * 100;
    return { ...pos, unrealized_pnl_percent };
  });

  // Sort by P&L percent (most losing first)
  positionsWithPnL.sort((a: any, b: any) => a.unrealized_pnl_percent - b.unrealized_pnl_percent);

  console.log(`User ${user_id}: Found ${positionsWithPnL.length} active positions`);

  // Identify underwater positions that conflict with market trend
  const positionsToRebalance: (Position & { unrealized_pnl_percent: number })[] = [];
  const symbolsToAnalyze = new Set<string>();

  for (const position of positionsWithPnL) {
    // Only consider positions losing more than threshold
    if (position.unrealized_pnl_percent < -rebalance_loss_threshold_percent) {
      positionsToRebalance.push(position);
      symbolsToAnalyze.add(position.symbol);
    }
  }

  if (positionsToRebalance.length === 0) {
    console.log(`User ${user_id}: No positions below loss threshold (-${rebalance_loss_threshold_percent}%)`);
    return { success: true, positions_closed: 0, signals_generated: 0 };
  }

  console.log(`User ${user_id}: Found ${positionsToRebalance.length} positions below threshold`);

  // Get current market trends for affected symbols - PARALLEL
  const trendData: Record<string, any> = {};
  const trendPromises = Array.from(symbolsToAnalyze).map(async (symbol) => {
    try {
      const { data, error } = await supabase.functions.invoke('calculate-trend', {
        body: { symbol }
      });
      
      if (!error && data) {
        console.log(`  ${symbol}: ${data.trend} (confidence: ${data.confidence}%, consistency: ${data.trendConsistency}%)`);
        return { symbol, data };
      }
      return { symbol, data: null };
    } catch (error) {
      console.warn(`Failed to get trend for ${symbol}:`, error);
      return { symbol, data: null };
    }
  });

  const trendResults = await Promise.all(trendPromises);
  trendResults.forEach(({ symbol, data }) => {
    if (data) {
      trendData[symbol] = data;
    }
  });

  // Identify positions that conflict with current market trend
  const positionsToClose: (Position & { unrealized_pnl_percent: number })[] = [];
  
  for (const position of positionsToRebalance) {
    const trend = trendData[position.symbol];
    if (!trend) continue;

    const isBuyPosition = position.side === 'BUY';
    const marketIsBullish = trend.trend === 'bullish';
    const marketIsBearish = trend.trend === 'bearish';

    // Close if position direction conflicts with strong market trend
    if ((isBuyPosition && marketIsBearish) || (!isBuyPosition && marketIsBullish)) {
      if (trend.confidence >= 40 && trend.trendConsistency >= 50) {
        positionsToClose.push(position);
        console.log(`  ❌ Closing ${position.symbol} ${position.side} (${position.unrealized_pnl_percent.toFixed(2)}%) - conflicts with ${trend.trend} market`);
      }
    }
  }

  // Limit positions to close per cycle (gradual approach)
  const positionsToCloseNow = positionsToClose.slice(0, max_positions_to_close_per_cycle);
  
  console.log(`User ${user_id}: Closing ${positionsToCloseNow.length} of ${positionsToClose.length} conflicting positions`);

  // Close selected positions
  let closedCount = 0;
  let signalsGenerated = 0;

  for (const position of positionsToCloseNow) {
    try {
      // Close the position and mark as closed by rebalancer
      const { error: closeError } = await supabase.functions.invoke('close-trade', {
        body: { 
          positionId: position.id,
          manualClose: false,
          closedByRebalancer: true,
          user_id: position.user_id // Required for service role calls
        }
      });

      if (closeError) {
        console.error(`Failed to close position ${position.id}:`, closeError);
        continue;
      }

      closedCount++;
      console.log(`  ✓ Closed ${position.symbol} ${position.side} position`);

      // Generate a new signal aligned with current trend
      const trend = trendData[position.symbol];
      if (trend) {
        // Fetch user's divergence settings
        const { data: riskParams, error: riskError } = await supabase
          .from('risk_parameters')
          .select('enable_pullback_signals, enable_early_reversal_signals, pullback_position_size_percent, early_reversal_position_size_percent, divergence_sl_multiplier, divergence_tp_multiplier, standard_tp_multiplier, max_risk_per_trade_percent')
          .eq('user_id', user_id)
          .maybeSingle();

        if (riskError) {
          console.error(`Failed to fetch risk params for user ${user_id}:`, riskError);
          continue;
        }

        if (!riskParams) {
          console.warn(`No risk params found for user ${user_id}`);
          continue;
        }

        let shouldCreateSignal = false;
        let positionSizePercent = 1.0; // Default 1% of portfolio
        let confidenceCap = 100;
        let signalReason = '';

        // Check signal eligibility based on divergence settings
        if (trend.higherTimeframeFilter?.aligned) {
          shouldCreateSignal = trend.confidence >= 60 && trend.trendConsistency >= 60;
          positionSizePercent = 1.0; // Standard 1% position size for aligned trends
          signalReason = `Rebalancing: Closed ${position.side} position and opening to align with ${trend.trend} market`;
        } else if (trend.higherTimeframeFilter?.allowDivergenceSignal && riskParams) {
          const { divergenceType } = trend.higherTimeframeFilter;
          
          if (divergenceType === 'pullback' && riskParams.enable_pullback_signals) {
            // Multi-layer confirmation: require 30m and 15m to align with 4h
            const tf30m = trend.timeframes?.['30m'];
            const tf15m = trend.timeframes?.['15m'];
            const tf4h = trend.timeframes?.['4h'];
            
            if (tf30m && tf15m && tf4h && 
                tf30m.trend === tf4h.trend && 
                tf15m.trend === tf4h.trend) {
              shouldCreateSignal = true;
              const sizeReduction = (riskParams.pullback_position_size_percent || 50) / 100;
              positionSizePercent = 1.0 * sizeReduction;
              confidenceCap = 70;
              signalReason = `Rebalancing: Pullback opportunity confirmed by 30m/15m after closing ${position.side} position`;
            } else {
              console.log(`  Skipped pullback signal for ${position.symbol} - 30m/15m confirmation failed`);
            }
          } else if (divergenceType === 'early_reversal' && riskParams.enable_early_reversal_signals) {
            // Multi-layer confirmation: require 30m and 15m to align with 1h
            const tf30m = trend.timeframes?.['30m'];
            const tf15m = trend.timeframes?.['15m'];
            const tf1h = trend.timeframes?.['1h'];
            
            if (tf30m && tf15m && tf1h && 
                tf30m.trend === tf1h.trend && 
                tf15m.trend === tf1h.trend) {
              shouldCreateSignal = true;
              const sizeReduction = (riskParams.early_reversal_position_size_percent || 40) / 100;
              positionSizePercent = 1.0 * sizeReduction;
              confidenceCap = 65;
              signalReason = `Rebalancing: Early reversal confirmed by 30m/15m after closing ${position.side} position`;
            } else {
              console.log(`  Skipped early reversal signal for ${position.symbol} - 30m/15m confirmation failed`);
            }
          }
        }

        if (shouldCreateSignal) {
          const newSignalType = trend.trend === 'bullish' ? 'long' : 'short';
          const finalConfidence = Math.min(trend.confidence, confidenceCap);
          
          // Get current price - use priceMap first, then trend.currentPrice as fallback
          const currentPrice = priceMap.get(position.symbol) || trend.currentPrice || position.entry_price;
          
          if (!currentPrice || currentPrice <= 0) {
            console.warn(`Invalid current price for ${position.symbol}, skipping signal generation`);
            continue;
          }
          
          // Adjust stop loss and take profit for divergence signals
          const isDivergenceSignal = trend.higherTimeframeFilter?.divergenceType;
          const maxRiskPercent = (riskParams.max_risk_per_trade_percent || 1.5) / 100;
          const divergenceSlMultiplier = riskParams.divergence_sl_multiplier || 0.67;
          const stopLossPercent = isDivergenceSignal 
            ? maxRiskPercent * divergenceSlMultiplier
            : maxRiskPercent;
          const divergenceTpMultiplier = riskParams.divergence_tp_multiplier || 2.0;
          const standardTpMultiplier = riskParams.standard_tp_multiplier || 2.5;
          const takeProfitPercent = isDivergenceSignal 
            ? stopLossPercent * divergenceTpMultiplier
            : stopLossPercent * standardTpMultiplier;
          
          // Create new trading signal marked as created by rebalancer
          const { error: signalError } = await supabase
            .from('trading_signals')
            .insert({
              user_id,
              symbol: position.symbol,
              signal_type: newSignalType,
              trend: trend.trend,
              confidence_score: finalConfidence,
              entry_price: currentPrice,
              created_by_rebalancer: true,
              stop_loss: newSignalType === 'long' 
                ? currentPrice * (1 - stopLossPercent)
                : currentPrice * (1 + stopLossPercent),
              take_profit: newSignalType === 'long'
                ? currentPrice * (1 + takeProfitPercent)
                : currentPrice * (1 - takeProfitPercent),
              strategy_name: 'Auto Rebalance',
              reason: signalReason,
              indicators: {
                ...trend.indicators,
                divergenceType: trend.higherTimeframeFilter?.divergenceType,
                positionSizePercent,
                stopLossPercent: stopLossPercent * 100,
                takeProfitPercent: takeProfitPercent * 100
              },
              expires_at: new Date(Date.now() + 60000).toISOString() // 1 minute expiry
            });

          if (!signalError) {
            signalsGenerated++;
            console.log(`  ✓ Generated ${newSignalType.toUpperCase()} signal for ${position.symbol} (${trend.higherTimeframeFilter?.divergenceType || 'aligned'})`);
          } else {
            console.error(`Failed to insert signal for ${position.symbol}:`, signalError);
          }
        }
      }
    } catch (error) {
      console.error(`Error processing position ${position.id}:`, error);
    }
  }

  return {
    success: true,
    positions_closed: closedCount,
    signals_generated: signalsGenerated,
    positions_analyzed: positions.length,
    positions_underwater: positionsToRebalance.length,
    positions_conflicting: positionsToClose.length
  };
}
