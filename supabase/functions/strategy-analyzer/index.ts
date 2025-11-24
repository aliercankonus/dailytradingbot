import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    // Calculate timestamp for 1 minute ago to match UI filter
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();

    // Fetch recent signals (last 1 minute) and open trades to avoid duplicates
    const { data: existingSignals } = await supabase
      .from('trading_signals')
      .select('symbol')
      .eq('user_id', user.id)
      .gte('created_at', oneMinuteAgo);

    const { data: openTrades } = await supabase
      .from('trades')
      .select('symbol')
      .eq('user_id', user.id)
      .eq('status', 'open');

    const existingSymbols = new Set([
      ...(existingSignals?.map(s => s.symbol) || []),
      ...(openTrades?.map(t => t.symbol) || [])
    ]);

    const signals = [];
    let totalSignalsGenerated = 0;
    let rejectedByDivergenceSettings = 0;

    // Analyze each symbol
    for (const { symbol } of symbols) {
      // Skip if already has signal or open trade
      if (existingSymbols.has(symbol)) {
        console.log(`Skipping ${symbol} - already has signal or open trade`);
        
        // Log rejection reason
        await supabase
          .from('signal_rejection_log')
          .insert({
            user_id: user.id,
            symbol,
            rejection_reason: 'Already has active signal or open trade',
            filters_status: null,
            trend_data: null,
            checked_at: new Date().toISOString()
          });
        continue;
      }

      try {
        // Get trend analysis
        const { data: trendData, error: trendError } = await supabase.functions.invoke('calculate-trend', {
          body: { symbol }
        });

        if (trendError || !trendData) {
          console.warn(`Failed to analyze ${symbol}:`, trendError);
          continue;
        }

        const { trend, confidence, trendConsistency, higherTimeframeFilter } = trendData;

        // Check if signal should be created based on divergence settings
        let shouldCreateSignal = false;
        let positionSizePercent = 100;
        let confidenceCap = 100;
        let signalReason = '';
        let rejectionReason = '';

        if (higherTimeframeFilter.aligned) {
          // Standard aligned signal
          const meetsThreshold = confidence >= riskParams.min_confidence_threshold &&
                                trendConsistency >= riskParams.min_trend_consistency;
          shouldCreateSignal = meetsThreshold;
          signalReason = `Aligned ${trend} trend across timeframes`;
          
          if (!meetsThreshold) {
            rejectionReason = confidence < riskParams.min_confidence_threshold 
              ? `Low confidence: ${confidence.toFixed(1)}% < ${riskParams.min_confidence_threshold}%`
              : `Low trend consistency: ${trendConsistency.toFixed(1)}% < ${riskParams.min_trend_consistency}%`;
          }
        } else if (higherTimeframeFilter.allowDivergenceSignal) {
          // Divergence opportunity signal
          const { divergenceType } = higherTimeframeFilter;
          
          if (divergenceType === 'pullback') {
            // Check if pullback signals are enabled
            if (riskParams.enable_pullback_signals) {
              // Multi-layer confirmation: require 30m and 15m to align with 4h
              const tf30m = trendData.timeframes?.['30m'];
              const tf15m = trendData.timeframes?.['15m'];
              const tf4h = trendData.timeframes?.['4h'];
              
              // Check trend alignment
              const trendAligned = tf30m && tf15m && tf4h && 
                  tf30m.trend === tf4h.trend && 
                  tf15m.trend === tf4h.trend;
              
              // Check momentum confirmation (require at least one timeframe with good momentum)
              const hasMomentumConfirmation = trendData.momentumConfirmed || false;
              
              if (trendAligned && hasMomentumConfirmation) {
                shouldCreateSignal = true;
                positionSizePercent = riskParams.pullback_position_size_percent || 50;
                confidenceCap = 70;
                signalReason = `Pullback opportunity with momentum: ${higherTimeframeFilter.divergenceDetails}`;
                totalSignalsGenerated++;
              } else if (trendAligned && !hasMomentumConfirmation) {
                rejectedByDivergenceSettings++;
                rejectionReason = `Pullback signal - momentum not confirmed (consecutive candles or MACD expansion missing)`;
                console.log(`Rejected pullback signal for ${symbol} - momentum not confirmed`);
              } else {
                rejectedByDivergenceSettings++;
                rejectionReason = `Pullback signal - 30m/15m confirmation failed (30m: ${tf30m?.trend}, 15m: ${tf15m?.trend}, need ${tf4h?.trend})`;
                console.log(`Rejected pullback signal for ${symbol} - 30m/15m confirmation failed`);
              }
            } else {
              rejectedByDivergenceSettings++;
              rejectionReason = 'Pullback signals disabled in risk settings';
              console.log(`Rejected pullback signal for ${symbol} - pullback signals disabled`);
            }
          } else if (divergenceType === 'early_reversal') {
            // Check if early reversal signals are enabled
            if (riskParams.enable_early_reversal_signals) {
              // Multi-layer confirmation: require 30m and 15m to align with 1h
              const tf30m = trendData.timeframes?.['30m'];
              const tf15m = trendData.timeframes?.['15m'];
              const tf1h = trendData.timeframes?.['1h'];
              
              // Check trend alignment
              const trendAligned = tf30m && tf15m && tf1h && 
                  tf30m.trend === tf1h.trend && 
                  tf15m.trend === tf1h.trend;
              
              // Check momentum confirmation (stricter for early reversals)
              const hasMomentumConfirmation = trendData.momentumConfirmed || false;
              
              if (trendAligned && hasMomentumConfirmation) {
                shouldCreateSignal = true;
                positionSizePercent = riskParams.early_reversal_position_size_percent || 40;
                confidenceCap = 65;
                signalReason = `Early reversal with strong momentum: ${higherTimeframeFilter.divergenceDetails}`;
                totalSignalsGenerated++;
              } else if (trendAligned && !hasMomentumConfirmation) {
                rejectedByDivergenceSettings++;
                rejectionReason = `Early reversal - momentum not confirmed (consecutive candles or MACD expansion missing)`;
                console.log(`Rejected early reversal signal for ${symbol} - momentum not confirmed`);
              } else {
                rejectedByDivergenceSettings++;
                rejectionReason = `Early reversal - 30m/15m confirmation failed (30m: ${tf30m?.trend}, 15m: ${tf15m?.trend}, need ${tf1h?.trend})`;
                console.log(`Rejected early reversal signal for ${symbol} - 30m/15m confirmation failed`);
              }
            } else {
              rejectedByDivergenceSettings++;
              rejectionReason = 'Early reversal signals disabled in risk settings';
              console.log(`Rejected early reversal signal for ${symbol} - early reversal signals disabled`);
            }
          }
        } else if (!higherTimeframeFilter.aligned && !higherTimeframeFilter.allowDivergenceSignal) {
          // Timeframes not aligned and no divergence opportunity
          rejectionReason = higherTimeframeFilter.divergenceDetails || 'Timeframes not aligned, no divergence opportunity';
        }

        // Log rejection if signal wasn't created
        if (!shouldCreateSignal && rejectionReason) {
          await supabase
            .from('signal_rejection_log')
            .insert({
              user_id: user.id,
              symbol,
              rejection_reason: rejectionReason,
              filters_status: {
                confidence,
                trendConsistency,
                minConfidence: riskParams.min_confidence_threshold,
                minTrendConsistency: riskParams.min_trend_consistency,
                pullbackEnabled: riskParams.enable_pullback_signals,
                earlyReversalEnabled: riskParams.enable_early_reversal_signals
              },
              trend_data: {
                trend,
                aligned: higherTimeframeFilter.aligned,
                divergenceType: higherTimeframeFilter.divergenceType,
                divergenceDetails: higherTimeframeFilter.divergenceDetails,
                timeframes: trendData.timeframes
              },
              checked_at: new Date().toISOString()
            });
          continue;
        }

        totalSignalsGenerated++;

        // Cap confidence based on signal type
        const finalConfidence = Math.min(confidence, confidenceCap);

        // Determine signal type based on trend
        const signalType = trend === 'bullish' ? 'long' : trend === 'bearish' ? 'short' : null;
        
        if (!signalType) {
          console.log(`Skipping ${symbol} - ranging market`);
          
          // Log rejection for ranging market
          await supabase
            .from('signal_rejection_log')
            .insert({
              user_id: user.id,
              symbol,
              rejection_reason: 'Ranging market - no clear directional trend',
              filters_status: { confidence, trendConsistency },
              trend_data: {
                trend,
                aligned: higherTimeframeFilter.aligned,
                timeframes: trendData.timeframes
              },
              checked_at: new Date().toISOString()
            });
          continue;
        }

        // Adjust stop loss and take profit for divergence signals (shorter timeframes)
        const isDivergenceSignal = higherTimeframeFilter.divergenceType;
        const stopLossPercent = isDivergenceSignal 
          ? riskParams.max_risk_per_trade_percent * (riskParams.divergence_sl_multiplier || 0.67)  // Use configured divergence SL multiplier
          : riskParams.max_risk_per_trade_percent;
        const takeProfitMultiplier = isDivergenceSignal 
          ? (riskParams.divergence_tp_multiplier || 2.0)  // Use configured divergence TP multiplier
          : (riskParams.standard_tp_multiplier || 2.5); // Use configured standard TP multiplier

        // Create signal
        const signal = {
          user_id: user.id,
          symbol,
          signal_type: signalType,
          trend,
          confidence_score: finalConfidence,
          entry_price: trendData.currentPrice,
          stop_loss: signalType === 'long'
            ? trendData.currentPrice * (1 - (stopLossPercent / 100))
            : trendData.currentPrice * (1 + (stopLossPercent / 100)),
          take_profit: signalType === 'long'
            ? trendData.currentPrice * (1 + (stopLossPercent * takeProfitMultiplier / 100))
            : trendData.currentPrice * (1 - (stopLossPercent * takeProfitMultiplier / 100)),
          strategy_name: 'Multi-Timeframe Analysis',
          reason: signalReason,
          indicators: {
            ...trendData.indicators,
            divergenceType: higherTimeframeFilter.divergenceType,
            positionSizePercent,
            trendConsistency,
            stopLossPercent,
            takeProfitMultiplier
          },
          expires_at: new Date(Date.now() + 60000).toISOString(), // 1 minute expiry
          created_by_rebalancer: false
        };

        const { data: insertedSignal, error: insertError } = await supabase
          .from('trading_signals')
          .insert(signal)
          .select('id')
          .single();

        if (insertError) {
          console.error(`Failed to insert signal for ${symbol}:`, insertError);
        } else if (insertedSignal) {
          signals.push({ ...signal, id: insertedSignal.id, positionSizePercent });
          console.log(`✓ Created ${signalType.toUpperCase()} signal for ${symbol} (${higherTimeframeFilter.divergenceType || 'aligned'})`);
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
              signalId: signal.id, // Use the captured signal ID
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
        rejectedByDivergenceSettings,
        executedSignals,
        autoExecuteEnabled: riskParams.auto_execute_signals
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
