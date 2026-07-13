import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

declare const process: { env: Record<string, string | undefined> };

function supabaseForUser(ctx: ToolContext) {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export default defineTool({
  name: "list_recent_signals",
  title: "List recent trading signals",
  description:
    "List the signed-in user's most recent trading signals with symbol, side, entry price, SL/TP, confidence, and strategy.",
  inputSchema: {
    symbol: z.string().trim().optional().describe("Optional symbol filter."),
    status: z
      .enum(["active", "executed", "expired", "rejected"])
      .optional()
      .describe("Optional status filter."),
    limit: z.number().int().min(1).max(200).default(25).describe(
      "Maximum number of signals to return (default 25).",
    ),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ symbol, status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const sb = supabaseForUser(ctx);
    let q = sb
      .from("trading_signals")
      .select(
        "id, symbol, signal_type, entry_price, stop_loss, take_profit, confidence_score, risk_reward_ratio, strategy_name, status, trend, reason, created_at, executed_at, expires_at",
      )
      .order("created_at", { ascending: false })
      .limit(limit);
    if (symbol) q = q.eq("symbol", symbol.toUpperCase());
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { signals: data ?? [] },
    };
  },
});
