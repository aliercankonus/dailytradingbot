import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

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
  unrealized_pnl: number;
  unrealized_pnl_percent: number;
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
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

    const results = [];

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
    .eq('status', 'active')
    .order('unrealized_pnl_percent', { ascending: true }); // Most losing first

  if (positionsError) {
    throw positionsError;
  }

  if (!positions || positions.length === 0) {
    console.log(`User ${user_id}: No active positions`);
    return { success: true, positions_closed: 0, signals_generated: 0 };
  }

  console.log(`User ${user_id}: Found ${positions.length} active positions`);

  // Identify underwater positions that conflict with market trend
  const positionsToRebalance: Position[] = [];
  const symbolsToAnalyze = new Set<string>();

  for (const position of positions) {
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

  // Get current market trends for affected symbols
  const trendData: Record<string, any> = {};
  for (const symbol of symbolsToAnalyze) {
    try {
      const { data, error } = await supabase.functions.invoke('calculate-trend', {
        body: { symbol }
      });
      
      if (!error && data) {
        trendData[symbol] = data;
        console.log(`  ${symbol}: ${data.trend} (confidence: ${data.confidence}%, consistency: ${data.trendConsistency}%)`);
      }
    } catch (error) {
      console.warn(`Failed to get trend for ${symbol}:`, error);
    }
  }

  // Identify positions that conflict with current market trend
  const positionsToClose: Position[] = [];
  
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
          closedByRebalancer: true
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
        const { data: riskParams } = await supabase
          .from('risk_parameters')
          .select('enable_pullback_signals, enable_early_reversal_signals, pullback_position_size_percent, early_reversal_position_size_percent')
          .eq('user_id', user_id)
          .single();

        let shouldCreateSignal = false;
        let positionSizePercent = 100;
        let confidenceCap = 100;
        let signalReason = '';

        // Check signal eligibility based on divergence settings
        if (trend.higherTimeframeFilter?.aligned) {
          shouldCreateSignal = trend.confidence >= 60 && trend.trendConsistency >= 60;
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
              positionSizePercent = riskParams.pullback_position_size_percent || 50;
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
              positionSizePercent = riskParams.early_reversal_position_size_percent || 40;
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
          
          // Create new trading signal marked as created by rebalancer
          const { error: signalError } = await supabase
            .from('trading_signals')
            .insert({
              user_id,
              symbol: position.symbol,
              signal_type: newSignalType,
              trend: trend.trend,
              confidence_score: finalConfidence,
              entry_price: trend.currentPrice,
              created_by_rebalancer: true,
              stop_loss: newSignalType === 'long' 
                ? trend.currentPrice * (1 - 0.015)
                : trend.currentPrice * (1 + 0.015),
              take_profit: newSignalType === 'long'
                ? trend.currentPrice * (1 + 0.0375)
                : trend.currentPrice * (1 - 0.0375),
              strategy_name: 'Auto Rebalance',
              reason: signalReason,
              indicators: {
                ...trend.indicators,
                divergenceType: trend.higherTimeframeFilter?.divergenceType,
                positionSizePercent
              },
              expires_at: new Date(Date.now() + 60000).toISOString() // 1 minute expiry
            });

          if (!signalError) {
            signalsGenerated++;
            console.log(`  ✓ Generated ${newSignalType.toUpperCase()} signal for ${position.symbol} (${trend.higherTimeframeFilter?.divergenceType || 'aligned'})`);
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
