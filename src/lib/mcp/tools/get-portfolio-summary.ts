import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";


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
  name: "get_portfolio_summary",
  title: "Get portfolio summary",
  description:
    "Return an aggregate snapshot for the signed-in user: open position count, total open notional, and realized PnL over the last 24h / 7d / 30d.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const sb = supabaseForUser(ctx);

    const { data: openRows, error: openErr } = await sb
      .from("positions")
      .select("quantity, entry_price, current_price, side")
      .eq("status", "open");
    if (openErr) {
      return { content: [{ type: "text", text: openErr.message }], isError: true };
    }

    const openCount = openRows?.length ?? 0;
    let openNotional = 0;
    let unrealizedPnl = 0;
    for (const p of openRows ?? []) {
      const px = Number(p.current_price ?? p.entry_price ?? 0);
      const qty = Number(p.quantity ?? 0);
      openNotional += Math.abs(qty * px);
      const entry = Number(p.entry_price ?? 0);
      const sign = (p.side ?? "").toUpperCase() === "SHORT" ? -1 : 1;
      unrealizedPnl += sign * (px - entry) * qty;
    }

    const now = Date.now();
    const windows: Record<string, number> = {
      last_24h: now - 24 * 60 * 60 * 1000,
      last_7d: now - 7 * 24 * 60 * 60 * 1000,
      last_30d: now - 30 * 24 * 60 * 60 * 1000,
    };

    const realized: Record<string, { trades: number; pnl: number; wins: number }> = {};
    for (const [label, since] of Object.entries(windows)) {
      const { data, error } = await sb
        .from("positions")
        .select("realized_pnl")
        .eq("status", "closed")
        .gte("closed_at", new Date(since).toISOString());
      if (error) {
        return { content: [{ type: "text", text: error.message }], isError: true };
      }
      const trades = data?.length ?? 0;
      const pnl = (data ?? []).reduce((acc, r) => acc + Number(r.realized_pnl ?? 0), 0);
      const wins = (data ?? []).filter((r) => Number(r.realized_pnl ?? 0) > 0).length;
      realized[label] = { trades, pnl: Number(pnl.toFixed(2)), wins };
    }

    const summary = {
      open_positions: openCount,
      open_notional_usd: Number(openNotional.toFixed(2)),
      unrealized_pnl_usd: Number(unrealizedPnl.toFixed(2)),
      realized: realized,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
      structuredContent: summary,
    };
  },
});
