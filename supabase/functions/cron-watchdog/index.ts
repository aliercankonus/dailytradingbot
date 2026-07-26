// Cron Watchdog — monitors scheduled edge functions and alerts when a job
// misses its expected interval. Retries auto-triggers with backoff and
// escalates severity after repeated consecutive misses.
//
// Consecutive-miss tracking uses this function's own rows in
// `function_metrics` (error_message contains `stale:<fn>`), so no extra
// table is needed.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EvidenceSource {
  table: string;
  tsColumn: string;
  // How fresh the side-effect row must be to count as "function is alive".
  freshMin: number;
}

interface CronJob {
  name: string;
  intervalMin: number;
  staleMin: number;
  autoTrigger: boolean;
  // Secondary liveness proof used when the function writes no function_metrics row.
  evidence?: EvidenceSource;
}

const CRON_JOBS: CronJob[] = [
  { name: "kline-collector",          intervalMin: 1,  staleMin: 8,   autoTrigger: true,
    evidence: { table: "kline_cache", tsColumn: "updated_at", freshMin: 8 } },
  { name: "monitor-positions",        intervalMin: 1,  staleMin: 8,   autoTrigger: true,
    evidence: { table: "positions", tsColumn: "updated_at", freshMin: 15 } },
  { name: "auto-trader",              intervalMin: 5,  staleMin: 20,  autoTrigger: true,
    evidence: { table: "bot_heartbeat", tsColumn: "recorded_at", freshMin: 20 } },
  { name: "bot-health-monitor",       intervalMin: 5,  staleMin: 20,  autoTrigger: true,
    evidence: { table: "bot_health_state", tsColumn: "last_seen_at", freshMin: 20 } },
  { name: "cleanup-expired-signals",  intervalMin: 60, staleMin: 120, autoTrigger: true },
  { name: "future-state-forecaster",  intervalMin: 60, staleMin: 90,  autoTrigger: true,
    evidence: { table: "future_state_features", tsColumn: "created_at", freshMin: 90 } },
  { name: "capture-portfolio-snapshot", intervalMin: 60 * 24, staleMin: 60 * 27, autoTrigger: false,
    evidence: { table: "portfolio_performance_history", tsColumn: "created_at", freshMin: 60 * 27 } },
];

