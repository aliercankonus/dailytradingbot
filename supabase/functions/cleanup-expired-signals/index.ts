import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    console.log('Starting expired signals cleanup...');

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

    // Get signals that have ANY trades (open or closed) - can't delete if referenced by ANY trade
    const { data: activeTrades } = await supabase
      .from('trades')
      .select('signal_id')
      .in('signal_id', expiredSignals.map(s => s.id));

    const referencedIds = new Set(activeTrades?.map(t => t.signal_id).filter(Boolean));
    
    // Filter out signals that have active trades
    const signalsToDelete = expiredSignals.filter(s => !referencedIds.has(s.id));

    if (signalsToDelete.length === 0) {
      console.log(`Found ${expiredSignals.length} expired signals but all are referenced by trades`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          deleted: 0,
          skipped: expiredSignals.length,
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

    // Clean up signal_rejection_log - keep only last 200 rows
    console.log('Cleaning up signal_rejection_log table...');
    
    // Get total count of rejection logs
    const { count: totalCount } = await supabase
      .from('signal_rejection_log')
      .select('*', { count: 'exact', head: true });

    let rejectionLogsDeleted = 0;
    
    if (totalCount && totalCount > 200) {
      // Get the IDs of rows to delete (all except the last 200)
      const rowsToDelete = totalCount - 200;
      
      const { data: oldestLogs, error: fetchOldestError } = await supabase
        .from('signal_rejection_log')
        .select('id')
        .order('checked_at', { ascending: true })
        .limit(rowsToDelete);

      if (fetchOldestError) {
        console.error('Error fetching oldest rejection logs:', fetchOldestError);
      } else if (oldestLogs && oldestLogs.length > 0) {
        const { error: deleteLogsError } = await supabase
          .from('signal_rejection_log')
          .delete()
          .in('id', oldestLogs.map(log => log.id));

        if (deleteLogsError) {
          console.error('Error deleting old rejection logs:', deleteLogsError);
        } else {
          rejectionLogsDeleted = oldestLogs.length;
          console.log(`Deleted ${rejectionLogsDeleted} old rejection logs, keeping last 200`);
        }
      }
    } else {
      console.log(`Rejection logs count (${totalCount}) is within limit of 200`);
    }

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
