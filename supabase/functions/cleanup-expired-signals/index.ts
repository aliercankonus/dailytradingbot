import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // CRON_SECRET validation - protect against unauthorized invocations
  // Accept secret via header (x-cron-secret) or Authorization Bearer token
  const cronSecret = Deno.env.get("CRON_SECRET");
  const providedSecretHeader = req.headers.get("x-cron-secret");
  const authHeader = req.headers.get("authorization");
  const providedSecretBearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const providedSecret = providedSecretHeader || providedSecretBearer;
  
  // Also check if it's a scheduled cron call (Supabase internal scheduler)
  const isScheduledCron = req.headers.get("x-supabase-function-source") === "scheduler";
  
  // Allow if: no CRON_SECRET set (dev), secrets match, or it's a scheduled cron call
  if (cronSecret && !isScheduledCron && providedSecret !== cronSecret) {
    console.error("Unauthorized: Invalid or missing cron secret");
    return new Response(
      JSON.stringify({ success: false, error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    console.log('Starting expired signals cleanup...');

    // Clean up signal_rejection_log - keep only last 500 rows
    // Delete using timestamp cutoff instead of fetching IDs (more efficient)
    console.log('Cleaning up signal_rejection_log table...');
    
    const { count: totalCount } = await supabase
      .from('signal_rejection_log')
      .select('*', { count: 'exact', head: true });

    let rejectionLogsDeleted = 0;
    const MAX_REJECTION_LOGS = 500;
    
    if (totalCount && totalCount > MAX_REJECTION_LOGS) {
      console.log(`Found ${totalCount} rejection logs, need to delete ${totalCount - MAX_REJECTION_LOGS}`);
      
      // Get the timestamp cutoff - the checked_at of the 500th newest log
      const { data: cutoffLog, error: cutoffError } = await supabase
        .from('signal_rejection_log')
        .select('checked_at')
        .order('checked_at', { ascending: false })
        .range(MAX_REJECTION_LOGS - 1, MAX_REJECTION_LOGS - 1)
        .single();

      if (cutoffError) {
        console.error('Error getting cutoff timestamp:', cutoffError);
      } else if (cutoffLog) {
        // Delete all logs older than the cutoff timestamp
        const { error: deleteLogsError, count: deletedCount } = await supabase
          .from('signal_rejection_log')
          .delete({ count: 'exact' })
          .lt('checked_at', cutoffLog.checked_at);

        if (deleteLogsError) {
          console.error('Error deleting old rejection logs:', deleteLogsError);
        } else {
          rejectionLogsDeleted = deletedCount || 0;
          console.log(`Deleted ${rejectionLogsDeleted} old rejection logs, keeping last ${MAX_REJECTION_LOGS}`);
        }
      }
    } else {
      console.log(`Rejection logs count (${totalCount}) is within limit of ${MAX_REJECTION_LOGS}`);
    }

    // Get all expired signals (expires_at < NOW)
    const { data: expiredSignals, error: fetchError } = await supabase
      .from('trading_signals')
      .select('id, symbol, signal_type, created_at, expires_at')
      .lt('expires_at', new Date().toISOString());

    if (fetchError) {
      console.error('Error fetching expired signals:', fetchError);
      throw fetchError;
    }

    if (!expiredSignals || expiredSignals.length === 0) {
      console.log('No expired signals to clean up');
      return new Response(
        JSON.stringify({ 
          success: true, 
          deleted: 0,
          message: 'No expired signals found'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get signals that have ANY positions (active or closed) - can't delete if referenced by ANY position
    const { data: activePositions } = await supabase
      .from('positions')
      .select('signal_id')
      .in('signal_id', expiredSignals.map(s => s.id));

    const referencedIds = new Set(activePositions?.map(p => p.signal_id).filter(Boolean));
    
    // Filter out signals that have active positions
    const signalsToDelete = expiredSignals.filter(s => !referencedIds.has(s.id));

    if (signalsToDelete.length === 0) {
      console.log(`Found ${expiredSignals.length} expired signals but all are referenced by positions`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          deleted: 0,
          skipped: expiredSignals.length,
          rejectionLogsDeleted,
          message: 'All expired signals are referenced by trades (cannot delete due to foreign key constraint)'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Delete expired signals
    const { error: deleteError } = await supabase
      .from('trading_signals')
      .delete()
      .in('id', signalsToDelete.map(s => s.id));

    if (deleteError) {
      console.error('Error deleting expired signals:', deleteError);
      throw deleteError;
    }

    console.log(`Successfully cleaned up ${signalsToDelete.length} expired signals:`, 
      signalsToDelete.map(s => `${s.symbol} (${s.signal_type})`).join(', ')
    );

    return new Response(
      JSON.stringify({ 
        success: true, 
        deleted: signalsToDelete.length,
        skipped: expiredSignals.length - signalsToDelete.length,
        rejectionLogsDeleted,
        signals: signalsToDelete.map(s => ({
          symbol: s.symbol,
          type: s.signal_type,
          expired_seconds_ago: Math.floor((Date.now() - new Date(s.expires_at).getTime()) / 1000)
        }))
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Error in cleanup-expired-signals:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
