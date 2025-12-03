import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Wilder's ADX Calculation - Full implementation with intermediate values for validation
 * Compare these values with TradingView (Settings: Length=14, Smoothing=14)
 */
function calculateADXWithDetails(klines: any[], period = 14): {
  adx: number;
  plusDI: number;
  minusDI: number;
  dxHistory: number[];
  adxHistory: number[];
  debug: {
    dataPoints: number;
    firstTR: number;
    lastTR: number;
    smoothedTR: number;
    smoothedPlusDM: number;
    smoothedMinusDM: number;
  };
} {
  const result = {
    adx: 0,
    plusDI: 0,
    minusDI: 0,
    dxHistory: [] as number[],
    adxHistory: [] as number[],
    debug: {
      dataPoints: 0,
      firstTR: 0,
      lastTR: 0,
      smoothedTR: 0,
      smoothedPlusDM: 0,
      smoothedMinusDM: 0,
    }
  };

  const minRequired = 2 * period + 1;
  if (!klines || klines.length < minRequired) {
    return result;
  }

  // Calculate TR, +DM, -DM arrays
  const trueRanges: number[] = [];
  const plusDMs: number[] = [];
  const minusDMs: number[] = [];

  for (let i = 1; i < klines.length; i++) {
    const high = parseFloat(klines[i][2]);
    const low = parseFloat(klines[i][3]);
    const prevHigh = parseFloat(klines[i - 1][2]);
    const prevLow = parseFloat(klines[i - 1][3]);
    const prevClose = parseFloat(klines[i - 1][4]);

    if (!Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(prevClose) ||
        !Number.isFinite(prevHigh) || !Number.isFinite(prevLow) || high <= 0 || low <= 0) {
      continue;
    }

    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    const upMove = high - prevHigh;
    const downMove = prevLow - low;
    const plusDM = (upMove > downMove && upMove > 0) ? upMove : 0;
    const minusDM = (downMove > upMove && downMove > 0) ? downMove : 0;

    trueRanges.push(tr);
    plusDMs.push(plusDM);
    minusDMs.push(minusDM);
  }

  if (trueRanges.length < 2 * period) {
    return result;
  }

  result.debug.dataPoints = trueRanges.length;
  result.debug.firstTR = trueRanges[0];
  result.debug.lastTR = trueRanges[trueRanges.length - 1];

  // Initialize Wilder's smoothing with SUM of first 'period' values
  let smoothedTR = 0;
  let smoothedPlusDM = 0;
  let smoothedMinusDM = 0;
  
  for (let i = 0; i < period; i++) {
    smoothedTR += trueRanges[i];
    smoothedPlusDM += plusDMs[i];
    smoothedMinusDM += minusDMs[i];
  }

  // Calculate DX values array
  const dxValues: number[] = [];
  let currentPlusDI = 0;
  let currentMinusDI = 0;

  // First DX from initial smoothed values
  if (smoothedTR > 0) {
    currentPlusDI = (smoothedPlusDM / smoothedTR) * 100;
    currentMinusDI = (smoothedMinusDM / smoothedTR) * 100;
    const diSum = currentPlusDI + currentMinusDI;
    const dx = diSum > 0 ? (Math.abs(currentPlusDI - currentMinusDI) / diSum) * 100 : 0;
    dxValues.push(dx);
  } else {
    dxValues.push(0);
  }

  // Continue with Wilder's smoothing
  for (let i = period; i < trueRanges.length; i++) {
    smoothedTR = smoothedTR - (smoothedTR / period) + trueRanges[i];
    smoothedPlusDM = smoothedPlusDM - (smoothedPlusDM / period) + plusDMs[i];
    smoothedMinusDM = smoothedMinusDM - (smoothedMinusDM / period) + minusDMs[i];

    if (smoothedTR > 0) {
      currentPlusDI = (smoothedPlusDM / smoothedTR) * 100;
      currentMinusDI = (smoothedMinusDM / smoothedTR) * 100;
      const diSum = currentPlusDI + currentMinusDI;
      const dx = diSum > 0 ? (Math.abs(currentPlusDI - currentMinusDI) / diSum) * 100 : 0;
      dxValues.push(dx);
    } else {
      dxValues.push(0);
    }
  }

  result.dxHistory = dxValues.slice(-20); // Last 20 DX values
  result.debug.smoothedTR = smoothedTR;
  result.debug.smoothedPlusDM = smoothedPlusDM;
  result.debug.smoothedMinusDM = smoothedMinusDM;

  if (dxValues.length < period) {
    return result;
  }

  // Calculate ADX using Wilder's smoothing of DX values
  let adx = 0;
  for (let i = 0; i < period; i++) {
    adx += dxValues[i];
  }
  adx /= period;
  result.adxHistory.push(Math.round(adx * 10) / 10);

  for (let i = period; i < dxValues.length; i++) {
    adx = ((adx * (period - 1)) + dxValues[i]) / period;
    result.adxHistory.push(Math.round(adx * 10) / 10);
  }

  result.adx = Math.round(adx * 10) / 10;
  result.plusDI = Math.round(currentPlusDI * 10) / 10;
  result.minusDI = Math.round(currentMinusDI * 10) / 10;

  return result;
}

