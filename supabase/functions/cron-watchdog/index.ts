// Cron Watchdog — monitors scheduled edge functions and alerts when a job
// misses its expected interval. Optionally auto-triggers the stale function.
//
// Alert cooldown is enforced by inspecting this function's own rows in
// `function_metrics` (error_message contains `stale:<fn>`), so no extra
// table is needed.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Each entry describes a scheduled function we expect to run.
// `intervalMin` = declared cron cadence. `staleMin` = when we consider it broken.
// `autoTrigger` = call the function ourselves as a self-heal attempt.
interface CronJob {
  name: string;
  intervalMin: number;
  staleMin: number;
  autoTrigger: boolean;
}

const CRON_JOBS: CronJob[] = [
  { name: "kline-collector",          intervalMin: 1,  staleMin: 8,   autoTrigger: true },
  { name: "monitor-positions",        intervalMin: 1,  staleMin: 8,   autoTrigger: true },
  { name: "auto-trader",              intervalMin: 5,  staleMin: 20,  autoTrigger: true },
  { name: "bot-health-monitor",       intervalMin: 5,  staleMin: 20,  autoTrigger: true },
  { name: "cleanup-expired-signals",  intervalMin: 60, staleMin: 120, autoTrigger: true },
  { name: "future-state-forecaster",  intervalMin: 60, staleMin: 90,  autoTrigger: true },
  { name: "capture-portfolio-snapshot", intervalMin: 60 * 24, staleMin: 60 * 27, autoTrigger: false },
];

const COOLDOWN_MIN = 120; // don't re-alert the same function within this window

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const t0 = performance.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const results: Array<Record<string, unknown>> = [];
  const alerted: string[] = [];

  // Last watchdog alerts (for cooldown) — self-inspect our own metrics rows.
  const { data: recentWatchdog } = await supabase
    .from("function_metrics")
    .select("error_message, created_at")
    .eq("function_name", "cron-watchdog")
    .gte("created_at", new Date(Date.now() - COOLDOWN_MIN * 60_000).toISOString())
    .not("error_message", "is", null);

  const onCooldown = new Set<string>();
  for (const row of recentWatchdog ?? []) {
    const m = /stale:([^\s|]+)/g;
    let match: RegExpExecArray | null;
    while ((match = m.exec(String(row.error_message ?? ""))) !== null) {
      onCooldown.add(match[1]);
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
    const isStale = minsSince == null || minsSince > job.staleMin;

    const entry: Record<string, unknown> = {
      function: job.name,
      minutes_since_last_run: minsSince,
      threshold: job.staleMin,
      stale: isStale,
    };

    if (!isStale) {
      results.push(entry);
      continue;
    }

    if (onCooldown.has(job.name)) {
      entry.skipped = "cooldown";
      results.push(entry);
      continue;
    }

    // Self-heal attempt.
    let autoOk: boolean | undefined;
    let autoErr: string | undefined;
    if (job.autoTrigger) {
      try {
        const r = await fetch(`${supabaseUrl}/functions/v1/${job.name}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${anonKey}`,
            apikey: anonKey,
          },
          body: JSON.stringify({ source: "cron-watchdog" }),
        });
        autoOk = r.ok;
        if (!r.ok) autoErr = `HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`;
      } catch (e) {
        autoOk = false;
        autoErr = e instanceof Error ? e.message.slice(0, 200) : String(e);
      }
      entry.auto_triggered = true;
      entry.auto_trigger_ok = autoOk;
      if (autoErr) entry.auto_trigger_error = autoErr;
    }

    // Send alert email via send-notification.
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