const COOLDOWN_MIN = 120;              // standard cooldown per function
const ESCALATION_COOLDOWN_MIN = 30;    // shorter cooldown once escalated
const ESCALATION_THRESHOLD = 3;        // consecutive misses that escalate severity
const AUTO_TRIGGER_ATTEMPTS = 3;       // retries per cycle with backoff
const MISS_LOOKBACK_MIN = 24 * 60;     // window for counting consecutive misses
// A single stale cycle is never enough to alert: functions that don't write
// function_metrics would otherwise produce false alarms every cycle.
const MIN_MISSES_BEFORE_ALERT = 2;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Checks a side-effect table for a recent write. Returns null when the table
// or column is unavailable (never treat that as proof of failure).
async function checkEvidence(
  supabase: ReturnType<typeof createClient>,
  ev: EvidenceSource,
): Promise<{ fresh: boolean; ageMin: number | null } | null> {
  try {
    const { data, error } = await supabase
      .from(ev.table)
      .select(ev.tsColumn)
      .order(ev.tsColumn, { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return null;
    const ts = data?.[ev.tsColumn as keyof typeof data];
    if (!ts) return { fresh: false, ageMin: null };
    const ageMin = Math.round((Date.now() - new Date(ts as string).getTime()) / 60_000);
    return { fresh: ageMin <= ev.freshMin, ageMin };
  } catch {
    return null;
  }
}


async function triggerWithRetry(
  url: string,
  anonKey: string,
): Promise<{ ok: boolean; attempts: number; error?: string; status?: number }> {
  let lastError: string | undefined;
  let lastStatus: number | undefined;
  for (let attempt = 1; attempt <= AUTO_TRIGGER_ATTEMPTS; attempt++) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${anonKey}`,
          apikey: anonKey,
        },
        body: JSON.stringify({ source: "cron-watchdog", attempt }),
      });
      lastStatus = r.status;
      if (r.ok) return { ok: true, attempts: attempt, status: r.status };
      lastError = `HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`;
    } catch (e) {
      lastError = e instanceof Error ? e.message.slice(0, 200) : String(e);
    }
    if (attempt < AUTO_TRIGGER_ATTEMPTS) {
      await sleep(500 * Math.pow(2, attempt - 1)); // 500ms, 1s
    }
  }
  return { ok: false, attempts: AUTO_TRIGGER_ATTEMPTS, error: lastError, status: lastStatus };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const t0 = performance.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const results: Array<Record<string, unknown>> = [];
  const alerted: string[] = [];

  // Pull recent watchdog rows for both cooldown and consecutive-miss counting.
  const { data: recentWatchdog } = await supabase
    .from("function_metrics")
    .select("error_message, created_at")
    .eq("function_name", "cron-watchdog")
    .gte("created_at", new Date(Date.now() - MISS_LOOKBACK_MIN * 60_000).toISOString())
    .not("error_message", "is", null)
    .order("created_at", { ascending: false });

  // Build per-function history of miss events (most recent first).
  const missHistory = new Map<string, Date[]>();
  for (const row of recentWatchdog ?? []) {
    const createdAt = new Date(row.created_at as string);
    const m = /stale:([^\s|]+)/g;
    let match: RegExpExecArray | null;
    while ((match = m.exec(String(row.error_message ?? ""))) !== null) {
      const arr = missHistory.get(match[1]) ?? [];
      arr.push(createdAt);
      missHistory.set(match[1], arr);
    }
  }

  for (const job of CRON_JOBS) {
    const { data: last } = await supabase
      .from("function_metrics")
      .select("created_at,success")
      .eq("function_name", job.name)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastRunAt = last?.created_at ? new Date(last.created_at as string).getTime() : null;
    const minsSince = lastRunAt == null ? null : Math.round((Date.now() - lastRunAt) / 60_000);
    const metricsStale = minsSince == null || minsSince > job.staleMin;

    const entry: Record<string, unknown> = {
      function: job.name,
      minutes_since_last_run: minsSince,
      threshold: job.staleMin,
    };

    // Secondary verification: many functions run fine but never write a
    // function_metrics row. Before treating "no metrics" as a failure, look for
    // a fresh side-effect write in the table that function owns.
    let verifiedAlive = false;
    if (metricsStale && job.evidence) {
      const ev = await checkEvidence(supabase, job.evidence);
      if (ev) {
        entry.evidence_table = job.evidence.table;
        entry.evidence_age_min = ev.ageMin;
        verifiedAlive = ev.fresh;
      } else {
        entry.evidence_check = "unavailable";
      }
    }

    const isStale = metricsStale && !verifiedAlive;
    entry.stale = isStale;
    if (verifiedAlive) entry.verified_alive_via_evidence = true;

    // Prior consecutive misses (this cycle will add +1 if stale).
    const priorMisses = missHistory.get(job.name) ?? [];
    const consecutiveMisses = (isStale ? 1 : 0) + priorMisses.length;
    const escalated = consecutiveMisses >= ESCALATION_THRESHOLD;
    entry.consecutive_misses = consecutiveMisses;
    entry.escalated = escalated;

    if (!isStale) {
      results.push(entry);
      continue;
    }

    // Record the miss regardless of whether we alert, so consecutive counting works.
    staleMarked.push(job.name);

    // Cooldown: shorter window once escalated so severity alerts land faster.
    const cooldownMin = escalated ? ESCALATION_COOLDOWN_MIN : COOLDOWN_MIN;
    const lastAlertAt = priorMisses[0];
    const onCooldown =
      lastAlertAt != null && (Date.now() - lastAlertAt.getTime()) < cooldownMin * 60_000;
    if (onCooldown) {
      entry.skipped = "cooldown";
      entry.cooldown_min = cooldownMin;
      results.push(entry);
      continue;
    }

    // Self-heal with retry+backoff.
    let autoOk: boolean | undefined;
    let autoErr: string | undefined;
    let autoAttempts: number | undefined;
    if (job.autoTrigger) {
      const res = await triggerWithRetry(`${supabaseUrl}/functions/v1/${job.name}`, anonKey);
      autoOk = res.ok;
      autoAttempts = res.attempts;
      autoErr = res.error;
      entry.auto_triggered = true;
      entry.auto_trigger_ok = autoOk;
      entry.auto_trigger_attempts = autoAttempts;
      if (autoErr) entry.auto_trigger_error = autoErr;
    }

    // False-alarm guard: the first stale cycle only self-heals silently when the
    // manual trigger succeeded. Alert only once the problem repeats, or when the
    // recovery attempt itself failed (that's real evidence of breakage).
    if (consecutiveMisses < MIN_MISSES_BEFORE_ALERT && autoOk !== false) {
      entry.skipped = "pending_confirmation";
      entry.min_misses_before_alert = MIN_MISSES_BEFORE_ALERT;
      results.push(entry);
      continue;
    }


    // Send alert email via send-notification, with escalation severity.
    try {
      const r = await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
        },
        body: JSON.stringify({
          type: "cron_missed",
          cronFunction: job.name,
          minutesSinceLastRun: minsSince,
          thresholdMinutes: job.staleMin,
          expectedIntervalMinutes: job.intervalMin,
          autoTriggered: job.autoTrigger,
          autoTriggerOk: autoOk,
          autoTriggerError: autoErr,
          autoTriggerAttempts: autoAttempts,
          consecutiveMisses: consecutiveMisses,
          escalated,
          severity: escalated ? "critical" : "warning",
        }),
      });
      entry.alert_sent = r.ok;
      if (!r.ok) entry.alert_error = `HTTP ${r.status}`;
    } catch (e) {
      entry.alert_sent = false;
      entry.alert_error = e instanceof Error ? e.message : String(e);
    }

    alerted.push(job.name);
    results.push(entry);
  }

  const elapsed = Math.round(performance.now() - t0);
  const errorMessage = alerted.length
    ? alerted.map((n) => `stale:${n}`).join(" | ")
    : null;

  await supabase.from("function_metrics").insert({
    function_name: "cron-watchdog",
    duration_ms: elapsed,
    success: alerted.length === 0,
    symbols_count: CRON_JOBS.length,
    error_message: errorMessage,
    phase_timings: { results, alerted },
  }).then(() => {}, (e) => console.error("[cron-watchdog] metrics insert failed:", e));

  console.log(`[cron-watchdog] done in ${elapsed}ms checked=${CRON_JOBS.length} alerted=${alerted.length}`);

  return new Response(
    JSON.stringify({ success: true, elapsed_ms: elapsed, checked: CRON_JOBS.length, alerted, results }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
