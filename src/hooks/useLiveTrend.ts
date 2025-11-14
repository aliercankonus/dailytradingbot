import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface TrendData {
  symbol: string;
  currentPrice: number;
  trend: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  indicators: {
    ema12: number;
    ema26: number;
    emaSignal: string;
    rsi: number;
    rsiSignal: string;
    macd: number;
    macdSignal: number;
    macdHistogram: number;
    macdTrend: string;
  };
  timestamp: string;
}

export const useLiveTrend = (symbol: string, refreshInterval: number = 60000) => {
  const [trendData, setTrendData] = useState<TrendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTrend = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: functionError } = await supabase.functions.invoke('calculate-trend', {
        body: { symbol }
      });

      if (functionError) throw functionError;
      
      setTrendData(data);
    } catch (err) {
      console.error('Error fetching trend:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch trend');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!symbol) return;

    fetchTrend();
    const interval = setInterval(fetchTrend, refreshInterval);

    return () => clearInterval(interval);
  }, [symbol, refreshInterval]);

  return { trendData, loading, error, refetch: fetchTrend };
};
