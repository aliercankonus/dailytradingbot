// ============= COMPRESSION MICRO-RANGE MODULE =============
// Independent second trading engine for RANGE_COMPRESSION regimes
// Executes small mean-reversion scalps when trend engine is blocked
// Design: Mutual exclusivity with trend engine enforced at regime level

import { COMPRESSION_MODULE } from "./constants.ts";

// ============= TYPES =============
export interface CompressionKillSwitchResult {
  killed: boolean;
  reason: string;
}

export interface CompressionScoreResult {
  score: number;
  direction: 'long' | 'short' | null;
  breakdown: {
    stochRsiContribution: number;
    bbTouchContribution: number;
    momentumContribution: number;
    lowAdxBonus: number;
  };
  reason: string;
}

export interface CompressionEntryResult {
  allowed: boolean;
  direction: 'long' | 'short' | null;
  score: number;
  positionMultiplier: number;
  tpAtrMultiplier: number;
  slAtrMultiplier: number;
  reason: string;
  diagnostics: {
    killSwitch: CompressionKillSwitchResult;
    scoreResult: CompressionScoreResult | null;
    structuralConditions: {
      atrPercent: number;
      dynamicMinATR: number;
      adx: number;
      adxSlope: number;
      bbWidthContracting: boolean;
      stochK: number;
      percentB: number;
      momentumScore: number;
    };
    cooldownPassed: boolean;
    lastCompressionBandEdge: string | null;
  };
}

export interface CompressionEvalInput {
  atrPercent: number;
  dynamicMinATR: number;
  adx: number;
  adxSlope: number;
  stochK: number;
  percentB: number;
  momentumScore: number;
  currentCandleRange: number;
  atr: number;
  bbWidth?: number;
  bbWidthPrev?: number;
  bbWidthPrev2?: number;
  // Cooldown tracking
  lastCompressionEntryTime?: number;
  lastCompressionBandEdge?: 'upper' | 'lower' | null;
}

// ============= KILL SWITCH =============
// Immediately disables compression if expansion signals are detected
export function checkCompressionKillSwitch(input: {
  adx: number;
  adxSlope: number;
  atrPercent: number;
  dynamicMinATR: number;
  currentCandleRange: number;
  atr: number;
}): CompressionKillSwitchResult {
  const cfg = COMPRESSION_MODULE;
  
  // Kill 1: ADX too high — trend energy present
  if (input.adx > cfg.KILL_ADX_THRESHOLD) {
    return { killed: true, reason: `ADX ${input.adx.toFixed(1)} > ${cfg.KILL_ADX_THRESHOLD} kill threshold` };
  }
  
  // Kill 2: ADX slope positive for 2+ candles — trend forming
  if (input.adxSlope > 0.1) {
    return { killed: true, reason: `ADX slope ${input.adxSlope.toFixed(2)} rising — expansion forming` };
  }
  
  // Kill 2b: Early expansion zone — ADX >= 23 AND slope positive
  // ADX 23-25 is the transition zone where breakouts begin forming
  if (input.adx >= cfg.EARLY_EXPANSION_ADX && input.adxSlope > 0) {
    return { killed: true, reason: `Early expansion: ADX ${input.adx.toFixed(1)} >= ${cfg.EARLY_EXPANSION_ADX} with rising slope ${input.adxSlope.toFixed(2)}` };
  }
  
  // Kill 3: ATR expanding above dynamic threshold — volatility returning
  if (input.atrPercent >= input.dynamicMinATR) {
    return { killed: true, reason: `ATR ${input.atrPercent.toFixed(2)}% >= ${input.dynamicMinATR.toFixed(2)}% dynamic min — volatility expanding` };
  }
  
  // Kill 4: Large candle — regime shift brewing
  if (input.atr > 0 && input.currentCandleRange > cfg.KILL_CANDLE_RANGE_ATR_RATIO * input.atr) {
    return { killed: true, reason: `Candle range ${input.currentCandleRange.toFixed(4)} > ${cfg.KILL_CANDLE_RANGE_ATR_RATIO}x ATR — large candle, regime shift` };
  }
  
  return { killed: false, reason: 'All kill switch checks passed' };
}

