// Future-State Forecaster — hourly cron
//
// Pulls Bybit 1h Open Interest history for ETHUSDT, sends the log-transformed
// context to an external TimesFM inference endpoint, then persists the
// resulting prediction gap into `future_state_features`.
//
// Required secrets:
//   TIMESFM_ENDPOINT_URL   – POST endpoint that runs TimesFM
//   TIMESFM_ENDPOINT_TOKEN – (optional) Bearer token for that endpoint
//
// Expected endpoint contract:
//   POST {url}
//   Body: { symbol, series:"log_oi", context:number[], horizons:number[] }
//   Response: { predictions: { "48": <predicted_log_oi_value>, ... } }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ETHUSDT: validated live scope (RANGE, h=48).
// BTCUSDT: Phase B data-collection only — NOT yet in VALIDATED_SCOPES,
//   so sizing stays no-op until we have an accuracy report.
const SYMBOLS = ["ETHUSDT", "BTCUSDT"];
const HORIZONS = [48];
const CONTEXT_LEN = 192;
const OI_INTERVAL = "1h";
const SOURCE_MODEL = "timesfm-2.5-external";

interface FutureStateFeatureRow {
  id: string;
  gap_rel: number | null;
  predicted_value: number | null;
  created_at: string;
}

interface BybitOiRow {
  openInterest: string;
  timestamp: string; // ms as string
}

// Retry any async op with exponential backoff + jitter. Records each attempt.
async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  opts: { attempts?: number; baseMs?: number; maxMs?: number; timeoutMs?: number } = {},
  attemptsLog?: Array<Record<string, unknown>>,
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const baseMs = opts.baseMs ?? 800;
  const maxMs = opts.maxMs ?? 8000;
  const timeoutMs = opts.timeoutMs ?? 120_000;

  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    const started = Date.now();
    try {
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs),
        ),
      ]);
      attemptsLog?.push({ label, attempt: i, ok: true, duration_ms: Date.now() - started });
      return result;
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      attemptsLog?.push({ label, attempt: i, ok: false, duration_ms: Date.now() - started, error: msg.slice(0, 300) });
      console.error(`[future-state-forecaster] ${label} attempt ${i}/${attempts} failed: ${msg}`);
      // Don't retry deterministic failures (unique constraint, bad request, auth).
      if (/duplicate key|unique constraint|HTTP 4\d\d|non-JSON|missing 'predictions'|insufficient OI/i.test(msg)) {
        break;
      }
      if (i < attempts) {
        const delay = Math.min(maxMs, baseMs * 2 ** (i - 1)) + Math.floor(Math.random() * 250);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function fetchBybitOi(symbol: string, limit = 200): Promise<{ ts: number; oi: number }[]> {
  const url = `https://api.bybit.com/v5/market/open-interest?category=linear&symbol=${symbol}&intervalTime=1h&limit=${limit}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Bybit OI ${symbol} HTTP ${r.status}`);
  const j = await r.json();
  const rows: BybitOiRow[] = j?.result?.list ?? [];
  // Bybit returns newest-first; reverse to chronological.
  return rows
    .map((row) => ({ ts: Number(row.timestamp), oi: Number(row.openInterest) }))
    .filter((x) => Number.isFinite(x.oi) && x.oi > 0 && Number.isFinite(x.ts))
    .sort((a, b) => a.ts - b.ts);
}

// ────────────────────────────────────────────────────────────────────
// Regime classification (self-contained, FourStateRegime compatible)
//
// `market_regime_history` is only written when the trading bot loop runs,
// so the forecaster must NOT depend on it. We derive the regime directly
// from Bybit 1h klines: ADX(14) + ADX slope + Bollinger bandwidth ratio.
// ────────────────────────────────────────────────────────────────────
type ForecastRegime =
  | "TREND_EXPANSION"
  | "TREND_EXHAUSTION"
  | "RANGE_COMPRESSION"
  | "BREAKOUT_SETUP"
  | "UNKNOWN";

interface Candle { high: number; low: number; close: number }

