import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface RegimeTransitionEntry {
  symbol: string;
  regime: string;
  effective_regime: string | null;
  adx: number | null;
  adx_slope: number | null;
  trend_direction: string | null;
  recorded_at: string;
  isDivergent: boolean;
}

export const useRegimeTransitions = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['regime-transitions', user?.id],
    queryFn: async (): Promise<RegimeTransitionEntry[]> => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('market_regime_history')
        .select('symbol, regime, effective_regime, adx, adx_slope, trend_direction, recorded_at')
        .gte('recorded_at', twoHoursAgo)
        .order('recorded_at', { ascending: false })
        .limit(200);

      if (error) throw error;

      // Deduplicate: keep only transitions (regime changes per symbol)
      const transitions: RegimeTransitionEntry[] = [];
      const lastSeen = new Map<string, string>();

      for (const row of data || []) {
        const key = `${row.symbol}`;
        const stateKey = `${row.regime}|${row.effective_regime}`;
        
        if (lastSeen.get(key) !== stateKey) {
          lastSeen.set(key, stateKey);
          transitions.push({
            symbol: row.symbol,
            regime: row.regime,
            effective_regime: row.effective_regime,
            adx: row.adx,
            adx_slope: row.adx_slope,
            trend_direction: row.trend_direction,
            recorded_at: row.recorded_at,
            isDivergent: row.effective_regime !== null && row.regime !== row.effective_regime,
          });
        }
      }

      return transitions;
    },
    enabled: !!user?.id,
    refetchInterval: 60000,
    staleTime: 55000,
    gcTime: 300000,
    refetchOnWindowFocus: false,
    placeholderData: (prev: RegimeTransitionEntry[] | undefined) => prev,
  });
};
