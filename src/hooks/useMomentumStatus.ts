import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface MomentumData {
  symbol: string;
  momentum: {
    confirms: boolean;
    building: boolean;
    state: "none" | "mixed" | "confirmed" | "building" | "exhausted";  // Added "exhausted" state
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

  // Fetch trend data sequentially to avoid cold-start failures
  // (8 parallel calls to a cold edge function all fail; sequential lets the first warm it up)
  const results: MomentumData[] = [];
  for (const { symbol } of symbols) {
    try {
      const { data, error } = await supabase.functions.invoke('calculate-trend', {
        body: { symbol }
      });

      if (error) throw error;

      const timeframes = data.timeframes || {};
      const volatility = data.volatility || {};

      const getTfTrend = (tf: string) =>
        timeframes?.[tf]?.trend ?? timeframes?.[tf]?.indicators?.emaSignal ?? "unknown";

      const toNumber = (value: unknown, fallback = 0) => {
        const n = typeof value === "string" ? parseFloat(value) : typeof value === "number" ? value : Number(value);
        return Number.isFinite(n) ? n : fallback;
      };

      const macdHistogramRaw =
        data.momentum?.macdHistogram ??
        timeframes?.["1h"]?.indicators?.macdHistogram ??
        timeframes?.["1h"]?.indicators?.macd?.histogram ??
        0;

      results.push({
        symbol,
        momentum: {
          confirms: data.momentum?.confirms ?? false,
          building: data.momentum?.state === "building",
          state: data.momentum?.state ?? "none",
          lastCloseAlignsWithTrend: data.momentum?.lastCloseAlignsWithTrend ?? false,
          hasDivergence: data.momentum?.hasDivergence ?? false,
          macdHistogram: toNumber(macdHistogramRaw, 0),
          macdExpanding: data.momentum?.macdExpanding ?? false,
          macdDirectionAligned:
            data.momentum?.macdDirectionAligned ??
            Boolean(data.momentum?.macdStrong || data.momentum?.macdExpanding),
          adx: volatility.adx ?? 0,
          adxRising: data.momentum?.adxRising,
          fakeBreakoutRisk: data.momentum?.fakeBreakoutRisk,
          genuineMomentum: data.momentum?.genuineMomentum,
          volumeConfirms: data.momentum?.volumeConfirms ?? false,
          volumeBoost: data.volume?.["1h"]?.ratio,
        },
        higherTimeframeFilter: {
          trend4h: getTfTrend("4h"),
          trend1h: getTfTrend("1h"),
          aligned: data.isAligned ?? false,
        },
        multiTimeframe: {
          trend15m: getTfTrend("15m"),
          trend30m: getTfTrend("30m"),
        },
        trend: data.primaryTrend ?? "unknown",
      });
    } catch (err) {
      results.push({
        symbol,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to fetch',
      } as MomentumData);
    }
  }

  return results;
};

export const MOMENTUM_STATUS_QUERY_KEY = ['momentum-status'];

export const useMomentumStatus = () => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: MOMENTUM_STATUS_QUERY_KEY,
    queryFn: fetchMomentumForSymbols,
    staleTime: 30000, // Cache data for 30 seconds
    gcTime: 300000, // Keep in cache for 5 minutes
    refetchOnWindowFocus: false,
    refetchInterval: 60000, // Auto-refresh every 60 seconds (aligned with signal rejections)
  });

  return { 
    momentumData: data || [], 
    loading: isLoading, 
    error: error?.message || null, 
    refetch 
  };
};