async function fetchBybitKlines(symbol: string, limit = 200): Promise<Candle[]> {
  const url = `https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}&interval=60&limit=${limit}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Bybit kline ${symbol} HTTP ${r.status}`);
  const j = await r.json();
  const list: string[][] = j?.result?.list ?? [];
  // Bybit returns newest-first: [start, open, high, low, close, volume, turnover]
  return list
    .map((k) => ({ high: Number(k[2]), low: Number(k[3]), close: Number(k[4]) }))
    .filter((c) => Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close))
    .reverse();
}

/** Wilder ADX series (returns one value per bar after warmup). */
function adxSeries(candles: Candle[], period = 14): number[] {
  if (candles.length < period * 2 + 2) return [];
  const tr: number[] = [], plusDM: number[] = [], minusDM: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], p = candles[i - 1];
    tr.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
    const up = c.high - p.high;
    const down = p.low - c.low;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
  }
  const wilder = (arr: number[]): number[] => {
    const out: number[] = [];
    let sum = arr.slice(0, period).reduce((s, v) => s + v, 0);
    out.push(sum);
    for (let i = period; i < arr.length; i++) {
      sum = sum - sum / period + arr[i];
      out.push(sum);
    }
    return out;
  };
  const trS = wilder(tr), pS = wilder(plusDM), mS = wilder(minusDM);
  const dx: number[] = [];
  for (let i = 0; i < trS.length; i++) {
    if (trS[i] === 0) { dx.push(0); continue; }
    const pdi = (pS[i] / trS[i]) * 100;
    const mdi = (mS[i] / trS[i]) * 100;
    const denom = pdi + mdi;
    dx.push(denom === 0 ? 0 : (Math.abs(pdi - mdi) / denom) * 100);
  }
  if (dx.length < period) return [];
  const adx: number[] = [];
  let prev = dx.slice(0, period).reduce((s, v) => s + v, 0) / period;
  adx.push(prev);
  for (let i = period; i < dx.length; i++) {
    prev = (prev * (period - 1) + dx[i]) / period;
    adx.push(prev);
  }
  return adx;
}

function bbWidthSeries(candles: Candle[], period = 20): number[] {
  const out: number[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    const win = candles.slice(i - period + 1, i + 1).map((c) => c.close);
    const mean = win.reduce((s, v) => s + v, 0) / period;
    const sd = Math.sqrt(win.reduce((s, v) => s + (v - mean) ** 2, 0) / period);
    out.push(mean > 0 ? (4 * sd) / mean : 0);
  }
  return out;
}

function classifyRegime(candles: Candle[]): { regime: ForecastRegime; inputs: Record<string, unknown> } {
  const adx = adxSeries(candles);
  const bbw = bbWidthSeries(candles);
  if (adx.length < 6 || bbw.length < 20) {
    return { regime: "UNKNOWN", inputs: { reason: "insufficient_bars", bars: candles.length } };
  }
  const adxNow = adx[adx.length - 1];
  const adxSlope = adxNow - adx[adx.length - 5]; // 4-bar slope
  const bbwNow = bbw[bbw.length - 1];
  const recent = bbw.slice(-96);
  const sorted = [...recent].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 1e-9;
  const bbwRatio = bbwNow / median;

  let regime: ForecastRegime;
  if (adxNow < 18 && bbwRatio <= 0.85) regime = "RANGE_COMPRESSION";
  else if (adxNow < 22 && adxSlope > 0.5 && bbwRatio > 0.85) regime = "BREAKOUT_SETUP";
  else if (adxNow >= 22 && adxSlope >= 0) regime = "TREND_EXPANSION";
  else if (adxNow >= 22 && adxSlope < 0) regime = "TREND_EXHAUSTION";
  else regime = "RANGE_COMPRESSION";

  return {
    regime,
    inputs: {
      adx: Number(adxNow.toFixed(2)),
      adx_slope_4b: Number(adxSlope.toFixed(3)),
      bb_width: Number(bbwNow.toFixed(6)),
      bb_width_ratio: Number(bbwRatio.toFixed(3)),
      bars: candles.length,
    },
  };
}

