import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface Signal {
  id: string;
  symbol: string;
  signal_type: string;
  trend: string;
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  risk_reward_ratio: number;
  confidence_score: number;
  reason: string;
  created_at: string;
  expires_at: string;
  indicators: any;
  strategy_name?: string;
}

export const useSignals = () => {
  const { data: signals = [], isLoading: loading, error: queryError } = useQuery({
    queryKey: ['trading-signals'],
    queryFn: async (): Promise<Signal[]> => {
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const now = new Date().toISOString();

      const { data: activePositions } = await supabase
        .from('positions')
        .select('signal_id')
        .eq('status', 'active');

      const usedSignalIds = new Set(activePositions?.map(p => p.signal_id).filter(Boolean));

      const { data, error } = await supabase
        .from('trading_signals')
        .select('*')
        .gte('created_at', thirtyMinutesAgo)
        .gt('expires_at', now)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).filter(signal => !usedSignalIds.has(signal.id));
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
    structuralSharing: true,
  });

  return { signals, loading, error: queryError?.message || null };
};