// ============= SCORING =============
// Independent ±40 scale scoring for compression setups
export function calculateCompressionScore(input: {
  stochK: number;
  percentB: number;
  momentumScore: number;
  adx: number;
}): CompressionScoreResult {
  const cfg = COMPRESSION_MODULE;
  let score = 0;
  let direction: 'long' | 'short' | null = null;
  
  const breakdown = {
    stochRsiContribution: 0,
    bbTouchContribution: 0,
    momentumContribution: 0,
    lowAdxBonus: 0,
  };
  
  // ===== DIRECTION DERIVATION FROM EXTREMES =====
  // LONG setup: oversold extreme
  const isLongSetup = input.stochK < cfg.LONG_MAX_STOCHRSI_K && input.percentB <= cfg.LONG_MAX_PERCENT_B;
  // SHORT setup: overbought extreme
  const isShortSetup = input.stochK > cfg.SHORT_MIN_STOCHRSI_K && input.percentB >= cfg.SHORT_MIN_PERCENT_B;
  
  if (!isLongSetup && !isShortSetup) {
    return { score: 0, direction: null, breakdown, reason: 'No extreme setup detected' };
  }
  
  // Determine direction
  if (isLongSetup && isShortSetup) {
    // Both conditions met (shouldn't happen but be safe) — pick stronger extreme
    direction = input.stochK < (100 - input.stochK) ? 'long' : 'short';
  } else {
    direction = isLongSetup ? 'long' : 'short';
  }
  
  const sign = direction === 'long' ? 1 : -1;
  
  // ===== STOCHRSI EXTREME CONTRIBUTION (±15) =====
  const stochExtreme = direction === 'long' ? input.stochK < 10 : input.stochK > 90;
  if (stochExtreme) {
    breakdown.stochRsiContribution = sign * cfg.SCORE_STOCHRSI_EXTREME;
    score += breakdown.stochRsiContribution;
  } else {
    // Partial score for less extreme but still qualifying
    breakdown.stochRsiContribution = sign * Math.round(cfg.SCORE_STOCHRSI_EXTREME * 0.6);
    score += breakdown.stochRsiContribution;
  }
  
  // ===== BOLLINGER BAND TOUCH CONTRIBUTION (±10) =====
  const bbTouch = direction === 'long' ? input.percentB <= 10 : input.percentB >= 90;
  if (bbTouch) {
    breakdown.bbTouchContribution = sign * cfg.SCORE_BB_TOUCH;
  } else {
    breakdown.bbTouchContribution = sign * Math.round(cfg.SCORE_BB_TOUCH * 0.6);
  }
  score += breakdown.bbTouchContribution;
  
  // ===== MOMENTUM GRADUATED CONTRIBUTION (±10/±5/0) =====
  // Three-tier: aligned (+10), neutral (+5), mildly opposing but tolerated (0)
  // Hard block if strongly opposing beyond tolerance
  const momentumOpposingLimit = direction === 'long' ? cfg.LONG_MIN_MOMENTUM_SCORE : cfg.SHORT_MAX_MOMENTUM_SCORE;
  const momentumAligned = direction === 'long' ? input.momentumScore > 10 : input.momentumScore < -10;
  const momentumNeutral = direction === 'long' 
    ? (input.momentumScore >= -5 && input.momentumScore <= 10)
    : (input.momentumScore >= -10 && input.momentumScore <= 5);
  const momentumTolerated = direction === 'long'
    ? input.momentumScore > cfg.LONG_MIN_MOMENTUM_SCORE
    : input.momentumScore < cfg.SHORT_MAX_MOMENTUM_SCORE;
  
  if (!momentumTolerated) {
    // Momentum strongly opposing — hard block
    return { 
      score: 0, 
      direction: null, 
      breakdown, 
      reason: `Momentum ${input.momentumScore.toFixed(0)} opposing ${direction} (limit: ${momentumOpposingLimit})` 
    };
  }
  
  if (momentumAligned) {
    breakdown.momentumContribution = sign * cfg.SCORE_MOMENTUM_ALIGNED;
  } else if (momentumNeutral) {
    breakdown.momentumContribution = sign * cfg.SCORE_MOMENTUM_NEUTRAL;
  } else {
    // Mildly opposing but within tolerance — 0 contribution
    breakdown.momentumContribution = 0;
  }
  score += breakdown.momentumContribution;
  
  // ===== LOW ADX BONUS (+5) =====
  if (input.adx < 20) {
    breakdown.lowAdxBonus = cfg.SCORE_LOW_ADX_BONUS;
    score += breakdown.lowAdxBonus;
  }
  
  const reason = `Compression ${direction}: score=${score} (stoch=${breakdown.stochRsiContribution}, bb=${breakdown.bbTouchContribution}, mom=${breakdown.momentumContribution}, adxBonus=${breakdown.lowAdxBonus})`;
  
  return { score, direction, breakdown, reason };
}

