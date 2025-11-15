import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Strategy {
  id: string;
  strategy_name: string;
  status: string;
  total_trades: number;
  winning_trades: number;
  total_profit: number;
}

export const useStrategyData = () => {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStrategies = async () => {
      try {
        setLoading(true);
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setStrategies([]);
          setLoading(false);
          return;
        }

        // Fetch actual trade performance data
        const { data: tradesData, error: tradesError } = await supabase
          .from('trades')
          .select('strategy_name, profit_loss, status')
          .eq('user_id', user.id)
          .eq('status', 'closed');

        if (tradesError) throw tradesError;

        // Calculate performance by strategy
        const performanceMap = new Map<string, { total_trades: number; winning_trades: number; total_profit: number }>();
        
        (tradesData || []).forEach(trade => {
          const strategyName = trade.strategy_name || 'Unknown';
          const current = performanceMap.get(strategyName) || { total_trades: 0, winning_trades: 0, total_profit: 0 };
          
          current.total_trades++;
          if (trade.profit_loss > 0) {
            current.winning_trades++;
          }
          current.total_profit += trade.profit_loss || 0;
          
          performanceMap.set(strategyName, current);
        });

        // Fetch custom strategies
        const { data: customData, error: customError } = await supabase
          .from('custom_strategies')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true);

        if (customError) throw customError;

        // Fetch built-in strategies (from strategy_performance or fallback)
        const { data: builtInData, error: builtInError } = await supabase
          .from('strategy_performance')
          .select('*')
          .eq('user_id', user.id)
          .order('total_profit', { ascending: false });

        if (builtInError) throw builtInError;

        // Merge built-in strategies with actual performance data
        const builtInStrategies: Strategy[] = (builtInData || []).map(s => {
          const performance = performanceMap.get(s.strategy_name);
          return {
            id: s.id,
            strategy_name: s.strategy_name,
            status: s.status,
            total_trades: performance?.total_trades || 0,
            winning_trades: performance?.winning_trades || 0,
            total_profit: performance?.total_profit || 0
          };
        });

        // Transform custom strategies and add performance data
        const customStrategies: Strategy[] = (customData || []).map(cs => {
          const performance = performanceMap.get(cs.name);
          return {
            id: cs.id,
            strategy_name: cs.name,
            status: 'active',
            total_trades: performance?.total_trades || 0,
            winning_trades: performance?.winning_trades || 0,
            total_profit: performance?.total_profit || 0
          };
        });

        // Add strategies that have trades but aren't in builtInStrategies OR customStrategies
        const allStrategyNames = new Set([
          ...builtInStrategies.map(s => s.strategy_name),
          ...customStrategies.map(s => s.strategy_name)
        ]);
        
        performanceMap.forEach((perf, strategyName) => {
          if (!allStrategyNames.has(strategyName)) {
            builtInStrategies.push({
              id: `generated-${strategyName}`,
              strategy_name: strategyName,
              status: 'active',
              total_trades: perf.total_trades,
              winning_trades: perf.winning_trades,
              total_profit: perf.total_profit
            });
          }
        });

        // Combine both arrays
        const combinedStrategies = [...builtInStrategies, ...customStrategies];
        setStrategies(combinedStrategies);
      } catch (err) {
        console.error('Error fetching strategies:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch strategies');
      } finally {
        setLoading(false);
      }
    };

    fetchStrategies();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchStrategies, 30000);

    return () => clearInterval(interval);
  }, []);

  return { strategies, loading, error };
};
