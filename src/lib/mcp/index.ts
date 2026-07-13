import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listOpenPositions from "./tools/list-open-positions";
import listRecentClosedPositions from "./tools/list-recent-closed-positions";
import listRecentSignals from "./tools/list-recent-signals";
import getPortfolioSummary from "./tools/get-portfolio-summary";

// The OAuth issuer MUST be the direct Supabase host (see cloud-auth-oauth-server).
// Build it from VITE_SUPABASE_PROJECT_ID so the value is inlined at build time
// and the module stays import-safe (no runtime env reads at top level).
const projectRef =
  import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "daily-trading-bot-mcp",
  title: "Daily Trading Bot",
  version: "0.1.0",
  instructions:
    "Read-only access to the signed-in user's algorithmic trading account: open positions, recently closed trades, generated signals, and portfolio summary. All calls run under the user's Supabase session and respect row-level security.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listOpenPositions,
    listRecentClosedPositions,
    listRecentSignals,
    getPortfolioSummary,
  ],
});
