import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const clients = new Set<WebSocket>();
serve(async (req) => {
  if (req.headers.get("upgrade") === "websocket") {
    const { socket, response } = Deno.upgradeWebSocket(req);
    socket.addEventListener("open", () => {
      clients.add(socket);
      console.log("WebSocket connected");
    });
    socket.addEventListener("close", () => {
      clients.delete(socket);
      console.log("WebSocket closed");
    });
    socket.addEventListener("message", (event) => {
      console.log(`WS message: ${event.data}`);
      // Optionally handle client messages, e.g., for authentication or specific requests
    });
    socket.addEventListener("error", (e) => console.error("WS error:", e));
    return response;
  }
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    console.log("Monitoring positions...");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    // Get all active positions
    const { data: positions, error: posError } = await supabase
      .from("positions")
      .select("*")
      .eq("status", "active");
    if (posError) throw posError;
    if (!positions || positions.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No active positions to monitor" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Get unique user IDs and fetch their trailing stop settings
    const userIds = [...new Set(positions.map((p) => p.user_id))];
    const { data: riskParamsList, error: riskError } = await supabase
      .from("risk_parameters")
      .select("user_id, trailing_stop_enabled, trailing_stop_activation_percent, trailing_stop_distance_multiplier")
      .in("user_id", userIds);
    if (riskError) throw riskError;
    // Create a map of user settings
    const userSettingsMap = new Map(
      riskParamsList?.map((rp) => [
        rp.user_id,
        {
          enabled: rp.trailing_stop_enabled ?? true,
          activationPercent: rp.trailing_stop_activation_percent ?? 1.0,
          distanceMultiplier: rp.trailing_stop_distance_multiplier ?? 1.5,
        },
      ]) || [],
    );
    console.log(`Loaded trailing stop settings for ${userSettingsMap.size} users`);
    // Fetch current prices and ATR for all symbols
    const symbols = [...new Set(positions.map((p) => p.symbol))];
    // Fetch prices and calculate ATR for trailing stop loss
    const symbolDataPromises = symbols.map(async (symbol) => {
      try {
        // Get current price
        const priceResponse = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
        if (!priceResponse.ok) throw new Error(`Price fetch failed for ${symbol}: ${priceResponse.status}`);
        const priceData = await priceResponse.json();
        if (!priceData.price) throw new Error(`No price data for ${symbol}`);
        const price = parseFloat(priceData.price);
        // Get last 30 klines to calculate ATR
        const klinesResponse = await fetch(
          `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1m&limit=30`,
        );
        if (!klinesResponse.ok) throw new Error(`Klines fetch failed for ${symbol}: ${klinesResponse.status}`);
        const klines = await klinesResponse.json();
        if (!Array.isArray(klines) || klines.length < 15)
          throw new Error(`Invalid or insufficient klines data for ${symbol}`);
        // Calculate ATR (Average True Range)
        const atrPeriod = 14;
        let atrSum = 0;
        for (let i = klines.length - atrPeriod; i < klines.length; i++) {
          const high = parseFloat(klines[i][2]);
          const low = parseFloat(klines[i][3]);
          const prevClose = parseFloat(klines[i - 1][4]);
          const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
          atrSum += tr;
        }
        const atr = atrSum / atrPeriod;
        const atrPercent = (atr / price) * 100;
        return { symbol, price, atr, atrPercent };
      } catch (error) {
        console.error(`Error fetching data for ${symbol}:`, error);
        return { symbol, price: null, atr: null, atrPercent: null };
      }
    });
    const symbolData = await Promise.all(symbolDataPromises);
    const priceMap = new Map(symbolData.filter((d) => d.price !== null).map((d) => [d.symbol, d.price]));
    const atrMap = new Map(
      symbolData.filter((d) => d.atr !== null).map((d) => [d.symbol, { atr: d.atr, atrPercent: d.atrPercent }]),
    );
    const updates = [];
    const closedPositions = [];
    const trailingStopUpdates = [];
    const trendExits = [];
    // Fetch trend data for all symbols to check for trend reversals
    const trendDataMap = new Map();
    for (const symbol of symbols) {
      try {
        const trendResponse = await supabase.functions.invoke("calculate-trend", {
          body: { symbol },
        });
        if (trendResponse.error) throw trendResponse.error;
        if (trendResponse.data) {
          trendDataMap.set(symbol, trendResponse.data);
          console.log(
            `Trend for ${symbol}: ${trendResponse.data.trend} (confidence: ${trendResponse.data.confidence}%)`,
          );
        }
      } catch (error) {
        console.error(`Failed to fetch trend for ${symbol}:`, error);
      }
    }
    for (const position of positions) {
      const currentPrice = priceMap.get(position.symbol);
      if (currentPrice === undefined || currentPrice === null) continue;
      const atrData = atrMap.get(position.symbol);
      const atrPercent = atrData?.atrPercent || 1.5;

      // Get current trend for this position's symbol
      const trendData = trendDataMap.get(position.symbol);
      const pnl =
        position.side === "BUY"
          ? (currentPrice - position.entry_price) * position.quantity
          : (position.entry_price - currentPrice) * position.quantity;
      const pnlPercent =
        position.side === "BUY"
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
        if (position.side === "BUY") {
          // For LONG: Trail stop loss UP as price rises
          const calculatedStopLoss = currentPrice * (1 - trailingDistance / 100);
          // Only update if new stop loss is HIGHER than current (never move down)
          if (calculatedStopLoss > position.stop_loss) {
            newStopLoss = calculatedStopLoss;
            trailingActivated = true;
            console.log(
              `Trailing SL activated for ${position.symbol}: ${position.stop_loss.toFixed(2)} → ${newStopLoss.toFixed(2)} (P&L: ${pnlPercent.toFixed(2)}%)`,
            );
          }
        } else {
          // For SHORT: Trail stop loss DOWN as price falls
          const calculatedStopLoss = currentPrice * (1 + trailingDistance / 100);
          // Only update if new stop loss is LOWER than current (never move up)
          if (calculatedStopLoss < position.stop_loss) {
            newStopLoss = calculatedStopLoss;
            trailingActivated = true;
            console.log(
              `Trailing SL activated for ${position.symbol}: ${position.stop_loss.toFixed(2)} → ${newStopLoss.toFixed(2)} (P&L: ${pnlPercent.toFixed(2)}%)`,
            );
          }
        }
        // Update stop loss in database if trailing was activated
        if (trailingActivated) {
          const { error: posUpdateError } = await supabase
            .from("positions")
            .update({ stop_loss: newStopLoss })
            .eq("id", position.id);
          if (posUpdateError) throw posUpdateError;
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
            const { data: riskParams, error: riskParamsError } = await supabase
              .from("risk_parameters")
              .select("notification_email, email_notifications_enabled")
              .eq("user_id", position.user_id)
              .single();
            if (riskParamsError) throw riskParamsError;
            // Create notification record in database
            //await supabase
            //.from('notifications')
            //.insert({
            // user_id: position.user_id,
            // trade_id: position.trade_id,
            // type: 'trailing_stop_activated',
            // message: `Trailing stop activated for ${position.symbol} ${position.side}. Stop loss moved from $${position.stop_loss.toFixed(2)} to $${newStopLoss.toFixed(2)} (P&L: +${pnlPercent.toFixed(2)}%)`,
            // });
            // Send email/SMS notification if enabled
            if (riskParams?.email_notifications_enabled) {
              const { error: notifyError } = await supabase.functions.invoke("send-notification", {
                body: {
                  type: "trailing_stop_activated",
                  userId: position.user_id,
                  positionId: position.id,
                  symbol: position.symbol,
                  side: position.side,
                  price: currentPrice,
                  oldStopLoss: position.stop_loss,
                  newStopLoss,
                  pnlPercent,
                  email: riskParams.notification_email,
                },
              });
              if (notifyError) throw notifyError;
              console.log(`Notification sent for trailing stop: ${position.symbol}`);
            }
          } catch (notifError) {
            console.error("Error sending trailing stop notification:", notifError);
            // Don't fail the monitoring if notification fails
          }
        }
      }
      // TREND-AWARE EXIT CHECK - Close position if trend has flipped against us
      let shouldClose = false;
      let closeReason = "";

      if (trendData) {
        const currentTrend = trendData.trend; // 'bullish', 'bearish', or 'ranging'
        const trendConfidence = trendData.confidence || 0;
        const trend1h = trendData.higherTimeframeFilter?.trend1h;
        const trend4h = trendData.higherTimeframeFilter?.trend4h;

        // For SHORT positions: Exit if trend turns bullish OR ranging (market indecision) with lower threshold
        // Also exit if there's higher timeframe conflict (4h bearish vs 1h bullish = dangerous for shorts)
        if (position.side === "SELL") {
          const htfConflict = trend4h === "bearish" && trend1h === "bullish"; // Higher timeframe conflict

          if (currentTrend === "bullish" && trendConfidence >= 45) {
            shouldClose = true;
            closeReason = "trend_reversal_bullish";
            console.log(
              `🔄 TREND EXIT: Closing SHORT ${position.symbol} - Trend BULLISH (conf: ${trendConfidence}%, 4h: ${trend4h}, 1h: ${trend1h})`,
            );
          } else if (currentTrend === "ranging" && htfConflict && trendConfidence >= 30) {
            shouldClose = true;
            closeReason = "trend_reversal_ranging";
            console.log(
              `🔄 TREND EXIT: Closing SHORT ${position.symbol} - RANGING + HTF conflict (conf: ${trendConfidence}%, 4h: ${trend4h}, 1h: ${trend1h})`,
            );
          } else if (currentTrend === "ranging" && trendConfidence >= 40) {
            shouldClose = true;
            closeReason = "trend_reversal_ranging";
            console.log(
              `🔄 TREND EXIT: Closing SHORT ${position.symbol} - Trend RANGING (conf: ${trendConfidence}%, 4h: ${trend4h}, 1h: ${trend1h})`,
            );
          }

          if (shouldClose) {
            trendExits.push({
              symbol: position.symbol,
              side: position.side,
              reason: `Trend: ${currentTrend} (${trendConfidence}%), 4h: ${trend4h}, 1h: ${trend1h}`,
              trend: currentTrend,
              confidence: trendConfidence,
              pnlPercent,
            });
          }
        }

        // For LONG positions: Exit if trend turns bearish OR ranging with lower threshold
        // Also exit if there's higher timeframe conflict (4h bullish vs 1h bearish)
        if (position.side === "BUY") {
          const htfConflict = trend4h === "bullish" && trend1h === "bearish";

          if (currentTrend === "bearish" && trendConfidence >= 45) {
            shouldClose = true;
            closeReason = "trend_reversal_bearish";
            console.log(
              `🔄 TREND EXIT: Closing LONG ${position.symbol} - Trend BEARISH (conf: ${trendConfidence}%, 4h: ${trend4h}, 1h: ${trend1h})`,
            );
          } else if (currentTrend === "ranging" && htfConflict && trendConfidence >= 30) {
            shouldClose = true;
            closeReason = "trend_reversal_ranging";
            console.log(
              `🔄 TREND EXIT: Closing LONG ${position.symbol} - RANGING + HTF conflict (conf: ${trendConfidence}%, 4h: ${trend4h}, 1h: ${trend1h})`,
            );
          } else if (currentTrend === "ranging" && trendConfidence >= 40) {
            shouldClose = true;
            closeReason = "trend_reversal_ranging";
            console.log(
              `🔄 TREND EXIT: Closing LONG ${position.symbol} - Trend RANGING (conf: ${trendConfidence}%, 4h: ${trend4h}, 1h: ${trend1h})`,
            );
          }

          if (shouldClose) {
            trendExits.push({
              symbol: position.symbol,
              side: position.side,
              reason: `Trend: ${currentTrend} (${trendConfidence}%), 4h: ${trend4h}, 1h: ${trend1h}`,
              trend: currentTrend,
              confidence: trendConfidence,
              pnlPercent,
            });
          }
        }
      }
      // Check if take profit or stop loss is hit (use updated stop loss)
      if (!shouldClose && position.side === "BUY") {
        // LONG: TP when price goes UP, SL when price goes DOWN
        if (position.take_profit && currentPrice >= position.take_profit) {
          shouldClose = true;
          closeReason = "take_profit";
        } else if (newStopLoss && currentPrice <= newStopLoss) {
          shouldClose = true;
          // If position was profitable (above activation threshold) when it hit stop loss,
          // it must be a trailing stop loss, not a regular stop loss
          const wasTrailing = userSettings.enabled && pnlPercent > userSettings.activationPercent;
          closeReason = wasTrailing ? "trailing_stop_loss" : "stop_loss";
        }
      } else if (!shouldClose && position.side === "SELL") {
        // SHORT: TP when price goes DOWN, SL when price goes UP
        if (position.take_profit && currentPrice <= position.take_profit) {
          shouldClose = true;
          closeReason = "take_profit";
        } else if (newStopLoss && currentPrice >= newStopLoss) {
          shouldClose = true;
          // If position was profitable (above activation threshold) when it hit stop loss,
          // it must be a trailing stop loss, not a regular stop loss
          const wasTrailing = userSettings.enabled && pnlPercent > userSettings.activationPercent;
          closeReason = wasTrailing ? "trailing_stop_loss" : "stop_loss";
        }
      }
      if (shouldClose) {
        // Close the position
        const { error: closePosError } = await supabase
          .from("positions")
          .update({
            status: "closed",
            current_price: currentPrice,
            exit_price: currentPrice,
            realized_pnl: pnl,
            realized_pnl_percent: pnlPercent,
            closed_at: new Date().toISOString(),
            close_reason: closeReason,
          })
          .eq("id", position.id);
        if (closePosError) throw closePosError;
        closedPositions.push({
          symbol: position.symbol,
          side: position.side,
          reason: closeReason,
          exitPrice: currentPrice,
          pnl,
          pnlPercent,
        });
        console.log(
          `Closed position ${position.id} - ${position.symbol} ${position.side} - ${closeReason} at ${currentPrice}`,
        );
      }
      // Note: No database updates for active positions - UI uses live WebSocket prices
      updates.push({
        symbol: position.symbol,
        currentPrice,
        pnl,
        pnlPercent,
      });
    }
    const responseData = {
      success: true,
      updates,
      closedPositions,
      trailingStopUpdates,
      trendExits,
      message: `Updated ${updates.length} positions, ${trailingStopUpdates.length} trailing stops adjusted, closed ${closedPositions.length} positions (${trendExits.length} trend exits)`,
    };
    const message = JSON.stringify(responseData);
    for (const client of clients) {
      if (client.readyState === 1) {
        client.send(message);
      }
    }
    return new Response(message, {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error monitoring positions:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
