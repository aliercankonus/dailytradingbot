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
  name: "list_recent_closed_positions",
  title: "List recent closed positions",
  description:
    "List the signed-in user's most recently closed trading positions with realized PnL, close reason, and strategy.",
  inputSchema: {
    symbol: z.string().trim().optional().describe("Optional symbol filter, e.g. ETHUSDT."),
    limit: z.number().int().min(1).max(200).default(25).describe(
      "Maximum number of closed positions to return (default 25).",
    ),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ symbol, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const sb = supabaseForUser(ctx);
    let q = sb
      .from("positions")
      .select(
        "id, symbol, side, quantity, entry_price, exit_price, realized_pnl, realized_pnl_percent, close_reason, strategy_name, opened_at, closed_at",
      )
      .eq("status", "closed")
      .order("closed_at", { ascending: false })
      .limit(limit);
    if (symbol) q = q.eq("symbol", symbol.toUpperCase());
    const { data, error } = await q;
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { positions: data ?? [] },
    };
  },
});
