// ============= SMART MOMENTUM DETECTION SYSTEM =============
// Phase 1: Enhanced Trend Change Detection
// Phase 2: Smarter Entry Timing
// Phase 3: Behavioral ADX Exhaustion Detection
// Part of the comprehensive trading intelligence upgrade

import { calculateEMAArray, calculateRSIArray, calculateMACD, calculateADXWithDirection, calculateVolumeAnalysis, calculateATR, type ADXResult } from "./indicators.ts";
import { ADX_THRESHOLDS, ADX_EXHAUSTION_PARAMS, MOMENTUM_SCORE_COMPONENTS, DYNAMIC_TRAILING_PARAMS, CONTEXT_STOP_PARAMS, EXIT_SIGNAL_SCORING, PULLBACK_DETECTION_PARAMS, ENTRY_CONFIRMATION_PARAMS, ENTRY_QUALITY_GRADES } from "./constants.ts";

// ============= TREND MOMENTUM SCORE =============
// v2.0: Comprehensive lag fix
// - ADX decoupled from direction (magnitude-only energy indicator)
// - EMA spread RoC transition detection (catches crossover BEFORE it happens)
// - Price impulse factor (fast price moves precede EMA crossover)
// - 5-phase state machine (strong_bullish, bullish, transition_up, transition_down, strong_bearish)
export type MomentumPhase = "strong_bullish" | "bullish" | "transition_up" | "neutral" | "transition_down" | "bearish" | "strong_bearish";

export interface MicroExhaustionResult {
  detected: boolean;
  score: number;                    // 0-100: exhaustion severity
  signals: string[];                // Which signals triggered
  momentumDeceleration: boolean;    // EMA(3) slope reversing
  volumeDryUp: boolean;             // Volume declining in trend direction
  rsiDivergence: boolean;           // Price making new extreme but RSI not confirming
  recommendation: "hold" | "tighten_stop" | "exit_partial" | "exit_full";
}

export interface MomentumScoreResult {
  score: number;                    // -100 to +100
  direction: "bullish" | "bearish" | "neutral";
  phase: MomentumPhase;            // v2.0: 5-phase state (more granular than direction)
  isAccelerating: boolean;
  isWeakening: boolean;
  isExhausted: boolean;
  isTransitioning: boolean;        // v2.0: true when EMA spread narrowing toward crossover
  microExhaustion: MicroExhaustionResult; // v4.0: multi-signal exhaustion detection
  components: {
    emaSpreadRoC: number;          // Rate of change of EMA spread
    rsiMomentum: number;           // RSI directional momentum
    macdSlope: number;             // MACD histogram slope
    adxTrend: number;              // ADX magnitude contribution (v2.0: no direction sign)
    transitionBonus: number;       // v2.0: bonus for EMA narrowing toward crossover
    priceImpulse: number;          // v2.0: fast price move bonus
  };
  overextensionATR: number;        // How many ATRs from EMA
  reasons: string[];
}

export function calculateMomentumScore(
  klines: any[],
  prices: number[],
  adx: number,
  adxRising: boolean,
  currentATR: number,
  adxSlope: number = 0
): MomentumScoreResult {
  const defaultResult: MomentumScoreResult = {
    score: 0,
    direction: "neutral",
    phase: "neutral",
    isAccelerating: false,
    isWeakening: false,
    isExhausted: false,
    isTransitioning: false,
    components: { emaSpreadRoC: 0, rsiMomentum: 0, macdSlope: 0, adxTrend: 0, transitionBonus: 0, priceImpulse: 0 },
    overextensionATR: 0,
    reasons: []
  };

  if (prices.length < 50) return defaultResult;

  const reasons: string[] = [];
  let totalScore = 0;
  const MSC = MOMENTUM_SCORE_COMPONENTS;

  // 1. EMA Spread Rate of Change (max ±MSC.EMA_SPREAD_MAX points)
  const ema12Array = calculateEMAArray(prices, 12);
  const ema26Array = calculateEMAArray(prices, 26);
  
  let spreadCurrent = 0;
  let spreadRoC = 0;
  let isTransitioning = false;
  let transitionBonus = 0;
  
  if (ema12Array.length >= 5 && ema26Array.length >= 5) {
    spreadCurrent = ema12Array[ema12Array.length - 1] - ema26Array[ema26Array.length - 1];
    const spreadPrev1 = ema12Array[ema12Array.length - 2] - ema26Array[ema26Array.length - 2];
    const spreadPrev5 = ema12Array[ema12Array.length - 5] - ema26Array[ema26Array.length - 5];
    
    // Calculate rate of change of spread
    const currentEma = ema26Array[ema26Array.length - 1] || 1;
    spreadRoC = ((spreadCurrent - spreadPrev5) / Math.abs(currentEma || 1)) * 100;
    
    const emaSpreadScore = Math.min(MSC.EMA_SPREAD_MAX, Math.max(-MSC.EMA_SPREAD_MAX, spreadRoC * MSC.EMA_SPREAD_SCORE_MULTIPLIER));
    totalScore += emaSpreadScore;
    
    if (spreadRoC > MSC.EMA_SPREAD_WIDENING) reasons.push(`EMA spread widening: +${emaSpreadScore.toFixed(0)}`);
    else if (spreadRoC < MSC.EMA_SPREAD_NARROWING) reasons.push(`EMA spread narrowing: ${emaSpreadScore.toFixed(0)}`);
    
    defaultResult.components.emaSpreadRoC = spreadRoC;

    // ===== v2.0: TRANSITION DETECTION =====
    // When EMA spread is negative but narrowing (RoC > 0) → bullish transition
    // When EMA spread is positive but narrowing (RoC < 0) → bearish transition
    // This catches the crossover BEFORE it happens, eliminating the structural lag
    if (MSC.TRANSITION_REQUIRE_NARROWING) {
      if (spreadCurrent < 0 && spreadRoC > 0) {
        // Bearish structure but NARROWING → transitioning bullish
        isTransitioning = true;
        transitionBonus = Math.min(MSC.TRANSITION_BONUS_MAX, spreadRoC * MSC.TRANSITION_ROC_MULTIPLIER);
        totalScore += transitionBonus;
        reasons.push(`🔄 TRANSITION_UP: spread=${spreadCurrent.toFixed(2)}, RoC=+${spreadRoC.toFixed(3)} → bonus +${transitionBonus.toFixed(0)}`);
      } else if (spreadCurrent > 0 && spreadRoC < 0) {
        // Bullish structure but NARROWING → transitioning bearish
        isTransitioning = true;
        transitionBonus = Math.max(-MSC.TRANSITION_BONUS_MAX, spreadRoC * MSC.TRANSITION_ROC_MULTIPLIER);
        totalScore += transitionBonus;
        reasons.push(`🔄 TRANSITION_DOWN: spread=${spreadCurrent.toFixed(2)}, RoC=${spreadRoC.toFixed(3)} → penalty ${transitionBonus.toFixed(0)}`);
      }
    }
    defaultResult.components.transitionBonus = transitionBonus;
  }

  // 2. RSI Momentum (max ±MSC.RSI_MOMENTUM_MAX points)
  const rsiArray = calculateRSIArray(prices, 14);
  if (rsiArray.length >= 5) {
    const rsiCurrent = rsiArray[rsiArray.length - 1];
    const rsiPrev3 = rsiArray[rsiArray.length - 4];
    
    let consecutiveHigherLows = 0;
    let consecutiveLowerHighs = 0;
    
    for (let i = rsiArray.length - 4; i < rsiArray.length - 1; i++) {
      if (rsiArray[i + 1] > rsiArray[i]) consecutiveHigherLows++;
      else if (rsiArray[i + 1] < rsiArray[i]) consecutiveLowerHighs++;
    }
    
    const rsiMomentum = (rsiCurrent - rsiPrev3) / 3;
    const rsiScore = Math.min(MSC.RSI_MOMENTUM_MAX, Math.max(-MSC.RSI_MOMENTUM_MAX, rsiMomentum * 2));
    totalScore += rsiScore;
    
    if (consecutiveHigherLows >= 2) reasons.push(`RSI higher lows: +${rsiScore.toFixed(0)}`);
    else if (consecutiveLowerHighs >= 2) reasons.push(`RSI lower highs: ${rsiScore.toFixed(0)}`);
    
    defaultResult.components.rsiMomentum = rsiMomentum;
  }

  // 3. MACD Histogram Slope (max ±30 points)
  // FIX: Contracting histogram now respects polarity — going from -50 to -40 scores
  // as weakly bearish (not bullish), preventing false positive momentum scores during selloffs
  const macdResult = calculateMACD(prices);
  if (macdResult.histogramArray.length >= 5) {
    const hist = macdResult.histogramArray;
    const histCurrent = hist[hist.length - 1];
    const histPrev1 = hist[hist.length - 2];
    const histPrev3 = hist[hist.length - 4];
    
    // Calculate histogram slope (acceleration/deceleration)
    const slope = (histCurrent - histPrev3) / 3;
    const isExpanding = Math.abs(histCurrent) > Math.abs(histPrev1);
    
    // Normalize slope by price to make scoring fair across assets (BTC ~$87K vs ADA ~$0.30)
    const priceNorm = prices[prices.length - 1] || 1;
    const normalizedSlope = (slope / priceNorm) * 10000; // Normalize to basis points
    
    let macdScore = 0;
    if (histCurrent > 0) {
      // Expanding bullish: cap at +30; Contracting bullish: bounded [-15, +15]
      macdScore = isExpanding ? Math.min(30, normalizedSlope * 100) : Math.min(15, Math.max(-15, normalizedSlope * 50));
    } else {
      // Expanding bearish: cap at -30
      // FIX: Contracting bearish (histogram still negative but becoming less negative)
      // should score as WEAKLY BEARISH (negative), not positive
      if (isExpanding) {
        macdScore = Math.max(-30, normalizedSlope * 100);
      } else {
        // Histogram is negative and contracting: momentum is weakening but still bearish
        const contractionScore = normalizedSlope * 50;
        macdScore = Math.max(-15, Math.min(0, contractionScore - 5));
      }
    }
    
    totalScore += macdScore;
    
    if (isExpanding && histCurrent > 0) reasons.push(`MACD expanding bullish: +${macdScore.toFixed(0)}`);
    else if (isExpanding && histCurrent < 0) reasons.push(`MACD expanding bearish: ${macdScore.toFixed(0)}`);
    else if (!isExpanding && histCurrent > 0) reasons.push(`MACD contracting bullish: ${macdScore.toFixed(0)}`);
    else if (!isExpanding) reasons.push(`MACD contracting bearish: ${macdScore.toFixed(0)}`);
    
    defaultResult.components.macdSlope = slope;
  }

  // 4. ADX Energy Contribution (max ±MSC.ADX_TREND_MAX points)
  // v2.0 FIX: ADX is now MAGNITUDE-ONLY — measures trend energy, NOT direction.
  // Direction is determined by EMA/MACD/RSI components above.
  // Previously: rawAdxScore * emaTrendDirection caused ±15 point swings at crossover lag
  // Now: ADX contributes unsigned energy — strong rising ADX = market has conviction (either way)
  // This eliminates the phase misalignment where ADX punished correct direction during transitions.
  let adxScore = 0;
  if (adx >= ADX_THRESHOLDS.STRONG) {
    adxScore = adxRising ? MSC.ADX_STRONG_RISING : MSC.ADX_STRONG_FALLING;
    if (adxRising) reasons.push(`Strong ADX energy (${adx.toFixed(1)}, rising): +${adxScore}`);
    else reasons.push(`Strong ADX declining (${adx.toFixed(1)}): ${adxScore}`);
  } else if (adx >= ADX_THRESHOLDS.MINIMUM) {
    adxScore = adxRising ? MSC.ADX_MODERATE_RISING : MSC.ADX_MODERATE_FALLING;
  } else {
    adxScore = MSC.ADX_WEAK;
    reasons.push(`Weak ADX (${adx.toFixed(1)}): ${adxScore}`);
  }
  totalScore += adxScore;
  defaultResult.components.adxTrend = adxScore;

  // 5. v2.0: PRICE IMPULSE FACTOR
  // Catches fast price moves that precede EMA crossover.
  // If price moved > 1.5 ATR in last N bars, add direction-aligned bonus.
  // This is a SCORE COMPONENT, not an override — keeps the scoring framework intact.
  let priceImpulse = 0;
  const lookback = Math.min(MSC.PRICE_IMPULSE_LOOKBACK, prices.length - 1);
  if (lookback > 0 && currentATR > 0) {
    const priceChange = prices[prices.length - 1] - prices[prices.length - 1 - lookback];
    const impulseRatio = priceChange / currentATR; // Positive = bullish, negative = bearish
    
    if (Math.abs(impulseRatio) >= MSC.PRICE_IMPULSE_ATR_THRESHOLD) {
      priceImpulse = Math.min(MSC.PRICE_IMPULSE_MAX, Math.max(-MSC.PRICE_IMPULSE_MAX, 
        impulseRatio * MSC.PRICE_IMPULSE_SCALE));
      totalScore += priceImpulse;
      reasons.push(`⚡ Price impulse ${impulseRatio.toFixed(2)} ATR: ${priceImpulse > 0 ? '+' : ''}${priceImpulse.toFixed(0)}`);
    }
  }
  defaultResult.components.priceImpulse = priceImpulse;

  // 6. Calculate Overextension
  const ema26Current = ema26Array.length > 0 ? ema26Array[ema26Array.length - 1] : prices[prices.length - 1];
  const currentPrice = prices[prices.length - 1];
  const distanceFromEma = Math.abs(currentPrice - ema26Current);
  const overextensionATR = currentATR > 0 ? distanceFromEma / currentATR : 0;
  defaultResult.overextensionATR = overextensionATR;

  // Determine states
  // v3.0: EMA(momentum, 3) slope model for isAccelerating
  // Instead of single-bar macdSlope > 0, use 3-bar smoothed totalScore slope
  // This eliminates false acceleration triggers from single low-liquidity candle spikes
  // Model: compute momentum-like scores for last 3 bars, apply EMA(3) smoothing, check slope
  let isAccelerating = false;
  if (totalScore > MSC.ACCELERATING_THRESHOLD && macdResult.histogramArray.length >= 6) {
    // Compute per-bar momentum proxy from MACD histogram + EMA spread for last 3 bars
    const hist = macdResult.histogramArray;
    const priceNorm = prices[prices.length - 1] || 1;
    
    // 3-bar momentum snapshots (normalized histogram as momentum proxy)
    const m1 = ((hist[hist.length - 3] - hist[hist.length - 4]) / priceNorm) * 10000;
    const m2 = ((hist[hist.length - 2] - hist[hist.length - 3]) / priceNorm) * 10000;
    const m3 = ((hist[hist.length - 1] - hist[hist.length - 2]) / priceNorm) * 10000;
    
    // EMA(3) smoothing: weights [1, 2, 4] / 7 (standard EMA kernel for 3 values)
    const emaSmoothed = (m1 * 1 + m2 * 2 + m3 * 4) / 7;
    
    // Acceleration = smoothed slope is positive (momentum increasing)
    // AND current histogram is expanding in the right direction
    const histCurrent = hist[hist.length - 1];
    const histExpanding = Math.abs(histCurrent) > Math.abs(hist[hist.length - 2]);
    
    isAccelerating = emaSmoothed > 0.5 && (histExpanding || emaSmoothed > 2.0);
    
    if (isAccelerating) {
      reasons.push(`🚀 EMA(3) momentum slope: ${emaSmoothed.toFixed(2)} (smoothed acceleration confirmed)`);
    }
  }
  // v3.0: EMA(momentum, 3) slope model for isWeakening (mirrors isAccelerating logic)
  // Instead of single-bar macdSlope < 0, use 3-bar smoothed slope to filter noise
  let isWeakening = false;
  if (Math.abs(totalScore) > 5 && macdResult.histogramArray.length >= 6 && !adxRising) {
    const hist = macdResult.histogramArray;
    const priceNorm = prices[prices.length - 1] || 1;
    
    // 3-bar momentum deltas (same normalization as isAccelerating)
    const w1 = ((hist[hist.length - 3] - hist[hist.length - 4]) / priceNorm) * 10000;
    const w2 = ((hist[hist.length - 2] - hist[hist.length - 3]) / priceNorm) * 10000;
    const w3 = ((hist[hist.length - 1] - hist[hist.length - 2]) / priceNorm) * 10000;
    
    // EMA(3) smoothing: weights [1, 2, 4] / 7
    const emaWeakeningSlope = (w1 * 1 + w2 * 2 + w3 * 4) / 7;
    
    // Weakening = smoothed slope opposes score direction
    // Bullish score but momentum decelerating (negative slope)
    // Bearish score but momentum decelerating (positive slope)
    isWeakening = (totalScore > 0 && emaWeakeningSlope < -0.5) ||
                  (totalScore < 0 && emaWeakeningSlope > 0.5);
    
    if (isWeakening) {
      reasons.push(`⚠️ EMA(3) momentum slope: ${emaWeakeningSlope.toFixed(2)} (smoothed weakening confirmed)`);
    }
  }
  const isExhausted = 
    adx >= ADX_THRESHOLDS.EXTREME && 
    overextensionATR >= MSC.EXHAUSTION_ATR_THRESHOLD && 
    !adxRising;

  // Note: isWeakening reason is pushed inside the EMA(3) block above
  if (isExhausted) reasons.push("🛑 Trend EXHAUSTED");
  // Note: isAccelerating reason is pushed inside the EMA(3) block above

  // v2.0: 5-PHASE STATE CLASSIFICATION
  // More granular than 3-way direction — captures transition zones
  let adjustedScore = Math.round(totalScore);
  
  // ============= STRUCTURAL MOMENTUM LAG OVERRIDE =============
  // When price impulse direction strongly contradicts the momentum score direction,
  // and ADX confirms structural trend acceleration, the lagging indicators (EMA RoC,
  // MACD smoothing) are dragging the score in the wrong direction.
  // Fix: Clamp the score toward the price direction when structural confirmation exists.
  const SLO = MSC.STRUCTURAL_LAG_OVERRIDE;
  if (SLO?.ENABLED && currentATR > 0) {
    const priceChangePct = lookback > 0 
      ? ((prices[prices.length - 1] - prices[prices.length - 1 - lookback]) / prices[prices.length - 1 - lookback]) * 100 
      : 0;
    const absPriceMove = Math.abs(priceChangePct);
    const absPriceImpulse = Math.abs(priceImpulse);
    
    if (absPriceMove >= SLO.MIN_PRICE_MOVE_PERCENT && 
        adx >= SLO.MIN_ADX && 
        Math.abs(adxSlope) >= SLO.MIN_ADX_SLOPE &&
        absPriceImpulse >= SLO.MIN_PRICE_IMPULSE_ABS) {
      
      const priceDirectionBearish = priceChangePct < 0;
      const priceDirectionBullish = priceChangePct > 0;
      const scoreContradictsPrice = (priceDirectionBearish && adjustedScore > 0) || 
                                     (priceDirectionBullish && adjustedScore < 0);
      
      if (scoreContradictsPrice) {
        const targetScore = priceDirectionBearish ? -SLO.OVERRIDE_SCORE : SLO.OVERRIDE_SCORE;
        const prevScore = adjustedScore;
        adjustedScore = priceDirectionBearish 
          ? Math.min(adjustedScore, targetScore) 
          : Math.max(adjustedScore, targetScore);
        reasons.push(`🔧 STRUCTURAL_LAG_OVERRIDE: price=${priceChangePct.toFixed(1)}%, ADX=${adx.toFixed(1)}, slope=${adxSlope.toFixed(2)} → score clamped ${prevScore} → ${adjustedScore}`);
      }
    }
  }
  
  const finalScore = Math.min(100, Math.max(-100, adjustedScore));
  let phase: MomentumPhase = "neutral";
  if (finalScore >= MSC.STRONG_BULLISH_THRESHOLD) {
    phase = "strong_bullish";
  } else if (finalScore >= MSC.BULLISH_THRESHOLD) {
    phase = "bullish";
  } else if (finalScore >= MSC.TRANSITION_UP_THRESHOLD && isTransitioning && spreadRoC > 0) {
    phase = "transition_up";
  } else if (finalScore <= MSC.STRONG_BEARISH_THRESHOLD) {
    phase = "strong_bearish";
  } else if (finalScore <= MSC.BEARISH_THRESHOLD) {
    phase = "bearish";
  } else if (finalScore <= MSC.TRANSITION_DOWN_THRESHOLD && isTransitioning && spreadRoC < 0) {
    phase = "transition_down";
  }
  // If transitioning but score is in neutral zone, use transition phase
  if (phase === "neutral" && isTransitioning) {
    phase = spreadRoC > 0 ? "transition_up" : "transition_down";
  }

  const direction = finalScore > MSC.BULLISH_THRESHOLD ? "bullish" 
    : finalScore < MSC.BEARISH_THRESHOLD ? "bearish" 
    : "neutral";

  return {
    score: finalScore,
    direction,
    phase,
    isAccelerating,
    isWeakening,
    isExhausted,
    isTransitioning,
    components: defaultResult.components,
    overextensionATR: Math.round(overextensionATR * 100) / 100,
    reasons
  };
}

