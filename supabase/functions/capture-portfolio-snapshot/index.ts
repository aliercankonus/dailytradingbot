import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // CRON_SECRET validation - protect against unauthorized invocations
  const cronSecret = Deno.env.get("CRON_SECRET");
  const providedSecret = req.headers.get("x-cron-secret");
  
  // Allow if either: CRON_SECRET is not set (development), or secrets match
  if (cronSecret && providedSecret !== cronSecret) {
    console.error("Unauthorized: Invalid or missing cron secret");
    return new Response(
      JSON.stringify({ success: false, error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    console.log("Starting portfolio snapshot capture...");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all users with risk parameters
    const { data: users, error: usersError } = await supabase
      .from("risk_parameters")
      .select("user_id, portfolio_value, paper_trading_mode, max_open_trades");

    if (usersError) {
      console.error("Error fetching users:", usersError);
      throw usersError;
    }

    if (!users || users.length === 0) {
      console.log("No users to capture snapshots for");
      return new Response(
        JSON.stringify({ success: true, message: "No users found", snapshots: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Capturing snapshots for ${users.length} users`);

    const snapshots = [];
    const today = new Date().toISOString().split("T")[0];

    for (const user of users) {
      try {
        // Get all closed positions for this user
        const { data: allTrades } = await supabase
          .from("positions")
          .select("*")
          .eq("user_id", user.user_id)
          .eq("status", "closed")
          .order("closed_at", { ascending: false });

        // Get active positions
        const { data: positions } = await supabase
          .from("positions")
          .select("*")
          .eq("user_id", user.user_id)
          .eq("status", "active");

        // Calculate realized P&L from all closed positions
        const realizedPnL = (allTrades || []).reduce(
          (sum, trade) => sum + (trade.realized_pnl || 0),
          0
        );

        // Fetch live prices from Binance for active positions
        const symbolSet = new Set<string>();
        (positions || []).forEach((p: any) => symbolSet.add(String(p.symbol)));
        const priceMap = new Map<string, number>();
        
        for (const symbol of symbolSet) {
          try {
            const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
            const data = await response.json() as { price?: string };
            if (data.price) {
              priceMap.set(symbol, parseFloat(data.price));
            }
          } catch (error) {
            console.error(`Failed to fetch price for ${symbol}:`, error);
          }
        }

        // Calculate unrealized P&L from active positions using live prices
        const unrealizedPnL = (positions || []).reduce((sum, pos) => {
          const currentPrice = priceMap.get(pos.symbol) || pos.entry_price;
          const pnl = pos.side === 'BUY'
            ? (currentPrice - pos.entry_price) * pos.quantity
            : (pos.entry_price - currentPrice) * pos.quantity;
          return sum + pnl;
        }, 0);

        const totalPnL = realizedPnL + unrealizedPnL;
        const currentPortfolioValue = user.portfolio_value + totalPnL;
        const totalReturnPercent =
          user.portfolio_value > 0 ? (totalPnL / user.portfolio_value) * 100 : 0;

        // Calculate trade statistics
        const closedTrades = allTrades || [];
        const winningTrades = closedTrades.filter((t) => (t.realized_pnl || 0) > 0);
        const losingTrades = closedTrades.filter((t) => (t.realized_pnl || 0) <= 0);
        const winRate =
          closedTrades.length > 0
            ? (winningTrades.length / closedTrades.length) * 100
            : 0;

        // Calculate performance metrics
        const avgWin =
          winningTrades.length > 0
            ? winningTrades.reduce((sum, t) => sum + (t.realized_pnl || 0), 0) /
              winningTrades.length
            : 0;

        const avgLoss =
          losingTrades.length > 0
            ? Math.abs(
                losingTrades.reduce((sum, t) => sum + (t.realized_pnl || 0), 0) /
                  losingTrades.length
              )
            : 0;

        const totalWins = winningTrades.reduce(
          (sum, t) => sum + (t.realized_pnl || 0),
          0
        );
        const totalLosses = Math.abs(
          losingTrades.reduce((sum, t) => sum + (t.realized_pnl || 0), 0)
        );
        const profitFactor = totalLosses > 0 ? totalWins / totalLosses : 0;

        const largestWin = winningTrades.length > 0
          ? Math.max(...winningTrades.map((t) => t.realized_pnl || 0))
          : 0;

        const largestLoss = losingTrades.length > 0
          ? Math.abs(Math.min(...losingTrades.map((t) => t.realized_pnl || 0)))
          : 0;

        // Calculate max drawdown (simplified - from peak portfolio value)
        let peakValue = user.portfolio_value;
        let maxDrawdown = 0;
        let runningValue = user.portfolio_value;

        closedTrades.forEach((trade) => {
          runningValue += trade.realized_pnl || 0;
          if (runningValue > peakValue) {
            peakValue = runningValue;
          }
          const drawdown = ((peakValue - runningValue) / peakValue) * 100;
          if (drawdown > maxDrawdown) {
            maxDrawdown = drawdown;
          }
        });

        // Get consecutive losses count
        const { data: riskParams } = await supabase
          .from("risk_parameters")
          .select("consecutive_losses, daily_realized_loss")
          .eq("user_id", user.user_id)
          .single();

        // Insert or update snapshot for today
        const { error: snapshotError } = await supabase
          .from("portfolio_performance_history")
          .upsert(
            {
              user_id: user.user_id,
              snapshot_date: today,
              portfolio_value: currentPortfolioValue,
              initial_portfolio_value: user.portfolio_value,
              realized_pnl: realizedPnL,
              unrealized_pnl: unrealizedPnL,
              total_pnl: totalPnL,
              total_return_percent: totalReturnPercent,
              total_trades: closedTrades.length,
              winning_trades: winningTrades.length,
              losing_trades: losingTrades.length,
              win_rate: winRate,
              open_positions: positions?.length || 0,
              max_open_positions: user.max_open_trades,
              avg_win: avgWin,
              avg_loss: avgLoss,
              profit_factor: profitFactor,
              largest_win: largestWin,
              largest_loss: largestLoss,
              max_drawdown: maxDrawdown,
              daily_loss: riskParams?.daily_realized_loss || 0,
              consecutive_losses: riskParams?.consecutive_losses || 0,
              paper_trading_mode: user.paper_trading_mode,
            },
            { onConflict: "user_id,snapshot_date" }
          );

        if (snapshotError) {
          console.error(`Error saving snapshot for user ${user.user_id}:`, snapshotError);
        } else {
          snapshots.push({
            userId: user.user_id,
            portfolioValue: currentPortfolioValue,
            totalPnL,
            winRate: winRate.toFixed(2),
          });
          console.log(`Snapshot saved for user ${user.user_id}: $${currentPortfolioValue.toFixed(2)}`);
        }
      } catch (userError) {
        console.error(`Error processing user ${user.user_id}:`, userError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Captured ${snapshots.length} portfolio snapshots`,
        snapshots,
        date: today,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error capturing portfolio snapshots:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
