import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.84.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/**
 * Evaluate Oversold Event Study
 * 
 * Measures forward returns (6h/12h/24h) + MAE/MFE for each pending event.
 * Uses Binance REST API to get historical klines for the measurement windows.
 * Scheduled via cron every hour.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Fetch all unevaluated events that are at least 24h old
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const { data: pendingEvents, error: fetchError } = await supabase
      .from('oversold_event_study')
      .select('*')
      .eq('evaluated', false)
      .lte('event_time', cutoff24h)
      .limit(50);

    if (fetchError) {
      throw new Error(`Failed to fetch pending events: ${fetchError.message}`);
    }

    if (!pendingEvents || pendingEvents.length === 0) {
      return new Response(JSON.stringify({ 
        message: 'No pending events to evaluate',
        evaluated: 0 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`📊 OVERSOLD_EVAL: Processing ${pendingEvents.length} pending events`);

    let evaluated = 0;
    let errors = 0;

    for (const event of pendingEvents) {
      try {
        const eventTime = new Date(event.event_time).getTime();
        const symbol = event.symbol;
        const entryPrice = event.price;

        // Fetch 5m klines from event_time to event_time + 24h
        const startTime = eventTime;
        const endTime = eventTime + 24 * 60 * 60 * 1000;
        
        const klineUrl = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=5m&startTime=${startTime}&endTime=${endTime}&limit=288`;
        
        const resp = await fetch(klineUrl);
        if (!resp.ok) {
          console.warn(`⚠️ Binance API error for ${symbol}: ${resp.status}`);
          errors++;
          continue;
        }

        const klines = await resp.json();
        if (!klines || klines.length < 12) {
          console.warn(`⚠️ Insufficient klines for ${symbol}: ${klines?.length ?? 0}`);
          errors++;
          continue;
        }

        // Calculate forward returns at 6h, 12h, 24h windows
        // Each 5m candle = 5 minutes, so 6h = 72 candles, 12h = 144, 24h = 288
        const getReturnAtIndex = (idx: number): number | null => {
          if (idx >= klines.length) return null;
          const closePrice = parseFloat(klines[idx][4]);
          return ((closePrice - entryPrice) / entryPrice) * 100;
        };

        const ret6h = getReturnAtIndex(Math.min(71, klines.length - 1));
        const ret12h = getReturnAtIndex(Math.min(143, klines.length - 1));
        const ret24h = getReturnAtIndex(Math.min(287, klines.length - 1));

        // Calculate MAE (Max Adverse Excursion) and MFE (Max Favorable Excursion)
        // For a hypothetical LONG probe:
        // MAE = worst drawdown from entry (negative)
        // MFE = best upside from entry (positive)
        let mae = 0;
        let mfe = 0;

        for (const kline of klines) {
          const low = parseFloat(kline[3]);
          const high = parseFloat(kline[2]);
          
          const lowReturn = ((low - entryPrice) / entryPrice) * 100;
          const highReturn = ((high - entryPrice) / entryPrice) * 100;
          
          mae = Math.min(mae, lowReturn);
          mfe = Math.max(mfe, highReturn);
        }

        // Evaluate shadow trade outcome
        const shadowSL = event.shadow_sl;
        const shadowTP = event.shadow_tp;
        let shadowOutcome = 'OPEN';
        let shadowPnl = ret24h ?? 0;

        // Check if SL or TP was hit during the window
        for (const kline of klines) {
          const low = parseFloat(kline[3]);
          const high = parseFloat(kline[2]);
          
          if (shadowSL && low <= shadowSL) {
            shadowOutcome = 'SL_HIT';
            shadowPnl = ((shadowSL - entryPrice) / entryPrice) * 100;
            break;
          }
          if (shadowTP && high >= shadowTP) {
            shadowOutcome = 'TP_HIT';
            shadowPnl = ((shadowTP - entryPrice) / entryPrice) * 100;
            break;
          }
        }

        if (shadowOutcome === 'OPEN') {
          shadowOutcome = 'TIME_EXIT_24H';
        }

        // Update the event with results
        const { error: updateError } = await supabase
          .from('oversold_event_study')
          .update({
            ret_6h: ret6h,
            ret_12h: ret12h,
            ret_24h: ret24h,
            mae,
            mfe,
            shadow_exit_reason: shadowOutcome,
            shadow_pnl_percent: shadowPnl,
            evaluated_at: new Date().toISOString(),
            evaluated: true,
          })
          .eq('id', event.id);

        if (updateError) {
          console.warn(`⚠️ Failed to update event ${event.id}: ${updateError.message}`);
          errors++;
        } else {
          evaluated++;
          console.log(`📊 OVERSOLD_EVAL: ${symbol} K=${event.stoch_k} | ret6h=${ret6h?.toFixed(2)}% ret12h=${ret12h?.toFixed(2)}% ret24h=${ret24h?.toFixed(2)}% | MAE=${mae.toFixed(2)}% MFE=${mfe.toFixed(2)}% | shadow=${shadowOutcome} pnl=${shadowPnl.toFixed(2)}%`);
        }
      } catch (e) {
        console.warn(`⚠️ Error evaluating event ${event.id}: ${e}`);
        errors++;
      }
    }

    const result = {
      message: `Evaluated ${evaluated} oversold events`,
      evaluated,
      errors,
      total_pending: pendingEvents.length,
    };

    console.log(`📊 OVERSOLD_EVAL: Complete — ${evaluated} evaluated, ${errors} errors`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error(`❌ OVERSOLD_EVAL error: ${error}`);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
