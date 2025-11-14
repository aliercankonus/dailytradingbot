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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { positionId, closeAll, manualClose = false } = await req.json();
    console.log(`Close trade request by user ${user.id}:`, { positionId, closeAll, manualClose });

    let closedCount = 0;

    if (closeAll) {
      // Close all active positions for this user
      const { data: positions, error: fetchError } = await supabase
        .from('positions')
        .select('*')
        .eq('status', 'active')
        .eq('user_id', user.id);

      if (fetchError) throw fetchError;

      for (const position of positions || []) {
        await closePosition(supabase, position, manualClose);
        closedCount++;
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: `Closed ${closedCount} positions`,
          closedCount
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // Close single position for this user
      const { data: position, error: fetchError } = await supabase
        .from('positions')
        .select('*')
        .eq('id', positionId)
        .eq('status', 'active')
        .eq('user_id', user.id)
        .single();

      if (fetchError) throw fetchError;
      if (!position) throw new Error('Position not found or already closed');

      await closePosition(supabase, position, manualClose);

      return new Response(
        JSON.stringify({
          success: true,
          message: `Position closed for ${position.symbol}`,
          position
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('Error closing trade:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});

async function closePosition(supabase: any, position: any, manualClose: boolean = false) {
  const currentPrice = position.current_price || position.entry_price;
  const pnl = position.unrealized_pnl || 0;
  const pnlPercent = position.unrealized_pnl_percent || 0;

  // Determine status based on whether it's manual or system close
  const tradeStatus = manualClose ? 'closed' : 'complete';

  // Update position to closed
  await supabase
    .from('positions')
    .update({ status: 'closed' })
    .eq('id', position.id);

  // Update trade record
  await supabase
    .from('trades')
    .update({
      exit_price: currentPrice,
      profit_loss: pnl,
      profit_loss_percent: pnlPercent,
      status: tradeStatus,
      closed_at: new Date().toISOString()
    })
    .eq('id', position.trade_id);

  // Update risk parameters for this user - sync with actual active positions
  const { count: activeCount } = await supabase
    .from('positions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', position.user_id)
    .eq('status', 'active');

  await supabase
    .from('risk_parameters')
    .update({
      current_open_trades: activeCount || 0
    })
    .eq('user_id', position.user_id);

  console.log(`Closed position ${position.id} for ${position.symbol} with P&L: $${pnl.toFixed(2)}`);
}
