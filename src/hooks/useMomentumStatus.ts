import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface MomentumData {
  symbol: string;
  momentum: {
    confirms: boolean;
    building: boolean;
    state: "none" | "mixed" | "confirmed" | "building";  // Added "building" state
    lastCloseAlignsWithTrend: boolean;
    hasDivergence: boolean;
    macdHistogram: number;
    macdExpanding: boolean;
    macdDirectionAligned: boolean;
    adx: number;
    adxRising?: boolean;  // NEW: ADX direction for fake breakout detection
    fakeBreakoutRisk?: boolean;  // NEW: MACD expanding + ADX falling = warning
    genuineMomentum?: boolean;   // NEW: MACD expanding + ADX rising = real momentum
    volumeConfirms?: boolean;
    volumeBoost?: number;
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

const fetchMomentumForSymbols = async (): Promise<MomentumData[]> => {
  // Get active trading symbols
  const { data: symbols, error: symbolsError } = await supabase
    .from('trading_symbols_config')
    .select('symbol')
    .eq('is_active', true);

  if (symbolsError) throw symbolsError;
  if (!symbols || symbols.length === 0) return [];

  // Fetch trend data for each symbol in parallel
  const momentumPromises = symbols.map(async ({ symbol }) => {
    try {
      const { data, error } = await supabase.functions.invoke('calculate-trend', {
        body: { symbol }
      });

      if (error) throw error;

      // Map from calculate-trend response structure to MomentumData
      const timeframes = data.timeframes || {};
      const volatility = data.volatility || {};
      
      return {
        symbol,
        momentum: {
          confirms: data.momentum?.confirms ?? false,
          // "building" state from calculate-trend indicates aligned trends with partial confirmation
          building: data.momentum?.state === "building",
          state: data.momentum?.state ?? 'none',
          lastCloseAlignsWithTrend: data.momentum?.lastCloseAlignsWithTrend ?? false,
          hasDivergence: data.momentum?.hasDivergence ?? false,
          macdHistogram: timeframes['1h']?.indicators?.macd?.histogram ?? 0,
          macdExpanding: data.momentum?.macdExpanding ?? false,
          macdDirectionAligned: data.momentum?.macdStrong || data.momentum?.macdExpanding,
          adx: volatility.adx ?? 0,
          adxRising: data.momentum?.adxRising,
          fakeBreakoutRisk: data.momentum?.fakeBreakoutRisk,
          genuineMomentum: data.momentum?.genuineMomentum,
          volumeConfirms: data.momentum?.volumeConfirms ?? false,
          volumeBoost: data.volume?.['1h']?.ratio,
        },
        higherTimeframeFilter: {
          trend4h: timeframes['4h']?.trend ?? 'unknown',
          trend1h: timeframes['1h']?.trend ?? 'unknown',
          aligned: data.isAligned ?? false,
        },
        multiTimeframe: {
          trend15m: timeframes['15m']?.trend ?? 'unknown',
          trend30m: timeframes['30m']?.trend ?? 'unknown',
        },
        trend: data.primaryTrend ?? 'unknown',
      } as MomentumData;
    } catch (err) {
      return {
        symbol,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to fetch',
      } as MomentumData;
    }
  });

  return await Promise.all(momentumPromises);
};

export const MOMENTUM_STATUS_QUERY_KEY = ['momentum-status'];

export const useMomentumStatus = () => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: MOMENTUM_STATUS_QUERY_KEY,
    queryFn: fetchMomentumForSymbols,
    staleTime: 60000, // Cache data for 60 seconds
    gcTime: 300000, // Keep in cache for 5 minutes
    refetchOnWindowFocus: false,
  });

  return { 
    momentumData: data || [], 
    loading: isLoading, 
    error: error?.message || null, 
    refetch 
  };
};
