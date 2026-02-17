import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useRiskParametersContext } from '@/contexts/RiskParametersContext';

/**
 * Hook to automatically sync current_open_trades counter with actual active positions.
 * Uses shared RiskParametersContext instead of duplicate risk_parameters fetch.
 */
export const useSyncTradeCounters = () => {
  const { riskParams } = useRiskParametersContext();

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

        // Use shared context value instead of separate fetch
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

    // Run once riskParams are available
    if (riskParams) {
      syncCounters();
    }

    // Sync periodically (every 5 minutes)
    const interval = setInterval(syncCounters, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [riskParams]);
};
