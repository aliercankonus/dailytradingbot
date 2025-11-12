import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface MarketData {
  symbol: string;
  lastPrice: string;
  priceChange: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
}

export const useMarketData = (symbols?: string[]) => {
  const [data, setData] = useState<MarketData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMarketData = async () => {
      try {
        setLoading(true);
        const { data: functionData, error: functionError } = await supabase.functions.invoke('market-data', {
          body: { symbols }
        });

        if (functionError) throw functionError;

        if (functionData?.success && functionData?.data) {
          setData(functionData.data);
        }
      } catch (err) {
        console.error('Error fetching market data:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch market data');
      } finally {
        setLoading(false);
      }
    };

    // Get interval from localStorage or use default
    const getRefreshInterval = () => {
      const saved = localStorage.getItem('market_data_interval');
      return saved ? parseInt(saved) : 10000; // Default 10 seconds
    };

    fetchMarketData();
    const interval = setInterval(fetchMarketData, getRefreshInterval());

    return () => clearInterval(interval);
  }, [symbols]);

  return { data, loading, error };
};
