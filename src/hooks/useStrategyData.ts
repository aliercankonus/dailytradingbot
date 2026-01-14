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

        // Fetch actual position performance data
        const { data: positionsData, error: positionsError } = await supabase
          .from('positions')
          .select('strategy_name, realized_pnl, status')
          .eq('user_id', user.id)
          .eq('status', 'closed');

        if (positionsError) throw positionsError;

        // Calculate performance by strategy - filter out null/empty strategy names
        const performanceMap = new Map<string, { total_trades: number; winning_trades: number; total_profit: number }>();
        
        (positionsData || []).forEach(position => {
          // Skip positions without a valid strategy name
          if (!position.strategy_name || position.strategy_name.trim() === '') {
            return;
          }
          
          const strategyName = position.strategy_name;
          const current = performanceMap.get(strategyName) || { total_trades: 0, winning_trades: 0, total_profit: 0 };
          
          current.total_trades++;
          if (position.realized_pnl > 0) {
            current.winning_trades++;
          }
          current.total_profit += position.realized_pnl || 0;
          
          performanceMap.set(strategyName, current);
        });

        // Fetch built-in strategies from strategy_performance
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

        // Add strategies that have trades but aren't in builtInStrategies
        const allStrategyNames = new Set(builtInStrategies.map(s => s.strategy_name));
        
        performanceMap.forEach((perf, strategyName) => {
          // Skip if already in the list or if it's "Unknown"
          if (allStrategyNames.has(strategyName) || strategyName === 'Unknown') {
            return;
          }
          
          builtInStrategies.push({
            id: `generated-${strategyName}`,
            strategy_name: strategyName,
            status: 'active',
            total_trades: perf.total_trades,
            winning_trades: perf.winning_trades,
            total_profit: perf.total_profit
          });
        });

        setStrategies(builtInStrategies);
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
