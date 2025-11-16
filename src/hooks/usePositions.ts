import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Position {
  id: string;
  symbol: string;
  side: string;
  quantity: number;
  entry_price: number;
  current_price: number | null;
  stop_loss: number;
  take_profit: number;
  unrealized_pnl: number | null;
  unrealized_pnl_percent: number | null;
  status: string;
  opened_at: string;
  trend?: string;
  confidence_score?: number;
  strategy_name?: string;
  opened_by_rebalancer?: boolean;
  closed_by_rebalancer?: boolean;
}

export const usePositions = () => {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPositions = async () => {
    try {
      setLoading(true);
      const { data, error: queryError } = await supabase
        .from('positions')
        .select(`
          *,
          trades!inner(strategy_name)
        `)
        .eq('status', 'active')
        .order('opened_at', { ascending: false });

      if (queryError) throw queryError;
      
      // Flatten the joined data
      const formattedData = (data || []).map(pos => ({
        ...pos,
        strategy_name: pos.trades?.strategy_name
      }));
      
      setPositions(formattedData);
    } catch (err) {
      console.error('Error fetching positions:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch positions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPositions();
    
    // Monitor positions every 5 seconds
    const monitorInterval = setInterval(async () => {
      await supabase.functions.invoke('monitor-positions');
      fetchPositions();
    }, 5000);

    return () => clearInterval(monitorInterval);
  }, []);

  return { positions, loading, error, refetch: fetchPositions };
};