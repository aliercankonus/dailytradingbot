import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.84.0";
import { fetchKlines } from "../_shared/binance.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Intervals to pre-cache (used by strategy-analyzer)
const CACHE_INTERVALS = [
  { interval: '15m', limit: 200 },
  { interval: '30m', limit: 200 },
  { interval: '1h', limit: 200 },
  { interval: '4h', limit: 200 },
];

const MAX_CONCURRENT = 3;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = performance.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Get all active symbols across all users
    const { data: symbolConfigs } = await supabase
      .from('trading_symbols_config')
      .select('symbol')
      .eq('is_active', true);

    if (!symbolConfigs || symbolConfigs.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No active symbols' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Deduplicate symbols
    const symbols = [...new Set(symbolConfigs.map(s => s.symbol))];
    console.log(`[kline-collector] Collecting klines for ${symbols.length} symbols × ${CACHE_INTERVALS.length} intervals`);

    // Build all fetch tasks
    const tasks: Array<{ symbol: string; interval: string; limit: number }> = [];
    for (const symbol of symbols) {
      for (const { interval, limit } of CACHE_INTERVALS) {
        tasks.push({ symbol, interval, limit });
      }
    }

    // Execute with bounded concurrency
    let successCount = 0;
    let errorCount = 0;

    const executeTask = async (task: typeof tasks[0]) => {
      try {
        const klines = await fetchKlines(task.symbol, task.interval, task.limit);
        
        if (klines && klines.length > 0) {
          // Upsert into kline_cache
          const { error } = await supabase
            .from('kline_cache')
            .upsert({
              symbol: task.symbol,
              interval: task.interval,
              candles: klines,
              candle_count: klines.length,
              source: 'rest_collector',
              updated_at: new Date().toISOString(),
            }, {
              onConflict: 'symbol,interval',
            });

          if (error) {
            console.error(`[kline-collector] DB upsert error ${task.symbol}/${task.interval}: ${error.message}`);
            errorCount++;
          } else {
            successCount++;
          }
        }
      } catch (err) {
        console.warn(`[kline-collector] Fetch error ${task.symbol}/${task.interval}: ${err}`);
        errorCount++;
      }
    };

    // Process in batches of MAX_CONCURRENT
    for (let i = 0; i < tasks.length; i += MAX_CONCURRENT) {
      const batch = tasks.slice(i, i + MAX_CONCURRENT);
      await Promise.all(batch.map(executeTask));
    }

    const elapsed = Math.round(performance.now() - startTime);
    console.log(`[kline-collector] ✅ Done in ${elapsed}ms: ${successCount} cached, ${errorCount} errors (${symbols.length} symbols × ${CACHE_INTERVALS.length} intervals)`);

    // Log metrics
    await supabase.from('function_metrics').insert({
      function_name: 'kline-collector',
      duration_ms: elapsed,
      success: errorCount === 0,
      symbols_count: symbols.length,
      phase_timings: {
        totalTasks: tasks.length,
        successCount,
        errorCount,
        intervals: CACHE_INTERVALS.map(i => i.interval),
      },
    });

    return new Response(JSON.stringify({
      success: true,
      elapsed_ms: elapsed,
      symbols: symbols.length,
      cached: successCount,
      errors: errorCount,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error(`[kline-collector] Fatal error: ${error}`);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
