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
        
        // Fetch built-in strategy performance data
        const { data: builtInData, error: builtInError } = await supabase
          .from('strategy_performance')
          .select('*')
          .order('total_profit', { ascending: false });

        if (builtInError) throw builtInError;

        // Fetch custom strategies
        const { data: customData, error: customError } = await supabase
          .from('custom_strategies')
          .select('*')
          .eq('is_active', true);

        if (customError) throw customError;

        // Transform custom strategies to match Strategy interface
        const customStrategies: Strategy[] = (customData || []).map(cs => ({
          id: cs.id,
          strategy_name: cs.name,
          status: 'active',
          total_trades: 0,
          winning_trades: 0,
          total_profit: 0
        }));

        // Combine both arrays
        const combinedStrategies = [...(builtInData || []), ...customStrategies];
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
