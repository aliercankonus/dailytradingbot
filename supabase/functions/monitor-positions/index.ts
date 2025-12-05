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
  
  // CRON_SECRET validation - protect against unauthorized invocations
  const cronSecret = Deno.env.get("CRON_SECRET");
  const providedSecret = req.headers.get("x-cron-secret");
  
  // Allow if either: CRON_SECRET is not set (development), or secrets match
  if (cronSecret && providedSecret !== cronSecret) {
    console.error("Unauthorized: Invalid or missing cron secret");
    return new Response(
      JSON.stringify({ success: false, error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
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
      .select("user_id, trailing_stop_enabled, trailing_stop_activation_percent, trailing_stop_distance_multiplier, break_even_enabled, break_even_activation_percent, trailing_stop_profit_lock_percent, portfolio_value, portfolio_peak_value, drawdown_circuit_breaker_enabled, drawdown_circuit_breaker_percent, circuit_breaker_triggered, time_based_stop_enabled, time_based_stop_hours, dynamic_stop_tightening_enabled, dynamic_stop_tightening_hours, dynamic_stop_tightening_percent, partial_loss_taking_enabled, partial_loss_trigger_percent, partial_loss_close_percent")
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
          profitLockPercent: (rp.trailing_stop_profit_lock_percent ?? 50) / 100, // Convert to decimal
          // Loss Management Settings
          portfolioValue: rp.portfolio_value ?? 10000,
          portfolioPeakValue: rp.portfolio_peak_value ?? 10000,
          drawdownCircuitBreakerEnabled: rp.drawdown_circuit_breaker_enabled ?? true,
          drawdownCircuitBreakerPercent: rp.drawdown_circuit_breaker_percent ?? 10,
          circuitBreakerTriggered: rp.circuit_breaker_triggered ?? false,
          timeBasedStopEnabled: rp.time_based_stop_enabled ?? true,
          timeBasedStopHours: rp.time_based_stop_hours ?? 4,
          dynamicStopTighteningEnabled: rp.dynamic_stop_tightening_enabled ?? true,
          dynamicStopTighteningHours: rp.dynamic_stop_tightening_hours ?? 2,
          dynamicStopTighteningPercent: rp.dynamic_stop_tightening_percent ?? 25,
          // Partial Loss Taking
          partialLossTakingEnabled: rp.partial_loss_taking_enabled ?? true,
          partialLossTriggerPercent: rp.partial_loss_trigger_percent ?? 50,
          partialLossClosePercent: rp.partial_loss_close_percent ?? 50,
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
    const updatedStopLossMap = new Map<string, number>(); // Track updated stop losses by position ID
    
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

      // Get user settings early for circuit breaker check
      const userSettingsEarly = userSettingsMap.get(position.user_id);
      
      // ============================================================
      // DRAWDOWN CIRCUIT BREAKER - Skip processing if triggered
      // ============================================================
      if (userSettingsEarly?.circuitBreakerTriggered) {
        console.log(`🛑 CIRCUIT BREAKER ACTIVE for user ${position.user_id} - Skipping position monitoring`);
        continue;
      }

      // Check and update circuit breaker status based on current drawdown
      if (userSettingsEarly?.drawdownCircuitBreakerEnabled) {
        const peakValue = userSettingsEarly.portfolioPeakValue || 10000;
        const currentValue = userSettingsEarly.portfolioValue || 10000;
        const drawdownPercent = ((peakValue - currentValue) / peakValue) * 100;
        
        if (drawdownPercent >= userSettingsEarly.drawdownCircuitBreakerPercent) {
          console.log(`🚨 DRAWDOWN CIRCUIT BREAKER TRIGGERED: ${drawdownPercent.toFixed(2)}% drawdown exceeds ${userSettingsEarly.drawdownCircuitBreakerPercent}% threshold`);
          
          // Trigger circuit breaker in database
          const { error: cbError } = await supabase
            .from("risk_parameters")
            .update({ 
              circuit_breaker_triggered: true,
              circuit_breaker_triggered_at: new Date().toISOString(),
              is_trading_enabled: false // Also pause trading
            })
            .eq("user_id", position.user_id);
          
          if (cbError) {
            console.error("Error triggering circuit breaker:", cbError);
          } else {
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
                    type: "circuit_breaker_triggered",
                    userId: position.user_id,
                    drawdownPercent,
                    threshold: userSettingsEarly.drawdownCircuitBreakerPercent,
                    email: riskParams.notification_email,
                  },
                });
              }
            } catch (notifError) {
              console.error("Error sending circuit breaker notification:", notifError);
            }
          }
          continue; // Skip further processing for this user
        }
        
        // Update peak value if current portfolio is higher
        if (currentValue > peakValue) {
          await supabase
            .from("risk_parameters")
            .update({ portfolio_peak_value: currentValue })
            .eq("user_id", position.user_id);
          console.log(`📈 Updated portfolio peak for user ${position.user_id}: $${currentValue.toFixed(2)}`);
        }
      }

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
        profitLockPercent: 0.5,
        // Loss Management defaults
        portfolioValue: 10000,
        portfolioPeakValue: 10000,
        drawdownCircuitBreakerEnabled: true,
        drawdownCircuitBreakerPercent: 10,
        circuitBreakerTriggered: false,
        timeBasedStopEnabled: true,
        timeBasedStopHours: 4,
        dynamicStopTighteningEnabled: true,
        dynamicStopTighteningHours: 2,
        dynamicStopTighteningPercent: 25,
        // Partial Loss Taking defaults
        partialLossTakingEnabled: true,
        partialLossTriggerPercent: 50,
        partialLossClosePercent: 50,
      };
      // TRAILING STOP LOSS LOGIC - Position-specific calculation based on EACH position's entry price
      // IMPORTANT: Trailing stop must NEVER set stop closer than 1% to entry price
      let newStopLoss = position.stop_loss;
      let trailingActivated = false;
      
      // Minimum stop loss distance (1% from entry) - prevents premature exits
      const MIN_TRAILING_STOP_DISTANCE_PERCENT = 1.0;
      const minDistanceFromEntry = position.entry_price * (MIN_TRAILING_STOP_DISTANCE_PERCENT / 100);
      
      // Check if trailing stop is enabled and position is profitable enough
      if (userSettings.enabled && pnlPercent > userSettings.activationPercent) {
        // Calculate ATR-based minimum distance (for volatility buffer)
        const atrAbsolute = (currentPrice * atrPercent) / 100;
        const minTrailingDistance = Math.max(atrAbsolute * userSettings.distanceMultiplier, currentPrice * 0.015); // Min 1.5% of current price
        
        // Use configurable profit lock percentage from user settings
        const profitLockPercent = userSettings.profitLockPercent;
        
        if (position.side === "BUY") {
          // For LONG: Calculate profit from THIS position's entry
          const profitDistance = currentPrice - position.entry_price;
          const lockedProfit = profitDistance * profitLockPercent;
          
          // Position-specific stop: entry + locked profit, but maintain minimum ATR distance from current price
          const profitBasedStop = position.entry_price + lockedProfit;
          const atrBasedStop = currentPrice - minTrailingDistance;
          
          // Use the HIGHER of the two (more protective)
          let calculatedStopLoss = Math.max(profitBasedStop, atrBasedStop);
          
          // ENFORCE MINIMUM 1% DISTANCE FROM ENTRY - trailing stop must not be too close to entry
          // For BUY: stop must be AT LEAST 1% below entry (stop_loss <= entry - 1%)
          const maxAllowedStop = position.entry_price - minDistanceFromEntry;
          if (calculatedStopLoss > maxAllowedStop) {
            // Don't set trailing stop if it would be closer than 1% to entry
            console.log(`⚠️ Trailing SL skipped for ${position.symbol} BUY - calculated stop ${calculatedStopLoss.toFixed(2)} too close to entry ${position.entry_price.toFixed(2)} (must be <= ${maxAllowedStop.toFixed(2)} for 1% min distance)`);
          } else {
            // 🔒 RATCHETING MECHANISM: Stop can ONLY move UP for BUY positions (never down)
            // This ensures we never give back locked-in profit when price pulls back
            // Current stop_loss represents the "high-water mark" of protection
            if (calculatedStopLoss > position.stop_loss) {
              newStopLoss = calculatedStopLoss;
              trailingActivated = true;
              const distancePercent = ((position.entry_price - newStopLoss) / position.entry_price) * 100;
              console.log(
                `🔺 Trailing SL RAISED for ${position.symbol} BUY (entry: ${position.entry_price.toFixed(2)}): ${position.stop_loss.toFixed(2)} → ${newStopLoss.toFixed(2)} (${Math.abs(distancePercent).toFixed(2)}% from entry, profit-based: ${profitBasedStop.toFixed(2)}, atr-based: ${atrBasedStop.toFixed(2)}, current: ${currentPrice.toFixed(2)}, P&L: ${pnlPercent.toFixed(2)}%)`,
              );
            } else {
              // Log when ratchet prevents regression
              console.log(
                `🔒 Trailing SL HELD at peak for ${position.symbol} BUY - calculated ${calculatedStopLoss.toFixed(2)} would be lower than current ${position.stop_loss.toFixed(2)} (ratchet prevents regression)`,
              );
            }
          }
        } else {
          // For SHORT: Calculate profit from THIS position's entry
          const profitDistance = position.entry_price - currentPrice;
          const lockedProfit = profitDistance * profitLockPercent;
          
          // Position-specific stop: entry - locked profit, but maintain minimum ATR distance from current price
          const profitBasedStop = position.entry_price - lockedProfit;
          const atrBasedStop = currentPrice + minTrailingDistance;
          
          // Use the LOWER of the two (more protective for shorts)
          let calculatedStopLoss = Math.min(profitBasedStop, atrBasedStop);
          
          // ENFORCE MINIMUM 1% DISTANCE FROM ENTRY - trailing stop must not be too close to entry
          // For SHORT: stop must be AT LEAST 1% above entry (stop_loss >= entry + 1%)
          const minAllowedStop = position.entry_price + minDistanceFromEntry;
          if (calculatedStopLoss < minAllowedStop) {
            // Don't set trailing stop if it would be closer than 1% to entry
            console.log(`⚠️ Trailing SL skipped for ${position.symbol} SHORT - calculated stop ${calculatedStopLoss.toFixed(2)} too close to entry ${position.entry_price.toFixed(2)} (must be >= ${minAllowedStop.toFixed(2)} for 1% min distance)`);
          } else {
            // 🔒 RATCHETING MECHANISM: Stop can ONLY move DOWN for SHORT positions (never up)
            // This ensures we never give back locked-in profit when price bounces
            // Current stop_loss represents the "low-water mark" of protection
            if (calculatedStopLoss < position.stop_loss) {
              newStopLoss = calculatedStopLoss;
              trailingActivated = true;
              const distancePercent = ((newStopLoss - position.entry_price) / position.entry_price) * 100;
              console.log(
                `🔻 Trailing SL LOWERED for ${position.symbol} SHORT (entry: ${position.entry_price.toFixed(2)}): ${position.stop_loss.toFixed(2)} → ${newStopLoss.toFixed(2)} (${Math.abs(distancePercent).toFixed(2)}% from entry, profit-based: ${profitBasedStop.toFixed(2)}, atr-based: ${atrBasedStop.toFixed(2)}, current: ${currentPrice.toFixed(2)}, P&L: ${pnlPercent.toFixed(2)}%)`,
              );
            } else {
              // Log when ratchet prevents regression
              console.log(
                `🔒 Trailing SL HELD at peak for ${position.symbol} SHORT - calculated ${calculatedStopLoss.toFixed(2)} would be higher than current ${position.stop_loss.toFixed(2)} (ratchet prevents regression)`,
              );
            }
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
            // Track the updated stop loss so partial TP logic can use it
            updatedStopLossMap.set(position.id, newStopLoss);
            
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
      // IMPORTANT: Only activate break-even if profit exceeds minimum stop distance (1%)
      // to prevent premature exits from normal market volatility
      // ============================================================
      const MIN_STOP_DISTANCE_PERCENT = 1.0; // 1% minimum stop loss distance
      const isBreakEvenEligible = userSettings.breakEvenEnabled && 
                                  pnlPercent >= Math.max(userSettings.breakEvenActivationPercent, MIN_STOP_DISTANCE_PERCENT) &&
                                  !trailingActivated; // Don't apply if trailing stop already moved

      if (isBreakEvenEligible) {
        const entryPrice = position.entry_price;
        let shouldMoveToBreakEven = false;
        
        // Calculate minimum stop distance from current price
        const minDistanceFromCurrent = currentPrice * (MIN_STOP_DISTANCE_PERCENT / 100);

        if (position.side === "BUY") {
          // For LONG: Only move stop to entry if it maintains minimum distance from current price
          // AND current stop is below entry
          if (position.stop_loss < entryPrice && (currentPrice - entryPrice) >= minDistanceFromCurrent) {
            shouldMoveToBreakEven = true;
          }
        } else {
          // For SHORT: Only move stop to entry if it maintains minimum distance from current price
          // AND current stop is above entry
          if (position.stop_loss > entryPrice && (entryPrice - currentPrice) >= minDistanceFromCurrent) {
            shouldMoveToBreakEven = true;
          }
        }

        if (shouldMoveToBreakEven) {
          console.log(`🛡️ BREAK-EVEN: Moving stop to entry for ${position.symbol} (P&L: ${pnlPercent.toFixed(2)}%, Entry: ${entryPrice.toFixed(2)}, Min distance maintained)`);
          
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
        const momentum = trendData.momentum || {};
        const stochRsi = trendData.stochasticRsi?.aggregated || trendData.stochasticRsi || {};

        // ============= REVERSAL RISK DETECTION FOR EXITS =============
        // Calculate reversal risk score for the CURRENT position direction
        const detectReversalRiskForExit = (positionSide: string): { riskScore: number; signals: string[] } => {
          const signals: string[] = [];
          let riskScore = 0;
          
          // Check if momentum is turning against position
          if (momentum.hasDivergence) {
            riskScore += 25;
            signals.push("MACD divergence detected");
          }
          if (!momentum.confirms && momentum.state !== "confirmed") {
            riskScore += 15;
            signals.push(`Momentum weakening (state: ${momentum.state || "none"})`);
          }
          if (!momentum.lastCloseAlignsWithTrend) {
            riskScore += 10;
            signals.push("Last close opposes trend");
          }
          if (!momentum.macdDirectionAligned) {
            riskScore += 15;
            signals.push("MACD direction misaligned");
          }
          
          // For SHORT positions: check for bullish reversal signals
          if (positionSide === "SELL") {
            if (stochRsi.bullishCrossCount >= 1) {
              riskScore += 25;
              signals.push(`StochRSI bullish cross (${stochRsi.bullishCrossCount} TF)`);
            }
            if (stochRsi.oversoldCount >= 2) {
              riskScore += 15;
              signals.push(`StochRSI oversold on ${stochRsi.oversoldCount} TF (bounce risk)`);
            }
            if (trend1h === "bullish") {
              riskScore += 20;
              signals.push("1h trend turned bullish");
            }
          }
          // For LONG positions: check for bearish reversal signals
          else if (positionSide === "BUY") {
            if (stochRsi.bearishCrossCount >= 1) {
              riskScore += 25;
              signals.push(`StochRSI bearish cross (${stochRsi.bearishCrossCount} TF)`);
            }
            if (stochRsi.overboughtCount >= 2) {
              riskScore += 15;
              signals.push(`StochRSI overbought on ${stochRsi.overboughtCount} TF (pullback risk)`);
            }
            if (trend1h === "bearish") {
              riskScore += 20;
              signals.push("1h trend turned bearish");
            }
          }
          
          return { riskScore: Math.min(100, riskScore), signals };
        };

        // For SHORT positions: Exit if trend turns bullish OR ranging (market indecision) with lower threshold
        // Also exit if there's higher timeframe conflict (4h bearish vs 1h bullish = dangerous for shorts)
        if (position.side === "SELL") {
          const htfConflict = trend4h === "bearish" && trend1h === "bullish"; // Higher timeframe conflict
          
          // Get 4h confidence from timeframes data (early warning threshold)
          const confidence4h = trendData.timeframes?.['4h']?.confidence || trendConfidence;

          // 🆕 REVERSAL RISK EXIT: Check leading indicators for early reversal detection
          const reversalRisk = detectReversalRiskForExit("SELL");
          const REVERSAL_RISK_EXIT_THRESHOLD = 60; // Exit if risk >= 60
          const MIN_LOSS_FOR_REVERSAL_EXIT = -0.1; // Only exit if losing at least 0.1%
          
          if (reversalRisk.riskScore >= REVERSAL_RISK_EXIT_THRESHOLD && pnlPercent < MIN_LOSS_FOR_REVERSAL_EXIT) {
            shouldClose = true;
            closeReason = "reversal_risk_high";
            console.log(
              `⚠️ REVERSAL RISK EXIT: Closing SHORT ${position.symbol} - Risk ${reversalRisk.riskScore}/100: ${reversalRisk.signals.join(", ")}`,
            );
          }
          // Original early warning logic (kept as fallback)
          else {
            const EARLY_WARNING_MIN_LOSS_PERCENT = -0.2;
            if (trend1h === "bullish" && confidence4h < 70 && pnlPercent < EARLY_WARNING_MIN_LOSS_PERCENT) {
              shouldClose = true;
              closeReason = "early_warning_1h_bullish";
              console.log(
                `⚠️ EARLY WARNING EXIT: Closing SHORT ${position.symbol} - 1h BULLISH + 4h weakening (4h conf: ${confidence4h}%, 4h: ${trend4h}, 1h: ${trend1h})`,
              );
            } else if (currentTrend === "bullish" && trendConfidence >= 50) {
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

          // 🆕 REVERSAL RISK EXIT: Check leading indicators for early reversal detection
          const reversalRisk = detectReversalRiskForExit("BUY");
          const REVERSAL_RISK_EXIT_THRESHOLD = 60; // Exit if risk >= 60
          const MIN_LOSS_FOR_REVERSAL_EXIT = -0.1; // Only exit if losing at least 0.1%
          
          if (!shouldClose && reversalRisk.riskScore >= REVERSAL_RISK_EXIT_THRESHOLD && pnlPercent < MIN_LOSS_FOR_REVERSAL_EXIT) {
            shouldClose = true;
            closeReason = "reversal_risk_high";
            console.log(
              `⚠️ REVERSAL RISK EXIT: Closing LONG ${position.symbol} - Risk ${reversalRisk.riskScore}/100: ${reversalRisk.signals.join(", ")}`,
            );
          }
          // Original early warning logic (kept as fallback)
          else {
            const EARLY_WARNING_MIN_LOSS_PERCENT_LONG = -0.2;
            if (!shouldClose && trend1h === "bearish" && confidence4h < 70 && pnlPercent < EARLY_WARNING_MIN_LOSS_PERCENT_LONG) {
              shouldClose = true;
              closeReason = "early_warning_1h_bearish";
              console.log(
                `⚠️ EARLY WARNING EXIT: Closing LONG ${position.symbol} - 1h BEARISH + 4h weakening (4h conf: ${confidence4h}%, 4h: ${trend4h}, 1h: ${trend1h})`,
              );
            } else if (currentTrend === "bearish" && trendConfidence >= 50) {
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
      // TIME-BASED EXIT LOGIC - Close stale positions (CONFIGURABLE)
      // If position is open X+ hours with minimal movement (<2%), free up capital
      // ============================================================
      if (!shouldClose && position.opened_at && userSettings.timeBasedStopEnabled) {
        const openedAt = new Date(position.opened_at);
        const now = new Date();
        const hoursOpen = (now.getTime() - openedAt.getTime()) / (1000 * 60 * 60);
        const absMovement = Math.abs(pnlPercent);
        
        // Stale position: Open X+ hours with less than 2% price movement
        const minHoursForStaleCheck = userSettings.timeBasedStopHours;
        const maxMovementForStale = 2.0; // 2% threshold
        
        if (hoursOpen >= minHoursForStaleCheck && absMovement < maxMovementForStale) {
          shouldClose = true;
          closeReason = "time_based_stop";
          console.log(
            `⏰ TIME EXIT: Closing stale ${position.symbol} ${position.side} - Open ${hoursOpen.toFixed(1)}h with only ${pnlPercent.toFixed(2)}% movement (limit: ${minHoursForStaleCheck}h)`
          );
          
          trendExits.push({
            symbol: position.symbol,
            side: position.side,
            reason: `Time-based: ${hoursOpen.toFixed(1)}h open, ${pnlPercent.toFixed(2)}% P&L`,
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
      // DYNAMIC STOP TIGHTENING - Tighten stops on aging losing positions
      // Reduces exposure on positions that are losing and getting older
      // IMPORTANT: Always maintain minimum 1% stop distance from entry
      // ============================================================
      if (!shouldClose && pnlPercent < 0 && userSettings.dynamicStopTighteningEnabled && position.opened_at) {
        const openedAt = new Date(position.opened_at);
        const now = new Date();
        const hoursOpen = (now.getTime() - openedAt.getTime()) / (1000 * 60 * 60);
        
        // Only tighten after X hours and only for losing positions
        if (hoursOpen >= userSettings.dynamicStopTighteningHours) {
          const hoursOverThreshold = hoursOpen - userSettings.dynamicStopTighteningHours;
          const tighteningFactor = Math.min(hoursOverThreshold * (userSettings.dynamicStopTighteningPercent / 100), 0.9); // Max 90% tightening
          
          // Calculate minimum stop distance (1% of entry price)
          const minStopDistancePercent = 1.0;
          const minStopDistance = position.entry_price * (minStopDistancePercent / 100);
          
          if (position.side === "BUY") {
            // For LONG: Move stop loss closer to entry (higher), but respect 1% minimum
            const distanceToEntry = position.entry_price - position.stop_loss;
            const tightenedDistance = distanceToEntry * (1 - tighteningFactor);
            
            // Enforce minimum 1% distance from entry
            const clampedDistance = Math.max(tightenedDistance, minStopDistance);
            const newTightenedStop = position.entry_price - clampedDistance;
            
            // Only update if new stop is higher than current (tighter) AND respects minimum
            if (newTightenedStop > position.stop_loss) {
              const newDistancePercent = ((position.entry_price - newTightenedStop) / position.entry_price) * 100;
              console.log(`🔧 DYNAMIC TIGHTENING: ${position.symbol} LONG - Stop ${position.stop_loss.toFixed(2)} → ${newTightenedStop.toFixed(2)} (${newDistancePercent.toFixed(2)}% from entry, min ${minStopDistancePercent}%)`);
              
              const { error: tightenError } = await supabase
                .from("positions")
                .update({ stop_loss: newTightenedStop })
                .eq("id", position.id)
                .eq("status", "active");
              
              if (tightenError) {
                console.error(`Error tightening stop for ${position.id}:`, tightenError);
              }
            }
          } else {
            // For SHORT: Move stop loss closer to entry (lower), but respect 1% minimum
            const distanceToEntry = position.stop_loss - position.entry_price;
            const tightenedDistance = distanceToEntry * (1 - tighteningFactor);
            
            // Enforce minimum 1% distance from entry
            const clampedDistance = Math.max(tightenedDistance, minStopDistance);
            const newTightenedStop = position.entry_price + clampedDistance;
            
            // Only update if new stop is lower than current (tighter) AND respects minimum
            if (newTightenedStop < position.stop_loss) {
              const newDistancePercent = ((newTightenedStop - position.entry_price) / position.entry_price) * 100;
              console.log(`🔧 DYNAMIC TIGHTENING: ${position.symbol} SHORT - Stop ${position.stop_loss.toFixed(2)} → ${newTightenedStop.toFixed(2)} (${newDistancePercent.toFixed(2)}% from entry, min ${minStopDistancePercent}%)`);
              
              const { error: tightenError } = await supabase
                .from("positions")
                .update({ stop_loss: newTightenedStop })
                .eq("id", position.id)
                .eq("status", "active");
              
              if (tightenError) {
                console.error(`Error tightening stop for ${position.id}:`, tightenError);
              }
            }
          }
        }
      }

      // ============================================================
      // PARTIAL LOSS TAKING - Close part of losing position early
      // Reduces exposure before full stop loss is hit
      // ============================================================
      const currentPartialLossLevel = position.partial_loss_level || 0;
      
      if (!shouldClose && pnlPercent < 0 && userSettings.partialLossTakingEnabled && currentPartialLossLevel === 0) {
        // Calculate how far price has moved toward stop loss
        const stopDistance = Math.abs(position.stop_loss - position.entry_price);
        const currentLossDistance = position.side === "BUY"
          ? position.entry_price - currentPrice // For LONG: loss when price drops
          : currentPrice - position.entry_price; // For SHORT: loss when price rises
        
        // Only check if we're moving toward stop (positive loss distance)
        if (currentLossDistance > 0 && stopDistance > 0) {
          const lossProgressPercent = (currentLossDistance / stopDistance) * 100;
          
          if (lossProgressPercent >= userSettings.partialLossTriggerPercent) {
            // Trigger partial loss close
            const closePercent = userSettings.partialLossClosePercent / 100;
            const closeQuantity = position.quantity * closePercent;
            const remainingQuantity = position.quantity - closeQuantity;
            const partialLoss = position.side === "BUY"
              ? (currentPrice - position.entry_price) * closeQuantity
              : (position.entry_price - currentPrice) * closeQuantity;
            
            console.log(`✂️ PARTIAL LOSS: ${position.symbol} ${position.side} - Price ${lossProgressPercent.toFixed(1)}% toward stop, closing ${(closePercent * 100).toFixed(0)}%`);
            
            // Calculate P&L percent for closed portion
            const partialLossPercent = position.side === "BUY"
              ? ((currentPrice - position.entry_price) / position.entry_price) * 100
              : ((position.entry_price - currentPrice) / position.entry_price) * 100;
            
            // Update position with reduced quantity and mark partial loss taken
            const { data: updatedPartialLossPos, error: partialLossError } = await supabase
              .from("positions")
              .update({
                quantity: remainingQuantity,
                partial_loss_level: 1,
              })
              .eq("id", position.id)
              .eq("status", "active")
              .select()
              .maybeSingle();
            
            if (partialLossError) {
              console.error(`Error executing partial loss for ${position.id}:`, partialLossError);
            } else if (updatedPartialLossPos) {
              // Create a closed position record for the partial close (for history tracking)
              const { error: partialCloseRecordError } = await supabase
                .from("positions")
                .insert({
                  user_id: position.user_id,
                  symbol: position.symbol,
                  side: position.side,
                  quantity: closeQuantity,
                  entry_price: position.entry_price,
                  exit_price: currentPrice,
                  stop_loss: position.stop_loss,
                  take_profit: position.take_profit,
                  status: "closed",
                  close_reason: "partial_loss",
                  realized_pnl: partialLoss,
                  realized_pnl_percent: partialLossPercent,
                  opened_at: position.opened_at,
                  closed_at: new Date().toISOString(),
                  strategy_name: position.strategy_name,
                  trend: position.trend,
                  confidence_score: position.confidence_score,
                });
              
              if (partialCloseRecordError) {
                console.error(`Error creating partial loss record for ${position.symbol}:`, partialCloseRecordError);
              }
              
              console.log(`✅ Partial loss executed: ${position.symbol} closed ${closeQuantity.toFixed(4)} (${(closePercent * 100).toFixed(0)}%), remaining ${remainingQuantity.toFixed(4)}, Loss: $${partialLoss.toFixed(2)} (${partialLossPercent.toFixed(2)}%)`);
              
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
                      type: "partial_loss_taken",
                      userId: position.user_id,
                      positionId: position.id,
                      symbol: position.symbol,
                      side: position.side,
                      closedQuantity: closeQuantity,
                      remainingQuantity,
                      exitPrice: currentPrice,
                      partialLoss,
                      partialLossPercent,
                      lossProgressPercent,
                      email: riskParams.notification_email,
                    },
                  });
                }
              } catch (notifError) {
                console.error("Error sending partial loss notification:", notifError);
              }
            }
          }
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
        // For stop loss after TP1: Only move to break-even if NOT already above entry (BUY) or below entry (SHORT)
        // This preserves trailing stop adjustments that are better than break-even
        // IMPORTANT: Use the updated stop loss from trailing stop if available (from same run)
        const currentStopLoss = updatedStopLossMap.get(position.id) ?? position.stop_loss;
        let newStopLossAfterTp = currentStopLoss;
        if (newTpLevel === 1) {
          if (position.side === "BUY") {
            // For LONG: Only move to entry if current stop is below entry
            newStopLossAfterTp = Math.max(position.entry_price, currentStopLoss);
          } else {
            // For SHORT: Only move to entry if current stop is above entry
            newStopLossAfterTp = Math.min(position.entry_price, currentStopLoss);
          }
        }
        
        const { data: updatedPartialPos, error: partialUpdateError } = await supabase
          .from("positions")
          .update({
            quantity: remainingQuantity,
            partial_tp_level: newTpLevel,
            stop_loss: newStopLossAfterTp,
          })
          .eq("id", position.id)
          .eq("status", "active")
          .select()
          .maybeSingle();
        
        if (partialUpdateError) {
          console.error(`Error executing partial TP for ${position.id}:`, partialUpdateError);
        } else if (updatedPartialPos) {
          // Create a closed position record for the partial close (for history tracking)
          const { error: partialTpRecordError } = await supabase
            .from("positions")
            .insert({
              user_id: position.user_id,
              symbol: position.symbol,
              side: position.side,
              quantity: closeQuantity,
              entry_price: position.entry_price,
              exit_price: currentPrice,
              stop_loss: position.stop_loss,
              take_profit: position.take_profit,
              status: "closed",
              close_reason: partialCloseReason,
              realized_pnl: partialPnl,
              realized_pnl_percent: partialPnlPercent,
              opened_at: position.opened_at,
              closed_at: new Date().toISOString(),
              strategy_name: position.strategy_name,
              trend: position.trend,
              confidence_score: position.confidence_score,
            });
          
          if (partialTpRecordError) {
            console.error(`Error creating partial TP record for ${position.symbol}:`, partialTpRecordError);
          }
          
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
          
          // Log stop loss status after TP1
          if (newTpLevel === 1) {
            if (newStopLossAfterTp > position.entry_price && position.side === "BUY") {
              console.log(`🔒 Stop loss kept at trailing level ($${newStopLossAfterTp.toFixed(2)}) after TP1 (above break-even $${position.entry_price.toFixed(2)})`);
            } else if (newStopLossAfterTp < position.entry_price && position.side === "SELL") {
              console.log(`🔒 Stop loss kept at trailing level ($${newStopLossAfterTp.toFixed(2)}) after TP1 (below break-even $${position.entry_price.toFixed(2)})`);
            } else {
              console.log(`🔒 Stop loss moved to break-even ($${position.entry_price.toFixed(2)}) after TP1`);
            }
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
          // Determine close reason based on stop loss state:
          // 1. Break-even: stop_loss equals entry_price (protection at entry)
          // 2. Trailing stop: stop_loss is above entry_price (profit locked in)
          // 3. Regular stop loss: stop_loss is below entry_price (loss taken)
          if (Math.abs(newStopLoss - position.entry_price) < 0.0001) {
            // Stop loss is at entry price = break-even stop
            closeReason = "break_even";
          } else if (userSettings.enabled && newStopLoss > position.entry_price) {
            // Stop was moved above entry = trailing stop locked profit
            closeReason = "trailing_stop_loss";
          } else {
            // Regular stop loss
            closeReason = "stop_loss";
          }
        }
      } else if (!shouldClose && position.side === "SELL") {
        // SHORT: TP when price goes DOWN, SL when price goes UP
        if (position.take_profit && currentPrice <= position.take_profit) {
          shouldClose = true;
          closeReason = "take_profit";
        } else if (newStopLoss && currentPrice >= newStopLoss) {
          shouldClose = true;
          // Determine close reason based on stop loss state:
          // 1. Break-even: stop_loss equals entry_price (protection at entry)
          // 2. Trailing stop: stop_loss is below entry_price (profit locked in)
          // 3. Regular stop loss: stop_loss is above entry_price (loss taken)
          if (Math.abs(newStopLoss - position.entry_price) < 0.0001) {
            // Stop loss is at entry price = break-even stop
            closeReason = "break_even";
          } else if (userSettings.enabled && newStopLoss < position.entry_price) {
            // Stop was moved below entry = trailing stop locked profit
            closeReason = "trailing_stop_loss";
          } else {
            // Regular stop loss
            closeReason = "stop_loss";
          }
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
