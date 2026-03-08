import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface LtfMicroData {
  symbol: string;
  score5m: number;
  direction5m: string;
  score1m: number;
  direction1m: string;
  ltfAlignment: number;
  entryTimingScore: number;
  microTrendConfirms: boolean;
  recentCandlePattern: string;
  isAccelerating5m: boolean;
  isReverting1m: boolean;
}

export function useLtfMicroMomentum() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['ltf-micro-momentum', user?.id],
    queryFn: async (): Promise<LtfMicroData[]> => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('trend_snapshots')
        .select('symbol, snapshot_data')
        .eq('user_id', user.id);

      if (error) {
        console.error('Error fetching LTF micro data:', error);
        throw error;
      }

      return (data || [])
        .map(row => {
          const sd = row.snapshot_data as Record<string, any> | null;
          const ltf = sd?.ltfMicroMomentum;
          if (!ltf) return null;
          return {
            symbol: row.symbol,
            score5m: ltf.score5m ?? 0,
            direction5m: ltf.direction5m ?? 'N/A',
            score1m: ltf.score1m ?? 0,
            direction1m: ltf.direction1m ?? 'N/A',
            ltfAlignment: ltf.ltfAlignment ?? 0,
            entryTimingScore: ltf.entryTimingScore ?? 0,
            microTrendConfirms: ltf.microTrendConfirms ?? false,
            recentCandlePattern: ltf.recentCandlePattern ?? 'none',
            isAccelerating5m: ltf.isAccelerating5m ?? false,
            isReverting1m: ltf.isReverting1m ?? false,
          } as LtfMicroData;
        })
        .filter(Boolean) as LtfMicroData[];
    },
    enabled: !!user?.id,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  });
}
