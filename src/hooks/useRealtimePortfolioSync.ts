import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PORTFOLIO_METRICS_QUERY_KEY } from './usePortfolioMetrics';

/**
 * Hook that listens for real-time trade closures and invalidates portfolio cache
 * This ensures portfolio metrics update instantly when trades close
 */
export const useRealtimePortfolioSync = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    console.log('[RealtimePortfolioSync] Setting up real-time subscription for trade updates');

    const channel = supabase
      .channel('portfolio-sync')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'trades',
          filter: 'status=eq.closed'
        },
        (payload) => {
          console.log('[RealtimePortfolioSync] Trade closed, invalidating portfolio cache:', payload);
          
          // Invalidate portfolio metrics cache to trigger immediate refetch
          queryClient.invalidateQueries({ 
            queryKey: PORTFOLIO_METRICS_QUERY_KEY 
          });
        }
      )
      .subscribe((status) => {
        console.log('[RealtimePortfolioSync] Subscription status:', status);
      });

    return () => {
      console.log('[RealtimePortfolioSync] Cleaning up real-time subscription');
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
};
