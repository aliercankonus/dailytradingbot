import { useState, useEffect } from 'react';
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

export const usePortfolioHistory = (days: number = 30) => {
  const [history, setHistory] = useState<PortfolioSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const { data, error: queryError } = await supabase
        .from('portfolio_performance_history')
        .select('*')
        .gte('snapshot_date', startDate.toISOString().split('T')[0])
        .order('snapshot_date', { ascending: true });

      if (queryError) throw queryError;
      setHistory(data || []);
    } catch (err) {
      console.error('Error fetching portfolio history:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();

    // Refresh every 5 minutes
    const interval = setInterval(fetchHistory, 300000);
    return () => clearInterval(interval);
  }, [days]);

  return { history, loading, error, refetch: fetchHistory };
};
