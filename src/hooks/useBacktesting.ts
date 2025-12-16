import { useState, useEffect, useRef } from 'react';
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

export interface BacktestProgress {
  status: 'idle' | 'fetching' | 'processing' | 'analyzing' | 'complete';
  totalCandles: number;
  processedCandles: number;
  currentBatch: number;
  totalBatches: number;
  estimatedTimeRemaining: number | null;
  startTime: number | null;
}

const BATCH_SIZE = 50;
const AVG_BATCH_TIME_MS = 400; // Estimated time per batch

export const useBacktesting = () => {
  const [results, setResults] = useState<BacktestResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runningBacktest, setRunningBacktest] = useState(false);
  const [progress, setProgress] = useState<BacktestProgress>({
    status: 'idle',
    totalCandles: 0,
    processedCandles: 0,
    currentBatch: 0,
    totalBatches: 0,
    estimatedTimeRemaining: null,
    startTime: null,
  });
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const resetProgress = () => {
    setProgress({
      status: 'idle',
      totalCandles: 0,
      processedCandles: 0,
      currentBatch: 0,
      totalBatches: 0,
      estimatedTimeRemaining: null,
      startTime: null,
    });
  };

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
    strategyId: string;
    symbol: string;
    startDate: string;
    endDate: string;
    initialCapital: number;
  }) => {
    try {
      setRunningBacktest(true);
      
      // Calculate estimated candles (1h timeframe)
      const startMs = new Date(params.startDate).getTime();
      const endMs = new Date(params.endDate).getTime();
      const hoursInRange = Math.ceil((endMs - startMs) / (1000 * 60 * 60));
      const totalCandles = Math.max(hoursInRange, 1);
      const totalBatches = Math.ceil(totalCandles / BATCH_SIZE);
      const startTime = Date.now();
      
      // Initialize progress
      setProgress({
        status: 'fetching',
        totalCandles,
        processedCandles: 0,
        currentBatch: 0,
        totalBatches,
        estimatedTimeRemaining: totalBatches * AVG_BATCH_TIME_MS,
        startTime,
      });

      // Simulate progress during execution
      let currentBatch = 0;
      progressIntervalRef.current = setInterval(() => {
        currentBatch++;
        if (currentBatch <= totalBatches) {
          const processedCandles = Math.min(currentBatch * BATCH_SIZE, totalCandles);
          const elapsed = Date.now() - startTime;
          const avgTimePerBatch = elapsed / currentBatch;
          const remainingBatches = totalBatches - currentBatch;
          
          setProgress(prev => ({
            ...prev,
            status: currentBatch < totalBatches * 0.1 ? 'fetching' : 
                   currentBatch < totalBatches * 0.9 ? 'processing' : 'analyzing',
            processedCandles,
            currentBatch,
            estimatedTimeRemaining: Math.max(0, remainingBatches * avgTimePerBatch),
          }));
        }
      }, AVG_BATCH_TIME_MS);

      const { data, error: backtestError } = await supabase.functions.invoke('backtest-strategy', {
        body: params,
      });

      // Clear interval and mark complete
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }

      if (backtestError) throw backtestError;
      
      setProgress(prev => ({
        ...prev,
        status: 'complete',
        processedCandles: totalCandles,
        currentBatch: totalBatches,
        estimatedTimeRemaining: 0,
      }));

      // Use returned results directly instead of re-fetching from database
      // (handles case where results aren't saved due to auth issues)
      if (data?.success && data?.results) {
        const result = data.results;
        setResults(prev => [{
          id: result.id || `temp-${Date.now()}`,
          strategy_name: result.strategy_name,
          symbol: result.symbol,
          start_date: result.start_date,
          end_date: result.end_date,
          initial_capital: result.initial_capital,
          final_capital: result.final_capital,
          total_trades: result.total_trades,
          winning_trades: result.winning_trades,
          losing_trades: result.losing_trades,
          win_rate: result.win_rate,
          total_profit: result.total_profit,
          total_loss: result.total_loss,
          net_profit: result.net_profit,
          max_drawdown: result.max_drawdown,
          sharpe_ratio: result.sharpe_ratio,
          profit_factor: result.profit_factor,
          avg_win: result.avg_win,
          avg_loss: result.avg_loss,
          largest_win: result.largest_win,
          largest_loss: result.largest_loss,
          results_data: result.results_data,
          created_at: result.created_at || new Date().toISOString(),
        }, ...prev.slice(0, 9)]);
      } else {
        // Fallback to fetching from database
        await fetchResults();
      }
      return data;
    } catch (err) {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      resetProgress();
      console.error('Error running backtest:', err);
      throw err;
    } finally {
      setRunningBacktest(false);
    }
  };

  useEffect(() => {
    fetchResults();
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, []);

  return { results, loading, error, runningBacktest, runBacktest, progress };
};