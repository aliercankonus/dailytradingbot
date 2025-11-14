import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Monitoring positions...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all active positions
    const { data: positions } = await supabase
      .from('positions')
      .select('*, trades(*)')
      .eq('status', 'active');

    if (!positions || positions.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No active positions to monitor' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch current prices for all symbols
    const symbols = [...new Set(positions.map(p => p.symbol))];
    const pricePromises = symbols.map(async (symbol) => {
      const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
      const data = await response.json();
      return { symbol, price: parseFloat(data.price) };
    });

    const prices = await Promise.all(pricePromises);
    const priceMap = new Map(prices.map(p => [p.symbol, p.price]));

    const updates = [];
    const closedPositions = [];

    for (const position of positions) {
      const currentPrice = priceMap.get(position.symbol);
      if (!currentPrice) continue;

      const pnl = position.side === 'BUY'
        ? (currentPrice - position.entry_price) * position.quantity
        : (position.entry_price - currentPrice) * position.quantity;

      const pnlPercent = position.side === 'BUY'
        ? ((currentPrice - position.entry_price) / position.entry_price) * 100
        : ((position.entry_price - currentPrice) / position.entry_price) * 100;

      // Check if take profit or stop loss is hit
      let shouldClose = false;
      let closeReason = '';

      if (position.side === 'BUY') {
        // For LONG positions: TP when price goes UP, SL when price goes DOWN
        if (position.take_profit && currentPrice >= position.take_profit) {
          shouldClose = true;
          closeReason = 'take_profit';
        } else if (position.stop_loss && currentPrice <= position.stop_loss) {
          shouldClose = true;
          closeReason = 'stop_loss';
        }
      } else {
        // For SHORT positions: TP when price goes DOWN, SL when price goes UP
        if (position.take_profit && currentPrice <= position.take_profit) {
          shouldClose = true;
          closeReason = 'take_profit';
        } else if (position.stop_loss && currentPrice >= position.stop_loss) {
          shouldClose = true;
          closeReason = 'stop_loss';
        }
      }

      if (shouldClose) {
        // Close the position
        await supabase
          .from('positions')
          .update({
            status: 'closed',
            current_price: currentPrice,
            unrealized_pnl: pnl,
            unrealized_pnl_percent: pnlPercent,
          })
          .eq('id', position.id);

        // Close the associated trade
        await supabase
          .from('trades')
          .update({
            status: 'closed',
            exit_price: currentPrice,
            profit_loss: pnl,
            profit_loss_percent: pnlPercent,
            closed_at: new Date().toISOString(),
          })
          .eq('id', position.trade_id);

        closedPositions.push({
          symbol: position.symbol,
          side: position.side,
          reason: closeReason,
          exitPrice: currentPrice,
          pnl,
          pnlPercent,
        });

        console.log(`Closed position ${position.id} - ${position.symbol} ${position.side} - ${closeReason} at ${currentPrice}`);
      } else {
        // Update position with current price and PnL
        await supabase
          .from('positions')
          .update({
            current_price: currentPrice,
            unrealized_pnl: pnl,
            unrealized_pnl_percent: pnlPercent,
          })
          .eq('id', position.id);
      }

      updates.push({
        symbol: position.symbol,
        currentPrice,
        pnl,
        pnlPercent,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        updates,
        closedPositions,
        message: `Updated ${updates.length} positions, closed ${closedPositions.length} positions`,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error monitoring positions:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});