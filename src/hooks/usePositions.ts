import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Position {
  id: string;
  symbol: string;
  side: string;
  quantity: number;
  entry_price: number;
  current_price: number | null;
  stop_loss: number;
  take_profit: number;
  status: string;
  opened_at: string;
  executed_at?: string | null;
  closed_at?: string | null;
  exit_price?: number | null;
  realized_pnl?: number | null;
  realized_pnl_percent?: number | null;
  close_reason?: string | null;
  trend?: string;
  confidence_score?: number;
  trend_consistency?: number;
  strategy_name?: string;
  opened_by_rebalancer?: boolean;
  closed_by_rebalancer?: boolean;
  is_hedge?: boolean;
  parent_position_id?: string;
  peak_pnl_percent?: number;
  order_type?: string;
  entry_snapshot?: unknown;
}

const fetchPositions = async (): Promise<Position[]> => {
  const { data, error: queryError } = await supabase
    .from('positions')
    .select('*')
    .eq('status', 'active')
    .order('opened_at', { ascending: false });

  if (queryError) throw queryError;
  return data || [];
};

export const POSITIONS_QUERY_KEY = ['positions'];

export const usePositions = () => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: POSITIONS_QUERY_KEY,
    queryFn: fetchPositions,
    staleTime: Infinity,
    gcTime: 60000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });

  return { 
    positions: data || [], 
    loading: isLoading, 
    error: error?.message || null, 
    refetch 
  };
};