import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';

interface Position {
  id: string;
  symbol: string;
  side: string;
  quantity: number;
  entry_price: number;
  current_price: number | null;
  stop_loss: number;
  take_profit: number;
  unrealized_pnl: number | null;
  unrealized_pnl_percent: number | null;
  status: string;
  opened_at: string;
  trend?: string;
  confidence_score?: number;
  trend_consistency?: number;
  strategy_name?: string;
  opened_by_rebalancer?: boolean;
  closed_by_rebalancer?: boolean;
}

const fetchPositions = async (): Promise<Position[]> => {
  const { data, error: queryError } = await supabase
    .from('positions')
    .select(`
      *,
      trades!inner(strategy_name)
    `)
    .eq('status', 'active')
    .order('opened_at', { ascending: false });

  if (queryError) throw queryError;
  
  // Flatten the joined data
  const formattedData = (data || []).map(pos => ({
    ...pos,
    strategy_name: pos.trades?.strategy_name
  }));
  
  return formattedData;
};

export const POSITIONS_QUERY_KEY = ['positions'];

export const usePositions = () => {
  const queryClient = useQueryClient();
  
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: POSITIONS_QUERY_KEY,
    queryFn: fetchPositions,
    staleTime: 10000, // Data stays fresh for 10 seconds (positions change frequently)
    gcTime: 60000, // Cache kept for 1 minute
    refetchInterval: 30000, // Background refetch every 30 seconds
    refetchOnWindowFocus: false,
  });

  // Monitor positions every 30 seconds
  useEffect(() => {
    const monitorInterval = setInterval(async () => {
      await supabase.functions.invoke('monitor-positions');
      // Invalidate cache after monitoring to fetch updated positions
      queryClient.invalidateQueries({ queryKey: POSITIONS_QUERY_KEY });
    }, 30000);

    return () => clearInterval(monitorInterval);
  }, [queryClient]);

  return { 
    positions: data || [], 
    loading: isLoading, 
    error: error?.message || null, 
    refetch 
  };
};