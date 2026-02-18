import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook that listens for real-time position changes and invalidates cache
 * Triggers instant updates when positions open, close, or update
 */
export const useRealtimePositionSync = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    console.log('[RealtimePositionSync] Setting up real-time subscription for position updates');

    const channel = supabase
      .channel('position-sync')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'positions'
        },
        (payload) => {
          console.log('[RealtimePositionSync] New position opened:', payload);
          
          // Invalidate positions cache to trigger immediate refetch
          queryClient.invalidateQueries({ queryKey: ['positions'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'positions'
        },
        (payload) => {
          console.log('[RealtimePositionSync] Position updated:', payload);
          
          // Invalidate positions cache to trigger immediate refetch
          queryClient.invalidateQueries({ queryKey: ['positions'] });
          
          // If position was closed, also invalidate portfolio metrics and closed positions
          if (payload.new.status === 'closed') {
            queryClient.invalidateQueries({ queryKey: ['portfolio-metrics'] });
            queryClient.invalidateQueries({ queryKey: ['closed-positions'] });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'positions'
        },
        (payload) => {
          console.log('[RealtimePositionSync] Position deleted:', payload);
          
          // Invalidate positions cache to trigger immediate refetch
          queryClient.invalidateQueries({ queryKey: ['positions'] });
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
