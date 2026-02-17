import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSignalRefresh } from '@/contexts/SignalRefreshContext';
import { useAuth } from '@/contexts/AuthContext';
import { fetchSignalRejections, SIGNAL_REJECTIONS_QUERY_KEY } from '@/hooks/useSignalRejections';
import { fetchMomentumForSymbols, MOMENTUM_STATUS_QUERY_KEY } from '@/hooks/useMomentumStatus';
import { supabase } from '@/integrations/supabase/client';

/**
 * Prefetches signal rejections, blocked signals, and momentum status data
 * on every refresh tick so collapsed/unmounted sections render instantly.
 */
export function useSignalDataPrefetch() {
  const queryClient = useQueryClient();
  const { lastRefreshTime } = useSignalRefresh();
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.id) return;

    // Prefetch signal rejections (used by SignalRejectionReasons)
    queryClient.prefetchQuery({
      queryKey: [...SIGNAL_REJECTIONS_QUERY_KEY, user.id, lastRefreshTime],
      queryFn: fetchSignalRejections,
      staleTime: 55000,
    });

    // Prefetch momentum status (used by MomentumStatusDashboard)
    queryClient.prefetchQuery({
      queryKey: [...MOMENTUM_STATUS_QUERY_KEY, lastRefreshTime],
      queryFn: fetchMomentumForSymbols,
      staleTime: 55000,
    });

    // Prefetch blocked signals (used by SignalRejectionMonitor)
    const userId = user.id;
    queryClient.prefetchQuery({
      queryKey: ['blocked-signals', userId, 100, lastRefreshTime],
      queryFn: async () => {
        const { data, error } = await supabase
          .from('signal_rejection_log')
          .select('id, symbol, rejection_reason, checked_at, filters_status, trend_data')
          .eq('user_id', userId)
          .order('checked_at', { ascending: false })
          .limit(200);

        if (error) throw error;

        return (data || []).map((row) => ({
          id: row.id,
          symbol: row.symbol,
          rejection_reason: row.rejection_reason,
          checked_at: row.checked_at,
          filters_status: row.filters_status,
          trend_data: row.trend_data,
        }));
      },
      staleTime: 55000,
    });
  }, [lastRefreshTime, user?.id, queryClient]);
}