async function fetchBinanceKlines(symbol: string, interval: string, limit: number): Promise<any[]> {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Binance API error: ${response.status}`);
  }
  return await response.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol = "BTCUSDT", interval = "1h", limit = 100 } = await req.json().catch(() => ({}));

    console.log(`\n=== ADX VALIDATION FOR ${symbol} (${interval}) ===`);
    console.log(`Fetching ${limit} candles from Binance...`);

    const klines = await fetchBinanceKlines(symbol, interval, limit);
    console.log(`Fetched ${klines.length} candles`);

    // Get last candle timestamp for reference
    const lastCandle = klines[klines.length - 1];
    const lastCandleTime = new Date(lastCandle[0]).toISOString();
    const lastClose = parseFloat(lastCandle[4]);

    console.log(`Last candle: ${lastCandleTime}, Close: ${lastClose}`);

    // Calculate ADX with full details
    const adxResult = calculateADXWithDetails(klines, 14);

    console.log(`\n--- ADX CALCULATION RESULTS ---`);
    console.log(`ADX: ${adxResult.adx}`);
    console.log(`+DI: ${adxResult.plusDI}`);
    console.log(`-DI: ${adxResult.minusDI}`);
    console.log(`\nLast 10 ADX values: ${adxResult.adxHistory.slice(-10).join(', ')}`);
    console.log(`Last 10 DX values: ${adxResult.dxHistory.slice(-10).join(', ')}`);

    console.log(`\n--- DEBUG INFO ---`);
    console.log(`Data points used: ${adxResult.debug.dataPoints}`);
    console.log(`Smoothed TR: ${adxResult.debug.smoothedTR.toFixed(4)}`);
    console.log(`Smoothed +DM: ${adxResult.debug.smoothedPlusDM.toFixed(4)}`);
    console.log(`Smoothed -DM: ${adxResult.debug.smoothedMinusDM.toFixed(4)}`);

    // Validation instructions
    const validationInstructions = `
TO VALIDATE AGAINST TRADINGVIEW:
1. Open TradingView and select ${symbol}
2. Set timeframe to ${interval}
3. Add indicator "Average Directional Index" (ADX)
4. Set parameters: Length=14, ADX Smoothing=14
5. Compare values at ${lastCandleTime}:
   - Our ADX: ${adxResult.adx}
   - Our +DI: ${adxResult.plusDI}
   - Our -DI: ${adxResult.minusDI}
6. Values should match within ±0.5 tolerance
`;

    console.log(validationInstructions);

    return new Response(
      JSON.stringify({
        symbol,
        interval,
        lastCandleTime,
        lastClose,
        calculated: {
          adx: adxResult.adx,
          plusDI: adxResult.plusDI,
          minusDI: adxResult.minusDI,
        },
        history: {
          adx: adxResult.adxHistory.slice(-10),
          dx: adxResult.dxHistory.slice(-10),
        },
        debug: adxResult.debug,
        validationInstructions: validationInstructions.trim(),
        tolerance: "±0.5 compared to TradingView (Length=14, Smoothing=14)",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("ADX validation error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
