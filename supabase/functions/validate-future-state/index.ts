// Validate Future-State — weekly cron
//
// For every mature `future_state_features` row (target time <= now), fetch the
// realized Bybit OI at target time, then compute accuracy metrics grouped by
// (symbol, series, horizon) over the window and store them in
// `future_state_accuracy`.
//
// Metrics:
//   - MAPE                 : mean(|predicted - realized| / realized)
//   - dir_hit_rate         : share of rows where sign(predicted-current) == sign(realized-current)
//   - rank_ic              : Spearman correlation between predicted gap_rel and realized gap_rel
//   - mean_*_gap_rel       : diagnostic averages

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BYBIT_OI_URL = "https://api.bybit.com/v5/market/open-interest";
const OI_INTERVAL = "1h";
const HOUR_MS = 3_600_000;
const MATCH_WINDOW_MS = 30 * 60_000; // 30 min tolerance around target

interface FeatureRow {
  id: string;
  user_id: string;
  symbol: string;
  series: string;
  horizon_hours: number;
  anchor_ts: number; // ms
  current_value: number;
  predicted_value: number;
  gap_rel: number;
  regime: string | null;
}

interface BybitOi {
  openInterest: string;
  timestamp: string;
}

async function fetchBybitOiRange(symbol: string, startMs: number, endMs: number): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  let cursor: string | null = null;
  let pages = 0;
  const maxPages = 20;
  // Bybit returns newest first; we page backward until we cover startMs.
  while (pages < maxPages) {
    const params = new URLSearchParams({
      category: "linear",
      symbol,
      intervalTime: "1h",
      limit: "200",
      endTime: String(endMs),
    });
    if (cursor) params.set("cursor", cursor);
    const res = await fetch(`${BYBIT_OI_URL}?${params}`);
    if (!res.ok) throw new Error(`bybit HTTP ${res.status}`);
    const json = await res.json() as { result?: { list?: BybitOi[]; nextPageCursor?: string } };
    const list = json.result?.list ?? [];
    if (list.length === 0) break;
    let oldestSeen = Number.POSITIVE_INFINITY;
    for (const row of list) {
      const ts = Number(row.timestamp);
      const oi = Number(row.openInterest);
      if (Number.isFinite(ts) && Number.isFinite(oi)) {
        out.set(ts, oi);
        if (ts < oldestSeen) oldestSeen = ts;
      }
    }
    pages++;
    if (oldestSeen <= startMs) break;
    cursor = json.result?.nextPageCursor ?? null;
    if (!cursor) break;
  }
  return out;
}

function findRealizedOi(oiMap: Map<number, number>, targetMs: number): number | null {
  let best: { ts: number; oi: number; diff: number } | null = null;
  for (const [ts, oi] of oiMap) {
    const diff = Math.abs(ts - targetMs);
    if (diff <= MATCH_WINDOW_MS && (!best || diff < best.diff)) {
      best = { ts, oi, diff };
    }
  }
  return best?.oi ?? null;
}

