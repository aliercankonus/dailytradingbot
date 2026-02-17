import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSignalRefresh } from '@/contexts/SignalRefreshContext';
import { useAuth } from '@/contexts/AuthContext';
import { fetchSignalRejections, SIGNAL_REJECTIONS_QUERY_KEY } from '@/hooks/useSignalRejections';
import { fetchMomentumForSymbols, MOMENTUM_STATUS_QUERY_KEY } from '@/hooks/useMomentumStatus';

/**
 * Prefetches signal rejections and momentum status data on every
 * refresh tick so collapsed/unmounted sections render instantly.
 */
export function useSignalDataPrefetch() {
  const queryClient = useQueryClient();
  const { lastRefreshTime } = useSignalRefresh();
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.id) return;

    queryClient.prefetchQuery({
      queryKey: [...SIGNAL_REJECTIONS_QUERY_KEY, user.id, lastRefreshTime],
      queryFn: fetchSignalRejections,
      staleTime: 55000,
    });

    queryClient.prefetchQuery({
      queryKey: [...MOMENTUM_STATUS_QUERY_KEY, lastRefreshTime],
      queryFn: fetchMomentumForSymbols,
      staleTime: 55000,
    });
  }, [lastRefreshTime, user?.id, queryClient]);
}
