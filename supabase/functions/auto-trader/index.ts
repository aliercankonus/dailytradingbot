import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.84.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    
    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      throw new Error("Missing required environment variables");
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Auto-trader started at", new Date().toISOString());

    // Fetch all users with trading enabled
    const { data: activeUsers, error: usersError } = await supabase
      .from("risk_parameters")
      .select("user_id, is_trading_enabled, max_open_trades, current_open_trades")
      .eq("is_trading_enabled", true);

    if (usersError) {
      console.error("Error fetching active users:", usersError);
      throw usersError;
    }

    if (!activeUsers || activeUsers.length === 0) {
      console.log("No users with trading enabled");
      return new Response(
        JSON.stringify({
          success: true,
          message: "No active users to process",
          processedUsers: 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing ${activeUsers.length} users with trading enabled`);

    const results = [];

    // Process each user by calling strategy-analyzer
    for (const userParams of activeUsers) {
      try {
        console.log(`Processing user: ${userParams.user_id}`);
        
        // Get a session token for this user to call strategy-analyzer
        // Since we're using service role, we need to create a mock auth header
        // Strategy-analyzer requires auth, so we'll use service role with user context
        
        const { data: analyzerResult, error: analyzerError } = await supabase.functions.invoke("strategy-analyzer", {
          headers: {
            // Use service role to bypass auth, strategy-analyzer will use user_id from the request
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: {
            user_id: userParams.user_id,
          },
        });

        if (analyzerError) {
          console.error(`Strategy analyzer error for user ${userParams.user_id}:`, analyzerError);
          results.push({
            userId: userParams.user_id,
            success: false,
            signals: 0,
            executed: 0,
            error: analyzerError.message || "Strategy analyzer failed",
          });
          continue;
        }

        const signalsGenerated = analyzerResult?.totalSignalsGenerated || 0;
        const signalsExecuted = analyzerResult?.executedSignals || 0;
        const rejected = analyzerResult?.rejectedByMultiTimeframeAnalysis || 0;

        results.push({
          userId: userParams.user_id,
          success: true,
          signals: signalsGenerated,
          executed: signalsExecuted,
          rejected,
          message: analyzerResult?.message || 'Auto-trader processing completed',
        });

        console.log(`User ${userParams.user_id}: Generated ${signalsGenerated} signals, executed ${signalsExecuted}, rejected ${rejected}`);
      } catch (userError) {
        console.error(`Error processing user ${userParams.user_id}:`, userError);
        results.push({
          userId: userParams.user_id,
          success: false,
          error: userError instanceof Error ? userError.message : "Unknown error",
        });
      }
    }

    const totalSignals = results.reduce((sum, r) => sum + (r.signals || 0), 0);
    const totalExecuted = results.reduce((sum, r) => sum + (r.executed || 0), 0);
    const totalRejected = results.reduce((sum, r) => sum + (r.rejected || 0), 0);

    console.log(
      `Auto-trader completed: Processed ${activeUsers.length} users, generated ${totalSignals} signals, executed ${totalExecuted} trades, rejected ${totalRejected}`
    );

    return new Response(
      JSON.stringify({
        success: true,
        processedUsers: activeUsers.length,
        totalSignals,
        totalExecuted,
        totalRejected,
        results,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Auto-trader error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