// ============= PULLBACK DETECTION =============
// Phase 2: Enhanced with wait-for-bounce logic and confirmation candle
export interface PullbackResult {
  isPullback: boolean;
  pullbackDepth: number;           // 0-100 (Fibonacci retracement %)
  isValidPullback: boolean;        // Meets criteria for entry
  pullbackType: "shallow" | "moderate" | "deep" | "none";
  rsiInZone: boolean;
  rsiDipped: boolean;              // RSI dipped below/above threshold before current
  rsiRecovering: boolean;          // RSI is now rising/falling in correct direction
  isRecovering: boolean;           // Price starting to bounce
  hasBounceConfirmation: boolean;  // Price closes above prev high (long) or below prev low (short)
  confirmationCandles: number;     // Number of confirmation candles after bounce
  reasons: string[];
}

export function detectPullback(
  prices: number[],
  direction: "long" | "short",
  rsi: number,
  rsiArray: number[],
  swingHigh: number,
  swingLow: number
): PullbackResult {
  const defaultResult: PullbackResult = {
    isPullback: false,
    pullbackDepth: 0,
    isValidPullback: false,
    pullbackType: "none",
    rsiInZone: false,
    rsiDipped: false,
    rsiRecovering: false,
    isRecovering: false,
    hasBounceConfirmation: false,
    confirmationCandles: 0,
    reasons: []
  };

  if (prices.length < 10) return defaultResult;

  const currentPrice = prices[prices.length - 1];
  const prevPrice = prices[prices.length - 2];
  const prevPrice2 = prices.length >= 3 ? prices[prices.length - 3] : prevPrice;
  const reasons: string[] = [];

  // Calculate Fibonacci retracement depth
  const swingRange = swingHigh - swingLow;
  if (swingRange <= 0) return defaultResult;

  let pullbackDepth = 0;
  let rsiInZone = false;
  let rsiDipped = false;
  let rsiRecovering = false;
  let isRecovering = false;
  let hasBounceConfirmation = false;
  let confirmationCandles = 0;
  
  if (direction === "long") {
    // For long: pullback is from high towards low
    const retracement = swingHigh - currentPrice;
    pullbackDepth = (retracement / swingRange) * 100;
    
    // Phase 2: Check RSI dipped below 45 at some point in last 5 bars
    const RSI_DIP_THRESHOLD = 45;
    rsiDipped = rsiArray.slice(-5).some(r => r < RSI_DIP_THRESHOLD);
    
    // Check RSI zone for longs (currently below 50, ideal below 45)
    rsiInZone = rsi < 50;
    
    // RSI recovering = current RSI > previous RSI
    rsiRecovering = rsiArray.length >= 2 && rsiArray[rsiArray.length - 1] > rsiArray[rsiArray.length - 2];
    
    // Phase 2: Wait-for-Bounce Logic
    // Price must close above previous candle high to confirm bounce
    isRecovering = currentPrice > prevPrice;
    hasBounceConfirmation = currentPrice > Math.max(prevPrice, prevPrice2) && rsiRecovering;
    
    // Count confirmation candles (consecutive higher closes)
    for (let i = prices.length - 1; i >= Math.max(0, prices.length - 5); i--) {
      if (prices[i] > prices[i - 1]) confirmationCandles++;
      else break;
    }
    
    if (rsiDipped) reasons.push(`RSI dipped below ${RSI_DIP_THRESHOLD}`);
    if (rsiRecovering) reasons.push(`RSI rising: ${rsi.toFixed(1)}`);
    if (hasBounceConfirmation) reasons.push(`✅ Bounce confirmed (${confirmationCandles} candles)`);
    else if (isRecovering) reasons.push("Price bouncing - waiting for confirmation");
    
  } else {
    // For short: pullback is from low towards high
    const retracement = currentPrice - swingLow;
    pullbackDepth = (retracement / swingRange) * 100;
    
    // Phase 2: Check RSI spiked above 55 at some point in last 5 bars
    const RSI_SPIKE_THRESHOLD = 55;
    rsiDipped = rsiArray.slice(-5).some(r => r > RSI_SPIKE_THRESHOLD);
    
    // Check RSI zone for shorts (currently above 50, ideal above 55)
    rsiInZone = rsi > 50;
    
    // RSI recovering = current RSI < previous RSI (falling for shorts)
    rsiRecovering = rsiArray.length >= 2 && rsiArray[rsiArray.length - 1] < rsiArray[rsiArray.length - 2];
    
    // Phase 2: Wait-for-Bounce Logic
    // Price must close below previous candle low to confirm rejection
    isRecovering = currentPrice < prevPrice;
    hasBounceConfirmation = currentPrice < Math.min(prevPrice, prevPrice2) && rsiRecovering;
    
    // Count confirmation candles (consecutive lower closes)
    for (let i = prices.length - 1; i >= Math.max(0, prices.length - 5); i--) {
      if (prices[i] < prices[i - 1]) confirmationCandles++;
      else break;
    }
    
    if (rsiDipped) reasons.push(`RSI spiked above ${RSI_SPIKE_THRESHOLD}`);
    if (rsiRecovering) reasons.push(`RSI falling: ${rsi.toFixed(1)}`);
    if (hasBounceConfirmation) reasons.push(`✅ Rejection confirmed (${confirmationCandles} candles)`);
    else if (isRecovering) reasons.push("Price rejecting - waiting for confirmation");
  }

  // Classify pullback type
  let pullbackType: "shallow" | "moderate" | "deep" | "none" = "none";
  if (pullbackDepth >= 61.8) pullbackType = "deep";
  else if (pullbackDepth >= 38.2) pullbackType = "moderate";
  else if (pullbackDepth >= 23.6) pullbackType = "shallow";

  const isPullback = pullbackDepth >= 23.6;
  
  // Phase 2: Valid pullback requires ALL of:
  // 1. At least 38% retracement (Fibonacci)
  // 2. RSI dipped into pullback zone and is now recovering
  // 3. Bounce confirmation (price closes above prev high for long)
  // 4. At least 1 confirmation candle
  const isValidPullback = 
    pullbackDepth >= 38.2 && 
    pullbackDepth <= 78.6 && 
    rsiDipped && 
    rsiRecovering &&
    hasBounceConfirmation &&
    confirmationCandles >= 1;

  if (isPullback) reasons.push(`${pullbackType} pullback: ${pullbackDepth.toFixed(1)}% retracement`);
  if (isValidPullback) reasons.push("✅ VALID entry pullback - all confirmations met");

  return {
    isPullback,
    pullbackDepth: Math.round(pullbackDepth * 10) / 10,
    isValidPullback,
    pullbackType,
    rsiInZone,
    rsiDipped,
    rsiRecovering,
    isRecovering,
    hasBounceConfirmation,
    confirmationCandles,
    reasons
  };
}

// ============= ENTRY CONFIRMATION FILTER =============
// Phase 2: All entry confirmation checks in one place
export interface EntryConfirmationResult {
  allConfirmed: boolean;
  confirmationCount: number;
  maxConfirmations: number;
  details: {
    confirmationCandle: boolean;    // At least 1 confirmation candle after pullback
    volumeIncreasing: boolean;      // Volume increasing on entry candle
    stochRsiCrossing: boolean;      // StochRSI K/D crossing, not at extreme
    macdExpanding: boolean;         // MACD histogram expanding in trade direction
    rsiRecovering: boolean;         // RSI recovering from pullback zone
  };
  reasons: string[];
}

export function checkEntryConfirmation(
  pullbackResult: PullbackResult | null,
  volumeRatio: number,
  stochRsiK: number,
  stochRsiD: number,
  macdHistogramExpanding: boolean,
  direction: "long" | "short"
): EntryConfirmationResult {
  const details = {
    confirmationCandle: false,
    volumeIncreasing: false,
    stochRsiCrossing: false,
    macdExpanding: false,
    rsiRecovering: false
  };
  const reasons: string[] = [];

  // 1. Confirmation Candle - at least 1 candle after bounce
  details.confirmationCandle = pullbackResult ? pullbackResult.confirmationCandles >= 1 : false;
  if (details.confirmationCandle) {
    reasons.push(`✓ ${pullbackResult?.confirmationCandles} confirmation candle(s)`);
  } else {
    reasons.push("✗ No confirmation candle yet");
  }

  // 2. Volume Increasing - volume above average on entry
  details.volumeIncreasing = volumeRatio >= 1.0;
  if (volumeRatio >= 1.5) {
    reasons.push(`✓ Strong volume (${(volumeRatio * 100).toFixed(0)}%)`);
  } else if (details.volumeIncreasing) {
    reasons.push(`✓ Volume OK (${(volumeRatio * 100).toFixed(0)}%)`);
  } else {
    reasons.push(`✗ Weak volume (${(volumeRatio * 100).toFixed(0)}%)`);
  }

  // 3. StochRSI Crossing - K crossing D, not at extreme
  // For long: K > D and K not > 80 (not overbought)
  // For short: K < D and K not < 20 (not oversold)
  if (direction === "long") {
    const isCrossing = stochRsiK > stochRsiD;
    const notExtreme = stochRsiK < 80;
    details.stochRsiCrossing = isCrossing && notExtreme;
    if (details.stochRsiCrossing) {
      reasons.push(`✓ StochRSI bullish cross (K=${stochRsiK.toFixed(0)} > D=${stochRsiD.toFixed(0)})`);
    } else if (!isCrossing) {
      reasons.push(`✗ StochRSI not crossing up (K=${stochRsiK.toFixed(0)} <= D=${stochRsiD.toFixed(0)})`);
    } else {
      reasons.push(`✗ StochRSI overbought (K=${stochRsiK.toFixed(0)})`);
    }
  } else {
    const isCrossing = stochRsiK < stochRsiD;
    const notExtreme = stochRsiK > 20;
    details.stochRsiCrossing = isCrossing && notExtreme;
    if (details.stochRsiCrossing) {
      reasons.push(`✓ StochRSI bearish cross (K=${stochRsiK.toFixed(0)} < D=${stochRsiD.toFixed(0)})`);
    } else if (!isCrossing) {
      reasons.push(`✗ StochRSI not crossing down (K=${stochRsiK.toFixed(0)} >= D=${stochRsiD.toFixed(0)})`);
    } else {
      reasons.push(`✗ StochRSI oversold (K=${stochRsiK.toFixed(0)})`);
    }
  }

  // 4. MACD Expanding
  details.macdExpanding = macdHistogramExpanding;
  if (details.macdExpanding) {
    reasons.push("✓ MACD histogram expanding");
  } else {
    reasons.push("✗ MACD histogram not expanding");
  }

  // 5. RSI Recovering
  details.rsiRecovering = pullbackResult ? pullbackResult.rsiRecovering : false;
  if (details.rsiRecovering) {
    reasons.push("✓ RSI recovering from pullback");
  } else {
    reasons.push("✗ RSI not recovering");
  }

  // Count confirmations
  const confirmationCount = Object.values(details).filter(Boolean).length;
  const maxConfirmations = 5;
  
  // All confirmed if we have at least 4 out of 5 (allow 1 missing)
  const allConfirmed = confirmationCount >= 4;

  return {
    allConfirmed,
    confirmationCount,
    maxConfirmations,
    details,
    reasons
  };
}

