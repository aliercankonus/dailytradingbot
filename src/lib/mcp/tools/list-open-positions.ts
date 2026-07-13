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
  name: "list_open_positions",
  title: "List open positions",
  description:
    "List the signed-in user's currently open trading positions with entry price, side, quantity, unrealized PnL, stop-loss, and take-profit.",
  inputSchema: {
    symbol: z
      .string()
      .trim()
      .optional()
      .describe("Optional symbol filter, e.g. BTCUSDT."),
    limit: z.number().int().min(1).max(100).default(25).describe(
      "Maximum number of positions to return (default 25).",
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
        "id, symbol, side, status, quantity, entry_price, current_price, stop_loss, take_profit, realized_pnl_percent, peak_pnl_percent, strategy_name, opened_at",
      )
      .eq("status", "open")
      .order("opened_at", { ascending: false })
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
