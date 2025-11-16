import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
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

    // Process each user
    for (const userParams of activeUsers) {
      try {
        console.log(`Processing user: ${userParams.user_id}`);

        // Get user's auth token - we need to create a token for the service to act on behalf of the user
        // For autonomous operation, we'll use the service role key
        
        // Call strategy-analyzer for this user by creating a proper auth context
        const { data: userData, error: userError } = await supabase.auth.admin.getUserById(
          userParams.user_id
        );

        if (userError || !userData.user) {
          console.error(`Failed to get user ${userParams.user_id}:`, userError);
          continue;
        }

        // Generate a short-lived access token for this user
        const { data: sessionData, error: sessionError } = await supabase.auth.admin.generateLink({
          type: 'magiclink',
          email: userData.user.email!,
        });

        if (sessionError) {
          console.error(`Failed to generate token for user ${userParams.user_id}:`, sessionError);
          continue;
        }

        // Call strategy-analyzer with the user's context
        const analyzerResponse = await fetch(
          `${supabaseUrl}/functions/v1/strategy-analyzer`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseAnonKey}`,
              "x-user-id": userParams.user_id, // Pass user ID for service-level auth
            },
            body: JSON.stringify({}),
          }
        );

        const analyzerResult = await analyzerResponse.json();
        
        results.push({
          userId: userParams.user_id,
          success: analyzerResponse.ok,
          signals: analyzerResult.signals?.length || 0,
          executed: analyzerResult.executedSignals || 0,
          message: analyzerResult.message,
        });

        console.log(
          `User ${userParams.user_id}: Generated ${analyzerResult.signals?.length || 0} signals, executed ${analyzerResult.executedSignals || 0}`
        );
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

    console.log(
      `Auto-trader completed: Processed ${activeUsers.length} users, generated ${totalSignals} signals, executed ${totalExecuted} trades`
    );

    return new Response(
      JSON.stringify({
        success: true,
        processedUsers: activeUsers.length,
        totalSignals,
        totalExecuted,
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
