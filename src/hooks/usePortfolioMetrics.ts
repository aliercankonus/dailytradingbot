import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface PortfolioMetrics {
  realized_pnl: number;
  total_closed_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  largest_win: number;
  largest_loss: number;
  avg_win: number;
  avg_loss: number;
}

const DEFAULT_METRICS: PortfolioMetrics = {
  realized_pnl: 0,
  total_closed_trades: 0,
  winning_trades: 0,
  losing_trades: 0,
  win_rate: 0,
  largest_win: 0,
  largest_loss: 0,
  avg_win: 0,
  avg_loss: 0
};

const fetchPortfolioMetrics = async (): Promise<PortfolioMetrics> => {
  const { data, error } = await supabase
    .from('portfolio_metrics_view')
    .select('*')
    .single();
  
  if (error) {
    // If no data exists yet (no closed trades), return defaults
    if (error.code === 'PGRST116') {
      return DEFAULT_METRICS;
    }
    throw error;
  }
  
  return data as PortfolioMetrics;
};

export const usePortfolioMetrics = () => {
  return useQuery({
    queryKey: ['portfolio-metrics'],
    queryFn: fetchPortfolioMetrics,
    staleTime: 30000, // Data stays fresh for 30 seconds
    gcTime: 300000, // Cache kept for 5 minutes
    refetchInterval: 30000, // Background refetch every 30 seconds
    refetchOnWindowFocus: false, // Don't refetch on window focus (reduces queries)
  });
};
