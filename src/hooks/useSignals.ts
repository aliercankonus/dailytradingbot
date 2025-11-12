import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Signal {
  id: string;
  symbol: string;
  signal_type: string;
  trend: string;
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  risk_reward_ratio: number;
  confidence_score: number;
  reason: string;
  created_at: string;
  expires_at: string;
  indicators: any;
}

export const useSignals = () => {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSignals = async () => {
      try {
        setLoading(true);
        const { data, error: queryError } = await supabase
          .from('trading_signals')
          .select('*')
          .gte('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false });

        if (queryError) throw queryError;
        setSignals(data || []);
      } catch (err) {
        console.error('Error fetching signals:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch signals');
      } finally {
        setLoading(false);
      }
    };

    fetchSignals();
    const interval = setInterval(fetchSignals, 30000);

    return () => clearInterval(interval);
  }, []);

  return { signals, loading, error };
};