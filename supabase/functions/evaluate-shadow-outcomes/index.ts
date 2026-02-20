import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ShadowSignal {
  id: string;
  symbol: string;
  signal_type: string;
  entry_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  created_at: string;
  new_position_multiplier: number | null;
  gate_details: Record<string, unknown> | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // Fetch pending shadow signals that have entry_price and SL/TP
    const { data: signals, error: fetchErr } = await supabase
      .from('shadow_mode_signals')
      .select('id, symbol, signal_type, entry_price, stop_loss, take_profit, created_at, new_position_multiplier, gate_details')
      .eq('outcome_tracked', false)
      .not('entry_price', 'is', null)
      .not('stop_loss', 'is', null)
      .not('take_profit', 'is', null)
      .order('created_at', { ascending: true })
      .limit(200);

    if (fetchErr) {
      console.error('Failed to fetch shadow signals:', fetchErr.message);
      return new Response(JSON.stringify({ error: fetchErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!signals || signals.length === 0) {
      console.log('No pending shadow signals to evaluate');
      return new Response(JSON.stringify({ evaluated: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Group by symbol to batch price fetches
    const symbolSet = new Set(signals.map((s: ShadowSignal) => s.symbol));
    const currentPrices: Record<string, number> = {};

    // Fetch current prices from Binance
    for (const sym of symbolSet) {
      try {
        const resp = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${sym}`);
        if (resp.ok) {
          const data = await resp.json();
          currentPrices[sym] = parseFloat(data.price);
        }
      } catch (e) {
        console.warn(`Price fetch failed for ${sym}: ${e}`);
      }
    }

    let evaluated = 0;
    let won = 0;
    let lost = 0;
    let skipped = 0;

    for (const signal of signals as ShadowSignal[]) {
      const currentPrice = currentPrices[signal.symbol];
      if (!currentPrice || !signal.entry_price || !signal.stop_loss || !signal.take_profit) {
        skipped++;
        continue;
      }

      const entry = signal.entry_price;
      const sl = signal.stop_loss;
      const tp = signal.take_profit;
      const isLong = signal.signal_type === 'long';

      // Check if TP or SL would have been hit
      // For simplicity: compare current price against SL/TP levels
      // In a real scenario we'd check the price path (high/low wicks), 
      // but current price vs levels gives a reasonable approximation
      let wouldHaveWon: boolean | null = null;
      let pnlPercent: number | null = null;

      if (isLong) {
        if (currentPrice >= tp) {
          wouldHaveWon = true;
          pnlPercent = ((tp - entry) / entry) * 100;
        } else if (currentPrice <= sl) {
          wouldHaveWon = false;
          pnlPercent = ((sl - entry) / entry) * 100;
        } else {
          // Signal is still "in play" — check if it's old enough to evaluate
          const ageHours = (Date.now() - new Date(signal.created_at).getTime()) / (1000 * 60 * 60);
          if (ageHours >= 24) {
            // After 24h, evaluate at current price (time-based exit)
            pnlPercent = ((currentPrice - entry) / entry) * 100;
            wouldHaveWon = pnlPercent > 0;
          } else {
            skipped++;
            continue; // Too early to evaluate
          }
        }
      } else {
        // Short
        if (currentPrice <= tp) {
          wouldHaveWon = true;
          pnlPercent = ((entry - tp) / entry) * 100;
        } else if (currentPrice >= sl) {
          wouldHaveWon = false;
          pnlPercent = ((entry - sl) / entry) * 100;
        } else {
          const ageHours = (Date.now() - new Date(signal.created_at).getTime()) / (1000 * 60 * 60);
          if (ageHours >= 24) {
            pnlPercent = ((entry - currentPrice) / entry) * 100;
            wouldHaveWon = pnlPercent > 0;
          } else {
            skipped++;
            continue;
          }
        }
      }

      // Update the signal
      const { error: updateErr } = await supabase
        .from('shadow_mode_signals')
        .update({
          outcome_tracked: true,
          would_have_won: wouldHaveWon,
          simulated_pnl_percent: Number(pnlPercent!.toFixed(4)),
          outcome_notes: `Evaluated at $${currentPrice.toFixed(4)} | ${wouldHaveWon ? 'WIN' : 'LOSS'} | PnL: ${pnlPercent!.toFixed(2)}% | Method: ${currentPrice >= tp || currentPrice <= sl || currentPrice <= tp || currentPrice >= sl ? 'SL/TP hit' : '24h time exit'}`,
        })
        .eq('id', signal.id);

      if (updateErr) {
        console.warn(`Failed to update signal ${signal.id}: ${updateErr.message}`);
      } else {
        evaluated++;
        if (wouldHaveWon) won++;
        else lost++;
      }
    }

    const summary = {
      evaluated,
      won,
      lost,
      skipped,
      total: signals.length,
      winRate: evaluated > 0 ? ((won / evaluated) * 100).toFixed(1) + '%' : 'N/A',
    };

    console.log(`📊 Shadow outcome evaluation: ${JSON.stringify(summary)}`);

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Shadow outcome evaluation error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