// ============= MAIN ENTRY EVALUATOR =============
export function evaluateCompressionEntry(input: CompressionEvalInput): CompressionEntryResult {
  const cfg = COMPRESSION_MODULE;
  
  const structuralConditions = {
    atrPercent: input.atrPercent,
    dynamicMinATR: input.dynamicMinATR,
    adx: input.adx,
    adxSlope: input.adxSlope,
    bbWidthContracting: false,
    stochK: input.stochK,
    percentB: input.percentB,
    momentumScore: input.momentumScore,
  };
  
  const defaultResult: CompressionEntryResult = {
    allowed: false,
    direction: null,
    score: 0,
    positionMultiplier: 0,
    tpAtrMultiplier: cfg.TP_ATR_MULTIPLIER,
    slAtrMultiplier: cfg.SL_ATR_MULTIPLIER,
    reason: '',
    diagnostics: {
      killSwitch: { killed: false, reason: '' },
      scoreResult: null,
      structuralConditions,
      cooldownPassed: false,
      lastCompressionBandEdge: input.lastCompressionBandEdge || null,
    },
  };
  
  // ===== STEP 1: KILL SWITCH CHECK =====
  const killSwitch = checkCompressionKillSwitch({
    adx: input.adx,
    adxSlope: input.adxSlope,
    atrPercent: input.atrPercent,
    dynamicMinATR: input.dynamicMinATR,
    currentCandleRange: input.currentCandleRange,
    atr: input.atr,
  });
  defaultResult.diagnostics.killSwitch = killSwitch;
  
  if (killSwitch.killed) {
    defaultResult.reason = `Kill switch: ${killSwitch.reason}`;
    return defaultResult;
  }
  
  // ===== STEP 2: STRUCTURAL CONDITIONS =====
  // ATR must be below dynamic threshold (compression)
  if (input.atrPercent >= input.dynamicMinATR) {
    defaultResult.reason = `ATR ${input.atrPercent.toFixed(2)}% >= ${input.dynamicMinATR.toFixed(2)}% — not compressed`;
    return defaultResult;
  }
  
  // ADX must be low
  if (input.adx > cfg.MAX_ADX) {
    defaultResult.reason = `ADX ${input.adx.toFixed(1)} > ${cfg.MAX_ADX} — too much trend energy`;
    return defaultResult;
  }
  
  // BB width contraction stability — strict monotonic decrease for 2+ candles
  // bbWidth[t] < bbWidth[t-1] AND bbWidth[t-1] < bbWidth[t-2] (not just percentile)
  let bbWidthContracting = false;
  if (input.bbWidth !== undefined && input.bbWidthPrev !== undefined && input.bbWidthPrev2 !== undefined) {
    bbWidthContracting = input.bbWidth < input.bbWidthPrev && input.bbWidthPrev < input.bbWidthPrev2;
  } else if (input.bbWidth !== undefined && input.bbWidthPrev !== undefined) {
    bbWidthContracting = input.bbWidth < input.bbWidthPrev;
  } else {
    // If BB width history not available, allow but note it
    bbWidthContracting = true; // Permissive fallback
  }
  structuralConditions.bbWidthContracting = bbWidthContracting;
  
  if (!bbWidthContracting) {
    defaultResult.reason = `BB width expanding (${input.bbWidth?.toFixed(4)} > ${input.bbWidthPrev?.toFixed(4)}) — volatility re-expanding`;
    return defaultResult;
  }
  
  // ===== STEP 3: COOLDOWN CHECK =====
  let cooldownPassed = true;
  if (input.lastCompressionEntryTime) {
    const minutesSinceLast = (Date.now() - input.lastCompressionEntryTime) / (1000 * 60);
    if (minutesSinceLast < cfg.COOLDOWN_MINUTES) {
      cooldownPassed = false;
      defaultResult.reason = `Cooldown: ${minutesSinceLast.toFixed(0)}min < ${cfg.COOLDOWN_MINUTES}min minimum`;
      return defaultResult;
    }
  }
  
  // Opposite band touch requirement
  if (cfg.REQUIRE_OPPOSITE_BAND_TOUCH && input.lastCompressionBandEdge) {
    const currentBandEdge = input.stochK < cfg.LONG_MAX_STOCHRSI_K ? 'lower' : 
                            input.stochK > cfg.SHORT_MIN_STOCHRSI_K ? 'upper' : null;
    if (currentBandEdge && currentBandEdge === input.lastCompressionBandEdge) {
      cooldownPassed = false;
      defaultResult.reason = `Same band edge (${currentBandEdge}) — requires opposite band touch before re-entry`;
      return defaultResult;
    }
  }
  defaultResult.diagnostics.cooldownPassed = cooldownPassed;
  
  // ===== STEP 4: SCORING =====
  const scoreResult = calculateCompressionScore({
    stochK: input.stochK,
    percentB: input.percentB,
    momentumScore: input.momentumScore,
    adx: input.adx,
  });
  defaultResult.diagnostics.scoreResult = scoreResult;
  
  if (!scoreResult.direction) {
    defaultResult.reason = `No direction: ${scoreResult.reason}`;
    return defaultResult;
  }
  
  if (Math.abs(scoreResult.score) < cfg.ENTRY_THRESHOLD) {
    defaultResult.reason = `Score |${scoreResult.score}| < ${cfg.ENTRY_THRESHOLD} threshold — insufficient conviction`;
    return defaultResult;
  }
  
  // ===== STEP 5: ENTRY ALLOWED =====
  return {
    allowed: true,
    direction: scoreResult.direction,
    score: scoreResult.score,
    positionMultiplier: cfg.POSITION_SIZE_MULTIPLIER,
    tpAtrMultiplier: cfg.TP_ATR_MULTIPLIER,
    slAtrMultiplier: cfg.SL_ATR_MULTIPLIER,
    reason: scoreResult.reason,
    diagnostics: {
      killSwitch,
      scoreResult,
      structuralConditions,
      cooldownPassed,
      lastCompressionBandEdge: input.lastCompressionBandEdge || null,
    },
  };
}
