import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface BacktestResult {
  id: string;
  strategy_name: string;
  symbol: string;
  start_date: string;
  end_date: string;
  initial_capital: number;
  final_capital: number;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  total_profit: number;
  total_loss: number;
  net_profit: number;
  max_drawdown: number;
  sharpe_ratio: number;
  profit_factor: number;
  avg_win: number;
  avg_loss: number;
  largest_win: number;
  largest_loss: number;
  results_data: any;
  created_at: string;
}

export const useBacktesting = () => {
  const [results, setResults] = useState<BacktestResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runningBacktest, setRunningBacktest] = useState(false);

  const fetchResults = async () => {
    try {
      setLoading(true);
      const { data, error: queryError } = await supabase
        .from('backtesting_results')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (queryError) throw queryError;
      setResults(data || []);
    } catch (err) {
      console.error('Error fetching backtest results:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch results');
    } finally {
      setLoading(false);
    }
  };

  const runBacktest = async (params: {
    symbol: string;
    startDate: string;
    endDate: string;
    initialCapital: number;
    strategyName: string;
  }) => {
    try {
      setRunningBacktest(true);
      const { data, error: backtestError } = await supabase.functions.invoke('backtest-strategy', {
        body: params,
      });

      if (backtestError) throw backtestError;
      await fetchResults();
      return data;
    } catch (err) {
      console.error('Error running backtest:', err);
      throw err;
    } finally {
      setRunningBacktest(false);
    }
  };

  useEffect(() => {
    fetchResults();
  }, []);

  return { results, loading, error, runningBacktest, runBacktest };
};