import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface PortfolioSnapshot {
  id: string;
  snapshot_date: string;
  snapshot_time: string;
  portfolio_value: number;
  initial_portfolio_value: number;
  realized_pnl: number;
  unrealized_pnl: number;
  total_pnl: number;
  total_return_percent: number;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  open_positions: number;
  max_open_positions: number;
  avg_win: number;
  avg_loss: number;
  profit_factor: number;
  largest_win: number;
  largest_loss: number;
  max_drawdown: number;
  daily_loss: number;
  consecutive_losses: number;
  paper_trading_mode: boolean;
}

const fetchPortfolioHistory = async (days: number): Promise<PortfolioSnapshot[]> => {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const { data, error } = await supabase
    .from('portfolio_performance_history')
    .select('*')
    .gte('snapshot_date', startDate.toISOString().split('T')[0])
    .order('snapshot_date', { ascending: true });

  if (error) throw error;
  return data || [];
};

export const usePortfolioHistory = (days: number = 30) => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['portfolio-history', days],
    queryFn: () => fetchPortfolioHistory(days),
    staleTime: 300000, // Data stays fresh for 5 minutes
    gcTime: 600000, // Cache kept for 10 minutes
    refetchInterval: 300000, // Background refetch every 5 minutes
    refetchOnWindowFocus: false, // Don't refetch on window focus
  });

  return {
    history: data || [],
    loading: isLoading,
    error: error?.message || null,
    refetch
  };
};
