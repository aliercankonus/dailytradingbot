import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.84.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface UserProcessResult {
  userId: string;
  success: boolean;
  signals?: number;
  executed?: number;
  rejected?: number;
  message?: string;
  error?: string;
}

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseServiceKey) {
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

    // Process users in parallel with concurrency limit to avoid overwhelming the system
    const BATCH_SIZE = 3; // Process 3 users at a time
    const results: UserProcessResult[] = [];

    for (let i = 0; i < activeUsers.length; i += BATCH_SIZE) {
      const batch = activeUsers.slice(i, i + BATCH_SIZE);
      
      const batchResults = await Promise.all(
        batch.map(async (userParams): Promise<UserProcessResult> => {
          try {
            console.log(`Processing user: ${userParams.user_id}`);
            
            // Call strategy-analyzer with service role + user_id in body
            const { data: analyzerResult, error: analyzerError } = await supabase.functions.invoke("strategy-analyzer", {
              headers: {
                Authorization: `Bearer ${supabaseServiceKey}`,
              },
              body: {
                user_id: userParams.user_id,
              },
            });

            if (analyzerError) {
              const errorMessage = typeof analyzerError === 'object' && analyzerError !== null
                ? (analyzerError as any).message || JSON.stringify(analyzerError)
                : String(analyzerError);
              console.error(`Strategy analyzer error for user ${userParams.user_id}:`, errorMessage);
              return {
                userId: userParams.user_id,
                success: false,
                signals: 0,
                executed: 0,
                error: errorMessage,
              };
            }

            const signalsGenerated = analyzerResult?.totalSignalsGenerated || 0;
            const signalsExecuted = analyzerResult?.executedSignals || 0;
            const rejected = analyzerResult?.rejectedByMultiTimeframeAnalysis || 0;

            console.log(`User ${userParams.user_id}: Generated ${signalsGenerated} signals, executed ${signalsExecuted}, rejected ${rejected}`);

            return {
              userId: userParams.user_id,
              success: true,
              signals: signalsGenerated,
              executed: signalsExecuted,
              rejected,
              message: analyzerResult?.message || 'Auto-trader processing completed',
            };
          } catch (userError) {
            const errorMessage = userError instanceof Error ? userError.message : "Unknown error";
            console.error(`Error processing user ${userParams.user_id}:`, errorMessage);
            return {
              userId: userParams.user_id,
              success: false,
              error: errorMessage,
            };
          }
        })
      );

      results.push(...batchResults);
    }

    const totalSignals = results.reduce((sum, r) => sum + (r.signals || 0), 0);
    const totalExecuted = results.reduce((sum, r) => sum + (r.executed || 0), 0);
    const totalRejected = results.reduce((sum, r) => sum + (r.rejected || 0), 0);
    const successfulUsers = results.filter(r => r.success).length;
    const failedUsers = results.filter(r => !r.success).length;

    console.log(
      `Auto-trader completed: Processed ${activeUsers.length} users (${successfulUsers} success, ${failedUsers} failed), generated ${totalSignals} signals, executed ${totalExecuted} trades, rejected ${totalRejected}`
    );

    return new Response(
      JSON.stringify({
        success: true,
        processedUsers: activeUsers.length,
        successfulUsers,
        failedUsers,
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
