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

// Scope locked to walk-forward-validated anomaly.
const SYMBOLS = ["ETHUSDT"];
const HORIZONS = [48];
const CONTEXT_LEN = 192;
const OI_INTERVAL = "1h";
const SOURCE_MODEL = "timesfm-2.5-external";

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
          const { error: insErr } = await withRetry(
            `db-insert:${symbol}:${h}`,
            async () => {
              const res = await supabase.from("future_state_features").insert({
                user_id: userId,
                symbol,
                series: "log_oi",
                horizon_hours: h,
                regime: null,
                anchor_ts: anchor.ts,
                current_value: currentOi,
                predicted_value: predictedOi,
                gap_abs: gapAbs,
                gap_rel: gapRel,
                gap_z: gapZ,
                source_model: SOURCE_MODEL,
                meta: { context_len: CONTEXT_LEN, oi_interval: OI_INTERVAL, pred_log: predLog },
              });
              if (res.error) throw new Error(res.error.message);
              return res;
            },
            { attempts: 2, baseMs: 400, maxMs: 2000, timeoutMs: 10_000 },
            attemptsLog,
          );
          if (insErr) throw new Error(insErr.message);
          results.push({ symbol, horizon: h, current: currentOi, predicted: predictedOi, gap_rel: gapRel });
        } catch (e) {
          errors.push({ symbol, horizon: h, phase: "db-insert", error: e instanceof Error ? e.message : String(e) });
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
