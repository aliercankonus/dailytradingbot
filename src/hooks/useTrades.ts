import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';

interface Trade {
  id: string;
  symbol: string;
  side: string;
  order_type: string;
  quantity: number;
  entry_price: number;
  exit_price: number | null;
  stop_loss: number;
  take_profit: number;
  realized_pnl: number | null;
  realized_pnl_percent: number | null;
  status: string;
  executed_at: string;
  closed_at: string | null;
  strategy_name: string | null;
}

const fetchTrades = async (): Promise<Trade[]> => {
  const { data, error: queryError } = await supabase
    .from('positions')
    .select('*')
    .order('executed_at', { ascending: false });

  if (queryError) throw queryError;
  return data || [];
};

export const TRADES_QUERY_KEY = ['trades'];

export const useTrades = () => {
  const queryClient = useQueryClient();
  
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: TRADES_QUERY_KEY,
    queryFn: fetchTrades,
    staleTime: 30000, // 30 seconds
    gcTime: 300000, // 5 minutes
    refetchInterval: 60000, // Background refetch every 60 seconds
    refetchOnWindowFocus: false,
  });

  // Set up real-time subscription for positions
  useEffect(() => {
    const channel = supabase
      .channel('positions-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'positions'
        },
        () => {
          // Invalidate trades cache on any change
          queryClient.invalidateQueries({ queryKey: TRADES_QUERY_KEY });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return { 
    trades: data || [], 
    loading: isLoading, 
    error: error?.message || null, 
    refetch 
  };
};