// ============= ENTRY QUALITY SCORING =============
// Phase 2: Enhanced with entry confirmation integration
export interface EntryQualityResult {
  score: number;                    // 0-100
  grade: "A" | "B" | "C" | "D" | "F";
  factors: {
    momentumAlignment: number;      // 0-25
    pullbackQuality: number;        // 0-25 (increased from 20)
    volumeConfirmation: number;     // 0-15
    timeframeAlignment: number;     // 0-15 (decreased from 20)
    stochRsiPosition: number;       // 0-10
    macdExpanding: number;          // 0-10
    entryConfirmation: number;      // 0-10 (NEW)
  };
  isRecommended: boolean;
  entryType: "pullback" | "breakout" | "continuation";
  warnings: string[];
}

export function calculateEntryQuality(
  momentumScore: MomentumScoreResult,
  pullbackResult: PullbackResult | null,
  volumeConfirms: boolean,
  volumeRatio: number,
  timeframeAlignmentScore: number,
  stochRsiK: number,
  stochRsiSignal: string,
  macdHistogramExpanding: boolean,
  direction: "long" | "short",
  stochRsiD?: number  // Optional for confirmation check
): EntryQualityResult {
  const factors = {
    momentumAlignment: 0,
    pullbackQuality: 0,
    volumeConfirmation: 0,
    timeframeAlignment: 0,
    stochRsiPosition: 0,
    macdExpanding: 0,
    entryConfirmation: 0
  };
  const warnings: string[] = [];

  // Determine entry type
  let entryType: "pullback" | "breakout" | "continuation" = "continuation";
  if (pullbackResult && pullbackResult.isValidPullback) {
    entryType = "pullback";
  } else if (momentumScore.isAccelerating && volumeRatio >= 1.5) {
    entryType = "breakout";
  }

  // 1. Momentum Alignment (0-25 points)
  const momentumAligned = 
    (direction === "long" && momentumScore.score > 0) ||
    (direction === "short" && momentumScore.score < 0);
  
  if (momentumAligned) {
    factors.momentumAlignment = Math.min(25, Math.abs(momentumScore.score) * 0.25);
    if (momentumScore.isAccelerating) factors.momentumAlignment = 25;
  } else {
    factors.momentumAlignment = 0;
    warnings.push("Momentum not aligned with direction");
  }
  
  if (momentumScore.isWeakening) {
    factors.momentumAlignment = Math.max(0, factors.momentumAlignment - 15);
    warnings.push("⚠️ Weakening momentum");
  }
  if (momentumScore.isExhausted) {
    factors.momentumAlignment = 0;
    warnings.push("🛑 Trend exhausted - avoid entry");
  }

  // 2. Pullback Quality (0-25 points) - ENHANCED for Phase 2
  if (pullbackResult && pullbackResult.isValidPullback) {
    // Perfect pullback with all confirmations
    factors.pullbackQuality = 25;
  } else if (pullbackResult && pullbackResult.isPullback && pullbackResult.hasBounceConfirmation) {
    // Has bounce confirmation but not all criteria
    factors.pullbackQuality = 20;
  } else if (pullbackResult && pullbackResult.isPullback && pullbackResult.isRecovering) {
    // Pullback with price recovering, waiting for confirmation
    factors.pullbackQuality = 12;
    warnings.push("Wait for bounce confirmation before entry");
  } else if (pullbackResult && pullbackResult.isPullback) {
    // Just a pullback, no recovery yet
    factors.pullbackQuality = 5;
    warnings.push("Pullback in progress - no bounce signal yet");
  } else {
    factors.pullbackQuality = 0;
    // Not having a pullback is OK for breakout/continuation
    if (entryType === "continuation") {
      warnings.push("No pullback detected - consider waiting");
    }
  }

  // 3. Volume Confirmation (0-15 points)
  if (volumeConfirms && volumeRatio >= 1.5) {
    factors.volumeConfirmation = 15;
  } else if (volumeConfirms) {
    factors.volumeConfirmation = 10;
  } else if (volumeRatio >= 0.8) {
    factors.volumeConfirmation = 5;
  } else {
    factors.volumeConfirmation = 0;
    warnings.push("Low volume - weak conviction");
  }

  // 4. Timeframe Alignment (0-15 points)
  factors.timeframeAlignment = Math.min(15, timeframeAlignmentScore * 0.15);

  // 5. StochRSI Position (0-10 points)
  // Phase 2: Best entries when StochRSI is crossing, not at extremes
  const stochRsiDValue = stochRsiD ?? stochRsiK; // Fallback if D not provided
  
  if (direction === "long") {
    // Best: K < 50 and K > D (crossing up)
    if (stochRsiK < 50 && stochRsiK > stochRsiDValue) {
      factors.stochRsiPosition = 10;
    } else if (stochRsiK < 30) {
      factors.stochRsiPosition = 8; // Oversold is good for longs
    } else if (stochRsiK < 50) {
      factors.stochRsiPosition = 6;
    } else if (stochRsiK < 70) {
      factors.stochRsiPosition = 3;
    } else {
      factors.stochRsiPosition = 0;
      warnings.push("StochRSI overbought for long entry");
    }
  } else {
    // Best: K > 50 and K < D (crossing down)
    if (stochRsiK > 50 && stochRsiK < stochRsiDValue) {
      factors.stochRsiPosition = 10;
    } else if (stochRsiK > 70) {
      factors.stochRsiPosition = 8; // Overbought is good for shorts
    } else if (stochRsiK > 50) {
      factors.stochRsiPosition = 6;
    } else if (stochRsiK > 30) {
      factors.stochRsiPosition = 3;
    } else {
      factors.stochRsiPosition = 0;
      warnings.push("StochRSI oversold for short entry");
    }
  }

  // 6. MACD Expanding (0-10 points)
  if (macdHistogramExpanding) {
    factors.macdExpanding = 10;
  } else {
    factors.macdExpanding = 0;
    warnings.push("MACD histogram not expanding");
  }

  // 7. Entry Confirmation Score (0-10 points) - NEW for Phase 2
  if (pullbackResult) {
    // Confirmation based on candle confirmation + RSI recovery
    if (pullbackResult.hasBounceConfirmation && pullbackResult.rsiRecovering) {
      factors.entryConfirmation = 10;
    } else if (pullbackResult.hasBounceConfirmation || pullbackResult.rsiRecovering) {
      factors.entryConfirmation = 5;
    }
  } else if (entryType === "breakout" && volumeRatio >= 1.5 && macdHistogramExpanding) {
    // Breakout with volume and MACD confirmation
    factors.entryConfirmation = 8;
  }

  // Calculate total score
  const totalScore = 
    factors.momentumAlignment +
    factors.pullbackQuality +
    factors.volumeConfirmation +
    factors.timeframeAlignment +
    factors.stochRsiPosition +
    factors.macdExpanding +
    factors.entryConfirmation;

  // Determine grade
  let grade: "A" | "B" | "C" | "D" | "F" = "F";
  if (totalScore >= 90) grade = "A";
  else if (totalScore >= 75) grade = "B";
  else if (totalScore >= 60) grade = "C";
  else if (totalScore >= 45) grade = "D";

  // Phase 2: isRecommended requires entry confirmation for pullbacks
  const hasConfirmation = pullbackResult ? pullbackResult.hasBounceConfirmation : true;
  const isRecommended = totalScore >= 60 && !momentumScore.isExhausted && hasConfirmation;

  return {
    score: Math.round(totalScore),
    grade,
    factors,
    isRecommended,
    entryType,
    warnings
  };
}

// ============= BEHAVIORAL ADX EXHAUSTION DETECTION =============
// PHASE 3 UPDATE: Refined exhaustion with time-in-trend context and minimum ADX decline
// Exhaustion is about CHANGE (slope) AND CONTEXT, not absolute ADX value
// A trend is only exhausted when strength is DECAYING significantly over time

import { ADX_EXHAUSTION_REFINED_PARAMS } from "./constants.ts";

export interface ADXExhaustionResult {
  isExhausted: boolean;
  exhaustionType: "none" | "rollover" | "di_compression" | "momentum_divergence" | "composite";
  exhaustionScore: number;      // 0-100, higher = more exhausted
  components: {
    adxRollover: boolean;       // ADX peaked and declining by 3+ points
    adxSlope: number;           // Negative = decelerating
    diCompressing: boolean;     // +DI/-DI gap shrinking
    diCompressionBars: number;  // Consecutive bars of compression
    momentumDivergence: boolean; // Price HH but RSI not HH
    priceRising: boolean;       // Hidden weakness: price rising + ADX flat/falling
    hiddenWeakness: boolean;    // Rising price but falling ADX
    adxDeclineFromPeak: number; // NEW: How many points ADX declined from peak
    trendAge: number;           // NEW: Estimated trend age in bars
    priceActionConfirmed: boolean; // NEW: Reversal candles present
  };
  isContinuation: boolean;      // High ADX + rising = NOT exhausted, allow continuation
  positionMultiplier: number;   // NEW: 0.65-1.0 based on exhaustion level (not hard block)
  reasons: string[];
}

