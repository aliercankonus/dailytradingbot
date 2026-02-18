import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { POSITIONS_QUERY_KEY } from './usePositions';
import { TRADES_QUERY_KEY } from './useTrades';
import { PORTFOLIO_METRICS_QUERY_KEY } from './usePortfolioMetrics';

/**
 * Consolidated hook that listens for ALL real-time position changes
 * and invalidates positions, trades, closed-positions, and portfolio-metrics caches.
 * Replaces both the old position-sync and positions-changes channels.
 */
export const useRealtimePositionSync = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    console.log('[RealtimePositionSync] Setting up consolidated real-time subscription');

    const channel = supabase
      .channel('positions-consolidated')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'positions'
        },
        (payload) => {
          console.log('[RealtimePositionSync] Position change detected:', payload.eventType);

          // Invalidate AND force-refetch ALL position-related caches on every change
          queryClient.invalidateQueries({ queryKey: POSITIONS_QUERY_KEY });
          queryClient.invalidateQueries({ queryKey: TRADES_QUERY_KEY });
          queryClient.invalidateQueries({ queryKey: PORTFOLIO_METRICS_QUERY_KEY });
          // Force refetch closed-positions (not just invalidate) because Radix Tabs
          // keeps components mounted but hidden, so invalidation alone may not trigger a re-render
          queryClient.refetchQueries({ queryKey: ['closed-positions'] });
        }
      )
      .subscribe((status) => {
        console.log('[RealtimePositionSync] Subscription status:', status);
      });

    return () => {
      console.log('[RealtimePositionSync] Cleaning up real-time subscription');
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
};