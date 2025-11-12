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
    const { signalId, action } = await req.json();
    console.log('Execute trade request:', { signalId, action });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const binanceApiKey = Deno.env.get('BINANCE_API_KEY');
    const binanceApiSecret = Deno.env.get('BINANCE_API_SECRET');

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get risk parameters
    const { data: riskParams } = await supabase
      .from('risk_parameters')
      .select('*')
      .single();

    if (!riskParams?.is_trading_enabled) {
      throw new Error('Trading is currently disabled');
    }

    const isPaperTrading = riskParams.paper_trading_mode ?? true;
    console.log('Paper trading mode:', isPaperTrading);

    if (!isPaperTrading && (!binanceApiKey || !binanceApiSecret)) {
      throw new Error('Binance API credentials not configured for live trading');
    }

    if (riskParams.current_open_trades >= riskParams.max_open_trades) {
      throw new Error(`Maximum open trades limit reached (${riskParams.max_open_trades})`);
    }

    // Get signal details
    const { data: signal } = await supabase
      .from('trading_signals')
      .select('*')
      .eq('id', signalId)
      .single();

    if (!signal) {
      throw new Error('Signal not found');
    }

    // Calculate position size based on risk parameters
    const riskAmount = (riskParams.portfolio_value * riskParams.max_risk_per_trade_percent) / 100;
    const stopLossDistance = Math.abs(signal.entry_price - signal.stop_loss);
    let quantity = riskAmount / stopLossDistance;

    // Apply position size reduction if consecutive losses
    if (riskParams.consecutive_losses >= riskParams.consecutive_loss_threshold) {
      quantity *= (1 - riskParams.position_size_reduction_percent / 100);
      console.log('Position size reduced due to consecutive losses');
    }

    // Round quantity to appropriate decimal places
    quantity = Math.floor(quantity * 1000) / 1000;

    const side = signal.signal_type === 'long' ? 'BUY' : 'SELL';
    let orderData: any;
    let executedPrice = signal.entry_price;

    if (isPaperTrading) {
      // Simulate paper trading
      console.log('Simulating trade execution (Paper Trading Mode)');
      orderData = {
        orderId: `PAPER_${Date.now()}`,
        status: 'FILLED',
        fills: [{ price: signal.entry_price.toString() }],
      };
    } else {
      // Execute real trade on Binance
      const timestamp = Date.now();
      const queryString = `symbol=${signal.symbol}&side=${side}&type=MARKET&quantity=${quantity}&timestamp=${timestamp}`;
      
      const encoder = new TextEncoder();
      const data = encoder.encode(queryString);
      const key = encoder.encode(binanceApiSecret!);
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        key,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const signature = await crypto.subtle.sign('HMAC', cryptoKey, data);
      const signatureHex = Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      const orderResponse = await fetch(
        `https://api.binance.com/api/v3/order?${queryString}&signature=${signatureHex}`,
        {
          method: 'POST',
          headers: {
            'X-MBX-APIKEY': binanceApiKey!,
          },
        }
      );

      if (!orderResponse.ok) {
        const errorText = await orderResponse.text();
        console.error('Binance API error:', errorText);
        throw new Error(`Failed to place order: ${errorText}`);
      }

      orderData = await orderResponse.json();
      console.log('Order executed:', orderData);
      executedPrice = parseFloat(orderData.fills?.[0]?.price || signal.entry_price);
    }

    // Create trade record
    const { data: trade, error: tradeError } = await supabase
      .from('trades')
      .insert({
        signal_id: signalId,
        symbol: signal.symbol,
        side,
        order_type: isPaperTrading ? 'PAPER' : 'MARKET',
        quantity,
        entry_price: executedPrice,
        stop_loss: signal.stop_loss,
        take_profit: signal.take_profit,
        status: 'open',
        binance_order_id: orderData.orderId?.toString(),
      })
      .select()
      .single();

    if (tradeError || !trade) {
      console.error('Failed to create trade record:', tradeError);
      throw new Error(`Failed to create trade record: ${tradeError?.message || 'Unknown error'}`);
    }

    // Create position record
    await supabase
      .from('positions')
      .insert({
        trade_id: trade.id,
        symbol: signal.symbol,
        side,
        quantity,
        entry_price: executedPrice,
        current_price: executedPrice,
        stop_loss: signal.stop_loss,
        take_profit: signal.take_profit,
        unrealized_pnl: 0,
        unrealized_pnl_percent: 0,
        status: 'active',
      });

    if (!isPaperTrading) {
      // Place stop-loss and take-profit orders only for live trading
      const encoder = new TextEncoder();
      const key = encoder.encode(binanceApiSecret!);
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        key,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );

      // Place stop-loss order
      const slQueryString = `symbol=${signal.symbol}&side=${side === 'BUY' ? 'SELL' : 'BUY'}&type=STOP_LOSS_LIMIT&quantity=${quantity}&price=${signal.stop_loss}&stopPrice=${signal.stop_loss}&timeInForce=GTC&timestamp=${Date.now()}`;
      const slData = encoder.encode(slQueryString);
      const slSignature = await crypto.subtle.sign('HMAC', cryptoKey, slData);
      const slSignatureHex = Array.from(new Uint8Array(slSignature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      await fetch(
        `https://api.binance.com/api/v3/order?${slQueryString}&signature=${slSignatureHex}`,
        {
          method: 'POST',
          headers: { 'X-MBX-APIKEY': binanceApiKey! },
        }
      );

      // Place take-profit order
      const tpQueryString = `symbol=${signal.symbol}&side=${side === 'BUY' ? 'SELL' : 'BUY'}&type=TAKE_PROFIT_LIMIT&quantity=${quantity}&price=${signal.take_profit}&stopPrice=${signal.take_profit}&timeInForce=GTC&timestamp=${Date.now()}`;
      const tpData = encoder.encode(tpQueryString);
      const tpSignature = await crypto.subtle.sign('HMAC', cryptoKey, tpData);
      const tpSignatureHex = Array.from(new Uint8Array(tpSignature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      await fetch(
        `https://api.binance.com/api/v3/order?${tpQueryString}&signature=${tpSignatureHex}`,
        {
          method: 'POST',
          headers: { 'X-MBX-APIKEY': binanceApiKey! },
        }
      );
    }

    // Update risk parameters
    await supabase
      .from('risk_parameters')
      .update({
        current_open_trades: riskParams.current_open_trades + 1,
      })
      .eq('id', riskParams.id);

    // Send notification
    try {
      await supabase.functions.invoke('send-notification', {
        body: {
          type: 'trade_executed',
          tradeId: trade.id,
          symbol: signal.symbol,
          side,
          price: executedPrice,
          quantity,
        },
      });
    } catch (notificationError) {
      console.error('Failed to send notification:', notificationError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        trade,
        message: `${side} order executed successfully${isPaperTrading ? ' (Paper Trading)' : ''}`,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error executing trade:', error);
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
