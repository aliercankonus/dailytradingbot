import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import { ADX_THRESHOLDS, STOCHRSI_THRESHOLDS, RSI_THRESHOLDS, CONFIDENCE_THRESHOLDS, QUALITY_THRESHOLDS, STRATEGY_PARAMS, RISK_PARAMS, EMERGENCY_EXIT_PARAMS, TREND_VALIDATION_PARAMS, CORRELATION_PARAMS, ORDER_EXECUTION_PARAMS, VOLUME_RELAXATION_PARAMS, STRONG_TREND_HTF_BYPASS_PARAMS, TREND_CONTINUATION_TIGHT_STOPS, DEEP_STOCHRSI_HARD_GATE, CONTEXTUAL_TP_EXPANSION, FLASH_CRASH_BOUNCE_PROBE, CAPITULATION_BOUNCE_PROBE, GRADUATED_QUALITY_GATE, DYNAMIC_MAX_TRADES, TRAILING_DAILY_LIMIT, DYNAMIC_CONSISTENCY, VOLUME_FILTER, OBV_FILTER, VWAP_FILTER, SLIPPAGE_PROTECTION, MOMENTUM_POSITION_ADJ, ALIGNMENT_POSITION_ADJ, BOLLINGER_POSITION_ADJ, QUALITY_BASED_SIZING, LEGACY_STRATEGY_MULTIPLIERS, RISK_REWARD_FILTER, detectStrategyType, isMomentumStrategy, isMeanReversionStrategy } from "../_shared/constants.ts";
import { checkPositionCorrelation, getKnownCorrelation } from "../_shared/correlation.ts";
import { calculateATR, calculateHistoricalATRAvg } from "../_shared/indicators.ts";
import { 
  getStochRsiWeightedRsiScore,
  getConfidencePenalty,
  getAdxWeight,
  calculateUnifiedReversalScore,
  detectMarketRegime,
  type UnifiedReversalResult,
  type MarketRegime
} from "../_shared/scoring.ts";
import { buildMarketFeatureSnapshot } from "../_shared/market-feature-snapshot.ts";
import type { MarketFeatureSnapshot } from "../_shared/market-feature-snapshot.ts";
import { createLogger, logError } from "../_shared/logging.ts";
import { 
  getSymbolFilters, 
  roundToStepSize, 
  roundToTickSize,
  createBinanceSignature,
  sendBinanceApiErrorNotification,
  type SymbolFilters
} from "../_shared/binance.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-manual-execution',
};

// RSI momentum zone constraints documented in shared scoring module

// Initialize logger for execute-trade function
const logger = createLogger('execute-trade');

