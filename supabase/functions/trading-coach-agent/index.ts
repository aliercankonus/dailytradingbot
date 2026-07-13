// Trading Coach Agent — Report-only mode.
// Aggregates forensic data for a user over N days and asks Lovable AI
// (google/gemini-2.5-pro) for a structured audit report. Writes the result to
// public.agent_reports. Never applies changes to code or configuration.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL = "google/gemini-2.5-pro";
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

interface RequestBody {
  period_days?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) {
      return json({ error: "LOVABLE_API_KEY is not configured" }, 500);
    }

    // User-scoped client (RLS applies) — used for all forensic reads.
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      return json({ error: "Unauthorized" }, 401);
    }
    const userId = userData.user.id;

    const body: RequestBody = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const periodDays = Math.max(1, Math.min(365, Number(body.period_days ?? 30)));
    const since = new Date(Date.now() - periodDays * 86400_000).toISOString();

    console.log(`[coach-agent] user=${userId} period=${periodDays}d`);

    // Create pending report row up front so the UI can show progress.
    const { data: reportRow, error: insertErr } = await supabase
      .from("agent_reports")
      .insert({
        user_id: userId,
        period_days: periodDays,
        status: "pending",
        model: MODEL,
      })
      .select("id")
      .single();

    if (insertErr || !reportRow) {
      return json({ error: `Failed to create report: ${insertErr?.message}` }, 500);
    }
    const reportId = reportRow.id;

    // Gather all forensic data in parallel.
    const [
      forensicReport,
      ignitionAudit,
      opportunityDensity,
      closedPositions,
      worstTrades,
      shadowOutcomes,
      rejectionCounts,
      recentSignals,
    ] = await Promise.all([
      supabase.rpc("get_strategy_forensic_report", { p_user_id: userId, p_days: periodDays }),
      supabase.rpc("get_ignition_tier_audit", { p_user_id: userId, p_hours_back: periodDays * 24 }),
      supabase.rpc("get_market_opportunity_density", { p_user_id: userId, p_since: since }),
      supabase
        .from("positions")
        .select(
          "id,symbol,side,strategy_name,realized_pnl,realized_pnl_percent,close_reason,opened_at,closed_at,confidence_score",
        )
        .eq("status", "closed")
        .gte("closed_at", since)
        .order("closed_at", { ascending: false })
        .limit(500),
      supabase
        .from("positions")
        .select("symbol,side,strategy_name,realized_pnl,realized_pnl_percent,close_reason,confidence_score")
        .eq("status", "closed")
        .gte("closed_at", since)
        .order("realized_pnl", { ascending: true })
        .limit(15),
      supabase
        .from("shadow_mode_signals")
        .select("symbol,gate_details,would_have_won,simulated_pnl_percent,outcome_notes")
        .eq("outcome_tracked", true)
        .gte("created_at", since)
        .limit(300),
      supabase
        .from("signal_rejection_log")
        .select("symbol,filters_status,checked_at")
        .gte("checked_at", since)
        .limit(500),
      supabase
        .from("trading_signals")
        .select("symbol,side,strategy_name,confidence_score,status,created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    // Summarize rejection log by gate so the model doesn't drown in raw rows.
    const gateCounts: Record<string, number> = {};
    for (const row of (rejectionCounts.data ?? []) as Array<{ filters_status: any }>) {
      const gate = (row.filters_status?.gate as string) ?? "UNKNOWN";
      gateCounts[gate] = (gateCounts[gate] ?? 0) + 1;
    }

    const rawInputStats = {
      period_days: periodDays,
      closed_positions_count: closedPositions.data?.length ?? 0,
      recent_signals_count: recentSignals.data?.length ?? 0,
      shadow_outcomes_count: shadowOutcomes.data?.length ?? 0,
      rejections_count: rejectionCounts.data?.length ?? 0,
      rejection_gate_summary: gateCounts,
    };

    // Compose the model prompt.
    const systemPrompt = `You are the Trading Coach — a senior quant reviewing a live crypto trading system.
Your job: audit the last ${periodDays} days of trades, blocked-but-would-have-won shadow signals, and rejection gates. Identify systemic errors and produce a concrete action list.

Rules:
- Ground every claim in the data provided. Never invent numbers.
- Prefer high-signal, small findings over vague generalities.
- Actions are RECOMMENDATIONS only — do not attempt to change code.
- If data is too sparse to conclude, say so and mark confidence low.
- Return STRICT JSON matching the schema below. No prose outside JSON.

Response schema:
{
  "executive_summary": "3-6 sentence markdown summary in Turkish",
  "kpis": {
    "total_trades": number,
    "win_rate_pct": number,
    "profit_factor": number,
    "expectancy_pct": number,
    "avg_win_pct": number,
    "avg_loss_pct": number,
    "total_pnl": number
  },
  "systemic_errors": [
    { "title": string, "evidence": string, "impact": "high"|"medium"|"low", "confidence": "high"|"medium"|"low" }
  ],
  "strategy_verdict": [
    { "strategy": string, "trades": number, "verdict": "keep"|"tune"|"kill"|"insufficient_data", "reason": string }
  ],
  "proposed_actions": [
    { "type": "threshold_change"|"strategy_disable"|"sizing_change"|"gate_flag_toggle"|"other", "target": string, "current": string, "proposed": string, "rationale": string, "expected_impact": string }
  ]
}`;

    const userPrompt = `Analyze this ${periodDays}-day forensic dataset:

## Strategy Forensic Report (closed positions)
${JSON.stringify(forensicReport.data ?? {}, null, 2)}

## Ignition Tier Audit (shadow entries)
${JSON.stringify(ignitionAudit.data ?? {}, null, 2)}

## Market Opportunity Density
${JSON.stringify(opportunityDensity.data ?? {}, null, 2)}

## Recent Closed Positions (last ${closedPositions.data?.length ?? 0})
${JSON.stringify(closedPositions.data ?? [], null, 2)}

## Worst 15 Trades (by realized PnL)
${JSON.stringify(worstTrades.data ?? [], null, 2)}

## Shadow-Mode Outcomes (would-have-won analysis, sample)
${JSON.stringify((shadowOutcomes.data ?? []).slice(0, 100), null, 2)}

## Rejection Gate Summary (${rawInputStats.rejections_count} total rejections)
${JSON.stringify(gateCounts, null, 2)}

## Recent Signals (last ${recentSignals.data?.length ?? 0})
${JSON.stringify(recentSignals.data ?? [], null, 2)}

Produce the JSON audit report now.`;

    console.log(`[coach-agent] Calling ${MODEL}...`);
    const aiResp = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": lovableKey,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error(`[coach-agent] AI error ${aiResp.status}: ${errText}`);
      await supabase
        .from("agent_reports")
        .update({
          status: "failed",
          error_message: `AI Gateway ${aiResp.status}: ${errText.slice(0, 500)}`,
          completed_at: new Date().toISOString(),
          raw_input_stats: rawInputStats,
        })
        .eq("id", reportId);
      const status = aiResp.status === 429 ? 429 : aiResp.status === 402 ? 402 : 500;
      return json(
        {
          error:
            aiResp.status === 429
              ? "AI rate limit — try again shortly."
              : aiResp.status === 402
              ? "AI credits exhausted — add credits."
              : `AI error: ${errText.slice(0, 200)}`,
          report_id: reportId,
        },
        status,
      );
    }

    const aiJson = await aiResp.json();
    const content = aiJson?.choices?.[0]?.message?.content ?? "{}";
    const tokensUsed = aiJson?.usage?.total_tokens ?? null;

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error("[coach-agent] Failed to parse model output", e);
      await supabase
        .from("agent_reports")
        .update({
          status: "failed",
          error_message: "Model returned non-JSON output",
          completed_at: new Date().toISOString(),
          raw_input_stats: rawInputStats,
          tokens_used: tokensUsed,
        })
        .eq("id", reportId);
      return json({ error: "Model returned invalid JSON", report_id: reportId }, 500);
    }

    await supabase
      .from("agent_reports")
      .update({
        status: "completed",
        executive_summary: parsed.executive_summary ?? null,
        kpis: parsed.kpis ?? {},
        systemic_errors: parsed.systemic_errors ?? [],
        strategy_verdict: parsed.strategy_verdict ?? [],
        proposed_actions: parsed.proposed_actions ?? [],
        raw_input_stats: rawInputStats,
        tokens_used: tokensUsed,
        completed_at: new Date().toISOString(),
      })
      .eq("id", reportId);

    console.log(`[coach-agent] ✅ Report ${reportId} completed (tokens=${tokensUsed})`);
    return json({ ok: true, report_id: reportId });
  } catch (err: any) {
    console.error("[coach-agent] Unhandled error", err);
    return json({ error: err?.message ?? "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
