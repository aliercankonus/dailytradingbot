import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import { ADX_THRESHOLDS, STOCHRSI_THRESHOLDS, RSI_THRESHOLDS, SLIPPAGE_PARAMS, RISK_PARAMS, EMERGENCY_EXIT_PARAMS, EXIT_THRESHOLDS, EXIT_PRIORITY, PARTIAL_TP_PARAMS, detectStrategyType, isMomentumStrategy, isMeanReversionStrategy } from "../_shared/constants.ts";
import { calculateATR, calculateEMA } from "../_shared/indicators.ts";
import { 
  getStochRsiWeightedRsiScore, 
  getConfidencePenalty, 
  getAdxWeight,
  calculateUnifiedReversalScore,
  type UnifiedReversalResult
} from "../_shared/scoring.ts";
import { createLogger, logError } from "../_shared/logging.ts";
import { getCurrentPrice, getKlines, get24hrTicker } from "../_shared/binance.ts";

// Create logger instance
const logger = createLogger("monitor-positions");

// ============= RSI MOMENTUM ZONE CONSTRAINTS =============
// Momentum continuation entries require RSI in specific zones to prevent late entries
// LONG momentum zone: 45-65 (NEUTRAL_LOW to BULLISH_STRONG)
// SHORT momentum zone: 35-55 (BEARISH_PULLBACK to NEUTRAL_HIGH)
// Entries outside these zones get 50% score reduction in strategy-analyzer

// Helper function to calculate historical ATR for volatility comparison
function calculateHistoricalATR(klines: any[], histStartIdx: number, histEndIdx: number): { atr: number; count: number } {
  const calculateTrueRange = (high: number, low: number, prevClose: number) => 
    Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
  
  let trSum = 0;
  let count = 0;
  for (let i = histStartIdx; i < histEndIdx && i < klines.length - 1; i++) {
    const high = parseFloat(klines[i][2]);
    const low = parseFloat(klines[i][3]);
    const prevClose = parseFloat(klines[i - 1][4]);
    trSum += calculateTrueRange(high, low, prevClose);
    count++;
  }
  return { atr: count > 0 ? trSum / count : 0, count };
}

