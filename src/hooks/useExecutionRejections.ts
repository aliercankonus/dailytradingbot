import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useSignalRefresh } from '@/contexts/SignalRefreshContext';

export interface ExecutionRejection {
  symbol: string;
  rejection_reason: string;
  checked_at: string;
  filters_status: Record<string, unknown> | null;
}

/**
 * Hook to fetch the latest execution rejection for each symbol.
 * This helps explain why signals are waiting for execution.
 */
export function useExecutionRejections() {
  const { user } = useAuth();
  const { lastRefreshTime } = useSignalRefresh();

  return useQuery({
    queryKey: ['execution-rejections', user?.id, lastRefreshTime],
    queryFn: async (): Promise<Map<string, ExecutionRejection>> => {
      if (!user?.id) return new Map();

      // Fetch execution-stage rejections from last 30 minutes
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('signal_rejection_log')
        .select('symbol, rejection_reason, checked_at, filters_status')
        .eq('user_id', user.id)
        .gte('checked_at', thirtyMinutesAgo)
        .like('rejection_reason', 'EXECUTION:%')
        .order('checked_at', { ascending: false });

      if (error) {
        console.error('Error fetching execution rejections:', error);
        throw error;
      }

      // Group by symbol, keeping only the latest rejection per symbol
      const latestBySymbol = new Map<string, ExecutionRejection>();
      for (const row of data || []) {
        if (!latestBySymbol.has(row.symbol)) {
          latestBySymbol.set(row.symbol, {
            symbol: row.symbol,
            rejection_reason: row.rejection_reason,
            checked_at: row.checked_at,
            filters_status: row.filters_status as Record<string, unknown> | null,
          });
        }
      }

      return latestBySymbol;
    },
    enabled: !!user?.id,
    staleTime: 55000,
    refetchOnWindowFocus: false,
  });
}
