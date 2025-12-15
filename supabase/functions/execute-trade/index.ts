import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-manual-execution',
};

// ============= CENTRALIZED ADX THRESHOLDS =============
// CRITICAL: Keep these aligned across all edge functions to prevent silent drift!
// Changes here should be mirrored in: strategy-analyzer, calculate-trend, monitor-positions
const ADX_THRESHOLDS = {
  VERY_WEAK: 12,    // Essentially no trend, avoid trading
  SEVERE_PENALTY: 15, // Below this = severe penalty (-10), consistent mental model
  WEAK: 18,         // Weak trend, mixed momentum allowed with caution
  MINIMUM: 20,      // Hard gate for any signal generation
  MODERATE: 22,     // Momentum confirmation threshold
  STRONG: 25,       // Strong trend, reduced reversal weight
  VERY_STRONG: 30,  // Very strong trend, momentum continuation valid
  EXCEPTIONAL: 35,  // Exceptional trend, relaxed quality thresholds
  EXTREME: 40,      // Extreme trend, maximum confidence bonus
} as const;

// ============= CENTRALIZED STOCHRSI THRESHOLDS =============
// CRITICAL: Keep these aligned across all edge functions to prevent silent drift!
// Changes here should be mirrored in: strategy-analyzer, calculate-trend, monitor-positions, ai-signal-analyzer
const STOCHRSI_THRESHOLDS = {
  EXTREME_OVERSOLD: 10,    // Extremely oversold, strong bounce risk for SHORT
  DEEPLY_OVERSOLD: 15,     // Deeply oversold zone
  OVERSOLD: 20,            // Standard oversold threshold
  OVERSOLD_ZONE: 25,       // Entering oversold territory
  NEUTRAL_LOW: 30,         // Lower neutral boundary
  NEUTRAL_HIGH: 70,        // Upper neutral boundary
  OVERBOUGHT_ZONE: 75,     // Entering overbought territory
  OVERBOUGHT: 80,          // Standard overbought threshold
  DEEPLY_OVERBOUGHT: 85,   // Deeply overbought zone
  EXTREME_OVERBOUGHT: 90,  // Extremely overbought, strong pullback risk for LONG
} as const;

// ============= CENTRALIZED RSI THRESHOLDS =============
// CRITICAL: Keep these aligned across all edge functions to prevent silent drift!
// Changes here should be mirrored in: strategy-analyzer, calculate-trend, monitor-positions, ai-signal-analyzer
const RSI_THRESHOLDS = {
  OVERSOLD: 30,            // Classic oversold level
  BEARISH_PULLBACK: 35,    // RSI showing bearish weakness / SHORT pullback
  BULLISH_PULLBACK: 40,    // RSI showing bullish pullback opportunity
  NEUTRAL_LOW: 45,         // Lower neutral/pullback zone for momentum continuation
  NEUTRAL: 50,             // Neutral RSI
  NEUTRAL_HIGH: 55,        // Upper neutral/rally zone for SHORT momentum continuation
  BEARISH_RALLY: 60,       // RSI showing bearish rally (SHORT entry opportunity)
  BULLISH_STRONG: 65,      // Strong bullish momentum / overbought warning
  OVERBOUGHT: 70,          // Classic overbought level
} as const;

// ============= CENTRALIZED CONFIDENCE THRESHOLDS =============
// CRITICAL: Keep these aligned across all edge functions to prevent silent drift!
// Changes here should be mirrored in: strategy-analyzer, calculate-trend, monitor-positions, ai-signal-analyzer
const CONFIDENCE_THRESHOLDS = {
  VERY_LOW: 40,            // Very weak confidence, heavy position reduction
  LOW: 50,                 // Low confidence, optimal zone lower bound
  OPTIMAL_LOWER: 50,       // Optimal zone start (46% win rate historically)
  OPTIMAL_UPPER: 59,       // Optimal zone end
  DEAD_ZONE_LOWER: 60,     // Dead zone start (31% win rate - avoid!)
  STRONG_1H_MIN: 62,       // Minimum 1h confidence for pullback signals
  HTF_EXCEPTION: 65,       // HTF alignment exception threshold
  STRONG_4H: 68,           // Strong 4h threshold for neutral exceptions
  DEAD_ZONE_UPPER: 69,     // Dead zone end
  PULLBACK_4H_MIN: 70,     // Minimum 4h confidence for pullback opportunities
  RECOVERY_MAX: 70,        // Maximum confidence in recovery mode
  STRONG_1H_REVERSAL: 75,  // Strong 1h for early reversal signals
  PENALTY_LIGHT: 70,       // Light penalty threshold
  PENALTY_MODERATE: 75,    // Moderate penalty threshold  
  PENALTY_STRONG: 80,      // Strong penalty threshold
  PENALTY_HEAVY: 85,       // Heavy penalty threshold (exhaustion risk)
  WEAK_4H: 58,             // Weak 4h threshold for early reversal
  STRONG_ALIGNMENT_1H: 58, // Minimum 1h for strong alignment
} as const;

// ============= RSI MOMENTUM ZONE CONSTRAINTS =============
// Momentum continuation entries require RSI in specific zones to prevent late entries
// LONG momentum zone: 45-65 (NEUTRAL_LOW to BULLISH_STRONG)
// SHORT momentum zone: 35-55 (BEARISH_PULLBACK to NEUTRAL_HIGH)
// Entries outside these zones get 50% score reduction in strategy-analyzer

// ============= StochRSI-RSI CONFLICT RESOLUTION =============
// When StochRSI is at extremes, RSI signals are weighted at 50% to prevent
// self-canceling signals where RSI momentum continuation conflicts with StochRSI reversal risk
const getStochRsiWeightedRsiScore = (
  rsiScore: number,
  stochRsiK: number,
  isLong: boolean
): { score: number; wasReduced: boolean } => {
  const extremeThreshold = isLong 
    ? STOCHRSI_THRESHOLDS.EXTREME_OVERBOUGHT  // 90
    : STOCHRSI_THRESHOLDS.EXTREME_OVERSOLD;   // 10
    
  const isExtreme = isLong 
    ? stochRsiK > extremeThreshold
    : stochRsiK < extremeThreshold;
  
  if (isExtreme) {
    // StochRSI extreme = RSI signal weighted at 50%
    return { score: Math.round(rsiScore * 0.5), wasReduced: true };
  }
  
  return { score: rsiScore, wasReduced: false };
};

// ============= UNIFIED REVERSAL SCORE SYSTEM =============
// Aligned with strategy-analyzer for consistent reversal detection
// Three-tier decision: BLOCK (>=60), REDUCE (40-60), NORMAL (<40)

interface UnifiedReversalResult {
  score: number;
  decision: "BLOCK" | "REDUCE" | "NORMAL";
  positionSizeMultiplier: number;
  reasons: string[];
  adxWeight: number;
}