export function detectADXExhaustion(
  adxResult: ADXResult,
  prices: number[],
  rsiArray: number[],
  direction: "long" | "short" | "neutral"
): ADXExhaustionResult {
  const defaultResult: ADXExhaustionResult = {
    isExhausted: false,
    exhaustionType: "none",
    exhaustionScore: 0,
    components: {
      adxRollover: false,
      adxSlope: 0,
      diCompressing: false,
      diCompressionBars: 0,
      momentumDivergence: false,
      priceRising: false,
      hiddenWeakness: false,
      adxDeclineFromPeak: 0,
      trendAge: 0,
      priceActionConfirmed: false
    },
    isContinuation: false,
    positionMultiplier: 1.0,
    reasons: []
  };

  // Only check exhaustion if ADX is above minimum threshold
  if (adxResult.adx < ADX_EXHAUSTION_PARAMS.MIN_ADX_FOR_EXHAUSTION_CHECK) {
    return defaultResult;
  }

  // ===== NEW: CALCULATE TREND AGE =====
  // Estimate how long the trend has been active by counting bars where ADX > 20
  const trendAge = adxResult.adxArray.filter(adx => adx >= 20).length;
  
  // ===== NEW: CALCULATE ADX DECLINE FROM PEAK =====
  const adxPeak = Math.max(...adxResult.adxArray);
  const adxDeclineFromPeak = adxPeak - adxResult.adx;

  // ===== CRITICAL: PARABOLIC MODE OVERRIDE =====
  // Super-strong trends (ADX >= 55) with rising ADX and no DI compression = NOT exhausted
  const diCompressing = adxResult.prevDiGap > 0 && 
    adxResult.diGap < adxResult.prevDiGap * (1 - ADX_EXHAUSTION_PARAMS.DI_COMPRESSION_MIN_SHRINK);
  
  if (adxResult.adx >= 55 && adxResult.adxSlope >= 0 && !diCompressing) {
    // Super-strong parabolic trend - NOT exhausted, allow continuation
    return {
      isExhausted: false,
      exhaustionType: "none",
      exhaustionScore: 0,
      components: {
        adxRollover: false,
        adxSlope: adxResult.adxSlope,
        diCompressing: false,
        diCompressionBars: 0,
        momentumDivergence: false,
        priceRising: prices.length >= 5 && prices[prices.length - 1] > prices[prices.length - 5],
        hiddenWeakness: false,
        adxDeclineFromPeak: 0,
        trendAge,
        priceActionConfirmed: false
      },
      isContinuation: true,
      positionMultiplier: 1.0,
      reasons: [`🚀 PARABOLIC MODE: ADX=${adxResult.adx.toFixed(1)}, slope=${adxResult.adxSlope.toFixed(2)}, no DI compression - allowing continuation`]
    };
  }

  const reasons: string[] = [];
  let exhaustionScore = 0;
  
  // ===== RULE 1: ADX ROLLOVER (Primary Signal) - REFINED =====
  // ADX rollover is only valid if:
  // 1. ADX declined by >= 3 points from peak (MIN_ADX_DECLINE_FOR_ROLLOVER)
  // 2. Current ADX < 40 (MAX_ADX_FOR_EXHAUSTION)
  // 3. Trend age >= 40 bars (MIN_TREND_AGE_FOR_EXHAUSTION)
  const meetsDeclineRequirement = adxDeclineFromPeak >= ADX_EXHAUSTION_REFINED_PARAMS.MIN_ADX_DECLINE_FOR_ROLLOVER;
  const meetsAdxCapRequirement = adxResult.adx < ADX_EXHAUSTION_REFINED_PARAMS.MAX_ADX_FOR_EXHAUSTION;
  const meetsTrendAgeRequirement = trendAge >= ADX_EXHAUSTION_REFINED_PARAMS.MIN_TREND_AGE_FOR_EXHAUSTION;
  
  const adxRollover = adxResult.adxPeaked && 
    adxResult.adxSlope < ADX_EXHAUSTION_PARAMS.SLOPE_NEUTRAL &&
    meetsDeclineRequirement &&
    meetsAdxCapRequirement;
  
  if (adxRollover) {
    // Only add full score if trend age requirement is met
    if (meetsTrendAgeRequirement) {
      exhaustionScore += ADX_EXHAUSTION_REFINED_PARAMS.SCORE_ADX_ROLLOVER; // Reduced from 60 to 35
      reasons.push(`ADX rollover: peak ${adxPeak.toFixed(1)} → ${adxResult.adx.toFixed(1)} (${adxDeclineFromPeak.toFixed(1)}pt decline, ${trendAge} bar trend)`);
    } else {
      // Young trend rolling over - much lower weight
      exhaustionScore += Math.round(ADX_EXHAUSTION_REFINED_PARAMS.SCORE_ADX_ROLLOVER * 0.4);
      reasons.push(`⚠️ Young trend rollover (${trendAge} bars < ${ADX_EXHAUSTION_REFINED_PARAMS.MIN_TREND_AGE_FOR_EXHAUSTION} min) - reduced weight`);
    }
  }

  // ===== RULE 2: RISING PRICE + FALLING ADX (Hidden Weakness) =====
  const priceRising = prices.length >= 5 && prices[prices.length - 1] > prices[prices.length - 5];
  const priceFalling = prices.length >= 5 && prices[prices.length - 1] < prices[prices.length - 5];
  const adxFlat = Math.abs(adxResult.adxSlope) < ADX_EXHAUSTION_PARAMS.SLOPE_ACCELERATING;
  const adxDeclining = adxResult.adxSlope < ADX_EXHAUSTION_PARAMS.SLOPE_NEUTRAL;
  
  let hiddenWeakness = false;
  if (direction === "long" && priceRising && (adxFlat || adxDeclining)) {
    hiddenWeakness = true;
  } else if (direction === "short" && priceFalling && (adxFlat || adxDeclining)) {
    hiddenWeakness = true;
  }
  
  if (hiddenWeakness) {
    // Only add score if trend is mature enough
    if (meetsTrendAgeRequirement) {
      exhaustionScore += ADX_EXHAUSTION_REFINED_PARAMS.SCORE_HIDDEN_WEAKNESS;
      reasons.push(`Hidden weakness: price ${direction === "long" ? "rising" : "falling"} but ADX flat/declining (slope: ${adxResult.adxSlope.toFixed(2)})`);
    }
  }

  // ===== RULE 3: +DI / -DI COMPRESSION =====
  const diGapShrinking = adxResult.prevDiGap > 0 && 
    adxResult.diGap < adxResult.prevDiGap * (1 - ADX_EXHAUSTION_PARAMS.DI_COMPRESSION_MIN_SHRINK);
  const diCompressionBars = diGapShrinking ? 1 : 0;
  
  if (diGapShrinking) {
    exhaustionScore += ADX_EXHAUSTION_REFINED_PARAMS.SCORE_DI_COMPRESSION;
    reasons.push(`DI compression: gap shrinking (${adxResult.prevDiGap.toFixed(1)} → ${adxResult.diGap.toFixed(1)})`);
  }

  // ===== RULE 4: MOMENTUM DIVERGENCE (Confirmation Layer) =====
  let momentumDivergence = false;
  if (rsiArray.length >= 5 && prices.length >= 5) {
    const priceHigherHigh = prices[prices.length - 1] > Math.max(...prices.slice(-5, -1));
    const priceLowerLow = prices[prices.length - 1] < Math.min(...prices.slice(-5, -1));
    const rsiHigherHigh = rsiArray[rsiArray.length - 1] > Math.max(...rsiArray.slice(-5, -1));
    const rsiLowerLow = rsiArray[rsiArray.length - 1] < Math.min(...rsiArray.slice(-5, -1));
    
    if (direction === "long" && priceHigherHigh && !rsiHigherHigh) {
      momentumDivergence = true;
    } else if (direction === "short" && priceLowerLow && !rsiLowerLow) {
      momentumDivergence = true;
    }
  }
  
  if (momentumDivergence) {
    exhaustionScore += ADX_EXHAUSTION_REFINED_PARAMS.SCORE_MOMENTUM_DIVERGENCE;
    reasons.push(`Momentum divergence: price making new ${direction === "long" ? "highs" : "lows"} but momentum failing`);
  }

  // ===== NEW: PRICE ACTION CONFIRMATION =====
  // Look for reversal candle patterns to confirm exhaustion
  let priceActionConfirmed = false;
  if (prices.length >= 3) {
    const lastPrice = prices[prices.length - 1];
    const prevPrice = prices[prices.length - 2];
    const prevPrevPrice = prices[prices.length - 3];
    
    if (direction === "long") {
      // Bearish reversal: higher high followed by lower close
      priceActionConfirmed = prevPrice > prevPrevPrice && lastPrice < prevPrice;
    } else if (direction === "short") {
      // Bullish reversal: lower low followed by higher close
      priceActionConfirmed = prevPrice < prevPrevPrice && lastPrice > prevPrice;
    }
  }
  
  if (priceActionConfirmed && exhaustionScore > 0) {
    exhaustionScore += ADX_EXHAUSTION_REFINED_PARAMS.SCORE_PRICE_ACTION_CONFIRM;
    reasons.push(`Price action confirms reversal pattern`);
  }

  // ===== ADX SLOPE NEGATIVE (MINOR SIGNAL) =====
  if (adxResult.adxSlope < ADX_EXHAUSTION_PARAMS.SLOPE_NEUTRAL && !adxRollover && !hiddenWeakness) {
    exhaustionScore += ADX_EXHAUSTION_REFINED_PARAMS.SCORE_SLOPE_NEGATIVE;
    reasons.push(`ADX slope negative (${adxResult.adxSlope.toFixed(2)})`);
  }

  // ===== CRITICAL: CONTINUATION OVERRIDE =====
  const isContinuation = ADX_EXHAUSTION_PARAMS.CONTINUATION_OVERRIDE &&
    adxResult.adx >= ADX_EXHAUSTION_PARAMS.CONTINUATION_MIN_ADX &&
    adxResult.adxSlope >= ADX_EXHAUSTION_PARAMS.CONTINUATION_MIN_SLOPE &&
    !diGapShrinking &&
    !momentumDivergence;
  
  if (isContinuation) {
    exhaustionScore = 0;
    reasons.length = 0;
    reasons.push(`✅ CONTINUATION: ADX=${adxResult.adx.toFixed(1)}, slope=${adxResult.adxSlope.toFixed(2)} (not exhausted)`);
  }

  // ===== NEW: POSITION MULTIPLIER BASED ON EXHAUSTION SCORE =====
  // Instead of hard blocking, use tiered position sizing
  let positionMultiplier = 1.0;
  const { SOFT_EXHAUSTION_THRESHOLD, HARD_EXHAUSTION_THRESHOLD, 
          POSITION_MULTIPLIER_SOFT, POSITION_MULTIPLIER_HARD } = ADX_EXHAUSTION_REFINED_PARAMS;
  
  if (!isContinuation) {
    if (exhaustionScore >= HARD_EXHAUSTION_THRESHOLD) {
      positionMultiplier = POSITION_MULTIPLIER_HARD; // 0.65
    } else if (exhaustionScore >= SOFT_EXHAUSTION_THRESHOLD) {
      positionMultiplier = POSITION_MULTIPLIER_SOFT; // 0.80
    }
  }

  // Determine exhaustion type
  let exhaustionType: ADXExhaustionResult["exhaustionType"] = "none";
  const isExhausted = !isContinuation && exhaustionScore >= ADX_EXHAUSTION_REFINED_PARAMS.EXHAUSTION_THRESHOLD;
  
  if (isExhausted) {
    if (adxRollover && momentumDivergence) exhaustionType = "composite";
    else if (adxRollover) exhaustionType = "rollover";
    else if (diGapShrinking) exhaustionType = "di_compression";
    else if (momentumDivergence) exhaustionType = "momentum_divergence";
    else exhaustionType = "composite";
  }

  return {
    isExhausted,
    exhaustionType,
    exhaustionScore: Math.min(100, exhaustionScore),
    components: {
      adxRollover,
      adxSlope: adxResult.adxSlope,
      diCompressing: diGapShrinking,
      diCompressionBars,
      momentumDivergence,
      priceRising,
      hiddenWeakness,
      adxDeclineFromPeak,
      trendAge,
      priceActionConfirmed
    },
    isContinuation,
    positionMultiplier,
    reasons
  };
}

// ============= MARKET REGIME CLASSIFICATION =============
// UPDATED: Now uses behavioral ADX exhaustion instead of absolute threshold
export type MarketRegimeType = "TRENDING" | "RANGING" | "TRANSITIONING" | "EXHAUSTED";

export interface MarketRegimeResult {
  regime: MarketRegimeType;
  regimeScore: number;              // 0-100
  tradeable: boolean;
  allowedStrategies: string[];
  qualityThreshold: number;         // Minimum quality for this regime
  positionSizeMultiplier: number;
  bbSqueeze: boolean;
  bbWidth: number;
  reason: string;
  // NEW: Exhaustion details for downstream use
  adxExhaustion?: ADXExhaustionResult;
}

export function classifyMarketRegime(
  adx: number,
  adxRising: boolean,
  momentumScore: MomentumScoreResult,
  bbWidth: number,
  bbSqueeze: boolean,
  volumeRatio: number,
  // NEW: Optional ADX exhaustion result for behavioral classification
  adxExhaustion?: ADXExhaustionResult
): MarketRegimeResult {
  // Calculate regime score (0-100)
  let regimeScore = 0;
  let regime: MarketRegimeType = "RANGING";
  let reason = "";

  // ADX contribution (0-40 points)
  if (adx >= ADX_THRESHOLDS.EXTREME) regimeScore += 40;
  else if (adx >= ADX_THRESHOLDS.STRONG) regimeScore += 30;
  else if (adx >= ADX_THRESHOLDS.MINIMUM) regimeScore += 20;
  else if (adx >= 15) regimeScore += 10;

  // Momentum contribution (0-30 points)
  if (!momentumScore.isExhausted && !momentumScore.isWeakening) {
    regimeScore += Math.min(30, Math.abs(momentumScore.score) * 0.3);
  }

  // ADX direction contribution (0-15 points)
  if (adxRising && adx >= ADX_THRESHOLDS.MINIMUM) regimeScore += 15;
  else if (!adxRising && adx >= ADX_THRESHOLDS.STRONG) regimeScore -= 10;

  // Volume contribution (0-15 points)
  if (volumeRatio >= 1.5) regimeScore += 15;
  else if (volumeRatio >= 1.0) regimeScore += 8;
  else if (volumeRatio < 0.7) regimeScore -= 10;

  // ===== CLASSIFY REGIME =====
  // UPDATED: Use behavioral ADX exhaustion instead of absolute threshold
  
  // Check behavioral exhaustion first (if provided)
  const behavioralExhausted = adxExhaustion?.isExhausted === true;
  const isContinuation = adxExhaustion?.isContinuation === true;
  
  // Legacy momentum exhaustion check (fallback)
  const legacyMomentumExhausted = momentumScore.isExhausted;
  
  // CRITICAL: High ADX + rising + no behavioral exhaustion = CONTINUATION, not exhaustion
  // This is the key fix: absolute ADX threshold alone does NOT mean exhausted
  if (behavioralExhausted && !isContinuation) {
    regime = "EXHAUSTED";
    reason = `Behavioral exhaustion: ${adxExhaustion?.exhaustionType} (score: ${adxExhaustion?.exhaustionScore})`;
  } else if (isContinuation) {
    // High ADX but continuation mode - treat as strong trending, not exhausted
    regime = "TRENDING";
    reason = `Strong trend continuation (ADX: ${adx.toFixed(1)}, slope: ${adxExhaustion?.components.adxSlope.toFixed(2)})`;
    regimeScore = Math.max(regimeScore, 75); // Boost score for continuation
  } else if (legacyMomentumExhausted && !isContinuation) {
    // Fallback: legacy momentum exhaustion check
    regime = "EXHAUSTED";
    reason = "Momentum exhausted (legacy check)";
  } else if (regimeScore >= 60) {
    regime = "TRENDING";
    reason = `Strong trend (score: ${regimeScore.toFixed(0)}, ADX: ${adx.toFixed(1)})`;
  } else if (regimeScore >= 35) {
    regime = "TRANSITIONING";
    reason = `Emerging trend (score: ${regimeScore.toFixed(0)}, ADX: ${adx.toFixed(1)})`;
  } else {
    regime = "RANGING";
    reason = `No clear trend (score: ${regimeScore.toFixed(0)}, ADX: ${adx.toFixed(1)})`;
  }

  // Determine allowed strategies per regime
  let allowedStrategies: string[] = [];
  let qualityThreshold = 65;
  let positionSizeMultiplier = 1.0;
  let tradeable = true;

  switch (regime) {
    case "TRENDING":
      allowedStrategies = ["trend-following", "momentum", "ema-cross", "macd"];
      qualityThreshold = 60;
      positionSizeMultiplier = 1.0;
      break;
    case "TRANSITIONING":
      allowedStrategies = ["squeeze-breakout", "momentum", "pullback"];
      qualityThreshold = 70;
      positionSizeMultiplier = 0.75;
      break;
    case "RANGING":
      allowedStrategies = ["mean-reversion", "bollinger-reversal"];
      qualityThreshold = 75;
      positionSizeMultiplier = 0.5;
      tradeable = bbSqueeze; // Only trade ranging if squeeze breakout
      break;
    case "EXHAUSTED":
      allowedStrategies = [];
      qualityThreshold = 100; // Block all new entries
      positionSizeMultiplier = 0;
      tradeable = false;
      break;
  }

  return {
    regime,
    regimeScore: Math.min(100, Math.max(0, Math.round(regimeScore))),
    tradeable,
    allowedStrategies,
    qualityThreshold,
    positionSizeMultiplier,
    bbSqueeze,
    bbWidth,
    reason,
    adxExhaustion
  };
}

// ============= BOLLINGER BAND SQUEEZE DETECTION =============
export interface BollingerSqueezeResult {
  isSqueeze: boolean;
  squeezeIntensity: number;         // 0-100
  isBreakingOut: boolean;
  breakoutDirection: "long" | "short" | "none";
  bbWidth: number;
  bbWidthPercentile: number;        // Current width vs historical
}

export function detectBollingerSqueeze(
  prices: number[],
  period: number = 20,
  stdDevMultiplier: number = 2
): BollingerSqueezeResult {
  const defaultResult: BollingerSqueezeResult = {
    isSqueeze: false,
    squeezeIntensity: 0,
    isBreakingOut: false,
    breakoutDirection: "none",
    bbWidth: 0,
    bbWidthPercentile: 50
  };

  if (prices.length < period + 20) return defaultResult;

  // Calculate current BB
  const recentPrices = prices.slice(-period);
  const sma = recentPrices.reduce((a, b) => a + b, 0) / period;
  const variance = recentPrices.reduce((sum, p) => sum + Math.pow(p - sma, 2), 0) / period;
  const stdDev = Math.sqrt(variance);
  
  const upperBand = sma + (stdDev * stdDevMultiplier);
  const lowerBand = sma - (stdDev * stdDevMultiplier);
  const bbWidth = ((upperBand - lowerBand) / sma) * 100;

  // Calculate historical BB widths for percentile
  const historicalWidths: number[] = [];
  for (let i = period + 20; i <= prices.length; i++) {
    const histPrices = prices.slice(i - period, i);
    const histSma = histPrices.reduce((a, b) => a + b, 0) / period;
    const histVar = histPrices.reduce((sum, p) => sum + Math.pow(p - histSma, 2), 0) / period;
    const histStdDev = Math.sqrt(histVar);
    const histWidth = ((histSma + histStdDev * stdDevMultiplier) - (histSma - histStdDev * stdDevMultiplier)) / histSma * 100;
    historicalWidths.push(histWidth);
  }

  // Calculate percentile
  const sortedWidths = [...historicalWidths].sort((a, b) => a - b);
  const bbWidthPercentile = (sortedWidths.filter(w => w < bbWidth).length / sortedWidths.length) * 100;

  // Squeeze = width in bottom 20% of historical
  const isSqueeze = bbWidthPercentile < 20;
  const squeezeIntensity = Math.max(0, 100 - bbWidthPercentile * 5);

  // Check for breakout
  const currentPrice = prices[prices.length - 1];
  const prevPrice = prices[prices.length - 2];
  let isBreakingOut = false;
  let breakoutDirection: "long" | "short" | "none" = "none";

  if (isSqueeze || bbWidthPercentile < 30) {
    if (currentPrice > upperBand && prevPrice <= upperBand) {
      isBreakingOut = true;
      breakoutDirection = "long";
    } else if (currentPrice < lowerBand && prevPrice >= lowerBand) {
      isBreakingOut = true;
      breakoutDirection = "short";
    }
  }

  return {
    isSqueeze,
    squeezeIntensity: Math.round(squeezeIntensity),
    isBreakingOut,
    breakoutDirection,
    bbWidth: Math.round(bbWidth * 100) / 100,
    bbWidthPercentile: Math.round(bbWidthPercentile)
  };
}

