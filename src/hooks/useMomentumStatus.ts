import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface MomentumData {
  symbol: string;
  momentum: {
    confirms: boolean;
    building: boolean;
    consecutive15mBullish: number;
    consecutive15mBearish: number;
    consecutive30mBullish: number;
    consecutive30mBearish: number;
    macdHistogram: number;
  };
  higherTimeframeFilter: {
    trend4h: string;
    trend1h: string;
    aligned: boolean;
  };
  multiTimeframe: {
    trend15m: string;
    trend30m: string;
  };
  trend: string;
  loading?: boolean;
  error?: string;
}

export const useMomentumStatus = (refreshInterval: number = 60000) => {
  const [momentumData, setMomentumData] = useState<MomentumData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMomentumForSymbols = async () => {
    try {
      setLoading(true);

      // Get active trading symbols
      const { data: symbols, error: symbolsError } = await supabase
        .from('trading_symbols_config')
        .select('symbol')
        .eq('is_active', true);

      if (symbolsError) throw symbolsError;
      if (!symbols || symbols.length === 0) {
        setMomentumData([]);
        return;
      }

      // Fetch trend data for each symbol in parallel
      const momentumPromises = symbols.map(async ({ symbol }) => {
        try {
          const { data, error } = await supabase.functions.invoke('calculate-trend', {
            body: { symbol }
          });

          if (error) throw error;

          return {
            symbol,
            momentum: data.momentum,
            higherTimeframeFilter: data.higherTimeframeFilter,
            multiTimeframe: data.multiTimeframe,
            trend: data.trend,
          } as MomentumData;
        } catch (err) {
          return {
            symbol,
            loading: false,
            error: err instanceof Error ? err.message : 'Failed to fetch',
          } as MomentumData;
        }
      });

      const results = await Promise.all(momentumPromises);
      setMomentumData(results);
    } catch (err) {
      console.error('Error fetching momentum status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMomentumForSymbols();
    const interval = setInterval(fetchMomentumForSymbols, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval]);

  return { momentumData, loading, refetch: fetchMomentumForSymbols };
};
