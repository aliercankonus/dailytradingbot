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

    // Get unique user IDs and fetch their trailing stop settings
    const userIds = [...new Set(positions.map(p => p.user_id))];
    const { data: riskParamsList } = await supabase
      .from('risk_parameters')
      .select('user_id, trailing_stop_enabled, trailing_stop_activation_percent, trailing_stop_distance_multiplier')
      .in('user_id', userIds);

    // Create a map of user settings
    const userSettingsMap = new Map(
      riskParamsList?.map(rp => [
        rp.user_id,
        {
          enabled: rp.trailing_stop_enabled ?? true,
          activationPercent: rp.trailing_stop_activation_percent ?? 1.0,
          distanceMultiplier: rp.trailing_stop_distance_multiplier ?? 1.5,
        }
      ]) || []
    );

    console.log(`Loaded trailing stop settings for ${userSettingsMap.size} users`);

    // Fetch current prices and ATR for all symbols
    const symbols = [...new Set(positions.map(p => p.symbol))];
    
    // Fetch prices and calculate ATR for trailing stop loss
    const symbolDataPromises = symbols.map(async (symbol) => {
      // Get current price
      const priceResponse = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
      const priceData = await priceResponse.json();
      const price = parseFloat(priceData.price);
      
      // Get last 30 klines to calculate ATR
      const klinesResponse = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1m&limit=30`);
      const klines = await klinesResponse.json();
      
      // Calculate ATR (Average True Range)
      const atrPeriod = 14;
      let atrSum = 0;
      for (let i = klines.length - atrPeriod; i < klines.length - 1; i++) {
        const high = parseFloat(klines[i][2]);
        const low = parseFloat(klines[i][3]);
        const prevClose = parseFloat(klines[i - 1][4]);
        const tr = Math.max(
          high - low,
          Math.abs(high - prevClose),
          Math.abs(low - prevClose)
        );
        atrSum += tr;
      }
      const atr = atrSum / atrPeriod;
      const atrPercent = (atr / price) * 100;
      
      return { symbol, price, atr, atrPercent };
    });

    const symbolData = await Promise.all(symbolDataPromises);
    const priceMap = new Map(symbolData.map(d => [d.symbol, d.price]));
    const atrMap = new Map(symbolData.map(d => [d.symbol, { atr: d.atr, atrPercent: d.atrPercent }]));

    const updates = [];
    const closedPositions = [];
    const trailingStopUpdates = [];

    for (const position of positions) {
      const currentPrice = priceMap.get(position.symbol);
      if (!currentPrice) continue;

      const atrData = atrMap.get(position.symbol);
      const atrPercent = atrData?.atrPercent || 1.5;

      const pnl = position.side === 'BUY'
        ? (currentPrice - position.entry_price) * position.quantity
        : (position.entry_price - currentPrice) * position.quantity;

      const pnlPercent = position.side === 'BUY'
        ? ((currentPrice - position.entry_price) / position.entry_price) * 100
        : ((position.entry_price - currentPrice) / position.entry_price) * 100;

      // Get user's trailing stop settings
      const userSettings = userSettingsMap.get(position.user_id) || {
        enabled: true,
        activationPercent: 1.0,
        distanceMultiplier: 1.5,
      };

      // TRAILING STOP LOSS LOGIC
      let newStopLoss = position.stop_loss;
      let trailingActivated = false;
      
      // Check if trailing stop is enabled and position is profitable enough
      if (userSettings.enabled && pnlPercent > userSettings.activationPercent) {
        // Calculate trailing stop loss using user's multiplier setting
        const trailingDistance = Math.max(atrPercent * userSettings.distanceMultiplier, 1.5); // Min 1.5%
        
        if (position.side === 'BUY') {
          // For LONG: Trail stop loss UP as price rises
          const calculatedStopLoss = currentPrice * (1 - trailingDistance / 100);
          
          // Only update if new stop loss is HIGHER than current (never move down)
          if (calculatedStopLoss > position.stop_loss) {
            newStopLoss = calculatedStopLoss;
            trailingActivated = true;
            console.log(`Trailing SL activated for ${position.symbol}: ${position.stop_loss.toFixed(2)} → ${newStopLoss.toFixed(2)} (P&L: ${pnlPercent.toFixed(2)}%)`);
          }
        } else {
          // For SHORT: Trail stop loss DOWN as price falls
          const calculatedStopLoss = currentPrice * (1 + trailingDistance / 100);
          
          // Only update if new stop loss is LOWER than current (never move up)
          if (calculatedStopLoss < position.stop_loss) {
            newStopLoss = calculatedStopLoss;
            trailingActivated = true;
            console.log(`Trailing SL activated for ${position.symbol}: ${position.stop_loss.toFixed(2)} → ${newStopLoss.toFixed(2)} (P&L: ${pnlPercent.toFixed(2)}%)`);
          }
        }

        // Update stop loss in database if trailing was activated
        if (trailingActivated) {
          await supabase
            .from('positions')
            .update({ stop_loss: newStopLoss })
            .eq('id', position.id);

          // Also update the trade record
          await supabase
            .from('trades')
            .update({ stop_loss: newStopLoss })
            .eq('id', position.trade_id);

          trailingStopUpdates.push({
            symbol: position.symbol,
            side: position.side,
            oldStopLoss: position.stop_loss,
            newStopLoss,
            currentPrice,
            pnlPercent,
          });

          // Send notification about trailing stop activation
          try {
            // Get user's notification preferences
            const { data: riskParams } = await supabase
              .from('risk_parameters')
              .select('notification_email, email_notifications_enabled')
              .eq('user_id', position.user_id)
              .single();

            // Create notification record in database
            await supabase
              .from('notifications')
              .insert({
                user_id: position.user_id,
                trade_id: position.trade_id,
                type: 'trailing_stop_activated',
                message: `Trailing stop activated for ${position.symbol} ${position.side}. Stop loss moved from $${position.stop_loss.toFixed(2)} to $${newStopLoss.toFixed(2)} (P&L: +${pnlPercent.toFixed(2)}%)`,
              });

            // Send email/SMS notification if enabled
            if (riskParams?.email_notifications_enabled) {
              await supabase.functions.invoke('send-notification', {
                body: {
                  type: 'trailing_stop_activated',
                  userId: position.user_id,
                  tradeId: position.trade_id,
                  symbol: position.symbol,
                  side: position.side,
                  price: currentPrice,
                  oldStopLoss: position.stop_loss,
                  newStopLoss,
                  pnlPercent,
                  email: riskParams.notification_email,
                },
              });
              console.log(`Notification sent for trailing stop: ${position.symbol}`);
            }
          } catch (notifError) {
            console.error('Error sending trailing stop notification:', notifError);
            // Don't fail the monitoring if notification fails
          }
        }
      }

      // Check if take profit or stop loss is hit (use updated stop loss)
      let shouldClose = false;
      let closeReason = '';

      if (position.side === 'BUY') {
        // For LONG positions: TP when price goes UP, SL when price goes DOWN
        if (position.take_profit && currentPrice >= position.take_profit) {
          shouldClose = true;
          closeReason = 'take_profit';
        } else if (newStopLoss && currentPrice <= newStopLoss) {
          shouldClose = true;
          closeReason = trailingActivated ? 'trailing_stop_loss' : 'stop_loss';
        }
      } else {
        // For SHORT positions: TP when price goes DOWN, SL when price goes UP
        if (position.take_profit && currentPrice <= position.take_profit) {
          shouldClose = true;
          closeReason = 'take_profit';
        } else if (newStopLoss && currentPrice >= newStopLoss) {
          shouldClose = true;
          closeReason = trailingActivated ? 'trailing_stop_loss' : 'stop_loss';
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
        trailingStopUpdates,
        message: `Updated ${updates.length} positions, ${trailingStopUpdates.length} trailing stops adjusted, closed ${closedPositions.length} positions`,
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