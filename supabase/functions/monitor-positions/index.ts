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
  // Accept secret via header (x-cron-secret) or Authorization Bearer token
  const cronSecret = Deno.env.get("CRON_SECRET");
  const providedSecretHeader = req.headers.get("x-cron-secret");
  const authHeader = req.headers.get("authorization");
  const providedSecretBearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const providedSecret = providedSecretHeader || providedSecretBearer;
  
  // Also check if it's a scheduled cron call (Supabase internal scheduler)
  const isScheduledCron = req.headers.get("x-supabase-function-source") === "scheduler";
  
  // Allow if: no CRON_SECRET set (dev), secrets match, or it's a scheduled cron call
  if (cronSecret && !isScheduledCron && providedSecret !== cronSecret) {
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
      .select("user_id, trailing_stop_enabled, trailing_stop_activation_percent, trailing_stop_distance_multiplier, break_even_enabled, break_even_activation_percent, trailing_stop_profit_lock_percent, portfolio_value, portfolio_peak_value, drawdown_circuit_breaker_enabled, drawdown_circuit_breaker_percent, circuit_breaker_triggered, time_based_stop_enabled, time_based_stop_hours, dynamic_stop_tightening_enabled, dynamic_stop_tightening_hours, dynamic_stop_tightening_percent, partial_loss_taking_enabled, partial_loss_trigger_percent, partial_loss_close_percent, hedging_enabled, hedge_reversal_risk_min, hedge_reversal_risk_max, hedge_position_size_percent, min_hold_time_minutes")
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
          // Partial Loss Taking - 75% trigger gives positions more room to recover
          partialLossTakingEnabled: rp.partial_loss_taking_enabled ?? true,
          partialLossTriggerPercent: rp.partial_loss_trigger_percent ?? 75,
          partialLossClosePercent: rp.partial_loss_close_percent ?? 50,
          // Hedging Settings
          hedgingEnabled: rp.hedging_enabled ?? false,
          hedgeReversalRiskMin: rp.hedge_reversal_risk_min ?? 50,
          hedgeReversalRiskMax: rp.hedge_reversal_risk_max ?? 70,
          hedgePositionSizePercent: rp.hedge_position_size_percent ?? 50,
          // Minimum Hold Time (prevents early exits)
          minHoldTimeMinutes: rp.min_hold_time_minutes ?? 20,
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
    const hedgesOpened = []; // NEW: Track hedges opened for reversal risk
    const hedgesClosed: { symbol: string; parentSide: string; hedgePositionId: string; riskScore: number }[] = []; // NEW: Track hedges closed when risk drops
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
      // DYNAMIC THRESHOLDS (aligned with strategy-analyzer)
      // Use ADX and volume to determine exit sensitivity
      // ============================================================
      const trendDataForPosition = trendDataMap.get(position.symbol);
      const positionAdx = trendDataForPosition?.volatility?.adx || trendDataForPosition?.momentum?.adx || 20;
      const positionVolumeScore = trendDataForPosition?.volumeScore ?? 0;
      const positionConfidence = trendDataForPosition?.confidence ?? 50;
      
      // ============================================================
      // CONFIDENCE PENALTY FUNCTION (aligned with strategy-analyzer)
      // High confidence = trend exhaustion, penalize accordingly
      // ============================================================
      const getConfidencePenalty = (confidence: number): number => {
        if (confidence >= 85) return -25;   // Heavy penalty for extreme confidence
        if (confidence >= 80) return -18;   // Strong penalty
        if (confidence >= 75) return -12;   // Moderate penalty
        if (confidence >= 70) return -8;    // Light penalty
        if (confidence >= 60) return -12;   // DEAD ZONE: 60-69 penalty
        if (confidence >= 50) return 0;     // Optimal zone: 50-59
        return -3;  // Too low confidence
      };
      
      const confidencePenalty = getConfidencePenalty(positionConfidence);
      
      // ADX-based reversal risk threshold adjustment
      // Higher ADX = more lenient (allow higher reversal risk before exit)
      let dynamicReversalThreshold = 60; // Base threshold
      if (positionAdx >= 35) {
        dynamicReversalThreshold = 70; // Very strong trend - allow more reversal risk
      } else if (positionAdx >= 25) {
        dynamicReversalThreshold = 65; // Strong trend
      } else if (positionAdx < 20) {
        dynamicReversalThreshold = 55; // Weak trend - exit earlier
      }
      
      // Volume-aware exit: High volume confirmation = hold longer
      if (positionVolumeScore >= 7) {
        dynamicReversalThreshold += 5; // Volume strongly confirms - be more patient
      } else if (positionVolumeScore <= 2 && positionAdx < 25) {
        dynamicReversalThreshold -= 5; // Low volume + weak trend = exit sooner
      }
      
      // Apply confidence penalty to reversal threshold
      // High confidence (trend exhaustion) = tighter exit threshold
      if (confidencePenalty < -10) {
        dynamicReversalThreshold -= 5; // Exit sooner when confidence indicates exhaustion
        console.log(`📊 ${position.symbol}: Confidence penalty ${confidencePenalty} applied - threshold ${dynamicReversalThreshold}`);
      }
      
      // Log dynamic threshold calculation
      console.log(`📊 ${position.symbol}: Dynamic exit threshold=${dynamicReversalThreshold} (ADX=${positionAdx.toFixed(1)}, Vol=${positionVolumeScore}, Conf=${positionConfidence}%)`);
      
      
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
        // Partial Loss Taking defaults (increased trigger to 70% to reduce premature closures)
        partialLossTakingEnabled: true,
        partialLossTriggerPercent: 70,
        partialLossClosePercent: 50,
        // Hedging defaults
        hedgingEnabled: false,
        hedgeReversalRiskMin: 50,
        hedgeReversalRiskMax: 70,
        hedgePositionSizePercent: 50,
        // Minimum Hold Time defaults
        minHoldTimeMinutes: 20,
      };
      
      // 🆕 MINIMUM HOLD TIME CHECK - Prevents early exits on new positions
      const positionOpenedAt = new Date(position.opened_at || position.executed_at || Date.now());
      const positionAgeMinutes = (Date.now() - positionOpenedAt.getTime()) / (1000 * 60);
      const hasMetMinHoldTime = positionAgeMinutes >= userSettings.minHoldTimeMinutes;
      
      if (!hasMetMinHoldTime) {
        console.log(`⏳ ${position.symbol}: Position age ${positionAgeMinutes.toFixed(1)}min < ${userSettings.minHoldTimeMinutes}min hold time - skipping reversal/hedge/early exit checks`);
      }
      
      // TRAILING STOP LOSS LOGIC - Position-specific calculation based on EACH position's entry price
      // IMPORTANT: Trailing stop must NEVER set stop closer than 1% to entry price
      // Uses PERSISTED peak_pnl_percent for ratcheting lock stop calculation
      let newStopLoss = position.stop_loss;
      let trailingActivated = false;
      let peakPnlUpdated = false;
      
      // Minimum stop loss distance (1% from entry) - prevents premature exits
      const MIN_TRAILING_STOP_DISTANCE_PERCENT = 1.0;
      const minDistanceFromEntry = position.entry_price * (MIN_TRAILING_STOP_DISTANCE_PERCENT / 100);
      
      // Get persisted peak P&L and update if current is higher (ratcheting)
      const currentPeakPnl = position.peak_pnl_percent || 0;
      const newPeakPnl = Math.max(currentPeakPnl, pnlPercent);
      if (newPeakPnl > currentPeakPnl) {
        peakPnlUpdated = true;
        console.log(`📈 Peak P&L updated for ${position.symbol} ${position.side}: ${currentPeakPnl.toFixed(2)}% → ${newPeakPnl.toFixed(2)}%`);
      }
      
      // Check if trailing stop is enabled and position is profitable enough
      if (userSettings.enabled && pnlPercent > userSettings.activationPercent) {
        // Calculate ATR-based minimum distance (for volatility buffer)
        const atrAbsolute = (currentPrice * atrPercent) / 100;
        const minTrailingDistance = Math.max(atrAbsolute * userSettings.distanceMultiplier, currentPrice * 0.015); // Min 1.5% of current price
        
        // Use configurable profit lock percentage from user settings
        const profitLockPercent = userSettings.profitLockPercent;
        
        if (position.side === "BUY") {
          // For LONG: Calculate LOCK STOP based on PEAK P&L (persisted, never decreases)
          // This ensures lock stop ratchets and never gives back profit
          const peakProfitDistance = position.entry_price * (newPeakPnl / 100);
          const lockedProfit = peakProfitDistance * profitLockPercent;
          
          // Position-specific stop: entry + locked profit based on PEAK (LOCK STOP PRICE)
          const lockStopPrice = position.entry_price + lockedProfit;
          const atrBasedStop = currentPrice - minTrailingDistance;
          
          // Use the HIGHER of the two (more protective)
          let calculatedStopLoss = Math.max(lockStopPrice, atrBasedStop);
          
          // ENFORCE MINIMUM 1% DISTANCE FROM CURRENT PRICE for trailing stops
          // For BUY: trailing stop should be BELOW current price by at least the ATR buffer
          // The stop must also not be too close to entry in the WRONG direction
          // For a profitable BUY, stop should be ABOVE entry (locking profit)
          // Only reject if the stop is BELOW entry and within 1% (which would be a losing stop)
          const minAllowedStop = position.entry_price - minDistanceFromEntry;
          const isStopTooCloseBelowEntry = calculatedStopLoss < position.entry_price && calculatedStopLoss > minAllowedStop;
          
          if (isStopTooCloseBelowEntry) {
            // Don't set trailing stop if it's below entry but within 1% (losing position with tight stop)
            console.log(`⚠️ Trailing SL skipped for ${position.symbol} BUY - calculated stop ${calculatedStopLoss.toFixed(2)} too close below entry ${position.entry_price.toFixed(2)} (must be <= ${minAllowedStop.toFixed(2)} if below entry)`);
          } else {
            // 🔒 LOCK STOP FLOOR: Stop must be at least at lock stop price (based on peak P&L)
            // This ensures we ALWAYS protect the locked profit percentage
            if (lockStopPrice > position.stop_loss) {
              newStopLoss = lockStopPrice;
              trailingActivated = true;
              const distancePercent = ((newStopLoss - position.entry_price) / position.entry_price) * 100;
              console.log(
                `🔐 LOCK STOP SET for ${position.symbol} BUY (entry: ${position.entry_price.toFixed(2)}): ${position.stop_loss.toFixed(2)} → ${newStopLoss.toFixed(2)} (${distancePercent.toFixed(2)}% from entry, peak P&L: ${newPeakPnl.toFixed(2)}%, lock: ${(profitLockPercent * 100).toFixed(0)}% of peak)`,
              );
            } else if (calculatedStopLoss > position.stop_loss) {
              // ATR-based stop is higher - use it
              newStopLoss = calculatedStopLoss;
              trailingActivated = true;
              const distancePercent = ((newStopLoss - position.entry_price) / position.entry_price) * 100;
              console.log(
                `🔺 Trailing SL RAISED for ${position.symbol} BUY (entry: ${position.entry_price.toFixed(2)}): ${position.stop_loss.toFixed(2)} → ${newStopLoss.toFixed(2)} (${distancePercent.toFixed(2)}% from entry, atr-based: ${atrBasedStop.toFixed(2)}, current: ${currentPrice.toFixed(2)}, P&L: ${pnlPercent.toFixed(2)}%)`,
              );
            } else {
              // Log when ratchet prevents regression
              console.log(
                `🔒 Trailing SL HELD at peak for ${position.symbol} BUY - lock stop ${lockStopPrice.toFixed(2)}, current SL ${position.stop_loss.toFixed(2)} (ratchet prevents regression)`,
              );
            }
          }
        } else {
          // For SHORT: Calculate LOCK STOP based on PEAK P&L (persisted, never decreases)
          const peakProfitDistance = position.entry_price * (newPeakPnl / 100);
          const lockedProfit = peakProfitDistance * profitLockPercent;
          
          // Position-specific stop: entry - locked profit based on PEAK (LOCK STOP PRICE)
          const lockStopPrice = position.entry_price - lockedProfit;
          const atrBasedStop = currentPrice + minTrailingDistance;
          
          // Use the LOWER of the two (more protective for shorts)
          let calculatedStopLoss = Math.min(lockStopPrice, atrBasedStop);
          
          // ENFORCE MINIMUM 1% DISTANCE FROM CURRENT PRICE for trailing stops
          // For SHORT: trailing stop should be ABOVE current price by at least the ATR buffer
          // The stop must also not be too close to entry in the WRONG direction
          // For a profitable SHORT, stop should be BELOW entry (locking profit)
          // Only reject if the stop is ABOVE entry and within 1% (which would be a losing stop)
          const maxAllowedStop = position.entry_price + minDistanceFromEntry;
          const isStopTooCloseAboveEntry = calculatedStopLoss > position.entry_price && calculatedStopLoss < maxAllowedStop;
          
          if (isStopTooCloseAboveEntry) {
            // Don't set trailing stop if it's above entry but within 1% (losing position with tight stop)
            console.log(`⚠️ Trailing SL skipped for ${position.symbol} SHORT - calculated stop ${calculatedStopLoss.toFixed(2)} too close above entry ${position.entry_price.toFixed(2)} (must be >= ${maxAllowedStop.toFixed(2)} if above entry)`);
          } else {
            // 🔒 LOCK STOP FLOOR: Stop must be at least at lock stop price (based on peak P&L)
            // This ensures we ALWAYS protect the locked profit percentage
            if (lockStopPrice < position.stop_loss) {
              newStopLoss = lockStopPrice;
              trailingActivated = true;
              const distancePercent = ((newStopLoss - position.entry_price) / position.entry_price) * 100;
              console.log(
                `🔐 LOCK STOP SET for ${position.symbol} SHORT (entry: ${position.entry_price.toFixed(2)}): ${position.stop_loss.toFixed(2)} → ${newStopLoss.toFixed(2)} (${Math.abs(distancePercent).toFixed(2)}% from entry, peak P&L: ${newPeakPnl.toFixed(2)}%, lock: ${(profitLockPercent * 100).toFixed(0)}% of peak)`,
              );
            } else if (calculatedStopLoss < position.stop_loss) {
              // ATR-based stop is lower - use it
              newStopLoss = calculatedStopLoss;
              trailingActivated = true;
              const distancePercent = ((newStopLoss - position.entry_price) / position.entry_price) * 100;
              console.log(
                `🔻 Trailing SL LOWERED for ${position.symbol} SHORT (entry: ${position.entry_price.toFixed(2)}): ${position.stop_loss.toFixed(2)} → ${newStopLoss.toFixed(2)} (${Math.abs(distancePercent).toFixed(2)}% from entry, atr-based: ${atrBasedStop.toFixed(2)}, current: ${currentPrice.toFixed(2)}, P&L: ${pnlPercent.toFixed(2)}%)`,
              );
            } else {
              // Log when ratchet prevents regression
              console.log(
                `🔒 Trailing SL HELD at peak for ${position.symbol} SHORT - lock stop ${lockStopPrice.toFixed(2)}, current SL ${position.stop_loss.toFixed(2)} (ratchet prevents regression)`,
              );
            }
          }
        }
        // Update stop loss AND peak_pnl_percent in database if trailing was activated or peak updated
        if (trailingActivated || peakPnlUpdated) {
          const updatePayload: { stop_loss?: number; peak_pnl_percent?: number } = {};
          if (trailingActivated) {
            updatePayload.stop_loss = newStopLoss;
          }
          if (peakPnlUpdated) {
            updatePayload.peak_pnl_percent = newPeakPnl;
          }
          
          // Use optimistic locking - only update if position is still active
          const { data: updatedPos, error: posUpdateError } = await supabase
            .from("positions")
            .update(updatePayload)
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

        // ============= REVERSAL RISK DETECTION FOR EXITS (aligned with strategy-analyzer) =============
        // Calculate reversal risk score for the CURRENT position direction
        // Uses ADX-adaptive weighting for consistency across functions
        const detectReversalRiskForExit = (positionSide: string): { riskScore: number; signals: string[]; adxWeight: number } => {
          const signals: string[] = [];
          let riskScore = 0;
          
          // ADX-based adaptive reversal weight (aligned with strategy-analyzer)
          const getAdxReversalWeight = (adxValue: number): number => {
            if (adxValue >= 35) return 0.5;  // Strong trend, reduce reversal impact
            if (adxValue >= 20) return 0.7;  // Moderate trend
            return 1.0;                       // Weak trend, full reversal impact
          };
          
          const adxWeight = getAdxReversalWeight(positionAdx);
          
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
            if ((stochRsi.bullishCrossCount || 0) >= 1) {
              riskScore += 25;
              signals.push(`StochRSI bullish cross (${stochRsi.bullishCrossCount} TF)`);
            }
            if ((stochRsi.oversoldCount || 0) >= 2) {
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
            if ((stochRsi.bearishCrossCount || 0) >= 1) {
              riskScore += 25;
              signals.push(`StochRSI bearish cross (${stochRsi.bearishCrossCount} TF)`);
            }
            if ((stochRsi.overboughtCount || 0) >= 2) {
              riskScore += 15;
              signals.push(`StochRSI overbought on ${stochRsi.overboughtCount} TF (pullback risk)`);
            }
            if (trend1h === "bearish") {
              riskScore += 20;
              signals.push("1h trend turned bearish");
            }
          }
          
          // Cap at 100, then apply ADX-based weight
          riskScore = Math.min(100, riskScore);
          const adjustedRiskScore = Math.round(riskScore * adxWeight);
          
          return { riskScore: adjustedRiskScore, signals, adxWeight };
        };

        // For SHORT positions: Exit if trend turns bullish OR ranging (market indecision) with lower threshold
        // Also exit if there's higher timeframe conflict (4h bearish vs 1h bullish = dangerous for shorts)
        if (position.side === "SELL") {
          const htfConflict = trend4h === "bearish" && trend1h === "bullish"; // Higher timeframe conflict
          
          // Get 4h confidence from timeframes data (early warning threshold)
          const confidence4h = trendData.timeframes?.['4h']?.confidence || trendConfidence;

          // 🆕 REVERSAL RISK HANDLING: Hedge or Exit based on risk level
          const reversalRisk = detectReversalRiskForExit("SELL");
          const MIN_LOSS_FOR_REVERSAL_EXIT = -0.5; // Only act if losing at least 0.5% (was -0.1%)
          
          // Check if position already has a hedge or is a hedge
          const hasHedge = position.hedge_position_id !== null;
          const isHedge = position.is_hedge === true;
          
          // 🆕 StochRSI filter for hedge opening - prevent hedges at extreme levels
          // For SHORT positions: Don't hedge when StochRSI K > 80 (overbought - price likely to drop, helping SHORT)
          const stochRsi4h = trendData.stochasticRsi?.["4h"] || trendData.stochasticRsi?.aggregated || {};
          const stochRsiK4h = stochRsi4h?.k ?? 50;
          const STOCHRSI_HEDGE_BLOCK_THRESHOLD_SHORT = 80; // Don't hedge SHORT when K > 80
          const shouldBlockHedgeByStochRsi = stochRsiK4h > STOCHRSI_HEDGE_BLOCK_THRESHOLD_SHORT;
          
          // Apply hedging logic if enabled and risk is in hedge range (50-70%)
          // Only apply if position has met minimum hold time AND StochRSI allows
          if (hasMetMinHoldTime && userSettings.hedgingEnabled && 
              !isHedge && // Don't hedge a hedge
              !hasHedge && // Don't open duplicate hedge
              !shouldBlockHedgeByStochRsi && // StochRSI filter
              reversalRisk.riskScore >= userSettings.hedgeReversalRiskMin && 
              reversalRisk.riskScore < userSettings.hedgeReversalRiskMax &&
              pnlPercent < MIN_LOSS_FOR_REVERSAL_EXIT) {
            // Open a hedge position (opposite direction)
            const hedgeQuantity = position.quantity * (userSettings.hedgePositionSizePercent / 100);
            const hedgeSide = "BUY"; // Opposite of SELL
            
            console.log(`🛡️ HEDGE: Opening ${hedgeSide} hedge for SHORT ${position.symbol} - Risk ${reversalRisk.riskScore}% | StochRSI 4h K=${stochRsiK4h.toFixed(1)}`);
            
            // Calculate hedge TP based on parent position's loss (to cover the loss)
            // Parent is SHORT, so parent loss = (currentPrice - entryPrice) / entryPrice * 100
            const parentLossPercent = ((currentPrice - position.entry_price) / position.entry_price) * 100;
            const parentLossAmount = Math.abs(parentLossPercent);
            
            // Hedge TP should cover the parent's loss + some profit (1.5x coverage)
            // BUY hedge profits when price goes UP
            const hedgeTpPercent = Math.max(parentLossAmount * 1.5, 1.0); // At least 1% TP
            const hedgeTpPrice = currentPrice * (1 + hedgeTpPercent / 100);
            const hedgeSlPrice = currentPrice * 0.985; // 1.5% stop for hedge (tighter for protection)
            
            console.log(`🛡️ HEDGE CALC: Parent SHORT loss ${parentLossPercent.toFixed(2)}%, Hedge TP target ${hedgeTpPercent.toFixed(2)}% at $${hedgeTpPrice.toFixed(4)}`);
            
            // Insert hedge position with dynamic TP to cover parent loss
            const { data: hedgePosition, error: hedgeError } = await supabase
              .from("positions")
              .insert({
                user_id: position.user_id,
                symbol: position.symbol,
                side: hedgeSide,
                quantity: hedgeQuantity,
                entry_price: currentPrice,
                current_price: currentPrice,
                stop_loss: hedgeSlPrice,
                take_profit: hedgeTpPrice,
                status: "active",
                is_hedge: true,
                parent_position_id: position.id,
                strategy_name: "Reversal Risk Hedge",
                trend: currentTrend,
                confidence_score: reversalRisk.riskScore,
              })
              .select()
              .single();
            
            if (!hedgeError && hedgePosition) {
              // Link hedge to parent position
              await supabase
                .from("positions")
                .update({ hedge_position_id: hedgePosition.id })
                .eq("id", position.id);
              
              hedgesOpened.push({
                symbol: position.symbol,
                parentSide: position.side,
                hedgeSide,
                hedgeQuantity,
                reversalRisk: reversalRisk.riskScore,
                parentPositionId: position.id,
                hedgePositionId: hedgePosition.id,
              });
              console.log(`✅ Hedge opened: ${hedgeSide} ${hedgeQuantity} ${position.symbol} at ${currentPrice}`);
            } else {
              console.error(`❌ Failed to open hedge: ${hedgeError?.message}`);
            }
          }
          // Log when hedge was blocked by StochRSI filter
          else if (shouldBlockHedgeByStochRsi && hasMetMinHoldTime && userSettings.hedgingEnabled && 
                   reversalRisk.riskScore >= userSettings.hedgeReversalRiskMin) {
            console.log(`🚫 HEDGE BLOCKED: SHORT ${position.symbol} - StochRSI 4h K=${stochRsiK4h.toFixed(1)} > 80 (overbought, price likely to drop - helps SHORT)`);
          }
          // If risk is VERY HIGH (>= 85%), close position instead (ONLY if losing significantly)
          // Raised threshold to 85% to reduce premature exits - these had 0% win rate in analysis
          // Only apply if position has met minimum hold time AND position age > 1 hour
          const positionAgeHours = positionAgeMinutes / 60;
          const MIN_AGE_FOR_REVERSAL_EXIT_HOURS = 1.0; // Don't exit on reversal risk in first hour
          // Use dynamic threshold from earlier calculation (aligned with strategy-analyzer)
          const REVERSAL_RISK_EXIT_THRESHOLD = dynamicReversalThreshold;
          
          if (hasMetMinHoldTime && 
              positionAgeHours >= MIN_AGE_FOR_REVERSAL_EXIT_HOURS &&
              reversalRisk.riskScore >= REVERSAL_RISK_EXIT_THRESHOLD && 
              pnlPercent < MIN_LOSS_FOR_REVERSAL_EXIT) {
            shouldClose = true;
            closeReason = "reversal_risk_high";
            console.log(
              `⚠️ REVERSAL RISK EXIT: Closing SHORT ${position.symbol} - Risk ${reversalRisk.riskScore}/100 (ADX weight: ${reversalRisk.adxWeight}) >= ${REVERSAL_RISK_EXIT_THRESHOLD} (dynamic), Age: ${positionAgeHours.toFixed(1)}h, ADX: ${positionAdx.toFixed(1)}, VolScore: ${positionVolumeScore}, Conf: ${positionConfidence}%`,
            );
          }
          
          // 🆕 HEDGE MANAGEMENT: Let hedge run with trailing stop - DON'T close just because risk dropped
          // Hedge should aim to cover the parent's loss, not close prematurely
          // The hedge will be closed by: its own TP, trailing stop, or when parent closes
          
          // Original early warning logic (kept as fallback) - TIGHTENED THRESHOLDS
          // Only apply if position has met minimum hold time AND losing more than 1%
          // These exits were causing 0% win rate - making much more conservative
          if (!shouldClose && hasMetMinHoldTime && positionAgeHours >= 1.0) {
            const EARLY_WARNING_MIN_LOSS_PERCENT = -1.0; // Increased from -0.2% to -1%
            const EARLY_WARNING_MIN_CONFIDENCE_4H = 50; // Reduced from 70% (4h must be very weak)
            
            if (trend1h === "bullish" && confidence4h < EARLY_WARNING_MIN_CONFIDENCE_4H && pnlPercent < EARLY_WARNING_MIN_LOSS_PERCENT) {
              shouldClose = true;
              closeReason = "early_warning_1h_bullish";
              console.log(
                `⚠️ EARLY WARNING EXIT: Closing SHORT ${position.symbol} - 1h BULLISH + 4h very weak (4h conf: ${confidence4h}%, P&L: ${pnlPercent.toFixed(2)}%)`,
              );
            } else if (currentTrend === "bullish" && trendConfidence >= 65) { // Raised from 50%
              shouldClose = true;
              closeReason = "trend_reversal_bullish";
              console.log(
                `🔄 TREND EXIT: Closing SHORT ${position.symbol} - Strong BULLISH trend (conf: ${trendConfidence}%)`,
              );
            }
            // REMOVED: Ranging market exits - these were too aggressive and hurt win rate
            // Let positions ride through ranging periods as long as they're not hitting stops
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

          // 🆕 REVERSAL RISK HANDLING: Hedge or Exit based on risk level
          const reversalRisk = detectReversalRiskForExit("BUY");
          const MIN_LOSS_FOR_REVERSAL_EXIT = -0.5; // Only act if losing at least 0.5% (was -0.1%)
          
          // Check if position already has a hedge or is a hedge
          const hasHedge = position.hedge_position_id !== null;
          const isHedge = position.is_hedge === true;
          
          // 🆕 StochRSI filter for hedge opening - prevent hedges at extreme levels
          // For LONG positions: Don't hedge when StochRSI K < 20 (oversold - price likely to bounce up, helping LONG)
          const stochRsi4hLong = trendData.stochasticRsi?.["4h"] || trendData.stochasticRsi?.aggregated || {};
          const stochRsiK4hLong = stochRsi4hLong?.k ?? 50;
          const STOCHRSI_HEDGE_BLOCK_THRESHOLD_LONG = 20; // Don't hedge LONG when K < 20
          const shouldBlockHedgeByStochRsiLong = stochRsiK4hLong < STOCHRSI_HEDGE_BLOCK_THRESHOLD_LONG;
          
          // Apply hedging logic if enabled and risk is in hedge range (50-70%)
          // Only apply if position has met minimum hold time AND StochRSI allows
          if (!shouldClose && hasMetMinHoldTime && userSettings.hedgingEnabled && 
              !isHedge && // Don't hedge a hedge
              !hasHedge && // Don't open duplicate hedge
              !shouldBlockHedgeByStochRsiLong && // StochRSI filter
              reversalRisk.riskScore >= userSettings.hedgeReversalRiskMin && 
              reversalRisk.riskScore < userSettings.hedgeReversalRiskMax &&
              pnlPercent < MIN_LOSS_FOR_REVERSAL_EXIT) {
            // Open a hedge position (opposite direction)
            const hedgeQuantity = position.quantity * (userSettings.hedgePositionSizePercent / 100);
            const hedgeSide = "SELL"; // Opposite of BUY
            
            console.log(`🛡️ HEDGE: Opening ${hedgeSide} hedge for LONG ${position.symbol} - Risk ${reversalRisk.riskScore}% | StochRSI 4h K=${stochRsiK4hLong.toFixed(1)}`);
            
            // Calculate hedge TP based on parent position's loss (to cover the loss)
            // Parent is BUY (LONG), so parent loss = (entryPrice - currentPrice) / entryPrice * 100
            const parentLossPercent = ((position.entry_price - currentPrice) / position.entry_price) * 100;
            const parentLossAmount = Math.abs(parentLossPercent);
            
            // Hedge TP should cover the parent's loss + some profit (1.5x coverage)
            // SELL hedge profits when price goes DOWN
            const hedgeTpPercent = Math.max(parentLossAmount * 1.5, 1.0); // At least 1% TP
            const hedgeTpPrice = currentPrice * (1 - hedgeTpPercent / 100);
            const hedgeSlPrice = currentPrice * 1.015; // 1.5% stop for hedge (tighter for protection)
            
            console.log(`🛡️ HEDGE CALC: Parent LONG loss ${parentLossPercent.toFixed(2)}%, Hedge TP target ${hedgeTpPercent.toFixed(2)}% at $${hedgeTpPrice.toFixed(4)}`);
            
            // Insert hedge position with dynamic TP to cover parent loss
            const { data: hedgePosition, error: hedgeError } = await supabase
              .from("positions")
              .insert({
                user_id: position.user_id,
                symbol: position.symbol,
                side: hedgeSide,
                quantity: hedgeQuantity,
                entry_price: currentPrice,
                current_price: currentPrice,
                stop_loss: hedgeSlPrice,
                take_profit: hedgeTpPrice,
                status: "active",
                is_hedge: true,
                parent_position_id: position.id,
                strategy_name: "Reversal Risk Hedge",
                trend: currentTrend,
                confidence_score: reversalRisk.riskScore,
              })
              .select()
              .single();
            
            if (!hedgeError && hedgePosition) {
              // Link hedge to parent position
              await supabase
                .from("positions")
                .update({ hedge_position_id: hedgePosition.id })
                .eq("id", position.id);
              
              hedgesOpened.push({
                symbol: position.symbol,
                parentSide: position.side,
                hedgeSide,
                hedgeQuantity,
                reversalRisk: reversalRisk.riskScore,
                parentPositionId: position.id,
                hedgePositionId: hedgePosition.id,
              });
              console.log(`✅ Hedge opened: ${hedgeSide} ${hedgeQuantity} ${position.symbol} at ${currentPrice}`);
            } else {
              console.error(`❌ Failed to open hedge: ${hedgeError?.message}`);
            }
          }
          // Log when hedge was blocked by StochRSI filter
          else if (shouldBlockHedgeByStochRsiLong && hasMetMinHoldTime && userSettings.hedgingEnabled && 
                   reversalRisk.riskScore >= userSettings.hedgeReversalRiskMin) {
            console.log(`🚫 HEDGE BLOCKED: LONG ${position.symbol} - StochRSI 4h K=${stochRsiK4hLong.toFixed(1)} < 20 (oversold, price likely to bounce - helps LONG)`);
          }
          // If risk is VERY HIGH (>= 85%), close position instead (ONLY if losing significantly)
          // Raised threshold to 85% to reduce premature exits - these had 0% win rate in analysis
          // Only apply if position has met minimum hold time AND position age > 1 hour
          const positionAgeHoursLong = positionAgeMinutes / 60;
          const MIN_AGE_FOR_REVERSAL_EXIT_HOURS_LONG = 1.0;
          // Use dynamic threshold from earlier calculation (aligned with strategy-analyzer)
          const REVERSAL_RISK_EXIT_THRESHOLD_LONG = dynamicReversalThreshold;
          
          if (!shouldClose && hasMetMinHoldTime && 
              positionAgeHoursLong >= MIN_AGE_FOR_REVERSAL_EXIT_HOURS_LONG &&
              reversalRisk.riskScore >= REVERSAL_RISK_EXIT_THRESHOLD_LONG && 
              pnlPercent < MIN_LOSS_FOR_REVERSAL_EXIT) {
            shouldClose = true;
            closeReason = "reversal_risk_high";
            console.log(
              `⚠️ REVERSAL RISK EXIT: Closing LONG ${position.symbol} - Risk ${reversalRisk.riskScore}/100 (ADX weight: ${reversalRisk.adxWeight}) >= ${REVERSAL_RISK_EXIT_THRESHOLD_LONG} (dynamic), Age: ${positionAgeHoursLong.toFixed(1)}h, ADX: ${positionAdx.toFixed(1)}, VolScore: ${positionVolumeScore}, Conf: ${positionConfidence}%`,
            );
          }
          
          // 🆕 HEDGE MANAGEMENT: Let hedge run with trailing stop - DON'T close just because risk dropped
          // Hedge should aim to cover the parent's loss, not close prematurely
          // The hedge will be closed by: its own TP, trailing stop, or when parent closes
          
          // Original early warning logic (kept as fallback) - TIGHTENED THRESHOLDS
          // Only apply if position has met minimum hold time AND losing more than 1%
          // These exits were causing 0% win rate - making much more conservative
          if (!shouldClose && hasMetMinHoldTime && positionAgeHoursLong >= 1.0) {
            const EARLY_WARNING_MIN_LOSS_PERCENT_LONG = -1.0; // Increased from -0.2% to -1%
            const EARLY_WARNING_MIN_CONFIDENCE_4H_LONG = 50; // Reduced from 70% (4h must be very weak)
            
            if (trend1h === "bearish" && confidence4h < EARLY_WARNING_MIN_CONFIDENCE_4H_LONG && pnlPercent < EARLY_WARNING_MIN_LOSS_PERCENT_LONG) {
              shouldClose = true;
              closeReason = "early_warning_1h_bearish";
              console.log(
                `⚠️ EARLY WARNING EXIT: Closing LONG ${position.symbol} - 1h BEARISH + 4h very weak (4h conf: ${confidence4h}%, P&L: ${pnlPercent.toFixed(2)}%)`,
              );
            } else if (currentTrend === "bearish" && trendConfidence >= 65) { // Raised from 50%
              shouldClose = true;
              closeReason = "trend_reversal_bearish";
              console.log(
                `🔄 TREND EXIT: Closing LONG ${position.symbol} - Strong BEARISH trend (conf: ${trendConfidence}%)`,
              );
            }
            // REMOVED: Ranging market exits - these were too aggressive and hurt win rate
            // Let positions ride through ranging periods as long as they're not hitting stops
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
      // TIME-BASED EXIT LOGIC - RELAXED to reduce premature exits
      // Only close if position is LOSING after extended time period
      // Previously closed break-even/profitable positions which hurt win rate
      // ============================================================
      if (!shouldClose && position.opened_at && userSettings.timeBasedStopEnabled) {
        const openedAt = new Date(position.opened_at);
        const now = new Date();
        const hoursOpen = (now.getTime() - openedAt.getTime()) / (1000 * 60 * 60);
        
        // Give 50% more time than configured before considering time-based exit
        const TIME_STOP_MULTIPLIER = 1.5;
        const effectiveTimeLimit = userSettings.timeBasedStopHours * TIME_STOP_MULTIPLIER;
        const MIN_LOSS_FOR_TIME_EXIT = -0.5; // Only close if losing more than 0.5%
        
        if (hoursOpen >= effectiveTimeLimit) {
          // ONLY close if position is losing significantly
          // Let break-even or profitable positions continue running
          if (pnlPercent < MIN_LOSS_FOR_TIME_EXIT) {
            shouldClose = true;
            closeReason = "time_based_stop";
            console.log(
              `⏰ TIME EXIT: Closing losing ${position.symbol} ${position.side} - Open ${hoursOpen.toFixed(1)}h (>${effectiveTimeLimit.toFixed(1)}h), P&L: ${pnlPercent.toFixed(2)}%`
            );
            
            trendExits.push({
              symbol: position.symbol,
              side: position.side,
              reason: `Time-based: ${hoursOpen.toFixed(1)}h open, ${pnlPercent.toFixed(2)}% P&L (losing)`,
              trend: "stale",
              confidence: 0,
              pnlPercent,
            });
          } else {
            console.log(
              `⏰ TIME EXIT SKIPPED: ${position.symbol} - Not losing enough (${pnlPercent.toFixed(2)}% > ${MIN_LOSS_FOR_TIME_EXIT}%) - letting it run`
            );
          }
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
      
      // ADDED: Minimum position age check before partial loss taking
      const minAgeForPartialLoss = Math.max(userSettings.minHoldTimeMinutes * 2, 40); // At least 2x hold time or 40 mins
      if (!shouldClose && pnlPercent < 0 && userSettings.partialLossTakingEnabled && currentPartialLossLevel === 0 && positionAgeMinutes >= minAgeForPartialLoss) {
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
          
          // 🆕 HEDGE CLEANUP: If parent position had a hedge, close the hedge too
          if (position.hedge_position_id) {
            console.log(`🛡️ HEDGE CLEANUP: Closing hedge for parent ${position.symbol} ${position.side}`);
            
            // Get the hedge position to calculate its P&L
            const { data: hedgePos } = await supabase
              .from("positions")
              .select("*")
              .eq("id", position.hedge_position_id)
              .eq("status", "active")
              .maybeSingle();
            
            if (hedgePos) {
              // Calculate hedge P&L
              const hedgePnl = hedgePos.side === "BUY"
                ? (currentPrice - hedgePos.entry_price) * hedgePos.quantity
                : (hedgePos.entry_price - currentPrice) * hedgePos.quantity;
              const hedgePnlPercent = hedgePos.side === "BUY"
                ? ((currentPrice - hedgePos.entry_price) / hedgePos.entry_price) * 100
                : ((hedgePos.entry_price - currentPrice) / hedgePos.entry_price) * 100;
              
              const { error: closeHedgeError } = await supabase
                .from("positions")
                .update({
                  status: "closed",
                  current_price: currentPrice,
                  exit_price: currentPrice,
                  realized_pnl: hedgePnl,
                  realized_pnl_percent: hedgePnlPercent,
                  closed_at: new Date().toISOString(),
                  close_reason: "parent_closed",
                })
                .eq("id", position.hedge_position_id)
                .eq("status", "active");
              
              if (!closeHedgeError) {
                hedgesClosed.push({
                  symbol: position.symbol,
                  parentSide: position.side,
                  hedgePositionId: position.hedge_position_id,
                  riskScore: 0,
                });
                console.log(`✅ Hedge closed with parent: ${hedgePos.side} ${hedgePos.symbol}, P&L: $${hedgePnl.toFixed(2)} (${hedgePnlPercent.toFixed(2)}%)`);
              }
            }
          }
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
      hedgesOpened,
      hedgesClosed,
      message: `Updated ${updates.length} positions, ${trailingStopUpdates.length} trailing stops, ${breakEvenUpdates.length} break-even stops, ${partialTpTaken.length} partial TPs, closed ${closedPositions.length} positions (${trendExits.length} trend exits, ${emergencyExits.length} emergency exits), ${volatilityAlerts.length} volatility alerts, ${hedgesOpened.length} hedges opened`,
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