function calculateUnifiedReversalScore(trendData: any, signalType: string): UnifiedReversalResult {
  const reasons: string[] = [];
  let rawScore = 0;
  
  if (!trendData) {
    return { score: 0, decision: "NORMAL", positionSizeMultiplier: 1.0, reasons: ['No trend data'], adxWeight: 1.0 };
  }
  
  const momentum = trendData.momentum || {};
  const stochRSI = trendData.stochasticRsi || {};
  const aggregated = stochRSI.aggregated || {};
  const htf = trendData.higherTimeframeFilter || {};
  const tf1h = trendData.timeframes?.['1h'] || {};
  const adx = trendData.volatility?.adx || trendData.momentum?.adx || 20;
  const isLong = signalType === 'long';
  
  const stoch4h = stochRSI['4h'] || {};
  const k4h = stoch4h.k ?? 50;
  const trend1h = htf.trend1h || trendData.multiTimeframe?.trend1h || tf1h.trend;
  
  // 1. StochRSI CROSSES (0-50 points)
  if (isLong) {
    const bearishCrossCount = aggregated.bearishCrossCount || 0;
    if (bearishCrossCount >= 2) {
      rawScore += 40;
      reasons.push(`${bearishCrossCount} bearish StochRSI crosses`);
    } else if (bearishCrossCount >= 1) {
      rawScore += 30;
      reasons.push(`StochRSI bearish cross`);
    }
    if ((aggregated.overboughtCount || 0) >= 2) {
      rawScore += 10;
      reasons.push(`Overbought on ${aggregated.overboughtCount} TFs`);
    }
  } else {
    const bullishCrossCount = aggregated.bullishCrossCount || 0;
    if (bullishCrossCount >= 2) {
      rawScore += 40;
      reasons.push(`${bullishCrossCount} bullish StochRSI crosses`);
    } else if (bullishCrossCount >= 1) {
      rawScore += 30;
      reasons.push(`StochRSI bullish cross`);
    }
    if ((aggregated.oversoldCount || 0) >= 2) {
      rawScore += 10;
      reasons.push(`Oversold on ${aggregated.oversoldCount} TFs`);
    }
  }
  
  // 2. StochRSI ZONES (0-25 points) - Apply RSI conflict resolution
  // When RSI pullback + momentum confirms, reduce StochRSI zone penalty by 50%
  const rsi4h = trendData.timeframes?.['4h']?.rsi ?? 50;
  const rsiIndicatesPullback = isLong 
    ? (rsi4h < RSI_THRESHOLDS.BULLISH_PULLBACK || rsi4h < RSI_THRESHOLDS.NEUTRAL_LOW)
    : (rsi4h > RSI_THRESHOLDS.BEARISH_RALLY || rsi4h > RSI_THRESHOLDS.NEUTRAL_HIGH);
  const momentumConfirms = momentum.confirms === true;
  const shouldReduceStochZonePenalty = rsiIndicatesPullback && momentumConfirms;
  
  if (isLong && k4h > STOCHRSI_THRESHOLDS.DEEPLY_OVERBOUGHT) {
    let zoneScore = 15;
    if (shouldReduceStochZonePenalty) {
      zoneScore = Math.round(zoneScore * 0.5);
      reasons.push(`4h StochRSI overbought (K=${k4h.toFixed(1)}) - reduced 50% (RSI pullback + momentum)`);
    } else {
      reasons.push(`4h StochRSI overbought (K=${k4h.toFixed(1)})`);
    }
    rawScore += zoneScore;
  } else if (!isLong && k4h < STOCHRSI_THRESHOLDS.DEEPLY_OVERSOLD) {
    let zoneScore = 15;
    if (shouldReduceStochZonePenalty) {
      zoneScore = Math.round(zoneScore * 0.5);
      reasons.push(`4h StochRSI oversold (K=${k4h.toFixed(1)}) - reduced 50% (RSI pullback + momentum)`);
    } else {
      reasons.push(`4h StochRSI oversold (K=${k4h.toFixed(1)})`);
    }
    rawScore += zoneScore;
  }
  
  // 3. MOMENTUM STATE (0-30 points) - Uses centralized ADX_THRESHOLDS
  const momentumState = momentum.state || "none";
  if (momentumState === "mixed" && adx < ADX_THRESHOLDS.VERY_STRONG) {
    rawScore += 30;
    reasons.push(`Mixed momentum with weak ADX`);
  } else if (!momentum.confirms && momentumState !== "confirmed") {
    rawScore += 20;
    reasons.push(`Momentum not confirmed (state: ${momentumState})`);
  }
  
  // 4. MACD (0-15 points)
  if (momentum.hasDivergence) {
    rawScore += 15;
    reasons.push('MACD divergence');
  } else if (!momentum.macdDirectionAligned) {
    rawScore += 10;
    reasons.push('MACD direction misaligned');
  }
  
  // 5. TIMEFRAME CONFLICTS (0-20 points)
  if ((isLong && trend1h === 'bearish') || (!isLong && trend1h === 'bullish')) {
    rawScore += 15;
    reasons.push(`1h trend is ${trend1h} (opposing ${isLong ? 'LONG' : 'SHORT'})`);
  }
  
  // 6. VOLUME REDUCTION (if confirming)
  if (momentum.volumeConfirms && (momentum.volumeBoost ?? 1.0) > 1.3) {
    rawScore -= 10;
    reasons.push('Volume confirms - risk reduced');
  }
  
  // ADX-based adaptive weight - Uses centralized ADX_THRESHOLDS
  const getAdxWeight = (adxValue: number): number => {
    if (adxValue >= ADX_THRESHOLDS.EXTREME) return 0.4;
    if (adxValue >= ADX_THRESHOLDS.EXCEPTIONAL) return 0.5;
    if (adxValue >= ADX_THRESHOLDS.VERY_STRONG) return 0.6;
    if (adxValue >= ADX_THRESHOLDS.STRONG) return 0.75;
    if (adxValue >= ADX_THRESHOLDS.MINIMUM) return 0.85;
    return 1.0;
  };
  
  const adxWeight = getAdxWeight(adx);
  const finalScore = Math.min(100, Math.max(0, Math.round(rawScore * adxWeight)));
  
  // Three-tier decision
  let decision: "BLOCK" | "REDUCE" | "NORMAL";
  let positionSizeMultiplier: number;
  
  if (finalScore >= 60) {
    decision = "BLOCK";
    positionSizeMultiplier = 0;
  } else if (finalScore >= 40) {
    decision = "REDUCE";
    positionSizeMultiplier = 0.5;
  } else {
    decision = "NORMAL";
    positionSizeMultiplier = 1.0;
  }
  
  return { score: finalScore, decision, positionSizeMultiplier, reasons, adxWeight };
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

    const { signalId, action } = body;
    console.log('Execute trade request:', { signalId, action, userId: user.id });
    
    // Check if this is a manual execution (from UI button click)
    const isManualExecution = req.headers.get('x-manual-execution') === 'true';
    console.log('Is manual execution:', isManualExecution);

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
      console.log('Using user-specific encrypted Binance credentials from vault');
    }

    // Get risk parameters for the user
    const { data: riskParams, error: riskParamsError } = await supabase
      .from('risk_parameters')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (riskParamsError) {
      console.error('Error fetching risk parameters:', riskParamsError);
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
    console.log('Paper trading mode:', isPaperTrading);

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
        .limit(10);
      
      const recentWins = recentTrades?.filter(t => (t.realized_pnl || 0) > 0).length || 0;
      const recentWinRate = recentTrades?.length ? (recentWins / recentTrades.length) * 100 : 50;
      
      // Adjust based on recent performance
      if (recentWinRate >= 70 && recentTrades && recentTrades.length >= 5) {
        effectiveMaxTrades = Math.min(riskParams.max_open_trades + 2, 10); // Bonus for good performance
        console.log(`📈 Dynamic Max Trades: +2 bonus for ${recentWinRate.toFixed(0)}% win rate → ${effectiveMaxTrades}`);
      } else if (recentWinRate < 40 && recentTrades && recentTrades.length >= 5) {
        effectiveMaxTrades = Math.max(Math.floor(riskParams.max_open_trades * 0.5), 1); // Reduce for poor performance
        console.log(`📉 Dynamic Max Trades: Reduced for ${recentWinRate.toFixed(0)}% win rate → ${effectiveMaxTrades}`);
      } else {
        console.log(`📊 Dynamic Max Trades: Standard (${recentWinRate.toFixed(0)}% win rate) → ${effectiveMaxTrades}`);
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
      console.log(`Resetting daily counters (last reset: ${lastResetDate}, today: ${today})`);
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
      console.log(`🔒 Trailing Daily Limit: Peak P&L $${dailyPeakPnl.toFixed(2)} → Locking 50% → Effective limit: ${effectiveDailyLossLimit.toFixed(2)}% (was ${riskParams.daily_loss_limit_percent}%)`);
    }
    
    // Check circuit breaker: Stop trading if daily loss limit exceeded
    const dailyLossPercent = riskParams.portfolio_value > 0 
      ? (currentDailyLoss / riskParams.portfolio_value) * 100 
      : 0;
    if (dailyLossPercent >= effectiveDailyLossLimit) {
      console.error(`❌ CIRCUIT BREAKER TRIGGERED: Daily loss ${dailyLossPercent.toFixed(2)}% >= limit ${effectiveDailyLossLimit.toFixed(2)}%`);
      throw new Error(`Daily loss limit reached (${dailyLossPercent.toFixed(2)}% of ${effectiveDailyLossLimit.toFixed(2)}%). Trading halted for today.`);
    }

    // Get signal details
    const { data: signal, error: signalError } = await supabase
      .from('trading_signals')
      .select('*')
      .eq('id', signalId)
      .maybeSingle();

    if (signalError) {
      console.error('Error fetching signal:', signalError);
      throw new Error('Failed to fetch signal');
    }

    if (!signal) {
      throw new Error('Signal not found');
    }

    console.log(`Executing trade for signal from strategy: ${signal.strategy_name || 'Unknown'}`);

    // ============================================================
    // STRATEGY PERFORMANCE FILTER (aligned with strategy-analyzer)
    // Block underperforming strategies, boost high performers
    // ============================================================
    const STRATEGY_WIN_RATE_THRESHOLD = 40;
    const STRATEGY_MIN_TRADES_FOR_FILTER = 10;
    const STRATEGY_HIGH_PERFORMER_THRESHOLD = 60;
    
    let strategyPerformanceBonus = 0; // Quality score bonus for high performers
    
    const { data: strategyTrades } = await supabase
      .from('positions')
      .select('realized_pnl')
      .eq('user_id', user.id)
      .eq('status', 'closed')
      .eq('strategy_name', signal.strategy_name || '')
      .order('closed_at', { ascending: false })
      .limit(20);
    
    if (strategyTrades && strategyTrades.length >= STRATEGY_MIN_TRADES_FOR_FILTER) {
      const wins = strategyTrades.filter(t => (t.realized_pnl || 0) > 0).length;
      const winRate = (wins / strategyTrades.length) * 100;
      
      if (winRate < STRATEGY_WIN_RATE_THRESHOLD) {
        console.log(`⛔ STRATEGY PERFORMANCE BLOCK: "${signal.strategy_name}" win rate ${winRate.toFixed(1)}% < ${STRATEGY_WIN_RATE_THRESHOLD}%`);
        throw new Error(`Strategy "${signal.strategy_name}" underperforming (${winRate.toFixed(0)}% win rate) - trade cancelled`);
      }
      
      if (winRate >= STRATEGY_HIGH_PERFORMER_THRESHOLD) {
        strategyPerformanceBonus = 5; // +5 quality bonus for high performers (aligned with strategy-analyzer)
        console.log(`⭐ Strategy high performer bonus: "${signal.strategy_name}" win rate ${winRate.toFixed(1)}% → +${strategyPerformanceBonus} quality`);
      } else {
        console.log(`✓ Strategy performance check: "${signal.strategy_name}" win rate ${winRate.toFixed(1)}% >= ${STRATEGY_WIN_RATE_THRESHOLD}%`);
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

    // ============================================================
    // EARLY DUPLICATE CHECK - Prevent race condition by checking BEFORE order execution
    // ============================================================
    const { data: existingPosition } = await supabase
      .from('positions')
      .select('id')
      .eq('signal_id', signalId)
      .maybeSingle();

    if (existingPosition) {
      console.log(`Signal ${signalId} already executed as position ${existingPosition.id}`);
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
      console.warn('Failed to get current trend, using signal trend:', trendError);
    }

    const currentTrend = trendData?.trend || signal.trend;
    const trendConsistency = trendData?.trendConsistency || 0;
    // Fix: atrPercent is under volatility object in calculate-trend response
    const atrPercent = trendData?.volatility?.atrPercent || trendData?.ranging?.atrPercent || 1.5;
    
    // Extract Bollinger Bands data from trend analysis
    const bollingerData = trendData?.bollingerBands || {};
    const bb1h = bollingerData['1h'] || {};
    const bb4h = bollingerData['4h'] || {};
    
    console.log(`Current market trend: ${currentTrend}, Consistency: ${trendConsistency}, ATR: ${atrPercent}%, Signal: ${signal.signal_type}`);
    console.log(`📊 Bollinger Bands: 1h squeeze=${bb1h.squeeze}, %B=${bb1h.percentB?.toFixed(1)}% | 4h squeeze=${bb4h.squeeze}, %B=${bb4h.percentB?.toFixed(1)}%`);

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

    // FILTER 5: ADX HARD GATE - Require minimum trend strength (uses centralized ADX_THRESHOLDS)
    const adxValue = typeof trendData?.volatility?.adx === 'number' 
      ? trendData.volatility.adx 
      : (typeof trendData?.volatility?.adx === 'object' ? trendData.volatility.adx?.value : 0);
    
    if (adxValue < ADX_THRESHOLDS.MINIMUM) {
      console.log(`❌ ADX HARD GATE: ADX ${adxValue?.toFixed(1) || 0} < ${ADX_THRESHOLDS.MINIMUM} - trade cancelled`);
      throw new Error(`Trend strength too weak (ADX: ${adxValue?.toFixed(1) || 0}) - minimum required: ${ADX_THRESHOLDS.MINIMUM}`);
    }
    console.log(`✓ ADX hard gate passed: ${adxValue?.toFixed(1)} >= ${ADX_THRESHOLDS.MINIMUM}`);

    // ============================================================
    // DYNAMIC QUALITY THRESHOLD (aligned with strategy-analyzer)
    // Adjust quality threshold based on ADX and recovery mode - Uses centralized ADX_THRESHOLDS
    // ============================================================
    const isInRecoveryMode = riskParams.consecutive_losses >= riskParams.consecutive_loss_threshold;
    let dynamicQualityThreshold = 55; // Base threshold
    
    if (isInRecoveryMode) {
      dynamicQualityThreshold = 65; // Stricter in recovery mode
      console.log(`🔒 Recovery Mode: Quality threshold raised to ${dynamicQualityThreshold}`);
    } else if (adxValue >= ADX_THRESHOLDS.EXCEPTIONAL) {
      dynamicQualityThreshold = 50; // Relaxed in very strong trends
      console.log(`📈 Strong trend (ADX ${adxValue.toFixed(1)}): Quality threshold lowered to ${dynamicQualityThreshold}`);
    } else if (adxValue >= ADX_THRESHOLDS.STRONG) {
      dynamicQualityThreshold = 53;
    }
    
    // Check signal quality score from indicators
    const signalQualityScore = signal.indicators?.qualityScore ?? 0;
    if (signalQualityScore > 0 && signalQualityScore < dynamicQualityThreshold) {
      throw new Error(`Signal quality score (${signalQualityScore}) below dynamic threshold (${dynamicQualityThreshold}) - trade cancelled`);
    }
    console.log(`✓ Quality check: ${signalQualityScore} >= ${dynamicQualityThreshold} threshold`);

    // ============================================================
    // VOLUME SCORE VALIDATION (aligned with strategy-analyzer)
    // Volume score from calculate-trend provides additional confirmation
    // ============================================================
    const volumeScore = trendData?.volumeScore ?? 0;
    const volumeConfirms = trendData?.momentum?.volumeConfirms ?? false;
    
    // Warn on low volume but don't block unless extremely low
    if (volumeScore === 0 && !volumeConfirms) {
      console.warn(`⚠️ Low volume score (${volumeScore}) - trade may have higher risk`);
    } else if (volumeScore >= 5) {
      console.log(`✅ Volume confirms trend: score=${volumeScore}/10`);
    }

    // NOTE: Confidence filter removed - quality score calculation already incorporates
    // confidence penalties. Signal quality score (stored in indicators.qualityScore) is the
    // primary filter. Having a separate confidence gate was causing double-filtering and
    // blocking signals that passed quality threshold but had lower raw confidence scores.
    console.log(`📊 Signal confidence: ${signal.confidence_score}% (no separate gate - quality score is primary filter)`);

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
      // Double squeeze = volatility contraction, breakout imminent
      console.log(`🔥 DOUBLE SQUEEZE detected: Both 1h and 4h bands contracted - breakout imminent`);
      bollingerBoostMultiplier = 1.2; // 20% boost for squeeze breakout setup
    } else if (is1hSqueeze || is4hSqueeze) {
      console.log(`📊 Single timeframe squeeze detected: 1h=${is1hSqueeze}, 4h=${is4hSqueeze}`);
      bollingerBoostMultiplier = 1.1; // 10% boost for single squeeze
    }
    
    // %B position analysis - detect overbought/oversold for entry timing
    // %B > 100 = price above upper band (overbought for LONG)
    // %B < 0 = price below lower band (oversold for SHORT)
    
    if (signalSideForBB === 'BUY') {
      if (percentB1h > 100) {
        // Price above upper band - potential overextension
        console.warn(`⚠️ BB Warning: Price above upper band (%B=${percentB1h.toFixed(1)}%) - potential overbought`);
        bollingerBoostMultiplier *= 0.85; // 15% reduction for overbought entry
      } else if (percentB1h < 20 && percentB4h < 30) {
        // Price near lower band in both timeframes - good entry for LONG
        console.log(`✅ BB confirms LONG: Price near lower band, good entry (%B 1h=${percentB1h.toFixed(1)}%, 4h=${percentB4h.toFixed(1)}%)`);
        bollingerBoostMultiplier *= 1.15; // 15% boost for mean reversion entry
      }
    } else if (signalSideForBB === 'SELL') {
      if (percentB1h < 0) {
        // Price below lower band - potential oversold
        console.warn(`⚠️ BB Warning: Price below lower band (%B=${percentB1h.toFixed(1)}%) - potential oversold`);
        bollingerBoostMultiplier *= 0.85; // 15% reduction for oversold entry
      } else if (percentB1h > 80 && percentB4h > 70) {
        // Price near upper band in both timeframes - good entry for SHORT
        console.log(`✅ BB confirms SHORT: Price near upper band, good entry (%B 1h=${percentB1h.toFixed(1)}%, 4h=${percentB4h.toFixed(1)}%)`);
        bollingerBoostMultiplier *= 1.15; // 15% boost for mean reversion entry
      }
    }
    
    // Breakout detection - price moving from squeeze
    // Fix: Use correct field from calculate-trend response
    const breakoutPotential = trendData?.bollingerBands?.breakoutPotential || false;
    if (breakoutPotential) {
      console.log(`🚀 HIGH BREAKOUT POTENTIAL detected - bands expanding after squeeze`);
      bollingerBoostMultiplier *= 1.1; // Additional 10% for breakout momentum
    }
    
    // Store Bollinger boost for position sizing
    (signal as any).bollingerBoostMultiplier = bollingerBoostMultiplier;
    console.log(`📊 Final Bollinger Boost Multiplier: ${bollingerBoostMultiplier.toFixed(2)}x`);

    // ============================================================
    // VOLUME PROFILE FILTER - Fetch 24hr ticker data for volume analysis
    // ============================================================
    const ticker24hResponse = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${signal.symbol}`);
    if (!ticker24hResponse.ok) {
      const errorText = await ticker24hResponse.text();
      console.error('Binance 24hr ticker API error:', errorText);
      throw new Error(`Failed to fetch 24hr ticker for ${signal.symbol}: ${ticker24hResponse.status}`);
    }
    const ticker24h = await ticker24hResponse.json();
    const currentPrice = parseFloat(ticker24h.lastPrice);
    const volume24h = parseFloat(ticker24h.volume); // Base asset volume
    const quoteVolume24h = parseFloat(ticker24h.quoteVolume); // USDT volume
    const priceChangePercent = parseFloat(ticker24h.priceChangePercent);

    console.log(`📊 Volume Profile: 24h Volume=${volume24h.toFixed(2)}, Quote Volume=$${quoteVolume24h.toFixed(2)}, Price Change=${priceChangePercent.toFixed(2)}%`);

    // FILTER 6: Minimum volume requirement (avoid illiquid periods)
    // Require at least $10M USDT volume in last 24h for major pairs, $1M for others
    const isMainPair = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT'].includes(signal.symbol);
    const minQuoteVolume = isMainPair ? 10_000_000 : 1_000_000;
    
    if (quoteVolume24h < minQuoteVolume) {
      throw new Error(`Insufficient 24h volume ($${(quoteVolume24h/1_000_000).toFixed(2)}M < $${minQuoteVolume/1_000_000}M required) - trade cancelled to avoid illiquid market`);
    }
    console.log(`✓ Volume check passed: $${(quoteVolume24h/1_000_000).toFixed(2)}M >= $${minQuoteVolume/1_000_000}M minimum`);

    // Fetch recent klines to analyze volume profile (last 50 periods of 15m for OBV calculation)
    const klineResponse = await fetch(`https://api.binance.com/api/v3/klines?symbol=${signal.symbol}&interval=15m&limit=50`);
    if (!klineResponse.ok) {
      console.warn('Failed to fetch klines for volume profile analysis, proceeding with basic checks');
    } else {
      const klines = await klineResponse.json();
      
      // Safety check for empty or invalid klines data
      if (!Array.isArray(klines) || klines.length < 20) {
        console.warn('Insufficient kline data for volume analysis, skipping advanced filters');
      } else {
        const volumes = klines.map((k: any[]) => parseFloat(k[5])); // Volume is at index 5
        const closes = klines.map((k: any[]) => parseFloat(k[4])); // Close price at index 4
        
        // Calculate basic volume metrics with safety checks
        const recentVolumes = volumes.slice(-20);
        const avgVolume = recentVolumes.length > 0 
          ? recentVolumes.reduce((a: number, b: number) => a + b, 0) / recentVolumes.length 
          : 1;
        const currentVolume = volumes[volumes.length - 1] || 0;
        const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 1;

        console.log(`📊 Current 15m Volume: ${currentVolume.toFixed(2)}, Avg: ${avgVolume.toFixed(2)}, Ratio: ${volumeRatio.toFixed(2)}x`);

        // FILTER 7: Avoid extremely low volume periods (< 20% of average)
        // Stricter than before (was 10%) to avoid illiquid entries
        if (volumeRatio < 0.2) {
          throw new Error(`Current volume too low (${(volumeRatio * 100).toFixed(0)}% of average) - trade cancelled to avoid illiquid entry`);
        }

      // Log volume spike detection (informational)
      if (volumeRatio > 2.0) {
        console.log(`⚡ VOLUME SPIKE detected: ${volumeRatio.toFixed(2)}x average - high activity period`);
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

      console.log(`📈 OBV Analysis: Current=${obv.toFixed(0)}, Trend=${obvTrend}, Change=${obvChange.toFixed(2)}%, Direction=${obvDirection}`);

      // FILTER 10: OBV trend confirmation
      // For LONG signals, OBV should be rising (bullish volume accumulation)
      // For SHORT signals, OBV should be falling (bearish volume distribution)
      const signalSide = signal.signal_type === 'long' ? 'BUY' : 'SELL';
      
      // FILTER 10: OBV trend confirmation - BLOCK on strong divergence
      if (signalSide === 'BUY' && obvDirection === 'bearish' && obvChange < -15) {
        throw new Error(`OBV divergence: LONG signal but volume strongly bearish (${obvChange.toFixed(1)}% decline) - trade cancelled`);
      }
      
      if (signalSide === 'SELL' && obvDirection === 'bullish' && obvChange > 15) {
        throw new Error(`OBV divergence: SHORT signal but volume strongly bullish (${obvChange.toFixed(1)}% rise) - trade cancelled`);
      }
      
      // Warn on moderate divergence (don't block)
      if (signalSide === 'BUY' && obvDirection === 'bearish' && obvChange < -10) {
        console.warn(`⚠️ OBV DIVERGENCE: LONG signal but OBV is bearish (${obvChange.toFixed(2)}% decline)`);
      }
      if (signalSide === 'SELL' && obvDirection === 'bullish' && obvChange > 10) {
        console.warn(`⚠️ OBV DIVERGENCE: SHORT signal but OBV is bullish (${obvChange.toFixed(2)}% rise)`);
      }

      // Calculate volume boost multiplier based on OBV confirmation
      let obvBoostMultiplier = 1.0;
      
      if (signalSide === 'BUY' && obvDirection === 'bullish' && obvChange > 5) {
        obvBoostMultiplier = 1.15; // 15% boost for strong OBV confirmation
        console.log(`✅ OBV confirms LONG: Volume accumulation detected, boost=${obvBoostMultiplier}x`);
      } else if (signalSide === 'SELL' && obvDirection === 'bearish' && obvChange < -5) {
        obvBoostMultiplier = 1.15; // 15% boost for strong OBV confirmation
        console.log(`✅ OBV confirms SHORT: Volume distribution detected, boost=${obvBoostMultiplier}x`);
      } else if ((signalSide === 'BUY' && obvDirection === 'bearish') || 
                 (signalSide === 'SELL' && obvDirection === 'bullish')) {
        obvBoostMultiplier = 0.85; // 15% reduction for OBV divergence
        console.log(`⚠️ OBV divergence detected, reducing position size by 15%`);
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
      
      console.log(`📈 VWAP Analysis: VWAP=$${currentVWAP.toFixed(2)}, Current=$${currentPrice.toFixed(2)}, Deviation=${vwapDeviation.toFixed(2)}%`);
      console.log(`📈 VWAP Bands: Lower=$${vwapLowerBand.toFixed(2)}, Upper=$${vwapUpperBand.toFixed(2)}`);
      
      // VWAP position analysis for entry optimization
      let vwapBoostMultiplier = 1.0;
      const vwapSignalSide = signal.signal_type === 'long' ? 'BUY' : 'SELL';
      
      if (vwapSignalSide === 'BUY') {
        if (currentPrice < currentVWAP) {
          // Buying below VWAP = good entry (institutional buyers accumulate below VWAP)
          const discountPercent = Math.abs(vwapDeviation);
          if (discountPercent > 1) {
            vwapBoostMultiplier = 1.2; // 20% boost for significant discount
            console.log(`✅ VWAP confirms LONG: Price ${discountPercent.toFixed(2)}% below VWAP - excellent entry`);
          } else {
            vwapBoostMultiplier = 1.1; // 10% boost for minor discount
            console.log(`✅ VWAP supports LONG: Price slightly below VWAP - good entry`);
          }
        } else if (currentPrice > vwapUpperBand) {
          // Buying above upper VWAP band = overextended - BLOCK trade UNLESS ADX is strong
          const adxValue = trendData?.volatility?.adx || trendData?.momentum?.adx || 0;
          const ADX_EXCEPTION_THRESHOLD = 30; // Allow if trend is strong
          
          if (adxValue >= ADX_EXCEPTION_THRESHOLD) {
            // Strong trend exception - allow LONG even at overbought levels
            vwapBoostMultiplier = 0.8; // 20% reduction for caution
            console.log(`⚠️ VWAP EXCEPTION: Price $${currentPrice.toFixed(2)} above upper band but ADX=${adxValue.toFixed(1)} >= ${ADX_EXCEPTION_THRESHOLD} - allowing LONG with reduced size`);
          } else {
            console.error(`❌ VWAP OVEREXTENSION: Price $${currentPrice.toFixed(2)} above upper VWAP band $${vwapUpperBand.toFixed(2)} (ADX=${adxValue.toFixed(1)} < ${ADX_EXCEPTION_THRESHOLD})`);
            throw new Error(`Price above upper VWAP band - overextended LONG entry blocked (ADX too weak)`);
          }
        } else if (vwapDeviation > 1.0) {
          // Buying significantly above VWAP - reduce position
          vwapBoostMultiplier = 0.75; // 25% reduction for above-VWAP entry
          console.log(`📊 VWAP: Price ${vwapDeviation.toFixed(2)}% above VWAP - reducing position`);
        } else if (vwapDeviation > 0.5) {
          // Buying above VWAP but within bands
          vwapBoostMultiplier = 0.9; // 10% reduction
          console.log(`📊 VWAP neutral: Price ${vwapDeviation.toFixed(2)}% above VWAP`);
        }
      } else if (vwapSignalSide === 'SELL') {
        if (currentPrice > currentVWAP) {
          // Selling above VWAP = good entry (institutional sellers distribute above VWAP)
          const premiumPercent = vwapDeviation;
          if (premiumPercent > 1) {
            vwapBoostMultiplier = 1.2; // 20% boost for significant premium
            console.log(`✅ VWAP confirms SHORT: Price ${premiumPercent.toFixed(2)}% above VWAP - excellent entry`);
          } else {
            vwapBoostMultiplier = 1.1; // 10% boost for minor premium
            console.log(`✅ VWAP supports SHORT: Price slightly above VWAP - good entry`);
          }
        } else if (currentPrice < vwapLowerBand) {
          // Selling below lower VWAP band = oversold - BLOCK trade UNLESS ADX is strong
          const adxValue = trendData?.volatility?.adx || trendData?.momentum?.adx || 0;
          const ADX_EXCEPTION_THRESHOLD = 30; // Allow if trend is strong
          
          if (adxValue >= ADX_EXCEPTION_THRESHOLD) {
            // Strong trend exception - allow SHORT even at oversold levels
            vwapBoostMultiplier = 0.8; // 20% reduction for caution
            console.log(`⚠️ VWAP EXCEPTION: Price $${currentPrice.toFixed(2)} below lower band but ADX=${adxValue.toFixed(1)} >= ${ADX_EXCEPTION_THRESHOLD} - allowing SHORT with reduced size`);
          } else {
            console.error(`❌ VWAP OVEREXTENSION: Price $${currentPrice.toFixed(2)} below lower VWAP band $${vwapLowerBand.toFixed(2)} (ADX=${adxValue.toFixed(1)} < ${ADX_EXCEPTION_THRESHOLD})`);
            throw new Error(`Price below lower VWAP band - oversold SHORT entry blocked (ADX too weak)`);
          }
        } else if (vwapDeviation < -1.0) {
          // Selling significantly below VWAP - reduce position
          vwapBoostMultiplier = 0.75; // 25% reduction
          console.log(`📊 VWAP: Price ${Math.abs(vwapDeviation).toFixed(2)}% below VWAP - reducing position`);
        } else if (vwapDeviation < -0.5) {
          // Selling below VWAP but within bands
          vwapBoostMultiplier = 0.9; // 10% reduction
          console.log(`📊 VWAP neutral: Price ${Math.abs(vwapDeviation).toFixed(2)}% below VWAP`);
        }
      }
      
      // Store VWAP boost for position sizing
      (signal as any).vwapBoostMultiplier = vwapBoostMultiplier;
      console.log(`📈 Final VWAP Boost Multiplier: ${vwapBoostMultiplier.toFixed(2)}x`);
      } // Close inner else block (klines valid)
    } // Close outer else block (klineResponse ok)

    // ============================================================
    // SLIPPAGE PROTECTION - Pre-trade price validation
    // ============================================================
    const maxSlippagePercent = 0.5; // Maximum 0.5% slippage tolerance
    const signalEntryPrice = signal.entry_price || currentPrice;
    const priceDeviation = Math.abs((currentPrice - signalEntryPrice) / signalEntryPrice) * 100;

    console.log(`💱 Slippage Check: Signal Entry=$${signalEntryPrice.toFixed(2)}, Current=$${currentPrice.toFixed(2)}, Deviation=${priceDeviation.toFixed(3)}%`);

    // FILTER 8: Pre-execution slippage check
    if (priceDeviation > maxSlippagePercent) {
      throw new Error(`Price moved ${priceDeviation.toFixed(2)}% since signal (max ${maxSlippagePercent}%) - trade cancelled to avoid slippage`);
    }
    console.log(`✓ Pre-trade slippage check passed: ${priceDeviation.toFixed(3)}% < ${maxSlippagePercent}% max`);

    // Fetch order book depth for additional slippage analysis
    const depthResponse = await fetch(`https://api.binance.com/api/v3/depth?symbol=${signal.symbol}&limit=10`);
    if (depthResponse.ok) {
      const depth = await depthResponse.json();
      const bestBid = parseFloat(depth.bids[0][0]);
      const bestAsk = parseFloat(depth.asks[0][0]);
      const spread = ((bestAsk - bestBid) / bestBid) * 100;
      
      console.log(`📖 Order Book: Bid=$${bestBid.toFixed(2)}, Ask=$${bestAsk.toFixed(2)}, Spread=${spread.toFixed(4)}%`);

      // FILTER 9: Wide spread protection (avoid illiquid order books)
      const maxSpreadPercent = 0.1; // Max 0.1% spread
      if (spread > maxSpreadPercent) {
        throw new Error(`Order book spread too wide (${spread.toFixed(3)}% > ${maxSpreadPercent}%) - trade cancelled to avoid slippage`);
      }
      console.log(`✓ Spread check passed: ${spread.toFixed(4)}% < ${maxSpreadPercent}% max`);
    }

    // ============================================================
    // UNIFIED REVERSAL SCORE SYSTEM - Three-tier decision
    // BLOCK (>=60): Cancel trade
    // REDUCE (40-60): Proceed with 50% position size
    // NORMAL (<40): Full position size
    // ============================================================
    const unifiedReversalResult = calculateUnifiedReversalScore(trendData, signal.signal_type);
    console.log(`🔄 Unified Reversal: ${unifiedReversalResult.score}/100 (ADX weight: ${unifiedReversalResult.adxWeight}) → ${unifiedReversalResult.decision}`);
    if (unifiedReversalResult.reasons.length > 0) {
      console.log(`   Factors: ${unifiedReversalResult.reasons.slice(0, 3).join(', ')}`);
    }
    
    // Store reversal position multiplier for position sizing
    let reversalPositionMultiplier = unifiedReversalResult.positionSizeMultiplier;
    
    if (unifiedReversalResult.decision === "BLOCK") {
      throw new Error(`🛑 Unified Reversal BLOCK (${unifiedReversalResult.score}/100) - ${unifiedReversalResult.reasons.slice(0, 2).join(', ')} - trade cancelled`);
    }
    
    if (unifiedReversalResult.decision === "REDUCE") {
      console.log(`⚠️ Unified Reversal REDUCE: 50% position size due to score ${unifiedReversalResult.score}/100`);
    } else {
      console.log(`✓ Unified reversal check passed: ${unifiedReversalResult.score}/100 < 40 threshold`);
    }

    // Use strategy's configured stop loss and take profit from signal
    let stopLoss = signal.stop_loss;
    const takeProfit = signal.take_profit;

    // Validate SL/TP are present
    if (!stopLoss || !takeProfit) {
      throw new Error(`Signal missing stop_loss (${stopLoss}) or take_profit (${takeProfit})`);
    }

    // ============================================================
    // MINIMUM STOP LOSS DISTANCE - Prevent premature exits from volatility
    // Enforce minimum 1% distance from entry to prevent tight stops
    // ============================================================
    const MIN_STOP_DISTANCE_PERCENT = 1.0; // 1% minimum stop loss distance
    const signalSide = signal.signal_type === 'long' ? 'BUY' : 'SELL';
    
    if (signalSide === 'BUY') {
      // For LONG: Stop loss must be at least 1% below entry
      const minStopLoss = currentPrice * (1 - MIN_STOP_DISTANCE_PERCENT / 100);
      if (stopLoss > minStopLoss) {
        const originalDistance = ((currentPrice - stopLoss) / currentPrice) * 100;
        console.log(`⚠️ STOP LOSS TOO TIGHT: Original SL ${stopLoss.toFixed(2)} is only ${originalDistance.toFixed(2)}% from entry`);
        stopLoss = minStopLoss;
        console.log(`✓ Adjusted SL to ${stopLoss.toFixed(2)} (${MIN_STOP_DISTANCE_PERCENT}% minimum distance)`);
      }
    } else {
      // For SHORT: Stop loss must be at least 1% above entry
      const minStopLoss = currentPrice * (1 + MIN_STOP_DISTANCE_PERCENT / 100);
      if (stopLoss < minStopLoss) {
        const originalDistance = ((stopLoss - currentPrice) / currentPrice) * 100;
        console.log(`⚠️ STOP LOSS TOO TIGHT: Original SL ${stopLoss.toFixed(2)} is only ${originalDistance.toFixed(2)}% from entry`);
        stopLoss = minStopLoss;
        console.log(`✓ Adjusted SL to ${stopLoss.toFixed(2)} (${MIN_STOP_DISTANCE_PERCENT}% minimum distance)`);
      }
    }

    console.log(`Using strategy SL: ${stopLoss.toFixed(2)}, TP: ${takeProfit.toFixed(2)} (minimum ${MIN_STOP_DISTANCE_PERCENT}% distance enforced)`);

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
    const minRiskReward = 1.5; // Optimal for high win rate - closer TPs are more likely to hit
    
    console.log(`📊 Risk/Reward Analysis: Risk=$${riskAmount.toFixed(2)} (${((riskAmount/currentPrice)*100).toFixed(2)}%), Reward=$${rewardAmount.toFixed(2)} (${((rewardAmount/currentPrice)*100).toFixed(2)}%), R:R=${riskRewardRatio.toFixed(2)}:1`);
    
    if (riskRewardRatio < minRiskReward) {
      throw new Error(`Risk/Reward ratio too low (${riskRewardRatio.toFixed(2)}:1 < ${minRiskReward}:1 required) - trade cancelled`);
    }
    console.log(`✓ R:R check passed: ${riskRewardRatio.toFixed(2)}:1 >= ${minRiskReward}:1 minimum`);

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
          trendData: {
            trend: currentTrend,
            confidence: signal.confidence_score || 0,
            trendConsistency: trendConsistency,
            adx: trendData?.adx || 0,
            rsi: trendData?.rsi || 50,
            macdHistogram: trendData?.macd?.histogram || 0,
            stochRSI: trendData?.stochRSI?.['1h'] || { k: 50, d: 50, signal: 'neutral' },
            bollingerBands: {
              percentB: bb1h.percentB || 50,
              squeeze: bb1h.squeeze || false
            },
            momentum: trendData?.momentum || { confirms: false, divergence: false },
            volumeConfirms: trendData?.volumeConfirms || false
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
        
        console.log(`🤖 AI Analysis: ${analysis.recommendation.toUpperCase()}`);
        console.log(`   Risk Level: ${analysis.riskLevel} | Conf Adj: ${aiConfidenceAdjustment > 0 ? '+' : ''}${aiConfidenceAdjustment} | Size: ${aiPositionMultiplier}x`);
        console.log(`   Factors: ${analysis.keyFactors?.slice(0, 3).join(' | ')}`);
        
        // AI can BLOCK a trade if it recommends "avoid" OR risk level is "high"
        if (analysis.recommendation === 'avoid') {
          throw new Error(`AI recommends AVOID: ${analysis.reasoning?.slice(0, 100)}`);
        }
        if (analysis.riskLevel === 'high') {
          throw new Error(`AI risk level HIGH: ${analysis.keyFactors?.slice(0, 2).join(', ')}`);
        }
        // Medium risk: reduce position size by 50%
        if (analysis.riskLevel === 'medium') {
          aiPositionMultiplier *= 0.5;
          console.log(`⚠️ AI medium risk detected - position size reduced by 50% (multiplier: ${aiPositionMultiplier}x)`);
        }
      } else if (aiError) {
        console.warn('AI analysis unavailable, proceeding with standard filters:', aiError);
      }
      } catch (aiException) {
        // Don't block trades if AI service fails (unless it explicitly recommends avoid or high risk)
        if (aiException instanceof Error && (aiException.message.includes('AI recommends AVOID') || aiException.message.includes('AI risk level HIGH'))) {
          throw aiException;
        }
        console.warn('AI analysis skipped:', aiException instanceof Error ? aiException.message : 'Unknown error');
      }
    } else {
      console.log('🤖 AI analysis disabled by user setting');
    }

    // Fetch strategy's risk settings to get positionSizePercent
    let positionSizePercent = 1.0; // Default fallback if strategy not found
    
    // First check if signal has positionSizePercent in indicators (for rebalancer signals)
    if (signal.indicators && typeof signal.indicators === 'object' && 'positionSizePercent' in signal.indicators) {
      positionSizePercent = signal.indicators.positionSizePercent as number;
      console.log(`Using signal's positionSizePercent from indicators: ${positionSizePercent}%`);
    } else if (signal.strategy_id) {
      // Fetch from strategy for regular strategy signals
      const { data: strategy } = await supabase
        .from('custom_strategies')
        .select('risk_settings')
        .eq('id', signal.strategy_id)
        .maybeSingle();
      
      if (strategy?.risk_settings && typeof strategy.risk_settings === 'object' && 'positionSizePercent' in strategy.risk_settings) {
        positionSizePercent = strategy.risk_settings.positionSizePercent as number;
        console.log(`Using strategy's positionSizePercent: ${positionSizePercent}%`);
      } else {
        console.warn('Strategy risk_settings missing positionSizePercent, using default 1%');
      }
    } else {
      console.warn('Signal has no strategy_id or indicators.positionSizePercent, using default 1%');
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
          console.log(`🎯 Kelly Criterion: WinRate=${(winRate*100).toFixed(1)}%, AvgWin=$${avgWin.toFixed(2)}, AvgLoss=$${avgLoss.toFixed(2)}`);
          console.log(`   → Full Kelly=${kellyPercent.toFixed(2)}%, Half Kelly=${halfKelly.toFixed(2)}%, Capped=${cappedKelly.toFixed(2)}%`);
        } else {
          console.log(`⚠️ Kelly suggests no bet (negative edge). Using strategy default: ${positionSizePercent}%`);
          kellyAdjustedPositionSize = positionSizePercent * 0.5; // Reduce by 50% when Kelly is negative
        }
      } else {
        console.log(`📊 Kelly: Insufficient data (${historicalTrades?.length || 0}/${minTradesForKelly} trades). Using strategy: ${positionSizePercent}%`);
      }
    }
    
    // Use Kelly-adjusted or strategy position size
    const effectivePositionSize = riskParams.kelly_criterion_enabled !== false ? kellyAdjustedPositionSize : positionSizePercent;
    
    // Calculate position size based on effective position size
    const positionValue = (riskParams.portfolio_value * effectivePositionSize) / 100;
    let quantity = positionValue / currentPrice;
    
    console.log(`Position sizing: ${effectivePositionSize.toFixed(2)}% of $${riskParams.portfolio_value} = $${positionValue.toFixed(2)} / $${currentPrice.toFixed(2)} = ${quantity.toFixed(4)} ${signal.symbol.replace('USDT', '')}`);

    // Apply OBV boost multiplier if available
    const obvBoostMultiplier = (signal as any).obvBoostMultiplier || 1.0;
    if (obvBoostMultiplier !== 1.0) {
      quantity *= obvBoostMultiplier;
      console.log(`OBV adjustment applied: ${obvBoostMultiplier}x -> new quantity: ${quantity.toFixed(4)}`);
    }

    // Apply Bollinger Bands boost multiplier if available
    const bbBoostMultiplier = (signal as any).bollingerBoostMultiplier || 1.0;
    if (bbBoostMultiplier !== 1.0) {
      quantity *= bbBoostMultiplier;
      console.log(`Bollinger Bands adjustment applied: ${bbBoostMultiplier.toFixed(2)}x -> new quantity: ${quantity.toFixed(4)}`);
    }

    // Apply VWAP boost multiplier if available
    const vwapBoostMultiplier = (signal as any).vwapBoostMultiplier || 1.0;
    if (vwapBoostMultiplier !== 1.0) {
      quantity *= vwapBoostMultiplier;
      console.log(`VWAP adjustment applied: ${vwapBoostMultiplier.toFixed(2)}x -> new quantity: ${quantity.toFixed(4)}`);
    }

    // Apply AI-powered position size adjustment
    if (aiPositionMultiplier !== 1.0) {
      quantity *= aiPositionMultiplier;
      console.log(`🤖 AI position adjustment applied: ${aiPositionMultiplier.toFixed(2)}x -> new quantity: ${quantity.toFixed(4)}`);
    }

    // Apply Unified Reversal Score position multiplier (0.5 for REDUCE tier)
    if (reversalPositionMultiplier !== 1.0) {
      quantity *= reversalPositionMultiplier;
      console.log(`⚠️ Reversal score adjustment applied: ${reversalPositionMultiplier.toFixed(2)}x -> new quantity: ${quantity.toFixed(4)}`);
    }

    // Apply confidence-based position size scaling (INVERTED: high confidence = REDUCE size)
    // High confidence indicates trend exhaustion, not strength
    const adjustedConfidence = Math.max(0, Math.min(100, (signal.confidence_score || 0) + aiConfidenceAdjustment));
    const confidence = adjustedConfidence;
    
    // CONFIDENCE INVERSION FIX: High confidence = reduce position (trend exhaustion)
    if (confidence >= 80) {
      quantity *= 0.6; // 40% reduction for very high confidence (likely exhaustion)
      console.log(`⚠️ Position size REDUCED by 40% due to high confidence (${confidence}%) - trend may be exhausted`);
    } else if (confidence >= 70) {
      quantity *= 0.8; // 20% reduction for high confidence
      console.log(`⚠️ Position size REDUCED by 20% due to elevated confidence (${confidence}%)`);
    } else if (confidence < 50) {
      quantity *= 0.7; // 30% reduction for low confidence (weak signal)
      console.log(`Position size reduced by 30% due to low confidence (${confidence}%)`);
    } else {
      // Sweet spot: 50-70% confidence - no adjustment
      console.log(`✓ Position size normal for optimal confidence zone (${confidence}%)`);
    }

    // Apply position size reduction if consecutive losses
    if (riskParams.consecutive_losses >= riskParams.consecutive_loss_threshold) {
      quantity *= (1 - riskParams.position_size_reduction_percent / 100);
      console.log('Position size reduced due to consecutive losses');
    }

    // Round quantity to appropriate decimal places
    quantity = Math.floor(quantity * 1000) / 1000;

    // Safety check: Ensure quantity is not zero or too small
    const minQuantityValue = 0.001; // Minimum viable trade quantity
    if (quantity < minQuantityValue) {
      throw new Error(`Calculated quantity (${quantity}) is too small to execute. Minimum: ${minQuantityValue}`);
    }

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

      // ============================================================
      // POST-EXECUTION SLIPPAGE VALIDATION
      // ============================================================
      const postExecutionSlippage = Math.abs((executedPrice - currentPrice) / currentPrice) * 100;
      console.log(`💱 Post-execution slippage: Expected=$${currentPrice.toFixed(2)}, Got=$${executedPrice.toFixed(2)}, Slippage=${postExecutionSlippage.toFixed(3)}%`);
      
      // Warn on high slippage (> 0.3%) but don't reject since order is already filled
      if (postExecutionSlippage > 0.3) {
        console.warn(`⚠️ HIGH SLIPPAGE WARNING: ${postExecutionSlippage.toFixed(2)}% slippage on execution`);
      }
    }

    // Extract reversal decision from signal indicators for analytics
    const signalIndicators = signal.indicators || {};
    const reversalDecision = signalIndicators.reversalDecision || unifiedReversalResult.decision || 'NORMAL';
    const reversalScore = signalIndicators.reversalScore ?? unifiedReversalResult.score ?? 0;
    const reversalDetails = signalIndicators.reversalDetails || {
      breakdown: {},
      signals: unifiedReversalResult.reasons,
      adxWeight: unifiedReversalResult.adxWeight,
      positionSizeMultiplier: unifiedReversalResult.positionSizeMultiplier,
    };

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
      })
      .select()
      .single();

    if (positionError || !position) {
      console.error('Failed to create position record:', positionError);
      throw new Error(`Failed to create position record: ${positionError?.message || 'Unknown error'}`);
    }

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

      const slResponse = await fetch(
        `https://api.binance.com/api/v3/order?${slQueryString}&signature=${slSignatureHex}`,
        {
          method: 'POST',
          headers: { 'X-MBX-APIKEY': binanceApiKey! },
        }
      );

      if (!slResponse.ok) {
        const slErrorText = await slResponse.text();
        console.error(`⚠️ Failed to place stop-loss order for position ${position.id}:`, slErrorText);
        // Don't throw - position is already created, just log the warning
      } else {
        console.log(`✓ Stop-loss order placed for position ${position.id}`);
      }

      // Place take-profit order
      const tpQueryString = `symbol=${signal.symbol}&side=${side === 'BUY' ? 'SELL' : 'BUY'}&type=TAKE_PROFIT_LIMIT&quantity=${quantity}&price=${takeProfit}&stopPrice=${takeProfit}&timeInForce=GTC&timestamp=${Date.now()}`;
      const tpData = encoder.encode(tpQueryString);
      const tpSignature = await crypto.subtle.sign('HMAC', cryptoKey, tpData);
      const tpSignatureHex = Array.from(new Uint8Array(tpSignature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      const tpResponse = await fetch(
        `https://api.binance.com/api/v3/order?${tpQueryString}&signature=${tpSignatureHex}`,
        {
          method: 'POST',
          headers: { 'X-MBX-APIKEY': binanceApiKey! },
        }
      );

      if (!tpResponse.ok) {
        const tpErrorText = await tpResponse.text();
        console.error(`⚠️ Failed to place take-profit order for position ${position.id}:`, tpErrorText);
        // Don't throw - position is already created, just log the warning
      } else {
        console.log(`✓ Take-profit order placed for position ${position.id}`);
      }
    }

    // Delete the signal after trade execution (non-critical - don't fail if this fails)
    const { error: deleteSignalError } = await supabase
      .from('trading_signals')
      .delete()
      .eq('id', signalId);
    
    if (deleteSignalError) {
      console.warn(`Failed to delete signal ${signalId} after execution:`, deleteSignalError);
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
      console.error('Failed to send notification:', notificationError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        position,
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
