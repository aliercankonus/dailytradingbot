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
      .select("user_id, trailing_stop_enabled, trailing_stop_activation_percent, trailing_stop_distance_multiplier, break_even_enabled, break_even_activation_percent")
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
          breakEvenEnabled: rp.break_even_enabled ?? true,
          breakEvenActivationPercent: rp.break_even_activation_percent ?? 0.5,
        },
      ]) || [],
    );
    console.log(`Loaded trailing stop settings for ${userSettingsMap.size} users`);
  // Fetch current prices and ATR for all symbols
  const symbols = [...new Set(positions.map((p) => p.symbol))];
  
  // Enhanced data fetching: prices, ATR, historical ATR (for volatility spike), and volume
  const symbolDataPromises = symbols.map(async (symbol) => {
    try {
      // Get current price
      const priceResponse = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
      if (!priceResponse.ok) throw new Error(`Price fetch failed for ${symbol}: ${priceResponse.status}`);
      const priceData = await priceResponse.json();
      if (!priceData.price) throw new Error(`No price data for ${symbol}`);
      const price = parseFloat(priceData.price);

      // Get last 50 1-HOUR klines for ATR and volatility analysis
      const klinesResponse = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=50`,
      );
      if (!klinesResponse.ok) throw new Error(`Klines fetch failed for ${symbol}: ${klinesResponse.status}`);
      const klines = await klinesResponse.json();
      if (!Array.isArray(klines) || klines.length < 16)
        throw new Error(`Invalid or insufficient klines data for ${symbol}`);

      // Calculate current ATR (last 14 candles)
      const atrPeriod = 14;
      let currentAtrSum = 0;
      const startIdx = klines.length - atrPeriod;
      for (let i = startIdx; i < klines.length; i++) {
        const high = parseFloat(klines[i][2]);
        const low = parseFloat(klines[i][3]);
        const prevClose = parseFloat(klines[i - 1][4]);
        const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
        currentAtrSum += tr;
      }
      const currentAtr = currentAtrSum / atrPeriod;
      const atrPercent = (currentAtr / price) * 100;

      // Calculate historical average ATR (for volatility spike detection)
      // Use ATR from 20-34 candles ago as baseline
      let historicalAtrSum = 0;
      const histStartIdx = Math.max(1, klines.length - 34);
      const histEndIdx = klines.length - 20;
      let histCount = 0;
      for (let i = histStartIdx; i < histEndIdx && i < klines.length - 1; i++) {
        const high = parseFloat(klines[i][2]);
        const low = parseFloat(klines[i][3]);
        const prevClose = parseFloat(klines[i - 1][4]);
        const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
        historicalAtrSum += tr;
        histCount++;
      }
      const historicalAtr = histCount > 0 ? historicalAtrSum / histCount : currentAtr;
      const atrRatio = currentAtr / historicalAtr; // >1.5 = volatility spike

      // Get 24h price change for flash crash detection
      const ticker24hResponse = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);
      let priceChange24h = 0;
      let volume24h = 0;
      let avgVolume = 0;
      if (ticker24hResponse.ok) {
        const ticker24h = await ticker24hResponse.json();
        priceChange24h = parseFloat(ticker24h.priceChangePercent || "0");
        volume24h = parseFloat(ticker24h.volume || "0");
        avgVolume = parseFloat(ticker24h.quoteVolume || "0") / 24; // Rough hourly average
      }

      // Calculate recent price movement (last 2 candles) for flash crash
      const lastCandle = klines[klines.length - 1];
      const prevCandle = klines[klines.length - 2];
      const lastClose = parseFloat(lastCandle[4]);
      const prevClose = parseFloat(prevCandle[4]);
      const recentPriceChange = ((lastClose - prevClose) / prevClose) * 100;

      // Volume analysis (current vs average)
      const currentVolume = parseFloat(lastCandle[5]);
      const avgCandleVolume = klines.slice(-20).reduce((sum, k) => sum + parseFloat(k[5]), 0) / 20;
      const volumeRatio = currentVolume / avgCandleVolume; // >3 = volume spike

      // MACD calculation for divergence detection
      const closes = klines.map((k: any) => parseFloat(k[4]));
      const ema12 = calculateEMA(closes, 12);
      const ema26 = calculateEMA(closes, 26);
      const macdLine = ema12 - ema26;
      
      // Calculate MACD from 3 candles ago for divergence check
      const closes3Ago = closes.slice(0, -2);
      const ema12_3ago = calculateEMA(closes3Ago, 12);
      const ema26_3ago = calculateEMA(closes3Ago, 26);
      const macdLine3Ago = ema12_3ago - ema26_3ago;
      
      const macdTrending = macdLine > macdLine3Ago ? "up" : "down";
      const priceTrending = lastClose > parseFloat(klines[klines.length - 4][4]) ? "up" : "down";
      const hasDivergence = macdTrending !== priceTrending;

      return { 
        symbol, 
        price, 
        atr: currentAtr, 
        atrPercent,
        atrRatio, // For volatility spike
        recentPriceChange, // For flash crash
        priceChange24h,
        volumeRatio, // For volume spike
        hasDivergence, // For momentum divergence
        macdTrending,
        priceTrending,
      };
    } catch (error) {
      console.error(`Error fetching data for ${symbol}:`, error);
      return { symbol, price: null, atr: null, atrPercent: null, atrRatio: 1, recentPriceChange: 0, volumeRatio: 1, hasDivergence: false };
    }
  });

  // Helper function for EMA calculation
  function calculateEMA(prices: number[], period: number): number {
    if (prices.length < period) return prices[prices.length - 1] || 0;
    const multiplier = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < prices.length; i++) {
      ema = (prices[i] - ema) * multiplier + ema;
    }
    return ema;
  }

    const symbolData = await Promise.all(symbolDataPromises);
    const priceMap = new Map(symbolData.filter((d) => d.price !== null).map((d) => [d.symbol, d.price]));
    const atrMap = new Map(
      symbolData.filter((d) => d.atr !== null).map((d) => [d.symbol, { 
        atr: d.atr, 
        atrPercent: d.atrPercent,
        atrRatio: d.atrRatio,
        recentPriceChange: d.recentPriceChange,
        volumeRatio: d.volumeRatio,
        hasDivergence: d.hasDivergence,
        macdTrending: d.macdTrending,
        priceTrending: d.priceTrending,
      }]),
    );
    const updates = [];
    const closedPositions = [];
    const trailingStopUpdates = [];
    const breakEvenUpdates = [];
    const trendExits = [];
    const partialTpTaken = [];
    const emergencyExits = []; // NEW: Track emergency exits
    const volatilityAlerts = []; // NEW: Track volatility alerts
    
    // Fetch trend data for all symbols in PARALLEL
    const trendDataMap = new Map();
    const trendPromises = symbols.map(async (symbol) => {
      try {
        const trendResponse = await supabase.functions.invoke("calculate-trend", {
          body: { symbol },
        });
        if (trendResponse.error) throw trendResponse.error;
        return { symbol, data: trendResponse.data };
      } catch (error) {
        console.error(`Failed to fetch trend for ${symbol}:`, error);
        return { symbol, data: null };
      }
    });
    const trendResults = await Promise.all(trendPromises);
    trendResults.forEach(({ symbol, data }) => {
      if (data) {
        trendDataMap.set(symbol, data);
        console.log(`Trend for ${symbol}: ${data.trend} (confidence: ${data.confidence}%)`);
      }
    });
    for (const position of positions) {
      const currentPrice = priceMap.get(position.symbol);
      if (currentPrice === undefined || currentPrice === null) continue;
      const atrData = atrMap.get(position.symbol);
      const atrPercent = atrData?.atrPercent || 1.5;

      // Get current trend for this position's symbol
      const trendData = trendDataMap.get(position.symbol);

      // ============================================================
      // 🚨 EMERGENCY PROTECTION SYSTEMS
      // ============================================================

      // 1️⃣ FLASH CRASH PROTECTION - Immediate exit on sudden 5%+ adverse move
      const FLASH_CRASH_THRESHOLD = 5.0; // 5% sudden move
      const recentPriceChange = atrData?.recentPriceChange || 0;
      
      let isFlashCrash = false;
      if (position.side === "BUY" && recentPriceChange <= -FLASH_CRASH_THRESHOLD) {
        isFlashCrash = true;
        console.log(`🚨 FLASH CRASH DETECTED for LONG ${position.symbol}: ${recentPriceChange.toFixed(2)}% drop in last hour!`);
      } else if (position.side === "SELL" && recentPriceChange >= FLASH_CRASH_THRESHOLD) {
        isFlashCrash = true;
        console.log(`🚨 FLASH CRASH DETECTED for SHORT ${position.symbol}: ${recentPriceChange.toFixed(2)}% surge in last hour!`);
      }

      // 2️⃣ VOLATILITY SPIKE DETECTION - ATR 2x normal = high risk
      const VOLATILITY_SPIKE_THRESHOLD = 2.0; // ATR 2x higher than normal
      const atrRatio = atrData?.atrRatio || 1.0;
      const isVolatilitySpike = atrRatio >= VOLATILITY_SPIKE_THRESHOLD;
      
      if (isVolatilitySpike) {
        console.log(`⚡ VOLATILITY SPIKE for ${position.symbol}: ATR ${atrRatio.toFixed(2)}x normal - high risk environment!`);
        volatilityAlerts.push({
          symbol: position.symbol,
          atrRatio,
          message: `ATR ${atrRatio.toFixed(2)}x above normal`,
        });
      }

      // 3️⃣ MOMENTUM DIVERGENCE EXIT - Price up but MACD down (or vice versa)
      const hasDivergence = atrData?.hasDivergence || false;
      const macdTrending = atrData?.macdTrending || "neutral";
      const priceTrending = atrData?.priceTrending || "neutral";
      
      let divergenceExit = false;
      // For LONG: Exit if price going up but MACD going down (bearish divergence)
      if (position.side === "BUY" && hasDivergence && priceTrending === "up" && macdTrending === "down") {
        divergenceExit = true;
        console.log(`📉 BEARISH DIVERGENCE for LONG ${position.symbol}: Price up but MACD down - momentum weakening!`);
      }
      // For SHORT: Exit if price going down but MACD going up (bullish divergence)
      else if (position.side === "SELL" && hasDivergence && priceTrending === "down" && macdTrending === "up") {
        divergenceExit = true;
        console.log(`📈 BULLISH DIVERGENCE for SHORT ${position.symbol}: Price down but MACD up - momentum weakening!`);
      }

      // 4️⃣ VOLUME SPIKE ALERT - Unusual volume may signal reversal
      const VOLUME_SPIKE_THRESHOLD = 3.0; // 3x average volume
      const volumeRatio = atrData?.volumeRatio || 1.0;
      const isVolumeSpike = volumeRatio >= VOLUME_SPIKE_THRESHOLD;
      
      if (isVolumeSpike) {
        console.log(`📊 VOLUME SPIKE for ${position.symbol}: ${volumeRatio.toFixed(1)}x average volume - potential reversal signal!`);
        volatilityAlerts.push({
          symbol: position.symbol,
          volumeRatio,
          message: `Volume ${volumeRatio.toFixed(1)}x above average`,
        });
      }

      // ============================================================
      // EMERGENCY EXIT DECISION
      // ============================================================
      let emergencyClose = false;
      let emergencyReason = "";
      
      // Flash crash = immediate exit (highest priority)
      if (isFlashCrash) {
        emergencyClose = true;
        emergencyReason = "flash_crash";
      }
      // Volatility spike + divergence = exit (compound risk)
      else if (isVolatilitySpike && divergenceExit) {
        emergencyClose = true;
        emergencyReason = "volatility_divergence";
      }
      // Strong divergence with volume spike = exit
      else if (divergenceExit && isVolumeSpike) {
        emergencyClose = true;
        emergencyReason = "divergence_volume_spike";
      }
      // Extreme volatility (3x) alone = exit
      else if (atrRatio >= 3.0) {
        emergencyClose = true;
        emergencyReason = "extreme_volatility";
      }

      if (emergencyClose) {
        emergencyExits.push({
          symbol: position.symbol,
          side: position.side,
          reason: emergencyReason,
          details: {
            recentPriceChange: recentPriceChange.toFixed(2) + "%",
            atrRatio: atrRatio.toFixed(2) + "x",
            volumeRatio: volumeRatio.toFixed(1) + "x",
            hasDivergence,
          }
        });
      }
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
        breakEvenEnabled: true,
        breakEvenActivationPercent: 0.5,
      };
      // TRAILING STOP LOSS LOGIC - Position-specific calculation
      let newStopLoss = position.stop_loss;
      let trailingActivated = false;
      // Check if trailing stop is enabled and position is profitable enough
      if (userSettings.enabled && pnlPercent > userSettings.activationPercent) {
        // Calculate trailing distance in absolute terms based on ATR
        const atrAbsolute = (currentPrice * atrPercent) / 100;
        const trailingDistanceAbsolute = Math.max(atrAbsolute * userSettings.distanceMultiplier, currentPrice * 0.015); // Min 1.5% of current price
        
        if (position.side === "BUY") {
          // For LONG: Trail current price by fixed distance (independent of entry price)
          const calculatedStopLoss = currentPrice - trailingDistanceAbsolute;
          // Only update if new stop loss is HIGHER than current (never move down)
          if (calculatedStopLoss > position.stop_loss) {
            newStopLoss = calculatedStopLoss;
            trailingActivated = true;
            console.log(
              `Trailing SL activated for ${position.symbol} (entry: ${position.entry_price.toFixed(2)}): ${position.stop_loss.toFixed(2)} → ${newStopLoss.toFixed(2)} (current: ${currentPrice.toFixed(2)}, P&L: ${pnlPercent.toFixed(2)}%)`,
            );
          }
        } else {
          // For SHORT: Trail current price by fixed distance (independent of entry price)
          const calculatedStopLoss = currentPrice + trailingDistanceAbsolute;
          // Only update if new stop loss is LOWER than current (never move up)
          if (calculatedStopLoss < position.stop_loss) {
            newStopLoss = calculatedStopLoss;
            trailingActivated = true;
            console.log(
              `Trailing SL activated for ${position.symbol} (entry: ${position.entry_price.toFixed(2)}): ${position.stop_loss.toFixed(2)} → ${newStopLoss.toFixed(2)} (current: ${currentPrice.toFixed(2)}, P&L: ${pnlPercent.toFixed(2)}%)`,
            );
          }
        }
        // Update stop loss in database if trailing was activated
        if (trailingActivated) {
          // Use optimistic locking - only update if position is still active
          const { data: updatedPos, error: posUpdateError } = await supabase
            .from("positions")
            .update({ stop_loss: newStopLoss })
            .eq("id", position.id)
            .eq("status", "active") // RACE CONDITION FIX: Only update if still active
            .select()
            .maybeSingle();
          
          if (posUpdateError) {
            console.error(`Error updating trailing stop for ${position.id}:`, posUpdateError);
            continue;
          }
          
          // Only log/track if we actually updated the position
          if (updatedPos) {
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
          } // Close if (updatedPos)
        }
      }

      // ============================================================
      // BREAK-EVEN STOP LOGIC - Move stop to entry price when profitable
      // This activates at a lower threshold than trailing stop for early protection
      // ============================================================
      const isBreakEvenEligible = userSettings.breakEvenEnabled && 
                                  pnlPercent >= userSettings.breakEvenActivationPercent &&
                                  !trailingActivated; // Don't apply if trailing stop already moved

      if (isBreakEvenEligible) {
        const entryPrice = position.entry_price;
        let shouldMoveToBreakEven = false;

        if (position.side === "BUY") {
          // For LONG: Move stop to entry if current stop is below entry
          if (position.stop_loss < entryPrice) {
            shouldMoveToBreakEven = true;
          }
        } else {
          // For SHORT: Move stop to entry if current stop is above entry
          if (position.stop_loss > entryPrice) {
            shouldMoveToBreakEven = true;
          }
        }

        if (shouldMoveToBreakEven) {
          console.log(`🛡️ BREAK-EVEN: Moving stop to entry for ${position.symbol} (P&L: ${pnlPercent.toFixed(2)}%, Entry: ${entryPrice.toFixed(2)})`);
          
          // Use optimistic locking
          const { data: updatedBEPos, error: beUpdateError } = await supabase
            .from("positions")
            .update({ stop_loss: entryPrice })
            .eq("id", position.id)
            .eq("status", "active")
            .select()
            .maybeSingle();

          if (beUpdateError) {
            console.error(`Error updating break-even stop for ${position.id}:`, beUpdateError);
          } else if (updatedBEPos) {
            breakEvenUpdates.push({
              symbol: position.symbol,
              side: position.side,
              oldStopLoss: position.stop_loss,
              newStopLoss: entryPrice,
              currentPrice,
              pnlPercent,
            });

            // Send notification
            try {
              const { data: riskParams } = await supabase
                .from("risk_parameters")
                .select("notification_email, email_notifications_enabled")
                .eq("user_id", position.user_id)
                .single();

              if (riskParams?.email_notifications_enabled) {
                await supabase.functions.invoke("send-notification", {
                  body: {
                    type: "break_even_activated",
                    userId: position.user_id,
                    positionId: position.id,
                    symbol: position.symbol,
                    side: position.side,
                    price: currentPrice,
                    entryPrice,
                    pnlPercent,
                    email: riskParams.notification_email,
                  },
                });
                console.log(`📧 Break-even notification sent for ${position.symbol}`);
              }
            } catch (notifError) {
              console.error("Error sending break-even notification:", notifError);
            }
          }
        }
      }

      // TREND-AWARE EXIT CHECK - Close position if trend has flipped against us
      let shouldClose = false;
      let closeReason = "";

      // 🚨 EMERGENCY EXITS HAVE HIGHEST PRIORITY
      if (emergencyClose) {
        shouldClose = true;
        closeReason = emergencyReason;
        console.log(`🚨 EMERGENCY EXIT: ${position.symbol} ${position.side} - Reason: ${emergencyReason}`);
        trendExits.push({
          symbol: position.symbol,
          side: position.side,
          reason: `EMERGENCY: ${emergencyReason}`,
          trend: "emergency",
          confidence: 100,
          pnlPercent,
        });
      }

      if (!shouldClose && trendData) {
        const currentTrend = trendData.trend; // 'bullish', 'bearish', or 'ranging'
        const trendConfidence = trendData.confidence || 0;
        const trend1h = trendData.higherTimeframeFilter?.trend1h || 'neutral';
        const trend4h = trendData.higherTimeframeFilter?.trend4h || 'neutral';

        // For SHORT positions: Exit if trend turns bullish OR ranging (market indecision) with lower threshold
        // Also exit if there's higher timeframe conflict (4h bearish vs 1h bullish = dangerous for shorts)
        if (position.side === "SELL") {
          const htfConflict = trend4h === "bearish" && trend1h === "bullish"; // Higher timeframe conflict
          
          // Get 4h confidence from timeframes data (early warning threshold)
          const confidence4h = trendData.timeframes?.['4h']?.confidence || trendConfidence;

          // 🆕 EARLY WARNING EXIT: 1h bullish AND 4h confidence dropping below 70%
          // This catches trend weakening before full reversal
          if (trend1h === "bullish" && confidence4h < 70) {
            shouldClose = true;
            closeReason = "early_warning_1h_bullish";
            console.log(
              `⚠️ EARLY WARNING EXIT: Closing SHORT ${position.symbol} - 1h BULLISH + 4h weakening (4h conf: ${confidence4h}%, 4h: ${trend4h}, 1h: ${trend1h})`,
            );
          } else if (currentTrend === "bullish" && trendConfidence >= 45) {
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
              reason: `Trend: ${currentTrend} (${trendConfidence}%), 4h: ${trend4h} (${confidence4h}%), 1h: ${trend1h}`,
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
          
          // Get 4h confidence from timeframes data (early warning threshold)
          const confidence4h = trendData.timeframes?.['4h']?.confidence || trendConfidence;

          // 🆕 EARLY WARNING EXIT: 1h bearish AND 4h confidence dropping below 70%
          // This catches trend weakening before full reversal
          if (!shouldClose && trend1h === "bearish" && confidence4h < 70) {
            shouldClose = true;
            closeReason = "early_warning_1h_bearish";
            console.log(
              `⚠️ EARLY WARNING EXIT: Closing LONG ${position.symbol} - 1h BEARISH + 4h weakening (4h conf: ${confidence4h}%, 4h: ${trend4h}, 1h: ${trend1h})`,
            );
          } else if (currentTrend === "bearish" && trendConfidence >= 45) {
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
              reason: `Trend: ${currentTrend} (${trendConfidence}%), 4h: ${trend4h} (${confidence4h}%), 1h: ${trend1h}`,
              trend: currentTrend,
              confidence: trendConfidence,
              pnlPercent,
            });
          }
        }
      }

      // ============================================================
      // TIME-BASED EXIT LOGIC - Close stale positions
      // If position is open 24+ hours with minimal movement (<2%), free up capital
      // ============================================================
      if (!shouldClose && position.opened_at) {
        const openedAt = new Date(position.opened_at);
        const now = new Date();
        const hoursOpen = (now.getTime() - openedAt.getTime()) / (1000 * 60 * 60);
        const absMovement = Math.abs(pnlPercent);
        
        // Stale position: Open 24+ hours with less than 2% price movement
        const minHoursForStaleCheck = 24;
        const maxMovementForStale = 2.0; // 2% threshold
        
        if (hoursOpen >= minHoursForStaleCheck && absMovement < maxMovementForStale) {
          shouldClose = true;
          closeReason = "stale_position";
          console.log(
            `⏰ TIME EXIT: Closing stale ${position.symbol} ${position.side} - Open ${hoursOpen.toFixed(1)}h with only ${pnlPercent.toFixed(2)}% movement`
          );
          
          trendExits.push({
            symbol: position.symbol,
            side: position.side,
            reason: `Stale: ${hoursOpen.toFixed(1)}h open, ${pnlPercent.toFixed(2)}% P&L`,
            trend: "stale",
            confidence: 0,
            pnlPercent,
          });
        } else if (hoursOpen >= minHoursForStaleCheck) {
          console.log(
            `📊 Position ${position.symbol} open ${hoursOpen.toFixed(1)}h - movement ${absMovement.toFixed(2)}% (above ${maxMovementForStale}% threshold, keeping open)`
          );
        }
      }

      // ============================================================
      // PARTIAL TAKE PROFIT LOGIC - Professional ladder exit system
      // TP1 (33% distance): Close 50% of position
      // TP2 (66% distance): Close 30% of position
      // TP3 (100% distance): Close remaining 20%
      // ============================================================
      const currentTpLevel = position.partial_tp_level || 0;
      const originalQty = position.original_quantity || position.quantity;
      
      // Calculate TP prices if not set (first time check)
      let tp1Price = position.tp1_price;
      let tp2Price = position.tp2_price;
      let tp3Price = position.tp3_price || position.take_profit;
      
      if (!tp1Price || !tp2Price) {
        const tpDistance = Math.abs(position.take_profit - position.entry_price);
        // Safety check: If TP is same as entry (shouldn't happen), use ATR-based default
        const effectiveTpDistance = tpDistance > 0 ? tpDistance : (position.entry_price * atrPercent / 100) * 2;
        
        if (position.side === "BUY") {
          tp1Price = position.entry_price + (effectiveTpDistance * 0.33);
          tp2Price = position.entry_price + (effectiveTpDistance * 0.66);
          tp3Price = position.take_profit || position.entry_price + effectiveTpDistance;
        } else {
          tp1Price = position.entry_price - (effectiveTpDistance * 0.33);
          tp2Price = position.entry_price - (effectiveTpDistance * 0.66);
          tp3Price = position.take_profit || position.entry_price - effectiveTpDistance;
        }
        
        // Save TP prices to position with error handling
        const { error: tpUpdateError } = await supabase
          .from("positions")
          .update({ 
            tp1_price: tp1Price, 
            tp2_price: tp2Price, 
            tp3_price: tp3Price,
            original_quantity: originalQty 
          })
          .eq("id", position.id)
          .eq("status", "active");
        
        if (tpUpdateError) {
          console.error(`Failed to set partial TP levels for ${position.symbol}:`, tpUpdateError);
        } else {
          console.log(`📊 Set partial TP levels for ${position.symbol}: TP1=$${tp1Price.toFixed(2)}, TP2=$${tp2Price.toFixed(2)}, TP3=$${tp3Price.toFixed(2)}`);
        }
      }
      
      // Check partial TP levels (only if not already at that level)
      let partialTpTriggered = false;
      let partialClosePercent = 0;
      let newTpLevel = currentTpLevel;
      let partialCloseReason = "";
      
      if (position.side === "BUY") {
        // LONG: TP when price goes UP
        if (currentTpLevel < 1 && currentPrice >= tp1Price) {
          partialTpTriggered = true;
          partialClosePercent = 50; // Close 50%
          newTpLevel = 1;
          partialCloseReason = "partial_tp_1";
          console.log(`🎯 TP1 HIT for LONG ${position.symbol}: Price $${currentPrice.toFixed(2)} >= TP1 $${tp1Price.toFixed(2)}`);
        } else if (currentTpLevel < 2 && currentTpLevel >= 1 && currentPrice >= tp2Price) {
          partialTpTriggered = true;
          partialClosePercent = 60; // Close 60% of remaining (30% of original)
          newTpLevel = 2;
          partialCloseReason = "partial_tp_2";
          console.log(`🎯 TP2 HIT for LONG ${position.symbol}: Price $${currentPrice.toFixed(2)} >= TP2 $${tp2Price.toFixed(2)}`);
        }
      } else {
        // SHORT: TP when price goes DOWN
        if (currentTpLevel < 1 && currentPrice <= tp1Price) {
          partialTpTriggered = true;
          partialClosePercent = 50;
          newTpLevel = 1;
          partialCloseReason = "partial_tp_1";
          console.log(`🎯 TP1 HIT for SHORT ${position.symbol}: Price $${currentPrice.toFixed(2)} <= TP1 $${tp1Price.toFixed(2)}`);
        } else if (currentTpLevel < 2 && currentTpLevel >= 1 && currentPrice <= tp2Price) {
          partialTpTriggered = true;
          partialClosePercent = 60;
          newTpLevel = 2;
          partialCloseReason = "partial_tp_2";
          console.log(`🎯 TP2 HIT for SHORT ${position.symbol}: Price $${currentPrice.toFixed(2)} <= TP2 $${tp2Price.toFixed(2)}`);
        }
      }
      
      // Execute partial close if triggered
      if (partialTpTriggered) {
        const closeQuantity = position.quantity * (partialClosePercent / 100);
        const remainingQuantity = position.quantity - closeQuantity;
        const partialPnl = position.side === "BUY"
          ? (currentPrice - position.entry_price) * closeQuantity
          : (position.entry_price - currentPrice) * closeQuantity;
        const partialPnlPercent = position.side === "BUY"
          ? ((currentPrice - position.entry_price) / position.entry_price) * 100
          : ((position.entry_price - currentPrice) / position.entry_price) * 100;
        
        // Update position with reduced quantity and new TP level
        const { data: updatedPartialPos, error: partialUpdateError } = await supabase
          .from("positions")
          .update({
            quantity: remainingQuantity,
            partial_tp_level: newTpLevel,
            // Also move stop loss to break-even after first TP hit
            stop_loss: newTpLevel === 1 ? position.entry_price : position.stop_loss,
          })
          .eq("id", position.id)
          .eq("status", "active")
          .select()
          .maybeSingle();
        
        if (partialUpdateError) {
          console.error(`Error executing partial TP for ${position.id}:`, partialUpdateError);
        } else if (updatedPartialPos) {
          partialTpTaken.push({
            symbol: position.symbol,
            side: position.side,
            tpLevel: newTpLevel,
            closedQuantity: closeQuantity,
            remainingQuantity,
            exitPrice: currentPrice,
            partialPnl,
            partialPnlPercent,
            reason: partialCloseReason,
          });
          
          console.log(`✅ Partial TP${newTpLevel} executed: ${position.symbol} closed ${closeQuantity.toFixed(4)} (${partialClosePercent}%), remaining ${remainingQuantity.toFixed(4)}, P&L: $${partialPnl.toFixed(2)} (${partialPnlPercent.toFixed(2)}%)`);
          
          // Move stop loss to break-even after TP1
          if (newTpLevel === 1) {
            console.log(`🔒 Stop loss moved to break-even ($${position.entry_price.toFixed(2)}) after TP1`);
          }
          
          // Send notification for partial TP
          try {
            const { data: riskParams } = await supabase
              .from("risk_parameters")
              .select("notification_email, email_notifications_enabled")
              .eq("user_id", position.user_id)
              .single();
            
            if (riskParams?.email_notifications_enabled) {
              await supabase.functions.invoke("send-notification", {
                body: {
                  type: "partial_take_profit",
                  userId: position.user_id,
                  positionId: position.id,
                  symbol: position.symbol,
                  side: position.side,
                  tpLevel: newTpLevel,
                  closedQuantity: closeQuantity,
                  remainingQuantity,
                  exitPrice: currentPrice,
                  partialPnl,
                  partialPnlPercent,
                  email: riskParams.notification_email,
                },
              });
            }
          } catch (notifError) {
            console.error("Error sending partial TP notification:", notifError);
          }
        }
        
        // Update position object for further checks in this loop iteration
        position.quantity = remainingQuantity;
        position.partial_tp_level = newTpLevel;
        if (newTpLevel === 1) {
          position.stop_loss = position.entry_price;
          newStopLoss = position.entry_price;
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
          // Trailing was activated if: stop was moved UP from entry (for LONG, stop > entry = profit locked)
          // More accurate: check if we're in profit but hit stop (trailing scenario)
          const trailingWasActivated = userSettings.enabled && newStopLoss > position.entry_price;
          closeReason = trailingWasActivated ? "trailing_stop_loss" : "stop_loss";
        }
      } else if (!shouldClose && position.side === "SELL") {
        // SHORT: TP when price goes DOWN, SL when price goes UP
        if (position.take_profit && currentPrice <= position.take_profit) {
          shouldClose = true;
          closeReason = "take_profit";
        } else if (newStopLoss && currentPrice >= newStopLoss) {
          shouldClose = true;
          // Trailing was activated if: stop was moved DOWN from entry (for SHORT, stop < entry = profit locked)
          const trailingWasActivated = userSettings.enabled && newStopLoss < position.entry_price;
          closeReason = trailingWasActivated ? "trailing_stop_loss" : "stop_loss";
        }
      }
      if (shouldClose) {
        // Close the position with optimistic locking to prevent race conditions
        // Only update if status is still 'active' - prevents double-closing
        const { data: updatedPosition, error: closePosError } = await supabase
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
          .eq("id", position.id)
          .eq("status", "active") // RACE CONDITION FIX: Only close if still active
          .select()
          .maybeSingle();

        if (closePosError) {
          console.error(`Error closing position ${position.id}:`, closePosError);
          continue; // Skip to next position instead of throwing
        }

        // Only count as closed if we actually updated a row (wasn't already closed by another process)
        if (updatedPosition) {
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
        } else {
          console.log(
            `Position ${position.id} was already closed by another process - skipping`,
          );
        }
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
      breakEvenUpdates,
      trendExits,
      partialTpTaken,
      emergencyExits,
      volatilityAlerts,
      message: `Updated ${updates.length} positions, ${trailingStopUpdates.length} trailing stops, ${breakEvenUpdates.length} break-even stops, ${partialTpTaken.length} partial TPs, closed ${closedPositions.length} positions (${trendExits.length} trend exits, ${emergencyExits.length} emergency exits), ${volatilityAlerts.length} volatility alerts`,
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