// ============= StochRSI-RSI CONFLICT RESOLUTION =============
// Imported from "../_shared/scoring.ts" - getStochRsiWeightedRsiScore

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
      logger.info("WebSocket connected");
    });
    socket.addEventListener("close", () => {
      clients.delete(socket);
      logger.info("WebSocket closed");
    });
    socket.addEventListener("message", (event) => {
      logger.debug(`WS message: ${event.data}`);
      // Optionally handle client messages, e.g., for authentication or specific requests
    });
    socket.addEventListener("error", (e) => logger.error(`WS error: ${e}`));
    return response;
  }
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  
  // CRON_SECRET validation - protect against unauthorized invocations
  // Accept secret via header (x-cron-secret), ANY Authorization Bearer token (internal pg_cron / scheduler), or internal scheduler header
  const cronSecret = Deno.env.get("CRON_SECRET");
  const providedSecretHeader = req.headers.get("x-cron-secret");
  const authHeader = req.headers.get("authorization");
  const providedSecretBearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  
  // Detect Supabase internal scheduler calls
  const isScheduledCron = req.headers.get("x-supabase-function-source") === "scheduler";
  
  // Allow if:
  // - no CRON_SECRET set (dev)
  // - it's a scheduled cron call
  // - any Authorization Bearer token is present (used by pg_cron with anon key)
  // - x-cron-secret header matches the configured secret
  if (
    cronSecret &&
    !isScheduledCron &&
    !authHeader &&
    providedSecretHeader !== cronSecret
  ) {
    logger.error("Unauthorized: Invalid or missing cron secret");
    return new Response(
      JSON.stringify({ success: false, error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  
  try {
    logger.boot();
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
      .select("user_id, trailing_stop_enabled, trailing_stop_activation_percent, trailing_stop_distance_multiplier, break_even_enabled, break_even_activation_percent, trailing_stop_profit_lock_percent, portfolio_value, portfolio_peak_value, drawdown_circuit_breaker_enabled, drawdown_circuit_breaker_percent, circuit_breaker_triggered, time_based_stop_enabled, time_based_stop_hours, dynamic_stop_tightening_enabled, dynamic_stop_tightening_hours, dynamic_stop_tightening_percent, partial_loss_taking_enabled, partial_loss_trigger_percent, partial_loss_close_percent, hedging_enabled, hedge_reversal_risk_min, hedge_reversal_risk_max, hedge_position_size_percent, min_hold_time_minutes, trailing_aggressiveness, progressive_lock_enabled, stale_peak_protection_enabled, decay_velocity_exit_enabled, early_profit_lock_enabled, early_profit_lock_threshold, momentum_exit_guard_enabled")
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
          // Smart AITS Settings
          trailingAggressiveness: rp.trailing_aggressiveness ?? 3,
          progressiveLockEnabled: rp.progressive_lock_enabled ?? true,
          stalePeakProtectionEnabled: rp.stale_peak_protection_enabled ?? true,
          decayVelocityExitEnabled: rp.decay_velocity_exit_enabled ?? true,
          // Pre-Activation Protection settings
          earlyProfitLockEnabled: rp.early_profit_lock_enabled ?? true,
          earlyProfitLockThreshold: rp.early_profit_lock_threshold ?? 0.3,
          momentumExitGuardEnabled: rp.momentum_exit_guard_enabled ?? true,
        },
      ]) || [],
    );
    logger.info(`Loaded trailing stop settings for ${userSettingsMap.size} users`);
  // Fetch current prices and ATR for all symbols
  const symbols = [...new Set(positions.map((p) => p.symbol))];
  
  // Enhanced data fetching: prices, ATR, historical ATR (for volatility spike), and volume
  // Using shared Binance utilities for consistency
  const symbolDataPromises = symbols.map(async (symbol) => {
    const symbolLogger = logger.forSymbol(symbol);
    try {
      // Get current price using shared utility
      const price = await getCurrentPrice(symbol);
      if (price === null) throw new Error(`No price data for ${symbol}`);

      // Get last 50 1-HOUR klines for ATR and volatility analysis using shared utility
      const klines = await getKlines(symbol, "1h", 50);
      if (!Array.isArray(klines) || klines.length < 16)
        throw new Error(`Invalid or insufficient klines data for ${symbol}`);

      // CONSOLIDATED: Use ATR utilities instead of inline calculation
      const atrPeriod = 14;
      const currentAtr = calculateATR(klines, atrPeriod);
      const atrPercent = (currentAtr / price) * 100;

      // Calculate historical average ATR (for volatility spike detection)
      // Use ATR from 20-34 candles ago as baseline
      const histStartIdx = Math.max(1, klines.length - 34);
      const histEndIdx = klines.length - 20;
      const { atr: historicalAtr, count: histCount } = calculateHistoricalATR(klines, histStartIdx, histEndIdx);
      const effectiveHistoricalAtr = histCount > 0 ? historicalAtr : currentAtr;
      const atrRatio = currentAtr / effectiveHistoricalAtr; // >1.5 = volatility spike

      // Get 24h price change for flash crash detection using shared utility
      let priceChange24h = 0;
      let volume24h = 0;
      let avgVolume = 0;
      try {
        const ticker24h = await get24hrTicker(symbol);
        if (ticker24h) {
          priceChange24h = parseFloat(ticker24h.priceChangePercent || "0");
          volume24h = parseFloat(ticker24h.volume || "0");
          avgVolume = parseFloat(ticker24h.quoteVolume || "0") / 24; // Rough hourly average
        }
      } catch (tickerError) {
        symbolLogger.warn(`Failed to fetch 24hr ticker: ${tickerError}`);
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
      
      // Calculate movement magnitudes for divergence detection
      const price3Ago = parseFloat(klines[klines.length - 4][4]);
      const priceChange = lastClose - price3Ago;
      const priceChangePercent = Math.abs(priceChange / price3Ago) * 100;
      const macdChange = macdLine - macdLine3Ago;
      const macdChangePercent = macdLine3Ago !== 0 ? Math.abs(macdChange / Math.abs(macdLine3Ago)) * 100 : 0;
      
      // Require minimum 0.3% price move AND 10% MACD change to declare significant divergence
      const significantPriceMove = priceChangePercent >= 0.3;
      const significantMacdMove = macdChangePercent >= 10;
      
      const macdTrending = macdLine > macdLine3Ago ? "up" : "down";
      const priceTrending = lastClose > price3Ago ? "up" : "down";
      
      // Only declare divergence if movements are significant AND directions oppose
      const hasDivergence = significantPriceMove && significantMacdMove && macdTrending !== priceTrending;

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
        priceChangePercent, // For debugging divergence magnitude
        macdChangePercent, // For debugging divergence magnitude
      };
    } catch (error) {
      symbolLogger.error(`Error fetching data: ${error}`);
      return { symbol, price: null, atr: null, atrPercent: null, atrRatio: 1, recentPriceChange: 0, volumeRatio: 1, hasDivergence: false };
    }
  });

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
        priceChangePercent: d.priceChangePercent,
        macdChangePercent: d.macdChangePercent,
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
    const hedgesOpened: { symbol: string; parentSide: string; hedgeSide: string; hedgeQuantity: number; reversalRisk: number; parentPositionId: string; hedgePositionId: string }[] = []; // Track hedges opened for reversal risk
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
        logger.forSymbol(symbol).error(`Failed to fetch trend: ${error}`);
        return { symbol, data: null };
      }
    });
    const trendResults = await Promise.all(trendPromises);
    trendResults.forEach(({ symbol, data }) => {
      if (data) {
        trendDataMap.set(symbol, data);
        logger.forSymbol(symbol).signal(`Trend: ${data.trend} (confidence: ${data.confidence}%)`);
      }
    });
    for (const position of positions) {
      const currentPrice = priceMap.get(position.symbol);
      if (currentPrice === undefined || currentPrice === null) continue;
      const atrData = atrMap.get(position.symbol);
      const atrPercent = atrData?.atrPercent || 1.5;
      const positionLogger = logger.forSymbol(position.symbol);

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
      // CONFIDENCE PENALTY (imported from shared scoring module)
      // ============================================================
      const confidencePenalty = getConfidencePenalty(positionConfidence, positionAdx, false);
      
      // ADX-based reversal risk threshold adjustment - Uses centralized ADX_THRESHOLDS
      // Higher ADX = more lenient (allow higher reversal risk before exit)
      let dynamicReversalThreshold = 60; // Base threshold
      if (positionAdx >= ADX_THRESHOLDS.EXCEPTIONAL) {
        dynamicReversalThreshold = 70; // Very strong trend - allow more reversal risk
      } else if (positionAdx >= ADX_THRESHOLDS.STRONG) {
        dynamicReversalThreshold = 65; // Strong trend
      } else if (positionAdx < ADX_THRESHOLDS.MINIMUM) {
        dynamicReversalThreshold = 55; // Weak trend - exit earlier
      }
      
      // Volume-aware exit: High volume confirmation = hold longer
      if (positionVolumeScore >= 7) {
        dynamicReversalThreshold += 5; // Volume strongly confirms - be more patient
      } else if (positionVolumeScore <= 2 && positionAdx < ADX_THRESHOLDS.STRONG) {
        dynamicReversalThreshold -= 5; // Low volume + weak trend = exit sooner
      }
      
      // Apply confidence penalty to reversal threshold
      // High confidence (trend exhaustion) = tighter exit threshold
      if (confidencePenalty < -10) {
        dynamicReversalThreshold -= 5; // Exit sooner when confidence indicates exhaustion
        positionLogger.info(`Confidence penalty ${confidencePenalty} applied - threshold ${dynamicReversalThreshold}`);
      }
      
      // ============================================================
      // STRATEGY-AWARE EXIT ADJUSTMENTS
      // Different strategy types have different exit behaviors
      // ============================================================
      const strategyName = position.strategy_name || '';
      const signalData = position.signal_id ? await supabase
        .from("trading_signals")
        .select("strategy_id")
        .eq("id", position.signal_id)
        .single()
        .then(r => r.data) : null;
      const strategyId = signalData?.strategy_id || '';
      
      const strategyType = detectStrategyType(strategyId, strategyName);
      const isMomentum = isMomentumStrategy(strategyId, strategyName);
      const isMeanReversion = isMeanReversionStrategy(strategyId, strategyName);
      
      // Strategy-specific exit threshold adjustments
      let strategyExitAdjustment = 0;
      let strategyExitNote = "";
      
      if (isMomentum) {
        // MOMENTUM STRATEGIES: 
        // - More aggressive trailing stops (lock profits faster)
        // - Exit earlier on divergence (momentum loss is fatal)
        // - More sensitive to trend changes
        strategyExitAdjustment = -8; // Lower reversal threshold = exit sooner
        strategyExitNote = "Momentum strategy: tighter exit sensitivity";
        
        // Additional exit pressure if momentum divergence detected
        if (atrData?.hasDivergence) {
          strategyExitAdjustment -= 5; // Even more sensitive to divergence
          strategyExitNote += " + divergence penalty";
        }
      } else if (isMeanReversion) {
        // MEAN REVERSION STRATEGIES:
        // - More patient exits (expect price to oscillate)
        // - Less sensitive to reversal risk (that's expected!)
        // - Exit on trend continuation, not reversal
        strategyExitAdjustment = +10; // Higher threshold = stay longer
        strategyExitNote = "Mean reversion: patient exit threshold";
        
        // For mean reversion, we WANT price to reverse - don't exit on reversal signals
        // But DO exit if trend continues against us (our thesis is wrong)
        if (positionAdx >= ADX_THRESHOLDS.STRONG) {
          strategyExitAdjustment -= 5; // Strong trend = our mean reversion thesis may be wrong
          strategyExitNote += " (strong trend warning)";
        }
      } else if (strategyType === 'TREND_FOLLOWING') {
        // TREND FOLLOWING: Very patient, only exit on clear trend breaks
        strategyExitAdjustment = +5;
        strategyExitNote = "Trend following: patient threshold";
      } else if (strategyType === 'GRID_RANGE') {
        // GRID/RANGE: Quick exits, optimized for small gains
        strategyExitAdjustment = -5;
        strategyExitNote = "Grid strategy: quick exit threshold";
      }
      
      // Apply strategy adjustment to dynamic threshold
      dynamicReversalThreshold += strategyExitAdjustment;
      
      // Clamp to reasonable bounds (50-85)
      dynamicReversalThreshold = Math.max(50, Math.min(85, dynamicReversalThreshold));
      
      if (strategyExitAdjustment !== 0) {
        positionLogger.info(`Strategy-aware exit: ${strategyType} | Adj: ${strategyExitAdjustment > 0 ? '+' : ''}${strategyExitAdjustment} | ${strategyExitNote}`);
      }
      
      // Log dynamic threshold calculation
      positionLogger.debug(`Dynamic exit threshold=${dynamicReversalThreshold} (ADX=${positionAdx.toFixed(1)}, Vol=${positionVolumeScore}, Conf=${positionConfidence}%, Strategy=${strategyType})`);

      
      // ============================================================
      // DRAWDOWN CIRCUIT BREAKER - Skip processing if triggered
      // ============================================================
      if (userSettingsEarly?.circuitBreakerTriggered) {
        positionLogger.risk(`CIRCUIT BREAKER ACTIVE for user ${position.user_id} - Skipping position monitoring`);
        continue;
      }

      // Check and update circuit breaker status based on current drawdown
      if (userSettingsEarly?.drawdownCircuitBreakerEnabled) {
        const peakValue = userSettingsEarly.portfolioPeakValue || 10000;
        const currentValue = userSettingsEarly.portfolioValue || 10000;
        const drawdownPercent = ((peakValue - currentValue) / peakValue) * 100;
        
        if (drawdownPercent >= userSettingsEarly.drawdownCircuitBreakerPercent) {
          positionLogger.risk(`DRAWDOWN CIRCUIT BREAKER TRIGGERED: ${drawdownPercent.toFixed(2)}% drawdown exceeds ${userSettingsEarly.drawdownCircuitBreakerPercent}% threshold`);
          
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
            positionLogger.error(`Error triggering circuit breaker: ${cbError}`);
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
              positionLogger.error(`Error sending circuit breaker notification: ${notifError}`);
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
          positionLogger.trade(`Updated portfolio peak for user ${position.user_id}: $${currentValue.toFixed(2)}`);
        }
      }

      // Get current trend for this position's symbol
      const trendData = trendDataMap.get(position.symbol);

      // ============================================================
      // 🚨 EMERGENCY PROTECTION SYSTEMS
      // ============================================================

      // 1️⃣ FLASH CRASH PROTECTION - Immediate exit on sudden adverse move
      const recentPriceChange = atrData?.recentPriceChange || 0;
      
      let isFlashCrash = false;
      if (position.side === "BUY" && recentPriceChange <= -EMERGENCY_EXIT_PARAMS.FLASH_CRASH_THRESHOLD_PERCENT) {
        isFlashCrash = true;
        positionLogger.risk(`FLASH CRASH DETECTED for LONG: ${recentPriceChange.toFixed(2)}% drop in last hour!`);
      } else if (position.side === "SELL" && recentPriceChange >= EMERGENCY_EXIT_PARAMS.FLASH_CRASH_THRESHOLD_PERCENT) {
        isFlashCrash = true;
        positionLogger.risk(`FLASH CRASH DETECTED for SHORT: ${recentPriceChange.toFixed(2)}% surge in last hour!`);
      }

      // 2️⃣ VOLATILITY SPIKE DETECTION - ATR above normal = high risk
      const atrRatio = atrData?.atrRatio || 1.0;
      const isVolatilitySpike = atrRatio >= EMERGENCY_EXIT_PARAMS.VOLATILITY_SPIKE_THRESHOLD;
      
      if (isVolatilitySpike) {
        positionLogger.risk(`VOLATILITY SPIKE: ATR ${atrRatio.toFixed(2)}x normal - high risk environment!`);
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
      const priceChangePercent = atrData?.priceChangePercent || 0;
      const macdChangePercent = atrData?.macdChangePercent || 0;
      
      let divergenceExit = false;
      // For LONG: Exit if price going up but MACD going down (bearish divergence)
      if (position.side === "BUY" && hasDivergence && priceTrending === "up" && macdTrending === "down") {
        divergenceExit = true;
        positionLogger.signal(`BEARISH DIVERGENCE for LONG: Price up but MACD down - momentum weakening!`);
      }
      // For SHORT: Exit if price going down but MACD going up (bullish divergence)
      else if (position.side === "SELL" && hasDivergence && priceTrending === "down" && macdTrending === "up") {
        divergenceExit = true;
        positionLogger.signal(`BULLISH DIVERGENCE for SHORT: Price down but MACD up - momentum weakening!`);
      }

      // 4️⃣ VOLUME SPIKE ALERT - Unusual volume may signal reversal
      const volumeRatio = atrData?.volumeRatio || 1.0;
      const isVolumeSpike = volumeRatio >= EMERGENCY_EXIT_PARAMS.VOLUME_SPIKE_THRESHOLD;
      
      if (isVolumeSpike) {
        positionLogger.signal(`VOLUME SPIKE: ${volumeRatio.toFixed(1)}x average volume - potential reversal signal!`);
        volatilityAlerts.push({
          symbol: position.symbol,
          volumeRatio,
          message: `Volume ${volumeRatio.toFixed(1)}x above average`,
        });
      }

      // Calculate P&L early for strategy-aware decisions
      const earlyPnlPercent =
        position.side === "BUY"
          ? ((currentPrice - position.entry_price) / position.entry_price) * 100
          : ((position.entry_price - currentPrice) / position.entry_price) * 100;

      // ============================================================
      // EMERGENCY EXIT DECISION (STRATEGY-AWARE)
      // Momentum strategies are more sensitive to divergence
      // Mean reversion strategies are more tolerant of reversals
      // ============================================================
      let emergencyClose = false;
      let emergencyReason = "";
      
      // Flash crash = immediate exit (highest priority) - applies to all strategies
      if (isFlashCrash) {
        emergencyClose = true;
        emergencyReason = "flash_crash";
      }
      // Volatility spike + divergence = exit (compound risk)
      else if (isVolatilitySpike && divergenceExit) {
        // Mean reversion strategies can tolerate this better
        if (isMeanReversion && earlyPnlPercent > -1.0) {
          positionLogger.info(`STRATEGY-AWARE: Mean reversion tolerating volatility+divergence (P&L: ${earlyPnlPercent.toFixed(2)}%)`);
        } else {
          emergencyClose = true;
          emergencyReason = "volatility_divergence";
        }
      }
      // Strong divergence with volume spike = exit (but strategy-aware)
      else if (divergenceExit && isVolumeSpike) {
        // Momentum strategies are VERY sensitive to divergence
        if (isMomentum) {
          emergencyClose = true;
          emergencyReason = "momentum_divergence_critical";
          positionLogger.risk(`STRATEGY-AWARE: Momentum strategy + divergence = immediate exit`);
        }
        // Mean reversion might want this reversal
        else if (isMeanReversion) {
          positionLogger.info(`STRATEGY-AWARE: Mean reversion expecting reversal - not exiting on divergence+volume`);
        } else {
          emergencyClose = true;
          emergencyReason = "divergence_volume_spike";
        }
      }
      // For momentum strategies: divergence alone is exit signal ONLY when significantly in loss
      // ADJUSTED: Changed from earlyPnlPercent < 0 to < -0.3% to prevent cutting winners short
      // Analysis showed momentum exit was triggering at +0.26% and -0.13%, killing potential profits
      // If position is above -0.3%, let trailing stop or break-even handle it instead
      else if (divergenceExit && isMomentum && earlyPnlPercent < -0.3) {
        // Add grace period: don't exit within first 10 minutes of position opening
        const positionAgeMinutes = position.opened_at 
          ? (Date.now() - new Date(position.opened_at).getTime()) / (1000 * 60) 
          : 999;
        
        if (positionAgeMinutes >= 10) {
          emergencyClose = true;
          emergencyReason = "momentum_divergence_exit";
          positionLogger.risk(`STRATEGY-AWARE: Momentum divergence + significant loss (${earlyPnlPercent.toFixed(2)}% < -0.3%) after ${positionAgeMinutes.toFixed(0)}min - exiting | Price: ${priceTrending} ${priceChangePercent.toFixed(2)}% | MACD: ${macdTrending} ${macdChangePercent.toFixed(2)}%`);
        } else {
          positionLogger.info(`STRATEGY-AWARE: Momentum divergence detected but position age ${positionAgeMinutes.toFixed(0)}min < 10min grace period - skipping | Price: ${priceTrending} ${priceChangePercent.toFixed(2)}% | MACD: ${macdTrending} ${macdChangePercent.toFixed(2)}%`);
        }
      }
      // Log when momentum divergence is detected but P&L is above threshold (letting other guards handle it)
      else if (divergenceExit && isMomentum && earlyPnlPercent >= -0.3 && earlyPnlPercent < 0) {
        positionLogger.info(`STRATEGY-AWARE: Momentum divergence detected but P&L ${earlyPnlPercent.toFixed(2)}% >= -0.3% threshold - letting trailing/break-even guards handle`);
      }
      // SCENARIO 5 FIX: Conditional volatility exit - extreme volatility alone = conditional exit
      // If P&L > 0 AND trendConfidence >= 55: reduce 50% instead of full exit
      // If P&L < 0 OR confidence < 55: full exit
      else if (atrRatio >= EMERGENCY_EXIT_PARAMS.EXTREME_VOLATILITY_THRESHOLD) {
        if (earlyPnlPercent > 0 && positionConfidence >= 55) {
          // SCENARIO 5: Conditional - profitable position in confident trend should reduce, not exit
          positionLogger.info(`CONDITIONAL VOLATILITY: ATR ${atrRatio.toFixed(2)}x extreme but P&L ${earlyPnlPercent.toFixed(2)}% > 0 and confidence ${positionConfidence}% >= 55 - would reduce 50% (logging only, full reduction requires position management)`);
          // Note: Full position reduction requires execute-trade integration, for now we log and skip exit
          // A future improvement could implement partial close here
        } else {
          emergencyClose = true;
          emergencyReason = "extreme_volatility";
          positionLogger.risk(`EXTREME VOLATILITY EXIT: ATR ${atrRatio.toFixed(2)}x with P&L ${earlyPnlPercent.toFixed(2)}% or confidence ${positionConfidence}% < 55 - full exit triggered`);
        }
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
            priceChangePercent: priceChangePercent?.toFixed(2) + "%",
            macdChangePercent: macdChangePercent?.toFixed(2) + "%",
            priceTrending,
            macdTrending,
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
        // Smart AITS defaults
        trailingAggressiveness: 3,
        progressiveLockEnabled: true,
        stalePeakProtectionEnabled: true,
        decayVelocityExitEnabled: true,
        // Pre-Activation Protection defaults
        earlyProfitLockEnabled: true,
        earlyProfitLockThreshold: 0.3,
        momentumExitGuardEnabled: true,
      };
      
      // 🆕 MINIMUM HOLD TIME CHECK - Prevents early exits on new positions
      const positionOpenedAt = new Date(position.opened_at || position.executed_at || Date.now());
      const positionAgeMinutes = (Date.now() - positionOpenedAt.getTime()) / (1000 * 60);
      const hasMetMinHoldTime = positionAgeMinutes >= userSettings.minHoldTimeMinutes;
      
      if (!hasMetMinHoldTime) {
        positionLogger.info(`Position age ${positionAgeMinutes.toFixed(1)}min < ${userSettings.minHoldTimeMinutes}min hold time - skipping reversal/hedge/early exit checks`);
      }
      
      // TRAILING STOP LOSS LOGIC - Position-specific calculation based on EACH position's entry price
      // IMPORTANT: Trailing stop must NEVER set stop closer than 1% to entry price
      // Uses PERSISTED peak_pnl_percent for ratcheting lock stop calculation
      let newStopLoss = position.stop_loss;
      let trailingActivated = false;
      let peakPnlUpdated = false;
      
      // Minimum stop loss distance from entry - prevents premature exits
      const minDistanceFromEntry = position.entry_price * (RISK_PARAMS.MIN_STOP_DISTANCE_PERCENT / 100);
      
      // Get persisted peak P&L and update if current is higher (ratcheting)
      // IMPORTANT: Track peak P&L ALWAYS, not just when trailing is enabled - this ensures
      // we have the peak value ready when trailing activates
      const currentPeakPnl = position.peak_pnl_percent || 0;
      const newPeakPnl = Math.max(currentPeakPnl, pnlPercent);
      const peakReachedAt = position.peak_reached_at ? new Date(position.peak_reached_at) : new Date();
      const now = new Date();
      
      // Calculate minutes since peak for stale peak detection
      const minutesSincePeak = (now.getTime() - peakReachedAt.getTime()) / (1000 * 60);
      
      if (newPeakPnl > currentPeakPnl && pnlPercent > 0) {
        peakPnlUpdated = true;
        positionLogger.trade(`Peak P&L updated ${position.side}: ${currentPeakPnl.toFixed(2)}% → ${newPeakPnl.toFixed(2)}%`);
        
        // Update peak_pnl_percent and peak_reached_at immediately in database (even before trailing activates)
        const { error: peakUpdateError } = await supabase
          .from("positions")
          .update({ peak_pnl_percent: newPeakPnl, peak_reached_at: now.toISOString() })
          .eq("id", position.id)
          .eq("status", "active");
        
        if (peakUpdateError) {
          positionLogger.error(`Error updating peak P&L for ${position.id}: ${peakUpdateError}`);
        }
      }
      
      // ============= SMART AITS: DECAY VELOCITY DETECTION =============
      // Check for rapid profit decay and trigger emergency exit if needed
      if (userSettings.decayVelocityExitEnabled && newPeakPnl > userSettings.activationPercent && minutesSincePeak > 0) {
        const decayPercent = newPeakPnl - pnlPercent;
        const decayVelocity = decayPercent / minutesSincePeak; // % per minute
        
        // Emergency exit if decay exceeds threshold (rapid profit loss)
        if (decayVelocity > EMERGENCY_EXIT_PARAMS.DECAY_VELOCITY_EXIT_PER_MINUTE && pnlPercent > 0) {
          positionLogger.risk(`SMART AITS: Rapid decay detected ${position.side} - velocity ${(decayVelocity * 100).toFixed(2)}%/min, triggering emergency exit`);
          emergencyExits.push({
            symbol: position.symbol,
            side: position.side,
            reason: `smart_aits_rapid_decay`,
            peakPnl: newPeakPnl,
            currentPnl: pnlPercent,
            decayVelocity: decayVelocity * 100,
            minutesSincePeak,
          });
          
          // Close position immediately
          const realizedPnl = position.side === "BUY"
            ? (currentPrice - position.entry_price) * position.quantity
            : (position.entry_price - currentPrice) * position.quantity;
          
          const { error: closeError } = await supabase
            .from("positions")
            .update({
              status: "closed",
              closed_at: new Date().toISOString(),
              exit_price: currentPrice,
              realized_pnl: realizedPnl,
              realized_pnl_percent: pnlPercent,
              close_reason: "smart_aits_rapid_decay",
            })
            .eq("id", position.id)
            .eq("status", "active");
          
          if (closeError) {
            positionLogger.error(`Error closing position ${position.id}: ${closeError}`);
          } else {
            closedPositions.push({
              id: position.id,
              symbol: position.symbol,
              side: position.side,
              reason: "smart_aits_rapid_decay",
              pnlPercent,
            });
          }
          continue; // Skip to next position
        }
      }
      
      // ============= SMART AITS: PROGRESSIVE LOCK TIERS =============
      // Calculate dynamic profit lock based on peak P&L level
      const getProgressiveLockPercent = (peakPnl: number, aggressiveness: number): number => {
        // Base lock from aggressiveness (1=35%, 2=40%, 3=45%, 4=50%, 5=55%)
        const baseLock = 0.30 + (aggressiveness * 0.05);
        
        // Progressive tier bonus based on peak P&L
        let tierBonus = 0;
        if (peakPnl >= 5) tierBonus = 0.30;       // 5%+ peak: +30% bonus (85% total at agg 5)
        else if (peakPnl >= 3) tierBonus = 0.20;  // 3-5% peak: +20% bonus
        else if (peakPnl >= 2) tierBonus = 0.15;  // 2-3% peak: +15% bonus
        else if (peakPnl >= 1) tierBonus = 0.10;  // 1-2% peak: +10% bonus
        else tierBonus = 0;                        // 0-1% peak: no bonus
        
        return Math.min(0.85, baseLock + tierBonus); // Cap at 85%
      };
      
      // ============= SMART AITS: STALE PEAK BONUS =============
      // Add tighter locks when peak hasn't been updated for a while
      const getStalePeakBonus = (minutesSincePeak: number): number => {
        if (!userSettings.stalePeakProtectionEnabled) return 0;
        if (minutesSincePeak > 120) return 0.25;  // +25% after 2 hours
        if (minutesSincePeak > 60) return 0.20;   // +20% after 1 hour  
        if (minutesSincePeak > 30) return 0.10;   // +10% after 30 min
        if (minutesSincePeak > 15) return 0.05;   // +5% after 15 min
        return 0;
      };
      
      // ============= PRE-ACTIVATION PROTECTION: EARLY PROFIT LOCK =============
      // For positions that haven't reached trailing activation but had some profit
      // Move stop to break-even to prevent "almost winners" from becoming losers
      let earlyProfitLockApplied = false;
      if (userSettings.earlyProfitLockEnabled && 
          pnlPercent < userSettings.activationPercent && 
          newPeakPnl >= userSettings.earlyProfitLockThreshold &&
          position.stop_loss !== null) {
        
        // Position reached threshold profit but hasn't hit activation
        // Move stop to break-even (entry price)
        const breakEvenStop = position.entry_price;
        
        if (position.side === "BUY" && breakEvenStop > position.stop_loss) {
          // For LONG: move stop up to entry
          newStopLoss = breakEvenStop;
          earlyProfitLockApplied = true;
          positionLogger.trade(`EARLY PROFIT LOCK for BUY: Moving stop to break-even ${breakEvenStop.toFixed(2)} (peak was ${newPeakPnl.toFixed(2)}%, current ${pnlPercent.toFixed(2)}%)`);
        } else if (position.side === "SELL" && breakEvenStop < position.stop_loss) {
          // For SHORT: move stop down to entry
          newStopLoss = breakEvenStop;
          earlyProfitLockApplied = true;
          positionLogger.trade(`EARLY PROFIT LOCK for SHORT: Moving stop to break-even ${breakEvenStop.toFixed(2)} (peak was ${newPeakPnl.toFixed(2)}%, current ${pnlPercent.toFixed(2)}%)`);
        }
        
        if (earlyProfitLockApplied) {
          // Update stop loss in database
          const { error: earlyLockError } = await supabase
            .from("positions")
            .update({ stop_loss: newStopLoss })
            .eq("id", position.id)
            .eq("status", "active");
          
          if (earlyLockError) {
            positionLogger.error(`Error applying early profit lock for ${position.id}: ${earlyLockError}`);
          } else {
            updatedStopLossMap.set(position.id, newStopLoss);
          }
        }
      }
      
      // Check if trailing stop is enabled and position is profitable enough
      if (userSettings.enabled && pnlPercent > userSettings.activationPercent) {
        // Calculate ATR-based minimum distance (for volatility buffer)
        const atrAbsolute = (currentPrice * atrPercent) / 100;
        const minTrailingDistance = Math.max(atrAbsolute * userSettings.distanceMultiplier, currentPrice * 0.015); // Min 1.5% of current price
        
        // ============= SMART AITS: Calculate adaptive profit lock =============
        let profitLockPercent = userSettings.profitLockPercent;
        let smartAitsApplied = false;
        let lockTier = "base";
        
        if (userSettings.progressiveLockEnabled) {
          // Progressive lock based on peak P&L tier
          const progressiveLock = getProgressiveLockPercent(newPeakPnl, userSettings.trailingAggressiveness);
          
          // Stale peak bonus (adds to lock when peak hasn't updated)
          const stalePeakBonus = getStalePeakBonus(minutesSincePeak);
          
          // Decay velocity override - if decay is fast but not emergency, force higher lock
          let decayOverride = 0;
          if (userSettings.decayVelocityExitEnabled && minutesSincePeak > 0) {
            const decayPercent = newPeakPnl - pnlPercent;
            const decayVelocity = decayPercent / minutesSincePeak;
            if (decayVelocity > 0.02) {
              decayOverride = 0.80; // Force 80% lock on fast decay
              lockTier = "decay_override";
            }
          }
          
          // Use highest lock between progressive + stale bonus OR decay override
          const adaptiveLock = Math.max(progressiveLock + stalePeakBonus, decayOverride);
          
          // Only use smart AITS if it's more protective than user setting
          if (adaptiveLock > profitLockPercent) {
            profitLockPercent = Math.min(0.85, adaptiveLock);
            smartAitsApplied = true;
            
            // Determine tier for logging
            if (lockTier !== "decay_override") {
              if (stalePeakBonus > 0) lockTier = `stale_${Math.round(minutesSincePeak)}min`;
              else if (newPeakPnl >= 5) lockTier = "tier5";
              else if (newPeakPnl >= 3) lockTier = "tier4";
              else if (newPeakPnl >= 2) lockTier = "tier3";
              else if (newPeakPnl >= 1) lockTier = "tier2";
              else lockTier = "tier1";
            }
            
            positionLogger.trade(`SMART AITS: lock ${(profitLockPercent * 100).toFixed(0)}% (${lockTier}, peak: ${newPeakPnl.toFixed(2)}%, stale: ${minutesSincePeak.toFixed(0)}min)`);
          }
        }
        
        if (position.side === "BUY") {
          // For LONG: Calculate LOCK STOP based on PEAK P&L (persisted, never decreases)
          // This ensures lock stop ratchets and never gives back profit
          // Deduct round-trip slippage from peak P&L before calculating locked profit
          const effectivePeakPnl = Math.max(0, newPeakPnl - SLIPPAGE_PARAMS.ROUND_TRIP_SLIPPAGE_PERCENT);
          const peakProfitDistance = position.entry_price * (effectivePeakPnl / 100);
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
            positionLogger.warn(`Trailing SL skipped for BUY - calculated stop ${calculatedStopLoss.toFixed(2)} too close below entry ${position.entry_price.toFixed(2)} (must be <= ${minAllowedStop.toFixed(2)} if below entry)`);
          } else {
            // 🔒 LOCK STOP FLOOR: Stop must be at least at lock stop price (based on peak P&L)
            // This ensures we ALWAYS protect the locked profit percentage
            if (lockStopPrice > position.stop_loss) {
              newStopLoss = lockStopPrice;
              trailingActivated = true;
              const distancePercent = ((newStopLoss - position.entry_price) / position.entry_price) * 100;
              positionLogger.trade(
                `LOCK STOP SET for BUY (entry: ${position.entry_price.toFixed(2)}): ${position.stop_loss.toFixed(2)} → ${newStopLoss.toFixed(2)} (${distancePercent.toFixed(2)}% from entry, peak P&L: ${newPeakPnl.toFixed(2)}%, lock: ${(profitLockPercent * 100).toFixed(0)}% of peak)`,
              );
            } else if (calculatedStopLoss > position.stop_loss) {
              // ATR-based stop is higher - use it
              newStopLoss = calculatedStopLoss;
              trailingActivated = true;
              const distancePercent = ((newStopLoss - position.entry_price) / position.entry_price) * 100;
              positionLogger.trade(
                `Trailing SL RAISED for BUY (entry: ${position.entry_price.toFixed(2)}): ${position.stop_loss.toFixed(2)} → ${newStopLoss.toFixed(2)} (${distancePercent.toFixed(2)}% from entry, atr-based: ${atrBasedStop.toFixed(2)}, current: ${currentPrice.toFixed(2)}, P&L: ${pnlPercent.toFixed(2)}%)`,
              );
            } else {
              // Log when ratchet prevents regression
              positionLogger.info(
                `Trailing SL HELD at peak for BUY - lock stop ${lockStopPrice.toFixed(2)}, current SL ${position.stop_loss.toFixed(2)} (ratchet prevents regression)`,
              );
            }
          }
        } else {
          // For SHORT: Calculate LOCK STOP based on PEAK P&L (persisted, never decreases)
          // Deduct round-trip slippage from peak P&L before calculating locked profit
          const effectivePeakPnl = Math.max(0, newPeakPnl - SLIPPAGE_PARAMS.ROUND_TRIP_SLIPPAGE_PERCENT);
          const peakProfitDistance = position.entry_price * (effectivePeakPnl / 100);
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
            positionLogger.warn(`Trailing SL skipped for SHORT - calculated stop ${calculatedStopLoss.toFixed(2)} too close above entry ${position.entry_price.toFixed(2)} (must be >= ${maxAllowedStop.toFixed(2)} if above entry)`);
          } else {
            // 🔒 LOCK STOP FLOOR: Stop must be at least at lock stop price (based on peak P&L)
            // This ensures we ALWAYS protect the locked profit percentage
            if (lockStopPrice < position.stop_loss) {
              newStopLoss = lockStopPrice;
              trailingActivated = true;
              const distancePercent = ((newStopLoss - position.entry_price) / position.entry_price) * 100;
              positionLogger.trade(
                `LOCK STOP SET for SHORT (entry: ${position.entry_price.toFixed(2)}): ${position.stop_loss.toFixed(2)} → ${newStopLoss.toFixed(2)} (${Math.abs(distancePercent).toFixed(2)}% from entry, peak P&L: ${newPeakPnl.toFixed(2)}%, lock: ${(profitLockPercent * 100).toFixed(0)}% of peak)`,
              );
            } else if (calculatedStopLoss < position.stop_loss) {
              // ATR-based stop is lower - use it
              newStopLoss = calculatedStopLoss;
              trailingActivated = true;
              const distancePercent = ((newStopLoss - position.entry_price) / position.entry_price) * 100;
              positionLogger.trade(
                `Trailing SL LOWERED for SHORT (entry: ${position.entry_price.toFixed(2)}): ${position.stop_loss.toFixed(2)} → ${newStopLoss.toFixed(2)} (${Math.abs(distancePercent).toFixed(2)}% from entry, atr-based: ${atrBasedStop.toFixed(2)}, current: ${currentPrice.toFixed(2)}, P&L: ${pnlPercent.toFixed(2)}%)`,
              );
            } else {
              // Log when ratchet prevents regression
              positionLogger.info(
                `Trailing SL HELD at peak for SHORT - lock stop ${lockStopPrice.toFixed(2)}, current SL ${position.stop_loss.toFixed(2)} (ratchet prevents regression)`,
              );
            }
          }
        }
        // Update stop loss in database if trailing was activated
        // NOTE: peak_pnl_percent is updated earlier (outside activation check) to track peak always
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
            positionLogger.error(`Error updating trailing stop for ${position.id}: ${posUpdateError}`);
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
              positionLogger.info(`Notification sent for trailing stop`);
            }
          } catch (notifError) {
            positionLogger.error(`Error sending trailing stop notification: ${notifError}`);
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
      // SCENARIO 5 FIX: Context-aware break-even activation
      // Strong trends (ADX >= 30) use higher threshold (1.0%) because they often retest 0.3-0.6%
      // Weak trends use standard threshold (0.5%)
      const isStrongTrend = positionAdx >= ADX_THRESHOLDS.VERY_STRONG;
      const effectiveBreakEvenActivation = isStrongTrend 
        ? Math.max(userSettings.breakEvenActivationPercent, RISK_PARAMS.BREAK_EVEN_STRONG_TREND_ACTIVATION_PERCENT)
        : userSettings.breakEvenActivationPercent;
      
      // Break-even activation uses context-aware threshold
      // The 1% minimum distance is only checked when placing the stop, not for eligibility
      // This allows break-even to activate at 0.5% profit as configured, protecting profits earlier
      const isBreakEvenEligible = userSettings.breakEvenEnabled && 
                                  pnlPercent >= effectiveBreakEvenActivation &&
                                  !trailingActivated; // Don't apply if trailing stop already moved

      if (isBreakEvenEligible) {
        const entryPrice = position.entry_price;
        let shouldMoveToBreakEven = false;
        
        // Calculate minimum stop distance from current price for break-even to allow earlier protection
        const minDistanceFromCurrent = currentPrice * (EXIT_THRESHOLDS.BREAK_EVEN_MIN_DISTANCE_PERCENT / 100);

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
          // Calculate break-even stop WITH slippage buffer to ensure small profit after execution
          // For BUY: set break-even ABOVE entry to cover exit slippage
          // For SHORT: set break-even BELOW entry to cover exit slippage
          const slippageBuffer = entryPrice * (SLIPPAGE_PARAMS.BREAK_EVEN_BUFFER_PERCENT / 100);
          const breakEvenStop = position.side === "BUY" 
            ? entryPrice + slippageBuffer  // BUY: stop above entry for small profit
            : entryPrice - slippageBuffer; // SHORT: stop below entry for small profit
          
          positionLogger.trade(`BREAK-EVEN: Moving stop (P&L: ${pnlPercent.toFixed(2)}%, Entry: ${entryPrice.toFixed(2)}, BE Stop: ${breakEvenStop.toFixed(2)}, Activation: ${effectiveBreakEvenActivation.toFixed(2)}%${isStrongTrend ? ' [STRONG TREND]' : ''}, Slippage Buffer: ${slippageBuffer.toFixed(4)})`);
          
          // Use optimistic locking
          const { data: updatedBEPos, error: beUpdateError } = await supabase
            .from("positions")
            .update({ stop_loss: breakEvenStop })
            .eq("id", position.id)
            .eq("status", "active")
            .select()
            .maybeSingle();

          if (beUpdateError) {
            positionLogger.error(`Error updating break-even stop for ${position.id}: ${beUpdateError}`);
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
                positionLogger.info(`Break-even notification sent`);
              }
            } catch (notifError) {
              positionLogger.error(`Error sending break-even notification: ${notifError}`);
            }
          }
        }
      }

      // ============================================================
      // SCENARIO 5 PHASE 2: EXPLICIT EXIT HIERARCHY
      // Priority order (highest to lowest - early return pattern):
      // 1. CIRCUIT_BREAKER (100) - Portfolio-level emergency (handled earlier)
      // 2. FLASH_CRASH (90) - Market emergency
      // 3. EXTREME_VOLATILITY (85) - Extreme ATR
      // 4. STOP_LOSS_HIT (80) - Hard stop triggered (handled by exchange)
      // 5. TAKE_PROFIT_HIT (75) - TP triggered (handled by exchange)
      // 6. SMART_AITS_DECAY (70) - Rapid profit decay (handled earlier)
      // 7. REVERSAL_RISK_HIGH (60) - High reversal score
      // 8. TREND_REVERSAL (55) - Trend flipped with persistence
      // 9. EARLY_WARNING (50) - 1h flip + weak 4h
      // 10. TIME_BASED (40) - Stale losing position
      // ============================================================
      let shouldClose = false;
      let closeReason = "";
      let exitPriority = 0;

      // 🚨 PRIORITY 1-3: EMERGENCY EXITS (highest priority - early return)
      if (emergencyClose) {
        shouldClose = true;
        closeReason = emergencyReason;
        exitPriority = emergencyReason === "flash_crash" ? EXIT_PRIORITY.FLASH_CRASH : EXIT_PRIORITY.EXTREME_VOLATILITY;
        positionLogger.risk(`EXIT HIERARCHY [P${exitPriority}]: EMERGENCY - ${position.side} - Reason: ${emergencyReason}`);
        trendExits.push({
          symbol: position.symbol,
          side: position.side,
          reason: `EMERGENCY [P${exitPriority}]: ${emergencyReason}`,
          trend: "emergency",
          confidence: 100,
          pnlPercent,
        });
      }

      if (!shouldClose && trendData) {
        const currentTrend = trendData.primaryTrend; // 'bullish', 'bearish', or 'ranging'
        const trendConfidence = trendData.confidence || 0;
        // Use correct paths from calculate-trend response with emaSignal fallback
        const trend1h = trendData.timeframes?.['1h']?.trend || trendData.timeframes?.['1h']?.indicators?.emaSignal || 'neutral';
        const trend4h = trendData.timeframes?.['4h']?.trend || trendData.timeframes?.['4h']?.indicators?.emaSignal || 'neutral';
        const momentum = trendData.momentum || {};
        const stochRsi = trendData.stochasticRsi?.aggregated || trendData.stochasticRsi || {};

        // ============= REVERSAL RISK DETECTION FOR EXITS (aligned with strategy-analyzer) =============
        // Calculate reversal risk score for the CURRENT position direction
        // Uses ADX-adaptive weighting for consistency across functions
        const detectReversalRiskForExit = (positionSide: string): { riskScore: number; signals: string[]; adxWeight: number } => {
          const signals: string[] = [];
          let riskScore = 0;
          
          // ADX-based adaptive reversal weight - Uses centralized ADX_THRESHOLDS
          const getAdxReversalWeight = (adxValue: number): number => {
            if (adxValue >= ADX_THRESHOLDS.EXCEPTIONAL) return 0.5;  // Strong trend, reduce reversal impact
            if (adxValue >= ADX_THRESHOLDS.MINIMUM) return 0.7;      // Moderate trend
            return 1.0;                                               // Weak trend, full reversal impact
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
          
          // RSI pullback detection for conflict resolution
          const rsi4h = trendData.timeframes?.['4h']?.indicators?.rsi ?? 50;
          const momentumConfirms = momentum.confirms === true;
          
          // For SHORT positions: check for bullish reversal signals
          if (positionSide === "SELL") {
            // RSI indicates SHORT pullback (price rallying = good for exit timing)
            const rsiIndicatesPullback = rsi4h > RSI_THRESHOLDS.BEARISH_RALLY || rsi4h > RSI_THRESHOLDS.NEUTRAL_HIGH;
            const shouldReduceStochZonePenalty = rsiIndicatesPullback && momentumConfirms;
            
            if ((stochRsi.bullishCrossCount || 0) >= 1) {
              riskScore += 25;
              signals.push(`StochRSI bullish cross (${stochRsi.bullishCrossCount} TF)`);
            }
            if ((stochRsi.oversoldCount || 0) >= 2) {
              // Apply 50% reduction if RSI pullback + momentum confirms
              let zoneScore = 15;
              if (shouldReduceStochZonePenalty) {
                zoneScore = Math.round(zoneScore * 0.5);
                signals.push(`StochRSI oversold on ${stochRsi.oversoldCount} TF - reduced 50% (RSI pullback + momentum)`);
              } else {
                signals.push(`StochRSI oversold on ${stochRsi.oversoldCount} TF (bounce risk)`);
              }
              riskScore += zoneScore;
            }
            if (trend1h === "bullish") {
              riskScore += 20;
              signals.push("1h trend turned bullish");
            }
          }
          // For LONG positions: check for bearish reversal signals
          else if (positionSide === "BUY") {
            // RSI indicates LONG pullback (price dipping = good for entry/hold timing)
            const rsiIndicatesPullback = rsi4h < RSI_THRESHOLDS.BULLISH_PULLBACK || rsi4h < RSI_THRESHOLDS.NEUTRAL_LOW;
            const shouldReduceStochZonePenalty = rsiIndicatesPullback && momentumConfirms;
            
            if ((stochRsi.bearishCrossCount || 0) >= 1) {
              riskScore += 25;
              signals.push(`StochRSI bearish cross (${stochRsi.bearishCrossCount} TF)`);
            }
            if ((stochRsi.overboughtCount || 0) >= 2) {
              // Apply 50% reduction if RSI pullback + momentum confirms
              let zoneScore = 15;
              if (shouldReduceStochZonePenalty) {
                zoneScore = Math.round(zoneScore * 0.5);
                signals.push(`StochRSI overbought on ${stochRsi.overboughtCount} TF - reduced 50% (RSI pullback + momentum)`);
              } else {
                signals.push(`StochRSI overbought on ${stochRsi.overboughtCount} TF (pullback risk)`);
              }
              riskScore += zoneScore;
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

        // ============================================================
        // UNIFIED HEDGE AND REVERSAL EXIT HANDLER
        // Handles both BUY and SELL positions with side-specific logic
        // ============================================================
        const handleHedgeAndReversalExit = async (
          positionSide: "BUY" | "SELL"
        ): Promise<{ shouldClose: boolean; closeReason: string }> => {
          let result = { shouldClose: false, closeReason: "" };
          
          // Side-specific configuration
          const isLong = positionSide === "BUY";
          const oppositeDirection = isLong ? "bearish" : "bullish";
          const earlyWarningTrend = isLong ? "bearish" : "bullish";
          const hedgeSide = isLong ? "SELL" : "BUY";
          
          // Get 4h confidence from timeframes data
          const confidence4h = trendData.timeframes?.['4h']?.confidence || trendConfidence;
          
          // Calculate reversal risk for this side
          const reversalRisk = detectReversalRiskForExit(positionSide);
          const MIN_LOSS_FOR_REVERSAL_EXIT = EXIT_THRESHOLDS.MIN_LOSS_FOR_REVERSAL_EXIT_PERCENT;
          
          // Check hedge status
          const hasHedge = position.hedge_position_id !== null;
          const isHedge = position.is_hedge === true;
          
          // StochRSI filter for hedge opening - prevent hedges at extreme levels
          // For LONG: Don't hedge when K < OVERSOLD (price likely to bounce up)
          // For SHORT: Don't hedge when K > OVERBOUGHT (price likely to drop)
          const stochRsi4h = trendData.stochasticRsi?.["4h"] || trendData.stochasticRsi?.aggregated || {};
          const stochRsiK4h = stochRsi4h?.k ?? 50;
          const shouldBlockHedgeByStochRsi = isLong 
            ? stochRsiK4h < STOCHRSI_THRESHOLDS.OVERSOLD
            : stochRsiK4h > STOCHRSI_THRESHOLDS.OVERBOUGHT;
          
          // Apply hedging logic if enabled and risk is in hedge range
          // Only apply if position has met minimum hold time AND StochRSI allows
          const hedgeCondition = isLong ? !result.shouldClose : true; // BUY has extra !shouldClose check
          if (hedgeCondition && hasMetMinHoldTime && userSettings.hedgingEnabled && 
              !isHedge && !hasHedge && !shouldBlockHedgeByStochRsi &&
              reversalRisk.riskScore >= userSettings.hedgeReversalRiskMin && 
              reversalRisk.riskScore < userSettings.hedgeReversalRiskMax &&
              pnlPercent < MIN_LOSS_FOR_REVERSAL_EXIT) {
            
            const hedgeQuantity = position.quantity * (userSettings.hedgePositionSizePercent / 100);
            positionLogger.trade(`HEDGE: Opening ${hedgeSide} hedge for ${positionSide} - Risk ${reversalRisk.riskScore}% | StochRSI 4h K=${stochRsiK4h.toFixed(1)}`);
            
            // Calculate parent loss percent (formula differs by side)
            const parentLossPercent = isLong
              ? ((position.entry_price - currentPrice) / position.entry_price) * 100
              : ((currentPrice - position.entry_price) / position.entry_price) * 100;
            const parentLossAmount = Math.abs(parentLossPercent);
            
            // Hedge TP should cover the parent's loss + some profit (1.5x coverage)
            const hedgeTpPercent = Math.max(parentLossAmount * 1.5, 1.0);
            // For SELL hedge: TP when price goes DOWN, SL when goes UP
            // For BUY hedge: TP when price goes UP, SL when goes DOWN
            const hedgeTpPrice = isLong
              ? currentPrice * (1 - hedgeTpPercent / 100)
              : currentPrice * (1 + hedgeTpPercent / 100);
            const hedgeSlPrice = isLong
              ? currentPrice * 1.015  // 1.5% stop above for SELL hedge
              : currentPrice * 0.985; // 1.5% stop below for BUY hedge
            
            positionLogger.info(`HEDGE CALC: Parent ${positionSide} loss ${parentLossPercent.toFixed(2)}%, Hedge TP target ${hedgeTpPercent.toFixed(2)}% at $${hedgeTpPrice.toFixed(4)}`);
            
            // Insert hedge position
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
                strategy_name: null, // Prevent strategy stat pollution
                trend: currentTrend,
                confidence_score: reversalRisk.riskScore,
              })
              .select()
              .single();
            
            if (!hedgeError && hedgePosition) {
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
              positionLogger.success(`Hedge opened: ${hedgeSide} ${hedgeQuantity} at ${currentPrice}`);
            } else {
              positionLogger.error(`Failed to open hedge: ${hedgeError?.message}`);
            }
          }
          // Log when hedge was blocked by StochRSI filter
          else if (shouldBlockHedgeByStochRsi && hasMetMinHoldTime && userSettings.hedgingEnabled && 
                   reversalRisk.riskScore >= userSettings.hedgeReversalRiskMin) {
            const blockReason = isLong
              ? `StochRSI 4h K=${stochRsiK4h.toFixed(1)} < ${STOCHRSI_THRESHOLDS.OVERSOLD} (oversold, price likely to bounce - helps LONG)`
              : `StochRSI 4h K=${stochRsiK4h.toFixed(1)} > ${STOCHRSI_THRESHOLDS.OVERBOUGHT} (overbought, price likely to drop - helps SHORT)`;
            positionLogger.info(`HEDGE BLOCKED: ${positionSide} - ${blockReason}`);
          }
          
          // Check for high reversal risk exit
          // SCENARIO 5 FIX: ADX block for reversal exits - never fight strong trends
          // Skip reversal exit entirely if ADX >= 30 (strong trend in progress)
          const positionAgeHours = positionAgeMinutes / 60;
          const MIN_AGE_FOR_REVERSAL_EXIT_HOURS = EXIT_THRESHOLDS.MIN_AGE_FOR_REVERSAL_EXIT_HOURS;
          const REVERSAL_RISK_EXIT_THRESHOLD = dynamicReversalThreshold;
          const REVERSAL_EXIT_BLOCK_ADX = EXIT_THRESHOLDS.REVERSAL_EXIT_BLOCK_ADX;
          
          // Block reversal exits when ADX >= 30 (strong trend)
          const isStrongTrendBlock = positionAdx >= REVERSAL_EXIT_BLOCK_ADX;
          
          const reversalExitCondition = isLong ? !result.shouldClose : true; // BUY has extra check
          if (reversalExitCondition && hasMetMinHoldTime && 
              positionAgeHours >= MIN_AGE_FOR_REVERSAL_EXIT_HOURS &&
              reversalRisk.riskScore >= REVERSAL_RISK_EXIT_THRESHOLD && 
              pnlPercent < MIN_LOSS_FOR_REVERSAL_EXIT) {
            
            // SCENARIO 5 FIX: Skip reversal exit if ADX indicates strong trend
            if (isStrongTrendBlock) {
              positionLogger.info(
                `REVERSAL EXIT BLOCKED: ADX ${positionAdx.toFixed(1)} >= ${REVERSAL_EXIT_BLOCK_ADX} (strong trend) - reversal exits should never fight strong trends. Risk ${reversalRisk.riskScore}/100`,
              );
            } else {
              result.shouldClose = true;
              result.closeReason = "reversal_risk_high";
              positionLogger.risk(
                `REVERSAL RISK EXIT: Closing ${positionSide} - Risk ${reversalRisk.riskScore}/100 (ADX weight: ${reversalRisk.adxWeight}) >= ${REVERSAL_RISK_EXIT_THRESHOLD} (dynamic), Age: ${positionAgeHours.toFixed(1)}h, ADX: ${positionAdx.toFixed(1)}, VolScore: ${positionVolumeScore}, Conf: ${positionConfidence}%`,
              );
            }
          }
          
          // Early warning logic - TIGHTENED THRESHOLDS
          if (!result.shouldClose && hasMetMinHoldTime && positionAgeHours >= EXIT_THRESHOLDS.MIN_AGE_FOR_REVERSAL_EXIT_HOURS) {
            const EARLY_WARNING_MIN_LOSS_PERCENT = EXIT_THRESHOLDS.EARLY_WARNING_MIN_LOSS_PERCENT;
            const EARLY_WARNING_MIN_CONFIDENCE_4H = EXIT_THRESHOLDS.EARLY_WARNING_MIN_CONFIDENCE_4H;
            
            if (trend1h === earlyWarningTrend && confidence4h < EARLY_WARNING_MIN_CONFIDENCE_4H && pnlPercent < EARLY_WARNING_MIN_LOSS_PERCENT) {
              result.shouldClose = true;
              result.closeReason = `early_warning_1h_${earlyWarningTrend}`;
              positionLogger.signal(
                `EARLY WARNING EXIT: Closing ${positionSide} - 1h ${earlyWarningTrend.toUpperCase()} + 4h very weak (4h conf: ${confidence4h}%, P&L: ${pnlPercent.toFixed(2)}%)`,
              );
            } else if (currentTrend === oppositeDirection && trendConfidence >= EXIT_THRESHOLDS.TREND_REVERSAL_MIN_CONFIDENCE) {
              // SCENARIO 5 PHASE 2: Trend reversal persistence check
              // Track consecutive bars of reversal - only exit when persisted >= threshold
              const currentPersistedBars = position.reversal_persisted_bars || 0;
              const PERSISTENCE_REQUIRED = EXIT_THRESHOLDS.TREND_REVERSAL_PERSISTENCE_BARS;
              
              if (currentPersistedBars + 1 >= PERSISTENCE_REQUIRED) {
                // Persistence requirement met - trigger exit
                result.shouldClose = true;
                result.closeReason = `trend_reversal_${oppositeDirection}`;
                positionLogger.signal(
                  `TREND EXIT: Closing ${positionSide} - Strong ${oppositeDirection.toUpperCase()} trend PERSISTED ${currentPersistedBars + 1} bars (conf: ${trendConfidence}%)`,
                );
                // Reset persistence counter on exit
                await supabase
                  .from("positions")
                  .update({ reversal_persisted_bars: 0 })
                  .eq("id", position.id);
              } else {
                // Increment persistence counter - not enough bars yet
                const newPersistedBars = currentPersistedBars + 1;
                positionLogger.info(
                  `TREND REVERSAL DETECTED but not persisted: ${oppositeDirection.toUpperCase()} trend for ${newPersistedBars}/${PERSISTENCE_REQUIRED} bars (conf: ${trendConfidence}%) - waiting for confirmation`,
                );
                await supabase
                  .from("positions")
                  .update({ reversal_persisted_bars: newPersistedBars })
                  .eq("id", position.id);
              }
            } else if (position.reversal_persisted_bars && position.reversal_persisted_bars > 0) {
              // Trend reversal no longer detected - reset persistence counter
              positionLogger.info(`TREND REVERSAL CLEARED: Resetting persistence counter (was ${position.reversal_persisted_bars} bars)`);
              await supabase
                .from("positions")
                .update({ reversal_persisted_bars: 0 })
                .eq("id", position.id);
            }
          }
          
          return result;
        };

        // PRIORITY 7-9: Process position-specific exits (reversal risk, trend reversal, early warning)
        if (position.side === "SELL" || position.side === "BUY") {
          const exitResult = await handleHedgeAndReversalExit(position.side as "BUY" | "SELL");
          if (exitResult.shouldClose) {
            shouldClose = true;
            closeReason = exitResult.closeReason;
            
            // Determine exit priority based on reason
            if (exitResult.closeReason === "reversal_risk_high") {
              exitPriority = EXIT_PRIORITY.REVERSAL_RISK_HIGH;
            } else if (exitResult.closeReason.startsWith("trend_reversal")) {
              exitPriority = EXIT_PRIORITY.TREND_REVERSAL;
            } else if (exitResult.closeReason.startsWith("early_warning")) {
              exitPriority = EXIT_PRIORITY.EARLY_WARNING;
            }
            
            const confidence4h = trendData.timeframes?.['4h']?.confidence || trendConfidence;
            positionLogger.signal(`EXIT HIERARCHY [P${exitPriority}]: ${exitResult.closeReason.toUpperCase()}`);
            trendExits.push({
              symbol: position.symbol,
              side: position.side,
              reason: `[P${exitPriority}] Trend: ${currentTrend} (${trendConfidence}%), 4h: ${trend4h} (${confidence4h}%), 1h: ${trend1h}`,
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
        const MIN_LOSS_FOR_TIME_EXIT = EXIT_THRESHOLDS.TIME_BASED_MIN_PNL_PERCENT;
        const TIME_BASED_MAX_ADX = EXIT_THRESHOLDS.TIME_BASED_MAX_ADX;
        
        if (hoursOpen >= effectiveTimeLimit) {
          // ONLY close if position is losing significantly
          // Let break-even or profitable positions continue running
          if (pnlPercent < MIN_LOSS_FOR_TIME_EXIT) {
            // SCENARIO 5 FIX: ADX filter for time-based exit - only exit in stagnation
            // Time exits should punish stagnation (low ADX), not volatility (high ADX)
            if (positionAdx >= TIME_BASED_MAX_ADX) {
              positionLogger.info(
                `TIME EXIT BLOCKED: ADX ${positionAdx.toFixed(1)} >= ${TIME_BASED_MAX_ADX} (volatile market) - time exits should punish stagnation, not volatility. ` +
                `P&L: ${pnlPercent.toFixed(2)}%, Open: ${hoursOpen.toFixed(1)}h`
              );
            } else {
              // Calculate distance from stop loss for context
              const stopLoss = position.stop_loss || position.entry_price * (position.side === 'buy' ? 0.98 : 1.02);
              const distanceToStopPercent = position.side === 'buy' 
                ? ((currentPrice - stopLoss) / stopLoss) * 100 
                : ((stopLoss - currentPrice) / currentPrice) * 100;
              
              shouldClose = true;
              closeReason = "time_based_stop";
              exitPriority = EXIT_PRIORITY.TIME_BASED;
              positionLogger.trade(
                `EXIT HIERARCHY [P${exitPriority}]: TIME_BASED - Closing stagnant ${position.side} - Open ${hoursOpen.toFixed(1)}h (limit: ${effectiveTimeLimit.toFixed(1)}h), ` +
                `P&L: ${pnlPercent.toFixed(2)}% (threshold: ${MIN_LOSS_FOR_TIME_EXIT}%), ` +
                `ADX: ${positionAdx.toFixed(1)} < ${TIME_BASED_MAX_ADX} (stagnation), ` +
                `Distance to SL: ${distanceToStopPercent.toFixed(2)}%, ATR: ${atrPercent.toFixed(2)}%`
              );
              
              trendExits.push({
                symbol: position.symbol,
                side: position.side,
                reason: `[P${exitPriority}] Time-based: ${hoursOpen.toFixed(1)}h open, ${pnlPercent.toFixed(2)}% P&L, ADX ${positionAdx.toFixed(1)} (stagnant)`,
                trend: "stale",
                confidence: 0,
                pnlPercent,
              });
            }
          } else {
            positionLogger.info(
              `TIME EXIT SKIPPED: P&L ${pnlPercent.toFixed(2)}% above threshold ${MIN_LOSS_FOR_TIME_EXIT}% - position continues`
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
          
          // Calculate minimum stop distance using centralized constant
          const minStopDistancePercent = RISK_PARAMS.MIN_STOP_DISTANCE_PERCENT;
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
              positionLogger.trade(`DYNAMIC TIGHTENING: LONG - Stop ${position.stop_loss.toFixed(2)} → ${newTightenedStop.toFixed(2)} (${newDistancePercent.toFixed(2)}% from entry, min ${minStopDistancePercent}%)`);
              
              const { error: tightenError } = await supabase
                .from("positions")
                .update({ stop_loss: newTightenedStop })
                .eq("id", position.id)
                .eq("status", "active");
              
              if (tightenError) {
                positionLogger.error(`Error tightening stop for ${position.id}: ${tightenError}`);
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
              positionLogger.trade(`DYNAMIC TIGHTENING: SHORT - Stop ${position.stop_loss.toFixed(2)} → ${newTightenedStop.toFixed(2)} (${newDistancePercent.toFixed(2)}% from entry, min ${minStopDistancePercent}%)`);
              
              const { error: tightenError } = await supabase
                .from("positions")
                .update({ stop_loss: newTightenedStop })
                .eq("id", position.id)
                .eq("status", "active");
              
              if (tightenError) {
                positionLogger.error(`Error tightening stop for ${position.id}: ${tightenError}`);
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
            
            positionLogger.trade(`PARTIAL LOSS: ${position.side} - Price ${lossProgressPercent.toFixed(1)}% toward stop, closing ${(closePercent * 100).toFixed(0)}%`);
            
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
              positionLogger.error(`Error executing partial loss for ${position.id}: ${partialLossError}`);
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
                positionLogger.error(`Error creating partial loss record: ${partialCloseRecordError}`);
              }
              
              positionLogger.success(`Partial loss executed: closed ${closeQuantity.toFixed(4)} (${(closePercent * 100).toFixed(0)}%), remaining ${remainingQuantity.toFixed(4)}, Loss: $${partialLoss.toFixed(2)} (${partialLossPercent.toFixed(2)}%)`);
              
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
                positionLogger.error(`Error sending partial loss notification: ${notifError}`);
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
          positionLogger.error(`Failed to set partial TP levels: ${tpUpdateError}`);
        } else {
          positionLogger.trade(`Set partial TP levels: TP1=$${tp1Price.toFixed(2)}, TP2=$${tp2Price.toFixed(2)}, TP3=$${tp3Price.toFixed(2)}`);
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
          positionLogger.signal(`TP1 HIT for LONG: Price $${currentPrice.toFixed(2)} >= TP1 $${tp1Price.toFixed(2)}`);
        } else if (currentTpLevel < 2 && currentTpLevel >= 1 && currentPrice >= tp2Price) {
          partialTpTriggered = true;
          partialClosePercent = 60; // Close 60% of remaining (30% of original)
          newTpLevel = 2;
          partialCloseReason = "partial_tp_2";
          positionLogger.signal(`TP2 HIT for LONG: Price $${currentPrice.toFixed(2)} >= TP2 $${tp2Price.toFixed(2)}`);
        }
      } else {
        // SHORT: TP when price goes DOWN
        if (currentTpLevel < 1 && currentPrice <= tp1Price) {
          partialTpTriggered = true;
          partialClosePercent = 50;
          newTpLevel = 1;
          partialCloseReason = "partial_tp_1";
          positionLogger.signal(`TP1 HIT for SHORT: Price $${currentPrice.toFixed(2)} <= TP1 $${tp1Price.toFixed(2)}`);
        } else if (currentTpLevel < 2 && currentTpLevel >= 1 && currentPrice <= tp2Price) {
          partialTpTriggered = true;
          partialClosePercent = 60;
          newTpLevel = 2;
          partialCloseReason = "partial_tp_2";
          positionLogger.signal(`TP2 HIT for SHORT: Price $${currentPrice.toFixed(2)} <= TP2 $${tp2Price.toFixed(2)}`);
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
          positionLogger.error(`Error executing partial TP for ${position.id}: ${partialUpdateError}`);
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
            positionLogger.error(`Error creating partial TP record: ${partialTpRecordError}`);
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
          
          positionLogger.success(`Partial TP${newTpLevel} executed: closed ${closeQuantity.toFixed(4)} (${partialClosePercent}%), remaining ${remainingQuantity.toFixed(4)}, P&L: $${partialPnl.toFixed(2)} (${partialPnlPercent.toFixed(2)}%)`);
          
          // Log stop loss status after TP1
          if (newTpLevel === 1) {
            if (newStopLossAfterTp > position.entry_price && position.side === "BUY") {
              positionLogger.info(`Stop loss kept at trailing level ($${newStopLossAfterTp.toFixed(2)}) after TP1 (above break-even $${position.entry_price.toFixed(2)})`);
            } else if (newStopLossAfterTp < position.entry_price && position.side === "SELL") {
              positionLogger.info(`Stop loss kept at trailing level ($${newStopLossAfterTp.toFixed(2)}) after TP1 (below break-even $${position.entry_price.toFixed(2)})`);
            } else {
              positionLogger.info(`Stop loss moved to break-even ($${position.entry_price.toFixed(2)}) after TP1`);
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
            positionLogger.error(`Error sending partial TP notification: ${notifError}`);
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
      // Calculate break-even tolerance: must account for slippage buffer (0.05% of entry)
      const breakEvenTolerance = position.entry_price * (SLIPPAGE_PARAMS.BREAK_EVEN_BUFFER_PERCENT / 100) * 1.5;
      
      if (!shouldClose && position.side === "BUY") {
        // LONG: TP when price goes UP, SL when price goes DOWN
        if (position.take_profit && currentPrice >= position.take_profit) {
          shouldClose = true;
          closeReason = "take_profit";
        } else if (newStopLoss && currentPrice <= newStopLoss) {
          shouldClose = true;
          // Determine close reason based on stop loss state:
          // 1. Break-even: stop_loss is within tolerance of entry_price (includes slippage buffer)
          // 2. Trailing stop: stop_loss is significantly above entry_price (profit locked in)
          // 3. Regular stop loss: stop_loss is below entry_price (loss taken)
          const distanceFromEntry = newStopLoss - position.entry_price;
          if (Math.abs(distanceFromEntry) <= breakEvenTolerance) {
            // Stop loss is at or near entry price (within slippage buffer) = break-even stop
            closeReason = "break_even";
          } else if (userSettings.enabled && distanceFromEntry > breakEvenTolerance) {
            // Stop was moved significantly above entry = trailing stop locked profit
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
          // 1. Break-even: stop_loss is within tolerance of entry_price (includes slippage buffer)
          // 2. Trailing stop: stop_loss is significantly below entry_price (profit locked in)
          // 3. Regular stop loss: stop_loss is above entry_price (loss taken)
          const distanceFromEntry = position.entry_price - newStopLoss;
          if (Math.abs(distanceFromEntry) <= breakEvenTolerance) {
            // Stop loss is at or near entry price (within slippage buffer) = break-even stop
            closeReason = "break_even";
          } else if (userSettings.enabled && distanceFromEntry > breakEvenTolerance) {
            // Stop was moved significantly below entry = trailing stop locked profit
            closeReason = "trailing_stop_loss";
          } else {
            // Regular stop loss
            closeReason = "stop_loss";
          }
        }
      }
      if (shouldClose) {
        // For break-even closes, ensure P&L is at least 0 by using entry price
        // This prevents slippage from causing false losses on break-even exits
        let finalExitPrice = currentPrice;
        let finalPnl = pnl;
        let finalPnlPercent = pnlPercent;
        
        if (closeReason === "break_even") {
          // Use entry price to guarantee 0 P&L for break-even stops
          // Break-even is meant to protect capital, not generate losses
          finalExitPrice = position.entry_price;
          finalPnl = 0;
          finalPnlPercent = 0;
          positionLogger.trade(`BREAK-EVEN: Using entry price ${finalExitPrice} for P&L (current: ${currentPrice})`);
        }
        
        // Close the position with optimistic locking to prevent race conditions
        // Only update if status is still 'active' - prevents double-closing
        const { data: updatedPosition, error: closePosError } = await supabase
          .from("positions")
          .update({
            status: "closed",
            current_price: currentPrice,
            exit_price: finalExitPrice,
            realized_pnl: finalPnl,
            realized_pnl_percent: finalPnlPercent,
            closed_at: new Date().toISOString(),
            close_reason: closeReason,
          })
          .eq("id", position.id)
          .eq("status", "active") // RACE CONDITION FIX: Only close if still active
          .select()
          .maybeSingle();

        if (closePosError) {
          positionLogger.error(`Error closing position ${position.id}: ${closePosError}`);
          continue; // Skip to next position instead of throwing
        }

        // Only count as closed if we actually updated a row (wasn't already closed by another process)
        if (updatedPosition) {
          closedPositions.push({
            symbol: position.symbol,
            side: position.side,
            reason: closeReason,
            exitPrice: finalExitPrice,
            pnl: finalPnl,
            pnlPercent: finalPnlPercent,
          });
          positionLogger.trade(
            `Closed position ${position.id} - ${position.side} - ${closeReason} at ${finalExitPrice} (P&L: $${finalPnl.toFixed(2)})`,
          );
          
          // 🆕 HEDGE CLEANUP: If parent position had a hedge, close the hedge too
          if (position.hedge_position_id) {
            positionLogger.trade(`HEDGE CLEANUP: Closing hedge for parent ${position.side}`);
            
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
                positionLogger.success(`Hedge closed with parent: ${hedgePos.side}, P&L: $${hedgePnl.toFixed(2)} (${hedgePnlPercent.toFixed(2)}%)`);
              }
            }
          }
        } else {
          positionLogger.info(
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
    logger.summary(responseData.message);
    return new Response(message, {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    logError(logger, error, "monitoring positions");
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