// ============= SWING HIGH/LOW DETECTION =============
export interface SwingPointResult {
  swingHigh: number;
  swingLow: number;
  swingHighIndex: number;
  swingLowIndex: number;
  swingHighAge: number;      // Bars since swing high
  swingLowAge: number;       // Bars since swing low
  isNearSwingHigh: boolean;  // Price within 0.5% of swing high
  isNearSwingLow: boolean;   // Price within 0.5% of swing low
}

export function findSwingPoints(
  klines: any[],
  lookback: number = 20
): SwingPointResult {
  const recentKlines = klines.slice(-lookback);
  const currentPrice = parseFloat(klines[klines.length - 1][4]);
  
  let swingHigh = -Infinity;
  let swingLow = Infinity;
  let swingHighIndex = 0;
  let swingLowIndex = 0;

  for (let i = 0; i < recentKlines.length; i++) {
    const high = parseFloat(recentKlines[i][2]);
    const low = parseFloat(recentKlines[i][3]);
    
    if (high > swingHigh) {
      swingHigh = high;
      swingHighIndex = i;
    }
    if (low < swingLow) {
      swingLow = low;
      swingLowIndex = i;
    }
  }

  const swingHighAge = recentKlines.length - 1 - swingHighIndex;
  const swingLowAge = recentKlines.length - 1 - swingLowIndex;
  const nearThreshold = 0.005; // 0.5%
  
  return { 
    swingHigh, 
    swingLow, 
    swingHighIndex, 
    swingLowIndex,
    swingHighAge,
    swingLowAge,
    isNearSwingHigh: Math.abs(currentPrice - swingHigh) / swingHigh < nearThreshold,
    isNearSwingLow: Math.abs(currentPrice - swingLow) / swingLow < nearThreshold
  };
}

// ============= BOLLINGER BYPASS PRICE ACTION CONFIRMATION =============
// Validates price action before allowing Bollinger bypass entries
// At least ONE of the confirmations must pass to prevent chasing single-candle expansions
export interface BollingerPriceActionResult {
  anyConfirmationPassed: boolean;
  confirmations: {
    shallowPullback: boolean;
    structureIntact: boolean;
    consolidationBreakout: boolean;
    noWickRejection: boolean;
  };
  details: {
    pullbackDepth: number;
    hasHigherLows: boolean;
    hasLowerHighs: boolean;
    isConsolidating: boolean;
    wickRejectionCount: number;
  };
  reasons: string[];
}

export function checkBollingerBypassPriceAction(
  klines: any[],
  direction: "long" | "short",
  pullbackDepth: number,
  currentATR: number,
  params: {
    shallowPullbackMaxDepth: number;
    structureLookbackBars: number;
    consolidationMaxCandleAtr: number;
    consolidationLookbackBars: number;
    consolidationCompressionFactor: number;
    wickRejectionLookbackBars: number;
    wickRejectionMinCount: number;
    wickRejectionWickPercent: number;
  }
): BollingerPriceActionResult {
  const reasons: string[] = [];
  const confirmations = {
    shallowPullback: false,
    structureIntact: false,
    consolidationBreakout: false,
    noWickRejection: false
  };
  const details = {
    pullbackDepth: pullbackDepth,
    hasHigherLows: false,
    hasLowerHighs: false,
    isConsolidating: false,
    wickRejectionCount: 0
  };
  
  if (klines.length < 10) {
    return {
      anyConfirmationPassed: false,
      confirmations,
      details,
      reasons: ["Insufficient data for price action analysis"]
    };
  }
  
  // 1. SHALLOW PULLBACK CHECK (≤ 38.2% Fib retracement)
  // A shallow pullback means we're not chasing an overextended move
  if (pullbackDepth > 0 && pullbackDepth <= params.shallowPullbackMaxDepth) {
    confirmations.shallowPullback = true;
    reasons.push(`✓ Shallow pullback: ${pullbackDepth.toFixed(1)}% ≤ ${params.shallowPullbackMaxDepth}%`);
  } else if (pullbackDepth > params.shallowPullbackMaxDepth) {
    reasons.push(`✗ Deep pullback: ${pullbackDepth.toFixed(1)}% > ${params.shallowPullbackMaxDepth}%`);
  } else {
    reasons.push(`✗ No pullback detected`);
  }
  
  // 2. TREND STRUCTURE CHECK (Higher-lows for long, Lower-highs for short)
  const lookback = params.structureLookbackBars;
  if (klines.length >= lookback) {
    const recent = klines.slice(-lookback);
    const prevHalf = recent.slice(0, Math.floor(lookback / 2));
    const currHalf = recent.slice(Math.floor(lookback / 2));
    
    // Find highs and lows for each half
    const prevHigh = Math.max(...prevHalf.map(k => parseFloat(k[2])));
    const currHigh = Math.max(...currHalf.map(k => parseFloat(k[2])));
    const prevLow = Math.min(...prevHalf.map(k => parseFloat(k[3])));
    const currLow = Math.min(...currHalf.map(k => parseFloat(k[3])));
    
    details.hasHigherLows = currLow > prevLow;
    details.hasLowerHighs = currHigh < prevHigh;
    
    if (direction === "long" && currHigh >= prevHigh && currLow > prevLow) {
      confirmations.structureIntact = true;
      reasons.push(`✓ Bullish structure: HH/HL intact`);
    } else if (direction === "short" && currLow <= prevLow && currHigh < prevHigh) {
      confirmations.structureIntact = true;
      reasons.push(`✓ Bearish structure: LL/LH intact`);
    } else if (direction === "long") {
      reasons.push(`✗ Bullish structure broken: HL=${details.hasHigherLows}`);
    } else {
      reasons.push(`✗ Bearish structure broken: LH=${details.hasLowerHighs}`);
    }
  }
  
  // 3. CONSOLIDATION/FLAG CHECK (Low volatility compression before breakout)
  const consolidationBars = Math.min(params.consolidationLookbackBars, klines.length - 1);
  if (consolidationBars >= 2 && currentATR > 0) {
    const recentCandles = klines.slice(-consolidationBars - 1, -1); // Exclude current candle
    const currentCandle = klines[klines.length - 1];
    
    const currentRange = Math.abs(parseFloat(currentCandle[2]) - parseFloat(currentCandle[3]));
    const currentRangeAtr = currentRange / currentATR;
    
    // Check if recent candles show compression
    let compressionCount = 0;
    const avgRange = recentCandles.reduce((sum, k) => {
      return sum + Math.abs(parseFloat(k[2]) - parseFloat(k[3]));
    }, 0) / recentCandles.length;
    
    for (const candle of recentCandles) {
      const range = Math.abs(parseFloat(candle[2]) - parseFloat(candle[3]));
      if (range <= avgRange * params.consolidationCompressionFactor) {
        compressionCount++;
      }
    }
    
    details.isConsolidating = currentRangeAtr <= params.consolidationMaxCandleAtr && 
                               compressionCount >= consolidationBars / 2;
    
    if (details.isConsolidating) {
      confirmations.consolidationBreakout = true;
      reasons.push(`✓ Consolidation detected: candle ${currentRangeAtr.toFixed(2)}x ATR, ${compressionCount}/${consolidationBars} compressed`);
    } else {
      reasons.push(`✗ No consolidation: candle ${currentRangeAtr.toFixed(2)}x ATR (max ${params.consolidationMaxCandleAtr})`);
    }
  }
  
  // 4. WICK REJECTION CLUSTER CHECK
  // For LONG: upper wicks should NOT dominate (sellers rejecting at highs)
  // For SHORT: lower wicks should NOT dominate (buyers rejecting at lows)
  const wickLookback = Math.min(params.wickRejectionLookbackBars, klines.length);
  let rejectionWickCount = 0;
  
  for (let i = klines.length - wickLookback; i < klines.length; i++) {
    if (i < 0) continue;
    const candle = klines[i];
    const open = parseFloat(candle[1]);
    const high = parseFloat(candle[2]);
    const low = parseFloat(candle[3]);
    const close = parseFloat(candle[4]);
    
    const candleRange = high - low;
    if (candleRange <= 0) continue;
    
    const body = Math.abs(close - open);
    const upperWick = high - Math.max(open, close);
    const lowerWick = Math.min(open, close) - low;
    
    const upperWickPercent = (upperWick / candleRange) * 100;
    const lowerWickPercent = (lowerWick / candleRange) * 100;
    
    if (direction === "long" && upperWickPercent > params.wickRejectionWickPercent) {
      rejectionWickCount++;
    } else if (direction === "short" && lowerWickPercent > params.wickRejectionWickPercent) {
      rejectionWickCount++;
    }
  }
  
  details.wickRejectionCount = rejectionWickCount;
  
  // No wick rejection cluster = confirmation passes
  if (rejectionWickCount < params.wickRejectionMinCount) {
    confirmations.noWickRejection = true;
    reasons.push(`✓ No wick rejection cluster: ${rejectionWickCount}/${wickLookback} rejection wicks`);
  } else {
    reasons.push(`✗ Wick rejection cluster: ${rejectionWickCount}/${wickLookback} candles show ${direction === "long" ? "upper" : "lower"} rejection`);
  }
  
  // ANY confirmation passing = allow bypass
  const anyConfirmationPassed = confirmations.shallowPullback || 
                                 confirmations.structureIntact || 
                                 confirmations.consolidationBreakout || 
                                 confirmations.noWickRejection;
  
  return {
    anyConfirmationPassed,
    confirmations,
    details,
    reasons
  };
}

// ============= PHASE 3: CONTEXT-AWARE STOP LOSS CALCULATION =============
export interface ContextAwareStopResult {
  stopLoss: number;
  stopType: "atr_based" | "swing_based" | "hybrid";
  atrMultiplier: number;
  swingLevel: number | null;
  distancePercent: number;
  distanceATR: number;
  reason: string;
}

export function calculateContextAwareStop(
  entryPrice: number,
  side: "BUY" | "SELL",
  currentATR: number,
  adx: number,
  klines: any[],
  atrRatio: number = 1.0 // Current ATR / historical ATR
): ContextAwareStopResult {
  const CS = CONTEXT_STOP_PARAMS;
  const STRONG_TREND_ADX = CS.STRONG_TREND_ADX;
  const MEDIUM_TREND_ADX_MIN = CS.MEDIUM_TREND_ADX;
  const STRONG_TREND_ATR_MULT = CS.STRONG_ATR_MULT;
  const MEDIUM_TREND_ATR_MULT = CS.MEDIUM_ATR_MULT;
  const WEAK_TREND_ATR_MULT = CS.WEAK_ATR_MULT;
  const HIGH_VOL_RATIO = CS.HIGH_VOL_RATIO;
  const HIGH_VOL_EXPANSION = CS.HIGH_VOL_EXPANSION;
  const LOW_VOL_RATIO = CS.LOW_VOL_RATIO;
  const LOW_VOL_CONTRACTION = CS.LOW_VOL_CONTRACTION;
  const SWING_BUFFER_ATR = CS.SWING_BUFFER_ATR;
  const MAX_SWING_DISTANCE_ATR = CS.MAX_SWING_DISTANCE_ATR;
  const MIN_SWING_DISTANCE_ATR = CS.MIN_SWING_DISTANCE_ATR;

  // 1. Determine base ATR multiplier from ADX
  let atrMultiplier: number;
  let adxReason: string;
  
  if (adx >= STRONG_TREND_ADX) {
    atrMultiplier = STRONG_TREND_ATR_MULT;
    adxReason = `Strong trend (ADX=${adx.toFixed(1)}) → ${atrMultiplier}x ATR`;
  } else if (adx >= MEDIUM_TREND_ADX_MIN) {
    atrMultiplier = MEDIUM_TREND_ATR_MULT;
    adxReason = `Medium trend (ADX=${adx.toFixed(1)}) → ${atrMultiplier}x ATR`;
  } else {
    atrMultiplier = WEAK_TREND_ATR_MULT;
    adxReason = `Weak trend (ADX=${adx.toFixed(1)}) → ${atrMultiplier}x ATR`;
  }

  // 2. Apply volatility adjustment
  let volatilityAdjustment = 1.0;
  let volReason = "";
  
  if (atrRatio > HIGH_VOL_RATIO) {
    volatilityAdjustment = HIGH_VOL_EXPANSION;
    volReason = ` | High volatility (${atrRatio.toFixed(2)}x) → +30% width`;
  } else if (atrRatio < LOW_VOL_RATIO) {
    volatilityAdjustment = LOW_VOL_CONTRACTION;
    volReason = ` | Low volatility (${atrRatio.toFixed(2)}x) → -15% width`;
  }
  
  const adjustedMultiplier = atrMultiplier * volatilityAdjustment;

  // 3. Calculate ATR-based stop
  const atrDistance = currentATR * adjustedMultiplier;
  let atrBasedStop: number;
  
  if (side === "BUY") {
    atrBasedStop = entryPrice - atrDistance;
  } else {
    atrBasedStop = entryPrice + atrDistance;
  }

  // 4. Find swing points for structure-based stop
  const swingPoints = findSwingPoints(klines, 20);
  let swingBasedStop: number | null = null;
  let swingLevel: number | null = null;
  let swingReason = "";
  
  if (klines.length >= 20) {
    if (side === "BUY") {
      // For LONG: Stop below recent swing low
      const swingBuffer = currentATR * SWING_BUFFER_ATR;
      const potentialStop = swingPoints.swingLow - swingBuffer;
      const distanceFromEntry = entryPrice - potentialStop;
      const distanceInATR = distanceFromEntry / currentATR;
      
      // Check if swing stop is within acceptable range
      if (distanceInATR >= MIN_SWING_DISTANCE_ATR && distanceInATR <= MAX_SWING_DISTANCE_ATR) {
        swingBasedStop = potentialStop;
        swingLevel = swingPoints.swingLow;
        swingReason = ` | Swing low at ${swingLevel.toFixed(2)} (${swingPoints.swingLowAge} bars ago)`;
      }
    } else {
      // For SHORT: Stop above recent swing high
      const swingBuffer = currentATR * SWING_BUFFER_ATR;
      const potentialStop = swingPoints.swingHigh + swingBuffer;
      const distanceFromEntry = potentialStop - entryPrice;
      const distanceInATR = distanceFromEntry / currentATR;
      
      if (distanceInATR >= MIN_SWING_DISTANCE_ATR && distanceInATR <= MAX_SWING_DISTANCE_ATR) {
        swingBasedStop = potentialStop;
        swingLevel = swingPoints.swingHigh;
        swingReason = ` | Swing high at ${swingLevel.toFixed(2)} (${swingPoints.swingHighAge} bars ago)`;
      }
    }
  }

  // 5. Choose final stop (prefer swing-based when available and reasonable)
  let finalStop: number;
  let stopType: "atr_based" | "swing_based" | "hybrid";
  
  if (swingBasedStop !== null) {
    if (side === "BUY") {
      // For LONG: Use the HIGHER (more protective) of the two
      finalStop = Math.max(atrBasedStop, swingBasedStop);
      stopType = finalStop === swingBasedStop ? "swing_based" : 
                 Math.abs(finalStop - swingBasedStop) < currentATR * 0.2 ? "hybrid" : "atr_based";
    } else {
      // For SHORT: Use the LOWER (more protective) of the two
      finalStop = Math.min(atrBasedStop, swingBasedStop);
      stopType = finalStop === swingBasedStop ? "swing_based" :
                 Math.abs(finalStop - swingBasedStop) < currentATR * 0.2 ? "hybrid" : "atr_based";
    }
  } else {
    finalStop = atrBasedStop;
    stopType = "atr_based";
  }

  // Calculate final distance metrics
  const distancePercent = side === "BUY" 
    ? ((entryPrice - finalStop) / entryPrice) * 100
    : ((finalStop - entryPrice) / entryPrice) * 100;
  const distanceATR = side === "BUY"
    ? (entryPrice - finalStop) / currentATR
    : (finalStop - entryPrice) / currentATR;

  return {
    stopLoss: finalStop,
    stopType,
    atrMultiplier: adjustedMultiplier,
    swingLevel,
    distancePercent,
    distanceATR,
    reason: `${adxReason}${volReason}${swingReason}`
  };
}