// Helper function to log execution rejections to signal_rejection_log
async function logExecutionRejection(
  supabase: any,
  userId: string,
  symbol: string,
  reason: string,
  signal: any,
  mfsSnapshot: MarketFeatureSnapshot | null,
  additionalData?: Record<string, unknown>
) {
  const symbolLogger = logger.forSymbol(symbol);
  try {
    // Write compact MFS summary to trend_data column instead of raw trendData
    const mfsSummary = mfsSnapshot ? {
      primaryTrend: mfsSnapshot.primaryTrend,
      adx: mfsSnapshot.adx,
      adxSlope: mfsSnapshot.adxSlope,
      atrPercent: mfsSnapshot.atrPercent,
      regime: mfsSnapshot.regime,
      momentumState: mfsSnapshot.momentumState,
      volumeScore: mfsSnapshot.volumeScore,
      reversalScore: mfsSnapshot.reversalScore,
      stochRsi4hK: mfsSnapshot.stochRsi['4h'].k,
      trueAlignmentScore: mfsSnapshot.trueAlignment?.score,
      bollinger1hSqueeze: mfsSnapshot.bollinger['1h'].squeeze,
      bollinger1hPercentB: mfsSnapshot.bollinger['1h'].percentB,
    } : null;

    await supabase.from('signal_rejection_log').insert({
      user_id: userId,
      symbol: symbol,
      rejection_reason: `EXECUTION: ${reason}`,
      filters_status: {
        signalId: signal?.id,
        signalType: signal?.signal_type,
        strategyName: signal?.strategy_name,
        qualityScore: signal?.indicators?.qualityScore,
        confidence: signal?.confidence_score,
        entryPrice: signal?.entry_price,
        stopLoss: signal?.stop_loss,
        takeProfit: signal?.take_profit,
        executionFilter: reason,
        ...additionalData
      },
      trend_data: mfsSummary,
      checked_at: new Date().toISOString()
    });
    symbolLogger.info(`📝 Logged execution rejection: ${reason}`);
  } catch (err) {
    logError(symbolLogger, err, 'Failed to log execution rejection');
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing required environment variables: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse request body with proper error handling
    let body: { signalId?: string; action?: string };
    try {
      body = await req.json();
    } catch (parseError) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid JSON in request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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
      logger.info(`Execute trade called by auto-trader for user: ${user.id}`);
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
      logger.info(`Execute trade called by user: ${user.id}`);
    }

    const { signalId, action } = body;
    logger.info(`Execute trade request: signalId=${signalId}, action=${action}, userId=${user.id}`);
    
    // Check if this is a manual execution (from UI button click)
    const isManualExecution = req.headers.get('x-manual-execution') === 'true';
    logger.info(`Is manual execution: ${isManualExecution}`);

    // Get Binance credentials - first try user-specific from vault, fallback to env
    let binanceApiKey = Deno.env.get('BINANCE_API_KEY');
    let binanceApiSecret = Deno.env.get('BINANCE_API_SECRET');

    // Try to get user-specific API keys from vault (encrypted)
    const { data: vaultCredentials, error: vaultError } = await supabase.rpc('get_user_binance_credentials', {
      p_user_id: user.id
    });
    
    if (!vaultError && vaultCredentials && vaultCredentials.length > 0 && 
        vaultCredentials[0].api_key && vaultCredentials[0].api_secret) {
      binanceApiKey = vaultCredentials[0].api_key;
      binanceApiSecret = vaultCredentials[0].api_secret;
      logger.info('Using user-specific encrypted Binance credentials from vault');
    }

    // Get risk parameters for the user
    const { data: riskParams, error: riskParamsError } = await supabase
      .from('risk_parameters')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (riskParamsError) {
      logger.error(`Error fetching risk parameters: ${riskParamsError.message}`);
      throw new Error('Failed to fetch risk parameters');
    }

    if (!riskParams) {
      throw new Error('Risk parameters not configured. Please configure your trading settings first.');
    }

    // Allow manual execution even if is_trading_enabled is false (bot is off)
    // But still require is_trading_enabled=true for automatic execution
    if (!riskParams.is_trading_enabled && !isManualExecution) {
      throw new Error('Trading is currently disabled. Please enable the bot to execute trades automatically.');
    }

    const isPaperTrading = riskParams.paper_trading_mode ?? true;
    logger.info(`Paper trading mode: ${isPaperTrading}`);

    if (!isPaperTrading && (!binanceApiKey || !binanceApiSecret)) {
      throw new Error('Binance API credentials not configured for live trading. Please add your API keys in Settings.');
    }

    // ============================================================
    // SMART RISK #1: DYNAMIC MAX TRADES
    // Adjusts max trades based on volatility and performance
    // ============================================================
    let effectiveMaxTrades = riskParams.max_open_trades;
    
    if (riskParams.dynamic_max_trades_enabled !== false) {
      // Get recent performance for dynamic adjustment
      const { data: recentTrades } = await supabase
        .from('positions')
        .select('realized_pnl')
        .eq('user_id', user.id)
        .eq('status', 'closed')
        .order('closed_at', { ascending: false })
        .limit(DYNAMIC_MAX_TRADES.LOOKBACK_COUNT);
      
      const recentWins = recentTrades?.filter(t => (t.realized_pnl || 0) > 0).length || 0;
      const recentWinRate = recentTrades?.length ? (recentWins / recentTrades.length) * 100 : 50;
      
      // Adjust based on recent performance
      if (recentWinRate >= DYNAMIC_MAX_TRADES.HIGH_WIN_RATE_THRESHOLD && recentTrades && recentTrades.length >= DYNAMIC_MAX_TRADES.MIN_TRADES_FOR_EVAL) {
        effectiveMaxTrades = Math.min(riskParams.max_open_trades + DYNAMIC_MAX_TRADES.HIGH_WIN_RATE_BONUS, DYNAMIC_MAX_TRADES.MAX_TRADES_CAP);
        logger.risk(`📈 Dynamic Max Trades: +${DYNAMIC_MAX_TRADES.HIGH_WIN_RATE_BONUS} bonus for ${recentWinRate.toFixed(0)}% win rate → ${effectiveMaxTrades}`);
      } else if (recentWinRate < DYNAMIC_MAX_TRADES.LOW_WIN_RATE_THRESHOLD && recentTrades && recentTrades.length >= DYNAMIC_MAX_TRADES.MIN_TRADES_FOR_EVAL) {
        effectiveMaxTrades = Math.max(Math.floor(riskParams.max_open_trades * DYNAMIC_MAX_TRADES.LOW_WIN_RATE_MULTIPLIER), DYNAMIC_MAX_TRADES.MIN_TRADES_FLOOR);
        logger.risk(`📉 Dynamic Max Trades: Reduced for ${recentWinRate.toFixed(0)}% win rate → ${effectiveMaxTrades}`);
      } else {
        logger.info(`📊 Dynamic Max Trades: Standard (${recentWinRate.toFixed(0)}% win rate) → ${effectiveMaxTrades}`);
      }
    }
    
    if (riskParams.current_open_trades >= effectiveMaxTrades) {
      throw new Error(`Maximum open trades limit reached (${riskParams.current_open_trades}/${effectiveMaxTrades})`);
    }

    // ============================================================
    // NEW: DAILY LOSS CIRCUIT BREAKER
    // ============================================================
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const lastResetDate = riskParams.last_loss_reset_date;
    let currentDailyLoss = riskParams.daily_realized_loss || 0;

    // Reset daily loss counter and peak P&L if it's a new day
    if (!lastResetDate || lastResetDate !== today) {
      logger.info(`Resetting daily counters (last reset: ${lastResetDate}, today: ${today})`);
      await supabase
        .from('risk_parameters')
        .update({
          daily_realized_loss: 0,
          daily_peak_pnl: 0,
          last_loss_reset_date: today
        })
        .eq('user_id', user.id);
      currentDailyLoss = 0;
    }

    // ============================================================
    // SMART RISK #3: TRAILING DAILY LIMIT
    // Lock profits by tightening daily loss limit when in profit
    // ============================================================
    let effectiveDailyLossLimit = riskParams.daily_loss_limit_percent;
    const dailyPeakPnl = riskParams.daily_peak_pnl || 0;
    
    if (riskParams.trailing_daily_limit_enabled !== false && dailyPeakPnl > 0) {
      // Lock 50% of peak daily gains
      const lockedProfit = dailyPeakPnl * 0.5;
      const lockedProfitPercent = (lockedProfit / riskParams.portfolio_value) * 100;
      
      // New limit = original limit minus locked profit (tighter limit)
      effectiveDailyLossLimit = Math.max(
        riskParams.daily_loss_limit_percent - lockedProfitPercent,
        1.0 // Minimum 1% limit
      );
      logger.risk(`🔒 Trailing Daily Limit: Peak P&L $${dailyPeakPnl.toFixed(2)} → Locking 50% → Effective limit: ${effectiveDailyLossLimit.toFixed(2)}% (was ${riskParams.daily_loss_limit_percent}%)`);
    }
    
    // Check circuit breaker: Stop trading if daily loss limit exceeded
    const dailyLossPercent = riskParams.portfolio_value > 0 
      ? (currentDailyLoss / riskParams.portfolio_value) * 100 
      : 0;
    if (dailyLossPercent >= effectiveDailyLossLimit) {
      logger.error(`❌ CIRCUIT BREAKER TRIGGERED: Daily loss ${dailyLossPercent.toFixed(2)}% >= limit ${effectiveDailyLossLimit.toFixed(2)}%`);
      throw new Error(`Daily loss limit reached (${dailyLossPercent.toFixed(2)}% of ${effectiveDailyLossLimit.toFixed(2)}%). Trading halted for today.`);
    }

    // Get signal details
    const { data: signal, error: signalError } = await supabase
      .from('trading_signals')
      .select('*')
      .eq('id', signalId)
      .maybeSingle();

    if (signalError) {
      logger.error(`Error fetching signal: ${signalError.message}`);
      throw new Error('Failed to fetch signal');
    }

    if (!signal) {
      throw new Error('Signal not found');
    }

    // ============================================================
    // PHASE 1 FIX #1: SIGNAL EXPIRY ENFORCEMENT
    // Check BEFORE any heavy computation - expired signals are stale
    // ============================================================
    if (signal.expires_at) {
      const expiryTime = new Date(signal.expires_at).getTime();
      const now = Date.now();
      if (now > expiryTime) {
        const expiredAgo = Math.round((now - expiryTime) / 1000 / 60); // minutes ago
        logger.gate(`⛔ SIGNAL EXPIRED: Signal expired ${expiredAgo} minutes ago`, false);
        await logExecutionRejection(supabase, user.id, signal.symbol, 'SIGNAL_EXPIRED', signal, null, { 
          expiresAt: signal.expires_at, 
          expiredAgoMinutes: expiredAgo,
          reason: 'Signal expired - market conditions may have changed'
        });
        throw new Error(`Signal expired ${expiredAgo} minutes ago - market conditions may have changed`);
      }
      logger.validation(`✓ Signal expiry check passed: expires in ${Math.round((expiryTime - now) / 1000 / 60)} minutes`, true);
    }

    // ============================================================
    // PHASE 1 FIX #2: SIGNAL OWNERSHIP VALIDATION
    // Prevent cross-user execution - security critical
    // Service role bypasses RLS, so we must verify ownership here
    // ============================================================
    if (signal.user_id !== user.id) {
      logger.error(`⛔ SECURITY: User ${user.id} attempted to execute signal owned by ${signal.user_id}`);
      await logExecutionRejection(supabase, user.id, signal.symbol, 'UNAUTHORIZED_SIGNAL', signal, null, {
        attemptedBy: user.id,
        signalOwner: signal.user_id,
        reason: 'Signal ownership mismatch - security violation'
      });
      throw new Error('Unauthorized: Signal does not belong to this user');
    }
    logger.validation(`✓ Signal ownership validated: signal belongs to requesting user`, true);

    logger.signal(`Executing trade for signal from strategy: ${signal.strategy_name || 'Unknown'}`);

    // ============================================================
    // STRATEGY PERFORMANCE FILTER (aligned with strategy-analyzer)
    // Block underperforming strategies, boost high performers
    // Uses centralized STRATEGY_PARAMS from _shared/constants.ts
    // ============================================================
    let strategyPerformanceBonus = 0; // Quality score bonus for high performers
    
    // Fetch with close_reason and peak_pnl_percent for fair win rate (aligned with strategy-analyzer)
    const BREAK_EVEN_CLOSE_REASONS = ['break_even', 'break_even_stop'];
    const PARTIAL_WIN_WEIGHT = 0.5;
    const PARTIAL_WIN_PEAK_THRESHOLD = 0.3; // % peak P&L to qualify as partial win
    
    const { data: strategyTrades } = await supabase
      .from('positions')
      .select('realized_pnl, close_reason, peak_pnl_percent')
      .eq('user_id', user.id)
      .eq('status', 'closed')
      .eq('strategy_name', signal.strategy_name || '')
      .order('closed_at', { ascending: false })
      .limit(20);
    
    if (strategyTrades && strategyTrades.length >= STRATEGY_PARAMS.MIN_TRADES_FOR_FILTER) {
      // Improved win rate: exclude break-even, credit partial wins (aligned with strategy-analyzer)
      let effectiveWins = 0;
      let countedTrades = 0;
      let breakEvenCount = 0;
      let partialWinCount = 0;
      
      for (const t of strategyTrades) {
        const pnl = t.realized_pnl || 0;
        const closeReason = t.close_reason || '';
        const peakPnl = t.peak_pnl_percent || 0;
        
        // Skip break-even trades entirely (capital preserved, not win or loss)
        if (BREAK_EVEN_CLOSE_REASONS.includes(closeReason)) {
          breakEvenCount++;
          continue;
        }
        
        countedTrades++;
        
        if (pnl > 0) {
          effectiveWins += 1;
        } else if (peakPnl >= PARTIAL_WIN_PEAK_THRESHOLD) {
          // Trade reached profit but closed at loss → partial win credit
          effectiveWins += PARTIAL_WIN_WEIGHT;
          partialWinCount++;
        }
      }
      
      const winRate = countedTrades > 0 ? (effectiveWins / countedTrades) * 100 : 0;
      
      if (winRate < STRATEGY_PARAMS.WIN_RATE_DISABLE_THRESHOLD) {
        logger.gate(`⛔ STRATEGY PERFORMANCE BLOCK: "${signal.strategy_name}" win rate ${winRate.toFixed(1)}% < ${STRATEGY_PARAMS.WIN_RATE_DISABLE_THRESHOLD}% (${effectiveWins.toFixed(1)}W/${countedTrades}T, ${breakEvenCount}BE, ${partialWinCount} partial)`, false);
        await logExecutionRejection(supabase, user.id, signal.symbol, 'Strategy Underperforming', signal, null, { strategyWinRate: winRate, threshold: STRATEGY_PARAMS.WIN_RATE_DISABLE_THRESHOLD, breakEvenExcluded: breakEvenCount, partialWins: partialWinCount });
        throw new Error(`Strategy "${signal.strategy_name}" underperforming (${winRate.toFixed(0)}% win rate) - trade cancelled`);
      }
      
      if (winRate >= STRATEGY_PARAMS.WIN_RATE_HIGH_PERFORMER) {
        strategyPerformanceBonus = STRATEGY_PARAMS.MAX_PERFORMANCE_BONUS;
        logger.info(`⭐ Strategy high performer bonus: "${signal.strategy_name}" win rate ${winRate.toFixed(1)}% (${breakEvenCount}BE excluded, ${partialWinCount} partial) → +${strategyPerformanceBonus} quality`);
      } else {
        logger.validation(`✓ Strategy performance check: "${signal.strategy_name}" win rate ${winRate.toFixed(1)}% >= ${STRATEGY_PARAMS.WIN_RATE_DISABLE_THRESHOLD}% (${breakEvenCount}BE excluded, ${partialWinCount} partial)`, true);
      }
    }

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
      logger.error(`Error checking existing positions: ${positionsError.message}`);
      throw new Error('Failed to check existing positions');
    }

    const openPositionsForSymbol = existingPositions?.length || 0;
    const maxPerSymbol = riskParams.max_trades_per_symbol || 1;

    if (openPositionsForSymbol >= maxPerSymbol) {
      logger.gate(`❌ SYMBOL LIMIT: ${signal.symbol} already has ${openPositionsForSymbol} open position(s), max is ${maxPerSymbol}`, false);
      throw new Error(`Maximum ${maxPerSymbol} position(s) per symbol. ${signal.symbol} already has ${openPositionsForSymbol} open.`);
    }

    logger.validation(`✓ Symbol check passed: ${signal.symbol} has ${openPositionsForSymbol}/${maxPerSymbol} positions`, true);

    // ============================================================
    // PHASE 3 FIX #1: ABSOLUTE CORRELATION CAP
    // Prevents accumulation of correlated positions that add up to excessive risk
    // ============================================================
    
    // Get ALL active positions for correlation check (not just same symbol)
    const { data: allActivePositions, error: allPositionsError } = await supabase
      .from('positions')
      .select('id, symbol, side, quantity, entry_price')
      .eq('user_id', user.id)
      .eq('status', 'active');
    
    if (allPositionsError) {
      logger.warn(`Failed to fetch all positions for correlation check: ${allPositionsError.message}`);
    }
    
    if (allActivePositions && allActivePositions.length > 0) {
      const signalSide = signal.signal_type === 'long' ? 'long' : 'short';
      
      // Check position correlation using shared module
      const correlationCheck = checkPositionCorrelation(
        signal.symbol,
        signalSide,
        allActivePositions.map(p => ({
          symbol: p.symbol,
          side: p.side,
          quantity: p.quantity,
          entry_price: p.entry_price
        })),
        CORRELATION_PARAMS.MAX_THRESHOLD,
        CORRELATION_PARAMS.MAX_SAME_DIRECTION
      );
      
      if (!correlationCheck.canOpen) {
        await logExecutionRejection(supabase, user.id, signal.symbol, 'CORRELATION_BLOCK', signal, null, {
          reason: correlationCheck.reason,
          riskScore: correlationCheck.riskScore,
          correlatedPositions: correlationCheck.correlatedPositions
        });
        throw new Error(`Correlation risk too high: ${correlationCheck.reason}`);
      }
      
      // Calculate total correlated exposure as percentage of portfolio
      let totalCorrelatedExposure = 0;
      for (const position of allActivePositions) {
        const correlation = getKnownCorrelation(signal.symbol, position.symbol);
        const positionValue = position.quantity * position.entry_price;
        const positionSide = position.side === 'buy' ? 'long' : 'short';
        
        // Only count same-direction correlated positions
        if (positionSide === signalSide && correlation >= 0.5) {
          totalCorrelatedExposure += (positionValue * correlation);
        }
      }
      
      const correlatedExposurePercent = riskParams.portfolio_value > 0 
        ? (totalCorrelatedExposure / riskParams.portfolio_value) * 100 
        : 0;
      
      logger.info(`📊 Correlation Analysis: Risk score ${correlationCheck.riskScore.toFixed(0)}/100, Correlated exposure: ${correlatedExposurePercent.toFixed(2)}%`);
      
      // Check absolute correlation cap
      if (correlatedExposurePercent >= CORRELATION_PARAMS.MAX_CORRELATED_EXPOSURE_PERCENT) {
        await logExecutionRejection(supabase, user.id, signal.symbol, 'CORRELATED_EXPOSURE_CAP', signal, null, {
          correlatedExposurePercent,
          maxAllowed: CORRELATION_PARAMS.MAX_CORRELATED_EXPOSURE_PERCENT,
          correlatedPositions: correlationCheck.correlatedPositions
        });
        throw new Error(`Correlated portfolio exposure (${correlatedExposurePercent.toFixed(2)}%) exceeds maximum (${CORRELATION_PARAMS.MAX_CORRELATED_EXPOSURE_PERCENT}%)`);
      }
      
      // Log correlation check result
      if (correlationCheck.correlatedPositions.length > 0) {
        logger.info(`   Correlated with: ${correlationCheck.correlatedPositions.map(p => `${p.symbol} (${(p.correlation * 100).toFixed(0)}%)`).join(', ')}`);
      }
      logger.validation(`✓ Correlation check passed: Risk ${correlationCheck.riskScore.toFixed(0)}/100, Exposure ${correlatedExposurePercent.toFixed(2)}%`, true);
    } else {
      logger.info(`📊 Correlation check skipped: No existing positions`);
    }

    // ============================================================
    // EARLY DUPLICATE CHECK - Prevent race condition by checking BEFORE order execution
    // ============================================================
    const { data: existingPosition } = await supabase
      .from('positions')
      .select('id')
      .eq('signal_id', signalId)
      .maybeSingle();

    if (existingPosition) {
      logger.info(`Signal ${signalId} already executed as position ${existingPosition.id}`);
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

    // Get real-time trend analysis before executing trade
    const { data: trendData, error: trendError } = await supabase.functions.invoke('calculate-trend', {
      body: { symbol: signal.symbol }
    });

    if (trendError) {
      logger.warn(`Failed to get current trend, using signal trend: ${trendError.message}`);
    }

    // MFS MIGRATED: Build MarketFeatureSnapshot ONCE — all gates read from this snapshot
    const mfs = buildMarketFeatureSnapshot(signal.symbol, trendData || {});

    const currentTrend = mfs.primaryTrend || signal.trend;
    const trendConsistency = mfs.trueAlignment?.score ?? 0;
    const atrPercent = mfs.atrPercent || 1.5;
    
    // ============================================================
    // ENHANCED TRUE ALIGNMENT FIELDS (v2.0)
    // Extract weighted components for smarter position sizing and validation
    // ============================================================
    const trueAlignment = mfs.trueAlignment || {};
    const tf4hConfidence = trueAlignment.tf4hConfidence ?? mfs.timeframes['4h'].confidence ?? 0;
    const tf1hConfidence = trueAlignment.tf1hConfidence ?? mfs.timeframes['1h'].confidence ?? 0;
    const adxContribution = trueAlignment.adxContribution ?? 0;
    const totalWeightedConfidence = trueAlignment.totalWeightedConfidence ?? 0;
    const weightedComponents = trueAlignment.weightedComponents || {};
    const neutralCapped = trueAlignment.neutralCapped === true;
    
    // Log enhanced alignment data for visibility
    if (Object.keys(weightedComponents).length > 0) {
      logger.info(`📊 TrueAlignment v2.0: score=${trendConsistency}, tf4h=${tf4hConfidence.toFixed(0)}, tf1h=${tf1hConfidence.toFixed(0)}, adxContrib=${adxContribution.toFixed(1)}, totalWeighted=${totalWeightedConfidence.toFixed(1)}${neutralCapped ? ' [NEUTRAL CAPPED]' : ''}`);
      logger.info(`   → Weighted: 4h=${weightedComponents.tf4hWeighted?.toFixed(1) ?? 0}, 1h=${weightedComponents.tf1hWeighted?.toFixed(1) ?? 0}, vol=${weightedComponents.volumeWeighted?.toFixed(1) ?? 0}, adx=${weightedComponents.adxWeighted?.toFixed(1) ?? 0}`);
    }
    
    // MFS MIGRATED: Bollinger data from MFS
    const bb1h = mfs.bollinger['1h'];
    const bb4h = mfs.bollinger['4h'];
    
    logger.info(`Current market trend: ${currentTrend}, Consistency: ${trendConsistency}, ATR: ${atrPercent}%, Signal: ${signal.signal_type}`);
    logger.info(`📊 Bollinger Bands: 1h squeeze=${bb1h.squeeze}, %B=${bb1h.percentB?.toFixed(1)}% | 4h squeeze=${bb4h.squeeze}, %B=${bb4h.percentB?.toFixed(1)}%`);

    // ============================================================
    // PHASE 2 FIX #1: CONFIDENCE-WEIGHTED TREND VALIDATION
    // Instead of binary trend mismatch rejection, use confidence-weighted logic:
    // - High confidence (>=70%): Strict trend-direction agreement required
    // - Low confidence (<70%): Allow counter-trend entries (pullbacks/reversals) with reduced size
    // This preserves discipline while avoiding over-filtering valid setups
    // ============================================================
    const signalDirection = signal.signal_type === 'long' ? 'BUY' : 'SELL';
    const trendConfidence = mfs.timeframes['4h'].confidence || 50;
    
    // Track if this is a counter-trend entry for position sizing
    let isCounterTrendEntry = false;
    let counterTrendPositionMultiplier = 1.0;
    
    // Check for trend mismatch
    const isTrendMismatch = (currentTrend === 'bullish' && signalDirection === 'SELL') ||
                            (currentTrend === 'bearish' && signalDirection === 'BUY');
    
    if (isTrendMismatch) {
      if (trendConfidence >= TREND_VALIDATION_PARAMS.STRICT_CONFIDENCE_THRESHOLD) {
        // High confidence trend = strict enforcement
        const mismatchReason = currentTrend === 'bullish' 
          ? 'Trend Mismatch (Bullish vs SHORT) - High Confidence'
          : 'Trend Mismatch (Bearish vs LONG) - High Confidence';
        await logExecutionRejection(supabase, user.id, signal.symbol, mismatchReason, signal, mfs, { 
          currentTrend, 
          signalDirection, 
          trendConfidence,
          threshold: TREND_VALIDATION_PARAMS.STRICT_CONFIDENCE_THRESHOLD,
          reason: 'High confidence trend requires strict direction agreement'
        });
        throw new Error(`Market trend is ${currentTrend} (${trendConfidence.toFixed(0)}% confidence) but signal is ${signalDirection} - trade cancelled`);
      } else {
        // Low confidence trend = allow counter-trend with warning and reduced size
        isCounterTrendEntry = true;
        counterTrendPositionMultiplier = TREND_VALIDATION_PARAMS.COUNTER_TREND_POSITION_MULTIPLIER;
        logger.warn(`⚠️ COUNTER-TREND ENTRY: ${currentTrend} trend (${trendConfidence.toFixed(0)}% confidence) vs ${signalDirection} signal`);
        logger.warn(`   → Allowed because confidence < ${TREND_VALIDATION_PARAMS.STRICT_CONFIDENCE_THRESHOLD}% (possible pullback/reversal setup)`);
        logger.warn(`   → Position size will be reduced to ${(counterTrendPositionMultiplier * 100).toFixed(0)}%`);
      }
    } else {
      logger.validation(`✓ Trend direction check passed: ${currentTrend} trend aligns with ${signalDirection} signal`, true);
    }

    // FILTER 2: Require trend consistency (dynamic threshold based on ADX and 1h confidence)
    // CENTRALIZED: Use shared extractor for consistent ADX access
    const adxValueForConsistency = mfs.adx;
    
    // Extract 1h confidence for dynamic threshold
    const confidence1hForConsistency = mfs.timeframes['1h'].confidence || 0;
    
    // Check if this is a neutral trend scenario (for lower threshold)
    // Aligned with quality threshold logic: neutral applies when strategy contains "neutral" OR trend is neutral/ranging
    const isNeutralStrategyForConsistency = signal.strategy_name?.toLowerCase().includes('neutral') || 
                                            currentTrend === 'neutral' || 
                                            currentTrend === 'ranging';
    
    // Dynamic consistency threshold (aligned with quality threshold logic)
    let dynamicMinConsistency = riskParams.min_trend_consistency || 60;
    
    if (isNeutralStrategyForConsistency) {
      dynamicMinConsistency = DYNAMIC_CONSISTENCY.NEUTRAL_STRATEGY_MIN;
      logger.info(`📊 Neutral Strategy: Consistency threshold lowered to ${dynamicMinConsistency}%`);
    } else if (confidence1hForConsistency >= CONFIDENCE_THRESHOLDS.HTF_EXCEPTION) {
      dynamicMinConsistency = DYNAMIC_CONSISTENCY.STRONG_1H_ALIGNMENT_MIN;
      logger.info(`📊 Strong 1h alignment (${confidence1hForConsistency.toFixed(0)}%): Consistency threshold lowered to ${dynamicMinConsistency}%`);
    } else if (adxValueForConsistency >= ADX_THRESHOLDS.STRONG) {
      dynamicMinConsistency = DYNAMIC_CONSISTENCY.STRONG_ADX_MIN;
      logger.info(`📊 Strong ADX (${adxValueForConsistency.toFixed(1)}): Consistency threshold lowered to ${dynamicMinConsistency}%`);
    }
    
    if (trendConsistency < dynamicMinConsistency) {
      await logExecutionRejection(supabase, user.id, signal.symbol, 'Low Trend Consistency', signal, mfs, { 
        trendConsistency, 
        minRequired: dynamicMinConsistency,
        adx: adxValueForConsistency,
        confidence1h: confidence1hForConsistency,
        isNeutralStrategy: isNeutralStrategyForConsistency
      });
      throw new Error(`Trend not consistent enough (${trendConsistency.toFixed(0)}%) - minimum required: ${dynamicMinConsistency}%`);
    }
    logger.validation(`✓ Consistency check passed: ${trendConsistency.toFixed(0)}% >= ${dynamicMinConsistency}% threshold`, true);

    // FILTER 3: Skip ranging markets for BUY/SELL signals
    if (currentTrend === 'ranging') {
      await logExecutionRejection(supabase, user.id, signal.symbol, 'Ranging Market', signal, mfs, { currentTrend });
      throw new Error('Market is ranging - trade cancelled to avoid choppy conditions');
    }

    // FILTER 4: Avoid high volatility (ATR > extreme threshold) - uses centralized EMERGENCY_EXIT_PARAMS
    if (atrPercent > EMERGENCY_EXIT_PARAMS.EXTREME_VOLATILITY_THRESHOLD) {
      await logExecutionRejection(supabase, user.id, signal.symbol, 'High Volatility', signal, trendData, { atrPercent, maxAllowed: EMERGENCY_EXIT_PARAMS.EXTREME_VOLATILITY_THRESHOLD });
      throw new Error(`Market volatility too high (ATR: ${atrPercent.toFixed(2)}%) - trade cancelled`);
    }

    // FILTER 5: ADX HARD GATE - Require minimum trend strength (uses centralized ADX_THRESHOLDS)
    // CENTRALIZED: Use shared extractor for consistent ADX access
    const adxValue = mfs.adx;
    
    if (adxValue < ADX_THRESHOLDS.MINIMUM) {
      logger.gate(`❌ ADX HARD GATE: ADX ${adxValue?.toFixed(1) || 0} < ${ADX_THRESHOLDS.MINIMUM} - trade cancelled`, false);
      await logExecutionRejection(supabase, user.id, signal.symbol, 'ADX Too Low', signal, trendData, { adx: adxValue, minRequired: ADX_THRESHOLDS.MINIMUM });
      throw new Error(`Trend strength too weak (ADX: ${adxValue?.toFixed(1) || 0}) - minimum required: ${ADX_THRESHOLDS.MINIMUM}`);
    }
    logger.gate(`✓ ADX hard gate passed: ${adxValue?.toFixed(1)} >= ${ADX_THRESHOLDS.MINIMUM}`, true);

    // ============================================================
    // FILTER 6: TIER 0 DEEP_STOCHRSI_HARD_GATE (Backup/Defense-in-Depth)
    // This is a BACKUP check in case a signal slips through strategy-analyzer
    // Blocks entries at extreme oscillator exhaustion to prevent late entries
    // ============================================================
    if (DEEP_STOCHRSI_HARD_GATE.ENABLED) {
      const stochRsiK4h = mfs.stochRsi['4h'].k ?? 50;
      const signalDirection = signal.signal_type;
      
      // Block LONG at extreme high (K >= 95) - overbought exhaustion
      if (stochRsiK4h >= DEEP_STOCHRSI_HARD_GATE.DEEP_OVERBOUGHT_K_THRESHOLD && signalDirection === 'long') {
        logger.gate(`❌ TIER 0 BACKUP GATE: StochRSI K=${stochRsiK4h.toFixed(1)} >= ${DEEP_STOCHRSI_HARD_GATE.DEEP_OVERBOUGHT_K_THRESHOLD} blocks LONG entry`, false);
        await logExecutionRejection(supabase, user.id, signal.symbol, 'TIER 0 (DEEP): StochRSI HARD GATE', signal, trendData, {
          stochRsiK4h,
          threshold: DEEP_STOCHRSI_HARD_GATE.DEEP_OVERBOUGHT_K_THRESHOLD,
          direction: signalDirection,
          reason: 'Extreme overbought exhaustion - BACKUP gate in execute-trade'
        });
        throw new Error(`TIER 0 BACKUP: StochRSI K (${stochRsiK4h.toFixed(1)}) at extreme high - LONG blocked`);
      }
      
      // Block SHORT at extreme low (K <= 5) - oversold exhaustion
      if (stochRsiK4h <= DEEP_STOCHRSI_HARD_GATE.DEEP_OVERSOLD_K_THRESHOLD && signalDirection === 'short') {
        logger.gate(`❌ TIER 0 BACKUP GATE: StochRSI K=${stochRsiK4h.toFixed(1)} <= ${DEEP_STOCHRSI_HARD_GATE.DEEP_OVERSOLD_K_THRESHOLD} blocks SHORT entry`, false);
        await logExecutionRejection(supabase, user.id, signal.symbol, 'TIER 0 (DEEP): StochRSI HARD GATE', signal, trendData, {
          stochRsiK4h,
          threshold: DEEP_STOCHRSI_HARD_GATE.DEEP_OVERSOLD_K_THRESHOLD,
          direction: signalDirection,
          reason: 'Extreme oversold exhaustion - BACKUP gate in execute-trade'
        });
        throw new Error(`TIER 0 BACKUP: StochRSI K (${stochRsiK4h.toFixed(1)}) at extreme low - SHORT blocked`);
      }
      
      logger.gate(`✓ TIER 0 backup gate passed: StochRSI K=${stochRsiK4h.toFixed(1)} not in extreme zone for ${signalDirection}`, true);
    }

    // ============================================================
    // DYNAMIC QUALITY THRESHOLD (aligned with strategy-analyzer)
    // Adjust quality threshold based on ADX, 1h confidence, and recovery mode
    // Uses centralized ADX_THRESHOLDS
    // ============================================================
    const isInRecoveryMode = riskParams.consecutive_losses >= riskParams.consecutive_loss_threshold;
    let dynamicQualityThreshold: number = QUALITY_THRESHOLDS.BASE_MIN; // Base threshold from shared constants
    
    // Extract 1h confidence for strong alignment exception
    const confidence1h = mfs.timeframes['1h'].confidence || 0;
    
    // Check if this is a neutral trend scenario (for lower threshold)
    // Neutral applies when: strategy name contains "neutral" OR current trend is neutral/ranging
    const isNeutralStrategy = signal.strategy_name?.toLowerCase().includes('neutral') || 
                              currentTrend === 'neutral' || 
                              currentTrend === 'ranging';
    
    if (isInRecoveryMode) {
      dynamicQualityThreshold = QUALITY_THRESHOLDS.BASE_MIN + QUALITY_THRESHOLDS.RECOVERY_BOOST; // Stricter in recovery mode
      logger.risk(`🔒 Recovery Mode: Quality threshold raised to ${dynamicQualityThreshold}`);
    } else if (isNeutralStrategy) {
      // Neutral strategies rely on HTF direction rather than 5m quality
      dynamicQualityThreshold = QUALITY_THRESHOLDS.NEUTRAL_MIN;
      logger.info(`📊 Neutral Strategy: Quality threshold lowered to ${dynamicQualityThreshold}`);
    } else if (confidence1h >= CONFIDENCE_THRESHOLDS.HTF_EXCEPTION) {
      // Strong 1h alignment exception (aligned with strategy-analyzer)
      dynamicQualityThreshold = QUALITY_THRESHOLDS.STRONG_1H_MIN;
      logger.info(`📊 Strong 1h alignment (${confidence1h.toFixed(0)}%): Quality threshold lowered to ${dynamicQualityThreshold}`);
    } else if (adxValue >= ADX_THRESHOLDS.EXCEPTIONAL) {
      dynamicQualityThreshold = QUALITY_THRESHOLDS.EXCEPTIONAL_ADX_MIN; // Relaxed in very strong trends
      logger.info(`📈 Exceptional ADX (${adxValue.toFixed(1)}): Quality threshold lowered to ${dynamicQualityThreshold}`);
    } else if (adxValue >= ADX_THRESHOLDS.STRONG) {
      dynamicQualityThreshold = QUALITY_THRESHOLDS.STRONG_ADX_MIN;
      logger.info(`📈 Strong ADX (${adxValue.toFixed(1)}): Quality threshold lowered to ${dynamicQualityThreshold}`);
    }
    
    // ============================================================
    // GRADUATED QUALITY THRESHOLD SYSTEM
    // Instead of hard blocking, use graduated position reduction for borderline scores
    // ADX >= 50 provides additional relaxation as strong trends confirm direction
    // ============================================================
    const signalQualityScore = signal.indicators?.qualityScore ?? 0;
    const hardMinQualityThreshold = GRADUATED_QUALITY_GATE.HARD_MIN;
    
    // ADX-based quality relaxation for very strong trends
    const { ADX_RELAXATION } = GRADUATED_QUALITY_GATE;
    const adxBasedQualityRelaxation = adxValue >= ADX_RELAXATION.ULTRA_STRONG_ADX ? ADX_RELAXATION.ULTRA_STRONG_RELAX : adxValue >= ADX_RELAXATION.STRONG_ADX ? ADX_RELAXATION.STRONG_RELAX : 0;
    const effectiveQualityThreshold = Math.max(hardMinQualityThreshold, dynamicQualityThreshold - adxBasedQualityRelaxation);
    
    let qualityPositionReduction = 0;
    
    if (signalQualityScore > 0 && signalQualityScore < hardMinQualityThreshold) {
      // HARD BLOCK: Below hard minimum is never allowed
      await logExecutionRejection(supabase, user.id, signal.symbol, 'Quality Score Too Low', signal, trendData, { 
        qualityScore: signalQualityScore, 
        threshold: hardMinQualityThreshold, 
        isRecoveryMode: isInRecoveryMode,
        confidence1h,
        isNeutralStrategy,
        adx: adxValue,
        reason: `Below hard minimum of ${hardMinQualityThreshold}`
      });
      throw new Error(`Signal quality score (${signalQualityScore}) below hard minimum (${hardMinQualityThreshold}) - trade cancelled`);
    } else if (signalQualityScore > 0 && signalQualityScore < GRADUATED_QUALITY_GATE.SOFT_ZONE_UPPER) {
      // SOFT GATE: HARD_MIN to SOFT_ZONE_UPPER → position reduction
      qualityPositionReduction = GRADUATED_QUALITY_GATE.SOFT_ZONE_REDUCTION_PERCENT;
      logger.info(`✓ GRADUATED QUALITY: Score ${signalQualityScore} in ${hardMinQualityThreshold}-${GRADUATED_QUALITY_GATE.SOFT_ZONE_UPPER} zone → -${qualityPositionReduction}% position (ADX=${adxValue.toFixed(1)}, relaxation=${adxBasedQualityRelaxation})`);
    } else if (signalQualityScore > 0 && signalQualityScore < effectiveQualityThreshold) {
      // SOFT GATE: SOFT_ZONE_UPPER to threshold → smaller position reduction
      qualityPositionReduction = GRADUATED_QUALITY_GATE.BORDERLINE_REDUCTION_PERCENT;
      logger.info(`✓ GRADUATED QUALITY: Score ${signalQualityScore} in ${GRADUATED_QUALITY_GATE.SOFT_ZONE_UPPER}-${effectiveQualityThreshold} zone → -${qualityPositionReduction}% position (ADX=${adxValue.toFixed(1)})`);
    } else {
      logger.validation(`✓ Quality check: ${signalQualityScore} >= ${effectiveQualityThreshold} threshold`, true);
    }

    // ============================================================
    // VOLUME SCORE VALIDATION (aligned with strategy-analyzer)
    // MFS MIGRATED: volumeScore now read from MFS aggregate scores
    // ============================================================
    const volumeScore = mfs.volumeScore ?? 0;
    const volumeConfirms = mfs.momentum?.volumeConfirms ?? false;
    
    // Warn on low volume but don't block unless extremely low
    if (volumeScore === 0 && !volumeConfirms) {
      logger.warn(`⚠️ Low volume score (${volumeScore}) - trade may have higher risk`);
    } else if (volumeScore >= 5) {
      logger.info(`✅ Volume confirms trend: score=${volumeScore}/10`);
    }

    // NOTE: Confidence filter removed - quality score calculation already incorporates
    // confidence penalties. Signal quality score (stored in indicators.qualityScore) is the
    // primary filter. Having a separate confidence gate was causing double-filtering and
    // blocking signals that passed quality threshold but had lower raw confidence scores.
    logger.info(`📊 Signal confidence: ${signal.confidence_score}% (no separate gate - quality score is primary filter)`);

    // ============================================================
    // PHASE 5: MOMENTUM STATE & FAKE BREAKOUT RISK CHECK
    // Adjust position size based on momentum quality from calculate-trend
    // ============================================================
    const momentumState = mfs.momentumState || 'none';
    const fakeBreakoutRisk = mfs.momentum?.fakeBreakoutRisk === true;
    const genuineMomentum = mfs.momentum?.genuineMomentum === true;
    
    // Start with 1.0 multiplier for momentum adjustments
    let momentumPositionMultiplier = 1.0;
    
    // Weak momentum: 10% position size reduction
    if (momentumState === 'none' && !isCounterTrendEntry) {
      momentumPositionMultiplier *= MOMENTUM_POSITION_ADJ.WEAK_MOMENTUM_MULTIPLIER;
      logger.warn(`⚠️ WEAK MOMENTUM: state=${momentumState} → position size reduced to ${(MOMENTUM_POSITION_ADJ.WEAK_MOMENTUM_MULTIPLIER * 100).toFixed(0)}%`);
    } else if (momentumState === 'mixed') {
      momentumPositionMultiplier *= MOMENTUM_POSITION_ADJ.MIXED_MOMENTUM_MULTIPLIER;
      logger.warn(`⚠️ MIXED MOMENTUM: state=${momentumState} → position size reduced to ${(MOMENTUM_POSITION_ADJ.MIXED_MOMENTUM_MULTIPLIER * 100).toFixed(0)}%`);
    }
    
    // Fake breakout risk: position size reduction
    if (fakeBreakoutRisk) {
      momentumPositionMultiplier *= MOMENTUM_POSITION_ADJ.FAKE_BREAKOUT_MULTIPLIER;
      logger.warn(`⚠️ FAKE BREAKOUT RISK: MACD expanding but ADX falling → additional position size reduction to ${(momentumPositionMultiplier * 100).toFixed(0)}%`);
    }
    
    // Genuine momentum: position size boost (cap to not exceed base)
    if (genuineMomentum && momentumState === 'confirmed') {
      momentumPositionMultiplier = Math.min(MOMENTUM_POSITION_ADJ.GENUINE_MOMENTUM_BOOST, momentumPositionMultiplier * MOMENTUM_POSITION_ADJ.GENUINE_MOMENTUM_BOOST);
      logger.info(`✅ GENUINE MOMENTUM: MACD expanding + ADX rising → position size boost to ${(momentumPositionMultiplier * 100).toFixed(0)}%`);
    }
    
    // ============================================================
    // ENHANCED TRUE ALIGNMENT POSITION SIZING (v2.0)
    // Use weighted components for smarter position sizing decisions
    // ============================================================
    let alignmentPositionMultiplier = 1.0;
    
    // Strong HTF alignment bonus: Both 4h and 1h weighted contributions are high
    const tf4hWeighted = weightedComponents.tf4hWeighted ?? 0;
    const tf1hWeighted = weightedComponents.tf1hWeighted ?? 0;
    const adxWeighted = weightedComponents.adxWeighted ?? 0;
    
    if (tf4hWeighted >= ALIGNMENT_POSITION_ADJ.PREMIUM_MIN_TF4H && tf1hWeighted >= ALIGNMENT_POSITION_ADJ.PREMIUM_MIN_TF1H && adxContribution >= ALIGNMENT_POSITION_ADJ.PREMIUM_MIN_ADX) {
      alignmentPositionMultiplier = ALIGNMENT_POSITION_ADJ.PREMIUM_MULTIPLIER;
      logger.info(`✅ PREMIUM ALIGNMENT: tf4h=${tf4hWeighted.toFixed(1)}, tf1h=${tf1hWeighted.toFixed(1)}, adx=${adxContribution.toFixed(1)} → +${((ALIGNMENT_POSITION_ADJ.PREMIUM_MULTIPLIER - 1) * 100).toFixed(0)}% position size`);
    } else if (tf4hWeighted >= ALIGNMENT_POSITION_ADJ.SOLID_MIN_TF4H && tf1hWeighted >= ALIGNMENT_POSITION_ADJ.SOLID_MIN_TF1H) {
      alignmentPositionMultiplier = ALIGNMENT_POSITION_ADJ.SOLID_MULTIPLIER;
      logger.info(`✅ SOLID ALIGNMENT: tf4h=${tf4hWeighted.toFixed(1)}, tf1h=${tf1hWeighted.toFixed(1)} → +${((ALIGNMENT_POSITION_ADJ.SOLID_MULTIPLIER - 1) * 100).toFixed(0)}% position size`);
    } else if (neutralCapped || tf4hConfidence < ALIGNMENT_POSITION_ADJ.WEAK_MAX_TF4H_CONF) {
      alignmentPositionMultiplier = ALIGNMENT_POSITION_ADJ.WEAK_MULTIPLIER;
      logger.warn(`⚠️ WEAK ALIGNMENT: neutralCapped=${neutralCapped}, tf4h=${tf4hConfidence.toFixed(0)} → ${((ALIGNMENT_POSITION_ADJ.WEAK_MULTIPLIER - 1) * 100).toFixed(0)}% position size`);
    }
    
    // Log final alignment impact
    if (alignmentPositionMultiplier !== 1.0) {
      logger.info(`📊 Alignment position adjustment: ${(alignmentPositionMultiplier * 100).toFixed(0)}%`);
    }
    
    // Log final momentum impact
    if (momentumPositionMultiplier !== 1.0) {
      logger.info(`📊 Momentum position adjustment: ${(momentumPositionMultiplier * 100).toFixed(0)}% (state=${momentumState}, fakeBreakout=${fakeBreakoutRisk}, genuine=${genuineMomentum})`);
    }

    // ============================================================
    // BOLLINGER BANDS FILTER - Squeeze/Breakout Detection
    // ============================================================
    let bollingerBoostMultiplier = 1.0;
    const signalSideForBB = signal.signal_type === 'long' ? 'BUY' : 'SELL';
    
    // Squeeze detection: Both 1h and 4h in squeeze = high probability breakout incoming
    const is1hSqueeze = bb1h.squeeze === true;
    const is4hSqueeze = bb4h.squeeze === true;
    const percentB1h = bb1h.percentB || 50;
    const percentB4h = bb4h.percentB || 50;
    
    if (is1hSqueeze && is4hSqueeze) {
      logger.info(`🔥 DOUBLE SQUEEZE detected: Both 1h and 4h bands contracted - breakout imminent`);
      bollingerBoostMultiplier = BOLLINGER_POSITION_ADJ.DOUBLE_SQUEEZE_BOOST;
    } else if (is1hSqueeze || is4hSqueeze) {
      logger.info(`📊 Single timeframe squeeze detected: 1h=${is1hSqueeze}, 4h=${is4hSqueeze}`);
      bollingerBoostMultiplier = BOLLINGER_POSITION_ADJ.SINGLE_SQUEEZE_BOOST;
    }
    
    if (signalSideForBB === 'BUY') {
      if (percentB1h > BOLLINGER_POSITION_ADJ.OVERBOUGHT_PERCENT_B) {
        logger.warn(`⚠️ BB Warning: Price above upper band (%B=${percentB1h.toFixed(1)}%) - potential overbought`);
        bollingerBoostMultiplier *= BOLLINGER_POSITION_ADJ.OVERBOUGHT_REDUCTION;
      } else if (percentB1h < BOLLINGER_POSITION_ADJ.LONG_LOWER_BAND_1H && percentB4h < BOLLINGER_POSITION_ADJ.LONG_LOWER_BAND_4H) {
        logger.info(`✅ BB confirms LONG: Price near lower band, good entry (%B 1h=${percentB1h.toFixed(1)}%, 4h=${percentB4h.toFixed(1)}%)`);
        bollingerBoostMultiplier *= BOLLINGER_POSITION_ADJ.MEAN_REVERSION_BOOST;
      }
    } else if (signalSideForBB === 'SELL') {
      if (percentB1h < BOLLINGER_POSITION_ADJ.OVERSOLD_PERCENT_B) {
        logger.warn(`⚠️ BB Warning: Price below lower band (%B=${percentB1h.toFixed(1)}%) - potential oversold`);
        bollingerBoostMultiplier *= BOLLINGER_POSITION_ADJ.OVERBOUGHT_REDUCTION;
      } else if (percentB1h > BOLLINGER_POSITION_ADJ.SHORT_UPPER_BAND_1H && percentB4h > BOLLINGER_POSITION_ADJ.SHORT_UPPER_BAND_4H) {
        logger.info(`✅ BB confirms SHORT: Price near upper band, good entry (%B 1h=${percentB1h.toFixed(1)}%, 4h=${percentB4h.toFixed(1)}%)`);
        bollingerBoostMultiplier *= BOLLINGER_POSITION_ADJ.MEAN_REVERSION_BOOST;
      }
    }
    
    // MFS MIGRATED: breakoutPotential read from snapshot instead of raw trendData
    const breakoutPotential = mfs.bollinger.squeezeBreakoutPotential || false;
    if (breakoutPotential) {
      logger.info(`🚀 HIGH BREAKOUT POTENTIAL detected - bands expanding after squeeze`);
      bollingerBoostMultiplier *= BOLLINGER_POSITION_ADJ.BREAKOUT_POTENTIAL_BOOST;
    }
    
    // Store Bollinger boost for position sizing
    (signal as any).bollingerBoostMultiplier = bollingerBoostMultiplier;
    logger.info(`📊 Final Bollinger Boost Multiplier: ${bollingerBoostMultiplier.toFixed(2)}x`);

    // ============================================================
    // VOLUME PROFILE FILTER - Fetch 24hr ticker data for volume analysis
    // ============================================================
    const ticker24hResponse = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${signal.symbol}`);
    if (!ticker24hResponse.ok) {
      const errorText = await ticker24hResponse.text();
      logger.error(`Binance 24hr ticker API error: ${errorText}`);
      throw new Error(`Failed to fetch 24hr ticker for ${signal.symbol}: ${ticker24hResponse.status}`);
    }
    const ticker24h = await ticker24hResponse.json();
    const currentPrice = parseFloat(ticker24h.lastPrice);
    const volume24h = parseFloat(ticker24h.volume); // Base asset volume
    const quoteVolume24h = parseFloat(ticker24h.quoteVolume); // USDT volume
    const priceChangePercent = parseFloat(ticker24h.priceChangePercent);

    logger.info(`📊 Volume Profile: 24h Volume=${volume24h.toFixed(2)}, Quote Volume=$${quoteVolume24h.toFixed(2)}, Price Change=${priceChangePercent.toFixed(2)}%`);

    // FILTER 6: Minimum volume requirement (avoid illiquid periods)
    // Require at least $10M USDT volume in last 24h for major pairs, $1M for others
    const isMainPair = VOLUME_FILTER.MAIN_PAIRS.includes(signal.symbol);
    const minQuoteVolume = isMainPair ? VOLUME_FILTER.MIN_QUOTE_VOLUME_MAIN : VOLUME_FILTER.MIN_QUOTE_VOLUME_OTHER;
    
    if (quoteVolume24h < minQuoteVolume) {
      await logExecutionRejection(supabase, user.id, signal.symbol, 'Insufficient 24h Volume', signal, trendData, { quoteVolume: quoteVolume24h, minRequired: minQuoteVolume, isMainPair });
      throw new Error(`Insufficient 24h volume ($${(quoteVolume24h/1_000_000).toFixed(2)}M < $${minQuoteVolume/1_000_000}M required) - trade cancelled to avoid illiquid market`);
    }
    logger.validation(`✓ Volume check passed: $${(quoteVolume24h/1_000_000).toFixed(2)}M >= $${minQuoteVolume/1_000_000}M minimum`, true);

    // Fetch recent klines to analyze volume profile (last 50 periods of 15m for OBV calculation)
    const klineResponse = await fetch(`https://api.binance.com/api/v3/klines?symbol=${signal.symbol}&interval=15m&limit=50`);
    if (!klineResponse.ok) {
      logger.warn('Failed to fetch klines for volume profile analysis, proceeding with basic checks');
    } else {
      const klines = await klineResponse.json();
      
      // Safety check for empty or invalid klines data
      if (!Array.isArray(klines) || klines.length < 20) {
        logger.warn('Insufficient kline data for volume analysis, skipping advanced filters');
      } else {
        const volumes = klines.map((k: any[]) => parseFloat(k[5])); // Volume is at index 5
        const closes = klines.map((k: any[]) => parseFloat(k[4])); // Close price at index 4
        
        // Calculate basic volume metrics with safety checks
        // Use closed candles only: exclude the last (still-forming) candle
        // The live candle has incomplete volume which causes false low-volume rejections
        const closedVolumes = volumes.slice(0, -1);
        const recentVolumes = closedVolumes.slice(-20);
        const avgVolume = recentVolumes.length > 0 
          ? recentVolumes.reduce((a: number, b: number) => a + b, 0) / recentVolumes.length 
          : 1;
        // Use last closed candle's volume for comparison (not the live forming candle)
        const currentVolume = closedVolumes.length > 0 ? closedVolumes[closedVolumes.length - 1] : 0;
        const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 1;

        logger.info(`📊 Last Closed 15m Volume: ${currentVolume.toFixed(2)}, Avg (20 closed): ${avgVolume.toFixed(2)}, Ratio: ${(volumeRatio * 100).toFixed(1)}% of avg`);

        // FILTER 7: Avoid extremely low volume periods (< 20% of average)
        // RELAXATION: Allow 10% of average if ADX is rising AND 30m+1h agree (trend forming)
        const adx = mfs.adx;
        const adxRising = mfs.adxSlope.isRising;
        const trend30m = mfs.timeframes['30m'].trend || "neutral";
        const trend1h = mfs.timeframes['1h'].trend || "neutral";
        const conf30m = mfs.timeframes['30m'].confidence || 0;
        const conf1h = mfs.timeframes['1h'].confidence || 0;
        
        // Check for trend formation conditions
        // FIX: Require 4h trend alignment for volume relaxation to prevent counter-trend entries
        const trend4h = mfs.timeframes['4h'].trend || "neutral";
        const signalDirection = signal.signal_type === 'long' ? 'bullish' : 'bearish';
        
        // FIX: Volume relaxation only applies when 4h trend matches signal direction (or is neutral)
        const htf4hAlignedOrNeutral = trend4h === "neutral" || trend4h === signalDirection;
        
        const isTrendForming = VOLUME_RELAXATION_PARAMS.ENABLED &&
          adx >= VOLUME_RELAXATION_PARAMS.MIN_ADX &&
          (!VOLUME_RELAXATION_PARAMS.REQUIRE_ADX_RISING || adxRising) &&
          trend30m !== "neutral" && trend1h !== "neutral" &&
          trend30m === trend1h &&  // 30m and 1h agree on direction
          conf30m >= VOLUME_FILTER.TREND_FORMATION_CONF_30M && conf1h >= VOLUME_FILTER.TREND_FORMATION_CONF_1H &&
          htf4hAlignedOrNeutral;
        
        // Determine minimum volume ratio based on conditions
        const minVolumeRatio = isTrendForming 
          ? VOLUME_RELAXATION_PARAMS.MIN_VOLUME_RATIO_WITH_TREND
          : VOLUME_FILTER.MIN_VOLUME_RATIO_DEFAULT;
        
        // Epsilon tolerance: prevent micro-cliff rejections from rounding/measurement noise
        const VOLUME_EPSILON = 0.005; // 0.5% tolerance
        if (volumeRatio < minVolumeRatio - VOLUME_EPSILON) {
          await logExecutionRejection(supabase, user.id, signal.symbol, 'Low Current Volume', signal, trendData, { 
            volumePercent: (volumeRatio * 100).toFixed(2),
            thresholdPercent: (minVolumeRatio * 100).toFixed(2),
            volumeRatio: volumeRatio.toFixed(3),
            threshold: minVolumeRatio.toFixed(3),
            effectiveThreshold: (minVolumeRatio - VOLUME_EPSILON).toFixed(3),
            isTrendForming,
            adx: adx.toFixed(1),
            adxRising,
            trend30m,
            trend1h,
            note: 'volumePercent = volume as % of 20-period avg (closed candles only). Epsilon tolerance: 0.5%'
          });
          throw new Error(`Current volume too low (${(volumeRatio * 100).toFixed(2)}% of avg < ${((minVolumeRatio - VOLUME_EPSILON) * 100).toFixed(2)}% effective threshold) - trade cancelled to avoid illiquid entry`);
        }
        
        // Log if trend formation relaxation was applied
        if (isTrendForming && volumeRatio < VOLUME_FILTER.MIN_VOLUME_RATIO_DEFAULT) {
          logger.info(`📊 VOLUME RELAXATION: Allowing entry at ${(volumeRatio * 100).toFixed(1)}% of avg due to trend formation (ADX=${adx.toFixed(1)} rising=${adxRising}, 30m=${trend30m}, 1h=${trend1h}, 4h=${trend4h})`);
          (signal as any).volumeRelaxationApplied = true;
          (signal as any).volumeRelaxationMultiplier = VOLUME_RELAXATION_PARAMS.POSITION_SIZE_MULTIPLIER;
        } else if (!isTrendForming && volumeRatio < VOLUME_FILTER.MIN_VOLUME_RATIO_DEFAULT && volumeRatio >= 0.1 && !htf4hAlignedOrNeutral) {
          logger.info(`📊 VOLUME RELAXATION BLOCKED: 4h trend (${trend4h}) opposes signal (${signalDirection}) - using standard volume threshold`);
        }

        if (volumeRatio > VOLUME_FILTER.VOLUME_SPIKE_RATIO) {
          logger.info(`⚡ VOLUME SPIKE detected: ${(volumeRatio * 100).toFixed(0)}% of avg (${volumeRatio.toFixed(2)}x) - high activity period`);
        }

        // ============================================================
        // OBV (On-Balance Volume) INDICATOR - Confirm trend with volume
        // ============================================================
        let obv = 0;
        const obvValues: number[] = [0];
        
        for (let i = 1; i < closes.length; i++) {
          if (closes[i] > closes[i - 1]) {
            obv += volumes[i]; // Price up = add volume
          } else if (closes[i] < closes[i - 1]) {
            obv -= volumes[i]; // Price down = subtract volume
          }
          // If price unchanged, OBV stays the same
          obvValues.push(obv);
        }

        // Calculate OBV trend (compare recent OBV to older OBV) with safety checks
        const recentOBV = obvValues.slice(-10);
        const olderOBV = obvValues.slice(-20, -10);
        const avgRecentOBV = recentOBV.length > 0 ? recentOBV.reduce((a, b) => a + b, 0) / recentOBV.length : 0;
        const avgOlderOBV = olderOBV.length > 0 ? olderOBV.reduce((a, b) => a + b, 0) / olderOBV.length : 0;
        
        const obvTrend = avgRecentOBV > avgOlderOBV ? 'rising' : avgRecentOBV < avgOlderOBV ? 'falling' : 'flat';
        const obvChange = avgOlderOBV !== 0 ? ((avgRecentOBV - avgOlderOBV) / Math.abs(avgOlderOBV)) * 100 : 0;

        // OBV slope (recent direction)
        const obvSlope = obvValues.length >= 5 
          ? (obvValues[obvValues.length - 1] - obvValues[obvValues.length - 5]) / 5 
          : 0;
        const obvDirection = obvSlope > 0 ? 'bullish' : obvSlope < 0 ? 'bearish' : 'neutral';

        logger.info(`📈 OBV Analysis: Current=${obv.toFixed(0)}, Trend=${obvTrend}, Change=${obvChange.toFixed(2)}%, Direction=${obvDirection}`);

        // FILTER 10: OBV trend confirmation
        // For LONG signals, OBV should be rising (bullish volume accumulation)
        // For SHORT signals, OBV should be falling (bearish volume distribution)
        const signalSide = signal.signal_type === 'long' ? 'BUY' : 'SELL';
        
        // FILTER 10: OBV trend confirmation - BLOCK on strong divergence
        if (signalSide === 'BUY' && obvDirection === 'bearish' && obvChange < -OBV_FILTER.STRONG_DIVERGENCE_BLOCK_PERCENT) {
          await logExecutionRejection(supabase, user.id, signal.symbol, 'OBV Divergence (LONG vs Bearish)', signal, trendData, { obvDirection, obvChange, signalSide });
          throw new Error(`OBV divergence: LONG signal but volume strongly bearish (${obvChange.toFixed(1)}% decline) - trade cancelled`);
        }
        
        if (signalSide === 'SELL' && obvDirection === 'bullish' && obvChange > OBV_FILTER.STRONG_DIVERGENCE_BLOCK_PERCENT) {
          await logExecutionRejection(supabase, user.id, signal.symbol, 'OBV Divergence (SHORT vs Bullish)', signal, trendData, { obvDirection, obvChange, signalSide });
          throw new Error(`OBV divergence: SHORT signal but volume strongly bullish (${obvChange.toFixed(1)}% rise) - trade cancelled`);
        }
        
        if (signalSide === 'BUY' && obvDirection === 'bearish' && obvChange < -OBV_FILTER.MODERATE_DIVERGENCE_WARN_PERCENT) {
          logger.warn(`⚠️ OBV DIVERGENCE: LONG signal but OBV is bearish (${obvChange.toFixed(2)}% decline)`);
        }
        if (signalSide === 'SELL' && obvDirection === 'bullish' && obvChange > OBV_FILTER.MODERATE_DIVERGENCE_WARN_PERCENT) {
          logger.warn(`⚠️ OBV DIVERGENCE: SHORT signal but OBV is bullish (${obvChange.toFixed(2)}% rise)`);
        }

        let obvBoostMultiplier = 1.0;
        
        if (signalSide === 'BUY' && obvDirection === 'bullish' && obvChange > OBV_FILTER.CONFIRMATION_PERCENT) {
          obvBoostMultiplier = OBV_FILTER.CONFIRMATION_BOOST;
          logger.info(`✅ OBV confirms LONG: Volume accumulation detected, boost=${obvBoostMultiplier}x`);
        } else if (signalSide === 'SELL' && obvDirection === 'bearish' && obvChange < -OBV_FILTER.CONFIRMATION_PERCENT) {
          obvBoostMultiplier = OBV_FILTER.CONFIRMATION_BOOST;
          logger.info(`✅ OBV confirms SHORT: Volume distribution detected, boost=${obvBoostMultiplier}x`);
        } else if ((signalSide === 'BUY' && obvDirection === 'bearish') || 
                   (signalSide === 'SELL' && obvDirection === 'bullish')) {
          obvBoostMultiplier = OBV_FILTER.DIVERGENCE_REDUCTION;
          logger.info(`⚠️ OBV divergence detected, reducing position size`);
        }

        // Store OBV boost for later use in position sizing
        (signal as any).obvBoostMultiplier = obvBoostMultiplier;

        // ============================================================
        // VWAP (Volume Weighted Average Price) - Entry Point Optimization
        // ============================================================
        const highs = klines.map((k: any[]) => parseFloat(k[2])); // High at index 2
        const lows = klines.map((k: any[]) => parseFloat(k[3])); // Low at index 3
        
        // Calculate VWAP: Sum(Typical Price * Volume) / Sum(Volume)
        let cumulativeTPV = 0; // Cumulative Typical Price * Volume
        let cumulativeVolume = 0;
        const vwapValues: number[] = [];
        
        for (let i = 0; i < closes.length; i++) {
          const typicalPrice = (highs[i] + lows[i] + closes[i]) / 3;
          cumulativeTPV += typicalPrice * volumes[i];
          cumulativeVolume += volumes[i];
          vwapValues.push(cumulativeTPV / cumulativeVolume);
        }
        
        const currentVWAP = vwapValues[vwapValues.length - 1] || currentPrice;
        const vwapDeviation = currentVWAP > 0 ? ((currentPrice - currentVWAP) / currentVWAP) * 100 : 0;
        
        // Calculate VWAP bands (standard deviation from VWAP) with safety check
        const vwapDiffs = closes.map((c: number, i: number) => Math.pow(c - (vwapValues[i] || currentPrice), 2));
        const vwapStdDev = vwapDiffs.length > 0 
          ? Math.sqrt(vwapDiffs.reduce((a: number, b: number) => a + b, 0) / vwapDiffs.length)
          : 0;
        const vwapUpperBand = currentVWAP + (vwapStdDev * 2);
        const vwapLowerBand = currentVWAP - (vwapStdDev * 2);
        
        logger.info(`📈 VWAP Analysis: VWAP=$${currentVWAP.toFixed(2)}, Current=$${currentPrice.toFixed(2)}, Deviation=${vwapDeviation.toFixed(2)}%`);
        logger.info(`📈 VWAP Bands: Lower=$${vwapLowerBand.toFixed(2)}, Upper=$${vwapUpperBand.toFixed(2)}`);
        
        // VWAP position analysis for entry optimization
        let vwapBoostMultiplier = 1.0;
        const vwapSignalSide = signal.signal_type === 'long' ? 'BUY' : 'SELL';
        
        if (vwapSignalSide === 'BUY') {
          if (currentPrice < currentVWAP) {
            const discountPercent = Math.abs(vwapDeviation);
            if (discountPercent > VWAP_FILTER.EXCELLENT_ENTRY_DEVIATION_PERCENT) {
              vwapBoostMultiplier = VWAP_FILTER.EXCELLENT_ENTRY_BOOST;
              logger.info(`✅ VWAP confirms LONG: Price ${discountPercent.toFixed(2)}% below VWAP - excellent entry`);
            } else {
              vwapBoostMultiplier = VWAP_FILTER.GOOD_ENTRY_BOOST;
              logger.info(`✅ VWAP supports LONG: Price slightly below VWAP - good entry`);
            }
          } else if (currentPrice > vwapUpperBand) {
            const adxValue = mfs.adx;
            const ADX_EXCEPTION_THRESHOLD = VWAP_FILTER.ADX_EXCEPTION_THRESHOLD;
            
            // Smart guards: ADX rising OR momentum direction agrees with trade
            const adxRising = mfs.adxSlope.isRising;
            const macdHistogram = mfs.momentum?.macdHistogram ?? 0;
            const momentumDirectionAgrees = macdHistogram > 0; // LONG needs positive MACD histogram
            
            // Valid exception: ADX >= 25 AND (ADX rising OR momentum agrees)
            const hasValidException = adxValue >= ADX_EXCEPTION_THRESHOLD && (adxRising || momentumDirectionAgrees);
            const hasWeakException = adxValue >= ADX_EXCEPTION_THRESHOLD && !adxRising && !momentumDirectionAgrees;
            
            // Graduated exception: ADX 22-25 with ALL confirmations (rising + momentum + quality)
            const ADX_GRADUATED_MIN = VWAP_FILTER.ADX_GRADUATED_MIN;
            const qualityScore = signal.indicators?.qualityScore || signalQualityScore || 0;
            const hasGraduatedException = adxValue >= ADX_GRADUATED_MIN && adxValue < ADX_EXCEPTION_THRESHOLD && 
              adxRising && momentumDirectionAgrees && qualityScore >= VWAP_FILTER.GRADUATED_MIN_QUALITY;
            
            if (hasValidException) {
              const guardReason = adxRising ? 'ADX rising' : 'momentum direction agrees';
              vwapBoostMultiplier = VWAP_FILTER.VALID_EXCEPTION_MULTIPLIER;
              logger.warn(`⚠️ VWAP EXCEPTION: Price $${currentPrice.toFixed(2)} above upper band, ADX=${adxValue.toFixed(1)} >= ${ADX_EXCEPTION_THRESHOLD}, guard=${guardReason} - allowing LONG with ${(VWAP_FILTER.VALID_EXCEPTION_MULTIPLIER * 100).toFixed(0)}% size`);
            } else if (hasWeakException) {
              vwapBoostMultiplier = VWAP_FILTER.WEAK_EXCEPTION_MULTIPLIER;
              logger.warn(`⚠️ VWAP WEAK EXCEPTION: Price $${currentPrice.toFixed(2)} above upper band, ADX=${adxValue.toFixed(1)} >= ${ADX_EXCEPTION_THRESHOLD} but no guard passed - allowing LONG with ${(VWAP_FILTER.WEAK_EXCEPTION_MULTIPLIER * 100).toFixed(0)}% size`);
            } else if (hasGraduatedException) {
              vwapBoostMultiplier = VWAP_FILTER.GRADUATED_EXCEPTION_MULTIPLIER;
              logger.warn(`⚠️ VWAP GRADUATED EXCEPTION: Price $${currentPrice.toFixed(2)} above upper band, ADX=${adxValue.toFixed(1)} in ${VWAP_FILTER.ADX_GRADUATED_MIN}-${ADX_EXCEPTION_THRESHOLD} zone with all confirmations (rising=${adxRising}, macd=${macdHistogram.toFixed(4)}, quality=${qualityScore}) - allowing LONG with ${(VWAP_FILTER.GRADUATED_EXCEPTION_MULTIPLIER * 100).toFixed(0)}% size`);
            } else {
              // Calculate band deviation for audit accuracy
              const vwapBandDeviationPct = vwapUpperBand > 0 ? ((currentPrice - vwapUpperBand) / vwapUpperBand) * 100 : 0;
              
              // Log why graduated exception failed if in the 22-25 zone
              const graduatedFailReason = adxValue >= ADX_GRADUATED_MIN && adxValue < ADX_EXCEPTION_THRESHOLD 
                ? ` (graduated failed: rising=${adxRising}, macdAligns=${momentumDirectionAgrees}, quality=${qualityScore}>=${VWAP_FILTER.GRADUATED_MIN_QUALITY}?${qualityScore >= VWAP_FILTER.GRADUATED_MIN_QUALITY})`
                : '';
              
              logger.error(`❌ VWAP OVEREXTENSION: Price $${currentPrice.toFixed(2)} above upper VWAP band $${vwapUpperBand.toFixed(2)} (ADX=${adxValue.toFixed(1)} < ${ADX_EXCEPTION_THRESHOLD}, adxRising=${adxRising}, macdHistogram=${macdHistogram.toFixed(4)})${graduatedFailReason}`);
              await logExecutionRejection(supabase, user.id, signal.symbol, 'VWAP Overextension (LONG)', signal, trendData, { 
                currentPrice, 
                vwapMid: currentVWAP,
                vwapMidDeviationPct: vwapDeviation,
                vwapUpperBand, 
                vwapBandDeviationPct,
                adx: adxValue, 
                adxRising, 
                macdHistogram,
                qualityScore,
                graduatedEligible: adxValue >= ADX_GRADUATED_MIN,
                graduatedFailReason: !adxRising ? 'ADX not rising' : !momentumDirectionAgrees ? 'MACD not aligned' : qualityScore < VWAP_FILTER.GRADUATED_MIN_QUALITY ? `Quality < ${VWAP_FILTER.GRADUATED_MIN_QUALITY}` : 'Unknown'
              });
              throw new Error(`Price above upper VWAP band - overextended LONG entry blocked (ADX < ${ADX_EXCEPTION_THRESHOLD} or no guard passed)`);
            }
          } else if (vwapDeviation > VWAP_FILTER.MODERATE_DEVIATION_PERCENT) {
            vwapBoostMultiplier = VWAP_FILTER.MODERATE_REDUCTION;
            logger.info(`📊 VWAP: Price ${vwapDeviation.toFixed(2)}% above VWAP - reducing position`);
          } else if (vwapDeviation > VWAP_FILTER.SLIGHT_DEVIATION_PERCENT) {
            vwapBoostMultiplier = VWAP_FILTER.SLIGHT_REDUCTION;
            logger.info(`📊 VWAP neutral: Price ${vwapDeviation.toFixed(2)}% above VWAP`);
          }
        } else if (vwapSignalSide === 'SELL') {
          if (currentPrice > currentVWAP) {
            const premiumPercent = vwapDeviation;
            if (premiumPercent > VWAP_FILTER.EXCELLENT_ENTRY_DEVIATION_PERCENT) {
              vwapBoostMultiplier = VWAP_FILTER.EXCELLENT_ENTRY_BOOST;
              logger.info(`✅ VWAP confirms SHORT: Price ${premiumPercent.toFixed(2)}% above VWAP - excellent entry`);
            } else {
              vwapBoostMultiplier = VWAP_FILTER.GOOD_ENTRY_BOOST;
              logger.info(`✅ VWAP supports SHORT: Price slightly above VWAP - good entry`);
            }
          } else if (currentPrice < vwapLowerBand) {
            const adxValue = mfs.adx;
            const ADX_EXCEPTION_THRESHOLD = VWAP_FILTER.ADX_EXCEPTION_THRESHOLD;
            const adxRising = mfs.adxSlope.isRising;
            const macdHistogram = mfs.momentum?.macdHistogram ?? 0;
            const momentumDirectionAgrees = macdHistogram < 0;
            const hasValidException = adxValue >= ADX_EXCEPTION_THRESHOLD && (adxRising || momentumDirectionAgrees);
            const hasWeakException = adxValue >= ADX_EXCEPTION_THRESHOLD && !adxRising && !momentumDirectionAgrees;
            const ADX_GRADUATED_MIN = VWAP_FILTER.ADX_GRADUATED_MIN;
            const qualityScore = signal.indicators?.qualityScore || signalQualityScore || 0;
            const hasGraduatedException = adxValue >= ADX_GRADUATED_MIN && adxValue < ADX_EXCEPTION_THRESHOLD && 
              adxRising && momentumDirectionAgrees && qualityScore >= VWAP_FILTER.GRADUATED_MIN_QUALITY;
            
            if (hasValidException) {
              const guardReason = adxRising ? 'ADX rising' : 'momentum direction agrees';
              vwapBoostMultiplier = VWAP_FILTER.VALID_EXCEPTION_MULTIPLIER;
              logger.warn(`⚠️ VWAP EXCEPTION: Price $${currentPrice.toFixed(2)} below lower band, ADX=${adxValue.toFixed(1)} >= ${ADX_EXCEPTION_THRESHOLD}, guard=${guardReason} - allowing SHORT with ${(VWAP_FILTER.VALID_EXCEPTION_MULTIPLIER * 100).toFixed(0)}% size`);
            } else if (hasWeakException) {
              vwapBoostMultiplier = VWAP_FILTER.WEAK_EXCEPTION_MULTIPLIER;
              logger.warn(`⚠️ VWAP WEAK EXCEPTION: Price $${currentPrice.toFixed(2)} below lower band, ADX=${adxValue.toFixed(1)} >= ${ADX_EXCEPTION_THRESHOLD} but no guard passed - allowing SHORT with ${(VWAP_FILTER.WEAK_EXCEPTION_MULTIPLIER * 100).toFixed(0)}% size`);
            } else if (hasGraduatedException) {
              vwapBoostMultiplier = VWAP_FILTER.GRADUATED_EXCEPTION_MULTIPLIER;
              logger.warn(`⚠️ VWAP GRADUATED EXCEPTION: Price $${currentPrice.toFixed(2)} below lower band, ADX=${adxValue.toFixed(1)} in ${ADX_GRADUATED_MIN}-${ADX_EXCEPTION_THRESHOLD} zone with all confirmations - allowing SHORT with ${(VWAP_FILTER.GRADUATED_EXCEPTION_MULTIPLIER * 100).toFixed(0)}% size`);
            } else {
              const vwapBandDeviationPct = vwapLowerBand > 0 ? ((currentPrice - vwapLowerBand) / vwapLowerBand) * 100 : 0;
              const graduatedFailReason = adxValue >= ADX_GRADUATED_MIN && adxValue < ADX_EXCEPTION_THRESHOLD 
                ? ` (graduated failed: rising=${adxRising}, macdAligns=${momentumDirectionAgrees}, quality=${qualityScore}>=${VWAP_FILTER.GRADUATED_MIN_QUALITY}?${qualityScore >= VWAP_FILTER.GRADUATED_MIN_QUALITY})`
                : '';
              logger.error(`❌ VWAP OVEREXTENSION: Price $${currentPrice.toFixed(2)} below lower VWAP band $${vwapLowerBand.toFixed(2)} (ADX=${adxValue.toFixed(1)} < ${ADX_EXCEPTION_THRESHOLD})${graduatedFailReason}`);
              await logExecutionRejection(supabase, user.id, signal.symbol, 'VWAP Overextension (SHORT)', signal, trendData, { 
                currentPrice, vwapMid: currentVWAP, vwapMidDeviationPct: vwapDeviation, vwapLowerBand, vwapBandDeviationPct,
                adx: adxValue, adxRising, macdHistogram, qualityScore,
                graduatedEligible: adxValue >= ADX_GRADUATED_MIN,
                graduatedFailReason: !adxRising ? 'ADX not rising' : !momentumDirectionAgrees ? 'MACD not aligned' : qualityScore < VWAP_FILTER.GRADUATED_MIN_QUALITY ? `Quality < ${VWAP_FILTER.GRADUATED_MIN_QUALITY}` : 'Unknown'
              });
              throw new Error(`Price below lower VWAP band - oversold SHORT entry blocked (ADX < ${ADX_EXCEPTION_THRESHOLD} or no guard passed)`);
            }
          } else if (vwapDeviation < -VWAP_FILTER.MODERATE_DEVIATION_PERCENT) {
            vwapBoostMultiplier = VWAP_FILTER.MODERATE_REDUCTION;
            logger.info(`📊 VWAP: Price ${Math.abs(vwapDeviation).toFixed(2)}% below VWAP - reducing position`);
          } else if (vwapDeviation < -VWAP_FILTER.SLIGHT_DEVIATION_PERCENT) {
            vwapBoostMultiplier = VWAP_FILTER.SLIGHT_REDUCTION;
            logger.info(`📊 VWAP neutral: Price ${Math.abs(vwapDeviation).toFixed(2)}% below VWAP`);
          }
        }
        
        (signal as any).vwapBoostMultiplier = vwapBoostMultiplier;
        logger.info(`📈 Final VWAP Boost Multiplier: ${vwapBoostMultiplier.toFixed(2)}x`);
      } // Close inner else block (klines valid)
    } // Close outer else block (klineResponse ok)

    // ============================================================
    // SLIPPAGE PROTECTION - Pre-trade price validation
    // ============================================================
    const maxSlippagePercent = SLIPPAGE_PROTECTION.MAX_PRE_SLIPPAGE_PERCENT;
    const signalEntryPrice = signal.entry_price || currentPrice;
    const priceDeviation = Math.abs((currentPrice - signalEntryPrice) / signalEntryPrice) * 100;

    logger.info(`💱 Slippage Check: Signal Entry=$${signalEntryPrice.toFixed(2)}, Current=$${currentPrice.toFixed(2)}, Deviation=${priceDeviation.toFixed(3)}%`);

    if (priceDeviation > maxSlippagePercent) {
      await logExecutionRejection(supabase, user.id, signal.symbol, 'Price Slippage', signal, trendData, { priceDeviation, maxAllowed: maxSlippagePercent, signalEntryPrice, currentPrice });
      throw new Error(`Price moved ${priceDeviation.toFixed(2)}% since signal (max ${maxSlippagePercent}%) - trade cancelled to avoid slippage`);
    }
    logger.validation(`✓ Pre-trade slippage check passed: ${priceDeviation.toFixed(3)}% < ${maxSlippagePercent}% max`, true);

    // Fetch order book depth for additional slippage analysis
    const depthResponse = await fetch(`https://api.binance.com/api/v3/depth?symbol=${signal.symbol}&limit=10`);
    if (depthResponse.ok) {
      const depth = await depthResponse.json();
      const bestBid = parseFloat(depth.bids[0][0]);
      const bestAsk = parseFloat(depth.asks[0][0]);
      const spread = ((bestAsk - bestBid) / bestBid) * 100;
      
      logger.info(`📖 Order Book: Bid=$${bestBid.toFixed(2)}, Ask=$${bestAsk.toFixed(2)}, Spread=${spread.toFixed(4)}%`);

      // FILTER 9: Wide spread protection (avoid illiquid order books)
      const maxSpreadPercent = SLIPPAGE_PROTECTION.MAX_SPREAD_PERCENT;
      if (spread > maxSpreadPercent) {
        await logExecutionRejection(supabase, user.id, signal.symbol, 'Wide Spread', signal, trendData, { spread, maxAllowed: maxSpreadPercent, bestBid, bestAsk });
        throw new Error(`Order book spread too wide (${spread.toFixed(3)}% > ${maxSpreadPercent}%) - trade cancelled to avoid slippage`);
      }
      logger.validation(`✓ Spread check passed: ${spread.toFixed(4)}% < ${maxSpreadPercent}% max`, true);
    }

    // ============================================================
    // UNIFIED REVERSAL SCORE SYSTEM - Three-tier decision
    // BLOCK (>=60): Cancel trade
    // REDUCE (40-60): Proceed with 50% position size
    // NORMAL (<40): Full position size
    // ============================================================
    const executionMfs = mfs; // MFS already built above — reuse
    const unifiedReversalResult = calculateUnifiedReversalScore(executionMfs, signal.signal_type);
    logger.info(`🔄 Unified Reversal: ${unifiedReversalResult.score}/100 (ADX weight: ${unifiedReversalResult.adxWeight}) → ${unifiedReversalResult.decision}`);
    if (unifiedReversalResult.reasons.length > 0) {
      logger.info(`   Factors: ${unifiedReversalResult.reasons.slice(0, 3).join(', ')}`);
    }
    
    // Store reversal position multiplier for position sizing
    let reversalPositionMultiplier = unifiedReversalResult.positionSizeMultiplier;
    
    if (unifiedReversalResult.decision === "BLOCK") {
      await logExecutionRejection(supabase, user.id, signal.symbol, 'Unified Reversal BLOCK', signal, trendData, { reversalScore: unifiedReversalResult.score, reasons: unifiedReversalResult.reasons, adxWeight: unifiedReversalResult.adxWeight });
      throw new Error(`🛑 Unified Reversal BLOCK (${unifiedReversalResult.score}/100) - ${unifiedReversalResult.reasons.slice(0, 2).join(', ')} - trade cancelled`);
    }
    
    if (unifiedReversalResult.decision === "REDUCE") {
      logger.warn(`⚠️ Unified Reversal REDUCE: 50% position size due to score ${unifiedReversalResult.score}/100`);
    } else {
      logger.validation(`✓ Unified reversal check passed: ${unifiedReversalResult.score}/100 < 40 threshold`, true);
    }

    // Use strategy's configured stop loss and take profit from signal
    let stopLoss = signal.stop_loss;
    let takeProfit = signal.take_profit;

    // Validate SL/TP are present
    if (!stopLoss || !takeProfit) {
      throw new Error(`Signal missing stop_loss (${stopLoss}) or take_profit (${takeProfit})`);
    }

    // ============================================================
    // FLASH CRASH BOUNCE PROBE / CAPITULATION BOUNCE - Ultra-tight SL/TP
    // These probes use tighter stops and specific TP targets for flash reversals
    // ============================================================
    const flashCrashProbe = signal.indicators?.flashCrashBounceProbe;
    const capitulationProbe = signal.indicators?.capitulationBounceProbe;
    
    // Calculate ATR percent for stop/TP calculations
    const atrPercentForProbes = mfs.atrPercent || 1.5;
    
    if (flashCrashProbe?.active) {
      // FLASH CRASH BOUNCE: Ultra-tight stop, wider TP
      const flashCrashStop = Math.min(
        atrPercentForProbes * FLASH_CRASH_BOUNCE_PROBE.STOP_LOSS_ATR_MULTIPLIER,
        FLASH_CRASH_BOUNCE_PROBE.STOP_LOSS_MAX_PERCENT
      );
      
      // Apply ultra-tight stop
      stopLoss = currentPrice * (1 - flashCrashStop / 100);
      
      // Apply wider TP for bounce capture
      const flashCrashTP = Math.max(
        FLASH_CRASH_BOUNCE_PROBE.TAKE_PROFIT_MIN_PERCENT,
        Math.min(
          atrPercentForProbes * FLASH_CRASH_BOUNCE_PROBE.TAKE_PROFIT_ATR_MULTIPLIER,
          FLASH_CRASH_BOUNCE_PROBE.TAKE_PROFIT_MAX_PERCENT
        )
      );
      takeProfit = currentPrice * (1 + flashCrashTP / 100);
      
      logger.info(`🔥 FLASH CRASH BOUNCE PROBE SL/TP OVERRIDE:`);
      logger.info(`   → Stop Loss: ${flashCrashStop.toFixed(2)}% (ultra-tight for flash crash)`);
      logger.info(`   → Take Profit: ${flashCrashTP.toFixed(2)}% (wider for bounce capture)`);
      logger.info(`   → Entry: $${currentPrice.toFixed(2)}, SL: $${stopLoss.toFixed(2)}, TP: $${takeProfit.toFixed(2)}`);
    } else if (capitulationProbe?.active) {
      // CAPITULATION BOUNCE: Tight stop, modest TP
      const capStop = Math.min(
        atrPercentForProbes * CAPITULATION_BOUNCE_PROBE.STOP_LOSS_ATR_MULTIPLIER,
        CAPITULATION_BOUNCE_PROBE.STOP_LOSS_MAX_PERCENT
      );
      
      stopLoss = currentPrice * (1 - capStop / 100);
      
      const capTP = Math.max(
        CAPITULATION_BOUNCE_PROBE.TAKE_PROFIT_MIN_PERCENT,
        Math.min(
          atrPercentForProbes * CAPITULATION_BOUNCE_PROBE.TAKE_PROFIT_ATR_MULTIPLIER,
          CAPITULATION_BOUNCE_PROBE.TAKE_PROFIT_MAX_PERCENT
        )
      );
      takeProfit = currentPrice * (1 + capTP / 100);
      
      logger.info(`🔄 CAPITULATION BOUNCE PROBE SL/TP OVERRIDE:`);
      logger.info(`   → Stop Loss: ${capStop.toFixed(2)}% (tight for capitulation)`);
      logger.info(`   → Take Profit: ${capTP.toFixed(2)}% (modest for bounce)`);
      logger.info(`   → Entry: $${currentPrice.toFixed(2)}, SL: $${stopLoss.toFixed(2)}, TP: $${takeProfit.toFixed(2)}`);
    }

    // ============================================================
    // MINIMUM STOP LOSS DISTANCE - Prevent premature exits from volatility
    // Enforce minimum distance from entry to prevent tight stops
    // Uses centralized RISK_PARAMS.MIN_STOP_DISTANCE_PERCENT
    // NOTE: Flash crash and capitulation probes intentionally use tighter stops
    // Only apply this check if NOT a probe entry
    // ============================================================
    const signalSide = signal.signal_type === 'long' ? 'BUY' : 'SELL';
    const isProbeEntry = flashCrashProbe?.active || capitulationProbe?.active;
    
    if (!isProbeEntry) {
      if (signalSide === 'BUY') {
        // For LONG: Stop loss must be at least MIN_STOP_DISTANCE_PERCENT below entry
        const minStopLoss = currentPrice * (1 - RISK_PARAMS.MIN_STOP_DISTANCE_PERCENT / 100);
        if (stopLoss > minStopLoss) {
          const originalDistance = ((currentPrice - stopLoss) / currentPrice) * 100;
          logger.warn(`⚠️ STOP LOSS TOO TIGHT: Original SL ${stopLoss.toFixed(2)} is only ${originalDistance.toFixed(2)}% from entry`);
          stopLoss = minStopLoss;
          logger.info(`✓ Adjusted SL to ${stopLoss.toFixed(2)} (${RISK_PARAMS.MIN_STOP_DISTANCE_PERCENT}% minimum distance)`);
        }
      } else {
        // For SHORT: Stop loss must be at least MIN_STOP_DISTANCE_PERCENT above entry
        const minStopLoss = currentPrice * (1 + RISK_PARAMS.MIN_STOP_DISTANCE_PERCENT / 100);
        if (stopLoss < minStopLoss) {
          const originalDistance = ((stopLoss - currentPrice) / currentPrice) * 100;
          logger.warn(`⚠️ STOP LOSS TOO TIGHT: Original SL ${stopLoss.toFixed(2)} is only ${originalDistance.toFixed(2)}% from entry`);
          stopLoss = minStopLoss;
          logger.info(`✓ Adjusted SL to ${stopLoss.toFixed(2)} (${RISK_PARAMS.MIN_STOP_DISTANCE_PERCENT}% minimum distance)`);
        }
      }
    }

    logger.info(`Using strategy SL: ${stopLoss.toFixed(2)}, TP: ${takeProfit.toFixed(2)}${isProbeEntry ? ' (probe entry - tighter stops allowed)' : ` (minimum ${RISK_PARAMS.MIN_STOP_DISTANCE_PERCENT}% distance enforced)`}`);

    // ============================================================
    // CONTEXTUAL TP EXPANSION - Wider targets for high-conviction entries
    // Philosophy: "Be selective on entry, patient on exit"
    // Increases PnL by expanding expectancy (wider TP), not risk (larger size)
    // ============================================================
    let tpExpansionMultiplier = 1.0;
    let tpExpansionReason = '';
    
    if (CONTEXTUAL_TP_EXPANSION.ENABLED) {
      // Get entry exception type from signal indicators
      const signalExceptionType = signal.indicators?.exceptionType || 
                                  signal.indicators?.entryExceptionType || '';
      const strategyName = signal.strategy_name || '';
      const isMrProbe = signal.indicators?.isMrProbe === true || 
                        signal.indicators?.counterTrendAdmission?.result === 'ADMIT';
      
      // Check Counter-Trend Exhaustion entries
      if (CONTEXTUAL_TP_EXPANSION.COUNTER_TREND_EXHAUSTION.ENABLED && 
          (CONTEXTUAL_TP_EXPANSION.COUNTER_TREND_EXHAUSTION.QUALIFYING_TYPES.some(t => 
            signalExceptionType.toUpperCase().includes(t) || 
            strategyName.toUpperCase().includes(t)
          ) || isMrProbe)) {
        tpExpansionMultiplier = CONTEXTUAL_TP_EXPANSION.COUNTER_TREND_EXHAUSTION.TP_MULTIPLIER;
        tpExpansionReason = 'COUNTER_TREND_EXHAUSTION';
      }
      // Check Strong Trend Override entries
      else if (CONTEXTUAL_TP_EXPANSION.STRONG_TREND_OVERRIDE.ENABLED &&
               (CONTEXTUAL_TP_EXPANSION.STRONG_TREND_OVERRIDE.QUALIFYING_TYPES.some(t => 
                 signalExceptionType.toUpperCase().includes(t) || 
                 strategyName.toUpperCase().includes(t)
               ) || signal.indicators?.strongTrendHTFBypass === true ||
               signal.indicators?.trendContinuationAtExtreme === true)) {
        tpExpansionMultiplier = CONTEXTUAL_TP_EXPANSION.STRONG_TREND_OVERRIDE.TP_MULTIPLIER;
        tpExpansionReason = 'STRONG_TREND_OVERRIDE';
      }
      // Check Squeeze Breakout entries
      else if (CONTEXTUAL_TP_EXPANSION.SQUEEZE_BREAKOUT.ENABLED &&
               CONTEXTUAL_TP_EXPANSION.SQUEEZE_BREAKOUT.QUALIFYING_TYPES.some(t => 
                 signalExceptionType.toUpperCase().includes(t) || 
                 strategyName.toUpperCase().includes(t)
               )) {
        tpExpansionMultiplier = CONTEXTUAL_TP_EXPANSION.SQUEEZE_BREAKOUT.TP_MULTIPLIER;
        tpExpansionReason = 'SQUEEZE_BREAKOUT';
      }
      
      // Apply TP expansion if applicable
      if (tpExpansionMultiplier > 1.0) {
        const originalTP = takeProfit;
        const tpDistance = Math.abs(takeProfit - currentPrice);
        const expandedDistance = tpDistance * tpExpansionMultiplier;
        
        if (signalSide === 'BUY') {
          takeProfit = currentPrice + expandedDistance;
        } else {
          takeProfit = currentPrice - expandedDistance;
        }
        
        if (CONTEXTUAL_TP_EXPANSION.LOG_TP_EXPANSION) {
          const expansionPercent = ((tpExpansionMultiplier - 1) * 100).toFixed(0);
          logger.info(`🎯 CONTEXTUAL TP EXPANSION [${tpExpansionReason}]: +${expansionPercent}% wider target`);
          logger.info(`   Original TP: $${originalTP.toFixed(2)} → Expanded TP: $${takeProfit.toFixed(2)}`);
          logger.info(`   Distance: $${tpDistance.toFixed(2)} → $${expandedDistance.toFixed(2)} (${((expandedDistance/currentPrice)*100).toFixed(2)}% from entry)`);
        }
      }
    }

    // ============================================================
    // FILTER 11: RISK/REWARD RATIO VALIDATION
    // Minimum R:R ratio of 1.5:1 required for all trades (INCREASED from 1.2)
    // This ensures we only take trades with sufficient profit potential
    // ============================================================
    const signalSideForRR = signal.signal_type === 'long' ? 'BUY' : 'SELL';
    let riskAmount: number;
    let rewardAmount: number;
    
    if (signalSideForRR === 'BUY') {
      // LONG: Risk = entry - stop loss, Reward = take profit - entry
      riskAmount = currentPrice - stopLoss;
      rewardAmount = takeProfit - currentPrice;
    } else {
      // SHORT: Risk = stop loss - entry, Reward = entry - take profit
      riskAmount = stopLoss - currentPrice;
      rewardAmount = currentPrice - takeProfit;
    }
    
    // Validate risk and reward are positive
    if (riskAmount <= 0) {
      throw new Error(`Invalid stop loss: ${signalSideForRR === 'BUY' ? 'SL must be below' : 'SL must be above'} entry price (Entry: $${currentPrice.toFixed(2)}, SL: $${stopLoss.toFixed(2)})`);
    }
    if (rewardAmount <= 0) {
      throw new Error(`Invalid take profit: ${signalSideForRR === 'BUY' ? 'TP must be above' : 'TP must be below'} entry price (Entry: $${currentPrice.toFixed(2)}, TP: $${takeProfit.toFixed(2)})`);
    }
    
    const riskRewardRatio = rewardAmount / riskAmount;
    const minRiskReward = RISK_REWARD_FILTER.MIN_RATIO;
    
    logger.info(`📊 Risk/Reward Analysis: Risk=$${riskAmount.toFixed(2)} (${((riskAmount/currentPrice)*100).toFixed(2)}%), Reward=$${rewardAmount.toFixed(2)} (${((rewardAmount/currentPrice)*100).toFixed(2)}%), R:R=${riskRewardRatio.toFixed(2)}:1`);
    
    if (riskRewardRatio < minRiskReward) {
      await logExecutionRejection(supabase, user.id, signal.symbol, 'R/R Ratio Too Low', signal, trendData, { riskRewardRatio, minRequired: minRiskReward, riskAmount, rewardAmount, currentPrice, stopLoss, takeProfit });
      throw new Error(`Risk/Reward ratio too low (${riskRewardRatio.toFixed(2)}:1 < ${minRiskReward}:1 required) - trade cancelled`);
    }
    logger.validation(`✓ R:R check passed: ${riskRewardRatio.toFixed(2)}:1 >= ${minRiskReward}:1 minimum`, true);

    // ============================================================
    // AI-POWERED SIGNAL ENHANCEMENT (Optional)
    // Get AI second opinion on signal quality
    // ============================================================
    let aiPositionMultiplier = 1.0;
    let aiConfidenceAdjustment = 0;
    
    // Check if AI analysis is globally enabled
    const aiAnalysisEnabled = riskParams.ai_analysis_enabled !== false;
    
    if (aiAnalysisEnabled) {
      try {
        const { data: aiAnalysis, error: aiError } = await supabase.functions.invoke('ai-signal-analyzer', {
          body: {
            symbol: signal.symbol,
            signalType: signal.signal_type,
            userId: user.id,
            mfs: {
              primaryTrend: mfs.primaryTrend,
              confidence: signal.confidence_score || 0,
              adx: mfs.adx,
              adxSlope: mfs.adxSlope,
              rsi1h: mfs.timeframes['1h'].indicators?.rsi ?? 50,
              macdHistogram1h: mfs.timeframes['1h'].indicators?.macdHistogram ?? 0,
              stochRsi1h: { k: mfs.stochRsi['1h'].k, d: mfs.stochRsi['1h'].d, signal: mfs.stochRsi['1h'].signal },
              bollingerBands1h: {
                percentB: bb1h.percentB || 50,
                squeeze: bb1h.squeeze || false
              },
              momentumState: mfs.momentum?.state || 'none',
              momentumConfirms: mfs.momentum?.confirms || false,
              momentumDivergence: mfs.momentum?.hasDivergence || false,
              volumeConfirms: mfs.momentum?.volumeConfirms || false,
              atrPercent: mfs.atrPercent,
              regime: mfs.regime,
            },
            strategyName: signal.strategy_name || 'Unknown',
            entryPrice: currentPrice,
            stopLoss: stopLoss,
            takeProfit: takeProfit
          }
        });

        if (!aiError && aiAnalysis?.success && aiAnalysis?.analysis) {
          const analysis = aiAnalysis.analysis;
          aiPositionMultiplier = analysis.positionSizeMultiplier || 1.0;
          aiConfidenceAdjustment = analysis.confidenceAdjustment || 0;
          
          logger.info(`🤖 AI Analysis: ${analysis.recommendation.toUpperCase()}`);
          logger.info(`   Risk Level: ${analysis.riskLevel} | Conf Adj: ${aiConfidenceAdjustment > 0 ? '+' : ''}${aiConfidenceAdjustment} | Size: ${aiPositionMultiplier}x`);
          logger.info(`   Factors: ${analysis.keyFactors?.slice(0, 3).join(' | ')}`);
          
          // AI can BLOCK a trade if it recommends "avoid" OR risk level is "high"
          if (analysis.recommendation === 'avoid') {
            await logExecutionRejection(supabase, user.id, signal.symbol, 'AI Recommends AVOID', signal, trendData, { aiRecommendation: analysis.recommendation, aiReasoning: analysis.reasoning, aiKeyFactors: analysis.keyFactors });
            throw new Error(`AI recommends AVOID: ${analysis.reasoning?.slice(0, 100)}`);
          }
          if (analysis.riskLevel === 'high') {
            await logExecutionRejection(supabase, user.id, signal.symbol, 'AI Risk Level HIGH', signal, trendData, { aiRiskLevel: analysis.riskLevel, aiKeyFactors: analysis.keyFactors });
            throw new Error(`AI risk level HIGH: ${analysis.keyFactors?.slice(0, 2).join(', ')}`);
          }
          // Medium risk: reduce position size by 50%
          if (analysis.riskLevel === 'medium') {
            aiPositionMultiplier *= 0.5;
            logger.warn(`⚠️ AI medium risk detected - position size reduced by 50% (multiplier: ${aiPositionMultiplier}x)`);
          }
        } else if (aiError) {
          logger.warn(`AI analysis unavailable, proceeding with standard filters: ${aiError.message || aiError}`);
        }
      } catch (aiException) {
        // Don't block trades if AI service fails (unless it explicitly recommends avoid or high risk)
        if (aiException instanceof Error && (aiException.message.includes('AI recommends AVOID') || aiException.message.includes('AI risk level HIGH'))) {
          throw aiException;
        }
        logger.warn(`AI analysis skipped: ${aiException instanceof Error ? aiException.message : 'Unknown error'}`);
      }
    } else {
      logger.info('🤖 AI analysis disabled by user setting');
    }

    // Fetch strategy's risk settings to get positionSizePercent
    let positionSizePercent = 1.0; // Default fallback if strategy not found
    
    // First check if signal has positionSizePercent in indicators (for rebalancer signals)
    // ============================================================
    // UNIFIED ADAPTIVE POSITION SIZING
    // Position size comes from signal indicators (set by strategy-analyzer)
    // No custom strategy lookup needed - built-in templates handle this
    // ============================================================
    if (signal.indicators && typeof signal.indicators === 'object' && 'positionSizePercent' in signal.indicators) {
      positionSizePercent = signal.indicators.positionSizePercent as number;
      logger.info(`Using signal's positionSizePercent from indicators: ${positionSizePercent}%`);
    } else {
      // Default based on quality score - higher quality = larger position
      const qualityScore = signal.indicators?.qualityScore ?? 60;
      if (qualityScore >= QUALITY_BASED_SIZING.HIGH_QUALITY_MIN) {
        positionSizePercent = QUALITY_BASED_SIZING.HIGH_QUALITY_SIZE_PERCENT;
      } else if (qualityScore >= QUALITY_BASED_SIZING.MEDIUM_QUALITY_MIN) {
        positionSizePercent = QUALITY_BASED_SIZING.MEDIUM_QUALITY_SIZE_PERCENT;
      } else {
        positionSizePercent = QUALITY_BASED_SIZING.DEFAULT_SIZE_PERCENT;
      }
      logger.info(`Using quality-based positionSizePercent: ${positionSizePercent}% (quality=${qualityScore})`);
    }

    // ============================================================
    // UNIFIED RISK: Skip legacy strategy-aware sizing when unified risk is present
    // Position size is now calculated in strategy-analyzer using base_position_size_percent
    // Only apply legacy sizing if unified risk did NOT calculate position
    // ============================================================
    const hasUnifiedRiskPosition = signal.indicators && 
      typeof signal.indicators === 'object' && 
      'positionSizePercent' in signal.indicators &&
      signal.indicators.positionSizePercent !== undefined;
    
    if (hasUnifiedRiskPosition) {
      // Unified Risk already calculated position size - skip legacy strategy-type multipliers
      logger.info(`✅ UNIFIED RISK active: Using pre-calculated positionSizePercent=${positionSizePercent.toFixed(2)}%`);
      logger.info(`   → Skipping legacy strategy-type multipliers (position already adjusted for ADX/quality/risk profile)`);
    } else {
      // Fallback: Apply legacy strategy-aware sizing only when unified risk is not present
      const strategyType = detectStrategyType(signal.strategy_id || '', signal.strategy_name || '');
      const isMomentum = isMomentumStrategy(signal.strategy_id || '', signal.strategy_name || '');
      const isMeanReversion = isMeanReversionStrategy(signal.strategy_id || '', signal.strategy_name || '');
      
      let strategyPositionMultiplier = 1.0;
      let strategyPositionNote = "";
      
      if (isMomentum) {
        const adxValue = mfs.adx;
        const momentumConfirms = mfs.momentum?.confirms === true;
        
        if (adxValue >= ADX_THRESHOLDS.STRONG && momentumConfirms) {
          strategyPositionMultiplier = 1.25;
          strategyPositionNote = `Momentum + strong ADX (${adxValue.toFixed(1)}) = +25% size`;
        } else if (adxValue >= ADX_THRESHOLDS.MINIMUM && momentumConfirms) {
          strategyPositionMultiplier = 1.15;
          strategyPositionNote = `Momentum confirmed (ADX ${adxValue.toFixed(1)}) = +15% size`;
        } else if (!momentumConfirms) {
          strategyPositionMultiplier = 0.8;
          strategyPositionNote = `Momentum NOT confirmed = -20% size`;
        } else {
          strategyPositionNote = `Momentum strategy: standard size`;
        }
      } else if (isMeanReversion) {
        const stochRsi1hMR = mfs.stochRsi['1h'];
        const k1h = stochRsi1hMR.k ?? 50;
        const isExtremeOversold = k1h < STOCHRSI_THRESHOLDS.EXTREME_OVERSOLD;
        const isExtremeOverbought = k1h > STOCHRSI_THRESHOLDS.EXTREME_OVERBOUGHT;
        const signalType = signal.signal_type;
        
        if ((signalType === 'long' && isExtremeOversold) || (signalType === 'short' && isExtremeOverbought)) {
          strategyPositionMultiplier = 1.1;
          strategyPositionNote = `Mean reversion at extreme (StochRSI K=${k1h.toFixed(1)}) = +10% size`;
        } else {
          strategyPositionMultiplier = 0.75;
          strategyPositionNote = `Mean reversion (counter-trend) = -25% size for safety`;
        }
      } else if (strategyType === 'TREND_FOLLOWING') {
        const adxValue = mfs.adx;
        
        if (adxValue >= ADX_THRESHOLDS.VERY_STRONG) {
          strategyPositionMultiplier = 1.2;
          strategyPositionNote = `Trend following + strong trend (ADX ${adxValue.toFixed(1)}) = +20% size`;
        } else if (adxValue < ADX_THRESHOLDS.MINIMUM) {
          strategyPositionMultiplier = 0.7;
          strategyPositionNote = `Trend following but weak trend (ADX ${adxValue.toFixed(1)}) = -30% size`;
        } else {
          strategyPositionNote = `Trend following: standard size`;
        }
      } else if (strategyType === 'GRID_RANGE') {
        strategyPositionMultiplier = 0.6;
        strategyPositionNote = `Grid/range strategy = -40% size (more frequent trades)`;
      } else if (strategyType === 'NEUTRAL_BREAKOUT') {
        // MFS MIGRATED: momentum confirms read from snapshot
        const breakoutConfirmed = mfs.momentum?.confirms === true;
        
        if (breakoutConfirmed) {
          strategyPositionMultiplier = 1.1;
          strategyPositionNote = `Neutral breakout confirmed = +10% size`;
        } else {
          strategyPositionMultiplier = 0.85;
          strategyPositionNote = `Neutral breakout unconfirmed = -15% size`;
        }
      }
      
      // Apply strategy position multiplier to base position size
      if (strategyPositionMultiplier !== 1.0) {
        positionSizePercent *= strategyPositionMultiplier;
        logger.info(`🎯 Legacy strategy sizing [${strategyType}]: ${strategyPositionNote}`);
        logger.info(`   → Position size adjusted: ${(positionSizePercent / strategyPositionMultiplier).toFixed(2)}% × ${strategyPositionMultiplier.toFixed(2)} = ${positionSizePercent.toFixed(2)}%`);
      } else {
        logger.info(`🎯 Legacy strategy sizing [${strategyType}]: ${strategyPositionNote || 'standard sizing'}`);
      }
    }

    // ============================================================
    // PHASE 1 FIX: APPLY STRATEGY PERFORMANCE BONUS
    // High-performing strategies get a position size boost
    // Aligned with strategy-analyzer STRATEGY_PARAMS.MAX_PERFORMANCE_BONUS
    // ============================================================
    if (strategyPerformanceBonus > 0) {
      const performanceBoostMultiplier = 1 + (strategyPerformanceBonus / 100); // +5 bonus = 1.05x
      positionSizePercent *= performanceBoostMultiplier;
      logger.info(`⭐ Strategy performance bonus applied: +${strategyPerformanceBonus}% → ${performanceBoostMultiplier.toFixed(2)}x position size`);
    }

    // ============================================================
    // SMART RISK #2: KELLY CRITERION POSITION SIZING
    // Calculate optimal risk based on historical win rate and avg win/loss
    // ============================================================
    let kellyAdjustedPositionSize = positionSizePercent;
    
    if (riskParams.kelly_criterion_enabled !== false) {
      const minTradesForKelly = riskParams.min_trades_for_kelly || 10;
      const kellyMaxRiskCap = riskParams.kelly_max_risk_cap || 3.0;
      
      // Get historical performance for Kelly calculation
      const { data: historicalTrades } = await supabase
        .from('positions')
        .select('realized_pnl, entry_price, exit_price, quantity')
        .eq('user_id', user.id)
        .eq('status', 'closed')
        .not('realized_pnl', 'is', null)
        .order('closed_at', { ascending: false })
        .limit(50);
      
      if (historicalTrades && historicalTrades.length >= minTradesForKelly) {
        const wins = historicalTrades.filter(t => (t.realized_pnl || 0) > 0);
        const losses = historicalTrades.filter(t => (t.realized_pnl || 0) <= 0);
        
        const winRate = wins.length / historicalTrades.length;
        const lossRate = 1 - winRate;
        
        const avgWin = wins.length > 0 
          ? wins.reduce((sum, t) => sum + Math.abs(t.realized_pnl || 0), 0) / wins.length 
          : 0;
        const avgLoss = losses.length > 0 
          ? losses.reduce((sum, t) => sum + Math.abs(t.realized_pnl || 0), 0) / losses.length 
          : 1;
        
        // Kelly Formula: f* = W - (L / R) where W=win rate, L=loss rate, R=win/loss ratio
        const winLossRatio = avgLoss > 0 ? avgWin / avgLoss : 1;
        const kellyPercent = (winRate - (lossRate / winLossRatio)) * 100;
        
        // Apply half-Kelly for safety and cap at max risk
        const halfKelly = Math.max(0, kellyPercent / 2);
        const cappedKelly = Math.min(halfKelly, kellyMaxRiskCap);
        
        if (cappedKelly > 0) {
          kellyAdjustedPositionSize = cappedKelly;
          logger.info(`🎯 Kelly Criterion: WinRate=${(winRate*100).toFixed(1)}%, AvgWin=$${avgWin.toFixed(2)}, AvgLoss=$${avgLoss.toFixed(2)}`);
          logger.info(`   → Full Kelly=${kellyPercent.toFixed(2)}%, Half Kelly=${halfKelly.toFixed(2)}%, Capped=${cappedKelly.toFixed(2)}%`);
        } else {
          logger.warn(`⚠️ Kelly suggests no bet (negative edge). Using strategy default: ${positionSizePercent}%`);
          kellyAdjustedPositionSize = positionSizePercent * 0.5; // Reduce by 50% when Kelly is negative
        }
      } else {
        logger.info(`📊 Kelly: Insufficient data (${historicalTrades?.length || 0}/${minTradesForKelly} trades). Using strategy: ${positionSizePercent}%`);
      }
    }
    
    // Use Kelly-adjusted or strategy position size
    const effectivePositionSize = riskParams.kelly_criterion_enabled !== false ? kellyAdjustedPositionSize : positionSizePercent;
    
    // Calculate position size based on effective position size
    const positionValue = (riskParams.portfolio_value * effectivePositionSize) / 100;
    let quantity = positionValue / currentPrice;
    
    logger.info(`Position sizing: ${effectivePositionSize.toFixed(2)}% of $${riskParams.portfolio_value} = $${positionValue.toFixed(2)} / $${currentPrice.toFixed(2)} = ${quantity.toFixed(4)} ${signal.symbol.replace('USDT', '')}`);

    // Apply OBV boost multiplier if available
    const obvBoostMultiplier = (signal as any).obvBoostMultiplier || 1.0;
    if (obvBoostMultiplier !== 1.0) {
      quantity *= obvBoostMultiplier;
      logger.info(`OBV adjustment applied: ${obvBoostMultiplier}x -> new quantity: ${quantity.toFixed(4)}`);
    }

    // Apply Bollinger Bands boost multiplier if available
    const bbBoostMultiplier = (signal as any).bollingerBoostMultiplier || 1.0;
    if (bbBoostMultiplier !== 1.0) {
      quantity *= bbBoostMultiplier;
      logger.info(`Bollinger Bands adjustment applied: ${bbBoostMultiplier.toFixed(2)}x -> new quantity: ${quantity.toFixed(4)}`);
    }

    // Apply VWAP boost multiplier if available
    const vwapBoostMultiplier = (signal as any).vwapBoostMultiplier || 1.0;
    if (vwapBoostMultiplier !== 1.0) {
      quantity *= vwapBoostMultiplier;
      logger.info(`VWAP adjustment applied: ${vwapBoostMultiplier.toFixed(2)}x -> new quantity: ${quantity.toFixed(4)}`);
    }

    // ============================================================
    // PHASE 1 FIX: APPLY VOLUME RELAXATION MULTIPLIER
    // For trend-forming entries with low volume, reduce position size
    // Aligned with VOLUME_RELAXATION_PARAMS.POSITION_SIZE_MULTIPLIER
    // ============================================================
    const volumeRelaxationApplied = (signal as any).volumeRelaxationApplied || false;
    const volumeRelaxationMultiplier = (signal as any).volumeRelaxationMultiplier || 1.0;
    if (volumeRelaxationApplied && volumeRelaxationMultiplier !== 1.0) {
      quantity *= volumeRelaxationMultiplier;
      logger.info(`📉 Volume relaxation adjustment applied: ${volumeRelaxationMultiplier.toFixed(2)}x → new quantity: ${quantity.toFixed(4)}`);
    }

    // Apply AI-powered position size adjustment
    if (aiPositionMultiplier !== 1.0) {
      quantity *= aiPositionMultiplier;
      logger.info(`🤖 AI position adjustment applied: ${aiPositionMultiplier.toFixed(2)}x -> new quantity: ${quantity.toFixed(4)}`);
    }

    // ============================================================
    // PHASE 2 FIX #2: SINGLE SOURCE OF TRUTH FOR REVERSAL SIZING
    // Previously, reversal risk was double-counted:
    // - Signal generation applied reversalPositionMultiplier to signal.positionSizePercent
    // - Execution also applied reversalPositionMultiplier from calculateUnifiedReversalScore
    // Now: Use ONLY execution-time data (more current market conditions)
    // Log both values for transparency but apply only execution-time multiplier
    // ============================================================
    const signalReversalMultiplier = signal.indicators?.reversalPositionMultiplier || 1.0;
    if (signalReversalMultiplier !== 1.0 && reversalPositionMultiplier !== 1.0) {
      logger.warn(`⚠️ REVERSAL SIZING: Signal embedded ${signalReversalMultiplier.toFixed(2)}x, Execution-time ${reversalPositionMultiplier.toFixed(2)}x`);
      logger.warn(`   → Using ONLY execution-time multiplier (${reversalPositionMultiplier.toFixed(2)}x) to avoid double-counting`);
    }
    
    // Apply ONLY execution-time Unified Reversal Score position multiplier
    if (reversalPositionMultiplier !== 1.0) {
      quantity *= reversalPositionMultiplier;
      logger.warn(`⚠️ Reversal score adjustment applied: ${reversalPositionMultiplier.toFixed(2)}x -> new quantity: ${quantity.toFixed(4)}`);
    }

    // Apply counter-trend position multiplier (Phase 2 Fix #1)
    if (isCounterTrendEntry && counterTrendPositionMultiplier !== 1.0) {
      quantity *= counterTrendPositionMultiplier;
      logger.warn(`⚠️ Counter-trend entry adjustment applied: ${counterTrendPositionMultiplier.toFixed(2)}x -> new quantity: ${quantity.toFixed(4)}`);
    }

    // ============================================================
    // PHASE 5: Apply Momentum Position Multiplier
    // Reduce position size for weak/fake momentum, boost for genuine momentum
    // ============================================================
    if (momentumPositionMultiplier !== 1.0) {
      const prevQuantity = quantity;
      quantity *= momentumPositionMultiplier;
      logger.info(`📊 Momentum adjustment: ${prevQuantity.toFixed(4)} × ${momentumPositionMultiplier.toFixed(2)} = ${quantity.toFixed(4)}`);
    }

    // ============================================================
    // ENHANCED TRUE ALIGNMENT POSITION MULTIPLIER (v2.0)
    // Apply alignment-based sizing from weighted component analysis
    // ============================================================
    if (alignmentPositionMultiplier !== 1.0) {
      const prevQuantity = quantity;
      quantity *= alignmentPositionMultiplier;
      logger.info(`📊 Alignment adjustment: ${prevQuantity.toFixed(4)} × ${alignmentPositionMultiplier.toFixed(2)} = ${quantity.toFixed(4)}`);
    }

    // ============================================================
    // GRADUATED QUALITY THRESHOLD POSITION REDUCTION
    // Applied for borderline quality scores (55-60 or 60-threshold)
    // ============================================================
    if (qualityPositionReduction > 0) {
      const qualityMultiplier = (100 - qualityPositionReduction) / 100;
      const prevQuantity = quantity;
      quantity *= qualityMultiplier;
      logger.info(`📊 Quality score adjustment: ${prevQuantity.toFixed(4)} × ${qualityMultiplier.toFixed(2)} (-${qualityPositionReduction}%) = ${quantity.toFixed(4)}`);
    }
    // Apply confidence-based position size scaling (INVERTED: high confidence = REDUCE size)
    // High confidence indicates trend exhaustion, not strength
    const adjustedConfidence = Math.max(0, Math.min(100, (signal.confidence_score || 0) + aiConfidenceAdjustment));
    const confidence = adjustedConfidence;
    
    // CONFIDENCE PENALTY REMOVED: High confidence now means STRONG multi-timeframe alignment
    // This is a POSITIVE signal in professional trading systems, not exhaustion
    // Only penalize genuinely low confidence signals
    if (confidence < CONFIDENCE_THRESHOLDS.LOW) {
      quantity *= LEGACY_STRATEGY_MULTIPLIERS.LOW_CONFIDENCE_MULTIPLIER;
      logger.info(`Position size reduced by 30% due to low confidence (${confidence}% < ${CONFIDENCE_THRESHOLDS.LOW}%)`);
    } else {
      // All other confidence levels: no penalty - high confidence is now rewarded
      logger.info(`✓ Position size normal for confidence ${confidence}%`);
    }

    // Apply position size reduction if consecutive losses
    if (riskParams.consecutive_losses >= riskParams.consecutive_loss_threshold) {
      quantity *= (1 - riskParams.position_size_reduction_percent / 100);
      logger.warn('Position size reduced due to consecutive losses');
    }

    // ============================================================
    // BINANCE PRECISION VALIDATION
    // Fetch symbol filters and round quantity/prices to valid precision
    // ============================================================
    const symbolFilters = await getSymbolFilters(signal.symbol);
    
    // Round quantity to step size precision
    quantity = roundToStepSize(quantity, symbolFilters.stepSize);
    
    // Validate minimum quantity
    if (quantity < symbolFilters.minQty) {
      throw new Error(`Calculated quantity (${quantity}) is below minimum (${symbolFilters.minQty}) for ${signal.symbol}`);
    }
    
    // Validate minimum notional (order value)
    const orderNotional = quantity * currentPrice;
    if (orderNotional < symbolFilters.minNotional) {
      throw new Error(`Order value ($${orderNotional.toFixed(2)}) is below minimum ($${symbolFilters.minNotional}) for ${signal.symbol}`);
    }
    
    // Round stop loss and take profit to tick size precision
    stopLoss = roundToTickSize(stopLoss, symbolFilters.tickSize);
    takeProfit = roundToTickSize(takeProfit, symbolFilters.tickSize);
    
    logger.info(`📐 Precision-adjusted: qty=${quantity} (step=${symbolFilters.stepSize}), SL=$${stopLoss} TP=$${takeProfit} (tick=${symbolFilters.tickSize})`);
    logger.info(`📐 Order notional: $${orderNotional.toFixed(2)} (min=$${symbolFilters.minNotional})`);


    const side = signal.signal_type === 'long' ? 'BUY' : 'SELL';
    let orderData: any;
    let executedPrice = currentPrice; // Use current price instead of signal entry price
    let postExecutionSlippage = 0; // Declare outside block for position insert access

    if (isPaperTrading) {
      // Simulate paper trading
      logger.trade('Simulating trade execution (Paper Trading Mode)');
      orderData = {
        orderId: `PAPER_${Date.now()}`,
        status: 'FILLED',
        fills: [{ price: currentPrice.toString() }],
      };
      // Paper trading has no slippage
      postExecutionSlippage = 0;
    } else {
      // ============================================================
      // PHASE 3 FIX #2: ORDER EXECUTION WITH RETRY LOGIC & PARTIAL FILL HANDLING
      // - Bounded retry for transient errors (max 2 retries)
      // - Partial fill reconciliation (adjust quantity to actual executed)
      // - Explicit status checking
      // ============================================================
      let retryCount = 0;
      let lastError: Error | null = null;
      
      while (retryCount <= ORDER_EXECUTION_PARAMS.MAX_RETRIES) {
        try {
          const timestamp = Date.now();
          const queryString = `symbol=${signal.symbol}&side=${side}&type=MARKET&quantity=${quantity}&timestamp=${timestamp}`;
          const signatureHex = await createBinanceSignature(queryString, binanceApiSecret!);

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
            let errorData: any = {};
            try {
              errorData = JSON.parse(errorText);
            } catch {
              errorData = { msg: errorText, code: -1 };
            }
            
            // Check if this is a transient error that warrants retry
            const isTransientError = ORDER_EXECUTION_PARAMS.TRANSIENT_ERROR_CODES.includes(errorData.code);
            
            if (isTransientError && retryCount < ORDER_EXECUTION_PARAMS.MAX_RETRIES) {
              retryCount++;
              logger.warn(`⚠️ Transient error (code ${errorData.code}), retrying ${retryCount}/${ORDER_EXECUTION_PARAMS.MAX_RETRIES}...`);
              await new Promise(resolve => setTimeout(resolve, ORDER_EXECUTION_PARAMS.RETRY_DELAY_MS));
              continue;
            }
            
            // Send email notification for non-transient errors
            await sendBinanceApiErrorNotification(supabaseUrl!, supabaseKey!, user.id, {
              operation: 'execute_trade',
              symbol: signal.symbol,
              binanceErrorCode: errorData.code,
              binanceErrorMsg: errorData.msg || errorText,
              httpStatus: orderResponse.status,
              context: `Failed to place ${side} order for ${quantity} ${signal.symbol}`,
            });
            
            logger.error(`Binance API error: ${errorText}`);
            throw new Error(`Failed to place order: ${errorData.msg || errorText}`);
          }

          orderData = await orderResponse.json();
          
          // ============================================================
          // EXPLICIT STATUS CHECK - Handle all possible order statuses
          // ============================================================
          const orderStatus = orderData.status;
          logger.trade(`Order response: status=${orderStatus}, orderId=${orderData.orderId}`);
          
          if (orderStatus === 'REJECTED') {
            await sendBinanceApiErrorNotification(supabaseUrl!, supabaseKey!, user.id, {
              operation: 'execute_trade',
              symbol: signal.symbol,
              binanceErrorMsg: `Order rejected by exchange: ${JSON.stringify(orderData)}`,
              context: `${side} order rejected - check order parameters`,
            });
            throw new Error(`Order rejected by exchange: ${JSON.stringify(orderData)}`);
          }
          
          if (orderStatus === 'EXPIRED') {
            await sendBinanceApiErrorNotification(supabaseUrl!, supabaseKey!, user.id, {
              operation: 'execute_trade',
              symbol: signal.symbol,
              binanceErrorMsg: `Order expired before fill`,
              context: `${side} order expired - market may be illiquid`,
            });
            throw new Error(`Order expired before fill: ${JSON.stringify(orderData)}`);
          }
          
          if (orderStatus === 'CANCELED') {
            await sendBinanceApiErrorNotification(supabaseUrl!, supabaseKey!, user.id, {
              operation: 'execute_trade',
              symbol: signal.symbol,
              binanceErrorMsg: `Order was canceled unexpectedly`,
              context: `${side} order canceled before execution`,
            });
            throw new Error(`Order was canceled: ${JSON.stringify(orderData)}`);
          }
          
          // Handle partial fills
          if (orderStatus === 'PARTIALLY_FILLED') {
            const executedQty = parseFloat(orderData.executedQty || '0');
            const origQty = parseFloat(orderData.origQty || quantity.toString());
            const fillRatio = origQty > 0 ? executedQty / origQty : 0;
            
            logger.warn(`⚠️ PARTIAL FILL: ${executedQty}/${origQty} (${(fillRatio * 100).toFixed(1)}% filled)`);
            
            if (fillRatio < ORDER_EXECUTION_PARAMS.MIN_FILL_RATIO) {
              // Fill ratio too low - cancel remaining and abort
              logger.error(`❌ Partial fill ratio ${(fillRatio * 100).toFixed(1)}% below minimum ${ORDER_EXECUTION_PARAMS.MIN_FILL_RATIO * 100}%`);
              
              // Try to cancel remaining order
              try {
                const cancelTimestamp = Date.now();
                const cancelQueryString = `symbol=${signal.symbol}&orderId=${orderData.orderId}&timestamp=${cancelTimestamp}`;
                const cancelSignature = await createBinanceSignature(cancelQueryString, binanceApiSecret!);
                
                await fetch(
                  `https://api.binance.com/api/v3/order?${cancelQueryString}&signature=${cancelSignature}`,
                  {
                    method: 'DELETE',
                    headers: { 'X-MBX-APIKEY': binanceApiKey! },
                  }
                );
                logger.info(`Canceled remaining order ${orderData.orderId}`);
              } catch (cancelError) {
                logger.warn(`Failed to cancel remaining order: ${cancelError}`);
              }
              
              throw new Error(`Partial fill ratio too low (${(fillRatio * 100).toFixed(1)}%) - order canceled`);
            }
            
            // Accept partial fill but adjust quantity
            quantity = roundToStepSize(executedQty, symbolFilters.stepSize);
            logger.warn(`✓ Accepting partial fill - adjusted quantity to ${quantity}`);
          } else if (orderStatus !== 'FILLED') {
            // Unexpected status
            logger.warn(`⚠️ Unexpected order status: ${orderStatus}`);
          }
          
          logger.trade('Order executed: ' + JSON.stringify(orderData));
          
          // Calculate executed price from fills
          if (orderData.fills && orderData.fills.length > 0) {
            // Weight average price by quantity for multi-fill orders
            let totalValue = 0;
            let totalQty = 0;
            for (const fill of orderData.fills) {
              const fillPrice = parseFloat(fill.price);
              const fillQty = parseFloat(fill.qty);
              totalValue += fillPrice * fillQty;
              totalQty += fillQty;
            }
            executedPrice = totalQty > 0 ? totalValue / totalQty : currentPrice;
          } else {
            executedPrice = currentPrice;
          }
          
          // Break out of retry loop on success
          break;
          
        } catch (execError) {
          lastError = execError instanceof Error ? execError : new Error(String(execError));
          
          // If this was a retryable error, it's already handled above
          // This catch is for non-retryable errors
          if (retryCount >= ORDER_EXECUTION_PARAMS.MAX_RETRIES) {
            throw lastError;
          }
          
          throw lastError;
        }
      }

      // ============================================================
      // POST-EXECUTION SLIPPAGE VALIDATION
      // ============================================================
      postExecutionSlippage = Math.abs((executedPrice - currentPrice) / currentPrice) * 100;
      logger.info(`💱 Post-execution slippage: Expected=$${currentPrice.toFixed(2)}, Got=$${executedPrice.toFixed(2)}, Slippage=${postExecutionSlippage.toFixed(3)}%`);
      
      // Warn on high slippage (> 0.3%) but don't reject since order is already filled
      if (postExecutionSlippage > 0.3) {
        logger.warn(`⚠️ HIGH SLIPPAGE WARNING: ${postExecutionSlippage.toFixed(2)}% slippage on execution`);
      }
    }

    // Extract reversal decision from signal indicators for analytics
    const signalIndicators = signal.indicators || {};
    const reversalDecision = signalIndicators.reversalDecision || unifiedReversalResult.decision || 'NORMAL';
    const reversalScore = signalIndicators.reversalScore ?? unifiedReversalResult.score ?? 0;
    
    // NEW: Extract trend continuation at extreme flag
    const isTrendContinuationAtExtreme = signalIndicators.trendContinuationAtExtreme === true || signalIndicators.strongTrendHTFBypass === true;
    const trendContinuationParams = signalIndicators.trendContinuationParams || null;
    
    const reversalDetails = {
      ...(signalIndicators.reversalDetails || {
        breakdown: {},
        signals: unifiedReversalResult.reasons,
        adxWeight: unifiedReversalResult.adxWeight,
        positionSizeMultiplier: unifiedReversalResult.positionSizeMultiplier,
      }),
      // NEW: Add trend continuation at extreme tracking for monitor-positions
      trendContinuationAtExtreme: isTrendContinuationAtExtreme,
      trendContinuationParams: trendContinuationParams,
    };
    
    // Log if trend continuation at extreme
    if (isTrendContinuationAtExtreme) {
      logger.info(`🔥 TREND CONTINUATION AT EXTREME: Applying tighter stops - BE=${trendContinuationParams?.breakEvenActivationPercent || STRONG_TREND_HTF_BYPASS_PARAMS.BREAK_EVEN_ACTIVATION_PERCENT}%, Trail=${trendContinuationParams?.trailingActivationPercent || STRONG_TREND_HTF_BYPASS_PARAMS.TRAILING_ACTIVATION_PERCENT}%`);
    }

    // Extract entry exception type from signal indicators for monitor-positions alignment
    // This allows exit logic to apply strategy-aware rules based on how the position was entered
    const signalExceptionType = signalIndicators.exceptionType || null;
    const signalExceptionDetails = signalIndicators.exceptionDetails || null;
    
    // Determine the entry exception type string for the position
    let entryExceptionType: string | null = null;
    if (signalExceptionType && signalExceptionType !== 'NONE') {
      entryExceptionType = signalExceptionType;
      logger.info(`📌 Entry exception type: ${entryExceptionType} (from signal indicators)`);
    } else if (signalIndicators.strongTrendHTFBypass || signalIndicators.trendContinuationAtExtreme) {
      entryExceptionType = 'STRONG_TREND';
      logger.info(`📌 Entry exception type: ${entryExceptionType} (from HTF bypass flag)`);
    } else if (signalIndicators.isPullbackMomentumBypass) {
      entryExceptionType = 'MOMENTUM_CONTINUATION';
      logger.info(`📌 Entry exception type: ${entryExceptionType} (from pullback momentum bypass)`);
    } else if (signalIndicators.isMicroTrendEntry || signalIndicators.microTrendActive) {
      entryExceptionType = 'MICRO_TREND';
      logger.info(`📌 Entry exception type: ${entryExceptionType} (from micro trend flag)`);
    }

    // ============================================================
    // PHASE 2 FIX: CALCULATE INITIAL RISK FOR R-MULTIPLE TRACKING
    // Store the initial risk amount at entry for accurate R-multiple calculations
    // R-multiple = Current P&L / Initial Risk Amount
    // ============================================================
    const initialRiskAmount = Math.abs(executedPrice - stopLoss) * quantity;
    logger.info(`📊 Initial risk calculated: $${initialRiskAmount.toFixed(2)} (entry: $${executedPrice.toFixed(2)}, SL: $${stopLoss.toFixed(2)}, qty: ${quantity.toFixed(4)})`);

    // ============================================================
    // MEAN REVERSION SUPPORT: STORE ENTRY ATR FOR EXIT CALCULATIONS
    // ATR at entry provides stable baseline for volatility-adjusted exits
    // ============================================================
    // ATR is extracted from trendData volatility object
    const entryAtrPercent = mfs.atrPercent || atrPercent || 1.5;
    const entryAtr = (entryAtrPercent / 100) * executedPrice;  // Convert percent to absolute ATR
    logger.info(`📊 Entry ATR stored: ${entryAtr.toFixed(4)} (${entryAtrPercent.toFixed(2)}% of entry price)`);

    // ============================================================
    // PHASE 2: BUILD ENTRY SNAPSHOT FOR FORENSICS
    // Captures complete entry context for later analysis
    // ============================================================
    const entrySnapshot = {
      signal_id: signalId,
      signal_created_at: signal.created_at,
      strategy_name: signal.strategy_name,
      quality_score: signal.indicators?.qualityScore,
      confidence_score: signal.confidence_score,
      // Trend data at entry
      adx: mfs.adx ?? null,
      adx_slope: mfs.adxSlope.slope ?? null,
      stoch_rsi_4h_k: mfs.stochRsi['4h'].k ?? null,
      stoch_rsi_4h_d: mfs.stochRsi['4h'].d ?? null,
      regime: mfs.regime ?? null,
      primary_trend: mfs.primaryTrend ?? null,
      // Move exhaustion context
      move_from_24h_low_percent: mfs.priceDistance?.distanceFromLowPercent ?? null,
      move_from_24h_high_percent: mfs.priceDistance?.distanceFromHighPercent ?? null,
      price_24h_low: mfs.priceDistance?.low24h ?? null,
      price_24h_high: mfs.priceDistance?.high24h ?? null,
      // Entry context
      entry_exception_type: entryExceptionType,
      reversal_decision: reversalDecision,
      reversal_score: reversalScore,
      // Gate information
      entry_gates_passed: signal.indicators?.gatesPassed ?? [],
      position_size_multiplier: signal.indicators?.positionSizePercent ?? null,
      // === PRODUCTION MULTIPLIER FORENSICS (mandatory for sizing compression analysis) ===
      finalMultiplier: signal.indicators?.positionSizePercent ?? null,
      regimeConfidence: signal.indicators?.fourStateRegime?.diagnostics?.regimeConfidence ?? null,
      regimeAge: signal.indicators?.fourStateRegime?.diagnostics?.regimeAge ?? null,
      fourStateRegime: signal.indicators?.fourStateRegime?.regime ?? null,
      fourStatePositionMultiplier: signal.indicators?.fourStateRegime?.positionMultiplier ?? null,
      dominantGate: signal.indicators?.exceptionType ?? signal.indicators?.exceptionDetails?.type ?? null,
      // Gate multiplier stack for compression analysis
      gateMultiplierStack: {
        qualityScore: signal.indicators?.qualityScore ?? null,
        qualityTier: signal.indicators?.qualityBreakdown ?? null,
        exceptionMultiplier: signal.indicators?.exceptionDetails?.positionMultiplier ?? null,
        fourStateMultiplier: signal.indicators?.fourStateRegime?.positionMultiplier ?? null,
        strongAdxMultiplier: signal.indicators?.strongAdxOverride?.positionSizeMultiplier ?? null,
        continuationMultiplier: signal.indicators?.continuationMode?.positionSizeMultiplier ?? null,
        lateGrindMultiplier: signal.indicators?.lateGrindAcceptance?.positionSizeMultiplier ?? null,
        meanReversionMultiplier: signal.indicators?.meanReversion?.positionMultiplier ?? null,
        trendAccelerationMultiplier: signal.indicators?.trendAcceleration?.positionSizeMultiplier ?? null,
        priceActionMultiplier: signal.indicators?.priceActionEarlyEntry?.positionSizeMultiplier ?? null,
      },
      // Timeframe alignment
      tf_4h_trend: mfs.timeframes['4h'].trend ?? null,
      tf_1h_trend: mfs.timeframes['1h'].trend ?? null,
      tf_30m_trend: mfs.timeframes['30m'].trend ?? null,
      tf_15m_trend: mfs.timeframes['15m'].trend ?? null,
      // MOMENTUM FORENSICS: Complete momentum state for post-trade analysis
      smart_momentum_score: signal.indicators?.smartMomentum?.score ?? null,
      smart_momentum_direction: signal.indicators?.smartMomentum?.direction ?? null,
      smart_momentum_accelerating: signal.indicators?.smartMomentum?.isAccelerating ?? null,
      smart_momentum_weakening: signal.indicators?.smartMomentum?.isWeakening ?? null,
      smart_momentum_exhausted: signal.indicators?.smartMomentum?.isExhausted ?? null,
      momentum_macd_slope: signal.indicators?.smartMomentum?.components?.macdSlope ?? mfs.momentum?.macdSlope ?? null,
      momentum_overextension_atr: signal.indicators?.smartMomentum?.overextensionATR ?? null,
      momentum_state: signal.indicators?.momentumState ?? mfs.momentumState ?? null,
      momentum_confirms: signal.indicators?.momentumConfirms ?? mfs.momentum?.confirms ?? null,
      // ENTRY DISTRIBUTION FORENSICS (Point 6: track for post-trade analysis)
      weighted_score: signal.indicators?.directionContext?.weightedScore ?? signal.indicators?.weightedScore ?? null,
      derived_direction: signal.indicators?.derivedDirection ?? null,
      derived_source: signal.indicators?.derivedSource ?? null,
      // Timestamp
      snapshot_created_at: new Date().toISOString(),
    };
    
    logger.info(`📸 Entry snapshot created for ${signal.symbol}: quality=${entrySnapshot.quality_score}, ADX=${entrySnapshot.adx?.toFixed(1)}, move=${signal.signal_type === 'long' ? entrySnapshot.move_from_24h_low_percent?.toFixed(2) : entrySnapshot.move_from_24h_high_percent?.toFixed(2)}%`);

    // Create position record with all trade data including reversal tracking
    const { data: position, error: positionError } = await supabase
      .from('positions')
      .insert({
        user_id: user.id,
        signal_id: signalId,
        symbol: signal.symbol,
        side,
        order_type: 'MARKET',
        quantity,
        entry_price: executedPrice,
        current_price: executedPrice,
        stop_loss: stopLoss,
        take_profit: takeProfit,
        status: 'active',
        trend: currentTrend,
        confidence_score: signal.confidence_score,
        trend_consistency: trendConsistency,
        opened_by_rebalancer: signal.created_by_rebalancer || false,
        binance_order_id: isPaperTrading ? null : orderData.orderId?.toString(),
        strategy_name: signal.strategy_name || 'Unknown',
        executed_at: new Date().toISOString(),
        // NEW: Reversal decision tracking for analytics
        reversal_decision: reversalDecision,
        reversal_score: reversalScore,
        reversal_details: reversalDetails,
        // NEW: Entry exception type for monitor-positions alignment
        entry_exception_type: entryExceptionType,
        // PHASE 2/4: Enhanced tracking fields
        initial_risk_amount: initialRiskAmount,
        // MEAN REVERSION: Entry ATR for volatility-adjusted exits
        entry_atr: entryAtr,
        entry_atr_percent: entryAtrPercent,
        execution_slippage_percent: postExecutionSlippage,
        volume_relaxation_applied: volumeRelaxationApplied,
        // PHASE 2: Entry snapshot for forensics
        entry_snapshot: entrySnapshot,
      })
      .select()
      .single();

    if (positionError || !position) {
      logger.error('Failed to create position record: ' + (positionError?.message || 'Unknown error'));
      throw new Error('Failed to create position record: ' + (positionError?.message || 'Unknown error'));
    }

    if (!isPaperTrading) {
      // Place stop-loss and take-profit orders only for live trading
      // Prices are already rounded to tick size precision above

      // Place stop-loss order
      const slQueryString = `symbol=${signal.symbol}&side=${side === 'BUY' ? 'SELL' : 'BUY'}&type=STOP_LOSS_LIMIT&quantity=${quantity}&price=${stopLoss}&stopPrice=${stopLoss}&timeInForce=GTC&timestamp=${Date.now()}`;
      const slSignatureHex = await createBinanceSignature(slQueryString, binanceApiSecret!);

      const slResponse = await fetch(
        `https://api.binance.com/api/v3/order?${slQueryString}&signature=${slSignatureHex}`,
        {
          method: 'POST',
          headers: { 'X-MBX-APIKEY': binanceApiKey! },
        }
      );

      if (!slResponse.ok) {
        const slErrorText = await slResponse.text();
        logger.error(`⚠️ Failed to place stop-loss order for position ${position.id}: ${slErrorText}`);
        // Send notification but don't throw - position is already created
        await sendBinanceApiErrorNotification(supabaseUrl!, supabaseKey!, user.id, {
          operation: 'place_stop_loss',
          symbol: signal.symbol,
          positionId: position.id,
          binanceErrorMsg: slErrorText,
          httpStatus: slResponse.status,
          context: `Failed to place stop-loss at $${stopLoss} - manual intervention may be needed`,
        });
      } else {
        logger.info(`✓ Stop-loss order placed for position ${position.id} at $${stopLoss}`);
      }

      // Place take-profit order
      const tpQueryString = `symbol=${signal.symbol}&side=${side === 'BUY' ? 'SELL' : 'BUY'}&type=TAKE_PROFIT_LIMIT&quantity=${quantity}&price=${takeProfit}&stopPrice=${takeProfit}&timeInForce=GTC&timestamp=${Date.now()}`;
      const tpSignatureHex = await createBinanceSignature(tpQueryString, binanceApiSecret!);

      const tpResponse = await fetch(
        `https://api.binance.com/api/v3/order?${tpQueryString}&signature=${tpSignatureHex}`,
        {
          method: 'POST',
          headers: { 'X-MBX-APIKEY': binanceApiKey! },
        }
      );

      if (!tpResponse.ok) {
        const tpErrorText = await tpResponse.text();
        logger.error(`⚠️ Failed to place take-profit order for position ${position.id}: ${tpErrorText}`);
        // Send notification but don't throw - position is already created
        await sendBinanceApiErrorNotification(supabaseUrl!, supabaseKey!, user.id, {
          operation: 'place_take_profit',
          symbol: signal.symbol,
          positionId: position.id,
          binanceErrorMsg: tpErrorText,
          httpStatus: tpResponse.status,
          context: `Failed to place take-profit at $${takeProfit} - manual intervention may be needed`,
        });
      } else {
        logger.info(`✓ Take-profit order placed for position ${position.id} at $${takeProfit}`);
      }
    }

    // ============================================================
    // PHASE 3: MARK SIGNAL AS EXECUTED (instead of deleting)
    // Preserves signal for traceability and post-trade analysis
    // ============================================================
    const { error: updateSignalError } = await supabase
      .from('trading_signals')
      .update({
        status: 'executed',
        executed_at: new Date().toISOString(),
        position_id: position.id,
      })
      .eq('id', signalId);
    
    if (updateSignalError) {
      logger.warn('Failed to mark signal ' + signalId + ' as executed: ' + updateSignalError.message);
      // Fallback: try to delete if update fails (backward compatibility)
      const { error: deleteSignalError } = await supabase
        .from('trading_signals')
        .delete()
        .eq('id', signalId);
      if (deleteSignalError) {
        logger.warn('Failed to delete signal ' + signalId + ' after execution: ' + deleteSignalError.message);
      }
    } else {
      logger.info(`✓ Signal ${signalId} marked as executed, linked to position ${position.id}`);
    }

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
          tradeId: position.id,
          symbol: signal.symbol,
          side,
          price: executedPrice,
          quantity,
        },
      });
    } catch (notificationError) {
      logError(logger, notificationError, 'Failed to send notification');
    }

    return new Response(
      JSON.stringify({
        success: true,
        position,
        message: side + ' order executed successfully' + (isPaperTrading ? ' (Paper Trading)' : ''),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    logError(logger, error, 'Error executing trade');
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
