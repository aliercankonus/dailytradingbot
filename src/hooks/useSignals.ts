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
  strategy_name?: string;
}

export const useSignals = () => {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSignals = async () => {
      try {
        setLoading(true);
        
        // Calculate timestamp for 1 minute ago
        const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
        
        // Get all active positions to filter out used signals
        const { data: activePositions } = await supabase
          .from('positions')
          .select('signal_id')
          .eq('status', 'active');
        
        const usedSignalIds = new Set(activePositions?.map(p => p.signal_id).filter(Boolean));
        
        const { data, error: queryError } = await supabase
          .from('trading_signals')
          .select('*')
          .gte('created_at', oneMinuteAgo)
          .order('created_at', { ascending: false });

        if (queryError) throw queryError;
        
        // Filter out signals that already have open trades
        const availableSignals = (data || []).filter(signal => !usedSignalIds.has(signal.id));
        setSignals(availableSignals);
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