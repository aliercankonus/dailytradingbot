import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.84.0";
import { createLogger } from "../_shared/logging.ts";
import { detectStrategyType, isMomentumStrategy, isMeanReversionStrategy } from "../_shared/constants.ts";

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
  strategyBreakdown?: {
    momentum?: number;
    meanReversion?: number;
    trendFollowing?: number;
    other?: number;
  };
}

serve(async (req) => {
  const logger = createLogger("auto-trader");
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // CRON_SECRET validation - protect against unauthorized invocations
  // Accept secret via header (x-cron-secret), ANY Authorization Bearer token (internal pg_cron / scheduler), or internal scheduler header
  const cronSecret = Deno.env.get("CRON_SECRET");
  const providedSecretHeader = req.headers.get("x-cron-secret");
  const authHeader = req.headers.get("authorization");
  
  // Detect Supabase internal scheduler calls
  const isScheduledCron = req.headers.get("x-supabase-function-source") === "scheduler";
  
  // Allow if:
  // - no CRON_SECRET set (dev)
  // - it's a scheduled cron call
  // - any Authorization Bearer token is present (used by pg_cron with anon key)
  // - x-cron-secret header matches the configured secret
  if (
    cronSecret &&
    !isScheduledCron &&
    !authHeader &&
    providedSecretHeader !== cronSecret
  ) {
    logger.error("Unauthorized: Invalid or missing cron secret");
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

    logger.boot();

    // Fetch all users with trading enabled
    const { data: activeUsers, error: usersError } = await supabase
      .from("risk_parameters")
      .select("user_id, is_trading_enabled, max_open_trades, current_open_trades")
      .eq("is_trading_enabled", true);

    if (usersError) {
      logger.error(`Error fetching active users: ${usersError.message}`);
      throw usersError;
    }

    if (!activeUsers || activeUsers.length === 0) {
      logger.info("No users with trading enabled");
      return new Response(
        JSON.stringify({
          success: true,
          message: "No active users to process",
          processedUsers: 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    logger.info(`Processing ${activeUsers.length} users with trading enabled`);

    // Process users in parallel with concurrency limit to avoid overwhelming the system
    const BATCH_SIZE = 3; // Process 3 users at a time
    const results: UserProcessResult[] = [];

    for (let i = 0; i < activeUsers.length; i += BATCH_SIZE) {
      const batch = activeUsers.slice(i, i + BATCH_SIZE);
      
      const batchResults = await Promise.all(
        batch.map(async (userParams): Promise<UserProcessResult> => {
          const userLogger = logger.forUser(userParams.user_id);
          
          try {
            userLogger.info("Processing user");
            
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
              userLogger.error(`Strategy analyzer error: ${errorMessage}`);
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
            
            // Extract strategy type breakdown from analyzer result if available
            const signalDetails = analyzerResult?.signalDetails || [];
            const strategyBreakdown = {
              momentum: 0,
              meanReversion: 0,
              trendFollowing: 0,
              other: 0,
            };
            
            // Classify executed signals by strategy type
            for (const detail of signalDetails) {
              const strategyType = detectStrategyType(detail.strategyId || '', detail.strategyName || '');
              if (strategyType === 'MOMENTUM') {
                strategyBreakdown.momentum++;
              } else if (strategyType === 'MEAN_REVERSION') {
                strategyBreakdown.meanReversion++;
              } else if (strategyType === 'TREND_FOLLOWING') {
                strategyBreakdown.trendFollowing++;
              } else {
                strategyBreakdown.other++;
              }
            }

            userLogger.summary(`Generated ${signalsGenerated} signals, executed ${signalsExecuted}, rejected ${rejected}`);
            if (signalsExecuted > 0) {
              userLogger.info(`Strategy breakdown: Momentum=${strategyBreakdown.momentum}, MeanReversion=${strategyBreakdown.meanReversion}, TrendFollow=${strategyBreakdown.trendFollowing}, Other=${strategyBreakdown.other}`);
            }

            return {
              userId: userParams.user_id,
              success: true,
              signals: signalsGenerated,
              executed: signalsExecuted,
              rejected,
              message: analyzerResult?.message || 'Auto-trader processing completed',
              strategyBreakdown: signalsExecuted > 0 ? strategyBreakdown : undefined,
            };
          } catch (userError) {
            const errorMessage = userError instanceof Error ? userError.message : "Unknown error";
            userLogger.error(`Error processing: ${errorMessage}`);
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
    
    // Aggregate strategy breakdown across all users
    const aggregateStrategyBreakdown = {
      momentum: results.reduce((sum, r) => sum + (r.strategyBreakdown?.momentum || 0), 0),
      meanReversion: results.reduce((sum, r) => sum + (r.strategyBreakdown?.meanReversion || 0), 0),
      trendFollowing: results.reduce((sum, r) => sum + (r.strategyBreakdown?.trendFollowing || 0), 0),
      other: results.reduce((sum, r) => sum + (r.strategyBreakdown?.other || 0), 0),
    };

    logger.summary(
      `Completed: ${activeUsers.length} users (${successfulUsers} success, ${failedUsers} failed), ${totalSignals} signals, ${totalExecuted} executed, ${totalRejected} rejected`
    );
    
    if (totalExecuted > 0) {
      logger.info(`Strategy breakdown: Momentum=${aggregateStrategyBreakdown.momentum}, MeanReversion=${aggregateStrategyBreakdown.meanReversion}, TrendFollow=${aggregateStrategyBreakdown.trendFollowing}, Other=${aggregateStrategyBreakdown.other}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        processedUsers: activeUsers.length,
        successfulUsers,
        failedUsers,
        totalSignals,
        totalExecuted,
        totalRejected,
        strategyBreakdown: totalExecuted > 0 ? aggregateStrategyBreakdown : undefined,
        results,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    logger.error(`Auto-trader error: ${error instanceof Error ? error.message : "Unknown error"}`);
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
