import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Trade {
  id: string;
  symbol: string;
  side: string;
  order_type: string;
  quantity: number;
  entry_price: number;
  exit_price: number | null;
  stop_loss: number;
  take_profit: number;
  profit_loss: number | null;
  profit_loss_percent: number | null;
  status: string;
  executed_at: string;
  closed_at: string | null;
  strategy_name: string | null;
}

export const useTrades = () => {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTrades = async () => {
    try {
      setLoading(true);
      const { data, error: queryError } = await supabase
        .from('trades')
        .select('*')
        .order('executed_at', { ascending: false })
        .limit(50);

      if (queryError) throw queryError;
      setTrades(data || []);
    } catch (err) {
      console.error('Error fetching trades:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch trades');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrades();
    const interval = setInterval(fetchTrades, 10000);

    return () => clearInterval(interval);
  }, []);

  return { trades, loading, error, refetch: fetchTrades };
};