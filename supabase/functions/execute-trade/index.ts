import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-manual-execution',
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
    
    // Check if this is a manual execution (from UI button click)
    const isManualExecution = req.headers.get('x-manual-execution') === 'true';
    console.log('Is manual execution:', isManualExecution);

    const binanceApiKey = Deno.env.get('BINANCE_API_KEY');
    const binanceApiSecret = Deno.env.get('BINANCE_API_SECRET');

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

    // FILTER 5: Require confidence > configurable threshold
    const minConfidence = riskParams.min_confidence_threshold || 60;
    if ((signal.confidence_score || 0) < minConfidence) {
      throw new Error(`Signal confidence too low (${signal.confidence_score}%) - minimum required: ${minConfidence}%`);
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
    const aggregatedBB = trendData?.aggregatedBollingerSignals || {};
    if (aggregatedBB.breakoutPotential === 'high') {
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
      const volumes = klines.map((k: any[]) => parseFloat(k[5])); // Volume is at index 5
      const closes = klines.map((k: any[]) => parseFloat(k[4])); // Close price at index 4
      
      // Calculate basic volume metrics
      const recentVolumes = volumes.slice(-20);
      const avgVolume = recentVolumes.reduce((a: number, b: number) => a + b, 0) / recentVolumes.length;
      const currentVolume = volumes[volumes.length - 1];
      const volumeRatio = currentVolume / avgVolume;

      console.log(`📊 Current 15m Volume: ${currentVolume.toFixed(2)}, Avg: ${avgVolume.toFixed(2)}, Ratio: ${volumeRatio.toFixed(2)}x`);

      // FILTER 7: Avoid extremely low volume periods (< 30% of average)
      if (volumeRatio < 0.3) {
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

      // Calculate OBV trend (compare recent OBV to older OBV)
      const recentOBV = obvValues.slice(-10);
      const olderOBV = obvValues.slice(-20, -10);
      const avgRecentOBV = recentOBV.reduce((a, b) => a + b, 0) / recentOBV.length;
      const avgOlderOBV = olderOBV.reduce((a, b) => a + b, 0) / olderOBV.length;
      
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
      
      if (signalSide === 'BUY' && obvDirection === 'bearish' && obvChange < -10) {
        console.warn(`⚠️ OBV DIVERGENCE: LONG signal but OBV is bearish (${obvChange.toFixed(2)}% decline)`);
        // Don't reject, but log the divergence - volume boost multiplier will handle this
      }
      
      if (signalSide === 'SELL' && obvDirection === 'bullish' && obvChange > 10) {
        console.warn(`⚠️ OBV DIVERGENCE: SHORT signal but OBV is bullish (${obvChange.toFixed(2)}% rise)`);
        // Don't reject, but log the divergence
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
      
      const currentVWAP = vwapValues[vwapValues.length - 1];
      const vwapDeviation = ((currentPrice - currentVWAP) / currentVWAP) * 100;
      
      // Calculate VWAP bands (standard deviation from VWAP)
      const vwapDiffs = closes.map((c: number, i: number) => Math.pow(c - vwapValues[i], 2));
      const vwapStdDev = Math.sqrt(vwapDiffs.reduce((a: number, b: number) => a + b, 0) / vwapDiffs.length);
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
          // Buying above upper VWAP band = overextended
          vwapBoostMultiplier = 0.8; // 20% reduction
          console.warn(`⚠️ VWAP Warning: Price above upper VWAP band - overextended entry`);
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
          // Selling below lower VWAP band = oversold
          vwapBoostMultiplier = 0.8; // 20% reduction
          console.warn(`⚠️ VWAP Warning: Price below lower VWAP band - oversold entry`);
        } else if (vwapDeviation < -0.5) {
          // Selling below VWAP but within bands
          vwapBoostMultiplier = 0.9; // 10% reduction
          console.log(`📊 VWAP neutral: Price ${Math.abs(vwapDeviation).toFixed(2)}% below VWAP`);
        }
      }
      
      // Store VWAP boost for position sizing
      (signal as any).vwapBoostMultiplier = vwapBoostMultiplier;
      console.log(`📈 Final VWAP Boost Multiplier: ${vwapBoostMultiplier.toFixed(2)}x`);
    }

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

    // Use strategy's configured stop loss and take profit from signal
    const stopLoss = signal.stop_loss;
    const takeProfit = signal.take_profit;

    // Validate SL/TP are present
    if (!stopLoss || !takeProfit) {
      throw new Error(`Signal missing stop_loss (${stopLoss}) or take_profit (${takeProfit})`);
    }

    console.log(`Using strategy SL: ${stopLoss.toFixed(2)}, TP: ${takeProfit.toFixed(2)} (from strategy configuration)`);

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

    // Calculate position size based on strategy's positionSizePercent
    const positionValue = (riskParams.portfolio_value * positionSizePercent) / 100;
    let quantity = positionValue / currentPrice;
    
    console.log(`Position sizing: ${positionSizePercent}% of $${riskParams.portfolio_value} = $${positionValue.toFixed(2)} / $${currentPrice.toFixed(2)} = ${quantity.toFixed(4)} ${signal.symbol.replace('USDT', '')}`);

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

    // Apply confidence-based position size scaling
    const confidence = signal.confidence_score || 0;
    if (confidence < 50) {
      quantity *= 0.5; // Reduce by 50%
      console.log(`Position size reduced by 50% due to low confidence (${confidence}%)`);
    } else if (confidence > 75) {
      quantity *= 1.25; // Increase by 25%
      console.log(`Position size increased by 25% due to high confidence (${confidence}%)`);
    } else {
      console.log(`Position size normal for confidence ${confidence}%`);
    }

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

    // Check if this signal has already been executed
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

    // Create position record with all trade data
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
