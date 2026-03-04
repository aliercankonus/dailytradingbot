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

// ===== SPECULATIVE TIER TIME STOP =====
// 18-20 ADX band has only 24% expansion transition rate.
// If no expansion within 8 bars (~2h on 15m TF), exit as TIME_STOP.
const SPECULATIVE_TIME_STOP_HOURS = 8; // ~8 bars × 15m = 2h, or 8 bars × 1h = 8h
const SPECULATIVE_MAX_AGE_HOURS = 8;   // Conservative: exit after 8h if no expansion

function getIgnitionTier(gateDetails: Record<string, unknown> | null): string | null {
  if (!gateDetails) return null;
  // Check nested ignitionAudit first
  const audit = gateDetails.ignitionAudit as Record<string, unknown> | undefined;
  if (audit?.ignitionTier) return audit.ignitionTier as string;
  // Check direct ignitionTier field
  if (gateDetails.ignitionTier) return gateDetails.ignitionTier as string;
  // Check gate name
  if (gateDetails.gate === 'BREAKOUT_IGNITION_MOMENTUM_BYPASS' || gateDetails.gate === 'BREAKOUT_MICRO_PROBE') {
    return (gateDetails.tierLabel as string) || (gateDetails.gate === 'BREAKOUT_MICRO_PROBE' ? 'MICRO_PROBE' : null);
  }
  return null;
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

    // ===== Check regime state for SPECULATIVE time stop =====
    // Fetch latest regime for each symbol to determine if expansion was reached
    const regimeMap: Record<string, string> = {};
    for (const sym of symbolSet) {
      try {
        const { data: regimeData } = await supabase
          .from('market_regime_history')
          .select('effective_regime')
          .eq('symbol', sym)
          .order('recorded_at', { ascending: false })
          .limit(1);
        if (regimeData && regimeData.length > 0) {
          regimeMap[sym] = regimeData[0].effective_regime || 'UNKNOWN';
        }
      } catch (_) { /* ignore */ }
    }

    let evaluated = 0;
    let won = 0;
    let lost = 0;
    let skipped = 0;
    const tierStats: Record<string, { count: number; won: number; lost: number; pnlSum: number }> = {};

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
      const ignitionTier = getIgnitionTier(signal.gate_details);
      const ageHours = (Date.now() - new Date(signal.created_at).getTime()) / (1000 * 60 * 60);
      const currentRegime = regimeMap[signal.symbol] || 'UNKNOWN';

      let wouldHaveWon: boolean | null = null;
      let pnlPercent: number | null = null;
      let exitMethod = '';

      // Check SL/TP hit
      if (isLong) {
        if (currentPrice >= tp) {
          wouldHaveWon = true;
          pnlPercent = ((tp - entry) / entry) * 100;
          exitMethod = 'TP_HIT';
        } else if (currentPrice <= sl) {
          wouldHaveWon = false;
          pnlPercent = ((sl - entry) / entry) * 100;
          exitMethod = 'SL_HIT';
        }
      } else {
        if (currentPrice <= tp) {
          wouldHaveWon = true;
          pnlPercent = ((entry - tp) / entry) * 100;
          exitMethod = 'TP_HIT';
        } else if (currentPrice >= sl) {
          wouldHaveWon = false;
          pnlPercent = ((entry - sl) / entry) * 100;
          exitMethod = 'SL_HIT';
        }
      }

      // ===== SPECULATIVE TIER TIME STOP =====
      // If tier is SPECULATIVE and no TP/SL hit after 8h, and regime hasn't expanded → time exit
      if (wouldHaveWon === null && ignitionTier === 'SPECULATIVE' && ageHours >= SPECULATIVE_MAX_AGE_HOURS) {
        if (currentRegime !== 'TREND_EXPANSION') {
          pnlPercent = isLong
            ? ((currentPrice - entry) / entry) * 100
            : ((entry - currentPrice) / entry) * 100;
          wouldHaveWon = pnlPercent > 0;
          exitMethod = 'TIME_STOP_SPECULATIVE';
        }
      }

      // ===== MICRO_PROBE TIER TIME STOP (more aggressive: 6h) =====
      if (wouldHaveWon === null && ignitionTier === 'MICRO_PROBE' && ageHours >= 6) {
        pnlPercent = isLong
          ? ((currentPrice - entry) / entry) * 100
          : ((entry - currentPrice) / entry) * 100;
        wouldHaveWon = pnlPercent > 0;
        exitMethod = 'TIME_STOP_MICRO_PROBE';
      }

      // Standard 24h time exit for all other tiers
      if (wouldHaveWon === null) {
        if (ageHours >= 24) {
          pnlPercent = isLong
            ? ((currentPrice - entry) / entry) * 100
            : ((entry - currentPrice) / entry) * 100;
          wouldHaveWon = pnlPercent > 0;
          exitMethod = 'TIME_EXIT_24H';
        } else {
          skipped++;
          continue;
        }
      }

      // Track tier-level stats
      if (ignitionTier) {
        if (!tierStats[ignitionTier]) {
          tierStats[ignitionTier] = { count: 0, won: 0, lost: 0, pnlSum: 0 };
        }
        tierStats[ignitionTier].count++;
        if (wouldHaveWon) tierStats[ignitionTier].won++;
        else tierStats[ignitionTier].lost++;
        tierStats[ignitionTier].pnlSum += pnlPercent!;
      }

      // Build enriched outcome notes
      const tierInfo = ignitionTier ? ` | Tier: ${ignitionTier}` : '';
      const regimeInfo = ` | Regime: ${currentRegime}`;
      const adxInfo = signal.gate_details?.adxAtEntry
        ? ` | ADX@entry: ${signal.gate_details.adxAtEntry}`
        : (signal.gate_details as any)?.ignitionAudit?.adxAtEntry
          ? ` | ADX@entry: ${(signal.gate_details as any).ignitionAudit.adxAtEntry}`
          : '';

      // Update the signal
      const { error: updateErr } = await supabase
        .from('shadow_mode_signals')
        .update({
          outcome_tracked: true,
          would_have_won: wouldHaveWon,
          simulated_pnl_percent: Number(pnlPercent!.toFixed(4)),
          outcome_notes: `${exitMethod} at $${currentPrice.toFixed(4)} | ${wouldHaveWon ? 'WIN' : 'LOSS'} | PnL: ${pnlPercent!.toFixed(2)}%${tierInfo}${regimeInfo}${adxInfo}`,
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
      tierStats,
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