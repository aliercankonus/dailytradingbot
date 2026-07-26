import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

/**
 * Writes a heartbeat row into public.function_metrics so the cron-watchdog can
 * verify liveness without relying on side-effect evidence tables.
 * Never throws: metric logging must never break the caller.
 */
export async function recordFunctionMetric(opts: {
  functionName: string;
  startedAt: number;
  success: boolean;
  errorMessage?: string | null;
  symbolsCount?: number | null;
  phaseTimings?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return;

    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const { error } = await supabase.from("function_metrics").insert({
      function_name: opts.functionName,
      duration_ms: Math.max(0, Math.round(Date.now() - opts.startedAt)),
      success: opts.success,
      error_message: opts.errorMessage ?? null,
      symbols_count: opts.symbolsCount ?? null,
      phase_timings: opts.phaseTimings ?? null,
    });
    if (error) {
      console.warn(`[function-metrics] insert failed for ${opts.functionName}: ${error.message}`);
    }
  } catch (e) {
    console.warn(`[function-metrics] unexpected error: ${e instanceof Error ? e.message : String(e)}`);
  }
}
