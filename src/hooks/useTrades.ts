import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
  close_reason: string | null;
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
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: TRADES_QUERY_KEY,
    queryFn: fetchTrades,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });

  // Real-time updates are handled by useRealtimePositionSync (consolidated channel)

  return { 
    trades: data || [], 
    loading: isLoading, 
    error: error?.message || null, 
    refetch 
  };
};