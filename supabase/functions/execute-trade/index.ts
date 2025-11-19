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

    // Check for service-level user ID (from auto-trader)
    const serviceUserId = req.headers.get("x-user-id");
    let user;

    if (serviceUserId) {
      // Service-level call from auto-trader
      const { data: userData, error: userError } = await supabase.auth.admin.getUserById(serviceUserId);
      
      if (userError || !userData.user) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Invalid service user ID",
          }),
          {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
      
      user = userData.user;
      console.log(`Execute trade called by auto-trader for user: ${user.id}`);
    } else {
      // Regular authenticated call from frontend
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        throw new Error('No authorization header');
      }

      const token = authHeader.replace('Bearer ', '');
      const { data: { user: authenticatedUser }, error: userError } = await supabase.auth.getUser(token);
      if (userError || !authenticatedUser) {
        throw new Error('Unauthorized');
      }
      
      user = authenticatedUser;
      console.log(`Execute trade called by user: ${user.id}`);
    }

    const { signalId, action } = await req.json();
    console.log('Execute trade request:', { signalId, action, userId: user.id });

    const binanceApiKey = Deno.env.get('BINANCE_API_KEY');
    const binanceApiSecret = Deno.env.get('BINANCE_API_SECRET');

    // Get risk parameters for the user
    const { data: riskParams } = await supabase
      .from('risk_parameters')
      .select('*')
      .eq('user_id', user.id)
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

    // ============================================================
    // NEW: DAILY LOSS CIRCUIT BREAKER
    // ============================================================
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const lastResetDate = riskParams.last_loss_reset_date;
    let currentDailyLoss = riskParams.daily_realized_loss || 0;

    // Reset daily loss counter if it's a new day
    if (!lastResetDate || lastResetDate !== today) {
      console.log(`Resetting daily loss counter (last reset: ${lastResetDate}, today: ${today})`);
      await supabase
        .from('risk_parameters')
        .update({
          daily_realized_loss: 0,
          last_loss_reset_date: today
        })
        .eq('user_id', user.id);
      currentDailyLoss = 0;
    }

    // Check circuit breaker: Stop trading if daily loss limit exceeded
    const dailyLossPercent = (currentDailyLoss / riskParams.portfolio_value) * 100;
    if (dailyLossPercent >= riskParams.daily_loss_limit_percent) {
      console.error(`❌ CIRCUIT BREAKER TRIGGERED: Daily loss ${dailyLossPercent.toFixed(2)}% >= limit ${riskParams.daily_loss_limit_percent}%`);
      throw new Error(`Daily loss limit reached (${dailyLossPercent.toFixed(2)}% of ${riskParams.daily_loss_limit_percent}%). Trading halted for today.`);
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

    console.log(`Executing trade for signal from strategy: ${signal.strategy_name || 'Unknown'}`);

    // ============================================================
    // NEW: PER-SYMBOL POSITION LIMIT CHECK
    // ============================================================
    const { data: existingPositions, error: positionsError } = await supabase
      .from('positions')
      .select('id, symbol, side')
      .eq('user_id', user.id)
      .eq('symbol', signal.symbol)
      .eq('status', 'active');

    if (positionsError) {
      console.error('Error checking existing positions:', positionsError);
      throw new Error('Failed to check existing positions');
    }

    const openPositionsForSymbol = existingPositions?.length || 0;
    const maxPerSymbol = riskParams.max_trades_per_symbol || 1;

    if (openPositionsForSymbol >= maxPerSymbol) {
      console.error(`❌ SYMBOL LIMIT: ${signal.symbol} already has ${openPositionsForSymbol} open position(s), max is ${maxPerSymbol}`);
      throw new Error(`Maximum ${maxPerSymbol} position(s) per symbol. ${signal.symbol} already has ${openPositionsForSymbol} open.`);
    }

    console.log(`✓ Symbol check passed: ${signal.symbol} has ${openPositionsForSymbol}/${maxPerSymbol} positions`);

    // Get real-time trend analysis before executing trade
    const { data: trendData, error: trendError } = await supabase.functions.invoke('calculate-trend', {
      body: { symbol: signal.symbol }
    });

    if (trendError) {
      console.warn('Failed to get current trend, using signal trend:', trendError);
    }

    const currentTrend = trendData?.trend || signal.trend;
    const trendConsistency = trendData?.trendConsistency || 0;
    const atrPercent = trendData?.atrPercent || 1.5;
    
    console.log(`Current market trend: ${currentTrend}, Consistency: ${trendConsistency}, ATR: ${atrPercent}%, Signal: ${signal.signal_type}`);

    // FILTER 1: Validate trend matches signal direction
    const signalDirection = signal.signal_type === 'long' ? 'BUY' : 'SELL';
    if (currentTrend === 'bullish' && signalDirection === 'SELL') {
      throw new Error('Market trend is bullish but signal is SHORT - trade cancelled');
    }
    if (currentTrend === 'bearish' && signalDirection === 'BUY') {
      throw new Error('Market trend is bearish but signal is LONG - trade cancelled');
    }

    // FILTER 2: Require trend consistency (configurable threshold)
    const minTrendConsistency = riskParams.min_trend_consistency || 50;
    if (trendConsistency < minTrendConsistency) {
      throw new Error(`Trend not consistent enough (${trendConsistency.toFixed(0)}%) - minimum required: ${minTrendConsistency}%`);
    }

    // FILTER 3: Skip ranging markets for BUY/SELL signals
    if (currentTrend === 'ranging') {
      throw new Error('Market is ranging - trade cancelled to avoid choppy conditions');
    }

    // FILTER 4: Avoid high volatility (ATR > 3%)
    if (atrPercent > 3) {
      throw new Error(`Market volatility too high (ATR: ${atrPercent.toFixed(2)}%) - trade cancelled`);
    }

    // FILTER 5: Require confidence > configurable threshold
    const minConfidence = riskParams.min_confidence_threshold || 60;
    if ((signal.confidence_score || 0) < minConfidence) {
      throw new Error(`Signal confidence too low (${signal.confidence_score}%) - minimum required: ${minConfidence}%`);
    }

    // Get current price for ATR-based stop loss calculation
    const priceResponse = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${signal.symbol}`);
    const priceData = await priceResponse.json();
    const currentPrice = parseFloat(priceData.price);

    // Use strategy's configured stop loss and take profit from signal
    const stopLoss = signal.stop_loss;
    const takeProfit = signal.take_profit;

    console.log(`Using strategy SL: ${stopLoss.toFixed(2)}, TP: ${takeProfit.toFixed(2)} (from strategy configuration)`);

    // Calculate position size based on strategy's stop loss
    const riskAmount = (riskParams.portfolio_value * riskParams.max_risk_per_trade_percent) / 100;
    const stopLossDistance = Math.abs(currentPrice - stopLoss);
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
    let executedPrice = currentPrice; // Use current price instead of signal entry price

    if (isPaperTrading) {
      // Simulate paper trading
      console.log('Simulating trade execution (Paper Trading Mode)');
      orderData = {
        orderId: `PAPER_${Date.now()}`,
        status: 'FILLED',
        fills: [{ price: currentPrice.toString() }],
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
      executedPrice = parseFloat(orderData.fills?.[0]?.price || currentPrice);
    }

    // Check if this signal has already been executed
    const { data: existingTrade } = await supabase
      .from('trades')
      .select('id')
      .eq('signal_id', signalId)
      .maybeSingle();

    if (existingTrade) {
      console.log(`Signal ${signalId} already executed as trade ${existingTrade.id}`);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'This signal has already been executed',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    // Create trade record
    const { data: trade, error: tradeError } = await supabase
      .from('trades')
      .insert({
        user_id: user.id,
        signal_id: signalId,
        symbol: signal.symbol,
        side,
        order_type: 'MARKET',
        quantity,
        entry_price: executedPrice,
        stop_loss: stopLoss,
        take_profit: takeProfit,
        status: 'open',
        binance_order_id: isPaperTrading ? null : orderData.orderId?.toString(),
        strategy_name: signal.strategy_name || 'Unknown',
      })
      .select()
      .single();

    if (tradeError || !trade) {
      console.error('Failed to create trade record:', tradeError);
      throw new Error(`Failed to create trade record: ${tradeError?.message || 'Unknown error'}`);
    }

    // Create position record with real-time trend and rebalancer flag
    await supabase
      .from('positions')
      .insert({
        user_id: user.id,
        trade_id: trade.id,
        symbol: signal.symbol,
        side,
        quantity,
        entry_price: executedPrice,
        current_price: executedPrice,
        stop_loss: stopLoss,
        take_profit: takeProfit,
        unrealized_pnl: 0,
        unrealized_pnl_percent: 0,
        status: 'active',
        trend: currentTrend,
        confidence_score: signal.confidence_score,
        trend_consistency: trendConsistency,
        opened_by_rebalancer: signal.created_by_rebalancer || false,
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
      const slQueryString = `symbol=${signal.symbol}&side=${side === 'BUY' ? 'SELL' : 'BUY'}&type=STOP_LOSS_LIMIT&quantity=${quantity}&price=${stopLoss}&stopPrice=${stopLoss}&timeInForce=GTC&timestamp=${Date.now()}`;
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
      const tpQueryString = `symbol=${signal.symbol}&side=${side === 'BUY' ? 'SELL' : 'BUY'}&type=TAKE_PROFIT_LIMIT&quantity=${quantity}&price=${takeProfit}&stopPrice=${takeProfit}&timeInForce=GTC&timestamp=${Date.now()}`;
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

    // Delete the signal after trade execution
    await supabase
      .from('trading_signals')
      .delete()
      .eq('id', signalId);

    // Update risk parameters - sync with actual active positions count
    const { count: activeCount } = await supabase
      .from('positions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'active');

    await supabase
      .from('risk_parameters')
      .update({
        current_open_trades: activeCount || 0,
      })
      .eq('id', riskParams.id);

    // Send notification with user_id
    try {
      await supabase.functions.invoke('send-notification', {
        body: {
          type: 'trade_executed',
          userId: user.id,
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
