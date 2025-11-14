import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook to automatically sync current_open_trades counter with actual active positions
 * This prevents stale counters from blocking auto-execution
 */
export const useSyncTradeCounters = () => {
  useEffect(() => {
    const syncCounters = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Count actual active positions
        const { count: activePositionsCount, error: countError } = await supabase
          .from('positions')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('status', 'active');

        if (countError) {
          console.error('Error counting active positions:', countError);
          return;
        }

        const actualOpenTrades = activePositionsCount || 0;

        // Get current risk parameters
        const { data: riskParams, error: fetchError } = await supabase
          .from('risk_parameters')
          .select('id, current_open_trades')
          .eq('user_id', user.id)
          .maybeSingle();

        if (fetchError) {
          console.error('Error fetching risk parameters:', fetchError);
          return;
        }

        // Update if there's a mismatch
        if (riskParams && riskParams.current_open_trades !== actualOpenTrades) {
          console.log(
            `[Startup] Syncing current_open_trades from ${riskParams.current_open_trades} to ${actualOpenTrades}`
          );
          
          const { error: updateError } = await supabase
            .from('risk_parameters')
            .update({ 
              current_open_trades: actualOpenTrades,
              updated_at: new Date().toISOString()
            })
            .eq('user_id', user.id);

          if (updateError) {
            console.error('Error updating current_open_trades:', updateError);
          } else {
            console.log('[Startup] Trade counter synchronized successfully');
          }
        } else {
          console.log(
            `[Startup] Trade counter already in sync: ${actualOpenTrades} open trades`
          );
        }
      } catch (error) {
        console.error('Error in trade counter sync:', error);
      }
    };

    // Run immediately on mount
    syncCounters();

    // Also sync periodically (every 5 minutes) to catch any drift
    const interval = setInterval(syncCounters, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);
};