// ============= PHASE 3: DYNAMIC R-MULTIPLE TRAILING =============
export interface DynamicTrailingResult {
  activationR: number;
  trailDistanceR: number;
  lockR: number;
  isActivated: boolean;
  currentR: number;
  newStopPrice: number | null;
  reason: string;
}

export function calculateDynamicTrailing(
  entryPrice: number,
  currentPrice: number,
  originalStopLoss: number,
  side: "BUY" | "SELL",
  adx: number,
  momentumScore: MomentumScoreResult,
  peakRMultiple: number = 0
): DynamicTrailingResult {
  const DT = DYNAMIC_TRAILING_PARAMS;
  const STRONG_TREND_ADX = DT.STRONG_ADX;
  const MEDIUM_TREND_ADX_MIN = DT.MEDIUM_ADX;
  
  const STRONG_ACTIVATION_R = DT.STRONG_ACTIVATION_R;
  const MEDIUM_ACTIVATION_R = DT.MEDIUM_ACTIVATION_R;
  const WEAK_ACTIVATION_R = DT.WEAK_ACTIVATION_R;
  
  const STRONG_TRAIL_R = DT.STRONG_TRAIL_R;
  const MEDIUM_TRAIL_R = DT.MEDIUM_TRAIL_R;
  const WEAK_TRAIL_R = DT.WEAK_TRAIL_R;
  
  const ACCELERATION_MULTIPLIER = DT.ACCELERATION_MULTIPLIER;
  const EXHAUSTION_BONUS_R = DT.EXHAUSTION_BONUS_R;
  
  const LOCK_TIERS = DT.LOCK_TIERS;

  // Calculate risk (R) in price terms
  const riskPrice = side === "BUY" 
    ? entryPrice - originalStopLoss
    : originalStopLoss - entryPrice;
  
  if (riskPrice <= 0) {
    return {
      activationR: 0,
      trailDistanceR: 0,
      lockR: 0,
      isActivated: false,
      currentR: 0,
      newStopPrice: null,
      reason: "Invalid stop loss (risk <= 0)"
    };
  }

  // Calculate current R-multiple
  const pnlPrice = side === "BUY"
    ? currentPrice - entryPrice
    : entryPrice - currentPrice;
  const currentR = pnlPrice / riskPrice;

  // Determine activation threshold based on ADX
  let activationR: number;
  let trailDistanceR: number;
  let adxReason: string;
  
  if (adx >= STRONG_TREND_ADX) {
    activationR = STRONG_ACTIVATION_R;
    trailDistanceR = STRONG_TRAIL_R;
    adxReason = `Strong trend → activate at ${activationR}R, trail ${trailDistanceR}R`;
  } else if (adx >= MEDIUM_TREND_ADX_MIN) {
    activationR = MEDIUM_ACTIVATION_R;
    trailDistanceR = MEDIUM_TRAIL_R;
    adxReason = `Medium trend → activate at ${activationR}R, trail ${trailDistanceR}R`;
  } else {
    activationR = WEAK_ACTIVATION_R;
    trailDistanceR = WEAK_TRAIL_R;
    adxReason = `Weak trend → activate at ${activationR}R, trail ${trailDistanceR}R`;
  }

  // Apply momentum adjustments
  let momentumReason = "";
  if (momentumScore.isAccelerating) {
    trailDistanceR *= ACCELERATION_MULTIPLIER;
    momentumReason = " | Accelerating → tighter trail";
  }

  // Determine lock level from tiers
  const effectiveR = Math.max(currentR, peakRMultiple);
  let lockR = 0;
  
  for (const tier of LOCK_TIERS) {
    if (effectiveR >= tier.rMultiple) {
      lockR = tier.lockR;
    }
  }
  
  // Apply exhaustion bonus
  if (momentumScore.isExhausted && lockR > 0) {
    lockR += EXHAUSTION_BONUS_R;
    momentumReason += " | Exhausted → +0.5R lock";
  }

  // Check if trailing is activated
  const isActivated = currentR >= activationR;
  
  // Calculate new stop price if activated
  let newStopPrice: number | null = null;
  
  if (isActivated) {
    // Calculate stop based on lock level (higher of lock or trail from current)
    const lockStopFromEntry = side === "BUY"
      ? entryPrice + (lockR * riskPrice)
      : entryPrice - (lockR * riskPrice);
    
    const trailStopFromCurrent = side === "BUY"
      ? currentPrice - (trailDistanceR * riskPrice)
      : currentPrice + (trailDistanceR * riskPrice);
    
    // Use the more protective stop
    if (side === "BUY") {
      newStopPrice = Math.max(lockStopFromEntry, trailStopFromCurrent, originalStopLoss);
    } else {
      // For SHORT, lower price is more protective for stop
      newStopPrice = Math.min(
        Math.max(lockStopFromEntry, 0), 
        trailStopFromCurrent,
        originalStopLoss
      );
      // Actually for short, we want the stop above entry, so higher is more protective
      newStopPrice = Math.min(lockStopFromEntry, trailStopFromCurrent);
      if (newStopPrice < originalStopLoss) {
        newStopPrice = originalStopLoss;
      }
    }
  }

  return {
    activationR,
    trailDistanceR,
    lockR,
    isActivated,
    currentR,
    newStopPrice,
    reason: `${adxReason}${momentumReason} | Current: ${currentR.toFixed(2)}R, Lock: ${lockR.toFixed(2)}R`
  };
}

// ============= PHASE 3: EXIT SIGNAL SCORING =============
export interface ExitSignalResult {
  shouldExit: boolean;
  exitScore: number;           // 0-100
  isEmergency: boolean;
  components: {
    momentumExhaustion: number;
    swingViolation: number;
    reversalSignal: number;
    timeDecay: number;
    volatilitySpike: number;
  };
  reason: string;
}

export function calculateExitSignal(
  position: {
    side: string;
    entryPrice: number;
    stopLoss: number;
    openedAt: Date;
    peakPnlPercent: number;
  },
  currentPrice: number,
  momentumScore: MomentumScoreResult,
  swingPoints: SwingPointResult,
  reversalScore: number,
  atrRatio: number,
  currentPnlPercent: number
): ExitSignalResult {
  const components = {
    momentumExhaustion: 0,
    swingViolation: 0,
    reversalSignal: 0,
    timeDecay: 0,
    volatilitySpike: 0
  };
  const reasons: string[] = [];

  // 1. Momentum Exhaustion (max 30 points)
  if (momentumScore.isExhausted) {
    components.momentumExhaustion = 30;
    reasons.push("Momentum exhausted");
  } else if (momentumScore.isWeakening) {
    // Check if weakening against position direction
    const isAgainstPosition = 
      (position.side === "BUY" && momentumScore.direction === "bearish") ||
      (position.side === "SELL" && momentumScore.direction === "bullish");
    
    if (isAgainstPosition) {
      components.momentumExhaustion = 20;
      reasons.push("Momentum weakening against position");
    }
  }

  // 2. Swing Violation (max 25 points)
  if (position.side === "BUY" && swingPoints.isNearSwingLow) {
    components.swingViolation = 25;
    reasons.push("Price near swing low");
  } else if (position.side === "SELL" && swingPoints.isNearSwingHigh) {
    components.swingViolation = 25;
    reasons.push("Price near swing high");
  }

  // 3. Reversal Signal (max 20 points)
  if (reversalScore >= 70) {
    components.reversalSignal = 20;
    reasons.push(`High reversal score: ${reversalScore}`);
  } else if (reversalScore >= 50) {
    components.reversalSignal = 10;
    reasons.push(`Moderate reversal score: ${reversalScore}`);
  }

  // 4. Time Decay (max 15 points)
  const positionAgeHours = (Date.now() - position.openedAt.getTime()) / (1000 * 60 * 60);
  const profitDecay = position.peakPnlPercent - currentPnlPercent;
  
  if (positionAgeHours > 4 && profitDecay > 0.5) {
    components.timeDecay = 15;
    reasons.push(`Stale position (${positionAgeHours.toFixed(1)}h) with profit decay`);
  } else if (positionAgeHours > 2 && profitDecay > 0.3) {
    components.timeDecay = 8;
    reasons.push(`Position aging with minor decay`);
  }

  // 5. Volatility Spike (max 10 points)
  if (atrRatio > 2.0) {
    components.volatilitySpike = 10;
    reasons.push(`Extreme volatility (${atrRatio.toFixed(2)}x ATR)`);
  } else if (atrRatio > 1.5) {
    components.volatilitySpike = 5;
    reasons.push(`High volatility (${atrRatio.toFixed(2)}x ATR)`);
  }

  // Calculate total score
  const exitScore = Object.values(components).reduce((a, b) => a + b, 0);
  const shouldExit = exitScore >= 50;
  const isEmergency = exitScore >= 80;

  return {
    shouldExit,
    exitScore,
    isEmergency,
    components,
    reason: reasons.join(" | ") || "No exit signals"
  };
}

// ============= CONTINUATION MODE DETECTION =============
// Detects impulse follow-through opportunities at high ADX (45-55) with all factors aligned
import { CONTINUATION_MODE_PARAMS } from "./constants.ts";

export interface ContinuationModeResult {
  qualifies: boolean;
  reason: string;
  adxInRange: boolean;
  trendStructureValid: boolean;
  momentumStrong: boolean;
  priceActionConfirmed: boolean;
  volatilityOk: boolean;
  stochRsiSafe: boolean;
  noDivergence: boolean;
  positionSizeMultiplier: number;
  exitParams: {
    partialExitR: number;
    partialExitPercent: number;
    useStructureTrailing: boolean;
  };
  gateResults: {
    gate: string;
    passed: boolean;
    value: string;
  }[];
}

// Helper: Detect higher high + higher low pattern (bullish structure)
export function detectHigherHighLow(prices: number[], lookback: number = 10): boolean {
  if (prices.length < lookback) return false;
  const recent = prices.slice(-lookback);
  const prevHalf = recent.slice(0, Math.floor(lookback / 2));
  const currHalf = recent.slice(Math.floor(lookback / 2));
  const prevHigh = Math.max(...prevHalf);
  const currHigh = Math.max(...currHalf);
  const prevLow = Math.min(...prevHalf);
  const currLow = Math.min(...currHalf);
  return currHigh > prevHigh && currLow > prevLow;
}

// Helper: Detect lower low + lower high pattern (bearish structure)
export function detectLowerLowHigh(prices: number[], lookback: number = 10): boolean {
  if (prices.length < lookback) return false;
  const recent = prices.slice(-lookback);
  const prevHalf = recent.slice(0, Math.floor(lookback / 2));
  const currHalf = recent.slice(Math.floor(lookback / 2));
  const prevHigh = Math.max(...prevHalf);
  const currHigh = Math.max(...currHalf);
  const prevLow = Math.min(...prevHalf);
  const currLow = Math.min(...currHalf);
  return currLow < prevLow && currHigh < prevHigh;
}

// Helper: Detect continuation candle (closes in trend direction)
export function detectContinuationCandle(klines: any[], direction: "long" | "short"): boolean {
  if (klines.length < 2) return false;
  const current = klines[klines.length - 1];
  const prev = klines[klines.length - 2];
  const currOpen = parseFloat(current[1]);
  const currClose = parseFloat(current[4]);
  const prevClose = parseFloat(prev[4]);
  if (direction === "long") {
    return currClose > currOpen && currClose > prevClose;
  } else {
    return currClose < currOpen && currClose < prevClose;
  }
}

