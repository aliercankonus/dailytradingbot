import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import { ADX_THRESHOLDS, STOCHRSI_THRESHOLDS, RSI_THRESHOLDS, SLIPPAGE_PARAMS, RISK_PARAMS, EMERGENCY_EXIT_PARAMS, EXIT_THRESHOLDS, EXIT_PRIORITY, PARTIAL_TP_PARAMS, R_MULTIPLE_TRAILING_PARAMS, PROGRESSIVE_PROFIT_LOCK_PARAMS, MICRO_PROFIT_LOCK_PARAMS, VOLUME_RELAXATION_EXIT_PARAMS, R_MULTIPLE_LOCK_PARAMS, DYNAMIC_TRAILING_PARAMS, CONTINUATION_MODE_PARAMS, DECAY_VELOCITY_TIERS, MEAN_REVERSION_CONFIG, TRADING_FEE_PARAMS, DYNAMIC_REVERSAL_EXIT, COMPRESSION_TRADE_EXIT, STRATEGY_EXIT_ADJUSTMENTS, HTF_ALIGNMENT_EXIT, TRAILING_STOP_INLINE, MICRO_TREND_EXIT, MOMENTUM_CONTINUATION_EXIT, LOW_CONFIDENCE_STANDARD_EXIT, HEDGE_EXIT_PARAMS, REVERSAL_RISK_EXIT_SCORES, TIME_STOP_MULTIPLIER as TIME_STOP_MULT, PARTIAL_TP_LADDER, TRAILING_MIN_PROFIT_FLOOR, PEAK_ADAPTIVE_TRAILING, VOLATILITY_ADAPTIVE_TRAILING, detectStrategyType, isMomentumStrategy, isMeanReversionStrategy } from "../_shared/constants.ts";
import {
  evaluateDecayVelocity,
  evaluateMicroProfitLock,
  evaluateProgressiveProfitLock,
  evaluateMeanReversionExit,
  calculateFeeAwarePnL as sharedCalculateFeeAwarePnL,
  getProgressiveLockPercent as sharedGetProgressiveLockPercent,
  getStalePeakBonus as sharedGetStalePeakBonus,
  type PositionContext as ExitPositionContext,
  type MarketContext as ExitMarketContext,
  type UserExitSettings,
} from "../_shared/exit-strategies.ts";
import { calculateATR, calculateEMA } from "../_shared/indicators.ts";
import { 
  getStochRsiWeightedRsiScore, 
  getConfidencePenalty, 
  getAdxWeight,
  calculateUnifiedReversalScore,
  // Legacy extractors removed — all logic reads from MarketFeatureSnapshot (mfs) directly
  type UnifiedReversalResult
} from "../_shared/scoring.ts";
import { buildMarketFeatureSnapshot, type MarketFeatureSnapshot } from "../_shared/market-feature-snapshot.ts";

// ============================================================
// TRUE ALIGNMENT v2.0 EXTRACTION HELPER
// For consistent HTF context awareness across exit decisions
// ============================================================
interface TrueAlignmentData {
  score: number;
  tf4hConfidence: number;
  tf1hConfidence: number;
  adxContribution: number;
  totalWeightedConfidence: number;
  weightedComponents: {
    tf4hWeighted: number;
    tf1hWeighted: number;
    adxWeighted: number;
    volumeWeighted: number;
  };
  neutralCapped: boolean;
  isPremium: boolean;  // Strong HTF alignment
  isWeak: boolean;     // Weak/neutral alignment
}

function extractTrueAlignmentFromMFS(mfs: MarketFeatureSnapshot | undefined): TrueAlignmentData | null {
  if (!mfs) return null;
  const alignment = mfs.trueAlignment;
  if (!alignment || (alignment.score === 0 && alignment.tf4hConfidence === 0)) return null;
  
  const weighted = alignment.weightedComponents || {} as any;
  const tf4hWeighted = weighted.tf4hWeighted ?? 0;
  const tf1hWeighted = weighted.tf1hWeighted ?? 0;
  const adxContribution = alignment.adxContribution ?? 0;
  const tf4hConfidence = alignment.tf4hConfidence ?? 0;
  const neutralCapped = alignment.neutralCapped === true;
  
  return {
    score: alignment.score ?? alignment.totalWeightedConfidence ?? 0,
    tf4hConfidence,
    tf1hConfidence: alignment.tf1hConfidence ?? 0,
    adxContribution,
    totalWeightedConfidence: alignment.totalWeightedConfidence ?? 0,
    weightedComponents: {
      tf4hWeighted,
      tf1hWeighted,
      adxWeighted: weighted.adxWeighted ?? 0,
      volumeWeighted: weighted.volumeWeighted ?? 0,
    },
    neutralCapped,
    isPremium: tf4hWeighted >= HTF_ALIGNMENT_EXIT.PREMIUM_MIN_TF4H_WEIGHTED && tf1hWeighted >= HTF_ALIGNMENT_EXIT.PREMIUM_MIN_TF1H_WEIGHTED && adxContribution >= HTF_ALIGNMENT_EXIT.PREMIUM_MIN_ADX_CONTRIBUTION,
    isWeak: neutralCapped || tf4hConfidence < HTF_ALIGNMENT_EXIT.WEAK_MAX_TF4H_CONFIDENCE,
  };
}
// trend-types import removed — all reads come from MarketFeatureSnapshot (mfs)
// Phase 3: Smart Momentum for context-aware exit management
import {
  calculateMomentumScore,
  calculateDynamicTrailing,
  calculateExitSignal,
  findSwingPoints,
  type MomentumScoreResult,
  type DynamicTrailingResult,
  type ExitSignalResult,
  type SwingPointResult
} from "../_shared/smart-momentum.ts";
import { createLogger, logError } from "../_shared/logging.ts";
import { getCurrentPrice, getKlines, get24hrTicker } from "../_shared/binance.ts";

// Create logger instance
const logger = createLogger("monitor-positions");

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