// Spearman rank correlation
function spearman(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 3) return null;
  const rank = (arr: number[]): number[] => {
    const indexed = arr.map((v, i) => ({ v, i }));
    indexed.sort((a, b) => a.v - b.v);
    const r = new Array<number>(n);
    let i = 0;
    while (i < n) {
      let j = i;
      while (j + 1 < n && indexed[j + 1].v === indexed[i].v) j++;
      const avgRank = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[indexed[k].i] = avgRank;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(xs);
  const ry = rank(ys);
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const mx = mean(rx);
  const my = mean(ry);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = rx[i] - mx;
    const b = ry[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const started = Date.now();
  const nowMs = Date.now();
  const groups: Record<string, any> = {};
  const inserted: any[] = [];
  const errors: string[] = [];

  try {
    // Pull all mature predictions (target time already passed).
    const { data: features, error } = await supabase
      .from("future_state_features")
      .select("id,user_id,symbol,series,horizon_hours,anchor_ts,current_value,predicted_value,gap_rel,regime")
      .order("anchor_ts", { ascending: true });
    if (error) throw error;

    const mature = (features ?? []).filter((r: FeatureRow) =>
      r.anchor_ts + r.horizon_hours * HOUR_MS <= nowMs,
    ) as FeatureRow[];

    if (mature.length === 0) {
      return new Response(JSON.stringify({
        ok: true,
        message: "no mature predictions yet",
        total_features: features?.length ?? 0,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Group by (user_id, symbol, series, horizon_hours)
    for (const r of mature) {
      const key = `${r.user_id}|${r.symbol}|${r.series}|${r.horizon_hours}`;
      (groups[key] ||= { user_id: r.user_id, symbol: r.symbol, series: r.series, horizon_hours: r.horizon_hours, rows: [] as FeatureRow[] }).rows.push(r);
    }

    for (const key of Object.keys(groups)) {
      const g = groups[key];
      try {
        const targetTimes = g.rows.map((r: FeatureRow) => r.anchor_ts + r.horizon_hours * HOUR_MS);
        const startMs = Math.min(...targetTimes) - HOUR_MS;
        const endMs = Math.max(...targetTimes) + HOUR_MS;
        const oiMap = await fetchBybitOiRange(g.symbol, startMs, endMs);

        const paired: { pred: number; realized: number; current: number; predGap: number; realizedGap: number }[] = [];
        for (const r of g.rows as FeatureRow[]) {
          const targetMs = r.anchor_ts + r.horizon_hours * HOUR_MS;
          const realized = findRealizedOi(oiMap, targetMs);
          if (realized == null || realized <= 0) continue;
          // predicted/current are stored in *level* space (OI units) per forecaster
          const pred = r.predicted_value;
          const cur = r.current_value;
          if (!(pred > 0) || !(cur > 0)) continue;
          paired.push({
            pred,
            realized,
            current: cur,
            predGap: (pred - cur) / cur,
            realizedGap: (realized - cur) / cur,
          });
        }

        if (paired.length === 0) {
          errors.push(`${key}: no realized OI matched within window`);
          continue;
        }

        const n = paired.length;
        const mape = paired.reduce((s, p) => s + Math.abs(p.pred - p.realized) / p.realized, 0) / n;
        const hits = paired.filter((p) => Math.sign(p.predGap) === Math.sign(p.realizedGap)).length;
        const dirHit = hits / n;
        const ic = spearman(paired.map((p) => p.predGap), paired.map((p) => p.realizedGap));
        const meanPredGap = paired.reduce((s, p) => s + p.predGap, 0) / n;
        const meanRealGap = paired.reduce((s, p) => s + p.realizedGap, 0) / n;

        const periodStart = new Date(Math.min(...g.rows.map((r: FeatureRow) => r.anchor_ts))).toISOString();
        const periodEnd = new Date(Math.max(...targetTimes)).toISOString();

        const { data: ins, error: insErr } = await supabase
          .from("future_state_accuracy")
          .insert({
            user_id: g.user_id,
            symbol: g.symbol,
            series: g.series,
            horizon_hours: g.horizon_hours,
            period_start: periodStart,
            period_end: periodEnd,
            n_samples: n,
            mape,
            dir_hit_rate: dirHit,
            rank_ic: ic,
            mean_predicted_gap_rel: meanPredGap,
            mean_realized_gap_rel: meanRealGap,
            meta: {
              total_rows: g.rows.length,
              matched: n,
              window_min: 30,
            },
          })
          .select("id")
          .single();
        if (insErr) throw insErr;
        inserted.push({ key, id: ins?.id, n, mape, dir_hit_rate: dirHit, rank_ic: ic });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${key}: ${msg}`);
      }
    }

    await supabase.from("function_metrics").insert({
      function_name: "validate-future-state",
      duration_ms: Date.now() - started,
      success: errors.length === 0,
      error_message: errors.length ? errors.join(" | ").slice(0, 500) : null,
      symbols_count: Object.keys(groups).length,
      phase_timings: { inserted, errors },
    });

    return new Response(JSON.stringify({
      ok: true,
      mature_rows: mature.length,
      groups: Object.keys(groups).length,
      inserted,
      errors,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[validate-future-state] fatal:", msg);
    await supabase.from("function_metrics").insert({
      function_name: "validate-future-state",
      duration_ms: Date.now() - started,
      success: false,
      error_message: msg.slice(0, 500),
    });
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