// Main continuation mode detector
export function detectContinuationMode(
  adx: number,
  adxRising: boolean,
  adxSlope: number,
  conf1h: number,
  trend1h: string,
  conf4h: number,
  trend4h: string,
  momentumScore: number,
  hasDivergence: boolean,
  hasHigherHighLow: boolean,
  hasLowerLowHigh: boolean,
  isContinuationCandle: boolean,
  candleSizeATR: number,
  stochRsiK: number,
  direction: "long" | "short"
): ContinuationModeResult {
  const gateResults: { gate: string; passed: boolean; value: string }[] = [];
  let failureReason = "";
  
  // Gate 1: ADX in range (45-55)
  const adxInRange = adx >= CONTINUATION_MODE_PARAMS.MIN_ADX && adx <= CONTINUATION_MODE_PARAMS.MAX_ADX;
  gateResults.push({ gate: "ADX_IN_RANGE", passed: adxInRange, value: `${adx.toFixed(1)} (need ${CONTINUATION_MODE_PARAMS.MIN_ADX}-${CONTINUATION_MODE_PARAMS.MAX_ADX})` });
  if (!adxInRange) failureReason = `ADX ${adx.toFixed(1)} outside 45-55 range`;
  
  // Gate 2: ADX not falling (if required)
  const adxNotFalling = !CONTINUATION_MODE_PARAMS.REQUIRE_ADX_NOT_FALLING || adxSlope >= CONTINUATION_MODE_PARAMS.ADX_FALLING_THRESHOLD;
  gateResults.push({ gate: "ADX_NOT_FALLING", passed: adxNotFalling, value: `slope=${adxSlope.toFixed(2)}` });
  if (!adxNotFalling && !failureReason) failureReason = `ADX falling (slope=${adxSlope.toFixed(2)})`;
  
  // Gate 3: 1h confidence >= 70% and matches direction
  const trend1hMatches = (direction === "long" && trend1h === "bullish") || (direction === "short" && trend1h === "bearish");
  const trendStructureValid = conf1h >= CONTINUATION_MODE_PARAMS.MIN_1H_CONFIDENCE && trend1hMatches;
  gateResults.push({ gate: "1H_STRUCTURE", passed: trendStructureValid, value: `${trend1h} ${conf1h}% (need ${CONTINUATION_MODE_PARAMS.MIN_1H_CONFIDENCE}%)` });
  if (!trendStructureValid && !failureReason) failureReason = `1h structure not strong (${trend1h} ${conf1h}%)`;
  
  // Gate 4: 4h not opposing
  const trend4hOpposing = (direction === "long" && trend4h === "bearish") || (direction === "short" && trend4h === "bullish");
  const htfNotOpposing = !CONTINUATION_MODE_PARAMS.BLOCK_4H_OPPOSING || !trend4hOpposing;
  gateResults.push({ gate: "4H_NOT_OPPOSING", passed: htfNotOpposing, value: `${trend4h} ${conf4h}%` });
  if (!htfNotOpposing && !failureReason) failureReason = `4h opposes direction (${trend4h})`;
  
  // Gate 5: Momentum score above threshold
  const momentumStrong = momentumScore >= CONTINUATION_MODE_PARAMS.MIN_MOMENTUM_SCORE;
  gateResults.push({ gate: "MOMENTUM_STRONG", passed: momentumStrong, value: `${momentumScore} (need ${CONTINUATION_MODE_PARAMS.MIN_MOMENTUM_SCORE})` });
  if (!momentumStrong && !failureReason) failureReason = `Momentum weak (${momentumScore})`;
  
  // Gate 6: No divergence
  const noDivergence = !CONTINUATION_MODE_PARAMS.BLOCK_ON_DIVERGENCE || !hasDivergence;
  gateResults.push({ gate: "NO_DIVERGENCE", passed: noDivergence, value: hasDivergence ? "Divergence detected" : "No divergence" });
  if (!noDivergence && !failureReason) failureReason = "RSI/MACD divergence detected";
  
  // Gate 7: Price action confirmed (HH/HL for long, LL/LH for short, or continuation candle)
  const structureConfirmed = direction === "long" ? hasHigherHighLow : hasLowerLowHigh;
  const priceActionConfirmed = !CONTINUATION_MODE_PARAMS.REQUIRE_STRUCTURE_CONFIRMATION || 
    structureConfirmed || 
    (CONTINUATION_MODE_PARAMS.ALLOW_BREAKOUT_ENTRY && isContinuationCandle);
  gateResults.push({ gate: "PRICE_ACTION", passed: priceActionConfirmed, value: `structure=${structureConfirmed}, candle=${isContinuationCandle}` });
  if (!priceActionConfirmed && !failureReason) failureReason = "No price action confirmation";
  
  // Gate 8: Volatility OK (no parabolic candle)
  const volatilityOk = candleSizeATR <= CONTINUATION_MODE_PARAMS.MAX_CANDLE_SIZE_ATR;
  gateResults.push({ gate: "VOLATILITY_OK", passed: volatilityOk, value: `${candleSizeATR.toFixed(2)}x ATR (max ${CONTINUATION_MODE_PARAMS.MAX_CANDLE_SIZE_ATR}x)` });
  if (!volatilityOk && !failureReason) failureReason = `Parabolic candle (${candleSizeATR.toFixed(1)}x ATR)`;
  
  // Gate 9: StochRSI not at absolute extreme
  const stochRsiSafe = direction === "long" 
    ? stochRsiK <= CONTINUATION_MODE_PARAMS.MAX_STOCHRSI_K_LONG
    : stochRsiK >= CONTINUATION_MODE_PARAMS.MIN_STOCHRSI_K_SHORT;
  gateResults.push({ gate: "STOCHRSI_SAFE", passed: stochRsiSafe, value: `K=${stochRsiK.toFixed(0)}` });
  if (!stochRsiSafe && !failureReason) failureReason = `StochRSI at extreme (K=${stochRsiK.toFixed(0)})`;
  
  // All gates must pass
  const qualifies = adxInRange && adxNotFalling && trendStructureValid && htfNotOpposing && 
    momentumStrong && noDivergence && priceActionConfirmed && volatilityOk && stochRsiSafe;
  
  return {
    qualifies,
    reason: qualifies ? `Continuation mode: ADX=${adx.toFixed(1)}, 1h ${trend1h} ${conf1h}%` : failureReason,
    adxInRange,
    trendStructureValid,
    momentumStrong,
    priceActionConfirmed,
    volatilityOk,
    stochRsiSafe,
    noDivergence,
    positionSizeMultiplier: qualifies ? CONTINUATION_MODE_PARAMS.POSITION_SIZE_MULTIPLIER : 0,
    exitParams: {
      partialExitR: CONTINUATION_MODE_PARAMS.PARTIAL_EXIT_R_MULTIPLE,
      partialExitPercent: CONTINUATION_MODE_PARAMS.PARTIAL_EXIT_PERCENT,
      useStructureTrailing: CONTINUATION_MODE_PARAMS.USE_STRUCTURE_TRAILING,
    },
    gateResults
  };
}

// ============= MOMENTUM FLIP DETECTION =============
// Detects when momentum direction has recently changed
// Used to implement cooldown periods after direction flips

export interface MomentumFlipResult {
  flipped: boolean;               // Did momentum flip direction?
  from: 'bullish' | 'bearish' | 'neutral';
  to: 'bullish' | 'bearish' | 'neutral';
  delta: number;                  // Absolute change in score
  oldScore: number;
  newScore: number;
  cooldownActive: boolean;        // Should we block entries?
  safeDirection: 'long' | 'short' | 'none';  // Which direction is safe to trade
  blockedDirection: 'long' | 'short' | 'none';  // Which direction is blocked
  reason: string;
}

/**
 * Detects if momentum has recently flipped direction
 * @param currentScore Current momentum score (-100 to +100)
 * @param previousScore Previous momentum score from last signal/check
 * @param directionalThreshold Score magnitude to be considered "directional"
 * @param minFlipDelta Minimum change to be considered a "flip"
 */
export function detectMomentumFlip(
  currentScore: number,
  previousScore: number | undefined | null,
  directionalThreshold: number = 25,
  minFlipDelta: number = 40
): MomentumFlipResult {
  const defaultResult: MomentumFlipResult = {
    flipped: false,
    from: 'neutral',
    to: 'neutral',
    delta: 0,
    oldScore: previousScore ?? 0,
    newScore: currentScore,
    cooldownActive: false,
    safeDirection: 'none',
    blockedDirection: 'none',
    reason: 'No previous momentum data'
  };

  // If no previous score, can't detect flip
  if (previousScore === undefined || previousScore === null) {
    return defaultResult;
  }

  // Classify directions
  const classifyDirection = (score: number): 'bullish' | 'bearish' | 'neutral' => {
    if (score >= directionalThreshold) return 'bullish';
    if (score <= -directionalThreshold) return 'bearish';
    return 'neutral';
  };

  const previousDir = classifyDirection(previousScore);
  const currentDir = classifyDirection(currentScore);
  const delta = Math.abs(currentScore - previousScore);

  // Check for flip: was directional, now different direction
  const wasDirectional = previousDir !== 'neutral';
  const nowDirectional = currentDir !== 'neutral';
  const directionChanged = previousDir !== currentDir && wasDirectional;
  const isSignificantChange = delta >= minFlipDelta;

  // Determine if this is a meaningful flip
  const flipped = directionChanged && isSignificantChange;

  // Determine safe and blocked directions
  let safeDirection: 'long' | 'short' | 'none' = 'none';
  let blockedDirection: 'long' | 'short' | 'none' = 'none';
  let reason = '';

  if (flipped) {
    // Flipped from bearish to bullish: block SHORT (old direction), safe to LONG
    if (previousDir === 'bearish' && currentDir === 'bullish') {
      safeDirection = 'long';
      blockedDirection = 'short';
      reason = `Momentum flipped BEARISH→BULLISH (${previousScore.toFixed(0)}→${currentScore.toFixed(0)}), blocking SHORT`;
    }
    // Flipped from bullish to bearish: block LONG (old direction), safe to SHORT
    else if (previousDir === 'bullish' && currentDir === 'bearish') {
      safeDirection = 'short';
      blockedDirection = 'long';
      reason = `Momentum flipped BULLISH→BEARISH (${previousScore.toFixed(0)}→${currentScore.toFixed(0)}), blocking LONG`;
    }
    // Flipped from bearish to neutral: partial flip, still risky to SHORT
    else if (previousDir === 'bearish' && currentDir === 'neutral') {
      blockedDirection = 'short';
      reason = `Momentum fading from bearish to neutral (${previousScore.toFixed(0)}→${currentScore.toFixed(0)}), SHORT risky`;
    }
    // Flipped from bullish to neutral: partial flip, still risky to LONG
    else if (previousDir === 'bullish' && currentDir === 'neutral') {
      blockedDirection = 'long';
      reason = `Momentum fading from bullish to neutral (${previousScore.toFixed(0)}→${currentScore.toFixed(0)}), LONG risky`;
    }
  } else if (!flipped && delta > 0) {
    reason = `No flip detected: ${previousDir}→${currentDir}, delta=${delta.toFixed(0)} (min=${minFlipDelta})`;
  }

  return {
    flipped,
    from: previousDir,
    to: currentDir,
    delta,
    oldScore: previousScore,
    newScore: currentScore,
    cooldownActive: flipped,  // Cooldown is active when flip is detected
    safeDirection,
    blockedDirection,
    reason
  };
}

/**
 * Check if momentum is aligned with intended trade direction
 * Returns true if safe to proceed, false if blocked
 */
export function checkMomentumDirectionAlignment(
  momentumScore: number,
  intendedDirection: 'long' | 'short',
  blockShortAbove: number = 20,
  blockLongBelow: number = -20
): { aligned: boolean; blocked: boolean; reason: string; severity: 'low' | 'medium' | 'high' } {
  
  // For LONG: block if momentum is strongly bearish
  if (intendedDirection === 'long' && momentumScore < blockLongBelow) {
    const severity = momentumScore < -40 ? 'high' : momentumScore < -30 ? 'medium' : 'low';
    return {
      aligned: false,
      blocked: true,
      reason: `LONG blocked: momentum ${momentumScore.toFixed(0)} < ${blockLongBelow} (bearish)`,
      severity
    };
  }
  
  // For SHORT: block if momentum is strongly bullish
  if (intendedDirection === 'short' && momentumScore > blockShortAbove) {
    const severity = momentumScore > 40 ? 'high' : momentumScore > 30 ? 'medium' : 'low';
    return {
      aligned: false,
      blocked: true,
      reason: `SHORT blocked: momentum ${momentumScore.toFixed(0)} > ${blockShortAbove} (bullish)`,
      severity
    };
  }
  
  // Aligned or neutral - safe to proceed
  const aligned = (intendedDirection === 'long' && momentumScore > 0) || 
                  (intendedDirection === 'short' && momentumScore < 0);
  
  return {
    aligned,
    blocked: false,
    reason: aligned 
      ? `Momentum ${momentumScore.toFixed(0)} aligns with ${intendedDirection.toUpperCase()}`
      : `Momentum ${momentumScore.toFixed(0)} is neutral for ${intendedDirection.toUpperCase()}`,
    severity: 'low'
  };
}

// ============= TREND CONTINUATION PULLBACK DETECTION =============
// v2.0: ATR-normalized pullback detection with momentum recovery
// Upgrade: Uses ATR distance instead of % proximity, StochRSI cross-up instead of static threshold
export interface TrendContinuationPullbackResult {
  detected: boolean;
  eligible: boolean;
  direction: 'long' | 'short' | null;
  pullbackType: 'ema20' | 'ema50' | 'midpoint' | null;
  priceToEmaMidpoint: number;
  priceToEma20: number;
  priceToEma50: number;
  atrDistanceToEma: number;           // NEW: ATR-normalized distance
  momentumRecoveryDetected: boolean;   // NEW: Cross-up/down detected
  momentumRecoveryType: string;        // NEW: 'cross_up' | 'k_rising' | 'static_fallback'
  stochRsiCooled: boolean;
  stochRsiK: number;
  adxSufficient: boolean;
  adx: number;
  adxSlope: number;
  moveFromSwingPercent: number;
  positionMultiplier: number;
  stopLossAtr: number;
  stopAtrMultiplier: number;
  reasons: string[];
  blockReason: string | null;
}