// ============= FEE-AWARE P&L CALCULATION =============
// Centralized helper for consistent fee calculation across all close operations
// FeeAwarePnL delegated to shared exit-strategies module
const calculateFeeAwarePnL = sharedCalculateFeeAwarePnL;

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
          breakEvenActivationPercent: rp.break_even_activation_percent ?? 0.55,
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
          // Partial Loss Taking - 85% trigger with 25% close gives positions maximum room to recover
          // This reduces "death by a thousand cuts" from early partial closes
          partialLossTakingEnabled: rp.partial_loss_taking_enabled ?? true,
          partialLossTriggerPercent: rp.partial_loss_trigger_percent ?? 85,
          partialLossClosePercent: rp.partial_loss_close_percent ?? 25,
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

      // PHASE 3: Calculate recent price movement within FLASH_CRASH_MAX_CANDLES (2 candles by default)
      // This ensures flash crash detection is based on sudden moves, not slow trends
      const candlesToCheck = Math.min(EMERGENCY_EXIT_PARAMS.FLASH_CRASH_MAX_CANDLES, klines.length - 1);
      const lastCandle = klines[klines.length - 1];
      const referenceCandle = klines[klines.length - 1 - candlesToCheck];
      const prevCandle = klines[klines.length - 2];
      const lastClose = parseFloat(lastCandle[4]);
      const prevClose = parseFloat(prevCandle[4]);
      const referenceClose = parseFloat(referenceCandle[4]);
      // Use the reference candle (N candles ago) for flash crash check
      const recentPriceChange = ((lastClose - referenceClose) / referenceClose) * 100;
      // Also track single candle change for logging
      const singleCandleChange = ((lastClose - prevClose) / prevClose) * 100;

      // Volume analysis (use last closed candle, not live forming candle)
      const closedKlines = klines.slice(0, -1);
      const currentVolume = closedKlines.length > 0 ? parseFloat(closedKlines[closedKlines.length - 1][5]) : 0;
      const avgCandleVolume = closedKlines.slice(-20).reduce((sum, k) => sum + parseFloat(k[5]), 0) / Math.min(20, closedKlines.length || 1);
      const volumeRatio = avgCandleVolume > 0 ? currentVolume / avgCandleVolume : 1; // >3 = volume spike

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

      // PHASE 3: Find swing points for structure-based stops
      const swingPointsResult = findSwingPoints(klines, 20);

      // NOTE: Momentum calculation is deferred to position loop where we have actual trend data
      // Storing closes array for later momentum calculation with real ADX values
      return { 
        symbol, 
        price, 
        atr: currentAtr, 
        atrPercent,
        atrRatio, // For volatility spike
        recentPriceChange, // For flash crash (now uses FLASH_CRASH_MAX_CANDLES)
        singleCandleChange, // For logging
        priceChange24h,
        volumeRatio, // For volume spike
        hasDivergence, // For momentum divergence
        macdTrending,
        priceTrending,
        priceChangePercent, // For debugging divergence magnitude
        macdChangePercent, // For debugging divergence magnitude
        flashCrashCandles: candlesToCheck, // Track how many candles used
        // PHASE 3: Smart momentum data - deferred until trend data available
        swingPoints: swingPointsResult,
        klines, // Include for dynamic trailing calculations
        closes, // Include for deferred momentum calculation
      };
    } catch (error) {
      symbolLogger.error(`Error fetching data: ${error}`);
      return { symbol, price: null, atr: null, atrPercent: null, atrRatio: 1, recentPriceChange: 0, singleCandleChange: 0, volumeRatio: 1, hasDivergence: false, flashCrashCandles: 0, momentumScore: null, swingPoints: null, klines: null };
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
        singleCandleChange: d.singleCandleChange,
        volumeRatio: d.volumeRatio,
        hasDivergence: d.hasDivergence,
        macdTrending: d.macdTrending,
        priceTrending: d.priceTrending,
        priceChangePercent: d.priceChangePercent,
        macdChangePercent: d.macdChangePercent,
        flashCrashCandles: d.flashCrashCandles,
        // PHASE 3: Smart momentum data - momentum calculated dynamically with real ADX
        swingPoints: d.swingPoints,
        klines: d.klines,
        closes: d.closes, // For deferred momentum calculation with real ADX
      }]),
    );
    const updates = [];
    const closedPositions = [];
    const trailingStopUpdates = [];
    const breakEvenUpdates = [];
    const trendExits = [];
    const partialTpTaken = [];
    const emergencyExits = []; // NEW: Track emergency exits
    const meanReversionExits: { symbol: string; side: string; reason: string; maeAtr: number; pnlPercent: number; positionAgeBars: number }[] = []; // Track mean reversion specific exits
    const volatilityAlerts = []; // NEW: Track volatility alerts
    const hedgesOpened: { symbol: string; parentSide: string; hedgeSide: string; hedgeQuantity: number; reversalRisk: number; parentPositionId: string; hedgePositionId: string }[] = []; // Track hedges opened for reversal risk
    const hedgesClosed: { symbol: string; parentSide: string; hedgePositionId: string; riskScore: number }[] = []; // NEW: Track hedges closed when risk drops
    const updatedStopLossMap = new Map<string, number>(); // Track updated stop losses by position ID
    
    // Read cached trend data from trend_snapshots (written by strategy-analyzer every 5 min)
    // This replaces N separate calculate-trend edge function calls with a single DB query
    const trendDataMap = new Map();
    const TREND_STALENESS_MS = 7 * 60 * 1000; // 7 minutes — strategy-analyzer runs every 5 min
    const now = Date.now();
    
    // Single batch query instead of N edge function invocations
    const { data: trendSnapshots, error: trendSnapshotError } = await supabase
      .from("trend_snapshots")
      .select("symbol, snapshot_data, recorded_at")
      .in("symbol", symbols);
    
    if (trendSnapshotError) {
      logger.error(`Failed to fetch trend snapshots: ${trendSnapshotError.message}`);
    } else if (trendSnapshots) {
      let staleCount = 0;
      for (const snapshot of trendSnapshots) {
        const snapshotAge = now - new Date(snapshot.recorded_at).getTime();
        if (snapshotAge > TREND_STALENESS_MS) {
          staleCount++;
          logger.forSymbol(snapshot.symbol).warn(`Trend snapshot stale (${Math.round(snapshotAge / 1000)}s old) — skipping`);
          continue;
        }
        const data = snapshot.snapshot_data;
        if (data) {
          trendDataMap.set(snapshot.symbol, data);
          logger.forSymbol(snapshot.symbol).signal(`Trend: ${data.trend || data.primaryTrend} (confidence: ${data.confidence}%) [cached ${Math.round(snapshotAge / 1000)}s ago]`);
        }
      }
      if (staleCount > 0) {
        logger.warn(`⚠️ ${staleCount}/${symbols.length} trend snapshots were stale (>7min) — strategy-analyzer may not be running`);
      }
    }
    logger.info(`📊 Loaded ${trendDataMap.size}/${symbols.length} trend snapshots from cache`);
    
    // ============= BUILD MFS PER SYMBOL =============
    // Single extraction point for all market features — replaces individual extractor calls
    const mfsMap = new Map<string, MarketFeatureSnapshot>();
    for (const [sym, td] of trendDataMap.entries()) {
      try {
        const mfs = buildMarketFeatureSnapshot(sym, td);
        mfsMap.set(sym, mfs);
      } catch (mfsBuildErr) {
        logger.forSymbol(sym).warn(`Failed to build MFS from cached trend data: ${mfsBuildErr}`);
      }
    }
    logger.info(`📊 Built MFS for ${mfsMap.size}/${trendDataMap.size} symbols`);
    for (const position of positions) {
      const currentPrice = priceMap.get(position.symbol);
      if (currentPrice === undefined || currentPrice === null) continue;
      const atrData = atrMap.get(position.symbol);
      const atrPercent = atrData?.atrPercent || 1.5;
      const positionLogger = logger.forSymbol(position.symbol);

      // Get user settings early for circuit breaker check
      const userSettingsEarly = userSettingsMap.get(position.user_id);
      
      // ===== ENTRY TYPE DETECTION (needed early for trailing overrides) =====
      const isMicroTrendEntry = position.entry_exception_type === 'MICRO_TREND';
      const isMomentumContinuationEntry = position.entry_exception_type === 'MOMENTUM_CONTINUATION';
      
      // ============================================================
      // DYNAMIC THRESHOLDS (aligned with strategy-analyzer)
      // Use ADX and volume to determine exit sensitivity
      // ============================================================
      const mfsForPosition = mfsMap.get(position.symbol);
      const trendData = trendDataMap.get(position.symbol) as any; // Raw trend snapshot for legacy exit logic
      const positionAdx = mfsForPosition?.adx ?? 20;
      const positionVolumeScore = mfsForPosition?.volumeScore ?? 0;
      const positionConfidence = mfsForPosition?.confidence ?? 50;
      
      // ============================================================
      // CONFIDENCE PENALTY (imported from shared scoring module)
      // ============================================================
      const confidencePenalty = getConfidencePenalty(positionConfidence, positionAdx, false);
      
      // ADX-based reversal risk threshold adjustment - Uses centralized ADX_THRESHOLDS
      // Higher ADX = more lenient (allow higher reversal risk before exit)
      let dynamicReversalThreshold = DYNAMIC_REVERSAL_EXIT.BASE_THRESHOLD;
      if (positionAdx >= ADX_THRESHOLDS.EXCEPTIONAL) {
        dynamicReversalThreshold += DYNAMIC_REVERSAL_EXIT.ADX_EXCEPTIONAL_BONUS;
      } else if (positionAdx >= ADX_THRESHOLDS.STRONG) {
        dynamicReversalThreshold += DYNAMIC_REVERSAL_EXIT.ADX_STRONG_BONUS;
      } else if (positionAdx < ADX_THRESHOLDS.MINIMUM) {
        dynamicReversalThreshold += DYNAMIC_REVERSAL_EXIT.ADX_WEAK_PENALTY;
      }
      
      // Volume-aware exit: High volume confirmation = hold longer
      if (positionVolumeScore >= DYNAMIC_REVERSAL_EXIT.VOLUME_CONFIRM_MIN_SCORE) {
        dynamicReversalThreshold += DYNAMIC_REVERSAL_EXIT.VOLUME_CONFIRM_BONUS;
      } else if (positionVolumeScore <= DYNAMIC_REVERSAL_EXIT.VOLUME_WEAK_MAX_SCORE && positionAdx < ADX_THRESHOLDS.STRONG) {
        dynamicReversalThreshold += DYNAMIC_REVERSAL_EXIT.VOLUME_WEAK_PENALTY;
      }
      
      // Apply confidence penalty to reversal threshold
      // High confidence (trend exhaustion) = tighter exit threshold
      if (confidencePenalty < DYNAMIC_REVERSAL_EXIT.CONFIDENCE_PENALTY_THRESHOLD) {
        dynamicReversalThreshold += DYNAMIC_REVERSAL_EXIT.CONFIDENCE_PENALTY_ADJ;
        positionLogger.info(`Confidence penalty ${confidencePenalty} applied - threshold ${dynamicReversalThreshold}`);
      }
      
      // ============================================================
      // STRATEGY-AWARE EXIT ADJUSTMENTS
      // Different strategy types have different exit behaviors
      // ============================================================
      const strategyName = position.strategy_name || '';
      const isCompressionTrade = strategyName === 'Compression Scalp';
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
      
      // ============= COMPRESSION TRADE EXIT LOGIC =============
      // Compression trades have special exit rules: time-based, regime-shift, ATR expansion
      if (isCompressionTrade) {
        const openedAt = position.opened_at || position.executed_at;
        const holdMinutes = openedAt ? (Date.now() - new Date(openedAt).getTime()) / (1000 * 60) : 0;
        const maxHoldMinutes = COMPRESSION_TRADE_EXIT.MAX_HOLD_MINUTES;
        
        let compressionExitReason: string | null = null;
        
        // Time-based exit: close after max hold (no trailing for range trades)
        if (holdMinutes >= maxHoldMinutes) {
          compressionExitReason = `COMPRESSION_TIME_EXIT: Held ${holdMinutes.toFixed(0)}min >= ${maxHoldMinutes}min max`;
        }
        
        // Regime shift exit: ADX rising above threshold
        if (!compressionExitReason && positionAdx > COMPRESSION_TRADE_EXIT.ADX_REGIME_SHIFT_THRESHOLD) {
          compressionExitReason = `COMPRESSION_REGIME_SHIFT: ADX ${positionAdx.toFixed(1)} > ${COMPRESSION_TRADE_EXIT.ADX_REGIME_SHIFT_THRESHOLD} — trend energy returning`;
        }
        
        // ATR expansion exit
        if (!compressionExitReason && atrPercent > COMPRESSION_TRADE_EXIT.ATR_EXPANSION_THRESHOLD) {
          compressionExitReason = `COMPRESSION_ATR_EXPANSION: ATR ${atrPercent.toFixed(2)}% expanding — volatility returning`;
        }
        
        if (compressionExitReason) {
          const side = position.side?.toUpperCase();
          const pnlCalc = calculateFeeAwarePnL(side, position.entry_price, currentPrice, position.quantity, position.trading_fee_percent);
          
          positionLogger.warn(`📦 ${compressionExitReason}`);
          
          const { error: closeError } = await supabase
            .from("positions")
            .update({
              status: "closed",
              current_price: currentPrice,
              exit_price: currentPrice,
              realized_pnl: pnlCalc.netPnl,
              realized_pnl_percent: pnlCalc.netPnlPercent,
              trading_fee_amount: pnlCalc.totalFee,
              close_reason: compressionExitReason,
              closed_at: new Date().toISOString(),
            })
            .eq("id", position.id);
          
          if (!closeError) {
            closedPositions.push({ symbol: position.symbol, reason: compressionExitReason, pnl: pnlCalc.netPnl });
          }
          continue; // Skip normal exit logic for compression trades
        }
        // If no special exit triggered, still apply standard SL/TP below
      }
      // Strategy-specific exit threshold adjustments
      let strategyExitAdjustment = 0;
      let strategyExitNote = "";
      
      if (isMomentum) {
        // MOMENTUM STRATEGIES: 
        // - More aggressive trailing stops (lock profits faster)
        // - Exit earlier on divergence (momentum loss is fatal)
        // - More sensitive to trend changes
        strategyExitAdjustment = STRATEGY_EXIT_ADJUSTMENTS.MOMENTUM.BASE_ADJ;
        strategyExitNote = "Momentum strategy: tighter exit sensitivity";
        
        // Additional exit pressure if momentum divergence detected
        if (atrData?.hasDivergence) {
          strategyExitAdjustment += STRATEGY_EXIT_ADJUSTMENTS.MOMENTUM.DIVERGENCE_PENALTY;
          strategyExitNote += " + divergence penalty";
        }
      } else if (isMeanReversion) {
        // MEAN REVERSION STRATEGIES:
        // - More patient exits (expect price to oscillate)
        // - Less sensitive to reversal risk (that's expected!)
        // - Exit on trend continuation, not reversal
        strategyExitAdjustment = STRATEGY_EXIT_ADJUSTMENTS.MEAN_REVERSION.BASE_ADJ;
        strategyExitNote = "Mean reversion: patient exit threshold";
        
        // For mean reversion, we WANT price to reverse - don't exit on reversal signals
        // But DO exit if trend continues against us (our thesis is wrong)
        if (positionAdx >= ADX_THRESHOLDS.STRONG) {
          strategyExitAdjustment += STRATEGY_EXIT_ADJUSTMENTS.MEAN_REVERSION.STRONG_TREND_PENALTY;
          strategyExitNote += " (strong trend warning)";
        }
      } else if (strategyType === 'TREND_FOLLOWING') {
        // TREND FOLLOWING: Very patient, only exit on clear trend breaks
        strategyExitAdjustment = STRATEGY_EXIT_ADJUSTMENTS.TREND_FOLLOWING.BASE_ADJ;
        strategyExitNote = "Trend following: patient threshold";
      } else if (strategyType === 'GRID_RANGE') {
        // GRID/RANGE: Quick exits, optimized for small gains
        strategyExitAdjustment = STRATEGY_EXIT_ADJUSTMENTS.GRID_RANGE.BASE_ADJ;
        strategyExitNote = "Grid strategy: quick exit threshold";
      }
      
      // Apply strategy adjustment to dynamic threshold
      dynamicReversalThreshold += strategyExitAdjustment;
      
      // ============================================================
      // TRUE ALIGNMENT v2.0 EXIT ADJUSTMENTS
      // Use HTF weighted components for smarter exit timing
      // Premium alignment = more patience, Weak alignment = exit sooner
      // ============================================================
      const trueAlignment = extractTrueAlignmentFromMFS(mfsForPosition);
      let alignmentExitAdjustment = 0;
      let alignmentExitNote = "";
      let htfAlignmentMultiplier = 1.0; // Used for trailing stop distance adjustment
      
      if (trueAlignment) {
        const { tf4hWeighted, tf1hWeighted, adxWeighted, volumeWeighted } = trueAlignment.weightedComponents;
        
        // Check if position is aligned with HTF trend
        const primaryTrend = mfsForPosition?.primaryTrend || 'ranging';
        const isPositionAlignedWithHTF = 
          (position.side === 'BUY' && primaryTrend === 'bullish') ||
          (position.side === 'SELL' && primaryTrend === 'bearish');
        
        if (trueAlignment.isPremium && isPositionAlignedWithHTF) {
          // PREMIUM ALIGNMENT: Strong HTF support - be very patient
          alignmentExitAdjustment = HTF_ALIGNMENT_EXIT.PREMIUM_ALIGNED.thresholdAdj;
          htfAlignmentMultiplier = HTF_ALIGNMENT_EXIT.PREMIUM_ALIGNED.trailingMult;
          alignmentExitNote = `Premium HTF alignment (4h=${tf4hWeighted.toFixed(1)}, 1h=${tf1hWeighted.toFixed(1)}, ADX=${adxWeighted.toFixed(1)})`;
        } else if (trueAlignment.isPremium && !isPositionAlignedWithHTF) {
          // PREMIUM but COUNTER-TREND: Strong HTF against us - exit faster!
          alignmentExitAdjustment = HTF_ALIGNMENT_EXIT.PREMIUM_COUNTER.thresholdAdj;
          htfAlignmentMultiplier = HTF_ALIGNMENT_EXIT.PREMIUM_COUNTER.trailingMult;
          alignmentExitNote = `COUNTER-TREND: Premium HTF opposes position (4h=${tf4hWeighted.toFixed(1)}, 1h=${tf1hWeighted.toFixed(1)})`;
        } else if (trueAlignment.isWeak) {
          // WEAK ALIGNMENT: No clear HTF direction - exit sooner on any warning
          alignmentExitAdjustment = HTF_ALIGNMENT_EXIT.WEAK.thresholdAdj;
          htfAlignmentMultiplier = HTF_ALIGNMENT_EXIT.WEAK.trailingMult;
          alignmentExitNote = trueAlignment.neutralCapped 
            ? `Neutral-capped HTF alignment (4h conf=${trueAlignment.tf4hConfidence.toFixed(0)}%)`
            : `Weak HTF alignment (4h conf=${trueAlignment.tf4hConfidence.toFixed(0)}%)`;
        } else if (isPositionAlignedWithHTF && tf4hWeighted >= HTF_ALIGNMENT_EXIT.SOLID_MIN_TF4H_WEIGHTED) {
          // SOLID ALIGNMENT: Good 4H support
          alignmentExitAdjustment = HTF_ALIGNMENT_EXIT.SOLID.thresholdAdj;
          htfAlignmentMultiplier = HTF_ALIGNMENT_EXIT.SOLID.trailingMult;
          alignmentExitNote = `Solid HTF alignment (4h=${tf4hWeighted.toFixed(1)}, 1h=${tf1hWeighted.toFixed(1)})`;
        }
        
        // Volume confirmation bonus/penalty
        if (volumeWeighted >= HTF_ALIGNMENT_EXIT.VOLUME_CONFIRM_MIN_WEIGHTED && isPositionAlignedWithHTF) {
          alignmentExitAdjustment += HTF_ALIGNMENT_EXIT.VOLUME_CONFIRM_BONUS;
          alignmentExitNote += " +vol_confirm";
        } else if (volumeWeighted < HTF_ALIGNMENT_EXIT.VOLUME_WEAK_MAX_WEIGHTED && !isPositionAlignedWithHTF) {
          alignmentExitAdjustment += HTF_ALIGNMENT_EXIT.VOLUME_WEAK_PENALTY;
          alignmentExitNote += " -vol_weak";
        }
        
        // Apply alignment adjustment to dynamic threshold
        dynamicReversalThreshold += alignmentExitAdjustment;
        
        // Log alignment impact
        if (alignmentExitAdjustment !== 0) {
          positionLogger.info(`🎯 HTF ALIGNMENT: ${alignmentExitNote} | Exit adj: ${alignmentExitAdjustment > 0 ? '+' : ''}${alignmentExitAdjustment} | Trailing mult: ${htfAlignmentMultiplier.toFixed(2)}x`);
        }
      }
      
      // Clamp to reasonable bounds
      dynamicReversalThreshold = Math.max(DYNAMIC_REVERSAL_EXIT.CLAMP_MIN, Math.min(DYNAMIC_REVERSAL_EXIT.CLAMP_MAX, dynamicReversalThreshold));
      
      if (strategyExitAdjustment !== 0) {
        positionLogger.info(`Strategy-aware exit: ${strategyType} | Adj: ${strategyExitAdjustment > 0 ? '+' : ''}${strategyExitAdjustment} | ${strategyExitNote}`);
      }
      
      // Log dynamic threshold calculation with alignment context
      const alignmentInfo = trueAlignment ? `Align=${alignmentExitAdjustment > 0 ? '+' : ''}${alignmentExitAdjustment}` : 'Align=N/A';
      positionLogger.debug(`Dynamic exit threshold=${dynamicReversalThreshold} (ADX=${positionAdx.toFixed(1)}, Vol=${positionVolumeScore}, Conf=${positionConfidence}%, Strategy=${strategyType}, ${alignmentInfo})`);


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
      // MFS-NATIVE: All trend reads from mfsForPosition — no raw trendData access

      // ============================================================
      // 🚨 EMERGENCY PROTECTION SYSTEMS
      // ============================================================

      // 1️⃣ FLASH CRASH PROTECTION - Immediate exit on sudden adverse move
      // PHASE 3: Now uses FLASH_CRASH_MAX_CANDLES (2 by default) to ensure move is sudden
      const recentPriceChange = atrData?.recentPriceChange || 0;
      const flashCrashCandles = atrData?.flashCrashCandles || EMERGENCY_EXIT_PARAMS.FLASH_CRASH_MAX_CANDLES;
      
      let isFlashCrash = false;
      if (position.side === "BUY" && recentPriceChange <= -EMERGENCY_EXIT_PARAMS.FLASH_CRASH_THRESHOLD_PERCENT) {
        isFlashCrash = true;
        positionLogger.risk(`FLASH CRASH DETECTED for LONG: ${recentPriceChange.toFixed(2)}% drop within ${flashCrashCandles} candles (1h timeframe)!`);
      } else if (position.side === "SELL" && recentPriceChange >= EMERGENCY_EXIT_PARAMS.FLASH_CRASH_THRESHOLD_PERCENT) {
        isFlashCrash = true;
        positionLogger.risk(`FLASH CRASH DETECTED for SHORT: ${recentPriceChange.toFixed(2)}% surge within ${flashCrashCandles} candles (1h timeframe)!`);
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
        positionLogger.signal(`VOLUME SPIKE: ${(volumeRatio * 100).toFixed(0)}% of avg (${volumeRatio.toFixed(1)}x) - potential reversal signal!`);
        volatilityAlerts.push({
          symbol: position.symbol,
          volumeRatio,
          message: `Volume ${(volumeRatio * 100).toFixed(0)}% of avg (${volumeRatio.toFixed(1)}x)`,
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
      else if (divergenceExit && isMomentum && earlyPnlPercent < STRATEGY_EXIT_ADJUSTMENTS.MOMENTUM.DIVERGENCE_EXIT_PNL_THRESHOLD) {
        // Grace period: use user's minHoldTimeMinutes instead of hardcoded 10 minutes
        // This ensures consistency with other position management logic
        const positionAgeMinutes = position.opened_at 
          ? (Date.now() - new Date(position.opened_at).getTime()) / (1000 * 60) 
          : 999;
        const gracePeriodMinutes = userSettingsEarly?.minHoldTimeMinutes ?? 10;
        
        if (positionAgeMinutes >= gracePeriodMinutes) {
          emergencyClose = true;
          emergencyReason = "momentum_divergence_exit";
          positionLogger.risk(`STRATEGY-AWARE: Momentum divergence + significant loss (${earlyPnlPercent.toFixed(2)}% < -0.3%) after ${positionAgeMinutes.toFixed(0)}min - exiting | Price: ${priceTrending} ${priceChangePercent.toFixed(2)}% | MACD: ${macdTrending} ${macdChangePercent.toFixed(2)}%`);
        } else {
          positionLogger.info(`STRATEGY-AWARE: Momentum divergence detected but position age ${positionAgeMinutes.toFixed(0)}min < ${gracePeriodMinutes}min grace period - skipping | Price: ${priceTrending} ${priceChangePercent.toFixed(2)}% | MACD: ${macdTrending} ${macdChangePercent.toFixed(2)}%`);
        }
      }
      // Log when momentum divergence is detected but P&L is above threshold (letting other guards handle it)
      else if (divergenceExit && isMomentum && earlyPnlPercent >= STRATEGY_EXIT_ADJUSTMENTS.MOMENTUM.DIVERGENCE_EXIT_PNL_THRESHOLD && earlyPnlPercent < 0) {
        positionLogger.info(`STRATEGY-AWARE: Momentum divergence detected but P&L ${earlyPnlPercent.toFixed(2)}% >= -0.3% threshold - letting trailing/break-even guards handle`);
      }
      // SCENARIO 5 FIX: Conditional volatility exit - extreme volatility alone = conditional exit
      // If P&L > 0 AND trendConfidence >= 55: reduce 50% instead of full exit
      // If P&L < 0 OR confidence < 55: full exit
      // FIX: Add 5-minute grace period before extreme_volatility can trigger
      // ADAPTIVE VOLATILITY: Use higher threshold for strong trends (ADX >= 30)
      else {
        // ============================================================
        // ADAPTIVE VOLATILITY THRESHOLD based on ADX trend strength
        // Strong trends can sustain higher volatility without indicating reversal
        // This prevents premature exits like the ETHUSDT $2,859 entry that was closed too early
        // ============================================================
        // MFS MIGRATION: Use MFS for ADX and slope
        const positionAdxValue = mfsForPosition?.adx ?? 20;
        const adxSlope = mfsForPosition?.adxSlope ?? 0;
        const isAdxRising = mfsForPosition?.adxRising ?? false;
        
        // Determine adaptive threshold based on ADX and trend confirmation
        let adaptiveVolatilityThreshold: number = EMERGENCY_EXIT_PARAMS.EXTREME_VOLATILITY_THRESHOLD; // Default: 3.0x
        let volatilityMode = "STANDARD";
        
        if (positionAdxValue >= EMERGENCY_EXIT_PARAMS.ADAPTIVE_VOLATILITY_ADX_STRONG && isAdxRising) {
          // STRONG TREND + RISING ADX: Maximum tolerance (4.5x)
          // The trend is accelerating - volatility is expected and healthy
          adaptiveVolatilityThreshold = EMERGENCY_EXIT_PARAMS.EXTREME_VOLATILITY_THRESHOLD_STRONG_TREND as number;
          volatilityMode = "STRONG_TREND_RISING";
        } else if (positionAdxValue >= EMERGENCY_EXIT_PARAMS.ADAPTIVE_VOLATILITY_ADX_STRONG) {
          // STRONG TREND (ADX >= 30): Higher tolerance (4.0x) - between strong and moderate
          adaptiveVolatilityThreshold = ((EMERGENCY_EXIT_PARAMS.EXTREME_VOLATILITY_THRESHOLD_STRONG_TREND as number) + (EMERGENCY_EXIT_PARAMS.EXTREME_VOLATILITY_THRESHOLD_MODERATE_TREND as number)) / 2;
          volatilityMode = "STRONG_TREND";
        } else if (positionAdxValue >= EMERGENCY_EXIT_PARAMS.ADAPTIVE_VOLATILITY_ADX_MODERATE) {
          // MODERATE TREND (ADX >= 25): Slightly higher tolerance (3.75x)
          adaptiveVolatilityThreshold = EMERGENCY_EXIT_PARAMS.EXTREME_VOLATILITY_THRESHOLD_MODERATE_TREND as number;
          volatilityMode = "MODERATE_TREND";
        }
        // else: Standard threshold (3.0x) for weak trends (ADX < 25)
        
        // Now check if ATR exceeds the adaptive threshold
        if (atrRatio >= adaptiveVolatilityThreshold) {
          const positionAgeForVolatility = position.opened_at 
            ? (Date.now() - new Date(position.opened_at).getTime()) / (1000 * 60) 
            : 999;
          const VOLATILITY_GRACE_PERIOD_MINUTES = TRAILING_STOP_INLINE.VOLATILITY_GRACE_PERIOD_MINUTES;
          
          // FIX: Skip extreme volatility exit for positions younger than 5 minutes
          // This prevents killing trades before they have time to develop
          if (positionAgeForVolatility < VOLATILITY_GRACE_PERIOD_MINUTES) {
            positionLogger.info(`VOLATILITY GRACE: Position age ${positionAgeForVolatility.toFixed(1)}min < ${VOLATILITY_GRACE_PERIOD_MINUTES}min grace period - skipping extreme volatility check (ATR ${atrRatio.toFixed(2)}x, threshold ${adaptiveVolatilityThreshold.toFixed(2)}x, mode=${volatilityMode})`);
          } else if (earlyPnlPercent > 0 && positionConfidence >= TRAILING_STOP_INLINE.CONDITIONAL_VOLATILITY_MIN_CONFIDENCE) {
            // SCENARIO 5: Conditional - profitable position in confident trend should reduce, not exit
            positionLogger.info(`CONDITIONAL VOLATILITY: ATR ${atrRatio.toFixed(2)}x >= ${adaptiveVolatilityThreshold.toFixed(2)}x but P&L ${earlyPnlPercent.toFixed(2)}% > 0 and confidence ${positionConfidence}% >= 55 - skipping exit (mode=${volatilityMode}, ADX=${positionAdxValue.toFixed(1)})`);
          } else {
            emergencyClose = true;
            emergencyReason = "extreme_volatility";
            positionLogger.risk(`EXTREME VOLATILITY EXIT: ATR ${atrRatio.toFixed(2)}x >= adaptive threshold ${adaptiveVolatilityThreshold.toFixed(2)}x (mode=${volatilityMode}, ADX=${positionAdxValue.toFixed(1)}) with P&L ${earlyPnlPercent.toFixed(2)}% or confidence ${positionConfidence}% < 55 - full exit triggered (age: ${positionAgeForVolatility.toFixed(0)}min)`);
          }
        } else if (atrRatio >= EMERGENCY_EXIT_PARAMS.EXTREME_VOLATILITY_THRESHOLD && volatilityMode !== "STANDARD") {
          // Log when adaptive threshold saved the position from premature exit
          positionLogger.info(`ADAPTIVE VOLATILITY PROTECTION: ATR ${atrRatio.toFixed(2)}x would trigger exit at base 3.0x but allowed due to ${volatilityMode} mode (adaptive threshold: ${adaptiveVolatilityThreshold.toFixed(2)}x, ADX=${positionAdxValue.toFixed(1)}, slope=${adxSlope.toFixed(3)})`);
        }
      }

      // ============================================================
      // 5️⃣ LIQUIDITY TRAP DETECTION - Stop-tighten, reduce, or exit
      // Reads from MFS (populated by strategy-analyzer via snapshot_data)
      // Score 60-74: tighten stop by ATR/2
      // Score 75-84: tighten stop by ATR×0.75
      // Score ≥85: full exit (LIQUIDITY_TRAP_BLOCK)
      // ============================================================
      const liquidityTrap = mfsForPosition?.liquidityTrap;
      if (liquidityTrap?.detected && liquidityTrap.score >= 60 && !emergencyClose) {
        const trapScore = liquidityTrap.score;
        const trapType = liquidityTrap.trapType || 'unknown';
        const trapSignals = liquidityTrap.signals?.join(', ') || 'none';
        const currentSL = position.stop_loss || 0;
        const currentATR = atrData?.atr || (position.entry_price * 0.015);
        
        // Check if trap direction opposes position (trap is against us)
        const trapAgainstPosition = 
          (position.side === 'BUY' && (liquidityTrap.trapDirection === 'short' || liquidityTrap.trapDirection === 'neutral')) ||
          (position.side === 'SELL' && (liquidityTrap.trapDirection === 'long' || liquidityTrap.trapDirection === 'neutral'));
        
        if (trapAgainstPosition) {
          if (trapScore >= 85) {
            // SEVERE TRAP: Full exit
            emergencyClose = true;
            emergencyReason = "liquidity_trap_block";
            positionLogger.warn(`🪤 LIQUIDITY_TRAP_BLOCK: score=${trapScore} ≥85, type=${trapType}, signals=[${trapSignals}] — FULL EXIT triggered`);
          } else if (trapScore >= 75) {
            // AGGRESSIVE: Partial close 40% + tighten stop by ATR×0.75
            // Guards: min position size, one partial per position (cooldown via partial_loss_level)
            const currentPartialLevel = position.partial_loss_level || 0;
            const minPartialSize = 5; // Minimum $5 notional to avoid spam closes
            const positionNotional = position.quantity * currentPrice;
            
            // Partial close (only if not already partially closed and position large enough)
            if (currentPartialLevel === 0 && positionNotional > minPartialSize) {
              const closePercent = 0.40; // 40% partial close
              const closeQuantity = position.quantity * closePercent;
              const remainingQuantity = position.quantity - closeQuantity;
              
              const partialPnL = position.side === "BUY"
                ? (currentPrice - position.entry_price) * closeQuantity
                : (position.entry_price - currentPrice) * closeQuantity;
              const partialPnlPercent = position.side === "BUY"
                ? ((currentPrice - position.entry_price) / position.entry_price) * 100
                : ((position.entry_price - currentPrice) / position.entry_price) * 100;
              
              // Reduce position quantity + mark partial taken (cooldown = 1 per position)
              const { data: updatedTrapPartialPos, error: trapPartialError } = await supabase
                .from("positions")
                .update({
                  quantity: remainingQuantity,
                  partial_loss_level: Math.max(currentPartialLevel, 1), // Mark partial taken
                })
                .eq("id", position.id)
                .eq("status", "active")
                .select()
                .maybeSingle();
              
              if (trapPartialError) {
                positionLogger.error(`Error executing trap partial close for ${position.id}: ${trapPartialError}`);
              } else if (updatedTrapPartialPos) {
                // Fee-aware P&L for the closed portion
                const trapPartialFeeAwarePnL = calculateFeeAwarePnL(
                  position.side,
                  position.entry_price,
                  currentPrice,
                  closeQuantity,
                  position.trading_fee_percent
                );
                
                // Create closed position record for history
                const { error: trapPartialRecordError } = await supabase
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
                    close_reason: "liquidity_trap_partial",
                    realized_pnl: trapPartialFeeAwarePnL.netPnl,
                    realized_pnl_percent: trapPartialFeeAwarePnL.netPnlPercent,
                    trading_fee_amount: trapPartialFeeAwarePnL.totalFee,
                    trading_fee_percent: trapPartialFeeAwarePnL.feeRatePercent,
                    opened_at: position.opened_at,
                    closed_at: new Date().toISOString(),
                    strategy_name: position.strategy_name,
                    trend: position.trend,
                    confidence_score: position.confidence_score,
                    trend_consistency: position.trend_consistency,
                    entry_snapshot: position.entry_snapshot,
                    entry_atr: position.entry_atr,
                    entry_atr_percent: position.entry_atr_percent,
                    peak_pnl_percent: position.peak_pnl_percent,
                    entry_exception_type: position.entry_exception_type,
                    reversal_decision: position.reversal_decision,
                    reversal_score: position.reversal_score,
                    signal_id: position.signal_id,
                  });
                
                if (trapPartialRecordError) {
                  positionLogger.error(`Error creating trap partial close record: ${trapPartialRecordError}`);
                }
                
                position.quantity = remainingQuantity;
                positionLogger.warn(`🪤 LIQUIDITY_TRAP_PARTIAL: score=${trapScore}, type=${trapType}, closed=40%, remaining=60%, qty=${closeQuantity.toFixed(4)} → ${remainingQuantity.toFixed(4)}, P&L=$${partialPnL.toFixed(2)} (${partialPnlPercent.toFixed(2)}%), signals=[${trapSignals}]`);
              }
            } else {
              positionLogger.info(`🪤 LIQUIDITY_TRAP_PARTIAL_SKIP: score=${trapScore} — already partial_level=${currentPartialLevel} or notional=$${positionNotional.toFixed(2)} < $${minPartialSize}`);
            }
            
            // ALSO tighten stop (runs regardless of partial close)
            const tightenAmount = currentATR * 0.75;
            let tightenedStop = currentSL;
            if (position.side === 'BUY') {
              tightenedStop = Math.max(currentSL, currentPrice - tightenAmount);
            } else {
              tightenedStop = currentSL > 0 ? Math.min(currentSL, currentPrice + tightenAmount) : currentPrice + tightenAmount;
            }
            
            if (tightenedStop !== currentSL) {
              const { error: trapSlError } = await supabase
                .from("positions")
                .update({ stop_loss: tightenedStop })
                .eq("id", position.id)
                .eq("status", "active");
              
              if (!trapSlError) {
                position.stop_loss = tightenedStop;
                updatedStopLossMap.set(position.id, tightenedStop);
                positionLogger.warn(`🪤 LIQUIDITY_TRAP_AGGRESSIVE_STOP: score=${trapScore}, type=${trapType} — stop tightened $${currentSL.toFixed(2)} → $${tightenedStop.toFixed(2)} (ATR×0.75=$${tightenAmount.toFixed(2)})`);
              }
            }
          } else {
            // MODERATE (60-74): Tighten stop by ATR/2
            const tightenAmount = currentATR * 0.5;
            let tightenedStop = currentSL;
            if (position.side === 'BUY') {
              tightenedStop = Math.max(currentSL, currentPrice - tightenAmount);
            } else {
              tightenedStop = currentSL > 0 ? Math.min(currentSL, currentPrice + tightenAmount) : currentPrice + tightenAmount;
            }
            
            if (tightenedStop !== currentSL) {
              const { error: trapSlError } = await supabase
                .from("positions")
                .update({ stop_loss: tightenedStop })
                .eq("id", position.id)
                .eq("status", "active");
              
              if (!trapSlError) {
                position.stop_loss = tightenedStop;
                updatedStopLossMap.set(position.id, tightenedStop);
                positionLogger.info(`🪤 LIQUIDITY_TRAP_MODERATE: score=${trapScore}, type=${trapType} — stop tightened $${currentSL.toFixed(2)} → $${tightenedStop.toFixed(2)} (ATR×0.5=$${tightenAmount.toFixed(2)}), signals=[${trapSignals}]`);
              }
            }
          }
        } else {
          positionLogger.info(`🪤 LIQUIDITY_TRAP_IGNORED: score=${trapScore}, type=${trapType} but trapDirection=${liquidityTrap.trapDirection} favors ${position.side} — no action`);
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
            volumeRatio: (volumeRatio * 100).toFixed(1) + "% of avg",
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
        breakEvenActivationPercent: 0.55,
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
      const positionOpenedAtRaw = position.opened_at || position.executed_at;
      if (!positionOpenedAtRaw) {
        positionLogger.warn(`⚠️ NULL_SAFETY: Position ${position.id} missing both opened_at and executed_at — defaulting age to 0 (will skip hold-time-gated exits)`);
      }
      const positionOpenedAt = new Date(positionOpenedAtRaw || Date.now());
      const positionAgeMinutes = (Date.now() - positionOpenedAt.getTime()) / (1000 * 60);
      const hasMetMinHoldTime = positionAgeMinutes >= userSettings.minHoldTimeMinutes;
      
      // Fee null-safety: warn if position has no stored fee rate (will use default)
      if (position.trading_fee_percent == null) {
        positionLogger.warn(`⚠️ NULL_SAFETY: Position ${position.id} missing trading_fee_percent — using default ${TRADING_FEE_PARAMS.DEFAULT_FEE_RATE_PERCENT}%`);
      }
      
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
      
      // ============= MEAN REVERSION EXIT: Delegated to shared exit-strategies module =============
      let meanReversionExitTriggered = false;
      let meanReversionExitReason = "";
      
      if (isMeanReversion && MEAN_REVERSION_CONFIG.ENABLED) {
        const mrMarket: ExitMarketContext = {
          currentPrice, pnlPercent, atrPercent,
          atr: atrData?.atr || currentPrice * 0.02,
          adx: mfsForPosition?.adx ?? 20,
          adxSlope: mfsForPosition?.adxSlope ?? 0,
          primaryTrend: mfsForPosition?.primaryTrend || "ranging",
          momentumScore: mfsForPosition?.smartMomentum?.score ?? 0,
        };
        const mrResult = evaluateMeanReversionExit(
          { ...position, side: position.side as "BUY" | "SELL", peak_pnl_percent: newPeakPnl } as ExitPositionContext,
          mrMarket,
          positionAgeMinutes,
        );
        
        // Update MAE in database if it increased
        const existingMae = position.max_adverse_excursion_atr || 0;
        if (mrResult.newMaeAtr > existingMae) {
          const { error: maeError } = await supabase
            .from("positions")
            .update({ max_adverse_excursion_atr: mrResult.newMaeAtr })
            .eq("id", position.id)
            .eq("status", "active");
          if (!maeError) {
            positionLogger.debug(`MEAN REVERSION MAE: Updated to ${mrResult.newMaeAtr.toFixed(2)} ATR`);
          }
        }
        
        // Apply suggested stop loss if provided (ATR target / quick profit trailing)
        if (!mrResult.shouldExit && mrResult.suggestedStopLoss !== null) {
          if ((position.side === "BUY" && mrResult.suggestedStopLoss > (newStopLoss || 0)) ||
              (position.side === "SELL" && mrResult.suggestedStopLoss < (newStopLoss || Infinity))) {
            newStopLoss = mrResult.suggestedStopLoss;
            positionLogger.trade(`MEAN REVERSION STOP TIGHTENED: → ${mrResult.suggestedStopLoss.toFixed(2)}`);
          }
        }
        
        if (mrResult.shouldExit) {
          meanReversionExitTriggered = true;
          meanReversionExitReason = mrResult.exitReason;
          positionLogger.risk(`MEAN REVERSION EXIT: ${mrResult.exitReason}`);
          
          emergencyClose = true;
          emergencyReason = meanReversionExitReason;
          
          meanReversionExits.push({
            symbol: position.symbol,
            side: position.side,
            reason: meanReversionExitReason,
            maeAtr: mrResult.newMaeAtr,
            pnlPercent,
            positionAgeBars: positionAgeMinutes / 60,
          });
        }
      }
      
      // ============= DECAY VELOCITY: Delegated to shared exit-strategies module =============
      // MOMENTUM_CONTINUATION OVERRIDE: Lower activation threshold so decay engages earlier
      // This makes decay the primary exit for continuation entries (captures 72-78% vs trailing's 37-46%)
      {
        const decayActivationOverride = isMomentumContinuationEntry 
          ? MOMENTUM_CONTINUATION_EXIT.DECAY_ACTIVATION_PERCENT 
          : userSettings.activationPercent;
        
        const decayMarket: ExitMarketContext = {
          currentPrice, pnlPercent, atrPercent,
          atr: atrData?.atr || currentPrice * 0.02,
          adx: mfsForPosition?.adx ?? 20,
          adxSlope: mfsForPosition?.adxSlope ?? 0,
          primaryTrend: mfsForPosition?.primaryTrend || "ranging",
          momentumScore: mfsForPosition?.smartMomentum?.score ?? 0,
        };
        const decayResult = evaluateDecayVelocity(
          { ...position, side: position.side as "BUY" | "SELL", peak_pnl_percent: newPeakPnl } as ExitPositionContext,
          decayMarket,
          { activationPercent: decayActivationOverride, trailingAggressiveness: userSettings.trailingAggressiveness, progressiveLockEnabled: userSettings.progressiveLockEnabled, stalePeakProtectionEnabled: userSettings.stalePeakProtectionEnabled, decayVelocityExitEnabled: userSettings.decayVelocityExitEnabled },
        );
        
        if (decayResult.shouldExit) {
          positionLogger.risk(`SMART AITS [${decayResult.decayTier.toUpperCase()}]: ${decayResult.exitReason} - velocity ${(decayResult.decayVelocity * 100).toFixed(2)}%/min, mins=${decayResult.minutesSincePeak.toFixed(0)}`);
          
          emergencyExits.push({
            symbol: position.symbol,
            side: position.side,
            reason: decayResult.exitReason,
            peakPnl: newPeakPnl,
            currentPnl: pnlPercent,
            decayVelocity: decayResult.decayVelocity * 100,
            minutesSincePeak: decayResult.minutesSincePeak,
            decayTier: decayResult.decayTier,
          });
          
          const feeAwarePnL = calculateFeeAwarePnL(position.side, position.entry_price, currentPrice, position.quantity, position.trading_fee_percent);
          
          const { error: closeError } = await supabase
            .from("positions")
            .update({
              status: "closed",
              closed_at: new Date().toISOString(),
              exit_price: currentPrice,
              realized_pnl: feeAwarePnL.netPnl,
              realized_pnl_percent: feeAwarePnL.netPnlPercent,
              close_reason: decayResult.exitReason,
              trading_fee_amount: feeAwarePnL.totalFee,
              trading_fee_percent: feeAwarePnL.feeRatePercent,
            })
            .eq("id", position.id)
            .eq("status", "active");
          
          if (closeError) {
            positionLogger.error(`Error closing position ${position.id}: ${closeError}`);
          } else {
            closedPositions.push({ id: position.id, symbol: position.symbol, side: position.side, reason: decayResult.exitReason, pnlPercent });
          }
          continue;
        } else if (decayResult.tierExceptionActive) {
          positionLogger.info(`SMART AITS [${decayResult.decayTier.toUpperCase()}]: Decay ${(decayResult.decayVelocity * 100).toFixed(2)}%/min tolerated by tier exception`);
        }
      }
      
      // ============= MICRO EXHAUSTION EXIT INTEGRATION =============
      // Uses MFS microExhaustion signals to tighten stops or trigger exits
      // Recommendation levels: tighten_stop → exit_partial → exit_full
      {
        const microExh = mfsForPosition?.smartMomentum?.microExhaustion;
        if (microExh?.detected && hasMetMinHoldTime && !emergencyClose) {
          const recommendation = microExh.recommendation;
          const exhaustionScore = microExh.score;
          
          positionLogger.info(`🔥 MICRO_EXHAUSTION_EXIT: recommendation=${recommendation}, score=${exhaustionScore}, signals=[${microExh.signals?.join(', ')}], P&L=${pnlPercent.toFixed(2)}%`);
          
          if (recommendation === "exit_full" && pnlPercent > 0.3) {
            // Full exit: all 3 signals firing → trend is done, lock profits
            const feeAwarePnL = calculateFeeAwarePnL(position.side, position.entry_price, currentPrice, position.quantity, position.trading_fee_percent);
            
            positionLogger.risk(`🔥 MICRO_EXHAUSTION_FULL_EXIT: Score=${exhaustionScore}, P&L=${pnlPercent.toFixed(2)}% → closing position`);
            
            const { error: closeError } = await supabase
              .from("positions")
              .update({
                status: "closed",
                closed_at: new Date().toISOString(),
                exit_price: currentPrice,
                realized_pnl: feeAwarePnL.netPnl,
                realized_pnl_percent: feeAwarePnL.netPnlPercent,
                close_reason: "micro_exhaustion_full_exit",
                trading_fee_amount: feeAwarePnL.totalFee,
                trading_fee_percent: feeAwarePnL.feeRatePercent,
              })
              .eq("id", position.id)
              .eq("status", "active");
            
            if (closeError) {
              positionLogger.error(`Error closing position ${position.id} on micro exhaustion: ${closeError}`);
            } else {
              closedPositions.push({ id: position.id, symbol: position.symbol, side: position.side, reason: "micro_exhaustion_full_exit", pnlPercent: feeAwarePnL.netPnlPercent });
              
              // Send notification for full exhaustion exit
              if (riskParams?.email_notifications_enabled) {
                supabase.functions.invoke("send-notification", {
                  body: {
                    type: "micro_exhaustion_exit",
                    symbol: position.symbol,
                    side: position.side,
                    price: currentPrice,
                    pnlPercent: feeAwarePnL.netPnlPercent,
                    exhaustionScore: exhaustionScore,
                    exhaustionSignals: microExh.signals || [],
                    exhaustionAction: "exit_full",
                    tradeId: position.id,
                  }
                }).catch(e => positionLogger.error(`Notification error: ${e}`));
              }
            }
            continue; // Skip further processing
          }
          
          if (recommendation === "exit_partial" && pnlPercent > 0.2 && position.stop_loss !== null) {
            // Partial exit: 2/3 signals → aggressively tighten stop to lock 80% of current profit
            const lockPercent = 0.80; // Lock 80% of current P&L
            const lockMove = position.entry_price * (pnlPercent * lockPercent / 100);
            const exhaustionStop = position.side === "BUY"
              ? position.entry_price + lockMove
              : position.entry_price - lockMove;
            
            const isTighter = position.side === "BUY"
              ? exhaustionStop > (newStopLoss || position.stop_loss)
              : exhaustionStop < (newStopLoss || position.stop_loss);
            
            if (isTighter) {
              newStopLoss = exhaustionStop;
              positionLogger.trade(`⚡ MICRO_EXHAUSTION_TIGHTEN (exit_partial): Score=${exhaustionScore}, locking 80% of ${pnlPercent.toFixed(2)}% → stop=${exhaustionStop.toFixed(2)}`);
              
              const { error: stopError } = await supabase
                .from("positions")
                .update({ stop_loss: newStopLoss })
                .eq("id", position.id)
                .eq("status", "active");
              if (stopError) {
                positionLogger.error(`Error applying micro exhaustion stop for ${position.id}: ${stopError}`);
              } else {
                updatedStopLossMap.set(position.id, newStopLoss!);
                
                // Send notification for partial exhaustion tightening
                if (riskParams?.email_notifications_enabled) {
                  supabase.functions.invoke("send-notification", {
                    body: {
                      type: "micro_exhaustion_exit",
                      symbol: position.symbol,
                      side: position.side,
                      price: currentPrice,
                      pnlPercent,
                      newStopLoss: exhaustionStop,
                      exhaustionScore: exhaustionScore,
                      exhaustionSignals: microExh.signals || [],
                      exhaustionAction: "exit_partial",
                      tradeId: position.id,
                    }
                  }).catch(e => positionLogger.error(`Notification error: ${e}`));
                }
              }
            }
          }
          
          if (recommendation === "tighten_stop" && pnlPercent > 0 && position.stop_loss !== null) {
            // Warning level: 1/3 signals → tighten stop to lock 60% of current profit
            const lockPercent = 0.60;
            const lockMove = position.entry_price * (pnlPercent * lockPercent / 100);
            const warningStop = position.side === "BUY"
              ? position.entry_price + lockMove
              : position.entry_price - lockMove;
            
            const isTighter = position.side === "BUY"
              ? warningStop > (newStopLoss || position.stop_loss)
              : warningStop < (newStopLoss || position.stop_loss);
            
            if (isTighter) {
              newStopLoss = warningStop;
              positionLogger.trade(`⚠️ MICRO_EXHAUSTION_WARNING (tighten_stop): Score=${exhaustionScore}, locking 60% of ${pnlPercent.toFixed(2)}% → stop=${warningStop.toFixed(2)}`);
              
              const { error: stopError } = await supabase
                .from("positions")
                .update({ stop_loss: newStopLoss })
                .eq("id", position.id)
                .eq("status", "active");
              if (stopError) {
                positionLogger.error(`Error applying micro exhaustion warning stop for ${position.id}: ${stopError}`);
              } else {
                updatedStopLossMap.set(position.id, newStopLoss!);
              }
            }
          }
        }
      }
      
      // ============= FIX #3: EARLY INVALIDATION RULE =============
      // Dead-on-arrival detection: If after 20 min the trade has barely moved (MFE < 0.10%)
      // and is losing significantly (< -0.40%), cut it early instead of bleeding to time stop
      // This addresses Trade #4 pattern: held 91 min, peak 0%, closed -1.21%
      const isStandardEntry = !position.entry_exception_type; // No exception = STANDARD
      const isLowConfidenceStandard = isStandardEntry && (position.confidence_score ?? 100) < LOW_CONFIDENCE_STANDARD_EXIT.MAX_CONFIDENCE;
      
      if (LOW_CONFIDENCE_STANDARD_EXIT.EARLY_INVALIDATION_ENABLED && 
          isLowConfidenceStandard && 
          !emergencyClose && 
          positionAgeMinutes >= LOW_CONFIDENCE_STANDARD_EXIT.EARLY_INVALIDATION_MIN_AGE_MINUTES) {
        
        const mfe = newPeakPnl; // Maximum Favorable Excursion = peak P&L
        const isDeadTrade = mfe < LOW_CONFIDENCE_STANDARD_EXIT.EARLY_INVALIDATION_MAX_MFE_PERCENT && 
                            pnlPercent < LOW_CONFIDENCE_STANDARD_EXIT.EARLY_INVALIDATION_MAX_PNL_PERCENT;
        
        if (isDeadTrade) {
          const feeAwarePnL = calculateFeeAwarePnL(position.side, position.entry_price, currentPrice, position.quantity, position.trading_fee_percent);
          
          positionLogger.risk(`🔪 EARLY INVALIDATION: Dead trade detected — Age ${positionAgeMinutes.toFixed(0)}min, MFE ${mfe.toFixed(3)}% < ${LOW_CONFIDENCE_STANDARD_EXIT.EARLY_INVALIDATION_MAX_MFE_PERCENT}%, P&L ${pnlPercent.toFixed(2)}% < ${LOW_CONFIDENCE_STANDARD_EXIT.EARLY_INVALIDATION_MAX_PNL_PERCENT}%, Confidence ${position.confidence_score ?? 'N/A'}`);
          
          const { error: closeError } = await supabase
            .from("positions")
            .update({
              status: "closed",
              closed_at: new Date().toISOString(),
              exit_price: currentPrice,
              realized_pnl: feeAwarePnL.netPnl,
              realized_pnl_percent: feeAwarePnL.netPnlPercent,
              close_reason: LOW_CONFIDENCE_STANDARD_EXIT.EARLY_INVALIDATION_REASON,
              trading_fee_amount: feeAwarePnL.totalFee,
              trading_fee_percent: feeAwarePnL.feeRatePercent,
            })
            .eq("id", position.id)
            .eq("status", "active");
          
          if (closeError) {
            positionLogger.error(`Error closing dead trade ${position.id}: ${closeError}`);
          } else {
            closedPositions.push({ id: position.id, symbol: position.symbol, side: position.side, reason: LOW_CONFIDENCE_STANDARD_EXIT.EARLY_INVALIDATION_REASON, pnlPercent: feeAwarePnL.netPnlPercent });
          }
          continue; // Skip further processing
        } else if (isLowConfidenceStandard && LOW_CONFIDENCE_STANDARD_EXIT.LOG_ENHANCED_EXITS) {
          positionLogger.debug(`EARLY INVALIDATION CHECK: Age ${positionAgeMinutes.toFixed(0)}min, MFE ${mfe.toFixed(3)}%, P&L ${pnlPercent.toFixed(2)}% — not triggered`);
        }
      }
      
      // ============= SMART AITS: PROGRESSIVE LOCK TIERS =============
      // Calculate dynamic profit lock based on peak P&L level
      // SMART AITS helpers delegated to shared exit-strategies module
      const getProgressiveLockPercent = sharedGetProgressiveLockPercent;
      const getStalePeakBonus = (mins: number) => sharedGetStalePeakBonus(mins, userSettings.stalePeakProtectionEnabled);
      
      // ============= MICRO-PROFIT LOCK: Delegated to shared exit-strategies module =============
      // FIX #1: Low-confidence STANDARD entries use enhanced (tighter) micro-profit tiers
      let microProfitLockApplied = false;
      let microLockFloorStop: number | null = null; // CRITICAL: Floor that trailing CANNOT regress below
      
      {
        // For low-confidence STANDARD entries, apply enhanced micro-profit lock inline
        // before falling through to the standard evaluateMicroProfitLock
        if (isLowConfidenceStandard && newPeakPnl > 0 && newPeakPnl < MICRO_PROFIT_LOCK_PARAMS.HANDOFF_THRESHOLD && position.stop_loss !== null) {
          const enhancedTiers = LOW_CONFIDENCE_STANDARD_EXIT.ENHANCED_MICRO_PROFIT_TIERS;
          const sortedTiers = [...enhancedTiers].sort((a, b) => b.peakThreshold - a.peakThreshold);
          let matchedTier: { peakThreshold: number; lockTarget: number } | null = null;
          for (const tier of sortedTiers) {
            if (newPeakPnl >= tier.peakThreshold) { matchedTier = tier; break; }
          }
          if (matchedTier) {
            const slippageBuffer = position.entry_price * (MICRO_PROFIT_LOCK_PARAMS.SLIPPAGE_BUFFER_PERCENT / 100);
            const lockProfit = position.entry_price * (matchedTier.lockTarget / 100);
            let lockStop: number;
            if (position.side === "BUY") {
              lockStop = position.entry_price + lockProfit - slippageBuffer;
            } else {
              lockStop = position.entry_price - lockProfit + slippageBuffer;
            }
            const shouldApply = position.side === "BUY" 
              ? lockStop > position.stop_loss 
              : lockStop < position.stop_loss;
            if (shouldApply) {
              microProfitLockApplied = true;
              newStopLoss = lockStop;
              microLockFloorStop = lockStop; // Set floor
              positionLogger.trade(`⚡ ENHANCED_MICRO_LOCK (conf<${LOW_CONFIDENCE_STANDARD_EXIT.MAX_CONFIDENCE}) for ${position.side}: Peak ${newPeakPnl.toFixed(3)}% → ${matchedTier.peakThreshold}%→+${matchedTier.lockTarget.toFixed(2)}% → Stop ${lockStop.toFixed(2)}`);
              const { error: microLockError } = await supabase
                .from("positions")
                .update({ stop_loss: newStopLoss })
                .eq("id", position.id)
                .eq("status", "active");
              if (microLockError) {
                positionLogger.error(`Error applying enhanced micro profit lock for ${position.id}: ${microLockError}`);
              } else {
                updatedStopLossMap.set(position.id, newStopLoss!);
              }
            }
          }
        }
        
        // Standard micro-profit lock (for non-low-confidence or if enhanced didn't apply)
        if (!microProfitLockApplied) {
          const microResult = evaluateMicroProfitLock(
            { ...position, side: position.side as "BUY" | "SELL", peak_pnl_percent: newPeakPnl } as ExitPositionContext,
            newPeakPnl,
          );
          if (microResult.applied && microResult.newStopLoss !== null) {
            microProfitLockApplied = true;
            newStopLoss = microResult.newStopLoss;
            microLockFloorStop = microResult.newStopLoss; // Set floor
            positionLogger.trade(`MICRO_PROFIT_LOCK_APPLIED for ${position.side}: Peak ${newPeakPnl.toFixed(3)}% → ${microResult.tierLabel} → Stop ${microResult.newStopLoss.toFixed(2)} (was ${position.stop_loss?.toFixed(2)})`);
            const { error: microLockError } = await supabase
              .from("positions")
              .update({ stop_loss: newStopLoss })
              .eq("id", position.id)
              .eq("status", "active");
            if (microLockError) {
              positionLogger.error(`Error applying micro profit lock for ${position.id}: ${microLockError}`);
            } else {
              updatedStopLossMap.set(position.id, newStopLoss!);
            }
          }
        }
      }
      
      // ============= PROGRESSIVE PROFIT LOCK: Delegated to shared exit-strategies module =============
      let progressiveLockFloorStop: number | null = null;
      {
        if (!microProfitLockApplied) {
          const progResult = evaluateProgressiveProfitLock(
            { ...position, side: position.side as "BUY" | "SELL", peak_pnl_percent: newPeakPnl } as ExitPositionContext,
            newPeakPnl,
          );
          if (progResult.applied && progResult.newStopLoss !== null) {
            newStopLoss = progResult.newStopLoss;
            progressiveLockFloorStop = progResult.newStopLoss; // Set floor
            positionLogger.trade(`PROGRESSIVE_LOCK_APPLIED for ${position.side}: Peak ${newPeakPnl.toFixed(3)}% → ${progResult.tierLabel} → Stop ${progResult.newStopLoss.toFixed(2)}`);
            
            const { error: progLockError } = await supabase
              .from("positions")
              .update({ stop_loss: newStopLoss })
              .eq("id", position.id)
              .eq("status", "active");
            
            if (progLockError) {
              positionLogger.error(`Error applying progressive profit lock for ${position.id}: ${progLockError}`);
            } else {
              updatedStopLossMap.set(position.id, newStopLoss!);
            }
          }
        }
      }
      
      // PROFIT LOCK FLOOR: ALWAYS computed from peak_pnl_percent, not just when lock "applies"
      // BUG FIX: Previously, profitLockFloor was only set when the lock CHANGED the stop.
      // On subsequent cycles (stop already at lock level), applied=false → floor=null → trailing regressed freely.
      // Now: We compute the theoretical lock price every cycle based on peak, ensuring trailing can NEVER regress.
      let profitLockFloor: number | null = microLockFloorStop || progressiveLockFloorStop;
      
      // If neither lock applied this cycle (stop already covers), compute floor from peak anyway
      if (profitLockFloor === null && newPeakPnl > 0 && position.stop_loss !== null) {
        // Check micro-profit range
        if (newPeakPnl < MICRO_PROFIT_LOCK_PARAMS.HANDOFF_THRESHOLD && MICRO_PROFIT_LOCK_PARAMS.ENABLED) {
          const sortedMicroTiers = [...MICRO_PROFIT_LOCK_PARAMS.TIERS].sort((a, b) => b.peakThreshold - a.peakThreshold);
          for (const tier of sortedMicroTiers) {
            if (newPeakPnl >= tier.peakThreshold) {
              const lockProfit = position.entry_price * (tier.lockTarget / 100);
              const slipBuf = position.entry_price * (MICRO_PROFIT_LOCK_PARAMS.SLIPPAGE_BUFFER_PERCENT / 100);
              profitLockFloor = position.side === "BUY"
                ? position.entry_price + lockProfit - slipBuf
                : position.entry_price - lockProfit + slipBuf;
              break;
            }
          }
        }
        // Check progressive range
        else if (newPeakPnl >= MICRO_PROFIT_LOCK_PARAMS.HANDOFF_THRESHOLD && newPeakPnl < PROGRESSIVE_PROFIT_LOCK_PARAMS.DEFER_TO_TRAILING_AT && PROGRESSIVE_PROFIT_LOCK_PARAMS.ENABLED) {
          const sortedProgTiers = [...PROGRESSIVE_PROFIT_LOCK_PARAMS.TIERS].sort((a, b) => b.peakThreshold - a.peakThreshold);
          for (const tier of sortedProgTiers) {
            if (newPeakPnl >= tier.peakThreshold) {
              const lockProfit = position.entry_price * (tier.lockTarget / 100);
              const slipBuf = position.entry_price * (SLIPPAGE_PARAMS.BREAK_EVEN_BUFFER_PERCENT / 100);
              profitLockFloor = position.side === "BUY"
                ? position.entry_price + lockProfit - slipBuf
                : position.entry_price - lockProfit + slipBuf;
              break;
            }
          }
        }
        
        if (profitLockFloor !== null) {
          positionLogger.debug(`🔒 COMPUTED_FLOOR (no lock change): peak=${newPeakPnl.toFixed(3)}%, floor=${profitLockFloor.toFixed(4)}`);
        }
      }
      
      
      // ============= PHASE 3: R-MULTIPLE BASED TRAILING ACTIVATION =============
      // Activate trailing at 1.2R instead of fixed percentage
      // R = profit / risk = pnlPercent / (entry - stop) expressed as percent
      const hasValidStopLoss = position.stop_loss !== null && position.stop_loss > 0;
      let currentRMultiple = 0;
      let useRMultipleActivation = false;
      
      if (hasValidStopLoss) {
        const riskPercent = position.side === "BUY" 
          ? ((position.entry_price - position.stop_loss) / position.entry_price) * 100
          : ((position.stop_loss - position.entry_price) / position.entry_price) * 100;
        
        if (riskPercent > 0) {
          currentRMultiple = pnlPercent / riskPercent;
          useRMultipleActivation = true;
        }
      }
      
      // Determine if trailing should activate
      // Priority 1: R-multiple based (if valid stop loss exists)
      // Priority 2: Fall back to percent-based (user setting or default)
      // Priority 3: MICRO_TREND override - much lower activation threshold
      const microTrendActivation = isMicroTrendEntry && pnlPercent > MICRO_TREND_EXIT.TRAILING_ACTIVATION_PERCENT;
      const rMultipleActivated = useRMultipleActivation && currentRMultiple >= R_MULTIPLE_TRAILING_PARAMS.ACTIVATION_R_MULTIPLE;
      const percentActivated = pnlPercent > userSettings.activationPercent;
      let shouldActivateTrailing = microTrendActivation || rMultipleActivated || (R_MULTIPLE_TRAILING_PARAMS.FALLBACK_TO_PERCENT && percentActivated);

      // ============= FEE-AWARE MINIMUM PROFIT FLOOR =============
      // Prevent trailing from activating until profit meaningfully exceeds costs
      // This stops the pattern where trailing chops out at 0.02-0.20% net profit
      if (shouldActivateTrailing && !microTrendActivation) {
        const totalCosts = TRAILING_MIN_PROFIT_FLOOR.ROUND_TRIP_FEE_PERCENT + TRAILING_MIN_PROFIT_FLOOR.SLIPPAGE_ESTIMATE_PERCENT;
        let minProfitFloor = totalCosts * TRAILING_MIN_PROFIT_FLOOR.MIN_PROFIT_OVER_COSTS_MULTIPLIER;

        // ADX-aware strong trend floor: let strong trends develop further
        if (TRAILING_MIN_PROFIT_FLOOR.STRONG_TREND_ENABLED) {
          // MFS MIGRATION: Use MFS for ADX
          const posAdx = mfsForPosition?.adx ?? 20;
          if (posAdx >= TRAILING_MIN_PROFIT_FLOOR.VERY_STRONG_TREND_MIN_ADX) {
            minProfitFloor = Math.max(minProfitFloor, TRAILING_MIN_PROFIT_FLOOR.VERY_STRONG_TREND_MIN_PROFIT_PERCENT);
            positionLogger.debug(`TRAILING FLOOR: Very strong trend (ADX ${posAdx.toFixed(1)}) → min profit ${minProfitFloor.toFixed(2)}%`);
          } else if (posAdx >= TRAILING_MIN_PROFIT_FLOOR.STRONG_TREND_MIN_ADX) {
            minProfitFloor = Math.max(minProfitFloor, TRAILING_MIN_PROFIT_FLOOR.STRONG_TREND_MIN_PROFIT_PERCENT);
            positionLogger.debug(`TRAILING FLOOR: Strong trend (ADX ${posAdx.toFixed(1)}) → min profit ${minProfitFloor.toFixed(2)}%`);
          }
        }

        // Panic override: if profit is dropping fast from peak, allow trailing regardless
        const drawdownFromPeak = newPeakPnl - pnlPercent;
        const panicOverride = newPeakPnl >= minProfitFloor && drawdownFromPeak >= TRAILING_MIN_PROFIT_FLOOR.PANIC_DRAWDOWN_FROM_PEAK_PERCENT;

        if (pnlPercent < minProfitFloor && !panicOverride) {
          shouldActivateTrailing = false;
          positionLogger.debug(`TRAILING DELAYED: P&L ${pnlPercent.toFixed(2)}% < floor ${minProfitFloor.toFixed(2)}% (costs ${totalCosts.toFixed(2)}% × ${TRAILING_MIN_PROFIT_FLOOR.MIN_PROFIT_OVER_COSTS_MULTIPLIER})`);
        } else if (panicOverride) {
          positionLogger.trade(`TRAILING PANIC OVERRIDE: Peak was ${newPeakPnl.toFixed(2)}%, dropped ${drawdownFromPeak.toFixed(2)}% → activating trailing to protect remaining profit`);
        }
      }
      
      // ============= PHASE 3: DYNAMIC R-MULTIPLE TRAILING =============
      // Use ADX-aware activation and momentum-based trailing distance
      // FIXED: Calculate momentum with ACTUAL ADX values from trend data (not hardcoded 20)
      // MFS MIGRATION: Use MFS for ADX and slope (momentum calculation context)
      // MFS-NATIVE: ADX and slope for momentum calculation come from mfsForPosition
      const adxForMomentum = mfsForPosition?.adx ?? 20;
      const momentumAdxSlope = mfsForPosition?.adxSlope ?? 0;
      const adxRisingForMomentum = mfsForPosition?.adxRising ?? false;
      const currentAtrForMomentum = atrData?.atr || 0;
      const closesForMomentum = atrData?.closes || [];
      const klinesForMomentum = atrData?.klines || [];
      
      // Calculate momentum score with real ADX values
      // FIX: Pass adxSlope so STRUCTURAL_LAG_OVERRIDE can fire during position monitoring
      const momentumData = klinesForMomentum.length > 0 && closesForMomentum.length > 0
        ? calculateMomentumScore(klinesForMomentum, closesForMomentum, adxForMomentum, adxRisingForMomentum, currentAtrForMomentum, momentumAdxSlope)
        : null;
      const swingData = atrData?.swingPoints as SwingPointResult | null;
      let phase3TrailingApplied = false;
      let dynamicTrailingResult: DynamicTrailingResult | null = null;
      
      if (DYNAMIC_TRAILING_PARAMS.ENABLED && hasValidStopLoss && momentumData) {
        // Calculate dynamic trailing with ADX and momentum awareness
        dynamicTrailingResult = calculateDynamicTrailing(
          position.entry_price,
          currentPrice,
          position.stop_loss,
          position.side as "BUY" | "SELL",
          positionAdx,
          momentumData,
          currentRMultiple > newPeakPnl / (position.side === "BUY" 
            ? ((position.entry_price - position.stop_loss) / position.entry_price) * 100
            : ((position.stop_loss - position.entry_price) / position.entry_price) * 100) 
            ? currentRMultiple : 0
        );
        
        if (dynamicTrailingResult.isActivated) {
          phase3TrailingApplied = true;
          positionLogger.trade(`PHASE3 DYNAMIC TRAILING: ${dynamicTrailingResult.reason}`);
          
          // Check if dynamic trailing suggests a new stop
          if (dynamicTrailingResult.newStopPrice !== null) {
            const dynamicStop = dynamicTrailingResult.newStopPrice;
            
            // Only update if new stop is more protective
            if (position.side === "BUY" && dynamicStop > (newStopLoss || position.stop_loss)) {
              newStopLoss = dynamicStop;
              positionLogger.trade(`PHASE3 STOP UPDATE BUY: Lock ${dynamicTrailingResult.lockR.toFixed(2)}R → stop ${dynamicStop.toFixed(2)}`);
            } else if (position.side === "SELL" && dynamicStop < (newStopLoss || position.stop_loss)) {
              newStopLoss = dynamicStop;
              positionLogger.trade(`PHASE3 STOP UPDATE SELL: Lock ${dynamicTrailingResult.lockR.toFixed(2)}R → stop ${dynamicStop.toFixed(2)}`);
            }
          }
        }
      }
      
      // ============= CONTINUATION MODE: SPECIAL EXIT LOGIC =============
      // Continuation mode entries (ADX 45-55 impulse trades) have different exit rules:
      // 1. Faster partial at 0.8R instead of standard TP1/TP2
      // 2. Structure-based trailing (1h HH/HL break) instead of ATR
      // 3. Immediate exit on momentum rollover
      // 4. Exit on ADX flattening + opposing candle combo
      const isContinuationModeEntry = position.entry_exception_type === 'CONTINUATION_MODE';
      let continuationModeExitTriggered = false;
      let continuationModeExitReason = "";
      
      if (isContinuationModeEntry && CONTINUATION_MODE_PARAMS.ENABLED && hasMetMinHoldTime) {
        positionLogger.debug(`CONTINUATION MODE EXIT CHECK: R=${currentRMultiple.toFixed(2)}, ADX=${positionAdx.toFixed(1)}, Position age=${positionAgeMinutes.toFixed(0)}min`);
        
        // Calculate R-multiple for continuation-specific partial exit
        if (hasValidStopLoss && currentRMultiple >= CONTINUATION_MODE_PARAMS.PARTIAL_EXIT_R_MULTIPLE) {
          const continuationPartialLevel = position.partial_tp_level || 0;
          
          // Take faster partial at 0.8R (instead of waiting for TP1 at ~33% of full TP)
          if (continuationPartialLevel < 1) {
            const closePercent = CONTINUATION_MODE_PARAMS.PARTIAL_EXIT_PERCENT / 100; // 50%
            const closeQuantity = position.quantity * closePercent;
            const remainingQuantity = position.quantity - closeQuantity;
            const partialPnl = position.side === "BUY"
              ? (currentPrice - position.entry_price) * closeQuantity
              : (position.entry_price - currentPrice) * closeQuantity;
            
            positionLogger.trade(`CONTINUATION MODE PARTIAL: Taking ${CONTINUATION_MODE_PARAMS.PARTIAL_EXIT_PERCENT}% at ${currentRMultiple.toFixed(2)}R (threshold: ${CONTINUATION_MODE_PARAMS.PARTIAL_EXIT_R_MULTIPLE}R)`);
            
            // Move stop to break-even + buffer for remaining position
            const slippageBuffer = position.entry_price * (SLIPPAGE_PARAMS.BREAK_EVEN_BUFFER_PERCENT / 100);
            const newStopAfterPartial = position.side === "BUY" 
              ? position.entry_price + slippageBuffer
              : position.entry_price - slippageBuffer;
            
            // Update position
            const { error: contPartialError } = await supabase
              .from("positions")
              .update({
                quantity: remainingQuantity,
                partial_tp_level: 1,
                stop_loss: newStopAfterPartial,
              })
              .eq("id", position.id)
              .eq("status", "active");
            
            if (!contPartialError) {
              // Calculate fee-aware P&L for partial close
              const partialFeeAwarePnL = calculateFeeAwarePnL(
                position.side,
                position.entry_price,
                currentPrice,
                closeQuantity,
                position.trading_fee_percent
              );
              
              // Create closed position record for tracking
              await supabase.from("positions").insert({
                user_id: position.user_id,
                symbol: position.symbol,
                side: position.side,
                quantity: closeQuantity,
                entry_price: position.entry_price,
                exit_price: currentPrice,
                stop_loss: position.stop_loss,
                take_profit: position.take_profit,
                status: "closed",
                close_reason: "continuation_mode_partial_0.8R",
                realized_pnl: partialFeeAwarePnL.netPnl,
                realized_pnl_percent: partialFeeAwarePnL.netPnlPercent,
                trading_fee_amount: partialFeeAwarePnL.totalFee,
                trading_fee_percent: partialFeeAwarePnL.feeRatePercent,
                opened_at: position.opened_at,
                closed_at: new Date().toISOString(),
                strategy_name: position.strategy_name,
                trend: position.trend,
                entry_exception_type: 'CONTINUATION_MODE',
              });
              
              partialTpTaken.push({
                symbol: position.symbol,
                side: position.side,
                level: "0.8R_CONTINUATION",
                closePercent: closePercent * 100,
                closeQuantity,
                pnl: partialPnl,
                pnlPercent,
              });
              
              positionLogger.success(`CONTINUATION PARTIAL: Closed ${(closePercent * 100).toFixed(0)}% at ${currentRMultiple.toFixed(2)}R, P&L: $${partialPnl.toFixed(2)}, moved stop to BE+buffer: ${newStopAfterPartial.toFixed(2)}`);
            }
          }
        }
        
        // EXIT TRIGGER 1: Momentum rollover detection
        // MACD histogram contracting AND price closes against trend direction
        if (CONTINUATION_MODE_PARAMS.EXIT_ON_MOMENTUM_ROLLOVER && atrData?.hasDivergence) {
          const priceAgainstTrend = (position.side === "BUY" && atrData?.priceTrending === "down") ||
                                    (position.side === "SELL" && atrData?.priceTrending === "up");
          const macdContracting = (position.side === "BUY" && atrData?.macdTrending === "down") ||
                                  (position.side === "SELL" && atrData?.macdTrending === "up");
          
          if (priceAgainstTrend && macdContracting && pnlPercent > 0) {
            continuationModeExitTriggered = true;
            continuationModeExitReason = "momentum_rollover";
            positionLogger.risk(`CONTINUATION EXIT: Momentum rollover detected - MACD ${atrData?.macdTrending} + Price ${atrData?.priceTrending} against ${position.side}`);
          }
        }
        
        // EXIT TRIGGER 2: ADX flattening + opposing candle
        // ADX slope near zero or negative AND current candle closes against position
        if (!continuationModeExitTriggered && CONTINUATION_MODE_PARAMS.EXIT_ON_ADX_FLATTEN_PLUS_BEARISH_CANDLE) {
          // MFS MIGRATION: Use MFS for ADX slope
          const contAdxSlope = mfsForPosition?.adxSlope ?? 0;
          const adxFlattening = contAdxSlope <= 0.5; // ADX not rising anymore
          
          // Check if latest candle closed against position
          const klines = atrData?.klines;
          if (klines && klines.length >= 2 && adxFlattening) {
            const lastCandle = klines[klines.length - 1];
            const lastOpen = parseFloat(lastCandle[1]);
            const lastClose = parseFloat(lastCandle[4]);
            
            const bearishCandle = lastClose < lastOpen; // Red candle
            const bullishCandle = lastClose > lastOpen; // Green candle
            
            const opposingCandle = (position.side === "BUY" && bearishCandle) || 
                                   (position.side === "SELL" && bullishCandle);
            
            if (opposingCandle && pnlPercent > 0) {
              continuationModeExitTriggered = true;
              continuationModeExitReason = "adx_flatten_opposing_candle";
              positionLogger.risk(`CONTINUATION EXIT: ADX flattening (slope=${contAdxSlope.toFixed(2)}) + ${bearishCandle ? 'bearish' : 'bullish'} candle against ${position.side}`);
            }
          }
        }
        
        // EXIT TRIGGER 3: Structure break (1h swing violation for LONG/SHORT)
        // For LONG: exit if price breaks below recent swing low (structure break)
        // For SHORT: exit if price breaks above recent swing high
        if (!continuationModeExitTriggered && CONTINUATION_MODE_PARAMS.USE_STRUCTURE_TRAILING && swingData) {
          if (position.side === "BUY" && swingData.swingLow) {
            const structureBreakPrice = swingData.swingLow * 0.998; // Small buffer
            if (currentPrice < structureBreakPrice && pnlPercent > 0) {
              continuationModeExitTriggered = true;
              continuationModeExitReason = "structure_break_swing_low";
              positionLogger.risk(`CONTINUATION EXIT: Price ${currentPrice.toFixed(2)} broke swing low ${swingData.swingLow.toFixed(2)}`);
            }
          } else if (position.side === "SELL" && swingData.swingHigh) {
            const structureBreakPrice = swingData.swingHigh * 1.002; // Small buffer
            if (currentPrice > structureBreakPrice && pnlPercent > 0) {
              continuationModeExitTriggered = true;
              continuationModeExitReason = "structure_break_swing_high";
              positionLogger.risk(`CONTINUATION EXIT: Price ${currentPrice.toFixed(2)} broke swing high ${swingData.swingHigh.toFixed(2)}`);
            }
          }
        }
        
        // Execute continuation mode exit if triggered
        if (continuationModeExitTriggered && !emergencyClose) {
          emergencyClose = true;
          emergencyReason = `continuation_${continuationModeExitReason}`;
          positionLogger.risk(`CONTINUATION MODE EXIT TRIGGERED: ${continuationModeExitReason} at P&L ${pnlPercent.toFixed(2)}%`);
        }
      }
      
      // ============= PHASE 3: EXIT SIGNAL SCORING =============
      // Calculate comprehensive exit signal based on multiple factors
      if (momentumData && swingData && position.opened_at) {
        const reversalScoreForExit = mfsForPosition?.reversalScore ?? 0;
        
        const exitSignal = calculateExitSignal(
          {
            side: position.side,
            entryPrice: position.entry_price,
            stopLoss: position.stop_loss || 0,
            openedAt: new Date(position.opened_at),
            peakPnlPercent: newPeakPnl
          },
          currentPrice,
          momentumData,
          swingData,
          reversalScoreForExit,
          atrData?.atrRatio || 1,
          pnlPercent
        );
        
        if (exitSignal.shouldExit && !emergencyClose) {
          positionLogger.risk(`PHASE3 EXIT SIGNAL: Score ${exitSignal.exitScore}/100 | ${exitSignal.reason}`);
          
          if (exitSignal.isEmergency) {
            emergencyClose = true;
            emergencyReason = `phase3_emergency_exit_${exitSignal.exitScore}`;
            positionLogger.risk(`PHASE3 EMERGENCY EXIT TRIGGERED: ${exitSignal.reason}`);
          } else if (hasMetMinHoldTime && pnlPercent > 0) {
            // For non-emergency profitable positions, tighten stop aggressively
            const aggressiveStop = position.side === "BUY"
              ? currentPrice * (1 - TRAILING_STOP_INLINE.AGGRESSIVE_STOP_DISTANCE_PERCENT / 100)
              : currentPrice * (1 + TRAILING_STOP_INLINE.AGGRESSIVE_STOP_DISTANCE_PERCENT / 100);
            
            if (position.side === "BUY" && aggressiveStop > (newStopLoss || position.stop_loss)) {
              newStopLoss = aggressiveStop;
              positionLogger.trade(`PHASE3 AGGRESSIVE STOP BUY: Exit signal (${exitSignal.exitScore}) → stop ${aggressiveStop.toFixed(2)}`);
            } else if (position.side === "SELL" && aggressiveStop < (newStopLoss || position.stop_loss)) {
              newStopLoss = aggressiveStop;
              positionLogger.trade(`PHASE3 AGGRESSIVE STOP SELL: Exit signal (${exitSignal.exitScore}) → stop ${aggressiveStop.toFixed(2)}`);
            }
          }
        }
      }
      
      // Log activation method
      if (shouldActivateTrailing && useRMultipleActivation && rMultipleActivated && !phase3TrailingApplied) {
        positionLogger.trade(`TRAILING R-MULTIPLE: ${currentRMultiple.toFixed(2)}R >= ${R_MULTIPLE_TRAILING_PARAMS.ACTIVATION_R_MULTIPLE}R activation (P&L: ${pnlPercent.toFixed(2)}%)`);
      } else if (shouldActivateTrailing && microTrendActivation && !phase3TrailingApplied) {
        positionLogger.trade(`TRAILING MICRO_TREND: P&L ${pnlPercent.toFixed(2)}% > ${MICRO_TREND_EXIT.TRAILING_ACTIVATION_PERCENT}% activation (tight trail mode)`);
      } else if (shouldActivateTrailing && !rMultipleActivated && !phase3TrailingApplied) {
        positionLogger.trade(`TRAILING FALLBACK: P&L ${pnlPercent.toFixed(2)}% > ${userSettings.activationPercent}% (R-multiple: ${useRMultipleActivation ? currentRMultiple.toFixed(2) + "R" : "N/A - no valid stop"})`);
      }
      
      // Check if trailing stop is enabled and activation criteria met
      if (userSettings.enabled && shouldActivateTrailing) {
        // Calculate ATR-based minimum distance (for volatility buffer)
        const atrAbsolute = (currentPrice * atrPercent) / 100;
        
        // ============================================================
        // HTF ALIGNMENT-ADJUSTED TRAILING DISTANCE
        // Premium alignment = wider trailing (more room for pullbacks)
        // Weak/counter-trend = tighter trailing (lock profits faster)
        // ============================================================
        // MICRO_TREND OVERRIDE: Use fixed tight distance instead of ATR-based
        let baseTrailingDistance: number;
        let minTrailingDistance: number;
        
        if (isMicroTrendEntry && MICRO_TREND_EXIT.USE_FIXED_TRAIL_DISTANCE) {
          // Fixed 0.20% trail distance for MICRO_TREND (matches empirical hold profile)
          const fixedDistance = currentPrice * (MICRO_TREND_EXIT.TRAILING_DISTANCE_PERCENT / 100);
          baseTrailingDistance = fixedDistance;
          minTrailingDistance = fixedDistance; // No HTF adjustment for micro-trend
          positionLogger.trade(`MICRO_TREND TRAILING: Fixed ${MICRO_TREND_EXIT.TRAILING_DISTANCE_PERCENT}% distance = ${fixedDistance.toFixed(2)} (activation: ${MICRO_TREND_EXIT.TRAILING_ACTIVATION_PERCENT}%)`);
        } else if (isMomentumContinuationEntry) {
          // MOMENTUM_CONTINUATION: Wider trailing distance (25% wider) so decay fires before trailing
          // Decay exit captures 72-78% vs trailing's 37-46% — trailing is fallback only
          baseTrailingDistance = Math.max(atrAbsolute * userSettings.distanceMultiplier * MOMENTUM_CONTINUATION_EXIT.TRAILING_DISTANCE_MULTIPLIER, currentPrice * (TRAILING_STOP_INLINE.MIN_TRAILING_DISTANCE_PERCENT / 100));
          minTrailingDistance = baseTrailingDistance * htfAlignmentMultiplier;
          positionLogger.trade(`MOMENTUM_CONTINUATION TRAILING: Wider distance ×${MOMENTUM_CONTINUATION_EXIT.TRAILING_DISTANCE_MULTIPLIER} = ${baseTrailingDistance.toFixed(2)} (decay is primary exit)`);
        } else {
          // ============= VOLATILITY ADAPTIVE TRAILING =============
          // Standard ATR-based distance as baseline
          const standardAtrDistance = atrAbsolute * userSettings.distanceMultiplier;
          const minFloor = currentPrice * (TRAILING_STOP_INLINE.MIN_TRAILING_DISTANCE_PERCENT / 100);
          
          if (VOLATILITY_ADAPTIVE_TRAILING.ENABLED) {
            // Step 1: Determine volatility regime from ATR ratio
            const atrRatio = atrPercent / 100; // Already have atrPercent
            let volRegime: 'LOW' | 'NORMAL' | 'HIGH';
            let volMultiplier: number;
            
            if (atrRatio < VOLATILITY_ADAPTIVE_TRAILING.REGIME_THRESHOLDS.LOW_MAX) {
              volRegime = 'LOW';
              volMultiplier = VOLATILITY_ADAPTIVE_TRAILING.REGIME_MULTIPLIERS.LOW;
            } else if (atrRatio < VOLATILITY_ADAPTIVE_TRAILING.REGIME_THRESHOLDS.NORMAL_MAX) {
              volRegime = 'NORMAL';
              volMultiplier = VOLATILITY_ADAPTIVE_TRAILING.REGIME_MULTIPLIERS.NORMAL;
            } else {
              volRegime = 'HIGH';
              volMultiplier = VOLATILITY_ADAPTIVE_TRAILING.REGIME_MULTIPLIERS.HIGH;
            }
            
            // Step 2: Calculate ATR-normalized adaptive distance
            let adaptiveDistance = atrAbsolute * volMultiplier;
            
            // Step 3: ADX trend strength override
            if (VOLATILITY_ADAPTIVE_TRAILING.ADX_TREND_OVERRIDE.ENABLED) {
              const posAdx = mfsForPosition?.adx ?? 20;
              if (posAdx >= VOLATILITY_ADAPTIVE_TRAILING.ADX_TREND_OVERRIDE.STRONG_MIN_ADX) {
                adaptiveDistance *= VOLATILITY_ADAPTIVE_TRAILING.ADX_TREND_OVERRIDE.STRONG_MULTIPLIER;
              } else if (posAdx >= VOLATILITY_ADAPTIVE_TRAILING.ADX_TREND_OVERRIDE.MODERATE_MIN_ADX) {
                adaptiveDistance *= VOLATILITY_ADAPTIVE_TRAILING.ADX_TREND_OVERRIDE.MODERATE_MULTIPLIER;
              }
            }
            
            // Step 4: Apply floor and cap
            const distanceFloor = currentPrice * (VOLATILITY_ADAPTIVE_TRAILING.MIN_DISTANCE_FLOOR_PERCENT / 100);
            const distanceCap = currentPrice * (VOLATILITY_ADAPTIVE_TRAILING.MAX_DISTANCE_CAP_PERCENT / 100);
            adaptiveDistance = Math.max(adaptiveDistance, distanceFloor);
            adaptiveDistance = Math.min(adaptiveDistance, distanceCap);
            
            // Step 5: Final distance = max(peak_tier_distance, ATR_adaptive_distance, min_floor)
            // peak_tier_distance is handled later by PEAK_ADAPTIVE_TRAILING (tightening)
            // Here we use max(standard, adaptive) as the base
            baseTrailingDistance = Math.max(standardAtrDistance, adaptiveDistance, minFloor);
            
            if (VOLATILITY_ADAPTIVE_TRAILING.LOG_REGIME_DECISIONS) {
              const posAdx = mfsForPosition?.adx ?? 20;
              positionLogger.trade(`🌊 VOL_ADAPTIVE_TRAIL: regime=${volRegime} ATR%=${(atrRatio*100).toFixed(3)}% | volMult=${volMultiplier} ADX=${posAdx.toFixed(1)} | standard=${standardAtrDistance.toFixed(2)} adaptive=${adaptiveDistance.toFixed(2)} → final=${baseTrailingDistance.toFixed(2)}`);
            }
          } else {
            baseTrailingDistance = Math.max(standardAtrDistance, minFloor);
          }
          
          minTrailingDistance = baseTrailingDistance * htfAlignmentMultiplier; // Apply HTF multiplier
          
          // ============= FIX #2: FAST PEAK VELOCITY TRAIL TIGHTENING =============
          // If peak was reached within 10 min, the move is a fast impulse liquidity grab
          // Tighten trailing to 0.18% to prevent full giveback (addresses Trades #1, #2, #3)
          if (isLowConfidenceStandard && newPeakPnl > 0.15) {
            const peakReachedAtDate = position.peak_reached_at ? new Date(position.peak_reached_at) : null;
            const openedAtDate = position.opened_at ? new Date(position.opened_at) : null;
            
            if (peakReachedAtDate && openedAtDate) {
              const minutesToPeak = (peakReachedAtDate.getTime() - openedAtDate.getTime()) / (1000 * 60);
              
              if (minutesToPeak < LOW_CONFIDENCE_STANDARD_EXIT.FAST_PEAK_MAX_MINUTES && minutesToPeak > 0) {
                // MFS MIGRATION: Use MFS for ADX slope
                const fastPeakAdxSlope = mfsForPosition?.adxSlope ?? 0;
                const adxFlattening = !LOW_CONFIDENCE_STANDARD_EXIT.FAST_PEAK_REQUIRE_ADX_SLOPE_FLAT || 
                                      fastPeakAdxSlope < LOW_CONFIDENCE_STANDARD_EXIT.FAST_PEAK_ADX_SLOPE_THRESHOLD;
                
                if (adxFlattening) {
                  const tightDistance = currentPrice * (LOW_CONFIDENCE_STANDARD_EXIT.FAST_PEAK_TRAIL_DISTANCE_PERCENT / 100);
                  baseTrailingDistance = tightDistance;
                  minTrailingDistance = tightDistance; // No HTF adjustment for fast peaks
                  positionLogger.trade(`⚡ FAST PEAK TRAIL: Peak in ${minutesToPeak.toFixed(0)}min < ${LOW_CONFIDENCE_STANDARD_EXIT.FAST_PEAK_MAX_MINUTES}min → tight trail ${LOW_CONFIDENCE_STANDARD_EXIT.FAST_PEAK_TRAIL_DISTANCE_PERCENT}% = ${tightDistance.toFixed(2)} (ADX slope ${fastPeakAdxSlope.toFixed(2)}, confidence ${position.confidence_score})`);
                }
              }
            }
          }
        }
        
        // ============= PEAK-ADAPTIVE TRAILING DISTANCE TIGHTENING =============
        // When peak P&L enters "harvest zone", cap trailing distance to prevent 65-90% giveback
        // Complementary to progressive locks (floor stops) — this tightens the ceiling
        if (PEAK_ADAPTIVE_TRAILING.ENABLED && newPeakPnl > 0) {
          const exemptMicro = PEAK_ADAPTIVE_TRAILING.EXEMPT_MICRO_TREND && isMicroTrendEntry;
          const exemptMomentum = PEAK_ADAPTIVE_TRAILING.EXEMPT_MOMENTUM_CONTINUATION && isMomentumContinuationEntry;
          
          if (!exemptMicro && !exemptMomentum) {
            // Find the highest matching tier
            let matchedTier: { peakThreshold: number; maxDistancePercent: number } | null = null;
            for (let i = PEAK_ADAPTIVE_TRAILING.TIERS.length - 1; i >= 0; i--) {
              if (newPeakPnl >= PEAK_ADAPTIVE_TRAILING.TIERS[i].peakThreshold) {
                matchedTier = PEAK_ADAPTIVE_TRAILING.TIERS[i];
                break;
              }
            }
            
            if (matchedTier) {
              let maxDistance = currentPrice * (matchedTier.maxDistancePercent / 100);
              
              // ADX-aware relaxation: wider distance in strong trends
              if (PEAK_ADAPTIVE_TRAILING.STRONG_TREND_RELAXATION_ENABLED) {
                // MFS MIGRATION: Use MFS for ADX
                const peakAdx = mfsForPosition?.adx ?? 20;
                if (peakAdx >= PEAK_ADAPTIVE_TRAILING.VERY_STRONG_TREND_MIN_ADX) {
                  maxDistance *= PEAK_ADAPTIVE_TRAILING.VERY_STRONG_TREND_DISTANCE_MULTIPLIER;
                } else if (peakAdx >= PEAK_ADAPTIVE_TRAILING.STRONG_TREND_MIN_ADX) {
                  maxDistance *= PEAK_ADAPTIVE_TRAILING.STRONG_TREND_DISTANCE_MULTIPLIER;
                }
              }
              
              // Apply cap: if current distance exceeds max, tighten it
              if (baseTrailingDistance > maxDistance) {
                const oldDistance = baseTrailingDistance;
                baseTrailingDistance = maxDistance;
                minTrailingDistance = maxDistance; // Override HTF adjustment too
                if (PEAK_ADAPTIVE_TRAILING.LOG_DISTANCE_TIGHTENING) {
                  positionLogger.trade(`📐 PEAK_ADAPTIVE_TRAIL: peak=${newPeakPnl.toFixed(2)}% → tier ${matchedTier.peakThreshold}% → distance ${oldDistance.toFixed(2)} → ${maxDistance.toFixed(2)} (${matchedTier.maxDistancePercent}% of price)`);
                }
              }
            }
          }
        }

        if (htfAlignmentMultiplier !== 1.0) {
          positionLogger.debug(`HTF-adjusted trailing: base=${baseTrailingDistance.toFixed(2)} × ${htfAlignmentMultiplier.toFixed(2)} = ${minTrailingDistance.toFixed(2)}`);
        }
        
        // ============= PHASE 3: TIGHTENING SPEED CAP =============
        // Prevent death by a thousand cuts by limiting how fast stop can tighten
        const lastStopUpdate = position.updated_at ? new Date(position.updated_at) : new Date();
        const minutesSinceLastUpdate = (Date.now() - lastStopUpdate.getTime()) / (1000 * 60);
        const hoursSinceLastUpdate = minutesSinceLastUpdate / 60;
        
        // Calculate max allowed tightening based on time elapsed
        let maxAllowedTighteningR = R_MULTIPLE_TRAILING_PARAMS.MAX_TIGHTENING_R_PER_HOUR * hoursSinceLastUpdate;
        let tighteningCapped = false;
        
        // Only apply speed cap if we have valid R-multiple calculation
        if (useRMultipleActivation && minutesSinceLastUpdate < R_MULTIPLE_TRAILING_PARAMS.MIN_TIGHTENING_INTERVAL_MINUTES) {
          // Too soon since last update - skip tightening
          positionLogger.info(`TIGHTENING SKIPPED: Only ${minutesSinceLastUpdate.toFixed(1)}min since last update (min: ${R_MULTIPLE_TRAILING_PARAMS.MIN_TIGHTENING_INTERVAL_MINUTES}min)`);
          tighteningCapped = true;
        }
        
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
            if (decayVelocity > TRAILING_STOP_INLINE.DECAY_OVERRIDE_VELOCITY_THRESHOLD) {
              decayOverride = TRAILING_STOP_INLINE.DECAY_OVERRIDE_LOCK_PERCENT;
              lockTier = "decay_override";
            }
          }
          
          // Use highest lock between progressive + stale bonus OR decay override
          const adaptiveLock = Math.max(progressiveLock + stalePeakBonus, decayOverride);
          
          // Only use smart AITS if it's more protective than user setting
          if (adaptiveLock > profitLockPercent) {
            profitLockPercent = Math.min(TRAILING_STOP_INLINE.MAX_ADAPTIVE_LOCK, adaptiveLock);
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
          
          // CRITICAL FIX: TRUE_BE FLOOR INVARIANT
          // Trailing stop MUST NEVER go below fee-adjusted break-even
          // True BE = entry * (1 + round_trip_fee + buffer) for LONG
          const roundTripFeePercent = TRADING_FEE_PARAMS.ROUND_TRIP_FEE_PERCENT || 0.2;
          const trueBeBuffer = TRADING_FEE_PARAMS.TRUE_BE_SAFETY_BUFFER_PERCENT || 0.02;
          const trueBE = position.entry_price * (1 + (roundTripFeePercent + trueBeBuffer) / 100);
          
          // Use the HIGHER of the two (more protective)
          let calculatedStopLoss = Math.max(lockStopPrice, atrBasedStop);
          
          // TRAILING_INVARIANT: Enforce trailingStop >= trueBE ALWAYS
          if (calculatedStopLoss < trueBE && newPeakPnl >= (MICRO_PROFIT_LOCK_PARAMS.TRUE_BE_FLOOR_PERCENT || 0.22)) {
            const oldStop = calculatedStopLoss;
            calculatedStopLoss = trueBE;
            positionLogger.trade(`TRAILING_FEE_FLOOR: Stop ${oldStop.toFixed(2)} → ${trueBE.toFixed(2)} (true BE enforced, fees=${roundTripFeePercent}%)`);
          }
          
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
          
          // CRITICAL FIX: TRUE_BE FLOOR INVARIANT
          // Trailing stop MUST NEVER go above fee-adjusted break-even (for SHORT)
          // True BE = entry * (1 - round_trip_fee - buffer) for SHORT
          const roundTripFeePercent = TRADING_FEE_PARAMS.ROUND_TRIP_FEE_PERCENT || 0.2;
          const trueBeBuffer = TRADING_FEE_PARAMS.TRUE_BE_SAFETY_BUFFER_PERCENT || 0.02;
          const trueBE = position.entry_price * (1 - (roundTripFeePercent + trueBeBuffer) / 100);
          
          // Use the LOWER of the two (more protective for shorts)
          let calculatedStopLoss = Math.min(lockStopPrice, atrBasedStop);
          
          // TRAILING_INVARIANT: Enforce trailingStop <= trueBE ALWAYS (for SHORT)
          if (calculatedStopLoss > trueBE && newPeakPnl >= MICRO_PROFIT_LOCK_PARAMS.TRUE_BE_FLOOR_PERCENT) {
            const oldStop = calculatedStopLoss;
            calculatedStopLoss = trueBE;
            positionLogger.trade(`TRAILING_FEE_FLOOR: Stop ${oldStop.toFixed(2)} → ${trueBE.toFixed(2)} (true BE enforced, fees=${roundTripFeePercent}%)`);
          }
          
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
        
        // 🔒 PROFIT LOCK FLOOR INVARIANT: Trailing stop MUST NEVER regress below micro/progressive lock
        // FIX: Now enforced ALWAYS when profitLockFloor exists, not just when trailingActivated
        // This prevents ANY stop regression, whether from trailing, break-even, or other logic
        if (profitLockFloor !== null && newStopLoss !== null) {
          if (position.side === "BUY" && newStopLoss < profitLockFloor) {
            positionLogger.trade(`🔒 PROFIT_LOCK_FLOOR_BUY: Stop tried ${newStopLoss.toFixed(4)} but floor is ${profitLockFloor.toFixed(4)} → enforcing floor`);
            newStopLoss = profitLockFloor;
          } else if (position.side === "SELL" && newStopLoss > profitLockFloor) {
            positionLogger.trade(`🔒 PROFIT_LOCK_FLOOR_SELL: Stop tried ${newStopLoss.toFixed(4)} but floor is ${profitLockFloor.toFixed(4)} → enforcing floor`);
            newStopLoss = profitLockFloor;
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
      // DEPRECATED: Break-even now handled by micro-profit and progressive locks
      // This section only runs as a fallback for positions that somehow missed tiered protection
      // Skip if micro-profit or progressive lock already applied (tiered protection is superior)
      const isBreakEvenEligible = userSettings.breakEvenEnabled && 
                                  pnlPercent >= effectiveBreakEvenActivation &&
                                  !trailingActivated && // Don't apply if trailing stop already moved
                                  !microProfitLockApplied && // Don't override micro-profit lock
                                  !progressiveLockApplied;   // Don't override progressive lock

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
      // PROGRESSIVE PROFIT LOCK - Bridge gap between break-even and trailing
      // When peak P&L exceeds a tier threshold, lock in that tier's profit target
      // This ensures positions that peaked at +0.6% exit at +0.15%, not 0%
      // Only applies when trailing stop hasn't activated yet
      // ============================================================
      if (PROGRESSIVE_PROFIT_LOCK_PARAMS.ENABLED && 
          !trailingActivated && 
          position.stop_loss !== null &&
          newPeakPnl < PROGRESSIVE_PROFIT_LOCK_PARAMS.DEFER_TO_TRAILING_AT) {
        
        // Find the highest tier the peak P&L qualifies for
        let applicableTier = null;
        for (const tier of PROGRESSIVE_PROFIT_LOCK_PARAMS.TIERS) {
          if (newPeakPnl >= tier.peakThreshold) {
            applicableTier = tier;
          }
        }
        
        if (applicableTier && applicableTier.lockTarget > 0) {
          // Calculate the lock stop price to achieve the target profit
          const entryPrice = position.entry_price;
          const lockProfitAmount = entryPrice * (applicableTier.lockTarget / 100);
          
          // Add slippage buffer to ensure we actually get the locked profit
          const slippageBuffer = entryPrice * (SLIPPAGE_PARAMS.BREAK_EVEN_BUFFER_PERCENT / 100);
          
          let progressiveLockStop: number;
          let shouldApplyLock = false;
          
          if (position.side === "BUY") {
            // For LONG: stop = entry + lockProfit + slippageBuffer
            progressiveLockStop = entryPrice + lockProfitAmount + slippageBuffer;
            // Only move stop UP (more protective)
            if (progressiveLockStop > position.stop_loss) {
              shouldApplyLock = true;
            }
          } else {
            // For SHORT: stop = entry - lockProfit - slippageBuffer
            progressiveLockStop = entryPrice - lockProfitAmount - slippageBuffer;
            // Only move stop DOWN (more protective)
            if (progressiveLockStop < position.stop_loss) {
              shouldApplyLock = true;
            }
          }
          
          if (shouldApplyLock) {
            positionLogger.trade(`PROGRESSIVE LOCK: Peak ${newPeakPnl.toFixed(2)}% >= ${applicableTier.peakThreshold}% tier → Locking +${applicableTier.lockTarget.toFixed(2)}% profit (Stop: ${position.stop_loss.toFixed(2)} → ${progressiveLockStop.toFixed(2)})`);
            
            const { error: lockError } = await supabase
              .from("positions")
              .update({ stop_loss: progressiveLockStop })
              .eq("id", position.id)
              .eq("status", "active");
            
            if (lockError) {
              positionLogger.error(`Error applying progressive lock: ${lockError.message}`);
            } else {
              updatedStopLossMap.set(position.id, progressiveLockStop);
            }
          }
        }
      }

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
            riskScore += REVERSAL_RISK_EXIT_SCORES.MACD_DIVERGENCE;
            signals.push("MACD divergence detected");
          }
          if (!momentum.confirms && momentum.state !== "confirmed") {
            riskScore += REVERSAL_RISK_EXIT_SCORES.MOMENTUM_WEAKENING;
            signals.push(`Momentum weakening (state: ${momentum.state || "none"})`);
          }
          if (!momentum.lastCloseAlignsWithTrend) {
            riskScore += REVERSAL_RISK_EXIT_SCORES.LAST_CLOSE_OPPOSES;
            signals.push("Last close opposes trend");
          }
          if (!momentum.macdDirectionAligned) {
            riskScore += REVERSAL_RISK_EXIT_SCORES.MACD_DIRECTION_MISALIGNED;
            signals.push("MACD direction misaligned");
          }
          
          // RSI pullback detection for conflict resolution
          // MFS MIGRATION: Use MFS for RSI 4h
          const rsi4h = mfsForPosition?.timeframes?.["4h"]?.rsi ?? trendData.timeframes?.['4h']?.indicators?.rsi ?? 50;
          const momentumConfirms = momentum.confirms === true;
          
          // For SHORT positions: check for bullish reversal signals
          if (positionSide === "SELL") {
            // RSI indicates SHORT pullback (price rallying = good for exit timing)
            const rsiIndicatesPullback = rsi4h > RSI_THRESHOLDS.BEARISH_RALLY || rsi4h > RSI_THRESHOLDS.NEUTRAL_HIGH;
            const shouldReduceStochZonePenalty = rsiIndicatesPullback && momentumConfirms;
            
            if ((stochRsi.bullishCrossCount || 0) >= 1) {
              riskScore += REVERSAL_RISK_EXIT_SCORES.STOCHRSI_CROSS;
              signals.push(`StochRSI bullish cross (${stochRsi.bullishCrossCount} TF)`);
            }
            if ((stochRsi.oversoldCount || 0) >= 2) {
              let zoneScore = REVERSAL_RISK_EXIT_SCORES.STOCHRSI_EXTREME_ZONE;
              if (shouldReduceStochZonePenalty) {
                zoneScore = Math.round(zoneScore * REVERSAL_RISK_EXIT_SCORES.RSI_PULLBACK_REDUCTION_FACTOR);
                signals.push(`StochRSI oversold on ${stochRsi.oversoldCount} TF - reduced ${REVERSAL_RISK_EXIT_SCORES.RSI_PULLBACK_REDUCTION_FACTOR * 100}% (RSI pullback + momentum)`);
              } else {
                signals.push(`StochRSI oversold on ${stochRsi.oversoldCount} TF (bounce risk)`);
              }
              riskScore += zoneScore;
            }
            if (trend1h === "bullish") {
              riskScore += REVERSAL_RISK_EXIT_SCORES.TREND_1H_FLIPPED;
              signals.push("1h trend turned bullish");
            }
          }
          // For LONG positions: check for bearish reversal signals
          else if (positionSide === "BUY") {
            // RSI indicates LONG pullback (price dipping = good for entry/hold timing)
            const rsiIndicatesPullback = rsi4h < RSI_THRESHOLDS.BULLISH_PULLBACK || rsi4h < RSI_THRESHOLDS.NEUTRAL_LOW;
            const shouldReduceStochZonePenalty = rsiIndicatesPullback && momentumConfirms;
            
            if ((stochRsi.bearishCrossCount || 0) >= 1) {
              riskScore += REVERSAL_RISK_EXIT_SCORES.STOCHRSI_CROSS;
              signals.push(`StochRSI bearish cross (${stochRsi.bearishCrossCount} TF)`);
            }
            if ((stochRsi.overboughtCount || 0) >= 2) {
              let zoneScore = REVERSAL_RISK_EXIT_SCORES.STOCHRSI_EXTREME_ZONE;
              if (shouldReduceStochZonePenalty) {
                zoneScore = Math.round(zoneScore * REVERSAL_RISK_EXIT_SCORES.RSI_PULLBACK_REDUCTION_FACTOR);
                signals.push(`StochRSI overbought on ${stochRsi.overboughtCount} TF - reduced ${REVERSAL_RISK_EXIT_SCORES.RSI_PULLBACK_REDUCTION_FACTOR * 100}% (RSI pullback + momentum)`);
              } else {
                signals.push(`StochRSI overbought on ${stochRsi.overboughtCount} TF (pullback risk)`);
              }
              riskScore += zoneScore;
            }
            if (trend1h === "bearish") {
              riskScore += REVERSAL_RISK_EXIT_SCORES.TREND_1H_FLIPPED;
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
          // MFS MIGRATION: Use MFS for StochRSI 4h instead of raw trendData access
          const stochRsiK4h = mfsForPosition?.stochRsi?.["4h"]?.k ?? 50;
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
            const hedgeTpPercent = Math.max(parentLossAmount * HEDGE_EXIT_PARAMS.TP_COVERAGE_MULTIPLIER, HEDGE_EXIT_PARAMS.MIN_TP_PERCENT);
            // For SELL hedge: TP when price goes DOWN, SL when goes UP
            // For BUY hedge: TP when price goes UP, SL when goes DOWN
            const hedgeTpPrice = isLong
              ? currentPrice * (1 - hedgeTpPercent / 100)
              : currentPrice * (1 + hedgeTpPercent / 100);
            const hedgeSlPrice = isLong
              ? currentPrice * (1 + HEDGE_EXIT_PARAMS.HEDGE_SL_PERCENT / 100)
              : currentPrice * (1 - HEDGE_EXIT_PARAMS.HEDGE_SL_PERCENT / 100);
            
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
                strategy_name: "Hedge: Reversal Protection", // Clear label for hedge positions
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
          
          // ============================================================
          // PHASE 3: ENTRY-TYPE-AWARE EXIT LOGIC
          // Each entry exception type has specific exit handling rules
          // ============================================================
          const entryExceptionType = position.entry_exception_type;
          
          // REVERSAL_OVERRIDE: 30-minute grace period before reversal risk exit
          const isReversalEntryWithGracePeriod = entryExceptionType === 'REVERSAL_OVERRIDE' && positionAgeMinutes < 30;
          
          // MOMENTUM_CONTINUATION: Extra divergence sensitivity (detect momentum fading)
          const isMomentumContinuationEntry = entryExceptionType === 'MOMENTUM_CONTINUATION';
          const momentumDivergenceDetected = atrData?.hasDivergence && isMomentumContinuationEntry;
          
          // MICRO_TREND: Time-bound expiry (tight time stop for short-term plays)
          // isMicroTrendEntry already declared at top of position loop
          const MICRO_TREND_MAX_AGE_MINUTES = MICRO_TREND_EXIT.MAX_AGE_MINUTES;
          const MICRO_TREND_MIN_PROFIT_PERCENT = MICRO_TREND_EXIT.MIN_PROFIT_PERCENT;
          
          // Check MICRO_TREND timeout first (before other exit logic)
          if (!result.shouldClose && isMicroTrendEntry && positionAgeMinutes > MICRO_TREND_MAX_AGE_MINUTES && pnlPercent < MICRO_TREND_MIN_PROFIT_PERCENT) {
            result.shouldClose = true;
            result.closeReason = "micro_trend_timeout";
            positionLogger.signal(
              `MICRO_TREND TIMEOUT: Position age ${positionAgeMinutes.toFixed(0)}min > ${MICRO_TREND_MAX_AGE_MINUTES}min max with P&L ${pnlPercent.toFixed(2)}% < ${MICRO_TREND_MIN_PROFIT_PERCENT}% - closing time-bound entry`,
            );
          }
          
          // Check MOMENTUM_CONTINUATION divergence exit (extra sensitivity)
          if (!result.shouldClose && momentumDivergenceDetected && pnlPercent < 0.5) {
            // Tighter exit for momentum continuation entries when divergence detected
            positionLogger.warn(
              `MOMENTUM_CONTINUATION WARNING: Divergence detected (MACD ${atrData?.macdTrending} vs Price ${atrData?.priceTrending}) - applying tighter profit lock`,
            );
            // Don't force close, but this affects trailing stop logic later
          }
          
          // ============================================================
          // VOLUME_RELAXATION ENTRY: Tighter time-based exit
          // Low volume entries have higher false breakout risk
          // ============================================================
          const isVolumeRelaxationEntry = position.volume_relaxation_applied === true;
          
          if (!result.shouldClose && isVolumeRelaxationEntry && 
              positionAgeMinutes > VOLUME_RELAXATION_EXIT_PARAMS.MAX_AGE_MINUTES && 
              pnlPercent < VOLUME_RELAXATION_EXIT_PARAMS.MIN_PROFIT_PERCENT) {
            result.shouldClose = true;
            result.closeReason = "volume_relaxation_timeout";
            positionLogger.signal(
              `VOLUME RELAXATION TIMEOUT: Low volume entry age ${positionAgeMinutes.toFixed(0)}min > ${VOLUME_RELAXATION_EXIT_PARAMS.MAX_AGE_MINUTES}min with P&L ${pnlPercent.toFixed(2)}% < ${VOLUME_RELAXATION_EXIT_PARAMS.MIN_PROFIT_PERCENT}% - closing stale entry`,
            );
          }
          
          // ============================================================
          // R-MULTIPLE PROFIT LOCK: Use initial_risk_amount for consistent locking
          // ============================================================
          const initialRiskAmount = position.initial_risk_amount;
          if (!result.shouldClose && initialRiskAmount && initialRiskAmount > 0 && pnl > 0) {
            const currentRMultipleLock = pnl / initialRiskAmount;
            const peakPnlValue = (position.peak_pnl_percent || 0) * position.entry_price * position.quantity / 100;
            const peakRMultiple = peakPnlValue > 0 ? peakPnlValue / initialRiskAmount : 0;
            
            // Lock profits at key R-multiples
            if (currentRMultipleLock >= R_MULTIPLE_LOCK_PARAMS.ACTIVATION_R && peakRMultiple >= R_MULTIPLE_LOCK_PARAMS.PEAK_REQUIRED_R) {
              const minLockPnl = R_MULTIPLE_LOCK_PARAMS.MIN_LOCK_R * initialRiskAmount;
              if (pnl < minLockPnl) {
                result.shouldClose = true;
                result.closeReason = "r_multiple_lock";
                positionLogger.signal(
                  `R-MULTIPLE LOCK: Current ${currentRMultipleLock.toFixed(1)}R dropped below ${R_MULTIPLE_LOCK_PARAMS.MIN_LOCK_R}R lock (peak was ${peakRMultiple.toFixed(1)}R) - protecting profits`,
                );
              }
            }
            
            // Log R-multiple status for debugging
            if (R_MULTIPLE_LOCK_PARAMS.ENABLE_LOGGING && Math.floor(positionAgeMinutes) % 15 === 0) {
              positionLogger.info(`R-Multiple: ${currentRMultipleLock.toFixed(2)}R | P&L: $${pnl.toFixed(2)} | Risk: $${initialRiskAmount.toFixed(2)} | Peak: ${peakRMultiple.toFixed(2)}R`);
            }
          }
          
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
            } 
            // Skip reversal exit for REVERSAL_OVERRIDE entries within grace period
            else if (isReversalEntryWithGracePeriod) {
              positionLogger.info(
                `REVERSAL EXIT SKIPPED: Entry was REVERSAL_OVERRIDE, age ${positionAgeMinutes.toFixed(0)}min < 30min grace - giving reversal trade time to play out. Risk ${reversalRisk.riskScore}/100`,
              );
            } 
            // Skip reversal exit for STRONG_TREND entries (already handled by trendContinuationAtExtreme)
            else if (entryExceptionType === 'STRONG_TREND' && positionAdx >= 25) {
              positionLogger.info(
                `REVERSAL EXIT SKIPPED: Entry was STRONG_TREND with ADX ${positionAdx.toFixed(1)} >= 25 - strong trend exception still valid. Risk ${reversalRisk.riskScore}/100`,
              );
            } else {
              result.shouldClose = true;
              result.closeReason = "reversal_risk_high";
              positionLogger.risk(
                `REVERSAL RISK EXIT: Closing ${positionSide} - Risk ${reversalRisk.riskScore}/100 (ADX weight: ${reversalRisk.adxWeight}) >= ${REVERSAL_RISK_EXIT_THRESHOLD} (dynamic), Age: ${positionAgeHours.toFixed(1)}h, ADX: ${positionAdx.toFixed(1)}, VolScore: ${positionVolumeScore}, Conf: ${positionConfidence}%${entryExceptionType ? `, EntryType: ${entryExceptionType}` : ''}`,
              );
            }
          } else if (!result.shouldClose && hasMetMinHoldTime && 
              positionAgeHours >= MIN_AGE_FOR_REVERSAL_EXIT_HOURS &&
              reversalRisk.riskScore >= (REVERSAL_RISK_EXIT_THRESHOLD - 5) && 
              reversalRisk.riskScore < REVERSAL_RISK_EXIT_THRESHOLD) {
            // NEAR MISS LOGGING: Reversal risk is within 5 points of threshold
            // This helps understand exit sensitivity for threshold optimization
            positionLogger.info(
              `NEAR MISS: Reversal risk ${reversalRisk.riskScore}/100 is within 5 of threshold ${REVERSAL_RISK_EXIT_THRESHOLD} - position continues | ADX: ${positionAdx.toFixed(1)}, P&L: ${pnlPercent.toFixed(2)}%${entryExceptionType ? `, EntryType: ${entryExceptionType}` : ''}`,
            );
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
        const effectiveTimeLimit = userSettings.timeBasedStopHours * TIME_STOP_MULT;
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
              // Calculate fee-aware P&L for partial loss
              const partialLossFeeAwarePnL = calculateFeeAwarePnL(
                position.side,
                position.entry_price,
                currentPrice,
                closeQuantity,
                position.trading_fee_percent
              );
              
              // Create a closed position record for the partial close (for history tracking)
              // CRITICAL: Copy entry_snapshot and forensic fields from parent position
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
                  realized_pnl: partialLossFeeAwarePnL.netPnl,
                  realized_pnl_percent: partialLossFeeAwarePnL.netPnlPercent,
                  trading_fee_amount: partialLossFeeAwarePnL.totalFee,
                  trading_fee_percent: partialLossFeeAwarePnL.feeRatePercent,
                  opened_at: position.opened_at,
                  closed_at: new Date().toISOString(),
                  strategy_name: position.strategy_name,
                  trend: position.trend,
                  confidence_score: position.confidence_score,
                  // FORENSIC FIELDS: Copy from parent for complete traceability
                  trend_consistency: position.trend_consistency,
                  entry_snapshot: position.entry_snapshot,
                  entry_atr: position.entry_atr,
                  entry_atr_percent: position.entry_atr_percent,
                  peak_pnl_percent: position.peak_pnl_percent,
                  entry_exception_type: position.entry_exception_type,
                  reversal_decision: position.reversal_decision,
                  reversal_score: position.reversal_score,
                  signal_id: position.signal_id,
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
          tp1Price = position.entry_price + (effectiveTpDistance * PARTIAL_TP_LADDER.TP1_DISTANCE_FRACTION);
          tp2Price = position.entry_price + (effectiveTpDistance * PARTIAL_TP_LADDER.TP2_DISTANCE_FRACTION);
          tp3Price = position.take_profit || position.entry_price + effectiveTpDistance;
        } else {
          tp1Price = position.entry_price - (effectiveTpDistance * PARTIAL_TP_LADDER.TP1_DISTANCE_FRACTION);
          tp2Price = position.entry_price - (effectiveTpDistance * PARTIAL_TP_LADDER.TP2_DISTANCE_FRACTION);
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
          partialClosePercent = PARTIAL_TP_LADDER.TP1_CLOSE_PERCENT;
          newTpLevel = 1;
          partialCloseReason = "partial_tp_1";
          positionLogger.signal(`TP1 HIT for LONG: Price $${currentPrice.toFixed(2)} >= TP1 $${tp1Price.toFixed(2)}`);
        } else if (currentTpLevel < 2 && currentTpLevel >= 1 && currentPrice >= tp2Price) {
          partialTpTriggered = true;
          partialClosePercent = PARTIAL_TP_LADDER.TP2_CLOSE_PERCENT;
          newTpLevel = 2;
          partialCloseReason = "partial_tp_2";
          positionLogger.signal(`TP2 HIT for LONG: Price $${currentPrice.toFixed(2)} >= TP2 $${tp2Price.toFixed(2)}`);
        }
      } else {
        // SHORT: TP when price goes DOWN
        if (currentTpLevel < 1 && currentPrice <= tp1Price) {
          partialTpTriggered = true;
          partialClosePercent = PARTIAL_TP_LADDER.TP1_CLOSE_PERCENT;
          newTpLevel = 1;
          partialCloseReason = "partial_tp_1";
          positionLogger.signal(`TP1 HIT for SHORT: Price $${currentPrice.toFixed(2)} <= TP1 $${tp1Price.toFixed(2)}`);
        } else if (currentTpLevel < 2 && currentTpLevel >= 1 && currentPrice <= tp2Price) {
          partialTpTriggered = true;
          partialClosePercent = PARTIAL_TP_LADDER.TP2_CLOSE_PERCENT;
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
          // Calculate fee-aware P&L for partial TP
          const partialTpFeeAwarePnL = calculateFeeAwarePnL(
            position.side,
            position.entry_price,
            currentPrice,
            closeQuantity,
            position.trading_fee_percent
          );
          
          // Create a closed position record for the partial close (for history tracking)
          // CRITICAL: Copy entry_snapshot and forensic fields from parent position
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
              realized_pnl: partialTpFeeAwarePnL.netPnl,
              realized_pnl_percent: partialTpFeeAwarePnL.netPnlPercent,
              trading_fee_amount: partialTpFeeAwarePnL.totalFee,
              trading_fee_percent: partialTpFeeAwarePnL.feeRatePercent,
              opened_at: position.opened_at,
              closed_at: new Date().toISOString(),
              strategy_name: position.strategy_name,
              trend: position.trend,
              confidence_score: position.confidence_score,
              // FORENSIC FIELDS: Copy from parent for complete traceability
              trend_consistency: position.trend_consistency,
              entry_snapshot: position.entry_snapshot,
              entry_atr: position.entry_atr,
              entry_atr_percent: position.entry_atr_percent,
              peak_pnl_percent: position.peak_pnl_percent,
              entry_exception_type: position.entry_exception_type,
              reversal_decision: position.reversal_decision,
              reversal_score: position.reversal_score,
              signal_id: position.signal_id,
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
      // ============= FEE-AWARE MINIMUM PROFIT GATE (ALL EXIT TYPES) =============
      // Prevent closing at a tiny profit that would be consumed by fees
      // Only applies to "soft" exits where position is profitable but below fee threshold
      // Emergency exits, stop losses, take profits, and losing positions are exempt
      if (shouldClose && pnlPercent > 0) {
        const totalCosts = TRAILING_MIN_PROFIT_FLOOR.ROUND_TRIP_FEE_PERCENT + TRAILING_MIN_PROFIT_FLOOR.SLIPPAGE_ESTIMATE_PERCENT;
        const minNetProfit = totalCosts * TRAILING_MIN_PROFIT_FLOOR.MIN_PROFIT_OVER_COSTS_MULTIPLIER;
        
        // Exempt categories that should ALWAYS close regardless of fee efficiency:
        // - Emergency exits (flash crash, volatility, divergence)
        // - Take profit (price target hit)
        // - Stop loss (risk management)
        // - Break-even (capital protection)
        // - Losses (pnlPercent <= 0) — handled by outer if
        const feeExemptReasons = new Set([
          "flash_crash", "extreme_volatility", "volatility_divergence",
          "momentum_divergence_critical", "divergence_volume_spike", "momentum_divergence_exit",
          "take_profit", "stop_loss", "trailing_stop_loss", "break_even",
          "partial_loss", "circuit_breaker",
          "mean_reversion_adverse", "mean_reversion_early_failure", "mean_reversion_trend_acceleration",
          "mean_reversion_time_exit", "mean_reversion_trend_continuation", "moderate_exhaustion_momentum_invalidated",
          "smart_aits_rapid_decay", "smart_aits_prolonged_decay",
        ]);
        
        const isExempt = feeExemptReasons.has(closeReason) || exitPriority >= EXIT_PRIORITY.TAKE_PROFIT_HIT;
        
        // Also exempt if profit is dropping fast from peak (panic protection)
        const drawdownFromPeak = newPeakPnl - pnlPercent;
        const panicOverride = newPeakPnl >= minNetProfit && drawdownFromPeak >= TRAILING_MIN_PROFIT_FLOOR.PANIC_DRAWDOWN_FROM_PEAK_PERCENT;
        
        if (!isExempt && !panicOverride && pnlPercent < minNetProfit) {
          positionLogger.trade(`FEE GATE BLOCKED: ${closeReason} at ${pnlPercent.toFixed(3)}% < min ${minNetProfit.toFixed(2)}% (fees would consume ${((totalCosts / pnlPercent) * 100).toFixed(0)}% of profit)`);
          shouldClose = false;
          closeReason = "";
        } else if (!isExempt && panicOverride) {
          positionLogger.trade(`FEE GATE PANIC: Allowing ${closeReason} — peak ${newPeakPnl.toFixed(2)}% dropped ${drawdownFromPeak.toFixed(2)}%`);
        }
      }

      if (shouldClose) {
        // For break-even closes, ensure P&L is at least 0 by using entry price
        // This prevents slippage from causing false losses on break-even exits
        let finalExitPrice = currentPrice;
        let finalPnl = pnl;
        let finalPnlPercent = pnlPercent;
        let feeAmount: number = 0;
        let feePercent: number = TRADING_FEE_PARAMS.DEFAULT_FEE_RATE_PERCENT;
        
        if (closeReason === "break_even") {
          // Use entry price to guarantee 0 P&L for break-even stops
          // Break-even is meant to protect capital, not generate losses
          finalExitPrice = position.entry_price;
          finalPnl = 0;
          finalPnlPercent = 0;
          feeAmount = 0;
          positionLogger.trade(`BREAK-EVEN: Using entry price ${finalExitPrice} for P&L (current: ${currentPrice})`);
        } else {
          // Calculate fee-aware P&L for non-break-even closes
          const closeFeeAwarePnL = calculateFeeAwarePnL(
            position.side,
            position.entry_price,
            finalExitPrice,
            position.quantity,
            position.trading_fee_percent
          );
          finalPnl = closeFeeAwarePnL.netPnl;
          finalPnlPercent = closeFeeAwarePnL.netPnlPercent;
          feeAmount = closeFeeAwarePnL.totalFee;
          feePercent = closeFeeAwarePnL.feeRatePercent;
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
            trading_fee_amount: feeAmount,
            trading_fee_percent: feePercent,
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
          // Calculate R-multiple for analytics (risk-adjusted P&L metric)
          const riskPerPosition = position.stop_loss 
            ? Math.abs(position.entry_price - position.stop_loss) 
            : position.entry_price * 0.015; // Fallback to 1.5% risk
          const currentRMultiple = finalPnl / (riskPerPosition * position.quantity);
          
          // Categorize exit reason for analytics aggregation
          const getExitCategory = (reason: string): string => {
            if (["stop_loss", "trailing_stop_loss", "break_even"].includes(reason)) return "PROTECTIVE";
            if (["take_profit", "partial_tp", "smart_aits_rapid_decay"].includes(reason)) return "PROFIT";
            if (["flash_crash", "extreme_volatility", "divergence_volume_spike", "momentum_divergence_exit", "momentum_divergence_critical"].includes(reason)) return "EMERGENCY";
            if (["time_based_stop"].includes(reason)) return "TIMEOUT";
            if (["reversal_risk_high", "trend_reversal_bullish", "trend_reversal_bearish", "early_warning_1h_bullish", "early_warning_1h_bearish"].includes(reason)) return "TECHNICAL";
            return "OTHER";
          };
          const exitCategory = getExitCategory(closeReason);
          
          closedPositions.push({
            symbol: position.symbol,
            side: position.side,
            reason: closeReason,
            exitPrice: finalExitPrice,
            pnl: finalPnl,
            pnlPercent: finalPnlPercent,
            rMultiple: parseFloat(currentRMultiple.toFixed(2)),
            exitCategory,
          });
          positionLogger.trade(
            `Closed position ${position.id} - ${position.side} - ${closeReason} [${exitCategory}] at ${finalExitPrice} (P&L: $${finalPnl.toFixed(2)} / ${currentRMultiple.toFixed(2)}R)`,
          );
          
          // ============= GIVEBACK RATIO FORENSICS =============
          // Track peak-to-close decay for trailing stop optimization
          if (newPeakPnl > 0) {
            const givebackPercent = newPeakPnl > 0 ? ((newPeakPnl - finalPnlPercent) / newPeakPnl * 100) : 0;
            const givebackAbsolute = newPeakPnl - finalPnlPercent;
            const feeCostPercent = feeAmount > 0 ? (feeAmount / (position.entry_price * position.quantity) * 100) : 0;
            positionLogger.trade(
              `📊 GIVEBACK: peak=${newPeakPnl.toFixed(2)}% → close=${finalPnlPercent.toFixed(2)}% | giveback=${givebackPercent.toFixed(0)}% (${givebackAbsolute.toFixed(2)}pp) | fees=${feeCostPercent.toFixed(3)}% | reason=${closeReason}`
            );
            if (givebackPercent > 50 && newPeakPnl >= 0.30) {
              positionLogger.warn(
                `⚠️ HIGH_GIVEBACK: ${position.symbol} gave back ${givebackPercent.toFixed(0)}% of ${newPeakPnl.toFixed(2)}% peak (closed at ${finalPnlPercent.toFixed(2)}%) — trailing may be too loose`
              );
            }
          }
          
          // 🆕 HEDGE CLEANUP: If parent position had a hedge, close the hedge too
          if (position.hedge_position_id) {
            positionLogger.trade(`HEDGE CLEANUP: Closing hedge for parent ${position.side}`);
            
            // Get the hedge position to calculate its P&L
            // RACE CONDITION FIX: Query with status='active' to check if already closed
            const { data: hedgePos } = await supabase
              .from("positions")
              .select("*")
              .eq("id", position.hedge_position_id)
              .eq("status", "active")
              .maybeSingle();
            
            if (hedgePos) {
              // Calculate hedge P&L and R-multiple
              const hedgePnl = hedgePos.side === "BUY"
                ? (currentPrice - hedgePos.entry_price) * hedgePos.quantity
                : (hedgePos.entry_price - currentPrice) * hedgePos.quantity;
              const hedgePnlPercent = hedgePos.side === "BUY"
                ? ((currentPrice - hedgePos.entry_price) / hedgePos.entry_price) * 100
                : ((hedgePos.entry_price - currentPrice) / hedgePos.entry_price) * 100;
              const hedgeRiskPerUnit = hedgePos.stop_loss 
                ? Math.abs(hedgePos.entry_price - hedgePos.stop_loss) 
                : hedgePos.entry_price * 0.015;
              const hedgeRMultiple = hedgePnl / (hedgeRiskPerUnit * hedgePos.quantity);
              
              // Calculate fee-aware P&L for hedge close
              const hedgeFeeAwarePnL = calculateFeeAwarePnL(
                hedgePos.side,
                hedgePos.entry_price,
                currentPrice,
                hedgePos.quantity,
                hedgePos.trading_fee_percent
              );
              
              // Use optimistic locking with status='active' to prevent double-closing
              const { data: closedHedge, error: closeHedgeError } = await supabase
                .from("positions")
                .update({
                  status: "closed",
                  current_price: currentPrice,
                  exit_price: currentPrice,
                  realized_pnl: hedgeFeeAwarePnL.netPnl,
                  realized_pnl_percent: hedgeFeeAwarePnL.netPnlPercent,
                  closed_at: new Date().toISOString(),
                  close_reason: "parent_closed",
                  trading_fee_amount: hedgeFeeAwarePnL.totalFee,
                  trading_fee_percent: hedgeFeeAwarePnL.feeRatePercent,
                })
                .eq("id", position.hedge_position_id)
                .eq("status", "active")
                .select()
                .maybeSingle();
              
              if (!closeHedgeError && closedHedge) {
                hedgesClosed.push({
                  symbol: position.symbol,
                  parentSide: position.side,
                  hedgePositionId: position.hedge_position_id,
                  riskScore: 0,
                });
                positionLogger.success(`Hedge closed with parent: ${hedgePos.side}, P&L: $${hedgePnl.toFixed(2)} (${hedgePnlPercent.toFixed(2)}% / ${hedgeRMultiple.toFixed(2)}R)`);
              } else if (!closeHedgeError && !closedHedge) {
                // Hedge was already closed by its own SL/TP before parent cleanup
                positionLogger.info(`Hedge ${position.hedge_position_id} was already closed by its own SL/TP - no cleanup needed`);
              }
            } else {
              // Hedge not found as active - it was already closed
              positionLogger.info(`Hedge ${position.hedge_position_id} was already closed by its own exit logic - skipping cleanup`);
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
      meanReversionExits,
      volatilityAlerts,
      hedgesOpened,
      hedgesClosed,
      message: `Updated ${updates.length} positions, ${trailingStopUpdates.length} trailing stops, ${breakEvenUpdates.length} break-even stops, ${partialTpTaken.length} partial TPs, closed ${closedPositions.length} positions (${trendExits.length} trend exits, ${emergencyExits.length} emergency exits, ${meanReversionExits.length} MR exits), ${volatilityAlerts.length} volatility alerts, ${hedgesOpened.length} hedges opened`,
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
