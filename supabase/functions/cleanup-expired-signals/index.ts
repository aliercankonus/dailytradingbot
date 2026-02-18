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

    // Clean up market_regime_history - keep only last 7 days
    console.log('Cleaning up market_regime_history table (keeping last 7 days)...');
    const sevenDaysAgoRegime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    
    const { error: regimeDeleteError, count: regimeDeleted } = await supabase
      .from('market_regime_history')
      .delete({ count: 'exact' })
      .lt('recorded_at', sevenDaysAgoRegime);

    if (regimeDeleteError) {
      console.error('Error deleting old market regime history:', regimeDeleteError);
    } else {
      console.log(`Deleted ${regimeDeleted || 0} market regime history records older than 7 days`);
    }

    // Clean up momentum_analysis - keep only last 7 days
    console.log('Cleaning up momentum_analysis table (keeping last 7 days)...');
    
    const { error: momentumDeleteError, count: momentumDeleted } = await supabase
      .from('momentum_analysis')
      .delete({ count: 'exact' })
      .lt('recorded_at', sevenDaysAgoRegime);

    if (momentumDeleteError) {
      console.error('Error deleting old momentum analysis:', momentumDeleteError);
    } else {
      console.log(`Deleted ${momentumDeleted || 0} momentum analysis records older than 7 days`);
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Clean up shadow_mode_signals - keep only last 7 days
    console.log('Cleaning up shadow_mode_signals table (keeping last 7 days)...');
    
    const { error: shadowDeleteError, count: shadowDeleted } = await supabase
      .from('shadow_mode_signals')
      .delete({ count: 'exact' })
      .lt('created_at', sevenDaysAgo);

    if (shadowDeleteError) {
      console.error('Error deleting old shadow mode signals:', shadowDeleteError);
    } else {
      console.log(`Deleted ${shadowDeleted || 0} shadow mode signals older than 7 days`);
    }

    // Clean up signal_rejection_log - prune entries older than 6 hours
    console.log('Cleaning up signal_rejection_log table (keeping last 6h)...');
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    
    const { error: rejectionDeleteError, count: rejectionDeletedCount } = await supabase
      .from('signal_rejection_log')
      .delete({ count: 'exact' })
      .lt('checked_at', sixHoursAgo);

    let rejectionLogsDeleted = 0;
    if (rejectionDeleteError) {
      console.error('Error deleting old rejection logs:', rejectionDeleteError);
    } else {
      rejectionLogsDeleted = rejectionDeletedCount || 0;
      console.log(`Deleted ${rejectionLogsDeleted} rejection logs older than 6h`);
    }

    // ============================================================
    // PHASE 3: PRESERVE EXECUTED SIGNALS, ONLY DELETE EXPIRED ACTIVE ONES
    // Signals with status='executed' are kept for 30 days for traceability
    // ============================================================
    
    // Get all expired signals that are NOT executed (status != 'executed' or status is null/active)
    const { data: expiredSignals, error: fetchError } = await supabase
      .from('trading_signals')
      .select('id, symbol, signal_type, created_at, expires_at, status')
      .lt('expires_at', new Date().toISOString())
      .or('status.is.null,status.eq.active');  // Only get non-executed signals

    if (fetchError) {
      console.error('Error fetching expired signals:', fetchError);
      throw fetchError;
    }

    // Clean up old executed signals (older than 30 days) - separate cleanup
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { error: oldExecutedError, count: oldExecutedDeleted } = await supabase
      .from('trading_signals')
      .delete({ count: 'exact' })
      .eq('status', 'executed')
      .lt('executed_at', thirtyDaysAgo);

    if (oldExecutedError) {
      console.error('Error deleting old executed signals:', oldExecutedError);
    } else {
      console.log(`Deleted ${oldExecutedDeleted || 0} executed signals older than 30 days`);
    }

    if (!expiredSignals || expiredSignals.length === 0) {
      console.log('No expired active signals to clean up');
      return new Response(
        JSON.stringify({ 
          success: true, 
          deleted: 0,
          oldExecutedDeleted: oldExecutedDeleted || 0,
          message: 'No expired active signals found'
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
          oldExecutedDeleted: oldExecutedDeleted || 0,
          rejectionLogsDeleted,
          message: 'All expired signals are referenced by trades (cannot delete due to foreign key constraint)'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Mark expired signals as 'expired' status instead of deleting (for audit trail)
    // Then delete only those that are truly orphaned
    const { error: updateExpiredError } = await supabase
      .from('trading_signals')
      .update({ status: 'expired' })
      .in('id', signalsToDelete.map(s => s.id));

    if (updateExpiredError) {
      console.error('Error marking signals as expired:', updateExpiredError);
    }

    // Delete expired signals that are not referenced
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
        oldExecutedDeleted: oldExecutedDeleted || 0,
        rejectionLogsDeleted,
        marketRegimeDeleted: regimeDeleted || 0,
        momentumAnalysisDeleted: momentumDeleted || 0,
        shadowSignalsDeleted: shadowDeleted || 0,
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
