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
        
        // Fetch strategy performance data
        const { data, error: queryError } = await supabase
          .from('strategy_performance')
          .select('*')
          .order('total_profit', { ascending: false });

        if (queryError) throw queryError;

        setStrategies(data || []);
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