export function detectTrendContinuationPullback(
  prices: number[],
  direction: 'long' | 'short',
  adx: number,
  adxSlope: number,
  stochRsiK4h: number,
  stochRsiK1h: number,
  high24h: number,
  low24h: number,
  atr: number,
  config: {
    minAdx: number;
    minAdxSlope: number;
    // v2.0: ATR-normalized distance config
    atrDistanceMin: number;
    atrDistanceMax: number;
    atrDistanceOptimal: number;
    atrDistanceMaxStrongAdx: number;
    strongAdxThreshold: number;
    // v2.0: Momentum recovery config
    momentumRecovery: {
      enabled: boolean;
      requireCross: boolean;
      fallbackStaticCheck: boolean;
      longMaxK: number;
      shortMinK: number;
      requireKRising: boolean;
      minKDelta: number;
    };
    // Fallback legacy % proximity (if ATR unavailable)
    emaProximityThreshold: number;
    emaProximityThresholdStrong: number;
    longMaxMove: number;
    shortMaxMove: number;
    shallowPullbackMaxMove: number;
    shallowPullbackThreshold: number;
    baseMultiplier: number;
    momentumAlignedMultiplier: number;
    shallowPullbackMultiplier: number;
    stopLossAtrMultiplier: number;
    emaStopBufferPercent: number;
    useMaxStop: boolean;
    adxSlopeGraduated?: {
      enabled: boolean;
      flatSlopeMin: number;
      flatSlopeMultiplier: number;
      mildDecelSlopeMin: number;
      mildDecelMultiplier: number;
      moderateDecelSlopeMin: number;
      moderateDecelMultiplier: number;
    };
    // v2.0: StochRSI previous values for cross detection
    stochRsiPrevK4h?: number;
    stochRsiD4h?: number;
    stochRsiPrevK1h?: number;
    stochRsiD1h?: number;
  }
): TrendContinuationPullbackResult {
  const defaultResult: TrendContinuationPullbackResult = {
    detected: false,
    eligible: false,
    direction: null,
    pullbackType: null,
    priceToEmaMidpoint: 0,
    priceToEma20: 0,
    priceToEma50: 0,
    atrDistanceToEma: 0,
    momentumRecoveryDetected: false,
    momentumRecoveryType: 'none',
    stochRsiCooled: false,
    stochRsiK: stochRsiK4h,
    adxSufficient: false,
    adx,
    adxSlope,
    moveFromSwingPercent: 0,
    positionMultiplier: config.baseMultiplier,
    stopLossAtr: atr,
    stopAtrMultiplier: 1.5,
    reasons: [],
    blockReason: null,
  };

  if (prices.length < 50) {
    defaultResult.blockReason = 'Insufficient price history for EMA calculation';
    return defaultResult;
  }

  const currentPrice = prices[prices.length - 1];
  const reasons: string[] = [];

  // Calculate EMAs
  const ema20Array = calculateEMAArray(prices, 20);
  const ema50Array = calculateEMAArray(prices, 50);
  
  if (ema20Array.length < 1 || ema50Array.length < 1) {
    defaultResult.blockReason = 'Could not calculate EMAs';
    return defaultResult;
  }

  const ema20 = ema20Array[ema20Array.length - 1];
  const ema50 = ema50Array[ema50Array.length - 1];
  const emaMidpoint = (ema20 + ema50) / 2;

  // Calculate distances (both % and ATR-normalized)
  const priceToEma20 = Math.abs((currentPrice - ema20) / ema20 * 100);
  const priceToEma50 = Math.abs((currentPrice - ema50) / ema50 * 100);
  const priceToEmaMidpoint = Math.abs((currentPrice - emaMidpoint) / emaMidpoint * 100);

  defaultResult.priceToEma20 = priceToEma20;
  defaultResult.priceToEma50 = priceToEma50;
  defaultResult.priceToEmaMidpoint = priceToEmaMidpoint;

  // v2.0: ATR-normalized distance to closest EMA
  const absDistToMid = Math.abs(currentPrice - emaMidpoint);
  const absDistToEma20 = Math.abs(currentPrice - ema20);
  const absDistToEma50 = Math.abs(currentPrice - ema50);
  const minAbsDist = Math.min(absDistToMid, absDistToEma20, absDistToEma50);
  const atrDistanceToEma = atr > 0 ? minAbsDist / atr : 999;
  defaultResult.atrDistanceToEma = atrDistanceToEma;

  // Check ADX requirement — GRADUATED slope tiers replace binary block
  const adxAboveMin = adx >= config.minAdx;
  const slopeAboveMin = adxSlope >= config.minAdxSlope;
  
  const graduated = config.adxSlopeGraduated;
  let slopeMultiplier = 1.0;
  let slopeGraduated = false;
  let slopeStopAtrMultiplier = config.stopLossAtrMultiplier;
  
  if (adxAboveMin && !slopeAboveMin && graduated?.enabled) {
    if (adxSlope >= graduated.flatSlopeMin) {
      slopeMultiplier = graduated.flatSlopeMultiplier;
      slopeStopAtrMultiplier = config.stopLossAtrMultiplier;
      slopeGraduated = true;
      reasons.push(`⚠️ ADX slope flat (${adxSlope.toFixed(2)}), graduated entry ${(slopeMultiplier * 100).toFixed(0)}%, stop ${slopeStopAtrMultiplier.toFixed(1)} ATR`);
    } else if (adxSlope >= graduated.mildDecelSlopeMin) {
      slopeMultiplier = graduated.mildDecelMultiplier;
      slopeStopAtrMultiplier = config.stopLossAtrMultiplier * 0.87;
      slopeGraduated = true;
      reasons.push(`⚠️ ADX slope mild decel (${adxSlope.toFixed(2)}), graduated entry ${(slopeMultiplier * 100).toFixed(0)}%, stop ${slopeStopAtrMultiplier.toFixed(2)} ATR`);
    } else if (adxSlope >= graduated.moderateDecelSlopeMin) {
      slopeMultiplier = graduated.moderateDecelMultiplier;
      slopeStopAtrMultiplier = config.stopLossAtrMultiplier * 0.73;
      slopeGraduated = true;
      reasons.push(`⚠️ ADX slope moderate decel (${adxSlope.toFixed(2)}), probe entry ${(slopeMultiplier * 100).toFixed(0)}%, stop ${slopeStopAtrMultiplier.toFixed(2)} ATR`);
    } else {
      defaultResult.blockReason = `ADX slope structural collapse: ${adxSlope.toFixed(2)} < ${graduated.moderateDecelSlopeMin}`;
      return defaultResult;
    }
  } else if (!adxAboveMin) {
    defaultResult.adxSufficient = false;
    defaultResult.blockReason = `ADX ${adx.toFixed(1)} < ${config.minAdx}`;
    return defaultResult;
  } else if (!slopeAboveMin && !graduated?.enabled) {
    defaultResult.adxSufficient = false;
    defaultResult.blockReason = `ADX slope ${adxSlope.toFixed(2)} < ${config.minAdxSlope} (graduated disabled)`;
    return defaultResult;
  }
  
  defaultResult.adxSufficient = true;
  reasons.push(`ADX ${adx.toFixed(1)} (slope: ${adxSlope >= 0 ? '+' : ''}${adxSlope.toFixed(2)}${slopeGraduated ? ' [GRADUATED]' : ''})`);

  // ===== v2.0: MOMENTUM RECOVERY DETECTION =====
  // Replaces static StochRSI threshold check with momentum recovery (cross-up/down)
  const mr = config.momentumRecovery;
  let momentumRecovered = false;
  let momentumRecoveryType = 'none';
  
  if (mr.enabled) {
    const prevK = config.stochRsiPrevK4h ?? stochRsiK4h;
    const dValue = config.stochRsiD4h ?? stochRsiK4h;
    const kDelta = stochRsiK4h - prevK;
    const kRising = kDelta >= mr.minKDelta;
    
    if (direction === 'long') {
      // Check K crossed above D (bullish cross-up)
      const crossedAboveD = mr.requireCross && prevK <= dValue && stochRsiK4h > dValue;
      
      if (crossedAboveD && stochRsiK4h <= mr.longMaxK) {
        momentumRecovered = true;
        momentumRecoveryType = 'cross_up';
        reasons.push(`✅ Momentum recovery: StochRSI K crossed above D (K=${stochRsiK4h.toFixed(1)}, D=${dValue.toFixed(1)}, prevK=${prevK.toFixed(1)})`);
      } else if (mr.requireKRising && kRising && stochRsiK4h <= mr.longMaxK) {
        momentumRecovered = true;
        momentumRecoveryType = 'k_rising';
        reasons.push(`✅ Momentum recovery: K rising (K=${stochRsiK4h.toFixed(1)}, Δ=${kDelta.toFixed(1)} >= ${mr.minKDelta})`);
      } else if (mr.fallbackStaticCheck && stochRsiK4h <= mr.longMaxK) {
        momentumRecovered = true;
        momentumRecoveryType = 'static_fallback';
        reasons.push(`ℹ️ Momentum: static fallback (K=${stochRsiK4h.toFixed(1)} <= ${mr.longMaxK})`);
      }
      
      if (!momentumRecovered) {
        defaultResult.blockReason = `Momentum recovery not detected for LONG: K=${stochRsiK4h.toFixed(1)}, D=${dValue.toFixed(1)}, prevK=${prevK.toFixed(1)}, Δ=${kDelta.toFixed(1)}`;
        return defaultResult;
      }
    } else {
      // SHORT: K crosses below D (bearish cross-down)
      const crossedBelowD = mr.requireCross && prevK >= dValue && stochRsiK4h < dValue;
      
      if (crossedBelowD && stochRsiK4h >= mr.shortMinK) {
        momentumRecovered = true;
        momentumRecoveryType = 'cross_down';
        reasons.push(`✅ Momentum recovery: StochRSI K crossed below D (K=${stochRsiK4h.toFixed(1)}, D=${dValue.toFixed(1)}, prevK=${prevK.toFixed(1)})`);
      } else if (mr.requireKRising && stochRsiK4h - prevK <= -mr.minKDelta && stochRsiK4h >= mr.shortMinK) {
        momentumRecovered = true;
        momentumRecoveryType = 'k_falling';
        reasons.push(`✅ Momentum recovery: K falling for SHORT (K=${stochRsiK4h.toFixed(1)}, Δ=${kDelta.toFixed(1)})`);
      } else if (mr.fallbackStaticCheck && stochRsiK4h >= mr.shortMinK) {
        momentumRecovered = true;
        momentumRecoveryType = 'static_fallback';
        reasons.push(`ℹ️ Momentum: static fallback (K=${stochRsiK4h.toFixed(1)} >= ${mr.shortMinK})`);
      }
      
      if (!momentumRecovered) {
        defaultResult.blockReason = `Momentum recovery not detected for SHORT: K=${stochRsiK4h.toFixed(1)}, D=${dValue.toFixed(1)}, prevK=${prevK.toFixed(1)}, Δ=${kDelta.toFixed(1)}`;
        return defaultResult;
      }
    }
  } else {
    // Legacy: static StochRSI check
    if (direction === 'long') {
      momentumRecovered = stochRsiK4h <= mr.longMaxK;
      momentumRecoveryType = 'legacy_static';
      if (!momentumRecovered) {
        defaultResult.blockReason = `StochRSI K ${stochRsiK4h.toFixed(1)} > ${mr.longMaxK} (legacy static)`;
        return defaultResult;
      }
    } else {
      momentumRecovered = stochRsiK4h >= mr.shortMinK;
      momentumRecoveryType = 'legacy_static';
      if (!momentumRecovered) {
        defaultResult.blockReason = `StochRSI K ${stochRsiK4h.toFixed(1)} < ${mr.shortMinK} (legacy static)`;
        return defaultResult;
      }
    }
  }
  
  defaultResult.stochRsiCooled = momentumRecovered;
  defaultResult.momentumRecoveryDetected = momentumRecovered;
  defaultResult.momentumRecoveryType = momentumRecoveryType;

  // Check move exhaustion
  const moveFromLow = ((currentPrice - low24h) / low24h) * 100;
  const moveFromHigh = ((high24h - currentPrice) / high24h) * 100;
  defaultResult.moveFromSwingPercent = direction === 'long' ? moveFromLow : moveFromHigh;

  // Determine shallow pullback (using ATR distance now)
  const isShallowPullback = atrDistanceToEma < config.atrDistanceMin;
  
  let maxMove = direction === 'long' ? config.longMaxMove : config.shortMaxMove;
  if (isShallowPullback) {
    maxMove = config.shallowPullbackMaxMove;
    reasons.push(`⚠️ Shallow pullback (${atrDistanceToEma.toFixed(2)} ATR < ${config.atrDistanceMin} ATR): max move reduced to ${maxMove}%`);
  }
  
  if (defaultResult.moveFromSwingPercent > maxMove) {
    defaultResult.blockReason = `Move from swing ${defaultResult.moveFromSwingPercent.toFixed(1)}% > ${maxMove}% (too extended${isShallowPullback ? ' for shallow pullback' : ''})`;
    return defaultResult;
  }
  reasons.push(`Move from swing: ${defaultResult.moveFromSwingPercent.toFixed(1)}% <= ${maxMove}%`);

  // ===== v2.0: ATR-NORMALIZED PULLBACK DETECTION =====
  // Replaces fixed % proximity with ATR-normalized distance
  const effectiveAtrMax = adx >= config.strongAdxThreshold 
    ? config.atrDistanceMaxStrongAdx 
    : config.atrDistanceMax;

  let pullbackDetected = false;
  let pullbackType: 'ema20' | 'ema50' | 'midpoint' | null = null;
  
  // Check ATR distance to each EMA level
  const atrDistToMid = atr > 0 ? absDistToMid / atr : 999;
  const atrDistToEma20 = atr > 0 ? absDistToEma20 / atr : 999;
  const atrDistToEma50 = atr > 0 ? absDistToEma50 / atr : 999;

  if (atr > 0 && atrDistToMid <= effectiveAtrMax) {
    pullbackDetected = true;
    pullbackType = 'midpoint';
    const zoneLabel = atrDistToMid <= config.atrDistanceOptimal ? 'OPTIMAL' : 'VALID';
    reasons.push(`✅ Pullback to EMA midpoint (${atrDistToMid.toFixed(2)} ATR — ${zoneLabel} zone [${config.atrDistanceMin}-${effectiveAtrMax} ATR])`);
  } else if (atr > 0 && atrDistToEma20 <= effectiveAtrMax) {
    pullbackDetected = true;
    pullbackType = 'ema20';
    const zoneLabel = atrDistToEma20 <= config.atrDistanceOptimal ? 'OPTIMAL' : 'VALID';
    reasons.push(`✅ Pullback to EMA20 (${atrDistToEma20.toFixed(2)} ATR — ${zoneLabel} zone)`);
  } else if (atr > 0 && atrDistToEma50 <= effectiveAtrMax) {
    pullbackDetected = true;
    pullbackType = 'ema50';
    const zoneLabel = atrDistToEma50 <= config.atrDistanceOptimal ? 'OPTIMAL' : 'VALID';
    reasons.push(`✅ Pullback to EMA50 (${atrDistToEma50.toFixed(2)} ATR — ${zoneLabel} zone)`);
  }

  if (!pullbackDetected) {
    // Fallback: check if price touched EMA recently (last 3 candles)
    const recentPrices = prices.slice(-3);
    const recentEma20 = ema20Array.slice(-3);
    const recentEma50 = ema50Array.slice(-3);
    
    for (let i = 0; i < recentPrices.length; i++) {
      const p = recentPrices[i];
      const e20 = recentEma20[i];
      const e50 = recentEma50[i];
      const mid = (e20 + e50) / 2;
      const recentAtrDist = atr > 0 ? Math.abs(p - mid) / atr : 999;
      
      if (recentAtrDist <= effectiveAtrMax) {
        pullbackDetected = true;
        pullbackType = 'midpoint';
        reasons.push(`Recent touch of EMA midpoint (${3 - i} candles ago, ${recentAtrDist.toFixed(2)} ATR)`);
        break;
      }
    }
  }

  if (!pullbackDetected) {
    defaultResult.blockReason = `Price not in ATR pullback zone (EMA20: ${atrDistToEma20.toFixed(2)} ATR, EMA50: ${atrDistToEma50.toFixed(2)} ATR, Mid: ${atrDistToMid.toFixed(2)} ATR; max: ${effectiveAtrMax.toFixed(2)} ATR)`;
    return defaultResult;
  }

  // Pullback detected and all conditions met
  defaultResult.detected = true;
  defaultResult.eligible = true;
  defaultResult.direction = direction;
  defaultResult.pullbackType = pullbackType;
  
  // Position sizing: optimal zone gets better sizing
  let positionMultiplier = config.baseMultiplier;
  const bestAtrDist = Math.min(atrDistToMid, atrDistToEma20, atrDistToEma50);
  
  if (bestAtrDist >= config.atrDistanceMin && bestAtrDist <= config.atrDistanceOptimal) {
    // Optimal zone: use momentum-aligned (higher) multiplier
    positionMultiplier = config.momentumAlignedMultiplier;
    reasons.push(`Position size: ${(positionMultiplier * 100).toFixed(0)}% (optimal ATR zone ${bestAtrDist.toFixed(2)} ATR)`);
  } else if (isShallowPullback) {
    positionMultiplier = config.shallowPullbackMultiplier;
    reasons.push(`Position size: ${(positionMultiplier * 100).toFixed(0)}% (shallow pullback ${bestAtrDist.toFixed(2)} ATR)`);
  } else {
    reasons.push(`Position size: ${(positionMultiplier * 100).toFixed(0)}% (base, ${bestAtrDist.toFixed(2)} ATR)`);
  }
  
  // Momentum recovery type bonus
  if (momentumRecoveryType === 'cross_up' || momentumRecoveryType === 'cross_down') {
    // Cross-up/down is strongest confirmation — keep or boost size
    reasons.push(`Momentum type: ${momentumRecoveryType} (strongest confirmation)`);
  } else if (momentumRecoveryType === 'static_fallback') {
    // Static fallback is weakest — reduce size
    positionMultiplier = Math.min(positionMultiplier, config.shallowPullbackMultiplier);
    reasons.push(`Momentum type: static_fallback (size capped to ${(positionMultiplier * 100).toFixed(0)}%)`);
  }
  
  // Apply slope graduation multiplier
  if (slopeGraduated) {
    positionMultiplier = Math.min(positionMultiplier, slopeMultiplier);
    reasons.push(`Position size capped to ${(positionMultiplier * 100).toFixed(0)}% (ADX slope graduated)`);
  }
  defaultResult.positionMultiplier = positionMultiplier;
  
  // Stop loss: MAX of ATR and EMA stops
  const effectiveStopAtrMultiplier = slopeGraduated ? slopeStopAtrMultiplier : config.stopLossAtrMultiplier;
  const atrStop = atr * effectiveStopAtrMultiplier;
  const emaStop = (direction === 'long' ? ema50 : ema50) * (config.emaStopBufferPercent / 100);
  
  defaultResult.stopAtrMultiplier = effectiveStopAtrMultiplier;
  
  if (config.useMaxStop) {
    defaultResult.stopLossAtr = Math.max(atrStop, emaStop);
    reasons.push(`Stop: max(ATR ${atrStop.toFixed(2)} [${effectiveStopAtrMultiplier.toFixed(2)}x], EMA ${emaStop.toFixed(2)}) = ${defaultResult.stopLossAtr.toFixed(2)}${slopeGraduated ? ' [TIGHTENED]' : ''}`);
  } else {
    defaultResult.stopLossAtr = atrStop;
  }
  
  defaultResult.reasons = reasons;
  reasons.push(`TREND_CONTINUATION_PULLBACK eligible for ${direction.toUpperCase()} (v2.0 ATR-normalized + momentum recovery: ${momentumRecoveryType})`);

  return defaultResult;
}