async function callTimesFm(params: {

  endpoint: string;
  token: string | null;
  symbol: string;
  context: number[];
  horizons: number[];
}): Promise<Record<string, number>> {
  const { endpoint, token, symbol, context, horizons } = params;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const r = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ symbol, series: "log_oi", context, horizons }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`TimesFM endpoint HTTP ${r.status}: ${text.slice(0, 300)}`);
  let parsed: { predictions?: Record<string, number> };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`TimesFM endpoint returned non-JSON: ${text.slice(0, 200)}`);
  }
  if (!parsed.predictions) throw new Error(`TimesFM response missing 'predictions': ${text.slice(0, 200)}`);
  return parsed.predictions;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const t0 = performance.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const endpoint = Deno.env.get("TIMESFM_ENDPOINT_URL");
  const token = Deno.env.get("TIMESFM_ENDPOINT_TOKEN") ?? null;

  if (!endpoint) {
    return new Response(
      JSON.stringify({ success: false, error: "TIMESFM_ENDPOINT_URL secret not configured" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Single-tenant: pick the first (only) user.
  const { data: profile, error: profErr } = await supabase
    .from("profiles").select("id").limit(1).maybeSingle();
  if (profErr || !profile) {
    return new Response(
      JSON.stringify({ success: false, error: `no user found: ${profErr?.message ?? "empty"}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  const userId = profile.id as string;

  const results: Array<Record<string, unknown>> = [];
  const errors: Array<Record<string, unknown>> = [];
  const attemptsLog: Array<Record<string, unknown>> = [];

  for (const symbol of SYMBOLS) {
    try {
      const rows = await withRetry(
        `bybit-oi:${symbol}`,
        () => fetchBybitOi(symbol, CONTEXT_LEN + 8),
        { attempts: 3, baseMs: 500, maxMs: 4000, timeoutMs: 15_000 },
        attemptsLog,
      );
      if (rows.length < CONTEXT_LEN) throw new Error(`insufficient OI rows: ${rows.length}`);
      const window = rows.slice(-CONTEXT_LEN);
      const context = window.map((r) => Math.log(r.oi));
      const anchor = window[window.length - 1];
      const currentOi = anchor.oi;

      // Rolling std of log-OI for gap_z (last 72 obs).
      const tail = context.slice(-72);
      const mean = tail.reduce((s, v) => s + v, 0) / tail.length;
      const variance = tail.reduce((s, v) => s + (v - mean) ** 2, 0) / tail.length;
      const stdLog = Math.sqrt(variance) || 1e-9;

      // Regime tag (forensics + regime-conditioned accuracy analysis).
      // Never null: falls back to "UNKNOWN" if klines are unavailable.
      let regime: ForecastRegime = "UNKNOWN";
      let regimeInputs: Record<string, unknown> = { reason: "not_computed" };
      try {
        const candles = await withRetry(
          `bybit-kline:${symbol}`,
          () => fetchBybitKlines(symbol, 200),
          { attempts: 2, baseMs: 500, maxMs: 2000, timeoutMs: 12_000 },
          attemptsLog,
        );
        const classified = classifyRegime(candles);
        regime = classified.regime;
        regimeInputs = classified.inputs;
      } catch (e) {
        regimeInputs = { reason: "kline_fetch_failed", error: (e as Error).message.slice(0, 200) };
      }
      console.log(`[future-state-forecaster] ${symbol} regime=${regime} ${JSON.stringify(regimeInputs)}`);



      // TimesFM: cold-start on Modal can take 15-30s, so allow a longer timeout
      // and more attempts (first request warms the container for subsequent ones).
      const predictions = await withRetry(
        `timesfm:${symbol}`,
        () => callTimesFm({ endpoint, token, symbol, context, horizons: HORIZONS }),
        { attempts: 4, baseMs: 1500, maxMs: 12_000, timeoutMs: 90_000 },
        attemptsLog,
      );

      for (const h of HORIZONS) {
        const predLog = Number(predictions[String(h)]);
        if (!Number.isFinite(predLog)) {
          errors.push({ symbol, horizon: h, error: "missing/NaN prediction" });
          continue;
        }
        const predictedOi = Math.exp(predLog);
        const gapAbs = predictedOi - currentOi;
        const gapRel = gapAbs / currentOi;
        const gapZ = (predLog - Math.log(currentOi)) / stdLog;

        try {
          const { data: insertedRow, error: insErr } = await withRetry(
            `db-insert:${symbol}:${h}`,
            async () => {
              const res = await supabase.from("future_state_features").insert({
                user_id: userId,
                symbol,
                series: "log_oi",
                horizon_hours: h,
                regime,
                anchor_ts: anchor.ts,
                current_value: currentOi,
                predicted_value: predictedOi,
                gap_abs: gapAbs,
                gap_rel: gapRel,
                gap_z: gapZ,
                source_model: SOURCE_MODEL,
                meta: {
                  context_len: CONTEXT_LEN,
                  oi_interval: OI_INTERVAL,
                  pred_log: predLog,
                  regime_inputs: regimeInputs,
                },

              }).select("id,gap_rel,predicted_value,created_at").maybeSingle<FutureStateFeatureRow>();
              if (res.error) throw new Error(res.error.message);
              return res;
            },
            { attempts: 2, baseMs: 400, maxMs: 2000, timeoutMs: 10_000 },
            attemptsLog,
          );
          if (insErr) throw new Error(insErr.message);
          results.push({
            symbol,
            horizon: h,
            current: currentOi,
            predicted: insertedRow?.predicted_value ?? predictedOi,
            gap_rel: insertedRow?.gap_rel ?? gapRel,
            inserted: true,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (/duplicate key|unique constraint/i.test(msg)) {
            const { data: existing, error: existingErr } = await supabase
              .from("future_state_features")
              .select("id,gap_rel,predicted_value,created_at")
              .eq("user_id", userId)
              .eq("symbol", symbol)
              .eq("series", "log_oi")
              .eq("horizon_hours", h)
              .eq("anchor_ts", anchor.ts)
              .maybeSingle<FutureStateFeatureRow>();

            if (existingErr || !existing) {
              errors.push({
                symbol,
                horizon: h,
                phase: "db-duplicate-lookup",
                error: existingErr?.message ?? "duplicate row not found",
              });
            } else {
              // Backfill regime if the existing row predates regime tagging.
              if (regime !== "UNKNOWN") {
                await supabase
                  .from("future_state_features")
                  .update({ regime })
                  .eq("id", existing.id)
                  .is("regime", null);
              }

              results.push({
                symbol,
                horizon: h,
                current: currentOi,
                predicted: existing.predicted_value,
                gap_rel: existing.gap_rel,
                inserted: false,
                duplicate_anchor: true,
                existing_created_at: existing.created_at,
              });
              attemptsLog.push({
                label: `db-insert:${symbol}:${h}`,
                attempt: 1,
                ok: true,
                idempotent_duplicate: true,
                existing_id: existing.id,
              });
            }
          } else {
            errors.push({ symbol, horizon: h, phase: "db-insert", error: msg });
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ symbol, error: msg });
      console.error(`[future-state-forecaster] ${symbol} pipeline failed after retries: ${msg}`);
    }
  }

  const elapsed = Math.round(performance.now() - t0);
  const success = errors.length === 0;
  const errorMessage = success ? null : errors.map((e) => `${e.symbol ?? "?"}: ${e.error ?? "?"}`).join(" | ").slice(0, 500);

  await supabase.from("function_metrics").insert({
    function_name: "future-state-forecaster",
    duration_ms: elapsed,
    success,
    symbols_count: SYMBOLS.length,
    error_message: errorMessage,
    phase_timings: {
      horizons: HORIZONS,
      inserted: results.length,
      errors: errors.length,
      error_details: errors.slice(0, 10),
      attempts: attemptsLog.slice(-20),
      retried: attemptsLog.filter((a) => Number(a.attempt) > 1).length,
    },
  }).then(() => {}, (e) => console.error("[future-state-forecaster] metrics insert failed:", e));

  console.log(
    `[future-state-forecaster] done in ${elapsed}ms — inserted=${results.length} errors=${errors.length} retried=${attemptsLog.filter((a) => Number(a.attempt) > 1).length}`,
  );

  return new Response(
    JSON.stringify({ success, elapsed_ms: elapsed, results, errors, attempts: attemptsLog }),
    { status: success ? 200 : 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
