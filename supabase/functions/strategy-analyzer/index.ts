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

    // Fetch existing signals and open trades to avoid duplicates
    const { data: existingSignals } = await supabase
      .from('trading_signals')
      .select('symbol')
      .eq('user_id', user.id)
      .gte('expires_at', new Date().toISOString());

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

        if (higherTimeframeFilter.aligned) {
          // Standard aligned signal
          shouldCreateSignal = confidence >= riskParams.min_confidence_threshold &&
                              trendConsistency >= riskParams.min_trend_consistency;
          signalReason = `Aligned ${trend} trend across timeframes`;
        } else if (higherTimeframeFilter.allowDivergenceSignal) {
          // Divergence opportunity signal
          const { divergenceType } = higherTimeframeFilter;
          
          if (divergenceType === 'pullback') {
            // Check if pullback signals are enabled
            if (riskParams.enable_pullback_signals) {
              shouldCreateSignal = true;
              positionSizePercent = riskParams.pullback_position_size_percent || 50;
              confidenceCap = 70;
              signalReason = `Pullback opportunity: ${higherTimeframeFilter.divergenceDetails}`;
              totalSignalsGenerated++;
            } else {
              rejectedByDivergenceSettings++;
              console.log(`Rejected pullback signal for ${symbol} - pullback signals disabled`);
            }
          } else if (divergenceType === 'early_reversal') {
            // Check if early reversal signals are enabled
            if (riskParams.enable_early_reversal_signals) {
              shouldCreateSignal = true;
              positionSizePercent = riskParams.early_reversal_position_size_percent || 40;
              confidenceCap = 65;
              signalReason = `Early reversal opportunity: ${higherTimeframeFilter.divergenceDetails}`;
              totalSignalsGenerated++;
            } else {
              rejectedByDivergenceSettings++;
              console.log(`Rejected early reversal signal for ${symbol} - early reversal signals disabled`);
            }
          }
        }

        if (!shouldCreateSignal) {
          continue;
        }

        totalSignalsGenerated++;

        // Cap confidence based on signal type
        const finalConfidence = Math.min(confidence, confidenceCap);

        // Determine signal type based on trend
        const signalType = trend === 'bullish' ? 'long' : trend === 'bearish' ? 'short' : null;
        
        if (!signalType) {
          console.log(`Skipping ${symbol} - ranging market`);
          continue;
        }

        // Create signal
        const signal = {
          user_id: user.id,
          symbol,
          signal_type: signalType,
          trend,
          confidence_score: finalConfidence,
          entry_price: trendData.currentPrice,
          stop_loss: signalType === 'long'
            ? trendData.currentPrice * (1 - (riskParams.max_risk_per_trade_percent / 100))
            : trendData.currentPrice * (1 + (riskParams.max_risk_per_trade_percent / 100)),
          take_profit: signalType === 'long'
            ? trendData.currentPrice * (1 + (riskParams.max_risk_per_trade_percent * 2.5 / 100))
            : trendData.currentPrice * (1 - (riskParams.max_risk_per_trade_percent * 2.5 / 100)),
          strategy_name: 'Multi-Timeframe Analysis',
          reason: signalReason,
          indicators: {
            ...trendData.indicators,
            divergenceType: higherTimeframeFilter.divergenceType,
            positionSizePercent,
            trendConsistency
          },
          expires_at: new Date(Date.now() + 3600000).toISOString(), // 1 hour expiry
          created_by_rebalancer: false
        };

        const { error: insertError } = await supabase
          .from('trading_signals')
          .insert(signal);

        if (insertError) {
          console.error(`Failed to insert signal for ${symbol}:`, insertError);
        } else {
          signals.push({ ...signal, positionSizePercent });
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
            body: {
              signalId: (await supabase
                .from('trading_signals')
                .select('id')
                .eq('user_id', user.id)
                .eq('symbol', signal.symbol)
                .single()).data?.id,
              action: 'execute'
            }
          });

          if (!executeError) {
            executedSignals++;
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
